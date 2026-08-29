import { supabase } from "../data/supabase";
import type { Token } from "../types";

export interface TokenRow {
  id: string;
  contract_address: string;
  chain: string;
  symbol: string;
  name: string;
  token_created_at: string | null;
  created_at: string;
}

export function toDomainToken(row: TokenRow): Token {
  return {
    id: row.id,
    name: row.name,
    ticker: row.symbol,
    contractAddress: row.contract_address,
    chain: "solana",
    launchedAt: row.token_created_at ?? row.created_at,
  };
}

const SELECT = "id, contract_address, chain, symbol, name, token_created_at, created_at";

/** TokenDataService — permanent token identity records. */
export const TokenDataService = {
  async list(): Promise<Token[]> {
    const { data, error } = await supabase.from("tokens").select(SELECT).eq("is_active", true);
    if (error) throw error;
    return (data as TokenRow[]).map(toDomainToken);
  },

  async getById(id: string): Promise<Token | null> {
    const { data, error } = await supabase.from("tokens").select(SELECT).eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? toDomainToken(data as TokenRow) : null;
  },
};
