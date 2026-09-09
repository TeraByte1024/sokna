"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  addMemberAction,
  updateMemberAction,
  deleteMemberAction,
} from "./actions";
import type { Member } from "./page";

interface MembersInnerProps {
  initialMembers: Member[];
  isAdmin: boolean;
}

export function MembersInner({ initialMembers, isAdmin }: MembersInnerProps) {
  const [members, setMembers] = useState<Member[]>(initialMembers);

  // 관리자용 등록/수정 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"add" | "edit">("add");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // 폼 상태
  const [formName, setFormName] = useState("");
  const [formGen, setFormGen] = useState<number | "">("");
  const [formPart, setFormPart] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 부원 데이터 업데이트 감시
  useEffect(() => {
    setMembers(initialMembers);
  }, [initialMembers]);

  // 기수별 그룹화 (실제 데이터에 존재하는 기수만 동적으로 그룹화하여 최신 기수순 정렬)
  const groupedMembers = useMemo(() => {
    const groups: Record<number, Member[]> = {};

    // 실제 등록된 멤버 배치
    members.forEach((m) => {
      const gen = Number(m.generation);
      if (!groups[gen]) {
        groups[gen] = [];
      }
      groups[gen].push(m);
    });

    // 기수가 실제로 존재하고 멤버가 1명 이상인 기수들만 추출하여 정렬
    return Object.entries(groups)
      .map(([gen, list]) => ({
        generation: Number(gen),
        list: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .filter((g) => g.list.length > 0) // 부원이 없는 기수는 표시하지 않음
      .sort((a, b) => b.generation - a.generation); // 최신 기수가 위에 오도록 내림차순 정렬
  }, [members]);

  // 모달 열기 (isAdmin 검증)
  const openAddModal = () => {
    if (!isAdmin) return;
    setModalMode("add");
    setSelectedMember(null);
    setFormName("");
    setFormGen("");
    setFormPart("");
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (member: Member) => {
    if (!isAdmin) return;
    setModalMode("edit");
    setSelectedMember(member);
    setFormName(member.name);
    setFormGen(member.generation);
    setFormPart(member.part || "");
    setFormError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setSelectedMember(null);
    setFormError(null);
  };

  // 추가/수정 처리
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFormError(null);
    setIsSubmitting(true);

    if (!formName.trim()) {
      setFormError("이름을 입력해주세요.");
      setIsSubmitting(false);
      return;
    }

    if (formGen === "" || formGen < 1) {
      setFormError("기수를 올바르게 입력해주세요 (1 이상).");
      setIsSubmitting(false);
      return;
    }

    let res;
    if (modalMode === "add") {
      res = await addMemberAction(formName, Number(formGen), formPart);
    } else {
      if (!selectedMember) return;
      res = await updateMemberAction(
        selectedMember.id,
        formName,
        Number(formGen),
        formPart
      );
    }

    setIsSubmitting(false);
    if (res.ok) {
      closeModal();
    } else {
      setFormError(res.error);
    }
  };

  // 삭제 처리
  const handleDelete = async (id: string) => {
    if (!isAdmin) return;
    if (confirm("정말로 이 부원 정보를 삭제하시겠습니까?")) {
      const res = await deleteMemberAction(id);
      if (!res.ok) {
        alert(`삭제 실패: ${res.error}`);
      }
    }
  };

  return (
    <div className="space-y-8 w-full max-w-5xl mx-auto pb-20">
      {/* 상단 헤더 */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-white dark:via-indigo-200 dark:to-white bg-clip-text text-transparent">
            역대 부원 명단
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            소리로 크는 나무(소크나)를 빛낸 기수별 부원 목록입니다.
          </p>
        </div>

        {/* 관리자 등록 버튼: isAdmin일 때만 노출 */}
        {isAdmin && (
          <Button
            onClick={openAddModal}
            className="rounded-xl px-5 h-11 shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            <Plus className="size-4 mr-1.5" />
            신규 부원 추가
          </Button>
        )}
      </div>

      {/* 기수별 플랫 카드 리스트 (접기 효과 없이 항시 노출) */}
      {groupedMembers.length === 0 ? (
        <div className="text-center py-20 bg-slate-50 dark:bg-zinc-900/30 border rounded-3xl text-muted-foreground">
          등록된 부원 정보가 없습니다.
        </div>
      ) : (
        <div className="space-y-10">
          {groupedMembers.map((genGroup) => (
            <Card
              key={genGroup.generation}
              className="border border-slate-100 dark:border-zinc-800 shadow-sm rounded-2xl overflow-hidden"
            >
              {/* 기수 헤더 */}
              <div className="w-full flex items-center justify-between p-5 bg-slate-50/50 dark:bg-zinc-900/50 border-b border-slate-100 dark:border-zinc-800 font-bold text-lg">
                <div className="flex items-center gap-3">
                  <Users className="size-5 text-indigo-500" />
                  <span>{genGroup.generation}기</span>
                  <span className="text-xs font-normal text-muted-foreground bg-slate-100 dark:bg-zinc-800 px-2.5 py-0.5 rounded-full">
                    {genGroup.list.length}명
                  </span>
                </div>
              </div>

              {/* 부원 그리드 리스트 (플랫하게 전원 나열) */}
              <CardContent className="p-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {genGroup.list.map((member) => (
                    <div
                      key={member.id}
                      className="group relative flex items-center justify-between p-3.5 rounded-xl bg-slate-50 dark:bg-zinc-900 hover:bg-slate-100/70 dark:hover:bg-zinc-800/80 transition-colors border border-transparent dark:border-white/5"
                    >
                      <div className="space-y-0.5">
                        <p className="text-sm font-semibold text-foreground">
                          {member.name}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {member.part || "세션 없음"}
                        </p>
                      </div>

                      {/* 관리자 수정/삭제 버튼: isAdmin일 때만 노출 */}
                      {isAdmin && (
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => openEditModal(member)}
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded-md hover:bg-slate-200 dark:hover:bg-zinc-700"
                            title="수정"
                          >
                            <Edit2 className="size-3" />
                          </button>
                          <button
                            onClick={() => handleDelete(member.id)}
                            className="p-1 text-slate-400 hover:text-destructive rounded-md hover:bg-slate-200 dark:hover:bg-zinc-700"
                            title="삭제"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* --- ADD/EDIT MODAL: 오직 isAdmin일 때만 렌더링하고, DOM에 아예 존재하지 않게 처리 --- */}
      {isAdmin && (
        <AnimatePresence>
          {isModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* 배경 오버레이 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={closeModal}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />

              {/* 모달 박스 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-md bg-background border border-border p-6 rounded-2xl shadow-2xl z-10 space-y-6"
              >
                {/* 닫기 버튼 */}
                <button
                  onClick={closeModal}
                  className="absolute right-4 top-4 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-muted-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>

                <div>
                  <h3 className="text-xl font-bold">
                    {modalMode === "add" ? "신규 부원 추가" : "부원 정보 수정"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    역대 부원 목록에 등록할 신규 부원 정보를 입력합니다.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="memberName">이름</Label>
                    <Input
                      id="memberName"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      placeholder="이름 입력 (예: 홍길동)"
                      required
                      autoFocus
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="memberGen">기수</Label>
                      <Input
                        id="memberGen"
                        type="number"
                        value={formGen}
                        onChange={(e) =>
                          setFormGen(
                            e.target.value === "" ? "" : Number(e.target.value)
                          )
                        }
                        placeholder="기수 입력 (예: 40)"
                        min="1"
                        required
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="memberPart">세션 / 파트</Label>
                      <Input
                        id="memberPart"
                        value={formPart}
                        onChange={(e) => setFormPart(e.target.value)}
                        placeholder="세션 (예: 보컬, 기타)"
                      />
                    </div>
                  </div>

                  {formError && (
                    <p className="text-xs font-semibold text-destructive">
                      {formError}
                    </p>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 mr-1.5 animate-spin" />
                          저장 중...
                        </>
                      ) : (
                        "저장하기"
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={closeModal}
                      disabled={isSubmitting}
                      className="flex-1"
                    >
                      취소
                    </Button>
                  </div>
                </form>
              </motion.div>
            </div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
}
