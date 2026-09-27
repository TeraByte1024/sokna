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
  vm.runInThisContext("(function(require,module,exports,window){" + source + "\n})", { filename })(localRequire, loaded, loaded.exports, mocks.window);
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
  const linking = { calls: [], run: options.link ?? (async () => ({ ok: true, url: "https://accounts.google.test/authorize" })) };
  const unlinking = { calls: [], run: options.unlink ?? (async () => ({ ok: true, message: "Google 계정 연결을 해제했습니다." })) };
  let stateIndex = 0;
  const noop = () => {};
  const stub = () => null;
  const LeaveConfirmDialog = () => null;
  const DeleteAccountSection = () => null;
  const mocks = {
    react: {
      useId: () => "session-test",
      useEffect: noop,
      useRef(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
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
    window: { location: { assign: (url) => operations.push(["provider", url, guard.isSubmittingRef.current]) } },
    "./delete-account-section": { DeleteAccountSection },
    "./login-method-actions": { startSocialIdentityLinkAction: async (id, provider) => {
      linking.calls.push([id, provider]);
      operations.push(["link", id, provider]);
      return linking.run(id, provider);
    }, unlinkSocialIdentityAction: async (...args) => {
      unlinking.calls.push(args);
      operations.push(["unlink", ...args]);
      return unlinking.run(...args);
    } },
    "./actions": { updateMyProfileAction: async (...args) => { saves.push(args); return { ok: true }; } },
    "lucide-react": Object.fromEntries(["User", "Mail", "Sparkles", "ShieldCheck", "Crown", "Clock", "Loader2", "CheckCircle2", "AlertCircle", "Bell", "LogOut", "KeyRound", "Link2"].map((name) => [name, stub])),
  };
  const cache = new Map();
  const load = (file) => loadSource(file, mocks, cache);
  const { MemberSessionField } = load("components/member-session-field.tsx");
  const { ProfileForm } = load("app/profile/profile-form.tsx");
  const { LoginMethodsSection } = load("app/profile/login-methods-section.tsx");
  const user = {
    id: "member-id", email: "member@example.test", name: "Member", generation: 40,
    part, status: "approved", applied_at: "2026-09-27T00:00:00Z", approved_at: null,
    marketing_opt_in: false, marketing_opted_in_label: null,
  };
  let tree;
  let identities = options.identities ?? [
    { id: "google-one", provider: "google", email: "member@example.test", canUnlink: true, unlinkDisabledReason: null },
    { id: "google-two", provider: "google", email: "other@example.test", canUnlink: true, unlinkDisabledReason: null },
  ];
  const render = () => { stateIndex = 0; tree = ProfileForm({ user, isAdmin: false, identities, identityLinkResult: options.identityLinkResult }); };
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
  const loginSection = () => elements(tree, (element) => element.type === LoginMethodsSection)[0];
  const loginMethods = () => {
    const section = loginSection();
    assert.ok(section, "Profile must show the connected login methods");
    return LoginMethodsSection(section.props);
  };
  const providerLabel = (provider) => provider === "kakao" ? "카카오" : "Google";
  const linkButton = (provider = "google") => elements(loginMethods(), (element) => element.type === "button" && element.props["aria-label"] === providerLabel(provider) + " 계정 추가하기")[0];
  const unlinkButton = (email = "other@example.test", provider = "google") => elements(loginMethods(), (element) => element.type === "button" && element.props["aria-label"] === providerLabel(provider) + " " + email + " 연결 해제")[0];
  const unlinkDialog = () => elements(loginMethods(), (element) => element.type === "dialog" && element.props.id === "unlink-login-method-dialog")[0];
  const unlinkConfirm = () => elements(unlinkDialog(), (element) => element.type === "button" && element.props.variant === "destructive")[0];
  const unlinkCancel = () => elements(unlinkDialog(), (element) => element.type === "button" && textContent(element) === "취소")[0];
  return {
    load, MemberSessionField, session, chips, click, customInput, render, save,
    busy, guard, logout, logoutButton, leaveDialog, deletion, operations, errors, saves, linking, loginMethods, linkButton, textContent,
    unlinking, loginSection, unlinkButton, unlinkDialog, unlinkConfirm, unlinkCancel,
    setIdentities: (next) => { identities = next; render(); },
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


test("profile lists each connected Google email and permits another Google login method", () => {
  const f = fixture("기타", { identityLinkResult: "success" });
  const rows = elements(f.loginMethods(), (element) => element.type === "li");
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => f.textContent(row)), ["Googlemember@example.test연결 해제", "Googleother@example.test연결 해제"]);
  assert.equal(f.linkButton().props.type, "button");
  assert.equal(f.linkButton().props.disabled, false);
  assert.equal(f.textContent(f.linkButton()), "Google 계정 추가하기");
  assert.match(f.textContent(f.loginMethods()), /로그인 수단 연결을 확인했습니다/);
});

test("Google linking preserves unsaved edits until confirmation and disables navigation guard only when URL is ready", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { link: () => pending.promise });
  f.click("보컬(여)");
  f.linkButton().props.onClick();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, true);
  assert.deepEqual(f.linking.calls, []);
  f.leaveDialog().props.onClose();
  f.render();
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.chips().find((chip) => chip.props["aria-pressed"]).props.children, "보컬(여)");
  f.linkButton().props.onClick();
  f.render();
  f.leaveDialog().props.onConfirm();
  f.render();
  assert.deepEqual(f.linking.calls, [["member-id", "google"]]);
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.linkButton().props.disabled, true);
  pending.resolve({ ok: true, url: "https://accounts.google.test/authorize" });
  await f.settle();
  assert.deepEqual(f.operations, [["link", "member-id", "google"], ["provider", "https://accounts.google.test/authorize", true]]);
  assert.equal(f.saves.length, 0);
});

