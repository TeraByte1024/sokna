import type { Database, Json } from "@/lib/supabase/database.types";
import type { PaymentAccount, TicketReservation, TicketEvent } from "@/lib/ticket-reservations";

type ReadTable<Row> = { Row: Row; Insert: never; Update: never; Relationships: [] };
export type TicketGigFields = {
  admission_starts_at?: string | null;
  notice?: string | null;
  advance_booking_starts_at?: string | null;
  advance_booking_deadline?: string | null;
  ticket_booking_enabled?: boolean;
  ticket_booking_mode?: string | null;
  ticket_capacity?: number | null;
  ticket_refund_policy?: string | null;
};
type Gigs = Database["public"]["Tables"]["gigs"];

export type TicketDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Tables" | "Functions"> & {
    Tables: Omit<
      Database["public"]["Tables"],
      | "gigs"
      | "payment_accounts"
      | "ticket_reservations"
      | "ticket_reservation_events"
      | "ticket_fund_entries"
    > & {
      gigs: Omit<Gigs, "Row" | "Insert" | "Update"> & {
        Row: Gigs["Row"] & TicketGigFields;
        Insert: Gigs["Insert"] & TicketGigFields;
        Update: Gigs["Update"] & TicketGigFields;
      };
      payment_accounts: ReadTable<
        PaymentAccount & { active: boolean; created_at: string; created_by: string | null }
      >;
      ticket_reservations: ReadTable<TicketReservation>;
      ticket_reservation_events: ReadTable<TicketEvent>;
      ticket_fund_entries: ReadTable<{
        id: string;
        reservation_id: string;
        account_id: string | null;
        direction: string;
        amount: number;
        reference: string;
        actor_id: string | null;
        created_at: string;
      }>;
    };
    Functions: Omit<
      Database["public"]["Functions"],
      | "list_ticket_reservations"
      | "get_ticket_booking_offer"
      | "create_ticket_reservation"
      | "update_ticket_reservation"
      | "set_ticket_payment_account"
    > & {
      list_ticket_reservations: {
        Args: { p_gig_id?: number; p_search?: string; p_offset?: number; p_admin?: boolean };
        Returns: TicketReservation[];
      };
      get_ticket_booking_offer: { Args: { p_gig_id: number }; Returns: Json };
      create_ticket_reservation: {
        Args: {
          p_gig_id: number;
          p_request_key: string;
          p_name: string;
          p_phone: string;
          p_depositor: string;
          p_quantity: number;
          p_offer_hash: string;
          p_privacy_agreed: boolean;
          p_policy_agreed: boolean;
        };
        Returns: string;
      };
      update_ticket_reservation: {
        Args: { p_id: string; p_version: number; p_action: string; p_payload: Json };
        Returns: undefined;
      };
      set_ticket_payment_account: {
        Args: { p_bank: string; p_number: string; p_holder: string; p_instruction: string };
        Returns: string;
      };
    };
  };
};
