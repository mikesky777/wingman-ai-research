import { describe, expect, it } from "vitest";
import { isUniqueViolation, productionIdempotencyKey } from "./idempotency";

const MINT = "So11111111111111111111111111111111111111112";

describe("thesis_idempotency/v1", () => {
  it("derives identity from exact production provenance", () => {
    expect(
      productionIdempotencyKey({ triageRunId: "t1", mint: MINT, deepResearchReportId: "d1" }),
    ).toBe(`t1:${MINT}:d1`);
  });

  it("is stable for two concurrent attempts on the same Deep Research artifact", () => {
    const id = { triageRunId: "t1", mint: MINT, deepResearchReportId: "d1" };
    expect(productionIdempotencyKey(id)).toBe(productionIdempotencyKey({ ...id }));
  });

  it("differs for the same mint in a new cohort with a new dossier", () => {
    expect(
      productionIdempotencyKey({ triageRunId: "t2", mint: MINT, deepResearchReportId: "d2" }),
    ).not.toBe(
      productionIdempotencyKey({ triageRunId: "t1", mint: MINT, deepResearchReportId: "d1" }),
    );
  });

  it("refuses to identify incomplete provenance", () => {
    expect(
      productionIdempotencyKey({ triageRunId: null, mint: MINT, deepResearchReportId: "d1" }),
    ).toBeNull();
    expect(
      productionIdempotencyKey({ triageRunId: "t1", mint: MINT, deepResearchReportId: null }),
    ).toBeNull();
  });

  it("recognises unique violations however they surface", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
    expect(isUniqueViolation({ message: 'duplicate key value violates unique constraint "x"' })).toBe(true);
    expect(isUniqueViolation({ code: "42P01", message: "relation missing" })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});
