import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requireDependency = createRequire(import.meta.url);

function loadSource(relativePath, mocks, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync);
      if (resolved) return loadSource(path.relative(root, resolved), mocks, cache);
    }
    return requireDependency(name);
  };
  vm.runInThisContext("(function(require,module,exports){" + source + "\n})", { filename })(localRequire, loaded, loaded.exports);
  return loaded.exports;
}

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

function fixture(part = null, options = {}) {
  const state = [];
  const transitions = [];
  const saves = [];
  const operations = [];
  const errors = [];
  const busy = { saving: false, push: false };
  const guard = { dirty: false, open: false, pending: null, isSubmittingRef: { current: false } };
  const logout = { calls: 0, run: options.logout ?? (async () => {}) };
  let stateIndex = 0;
  const noop = () => {};
  const stub = () => null;
  const LeaveConfirmDialog = () => null;
  const DeleteAccountSection = () => null;
  const mocks = {
    react: {
      useId: () => "session-test",
      useEffect: noop,
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useTransition: () => [busy.saving, (callback) => transitions.push(callback())],
    },
    "next/navigation": { useRouter: () => ({
      push: (path) => operations.push(["navigate", path]), refresh: () => operations.push(["refresh"]),
    }) },
    "@/lib/supabase/logout": { signOutWithPushSession: async () => {
      logout.calls++;
      operations.push(["logout"]);
      return logout.run();
    } },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/checkbox": { Checkbox: stub },
    "@/components/ui/card": { Card: "div", CardContent: "div", CardDescription: "p", CardHeader: "div", CardTitle: "h2" },
    "@/components/ui/sonner": { toast: { error: (message) => errors.push(message), success: noop } },
    "@/components/ui/leave-confirm-dialog": {
      LeaveConfirmDialog,
      useUnsavedChangesWarning: ({ isDirty }) => {
        guard.dirty = isDirty;
        return {
          showLeaveModal: guard.open,
          cancelLeave: () => { guard.open = false; guard.pending = null; },
          confirmLeave: () => {
            guard.isSubmittingRef.current = true;
            guard.open = false;
            const action = guard.pending;
            guard.pending = null;
            action?.();
          },
          triggerConfirm: (action) => {
            if (guard.dirty) { guard.pending = action; guard.open = true; }
            else action();
          },
          markSubmitting: () => { guard.isSubmittingRef.current = true; },
          isSubmittingRef: guard.isSubmittingRef,
        };
      },
    },
    "@/components/push-notification-settings": {
      MarketingPushConsentDialog: stub,
      usePushNotificationDevice: () => ({
        isPending: busy.push, enabled: false, hasMarketingConsent: true, hasRegisteredToken: false, permission: "default",
        enablePush: () => operations.push(["enablePush"]), disablePush: () => operations.push(["disablePush"]),
      }),
    },
    "./delete-account-section": { DeleteAccountSection },
    "./actions": { updateMyProfileAction: async (...args) => { saves.push(args); return { ok: true }; } },
    "lucide-react": Object.fromEntries(["User", "Mail", "Sparkles", "ShieldCheck", "Crown", "Clock", "Loader2", "CheckCircle2", "AlertCircle", "Bell", "LogOut"].map((name) => [name, stub])),
  };
  const cache = new Map();
  const load = (file) => loadSource(file, mocks, cache);
  const { MemberSessionField } = load("components/member-session-field.tsx");
  const { ProfileForm } = load("app/profile/profile-form.tsx");
  const user = {
    id: "member-id", email: "member@example.test", name: "Member", generation: 40,
    part, status: "approved", applied_at: "2026-09-27T00:00:00Z", approved_at: null,
    marketing_opt_in: false, marketing_opted_in_label: null,
  };
  let tree;
  const render = () => { stateIndex = 0; tree = ProfileForm({ user, isAdmin: false }); };
  const session = () => {
    const field = elements(tree, (element) => element.type === MemberSessionField)[0];
    assert.ok(field, "The profile must use the same session field as registration");
    return MemberSessionField(field.props);
  };
  const chips = () => elements(session(), (element) => element.type === "button" && "aria-pressed" in element.props);
  const click = (label) => {
    const button = elements(session(), (element) => element.type === "button" && element.props.children === label)[0];
    assert.ok(button, "Missing button: " + label);
    button.props.onClick();
    render();
  };
  const customInput = () => elements(session(), (element) => element.type === "input")[0];
  const save = async () => {
    elements(tree, (element) => element.type === "form")[0].props.onSubmit({ preventDefault: noop });
    await Promise.all(transitions.splice(0));
    render();
    return saves.at(-1)?.[2];
  };
  render();
  const textContent = (node) => typeof node === "string" ? node
    : Array.isArray(node) ? node.map(textContent).join("") : node?.props ? textContent(node.props.children) : "";
  const logoutButton = () => elements(tree, (element) => element.type === "button" && textContent(element).includes("로그아웃"))[0];
  const leaveDialog = () => elements(tree, (element) => element.type === LeaveConfirmDialog)[0];
  const deletion = () => elements(tree, (element) => element.type === DeleteAccountSection)[0];
  return {
    load, MemberSessionField, session, chips, click, customInput, render, save,
    busy, guard, logout, logoutButton, leaveDialog, deletion, operations, errors, saves,
    find: (predicate) => elements(tree, predicate),
    settle: async () => { await new Promise(setImmediate); render(); },
  };
}

