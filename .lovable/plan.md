# Participation Quality v1 — Shadow Calibration

Add a deterministic, descriptive Participation Quality layer that measures how repetitive trading activity is relative to how many distinct wallets produce it. Shadow/calibration only: no veto, no change to selection, priority, setups, Structural Eligibility, or Price Integrity.

## Provider confirmation (already verified)

Birdeye `GET /defi/v3/token/trade-data/single?address=<mint>` (header `x-chain: solana`) is supported on the current plan and returns, in one request per token, for windows 1m / 5m / 30m / 1h / 2h / 4h / 8h / 24h:

- `trade_<w>`, `buy_<w>`, `sell_<w>` and their `_history_` prior-window counterparts
- `unique_wallet_<w>`, `unique_wallet_history_<w>`, `unique_wallet_<w>_change_percent`
- `volume_<w>_usd`, `volume_buy_<w>_usd`, `volume_sell_<w>_usd` plus history and change percentages
- `holder`, `market`, `price`, `last_trade_unix_time`

So 30m / 1h / 4h / 24h all come from a single request. No new provider, no raw transaction ingestion.

## What gets built

1. **Provider layer** — a server-only Birdeye trade-data client + normalizer alongside the existing holder/OHLCV clients, reusing the shared timeout/retry/429 handling and credential isolation. Missing fields stay null; provider failure yields UNKNOWN, never zero.

2. **Evidence persistence** — normalized per-window facts (trades, buys, sells, unique wallets, volume USD, buy/sell volume, provider change percentages, observed/captured timestamps) written as append-only evidence observations in the `participation` domain.

3. **Refresh domain** — add `participation` to the independent evidence refresh domains (proposed freshness: 45 minutes, same cadence as market since it is current-activity evidence, configurable in one place). Carried-forward observations keep their original timestamps.

4. **Fetch scope** — only candidates that already passed cheap upstream gates and can realistically compete for selection: BASE and REACCEL survivors/near-survivor candidates. Not the full discovered universe. Reuse fresh persisted participation evidence on repeat scans.

5. **Derived diagnostics** (pure module, `participation/v1`):
   - trades per unique wallet, per window
   - volume USD per unique wallet, per window
   - absolute unique wallet counts and their change across windows
   - activity/breadth divergence: trade and volume acceleration versus unique-wallet expansion (using Birdeye's own current-vs-history windows)
   - displayed next to existing turnover, volume/liquidity, liquidity, activity and acceleration context

6. **Classification** — `BROAD` / `CONCENTRATED` / `EXTREME` / `UNKNOWN`, descriptive only, with explicit reason codes. No single metric can drive a status; wording stays "repetitive trading", "narrow participant breadth", "activity/breadth divergence", "concentrated participation". Never "bot", "wash", or "manipulated".

7. **Calibration study** — collect participation data for WOTF plus current HEALTHY BASE, CONCERN/DAMAGED Price Integrity, REACCEL and recent survivor cohorts; report distributions for trades/wallet at 30m/1h/4h/24h, absolute unique wallets, volume/wallet, volume/liquidity and divergence, plus WOTF's rank/percentile. Thresholds are set from that separation evidence, not reverse-engineered to force WOTF into EXTREME. If separation is weak, report that and propose the Top Traders second-stage escalation instead of inventing a hard gate.

8. **UI** — a PARTICIPATION QUALITY block in candidate detail: status, per-window table (30m/1h/4h/24h: trades, unique wallets, trades per wallet, volume, volume per wallet), activity/breadth divergence, volume/liquidity, turnover, and exact classification reasons. Four Calibration filters for the statuses. Normal Scanner views stay label-only.

9. **Future gate contract** — code is structured so `EXTREME` can later become a temporary current-market eligibility veto (`EXTREME_REPETITIVE_PARTICIPATION`), mirroring the existing market-damage gate placement. Never Structural FAIL; always re-qualifiable on a later scan. Not activated in this build.

## Technical notes

- New files: `external/birdeye/trade-data.server.ts` + normalizer, `services/evidence/participation-evidence.ts`, `services/scanner/participation.ts` (pure), `participation.server.ts` (fetch/persist orchestration), tests.
- Migration: append-only participation observations reuse `evidence_observations` (domain `participation`); persisted per-candidate participation summary added to `scan_candidates` as a nullable JSONB detail column plus a status column, following the structural/price-integrity precedent. GRANTs and RLS follow existing table conventions.
- `evaluate.ts` and `priority.ts` are untouched; participation is computed and persisted, never read by selection.

## Tests

High trades alone, high volume alone, and low wallet count alone each cannot produce EXTREME; high activity with broad wallet growth stays BROAD; repetitive activity with weak breadth is representable; missing wallet evidence and provider failure both yield UNKNOWN; participation cannot change priority, setup classification or Survivor selection in shadow mode; carried observations preserve timestamps; historical scans stay immutable; WOTF regression case.

## Completion report

Endpoint and fields, provider request/CU behavior, WOTF metrics, cohort distributions, WOTF's relative position, comparison with known healthy BASEs, whether an evidence-supported EXTREME threshold looks possible, whether Top Traders escalation would add information, and tests/typecheck/build.
