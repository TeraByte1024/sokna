import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as nomination from "../lib/nomination.ts";
import * as statusIcons from "../components/ui/status-icons.ts";

function fixture({ mobile = false } = {}) {
  const require = createRequire(import.meta.url);
  const state = [];
  let stateIndex = 0;
  let linkClicks = 0;
  const mocks = {
    react: { useState: (initial) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = initial;
      return [state[index], (value) => { state[index] = value; }];
    } },
    "next/link": { __esModule: true, default: "a" },
    "@/lib/nomination": nomination,
    "@/components/ui/status-icons": statusIcons,
    "@/lib/use-mobile-layout": { useMobileLayout: () => mobile },
    "@/components/admin/song-response-details-dialog": { SongResponseDetailsDialog: "response-dialog" },
    "@/components/admin/response-performer-legend-dialog": { ResponsePerformerLegendDialog: "legend-dialog" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dropdown-menu": {
      DropdownMenu: "dropdown-root", DropdownMenuTrigger: "dropdown-trigger", DropdownMenuContent: "dropdown-content",
      DropdownMenuRadioGroup: "session-radio-group", DropdownMenuRadioItem: "session-radio-item",
    },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h2" },
  };
  const filename = new URL("../components/admin/performer-song-responses.tsx", import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
  );
  return {
    render: (props) => { stateIndex = 0; return loaded.exports.PerformerSongResponses(props); },
    rowTarget: { querySelector: () => ({ click: () => { linkClicks++; } }) },
    get linkClicks() { return linkClicks; },
  };
}

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

function readMemoEntries(tree, render, props) {
  const button = elements(tree, (node) => node.type === "button" && node.props["aria-label"]?.endsWith("메모 보기"))[0];
  if (!button) return [];
  assert.doesNotMatch(button.props.className, /sm:hidden/);
  button.props.onClick();
  const dialog = elements(render(props), (node) => node.type === "response-dialog")[0];
  const entries = dialog.props.entries;
  dialog.props.onClose();
  return entries;
}

function selectPeople(render, props, ids) {
  elements(render(props), (node) => node.type === "button" && node.props.children === "전체 해제")[0].props.onClick();
  for (const id of ids) {
    elements(render(props), (node) => node.type === "input" && node.props["data-performer-id"] === id)[0].props.onChange();
  }
}

const props = {
  gigId: 7,
  performers: [
    { id: 1, userId: "multi", name: "복수 세션", part: "기타, 건반" },
    { id: 2, userId: "drums", name: "드럼 공연자", part: "드럼" },
    { id: 3, userId: null, name: "복수 세션", part: "기타" },
  ],
  songs: [
    { id: 10, title: "첫 곡", artist: "아티스트", requiredParts: ["기타", "건반"], recommendedVocals: [], responses: [
      { userId: "multi", sessionPart: "기타", status: "available", comment: "기타 메모" },
      { userId: "multi", sessionPart: "건반", status: "unavailable", comment: "건반 메모" },
      { userId: "drums", sessionPart: "기타", status: "available", comment: "이전 배정 메모" },
    ] },
    { id: 11, title: "둘째 곡", requiredParts: ["기타"], recommendedVocals: [], responses: [] },
  ],
};

