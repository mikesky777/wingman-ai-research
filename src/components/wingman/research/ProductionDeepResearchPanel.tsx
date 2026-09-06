/**
 * Production Deep Research shortlist.
 *
 * Shows every production AI_SHORTLIST candidate — researched or not — with its
 * persisted research status. Reports opened here are always production
 * artefacts; calibration dossiers live in the calibration panel and are
 * labelled separately.
 */
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { getProductionFunnel } from "@/lib/wingman/triage.functions";
import { getDeepResearchReport, runDeepResearchBatch } from "@/lib/wingman/deep-research.functions";
import { relativeTime } from "@/lib/wingman/format";
import {
  countShortlistStatuses,
  filterShortlist,
  type DeepResearchFilter,
  type DeepResearchUiStatus,
} from "@/lib/wingman/services/research/production-view";

const statusTone: Record<DeepResearchUiStatus, string> = {
  COMPLETED: "border-positive/40 bg-positive/10 text-positive",
  PARTIAL: "border-warning/40 bg-warning/10 text-warning",
  SEARCH_LIMITED: "border-warning/40 bg-warning/10 text-warning",
  INSUFFICIENT_EXTERNAL_EVIDENCE: "border-warning/40 bg-warning/10 text-warning",
  RUNNING: "border-border-strong bg-surface text-foreground",
  DEFERRED_RECENT_RESEARCH: "border-border-strong bg-surface text-muted-foreground",
  DEFERRED_BUDGET: "border-border-strong bg-surface text-muted-foreground",
  NOT_STARTED: "border-border bg-surface text-muted-foreground",
  BLOCKED: "border-negative/40 bg-negative/10 text-negative",
  // Operational, not a thesis failure — deliberately neutral styling.
  BLOCKED_TRADABILITY: "border-border-strong bg-surface text-muted-foreground",
  FAILED: "border-negative/40 bg-negative/10 text-negative",
};

// Deferral is an operational spend state, never a failed or bearish thesis.
const STATUS_LABEL: Record<DeepResearchUiStatus, string> = {
  COMPLETED: "RESEARCH COMPLETE",
  PARTIAL: "RESEARCH COMPLETE · PARTIAL",
  SEARCH_LIMITED: "RESEARCH INCOMPLETE",
  INSUFFICIENT_EXTERNAL_EVIDENCE: "RESEARCH INCOMPLETE",
  RUNNING: "RESEARCH RUNNING",
  NOT_STARTED: "READY FOR DEEP RESEARCH",
  DEFERRED_RECENT_RESEARCH: "DEFERRED · RECENTLY RESEARCHED",
  DEFERRED_BUDGET: "DEFERRED · BUDGET",
  BLOCKED: "BLOCKED",
  BLOCKED_TRADABILITY: "BLOCKED · TRADABILITY",
  FAILED: "FAILED",
};

const FILTERS: { key: DeepResearchFilter; label: string }[] = [
  { key: "ALL", label: "All shortlist" },
  { key: "COMPLETED", label: "Completed" },
  { key: "PENDING", label: "Pending" },
  { key: "DEFERRED", label: "Deferred" },
  { key: "BLOCKED_FAILED", label: "Blocked / failed" },
];

