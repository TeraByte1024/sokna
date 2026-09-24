import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { PhotosInner } from "./photos-inner";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "갤러리 - SOKNA 라이브",
  description: "소리로 크는 나무(소크나)의 공연 및 연습 활동 사진첩",
};

export type PhotoItem = {
  id: string;
  url: string;
  title: string;
  caption: string | null;
  created_at: string;
};

async function PhotosLoader() {
  const supabase = await createClient();
  // 권한 확인과 공개 목록 조회는 서로 독립적입니다.
  const [isAdmin, { data: rows, error }] = await Promise.all([
    getIsAdmin(),
    supabase
      .from("photos")
      .select("id, url, title, caption, created_at")
      .order("created_at", { ascending: false }),
  ]);

  if (error) {
    console.error("사진 목록 로딩 오류:", error);
  }

  const photos: PhotoItem[] = (rows ?? []).map((r) => ({
    id: r.id,
    url: r.url,
    title: r.title,
    caption: r.caption,
    created_at: r.created_at,
  }));

  return <PhotosInner initialPhotos={photos} isAdmin={isAdmin} />;
}

export default function PhotosPage() {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense
          fallback={<LoadingIndicator label="사진첩 불러오는 중…" />}
        >
          <PhotosLoader />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
