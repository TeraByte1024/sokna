"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Search, Plus, X, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// 공연자 행의 검색 제안에만 사용하는 목록. 입력 가능한 세션을 제한하지 않는다.
const SESSION_SUGGESTIONS = [
  { name: "보컬(남)", aliases: ["vocal", "남보컬", "male vocal"] },
  { name: "보컬(여)", aliases: ["vocal", "여보컬", "female vocal"] },
  { name: "기타", aliases: ["guitar", "일렉기타", "어쿠스틱기타", "통기타"] },
  { name: "베이스", aliases: ["bass"] },
  { name: "드럼", aliases: ["drum"] },
  { name: "건반", aliases: ["키보드", "피아노", "신디사이저", "브라스", "keyboard", "piano", "synth", "brass"] },
];

const normalizePart = (value: string) => value.trim().replaceAll("키보드", "건반");

export function PerformerSessionSearch({ currentParts, onAddPart }: {
  currentParts: string[];
  onAddPart: (part: string) => void;
}) {
  const id = useId();
  const [isSearching, setIsSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [position, setPosition] = useState<{ left: number; top?: number; bottom?: number; width: number; maxHeight: number; inputTop: number; inputLeft: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const q = query.trim().toLowerCase().replaceAll(/\s/g, "");
  const assigned = new Set(currentParts.map(normalizePart));
  const suggestions = SESSION_SUGGESTIONS.filter(({ name, aliases }) =>
    !q || [name, ...aliases].some((value) => value.toLowerCase().replaceAll(/\s/g, "").includes(q)),
  );
  const customPart = normalizePart(query);
  const canAddCustom = Boolean(customPart && !customPart.includes(",") && !assigned.has(customPart)
    && !suggestions.some(({ name }) => name === customPart));
  const options = [...suggestions.map(({ name }) => ({ name, custom: false, disabled: assigned.has(name) })),
    ...(canAddCustom ? [{ name: customPart, custom: true, disabled: false }] : [])];
  const enabledIndices = options.flatMap((option, index) => option.disabled ? [] : [index]);
  const activeIndex = enabledIndices.includes(highlightedIndex) ? highlightedIndex : enabledIndices[0] ?? -1;

  const updatePosition = useCallback(() => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const width = Math.min(240, window.innerWidth - 16);
    const viewport = window.visualViewport;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportBottom = viewportTop + (viewport?.height ?? window.innerHeight);
    const below = viewportBottom - rect.bottom - 12;
    const above = rect.top - viewportTop - 12;
    const openAbove = below < 180 && above > below;
    const maxHeight = Math.max(40, Math.min(256, openAbove ? above : below));
    setPosition({ width, maxHeight,
      inputTop: rect.top,
      inputLeft: Math.max(8, Math.min(rect.left, window.innerWidth - 160 - 8)),
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      ...(openAbove ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }) });
  }, []);

  const close = useCallback((focusTrigger = false) => {
    restoreFocus.current = focusTrigger;
    setIsSearching(false);
    setQuery("");
    setHighlightedIndex(0);
  }, []);

  function addPart(part: string) {
    const normalized = normalizePart(part);
    if (!normalized || normalized.includes(",") || assigned.has(normalized)) return;
    onAddPart(normalized);
    close(true);
  }

  useEffect(() => {
    if (!isSearching) {
      if (restoreFocus.current) triggerRef.current?.focus();
      restoreFocus.current = false;
      return;
    }
    inputRef.current?.focus();
    const update = () => updatePosition();
    const dismiss = (event: Event) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target) && !popupRef.current?.contains(target)) close();
    };
    update();
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("focusin", dismiss);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("focusin", dismiss);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
    };
  }, [isSearching, close, updatePosition]);

  return (
    <div ref={containerRef} className="inline-flex items-center">
        <button ref={triggerRef} type="button" aria-label="세션 검색 및 추가"
          aria-hidden={isSearching || undefined} tabIndex={isSearching ? -1 : undefined} onClick={() => {
          updatePosition();
          setIsSearching(true);
        }} className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-muted/40 text-muted-foreground border border-dashed border-border/80 hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors",
          isSearching && "invisible pointer-events-none")}>
          <Plus className="size-2.5" /><span>추가</span>
        </button>
      {isSearching && position && createPortal(
        <div ref={popupRef}>
        <div className="fixed z-[150] w-40"
          style={{ top: position.inputTop, left: position.inputLeft }}>
          <Search className="absolute left-1.5 top-1/2 -translate-y-1/2 size-3 text-muted-foreground pointer-events-none" />
          <Input ref={inputRef} role="combobox" aria-label="직접 입력"
            aria-expanded={Boolean(position)} aria-controls={`${id}-results`} aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
            placeholder="직접 입력" value={query}
            onChange={(event) => { setQuery(event.target.value); setHighlightedIndex(0); }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); }
              else if (event.key === "Enter") {
                event.preventDefault(); event.stopPropagation();
                if (activeIndex >= 0) addPart(options[activeIndex].name);
              } else if ((event.key === "ArrowDown" || event.key === "ArrowUp") && enabledIndices.length) {
                event.preventDefault();
                const next = enabledIndices[(enabledIndices.indexOf(activeIndex) + (event.key === "ArrowDown" ? 1 : -1) + enabledIndices.length) % enabledIndices.length];
                setHighlightedIndex(next);
                optionRefs.current[next]?.scrollIntoView({ block: "nearest" });
              }
            }}
            className="h-6 w-40 rounded-md pl-6 pr-6 text-[11px] bg-background border-primary/30 focus-visible:ring-1 shadow-xs" />
          <button type="button" aria-label="세션 검색 닫기" onClick={() => close(true)}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 rounded text-muted-foreground hover:text-foreground">
            <X className="size-3" />
          </button>
        </div>
        <div id={`${id}-results`} role="listbox" aria-label="세션 검색 결과"
          style={{ position: "fixed", left: position.left, top: position.top, bottom: position.bottom,
            width: position.width, maxHeight: position.maxHeight }}
          className="z-[150] overflow-y-auto rounded-xl border border-border/80 bg-popover/95 text-popover-foreground backdrop-blur-md p-1.5 space-y-0.5 shadow-xl [scrollbar-width:thin]">
          {options.length ? options.map((option, index) => (
            <button key={`${option.custom ? "custom" : "preset"}-${option.name}`} ref={(element) => { optionRefs.current[index] = element; }}
              id={`${id}-option-${index}`} type="button" role="option" aria-selected={index === activeIndex}
              disabled={option.disabled} aria-disabled={option.disabled}
              onPointerDown={(event) => event.preventDefault()}
              onMouseEnter={() => setHighlightedIndex(index)} onClick={() => addPart(option.name)}
              className={cn("w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-lg text-left text-xs transition-colors",
                option.disabled ? "text-muted-foreground opacity-50 cursor-not-allowed" :
                  index === activeIndex ? "bg-primary/10 text-primary" : "hover:bg-muted/60")}>
              {option.custom ? <><Plus className="size-3" /><span>입력한 세션 직접 추가</span></> :
                <><span className="font-medium">{option.name}</span>{option.disabled && <Check className="size-3 text-muted-foreground" />}</>}
            </button>
          )) : <p className="px-2 py-3 text-xs text-muted-foreground">추가 가능한 세션이 없습니다.</p>}
        </div>
        </div>, document.body,
      )}
    </div>
  );
}