test("registration shares the vocal presets and keeps custom session entry required", () => {
  const f = fixture();
  const selected = [];
  const changed = [];
  const { MemberProfileFields } = f.load("components/member-profile-fields.tsx");
  const tree = MemberProfileFields({
    name: "Applicant", generation: "40", selectedPreset: "직접 입력", customPart: "바이올린",
    onNameChange() {}, onGenerationChange() {},
    onPresetChange: (value) => selected.push(value), onCustomPartChange: (value) => changed.push(value),
  });
  const field = elements(tree, (element) => element.type === f.MemberSessionField)[0];
  assert.ok(field, "Registration must render the shared session component");
  const session = f.MemberSessionField(field.props);
  const chips = elements(session, (element) => element.type === "button" && "aria-pressed" in element.props);
  assert.deepEqual(chips.map((chip) => chip.props.children), ["보컬(남)", "보컬(여)", "기타", "베이스", "드럼", "건반", "창작", "직접 입력"]);
  chips.find((chip) => chip.props.children === "보컬(여)").props.onClick();
  assert.deepEqual(selected, ["보컬(여)"]);
  const input = elements(session, (element) => element.type === "input")[0];
  assert.equal(input.props.required, true);
  assert.equal(input.props.value, "바이올린");
  input.props.onChange({ target: { value: "색소폰" } });
  assert.deepEqual(changed, ["색소폰"]);
});

test("profile editing preserves both vocal presets, legacy vocals, custom sessions, and unset values", async () => {
  for (const part of ["보컬(남)", "보컬(여)", "창작", "보컬", "바이올린", null]) {
    const f = fixture(part);
    const expected = part === "보컬" || part === "바이올린" ? "직접 입력" : part;
    assert.deepEqual(f.chips().filter((chip) => chip.props["aria-pressed"]).map((chip) => chip.props.children), expected ? [expected] : []);
    if (expected === "직접 입력") {
      assert.equal(f.customInput().props.value, part);
      assert.equal(f.customInput().props.required, false);
    }
    assert.equal(await f.save(), part);
  }
});

test("profile changes save the chosen vocal preset or trimmed custom session", async () => {
  const f = fixture("보컬");
  f.click("보컬(여)");
  assert.equal(f.customInput(), undefined);
  assert.equal(await f.save(), "보컬(여)");
  f.click("직접 입력");
  assert.equal(f.customInput().props.value, "");
  f.customInput().props.onChange({ target: { value: "  색소폰  " } });
  f.render();
  assert.equal(await f.save(), "색소폰");
});

