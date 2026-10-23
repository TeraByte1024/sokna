import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const origin = "https://sokna.example";
const redirect = (url) => { throw new Error(`redirect:${url}`); };

function fixture({ user = { id: "audience" }, profile = null, isAdmin = false, error = null } = {}) {
  const operations = [];
  const query = {
    select() { operations.push("read-profile"); return query; },
    eq() { return query; },
    maybeSingle: async () => ({ data: profile, error }),
  };
  const { default: Page } = loadTs("app/auth/membership/page.tsx", {
    "next/navigation": { redirect },
    "@/lib/auth-admin": { getIsAdmin: async () => isAdmin },
    "@/lib/supabase/server": { createClient: async () => ({
      auth: { getUser: async () => ({ data: { user } }) },
      from: () => query,
    }) },
    "next/link": "a",
    "@/components/ui/button": { Button: ({ children }) => children },
    "@/components/ui/card": { Card: "section", CardContent: "div", CardHeader: "header", CardTitle: "h1", CardDescription: "p" },
  });
  return { operations, page: (params = {}) => Page({ searchParams: Promise.resolve(params) }) };
}

test("step two requires an authenticated account and keeps a safe login continuation", async () => {
  const f = fixture({ user: null });
  await assert.rejects(f.page({ redirect: "/gigs/42" }), /redirect:\/auth\/login\?onboarding=membership&redirect=%2Fgigs%2F42$/);
  assert.deepEqual(f.operations, []);
});

test("second step offers an optional request and skip without writing membership data", async () => {
  const f = fixture();
  const html = renderToStaticMarkup(await f.page({ redirect: "/gigs/42" }));
  assert.match(html, /소리로 크는 나무 회원이신가요/);
  assert.match(html, /href="\/auth\/complete-profile"/);
  assert.match(html, /href="\/gigs\/42"/);
  assert.match(html, /나중에 할게요/);
  assert.match(html, /프로필에서도 회원 권한/);
  assert.deepEqual(f.operations, ["read-profile"]);
});

test("existing approved members, admins and submitted applicants are not asked again", async () => {
  for (const options of [
    { profile: { status: "approved", generation: 40, part: null } },
    { profile: { status: "pending", generation: 40, part: "기타" } },
    { isAdmin: true },
  ]) {
    await assert.rejects(fixture(options).page({ redirect: "/gigs/42" }), /redirect:\/gigs\/42$/);
  }
});

test("skip links reject external and recursive auth destinations; database errors do not look like an unregistered member", async () => {
  const html = renderToStaticMarkup(await fixture().page({ redirect: "//evil.example" }));
  assert.doesNotMatch(html, /evil\.example/);
  assert.match(html, /href="\/"/);
  await assert.rejects(fixture({ error: { message: "private" } }).page(), /회원 권한 상태를 확인하지 못했습니다/);
});

function confirmationFixture(failure = false) {
  const operations = [];
  const auth = {
    verifyOtp: async (params) => { operations.push(["verify", params]); return { error: failure ? { message: "private" } : null }; },
    exchangeCodeForSession: async (code) => { operations.push(["exchange", code]); return { error: failure ? { message: "private" } : null }; },
  };
  const { GET } = loadTs("app/auth/confirm/route.ts", {
    "next/navigation": { redirect },
    "@/lib/supabase/server": { createClient: async () => ({ auth }) },
  });
  return { operations, run: (params) => GET(new Request(`${origin}/auth/confirm?${new URLSearchParams(params)}`)) };
}

test("email confirmations support token hashes and PKCE and continue to step two after authentication", async () => {
  for (const params of [{ token_hash: "mock", type: "email" }, { code: "mock", onboarding: "membership" }]) {
    const f = confirmationFixture();
    await assert.rejects(f.run({ ...params, next: "/gigs/42" }), /redirect:\/auth\/membership\?redirect=%2Fgigs%2F42$/);
    assert.equal(f.operations.length, 1);
  }
});

test("email auth errors never advance onboarding and recovery still uses its dedicated password form", async () => {
  await assert.rejects(confirmationFixture().run({ token_hash: "mock", type: "recovery" }), /redirect:\/auth\/update-password$/);
  await assert.rejects(confirmationFixture().run({ token_hash: "mock", type: "email", next: "//evil.example" }), /redirect:\/auth\/membership\?redirect=%2F$/);
  await assert.rejects(confirmationFixture(true).run({ code: "bad" }), (error) => error.message.startsWith("redirect:/auth/error?") && !error.message.includes("private"));
});
