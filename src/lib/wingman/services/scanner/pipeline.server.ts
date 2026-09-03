/**
 * Scanner v1 pipeline (server-only).
 *
 *   Birdeye discovery (many rankings)
 *     → dedupe by chain + contract, provenance preserved
 *     → cheap deterministic hard filters
 *     → lifecycle signals + quantitative priority
 *     → survivor cap
 *     → DexScreener enrichment + immutable snapshot + evidence
 *     → persistence
 *
 * Explicitly NOT here: AI, thesis scoring, opportunity creation, execution.
 * Expensive Birdeye holder-profile enrichment is NEVER fanned out over the
 * discovered universe — that decision belongs to a later stage.
 */
import { DEFAULT_CHAIN } from "../external/chains";
import { runDiscovery } from "../external/birdeye/discovery.server";
import { DexScreenerAdapter } from "../external/dexscreener";
import { normalizeIdentity, normalizeSnapshot } from "../external/dexscreener/normalizer";
import { insertSnapshot, upsertTokenIdentity } from "../ingestion.server";
import { snapshotToEvidence } from "../evidence/market-evidence";
import { appendEvidenceObservations } from "../evidence-persistence.server";
import { DISCOVERY_CONFIG_VERSION, runConfig, type ScannerRunConfig } from "./config";
import {
  assignRanks,
  dedupeDiscovered,
  evaluateCandidate,
  rankCandidates,
  selectSurvivorsWithReservations,
} from "./evaluate";
import { resolveMarkets } from "./market-eligibility.server";
import type { MarketResolution } from "./market-eligibility";
import { bucketDiagnostics, laneDiagnostics } from "./diagnostics";
import { deriveRecurrence } from "./recurrence";
import {
  deriveRefreshPlan,
  deriveRefreshState,
  EVIDENCE_REFRESH_DOMAINS,
  type DomainRefreshDecision,
  type EvidenceRefreshDomain,
  type RefreshDiagnostics,
} from "./refresh";
import {
  classifyUniverse,
  universeDiagnostics,
  type UniverseAssessment,
  type UniverseDiagnostics,
} from "./universe";
import {
  ConcurrentScanError,
  completeScanRun,
  failScanRun,
  loadEvidenceDomainAges,
  loadRecurrenceHistory,
  loadTokenContext,
  persistCandidates,
  resolveTokenIds,
  startScanRun,
} from "./persistence.server";
import { refreshOutcomes } from "../outcomes/outcome-persistence.server";
import { loadActiveStrategy } from "./settings.server";
import { TelemetryRecorder } from "./telemetry";
import {
  SCANNER_VERSION,
  type BucketDiagnosticRow,
  type EvaluatedCandidate,
  type LaneDiagnosticRow,
  type ProviderCallTelemetry,
} from "./types";

export interface ScanRunSummary {
  runId: string;
  scannerVersion: string;
  discoveryConfigVersion: string;
  calibrationMode: boolean;
  tokensDiscovered: number;
  passedHardFilters: number;
  quantitativelyRanked: number;
  enriched: number;
  survivorLimit: number;
  discoveryOutcomes: { queryId: string; ok: boolean; count: number; message: string | null }[];
  telemetry: ProviderCallTelemetry[];
  totalProviderRequests: number;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  buckets: BucketDiagnosticRow[];
  lanes: LaneDiagnosticRow[];
  laneReservationUsage: Record<string, number>;
  selectedByReservation: number;
  selectedByGlobalRanking: number;
  refresh: RefreshDiagnostics;
  universe: UniverseDiagnostics;
}

export interface RunScanResult {
  ok: boolean;
  summary: ScanRunSummary | null;
  message: string | null;
}

/** Enrich one survivor: fresh DexScreener pull → new immutable snapshot. */
async function enrichSurvivor(
  candidate: EvaluatedCandidate,
  runId: string,
  telemetry: TelemetryRecorder,
): Promise<boolean> {
  try {
    const selection = await telemetry.track("dexscreener", "market_data", () =>
      DexScreenerAdapter.resolvePrimaryPair(candidate.token.contractAddress, { noCache: true }),
    );
    const identity = normalizeIdentity(selection.primary, candidate.token.contractAddress);
    const snapshot = normalizeSnapshot(selection.primary);

    const token = await upsertTokenIdentity(identity);
    const inserted = await insertSnapshot(token.id, snapshot);

    const evidence = snapshotToEvidence(
      { ...snapshot, capturedAt: inserted.capturedAt },
      {
        pairAddress: identity.dexPairAddress,
        dexId: identity.primaryDexId,
        quoteTokenSymbol: identity.primaryQuoteTokenSymbol,
        quoteTokenAddress: identity.primaryQuoteTokenAddress,
        pairCreatedAt: identity.pairCreatedAt,
        eligiblePairCount: selection.eligible.length,
        rejectedPairCount: selection.rejectedCount,
        ambiguous: selection.ambiguous,
        selectionVersion: selection.version,
      },
    );
    // Evidence is linked to the scan run so history can be reconstructed.
    await appendEvidenceObservations(evidence, { tokenId: token.id, scanRunId: runId });
    return true;
  } catch {
    // Provider failure for one candidate never fails the scan.
    return false;
  }
}

