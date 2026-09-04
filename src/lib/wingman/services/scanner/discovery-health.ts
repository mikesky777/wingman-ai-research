/**
 * Discovery health assessment (pure, deterministic).
 *
 * One question only: did the discovery providers actually execute?
 *
 * A scan that discovered zero tokens is only a legitimate observation of the
 * market when discovery ran successfully. When every discovery query failed
 * (quota exhaustion, auth rejection, rate-limit exhaustion, transport error),
 * the run observed nothing at all and must never be persisted as a completed
 * empty scan: downstream recurrence, absence and call-opportunity accounting
 * would then read a provider outage as "the token was not there".
 *
 * Nothing here touches scoring, setups, allocation or policy epochs.
 */

export const DISCOVERY_HEALTH_VERSION = "discovery_health/v1";

export type DiscoveryHealthState = "OK" | "VALID_EMPTY" | "PROVIDER_UNAVAILABLE";

export interface DiscoveryOutcomeLike {
  queryId: string;
  ok: boolean;
  count: number;
  message: string | null;
}

export interface DiscoveryHealth {
  state: DiscoveryHealthState;
  queries: number;
  successes: number;
  failures: number;
  tokens: number;
  /** Distinct failure messages, deduplicated and stable-ordered. */
  failureMessages: string[];
  /** Operator-facing reason. Empty for OK / VALID_EMPTY. */
  reason: string | null;
}

/**
 * Provider-level failures that mean "discovery could not execute", as opposed
 * to a single query returning nothing.
 */
const HARD_FAILURE_PATTERNS = [
  /compute unit/i,
  /usage limit/i,
  /quota/i,
  /rate limit/i,
  /too many requests/i,
  /unauthor/i,
  /forbidden/i,
  /not configured/i,
  /timed? out/i,
  /unavailable/i,
];

function isHardProviderFailure(message: string | null): boolean {
  if (!message) return false;
  return HARD_FAILURE_PATTERNS.some((pattern) => pattern.test(message));
}

export function assessDiscoveryHealth(
  outcomes: DiscoveryOutcomeLike[],
  tokensDiscovered: number,
): DiscoveryHealth {
  const queries = outcomes.length;
  const successes = outcomes.filter((o) => o.ok).length;
  const failures = queries - successes;
  const failureMessages = [
    ...new Set(outcomes.filter((o) => !o.ok && o.message).map((o) => o.message as string)),
  ];

  const base: DiscoveryHealth = {
    state: "OK",
    queries,
    successes,
    failures,
    tokens: tokensDiscovered,
    failureMessages,
    reason: null,
  };

  // No query executed at all: nothing was observed.
  if (queries > 0 && successes === 0) {
    return {
      ...base,
      state: "PROVIDER_UNAVAILABLE",
      reason: `Discovery provider unavailable: all ${queries} discovery queries failed${
        failureMessages.length ? ` (${failureMessages.join("; ")})` : ""
      }.`,
    };
  }

  if (tokensDiscovered > 0) return base;

  // Zero tokens with at least one hard provider failure is an outage, not an
  // empty universe.
  const hard = outcomes.filter((o) => !o.ok && isHardProviderFailure(o.message));
  if (hard.length > 0) {
    return {
      ...base,
      state: "PROVIDER_UNAVAILABLE",
      reason: `Discovery returned zero tokens while ${hard.length} of ${queries} queries failed with provider errors${
        failureMessages.length ? ` (${failureMessages.join("; ")})` : ""
      }.`,
    };
  }

  // Every query executed and genuinely returned nothing.
  return { ...base, state: "VALID_EMPTY" };
}

export function isDiscoveryUsable(health: DiscoveryHealth): boolean {
  return health.state !== "PROVIDER_UNAVAILABLE";
}
