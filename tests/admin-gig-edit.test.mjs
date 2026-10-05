import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import { test } from "node:test";
import ts from "typescript";

function load(relativePath, mocks) {
  const require = createRequire(import.meta.url);
  const source = ts.transpileModule(readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`)(
    (name) => Object.hasOwn(mocks, name) ? mocks[name] : require(name), loaded, loaded.exports,
  );
  return loaded.exports;
}

const navigation = {
  redirect: (href) => { throw new Error(`redirect:${href}`); },
  notFound: () => { throw new Error("not-found"); },
};

test("legacy edit URLs lead admins to the integrated form and reject unauthorized or invalid requests", async () => {
  for (const admin of [true, false]) {
    const { default: Page } = load("app/gigs/[id]/edit/page.tsx", {
      "next/navigation": navigation,
      "@/lib/auth-admin": { getIsAdmin: async () => admin },
    });
    await assert.rejects(Page({ params: Promise.resolve({ id: "7" }) }), {
      message: admin ? "redirect:/admin/gigs/7#gig-basic-info" : "redirect:/gigs/7",
    });
    for (const id of ["0", "invalid", "-1", "1.5"]) {
      await assert.rejects(Page({ params: Promise.resolve({ id }) }), { message: "not-found" });
    }
  }
});

function sectionFixture({ failedTable, admin = true } = {}) {
  const filters = [];
  const { GigEditSection } = load("components/gigs/gig-edit-section.tsx", {
    "next/navigation": navigation,
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/lib/gig-visibility": { getGigVisibility: () => "members" },
    "@/components/gigs/gig-edit-form": { GigEditForm: "edit-form" },
    "@/lib/gig-server-data": { getGigRow: async () => ({ data: { id: 7, title: "공연", perform_date: "2026-10-05" }, error: null }) },
    "@/lib/supabase/server": { createClient: async () => ({ from(table) {
      const query = {
        select: () => query,
        eq: (column, value) => { filters.push([table, column, value]); return query; },
        order: () => query,
        then(resolve) {
          const data = table === "performers" ? [
            { id: 11, user_id: "member", name: "이전 이름", part: "기타", users: { name: "현재 이름", email: "member@example.com", generation: 40 } },
            { id: 12, user_id: null, name: "미연동 이름", part: "건반", users: null },
          ] : [{ id: 13, title: "곡", artist: "아티스트", session_members: "기타: 현재 이름", order_num: 1 }];
          return Promise.resolve(resolve(table === failedTable ? { data: null, error: { message: "조회 오류" } } : { data, error: null }));
        },
      };
      return query;
    } }) },
  });
  return { render: () => GigEditSection({ gigId: "7", performerNotes: { member: "신청 메모" }, performerNotesLoadError: false }), filters };
}

test("integrated edit loader retains row identities, account links and setlists", async () => {
  const { render, filters } = sectionFixture();
  const tree = await render();
  assert.equal(tree.type, "edit-form");
  assert.equal(tree.props.embedded, true);
  assert.equal(tree.props.gig.id, 7);
  assert.deepEqual(tree.props.performerNotes, { member: "신청 메모" });
  assert.equal(tree.props.performerNotesLoadError, false);
  assert.equal(tree.props.initialPerformers[0].performerId, 11);
  assert.equal(tree.props.initialPerformers[0].id, "member");
  assert.equal(tree.props.initialPerformers[0].name, "현재 이름");
  assert.equal(tree.props.initialPerformers[1].performerId, 12);
  assert.equal(tree.props.initialPerformers[1].id, undefined);
  assert.equal(tree.props.initialPerformers[1].name, "미연동 이름");
  assert.equal(tree.props.initialSetlists[0].id, 13);
  assert.deepEqual(filters, [["performers", "gig_id", 7], ["setlists", "gig_id", 7]]);
});

test("failed roster or setlist reads cannot render an empty destructive edit form", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    for (const failedTable of ["performers", "setlists"]) {
      const tree = await sectionFixture({ failedTable }).render();
      assert.equal(tree.type, "p");
      assert.equal(tree.props.role, "alert");
    }
  } finally { console.error = originalError; }
  await assert.rejects(sectionFixture({ admin: false }).render(), { message: "redirect:/gigs/7" });
});
