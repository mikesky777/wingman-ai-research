# Wingman AI Research

Build a polished web app called Wingman AI.

Wingman AI is a human-in-the-loop Solana memecoin intelligence platform. Its purpose is to scan large numbers of tokens, surface only the strongest opportunities, score each thesis, evaluate whether the current chart offers a good entry, and present the research clearly to a human trader.

This is NOT an autonomous trading bot in v0.

Do not implement wallet connections, private keys, automatic purchases, swaps, or trade execution.

For now, use mock data and focus on building an excellent application structure and UI that can later connect to real APIs and Supabase.

Product philosophy

Wingman prioritizes quality over quantity.

It should never feel like a generic token screener showing hundreds of coins.

The core experience should be:

Scan thousands of tokens

Filter obvious low-quality opportunities

Deep-research a much smaller candidate set

Surface 0–5 genuinely interesting thesis opportunities

Explain why each opportunity matters

Score thesis quality separately from entry quality

Clearly identify risks and invalidation conditions

Allow the human trader to make the final decision

Wingman must be allowed to say:

“No high-quality setups currently meet our threshold.”

Do not force five recommendations.

Design direction

The application should feel like a serious professional trading intelligence terminal, not a casino or flashy memecoin website.

Use:

dark interface

clean typography

restrained use of accent colors

dense but readable information

clear hierarchy

strong cards and tables

subtle modern animations

responsive desktop-first layout

professional dashboard aesthetic

Avoid:

excessive neon

giant gradients

cartoonish crypto aesthetics

unnecessary animations

casino imagery

rocket emojis everywhere

clutter

Brand name:

Wingman AI

Possible subtitle:

AI-powered Solana thesis discovery

or:

Your memecoin research wingman

Main dashboard

Create a primary dashboard with a left sidebar and main content area.

Sidebar navigation:

Dashboard

Scanner

Watchlist

Research

History

Settings

Only Dashboard needs to be fully functional in this first version. Other pages can be polished placeholders with appropriate empty states.

At the top of the Dashboard show:

Wingman Market Overview

Display:

Market Regime: Risk-On / Neutral / Risk-Off

Last Scan

Tokens Scanned

Candidates Passing Initial Filters

Tokens Deep Researched

Actionable Opportunities

Use mock values such as:

Market Regime: Neutral
Last Scan: 11:00 AM
Tokens Scanned: 2,483
Passed Filters: 61
Deep Researched: 14
Actionable: 3

Add a clear button:

Run Scan

For now this should only trigger a mock loading state and refresh the mock timestamp.

Opportunity leaderboard

The main dashboard section should show:

Top Opportunities

Display up to five ranked token opportunities.

Do NOT force five rows if fewer qualify.

Each opportunity should have:

rank

token name

ticker

contract address shortened

market cap

liquidity

24h volume

thesis score

evidence confidence

chart entry score

entry state

structural risk multiplier

opportunity stage

score change since previous scan

Example:

GTAMEMES
Ticker: GTA
Thesis Score: 84 / 100
Evidence Confidence: 89 / 100
Chart Entry: 8 / 10
Entry State: BUY ZONE
Structural Multiplier: 1.0x
Stage: DEVELOPING
Market Cap: $850K
Liquidity: $140K
24h Volume: $1.3M
Score Change: +3

Entry states should have visually distinct badges:

BUY ZONE

ACCEPTABLE

SETTING UP

WATCH

EXTENDED

BROKEN

BUY ZONE should appear positive.

EXTENDED should clearly warn against chasing.

BROKEN should appear invalidated.

Critical scoring distinction

The interface must clearly separate:

Thesis Score

This measures how attractive the token itself is.

0–100.

Break the thesis score into:

Thesis / Meme Quality: 20

Catalyst / Narrative Strength: 15

Distribution / Holder Structure: 15

Liquidity / Exitability: 15

Dev / Launch Integrity: 10

