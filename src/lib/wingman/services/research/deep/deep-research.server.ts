/**
 * Deep Research v1 orchestrator (server-only).
 *
 * Input:  AI Triage DEEP_RESEARCH decisions (exact persisted decision + the
 *         immutable Research Packet the decision was made from).
 * Output: an append-only, source-grounded dossier per candidate.
 *
 * This stage NEVER produces a Thesis Score, Entry State, position sizing or
 * buy/sell language, never touches scanner selection or Quantitative Research
 * Priority, never overrides operational gates, and never creates milestones.
 * Calibration runs are dry runs: flagged, subset-limited, history-free.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assessResearchEligibility } from "../packet";
import { fetchAllPages, loadCurrentMarkets, loadRunCandidates } from "../packet.server";
import {
  DEEP_RESEARCH_DOSSIER_VERSION,
  DEEP_RESEARCH_POLICY_VERSION,
  DEEP_RESEARCH_PROMPT_VERSION,
  DEEP_RESEARCH_SEARCH_VERSION,
  DEFAULT_RESEARCH_BUDGET,
  assembleDossier,
  buildQueryPlan,
  buildSystemPrompt,
  buildUserPrompt,
  classifyReliability,
  classifySourceType,
  emptyDossier,
  shouldStopSearch,
  validateModelOutput,
  withEvidenceOrigin,
  type AttributionConfidence,
  type DossierSearchHealth,
  type SearchHealthStatus,
  type ResearchBudget,
  type ResearchDossier,
  type ResearchSource,
  type StopReason,
} from "./contracts";
import { mentionsMint, mentionsSymbol, resolveMintIdentity } from "./identity.server";
import {
  EXTERNAL_SEARCH_POLICY_VERSION,
  buildSearchVariants,
  canonicalizeUrl,
  classifyIndependence,
  isSearchSuccess,
  type ExternalSearchResponse,
} from "./external-search";
import {
  getExternalSearchHealth,
  resolveExternalSearchProvider,
  type ExternalSearchHealth,
  type ExternalSearchProvider,
} from "./external-search.server";
import { createHttpPageFetcher, type PageFetcher } from "./search.server";
import {
  createLovableDeepResearchProvider,
  type DeepResearchProvider,
} from "./provider.server";
import {
  classifyResearchFailure,
  type ResearchFailureType,
} from "./failure";
import {
  claimSpendDecisions,
  markSpendExecuted,
  packetFactsFromPacket,
  type SpendClaim,
} from "../spend/spend.server";
import {
  RESEARCH_SPEND_POLICY_VERSION,
  type ResearchSpendConfig,
  type SpendDecisionRecord,
  type SpendPacketFacts,
} from "../spend/spend-policy";

type Row = Record<string, unknown>;

export type DeepResearchMode = "production" | "calibration";

export type DeepResearchRunCode =
  | "OK"
  | "NO_ELIGIBLE_TRIAGE_RUN"
  | "NO_DEEP_RESEARCH_CANDIDATES"
  | "DEEP_RESEARCH_PROVENANCE_MISMATCH"
  | "MISSING_API_KEY";

/**
 * `search_unavailable` is NOT `insufficient_evidence`. The first means the
 * outside world was never actually queried; only the second is a finding.
 */
export type CandidateStatus =
  | "completed"
  | "insufficient_evidence"
  /** Search failed mid-research: partial evidence kept, never "completed". */
  | "search_limited"
  | "search_unavailable"
  | "blocked"
  | "failed";

export interface SearchTelemetry {
  provider: string;
  policyVersion: string;
  attempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  resultsReturned: number;
  outcomes: Record<string, number>;
  lastError: string | null;
  everSucceeded: boolean;
}

export interface DeepResearchCandidateResult {
  mint: string;
  symbol: string | null;
  status: CandidateStatus;
  deepResearchRunId: string | null;
  reportId: string | null;
  stopReason: StopReason | null;
  queryCount: number;
  sourceCount: number;
  verifiedSourceCount: number;
  independentSourceCount: number;
  coveragePct: number;
  narrativeResolved: boolean;
  identityAttributionConfidence: AttributionConfidence;
  unresolvedGapCount: number;
  conflictingClaimCount: number;
  durationMs: number;
  blockedReasons: string[];
  validationIssues: { code: string; detail: string }[];
  search: SearchTelemetry | null;
  error: string | null;
  /** Structured execution-failure code (e.g. FAILED_AI_CREDIT_LIMIT). */
  failureCode: string | null;
  failureType: ResearchFailureType | null;
  retryable: boolean;
}

export interface DeepResearchBatchResult {
  mode: DeepResearchMode;
  code: DeepResearchRunCode;
  isCalibration: boolean;
  triageRunId: string | null;
  sourceScanId: string | null;
  policyVersion: string;
  dossierVersion: string;
  promptVersion: string;
  searchVersion: string;
  searchProvider: string;
  searchHealth: ExternalSearchHealth;
  modelProvider: string | null;
  modelIdentifier: string | null;
  requested: number;
  completed: number;
  insufficient: number;
  searchUnavailable: number;
  blocked: number;
  failed: number;
  milestonesCreated: 0;
  /** Retry batch: shortlist ranks skipped because they already have an outcome. */
  skippedWithOutcome: number;
  /** research_spend_policy version applied to this production batch. */
  spendPolicyVersion: string;
  /** Operational deferrals — NOT SKIP, NOT negative evidence. */
  deferredRecentResearch: number;
  deferredBudget: number;
  spendDecisions: SpendDecisionRecord[];
  candidates: DeepResearchCandidateResult[];
}

export interface RunDeepResearchOptions {
  mode?: DeepResearchMode;
  /** Cap the researched subset by persisted AI triage rank (calibration: 3–5). */
  limit?: number;
  /** Production only: skip the first N shortlist ranks (continue a batch). */
  offset?: number;
  /** Research a specific triage run instead of the newest. */
  triageRunId?: string;
  /**
   * Production only: re-attempt ONLY shortlist members whose last attempt was a
   * retryable execution failure (AI credits, rate limit, transient provider).
   * Completed / insufficient / blocked outcomes are never rerun.
   */
  retryFailedOnly?: boolean;
  /**
   * Production only: research ONLY shortlist members with no persisted attempt
   * at all. Completed, partial, blocked, running and failed mints are left
   * untouched (failures are handled by `retryFailedOnly`).
   */
  startNotStartedOnly?: boolean;
  /**
   * Production only: refuse to spend model/search budget unless the resolved
   * triage run and its source scan are EXACTLY the active Research cohort.
   */
  requireActiveCohort?: boolean;

