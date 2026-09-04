/** Shared presentation helpers for the Scanner Workbench. Display only. */
export const LANE_TONE: Record<string, string> = {
  MOMENTUM: "border-primary/40 bg-primary/10 text-primary",
  BASE: "border-positive/40 bg-positive/10 text-positive",
  REACCEL: "border-border-strong text-foreground",
  NONE: "border-border-strong text-muted-foreground",
  // Legacy scanner/v1 setups, display only.
  EARLY_MOMENTUM: "border-primary/40 bg-primary/10 text-primary",
  POST_BOND_BASE: "border-positive/40 bg-positive/10 text-positive",
  DEVELOPING_THESIS: "border-border-strong text-muted-foreground",
  REACCELERATION: "border-border-strong text-foreground",
};

/**
 * Price Integrity is a LABEL ONLY (see PRICE_INTEGRITY_SELECTION_EFFECT).
 * It never excludes a candidate from Survivor selection.
 */
export const PRICE_INTEGRITY_TONE: Record<string, string> = {
  HEALTHY: "border-positive/40 bg-positive/10 text-positive",
  CONCERN: "border-warning/40 bg-warning/10 text-warning",
  DAMAGED: "border-destructive/40 bg-destructive/10 text-destructive",
  UNKNOWN: "border-border-strong text-muted-foreground",
};

export const PRICE_INTEGRITY_HINT: Record<string, string> = {
  HEALTHY: "Price Integrity label: constructive post-launch structure. Label only — no selection effect.",
  CONCERN: "Price Integrity label: partially damaged launch structure. Label only — no selection effect.",
  DAMAGED: "Price Integrity label: launch-collapse structure. Label only — still eligible as a Survivor.",
  UNKNOWN: "Price Integrity label: insufficient launch history. Label only — no selection effect.",
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

/** Observable setups, in display order. */
export const LANES = ["BASE", "MOMENTUM", "REACCEL"] as const;

/**
 * Normal Scanner tabs only show ENABLED setups. A disabled setup keeps its
 * enum, classifier and settings — it simply moves out of the normal tabs and
 * stays inspectable under Calibration.
 */
export function enabledSetups(
  strategy: { setups: Record<string, { enabled: boolean }> } | null | undefined,
): (typeof LANES)[number][] {
  if (!strategy) return LANES.filter((lane) => lane !== "MOMENTUM");
  return LANES.filter((lane) => strategy.setups[lane]?.enabled !== false);
}

export function disabledSetups(
  strategy: { setups: Record<string, { enabled: boolean }> } | null | undefined,
): (typeof LANES)[number][] {
  const enabled = new Set(enabledSetups(strategy));
  return LANES.filter((lane) => !enabled.has(lane));
}

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
    MOMENTUM: "MOMENTUM",
    BASE: "BASE",
    REACCEL: "REACCEL",
    NONE: "NONE",
    // scanner/v1 rows keep their historical setup names, marked as legacy.
    EARLY_MOMENTUM: "EARLY (v1)",
    POST_BOND_BASE: "BASE (v1)",
    DEVELOPING_THESIS: "DEVELOPING (v1)",
    REACCELERATION: "REACCEL (v1)",
  };
  return labels[lane] ?? lane.replace(/_/g, " ");
}

/** Recurrence is descriptive scan history only — never a quality verdict. */
export const RECURRENCE_TONE: Record<string, string> = {
  NEW: "border-primary/40 bg-primary/10 text-primary",
  REPEAT: "border-border-strong text-muted-foreground",
  CHANGED: "border-positive/40 bg-positive/10 text-positive",
  RETURNING: "border-warning/40 bg-warning/10 text-warning",
};

export const RECURRENCE_STATES = ["NEW", "CHANGED", "RETURNING", "REPEAT"] as const;
export type RecurrenceFilter = "ALL" | (typeof RECURRENCE_STATES)[number];

export const RECURRENCE_HINT: Record<string, string> = {
  NEW: "First time Wingman Scanner has seen this token.",
  REPEAT: "Seen in the previous scan with no meaningful scanner-level change.",
  CHANGED: "Seen before; setup, priority or a signal state moved meaningfully.",
  RETURNING: "Seen before, absent from recent scans, now back.",
};

export function formatScanTime(value: string | null): string {
  if (!value) return "—";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString();
}

/** Evidence refresh urgency. Cost/freshness only — never a quality verdict. */
/** Structural Eligibility badge tones. Descriptive only — shadow mode. */
export const STRUCTURAL_TONE: Record<string, string> = {
  PASS: "border-emerald-500/40 text-emerald-300",
  CONCERN: "border-amber-500/40 text-amber-300",
  FAIL: "border-rose-500/40 text-rose-300",
  UNKNOWN: "border-border-strong text-muted-foreground",
};

export const REFRESH_TONE: Record<string, string> = {
  REFRESH_REQUIRED: "border-primary/40 bg-primary/10 text-primary",
  REFRESH_OPTIONAL: "border-border-strong text-foreground",
  CARRY_FORWARD: "border-border-strong text-muted-foreground",
};

export const REFRESH_LABEL: Record<string, string> = {
  REFRESH_REQUIRED: "REFRESH",
  REFRESH_OPTIONAL: "FRESH",
  CARRY_FORWARD: "CARRY",
};

export const REFRESH_HINT: Record<string, string> = {
  REFRESH_REQUIRED: "Needs fresh evidence this scan.",
  REFRESH_OPTIONAL: "Evidence is approaching the freshness limit.",
  CARRY_FORWARD: "Unchanged repeat — still-valid evidence reused, no provider calls spent.",
};

export function formatEvidenceAge(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  return formatAge(minutes);
}

/**
 * Outcome display helpers. Historical market behavior after Wingman observed
 * or selected a token — never a simulated or backtested trade return.
 */
export function outcomeTone(value: number | null | undefined): string {
  if (value === null || value === undefined) return "text-muted-foreground";
  if (value > 0) return "text-positive";
  if (value < 0) return "text-destructive";
  return "text-muted-foreground";
}

/** Signed percentage, `—` when the observation is unavailable (never 0%). */
export function formatOutcomePct(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  const digits = abs > 0 && abs < 1 ? 2 : 0;
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export function formatOutcomeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) return "—";
  return new Date(parsed).toLocaleString();
}
