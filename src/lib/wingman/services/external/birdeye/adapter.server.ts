/**
 * Birdeye adapter — the only place in Wingman that knows Birdeye's response
 * shapes and endpoints. Server-only: it reads the API key from the server
 * environment through `client.server.ts`.
 *
 * Endpoints used (Solana only today):
 *   GET /defi/v3/token/holder?mode=wallet   — wallet-level top holders
 *   GET /defi/v3/token/market-data          — supply/market context
 *   GET /token/v1/holder-profile            — labeled-cohort holder summary
 *   GET /token/v1/holder-positions          — on-demand wallet drilldown
 */
import { supportsChain, type ProviderCapabilityId } from "../capabilities";
import { DEFAULT_CHAIN, type ChainContext } from "../chains";
import { birdeyeRequest, isBirdeyeConfigured, type BirdeyeRequestOptions } from "./client.server";
import { BirdeyeError } from "./errors";
import {
  normalizeHolderDistribution,
  normalizeHolderProfile,
  type NormalizedHolderDistribution,
  type NormalizedHolderProfile,
} from "./normalizer";
import type { BeHolderDistributionData, BeHolderProfileData, BeMarketData } from "./types";

const SOLANA_ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

/** Fails cleanly at the capability boundary before any network call. */
function assertCapability(capability: ProviderCapabilityId, chain: string, address: string) {
  if (!isBirdeyeConfigured()) throw new BirdeyeError("NOT_CONFIGURED");
  if (!SOLANA_ADDRESS_RE.test(address.trim())) throw new BirdeyeError("INVALID_ADDRESS");
  if (!supportsChain("birdeye", capability, chain)) throw new BirdeyeError("UNSUPPORTED_CHAIN");
}

export interface BirdeyeCallOptions extends ChainContext {
  capturedAt?: string;
  request?: BirdeyeRequestOptions;
}

export const BirdeyeAdapter = {
  isConfigured: isBirdeyeConfigured,

  async getMarketData(address: string, options: BirdeyeCallOptions): Promise<BeMarketData> {
    const chain = options.chain ?? DEFAULT_CHAIN;
    assertCapability("market_data_partial", chain, address);
    return birdeyeRequest<BeMarketData>(
      "/defi/v3/token/market-data",
      { address },
      { chain, ...options.request },
    );
  },

  /**
   * Wallet-level (NOT token-account) top-holder concentration. Raw: no LP,
   * burn, treasury, program or exchange wallets have been excluded.
   */
  async getHolderDistribution(
    address: string,
    options: BirdeyeCallOptions & { limit?: number },
  ): Promise<NormalizedHolderDistribution> {
    const chain = options.chain ?? DEFAULT_CHAIN;
    assertCapability("holder_distribution", chain, address);
    const data = await birdeyeRequest<BeHolderDistributionData>(
      "/defi/v3/token/holder",
      { address, mode: "wallet", offset: 0, limit: options.limit ?? 20 },
      { chain, ...options.request },
    );
    let marketData: BeMarketData | null = null;
    try {
      marketData = await this.getMarketData(address, options);
    } catch {
      // Supply context is optional; top-20 simply stays unavailable.
      marketData = null;
    }
    return normalizeHolderDistribution(data, {
      tokenAddress: address,
      chain,
      capturedAt: options.capturedAt ?? new Date().toISOString(),
      marketData,
    });
  },

  /** Cohort-level labeled-holder summary. Provider labels, not verdicts. */
  async getHolderProfile(
    address: string,
    options: BirdeyeCallOptions,
  ): Promise<NormalizedHolderProfile> {
    const chain = options.chain ?? DEFAULT_CHAIN;
    assertCapability("holder_classification", chain, address);
    const data = await birdeyeRequest<BeHolderProfileData>(
      "/token/v1/holder-profile",
      { token_address: address, interval: "1h", include_zero_balance: false },
      { chain, ...options.request },
    );
    return normalizeHolderProfile(data, {
      tokenAddress: address,
      chain,
      capturedAt: options.capturedAt ?? new Date().toISOString(),
    });
  },

  /**
   * Deep, on-demand only: exact wallets behind each label. Nothing in Wingman
   * calls this automatically — it is reserved for explicit deep research.
   */
  async getHolderPositionsOnDemand(
    address: string,
    options: BirdeyeCallOptions & { tag: string; limit?: number },
  ): Promise<unknown> {
    const chain = options.chain ?? DEFAULT_CHAIN;
    assertCapability("holder_positions", chain, address);
    return birdeyeRequest<unknown>(
      "/token/v1/holder-positions",
      { token_address: address, tag: options.tag, limit: options.limit ?? 50 },
      { chain, ...options.request },
    );
  },
};
