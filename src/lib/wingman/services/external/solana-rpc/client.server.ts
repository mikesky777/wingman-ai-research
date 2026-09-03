/**
 * Authoritative Solana mint-account reader (server-only).
 *
 * The ONLY accepted source for mint/freeze authority. Authority state is never
 * inferred from DexScreener warnings, token names, symbols or third-party
 * safety labels. When the RPC fails or an account cannot be parsed, the fact is
 * UNAVAILABLE — never "revoked".
 *
 * The endpoint is read from the server environment at call time and never
 * leaves this module.
 */
import type { AuthorityState, MintAccountFact } from "../../scanner/structural";

export const SOLANA_RPC_SOURCE = "solana_rpc";
const DEFAULT_TIMEOUT_MS = 12_000;
/** getMultipleAccounts hard limit. */
const BATCH_SIZE = 100;

export function isSolanaRpcConfigured(): boolean {
  return Boolean(process.env["SOLANA_RPC_URL"]);
}

interface ParsedMintInfo {
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
}

interface RpcAccount {
  owner?: string;
  data?: { parsed?: { type?: string; info?: ParsedMintInfo } };
}

function authorityFrom(
  info: ParsedMintInfo | undefined,
  key: "mintAuthority" | "freezeAuthority",
): { state: AuthorityState; address: string | null } {
  if (!info || !(key in info)) return { state: "UNKNOWN", address: null };
  const raw = info[key];
  // The parsed encoding reports an explicit null once the authority is revoked.
  if (raw === null) return { state: "REVOKED", address: null };
  if (typeof raw === "string" && raw.length > 0) return { state: "ACTIVE", address: raw };
  return { state: "UNKNOWN", address: null };
}

function unavailable(address: string, capturedAt: string, reason: string): MintAccountFact {
  return {
    address,
    mintAuthority: "UNKNOWN",
    freezeAuthority: "UNKNOWN",
    mintAuthorityAddress: null,
    freezeAuthorityAddress: null,
    tokenProgram: null,
    source: SOLANA_RPC_SOURCE,
    observedAt: null,
    capturedAt,
    unavailable: true,
    unavailableReason: reason,
  };
}

export interface MintAccountOptions {
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/** Parse one `getMultipleAccounts` entry into an authoritative fact. */
export function parseMintAccount(
  address: string,
  account: RpcAccount | null | undefined,
  capturedAt: string,
): MintAccountFact {
  if (!account) return unavailable(address, capturedAt, "Mint account not found on chain.");
  const parsed = account.data?.parsed;
  if (!parsed || parsed.type !== "mint" || !parsed.info) {
    return unavailable(address, capturedAt, "Mint account could not be parsed.");
  }
  const mint = authorityFrom(parsed.info, "mintAuthority");
  const freeze = authorityFrom(parsed.info, "freezeAuthority");
  return {
    address,
    mintAuthority: mint.state,
    freezeAuthority: freeze.state,
    mintAuthorityAddress: mint.address,
    freezeAuthorityAddress: freeze.address,
    tokenProgram: account.owner ?? null,
    source: SOLANA_RPC_SOURCE,
    observedAt: capturedAt,
    capturedAt,
    unavailable: false,
    unavailableReason: null,
  };
}

/**
 * Read mint accounts for the given exact mint addresses.
 * Every requested address is present in the result: failures come back as
 * unavailable facts so callers never mistake silence for a clean token.
 */
export async function fetchMintAccounts(
  addresses: string[],
  options: MintAccountOptions = {},
): Promise<Map<string, MintAccountFact>> {
  const out = new Map<string, MintAccountFact>();
  const unique = [...new Set(addresses.map((a) => a.trim()).filter(Boolean))];
  if (unique.length === 0) return out;

  const endpoint = process.env["SOLANA_RPC_URL"];
  const capturedAt = new Date().toISOString();
  if (!endpoint) {
    for (const address of unique) {
      out.set(address, unavailable(address, capturedAt, "Solana RPC is not configured."));
    }
    return out;
  }

  const fetchImpl = options.fetchImpl ?? fetch;

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE);
    const chunkCapturedAt = new Date().toISOString();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getMultipleAccounts",
          params: [chunk, { encoding: "jsonParsed", commitment: "confirmed" }],
        }),
      });
      if (!response.ok) throw new Error(`RPC responded ${response.status}`);
      const payload = (await response.json()) as {
        result?: { value?: (RpcAccount | null)[] };
        error?: { message?: string };
      };
      if (payload.error) throw new Error(payload.error.message ?? "RPC error");
      const values = payload.result?.value;
      if (!Array.isArray(values)) throw new Error("RPC returned no account values");
      chunk.forEach((address, index) => {
        out.set(address, parseMintAccount(address, values[index], chunkCapturedAt));
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Solana RPC request failed";
      for (const address of chunk) {
        out.set(address, unavailable(address, chunkCapturedAt, `RPC unavailable: ${reason}`));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  return out;
}
