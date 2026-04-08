import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getIsAdmin } from "@/lib/auth-admin";
import { mapGigRow, type Gig } from "@/lib/gig";
import { hasEnvVars } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { Plus, Calendar, MapPin, Music, History, Sparkles } from "lucide-react";

function formatDate(d: string | null) {
  if (!d) return "—";
  try {
    return new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return d;
  }
}

export async function GigsInner() {
  if (!hasEnvVars) {
    return <p className="text-center py-10 text-muted-foreground">환경 변수 설정이 필요합니다.</p>;
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("*")
    .order("perform_date", { ascending: false }); // 날짜순 정렬

  if (error) return <p className="text-center py-10 text-destructive">데이터 로딩 에러</p>;

  const gigs: Gig[] = (rows ?? []).map((r) => mapGigRow(r as Record<string, unknown>));
  const isAdmin = await getIsAdmin();

  // ✅ 현재 날짜 기준으로 공연 분류
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const upcomingGigs = gigs.filter(gig => {
    if (!gig.perform_date) return false;
    return new Date(gig.perform_date + "T00:00:00") >= now;
  }).reverse(); // 예정된 공연은 가까운 날짜순으로 표시

  const pastGigs = gigs.filter(gig => {
    if (!gig.perform_date) return true;
    return new Date(gig.perform_date + "T00:00:00") < now;
  });

  return (
    <div className="flex flex-col gap-12 w-full max-w-5xl mx-auto pb-20">
      {/* 타이틀 섹션 */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between border-b pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900">공연 정보</h1>
        </div>
        {isAdmin && (
          <Button asChild className="shadow-md">
            <Link href="/gigs/new"><Plus className="size-4 mr-1" /> 공연 추가</Link>
          </Button>
        )}
      </div>

      {/* ✅ 1. 예정된 공연 섹션 */}
      <section className="space-y-8">
        <div className="flex items-center gap-2 text-primary font-bold">
          <Sparkles className="size-5" />
          <h2>예정된 공연</h2>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-primary/10 text-xs">{upcomingGigs.length}</span>
        </div>
        
        {upcomingGigs.length === 0 ? (
          <div className="py-12 text-center border-2 border-dashed rounded-3xl bg-slate-50/50 text-slate-400 text-sm">
            준비 중인 공연이 없습니다.
          </div>
        ) : (
          <GigGrid list={upcomingGigs} />
        )}
      </section>

      {/* ✅ 섹션 사이 Divider */}
      <div className="relative py-4">
        <div className="absolute inset-0 flex items-center" aria-hidden="true">
          <div className="w-full border-t border-slate-200"></div>
        </div>
        <div className="relative flex justify-center">
          <span className="bg-white px-4 text-slate-400">
            <History className="size-5" />
          </span>
        </div>
      </div>

      {/* ✅ 2. 진행된 공연 섹션 */}
      <section className="space-y-8">
        <div className="flex items-center gap-2 text-slate-500 font-bold">
          <h2>지난 공연</h2>
          <span className="ml-1 px-2 py-0.5 rounded-full bg-slate-100 text-xs">{pastGigs.length}</span>
        </div>
        
        {pastGigs.length === 0 ? (
          <p className="text-center py-10 text-slate-400 text-sm">지난 공연 기록이 없습니다.</p>
        ) : (
          <GigGrid list={pastGigs} isPast />
        )}
      </section>
    </div>
  );
}

function GigGrid({ list, isPast = false }: { list: Gig[], isPast?: boolean }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
      {list.map((gig) => (
        <Link key={gig.id} href={`/gigs/${gig.id}/setlists`} className="group block">
          <Card className={`h-full overflow-hidden border-none shadow-none bg-transparent hover:translate-y-[-4px] transition-all duration-300 ${isPast ? 'opacity-80 hover:opacity-100' : ''}`}>
            <div className={`relative aspect-[3/4] w-full overflow-hidden rounded-2xl mb-4 shadow-lg ring-1 ring-slate-200 ${isPast ? 'grayscale-[0.4]' : ''}`}>
              <div className={`absolute inset-0 flex flex-col items-center justify-center p-6 text-center ${isPast ? 'bg-slate-100' : 'bg-gradient-to-br from-indigo-500/20 via-purple-500/10 to-slate-100'}`}>
                <Music className={`size-12 mb-3 group-hover:scale-110 transition-transform ${isPast ? 'text-slate-300' : 'text-primary/40'}`} />
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">SOKNA</span>
              </div>
            </div>

            <div className="space-y-2 px-1">
              <h3 className="text-lg font-bold text-slate-900 leading-tight group-hover:text-primary transition-colors line-clamp-1">
                {gig.title || "제목 없음"}
              </h3>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Calendar className="size-3.5 shrink-0" />
                <span className="truncate">{formatDate(gig.perform_date)}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <MapPin className="size-3.5 shrink-0" />
                <span className="truncate">{gig.performers.split(',')[0] || "장소 정보 없음"}</span>
              </div>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}