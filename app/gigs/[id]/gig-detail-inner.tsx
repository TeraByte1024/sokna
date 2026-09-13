import Link from "next/link";
import {
  ArrowLeft,
  Calendar,
  Users,
  Music2,
  ChevronRight,
  MapPin,
  Lock,
  Pencil,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import { mapGigRow, parseSessionSlots, type Gig, type GigPerformer } from "@/lib/gig";
import { getDDay } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CopyJoinLinkButton } from "@/components/gigs/copy-join-link-button";
import { PerformerCardGrid } from "@/components/gigs/performer-card-grid";

interface DetailSetlistItem {
  id: number;
  title: string | null;
  artist: string | null;
  session_members: string | null;
  order_num: number;
}

function formatKoreanDate(dateStr: string | null) {
  if (!dateStr) return "일정 미정";
  try {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "short",
    });
  } catch {
    return dateStr;
  }
}

interface GigDetailInnerProps {
  gigId: string;
}

export async function GigDetailInner({ gigId }: GigDetailInnerProps) {
  const supabase = await createClient();
  const isAdmin = await getIsAdmin();

  // 1. 로그인 유저 확인
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const isLoggedIn = Boolean(user);

  // 2. 공연 기본 정보 조회
  const numericId = Number(gigId);
  if (isNaN(numericId)) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <p className="text-lg font-medium text-muted-foreground">잘못된 공연 ID입니다.</p>
        <Button asChild variant="outline">
          <Link href="/gigs">공연 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const { data: gigRow, error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (gigError || !gigRow) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
        <p className="text-lg font-medium text-muted-foreground">공연 정보를 찾을 수 없습니다.</p>
        <Button asChild variant="outline">
          <Link href="/gigs">공연 목록으로 돌아가기</Link>
        </Button>
      </div>
    );
  }

  const gig: Gig = mapGigRow(gigRow as Record<string, unknown>);

  // 비공개 공연인 경우 비회원 접근 차단 (로그인 페이지로 안내)
  if (!gig.is_public && !isLoggedIn && !isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center gap-4 max-w-md mx-auto">
        <div className="size-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
          <Lock className="size-6" />
        </div>
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-foreground">비공개 상태입니다</h2>
          <p className="text-xs text-muted-foreground">
            해당 공연 정보는 동아리 회원 및 관리자만 열람할 수 있습니다. 로그인 후 다시 확인해 주세요.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/gigs">목록으로</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={`/auth/login?redirect=/gigs/${numericId}`}>로그인하기</Link>
          </Button>
        </div>
      </div>
    );
  }

  // 3. 참여 공연자 (Performers) 조회 (미연동 더미 포함)
  const { data: performerRows } = await supabase
    .from("performers")
    .select(`
      id,
      part,
      user_id,
      name,
      photo_url,
      users (
        name,
        generation
      )
    `)
    .eq("gig_id", numericId)
    .order("created_at", { ascending: true });

  const performers: GigPerformer[] = (performerRows ?? []).map((row) => {
    const rawUser = row.users as { name: string; generation: number | null } | null;
    return {
      id: row.id,
      part: row.part,
      user_id: row.user_id,
      name: row.name,
      photo_url: row.photo_url,
      user: rawUser
        ? {
            name: rawUser.name,
            generation: rawUser.generation,
          }
        : null,
    };
  });

  // 4. 셋리스트 (Setlists) 조회 (order_num 오름차순 정렬)
  const { data: setlistRows } = await supabase
    .from("setlists")
    .select("id, title, artist, session_members, order_num")
    .eq("gig_id", numericId)
    .order("order_num", { ascending: true })
    .order("created_at", { ascending: true });

  const setlists: DetailSetlistItem[] = (setlistRows ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    artist: s.artist,
    session_members: s.session_members,
    order_num: s.order_num,
  }));

  // 공연 날짜 상태 계산
  const dDay = getDDay(gig.perform_date);
  const isPast = !dDay && Boolean(gig.perform_date);

  return (
    <div className="flex flex-col gap-10 w-full max-w-4xl mx-auto pb-16">
      {/* 1. 상단 내비게이션 및 액션 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <Link
          href="/gigs"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors group"
        >
          <ArrowLeft className="size-4 group-hover:-translate-x-1 transition-transform" />
          공연 목록으로
        </Link>

        {/* 액션 버튼 그룹: 선곡 회의 바로가기 + 공연 수정 + 참가 신청 링크 복사 */}
        <div className="flex flex-wrap items-center gap-2">
          {isLoggedIn && (
            <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 border-border/80 text-foreground">
              <Link href={`/gigs/${gig.id}/setlists`}>
                <Music2 className="size-3.5 text-primary" />
                선곡 회의 바로가기
              </Link>
            </Button>
          )}
          {isAdmin && (
            <>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs font-semibold gap-1.5 border-border/80">
                <Link href={`/gigs/${numericId}/edit`}>
                  <Pencil className="size-3.5" />
                  공연 수정
                </Link>
              </Button>
              <CopyJoinLinkButton gigId={numericId} />
            </>
          )}
        </div>
      </div>

      {/* 2. 공연 헤더 / 히어로 섹션 (포스터 대폭 확대 및 상단 정보 2행 구성) */}
      <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-card via-card/90 to-accent/20 p-6 sm:p-10 shadow-sm">
        <div className="flex flex-col md:flex-row gap-6 sm:gap-10 items-center md:items-start">
          {/* 크게 표시된 포스터 이미지 (원본 비율 온전히 보존하여 위아래 잘림 방지) */}
          {gig.poster_url ? (
            <div className="w-56 sm:w-72 md:w-80 rounded-2xl overflow-hidden shadow-2xl border border-border/70 shrink-0 bg-muted/20">
              <img
                src={gig.poster_url}
                alt={gig.title || "공연 포스터"}
                className="w-full h-auto block object-contain rounded-2xl"
              />
            </div>
          ) : (
            <div className="w-56 sm:w-72 md:w-80 aspect-[1/1.414] rounded-2xl border border-dashed border-border/80 bg-muted/20 flex flex-col items-center justify-center text-muted-foreground gap-2 shrink-0">
              <Sparkles className="size-8 opacity-40" />
              <span className="text-xs">포스터 미등록</span>
            </div>
          )}

          <div className="flex flex-col gap-6 flex-1 w-full text-center md:text-left">
            {/* 배지 라인 */}
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-2.5">
              {dDay ? (
                <Badge className="bg-primary text-primary-foreground font-black tracking-wider px-3 py-1 text-xs sm:text-sm">
                  {dDay}
                </Badge>
              ) : isPast ? (
                <Badge variant="secondary" className="px-3 py-1 text-xs sm:text-sm font-semibold">
                  종료
                </Badge>
              ) : (
                <Badge variant="outline" className="px-3 py-1 text-xs sm:text-sm">
                  일정 조율 중
                </Badge>
              )}
              {!gig.is_public && (
                <Badge variant="outline" className="px-2.5 py-1 text-xs font-semibold text-amber-500 border-amber-500/40 bg-amber-500/10 flex items-center gap-1">
                  <Lock className="size-3" />
                  비공개
                </Badge>
              )}
            </div>

            {/* 공연 제목 및 부제목 */}
            <div className="space-y-2">
              <h1 className="text-2xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground leading-tight">
                {gig.title || "무제 공연"}
              </h1>
              {gig.subtitle && (
                <p className="text-sm sm:text-base lg:text-lg text-muted-foreground font-medium">
                  {gig.subtitle}
                </p>
              )}
            </div>

            {/* 주요 일정 정보: 세로 2행 구성 (참여 세션 카드 삭제) */}
            <div className="flex flex-col gap-2.5 pt-2 w-full max-w-md mx-auto md:mx-0">
              {/* 1행: 공연 일시 */}
              <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-background/60 border border-border/40 backdrop-blur-sm">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary shrink-0">
                  <Calendar className="size-5" />
                </div>
                <div className="min-w-0 text-left">
                  <div className="text-xs text-muted-foreground font-medium">공연 일시</div>
                  <div className="text-sm sm:text-base font-bold truncate text-foreground">
                    {formatKoreanDate(gig.perform_date)}
                  </div>
                </div>
              </div>

              {/* 2행: 공연 장소 */}
              {gig.location && (
                <div className="flex items-center gap-3.5 p-3.5 rounded-2xl bg-background/60 border border-border/40 backdrop-blur-sm">
                  <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                    <MapPin className="size-5" />
                  </div>
                  <div className="min-w-0 text-left">
                    <div className="text-xs text-muted-foreground font-medium">공연 장소</div>
                    <div className="text-sm sm:text-base font-bold truncate text-foreground">
                      {gig.location}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 3. SETLIST 섹션 (순서 1순위: 곡 제목 - 아티스트 - 해당 곡 연주자 명단) */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Music2 className="size-5 text-primary" />
              <CardTitle className="text-lg font-bold tracking-tight">SETLIST</CardTitle>
            </div>
            <Badge variant="secondary" className="text-xs font-semibold">
              총 {setlists.length}곡
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          {setlists.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                아직 등록된 셋리스트가 없습니다.
              </p>
              {isAdmin && (
                <Button asChild variant="outline" size="sm">
                  <Link href={`/gigs/${numericId}/edit`}>
                    <Pencil className="size-3.5 mr-1.5" />
                    공연 수정에서 셋리스트 등록하기
                  </Link>
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {setlists.map((song, idx) => (
                <div
                  key={song.id}
                  className="py-4 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 group hover:bg-muted/10 px-3 rounded-xl transition-colors"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <span className="text-xs font-mono font-bold text-muted-foreground bg-muted px-2 py-1 rounded-lg shrink-0 mt-0.5">
                      #{idx + 1}
                    </span>
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-baseline gap-2 flex-wrap">
                        <h4 className="text-base font-bold text-foreground">
                          {song.title || "제목 미상"}
                        </h4>
                        {song.artist && (
                          <span className="text-xs font-medium text-muted-foreground">
                            — {song.artist}
                          </span>
                        )}
                      </div>
                      {/* 해당 곡 연주자 명단 (가변 세션 JSON 지원) */}
                      {song.session_members && (() => {
                        const slots = parseSessionSlots(song.session_members);
                        if (slots.length === 0) return null;
                        return (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pt-1 flex-wrap">
                            <Users className="size-3.5 text-primary/80 shrink-0 mr-0.5" />
                            {slots.map((slot) => (
                              <span
                                key={slot.sessionName}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px] font-medium text-foreground/85 border border-border/50"
                              >
                                <span className="text-primary font-semibold">{slot.sessionName}</span>
                                <span>{slot.members.join(", ")}</span>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 4. 공연자 섹션 (순서 2순위: 세로 직사각형 카드 및 3:4 둥근 직사각형 사진, 관리자/본인 업로드 지원) */}
      <Card className="border-border/60 shadow-sm overflow-hidden">
        <CardHeader className="border-b bg-muted/20 pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-5 text-primary" />
              <CardTitle className="text-lg font-bold">공연자</CardTitle>
            </div>
            <Badge variant="secondary" className="text-xs font-semibold">
              총 {performers.length}명
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-5 sm:p-6">
          <PerformerCardGrid
            performers={performers}
            currentUserId={user?.id}
            isAdmin={isAdmin}
            gigId={numericId}
          />
        </CardContent>
      </Card>
    </div>
  );
}
