import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = 1_800_000_000_000;
const userId = "current-member";
const nonce = "test-link-nonce";
const origin = "https://sokna.example";
const sources = new Map();

function load(relativePath, mocks = {}) {
  const filename = path.join(root, relativePath);
  if (!sources.has(filename)) {
    sources.set(filename, ts.transpileModule(readFileSync(filename, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
    }).outputText);
  }
  const loadedModule = { exports: {} };
  vm.runInThisContext(`(function(require,module,exports,Date){${sources.get(filename)}\n})`, { filename })(
    (name) => {
      assert.ok(Object.hasOwn(mocks, name), `Unexpected dependency: ${name}`);
      return mocks[name];
    },
    loadedModule,
    loadedModule.exports,
    { now: () => now },
  );
  return loadedModule.exports;
}

const helpers = load("lib/auth/identity-linking.ts");
const memberApplication = load("lib/member-application.ts");
const loginMethods = load("lib/auth/login-methods.ts");
const validContext = { userId, nonce, createdAt: now };

function fixture({
  user = { id: userId, email: "original@example.com" },
  authError = null,
  authException = null,
  clientException = null,
  requestOrigin = origin,
  linkData = { url: "https://accounts.google.com/o/oauth2/auth" },
  linkError = null,
  linkException = null,
  unlinkError = null,
  unlinkException = null,
  refreshError = null,
  refreshException = null,
  revalidateException = null,
  context = JSON.stringify(validContext),
  exchangeUser = { id: userId, email: "different@example.com" },
  exchangeError = null,
  exchangeException = null,
  profile = { id: userId, generation: 12, part: "soprano", status: "active" },
} = {}) {
  const operations = [];
  const cookieWrites = [];
  const cookieStore = {
    get(name) {
      operations.push(["getCookie", name]);
      return context === undefined ? undefined : { value: context };
    },
    set(...args) {
      operations.push(["setCookie", ...args]);
      cookieWrites.push(args);
    },
  };
  const query = {
    select(...args) { operations.push(["select", ...args]); return query; },
    eq(...args) { operations.push(["eq", ...args]); return query; },
    async maybeSingle() { operations.push(["maybeSingle"]); return { data: profile }; },
  };
  const client = {
    auth: {
      async getUser() {
        operations.push(["getUser"]);
        if (authException) throw authException;
        return { data: { user }, error: authError };
      },
      async linkIdentity(...args) {
        operations.push(["linkIdentity", ...args]);
        if (linkException) throw linkException;
        return { data: linkData, error: linkError };
      },
      async unlinkIdentity(...args) {
        operations.push(["unlinkIdentity", ...args]);
        if (unlinkException) throw unlinkException;
        return { data: {}, error: unlinkError };
      },
      async refreshSession() {
        operations.push(["refreshSession"]);
        if (refreshException) throw refreshException;
        return { data: { user, session: {} }, error: refreshError };
      },
      async exchangeCodeForSession(...args) {
        operations.push(["exchange", ...args]);
        if (exchangeException) throw exchangeException;
        return { data: { user: exchangeUser }, error: exchangeError };
      },
      async signOut(...args) {
        operations.push(["signOut", ...args]);
        return { error: null };
      },
    },
    from(...args) { operations.push(["from", ...args]); return query; },
  };
  const mocks = {
    "node:crypto": { randomUUID: () => nonce },
    "@/lib/auth/identity-linking": helpers,
    "@/lib/auth/login-methods": loginMethods,
    "next/cache": {
      revalidatePath(...args) {
        operations.push(["revalidatePath", ...args]);
        if (revalidateException) throw revalidateException;
      },
    },
    "@/lib/member-application": memberApplication,
    "@/lib/supabase/server": {
      async createClient() {
        operations.push(["createClient"]);
        if (clientException) throw clientException;
        return client;
      },
    },
    "next/headers": {
      async headers() {
        operations.push(["headers"]);
        return { get: (name) => name === "origin" ? requestOrigin : "https://untrusted.example" };
      },
      async cookies() { return cookieStore; },
    },
    "next/server": { NextResponse: { redirect: (url) => ({ location: String(url) }) } },
  };
  const actions = load("app/profile/login-method-actions.ts", mocks);
  const action = actions.startGoogleIdentityLinkAction;
  const callback = load("app/auth/callback/route.ts", mocks).GET;
  return {
    action,
    unlink: actions.unlinkGoogleIdentityAction,
    operations,
    cookieWrites,
    callback(params = { intent: "link", code: "auth-code", link_state: nonce }) {
      const url = new URL("/auth/callback", origin);
      url.search = new URLSearchParams(params).toString();
      return callback({ url: url.toString() });
    },
  };
}

