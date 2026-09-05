/**
 * Scanner result provenance.
 *
 * The scanner table always shows a specific persisted run. This bar names that
 * run — id, timing, age, status and policy — so results can never be mistaken
 * for freshly generated output, and warns explicitly when the newest scan
 * attempt did not produce them.
 */
import type { ScanAttemptRow, ScanFunnel } from "@/lib/wingman/services/scanner-service";

function ageLabel(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - Date.parse(iso);
  if (Number.isNaN(ms)) return "—";
  const minutes = Math.max(0, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function utcLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.toISOString().slice(11, 16)} UTC`;
}

export interface ScanProvenanceBarProps {
  funnel: ScanFunnel | null;
  latestAttempt: ScanAttemptRow | null;
  showingPrevious: boolean;
  newerAttemptFailed: boolean;
}

export function ScanProvenanceBar({
  funnel,
  latestAttempt,
  showingPrevious,
  newerAttemptFailed,
}: ScanProvenanceBarProps) {
  if (!funnel) {
    return (
      <div className="panel px-4 py-3 text-xs text-muted-foreground">
        No completed scan yet — nothing below is scanner output.
      </div>
    );
  }
  const stale = showingPrevious || newerAttemptFailed;
  return (
    <div className="panel space-y-1.5 px-4 py-3 font-mono text-[11px]">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="text-muted-foreground">Displayed results:</span>
        <span className="text-foreground">scan {funnel.runId.slice(0, 8)}…</span>
        <span className="text-muted-foreground">·</span>
        <span>{funnel.status}</span>
        <span className="text-muted-foreground">·</span>
        <span>completed {utcLabel(funnel.completedAt)}</span>
        <span className="text-muted-foreground">·</span>
        <span>{ageLabel(funnel.completedAt)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {funnel.scannerVersion ?? "scanner/v1"}
          {latestAttempt?.selectionPolicyVersion
            ? ` · ${latestAttempt.selectionPolicyVersion}`
            : ""}
        </span>
      </div>
      {latestAttempt && latestAttempt.runId !== funnel.runId ? (
        <div className="text-muted-foreground">
          Latest scan attempt: {latestAttempt.runId.slice(0, 8)}… · {latestAttempt.status} ·{" "}
          {ageLabel(latestAttempt.startedAt)}
          {latestAttempt.errorMessage ? ` · ${latestAttempt.errorMessage}` : ""}
        </div>
      ) : null}
      {stale ? (
        <div className="text-negative">
          Results below are from the previous successful scan — the most recent attempt did not
          produce a newer one.
        </div>
      ) : null}
    </div>
  );
}