test("Google link action failures preserve edits, restore guard and allow retry", async () => {
  for (const failure of ["response", "exception"]) {
    const f = fixture("기타", { link: async () => {
      if (failure === "exception") throw new Error("network");
      return { ok: false, error: "이 Google 계정은 다른 계정에 연결되어 있습니다." };
    } });
    f.click("보컬(남)");
    f.linkButton().props.onClick();
    f.render();
    f.leaveDialog().props.onConfirm();
    await f.settle();
    assert.equal(f.guard.isSubmittingRef.current, false, failure);
    assert.equal(f.guard.dirty, true, failure);
    assert.equal(f.linkButton().props.disabled, false, failure);
    assert.equal(elements(f.loginMethods(), (element) => element.props?.role === "alert").length, 1, failure);
    assert.deepEqual(f.operations, [["link", "member-id", "google"]], failure);
    f.linking.run = async () => ({ ok: true, url: "https://accounts.google.test/retry" });
    f.linkButton().props.onClick();
    f.render();
    assert.equal(f.leaveDialog().props.isOpen, true, failure);
    f.leaveDialog().props.onConfirm();
    await f.settle();
    assert.deepEqual(f.operations.at(-1), ["provider", "https://accounts.google.test/retry", true], failure);
  }
});

test("pending Google linking blocks duplicate linking, logout, saving, withdrawal and push changes", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { link: () => pending.promise });
  const initialButton = f.linkButton();
  initialButton.props.onClick();
  initialButton.props.onClick();
  f.render();
  assert.deepEqual(f.linking.calls, [["member-id", "google"]]);
  assert.equal(f.logoutButton().props.disabled, true);
  assert.equal(f.deletion().props.disabled, true);
  assert.equal(f.find((element) => element.type === "button" && element.props.type === "submit")[0].props.disabled, true);
  const deviceToggle = f.find((element) => element.props?.role === "switch")[0];
  assert.equal(deviceToggle.props.disabled, true);
  f.logoutButton().props.onClick();
  deviceToggle.props.onClick();
  await f.save();
  assert.equal(f.logout.calls, 0);
  assert.equal(f.saves.length, 0);
  assert.deepEqual(f.operations, [["link", "member-id", "google"]]);
  pending.resolve({ ok: false, error: "연결 취소" });
  await f.settle();
});

test("Google linking is unavailable during saving, logout, withdrawal or push configuration", async () => {
  for (const operation of ["saving", "logout", "withdrawal", "push"]) {
    const pending = deferredLogout();
    const f = fixture("기타", { logout: () => pending.promise });
    if (operation === "withdrawal") f.deletion().props.onPendingChange(true);
    else if (operation === "logout") f.logoutButton().props.onClick();
    else f.busy[operation] = true;
    f.render();
    assert.equal(f.linkButton().props.disabled, true, operation);
    f.linkButton().props.onClick();
    assert.deepEqual(f.linking.calls, [], operation);
    assert.equal(f.guard.open, false, operation);
    pending.resolve();
    await f.settle();
  }
});


