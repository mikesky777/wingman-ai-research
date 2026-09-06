/**
 * Read-only production policy display. Every value resolves from the
 * authoritative versioned constant of the owning stage.
 */
import { Section } from "@/components/wingman/Section";
import { Badge } from "@/components/ui/badge";
import {
  ACTIVE_THESIS_RUBRIC,
  PRODUCTION_POLICY_STAGES,
} from "@/lib/wingman/services/settings/production-policy";

export function ProductionPolicyCard() {
  return (
    <Section
      title="Production Policy"
      description="Resolved live from the versioned policy constants each stage actually runs. Read-only."
    >
      <div className="grid gap-4 md:grid-cols-2">
        {PRODUCTION_POLICY_STAGES.map((stage) => (
          <div key={stage.stage} className="rounded-md border border-border bg-surface/50 p-3">
            <div className="text-xs font-semibold tracking-tight">{stage.stage}</div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{stage.note}</p>
            <dl className="mt-2 space-y-1">
              {stage.items.map((item) => (
                <div key={item.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11px] text-muted-foreground">{item.label}</dt>
                  <dd className="font-mono text-[11px]">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

export function ThesisRubricCard() {
  return (
    <Section
      title="Thesis Policy"
      description="Fundamentals only. Entry / chart timing is a separate stage and contributes no Thesis points."
      actions={
        <Badge variant="outline" className="font-mono text-[10px]">
          {ACTIVE_THESIS_RUBRIC.rubricVersion}
        </Badge>
      }
    >
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {ACTIVE_THESIS_RUBRIC.components.map((c) => (
          <div
            key={c.key}
            className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5"
          >
            <dt className="text-xs text-muted-foreground">{c.label}</dt>
            <dd className="tabular text-sm font-medium">{c.weight}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Maximum Thesis Score</span>
        <span className="tabular font-semibold">{ACTIVE_THESIS_RUBRIC.maxScore}</span>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Prompt {ACTIVE_THESIS_RUBRIC.promptVersion}. Scanner, Triage, Entry and Sizing weights are
        separate policies and are never merged into this rubric.
      </p>
    </Section>
  );
}
