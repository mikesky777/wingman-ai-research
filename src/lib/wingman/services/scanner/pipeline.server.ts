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
import { assessDiscoveryHealth, isDiscoveryUsable } from "./discovery-health";
import { DEFAULT_CHAIN } from "../external/chains";
import { checkBirdeyeReadiness } from "../external/birdeye/readiness.server";
import { readinessBlockReason, shouldFailFast } from "../external/birdeye/readiness";
import { runDiscovery } from "../external/birdeye/discovery.server";

import { DexScreenerAdapter } from "../external/dexscreener";
import { normalizeIdentity, normalizeSnapshot } from "../external/dexscreener/normalizer";
import { insertSnapshot, upsertTokenIdentity } from "../ingestion.server";
import { snapshotToEvidence } from "../evidence/market-evidence";
import { appendEvidenceObservations } from "../evidence-persistence.server";
import { DISCOVERY_CONFIG_VERSION, runConfig, type ScannerRunConfig } from "./config";
import type { RunScanCode } from "./run-lifecycle";
import {
  assignRanks,
  dedupeDiscovered,
  evaluateCandidate,
  rankCandidates,
  selectSurvivorsWithReservations,
} from "./evaluate";
import { resolveMarketsDetailed } from "./market-eligibility.server";
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
  structuralDiagnostics,
  type StructuralDiagnostics,
} from "./structural";
import {
  evaluateStructuralForTargets,
  persistStructuralEvaluations,
  type StructuralTarget,
} from "./structural.server";
import { isStructurallyEligible } from "./structural";
import {
  evaluatePriceIntegrityForTargets,
  EMPTY_PRICE_INTEGRITY_DIAGNOSTICS,
  type PriceIntegrityDiagnostics,
  type PriceIntegrityTarget,
} from "./price-integrity.server";
import {
  evaluateParticipationForTargets,
  EMPTY_PARTICIPATION_DIAGNOSTICS,
  type ParticipationDiagnostics,
  type ParticipationTarget,
} from "./participation.server";
import { SETUP_VOLUME_FLOOR_TOO_LOW } from "./lanes";
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
  recordDiscoveryHealth,
  recordResearchPacketResult,
} from "./persistence.server";
import { refreshOutcomes } from "../outcomes/outcome-persistence.server";
import { recordScanMilestones } from "../history/milestones.server";
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
  /** Shadow-mode structural counts. Never affects selection. */
  structural: StructuralDiagnostics | null;
  /** BASE 24h-volume floor effect for this run. */
  baseVolumeFloor: {
    thresholdUsd: number | null;
    qualifiedBase: number;
    removedByVolumeFloor: number;
    baseBeforeVolumeFloor: number;
    volumeUnavailable: number;
  };
  /** Price / Launch Integrity (shadow). Never affects selection. */
  priceIntegrity: PriceIntegrityDiagnostics;
  /** Participation Quality (shadow). Never affects selection. */
  participation: ParticipationDiagnostics;
  /** Survivor composition: setup counts, NONE exceptions and unused capacity. */
  survivors: SurvivorDiagnostics;
}

/** Run-level survivor composition. `survivorLimit` is a maximum, not a target. */
export interface SurvivorDiagnostics {
  survivorLimit: number;
  survivorCount: number;
  baseSurvivors: number;
  reaccelSurvivors: number;
  momentumSurvivors: number;
  reservationSurvivors: number;
  recognizedGlobalSurvivors: number;
  noneGlobalSurvivors: number;
  maxNoneGlobalSurvivors: number;
  noneSkippedByCap: number;
  unusedCapacity: number;
  underFilled: boolean;
}

