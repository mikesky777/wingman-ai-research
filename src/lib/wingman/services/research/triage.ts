/**
 * AI Triage v1 — cheap COMPARATIVE research-priority judgement (pure).
 *
 * Triage answers exactly one question: which candidates in THIS cohort deserve
 * expensive Deep Research? It is not a buy/sell judgement. It never produces a
 * Thesis Score, probability, expected return, entry state, sizing or verdict,
 * and it never overrides a scanner gate.
 *
 * Everything in this module is deterministic and side-effect free: prompt
 * construction, cohort statistics, output validation, rank comparison and
 * calibration analysis. Provider calls and persistence live elsewhere.
 */
import type { CandidateSource } from "./types";

export const TRIAGE_POLICY_VERSION = "ai_triage/v1";
export const TRIAGE_PROMPT_VERSION = "ai_triage_prompt/v1.1";

/**
 * Input-serialization policy for triage. Stage 2 must never see information
 * that only exists BECAUSE of what happened after its own evidence snapshot,
 * otherwise calibration against historical packets rewards hindsight instead
 * of judgement. Realized outcome performance stays in the full Research
 * Packet for audit; it is stripped from the model input here.
 */
export const TRIAGE_INPUT_POLICY_VERSION = "ai_triage_input/v1_no_outcomes";

/** Compact packet keys removed before the model ever sees a candidate. */
export const TRIAGE_REDACTED_KEYS = ["outcomes"] as const;

/**
 * CALIBRATION-ONLY input ablations. These exist to test whether the model is
 * reading evidence or mechanically inheriting the scanner's own selection
 * decision. They never change production input, never change Quantitative
 * Research Priority, and never change scanner selection.
 */
export interface TriageInputAblation {
  /** Hide scanner-selection provenance: candidate_source, survivor flag, selection route. */
  blindSource?: boolean;
  /** Represent setup as recognized_setup true/false instead of the literal BASE/REACCEL/NONE label. */
  neutralSetup?: boolean;
  /** Counterfactual: present these mints under a different source label. Evidence is untouched. */
  sourceLabelOverrides?: Record<string, CandidateSource>;
}

/** Stable policy id describing exactly what the model was allowed to see. */
export function inputPolicyVersionFor(ablation?: TriageInputAblation | null): string {
  const parts: string[] = [];
  if (ablation?.blindSource) parts.push("blind_source");
  if (ablation?.neutralSetup) parts.push("neutral_setup");
  if (ablation?.sourceLabelOverrides && Object.keys(ablation.sourceLabelOverrides).length > 0) {
    parts.push("source_label_swap");
  }
  return parts.length ? `${TRIAGE_INPUT_POLICY_VERSION}+${parts.join("+")}` : TRIAGE_INPUT_POLICY_VERSION;
}

const RECOGNIZED_SETUPS = ["BASE", "REACCEL"];

/** Pure, deterministic: strip post-snapshot outcome information (+ optional ablations). */
export function redactCompactForTriage(
  compact: Record<string, unknown>,
  ablation?: TriageInputAblation | null,
  /** Counterfactual source label for this candidate, evidence untouched. */
  sourceOverride?: CandidateSource | null,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(compact)) {
    if ((TRIAGE_REDACTED_KEYS as readonly string[]).includes(key)) continue;
    if (ablation?.blindSource && key === "src") continue;
    out[key] = value;
  }
  if (sourceOverride && !ablation?.blindSource) out["src"] = sourceOverride;
  const scan = out["scan"];
  if (scan && typeof scan === "object" && !Array.isArray(scan)) {
    const next: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scan as Record<string, unknown>)) {
      if (ablation?.blindSource && (key === "survivor" || key === "route")) continue;
      if (sourceOverride && key === "route") continue;
      if (sourceOverride && key === "survivor") {
        next[key] = sourceOverride === "SURVIVOR";
        continue;
      }
      if (ablation?.neutralSetup && key === "setups") continue;
      next[key] = value;
    }
    if (ablation?.neutralSetup) {
      const setups = ((scan as Record<string, unknown>)["setups"] as string[] | undefined) ?? [];
      next["recognized_setup"] = setups.some((s) => RECOGNIZED_SETUPS.includes(s));
    }
    out["scan"] = next;
  }
  return out;
}


