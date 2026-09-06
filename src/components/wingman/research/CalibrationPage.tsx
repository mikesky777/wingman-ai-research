import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/wingman/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalibrationLab } from "@/components/wingman/research/CalibrationLab";
import { Observatory } from "@/components/wingman/calibration/Observatory";
import { ExperimentTracks } from "@/components/wingman/calibration/ExperimentTracks";
import { LegacyOutcomesDiagnostics } from "@/components/wingman/research/LegacyOutcomes";
import { cn } from "@/lib/utils";

/**
 * Shared Calibration page body used by the primary /calibration route.
 * The legacy /settings/calibration route redirects here — there is exactly
 * one Calibration page, so nothing can diverge.
 */
const TABS = ["Observatory", "Experiments", "Benchmarks", "Diagnostics"] as const;
type Tab = (typeof TABS)[number];

export function CalibrationPage() {
  const [tab, setTab] = useState<Tab>("Observatory");

  return (
    <AppShell
      title="Calibration Lab"
      subtitle="Analysis and benchmarks over frozen production evidence. Nothing here changes production."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
          CALIBRATION — NO PRODUCTION EFFECT
        </Badge>
        <p className="text-xs text-muted-foreground">
          Analysis, backtests and challenger policies only. Nothing here creates or rewrites
          production decisions.
        </p>
        <Button asChild size="sm" variant="ghost" className="ml-auto">
          <Link to="/settings">
            <ArrowLeft className="size-3.5" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 rounded-md border border-border bg-surface p-1">
        {TABS.map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => setTab(item)}
            className={cn(
              "rounded px-3 py-1.5 text-xs transition",
              tab === item
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="space-y-6">
        {tab === "Observatory" ? <Observatory /> : null}
        {tab === "Experiments" ? <ExperimentTracks /> : null}
        {tab === "Benchmarks" ? <CalibrationLab /> : null}
        {tab === "Diagnostics" ? <LegacyOutcomesDiagnostics /> : null}
      </div>
    </AppShell>
  );
}
