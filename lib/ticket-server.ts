import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { TicketDatabase } from "@/lib/ticket-database";

export async function ticketClient() {
  return await createClient() as unknown as SupabaseClient<TicketDatabase>;
}

const ticketPageSize = 50;

export async function readTicketReservationPage({
  admin = false,
  gigId,
  query,
  page,
}: {
  admin?: boolean;
  gigId?: number;
  query: string;
  page: number;
}) {
  const client = await ticketClient();
  const { data, error } = await client.rpc("list_ticket_reservations", {
    p_gig_id: gigId,
    p_search: query.slice(0, 120),
    p_offset: (page - 1) * ticketPageSize,
    p_admin: admin,
  });
  if (error) return { ok: false as const, error: ticketDatabaseError(error) };
  const rows = data ?? [];
  return { ok: true as const, rows, hasMore: rows.length === ticketPageSize };
}
export const ticketDatabaseError = (error: { code?: string; message?: string } | null) => {
  if (error?.code === "22023" || error?.code === "42501") return error.message || "처리 내용을 확인해 주세요.";
  if (["PGRST202", "PGRST205", "42P01", "42703", "42883"].includes(error?.code ?? "")) return "예매 기능이 아직 준비되지 않았습니다. 운영진에게 문의해 주세요.";
  if (error?.code === "23505") return "이미 등록된 거래 확인 번호입니다. 중복 입금·환불 여부를 확인해 주세요.";
  return "처리하지 못했습니다. 새로고침 후 다시 시도해 주세요.";
};
