export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admins: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          name?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string | null
        }
        Relationships: []
      }
      gig_rsvps: {
        Row: {
          created_at: string
          gig_id: number
          id: number
          note: string | null
          part: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gig_id: number
          id?: never
          note?: string | null
          part?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gig_id?: number
          id?: never
          note?: string | null
          part?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gig_rsvps_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gigs: {
        Row: {
          admission_starts_at: string | null
          advance_booking_deadline: string | null
          advance_booking_starts_at: string | null
          advance_ticket_price: number | null
          created_at: string
          door_ticket_price: number | null
          id: number
          is_public: boolean
          location: string | null
          meeting_date: string | null
          meeting_location: string | null
          meeting_time: string | null
          nomination_deadline: string | null
          notice: string | null
          perform_date: string
          perform_time: string | null
          poster_url: string | null
          subtitle: string | null
          ticket_booking_enabled: boolean
          ticket_booking_mode: string | null
          ticket_capacity: number | null
          ticket_refund_policy: string | null
          title: string | null
          visibility: string
        }
        Insert: {
          admission_starts_at?: string | null
          advance_booking_deadline?: string | null
          advance_booking_starts_at?: string | null
          advance_ticket_price?: number | null
          created_at?: string
          door_ticket_price?: number | null
          id?: number
          is_public?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_location?: string | null
          meeting_time?: string | null
          nomination_deadline?: string | null
          notice?: string | null
          perform_date: string
          perform_time?: string | null
          poster_url?: string | null
          subtitle?: string | null
          ticket_booking_enabled?: boolean
          ticket_booking_mode?: string | null
          ticket_capacity?: number | null
          ticket_refund_policy?: string | null
          title?: string | null
          visibility?: string
        }
        Update: {
          admission_starts_at?: string | null
          advance_booking_deadline?: string | null
          advance_booking_starts_at?: string | null
          advance_ticket_price?: number | null
          created_at?: string
          door_ticket_price?: number | null
          id?: number
          is_public?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_location?: string | null
          meeting_time?: string | null
          nomination_deadline?: string | null
          notice?: string | null
          perform_date?: string
          perform_time?: string | null
          poster_url?: string | null
          subtitle?: string | null
          ticket_booking_enabled?: boolean
          ticket_booking_mode?: string | null
          ticket_capacity?: number | null
          ticket_refund_policy?: string | null
          title?: string | null
          visibility?: string
        }
        Relationships: []
      }
      nomination_responses: {
        Row: {
          comment: string
          created_at: string
          id: number
          nomination_id: number
          session_part: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          comment?: string
          created_at?: string
          id?: never
          nomination_id: number
          session_part?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          comment?: string
          created_at?: string
          id?: never
          nomination_id?: number
          session_part?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "nomination_responses_nomination_id_fkey"
            columns: ["nomination_id"]
            isOneToOne: false
            referencedRelation: "nominations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nomination_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nominations: {
        Row: {
          artist: string | null
          created_at: string
          created_by: number | null
          description: string | null
          gig_id: number
          id: number
          links: Json | null
          recommended_vocals: Json | null
          required_parts: string[] | null
          sheet_exists: boolean | null
          sheet_note: string | null
          title: string
          updated_at: string
        }
        Insert: {
          artist?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          gig_id: number
          id?: number
          links?: Json | null
          recommended_vocals?: Json | null
          required_parts?: string[] | null
          sheet_exists?: boolean | null
          sheet_note?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          artist?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          gig_id?: number
          id?: number
          links?: Json | null
          recommended_vocals?: Json | null
          required_parts?: string[] | null
          sheet_exists?: boolean | null
          sheet_note?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "nominations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nominations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          event_key: string
          event_type: string
          id: string
          link: string | null
          push_attempted_at: string | null
          push_attempts: number
          push_error: string | null
          push_next_attempt_at: string
          push_progress: Json
          push_sent_at: string | null
          push_status: string
          read_at: string | null
          title: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_attempts?: number
          push_error?: string | null
          push_next_attempt_at?: string
          push_progress?: Json
          push_sent_at?: string | null
          push_status?: string
          read_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_attempts?: number
          push_error?: string | null
          push_next_attempt_at?: string
          push_progress?: Json
          push_sent_at?: string | null
          push_status?: string
          read_at?: string | null
          title?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      payment_accounts: {
        Row: {
          account_number: string
          active: boolean
          bank: string
          created_at: string
          created_by: string | null
          holder: string
          id: string
          instruction: string
        }
        Insert: {
          account_number: string
          active?: boolean
          bank: string
          created_at?: string
          created_by?: string | null
          holder: string
          id?: string
          instruction?: string
        }
        Update: {
          account_number?: string
          active?: boolean
          bank?: string
          created_at?: string
          created_by?: string | null
          holder?: string
          id?: string
          instruction?: string
        }
        Relationships: []
      }
      performers: {
        Row: {
          created_at: string
          gig_id: number
          id: number
          name: string | null
          part: string
          photo_url: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          gig_id: number
          id?: number
          name?: string | null
          part: string
          photo_url?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          gig_id?: number
          id?: number
          name?: string | null
          part?: string
          photo_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "Performers_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "performers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      photos: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          title: string
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          title: string
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          title?: string
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          device_name: string | null
          fcm_token: string
          id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_name?: string | null
          fcm_token: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_name?: string | null
          fcm_token?: string
          id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      setlist_views: {
        Row: {
          gig_id: number
          last_viewed_at: string
          user_id: string
        }
        Insert: {
          gig_id: number
          last_viewed_at?: string
          user_id: string
        }
        Update: {
          gig_id?: number
          last_viewed_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlist_views_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlist_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      setlists: {
        Row: {
          artist: string | null
          created_at: string
          created_by: number | null
          description: string | null
          gig_id: number
          id: number
          links: Json | null
          order_num: number
          recommended_vocals: Json | null
          required_parts: string[] | null
          session_members: string | null
          sheet_exists: boolean | null
          title: string | null
          updated_at: string
        }
        Insert: {
          artist?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          gig_id: number
          id?: number
          links?: Json | null
          order_num?: number
          recommended_vocals?: Json | null
          required_parts?: string[] | null
          session_members?: string | null
          sheet_exists?: boolean | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          artist?: string | null
          created_at?: string
          created_by?: number | null
          description?: string | null
          gig_id?: number
          id?: number
          links?: Json | null
          order_num?: number
          recommended_vocals?: Json | null
          required_parts?: string[] | null
          session_members?: string | null
          sheet_exists?: boolean | null
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "setlists_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "performers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "setlists_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_fund_entries: {
        Row: {
          account_id: string | null
          actor_id: string | null
          amount: number
          created_at: string
          direction: string
          id: string
          reference: string
          reservation_id: string
        }
        Insert: {
          account_id?: string | null
          actor_id?: string | null
          amount: number
          created_at?: string
          direction: string
          id?: string
          reference: string
          reservation_id: string
        }
        Update: {
          account_id?: string | null
          actor_id?: string | null
          amount?: number
          created_at?: string
          direction?: string
          id?: string
          reference?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_fund_entries_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_fund_entries_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "ticket_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_reservation_events: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          detail: string
          id: string
          reservation_id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          reservation_id: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          detail?: string
          id?: string
          reservation_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_reservation_events_reservation_id_fkey"
            columns: ["reservation_id"]
            isOneToOne: false
            referencedRelation: "ticket_reservations"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_reservations: {
        Row: {
          account_id: string | null
          account_snapshot: Json | null
          admitted_quantity: number
          approved_at: string | null
          buyer_name: string
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          checked_in_at: string | null
          code: string
          consented_at: string
          created_at: string
          depositor: string
          gig_id: number
          gig_snapshot: Json
          id: string
          notice_snapshot: string
          paid_amount: number
          payment_reported_at: string | null
          phone: string
          privacy_snapshot: string
          quantity: number
          refund_account: string | null
          refund_amount: number
          refund_bank: string | null
          refund_holder: string | null
          refund_policy_snapshot: string
          refund_status: string
          request_key: string
          status: string
          total_amount: number
          unit_price: number
          user_id: string
          version: number
        }
        Insert: {
          account_id?: string | null
          account_snapshot?: Json | null
          admitted_quantity?: number
          approved_at?: string | null
          buyer_name: string
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          checked_in_at?: string | null
          code?: string
          consented_at?: string
          created_at?: string
          depositor: string
          gig_id: number
          gig_snapshot: Json
          id?: string
          notice_snapshot: string
          paid_amount?: number
          payment_reported_at?: string | null
          phone: string
          privacy_snapshot: string
          quantity: number
          refund_account?: string | null
          refund_amount?: number
          refund_bank?: string | null
          refund_holder?: string | null
          refund_policy_snapshot: string
          refund_status?: string
          request_key: string
          status?: string
          total_amount: number
          unit_price: number
          user_id: string
          version?: number
        }
        Update: {
          account_id?: string | null
          account_snapshot?: Json | null
          admitted_quantity?: number
          approved_at?: string | null
          buyer_name?: string
          cancellation_reason?: string | null
          cancellation_requested_at?: string | null
          checked_in_at?: string | null
          code?: string
          consented_at?: string
          created_at?: string
          depositor?: string
          gig_id?: number
          gig_snapshot?: Json
          id?: string
          notice_snapshot?: string
          paid_amount?: number
          payment_reported_at?: string | null
          phone?: string
          privacy_snapshot?: string
          quantity?: number
          refund_account?: string | null
          refund_amount?: number
          refund_bank?: string | null
          refund_holder?: string | null
          refund_policy_snapshot?: string
          refund_status?: string
          request_key?: string
          status?: string
          total_amount?: number
          unit_price?: number
          user_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "ticket_reservations_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "payment_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_reservations_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
        ]
      }
      user_legal_consents: {
        Row: {
          accepted_at: string
          document_content: string
          document_hash: string
          document_kind: string
          document_title: string
          document_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          document_content: string
          document_hash: string
          document_kind: string
          document_title: string
          document_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          document_content?: string
          document_hash?: string
          document_kind?: string
          document_title?: string
          document_version?: string
          user_id?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          applied_at: string
          approved_at: string | null
          created_at: string
          email: string | null
          generation: number | null
          id: string
          marketing_opt_in: boolean
          marketing_opted_in_at: string | null
          name: string
          part: string | null
          status: string
        }
        Insert: {
          applied_at?: string
          approved_at?: string | null
          created_at?: string
          email?: string | null
          generation?: number | null
          id?: string
          marketing_opt_in?: boolean
          marketing_opted_in_at?: string | null
          name: string
          part?: string | null
          status?: string
        }
        Update: {
          applied_at?: string
          approved_at?: string | null
          created_at?: string
          email?: string | null
          generation?: number | null
          id?: string
          marketing_opt_in?: boolean
          marketing_opted_in_at?: string | null
          name?: string
          part?: string | null
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      approve_member_with_notification: {
        Args: { p_user_id: string }
        Returns: boolean
      }
      create_app_notification: {
        Args: {
          p_context: Json
          p_event_key: string
          p_event_type: string
          p_notification_id?: string
          p_user_id: string
        }
        Returns: string
      }
      create_ticket_reservation: {
        Args: {
          p_depositor: string
          p_gig_id: number
          p_name: string
          p_offer_hash: string
          p_phone: string
          p_policy_agreed: boolean
          p_privacy_agreed: boolean
          p_quantity: number
          p_request_key: string
        }
        Returns: string
      }
      delete_my_account: { Args: { p_confirmation: string }; Returns: boolean }
      get_ticket_booking_offer: { Args: { p_gig_id: number }; Returns: Json }
      is_admin: { Args: never; Returns: boolean }
      is_approved_member: { Args: never; Returns: boolean }
      list_ticket_reservations: {
        Args: {
          p_admin?: boolean
          p_gig_id?: number
          p_offset?: number
          p_search?: string
        }
        Returns: {
          account_id: string | null
          account_snapshot: Json | null
          admitted_quantity: number
          approved_at: string | null
          buyer_name: string
          cancellation_reason: string | null
          cancellation_requested_at: string | null
          checked_in_at: string | null
          code: string
          consented_at: string
          created_at: string
          depositor: string
          gig_id: number
          gig_snapshot: Json
          id: string
          notice_snapshot: string
          paid_amount: number
          payment_reported_at: string | null
          phone: string
          privacy_snapshot: string
          quantity: number
          refund_account: string | null
          refund_amount: number
          refund_bank: string | null
          refund_holder: string | null
          refund_policy_snapshot: string
          refund_status: string
          request_key: string
          status: string
          total_amount: number
          unit_price: number
          user_id: string
          version: number
        }[]
        SetofOptions: {
          from: "*"
          to: "ticket_reservations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      nomination_session_matches: {
        Args: { p_performer_part: string; p_session_part: string }
        Returns: boolean
      }
      review_gig_rsvp: {
        Args: {
          p_decision: string
          p_gig_id: number
          p_rsvp_id: number
          p_updated_at: string
        }
        Returns: boolean
      }
      set_ticket_payment_account: {
        Args: {
          p_bank: string
          p_holder: string
          p_instruction: string
          p_number: string
        }
        Returns: string
      }
      ticket_notify: {
        Args: { p_action: string; p_detail?: string; p_reservation: string }
        Returns: undefined
      }
      ticket_privacy_notice: { Args: never; Returns: string }
      update_ticket_reservation: {
        Args: {
          p_action: string
          p_id: string
          p_payload?: Json
          p_version: number
        }
        Returns: undefined
      }
      update_ticket_reservation_quantity: {
        Args: { p_id: string; p_quantity: number; p_version: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
