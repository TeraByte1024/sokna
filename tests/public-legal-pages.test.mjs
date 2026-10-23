import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const terms = (postedOn, content = "Test terms") => ({ kind: "terms", title: "Terms", postedOn, content, published: false });
const earlier = terms("2026-10-01", "Earlier test terms"), current = terms("2026-10-23");
const source = loadTs("lib/public-legal-documents.ts", {
  "@/lib/legal-documents": { LEGAL_DOCUMENT_HISTORY: [
    { publiclyListed: true, documents: [current] },
    { publiclyListed: false, documents: [terms("2026-10-25", "Private work")] },
    { publiclyListed: true, documents: [earlier, current] },
  ] },
  "@/lib/privacy-policy": { PRIVACY_POLICY_HISTORY: [
    { title: "개인정보처리방침", postedOn: "2026-10-23", content: "Earlier policy" },
    { title: "개인정보처리방침", postedOn: "2026-10-24", content: "Current policy" },
  ] },
});

test("public history is date-sorted, deduplicated and excludes unlisted work independently of consent activation", () => {
  assert.deepEqual(source.publicLegalDocuments("terms").map((item) => item.postedOn), ["2026-10-23", "2026-10-01"]);
  assert.equal(source.publicLegalDocument("terms").content, current.content);
  assert.equal(source.publicLegalDocument("terms", "2026-10-01").content, earlier.content);
  assert.equal(source.publicLegalDocument("terms", "2026-10-25"), undefined);
  assert.equal(source.publicLegalDocument("privacy").content, "Current policy");
  assert.equal(source.publicLegalDocument("privacy", "2026-10-23").content, "Earlier policy");
  for (const date of ["", "latest", "2026-02-30", "../../profile"]) assert.equal(source.publicLegalDocument("terms", date), undefined);
  const conflicting = loadTs("lib/public-legal-documents.ts", {
    "@/lib/legal-documents": { LEGAL_DOCUMENT_HISTORY: [{ publiclyListed: true, documents: [current, { ...current, content: "Replaced old content" }] }] },
    "@/lib/privacy-policy": { PRIVACY_POLICY_HISTORY: [] },
  });
  assert.throws(() => conflicting.publicLegalDocuments("terms"), /Conflicting public legal documents/);
});

test("readers show dated history and preserve old content; unknown revisions return not found", () => {
  const { PublicLegalDocument, publicLegalMetadata } = loadTs("components/public-legal-document.tsx", {
    "next/link": "a", "next/navigation": { notFound: () => { throw new Error("not-found"); } },
    "@/components/site-footer": { SiteFooter: () => null }, "@/components/sokna-logo": { SoknaLogo: () => null },
    "@/lib/public-legal-documents": source,
  });
  const html = renderToStaticMarkup(PublicLegalDocument({ kind: "terms", postedOn: "2026-10-01" }));
  assert.match(html, /Earlier test terms/); assert.doesNotMatch(html, />Test terms</);
  assert.match(html, /href="\/terms\/2026-10-23"/); assert.match(html, /href="\/terms\/2026-10-01"/);
  assert.match(html, /aria-current="page"/);
  assert.equal(publicLegalMetadata("terms", "2026-10-01").alternates.canonical, "/terms/2026-10-01");
  assert.throws(() => PublicLegalDocument({ kind: "terms", postedOn: "missing" }), /not-found/);
});

test("public document routes bypass authentication; protected routes still require login", async () => {
  const { isPublicLegalPath } = loadTs("lib/legal-paths.ts");
  const authCalls = [];
  const { updateSession } = loadTs("lib/supabase/proxy.ts", {
    "@supabase/ssr": { createServerClient: () => { authCalls.push(true); return { auth: { getClaims: async () => ({ data: null }) } }; } },
    "next/server": { NextResponse: { next: () => ({ kind: "next" }), redirect: (url) => ({ kind: "redirect", url: String(url) }) } },
  }, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://example.test", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-key" } } });
  for (const path of ["/terms", "/privacy", "/terms/2026-10-23", "/privacy/missing", "/terms/"]) {
    assert.equal(isPublicLegalPath(path), true);
    const url = new URL(path, "https://sokna.example"); url.clone = () => new URL(url);
    assert.equal((await updateSession({ nextUrl: url })).kind, "next");
  }
  assert.deepEqual(authCalls, []);
  for (const path of ["/profile", "/admin", "/terms-private", "/terms/2026-10-23/edit"]) {
    assert.equal(isPublicLegalPath(path), false);
    const url = new URL(path, "https://sokna.example"); url.clone = () => new URL(url);
    assert.equal((await updateSession({ nextUrl: url, url: String(url) })).kind, "redirect");
  }
});

test("public readers never render a consent blocker even for a stale signed-in consent state", () => {
  for (const pathname of ["/terms", "/privacy/2026-10-24"]) {
    const { LegalConsentGate } = loadTs("components/legal-consent-gate.tsx", {
      react: { useCallback: (fn) => fn, useEffect() {}, useRef: (value) => ({ current: value }), useState: () => [{ status: "required" }, () => {}] },
      "next/navigation": { usePathname: () => pathname },
      "@/app/auth/legal-actions": { getLegalConsentStateAction: () => { throw new Error("must not query consent"); } },
      "@/components/legal-consent-dialog": { LegalConsentDialog: () => { throw new Error("must not block"); } },
      "@/lib/supabase/client": { createClient: () => { throw new Error("must not authenticate"); } },
      "@/lib/utils": { hasEnvVars: true },
    });
    assert.equal(LegalConsentGate(), null);
  }
});

test("shared footer links to the stable public document addresses", () => {
  const { SiteFooter } = loadTs("components/site-footer.tsx", {
    "next/link": "a", "@/components/theme-switcher": { ThemeSwitcher: () => null },
    "@/components/sokna-logo": { SoknaLogo: () => null },
    "@icons-pack/react-simple-icons": { SiInstagram: () => null, SiYoutube: () => null },
  });
  const html = renderToStaticMarkup(SiteFooter());
  assert.match(html, /href="\/terms"/); assert.match(html, /href="\/privacy"/);
});
