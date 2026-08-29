/** Shared presentation helpers for the Scanner Workbench. Display only. */
export const LANE_TONE: Record<string, string> = {
  EARLY_MOMENTUM: "border-primary/40 bg-primary/10 text-primary",
  POST_BOND_BASE: "border-positive/40 bg-positive/10 text-positive",
  DEVELOPING_THESIS: "border-border-strong text-muted-foreground",
  REACCELERATION: "border-border-strong text-foreground",
};

export const SIGNAL_TONE: Record<string, string> = {
  ACCELERATING: "text-positive",
  EXTREME: "text-destructive",
  ACTIVE: "text-foreground",
  LOW: "text-muted-foreground",
  DORMANT: "text-muted-foreground",
  HIGH: "text-positive",
  MODERATE: "text-foreground",
  CONFIRMED: "text-positive",
  EARLY: "text-primary",
  NONE: "text-muted-foreground",
  UNKNOWN: "text-muted-foreground",
  POSITIVE: "text-positive",
  NEGATIVE: "text-destructive",
  NEUTRAL: "text-muted-foreground",
};

export const EXTENSION_TONE: Record<string, string> = {
  LOW: "text-positive",
  MODERATE: "text-foreground",
  HIGH: "text-destructive",
  EXTREME: "text-destructive",
  UNKNOWN: "text-muted-foreground",
};

export const LANES = [
  "EARLY_MOMENTUM",
  "POST_BOND_BASE",
  "DEVELOPING_THESIS",
  "REACCELERATION",
] as const;

export const COMPONENT_LABELS: Record<string, string> = {
  activityQuality: "Activity quality",
  acceleration: "Acceleration",
  persistence: "Persistence",
  reacceleration: "Reacceleration",
  liquidityQuality: "Liquidity quality",
  turnover: "Turnover",
  participation: "Participation",
  freshness: "Freshness",
  lifecycleFit: "Lifecycle fit",
  momentum: "Momentum",
};

export function formatAge(minutes: number | null): string {
  if (minutes === null) return "unknown";
  if (minutes < 90) return `${Math.round(minutes)}m`;
  if (minutes < 60 * 48) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / 1440)}d`;
}

/** Ratio → percent. `null` stays visibly unavailable, never 0%. */
export function formatRatioPct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const pct = value * 100;
  // Keep small-but-real turnover visible instead of collapsing it to 0%.
  return `${pct > 0 && pct < 1 ? pct.toFixed(2) : pct.toFixed(0)}%`;
}

export function formatPctChange(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(0)}%`;
}

export function formatNum(value: number | null | undefined, digits = 2): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function laneLabel(lane: string): string {
  const labels: Record<string, string> = {
    EARLY_MOMENTUM: "EARLY",
    POST_BOND_BASE: "BASE",
    DEVELOPING_THESIS: "DEVELOPING",
    REACCELERATION: "REACCEL",
  };
  return labels[lane] ?? lane.replace(/_/g, " ");
}
