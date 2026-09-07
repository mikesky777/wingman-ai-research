/**
 * Persistent progress panel for `production_cycle/v1`.
 *
 * Presentation only. Every number shown is persisted server state for one
 * pinned scan cohort; nothing here starts, qualifies or forces a stage.
 */
import { CheckCircle2, CircleDashed, Loader2, XCircle } from "lucide-react";
import { CYCLE_STAGES, completionMessage } from "@/lib/wingman/services/production-cycle/cycle";
import type { CycleCompletionCode } from "@/lib/wingman/services/production-cycle/cycle";
import { useProductionCycle } from "@/lib/wingman/services/production-cycle/useProductionCycle";
import { cn } from "@/lib/utils";

const VISIBLE_STAGES = CYCLE_STAGES.filter(
  (s) => s !== "STARTING" && s !== "COMPLETE" && s !== "FAILED",
);

const STAGE_LABEL: Record<string, string> = {
  SCANNING: "Scanner",
  GENERATING_PACKETS: "Research packets",
  TRIAGING: "AI triage",
  APPLYING_SPEND_CONTROL: "Spend control",
  DEEP_RESEARCH: "Deep research",
  THESIS_SYNTHESIS: "Thesis synthesis",
  THESIS_QUALIFICATION: "Thesis calls",
  ENTRY_TIMING: "Entry timing",
};

export function ProductionCyclePanel() {
  const { data } = useProductionCycle();
  const cycle = data?.active ?? data?.latest ?? null;
  if (!cycle) return null;

  const isActive = cycle.status !== "COMPLETE" && cycle.status !== "FAILED";
  const currentIndex = VISIBLE_STAGES.indexOf(cycle.stage as (typeof VISIBLE_STAGES)[number]);

  return (
    <section className="rounded-md border border-border bg-surface/60 p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          {isActive ? (
            <Loader2 className="size-3.5 animate-spin text-accent" />
          ) : cycle.status === "FAILED" ? (
            <XCircle className="size-3.5 text-negative" />
          ) : (
            <CheckCircle2 className="size-3.5 text-positive" />
          )}
          <span className="font-medium">
            {isActive
              ? `Full cycle running · ${STAGE_LABEL[cycle.stage] ?? cycle.stage}`
              : cycle.status === "FAILED"
                ? `Full cycle failed · ${STAGE_LABEL[cycle.failureStage ?? ""] ?? cycle.failureStage ?? "unknown stage"}`
                : `COMPLETE · ${completionMessage((cycle.completionCode as CycleCompletionCode) ?? "COMPLETE").toUpperCase()}`}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] text-muted-foreground">
          <span>cycle {cycle.id.slice(0, 8)}</span>
          <span>scan {cycle.scanRunId ? cycle.scanRunId.slice(0, 8) : "—"}</span>
          <span>{cycle.orchestratorVersion}</span>
        </div>
      </header>

      <ol className="mt-3 grid gap-1 sm:grid-cols-2 lg:grid-cols-4">
        {VISIBLE_STAGES.map((stage, index) => {
          const done = cycle.status === "COMPLETE" || (currentIndex >= 0 && index < currentIndex);
          const current = isActive && index === currentIndex;
          return (
            <li
              key={stage}
              className={cn(
                "flex items-center gap-1.5 rounded border border-border/60 px-2 py-1 text-[11px]",
                current && "border-accent/60 bg-accent/10 text-foreground",
                done && "text-muted-foreground",
              )}
            >
              {current ? (
                <Loader2 className="size-3 animate-spin" />
              ) : done ? (
                <CheckCircle2 className="size-3 text-positive" />
              ) : (
                <CircleDashed className="size-3 opacity-50" />
              )}
              {STAGE_LABEL[stage]}
            </li>
          );
        })}
      </ol>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
        <Stat label="Packets" value={cycle.packetCount} />
        <Stat label="Shortlisted" value={cycle.triageDeepCount} />
        <Stat label="Researched" value={cycle.deepResearchExecuted} />
        <Stat
          label="Deferred / blocked / failed"
          value={`${cycle.deepResearchDeferred} / ${cycle.deepResearchBlocked} / ${cycle.deepResearchFailed}`}
        />
        <Stat label="Thesis synthesized" value={cycle.thesisSynthesizedCount} />
        <Stat label="Thesis calls" value={cycle.thesisCallCount} />
        <Stat label="Entry eligible" value={cycle.entryEligibleCount} />
        <Stat label="Entry evaluated" value={cycle.entryEvaluatedCount} />
      </dl>

      {cycle.failureReason ? (
        <p className="mt-2 rounded border border-negative/40 bg-negative/10 px-2 py-1 text-[11px] text-negative">
          {cycle.failureReason}
        </p>
      ) : null}
      {isActive ? (
        <p className="mt-2 text-[11px] text-muted-foreground">
          This run continues on the server. You can close this page — nothing stops.
        </p>
      ) : null}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
