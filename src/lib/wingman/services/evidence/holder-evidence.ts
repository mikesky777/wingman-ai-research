/**
 * Adapter: normalized Birdeye holder data → EvidenceObservation[].
 *
 * Reads the already-normalized Birdeye models, never a raw payload, so no
 * provider response shape reaches the evidence layer.
 *
 * Hard rules:
 *   - Concentration keys say exactly what they measure: RAW wallet-level share
 *     of total supply, with NO exclusion of LP, burn, treasury, program or
 *     exchange wallets.
 *   - Cohorts stay independent. Bundler/sniper/insider/dev/smart-trader supply
 *     is NEVER summed into a "suspicious supply" figure: wallets may hold
 *     several labels and no wallet-level de-duplication exists.
 *   - Birdeye labels are recorded as Birdeye's classification, not as truth.
 *   - Missing fields stay unavailable/null. A genuine 0 stays 0.
 */
import {
  bundlerCoverageLimited,
  BIRDEYE_INGESTION_VERSION,
  BIRDEYE_LABEL_SEMANTICS_VERSION,
  type NormalizedCohort,
  type NormalizedHolderDistribution,
  type NormalizedHolderProfile,
} from "../external/birdeye/normalizer";
import {
  EVIDENCE_SCHEMA_VERSION,
  type EvidenceDomain,
  type EvidenceObservation,
  type EvidenceUnit,
  type EvidenceValue,
  type ObservedAtBasis,
} from "./types";

const SOURCE = "birdeye";

interface MakeArgs {
  domain: EvidenceDomain;
  key: string;
  value: EvidenceValue;
  unit?: EvidenceUnit;
  capturedAt: string;
  observedAt?: string | null;
  basis?: ObservedAtBasis;
  sourceReference: string;
  metadata?: Record<string, EvidenceValue>;
}

function make(args: MakeArgs): EvidenceObservation {
  const basis: ObservedAtBasis = args.basis ?? "capture_time";
  const observation: EvidenceObservation = {
    domain: args.domain,
    key: args.key,
    value: args.value,
    source: SOURCE,
    sourceReference: args.sourceReference,
    observedAt: args.observedAt ?? args.capturedAt,
    capturedAt: args.capturedAt,
    status: args.value === null ? "unavailable" : "observed",
    metadata: {
      ingestionVersion: BIRDEYE_INGESTION_VERSION,
      dataSource: SOURCE,
      observedAtBasis: basis,
      ...(args.metadata ?? {}),
    },
    schemaVersion: EVIDENCE_SCHEMA_VERSION,
  };
  return args.unit ? { ...observation, unit: args.unit } : observation;
}

/** Raw wallet-level concentration evidence. No addresses are excluded. */
export function holderDistributionToEvidence(
  distribution: NormalizedHolderDistribution,
): EvidenceObservation[] {
  const base = {
    capturedAt: distribution.capturedAt,
    sourceReference: distribution.sourceReference,
  };
  const rawMeta: Record<string, EvidenceValue> = {
    chain: distribution.chain,
    addressType: distribution.addressType,
    mode: distribution.mode,
    concentrationBasis: "raw_wallet_share_of_total_supply",
    // Explicit: nothing has been filtered out of these wallets.
    exclusionsApplied: "none",
    lpBurnTreasuryExcluded: false,
  };

  return [
    make({
      ...base,
      domain: "holders",
      key: "holders.top10_wallet_pct_of_total_supply",
      value: distribution.top10WalletPctOfTotalSupply,
      unit: "percent",
      metadata: rawMeta,
    }),
    make({
      ...base,
      domain: "holders",
      key: "holders.top20_wallet_pct_of_total_supply",
      value: distribution.top20WalletPctOfTotalSupply,
      unit: "percent",
      // Computed from wallet balances + total supply, not returned directly.
      basis: distribution.top20WalletPctOfTotalSupply === null ? "capture_time" : "derived",
      metadata: { ...rawMeta, derivedFrom: "wallet_balances_and_total_supply" },
    }),
    make({
      ...base,
      domain: "holders",
      key: "holders.wallet_holder_count",
      value: distribution.walletHolderCount,
      unit: "count",
      metadata: { ...rawMeta, countBasis: "owner_wallet_not_token_account" },
    }),
  ];
}

const COHORT_TARGET: Record<string, { domain: EvidenceDomain; prefix: string }> = {
  bundler: { domain: "holders", prefix: "holders.bundler" },
  sniper: { domain: "holders", prefix: "holders.sniper" },
  insider: { domain: "holders", prefix: "holders.insider" },
  smart_trader: { domain: "holders", prefix: "holders.smart_trader" },
  dev: { domain: "creator", prefix: "creator.dev" },
};

