import { AlertTriangle } from "lucide-react";
import { Section } from "./Section";
import { cn } from "@/lib/utils";
import { RESEARCH_DISCLAIMER, SIZING_BANDS, STRUCTURAL_MULTIPLIERS } from "@/lib/wingman/config";
import { buildPositionFramework } from "@/lib/wingman/position";
import type { StructuralRiskKey } from "@/lib/wingman/types";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("tabular text-sm", strong ? "font-semibold text-primary" : "")}>
        {value}
      </span>
    </div>
  );
}

export function PositionFramework({
  thesisScore,
  structuralRisk,
}: {
  thesisScore: number;
  structuralRisk: StructuralRiskKey;
}) {
  const f = buildPositionFramework(thesisScore, structuralRisk);

  return (
    <Section
      title="Position Framework"
      description="Reference sizing derived from the thesis score and structural multiplier."
    >
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div>
          <Row label="Thesis score" value={`${f.thesisScore}`} />
          <Row label={`Base maximum exposure (${f.bandLabel})`} value={f.baseExposure} />
          <Row
            label={`Structural multiplier — ${f.structuralLabel}`}
            value={f.multiplier === null ? "NO TRADE" : `${f.multiplier}x`}
          />
          <Row label="Adjusted maximum" value={f.adjustedExposure} strong />
          <Row label="Suggested initial deployment" value={f.initialDeployment} />
          <Row label="Example starter range" value={f.starterExample} />

          <div className="mt-4 flex gap-2.5 rounded-md border border-warning/35 bg-warning/8 px-3.5 py-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <p className="text-xs text-warning">{RESEARCH_DISCLAIMER}</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <div>
            <p className="label-xs mb-2">Sizing bands</p>
            <ul className="space-y-1">
              {SIZING_BANDS.map((b) => (
                <li
                  key={b.label}
                  className={cn(
                    "tabular flex justify-between rounded px-2 py-1 text-[11px]",
                    thesisScore >= b.min && thesisScore <= b.max
                      ? "bg-primary/12 text-primary"
                      : "text-muted-foreground",
                  )}
                >
                  <span>{b.label}</span>
                  <span>{b.exposure}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="label-xs mb-2">Structural multipliers</p>
            <ul className="space-y-1">
              {(Object.keys(STRUCTURAL_MULTIPLIERS) as StructuralRiskKey[]).map((k) => {
                const m = STRUCTURAL_MULTIPLIERS[k];
                return (
                  <li
                    key={k}
                    className={cn(
                      "tabular flex justify-between rounded px-2 py-1 text-[11px]",
                      k === structuralRisk ? "bg-primary/12 text-primary" : "text-muted-foreground",
                    )}
                  >
                    <span>{m.label}</span>
                    <span>{m.multiplier === null ? "NO TRADE" : `${m.multiplier}x`}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    </Section>
  );
}
