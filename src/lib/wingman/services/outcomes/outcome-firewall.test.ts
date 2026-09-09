/**
 * Structural firewall: outcome observations stay evaluation-only.
 *
 * Production decision modules must not be able to import the sampler, the
 * persisted observation read model or outcome persistence.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = "src/lib/wingman/services";

const DECISION_DIRS = ["scanner", "research", "entry", "sizing", "evidence"];
/**
 * Reading collected observations is forbidden everywhere in the decision path.
 * `refreshOutcomes` is a write-only, post-decision call and stays allowed.
 */
const FORBIDDEN = [
  "outcomes/sampler",
  "outcomes/observation-read",
  "readPersistedMarkets",
  // Evaluation-only enrollment reads must never re-enter a decision path.
  "loadEnrollmentBaselines",
  "outcome_enrollments",
];


function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("outcome firewall", () => {
  it("keeps outcome collection inaccessible to production decision modules", () => {
    const offenders: string[] = [];
    for (const dir of DECISION_DIRS) {
      const path = join(ROOT, dir);
      let files: string[] = [];
      try {
        files = walk(path);
      } catch {
        continue;
      }
      for (const file of files) {
        const source = readFileSync(file, "utf8");
        for (const needle of FORBIDDEN) {
          if (source.includes(needle)) offenders.push(`${file} -> ${needle}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps the persisted read model free of provider calls", () => {
    const source = readFileSync(join(ROOT, "outcomes/observation-read.server.ts"), "utf8");
    expect(source).not.toContain("DexScreenerAdapter");
    expect(source).not.toContain("dexRequest");
    expect(source).not.toContain("fetch(");
  });
});
