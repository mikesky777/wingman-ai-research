import type { EntryState, OpportunityStage, StructuralRiskKey } from "./types";

/**
 * Wingman scoring configuration.
 * These constants are the single source of truth for scoring semantics.
 * Do not duplicate weights, bands, or state rules inside components.
 */

export const THESIS_CATEGORIES = [
  { key: "memeQuality", label: "Thesis / Meme Quality", weight: 20 },
  { key: "catalystNarrative", label: "Catalyst / Narrative Strength", weight: 15 },
  { key: "distribution", label: "Distribution / Holder Structure", weight: 15 },
  { key: "liquidity", label: "Liquidity / Exitability", weight: 15 },
  { key: "devIntegrity", label: "Dev / Launch Integrity", weight: 10 },
  { key: "chartEntry", label: "Chart / Quality of Entry", weight: 10 },
  { key: "mindshare", label: "Mindshare / Reflexivity", weight: 10 },
  { key: "valuation", label: "Valuation / Asymmetry", weight: 5 },
] as const;

export type ThesisCategoryKey = (typeof THESIS_CATEGORIES)[number]["key"];

export const SIZING_BANDS = [
  { min: 0, max: 49, label: "Below 50", exposure: "Pass / lottery-sized only" },
  { min: 50, max: 59, label: "50–59", exposure: "2–4% max" },
  { min: 60, max: 69, label: "60–69", exposure: "4–7% max" },
  { min: 70, max: 79, label: "70–79", exposure: "7–10% max" },
  { min: 80, max: 89, label: "80–89", exposure: "10–15% max" },
  { min: 90, max: 100, label: "90–100", exposure: "15–20% max" },
] as const;

export function sizingBandFor(score: number) {
  return SIZING_BANDS.find((b) => score >= b.min && score <= b.max) ?? SIZING_BANDS[0];
}

export const STRUCTURAL_MULTIPLIERS: Record<
  StructuralRiskKey,
  { label: string; multiplier: number | null; description: string }
> = {
  CLEAN: { label: "Clean", multiplier: 1, description: "No meaningful structural concerns." },
  ONE_CONCERN: {
    label: "One meaningful concern",
    multiplier: 0.75,
    description: "A single structural issue worth respecting.",
  },
  SIGNIFICANT: {
    label: "Significant concern",
    multiplier: 0.5,
    description: "Material structural risk in distribution, dev, or liquidity.",
  },
  BORDERLINE: {
    label: "Borderline",
    multiplier: 0.25,
    description: "Barely passes the structural bar — minimal exposure only.",
  },
  FATAL: {
    label: "Fatal flaw",
    multiplier: null,
    description: "Disqualifying structural flaw. No trade.",
  },
};

export const ENTRY_STATES: Record<
  EntryState,
  {
    label: string;
    tone: "positive" | "acceptable" | "neutral" | "warning" | "danger";
    tooltip: string;
    examples: string[];
  }
> = {
  BUY_ZONE: {
    label: "BUY ZONE",
    tone: "positive",
    tooltip: "Price is at a location where risk can be defined tightly against invalidation.",
    examples: [
      "Impulse followed by controlled retrace",
      "Higher low",
      "Breakout followed by successful retest",
      "Constructive consolidation",
      "Price compression while holder / mindshare data improves",
    ],
  },
  ACCEPTABLE: {
    label: "ACCEPTABLE",
    tone: "acceptable",
    tooltip: "Not the best location, but risk can still be defined at a tolerable cost.",
    examples: ["Slightly extended from base", "Mid-range entry with clear invalidation"],
  },
  SETTING_UP: {
    label: "SETTING UP",
    tone: "neutral",
    tooltip: "Structure is forming. A buyable location may appear soon.",
    examples: ["Retrace in progress", "Base building after impulse"],
  },
  WATCH: {
    label: "WATCH",
    tone: "neutral",
    tooltip: "Thesis is tracked but the chart offers no actionable location yet.",
    examples: ["No defined structure", "Thesis ahead of price action"],
  },
  EXTENDED: {
    label: "EXTENDED",
    tone: "warning",
    tooltip: "Price has run too far from support. Chasing here pays a poor risk/reward.",
    examples: [
      "Vertical price expansion",
      "Price far above recent base",
      "Price greatly outrunning holder growth",
      "Poor nearby risk definition",
      "Significant upper-wick distribution",
    ],
  },
  BROKEN: {
    label: "BROKEN",
    tone: "danger",
    tooltip: "Structure has failed. Treat the setup as invalidated.",
    examples: [
      "Repeated lower highs and lower lows",
      "Structural support failure",
      "Major holder distribution",
      "Liquidity deterioration",
      "Thesis invalidation",
    ],
  },
};

export const ENTRY_STATE_FLOW: EntryState[] = ["WATCH", "SETTING_UP", "BUY_ZONE"];
export const ENTRY_STATE_ALTERNATIVES: EntryState[] = ["EXTENDED", "BROKEN"];

export const STAGE_LABELS: Record<OpportunityStage, string> = {
  EMERGING: "EMERGING",
  DEVELOPING: "DEVELOPING",
  ESTABLISHED: "ESTABLISHED",
  LATE: "LATE",
};

/**
 * Scanner v1 funnel. Wingman does not scan every Solana token — it runs
 * complementary discovery rankings, so the first stage is DISCOVERED.
 * The last two stages are not implemented yet and are labelled as such.
 */
export const PIPELINE_STAGES = [
  {
    key: "discovered",
    label: "Tokens Discovered",
    description: "Unique Solana tokens surfaced across all discovery rankings, deduplicated.",
    active: true,
  },
  {
    key: "hard_filters",
    label: "Passed Hard Filters",
    description: "Survived chain, contract, liquidity, recency and age-aware activity floors.",
    active: true,
  },
  {
    key: "quant",
    label: "Quantitatively Ranked",
    description: "Matched a lifecycle lane and received a quantitative research priority.",
    active: true,
  },
  {
    key: "enriched",
    label: "Enriched",
    description: "Survivors given a fresh DexScreener pull, immutable snapshot and evidence.",
    active: true,
  },
  {
    key: "triage",
    label: "AI Triage",
    description: "Not active in this iteration.",
    active: false,
  },
  {
    key: "deep",
    label: "Deep Research",
    description: "Not active in this iteration.",
    active: false,
  },
] as const;


export const INITIAL_DEPLOYMENT_PCT = "60–70% of intended maximum";
export const RESEARCH_DISCLAIMER =
  "Research framework — final sizing decision remains with the trader.";
export const MOCK_DATA_NOTICE =
  "Research and scoring only — Wingman does not execute trades.";
/** Only for genuinely simulated/demo sections, never on live production data. */
export const SIMULATED_SECTION_NOTICE =
  "Simulated demo data — not a live scan.";
