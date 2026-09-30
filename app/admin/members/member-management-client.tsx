"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { MemberEditDialog } from "@/components/admin/member-edit-dialog";
import { AdminPageHeading } from "@/components/admin/admin-page-heading";
import { ChevronDown, ChevronRight, Crown, Filter, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/sonner";
import {
  grantAdminAction,
  revokeAdminAction,
  type AdminMember,
  type AdminRecord,
} from "./actions";

type SortKey = "generation-high" | "generation-low" | "name" | "approved-desc" | "approved-asc";
const collator = new Intl.Collator("ko");
type FilterOption = { value: string; label: string };

function MemberFilterDropdown({
  label,
  value,
  options,
  onChange,
  className = "",
}: {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  className?: string;
}) {
  const selectedLabel = options.find((option) => option.value === value)?.label ?? label;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" aria-label={label} className={`h-10 w-full justify-between gap-2 border-input bg-background px-3 font-normal ${className}`}>
          <span className="truncate">{selectedLabel}</span>
          <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value} className="cursor-pointer">
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
  const [sort, setSort] = useState<SortKey>("generation-high");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [processing, setProcessing] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminMember | null>(null);
  const [selected, setSelected] = useState<AdminMember | null>(null);

  useEffect(() => setMembers(initialMembers), [initialMembers]);
  useEffect(() => setAdmins(initialAdmins), [initialAdmins]);
  const adminIds = useMemo(() => new Set(admins.map((admin) => admin.id)), [admins]);
  const generations = useMemo(() => [...new Set(members.map((member) => member.generation).filter((value): value is number => value !== null))].sort((a, b) => a - b), [members]);
  const parts = useMemo(() => [...new Set(members.map((member) => member.part?.trim()).filter((value): value is string => Boolean(value)))].sort(collator.compare), [members]);

  const activeFilterCount = Number(Boolean(generation)) + Number(Boolean(part)) + Number(adminFilter !== "all");

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
        case "generation-high":
          if (a.generation === null && b.generation === null) return nameOrder;
          if (a.generation === null) return 1;
          if (b.generation === null) return -1;
          return a.generation - b.generation || nameOrder;
        case "generation-low":
          if (a.generation === null && b.generation === null) return nameOrder;
          if (a.generation === null) return 1;
          if (b.generation === null) return -1;
          return b.generation - a.generation || nameOrder;
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
      />

      {loadError && <p role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">회원 또는 관리자 명단을 불러오지 못했습니다. 새로고침해 주세요.</p>}

      <div className="space-y-4">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Input aria-label="회원 검색" placeholder="이름·이메일·기수·세션 검색" value={search} onChange={(event) => setSearch(event.target.value)} className="min-w-0 flex-1" />
            <Button type="button" variant={isFilterOpen || activeFilterCount > 0 ? "secondary" : "outline"} size="sm"
              aria-expanded={isFilterOpen} aria-controls="member-filters"
              onClick={() => setIsFilterOpen((current) => !current)}
              className={`h-10 shrink-0 gap-1.5 px-3 text-xs font-semibold ${activeFilterCount > 0 ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15" : ""} ${isFilterOpen ? "ring-1 ring-primary/30" : ""}`}>
              <Filter className="size-3.5" />
              <span>필터</span>
              {activeFilterCount > 0 && <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{activeFilterCount}</span>}
              <ChevronDown className={`size-3 text-muted-foreground transition-transform duration-200 ${isFilterOpen ? "rotate-180" : ""}`} />
            </Button>
          </div>
          {isFilterOpen && (
            <div id="member-filters" className="grid gap-2 rounded-2xl border border-border/70 bg-muted/30 p-3 shadow-xs animate-in fade-in-50 duration-150 sm:grid-cols-3 sm:p-4">
              <MemberFilterDropdown label="기수 필터" value={generation} onChange={setGeneration}
                options={[{ value: "", label: "전체 기수" }, ...generations.map((value) => ({ value: String(value), label: `${value}기` }))]} />
              <MemberFilterDropdown label="세션 필터" value={part} onChange={setPart}
                options={[{ value: "", label: "전체 세션" }, ...parts.map((value) => ({ value, label: value }))]} />
              <MemberFilterDropdown label="관리자 여부 필터" value={adminFilter} onChange={setAdminFilter}
                options={[{ value: "all", label: "전체 권한" }, { value: "admin", label: "관리자" }, { value: "member", label: "일반 회원" }]} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>검색 결과 {visibleMembers.length}명</span>
            <MemberFilterDropdown label="회원 정렬" value={sort} onChange={(value) => setSort(value as SortKey)} className="w-auto min-w-36"
              options={[
                { value: "generation-high", label: "기수 높은 순" },
                { value: "generation-low", label: "기수 낮은 순" },
                { value: "name", label: "이름순" },
                { value: "approved-desc", label: "최근 승인순" },
                { value: "approved-asc", label: "오래된 승인순" },
              ]} />
          </div>
        </div>
        <Card className="overflow-hidden border-border/70 shadow-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[320px] table-fixed text-left text-xs sm:text-sm md:min-w-[780px] md:table-auto">
                <thead className="bg-muted/40 text-xs text-muted-foreground"><tr>
                  <th scope="col" className="w-[104px] px-2 py-3 md:w-auto md:px-4">이름</th><th scope="col" className="w-[42px] whitespace-nowrap px-1 py-3 md:w-auto md:px-4">기수</th>
                  <th scope="col" className="w-[64px] px-1 py-3 md:w-auto md:px-4">세션</th><th scope="col" className="hidden px-4 py-3 md:table-cell">이메일</th>
                  <th scope="col" className="w-[78px] whitespace-nowrap px-1 py-3 md:w-auto md:px-4">마케팅 수신</th><th scope="col" className="w-8 px-1 py-3 md:w-24 md:px-4"><span className="sr-only">상세 정보</span></th>
                </tr></thead>
                <tbody className="divide-y divide-border/60">
                  {visibleMembers.length === 0
                    ? <tr><td colSpan={6} className="px-4 py-7 text-center text-muted-foreground">조건에 맞는 회원이 없습니다.</td></tr>
                    : visibleMembers.map((member) => (
                      <tr key={member.id} role="button" tabIndex={0} aria-label={`${member.name} 상세 정보 보기`}
                        onClick={() => setSelected(member)}
                        onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelected(member); } }}
                        className="group cursor-pointer transition-colors hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring">
                        <td className="px-2 py-3 font-semibold md:px-4"><span className="flex min-w-0 items-center gap-1">{adminIds.has(member.id) && <Crown aria-label="관리자" className="size-4 shrink-0 text-amber-500" />}<span className="block max-w-[5em] truncate md:max-w-none">{member.name}</span></span></td>
                        <td className="whitespace-nowrap px-1 py-3 md:px-4">{member.generation ? `${member.generation}기` : "-"}</td>
                        <td className="truncate whitespace-nowrap px-1 py-3 md:px-4" title={member.part || undefined}>{member.part || "-"}</td>
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{member.email || "-"}</td>
                        <td className="whitespace-nowrap px-1 py-3 md:px-4">{member.marketing_opt_in ? "동의" : "미동의"}</td>
                        <td className="px-1 py-3 text-right md:px-4"><span className="inline-flex items-center gap-1 whitespace-nowrap text-muted-foreground md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-visible:opacity-100"><span className="hidden md:inline">수정하기</span><ChevronRight className="size-4 shrink-0" /></span></td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
      {selected && createPortal((() => {
        const member = members.find((row) => row.id === selected.id) ?? selected;
        const admin = admins.find((row) => row.id === member.id);
        return (
          <div role="dialog" aria-modal="true" aria-labelledby="member-detail-title"
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4"
            onMouseDown={(event) => { if (event.target === event.currentTarget && !processing) setSelected(null); }}>
            <div className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg space-y-5 overflow-y-auto rounded-xl border border-border bg-card p-5 shadow-2xl sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="member-detail-title" className="text-lg font-bold">회원 정보</h2>
                </div>
                <Button variant="ghost" size="icon" aria-label="닫기" onClick={() => setSelected(null)}><X className="size-4" /></Button>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3 text-sm">
                <dt className="text-muted-foreground">이름</dt><dd className="flex items-center gap-1.5 font-semibold">{admin && <Crown aria-label="관리자" className="size-4 text-amber-500" />}{member.name}</dd>
                <dt className="text-muted-foreground">기수</dt><dd>{member.generation ? `${member.generation}기` : "-"}</dd>
                <dt className="text-muted-foreground">세션</dt><dd>{member.part || "-"}</dd>
                <dt className="text-muted-foreground">이메일</dt><dd className="break-all">{member.email || "-"}</dd>
                <dt className="text-muted-foreground">마케팅 수신</dt><dd>{member.marketing_opt_in ? "동의" : "미동의"}</dd>
                <dt className="text-muted-foreground">관리자 임명일</dt><dd>{admin ? new Date(admin.created_at).toLocaleDateString("ko-KR") : "-"}</dd>
              </dl>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button variant="outline" onClick={() => { setSelected(null); setEditing(member); }}>회원 정보 수정</Button>
                {admin
                  ? <Button variant="outline" className="text-destructive" disabled={admins.length <= 1 || Boolean(processing)} onClick={() => void revoke(admin)}>관리자 해제</Button>
                  : <Button disabled={!member.email || Boolean(processing)} onClick={() => void grant(member)}>관리자 임명</Button>}
              </div>
            </div>
          </div>
        );
      })(), document.body)}
      {editing && <MemberEditDialog member={editing} onClose={() => setEditing(null)} onSaved={(updated) => {
        setMembers((current) => current.map((member) => member.id === updated.id ? updated : member));
        setAdmins((current) => current.map((admin) => admin.id === updated.id ? { ...admin, name: updated.name } : admin));
      }} />}
    </div>
  );
}
