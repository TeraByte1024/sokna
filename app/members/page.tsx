import { Suspense } from "react";
import { SiteLayout } from "@/components/site-layout";
import { PageContainer } from "@/components/page-container";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/auth-admin";
import { MembersInner } from "./members-inner";
import { LoadingIndicator } from "@/components/ui/loading-indicator";
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
  // 권한 확인과 공개 목록 조회는 서로 독립적입니다.
  const [isAdmin, { data: rows, error }] = await Promise.all([
    getIsAdmin(),
    supabase
      .from("users")
      .select("id, name, generation, part")
      .not("generation", "is", null)
      .eq("status", "approved")
      .order("generation", { ascending: true })
      .order("name", { ascending: true }),
  ]);

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
          fallback={<LoadingIndicator label="부원 명단 불러오는 중…" />}
        >
          <MembersLoader />
        </Suspense>
      </PageContainer>
    </SiteLayout>
  );
}
