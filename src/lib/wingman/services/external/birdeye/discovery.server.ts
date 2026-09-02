/**
 * Birdeye Solana discovery (server-only).
 *
 * Wingman does NOT scan every Solana token. It runs a set of complementary
 * rankings over Birdeye's token list and merges the results, so the honest
 * wording everywhere downstream is "tokens discovered", never "tokens scanned".
 *
 * Endpoint: GET /defi/v3/token/list  (x-chain: solana)
 * Every query is chain-explicit and fails at the capability boundary for any
 * chain Birdeye discovery does not support.
 */
import { supportsChain } from "../capabilities";
import { DEFAULT_CHAIN, type ChainId } from "../chains";
import { birdeyeRequest, isBirdeyeConfigured } from "./client.server";
import { BirdeyeError } from "./errors";
import {
  normalizeDiscoveryPage,
  type BeListResponse,
  type DiscoveryQuerySpec,
} from "./discovery-normalizer";
import type { DiscoveredToken } from "../../scanner/types";

const LOWCAP = { min_market_cap: 30_000, max_market_cap: 750_000, min_liquidity: 3_000 };
const MIDCAP = { min_market_cap: 75_000, max_market_cap: 3_000_000, min_liquidity: 5_000 };
const LARGECAP = { min_market_cap: 750_000, min_liquidity: 10_000 };

/**
 * Multiple rankings, not one global sort. Each surfaces a different slice of
 * the market; overlap is expected and deduplicated later.
 */
export const DISCOVERY_QUERIES: DiscoveryQuerySpec[] = [
  {
    id: "lowcap_volume_1h",
    family: "volume",
    laneHints: ["MOMENTUM", "BASE"],
    params: { sort_by: "volume_1h_usd", sort_type: "desc", ...LOWCAP },
    description: "Low-cap tokens by current hourly volume.",
  },
  {
    id: "lowcap_volume_1h_change",
    family: "volume_change",
    laneHints: ["MOMENTUM"],
    params: { sort_by: "volume_1h_change_percent", sort_type: "desc", ...LOWCAP },
    description: "Low-cap tokens whose hourly volume is expanding fastest.",
  },
  {
    id: "lowcap_trades_1h",
    family: "trade_count",
    laneHints: ["MOMENTUM", "BASE"],
    params: { sort_by: "trade_1h_count", sort_type: "desc", ...LOWCAP },
    description: "Low-cap tokens by hourly trade count.",
  },
  {
    id: "recent_listings",
    family: "recent_listing",
    laneHints: ["MOMENTUM"],
    params: {
      sort_by: "recent_listing_time",
      sort_type: "desc",
      max_market_cap: 750_000,
      min_liquidity: 3_000,
    },
    description: "Newly listed Solana markets with a usable pool.",
  },
  {
    id: "lowcap_liquidity",
    family: "liquidity",
    laneHints: ["BASE"],
    params: { sort_by: "liquidity", sort_type: "desc", ...LOWCAP },
    description: "Low-cap tokens that retained the deepest liquidity.",
  },
  {
    id: "lowcap_holders",
    family: "holder",
    laneHints: ["BASE"],
    params: { sort_by: "holder", sort_type: "desc", ...LOWCAP },
    description: "Low-cap tokens with the broadest holder base.",
  },
  {
    id: "developing_volume_24h",
    family: "volume",
    laneHints: ["BASE"],
    params: { sort_by: "volume_24h_usd", sort_type: "desc", ...MIDCAP },
    description: "Mid-cap tokens by daily volume.",
  },
  {
    id: "developing_trades_24h",
    family: "trade_count",
    laneHints: ["BASE"],
    params: { sort_by: "trade_24h_count", sort_type: "desc", ...MIDCAP },
    description: "Mid-cap tokens by daily trade count.",
  },
  {
    id: "reaccel_volume_change",
    family: "volume_change",
    laneHints: ["REACCEL"],
    params: { sort_by: "volume_1h_change_percent", sort_type: "desc", ...LARGECAP },
    description: "Larger tokens whose hourly volume is breaking from baseline.",
  },
  {
    id: "reaccel_volume_1h",
    family: "volume",
    laneHints: ["REACCEL"],
    params: { sort_by: "volume_1h_usd", sort_type: "desc", ...LARGECAP },
    description: "Larger tokens by current hourly volume.",
  },
];

export interface DiscoveryQueryOutcome {
  queryId: string;
  ok: boolean;
  count: number;
  message: string | null;
}

export interface DiscoveryRunResult {
  tokens: DiscoveredToken[];
  outcomes: DiscoveryQueryOutcome[];
}

export interface RunDiscoveryOptions {
  chain?: ChainId;
  limit?: number;
  queries?: DiscoveryQuerySpec[];
  /** Serialization gap between calls; Birdeye's public tier is ~1 rps. */
  spacingMs?: number;
  /** Injected by tests to avoid network + waiting. */
  fetchPage?: (query: DiscoveryQuerySpec, chain: ChainId, limit: number) => Promise<BeListResponse>;
  sleepImpl?: (ms: number) => Promise<void>;
  /** Wraps each call for cost telemetry. */
  track?: <T>(provider: string, capability: string, fn: () => Promise<T>) => Promise<T>;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function defaultFetchPage(
  query: DiscoveryQuerySpec,
  chain: ChainId,
  limit: number,
): Promise<BeListResponse> {
  return birdeyeRequest<BeListResponse>(
    "/defi/v3/token/list",
    { ...query.params, offset: 0, limit },
    { chain },
  );
}

/**
 * Runs every discovery query. A failing query is isolated: the remaining
 * rankings still produce candidates.
 */
export async function runDiscovery(
  options: RunDiscoveryOptions = {},
): Promise<DiscoveryRunResult> {
  const chain = options.chain ?? DEFAULT_CHAIN;
  const limit = options.limit ?? 50;
  const queries = options.queries ?? DISCOVERY_QUERIES;
  const fetchPage = options.fetchPage ?? defaultFetchPage;
  const wait = options.sleepImpl ?? sleep;
  const spacingMs = options.spacingMs ?? 1_200;
  const track =
    options.track ?? (<T,>(_p: string, _c: string, fn: () => Promise<T>) => fn());

  if (!options.fetchPage) {
    if (!isBirdeyeConfigured()) throw new BirdeyeError("NOT_CONFIGURED");
    if (!supportsChain("birdeye", "market_data_partial", chain)) {
      throw new BirdeyeError("UNSUPPORTED_CHAIN");
    }
  }

  const tokens: DiscoveredToken[] = [];
  const outcomes: DiscoveryQueryOutcome[] = [];

  for (let i = 0; i < queries.length; i += 1) {
    const query = queries[i]!;
    try {
      const page = await track("birdeye", "token_discovery", () =>
        fetchPage(query, chain, limit),
      );
      const normalized = normalizeDiscoveryPage(page, { chain, query });
      tokens.push(...normalized);
      outcomes.push({ queryId: query.id, ok: true, count: normalized.length, message: null });
    } catch (error) {
      const message =
        error instanceof BirdeyeError ? error.code : "Discovery query failed.";
      outcomes.push({ queryId: query.id, ok: false, count: 0, message });
    }
    if (i < queries.length - 1 && spacingMs > 0) await wait(spacingMs);
  }

  return { tokens, outcomes };
}
