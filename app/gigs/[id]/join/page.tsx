import { redirect } from "next/navigation";
import type { Metadata } from "next";

interface JoinPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: JoinPageProps): Promise<Metadata> {
  const { id } = await params;
  return {
    title: "공연 참가 신청",
    description: "SOKNA 공연 참가 여부(참여/불참/미정)를 등록합니다.",
  };
}

export default async function GigJoinPage({ params }: JoinPageProps) {
  const { id } = await params;
  const numericId = Number(id);

  if (isNaN(numericId)) {
    redirect("/gigs");
  }

  // 공연 참여 신청이 상세 페이지 내 모달 다이얼로그로 통합되었으므로,
  // ?join=true 쿼리 스트링과 함께 공연 상세 페이지로 연결합니다.
  redirect(`/gigs/${numericId}?join=true`);
}
