# Scanner: MOMENTUM as descriptive tag + reservation rebalance

Small selection correction. No new APIs, signals, scoring formulas, AI, security logic, or setup types. Priority weights and formulas stay untouched. Historical runs and per-run config snapshots stay immutable.

## Current behavior (verified in code)

- `lanes.ts` `setupRejection()` returns early with `"Setup disabled in strategy settings."` when `cfg.enabled` is false — so a disabled MOMENTUM is **never classified**, and no candidate can carry the MOMENTUM tag.
- `config.ts` defaults: reservations BASE 10 / MOMENTUM 0 / REACCEL 8; normalization already zeroes reservations for disabled setups.
- `evaluate.ts` `selectSurvivorsWithReservations()` already gives disabled setups a 0 quota, and the global pool loop already iterates **all** eligible candidates — so a MOMENTUM-only candidate can already be selected globally. No selection-logic change needed.
- Normal Scanner tabs already derive from `enabledSetups()`; disabled setups live under Calibration (`shared.ts`, `scanner.tsx`).
- Table primary badge renders `lanes[0]`, and `lanes` is built in `SETUP_TYPES` order, currently `["MOMENTUM", "BASE", "REACCEL"]` — so a dual-match candidate would show MOMENTUM first unless ordering changes.

## Changes

1. **Classification independent of `enabled`** (`services/scanner/lanes.ts`)
   - Remove the `enabled` early-rejection from `setupRejection()`. Every candidate is evaluated against every setup's observable conditions; `enabled` now governs only survivor reservations and tab visibility.
   - Result: a candidate satisfying both BASE and MOMENTUM is stored/displayed as `BASE + MOMENTUM`; a MOMENTUM-only candidate keeps the MOMENTUM tag (descriptive, zero score impact) and competes in the global pool like NONE.

2. **Default reservations** (`services/scanner/config.ts`)
   - `WINGMAN_DEFAULT_SETTINGS.reservations`: BASE **15**, REACCEL **8**, MOMENTUM **0** (standalone).
   - Existing normalization already forces 0 for any disabled setup; unused capacity keeps flowing to the global Quantitative Research Priority pool.

3. **Display ordering** (`services/scanner/types.ts`)
   - Reorder `SETUP_TYPES` to `["BASE", "MOMENTUM", "REACCEL"]` (matching the existing `SETUP_RESERVATION_ORDER`) so the primary lane badge shows BASE for BASE + MOMENTUM candidates, with MOMENTUM visible via the existing `+N` badge and the drawer's full lane list.

4. **Tests** (`services/scanner/calibration.test.ts`, plus any affected assertions in `scanner.test.ts` / `workbench.test.ts`)
   - Replace the outdated "never classifies into a disabled MOMENTUM" expectation with the new behavior.
   - New regression test: a candidate satisfying both BASE and MOMENTUM conditions keeps lanes `BASE + MOMENTUM` while standalone MOMENTUM selection is disabled, and its BASE classification is never lost.
   - Test: disabled MOMENTUM holds no reservation (`laneUsage.MOMENTUM === 0`) and a MOMENTUM-only candidate can still be selected via the global pool.
   - Test: default reservations are exactly BASE 15 / REACCEL 8 / MOMENTUM 0; re-enabling MOMENTUM restores configurability.

## Deliberately unchanged

- Quantitative Research Priority weights/formulas, BASE and REACCEL thresholds, the universal live-market (`NO_VALID_DEX_MARKET`) gate, evidence schema, historical scan rows and config snapshots, normal-tab filtering, and the Strategy Settings UI (MOMENTUM stays editable under Calibration).

## Verification

- Full vitest suite, typecheck, production build, and a browser check of `/scanner` (BASE tab shows BASE primary badge with `+1` for dual-match candidates; MOMENTUM visible under Calibration).
