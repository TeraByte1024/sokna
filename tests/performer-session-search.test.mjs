import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

const optionName = (option) => elements(option, (node) => node.type === "span" && node.props.className === "font-medium")[0]?.props.children;

function fixture(currentParts = []) {
  const state = [];
  const added = [];
  let index = 0;
  const require = createRequire(import.meta.url);
  const noop = () => {};
  const mocks = {
    react: {
      useId: () => "session-test", useEffect: noop, useCallback: (fn) => fn,
      useRef(initial) {
        const slot = index++;
        if (!(slot in state)) state[slot] = { current: initial };
        return state[slot];
      },
      useState(initial) {
        const slot = index++;
        if (!(slot in state)) state[slot] = initial;
        return [state[slot], (next) => { state[slot] = typeof next === "function" ? next(state[slot]) : next; }];
      },
    },
    "react-dom": { createPortal: (content) => ({ type: "portal", props: { children: content } }) },
    "@/components/ui/input": { Input: "input" },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
  };
  const loaded = { exports: {} };
  const source = ts.transpileModule(readFileSync(new URL("../components/gigs/performer-session-search.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInThisContext(`(function(require,module,exports,window,document){${source}\n})`)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
    { innerWidth: 390, innerHeight: 844 }, { body: {} },
  );
  let tree;
  const render = () => {
    index = 0;
    tree = loaded.exports.PerformerSessionSearch({ currentParts, onAddPart: (part) => added.push(part) });
    tree.props.ref.current = { getBoundingClientRect: () => ({ left: 310, top: 720, bottom: 744 }) };
    return tree;
  };
  const input = () => elements(tree, (node) => node.type === "input")[0];
  const options = () => elements(tree, (node) => node.props?.role === "option");
  const query = (value) => { input().props.onChange({ target: { value } }); render(); };
  const key = (key, isComposing = false) => {
    let prevented = false;
    input().props.onKeyDown({ key, nativeEvent: { isComposing }, preventDefault: () => { prevented = true; }, stopPropagation: noop });
    render();
    return prevented;
  };
  render();
  const open = () => {
    elements(tree, (node) => node.props?.["aria-label"] === "세션 검색 및 추가")[0].props.onClick();
    render();
  };
  return { open, render, query, key, input, options, added, get tree() { return tree; } };
}

test("add chip expands into a combobox with only representative session suggestions", () => {
  const f = fixture(["기타"]);
  assert.equal(f.input(), undefined);
  const trigger = elements(f.tree, (node) => node.props?.["aria-label"] === "세션 검색 및 추가")[0];
  assert.equal(trigger.props.children[0].type.render.name, "Plus");
  f.open();
  assert.equal(f.input().props.role, "combobox");
  assert.equal(f.input().props["aria-expanded"], true);
  assert.deepEqual(f.options().map(optionName), ["보컬(남)", "보컬(여)", "기타", "베이스", "드럼", "건반"]);
  assert.equal(f.options().find((option) => optionName(option) === "기타").props.disabled, true);
  assert.ok(f.options().every((option) => optionName(option)));
  assert.equal(f.tree.props.children[0].type, "button");
  assert.match(f.tree.props.children[0].props.className, /invisible/);
  assert.equal(f.tree.props.children[1].type, "portal");
  const portalInput = elements(f.tree.props.children[1], (node) => node.type === "input")[0];
  assert.ok(portalInput);
  const popup = elements(f.tree, (node) => node.props?.role === "listbox")[0];
  assert.equal(popup.props.style.position, "fixed");
  assert.ok(popup.props.style.left + popup.props.style.width <= 390 - 8);
  assert.equal(popup.props.style.bottom, 844 - 720 + 4);
});

test("excluded names find the representative family without becoming preset rows", () => {
  for (const [query, family] of [["일렉기타", "기타"], ["어쿠스틱기타", "기타"], ["피아노", "건반"], ["신디사이저", "건반"], ["브라스", "건반"]]) {
    const f = fixture();
    f.open(); f.query(query);
    assert.equal(optionName(f.options()[0]), family);
    assert.equal(f.key("Enter"), true);
    assert.deepEqual(f.added, [family]);
    assert.equal(f.input(), undefined);
  }
});

test("custom names including excluded presets can still be entered verbatim", () => {
  for (const part of ["바이올린", "색소폰", "일렉기타", "어쿠스틱기타", "신디사이저", "브라스"]) {
    const f = fixture();
    f.open(); f.query(part);
    f.options().at(-1).props.onClick();
    assert.deepEqual(f.added, [part]);
  }
});

test("duplicate and comma-separated parts are blocked and keyboard is normalized", () => {
  for (const part of ["기타", "키보드", "바이올린, 첼로"]) {
    const f = fixture(["기타", "건반"]);
    f.open(); f.query(part); f.key("Enter");
    assert.deepEqual(f.added, []);
  }
  const f = fixture();
  f.open(); f.query("키보드"); f.key("Enter");
  assert.deepEqual(f.added, ["건반"]);
});

test("IME Enter is ignored while arrow keys select results and Escape cancels", () => {
  const f = fixture();
  f.open(); f.query("기타"); f.key("Enter", true);
  assert.deepEqual(f.added, []);
  f.query(""); f.key("ArrowDown"); f.key("ArrowDown"); f.key("Enter");
  assert.deepEqual(f.added, ["기타"]);
  f.open(); f.query("첼로"); f.key("Escape");
  assert.equal(f.input(), undefined);
  assert.deepEqual(f.added, ["기타"]);
});

test("keyboard navigation skips already assigned sessions without hiding them", () => {
  const f = fixture(["기타"]);
  f.open(); f.key("ArrowDown"); f.key("ArrowDown"); f.key("Enter");
  assert.deepEqual(f.added, ["베이스"]);
});

test("gig form performer suggestions retain guitar and keyboard families", () => {
  // Compile only the exported pure family matcher, avoiding unrelated service/UI imports.
  const source = readFileSync(new URL("../components/gigs/gig-form.tsx", import.meta.url), "utf8");
  const start = source.indexOf("export function isPerformerInSessionFamily");
  const end = source.indexOf("const DEFAULT_SESSION_SLOTS", start);
  const output = ts.transpileModule(source.slice(start, end), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(exports){${output}\n})`)(loaded.exports);
  for (const part of ["일렉기타", "어쿠스틱기타"]) assert.equal(loaded.exports.isPerformerInSessionFamily({ part }, "기타"), true);
  for (const part of ["피아노", "신디사이저", "브라스"]) assert.equal(loaded.exports.isPerformerInSessionFamily({ part }, "건반"), true);
});
