export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
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
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
      reservation: {
        Row: {
          amount: number | null;
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
            foreignKeyName: "reservation_cancelled_by_fkey";
            columns: ["cancelled_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["clerk_user_id"];
          },
          {
            foreignKeyName: "reservation_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["clerk_user_id"];
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
            referencedColumns: ["clerk_user_id"];
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
          clerk_user_id: string;
          created_at: string;
          display_name: string;
          email: string | null;
          is_active: boolean;
          last_signed_in_at: string | null;
          role: string;
        };
        Insert: {
          clerk_user_id: string;
          created_at?: string;
          display_name: string;
          email?: string | null;
          is_active?: boolean;
          last_signed_in_at?: string | null;
          role?: string;
        };
        Update: {
          clerk_user_id?: string;
          created_at?: string;
          display_name?: string;
          email?: string | null;
          is_active?: boolean;
          last_signed_in_at?: string | null;
          role?: string;
        };
        Relationships: [];
      };
      venue_settings: {
        Row: {
          booking_horizon_days: number;
          changed_by: string | null;
          id: boolean;
          slot_minutes: number;
          timezone: string;
          updated_at: string;
          version: number;
          weekday_close: string;
          weekday_open: string;
          weekend_close: string;
          weekend_open: string;
        };
        Insert: {
          booking_horizon_days?: number;
          changed_by?: string | null;
          id?: boolean;
          slot_minutes?: number;
          timezone?: string;
          updated_at?: string;
          version?: number;
          weekday_close: string;
          weekday_open: string;
          weekend_close: string;
          weekend_open: string;
        };
        Update: {
          booking_horizon_days?: number;
          changed_by?: string | null;
          id?: boolean;
          slot_minutes?: number;
          timezone?: string;
          updated_at?: string;
          version?: number;
          weekday_close?: string;
          weekday_open?: string;
          weekend_close?: string;
          weekend_open?: string;
        };
        Relationships: [
          {
            foreignKeyName: "venue_settings_changed_by_fkey";
            columns: ["changed_by"];
            isOneToOne: false;
            referencedRelation: "staff";
            referencedColumns: ["clerk_user_id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      court_usage: {
        Args: { for_court_id?: number; from_date: string; to_date: string };
        Returns: {
          booked_minutes: number;
          court_id: number;
          hour: number;
          local_date: string;
        }[];
      };
      ensure_staff: {
        Args: never;
        Returns: {
          display_name: string;
          is_active: boolean;
          role: string;
        }[];
      };
      reorder_courts: {
        Args: { ids: number[]; versions: number[] };
        Returns: undefined;
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
