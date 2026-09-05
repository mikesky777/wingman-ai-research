/**
 * AI Comparative Triage panel.
 *
 * Read-only view of one triage pass: what the model was allowed to see, what
 * it decided and how that differs from the deterministic Quant ranking.
 * Calibration runs are always visibly marked and never affect history.
 */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, FlaskConical, Loader2, PackagePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { getLatestTriage, runTriage } from "@/lib/wingman/triage.functions";
import { generateResearchPacketsForRun } from "@/lib/wingman/research.functions";
import { relativeTime } from "@/lib/wingman/format";
import { toast } from "sonner";


const decisionTone: Record<string, string> = {
  DEEP_RESEARCH: "border-positive/40 bg-positive/10 text-positive",
  WATCH: "border-warning/40 bg-warning/10 text-warning",
  SKIP: "border-border bg-surface text-muted-foreground",
  BLOCKED_BEFORE_SHORTLIST: "border-negative/40 bg-negative/10 text-negative",
};

function short(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

export function TriagePanel() {
  const queryClient = useQueryClient();
  const fetchLatest = useServerFn(getLatestTriage);
  const startRun = useServerFn(runTriage);
  const generatePackets = useServerFn(generateResearchPacketsForRun);
  const [lastCode, setLastCode] = useState<string | null>(null);

  const packetMutation = useMutation({
    mutationFn: () => generatePackets({ data: {} }),
    onSuccess: (result) => {
      const eligible = result.packets.filter((p) => p.eligibility.researchEligibleNow).length;
      toast.success(
        `Research packets generated — ${result.persistedCount} stored, ${eligible} currently eligible`,
      );
      void queryClient.invalidateQueries({ queryKey: ["ai-triage", "latest"] });
    },
    onError: (error: unknown) => {
      toast.error("Research packet generation failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });


  const { data, isLoading } = useQuery({
    queryKey: ["ai-triage", "latest"],
    queryFn: () => fetchLatest(),
  });

  const mutation = useMutation({
    mutationFn: (mode: "PRODUCTION" | "CALIBRATION") => startRun({ data: { mode } }),
    onSuccess: (result) => {
      setLastCode(result.code);
      if (result.code === "NO_ELIGIBLE_CURRENT_SCAN") {
        toast.warning("No eligible current scan", {
          description:
            "Triage runs only on a healthy, completed current-policy scan that has research packets.",
        });
      } else if (result.status === "completed") {
        toast.success(
          `${result.isCalibration ? "Calibration" : "Triage"} complete — ${result.deepResearchCount} deep research, ${result.watchCount} watch, ${result.skipCount} skip`,
        );
      } else {
        toast.error(`Triage did not complete (${result.code})`, {
          description: result.error ?? undefined,
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["ai-triage", "latest"] });
    },
    onError: (error: unknown) => {
      toast.error("Triage failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const run = useCallback(
    (mode: "PRODUCTION" | "CALIBRATION") => {
      setLastCode(null);
      mutation.mutate(mode);
    },
    [mutation],
  );

  const run_ = data?.run ?? null;
  const decisions = data?.decisions ?? [];

  return (
    <Section
      title="AI Comparative Triage"
      description="Compares the current research-packet cohort against itself and decides which candidates justify expensive deep research. Research priority only — no thesis score, no buy or sell judgement."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => run("PRODUCTION")} disabled={mutation.isPending}>
          {mutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Brain className="size-4" />
          )}
          Run triage
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => run("CALIBRATION")}
          disabled={mutation.isPending}
        >
          <FlaskConical className="size-4" />
          Calibration (dry run)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => packetMutation.mutate()}
          disabled={packetMutation.isPending}
        >
          {packetMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <PackagePlus className="size-4" />
          )}
          Generate / retry research packets
        </Button>
        {lastCode === "NO_ELIGIBLE_CURRENT_SCAN" ? (
          <span className="text-xs text-warning">
            No eligible current scan — nothing was triaged.
          </span>
        ) : null}
      </div>

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">Loading last triage…</p>
      ) : !run_ ? (
        <div className="mt-4">
          <EmptyState
            icon={<Brain className="size-4" />}
            title="No triage run yet"
            description="Run triage against the newest healthy scan, or start a calibration dry run against a historical packet cohort."
          />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {run_.isCalibration ? (
              <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                CALIBRATION — no history written
              </Badge>
            ) : (
              <Badge variant="outline">PRODUCTION</Badge>
            )}
            <Badge variant="outline">{run_.status}</Badge>
            <span>{relativeTime(run_.startedAt)}</span>
            <span className="tabular">
              {run_.packetCount} candidates · {run_.deepResearchCount} deep · {run_.watchCount} watch ·{" "}
              {run_.skipCount} skip · {run_.blockedCount} blocked
            </span>
            <span>
              {run_.triagePolicyVersion} · {run_.promptVersion} · {run_.modelIdentifier ?? "—"}
            </span>
          </div>

          {run_.error ? (
            <p className="rounded-md border border-negative/40 bg-negative/10 p-3 text-xs text-negative">
              {run_.error}
            </p>
          ) : null}

          {decisions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No decisions recorded for this run.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="py-2 pr-3 font-medium">AI</th>
                    <th className="py-2 pr-3 font-medium">Quant</th>
                    <th className="py-2 pr-3 font-medium">Δ</th>
                    <th className="py-2 pr-3 font-medium">Token</th>
                    <th className="py-2 pr-3 font-medium">Setup</th>
                    <th className="py-2 pr-3 font-medium">Structure</th>
                    <th className="py-2 pr-3 font-medium">Participation</th>
                    <th className="py-2 pr-3 font-medium">Decision</th>
                    <th className="py-2 pr-3 font-medium">Rationale</th>
                  </tr>
                </thead>
                <tbody>
                  {decisions.map((d) => (
                    <tr key={d.mint} className="border-b border-border/60 align-top">
                      <td className="tabular py-2 pr-3">{d.triageRank ?? "—"}</td>
                      <td className="tabular py-2 pr-3 text-muted-foreground">
                        {d.quantRank ?? "—"}
                      </td>
                      <td
                        className={`tabular py-2 pr-3 ${
                          (d.rankDelta ?? 0) > 0
                            ? "text-positive"
                            : (d.rankDelta ?? 0) < 0
                              ? "text-negative"
                              : "text-muted-foreground"
                        }`}
                      >
                        {d.rankDelta === null ? "—" : d.rankDelta > 0 ? `+${d.rankDelta}` : d.rankDelta}
                      </td>
                      <td className="py-2 pr-3 font-mono">{short(d.mint)}</td>
                      <td className="py-2 pr-3">{d.setup ?? "NONE"}</td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {d.priceStructure ?? "NOT_EVALUATED"}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {d.participation ?? "NOT_EVALUATED"}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] ${
                            decisionTone[d.decision] ?? decisionTone["SKIP"]
                          }`}
                        >
                          {d.decision}
                        </span>
                        {d.confidence ? (
                          <span className="ml-1 text-[10px] text-muted-foreground">
                            {d.confidence}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-[28rem] py-2 pr-3 text-muted-foreground">
                        {d.rationale}
                        {d.requestedResearchDomains.length ? (
                          <span className="mt-1 block text-[10px] text-muted-foreground/80">
                            Needs: {d.requestedResearchDomains.join(", ")}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
