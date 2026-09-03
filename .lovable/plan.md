# Scanner outcome tracking: First Seen and First Wingman Call

Track what happened to every token the scanner has ever persisted as a candidate — not only Survivors — so false positives, false negatives and missed runners are all preserved. Purely observational: historical market behavior after Wingman observed or selected a token, never a simulated or backtested trade return, and never an input to scoring.

## Two immutable milestones per token

**First Seen** — earliest completed scan in which the token appears in `scan_candidates`, regardless of setup, rank, near-miss status or selection. Stores scan id, timestamp, price, market cap. Written once, never overwritten.

**First Wingman Call** — earliest completed scan in which the token was selected as a Survivor (`selected_by_lane_reservation` or `selected_by_global_ranking`). Ranking, setup qualification or near-miss status never establish a call. Written once; repeated Survivor appearances never reset it. A token may keep null call fields forever.

## Coverage audit (already run against stored data)

- `scan_candidates`: 6,070 rows over 20 completed runs, 1,680 distinct tokens, market cap present on 6,062 rows, price on 5,367.
- `token_snapshots`: 759 rows. All 305 survivor tokens have snapshots; only 249 of 1,585 non-survivor tokens do.

Snapshot coverage is therefore survivor-biased and cannot be the sole source. Candidate rows are the broad observation series; snapshots are the higher-fidelity series for enriched tokens.

**Deterministic source precedence** for the observation series of a token: union of (a) `scan_candidates` rows joined to their run's `completed_at`, and (b) `token_snapshots` rows by `captured_at`. Observations are keyed by timestamp bucket (same second); when both sources land in the same bucket, `token_snapshots` wins because it comes from a direct provider pull. Sorted ascending, deduplicated — no double counting, no interpolation, no new provider calls.

## New table: `token_scanner_outcomes`

One row per scanner-observed token, unique on `token_id`.

Frozen baselines: `first_seen_scan_id`, `first_seen_at`, `first_seen_price_usd`, `first_seen_market_cap_usd`, `first_call_scan_id`, `first_call_at`, `first_call_price_usd`, `first_call_market_cap_usd`.

Derived for all tokens: `current_price_usd`, `current_market_cap_usd`, `price_change_since_first_seen_pct`, `market_cap_change_since_first_seen_pct`, `max_price_since_first_seen`, `max_market_cap_since_first_seen`, `max_gain_since_first_seen_pct`, `min_price_since_first_seen`, `min_market_cap_since_first_seen`, `max_adverse_change_since_first_seen_pct`, `max_peak_to_trough_drawdown_since_first_seen_pct`.

Derived when a call exists: the same set suffixed `_since_first_call` (`price_change`, `market_cap_change`, `max_price`, `max_market_cap`, `max_gain`, `min_price`, `min_market_cap`, `max_adverse_change`, `max_peak_to_trough_drawdown`).

Plus `elapsed_minutes_since_first_seen`, `elapsed_minutes_since_first_call`, `observation_count`, `last_evaluated_at`.

Horizons: `horizons_since_first_seen jsonb` and `horizons_since_first_call jsonb`, each keyed `1h / 6h / 24h / 3d / 7d / 30d` with `{ priceUsd, marketCap, changePct, sourceCapturedAt, offsetMinutes }` or `null`. An entry is filled only by the nearest stored observation inside a centralized tolerance window per horizon (e.g. ±10m for 1h, scaling up for longer horizons); otherwise it stays null. Never interpolated or fabricated.

Every missing value stays `null` / UNKNOWN — never coerced to 0. Percentages are null when a baseline value is missing or zero.

Access: public read like other scanner tables; writes service-role only.

## Computation and writer

Pure module `src/lib/wingman/services/outcomes/outcomes.ts`:
- `buildObservationSeries(candidateRows, snapshotRows)` — merge, dedupe, sort by the precedence rule above.
- `deriveMilestones(appearances)` — earliest completed-run appearance = First Seen; earliest completed-run survivor appearance = First Call.
- `deriveOutcome({ baselineAt, baselinePrice, baselineMc, series, horizonConfig })` — current/max/min/change, max adverse change (worst point vs baseline), peak-to-trough drawdown (worst decline from a post-baseline peak), plus horizon buckets. Only observations at or after the baseline are considered.

Server-only writer `outcome-persistence.server.ts`, invoked from `pipeline.server.ts` **after** `persistCandidates` and after run completion accounting: insert-once First Seen for every persisted candidate, insert-once First Call for every Survivor (`ON CONFLICT DO NOTHING` on the baseline columns so neither can be reset), then recompute derived fields and horizons for the touched tokens. A one-time backfill of existing history runs from the same pure code path.

Nothing in the pipeline reads outcomes back: priority, hard filters, setup classification, reservations and survivor selection are untouched.

## UI

- Candidate table: compact `SINCE SEEN` column (market-cap % change, e.g. `+91%`), and `SINCE CALL` shown only for tokens with a call. `—` when unknown; tone by sign.
- Candidate drawer block "Outcome since Wingman observation": First seen (absolute + elapsed), First-seen MC, Since-seen performance, First Wingman call (or "Never selected"), First-call MC, Since-call performance, Max gain, Max adverse change, Peak-to-trough drawdown, with the caption *Historical market behavior after Wingman observation/selection — not a simulated or backtested trade return.*

## Tests

- First candidate persistence establishes First Seen permanently; later runs never change it.
- Non-survivor appearances never establish First Call; a token can stay call-null forever.
- First Survivor selection establishes First Call; repeated survivor appearances leave it byte-identical.
- Price and market-cap change percentages computed correctly from baselines.
- Max gain, max adverse change and peak-to-trough drawdown use only observations at/after the relevant baseline, and differ correctly for seen vs call baselines.
- Observation merge is deterministic and does not double-count a candidate row and a snapshot in the same bucket.
- Horizons resolve to the nearest observation inside tolerance and stay null outside it; never interpolated.
- Missing price/MC yields null/UNKNOWN, never 0.
- Priority, setup classification and survivor selection are identical with and without outcome data present.

## Notes on future use

The stored shape supports later analysis of false positives/negatives, missed runners, selection timing, First Seen → First Call performance gap, setup outcomes, recurrence outcomes and fixed-horizon scanner performance. No AI learning, threshold optimization or outcome-based scoring in this iteration.

## Files

Added: migration for `token_scanner_outcomes`, `services/outcomes/outcomes.ts`, `services/outcomes/outcome-persistence.server.ts`, `services/outcomes/outcomes.test.ts`, backfill server function. Edited: `scanner/pipeline.server.ts` (post-persistence hook only), `services/scanner-service.ts` (read outcomes for displayed candidates), `components/wingman/scanner/shared.ts`, `routes/scanner.tsx`, `CandidateDrawer.tsx`. Also add a `roadmap.md` entry for this iteration. No change to existing scanner tables, formulas, thresholds or providers.
