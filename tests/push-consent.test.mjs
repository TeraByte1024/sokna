import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function loadSource(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const loadedModule = { exports: {} };
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === "@/lib/push-consent") return loadSource("lib/push-consent.ts", mocks);
    assert.fail("Unexpected dependency: " + name);
  };
  vm.runInThisContext("(function(require,module,exports,console){" + source + "\n})", { filename })(
    localRequire, loadedModule, loadedModule.exports, { error() {} },
  );
  return loadedModule.exports;
}

const { pushConsentFields, savePushConsent } = loadSource("lib/push-consent.ts");
const invalidChoices = [undefined, null, "false", "true", 0, 1, {}, []];

function fixture({ missing = false, saveError = null } = {}) {
  const queries = [];
  const invalidations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "current-member" } }, error: null }) },
    from(table) {
      const query = { table, operation: null, payload: null, filters: [], columns: null, single: false };
      queries.push(query);
      const builder = {
        update(payload) { query.operation = "update"; query.payload = payload; return builder; },
        upsert(payload) { query.operation = "upsert"; query.payload = payload; return builder; },
        eq(column, value) { query.filters.push([column, value]); return builder; },
        select(columns) { query.columns = columns; return builder; },
        async single() {
          query.single = true;
          const error = saveError ?? (missing ? { code: "PGRST116", message: "No visible row" } : null);
          return { data: error ? null : { id: "current-member" }, error };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: missing ? [] : [{ id: "current-member" }], error: saveError }).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const action = loadSource("app/profile/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "next/cache": { revalidatePath: (...args) => invalidations.push(args) },
  }).updateMyProfileAction;
  return { client, action, queries, invalidations };
}

test("consent fields preserve explicit boolean choices and leave timestamps to the database", () => {
  for (const choice of [false, true]) {
    assert.deepEqual(pushConsentFields(choice), { marketing_opt_in: choice });
  }
  for (const choice of invalidChoices) {
    assert.throws(() => pushConsentFields(choice), /수신 동의/);
  }
});

test("omitted or non-boolean consent cannot begin a write or revoke devices", async () => {
  for (const choice of invalidChoices) {
    const f = fixture();
    await assert.rejects(savePushConsent(f.client, "current-member", choice), /수신 동의/);
    assert.deepEqual(f.queries, []);
  }
});

test("a standalone consent save checks the authenticated member's affected row", async () => {
  for (const choice of [false, true]) {
    const f = fixture();
    const result = await savePushConsent(f.client, "current-member", choice);
    assert.equal(result.error, null);
    assert.deepEqual(f.queries, [{
      table: "users", operation: "update", payload: { marketing_opt_in: choice },
      filters: [["id", "current-member"]], columns: "id", single: true,
    }]);
  }
});

test("profile and consent are saved together without a second device deletion request", async () => {
  for (const choice of [false, true]) {
    const f = fixture();
    const result = await f.action(" New name ", 42, " Guitar ", choice);
    assert.equal(result.ok, true);
    assert.deepEqual(f.queries, [
      {
        table: "users", operation: "update",
        payload: { name: "New name", generation: 42, part: "Guitar", marketing_opt_in: choice },
        filters: [["id", "current-member"]], columns: "id", single: true,
      },
      {
        table: "admins", operation: "update", payload: { name: "New name" },
        filters: [["id", "current-member"]], columns: null, single: false,
      },
    ]);
    assert.ok(f.invalidations.some(([url, type]) => url === "/" && type === "layout"));
  }
});

test("profile saves reject missing or malformed consent without silently opting out", async () => {
  for (const choice of invalidChoices) {
    const f = fixture();
    assert.equal((await f.action("Member", 42, "Guitar", choice)).ok, false);
    assert.deepEqual(f.queries, []);
    assert.deepEqual(f.invalidations, []);
  }
  const omitted = fixture();
  assert.equal((await omitted.action("Member", 42, "Guitar")).ok, false);
  assert.deepEqual(omitted.queries, []);
});

test("missing or RLS-hidden profile rows cannot be reported as a successful consent save", async () => {
  const f = fixture({ missing: true });
  const result = await f.action("Member", 42, "Guitar", false);
  assert.equal(result.ok, false);
  assert.equal(result.error, "No visible row");
  assert.equal(f.queries.length, 1);
  assert.equal(f.queries[0].single, true);
  assert.deepEqual(f.invalidations, []);
});

test("a failed transactional consent save stops before admin updates and cache invalidation", async () => {
  const f = fixture({ saveError: { message: "revocation transaction failed" } });
  assert.deepEqual(await f.action("Member", 42, null, false), {
    ok: false, error: "revocation transaction failed",
  });
  assert.equal(f.queries.length, 1);
  assert.equal(f.queries[0].table, "users");
  assert.deepEqual(f.invalidations, []);
});
