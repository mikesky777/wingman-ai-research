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

/** Data API caps a response at 1000 rows; every read here is paginated. */
async function paginate(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const page = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await query(from, from + page - 1);
    if (error) break;
    const rows = ((data as Row[]) ?? []);
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

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
      .in("status", ["completed", "search_limited"])
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("thesis_reports")
      .select(
        "id, token_id, mint, symbol, name, created_at, thesis_score, evidence_confidence, verdict, bear_case_severity, one_sentence_thesis, strongest_bear_case, qualified_as_opportunity, thesis_policy_version, rubric_version, prompt_version, model_provider, model_identifier, market_cap_at_synthesis, price_at_synthesis, liquidity_at_synthesis, triage_run_id, deep_research_run_id, deep_research_report_id, thesis_synthesis_run_id",
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

  const measured = await loadThesisMeasurements(thesisRows);

  const thesis: ThesisArtifact[] = thesisRows.map((r) => {
    const id = r["id"] as string;
    const m = measured.get(id) ?? { baseline: null, performance: null };
    return {
      ...identity(r["mint"] as string),
      symbol: str(r, "symbol") ?? identity(r["mint"] as string).symbol,
      name: str(r, "name") ?? identity(r["mint"] as string).name,
      reportId: id,
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
      sourceScanId: null,
      triageRunId: str(r, "triage_run_id"),
      deepResearchRunId: str(r, "deep_research_run_id"),
      baseline: m.baseline,
      performance: m.performance,
    };
  });

  return { deepResearch, thesis };
}

interface ThesisMeasurement {
  baseline: ThesisBaseline | null;
  performance: ThesisPerformance | null;
}

/**
 * Resolve one thesis-time baseline per thesis report and derive its
 * post-synthesis market outcome with the shared `stage_outcome/v1` +
 * `outcome_market_validity/v1` rules.
 */
async function loadThesisMeasurements(
  thesisRows: Row[],
): Promise<Map<string, ThesisMeasurement>> {
  const out = new Map<string, ThesisMeasurement>();
  if (thesisRows.length === 0) return out;

  const reportIds = thesisRows.map((r) => r["id"] as string);
  const tokenIds = [
    ...new Set(thesisRows.map((r) => str(r, "token_id")).filter((v): v is string => !!v)),
  ];

  // Baselines the thesis run itself froze (prospective path).
  const persisted = new Map<string, Row>();
  for (const ids of chunk(reportIds)) {
    const { data } = await supabaseAdmin
      .from("thesis_synthesis_baselines")
      .select(
        "thesis_report_id, observed_at, market_cap, price_usd, liquidity_usd, volume_24h, market_source, source_pair_address",
      )
      .in("thesis_report_id", ids);
    for (const row of ((data as Row[]) ?? [])) {
      persisted.set(row["thesis_report_id"] as string, row);
    }
  }

  // Persisted market observations for every token involved.
  const snapshotsByToken = new Map<string, Row[]>();
  const candidatesByToken = new Map<string, Row[]>();
  for (const ids of chunk(tokenIds)) {
    const [snapRows, candRows] = await Promise.all([
      paginate((from, to) =>
        supabaseAdmin
          .from("token_snapshots")
          .select(
            "token_id, captured_at, price_usd, market_cap, liquidity_usd, volume_24h, price_change_1h, price_change_24h, data_source, source_pair_address",
          )
          .in("token_id", ids)
          .order("captured_at", { ascending: true })
          .range(from, to),
      ),
      paginate((from, to) =>
        supabaseAdmin
          .from("scan_candidates")
          .select("token_id, created_at, price_usd, market_cap, liquidity_usd")
          .in("token_id", ids)
          .order("created_at", { ascending: true })
          .range(from, to),
      ),
    ]);
    for (const row of snapRows) {
      const key = row["token_id"] as string;
      snapshotsByToken.set(key, [...(snapshotsByToken.get(key) ?? []), row]);
    }
    for (const row of candRows) {
      const key = row["token_id"] as string;
      candidatesByToken.set(key, [...(candidatesByToken.get(key) ?? []), row]);
    }
  }

  for (const r of thesisRows) {
    const reportId = r["id"] as string;
    const tokenId = str(r, "token_id");
    const synthesizedAt = str(r, "created_at");
    const snaps = tokenId ? (snapshotsByToken.get(tokenId) ?? []) : [];

    const baseline = resolveThesisBaseline({
      persisted: persisted.get(reportId) ?? null,
      report: r,
      synthesizedAt,
      snapshots: snaps,
    });

    if (!baseline || !synthesizedAt) {
      out.set(reportId, { baseline: null, performance: null });
      continue;
    }

    const snapshotSeries: SnapshotObservation[] = snaps.map((s) => ({
      capturedAt: str(s, "captured_at") ?? "",
      priceUsd: num(s, "price_usd"),
      marketCap: num(s, "market_cap"),
      liquidityUsd: num(s, "liquidity_usd"),
    }));
    const candidateSeries: CandidateAppearance[] = (
      tokenId ? (candidatesByToken.get(tokenId) ?? []) : []
    )
      .filter((c) => !!str(c, "created_at"))
      .map((c) => ({
        scanRunId: "",
        completedAt: str(c, "created_at") as string,
        priceUsd: num(c, "price_usd"),
        marketCap: num(c, "market_cap"),
        liquidityUsd: num(c, "liquidity_usd"),
        survivor: false,
      }));

    const outcome = deriveStageOutcome(
      {
        enteredAt: baseline.observedAt ?? synthesizedAt,
        marketCapAtEntry: baseline.marketCap,
        priceAtEntry: baseline.priceUsd,
      },
      { candidates: candidateSeries, snapshots: snapshotSeries },
    );

    // Newest valid snapshot supplies descriptive live market context only.
    const latestValid = [...snaps]
      .reverse()
      .find((s) =>
        isMetricUsable(
          assessMarketValidity({
            liquidityUsd: num(s, "liquidity_usd"),
            marketCap: num(s, "market_cap"),
          }).validity,
        ),
      );

    out.set(reportId, {
      baseline,
      performance: {
        sincePct: outcome.sincePct,
        peakPct: outcome.peakPct,
        drawdownPct: outcome.drawdownPct,
        currentMarketCap: outcome.currentMarketCap,
        currentPriceUsd: outcome.currentPriceUsd,
        currentLiquidityUsd: latestValid ? num(latestValid, "liquidity_usd") : null,
        currentVolume24h: latestValid ? num(latestValid, "volume_24h") : null,
        priceChange1h: latestValid ? num(latestValid, "price_change_1h") : null,
        priceChange24h: latestValid ? num(latestValid, "price_change_24h") : null,
        currentObservedAt: outcome.currentObservedAt,
        observationCount: outcome.observationCount,
      },
    });
  }

  return out;
}

/**
 * A thesis baseline is only legitimate when the thesis run froze it, or when
 * the exact persisted decision-time observation the report was synthesized on
 * can still be identified. Anything else stays unavailable.
 */
function resolveThesisBaseline(args: {
  persisted: Row | null;
  report: Row;
  synthesizedAt: string | null;
  snapshots: Row[];
}): ThesisBaseline | null {
  const { persisted, report, synthesizedAt, snapshots } = args;

  if (persisted) {
    return {
      origin: "CAPTURED_AT_SYNTHESIS",
      observedAt: str(persisted, "observed_at"),
      marketCap: num(persisted, "market_cap"),
      priceUsd: num(persisted, "price_usd"),
      liquidityUsd: num(persisted, "liquidity_usd"),
      volume24h: num(persisted, "volume_24h"),
      pairAddress: str(persisted, "source_pair_address"),
      source: str(persisted, "market_source"),
    };
  }

  const marketCapAtSynthesis = num(report, "market_cap_at_synthesis");
  if (!synthesizedAt || marketCapAtSynthesis === null) return null;
  const synthesizedTs = Date.parse(synthesizedAt);
  if (Number.isNaN(synthesizedTs)) return null;

  // Newest observation at or before synthesis — never a later print.
  const priorSnapshot = [...snapshots]
    .filter((s) => {
      const at = Date.parse(str(s, "captured_at") ?? "");
      return !Number.isNaN(at) && at <= synthesizedTs;
    })
    .pop();
  if (!priorSnapshot) return null;
  // It must be the exact print the thesis was synthesized on.
  if (!sameMarketCap(num(priorSnapshot, "market_cap"), marketCapAtSynthesis)) return null;

  return {
    origin: "RESOLVED_DECISION_TIME",
    observedAt: str(priorSnapshot, "captured_at"),
    marketCap: marketCapAtSynthesis,
    priceUsd: num(report, "price_at_synthesis") ?? num(priorSnapshot, "price_usd"),
    liquidityUsd: num(report, "liquidity_at_synthesis") ?? num(priorSnapshot, "liquidity_usd"),
    volume24h: num(priorSnapshot, "volume_24h"),
    pairAddress: str(priorSnapshot, "source_pair_address"),
    source: str(priorSnapshot, "data_source"),
  };
}

