"use client";

import { useEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface PartChipProps {
  label?: string;
  count?: number;
  isEditing?: boolean;
  onConfirm?: (value: string) => void;
  onCancel?: () => void;
  onDecrement?: (e: React.MouseEvent) => void;
  onIncrement?: (e: React.MouseEvent) => void;
}

export function PartChip({
  label,
  count = 1,
  isEditing,
  onConfirm,
  onCancel,
  onDecrement,
  onIncrement,
}: PartChipProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="flex items-center bg-primary/10 border border-primary/30 rounded-full px-3 py-1 animate-in fade-in zoom-in duration-200">
        <input
          ref={inputRef}
          type="text"
          placeholder="파트명..."
          className="bg-transparent border-none outline-none text-[13px] w-20 placeholder:text-muted-foreground font-bold"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") value.trim() ? onConfirm?.(value.trim()) : onCancel?.();
            if (e.key === "Escape") onCancel?.();
          }}
          onBlur={() => (value.trim() ? onConfirm?.(value.trim()) : onCancel?.())}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "group relative flex items-center bg-secondary text-secondary-foreground rounded-full overflow-hidden",
        "border border-muted/30 transition-all shadow-sm select-none h-8"
      )}
    >
      {/* 1. 플러스 영역: 파트명 + 아이콘 (왼쪽 라운드 포함) */}
      <div
        onClick={onIncrement}
        className={cn(
          "relative z-10 flex items-center gap-1.5 pl-3.5 pr-1.5 h-full cursor-pointer transition-colors",
          "hover:bg-emerald-500/15 group/add"
        )}
      >
        <span className="text-[13px] text-foreground font-bold tracking-tight whitespace-nowrap">
          {label}
        </span>
        <Plus className="size-3 text-muted-foreground group-hover/add:text-emerald-600 transition-colors" />
      </div>

      {/* 2. 숫자 표시부: 배경 제거 및 폰트 강조 */}
      <div className="relative z-30 h-full flex items-center px-1 bg-secondary">
        <span className="text-[13px] text-primary font-black min-w-[0.9rem] text-center">
          {count}
        </span>
      </div>

      {/* 3. 마이너스 영역 (오른쪽 라운드 포함) */}
      <div
        onClick={onDecrement}
        className={cn(
          "relative z-10 flex items-center justify-center pl-1.5 pr-3.5 h-full cursor-pointer transition-colors",
          "hover:bg-destructive/15 group/minus"
        )}
      >
        <Minus className="size-3 text-muted-foreground group-hover/minus:text-destructive transition-colors" />
      </div>
    </div>
  );
}