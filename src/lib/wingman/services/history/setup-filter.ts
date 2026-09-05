/**
 * `history_setup_filter/v1` — one shared setup filter across History stages.
 *
 * The setup value must always come from the exact persisted upstream cohort /
 * provenance of that artifact or event. It is never resolved from the latest
 * token state, ticker/name, another cohort, or a fallback scan. When the exact
 * provenance is genuinely unavailable the setup is `null` (displayed as
 * UNKNOWN) and the row is never counted as BASE, REACCEL, or NONE.
 */

export type HistorySetupFilter = "ALL" | "BASE" | "REACCEL" | "NONE";

export const HISTORY_SETUP_FILTERS: HistorySetupFilter[] = ["ALL", "BASE", "REACCEL", "NONE"];

const QUALIFYING = ["BASE", "REACCEL"];

/**
 * Normalizes a persisted setup value (`discovery_lanes` array or a
 * `setup_at_entry` string like `BASE+REACCEL`) into qualifying setups.
 * `null`/`undefined` input means the provenance is unavailable → UNKNOWN.
 */
export function normalizeSetups(
  raw: string | string[] | null | undefined,
): string[] | null {
  if (raw === null || raw === undefined) return null;
  const parts = (Array.isArray(raw) ? raw : raw.split("+"))
    .map((s) => String(s).trim().toUpperCase())
    .filter(Boolean);
  return parts.filter((s) => QUALIFYING.includes(s));
}

export function setupLabel(setups: string[] | null | undefined): string {
  if (setups === null || setups === undefined) return "UNKNOWN";
  return setups.length ? setups.join(" + ") : "NONE";
}

export function matchesSetupFilter(
  setups: string[] | null | undefined,
  filter: HistorySetupFilter,
): boolean {
  if (filter === "ALL") return true;
  if (setups === null || setups === undefined) return false;
  if (filter === "NONE") return setups.length === 0;
  return setups.includes(filter);
}

export function filterBySetup<T extends { setups: string[] | null }>(
  rows: T[],
  filter: HistorySetupFilter,
): T[] {
  return rows.filter((row) => matchesSetupFilter(row.setups, filter));
}