function did(f, operation) {
  return f.operations.some(([name]) => name === operation);
}

function assertLinkResult(result, code) {
  assert.equal(result.location, `${origin}/profile?identity_link=${code}`);
}

function assertCookieConsumed(f) {
  assert.deepEqual(f.cookieWrites, [[helpers.IDENTITY_LINK_COOKIE, "", { path: "/auth/callback", maxAge: 0 }]]);
}

test("link context accepts a current request and rejects expired, future, malformed and null values", () => {
  assert.deepEqual(helpers.readIdentityLinkContext(JSON.stringify(validContext)), validContext);
  const maxAge = helpers.IDENTITY_LINK_MAX_AGE * 1000;
  assert.equal(helpers.readIdentityLinkContext(JSON.stringify({ ...validContext, createdAt: now - maxAge })).userId, userId);
  for (const value of [
    undefined, "", "{", "null", "[]", "true", "123", "{}",
    JSON.stringify({ ...validContext, userId: "" }),
    JSON.stringify({ ...validContext, userId: 123 }),
    JSON.stringify({ ...validContext, nonce: null }),
    JSON.stringify({ ...validContext, nonce: "" }),
    JSON.stringify({ ...validContext, createdAt: String(now) }),
    JSON.stringify({ ...validContext, createdAt: null }),
    JSON.stringify({ ...validContext, createdAt: now + 1 }),
    JSON.stringify({ ...validContext, createdAt: now - maxAge - 1 }),
    `{"userId":"${userId}","nonce":"${nonce}","createdAt":1e999}`,
  ]) assert.equal(helpers.readIdentityLinkContext(value), null, String(value));
});

test("auth next permits local paths and rejects external, backslash and recursive auth redirects", () => {
  for (const next of ["/", "/profile", "/events?view=mine#upcoming"]) {
    assert.equal(helpers.getSafeAuthNext(next, origin), next);
  }
  for (const next of [null, "", "profile", "https://evil.example", "//evil.example", "/\\evil.example", "/auth/callback", "/auth/complete-profile", "/profile/../auth/callback"]) {
    assert.equal(helpers.getSafeAuthNext(next, origin), "/", String(next));
  }
});

test("linking requires a verified session that matches the displayed profile", async () => {
  for (const options of [{ user: null }, { user: { id: "other-member" } }, { authError: { message: "expired" } }]) {
    const f = fixture(options);
    assert.deepEqual(await f.action(userId), { ok: false, error: helpers.getIdentityLinkErrorMessage("session_changed") });
    assert.deepEqual(f.operations, [["createClient"], ["getUser"]]);
  }
  const f = fixture();
  assert.equal((await f.action(undefined)).ok, false);
  assert.equal(did(f, "linkIdentity"), false);
});

