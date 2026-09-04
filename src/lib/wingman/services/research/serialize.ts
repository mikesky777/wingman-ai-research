/**
 * Deterministic compact serialization of a Research Packet for future LLM
 * input. Versioned separately from the packet itself.
 *
 * It drops UI labels, debug prose, redundant envelopes, raw candle arrays and
 * whole database rows, while preserving identity, setup/rank, eligibility,
 * important market state, Price Integrity, Participation, structural evidence,
 * holder/creator evidence, recurrence/history and the evidence gap list.
 *
 * `null` is only ever emitted where "unavailable" must stay visible; keys with
 * no information are omitted entirely so the model cannot mistake absence for
 * a zero.
 */
import { RESEARCH_COMPACT_VERSION, type Fact, type ResearchPacket } from "./types";

type Json = string | number | boolean | null | Json[] | { [k: string]: Json };

function v<T>(fact: Fact<T> | undefined): Json {
  if (!fact || fact.status === "unavailable") return null;
  return fact.value as unknown as Json;
}

function round(value: number | null | undefined, digits = 4): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

function prune(obj: Record<string, Json>): Record<string, Json> {
  const out: Record<string, Json> = {};
  for (const key of Object.keys(obj).sort()) {
    const value = obj[key];
    if (value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = prune(value as Record<string, Json>);
      if (Object.keys(nested).length === 0) continue;
      out[key] = nested;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/** Deterministic: identical packets always serialize to identical output. */
export function serializeCompact(packet: ResearchPacket): Record<string, Json> {
  const p = packet;
  const holderCohorts: Record<string, Json> = {};
  for (const [key, fact] of Object.entries(p.holders.cohorts)) {
    const short = key.replace(/^holders\./, "");
    const value = v(fact);
    if (value !== null) holderCohorts[short] = round(value as number);
  }
  const creator: Record<string, Json> = {};
  for (const [key, fact] of Object.entries(p.holders.creator)) {
    const value = v(fact);
    if (value !== null) creator[key.replace(/^creator\./, "")] = value;
  }

  return prune({
    sv: RESEARCH_COMPACT_VERSION,
    pv: p.packetVersion,
    src: p.candidateSource,
    id: prune({
      chain: p.identity.chain,
      mint: p.identity.mint,
      sym: p.identity.symbol,
      name: p.identity.name,
      pair: v(p.identity.pairAddress),
      dex: v(p.identity.dex),
      age_min: round(v(p.identity.ageMinutes) as number | null, 1),
      age_basis: p.identity.ageBasis,
    }),
    scan: prune({
      id: p.scanner.scanId,
      at: p.scanner.scanCompletedAt,
      prio: round(v(p.scanner.quantitativeResearchPriority) as number | null, 2),
      rank: v(p.scanner.globalRank),
      setups: p.scanner.setups as Json,
      survivor: p.scanner.survivor,
      route: p.scanner.selectionRoute,
      recurrence: p.scanner.recurrenceState,
      seen: p.scanner.scansSeenCount,
      consec: p.scanner.consecutiveScansSeen,
      first_seen: p.scanner.firstSeenScanAt,
    }),
    elig: prune({
      now: p.eligibility.researchEligibleNow,
      excl: p.eligibility.exclusionReasons as Json,
      call: p.eligibility.callTimeEligibility
        ? {
            rmd: p.eligibility.callTimeEligibility.recentMarketDamage,
            chg1h: round(p.eligibility.callTimeEligibility.priceChange1hPct, 2),
            at: p.eligibility.callTimeEligibility.at,
          }
        : null,
      cur: {
        rmd: p.eligibility.currentEligibility.recentMarketDamage,
        chg1h: round(p.eligibility.currentEligibility.priceChange1hPct, 2),
        at: p.eligibility.currentEligibility.at,
      },
      damage_state: p.marketDamage.derivedState,
    }),
    mkt: prune({
      price: v(p.market.price),
      mc: round(v(p.market.marketCap) as number | null, 0),
      liq: round(v(p.market.liquidityUsd) as number | null, 0),
      v1h: round(v(p.market.volume1h) as number | null, 0),
      v24h: round(v(p.market.volume24h) as number | null, 0),
      turn24h: round(v(p.market.turnover24h) as number | null, 3),
      vl24h: round(v(p.market.volumeToLiquidity24h) as number | null, 3),
      t1h: v(p.market.trades1h),
      t24h: v(p.market.trades24h),
      buys24h: v(p.market.buys24h),
      sells24h: v(p.market.sells24h),
      chg1h: round(v(p.market.priceChange1hPct) as number | null, 2),
      chg24h: round(v(p.market.priceChange24hPct) as number | null, 2),
      src: p.market.source,
      at: p.market.observedAt,
      stale: p.market.stale,
    }),
    universe: prune({
      status: p.universe.status,
      cat: p.universe.category,
      reason: p.universe.reason,
    }),
    struct: prune({
      status: p.structural.status,
      pv: p.structural.policyVersion,
      mint_auth: v(p.structural.mintAuthority),
      freeze_auth: v(p.structural.freezeAuthority),
      dex_market: v(p.structural.dexMarket),
      reasons: p.structural.reasons as Json,
    }),
    price_integrity: prune({
      status: p.priceIntegrity.status,
      pv: p.priceIntegrity.policyVersion,
      signals: p.priceIntegrity.signals as Json,
      reasons: p.priceIntegrity.reasons as Json,
      features: p.priceIntegrity.features
        ? (Object.fromEntries(
            Object.entries(p.priceIntegrity.features)
              .filter(([, val]) => val !== null && val !== undefined)
              .map(([k, val]) => [k, typeof val === "number" ? round(val, 4) : (val as Json)]),
          ) as Json)
        : null,
      coverage: p.priceIntegrity.coverage
        ? (Object.fromEntries(
            Object.entries(p.priceIntegrity.coverage).filter(
              ([, val]) => val !== null && val !== undefined,
            ),
          ) as Json)
        : null,
    }),
    participation: prune({
      status: p.participation.status,
      pv: p.participation.policyVersion,
      breadth: p.participation.breadth,
      repetition: p.participation.repetition,
      divergence: p.participation.divergence,
      wallets: p.participation.uniqueWalletsByWindow as Json,
      tpw: p.participation.tradesPerWalletByWindow
        ? (Object.fromEntries(
            Object.entries(p.participation.tradesPerWalletByWindow).map(([k, val]) => [
              k,
              round(val, 2),
            ]),
          ) as Json)
        : null,
      peak_div: round(p.participation.peakDivergenceRatio, 2),
      reasons: p.participation.reasons as Json,
    }),
    holders: prune({
      count: v(p.holders.holderCount),
      top10: round(v(p.holders.top10Pct) as number | null, 2),
      top20: round(v(p.holders.top20Pct) as number | null, 2),
      cohorts: holderCohorts,
      creator,
    }),
    outcomes: p.outcomes
      ? prune({
          first_seen_at: p.outcomes.firstSeenAt,
          first_call_at: p.outcomes.firstCallAt,
          mc_call: round(p.outcomes.firstCallMarketCap, 0),
          since_seen: round(p.outcomes.sinceSeenPct, 2),
          since_call: round(p.outcomes.sinceCallPct, 2),
          peak_call: round(p.outcomes.peakSinceCallPct, 2),
          mae_call: round(p.outcomes.maxAdverseSinceCallPct, 2),
          dd_call: round(p.outcomes.drawdownSinceCallPct, 2),
        })
      : null,
    gaps: p.evidenceGaps as Json,
  });
}

/** Compact JSON string plus its byte size, for budgeting model input. */
export function compactJson(packet: ResearchPacket): { json: string; bytes: number } {
  const json = JSON.stringify(serializeCompact(packet));
  return { json, bytes: new TextEncoder().encode(json).length };
}
