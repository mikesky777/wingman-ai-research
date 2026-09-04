/**
 * LIVE cohort summary cards.
 *
 * Descriptive historical statistics over UNIQUE tokens — never a simulated
 * portfolio return. Where a live market cap exists, Since Call is displayed
 * against the FROZEN First Call baseline; persisted records stay untouched.
 */
import { StatTile } from "@/components/wingman/StatTile";
import type { CohortSummary as Summary, Stat } from "@/lib/wingman/services/history/cohort";

function pct(stat: Stat, digits = 1): string {
  if (stat.value === null) return "—";
  const sign = stat.value > 0 ? "+" : "";
  return `${sign}${stat.value.toFixed(digits)}%`;
}

export function CohortSummaryCards({ summary }: { summary: Summary }) {
  const n = (stat: Stat) => `n=${stat.n}`;

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        label={`Avg since call · ${summary.setup}`}
        value={pct(summary.avgSinceCall)}
        tone={(summary.avgSinceCall.value ?? 0) > 0 ? "positive" : "default"}
        detail={`${n(summary.avgSinceCall)} · live vs frozen First Call`}
      />
      <StatTile
        label="Median since call"
        value={pct(summary.medianSinceCall)}
        detail={n(summary.medianSinceCall)}
      />
      <StatTile
        label="Avg peak call"
        value={pct(summary.avgPeakCall)}
        tone="primary"
        detail={`${n(summary.avgPeakCall)} · persisted observations`}
      />
      <StatTile
        label="Median peak call"
        value={pct(summary.medianPeakCall)}
        detail={n(summary.medianPeakCall)}
      />
      <StatTile
        label="Win rate"
        value={summary.winRate.value === null ? "—" : `${summary.winRate.value.toFixed(0)}%`}
        detail={`${n(summary.winRate)} · current since call > 0`}
      />
      <StatTile
        label="Avg max DD call"
        value={pct(summary.avgMaxDdCall)}
        detail={n(summary.avgMaxDdCall)}
      />
      <StatTile
        label="Unique tokens"
        value={summary.sampleSize}
        detail="Repeat scan appearances count once"
      />
    </div>
  );
}
