import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { test } from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { isNominationResponseOutdated, hasNominationContentChanged } from "../lib/nomination-response-review.ts";

const root = path.resolve(import.meta.dirname, "..");
const requireDependency = createRequire(import.meta.url);
function loadSource(relativePath, mocks = {}, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/")) {
      const base = path.join(root, name.slice(2));
      const resolved = [base, base + ".ts", base + ".tsx"].find(existsSync);
      if (resolved) return loadSource(path.relative(root, resolved), mocks, cache);
    }
    return requireDependency(name);
  };
  vm.runInThisContext("(function(require,module,exports,console){" + source + "\n})", { filename })(
    localRequire, loaded, loaded.exports, { ...console, error() {} },
  );
  return loaded.exports;
}

const before = "2026-10-07T01:00:00.000Z";
const edited = "2026-10-07T02:00:00.000Z";
const confirmed = "2026-10-07T03:00:00.000Z";
const response = (part, updatedAt = before) => ({
  id: 1, nominationId: 7, userId: "member", sessionPart: part, status: "available", comment: "", createdAt: before, updatedAt,
});
const performers = [{ id: 1, name: "참여자", userId: "member", part: "기타, 건반" }];
const song = {
  id: 7, gigId: 1, title: "후보곡", artist: "", requiredParts: ["기타", "건반"], recommendedVocals: [],
  sheetExists: false, sheetNote: "", description: "", links: [], responses: [response("기타")],
  orderNum: 0, createdAt: before, updatedAt: edited, createdBy: null,
};

test("only edits strictly later than a saved response need reconfirmation", () => {
  assert.equal(isNominationResponseOutdated(edited, response("기타")), true);
  for (const at of [before, confirmed]) assert.equal(isNominationResponseOutdated(edited, response("기타", at)), at === before);
  assert.equal(isNominationResponseOutdated(before, response("기타")), false);
  assert.equal(isNominationResponseOutdated(edited, { updatedAt: "2026-10-07T11:00:00+09:00" }), false);
  for (const at of [undefined, null, "", "invalid"]) {
    assert.equal(isNominationResponseOutdated(at, response("기타")), false);
    assert.equal(isNominationResponseOutdated(edited, { updatedAt: at }), false);
  }
  assert.equal(isNominationResponseOutdated(edited, null), false);
});

const content = {
  title: "후보곡", artist: null, required_parts: ["기타"], sheet_exists: false, sheet_note: "첫 줄\n둘째 줄",
  description: "어필", links: [{ url: "https://example.com", note: "설명\n다음", timestamps: [{ id: "old", time: "1:00", label: "후렴" }] }],
  recommended_vocals: [{ id: 2, name: "보컬", generation: null, part: "보컬(남)" }],
};
test("equivalent JSON and optional fields do not count as an edit", () => {
  const same = { ...content, artist: "", links: [{ timestamps: [{ label: "후렴", time: "1:00", id: "new" }], note: "설명\n다음", url: "https://example.com", timestamp: "" }], recommended_vocals: [{ part: "보컬(남)", name: "보컬", id: 2 }] };
  assert.equal(hasNominationContentChanged(content, same), false);
  assert.equal(hasNominationContentChanged({ links: ["https://example.com"] }, { links: [{ url: "https://example.com", note: "", timestamps: [] }] }), false);
  assert.equal(hasNominationContentChanged({ links: [{ url: "url", timestamp: "1:00" }] }, { links: [{ url: "url", timestamps: [{ time: "1:00", label: "" }] }] }), false);
});
test("every editable content field including line breaks can invalidate responses", () => {
  for (const [key, value] of Object.entries({
    title: "다른 곡", artist: "아티스트", required_parts: ["기타", "건반"], sheet_exists: true,
    sheet_note: "첫 줄 둘째 줄", description: "다른 어필", links: [{ url: "https://example.com", note: "설명 다음" }],
    recommended_vocals: [{ id: 3, name: "다른 보컬" }],
  })) assert.equal(hasNominationContentChanged(content, { ...content, [key]: value }), true, key);
});

