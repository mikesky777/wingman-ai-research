/**
 * settings_policy_manifest/v1 — the single read-only description of what
 * production actually runs (pure).
 *
 * Every value here is RESOLVED from the authoritative versioned constant of
 * the stage that owns it. Settings must never keep its own snapshot of a
 * weight, threshold or version: that is exactly how the old Settings page
 * drifted into showing a legacy v0 rubric. Nothing in this module configures
 * anything — it is display + regression surface only.
 */
import { SELECTION_POLICY_VERSION } from "../history/policy-epochs";
import {
  SCANNER_VERSION,
  DISCOVERY_CONFIG_VERSION,
  STRATEGY_CONFIG_VERSION,
} from "../scanner/config";
import { STRUCTURAL_POLICY_VERSION } from "../scanner/structural";
import { RESEARCH_PACKET_VERSION } from "../research/types";
import {
  TRIAGE_POLICY_VERSION,
  TRIAGE_PROMPT_VERSION,
  TRIAGE_INPUT_POLICY_VERSION,
} from "../research/triage";
import { RESEARCH_SPEND_POLICY_VERSION } from "../research/spend/spend-policy";
import {
  DEEP_RESEARCH_POLICY_VERSION,
  DEEP_RESEARCH_DOSSIER_VERSION,
  DEEP_RESEARCH_PROMPT_VERSION,
  DEEP_RESEARCH_EVIDENCE_SEMANTICS_VERSION,
} from "../research/deep/contracts";
import {
  THESIS_POLICY_VERSION,
  THESIS_RUBRIC_VERSION,
  THESIS_PROMPT_VERSION,
  THESIS_INPUT_POLICY_VERSION,
  EVIDENCE_CONFIDENCE_VERSION,
  OPPORTUNITY_GATE_VERSION,
  THESIS_COMPONENTS,
  THESIS_MAX_SCORE,
} from "../research/thesis/contracts";
import { THESIS_EVIDENCE_SEMANTICS_VERSION } from "../research/thesis/evidence-semantics";
import { ENTRY_POLICY_VERSION, ENTRY_FEATURE_VERSION } from "../entry/contracts";
import { SIZING_POLICY_VERSION } from "../sizing/contracts";
import { LIVE_LIFECYCLE_VERSION } from "../live/lifecycle";
import { OUTCOME_SAMPLER_VERSION } from "../outcomes/sampler";
import { TRIAGE_MODEL, DEEP_RESEARCH_MODEL, THESIS_MODEL } from "../ai/models";

export const SETTINGS_POLICY_MANIFEST_VERSION = "settings_policy_manifest/v1";

export interface PolicyItem {
  label: string;
  value: string;
}

export interface PolicyStage {
  stage: string;
  note: string;
  items: PolicyItem[];
}

/** Stage-by-stage production policy. Never merged into one generic card. */
export const PRODUCTION_POLICY_STAGES: PolicyStage[] = [
  {
    stage: "Scanner",
    note: "Deterministic discovery, hard filters and setup taxonomy. No AI.",
    items: [
      { label: "Scanner", value: SCANNER_VERSION },
      { label: "Selection policy", value: SELECTION_POLICY_VERSION },
      { label: "Discovery config", value: DISCOVERY_CONFIG_VERSION },
      { label: "Setup taxonomy", value: STRATEGY_CONFIG_VERSION },
      { label: "Structural guardrails", value: STRUCTURAL_POLICY_VERSION },
    ],
  },
  {
    stage: "Research Packet",
    note: "Frozen handoff between Scanner and AI Triage.",
    items: [{ label: "Packet schema", value: RESEARCH_PACKET_VERSION }],
  },
  {
    stage: "AI Triage",
    note: "Comparative research-priority only. Never a buy/sell judgement.",
    items: [
      { label: "Policy", value: TRIAGE_POLICY_VERSION },
      { label: "Prompt", value: TRIAGE_PROMPT_VERSION },
      { label: "Input contract", value: TRIAGE_INPUT_POLICY_VERSION },
      { label: "Model", value: TRIAGE_MODEL },
    ],
  },
  {
    stage: "Research Spend",
    note: "Operational cooldown and budget control. Never negative evidence.",
    items: [{ label: "Policy", value: RESEARCH_SPEND_POLICY_VERSION }],
  },
  {
    stage: "Deep Research",
    note: "External evidence collection with source lineage.",
    items: [
      { label: "Policy", value: DEEP_RESEARCH_POLICY_VERSION },
      { label: "Dossier schema", value: DEEP_RESEARCH_DOSSIER_VERSION },
      { label: "Prompt", value: DEEP_RESEARCH_PROMPT_VERSION },
      { label: "Evidence semantics", value: DEEP_RESEARCH_EVIDENCE_SEMANTICS_VERSION },
      { label: "Model", value: DEEP_RESEARCH_MODEL },
    ],
  },
  {
    stage: "Thesis Synthesis",
    note: "Fundamentals only. Entry timing is a separate stage and scores nothing here.",
    items: [
      { label: "Policy", value: THESIS_POLICY_VERSION },
      { label: "Rubric", value: THESIS_RUBRIC_VERSION },
      { label: "Prompt", value: THESIS_PROMPT_VERSION },
      { label: "Input contract", value: THESIS_INPUT_POLICY_VERSION },
      { label: "Evidence semantics", value: THESIS_EVIDENCE_SEMANTICS_VERSION },
      { label: "Evidence Confidence", value: EVIDENCE_CONFIDENCE_VERSION },
      { label: "Model", value: THESIS_MODEL },
    ],
  },
  {
    stage: "Opportunity Gate",
    note: "Decides whether a Thesis becomes a production Thesis Call.",
    items: [{ label: "Gate", value: OPPORTUNITY_GATE_VERSION }],
  },
  {
    stage: "Entry & Lifecycle",
    note: "Deterministic timing state, sizing framework and append-only live ledger.",
    items: [
      { label: "Entry policy", value: ENTRY_POLICY_VERSION },
      { label: "Entry features", value: ENTRY_FEATURE_VERSION },
      { label: "Sizing policy", value: SIZING_POLICY_VERSION },
      { label: "Live lifecycle", value: LIVE_LIFECYCLE_VERSION },
    ],
  },
  {
    stage: "Outcome Collection",
    note: "Independent market sampling. Never a production decision input.",
    items: [{ label: "Sampler", value: OUTCOME_SAMPLER_VERSION }],
  },
];

/**
 * The ACTIVE Thesis rubric, resolved from the rubric constants themselves.
 * Timing/chart context is intentionally absent from the active rubric.
 */
export const ACTIVE_THESIS_RUBRIC = {
  rubricVersion: THESIS_RUBRIC_VERSION,
  promptVersion: THESIS_PROMPT_VERSION,
  components: THESIS_COMPONENTS.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
  maxScore: THESIS_MAX_SCORE,
};