function ReportBody({ reportId }: { reportId: string }) {
  const fetchReport = useServerFn(getDeepResearchReport);
  const { data, isLoading } = useQuery({
    queryKey: ["deep-research", "report", reportId],
    queryFn: () => fetchReport({ data: { id: reportId } }),
  });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading dossier…</p>;
  if (!data) return <p className="text-xs text-muted-foreground">Dossier unavailable.</p>;

  const dossier = data.dossier;
  const claims = dossier?.claims ?? [];
  const risky = claims.filter(
    (c) => c.domain === "RISK_FLAGS" || c.status === "CONFLICTING",
  );
  const supporting = claims.filter((c) => !risky.includes(c));
  const domainSummary = (domain: string) =>
    dossier?.domains?.find((d) => d.domain === domain)?.summary ?? null;

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={data.isCalibration ? "border-warning/40 text-warning" : ""}>
          {data.isCalibration ? "CALIBRATION" : "PRODUCTION"}
        </Badge>
        <Badge variant="outline">{data.status}</Badge>
        <span className="text-[11px] text-muted-foreground">
          {data.sourceCount} sources · {data.independentSourceCount} independent ·{" "}
          {data.coveragePct ?? 0}% coverage
        </span>
      </div>

      <Field label="NARRATIVE" value={data.oneSentenceNarrative ?? domainSummary("NARRATIVE_ORIGIN")} />
      <Field label="WHY NOW / CATALYSTS" value={domainSummary("EXTERNAL_CATALYST")} />
      <Field label="MINDSHARE" value={domainSummary("SOCIAL_PRESENCE") ?? domainSummary("COMMUNITY_ACTIVITY")} />
      <Field label="DEV / CREATOR" value={domainSummary("TEAM_CREATOR")} />
      <Field label="HOLDERS / STRUCTURE" value={domainSummary("COMMUNITY_ACTIVITY")} />

      <ClaimList label="SUPPORTING EVIDENCE (BULL)" claims={supporting} />
      <ClaimList label="ADVERSARIAL EVIDENCE (BEAR)" claims={risky} />

      <Field
        label="EVIDENCE GAPS"
        value={
          data.unresolvedDomains.length
            ? `${data.unresolvedDomains.join(", ")} — unknown, not negative.`
            : "None."
        }
      />

      <div>
        <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">SOURCES</h4>
        <ul className="mt-1.5 space-y-1">
          {(dossier?.sources ?? []).map((s) => (
            <li key={s.ref} className="text-[11px] text-muted-foreground">
              <span className="tabular mr-1">{s.ref}</span>
              <Badge variant="outline" className="mr-1 text-[9px]">
                {s.independence}
              </Badge>
              {s.url ? (
                <a
                  className="underline underline-offset-2"
                  href={s.url}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  {s.title ?? s.url}
                </a>
              ) : (
                (s.title ?? "—")
              )}
            </li>
          ))}
        </ul>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Provenance: report {data.id.slice(0, 8)} · run {data.runId.slice(0, 8)} ·{" "}
        {dossier?.policyVersion ?? "—"} · {dossier?.promptVersion ?? "—"} ·{" "}
        {dossier?.searchVersion ?? "—"} · {relativeTime(data.createdAt)}
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">{label}</h4>
      <p className="mt-1 text-xs leading-relaxed">{value ?? "Unresolved — no attributable source."}</p>
    </div>
  );
}