test("performer selection scopes session statuses and notes, and song rows navigate directly", () => {
  const view = fixture();
  const { render } = view;
  elements(render(props), (node) => node.type === "session-radio-group")[0].props.onValueChange("기타");
  selectPeople(render, props, [1]);
  const tree = render(props);
  const html = renderToStaticMarkup(tree);
  assert.doesNotMatch(html, /기타 메모|건반 메모/);
  assert.deepEqual(readMemoEntries(tree, render, props).map((entry) => entry.existingResponse?.comment), ["기타 메모"]);
  assert.equal(elements(tree, (node) => node.type === "button" && node.props["aria-label"]?.endsWith("메모 보기")).length, 1);
  assert.match(html, /aria-label="1번 · 복수 세션 · 기타 · 가능"/);
  assert.match(html, /aria-label="1번 · 복수 세션 · 기타 · 미응답"/);
  assert.match(html, /2곡 중 1곡 응답/);
  assert.doesNotMatch(renderToStaticMarkup(elements(tree, (node) => node.type === "p" && node.props.className === "px-4 py-3 text-sm text-muted-foreground")[0]), /복수 세션/);
  assert.match(html, /href="\/gigs\/7\/nominations\?song=10"/);
  const row = elements(tree, (node) => node.type === "tr" && node.props.onClick)[0];
  row.props.onClick({ target: { closest: () => ({}) } });
  assert.equal(view.linkClicks, 0); // The native link handles its own click.
  const previousWindow = globalThis.window;
  globalThis.window = { getSelection: () => null };
  try {
    row.props.onClick({ target: { closest: () => null }, currentTarget: view.rowTarget });
    assert.equal(view.linkClicks, 1); // Reuse link navigation so unsaved-edit interception still applies.
  } finally { globalThis.window = previousWindow; }
  const drumProps = { ...props, songs: [...props.songs, { id: 12, title: "드럼 곡", requiredParts: ["드럼"], recommendedVocals: [], responses: [] }] };
  elements(render(drumProps), (node) => node.type === "session-radio-group")[0].props.onValueChange("드럼");
  selectPeople(render, drumProps, [2]);
  const drumHtml = renderToStaticMarkup(render(drumProps));
  assert.doesNotMatch(drumHtml, /해당 세션 없음/);
  assert.doesNotMatch(drumHtml, /기타 메모|건반 메모|이전 배정 메모/);
  assert.doesNotMatch(drumHtml, /nominations\?song=10|nominations\?song=11/);
  assert.match(drumHtml, /nominations\?song=12/);
});

test("session-only selection lists the eligible roster; combined selection isolates a performer's session", () => {
  const { render } = fixture();
  elements(render(props), (node) => node.type === "session-radio-group")[0].props.onValueChange("기타");
  const sessionTree = render(props);
  const html = renderToStaticMarkup(sessionTree);
  assert.match(html, /기타 선택 공연자/);
  assert.doesNotMatch(html, /기타 메모/);
  assert.equal(readMemoEntries(sessionTree, render, props)[0].existingResponse.comment, "기타 메모");
  assert.match(html, /계정 미연결/);
  assert.doesNotMatch(html, /건반 메모|이전 배정 메모/);
  assert.match(html, /첫 곡<span class="font-normal text-muted-foreground"> · 아티스트<\/span>/);
  selectPeople(render, props, [1]);
  const combinedTree = render(props);
  const combined = renderToStaticMarkup(combinedTree);
  assert.deepEqual(readMemoEntries(combinedTree, render, props).map((entry) => entry.existingResponse?.comment), ["기타 메모"]);
  assert.doesNotMatch(combined, /건반 메모|계정 미연결/);
  elements(render(props), (node) => node.type === "session-radio-group")[0].props.onValueChange("건반");
  const keyboardTree = render(props);
  const keyboard = renderToStaticMarkup(keyboardTree);
  assert.deepEqual(readMemoEntries(keyboardTree, render, props).map((entry) => entry.existingResponse?.comment), ["건반 메모"]);
  assert.doesNotMatch(keyboard, /기타 메모/);
  assert.match(keyboard, /2곡 중 1곡 응답/);
  assert.match(keyboard, /nominations\?song=10/);
  assert.doesNotMatch(keyboard, /nominations\?song=11|둘째 곡/);
  assert.ok(elements(render(props), (node) => node.type === "input").every((node) => node.props.checked));
  selectPeople(render, props, [1]);
  assert.match(renderToStaticMarkup(render(props)), /2곡 중 1곡 응답/); // Individual count still spans all eligible sessions.
});

