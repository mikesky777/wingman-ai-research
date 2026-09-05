/**
 * Funnel-stage History reads (browser, read-only).
 *
 * Stage cohorts are built from the append-only `token_stage_milestones` table.
 * Baselines are the frozen values recorded at stage entry — nothing here
 * recomputes, rewrites or reinterprets a milestone, an outcome row, or a
 * historical scan row.
 */
import { supabase } from "../../data/supabase";
import {
  MILESTONE_VERSION,
  type FunnelStage,
  type StageProvenance,
  type StageRow,
} from "./milestones";
import type { PolicyEpoch } from "./policy-epochs";
import { deriveStageOutcome } from "./stage-outcomes";
import type {
  CandidateAppearance,
  SnapshotObservation,
} from "../outcomes/outcomes";

type Row = Record<string, unknown>;

const PAGE = 1000;
const CHUNK = 25;

const num = (row: Row, key: string): number | null => {
  const value = row[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

/** The Data API caps a response at 1000 rows, so every read paginates. */
async function paginate(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data ?? []) as Row[];
    out.push(...page);
    if (page.length < PAGE) break;
  }
  return out;
}

function provenanceOf(row: Row): StageProvenance {
  return {
    sourceType: (row["source_type"] as StageProvenance["sourceType"]) ?? "SCANNER",
    sourceId: (row["source_id"] as string | null) ?? null,
    sourceRef: (row["source_ref"] as string | null) ?? null,
    sourceScanId: (row["source_scan_id"] as string | null) ?? null,
    researchPacketId: (row["research_packet_id"] as string | null) ?? null,
    researchPacketVersion: (row["research_packet_version"] as string | null) ?? null,
    researchRunId: (row["research_run_id"] as string | null) ?? null,
    researchReportId: (row["research_report_id"] as string | null) ?? null,
    policyVersion: (row["policy_version"] as string | null) ?? null,
    milestoneVersion: (row["milestone_version"] as string | null) ?? MILESTONE_VERSION,
  };
}

