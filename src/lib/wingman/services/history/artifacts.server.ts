/**
 * History ARTIFACT read model (server-only).
 *
 * Deep Research stays artifact-only: no stage-relative outcome baseline was
 * ever captured for it.
 *
 * Thesis Synthesized is measurable, but ONLY from its own thesis-time
 * baseline: either a baseline the thesis run persisted, or the exact persisted
 * decision-time observation an older report was synthesized on. No AI
 * Shortlist / Survivor baseline is ever borrowed, no baseline is invented, and
 * nothing here is ever written.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  assessMarketValidity,
  isMetricUsable,
} from "../outcomes/market-validity";
import { deriveStageOutcome } from "./stage-outcomes";
import type { CandidateAppearance, SnapshotObservation } from "../outcomes/outcomes";
import type {
  DeepResearchArtifact,
  HistoryArtifactIdentity,
  HistoryArtifacts,
  ThesisArtifact,
  ThesisBaseline,
  ThesisPerformance,
} from "./artifacts";

type Row = Record<string, unknown>;

const num = (row: Row, key: string): number | null => {
  const v = row[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
};
const str = (row: Row, key: string): string | null => (row[key] as string | null) ?? null;

const chunk = <T,>(items: T[], size = 100): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

/** Same market cap within float noise counts as the same persisted print. */
const sameMarketCap = (a: number | null, b: number | null): boolean =>
  a !== null && b !== null && Math.abs(a - b) <= Math.max(1e-6, Math.abs(a) * 1e-9);


/** Production-only artifacts. Calibration rows are excluded at the query. */
export async function loadHistoryArtifacts(): Promise<HistoryArtifacts> {
  const [deepRes, thesisRes] = await Promise.all([
    supabaseAdmin
      .from("deep_research_reports")
      .select(
        "id, deep_research_run_id, mint, created_at, status, narrative_resolved, one_sentence_narrative, source_count, independent_source_count, evidence_coverage_pct, research_policy_version, search_version, dossier_version",
      )
      .eq("is_calibration", false)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("thesis_reports")
      .select(
        "id, mint, symbol, name, created_at, thesis_score, evidence_confidence, verdict, bear_case_severity, one_sentence_thesis, strongest_bear_case, qualified_as_opportunity, thesis_policy_version, rubric_version, prompt_version, model_provider, model_identifier",
      )
      .eq("is_calibration", false)
      .order("created_at", { ascending: false }),
  ]);
  if (deepRes.error) throw new Error(deepRes.error.message);
  if (thesisRes.error) throw new Error(thesisRes.error.message);

  const deepRows = (deepRes.data as Row[]) ?? [];
  const thesisRows = (thesisRes.data as Row[]) ?? [];

  const runIds = [...new Set(deepRows.map((r) => r["deep_research_run_id"] as string))];
  const runById = new Map<string, Row>();
  if (runIds.length) {
    const { data } = await supabaseAdmin
      .from("deep_research_runs")
      .select("id, completed_at, model_provider, model_identifier, prompt_version")
      .in("id", runIds);
    for (const r of ((data as Row[]) ?? [])) runById.set(r["id"] as string, r);
  }

  // Scoped identity lookup only — the Data API caps responses at 1000 rows.
  const mints = [...new Set([...deepRows, ...thesisRows].map((r) => r["mint"] as string))];
  const tokenByMint = new Map<string, Row>();
  if (mints.length) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("contract_address, symbol, name, dex_pair_address")
      .in("contract_address", mints);
    for (const t of ((data as Row[]) ?? [])) tokenByMint.set(t["contract_address"] as string, t);
  }

  const identity = (mint: string): HistoryArtifactIdentity => {
    const t = tokenByMint.get(mint);
    return {
      mint,
      symbol: (t?.["symbol"] as string | null) ?? null,
      name: (t?.["name"] as string | null) ?? null,
      pairAddress: (t?.["dex_pair_address"] as string | null) ?? null,
    };
  };

  const deepResearch: DeepResearchArtifact[] = deepRows.map((r) => {
    const run = runById.get(r["deep_research_run_id"] as string) ?? ({} as Row);
    return {
      ...identity(r["mint"] as string),
      reportId: r["id"] as string,
      runId: r["deep_research_run_id"] as string,
      completedAt: str(run, "completed_at") ?? str(r, "created_at"),
      narrativeResolved: Boolean(r["narrative_resolved"]),
      oneSentenceNarrative: str(r, "one_sentence_narrative"),
      sourceCount: num(r, "source_count"),
      independentSourceCount: num(r, "independent_source_count"),
      coveragePct: num(r, "evidence_coverage_pct"),
      researchPolicyVersion: str(r, "research_policy_version"),
      searchVersion: str(r, "search_version"),
      dossierVersion: str(r, "dossier_version"),
      modelProvider: str(run, "model_provider"),
      modelIdentifier: str(run, "model_identifier"),
      promptVersion: str(run, "prompt_version"),
    };
  });

  const thesis: ThesisArtifact[] = thesisRows.map((r) => ({
    ...identity(r["mint"] as string),
    symbol: str(r, "symbol") ?? identity(r["mint"] as string).symbol,
    name: str(r, "name") ?? identity(r["mint"] as string).name,
    reportId: r["id"] as string,
    synthesizedAt: str(r, "created_at"),
    thesisScore: num(r, "thesis_score"),
    evidenceConfidence: num(r, "evidence_confidence"),
    verdict: str(r, "verdict"),
    bearCaseSeverity: str(r, "bear_case_severity"),
    oneSentenceThesis: str(r, "one_sentence_thesis"),
    strongestBearCase: str(r, "strongest_bear_case"),
    qualifiedAsOpportunity: Boolean(r["qualified_as_opportunity"]),
    thesisPolicyVersion: str(r, "thesis_policy_version"),
    rubricVersion: str(r, "rubric_version"),
    promptVersion: str(r, "prompt_version"),
    modelProvider: str(r, "model_provider"),
    modelIdentifier: str(r, "model_identifier"),
  }));

  return { deepResearch, thesis };
}
