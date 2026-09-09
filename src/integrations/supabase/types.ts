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
      ai_triage_decisions: {
        Row: {
          candidate_source: string | null
          confidence: string | null
          created_at: string
          decision: string
          id: string
          mint: string
          participation: string | null
          price_structure: string | null
          quant_priority: number | null
          quant_rank: number | null
          rank_delta: number | null
          rationale: string | null
          requested_research_domains: string[]
          research_packet_id: string | null
          research_packet_version: string | null
          setup: string | null
          strongest_concern: string | null
          strongest_positive: string | null
          token_id: string | null
          triage_rank: number | null
          triage_run_id: string
          unresolved_questions: string[]
        }
        Insert: {
          candidate_source?: string | null
          confidence?: string | null
          created_at?: string
          decision: string
          id?: string
          mint: string
          participation?: string | null
          price_structure?: string | null
          quant_priority?: number | null
          quant_rank?: number | null
          rank_delta?: number | null
          rationale?: string | null
          requested_research_domains?: string[]
          research_packet_id?: string | null
          research_packet_version?: string | null
          setup?: string | null
          strongest_concern?: string | null
          strongest_positive?: string | null
          token_id?: string | null
          triage_rank?: number | null
          triage_run_id: string
          unresolved_questions?: string[]
        }
        Update: {
          candidate_source?: string | null
          confidence?: string | null
          created_at?: string
          decision?: string
          id?: string
          mint?: string
          participation?: string | null
          price_structure?: string | null
          quant_priority?: number | null
          quant_rank?: number | null
          rank_delta?: number | null
          rationale?: string | null
          requested_research_domains?: string[]
          research_packet_id?: string | null
          research_packet_version?: string | null
          setup?: string | null
          strongest_concern?: string | null
          strongest_positive?: string | null
          token_id?: string | null
          triage_rank?: number | null
          triage_run_id?: string
          unresolved_questions?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "ai_triage_decisions_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_triage_decisions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_triage_decisions_triage_run_id_fkey"
            columns: ["triage_run_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_triage_runs: {
        Row: {
          blocked_count: number
          completed_at: string | null
          created_at: string
          deep_research_count: number
          diagnostics: Json | null
          error: string | null
          id: string
          is_calibration: boolean
          model_identifier: string | null
          model_provider: string | null
          packet_count: number
          prompt_version: string | null
          scanner_policy_version: string | null
          skip_count: number
          source_scan_id: string | null
          started_at: string
          status: string
          triage_policy_version: string
          watch_count: number
        }
        Insert: {
          blocked_count?: number
          completed_at?: string | null
          created_at?: string
          deep_research_count?: number
          diagnostics?: Json | null
          error?: string | null
          id?: string
          is_calibration?: boolean
          model_identifier?: string | null
          model_provider?: string | null
          packet_count?: number
          prompt_version?: string | null
          scanner_policy_version?: string | null
          skip_count?: number
          source_scan_id?: string | null
          started_at?: string
          status?: string
          triage_policy_version: string
          watch_count?: number
        }
        Update: {
          blocked_count?: number
          completed_at?: string | null
          created_at?: string
          deep_research_count?: number
          diagnostics?: Json | null
          error?: string | null
          id?: string
          is_calibration?: boolean
          model_identifier?: string | null
          model_provider?: string | null
          packet_count?: number
          prompt_version?: string | null
          scanner_policy_version?: string | null
          skip_count?: number
          source_scan_id?: string | null
          started_at?: string
          status?: string
          triage_policy_version?: string
          watch_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_triage_runs_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_experiment_results: {
        Row: {
          challenger_decision: string
          cohort_id: string | null
          created_at: string
          decided_at: string
          decision_at: string | null
          differing_rule: string | null
          differs: boolean
          event_key: string
          experiment_id: string
          failed_gates: string[]
          final_decision_difference: boolean | null
          frozen_input: Json
          id: string
          input_contract_version: string
          masked_by_other_gates: boolean | null
          masking_gate_list: string[] | null
          mint: string
          production_decision: string
          source_stage: string
          treatment_exposure: string | null
          updated_at: string
          variant_key: string
        }
        Insert: {
          challenger_decision: string
          cohort_id?: string | null
          created_at?: string
          decided_at?: string
          decision_at?: string | null
          differing_rule?: string | null
          differs?: boolean
          event_key: string
          experiment_id: string
          failed_gates?: string[]
          final_decision_difference?: boolean | null
          frozen_input?: Json
          id?: string
          input_contract_version?: string
          masked_by_other_gates?: boolean | null
          masking_gate_list?: string[] | null
          mint: string
          production_decision: string
          source_stage: string
          treatment_exposure?: string | null
          updated_at?: string
          variant_key: string
        }
        Update: {
          challenger_decision?: string
          cohort_id?: string | null
          created_at?: string
          decided_at?: string
          decision_at?: string | null
          differing_rule?: string | null
          differs?: boolean
          event_key?: string
          experiment_id?: string
          failed_gates?: string[]
          final_decision_difference?: boolean | null
          frozen_input?: Json
          id?: string
          input_contract_version?: string
          masked_by_other_gates?: boolean | null
          masking_gate_list?: string[] | null
          mint?: string
          production_decision?: string
          source_stage?: string
          treatment_exposure?: string | null
          updated_at?: string
          variant_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "calibration_experiment_results_experiment_id_fkey"
            columns: ["experiment_id"]
            isOneToOne: false
            referencedRelation: "calibration_experiments"
            referencedColumns: ["id"]
          },
        ]
      }
      calibration_experiments: {
        Row: {
          challenger_variants: Json
          control_policy: Json
          created_at: string
          evaluation_horizons: string[]
          experiment_type: string
          experiment_version: string
          hypothesis: string
          id: string
          last_evaluated_at: string | null
          name: string
          population_definition: Json
          population_semantics: string
          predeclared: boolean
          promotion_state: string
          shadow_start_at: string | null
          source_policy_filters: Json
          source_stage: string
          status: string
          updated_at: string
        }
        Insert: {
          challenger_variants?: Json
          control_policy?: Json
          created_at?: string
          evaluation_horizons?: string[]
          experiment_type: string
          experiment_version?: string
          hypothesis: string
          id?: string
          last_evaluated_at?: string | null
          name: string
          population_definition?: Json
          population_semantics?: string
          predeclared?: boolean
          promotion_state?: string
          shadow_start_at?: string | null
          source_policy_filters?: Json
          source_stage: string
          status?: string
          updated_at?: string
        }
        Update: {
          challenger_variants?: Json
          control_policy?: Json
          created_at?: string
          evaluation_horizons?: string[]
          experiment_type?: string
          experiment_version?: string
          hypothesis?: string
          id?: string
          last_evaluated_at?: string | null
          name?: string
          population_definition?: Json
          population_semantics?: string
          predeclared?: boolean
          promotion_state?: string
          shadow_start_at?: string | null
          source_policy_filters?: Json
          source_stage?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      deep_research_claims: {
        Row: {
          claim: string
          claim_type: string
          confidence: string
          contradicting_source_refs: string[]
          created_at: string
          deep_research_run_id: string
          domain: string
          id: string
          observed_at: string | null
          provenance: string
          published_at: string | null
          report_id: string | null
          status: string
          supporting_source_refs: string[]
        }
        Insert: {
          claim: string
          claim_type: string
          confidence: string
          contradicting_source_refs?: string[]
          created_at?: string
          deep_research_run_id: string
          domain: string
          id?: string
          observed_at?: string | null
          provenance?: string
          published_at?: string | null
          report_id?: string | null
          status: string
          supporting_source_refs?: string[]
        }
        Update: {
          claim?: string
          claim_type?: string
          confidence?: string
          contradicting_source_refs?: string[]
          created_at?: string
          deep_research_run_id?: string
          domain?: string
          id?: string
          observed_at?: string | null
          provenance?: string
          published_at?: string | null
          report_id?: string | null
          status?: string
          supporting_source_refs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "deep_research_claims_deep_research_run_id_fkey"
            columns: ["deep_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_claims_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "deep_research_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_research_reports: {
        Row: {
          chain: string
          community_source_count: number | null
          conflicting_claim_count: number
          corroborated_claim_count: number
          covered_domains: string[]
          created_at: string
          deep_research_run_id: string
          distinct_evidence_origins: number | null
          dossier: Json
          dossier_version: string
          evidence_coverage_pct: number | null
          evidence_semantics_version: string | null
          id: string
          identity_attribution_confidence: string
          independent_domains_covered: string[]
          independent_source_count: number
          is_calibration: boolean
          mint: string
          narrative_resolved: boolean
          on_chain_mirror_count: number | null
          one_sentence_narrative: string | null
          primary_source_count: number
          project_affiliated_source_count: number
          project_attribution_confidence: string | null
          project_claim_count: number
          project_owned_source_count: number
          research_policy_version: string
          search_failed_attempts: number | null
          search_health: string | null
          search_version: string | null
          source_count: number
          source_domain_diversity: number
          status: string
          token_id: string | null
          token_identity_confidence: string | null
          unknown_independence_source_count: number
          unresolved_domains: string[]
          unresolved_gap_count: number
        }
        Insert: {
          chain?: string
          community_source_count?: number | null
          conflicting_claim_count?: number
          corroborated_claim_count?: number
          covered_domains?: string[]
          created_at?: string
          deep_research_run_id: string
          distinct_evidence_origins?: number | null
          dossier: Json
          dossier_version: string
          evidence_coverage_pct?: number | null
          evidence_semantics_version?: string | null
          id?: string
          identity_attribution_confidence?: string
          independent_domains_covered?: string[]
          independent_source_count?: number
          is_calibration?: boolean
          mint: string
          narrative_resolved?: boolean
          on_chain_mirror_count?: number | null
          one_sentence_narrative?: string | null
          primary_source_count?: number
          project_affiliated_source_count?: number
          project_attribution_confidence?: string | null
          project_claim_count?: number
          project_owned_source_count?: number
          research_policy_version: string
          search_failed_attempts?: number | null
          search_health?: string | null
          search_version?: string | null
          source_count?: number
          source_domain_diversity?: number
          status: string
          token_id?: string | null
          token_identity_confidence?: string | null
          unknown_independence_source_count?: number
          unresolved_domains?: string[]
          unresolved_gap_count?: number
        }
        Update: {
          chain?: string
          community_source_count?: number | null
          conflicting_claim_count?: number
          corroborated_claim_count?: number
          covered_domains?: string[]
          created_at?: string
          deep_research_run_id?: string
          distinct_evidence_origins?: number | null
          dossier?: Json
          dossier_version?: string
          evidence_coverage_pct?: number | null
          evidence_semantics_version?: string | null
          id?: string
          identity_attribution_confidence?: string
          independent_domains_covered?: string[]
          independent_source_count?: number
          is_calibration?: boolean
          mint?: string
          narrative_resolved?: boolean
          on_chain_mirror_count?: number | null
          one_sentence_narrative?: string | null
          primary_source_count?: number
          project_affiliated_source_count?: number
          project_attribution_confidence?: string | null
          project_claim_count?: number
          project_owned_source_count?: number
          research_policy_version?: string
          search_failed_attempts?: number | null
          search_health?: string | null
          search_version?: string | null
          source_count?: number
          source_domain_diversity?: number
          status?: string
          token_id?: string | null
          token_identity_confidence?: string | null
          unknown_independence_source_count?: number
          unresolved_domains?: string[]
          unresolved_gap_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "deep_research_reports_deep_research_run_id_fkey"
            columns: ["deep_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_reports_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_research_runs: {
        Row: {
          budget: Json | null
          chain: string
          completed_at: string | null
          created_at: string
          diagnostics: Json | null
          duration_ms: number | null
          eligibility_after: Json | null
          eligibility_before: Json | null
          error: string | null
          fetched_source_count: number
          id: string
          is_calibration: boolean
          mint: string
          model_identifier: string | null
          model_pass_count: number
          model_provider: string | null
          prompt_version: string
          query_count: number
          research_packet_id: string | null
          research_packet_version: string | null
          research_policy_version: string
          shortlist_milestone_id: string | null
          started_at: string
          status: string
          stop_reason: string | null
          token_id: string | null
          triage_decision_id: string | null
          triage_run_id: string | null
        }
        Insert: {
          budget?: Json | null
          chain?: string
          completed_at?: string | null
          created_at?: string
          diagnostics?: Json | null
          duration_ms?: number | null
          eligibility_after?: Json | null
          eligibility_before?: Json | null
          error?: string | null
          fetched_source_count?: number
          id?: string
          is_calibration?: boolean
          mint: string
          model_identifier?: string | null
          model_pass_count?: number
          model_provider?: string | null
          prompt_version: string
          query_count?: number
          research_packet_id?: string | null
          research_packet_version?: string | null
          research_policy_version: string
          shortlist_milestone_id?: string | null
          started_at?: string
          status: string
          stop_reason?: string | null
          token_id?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
        }
        Update: {
          budget?: Json | null
          chain?: string
          completed_at?: string | null
          created_at?: string
          diagnostics?: Json | null
          duration_ms?: number | null
          eligibility_after?: Json | null
          eligibility_before?: Json | null
          error?: string | null
          fetched_source_count?: number
          id?: string
          is_calibration?: boolean
          mint?: string
          model_identifier?: string | null
          model_pass_count?: number
          model_provider?: string | null
          prompt_version?: string
          query_count?: number
          research_packet_id?: string | null
          research_packet_version?: string | null
          research_policy_version?: string
          shortlist_milestone_id?: string | null
          started_at?: string
          status?: string
          stop_reason?: string | null
          token_id?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_research_runs_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_runs_shortlist_milestone_id_fkey"
            columns: ["shortlist_milestone_id"]
            isOneToOne: false
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_runs_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_runs_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_runs_triage_run_id_fkey"
            columns: ["triage_run_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      deep_research_sources: {
        Row: {
          account: string | null
          attribution_confidence: string
          content_fetched: boolean
          created_at: string
          deep_research_run_id: string
          evidence_origin: string | null
          excerpt: string | null
          fetched_at: string
          id: string
          independence: string
          mint_verified: boolean
          on_chain_mirror: boolean | null
          published_at: string | null
          query: string | null
          relevance: string | null
          reliability_class: string
          report_id: string | null
          source_ref: string
          source_type: string
          title: string | null
          url: string | null
        }
        Insert: {
          account?: string | null
          attribution_confidence?: string
          content_fetched?: boolean
          created_at?: string
          deep_research_run_id: string
          evidence_origin?: string | null
          excerpt?: string | null
          fetched_at: string
          id?: string
          independence?: string
          mint_verified?: boolean
          on_chain_mirror?: boolean | null
          published_at?: string | null
          query?: string | null
          relevance?: string | null
          reliability_class: string
          report_id?: string | null
          source_ref: string
          source_type: string
          title?: string | null
          url?: string | null
        }
        Update: {
          account?: string | null
          attribution_confidence?: string
          content_fetched?: boolean
          created_at?: string
          deep_research_run_id?: string
          evidence_origin?: string | null
          excerpt?: string | null
          fetched_at?: string
          id?: string
          independence?: string
          mint_verified?: boolean
          on_chain_mirror?: boolean | null
          published_at?: string | null
          query?: string | null
          relevance?: string | null
          reliability_class?: string
          report_id?: string | null
          source_ref?: string
          source_type?: string
          title?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deep_research_sources_deep_research_run_id_fkey"
            columns: ["deep_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deep_research_sources_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "deep_research_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      entry_state_evaluations: {
        Row: {
          chain: string
          component_scores: Json | null
          created_at: string
          current_eligibility: Json | null
          deep_research_report_id: string | null
          diagnostics: Json | null
          divergence_detail: Json | null
          entry_policy_version: string
          entry_score: number | null
          evaluated_at: string
          evidence_confidence: number | null
          evidence_gaps: string[]
          feature_version: string
          id: string
          is_calibration: boolean
          liquidity_usd: number | null
          market_cap: number | null
          market_evidence_at: string | null
          market_snapshot_id: string | null
          mint: string
          name: string | null
          narrative_timing_confidence: string | null
          previous_state: string | null
          price_attention_divergence: string
          price_history_source: string | null
          price_usd: number | null
          rationale: string | null
          research_packet_id: string | null
          research_packet_version: string | null
          score_extension: number | null
          score_risk_definition: number | null
          score_structure: number | null
          score_volume_flow: number | null
          setups: string[]
          source_scan_id: string | null
          state: string
          state_changed_at: string | null
          strongest_entry_risk: string | null
          strongest_positive_signal: string | null
          symbol: string | null
          thesis_report_id: string | null
          thesis_score: number | null
          thesis_verdict: string | null
          timing_features: Json | null
          timing_resolution: string | null
          token_id: string | null
          what_would_break_entry: string[]
          what_would_improve_entry: string[]
        }
        Insert: {
          chain?: string
          component_scores?: Json | null
          created_at?: string
          current_eligibility?: Json | null
          deep_research_report_id?: string | null
          diagnostics?: Json | null
          divergence_detail?: Json | null
          entry_policy_version: string
          entry_score?: number | null
          evaluated_at?: string
          evidence_confidence?: number | null
          evidence_gaps?: string[]
          feature_version: string
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_cap?: number | null
          market_evidence_at?: string | null
          market_snapshot_id?: string | null
          mint: string
          name?: string | null
          narrative_timing_confidence?: string | null
          previous_state?: string | null
          price_attention_divergence?: string
          price_history_source?: string | null
          price_usd?: number | null
          rationale?: string | null
          research_packet_id?: string | null
          research_packet_version?: string | null
          score_extension?: number | null
          score_risk_definition?: number | null
          score_structure?: number | null
          score_volume_flow?: number | null
          setups?: string[]
          source_scan_id?: string | null
          state: string
          state_changed_at?: string | null
          strongest_entry_risk?: string | null
          strongest_positive_signal?: string | null
          symbol?: string | null
          thesis_report_id?: string | null
          thesis_score?: number | null
          thesis_verdict?: string | null
          timing_features?: Json | null
          timing_resolution?: string | null
          token_id?: string | null
          what_would_break_entry?: string[]
          what_would_improve_entry?: string[]
        }
        Update: {
          chain?: string
          component_scores?: Json | null
          created_at?: string
          current_eligibility?: Json | null
          deep_research_report_id?: string | null
          diagnostics?: Json | null
          divergence_detail?: Json | null
          entry_policy_version?: string
          entry_score?: number | null
          evaluated_at?: string
          evidence_confidence?: number | null
          evidence_gaps?: string[]
          feature_version?: string
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_cap?: number | null
          market_evidence_at?: string | null
          market_snapshot_id?: string | null
          mint?: string
          name?: string | null
          narrative_timing_confidence?: string | null
          previous_state?: string | null
          price_attention_divergence?: string
          price_history_source?: string | null
          price_usd?: number | null
          rationale?: string | null
          research_packet_id?: string | null
          research_packet_version?: string | null
          score_extension?: number | null
          score_risk_definition?: number | null
          score_structure?: number | null
          score_volume_flow?: number | null
          setups?: string[]
          source_scan_id?: string | null
          state?: string
          state_changed_at?: string | null
          strongest_entry_risk?: string | null
          strongest_positive_signal?: string | null
          symbol?: string | null
          thesis_report_id?: string | null
          thesis_score?: number | null
          thesis_verdict?: string | null
          timing_features?: Json | null
          timing_resolution?: string | null
          token_id?: string | null
          what_would_break_entry?: string[]
          what_would_improve_entry?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "entry_state_evaluations_deep_research_report_id_fkey"
            columns: ["deep_research_report_id"]
            isOneToOne: false
            referencedRelation: "deep_research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_state_evaluations_market_snapshot_id_fkey"
            columns: ["market_snapshot_id"]
            isOneToOne: false
            referencedRelation: "token_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_state_evaluations_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_state_evaluations_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_state_evaluations_thesis_report_id_fkey"
            columns: ["thesis_report_id"]
            isOneToOne: false
            referencedRelation: "thesis_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entry_state_evaluations_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence_observations: {
        Row: {
          affiliation: string | null
          attribution_status: string
          captured_at: string
          collection_health: string | null
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
          token_id: string | null
          unit: string | null
          value_json: Json | null
        }
        Insert: {
          affiliation?: string | null
          attribution_status?: string
          captured_at: string
          collection_health?: string | null
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
          token_id?: string | null
          unit?: string | null
          value_json?: Json | null
        }
        Update: {
          affiliation?: string | null
          attribution_status?: string
          captured_at?: string
          collection_health?: string | null
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
          token_id?: string | null
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
      live_call_events: {
        Row: {
          created_at: string
          entry_evaluated_at: string | null
          entry_evaluation_id: string | null
          entry_state: string | null
          episode_number: number | null
          event_type: string
          id: string
          liquidity_at_event: number | null
          market_cap_at_event: number | null
          market_observed_at: string | null
          mint: string
          monitoring_status: string | null
          occurred_at: string
          policy_version: string
          price_history_source: string | null
          price_usd_at_event: number | null
          reason: string | null
          reason_code: string | null
          thesis_call_milestone_id: string
          thesis_report_id: string | null
          timing_resolution: string | null
          token_id: string | null
        }
        Insert: {
          created_at?: string
          entry_evaluated_at?: string | null
          entry_evaluation_id?: string | null
          entry_state?: string | null
          episode_number?: number | null
          event_type: string
          id?: string
          liquidity_at_event?: number | null
          market_cap_at_event?: number | null
          market_observed_at?: string | null
          mint: string
          monitoring_status?: string | null
          occurred_at?: string
          policy_version?: string
          price_history_source?: string | null
          price_usd_at_event?: number | null
          reason?: string | null
          reason_code?: string | null
          thesis_call_milestone_id: string
          thesis_report_id?: string | null
          timing_resolution?: string | null
          token_id?: string | null
        }
        Update: {
          created_at?: string
          entry_evaluated_at?: string | null
          entry_evaluation_id?: string | null
          entry_state?: string | null
          episode_number?: number | null
          event_type?: string
          id?: string
          liquidity_at_event?: number | null
          market_cap_at_event?: number | null
          market_observed_at?: string | null
          mint?: string
          monitoring_status?: string | null
          occurred_at?: string
          policy_version?: string
          price_history_source?: string | null
          price_usd_at_event?: number | null
          reason?: string | null
          reason_code?: string | null
          thesis_call_milestone_id?: string
          thesis_report_id?: string | null
          timing_resolution?: string | null
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "live_call_events_entry_evaluation_id_fkey"
            columns: ["entry_evaluation_id"]
            isOneToOne: false
            referencedRelation: "entry_state_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_call_events_thesis_call_milestone_id_fkey"
            columns: ["thesis_call_milestone_id"]
            isOneToOne: false
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_call_events_thesis_report_id_fkey"
            columns: ["thesis_report_id"]
            isOneToOne: false
            referencedRelation: "thesis_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "live_call_events_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      market_observation_attempts: {
        Row: {
          batch_id: string
          batch_index: number
          completed_at: string | null
          contract_addresses: string[]
          created_at: string
          error_code: string | null
          id: string
          observation_count: number
          provider: string
          requested_at: string
          retry_after_seconds: number | null
          run_id: string | null
          success: boolean
        }
        Insert: {
          batch_id: string
          batch_index?: number
          completed_at?: string | null
          contract_addresses?: string[]
          created_at?: string
          error_code?: string | null
          id?: string
          observation_count?: number
          provider?: string
          requested_at?: string
          retry_after_seconds?: number | null
          run_id?: string | null
          success?: boolean
        }
        Update: {
          batch_id?: string
          batch_index?: number
          completed_at?: string | null
          contract_addresses?: string[]
          created_at?: string
          error_code?: string | null
          id?: string
          observation_count?: number
          provider?: string
          requested_at?: string
          retry_after_seconds?: number | null
          run_id?: string | null
          success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "market_observation_attempts_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "outcome_sampler_runs"
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
      outcome_enrollment_strata: {
        Row: {
          created_at: string
          eligible_population_n: number
          id: string
          inclusion_probability: number
          sampling_policy_version: string
          scan_run_id: string
          seed_material: string
          selected_at: string
          selected_k: number
          stratum: string
        }
        Insert: {
          created_at?: string
          eligible_population_n: number
          id?: string
          inclusion_probability: number
          sampling_policy_version: string
          scan_run_id: string
          seed_material: string
          selected_at?: string
          selected_k: number
          stratum: string
        }
        Update: {
          created_at?: string
          eligible_population_n?: number
          id?: string
          inclusion_probability?: number
          sampling_policy_version?: string
          scan_run_id?: string
          seed_material?: string
          selected_at?: string
          selected_k?: number
          stratum?: string
        }
        Relationships: []
      }
      outcome_enrollments: {
        Row: {
          baseline_at: string | null
          baseline_liquidity_usd: number | null
          baseline_market_cap_usd: number | null
          baseline_price_usd: number | null
          baseline_validity: string
          chain: string
          cohort_ref: string | null
          contract_address: string
          created_at: string
          decision_at: string | null
          decision_class: string | null
          eligible_population_n: number | null
          enrollment_type: string
          funnel_stage: string
          id: string
          inclusion_probability: number | null
          lane_rejections: Json | null
          notes: string | null
          outcome_horizons: string[]
          production_cycle_run_id: string | null
          rejection_details: Json | null
          rejection_reason: string | null
          sampled_for_outcomes: boolean
          sampling_policy_version: string | null
          sampling_stratum: string | null
          scan_run_id: string | null
          scanner_policy_version: string | null
          schema_version: string
          selected_at: string | null
          selected_k: number | null
          selection_reason: string | null
          selection_seed: string | null
          source_event_id: string | null
          source_event_type: string | null
          stage_reached: string | null
          token_id: string | null
          tracking_status: string
          triage_run_id: string | null
        }
        Insert: {
          baseline_at?: string | null
          baseline_liquidity_usd?: number | null
          baseline_market_cap_usd?: number | null
          baseline_price_usd?: number | null
          baseline_validity?: string
          chain?: string
          cohort_ref?: string | null
          contract_address: string
          created_at?: string
          decision_at?: string | null
          decision_class?: string | null
          eligible_population_n?: number | null
          enrollment_type: string
          funnel_stage: string
          id?: string
          inclusion_probability?: number | null
          lane_rejections?: Json | null
          notes?: string | null
          outcome_horizons?: string[]
          production_cycle_run_id?: string | null
          rejection_details?: Json | null
          rejection_reason?: string | null
          sampled_for_outcomes?: boolean
          sampling_policy_version?: string | null
          sampling_stratum?: string | null
          scan_run_id?: string | null
          scanner_policy_version?: string | null
          schema_version?: string
          selected_at?: string | null
          selected_k?: number | null
          selection_reason?: string | null
          selection_seed?: string | null
          source_event_id?: string | null
          source_event_type?: string | null
          stage_reached?: string | null
          token_id?: string | null
          tracking_status?: string
          triage_run_id?: string | null
        }
        Update: {
          baseline_at?: string | null
          baseline_liquidity_usd?: number | null
          baseline_market_cap_usd?: number | null
          baseline_price_usd?: number | null
          baseline_validity?: string
          chain?: string
          cohort_ref?: string | null
          contract_address?: string
          created_at?: string
          decision_at?: string | null
          decision_class?: string | null
          eligible_population_n?: number | null
          enrollment_type?: string
          funnel_stage?: string
          id?: string
          inclusion_probability?: number | null
          lane_rejections?: Json | null
          notes?: string | null
          outcome_horizons?: string[]
          production_cycle_run_id?: string | null
          rejection_details?: Json | null
          rejection_reason?: string | null
          sampled_for_outcomes?: boolean
          sampling_policy_version?: string | null
          sampling_stratum?: string | null
          scan_run_id?: string | null
          scanner_policy_version?: string | null
          schema_version?: string
          selected_at?: string | null
          selected_k?: number | null
          selection_reason?: string | null
          selection_seed?: string | null
          source_event_id?: string | null
          source_event_type?: string | null
          stage_reached?: string | null
          token_id?: string | null
          tracking_status?: string
          triage_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outcome_enrollments_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      outcome_sampler_runs: {
        Row: {
          batches_sent: number
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          lease_expires_at: string
          mints_delayed: number
          mints_due: number
          mints_refreshed: number
          mints_tracked: number
          observations_persisted: number
          oldest_stale_observation_at: string | null
          provider_error_count: number
          rate_limited_count: number
          sampler_version: string
          started_at: string
          status: string
          trigger_source: string
          window_key: string
        }
        Insert: {
          batches_sent?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string
          mints_delayed?: number
          mints_due?: number
          mints_refreshed?: number
          mints_tracked?: number
          observations_persisted?: number
          oldest_stale_observation_at?: string | null
          provider_error_count?: number
          rate_limited_count?: number
          sampler_version?: string
          started_at?: string
          status?: string
          trigger_source?: string
          window_key: string
        }
        Update: {
          batches_sent?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          lease_expires_at?: string
          mints_delayed?: number
          mints_due?: number
          mints_refreshed?: number
          mints_tracked?: number
          observations_persisted?: number
          oldest_stale_observation_at?: string | null
          provider_error_count?: number
          rate_limited_count?: number
          sampler_version?: string
          started_at?: string
          status?: string
          trigger_source?: string
          window_key?: string
        }
        Relationships: []
      }
      outcome_tracking: {
        Row: {
          baseline_event_count: number
          chain: string
          consecutive_failures: number
          contract_address: string
          coverage_status: string
          created_at: string
          earliest_baseline_at: string | null
          id: string
          last_attempt_at: string | null
          last_error_code: string | null
          last_observed_at: string | null
          last_retry_after_seconds: number | null
          last_run_id: string | null
          last_success_at: string | null
          latest_baseline_at: string | null
          next_eligible_at: string
          priority_requested_at: string | null
          provider_health: string
          token_id: string | null
          tracking_version: string
          updated_at: string
        }
        Insert: {
          baseline_event_count?: number
          chain?: string
          consecutive_failures?: number
          contract_address: string
          coverage_status?: string
          created_at?: string
          earliest_baseline_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_observed_at?: string | null
          last_retry_after_seconds?: number | null
          last_run_id?: string | null
          last_success_at?: string | null
          latest_baseline_at?: string | null
          next_eligible_at?: string
          priority_requested_at?: string | null
          provider_health?: string
          token_id?: string | null
          tracking_version?: string
          updated_at?: string
        }
        Update: {
          baseline_event_count?: number
          chain?: string
          consecutive_failures?: number
          contract_address?: string
          coverage_status?: string
          created_at?: string
          earliest_baseline_at?: string | null
          id?: string
          last_attempt_at?: string | null
          last_error_code?: string | null
          last_observed_at?: string | null
          last_retry_after_seconds?: number | null
          last_run_id?: string | null
          last_success_at?: string | null
          latest_baseline_at?: string | null
          next_eligible_at?: string
          priority_requested_at?: string | null
          provider_health?: string
          token_id?: string | null
          tracking_version?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "outcome_tracking_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      production_cycle_events: {
        Row: {
          created_at: string
          detail: Json
          event_type: string
          id: string
          occurred_at: string
          production_cycle_run_id: string
          reason: string | null
          scan_run_id: string | null
          stage: string | null
          worker_id: string | null
        }
        Insert: {
          created_at?: string
          detail?: Json
          event_type: string
          id?: string
          occurred_at?: string
          production_cycle_run_id: string
          reason?: string | null
          scan_run_id?: string | null
          stage?: string | null
          worker_id?: string | null
        }
        Update: {
          created_at?: string
          detail?: Json
          event_type?: string
          id?: string
          occurred_at?: string
          production_cycle_run_id?: string
          reason?: string | null
          scan_run_id?: string | null
          stage?: string | null
          worker_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "production_cycle_events_production_cycle_run_id_fkey"
            columns: ["production_cycle_run_id"]
            isOneToOne: false
            referencedRelation: "production_cycle_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      production_cycle_runs: {
        Row: {
          accepted_at: string | null
          claim_acquired_at: string | null
          completed_at: string | null
          completion_code: string | null
          created_at: string
          deep_research_blocked: number
          deep_research_deferred: number
          deep_research_executed: number
          deep_research_failed: number
          diagnostics: Json
          entry_eligible_count: number
          entry_evaluated_count: number
          failure_reason: string | null
          failure_stage: string | null
          id: string
          last_progress_at: string | null
          last_tick_at: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          orchestrator_version: string
          packet_count: number
          recovery_reason: string | null
          recovery_state: string | null
          requested_at: string
          scan_run_id: string | null
          scanner_policy_version: string | null
          stage: string
          started_at: string
          status: string
          thesis_call_count: number
          thesis_failed_count: number
          thesis_synthesized_count: number
          triage_deep_count: number
          triage_run_id: string | null
          triage_skip_count: number
          triage_watch_count: number
          trigger: string
          updated_at: string
          worker_error: string | null
          worker_heartbeat_at: string | null
          worker_status: string
        }
        Insert: {
          accepted_at?: string | null
          claim_acquired_at?: string | null
          completed_at?: string | null
          completion_code?: string | null
          created_at?: string
          deep_research_blocked?: number
          deep_research_deferred?: number
          deep_research_executed?: number
          deep_research_failed?: number
          diagnostics?: Json
          entry_eligible_count?: number
          entry_evaluated_count?: number
          failure_reason?: string | null
          failure_stage?: string | null
          id?: string
          last_progress_at?: string | null
          last_tick_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          orchestrator_version?: string
          packet_count?: number
          recovery_reason?: string | null
          recovery_state?: string | null
          requested_at?: string
          scan_run_id?: string | null
          scanner_policy_version?: string | null
          stage?: string
          started_at?: string
          status?: string
          thesis_call_count?: number
          thesis_failed_count?: number
          thesis_synthesized_count?: number
          triage_deep_count?: number
          triage_run_id?: string | null
          triage_skip_count?: number
          triage_watch_count?: number
          trigger?: string
          updated_at?: string
          worker_error?: string | null
          worker_heartbeat_at?: string | null
          worker_status?: string
        }
        Update: {
          accepted_at?: string | null
          claim_acquired_at?: string | null
          completed_at?: string | null
          completion_code?: string | null
          created_at?: string
          deep_research_blocked?: number
          deep_research_deferred?: number
          deep_research_executed?: number
          deep_research_failed?: number
          diagnostics?: Json
          entry_eligible_count?: number
          entry_evaluated_count?: number
          failure_reason?: string | null
          failure_stage?: string | null
          id?: string
          last_progress_at?: string | null
          last_tick_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          orchestrator_version?: string
          packet_count?: number
          recovery_reason?: string | null
          recovery_state?: string | null
          requested_at?: string
          scan_run_id?: string | null
          scanner_policy_version?: string | null
          stage?: string
          started_at?: string
          status?: string
          thesis_call_count?: number
          thesis_failed_count?: number
          thesis_synthesized_count?: number
          triage_deep_count?: number
          triage_run_id?: string | null
          triage_skip_count?: number
          triage_watch_count?: number
          trigger?: string
          updated_at?: string
          worker_error?: string | null
          worker_heartbeat_at?: string | null
          worker_status?: string
        }
        Relationships: []
      }
      production_cycle_scheduler_credentials: {
        Row: {
          id: boolean
          rotated_at: string
          token_hash: string
          token_value: string
        }
        Insert: {
          id?: boolean
          rotated_at?: string
          token_hash: string
          token_value: string
        }
        Update: {
          id?: boolean
          rotated_at?: string
          token_hash?: string
          token_value?: string
        }
        Relationships: []
      }
      research_packets: {
        Row: {
          candidate_source: string
          chain: string
          compact: Json
          compact_bytes: number | null
          contract_address: string | null
          created_at: string
          evidence_gaps: string[]
          exclusion_reasons: string[]
          generated_at: string
          id: string
          packet: Json
          packet_version: string
          research_eligible_now: boolean
          scan_run_id: string | null
          serialization_version: string
          token_id: string
        }
        Insert: {
          candidate_source: string
          chain?: string
          compact: Json
          compact_bytes?: number | null
          contract_address?: string | null
          created_at?: string
          evidence_gaps?: string[]
          exclusion_reasons?: string[]
          generated_at?: string
          id?: string
          packet: Json
          packet_version: string
          research_eligible_now: boolean
          scan_run_id?: string | null
          serialization_version: string
          token_id: string
        }
        Update: {
          candidate_source?: string
          chain?: string
          compact?: Json
          compact_bytes?: number | null
          contract_address?: string | null
          created_at?: string
          evidence_gaps?: string[]
          exclusion_reasons?: string[]
          generated_at?: string
          id?: string
          packet?: Json
          packet_version?: string
          research_eligible_now?: boolean
          scan_run_id?: string | null
          serialization_version?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_packets_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_packets_token_id_fkey"
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
      research_spend_decisions: {
        Row: {
          budget_scan_limit: number | null
          budget_scan_used: number | null
          budget_state: string | null
          budget_window_limit: number | null
          budget_window_used: number | null
          chain: string
          cooldown_minutes: number | null
          cooldown_remaining_minutes: number | null
          created_at: string
          deep_research_run_id: string | null
          diagnostics: Json | null
          executed: boolean
          id: string
          is_calibration: boolean
          material_change_override: boolean
          material_change_reason_codes: string[]
          mint: string
          next_eligible_at: string | null
          policy_version: string
          prior_research_age_minutes: number | null
          prior_research_at: string | null
          prior_research_report_id: string | null
          prior_research_run_id: string | null
          prior_research_status: string | null
          prior_research_version: string | null
          prior_scan_run_id: string | null
          prior_search_health: string | null
          prior_triage_run_id: string | null
          quant_rank: number | null
          recurrence_number: number | null
          recurrence_state: string | null
          research_packet_id: string | null
          scan_run_id: string | null
          spend_decision: string
          spend_decision_reason: string
          token_id: string | null
          tradability_checked_at: string | null
          tradability_liquidity_usd: number | null
          tradability_market_source: string | null
          tradability_pair_address: string | null
          tradability_reason_code: string | null
          tradability_result: string | null
          triage_decision_id: string | null
          triage_rank: number | null
          triage_run_id: string
          updated_at: string
        }
        Insert: {
          budget_scan_limit?: number | null
          budget_scan_used?: number | null
          budget_state?: string | null
          budget_window_limit?: number | null
          budget_window_used?: number | null
          chain?: string
          cooldown_minutes?: number | null
          cooldown_remaining_minutes?: number | null
          created_at?: string
          deep_research_run_id?: string | null
          diagnostics?: Json | null
          executed?: boolean
          id?: string
          is_calibration?: boolean
          material_change_override?: boolean
          material_change_reason_codes?: string[]
          mint: string
          next_eligible_at?: string | null
          policy_version: string
          prior_research_age_minutes?: number | null
          prior_research_at?: string | null
          prior_research_report_id?: string | null
          prior_research_run_id?: string | null
          prior_research_status?: string | null
          prior_research_version?: string | null
          prior_scan_run_id?: string | null
          prior_search_health?: string | null
          prior_triage_run_id?: string | null
          quant_rank?: number | null
          recurrence_number?: number | null
          recurrence_state?: string | null
          research_packet_id?: string | null
          scan_run_id?: string | null
          spend_decision: string
          spend_decision_reason: string
          token_id?: string | null
          tradability_checked_at?: string | null
          tradability_liquidity_usd?: number | null
          tradability_market_source?: string | null
          tradability_pair_address?: string | null
          tradability_reason_code?: string | null
          tradability_result?: string | null
          triage_decision_id?: string | null
          triage_rank?: number | null
          triage_run_id: string
          updated_at?: string
        }
        Update: {
          budget_scan_limit?: number | null
          budget_scan_used?: number | null
          budget_state?: string | null
          budget_window_limit?: number | null
          budget_window_used?: number | null
          chain?: string
          cooldown_minutes?: number | null
          cooldown_remaining_minutes?: number | null
          created_at?: string
          deep_research_run_id?: string | null
          diagnostics?: Json | null
          executed?: boolean
          id?: string
          is_calibration?: boolean
          material_change_override?: boolean
          material_change_reason_codes?: string[]
          mint?: string
          next_eligible_at?: string | null
          policy_version?: string
          prior_research_age_minutes?: number | null
          prior_research_at?: string | null
          prior_research_report_id?: string | null
          prior_research_run_id?: string | null
          prior_research_status?: string | null
          prior_research_version?: string | null
          prior_scan_run_id?: string | null
          prior_search_health?: string | null
          prior_triage_run_id?: string | null
          quant_rank?: number | null
          recurrence_number?: number | null
          recurrence_state?: string | null
          research_packet_id?: string | null
          scan_run_id?: string | null
          spend_decision?: string
          spend_decision_reason?: string
          token_id?: string | null
          tradability_checked_at?: string | null
          tradability_liquidity_usd?: number | null
          tradability_market_source?: string | null
          tradability_pair_address?: string | null
          tradability_reason_code?: string | null
          tradability_result?: string | null
          triage_decision_id?: string | null
          triage_rank?: number | null
          triage_run_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "research_spend_decisions_deep_research_run_id_fkey"
            columns: ["deep_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_prior_research_report_id_fkey"
            columns: ["prior_research_report_id"]
            isOneToOne: false
            referencedRelation: "deep_research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_prior_research_run_id_fkey"
            columns: ["prior_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_scan_run_id_fkey"
            columns: ["scan_run_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "research_spend_decisions_triage_run_id_fkey"
            columns: ["triage_run_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      research_tradability_checks: {
        Row: {
          chain: string
          checked_at: string
          created_at: string
          deep_research_executed: boolean
          deep_research_run_id: string | null
          detail: string | null
          dex_id: string | null
          id: string
          is_calibration: boolean
          liquidity_usd: number | null
          market_source: string
          min_liquidity_usd: number
          mint: string
          policy_version: string
          provider_error_code: string | null
          reason_code: string
          research_spend_decision_id: string | null
          resolved_pair_address: string | null
          result: string
          scan_run_id: string | null
          spend_decision: string | null
          token_id: string | null
          triage_decision: string | null
          triage_decision_id: string | null
          triage_run_id: string | null
        }
        Insert: {
          chain?: string
          checked_at?: string
          created_at?: string
          deep_research_executed?: boolean
          deep_research_run_id?: string | null
          detail?: string | null
          dex_id?: string | null
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_source: string
          min_liquidity_usd: number
          mint: string
          policy_version: string
          provider_error_code?: string | null
          reason_code: string
          research_spend_decision_id?: string | null
          resolved_pair_address?: string | null
          result: string
          scan_run_id?: string | null
          spend_decision?: string | null
          token_id?: string | null
          triage_decision?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
        }
        Update: {
          chain?: string
          checked_at?: string
          created_at?: string
          deep_research_executed?: boolean
          deep_research_run_id?: string | null
          detail?: string | null
          dex_id?: string | null
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_source?: string
          min_liquidity_usd?: number
          mint?: string
          policy_version?: string
          provider_error_code?: string | null
          reason_code?: string
          research_spend_decision_id?: string | null
          resolved_pair_address?: string | null
          result?: string
          scan_run_id?: string | null
          spend_decision?: string | null
          token_id?: string | null
          triage_decision?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
        }
        Relationships: []
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
          discovery_health: string | null
          discovery_health_detail: Json | null
          duration_ms: number | null
          enriched_count: number
          error_message: string | null
          execution_heartbeat_at: string | null
          execution_owner: string | null
          execution_started_at: string | null
          id: string
          lane_diagnostics: Json | null
          market_regime: string
          notes: string | null
          participation_diagnostics: Json | null
          passed_ai_triage: number
          passed_hard_filters: number
          passed_quantitative_ranking: number
          policy_epoch: string | null
          price_integrity_diagnostics: Json | null
          production_cycle_run_id: string | null
          provider_telemetry: Json | null
          quantitatively_ranked: number
          recurrence_diagnostics: Json | null
          refresh_diagnostics: Json | null
          research_packet_count: number | null
          research_packet_error: string | null
          research_packet_generated_at: string | null
          research_packet_status: string | null
          scanner_version: string | null
          selection_policy_version: string | null
          started_at: string
          status: string
          structural_diagnostics: Json | null
          survivor_diagnostics: Json | null
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
          discovery_health?: string | null
          discovery_health_detail?: Json | null
          duration_ms?: number | null
          enriched_count?: number
          error_message?: string | null
          execution_heartbeat_at?: string | null
          execution_owner?: string | null
          execution_started_at?: string | null
          id?: string
          lane_diagnostics?: Json | null
          market_regime?: string
          notes?: string | null
          participation_diagnostics?: Json | null
          passed_ai_triage?: number
          passed_hard_filters?: number
          passed_quantitative_ranking?: number
          policy_epoch?: string | null
          price_integrity_diagnostics?: Json | null
          production_cycle_run_id?: string | null
          provider_telemetry?: Json | null
          quantitatively_ranked?: number
          recurrence_diagnostics?: Json | null
          refresh_diagnostics?: Json | null
          research_packet_count?: number | null
          research_packet_error?: string | null
          research_packet_generated_at?: string | null
          research_packet_status?: string | null
          scanner_version?: string | null
          selection_policy_version?: string | null
          started_at?: string
          status?: string
          structural_diagnostics?: Json | null
          survivor_diagnostics?: Json | null
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
          discovery_health?: string | null
          discovery_health_detail?: Json | null
          duration_ms?: number | null
          enriched_count?: number
          error_message?: string | null
          execution_heartbeat_at?: string | null
          execution_owner?: string | null
          execution_started_at?: string | null
          id?: string
          lane_diagnostics?: Json | null
          market_regime?: string
          notes?: string | null
          participation_diagnostics?: Json | null
          passed_ai_triage?: number
          passed_hard_filters?: number
          passed_quantitative_ranking?: number
          policy_epoch?: string | null
          price_integrity_diagnostics?: Json | null
          production_cycle_run_id?: string | null
          provider_telemetry?: Json | null
          quantitatively_ranked?: number
          recurrence_diagnostics?: Json | null
          refresh_diagnostics?: Json | null
          research_packet_count?: number | null
          research_packet_error?: string | null
          research_packet_generated_at?: string | null
          research_packet_status?: string | null
          scanner_version?: string | null
          selection_policy_version?: string | null
          started_at?: string
          status?: string
          structural_diagnostics?: Json | null
          survivor_diagnostics?: Json | null
          survivor_limit?: number | null
          tokens_discovered?: number
          tokens_scanned?: number
          universe_diagnostics?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scan_runs_production_cycle_run_id_fkey"
            columns: ["production_cycle_run_id"]
            isOneToOne: false
            referencedRelation: "production_cycle_runs"
            referencedColumns: ["id"]
          },
        ]
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
      sizing_recommendations: {
        Row: {
          calculated_at: string
          conviction_band: string
          conviction_band_label: string
          created_at: string
          deploy_now_pct: number
          deployment_fraction: number
          deployment_label: string
          effective_max_allocation_pct: number
          entry_evaluation_id: string | null
          entry_state: string
          evidence_cap_multiplier: number
          evidence_confidence: number | null
          id: string
          is_calibration: boolean
          mint: string
          operational_status: string
          price_history_source: string | null
          raw_interpolated_max_pct: number
          reason_codes: string[]
          reserve_pct: number
          sizing_policy_version: string
          structural_modifier: number
          structural_risk: string
          thesis_call_id: string | null
          thesis_report_id: string | null
          thesis_score: number | null
          timing_resolution: string | null
        }
        Insert: {
          calculated_at?: string
          conviction_band: string
          conviction_band_label: string
          created_at?: string
          deploy_now_pct: number
          deployment_fraction: number
          deployment_label: string
          effective_max_allocation_pct: number
          entry_evaluation_id?: string | null
          entry_state: string
          evidence_cap_multiplier: number
          evidence_confidence?: number | null
          id?: string
          is_calibration?: boolean
          mint: string
          operational_status: string
          price_history_source?: string | null
          raw_interpolated_max_pct: number
          reason_codes?: string[]
          reserve_pct: number
          sizing_policy_version: string
          structural_modifier: number
          structural_risk: string
          thesis_call_id?: string | null
          thesis_report_id?: string | null
          thesis_score?: number | null
          timing_resolution?: string | null
        }
        Update: {
          calculated_at?: string
          conviction_band?: string
          conviction_band_label?: string
          created_at?: string
          deploy_now_pct?: number
          deployment_fraction?: number
          deployment_label?: string
          effective_max_allocation_pct?: number
          entry_evaluation_id?: string | null
          entry_state?: string
          evidence_cap_multiplier?: number
          evidence_confidence?: number | null
          id?: string
          is_calibration?: boolean
          mint?: string
          operational_status?: string
          price_history_source?: string | null
          raw_interpolated_max_pct?: number
          reason_codes?: string[]
          reserve_pct?: number
          sizing_policy_version?: string
          structural_modifier?: number
          structural_risk?: string
          thesis_call_id?: string | null
          thesis_report_id?: string | null
          thesis_score?: number | null
          timing_resolution?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sizing_recommendations_entry_evaluation_id_fkey"
            columns: ["entry_evaluation_id"]
            isOneToOne: false
            referencedRelation: "entry_state_evaluations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sizing_recommendations_thesis_call_id_fkey"
            columns: ["thesis_call_id"]
            isOneToOne: false
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sizing_recommendations_thesis_report_id_fkey"
            columns: ["thesis_report_id"]
            isOneToOne: false
            referencedRelation: "thesis_reports"
            referencedColumns: ["id"]
          },
        ]
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
      thesis_call_monitoring: {
        Row: {
          created_at: string
          id: string
          last_reconciled_at: string | null
          mint: string
          policy_version: string
          requires_fresh_entry_after: string | null
          status: string
          status_changed_at: string
          status_reason: string | null
          status_reason_code: string | null
          thesis_call_milestone_id: string
          token_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_reconciled_at?: string | null
          mint: string
          policy_version?: string
          requires_fresh_entry_after?: string | null
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          status_reason_code?: string | null
          thesis_call_milestone_id: string
          token_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_reconciled_at?: string | null
          mint?: string
          policy_version?: string
          requires_fresh_entry_after?: string | null
          status?: string
          status_changed_at?: string
          status_reason?: string | null
          status_reason_code?: string | null
          thesis_call_milestone_id?: string
          token_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "thesis_call_monitoring_thesis_call_milestone_id_fkey"
            columns: ["thesis_call_milestone_id"]
            isOneToOne: true
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_call_monitoring_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_reports: {
        Row: {
          ambiguous_evidence: Json | null
          bear_case_severity: string | null
          blocked_reasons: string[]
          catalyst_classification: string | null
          catalyst_kind: string | null
          catalyst_verification_basis: string | null
          catalysts: string[]
          chain: string
          component_reasons: Json | null
          component_scores: Json | null
          created_at: string
          current_eligibility: Json | null
          deep_research_report_id: string | null
          deep_research_run_id: string | null
          diagnostics: Json | null
          evidence_confidence: number | null
          evidence_confidence_artifact: Json | null
          evidence_confidence_components: Json | null
          evidence_confidence_raw_score: number | null
          evidence_confidence_version: string | null
          evidence_gaps: string[]
          evidence_polarity_counts: Json | null
          evidence_semantics_version: string | null
          gate_diagnostics: Json | null
          id: string
          input_policy_version: string
          invalidation: string[]
          is_calibration: boolean
          liquidity_at_synthesis: number | null
          market_cap_at_synthesis: number | null
          mint: string
          missing_evidence: Json | null
          model_identifier: string | null
          model_provider: string | null
          name: string | null
          narrative_maturity: string | null
          narrative_maturity_reasons: Json | null
          narrative_thesis: string | null
          negative_evidence: Json | null
          one_sentence_thesis: string | null
          positive_evidence: Json | null
          price_at_synthesis: number | null
          production_idempotency_key: string | null
          prompt_version: string
          qualified_as_opportunity: boolean
          research_packet_id: string | null
          research_packet_version: string | null
          rubric_version: string | null
          score_catalyst_narrative: number | null
          score_chart_context: number | null
          score_dev_integrity: number | null
          score_distribution: number | null
          score_liquidity: number | null
          score_meme_quality: number | null
          score_mindshare: number | null
          score_valuation: number | null
          sections: Json | null
          setups: string[]
          shortlist_milestone_id: string | null
          source_mix: Json | null
          status: string
          strongest_bear_case: string | null
          strongest_bull_case: string | null
          strongest_catalyst: string | null
          strongest_concern: string | null
          supporting_claim_refs: string[]
          supporting_source_refs: string[]
          symbol: string | null
          thesis_call_milestone_id: string | null
          thesis_policy_version: string
          thesis_score: number | null
          thesis_synthesis_run_id: string
          token_id: string | null
          triage_decision_id: string | null
          triage_run_id: string | null
          verdict: string | null
          why_now_market_signal: string | null
        }
        Insert: {
          ambiguous_evidence?: Json | null
          bear_case_severity?: string | null
          blocked_reasons?: string[]
          catalyst_classification?: string | null
          catalyst_kind?: string | null
          catalyst_verification_basis?: string | null
          catalysts?: string[]
          chain?: string
          component_reasons?: Json | null
          component_scores?: Json | null
          created_at?: string
          current_eligibility?: Json | null
          deep_research_report_id?: string | null
          deep_research_run_id?: string | null
          diagnostics?: Json | null
          evidence_confidence?: number | null
          evidence_confidence_artifact?: Json | null
          evidence_confidence_components?: Json | null
          evidence_confidence_raw_score?: number | null
          evidence_confidence_version?: string | null
          evidence_gaps?: string[]
          evidence_polarity_counts?: Json | null
          evidence_semantics_version?: string | null
          gate_diagnostics?: Json | null
          id?: string
          input_policy_version: string
          invalidation?: string[]
          is_calibration?: boolean
          liquidity_at_synthesis?: number | null
          market_cap_at_synthesis?: number | null
          mint: string
          missing_evidence?: Json | null
          model_identifier?: string | null
          model_provider?: string | null
          name?: string | null
          narrative_maturity?: string | null
          narrative_maturity_reasons?: Json | null
          narrative_thesis?: string | null
          negative_evidence?: Json | null
          one_sentence_thesis?: string | null
          positive_evidence?: Json | null
          price_at_synthesis?: number | null
          production_idempotency_key?: string | null
          prompt_version: string
          qualified_as_opportunity?: boolean
          research_packet_id?: string | null
          research_packet_version?: string | null
          rubric_version?: string | null
          score_catalyst_narrative?: number | null
          score_chart_context?: number | null
          score_dev_integrity?: number | null
          score_distribution?: number | null
          score_liquidity?: number | null
          score_meme_quality?: number | null
          score_mindshare?: number | null
          score_valuation?: number | null
          sections?: Json | null
          setups?: string[]
          shortlist_milestone_id?: string | null
          source_mix?: Json | null
          status: string
          strongest_bear_case?: string | null
          strongest_bull_case?: string | null
          strongest_catalyst?: string | null
          strongest_concern?: string | null
          supporting_claim_refs?: string[]
          supporting_source_refs?: string[]
          symbol?: string | null
          thesis_call_milestone_id?: string | null
          thesis_policy_version: string
          thesis_score?: number | null
          thesis_synthesis_run_id: string
          token_id?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
          verdict?: string | null
          why_now_market_signal?: string | null
        }
        Update: {
          ambiguous_evidence?: Json | null
          bear_case_severity?: string | null
          blocked_reasons?: string[]
          catalyst_classification?: string | null
          catalyst_kind?: string | null
          catalyst_verification_basis?: string | null
          catalysts?: string[]
          chain?: string
          component_reasons?: Json | null
          component_scores?: Json | null
          created_at?: string
          current_eligibility?: Json | null
          deep_research_report_id?: string | null
          deep_research_run_id?: string | null
          diagnostics?: Json | null
          evidence_confidence?: number | null
          evidence_confidence_artifact?: Json | null
          evidence_confidence_components?: Json | null
          evidence_confidence_raw_score?: number | null
          evidence_confidence_version?: string | null
          evidence_gaps?: string[]
          evidence_polarity_counts?: Json | null
          evidence_semantics_version?: string | null
          gate_diagnostics?: Json | null
          id?: string
          input_policy_version?: string
          invalidation?: string[]
          is_calibration?: boolean
          liquidity_at_synthesis?: number | null
          market_cap_at_synthesis?: number | null
          mint?: string
          missing_evidence?: Json | null
          model_identifier?: string | null
          model_provider?: string | null
          name?: string | null
          narrative_maturity?: string | null
          narrative_maturity_reasons?: Json | null
          narrative_thesis?: string | null
          negative_evidence?: Json | null
          one_sentence_thesis?: string | null
          positive_evidence?: Json | null
          price_at_synthesis?: number | null
          production_idempotency_key?: string | null
          prompt_version?: string
          qualified_as_opportunity?: boolean
          research_packet_id?: string | null
          research_packet_version?: string | null
          rubric_version?: string | null
          score_catalyst_narrative?: number | null
          score_chart_context?: number | null
          score_dev_integrity?: number | null
          score_distribution?: number | null
          score_liquidity?: number | null
          score_meme_quality?: number | null
          score_mindshare?: number | null
          score_valuation?: number | null
          sections?: Json | null
          setups?: string[]
          shortlist_milestone_id?: string | null
          source_mix?: Json | null
          status?: string
          strongest_bear_case?: string | null
          strongest_bull_case?: string | null
          strongest_catalyst?: string | null
          strongest_concern?: string | null
          supporting_claim_refs?: string[]
          supporting_source_refs?: string[]
          symbol?: string | null
          thesis_call_milestone_id?: string | null
          thesis_policy_version?: string
          thesis_score?: number | null
          thesis_synthesis_run_id?: string
          token_id?: string | null
          triage_decision_id?: string | null
          triage_run_id?: string | null
          verdict?: string | null
          why_now_market_signal?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thesis_reports_deep_research_report_id_fkey"
            columns: ["deep_research_report_id"]
            isOneToOne: false
            referencedRelation: "deep_research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_deep_research_run_id_fkey"
            columns: ["deep_research_run_id"]
            isOneToOne: false
            referencedRelation: "deep_research_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_shortlist_milestone_id_fkey"
            columns: ["shortlist_milestone_id"]
            isOneToOne: false
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_thesis_call_milestone_id_fkey"
            columns: ["thesis_call_milestone_id"]
            isOneToOne: false
            referencedRelation: "token_stage_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_thesis_synthesis_run_id_fkey"
            columns: ["thesis_synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "thesis_synthesis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_triage_decision_id_fkey"
            columns: ["triage_decision_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_decisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_reports_triage_run_id_fkey"
            columns: ["triage_run_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_synthesis_baselines: {
        Row: {
          baseline_origin: string
          baseline_version: string
          chain: string | null
          created_at: string
          deep_research_run_id: string | null
          id: string
          is_calibration: boolean
          liquidity_usd: number | null
          market_cap: number | null
          market_source: string | null
          mint: string
          observed_at: string | null
          price_usd: number | null
          research_packet_id: string | null
          source_pair_address: string | null
          source_scan_id: string | null
          synthesized_at: string
          thesis_report_id: string
          thesis_synthesis_run_id: string | null
          token_id: string | null
          triage_run_id: string | null
          volume_24h: number | null
        }
        Insert: {
          baseline_origin?: string
          baseline_version?: string
          chain?: string | null
          created_at?: string
          deep_research_run_id?: string | null
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_cap?: number | null
          market_source?: string | null
          mint: string
          observed_at?: string | null
          price_usd?: number | null
          research_packet_id?: string | null
          source_pair_address?: string | null
          source_scan_id?: string | null
          synthesized_at: string
          thesis_report_id: string
          thesis_synthesis_run_id?: string | null
          token_id?: string | null
          triage_run_id?: string | null
          volume_24h?: number | null
        }
        Update: {
          baseline_origin?: string
          baseline_version?: string
          chain?: string | null
          created_at?: string
          deep_research_run_id?: string | null
          id?: string
          is_calibration?: boolean
          liquidity_usd?: number | null
          market_cap?: number | null
          market_source?: string | null
          mint?: string
          observed_at?: string | null
          price_usd?: number | null
          research_packet_id?: string | null
          source_pair_address?: string | null
          source_scan_id?: string | null
          synthesized_at?: string
          thesis_report_id?: string
          thesis_synthesis_run_id?: string | null
          token_id?: string | null
          triage_run_id?: string | null
          volume_24h?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "thesis_synthesis_baselines_thesis_report_id_fkey"
            columns: ["thesis_report_id"]
            isOneToOne: true
            referencedRelation: "thesis_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_synthesis_baselines_thesis_synthesis_run_id_fkey"
            columns: ["thesis_synthesis_run_id"]
            isOneToOne: false
            referencedRelation: "thesis_synthesis_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_synthesis_baselines_token_id_fkey"
            columns: ["token_id"]
            isOneToOne: false
            referencedRelation: "tokens"
            referencedColumns: ["id"]
          },
        ]
      }
      thesis_synthesis_runs: {
        Row: {
          blocked_count: number
          code: string | null
          completed_at: string | null
          completed_count: number
          created_at: string
          diagnostics: Json | null
          error: string | null
          failed_count: number
          id: string
          input_policy_version: string
          insufficient_count: number
          is_calibration: boolean
          model_identifier: string | null
          model_provider: string | null
          opportunity_count: number
          prompt_version: string
          requested_count: number
          rubric_version: string | null
          source_scan_id: string | null
          started_at: string
          status: string
          thesis_call_count: number
          thesis_policy_version: string
          triage_run_id: string | null
        }
        Insert: {
          blocked_count?: number
          code?: string | null
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          diagnostics?: Json | null
          error?: string | null
          failed_count?: number
          id?: string
          input_policy_version: string
          insufficient_count?: number
          is_calibration?: boolean
          model_identifier?: string | null
          model_provider?: string | null
          opportunity_count?: number
          prompt_version: string
          requested_count?: number
          rubric_version?: string | null
          source_scan_id?: string | null
          started_at?: string
          status?: string
          thesis_call_count?: number
          thesis_policy_version: string
          triage_run_id?: string | null
        }
        Update: {
          blocked_count?: number
          code?: string | null
          completed_at?: string | null
          completed_count?: number
          created_at?: string
          diagnostics?: Json | null
          error?: string | null
          failed_count?: number
          id?: string
          input_policy_version?: string
          insufficient_count?: number
          is_calibration?: boolean
          model_identifier?: string | null
          model_provider?: string | null
          opportunity_count?: number
          prompt_version?: string
          requested_count?: number
          rubric_version?: string | null
          source_scan_id?: string | null
          started_at?: string
          status?: string
          thesis_call_count?: number
          thesis_policy_version?: string
          triage_run_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "thesis_synthesis_runs_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "thesis_synthesis_runs_triage_run_id_fkey"
            columns: ["triage_run_id"]
            isOneToOne: false
            referencedRelation: "ai_triage_runs"
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
          current_market_validity: string
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
          invalid_observation_count: number
          last_evaluated_at: string | null
          last_valid_observation_at: string | null
          market_cap_change_since_first_call_pct: number | null
          market_cap_change_since_first_seen_pct: number | null
          market_validity_version: string | null
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
          current_market_validity?: string
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
          invalid_observation_count?: number
          last_evaluated_at?: string | null
          last_valid_observation_at?: string | null
          market_cap_change_since_first_call_pct?: number | null
          market_cap_change_since_first_seen_pct?: number | null
          market_validity_version?: string | null
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
          current_market_validity?: string
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
          invalid_observation_count?: number
          last_evaluated_at?: string | null
          last_valid_observation_at?: string | null
          market_cap_change_since_first_call_pct?: number | null
          market_cap_change_since_first_seen_pct?: number | null
          market_validity_version?: string | null
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
      token_stage_milestones: {
        Row: {
          ai_policy_version: string | null
          baseline_complete: boolean
          chain: string
          contract_address: string
          created_at: string
          evidence_observation_id: string | null
          first_base_at: string | null
          first_entered_at: string
          first_reaccel_at: string | null
          first_setup: string | null
          id: string
          liquidity_at_entry: number | null
          market_cap_at_entry: number | null
          market_snapshot_id: string | null
          metadata: Json | null
          milestone_version: string
          policy_epoch: string
          policy_version: string | null
          price_at_entry: number | null
          quantitative_priority_at_entry: number | null
          research_model_version: string | null
          research_packet_id: string | null
          research_packet_version: string | null
          research_report_id: string | null
          research_run_id: string | null
          selected_at: string | null
          selection_policy_version: string | null
          setup_at_entry: string | null
          setup_key: string
          source_id: string | null
          source_ref: string | null
          source_scan_id: string | null
          source_type: string
          stage: string
          token_id: string
        }
        Insert: {
          ai_policy_version?: string | null
          baseline_complete?: boolean
          chain?: string
          contract_address: string
          created_at?: string
          evidence_observation_id?: string | null
          first_base_at?: string | null
          first_entered_at: string
          first_reaccel_at?: string | null
          first_setup?: string | null
          id?: string
          liquidity_at_entry?: number | null
          market_cap_at_entry?: number | null
          market_snapshot_id?: string | null
          metadata?: Json | null
          milestone_version?: string
          policy_epoch?: string
          policy_version?: string | null
          price_at_entry?: number | null
          quantitative_priority_at_entry?: number | null
          research_model_version?: string | null
          research_packet_id?: string | null
          research_packet_version?: string | null
          research_report_id?: string | null
          research_run_id?: string | null
          selected_at?: string | null
          selection_policy_version?: string | null
          setup_at_entry?: string | null
          setup_key?: string
          source_id?: string | null
          source_ref?: string | null
          source_scan_id?: string | null
          source_type: string
          stage: string
          token_id: string
        }
        Update: {
          ai_policy_version?: string | null
          baseline_complete?: boolean
          chain?: string
          contract_address?: string
          created_at?: string
          evidence_observation_id?: string | null
          first_base_at?: string | null
          first_entered_at?: string
          first_reaccel_at?: string | null
          first_setup?: string | null
          id?: string
          liquidity_at_entry?: number | null
          market_cap_at_entry?: number | null
          market_snapshot_id?: string | null
          metadata?: Json | null
          milestone_version?: string
          policy_epoch?: string
          policy_version?: string | null
          price_at_entry?: number | null
          quantitative_priority_at_entry?: number | null
          research_model_version?: string | null
          research_packet_id?: string | null
          research_packet_version?: string | null
          research_report_id?: string | null
          research_run_id?: string | null
          selected_at?: string | null
          selection_policy_version?: string | null
          setup_at_entry?: string | null
          setup_key?: string
          source_id?: string | null
          source_ref?: string | null
          source_scan_id?: string | null
          source_type?: string
          stage?: string
          token_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "token_stage_milestones_evidence_observation_id_fkey"
            columns: ["evidence_observation_id"]
            isOneToOne: false
            referencedRelation: "evidence_observations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_stage_milestones_market_snapshot_id_fkey"
            columns: ["market_snapshot_id"]
            isOneToOne: false
            referencedRelation: "token_snapshots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_stage_milestones_research_packet_id_fkey"
            columns: ["research_packet_id"]
            isOneToOne: false
            referencedRelation: "research_packets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_stage_milestones_research_report_id_fkey"
            columns: ["research_report_id"]
            isOneToOne: false
            referencedRelation: "research_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_stage_milestones_source_scan_id_fkey"
            columns: ["source_scan_id"]
            isOneToOne: false
            referencedRelation: "scan_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "token_stage_milestones_token_id_fkey"
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
      dispatch_production_cycle_stage: { Args: never; Returns: undefined }
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
