import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { loadTs } from "./helpers/load-ts.mjs";

const terms = (postedOn, content = "Test terms") => ({ kind: "terms", title: "Terms", postedOn, content, published: false });
const earlier = terms("2026-10-01", "Earlier test terms"), current = terms("2026-10-24");
const privacy = (postedOn, content) => ({ kind: "privacy", title: "개인정보 수집·이용 동의", postedOn, content });
const source = loadTs("lib/public-legal-documents.ts", {
  "@/lib/legal-documents": { LEGAL_DOCUMENT_HISTORY: [
    { publiclyListed: true, documents: [current, privacy("2026-10-24", "Current policy")] },
    { publiclyListed: false, documents: [terms("2026-10-25", "Private work"), privacy("2026-10-25", "Private policy")] },
    { publiclyListed: false, documents: [earlier, privacy("2026-10-23", "Earlier policy")] },
  ] },
});

test("public history excludes the removed initial entries and unlisted future documents", () => {
  assert.deepEqual(source.publicLegalDocuments("terms").map((item) => item.postedOn), ["2026-10-24"]);
  assert.equal(source.publicLegalDocument("terms").content, current.content);
  assert.equal(source.publicLegalDocument("terms", "2026-10-01"), undefined);
  assert.equal(source.publicLegalDocument("terms", "2026-10-25"), undefined);
  assert.equal(source.publicLegalDocument("privacy").content, "Current policy");
  assert.equal(source.publicLegalDocument("privacy", "2026-10-23"), undefined);
  for (const date of ["", "latest", "2026-02-30", "../../profile"]) assert.equal(source.publicLegalDocument("terms", date), undefined);
  const conflicting = loadTs("lib/public-legal-documents.ts", {
    "@/lib/legal-documents": { LEGAL_DOCUMENT_HISTORY: [{ publiclyListed: true, documents: [current, { ...current, content: "Replaced old content" }] }] },
  });
  assert.throws(() => conflicting.publicLegalDocuments("terms"), /Conflicting public legal documents/);
});

test("future published revisions preserve access to the current public baseline", () => {
  const legal = loadTs("lib/legal-documents.ts");
  const future = legal.LEGAL_DOCUMENTS.map((document) => ({ ...document, postedOn: "2026-10-25", content: `${document.content}\nFuture revision` }));
  const updated = loadTs("lib/public-legal-documents.ts", {
    "@/lib/legal-documents": { LEGAL_DOCUMENT_HISTORY: [...legal.LEGAL_DOCUMENT_HISTORY,
      { postedOn: "2026-10-25", publiclyListed: true, documents: future }] },
  });
  for (const document of legal.LEGAL_DOCUMENTS) {
    assert.deepEqual(updated.publicLegalDocuments(document.kind).map((item) => item.postedOn), ["2026-10-25", "2026-10-24"]);
    assert.equal(updated.publicLegalDocument(document.kind, "2026-10-24").content, document.content);
    assert.equal(updated.publicLegalDocument(document.kind, "2026-10-23"), undefined);
  }
});

test("signup and public documents share the same current text and posting dates", () => {
  const legal = loadTs("lib/legal-documents.ts");
  const core = loadTs("lib/legal-consent.ts", { "server-only": {}, "@/lib/legal-documents": legal });
  const publicSource = loadTs("lib/public-legal-documents.ts", { "@/lib/legal-documents": legal });
  for (const document of core.currentLegalDocuments().documents) {
    const publicDocument = publicSource.publicLegalDocument(document.kind);
    assert.equal(publicDocument.content, document.content);
    assert.equal(publicDocument.postedOn, document.postedOn);
    assert.equal(document.postedOn, "2026-10-24");
    assert.equal(publicSource.publicLegalDocument(document.kind, document.postedOn).content, document.content);
  }
  assert.equal(publicSource.publicLegalDocument("privacy").postedOn, "2026-10-24");
  assert.equal(publicSource.publicLegalDocument("privacy", "2026-10-23"), undefined);
  assert.equal(legal.LEGAL_DOCUMENT_HISTORY.length, 1);
  assert.equal(legal.LEGAL_DOCUMENT_HISTORY[0].postedOn, "2026-10-24");
  assert.equal(legal.LEGAL_DOCUMENT_HISTORY[0].changeSummary, "이용약관 및 개인정보처리방침 최초 게시");
  assert.equal(legal.LEGAL_DOCUMENT_HISTORY[0].publiclyListed, true);
  assert.equal(publicSource.publicLegalDocument("privacy", "2026-10-25"), undefined);
});

test("readers show only the current posting date and old revisions return not found", () => {
  const { PublicLegalDocument, publicLegalMetadata } = loadTs("components/public-legal-document.tsx", {
    "next/link": "a", "next/navigation": { notFound: () => { throw new Error("not-found"); } },
    "@/components/site-footer": { SiteFooter: () => null }, "@/components/sokna-logo": { SoknaLogo: () => null },
    "@/lib/public-legal-documents": source,
  });
  const html = renderToStaticMarkup(PublicLegalDocument({ kind: "terms", postedOn: "2026-10-24" }));
  assert.match(html, /Test terms/); assert.doesNotMatch(html, /Earlier test terms/);
  assert.match(html, /href="\/terms\/2026-10-24"/); assert.doesNotMatch(html, /href="\/terms\/2026-10-01"/);
  assert.match(html, /aria-current="page"/);
  assert.equal(publicLegalMetadata("terms", "2026-10-24").alternates.canonical, "/terms/2026-10-24");
  assert.throws(() => PublicLegalDocument({ kind: "terms", postedOn: "2026-10-01" }), /not-found/);
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
