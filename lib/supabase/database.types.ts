export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      booking: {
        Row: {
          amount: number;
          changed_by: string | null;
          client_hash: string | null;
          code: string;
          created_at: string;
          customer_email: string | null;
          customer_name: string;
          customer_phone: string | null;
          decided_at: string | null;
          decided_by: string | null;
          hold_expires_at: string | null;
          hourly_rate: number;
          id: number;
          proof_path: string | null;
          reference_last4: string | null;
          refund_amount: number | null;
          refund_status: string | null;
          refunded_at: string | null;
          refunded_by: string | null;
          source: string;
          status: string;
          submission_id: string;
          submitted_at: string | null;
          terms_accepted_at: string;
          terms_version: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          amount: number;
          changed_by?: string | null;
          client_hash?: string | null;
          code: string;
          created_at?: string;
          customer_email?: string | null;
          customer_name: string;
          customer_phone?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          hold_expires_at?: string | null;
          hourly_rate: number;
          id?: never;
          proof_path?: string | null;
          reference_last4?: string | null;
          refund_amount?: number | null;
          refund_status?: string | null;
          refunded_at?: string | null;
          refunded_by?: string | null;
          source?: string;
          status: string;
          submission_id: string;
          submitted_at?: string | null;
          terms_accepted_at: string;
          terms_version: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amount?: number;
          changed_by?: string | null;
          client_hash?: string | null;
          code?: string;
          created_at?: string;
          customer_email?: string | null;
          customer_name?: string;
          customer_phone?: string | null;
          decided_at?: string | null;
          decided_by?: string | null;
          hold_expires_at?: string | null;
          hourly_rate?: number;
          id?: never;
          proof_path?: string | null;
          reference_last4?: string | null;
          refund_amount?: number | null;
          refund_status?: string | null;
          refunded_at?: string | null;
          refunded_by?: string | null;
          source?: string;
          status?: string;
          submission_id?: string;
          submitted_at?: string | null;
          terms_accepted_at?: string;
          terms_version?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "booking_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "booking_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "booking_refunded_by_fkey";
            columns: ["refunded_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      booking_event: {
        Row: {
          amount: number | null;
          booking_id: number;
          created_at: string;
          id: number;
          kind: string;
          note: string | null;
          reason: string | null;
          refund_owed: boolean | null;
          staff_id: string;
        };
        Insert: {
          amount?: number | null;
          booking_id: number;
          created_at?: string;
          id?: never;
          kind: string;
          note?: string | null;
          reason?: string | null;
          refund_owed?: boolean | null;
          staff_id: string;
        };
        Update: {
          amount?: number | null;
          booking_id?: number;
          created_at?: string;
          id?: never;
          kind?: string;
          note?: string | null;
          reason?: string | null;
          refund_owed?: boolean | null;
          staff_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "booking_event_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "booking";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "booking_event_staff_id_fkey";
            columns: ["staff_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      booking_lookup_miss: {
        Row: {
          client_hash: string;
          created_at: string;
          id: number;
        };
        Insert: {
          client_hash: string;
          created_at?: string;
          id?: never;
        };
        Update: {
          client_hash?: string;
          created_at?: string;
          id?: never;
        };
        Relationships: [];
      };
      court: {
        Row: {
          changed_by: string | null;
          created_at: string;
          id: number;
          name: string;
          note: string | null;
          retired_at: string | null;
          sort_order: number;
          updated_at: string;
          version: number;
        };
        Insert: {
          changed_by?: string | null;
          created_at?: string;
          id?: never;
          name: string;
          note?: string | null;
          retired_at?: string | null;
          sort_order: number;
          updated_at?: string;
          version?: number;
        };
        Update: {
          changed_by?: string | null;
          created_at?: string;
          id?: never;
          name?: string;
          note?: string | null;
          retired_at?: string | null;
          sort_order?: number;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "court_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      reservation: {
        Row: {
          amount: number | null;
          booking_id: number | null;
          cancelled_at: string | null;
          cancelled_by: string | null;
          changed_by: string | null;
          court_id: number;
          created_at: string;
          created_by: string | null;
          customer_name: string | null;
          customer_phone: string | null;
          during: unknown;
          ends_at: string;
          id: number;
          kind: string;
          note: string | null;
          payment_status: string;
          starts_at: string;
          status: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          amount?: number | null;
          booking_id?: number | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          changed_by?: string | null;
          court_id: number;
          created_at?: string;
          created_by?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          during?: unknown;
          ends_at: string;
          id?: never;
          kind: string;
          note?: string | null;
          payment_status?: string;
          starts_at: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          amount?: number | null;
          booking_id?: number | null;
          cancelled_at?: string | null;
          cancelled_by?: string | null;
          changed_by?: string | null;
          court_id?: number;
          created_at?: string;
          created_by?: string | null;
          customer_name?: string | null;
          customer_phone?: string | null;
          during?: unknown;
          ends_at?: string;
          id?: never;
          kind?: string;
          note?: string | null;
          payment_status?: string;
          starts_at?: string;
          status?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "reservation_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "booking";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservation_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "reservation_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "reservation_court_id_fkey";
            columns: ["court_id"];
            isOneToOne: false;
            referencedRelation: "court";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reservation_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      reservation_audit: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          id: number;
          new_row: Json | null;
          old_row: Json | null;
          op: string;
          reservation_id: number;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_row?: Json | null;
          old_row?: Json | null;
          op: string;
          reservation_id: number;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_row?: Json | null;
          old_row?: Json | null;
          op?: string;
          reservation_id?: number;
        };
        Relationships: [];
      };
      staff: {
        Row: {
          created_at: string;
          display_name: string;
          is_active: boolean;
          last_signed_in_at: string | null;
          privacy_acknowledged_at: string | null;
          privacy_acknowledged_version: string | null;
          role: string;
          user_id: string;
          username: string | null;
          version: number;
        };
        Insert: {
          created_at?: string;
          display_name: string;
          is_active?: boolean;
          last_signed_in_at?: string | null;
          privacy_acknowledged_at?: string | null;
          privacy_acknowledged_version?: string | null;
          role?: string;
          user_id: string;
          username?: string | null;
          version?: number;
        };
        Update: {
          created_at?: string;
          display_name?: string;
          is_active?: boolean;
          last_signed_in_at?: string | null;
          privacy_acknowledged_at?: string | null;
          privacy_acknowledged_version?: string | null;
          role?: string;
          user_id?: string;
          username?: string | null;
          version?: number;
        };
        Relationships: [];
      };
      staff_audit: {
        Row: {
          changed_at: string;
          changed_by: string | null;
          id: number;
          new_row: Json | null;
          old_row: Json | null;
          op: string;
          staff_id: string;
        };
        Insert: {
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_row?: Json | null;
          old_row?: Json | null;
          op: string;
          staff_id: string;
        };
        Update: {
          changed_at?: string;
          changed_by?: string | null;
          id?: never;
          new_row?: Json | null;
          old_row?: Json | null;
          op?: string;
          staff_id?: string;
        };
        Relationships: [];
      };
      staff_invite: {
        Row: {
          claimed_at: string | null;
          claimed_by: string | null;
          claimed_username: string | null;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          kind: string;
          revoked_at: string | null;
          role: string | null;
          target_user_id: string | null;
          token_hash: string;
        };
        Insert: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          claimed_username?: string | null;
          created_at?: string;
          created_by: string;
          expires_at: string;
          id?: string;
          kind: string;
          revoked_at?: string | null;
          role?: string | null;
          target_user_id?: string | null;
          token_hash: string;
        };
        Update: {
          claimed_at?: string | null;
          claimed_by?: string | null;
          claimed_username?: string | null;
          created_at?: string;
          created_by?: string;
          expires_at?: string;
          id?: string;
          kind?: string;
          revoked_at?: string | null;
          role?: string | null;
          target_user_id?: string | null;
          token_hash?: string;
        };
        Relationships: [
          {
            foreignKeyName: "staff_invite_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
          {
            foreignKeyName: "staff_invite_target_user_id_fkey";
            columns: ["target_user_id"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      venue_hours: {
        Row: {
          changed_by: string | null;
          close_time: string | null;
          day_of_week: number;
          open_time: string | null;
          updated_at: string;
        };
        Insert: {
          changed_by?: string | null;
          close_time?: string | null;
          day_of_week: number;
          open_time?: string | null;
          updated_at?: string;
        };
        Update: {
          changed_by?: string | null;
          close_time?: string | null;
          day_of_week?: number;
          open_time?: string | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_hours_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
      venue_settings: {
        Row: {
          booking_horizon_days: number;
          changed_by: string | null;
          hourly_rate: number;
          id: boolean;
          slot_minutes: number;
          timezone: string;
          updated_at: string;
          version: number;
        };
        Insert: {
          booking_horizon_days?: number;
          changed_by?: string | null;
          hourly_rate?: number;
          id?: boolean;
          slot_minutes?: number;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Update: {
          booking_horizon_days?: number;
          changed_by?: string | null;
          hourly_rate?: number;
          id?: boolean;
          slot_minutes?: number;
          timezone?: string;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "venue_settings_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      acknowledge_privacy_notice: {
        Args: { p_version: string };
        Returns: string;
      };
      cancel_online_booking: {
        Args: {
          p_booking_id: number;
          p_note: string;
          p_reason: string;
          p_refund_owed: boolean;
          p_version: number;
        };
        Returns: Json;
      };
      claim_staff_invite: {
        Args: { p_token_hash: string; p_username: string };
        Returns: string;
      };
      claim_staff_reset: { Args: { p_token_hash: string }; Returns: string };
      confirm_online_booking: {
        Args: { p_booking_id: number; p_version: number };
        Returns: Json;
      };
      court_usage: {
        Args: { for_court_id?: number; from_date: string; to_date: string };
        Returns: {
          booked_minutes: number;
          court_id: number;
          hour: number;
          local_date: string;
        }[];
      };
      create_staff_invite: {
        Args: {
          p_kind: string;
          p_role?: string;
          p_target_user_id?: string;
          p_token_hash?: string;
        };
        Returns: {
          claimed_at: string | null;
          claimed_by: string | null;
          claimed_username: string | null;
          created_at: string;
          created_by: string;
          expires_at: string;
          id: string;
          kind: string;
          revoked_at: string | null;
          role: string | null;
          target_user_id: string | null;
          token_hash: string;
        };
        SetofOptions: {
          from: "*";
          to: "staff_invite";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      ensure_staff: {
        Args: never;
        Returns: {
          display_name: string;
          is_active: boolean;
          privacy_acknowledged_version: string;
          role: string;
        }[];
      };
      expire_online_holds: { Args: never; Returns: number };
      forget_payment_proofs: { Args: { p_paths: string[] }; Returns: number };
      hold_online_booking: {
        Args: {
          p_day: string;
          p_email: string;
          p_name: string;
          p_phone: string;
          p_picks: Json;
          p_submission_id: string;
          p_terms_version: string;
        };
        Returns: Json;
      };
      lookup_online_booking: { Args: { p_code: string }; Returns: Json };
      payment_proofs_due: {
        Args: { p_limit?: number };
        Returns: {
          booking_id: number;
          proof_path: string;
        }[];
      };
      peek_staff_invite: {
        Args: { p_token_hash: string };
        Returns: {
          kind: string;
          target_username: string;
        }[];
      };
      purge_customer_phones: { Args: never; Returns: number };
      purge_online_booking_details: { Args: never; Returns: number };
      reject_online_booking: {
        Args: {
          p_booking_id: number;
          p_note: string;
          p_reason: string;
          p_refund_owed: boolean;
          p_version: number;
        };
        Returns: Json;
      };
      release_online_booking: {
        Args: { p_submission_id: string };
        Returns: Json;
      };
      reorder_courts: {
        Args: { ids: number[]; versions: number[] };
        Returns: undefined;
      };
      revoke_staff_invite: { Args: { p_id: string }; Returns: undefined };
      save_venue_hours: {
        Args: {
          booking_horizon_days: number;
          days: Json;
          settings_version: number;
          slot_minutes: number;
        };
        Returns: undefined;
      };
      settle_online_refund: {
        Args: {
          p_amount: number;
          p_booking_id: number;
          p_note: string;
          p_outcome: string;
          p_version: number;
        };
        Returns: Json;
      };
      submit_online_booking: {
        Args: { p_reference_last4: string; p_submission_id: string };
        Returns: Json;
      };
      update_staff_role: {
        Args: {
          p_is_active: boolean;
          p_role: string;
          p_user_id: string;
          p_version: number;
        };
        Returns: {
          created_at: string;
          display_name: string;
          is_active: boolean;
          last_signed_in_at: string | null;
          privacy_acknowledged_at: string | null;
          privacy_acknowledged_version: string | null;
          role: string;
          user_id: string;
          username: string | null;
          version: number;
        };
        SetofOptions: {
          from: "*";
          to: "staff";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
