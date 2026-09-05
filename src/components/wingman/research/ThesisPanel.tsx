/**
 * Thesis Synthesis panel (Research → Thesis).
 *
 * Shows the judgement layer over already-collected evidence. Thesis Score and
 * Evidence Confidence are displayed as two clearly separate measures, and
 * neither is a probability of success. No entry state, no sizing, no trade
 * action is shown or implied anywhere in this view.
 */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Brain, FlaskConical, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import {
  getThesisProgress,
  getThesisReports,
  runThesisSynthesisBatch,
} from "@/lib/wingman/thesis.functions";

import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { componentsForRubric } from "@/lib/wingman/services/research/thesis/contracts";
import { relativeTime, formatUsd } from "@/lib/wingman/format";
import { toast } from "sonner";

const verdictTone: Record<string, string> = {
  STRONG_THESIS: "border-positive/40 bg-positive/10 text-positive",
  PROMISING: "border-primary/40 bg-primary/10 text-primary",
  WATCH: "border-border-strong bg-surface text-foreground",
  WEAK_THESIS: "border-warning/40 bg-warning/10 text-warning",
  INSUFFICIENT_EVIDENCE: "border-border bg-surface text-muted-foreground",
};

const severityTone: Record<string, string> = {
  LOW: "border-border bg-surface text-muted-foreground",
  MODERATE: "border-border-strong bg-surface text-foreground",
  HIGH: "border-warning/40 bg-warning/10 text-warning",
  CRITICAL: "border-destructive/40 bg-destructive/10 text-destructive",
};

