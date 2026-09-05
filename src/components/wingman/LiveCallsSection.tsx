/**
 * Dashboard "Live Calls" section.
 *
 * Renders ONLY production THESIS_CALL records. A synthesized thesis that
 * never passed the opportunity gates never appears here. When a call later
 * becomes operationally blocked, the card shows that state — the historical
 * call itself is never hidden or rewritten.
 */
import { Link } from "@tanstack/react-router";
import { FlaskConical, History, PhoneCall, ShieldAlert, ShieldCheck } from "lucide-react";
import { Section } from "@/components/wingman/Section";
import { EmptyState } from "@/components/wingman/EmptyState";
import { EntryStateBadge } from "@/components/wingman/EntryStateBadge";
import { TokenIdentity } from "@/components/wingman/TokenIdentity";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatNumber, formatTime } from "@/lib/wingman/format";
import { ENTRY_STATES } from "@/lib/wingman/config";
import type { EntryState } from "@/lib/wingman/types";
import type { LiveCall } from "@/lib/wingman/services/live-calls.server";

const money = (v: number | null) => (v == null ? "—" : `$${formatNumber(v)}`);

function OperationalBadge({ call }: { call: LiveCall }) {
  const op = call.current.operational;
  const tone =
    op.status === "OPERATIONAL"
      ? "border-positive/40 text-positive"
      : op.status === "BLOCKED"
        ? "border-destructive/40 text-destructive"
        : "border-border text-muted-foreground";
  const Icon = op.status === "OPERATIONAL" ? ShieldCheck : ShieldAlert;
  return (
    <span
      className={cn("inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px]", tone)}
      title={op.reason}
    >
      <Icon className="size-3" />
      {op.status}
    </span>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}

function entryStateOrNull(state: string | null): EntryState | null {
  return state && state in ENTRY_STATES ? (state as EntryState) : null;
}

function LiveCallCard({ call }: { call: LiveCall }) {
  const thesis = call.thesis;
  const entryState = entryStateOrNull(call.current.entryState);
  return (
    <article className="space-y-4 rounded-md border border-border bg-surface/60 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <TokenIdentity
          symbol={call.symbol}
          name={call.name}
          mint={call.mint}
          pairAddress={call.pairAddress}
        />
        <div className="flex flex-col items-end gap-1.5">
          <OperationalBadge call={call} />
          <p className="text-[10px] text-muted-foreground">
            Called {formatTime(call.call.calledAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* THESIS QUALITY — the timeless judgement that created the call. */}
        <div className="space-y-2 rounded border border-border/60 p-3">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Thesis quality
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Fact label="Thesis" value={thesis?.thesisScore != null ? `${thesis.thesisScore}/100` : "—"} />
            <Fact
              label="Evidence"
              value={thesis?.evidenceConfidence != null ? `${thesis.evidenceConfidence}/100` : "—"}
            />
            <Fact label="Verdict" value={thesis?.verdict ?? "—"} />
          </div>
          <p className="text-xs leading-relaxed">
            {thesis?.oneSentenceThesis ?? "Thesis summary unavailable."}
          </p>
          <div className="space-y-1 text-[11px] text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Catalyst: </span>
              {thesis?.strongestCatalyst ?? "No verified catalyst found"}
            </p>
            <p>
              <span className="font-medium text-foreground">Bear risk: </span>
              {thesis?.strongestBearCase ?? "—"}
            </p>
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {thesis?.policyVersion ?? call.call.thesisPolicyVersion ?? "thesis/unknown"}
            {thesis?.model ? ` · ${thesis.model}` : ""}
          </p>
        </div>

        {/* CALL CONTEXT + ENTRY TIMING — current state, never rewrites the call. */}
        <div className="space-y-2 rounded border border-border/60 p-3">
          <p className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
            Call context & entry timing
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Fact label="MCap at call" value={money(call.call.marketCapAtCall)} />
            <Fact label="Liquidity at call" value={money(call.call.liquidityAtCall)} />
            <Fact label="Setup" value={call.call.setupAtCall ?? "—"} />
            <Fact
              label="Current MCap / Liq"
              value={`${money(call.current.latestMarketCap)} / ${money(call.current.latestLiquidity)}`}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
              Entry state
            </span>
            {entryState ? (
              <EntryStateBadge state={entryState} />
            ) : (
              <Badge variant="outline" className="text-[10px]">
                Not evaluated
              </Badge>
            )}
            {call.current.timingResolution ? (
              <span className="text-[10px] text-muted-foreground">
                Timing evidence: {call.current.timingResolution}
              </span>
            ) : null}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {call.current.entryPolicyVersion ?? "entry/not evaluated"}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 border-t border-border/60 pt-3">
        <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <Link to="/research">
            <FlaskConical className="size-3" />
            Open Thesis
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <Link to="/research">Open Research dossier</Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-7 gap-1 px-2 text-[11px]">
          <Link to="/history">
            <History className="size-3" />
            Open History
          </Link>
        </Button>
      </div>
    </article>
  );
}

export function LiveCallsSection({
  calls,
  loading,
}: {
  calls: LiveCall[] | undefined;
  loading: boolean;
}) {
  const count = calls?.length ?? 0;
  return (
    <div id="live-calls">
      <Section
        title={`Live Calls (${loading ? "…" : count})`}
        description="Official production calls only — tokens with an immutable THESIS_CALL record. Shortlists and synthesized theses without a call never appear here. History remains the canonical audit trail."
      >
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading live calls…</p>
        ) : count === 0 ? (
          <EmptyState
            icon={<PhoneCall className="size-4" />}
            title="No production thesis currently meets Wingman's opportunity criteria."
            description="Live Calls appear here the moment a production thesis clears every opportunity gate and a THESIS_CALL is recorded."
          />
        ) : (
          <div className="space-y-4">
            {calls!.map((call) => (
              <LiveCallCard key={call.call.milestoneId} call={call} />
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
