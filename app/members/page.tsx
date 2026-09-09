import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { MembersInner } from "./members-inner";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "역대 부원 소개",
  description: "소리로 크는 나무(소크나)의 역대 부원 리스트",
};

export type Member = {
  id: string;
  name: string;
  generation: number;
  part: string | null;
};

async function MembersLoader() {
  const supabase = await createClient();
  const isAdmin = await getIsAdmin();

  // 기수가 등록된 부원 정보 조회
  const { data: rows, error } = await supabase
    .from("users")
    .select("id, name, generation, part")
    .not("generation", "is", null)
    .order("generation", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("부원 목록 로딩 오류:", error);
  }

  // 타입 매핑 및 데이터 정제
  const members: Member[] = (rows ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    generation: Number(r.generation),
    part: r.part,
  }));

  return <MembersInner initialMembers={members} isAdmin={isAdmin} />;
}

export default function MembersPage() {
  return (
    <SiteLayout>
      <PageContainer>
        <Suspense
          fallback={
            <div className="flex flex-col items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="text-sm text-muted-foreground mt-4">부원 명단 불러오는 중…</p>
            </div>
          }
        >
          <MembersLoader />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
