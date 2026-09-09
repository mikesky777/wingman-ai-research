# Wingman roadmap

## In progress
- [ ] Full Cycle v1.1: durable acceptance, cycle-linked scan startup, real worker heartbeat/progress, backend-owned immediate stage chaining (watchdog recovery-only), and backend-bound UI states.
- [ ] Full Cycle v1.1 clarification: scan-execution ownership/heartbeat, timeout-vs-failure separation, cycle-scoped scan uniqueness that leaves manual Run Scan untouched, heartbeat kept out of the event ledger.
- [x] Scanner outcome tracking: First Seen + First Wingman Call baselines, derived performance, fixed horizons, table/drawer UI, tests.

## Later
- [ ] Backfill outcomes over full scanner history (run once via `backfillOutcomes`).
- [ ] Outcome/debrief analysis surfaces: false positives, false negatives, missed runners, selection timing, setup and recurrence outcomes.
- [x] AI Thesis Synthesis v1 (`thesis_synthesis/v1`): component scores, Evidence Confidence, verdict, opportunity policy, THESIS_CALL. Outcomes never feed scoring.
- [ ] Entry State, then bankroll sizing bands and structural-risk multipliers (deferred until thesis calibration is signed off).

## Outcome collection
- [x] Phase 1H `outcome_sampler/v1`: scheduled 5-minute market-observation sampler, centralized DexScreener rate-limit controller, staleness-driven selection, coverage states, History reads persisted data only.

## Evidence foundation
- [x] Phase 3A.0 `evidence/v1.1`: generic affiliation, attributionStatus (RESOLVED_MINT | UNRESOLVED_TOKEN_ATTRIBUTION), collectionHealth, nullable token linkage for unresolved observations, versioned feature-key convention. Zero production decision effect.
- [ ] Phase 3A.1: generic decision-time learning feature layer for Calibration.
- [x] Phase 3A.2 `outcome_enrollment/v1`: evaluation-only enrollment ledger (`outcome_enrollments`, `outcome_enrollment_strata`). Exhaustive setup-qualified/survivor + all triage classes (SKIP/WATCH/DEEP) at same-stage same-time baselines; deterministic stratified Scanner-reject sampling shipped DISABLED (capacity: 48 healthy scans/7d x 24 = ~2.45x current 796 tracked mints, above the 2x ceiling). Zero production decision effect.
