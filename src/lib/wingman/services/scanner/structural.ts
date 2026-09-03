/**
 * Structural Eligibility v1 — deterministic structural-risk layer (pure).
 *
 * This is NOT Quantitative Research Priority, NOT a thesis score, NOT evidence
 * confidence and NOT entry quality. It answers one question: does this token
 * carry a structural flaw that makes it categorically unsuitable, regardless of
 * how attractive its chart or narrative looks?
 *
 * Hard rules:
 *   - Missing evidence is UNKNOWN. It is never clean and never bearish.
 *   - A provider or RPC failure is UNKNOWN, never a confirmed structural flaw.
 *   - Only rules with an already-approved deterministic policy produce a
 *     status. Everything else is exposed as CONTEXT and cannot move the
 *     aggregate.
 *   - v1 is OPERATIONAL for a single narrow decision: a FAIL candidate can
 *     never become a Survivor. It still never touches ranking, priority,
 *     setup classification, recurrence or outcomes.
 */

export const STRUCTURAL_POLICY_VERSION = "structural/v1";

/**
 * Shadow mode is over: FAIL now vetoes survivor selection. Everything else
 * about structural evaluation remains observational.
 */
export const STRUCTURAL_SHADOW_MODE = false;

/** FAIL is the only veto. PASS / CONCERN / UNKNOWN stay fully eligible. */
export const STRUCTURAL_VETO_ENABLED = true;

export type StructuralStatus = "PASS" | "CONCERN" | "FAIL" | "UNKNOWN";

/**
 * The single eligibility contract shared by Survivor selection and every
 * future expensive stage (thesis research, opportunity creation).
 * UNKNOWN is NOT failure.
 */
export function isStructurallyEligible(status: StructuralStatus | null | undefined): boolean {
  if (!STRUCTURAL_VETO_ENABLED) return true;
  return status !== "FAIL";
}

/** On-chain authority state. UNKNOWN is never rendered as revoked. */
export type AuthorityState = "REVOKED" | "ACTIVE" | "UNKNOWN";

export const NO_VALID_DEX_MARKET_REASON = "NO_VALID_DEX_MARKET";


export const BUNDLER_COVERAGE_CAVEAT =
  "Birdeye bundler tagging has limited historical coverage before 2026-03-01. " +
  "Absence of detected bundling is not proof of a clean launch.";

export const COHORT_OVERLAP_NOTE =
  "Birdeye cohorts may overlap and are not mutually exclusive; labeled supply is descriptive, not risk.";

/** Authoritative on-chain mint account facts. Source is the Solana RPC only. */
export interface MintAccountFact {
  address: string;
  mintAuthority: AuthorityState;
  freezeAuthority: AuthorityState;
  mintAuthorityAddress: string | null;
  freezeAuthorityAddress: string | null;
  /** Owning token program (SPL Token / Token-2022). */
  tokenProgram: string | null;
  source: string;
  /** When the chain state was observed, when the source supplies it. */
  observedAt: string | null;
  /** When Wingman captured the read. */
  capturedAt: string;
  /** True when the account could not be read or parsed. */
  unavailable: boolean;
  unavailableReason: string | null;
}

/**
 * Resolved Solana market facts.
 *   valid === true  → confirmed valid resolved DEX market
 *   valid === false → confirmed absence of a usable market
 *   valid === null  → provider failure; absence is NOT confirmed
 */
export interface MarketStructureFact {
  valid: boolean | null;
  pairAddress: string | null;
  dexId: string | null;
  quoteTokenSymbol: string | null;
  liquidityUsd: number | null;
  detail: string | null;
  source: string;
}

export interface HolderCohortFact {
  cohort: string;
  walletCount: number | null;
  pctOfSupply: number | null;
}

/** Existing stored Birdeye holder/launch evidence. No new endpoints. */
export interface HolderStructureFact {
  available: boolean;
  top10PctOfSupply: number | null;
  top20PctOfSupply: number | null;
  holderCount: number | null;
  labeledPctOfSupply: number | null;
  cohorts: HolderCohortFact[];
  source: string | null;
  observedAt: string | null;
  /** Coverage limitations that must stay visible. */
  caveats: string[];
}

