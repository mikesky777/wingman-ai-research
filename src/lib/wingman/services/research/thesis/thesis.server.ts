/**
 * Thesis Synthesis v1 orchestrator (server-only).
 *
 * Input:  immutable Research Packet + AI triage provenance + the latest
 *         completed Deep Research report + CURRENT operational eligibility.
 * Output: an append-only thesis report (component scores, Thesis Score,
 *         Evidence Confidence, bull/bear synthesis, invalidation, verdict).
 *
 * This stage never modifies scanner scoring, Quantitative Research Priority,
 * setup definitions, Survivor selection, AI triage or Deep Research evidence,
 * and never produces an Entry State, position size, stop loss or trade action.
 * Calibration runs are dry runs: flagged, history-free, THESIS_CALL-free.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAiStageMilestone } from "../../history/milestones.server";
import { assessResearchEligibility } from "../packet";
import { loadCurrentMarkets, loadRunCandidates, type LoadedCandidate } from "../packet.server";
import type { ResearchDossier } from "../deep/contracts";
import {
  OPPORTUNITY_POLICY,
  THESIS_COMPONENTS,
  THESIS_INPUT_POLICY_VERSION,
  THESIS_POLICY_VERSION,
  THESIS_PROMPT_VERSION,
  THESIS_RUBRIC_VERSION,
  buildThesisSystemPrompt,
  buildThesisUserPrompt,
  computeEvidenceConfidence,
  deriveVerdict,
  redactCompactForThesis,
  selectOpportunities,
  validateThesisOutput,
  type BearSeverity,
  type CatalystKind,
  type ComponentScores,
  type EvidenceConfidenceBreakdown,
  type ThesisSections,
  type ThesisStatus,
  type ThesisVerdict,
  type ValidationIssue,
} from "./contracts";
import {
  createLovableThesisProvider,
  parseThesisJson,
  type ThesisProvider,
} from "./provider.server";

type Row = Record<string, unknown>;

export type ThesisMode = "production" | "calibration";

export type ThesisRunCode =
  | "OK"
  | "NO_DEEP_RESEARCH_REPORTS"
  | "NO_ELIGIBLE_CANDIDATES"
  | "MISSING_API_KEY";

export interface ThesisCandidateResult {
  mint: string;
  symbol: string | null;
  name: string | null;
  status: ThesisStatus;
  reportId: string | null;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: ThesisVerdict | null;
  bearSeverity: BearSeverity | null;
  components: ComponentScores | null;
  qualifiedAsOpportunity: boolean;
  thesisCallCreated: boolean;
  blockedReasons: string[];
  validationIssues: ValidationIssue[];
  error: string | null;
}

export interface ThesisBatchResult {
  mode: ThesisMode;
  code: ThesisRunCode;
  isCalibration: boolean;
  runId: string | null;
  policyVersion: string;
  promptVersion: string;
  inputPolicyVersion: string;
  modelProvider: string | null;
  modelIdentifier: string | null;
  requested: number;
  completed: number;
  insufficient: number;
  blocked: number;
  failed: number;
  opportunities: number;
  thesisCalls: number;
  candidates: ThesisCandidateResult[];
}

export interface RunThesisSynthesisOptions {
  mode?: ThesisMode;
  limit?: number;
  /** Production: restrict the cohort to one production triage run's shortlist. */
  triageRunId?: string;
  /** Calibration only: synthesize a specific set of deep research report ids. */
  reportIds?: string[];
  provider?: ThesisProvider;
}

interface ThesisInputCandidate {
  reportId: string;
  deepResearchRunId: string;
  tokenId: string | null;
  mint: string;
  chain: string;
  symbol: string | null;
  name: string | null;
  dossier: ResearchDossier | null;
  dossierStatus: string;
  isCalibration: boolean;
  triageRunId: string | null;
  triageDecisionId: string | null;
  researchPacketId: string | null;
  researchPacketVersion: string | null;
  shortlistMilestoneId: string | null;
  sourceScanId: string | null;
  searchUnavailable: boolean;
  coverage: ResearchDossier["coverage"] | null;
  createdAt: string;
}

/**
 * Deep research reports that may enter a synthesis, with run provenance.
 *
 * Production is COHORT-SCOPED: only reports whose deep-research run belongs to
 * the exact active triage run are loaded. There is no global-newest fallback,
 * so a previous cohort's dossier can never reach the model.
 */
