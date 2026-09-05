import { describe, expect, it } from "vitest";
import {
  assessLiveCall,
  currentEpisode,
  decideTransition,
  dedupeByMint,
  deriveEpisodes,
  requiresFreshTimingAfter,
  type LiveConditionInput,
  type LiveLifecycleEvent,
} from "./lifecycle";

const base: LiveConditionInput = {
  hasProductionThesisCall: true,
  monitoringStatus: "ACTIVE",
  operationalStatus: "OPERATIONAL",
  entryState: "BUY_ZONE",
  entryEvaluatedAt: "2026-01-01T10:00:00.000Z",
  timingResolution: "HIGH",
  priceHistorySource: "CANDLES",
  requiresFreshEntryAfter: null,
};

const event = (
  type: LiveLifecycleEvent["eventType"],
  occurredAt: string,
  episodeNumber: number | null,
  extra: Partial<LiveLifecycleEvent> = {},
): LiveLifecycleEvent => ({
  id: `${type}-${occurredAt}`,
  eventType: type,
  occurredAt,
  thesisCallMilestoneId: "call-1",
  tokenId: "token-1",
  mint: "MINT1",
  episodeNumber,
  entryState: "BUY_ZONE",
  entryEvaluatedAt: occurredAt,
  timingResolution: "HIGH",
  priceHistorySource: "CANDLES",
  marketCapAtEvent: 1_000_000,
  liquidityAtEvent: 50_000,
  priceUsdAtEvent: 0.001,
  monitoringStatus: "ACTIVE",
  reasonCode: null,
  reason: null,
  ...extra,
});

describe("assessLiveCall", () => {
  it("is Live only when every condition holds", () => {
    expect(assessLiveCall(base).live).toBe(true);
  });

  it("requires ACTIVE monitoring", () => {
    const r = assessLiveCall({ ...base, monitoringStatus: "RESEARCH_DUE" });
    expect(r.live).toBe(false);
    expect(r.failed).toContain("NOT_ACTIVELY_MONITORED");
  });

  it("requires CANDLES + HIGH resolution", () => {
    expect(assessLiveCall({ ...base, priceHistorySource: "SNAPSHOTS" }).live).toBe(false);
    expect(assessLiveCall({ ...base, timingResolution: "MEDIUM" }).live).toBe(false);
  });

  it("never activates on a pre-gate diagnostic evaluation", () => {
    const r = assessLiveCall({ ...base, entryIsPreGateDiagnostic: true });
    expect(r.live).toBe(false);
    expect(r.failed).toContain("ENTRY_MISSING");
  });

  it("requires fresh timing after an operational interruption", () => {
    const stale = assessLiveCall({
      ...base,
      requiresFreshEntryAfter: "2026-01-01T11:00:00.000Z",
    });
    expect(stale.live).toBe(false);
    expect(stale.failed).toContain("STALE_ENTRY_AFTER_INTERRUPTION");

    const fresh = assessLiveCall({
      ...base,
      requiresFreshEntryAfter: "2026-01-01T09:00:00.000Z",
    });
    expect(fresh.live).toBe(true);
  });
});

describe("decideTransition", () => {
  const live = assessLiveCall(base);
  const notLive = assessLiveCall({ ...base, entryState: "EXTENDED" });

  it("activates only on OFF → ON", () => {
    expect(decideTransition(false, live)).toBe("ACTIVATE");
    expect(decideTransition(true, live)).toBe("NONE");
  });

  it("deactivates only on ON → OFF", () => {
    expect(decideTransition(true, notLive)).toBe("DEACTIVATE");
    expect(decideTransition(false, notLive)).toBe("NONE");
  });
});

describe("episodes", () => {
  it("folds the ledger into episodes and allows reactivation", () => {
    const events = [
      event("LIVE_ACTIVATED", "2026-01-01T10:00:00.000Z", 1),
      event("LIVE_DEACTIVATED", "2026-01-01T12:00:00.000Z", 1, {
        reasonCode: "ENTRY_NOT_BUY_ZONE",
      }),
      event("LIVE_ACTIVATED", "2026-01-02T10:00:00.000Z", 2),
    ];
    const episodes = deriveEpisodes(events);
    expect(episodes).toHaveLength(2);
    expect(episodes[0]!.open).toBe(false);
    expect(episodes[0]!.durationMs).toBe(2 * 60 * 60 * 1000);
    expect(episodes[1]!.open).toBe(true);
    expect(currentEpisode(events)?.episodeNumber).toBe(2);
  });

  it("has no open episode once deactivated", () => {
    const events = [
      event("LIVE_ACTIVATED", "2026-01-01T10:00:00.000Z", 1),
      event("LIVE_DEACTIVATED", "2026-01-01T12:00:00.000Z", 1),
    ];
    expect(currentEpisode(events)).toBeNull();
  });

  it("only operational/monitoring interruptions demand fresh timing", () => {
    expect(requiresFreshTimingAfter("OPERATIONAL_INELIGIBLE")).toBe(true);
    expect(requiresFreshTimingAfter("ENTRY_NOT_BUY_ZONE")).toBe(false);
  });
});

describe("dedupeByMint", () => {
  it("keeps one row per mint, newest activation", () => {
    const rows = [
      { mint: "A", activatedAt: "2026-01-01T10:00:00.000Z" },
      { mint: "A", activatedAt: "2026-01-02T10:00:00.000Z" },
      { mint: "B", activatedAt: "2026-01-01T09:00:00.000Z" },
    ];
    const out = dedupeByMint(rows);
    expect(out).toHaveLength(2);
    expect(out[0]!.mint).toBe("A");
    expect(out[0]!.activatedAt).toBe("2026-01-02T10:00:00.000Z");
  });
});
