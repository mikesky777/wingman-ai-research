/**
 * Adapter: normalized DexScreener snapshot → EvidenceObservation[].
 *
 * This module reads the already-normalized Wingman snapshot model, never a raw
 * DexScreener payload, so no provider-specific shape reaches the evidence layer.
 * It emits facts only — no scores, judgements or derived features.
 */
import type { NormalizedSnapshot } from "../external/dexscreener/normalizer";
import type { SelectedPairMeta } from "@/lib/wingman/ingest-types";
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceDomain,
  type EvidenceObservation,
  type EvidenceSource,
  type EvidenceUnit,
  type EvidenceValue,
} from "./types";

const SOURCE: EvidenceSource = "dexscreener";

interface Ctx {
  capturedAt: string;
  observedAt: string | null;
  sourceReference: string | null;
  metadata: Record<string, EvidenceValue>;
}

function observe(
  ctx: Ctx,
  domain: EvidenceDomain,
  key: string,
  value: EvidenceValue,
  unit?: EvidenceUnit,
): EvidenceObservation {
  const base: EvidenceObservation = {
    domain,
    key,
    value,
    source: SOURCE,
    sourceReference: ctx.sourceReference,
    observedAt: ctx.observedAt,
    capturedAt: ctx.capturedAt,
    status: value === null ? "unavailable" : "observed",
    metadata: ctx.metadata,
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
  };
  return unit ? { ...base, unit } : base;
}

/**
 * Deterministic mapping: same input always yields the same observations in the
 * same order. Facts DexScreener cannot supply (holders, unique wallets, top
 * holder concentration, creator, social) are simply not emitted.
 */
export function snapshotToEvidence(
  snapshot: NormalizedSnapshot,
  pair?: SelectedPairMeta | null,
): EvidenceObservation[] {
  const ctx: Ctx = {
    capturedAt: snapshot.capturedAt,
    observedAt: snapshot.capturedAt,
    sourceReference: snapshot.sourcePairAddress ?? pair?.pairAddress ?? null,
    metadata: {
      ingestionVersion: snapshot.ingestionVersion,
      dataSource: snapshot.dataSource,
      // DexScreener supplies no per-fact timestamp, so observedAt is our
      // capture time. Making that explicit keeps timestamp semantics honest.
      observedAtBasis: "capture_time",
      ...(pair ? { pairSelectionVersion: pair.selectionVersion } : {}),
    },

  };

  const m = (key: string, value: EvidenceValue, unit?: EvidenceUnit) =>
    observe(ctx, "market", key, value, unit);
  const p = (key: string, value: EvidenceValue, unit?: EvidenceUnit) =>
    observe(ctx, "provenance", key, value, unit);

  const observations: EvidenceObservation[] = [
    m("market.price_usd", snapshot.priceUsd, "usd"),
    m("market.market_cap_usd", snapshot.marketCap, "usd"),
    m("market.fdv_usd", snapshot.fdv, "usd"),
    m("market.liquidity_usd", snapshot.liquidityUsd, "usd"),

    m("market.volume_5m_usd", snapshot.volume5m, "usd"),
    m("market.volume_1h_usd", snapshot.volume1h, "usd"),
    m("market.volume_6h_usd", snapshot.volume6h, "usd"),
    m("market.volume_24h_usd", snapshot.volume24h, "usd"),

    m("market.price_change_5m_pct", snapshot.priceChange5m, "percent"),
    m("market.price_change_1h_pct", snapshot.priceChange1h, "percent"),
    m("market.price_change_6h_pct", snapshot.priceChange6h, "percent"),
    m("market.price_change_24h_pct", snapshot.priceChange24h, "percent"),

    m("market.buys_5m", snapshot.buys5m, "count"),
    m("market.sells_5m", snapshot.sells5m, "count"),
    m("market.buys_1h", snapshot.buys1h, "count"),
    m("market.sells_1h", snapshot.sells1h, "count"),

    p("provenance.primary_dex", snapshot.sourceDexId ?? pair?.dexId ?? null),
    p("provenance.quote_token", pair?.quoteTokenSymbol ?? null),
    p("provenance.pair_address", snapshot.sourcePairAddress ?? pair?.pairAddress ?? null),
    p(
      "provenance.pair_created_at",
      snapshot.sourcePairCreatedAt ?? pair?.pairCreatedAt ?? null,
      "timestamp",
    ),
  ];

  // Paid boosts are descriptive promotional metadata, never a quality signal.
  const boosts = snapshot.promotion.activeBoostCount;
  if (boosts !== null) {
    observations.push({
      ...m("market.active_boosts", boosts, "count"),
      metadata: { ...ctx.metadata, descriptiveOnly: true, promotional: true },
    });
  }

  return observations;
}
