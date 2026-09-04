/**
 * Exploration source-bias ablation analysis (pure).
 *
 * Question: are Exploration candidates skipped because of their evidence, or
 * because the model mechanically inherits the scanner's selection labels
 * (candidate_source, survivor flag, selection route, the literal setup label
 * NONE)? Everything here is deterministic analysis over decisions that were
 * already produced; nothing in this module calls a provider or writes state.
 */
import type { ComparedDecision, TriageDecision } from "./triage";

export type AblationVariant =
  | "BASELINE"
  | "SOURCE_BLIND"
  | "NEUTRAL_SETUP"
  | "COUNTERFACTUAL_SOURCE";

/** One run reduced to its decisions, keyed by mint. */
export type RunDecisions = Map<string, ComparedDecision>;

export function toRunDecisions(rows: ComparedDecision[]): RunDecisions {
  return new Map(rows.map((r) => [r.mint, r]));
}

export interface DecisionFrequency {
  mint: string;
  runs: number;
  DEEP_RESEARCH: number;
  WATCH: number;
  SKIP: number;
  deepRatePct: number;
  meanRank: number | null;
  modalDecision: TriageDecision | null;
}

/** Per-candidate decision frequency across repeated runs of one variant. */
export function decisionFrequencies(runs: RunDecisions[]): DecisionFrequency[] {
  const mints = new Set<string>();
  for (const run of runs) for (const mint of run.keys()) mints.add(mint);

  return [...mints].sort().map((mint) => {
    const seen = runs.map((r) => r.get(mint)).filter((d): d is ComparedDecision => Boolean(d));
    const counts: Record<string, number> = { DEEP_RESEARCH: 0, WATCH: 0, SKIP: 0 };
    let rankSum = 0;
    for (const d of seen) {
      counts[d.decision] = (counts[d.decision] ?? 0) + 1;
      rankSum += d.triageRank;
    }
    const modal = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null) as
      | TriageDecision
      | null;
    return {
      mint,
      runs: seen.length,
      DEEP_RESEARCH: counts["DEEP_RESEARCH"] ?? 0,
      WATCH: counts["WATCH"] ?? 0,
      SKIP: counts["SKIP"] ?? 0,
      deepRatePct: seen.length ? Math.round(((counts["DEEP_RESEARCH"] ?? 0) / seen.length) * 1000) / 10 : 0,
      meanRank: seen.length ? Math.round((rankSum / seen.length) * 100) / 100 : null,
      modalDecision: seen.length ? modal : null,
    };
  });
}

export interface GroupRates {
  n: number;
  runs: number;
  deepSelections: number;
  possibleSelections: number;
  deepRatePct: number;
  watchRatePct: number;
  skipRatePct: number;
  meanRank: number | null;
}

/** Aggregate decision rates for a subset of mints across repeated runs. */
export function groupRates(runs: RunDecisions[], mints: string[]): GroupRates {
  const set = new Set(mints);
  let deep = 0;
  let watch = 0;
  let skip = 0;
  let rankSum = 0;
  let total = 0;
  for (const run of runs) {
    for (const [mint, d] of run) {
      if (!set.has(mint)) continue;
      total += 1;
      rankSum += d.triageRank;
      if (d.decision === "DEEP_RESEARCH") deep += 1;
      else if (d.decision === "WATCH") watch += 1;
      else if (d.decision === "SKIP") skip += 1;
    }
  }
  const pct = (n: number) => (total ? Math.round((n / total) * 1000) / 10 : 0);
  return {
    n: mints.length,
    runs: runs.length,
    deepSelections: deep,
    possibleSelections: total,
    deepRatePct: pct(deep),
    watchRatePct: pct(watch),
    skipRatePct: pct(skip),
    meanRank: total ? Math.round((rankSum / total) * 100) / 100 : null,
  };
}

export interface VariantComparison {
  candidateCount: number;
  baselineRuns: number;
  variantRuns: number;
  /** Share of (mint, run-pair) comparisons where the modal decision is identical. */
  modalDecisionAgreementPct: number;
  decisionMixBaseline: Record<string, number>;
  decisionMixVariant: Record<string, number>;
  meanRankShift: number | null;
  medianAbsRankShift: number | null;
  /** Candidates whose modal decision changed between the two variants. */
  changedMints: {
    mint: string;
    from: TriageDecision | null;
    to: TriageDecision | null;
    baselineRank: number | null;
    variantRank: number | null;
  }[];
}

function mix(runs: RunDecisions[]): Record<string, number> {
  const counts: Record<string, number> = { DEEP_RESEARCH: 0, WATCH: 0, SKIP: 0 };
  let total = 0;
  for (const run of runs) {
    for (const d of run.values()) {
      counts[d.decision] = (counts[d.decision] ?? 0) + 1;
      total += 1;
    }
  }
  for (const key of Object.keys(counts)) {
    counts[key] = total ? Math.round(((counts[key] ?? 0) / total) * 1000) / 10 : 0;
  }
  return counts;
}

