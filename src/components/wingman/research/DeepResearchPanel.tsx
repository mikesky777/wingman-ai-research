/**
 * Deep Research v1 panel.
 *
 * Read-only view of source-grounded dossiers. Every claim shows its status,
 * confidence and the exact sources it rests on. Missing evidence is displayed
 * as an explicit gap, never as a negative finding. No scores, no entry state,
 * no sizing — this stage is evidence only.
 */
import { useCallback, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FlaskConical, Loader2, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import {
  getDeepResearchReports,
  getExternalSearchStatus,
  runDeepResearchBatch,
} from "@/lib/wingman/deep-research.functions";
import { relativeTime } from "@/lib/wingman/format";
import { toast } from "sonner";

const statusTone: Record<string, string> = {
  VERIFIED: "border-positive/40 bg-positive/10 text-positive",
  INFERRED: "border-border-strong bg-surface text-foreground",
  SPECULATIVE: "border-warning/40 bg-warning/10 text-warning",
  CONFLICTING: "border-negative/40 bg-negative/10 text-negative",
  UNAVAILABLE: "border-border bg-surface text-muted-foreground",
};

function short(mint: string): string {
  return mint.length > 12 ? `${mint.slice(0, 5)}…${mint.slice(-4)}` : mint;
}

export function DeepResearchPanel() {
  const queryClient = useQueryClient();
  const fetchReports = useServerFn(getDeepResearchReports);
  const startRun = useServerFn(runDeepResearchBatch);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["deep-research", "reports"],
    queryFn: () => fetchReports(),
  });

  const mutation = useMutation({
    mutationFn: (mode: "PRODUCTION" | "CALIBRATION") => startRun({ data: { mode, limit: 3 } }),
    onSuccess: (result) => {
      if (result.code === "NO_ELIGIBLE_TRIAGE_RUN") {
        toast.warning("No shortlisted candidates", {
          description: "Deep Research consumes AI Triage DEEP_RESEARCH decisions.",
        });
      } else if (result.code === "MISSING_API_KEY") {
        toast.error("Research model unavailable");
      } else {
        toast.success(
          `${result.isCalibration ? "Calibration" : "Deep research"} finished — ${result.completed} dossiers, ${result.insufficient} insufficient evidence, ${result.blocked} blocked, ${result.failed} failed`,
        );
      }
      void queryClient.invalidateQueries({ queryKey: ["deep-research", "reports"] });
    },
    onError: (error: unknown) => {
      toast.error("Deep research failed", {
        description: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const run = useCallback(
    (mode: "PRODUCTION" | "CALIBRATION") => mutation.mutate(mode),
    [mutation],
  );

  return (
    <Section
      title="Deep Research"
      description="Source-grounded dossiers for shortlisted candidates. Evidence only — no score, entry state or sizing."
      actions={
        <div className="flex gap-2">
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
          <Button size="sm" disabled={mutation.isPending} onClick={() => run("PRODUCTION")}>
            <BookOpen className="size-3.5" />
            Research shortlist
          </Button>
        </div>
      }
    >
      <ExternalSearchStatusStrip />

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading dossiers…</p>
      ) : reports.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-4" />}
          title="No dossiers yet"
          description="Run deep research on the current AI Triage shortlist, or start with a 3-candidate dry run."
        />
      ) : (
        <ul className="space-y-3">
          {reports.map((r) => {
            const open = openId === r.id;
            return (
              <li key={r.id} className="rounded-md border border-border bg-surface/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{r.symbol ?? short(r.mint)}</span>
                    <span className="tabular text-[11px] text-muted-foreground">
                      {short(r.mint)}
                    </span>
                    {r.isCalibration ? (
                      <Badge variant="outline" className="text-[10px]">
                        CALIBRATION
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="text-[10px]">
                      IDENTITY {r.tokenIdentityConfidence ?? r.identityAttributionConfidence}
                    </Badge>
                    {r.projectAttributionConfidence ? (
                      <Badge variant="outline" className="text-[10px]">
                        ATTRIBUTION {r.projectAttributionConfidence}
                      </Badge>
                    ) : null}
                    {r.status === "insufficient_evidence" ? (
                      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                        INSUFFICIENT EVIDENCE
                      </Badge>
                    ) : null}
                    {r.status === "search_limited" ? (
                      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                        SEARCH LIMITED
                      </Badge>
                    ) : null}
                    {r.status === "search_unavailable" ? (
                      <Badge variant="outline" className="border-negative/40 text-[10px] text-negative">
                        SEARCH UNAVAILABLE
                      </Badge>
                    ) : null}
                    {r.searchHealth && r.searchHealth !== "READY" ? (
                      <Badge variant="outline" className="border-warning/40 text-[10px] text-warning">
                        SEARCH {r.searchHealth}
                        {r.searchFailedAttempts ? ` (${r.searchFailedAttempts} failed)` : ""}
                      </Badge>
                    ) : null}
                    {r.evidenceSemanticsVersion ? null : (
                      <Badge variant="outline" className="text-[10px] text-muted-foreground">
                        LEGACY EVIDENCE SEMANTICS
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="tabular">coverage {r.coveragePct ?? 0}%</span>
                    <span className="tabular">{r.sourceCount} sources</span>
                    <span
                      className={`tabular ${r.independentSourceCount === 0 ? "text-warning" : ""}`}
                      title="Sources not published by the token itself and not community chatter"
                    >
                      {r.independentSourceCount} independent
                    </span>
                    {r.communitySourceCount === null ? null : (
                      <span className="tabular" title="Community chatter — never counted as independent">
                        {r.communitySourceCount} community
                      </span>
                    )}
                    {r.distinctEvidenceOrigins === null ? null : (
                      <span
                        className="tabular"
                        title="Genuinely distinct evidence origins; on-chain mirrors count once"
                      >
                        {r.distinctEvidenceOrigins} origins
                      </span>
                    )}
                    {r.onChainMirrorCount ? (
                      <span className="tabular" title="Sources that only mirror the same on-chain state">
                        {r.onChainMirrorCount} mirrors
                      </span>
                    ) : null}
                    <span className="tabular">{r.conflictingClaimCount} conflicts</span>
                    <span>{relativeTime(r.createdAt)}</span>


                    <Button variant="ghost" size="sm" onClick={() => setOpenId(open ? null : r.id)}>
                      {open ? "Hide" : "Open dossier"}
                    </Button>
                  </div>
                </div>

                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  {r.oneSentenceNarrative ?? "Narrative unresolved — no attributable source explained the origin."}
                </p>

                {open ? (
                  <div className="mt-4 space-y-4 border-t border-border pt-4">
                    <div>
                      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                        CLAIMS
                      </h4>
                      {r.dossier?.claims?.length ? (
                        <ul className="mt-2 space-y-2">
                          {r.dossier.claims.map((c, i) => (
                            <li key={i} className="rounded border border-border bg-background/40 p-2.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge variant="outline" className="text-[10px]">
                                  {c.domain}
                                </Badge>
                                <Badge
                                  variant="outline"
                                  className={`text-[10px] ${statusTone[c.status] ?? ""}`}
                                >
                                  {c.status}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground">
                                  {c.confidence}
                                </span>
                                <span className="tabular text-[10px] text-muted-foreground">
                                  {[...c.supportingSourceRefs, ...c.contradictingSourceRefs].join(" ") || "—"}
                                </span>
                              </div>
                              <p className="mt-1.5 text-xs leading-relaxed">{c.claim}</p>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-xs text-muted-foreground">
                          No attributable claims were produced.
                        </p>
                      )}
                    </div>

                    <div>
                      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                        EVIDENCE GAPS
                      </h4>
                      <p className="mt-1.5 text-xs text-muted-foreground">
                        {r.unresolvedDomains.length
                          ? `${r.unresolvedDomains.join(", ")} — unknown, not negative.`
                          : "None."}
                      </p>
                      {(r.dossier?.domains ?? []).some((d) => d.unresolvedReason) ? (
                        <ul className="mt-1.5 space-y-1 text-[11px] text-muted-foreground">
                          {(r.dossier?.domains ?? [])
                            .filter((d) => d.unresolvedReason)
                            .map((d) => (
                              <li key={d.domain} className="tabular">
                                {d.domain}: {d.unresolvedReason}
                              </li>
                            ))}
                        </ul>
                      ) : null}
                    </div>

                    {r.dossier?.unresolvedQuestions?.length ? (
                      <div>
                        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                          OPEN QUESTIONS
                        </h4>
                        <ul className="mt-1.5 list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                          {r.dossier.unresolvedQuestions.map((q, i) => (
                            <li key={i}>{q}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">
                        SOURCES
                      </h4>
                      <ul className="mt-2 space-y-1.5">
                        {(r.dossier?.sources ?? []).map((s) => (
                          <li key={s.ref} className="flex flex-wrap items-center gap-2 text-[11px]">
                            <span className="tabular text-muted-foreground">{s.ref}</span>
                            <Badge variant="outline" className="text-[10px]">
                              {s.reliabilityClass}
                            </Badge>
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${s.independence === "INDEPENDENT" ? "border-positive/40 text-positive" : "text-muted-foreground"}`}
                            >
                              {s.independence ?? "UNKNOWN"}
                            </Badge>
                            {s.onChainMirror ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                ON-CHAIN MIRROR
                              </Badge>
                            ) : null}
                            <span className="text-muted-foreground">
                              {s.mintVerified ? "mint-verified" : "ticker match"}
                            </span>
                            {s.contentFetched ? null : (
                              <span className="text-muted-foreground">snippet only</span>
                            )}
                            {s.url ? (
                              <a
                                href={s.url}
                                target="_blank"
                                rel="noreferrer noopener"
                                className="inline-flex items-center gap-1 text-primary hover:underline"
                              >
                                <Link2 className="size-3" />
                                {s.title ?? s.url}
                              </a>
                            ) : null}
                          </li>
                        ))}
                        {(r.dossier?.sources ?? []).length === 0 ? (
                          <li className="text-[11px] text-muted-foreground">
                            No external source could be attributed to this exact mint.
                          </li>
                        ) : null}
                      </ul>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

const readinessTone: Record<string, string> = {
  READY: "border-positive/40 bg-positive/10 text-positive",
  DEGRADED: "border-warning/40 bg-warning/10 text-warning",
  UNAVAILABLE: "border-negative/40 bg-negative/10 text-negative",
  UNKNOWN: "border-border bg-surface text-muted-foreground",
};

/**
 * External search readiness. An empty dossier only means "nothing out there"
 * when this reads READY — otherwise the outside world was never reachable.
 */
function ExternalSearchStatusStrip() {
  const fetchStatus = useServerFn(getExternalSearchStatus);
  const { data } = useQuery({
    queryKey: ["deep-research", "search-status"],
    queryFn: () => fetchStatus(),
  });
  if (!data) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-md border border-border bg-surface/40 px-3 py-2 text-[11px] text-muted-foreground">
      <span className="font-semibold tracking-wide text-foreground">EXTERNAL SEARCH</span>
      <Badge variant="outline" className={`text-[10px] ${readinessTone[data.readiness] ?? ""}`}>
        {data.readiness}
      </Badge>
      <span>{data.provider}</span>
      <span className="tabular">{data.policyVersion}</span>
      {data.configured ? null : <span className="text-negative">credentials missing</span>}
      {data.lastRunAt ? (
        <span className="tabular">
          last run {data.lastRunSuccessfulAttempts}/{data.lastRunAttempts} queries ·{" "}
          {data.lastRunResultsReturned} results · {relativeTime(data.lastRunAt)}
        </span>
      ) : null}
      {data.lastFailureType ? (
        <span className="text-warning">
          {data.lastFailureType}
          {data.lastFailureDetail ? ` — ${data.lastFailureDetail.slice(0, 90)}` : ""}
        </span>
      ) : null}
    </div>
  );
}
