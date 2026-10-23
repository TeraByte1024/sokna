import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const flow = loadTs("lib/auth/login-flow.ts");
const origin = "https://sokna.example";

function elements(tree, predicate) {
  if (Array.isArray(tree)) return tree.flatMap((item) => elements(item, predicate));
  if (!tree || typeof tree !== "object") return [];
  return [...(predicate(tree) ? [tree] : []), ...elements(tree.props?.children, predicate)];
}

test("common login destinations cannot leave the site or return to authentication", () => {
  for (const next of [null, "https://evil.example", "//evil.example", "/auth/login", "/gigs/../auth/callback"]) {
    assert.equal(flow.getLoginDestination(next, origin), "/");
  }
  assert.equal(flow.getLoginDestination("/gigs/42?reserve=true#tickets", origin), "/gigs/42?reserve=true#tickets");
});

test("only explicit club signup adds an onboarding intent to OAuth", () => {
  assert.equal(flow.getOAuthCallbackUrl(origin), `${origin}/auth/callback`);
  const callback = new URL(flow.getOAuthCallbackUrl("http://localhost:3000", "join", "/gigs/42?reserve=true&count=2"));
  assert.equal(callback.origin, "http://localhost:3000");
  assert.equal(callback.searchParams.get("intent"), "join");
  assert.equal(callback.searchParams.get("next"), "/gigs/42?reserve=true&count=2");
  assert.equal(new URL(flow.getOAuthCallbackUrl(origin, undefined, "//evil.example")).searchParams.get("next"), "/");
});

function formFixture(query, { status = "approved" } = {}) {
  const operations = [];
  const state = ["member@example.com", "password", null, false];
  let index = 0;
  const { LoginForm } = loadTs("components/login-form.tsx", {
    react: { useState: () => [state[index++], () => {}] },
    "next/navigation": {
      useSearchParams: () => new URLSearchParams(query),
      useRouter: () => ({ push: (url) => operations.push(["push", url]), refresh: () => operations.push(["refresh"]) }),
    },
    "next/link": "a",
    "@/components/ui/button": { Button: "button" },
    "@/components/ui/input": { Input: "input" },
    "@/components/ui/label": { Label: "label" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h1", CardDescription: "p" },
    "@/components/google-sign-in-button": { GoogleSignInButton: "google-sign-in" },
    "@/components/kakao-sign-in-button": { KakaoSignInButton: "kakao-sign-in" },
    "@/lib/supabase/logout": { signOutWithPushSession: async () => operations.push(["signOut"]) },
    "@/lib/supabase/client": { createClient: () => ({
      auth: { signInWithPassword: async () => { operations.push(["passwordLogin"]); return { data: { user: { id: "member" } }, error: null }; } },
      from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { status } }) }; },
    }) },
  });
  const tree = LoginForm({});
  return { tree, operations, html: () => renderToStaticMarkup(tree) };
}

test("all login URLs display one shared form and social login never requests club onboarding", () => {
  for (const mode of ["", "&mode=audience", "&mode=member"]) {
    const f = formFixture(`redirect=%2Fgigs%2F42${mode}`);
    assert.equal(elements(f.tree, (element) => element.type === "input").length, 2);
    assert.doesNotMatch(f.html(), /외부 관객 로그인|소크나 회원 로그인/);
    const providers = elements(f.tree, (element) => ["google-sign-in", "kakao-sign-in"].includes(element.type));
    assert.equal(providers.length, 2);
    for (const provider of providers) {
      assert.equal(provider.props.intent, undefined);
      assert.equal(provider.props.next, "/gigs/42");
    }
    const signup = elements(f.tree, (element) => element.type === "a" && element.props.href.startsWith("/auth/sign-up"))[0];
    assert.equal(new URL(signup.props.href, origin).searchParams.get("redirect"), "/gigs/42");
  }
});

