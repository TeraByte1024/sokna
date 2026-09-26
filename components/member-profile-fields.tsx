"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const SESSION_PRESETS = [
  "보컬(남)",
  "보컬(여)",
  "기타",
  "베이스",
  "드럼",
  "건반",
  "창작",
  "직접 입력",
] as const;

type MemberProfileFieldsProps = {
  name: string;
  generation: string;
  selectedPreset: string;
  customPart: string;
  onNameChange: (value: string) => void;
  onGenerationChange: (value: string) => void;
  onPresetChange: (value: string) => void;
  onCustomPartChange: (value: string) => void;
  disabled?: boolean;
};

export function MemberProfileFields({
  name,
  generation,
  selectedPreset,
  customPart,
  onNameChange,
  onGenerationChange,
  onPresetChange,
  onCustomPartChange,
  disabled = false,
}: MemberProfileFieldsProps) {
  const id = useId();

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-name`} className="flex items-center gap-1 text-xs font-semibold">
            이름 (실명) <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${id}-name`}
            type="text"
            autoComplete="name"
            placeholder="예: 홍길동"
            required
            disabled={disabled}
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            className="h-10"
          />
        </div>
        <div className="min-w-0 space-y-1.5">
          <Label htmlFor={`${id}-generation`} className="flex items-center gap-1 text-xs font-semibold">
            동아리 기수 <span className="text-destructive">*</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id={`${id}-generation`}
              type="number"
              min={1}
              max={99}
              placeholder="예: 40"
              required
              disabled={disabled}
              value={generation}
              onChange={(event) => onGenerationChange(event.target.value)}
              className="h-10 min-w-0"
            />
            <span className="shrink-0 text-sm font-medium text-muted-foreground">기</span>
          </div>
        </div>
      </div>

      <fieldset disabled={disabled} className="min-w-0 space-y-2.5 pt-1" aria-describedby={`${id}-session-help`}>
        <legend className="flex items-center gap-1 text-xs font-semibold">
          세션 (파트) <span className="text-destructive">*</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {SESSION_PRESETS.map((preset) => {
            const isSelected = selectedPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                disabled={disabled}
                aria-pressed={isSelected}
                onClick={() => onPresetChange(preset)}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                  isSelected
                    ? "border-primary bg-primary text-primary-foreground shadow-xs"
                    : "border-border/60 bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                {preset}
              </button>
            );
          })}
        </div>
        {selectedPreset === "직접 입력" && (
          <div className="pt-1">
            <Label htmlFor={`${id}-custom-part`} className="sr-only">세션 직접 입력</Label>
            <Input
              id={`${id}-custom-part`}
              type="text"
              placeholder="예: 색소폰, 바이올린"
              value={customPart}
              onChange={(event) => onCustomPartChange(event.target.value)}
              className="h-10"
              required
              disabled={disabled}
              autoFocus
            />
          </div>
        )}
        <p id={`${id}-session-help`} className="text-[11px] text-muted-foreground">
          주로 담당하는 악기 또는 포지션을 선택해 주세요. 목록에 없으면 직접 입력할 수 있습니다.
        </p>
      </fieldset>
    </div>
  );
}
