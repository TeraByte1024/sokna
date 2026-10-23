import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

function fixture({ member = null, metadata = {}, queryError = null, saveError = null } = {}) {
  const writes = [], memberWrites = [];
  let stored = { ...metadata };
  const account = { id: "verified-account", app_metadata: metadata };
  const client = { from(table) {
    assert.equal(table, "users");
    return { select: () => ({ eq: (_key, id) => {
      assert.equal(id, account.id);
      return { maybeSingle: async () => ({ data: member, error: queryError }) };
    } }) };
  } };
  const helper = loadTs("lib/account-marketing-consent.ts", {
    "server-only": {},
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/supabase/service": { createServiceClient: () => ({ auth: { admin: {
      getUserById: async (id) => { assert.equal(id, account.id); return { data: { user: { app_metadata: stored } }, error: null }; },
      updateUserById: async (id, input) => {
        assert.equal(id, account.id); writes.push(input);
        if (!saveError) stored = { ...stored, ...input.app_metadata };
        return { error: saveError };
      },
    } } }) },
    "@/lib/push-consent": { savePushConsent: async (_client, id, choice) => {
      memberWrites.push({ id, choice }); return { error: saveError };
    } },
  });
  return { ...helper, account, writes, memberWrites, stored: () => stored };
}

test("audience marketing choices use server metadata without creating a member row", async () => {
  const f = fixture({ metadata: { provider: "google" } });
  assert.equal(await f.getAccountMarketingConsent(f.account), false);
  await f.saveAccountMarketingConsent(f.account, true);
  assert.equal(f.stored().marketing_opt_in, true);
  assert.equal(f.stored().provider, "google");
  const timestamp = f.stored().marketing_opted_in_at;
  assert.ok(Number.isFinite(Date.parse(timestamp)));
  await f.saveAccountMarketingConsent(f.account, true);
  assert.equal(f.stored().marketing_opted_in_at, timestamp);
  await f.saveAccountMarketingConsent(f.account, false);
  assert.equal(f.stored().marketing_opted_in_at, null);
  assert.equal(f.stored().marketing_opt_in, false);
  assert.deepEqual(f.memberWrites, []);
});

test("member consent stays on the existing transactional push preference path", async () => {
  const f = fixture({ member: { id: "verified-account", marketing_opt_in: true }, metadata: { marketing_opt_in: false } });
  assert.equal(await f.getAccountMarketingConsent(f.account), true);
  await f.saveAccountMarketingConsent(f.account, false);
  assert.deepEqual(f.memberWrites, [{ id: f.account.id, choice: false }]);
  assert.deepEqual(f.writes, []);
});

test("missing audience membership is valid, while lookup and preference failures propagate", async () => {
  const f = fixture({ metadata: { marketing_opt_in: true } });
  assert.equal(await f.getAccountMarketingConsent(f.account), true);
  await assert.rejects(f.saveAccountMarketingConsent(f.account, "true"));
  const broken = fixture({ queryError: new Error("lookup") });
  await assert.rejects(broken.getAccountMarketingConsent(broken.account), /lookup/);
  await assert.rejects(broken.saveAccountMarketingConsent(broken.account, true), /lookup/);
  const rejected = fixture({ saveError: new Error("save") });
  await assert.rejects(rejected.saveAccountMarketingConsent(rejected.account, true), /save/);
});
