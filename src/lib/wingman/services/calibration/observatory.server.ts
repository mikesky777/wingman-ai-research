/**
 * Calibration Observatory v1 — read model (server-only).
 *
 * Reads ONLY persisted rows: frozen decision baselines, canonical market
 * observations, derived measurements and collection status. There is no
 * market-data provider call anywhere in this module or its imports, so any
 * Observatory filter/sort/tab interaction generates zero provider traffic.
 *
 * Nothing here is ever written, and nothing here may flow back into Scanner,
 * Triage, Deep Research, Thesis, Entry or Sizing.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadHistoryArtifacts } from "../history/artifacts.server";
import { normalizeSetups } from "../history/setup-filter";
import { getSamplerHealth } from "../outcomes/sampler.server";
import {
  OBSERVATORY_VERSION,
  measureAllHorizons,
  type ObservatoryBaseline,
  type ObservatoryDataset,
  type ObservatoryEvent,
  type ObservatoryObservation,
  type ObservatoryStage,
  type SpendDetail,
  type ThesisDetail,
  type TriageDetail,
} from "./observatory";

type Row = Record<string, unknown>;

const num = (row: Row, key: string): number | null => {
  const v = row[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};
const str = (row: Row, key: string): string | null => (row[key] as string | null) ?? null;

const chunk = <T,>(items: T[], size = 100): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

async function paginate(
  query: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const page = 1000;
  const out: Row[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await query(from, from + page - 1);
    if (error) break;
    const rows = (data as Row[]) ?? [];
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

/** Persisted observation series per exact mint (snapshots + scan appearances). */
async function loadObservationsByMint(): Promise<Map<string, ObservatoryObservation[]>> {
  const tokens = await paginate((from, to) =>
    supabaseAdmin.from("tokens").select("id, contract_address").range(from, to),
  );
  const mintByTokenId = new Map<string, string>();
  for (const t of tokens) mintByTokenId.set(t["id"] as string, t["contract_address"] as string);

  const snapshots = await paginate((from, to) =>
    supabaseAdmin
      .from("token_snapshots")
      .select("token_id, captured_at, price_usd, market_cap, liquidity_usd")
      .order("captured_at", { ascending: true })
      .range(from, to),
  );
  const candidates = await paginate((from, to) =>
    supabaseAdmin
      .from("scan_candidates")
      .select("token_id, created_at, price_usd, market_cap, liquidity_usd")
      .order("created_at", { ascending: true })
      .range(from, to),
  );

  const byMint = new Map<string, ObservatoryObservation[]>();
  const push = (tokenId: string | null, at: string | null, row: Row) => {
    if (!tokenId || !at) return;
    const mint = mintByTokenId.get(tokenId);
    if (!mint) return;
    const list = byMint.get(mint) ?? [];
    list.push({
      at,
      priceUsd: num(row, "price_usd"),
      marketCap: num(row, "market_cap"),
      liquidityUsd: num(row, "liquidity_usd"),
    });
    byMint.set(mint, list);
  };
  for (const row of snapshots) push(str(row, "token_id"), str(row, "captured_at"), row);
  for (const row of candidates) push(str(row, "token_id"), str(row, "created_at"), row);
  for (const [mint, list] of byMint) {
    byMint.set(
      mint,
      list.sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
    );
  }
  return byMint;
}

/** Exact mint recurrence across distinct cohorts, per stage. */
function applyRecurrence(events: ObservatoryEvent[]): ObservatoryEvent[] {
  const time = (e: ObservatoryEvent) =>
    e.eventAt ? Date.parse(e.eventAt) : Number.POSITIVE_INFINITY;
  const ordered = [...events].sort((a, b) => time(a) - time(b));
  const cohortsPerMint = new Map<string, Set<string>>();
  const lastAt = new Map<string, number>();
  const recurrence = new Map<string, number>();
  const since = new Map<string, number | null>();

  for (const e of ordered) {
    if (!e.canonical) continue;
    const cohorts = cohortsPerMint.get(e.mint) ?? new Set<string>();
    cohorts.add(e.cohortId ?? e.eventId);
    cohortsPerMint.set(e.mint, cohorts);
    recurrence.set(e.eventId, cohorts.size);
    const prior = lastAt.get(e.mint) ?? null;
    const at = time(e);
    since.set(e.eventId, prior !== null && Number.isFinite(at) ? at - prior : null);
    if (Number.isFinite(at)) lastAt.set(e.mint, at);
  }

  return events.map((e) => ({
    ...e,
    recurrenceNumber: recurrence.get(e.eventId) ?? 0,
    msSincePriorCanonicalEvent: since.get(e.eventId) ?? null,
  }));
}