Chart / Quality of Entry: 10

Mindshare / Reflexivity: 10

Valuation / Asymmetry: 5

Evidence Confidence

0–100.

This measures how complete and trustworthy the evidence behind the research is.

A token can have a strong thesis but weak evidence.

Example:

Thesis: 82
Evidence: 46

This should visually communicate uncertainty.

Entry Score

0–10.

This measures whether the current price/chart offers a good place to take risk.

A token can therefore show:

Thesis: 88 / 100
Entry: 3 / 10
Status: EXTENDED

The UI should make it obvious that:

High thesis score does not automatically mean buy now.

Token research detail view

Clicking a token should open a detailed research page.

At the top show:

Token name
Ticker
Contract address with copy button
Market cap
Liquidity
Volume
Token age

Then prominently display:

Thesis Score
Evidence Confidence
Entry Score
Entry State
Structural Multiplier

Example:

Thesis: 84 / 100
Evidence: 89 / 100
Entry: 8 / 10
Entry State: BUY ZONE
Structural Risk: 1.0x CLEAN

Add a clear summary panel:

Wingman Verdict

Example text:

“Strong GTA-related cultural thesis with accelerating holder growth and healthy liquidity. Current chart has formed a constructive higher low after the initial impulse. Structure remains clean and the current entry is attractive relative to invalidation.”

Use mock content.

Research sections

Create expandable or clearly separated sections for:

Why Now

Short explanation of the current catalyst.

Core Thesis

The main investment thesis.

Meme / Lore

Origin of the meme, cultural relevance, historical context, originality, and meme quality.

Catalyst / Narrative

Why attention may expand now.

Distribution

Show mock metrics:

holder count

top 10 ownership

top 20 ownership

insider estimate

bundled supply estimate

smart-wallet ownership

holder growth

Wallet Intelligence

Show mock entries such as:

Smart wallets accumulating

Large holders distributing

Dev wallet behavior

New profitable-wallet activity

Developer Analysis

Show:

developer reputation

previous launches

successful launches

suspicious launches

linked wallets

developer current ownership

Liquidity / Exitability

Show:

liquidity

volume / liquidity ratio

estimated impact of a hypothetical starter position

estimated impact of larger position

estimated exit impact

Use mock examples.

Clearly label everything as simulated/mock data in this version.

Mindshare

Show:

social mention velocity

unique authors

engagement quality

narrative propagation

organic vs paid attention

mindshare score

Chart / Entry Analysis

Show current state such as:

BUY ZONE

Then display:

current structure

most recent impulse

pullback depth

higher-low status

distance from recent base

buyer/seller behavior

volume behavior

risk-definition level

Include a placeholder chart area.

Do not integrate real charting APIs yet.

Bull Case

Concise explanation.

Bear Case

Concise explanation.

Market Cap Scenarios

Example:

Failure: $200K–$350K
Base Case: $2M–$4M
Strong Reflexive Run: $8M–$15M+

Do not imply these are guaranteed forecasts.

Invalidation

Clearly state what would make the thesis wrong.

Example:

loss of important support

sharp liquidity deterioration

coordinated whale distribution

catalyst fails

holder growth reverses

Position sizing panel

Create a section called:

Position Framework

The platform should NOT tell the user that a trade is guaranteed or automatically execute anything.

Display:

Thesis Score: 84

Base maximum exposure:

10–15% of dedicated trading bankroll

Structural multiplier:

1.0x

Adjusted maximum:

10–15%

Suggested initial deployment:

60–70% of intended maximum

Then provide an example starter range.

Clearly label this as:

Research framework — final sizing decision remains with the trader.

Sizing bands:

Below 50: Pass / lottery-sized only
50–59: 2–4% max
60–69: 4–7% max
70–79: 7–10% max
80–89: 10–15% max
90–100: 15–20% max

Structural multipliers:

Clean: 1.0x
One meaningful concern: 0.75x
Significant concern: 0.50x
Borderline: 0.25x
Fatal flaw: NO TRADE

Chart entry state machine

Create a visual component showing possible entry states:

WATCH
↓
SETTING UP
↓
BUY ZONE

Alternative states:

EXTENDED
BROKEN

Include tooltips explaining each state.

BUY ZONE examples

impulse followed by controlled retrace

higher low

breakout followed by successful retest

constructive consolidation

price compression while holder/mindshare data improves

EXTENDED examples

vertical price expansion

price far above recent base

price greatly outrunning holder growth

poor nearby risk definition

significant upper-wick distribution

BROKEN examples

repeated lower highs and lower lows

structural support failure

major holder distribution

liquidity deterioration

thesis invalidation

These are informational rules in the UI only for now.

Do not implement the actual calculation engine yet.

Watchlist

Build a basic Watchlist page.

Allow mock tokens to be added or removed locally.

Columns:

token

thesis score

entry state

current market cap

score change

last analyzed

alert status

Include filters for:

BUY ZONE

SETTING UP

EXTENDED

score 80+

score 70+

Scanner page

Build a basic Scanner page showing the conceptual pipeline:

TOKEN UNIVERSE

↓

HARD FILTERS

↓

QUANTITATIVE RANKING

↓

AI TRIAGE

↓

DEEP RESEARCH

↓

WINGMAN SHORTLIST

Show mock counts at each stage.

Example:

2,483 scanned
61 passed hard filters
23 passed quantitative ranking
14 deep researched
3 actionable

Include a mock table of recently scanned candidates.

History / learning page

Create a History page showing previous Wingman recommendations.

Columns:

token

thesis score at discovery

entry score

market cap at discovery

peak market cap

maximum gain

maximum drawdown

current status

discovery date

Use fake values.

This page represents Wingman's eventual ability to measure whether its scoring system actually works.

Include summary statistics such as:

Average score
Average maximum return
Hit rate for 80+ scores
Hit rate for 70–79 scores

Clearly label all current statistics as mock data.

Data architecture

Prepare the project so it can later connect to Supabase.

Use clean TypeScript interfaces/models.

Create interfaces for:

Token

TokenSnapshot

ResearchReport

WalletSignal

MindshareSnapshot

Opportunity

TradeOutcome

Do not add unnecessary backend complexity yet.

For now use a centralized mock-data layer so we can replace mock data with API/database calls later without rewriting UI components.

Important development constraints

Use reusable components.

Keep business logic separate from visual components.

Do not hard-code scoring logic across UI files.

Create configuration files/constants for:

thesis score categories

sizing bands

entry states

structural multipliers

Do not invent additional scoring categories without explicit instruction.

Do not change the scoring weights.

Do not implement autonomous trading.

Do not request or store private keys.

Do not implement wallet signing.

Do not add speculative features outside this scope.

Do not integrate paid third-party APIs yet.

Use mock data for external information.

Build the project so real data sources can later replace mock data cleanly.

Future integrations — DO NOT implement yet

Leave architecture ready for eventual integration with:

DexScreener

Birdeye

Helius

Bubblemaps

Pump.fun / PumpPortal

Jupiter

X/social-data providers

LLM research agents

Supabase

These should NOT be required for this first version.

Goal for this iteration

The result should be a polished clickable Wingman AI prototype that makes the product vision immediately understandable.

A user should be able to:

View current opportunities

Understand thesis vs evidence vs entry quality

Open a token research report

See why Wingman likes or dislikes it

Understand the preferred entry state

See risk and invalidation

Understand suggested sizing under the framework

Add tokens to a watchlist

View the scanner pipeline

View historical mock recommendations

Prioritize a clean architecture and excellent UX over adding more features.

Before making major architectural assumptions not specified above, choose the simplest extensible solution.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/501b33a7-29f7-47fc-9f0a-9610387aefc4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
