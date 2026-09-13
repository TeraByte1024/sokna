"use client";

import { useRef, useState } from "react";
import { Users, Camera, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { updatePerformerPhoto } from "@/app/gigs/actions";
import { toast } from "sonner";
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

  if (performers.length === 0) {
    return (
      <p className="text-center py-10 text-sm text-muted-foreground">
        아직 등록된 공연자가 없습니다.
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
          const canEdit = isAdmin || (Boolean(currentUserId) && p.user_id === currentUserId);
          const isUploading = uploadingId === p.id;

          return (
            <div
              key={p.id}
              className="flex flex-col bg-card border border-border/70 rounded-2xl p-2.5 sm:p-3 shadow-xs hover:border-primary/40 hover:shadow-md transition-all group relative"
            >
              {/* 프로필 사진: 세로로 긴 3:4 비율의 모서리 둥근 직사각형 */}
              <div className="relative aspect-[3/4] w-full rounded-xl overflow-hidden bg-muted/30 border border-border/60">
                {p.photo_url ? (
                  <img
                    src={p.photo_url}
                    alt={p.user?.name || "공연자"}
                    className="w-full h-full object-cover rounded-xl transition-transform duration-300 group-hover:scale-102"
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

                {/* 관리자 또는 본인 전용 사진 업로드 버튼 */}
                {canEdit && !isUploading && (
                  <button
                    type="button"
                    onClick={() => triggerUpload(p.id)}
                    className="absolute bottom-2 right-2 size-8 rounded-full bg-background/90 hover:bg-background text-foreground shadow-md flex items-center justify-center transition-all border border-border/80 hover:scale-105 z-10"
                    title={p.photo_url ? "프로필 사진 변경" : "프로필 사진 등록"}
                  >
                    <Camera className="size-4" />
                  </button>
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
