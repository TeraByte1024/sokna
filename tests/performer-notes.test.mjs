import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

function selectorFixture(extra = {}) {
  const require = createRequire(import.meta.url);
  const state = [];
  let stateIndex = 0;
  const mocks = {
    react: { useState: (value) => {
      const index = stateIndex++;
      if (!(index in state)) state[index] = value;
      return [state[index], (next) => { state[index] = next; }];
    }, useMemo: (fn) => fn() },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/dropdown-menu": Object.fromEntries(["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuLabel", "DropdownMenuSeparator", "DropdownMenuTrigger"].map((name) => [name, () => null])),
    "@/lib/supabase/client": { createClient: () => ({}) },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "@/components/gigs/performer-mapping-dialog": { PerformerMappingDialog: () => null },
    "@/components/gigs/session-assignment-dialog": { SessionAssignmentDialog: () => null },
    "@/components/gigs/performer-session-search": { PerformerSessionSearch: () => null },
    "@/components/gigs/performer-details-dialog": { PerformerDetailsDialog: "detail-dialog" },
    "@/components/gigs/performer-delete-dialog": { PerformerDeleteDialog: "delete-dialog" },
    sonner: { toast: {} },
  };
  const source = ts.transpileModule(readFileSync(new URL("../components/performer-selector.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
  );
  return () => { stateIndex = 0; return loaded.exports.PerformerSelector({
    search: "", results: [],
    selected: [
      { id: "member-b", performerId: 2, name: "동명이인", generation: 41, part: "기타" },
      { id: "member-a", performerId: 1, name: "동명이인", generation: 40, part: "건반" },
      { performerId: 3, name: "동명이인", email: "temp-3", part: "드럼" },
    ],
    performerNotes: { "member-a": "  건반 신청 메모  ", "member-b": "기타 신청 메모", "동명이인": "이름으로 잘못 연결된 비고" },
    ...extra,
  }); };
}

function renderSelector(extra = {}) { return renderToStaticMarkup(selectorFixture(extra)()); }

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((node) => elements(node, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

test("sorted namesake participants keep their own notes and only unlinked rows offer account mapping", () => {
  const html = renderSelector();
  assert.match(html, />비고<\/th>/);
  const rows = html.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/g).slice(1);
  assert.match(rows[0], /40기/);
  assert.match(rows[0], /title="건반 신청 메모"/);
  assert.doesNotMatch(rows[0], /기타 신청 메모|매핑 변경/);
  assert.match(rows[1], /41기/);
  assert.match(rows[1], /title="기타 신청 메모"/);
  assert.doesNotMatch(rows[1], /건반 신청 메모|매핑 변경/);
  assert.match(rows[2], />연동<\/span>/);
  assert.doesNotMatch(rows[2], /신청 메모/);
  assert.equal((html.match(/>연동됨<\/span>/g) || []).length, 2);
  assert.doesNotMatch(html, /이름으로 잘못 연결된 비고/);
});

test("unavailable RSVP reads are visibly different from empty notes", () => {
  const failed = renderSelector({ performerNotesLoadError: true });
  assert.equal((failed.match(/>조회 실패<\/span>/g) || []).length, 3);
  assert.doesNotMatch(failed, /title="건반 신청 메모"/);
  const empty = renderSelector({ performerNotes: {} });
  assert.doesNotMatch(empty, /신청 메모|조회 실패/);
});

test("sorted performer deletion requires confirmation and cancellation preserves the roster", () => {
  const removed = [];
  const render = selectorFixture({ onRemove: (index) => removed.push(index) });
  const deleteButton = () => elements(render(), (node) => node.props?.["aria-label"] === "동명이인 삭제")[0];
  deleteButton().props.onClick();
  assert.deepEqual(removed, []);
  let dialog = elements(render(), (node) => node.type === "delete-dialog")[0];
  assert.ok(dialog);
  dialog.props.onClose();
  assert.deepEqual(removed, []);
  assert.equal(elements(render(), (node) => node.type === "delete-dialog").length, 0);
  deleteButton().props.onClick();
  dialog = elements(render(), (node) => node.type === "delete-dialog")[0];
  dialog.props.onConfirm();
  assert.deepEqual(removed, [1]); // Sorted first row is the original second performer.
});

test("row details keep account notes and apply session edits to the original sorted row", () => {
  const updates = [];
  const render = selectorFixture({ onUpdatePart: (index, part) => updates.push([index, part]) });
  const row = elements(render(), (node) => node.type === "tr" && node.props.onClick)[0];
  row.props.onClick({ target: { closest: () => null } });
  const detail = elements(render(), (node) => node.type === "detail-dialog")[0];
  assert.equal(detail.props.performer.id, "member-a");
  assert.equal(detail.props.note.trim(), "건반 신청 메모");
  detail.props.onSave("건반, 기타");
  assert.deepEqual(updates, [[1, "건반, 기타"]]);
  assert.equal(elements(render(), (node) => node.type === "detail-dialog").length, 0);
  row.props.onClick({ target: { closest: () => ({}) } });
  assert.equal(elements(render(), (node) => node.type === "detail-dialog").length, 0);
});