export interface StructuralRuleResult {
  id: "mint_authority" | "freeze_authority" | "dex_market";
  label: string;
  status: StructuralStatus;
  /** Machine-readable reason. */
  reason: string;
  /** The verified fact the rule was derived from. */
  fact: string;
  source: string;
  observedAt: string | null;
  capturedAt: string | null;
  detail: string | null;
}

/**
 * Structural evidence with no calibrated policy yet. Displayed as context and
 * NEVER folded into the aggregate status.
 */
export interface StructuralContextItem {
  id: string;
  label: string;
  value: string;
  available: boolean;
  source: string | null;
  observedAt: string | null;
  note: string | null;
}

export interface StructuralEvaluation {
  policyVersion: string;
  shadowMode: boolean;
  status: StructuralStatus;
  evaluatedAt: string;
  rules: StructuralRuleResult[];
  context: StructuralContextItem[];
}

export interface StructuralInput {
  evaluatedAt: string;
  mint: MintAccountFact | null;
  market: MarketStructureFact | null;
  holders: HolderStructureFact | null;
}

const PRECEDENCE: Record<StructuralStatus, number> = {
  FAIL: 3,
  CONCERN: 2,
  UNKNOWN: 1,
  PASS: 0,
};

/** FAIL > CONCERN > UNKNOWN > PASS. Absent rules never upgrade to PASS. */
export function aggregateStructuralStatus(statuses: StructuralStatus[]): StructuralStatus {
  if (statuses.length === 0) return "UNKNOWN";
  return statuses.reduce<StructuralStatus>(
    (worst, next) => (PRECEDENCE[next] > PRECEDENCE[worst] ? next : worst),
    "PASS",
  );
}

function mintRule(mint: MintAccountFact | null): StructuralRuleResult {
  const base = {
    id: "mint_authority" as const,
    label: "Mint authority",
    source: mint?.source ?? "solana_rpc",
    observedAt: mint?.observedAt ?? null,
    capturedAt: mint?.capturedAt ?? null,
  };
  if (!mint || mint.unavailable || mint.mintAuthority === "UNKNOWN") {
    return {
      ...base,
      status: "UNKNOWN",
      reason: "MINT_AUTHORITY_UNAVAILABLE",
      fact: "UNKNOWN",
      detail:
        mint?.unavailableReason ??
        "Mint account could not be read or parsed. Authority state is unknown, not revoked.",
    };
  }
  if (mint.mintAuthority === "ACTIVE") {
    return {
      ...base,
      status: "FAIL",
      reason: "MINT_AUTHORITY_ACTIVE",
      fact: "ACTIVE",
      detail: mint.mintAuthorityAddress
        ? `Supply can still be minted by ${mint.mintAuthorityAddress}.`
        : "Supply can still be minted.",
    };
  }
  return {
    ...base,
    status: "PASS",
    reason: "MINT_AUTHORITY_REVOKED",
    fact: "REVOKED",
    detail: "No further supply can be minted.",
  };
}

function freezeRule(mint: MintAccountFact | null): StructuralRuleResult {
  const base = {
    id: "freeze_authority" as const,
    label: "Freeze authority",
    source: mint?.source ?? "solana_rpc",
    observedAt: mint?.observedAt ?? null,
    capturedAt: mint?.capturedAt ?? null,
  };
  if (!mint || mint.unavailable || mint.freezeAuthority === "UNKNOWN") {
    return {
      ...base,
      status: "UNKNOWN",
      reason: "FREEZE_AUTHORITY_UNAVAILABLE",
      fact: "UNKNOWN",
      detail:
        mint?.unavailableReason ??
        "Mint account could not be read or parsed. Authority state is unknown, not revoked.",
    };
  }
  if (mint.freezeAuthority === "ACTIVE") {
    // v1 policy: a concern, never a fatal flaw on its own.
    return {
      ...base,
      status: "CONCERN",
      reason: "FREEZE_AUTHORITY_ACTIVE",
      fact: "ACTIVE",
      detail: mint.freezeAuthorityAddress
        ? `Accounts can be frozen by ${mint.freezeAuthorityAddress}.`
        : "Accounts can be frozen.",
    };
  }
  return {
    ...base,
    status: "PASS",
    reason: "FREEZE_AUTHORITY_REVOKED",
    fact: "REVOKED",
    detail: "Accounts cannot be frozen.",
  };
}