/** Deterministic seeded ordering, for presentation-order stability testing. */
export function orderCandidates<T extends { mint: string }>(rows: T[], seed: number | null): T[] {
  if (seed === null || seed === undefined) return rows;
  const hash = (s: string) => {
    let h = (seed >>> 0) ^ 2166136261;
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
  };
  return [...rows].sort((a, b) => hash(a.mint) - hash(b.mint) || a.mint.localeCompare(b.mint));
}

export interface TriageConfig {
  /** MAXIMUM number of DEEP_RESEARCH decisions. Never a quota to fill. */
  maxDeepResearch: number;
}

export const TRIAGE_CONFIG: TriageConfig = { maxDeepResearch: 15 };

export type TriageMode = "PRODUCTION" | "CALIBRATION";

export type TriageDecision =
  | "DEEP_RESEARCH"
  | "WATCH"
  | "SKIP"
  /** Operationally blocked between packet generation and shortlist persistence. */
  | "BLOCKED_BEFORE_SHORTLIST";

export const MODEL_DECISIONS: TriageDecision[] = ["DEEP_RESEARCH", "WATCH", "SKIP"];

export type TriageConfidence = "HIGH" | "MEDIUM" | "LOW";

/** Evidence domains triage may ask Deep Research to resolve. */
export const RESEARCH_DOMAINS = [
  "MEME_LORE",
  "SOCIAL_MINDSHARE",
  "COMMUNITY",
  "CATALYST",
  "DEVELOPER",
  "NARRATIVE_HISTORY",
  "HOLDER_DISTRIBUTION",
  "LIQUIDITY_DEPTH",
  "PRICE_STRUCTURE",
  "PARTICIPATION_QUALITY",
  "STRUCTURAL_SAFETY",
] as const;
export type ResearchDomain = (typeof RESEARCH_DOMAINS)[number];

/** One eligible candidate, exact-mint scoped, as sent to the model. */
export interface TriageCandidateInput {
  mint: string;
  candidateSource: CandidateSource;
  researchPacketId: string | null;
  researchPacketVersion: string;
  quantPriority: number | null;
  /** 1-based rank by Quantitative Research Priority within this cohort. */
  quantRank: number | null;
  /** Deterministic compact serialization from Stage 1. */
  compact: Record<string, unknown>;
}

export interface CohortSummary {
  candidateCount: number;
  medianQuantPriority: number | null;
  medianMarketCap: number | null;
  medianLiquidityUsd: number | null;
  setupCounts: Record<string, number>;
  priceStructureCounts: Record<string, number>;
  participationCounts: Record<string, number>;
  recurrenceCounts: Record<string, number>;
  sourceCounts: Record<string, number>;
}

function medianOf(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
  return Math.round(value * 1000) / 1000;
}

function bump(counts: Record<string, number>, key: string | null | undefined) {
  const k = key && key.length > 0 ? key : "UNKNOWN";
  counts[k] = (counts[k] ?? 0) + 1;
}

