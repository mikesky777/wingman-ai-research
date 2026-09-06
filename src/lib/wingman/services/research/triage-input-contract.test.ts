import { describe, expect, it } from "vitest";
import {
  buildTriageModelInput,
  buildTriagePrompt,
  inputPolicyVersionFor,
  TRIAGE_INPUT_POLICY_VERSION,
  TRIAGE_INPUT_SCHEMA,
  TRIAGE_POLICY_VERSION,
  TRIAGE_PROMPT_VERSION,
} from "./triage";

const packet = {
  sv: "research_packet_compact/v1",
  pv: "research_packet/v1",
  src: "BASE",
  id: { mint: "m1", sym: "TKN", chain: "solana" },
  scan: { id: "scan-1", setups: ["NONE"], prio: 40, survivor: false, route: "GLOBAL" },
  mkt: { mc: 50000, liq: 12000 },
  price_integrity: { status: "NOT_EVALUATED" },
  participation: { status: "NOT_EVALUATED" },
  gaps: ["PRICE_INTEGRITY_NOT_EVALUATED"],
  outcomes: { peak_call: 900, dd_call: -50 },
};

describe("triage input contract (deny-by-default)", () => {
  it("is versioned prospectively and never leaks stored outcomes", () => {
    expect(TRIAGE_INPUT_POLICY_VERSION).toBe("ai_triage_input/v2_allowlist_no_outcomes");
    expect(TRIAGE_PROMPT_VERSION).toBe("ai_triage_prompt/v1.3");
    expect(inputPolicyVersionFor(null)).toBe(TRIAGE_INPUT_POLICY_VERSION);
    const out = buildTriageModelInput(packet);
    expect(out["outcomes"]).toBeUndefined();
    expect(out["mkt"]).toEqual({ mc: 50000, liq: 12000 });
  });

  it("makes arbitrary future outcome fields structurally unreachable", () => {
    const future = {
      ...packet,
      realized_return_pct: 412,
      thesis: { score: 91, call: true },
      entry: { state: "BUY_ZONE" },
      live: { active: true },
      mkt: { ...packet.mkt, peak_since_call_pct: 700 },
      scan: { ...packet.scan, drawdown_after_decision: -33 },
    };
    const out = buildTriageModelInput(future) as Record<string, any>;
    expect(out["realized_return_pct"]).toBeUndefined();
    expect(out["thesis"]).toBeUndefined();
    expect(out["entry"]).toBeUndefined();
    expect(out["live"]).toBeUndefined();
    expect(out["mkt"].peak_since_call_pct).toBeUndefined();
    expect(out["scan"].drawdown_after_decision).toBeUndefined();

    const prompt = buildTriagePrompt({
      header: {
        scanId: "scan-1",
        scannerPolicyVersion: "sel/v1",
        triagePolicyVersion: TRIAGE_POLICY_VERSION,
        promptVersion: TRIAGE_PROMPT_VERSION,
        mode: "PRODUCTION",
        candidateCount: 1,
        generatedAt: "2026-01-01T00:00:00Z",
        maxDeepResearch: 15,
      },
      cohort: {
        candidateCount: 1,
        medianQuantPriority: 40,
        medianMarketCap: 50000,
        medianLiquidityUsd: 12000,
        setupCounts: { NONE: 1 },
        priceStructureCounts: {},
        participationCounts: {},
        recurrenceCounts: {},
        sourceCounts: { BASE: 1 },
      },
      candidates: [
        {
          mint: "m1",
          candidateSource: "BASE",
          researchPacketId: null,
          researchPacketVersion: "research_packet/v1",
          quantPriority: 40,
          quantRank: 1,
          compact: future,
        },
      ],
    });
    for (const forbidden of [
      "realized_return_pct",
      "peak_since_call_pct",
      "drawdown_after_decision",
      "outcomes",
      "412",
      "700",
    ]) {
      expect(prompt.user).not.toContain(forbidden);
    }
  });

  it("only admits a new field once it is added to the allowlist schema", () => {
    expect(TRIAGE_INPUT_SCHEMA["outcomes"]).toBeUndefined();
    const withExtra = { ...TRIAGE_INPUT_SCHEMA, newly_allowed: true as const };
    expect(withExtra["newly_allowed"]).toBe(true);
    expect(buildTriageModelInput({ ...packet, newly_allowed: 1 })["newly_allowed"]).toBeUndefined();
  });
});

describe("triage prompt v1.3 decision semantics", () => {
  const system = buildTriagePrompt({
    header: {
      scanId: "s",
      scannerPolicyVersion: "sel/v1",
      triagePolicyVersion: TRIAGE_POLICY_VERSION,
      promptVersion: TRIAGE_PROMPT_VERSION,
      mode: "PRODUCTION",
      candidateCount: 0,
      generatedAt: "2026-01-01T00:00:00Z",
      maxDeepResearch: 15,
    },
    cohort: {
      candidateCount: 0,
      medianQuantPriority: null,
      medianMarketCap: null,
      medianLiquidityUsd: null,
      setupCounts: {},
      priceStructureCounts: {},
      participationCounts: {},
      recurrenceCounts: {},
      sourceCounts: {},
    },
    candidates: [],
  }).system;

  it("forbids gaps alone as a SKIP reason", () => {
    expect(system).toContain("SKIP REQUIRES affirmative observed reasons");
    expect(system).toContain("Price Integrity NOT_EVALUATED");
    expect(system).toContain("Participation NOT_EVALUATED");
    expect(system).toContain("social data not collected");
    expect(system).toContain("Missing evidence is NOT negative evidence");
  });

  it("forbids setup label alone from demoting NONE or promoting BASE", () => {
    expect(system).toContain("A setup label of NONE may NEVER by itself justify SKIP");
    expect(system).toContain("NONE must not be demoted merely for being NONE");
    expect(system).toContain("BASE must not be promoted merely for being BASE");
  });

  it("defines WATCH and SKIP distinctly", () => {
    expect(system).toContain('WATCH = "not worth Deep Research spend now');
    expect(system).toContain('SKIP = "current observed evidence makes expensive Deep Research low-value"');
    expect(system).toContain('DEEP_RESEARCH = "worth paying for expensive external Deep Research now"');
  });

  it("defines confidence as confidence in the classification", () => {
    expect(system).toContain("confidence that THIS TRIAGE CLASSIFICATION is justified");
    expect(system).toContain("Do not report HIGH confidence merely because many fields are missing");
  });
});