function nodes(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => nodes(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
function textContent(tree) {
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  return tree && typeof tree === "object" ? textContent(tree.props?.children) : tree == null ? "" : String(tree);
}
const uiMocks = {
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/input": { Input: "input" },
  "@/components/ui/badge": { Badge: "span" },
  "@/components/ui/card": { Card: "section", CardContent: "div" },
  "@/components/ui/responsive-image": { ResponsiveImage: () => null },
};
function responseFixture(saveResult = { ok: true, updatedAt: confirmed }) {
  const state = [];
  let index = 0;
  let pending;
  let updated;
  const toasts = [];
  const mocks = {
    ...uiMocks,
    react: {
      useMemo: (fn) => fn(), useEffect() {},
      useState(initial) {
        const current = index++;
        if (!(current in state)) state[current] = initial;
        return [state[current], (value) => { state[current] = typeof value === "function" ? value(state[current]) : value; }];
      },
      useTransition: () => [false, (fn) => { pending = fn(); }],
    },
    "@/app/gigs/[id]/nominations/actions": { saveNominationResponsesAction: async () => saveResult },
    sonner: { toast: { success: (...args) => toasts.push(["success", ...args]), error: (...args) => toasts.push(["error", ...args]) } },
  };
  const { NominationResponseSection } = loadSource("components/nominations/nomination-response-section.tsx", mocks);
  return {
    render(overrides = {}) {
      index = 0;
      return NominationResponseSection({ nominationId: 7, nominationUpdatedAt: edited, gigId: "1", currentUserId: "member", canRespond: true, requiredParts: song.requiredParts, responses: song.responses, performers, onResponseUpdated: (value) => { updated = value; }, ...overrides });
    },
    flush: () => pending,
    get updated() { return updated; },
    toasts,
  };
}

test("detail notice uses the requested wording and identifies stale sessions independently", () => {
  const fixture = responseFixture();
  const html = renderToStaticMarkup(fixture.render({ responses: [response("기타"), response("건반", confirmed)] }));
  assert.match(html, /마지막 응답 이후 글이 수정되었습니다/);
  assert.ok(html.includes("재확인할 세션: 기타</p>"));
  assert.doesNotMatch(html, /재확인할 세션: 기타, 건반/);
  const single = renderToStaticMarkup(fixture.render({ requiredParts: ["기타"] }));
  assert.match(single, /마지막 응답 이후 글이 수정되었습니다/);
});
test("no response or no eligible stale response produces no notice", () => {
  const fixture = responseFixture();
  for (const responses of [[], [response("기타", confirmed)], [{ ...response("기타"), userId: "other" }], [response("드럼")]]) {
    assert.doesNotMatch(renderToStaticMarkup(fixture.render({ responses })), /마지막 응답 이후 글이 수정되었습니다/);
  }
});
async function saveFromNotice(fixture) {
  const button = nodes(fixture.render(), (node) => node.type === "button" && textContent(node) === "응답 다시 확인")[0];
  button.props.onClick();
  const save = nodes(fixture.render(), (node) => node.type === "button" && textContent(node) === "저장")[0];
  assert.ok(save);
  save.props.onClick();
  await fixture.flush();
}
test("re-saving unchanged responses uses the server timestamp and clears the notice", async () => {
  const fixture = responseFixture();
  await saveFromNotice(fixture);
  assert.ok(fixture.updated.every((item) => item.updatedAt === confirmed));
  assert.doesNotMatch(renderToStaticMarkup(fixture.render({ responses: fixture.updated })), /마지막 응답 이후 글이 수정되었습니다/);
  assert.deepEqual(fixture.toasts, [["success", "가능 여부 및 메모가 저장되었습니다.", { position: "bottom-center" }]]);
});
test("failed saves keep the dialog and notice and show a bottom toast", async () => {
  const fixture = responseFixture({ ok: false, error: "저장 실패" });
  await saveFromNotice(fixture);
  assert.equal(fixture.updated, undefined);
  assert.ok(nodes(fixture.render(), (node) => node.props?.role === "dialog").length);
  assert.match(renderToStaticMarkup(fixture.render()), /마지막 응답 이후 글이 수정되었습니다/);
  assert.deepEqual(fixture.toasts, [["error", "저장 실패", { position: "bottom-center" }]]);
});

function serverFixture({ admin = true, error = null } = {}) {
  const writes = [];
  const invalidations = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "member", user_metadata: {} } }, error: null }) },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; },
        single: async () => ({ data: { id: 7, created_by: 2, ...content }, error: null }),
        maybeSingle: async () => ({ data: { id: 2, user_id: "other", name: table === "users" ? "본인" : "다른 참여자" }, error: null }),
        update(payload) { writes.push({ table, payload }); return query; },
        upsert(payload) { writes.push({ table, payload }); return query; },
        then(resolve, reject) { return Promise.resolve({ error }).then(resolve, reject); },
      };
      return query;
    },
  };
  const actions = loadSource("app/gigs/[id]/nominations/actions.ts", {
    "@/lib/supabase/server": { createClient: async () => client },
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/lib/nomination-views": {}, "@/lib/push-notifications": {},
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
  });
  return { ...actions, writes, invalidations };
}
const payload = { title: content.title, artist: "", requiredParts: content.required_parts, sheetExists: false, sheetNote: content.sheet_note, description: content.description, links: content.links, recommendedVocals: content.recommended_vocals };
test("unchanged song saves skip writes while a real edit updates the timestamp", async () => {
  const fixture = serverFixture();
  await fixture.updateNomination("1", 7, payload);
  assert.equal(fixture.writes.length, 0);
  await fixture.updateNomination("1", 7, { ...payload, sheetNote: "새 메모" });
  assert.equal(fixture.writes.length, 1);
  assert.ok(Number.isFinite(Date.parse(fixture.writes[0].payload.updated_at)));
  assert.equal(fixture.invalidations.length, 2);
});
test("unchanged saves still require ownership before skipping the write", async () => {
  const fixture = serverFixture({ admin: false });
  await assert.rejects(fixture.updateNomination("1", 7, payload), /본인이 등록한 곡만/);
  assert.equal(fixture.writes.length, 0);
});
test("response action returns the same timestamp saved for all sessions", async () => {
  const fixture = serverFixture();
  const result = await fixture.saveNominationResponsesAction(7, "1", [{ sessionPart: "기타", status: "available" }, { sessionPart: "건반", status: "undecided" }]);
  assert.equal(result.ok, true);
  assert.ok(fixture.writes[0].payload.every((item) => item.updated_at === result.updatedAt));
});
test("response DB failures cannot return a successful confirmation", async () => {
  const fixture = serverFixture({ error: { message: "db error" } });
  const result = await fixture.saveNominationResponsesAction(7, "1", [{ sessionPart: "기타", status: "available" }]);
  assert.equal(result.ok, false);
  assert.equal(result.updatedAt, undefined);
  assert.equal(fixture.invalidations.length, 0);
});

