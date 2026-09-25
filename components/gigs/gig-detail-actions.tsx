"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Gig, type GigRsvp } from "@/lib/gig";
import { Button } from "@/components/ui/button";
import { UserCheck, Music2, CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import { GigJoinDialog } from "@/components/gigs/gig-join-dialog";

interface GigDetailActionsProps {
  gig: Gig;
  existingRsvp: GigRsvp | null;
  defaultPart?: string;
  userName?: string;
  isLoggedIn?: boolean;
}

export function GigDetailActions({
  gig,
  existingRsvp,
  defaultPart = "",
  userName = "부원",
  isLoggedIn = false,
}: GigDetailActionsProps) {
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const searchParams = useSearchParams();

  // URL 쿼리에 ?join=true 가 있으면 자동으로 다이얼로그 팝업
  useEffect(() => {
    if (isLoggedIn && searchParams.get("join") === "true") {
      setIsJoinDialogOpen(true);
    }
  }, [isLoggedIn, searchParams]);

  // 비회원일 경우 렌더링하지 않음
  if (!isLoggedIn) {
    return null;
  }

  // 내 참여 여부(RSVP)에 따른 아이콘
  const renderStatusIcon = (sizeClass = "size-4") => {
    if (!existingRsvp) {
      return <UserCheck className={`${sizeClass} shrink-0`} />;
    }
    if (existingRsvp.status === "going") {
      return <CheckCircle2 className={`${sizeClass} text-emerald-300 shrink-0`} />;
    }
    if (existingRsvp.status === "not_going") {
      return <XCircle className={`${sizeClass} text-rose-300 shrink-0`} />;
    }
    return <HelpCircle className={`${sizeClass} text-amber-300 shrink-0`} />;
  };

  const getStatusTitle = () => {
    if (!existingRsvp) return "공연 참여 등록";
    if (existingRsvp.status === "going") return "참여로 등록됨 (클릭 시 수정)";
    if (existingRsvp.status === "not_going") return "불참으로 등록됨 (클릭 시 수정)";
    return "미정으로 등록됨 (클릭 시 수정)";
  };

  return (
    <>
      {/* 1. 히어로 섹션 메인 CTA 버튼 그룹 */}
      <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 pt-2">
        <Button
          type="button"
          size="lg"
          onClick={() => setIsJoinDialogOpen(true)}
          title={getStatusTitle()}
          className="h-11 px-6 font-bold shadow-md shadow-primary/20 gap-2 text-sm sm:text-base transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
        >
          {renderStatusIcon("size-4 sm:size-5")}
          <span>공연 참여</span>
        </Button>

        <Button
          asChild
          size="lg"
          variant="secondary"
          className="h-11 px-6 font-bold gap-2 text-sm sm:text-base border border-border/70 bg-card hover:bg-muted shadow-sm transition-all hover:scale-[1.02] active:scale-[0.98]"
        >
          <Link href={`/gigs/${gig.id}/nominations`}>
            <Music2 className="size-4 text-primary" />
            선곡회의
          </Link>
        </Button>
      </div>

      {/* 2. 모바일 하단 플로팅 바 (Sticky Bottom Action Bar) */}
      <div className="fixed bottom-[calc(4rem+env(safe-area-inset-bottom,0px))] left-0 right-0 z-40 border-t border-border/60 bg-background/90 p-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] backdrop-blur-md sm:hidden">
        <div className="flex items-center gap-2.5 max-w-md mx-auto">
          <Button
            type="button"
            onClick={() => setIsJoinDialogOpen(true)}
            title={getStatusTitle()}
            className="flex-1 h-11 font-bold shadow-sm gap-1.5 text-sm cursor-pointer"
          >
            {renderStatusIcon("size-4")}
            <span>공연 참여</span>
          </Button>
          <Button
            asChild
            variant="secondary"
            className="flex-1 h-11 font-bold gap-1.5 text-sm border border-border/70 bg-card hover:bg-muted"
          >
            <Link href={`/gigs/${gig.id}/nominations`}>
              <Music2 className="size-4 text-primary" />
              선곡회의
            </Link>
          </Button>
        </div>
      </div>

      {/* 3. 공연 참가 신청 다이얼로그 (포스터 제외 공연 정보 + 선곡회의 정보 포함) */}
      <GigJoinDialog
        isOpen={isJoinDialogOpen}
        onClose={() => setIsJoinDialogOpen(false)}
        gig={gig}
        existingRsvp={existingRsvp}
        defaultPart={defaultPart}
        userName={userName}
        isLoggedIn={isLoggedIn}
      />
    </>
  );
}