test("Google login controls reuse the four-color logo, and email has no unlink control", () => {
  const f = fixture("기타", { identities: [
    { id: "email-one", provider: "email", email: "member@example.test", canUnlink: false, unlinkDisabledReason: null },
    { id: "google-one", provider: "google", email: "other@example.test", canUnlink: true, unlinkDisabledReason: null },
  ] });
  const { GoogleLogo } = f.load("components/google-logo.tsx");
  const logo = GoogleLogo({});
  assert.equal(logo.props["aria-hidden"], "true");
  assert.deepEqual(elements(logo, (element) => element.type === "path").map((element) => element.props.fill), ["#4285F4", "#34A853", "#FBBC05", "#EA4335"]);
  const rows = elements(f.loginMethods(), (element) => element.type === "li");
  assert.equal(elements(rows[0], (element) => element.type === "button").length, 0);
  assert.equal(elements(rows[1], (element) => element.type === GoogleLogo).length, 1);
  assert.equal(elements(f.linkButton(), (element) => element.type === GoogleLogo).length, 1);
});

test("Google unlink confirmation names the account and preserves unsaved profile edits on cancel and success", async () => {
  const f = fixture("기타");
  f.click("보컬(여)");
  f.unlinkButton().props.onClick();
  f.render();
  assert.equal(f.loginSection().props.unlinkTarget.email, "other@example.test");
  assert.match(f.textContent(f.unlinkDialog()), /other@example.test/);
  assert.equal(f.guard.open, false);
  assert.deepEqual(f.unlinking.calls, []);
  f.unlinkCancel().props.onClick();
  f.render();
  assert.equal(f.loginSection().props.unlinkTarget, null);
  assert.equal(f.guard.dirty, true);
  f.unlinkButton().props.onClick();
  f.render();
  await f.unlinkConfirm().props.onClick();
  await f.settle();
  assert.deepEqual(f.unlinking.calls, [["member-id", "google-two"]]);
  assert.deepEqual(f.operations, [["unlink", "member-id", "google-two"], ["refresh"]]);
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.guard.dirty, true);
  assert.equal(f.chips().find((chip) => chip.props["aria-pressed"]).props.children, "보컬(여)");
  assert.equal(f.loginSection().props.unlinkTarget, null);
  assert.equal(f.saves.length, 0);
  assert.match(f.textContent(f.loginMethods()), /Google 계정 연결을 해제했습니다/);
});

test("pending Google unlink blocks duplicate requests, closing the modal and other profile operations", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { unlink: () => pending.promise });
  f.unlinkButton().props.onClick();
  f.render();
  const confirm = f.unlinkConfirm();
  const first = confirm.props.onClick();
  await confirm.props.onClick();
  f.render();
  assert.deepEqual(f.unlinking.calls, [["member-id", "google-two"]]);
  assert.equal(f.unlinkDialog().props["aria-busy"], true);
  assert.equal(f.unlinkConfirm().props.disabled, true);
  assert.equal(f.unlinkCancel().props.disabled, true);
  let prevented = false;
  f.unlinkDialog().props.onCancel({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  f.unlinkCancel().props.onClick();
  f.render();
  assert.equal(f.loginSection().props.unlinkTarget.id, "google-two");
  assert.equal(f.linkButton().props.disabled, true);
  assert.equal(f.logoutButton().props.disabled, true);
  assert.equal(f.deletion().props.disabled, true);
  const device = f.find((element) => element.props?.role === "switch")[0];
  assert.equal(device.props.disabled, true);
  f.linkButton().props.onClick();
  f.logoutButton().props.onClick();
  device.props.onClick();
  await f.save();
  assert.equal(f.linking.calls.length, 0);
  assert.equal(f.logout.calls, 0);
  assert.equal(f.saves.length, 0);
  pending.resolve({ ok: true, message: "Google 계정 연결을 해제했습니다." });
  await first;
  await f.settle();
});

test("failed Google unlink keeps the confirmation open, reports errors and permits retry", async () => {
  for (const failure of ["response", "exception"]) {
    const f = fixture("기타", { unlink: async () => {
      if (failure === "exception") throw new Error("network");
      return { ok: false, error: "마지막 로그인 수단은 해제할 수 없습니다." };
    } });
    f.click("보컬(남)");
    f.unlinkButton().props.onClick();
    f.render();
    await f.unlinkConfirm().props.onClick();
    await f.settle();
    assert.equal(f.loginSection().props.unlinkTarget.id, "google-two", failure);
    assert.equal(f.unlinkConfirm().props.disabled, false, failure);
    assert.equal(elements(f.loginMethods(), (element) => element.props?.role === "alert").length, 2, failure);
    assert.equal(f.guard.isSubmittingRef.current, false, failure);
    assert.equal(f.guard.dirty, true, failure);
    assert.deepEqual(f.operations, [["unlink", "member-id", "google-two"]], failure);
    f.unlinking.run = async () => ({ ok: true, message: "연결 해제 완료" });
    await f.unlinkConfirm().props.onClick();
    await f.settle();
    assert.equal(f.unlinking.calls.length, 2, failure);
    assert.equal(f.loginSection().props.unlinkTarget, null, failure);
  }
});

