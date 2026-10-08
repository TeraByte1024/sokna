import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
function load(file, mocks) {
  const js = ts.transpileModule(readFileSync(path.join(root,file),"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS }}).outputText;
  const mod = { exports: {} };
  vm.runInThisContext("(function(require,module,exports){" + js + "\n})")((name) => {
    assert.ok(Object.hasOwn(mocks,name), name); return mocks[name];
  },mod,mod.exports);
  return mod.exports;
}
function fixture({user={id:"admin",email:"new@example.test"},authError=null,exists=true,target={id:"admin",email:"old@example.test"}}={}) {
  const calls=[];
  const client={
    auth:{getUser:async()=>({data:{user},error:authError})},
    from(table) {
      const q={
        select(){return q},
        eq(key,value){calls.push([table,key,value]);return q},
        maybeSingle:async()=>({data:exists?{id:"admin"}:null,error:null}),
        single:async()=>({data:table==="users"?{id:"member",email:"changed@example.test",name:"Member"}:target}),
        delete(){calls.push(["delete"]);return q},
        insert(){calls.push(["insert"]);return Promise.resolve({error:null})},
        then(resolve){return Promise.resolve({count:2,error:null}).then(resolve)},
      }; return q;
    },
  };
  const shared={"@/lib/supabase/server":{createClient:async()=>client}};
  const authData=load("lib/auth-server-data.ts",{...shared,react:{cache:fn=>fn}});
  const {getIsAdmin}=load("lib/auth-admin.ts",{
    ...shared,react:{cache:fn=>fn},"@/lib/auth-server-data":authData,"@/lib/supabase/admin":{SUPABASE_ADMINS_TABLE:"admins"},
  });
  const actions=load("app/admin/members/actions.ts",{
    ...shared,"next/cache":{revalidatePath(){}},
    "@/lib/auth-admin":{getIsAdmin:async()=>true},
    "@/lib/member-application":{getPendingMemberApplications(){}},
    "@/lib/push-notifications":{processPendingPushNotifications(){}},
  });
  return {getIsAdmin,actions,calls};
}
test("admin authorization follows verified ID even after email change or without email",async()=>{
  const old=process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.example";
  try{
    for(const email of ["new@example.test","old@example.test",undefined]){
      const f=fixture({user:{id:"admin",email}});
      assert.equal(await f.getIsAdmin(),true);
      assert.deepEqual(f.calls,[["admins","id","admin"]]);
    }
  } finally {if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old}
});
test("former administrator email on another ID does not authorize; invalid auth fails closed",async()=>{
  const old=process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://project.example";
  try{
    const f=fixture({user:{id:"other",email:"old@example.test"},exists:false});
    assert.equal(await f.getIsAdmin(),false);
    assert.deepEqual(f.calls,[["admins","id","other"]]);
    for(const options of [{user:null},{authError:{message:"expired"}}]){
      const invalid=fixture(options); assert.equal(await invalid.getIsAdmin(),false);assert.deepEqual(invalid.calls,[]);
    }
  } finally {if(old===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=old}
});
test("self-revoke uses stable account ID despite stale email snapshot",async()=>{
  const f=fixture();const result=await f.actions.revokeAdminAction("admin");
  assert.equal(result.ok,false);assert.match(result.error,/본인/);
  assert.equal(f.calls.some(([name])=>name==="delete"),false);
});
test("duplicate admin grant checks stable account ID",async()=>{
  const f=fixture();const result=await f.actions.grantAdminAction("member");
  assert.equal(result.ok,false);assert.match(result.error,/이미 관리자/);
  assert.ok(f.calls.some(([table,key,value])=>table==="admins"&&key==="id"&&value==="member"));
  assert.equal(f.calls.some(([name])=>name==="insert"),false);
});
