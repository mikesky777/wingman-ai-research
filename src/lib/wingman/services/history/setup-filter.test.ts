import { describe, expect, it } from "vitest";
import {
  filterBySetup,
  matchesSetupFilter,
  normalizeSetups,
  setupLabel,
} from "./setup-filter";

describe("history_setup_filter/v1", () => {
  it("normalizes persisted provenance values", () => {
    expect(normalizeSetups(["BASE", "MOMENTUM"])).toEqual(["BASE"]);
    expect(normalizeSetups("BASE+REACCEL")).toEqual(["BASE", "REACCEL"]);
    expect(normalizeSetups("NONE")).toEqual([]);
    expect(normalizeSetups(null)).toBeNull();
  });

  it("labels missing provenance as UNKNOWN and empty as NONE", () => {
    expect(setupLabel(null)).toBe("UNKNOWN");
    expect(setupLabel([])).toBe("NONE");
    expect(setupLabel(["BASE"])).toBe("BASE");
  });

  it("matches ALL / BASE / REACCEL / NONE without guessing UNKNOWN", () => {
    expect(matchesSetupFilter(null, "ALL")).toBe(true);
    expect(matchesSetupFilter(null, "NONE")).toBe(false);
    expect(matchesSetupFilter(null, "BASE")).toBe(false);
    expect(matchesSetupFilter([], "NONE")).toBe(true);
    expect(matchesSetupFilter(["REACCEL"], "REACCEL")).toBe(true);
    expect(matchesSetupFilter(["REACCEL"], "BASE")).toBe(false);
  });

  it("filters rows by exact persisted setup", () => {
    const rows = [
      { id: "a", setups: ["BASE"] },
      { id: "b", setups: [] as string[] },
      { id: "c", setups: null },
    ];
    expect(filterBySetup(rows, "ALL").map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(filterBySetup(rows, "BASE").map((r) => r.id)).toEqual(["a"]);
    expect(filterBySetup(rows, "NONE").map((r) => r.id)).toEqual(["b"]);
  });
});
