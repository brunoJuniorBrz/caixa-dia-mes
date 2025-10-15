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
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          payload: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          payload?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_user_id_fkey"
            columns: ["actor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_box_electronic_entries: {
        Row: {
          amount_cents: number
          cash_box_id: string
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
        }
        Insert: {
          amount_cents: number
          cash_box_id: string
          created_at?: string
          id?: string
          method: Database["public"]["Enums"]["payment_method"]
        }
        Update: {
          amount_cents?: number
          cash_box_id?: string
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_box_electronic_entries_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_box_expenses: {
        Row: {
          amount_cents: number
          cash_box_id: string
          created_at: string
          id: string
          title: string
        }
        Insert: {
          amount_cents: number
          cash_box_id: string
          created_at?: string
          id?: string
          title: string
        }
        Update: {
          amount_cents?: number
          cash_box_id?: string
          created_at?: string
          id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_box_expenses_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_box_services: {
        Row: {
          cash_box_id: string
          created_at: string
          id: string
          quantity: number
          service_type_id: string
          total_cents: number | null
          unit_price_cents: number
        }
        Insert: {
          cash_box_id: string
          created_at?: string
          id?: string
          quantity: number
          service_type_id: string
          total_cents?: number | null
          unit_price_cents: number
        }
        Update: {
          cash_box_id?: string
          created_at?: string
          id?: string
          quantity?: number
          service_type_id?: string
          total_cents?: number | null
          unit_price_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "cash_box_services_cash_box_id_fkey"
            columns: ["cash_box_id"]
            isOneToOne: false
            referencedRelation: "cash_boxes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_box_services_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_boxes: {
        Row: {
          created_at: string
          date: string
          id: string
          note: string | null
          store_id: string
          vistoriador_id: string
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          note?: string | null
          store_id: string
          vistoriador_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          note?: string | null
          store_id?: string
          vistoriador_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_boxes_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_boxes_vistoriador_id_fkey"
            columns: ["vistoriador_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      fixed_expense_templates: {
        Row: {
          created_at: string
          default_amount_cents: number
          id: string
          is_active: boolean
          name: string
          preferred_day: number | null
          store_id: string | null
        }
        Insert: {
          created_at?: string
          default_amount_cents: number
          id?: string
          is_active?: boolean
          name: string
          preferred_day?: number | null
          store_id?: string | null
        }
        Update: {
          created_at?: string
          default_amount_cents?: number
          id?: string
          is_active?: boolean
          name?: string
          preferred_day?: number | null
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fixed_expense_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_expenses: {
        Row: {
          amount_cents: number
          created_at: string
          created_by_user_id: string | null
          id: string
          month_year: string
          source: Database["public"]["Enums"]["expense_source"]
          store_id: string
          title: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          month_year: string
          source: Database["public"]["Enums"]["expense_source"]
          store_id: string
          title: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by_user_id?: string | null
          id?: string
          month_year?: string
          source?: Database["public"]["Enums"]["expense_source"]
          store_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "monthly_expenses_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "monthly_expenses_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      receivable_payments: {
        Row: {
          amount_cents: number
          created_at: string
          id: string
          method: Database["public"]["Enums"]["payment_method"] | null
          paid_on: string
          receivable_id: string
          recorded_by_user_id: string
        }
        Insert: {
          amount_cents: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_on: string
          receivable_id: string
          recorded_by_user_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"] | null
          paid_on?: string
          receivable_id?: string
          recorded_by_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_payments_receivable_id_fkey"
            columns: ["receivable_id"]
            isOneToOne: false
            referencedRelation: "receivables"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivable_payments_recorded_by_user_id_fkey"
            columns: ["recorded_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      receivables: {
        Row: {
          created_at: string
          created_by_user_id: string
          customer_name: string
          due_date: string | null
          id: string
          original_amount_cents: number | null
          plate: string | null
          service_type_id: string | null
          status: Database["public"]["Enums"]["receivable_status"]
          store_id: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          customer_name: string
          due_date?: string | null
          id?: string
          original_amount_cents?: number | null
          plate?: string | null
          service_type_id?: string | null
          status?: Database["public"]["Enums"]["receivable_status"]
          store_id: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          customer_name?: string
          due_date?: string | null
          id?: string
          original_amount_cents?: number | null
          plate?: string | null
          service_type_id?: string | null
          status?: Database["public"]["Enums"]["receivable_status"]
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivables_created_by_user_id_fkey"
            columns: ["created_by_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_service_type_id_fkey"
            columns: ["service_type_id"]
            isOneToOne: false
            referencedRelation: "service_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receivables_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      service_types: {
        Row: {
          code: string
          counts_in_gross: boolean
          created_at: string
          default_price_cents: number
          id: string
          name: string
        }
        Insert: {
          code: string
          counts_in_gross?: boolean
          created_at?: string
          default_price_cents: number
          id?: string
          name: string
        }
        Update: {
          code?: string
          counts_in_gross?: boolean
          created_at?: string
          default_price_cents?: number
          id?: string
          name?: string
        }
        Relationships: []
      }
      stores: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          role: Database["public"]["Enums"]["app_role"]
          store_id: string | null
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email: string
          id?: string
          is_active?: boolean
          name: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          role?: Database["public"]["Enums"]["app_role"]
          store_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_store_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      is_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vistoriador"
      expense_source: "fixa" | "avulsa"
      payment_method: "pix" | "cartao"
      receivable_status: "aberto" | "pago_pendente_baixa" | "baixado"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "vistoriador"],
      expense_source: ["fixa", "avulsa"],
      payment_method: ["pix", "cartao"],
      receivable_status: ["aberto", "pago_pendente_baixa", "baixado"],
    },
  },
} as const