  /**
   * Authorised repair path ONLY. Manual retry never bypasses cooldown/budget
   * unless this is explicitly set by an operator repair flow.
   */
  spendControl?: boolean;
  spendConfig?: ResearchSpendConfig;
  /** Injected clock for deterministic tests. */
  now?: Date;

  budget?: Partial<ResearchBudget>;
  provider?: DeepResearchProvider;
  search?: ExternalSearchProvider;
  fetcher?: PageFetcher;
}

interface ShortlistedCandidate {
  decisionId: string;
  triageRunId: string;
  sourceScanId: string | null;
  tokenId: string | null;
  mint: string;
  chain: string;
  researchPacketId: string | null;
  researchPacketVersion: string | null;
  requestedDomains: string[];
  unresolvedQuestions: string[];
  triageRank: number | null;
  symbol: string | null;
  name: string | null;
}

/** Newest triage run that produced shortlist decisions, in the requested mode. */
async function loadTriageRun(options: {
  isCalibration: boolean;
  triageRunId?: string;
}): Promise<{ id: string; sourceScanId: string | null } | null> {
  let query = supabaseAdmin
    .from("ai_triage_runs")
    .select("id, source_scan_id, status, is_calibration, deep_research_count, started_at")
    .eq("status", "completed")
    .gt("deep_research_count", 0)
    .order("started_at", { ascending: false })
    .limit(1);
  if (options.triageRunId) query = query.eq("id", options.triageRunId);
  else if (!options.isCalibration) query = query.eq("is_calibration", false);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = data as Row;
  return { id: r["id"] as string, sourceScanId: (r["source_scan_id"] as string) ?? null };
}

async function loadShortlist(run: {
  id: string;
  sourceScanId: string | null;
}): Promise<ShortlistedCandidate[]> {
  const rows = await fetchAllPages((from, to) =>
    supabaseAdmin
      .from("ai_triage_decisions")
      .select("*")
      .eq("triage_run_id", run.id)
      .eq("decision", "DEEP_RESEARCH")
      .order("triage_rank", { ascending: true, nullsFirst: false })
      .range(from, to),
  );
  return (rows as Row[]).map((d) => ({
    decisionId: d["id"] as string,
    triageRunId: run.id,
    sourceScanId: run.sourceScanId,
    tokenId: (d["token_id"] as string) ?? null,
    mint: d["mint"] as string,
    chain: "solana",
    researchPacketId: (d["research_packet_id"] as string) ?? null,
    researchPacketVersion: (d["research_packet_version"] as string) ?? null,
    requestedDomains: (d["requested_research_domains"] as string[]) ?? [],
    unresolvedQuestions: (d["unresolved_questions"] as string[]) ?? [],
    triageRank: (d["triage_rank"] as number) ?? null,
    symbol: null,
    name: null,
  }));
}

