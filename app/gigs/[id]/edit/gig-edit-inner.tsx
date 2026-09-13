import { notFound, redirect } from "next/navigation";
import { GigEditForm } from "@/components/gigs/gig-edit-form";
import { createClient } from "@/lib/supabase/server";
import { SUPABASE_GIGS_TABLE } from "@/lib/supabase/gigs";
import { getIsAdmin } from "@/lib/auth-admin";
import type { Performer } from "@/components/performer-selector";

interface GigEditInnerProps {
  gigId: string;
}

export async function GigEditInner({ gigId }: GigEditInnerProps) {
  const numericId = Number(gigId);
  if (isNaN(numericId)) {
    notFound();
  }

  // 관리자 권한 확인
  const isAdmin = await getIsAdmin();
  if (!isAdmin) {
    redirect(`/gigs/${numericId}`);
  }

  const supabase = await createClient();

  // 1. 공연 기본 정보 조회
  const { data: gigRow, error: gigError } = await supabase
    .from(SUPABASE_GIGS_TABLE)
    .select("*")
    .eq("id", numericId)
    .maybeSingle();

  if (gigError || !gigRow) {
    notFound();
  }

  // 2. 공연 참여자 목록 조회 (미연동 더미 공연자 포함)
  const { data: performerRows } = await supabase
    .from("performers")
    .select(`
      id,
      part,
      photo_url,
      user_id,
      name,
      users (
        id,
        name,
        email,
        generation,
        part
      )
    `)
    .eq("gig_id", numericId)
    .order("created_at", { ascending: true });

  const initialPerformers: Performer[] = (performerRows ?? []).map((row) => {
    const rawUser = row.users as {
      id: string;
      name: string;
      email?: string | null;
      generation?: number | null;
      part?: string | null;
    } | null;

    const isLinked = Boolean(row.user_id && rawUser);

    return {
      id: row.user_id ?? undefined,
      name: isLinked ? rawUser!.name : (row.name || "미연동 공연자"),
      email: isLinked ? (rawUser?.email ?? undefined) : `temp-${row.id}`,
      generation: isLinked ? (rawUser?.generation ?? null) : null,
      part: row.part || "세션",
      photo_url: row.photo_url ?? undefined,
    };
  });

  // 3. 기존 셋리스트 목록 조회
  const { data: setlistRows } = await supabase
    .from("setlists")
    .select("id, title, artist, session_members, order_num")
    .eq("gig_id", numericId)
    .order("order_num", { ascending: true })
    .order("created_at", { ascending: true });

  const initialSetlists = (setlistRows ?? []).map((s) => ({
    id: s.id,
    title: s.title ?? "",
    artist: s.artist ?? "",
    session_members: s.session_members ?? "",
    order_num: s.order_num ?? 0,
  }));

  return (
    <GigEditForm
      gig={{
        id: gigRow.id,
        title: gigRow.title,
        subtitle: gigRow.subtitle,
        perform_date: gigRow.perform_date,
        meeting_date: gigRow.meeting_date,
        location: gigRow.location,
        poster_url: gigRow.poster_url,
        is_public: gigRow.is_public ?? true,
      }}
      initialPerformers={initialPerformers}
      initialSetlists={initialSetlists}
    />
  );
}
