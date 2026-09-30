"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MemberEditDialog } from "@/components/admin/member-edit-dialog";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/sonner";
import {
  grantAdminAction,
  revokeAdminAction,
  type AdminMember,
  type AdminRecord,
} from "./actions";

type SortKey = "generation-desc" | "generation-asc" | "name" | "approved-desc" | "approved-asc";
const collator = new Intl.Collator("ko");
const selectClass = "h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MemberManagementClient({
  initialMembers,
  initialAdmins,
  loadError,
}: {
  initialMembers: AdminMember[];
  initialAdmins: AdminRecord[];
  loadError: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState(initialMembers);
  const [admins, setAdmins] = useState(initialAdmins);
  const [search, setSearch] = useState("");
  const [generation, setGeneration] = useState("");
  const [part, setPart] = useState("");
  const [adminFilter, setAdminFilter] = useState("all");
  const [sort, setSort] = useState<SortKey>("generation-desc");
  const [processing, setProcessing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMember | null>(null);

  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setAdmins(initialAdmins), [initialAdmins]);
  const adminIds = useMemo(() => new Set(admins.map((admin) => admin.id)), [admins]);
  const generations = useMemo(() => [...new Set(members.map((member) => member.generation).filter((value): value is number => value !== null))].sort((a, b) => b - a), [members]);
  const parts = useMemo(() => [...new Set(members.map((member) => member.part?.trim()).filter((value): value is string => Boolean(value)))].sort(collator.compare), [members]);

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("ko");
    return members.filter((member) => {
      if (generation && String(member.generation) !== generation) return false;
      if (part && member.part?.trim() !== part) return false;
      if (adminFilter === "admin" && !adminIds.has(member.id)) return false;
      if (adminFilter === "member" && adminIds.has(member.id)) return false;
      if (!query) return true;
      return [member.name, member.email ?? "", member.part ?? "", String(member.generation ?? "")]
        .some((value) => value.toLocaleLowerCase("ko").includes(query));
    }).sort((a, b) => {
      const nameOrder = collator.compare(a.name, b.name);
      switch (sort) {
        case "name": return nameOrder;
        case "generation-asc": return (a.generation ?? Infinity) - (b.generation ?? Infinity) || nameOrder;
        case "generation-desc": return (b.generation ?? -Infinity) - (a.generation ?? -Infinity) || nameOrder;
        case "approved-asc": return (a.approved_at ?? "").localeCompare(b.approved_at ?? "") || nameOrder;
        case "approved-desc": return (b.approved_at ?? "").localeCompare(a.approved_at ?? "") || nameOrder;
      }
    });
  }, [members, search, generation, part, adminFilter, sort, adminIds]);

  const grant = async (member: AdminMember) => {
    if (processing || !member.email) return;
    if (!window.confirm(`${member.name}님에게 관리자 권한을 부여하시겠습니까?`)) return;
    setProcessing(member.id);
    try {
      const result = await grantAdminAction(member.id);
      if (!result.ok) toast.error(result.error);
      else {
        setAdmins((current) => [...current, {
          id: member.id,
          name: member.name,
          email: member.email!,
          created_at: new Date().toISOString(),
        }]);
        toast.success("관리자 권한을 부여했습니다.");
        router.refresh();
      }
    } catch {
      toast.error("관리자 권한을 부여하지 못했습니다.");
    } finally {
      setProcessing(null);
    }
  };

  const revoke = async (admin: AdminRecord) => {
    if (processing) return;
    if (!window.confirm(`${admin.name || admin.email}님의 관리자 권한을 해제하시겠습니까?`)) return;
    setProcessing(admin.id);
    try {
      const result = await revokeAdminAction(admin.id);
      if (!result.ok) toast.error(result.error);
      else {
        setAdmins((current) => current.filter((row) => row.id !== admin.id));
        toast.success("관리자 권한을 해제했습니다.");
        router.refresh();
      }
    } catch {
      toast.error("관리자 권한을 해제하지 못했습니다.");
    } finally {
      setProcessing(null);
    }
  };

  return (
    <div className="w-full space-y-7">
      <AdminPageHeading
        title="회원(관리자) 관리"
        description="승인된 회원 정보를 확인하고 관리자 권한을 관리합니다."
        aside={<>
          <span className="rounded-full bg-muted px-3 py-1">회원 {members.length}명</span>
          <span className="rounded-full bg-muted px-3 py-1">관리자 {admins.length}명</span>
        </>}
      />

      {loadError && <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">회원 또는 관리자 명단을 불러오지 못했습니다. 새로고침해 주세요.</p>}

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="space-y-4 border-b border-border/60 bg-muted/20">
          <CardTitle className="text-lg">회원 목록</CardTitle>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <Input aria-label="회원 검색" placeholder="이름·이메일·기수·세션 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="lg:col-span-2" />
            <select aria-label="기수 필터" className={selectClass} value={generation} onChange={(event) => setGeneration(event.target.value)}>
              <option value="">전체 기수</option>
              {generations.map((value) => <option key={value} value={value}>{value}기</option>)}
            </select>
            <select aria-label="세션 필터" className={selectClass} value={part} onChange={(event) => setPart(event.target.value)}>
              <option value="">전체 세션</option>
              {parts.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <select aria-label="관리자 여부 필터" className={selectClass} value={adminFilter} onChange={(event) => setAdminFilter(event.target.value)}>
              <option value="all">전체 권한</option><option value="admin">관리자</option><option value="member">일반 회원</option>
            </select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>검색 결과 {visibleMembers.length}명</span>
            <select aria-label="회원 정렬" className={selectClass} value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
              <option value="generation-desc">기수 높은 순</option>
              <option value="generation-asc">기수 낮은 순</option>
              <option value="name">이름순</option>
              <option value="approved-desc">최근 승인순</option>
              <option value="approved-asc">오래된 승인순</option>
            </select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th scope="col" className="px-4 py-3">이름</th><th scope="col" className="px-4 py-3">기수</th>
                <th scope="col" className="px-4 py-3">세션</th><th scope="col" className="px-4 py-3">이메일</th>
                <th scope="col" className="px-4 py-3">권한</th><th scope="col" className="px-4 py-3 text-right">관리</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">
                {visibleMembers.length === 0
                  ? <tr><td colSpan={6} className="px-4 py-7 text-center text-muted-foreground">조건에 맞는 회원이 없습니다.</td></tr>
                  : visibleMembers.map((member) => (
                    <tr key={member.id} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-semibold">{member.name}</td>
                      <td className="px-4 py-3">{member.generation ? `${member.generation}기` : "-"}</td>
                      <td className="px-4 py-3">{member.part || "-"}</td>
                      <td className="px-4 py-3 text-muted-foreground">{member.email || "-"}</td>
                      <td className="px-4 py-3"><Badge variant={adminIds.has(member.id) ? "default" : "secondary"}>{adminIds.has(member.id) ? "관리자" : "회원"}</Badge></td>
                      <td className="space-x-1 whitespace-nowrap px-4 py-3 text-right">
                        <Button size="sm" variant="outline" disabled={Boolean(processing)} onClick={() => setEditing(member)}>수정</Button>
                        {!adminIds.has(member.id) && <Button size="sm" disabled={!member.email || Boolean(processing)} onClick={() => void grant(member)}>관리자 임명</Button>}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden border-border/70 shadow-sm">
        <CardHeader className="border-b border-border/60 bg-muted/20"><CardTitle className="text-lg">관리자 명단</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[530px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                <th scope="col" className="px-4 py-3">이름</th><th scope="col" className="px-4 py-3">이메일</th>
                <th scope="col" className="px-4 py-3">임명일</th><th scope="col" className="px-4 py-3 text-right">관리</th>
              </tr></thead>
              <tbody className="divide-y divide-border/60">{admins.map((admin) => (
                <tr key={admin.id} className="hover:bg-muted/20">
                  <td className="px-4 py-3 font-semibold">{admin.name || "관리자"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{admin.email}</td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(admin.created_at).toLocaleDateString("ko-KR")}</td>
                  <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" className="text-destructive" disabled={admins.length <= 1 || Boolean(processing)} onClick={() => void revoke(admin)}>권한 해제</Button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {editing && <MemberEditDialog member={editing} onClose={() => setEditing(null)} onSaved={(updated) => {
        setMembers((current) => current.map((member) => member.id === updated.id ? updated : member));
        setAdmins((current) => current.map((admin) => admin.id === updated.id ? { ...admin, name: updated.name } : admin));
      }} />}
    </div>
  );
}
