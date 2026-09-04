/**
 * Discovery provider operational panel (display only).
 *
 * Shows whether discovery can run at all, and makes the boundaries explicit:
 * scanner logic is healthy, no universe was produced, recurrence/history are
 * untouched, and AI research cannot run from a failed scan. Quota/reset values
 * the provider does not expose are shown as "Unavailable from provider" —
 * never fabricated.
 */
import type { ProviderReadinessState } from "@/lib/wingman/services/external/birdeye/readiness";

export interface DiscoveryProviderStatus {
  provider: string;
  readiness: {
    state: ProviderReadinessState;
    reason: string | null;
    checkedAt: string;
    quotaRemaining: number | null;
    quotaResetAt: string | null;
  };
  lastSuccessAt: string | null;
  lastHealthyDiscoveredCount: number | null;
  lastFailureAt: string | null;
  lastFailureType: string | null;
  lastFailureReason: string | null;
  consecutiveFailures: number;
}

const UNAVAILABLE = "Unavailable from provider";

function when(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

function discoveryReason(state: ProviderReadinessState, provider: string): string {
  const name = provider.charAt(0).toUpperCase() + provider.slice(1);
  switch (state) {
    case "AVAILABLE":
      return `${name} discovery provider is available.`;
    case "RATE_LIMITED":
      return `${name} discovery provider is rate-limited; a scan may still be attempted.`;
    case "QUOTA_EXHAUSTED":
      return `${name} discovery provider quota exhausted.`;
    case "AUTH_FAILED":
      return `${name} discovery provider credentials rejected.`;
    case "NOT_CONFIGURED":
      return `${name} discovery provider is not configured.`;
    case "UNKNOWN_FAILURE":
      return `${name} discovery provider is currently unavailable.`;
  }
}

export function DiscoveryProviderPanel({ status }: { status: DiscoveryProviderStatus }) {
  const state = status.readiness.state;
  const blocked = state !== "AVAILABLE";
  const hard = state === "QUOTA_EXHAUSTED" || state === "AUTH_FAILED" || state === "NOT_CONFIGURED";
  const action = hard ? "BLOCKED" : state === "AVAILABLE" ? "READY" : "ATTEMPT_ALLOWED";
  const reason = discoveryReason(state, status.provider);

  return (
    <div className="panel px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs">
        <span className="label-xs">DISCOVERY</span>
        <span className="text-muted-foreground">Birdeye:</span>
        <span className={blocked ? "text-negative" : "text-positive"}>{state}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          Scanner action:{" "}
          <span className={hard ? "text-negative" : "text-foreground"}>{action}</span>
        </span>
      </div>

      <p className="mt-2 text-xs text-muted-foreground">
        Reason: <span className="text-foreground">{reason}</span>
      </p>
      {status.readiness.reason && status.readiness.reason !== reason ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Provider reason: <span className="text-foreground">{status.readiness.reason}</span>
        </p>
      ) : null}

      {hard ? (
        <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
          <li>Scanner logic is healthy — only the discovery provider is blocked.</li>
          <li>No valid discovery universe was produced, so this is not an empty market.</li>
          <li>Recurrence and history are unaffected by a failed discovery run.</li>
          <li>AI research cannot run from a failed scan.</li>
        </ul>
      ) : null}

      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3 xl:grid-cols-6">
        {[
          ["Readiness", state],
          ["Checked", when(status.readiness.checkedAt)],
          ["Quota remaining", status.readiness.quotaRemaining ?? UNAVAILABLE],
          ["Quota reset", status.readiness.quotaResetAt ?? UNAVAILABLE],
          ["Last healthy scan", when(status.lastSuccessAt)],
          [
            "Last healthy discovered",
            status.lastHealthyDiscoveredCount === null
              ? "—"
              : String(status.lastHealthyDiscoveredCount),
          ],
          ["Last failure", when(status.lastFailureAt)],
          ["Failure type", status.lastFailureType ?? "—"],
          ["Consecutive failures", String(status.consecutiveFailures)],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-md border border-border bg-surface/60 p-3">
            <p className="label-xs">{label}</p>
            <p className="tabular mt-1 break-words text-sm">{String(value)}</p>
          </div>
        ))}
      </div>

      {status.lastFailureReason ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Last failure reason: <span className="text-foreground">{status.lastFailureReason}</span>
        </p>
      ) : null}
    </div>
  );
}
