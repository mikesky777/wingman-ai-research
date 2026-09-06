import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { AppShell } from "@/components/wingman/AppShell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalibrationLab } from "@/components/wingman/research/CalibrationLab";
import { LegacyOutcomesDiagnostics } from "@/components/wingman/research/LegacyOutcomes";

export const Route = createFileRoute("/settings/calibration")({
  head: () => ({
    meta: [
      { title: "Calibration Lab — Wingman AI" },
      {
        name: "description",
        content:
          "Benchmarks, the Calibration Observatory and dry runs over frozen production evidence. Calibration has no production effect.",
      },
      { property: "og:title", content: "Calibration Lab — Wingman AI" },
      {
        property: "og:description",
        content:
          "Model benchmarks and outcome analysis over frozen decisions — never writes production history.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CalibrationLabPage,
});

function CalibrationLabPage() {
  return (
    <AppShell
      title="Calibration Lab"
      subtitle="Analysis and benchmarks over frozen production evidence. Nothing here changes production."
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="border-warning/45 bg-warning/12 text-warning">
          CALIBRATION — NO PRODUCTION EFFECT
        </Badge>
        <Button asChild size="sm" variant="ghost">
          <Link to="/settings">
            <ArrowLeft className="size-3.5" />
            Back to Settings
          </Link>
        </Button>
      </div>

      <div className="space-y-6">
        <CalibrationLab />
        <LegacyOutcomesDiagnostics />
      </div>
    </AppShell>
  );
}
