# Research rollover: audit result and hardening

## What the live data shows

There is **no newer scan than `ddd7102e…`**. It is the most recent scan of any kind in the database:

```text
ddd7102e…  completed  17:06 UTC  362 discovered  healthy  44 packets   <- newest
7549dac5…  completed  00:19 UTC  355 discovered  healthy  40 packets
cbb36eec…  failed     00:02 UTC  provider unavailable
```

Nothing was written by any scan after 17:06 UTC today (newest candidate row is 17:06:38). The later
data timestamps you may see come from market-price refreshes, not from a scan.

So Research is anchored correctly: it is showing the newest healthy completed production scan under
the current scanner policy. The selection rule already ignores packets, triage and every downstream
artifact — it only requires completed + healthy + non-empty + current policy, newest first, and the
existing regression tests already cover cases A–E of your list.

**Root cause of what you observed: the newer scan never produced a scan record.** Either it was not
started, or it aborted before the run row was inserted. Wingman cannot roll over to a scan that does
not exist, and it must not invent one.

## What I propose to build

Nothing about the selection rule changes. The gap is that Research gives you no way to tell
"this is the newest scan" apart from "a newer scan silently failed to record".

1. **Scan freshness on the funnel.** The SCANNER stage shows the scan's age ("completed 4h ago") and
   flags it as STALE past a configurable age, so an anchored-but-old cohort is visibly old rather
   than silently current.
2. **Last scan attempt line.** Under the funnel, show the most recent scan attempt of any status —
   including failed/provider-unavailable runs that are ineligible — with its reason. If a scan
   attempt failed at 20:00, you see that instead of guessing.
3. **Missing-run detection.** If the scanner starts a run and never completes it, the funnel shows
   that in-flight/abandoned run explicitly instead of hiding it.
4. **Complete the regression suite.** Add the two cases not yet covered: packets mid-generation still
   keep the new scan active (case B), and repeated resolution after refresh is stable and never
   drifts to an older scan (case F).

## Technical notes

- `selectActiveResearchScan` (`ai-scan-source.ts`) and `loadActiveResearchCohort`
  (`cohort.server.ts`) are already packet-independent and provenance-exact; they stay as they are.
- Triage already hard-checks packet scan provenance before spending credits; unchanged.
- New work is read-only presentation plus a widened scan-attempt read in `production-view.server.ts`
  / the funnel server function; no writes, no migration.
- Historical cohorts stay immutable and continue to appear in History.

## What you need to do

Run the Scanner again from the Scanner page. As soon as a healthy scan records, Research switches to
it immediately and generates fresh packets for that exact scan.