/** Bounded concurrency so enrichment stays polite to both providers. */
async function mapWithLimit<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      await fn(items[index]!);
    }
  });
  await Promise.all(workers);
}

export async function runScannerPipeline(
  overrides: Partial<ScannerRunConfig> = {},
): Promise<RunScanResult> {
  const activeStrategy = await loadActiveStrategy();
  const config = runConfig({ strategy: activeStrategy.settings, ...overrides });
  const telemetry = new TelemetryRecorder();
  const startedAt = new Date().toISOString();

  let runId: string;
  try {
    runId = await startScanRun({
      calibrationMode: config.calibrationMode,
      discoveryConfigVersion: DISCOVERY_CONFIG_VERSION,
      strategy: config.strategy,
    });
  } catch (error) {
    if (error instanceof ConcurrentScanError) {
      return { ok: false, summary: null, message: "A scan is already running." };
    }
    return {
      ok: false,
      summary: null,
      message: error instanceof Error ? error.message : "Could not start scan.",
    };
  }

  try {
    const discovery = await runDiscovery({
      chain: config.chain,
      limit: config.discoveryPageSize,
      track: (provider, capability, fn) => telemetry.track(provider, capability, fn),
    });

    const deduped = dedupeDiscovered(discovery.tokens);
    const nowIso = new Date().toISOString();

    // Age fallbacks + prior snapshots for tokens Wingman already knows.
    const context = await loadTokenContext(deduped.map((t) => t.contractAddress));

    const evaluateWith = (
      token: (typeof deduped)[number],
      market: MarketResolution | null,
      requireMarket: boolean,
      universe: UniverseAssessment | null = null,
    ) => {
      const ctx = context.get(token.contractAddress);
      return evaluateCandidate(token, {
        nowIso,
        history: ctx?.history ?? [],
        strategy: config.strategy,
        requireMarket,
        market,
        universe,
        ageFallbacks: {
          pairCreatedAt: ctx?.pairCreatedAt ?? null,
          tokenCreatedAt: ctx?.tokenCreatedAt ?? null,
        },
      });
    };

    // Pass 1: cheap mechanical filters, no provider calls.
    const firstPass = deduped.map((token) => evaluateWith(token, null, false));

    // Pass 2: universal live-market gate over the mechanical survivors only.
    const marketCandidates = firstPass.filter((c) => c.passedHardFilters);
    const markets = await resolveMarkets(
      marketCandidates.map((c) => c.token.contractAddress),
      { track: (provider, capability, fn) => telemetry.track(provider, capability, fn) },
    );

    // Pass 3: mandate eligibility, applied AFTER identity + market resolution
    // and BEFORE setup qualification / survivor selection. UNKNOWN is eligible.
    const evaluated = firstPass.map((candidate) => {
      if (!candidate.passedHardFilters) return candidate;
      const address = candidate.token.contractAddress;
      return evaluateWith(
        candidate.token,
        markets.get(address) ?? null,
        true,
        classifyUniverse(address),
      );
    });

    const ranked = assignRanks(rankCandidates(evaluated));
    const selection = selectSurvivorsWithReservations(
      ranked,
      config.survivorEnrichmentLimit,
      config.strategy.reservations,
      config.strategy,
    );
    const survivors = selection.survivors;

    // Persist survivors first, then rejected candidates up to the cap.
    const survivorSet = new Set(survivors.map((s) => s.token.contractAddress));
    const others = ranked.filter((c) => !survivorSet.has(c.token.contractAddress));
    const toPersist = [...survivors, ...others.slice(0, config.maxPersistedRejections)];

    // Recurrence awareness: descriptive only, derived AFTER every selection
    // decision so it can never influence ranking, filtering or survivors.
    const recurrenceHistory = await loadRecurrenceHistory(
      toPersist.map((c) => c.token.contractAddress),
      runId,
    );
    const domainAges = await loadEvidenceDomainAges(
      toPersist
        .map((c) => context.get(c.token.contractAddress)?.tokenId)
        .filter((id): id is string => Boolean(id)),
    );
    for (const candidate of toPersist) {
      candidate.recurrence = deriveRecurrence({
        current: {
          setups: candidate.lanes,
          quantitativePriority: candidate.quantitativePriority,
          activityState: candidate.signals.activityState,
          persistenceSignal: candidate.signals.persistenceSignal,
          reaccelerationSignal: candidate.signals.reaccelerationSignal,
        },
        appearances: recurrenceHistory.byAddress.get(candidate.token.contractAddress) ?? [],
        recentRunIds: recurrenceHistory.recentRunIds,
      });

      // Refresh urgency decides only whether we spend provider calls. It never
      // changes priority, setup classification or survivor membership. Every
      // evidence domain is decided independently: recurrence is market-derived
      // and must not invalidate fresh holder/creator/provenance evidence.
      const ctx = context.get(candidate.token.contractAddress);
      const history = ctx?.history ?? [];
      const lastMarketAt = history.length ? history[history.length - 1]!.capturedAt : null;
      const stored = (ctx?.tokenId ? domainAges.get(ctx.tokenId) : undefined) ?? {};
      candidate.refreshPlan = deriveRefreshPlan({
        recurrenceState: candidate.recurrence.state,
        nowIso,
        lastObservedAt: {
          market: lastMarketAt ?? stored["market"] ?? null,
          holders: stored["holders"] ?? null,
          creator: stored["creator"] ?? null,
          provenance: stored["provenance"] ?? null,
        },
      });
      candidate.refresh = deriveRefreshState({
        recurrenceState: candidate.recurrence.state,
        lastEnrichedAt: lastMarketAt,
        nowIso,
      });
    }

    // Enrichment: survivors keep their slot, but an unchanged repeat with still
    // valid market evidence reuses it instead of refetching. Freed capacity
    // naturally goes to NEW / CHANGED / RETURNING candidates.
    const marketState = (c: (typeof survivors)[number]) =>
      c.refreshPlan?.domains.market.state ?? c.refresh?.state ?? "REFRESH_REQUIRED";
    const needsEnrichment = survivors.filter((s) => marketState(s) !== "CARRY_FORWARD");
    const carriedForward = survivors.filter((s) => marketState(s) === "CARRY_FORWARD");
    for (const candidate of carriedForward) {
      candidate.evidenceCarriedForward = true;
    }

    await mapWithLimit(needsEnrichment, 4, async (candidate) => {
      const ok = await enrichSurvivor(candidate, runId, telemetry);
      candidate.enriched = ok;
      if (ok) candidate.stageReached = "enriched";
    });

    const domainCount = (
      pick: (d: DomainRefreshDecision) => boolean,
    ): Record<EvidenceRefreshDomain, number> => {
      const counts = {} as Record<EvidenceRefreshDomain, number>;
      for (const domain of EVIDENCE_REFRESH_DOMAINS) {
        counts[domain] = toPersist.filter((c) => {
          const decision = c.refreshPlan?.domains[domain];
          return decision ? pick(decision) : false;
        }).length;
      }
      return counts;
    };

    const refreshDiagnostics: RefreshDiagnostics = {
      newCount: toPersist.filter((c) => c.recurrence?.state === "NEW").length,
      changedCount: toPersist.filter((c) => c.recurrence?.state === "CHANGED").length,
      returningCount: toPersist.filter((c) => c.recurrence?.state === "RETURNING").length,
      repeatCount: toPersist.filter((c) => c.recurrence?.state === "REPEAT").length,
      refreshRequired: toPersist.filter((c) => c.refreshPlan?.state === "REFRESH_REQUIRED").length,
      refreshOptional: toPersist.filter((c) => c.refreshPlan?.state === "REFRESH_OPTIONAL").length,
      carryForward: toPersist.filter((c) => c.refreshPlan?.state === "CARRY_FORWARD").length,
      freshEnrichments: survivors.filter((s) => s.enriched).length,
      carriedForwardSurvivors: carriedForward.length,
      // Only the market domain has an executable refresh path today, so the
      // carried survivors are exactly the calls actually avoided.
      enrichmentRequestsAvoided: carriedForward.length,
      candidatesRequiringRefresh: toPersist.filter(
        (c) => c.refreshPlan?.state !== "CARRY_FORWARD",
      ).length,
      candidatesUsingCarriedEvidence: toPersist.filter((c) =>
        EVIDENCE_REFRESH_DOMAINS.some((d) => c.refreshPlan?.domains[d].carriedForward),
      ).length,
      domainRefreshes: domainCount((d) => d.state === "REFRESH_REQUIRED"),
      domainsCarriedForward: domainCount((d) => d.carriedForward),
      providerRequestsExecuted: telemetry.totalRequests(),
      // Honest accounting: a carried holder/creator/provenance domain is NOT an
      // avoided request, because the scanner has no call for it yet.
      providerRequestsAvoided: carriedForward.length,
    };

    const universe = universeDiagnostics(
      evaluated.map((c) => ({
        eligibility: c.universe?.eligibility ?? "UNKNOWN",
        category: c.universe?.category ?? null,
      })),
    );

    const tokenIds = await resolveTokenIds(toPersist.map((c) => c.token));

    // Structural Eligibility v1 — SHADOW MODE. Derived AFTER every ranking,
    // setup and survivor decision, so it cannot influence any of them.
    let structural: StructuralDiagnostics | null = null;
    try {
      const targets: StructuralTarget[] = toPersist.map((c) => ({
        contractAddress: c.token.contractAddress,
        chain: c.token.chain,
        tokenId: tokenIds.get(c.token.contractAddress) ?? null,
        market: markets.get(c.token.contractAddress) ?? null,
      }));
      const evaluations = await evaluateStructuralForTargets(targets, {
        evaluatedAt: new Date().toISOString(),
      });
      for (const candidate of toPersist) {
        candidate.structural = evaluations.get(candidate.token.contractAddress) ?? null;
      }
      structural = structuralDiagnostics([...evaluations.values()]);
      await persistStructuralEvaluations(runId, targets, evaluations);
    } catch (structuralError) {
      // Structural bookkeeping never fails a scan and never blocks survivors.
      console.error(
        "structural evaluation failed",
        structuralError instanceof Error ? structuralError.message : structuralError,
      );
    }

    await persistCandidates(runId, toPersist, tokenIds);




    const passedHardFilters = evaluated.filter((c) => c.passedHardFilters).length;
    const quantitativelyRanked = evaluated.filter(
      (c) => c.passedHardFilters && c.quantitativePriority !== null,
    ).length;
    const enriched = survivors.filter((s) => s.enriched).length;
    const completedAt = new Date().toISOString();
    const buckets = bucketDiagnostics(evaluated);
    const lanes = laneDiagnostics(evaluated);

    const summary: ScanRunSummary = {
      runId,
      scannerVersion: SCANNER_VERSION,
      discoveryConfigVersion: DISCOVERY_CONFIG_VERSION,
      calibrationMode: config.calibrationMode,
      tokensDiscovered: deduped.length,
      passedHardFilters,
      quantitativelyRanked,
      enriched,
      survivorLimit: config.survivorEnrichmentLimit,
      discoveryOutcomes: discovery.outcomes,
      telemetry: telemetry.snapshot(),
      totalProviderRequests: telemetry.totalRequests(),
      startedAt,
      completedAt,
      durationMs: Date.parse(completedAt) - Date.parse(startedAt),
      buckets,
      lanes,
      laneReservationUsage: selection.laneUsage,
      selectedByReservation: selection.reservedCount,
      selectedByGlobalRanking: selection.globalCount,
      refresh: refreshDiagnostics,
      universe,
    };

    await completeScanRun({
      runId,
      tokensDiscovered: summary.tokensDiscovered,
      passedHardFilters,
      quantitativelyRanked,
      enriched,
      telemetry: summary.telemetry,
      bucketDiagnostics: buckets,
      laneDiagnostics: lanes,
      durationMs: summary.durationMs,
      survivorLimit: config.survivorEnrichmentLimit,
      recurrenceDiagnostics: refreshDiagnostics,
      refreshDiagnostics,
      universeDiagnostics: universe,
      notes: `${SCANNER_VERSION} · ${DISCOVERY_CONFIG_VERSION}`,
    });

    // Outcome tracking runs LAST, once the run is completed, and is purely
    // observational: nothing it writes is ever read back into ranking,
    // filtering, setup classification or survivor selection.
    try {
      const addressByTokenId = new Map<string, string>();
      for (const candidate of toPersist) {
        const id = tokenIds.get(candidate.token.contractAddress);
        if (id) addressByTokenId.set(id, candidate.token.contractAddress);
      }
      await refreshOutcomes([...addressByTokenId.keys()], addressByTokenId);
    } catch (outcomeError) {
      // Outcome bookkeeping never fails a completed scan.
      console.error(
        "refreshOutcomes failed",
        outcomeError instanceof Error ? outcomeError.message : outcomeError,
      );
    }

    return { ok: true, summary, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    // A failed run is isolated; earlier completed runs stay untouched.
    await failScanRun(runId, message);
    console.error("runScannerPipeline failed", message);
    return { ok: false, summary: null, message };
  }
}
