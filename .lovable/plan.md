# Scanner → Research Handoff: Audit Result and Fix

## What the data actually shows

I checked the live records before proposing anything.

- The newest scan on record is still `ddd7102e…`, started 17:05 UTC and completed 17:06 UTC today, 362 discovered, healthy, current scanner policy, 44 research packets.
- The newest scanner candidate row was written at **17:06:38 UTC** and carries scan id `ddd7102e…`. Nothing was written after that.
- There is **no scan record at all** after 17:06 — not a completed one, not a failed one.
- The new triage run `3714f533…` ran at **21:04 UTC** against scan `ddd7102e…` — the same cohort. Provenance-correct, but it was a second paid pass over the same 44 packets.
- The request log for the last hour shows only read requests from the app. No scan request reached the backend.

### Answering the four possibilities

- A (new rows under a new scan id): **No.**
- B (new rows attached to the old scan): **No** — nothing was written after 17:06.
- C (the page only re-displayed existing results): **Yes, this is what happened.**
- D (new scan id whose run record was lost): **No** — the run record is written first, before any provider work, so this is not possible.

Rollover is not the problem. Research correctly stayed on `ddd7102e…` because that genuinely is still the newest healthy scan.

## 1. Why the click never reached the backend

The Scanner page derives its run state from two things: the result of the click, and a poll of the real scan record. Reading that logic, there are two ways the button becomes a dead control while still looking normal:

- When a click has resolved but the scan-record poll has not returned a settled status (query still loading, poll stopped, or the read errored), the page treats the state as "running". The button is then disabled and every further click is ignored — with no scan actually running.
- If a click's request never settles (dropped connection, page backgrounded, worker cut-off), the page stays in its pending state indefinitely. Clicks are ignored and no error is ever shown.

In both cases the results already on screen stay visible and look current, which is exactly what you saw.

**Fix (not just logging):**
- Never infer "running" from missing information. The page treats "running" as true only when a scan record actually reports `running`, or the request is in flight and under a bounded time window.
- Add a hard timeout on the request: if the backend does not acknowledge within that window, the attempt resolves to "Scan request did not start" and the button becomes clickable again.
- Surface client-side errors from the click instead of swallowing them.
- Re-check the real scan lock before deciding the button is blocked, so a stale or dead lock can never permanently disable it.

## 2. Three explicit attempt states

- **CLIENT_ATTEMPT** — you pressed Run Scan in this session. UI/session state only; the backend cannot record a click it never received.
- **BACKEND_ACCEPTED** — the request reached the server. At the earliest server entry point, before provider or preflight work, a durable record exists.
- **SCAN_RUN** — the durable production scan lifecycle, from `running` through completed/failed/abandoned.

## 3. Immediate acknowledgement in the UI

On press, the page immediately shows "Starting new scan…", and old results are explicitly labelled, e.g. "Displayed results: scan ddd7102e… completed at 17:06 UTC".

The attempt then resolves into exactly one of:
- Backend accepted — scan [id] started
- Request failed before scan start
- Scan blocked because another run is active
- Provider/preflight failure
- Scan completed
- Scan failed
- Scan request did not start (no acknowledgement received)

It never silently reverts to looking like the old results are new.

## 4. Durable backend attempt semantics

The scan record is created at the earliest server entry point, before provider and preflight work — this already holds and stays that way. Every accepted attempt must end settled (completed/failed) or remain visibly running/abandoned; the existing stale-run reclaim keeps abandoned runs from hiding as "running". A request that never reached the server has no server record and is represented purely as a client attempt.

## 5. Scanner result provenance

Above BASE / REACCEL / Survivors, always show: scan id, started and completed time, age, status, and scanner policy version. When the most recent attempt did not produce a newer successful scan, show "Results below are from the previous successful scan."

## 6. Research freshness

Research shows the active scan id, its completion time and age, the status of the latest backend scan attempt, and a warning strip when a newer backend attempt failed. A failed attempt never becomes the active cohort.

## 7. Triage rerun protection

Once a completed production triage exists for the active scan, the ordinary Run Triage action is unavailable. A separate explicit "Rerun triage on same cohort" action remains, behind a confirmation stating that it uses the same packets, spends AI credits, and does not represent a new Scanner cohort.

## 8. Rollover rules unchanged

The canonical rule stays exactly as it is: a new healthy, completed, current-policy scan becomes the active Research cohort immediately, downstream stages read NOT_STARTED, fresh packets auto-generate for that scan only, triage may use only those packets, and the old cohort stays immutable in History.

## 9. Regression tests

Lifecycle tests covering: old cohort has full downstream artifacts → new scan created → new candidates carry the new scan id → healthy completion → Research switches immediately → downstream NOT_STARTED → packets auto-generate for the new scan → READY reflects only new packets → triage rejects foreign packets → old cohort intact in History → reload does not revert. Plus button-state tests: unknown scan status never disables the button, unacknowledged requests resolve to "did not start", and a completed triage blocks the ordinary triage action.

Not changing: scanner scoring, selection policy, thresholds, thesis rules, gates, or any stored record from the previous cohort.

## Technical notes

- `scanUiState` currently maps "attempt resolved, watched status not yet settled" to RUNNING; this becomes an explicit UNCONFIRMED state that does not disable the control.
- `runScan` gets a client-side timeout wrapper plus surfaced `onError`; `startScanRun` already inserts the run row before `checkBirdeyeReadiness`, so accepted attempts stay durable.
- `selectActiveResearchScan` / `loadActiveResearchCohort` are untouched.
- Verification: targeted lifecycle and UI-state tests, full suite, typecheck, build.
