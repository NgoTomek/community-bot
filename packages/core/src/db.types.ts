// Generated from Supabase project mcxhcehbzqxyarjqvihy. Do not edit by hand.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      announcements: {
        Row: { community_id: string; deal_id: string; text: string }
        Insert: { community_id: string; deal_id: string; text: string }
        Update: { community_id?: string; deal_id?: string; text?: string }
        Relationships: [
          {
            foreignKeyName: "announcements_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      approvals: {
        Row: {
          community_id: string
          deal_id: string
          history: Json
          note: string | null
          quick_reasons: Json
          round: number
          run_id: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          community_id: string
          deal_id: string
          history?: Json
          note?: string | null
          quick_reasons?: Json
          round?: number
          run_id: string
          status?: string
          token?: string
          updated_at?: string
        }
        Update: {
          community_id?: string
          deal_id?: string
          history?: Json
          note?: string | null
          quick_reasons?: Json
          round?: number
          run_id?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvals_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approvals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      communities: {
        Row: {
          card: Json
          id: string
          name: string
          source_urls: Json
          status: string
          updated_at: string
        }
        Insert: {
          card: Json
          id: string
          name: string
          source_urls?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          card?: Json
          id?: string
          name?: string
          source_urls?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      community_secrets: {
        Row: { community_id: string; inbox_token: string }
        Insert: { community_id: string; inbox_token?: string }
        Update: { community_id?: string; inbox_token?: string }
        Relationships: [
          {
            foreignKeyName: "community_secrets_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: true
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          created_at: string
          deal: Json
          id: string
          round: number
          run_id: string
          status: string
        }
        Insert: {
          created_at?: string
          deal: Json
          id?: string
          round?: number
          run_id: string
          status?: string
        }
        Update: {
          created_at?: string
          deal?: Json
          id?: string
          round?: number
          run_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "deals_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          claimed_at: string | null
          created_at: string
          error: string | null
          id: string
          params: Json
          progress: string | null
          result: Json | null
          status: string
          type: string
        }
        Insert: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          params?: Json
          progress?: string | null
          result?: Json | null
          status?: string
          type: string
        }
        Update: {
          claimed_at?: string | null
          created_at?: string
          error?: string | null
          id?: string
          params?: Json
          progress?: string | null
          result?: Json | null
          status?: string
          type?: string
        }
        Relationships: []
      }
      luma_events: {
        Row: {
          created_at: string
          deal_id: string
          luma_event_id: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          deal_id: string
          luma_event_id?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          deal_id?: string
          luma_event_id?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "luma_events_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: true
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          community_id: string
          created_at: string
          delay_ms: number
          evidence: Json | null
          id: string
          role: string
          run_id: string
          seq: number
          speaker: string
          stance: string | null
          text: string
        }
        Insert: {
          community_id: string
          created_at?: string
          delay_ms?: number
          evidence?: Json | null
          id?: string
          role: string
          run_id: string
          seq: number
          speaker: string
          stance?: string | null
          text: string
        }
        Update: {
          community_id?: string
          created_at?: string
          delay_ms?: number
          evidence?: Json | null
          id?: string
          role?: string
          run_id?: string
          seq?: number
          speaker?: string
          stance?: string | null
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "runs"
            referencedColumns: ["id"]
          },
        ]
      }
      rsvps: {
        Row: { created_at: string; deal_id: string; id: string; name: string }
        Insert: { created_at?: string; deal_id: string; id?: string; name: string }
        Update: { created_at?: string; deal_id?: string; id?: string; name?: string }
        Relationships: [
          {
            foreignKeyName: "rsvps_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
        ]
      }
      runs: {
        Row: {
          backend: string
          consensus: boolean | null
          created_at: string
          deal_id: string | null
          decline_reason: string | null
          error: string | null
          id: string
          lead_id: string
          need: string
          partner_ids: Json
          round: number
          status: string
          typing: string | null
        }
        Insert: {
          backend: string
          consensus?: boolean | null
          created_at?: string
          deal_id?: string | null
          decline_reason?: string | null
          error?: string | null
          id?: string
          lead_id: string
          need: string
          partner_ids?: Json
          round?: number
          status?: string
          typing?: string | null
        }
        Update: {
          backend?: string
          consensus?: boolean | null
          created_at?: string
          deal_id?: string | null
          decline_reason?: string | null
          error?: string | null
          id?: string
          lead_id?: string
          need?: string
          partner_ids?: Json
          round?: number
          status?: string
          typing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "runs_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "runs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: { key: string; value: string }
        Insert: { key: string; value: string }
        Update: { key?: string; value?: string }
        Relationships: []
      }
    }
    Views: {
      communities_public: {
        Row: {
          card: Json | null
          id: string | null
          name: string | null
          source_urls: Json | null
          status: string | null
          updated_at: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      claim_job: { Args: Record<string, never>; Returns: Json }
      get_event: { Args: { p_deal_id: string }; Returns: Json }
      get_request: { Args: { p_token: string }; Returns: Json }
      list_requests: { Args: { p_inbox: string }; Returns: Json }
      presenter_status: { Args: { p_passcode: string; p_run_id: string }; Returns: Json }
      respond: {
        Args: { p_decision: string; p_note?: string; p_quick?: Json; p_token: string }
        Returns: Json
      }
      rsvp: { Args: { p_deal_id: string; p_name: string }; Returns: string }
      save_card: { Args: { p_card: Json; p_passcode: string; p_status: string }; Returns: string }
      submit_job: { Args: { p_params: Json; p_passcode: string; p_type: string }; Returns: string }
    }
    Enums: { [_ in never]: never }
    CompositeTypes: { [_ in never]: never }
  }
}
