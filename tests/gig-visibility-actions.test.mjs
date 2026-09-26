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

// Exercise the real actions and visibility validation with isolated Next/Supabase boundaries.
function loadSource(relativePath, mocks, cache = new Map()) {
  const filename = path.join(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loadedModule = { exports: {} };
  cache.set(filename, loadedModule);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const localRequire = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const resolved = [base, `${base}.ts`, `${base}.tsx`].find(existsSync);
      if (resolved) return loadSource(path.relative(root, resolved), mocks, cache);
    }
    return requireDependency(name);
  };
  vm.runInThisContext(`(function(require,module,exports){${source}\n})`, { filename })(localRequire, loadedModule, loadedModule.exports);
  return loadedModule.exports;
}

function actionsFixture({ admin = true } = {}) {
  const writes = [];
  const invalidations = [];
  const client = {
    from(table) {
      let write;
      const query = {
        select() { return query; },
        eq(column, value) {
          if (write) write.filters.push([column, value]);
          return query;
        },
        insert(payload) {
          write = { operation: "insert", table, payload, filters: [] };
          writes.push(write);
          return query;
        },
        update(payload) {
          write = { operation: "update", table, payload, filters: [] };
          writes.push(write);
          return query;
        },
        single: async () => ({ data: { id: 42 }, error: null }),
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return query;
    },
  };
  const actions = loadSource("app/gigs/actions.ts", {
    "next/cache": { revalidatePath: (value) => invalidations.push(value) },
    "@/lib/auth-admin": { getIsAdmin: async () => admin },
    "@/lib/supabase/server": { createClient: async () => client },
  });
  return { actions, writes, invalidations };
}

function gigForm(visibility) {
  const form = new FormData();
  form.set("id", "42");
  form.set("title", "가을 공연");
  form.set("perform_date", "2026-10-31");
  if (visibility !== undefined) form.set("visibility", visibility);
  return form;
}

for (const [actionName, operation] of [["createGig", "insert"], ["updateGig", "update"]]) {
  test(`${actionName} persists each explicit visibility with the matching legacy public flag`, async () => {
    for (const visibility of ["private", "members", "public"]) {
      const fixture = actionsFixture();
      const form = gigForm(visibility);
      // A stale or tampered legacy checkbox must not override the selected visibility.
      form.set("is_public", visibility === "public" ? "false" : "true");
      assert.deepEqual(await fixture.actions[actionName](form), { ok: true, gigId: 42 });
      assert.equal(fixture.writes.length, 1);
      const [write] = fixture.writes;
      assert.equal(write.operation, operation);
      assert.equal(write.table, "gigs");
      assert.equal(write.payload.visibility, visibility);
      assert.equal(write.payload.is_public, visibility === "public");
      if (operation === "update") assert.deepEqual(write.filters, [["id", 42]]);
      assert.ok(fixture.invalidations.includes("/gigs"));
    }
  });

  test(`${actionName} rejects missing or invalid visibility before any writes`, async () => {
    for (const visibility of [undefined, "", "all", "true", "Members", "members ", new Blob(["public"])]) {
      const fixture = actionsFixture();
      const form = gigForm(visibility);
      form.set("is_public", "true");
      const result = await fixture.actions[actionName](form);
      assert.equal(result.ok, false);
      assert.match(result.error, /공개 범위/);
      assert.deepEqual(fixture.writes, []);
      assert.deepEqual(fixture.invalidations, []);
    }
  });

  test(`${actionName} requires admin permission for every visibility`, async () => {
    for (const visibility of ["private", "members", "public"]) {
      const fixture = actionsFixture({ admin: false });
      const result = await fixture.actions[actionName](gigForm(visibility));
      assert.equal(result.ok, false);
      assert.match(result.error, /관리자/);
      assert.deepEqual(fixture.writes, []);
      assert.deepEqual(fixture.invalidations, []);
    }
  });
}