test("mobile rows open full response details without navigating and remove the all-sessions option", () => {
  const view = fixture({ mobile: true });
  const { render } = view;
  selectPeople(render, props, [1]);
  const tree = render(props);
  const sessionSelect = elements(tree, (node) => node.type === "session-radio-group")[0];
  assert.notEqual(sessionSelect.props.value, "");
  assert.equal(elements(sessionSelect, (node) => node.type === "session-radio-item" && node.props.value === "").length, 0);
  sessionSelect.props.onValueChange("건반");
  assert.equal(elements(render(props), (node) => node.type === "tr" && node.props.onClick).length, 1);
  const previousWindow = globalThis.window;
  globalThis.window = { getSelection: () => null };
  try {
    elements(tree, (node) => node.type === "tr" && node.props.onClick)[0].props.onClick({ target: { closest: () => null }, currentTarget: view.rowTarget });
  } finally { globalThis.window = previousWindow; }
  assert.equal(view.linkClicks, 0);
  const dialog = elements(render(props), (node) => node.type === "response-dialog")[0];
  assert.equal(dialog.props.song.id, 10);
  assert.equal(dialog.props.song.artist, "아티스트");
  assert.ok(dialog.props.entries.every((entry) => entry.performer.userId === "multi"));
  assert.equal(dialog.props.entries.length, 1);
  dialog.props.onClose();
  assert.equal(elements(render(props), (node) => node.type === "response-dialog").length, 0);
});

test("unlinked performers cannot inherit a namesake's responses; empty and failed loads are explicit", () => {
  const { render } = fixture();
  elements(render(props), (node) => node.type === "session-radio-group")[0].props.onValueChange("기타");
  selectPeople(render, props, [3]);
  const html = renderToStaticMarkup(render(props));
  assert.match(html, /계정 미연결/);
  assert.match(html, /2곡 중 0곡 응답/);
  assert.doesNotMatch(html, /기타 메모|건반 메모/);
  assert.match(renderToStaticMarkup(render({ ...props, songs: [] })), /등록된 후보곡이 없습니다/);
  assert.match(renderToStaticMarkup(render({ ...props, performers: [] })), /확정된 공연자가 없습니다/);
  assert.match(renderToStaticMarkup(render({ ...props, loadError: true })), /role="alert"/);
});

test("session-first selection list contains only eligible people and resets to everyone when the session changes", () => {
  const { render } = fixture();
  let tree = render(props);
  const selects = elements(tree, (node) => node.type === "session-radio-group");
  assert.equal(selects[0].props["aria-label"], "세션 선택 목록");
  assert.equal(elements(selects[0], (node) => node.type === "session-radio-item" && node.props.value === "").length, 0);
  selects[0].props.onValueChange("기타");
  tree = render(props);
  assert.deepEqual(elements(tree, (node) => node.type === "input").map((node) => node.props["data-performer-id"]), [1, 3]);
  selectPeople(render, props, [3]);
  elements(render(props), (node) => node.type === "session-radio-group")[0].props.onValueChange("건반");
  const nextInputs = elements(render(props), (node) => node.type === "input");
  assert.deepEqual(nextInputs.map((node) => node.props["data-performer-id"]), [1]);
  assert.ok(nextInputs.every((node) => node.props.checked));
});

