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
import { dedupeDiscovered, evaluateCandidate, rankCandidates, selectSurvivors } from "./evaluate";
import {
  ConcurrentScanError,
  completeScanRun,
  failScanRun,
  loadTokenContext,
  persistCandidates,
  resolveTokenIds,
  startScanRun,
} from "./persistence.server";
import { TelemetryRecorder } from "./telemetry";
import { SCANNER_VERSION, type EvaluatedCandidate, type ProviderCallTelemetry } from "./types";

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
  const config = runConfig(overrides);
  const telemetry = new TelemetryRecorder();

  let runId: string;
  try {
    runId = await startScanRun({
      calibrationMode: config.calibrationMode,
      discoveryConfigVersion: DISCOVERY_CONFIG_VERSION,
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

    const evaluated = deduped.map((token) => {
      const ctx = context.get(token.contractAddress);
      return evaluateCandidate(token, {
        nowIso,
        history: ctx?.history ?? [],
        ageFallbacks: {
          pairCreatedAt: ctx?.pairCreatedAt ?? null,
          tokenCreatedAt: ctx?.tokenCreatedAt ?? null,
        },
      });
    });

    const ranked = rankCandidates(evaluated);
    const survivors = selectSurvivors(ranked, config.survivorEnrichmentLimit);

    await mapWithLimit(survivors, 4, async (candidate) => {
      const ok = await enrichSurvivor(candidate, runId, telemetry);
      candidate.enriched = ok;
      if (ok) candidate.stageReached = "enriched";
    });

    // Persist survivors first, then rejected candidates up to the cap.
    const survivorSet = new Set(survivors.map((s) => s.token.contractAddress));
    const others = ranked.filter((c) => !survivorSet.has(c.token.contractAddress));
    const toPersist = [...survivors, ...others.slice(0, config.maxPersistedRejections)];

    const tokenIds = await resolveTokenIds(toPersist.map((c) => c.token));
    await persistCandidates(runId, toPersist, tokenIds);

    const passedHardFilters = evaluated.filter((c) => c.passedHardFilters).length;
    const quantitativelyRanked = evaluated.filter(
      (c) => c.passedHardFilters && c.lanes.length > 0,
    ).length;
    const enriched = survivors.filter((s) => s.enriched).length;

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
    };

    await completeScanRun({
      runId,
      tokensDiscovered: summary.tokensDiscovered,
      passedHardFilters,
      quantitativelyRanked,
      enriched,
      telemetry: summary.telemetry,
      notes: `${SCANNER_VERSION} · ${DISCOVERY_CONFIG_VERSION}`,
    });

    return { ok: true, summary, message: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Scan failed.";
    // A failed run is isolated; earlier completed runs stay untouched.
    await failScanRun(runId, message);
    console.error("runScannerPipeline failed", message);
    return { ok: false, summary: null, message };
  }
}
