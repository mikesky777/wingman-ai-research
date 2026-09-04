/**
 * Adapter: normalized Birdeye trade-data → EvidenceObservation[].
 *
 * Raw provider facts only, one observation per (window, fact). Missing fields
 * are emitted as `unavailable` with a null value — never inferred, never zero.
 * Unique buyers/sellers are NOT derived: Birdeye supplies unique wallets, buys
 * and sells, and nothing else may be invented from them.
 */
import type {
  NormalizedParticipation,
  ParticipationWindow,
} from "../external/birdeye/trade-data-normalizer";
import { PARTICIPATION_WINDOWS } from "../external/birdeye/trade-data-normalizer";
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceObservation,
  type EvidenceUnit,
  type EvidenceValue,
} from "./types";

export const PARTICIPATION_EVIDENCE_VERSION = "participation-evidence/v1";

function make(args: {
  key: string;
  value: EvidenceValue;
  unit: EvidenceUnit;
  observation: NormalizedParticipation;
  window: ParticipationWindow;
}): EvidenceObservation {
  return {
    domain: "participation",
    key: args.key,
    value: args.value,
    unit: args.unit,
    source: args.observation.source,
    sourceReference: args.observation.sourceReference,
    observedAt: args.observation.observedAt ?? args.observation.capturedAt,
    capturedAt: args.observation.capturedAt,
    status: args.value === null ? "unavailable" : "observed",
    metadata: {
      window: args.window,
      evidenceVersion: PARTICIPATION_EVIDENCE_VERSION,
    },
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
  };
}

export function participationToEvidence(
  observation: NormalizedParticipation,
): EvidenceObservation[] {
  const out: EvidenceObservation[] = [];

  for (const window of PARTICIPATION_WINDOWS) {
    const f = observation.windows[window];
    const fields: Array<[string, EvidenceValue, EvidenceUnit]> = [
      ["trades", f.trades, "count"],
      ["buys", f.buys, "count"],
      ["sells", f.sells, "count"],
      ["unique_wallets", f.uniqueWallets, "count"],
      ["volume_usd", f.volumeUsd, "usd"],
      ["buy_volume_usd", f.buyVolumeUsd, "usd"],
      ["sell_volume_usd", f.sellVolumeUsd, "usd"],
      ["trades_prev", f.tradesPrev, "count"],
      ["unique_wallets_prev", f.uniqueWalletsPrev, "count"],
      ["volume_usd_prev", f.volumeUsdPrev, "usd"],
      ["trades_change_pct", f.tradesChangePct, "percent"],
      ["unique_wallets_change_pct", f.uniqueWalletsChangePct, "percent"],
      ["volume_change_pct", f.volumeChangePct, "percent"],
    ];
    for (const [name, value, unit] of fields) {
      out.push(make({ key: `participation.${window}.${name}`, value, unit, observation, window }));
    }
  }

  // Token-level context supplied by the same response.
  out.push(
    make({
      key: "participation.holders",
      value: observation.holders,
      unit: "count",
      observation,
      window: "24h",
    }),
    make({
      key: "participation.markets",
      value: observation.marketCount,
      unit: "count",
      observation,
      window: "24h",
    }),
  );

  return out;
}
