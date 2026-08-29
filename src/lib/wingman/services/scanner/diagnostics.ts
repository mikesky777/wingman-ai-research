/**
 * Scanner diagnostics — pure, deterministic calibration reporting.
 *
 * Purpose: answer "did Wingman fail to FIND these tokens, or did it find them
 * and remove them later?". Nothing here scores, ranks, or recommends.
 */
import { isNum } from "./metrics";
import {
  DISCOVERY_LANES,
  MARKET_CAP_BUCKETS,
  type BucketDiagnosticRow,
  type DiscoveryLane,
  type EvaluatedCandidate,
  type LaneDiagnosticRow,
  type MarketCapBucket,
} from "./types";

export function marketCapBucket(marketCap: number | null): MarketCapBucket {
  if (!isNum(marketCap)) return "unknown";
  if (marketCap < 50_000) return "<$50K";
  if (marketCap < 100_000) return "$50K-$100K";
  if (marketCap < 250_000) return "$100K-$250K";
  if (marketCap < 500_000) return "$250K-$500K";
  if (marketCap < 1_000_000) return "$500K-$1M";
  if (marketCap < 3_000_000) return "$1M-$3M";
  return "$3M+";
}

/** Per-bucket funnel counts. Every discovered candidate lands in exactly one. */
export function bucketDiagnostics(candidates: EvaluatedCandidate[]): BucketDiagnosticRow[] {
  const rows = new Map<MarketCapBucket, BucketDiagnosticRow>();
  for (const bucket of MARKET_CAP_BUCKETS) {
    rows.set(bucket, {
      bucket,
      discovered: 0,
      passedHardFilters: 0,
      laneQualified: 0,
      quantitativelyRanked: 0,
      enriched: 0,
    });
  }

  for (const c of candidates) {
    const row = rows.get(marketCapBucket(c.token.marketCap))!;
    row.discovered += 1;
    if (c.passedHardFilters) row.passedHardFilters += 1;
    if (c.passedHardFilters && c.lanes.length > 0) row.laneQualified += 1;
    if (c.quantitativePriority !== null && c.lanes.length > 0) row.quantitativelyRanked += 1;
    if (c.enriched) row.enriched += 1;
  }

  return [...rows.values()];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** Per-lane calibration stats, including the POST_BOND_BASE panel numbers. */
export function laneDiagnostics(candidates: EvaluatedCandidate[]): LaneDiagnosticRow[] {
  return DISCOVERY_LANES.map((lane: DiscoveryLane) => {
    const qualified = candidates.filter((c) => c.lanes.includes(lane));
    // "Discovered" for a lane = attempted it (qualified or explicitly refused).
    const attempted = candidates.filter(
      (c) => c.lanes.includes(lane) || c.laneRejections[lane] !== undefined,
    );
    const caps = qualified.map((c) => c.token.marketCap).filter(isNum);
    return {
      lane,
      discovered: attempted.length,
      qualified: qualified.length,
      enriched: qualified.filter((c) => c.enriched).length,
      below100k: caps.filter((v) => v < 100_000).length,
      between100kAnd250k: caps.filter((v) => v >= 100_000 && v < 250_000).length,
      medianAgeMinutes: median(qualified.map((c) => c.metrics.age.minutes).filter(isNum)),
      medianTurnover24h: median(
        qualified.map((c) => c.metrics.volumeToMarketCap24h).filter(isNum),
      ),
      withHistory: qualified.filter((c) => c.historySnapshotCount > 0).length,
    };
  });
}
