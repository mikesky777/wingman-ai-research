import { Section } from "@/components/wingman/Section";
import type { ScanRunDiagnostics } from "@/lib/wingman/services/scanner-service";
import { formatAge, formatRatioPct, laneLabel } from "./shared";

/**
 * Calibration diagnostics: did Wingman fail to FIND tokens, or find them and
 * remove them later? Every row is read from persisted run diagnostics.
 */
export function DiagnosticsPanels({ diagnostics }: { diagnostics: ScanRunDiagnostics }) {
  // Current runs use BASE; historical v1 runs still carry POST_BOND_BASE.
  const postBond =
    diagnostics.lanes.find((l) => l.lane === "BASE") ??
    diagnostics.lanes.find((l) => l.lane === "POST_BOND_BASE");

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section
        title="Low-Cap Discovery Diagnostics"
        description="Where candidates in each market-cap band left the funnel."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left">
            <thead>
              <tr className="[&>th]:label-xs [&>th]:pb-2 [&>th]:font-medium">
                <th>Market cap</th>
                <th className="text-right">Discovered</th>
                <th className="text-right">Passed filters</th>
                <th className="text-right">Lane qualified</th>
                <th className="text-right">Ranked</th>
                <th className="text-right">Enriched</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.buckets.map((b) => (
                <tr key={b.bucket} className="[&>td]:border-t [&>td]:border-border [&>td]:py-2">
                  <td className="font-mono text-[11px]">{b.bucket}</td>
                  <td className="tabular text-right text-xs">{b.discovered}</td>
                  <td className="tabular text-right text-xs">{b.passedHardFilters}</td>
                  <td className="tabular text-right text-xs">{b.laneQualified}</td>
                  <td className="tabular text-right text-xs">{b.quantitativelyRanked}</td>
                  <td className="tabular text-right text-xs">{b.enriched}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section
        title="Lane Diagnostics"
        description="Per-lane qualification, low-cap representation and history coverage."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="[&>th]:label-xs [&>th]:pb-2 [&>th]:font-medium">
                <th>Lane</th>
                <th className="text-right">Attempted</th>
                <th className="text-right">Qualified</th>
                <th className="text-right">&lt;$100K</th>
                <th className="text-right">$100–250K</th>
                <th className="text-right">Median age</th>
                <th className="text-right">Median turnover</th>
                <th className="text-right">With history</th>
              </tr>
            </thead>
            <tbody>
              {diagnostics.lanes.map((l) => (
                <tr key={l.lane} className="[&>td]:border-t [&>td]:border-border [&>td]:py-2">
                  <td className="font-mono text-[10px]">{laneLabel(l.lane)}</td>
                  <td className="tabular text-right text-xs">{l.discovered}</td>
                  <td className="tabular text-right text-xs">{l.qualified}</td>
                  <td className="tabular text-right text-xs">{l.below100k}</td>
                  <td className="tabular text-right text-xs">{l.between100kAnd250k}</td>
                  <td className="tabular text-right text-xs">{formatAge(l.medianAgeMinutes)}</td>
                  <td className="tabular text-right text-xs">
                    {formatRatioPct(l.medianTurnover24h)}
                  </td>
                  <td className="tabular text-right text-xs">{l.withHistory}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {postBond ? (
          <p className="mt-3 text-[11px] text-muted-foreground">
            Post-bond base: {postBond.qualified} qualified, {postBond.below100k} below $100K,{" "}
            {postBond.withHistory} with prior Wingman snapshots. Bases without history cannot be
            confirmed as bases yet — that is a coverage limit, not a verdict.
          </p>
        ) : null}
      </Section>
    </div>
  );
}
