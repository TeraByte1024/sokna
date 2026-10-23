import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { SiteFooter } from "@/components/site-footer";
import { SoknaLogo } from "@/components/sokna-logo";
import { publicLegalDocument, publicLegalDocuments, type PublicLegalKind } from "@/lib/public-legal-documents";

export function publicLegalMetadata(kind: PublicLegalKind, postedOn?: string): Metadata {
  const document = publicLegalDocument(kind, postedOn);
  if (!document) notFound();
  return {
    title: postedOn ? `${document.title} (${postedOn.replaceAll("-", ".")})` : document.title,
    description: `소리로 크는 나무 ${document.title} 전문과 개정 이력`,
    alternates: { canonical: `/${kind}${postedOn ? `/${postedOn}` : ""}` },
  };
}

export function PublicLegalDocument({ kind, postedOn }: { kind: PublicLegalKind; postedOn?: string }) {
  const document = publicLegalDocument(kind, postedOn);
  if (!document) notFound();
  const history = publicLegalDocuments(kind);
  return <div className="flex min-h-svh flex-col">
    <header className="border-b border-border/60 bg-background">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-4 px-5">
        <Link href="/" aria-label="소리로 크는 나무 홈"><SoknaLogo className="h-6" /></Link>
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">홈으로</Link>
      </div>
    </header>
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8 sm:py-12">
      <nav aria-label="약관 문서" className="mb-8 flex flex-wrap gap-2">
        {([ ["terms", "이용약관"], ["privacy", "개인정보처리방침"] ] as const).map(([type, label]) => <Link
          key={type} href={`/${type}`} aria-current={kind === type ? "page" : undefined}
          className={`rounded-full px-4 py-2 text-sm transition-colors ${kind === type ? "bg-primary font-medium text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"}`}>{label}</Link>)}
      </nav>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_12rem] lg:gap-8">
        <article className="min-w-0 rounded-2xl border border-border/70 bg-card p-5 sm:p-8">
          <div className="mb-8 space-y-3 border-b border-border/60 pb-6">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{document.title}</h1>
            <p className="text-sm text-muted-foreground">게시일 <time dateTime={document.postedOn}>{document.postedOn.replaceAll("-", ".")}</time></p>
          </div>
          <div className="space-y-7 text-sm leading-7">
            {document.content.split(/\n\n+/).map((paragraph, index) => {
              const [heading, ...body] = paragraph.split("\n");
              return /^(제\d+조|\d+\.)/.test(heading) ? <section key={index} className="space-y-2">
                <h2 className="text-base font-semibold">{heading}</h2>
                <p className="whitespace-pre-wrap break-words text-muted-foreground">{body.join("\n")}</p>
              </section> : <p key={index} className="whitespace-pre-wrap break-words text-muted-foreground">{paragraph}</p>;
            })}
          </div>
        </article>
        <aside className="order-first min-w-0 rounded-xl border border-border/70 p-4 lg:sticky lg:top-6 lg:order-last">
          <h2 className="mb-3 text-sm font-semibold">게시 이력</h2>
          <nav aria-label="개정일자 선택" className="flex flex-wrap gap-2 lg:flex-col">
            {history.map((item, index) => <Link key={item.postedOn} href={`/${kind}/${item.postedOn}`}
              aria-current={item.postedOn === document.postedOn ? "page" : undefined}
              className={`rounded-lg px-3 py-2 text-xs ${item.postedOn === document.postedOn ? "bg-accent font-semibold" : "text-muted-foreground hover:bg-muted"}`}>
              <time dateTime={item.postedOn}>{item.postedOn.replaceAll("-", ".")}</time>{index === 0 && <span className="ml-2 text-muted-foreground">최신</span>}
            </Link>)}
          </nav>
        </aside>
      </div>
    </main>
    <SiteFooter />
  </div>;
}
