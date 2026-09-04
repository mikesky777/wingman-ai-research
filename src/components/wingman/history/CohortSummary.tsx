/**
 * LIVE stage summary cards.
 *
 * Descriptive historical statistics over UNIQUE tokens — never a simulated
 * portfolio return and never a thesis return. Where a live market cap exists,
 * Since Stage is displayed against the FROZEN stage-entry baseline; persisted
 * records stay untouched.
 */
import { StatTile } from "@/components/wingman/StatTile";
import type { Stat } from "@/lib/wingman/services/history/cohort";
import { STAGE_TERMS, type StageSummary } from "@/lib/wingman/services/history/milestones";

function pct(stat: Stat, digits = 1): string {
  if (stat.value === null) return "—";
  const sign = stat.value > 0 ? "+" : "";
  return `${sign}${stat.value.toFixed(digits)}%`;
}

export function CohortSummaryCards({ summary }: { summary: StageSummary }) {
  const n = (stat: Stat) => `n=${stat.n}`;
  const terms = STAGE_TERMS[summary.stage];

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={`Avg ${terms.since.toLowerCase()}`}
        value={pct(summary.avgSince)}
        tone={(summary.avgSince.value ?? 0) > 0 ? "positive" : "default"}
        detail={`${n(summary.avgSince)} · live vs frozen entry`}
      />
      <StatTile
        label={`Median ${terms.since.toLowerCase()}`}
        value={pct(summary.medianSince)}
        detail={n(summary.medianSince)}
      />
      <StatTile
        label={`Avg ${terms.peak.toLowerCase()}`}
        value={pct(summary.avgPeak)}
        tone="primary"
        detail={`${n(summary.avgPeak)} · persisted observations`}
      />
      <StatTile
        label={`Median ${terms.peak.toLowerCase()}`}
        value={pct(summary.medianPeak)}
        detail={n(summary.medianPeak)}
      />
      <StatTile
        label="Win rate"
        value={summary.winRate.value === null ? "—" : `${summary.winRate.value.toFixed(0)}%`}
        detail={`${n(summary.winRate)} · current since entry > 0`}
      />
      <StatTile
        label={`Avg ${terms.maxDd.toLowerCase()}`}
        value={pct(summary.avgMaxDd)}
        detail={n(summary.avgMaxDd)}
      />
      <StatTile
        label="Unique tokens"
        value={summary.sampleSize}
        detail="Repeat scan appearances count once"
      />
    </div>
  );
}
