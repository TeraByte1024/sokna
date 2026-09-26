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
    PostgrestVersion: "14.5"
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
      gig_notification_queue: {
        Row: {
          created_at: string
          gig_id: number
          id: number
          scheduled_at: string
          sent_at: string | null
          song_ids: number[]
          status: string
          triggered_by: string | null
        }
        Insert: {
          created_at?: string
          gig_id: number
          id?: never
          scheduled_at: string
          sent_at?: string | null
          song_ids?: number[]
          status?: string
          triggered_by?: string | null
        }
        Update: {
          created_at?: string
          gig_id?: number
          id?: never
          scheduled_at?: string
          sent_at?: string | null
          song_ids?: number[]
          status?: string
          triggered_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gig_notification_queue_gig_id_fkey"
            columns: ["gig_id"]
            isOneToOne: false
            referencedRelation: "gigs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gig_notification_queue_triggered_by_fkey"
            columns: ["triggered_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      gig_rsvps: {
        Row: {
          created_at: string
          gig_id: number
          id: number
          note: string | null
          part: string | null
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
          advance_ticket_price: number | null
          created_at: string
          door_ticket_price: number | null
          id: number
          is_public: boolean
          location: string | null
          meeting_date: string | null
          meeting_location: string | null
          meeting_time: string | null
          perform_date: string
          perform_time: string | null
          poster_url: string | null
          subtitle: string | null
          title: string | null
        }
        Insert: {
          advance_ticket_price?: number | null
          created_at?: string
          door_ticket_price?: number | null
          id?: number
          is_public?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_location?: string | null
          meeting_time?: string | null
          perform_date: string
          perform_time?: string | null
          poster_url?: string | null
          subtitle?: string | null
          title?: string | null
        }
        Update: {
          advance_ticket_price?: number | null
          created_at?: string
          door_ticket_price?: number | null
          id?: number
          is_public?: boolean
          location?: string | null
          meeting_date?: string | null
          meeting_location?: string | null
          meeting_time?: string | null
          perform_date?: string
          perform_time?: string | null
          poster_url?: string | null
          subtitle?: string | null
          title?: string | null
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
          id: string
          link: string | null
          push_attempted_at: string | null
          push_eligible: boolean
          push_error: string | null
          push_sent_at: string | null
          push_status: string
          title: string | null
          user_id: string | null
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_eligible?: boolean
          push_error?: string | null
          push_sent_at?: string | null
          push_status?: string
          title?: string | null
          user_id?: string | null
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          push_attempted_at?: string | null
          push_eligible?: boolean
          push_error?: string | null
          push_sent_at?: string | null
          push_status?: string
          title?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
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
      is_admin: { Args: never; Returns: boolean }
      review_gig_rsvp: {
        Args: {
          p_decision: string
          p_gig_id: number
          p_rsvp_id: number
          p_updated_at: string
        }
        Returns: boolean
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
