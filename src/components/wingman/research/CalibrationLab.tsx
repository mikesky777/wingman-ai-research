/**
 * Calibration Lab (Settings only).
 *
 * Every tool in here is calibration/benchmark work: it never writes production
 * history, never creates opportunities and never creates THESIS_CALL
 * milestones. It is deliberately kept out of the normal Research workflow so
 * the operator is never asked to choose between production and calibration.
 */
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { TriagePanel } from "@/components/wingman/research/TriagePanel";
import { DeepResearchPanel } from "@/components/wingman/research/DeepResearchPanel";
import { ThesisPanel } from "@/components/wingman/research/ThesisPanel";
import { EntryPanel } from "@/components/wingman/research/EntryPanel";
import { Observatory } from "@/components/wingman/calibration/Observatory";
import {
  preflightThesisBenchmarkModels,
  runThesisModelBenchmarkFn,
} from "@/lib/wingman/thesis.functions";
import { toast } from "sonner";

export function CalibrationLab() {
  const preflight = useServerFn(preflightThesisBenchmarkModels);
  const runBenchmark = useServerFn(runThesisModelBenchmarkFn);
  const [status, setStatus] = useState<string | null>(null);

  const preflightMutation = useMutation({
    mutationFn: () => preflight(),
    onSuccess: (r) => setStatus(`${r.code}${r.selectedModel ? ` · ${r.selectedModel}` : ""}`),
    onError: (e: unknown) => toast.error("Preflight failed", { description: String(e) }),
  });

  const benchmarkMutation = useMutation({
    mutationFn: () => runBenchmark({ data: { runCount: 1 } }),
    onSuccess: () => toast.success("Benchmark pass finished — calibration only"),
    onError: (e: unknown) => toast.error("Benchmark failed", { description: String(e) }),
  });

  return (
    <div className="space-y-6">
      <Section
        title="Calibration Lab"
        description="Dry runs and model benchmarks over historical evidence. Nothing here changes production results, opportunities or history."
        actions={
          <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
            CALIBRATION — NO PRODUCTION EFFECT
          </Badge>
        }
      >
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={preflightMutation.isPending}
            onClick={() => preflightMutation.mutate()}
          >
            {preflightMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FlaskConical className="size-3.5" />
            )}
            Benchmark model preflight
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={benchmarkMutation.isPending}
            onClick={() => benchmarkMutation.mutate()}
          >
            {benchmarkMutation.isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <FlaskConical className="size-3.5" />
            )}
            Thesis model benchmark (1 pass)
          </Button>
          {status ? <span className="text-xs text-muted-foreground">{status}</span> : null}
        </div>
      </Section>

      <Observatory />

      <TriagePanel calibration />
      <DeepResearchPanel />
      <ThesisPanel calibration />
      <EntryPanel calibration />
    </div>
  );
}
