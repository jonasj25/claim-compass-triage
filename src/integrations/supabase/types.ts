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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      case_events: {
        Row: {
          actor: string | null
          case_id: string
          created_at: string
          id: string
          payload: Json
          type: string
        }
        Insert: {
          actor?: string | null
          case_id: string
          created_at?: string
          id?: string
          payload?: Json
          type: string
        }
        Update: {
          actor?: string | null
          case_id?: string
          created_at?: string
          id?: string
          payload?: Json
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      case_workflow: {
        Row: {
          assignee: string | null
          case_id: string
          qa_sample: boolean
          queue: string
          sla_due_at: string | null
          updated_at: string
        }
        Insert: {
          assignee?: string | null
          case_id: string
          qa_sample?: boolean
          queue: string
          sla_due_at?: string | null
          updated_at?: string
        }
        Update: {
          assignee?: string | null
          case_id?: string
          qa_sample?: boolean
          queue?: string
          sla_due_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_workflow_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      claim_intake: {
        Row: {
          audio_url: string | null
          case_id: string
          channel: string
          customer_name: string | null
          documents: Json | null
          form: Json | null
          plate: string | null
          received_at: string | null
          transcript: Json | null
        }
        Insert: {
          audio_url?: string | null
          case_id: string
          channel: string
          customer_name?: string | null
          documents?: Json | null
          form?: Json | null
          plate?: string | null
          received_at?: string | null
          transcript?: Json | null
        }
        Update: {
          audio_url?: string | null
          case_id?: string
          channel?: string
          customer_name?: string | null
          documents?: Json | null
          form?: Json | null
          plate?: string | null
          received_at?: string | null
          transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "claim_intake_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: true
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      claims: {
        Row: {
          case_id: string
          case_status: string | null
          claim_summary: string | null
          claim_type: string | null
          duplicate_flag: boolean | null
          evidence_conflict: boolean | null
          incident_report_present: boolean | null
          injury_reported: boolean | null
          itemized_quote_present: boolean | null
          liability_disputed: boolean | null
          policy_active_on_incident: boolean | null
          quote_eur: number | null
          raw: Json | null
          received_at: string | null
          repair_type: string | null
        }
        Insert: {
          case_id: string
          case_status?: string | null
          claim_summary?: string | null
          claim_type?: string | null
          duplicate_flag?: boolean | null
          evidence_conflict?: boolean | null
          incident_report_present?: boolean | null
          injury_reported?: boolean | null
          itemized_quote_present?: boolean | null
          liability_disputed?: boolean | null
          policy_active_on_incident?: boolean | null
          quote_eur?: number | null
          raw?: Json | null
          received_at?: string | null
          repair_type?: string | null
        }
        Update: {
          case_id?: string
          case_status?: string | null
          claim_summary?: string | null
          claim_type?: string | null
          duplicate_flag?: boolean | null
          evidence_conflict?: boolean | null
          incident_report_present?: boolean | null
          injury_reported?: boolean | null
          itemized_quote_present?: boolean | null
          liability_disputed?: boolean | null
          policy_active_on_incident?: boolean | null
          quote_eur?: number | null
          raw?: Json | null
          received_at?: string | null
          repair_type?: string | null
        }
        Relationships: []
      }
      comments: {
        Row: {
          author: string | null
          body: string
          case_id: string
          created_at: string
          id: string
        }
        Insert: {
          author?: string | null
          body: string
          case_id: string
          created_at?: string
          id?: string
        }
        Update: {
          author?: string | null
          body?: string
          case_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      decisions: {
        Row: {
          case_id: string
          created_at: string
          explanation: string | null
          id: string
          is_current: boolean
          missing_fields: string[]
          needs_recheck: boolean
          policy_version: string
          recommendation: string
          rule_id: string
        }
        Insert: {
          case_id: string
          created_at?: string
          explanation?: string | null
          id?: string
          is_current?: boolean
          missing_fields?: string[]
          needs_recheck?: boolean
          policy_version: string
          recommendation: string
          rule_id: string
        }
        Update: {
          case_id?: string
          created_at?: string
          explanation?: string | null
          id?: string
          is_current?: boolean
          missing_fields?: string[]
          needs_recheck?: boolean
          policy_version?: string
          recommendation?: string
          rule_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      fact_sources: {
        Row: {
          case_id: string
          confidence: string
          created_at: string
          field: string
          id: string
          quote: string | null
          ref: string | null
          source_type: string
        }
        Insert: {
          case_id: string
          confidence?: string
          created_at?: string
          field: string
          id?: string
          quote?: string | null
          ref?: string | null
          source_type: string
        }
        Update: {
          case_id?: string
          confidence?: string
          created_at?: string
          field?: string
          id?: string
          quote?: string | null
          ref?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "fact_sources_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      outcomes: {
        Row: {
          case_id: string
          correct_next_step: string | null
          decision_id: string | null
          final_outcome: string | null
          id: string
          recorded_at: string
          recorded_by: string | null
        }
        Insert: {
          case_id: string
          correct_next_step?: string | null
          decision_id?: string | null
          final_outcome?: string | null
          id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Update: {
          case_id?: string
          correct_next_step?: string | null
          decision_id?: string | null
          final_outcome?: string | null
          id?: string
          recorded_at?: string
          recorded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcomes_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "outcomes_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach: {
        Row: {
          case_id: string
          channel: string
          id: string
          last_reminder_at: string | null
          missing_items: string[]
          reminder_count: number
          sent_at: string
          status: string
        }
        Insert: {
          case_id: string
          channel: string
          id?: string
          last_reminder_at?: string | null
          missing_items?: string[]
          reminder_count?: number
          sent_at?: string
          status?: string
        }
        Update: {
          case_id?: string
          channel?: string
          id?: string
          last_reminder_at?: string | null
          missing_items?: string[]
          reminder_count?: number
          sent_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
        ]
      }
      overrides: {
        Row: {
          case_id: string
          created_at: string
          decision_id: string | null
          handling_seconds: number | null
          id: string
          new_recommendation: string
          original_recommendation: string | null
          policy_version: string | null
          reason_code: string | null
          reason_text: string | null
          reviewer: string | null
          second_approver: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          decision_id?: string | null
          handling_seconds?: number | null
          id?: string
          new_recommendation: string
          original_recommendation?: string | null
          policy_version?: string | null
          reason_code?: string | null
          reason_text?: string | null
          reviewer?: string | null
          second_approver?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          decision_id?: string | null
          handling_seconds?: number | null
          id?: string
          new_recommendation?: string
          original_recommendation?: string | null
          policy_version?: string | null
          reason_code?: string | null
          reason_text?: string | null
          reviewer?: string | null
          second_approver?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "overrides_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "claims"
            referencedColumns: ["case_id"]
          },
          {
            foreignKeyName: "overrides_decision_id_fkey"
            columns: ["decision_id"]
            isOneToOne: false
            referencedRelation: "decisions"
            referencedColumns: ["id"]
          },
        ]
      }
      policy_versions: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          config: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          config: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          config?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          status?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          name?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "reviewer" | "policy_owner" | "ops_lead"
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
  public: {
    Enums: {
      app_role: ["reviewer", "policy_owner", "ops_lead"],
    },
  },
} as const