function cohortEvidence(
  cohort: NormalizedCohort,
  ctx: { capturedAt: string; sourceReference: string; tokenCreatedAt: string | null },
): EvidenceObservation[] {
  const target = COHORT_TARGET[cohort.cohort];
  if (!target) return [];

  const metadata: Record<string, EvidenceValue> = {
    // The label means Birdeye's definition of this behaviour, nothing more.
    classificationProvider: "birdeye",
    classificationLabel: cohort.cohort,
    labelSemanticsVersion: BIRDEYE_LABEL_SEMANTICS_VERSION,
    // Cohorts may overlap; they must never be summed.
    cohortsMayOverlap: true,
    walletLevelDeduplicated: false,
  };

  if (cohort.cohort === "bundler") {
    const limited = bundlerCoverageLimited(ctx.tokenCreatedAt);
    metadata["bundlerCoverage"] =
      limited === null ? "unknown_token_age" : limited ? "historical_backfill_limited" : "full";
    // Absent or zero bundler data on older tokens is NOT proof of a clean launch.
    metadata["absenceIsNotProofOfCleanLaunch"] = true;
  }

  const base = { capturedAt: ctx.capturedAt, sourceReference: ctx.sourceReference, metadata };
  const out: EvidenceObservation[] = [
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_wallet_count`,
      value: cohort.walletCount,
      unit: "count",
    }),
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_pct_of_supply`,
      value: cohort.pctOfSupply,
      unit: "percent",
    }),
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_buy_volume_usd`,
      value: cohort.buyVolumeUsd,
      unit: "usd",
    }),
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_sell_volume_usd`,
      value: cohort.sellVolumeUsd,
      unit: "usd",
    }),
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_avg_buy_price_usd`,
      value: cohort.avgBuyPriceUsd,
      unit: "usd",
    }),
    make({
      ...base,
      domain: target.domain,
      key: `${target.prefix}_unrealized_pnl_usd`,
      value: cohort.unrealizedPnlUsd,
      unit: "usd",
    }),
  ];
  return out;
}

export function holderProfileToEvidence(profile: NormalizedHolderProfile): EvidenceObservation[] {
  const base = { capturedAt: profile.capturedAt, sourceReference: profile.sourceReference };
  const observations: EvidenceObservation[] = [
    // Market metrics whose semantics genuinely match the DexScreener keys.
    make({ ...base, domain: "market", key: "market.market_cap_usd", value: profile.marketCapUsd, unit: "usd" }),
    make({ ...base, domain: "market", key: "market.liquidity_usd", value: profile.liquidityUsd, unit: "usd" }),
    make({ ...base, domain: "market", key: "market.volume_1h_usd", value: profile.volume1hUsd, unit: "usd" }),

    make({
      ...base,
      domain: "holders",
      key: "holders.top10_wallet_pct_of_total_supply",
      value: profile.top10WalletPctOfTotalSupply,
      unit: "percent",
      metadata: {
        concentrationBasis: "raw_wallet_share_of_total_supply",
        exclusionsApplied: "none",
        lpBurnTreasuryExcluded: false,
      },
    }),
    make({
      ...base,
      domain: "holders",
      key: "holders.labeled_wallet_count",
      value: profile.labeledHolderCount,
      unit: "count",
      metadata: { classificationProvider: "birdeye", includeZeroBalance: false },
    }),
    make({
      ...base,
      domain: "holders",
      key: "holders.labeled_pct_of_supply",
      value: profile.labeledPctOfSupply,
      unit: "percent",
      metadata: { classificationProvider: "birdeye", cohortsMayOverlap: true },
    }),
  ];

  if (profile.tokenCreatedAt) {
    observations.push(
      make({
        ...base,
        domain: "provenance",
        key: "provenance.token_created_at",
        value: profile.tokenCreatedAt,
        unit: "timestamp",
        // Provider-supplied fact timestamp.
        observedAt: profile.tokenCreatedAt,
        basis: "provider_time",
      }),
    );
  }

  for (const cohort of profile.cohorts) {
    observations.push(
      ...cohortEvidence(cohort, {
        capturedAt: profile.capturedAt,
        sourceReference: profile.sourceReference,
        tokenCreatedAt: profile.tokenCreatedAt,
      }),
    );
  }

  return observations;
}

export interface BirdeyeEnrichment {
  distribution: NormalizedHolderDistribution | null;
  profile: NormalizedHolderProfile | null;
}

/** Combined mapping. Either half may be missing; the other still maps. */
export function birdeyeToEvidence(enrichment: BirdeyeEnrichment): EvidenceObservation[] {
  return [
    ...(enrichment.distribution ? holderDistributionToEvidence(enrichment.distribution) : []),
    ...(enrichment.profile ? holderProfileToEvidence(enrichment.profile) : []),
  ];
}
