/**
 * Holder enrichment (server-only).
 *
 * Birdeye holder intelligence is DEEP enrichment, not broad scanning. It runs
 * only when a user explicitly inspects a contract address, or when a future
 * scanner stage deliberately calls `enrichTokenHolders` for a short list of
 * surviving candidates. Nothing here fans out over a token universe.
 *
 * Failures are isolated: a Birdeye outage returns unavailable holder evidence
 * and never breaks the DexScreener market path.
 */
import { BirdeyeAdapter } from "./external/birdeye/adapter.server";
import { toBirdeyeFailure, type BirdeyeErrorCode } from "./external/birdeye/errors";
import type {
  NormalizedHolderDistribution,
  NormalizedHolderProfile,
} from "./external/birdeye/normalizer";
import { birdeyeToEvidence } from "./evidence/holder-evidence";
import type { EvidenceObservation } from "./evidence/types";
import { DEFAULT_CHAIN, type ChainId } from "./external/chains";

export interface HolderEnrichmentRequest {
  contractAddress: string;
  /** Always explicit; `tokens.chain` is the authoritative caller-side value. */
  chain?: ChainId;
  capturedAt?: string;
}

export interface HolderEnrichmentResult {
  ok: boolean;
  source: "birdeye";
  observations: EvidenceObservation[];
  distribution: NormalizedHolderDistribution | null;
  profile: NormalizedHolderProfile | null;
  /** Safe, user-presentable failure detail. Null when everything succeeded. */
  failure: { code: BirdeyeErrorCode; message: string } | null;
}

export async function enrichTokenHolders(
  request: HolderEnrichmentRequest,
): Promise<HolderEnrichmentResult> {
  const chain = request.chain ?? DEFAULT_CHAIN;
  const capturedAt = request.capturedAt ?? new Date().toISOString();
  const options = { chain, capturedAt };

  // The two capabilities fail independently of each other too.
  const [distributionResult, profileResult] = await Promise.allSettled([
    BirdeyeAdapter.getHolderDistribution(request.contractAddress, options),
    BirdeyeAdapter.getHolderProfile(request.contractAddress, options),
  ]);

  const distribution =
    distributionResult.status === "fulfilled" ? distributionResult.value : null;
  const profile = profileResult.status === "fulfilled" ? profileResult.value : null;

  let failure: HolderEnrichmentResult["failure"] = null;
  if (!distribution && distributionResult.status === "rejected") {
    failure = toBirdeyeFailure(distributionResult.reason);
  } else if (!profile && profileResult.status === "rejected") {
    failure = toBirdeyeFailure(profileResult.reason);
  }

  return {
    ok: Boolean(distribution || profile),
    source: "birdeye",
    observations: birdeyeToEvidence({ distribution, profile }),
    distribution,
    profile,
    failure,
  };
}
