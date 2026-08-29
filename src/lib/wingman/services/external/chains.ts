/**
 * Chain context for provider adapters.
 *
 * Wingman v0 is operationally Solana-only, but chain is always passed
 * explicitly so additional chains can be added without rewriting the evidence
 * system. `tokens.chain` remains the authoritative record for a token.
 */
export type ChainId = "solana" | (string & {});

export const DEFAULT_CHAIN: ChainId = "solana";

/** Chains Wingman itself operates on today. */
export const WINGMAN_SUPPORTED_CHAINS: ChainId[] = ["solana"];

export interface ChainContext {
  chain: ChainId;
}

export const SOLANA_CONTEXT: ChainContext = { chain: "solana" };