function readCompact(c: Record<string, unknown>, path: string[]): unknown {
  let node: unknown = c;
  for (const key of path) {
    if (!node || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

/** Descriptive cohort statistics so the model can reason relatively. */
export function buildCohortSummary(candidates: TriageCandidateInput[]): CohortSummary {
  const setupCounts: Record<string, number> = {};
  const priceStructureCounts: Record<string, number> = {};
  const participationCounts: Record<string, number> = {};
  const recurrenceCounts: Record<string, number> = {};
  const sourceCounts: Record<string, number> = {};

  for (const c of candidates) {
    const setups = (readCompact(c.compact, ["scan", "setups"]) as string[] | undefined) ?? [];
    const recognized = setups.filter((s) => s === "BASE" || s === "REACCEL");
    bump(setupCounts, recognized.length ? recognized.join("+") : "NONE");
    bump(
      priceStructureCounts,
      (readCompact(c.compact, ["price_integrity", "status"]) as string | undefined) ??
        "NOT_EVALUATED",
    );
    bump(
      participationCounts,
      (readCompact(c.compact, ["participation", "status"]) as string | undefined) ??
        "NOT_EVALUATED",
    );
    bump(recurrenceCounts, readCompact(c.compact, ["scan", "recurrence"]) as string | undefined);
    bump(sourceCounts, c.candidateSource);
  }

  return {
    candidateCount: candidates.length,
    medianQuantPriority: medianOf(candidates.map((c) => c.quantPriority)),
    medianMarketCap: medianOf(
      candidates.map((c) => readCompact(c.compact, ["mkt", "mc"]) as number | null),
    ),
    medianLiquidityUsd: medianOf(
      candidates.map((c) => readCompact(c.compact, ["mkt", "liq"]) as number | null),
    ),
    setupCounts,
    priceStructureCounts,
    participationCounts,
    recurrenceCounts,
    sourceCounts,
  };
}

export interface TriageRunHeader {
  scanId: string;
  scannerPolicyVersion: string;
  triagePolicyVersion: string;
  promptVersion: string;
  mode: TriageMode;
  candidateCount: number;
  generatedAt: string;
  maxDeepResearch: number;
}

/** Assign 1-based Quant ranks (highest priority first, missing priority last). */
export function withQuantRanks(
  candidates: Omit<TriageCandidateInput, "quantRank">[],
): TriageCandidateInput[] {
  const ordered = [...candidates].sort((a, b) => {
    const av = typeof a.quantPriority === "number" ? a.quantPriority : -Infinity;
    const bv = typeof b.quantPriority === "number" ? b.quantPriority : -Infinity;
    if (av !== bv) return bv - av;
    return a.mint.localeCompare(b.mint);
  });
  const rankByMint = new Map(ordered.map((c, i) => [c.mint, i + 1]));
  return candidates.map((c) => ({ ...c, quantRank: rankByMint.get(c.mint) ?? null }));
}

const SYSTEM_PROMPT = `You are Wingman's comparative research-triage analyst for Solana tokens.

YOUR ONLY JOB: decide which candidates in the supplied cohort deserve EXPENSIVE external Deep Research. This is a research-priority judgement, NOT a buy/sell judgement.

You may reason ONLY from the structured Wingman evidence supplied in each candidate packet: setup, Quantitative Research Priority, market cap, liquidity, turnover, volume, trades, activity and acceleration, recurrence/persistence, Momentum signal, Participation Quality, Price Structure, structural evidence, holder/creator evidence, valuation scale and evidence gaps.

NO HINDSIGHT: packets contain NO realized outcome, performance, peak, drawdown or "what happened next" information. Never assume, infer or invent how a candidate performed after its evidence snapshot.

You have NO external research. You must NOT claim anything about meme/lore quality, X/Twitter mindshare, community strength, catalysts, news, influencers, cultural relevance, narrative history, or developer reputation beyond stored Wingman evidence. Where those matter, list them as unresolved research questions / requested research domains instead.

SEMANTICS you must respect:
- Recognized setups are BASE and REACCEL only. NONE is a valid candidate and is NOT automatically bad.
- MOMENTUM is a SIGNAL, never a recognized setup.
- Price Structure: HEALTHY | CONCERN | DAMAGED | UNKNOWN | NOT_EVALUATED. DAMAGED is not an automatic rejection.
- Participation: BROAD | CONCENTRATED | EXTREME | UNKNOWN | NOT_EVALUATED. CONCENTRATED is not an automatic rejection.
- NOT_EVALUATED (a layer never ran) is NOT the same as UNKNOWN (a layer ran and could not classify).
- Missing evidence is NOT negative evidence. Never treat a gap as bearish.
- Survivor status is context, not a guaranteed shortlist ticket.
- A very young NONE token simply has less persistence evidence and more uncertainty; say so rather than penalising it for lacking a setup.

BE COMPARATIVE. Rank candidates against each other in this cohort, not in isolation, and do not simply reproduce the Quantitative Research Priority order. Prefer candidates whose evidence is unusually strong relative to valuation, whose evidence repeats across scans, whose participation is broad, whose liquidity justifies deeper work, and whose open questions Deep Research could actually resolve.

SHORTLIST DISCIPLINE: DEEP_RESEARCH is capped at the supplied max_deep_research. It is a MAXIMUM, never a quota. If only a few candidates clearly justify expensive research, shortlist only those few.

FORBIDDEN OUTPUT: thesis scores, probabilities, expected returns, price targets, buy/sell/entry/exit language, position sizing, or any final opportunity verdict.

Return STRICT JSON only, no prose and no markdown fences.`;

export interface TriagePrompt {
  system: string;
  user: string;
  promptVersion: string;
  bytes: number;
}

/** Deterministic model input: run header + cohort summary + compact packets. */
export function buildTriagePrompt(input: {
  header: TriageRunHeader;
  cohort: CohortSummary;
  candidates: TriageCandidateInput[];
  ablation?: TriageInputAblation | null;
}): TriagePrompt {
  const ablation = input.ablation ?? null;
  const cohort: Record<string, unknown> = { ...input.cohort };
  if (ablation?.blindSource) delete cohort["sourceCounts"];
  if (ablation?.neutralSetup) {
    const counts = input.cohort.setupCounts;
    let recognized = 0;
    let unrecognized = 0;
    for (const [key, n] of Object.entries(counts)) {
      if (key === "NONE" || key === "UNKNOWN") unrecognized += n;
      else recognized += n;
    }
    delete cohort["setupCounts"];
    cohort["recognizedSetupCounts"] = { recognized, unrecognized };
  }
  const payload = {
    run: input.header,
    cohort_summary: cohort,
    candidates: input.candidates.map((c) => ({
      mint: c.mint,
      ...(ablation?.blindSource
        ? {}
        : { candidate_source: ablation?.sourceLabelOverrides?.[c.mint] ?? c.candidateSource }),
      quant_priority: c.quantPriority,
      quant_rank: c.quantRank,
      packet: redactCompactForTriage(
        c.compact,
        ablation,
        ablation?.sourceLabelOverrides?.[c.mint] ?? null,
      ),
    })),

    output_contract: {
      schema: TRIAGE_POLICY_VERSION,
      max_deep_research: input.header.maxDeepResearch,
      shape: {
        decisions: [
          {
            mint: "exact mint from the candidate list",
            decision: "DEEP_RESEARCH | WATCH | SKIP",
            research_priority_rank: "1-based rank within this run, 1 = research first",
            confidence: "HIGH | MEDIUM | LOW",
            rationale: "<=350 chars, cites packet evidence only",
            strongest_positive: "<=200 chars",
            strongest_concern: "<=200 chars",
            unresolved_questions: ["<=3 short questions deep research could answer"],
            requested_research_domains: RESEARCH_DOMAINS,
          },
        ],
      },
      rules: [
        "Return exactly one entry per supplied mint, no extras, no omissions.",
        "research_priority_rank must be unique and cover 1..N.",
        `At most ${input.header.maxDeepResearch} entries may be DEEP_RESEARCH; fewer is expected and correct.`,
        "requested_research_domains must be chosen from the listed enum.",
      ],
    },
  };
  const user = JSON.stringify(payload);
  return {
    system: SYSTEM_PROMPT,
    user,
    promptVersion: TRIAGE_PROMPT_VERSION,
    bytes: new TextEncoder().encode(user).length + new TextEncoder().encode(SYSTEM_PROMPT).length,
  };
}

/** One validated model decision. */
export interface TriageDecisionRecord {
  mint: string;
  decision: TriageDecision;
  triageRank: number;
  confidence: TriageConfidence;
  rationale: string;
  strongestPositive: string | null;
  strongestConcern: string | null;
  unresolvedQuestions: string[];
  requestedResearchDomains: string[];
}

export type TriageValidationError =
  | "NOT_AN_OBJECT"
  | "MISSING_DECISIONS"
  | "UNKNOWN_MINT"
  | "MISSING_MINT"
  | "DUPLICATE_MINT"
  | "INVALID_DECISION"
  | "INVALID_CONFIDENCE"
  | "INVALID_RANK"
  | "MISSING_RATIONALE"
  | "DEEP_RESEARCH_LIMIT_EXCEEDED";

export interface TriageValidationResult {
  ok: boolean;
  errors: { code: TriageValidationError; detail: string }[];
  decisions: TriageDecisionRecord[];
}

const asString = (v: unknown): string | null =>
  typeof v === "string" && v.trim().length > 0 ? v.trim() : null;

const asStringArray = (v: unknown, max: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, max).map((x) => x.trim())
    : [];

/**
 * Strict validation of provider output. Anything the model got wrong fails the
 * run — a partially-understood response never becomes decisions, and never a
 * fabricated SKIP.
 */
export function validateTriageOutput(
  raw: unknown,
  expectedMints: string[],
  maxDeepResearch: number = TRIAGE_CONFIG.maxDeepResearch,
): TriageValidationResult {
  const errors: TriageValidationResult["errors"] = [];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, errors: [{ code: "NOT_AN_OBJECT", detail: typeof raw }], decisions: [] };
  }
  const list = (raw as Record<string, unknown>)["decisions"];
  if (!Array.isArray(list)) {
    return { ok: false, errors: [{ code: "MISSING_DECISIONS", detail: "decisions is not an array" }], decisions: [] };
  }

  const expected = new Set(expectedMints);
  const seen = new Set<string>();
  const decisions: TriageDecisionRecord[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object") {
      errors.push({ code: "NOT_AN_OBJECT", detail: "decision entry" });
      continue;
    }
    const row = entry as Record<string, unknown>;
    const mint = asString(row["mint"]);
    if (!mint || !expected.has(mint)) {
      errors.push({ code: "UNKNOWN_MINT", detail: String(mint) });
      continue;
    }
    if (seen.has(mint)) {
      errors.push({ code: "DUPLICATE_MINT", detail: mint });
      continue;
    }
    seen.add(mint);

    const decision = asString(row["decision"]) as TriageDecision | null;
    if (!decision || !MODEL_DECISIONS.includes(decision)) {
      errors.push({ code: "INVALID_DECISION", detail: `${mint}: ${String(row["decision"])}` });
      continue;
    }
    const confidence = asString(row["confidence"])?.toUpperCase() as TriageConfidence | undefined;
    if (!confidence || !["HIGH", "MEDIUM", "LOW"].includes(confidence)) {
      errors.push({ code: "INVALID_CONFIDENCE", detail: `${mint}: ${String(row["confidence"])}` });
      continue;
    }
    const rankRaw = row["research_priority_rank"];
    const rank = typeof rankRaw === "number" ? Math.trunc(rankRaw) : Number.NaN;
    if (!Number.isFinite(rank) || rank < 1) {
      errors.push({ code: "INVALID_RANK", detail: `${mint}: ${String(rankRaw)}` });
      continue;
    }
    const rationale = asString(row["rationale"]);
    if (!rationale) {
      errors.push({ code: "MISSING_RATIONALE", detail: mint });
      continue;
    }

    decisions.push({
      mint,
      decision,
      triageRank: rank,
      confidence,
      rationale: rationale.slice(0, 600),
      strongestPositive: asString(row["strongest_positive"])?.slice(0, 400) ?? null,
      strongestConcern: asString(row["strongest_concern"])?.slice(0, 400) ?? null,
      unresolvedQuestions: asStringArray(row["unresolved_questions"], 5).map((q) => q.slice(0, 300)),
      requestedResearchDomains: asStringArray(row["requested_research_domains"], 8),
    });
  }

  for (const mint of expectedMints) {
    if (!seen.has(mint)) errors.push({ code: "MISSING_MINT", detail: mint });
  }

  const deep = decisions.filter((d) => d.decision === "DEEP_RESEARCH").length;
  if (deep > maxDeepResearch) {
    errors.push({
      code: "DEEP_RESEARCH_LIMIT_EXCEEDED",
      detail: `${deep} > ${maxDeepResearch}`,
    });
  }

  // Normalize ranks to a dense 1..N ordering, preserving the model's order.
  const ordered = [...decisions].sort((a, b) => a.triageRank - b.triageRank);
  ordered.forEach((d, i) => {
    d.triageRank = i + 1;
  });

  return { ok: errors.length === 0, errors, decisions: ordered };
}

