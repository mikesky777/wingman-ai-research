# Full Cycle v1.1 — stuck-run repair and permanent hardening

## Current production forensics

- Preserve and repair cycle `1f808799-f95a-48b9-9000-133e3829dfa3`; do not create a replacement run.
- It was accepted at `2026-09-07 22:20:24.156647+00`, is persisted as `SCANNING`, has no persisted cycle error, and currently has no attached `scan_run_id`.
- The watchdog claimed it as `worker-aeos95k7` at `2026-09-07 22:21:01.887+00`; the lease was written through `22:36:01.887+00` and the cycle row last updated at `22:21:01.938671+00`.
- Scanner row `c6ca17c3-ce46-4b8f-8bd4-2bc00febe3eb` was created at `22:21:02.131425+00` and remains `running`, with no completion, error, provider telemetry, candidates, packets, triage, or Entry artifacts. No paid downstream work occurred and no duplicate downstream artifacts were created.
- The worker request timed out after 600 seconds. The scan ID was only going to be attached to the cycle after the entire scanner returned, so the durable scan existed but the cycle still showed none.
- The 15-minute lease was renewed only before scanner execution, not during it. Until expiry the watchdog classified the dead/timed-out pass as healthy and did nothing.
- The Full Cycle start action itself returns after the cycle insert, but its page mutation has no acknowledgement timeout, no explicit success/error display, and discards the returned cycle ID. This leaves a second independent ambiguous-loading path when the response is lost.

## Implementation

### 1. Durable acceptance and singleton behavior

- Keep the start action short: atomically resolve the one active cycle or insert one, then return `STARTED` or `PRODUCTION_CYCLE_ALREADY_RUNNING` with its durable ID.
- Keep the existing partial unique rule so only nonterminal cycles block starts; verify COMPLETE and FAILED rows cannot retain a claim or block a later cycle.
- Record requested/accepted timestamps and a concise startup event without launching long work in the browser request.

### 2. Durable scan startup and scan-execution ownership

- Split scanner run creation from scanner execution.
- Create the scan row first, attach its ID to the cycle, then claim scanner execution, then begin provider work.
- Scope cycle-to-scan uniqueness to cycle-linked scans only, so at most one authoritative scan exists per cycle while ordinary manual scans keep working with no cycle and no new constraint.
- Give scanner execution its own durable owner/heartbeat, separate from the parent cycle claim, so recovery can tell a genuinely live scan from a dead one and never duplicates provider work.
- On recovery: reuse the exact linked scan; completed advances, terminally failed persists cycle failure, live execution waits, and lost execution with no terminal artifact is resumed idempotently without a second scan.

### 3. Backend-owned progression, ownership, and heartbeat

- Normal progression is immediate and backend-owned: after a bounded idempotent stage persists its result, the backend dispatches the next eligible stage itself through a durable server-side handoff. A healthy cycle never waits for a scheduler tick between stages, and the browser is never involved.
- Each stage runs as its own bounded backend invocation, so no single request carries the whole pipeline.
- The once-a-minute watchdog stays recovery/dispatch safety only: find the active cycle, judge liveness, do nothing when healthy, and otherwise claim the exact cycle, resume the next unfinished stage, and hand it back to normal progression.
- Add persisted fields for claim acquisition, worker heartbeat, meaningful progress, worker/pass status, recovery state/reason, and latest worker error. Heartbeat is a mutable liveness field, never an event row.
- Use a short renewable lease with a backend-only heartbeat during long stages. UI reads/polls never write any of these fields, and generic `updated_at` is never used as liveness.
- Release ownership on normal return and caught failure; if the process dies, the heartbeat stops and the lease expires so recovery can take over.

### 4. Restart-safe transitions and honest timeout semantics

- Before each stage, inspect the exact pinned canonical artifact and treat already-completed work as satisfied.
- Distinguish four outcomes explicitly: confirmed terminal stage/provider failure, lost worker/process, legitimately still-running stage, and unknown-but-recoverable. Only the first persists cycle failure.
- A request/HTTP wrapper reaching its timeout is never by itself a stage failure; when ownership disappears without a terminal artifact, recover idempotently instead.
- Preserve existing packet, triage, spend-control, Deep Research, Thesis, qualification, and Entry policies unchanged.
- Never repeat completed paid work. Preserve zero-Thesis-Call successful completion and no Sizing/Live/trading behavior.
- Record one event per meaningful transition only: accepted, claimed, stage entered, scan assigned, stage completed, stage failed, recovery started, ownership released, and cycle completed/failed.

### 5. Scanner and Full Cycle page state

- Bound the Full Cycle start request with a short acknowledgement timeout.
- Stop the button spinner as soon as the acknowledgement resolves; store/display the returned cycle ID and switch to persisted polling.
- If the response fails or times out, clear local pending state and immediately re-query for an accepted active cycle; attach to it if found, otherwise show an explicit failure and re-enable the button.
- Render persisted `STARTING`, `SCANNING`, `RECOVERING`, `STALLED`, `FAILED`, and terminal states in the cycle panel.
- Bind Scanner loading/results to the exact `scan_run_id` on the active cycle. A cycle without one displays “STARTING SCANNER,” never a fake scan. A failed or completed run clears loading automatically.

### 6. Repair the current cycle safely

- Associate existing scan `c6ca17c3-ce46-4b8f-8bd4-2bc00febe3eb` with existing cycle `1f808799-f95a-48b9-9000-133e3829dfa3` after validating their timestamps/state and absence of competing artifacts.
- Do not delete either row, create a new cycle/scan, or alter historical decisions.
- Resolve the stale scanner pass under the new recovery rules, then resume only the same cycle from its legitimate unfinished state.

## Technical details

- Apply one backend migration for the new lifecycle/diagnostic columns, cycle-to-scan uniqueness, event ledger, grants, RLS, indexes, and safe current-row repair.
- Refactor scanner orchestration to accept a pre-created run ID while retaining the existing manual Run Scan behavior.
- Keep the once-per-minute watchdog as recovery/dispatch only; each call performs at most one stage.
- Add bounded waits around potentially hanging worker operations so every request has a defined terminal outcome.

## Validation

- Add regression coverage for all 25 requested scenarios: successive cycles, terminal singleton release, fast acknowledgement, response-loss reconciliation, double click, pre/post-scan worker death, interrupted transition, lease expiry, read-only polling, healthy/stale watchdog behavior, exact scan binding, explicit startup failure, paid-stage idempotency, zero-call completion, and unchanged no-Live/no-Sizing/no-trading behavior.
- Run focused cycle/scanner tests, the full relevant test suite, TypeScript checks, build validation, backend security/lint checks, and browser verification of the Scanner page.
- Re-query the repaired cycle, linked scan, event trail, artifacts, and watchdog responses before reporting completion.