test("protected Google methods show the reason and cannot open the unlink dialog", () => {
  const reason = "마지막 로그인 수단은 해제할 수 없습니다.";
  const f = fixture("기타", { identities: [
    { id: "google-only", provider: "google", email: "other@example.test", canUnlink: false, unlinkDisabledReason: reason },
  ] });
  assert.equal(f.unlinkButton().props.disabled, true);
  assert.match(f.textContent(f.loginMethods()), /마지막 로그인 수단/);
  f.unlinkButton().props.onClick();
  f.render();
  assert.equal(f.loginSection().props.unlinkTarget, null);
  assert.deepEqual(f.unlinking.calls, []);
});

test("Google unlink rechecks eligibility before confirmation and is blocked during other operations", async () => {
  const f = fixture("기타");
  f.unlinkButton().props.onClick();
  f.render();
  f.setIdentities([{ id: "google-two", provider: "google", email: "other@example.test", canUnlink: false, unlinkDisabledReason: "마지막 로그인 수단은 해제할 수 없습니다." }]);
  await f.unlinkConfirm().props.onClick();
  await f.settle();
  assert.deepEqual(f.unlinking.calls, []);
  assert.match(f.textContent(f.unlinkDialog()), /마지막 로그인 수단/);
  for (const operation of ["saving", "logout", "withdrawal", "push", "linking"]) {
    const pending = deferredLogout();
    const busy = fixture("기타", { logout: () => pending.promise, link: () => pending.promise });
    if (operation === "withdrawal") busy.deletion().props.onPendingChange(true);
    else if (operation === "logout") busy.logoutButton().props.onClick();
    else if (operation === "linking") busy.linkButton().props.onClick();
    else busy.busy[operation] = true;
    busy.render();
    assert.equal(busy.unlinkButton().props.disabled, true, operation);
    busy.unlinkButton().props.onClick();
    busy.render();
    assert.equal(busy.loginSection().props.unlinkTarget, null, operation);
    assert.deepEqual(busy.unlinking.calls, [], operation);
    pending.resolve({ ok: false, error: "cancelled" });
    await busy.settle();
  }
});


test("Google unlink confirmation explains automatic relinking only when another method shares its email", () => {
  const note = "같은 이메일의 로그인 수단이 남아 있어, 다음 Google 로그인 때 자동으로 다시 연결될 수 있습니다.";
  for (const [remainingEmail, shouldWarn] of [["MEMBER@Example.Test", true], ["other@example.test", false], [null, false]]) {
    const f = fixture("기타", { identities: [
      { id: "email-one", provider: "email", email: remainingEmail, canUnlink: false, unlinkDisabledReason: null },
      { id: "google-one", provider: "google", email: "member@example.test", canUnlink: true, unlinkDisabledReason: null },
    ] });
    f.unlinkButton("member@example.test").props.onClick();
    f.render();
    assert.equal(f.textContent(f.unlinkDialog()).includes(note), shouldWarn, String(remainingEmail));
    assert.equal(f.unlinkDialog().props["aria-describedby"].includes("unlink-login-method-relink-note"), shouldWarn, String(remainingEmail));
    assert.deepEqual(f.unlinking.calls, []);
  }
});


test("profile shows Kakao identity and both provider add buttons with their own logos", () => {
  const f = fixture("기타", { identities: [
    { id: "google-one", provider: "google", email: "member@example.test", canUnlink: true, unlinkDisabledReason: null },
    { id: "kakao-one", provider: "kakao", email: "kakao@example.test", canUnlink: true, unlinkDisabledReason: null },
  ] });
  const { KakaoLogo } = f.load("components/kakao-logo.tsx");
  const rows = elements(f.loginMethods(), (element) => element.type === "li");
  assert.match(f.textContent(rows[1]), /카카오kakao@example.test연결 해제/);
  assert.equal(elements(rows[1], (element) => element.type === KakaoLogo).length, 1);
  assert.equal(elements(f.linkButton("kakao"), (element) => element.type === KakaoLogo).length, 1);
  assert.equal(f.textContent(f.linkButton("google")), "Google 계정 추가하기");
  assert.equal(f.textContent(f.linkButton("kakao")), "카카오 계정 추가하기");
  assert.equal(f.unlinkButton("kakao@example.test", "kakao").props.disabled, false);
});

