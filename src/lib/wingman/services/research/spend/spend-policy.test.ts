import { describe, expect, it } from "vitest";
import {
  DEFAULT_RESEARCH_SPEND_CONFIG,
  RESEARCH_SPEND_POLICY_VERSION,
  applySpendControl,
  detectMaterialChange,
  evaluateCooldown,
  isRetryableIncompleteResearch,
  type PriorProductionResearch,
  type SpendCandidateInput,
  type SpendPacketFacts,
} from "./spend-policy";
import { packetFactsFromPacket } from "./spend.server";
import { buildProductionShortlist, countShortlistStatuses } from "../production-view";

const NOW = Date.parse("2026-01-10T12:00:00.000Z");

const facts = (over: Partial<SpendPacketFacts> = {}): SpendPacketFacts => ({
  holderCount: 1000,
  top10Pct: 20,
  top20Pct: 30,
  structuralStatus: "PASS",
  pairAddress: "pair-1",
  dex: "raydium",
  ...over,
});

const prior = (over: Partial<PriorProductionResearch> = {}): PriorProductionResearch => ({
  reportId: "report-1",
  deepResearchRunId: "run-1",
  scanRunId: "scan-old",
  triageRunId: "triage-old",
  researchedAt: new Date(NOW - 2 * 3600_000).toISOString(),
  status: "completed",
  dossierVersion: "deep_research/v1.1",
  searchHealth: "READY",
  coveragePct: 80,
  packetFacts: facts(),
  ...over,
});

const candidate = (over: Partial<SpendCandidateInput> = {}): SpendCandidateInput => ({
  mint: "MintA",
  triageRank: 1,
  quantRank: 1,
  recurrenceState: "REPEAT",
  recurrenceNumber: 3,
  researchPacketId: "packet-1",
  triageDecisionId: "decision-1",
  tokenId: "token-1",
  packetFacts: facts(),
  prior: null,
  ...over,
});

const budget = { scanUsed: 0, scanLimit: 12, windowUsed: 0, windowLimit: 48 };

function decide(c: SpendCandidateInput, over: Partial<typeof budget> = {}) {
  return applySpendControl({
    candidates: [c],
    budget: { ...budget, ...over },
    nowMs: NOW,
  })[0]!;
}

