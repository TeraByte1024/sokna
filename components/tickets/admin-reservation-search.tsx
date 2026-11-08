"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Search, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function AdminReservationSearch({
  basePath,
  defaultQuery = "",
}: {
  basePath: string;
  defaultQuery?: string;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(defaultQuery);
  const [isComposing, setIsComposing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const requestedQuery = useRef(defaultQuery.trim());

  useEffect(() => {
    const syncHistory = () => {
      if (window.location.pathname !== basePath) return;
      const query = new URLSearchParams(window.location.search).get("q")?.slice(0, 120) ?? "";
      requestedQuery.current = query.trim();
      setValue(query);
      setIsComposing(false);
    };
    window.addEventListener("popstate", syncHistory);
    return () => window.removeEventListener("popstate", syncHistory);
  }, [basePath]);

  const applySearch = useCallback((nextQuery: string) => {
    const trimmed = nextQuery.trim();
    requestedQuery.current = trimmed;
    const params = new URLSearchParams();
    if (trimmed) params.set("q", trimmed);
    const href = params.toString() ? `${basePath}?${params.toString()}` : basePath;
    startTransition(() => {
      router.replace(href, { scroll: false });
    });
  }, [basePath, router]);

  useEffect(() => {
    if (isComposing || value.trim() === requestedQuery.current) return;
    const timer = window.setTimeout(() => {
      applySearch(value);
    }, 200);
    return () => window.clearTimeout(timer);
  }, [applySearch, isComposing, value]);

  return (
    <form
      role="search"
      aria-label="예매자 이름 검색"
      onSubmit={(e) => {
        e.preventDefault();
        if (!isComposing) applySearch(value);
      }}
      className="flex items-center gap-2"
    >
      <div className="relative flex-1">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          ref={inputRef}
          type="text"
          role="searchbox"
          enterKeyHint="search"
          name="q"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onCompositionStart={() => setIsComposing(true)}
          onCompositionEnd={(e) => {
            setValue(e.currentTarget.value);
            setIsComposing(false);
          }}
          placeholder="예매자 또는 입금자 이름으로 검색"
          aria-label="예매자 또는 입금자 이름으로 검색"
          maxLength={120}
          className="h-10 pl-9 pr-9"
        />
        {value && (
          <button
            type="button"
            aria-label="검색어 지우기"
            onClick={() => {
              setValue("");
              applySearch("");
              inputRef.current?.focus();
            }}
            className="absolute right-2.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden="true" />
          </button>
        )}
      </div>
      <Button type="submit" size="sm" aria-label="검색" className="h-10 min-w-14 shrink-0 px-4 font-semibold">
        {isPending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          "검색"
        )}
      </Button>
    </form>
  );
}