/** A decision joined with its Quant context, ready to persist and compare. */
export interface ComparedDecision extends TriageDecisionRecord {
  candidateSource: CandidateSource;
  researchPacketId: string | null;
  researchPacketVersion: string;
  quantPriority: number | null;
  quantRank: number | null;
  /** Positive = AI ranks it HIGHER (earlier) than Quant did. */
  rankDelta: number | null;
  setup: string;
  priceStructure: string;
  participation: string;
}

export function compareWithQuant(
  decisions: TriageDecisionRecord[],
  candidates: TriageCandidateInput[],
): ComparedDecision[] {
  const byMint = new Map(candidates.map((c) => [c.mint, c]));
  return decisions.map((d) => {
    const c = byMint.get(d.mint);
    const setups = ((readCompact(c?.compact ?? {}, ["scan", "setups"]) as string[]) ?? []).filter(
      (s) => s === "BASE" || s === "REACCEL",
    );
    return {
      ...d,
      candidateSource: c?.candidateSource ?? "EXPLORATION",
      researchPacketId: c?.researchPacketId ?? null,
      researchPacketVersion: c?.researchPacketVersion ?? "unknown",
      quantPriority: c?.quantPriority ?? null,
      quantRank: c?.quantRank ?? null,
      rankDelta: c?.quantRank ? c.quantRank - d.triageRank : null,
      setup: setups.length ? setups.join("+") : "NONE",
      priceStructure:
        (readCompact(c?.compact ?? {}, ["price_integrity", "status"]) as string) ?? "NOT_EVALUATED",
      participation:
        (readCompact(c?.compact ?? {}, ["participation", "status"]) as string) ?? "NOT_EVALUATED",
    };
  });
}