test("profile session deselecting and empty custom input both save null", async () => {
  const f = fixture("보컬(남)");
  f.click("보컬(남)");
  assert.equal(await f.save(), null);
  f.click("직접 입력");
  f.customInput().props.onChange({ target: { value: "   " } });
  f.render();
  assert.equal(await f.save(), null);
});

function deferredLogout() {
  let resolve;
  let reject;
  const promise = new Promise((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

test("profile logout without edits ends the session before navigation and never submits the form", async () => {
  const f = fixture("기타");
  assert.equal(f.logoutButton().props.type, "button");
  f.logoutButton().props.onClick();
  await f.settle();
  assert.equal(f.guard.open, false);
  assert.deepEqual(f.operations, [["logout"], ["navigate", "/auth/login"], ["refresh"]]);
  assert.equal(f.guard.isSubmittingRef.current, true);
  assert.equal(f.saves.length, 0);
});

test("dirty profile logout waits for confirmation, cancellation preserves edits, and approval logs out once", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { logout: () => pending.promise });
  f.click("보컬(여)");
  f.logoutButton().props.onClick();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, true);
  assert.equal(f.logout.calls, 0);
  f.leaveDialog().props.onClose();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, false);
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.chips().find((chip) => chip.props["aria-pressed"]).props.children, "보컬(여)");
  assert.deepEqual(f.operations, []);
  f.logoutButton().props.onClick();
  f.render();
  f.leaveDialog().props.onConfirm();
  f.render();
  assert.equal(f.logout.calls, 1);
  assert.deepEqual(f.operations, [["logout"]]);
  assert.equal(f.logoutButton().props.disabled, true);
  pending.resolve();
  await f.settle();
  assert.deepEqual(f.operations, [["logout"], ["navigate", "/auth/login"], ["refresh"]]);
});

test("failed profile logout preserves edits and restores the unsaved-changes guard before retry", async () => {
  const f = fixture("기타", { logout: async () => { throw new Error("offline"); } });
  f.click("보컬(남)");
  f.logoutButton().props.onClick();
  f.render();
  f.leaveDialog().props.onConfirm();
  assert.equal(f.guard.isSubmittingRef.current, true);
  await f.settle();
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.guard.dirty, true);
  assert.equal(f.logoutButton().props.disabled, false);
  assert.deepEqual(f.operations, [["logout"]]);
  assert.deepEqual(f.errors, ["로그아웃에 실패했습니다. 다시 시도해 주세요."]);
  f.logout.run = async () => {};
  f.logoutButton().props.onClick();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, true);
  assert.equal(f.logout.calls, 1);
  f.leaveDialog().props.onConfirm();
  await f.settle();
  assert.equal(f.logout.calls, 2);
  assert.deepEqual(f.operations.at(-2), ["navigate", "/auth/login"]);
});

test("pending profile logout blocks duplicate logout, saving, withdrawal and device changes", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { logout: () => pending.promise });
  f.logoutButton().props.onClick();
  f.render();
  assert.equal(f.logoutButton().props.disabled, true);
  assert.equal(f.find((element) => element.type === "button" && element.props.type === "submit")[0].props.disabled, true);
  assert.equal(f.deletion().props.disabled, true);
  const deviceToggle = f.find((element) => element.props?.role === "switch")[0];
  assert.equal(deviceToggle.props.disabled, true);
  f.logoutButton().props.onClick();
  deviceToggle.props.onClick();
  await f.save();
  assert.equal(f.logout.calls, 1);
  assert.equal(f.saves.length, 0);
  assert.deepEqual(f.operations, [["logout"]]);
  pending.resolve();
  await f.settle();
});

test("profile logout is unavailable during saving, withdrawal or push configuration", () => {
  for (const operation of ["saving", "withdrawal", "push"]) {
    const f = fixture("기타");
    if (operation === "withdrawal") f.deletion().props.onPendingChange(true);
    else f.busy[operation] = true;
    f.render();
    assert.equal(f.logoutButton().props.disabled, true, operation);
    f.logoutButton().props.onClick();
    assert.equal(f.logout.calls, 0, operation);
    assert.equal(f.guard.open, false, operation);
  }
});