async function loadThesisInputs(options: {
  isCalibration: boolean;
  reportIds?: string[];
  triageRunId?: string | null;
}): Promise<ThesisInputCandidate[]> {
  let cohortRunIds: string[] | null = null;
  if (!options.isCalibration && !options.reportIds?.length) {
    if (!options.triageRunId) return [];
    const { data: cohortRuns, error: cohortError } = await supabaseAdmin
      .from("deep_research_runs")
      .select("id")
      .eq("triage_run_id", options.triageRunId)
      .eq("is_calibration", false);
    if (cohortError) throw new Error(cohortError.message);
    cohortRunIds = ((cohortRuns as Row[]) ?? []).map((r) => r["id"] as string);
    if (cohortRunIds.length === 0) return [];
  }

  let query = supabaseAdmin
    .from("deep_research_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(60);
  if (options.reportIds?.length) query = query.in("id", options.reportIds);
  else if (cohortRunIds) query = query.in("deep_research_run_id", cohortRunIds).eq("is_calibration", false);
  else if (!options.isCalibration) query = query.eq("is_calibration", false);

  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const reports = (data as Row[]) ?? [];
  if (reports.length === 0) return [];

  const runIds = [...new Set(reports.map((r) => r["deep_research_run_id"] as string))];
  const { data: runData, error: runError } = await supabaseAdmin
    .from("deep_research_runs")
    .select(
      "id, triage_run_id, triage_decision_id, research_packet_id, research_packet_version, shortlist_milestone_id, status, diagnostics",
    )
    .in("id", runIds);
  if (runError) throw new Error(runError.message);
  const runs = new Map((runData as Row[] | null ?? []).map((r) => [r["id"] as string, r]));

  const triageIds = [
    ...new Set(
      (runData as Row[] | null ?? [])
        .map((r) => r["triage_run_id"] as string | null)
        .filter((v): v is string => Boolean(v)),
    ),
  ];
  const triageScans = new Map<string, string | null>();
  if (triageIds.length) {
    const { data: triageRuns } = await supabaseAdmin
      .from("ai_triage_runs")
      .select("id, source_scan_id, is_calibration")
      .in("id", triageIds);
    for (const t of (triageRuns as Row[] | null) ?? []) {
      triageScans.set(t["id"] as string, (t["source_scan_id"] as string) ?? null);
    }
  }

  const seen = new Set<string>();
  const out: ThesisInputCandidate[] = [];
  for (const r of reports) {
    const mint = r["mint"] as string;
    const run = runs.get(r["deep_research_run_id"] as string) ?? null;
    if (!options.isCalibration) {
      // Production only synthesises completed shortlist research with full provenance.
      const status = (run?.["status"] as string) ?? "";
      if (status !== "completed") continue;
      if (!run?.["shortlist_milestone_id"]) continue;
      if (!run?.["research_packet_id"]) continue;
    }
    if (seen.has(mint)) continue; // newest report per mint only
    seen.add(mint);
    const diagnostics = (run?.["diagnostics"] as Record<string, unknown> | null) ?? null;
    const dossier = (r["dossier"] as unknown as ResearchDossier) ?? null;
    const triageRunId = (run?.["triage_run_id"] as string) ?? null;
    out.push({
      reportId: r["id"] as string,
      deepResearchRunId: r["deep_research_run_id"] as string,
      tokenId: (r["token_id"] as string) ?? null,
      mint,
      chain: (r["chain"] as string) ?? "solana",
      symbol: dossier?.symbol ?? null,
      name: dossier?.name ?? null,
      dossier,
      dossierStatus: (r["status"] as string) ?? "unknown",
      isCalibration: Boolean(r["is_calibration"]),
      triageRunId,
      triageDecisionId: (run?.["triage_decision_id"] as string) ?? null,
      researchPacketId: (run?.["research_packet_id"] as string) ?? null,
      researchPacketVersion: (run?.["research_packet_version"] as string) ?? null,
      shortlistMilestoneId: (run?.["shortlist_milestone_id"] as string) ?? null,
      sourceScanId: triageRunId ? (triageScans.get(triageRunId) ?? null) : null,
      searchUnavailable:
        (r["status"] as string) === "search_unavailable" ||
        Boolean(diagnostics?.["externalSearchUnavailable"]),
      coverage: dossier?.coverage ?? null,
      createdAt: (r["created_at"] as string) ?? "",
    });
  }
  return out;
}

async function loadCompactPacket(
  packetId: string | null,
): Promise<{ compact: Record<string, unknown>; gaps: string[]; stale: boolean } | null> {
  if (!packetId) return null;
  const { data, error } = await supabaseAdmin
    .from("research_packets")
    .select("compact, evidence_gaps, packet")
    .eq("id", packetId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const row = data as Row;
  const packet = row["packet"] as Record<string, unknown> | null;
  const market = (packet?.["market"] ?? null) as Record<string, unknown> | null;
  return {
    compact: (row["compact"] as Record<string, unknown>) ?? {},
    gaps: (row["evidence_gaps"] as string[]) ?? [],
    stale: Boolean(market?.["stale"]),
  };
}

async function loadTriageDecision(decisionId: string | null) {
  if (!decisionId) return null;
  const { data } = await supabaseAdmin
    .from("ai_triage_decisions")
    .select("decision, confidence, rationale, unresolved_questions")
    .eq("id", decisionId)
    .maybeSingle();
  if (!data) return null;
  const r = data as Row;
  return {
    decision: (r["decision"] as string) ?? "UNKNOWN",
    confidence: (r["confidence"] as string) ?? null,
    rationale: (r["rationale"] as string) ?? null,
    unresolvedQuestions: (r["unresolved_questions"] as string[]) ?? [],
  };
}

async function hasShortlistMilestone(tokenId: string | null): Promise<boolean> {
  if (!tokenId) return false;
  const { data } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id")
    .eq("token_id", tokenId)
    .eq("stage", "AI_SHORTLIST")
    .limit(1)
    .maybeSingle();
  return Boolean(data);
}

interface SynthesizedCandidate {
  input: ThesisInputCandidate;
  status: ThesisStatus;
  blockedReasons: string[];
  components: ComponentScores | null;
  thesisScore: number | null;
  evidence: EvidenceConfidenceBreakdown | null;
  verdict: ThesisVerdict | null;
  bearSeverity: BearSeverity | null;
  text: {
    oneSentenceThesis: string | null;
    narrativeThesis: string | null;
    sections: ThesisSections | null;
    strongestBullCase: string | null;
    strongestBearCase: string | null;
    strongestCatalyst: string | null;
    catalystKind: CatalystKind;
    whyNowMarketSignal: string | null;
    strongestConcern: string | null;
    catalysts: string[];
    invalidation: string[];
    evidenceGaps: string[];
    supportingClaimRefs: string[];
    supportingSourceRefs: string[];
  };
  eligibility: { researchEligibleNow: boolean; exclusionReasons: string[] };
  market: { marketCap: number | null; priceUsd: number | null; liquidityUsd: number | null };
  setups: string[];
  independentSourceCount: number;
  validationIssues: ValidationIssue[];
  diagnostics: Record<string, unknown>;
  error: string | null;
}

function emptyText(): SynthesizedCandidate["text"] {
  return {
    oneSentenceThesis: null,
    narrativeThesis: null,
    sections: null,
    strongestBullCase: null,
    strongestBearCase: null,
    strongestCatalyst: null,
    catalystKind: "NONE",
    whyNowMarketSignal: null,
    strongestConcern: null,
    catalysts: [],
    invalidation: [],
    evidenceGaps: [],
    supportingClaimRefs: [],
    supportingSourceRefs: [],
  };
}

export async function runThesisSynthesis(
  options: RunThesisSynthesisOptions = {},
): Promise<ThesisBatchResult> {
  const mode: ThesisMode = options.mode ?? "calibration";
  const isCalibration = mode === "calibration";

  let provider = options.provider ?? null;
  if (!provider) {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) return emptyBatch(mode, "MISSING_API_KEY", null);
    provider = createLovableThesisProvider({ apiKey });
  }

  // Production always resolves the ACTIVE cohort itself. A caller-supplied
  // triage run may only narrow to the active one, never to a historical one.
  let activeScanId: string | null = null;
  let activeTriageRunId: string | null = options.triageRunId ?? null;
  if (!isCalibration) {
    const { loadActiveResearchCohort } = await import("../cohort.server");
    const active = await loadActiveResearchCohort();
    if (!active.scan || !active.triageRunId) {
      return emptyBatch(mode, "NO_DEEP_RESEARCH_REPORTS", provider);
    }
    if (activeTriageRunId && activeTriageRunId !== active.triageRunId) {
      return emptyBatch(mode, "THESIS_INPUT_PROVENANCE_MISMATCH", provider);
    }
    activeScanId = active.scan.id;
    activeTriageRunId = active.triageRunId;
  }

  const inputs = await loadThesisInputs({
    isCalibration,
    ...(options.reportIds?.length ? { reportIds: options.reportIds } : {}),
    ...(activeTriageRunId ? { triageRunId: activeTriageRunId } : {}),
  });
  const cohort = activeTriageRunId
    ? inputs.filter((c) => c.triageRunId === activeTriageRunId)
    : inputs;
  if (cohort.length === 0) return emptyBatch(mode, "NO_DEEP_RESEARCH_REPORTS", provider);

  const limit = Math.min(Math.max(options.limit ?? 3, 1), 15);
  const selected = cohort.slice(0, limit);

  // HARD provenance gate, before any model spend: every input must resolve to
  // the exact active scan AND the exact active triage run.
  if (!isCalibration) {
    const assertion = assertThesisInputProvenance(
      selected.map((c) => ({
        reportId: c.reportId,
        mint: c.mint,
        triageRunId: c.triageRunId,
        sourceScanId: c.sourceScanId,
      })),
      { scanId: activeScanId, triageRunId: activeTriageRunId },
    );
    if (!assertion.ok) return emptyBatch(mode, "THESIS_INPUT_PROVENANCE_MISMATCH", provider);
  }

  // Current eligibility is re-checked against the scan the packets came from.
  const scanIds = [...new Set(selected.map((c) => c.sourceScanId).filter((v): v is string => Boolean(v)))];
  const byMint = new Map<string, LoadedCandidate>();
  const tokenIds: string[] = [];
  for (const scanId of scanIds) {
    for (const candidate of await loadRunCandidates(scanId)) {
      if (candidate.contractAddress && !byMint.has(candidate.contractAddress)) {
        byMint.set(candidate.contractAddress, candidate);
        tokenIds.push(candidate.tokenId);
      }
    }
  }
  const markets = await loadCurrentMarkets(tokenIds);

  const runId = await insertRun({ isCalibration, provider, inputs: selected });

  const synthesized: SynthesizedCandidate[] = [];
  for (const input of selected) {
    try {
      synthesized.push(
        await synthesizeCandidate({ input, provider, isCalibration, byMint, markets }),
      );
    } catch (error) {
      synthesized.push({
        input,
        status: "failed",
        blockedReasons: [],
        components: null,
        thesisScore: null,
        evidence: null,
        verdict: null,
        bearSeverity: null,
        text: emptyText(),
        eligibility: { researchEligibleNow: false, exclusionReasons: [] },
        market: { marketCap: null, priceUsd: null, liquidityUsd: null },
        setups: [],
        independentSourceCount: 0,
        validationIssues: [],
        diagnostics: {},
        error: error instanceof Error ? error.message.slice(0, 400) : "Unknown error",
      });
    }
  }

  // Opportunity policy runs across the batch AFTER every synthesis, so no
  // candidate is promoted merely for topping a weak cohort.
  const qualifying = isCalibration
    ? []
    : selectOpportunities(
        synthesized
          .filter((s) => s.status === "completed" && s.thesisScore !== null && s.evidence && s.verdict)
          .map((s) => ({
            mint: s.input.mint,
            thesisScore: s.thesisScore as number,
            evidenceConfidence: (s.evidence as EvidenceConfidenceBreakdown).score,
            verdict: s.verdict as ThesisVerdict,
            bearSeverity: (s.bearSeverity ?? "HIGH") as BearSeverity,
            independentSourceCount: s.independentSourceCount,
            eligibleNow: s.eligibility.researchEligibleNow,
          })),
      );
  const qualifyingMints = new Set(qualifying.map((q) => q.mint));

  const results: ThesisCandidateResult[] = [];
  let thesisCalls = 0;
  for (const s of synthesized) {
    const qualified = qualifyingMints.has(s.input.mint);
    let thesisCallMilestoneId: string | null = null;

    if (qualified && !isCalibration && s.input.tokenId) {
      thesisCallMilestoneId = await recordThesisCall({
        candidate: s,
        runId,
        provider,
      });
      if (thesisCallMilestoneId) thesisCalls += 1;
    }

    const reportId = await insertReport({
      runId,
      candidate: s,
      isCalibration,
      provider,
      qualified,
      thesisCallMilestoneId,
    });

    results.push({
      mint: s.input.mint,
      symbol: s.input.symbol,
      name: s.input.name,
      status: s.status,
      reportId,
      thesisScore: s.thesisScore,
      evidenceConfidence: s.evidence?.score ?? null,
      verdict: s.verdict,
      bearSeverity: s.bearSeverity,
      components: s.components,
      qualifiedAsOpportunity: qualified,
      thesisCallCreated: Boolean(thesisCallMilestoneId),
      blockedReasons: s.blockedReasons,
      validationIssues: s.validationIssues,
      error: s.error,
    });
  }

  const batch: ThesisBatchResult = {
    mode,
    code: "OK",
    isCalibration,
    runId,
    policyVersion: THESIS_POLICY_VERSION,
    promptVersion: THESIS_PROMPT_VERSION,
    inputPolicyVersion: THESIS_INPUT_POLICY_VERSION,
    modelProvider: provider.provider,
    modelIdentifier: provider.model,
    requested: selected.length,
    completed: results.filter((r) => r.status === "completed").length,
    insufficient: results.filter((r) => r.status === "insufficient_evidence").length,
    blocked: results.filter((r) => r.status === "blocked_before_thesis").length,
    failed: results.filter((r) => r.status === "failed").length,
    opportunities: qualifying.length,
    thesisCalls,
    candidates: results,
  };

  await finishRun(runId, batch);
  return batch;
}

async function synthesizeCandidate(args: {
  input: ThesisInputCandidate;
  provider: ThesisProvider;
  isCalibration: boolean;
  byMint: Map<string, LoadedCandidate>;
  markets: Awaited<ReturnType<typeof loadCurrentMarkets>>;
}): Promise<SynthesizedCandidate> {
  const { input, provider, isCalibration, byMint, markets } = args;
  const scanCandidate = byMint.get(input.mint) ?? null;
  const market = scanCandidate ? (markets.get(scanCandidate.tokenId) ?? null) : null;

  const eligibility = scanCandidate
    ? assessResearchEligibility({
        candidate: scanCandidate,
        currentPriceChange1h: market?.priceChange1h ?? scanCandidate.priceChange1h,
      })
    : { researchEligibleNow: true, exclusionReasons: [] as string[] };

  const marketSnapshot = {
    marketCap: market?.marketCap ?? scanCandidate?.marketCap ?? null,
    priceUsd: market?.priceUsd ?? scanCandidate?.priceUsd ?? null,
    liquidityUsd: market?.liquidityUsd ?? scanCandidate?.liquidityUsd ?? null,
  };
  const setups = scanCandidate?.lanes ?? [];

  const base: Omit<SynthesizedCandidate, "status" | "blockedReasons"> = {
    input,
    components: null,
    thesisScore: null,
    evidence: null,
    verdict: null,
    bearSeverity: null,
    text: emptyText(),
    eligibility,
    market: marketSnapshot,
    setups,
    independentSourceCount: input.coverage?.independentSourceCount ?? 0,
    validationIssues: [],
    diagnostics: {},
    error: null,
  };

  // 1. Production gates. Historical research is preserved either way.
  const blockedReasons: string[] = [];
  if (!isCalibration) {
    if (input.isCalibration) blockedReasons.push("CALIBRATION_RESEARCH_NOT_PRODUCTION");
    if (!input.triageRunId || !input.triageDecisionId) blockedReasons.push("NO_PRODUCTION_TRIAGE_DECISION");
    if (!input.researchPacketId) blockedReasons.push("RESEARCH_PACKET_PROVENANCE_MISSING");
    if (!(await hasShortlistMilestone(input.tokenId))) blockedReasons.push("NO_AI_SHORTLIST_MILESTONE");
    if (!eligibility.researchEligibleNow) blockedReasons.push(...eligibility.exclusionReasons);
    if (blockedReasons.length > 0) {
      return { ...base, status: "blocked_before_thesis", blockedReasons };
    }
  }

  const packet = await loadCompactPacket(input.researchPacketId);
  const triage = await loadTriageDecision(input.triageDecisionId);
  const dossier = input.dossier;

  const claimRefs = (dossier?.claims ?? []).map((_, i) => `C${i + 1}`);
  const sourceRefs = (dossier?.sources ?? []).map((s) => s.ref);

  const system = buildThesisSystemPrompt();
  const user = buildThesisUserPrompt({
    header: {
      mint: input.mint,
      symbol: input.symbol,
      name: input.name,
      policyVersion: THESIS_POLICY_VERSION,
      promptVersion: THESIS_PROMPT_VERSION,
      inputPolicyVersion: THESIS_INPUT_POLICY_VERSION,
      mode: isCalibration ? "CALIBRATION" : "PRODUCTION",
      generatedAt: new Date().toISOString(),
    },
    packet: packet ? redactCompactForThesis(packet.compact) : {},
    dossier: dossier
      ? {
          oneSentenceNarrative: dossier.oneSentenceNarrative,
          narrativeResolved: dossier.narrativeResolved,
          identityAttributionConfidence: dossier.identityAttributionConfidence,
          domains: dossier.domains,
          claims: (dossier.claims ?? []).map((c, i) => ({ ref: `C${i + 1}`, ...c })),
          sources: dossier.sources,
          conflicts: dossier.conflicts,
          unresolvedQuestions: dossier.unresolvedQuestions,
          evidenceGaps: dossier.evidenceGaps,
          coverage: dossier.coverage,
        }
      : null,
    triage,
    eligibility,
    searchUnavailable: input.searchUnavailable,
  });

  const response = await provider.complete({ system, user });
  const validated = validateThesisOutput(parseThesisJson(response.text), {
    sourceRefs,
    claimRefs,
  });

  const totalDomains = dossier?.domains?.length ?? 6;
  const evidence = computeEvidenceConfidence({
    unresolvedDomainCount: dossier?.coverage?.unresolvedDomains?.length ?? totalDomains,
    totalDomainCount: totalDomains || 6,
    independentSourceCount: dossier?.coverage?.independentSourceCount ?? 0,
    sourceCount: dossier?.coverage?.sourceCount ?? 0,
    sourceDomainDiversity: dossier?.coverage?.sourceDomainDiversity ?? 0,
    conflictingClaimCount: dossier?.coverage?.conflictingClaimCount ?? 0,
    corroboratedClaimCount: dossier?.coverage?.corroboratedClaimCount ?? 0,
    identityAttributionConfidence: dossier?.identityAttributionConfidence ?? "UNRESOLVED",
    narrativeResolved: Boolean(dossier?.narrativeResolved),
    packetEvidenceGapCount: packet?.gaps.length ?? 0,
    marketStale: Boolean(packet?.stale),
    searchUnavailable: input.searchUnavailable,
  });

  const evidenceUnusable =
    input.searchUnavailable ||
    (dossier?.claims?.length ?? 0) === 0 ||
    (dossier?.coverage?.sourceCount ?? 0) === 0;

  const verdict = deriveVerdict({
    thesisScore: validated.thesisScore,
    evidenceConfidence: evidence.score,
    bearSeverity: validated.bearSeverity,
    evidenceUnusable,
    criticalUnresolvedIssues: validated.criticalUnresolvedIssues,
  });

  return {
    ...base,
    status: verdict === "INSUFFICIENT_EVIDENCE" ? "insufficient_evidence" : "completed",
    blockedReasons: [],
    components: validated.components,
    thesisScore: validated.thesisScore,
    evidence,
    verdict,
    bearSeverity: validated.bearSeverity,
    text: {
      oneSentenceThesis: validated.oneSentenceThesis,
      narrativeThesis: validated.narrativeThesis,
      sections: validated.sections,
      strongestBullCase: validated.strongestBullCase,
      strongestBearCase: validated.strongestBearCase,
      strongestCatalyst: validated.strongestCatalyst,
      catalystKind: validated.catalystKind,
      whyNowMarketSignal: validated.whyNowMarketSignal,
      strongestConcern: validated.strongestConcern,
      catalysts: validated.catalysts,
      invalidation: validated.invalidation,
      evidenceGaps: validated.evidenceGaps,
      supportingClaimRefs: validated.supportingClaimRefs,
      supportingSourceRefs: validated.supportingSourceRefs,
    },
    validationIssues: validated.issues,
    diagnostics: {
      provider: response.diagnostics,
      evidenceDeductions: evidence.deductions,
      dossierStatus: input.dossierStatus,
      searchUnavailable: input.searchUnavailable,
      inputPolicyVersion: THESIS_INPUT_POLICY_VERSION,
      redactedPacketKeys: ["outcomes"],
    },
  };
}

/**
 * THESIS_CALL is created only when the production opportunity policy is
 * actually met. It is append-only and idempotent: the FIRST call is frozen
 * forever and later refreshes never rewrite it.
 */
async function recordThesisCall(args: {
  candidate: SynthesizedCandidate;
  runId: string;
  provider: ThesisProvider;
}): Promise<string | null> {
  const { candidate, runId, provider } = args;
  const tokenId = candidate.input.tokenId;
  if (!tokenId) return null;

  await recordAiStageMilestone({
    stage: "THESIS_CALL",
    tokenId,
    contractAddress: candidate.input.mint,
    chain: candidate.input.chain,
    enteredAt: new Date().toISOString(),
    setups: candidate.setups,
    marketCap: candidate.market.marketCap,
    priceUsd: candidate.market.priceUsd,
    liquidityUsd: candidate.market.liquidityUsd,
    policyEpoch: "CURRENT_V1",
    aiPolicyVersion: THESIS_POLICY_VERSION,
    researchModelVersion: `${provider.provider}:${provider.model}`,
    provenance: {
      sourceType: "THESIS_SYNTHESIS",
      sourceId: runId,
      sourceRef: `thesis_synthesis_runs:${runId}`,
      sourceScanId: candidate.input.sourceScanId,
      researchPacketId: candidate.input.researchPacketId,
      researchPacketVersion: candidate.input.researchPacketVersion,
      researchRunId: candidate.input.deepResearchRunId,
      researchReportId: candidate.input.reportId,
      policyVersion: THESIS_POLICY_VERSION,
    },
  });

  const { data } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id")
    .eq("token_id", tokenId)
    .eq("stage", "THESIS_CALL")
    .order("first_entered_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data ? ((data as Row)["id"] as string) : null;
}

async function insertRun(input: {
  isCalibration: boolean;
  provider: ThesisProvider;
  inputs: ThesisInputCandidate[];
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("thesis_synthesis_runs")
    .insert({
      source_scan_id: input.inputs.find((c) => c.sourceScanId)?.sourceScanId ?? null,
      triage_run_id: input.inputs.find((c) => c.triageRunId)?.triageRunId ?? null,
      thesis_policy_version: THESIS_POLICY_VERSION,
      rubric_version: THESIS_RUBRIC_VERSION,
      prompt_version: THESIS_PROMPT_VERSION,
      input_policy_version: THESIS_INPUT_POLICY_VERSION,
      model_provider: input.provider.provider,
      model_identifier: input.provider.model,
      is_calibration: input.isCalibration,
      status: "running",
      requested_count: input.inputs.length,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row)["id"] as string;
}

async function finishRun(runId: string, batch: ThesisBatchResult): Promise<void> {
  const { error } = await supabaseAdmin
    .from("thesis_synthesis_runs")
    .update({
      status: "completed",
      code: batch.code,
      completed_at: new Date().toISOString(),
      completed_count: batch.completed,
      insufficient_count: batch.insufficient,
      blocked_count: batch.blocked,
      failed_count: batch.failed,
      opportunity_count: batch.opportunities,
      thesis_call_count: batch.thesisCalls,
      diagnostics: {
        opportunityPolicy: OPPORTUNITY_POLICY,
        components: THESIS_COMPONENTS,
      } as never,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

async function insertReport(args: {
  runId: string;
  candidate: SynthesizedCandidate;
  isCalibration: boolean;
  provider: ThesisProvider;
  qualified: boolean;
  thesisCallMilestoneId: string | null;
}): Promise<string> {
  const { candidate: s } = args;
  const c = s.components;
  const { data, error } = await supabaseAdmin
    .from("thesis_reports")
    .insert({
      thesis_synthesis_run_id: args.runId,
      token_id: s.input.tokenId,
      mint: s.input.mint,
      chain: s.input.chain,
      symbol: s.input.symbol,
      name: s.input.name,
      is_calibration: args.isCalibration,
      status: s.status,
      blocked_reasons: s.blockedReasons,
      thesis_score: s.thesisScore,
      evidence_confidence: s.evidence?.score ?? null,
      verdict: s.verdict,
      bear_case_severity: s.bearSeverity,
      score_meme_quality: c?.memeQuality ?? null,
      score_catalyst_narrative: c?.catalystNarrative ?? null,
      score_distribution: c?.distribution ?? null,
      score_liquidity: c?.liquidity ?? null,
      score_dev_integrity: c?.devIntegrity ?? null,
      // v2 rubric: Thesis carries no chart/entry component at all.
      score_chart_context: null,
      score_mindshare: c?.mindshare ?? null,
      score_valuation: c?.valuation ?? null,
      component_scores: (c ?? null) as never,
      evidence_confidence_components: (s.evidence?.deductions ?? null) as never,
      one_sentence_thesis: s.text.oneSentenceThesis,
      narrative_thesis: s.text.narrativeThesis,
      strongest_bull_case: s.text.strongestBullCase,
      strongest_bear_case: s.text.strongestBearCase,
      strongest_catalyst: s.text.strongestCatalyst,
      catalyst_kind: s.text.catalystKind,
      why_now_market_signal: s.text.whyNowMarketSignal,
      strongest_concern: s.text.strongestConcern,
      sections: (s.text.sections ?? null) as never,
      catalysts: s.text.catalysts,
      invalidation: s.text.invalidation,
      evidence_gaps: s.text.evidenceGaps,
      supporting_claim_refs: s.text.supportingClaimRefs,
      supporting_source_refs: s.text.supportingSourceRefs,
      current_eligibility: s.eligibility as never,
      setups: s.setups,
      market_cap_at_synthesis: s.market.marketCap,
      price_at_synthesis: s.market.priceUsd,
      liquidity_at_synthesis: s.market.liquidityUsd,
      research_packet_id: s.input.researchPacketId,
      research_packet_version: s.input.researchPacketVersion,
      triage_run_id: s.input.triageRunId,
      triage_decision_id: s.input.triageDecisionId,
      deep_research_run_id: s.input.deepResearchRunId,
      deep_research_report_id: s.input.reportId,
      shortlist_milestone_id: s.input.shortlistMilestoneId,
      thesis_call_milestone_id: args.thesisCallMilestoneId,
      qualified_as_opportunity: args.qualified,
      thesis_policy_version: THESIS_POLICY_VERSION,
      rubric_version: THESIS_RUBRIC_VERSION,
      prompt_version: THESIS_PROMPT_VERSION,
      input_policy_version: THESIS_INPUT_POLICY_VERSION,
      model_provider: args.provider.provider,
      model_identifier: args.provider.model,
      diagnostics: ({ ...s.diagnostics, validationIssues: s.validationIssues, error: s.error } ) as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row)["id"] as string;
}

function emptyBatch(
  mode: ThesisMode,
  code: ThesisRunCode,
  provider: ThesisProvider | null,
): ThesisBatchResult {
  return {
    mode,
    code,
    isCalibration: mode === "calibration",
    runId: null,
    policyVersion: THESIS_POLICY_VERSION,
    promptVersion: THESIS_PROMPT_VERSION,
    inputPolicyVersion: THESIS_INPUT_POLICY_VERSION,
    modelProvider: provider?.provider ?? null,
    modelIdentifier: provider?.model ?? null,
    requested: 0,
    completed: 0,
    insufficient: 0,
    blocked: 0,
    failed: 0,
    opportunities: 0,
    thesisCalls: 0,
    candidates: [],
  };
}

export interface ThesisReportSummary {
  id: string;
  runId: string;
  mint: string;
  symbol: string | null;
  name: string | null;
  isCalibration: boolean;
  status: string;
  createdAt: string;
  thesisScore: number | null;
  evidenceConfidence: number | null;
  verdict: string | null;
  bearSeverity: string | null;
  components: ComponentScores | null;
  evidenceDeductions: { code: string; points: number; detail: string }[];
  oneSentenceThesis: string | null;
  narrativeThesis: string | null;
  sections: ThesisSections | null;
  strongestBullCase: string | null;
  strongestBearCase: string | null;
  strongestCatalyst: string | null;
  catalystKind: string;
  whyNowMarketSignal: string | null;
  strongestConcern: string | null;
  catalysts: string[];
  invalidation: string[];
  evidenceGaps: string[];
  supportingSourceRefs: string[];
  blockedReasons: string[];
  setups: string[];
  marketCap: number | null;
  qualifiedAsOpportunity: boolean;
  thesisCallMilestoneId: string | null;
  policyVersion: string;
  rubricVersion: string | null;
  promptVersion: string;
  modelIdentifier: string | null;
  deepResearchReportId: string | null;
  researchPacketId: string | null;
  triageRunId: string | null;
  pairAddress: string | null;
  triageRank: number | null;
  sources: { ref: string; url: string | null; title: string | null; independence: string }[];
}

/**
 * Newest thesis reports, read-only, for the Research workbench.
 * Production and calibration are never mixed: the caller picks the mode and
 * production shows the newest production synthesis run in full.
 */
export async function loadThesisReports(
  limit = 12,
  mode: ThesisMode = "production",
): Promise<ThesisReportSummary[]> {
  const isCalibration = mode === "calibration";
  let rows: Row[] = [];
  if (!isCalibration) {
    // Newest production synthesis run, complete cohort.
    const { data: runRow } = await supabaseAdmin
      .from("thesis_synthesis_runs")
      .select("id")
      .eq("is_calibration", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    const runId = runRow ? ((runRow as Row)["id"] as string) : null;
    if (!runId) return [];
    const { data, error } = await supabaseAdmin
      .from("thesis_reports")
      .select("*")
      .eq("thesis_synthesis_run_id", runId)
      .order("thesis_score", { ascending: false, nullsFirst: false })
      .limit(50);
    if (error) throw new Error(error.message);
    rows = (data as Row[]) ?? [];
  } else {
    const { data, error } = await supabaseAdmin
      .from("thesis_reports")
      .select("*")
      .eq("is_calibration", true)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new Error(error.message);
    rows = (data as Row[]) ?? [];
  }

  const mints = [...new Set(rows.map((r) => r["mint"] as string))];
  const pairByMint = new Map<string, string | null>();
  const rankByMint = new Map<string, number | null>();
  if (mints.length) {
    const { data: tokenRows } = await supabaseAdmin
      .from("tokens")
      .select("contract_address, dex_pair_address")
      .in("contract_address", mints);
    for (const t of (tokenRows as Row[] | null) ?? []) {
      pairByMint.set(t["contract_address"] as string, (t["dex_pair_address"] as string) ?? null);
    }
    const triageIds = [
      ...new Set(
        rows.map((r) => r["triage_run_id"] as string | null).filter((v): v is string => Boolean(v)),
      ),
    ];
    if (triageIds.length) {
      const { data: decisionRows } = await supabaseAdmin
        .from("ai_triage_decisions")
        .select("mint, triage_rank, triage_run_id")
        .in("triage_run_id", triageIds)
        .in("mint", mints);
      for (const d of (decisionRows as Row[] | null) ?? []) {
        rankByMint.set(d["mint"] as string, (d["triage_rank"] as number) ?? null);
      }
    }
  }


  const reportIds = [
    ...new Set(
      rows.map((r) => r["deep_research_report_id"] as string | null).filter((v): v is string => Boolean(v)),
    ),
  ];
  const sourcesByReport = new Map<string, ThesisReportSummary["sources"]>();
  if (reportIds.length) {
    const { data: sourceRows } = await supabaseAdmin
      .from("deep_research_sources")
      .select("report_id, source_ref, url, title, independence")
      .in("report_id", reportIds);
    for (const s of (sourceRows as Row[] | null) ?? []) {
      const key = s["report_id"] as string;
      const list = sourcesByReport.get(key) ?? [];
      list.push({
        ref: (s["source_ref"] as string) ?? "",
        url: (s["url"] as string) ?? null,
        title: (s["title"] as string) ?? null,
        independence: (s["independence"] as string) ?? "UNKNOWN",
      });
      sourcesByReport.set(key, list);
    }
  }

  return rows.map((r) => ({
    id: r["id"] as string,
    runId: r["thesis_synthesis_run_id"] as string,
    mint: r["mint"] as string,
    symbol: (r["symbol"] as string) ?? null,
    name: (r["name"] as string) ?? null,
    isCalibration: Boolean(r["is_calibration"]),
    status: (r["status"] as string) ?? "unknown",
    createdAt: (r["created_at"] as string) ?? "",
    thesisScore: (r["thesis_score"] as number) ?? null,
    evidenceConfidence: (r["evidence_confidence"] as number) ?? null,
    verdict: (r["verdict"] as string) ?? null,
    bearSeverity: (r["bear_case_severity"] as string) ?? null,
    components: (r["component_scores"] as ComponentScores) ?? null,
    evidenceDeductions:
      (r["evidence_confidence_components"] as ThesisReportSummary["evidenceDeductions"]) ?? [],
    oneSentenceThesis: (r["one_sentence_thesis"] as string) ?? null,
    narrativeThesis: (r["narrative_thesis"] as string) ?? null,
    sections: (r["sections"] as ThesisSections) ?? null,
    strongestBullCase: (r["strongest_bull_case"] as string) ?? null,
    strongestBearCase: (r["strongest_bear_case"] as string) ?? null,
    strongestCatalyst: (r["strongest_catalyst"] as string) ?? null,
    catalystKind: (r["catalyst_kind"] as string) ?? "NONE",
    whyNowMarketSignal: (r["why_now_market_signal"] as string) ?? null,
    pairAddress: pairByMint.get(r["mint"] as string) ?? null,
    triageRank: rankByMint.get(r["mint"] as string) ?? null,
    strongestConcern: (r["strongest_concern"] as string) ?? null,
    catalysts: (r["catalysts"] as string[]) ?? [],
    invalidation: (r["invalidation"] as string[]) ?? [],
    evidenceGaps: (r["evidence_gaps"] as string[]) ?? [],
    supportingSourceRefs: (r["supporting_source_refs"] as string[]) ?? [],
    blockedReasons: (r["blocked_reasons"] as string[]) ?? [],
    setups: (r["setups"] as string[]) ?? [],
    marketCap: (r["market_cap_at_synthesis"] as number) ?? null,
    qualifiedAsOpportunity: Boolean(r["qualified_as_opportunity"]),
    thesisCallMilestoneId: (r["thesis_call_milestone_id"] as string) ?? null,
    policyVersion: (r["thesis_policy_version"] as string) ?? THESIS_POLICY_VERSION,
    rubricVersion: (r["rubric_version"] as string) ?? null,
    promptVersion: (r["prompt_version"] as string) ?? THESIS_PROMPT_VERSION,
    modelIdentifier: (r["model_identifier"] as string) ?? null,
    deepResearchReportId: (r["deep_research_report_id"] as string) ?? null,
    researchPacketId: (r["research_packet_id"] as string) ?? null,
    triageRunId: (r["triage_run_id"] as string) ?? null,
    sources: sourcesByReport.get((r["deep_research_report_id"] as string) ?? "") ?? [],
  }));
}
