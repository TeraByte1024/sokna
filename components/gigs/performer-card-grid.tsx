"use client";

import { useEffect, useRef, useState } from "react";
import { Users, Camera, Loader2, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { updatePerformerPhoto } from "@/app/gigs/actions";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ResponsiveImage } from "@/components/ui/responsive-image";
import type { GigPerformer } from "@/lib/gig";

interface PerformerCardGridProps {
  performers: GigPerformer[];
  currentUserId?: string | null;
  isAdmin: boolean;
  gigId: number;
}

export function PerformerCardGrid({
  performers: initialPerformers,
  currentUserId,
  isAdmin,
}: PerformerCardGridProps) {
  const supabase = createClient();
  const [performers, setPerformers] = useState<GigPerformer[]>(initialPerformers);
  const [uploadingId, setUploadingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetPerformerIdRef = useRef<number | null>(null);

  // 관리자 승인 후 router.refresh()로 전달된 최신 공연자 명단을 반영합니다.
  useEffect(() => {
    setPerformers(initialPerformers);
  }, [initialPerformers]);

  // 프로필 사진 업로드 트리거
  const triggerUpload = (performerId: number) => {
    targetPerformerIdRef.current = performerId;
    fileInputRef.current?.click();
  };

  // 파일 업로드 처리
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const performerId = targetPerformerIdRef.current;
    if (!file || !performerId) return;

    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 업로드할 수 있습니다.");
      return;
    }

    setUploadingId(performerId);
    try {
      const fileExt = file.name.split(".").pop() || "jpg";
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
      const filePath = `performers/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from("gigs")
        .upload(filePath, file, { cacheControl: "3600", upsert: true });

      if (uploadErr) throw uploadErr;

      const { data } = supabase.storage.from("gigs").getPublicUrl(filePath);
      const newPhotoUrl = data.publicUrl;

      // Server Action 호출
      const result = await updatePerformerPhoto(performerId, newPhotoUrl);
      if (result.ok) {
        setPerformers((prev) =>
          prev.map((p) => (p.id === performerId ? { ...p, photo_url: newPhotoUrl } : p))
        );
        toast.success("프로필 사진이 등록되었습니다.", { id: "performer-photo" });
      } else {
        toast.error(result.error || "사진 저장에 실패했습니다.");
      }
    } catch (err) {
      console.error("사진 업로드 실패:", err);
      toast.error("사진 업로드 중 오류가 발생했습니다.");
    } finally {
      setUploadingId(null);
      targetPerformerIdRef.current = null;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // 프로필 사진 삭제 처리
  const handlePhotoDelete = async (performerId: number) => {
    if (!window.confirm("프로필 사진을 삭제하시겠습니까?")) return;
    setUploadingId(performerId);
    try {
      const result = await updatePerformerPhoto(performerId, null);
      if (result.ok) {
        setPerformers((prev) =>
          prev.map((p) => (p.id === performerId ? { ...p, photo_url: null } : p))
        );
        toast.success("프로필 사진이 삭제되었습니다.", { id: "performer-photo" });
      } else {
        toast.error(result.error || "사진 삭제에 실패했습니다.");
      }
    } catch (err) {
      console.error("사진 삭제 실패:", err);
      toast.error("사진 삭제 중 오류가 발생했습니다.");
    } finally {
      setUploadingId(null);
    }
  };

  if (performers.length === 0) {
    return (
      <p className="text-center py-10 text-sm text-muted-foreground">
        아직 등록된 공연 참여자가 없습니다.
      </p>
    );
  }

  return (
    <div>
      {/* 숨겨진 파일 인풋 */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handlePhotoUpload}
        accept="image/*"
        className="hidden"
      />

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-5">
        {performers.map((p) => {
          const isSelf = Boolean(currentUserId) && p.user_id === currentUserId;
          const canEdit = isAdmin || isSelf;
          const isUploading = uploadingId === p.id;

          return (
            <div
              key={p.id}
              className={cn(
                "flex flex-col bg-card border rounded-2xl p-2.5 sm:p-3 shadow-xs hover:border-primary/40 hover:shadow-md transition-all group relative",
                isSelf
                  ? "border-primary/50 ring-1 ring-primary/20 bg-primary/[0.02]"
                  : "border-border/70"
              )}
            >
              {/* 프로필 사진: 세로로 긴 3:4 비율의 모서리 둥근 직사각형 */}
              <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-muted/30 border border-border/60">
                {/* 본인 식별 배지 */}
                {isSelf && (
                  <div className="absolute top-2 left-2 z-10">
                    <Badge className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0 shadow-xs pointer-events-none">
                      나
                    </Badge>
                  </div>
                )}

                {p.photo_url ? (
                  <ResponsiveImage
                    src={p.photo_url}
                    alt={p.user?.name || p.name || "LINEUP"}
                    className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-102"
                    sizes="(min-width: 1024px) 180px, (min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground gap-1.5 p-3 text-center">
                    <Users className="size-8 opacity-40" />
                    <span className="text-[11px] opacity-60">사진 미등록</span>
                  </div>
                )}

                {/* 로딩 인디케이터 */}
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center rounded-xl z-20">
                    <Loader2 className="size-6 text-white animate-spin" />
                  </div>
                )}

                {/* 관리자 또는 본인 전용 사진 업로드/삭제 버튼 */}
                {canEdit && !isUploading && (
                  <div className="absolute bottom-2 right-2 flex items-center gap-1 z-10">
                    {p.photo_url && (
                      <button
                        type="button"
                        onClick={() => handlePhotoDelete(p.id)}
                        className="size-7 sm:size-8 rounded-full bg-background/90 hover:bg-destructive hover:text-destructive-foreground text-muted-foreground shadow-md flex items-center justify-center transition-all border border-border/80 hover:scale-105 cursor-pointer"
                        title={isSelf ? "내 프로필 사진 삭제" : "프로필 사진 삭제 (관리자)"}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => triggerUpload(p.id)}
                      className="size-7 sm:size-8 rounded-full bg-background/90 hover:bg-background text-foreground shadow-md flex items-center justify-center transition-all border border-border/80 hover:scale-105 cursor-pointer"
                      title={
                        isSelf
                          ? p.photo_url
                            ? "내 프로필 사진 변경"
                            : "내 프로필 사진 등록"
                          : p.photo_url
                            ? "프로필 사진 변경 (관리자)"
                            : "프로필 사진 등록 (관리자)"
                      }
                    >
                      <Camera className="size-3.5 sm:size-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* 하단 정보: 이름 + 이번 공연 배정 파트 & 기수 */}
              <div className="pt-2.5 pb-1 flex flex-col items-center text-center">
                <h4 className="text-sm sm:text-base font-bold text-foreground leading-tight line-clamp-1">
                  {p.user?.name || p.name || "익명 부원"}
                </h4>

                <div className="flex items-center gap-1.5 mt-2 flex-wrap justify-center">
                  {(p.part || "세션")
                    .split(",")
                    .map((pt) => pt.trim())
                    .filter(Boolean)
                    .map((partName) => (
                      <Badge
                        key={partName}
                        className="bg-primary/10 text-primary border-primary/25 hover:bg-primary/15 text-[11px] font-semibold px-2 py-0.5"
                      >
                        {partName}
                      </Badge>
                    ))}
                  {p.user?.generation && (
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {p.user.generation}기
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