test("Kakao linking confirms unsaved changes and blocks both provider buttons until its URL is ready", async () => {
  const pending = deferredLogout();
  const f = fixture("기타", { link: () => pending.promise });
  f.click("보컬(여)");
  f.linkButton("kakao").props.onClick();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, true);
  assert.deepEqual(f.linking.calls, []);
  f.leaveDialog().props.onClose();
  f.render();
  assert.equal(f.guard.dirty, true);
  f.linkButton("kakao").props.onClick();
  f.render();
  f.leaveDialog().props.onConfirm();
  f.render();
  assert.deepEqual(f.linking.calls, [["member-id", "kakao"]]);
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.textContent(f.linkButton("kakao")), "카카오 연결 중...");
  assert.equal(f.textContent(f.linkButton("google")), "Google 계정 추가하기");
  assert.equal(f.linkButton("google").props.disabled, true);
  assert.equal(f.linkButton("kakao").props.disabled, true);
  f.linkButton("google").props.onClick();
  f.linkButton("kakao").props.onClick();
  assert.equal(f.linking.calls.length, 1);
  pending.resolve({ ok: true, url: "https://kauth.kakao.test/oauth/authorize" });
  await f.settle();
  assert.deepEqual(f.operations, [["link", "member-id", "kakao"], ["provider", "https://kauth.kakao.test/oauth/authorize", true]]);
});

test("unavailable Kakao linking keeps the draft and allows another provider to be selected", async () => {
  const f = fixture("기타", { link: async () => ({ ok: false, error: "카카오 로그인을 아직 사용할 수 없습니다." }) });
  f.click("보컬(남)");
  f.linkButton("kakao").props.onClick();
  f.render();
  f.leaveDialog().props.onConfirm();
  await f.settle();
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.equal(f.guard.dirty, true);
  assert.equal(f.linkButton("kakao").props.disabled, false);
  assert.equal(f.linkButton("google").props.disabled, false);
  assert.match(f.textContent(f.loginMethods()), /카카오 로그인을 아직 사용할 수 없습니다/);
  f.linkButton("google").props.onClick();
  f.render();
  assert.equal(f.leaveDialog().props.isOpen, true);
  f.leaveDialog().props.onConfirm();
  await f.settle();
  assert.deepEqual(f.linking.calls, [["member-id", "kakao"], ["member-id", "google"]]);
  assert.equal(f.saves.length, 0);
});

test("Kakao unlink names its provider, explains same-email relinking and preserves unsaved edits", async () => {
  const f = fixture("기타", { identities: [
    { id: "google-one", provider: "google", email: "MEMBER@example.test", canUnlink: true, unlinkDisabledReason: null },
    { id: "kakao-one", provider: "kakao", email: "member@example.test", canUnlink: true, unlinkDisabledReason: null },
  ], unlink: async () => ({ ok: true, message: "카카오 계정 연결을 해제했습니다." }) });
  f.click("보컬(여)");
  f.unlinkButton("member@example.test", "kakao").props.onClick();
  f.render();
  assert.match(f.textContent(f.unlinkDialog()), /카카오 계정 연결을 해제할까요/);
  assert.match(f.textContent(f.unlinkDialog()), /다음 카카오 로그인 때 자동으로 다시 연결될 수 있습니다/);
  assert.equal(f.guard.open, false);
  await f.unlinkConfirm().props.onClick();
  await f.settle();
  assert.deepEqual(f.unlinking.calls, [["member-id", "kakao-one"]]);
  assert.equal(f.guard.dirty, true);
  assert.equal(f.guard.isSubmittingRef.current, false);
  assert.deepEqual(f.operations, [["unlink", "member-id", "kakao-one"], ["refresh"]]);
  assert.match(f.textContent(f.loginMethods()), /카카오 계정 연결을 해제했습니다/);
});

test("a protected Kakao login method cannot open the unlink dialog", () => {
  const f = fixture("기타", { identities: [
    { id: "kakao-one", provider: "kakao", email: "kakao@example.test", canUnlink: false, unlinkDisabledReason: "다른 로그인 수단을 먼저 추가해 주세요." },
  ] });
  assert.equal(f.unlinkButton("kakao@example.test", "kakao").props.disabled, true);
  assert.match(f.textContent(f.loginMethods()), /다른 로그인 수단을 먼저 추가/);
  f.unlinkButton("kakao@example.test", "kakao").props.onClick();
  f.render();
  assert.equal(f.loginSection().props.unlinkTarget, null);
  assert.deepEqual(f.unlinking.calls, []);
});
