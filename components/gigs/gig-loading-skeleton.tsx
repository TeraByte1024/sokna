export function GigFormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" className="w-full max-w-3xl mx-auto space-y-6">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-6 animate-pulse motion-reduce:animate-none">
        <div className="h-5 w-28 rounded-md bg-muted" />
        <div className="space-y-2">
          <div className="h-9 w-40 rounded-lg bg-muted" />
          <div className="h-4 w-3/4 max-w-md rounded-md bg-muted" />
        </div>
        <div className="overflow-hidden rounded-xl border border-border/70">
          <div className="space-y-2 border-b border-border/60 bg-muted/30 p-5 sm:p-6">
            <div className="h-5 w-24 rounded-md bg-muted" />
            <div className="h-3 w-52 rounded-md bg-muted" />
          </div>
          <div className="space-y-6 p-5 sm:p-6">
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              <div className="w-full max-w-[240px] shrink-0 space-y-2 md:w-48 lg:w-52">
                <div className="h-3 w-20 rounded-md bg-muted" />
                <div className="aspect-[1/1.414] w-full rounded-xl bg-muted" />
              </div>
              <div className="w-full flex-1 space-y-4">
                {[0, 1, 2].map((item) => (
                  <div key={item} className="space-y-2">
                    <div className="h-3 w-24 rounded-md bg-muted" />
                    <div className="h-10 w-full rounded-md bg-muted" />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[0, 1].map((item) => (
                <div key={item} className="space-y-2">
                  <div className="h-3 w-24 rounded-md bg-muted" />
                  <div className="h-10 w-full rounded-md bg-muted" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function GigDetailSkeleton() {
  return (
    <div role="status" className="w-full max-w-4xl mx-auto">
      <span className="sr-only">공연 정보를 불러오는 중…</span>
      <div aria-hidden="true" className="space-y-10 animate-pulse motion-reduce:animate-none">
        <div className="flex items-center justify-between gap-4">
          <div className="h-5 w-28 rounded-md bg-muted" />
          <div className="h-8 w-24 rounded-md bg-muted" />
        </div>
        <div className="rounded-3xl border border-border/60 bg-card p-6 sm:p-10">
          <div className="flex flex-col items-center gap-6 sm:gap-10 md:flex-row md:items-stretch">
            <div className="aspect-[1/1.414] w-56 shrink-0 rounded-2xl bg-muted sm:w-72 md:w-80 lg:w-[340px]" />
            <div className="w-full flex-1 space-y-6">
              <div className="space-y-3">
                <div className="h-7 w-3/4 rounded-lg bg-muted" />
                <div className="h-4 w-1/2 rounded-md bg-muted" />
              </div>
              <div className="space-y-3">
                {[0, 1].map((item) => (
                  <div key={item} className="h-16 w-full rounded-2xl bg-muted" />
                ))}
              </div>
              <div className="h-10 w-full rounded-lg bg-muted" />
            </div>
          </div>
        </div>
        <div className="h-36 rounded-xl border border-border/60 bg-muted/50" />
      </div>
    </div>
  );
}