function ClaimList({
  label,
  claims,
}: {
  label: string;
  claims: { domain: string; claim: string; status: string; supportingSourceRefs: string[] }[];
}) {
  return (
    <div>
      <h4 className="text-[11px] font-semibold tracking-wide text-muted-foreground">{label}</h4>
      {claims.length ? (
        <ul className="mt-1.5 space-y-1.5">
          {claims.map((c, i) => (
            <li key={i} className="rounded border border-border bg-background/40 p-2 text-xs">
              <span className="mr-2 text-[10px] text-muted-foreground">
                {c.domain} · {c.status} · {c.supportingSourceRefs.join(" ") || "—"}
              </span>
              {c.claim}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-muted-foreground">None recorded.</p>
      )}
    </div>
  );
}

export function ProductionDeepResearchPanel() {
  const fetchFunnel = useServerFn(getProductionFunnel);
  const [filter, setFilter] = useState<DeepResearchFilter>("ALL");
  const [openMint, setOpenMint] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const retryResearch = useServerFn(runDeepResearchBatch);

  const { data, isLoading } = useQuery({
    queryKey: ["research", "production-funnel"],
    queryFn: () => fetchFunnel(),
  });

  const shortlist = useMemo(() => data?.shortlist ?? [], [data]);
  const counts = useMemo(() => countShortlistStatuses(shortlist), [shortlist]);
  const visible = useMemo(() => filterShortlist(shortlist, filter), [shortlist, filter]);
  const retryableCount = useMemo(
    () => shortlist.filter((c) => c.status === "FAILED" && c.retryable).length,
    [shortlist],
  );

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["research", "production-funnel"] });
    void queryClient.invalidateQueries({ queryKey: ["deep-research"] });
  };

  // Retries only re-attempt retryable execution failures. Completed dossiers
  // are never rerun and never overwritten.
  const retry = useMutation({
    mutationFn: () =>
      retryResearch({
        data: {
          mode: "PRODUCTION" as const,
          retryFailed: true,
          limit: 12,
          triageRunId: data?.triage?.id ?? null,
        },
      }),
    onSuccess: invalidate,
  });

  // Starts ONLY shortlist members with no persisted attempt, strictly inside
  // the active cohort (exact scan + exact production triage run).
  const start = useMutation({
    mutationFn: () =>
      retryResearch({
        data: {
          mode: "PRODUCTION" as const,
          startNotStarted: true,
          requireActiveCohort: true,
          limit: 40,
          triageRunId: data?.triage?.id ?? null,
        },
      }),
    onSuccess: invalidate,
  });

  const notStartedCount = useMemo(
    () => shortlist.filter((c) => c.status === "NOT_STARTED").length,
    [shortlist],
  );

  return (
    <Section
      title="Production Deep Research"
      description="Every production shortlist candidate and its persisted research status. Unresearched members stay visible."
      actions={
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={notStartedCount === 0 || start.isPending || retry.isPending}
            onClick={() => start.mutate()}
          >
            {start.isPending ? "Researching…" : `Run Deep Research (${notStartedCount})`}
          </Button>
          {retryableCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() => retry.mutate()}
            >
              {retry.isPending ? "Retrying…" : `Retry failed research (${retryableCount})`}
            </Button>
          ) : null}
          <Badge variant="outline">PRODUCTION</Badge>
        </div>
      }
    >
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const n =
            f.key === "ALL"
              ? counts.total
              : f.key === "COMPLETED"
                ? counts.completed
                : f.key === "PENDING"
                  ? counts.pending
                  : f.key === "DEFERRED"
                    ? counts.deferred
                    : counts.blockedOrFailed;
          return (
            <Button
              key={f.key}
              size="sm"
              variant={filter === f.key ? "default" : "outline"}
              onClick={() => setFilter(f.key)}
            >
              {f.label} ({n})
            </Button>
          );
        })}
      </div>

      {start.data && start.data.code !== "OK" ? (
        <p className="mt-3 text-xs text-negative">
          {start.data.code === "DEEP_RESEARCH_PROVENANCE_MISMATCH"
            ? "DEEP_RESEARCH_PROVENANCE_MISMATCH — nothing was researched; the shortlist did not resolve to the active scan and triage run."
            : start.data.code}
        </p>
      ) : null}
      {start.isError ? (
        <p className="mt-3 text-xs text-negative">Deep Research batch failed to start.</p>
      ) : null}

      {isLoading ? (
        <p className="mt-4 text-xs text-muted-foreground">Loading shortlist…</p>
      ) : shortlist.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            icon={<BookOpen className="size-4" />}
            title="No production shortlist"
            description="A production triage run with DEEP_RESEARCH decisions populates this section."
          />
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {visible.map((c) => {
            const open = openMint === c.mint;
            return (
              <li key={c.mint} className="rounded-md border border-border bg-surface/60 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="tabular mt-1 text-xs text-muted-foreground">
                      #{c.triageRank ?? "—"}
                    </span>
                    <TokenIdentity
                      symbol={c.symbol}
                      name={c.name}
                      mint={c.mint}
                      pairAddress={c.pairAddress}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline" className={statusTone[c.status]}>
                      {c.status === "FAILED" && c.failureCode ? c.failureCode : STATUS_LABEL[c.status]}
                    </Badge>
                    {c.status === "COMPLETED" || c.status === "PARTIAL" ? (
                      <>
                        <span>narrative {c.narrativeResolved ? "yes" : "no"}</span>
                        <span className="tabular">{c.sourceCount ?? 0} sources</span>
                        <span className="tabular">
                          {c.independentSourceCount ?? 0} independent
                        </span>
                        <span className="tabular">{c.coveragePct ?? 0}% coverage</span>
                      </>
                    ) : null}
                    <span>{c.researchedAt ? relativeTime(c.researchedAt) : "not researched"}</span>
                    {c.reportId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setOpenMint(open ? null : c.mint)}
                      >
                        {open ? "Hide" : "Open dossier"}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {c.status === "BLOCKED_TRADABILITY" ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    DEEP_RESEARCH selected ·{" "}
                    {c.blockedStatement ??
                      (c.blockedReasonCode === "CURRENT_LIQUIDITY_BELOW_MINIMUM"
                        ? "Current liquidity fell below the $3,000 operational minimum after Triage."
                        : "Current tradability could not be verified; research spend withheld.")}
                    {typeof c.tradabilityLiquidityUsd === "number"
                      ? ` · current liquidity $${Math.round(c.tradabilityLiquidityUsd).toLocaleString()}`
                      : ""}
                    {c.tradabilityCheckedAt ? ` · checked ${relativeTime(c.tradabilityCheckedAt)}` : ""}
                  </p>
                ) : null}
                {c.spend && c.status.startsWith("DEFERRED") ? (
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    {c.status === "DEFERRED_BUDGET"
                      ? `Deep Research budget for this cohort is used up (${c.spend.budgetState ?? "budget"}). Not a research failure — this occurrence stays recorded.`
                      : `Researched ${c.spend.priorResearchAgeMinutes ?? "—"} min ago in cohort ${(c.spend.priorScanRunId ?? "—").slice(0, 8)} · ${c.spend.spendDecisionReason} · next eligible ${c.spend.nextEligibleAt ? relativeTime(c.spend.nextEligibleAt) : "—"} · material-change override: ${c.spend.materialChangeOverride ? "yes" : "no"}`}
                  </p>
                ) : null}
                {open && c.reportId ? (
                  <div className="mt-3">
                    <ReportBody reportId={c.reportId} />
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