function short(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

export function ThesisPanel({ calibration = false }: { calibration?: boolean } = {}) {
  const queryClient = useQueryClient();
  const fetchReports = useServerFn(getThesisReports);
  const fetchProgress = useServerFn(getThesisProgress);
  const startRun = useServerFn(runThesisSynthesisBatch);
  const [openId, setOpenId] = useState<string | null>(null);
  const mode: "PRODUCTION" | "CALIBRATION" = calibration ? "CALIBRATION" : "PRODUCTION";

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["thesis", "reports", mode],
    queryFn: () => fetchReports({ data: { mode } }),
  });

  const { data: progress } = useQuery({
    queryKey: ["thesis", "progress"],
    queryFn: () => fetchProgress(),
    enabled: !calibration,
  });

  const mutation = useMutation({
    mutationFn: (mode: "PRODUCTION" | "CALIBRATION") =>
      startRun({ data: mode === "CALIBRATION" ? { mode, limit: 3 } : { mode } }),
    onSuccess: (result) => {
      if (result.code === "NO_DEEP_RESEARCH_REPORTS") {
        toast.warning("No research dossiers", {
          description: "Thesis Synthesis consumes completed Deep Research reports.",
        });
      } else if (result.code === "NO_ELIGIBLE_CANDIDATES") {
        toast.info("Nothing left to synthesize", {
          description: "Every eligible candidate in this cohort already has a thesis report.",
        });
      } else if (result.code === "THESIS_INPUT_PROVENANCE_MISMATCH") {
        toast.error("THESIS_INPUT_PROVENANCE_MISMATCH", {
          description: "Inputs did not resolve to the active scan and triage run. Nothing was spent.",
        });
      } else if (result.code === "MISSING_API_KEY") {
        toast.error("Synthesis model unavailable");
      } else {
        toast.success(
          `${result.isCalibration ? "Calibration" : "Synthesis"} finished — ${result.completed} theses, ${result.insufficient} insufficient evidence, ${result.blocked} blocked, ${result.opportunities} qualified`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["thesis"] });
      void queryClient.invalidateQueries({ queryKey: ["research", "production-funnel"] });
    },
    onError: (error: unknown) => {
      toast.error("Thesis synthesis failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const run = useCallback((mode: "PRODUCTION" | "CALIBRATION") => mutation.mutate(mode), [mutation]);
  const pending = progress?.pending ?? 0;

  return (
    <Section
      title="Thesis quality"
      description="Judgement over collected evidence — fundamentals only. Timing (Entry) contributes zero thesis points. Thesis Score is conviction in the idea; Evidence Confidence is how trustworthy the evidence behind it is. Neither is a probability of success, and no entry or sizing is produced here."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {calibration ? (
            <Button
              variant="outline"
              size="sm"
              disabled={mutation.isPending}
              onClick={() => run("CALIBRATION")}
            >
              {mutation.isPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <FlaskConical className="size-3.5" />
              )}
              Dry run (3)
            </Button>
          ) : (
            <>
              {progress ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge variant="outline" className="tabular text-[10px]">
                    Synthesized {progress.synthesized} / {progress.eligible}
                  </Badge>
                  <Badge variant="outline" className="tabular text-[10px]">
                    Pending {progress.pending}
                  </Badge>
                  <Badge variant="outline" className="tabular text-[10px]">
                    Thesis Calls {progress.thesisCalls}
                  </Badge>
                </div>
              ) : null}
              <Button
                size="sm"
                disabled={mutation.isPending || (progress ? pending === 0 : false)}
                onClick={() => run("PRODUCTION")}
              >
                {mutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Brain className="size-3.5" />
                )}
                Synthesize shortlist{pending > 0 ? ` (${pending})` : ""}
              </Button>
            </>
          )}
        </div>
      }
    >

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading thesis reports…</p>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<Brain className="size-4" />}
          title="No thesis reports yet"
          description="Run synthesis over completed deep-research dossiers, or start with a 3-candidate dry run."
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const open = openId === r.id;
            return (
              <li key={r.id} className="rounded-md border border-border bg-surface/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <TokenIdentity
                      symbol={r.symbol ?? short(r.mint)}
                      name={r.name ?? null}
                      mint={r.mint}
                      pairAddress={r.pairAddress}
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                    {r.triageRank !== null ? (
                      <Badge variant="outline" className="text-[10px]">
                        AI #{r.triageRank}
                      </Badge>
                    ) : null}
                    {r.isCalibration ? (
                      <Badge variant="outline" className="text-[10px]">
                        CALIBRATION
                      </Badge>
                    ) : null}
                    {r.setups.length ? (
                      <Badge variant="outline" className="text-[10px]">
                        {r.setups.join("+")}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">
                        NONE
                      </Badge>
                    )}
                    {r.qualifiedAsOpportunity ? (
                      <Badge className="text-[10px]">OPPORTUNITY</Badge>
                    ) : null}
                    {r.marketCap !== null ? (
                      <span className="tabular text-[11px] text-muted-foreground">
                        MC {formatUsd(r.marketCap)}
                      </span>
                    ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${verdictTone[r.verdict ?? ""] ?? ""}`}
                    >
                      {r.verdict ?? r.status.toUpperCase()}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : r.id)}>
                      {open ? "Hide" : "Detail"}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ScorePill
                    label="Thesis Score"
                    hint="Conviction in the idea, given the evidence we have"
                    value={r.thesisScore}
                  />
                  <ScorePill
                    label="Evidence Confidence"
                    hint="How complete, current and independent that evidence is"
                    value={r.evidenceConfidence}
                  />
                </div>

                {r.oneSentenceThesis ? (
                  <p className="mt-3 text-xs leading-relaxed">{r.oneSentenceThesis}</p>
                ) : null}

                <dl className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                  <div>
                    <dt className="label-xs">
                      Strongest catalyst
                      {r.strongestCatalyst
                        ? ` (${r.catalystClassification ?? r.catalystKind})`
                        : ""}
                    </dt>
                    <dd className="text-muted-foreground">
                      {r.strongestCatalyst ?? "No verified catalyst found"}
                      {r.catalystVerificationBasis ? (
                        <span className="block text-[10px]">{r.catalystVerificationBasis}</span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="label-xs">Why now (market signal)</dt>
                    <dd className="text-muted-foreground">{r.whyNowMarketSignal ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="label-xs">Strongest concern</dt>
                    <dd className="text-muted-foreground">{r.strongestConcern ?? "—"}</dd>
                  </div>
                  {r.narrativeMaturity ? (
                    <div>
                      <dt className="label-xs">Narrative maturity</dt>
                      <dd className="text-muted-foreground">
                        {r.narrativeMaturity}
                        {r.narrativeSupportCodes.length
                          ? ` · ${r.narrativeSupportCodes.join(", ")}`
                          : ""}
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {r.blockedReasons.length ? (
                  <p className="mt-2 text-[11px] text-warning">
                    Blocked before thesis: {r.blockedReasons.join(", ")}
                  </p>
                ) : null}

                <p className="mt-2 text-[10px] text-muted-foreground">
                  {relativeTime(r.createdAt)} · {r.policyVersion} · {r.rubricVersion ?? "thesis_rubric/v1"} ·{" "}
                  {r.promptVersion ?? ""} {r.modelIdentifier ?? "model n/a"}
                </p>

                {open ? <ThesisDetail report={r} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function ScorePill({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: number | null;
}) {
  return (
    <div className="rounded-md border border-border bg-background/40 px-3 py-2">
      <p className="label-xs">{label}</p>
      <p className="tabular mt-1 text-2xl leading-none font-semibold">
        {value ?? "—"}
        <span className="text-xs font-normal text-muted-foreground"> / 100</span>
      </p>
      <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>
    </div>
  );
}

type Report = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof getThesisReports>>>>[number];

function ThesisDetail({ report }: { report: Report }) {
  const sections: { label: string; body: string | null }[] = [
    { label: "THESIS", body: report.sections?.thesis ?? report.narrativeThesis ?? null },
    { label: "CATALYST", body: report.sections?.catalyst ?? null },
    { label: "MIND-SHARE", body: report.sections?.mindshare ?? null },
    { label: "HOLDERS / DEV", body: report.sections?.holdersDev ?? null },
    { label: "VALUATION", body: report.sections?.valuation ?? null },
    { label: "BULL CASE", body: report.strongestBullCase },
    { label: "BEAR CASE", body: report.strongestBearCase },
  ];

  return (
    <div className="mt-4 space-y-4 border-t border-border pt-4">
      <div>
        <p className="label-xs mb-2">Component scores</p>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {componentsForRubric(report.rubricVersion).map((c) => {
            const value = report.components?.[c.key] ?? null;
            return (
              <li key={c.key} className="flex items-baseline justify-between gap-3 text-[11px]">
                <span className="text-muted-foreground">{c.label}</span>
                <span className="tabular font-medium">
                  {value ?? "—"}
                  <span className="text-muted-foreground"> / {c.weight}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      {sections.map((s) =>
        s.body ? (
          <div key={s.label}>
            <p className="label-xs mb-1">{s.label}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{s.body}</p>
            {s.label === "BEAR CASE" && report.bearSeverity ? (
              <Badge
                variant="outline"
                className={`mt-1.5 text-[10px] ${severityTone[report.bearSeverity] ?? ""}`}
              >
                SEVERITY {report.bearSeverity}
              </Badge>
            ) : null}
          </div>
        ) : null,
      )}

      {report.invalidation.length ? (
        <div>
          <p className="label-xs mb-1">INVALIDATION</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {report.invalidation.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.evidenceGaps.length || report.evidenceDeductions.length ? (
        <div>
          <p className="label-xs mb-1">EVIDENCE GAPS</p>
          <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
            {report.evidenceGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
            {report.evidenceDeductions.map((d) => (
              <li key={d.code}>
                {d.detail} <span className="text-[10px]">(−{d.points} evidence confidence)</span>
                {d.unresolvedReasons?.length ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">
                    [{[...new Set(d.unresolvedReasons)].join(", ")}]
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {report.evidenceConfidenceArtifact ? (
            <p className="mt-2 text-[10px] text-muted-foreground">
              {report.evidenceConfidenceVersion ?? report.evidenceConfidenceArtifact.version} ·
              search {report.evidenceConfidenceArtifact.searchHealth} · raw{" "}
              <span className="tabular">{report.evidenceConfidenceArtifact.rawScore}</span> before
              0–100 floor · {report.evidenceConfidenceArtifact.diagnostics.effectiveIndependentSources}{" "}
              distinct independent origin(s) ·{" "}
              {report.evidenceConfidenceArtifact.diagnostics.onChainMirrorCount} on-chain mirror(s)
            </p>
          ) : null}
        </div>
      ) : null}

      {report.evidenceSemanticsVersion ? (
        <div className="space-y-3">
          <p className="label-xs">
            EVIDENCE ({report.evidenceSemanticsVersion})
            {report.sourceMix ? (
              <span className="ml-2 font-normal text-muted-foreground">
                {report.sourceMix.independent} independent · {report.sourceMix.community} community ·{" "}
                {report.sourceMix.projectOwned + report.sourceMix.projectAffiliated} project ·{" "}
                {report.sourceMix.unknown} unknown
              </span>
            ) : null}
          </p>

          <EvidenceList
            label="SUPPORTING (POSITIVE)"
            items={report.positiveEvidence}
            tone="text-muted-foreground"
          />
          <EvidenceList
            label="ADVERSE (NEGATIVE — cited)"
            items={report.negativeEvidence}
            tone="text-destructive"
          />
          <EvidenceList
            label="NOT ESTABLISHED (MISSING — not bearish)"
            items={report.missingEvidence}
            tone="text-muted-foreground"
          />
          <EvidenceList
            label="AMBIGUOUS"
            items={report.ambiguousEvidence}
            tone="text-muted-foreground"
          />

          {report.narrativeMaturityReasons.length ? (
            <div>
              <p className="label-xs mb-1">NARRATIVE MATURITY REASONING</p>
              <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                {report.narrativeMaturityReasons.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {report.gateDiagnostics?.independentSourceGateBinding ? (
            <p className="text-[11px] text-warning">
              Calibration note: source independence was the only unmet gate (
              {report.gateDiagnostics.independentSourceCount} independent,{" "}
              {report.gateDiagnostics.primarySourceCount} primary,{" "}
              {report.gateDiagnostics.communitySourceCount} community). The gate was still applied.
            </p>
          ) : null}
        </div>
      ) : null}

      {report.sources.length ? (
        <div>
          <p className="label-xs mb-1">SOURCES</p>
          <ul className="space-y-1 text-[11px]">
            {report.sources.map((s) => (
              <li key={s.ref} className="flex items-start gap-2">
                <span className="tabular text-muted-foreground">{s.ref}</span>
                <span className="min-w-0 flex-1 truncate">
                  {s.url ? (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="inline-flex items-center gap-1 hover:underline"
                    >
                      <Link2 className="size-3" />
                      {s.title ?? s.url}
                    </a>
                  ) : (
                    (s.title ?? "—")
                  )}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {s.independence}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type EvidenceRow = Report["positiveEvidence"][number];

/** Descriptive only: shows what was evidenced, contradicted or simply not found. */
function EvidenceList({
  label,
  items,
  tone,
}: {
  label: string;
  items: EvidenceRow[];
  tone: string;
}) {
  if (!items.length) return null;
  return (
    <div>
      <p className="label-xs mb-1">{label}</p>
      <ul className="space-y-1 text-xs">
        {items.slice(0, 10).map((i, idx) => (
          <li key={`${label}-${idx}`} className={tone}>
            {i.statement}
            <span className="ml-1 text-[10px] text-muted-foreground">
              [{i.basis}
              {i.severity ? ` · ${i.severity}` : ""}
              {i.gapCode ? ` · ${i.gapCode}` : ""}
              {i.sourceRefs.length ? ` · ${i.sourceRefs.join(", ")}` : ""}
              {i.claimRefs.length ? ` · ${i.claimRefs.join(", ")}` : ""}
              {i.affiliation !== "UNKNOWN" ? ` · ${i.affiliation}` : ""}]
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
