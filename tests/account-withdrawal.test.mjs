import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "app/profile/actions.ts");
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;

function fixture({
  user = { id: "current-member" },
  authError = null,
  authException = null,
  clientException = null,
  rpcData = true,
  rpcError = null,
  rpcException = null,
  signOutError = null,
  signOutException = null,
  revalidateException = null,
} = {}) {
  const operations = [];
  const logs = [];
  const client = {
    auth: {
      async getUser() {
        operations.push(["getUser"]);
        if (authException) throw authException;
        return { data: { user }, error: authError };
      },
      async signOut(...args) {
        operations.push(["signOut", ...args]);
        if (signOutException) throw signOutException;
        return { error: signOutError };
      },
    },
    async rpc(...args) {
      operations.push(["rpc", ...args]);
      if (rpcException) throw rpcException;
      return { data: rpcData, error: rpcError };
    },
  };
  const mocks = {
    "@/lib/supabase/server": {
      async createClient() {
        operations.push(["createClient"]);
        if (clientException) throw clientException;
        return client;
      },
    },
    "next/cache": {
      revalidatePath(...args) {
        operations.push(["revalidatePath", ...args]);
        if (revalidateException) throw revalidateException;
      },
    },
  };
  const loadedModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports,console){${source}\n})`, { filename })(
    (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    loadedModule,
    loadedModule.exports,
    { error: (...args) => logs.push(args) },
  );
  return { action: loadedModule.exports.deleteMyAccountAction, operations, logs };
}

function assertNoCleanup(f) {
  assert.equal(f.operations.some(([name]) => name === "signOut" || name === "revalidatePath"), false);
}

test("withdrawal requires the exact confirmation before accessing the session or RPC", async () => {
  for (const confirmation of ["", "탈퇴 ", " 탈퇴", "삭제", null, undefined]) {
    const f = fixture();
    const result = await f.action(confirmation);
    assert.equal(result.ok, false);
    assert.match(result.error, /확인 문구/);
    assert.deepEqual(f.operations, []);
  }
});

test("missing users and authentication errors cannot call the withdrawal RPC", async () => {
  for (const options of [{ user: null }, { authError: { message: "expired session" } }]) {
    const f = fixture(options);
    const result = await f.action("탈퇴");
    assert.equal(result.ok, false);
    assert.match(result.error, /다시 로그인/);
    assert.deepEqual(f.operations, [["createClient"], ["getUser"]]);
  }
});

test("session client and authentication exceptions return failure without deleting data", async () => {
  for (const options of [
    { clientException: new Error("client unavailable") },
    { authException: new Error("authentication unavailable") },
  ]) {
    const f = fixture(options);
    const result = await f.action("탈퇴");
    assert.equal(result.ok, false);
    assert.match(result.error, /회원 탈퇴에 실패/);
    assert.equal(f.operations.some(([name]) => name === "rpc"), false);
    assertNoCleanup(f);
  }
});

test("the last administrator receives an actionable error and retains the session", async () => {
  const f = fixture({ rpcError: { code: "P0001", message: "last administrator" } });
  const result = await f.action("탈퇴");
  assert.equal(result.ok, false);
  assert.match(result.error, /마지막 관리자/);
  assert.match(result.error, /다른 관리자를 지정/);
  assertNoCleanup(f);
});

test("database errors return a generic failure without exposing internal details", async () => {
  const f = fixture({ rpcError: { code: "XX000", message: "private database details" } });
  const result = await f.action("탈퇴");
  assert.equal(result.ok, false);
  assert.match(result.error, /회원 탈퇴에 실패/);
  assert.doesNotMatch(result.error, /private database details/);
  assertNoCleanup(f);
});

test("only a literal successful RPC result allows session cleanup", async () => {
  for (const rpcData of [false, null, "true", 1]) {
    const f = fixture({ rpcData });
    const result = await f.action("탈퇴");
    assert.equal(result.ok, false);
    assert.match(result.error, /회원 탈퇴에 실패/);
    assertNoCleanup(f);
  }
});

test("withdrawal uses the authenticated session without passing a target ID, then cleans up locally", async () => {
  const f = fixture();
  const result = await f.action("탈퇴", "another-member");
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(f.operations, [
    ["createClient"],
    ["getUser"],
    ["rpc", "delete_my_account", { p_confirmation: "탈퇴" }],
    ["signOut", { scope: "local" }],
    ["revalidatePath", "/", "layout"],
  ]);
  assert.deepEqual(f.logs, []);
});

test("RPC exceptions return failure without ending the session or invalidating caches", async () => {
  const f = fixture({ rpcException: new Error("connection lost") });
  const result = await f.action("탈퇴");
  assert.equal(result.ok, false);
  assert.match(result.error, /회원 탈퇴에 실패/);
  assertNoCleanup(f);
});

test("sign-out errors and exceptions cannot turn completed deletion into failure", async () => {
  for (const options of [
    { signOutError: { message: "session already removed" } },
    { signOutException: new Error("cookie cleanup failed") },
  ]) {
    const f = fixture(options);
    assert.deepEqual(await f.action("탈퇴"), { ok: true });
    assert.equal(f.operations.filter(([name]) => name === "rpc").length, 1);
    assert.deepEqual(f.operations.at(-1), ["revalidatePath", "/", "layout"]);
    assert.equal(f.logs.length, 1);
  }
});

test("cache invalidation exceptions cannot turn completed deletion into failure", async () => {
  const f = fixture({ revalidateException: new Error("cache unavailable") });
  assert.deepEqual(await f.action("탈퇴"), { ok: true });
  assert.equal(f.operations.filter(([name]) => name === "rpc").length, 1);
  assert.ok(f.operations.some(([name]) => name === "signOut"));
  assert.equal(f.logs.length, 1);
});

test("deletion stays successful when both post-deletion cleanup steps fail", async () => {
  const f = fixture({
    signOutException: new Error("cookie cleanup failed"),
    revalidateException: new Error("cache unavailable"),
  });
  assert.deepEqual(await f.action("탈퇴"), { ok: true });
  assert.equal(f.operations.filter(([name]) => name === "rpc").length, 1);
  assert.deepEqual(f.operations.at(-1), ["revalidatePath", "/", "layout"]);
  assert.equal(f.logs.length, 2);
});