/** Newest AI_SHORTLIST milestone for a token — linked for provenance only. */
async function findShortlistMilestone(tokenId: string | null): Promise<string | null> {
  if (!tokenId) return null;
  const { data } = await supabaseAdmin
    .from("token_stage_milestones")
    .select("id")
    .eq("token_id", tokenId)
    .eq("stage", "AI_SHORTLIST")
    .order("first_entered_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ? ((data as Row)["id"] as string) : null;
}

export async function runDeepResearch(
  options: RunDeepResearchOptions = {},
): Promise<DeepResearchBatchResult> {
  const mode: DeepResearchMode = options.mode ?? "calibration";
  const isCalibration = mode === "calibration";
  const budget: ResearchBudget = { ...DEFAULT_RESEARCH_BUDGET, ...(options.budget ?? {}) };

  const search = options.search ?? resolveExternalSearchProvider();
  const fetcher = options.fetcher ?? createHttpPageFetcher();

  let provider = options.provider ?? null;
  if (!provider) {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) {
      return emptyBatch(mode, "MISSING_API_KEY", null, null, null);
    }
    provider = createLovableDeepResearchProvider({ apiKey });
  }

  const triageRun = await loadTriageRun({ isCalibration, ...(options.triageRunId ? { triageRunId: options.triageRunId } : {}) });
  if (!triageRun) {
    return emptyBatch(mode, "NO_ELIGIBLE_TRIAGE_RUN", null, null, provider);
  }

  // Exact-provenance guard: stop before any model/search spend if the resolved
  // run is not the active production cohort's triage run for its exact scan.
  if (!isCalibration && options.requireActiveCohort) {
    const { loadActiveResearchCohort } = await import("../cohort.server");
    const cohort = await loadActiveResearchCohort();
    const scanOk = !!cohort.scan && cohort.scan.id === triageRun.sourceScanId;
    const triageOk = !!cohort.triageRunId && cohort.triageRunId === triageRun.id;
    if (!scanOk || !triageOk) {
      return emptyBatch(
        mode,
        "DEEP_RESEARCH_PROVENANCE_MISMATCH",
        triageRun.id,
        triageRun.sourceScanId,
        provider,
      );
    }
  }

  let skippedWithOutcome = 0;
  let shortlist = await loadShortlist(triageRun);
  if (shortlist.length === 0) {
    return emptyBatch(mode, "NO_DEEP_RESEARCH_CANDIDATES", triageRun.id, triageRun.sourceScanId, provider);
  }

  // Subset selection is by persisted AI triage rank only — never by later
  // outcomes. Calibration is a dry run; production may also be run in
  // deliberate top-N batches (e.g. the top 3 of a fresh shortlist).
  if (isCalibration) {
    const limit = Math.min(5, Math.max(3, options.limit ?? 3));
    shortlist = shortlist.slice(0, limit);
  } else if (options.retryFailedOnly) {
    const retryable = await loadRetryableMints(triageRun.id);
    const before = shortlist.length;
    shortlist = shortlist.filter((c) => retryable.has(c.mint));
    skippedWithOutcome = before - shortlist.length;
    const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : shortlist.length;
    shortlist = shortlist.slice(0, limit);
  } else {
    if (options.startNotStartedOnly) {
      const attempted = await loadAttemptedMints(triageRun.id);
      const before = shortlist.length;
      shortlist = shortlist.filter((c) => !attempted.has(c.mint));
      skippedWithOutcome = before - shortlist.length;
    }
    const offset = typeof options.offset === "number" && options.offset > 0 ? options.offset : 0;
    const limit = typeof options.limit === "number" && options.limit > 0 ? options.limit : shortlist.length;
    shortlist = shortlist.slice(offset, offset + limit);
  }



  // Freshness / eligibility recheck against the scan the packets came from.
  const candidates = triageRun.sourceScanId ? await loadRunCandidates(triageRun.sourceScanId) : [];
  const byMint = new Map(candidates.filter((c) => c.contractAddress).map((c) => [c.contractAddress as string, c]));
  const markets = await loadCurrentMarkets(candidates.map((c) => c.tokenId));

  // research_spend_policy/v1 — operational spend control between AI Triage and
  // Deep Research. Deferral is NEVER a Triage decision and NEVER negative
  // evidence; the Triage decision, packet and recurrence data are untouched.
  const spendDecisions: SpendDecisionRecord[] = [];
  const spendClaimByMint = new Map<string, SpendClaim>();
  if (!isCalibration && options.spendControl !== false) {
    const packetFacts = await loadCohortPacketFacts(
      triageRun.sourceScanId,
      shortlist.map((c) => c.mint),
    );
    const claims = await claimSpendDecisions({
      triageRunId: triageRun.id,
      scanRunId: triageRun.sourceScanId,
      ...(options.spendConfig ? { config: options.spendConfig } : {}),
      ...(options.now ? { now: options.now } : {}),
      candidates: shortlist.map((c) => {
        const sc = byMint.get(c.mint) ?? null;
        return {
          mint: c.mint,
          tokenId: c.tokenId,
          triageDecisionId: c.decisionId,
          researchPacketId: c.researchPacketId,
          triageRank: c.triageRank,
          quantRank: sc?.globalRank ?? null,
          recurrenceState: sc?.recurrenceState ?? null,
          recurrenceNumber: sc?.scansSeenCount ?? null,
          packetFacts: packetFacts.get(c.mint) ?? null,
        };
      }),
    });
    for (const claim of claims) {
      spendDecisions.push(claim.record);
      spendClaimByMint.set(claim.record.mint, claim);
    }
    const granted = new Set(
      claims
        .filter((c) => c.claimed && c.record.spendDecision === "RUN_DEEP_RESEARCH")
        .map((c) => c.record.mint),
    );
    shortlist = shortlist.filter((c) => granted.has(c.mint));
  }

  const results: DeepResearchCandidateResult[] = [];

  for (const candidate of shortlist) {
    const scanCandidate = byMint.get(candidate.mint) ?? null;
    candidate.symbol = scanCandidate?.symbol ?? null;
    candidate.name = scanCandidate?.name ?? null;
    const market = scanCandidate ? (markets.get(scanCandidate.tokenId) ?? null) : null;

    const eligibility = scanCandidate
      ? assessResearchEligibility({
          candidate: scanCandidate,
          currentPriceChange1h: market?.priceChange1h ?? null,
        })
      : { researchEligibleNow: true, exclusionReasons: [] as string[] };

    // Operational gates are never overridden. In production an ineligible
    // candidate is recorded as blocked and skipped; calibration still runs so
    // the workflow itself can be evaluated on historical cohorts.
    if (!isCalibration && !eligibility.researchEligibleNow) {
      const runId = await insertRun({
        candidate,
        provider,
        isCalibration,
        status: "blocked",
        budget,
        eligibility,
        shortlistMilestoneId: await findShortlistMilestone(candidate.tokenId),
      });
      await finishRun(runId, {
        status: "blocked",
        stopReason: null,
        error: null,
        counts: { queries: 0, fetches: 0, passes: 0 },
        durationMs: 0,
        eligibilityAfter: eligibility,
        diagnostics: { reason: "OPERATIONAL_GATE" },
      });
      results.push(blockedResult(candidate, runId, eligibility.exclusionReasons));
      continue;
    }

    try {
      const result = await researchCandidate({
        candidate,
        provider,
        search,
        fetcher,
        budget,
        isCalibration,
        eligibility,
      });
      // Eligibility is rechecked AFTER research against fresh market state.
      // A token that collapses mid-research keeps its report and its
      // AI_SHORTLIST milestone, but is flagged so nothing downstream (e.g.
      // Thesis Synthesis) may advance it.
      if (scanCandidate && result.deepResearchRunId) {
        const freshMarkets = await loadCurrentMarkets([scanCandidate.tokenId]);
        const after = assessResearchEligibility({
          candidate: scanCandidate,
          currentPriceChange1h: freshMarkets.get(scanCandidate.tokenId)?.priceChange1h ?? null,
        });
        await recordEligibilityAfter(result.deepResearchRunId, after);
        if (!after.researchEligibleNow) {
          result.blockedReasons = [
            "CURRENTLY_BLOCKED_AFTER_RESEARCH",
            ...after.exclusionReasons,
          ];
        }
      }
      results.push(result);

    } catch (error) {
      // Failure isolation: one bad candidate never aborts the batch. A run row
      // opened before the failure must not be left dangling as "running".
      const message = error instanceof Error ? error.message.slice(0, 400) : "Unknown error";
      const failure = classifyResearchFailure(message);
      await failDanglingRun(triageRun.id, candidate.mint, message, failure);
      results.push({

        mint: candidate.mint,
        symbol: candidate.symbol,
        status: "failed",
        deepResearchRunId: null,
        reportId: null,
        stopReason: null,
        queryCount: 0,
        sourceCount: 0,
        verifiedSourceCount: 0,
        independentSourceCount: 0,
        coveragePct: 0,
        narrativeResolved: false,
        identityAttributionConfidence: "UNRESOLVED",
        unresolvedGapCount: 6,
        conflictingClaimCount: 0,
        durationMs: 0,
        blockedReasons: [],
        validationIssues: [],
        search: null,
        error: message,
        failureCode: failure.code,
        failureType: failure.type,
        retryable: failure.retryable,
      });
    }
  }

  return {
    mode,
    code: "OK",
    isCalibration,
    triageRunId: triageRun.id,
    sourceScanId: triageRun.sourceScanId,
    policyVersion: DEEP_RESEARCH_POLICY_VERSION,
    dossierVersion: DEEP_RESEARCH_DOSSIER_VERSION,
    promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
    searchVersion: DEEP_RESEARCH_SEARCH_VERSION,
    searchProvider: search.name,
    searchHealth: getExternalSearchHealth(),
    modelProvider: provider.provider,
    modelIdentifier: provider.model,
    requested: shortlist.length,
    completed: results.filter((r) => r.status === "completed").length,
    insufficient: results.filter((r) => r.status === "insufficient_evidence").length,
    searchUnavailable: results.filter((r) => r.status === "search_unavailable").length,
    blocked: results.filter((r) => r.status === "blocked").length,
    failed: results.filter((r) => r.status === "failed").length,
    milestonesCreated: 0,
    skippedWithOutcome,
    spendPolicyVersion: RESEARCH_SPEND_POLICY_VERSION,
    deferredRecentResearch: spendDecisions.filter(
      (d) => d.spendDecision === "DEFERRED_RECENT_RESEARCH",
    ).length,
    deferredBudget: spendDecisions.filter((d) => d.spendDecision === "DEFERRED_BUDGET").length,
    spendDecisions,
    candidates: results,
  };
}

