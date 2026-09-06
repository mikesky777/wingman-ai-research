import { ArrowLeft } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppShell } from "@/components/wingman/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { CalibrationLab } from "@/components/wingman/research/CalibrationLab";
import { LegacyOutcomesDiagnostics } from "@/components/wingman/research/LegacyOutcomes";

/**
 * Shared Calibration page body used by the primary /calibration route.
 * The legacy /settings/calibration route redirects here — there is exactly
 * one Calibration page, so nothing can diverge.
 */
export function CalibrationPage() {
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

      <div className="space-y-6">
        {/* Observatory + Benchmarks + dry-run panels (existing shared components) */}
        <CalibrationLab />

        {/* Experiment Tracks are intentionally not built yet. */}
        <Section
          title="Experiment Tracks"
          description="Challenger policies and experiment lanes will live here."
        >
          <p className="text-xs text-muted-foreground">Experiment Tracks — coming next</p>
        </Section>

        {/* Diagnostics */}
        <LegacyOutcomesDiagnostics />
      </div>
    </AppShell>
  );
}
