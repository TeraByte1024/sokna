import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import * as nomination from "../lib/nomination.ts";
import * as statusIcons from "../components/ui/status-icons.ts";

const performers = [
  { id: 1, userId: "keyboard-user", name: "건반 참여자", part: "건반" },
  { id: 2, userId: "drum-user", name: "드럼 참여자", part: "드럼" },
];
const song = {
  id: 1, gigId: 1, title: "후보곡", artist: "아티스트", requiredParts: ["기타"],
  recommendedVocals: [], sheetExists: false, description: "", links: [], responses: [],
  orderNum: 0, createdBy: null, createdAt: "2026-10-05", updatedAt: "2026-10-05",
};

// Render the real drawer with its domain logic; isolate browser effects and services.
function drawerFixture() {
  const require = createRequire(import.meta.url);
  const state = [];
  let stateIndex = 0;
  const noop = () => {};
  const mocks = {
    react: {
      useEffect: noop,
      useMemo: (fn) => fn(),
      useRef: (value) => ({ current: value }),
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
    },
    "@/lib/nomination": nomination,
    "@/components/ui/status-icons": statusIcons,
    "@/lib/supabase/client": { createClient: () => ({}) },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/badge": { Badge: "span" },
    "@/components/nominations/nomination-response-section": { NominationResponseSection: () => null },
    "@/components/nominations/external-link-card": { ExternalLinkCard: () => null, detectServiceInfo: noop },
  };
  const filename = new URL("../components/nominations/nomination-drawer.tsx", import.meta.url);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename: filename.pathname })(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
  );
  return (props) => {
    stateIndex = 0;
    return loaded.exports.NominationDrawer({ song, performers, onClose: noop, ...props });
  };
}

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

test("unassigned standard sessions and their aliases remain restricted sessions", () => {
  for (const part of ["기타", "보컬(남)", "보컬(여)", "베이스", "드럼", "건반", "키보드", "피아노", "guitar", "일렉기타"]) {
    assert.equal(nomination.isLocalCustomSession(part, []), false, part);
  }
  assert.equal(nomination.isLocalCustomSession("기타", ["건반", "드럼"]), false);
});

test("only an unassigned custom session is open to all gig performers", () => {
  assert.equal(nomination.isLocalCustomSession("바이올린", ["건반", "드럼"]), true);
  assert.equal(nomination.isLocalCustomSession("바이올린", ["바이올린", "건반"]), false);
  assert.deepEqual(
    nomination.getEligibleSessionsForUser({ ...song, requiredParts: ["기타", "건반", "바이올린"] }, performers, "keyboard-user")
      .map((item) => item.sessionPart),
    ["건반", "바이올린"],
  );
});

test("guitar response list and shortage chip exclude keyboard performers when guitar is unassigned", () => {
  const tree = drawerFixture()({});
  const html = renderToStaticMarkup(tree);
  assert.match(html, /기타 가능 여부/);
  assert.doesNotMatch(html, />건반 참여자<|>드럼 참여자</);
  const chip = elements(tree, (node) => node.type === "button" && node.props.title?.startsWith("기타 참여자 응답 현황"))[0];
  assert.match(chip.props.className, /rose/);
});

test("session switching keeps members and responses scoped to the selected session", () => {
  const render = drawerFixture();
  const guitarist = { id: 3, userId: "guitar-user", name: "기타 참여자", part: "기타" };
  const props = {
    performers: [...performers, guitarist],
    song: { ...song, requiredParts: ["기타", "건반"], responses: [
      { id: 1, userId: "keyboard-user", sessionPart: "건반", status: "available", comment: "건반 메모" },
      { id: 2, userId: "guitar-user", sessionPart: "기타", status: "unavailable", comment: "기타 메모" },
    ] },
  };
  const tree = render(props);
  const html = renderToStaticMarkup(tree);
  assert.match(html, />기타 참여자</);
  assert.match(html, /기타 메모/);
  assert.doesNotMatch(html, />건반 참여자<|건반 메모/);
  elements(tree, (node) => node.type === "button" && node.props.title?.includes("건반"))[0].props.onClick();
  const keyboardHtml = renderToStaticMarkup(render(props));
  assert.match(keyboardHtml, />건반 참여자</);
  assert.match(keyboardHtml, /건반 메모/);
  assert.doesNotMatch(keyboardHtml, />기타 참여자<|기타 메모/);
});

test("saved guitar responses cannot add a keyboard performer to a roster with four guitarists", () => {
  const guitarists = Array.from({ length: 4 }, (_, index) => ({
    id: index + 3, userId: `guitar-${index}`, name: `기타 연주자 ${index}`, part: "기타",
  }));
  const props = {
    performers: [...performers, ...guitarists],
    song: { ...song, requiredParts: ["기타", "기타", "건반"], responses: [
      { id: 1, userId: "keyboard-user", sessionPart: "기타", status: "undecided", comment: "이전 기타 응답",
        user: { name: "건반 참여자", part: "건반", generation: 40 } },
      { id: 2, userId: "guitar-0", sessionPart: "기타", status: "available", comment: "연주 가능",
        user: { name: "기타 연주자 0", part: "건반", generation: 41 } },
    ] },
  };
  const html = renderToStaticMarkup(drawerFixture()(props));
  for (const guitarist of guitarists) assert.ok(html.includes(`>${guitarist.name}<`));
  assert.doesNotMatch(html, />건반 참여자<|이전 기타 응답/);
  assert.match(html, /가능 1명/);
  assert.match(html, /미응답 3명/);
  assert.match(html, /연주 가능/);
});

test("responses from former gig performers cannot add members to the current list", () => {
  for (const sessionPart of ["기타", "바이올린"]) {
    const html = renderToStaticMarkup(drawerFixture()({
      song: { ...song, requiredParts: [sessionPart], responses: [
        { id: 1, userId: "former-user", sessionPart, status: "available", comment: "과거 메모",
          user: { name: "이전 참여자", part: "기타", generation: 39 } },
      ] },
    }));
    assert.doesNotMatch(html, /이전 참여자|과거 메모/);
  }
});

test("unassigned custom session still lists all gig performers", () => {
  const html = renderToStaticMarkup(drawerFixture()({ song: { ...song, requiredParts: ["바이올린"] } }));
  assert.match(html, />건반 참여자</);
  assert.match(html, />드럼 참여자</);
});