async function researchCandidate(input: {
  candidate: ShortlistedCandidate;
  provider: DeepResearchProvider;
  search: ExternalSearchProvider;
  fetcher: PageFetcher;
  budget: ResearchBudget;
  isCalibration: boolean;
  eligibility: { researchEligibleNow: boolean; exclusionReasons: string[] };
}): Promise<DeepResearchCandidateResult> {
  const { candidate, provider, search, fetcher, budget, isCalibration } = input;
  const startedAt = Date.now();

  const runId = await insertRun({
    candidate,
    provider,
    isCalibration,
    status: "running",
    budget,
    eligibility: input.eligibility,
    shortlistMilestoneId: await findShortlistMilestone(candidate.tokenId),
  });

  const identity = await resolveMintIdentity({
    mint: candidate.mint,
    chain: candidate.chain,
    fallbackSymbol: candidate.symbol,
    fallbackName: candidate.name,
  });

  const officialUrls = identity.officialLinks.map((l) => l.url);
  const sources: ResearchSource[] = [];
  const seenUrls = new Set<string>();
  let queries = 0;
  let fetches = 0;
  const searchTelemetry: SearchTelemetry = {
    provider: search.name,
    policyVersion: search.policyVersion,
    attempts: 0,
    successfulAttempts: 0,
    failedAttempts: 0,
    resultsReturned: 0,
    outcomes: {},
    lastError: null,
    everSucceeded: false,
  };
  const rejectedCollisionSources: { url: string; reason: string }[] = [];
  let stopReason: StopReason | null = null;

  const recordSearch = (response: ExternalSearchResponse) => {
    searchTelemetry.attempts += 1;
    searchTelemetry.outcomes[response.outcome] =
      (searchTelemetry.outcomes[response.outcome] ?? 0) + 1;
    searchTelemetry.resultsReturned += response.results.length;
    if (isSearchSuccess(response.outcome)) {
      searchTelemetry.successfulAttempts += 1;
      searchTelemetry.everSucceeded = true;
    } else {
      searchTelemetry.failedAttempts += 1;
      searchTelemetry.lastError = `${response.outcome}: ${response.error ?? ""}`.slice(0, 300);
    }
  };

  const pushSource = (source: Omit<ResearchSource, "onChainMirror" | "evidenceOrigin">) => {
    const key = source.url ? (canonicalizeUrl(source.url) ?? source.url) : null;
    if (key && seenUrls.has(key)) return;
    if (key) seenUrls.add(key);
    sources.push(withEvidenceOrigin(source));
  };


  // 1. Official links published on the token's own pair metadata are PRIMARY
  //    and mint-attributed by construction — but they are the PROJECT speaking.
  for (const link of identity.officialLinks.slice(0, 3)) {
    if (fetches >= budget.maxFetches) break;
    const page = await fetcher.fetchPage(link.url, budget.maxSourceChars);
    fetches += 1;
    pushSource({
      ref: `S${sources.length + 1}`,
      url: link.url,
      title: page?.title ?? link.label,
      account: null,
      sourceType: "OFFICIAL_TOKEN_LINK",
      reliabilityClass: "PRIMARY",
      independence: "PROJECT_OWNED",
      publishedAt: null,
      fetchedAt: page?.fetchedAt ?? new Date().toISOString(),
      relevance: "Official link published on the token's primary pair metadata",
      mintVerified: true,
      contentFetched: Boolean(page?.text),
      attributionConfidence: "CONFIRMED",
      query: null,
      excerpt: page?.text ?? null,
    });
  }

  // 2. Identity-safe external query plan: mint-anchored, never bare-ticker.
  const plan = buildSearchVariants({
    mint: candidate.mint,
    symbol: identity.symbol,
    name: identity.name,
    officialUrls,
    identityEstablished: false,
  });
  for (const variant of plan) {
    stopReason = shouldStopSearch(
      {
        startedAt,
        queries,
        fetches,
        verifiedSources: sources.filter((s) => s.mintVerified).length,
        coveredDomains: 0,
        remainingQueries: plan.length - queries,
      },
      budget,
      Date.now(),
    );
    if (stopReason) break;

    // The provider returns an explicit outcome. A failure is NEVER silently
    // converted into "no results found".
    const response = await search.search(variant.query, 4);
    recordSearch(response);
    queries += 1;
    if (!isSearchSuccess(response.outcome)) continue;

    for (const hit of response.results) {
      if (fetches >= budget.maxFetches) break;
      const canonical = canonicalizeUrl(hit.url) ?? hit.url;
      if (seenUrls.has(canonical)) continue;
      const page = await fetcher.fetchPage(hit.url, budget.maxSourceChars);
      fetches += 1;
      const urlAndSnippet = `${hit.url} ${hit.title ?? ""} ${hit.snippet ?? ""}`;
      const text = `${urlAndSnippet} ${page?.text ?? ""}`;
      const mintVerified = mentionsMint(text, candidate.mint);
      const symbolOnly = !mintVerified && mentionsSymbol(text, identity.symbol);
      if (!mintVerified && !symbolOnly) {
        // Neither the exact mint nor the ticker appears: unrelated or colliding source.
        rejectedCollisionSources.push({ url: hit.url, reason: "NO_MINT_OR_TICKER_MATCH" });
        continue;
      }
      const sourceType = classifySourceType(hit.url);
      const independence = classifyIndependence({ url: hit.url, officialUrls });
      pushSource({
        ref: `S${sources.length + 1}`,
        url: hit.url,
        title: page?.title ?? hit.title,
        account: null,
        sourceType,
        reliabilityClass: classifyReliability(sourceType, mintVerified),
        independence,
        publishedAt: hit.publishedAt,
        fetchedAt: page?.fetchedAt ?? hit.fetchedAt,
        relevance: mintVerified
          ? "Mentions the exact mint address"
          : "Ticker match only — identity not confirmed",
        mintVerified,
        contentFetched: Boolean(page?.text),
        attributionConfidence: mintVerified
          ? page?.text
            ? "CONFIRMED"
            : "STRONG"
          : "WEAK",
        query: variant.query,
        excerpt: (page?.text ?? hit.snippet ?? "").slice(0, budget.maxSourceChars) || null,
      });
    }
  }
  const externalSearchUnavailable = searchTelemetry.attempts > 0 && !searchTelemetry.everSucceeded;
  const searchFailures = searchTelemetry.failedAttempts;
  const lastSearchError = searchTelemetry.lastError;
  // Search health travels ON the report, not only in run diagnostics.
  const searchHealthStatus: SearchHealthStatus = externalSearchUnavailable
    ? "SEARCH_UNAVAILABLE"
    : searchTelemetry.failedAttempts > 0
      ? "DEGRADED"
      : "READY";
  const searchHealth: DossierSearchHealth = {
    status: searchHealthStatus,
    provider: search.name,
    attempts: searchTelemetry.attempts,
    successfulAttempts: searchTelemetry.successfulAttempts,
    failedAttempts: searchTelemetry.failedAttempts,
    lastError: lastSearchError,
  };
  if (!stopReason) {
    stopReason =
      sources.length === 0
        ? externalSearchUnavailable
          ? "SEARCH_PROVIDER_UNAVAILABLE"
          : "NO_SOURCES_FOUND"
        : "NO_MORE_QUERIES";
  }

  const identityAttribution: AttributionConfidence = sources.some((s) => s.mintVerified)
    ? "CONFIRMED"
    : sources.length > 0
      ? "PROBABLE"
      : "UNRESOLVED";

  const generatedAt = new Date().toISOString();
  let dossier: ResearchDossier;
  let modelPasses = 0;
  let validationIssues: { code: string; detail: string }[] = [];
  let providerDiagnostics: Record<string, unknown> = {};

  if (sources.length === 0) {
    dossier = emptyDossier({
      mint: candidate.mint,
      chain: candidate.chain,
      symbol: identity.symbol,
      name: identity.name,
      generatedAt,
      searchHealth,
    });
  } else {
    const response = await provider.complete({
      system: buildSystemPrompt(),
      user: buildUserPrompt({
        mint: candidate.mint,
        chain: candidate.chain,
        symbol: identity.symbol,
        name: identity.name,
        requestedDomains: candidate.requestedDomains,
        triageQuestions: candidate.unresolvedQuestions,
        sources,
      }),
    });
    modelPasses = 1;
    providerDiagnostics = response.diagnostics;
    const parsed = parseJson(response.text);
    const validated = validateModelOutput(parsed, sources, {
      searchHealth: searchHealthStatus,
      researched: true,
    });
    validationIssues = validated.issues;
    dossier = assembleDossier({
      mint: candidate.mint,
      chain: candidate.chain,
      symbol: identity.symbol,
      name: identity.name,
      generatedAt,
      identityAttributionConfidence: identityAttribution,
      searchHealth,
      sources,
      validated,
    });
  }

  const noEvidence = dossier.claims.length === 0 || dossier.coverage.coveragePct === 0;
  // Absence of evidence only counts as a finding when the outside world was
  // actually reachable. Otherwise the honest answer is "we could not look".
  // A dossier built while search was unavailable is settled as SEARCH_LIMITED:
  // its partial evidence is preserved, but it never looks fully completed.
  const status: CandidateStatus = noEvidence
    ? externalSearchUnavailable
      ? "search_unavailable"
      : "insufficient_evidence"
    : externalSearchUnavailable
      ? "search_limited"
      : "completed";

  const durationMs = Date.now() - startedAt;

  const reportId = await insertReport({ runId, candidate, dossier, isCalibration, status });
  await insertSources(runId, reportId, dossier.sources);
  await insertClaims(runId, reportId, dossier.claims);
  await finishRun(runId, {
    status,
    stopReason,
    error: null,
    counts: { queries, fetches, passes: modelPasses },
    durationMs,
    eligibilityAfter: input.eligibility,
    diagnostics: {
      searchProvider: search.name,
      searchPolicyVersion: search.policyVersion,
      search: searchTelemetry,
      searchHealth: getExternalSearchHealth(),
      fetcher: fetcher.name,
      identityResolved: identity.resolved,
      officialLinkCount: identity.officialLinks.length,
      searchFailureCount: searchFailures,
      externalSearchUnavailable,
      lastSearchError,
      rejectedCollisionSourceCount: rejectedCollisionSources.length,
      rejectedCollisionSources: rejectedCollisionSources.slice(0, 20),
      independentSourceCount: dossier.coverage.independentSourceCount,
      projectOwnedSourceCount: dossier.coverage.projectOwnedSourceCount,
      projectAffiliatedSourceCount: dossier.coverage.projectAffiliatedSourceCount,
      validationIssues,
      provider: providerDiagnostics,
    },
  });

  return {
    mint: candidate.mint,
    symbol: identity.symbol,
    status,
    deepResearchRunId: runId,
    reportId,
    stopReason,
    queryCount: queries,
    sourceCount: dossier.coverage.sourceCount,
    verifiedSourceCount: dossier.sources.filter((s) => s.mintVerified).length,
    independentSourceCount: dossier.coverage.independentSourceCount,
    coveragePct: dossier.coverage.coveragePct,
    narrativeResolved: dossier.narrativeResolved,
    identityAttributionConfidence: dossier.identityAttributionConfidence,
    unresolvedGapCount: dossier.evidenceGaps.length,
    conflictingClaimCount: dossier.coverage.conflictingClaimCount,
    durationMs,
    blockedReasons: [],
    validationIssues,
    search: searchTelemetry,
    error: null,
    failureCode: null,
    failureType: null,
    retryable: false,
  };
}

function parseJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

function blockedResult(
  candidate: ShortlistedCandidate,
  runId: string,
  reasons: string[],
): DeepResearchCandidateResult {
  return {
    mint: candidate.mint,
    symbol: candidate.symbol,
    status: "blocked",
    deepResearchRunId: runId,
    reportId: null,
    stopReason: null,
    queryCount: 0,
    sourceCount: 0,
    verifiedSourceCount: 0,
    independentSourceCount: 0,
    coveragePct: 0,
    narrativeResolved: false,
    identityAttributionConfidence: "UNRESOLVED",
    unresolvedGapCount: 6,
    conflictingClaimCount: 0,
    durationMs: 0,
    blockedReasons: reasons,
    validationIssues: [],
    search: null,
    error: null,
    failureCode: null,
    failureType: null,
    retryable: false,
  };
}

function emptyBatch(
  mode: DeepResearchMode,
  code: DeepResearchRunCode,
  triageRunId: string | null,
  sourceScanId: string | null,
  provider: DeepResearchProvider | null,
): DeepResearchBatchResult {
  return {
    mode,
    code,
    isCalibration: mode === "calibration",
    triageRunId,
    sourceScanId,
    policyVersion: DEEP_RESEARCH_POLICY_VERSION,
    dossierVersion: DEEP_RESEARCH_DOSSIER_VERSION,
    promptVersion: DEEP_RESEARCH_PROMPT_VERSION,
    searchVersion: DEEP_RESEARCH_SEARCH_VERSION,
    searchProvider: getExternalSearchHealth().provider,
    searchHealth: getExternalSearchHealth(),
    modelProvider: provider?.provider ?? null,
    modelIdentifier: provider?.model ?? null,
    requested: 0,
    completed: 0,
    insufficient: 0,
    searchUnavailable: 0,
    blocked: 0,
    failed: 0,
    milestonesCreated: 0,
    skippedWithOutcome: 0,
    spendPolicyVersion: RESEARCH_SPEND_POLICY_VERSION,
    deferredRecentResearch: 0,
    deferredBudget: 0,
    spendDecisions: [],
    candidates: [],
  };
}

