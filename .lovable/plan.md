# Scanner → Research Handoff: Audit Result and Fix

## What the data actually shows

I checked the live records before proposing anything.

- The newest scan on record is still `ddd7102e…`, started 17:05 UTC and completed 17:06 UTC today, 362 discovered, healthy, current scanner policy, 44 research packets.
- The newest scanner candidate row was written at **17:06:38 UTC** and carries scan id `ddd7102e…`. Nothing was written after that.
- There is **no scan record at all** after 17:06 — not a completed one, not a failed one.
- The new triage run `3714f533…` ran at **21:04 UTC** against scan `ddd7102e…` — the same cohort. That was provenance-correct (it matched the genuinely active scan), but it was a second triage over the same 44 packets.
- The request log for the last hour shows only read requests from the app. No scan request reached the backend.

### Answering the four possibilities

- A (new rows under a new scan id): **No.**
- B (new rows attached to old scan): **No** — nothing was written at all after 17:06.
- C (the page only re-displayed the existing results): **Yes, this is what happened.**
- D (new scan id whose run record was lost): **No** — the run record is written first, before any discovery work, so a lost run record is not possible here.

## Root cause

The Run Scan action never started a scan. The backend received no scan request, so no new scan, no candidates, no rollover. Research stayed on `ddd7102e…` because that genuinely still is the newest healthy scan — the rollover logic is correct and is not the failure.

Two things made this invisible and let it look like a rollover bug:

1. The Scanner page shows results from the most recent stored scan with no visible "these results are from the scan that ran at 17:06" marker, so old results look like fresh results.
2. A scan attempt that never reaches the backend leaves no trace anywhere — no attempt record, no error surfaced after the page is reloaded. There is no way to tell "no scan ran" from "a scan ran and found the same thing".

## The fix

### 1. Make the scan attempt itself durable and visible
Record every Run Scan attempt the moment the button is pressed, including attempts that fail before a scan starts (provider blocked, another scan already running, request error). Show the outcome on the Scanner page so a failed or never-started attempt is stated plainly instead of silently leaving old results on screen.

### 2. Stamp displayed scanner results with their scan
Show, above the results, which scan the displayed BASE / REACCEL / Survivor rows belong to and when it ran, plus a clear "results are from a previous scan" note when the last attempt did not produce a newer one.

### 3. Surface scan freshness in Research
Show the active cohort's scan id and completion time in Research, and a warning strip when a newer scan attempt exists but failed — the failed attempt never becomes the active cohort.

### 4. Confirm and lock in the rollover rules with tests
The rollover, packet auto-generation and triage provenance rules already behave as specified. I will add regression tests covering the full lifecycle so this stays true: new scan becomes active immediately without needing packets; downstream stages read NOT_STARTED; packets auto-generate for the new scan only; triage refuses any packet from another scan; the old cohort stays untouched and visible in History; a reload does not fall back to the old scan.

### 5. Repeat-triage guard
Add a confirmation when a triage run already exists for the active cohort, so a second paid triage over the same packets is a deliberate choice, not an accident.

Not changing: scanner scoring, selection policy, thresholds, thesis rules, gates, or any stored record from the previous cohort.

## Technical notes

- `startScanRun` inserts the `scan_runs` row before any provider work, so any scan that begins is durable; the missing row proves no scan began.
- `selectActiveResearchScan` already picks the newest healthy, completed, non-calibration run under the current policy epoch without requiring packets; `loadActiveResearchCohort` scopes triage, deep research, thesis and entry by exact scan provenance.
- New: a `scan_attempts` record (or an equivalent non-run attempt log) written from the scan server function entry point, before `loadActiveStrategy`, so pre-run failures are recorded; surfaced through the existing scan status server function.
- Verification: targeted lifecycle tests, full test suite, typecheck and build.

## After the fix

To actually roll over you press Run Scan again; you will then see either a new scan id with fresh counts flowing into Research, or an explicit failure reason for why no scan started.
