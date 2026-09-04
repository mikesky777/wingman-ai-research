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
        title="Survivor Composition"
        description="The survivor limit is a maximum, not a target. Unused capacity means no further candidate qualified."
      >
        {diagnostics.survivors ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
              <Stat label="Survivors" value={diagnostics.survivors.survivorCount} />
              <Stat label="Limit" value={diagnostics.survivors.survivorLimit} />
              <Stat label="Unused capacity" value={diagnostics.survivors.unusedCapacity} />
              <Stat label="BASE" value={diagnostics.survivors.baseSurvivors} />
              <Stat label="REACCEL" value={diagnostics.survivors.reaccelSurvivors} />
              <Stat label="MOMENTUM" value={diagnostics.survivors.momentumSurvivors} />
              <Stat label="Reservation route" value={diagnostics.survivors.reservationSurvivors} />
              <Stat
                label="Global · recognized setup"
                value={diagnostics.survivors.recognizedGlobalSurvivors}
              />
              <Stat
                label="Global · NONE exceptions"
                value={`${diagnostics.survivors.noneGlobalSurvivors} / ${diagnostics.survivors.maxNoneGlobalSurvivors}`}
              />
              <Stat label="NONE skipped by cap" value={diagnostics.survivors.noneSkippedByCap} />
            </div>
            {diagnostics.survivors.underFilled ? (
              <p className="mt-3 text-[11px] text-muted-foreground">
                This run returned fewer than the maximum because no further candidate qualified.
                The pool was deliberately not padded with SETUP = NONE candidates.
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-[11px] text-muted-foreground">Not recorded for this run.</p>
        )}
      </Section>


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

      <Section
        title="BASE Activity Floor"
        description="Effect of the editable BASE minimum 24h volume on this run."
      >
        {diagnostics.baseVolumeFloor ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat
              label="Floor"
              value={
                diagnostics.baseVolumeFloor.thresholdUsd === null
                  ? "none"
                  : `$${diagnostics.baseVolumeFloor.thresholdUsd.toLocaleString()}`
              }
            />
            <Stat label="BASE qualified" value={diagnostics.baseVolumeFloor.qualifiedBase} />
            <Stat
              label="BASE before floor"
              value={diagnostics.baseVolumeFloor.baseBeforeVolumeFloor}
            />
            <Stat
              label="Removed by floor"
              value={diagnostics.baseVolumeFloor.removedByVolumeFloor}
            />
            <Stat
              label="Volume unavailable"
              value={diagnostics.baseVolumeFloor.volumeUnavailable}
            />
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Not recorded for this run.
          </p>
        )}
      </Section>

      <Section
        title="Price / Launch Integrity (shadow)"
        description="Calibration only — never affects setups, priority, structural status or Survivor selection."
      >
        {diagnostics.priceIntegrity ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Stat
              label="Candidates with history fetched"
              value={diagnostics.priceIntegrity.candidatesRequiringHistory}
            />
            <Stat
              label="Tokens with candles"
              value={diagnostics.priceIntegrity.tokensWithHistory}
            />
            <Stat label="Provider requests" value={diagnostics.priceIntegrity.providerRequests} />
            <Stat
              label="Served from cache"
              value={diagnostics.priceIntegrity.servedFullyFromCache}
            />
            <Stat label="Candles stored" value={diagnostics.priceIntegrity.candlesStored} />
            <Stat label="History failures" value={diagnostics.priceIntegrity.failures} />
            {Object.entries(diagnostics.priceIntegrity.statuses ?? {}).map(([status, count]) => (
              <Stat key={status} label={status} value={count} />
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Not recorded for this run.
          </p>
        )}
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded border border-border px-2 py-1">
      <div className="label-xs text-muted-foreground">{label}</div>
      <div className="tabular text-sm">{value}</div>
    </div>
  );
}
