"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Share2, Check } from "lucide-react";
import { toast } from "sonner";

interface ShareGigButtonProps {
  gigId: number;
  gigTitle?: string | null;
  className?: string;
}

export function ShareGigButton({ gigId, gigTitle, className }: ShareGigButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url = `${window.location.origin}/gigs/${gigId}`;
    const shareData = {
      title: gigTitle ? `${gigTitle} - SOKNA` : "SOKNA 공연 정보",
      text: gigTitle ? `SOKNA 공연 [${gigTitle}] 정보를 확인해보세요.` : "SOKNA 공연 정보를 확인해보세요.",
      url,
    };

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("공연 정보 링크가 클립보드에 복사되었습니다!");
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
      onClick={handleShare}
      className={`h-8 text-xs font-semibold gap-1.5 border-border/80 bg-background/80 hover:bg-muted ${className ?? ""}`}
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-500" />
          <span>링크 복사됨</span>
        </>
      ) : (
        <>
          <Share2 className="size-3.5 text-primary" />
          <span>공연 공유</span>
        </>
      )}
    </Button>
  );
}
