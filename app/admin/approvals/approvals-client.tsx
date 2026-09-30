"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { approveMemberAction, rejectMemberAction, type AdminMember } from "@/app/admin/members/actions";
import { reviewGigRsvp } from "@/app/gigs/actions";
import { MemberEditDialog } from "@/components/admin/member-edit-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

export type PendingGigRsvp = {
  id: number;
  gig_id: number;
  part: string | null;
  note: string | null;
  updated_at: string;
  gigTitle: string;
  user: { name: string; generation: number | null } | null;
};

export function ApprovalsClient({
  initialMembers,
  initialRsvps,
  memberError,
  rsvpError,
}: {
  initialMembers: AdminMember[];
  initialRsvps: PendingGigRsvp[];
  memberError: boolean;
  rsvpError: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [rsvps, setRsvps] = useState(initialRsvps);
  const [processing, setProcessing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setRsvps(initialRsvps), [initialRsvps]);

  const reviewMember = async (member: AdminMember, decision: "approve" | "reject") => {
    if (processing) return;
    if (decision === "reject" && !window.confirm(`${member.name}님의 가입 신청을 반려하시겠습니까?`)) return;
    setProcessing(`member-${member.id}`);
    try {
      const result = decision === "approve"
        ? await approveMemberAction(member.id)
        : await rejectMemberAction(member.id);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setMembers((current) => current.filter((row) => row.id !== member.id));
        toast.success(decision === "approve" ? "가입 신청을 승인했습니다." : "가입 신청을 반려했습니다.");
        router.refresh();
      }
    } catch {
      toast.error("가입 신청 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessing(null);
    }
  };

  const reviewRsvp = async (rsvp: PendingGigRsvp, decision: "approve" | "reject") => {
    if (processing) return;
    if (decision === "reject" && !window.confirm(`${rsvp.user?.name || "회원"}님의 공연 신청을 반려하시겠습니까?`)) return;
    setProcessing(`rsvp-${rsvp.id}`);
    try {
      const result = await reviewGigRsvp(rsvp.gig_id, rsvp.id, rsvp.updated_at, decision);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setRsvps((current) => current.filter((row) => row.id !== rsvp.id));
        toast.success(decision === "approve" ? "공연 참여자로 등록했습니다." : "공연 신청을 반려했습니다.");
        router.refresh();
      }
    } catch {
      toast.error("공연 신청 처리 중 오류가 발생했습니다.");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="space-y-7">
      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20">
          <CardTitle className="text-lg">가입 신청 <span className="text-sm font-normal text-muted-foreground">{members.length}건</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {memberError ? <p role="alert" className="p-5 text-sm text-destructive">가입 신청을 불러오지 못했습니다. 새로고침해 주세요.</p>
            : members.length === 0 ? <p className="p-6 text-sm text-muted-foreground">대기 중인 가입 신청이 없습니다.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[730px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                    <th scope="col" className="px-4 py-3">이름</th><th scope="col" className="px-4 py-3">기수</th>
                    <th scope="col" className="px-4 py-3">세션</th><th scope="col" className="px-4 py-3">이메일</th>
                    <th scope="col" className="px-4 py-3">신청일</th><th scope="col" className="px-4 py-3 text-right">처리</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/60">{members.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold">{member.name}</td>
                      <td className="px-4 py-3">{member.generation ? `${member.generation}기` : "-"}</td>
                      <td className="px-4 py-3">{member.part || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{member.email || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(member.applied_at).toLocaleDateString("ko-KR")}</td>
                      <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={Boolean(processing)} onClick={() => setEditing(member)}>수정</Button>
                        <Button size="sm" disabled={Boolean(processing)} onClick={() => void reviewMember(member, "approve")}>승인</Button>
                        <Button size="sm" variant="outline" className="text-destructive" disabled={Boolean(processing)} onClick={() => void reviewMember(member, "reject")}>반려</Button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20">
          <CardTitle className="text-lg">공연 참가 신청 <span className="text-sm font-normal text-muted-foreground">{rsvps.length}건</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rsvpError ? <p role="alert" className="p-5 text-sm text-destructive">공연 신청을 불러오지 못했습니다. 새로고침해 주세요.</p>
            : rsvps.length === 0 ? <p className="p-6 text-sm text-muted-foreground">대기 중인 공연 참가 신청이 없습니다.</p>
              : <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                    <th scope="col" className="px-4 py-3">공연</th><th scope="col" className="px-4 py-3">이름</th>
                    <th scope="col" className="px-4 py-3">기수</th><th scope="col" className="px-4 py-3">신청 세션</th>
                    <th scope="col" className="px-4 py-3">비고</th><th scope="col" className="px-4 py-3 text-right">처리</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/60">{rsvps.map((rsvp) => (
                    <tr key={rsvp.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium"><Link className="hover:underline" href={`/admin/gigs/${rsvp.gig_id}`}>{rsvp.gigTitle}</Link></td>
                      <td className="px-4 py-3 font-semibold">{rsvp.user?.name || "회원"}</td>
                      <td className="px-4 py-3">{rsvp.user?.generation ? `${rsvp.user.generation}기` : "-"}</td>
                      <td className="px-4 py-3">{rsvp.part || "-"}</td>
                      <td className="max-w-xs whitespace-normal px-4 py-3 text-muted-foreground">{rsvp.note || "-"}</td>
                      <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" disabled={Boolean(processing)} onClick={() => void reviewRsvp(rsvp, "approve")}>승인</Button>
                        <Button size="sm" variant="outline" className="text-destructive" disabled={Boolean(processing)} onClick={() => void reviewRsvp(rsvp, "reject")}>반려</Button>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>}
        </CardContent>
      </Card>
      {editing && <MemberEditDialog
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setMembers((current) => current.map((row) => row.id === updated.id ? updated : row))}
      />}
    </div>
  );
}