test("password login is independent of membership approval and preserves safe redirects", async () => {
  for (const [query, status, destination] of [
    ["redirect=%2Fgigs%2F42", "approved", "/gigs/42"],
    ["redirect=javascript%3Aalert(1)", "approved", "/"],
    ["", "rejected", "/"],
  ]) {
    const f = formFixture(query, { status });
    await elements(f.tree, (element) => element.type === "form")[0].props.onSubmit({ preventDefault() {} });
    assert.deepEqual(f.operations, [["passwordLogin"], ["push", destination], ["refresh"]]);
  }
});

test("Google passes explicit signup intent to OAuth and rejects invocation while disabled", async () => {
  for (const disabled of [false, true]) {
    const calls = [];
    const { GoogleSignInButton } = loadTs("components/google-sign-in-button.tsx", {
      "@/components/signup-consent": { useSignupConsent: () => ({ request: async () => ({}), dialog: null }) },
      react: { useState: () => [false, () => {}] },
      "@/components/ui/button": { Button: "button" },
      "@/components/google-logo": { GoogleLogo: () => null },
      "@/lib/supabase/client": { createClient: () => ({ auth: { signInWithOAuth: async (payload) => { calls.push(payload); return { error: null }; } } }) },
    }, { window: { location: { origin } } });
    const button = elements(GoogleSignInButton({ intent: "join", next: "/gigs/42", disabled }), (e) => e.type === "button")[0];
    await button.props.onClick();
    assert.equal(calls.length, disabled ? 0 : 1);
    if (!disabled) {
      const url = new URL(calls[0].options.redirectTo);
      assert.equal(url.searchParams.get("intent"), "join");
      assert.equal(url.searchParams.get("next"), "/gigs/42");
      assert.equal(calls[0].options.queryParams.prompt, "select_account consent");
    }
  }
});

test("Google login never opens signup consent, including onboarding resume; signup retains its receipt", async () => {
  for (const [props, cancelled] of [[{}, false], [{ intent: "signup" }, false], [{ intent: "signup", signupConsentToken: "prior-consent" }, false], [{ signupConsentToken: "prior-consent" }, true]]) {
    const calls = [], consentRequests = [];
    const { GoogleSignInButton } = loadTs("components/google-sign-in-button.tsx", {
      react: { useState: (initial) => [initial, () => {}] },
      "@/components/signup-consent": { useSignupConsent: (method, _email, token) => ({ request: async () => {
        consentRequests.push({ method, token }); return cancelled ? null : { consentState: "signed-signup-state" };
      }, dialog: null }) },
      "@/components/ui/button": { Button: "button" }, "@/components/google-logo": { GoogleLogo: () => null },
      "@/lib/supabase/client": { createClient: () => ({ auth: { signInWithOAuth: async (payload) => { calls.push(payload); return { error: null }; } } }) },
    }, { window: { location: { origin } } });
    const button = elements(GoogleSignInButton(props), (e) => e.type === "button")[0];
    await button.props.onClick();
    assert.equal(consentRequests.length, props.signupConsentToken ? 1 : 0);
    assert.equal(calls.length, cancelled ? 0 : 1);
    if (!cancelled) assert.equal(new URL(calls[0].options.redirectTo).searchParams.get("consent_state"), props.signupConsentToken ? "signed-signup-state" : null);
  }
});

