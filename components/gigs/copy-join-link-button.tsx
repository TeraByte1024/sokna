"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Copy, Check, Link2 } from "lucide-react";
import { toast } from "sonner";

interface CopyJoinLinkButtonProps {
  gigId: number;
  className?: string;
}

export function CopyJoinLinkButton({ gigId, className }: CopyJoinLinkButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${window.location.origin}/gigs/${gigId}/join`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("참가 신청 링크가 클립보드에 복사되었습니다!");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("링크 복사에 실패했습니다.");
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className={`h-8 text-xs font-semibold gap-1.5 border-border/80 bg-background/80 hover:bg-muted ${className ?? ""}`}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-500" />
          <span>링크 복사됨</span>
        </>
      ) : (
        <>
          <Link2 className="size-3.5 text-primary" />
          <span>참가 신청 링크 복사</span>
        </>
      )}
    </Button>
  );
}
