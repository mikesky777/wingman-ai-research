/**
 * Calibration-only audit toolkit for AI Triage v1 (pure, deterministic).
 *
 * Nothing here influences production decisions, scanner selection,
 * Quantitative Research Priority or history. It exists to answer four
 * questions about the triage layer before Deep Research is built:
 *
 *   1. Is every claim grounded in the immutable Research Packet?
 *   2. Is missing evidence treated as "unknown" rather than "bad"?
 *   3. Is the layer mechanically biased by setup / structure / source?
 *   4. Is the layer stable enough across repeated identical runs?
 *
 * Classifications produced here (STABLE / BORDERLINE / UNSTABLE) are
 * analytical only and must not become production decision fields.
 */
import type { ComparedDecision, TriageDecision } from "./triage";

/* ------------------------------------------------------------------ *
 * 1. Unsupported-claim audit
 * ------------------------------------------------------------------ */

/** Evidence domains Wingman has NOT researched yet at Stage 2. */
export const UNRESEARCHED_DOMAIN_TERMS: { domain: string; patterns: RegExp[] }[] = [
  { domain: "LORE", patterns: [/\blore\b/i, /\bmeme quality\b/i, /\bmemetic\b/i] },
  { domain: "NARRATIVE", patterns: [/\bnarrative\b/i, /\bstory\b/i, /\bthes(is|es) of the meta\b/i] },
  { domain: "COMMUNITY", patterns: [/\bcommunity\b/i, /\bholders? are loyal\b/i, /\bdiscord\b/i, /\btelegram\b/i] },
  {
    domain: "SOCIAL_ATTENTION",
    patterns: [/\bmindshare\b/i, /\btwitter\b/i, /\bx\.com\b/i, /\bsocial\b/i, /\bviral\b/i, /\bhype\b/i, /\bbuzz\b/i, /\battention from\b/i],
  },
  { domain: "CATALYST", patterns: [/\bcatalyst\b/i, /\bannouncement\b/i, /\blisting\b/i, /\bpartnership\b/i, /\bairdrop\b/i] },
  { domain: "DEVELOPER_REPUTATION", patterns: [/\bdev(eloper)? (reputation|track record|history|is known)\b/i, /\brug(ger|ged|puller)\b/i, /\bserial deployer\b/i] },
  { domain: "NEWS", patterns: [/\bnews\b/i, /\bheadline\b/i, /\bpress\b/i] },
  { domain: "INFLUENCER", patterns: [/\binfluencer\b/i, /\bkol\b/i, /\bcalled by\b/i, /\bshill(ed|ing)?\b/i] },
  {
    domain: "HINDSIGHT_OUTCOME",
    patterns: [/\blater (ran|pumped|rallied|died)\b/i, /\bwent on to\b/i, /\bpeak(ed)? at\b/i, /\bafter the call\b/i, /\breturned \d/i, /\b\d+x\b/i],
  },
];

export type ClaimClass = "SUPPORTED_BY_PACKET" | "REASONABLE_COMPARATIVE_INFERENCE" | "UNSUPPORTED";

export interface ClaimFinding {
  mint: string;
  field: "rationale" | "strongest_positive" | "strongest_concern";
  domain: string;
  excerpt: string;
  classification: ClaimClass;
}

/**
 * Split a free-text field into sentence-level claims. Assertions live in
 * rationale / strongest_positive / strongest_concern. Unresolved questions
 * and requested research domains are REQUESTS for future research, so they
 * may legitimately name un-researched domains and are never audited here.
 */
