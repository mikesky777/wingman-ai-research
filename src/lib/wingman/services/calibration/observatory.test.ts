import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OBSERVATORY_HORIZONS,
  coverageFor,
  describeStageComparison,
  filterObservatoryEvents,
  measureAllHorizons,
  measureHorizon,
  selectObservatoryPopulation,
  summarizeObservatory,
  type ObservatoryEvent,
  type ObservatoryObservation,
} from "./observatory";

const BASE = "2026-01-01T00:00:00.000Z";
const at = (minutes: number) => new Date(Date.parse(BASE) + minutes * 60_000).toISOString();

const obs = (
  minutes: number,
  marketCap: number | null,
  liquidityUsd: number | null = 50_000,
): ObservatoryObservation => ({
  at: at(minutes),
  marketCap,
  priceUsd: null,
  liquidityUsd,
});

const baseline = { observedAt: BASE, marketCap: 1_000_000, priceUsd: 1, liquidityUsd: 100_000 };
const HOUR = 60 * 60_000;

function event(overrides: Partial<ObservatoryEvent> = {}): ObservatoryEvent {
  return {
    stage: "SURVIVOR",
    eventId: "e1",
    mint: "mint-1",
    symbol: "AAA",
    name: "AAA",
    eventAt: BASE,
    cohortId: "cohort-1",
    policyVersion: "scanner/v2",
    setups: ["BASE"],
    canonical: true,
    recurrenceNumber: 1,
    msSincePriorCanonicalEvent: null,
    baseline,
    horizons: measureAllHorizons(baseline, [obs(30, 1_200_000), obs(59, 1_100_000)], at(600)),
    thesis: null,
    triage: null,
    spend: null,
    ...overrides,
  };
}

describe("observatory horizon measurement", () => {
  it("measures return, peak, drawdown and time to peak from the frozen baseline", () => {
    const m = measureHorizon(
      baseline,
      [obs(10, 1_500_000), obs(30, 1_200_000), obs(55, 1_300_000)],
      HOUR,
      at(600),
    );
    expect(m.status).toBe("MEASURED");
    expect(m.returnPct).toBeCloseTo(30);
    expect(m.peakPct).toBeCloseTo(50);
    expect(m.maxDrawdownPct).toBeCloseTo(-20);
    expect(m.timeToPeakMinutes).toBe(10);
    expect(m.liquiditySurvived).toBe(false);
  });

  it("never treats an unelapsed horizon as a measurement", () => {
    const m = measureHorizon(baseline, [obs(10, 2_000_000)], HOUR, at(20));
    expect(m.status).toBe("NOT_YET_MEASURED");
    expect(m.returnPct).toBeNull();
  });

  it("reports a collection gap as DELAYED, never as performance", () => {
    const m = measureHorizon(baseline, [obs(2, 900_000)], HOUR, at(600));
    expect(m.status).toBe("DELAYED");
    expect(m.returnPct).toBeNull();
  });

  it("excludes drained-pool observations and reports INVALID_MARKET", () => {
    const m = measureHorizon(baseline, [obs(50, 900_000, 10)], HOUR, at(600));
    expect(m.status).toBe("INVALID_MARKET");
    expect(m.returnPct).toBeNull();
  });

  it("stays UNKNOWN without a frozen baseline market cap", () => {
    const m = measureHorizon(
      { observedAt: BASE, marketCap: null, priceUsd: null, liquidityUsd: null },
      [obs(50, 900_000)],
      HOUR,
      at(600),
    );
    expect(m.status).toBe("UNKNOWN");
  });

  it("ignores observations before the frozen baseline", () => {
    const m = measureHorizon(baseline, [obs(-30, 5_000_000), obs(50, 1_000_000)], HOUR, at(600));
    expect(m.peakPct).toBeCloseTo(0);
  });

  it("covers every configured horizon", () => {
    const measured = measureAllHorizons(baseline, [obs(30, 1_100_000)], at(600));
    expect(Object.keys(measured).sort()).toEqual(OBSERVATORY_HORIZONS.map((h) => h.key).sort());
  });
});

describe("observatory populations and coverage", () => {
  it("keeps non-canonical events out of DECISIONS but preserves them in the dataset", () => {
    const rows = [event(), event({ eventId: "e2", canonical: false })];
    expect(selectObservatoryPopulation(rows, "DECISIONS")).toHaveLength(1);
    expect(rows).toHaveLength(2);
  });

  it("selects the earliest canonical event per exact mint for UNIQUE_TOKENS", () => {
    const rows = [
      event({ eventId: "late", eventAt: at(600) }),
      event({ eventId: "early", eventAt: at(0) }),
    ];
    const unique = selectObservatoryPopulation(rows, "UNIQUE_TOKENS");
    expect(unique).toHaveLength(1);
    expect(unique[0]!.eventId).toBe("early");
  });

  it("reports every coverage state explicitly", () => {
    const rows = [
      event(),
      event({ eventId: "e2", horizons: measureAllHorizons(baseline, [], at(600)) }),
    ];
    const coverage = coverageFor(rows, "1h");
    expect(coverage.measured + coverage.delayed + coverage.notYetMeasured).toBe(2);
  });

  it("uses only measured events as the KPI denominator", () => {
    const rows = [
      event(),
      event({ eventId: "e2", mint: "mint-2", horizons: measureAllHorizons(baseline, [], at(600)) }),
    ];
    const kpis = summarizeObservatory(rows, "1h");
    expect(kpis.events).toBe(2);
    expect(kpis.uniqueMints).toBe(2);
    expect(kpis.measuredN).toBe(1);
    expect(kpis.medianReturnPct).toBeCloseTo(10);
  });

  it("filters by setup with explicit UNKNOWN provenance", () => {
    const rows = [event(), event({ eventId: "e2", setups: null })];
    const filters = {
      population: "DECISIONS" as const,
      policyVersion: "ALL" as const,
      researchExecution: "ALL" as const,
      fromIso: null,
      toIso: null,
    };
    expect(
      filterObservatoryEvents(rows, { ...filters, stage: "SURVIVOR", setup: "UNKNOWN" }),
    ).toHaveLength(1);
    expect(
      filterObservatoryEvents(rows, { ...filters, stage: "SURVIVOR", setup: "BASE" }),
    ).toHaveLength(1);
  });

  it("describes every stage even when a stage has no events", () => {
    const rows = describeStageComparison(
      [event()],
      {
        population: "DECISIONS",
        setup: "ALL",
        policyVersion: "ALL",
        researchExecution: "ALL",
        fromIso: null,
        toIso: null,
      },
      "1h",
    );
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.stage === "THESIS_CALL")?.events).toBe(0);
  });
});

describe("observatory provider isolation", () => {
  it("never reaches a market data provider", () => {
    for (const file of [
      "src/lib/wingman/services/calibration/observatory.ts",
      "src/lib/wingman/services/calibration/observatory.server.ts",
      "src/lib/wingman/calibration.functions.ts",
      "src/components/wingman/calibration/Observatory.tsx",
    ]) {
      const source = readFileSync(file, "utf8");
      for (const needle of [
        "dexscreener",
        "DexScreener",
        "birdeye",
        "Birdeye",
        "helius",
        "fetch(",
        "requestOutcomeSample",
        "refreshHistoryLiveMarkets",
        "sampler.server",
      ]) {
        expect(`${file}:${needle}:${source.includes(needle)}`).toBe(`${file}:${needle}:false`);
      }
    }
  });
});