async function insertRun(input: {
  candidate: ShortlistedCandidate;
  provider: DeepResearchProvider;
  isCalibration: boolean;
  status: string;
  budget: ResearchBudget;
  eligibility: { researchEligibleNow: boolean; exclusionReasons: string[] };
  shortlistMilestoneId: string | null;
}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_runs")
    .insert({
      triage_run_id: input.candidate.triageRunId,
      triage_decision_id: input.candidate.decisionId,
      shortlist_milestone_id: input.shortlistMilestoneId,
      token_id: input.candidate.tokenId,
      mint: input.candidate.mint,
      chain: input.candidate.chain,
      research_packet_id: input.candidate.researchPacketId,
      research_packet_version: input.candidate.researchPacketVersion,
      research_policy_version: DEEP_RESEARCH_POLICY_VERSION,
      prompt_version: DEEP_RESEARCH_PROMPT_VERSION,
      model_provider: input.provider.provider,
      model_identifier: input.provider.model,
      is_calibration: input.isCalibration,
      status: input.status,
      budget: input.budget as unknown as never,
      eligibility_before: input.eligibility as unknown as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row)["id"] as string;
}

/**
 * Records the eligibility recheck performed after research finished. Reports,
 * sources, claims and milestones are never modified.
 */
async function recordEligibilityAfter(
  runId: string,
  after: { researchEligibleNow: boolean; exclusionReasons: string[] },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("deep_research_runs")
    .update({
      eligibility_after: {
        ...after,
        blockedAfterResearch: !after.researchEligibleNow,
        code: after.researchEligibleNow ? "ELIGIBLE" : "CURRENTLY_BLOCKED_AFTER_RESEARCH",
        recheckedAt: new Date().toISOString(),
      } as never,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

async function finishRun(

  runId: string,
  input: {
    status: string;
    stopReason: StopReason | null;
    error: string | null;
    counts: { queries: number; fetches: number; passes: number };
    durationMs: number;
    eligibilityAfter: unknown;
    diagnostics: Record<string, unknown>;
  },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("deep_research_runs")
    .update({
      status: input.status,
      stop_reason: input.stopReason,
      error: input.error,
      completed_at: new Date().toISOString(),
      duration_ms: input.durationMs,
      query_count: input.counts.queries,
      fetched_source_count: input.counts.fetches,
      model_pass_count: input.counts.passes,
      eligibility_after: input.eligibilityAfter as never,
      diagnostics: input.diagnostics as never,
    })
    .eq("id", runId);
  if (error) throw new Error(error.message);
}

async function insertReport(input: {
  runId: string;
  candidate: ShortlistedCandidate;
  dossier: ResearchDossier;
  isCalibration: boolean;
  status: CandidateStatus;
}): Promise<string> {
  const { dossier } = input;
  const { data, error } = await supabaseAdmin
    .from("deep_research_reports")
    .insert({
      deep_research_run_id: input.runId,
      token_id: input.candidate.tokenId,
      mint: input.candidate.mint,
      chain: input.candidate.chain,
      dossier_version: DEEP_RESEARCH_DOSSIER_VERSION,
      research_policy_version: DEEP_RESEARCH_POLICY_VERSION,
      is_calibration: input.isCalibration,
      status: input.status,
      one_sentence_narrative: dossier.oneSentenceNarrative,
      narrative_resolved: dossier.narrativeResolved,
      identity_attribution_confidence: dossier.identityAttributionConfidence,
      token_identity_confidence: dossier.tokenIdentityConfidence,
      project_attribution_confidence: dossier.projectAttributionConfidence,
      evidence_semantics_version: dossier.evidenceSemanticsVersion,
      search_health: dossier.searchHealth.status,
      search_failed_attempts: dossier.searchHealth.failedAttempts,
      community_source_count: dossier.coverage.communitySourceCount,
      on_chain_mirror_count: dossier.coverage.onChainMirrorCount,
      distinct_evidence_origins: dossier.coverage.distinctEvidenceOrigins,
      evidence_coverage_pct: dossier.coverage.coveragePct,
      covered_domains: dossier.coverage.coveredDomains,
      unresolved_domains: dossier.coverage.unresolvedDomains,
      source_count: dossier.coverage.sourceCount,
      primary_source_count: dossier.coverage.primarySourceCount,
      independent_source_count: dossier.coverage.independentSourceCount,
      project_owned_source_count: dossier.coverage.projectOwnedSourceCount,
      project_affiliated_source_count: dossier.coverage.projectAffiliatedSourceCount,
      unknown_independence_source_count: dossier.coverage.unknownIndependenceSourceCount,
      independent_domains_covered: dossier.coverage.independentDomainsCovered,
      corroborated_claim_count: dossier.coverage.corroboratedClaimCount,
      project_claim_count: dossier.coverage.projectClaimCount,
      search_version: dossier.searchVersion,
      source_domain_diversity: dossier.coverage.sourceDomainDiversity,
      conflicting_claim_count: dossier.coverage.conflictingClaimCount,
      unresolved_gap_count: dossier.evidenceGaps.length,
      dossier: dossier as unknown as never,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return (data as Row)["id"] as string;
}

async function insertSources(
  runId: string,
  reportId: string,
  sources: ResearchSource[],
): Promise<void> {
  if (sources.length === 0) return;
  const { error } = await supabaseAdmin.from("deep_research_sources").insert(
    sources.map((s) => ({
      deep_research_run_id: runId,
      report_id: reportId,
      source_ref: s.ref,
      url: s.url,
      title: s.title,
      account: s.account,
      source_type: s.sourceType,
      reliability_class: s.reliabilityClass,
      independence: s.independence,
      on_chain_mirror: s.onChainMirror,
      evidence_origin: s.evidenceOrigin,
      content_fetched: s.contentFetched,
      published_at: s.publishedAt,
      fetched_at: s.fetchedAt,
      relevance: s.relevance,
      mint_verified: s.mintVerified,
      attribution_confidence: s.attributionConfidence,
      query: s.query,
      excerpt: s.excerpt ? s.excerpt.slice(0, 2_000) : null,
    })),
  );
  if (error) throw new Error(error.message);
}

async function insertClaims(
  runId: string,
  reportId: string,
  claims: ResearchDossier["claims"],
): Promise<void> {
  if (claims.length === 0) return;
  const { error } = await supabaseAdmin.from("deep_research_claims").insert(
    claims.map((c) => ({
      deep_research_run_id: runId,
      report_id: reportId,
      domain: c.domain,
      claim: c.claim,
      claim_type: c.claimType,
      status: c.status,
      provenance: c.provenance,
      confidence: c.confidence,
      supporting_source_refs: c.supportingSourceRefs,
      contradicting_source_refs: c.contradictingSourceRefs,
      observed_at: c.observedAt,
      published_at: c.publishedAt,
    })),
  );
  if (error) throw new Error(error.message);
}

export interface DeepResearchReportSummary {
  id: string;
  runId: string;
  mint: string;
  symbol: string | null;
  isCalibration: boolean;
  status: string;
  createdAt: string;
  oneSentenceNarrative: string | null;
  narrativeResolved: boolean;
  identityAttributionConfidence: string;
  /** Null on legacy artifacts written before deep_research_evidence/v1.1. */
  evidenceSemanticsVersion: string | null;
  tokenIdentityConfidence: string | null;
  projectAttributionConfidence: string | null;
  searchHealth: string | null;
  searchFailedAttempts: number | null;
  communitySourceCount: number | null;
  onChainMirrorCount: number | null;
  distinctEvidenceOrigins: number | null;
  coveragePct: number | null;
  sourceCount: number;
  primarySourceCount: number;
  independentSourceCount: number;
  projectOwnedSourceCount: number;
  projectAffiliatedSourceCount: number;
  corroboratedClaimCount: number;
  searchVersion: string | null;
  conflictingClaimCount: number;
  unresolvedGapCount: number;
  unresolvedDomains: string[];
  dossier: ResearchDossier;
}

/** Newest dossiers, read-only, for the Research workbench. */
export async function loadDeepResearchReports(limit = 12): Promise<DeepResearchReportSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return ((data as Row[]) ?? []).map((r) => {
    const dossier = r["dossier"] as unknown as ResearchDossier;
    return {
      id: r["id"] as string,
      runId: r["deep_research_run_id"] as string,
      mint: r["mint"] as string,
      symbol: dossier?.symbol ?? null,
      isCalibration: Boolean(r["is_calibration"]),
      status: (r["status"] as string) ?? "unknown",
      createdAt: (r["created_at"] as string) ?? "",
      oneSentenceNarrative: (r["one_sentence_narrative"] as string) ?? null,
      narrativeResolved: Boolean(r["narrative_resolved"]),
      identityAttributionConfidence: (r["identity_attribution_confidence"] as string) ?? "UNRESOLVED",
      evidenceSemanticsVersion: dossier?.evidenceSemanticsVersion ?? null,
      tokenIdentityConfidence: dossier?.tokenIdentityConfidence ?? null,
      projectAttributionConfidence: dossier?.projectAttributionConfidence ?? null,
      searchHealth: dossier?.searchHealth?.status ?? null,
      searchFailedAttempts: dossier?.searchHealth?.failedAttempts ?? null,
      communitySourceCount: dossier?.coverage?.communitySourceCount ?? null,
      onChainMirrorCount: dossier?.coverage?.onChainMirrorCount ?? null,
      distinctEvidenceOrigins: dossier?.coverage?.distinctEvidenceOrigins ?? null,
      coveragePct: (r["evidence_coverage_pct"] as number) ?? null,
      sourceCount: (r["source_count"] as number) ?? 0,
      primarySourceCount: (r["primary_source_count"] as number) ?? 0,
      independentSourceCount: dossier?.coverage?.independentSourceCount ?? 0,
      projectOwnedSourceCount: dossier?.coverage?.projectOwnedSourceCount ?? 0,
      projectAffiliatedSourceCount: dossier?.coverage?.projectAffiliatedSourceCount ?? 0,
      corroboratedClaimCount: dossier?.coverage?.corroboratedClaimCount ?? 0,
      searchVersion: dossier?.searchVersion ?? null,
      conflictingClaimCount: (r["conflicting_claim_count"] as number) ?? 0,
      unresolvedGapCount: (r["unresolved_gap_count"] as number) ?? 0,
      unresolvedDomains: (r["unresolved_domains"] as string[]) ?? [],
      dossier,
    };
  });
}

export interface ExternalSearchStatus {
  provider: string;
  policyVersion: string;
  configured: boolean;
  /** Live process health plus the last persisted run's search telemetry. */
  readiness: ExternalSearchHealth["readiness"];
  lastFailureType: string | null;
  lastFailureDetail: string | null;
  lastRunAt: string | null;
  lastRunProvider: string | null;
  lastRunAttempts: number;
  lastRunSuccessfulAttempts: number;
  lastRunResultsReturned: number;
  lastRunOutcomes: Record<string, number>;
}

/**
 * External search readiness for the Research workbench: process health plus the
 * search telemetry of the most recent persisted deep research run.
 */
export async function loadExternalSearchStatus(): Promise<ExternalSearchStatus> {
  const live = getExternalSearchHealth();
  const configured = Boolean(process.env["LOVABLE_API_KEY"] && process.env["FIRECRAWL_API_KEY"]);

  const { data } = await supabaseAdmin
    .from("deep_research_runs")
    .select("created_at, diagnostics")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const row = (data as Row | null) ?? null;
  const diagnostics = (row?.["diagnostics"] as Record<string, unknown> | null) ?? null;
  const telemetry = (diagnostics?.["search"] as SearchTelemetry | undefined) ?? null;

  return {
    provider: telemetry?.provider ?? live.provider,
    policyVersion: EXTERNAL_SEARCH_POLICY_VERSION,
    configured,
    readiness: configured ? live.readiness : "UNAVAILABLE",
    lastFailureType: live.lastFailureType ?? null,
    lastFailureDetail: live.lastFailureDetail ?? telemetry?.lastError ?? null,
    lastRunAt: (row?.["created_at"] as string) ?? null,
    lastRunProvider: telemetry?.provider ?? null,
    lastRunAttempts: telemetry?.attempts ?? 0,
    lastRunSuccessfulAttempts: telemetry?.successfulAttempts ?? 0,
    lastRunResultsReturned: telemetry?.resultsReturned ?? 0,
    lastRunOutcomes: telemetry?.outcomes ?? {},
  };
}

/**
 * Marks a run row that was opened but never finished (provider crash, gateway
 * rejection) as failed. Reports, sources, claims and milestones are untouched.
 */
async function failDanglingRun(
  triageRunId: string,
  mint: string,
  message: string,
  failure: { type: ResearchFailureType; code: string; retryable: boolean },
): Promise<void> {
  const { error } = await supabaseAdmin
    .from("deep_research_runs")
    .update({
      status: "failed",
      error: message,
      completed_at: new Date().toISOString(),
      diagnostics: {
        failureType: failure.type,
        failureCode: failure.code,
        retryable: failure.retryable,
      } as never,
    })
    .eq("triage_run_id", triageRunId)
    .eq("mint", mint)
    .eq("status", "running");
  if (error) console.error("failDanglingRun", error.message);
}


/**
 * Mints of THIS production triage run whose most recent attempt was a retryable
 * execution failure. A mint with any persisted report (completed, partial,
 * insufficient evidence or search unavailable) or a blocked attempt is never
 * returned, so finished work is never rerun or overwritten.
 */
async function loadRetryableMints(triageRunId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_runs")
    .select("id, mint, status, error, started_at")
    .eq("triage_run_id", triageRunId)
    .eq("is_calibration", false)
    .order("started_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data as Row[]) ?? [];
  const runIds = rows.map((r) => r["id"] as string);
  const withReport = new Set<string>();
  if (runIds.length) {
    const { data: reports } = await supabaseAdmin
      .from("deep_research_reports")
      .select("deep_research_run_id")
      .in("deep_research_run_id", runIds);
    for (const r of (reports as Row[]) ?? []) {
      withReport.add(r["deep_research_run_id"] as string);
    }
  }

  const latest = new Map<string, Row>();
  const settled = new Set<string>();
  for (const row of rows) {
    const mint = row["mint"] as string;
    latest.set(mint, row);
    if (withReport.has(row["id"] as string)) settled.add(mint);
    const status = row["status"] as string;
    if (status === "blocked" || status === "running") settled.add(mint);
  }

  const retryable = new Set<string>();
  for (const [mint, row] of latest) {
    if (settled.has(mint)) continue;
    if ((row["status"] as string) !== "failed") continue;
    if (classifyResearchFailure(row["error"] as string | null).retryable) retryable.add(mint);
  }
  return retryable;
}

/**
 * Mints of THIS production triage run that already have any persisted attempt
 * (completed, partial, insufficient, blocked, running or failed). Used so
 * "Run Deep Research" only ever starts genuinely NOT_STARTED candidates and can
 * never rerun or overwrite finished work.
 */
async function loadAttemptedMints(triageRunId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("deep_research_runs")
    .select("mint")
    .eq("triage_run_id", triageRunId)
    .eq("is_calibration", false);
  if (error) throw new Error(error.message);
  return new Set(((data as Row[]) ?? []).map((r) => r["mint"] as string));
}
