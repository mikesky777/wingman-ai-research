/**
 * Structural Eligibility gathering + persistence (server-only).
 *
 * Reads the authoritative Solana mint account, reuses evidence Wingman ALREADY
 * stores (no new Birdeye endpoints, no new DEX provider) and appends immutable
 * structural evaluations. Shadow mode: nothing written here is read back into
 * ranking, setup classification, reservations or survivor selection.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { fetchMintAccounts } from "../external/solana-rpc/client.server";
import {
  BUNDLER_COVERAGE_CAVEAT,
  evaluateStructural,
  type HolderCohortFact,
  type HolderStructureFact,
  type MarketStructureFact,
  type MintAccountFact,
  type StructuralEvaluation,
} from "./structural";
import type { MarketResolution } from "./market-eligibility";

type Row = Record<string, unknown>;

const COHORT_KEYS: { cohort: string; count: string; pct: string }[] = [
  { cohort: "bundler", count: "holders.bundler_wallet_count", pct: "holders.bundler_pct_of_supply" },
  { cohort: "sniper", count: "holders.sniper_wallet_count", pct: "holders.sniper_pct_of_supply" },
  { cohort: "insider", count: "holders.insider_wallet_count", pct: "holders.insider_pct_of_supply" },
  {
    cohort: "smart_trader",
    count: "holders.smart_trader_wallet_count",
    pct: "holders.smart_trader_pct_of_supply",
  },
  { cohort: "dev", count: "creator.dev_wallet_count", pct: "creator.dev_pct_of_supply" },
];

interface StoredFact {
  value: number | string | boolean | null;
  observedAt: string | null;
  capturedAt: string;
  source: string;
  metadata: Record<string, unknown> | null;
  status: string;
}

function numeric(fact: StoredFact | undefined): number | null {
  if (!fact || fact.status !== "observed") return null;
  return typeof fact.value === "number" && Number.isFinite(fact.value) ? fact.value : null;
}

/**
 * Newest stored holder/creator observation per key, per token.
 * Only evidence that already exists is read — nothing is fetched.
 */
export async function loadHolderStructureEvidence(
  tokenIds: string[],
): Promise<Map<string, HolderStructureFact>> {
  const out = new Map<string, HolderStructureFact>();
  if (tokenIds.length === 0) return out;

  const byToken = new Map<string, Map<string, StoredFact>>();
  for (let i = 0; i < tokenIds.length; i += 100) {
    const chunk = tokenIds.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("evidence_observations")
      .select("token_id, key, value_json, observed_at, captured_at, source, metadata, status, domain")
      .in("token_id", chunk)
      .in("domain", ["holders", "creator"])
      .order("captured_at", { ascending: false })
      .limit(5000);
    // Absent evidence stays unavailable; it is never fabricated as clean.
    if (error) continue;
    for (const row of (data ?? []) as Row[]) {
      const tokenId = row["token_id"] as string;
      const key = row["key"] as string;
      const facts = byToken.get(tokenId) ?? new Map<string, StoredFact>();
      // Rows arrive newest-first: keep the first seen per key.
      if (!facts.has(key)) {
        facts.set(key, {
          value: (row["value_json"] ?? null) as StoredFact["value"],
          observedAt: (row["observed_at"] as string | null) ?? null,
          capturedAt: row["captured_at"] as string,
          source: (row["source"] as string) ?? "birdeye",
          metadata: (row["metadata"] as Record<string, unknown> | null) ?? null,
          status: (row["status"] as string) ?? "observed",
        });
      }
      byToken.set(tokenId, facts);
    }
  }

  for (const [tokenId, facts] of byToken) {
    const cohorts: HolderCohortFact[] = [];
    const caveats: string[] = [];
    for (const spec of COHORT_KEYS) {
      const countFact = facts.get(spec.count);
      const pctFact = facts.get(spec.pct);
      if (!countFact && !pctFact) continue;
      cohorts.push({
        cohort: spec.cohort,
        walletCount: numeric(countFact),
        pctOfSupply: numeric(pctFact),
      });
      const coverage = (countFact ?? pctFact)?.metadata?.["bundlerCoverage"];
      if (spec.cohort === "bundler" && coverage !== "full") {
        caveats.push(BUNDLER_COVERAGE_CAVEAT);
      }
    }

    const anyFact = [...facts.values()][0];
    out.set(tokenId, {
      available: facts.size > 0,
      top10PctOfSupply: numeric(facts.get("holders.top10_wallet_pct_of_total_supply")),
      top20PctOfSupply: numeric(facts.get("holders.top20_wallet_pct_of_total_supply")),
      holderCount: numeric(facts.get("holders.wallet_holder_count")),
      labeledPctOfSupply: numeric(facts.get("holders.labeled_pct_of_supply")),
      cohorts,
      source: anyFact?.source ?? "birdeye",
      observedAt: anyFact?.observedAt ?? anyFact?.capturedAt ?? null,
      caveats,
    });
  }

  return out;
}

