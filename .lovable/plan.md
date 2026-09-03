# Universe Eligibility + Refresh Correction

Two small foundational scanner changes. No new provider APIs, no AI, no thesis scoring, no structural-security rules, no chart analysis, no Quantitative Research Priority changes. Existing scan history and stored run configs stay immutable.

## What the audit found (verified against the latest completed run)

Latest completed run: 357 candidates.

1. REACCEL is surfacing assets outside Wingman's Solana memecoin mandate. Confirmed in that run: JitoSOL, JupSOL, xORCA (liquid staking / LP-style), USDe, JupUSD, USWR (stable-style), WETH, ZEC, HYPE (wrapped / bridged majors).
2. Refresh state is currently all-or-nothing and effectively inert: every one of the 357 candidates was stored as `REFRESH_REQUIRED` with `last_enriched_at = null` and no `evidence_age_minutes`, even though 69 of them had prior Wingman snapshots and 131 recent snapshots exist for the run's tokens. `refreshReason` was also absent from every stored `recurrence_detail`. So no candidate ever reached `CARRY_FORWARD` and zero provider requests were actually avoided.
   The cause is not yet confirmed — the wiring reads the loaded snapshot history, so either the history is not reaching the refresh step or the stored run predates the wiring. Step 1 of the work is to confirm it before changing behavior.
3. Refresh is candidate-wide by construction: one decision per candidate, derived from the age of the newest market snapshot. Survivor enrichment currently performs exactly one DexScreener market call; there is no holder/creator/provenance refresh path in the scan pipeline at all. Nothing today invalidates non-market evidence — but the model has no domain separation, so it would as soon as another domain is enriched.

## 1. Universe Eligibility

New deterministic field on every candidate: `IN_SCOPE`, `OUT_OF_SCOPE`, `UNKNOWN`. Mandate eligibility only — never a quality judgement.

`OUT_OF_SCOPE` is assigned only from:
- an exact, verified mint-address registry (wrapped assets, stable-style assets, liquid-staking tokens, exchange/infrastructure tokens), each entry carrying a machine-readable category and a note; or
- high-confidence existing evidence already stored (for example a resolved quote-token role indicating the asset is itself a quote/pegged asset).

No fuzzy name or ticker matching, ever. Anything not matched is `UNKNOWN` and stays fully eligible.

Placement: after token identity and live-market resolution, before setup classification and survivor selection. `OUT_OF_SCOPE` candidates are still persisted with rejection reason `OUT_OF_SCOPE_ASSET` plus the category, so calibration keeps them. They are excluded from setup qualification and survivor selection.

Visibility: eligibility badge and reason in the candidate drawer, an eligibility filter in Calibration, and per-run diagnostics counting in-scope / out-of-scope / unknown with a breakdown by category.

## 2. Refresh correction

- Confirm and fix the reason `last_enriched_at` is never populated; persist `refreshReason` for every candidate.
- Replace the single candidate-wide decision with per-domain decisions: `market`, `holders`, `creator`, `provenance`. Each domain gets its own freshness window (centralized config) and its own state. A stale market never invalidates holder, creator or provenance evidence.
- The candidate-level state stays for display and is derived as the most urgent domain state, so the existing UI keeps working.
- Carry-forward still reuses stored observations exactly as they are: no rewritten `captured_at`, `observed_at` or source, no duplicate observations, no fabricated freshness.
- Enrichment executes only the domains that are due. Today only `market` has a scan-time enrichment path, so no new provider calls are introduced.
- Diagnostics per run: refresh candidates, carried-forward evidence, refreshes per domain, requests executed and requests avoided.
- Compact per-domain refresh detail in the candidate drawer.

## Technical notes

- New `src/lib/wingman/services/scanner/universe.ts` (pure registry + classifier) and its unit tests; registry entries are exact mints with category and note.
- `refresh.ts` gains `EvidenceRefreshDomain`, per-domain windows and a `deriveRefreshPlan` returning domain states plus the derived candidate state; existing `deriveRefreshState` semantics preserved for the market domain.
- Migration: add `universe_eligibility`, `universe_category` to `scan_candidates`, plus `refresh_domains` (jsonb) for the per-domain plan; add `universe_diagnostics` to `scan_runs`. Nullable/defaulted, no historical rows rewritten.
- Wiring in `pipeline.server.ts` (eligibility gate after `resolveMarkets`, per-domain refresh before enrichment), persistence mapping, `scanner-service.ts` read model, `shared.ts` labels, `scanner.tsx` Calibration, `CandidateDrawer.tsx`.

## Tests

Exact-mint exclusion; `UNKNOWN` stays eligible; fuzzy name/ticker never excludes; out-of-scope candidates remain persisted with reason and category; historical rows unchanged; domain-independent refresh (stale market leaves holders fresh); timestamp and source preservation on carry-forward; priority and setup classification invariant to eligibility and refresh; request-diagnostics accuracy.