test("authenticated login redirects preserve refreshed cookies and use one default", async () => {
  for (const [query, expected] of [["mode=audience", "/"], ["mode=member", "/"], ["mode=audience&redirect=%2Fauth%2Flogin", "/"], ["redirect=%2Fgigs%2F42", "/gigs/42"], ["onboarding=membership&redirect=%2Fgigs%2F42", "/auth/membership?redirect=%2Fgigs%2F42"]]) {
    const writes = [];
    const response = (location) => ({ location, cookies: { set: (...args) => writes.push(args), getAll: () => [{ name: "refreshed-session", value: "test" }] } });
    const { updateSession } = loadTs("lib/supabase/proxy.ts", {
      "@supabase/ssr": { createServerClient: (_url, _key, options) => ({ auth: { getClaims: async () => {
        options.cookies.setAll([{ name: "refreshed-session", value: "test", options: { httpOnly: true } }]);
        return { data: { claims: { sub: "user" } } };
      } } }) },
      "next/server": { NextResponse: { next: () => response(), redirect: (url) => response(String(url)) } },
    }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://auth.example", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-test-key" } } });
    const url = new URL(`/auth/login?${query}`, origin);
    const result = await updateSession({ url: url.href, nextUrl: url, cookies: { getAll: () => [], set() {} } });
    assert.equal(result.location, `${origin}${expected}`);
    assert.equal(writes.length, 2);
    assert.equal(writes[1][0].name, "refreshed-session");
  }
});

test("email login can resume the signup second step without changing ordinary login behavior", async () => {
  const f = formFixture("onboarding=membership&redirect=%2Fgigs%2F42");
  const providers = elements(f.tree, (e) => ["google-sign-in", "kakao-sign-in"].includes(e.type));
  assert.ok(providers.every((e) => e.props.intent === "signup"));
  await elements(f.tree, (e) => e.type === "form")[0].props.onSubmit({ preventDefault() {} });
  assert.deepEqual(f.operations, [["passwordLogin"], ["push", "/auth/membership?redirect=%2Fgigs%2F42"], ["refresh"]]);
});

function signupFixture(user = null) {
  const { default: Page } = loadTs("app/auth/sign-up/page.tsx", {
    "next/link": "a",
    "next/navigation": { redirect: (url) => { throw new Error(`redirect:${url}`); } },
    "@/components/signup-flow": { SignupFlow: "member-signup" },
    "@/components/google-sign-in-button": { GoogleSignInButton: "google-sign-in" },
    "@/components/kakao-sign-in-button": { KakaoSignInButton: "kakao-sign-in" },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h1", CardDescription: "p" },
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
  });
  return (params = {}) => Page({ searchParams: Promise.resolve(params) });
}

test("signup always creates a basic account first and preserves safe returns", async () => {
  const page = signupFixture();
  for (const type of [undefined, "audience", "member"]) {
    const tree = await page({ type, redirect: "/gigs/42" });
    const forms = elements(tree, (e) => e.type === "member-signup");
    assert.equal(forms.length, 1);
    assert.equal(forms[0].props.initialMember, undefined);
    assert.equal(forms[0].props.next, "/gigs/42");
  }
  const tree = await page({ redirect: "//evil.example" });
  assert.equal(elements(tree, (e) => e.type === "member-signup")[0].props.next, "/");
});

test("signed-in audience accounts apply for club membership with the same identity", async () => {
  const page = signupFixture({ id: "audience" });
  await assert.rejects(page({ type: "member" }), /redirect:\/auth\/membership\?redirect=%2F$/);
  await assert.rejects(page({ type: "audience", redirect: "//evil.example" }), /redirect:\/auth\/membership\?redirect=%2F$/);
});

test("account menu keeps membership information and device push controls exclusive to members", () => {
  for (const [isMember, hasMembershipApplication] of [[false, false], [false, true], [true, true]]) {
    const { UserProfileMenu } = loadTs("components/user-profile-menu.tsx", {
      react: { useState: (initial) => [initial, () => {}] },
      "next/link": "a",
      "next/navigation": { useRouter: () => ({}) },
      "@/lib/supabase/logout": { signOutWithPushSession: async () => {} },
      "@/components/ui/sonner": { toast: {} },
      "@/components/push-notification-settings": { MarketingPushConsentDialog: "consent-dialog", usePushNotificationDevice: () => ({}) },
      "@/components/ui/dropdown-menu": Object.fromEntries(["DropdownMenu", "DropdownMenuContent", "DropdownMenuItem", "DropdownMenuSeparator", "DropdownMenuTrigger"].map((key) => [key, "div"])),
    });
    const html = renderToStaticMarkup(UserProfileMenu({ userName: "Viewer", marketingOptIn: false, isMember, hasMembershipApplication }));
    assert.equal(html.includes("회원 정보"), isMember);
    assert.equal(html.includes("이 기기에서 알림 받기"), isMember);
    assert.equal(html.includes("회원 권한 요청"), !isMember && !hasMembershipApplication);
    assert.match(html, /로그아웃/);
  }
});