function marketRule(market: MarketStructureFact | null): StructuralRuleResult {
  const base = {
    id: "dex_market" as const,
    label: "DEX market",
    source: market?.source ?? "dexscreener",
    observedAt: null,
    capturedAt: null,
  };
  if (!market || market.valid === null) {
    return {
      ...base,
      status: "UNKNOWN",
      reason: "MARKET_EVIDENCE_UNAVAILABLE",
      fact: "UNKNOWN",
      detail:
        market?.detail ??
        "Market provider was unavailable. Absence of a market is not confirmed.",
    };
  }
  if (market.valid === false) {
    return {
      ...base,
      status: "FAIL",
      reason: NO_VALID_DEX_MARKET_REASON,
      fact: "ABSENT",
      detail: market.detail ?? "No valid resolved Solana DEX market.",
    };
  }
  return {
    ...base,
    status: "PASS",
    reason: "VALID_DEX_MARKET",
    fact: "VALID",
    detail: [
      market.dexId ? `dex ${market.dexId}` : null,
      market.pairAddress ? `pair ${market.pairAddress}` : null,
      market.quoteTokenSymbol ? `quote ${market.quoteTokenSymbol}` : null,
      typeof market.liquidityUsd === "number" ? `liquidity $${Math.round(market.liquidityUsd)}` : null,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

function num(value: number | null, suffix = ""): string {
  return value === null ? "unavailable" : `${value}${suffix}`;
}

/** Holder / launch evidence. Descriptive only — no uncalibrated thresholds. */
function holderContext(holders: HolderStructureFact | null): StructuralContextItem[] {
  const source = holders?.source ?? "birdeye";
  const observedAt = holders?.observedAt ?? null;
  const available = Boolean(holders?.available);

  const items: StructuralContextItem[] = [
    {
      id: "holders.top10_pct_of_supply",
      label: "Top 10 holders",
      value: available ? num(holders!.top10PctOfSupply, "%") : "unavailable",
      available: available && holders!.top10PctOfSupply !== null,
      source,
      observedAt,
      note: "No calibrated concentration threshold in v1 — context only.",
    },
    {
      id: "holders.top20_pct_of_supply",
      label: "Top 20 holders",
      value: available ? num(holders!.top20PctOfSupply, "%") : "unavailable",
      available: available && (holders?.top20PctOfSupply ?? null) !== null,
      source,
      observedAt,
      note: null,
    },
    {
      id: "holders.wallet_holder_count",
      label: "Holder count",
      value: available ? num(holders!.holderCount) : "unavailable",
      available: available && (holders?.holderCount ?? null) !== null,
      source,
      observedAt,
      note: null,
    },
    {
      id: "holders.labeled_pct_of_supply",
      label: "Labeled supply",
      value: available ? num(holders!.labeledPctOfSupply, "%") : "unavailable",
      available: available && (holders?.labeledPctOfSupply ?? null) !== null,
      source,
      observedAt,
      // 100% labeled supply is descriptive, never a risk signal by itself.
      note: COHORT_OVERLAP_NOTE,
    },
  ];

  const cohorts = holders?.cohorts ?? [];
  for (const cohort of cohorts) {
    items.push({
      id: `cohort.${cohort.cohort}`,
      label: `${cohort.cohort} cohort`,
      value:
        cohort.walletCount === null && cohort.pctOfSupply === null
          ? "unavailable"
          : `${num(cohort.walletCount)} wallets · ${num(cohort.pctOfSupply, "%")} of supply`,
      available: cohort.walletCount !== null || cohort.pctOfSupply !== null,
      source,
      observedAt,
      note:
        cohort.cohort === "bundler"
          ? (holders?.caveats.find((c) => c.includes("bundler")) ?? BUNDLER_COVERAGE_CAVEAT)
          : COHORT_OVERLAP_NOTE,
    });
  }

  if (!cohorts.some((c) => c.cohort === "bundler")) {
    items.push({
      id: "cohort.bundler",
      label: "bundler cohort",
      value: "unavailable",
      available: false,
      source,
      observedAt,
      // Never read as a clean launch.
      note: BUNDLER_COVERAGE_CAVEAT,
    });
  }

  for (const caveat of holders?.caveats ?? []) {
    if (caveat === BUNDLER_COVERAGE_CAVEAT) continue;
    items.push({
      id: `caveat.${items.length}`,
      label: "Coverage caveat",
      value: caveat,
      available: true,
      source,
      observedAt,
      note: null,
    });
  }

  return items;
}

/** Deterministic structural evaluation. Same input → same output. */
export function evaluateStructural(input: StructuralInput): StructuralEvaluation {
  const rules = [mintRule(input.mint), freezeRule(input.mint), marketRule(input.market)];
  return {
    policyVersion: STRUCTURAL_POLICY_VERSION,
    shadowMode: STRUCTURAL_SHADOW_MODE,
    status: aggregateStructuralStatus(rules.map((r) => r.status)),
    evaluatedAt: input.evaluatedAt,
    rules,
    // Context can never change `status`.
    context: holderContext(input.holders),
  };
}

export interface StructuralDiagnostics {
  evaluated: number;
  pass: number;
  concern: number;
  fail: number;
  unknown: number;
  mintAuthorityActive: number;
  freezeAuthorityActive: number;
  authorityUnavailable: number;
  policyVersion: string;
  shadowMode: boolean;
  vetoEnabled: boolean;
  /** Selection effects. Present once selection has run. */
  selection?: StructuralSelectionDiagnostics;
}

/**
 * How the structural veto changed Survivor allocation for THIS run.
 * Universe exclusions are counted separately and never double-counted here:
 * an OUT_OF_SCOPE candidate is already out before structural selection.
 */
export interface StructuralSelectionDiagnostics {
  /** Structural FAIL candidates removed before survivor allocation. */
  failRemovedBeforeSelection: number;
  /** Of those, how many WOULD have been survivors without the veto. */
  failWouldHaveBeenSurvivors: number;
  /** Slots handed to the next eligible candidates because of the veto. */
  slotsBackfilled: number;
  survivorsByStatus: { pass: number; concern: number; unknown: number; fail: number };
  /** Removed earlier by Universe Eligibility, disjoint from the counts above. */
  outOfScopeRemoved: number;
}


export function structuralDiagnostics(
  evaluations: StructuralEvaluation[],
): StructuralDiagnostics {
  const ruleFact = (e: StructuralEvaluation, id: StructuralRuleResult["id"]) =>
    e.rules.find((r) => r.id === id)?.fact ?? "UNKNOWN";
  return {
    evaluated: evaluations.length,
    pass: evaluations.filter((e) => e.status === "PASS").length,
    concern: evaluations.filter((e) => e.status === "CONCERN").length,
    fail: evaluations.filter((e) => e.status === "FAIL").length,
    unknown: evaluations.filter((e) => e.status === "UNKNOWN").length,
    mintAuthorityActive: evaluations.filter((e) => ruleFact(e, "mint_authority") === "ACTIVE").length,
    freezeAuthorityActive: evaluations.filter((e) => ruleFact(e, "freeze_authority") === "ACTIVE")
      .length,
    authorityUnavailable: evaluations.filter((e) => ruleFact(e, "mint_authority") === "UNKNOWN")
      .length,
    policyVersion: STRUCTURAL_POLICY_VERSION,
    shadowMode: STRUCTURAL_SHADOW_MODE,
    vetoEnabled: STRUCTURAL_VETO_ENABLED,
  };
}
