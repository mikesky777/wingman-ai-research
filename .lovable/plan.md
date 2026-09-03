# Outcome tracking from first Wingman call

Track what happened to every token *after* Wingman first selected it as a Survivor, using only data already stored. This is historical price/market-cap performance after a call — never a simulated trade return, and never an input to scoring.

## Definition of "first call"

The earliest **completed** scan run in which the token was selected as a Survivor (selected by setup reservation or global ranking). Discovery, ranking, or near-miss appearances never establish a call. Once established, the baseline is frozen: later Survivor appearances never overwrite it.

## Data sources (already immutable)

- `scan_candidates` — one row per token per run, already storing `price_usd`, `market_cap`, survivor selection flags. This is the call ledger.
- `token_snapshots` — append-only market history used for max/min/current values.
- `scan_runs.completed_at` — the authoritative call timestamp.

No provider calls are added; nothing is refetched.

## New stored table: `token_call_outcomes`

One row per token that has ever been a Survivor.

Baseline (write-once, never updated):
`token_id`, `first_call_scan_id`, `first_call_at`, `first_call_price_usd`, `first_call_market_cap_usd`

Derived (recomputed after each scan):
`current_price_usd`, `current_market_cap_usd`, `price_change_since_first_call_pct`, `market_cap_change_since_first_call_pct`, `max_price_since_first_call`, `max_market_cap_since_first_call`, `max_gain_since_first_call_pct`, `min_price_since_first_call`, `min_market_cap_since_first_call`, `max_drawdown_since_first_call_pct`, `elapsed_minutes_since_first_call`, `last_evaluated_at`

Horizon future-proofing: a `horizons jsonb` column holding `{ "1h": {...}, "6h": {...}, "24h": {...}, "3d": {...}, "7d": {...}, "30d": {...} }`, each entry `{ priceUsd, marketCap, changePct, sourceCapturedAt }` or `null` when no snapshot exists in that window. Populated from the same snapshot scan, so later debrief work needs no schema change. No AI, no scoring, no learning agent.

Missing evidence stays `null`; a missing price is never coerced to 0, and percentages are `null` when the baseline is missing or zero.

Access: public read (same as other scanner tables), writes service-role only.

## Computation

A pure module `src/lib/wingman/services/outcomes/first-call.ts`:

- `deriveFirstCall(appearances)` — picks the earliest completed-run Survivor appearance.
- `deriveOutcome({ baseline, snapshots })` — filters snapshots to `capturedAt >= first_call_at`, then computes current/max/min/change/drawdown and horizon buckets. Max gain and drawdown consider only post-call snapshots (the baseline itself included as the reference point).

A server-only writer runs at the end of each scan (after persistence, outside all selection logic): for each survivor of that run, insert a baseline if none exists (`ON CONFLICT DO NOTHING` on `token_id` so the baseline can never be reset), then refresh derived fields for the touched tokens.

Because the derivation lives downstream of ranking, filtering, setup classification and survivor selection, and nothing reads it back into the pipeline, outcomes cannot influence scanner behavior.

## UI

- Candidate table: a compact `SINCE CALL` column showing market-cap change from first call (e.g. `+91%`), green/red/neutral tone, `—` when unknown. Market cap is the primary value; price change appears in the drawer.
- Candidate drawer: a new "Since first Wingman call" block with First called (absolute + elapsed), First-call MC, Current MC, Change since call, Max MC since call, Max gain since call, Max drawdown since call, plus a short caption: *Historical market behavior after Wingman's first Survivor selection — not a backtested trade return.*
- Rows with no call yet show nothing in the column.

## Tests

New `first-call.test.ts` and outcome tests covering:
- first Survivor selection establishes the baseline permanently
- repeat Survivor appearances leave the baseline byte-identical
- pre-Survivor discovery/ranking appearances never establish a call
- price and market-cap change percentages are computed correctly
- max gain / max drawdown use only snapshots at or after first call
- missing price/MC yields `null` / UNKNOWN, never `0`
- priority, setup classification and survivor selection are identical with and without outcome data present

## Technical notes

Files added: migration for `token_call_outcomes`, `services/outcomes/first-call.ts`, `services/outcomes/outcome-persistence.server.ts`, tests. Files edited: `scanner/pipeline.server.ts` (post-persistence hook only), `services/scanner-service.ts` (read outcomes for the current run's candidates), `components/wingman/scanner/shared.ts`, `routes/scanner.tsx`, `CandidateDrawer.tsx`. No provider, formula, threshold or schema change to existing scanner tables.
