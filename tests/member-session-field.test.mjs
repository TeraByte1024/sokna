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

function fixture(part = null) {
  const state = [];
  const transitions = [];
  const saves = [];
  let stateIndex = 0;
  const noop = () => {};
  const stub = () => null;
  const mocks = {
    react: {
      useId: () => "session-test",
      useEffect: noop,
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useTransition: () => [false, (callback) => transitions.push(callback())],
    },
    "next/navigation": { useRouter: () => ({ refresh: noop }) },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/checkbox": { Checkbox: stub },
    "@/components/ui/card": { Card: "div", CardContent: "div", CardDescription: "p", CardHeader: "div", CardTitle: "h2" },
    "@/components/ui/sonner": { toast: { error: noop, success: noop } },
    "@/components/ui/leave-confirm-dialog": {
      LeaveConfirmDialog: stub,
      useUnsavedChangesWarning: () => ({ showLeaveModal: false, cancelLeave: noop, confirmLeave: noop, markSubmitting: noop }),
    },
    "@/components/push-notification-settings": {
      MarketingPushConsentDialog: stub,
      usePushNotificationDevice: () => ({ isPending: false, hasRegisteredToken: false, permission: "default" }),
    },
    "./delete-account-section": { DeleteAccountSection: stub },
    "./actions": { updateMyProfileAction: async (...args) => { saves.push(args); return { ok: true }; } },
    "lucide-react": Object.fromEntries(["User", "Mail", "Sparkles", "ShieldCheck", "Crown", "Clock", "Loader2", "CheckCircle2", "AlertCircle", "Bell"].map((name) => [name, stub])),
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
  return { load, MemberSessionField, session, chips, click, customInput, render, save };
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
