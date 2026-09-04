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
  public: {
    Tables: {
      evidence_observations: {
        Row: {
          captured_at: string
          confidence: number | null
          domain: string
          id: string
          inserted_at: string
          key: string
          metadata: Json | null
          observed_at: string | null
          research_report_id: string | null
          scan_run_id: string | null
          schema_version: string
          source: string
          source_reference: string | null
          status: string
          token_id: string
          unit: string | null
          value_json: Json | null
        }
        Insert: {
          captured_at: string
          confidence?: number | null
          domain: string
          id?: string
          inserted_at?: string
          key: string
          metadata?: Json | null
          observed_at?: string | null
          research_report_id?: string | null
          scan_run_id?: string | null
          schema_version: string
          source: string
          source_reference?: string | null
          status: string
          token_id: string
          unit?: string | null
          value_json?: Json | null
        }
        Update: {
          captured_at?: string
          confidence?: number | null
          domain?: string
          id?: string
          inserted_at?: string
          key?: string
          metadata?: Json | null
          observed_at?: string | null
          research_report_id?: string | null
          scan_run_id?: string | null
          schema_version?: string
          source?: string
          source_reference?: string | null
          status?: string
          token_id?: string
          unit?: string | null
          value_json?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_observations_research_report_id_fkey"
            columns: ["research_report_id"]
            isOneToOne: false
            referencedRelation: "research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_observations_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_observations_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          created_at: string
          entry_state_at_promotion: string | null
          id: string
          is_active: boolean
          market_cap_at_promotion: number | null
          rank: number
          research_report_id: string | null
          scan_run_id: string | null
          thesis_score_at_promotion: number | null
          token_id: string
        }
        Insert: {
          created_at?: string
          entry_state_at_promotion?: string | null
          id?: string
          is_active?: boolean
          market_cap_at_promotion?: number | null
          rank?: number
          research_report_id?: string | null
          scan_run_id?: string | null
          thesis_score_at_promotion?: number | null
          token_id: string
        }
        Update: {
          created_at?: string
          entry_state_at_promotion?: string | null
          id?: string
          is_active?: boolean
          market_cap_at_promotion?: number | null
          rank?: number
          research_report_id?: string | null
          scan_run_id?: string | null
          thesis_score_at_promotion?: number | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_research_report_id_fkey"
            columns: ["research_report_id"]
            isOneToOne: false
            referencedRelation: "research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_outcomes: {
        Row: {
          created_at: string
          discovery_at: string
          discovery_entry_score: number | null
          discovery_market_cap: number | null
          discovery_price: number | null
          discovery_thesis_score: number | null
          id: string
          last_updated_at: string
          market_cap_1h: number | null
          market_cap_24h: number | null
          market_cap_3d: number | null
          market_cap_6h: number | null
          market_cap_7d: number | null
          maximum_drawdown_pct: number | null
          maximum_gain_pct: number | null
          opportunity_id: string | null
          peak_market_cap: number | null
          peak_price: number | null
          status: string
          time_to_peak_minutes: number | null
          token_id: string
        }
        Insert: {
          created_at?: string
          discovery_at: string
          discovery_entry_score?: number | null
          discovery_market_cap?: number | null
          discovery_price?: number | null
          discovery_thesis_score?: number | null
          id?: string
          last_updated_at?: string
          market_cap_1h?: number | null
          market_cap_24h?: number | null
          market_cap_3d?: number | null
          market_cap_6h?: number | null
          market_cap_7d?: number | null
          maximum_drawdown_pct?: number | null
          maximum_gain_pct?: number | null
          opportunity_id?: string | null
          peak_market_cap?: number | null
          peak_price?: number | null
          status?: string
          time_to_peak_minutes?: number | null
          token_id: string
        }
        Update: {
          created_at?: string
          discovery_at?: string
          discovery_entry_score?: number | null
          discovery_market_cap?: number | null
          discovery_price?: number | null
          discovery_thesis_score?: number | null
          id?: string
          last_updated_at?: string
          market_cap_1h?: number | null
          market_cap_24h?: number | null
          market_cap_3d?: number | null
          market_cap_6h?: number | null
          market_cap_7d?: number | null
          maximum_drawdown_pct?: number | null
          maximum_gain_pct?: number | null
          opportunity_id?: string | null
          peak_market_cap?: number | null
          peak_price?: number | null
          status?: string
          time_to_peak_minutes?: number | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_outcomes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_outcomes_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      research_reports: {
        Row: {
          base_mc_high: number | null
          base_mc_low: number | null
          bear_case: string | null
          bull_case: string | null
          bull_mc_high: number | null
          bull_mc_low: number | null
          catalyst_analysis: string | null
          catalyst_score: number | null
          chart_analysis: string | null
          chart_entry_score: number | null
          core_thesis: string | null
          created_at: string
          dev_integrity_score: number | null
          developer_analysis: string | null
          distribution_analysis: string | null
          distribution_score: number | null
          entry_score: number
          entry_state: string
          evidence_confidence: number
          failure_mc_high: number | null
          failure_mc_low: number | null
          id: string
          invalidation: string[]
          liquidity_analysis: string | null
          liquidity_score: number | null
          meme_lore: string | null
          meme_quality_score: number | null
          mindshare_analysis: string | null
          mindshare_score: number | null
          model_name: string | null
          opportunity_stage: string
          prompt_version: string | null
          scan_run_id: string | null
          scoring_version: string | null
          structural_multiplier: number
          thesis_score: number
          token_id: string
          valuation_score: number | null
          wallet_analysis: string | null
          why_now: string | null
          wingman_verdict: string | null
        }
        Insert: {
          base_mc_high?: number | null
          base_mc_low?: number | null
          bear_case?: string | null
          bull_case?: string | null
          bull_mc_high?: number | null
          bull_mc_low?: number | null
          catalyst_analysis?: string | null
          catalyst_score?: number | null
          chart_analysis?: string | null
          chart_entry_score?: number | null
          core_thesis?: string | null
          created_at?: string
          dev_integrity_score?: number | null
          developer_analysis?: string | null
          distribution_analysis?: string | null
          distribution_score?: number | null
          entry_score: number
          entry_state: string
          evidence_confidence: number
          failure_mc_high?: number | null
          failure_mc_low?: number | null
          id?: string
          invalidation?: string[]
          liquidity_analysis?: string | null
          liquidity_score?: number | null
          meme_lore?: string | null
          meme_quality_score?: number | null
          mindshare_analysis?: string | null
          mindshare_score?: number | null
          model_name?: string | null
          opportunity_stage: string
          prompt_version?: string | null
          scan_run_id?: string | null
          scoring_version?: string | null
          structural_multiplier?: number
          thesis_score: number
          token_id: string
          valuation_score?: number | null
          wallet_analysis?: string | null
          why_now?: string | null
          wingman_verdict?: string | null
        }
        Update: {
          base_mc_high?: number | null
          base_mc_low?: number | null
          bear_case?: string | null
          bull_case?: string | null
          bull_mc_high?: number | null
          bull_mc_low?: number | null
          catalyst_analysis?: string | null
          catalyst_score?: number | null
          chart_analysis?: string | null
          chart_entry_score?: number | null
          core_thesis?: string | null
          created_at?: string
          dev_integrity_score?: number | null
          developer_analysis?: string | null
          distribution_analysis?: string | null
          distribution_score?: number | null
          entry_score?: number
          entry_state?: string
          evidence_confidence?: number
          failure_mc_high?: number | null
          failure_mc_low?: number | null
          id?: string
          invalidation?: string[]
          liquidity_analysis?: string | null
          liquidity_score?: number | null
          meme_lore?: string | null
          meme_quality_score?: number | null
          mindshare_analysis?: string | null
          mindshare_score?: number | null
          model_name?: string | null
          opportunity_stage?: string
          prompt_version?: string | null
          scan_run_id?: string | null
          scoring_version?: string | null
          structural_multiplier?: number
          thesis_score?: number
          token_id?: string
          valuation_score?: number | null
          wallet_analysis?: string | null
          why_now?: string | null
          wingman_verdict?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "research_reports_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_reports_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_candidates: {
        Row: {
          activity_state: string | null
          age_basis: string | null
          attention_price_divergence: string | null
          buys_24h: number | null
          chain: string
          consecutive_scans_seen: number
          contract_address: string | null
          created_at: string
          discovery_lanes: string[]
          discovery_queries: string[]
          discovery_ranks: Json | null
          discovery_sources: string[]
          enriched: boolean
          evidence_age_minutes: number | null
          evidence_carried_forward: boolean
          extension_reasons: Json | null
          extension_risk: string | null
          first_seen_scan_at: string | null
          global_rank: number | null
          history_snapshot_count: number
          holder_count: number | null
          id: string
          lane_ranks: Json | null
          lane_rejections: Json | null
          last_enriched_at: string | null
          last_selected_as_survivor_at: string | null
          liquidity_usd: number | null
          market_cap: number | null
          market_cap_bucket: string | null
          metrics_detail: Json | null
          minutes_since_last_trade: number | null
          participation_detail: Json | null
          participation_policy_version: string | null
          participation_status: string | null
          persistence_signal: string | null
          previous_quantitative_priority: number | null
          previous_seen_scan_at: string | null
          previous_selected_as_survivor: boolean
          previous_setups: string[]
          price_change_1h: number | null
          price_change_24h: number | null
          price_change_6h: number | null
          price_integrity_detail: Json | null
          price_integrity_policy_version: string | null
          price_integrity_status: string | null
          price_usd: number | null
          priority_breakdown: Json | null
          priority_components: Json | null
          priority_delta: number | null
          promoted_reason: string | null
          quantitative_priority: number | null
          quantitative_score: number | null
          reacceleration_signal: string | null
          recurrence_detail: Json | null
          recurrence_state: string
          refresh_domains: Json | null
          refresh_state: string
          rejection_details: Json | null
          rejection_reason: string | null
          scan_run_id: string
          scanner_version: string | null
          scans_seen_count: number
          selected_by_global_ranking: boolean
          selected_by_lane_reservation: boolean
          sells_24h: number | null
          setup_changed: boolean
          stage_reached: string
          structural_detail: Json | null
          structural_policy_version: string | null
          structural_safety: string
          structural_status: string | null
          token_age_minutes: number | null
          token_id: string
          token_security: string
          trades_1h: number | null
          trades_24h: number | null
          trades_5m: number | null
          universe_category: string | null
          universe_eligibility: string
          universe_reason: string | null
          volume_1h: number | null
          volume_24h: number | null
          volume_5m: number | null
          volume_6h: number | null
          volume_to_liquidity_24h: number | null
          volume_to_market_cap_24h: number | null
        }
        Insert: {
          activity_state?: string | null
          age_basis?: string | null
          attention_price_divergence?: string | null
          buys_24h?: number | null
          chain?: string
          consecutive_scans_seen?: number
          contract_address?: string | null
          created_at?: string
          discovery_lanes?: string[]
          discovery_queries?: string[]
          discovery_ranks?: Json | null
          discovery_sources?: string[]
          enriched?: boolean
          evidence_age_minutes?: number | null
          evidence_carried_forward?: boolean
          extension_reasons?: Json | null
          extension_risk?: string | null
          first_seen_scan_at?: string | null
          global_rank?: number | null
          history_snapshot_count?: number
          holder_count?: number | null
          id?: string
          lane_ranks?: Json | null
          lane_rejections?: Json | null
          last_enriched_at?: string | null
          last_selected_as_survivor_at?: string | null
          liquidity_usd?: number | null
          market_cap?: number | null
          market_cap_bucket?: string | null
          metrics_detail?: Json | null
          minutes_since_last_trade?: number | null
          participation_detail?: Json | null
          participation_policy_version?: string | null
          participation_status?: string | null
          persistence_signal?: string | null
          previous_quantitative_priority?: number | null
          previous_seen_scan_at?: string | null
          previous_selected_as_survivor?: boolean
          previous_setups?: string[]
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_6h?: number | null
          price_integrity_detail?: Json | null
          price_integrity_policy_version?: string | null
          price_integrity_status?: string | null
          price_usd?: number | null
          priority_breakdown?: Json | null
          priority_components?: Json | null
          priority_delta?: number | null
          promoted_reason?: string | null
          quantitative_priority?: number | null
          quantitative_score?: number | null
          reacceleration_signal?: string | null
          recurrence_detail?: Json | null
          recurrence_state?: string
          refresh_domains?: Json | null
          refresh_state?: string
          rejection_details?: Json | null
          rejection_reason?: string | null
          scan_run_id: string
          scanner_version?: string | null
          scans_seen_count?: number
          selected_by_global_ranking?: boolean
          selected_by_lane_reservation?: boolean
          sells_24h?: number | null
          setup_changed?: boolean
          stage_reached: string
          structural_detail?: Json | null
          structural_policy_version?: string | null
          structural_safety?: string
          structural_status?: string | null
          token_age_minutes?: number | null
          token_id: string
          token_security?: string
          trades_1h?: number | null
          trades_24h?: number | null
          trades_5m?: number | null
          universe_category?: string | null
          universe_eligibility?: string
          universe_reason?: string | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_5m?: number | null
          volume_6h?: number | null
          volume_to_liquidity_24h?: number | null
          volume_to_market_cap_24h?: number | null
        }
        Update: {
          activity_state?: string | null
          age_basis?: string | null
          attention_price_divergence?: string | null
          buys_24h?: number | null
          chain?: string
          consecutive_scans_seen?: number
          contract_address?: string | null
          created_at?: string
          discovery_lanes?: string[]
          discovery_queries?: string[]
          discovery_ranks?: Json | null
          discovery_sources?: string[]
          enriched?: boolean
          evidence_age_minutes?: number | null
          evidence_carried_forward?: boolean
          extension_reasons?: Json | null
          extension_risk?: string | null
          first_seen_scan_at?: string | null
          global_rank?: number | null
          history_snapshot_count?: number
          holder_count?: number | null
          id?: string
          lane_ranks?: Json | null
          lane_rejections?: Json | null
          last_enriched_at?: string | null
          last_selected_as_survivor_at?: string | null
          liquidity_usd?: number | null
          market_cap?: number | null
          market_cap_bucket?: string | null
          metrics_detail?: Json | null
          minutes_since_last_trade?: number | null
          participation_detail?: Json | null
          participation_policy_version?: string | null
          participation_status?: string | null
          persistence_signal?: string | null
          previous_quantitative_priority?: number | null
          previous_seen_scan_at?: string | null
          previous_selected_as_survivor?: boolean
          previous_setups?: string[]
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_6h?: number | null
          price_integrity_detail?: Json | null
          price_integrity_policy_version?: string | null
          price_integrity_status?: string | null
          price_usd?: number | null
          priority_breakdown?: Json | null
          priority_components?: Json | null
          priority_delta?: number | null
          promoted_reason?: string | null
          quantitative_priority?: number | null
          quantitative_score?: number | null
          reacceleration_signal?: string | null
          recurrence_detail?: Json | null
          recurrence_state?: string
          refresh_domains?: Json | null
          refresh_state?: string
          rejection_details?: Json | null
          rejection_reason?: string | null
          scan_run_id?: string
          scanner_version?: string | null
          scans_seen_count?: number
          selected_by_global_ranking?: boolean
          selected_by_lane_reservation?: boolean
          sells_24h?: number | null
          setup_changed?: boolean
          stage_reached?: string
          structural_detail?: Json | null
          structural_policy_version?: string | null
          structural_safety?: string
          structural_status?: string | null
          token_age_minutes?: number | null
          token_id?: string
          token_security?: string
          trades_1h?: number | null
          trades_24h?: number | null
          trades_5m?: number | null
          universe_category?: string | null
          universe_eligibility?: string
          universe_reason?: string | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_5m?: number | null
          volume_6h?: number | null
          volume_to_liquidity_24h?: number | null
          volume_to_market_cap_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_candidates_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scan_candidates_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      scan_runs: {
        Row: {
          actionable_count: number
          base_volume_floor_diagnostics: Json | null
          bucket_diagnostics: Json | null
          calibration_mode: boolean
          completed_at: string | null
          config_snapshot: Json | null
          config_version: string | null
          created_at: string
          deep_researched: number
          discovery_config_version: string | null
          duration_ms: number | null
          enriched_count: number
          error_message: string | null
          id: string
          lane_diagnostics: Json | null
          market_regime: string
          notes: string | null
          participation_diagnostics: Json | null
          passed_ai_triage: number
          passed_hard_filters: number
          passed_quantitative_ranking: number
          price_integrity_diagnostics: Json | null
          provider_telemetry: Json | null
          quantitatively_ranked: number
          recurrence_diagnostics: Json | null
          refresh_diagnostics: Json | null
          scanner_version: string | null
          started_at: string
          status: string
          structural_diagnostics: Json | null
          survivor_limit: number | null
          tokens_discovered: number
          tokens_scanned: number
          universe_diagnostics: Json | null
        }
        Insert: {
          actionable_count?: number
          base_volume_floor_diagnostics?: Json | null
          bucket_diagnostics?: Json | null
          calibration_mode?: boolean
          completed_at?: string | null
          config_snapshot?: Json | null
          config_version?: string | null
          created_at?: string
          deep_researched?: number
          discovery_config_version?: string | null
          duration_ms?: number | null
          enriched_count?: number
          error_message?: string | null
          id?: string
          lane_diagnostics?: Json | null
          market_regime?: string
          notes?: string | null
          participation_diagnostics?: Json | null
          passed_ai_triage?: number
          passed_hard_filters?: number
          passed_quantitative_ranking?: number
          price_integrity_diagnostics?: Json | null
          provider_telemetry?: Json | null
          quantitatively_ranked?: number
          recurrence_diagnostics?: Json | null
          refresh_diagnostics?: Json | null
          scanner_version?: string | null
          started_at?: string
          status?: string
          structural_diagnostics?: Json | null
          survivor_limit?: number | null
          tokens_discovered?: number
          tokens_scanned?: number
          universe_diagnostics?: Json | null
        }
        Update: {
          actionable_count?: number
          base_volume_floor_diagnostics?: Json | null
          bucket_diagnostics?: Json | null
          calibration_mode?: boolean
          completed_at?: string | null
          config_snapshot?: Json | null
          config_version?: string | null
          created_at?: string
          deep_researched?: number
          discovery_config_version?: string | null
          duration_ms?: number | null
          enriched_count?: number
          error_message?: string | null
          id?: string
          lane_diagnostics?: Json | null
          market_regime?: string
          notes?: string | null
          participation_diagnostics?: Json | null
          passed_ai_triage?: number
          passed_hard_filters?: number
          passed_quantitative_ranking?: number
          price_integrity_diagnostics?: Json | null
          provider_telemetry?: Json | null
          quantitatively_ranked?: number
          recurrence_diagnostics?: Json | null
          refresh_diagnostics?: Json | null
          scanner_version?: string | null
          started_at?: string
          status?: string
          structural_diagnostics?: Json | null
          survivor_limit?: number | null
          tokens_discovered?: number
          tokens_scanned?: number
          universe_diagnostics?: Json | null
        }
        Relationships: []
      }
      scanner_labels: {
        Row: {
          created_at: string
          id: string
          label: string
          note: string | null
          scan_run_id: string | null
          token_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          scan_run_id?: string | null
          token_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          note?: string | null
          scan_run_id?: string | null
          token_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "scanner_labels_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scanner_labels_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      scanner_strategy_settings: {
        Row: {
          config: Json
          config_version: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          updated_at: string
        }
        Insert: {
          config: Json
          config_version: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          config?: Json
          config_version?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      structural_evaluations: {
        Row: {
          chain: string
          context: Json
          contract_address: string
          created_at: string
          evaluated_at: string
          evidence: Json | null
          id: string
          policy_version: string
          rules: Json
          scan_run_id: string | null
          status: string
          token_id: string | null
        }
        Insert: {
          chain?: string
          context?: Json
          contract_address: string
          created_at?: string
          evaluated_at?: string
          evidence?: Json | null
          id?: string
          policy_version: string
          rules?: Json
          scan_run_id?: string | null
          status: string
          token_id?: string | null
        }
        Update: {
          chain?: string
          context?: Json
          contract_address?: string
          created_at?: string
          evaluated_at?: string
          evidence?: Json | null
          id?: string
          policy_version?: string
          rules?: Json
          scan_run_id?: string | null
          status?: string
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "structural_evaluations_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "structural_evaluations_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_price_candles: {
        Row: {
          candle_time: string
          chain: string
          close_price: number | null
          contract_address: string
          created_at: string
          fetched_at: string
          high_price: number | null
          id: string
          interval: string
          low_price: number | null
          open_price: number | null
          pair_address: string | null
          provider_unix_time: number | null
          source: string
          source_reference: string | null
          volume_base: number | null
          volume_usd: number | null
        }
        Insert: {
          candle_time: string
          chain?: string
          close_price?: number | null
          contract_address: string
          created_at?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          interval: string
          low_price?: number | null
          open_price?: number | null
          pair_address?: string | null
          provider_unix_time?: number | null
          source?: string
          source_reference?: string | null
          volume_base?: number | null
          volume_usd?: number | null
        }
        Update: {
          candle_time?: string
          chain?: string
          close_price?: number | null
          contract_address?: string
          created_at?: string
          fetched_at?: string
          high_price?: number | null
          id?: string
          interval?: string
          low_price?: number | null
          open_price?: number | null
          pair_address?: string | null
          provider_unix_time?: number | null
          source?: string
          source_reference?: string | null
          volume_base?: number | null
          volume_usd?: number | null
        }
        Relationships: []
      }
      token_scanner_outcomes: {
        Row: {
          contract_address: string | null
          created_at: string
          current_market_cap_usd: number | null
          current_observed_at: string | null
          current_price_usd: number | null
          drawdown_peak_market_cap_since_call: number | null
          drawdown_peak_since_call_at: string | null
          drawdown_trough_market_cap_since_call: number | null
          drawdown_trough_since_call_at: string | null
          elapsed_minutes_since_first_call: number | null
          elapsed_minutes_since_first_seen: number | null
          first_call_at: string | null
          first_call_market_cap_usd: number | null
          first_call_price_usd: number | null
          first_call_scan_id: string | null
          first_seen_at: string | null
          first_seen_market_cap_usd: number | null
          first_seen_price_usd: number | null
          first_seen_scan_id: string | null
          horizons_since_first_call: Json | null
          horizons_since_first_seen: Json | null
          id: string
          last_evaluated_at: string | null
          market_cap_change_since_first_call_pct: number | null
          market_cap_change_since_first_seen_pct: number | null
          max_adverse_change_since_first_call_pct: number | null
          max_adverse_change_since_first_seen_pct: number | null
          max_adverse_market_cap_since_call: number | null
          max_adverse_since_call_at: string | null
          max_adverse_since_call_pct: number | null
          max_gain_since_first_call_pct: number | null
          max_gain_since_first_seen_pct: number | null
          max_market_cap_since_first_call: number | null
          max_market_cap_since_first_seen: number | null
          max_peak_to_trough_drawdown_since_call_pct: number | null
          max_peak_to_trough_drawdown_since_first_call_pct: number | null
          max_peak_to_trough_drawdown_since_first_seen_pct: number | null
          max_price_since_first_call: number | null
          max_price_since_first_seen: number | null
          min_market_cap_since_first_call: number | null
          min_market_cap_since_first_seen: number | null
          min_price_since_first_call: number | null
          min_price_since_first_seen: number | null
          observation_count: number
          outcome_version: string | null
          peak_market_cap_since_call_at: string | null
          peak_market_cap_since_call_pct: number | null
          peak_price_since_call_at: string | null
          peak_since_call_pct: number | null
          price_change_since_first_call_pct: number | null
          price_change_since_first_seen_pct: number | null
          token_id: string
          updated_at: string
        }
        Insert: {
          contract_address?: string | null
          created_at?: string
          current_market_cap_usd?: number | null
          current_observed_at?: string | null
          current_price_usd?: number | null
          drawdown_peak_market_cap_since_call?: number | null
          drawdown_peak_since_call_at?: string | null
          drawdown_trough_market_cap_since_call?: number | null
          drawdown_trough_since_call_at?: string | null
          elapsed_minutes_since_first_call?: number | null
          elapsed_minutes_since_first_seen?: number | null
          first_call_at?: string | null
          first_call_market_cap_usd?: number | null
          first_call_price_usd?: number | null
          first_call_scan_id?: string | null
          first_seen_at?: string | null
          first_seen_market_cap_usd?: number | null
          first_seen_price_usd?: number | null
          first_seen_scan_id?: string | null
          horizons_since_first_call?: Json | null
          horizons_since_first_seen?: Json | null
          id?: string
          last_evaluated_at?: string | null
          market_cap_change_since_first_call_pct?: number | null
          market_cap_change_since_first_seen_pct?: number | null
          max_adverse_change_since_first_call_pct?: number | null
          max_adverse_change_since_first_seen_pct?: number | null
          max_adverse_market_cap_since_call?: number | null
          max_adverse_since_call_at?: string | null
          max_adverse_since_call_pct?: number | null
          max_gain_since_first_call_pct?: number | null
          max_gain_since_first_seen_pct?: number | null
          max_market_cap_since_first_call?: number | null
          max_market_cap_since_first_seen?: number | null
          max_peak_to_trough_drawdown_since_call_pct?: number | null
          max_peak_to_trough_drawdown_since_first_call_pct?: number | null
          max_peak_to_trough_drawdown_since_first_seen_pct?: number | null
          max_price_since_first_call?: number | null
          max_price_since_first_seen?: number | null
          min_market_cap_since_first_call?: number | null
          min_market_cap_since_first_seen?: number | null
          min_price_since_first_call?: number | null
          min_price_since_first_seen?: number | null
          observation_count?: number
          outcome_version?: string | null
          peak_market_cap_since_call_at?: string | null
          peak_market_cap_since_call_pct?: number | null
          peak_price_since_call_at?: string | null
          peak_since_call_pct?: number | null
          price_change_since_first_call_pct?: number | null
          price_change_since_first_seen_pct?: number | null
          token_id: string
          updated_at?: string
        }
        Update: {
          contract_address?: string | null
          created_at?: string
          current_market_cap_usd?: number | null
          current_observed_at?: string | null
          current_price_usd?: number | null
          drawdown_peak_market_cap_since_call?: number | null
          drawdown_peak_since_call_at?: string | null
          drawdown_trough_market_cap_since_call?: number | null
          drawdown_trough_since_call_at?: string | null
          elapsed_minutes_since_first_call?: number | null
          elapsed_minutes_since_first_seen?: number | null
          first_call_at?: string | null
          first_call_market_cap_usd?: number | null
          first_call_price_usd?: number | null
          first_call_scan_id?: string | null
          first_seen_at?: string | null
          first_seen_market_cap_usd?: number | null
          first_seen_price_usd?: number | null
          first_seen_scan_id?: string | null
          horizons_since_first_call?: Json | null
          horizons_since_first_seen?: Json | null
          id?: string
          last_evaluated_at?: string | null
          market_cap_change_since_first_call_pct?: number | null
          market_cap_change_since_first_seen_pct?: number | null
          max_adverse_change_since_first_call_pct?: number | null
          max_adverse_change_since_first_seen_pct?: number | null
          max_adverse_market_cap_since_call?: number | null
          max_adverse_since_call_at?: string | null
          max_adverse_since_call_pct?: number | null
          max_gain_since_first_call_pct?: number | null
          max_gain_since_first_seen_pct?: number | null
          max_market_cap_since_first_call?: number | null
          max_market_cap_since_first_seen?: number | null
          max_peak_to_trough_drawdown_since_call_pct?: number | null
          max_peak_to_trough_drawdown_since_first_call_pct?: number | null
          max_peak_to_trough_drawdown_since_first_seen_pct?: number | null
          max_price_since_first_call?: number | null
          max_price_since_first_seen?: number | null
          min_market_cap_since_first_call?: number | null
          min_market_cap_since_first_seen?: number | null
          min_price_since_first_call?: number | null
          min_price_since_first_seen?: number | null
          observation_count?: number
          outcome_version?: string | null
          peak_market_cap_since_call_at?: string | null
          peak_market_cap_since_call_pct?: number | null
          peak_price_since_call_at?: string | null
          peak_since_call_pct?: number | null
          price_change_since_first_call_pct?: number | null
          price_change_since_first_seen_pct?: number | null
          token_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_scanner_outcomes_first_call_scan_id_fkey"
            columns: ["first_call_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_scanner_outcomes_first_seen_scan_id_fkey"
            columns: ["first_seen_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_scanner_outcomes_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: true
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      token_snapshots: {
        Row: {
          active_boost_count: number | null
          buys_1h: number | null
          buys_5m: number | null
          captured_at: string
          created_at: string
          data_source: string
          fdv: number | null
          has_active_boost: boolean | null
          has_paid_profile: boolean | null
          holder_count: number | null
          id: string
          ingestion_version: string | null
          liquidity_usd: number | null
          market_cap: number | null
          paid_boost_count: number | null
          price_change_1h: number | null
          price_change_24h: number | null
          price_change_5m: number | null
          price_change_6h: number | null
          price_usd: number | null
          sells_1h: number | null
          sells_5m: number | null
          source_dex_id: string | null
          source_pair_address: string | null
          source_pair_created_at: string | null
          token_id: string
          top_10_holder_pct: number | null
          top_20_holder_pct: number | null
          total_boost_amount: number | null
          unique_buyers_1h: number | null
          unique_sellers_1h: number | null
          volume_1h: number | null
          volume_24h: number | null
          volume_5m: number | null
          volume_6h: number | null
        }
        Insert: {
          active_boost_count?: number | null
          buys_1h?: number | null
          buys_5m?: number | null
          captured_at?: string
          created_at?: string
          data_source?: string
          fdv?: number | null
          has_active_boost?: boolean | null
          has_paid_profile?: boolean | null
          holder_count?: number | null
          id?: string
          ingestion_version?: string | null
          liquidity_usd?: number | null
          market_cap?: number | null
          paid_boost_count?: number | null
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_5m?: number | null
          price_change_6h?: number | null
          price_usd?: number | null
          sells_1h?: number | null
          sells_5m?: number | null
          source_dex_id?: string | null
          source_pair_address?: string | null
          source_pair_created_at?: string | null
          token_id: string
          top_10_holder_pct?: number | null
          top_20_holder_pct?: number | null
          total_boost_amount?: number | null
          unique_buyers_1h?: number | null
          unique_sellers_1h?: number | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_5m?: number | null
          volume_6h?: number | null
        }
        Update: {
          active_boost_count?: number | null
          buys_1h?: number | null
          buys_5m?: number | null
          captured_at?: string
          created_at?: string
          data_source?: string
          fdv?: number | null
          has_active_boost?: boolean | null
          has_paid_profile?: boolean | null
          holder_count?: number | null
          id?: string
          ingestion_version?: string | null
          liquidity_usd?: number | null
          market_cap?: number | null
          paid_boost_count?: number | null
          price_change_1h?: number | null
          price_change_24h?: number | null
          price_change_5m?: number | null
          price_change_6h?: number | null
          price_usd?: number | null
          sells_1h?: number | null
          sells_5m?: number | null
          source_dex_id?: string | null
          source_pair_address?: string | null
          source_pair_created_at?: string | null
          token_id?: string
          top_10_holder_pct?: number | null
          top_20_holder_pct?: number | null
          total_boost_amount?: number | null
          unique_buyers_1h?: number | null
          unique_sellers_1h?: number | null
          volume_1h?: number | null
          volume_24h?: number | null
          volume_5m?: number | null
          volume_6h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "token_snapshots_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      tokens: {
        Row: {
          chain: string
          contract_address: string
          created_at: string
          deployer_address: string | null
          description: string | null
          dex_pair_address: string | null
          id: string
          image_url: string | null
          inserted_at: string
          is_active: boolean
          last_ingested_at: string | null
          metadata_source: string | null
          migration_at: string | null
          name: string
          pair_created_at: string | null
          primary_dex_id: string | null
          primary_quote_token_address: string | null
          primary_quote_token_symbol: string | null
          symbol: string
          telegram_url: string | null
          token_created_at: string | null
          twitter_url: string | null
          updated_at: string
          website_url: string | null
        }
        Insert: {
          chain?: string
          contract_address: string
          created_at?: string
          deployer_address?: string | null
          description?: string | null
          dex_pair_address?: string | null
          id?: string
          image_url?: string | null
          inserted_at?: string
          is_active?: boolean
          last_ingested_at?: string | null
          metadata_source?: string | null
          migration_at?: string | null
          name: string
          pair_created_at?: string | null
          primary_dex_id?: string | null
          primary_quote_token_address?: string | null
          primary_quote_token_symbol?: string | null
          symbol: string
          telegram_url?: string | null
          token_created_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          chain?: string
          contract_address?: string
          created_at?: string
          deployer_address?: string | null
          description?: string | null
          dex_pair_address?: string | null
          id?: string
          image_url?: string | null
          inserted_at?: string
          is_active?: boolean
          last_ingested_at?: string | null
          metadata_source?: string | null
          migration_at?: string | null
          name?: string
          pair_created_at?: string | null
          primary_dex_id?: string | null
          primary_quote_token_address?: string | null
          primary_quote_token_symbol?: string | null
          symbol?: string
          telegram_url?: string | null
          token_created_at?: string | null
          twitter_url?: string | null
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      watchlist: {
        Row: {
          alerts_enabled: boolean
          created_at: string
          id: string
          notes: string | null
          token_id: string
        }
        Insert: {
          alerts_enabled?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          token_id: string
        }
        Update: {
          alerts_enabled?: boolean
          created_at?: string
          id?: string
          notes?: string | null
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watchlist_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
  public: {
    Enums: {},
  },
} as const
