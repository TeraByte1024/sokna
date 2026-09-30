"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { Check, ChevronRight, Pencil, X } from "lucide-react";
import { approveMemberAction, rejectMemberAction, type AdminMember } from "@/app/admin/members/actions";
import { reviewGigRsvp } from "@/app/gigs/actions";
import { MemberEditDialog } from "@/components/admin/member-edit-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/components/ui/sonner";

const applicationDateTime = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatElapsedTime(timestamp: string, now: number) {
  const minutes = Math.floor(Math.max(0, now - new Date(timestamp).getTime()) / 60_000);
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  if (minutes < 1_440) return `${Math.floor(minutes / 60)}시간 전`;
  return `${Math.floor(minutes / 1_440)}일 전`;
}

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
  const [now, setNow] = useState(() => Date.now());
  const [processing, setProcessing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMember | null>(null);
  const [selected, setSelected] = useState<{ kind: "member"; item: AdminMember } | { kind: "rsvp"; item: PendingGigRsvp } | null>(null);

  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setRsvps(initialRsvps), [initialRsvps]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const reviewMember = async (member: AdminMember, decision: "approve" | "reject") => {
    if (processing) return;
    if (!window.confirm(`${member.name}님의 가입 신청을 ${decision === "approve" ? "승인" : "반려"}하시겠습니까?`)) return;
    setProcessing(`member-${member.id}`);
    try {
      const result = decision === "approve"
        ? await approveMemberAction(member.id)
        : await rejectMemberAction(member.id);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setMembers((current) => current.filter((row) => row.id !== member.id));
        setSelected(null);
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
    if (!window.confirm(`${rsvp.user?.name || "회원"}님의 ${rsvp.gigTitle} 공연 참가 신청을 ${decision === "approve" ? "승인" : "반려"}하시겠습니까?`)) return;
    setProcessing(`rsvp-${rsvp.id}`);
    try {
      const result = await reviewGigRsvp(rsvp.gig_id, rsvp.id, rsvp.updated_at, decision);
      if (!result.ok) {
        toast.error(result.error);
      } else {
        setRsvps((current) => current.filter((row) => row.id !== rsvp.id));
        setSelected(null);
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
              : <>
                <div className="md:hidden">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground"><tr>
                      <th scope="col" className="w-[104px] px-3 py-3">이름</th>
                      <th scope="col" className="w-12 px-1 py-3">기수</th>
                      <th scope="col" className="px-2 py-3">세션</th>
                      <th scope="col" className="w-[88px] pl-1 pr-3 py-3 text-right"><span className="sr-only">신청 경과 및 상세 보기</span></th>
                    </tr></thead>
                    <tbody className="divide-y divide-border/60">{members.map((member) => (
                      <tr key={member.id} role="button" tabIndex={0} aria-label={`${member.name} 가입 신청 처리`}
                        onClick={() => setSelected({ kind: "member", item: member })}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected({ kind: "member", item: member }); } }}
                        className="group cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                        <td className="px-3 py-3.5 font-semibold"><span className="block max-w-[5em] truncate">{member.name}</span></td>
                        <td className="whitespace-nowrap px-1 py-3.5">{member.generation ? `${member.generation}기` : "-"}</td>
                        <td className="truncate whitespace-nowrap px-1 py-3.5" title={member.part || undefined}>{member.part || "-"}</td>
                        <td className="pl-1 pr-3 py-3.5 text-right text-muted-foreground group-hover:text-foreground" title={applicationDateTime.format(new Date(member.applied_at))}><span className="flex items-center justify-end gap-0.5 whitespace-nowrap"><span suppressHydrationWarning>{formatElapsedTime(member.applied_at, now)}</span><ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" /></span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                    <th scope="col" className="px-4 py-3">이름</th><th scope="col" className="px-4 py-3">기수</th>
                    <th scope="col" className="px-4 py-3">세션</th><th scope="col" className="px-4 py-3">이메일</th>
                    <th scope="col" className="px-4 py-3"><span className="sr-only">신청 경과</span></th><th scope="col" className="px-4 py-3 text-right">처리</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/60">{members.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold">{member.name}</td>
                      <td className="px-4 py-3">{member.generation ? `${member.generation}기` : "-"}</td>
                      <td className="px-4 py-3">{member.part || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{member.email || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground" title={applicationDateTime.format(new Date(member.applied_at))} suppressHydrationWarning>{formatElapsedTime(member.applied_at, now)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button variant="outline" className="h-10 gap-1.5 px-3" disabled={Boolean(processing)} onClick={() => setEditing(member)}><Pencil className="size-4" />수정</Button>
                          <Button className="h-10 gap-1.5 bg-emerald-600 px-3 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700" disabled={Boolean(processing)} onClick={() => void reviewMember(member, "approve")}><Check className="size-4 text-white" />승인</Button>
                          <Button variant="destructive" className="h-10 gap-1.5 px-3" disabled={Boolean(processing)} onClick={() => void reviewMember(member, "reject")}><X className="size-4" />반려</Button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </>}
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20">
          <CardTitle className="text-lg">공연 참가 신청 <span className="text-sm font-normal text-muted-foreground">{rsvps.length}건</span></CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rsvpError ? <p role="alert" className="p-5 text-sm text-destructive">공연 신청을 불러오지 못했습니다. 새로고침해 주세요.</p>
            : rsvps.length === 0 ? <p className="p-6 text-sm text-muted-foreground">대기 중인 공연 참가 신청이 없습니다.</p>
              : <>
                <div className="md:hidden">
                  <table className="w-full table-fixed text-left text-xs">
                    <thead className="bg-muted/40 text-muted-foreground"><tr>
                      <th scope="col" className="pl-3 pr-1 py-3">공연</th>
                      <th scope="col" className="w-[92px] px-1 py-3">이름</th>
                      <th scope="col" className="w-[58px] px-1 py-3">세션</th>
                      <th scope="col" className="w-[88px] pl-1 pr-3 py-3 text-right"><span className="sr-only">신청 경과 및 상세 보기</span></th>
                    </tr></thead>
                    <tbody className="divide-y divide-border/60">{rsvps.map((rsvp) => (
                      <tr key={rsvp.id} role="button" tabIndex={0} aria-label={`${rsvp.user?.name || "회원"} 공연 참가 신청 처리`}
                        onClick={() => setSelected({ kind: "rsvp", item: rsvp })}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected({ kind: "rsvp", item: rsvp }); } }}
                        className="group cursor-pointer transition-colors hover:bg-muted/50 active:bg-muted/70 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                        <td className="truncate whitespace-nowrap pl-3 pr-1 py-3.5" title={rsvp.gigTitle}>{rsvp.gigTitle}</td>
                        <td className="px-1 py-3.5 font-semibold"><span className="block max-w-[5em] truncate">{rsvp.user?.name || "회원"}</span></td>
                        <td className="truncate whitespace-nowrap px-1 py-3.5" title={rsvp.part || undefined}>{rsvp.part || "-"}</td>
                        <td className="pl-1 pr-3 py-3.5 text-right text-muted-foreground group-hover:text-foreground" title={applicationDateTime.format(new Date(rsvp.updated_at))}><span className="flex items-center justify-end gap-0.5 whitespace-nowrap"><span suppressHydrationWarning>{formatElapsedTime(rsvp.updated_at, now)}</span><ChevronRight aria-hidden="true" className="size-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" /></span></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                    <th scope="col" className="px-4 py-3">공연</th><th scope="col" className="px-4 py-3">이름</th>
                    <th scope="col" className="px-4 py-3">기수</th><th scope="col" className="px-4 py-3">신청 세션</th>
                    <th scope="col" className="px-4 py-3">비고</th><th scope="col" className="whitespace-nowrap px-4 py-3"><span className="sr-only">신청 경과</span></th><th scope="col" className="px-4 py-3 text-right">처리</th>
                  </tr></thead>
                  <tbody className="divide-y divide-border/60">{rsvps.map((rsvp) => (
                    <tr key={rsvp.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium"><Link className="hover:underline" href={`/admin/gigs/${rsvp.gig_id}`}>{rsvp.gigTitle}</Link></td>
                      <td className="px-4 py-3 font-semibold">{rsvp.user?.name || "회원"}</td>
                      <td className="px-4 py-3">{rsvp.user?.generation ? `${rsvp.user.generation}기` : "-"}</td>
                      <td className="px-4 py-3">{rsvp.part || "-"}</td>
                      <td className="max-w-xs whitespace-normal px-4 py-3 text-muted-foreground">{rsvp.note || "-"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-muted-foreground" title={applicationDateTime.format(new Date(rsvp.updated_at))} suppressHydrationWarning>{formatElapsedTime(rsvp.updated_at, now)}</td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="flex justify-end gap-2">
                          <Button className="h-10 gap-1.5 bg-emerald-600 px-3 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700" disabled={Boolean(processing)} onClick={() => void reviewRsvp(rsvp, "approve")}><Check className="size-4 text-white" />승인</Button>
                          <Button variant="destructive" className="h-10 gap-1.5 px-3" disabled={Boolean(processing)} onClick={() => void reviewRsvp(rsvp, "reject")}><X className="size-4" />반려</Button>
                        </div>
                      </td>
                    </tr>
                  ))}</tbody>
                </table>
                </div>
              </>}
        </CardContent>
      </Card>
      {selected && createPortal(
        <div role="dialog" aria-modal="true" aria-labelledby="approval-detail-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
          onMouseDown={(event) => { if (event.target === event.currentTarget && !processing) setSelected(null); }}>
          <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <h2 id="approval-detail-title" className="text-lg font-bold">{selected.kind === "member" ? "가입 신청 처리" : "공연 참가 신청 처리"}</h2>
              <Button type="button" variant="ghost" size="icon" aria-label="닫기" disabled={Boolean(processing)} onClick={() => setSelected(null)}><X className="size-4" /></Button>
            </div>
            {selected.kind === "member" ? (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">이름</dt><dd className="font-semibold">{selected.item.name}</dd>
                <dt className="text-muted-foreground">기수</dt><dd>{selected.item.generation ? `${selected.item.generation}기` : "-"}</dd>
                <dt className="text-muted-foreground">세션</dt><dd>{selected.item.part || "-"}</dd>
                <dt className="text-muted-foreground">이메일</dt><dd className="break-all">{selected.item.email || "-"}</dd>
                <dt className="text-muted-foreground">신청일시</dt><dd>{applicationDateTime.format(new Date(selected.item.applied_at))}</dd>
              </dl>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-3 text-sm">
                <dt className="text-muted-foreground">공연</dt><dd className="font-semibold">{selected.item.gigTitle}</dd>
                <dt className="text-muted-foreground">이름</dt><dd>{selected.item.user?.name || "회원"}</dd>
                <dt className="text-muted-foreground">기수</dt><dd>{selected.item.user?.generation ? `${selected.item.user.generation}기` : "-"}</dd>
                <dt className="text-muted-foreground">신청 세션</dt><dd>{selected.item.part || "-"}</dd>
                <dt className="text-muted-foreground">비고</dt><dd className="whitespace-pre-wrap break-words">{selected.item.note || "-"}</dd>
                <dt className="text-muted-foreground">신청일시</dt><dd>{applicationDateTime.format(new Date(selected.item.updated_at))}</dd>
              </dl>
            )}
            <div className="flex flex-wrap justify-end gap-2 border-t border-border/60 pt-4">
              {selected.kind === "member" && <Button variant="outline" disabled={Boolean(processing)} onClick={() => { setEditing(selected.item); setSelected(null); }}><Pencil className="size-4" />수정</Button>}
              <Button className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-600 dark:text-white dark:hover:bg-emerald-700"
                disabled={Boolean(processing)} onClick={() => selected.kind === "member" ? void reviewMember(selected.item, "approve") : void reviewRsvp(selected.item, "approve")}><Check className="size-4 text-white" />승인</Button>
              <Button variant="destructive" disabled={Boolean(processing)}
                onClick={() => selected.kind === "member" ? void reviewMember(selected.item, "reject") : void reviewRsvp(selected.item, "reject")}><X className="size-4" />반려</Button>
            </div>
          </div>
        </div>,
        document.body,
      )}
      {editing && <MemberEditDialog
        member={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => setMembers((current) => current.map((row) => row.id === updated.id ? updated : row))}
      />}
    </div>
  );
}
