"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FieldDescription } from "@/components/ui/field-description";
import { cn } from "@/lib/utils";

export const SESSION_PRESETS = [
  "보컬(남)",
  "보컬(여)",
  "기타",
  "베이스",
  "드럼",
  "건반",
  "창작",
] as const;

type MemberSessionFieldProps = {
  selectedPreset: string;
  customPart: string;
  onPresetChange: (value: string) => void;
  onCustomPartChange: (value: string) => void;
  onClear?: () => void;
  required?: boolean;
  disabled?: boolean;
};

export function MemberSessionField({
  selectedPreset,
  customPart,
  onPresetChange,
  onCustomPartChange,
  required = true,
  disabled = false,
}: MemberSessionFieldProps) {
  const id = useId();

  return (
    <fieldset disabled={disabled} className="min-w-0" aria-describedby={`${id}-session-help`}>
      <legend className="mb-1 flex items-center gap-1 text-xs font-semibold leading-4">
        세션 (파트){" "}
        {required && <span className="text-destructive">*</span>}
      </legend>
      <div className="space-y-2">
        <FieldDescription id={`${id}-session-help`}>
          주로 담당하는 악기 또는 포지션을 선택해 주세요.
        </FieldDescription>
        <div className="flex flex-wrap gap-2">
          {[...SESSION_PRESETS, "직접 입력"].map((preset) => {
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
              required={required}
              disabled={disabled}
              aria-describedby={`${id}-session-help`}
              autoFocus
            />
          </div>
        )}
      </div>
    </fieldset>
  );
}
