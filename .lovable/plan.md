# Scanner Setup Taxonomy v2 + Editable Strategy Settings

Replace the four lifecycle lanes with three observable setup types (MOMENTUM, BASE, REACCEL) plus an explicit NONE state, and make every setup threshold editable and persisted. Setup labels describe market behavior only — not thesis, safety, or buy signals. No new APIs, AI, signals, or scoring-weight changes.

## 1. Taxonomy

New scans classify candidates as MOMENTUM, BASE, REACCEL — a candidate may match several. A candidate that passes hard filters but matches none gets `setup = NONE`: still ranked, still eligible for survivor selection, never auto-rejected. NONE is neutral, and exists so undefined setup families stay discoverable.

Legacy scans keep their stored `EARLY_MOMENTUM` / `POST_BOND_BASE` / `DEVELOPING_THESIS` / `REACCELERATION` values and remain readable; nothing historical is rewritten or migrated. New scans record a bumped scanner/config version, and the UI shows which version produced a scan.

## 2. Wingman Default v1

| Setup | Age | Market cap | Last trade | Activity | Other |
| --- | --- | --- | --- | --- | --- |
| MOMENTUM | 3h – 72h | $30K – $500K | ≤ 15m | ACTIVE / ACCELERATING / EXTREME | Existing acceleration requirement; no persistence requirement |
| BASE | 12h – 10d | $30K – $500K (emphasis $30K–$200K) | ≤ 60m | ACTIVE / ACCELERATING / EXTREME | Turnover ≥ 12%; persistence MODERATE / HIGH / UNKNOWN; no acceleration requirement |
| REACCEL | 14d+, known age, no max | $30K+, no ceiling | ≤ 30m | ACCELERATING / EXTREME | Baseline acceleration ≥ 1.4; reacceleration EARLY / CONFIRMED / EXTREME |

Notes carried into the code comments and UI copy:

- MOMENTUM requires real acceleration — youth alone never qualifies a token. The 3h floor excludes the least-evidenced launch window; the 72h ceiling leaves room for delayed ignition.
- BASE is about survival and persistence, not bonding mechanics. Low or neutral acceleration is fine. The $30K–$200K band is a displayed *strategy emphasis*, not an eligibility gate, and adds no priority points; $200K–$500K stays fully eligible. UNKNOWN persistence stays eligible but is rendered visibly distinct from demonstrated MODERATE/HIGH.
- REACCEL means materially renewed activity versus the token's own baseline, at any size, old only.
- NONE has no setup window of its own beyond the global hard filters and gets no reservation.

## 3. Editable Strategy Settings

A compact "Strategy Settings" panel in the Scanner, one card per setup, exposing only the fields that setup actually uses: min/max age, min/max market cap, min liquidity, min recent + 24h volume where supported, min turnover, max minutes since last trade, allowed activity states, min acceleration, allowed persistence states, allowed reacceleration states. Null means "no limit" (REACCEL max age, REACCEL max market cap). No internal scoring weights are exposed.

Save and "Reset to Wingman Defaults" buttons. Validation blocks min > max on age and market cap, negative values, and unsupported state selections. The active configuration is persisted in the backend and every new scan reads it at start.

## 4. Reproducibility

Each `scan_run` stores an immutable JSON snapshot of the exact configuration used: scanner version, config version, MOMENTUM/BASE/REACCEL filters, survivor reservations, and the global survivor limit. Editing Strategy Settings never touches past runs; historical scans display the configuration and version they actually ran under.

## 5. Survivor selection

Reservations become BASE 10, MOMENTUM 10, REACCEL 8, filled deterministically. Unused capacity returns to the global pool, which is filled by Quantitative Research Priority and includes both setup-classified and NONE candidates. A token matching several setups consumes exactly one survivor slot.

## 6. Priority formula

Unchanged weights and formulas. Only lifecycle-fit references are remapped: EARLY_MOMENTUM → MOMENTUM, POST_BOND_BASE → BASE, REACCELERATION → REACCEL; DEVELOPING_THESIS-specific lifecycle behavior is removed. NONE candidates rank globally but receive no setup/lifecycle-fit credit for being NONE. The emphasis band grants no points.

## 7. UI

Default filters become SURVIVORS · BASE · MOMENTUM · REACCEL. Candidates show one or more setup badges (e.g. BASE + MOMENTUM) or NONE. BASE candidates inside the emphasis band get a descriptive `CORE MC RANGE` marker with no scoring effect. All Candidates and Near Misses stay available under Calibration. No wider redesign.

## 8. Fixtures and tests

Fixtures represent generic behaviors, not token replicas, and remain sanity checks only — never scoring templates: a low-cap persistent post-launch token surviving as BASE, a low-cap accelerating young token as MOMENTUM, an older renewed-activity token as REACCEL, and a healthy token matching none surviving as NONE.

Tests cover: legacy lane names replaced for new scans and DEVELOPING_THESIS never assigned; NONE never auto-rejects; MOMENTUM age bounds, acceleration requirement, and youth-alone rejection; BASE age bounds, low-acceleration qualification, persistence/turnover/activity conditions, $200K–$500K eligibility, and emphasis-band neutrality in priority; REACCEL known-age requirement, min age, no MC ceiling, and baseline/reacceleration evidence; BASE+MOMENTUM overlap; reservations not duplicating tokens; unused reservation capacity returning to the global pool; NONE receiving global survivor slots; settings changes affecting new scans but never historical configs; and every new run storing an immutable config snapshot.

## 9. Technical notes

- New table `scanner_strategy_settings` (single active row: name, config jsonb, is_default, timestamps) — public read, service-role write, explicit grants, RLS on, matching the other scanner tables.
- `scan_runs` gains `config_snapshot jsonb` plus `config_version`; existing rows stay untouched and render as legacy.
- `src/lib/wingman/services/scanner/config.ts` becomes the Wingman Default v1 source and the shape of a settings record; `types.ts` gains the `SetupType` union (`MOMENTUM | BASE | REACCEL`) with a legacy-lane display mapping for old scans.
- `lanes.ts` → setup evaluation reading the run's resolved config; `evaluate.ts` keeps ranking deterministic and stops treating "no setup" as a rejection; `pipeline.server.ts` resolves the active settings once per run and writes the snapshot.
- Settings read/save go through `createServerFn` with zod validation; the browser never writes these tables directly.
- Existing evidence, snapshots, tokens, and historical scan rows are left intact.