export interface RunScanResult {
  ok: boolean;
  summary: ScanRunSummary | null;
  message: string | null;
  /** Machine-readable outcome of this attempt. */
  code: RunScanCode;
  /** Run this attempt started, when it started one. */
  runId: string | null;
  /** Run already holding the lock, when the attempt was rejected. */
  activeRunId: string | null;
  /**
   * Canonical Research Packet generation for THIS run. Diagnostic only: a
   * packet failure never invalidates the scan, it only blocks AI triage until
   * the packets are regenerated (the step is idempotent and retryable).
   */
  researchPackets: {
    attempted: boolean;
    generated: number;
    persisted: number;
    eligibleNow: number;
    error: string | null;
  };
}

export type ResearchPacketStepResult = RunScanResult["researchPackets"];

const NO_PACKET_ATTEMPT: ResearchPacketStepResult = {
  attempted: false,
  generated: 0,
  persisted: 0,
  eligibleNow: 0,
  error: null,
};

/**
 * Generate the canonical Research Packets for one completed scan.
 *
 * Idempotent by construction: packet storage is append-only and triage always
 * reads the newest packet per mint from THIS run, so a retry is safe. Never
 * throws — a packet failure is diagnostic and must not invalidate the scan.
 */
export async function generatePacketsForRunSafely(
  scanRunId: string,
): Promise<ResearchPacketStepResult> {
  try {
    const { generateResearchPackets } = await import("../research/packet.server");
    const result = await generateResearchPackets({ scanRunId, persist: true });
    const persisted = result.persistedCount ?? result.packets.length;
    await recordResearchPacketResult(scanRunId, {
      status: persisted > 0 ? "READY" : "NOT_STARTED",
      count: persisted,
      error: null,
    }).catch(() => undefined);
    return {
      attempted: true,
      generated: result.packets.length,
      persisted,
      eligibleNow: result.packets.filter((p) => p.packet.eligibility.researchEligibleNow).length,
      error: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("generateResearchPackets failed", message);
    await recordResearchPacketResult(scanRunId, {
      status: "FAILED",
      count: 0,
      error: message,
    }).catch(() => undefined);
    return { attempted: true, generated: 0, persisted: 0, eligibleNow: 0, error: message };

  }
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

/**
 * Full Cycle only: create the durable scan row BEFORE any provider work, so
 * the orchestrator can persist the exact scan id on the cycle first and
 * recovery always evaluates that same row. Manual scans never use this.
 */
export async function createCycleScanRun(input: {
  productionCycleRunId: string;
  executionOwner: string;
}): Promise<string> {
  const activeStrategy = await loadActiveStrategy();
  const config = runConfig({ strategy: activeStrategy.settings });
  return startScanRun({
    calibrationMode: config.calibrationMode,
    discoveryConfigVersion: DISCOVERY_CONFIG_VERSION,
    strategy: config.strategy,
    productionCycleRunId: input.productionCycleRunId,
    executionOwner: input.executionOwner,
  });
}

export interface ScannerExecutionOptions {
  /** Execute into this already-created run instead of inserting a new one. */
  existingRunId?: string;
  /** Backend owner keeping the scan-level liveness heartbeat alive. */
  executionOwner?: string;
}

export async function runScannerPipeline(
  overrides: Partial<ScannerRunConfig> = {},
  execution: ScannerExecutionOptions = {},
): Promise<RunScanResult> {
  const activeStrategy = await loadActiveStrategy();
  const config = runConfig({ strategy: activeStrategy.settings, ...overrides });
  const telemetry = new TelemetryRecorder();
  const startedAt = new Date().toISOString();

  let runId: string;
  if (execution.existingRunId) {
    runId = execution.existingRunId;
  } else {
    try {
      runId = await startScanRun({
        calibrationMode: config.calibrationMode,
        discoveryConfigVersion: DISCOVERY_CONFIG_VERSION,
        strategy: config.strategy,
      });
    } catch (error) {
      if (error instanceof ConcurrentScanError) {
        return {
          ok: false,
          summary: null,
          message: "A scan is already running.",
          code: "ALREADY_RUNNING",
          runId: null,
          activeRunId: error.activeRunId,
          researchPackets: NO_PACKET_ATTEMPT,
        };
      }
      return {
        ok: false,
        summary: null,
        message: error instanceof Error ? error.message : "Could not start scan.",
        code: "FAILED",
        runId: null,
        activeRunId: null,
        researchPackets: NO_PACKET_ATTEMPT,
      };
    }
  }

  // Scan-level liveness: while this execution is genuinely working, recovery
  // must be able to see it and stay away.
  const owner = execution.executionOwner ?? null;
  const heartbeat = owner
    ? setInterval(() => {
        void heartbeatScanExecution(runId, owner).catch(() => undefined);
      }, 20_000)
    : null;
  if (heartbeat && typeof heartbeat === "object" && "unref" in heartbeat) {
    (heartbeat as unknown as { unref: () => void }).unref();
  }
  try {
    return await executeScannerPipeline({ runId, config, telemetry, startedAt });
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
}

async function executeScannerPipeline(args: {
  runId: string;
  config: ScannerRunConfig;
  telemetry: TelemetryRecorder;
  startedAt: string;
}): Promise<RunScanResult> {
  const { runId, config, telemetry, startedAt } = args;


  try {
    // Preflight: one cheap authoritative call. A definitively blocked provider
    // (quota exhausted, credentials rejected, not configured) fails the run
    // fast, before the ten discovery queries are issued. Uncertain states —
    // ordinary rate limits, transport hiccups — still attempt a normal scan.
    const readiness = await checkBirdeyeReadiness();
    if (shouldFailFast(readiness)) {
      const reason = readinessBlockReason(readiness);
      await recordDiscoveryHealth(runId, {
        state: "PROVIDER_UNAVAILABLE",
        queries: 0,
        successes: 0,
        failures: 0,
        tokens: 0,
        failureMessages: readiness.reason ? [readiness.reason] : [],
        reason,
      });
      throw new Error(reason);
    }

    const discovery = await runDiscovery({
      chain: config.chain,
      limit: config.discoveryPageSize,
      track: (provider, capability, fn) => telemetry.track(provider, capability, fn),
    });


    // A run that discovered nothing because every discovery query failed did
    // not observe an empty market — it observed nothing at all. Failing it
    // keeps recurrence, absence and policy denominators honest.
    const discoveryHealth = assessDiscoveryHealth(discovery.outcomes, discovery.tokens.length);
    await recordDiscoveryHealth(runId, discoveryHealth);
    if (!isDiscoveryUsable(discoveryHealth)) {
      throw new Error(discoveryHealth.reason ?? "Discovery provider unavailable. Scan aborted.");
    }

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
    const marketResolution = await resolveMarketsDetailed(
      marketCandidates.map((c) => c.token.contractAddress),
      { track: (provider, capability, fn) => telemetry.track(provider, capability, fn) },
    );
    const markets = marketResolution.resolutions;

    // A total market-lookup outage is a provider failure, never evidence that
    // the whole universe is unqualified. Abort the run instead of persisting
    // hundreds of false rejections (earlier runs and history stay untouched).
    if (marketResolution.batches > 0 && marketResolution.failedBatches === marketResolution.batches) {
      throw new Error(
        `DexScreener market lookup was unavailable for the entire universe (${marketResolution.batches} batches failed${
          marketResolution.errorCodes.length ? `: ${marketResolution.errorCodes.join(", ")}` : ""
        }). Scan aborted; no candidates were rejected.`,
      );
    }

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

    // Structural Eligibility v1 — evaluated BEFORE survivor allocation so a
    // structural FAIL can veto selection. It never touches ranking, priority,
    // setup classification, recurrence or outcomes.
    const structuralPool = ranked.filter(
      (c) => c.passedHardFilters && c.quantitativePriority !== null,
    );
    let structural: StructuralDiagnostics | null = null;
    try {
      const structuralTargets: StructuralTarget[] = structuralPool.map((c) => ({
        contractAddress: c.token.contractAddress,
        chain: c.token.chain,
        tokenId: context.get(c.token.contractAddress)?.tokenId ?? null,
        market: markets.get(c.token.contractAddress) ?? null,
      }));
      const evaluations = await evaluateStructuralForTargets(structuralTargets, {
        evaluatedAt: new Date().toISOString(),
      });
      for (const candidate of structuralPool) {
        candidate.structural = evaluations.get(candidate.token.contractAddress) ?? null;
      }
      structural = structuralDiagnostics([...evaluations.values()]);
      await persistStructuralEvaluations(runId, structuralTargets, evaluations);
    } catch (structuralError) {
      // A structural bookkeeping failure never fails a scan. With no evaluation
      // there is no FAIL, so nothing is vetoed — never a silent exclusion.
      console.error(
        "structural evaluation failed",
        structuralError instanceof Error ? structuralError.message : structuralError,
      );
    }

    // Counterfactual allocation used only for diagnostics; the real selection
    // below runs last and owns the persisted membership flags.
    const baseline = selectSurvivorsWithReservations(
      ranked,
      config.survivorEnrichmentLimit,
      config.strategy.reservations,
      config.strategy,
      { structuralVeto: false, marketDamageVeto: false },
    );
    const baselineSet = new Set(baseline.survivors.map((s) => s.token.contractAddress));

    const selection = selectSurvivorsWithReservations(
      ranked,
      config.survivorEnrichmentLimit,
      config.strategy.reservations,
      config.strategy,
    );
    const survivors = selection.survivors;

    // Recent Catastrophic Collapse exclusions. Descriptive log only: the
    // candidates remain fully persisted and visible in Calibration.
    if (selection.marketDamageVetoed.length > 0) {
      console.info(
        "recent catastrophic collapse gate excluded",
        selection.marketDamageVetoed.length,
        "candidates from survivor selection",
      );
    }


    // Price / Launch Integrity v1 — SHADOW / CALIBRATION. Runs AFTER selection
    // so it can never influence it, and only for the narrow set where launch
    // structure is meaningful: structurally eligible, in-scope BASE survivors.
    let priceIntegrity: PriceIntegrityDiagnostics = { ...EMPTY_PRICE_INTEGRITY_DIAGNOSTICS };
    try {
      const historyTargets: PriceIntegrityTarget[] = survivors
        .filter(
          (c) =>
            c.lanes.includes("BASE") &&
            isStructurallyEligible(c.structural?.status ?? null) &&
            (c.universe?.eligibility ?? "UNKNOWN") !== "OUT_OF_SCOPE",
        )
        .map((c) => {
          const ctx = context.get(c.token.contractAddress);
          return {
            contractAddress: c.token.contractAddress,
            chain: c.token.chain,
            launchAt:
              ctx?.pairCreatedAt ?? ctx?.tokenCreatedAt ?? c.token.listedAt ?? null,
            setups: c.lanes,
            pairAddress: markets.get(c.token.contractAddress)?.pairAddress ?? null,
          };
        });
      const result = await evaluatePriceIntegrityForTargets(historyTargets, {
        track: (fn) => telemetry.track("birdeye", "price_history", fn),
      });
      for (const candidate of survivors) {
        candidate.priceIntegrity = result.evaluations.get(candidate.token.contractAddress) ?? null;
      }
      priceIntegrity = result.diagnostics;
    } catch (priceError) {
      console.error(
        "price integrity evaluation failed",
        priceError instanceof Error ? priceError.message : priceError,
      );
    }

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
          participation: stored["participation"] ?? null,
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

    // Participation Quality v1 — SHADOW / CALIBRATION. Runs AFTER selection so
    // it can never influence it, and only for the narrow competitive set:
    // structurally eligible, in-scope BASE / REACCEL survivors. One Birdeye
    // request per evaluated token; fresh stored evidence is reused instead.
    let participation: ParticipationDiagnostics = { ...EMPTY_PARTICIPATION_DIAGNOSTICS };
    try {
      const participationTargets: ParticipationTarget[] = survivors
        .filter(
          (c) =>
            (c.lanes.includes("BASE") || c.lanes.includes("REACCEL")) &&
            isStructurallyEligible(c.structural?.status ?? null) &&
            (c.universe?.eligibility ?? "UNKNOWN") !== "OUT_OF_SCOPE",
        )
        .map((c) => ({
          contractAddress: c.token.contractAddress,
          chain: c.token.chain,
          tokenId: context.get(c.token.contractAddress)?.tokenId ?? null,
          liquidityUsd: c.token.liquidityUsd ?? null,
          volumeToLiquidity24h: c.metrics.volumeToLiquidity24h ?? null,
          turnover24h: c.metrics.volumeToMarketCap24h ?? null,
          carryForward: c.refreshPlan?.domains.participation.state === "CARRY_FORWARD",
        }));
      const result = await evaluateParticipationForTargets(participationTargets, {
        scanRunId: runId,
        track: (fn) => telemetry.track("birdeye", "token_trade_data", fn),
      });
      for (const candidate of survivors) {
        candidate.participation = result.evaluations.get(candidate.token.contractAddress) ?? null;
      }
      participation = result.diagnostics;
    } catch (participationError) {
      console.error(
        "participation evaluation failed",
        participationError instanceof Error ? participationError.message : participationError,
      );
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

    // Selection effects of the structural veto. OUT_OF_SCOPE candidates were
    // already removed by Universe Eligibility before structural evaluation ran,
    // so the two exclusion counts are disjoint by construction.
    if (structural) {
      const status = (c: EvaluatedCandidate) => c.structural?.status ?? "UNKNOWN";
      structural = {
        ...structural,
        selection: {
          failRemovedBeforeSelection: selection.structurallyVetoed.length,
          failWouldHaveBeenSurvivors: baseline.survivors.filter((s) => status(s) === "FAIL").length,
          slotsBackfilled: survivors.filter((s) => !baselineSet.has(s.token.contractAddress)).length,
          survivorsByStatus: {
            pass: survivors.filter((s) => status(s) === "PASS").length,
            concern: survivors.filter((s) => status(s) === "CONCERN").length,
            unknown: survivors.filter((s) => status(s) === "UNKNOWN").length,
            fail: survivors.filter((s) => status(s) === "FAIL").length,
          },
          outOfScopeRemoved: universe.outOfScope,
        },
      };
    }

    const tokenIds = await resolveTokenIds(toPersist.map((c) => c.token));

    await persistCandidates(runId, toPersist, tokenIds);





    const passedHardFilters = evaluated.filter((c) => c.passedHardFilters).length;
    const quantitativelyRanked = evaluated.filter(
      (c) => c.passedHardFilters && c.quantitativePriority !== null,
    ).length;
    const enriched = survivors.filter((s) => s.enriched).length;
    const completedAt = new Date().toISOString();
    const buckets = bucketDiagnostics(evaluated);
    const lanes = laneDiagnostics(evaluated);

    const baseFloor = config.strategy.setups.BASE.minVolume24hUsd;
    const floorPrefix = SETUP_VOLUME_FLOOR_TOO_LOW("BASE");
    const qualifiedBase = evaluated.filter((c) => c.lanes.includes("BASE")).length;
    const removedByVolumeFloor = evaluated.filter((c) =>
      (c.laneRejections["BASE"] ?? "").startsWith(floorPrefix),
    ).length;
    const volumeUnavailable = evaluated.filter((c) =>
      (c.laneRejections["BASE"] ?? "").startsWith("BASE_VOLUME_24H_UNAVAILABLE"),
    ).length;

    // Survivor composition. `survivorLimit` is a MAXIMUM, never a target: a run
    // legitimately returns fewer survivors when the market offers no more.
    const setupSurvivors = (setup: "BASE" | "REACCEL" | "MOMENTUM") =>
      survivors.filter((s) => s.lanes.includes(setup)).length;
    const survivorDiagnostics: SurvivorDiagnostics = {
      survivorLimit: config.survivorEnrichmentLimit,
      survivorCount: survivors.length,
      baseSurvivors: setupSurvivors("BASE"),
      reaccelSurvivors: setupSurvivors("REACCEL"),
      momentumSurvivors: setupSurvivors("MOMENTUM"),
      reservationSurvivors: selection.reservedCount,
      recognizedGlobalSurvivors: selection.recognizedGlobalCount,
      noneGlobalSurvivors: selection.noneGlobalCount,
      maxNoneGlobalSurvivors: selection.maxNoneGlobalSurvivors,
      noneSkippedByCap: selection.noneSkippedByCap.length,
      unusedCapacity: selection.unusedCapacity,
      underFilled: selection.unusedCapacity > 0,
    };

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
      structural,
      baseVolumeFloor: {
        thresholdUsd: baseFloor,
        qualifiedBase,
        removedByVolumeFloor,
        baseBeforeVolumeFloor: qualifiedBase + removedByVolumeFloor,
        volumeUnavailable,
      },
      priceIntegrity,
      participation,
      survivors: survivorDiagnostics,
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
      structuralDiagnostics: structural,
      baseVolumeFloorDiagnostics: summary.baseVolumeFloor,
      priceIntegrityDiagnostics: priceIntegrity,
      participationDiagnostics: participation,
      survivorDiagnostics,
      notes: `${SCANNER_VERSION} · ${DISCOVERY_CONFIG_VERSION}`,
    });

    // AUTOMATIC funnel milestones. Written from the exact evidence of THIS run,
    // append-only and idempotent: an earlier frozen first entry always wins, and
    // nothing here influences selection, ranking or outcomes.
    try {
      const survivorAddresses = new Set(survivors.map((s) => s.token.contractAddress));
      await recordScanMilestones({
        scanRunId: runId,
        completedAt,
        run: {
          status: "completed",
          tokensDiscovered: deduped.length,
          discoveryHealth: discoveryHealth.state,
        },
        candidates: toPersist.flatMap((c) => {
          const tokenId = tokenIds.get(c.token.contractAddress);
          if (!tokenId) return [];
          return [
            {
              tokenId,
              contractAddress: c.token.contractAddress,
              chain: "solana",
              setups: c.lanes,
              survivor: survivorAddresses.has(c.token.contractAddress),
              marketCap: c.token.marketCap,
              priceUsd: c.token.priceUsd,
              liquidityUsd: c.token.liquidityUsd,
              quantitativePriority: c.quantitativePriority,
            },
          ];
        }),
      });
    } catch (milestoneError) {
      // Milestone bookkeeping never fails a completed scan; Sync can repair it.
      console.error(
        "recordScanMilestones failed",
        milestoneError instanceof Error ? milestoneError.message : milestoneError,
      );
    }

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

    // Canonical Research Packets for THIS run. Automatic on every healthy
    // completed run: `calibrationMode` is a legacy scanner run flag (it
    // defaults to true for ordinary production scans and is NOT the
    // production/calibration discriminator), so it must never suppress packet
    // generation. Failure here is diagnostic — the scan stays the active
    // Research cohort and the packet stage reports FAILED/NOT_STARTED.

    const researchPackets =
      discoveryHealth.state !== "OK"
        ? NO_PACKET_ATTEMPT
        : await generatePacketsForRunSafely(runId);

    return {
      ok: true,
      summary,
      message: null,
      code: "COMPLETED",
      runId,
      activeRunId: null,
      researchPackets,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    // A failed run is isolated; earlier completed runs stay untouched.
    await failScanRun(runId, message);
    console.error("runScannerPipeline failed", message);
    return {
      ok: false,
      summary: null,
      message,
      code: "FAILED",
      runId,
      activeRunId: null,
      researchPackets: NO_PACKET_ATTEMPT,
    };
  }
}