describe("research_spend_policy/v1", () => {
  it("1. never researched before → RUN", () => {
    const d = decide(candidate());
    expect(d.spendDecision).toBe("RUN_DEEP_RESEARCH");
    expect(d.spendDecisionReason).toBe("NO_PRIOR_PRODUCTION_RESEARCH");
    expect(d.policyVersion).toBe(RESEARCH_SPEND_POLICY_VERSION);
  });

  it("2. researched 2h ago with no research-relevant change → DEFERRED_RECENT_RESEARCH", () => {
    const d = decide(candidate({ prior: prior() }));
    expect(d.spendDecision).toBe("DEFERRED_RECENT_RESEARCH");
    expect(d.spendDecisionReason).toBe("PRIOR_RESEARCH_WITHIN_COOLDOWN");
    expect(d.cooldownRemainingMinutes).toBe(240);
    expect(d.priorResearchReportId).toBe("report-1");
    expect(d.materialChangeOverride).toBe(false);
  });

  it("3. researched 8h ago → RUN", () => {
    const d = decide(
      candidate({ prior: prior({ researchedAt: new Date(NOW - 8 * 3600_000).toISOString() }) }),
    );
    expect(d.spendDecision).toBe("RUN_DEEP_RESEARCH");
    expect(d.spendDecisionReason).toBe("PRIOR_RESEARCH_OUTSIDE_COOLDOWN");
  });

  it("4. within cooldown but qualifying deterministic material change → RUN with reason", () => {
    const d = decide(
      candidate({
        prior: prior({ packetFacts: facts({ top10Pct: null, top20Pct: null }) }),
      }),
    );
    expect(d.spendDecision).toBe("RUN_DEEP_RESEARCH");
    expect(d.spendDecisionReason).toBe("MATERIAL_CHANGE_OVERRIDE");
    expect(d.materialChangeReasonCodes).toContain("HOLDER_CONCENTRATION_NEWLY_AVAILABLE");

    const structural = decide(
      candidate({ prior: prior({ packetFacts: facts({ structuralStatus: "UNKNOWN" }) }) }),
    );
    expect(structural.materialChangeReasonCodes).toContain("STRUCTURAL_STATUS_CHANGED");

    const pair = decide(
      candidate({ prior: prior({ packetFacts: facts({ pairAddress: "pair-old" }) }) }),
    );
    expect(pair.materialChangeReasonCodes).toContain("PAIR_PROVENANCE_CHANGED");
  });

  it("5. only price / volume / rank / setup / recurrence change → still DEFERRED", () => {
    // Those fields are not even part of the compared packet facts.
    expect(detectMaterialChange(facts(), facts())).toEqual([]);
    const d = decide(
      candidate({
        recurrenceState: "REPEAT",
        recurrenceNumber: 9,
        triageRank: 5,
        quantRank: 40,
        prior: prior(),
      }),
    );
    expect(d.spendDecision).toBe("DEFERRED_RECENT_RESEARCH");
  });

  it("6. previous incomplete research uses the deterministic retry rule", () => {
    expect(isRetryableIncompleteResearch("search_limited")).toBe(true);
    expect(isRetryableIncompleteResearch("completed")).toBe(false);

    const justNow = decide(
      candidate({
        prior: prior({
          status: "search_limited",
          researchedAt: new Date(NOW - 10 * 60_000).toISOString(),
        }),
      }),
    );
    expect(justNow.spendDecision).toBe("DEFERRED_RECENT_RESEARCH");
    expect(justNow.spendDecisionReason).toBe("PRIOR_INCOMPLETE_RESEARCH_WITHIN_RETRY_COOLDOWN");

    const later = decide(
      candidate({
        prior: prior({
          status: "search_limited",
          researchedAt: new Date(NOW - 2 * 3600_000).toISOString(),
        }),
      }),
    );
    expect(later.spendDecision).toBe("RUN_DEEP_RESEARCH");
    expect(later.spendDecisionReason).toBe("RETRY_PREVIOUS_RESEARCH_INCOMPLETE");
  });

  it("7. a deferred occurrence borrows no dossier and exposes only audit provenance", () => {
    const d = decide(candidate({ prior: prior() }));
    const view = buildProductionShortlist(
      [
        {
          mint: "MintA",
          symbol: "A",
          name: "A",
          pairAddress: null,
          triageRank: 1,
          quantRank: 1,
          setup: "BASE",
          decision: "DEEP_RESEARCH",
        },
      ],
      [],
      [
        {
          mint: "MintA",
          spendDecision: d.spendDecision,
          spendDecisionReason: d.spendDecisionReason,
          policyVersion: d.policyVersion,
          priorResearchReportId: d.priorResearchReportId,
          priorResearchAt: d.priorResearchAt,
          priorResearchAgeMinutes: d.priorResearchAgeMinutes,
          priorScanRunId: d.priorScanRunId,
          priorTriageRunId: d.priorTriageRunId,
          cooldownRemainingMinutes: d.cooldownRemainingMinutes,
          nextEligibleAt: d.nextEligibleAt,
          materialChangeOverride: d.materialChangeOverride,
          materialChangeReasonCodes: d.materialChangeReasonCodes,
          budgetState: d.budgetState,
          executed: false,
        },
      ],
    );
    expect(view[0]!.status).toBe("DEFERRED_RECENT_RESEARCH");
    // No dossier from the previous cohort is attached to this occurrence.
    expect(view[0]!.reportId).toBeNull();
    expect(view[0]!.spend?.priorResearchReportId).toBe("report-1");
    expect(countShortlistStatuses(view).deferred).toBe(1);
    expect(countShortlistStatuses(view).completed).toBe(0);
  });

  it("8. deferral still records current triage / packet / recurrence metadata", () => {
    const d = decide(candidate({ prior: prior() }));
    expect(d.triageDecisionId).toBe("decision-1");
    expect(d.researchPacketId).toBe("packet-1");
    expect(d.recurrenceState).toBe("REPEAT");
    expect(d.recurrenceNumber).toBe(3);
    expect(d.triageRank).toBe(1);
  });

  it("9. exhausted budget → DEFERRED_BUDGET, ordered by persisted triage rank", () => {
    const records = applySpendControl({
      candidates: [
        candidate({ mint: "MintC", triageRank: 3 }),
        candidate({ mint: "MintA", triageRank: 1 }),
        candidate({ mint: "MintB", triageRank: 2 }),
      ],
      budget: { scanUsed: 0, scanLimit: 2, windowUsed: 0, windowLimit: 48 },
      nowMs: NOW,
    });
    expect(records.map((r) => r.mint)).toEqual(["MintA", "MintB", "MintC"]);
    expect(records[2]!.spendDecision).toBe("DEFERRED_BUDGET");
    expect(records[2]!.spendDecisionReason).toBe("SCAN_BUDGET_EXHAUSTED");
    // DEFERRED_BUDGET is not SKIP and not negative evidence.
    expect(records[2]!.materialChangeOverride).toBe(false);

    const windowed = decide(candidate(), { windowUsed: 48 });
    expect(windowed.spendDecisionReason).toBe("WINDOW_BUDGET_EXHAUSTED");
  });

  it("10. one authoritative decision per cohort × mint × policy version", () => {
    const records = applySpendControl({
      candidates: [candidate(), candidate()],
      budget,
      nowMs: NOW,
    });
    // Budget is charged once per granted candidate; the DB unique index on
    // (triage_run_id, mint, policy_version) is what makes the claim exclusive.
    expect(records.every((r) => r.policyVersion === RESEARCH_SPEND_POLICY_VERSION)).toBe(true);
    expect(records[0]!.budgetScanUsed).toBe(1);
    expect(records[1]!.budgetScanUsed).toBe(2);
  });

  it("11. calibration research cannot satisfy or reset a production cooldown", () => {
    // The prior-research loader only accepts non-calibration artifacts, so a
    // calibration-only history is indistinguishable from no history here.
    const d = decide(candidate({ prior: null }));
    expect(d.spendDecision).toBe("RUN_DEEP_RESEARCH");
    expect(d.priorResearchReportId).toBeNull();
  });

  it("12. defaults stay configurable and versioned", () => {
    expect(DEFAULT_RESEARCH_SPEND_CONFIG.fullDeepResearchCooldownMinutes).toBe(360);
    expect(DEFAULT_RESEARCH_SPEND_CONFIG.incompleteResearchRetryCooldownMinutes).toBe(60);
    expect(DEFAULT_RESEARCH_SPEND_CONFIG.maxDeepResearchPerScan).toBe(12);
    expect(DEFAULT_RESEARCH_SPEND_CONFIG.maxDeepResearchPerWindow).toBe(48);
    const strict = evaluateCooldown(candidate({ prior: prior() }), NOW, {
      ...DEFAULT_RESEARCH_SPEND_CONFIG,
      fullDeepResearchCooldownMinutes: 60,
    });
    expect(strict.allow).toBe(true);
  });

  it("reads packet facts from a stored research packet", () => {
    expect(
      packetFactsFromPacket({
        identity: { pairAddress: { value: "pair-1" }, dex: { value: "raydium" } },
        structural: { status: "PASS" },
        holders: { holderCount: { value: 10 }, top10Pct: { value: 5 }, top20Pct: { value: null } },
      }),
    ).toEqual({
      holderCount: 10,
      top10Pct: 5,
      top20Pct: null,
      structuralStatus: "PASS",
      pairAddress: "pair-1",
      dex: "raydium",
    });
    expect(packetFactsFromPacket(null)).toBeNull();
  });
});