export async function loadObservatoryDataset(): Promise<ObservatoryDataset> {
  const nowIso = new Date().toISOString();

  const [observations, milestones, artifacts, liveEvents, health] = await Promise.all([
    loadObservationsByMint(),
    paginate((from, to) =>
      supabaseAdmin
        .from("token_stage_milestones")
        .select(
          "id, contract_address, stage, first_entered_at, source_scan_id, setup_at_entry, market_cap_at_entry, price_at_entry, liquidity_at_entry, policy_version, source_id, source_type",
        )
        .in("stage", ["SETUP_QUALIFIED", "SURVIVOR", "AI_SHORTLIST", "THESIS_CALL"])
        .order("first_entered_at", { ascending: false })
        .range(from, to),
    ),
    loadHistoryArtifacts(),
    paginate((from, to) =>
      supabaseAdmin
        .from("live_call_events")
        .select(
          "id, mint, occurred_at, event_type, episode_number, thesis_report_id, market_cap_at_event, price_usd_at_event, liquidity_at_event, market_observed_at, policy_version, thesis_call_milestone_id",
        )
        .eq("event_type", "LIVE_ACTIVATED")
        .order("occurred_at", { ascending: false })
        .range(from, to),
    ),
    getSamplerHealth(),
  ]);

  // Identity for milestone rows.
  const mints = [
    ...new Set([
      ...milestones.map((m) => str(m, "contract_address")).filter((v): v is string => !!v),
      ...liveEvents.map((e) => str(e, "mint")).filter((v): v is string => !!v),
    ]),
  ];
  const identity = new Map<string, Row>();
  for (const ids of chunk(mints, 200)) {
    const { data } = await supabaseAdmin
      .from("tokens")
      .select("contract_address, symbol, name")
      .in("contract_address", ids);
    for (const t of ((data as Row[]) ?? [])) identity.set(t["contract_address"] as string, t);
  }

  // Triage + spend metadata for the AI Shortlist stage (exact cohort × mint).
  const triageRunIds = [
    ...new Set(
      milestones
        .filter((m) => str(m, "stage") === "AI_SHORTLIST")
        .map((m) => str(m, "source_id"))
        .filter((v): v is string => !!v),
    ),
  ];
  const triageByKey = new Map<string, Row>();
  const spendByKey = new Map<string, Row>();
  for (const ids of chunk(triageRunIds, 50)) {
    const [decisions, spend] = await Promise.all([
      supabaseAdmin
        .from("ai_triage_decisions")
        .select(
          "triage_run_id, mint, quant_priority, quant_rank, triage_rank, rank_delta, decision, confidence",
        )
        .in("triage_run_id", ids),
      supabaseAdmin
        .from("research_spend_decisions")
        .select(
          "triage_run_id, mint, spend_decision, spend_decision_reason, executed, prior_research_age_minutes, material_change_override, budget_state, policy_version",
        )
        .in("triage_run_id", ids),
    ]);
    for (const row of ((decisions.data as Row[]) ?? [])) {
      triageByKey.set(`${row["triage_run_id"]}:${row["mint"]}`, row);
    }
    for (const row of ((spend.data as Row[]) ?? [])) {
      spendByKey.set(`${row["triage_run_id"]}:${row["mint"]}`, row);
    }
  }

  const events: ObservatoryEvent[] = [];

  const measure = (mint: string, baseline: ObservatoryBaseline | null) =>
    measureAllHorizons(baseline, observations.get(mint) ?? [], nowIso);

  for (const m of milestones) {
    const mint = str(m, "contract_address");
    if (!mint) continue;
    const stage = str(m, "stage") as ObservatoryStage;
    const token = identity.get(mint);
    const cohortId = str(m, "source_scan_id") ?? str(m, "source_id");
    const baseline: ObservatoryBaseline = {
      observedAt: str(m, "first_entered_at"),
      marketCap: num(m, "market_cap_at_entry"),
      priceUsd: num(m, "price_at_entry"),
      liquidityUsd: num(m, "liquidity_at_entry"),
    };
    const triageKey = `${str(m, "source_id")}:${mint}`;
    const triageRow = stage === "AI_SHORTLIST" ? triageByKey.get(triageKey) : undefined;
    const spendRow = stage === "AI_SHORTLIST" ? spendByKey.get(triageKey) : undefined;

    const triage: TriageDetail | null = triageRow
      ? {
          quantPriority: num(triageRow, "quant_priority"),
          quantRank: num(triageRow, "quant_rank"),
          triageRank: num(triageRow, "triage_rank"),
          rankDelta: num(triageRow, "rank_delta"),
          decision: str(triageRow, "decision"),
          confidence: str(triageRow, "confidence"),
        }
      : null;
    const spend: SpendDetail | null = spendRow
      ? {
          deepSelected: str(triageRow ?? {}, "decision") === "DEEP_RESEARCH",
          spendDecision: str(spendRow, "spend_decision"),
          spendDecisionReason: str(spendRow, "spend_decision_reason"),
          executed: Boolean(spendRow["executed"]),
          priorResearchAgeMinutes: num(spendRow, "prior_research_age_minutes"),
          materialChangeOverride: Boolean(spendRow["material_change_override"]),
          budgetState: str(spendRow, "budget_state"),
          policyVersion: str(spendRow, "policy_version"),
        }
      : null;

    events.push({
      stage,
      eventId: m["id"] as string,
      mint,
      symbol: (token?.["symbol"] as string | null) ?? null,
      name: (token?.["name"] as string | null) ?? null,
      eventAt: str(m, "first_entered_at"),
      cohortId,
      policyVersion: str(m, "policy_version"),
      setups: normalizeSetups(str(m, "setup_at_entry")),
      canonical: true,
      recurrenceNumber: 0,
      msSincePriorCanonicalEvent: null,
      baseline,
      horizons: measure(mint, baseline),
      thesis: null,
      triage,
      spend,
    });
  }

  for (const a of artifacts.thesis) {
    const baseline: ObservatoryBaseline | null = a.baseline
      ? {
          observedAt: a.baseline.observedAt ?? a.synthesizedAt,
          marketCap: a.baseline.marketCap,
          priceUsd: a.baseline.priceUsd,
          liquidityUsd: a.baseline.liquidityUsd,
        }
      : null;
    const thesis: ThesisDetail = {
      thesisScore: a.thesisScore,
      evidenceConfidence: a.evidenceConfidence,
      verdict: a.verdict,
      bearCaseSeverity: a.bearCaseSeverity,
      distinctIndependentEvidenceOrigins: null,
      components: {},
      rubricVersion: a.rubricVersion,
      thesisPolicyVersion: a.thesisPolicyVersion,
      promptVersion: a.promptVersion,
    };
    events.push({
      stage: "THESIS_SYNTHESIZED",
      eventId: a.reportId,
      mint: a.mint,
      symbol: a.symbol,
      name: a.name,
      eventAt: a.synthesizedAt,
      cohortId: a.triageRunId ?? a.sourceScanId,
      policyVersion: a.thesisPolicyVersion,
      setups: a.setups,
      canonical: a.canonicalWithinCohortMint,
      recurrenceNumber: a.recurrenceNumberAcrossProductionCohorts,
      msSincePriorCanonicalSynthesisPlaceholder: undefined,
      msSincePriorCanonicalEvent: a.timeSincePriorCanonicalSynthesisMs,
      baseline,
      horizons: measure(a.mint, baseline),
      thesis,
      triage: null,
      spend: null,
    } as ObservatoryEvent);
  }

  // Thesis component scores + persisted origin gate semantics.
  const thesisIds = events
    .filter((e) => e.stage === "THESIS_SYNTHESIZED")
    .map((e) => e.eventId);
  for (const ids of chunk(thesisIds, 100)) {
    const { data } = await supabaseAdmin
      .from("thesis_reports")
      .select(
        "id, score_meme_quality, score_catalyst_narrative, score_distribution, score_liquidity, score_dev_integrity, score_chart_context, score_mindshare, score_valuation, gate_diagnostics, rubric_version",
      )
      .in("id", ids);
    for (const row of ((data as Row[]) ?? [])) {
      const event = events.find((e) => e.eventId === row["id"]);
      if (!event?.thesis) continue;
      const gate = (row["gate_diagnostics"] as Record<string, unknown> | null) ?? null;
      const originGate = (gate?.["originGate"] as Record<string, unknown> | undefined) ?? undefined;
      const origins = originGate?.["distinctIndependentEvidenceOrigins"];
      event.thesis.distinctIndependentEvidenceOrigins =
        typeof origins === "number" && Number.isFinite(origins) ? origins : null;
      event.thesis.components = {
        MEME_QUALITY: num(row, "score_meme_quality"),
        CATALYST_NARRATIVE: num(row, "score_catalyst_narrative"),
        DISTRIBUTION: num(row, "score_distribution"),
        LIQUIDITY: num(row, "score_liquidity"),
        DEV_INTEGRITY: num(row, "score_dev_integrity"),
        CHART_CONTEXT: num(row, "score_chart_context"),
        MINDSHARE: num(row, "score_mindshare"),
        VALUATION: num(row, "score_valuation"),
      };
    }
  }

  for (const e of liveEvents) {
    const mint = str(e, "mint");
    if (!mint) continue;
    const token = identity.get(mint);
    const baseline: ObservatoryBaseline = {
      observedAt: str(e, "market_observed_at") ?? str(e, "occurred_at"),
      marketCap: num(e, "market_cap_at_event"),
      priceUsd: num(e, "price_usd_at_event"),
      liquidityUsd: num(e, "liquidity_at_event"),
    };
    events.push({
      stage: "LIVE_ACTIVATION",
      eventId: e["id"] as string,
      mint,
      symbol: (token?.["symbol"] as string | null) ?? null,
      name: (token?.["name"] as string | null) ?? null,
      eventAt: str(e, "occurred_at"),
      cohortId: str(e, "thesis_call_milestone_id"),
      policyVersion: str(e, "policy_version"),
      setups: null,
      canonical: true,
      recurrenceNumber: 0,
      msSincePriorCanonicalEvent: null,
      baseline,
      horizons: measure(mint, baseline),
      thesis: null,
      triage: null,
      spend: null,
    });
  }

  // Recurrence is computed per stage over exact mints and distinct cohorts.
  const withRecurrence: ObservatoryEvent[] = [];
  for (const stage of new Set(events.map((e) => e.stage))) {
    withRecurrence.push(...applyRecurrence(events.filter((e) => e.stage === stage)));
  }

  return {
    version: OBSERVATORY_VERSION,
    generatedAt: nowIso,
    events: withRecurrence,
    samplerHealth: {
      lastRunAt: health.lastRunAt,
      lastSuccessfulRunAt: health.lastSuccessfulRunAt,
      oldestStaleObservationAt: health.oldestStaleObservationAt,
      mintsTracked: health.mintsTracked,
      mintsDue: health.mintsDue,
      mintsRefreshed: health.mintsRefreshed,
      mintsDelayed: health.mintsDelayed,
      batchesSent: health.batchesSent,
      rateLimitedCount: health.rateLimitedCount,
      providerErrorCount: health.providerErrorCount,
      observationAsOf: newestObservation(observations),
    },
    providerRequests: 0,
  };
}

function newestObservation(byMint: Map<string, ObservatoryObservation[]>): string | null {
  let newest: string | null = null;
  for (const list of byMint.values()) {
    const last = list[list.length - 1];
    if (last && (!newest || last.at > newest)) newest = last.at;
  }
  return newest;
}
