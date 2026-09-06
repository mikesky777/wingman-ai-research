import { describe, it, expect } from "vitest";
import {
  ACTIVE_THESIS_RUBRIC,
  PRODUCTION_POLICY_STAGES,
} from "./production-policy";
import {
  THESIS_RUBRIC_VERSION,
  THESIS_COMPONENTS,
  OPPORTUNITY_GATE_VERSION,
} from "../research/thesis/contracts";
import { ENTRY_POLICY_VERSION } from "../entry/contracts";
import { RESEARCH_SPEND_POLICY_VERSION } from "../research/spend/spend-policy";

describe("settings policy manifest", () => {
  it("shows the ACTIVE thesis rubric, resolved not copied", () => {
    expect(ACTIVE_THESIS_RUBRIC.rubricVersion).toBe(THESIS_RUBRIC_VERSION);
    expect(ACTIVE_THESIS_RUBRIC.components).toEqual(
      THESIS_COMPONENTS.map((c) => ({ key: c.key, label: c.label, weight: c.weight })),
    );
  });

  it("thesis weights total 100", () => {
    const total = ACTIVE_THESIS_RUBRIC.components.reduce((s, c) => s + c.weight, 0);
    expect(total).toBe(100);
    expect(ACTIVE_THESIS_RUBRIC.maxScore).toBe(100);
  });

  it("never presents entry / chart timing as a thesis component", () => {
    const keys = ACTIVE_THESIS_RUBRIC.components.map((c) => c.key as string);
    expect(keys).not.toContain("chartContext");
    for (const label of ACTIVE_THESIS_RUBRIC.components.map((c) => c.label.toLowerCase())) {
      expect(label).not.toContain("entry");
      expect(label).not.toContain("chart");
    }
  });

  it("does not carry legacy v0/v1 weights", () => {
    const byLabel = new Map(
      ACTIVE_THESIS_RUBRIC.components.map((c) => [c.label.toLowerCase(), c.weight]),
    );
    expect(byLabel.get("valuation / asymmetry")).toBe(10);
    expect(byLabel.get("narrative / catalyst")).toBe(20);
  });

  it("exposes each stage policy separately and from authoritative constants", () => {
    const flat = PRODUCTION_POLICY_STAGES.flatMap((s) => s.items.map((i) => i.value));
    expect(flat).toContain(THESIS_RUBRIC_VERSION);
    expect(flat).toContain(OPPORTUNITY_GATE_VERSION);
    expect(flat).toContain(ENTRY_POLICY_VERSION);
    expect(flat).toContain(RESEARCH_SPEND_POLICY_VERSION);
    const stages = PRODUCTION_POLICY_STAGES.map((s) => s.stage);
    expect(new Set(stages).size).toBe(stages.length);
  });
});