test("Google linking uses the request origin, account chooser, server redirect and a protected nonce cookie", async () => {
  const f = fixture();
  assert.deepEqual(await f.action(userId, "https://evil.example/callback"), {
    ok: true, url: "https://accounts.google.com/o/oauth2/auth",
  });
  assert.deepEqual(f.operations.find(([name]) => name === "linkIdentity"), ["linkIdentity", {
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?intent=link&link_state=${nonce}`,
      skipBrowserRedirect: true,
      queryParams: { prompt: "select_account" },
    },
  }]);
  assert.ok(f.operations.findIndex(([name]) => name === "getUser") < f.operations.findIndex(([name]) => name === "linkIdentity"));
  const [name, value, options] = f.cookieWrites[0];
  assert.equal(name, helpers.IDENTITY_LINK_COOKIE);
  assert.deepEqual(JSON.parse(value), validContext);
  assert.deepEqual(options, {
    httpOnly: true, secure: true, sameSite: "lax", path: "/auth/callback", maxAge: 600,
  });
});

test("missing, malformed and nonsecure public origins cannot start identity linking", async () => {
  for (const requestOrigin of [null, "", "null", "not-a-url", "javascript:alert(1)", "ftp://sokna.example", "http://sokna.example"]) {
    const f = fixture({ requestOrigin });
    assert.equal((await f.action(userId)).ok, false, String(requestOrigin));
    assert.equal(did(f, "linkIdentity"), false);
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("local development HTTP origins keep the nonce cookie usable without widening the callback", async () => {
  for (const requestOrigin of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000"]) {
    const f = fixture({ requestOrigin });
    assert.equal((await f.action(userId)).ok, true);
    assert.equal(f.cookieWrites[0][2].secure, false);
    const [, options] = f.operations.find(([name]) => name === "linkIdentity");
    assert.equal(new URL(options.options.redirectTo).origin, requestOrigin);
  }
});

test("disabled linking, identity conflicts and unexpected provider errors return only fixed user messages", async () => {
  for (const code of ["manual_linking_disabled", "identity_already_exists", "unknown-provider-error"]) {
    const f = fixture({ linkError: { code, message: "PRIVATE OAuth provider error details" } });
    const result = await f.action(userId);
    assert.deepEqual(result, { ok: false, error: helpers.getIdentityLinkErrorMessage(code) });
    assert.doesNotMatch(result.error, /PRIVATE|unknown-provider-error/);
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("missing provider URLs and client or authentication exceptions fail without creating a link cookie", async () => {
  for (const options of [
    { linkData: { url: "" } },
    { clientException: new Error("private client detail") },
    { authException: new Error("private session detail") },
    { linkException: new Error("private provider detail") },
  ]) {
    const f = fixture(options);
    assert.deepEqual(await f.action(userId), { ok: false, error: helpers.getIdentityLinkErrorMessage() });
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("successful linking preserves the original user ID despite another email and returns to profile", async () => {
  const f = fixture();
  assertLinkResult(await f.callback({ intent: "link", code: "auth-code", link_state: nonce, next: "https://evil.example" }), "success");
  assertCookieConsumed(f);
  assert.deepEqual(f.operations.filter(([name]) => ["getUser", "exchange"].includes(name)), [["getUser"], ["exchange", "auth-code"]]);
  assert.equal(did(f, "from"), false);
  assert.equal(did(f, "signOut"), false);
});

test("link callbacks with missing, expired or mismatched contexts reject before session exchange", async () => {
  for (const context of [null, "", "null", "{", JSON.stringify({ ...validContext, createdAt: now - 600_001 })]) {
    const f = fixture({ context });
    assertLinkResult(await f.callback(), "session_changed");
    assertCookieConsumed(f);
    assert.equal(did(f, "createClient"), false);
    assert.equal(did(f, "exchange"), false);
  }
  for (const params of [
    { intent: "link", code: "auth-code" },
    { intent: "link", code: "auth-code", link_state: "wrong-nonce" },
  ]) {
    const f = fixture();
    assertLinkResult(await f.callback(params), "session_changed");
    assertCookieConsumed(f);
    assert.equal(did(f, "exchange"), false);
  }
});

test("a missing, changed or invalid current session rejects linking before exchanging the OAuth code", async () => {
  for (const options of [{ user: null }, { user: { id: "other-member" } }, { authError: { message: "expired session" } }]) {
    const f = fixture(options);
    assertLinkResult(await f.callback(), "session_changed");
    assertCookieConsumed(f);
    assert.equal(did(f, "getUser"), true);
    assert.equal(did(f, "exchange"), false);
    assert.equal(did(f, "from"), false);
  }
});

test("an exchanged session for a different or missing user is signed out locally", async () => {
  for (const exchangeUser of [{ id: "other-member" }, null]) {
    const f = fixture({ exchangeUser });
    assertLinkResult(await f.callback(), "session_changed");
    assert.deepEqual(f.operations.filter(([name]) => name === "signOut"), [["signOut", { scope: "local" }]]);
    assert.equal(did(f, "from"), false);
    assertCookieConsumed(f);
  }
});

test("link callback provider errors are allowlisted and never reflect error descriptions or next URLs", async () => {
  for (const [error, expected] of [
    ["access_denied", "cancelled"], ["cancelled", "cancelled"],
    ["identity_already_exists", "identity_already_exists"],
    ["manual_linking_disabled", "manual_linking_disabled"],
    ["private-provider-code", "failed"],
  ]) {
    const f = fixture();
    const result = await f.callback({ intent: "link", link_state: nonce, code: "must-not-exchange", error, error_description: "<script>private</script>", next: "/auth/callback" });
    assertLinkResult(result, expected);
    assert.doesNotMatch(result.location, /script|private/);
    assert.equal(did(f, "exchange"), false);
    assertCookieConsumed(f);
  }
  const f = fixture();
  assertLinkResult(await f.callback({ intent: "link", link_state: nonce, error: "server_error", error_code: "identity_already_exists" }), "identity_already_exists");
});

test("missing codes, exchange errors and thrown failures produce fixed callback outcomes", async () => {
  const missingCode = fixture();
  assertLinkResult(await missingCode.callback({ intent: "link", link_state: nonce }), "failed");
  assert.equal(did(missingCode, "exchange"), false);
  for (const [options, expected] of [
    [{ exchangeError: { code: "identity_already_exists", message: "private detail" } }, "identity_already_exists"],
    [{ exchangeError: { code: "private-code", message: "private detail" } }, "failed"],
    [{ exchangeException: new Error("private detail") }, "failed"],
    [{ clientException: new Error("private detail") }, "failed"],
    [{ authException: new Error("private detail") }, "failed"],
  ]) {
    const f = fixture(options);
    assertLinkResult(await f.callback(), expected);
    assertCookieConsumed(f);
    assert.equal(did(f, "from"), false);
  }
});

test("ordinary OAuth still loads the member profile and respects safe local destinations", async () => {
  for (const [next, destination] of [["/events?view=mine#upcoming", "/events?view=mine#upcoming"], ["//evil.example", "/"], ["/auth/callback", "/"]]) {
    const f = fixture();
    assert.equal((await f.callback({ code: "normal-code", next })).location, `${origin}${destination}`);
    assert.deepEqual(f.operations, [
      ["createClient"], ["exchange", "normal-code"], ["from", "users"],
      ["select", "id, generation, part, status"], ["eq", "id", userId], ["maybeSingle"],
    ]);
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("ordinary OAuth new and incomplete members still complete their profile before any next route", async () => {
  for (const profile of [null, { generation: null, part: null }, { generation: 12, part: " " }]) {
    const f = fixture({ profile });
    assert.equal((await f.callback({ code: "normal-code", next: "/events" })).location, `${origin}/auth/complete-profile`);
    assert.equal(did(f, "from"), true);
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("ordinary OAuth failures retain the existing error route", async () => {
  const missingCode = fixture();
  assert.equal(new URL((await missingCode.callback({})).location).pathname, "/auth/error");
  assert.deepEqual(missingCode.operations, []);
  const f = fixture({ exchangeError: { message: "private provider details" } });
  const result = await f.callback({ code: "bad-code" });
  assert.equal(new URL(result.location).pathname, "/auth/error");
  assert.doesNotMatch(result.location, /private provider details/);
  assert.equal(did(f, "from"), false);
});
const primaryGoogleIdentity = {
  identity_id: "google-identity-one",
  id: "google-provider-subject-one",
  user_id: userId,
  provider: "google",
  identity_data: { email: "first@example.com", email_verified: true, sub: "private-provider-subject" },
};
const alternateGoogleIdentity = {
  identity_id: "google-identity-two",
  id: "google-provider-subject-two",
  user_id: userId,
  provider: "google",
  identity_data: { email: "second@example.com", email_verified: true },
};
const emailIdentity = {
  identity_id: "email-identity-one",
  id: userId,
  user_id: userId,
  provider: "email",
  identity_data: { email: "password@example.com", email_verified: true },
};

function userWithIdentities(identities, additional = {}) {
  return { id: userId, email: "password@example.com", identities, ...additional };
}

function assertNoUnlinkSideEffects(f) {
  for (const operation of ["unlinkIdentity", "refreshSession", "revalidatePath", "from", "signOut"]) {
    assert.equal(did(f, operation), false, operation);
  }
}

test("login-method display exposes sanitized identity IDs and availability without provider metadata", () => {
  const identities = loginMethods.getLoginIdentities(userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity, emailIdentity]));
  const firstGoogle = identities.find((identity) => identity.id === primaryGoogleIdentity.identity_id);
  assert.ok(firstGoogle);
  assert.equal(firstGoogle.provider, "google");
  assert.equal(firstGoogle.email, "first@example.com");
  assert.equal(firstGoogle.canUnlink, true);
  for (const identity of identities) {
    assert.deepEqual(Object.keys(identity).sort(), ["canUnlink", "email", "id", "provider", "unlinkDisabledReason"]);
    assert.equal(Object.hasOwn(identity, "identity_data"), false);
  }
  assert.doesNotMatch(JSON.stringify(identities), /private-provider-subject|google-provider-subject/);
  assert.equal(identities.find((identity) => identity.provider === "email").canUnlink, false);
});

test("unlink requires the current verified session to match the displayed account", async () => {
  for (const options of [
    { user: null },
    { user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity], { id: "changed-member" }) },
    { user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]), authError: { message: "private expired session" } },
  ]) {
    const f = fixture(options);
    const result = await f.unlink(userId, primaryGoogleIdentity.identity_id);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /private expired session/);
    assertNoUnlinkSideEffects(f);
    assert.equal(did(f, "getUser"), true);
  }
});

test("unlink rejects unknown IDs, provider subject IDs and identities owned by another account", async () => {
  for (const identityId of ["missing-identity", "foreign-identity", primaryGoogleIdentity.id, "", null]) {
    const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]) });
    assert.equal((await f.unlink(userId, identityId)).ok, false, String(identityId));
    assertNoUnlinkSideEffects(f);
  }
});

test("password email identities cannot be removed through the Google unlink action", async () => {
  const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, emailIdentity]) });
  assert.equal((await f.unlink(userId, emailIdentity.identity_id)).ok, false);
  assertNoUnlinkSideEffects(f);
});

test("the last Google identity and Google identities with no usable alternate cannot be unlinked", async () => {
  for (const identities of [
    [primaryGoogleIdentity],
    [primaryGoogleIdentity, { ...alternateGoogleIdentity, identity_data: { email: "second@example.com", email_verified: false } }],
    [primaryGoogleIdentity, { ...emailIdentity, identity_data: { email: "password@example.com", email_verified: false } }],
    [primaryGoogleIdentity, { ...emailIdentity, identity_data: { email: "password@example.com" } }],
    [primaryGoogleIdentity, { ...alternateGoogleIdentity, provider: "unsupported-provider" }],
  ]) {
    const f = fixture({ user: userWithIdentities(identities) });
    assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, false);
    assertNoUnlinkSideEffects(f);
    const display = loginMethods.getLoginIdentities(userWithIdentities(identities));
    const target = display.find((identity) => identity.id === primaryGoogleIdentity.identity_id);
    assert.equal(target.canUnlink, false);
    assert.ok(target.unlinkDisabledReason);
  }
});

test("a confirmed primary email only counts when its email identity matches the current email", async () => {
  const unverifiedEmail = { ...emailIdentity, identity_data: { email: "different@example.com" } };
  const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, unverifiedEmail], { email_confirmed_at: "2026-09-27T00:00:00Z" }) });
  assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, false);
  assertNoUnlinkSideEffects(f);
});

test("an owned Google identity can be removed while another usable login method remains", async () => {
  for (const [alternate, additional] of [
    [alternateGoogleIdentity, {}],
    [{ ...alternateGoogleIdentity, identity_data: { email: "second@example.com" } }, {}],
    [emailIdentity, {}],
    [{ ...emailIdentity, identity_data: { email: "password@example.com" } }, { email_confirmed_at: "2026-09-27T00:00:00Z" }],
  ]) {
    const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, alternate], additional) });
    const result = await f.unlink(userId, primaryGoogleIdentity.identity_id, "another-member");
    assert.equal(result.ok, true);
    assert.equal(typeof result.message, "string");
    assert.ok(result.message.length > 0);
    assert.deepEqual(f.operations, [
      ["createClient"], ["getUser"], ["unlinkIdentity", primaryGoogleIdentity],
      ["refreshSession"], ["revalidatePath", "/profile"], ["revalidatePath", "/admin/members"],
    ]);
    assert.deepEqual(f.cookieWrites, []);
  }
});

test("unlink rechecks live identities so a removed alternate cannot permit a stale UI request", async () => {
  const currentUser = userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]);
  const displayed = loginMethods.getLoginIdentities(currentUser);
  assert.equal(displayed.find((identity) => identity.id === primaryGoogleIdentity.identity_id).canUnlink, true);
  currentUser.identities = [primaryGoogleIdentity];
  const f = fixture({ user: currentUser });
  assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, false);
  assertNoUnlinkSideEffects(f);
});

test("unlink Auth failures use allowlisted messages and do not refresh a failed mutation", async () => {
  for (const code of ["single_identity_not_deletable", "email_conflict_identity_not_deletable", "private-unexpected-code"]) {
    const f = fixture({
      user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]),
      unlinkError: { code, message: "private provider database details" },
    });
    const result = await f.unlink(userId, primaryGoogleIdentity.identity_id);
    assert.deepEqual(result, { ok: false, error: loginMethods.getIdentityUnlinkErrorMessage(code) });
    assert.doesNotMatch(result.error, /private provider|private-unexpected/);
    assert.equal(did(f, "unlinkIdentity"), true);
    assert.equal(did(f, "refreshSession"), false);
    assert.equal(did(f, "revalidatePath"), false);
  }
});

test("client, auth and unlink exceptions return failure without exposing internal details", async () => {
  for (const options of [
    { clientException: new Error("private client details") },
    { authException: new Error("private auth details") },
    { unlinkException: new Error("private provider details") },
  ]) {
    const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]), ...options });
    const result = await f.unlink(userId, primaryGoogleIdentity.identity_id);
    assert.equal(result.ok, false);
    assert.doesNotMatch(result.error, /private/);
    assert.equal(did(f, "refreshSession"), false);
    assert.equal(did(f, "revalidatePath"), false);
  }
});

test("a completed unlink stays successful when session refresh errors or throws", async () => {
  for (const options of [
    { refreshError: { message: "private refresh details" } },
    { refreshException: new Error("private refresh details") },
  ]) {
    const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]), ...options });
    const result = await f.unlink(userId, primaryGoogleIdentity.identity_id);
    assert.equal(result.ok, true);
    assert.match(result.message, /완료|해제/);
    assert.match(result.message, /새로고침/);
    assert.doesNotMatch(result.message, /private/);
    assert.equal(f.operations.filter(([name]) => name === "unlinkIdentity").length, 1);
    assert.equal(did(f, "signOut"), false);
    assert.deepEqual(f.operations.filter(([name]) => name === "revalidatePath"), [["revalidatePath", "/profile"], ["revalidatePath", "/admin/members"]]);
  }
});

test("retrying an already removed identity cannot unlink another method", async () => {
  const currentUser = userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]);
  const f = fixture({ user: currentUser });
  assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, true);
  currentUser.identities = [alternateGoogleIdentity];
  assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, false);
  assert.equal(f.operations.filter(([name]) => name === "unlinkIdentity").length, 1);
  assert.equal(f.operations.filter(([name]) => name === "getUser").length, 2);
});
test("login-method display tolerates absent identities and excludes nonstring emails", () => {
  assert.deepEqual(loginMethods.getLoginIdentities({ id: userId }), []);
  for (const identity_data of [undefined, {}, { email: null }, { email: 123 }]) {
    const [identity] = loginMethods.getLoginIdentities(userWithIdentities([{ ...primaryGoogleIdentity, identity_data }]));
    assert.equal(identity.email, null);
    assert.equal(identity.canUnlink, false);
  }
});

test("a duplicate identity cannot count as another usable login method", async () => {
  const f = fixture({ user: userWithIdentities([primaryGoogleIdentity, { ...primaryGoogleIdentity }]) });
  assert.equal((await f.unlink(userId, primaryGoogleIdentity.identity_id)).ok, false);
  assertNoUnlinkSideEffects(f);
});

test("cache invalidation failure cannot turn a committed unlink into a failed deletion", async () => {
  const f = fixture({
    user: userWithIdentities([primaryGoogleIdentity, alternateGoogleIdentity]),
    revalidateException: new Error("private cache details"),
  });
  const result = await f.unlink(userId, primaryGoogleIdentity.identity_id);
  assert.equal(result.ok, true);
  assert.match(result.message, /해제/);
  assert.match(result.message, /새로고침/);
  assert.doesNotMatch(result.message, /private/);
  assert.equal(f.operations.filter(([name]) => name === "unlinkIdentity").length, 1);
  assert.equal(did(f, "refreshSession"), true);
  assert.equal(did(f, "signOut"), false);
});