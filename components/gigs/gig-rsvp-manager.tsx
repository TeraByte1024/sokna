"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, Loader2, Trash2, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { reviewGigRsvp } from "@/app/gigs/actions";
import type { GigRsvpWithGig } from "@/lib/gig";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function GigRsvpManager({ rsvps }: { rsvps: GigRsvpWithGig[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<{ id: number; decision: "approve" | "ignore" } | null>(null);

  const handleReview = async (rsvp: GigRsvpWithGig, decision: "approve" | "ignore") => {
    if (pending) return;
    setPending({ id: rsvp.id, decision });
    try {
      const result = await reviewGigRsvp(rsvp.gig_id, rsvp.id, rsvp.updated_at, decision);
      if (result.ok) {
        toast.success(decision === "approve" ? "공연 참여자로 등록되었습니다." : "신청을 무시했습니다. 다시 신청할 수 있습니다.");
      } else {
        toast.error(result.error);
      }
      router.refresh();
    } catch {
      toast.error("참가 신청 처리 중 문제가 발생했습니다.");
    } finally {
      setPending(null);
    }
  };

  const visibleRsvps = rsvps.filter((rsvp) => rsvp.status !== "undecided");
  const goingCount = visibleRsvps.filter((rsvp) => rsvp.status === "going").length;

  return (
    <Card className="min-w-0 border-border/60 shadow-sm overflow-hidden">
      <CardHeader className="border-b bg-muted/20 pb-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <UserCheck className="size-5 text-primary" />
            <CardTitle className="text-lg font-bold tracking-tight">참가 신청 현황</CardTitle>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          참여 {goingCount}명 · 불참 {visibleRsvps.filter((rsvp) => rsvp.status === "not_going").length}명
        </p>
      </CardHeader>
      <CardContent className="p-0">
        {visibleRsvps.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">참가 신청 내역이 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm whitespace-nowrap">
              <caption className="sr-only">공연별 참가 신청 현황</caption>
              <thead className="border-b border-border/50 bg-muted/20 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">공연제목</th>
                  <th scope="col" className="px-4 py-3 font-semibold">이름</th>
                  <th scope="col" className="px-4 py-3 font-semibold">기수</th>
                  <th scope="col" className="px-4 py-3 font-semibold">신청세션</th>
                  <th scope="col" className="px-4 py-3 font-semibold">비고</th>
                  <th scope="col" className="px-3 py-3 text-center font-semibold">승인</th>
                  <th scope="col" className="px-3 py-3 text-center font-semibold">무시</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {visibleRsvps.map((rsvp) => {
                  const name = rsvp.user?.name || "부원";
                  return (
                    <tr key={rsvp.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-medium">
                        <Link href={`/gigs/${rsvp.gig_id}`} className="text-foreground hover:text-primary hover:underline">{rsvp.gigTitle}</Link>
                      </td>
                      <td className="px-4 py-3 font-semibold">{name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{rsvp.user?.generation != null ? `${rsvp.user.generation}기` : "-"}</td>
                      <td className="px-4 py-3 font-medium text-primary">{rsvp.status === "not_going" ? "불참" : rsvp.part || "-"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{rsvp.note || "-"}</td>
                      <td className="px-3 py-2 text-center">
                        {rsvp.status === "going" ? (
                          <Button type="button" variant="ghost" size="icon" title="승인" aria-label={`${name} 참여 신청 승인`} disabled={Boolean(pending)} onClick={() => handleReview(rsvp, "approve")} className="text-emerald-600 hover:text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400 dark:hover:text-emerald-400">
                            {pending?.id === rsvp.id && pending.decision === "approve" ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-5" />}
                          </Button>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {rsvp.status === "going" ? (
                          <Button type="button" variant="ghost" size="icon" title="무시" aria-label={`${name} 참여 신청 무시`} disabled={Boolean(pending)} onClick={() => handleReview(rsvp, "ignore")} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                            {pending?.id === rsvp.id && pending.decision === "ignore" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                          </Button>
                        ) : <span className="text-muted-foreground">-</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
