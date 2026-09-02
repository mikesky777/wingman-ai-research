# Scanner: Re-shaped Lifecycle Lanes + Editable Filters

Reshape the four scanner categories around the timescales that actually match your strategy, and make every lane threshold editable from the Scanner Workbench instead of being frozen in code. AI thesis/narrative scoring stays out of this iteration — this one gets the *shape* and the *controls* right so thesis scoring can plug into it next.

## Why the current lanes miss your setups

Today the lanes are mostly market-cap gates with loose age windows: EARLY accepts anything 10 minutes to 72 hours old, BASE 30 minutes to 7 days, and REACCEL only fires above $750K market cap. That means the highest-risk first-hours tokens flood EARLY, and an older $150K coin quietly regaining traction — the Buddy / GTA-style setup — cannot enter REACCEL at all because of the cap floor. The last completed scan showed exactly that: every DEVELOPING-only candidate under $750K was refused by REACCEL purely on the cap floor.

## New lane definitions

| Lane | Age window | Market cap | What it captures |
| --- | --- | --- | --- |
| EARLY (Early Momentum) | 2h – 36h | $30K – $750K | Fresh ignition, explicitly flagged high-risk. Excludes the first couple of hours where nothing is analysable. |
| BASE (Post-Bond Base) | 12h – 10d | $30K – $500K | Survived the first day and holds turnover during consolidation. Acceleration is *not* required here — persistence is. |
| DEVELOPING (Developing Thesis) | 3d – 45d | $50K – $3M | Post-bond development well after launch: the Buddy / GTA archetype, with the $30K–$200K band called out as the emphasis range. |
| REACCEL (Reacceleration) | 14d+ (age required) | $30K and up — **no cap floor** | Older tokens genuinely regaining traction versus their own baseline, at any size. |

Two structural changes beyond the numbers:

- REACCEL becomes an *age* lane, not a *size* lane. Age is required and must be old; the $750K floor is removed so a three-week-old $120K token that wakes up finally surfaces.
- EARLY carries an explicit `HIGH_RISK` flag in the UI (a badge in the table and drawer), because until thesis scoring lands, a strong-looking early chart is unverified — the Grokstreet case.

Lane emphasis bands (used for the lifecycle-fit part of the priority score, not as a hard gate) move to $30K–$200K for BASE and DEVELOPING so your target range ranks higher rather than being filtered on.

## Editable filters

A new **Lane Filters** panel inside the Scanner Workbench's Calibration section, one card per lane, exposing every threshold that currently lives in code:

- min/max age, min/max market cap, emphasis band
- max minutes since last trade
- min 24h turnover
- accepted activity states, min baseline acceleration
- required persistence / reacceleration signals
- survivor reservation slots per lane

Behaviour:

- Edits are saved as a named **calibration profile** in the backend; one profile is active at a time and every scan records which profile it ran under, so old runs stay reproducible.
- A built-in **Default** profile is read-only and always restorable in one click.
- Values are validated (min < max, non-negative, ratios 0–1) before a profile can be saved.
- Changing a profile never rewrites past scans — it only affects the next run.

## Scope boundaries

- No AI, thesis score, narrative or social analysis in this iteration. The next plan adds a thesis stage and makes EARLY require a strong thesis before it is treated as actionable.
- No changes to discovery providers, hard filters, the priority formula's weights, ingestion, evidence, or persistence of snapshots/observations.
- No trading, wallets, or execution.

## Technical notes

- `src/lib/wingman/services/scanner/config.ts` keeps `DEFAULT_RUN_CONFIG` and `LANE_CONFIG` as the built-in Default profile; lane thresholds become the shape of a profile record rather than the only source of truth.
- New table `scanner_lane_profiles` (id, name, is_default, is_active, config jsonb, timestamps) with public read, service-role write, and grants — same security model as the other scanner tables.
- `scan_runs` gains `lane_profile_id` and `lane_profile_name` so each run is reproducible against the thresholds it used.
- The pipeline loads the active profile server-side and passes it into `evaluateLanes` / priority, which already read thresholds from config — the deterministic logic itself does not change.
- Profile save/activate go through a `createServerFn` boundary with zod validation; the browser never writes these tables directly.
- Tests: default profile reproduces today's lane behaviour on the existing fixtures; new-window fixtures for a 3-week-old $120K reaccelerating token and a Buddy-style post-bond developer; profile validation rejects inverted ranges; a run records its profile id.