export const StageMilestoneService = {
  /** Provenance for every milestone of one stage, keyed by token id. */
  async provenanceByToken(stage: FunnelStage): Promise<Map<string, StageProvenance>> {
    const rows = await paginate((from, to) =>
      supabase
        .from("token_stage_milestones")
        .select(
          "token_id, source_type, source_id, source_ref, source_scan_id, research_packet_id, research_packet_version, research_run_id, research_report_id, policy_version, milestone_version",
        )
        .eq("stage", stage)
        .range(from, to),
    );
    const out = new Map<string, StageProvenance>();
    for (const row of rows) out.set(row["token_id"] as string, provenanceOf(row));
    return out;
  },

  /** Frozen policy era of each token's milestone in one stage. */
  async policyByToken(
    stage: FunnelStage,
  ): Promise<Map<string, { policyEpoch: PolicyEpoch; selectionPolicyVersion: string | null }>> {
    const rows = await paginate((from, to) =>
      supabase
        .from("token_stage_milestones")
        .select("token_id, policy_epoch, selection_policy_version")
        .eq("stage", stage)
        .range(from, to),
    );
    const out = new Map<
      string,
      { policyEpoch: PolicyEpoch; selectionPolicyVersion: string | null }
    >();
    for (const row of rows) {
      out.set(row["token_id"] as string, {
        policyEpoch: ((row["policy_epoch"] as string | null) ?? "UNKNOWN_POLICY") as PolicyEpoch,
        selectionPolicyVersion: (row["selection_policy_version"] as string | null) ?? null,
      });
    }
    return out;
  },

  /** Unique tokens that entered one stage, with their frozen entry baseline. */
  async stageCohort(stage: FunnelStage): Promise<StageRow[]> {
    const milestones = await paginate((from, to) =>
      supabase
        .from("token_stage_milestones")
        .select("*")
        .eq("stage", stage)
        .order("first_entered_at", { ascending: false })
        .range(from, to),
    );
    if (milestones.length === 0) return [];

    const tokenIds = [...new Set(milestones.map((m) => m["token_id"] as string))];
    const chunks: string[][] = [];
    for (let i = 0; i < tokenIds.length; i += CHUNK) chunks.push(tokenIds.slice(i, i + CHUNK));

    const [tokenRows, outcomeRows, candidateChunks] = await Promise.all([
      Promise.all(
        chunks.map((ids) =>
          supabase.from("tokens").select("id, name, symbol, dex_pair_address").in("id", ids),
        ),
      ),
      Promise.all(
        chunks.map((ids) =>
          supabase
            .from("token_scanner_outcomes")
            .select(
              "token_id, current_market_cap_usd, current_price_usd, current_observed_at, observation_count",
            )
            .in("token_id", ids),
        ),
      ),
      Promise.all(
        chunks.map((ids) =>
          paginate((from, to) =>
            supabase
              .from("scan_candidates")
              .select(
                "token_id, created_at, recurrence_state, market_cap, price_usd, liquidity_usd, volume_24h, price_integrity_status, structural_status, participation_status",
              )
              .in("token_id", ids)
              .order("created_at", { ascending: false })
              .range(from, to),
          ),
        ),
      ),
    ]);

    const tokensById = new Map<string, Row>();
    for (const res of tokenRows) {
      for (const row of ((res.data ?? []) as unknown as Row[])) {
        tokensById.set(row["id"] as string, row);
      }
    }
    const outcomeById = new Map<string, Row>();
    for (const res of outcomeRows) {
      for (const row of ((res.data ?? []) as unknown as Row[])) {
        outcomeById.set(row["token_id"] as string, row);
      }
    }
    const latestByToken = new Map<string, Row>();
    for (const rows of candidateChunks) {
      for (const row of rows) {
        const id = row["token_id"] as string;
        const prior = latestByToken.get(id);
        if (
          !prior ||
          String(row["created_at"] ?? "").localeCompare(String(prior["created_at"] ?? "")) > 0
        ) {
          latestByToken.set(id, row);
        }
      }
    }

    // Stage-relative outcomes are derived ONLY for stages with a legitimate
    // frozen baseline. Survivors keep their existing adapter-backed path.
    const derivesSeries = stage === "AI_SHORTLIST" || stage === "THESIS_CALL";
    const candidatesByToken = new Map<string, CandidateAppearance[]>();
    const snapshotsByToken = new Map<string, SnapshotObservation[]>();
    if (derivesSeries) {
      for (const rows of candidateChunks) {
        for (const row of rows) {
          const id = row["token_id"] as string;
          const list = candidatesByToken.get(id) ?? [];
          list.push({
            scanRunId: "",
            completedAt: (row["created_at"] as string | null) ?? "",
            priceUsd: num(row, "price_usd"),
            marketCap: num(row, "market_cap"),
            liquidityUsd: num(row, "liquidity_usd"),
            survivor: false,
          });
          candidatesByToken.set(id, list);
        }
      }
      const snapshotChunks = await Promise.all(
        chunks.map(async (ids) => {
          try {
            return await paginate((from, to) =>
              supabase
                .from("token_snapshots")
                .select("token_id, captured_at, price_usd, market_cap, liquidity_usd")
                .in("token_id", ids)
                .order("captured_at", { ascending: true })
                .range(from, to),
            );
          } catch {
            return [] as Row[]; // Snapshot history is optional.
          }
        }),
      );
      for (const rows of snapshotChunks) {
        for (const row of rows) {
          const id = row["token_id"] as string;
          const list = snapshotsByToken.get(id) ?? [];
          list.push({
            capturedAt: (row["captured_at"] as string | null) ?? "",
            priceUsd: num(row, "price_usd"),
            marketCap: num(row, "market_cap"),
            liquidityUsd: num(row, "liquidity_usd"),
          });
          snapshotsByToken.set(id, list);
        }
      }
    }
    const nowIso = new Date().toISOString();

    return milestones.map((m) => {
      const tokenId = m["token_id"] as string;
      const token = tokensById.get(tokenId) ?? ({} as Row);
      const outcome = outcomeById.get(tokenId) ?? ({} as Row);
      const latest = latestByToken.get(tokenId) ?? ({} as Row);
      const entryMarketCap = num(m, "market_cap_at_entry");
      const currentMarketCap = num(outcome, "current_market_cap_usd");
      const sincePct =
        entryMarketCap !== null && entryMarketCap > 0 && currentMarketCap !== null
          ? ((currentMarketCap - entryMarketCap) / entryMarketCap) * 100
          : null;
      const enteredAt = (m["first_entered_at"] as string | null) ?? null;
      // Same formulas and validity rules as Survivors; only the baseline differs.
      const derived = derivesSeries
        ? deriveStageOutcome(
            {
              enteredAt,
              marketCapAtEntry: entryMarketCap,
              priceAtEntry: num(m, "price_at_entry"),
            },
            {
              candidates: candidatesByToken.get(tokenId) ?? [],
              snapshots: snapshotsByToken.get(tokenId) ?? [],
            },
            nowIso,
          )
        : null;
      const setupAtEntry = (m["setup_at_entry"] as string | null) ?? null;
      const setupKey = ((m["setup_key"] as string | null) ?? "ALL") as StageRow["setupKey"];

      return {
        tokenId,
        contractAddress: (m["contract_address"] as string | null) ?? null,
        name: (token["name"] as string | null) ?? "Unknown token",
        symbol: (token["symbol"] as string | null) ?? "—",
        stage,
        setupKey,
        setups: setupAtEntry ? setupAtEntry.split("+").filter(Boolean) : [],
        enteredAt,
        entryMarketCap,
        entryPriceUsd: num(m, "price_at_entry"),
        entryLiquidityUsd: num(m, "liquidity_at_entry"),
        sincePct: derived ? (derived.sincePct ?? sincePct) : sincePct,
        // Peak / adverse / drawdown come from valid post-milestone observations
        // only; stages without a frozen baseline stay null, never zero.
        peakPct: derived?.peakPct ?? null,
        maxAdversePct: derived?.maxAdversePct ?? null,
        drawdownPct: derived?.drawdownPct ?? null,
        currentMarketCap: derived?.currentMarketCap ?? currentMarketCap,
        currentPriceUsd: derived?.currentPriceUsd ?? num(outcome, "current_price_usd"),
        currentObservedAt:
          derived?.currentObservedAt ?? ((outcome["current_observed_at"] as string | null) ?? null),
        scanMarketCap: num(latest, "market_cap"),
        scanLiquidityUsd: num(latest, "liquidity_usd"),
        scanVolume24h: num(latest, "volume_24h"),
        priceIntegrityStatus: (latest["price_integrity_status"] as string | null) ?? null,
        structuralStatus: (latest["structural_status"] as string | null) ?? null,
        participationStatus: (latest["participation_status"] as string | null) ?? null,
        dexPairAddress: (token["dex_pair_address"] as string | null) ?? null,
        observationCount: num(outcome, "observation_count") ?? 0,
        latestObservationAt: (latest["created_at"] as string | null) ?? null,
        latestRecurrenceState: (latest["recurrence_state"] as string | null) ?? null,
        provenance: provenanceOf(m),
        baselineComplete: Boolean(m["baseline_complete"]),
        policyEpoch: ((m["policy_epoch"] as string | null) ?? "UNKNOWN_POLICY") as PolicyEpoch,
        selectionPolicyVersion: (m["selection_policy_version"] as string | null) ?? null,
      } satisfies StageRow;
    });
  },
};
