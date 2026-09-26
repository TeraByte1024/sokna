import { notFound, redirect } from "next/navigation";
import { GigEditForm } from "@/components/gigs/gig-edit-form";
import { createClient } from "@/lib/supabase/server";
import { getGigRow } from "@/lib/gig-server-data";
import { getIsAdmin } from "@/lib/auth-admin";
import { getGigVisibility } from "@/lib/gig-visibility";
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

  const [supabase, { data: gigRow, error: gigError }] = await Promise.all([
    createClient(),
    getGigRow(numericId),
  ]);

  if (gigError || !gigRow) {
    notFound();
  }

  // 2. 공연 참여자 목록 조회 (미연동 더미 공연자 포함)
  const performerQuery = supabase
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

  const setlistQuery = supabase
    .from("setlists")
    .select("id, title, artist, session_members, order_num")
    .eq("gig_id", numericId)
    .order("order_num", { ascending: true })
    .order("created_at", { ascending: true });

  const [{ data: performerRows }, { data: setlistRows }] = await Promise.all([
    performerQuery,
    setlistQuery,
  ]);

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
        advance_ticket_price: gigRow.advance_ticket_price,
        door_ticket_price: gigRow.door_ticket_price,
        perform_date: gigRow.perform_date,
        perform_time: gigRow.perform_time,
        meeting_date: gigRow.meeting_date,
        meeting_time: gigRow.meeting_time,
        location: gigRow.location,
        meeting_location: gigRow.meeting_location,
        poster_url: gigRow.poster_url,
        visibility: getGigVisibility(gigRow),
      }}
      initialPerformers={initialPerformers}
      initialSetlists={initialSetlists}
    />
  );
}
