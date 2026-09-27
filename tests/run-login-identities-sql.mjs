import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const modulePath=process.env.PGLITE_MODULE_PATH;
const {PGlite}=await import(modulePath?pathToFileURL(path.resolve(modulePath)).href:"@electric-sql/pglite");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=(file)=>readFile(path.join(root,file),"utf8");
const migration=await read("supabase/migrations/20260927030000_manage_login_identities.sql");
const admin="00000000-0000-0000-0000-000000000001";
const member="00000000-0000-0000-0000-000000000002";
const other="00000000-0000-0000-0000-000000000003";
const setup=`
CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE ROLE supabase_auth_admin;
CREATE SCHEMA auth;
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('test.user_id',true),'')::uuid $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql AS $$ SELECT jsonb_build_object('email',current_setting('test.email',true)) $$;
CREATE TABLE auth.users(id uuid PRIMARY KEY,email text UNIQUE,deleted_at timestamptz,email_confirmed_at timestamptz DEFAULT now());
CREATE TABLE auth.identities(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid NOT NULL REFERENCES auth.users ON DELETE CASCADE,provider text NOT NULL,identity_data jsonb DEFAULT '{}');
CREATE TABLE public.users(id uuid PRIMARY KEY,email text,name text,status text DEFAULT 'approved',approved_at timestamptz DEFAULT now());
CREATE TABLE public.admins(id uuid PRIMARY KEY,email text NOT NULL UNIQUE,name text);
CREATE TABLE public.performers(id bigint PRIMARY KEY,user_id uuid,name text,photo_url text);
CREATE TABLE public.profiles(user_id uuid);
CREATE TABLE public.notifications(user_id uuid);
GRANT USAGE ON SCHEMA auth,public TO anon,authenticated,service_role,supabase_auth_admin;
GRANT ALL ON auth.users,auth.identities TO supabase_auth_admin;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
INSERT INTO auth.users(id,email) VALUES ('${admin}','admin@example.test'),('${member}','member@example.test'),('${other}','other@example.test');
INSERT INTO public.users(id,email,name) SELECT id,email,'Preserved member' FROM auth.users;
INSERT INTO public.admins VALUES ('${admin}','admin@example.test','Preserved admin');
INSERT INTO auth.identities(user_id,provider,identity_data) VALUES
('${admin}','google','{"email":"admin@example.test","email_verified":true}'),
('${admin}','google','{"email":"secondary@example.test","email_verified":true}'),
('${member}','google','{"email":"member@example.test","email_verified":true}'),
('${other}','email','{"email":"other@example.test","email_verified":true}');
`;
const db=new PGlite();let checks=0;
async function check(name,fn){await fn();checks++;console.log("PASS "+name)}
async function scalar(sql,params=[]){return Object.values((await db.query(sql,params)).rows[0])[0]}
try {
 await db.exec(setup);
 await db.exec(await read("supabase/migrations/20260912143153_fix_is_admin_function.sql"));
 const approval=await read("supabase/migrations/20260927010000_require_approved_gig_membership.sql");
 await db.exec(approval.slice(0,approval.indexOf("ALTER POLICY "))+"\nCOMMIT;");
 await db.exec(migration);
 await check("internal triggers cannot be invoked by API roles",async()=>{
  for(const role of ["anon","authenticated"])for(const fn of ["sync_auth_user_email()","protect_last_google_identity()"])
   assert.equal(await scalar("SELECT has_function_privilege($1,$2,'EXECUTE')",[role,"public."+fn]),false);
 });
 await check("Auth role promotes email atomically while preserving membership and administrator ID",async()=>{
  await db.exec(`SET ROLE supabase_auth_admin; BEGIN;
  DELETE FROM auth.identities WHERE user_id='${admin}' AND identity_data->>'email'='admin@example.test';
  UPDATE auth.users SET email='secondary@example.test' WHERE id='${admin}'; COMMIT; RESET ROLE;`);
  const result=(await db.query("SELECT u.email,u.name,u.status,u.approved_at IS NOT NULL AS approved,a.email AS admin_email,a.id::text AS admin_id FROM public.users u JOIN public.admins a USING(id) WHERE u.id=$1",[admin])).rows[0];
  assert.deepEqual(result,{email:"secondary@example.test",name:"Preserved member",status:"approved",approved:true,admin_email:"secondary@example.test",admin_id:admin});
 });
 await check("administrator ID survives stale JWT email; other account emails grant nothing",async()=>{
  await db.query("SELECT set_config('test.user_id',$1,false),set_config('test.email',$2,false)",[admin,"admin@example.test"]);
  assert.equal(await scalar("SELECT public.is_admin()"),true);
  await db.query("SELECT set_config('test.user_id',$1,false),set_config('test.email',$2,false)",[other,"admin@example.test"]);
  assert.equal(await scalar("SELECT public.is_admin()"),false);
  await db.query("SELECT set_config('test.email',$1,false)",["secondary@example.test"]);
  assert.equal(await scalar("SELECT public.is_admin()"),false);
 });
 await check("last usable Google remains despite an unconfirmed email identity",async()=>{
  await db.exec(`INSERT INTO auth.identities(user_id,provider,identity_data) VALUES ('${admin}','email','{"email":"unconfirmed@example.test","email_verified":false}')`);
  await assert.rejects(db.exec(`DELETE FROM auth.identities WHERE user_id='${admin}' AND provider='google'`),/At least one login identity/);
  assert.equal(await scalar(`SELECT count(*)::int FROM auth.identities WHERE user_id='${admin}' AND provider='google'`),1);
  await db.exec(`DELETE FROM auth.identities WHERE user_id='${admin}' AND provider='email'`);
 });
 await check("email collision rolls back unlink and all email copies",async()=>{
  await db.exec(`INSERT INTO auth.identities(user_id,provider,identity_data) VALUES ('${admin}','google','{"email":"conflict@example.test"}');
    INSERT INTO public.admins VALUES ('${other}','conflict@example.test','Conflicting legacy grant');`);
  await assert.rejects(db.exec(`BEGIN; DELETE FROM auth.identities WHERE user_id='${admin}' AND identity_data->>'email'='secondary@example.test';
    UPDATE auth.users SET email='conflict@example.test' WHERE id='${admin}'; COMMIT;`),/unique constraint/);
  await db.exec("ROLLBACK;");
  assert.equal(await scalar(`SELECT count(*)::int FROM auth.identities WHERE user_id='${admin}'`),2);
  for(const table of ["auth.users","public.users","public.admins"])assert.equal(await scalar(`SELECT email FROM ${table} WHERE id='${admin}'`),"secondary@example.test");
  await db.exec(`DELETE FROM public.admins WHERE id='${other}'`);
 });
 await check("automatic Google linking removes unconfirmed identity after replacement creation",async()=>{
  await db.exec(`BEGIN;
    INSERT INTO auth.identities(user_id,provider,identity_data) VALUES ('${member}','google','{"email":"replacement@example.test","email_verified":true}');
    DELETE FROM auth.identities WHERE user_id='${member}' AND identity_data->>'email'='member@example.test'; COMMIT;`);
  assert.equal(await scalar(`SELECT identity_data->>'email' FROM auth.identities WHERE user_id='${member}'`),"replacement@example.test");
 });
 await check("soft-deleted accounts may clean up their final Google identity",async()=>{
  await db.exec(`UPDATE auth.users SET deleted_at=now() WHERE id='${member}'; DELETE FROM auth.identities WHERE user_id='${member}'`);
  assert.equal(await scalar(`SELECT count(*)::int FROM auth.identities WHERE user_id='${member}'`),0);
 });
 await check("withdrawal RPC cascades last identity and preserves shared records",async()=>{
  await db.exec(await read("supabase/migrations/20260926080436_add_account_withdrawal.sql"));
  await db.exec(`INSERT INTO auth.identities(user_id,provider,identity_data) VALUES ('${member}','google','{"email":"replacement@example.test"}');
   UPDATE auth.users SET deleted_at=NULL WHERE id='${member}'; INSERT INTO public.performers VALUES (1,'${member}','Before','photo');`);
  await db.query("SELECT set_config('test.user_id',$1,false)",[member]);
  assert.equal(await scalar("SELECT public.delete_my_account('탈퇴')"),true);
  assert.equal(await scalar(`SELECT count(*)::int FROM auth.identities WHERE user_id='${member}'`),0);
  assert.equal(await scalar(`SELECT count(*)::int FROM auth.users WHERE id='${member}'`),0);
  assert.equal(await scalar("SELECT name FROM public.performers WHERE id=1"),"탈퇴 회원");
  assert.equal(await scalar("SELECT count(*)::int FROM public.admins"),1);
 });
 console.log("Login identity SQL checks passed: "+checks+". Concurrent-session scheduling is not exercised by single-connection PGlite.");
} finally {await db.close()}
const preflight=new PGlite();
try {
 await preflight.exec(setup);
 await preflight.exec(`UPDATE public.admins SET email='legacy@example.test' WHERE id='${admin}'`);
 await assert.rejects(preflight.exec(migration),/Administrator IDs and emails must match/);
 await preflight.exec("ROLLBACK;");
 assert.equal((await preflight.query("SELECT count(*)::int AS count FROM pg_trigger WHERE tgname='auth_users_sync_member_email'")).rows[0].count,0);
 console.log("PASS legacy admin preflight aborts without installing changes");
} finally {await preflight.close()}
