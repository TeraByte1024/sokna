"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import {
  AdminMember,
  AdminRecord,
  approveMemberAction,
  rejectMemberAction,
  grantAdminAction,
  revokeAdminAction,
  updateMemberByAdminAction,
} from "./actions";
import { toast } from "@/components/ui/sonner";
import {
  UserCheck,
  UserX,
  Clock,
  Search,
  CheckCircle2,
  ShieldCheck,
  Users,
  ShieldPlus,
  ShieldMinus,
  Crown,
  Pencil,
} from "lucide-react";

interface Props {
  initialAdmins: AdminRecord[];
  initialPendingMembers: AdminMember[];
  initialApprovedMembers: AdminMember[];
}

export function AdminMembersClient({
  initialAdmins,
  initialPendingMembers,
  initialApprovedMembers,
}: Props) {
  const [admins, setAdmins] = useState<AdminRecord[]>(initialAdmins);
  const [pendingMembers, setPendingMembers] = useState<AdminMember[]>(
    initialPendingMembers
  );
  const [approvedMembers, setApprovedMembers] = useState<AdminMember[]>(
    initialApprovedMembers
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isPendingTransition, startTransition] = useTransition();

  // 회원 정보 수정 모달 상태
  const [editingMember, setEditingMember] = useState<AdminMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editGeneration, setEditGeneration] = useState<string>("");
  const [editSelectedPreset, setEditSelectedPreset] = useState<string>("");
  const [editCustomPart, setEditCustomPart] = useState("");
  const [editError, setEditError] = useState<string | null>(null);

  const SESSION_PRESETS = [
    "보컬",
    "기타",
    "베이스",
    "드럼",
    "건반",
    "창작",
    "직접 입력",
  ] as const;

  // 빠른 확인을 위한 관리자 이메일 Set
  const adminEmailSet = new Set(
    admins.map((a) => a.email.toLowerCase().trim())
  );

  const showAlert = (type: "success" | "error", text: string) => {
    if (type === "success") {
      toast.success(text);
    } else {
      toast.error(text);
    }
  };

  /** 회원 정보 수정 모달 열기 */
  const openEditModal = (member: AdminMember) => {
    setEditingMember(member);
    setEditName(member.name);
    setEditGeneration(member.generation ? String(member.generation) : "");
    setEditError(null);

    const part = member.part?.trim() || "";
    if (!part) {
      setEditSelectedPreset("");
      setEditCustomPart("");
    } else if ((SESSION_PRESETS.slice(0, 6) as readonly string[]).includes(part)) {
      setEditSelectedPreset(part);
      setEditCustomPart("");
    } else {
      setEditSelectedPreset("직접 입력");
      setEditCustomPart(part);
    }
  };

  /** 회원 정보 수정 저장 실행 */
  const handleSaveEdit = () => {
    if (!editingMember) return;
    const trimmedName = editName.trim();
    if (!trimmedName) {
      setEditError("이름은 필수 입력 항목입니다.");
      return;
    }

    const genNum = parseInt(editGeneration, 10);
    if (isNaN(genNum) || genNum < 1) {
      setEditError("올바른 기수를 입력해 주세요. (1 이상의 숫자)");
      return;
    }

    let finalPart: string | null = null;
    if (editSelectedPreset === "직접 입력") {
      finalPart = editCustomPart.trim() || null;
    } else if (editSelectedPreset) {
      finalPart = editSelectedPreset;
    }

    setProcessingId(`edit-${editingMember.id}`);
    startTransition(async () => {
      const res = await updateMemberByAdminAction(
        editingMember.id,
        trimmedName,
        genNum,
        finalPart
      );
      setProcessingId(null);
      if (res.ok) {
        showAlert("success", `${trimmedName} 님의 회원 정보를 수정했습니다.`);
        setApprovedMembers((prev) =>
          prev.map((m) =>
            m.id === editingMember.id
              ? { ...m, name: trimmedName, generation: genNum, part: finalPart }
              : m
          )
        );
        setPendingMembers((prev) =>
          prev.map((m) =>
            m.id === editingMember.id
              ? { ...m, name: trimmedName, generation: genNum, part: finalPart }
              : m
          )
        );
        setAdmins((prev) =>
          prev.map((a) =>
            a.id === editingMember.id ? { ...a, name: trimmedName } : a
          )
        );
        setEditingMember(null);
      } else {
        setEditError(res.error || "회원 정보 수정에 실패했습니다.");
      }
    });
  };

  /** 회원가입 승인 핸들러 */
  const handleApprove = (member: AdminMember) => {
    setProcessingId(member.id);
    startTransition(async () => {
      const res = await approveMemberAction(member.id);
      setProcessingId(null);
      if (res.ok) {
        showAlert(
          "success",
          `${member.name} (${member.generation}기) 회원의 가입을 승인했습니다.`
        );
        setPendingMembers((prev) => prev.filter((m) => m.id !== member.id));
        setApprovedMembers((prev) => [
          {
            ...member,
            status: "approved",
            approved_at: new Date().toISOString(),
          },
          ...prev,
        ]);
      } else {
        showAlert("error", res.error || "승인 처리에 실패했습니다.");
      }
    });
  };

  /** 회원가입 거절 핸들러 */
  const handleReject = (member: AdminMember) => {
    const confirmed = window.confirm(
      `${member.name} (${member.generation}기) 님의 가입 신청을 거절하시겠습니까?`
    );
    if (!confirmed) return;

    setProcessingId(member.id);
    startTransition(async () => {
      const res = await rejectMemberAction(member.id);
      setProcessingId(null);
      if (res.ok) {
        showAlert("success", `${member.name} 님의 가입 신청을 거절했습니다.`);
        setPendingMembers((prev) => prev.filter((m) => m.id !== member.id));
      } else {
        showAlert("error", res.error || "거절 처리에 실패했습니다.");
      }
    });
  };

  const [grantTargetMember, setGrantTargetMember] = useState<AdminMember | null>(null);

  /** 일반 회원에게 관리자 권한 부여 팝업 열기 */
  const openGrantModal = (member: AdminMember) => {
    if (!member.email) {
      showAlert("error", "이메일 정보가 없는 회원은 관리자로 임명할 수 없습니다.");
      return;
    }
    setGrantTargetMember(member);
  };

  /** 관리자 권한 부여 확정 실행 */
  const confirmGrantAdmin = () => {
    if (!grantTargetMember) return;
    const target = grantTargetMember;

    setProcessingId(`grant-${target.id}`);
    startTransition(async () => {
      const res = await grantAdminAction(target.id);
      setProcessingId(null);
      setGrantTargetMember(null);
      if (res.ok) {
        showAlert("success", `${target.name} 님에게 관리자 권한을 부여했습니다.`);
        setAdmins((prev) => [
          ...prev,
          {
            id: target.id,
            email: target.email!,
            name: target.name,
            created_at: new Date().toISOString(),
          },
        ]);
      } else {
        showAlert("error", res.error || "관리자 권한 부여에 실패했습니다.");
      }
    });
  };

  /** 관리자 권한 해제 */
  const handleRevokeAdmin = (admin: AdminRecord) => {
    if (admins.length <= 1) {
      showAlert("error", "최소 1명의 관리자가 유지되어야 하므로 해제할 수 없습니다.");
      return;
    }

    const confirmed = window.confirm(
      `${admin.name || admin.email} 님의 관리자 권한을 해제하시겠습니까?`
    );
    if (!confirmed) return;

    setProcessingId(`revoke-${admin.id}`);
    startTransition(async () => {
      const res = await revokeAdminAction(admin.id);
      setProcessingId(null);
      if (res.ok) {
        showAlert(
          "success",
          `${admin.name || admin.email} 님의 관리자 권한을 해제했습니다.`
        );
        setAdmins((prev) => prev.filter((a) => a.id !== admin.id));
      } else {
        showAlert("error", res.error || "관리자 권한 해제에 실패했습니다.");
      }
    });
  };

  const filteredApprovedMembers = approvedMembers.filter((m) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      m.name.toLowerCase().includes(q) ||
      (m.part && m.part.toLowerCase().includes(q)) ||
      (m.email && m.email.toLowerCase().includes(q)) ||
      (m.generation && `${m.generation}기`.includes(q))
    );
  });

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "-";
    const d = new Date(isoString);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(
      d.getDate()
    ).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(
      d.getMinutes()
    ).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-8">
      {/* 1. 최상단 헤더 및 전체 통계 요약 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/50 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-primary" />
            <h1 className="text-2xl font-bold tracking-tight">회원 관리</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            소크나 부원 가입 신청 검토, 부원 명부 확인 및 관리자(운영진) 권한을 관리합니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs font-medium text-amber-600 dark:text-amber-400">
            <Clock className="w-3.5 h-3.5" />
            <span>승인 대기: <strong>{pendingMembers.length}건</strong></span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-xs font-medium text-primary">
            <Users className="w-3.5 h-3.5" />
            <span>회원: <strong>{approvedMembers.length}명</strong></span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/10 border border-purple-500/20 text-xs font-medium text-purple-600 dark:text-purple-400">
            <Crown className="w-3.5 h-3.5" />
            <span>관리자: <strong>{admins.length}명</strong></span>
          </div>
        </div>
      </div>


      {/* 2. 상단: 가입 승인 대기 목록 (테이블 목록 형식) */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold tracking-tight">가입 승인 대기</h2>
            <Badge
              variant={pendingMembers.length > 0 ? "destructive" : "secondary"}
              className="px-2 py-0.5 text-xs font-semibold"
            >
              {pendingMembers.length}건
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            신청 내역을 검토한 후 승인 또는 거절해 주세요.
          </span>
        </div>

        {pendingMembers.length === 0 ? (
          <Card className="border-dashed border-border/70 bg-muted/20">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <div className="w-9 h-9 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500 mb-2">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <h3 className="font-semibold text-base">대기 중인 가입 신청이 없습니다</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                모든 가입 신청이 검토 완료되었습니다.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="rounded-lg border border-amber-500/30 overflow-hidden bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs uppercase bg-amber-500/10 text-amber-900 dark:text-amber-200 border-b border-amber-500/20">
                  <tr>
                    <th className="px-4 py-3 font-semibold">기수</th>
                    <th className="px-4 py-3 font-semibold">이름</th>
                    <th className="px-4 py-3 font-semibold">세션(파트)</th>
                    <th className="px-4 py-3 font-semibold">이메일</th>
                    <th className="px-4 py-3 font-semibold">신청 일시</th>
                    <th className="px-4 py-3 font-semibold text-center">마케팅 동의</th>
                    <th className="px-4 py-3 text-right font-semibold">승인 처리</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/30">
                  {pendingMembers.map((member) => {
                    const isProcessing = processingId === member.id;
                    return (
                      <tr key={member.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold">
                          <Badge variant="secondary" className="font-semibold text-xs">
                            {member.generation ? `${member.generation}기` : "미입력"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground">
                          {member.name}
                        </td>
                        <td className="px-4 py-3 font-medium">
                          {member.part || "미지정"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                          {member.email || "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDate(member.applied_at)}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge
                            variant={member.marketing_opt_in ? "default" : "outline"}
                            className={`text-[11px] font-normal ${
                              member.marketing_opt_in
                                ? "bg-emerald-600/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                                : "text-muted-foreground"
                            }`}
                          >
                            {member.marketing_opt_in ? "동의함" : "미동의"}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                              disabled={isProcessing || isPendingTransition}
                              onClick={() => openEditModal(member)}
                              title="신청 정보 수정"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              수정
                            </Button>
                            <Button
                              variant="default"
                              size="sm"
                              className="h-7 px-2.5 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
                              disabled={isProcessing || isPendingTransition}
                              onClick={() => handleApprove(member)}
                            >
                              <UserCheck className="w-3.5 h-3.5 mr-1" />
                              {isProcessing ? "처리 중..." : "가입 승인"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10 border-destructive/30"
                              disabled={isProcessing || isPendingTransition}
                              onClick={() => handleReject(member)}
                            >
                              <UserX className="w-3.5 h-3.5 mr-0.5" />
                              거절
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* 구분선 */}
      <div className="border-t border-border/60 my-6" />

      {/* 3. 중간: 관리자(운영진) 명단 섹션 */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Crown className="w-5 h-5 text-amber-500" />
            <h2 className="text-lg font-bold tracking-tight">관리자 (운영진) 명단</h2>
            <Badge variant="secondary" className="px-2 py-0.5 text-xs font-semibold">
              총 {admins.length}명
            </Badge>
          </div>
          <span className="text-xs text-muted-foreground">
            공연 등록, 부원 승인 등 시스템 운영 권한을 가진 사용자 목록입니다.
          </span>
        </div>

        <div className="rounded-lg border border-border/60 overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/60 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-4 py-3 font-semibold">관리자 이름</th>
                  <th className="px-4 py-3 font-semibold">이메일 계정</th>
                  <th className="px-4 py-3 font-semibold">등록 일시</th>
                  <th className="px-4 py-3 text-right font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {admins.map((admin) => {
                  const isProcessing = processingId === `revoke-${admin.id}`;

                  return (
                    <tr key={admin.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 font-semibold flex items-center gap-2">
                        <Crown className="w-4 h-4 text-amber-500" />
                        <span>{admin.name || "관리자"}</span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                        {admin.email}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {formatDate(admin.created_at)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={admins.length <= 1 || isProcessing || isPendingTransition}
                          onClick={() => handleRevokeAdmin(admin)}
                          title={
                            admins.length <= 1
                              ? "최소 1명의 관리자가 필요합니다."
                              : "관리자 권한 해제"
                          }
                          className="text-xs text-destructive hover:bg-destructive/10 h-8"
                        >
                          <ShieldMinus className="w-3.5 h-3.5 mr-1" />
                          {isProcessing ? "처리 중..." : "권한 해제"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 구분선 */}
      <div className="border-t border-border/60 my-6" />

      {/* 4. 하단: 전체 승인 완료 부원 명단 및 정보 수정/관리자 권한 부여 */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-bold tracking-tight">전체 회원 명부 및 권한 설정</h2>
            <Badge variant="secondary" className="px-2 py-0.5 text-xs font-semibold">
              총 {approvedMembers.length}명
            </Badge>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="이름, 기수, 세션 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-9 text-xs sm:text-sm"
            />
          </div>
        </div>

        <div className="rounded-lg border border-border/60 overflow-hidden bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase bg-muted/60 text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="px-4 py-3 font-semibold">기수</th>
                  <th className="px-4 py-3 font-semibold">이름</th>
                  <th className="px-4 py-3 font-semibold">세션(파트)</th>
                  <th className="px-4 py-3 font-semibold">이메일</th>
                  <th className="px-4 py-3 font-semibold">승인 일시</th>
                  <th className="px-4 py-3 text-right font-semibold">관리</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30">
                {filteredApprovedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground text-xs">
                      검색 조건에 일치하는 회원이 없습니다.
                    </td>
                  </tr>
                ) : (
                  filteredApprovedMembers.map((m) => {
                    const isUserAdmin = Boolean(
                      m.email && adminEmailSet.has(m.email.toLowerCase().trim())
                    );
                    const isProcessingGrant = processingId === `grant-${m.id}`;

                    return (
                      <tr key={m.id} className="hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 font-semibold">
                          {m.generation ? `${m.generation}기` : "-"}
                        </td>
                        <td className="px-4 py-3 font-medium flex items-center gap-1.5">
                          <span>{m.name}</span>
                          {isUserAdmin && (
                            <span title="관리자">
                              <Crown className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {m.part || "-"}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs font-mono">
                          {m.email || <span className="italic text-muted-foreground/60">이메일 없음</span>}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {formatDate(m.approved_at || m.applied_at)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted"
                              onClick={() => openEditModal(m)}
                              title="회원 정보 수정"
                            >
                              <Pencil className="w-3.5 h-3.5 mr-1" />
                              수정
                            </Button>

                            {isUserAdmin ? (
                              <Badge variant="outline" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-xs font-medium">
                                관리자
                              </Badge>
                            ) : (
                              <Button
                                variant="outline"
                                size="sm"
                                disabled={!m.email || isProcessingGrant || isPendingTransition}
                                onClick={() => openGrantModal(m)}
                                title={
                                  !m.email
                                    ? "이메일 정보가 없어 관리자로 등록할 수 없습니다."
                                    : "이 회원에게 관리자 권한을 부여합니다."
                                }
                                className="text-xs h-7 gap-1 border-primary/30 hover:border-primary text-primary hover:bg-primary/10"
                              >
                                <ShieldPlus className="w-3.5 h-3.5" />
                                {isProcessingGrant ? "처리 중..." : "관리자 임명"}
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* 5. 관리자 권한 부여 확인 팝업 모달 */}
      {grantTargetMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-md rounded-xl border border-border/70 bg-card p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Crown className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-foreground">관리자 권한 부여</h3>
                <p className="text-xs text-muted-foreground">운영진 권한 승격 확인</p>
              </div>
            </div>

            <div className="py-2 space-y-2">
              <p className="text-base font-semibold text-foreground leading-relaxed">
                &ldquo;{grantTargetMember.name}님에게 관리자 권한을 부여하시겠습니까?&rdquo;
              </p>
              <div className="text-xs text-muted-foreground bg-muted/40 p-3 rounded-lg border border-border/40 space-y-1">
                <p>• <strong>대상자</strong>: {grantTargetMember.name} ({grantTargetMember.generation ? `${grantTargetMember.generation}기` : "기수 미입력"}, {grantTargetMember.part || "세션 미지정"})</p>
                <p>• <strong>이메일</strong>: {grantTargetMember.email}</p>
                <p className="pt-1 text-[11px] text-muted-foreground/90">
                  ※ 관리자로 임명되면 공연 개설, 회원 가입 승인 및 전체 회원 관리 권한을 행사할 수 있습니다.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
              <Button
                variant="outline"
                size="sm"
                disabled={isPendingTransition}
                onClick={() => setGrantTargetMember(null)}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground font-semibold"
                disabled={isPendingTransition}
                onClick={confirmGrantAdmin}
              >
                {isPendingTransition ? "부여 처리 중..." : "부여하기"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 6. 회원 정보 수정 모달 (관리자용) */}
      {editingMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="w-full max-w-lg rounded-xl border border-border/70 bg-card p-6 shadow-2xl space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-foreground">회원 정보 수정</h3>
                  <p className="text-xs text-muted-foreground">관리자 권한으로 부원의 실명, 기수, 세션 정보를 수정합니다.</p>
                </div>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              {/* 계정 이메일 (읽기 전용 안내) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground">계정 이메일</label>
                <Input
                  value={editingMember.email || "이메일 정보 없음"}
                  disabled
                  className="bg-muted/40 text-muted-foreground text-xs font-mono h-9 cursor-not-allowed"
                />
              </div>

              {/* 이름(실명) */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  이름 (실명) <span className="text-destructive">*</span>
                </label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  placeholder="실명 입력 (예: 홍길동)"
                  className="h-9"
                />
              </div>

              {/* 기수 */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                  기수 <span className="text-destructive">*</span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    value={editGeneration}
                    onChange={(e) => setEditGeneration(e.target.value)}
                    placeholder="기수 숫자 (예: 40)"
                    className="h-9 w-32"
                  />
                  <span className="text-xs text-muted-foreground">기 (1 이상의 숫자)</span>
                </div>
              </div>

              {/* 세션(파트) 선택 (선택 사항) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-foreground">
                    세션 (파트) <span className="text-xs font-normal text-muted-foreground">(선택 사항)</span>
                  </label>
                  {editSelectedPreset && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditSelectedPreset("");
                        setEditCustomPart("");
                      }}
                      className="text-[11px] text-muted-foreground hover:text-destructive transition-colors"
                    >
                      선택 해제 (미지정)
                    </button>
                  )}
                </div>

                {/* 세션 프리셋 뱃지 칩 */}
                <div className="flex flex-wrap gap-1.5">
                  {SESSION_PRESETS.map((preset) => {
                    const isSelected = editSelectedPreset === preset;
                    return (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setEditSelectedPreset("");
                            setEditCustomPart("");
                          } else {
                            setEditSelectedPreset(preset);
                            if (preset !== "직접 입력") {
                              setEditCustomPart("");
                            }
                          }
                        }}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                          isSelected
                            ? "bg-primary text-primary-foreground border-primary shadow-xs"
                            : "bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-border/60"
                        }`}
                      >
                        {preset}
                      </button>
                    );
                  })}
                </div>

                {/* 직접 입력 선택 시 */}
                {editSelectedPreset === "직접 입력" && (
                  <Input
                    value={editCustomPart}
                    onChange={(e) => setEditCustomPart(e.target.value)}
                    placeholder="세션명을 직접 입력해 주세요 (예: 신디사이저, 퍼커션)"
                    className="h-9 mt-1.5 text-xs"
                    autoFocus
                  />
                )}
              </div>

              {editError && (
                <div className="p-3 rounded-lg text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                  {editError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-border/50">
              <Button
                variant="outline"
                size="sm"
                disabled={isPendingTransition}
                onClick={() => setEditingMember(null)}
              >
                취소
              </Button>
              <Button
                size="sm"
                className="bg-primary text-primary-foreground font-semibold"
                disabled={isPendingTransition}
                onClick={handleSaveEdit}
              >
                {isPendingTransition ? "저장 중..." : "저장하기"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
