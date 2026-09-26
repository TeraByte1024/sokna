"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberSessionField } from "@/components/member-session-field";

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

      <MemberSessionField
        selectedPreset={selectedPreset}
        customPart={customPart}
        onPresetChange={onPresetChange}
        onCustomPartChange={onCustomPartChange}
        disabled={disabled}
      />
    </div>
  );
}
