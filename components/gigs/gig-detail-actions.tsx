"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type Gig, type GigRsvp } from "@/lib/gig";
import { Button } from "@/components/ui/button";
import { UserCheck, Music2, Clock } from "lucide-react";
import { NegativeStatusIcon as XCircle, UnknownStatusIcon as HelpCircle } from "@/components/ui/status-icons";
import { GigActionBar } from "@/components/gigs/gig-action-bar";
import { GigJoinDialog } from "@/components/gigs/gig-join-dialog";

interface GigDetailActionsProps {
  gig: Gig;
  existingRsvp: GigRsvp | null;
  isCurrentUserPerformer: boolean;
  canJoin: boolean;
  defaultPart?: string;
  userName?: string;
  isLoggedIn?: boolean;
}

export function GigDetailActions({
  gig,
  existingRsvp,
  isCurrentUserPerformer,
  canJoin,
  defaultPart = "",
  userName = "부원",
  isLoggedIn = false,
}: GigDetailActionsProps) {
  const [isJoinDialogOpen, setIsJoinDialogOpen] = useState(false);
  const searchParams = useSearchParams();
  const showJoin = isLoggedIn && canJoin && !isCurrentUserPerformer;

  // URL 쿼리에 ?join=true 가 있으면 자동으로 다이얼로그 팝업
  useEffect(() => {
    if (showJoin && searchParams.get("join") === "true") {
      setIsJoinDialogOpen(true);
    }
  }, [showJoin, searchParams]);

  // 비회원일 경우 렌더링하지 않음
  if (!isLoggedIn) {
    return null;
  }
  if (isCurrentUserPerformer) {
    return (
      <GigActionBar>
        <Button asChild size="lg" className="h-11 w-full gap-2 font-bold sm:w-auto">
          <Link href={`/gigs/${gig.id}/nominations`}>
            <Music2 className="size-4" aria-hidden="true" />
            선곡회의
          </Link>
        </Button>
      </GigActionBar>
    );
  }
  if (!showJoin) return null;

  // 내 참여 여부(RSVP)에 따른 아이콘
  const renderStatusIcon = (sizeClass = "size-4") => {
    if (!existingRsvp) {
      return <UserCheck className={`${sizeClass} shrink-0`} />;
    }
    if (existingRsvp.status === "going" && existingRsvp.review_status === "rejected") {
      return <XCircle className={`${sizeClass} text-rose-300 shrink-0`} />;
    }
    if (existingRsvp.status === "going") {
      return <Clock className={`${sizeClass} text-amber-300 shrink-0`} />;
    }
    if (existingRsvp.status === "not_going") {
      return <XCircle className={`${sizeClass} text-rose-300 shrink-0`} />;
    }
    return <HelpCircle className={`${sizeClass} text-amber-300 shrink-0`} />;
  };

  const getStatusTitle = () => {
    if (!existingRsvp) return "공연 참여 등록";
    if (existingRsvp.status === "going" && existingRsvp.review_status === "rejected") return "참여 신청 반려됨 (클릭 시 재신청)";
    if (existingRsvp.status === "going") return "참여 승인 대기 중 (클릭 시 수정)";
    if (existingRsvp.status === "not_going") return "불참으로 등록됨 (클릭 시 수정)";
    return "미정으로 등록됨 (클릭 시 수정)";
  };

  return (
    <>
      <GigActionBar>
        <Button
          type="button"
          size="lg"
          onClick={() => setIsJoinDialogOpen(true)}
          title={getStatusTitle()}
          aria-label={`공연 참여: ${getStatusTitle()}`}
          className="h-11 w-full gap-2 font-bold sm:w-auto"
        >
          {renderStatusIcon("size-4 sm:size-5")}
          <span>공연 참여</span>
        </Button>
      </GigActionBar>

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
