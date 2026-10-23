import assert from "node:assert/strict";
import { test } from "node:test";
import { loadTs } from "./helpers/load-ts.mjs";

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}
const textContent = (node) => typeof node === "string" ? node : Array.isArray(node) ? node.map(textContent).join("") : node?.props ? textContent(node.props.children) : "";
function fixture(status = "required", missing = ["terms", "privacy"], marketingOptIn = false) {
  const values = [];
  const calls = [];
  let index = 0;
  let tree;
  const state = { status, userId: "verified-user", revision: "current-revision", missing, marketingOptIn, documents: [
    { kind: "terms", title: "이용약관", postedOn: "2026-10-23", content: "Test terms" },
    { kind: "privacy", title: "개인정보 수집·이용", postedOn: "2026-10-23", content: "Test privacy" },
  ] };
  const { LegalConsentDialog } = loadTs("components/legal-consent-dialog.tsx", {
    react: {
      useState: (initial) => { const slot = index++; if (!(slot in values)) values[slot] = initial; return [values[slot], (value) => { values[slot] = typeof value === "function" ? value(values[slot]) : value; }]; },
      useRef: () => ({ current: null }), useEffect() {},
    },
    "react-dom": { createPortal: (child) => child },
    "next/navigation": { useRouter: () => ({ push() {}, refresh() {} }) },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/checkbox": { Checkbox: "checkbox" },
    "@/app/auth/legal-actions": { acceptLegalDocumentsAction: async (input) => { calls.push(["accept", input]); return { ok: true }; } },
    "@/lib/supabase/logout": { signOutWithPushSession: async () => calls.push(["logout"]) },
  }, { document: { body: {} } });
  const render = () => { index = 0; tree = LegalConsentDialog({ state, onRefresh: async () => { calls.push(["refresh"]); }, onDismissDraft: () => { calls.push(["dismiss"]); } }); };
  render();
  return { calls, render, text: () => textContent(tree), checkboxes: () => elements(tree, (e) => e.type === "checkbox"),
    primary: () => elements(tree, (e) => e.type === "button" && textContent(e) === "동의하고 계속하기")[0],
    panel: () => elements(tree, (e) => e.props?.role === "dialog")[0] };
}

test("published documents start unchecked and cannot be submitted before both required consents", async () => {
  const f = fixture();
  assert.equal(f.primary().props.disabled, true);
  f.primary().props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(f.calls, []);
  for (const checkbox of f.checkboxes().slice(0, 2)) checkbox.props.onCheckedChange(true);
  f.render();
  assert.equal(f.primary().props.disabled, false);
  f.primary().props.onClick();
  await new Promise(setImmediate);
  assert.deepEqual(f.calls, [["accept", { expectedUserId: "verified-user", revision: "current-revision", termsAgreed: true, privacyAgreed: true, marketingAgreed: false }], ["refresh"]]);
});

test("marketing is an independent optional choice and existing opt-in is retained", async () => {
  const f = fixture();
  assert.equal(f.checkboxes()[2].props.checked, false);
  assert.match(f.text(), /\[선택\]마케팅 정보 수신 동의/);
  for (const checkbox of f.checkboxes()) checkbox.props.onCheckedChange(true);
  f.render(); f.primary().props.onClick();
  await new Promise(setImmediate);
  assert.equal(f.calls[0][1].marketingAgreed, true);
  const optedIn = fixture("required", ["terms", "privacy"], true);
  assert.equal(optedIn.checkboxes()[2].props.checked, true);
});

test("already accepted documents are checked and immutable while changed documents need a fresh choice", () => {
  const f = fixture("required", ["privacy"]);
  assert.equal(f.checkboxes()[0].props.checked, true);
  assert.equal(f.checkboxes()[0].props.disabled, true);
  assert.equal(f.checkboxes()[1].props.checked, false);
  assert.equal(f.checkboxes()[1].props.disabled, false);
});

test("drafts only dismiss a preview and never invoke the acceptance action", () => {
  const f = fixture("draft");
  assert.ok(f.checkboxes().every((checkbox) => !checkbox.props.disabled));
  assert.match(textContent(f.primary()), /동의하고 계속하기/);
  assert.equal(f.primary().props.disabled, true);
  for (const checkbox of f.checkboxes()) checkbox.props.onCheckedChange(true);
  f.render();
  assert.equal(f.primary().props.disabled, false);
  f.primary().props.onClick();
  assert.deepEqual(f.calls, [["dismiss"]]);
});

test("the service dialog shows posting dates without exposing draft labels or internal versions", () => {
  for (const status of ["draft", "required"]) {
    const f = fixture(status);
    assert.match(f.text(), /약관 동의/);
    assert.match(f.text(), /게시일 2026\.10\.23/);
    assert.doesNotMatch(f.text(), /초안|draft|internal-v1|current-revision|버전|해시/);
  }
});

test("Escape cannot dismiss published consent, while draft preview can be closed", () => {
  for (const status of ["required", "draft"]) {
    const f = fixture(status);
    f.panel().props.onKeyDown({ key: "Escape", preventDefault() {}, stopPropagation() {} });
    assert.deepEqual(f.calls, status === "draft" ? [["dismiss"]] : []);
    assert.equal(f.panel().props["aria-modal"], "true");
  }
});
