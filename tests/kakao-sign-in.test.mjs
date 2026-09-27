import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const filename = path.join(root, "components/kakao-sign-in-button.tsx");
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((child) => elements(child, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

function textContent(tree) {
  if (typeof tree === "string") return tree;
  if (Array.isArray(tree)) return tree.map(textContent).join("");
  return tree?.props ? textContent(tree.props.children) : "";
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options = {}) {
  const config = {
    available: true,
    response: { data: { url: "https://kauth.kakao.com/oauth/authorize?state=test" }, error: null },
    origin: "https://sokna.example",
    ...options,
  };
  const state = [];
  const effects = new Map();
  const listeners = new Map();
  const operations = [];
  let stateIndex = 0;
  let tree;
  let props = {};
  const mocks = {
    react: {
      useEffect(effect) {
        const index = stateIndex++;
        if (!effects.has(index)) effects.set(index, effect());
      },
      useState(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
        return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
      },
      useRef(initial) {
        const index = stateIndex++;
        if (!(index in state)) state[index] = { current: initial };
        return state[index];
      },
    },
    "react/jsx-runtime": jsxRuntime,
    "@/components/ui/button": { Button: "button" },
    "@/components/kakao-logo": { KakaoLogo: () => null },
    "lucide-react": { Loader2: () => null },
    "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
    "@/lib/auth/social-providers": {
      KAKAO_AUTH_QUERY_PARAMS: { prompt: "select_account", scope: "account_email" },
    },
    "@/lib/auth/provider-availability": {
      async isSocialProviderEnabled(provider) {
        operations.push(["availability", provider]);
        if (config.availabilityException) throw config.availabilityException;
        return config.availabilityPromise ? await config.availabilityPromise : config.available;
      },
    },
    "@/lib/supabase/client": {
      createClient() {
        operations.push(["createClient"]);
        if (config.clientException) throw config.clientException;
        return { auth: {
          async signInWithOAuth(...args) {
            operations.push(["signInWithOAuth", ...args]);
            if (config.oauthException) throw config.oauthException;
            return config.oauthPromise ? await config.oauthPromise : config.response;
          },
        } };
      },
    },
  };
  const loaded = { exports: {} };
  const window = {
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
    removeEventListener(type, callback) {
      listeners.get(type)?.delete(callback);
    },
    location: {
    origin: config.origin,
    assign(url) {
      operations.push(["navigate", url]);
      if (config.navigationException) throw config.navigationException;
    },
  } };
  vm.runInThisContext(`(function(require,module,exports,window){${source}\n})`, { filename })(
    (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    loaded,
    loaded.exports,
    window,
  );
  function render(nextProps = props) {
    props = nextProps;
    stateIndex = 0;
    tree = loaded.exports.KakaoSignInButton(props);
  }
  render();
  return {
    config,
    operations,
    render,
    pageshow(persisted) {
      for (const listener of listeners.get("pageshow") ?? []) listener({ persisted });
    },
    listenerCount: () => listeners.get("pageshow")?.size ?? 0,
    unmount() {
      for (const cleanup of effects.values()) cleanup?.();
      effects.clear();
    },
    button: () => elements(tree, (element) => element.type === "button")[0],
    alerts: () => elements(tree, (element) => element.props?.role === "alert").map(textContent),
  };
}

function did(f, operation) {
  return f.operations.some(([name]) => name === operation);
}

test("Kakao sign-in requests only email scope with its own provider and the shared callback", async () => {
  const f = fixture();
  assert.equal(f.button().props.type, "button");
  assert.equal(f.button().props.disabled, false);
  assert.match(textContent(f.button()), /카카오/);
  await f.button().props.onClick();
  assert.deepEqual(f.operations, [
    ["availability", "kakao"],
    ["createClient"],
    ["signInWithOAuth", {
      provider: "kakao",
      options: {
        redirectTo: "https://sokna.example/auth/callback",
        skipBrowserRedirect: true,
        queryParams: { prompt: "select_account", scope: "account_email" },
      },
    }],
    ["navigate", "https://kauth.kakao.com/oauth/authorize?state=test"],
  ]);
  f.render();
  assert.equal(f.button().props.disabled, true);
  const [, payload] = f.operations.find(([name]) => name === "signInWithOAuth");
  assert.equal(Object.hasOwn(payload.options, "scopes"), false, "Plural scopes must not append provider defaults");
  assert.doesNotMatch(JSON.stringify(payload), /profile_nickname|profile_image|access_type/);
  assert.match(textContent(f.button()), /연결 중/);
  assert.deepEqual(f.alerts(), []);
});

test("Kakao callback follows the active site origin including local development", async () => {
  const f = fixture({ origin: "http://localhost:3000" });
  await f.button().props.onClick();
  const [, payload] = f.operations.find(([name]) => name === "signInWithOAuth");
  assert.equal(payload.options.redirectTo, "http://localhost:3000/auth/callback");
});

test("disabled Kakao buttons cannot start preflight or OAuth even if their handler is invoked", async () => {
  const f = fixture();
  f.render({ disabled: true });
  assert.equal(f.button().props.disabled, true);
  await f.button().props.onClick();
  assert.deepEqual(f.operations, []);
});

test("the ref guard blocks duplicate clicks before a render and throughout provider preflight", async () => {
  const availability = deferred();
  const f = fixture({ availabilityPromise: availability.promise });
  const handler = f.button().props.onClick;
  const first = handler();
  const duplicate = handler();
  assert.deepEqual(f.operations, [["availability", "kakao"]]);
  f.render();
  assert.equal(f.button().props.disabled, true);
  availability.resolve(true);
  await Promise.all([first, duplicate]);
  assert.equal(f.operations.filter(([name]) => name === "signInWithOAuth").length, 1);
  assert.equal(f.operations.filter(([name]) => name === "navigate").length, 1);
  await handler();
  assert.equal(f.operations.filter(([name]) => name === "availability").length, 1);
});

test("a disabled Kakao provider reports an inline error before OAuth and can be retried", async () => {
  const f = fixture({ available: false });
  await f.button().props.onClick();
  f.render();
  assert.equal(did(f, "signInWithOAuth"), false);
  assert.equal(did(f, "navigate"), false);
  assert.equal(f.button().props.disabled, false);
  assert.equal(f.alerts().length, 1);
  assert.match(f.alerts()[0], /사용할 수 없|다른 로그인/);
  f.config.available = true;
  await f.button().props.onClick();
  f.render();
  assert.equal(f.operations.filter(([name]) => name === "availability").length, 2);
  assert.equal(did(f, "navigate"), true);
  assert.deepEqual(f.alerts(), []);
});

test("preflight failures do not leak internal details and keep the sign-in button retryable", async () => {
  const f = fixture({ availabilityException: new Error("PRIVATE settings endpoint token") });
  await f.button().props.onClick();
  f.render();
  assert.equal(did(f, "signInWithOAuth"), false);
  assert.equal(did(f, "navigate"), false);
  assert.equal(f.button().props.disabled, false);
  assert.equal(f.alerts().length, 1);
  assert.doesNotMatch(f.alerts()[0], /PRIVATE|endpoint|token/);
  f.config.availabilityException = null;
  await f.button().props.onClick();
  assert.equal(did(f, "navigate"), true);
});

test("OAuth provider errors use safe inline messages and reset the duplicate-click guard", async () => {
  for (const code of ["provider_disabled", "validation_failed", "private-provider-code"]) {
    const f = fixture({ response: { data: { url: null }, error: { code, message: "PRIVATE provider token" } } });
    await f.button().props.onClick();
    f.render();
    assert.equal(f.button().props.disabled, false);
    assert.equal(did(f, "navigate"), false);
    assert.equal(f.alerts().length, 1);
    assert.doesNotMatch(f.alerts()[0], /PRIVATE|token|private-provider-code/);
    f.config.response = { data: { url: "https://kauth.kakao.com/authorize/retry" }, error: null };
    await f.button().props.onClick();
    f.render();
    assert.equal(f.operations.filter(([name]) => name === "signInWithOAuth").length, 2);
    assert.deepEqual(f.alerts(), []);
    assert.deepEqual(f.operations.at(-1), ["navigate", "https://kauth.kakao.com/authorize/retry"]);
  }
});

test("missing OAuth URLs and client, OAuth or navigation exceptions show a safe retryable failure", async () => {
  for (const options of [
    { response: { data: { url: "" }, error: null } },
    { response: { data: null, error: null } },
    { clientException: new Error("PRIVATE client config") },
    { oauthException: new Error("PRIVATE OAuth response") },
    { navigationException: new Error("PRIVATE navigation context") },
  ]) {
    const f = fixture(options);
    await f.button().props.onClick();
    f.render();
    assert.equal(f.button().props.disabled, false);
    assert.equal(f.alerts().length, 1);
    assert.doesNotMatch(f.alerts()[0], /PRIVATE|config|response|context/);
  }
});
const availabilityFilename = path.join(root, "lib/auth/provider-availability.ts");
const availabilitySource = ts.transpileModule(readFileSync(availabilityFilename, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function availabilityFixture({
  env = {
    NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-publishable-key",
    SUPABASE_SERVICE_ROLE_KEY: "PRIVATE-service-key",
    SUPABASE_ACCESS_TOKEN: "PRIVATE-management-token",
  },
  settings = { external: { google: true, kakao: true } },
  httpOk = true,
  fetchException = null,
  jsonException = null,
} = {}) {
  const operations = [];
  const timeoutSignal = { name: "timeout-signal" };
  const loaded = { exports: {} };
  vm.runInThisContext(`(function(module,exports,process,fetch,AbortSignal){${availabilitySource}\n})`, { filename: availabilityFilename })(
    loaded,
    loaded.exports,
    { env },
    async (url, options) => {
      operations.push(["fetch", String(url), options]);
      if (fetchException) throw fetchException;
      return {
        ok: httpOk,
        async json() {
          operations.push(["json"]);
          if (jsonException) throw jsonException;
          return settings;
        },
      };
    },
    { timeout: (duration) => { operations.push(["timeout", duration]); return timeoutSignal; } },
  );
  return { check: loaded.exports.isSocialProviderEnabled, operations, timeoutSignal };
}

test("provider availability reads public Auth settings with only the publishable key and no caching", async () => {
  const f = availabilityFixture();
  assert.equal(await f.check("kakao"), true);
  assert.deepEqual(f.operations, [
    ["timeout", 5000],
    ["fetch", "https://project.supabase.co/auth/v1/settings", {
      headers: { apikey: "public-publishable-key" },
      cache: "no-store",
      signal: f.timeoutSignal,
    }],
    ["json"],
  ]);
  assert.doesNotMatch(JSON.stringify(f.operations), /PRIVATE|Authorization|service_role|access_token/);
});

test("provider availability handles a trailing slash and checks the requested provider independently", async () => {
  const f = availabilityFixture({
    env: { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co/", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key" },
    settings: { external: { kakao: false, google: true } },
  });
  assert.equal(await f.check("kakao"), false);
  assert.equal(await f.check("google"), true);
  assert.equal(f.operations.filter(([name]) => name === "fetch").length, 2);
  for (const [, url] of f.operations.filter(([name]) => name === "fetch")) {
    assert.equal(url, "https://project.supabase.co/auth/v1/settings");
  }
});

test("missing or nonboolean external provider settings never enable Kakao login", async () => {
  for (const settings of [
    {}, { external: null }, { external: {} }, { external: { google: true } },
    { external: { kakao: false } }, { external: { kakao: "true" } }, { external: { kakao: 1 } },
  ]) {
    assert.equal(await availabilityFixture({ settings }).check("kakao"), false, JSON.stringify(settings));
  }
});

test("unavailable HTTP settings and network or parsing failures reject availability checks", async () => {
  const http = availabilityFixture({ httpOk: false });
  await assert.rejects(http.check("kakao"), /Auth settings unavailable/);
  assert.equal(http.operations.some(([name]) => name === "json"), false);
  for (const options of [
    { fetchException: new Error("settings network failure") },
    { jsonException: new Error("settings parse failure") },
  ]) {
    await assert.rejects(availabilityFixture(options).check("kakao"), /settings .* failure/);
  }
});

test("missing public Auth environment values fail before fetching settings", async () => {
  for (const env of [
    {},
    { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co" },
    { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key" },
    { NEXT_PUBLIC_SUPABASE_URL: "", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key" },
    { NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "" },
  ]) {
    const f = availabilityFixture({ env });
    await assert.rejects(f.check("kakao"), /Auth settings unavailable/);
    assert.deepEqual(f.operations, []);
  }
});
test("returning from Kakao through the back-forward cache resets loading and allows another OAuth attempt", async () => {
  const f = fixture();
  assert.equal(f.listenerCount(), 1);
  await f.button().props.onClick();
  f.render();
  assert.equal(f.button().props.disabled, true);
  assert.equal(f.operations.filter(([name]) => name === "navigate").length, 1);
  f.pageshow(true);
  f.render();
  assert.equal(f.button().props.disabled, false);
  assert.doesNotMatch(textContent(f.button()), /연결 중/);
  await f.button().props.onClick();
  f.render();
  assert.equal(f.operations.filter(([name]) => name === "availability").length, 2);
  assert.equal(f.operations.filter(([name]) => name === "signInWithOAuth").length, 2);
  assert.equal(f.operations.filter(([name]) => name === "navigate").length, 2);
  assert.equal(f.button().props.disabled, true);
  assert.equal(f.listenerCount(), 1);
  f.unmount();
  assert.equal(f.listenerCount(), 0);
});

test("ordinary pageshow events preserve the pending lock during preflight and after provider navigation", async () => {
  const availability = deferred();
  const f = fixture({ availabilityPromise: availability.promise });
  const attempt = f.button().props.onClick();
  f.render();
  f.pageshow(false);
  f.render();
  assert.equal(f.button().props.disabled, true);
  await f.button().props.onClick();
  assert.equal(f.operations.filter(([name]) => name === "availability").length, 1);
  availability.resolve(true);
  await attempt;
  f.render();
  f.pageshow(false);
  f.render();
  assert.equal(f.button().props.disabled, true);
  await f.button().props.onClick();
  assert.equal(f.operations.filter(([name]) => name === "signInWithOAuth").length, 1);
  assert.equal(f.operations.filter(([name]) => name === "navigate").length, 1);
});