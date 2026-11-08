"use server";
import { revalidatePath } from "next/cache";
import { readTicketReservationPage, ticketClient, ticketDatabaseError } from "@/lib/ticket-server";
import { getIsAdmin } from "@/lib/auth-admin";
import { getLegalConsentStateAction } from "@/app/auth/legal-actions";
import type { TicketAction } from "@/lib/ticket-reservations";

export async function createTicketReservation(input: { gigId: number; key: string; name: string; phone: string; depositor: string;
  quantity: number; offerHash: string; privacyAgreed: boolean; policyAgreed: boolean }) {
  try {
    if ((await getLegalConsentStateAction()).status !== "current") return { ok: false as const, error: "먼저 서비스 이용약관에 동의해 주세요." };
    const client = await ticketClient();
    const { data, error } = await client.rpc("create_ticket_reservation", {
      p_gig_id: input.gigId, p_request_key: input.key, p_name: input.name, p_phone: input.phone.replace(/[-\s]/g, ""),
      p_depositor: input.depositor, p_quantity: input.quantity, p_offer_hash: input.offerHash,
      p_privacy_agreed: input.privacyAgreed, p_policy_agreed: input.policyAgreed,
    });
    if (error || !data) return { ok: false as const, error: ticketDatabaseError(error) };
    revalidatePath("/reservations"); revalidatePath(`/gigs/${input.gigId}`); revalidatePath("/admin/reservations");
    return { ok: true as const, id: data };
  } catch { return { ok: false as const, error: "예매를 접수하지 못했습니다. 다시 시도해 주세요." }; }
}

export async function loadAdminReservationPage(page: number, query: string, gigId?: number) {
  try {
    if (!(await getIsAdmin())) return { ok: false as const, error: "관리자만 접근할 수 있습니다." };
    if (!Number.isSafeInteger(page) || page < 1 || page >= 100000 || typeof query !== "string" ||
      (gigId !== undefined && (!Number.isSafeInteger(gigId) || gigId < 1))) {
      return { ok: false as const, error: "검색 조건을 확인해 주세요." };
    }
    return await readTicketReservationPage({ admin: true, page, query, gigId });
  } catch {
    return { ok: false as const, error: "예매 목록을 불러오지 못했습니다. 다시 시도해 주세요." };
  }
}

export async function updateTicketReservation(id: string, version: number, action: TicketAction, payload: Record<string, string | number | boolean> = {}, includeReservation = false) {
  try {
    const adminAction = !["payment_reported", "cancel_requested"].includes(action);
    if (adminAction && !(await getIsAdmin())) return { ok: false as const, error: "관리자만 처리할 수 있습니다." };
    const client = await ticketClient();
    let error;
    if (action === "quantity_updated") {
      const quantity = payload.quantity;
      if (typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000000) {
        return { ok: false as const, error: "예매 매수를 확인해 주세요." };
      }
      ({ error } = await client.rpc("update_ticket_reservation_quantity", { p_id: id, p_version: version, p_quantity: quantity }));
    } else {
      ({ error } = await client.rpc("update_ticket_reservation", { p_id: id, p_version: version, p_action: action, p_payload: payload }));
    }
    if (error) return { ok: false as const, error: ticketDatabaseError(error) };
    revalidatePath("/reservations", "layout"); revalidatePath("/admin/reservations"); revalidatePath("/admin/gigs", "layout");
    revalidatePath(`/admin/reservations/${id}`);
    if (includeReservation && adminAction) {
      try {
        const { data } = await client.from("ticket_reservations").select("*").eq("id", id).maybeSingle();
        return { ok: true as const, reservation: data };
      } catch {
        return { ok: true as const, reservation: null };
      }
    }
    return { ok: true as const };
  } catch { return { ok: false as const, error: "예매 처리에 실패했습니다. 새로고침해 주세요." }; }
}

export async function savePaymentAccount(input: { bank: string; number: string; holder: string; instruction: string }) {
  try {
    if (!(await getIsAdmin())) return { ok: false as const, error: "관리자만 접근할 수 있습니다." };
    if (!input.bank.trim() || !input.holder.trim() || !/^[0-9]{6,32}$/.test(input.number.replace(/[-\s]/g, ""))) return { ok: false as const, error: "은행·계좌번호·예금주를 확인해 주세요." };
    const { error } = await (await ticketClient()).rpc("set_ticket_payment_account", { p_bank: input.bank, p_number: input.number.replace(/[-\s]/g, ""), p_holder: input.holder, p_instruction: input.instruction });
    if (error) return { ok: false as const, error: ticketDatabaseError(error) };
    revalidatePath("/admin/payment-accounts");
    return { ok: true as const };
  } catch { return { ok: false as const, error: "납부 계좌를 저장하지 못했습니다." }; }
}