function sentences(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/(?<=[.;!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Hedged/interrogative phrasing = a request for research, not an assertion. */
const HEDGE = /\b(unknown|unverified|unresolved|not (yet )?(known|researched|evaluated)|no evidence|cannot|can't|would need|requires? research|open question|unclear|to be (checked|verified))\b|\?/i;

export function auditClaims(rows: ComparedDecision[]): {
  totalClaimsAudited: number;
  unsupportedCount: number;
  affectedMints: string[];
  findings: ClaimFinding[];
  byDomain: Record<string, number>;
} {
  const findings: ClaimFinding[] = [];
  let total = 0;

  const fields: { key: ClaimFinding["field"]; read: (r: ComparedDecision) => string | null }[] = [
    { key: "rationale", read: (r) => r.rationale },
    { key: "strongest_positive", read: (r) => r.strongestPositive },
    { key: "strongest_concern", read: (r) => r.strongestConcern },
  ];

  for (const row of rows) {
    for (const field of fields) {
      for (const sentence of sentences(field.read(row))) {
        total += 1;
        for (const { domain, patterns } of UNRESEARCHED_DOMAIN_TERMS) {
          if (!patterns.some((p) => p.test(sentence))) continue;
          const hedged = HEDGE.test(sentence);
          findings.push({
            mint: row.mint,
            field: field.key,
            domain,
            excerpt: sentence.slice(0, 240),
            classification: hedged ? "REASONABLE_COMPARATIVE_INFERENCE" : "UNSUPPORTED",
          });
        }
      }
    }
  }

  const unsupported = findings.filter((f) => f.classification === "UNSUPPORTED");
  const byDomain: Record<string, number> = {};
  for (const f of unsupported) byDomain[f.domain] = (byDomain[f.domain] ?? 0) + 1;

  return {
    totalClaimsAudited: total,
    unsupportedCount: unsupported.length,
    affectedMints: [...new Set(unsupported.map((f) => f.mint))],
    findings,
    byDomain,
  };
}

/* ------------------------------------------------------------------ *
 * 2. Missing-evidence behaviour
 * ------------------------------------------------------------------ */

export type MissingEvidenceHandling =
  | "NEUTRAL_UNKNOWN"
  | "TREATED_AS_NEGATIVE"
  | "AMBIGUOUS"
  | "NOT_DISCUSSED";

const NEGATIVE_FRAMING =
  /\b(weak|poor|bad|deteriorat\w*|fail(s|ed|ing)?|unhealthy|toxic|dead|broken|damaged|risky|red flag|disqualif\w*)\b/i;

export interface MissingEvidenceRow {
  mint: string;
  gaps: string[];
  decision: TriageDecision;
  handling: MissingEvidenceHandling;
  excerpt: string | null;
}

export function auditMissingEvidence(rows: ComparedDecision[]): {
  candidatesWithGaps: number;
  counts: Record<MissingEvidenceHandling, number>;
  decisionRatesWithGaps: Record<string, number>;
  decisionRatesWithoutGaps: Record<string, number>;
  rows: MissingEvidenceRow[];
} {
  const out: MissingEvidenceRow[] = [];
  const withGaps: ComparedDecision[] = [];
  const withoutGaps: ComparedDecision[] = [];

  for (const r of rows) {
    const gaps: string[] = [];
    if (r.priceStructure === "NOT_EVALUATED" || r.priceStructure === "UNKNOWN") {
      gaps.push(`PRICE_STRUCTURE_${r.priceStructure}`);
    }
    if (r.participation === "NOT_EVALUATED" || r.participation === "UNKNOWN") {
      gaps.push(`PARTICIPATION_${r.participation}`);
    }
    if (gaps.length === 0) {
      withoutGaps.push(r);
      continue;
    }
    withGaps.push(r);

    const text = [r.rationale, r.strongestConcern].filter(Boolean).join(" ");
    const gapSentences = sentences(text).filter((s) =>
      /(not[_ ]evaluated|unknown|no data|unavailable|missing|absent|gap|insufficient)/i.test(s),
    );
    let handling: MissingEvidenceHandling = "NOT_DISCUSSED";
    let excerpt: string | null = null;
    if (gapSentences.length > 0) {
      excerpt = gapSentences[0]!.slice(0, 240);
      const negative = gapSentences.some((s) => NEGATIVE_FRAMING.test(s));
      const hedged = gapSentences.some((s) => HEDGE.test(s));
      handling = negative && !hedged ? "TREATED_AS_NEGATIVE" : negative ? "AMBIGUOUS" : "NEUTRAL_UNKNOWN";
    }
    out.push({ mint: r.mint, gaps, decision: r.decision, handling, excerpt });
  }

  const counts: Record<MissingEvidenceHandling, number> = {
    NEUTRAL_UNKNOWN: 0,
    TREATED_AS_NEGATIVE: 0,
    AMBIGUOUS: 0,
    NOT_DISCUSSED: 0,
  };
  for (const r of out) counts[r.handling] += 1;

  return {
    candidatesWithGaps: withGaps.length,
    counts,
    decisionRatesWithGaps: decisionRates(withGaps),
    decisionRatesWithoutGaps: decisionRates(withoutGaps),
    rows: out,
  };
}

function decisionRates(rows: ComparedDecision[]): Record<string, number> {
  const out: Record<string, number> = { DEEP_RESEARCH: 0, WATCH: 0, SKIP: 0 };
  for (const r of rows) out[r.decision] = (out[r.decision] ?? 0) + 1;
  if (rows.length === 0) return out;
  for (const key of Object.keys(out)) out[key] = Math.round((out[key]! / rows.length) * 1000) / 10;
  return out;
}

/* ------------------------------------------------------------------ *
 * 3. Semantic bias
 * ------------------------------------------------------------------ */

export type BiasFlag =
  | "ALL_NONE_DEMOTED"
  | "ALL_DAMAGED_SKIPPED"
  | "ALL_SURVIVORS_PROMOTED"
  | "MISSING_EVIDENCE_PENALIZED"
  | "QUANT_ORDER_COPIED";

export interface BiasBucket {
  bucket: string;
  n: number;
  DEEP_RESEARCH: number;
  WATCH: number;
  SKIP: number;
  deepRatePct: number;
}

function buckets(rows: ComparedDecision[], key: (r: ComparedDecision) => string): BiasBucket[] {
  const map = new Map<string, ComparedDecision[]>();
  for (const r of rows) {
    const k = key(r);
    map.set(k, [...(map.get(k) ?? []), r]);
  }
  return [...map.entries()]
    .map(([bucket, list]) => ({
      bucket,
      n: list.length,
      DEEP_RESEARCH: list.filter((r) => r.decision === "DEEP_RESEARCH").length,
      WATCH: list.filter((r) => r.decision === "WATCH").length,
      SKIP: list.filter((r) => r.decision === "SKIP").length,
      deepRatePct:
        list.length === 0
          ? 0
          : Math.round((list.filter((r) => r.decision === "DEEP_RESEARCH").length / list.length) * 1000) / 10,
    }))
    .sort((a, b) => b.n - a.n);
}

/** Source dimension: Survivor / BASE non-Survivor / REACCEL non-Survivor / Exploration. */
export function sourceBucket(r: ComparedDecision): string {
  if (r.candidateSource === "SURVIVOR") return "SURVIVOR";
  if (r.setup.includes("REACCEL")) return "REACCEL_NON_SURVIVOR";
  if (r.setup.includes("BASE")) return "BASE_NON_SURVIVOR";
  return "EXPLORATION";
}

export function auditBias(rows: ComparedDecision[]): {
  bySetup: BiasBucket[];
  byPriceStructure: BiasBucket[];
  byParticipation: BiasBucket[];
  bySource: BiasBucket[];
  flags: BiasFlag[];
} {
  const bySetup = buckets(rows, (r) => r.setup);
  const byPriceStructure = buckets(rows, (r) => r.priceStructure);
  const byParticipation = buckets(rows, (r) => r.participation);
  const bySource = buckets(rows, sourceBucket);

  const flags: BiasFlag[] = [];
  const none = rows.filter((r) => r.setup === "NONE");
  if (none.length >= 3 && none.every((r) => r.decision !== "DEEP_RESEARCH")) flags.push("ALL_NONE_DEMOTED");
  const damaged = rows.filter((r) => r.priceStructure === "DAMAGED");
  if (damaged.length >= 3 && damaged.every((r) => r.decision === "SKIP")) flags.push("ALL_DAMAGED_SKIPPED");
  const survivors = rows.filter((r) => r.candidateSource === "SURVIVOR");
  if (survivors.length >= 3 && survivors.every((r) => r.decision === "DEEP_RESEARCH")) {
    flags.push("ALL_SURVIVORS_PROMOTED");
  }
  const gapped = rows.filter(
    (r) =>
      r.priceStructure === "NOT_EVALUATED" ||
      r.participation === "NOT_EVALUATED" ||
      r.priceStructure === "UNKNOWN" ||
      r.participation === "UNKNOWN",
  );
  if (gapped.length >= 3 && gapped.every((r) => r.decision === "SKIP")) flags.push("MISSING_EVIDENCE_PENALIZED");
  const withRank = rows.filter((r) => typeof r.quantRank === "number");
  if (withRank.length >= 5 && withRank.every((r) => r.rankDelta === 0)) flags.push("QUANT_ORDER_COPIED");

  return { bySetup, byPriceStructure, byParticipation, bySource, flags };
}

/* ------------------------------------------------------------------ *
 * 4. Comparative value: Quant rank vs AI rank
 * ------------------------------------------------------------------ */

export function spearman(a: number[], b: number[]): number | null {
  const n = a.length;
  if (n < 2 || b.length !== n) return null;
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i += 1) {
    const x = a[i]! - ma;
    const y = b[i]! - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da === 0 || db === 0) return null;
  return Math.round((num / Math.sqrt(da * db)) * 1000) / 1000;
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((x, y) => x - y);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

export interface MoveRow {
  mint: string;
  setup: string;
  source: string;
  quantPriority: number | null;
  quantRank: number | null;
  triageRank: number;
  rankDelta: number;
  decision: TriageDecision;
  confidence: string;
  priceStructure: string;
  participation: string;
  rationale: string;
  strongestPositive: string | null;
  strongestConcern: string | null;
  unresolvedQuestions: string[];
  requestedResearchDomains: string[];
}

function moveRow(r: ComparedDecision): MoveRow {
  return {
    mint: r.mint,
    setup: r.setup,
    source: r.candidateSource,
    quantPriority: r.quantPriority,
    quantRank: r.quantRank,
    triageRank: r.triageRank,
    rankDelta: r.rankDelta ?? 0,
    decision: r.decision,
    confidence: r.confidence,
    priceStructure: r.priceStructure,
    participation: r.participation,
    rationale: r.rationale,
    strongestPositive: r.strongestPositive,
    strongestConcern: r.strongestConcern,
    unresolvedQuestions: r.unresolvedQuestions,
    requestedResearchDomains: r.requestedResearchDomains,
  };
}

export function auditComparativeValue(
  rows: ComparedDecision[],
  options: { highQuantRank?: number; lowQuantRank?: number } = {},
): {
  rankCorrelation: number | null;
  medianAbsRankMove: number | null;
  maxAbsRankMove: number;
  topPromotions: MoveRow[];
  topDemotions: MoveRow[];
  highQuantSkipped: MoveRow[];
  lowQuantPromoted: MoveRow[];
} {
  const high = options.highQuantRank ?? 10;
  const low = options.lowQuantRank ?? Math.max(10, Math.floor(rows.length / 2));
  const ranked = rows.filter((r) => typeof r.quantRank === "number");
  const deltas = ranked.map((r) => Math.abs(r.rankDelta ?? 0));
  const ordered = [...ranked].sort((a, b) => (b.rankDelta ?? 0) - (a.rankDelta ?? 0));

  return {
    rankCorrelation: spearman(ranked.map((r) => r.quantRank!), ranked.map((r) => r.triageRank)),
    medianAbsRankMove: median(deltas),
    maxAbsRankMove: deltas.length ? Math.max(...deltas) : 0,
    topPromotions: ordered.filter((r) => (r.rankDelta ?? 0) > 0).slice(0, 10).map(moveRow),
    topDemotions: ordered
      .filter((r) => (r.rankDelta ?? 0) < 0)
      .slice(-10)
      .reverse()
      .map(moveRow),
    highQuantSkipped: rows
      .filter((r) => (r.quantRank ?? Infinity) <= high && r.decision === "SKIP")
      .map(moveRow),
    lowQuantPromoted: rows
      .filter((r) => (r.quantRank ?? 0) > low && r.decision === "DEEP_RESEARCH")
      .map(moveRow),
  };
}

/* ------------------------------------------------------------------ *
 * 5/6. Repeatability and stability
 * ------------------------------------------------------------------ */

export type StabilityClass = "STABLE" | "BORDERLINE" | "UNSTABLE";

export interface StabilityRow {
  mint: string;
  setup: string;
  decisions: TriageDecision[];
  counts: Record<string, number>;
  modalDecision: TriageDecision;
  modalSharePct: number;
  ranks: number[];
  meanRank: number;
  rankSpread: number;
  classification: StabilityClass;
}

export interface StabilityReport {
  runs: number;
  candidateCount: number;
  deepCountsPerRun: number[];
  meanDecisionAgreementPct: number;
  shortlistOverlapPct: number[];
  shortlistIntersectionSize: number;
  shortlistUnionSize: number;
  top5OverlapPct: number[];
  top10OverlapPct: number[];
  meanRankCorrelation: number | null;
  deepSkipSwitchers: string[];
  deepWatchSwitchers: string[];
  classification: Record<StabilityClass, number>;
  rows: StabilityRow[];
}

/**
 * Methodology: for each candidate, collect its decision and rank across all
 * identical runs. STABLE = one decision in every run. BORDERLINE = exactly two
 * distinct decisions AND those two are adjacent on the research-priority axis
 * (DEEP_RESEARCH/WATCH or WATCH/SKIP). UNSTABLE = three distinct decisions, or
 * both DEEP_RESEARCH and SKIP appearing for the same candidate.
 */
export function classifyStability(decisions: TriageDecision[]): StabilityClass {
  const distinct = new Set(decisions);
  if (distinct.size <= 1) return "STABLE";
  if (distinct.has("DEEP_RESEARCH") && distinct.has("SKIP")) return "UNSTABLE";
  if (distinct.size === 2) return "BORDERLINE";
  return "UNSTABLE";
}

function overlapPct(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 100;
  const setB = new Set(b);
  const inter = a.filter((x) => setB.has(x)).length;
  const union = new Set([...a, ...b]).size;
  return union === 0 ? 100 : Math.round((inter / union) * 1000) / 10;
}

export function buildStabilityReport(runs: ComparedDecision[][]): StabilityReport {
  const perMint = new Map<string, { setup: string; decisions: TriageDecision[]; ranks: number[] }>();
  for (const run of runs) {
    for (const d of run) {
      const entry = perMint.get(d.mint) ?? { setup: d.setup, decisions: [], ranks: [] };
      entry.decisions.push(d.decision);
      entry.ranks.push(d.triageRank);
      perMint.set(d.mint, entry);
    }
  }

  const rows: StabilityRow[] = [...perMint.entries()].map(([mint, e]) => {
    const counts: Record<string, number> = {};
    for (const d of e.decisions) counts[d] = (counts[d] ?? 0) + 1;
    const modal = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]!;
    return {
      mint,
      setup: e.setup,
      decisions: e.decisions,
      counts,
      modalDecision: modal[0] as TriageDecision,
      modalSharePct: Math.round((modal[1] / e.decisions.length) * 1000) / 10,
      ranks: e.ranks,
      meanRank: Math.round((e.ranks.reduce((s, r) => s + r, 0) / e.ranks.length) * 10) / 10,
      rankSpread: Math.max(...e.ranks) - Math.min(...e.ranks),
      classification: classifyStability(e.decisions),
    };
  });

  const shortlists = runs.map((run) =>
    run.filter((d) => d.decision === "DEEP_RESEARCH").map((d) => d.mint).sort(),
  );
  const topN = (run: ComparedDecision[], n: number) =>
    [...run].sort((a, b) => a.triageRank - b.triageRank).slice(0, n).map((d) => d.mint);

  const pairOverlaps: number[] = [];
  const top5: number[] = [];
  const top10: number[] = [];
  const correlations: number[] = [];
  for (let i = 0; i < runs.length; i += 1) {
    for (let j = i + 1; j < runs.length; j += 1) {
      pairOverlaps.push(overlapPct(shortlists[i]!, shortlists[j]!));
      top5.push(overlapPct(topN(runs[i]!, 5), topN(runs[j]!, 5)));
      top10.push(overlapPct(topN(runs[i]!, 10), topN(runs[j]!, 10)));
      const mapJ = new Map(runs[j]!.map((d) => [d.mint, d.triageRank]));
      const shared = runs[i]!.filter((d) => mapJ.has(d.mint));
      const c = spearman(shared.map((d) => d.triageRank), shared.map((d) => mapJ.get(d.mint)!));
      if (c !== null) correlations.push(c);
    }
  }

  const intersection = shortlists.length
    ? shortlists.reduce((acc, list) => acc.filter((m) => list.includes(m)))
    : [];
  const union = new Set(shortlists.flat());

  const agreement = rows.length
    ? Math.round((rows.reduce((s, r) => s + r.modalSharePct, 0) / rows.length) * 10) / 10
    : 0;

  const classification: Record<StabilityClass, number> = { STABLE: 0, BORDERLINE: 0, UNSTABLE: 0 };
  for (const r of rows) classification[r.classification] += 1;

  return {
    runs: runs.length,
    candidateCount: rows.length,
    deepCountsPerRun: shortlists.map((s) => s.length),
    meanDecisionAgreementPct: agreement,
    shortlistOverlapPct: pairOverlaps,
    shortlistIntersectionSize: intersection.length,
    shortlistUnionSize: union.size,
    top5OverlapPct: top5,
    top10OverlapPct: top10,
    meanRankCorrelation: correlations.length
      ? Math.round((correlations.reduce((s, c) => s + c, 0) / correlations.length) * 1000) / 1000
      : null,
    deepSkipSwitchers: rows
      .filter((r) => new Set(r.decisions).has("DEEP_RESEARCH") && new Set(r.decisions).has("SKIP"))
      .map((r) => r.mint),
    deepWatchSwitchers: rows
      .filter(
        (r) =>
          new Set(r.decisions).size === 2 &&
          new Set(r.decisions).has("DEEP_RESEARCH") &&
          new Set(r.decisions).has("WATCH"),
      )
      .map((r) => r.mint),
    classification,
    rows,
  };
}
