# Universe Eligibility + Refresh Correction

Two foundational scanner changes. No new provider APIs, no AI, no thesis scoring, no structural-security rules, no chart analysis, no Quantitative Research Priority changes. Existing scan history and stored run configs stay immutable (new columns are nullable/defaulted; historical rows are never rewritten).

## Audit findings (verified against the latest completed run)

Latest completed run: 357 candidates.

- REACCEL is surfacing assets outside the Solana meme/speculative mandate. Confirmed in that run: liquid-staking assets (JitoSOL, JupSOL), stable-style assets (USDe, JupUSD, USWR), wrapped/bridged majors (WETH, ZEC, HYPE), and an LP/receipt-style asset (xORCA).
- Refresh is inert: all 357 candidates stored `REFRESH_REQUIRED`, `last_enriched_at` null, `evidence_age_minutes` null, no persisted `refreshReason`, zero `CARRY_FORWARD`, zero requests avoided — even though 69 of those candidates carried prior snapshot history (`history_snapshot_count > 0`) and 131 recent snapshots exist for the run's tokens.
- Root cause is not yet confirmed. The wiring reads the loaded snapshot history and should have produced non-null values for those 69, so the two candidate explanations are (a) history not reaching the refresh derivation, or (b) the stored run predating the active wiring. Confirming this is the first step of the work, before any behavior change.
- Refresh is candidate-wide by construction, derived from market-snapshot age only. Survivor enrichment executes exactly one DexScreener market call; holders/creator/provenance have no scan-time refresh path at all.

## 1. Universe Eligibility

New deterministic per-candidate field: `IN_SCOPE`, `OUT_OF_SCOPE`, `UNKNOWN`. Mandate eligibility only — not thesis, quality, safety, or a priority input.

Classification evidence, in order:
1. exact verified mint-address registry;
2. authoritative existing metadata/evidence about the candidate token's own asset type.

Never fuzzy name/ticker matching. Never "resembles a known protocol". Never from the pair's quote/base role — trading against SOL/USDC/USDT/hyUSD proves nothing about the candidate itself. Anything short of high-confidence is `UNKNOWN` and stays fully eligible; false negatives are preferred over false positives.

Registry lives in one module, each entry: exact mint, category (`STABLE_ASSET`, `WRAPPED_ASSET`, `LIQUID_STAKING`, `RECEIPT_OR_LP`, `OTHER_FINANCIAL_PRIMITIVE`), short note/provenance. Every seeded mint is verified against mints already stored in Wingman data — never inferred from a symbol.

Placement: identity/live-market resolution → Universe Eligibility → hard/setup evaluation → survivor selection. `IN_SCOPE` and `UNKNOWN` continue normally. `OUT_OF_SCOPE` is excluded from setup qualification and survivor selection, but stays persisted with rejection reason `OUT_OF_SCOPE_ASSET`, its category, and the evidence used. Already-derived quantitative metrics/priority are still persisted for diagnostics; no points are subtracted.

UI: no new main tab. Eligibility, category/reason and evidence in the candidate drawer; Calibration filters for IN_SCOPE / OUT_OF_SCOPE / UNKNOWN, with UNKNOWN styled neutrally, never as failure. Run diagnostics: counts per state plus OUT_OF_SCOPE breakdown by category.

## 2. Refresh correction

Confirm and report the root cause of the blanket `REFRESH_REQUIRED`: where `last_enriched_at` is sourced, whether stored observations reach the derivation, why age and `refreshReason` are missing, and whether the audited run predates the wiring. Fix whatever the confirmation shows, and persist `refreshReason` for every decision.

## 3. Per-domain refresh model

Replace the single candidate-wide decision with a per-domain plan over `market`, `holders`, `creator`, `provenance`, each with its own freshness window drawn from the existing centralized freshness config. A stale market never invalidates still-valid holder, creator or provenance evidence.

Domain states: `REFRESH_REQUIRED`, `REFRESH_OPTIONAL`, `CARRY_FORWARD`, `NO_EVIDENCE`. A domain with no stored evidence reports `NO_EVIDENCE` — never `CARRY_FORWARD`. Candidate-level state stays for compact UI and is derived as the most urgent applicable domain state. Machine-readable reasons: stale evidence, no prior evidence, recurrence requires refresh, within freshness window, approaching expiry.

Recurrence state must not automatically force every evidence domain to refresh. NEW / CHANGED / RETURNING may contribute to a domain's refresh decision only where relevant; still-valid unrelated domain evidence may remain CARRY_FORWARD. For example, a market-driven CHANGED state must not by itself invalidate fresh holder evidence.


## 4. Carry-forward and enrichment

Carried evidence reuses the original persisted observation with its original `captured_at`, `observed_at` and source; no duplicate rows, no fabricated observation time, and carried evidence stays visibly distinguishable from freshly observed evidence.

Only refreshes that are due *and* supported today execute: market may call DexScreener; holders, creator and provenance make no scan-time calls in this iteration. A candidate may hold mixed domain states without forcing unrelated calls.

## 5. Diagnostics

Per run: candidates requiring any refresh, candidates using carried evidence, refresh counts per domain, external provider requests actually executed, and requests actually avoided. Domains carried forward and calls avoided are counted separately — a carried holder domain is not an avoided request, because the scanner would not have called holders anyway.

## 6. Candidate detail UI

Table stays compact and keeps the existing candidate-level badge. The drawer gains a per-domain breakdown: state, evidence age, TTL, reason, last enrichment time where applicable, and whether the evidence is fresh or carried.

## Technical notes

- New `src/lib/wingman/services/scanner/universe.ts`: exact-mint registry, pure classifier, category/reason generation.
- `refresh.ts`: add `EvidenceRefreshDomain`, per-domain freshness state and `deriveRefreshPlan(...)`, preserving existing market-domain `deriveRefreshState` semantics.
- Migration (nullable/defaulted only): `scan_candidates.universe_eligibility`, `universe_category`, `universe_reason`, `refresh_domains jsonb`; `scan_runs.universe_diagnostics` plus refresh diagnostics fields as needed.
- Wiring: `pipeline.server.ts`, scanner persistence mapping, `scanner-service.ts`, scanner shared labels/types, `scanner.tsx`, `CandidateDrawer.tsx`.
- `roadmap.md` gains this task; Structural Eligibility is explicitly out of scope.

## Tests

Universe: exact verified mint yields OUT_OF_SCOPE; OUT_OF_SCOPE stays persisted; cannot qualify BASE/REACCEL; cannot consume a Survivor slot; UNKNOWN fully eligible and behaviorally identical to an eligible candidate; fuzzy name/ticker never excludes; quote/base role alone never excludes; historical rows unchanged; priority formula untouched.

Refresh: stale market refreshes independently; stale market leaves fresh holder evidence carried; carried holder evidence keeps original timestamps and source; stale holder evidence becomes due independently; absent holder evidence reports NO_EVIDENCE; carried evidence does not change priority; refresh does not change setup classification; recurrence and setup remain independent; request diagnostics accurate, with only genuinely executable requests counted as avoided; historical scans immutable.
