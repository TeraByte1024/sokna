import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = "lib/firebase/admin.ts";
const source = ts.transpileModule(readFileSync(path.join(root, filename), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const validEnv = {
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "private-test-project",
  FIREBASE_CLIENT_EMAIL: "private-test-email@example.invalid",
  FIREBASE_PRIVATE_KEY: "private-test-key-without-real-credentials",
};

function fixture(env = {}, existingApp = null) {
  const logs = [];
  const certificates = [];
  const initializations = [];
  const messagingApps = [];
  const apps = existingApp ? [existingApp] : [];
  const credential = {};
  const messaging = {};
  const dependencies = {
    "server-only": {},
    "firebase-admin/app": {
      getApps: () => apps,
      cert(value) { certificates.push(value); return credential; },
      initializeApp(options) {
        initializations.push(options);
        const app = {};
        apps.push(app);
        return app;
      },
    },
    "firebase-admin/messaging": { getMessaging(app) { messagingApps.push(app); return messaging; } },
  };
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports,process,console){${source}\n})`, { filename })(
    (name) => { assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency ${name}`); return dependencies[name]; },
    loaded, loaded.exports, { env }, { error: (...args) => logs.push(args) },
  );
  return { admin: loaded.exports, env, logs, certificates, initializations, messagingApps, messaging, credential, apps };
}

test("missing Firebase Admin variables report a stable retryable configuration code without values", () => {
  for (const missing of Object.keys(validEnv)) {
    const env = { ...validEnv };
    delete env[missing];
    const f = fixture(env);
    assert.throws(() => f.admin.getFirebaseAdminMessaging(), { code: "app/missing-configuration" });
    assert.deepEqual(f.logs, [["[push-delivery] Firebase Admin configuration missing", { code: "app/missing-configuration", missing: [missing] }]]);
    assert.equal(f.certificates.length, 0);
    assert.equal(f.initializations.length, 0);
    assert.equal(f.messagingApps.length, 0);
    for (const value of Object.values(validEnv)) assert.equal(JSON.stringify(f.logs).includes(value), false);
  }
});

test("blank Firebase Admin settings are reported by fixed variable names and recover after correction", () => {
  const env = Object.fromEntries(Object.keys(validEnv).map((name) => [name, " \t\n "]));
  const f = fixture(env);
  assert.throws(() => f.admin.getFirebaseAdminMessaging(), { code: "app/missing-configuration" });
  assert.deepEqual(f.logs[0][1], { code: "app/missing-configuration", missing: Object.keys(validEnv) });
  Object.assign(env, validEnv);
  assert.equal(f.admin.getFirebaseAdminMessaging(), f.messaging);
  assert.equal(f.initializations.length, 1);
  assert.equal(f.logs.length, 1);
});

test("Firebase Admin initialization trims deployment values and expands escaped key newlines", () => {
  const f = fixture({
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "  test-project ",
    FIREBASE_CLIENT_EMAIL: " test@example.invalid  ",
    FIREBASE_PRIVATE_KEY: "  key-start\\nkey-end  ",
  });
  assert.equal(f.admin.getFirebaseAdminMessaging(), f.messaging);
  assert.deepEqual(f.certificates, [{ projectId: "test-project", clientEmail: "test@example.invalid", privateKey: "key-start\nkey-end" }]);
  assert.deepEqual(f.initializations, [{ credential: f.credential }]);
  assert.deepEqual(f.messagingApps, [f.apps[0]]);
  assert.equal(f.logs.length, 0);
  assert.equal(f.admin.getFirebaseAdminMessaging(), f.messaging);
  assert.equal(f.initializations.length, 1);
  assert.equal(f.certificates.length, 1);
});

test("an existing Firebase Admin app is reused without requiring a second configuration", () => {
  const existingApp = {};
  const f = fixture({}, existingApp);
  assert.equal(f.admin.getFirebaseAdminMessaging(), f.messaging);
  assert.deepEqual(f.messagingApps, [existingApp]);
  assert.equal(f.certificates.length, 0);
  assert.equal(f.initializations.length, 0);
  assert.equal(f.logs.length, 0);
});
