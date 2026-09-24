"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  Plus,
  Edit2,
  Trash2,
  X,
  Loader2,
  Calendar,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import {
  addPhotoAction,
  updatePhotoAction,
  deletePhotoAction,
} from "./actions";
import type { PhotoItem } from "./page";
import {
  LeaveConfirmDialog,
  useUnsavedChangesWarning,
} from "@/components/ui/leave-confirm-dialog";

interface PhotosInnerProps {
  initialPhotos: PhotoItem[];
  isAdmin: boolean;
}

export function PhotosInner({ initialPhotos, isAdmin }: PhotosInnerProps) {
  const [photos, setPhotos] = useState<PhotoItem[]>(initialPhotos);

  // 라이트박스 상세 모달 상태
  const [activePhoto, setActivePhoto] = useState<PhotoItem | null>(null);

  // 관리자용 등록/수정 모달 상태
  const [isManageModalOpen, setIsManageModalOpen] = useState(false);
  const [manageMode, setManageMode] = useState<"add" | "edit">("add");
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoItem | null>(null);

  // 폼 상태
  const [formUrl, setFormUrl] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formCaption, setFormCaption] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 사진 등록/수정 모달 dirty 상태 판별
  const isPhotoFormDirty = Boolean(
    isManageModalOpen &&
      (manageMode === "add"
        ? formUrl.trim() !== "" || formTitle.trim() !== "" || formCaption.trim() !== ""
        : selectedPhoto
        ? formUrl.trim() !== selectedPhoto.url.trim() ||
          formTitle.trim() !== selectedPhoto.title.trim() ||
          formCaption.trim() !== (selectedPhoto.caption || "").trim()
        : false)
  );

  const {
    showLeaveModal,
    cancelLeave,
    confirmLeave,
    triggerConfirm,
    markSubmitting,
  } = useUnsavedChangesWarning({
    isDirty: isPhotoFormDirty,
  });

  const handleCloseManageModal = () => {
    triggerConfirm(() => {
      setIsManageModalOpen(false);
      setSelectedPhoto(null);
    });
  };

  useEffect(() => {
    setPhotos(initialPhotos);
  }, [initialPhotos]);

  // 날짜 포맷팅 헬퍼
  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  // 사진 추가 모달 열기
  const openAddModal = () => {
    if (!isAdmin) return;
    setManageMode("add");
    setSelectedPhoto(null);
    setFormUrl("");
    setFormTitle("");
    setFormCaption("");
    setFormError(null);
    setIsManageModalOpen(true);
  };

  // 사진 수정 모달 열기
  const openEditModal = (photo: PhotoItem, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트(라이트박스 열기) 방지
    if (!isAdmin) return;
    setManageMode("edit");
    setSelectedPhoto(photo);
    setFormUrl(photo.url);
    setFormTitle(photo.title);
    setFormCaption(photo.caption || "");
    setFormError(null);
    setIsManageModalOpen(true);
  };

  // 사진 저장 처리
  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isAdmin) return;
    setFormError(null);
    setIsSubmitting(true);

    if (!formUrl.trim()) {
      setFormError("이미지 URL을 입력해주세요.");
      setIsSubmitting(false);
      return;
    }
    if (!formTitle.trim()) {
      setFormError("사진 제목을 입력해주세요.");
      setIsSubmitting(false);
      return;
    }

    let res;
    if (manageMode === "add") {
      res = await addPhotoAction(formUrl, formTitle, formCaption);
    } else {
      if (!selectedPhoto) return;
      res = await updatePhotoAction(
        selectedPhoto.id,
        formUrl,
        formTitle,
        formCaption
      );
    }

    setIsSubmitting(false);
    if (res.ok) {
      markSubmitting();
      setIsManageModalOpen(false);
      setSelectedPhoto(null);
    } else {
      setFormError(res.error);
    }
  };

  // 사진 삭제 처리
  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 카드 클릭 이벤트 방지
    if (!isAdmin) return;
    if (confirm("정말로 이 사진을 사진첩에서 삭제하시겠습니까?")) {
      const res = await deletePhotoAction(id);
      if (!res.ok) {
        alert(`삭제 실패: ${res.error}`);
      }
    }
  };

  return (
    <div className="space-y-10 w-full max-w-5xl mx-auto pb-20">
      {/* 상단 타이틀 헤더 */}
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b pb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 dark:from-white dark:via-indigo-200 dark:to-white bg-clip-text text-transparent">
            라이브 갤러리
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            소리로 크는 나무(소크나)의 열정적인 합주와 무대 위 스냅샷을 모아둔 아카이브입니다.
          </p>
        </div>

        {/* 관리자 등록 버튼: isAdmin일 때만 노출 */}
        {isAdmin && (
          <Button
            onClick={openAddModal}
            className="rounded-xl px-5 h-11 shadow-md bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
          >
            <Plus className="size-4 mr-1.5" />
            신규 사진 등록
          </Button>
        )}
      </div>

      {/* 사진 목록 그리드 */}
      {photos.length === 0 ? (
        <div className="text-center py-24 bg-slate-50 dark:bg-zinc-900/30 border border-dashed rounded-3xl text-muted-foreground flex flex-col items-center justify-center gap-3">
          <Camera className="size-10 text-slate-400" />
          <p className="text-sm">등록된 스냅샷 사진이 없습니다.</p>
          {isAdmin && (
            <Button onClick={openAddModal} variant="outline" className="mt-2">
              첫 사진 등록하기
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-10">
          {photos.map((photo, index) => {
            // 폴라로이드 스타일의 불규칙한 회전각 효과 부여
            const rotations = ["-rotate-2", "rotate-1", "-rotate-1", "rotate-2", "rotate-1", "-rotate-2"];
            const rotation = rotations[index % rotations.length];

            return (
              <motion.div
                key={photo.id}
                initial={{ opacity: 0, scale: 0.95 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.5, delay: (index % 3) * 0.05 }}
                className="flex justify-center"
              >
                {/* 폴라로이드 카드 프레임 */}
                <div
                  onClick={() => setActivePhoto(photo)}
                  className={`bg-white dark:bg-zinc-900 border border-slate-200/60 dark:border-zinc-800 shadow-lg p-4 pb-6 rounded-lg w-full max-w-[320px] cursor-pointer transition-all duration-500 ease-out transform ${rotation} hover:rotate-0 hover:scale-105 hover:shadow-2xl hover:z-10 group relative`}
                >
                  {/* 이미지 홀더 */}
                  <div className="aspect-[4/3] w-full bg-slate-100 dark:bg-zinc-950 rounded overflow-hidden relative border border-slate-200/20 dark:border-zinc-800">
                    <ResponsiveImage
                      src={photo.url}
                      alt={photo.title}
                      className="w-full h-full object-cover filter contrast-[1.05] grayscale group-hover:grayscale-0 transition-all duration-700"
                      sizes="(min-width: 1024px) 320px, (min-width: 640px) 50vw, 100vw"
                      preload={index === 0}
                    />
                  </div>
                  {/* 캡션 영역 */}
                  <div className="mt-4 text-left space-y-1 pl-1">
                    <h4 className="font-serif text-sm font-bold text-slate-800 dark:text-slate-200 tracking-tight truncate">
                      # {photo.title}
                    </h4>
                    <p className="text-[11px] text-muted-foreground font-serif italic truncate">
                      {photo.caption || "설명 없음"}
                    </p>
                  </div>

                  {/* 관리자 수정/삭제 버튼 hover 시 노출: isAdmin일 때만 */}
                  {isAdmin && (
                    <div className="absolute top-6 right-6 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 p-1.5 rounded-lg border border-white/10 shadow-lg z-20">
                      <button
                        onClick={(e) => openEditModal(photo, e)}
                        className="p-1.5 text-slate-200 hover:text-indigo-400 rounded-md hover:bg-slate-800 transition-colors"
                        title="수정"
                      >
                        <Edit2 className="size-3.5" />
                      </button>
                      <button
                        onClick={(e) => handleDelete(photo.id, e)}
                        className="p-1.5 text-slate-200 hover:text-destructive rounded-md hover:bg-slate-800 transition-colors"
                        title="삭제"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* --- LIGHTBOX DETAIL MODAL --- */}
      <AnimatePresence>
        {activePhoto && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* 오버레이 배경 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActivePhoto(null)}
              className="absolute inset-0 bg-black/90 backdrop-blur-md"
            />

            {/* 디테일 라이트박스 본체 */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl z-10 flex flex-col md:flex-row"
            >
              {/* 닫기 버튼 */}
              <button
                onClick={() => setActivePhoto(null)}
                className="absolute right-4 top-4 p-2 rounded-full bg-black/50 hover:bg-zinc-800/80 text-slate-400 hover:text-white transition-colors z-20"
              >
                <X className="size-5" />
              </button>

              {/* 이미지 영역 (좌측/상단) */}
              <div className="flex-1 bg-black flex items-center justify-center p-2 min-h-[300px] max-h-[500px] md:max-h-[600px] relative">
                {/* 확대 화면은 사용자가 선택한 원본을 표시합니다. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activePhoto.url}
                  alt={activePhoto.title}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* 디테일 텍스트 영역 (우측/하단) */}
              <div className="w-full md:w-80 bg-zinc-900 border-t md:border-t-0 md:border-l border-zinc-800 p-6 flex flex-col justify-between space-y-6 md:min-h-[450px]">
                <div className="space-y-4">
                  <div>
                    <span className="text-[10px] font-black uppercase text-indigo-400 tracking-wider">
                      SNAPSHOT DETAIL
                    </span>
                    <h3 className="text-xl font-bold text-white tracking-tight mt-1">
                      {activePhoto.title}
                    </h3>
                  </div>

                  {/* 등록 일자 */}
                  <div className="flex items-center gap-2 text-xs text-zinc-400">
                    <Calendar className="size-3.5 text-zinc-500" />
                    <span>등록일: {formatDate(activePhoto.created_at)}</span>
                  </div>

                  <div className="h-[1px] bg-zinc-800" />

                  {/* 간단한 설명 */}
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                      <Info className="size-3" /> DESCRIPTION
                    </span>
                    <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-line font-light">
                      {activePhoto.caption || "등록된 설명이 없습니다."}
                    </p>
                  </div>
                </div>

                <Button
                  onClick={() => setActivePhoto(null)}
                  variant="outline"
                  className="border-zinc-800 text-zinc-400 hover:bg-zinc-850 hover:text-white"
                >
                  닫기
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* --- ADMIN ADD/EDIT MANAGE MODAL: 오직 isAdmin일 때만 마운트 --- */}
      {isAdmin && (
        <AnimatePresence>
          {isManageModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              {/* 배경 오버레이 */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={handleCloseManageModal}
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              />

              {/* 관리 모달 박스 */}
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 15 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 15 }}
                className="relative w-full max-w-md bg-background border border-border p-6 rounded-2xl shadow-2xl z-10 space-y-6"
              >
                <button
                  type="button"
                  onClick={handleCloseManageModal}
                  className="absolute right-4 top-4 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-zinc-800 text-muted-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>

                <div>
                  <h3 className="text-xl font-bold">
                    {manageMode === "add" ? "신규 사진 등록" : "사진 정보 수정"}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">
                    갤러리에 게시할 사진첩 스냅샷의 메타데이터를 편집합니다.
                  </p>
                </div>

                <form onSubmit={handleFormSubmit} className="space-y-4">
                  {/* URL */}
                  <div className="space-y-1.5">
                    <Label htmlFor="photoUrl">이미지 URL</Label>
                    <Input
                      id="photoUrl"
                      value={formUrl}
                      onChange={(e) => setFormUrl(e.target.value)}
                      placeholder="https://images.unsplash.com/... 또는 이미지 주소"
                      required
                    />
                  </div>

                  {/* 제목 */}
                  <div className="space-y-1.5">
                    <Label htmlFor="photoTitle">제목</Label>
                    <Input
                      id="photoTitle"
                      value={formTitle}
                      onChange={(e) => setFormTitle(e.target.value)}
                      placeholder="스냅샷의 멋진 제목"
                      required
                    />
                  </div>

                  {/* 간단 설명 (Textarea) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="photoCaption">설명</Label>
                    <Textarea
                      id="photoCaption"
                      value={formCaption}
                      onChange={(e) => setFormCaption(e.target.value)}
                      placeholder="스냅샷 사진에 대한 간단한 설명을 입력하세요..."
                      rows={3}
                      className="resize-none"
                    />
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
                      onClick={handleCloseManageModal}
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

      {/* 이탈 확인 모달 */}
      <LeaveConfirmDialog
        isOpen={showLeaveModal}
        onClose={cancelLeave}
        onConfirm={confirmLeave}
        title="작성을 중단하시겠습니까?"
        description="입력 중인 사진 정보가 저장되지 않았습니다. 지금 창을 닫거나 페이지를 벗어나면 변경사항이 사라집니다."
        confirmText="나가기 (저장 안 함)"
        cancelText="계속 작성하기"
      />
    </div>
  );
}