test("five-column slots preserve order across songs but selection reassigns numbers and supports reordering", () => {
  const view = fixture();
  const performers = Array.from({ length: 7 }, (_, index) => ({ id: index + 1, userId: `user-${index + 1}`, name: `공연자 ${index + 1}`, part: "기타" }));
  const rosterProps = {
    gigId: 7, performers,
    songs: [
      { id: 20, title: "보컬 A", requiredParts: ["보컬"], recommendedVocals: performers, responses: performers.toReversed().map((item) => ({ userId: item.userId, sessionPart: "보컬", status: item.id % 2 ? "available" : "unavailable" })) },
      { id: 21, title: "보컬 B", requiredParts: ["보컬"], recommendedVocals: [performers[1], performers[5]], responses: [] },
    ],
  };
  let tree = view.render(rosterProps);
  const rows = elements(tree, (node) => node.type === "tr" && node.props.onClick);
  for (const row of rows) {
    const grid = elements(row, (node) => node.props?.className?.includes("grid-cols-5"))[0];
    const slots = elements(grid, (node) => node.props?.["data-performer-number"]);
    assert.deepEqual(slots.map((node) => node.props["data-performer-number"]), [1, 2, 3, 4, 5, 6, 7]);
  }
  const secondSlots = elements(rows[1], (node) => node.props?.["data-performer-number"]);
  assert.equal(secondSlots[0].props["aria-hidden"], "true");
  assert.match(renderToStaticMarkup(secondSlots[1]), /2번 · 공연자 2 · 보컬 · 미응답/);
  assert.match(renderToStaticMarkup(secondSlots[5]), /6번 · 공연자 6 · 보컬 · 미응답/);
  elements(tree, (node) => node.type === "button" && node.props["aria-label"] === "응답 번호별 공연자 안내")[0].props.onClick();
  const legend = elements(view.render(rosterProps), (node) => node.type === "legend-dialog")[0];
  assert.equal(legend.props.sessionPart, "보컬");
  assert.deepEqual(legend.props.performers.map((item) => item.id), [1, 2, 3, 4, 5, 6, 7]);
  legend.props.onClose();
  assert.equal(elements(view.render(rosterProps), (node) => node.type === "legend-dialog").length, 0);
  selectPeople(view.render, rosterProps, [6]);
  tree = view.render(rosterProps);
  for (const row of elements(tree, (node) => node.type === "tr" && node.props.onClick)) {
    const slots = elements(row, (node) => node.props?.["data-performer-number"]);
    assert.equal(slots.filter((node) => node.type === "span" && !node.props["aria-hidden"]).length, 1);
    assert.equal(slots.length, 1);
    assert.match(renderToStaticMarkup(slots[0]), /1번 · 공연자 6/);
  }
  selectPeople(view.render, rosterProps, [6, 2]);
  tree = view.render(rosterProps);
  elements(tree, (node) => node.type === "button" && node.props["aria-label"] === "공연자 2 응답 순서 위로")[0].props.onClick();
  tree = view.render(rosterProps);
  for (const row of elements(tree, (node) => node.type === "tr" && node.props.onClick)) {
    const slots = elements(row, (node) => node.props?.["data-performer-number"]);
    assert.equal(slots.length, 2);
    assert.match(renderToStaticMarkup(slots[0]), /1번 · 공연자 2/);
    assert.match(renderToStaticMarkup(slots[1]), /2번 · 공연자 6/);
  }
  elements(tree, (node) => node.type === "button" && node.props["aria-label"] === "응답 번호별 공연자 안내")[0].props.onClick();
  assert.deepEqual(elements(view.render(rosterProps), (node) => node.type === "legend-dialog")[0].props.performers.map((item) => item.id), [2, 6]);
  elements(view.render(rosterProps), (node) => node.type === "legend-dialog")[0].props.onClose();
  selectPeople(view.render, rosterProps, []);
  tree = view.render(rosterProps);
  assert.equal(elements(tree, (node) => node.type === "tr" && node.props.onClick).length, 0);
  assert.match(renderToStaticMarkup(tree), /응답을 확인할 공연자를 선택해 주세요/);
  assert.match(renderToStaticMarkup(tree), /2곡 중 0곡 응답/);
});

test("shared radio dropdown puts local custom sessions after standard sessions and aliases", () => {
  const { render } = fixture();
  const customProps = { ...props, songs: [{ ...props.songs[0], requiredParts: ["코러스", "기타", "드럼", "keyboard", "첼로"] }] };
  const tree = render(customProps);
  const menu = elements(tree, (node) => node.type === "session-radio-group")[0];
  assert.deepEqual(elements(menu, (node) => node.type === "session-radio-item").map((node) => node.props.value), ["기타", "드럼", "keyboard", "코러스", "첼로"]);
  assert.equal(menu.props.value, "기타");
  const trigger = elements(tree, (node) => node.type === "button" && node.props.id === "song-response-session")[0];
  assert.equal(trigger.props.variant, "outline");
  assert.equal(trigger.props["aria-label"], "세션 선택");
  menu.props.onValueChange("코러스");
  assert.equal(elements(render(customProps), (node) => node.type === "session-radio-group")[0].props.value, "코러스");
  assert.ok(elements(render(customProps), (node) => node.type === "input").every((node) => node.props.checked));
});
