import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "components/push-message-listener.tsx");
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const settle = () => new Promise(setImmediate);

function fixture({ permission = "granted", deferBinding = false, deferRegistration = false } = {}) {
  const window = new EventTarget();
  window.Notification = { permission };
  const document = new EventTarget();
  document.visibilityState = "visible";
  const serviceWorker = new EventTarget();
  const messages = [];
  const errors = [];
  const calls = { register: 0, getRegistration: 0, startSync: 0, stopSync: 0, checkBinding: 0 };
  const worker = { postMessage: (message) => messages.push({ ...message }) };
  const registration = { active: worker };
  const controls = { now: 100_000, lookupError: false, resolveBinding: null, resolveRegistration: null };
  serviceWorker.controller = worker;
  serviceWorker.getRegistration = async (scope) => {
    assert.equal(scope, "/");
    calls.getRegistration++;
    if (controls.lookupError) throw new Error("worker lookup unavailable");
    return registration;
  };
  serviceWorker.register = async (script) => {
    assert.equal(script, "/firebase-messaging-sw.js");
    calls.register++;
    if (deferRegistration) await new Promise((resolve) => { controls.resolveRegistration = resolve; });
    return registration;
  };
  let cleanup;
  const mocks = {
    react: { useEffect: (effect) => { cleanup = effect(); } },
    "@/lib/firebase/push-device": {
      startPushDeviceSync() { calls.startSync++; return () => { calls.stopSync++; }; },
      async refreshPushDevice() {
        calls.checkBinding++;
        if (deferBinding) await new Promise((resolve) => { controls.resolveBinding = resolve; });
      },
    },
  };
  const loaded = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${source}\n})`, {
    window, document, navigator: { serviceWorker }, Notification: window.Notification,
    Date: { now: () => controls.now }, console: { error: (...args) => errors.push(args) },
  }, { filename })((name) => {
    assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
    return mocks[name];
  }, loaded, loaded.exports);
  loaded.exports.PushMessageListener();
  return { window, document, serviceWorker, registration, messages, errors, calls, controls, cleanup: () => cleanup() };
}

test("mount wakes the existing worker using a recovery-only message and verifies the initial binding", async () => {
  const f = fixture();
  await settle();
  assert.equal(f.calls.register, 1);
  assert.equal(f.calls.startSync, 1);
  assert.equal(f.calls.checkBinding, 1);
  assert.ok(f.messages.length > 0);
  assert.ok(f.messages.every((message) => JSON.stringify(message) === JSON.stringify({ type: "SOKNA_PUSH_RECOVERY" })));
  f.cleanup();
});

test("focus, online, pageshow and token changes wake recovery independently of the worker update cooldown", async () => {
  const f = fixture();
  await settle();
  const initialMessages = f.messages.length;
  for (const type of ["focus", "online", "pageshow", "sokna-push-token-change"]) {
    f.window.dispatchEvent(new Event(type));
    await settle();
  }
  assert.equal(f.calls.register, 1);
  assert.equal(f.messages.length, initialMessages + 4);
  f.controls.now += 60_001;
  f.window.dispatchEvent(new Event("focus"));
  await settle();
  assert.equal(f.calls.register, 2);
  f.cleanup();
});

test("a visible page and a new service worker controller each wake bounded notification recovery", async () => {
  const f = fixture();
  await settle();
  const initialMessages = f.messages.length;
  f.document.visibilityState = "hidden";
  f.document.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(f.messages.length, initialMessages);
  f.document.visibilityState = "visible";
  f.document.dispatchEvent(new Event("visibilitychange"));
  await settle();
  assert.equal(f.messages.length, initialMessages + 1);
  const newWorkerMessages = [];
  f.registration.active = { postMessage: (message) => newWorkerMessages.push(message.type) };
  f.serviceWorker.dispatchEvent(new Event("controllerchange"));
  await settle();
  assert.deepEqual(newWorkerMessages, ["SOKNA_PUSH_RECOVERY"]);
  f.cleanup();
});

test("the worker can settle pending recovery metadata even when permission is no longer granted", async () => {
  for (const permission of ["denied", "default"]) {
    const f = fixture({ permission });
    await settle();
    assert.equal(f.calls.register, 0);
    assert.ok(f.messages.length > 0);
    f.cleanup();
  }
});

test("an initial binding check wakes recovery again after a device receipt becomes available", async () => {
  const f = fixture({ deferBinding: true });
  await settle();
  const initialMessages = f.messages.length;
  f.controls.resolveBinding();
  await settle();
  assert.equal(f.messages.length, initialMessages + 1);
  f.cleanup();
});

test("worker lookup failures are isolated and a later online event can recover", async () => {
  const f = fixture();
  await settle();
  const initialMessages = f.messages.length;
  f.controls.lookupError = true;
  f.window.dispatchEvent(new Event("focus"));
  await settle();
  assert.equal(f.messages.length, initialMessages);
  assert.ok(f.errors.length > 0);
  f.controls.lookupError = false;
  f.window.dispatchEvent(new Event("online"));
  await settle();
  assert.equal(f.messages.length, initialMessages + 1);
  f.cleanup();
});

test("unmount removes recovery listeners and prevents delayed registration or binding wakes", async () => {
  const f = fixture({ deferBinding: true, deferRegistration: true });
  await settle();
  const initialMessages = f.messages.length;
  f.cleanup();
  f.controls.resolveBinding();
  f.controls.resolveRegistration();
  for (const type of ["focus", "online", "pageshow", "sokna-push-token-change"]) f.window.dispatchEvent(new Event(type));
  f.document.dispatchEvent(new Event("visibilitychange"));
  f.serviceWorker.dispatchEvent(new Event("controllerchange"));
  await settle();
  assert.equal(f.messages.length, initialMessages);
  assert.equal(f.calls.register, 1);
  assert.equal(f.calls.stopSync, 1);
});