/** Translate an existing market resolution into structural market evidence. */
export function marketStructureFact(
  resolution: MarketResolution | null | undefined,
): MarketStructureFact {
  if (!resolution) {
    return {
      valid: null,
      pairAddress: null,
      dexId: null,
      quoteTokenSymbol: null,
      liquidityUsd: null,
      detail: "No market resolution was attempted for this candidate.",
      source: "dexscreener",
    };
  }
  return {
    // Provider failure is UNKNOWN; only a completed lookup can confirm absence.
    valid: resolution.providerFailure ? null : resolution.ok,
    pairAddress: resolution.pairAddress,
    dexId: resolution.dexId ?? null,
    quoteTokenSymbol: resolution.quoteTokenSymbol ?? null,
    liquidityUsd: resolution.liquidityUsd,
    detail: resolution.reasonDetail,
    source: "dexscreener",
  };
}

export interface StructuralTarget {
  contractAddress: string;
  chain: string;
  tokenId: string | null;
  market: MarketResolution | null;
}

/** Evaluate structural eligibility for a set of candidates. */
export async function evaluateStructuralForTargets(
  targets: StructuralTarget[],
  options: { evaluatedAt: string } = { evaluatedAt: new Date().toISOString() },
): Promise<Map<string, StructuralEvaluation>> {
  const out = new Map<string, StructuralEvaluation>();
  if (targets.length === 0) return out;

  let mints: Map<string, MintAccountFact>;
  try {
    mints = await fetchMintAccounts(targets.map((t) => t.contractAddress));
  } catch {
    mints = new Map();
  }

  const holders = await loadHolderStructureEvidence(
    targets.map((t) => t.tokenId).filter((id): id is string => Boolean(id)),
  );

  for (const target of targets) {
    out.set(
      target.contractAddress,
      evaluateStructural({
        evaluatedAt: options.evaluatedAt,
        mint: mints.get(target.contractAddress) ?? null,
        market: marketStructureFact(target.market),
        holders: (target.tokenId ? holders.get(target.tokenId) : null) ?? null,
      }),
    );
  }

  return out;
}

/** Append immutable structural evaluations. Historical rows are never rewritten. */
export async function persistStructuralEvaluations(
  runId: string,
  targets: StructuralTarget[],
  evaluations: Map<string, StructuralEvaluation>,
): Promise<number> {
  const rows = targets
    .map((target) => {
      const evaluation = evaluations.get(target.contractAddress);
      if (!evaluation) return null;
      return {
        token_id: target.tokenId,
        scan_run_id: runId,
        contract_address: target.contractAddress,
        chain: target.chain,
        policy_version: evaluation.policyVersion,
        status: evaluation.status,
        evaluated_at: evaluation.evaluatedAt,
        rules: evaluation.rules,
        context: evaluation.context,
        evidence: {
          shadowMode: evaluation.shadowMode,
          sources: [...new Set(evaluation.rules.map((r) => r.source))],
        },
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const { error, count } = await supabaseAdmin
      .from("structural_evaluations")
      .insert(rows.slice(i, i + 200) as never, { count: "exact" });
    if (error) throw new Error(`Could not persist structural evaluations: ${error.message}`);
    inserted += count ?? 0;
  }
  return inserted;
}
