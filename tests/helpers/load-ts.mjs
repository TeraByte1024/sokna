import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const nativeRequire = createRequire(import.meta.url);

export function loadTs(relativePath, mocks = {}, globals = {}, cache = new Map()) {
  const filename = path.resolve(root, relativePath);
  if (cache.has(filename)) return cache.get(filename).exports;
  const loaded = { exports: {} };
  cache.set(filename, loaded);
  const source = ts.transpileModule(readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const require = (name) => {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const match = [base, `${base}.ts`, `${base}.tsx`].find((file) => existsSync(file));
      if (match) return path.extname(match) === ".json"
        ? JSON.parse(readFileSync(match, "utf8"))
        : loadTs(match, mocks, globals, cache);
    }
    return nativeRequire(name);
  };
  vm.runInThisContext(`(function(require,module,exports,${Object.keys(globals).join(",")}){${source}\n})`, { filename })(
    require, loaded, loaded.exports, ...Object.values(globals),
  );
  return loaded.exports;
}