test("basic and compact song lists keep stale response indicators after the song is read", () => {
  for (const compact of [false, true]) {
    for (const stale of [false, true]) {
    const state = [];
    let index = 0;
    const { NominationPanel } = loadSource("components/nominations/nomination-panel.tsx", {
      ...uiMocks,
      react: { ...React, useEffect() {}, useMemo: (fn) => fn(), useCallback: (fn) => fn, useState(initial) {
        const current = index++;
        if (!(current in state)) state[current] = typeof initial === "function" ? initial() : initial;
        return [state[current], (value) => { state[current] = typeof value === "function" ? value(state[current]) : value; }];
      } },
      "next/link": { __esModule: true, default: "a" },
      "next/dynamic": { __esModule: true, default: () => () => null },
      "next/navigation": { useParams: () => ({ id: "1" }), useRouter: () => ({ push() {}, refresh() {} }), useSearchParams: () => new URLSearchParams() },
      "@/app/gigs/[id]/nominations/actions": { updateNominationViewAction() {} },
      sonner: { toast: {} },
    });
    const props = { initialSongs: [{ ...song, responses: [response("기타", stale ? before : confirmed)] }], initialUserId: "member", initialPerformer: performers[0], initialPerformers: performers, initialGigInfo: { title: "공연" }, initialLastViewedTimestamp: confirmed };
    const render = (overrides = {}) => { index = 0; return NominationPanel({ ...props, ...overrides }); };
    if (compact) {
      const toggle = nodes(render(), (node) => node.type === "button" && node.props["aria-label"] === "간략 보기")[0];
      assert.ok(toggle);
      toggle.props.onClick();
    }
    const html = renderToStaticMarkup(render());
    assert.equal(html.includes("응답 후 수정됨"), stale, `compact=${compact}, stale=${stale}`);
    }
  }
});
