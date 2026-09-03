/**
 * Provider capability registry.
 *
 * Nothing in Wingman may assume every provider supports every metric or every
 * chain. Services ask the registry first; unsupported combinations fail
 * cleanly at this boundary instead of deep inside a fetch.
 */
import type { ChainId } from "./chains";
import type { EvidenceSource } from "../evidence/types";

export type ProviderCapabilityId =
  | "market_data"
  | "market_data_partial"
  | "dex_provenance"
  | "promotion_metadata"
  | "holder_distribution"
  | "holder_classification"
  | "wallet_classification"
  | "holder_positions"
  | "price_history";

export interface ProviderCapability {
  id: ProviderCapabilityId;
  supportedChains: ChainId[];
  /** Deep/expensive capabilities are never called in bulk scanning paths. */
  costTier: "cheap" | "standard" | "deep";
  /** Only invoked when explicitly requested (never automatically). */
  onDemandOnly?: boolean;
  description: string;
}

export interface ProviderDescriptor {
  source: EvidenceSource;
  label: string;
  capabilities: ProviderCapability[];
}

export const PROVIDER_REGISTRY: ProviderDescriptor[] = [
  {
    source: "dexscreener",
    label: "DexScreener",
    capabilities: [
      {
        id: "market_data",
        supportedChains: ["solana"],
        costTier: "cheap",
        description: "Price, market cap, FDV, liquidity, volume and trade counts.",
      },
      {
        id: "dex_provenance",
        supportedChains: ["solana"],
        costTier: "cheap",
        description: "Primary pair, DEX, quote token and pair creation time.",
      },
      {
        id: "promotion_metadata",
        supportedChains: ["solana"],
        costTier: "cheap",
        description: "Paid boosts and profile promotion (descriptive only).",
      },
    ],
  },
  {
    source: "birdeye",
    label: "Birdeye",
    capabilities: [
      {
        id: "market_data_partial",
        supportedChains: ["solana"],
        costTier: "standard",
        description: "Market cap, liquidity and 1h volume returned alongside holder data.",
      },
      {
        id: "holder_distribution",
        supportedChains: ["solana"],
        costTier: "standard",
        description: "Wallet-level top-holder concentration (raw, no exclusions).",
      },
      {
        id: "price_history",
        supportedChains: ["solana"],
        costTier: "standard",
        description: "Historical OHLCV candles (open/high/low/close, base and USD volume).",
      },
      {
        id: "holder_classification",
        supportedChains: ["solana"],
        costTier: "deep",
        description: "Cohort summary for bundler / sniper / insider / dev / smart_trader.",
      },
      {
        id: "wallet_classification",
        supportedChains: ["solana"],
        costTier: "deep",
        description: "Provider wallet labels, preserved as provider claims not truths.",
      },
      {
        id: "holder_positions",
        supportedChains: ["solana"],
        costTier: "deep",
        onDemandOnly: true,
        description: "Per-wallet positions behind each label. Never invoked automatically.",
      },
    ],
  },
];

export function getProvider(source: EvidenceSource): ProviderDescriptor | undefined {
  return PROVIDER_REGISTRY.find((p) => p.source === source);
}

export function getCapability(
  source: EvidenceSource,
  capability: ProviderCapabilityId,
): ProviderCapability | undefined {
  return getProvider(source)?.capabilities.find((c) => c.id === capability);
}

export function supportsChain(
  source: EvidenceSource,
  capability: ProviderCapabilityId,
  chain: ChainId,
): boolean {
  return getCapability(source, capability)?.supportedChains.includes(chain) ?? false;
}
