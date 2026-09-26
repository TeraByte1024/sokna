import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(readFileSync(new URL("../lib/supabase/logout.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function fixture({ detachFails = false, detachThrows = false, signOutError = null, signOutThrows = false } = {}) {
  const calls = [];
  const loaded = { exports: {} };
  const mocks = {
    "@/lib/firebase/push-device": {
      async suspendPushDeviceForSignOut() {
        calls.push(["detach"]);
        if (detachThrows) throw new Error("temporarily unavailable");
        return { ok: !detachFails, error: detachFails ? "temporarily unavailable" : undefined };
      },
      resumePushDeviceAfterSignOutFailure() { calls.push(["resume"]); },
    },
    "@/lib/supabase/client": {
      createClient: () => ({ auth: { async signOut(options) {
        calls.push(["signOut", options]);
        if (signOutThrows) throw signOutError;
        return { error: signOutError };
      } } }),
    },
  };
  vm.runInThisContext(`(function(require,module,exports,console){${source}\n})`)(
    (name) => { assert.ok(Object.hasOwn(mocks, name)); return mocks[name]; },
    loaded, loaded.exports, { warn() {} },
  );
  return { logout: loaded.exports.signOutWithPushSession, calls };
}

test("logout clears this device's recipient binding before ending only its local session", async () => {
  const f = fixture();
  await f.logout();
  assert.deepEqual(f.calls, [["detach"], ["signOut", { scope: "local" }]]);
});

test("a binding service failure does not keep the previous user logged in", async () => {
  for (const options of [{ detachFails: true }, { detachThrows: true }]) {
    const f = fixture(options);
    await f.logout();
    assert.deepEqual(f.calls, [["detach"], ["signOut", { scope: "local" }]]);
  }
});

test("failed logout resumes device synchronization and reports the original error", async () => {
  const error = new Error("sign out failed");
  for (const signOutThrows of [false, true]) {
    const f = fixture({ signOutError: error, signOutThrows });
    await assert.rejects(f.logout, (received) => received === error);
    assert.deepEqual(f.calls, [["detach"], ["signOut", { scope: "local" }], ["resume"]]);
  }
});
