import Link from "next/link";
import { Suspense } from "react";
import { EnvVarWarning } from "@/components/env-var-warning";
import { AuthButton } from "@/components/auth-button";
import { SiteNav } from "@/components/site-nav";
import { CLUB_NAME_KOREAN } from "@/lib/club";
import { hasEnvVars } from "@/lib/utils";

export function SiteHeader() {
  return (
    <header className="w-full flex justify-center border-b border-b-foreground/10 h-16">
      <div className="w-full max-w-5xl flex justify-between items-center p-3 px-5 text-sm">
        <div className="flex flex-wrap gap-3 sm:gap-5 items-center font-semibold min-w-0">
          <Link
            href="/"
            className="shrink-0 max-w-[11rem] sm:max-w-none text-left leading-snug hover:opacity-90 transition-opacity"
          >
            {CLUB_NAME_KOREAN}
          </Link>
          <Suspense fallback={<div className="w-20" />}>
            <SiteNav />
          </Suspense>
        </div>
        {!hasEnvVars ? (
          <EnvVarWarning />
        ) : (
          <Suspense>
            <AuthButton />
          </Suspense>
        )}
      </div>
    </header>
  );
}
