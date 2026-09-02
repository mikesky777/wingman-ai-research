/**
 * Scanner strategy settings (server-only, service-role).
 *
 * The active strategy is editable calibration state, NOT a thesis or a rule
 * about what to buy. Reads are validated through `normalizeStrategySettings`
 * so a malformed stored row can never break a scan. Historical runs keep their
 * own immutable config snapshot and are never rewritten from here.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  STRATEGY_CONFIG_VERSION,
  WINGMAN_DEFAULT_SETTINGS,
  normalizeStrategySettings,
  type StrategySettings,
} from "./config";

type Row = Record<string, unknown>;

export interface ActiveStrategy {
  id: string | null;
  isDefault: boolean;
  settings: StrategySettings;
  updatedAt: string | null;
}

/** The strategy every new scan runs with. Falls back to Wingman Default v1. */
export async function loadActiveStrategy(): Promise<ActiveStrategy> {
  const { data, error } = await supabaseAdmin
    .from("scanner_strategy_settings")
    .select("id, config, is_default, updated_at")
    .eq("is_active", true)
    .maybeSingle();

  if (error || !data) {
    return { id: null, isDefault: true, settings: WINGMAN_DEFAULT_SETTINGS, updatedAt: null };
  }

  const row = data as Row;
  return {
    id: row["id"] as string,
    isDefault: Boolean(row["is_default"]),
    settings: normalizeStrategySettings(row["config"]),
    updatedAt: (row["updated_at"] as string | null) ?? null,
  };
}

/** Save an edited strategy and make it active for future scans. */
export async function saveActiveStrategy(raw: unknown): Promise<ActiveStrategy> {
  const settings = normalizeStrategySettings(raw);
  const existing = await loadActiveStrategy();

  if (existing.id) {
    const { error } = await supabaseAdmin
      .from("scanner_strategy_settings")
      .update({
        name: settings.name,
        config: settings as never,
        config_version: STRATEGY_CONFIG_VERSION,
        is_default: false,
      } as never)
      .eq("id", existing.id);
    if (error) throw new Error(`Could not save strategy settings: ${error.message}`);
    return { ...existing, isDefault: false, settings };
  }

  const { data, error } = await supabaseAdmin
    .from("scanner_strategy_settings")
    .insert({
      name: settings.name,
      config: settings as never,
      config_version: STRATEGY_CONFIG_VERSION,
      is_active: true,
      is_default: false,
    } as never)
    .select("id, updated_at")
    .single();
  if (error) throw new Error(`Could not save strategy settings: ${error.message}`);

  const row = data as Row;
  return {
    id: row["id"] as string,
    isDefault: false,
    settings,
    updatedAt: (row["updated_at"] as string | null) ?? null,
  };
}

/** Restore Wingman Default v1. Past runs keep their own snapshots. */
export async function resetActiveStrategy(): Promise<ActiveStrategy> {
  const existing = await loadActiveStrategy();
  if (!existing.id) {
    return { id: null, isDefault: true, settings: WINGMAN_DEFAULT_SETTINGS, updatedAt: null };
  }
  const { error } = await supabaseAdmin
    .from("scanner_strategy_settings")
    .update({
      name: WINGMAN_DEFAULT_SETTINGS.name,
      config: WINGMAN_DEFAULT_SETTINGS as never,
      config_version: STRATEGY_CONFIG_VERSION,
      is_default: true,
    } as never)
    .eq("id", existing.id);
  if (error) throw new Error(`Could not reset strategy settings: ${error.message}`);
  return { ...existing, isDefault: true, settings: WINGMAN_DEFAULT_SETTINGS };
}