export type CalibrationWarning =
  | "AUTO_REJECTS_DAMAGED"
  | "AUTO_REJECTS_NONE"
  | "PREFERS_SURVIVORS"
  | "COPIES_QUANT_RANKING"
  | "TREATS_MISSING_EVIDENCE_AS_BEARISH";

export interface CalibrationAnalysis {
  candidateCount: number;
  decisionCounts: Record<string, number>;
  bySetup: Record<string, Record<string, number>>;
  byPriceStructure: Record<string, Record<string, number>>;
  byParticipation: Record<string, Record<string, number>>;
  topPromotions: { mint: string; quantRank: number | null; triageRank: number; rankDelta: number }[];
  topDemotions: { mint: string; quantRank: number | null; triageRank: number; rankDelta: number }[];
  nonePromoted: string[];
  highQuantSkipped: string[];
  lowQuantPromoted: string[];
  rankAgreement: number | null;
  warnings: CalibrationWarning[];
}

function tally(
  rows: ComparedDecision[],
  key: (r: ComparedDecision) => string,
): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const bucket = (out[key(r)] ??= {});
    bucket[r.decision] = (bucket[r.decision] ?? 0) + 1;
  }
  return out;
}

/** Descriptive calibration report. Warnings are signals, never failures. */
export function analyzeCalibration(rows: ComparedDecision[]): CalibrationAnalysis {
  const decisionCounts: Record<string, number> = {};
  for (const r of rows) decisionCounts[r.decision] = (decisionCounts[r.decision] ?? 0) + 1;

  const withDelta = rows.filter((r) => typeof r.rankDelta === "number");
  const ordered = [...withDelta].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0));
  const slim = (r: ComparedDecision) => ({
    mint: r.mint,
    quantRank: r.quantRank,
    triageRank: r.triageRank,
    rankDelta: r.rankDelta ?? 0,
  });

  const identical = withDelta.length > 0 && withDelta.every((r) => r.rankDelta === 0);
  const damaged = rows.filter((r) => r.priceStructure === "DAMAGED");
  const nones = rows.filter((r) => r.setup === "NONE");
  const survivors = rows.filter((r) => r.candidateSource === "SURVIVOR");
  const nonSurvivors = rows.filter((r) => r.candidateSource !== "SURVIVOR");
  const deepRate = (list: ComparedDecision[]) =>
    list.length === 0 ? null : list.filter((r) => r.decision === "DEEP_RESEARCH").length / list.length;

  const warnings: CalibrationWarning[] = [];
  if (damaged.length >= 3 && damaged.every((r) => r.decision === "SKIP")) {
    warnings.push("AUTO_REJECTS_DAMAGED");
  }
  if (nones.length >= 3 && nones.every((r) => r.decision === "SKIP")) {
    warnings.push("AUTO_REJECTS_NONE");
  }
  const sRate = deepRate(survivors);
  const nRate = deepRate(nonSurvivors);
  if (sRate !== null && nRate !== null && survivors.length >= 3 && nonSurvivors.length >= 3 && nRate === 0 && sRate > 0) {
    warnings.push("PREFERS_SURVIVORS");
  }
  if (identical) warnings.push("COPIES_QUANT_RANKING");
  const gapHeavy = rows.filter(
    (r) => r.priceStructure === "NOT_EVALUATED" || r.participation === "NOT_EVALUATED",
  );
  if (gapHeavy.length >= 3 && gapHeavy.every((r) => r.decision === "SKIP")) {
    warnings.push("TREATS_MISSING_EVIDENCE_AS_BEARISH");
  }

  const agreement = withDelta.length
    ? Math.round(
        (withDelta.reduce((sum, r) => sum + Math.abs(r.rankDelta ?? 0), 0) / withDelta.length) * 100,
      ) / 100
    : null;

  return {
    candidateCount: rows.length,
    decisionCounts,
    bySetup: tally(rows, (r) => r.setup),
    byPriceStructure: tally(rows, (r) => r.priceStructure),
    byParticipation: tally(rows, (r) => r.participation),
    topPromotions: ordered.filter((r) => (r.rankDelta ?? 0) > 0).slice(0, 5).map(slim),
    topDemotions: ordered
      .filter((r) => (r.rankDelta ?? 0) < 0)
      .slice(-5)
      .reverse()
      .map(slim),
    nonePromoted: nones.filter((r) => r.decision === "DEEP_RESEARCH").map((r) => r.mint),
    highQuantSkipped: rows
      .filter((r) => (r.quantRank ?? 999) <= 5 && r.decision === "SKIP")
      .map((r) => r.mint),
    lowQuantPromoted: rows
      .filter((r) => (r.quantRank ?? 0) > Math.max(10, rows.length / 2) && r.decision === "DEEP_RESEARCH")
      .map((r) => r.mint),
    rankAgreement: agreement,
    warnings,
  };
}