function medianOf(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/** Compare a variant against the baseline on modal decisions and mean rank. */
export function compareVariants(
  baseline: RunDecisions[],
  variant: RunDecisions[],
): VariantComparison {
  const base = new Map(decisionFrequencies(baseline).map((f) => [f.mint, f]));
  const test = new Map(decisionFrequencies(variant).map((f) => [f.mint, f]));
  const mints = [...base.keys()].filter((m) => test.has(m)).sort();

  let agree = 0;
  const shifts: number[] = [];
  const changed: VariantComparison["changedMints"] = [];

  for (const mint of mints) {
    const b = base.get(mint)!;
    const t = test.get(mint)!;
    if (b.modalDecision === t.modalDecision) agree += 1;
    else {
      changed.push({
        mint,
        from: b.modalDecision,
        to: t.modalDecision,
        baselineRank: b.meanRank,
        variantRank: t.meanRank,
      });
    }
    if (b.meanRank !== null && t.meanRank !== null) shifts.push(b.meanRank - t.meanRank);
  }

  const meanShift = shifts.length
    ? Math.round((shifts.reduce((a, b) => a + b, 0) / shifts.length) * 100) / 100
    : null;
  const medAbs = medianOf(shifts.map((s) => Math.abs(s)));

  return {
    candidateCount: mints.length,
    baselineRuns: baseline.length,
    variantRuns: variant.length,
    modalDecisionAgreementPct: mints.length ? Math.round((agree / mints.length) * 1000) / 10 : 0,
    decisionMixBaseline: mix(baseline),
    decisionMixVariant: mix(variant),
    meanRankShift: meanShift,
    medianAbsRankShift: medAbs === null ? null : Math.round(medAbs * 100) / 100,
    changedMints: changed,
  };
}

/* ------------------------------------------------------------------ *
 * Counterfactual pairing
 * ------------------------------------------------------------------ */

export interface PairCandidate {
  mint: string;
  candidateSource: string;
  marketCap: number | null;
  liquidityUsd: number | null;
}

export interface CounterfactualPair {
  explorationMint: string;
  survivorMint: string;
  /** Log-scale evidence distance; smaller is a closer match. */
  distance: number;
}

function logSafe(v: number | null | undefined): number | null {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.log10(v) : null;
}

/**
 * Greedily pair each Exploration candidate with the Survivor whose market cap
 * and liquidity are closest on a log scale, so the swap changes the label and
 * as little else as possible. Deterministic.
 */
export function chooseCounterfactualPairs(
  candidates: PairCandidate[],
  k: number,
): CounterfactualPair[] {
  const exploration = candidates
    .filter((c) => c.candidateSource === "EXPLORATION")
    .sort((a, b) => a.mint.localeCompare(b.mint));
  const survivors = candidates
    .filter((c) => c.candidateSource === "SURVIVOR")
    .sort((a, b) => a.mint.localeCompare(b.mint));

  const scored: CounterfactualPair[] = [];
  for (const e of exploration) {
    for (const s of survivors) {
      const em = logSafe(e.marketCap);
      const sm = logSafe(s.marketCap);
      const el = logSafe(e.liquidityUsd);
      const sl = logSafe(s.liquidityUsd);
      if (em === null || sm === null || el === null || sl === null) continue;
      const distance = Math.round((Math.abs(em - sm) + Math.abs(el - sl)) * 1000) / 1000;
      scored.push({ explorationMint: e.mint, survivorMint: s.mint, distance });
    }
  }
  scored.sort(
    (a, b) =>
      a.distance - b.distance ||
      a.explorationMint.localeCompare(b.explorationMint) ||
      a.survivorMint.localeCompare(b.survivorMint),
  );

  const usedE = new Set<string>();
  const usedS = new Set<string>();
  const out: CounterfactualPair[] = [];
  for (const pair of scored) {
    if (out.length >= k) break;
    if (usedE.has(pair.explorationMint) || usedS.has(pair.survivorMint)) continue;
    usedE.add(pair.explorationMint);
    usedS.add(pair.survivorMint);
    out.push(pair);
  }
  return out;
}

/** Swap map for a set of pairs: each side is presented as the other's source. */
export function swapMapFor(pairs: CounterfactualPair[]): Record<string, "SURVIVOR" | "EXPLORATION"> {
  const map: Record<string, "SURVIVOR" | "EXPLORATION"> = {};
  for (const p of pairs) {
    map[p.explorationMint] = "SURVIVOR";
    map[p.survivorMint] = "EXPLORATION";
  }
  return map;
}

export interface SwapEffect {
  mint: string;
  presentedAs: string;
  trueSource: string;
  baselineDeepRatePct: number;
  swappedDeepRatePct: number;
  deepRateDeltaPct: number;
  baselineMeanRank: number | null;
  swappedMeanRank: number | null;
  rankShift: number | null;
}

/** Per-mint effect of changing only the visible source label. */
export function swapEffects(
  baseline: RunDecisions[],
  swapped: RunDecisions[],
  swapMap: Record<string, string>,
  trueSource: Record<string, string>,
): SwapEffect[] {
  const base = new Map(decisionFrequencies(baseline).map((f) => [f.mint, f]));
  const test = new Map(decisionFrequencies(swapped).map((f) => [f.mint, f]));
  return Object.keys(swapMap)
    .sort()
    .map((mint) => {
      const b = base.get(mint);
      const t = test.get(mint);
      const rankShift =
        b?.meanRank !== null && b?.meanRank !== undefined && t?.meanRank !== null && t?.meanRank !== undefined
          ? Math.round((b.meanRank - t.meanRank) * 100) / 100
          : null;
      return {
        mint,
        presentedAs: swapMap[mint] ?? "UNKNOWN",
        trueSource: trueSource[mint] ?? "UNKNOWN",
        baselineDeepRatePct: b?.deepRatePct ?? 0,
        swappedDeepRatePct: t?.deepRatePct ?? 0,
        deepRateDeltaPct: Math.round(((t?.deepRatePct ?? 0) - (b?.deepRatePct ?? 0)) * 10) / 10,
        baselineMeanRank: b?.meanRank ?? null,
        swappedMeanRank: t?.meanRank ?? null,
        rankShift,
      };
    });
}
