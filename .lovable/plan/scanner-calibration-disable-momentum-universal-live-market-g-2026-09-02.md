# Scanner calibration: disable MOMENTUM + universal live-market gate

Calibration-only change. No new providers, signals, scoring formulas, AI, or security checks.

## 1. MOMENTUM off by default

- `WINGMAN_DEFAULT_SETTINGS.setups.MOMENTUM.enabled = false` (the `enabled` flag already exists and already rejects the setup in classification).
- Default reservations become `BASE: 10`, `REACCEL: 8`, `MOMENTUM: 0`.
- Survivor selection skips any disabled setup entirely: no reserved slots, no reserved contributions. Unused capacity flows to global Quantitative Research Priority exactly as today.
- The Scanner tab strip is built from the active strategy's enabled setups, so MOMENTUM disappears from the normal tabs while disabled. MOMENTUM stays inspectable in Calibration (All candidates / Near misses / settings panel) and stays fully editable — flipping `enabled` back on restores its tab and reservation.
- Historical runs are not reclassified: stored rows and legacy labels render unchanged.

## 2. Universal valid-market requirement (new scans only)

Before setup classification and survivor selection, every hard-filter-passing candidate must have a resolvable Solana DEX market from the existing DexScreener integration:

- valid Solana token identity (address validation already present),
- a resolved primary Solana pair via the existing deterministic pair selection,
- usable USD liquidity that is non-null and above the existing catastrophic-liquidity floor,
- usable market/trading evidence from that resolved pair.

Failure produces a new distinct rejection reason `NO_VALID_DEX_MARKET`, with the observed values recorded like every other rejection. Missing values stay `null` — never coerced to `0`, and a `null` is a rejection, not a pass.

Applies to BASE, REACCEL, NONE, and any future enabled setup.

### How it stays cheap

Resolution uses the existing batch endpoint (`/tokens/v1/solana/{addresses}`, 30 addresses per call) over the hard-filter survivors only, then the existing deterministic primary-pair selector on the returned pools. Roughly 5-10 extra provider requests per scan. Enrichment of selected survivors is unchanged. If the batch call itself fails, candidates in that chunk are marked market-unresolved for the run rather than silently passed.

## 3. Not in scope

Mint/freeze authority filtering is deliberately not added, and no authority state is inferred from providers that do not supply it. That belongs to the later Structural Eligibility layer.

## 4. Unchanged

Quantitative Research Priority weights, BASE thresholds, REACCEL thresholds, NONE/global eligibility (beyond the new market gate), evidence schema, historical scan data.

## 5. Tests

New/extended unit tests covering:

- MOMENTUM disabled in the shipped defaults, with reservation 0.
- Disabled MOMENTUM contributes no reserved survivors and is absent from the normal tab set.
- Re-enabling MOMENTUM in settings restores classification, reservation, and tab.
- BASE / REACCEL / NONE behave exactly as before.
- No resolvable Solana pair → `NO_VALID_DEX_MARKET`.
- Missing liquidity / market data is not treated as zero.
- Historical run fixtures render with legacy labels and unchanged classification.

## Files touched (expected)

`services/scanner/config.ts`, `services/scanner/hard-filters.ts` (or a new small `market-eligibility.ts`), `services/scanner/evaluate.ts`, `services/scanner/pipeline.server.ts`, `routes/scanner.tsx`, plus scanner tests.
