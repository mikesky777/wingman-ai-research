
CREATE TABLE public.tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_address text NOT NULL UNIQUE,
  chain text NOT NULL DEFAULT 'solana',
  symbol text NOT NULL,
  name text NOT NULL,
  description text,
  image_url text,
  deployer_address text,
  token_created_at timestamptz,
  migration_at timestamptz,
  website_url text,
  twitter_url text,
  telegram_url text,
  dex_pair_address text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  inserted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.tokens TO anon, authenticated;
GRANT ALL ON public.tokens TO service_role;
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tokens_public_read" ON public.tokens FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.token_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  captured_at timestamptz NOT NULL DEFAULT now(),
  price_usd numeric,
  market_cap numeric,
  fdv numeric,
  liquidity_usd numeric,
  volume_5m numeric,
  volume_1h numeric,
  volume_6h numeric,
  volume_24h numeric,
  price_change_5m numeric,
  price_change_1h numeric,
  price_change_6h numeric,
  price_change_24h numeric,
  buys_5m integer,
  sells_5m integer,
  buys_1h integer,
  sells_1h integer,
  unique_buyers_1h integer,
  unique_sellers_1h integer,
  holder_count integer,
  top_10_holder_pct numeric,
  top_20_holder_pct numeric,
  paid_boost_count integer,
  data_source text NOT NULL DEFAULT 'seed',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX token_snapshots_token_captured_idx ON public.token_snapshots (token_id, captured_at DESC);
GRANT SELECT ON public.token_snapshots TO anon, authenticated;
GRANT ALL ON public.token_snapshots TO service_role;
ALTER TABLE public.token_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "token_snapshots_public_read" ON public.token_snapshots FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','completed','failed')),
  tokens_scanned integer NOT NULL DEFAULT 0,
  passed_hard_filters integer NOT NULL DEFAULT 0,
  passed_quantitative_ranking integer NOT NULL DEFAULT 0,
  passed_ai_triage integer NOT NULL DEFAULT 0,
  deep_researched integer NOT NULL DEFAULT 0,
  actionable_count integer NOT NULL DEFAULT 0,
  market_regime text NOT NULL DEFAULT 'NEUTRAL' CHECK (market_regime IN ('RISK_ON','NEUTRAL','RISK_OFF')),
  scanner_version text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.scan_runs TO anon, authenticated;
GRANT ALL ON public.scan_runs TO service_role;
ALTER TABLE public.scan_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_runs_public_read" ON public.scan_runs FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.scan_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_run_id uuid NOT NULL REFERENCES public.scan_runs(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  quantitative_score numeric,
  stage_reached text NOT NULL CHECK (stage_reached IN ('universe','hard_filters','quantitative','ai_triage','deep_research','shortlist','rejected')),
  rejection_reason text,
  promoted_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX scan_candidates_run_idx ON public.scan_candidates (scan_run_id);
GRANT SELECT ON public.scan_candidates TO anon, authenticated;
GRANT ALL ON public.scan_candidates TO service_role;
ALTER TABLE public.scan_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scan_candidates_public_read" ON public.scan_candidates FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.research_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  scan_run_id uuid REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  thesis_score integer NOT NULL,
  evidence_confidence integer NOT NULL,
  entry_score integer NOT NULL,
  structural_multiplier numeric NOT NULL DEFAULT 1,
  meme_quality_score numeric,
  catalyst_score numeric,
  distribution_score numeric,
  liquidity_score numeric,
  dev_integrity_score numeric,
  chart_entry_score numeric,
  mindshare_score numeric,
  valuation_score numeric,
  entry_state text NOT NULL CHECK (entry_state IN ('WATCH','SETTING_UP','BUY_ZONE','ACCEPTABLE','EXTENDED','BROKEN')),
  opportunity_stage text NOT NULL CHECK (opportunity_stage IN ('EMERGING','DEVELOPING','ESTABLISHED')),
  wingman_verdict text,
  why_now text,
  core_thesis text,
  meme_lore text,
  catalyst_analysis text,
  distribution_analysis text,
  wallet_analysis text,
  developer_analysis text,
  liquidity_analysis text,
  mindshare_analysis text,
  chart_analysis text,
  bull_case text,
  bear_case text,
  invalidation text[] NOT NULL DEFAULT '{}',
  failure_mc_low numeric,
  failure_mc_high numeric,
  base_mc_low numeric,
  base_mc_high numeric,
  bull_mc_low numeric,
  bull_mc_high numeric,
  model_name text,
  prompt_version text,
  scoring_version text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX research_reports_token_idx ON public.research_reports (token_id, created_at DESC);
GRANT SELECT ON public.research_reports TO anon, authenticated;
GRANT ALL ON public.research_reports TO service_role;
ALTER TABLE public.research_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "research_reports_public_read" ON public.research_reports FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  research_report_id uuid REFERENCES public.research_reports(id) ON DELETE SET NULL,
  scan_run_id uuid REFERENCES public.scan_runs(id) ON DELETE SET NULL,
  rank integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  thesis_score_at_promotion integer,
  market_cap_at_promotion numeric,
  entry_state_at_promotion text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunities_active_idx ON public.opportunities (is_active, rank);
GRANT SELECT ON public.opportunities TO anon, authenticated;
GRANT ALL ON public.opportunities TO service_role;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunities_public_read" ON public.opportunities FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.watchlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  alerts_enabled boolean NOT NULL DEFAULT false,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX watchlist_unique_token_idx ON public.watchlist (token_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO anon, authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "watchlist_open_access" ON public.watchlist FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.opportunity_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_id uuid REFERENCES public.opportunities(id) ON DELETE CASCADE,
  token_id uuid NOT NULL REFERENCES public.tokens(id) ON DELETE CASCADE,
  discovery_at timestamptz NOT NULL,
  discovery_market_cap numeric,
  discovery_price numeric,
  discovery_thesis_score integer,
  discovery_entry_score integer,
  market_cap_1h numeric,
  market_cap_6h numeric,
  market_cap_24h numeric,
  market_cap_3d numeric,
  market_cap_7d numeric,
  peak_market_cap numeric,
  peak_price numeric,
  maximum_gain_pct numeric,
  maximum_drawdown_pct numeric,
  time_to_peak_minutes integer,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','TARGET_HIT','INVALIDATED','EXPIRED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX opportunity_outcomes_token_idx ON public.opportunity_outcomes (token_id);
GRANT SELECT ON public.opportunity_outcomes TO anon, authenticated;
GRANT ALL ON public.opportunity_outcomes TO service_role;
ALTER TABLE public.opportunity_outcomes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "opportunity_outcomes_public_read" ON public.opportunity_outcomes FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;
CREATE TRIGGER tokens_set_updated_at BEFORE UPDATE ON public.tokens FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------- seed (simulated demonstration data) ----------------

INSERT INTO public.tokens (id, contract_address, symbol, name, token_created_at, description) VALUES
('11111111-1111-4111-8111-111111111111','7hK9dQxRr2mVbT4pLcZ8yWfN3sJuEa6XgQ1nDvMk5RtP','GTA','GTAMEMES','2026-08-23T14:10:00Z','Simulated demo token'),
('22222222-2222-4222-8222-222222222222','3xQ8fPbW9mNz1KcVr6TdUy2SaHjE7LgB4RvMn5XwQpZk','LUMEN','Lumen Cat','2026-08-27T02:35:00Z','Simulated demo token'),
('33333333-3333-4333-8333-333333333333','9pR4vJmXt7Wq2NcBz5YdKa8ErUf1LhS6GnQv3MkTxAe2','LDOG','Ledger Dog','2026-08-11T18:00:00Z','Simulated demo token'),
('44444444-4444-4444-8444-444444444444','SFROGdemo1111111111111111111111111111111111','SFROG','Sunday Frog','2026-08-26T00:00:00Z','Simulated demo token'),
('55555555-5555-4555-8555-555555555555','MOOdemo22222222222222222222222222222222222','MOO','Terminal Cow','2026-08-20T00:00:00Z','Simulated demo token'),
('66666666-6666-4666-8666-666666666666','HYDRAdemo333333333333333333333333333333333','HYDRA','Pixel Hydra','2026-08-28T00:00:00Z','Simulated demo token'),
('77777777-7777-4777-8777-777777777777','GBONKdemo44444444444444444444444444444444','GBONK','Grand Bonk','2026-08-28T00:00:00Z','Simulated demo token'),
('88888888-8888-4888-8888-888888888888','VAPEdemo555555555555555555555555555555555','VAPE','Vault Ape','2026-08-29T00:00:00Z','Simulated demo token'),
('aaaa0001-1111-4111-8111-111111111111','OTTERdemo66666666666666666666666666666666','OTTER','Neon Otter','2026-07-13T00:00:00Z','Simulated demo token'),
('aaaa0002-1111-4111-8111-111111111111','BRCATdemo77777777777777777777777777777777','BRCAT','Boardroom Cat','2026-07-21T00:00:00Z','Simulated demo token'),
('aaaa0003-1111-4111-8111-111111111111','STOADdemo88888888888888888888888888888888','STOAD','Solar Toad','2026-08-01T00:00:00Z','Simulated demo token'),
('aaaa0004-1111-4111-8111-111111111111','MULEdemo999999999999999999999999999999999','MULE','Midnight Mule','2026-08-05T00:00:00Z','Simulated demo token'),
('aaaa0005-1111-4111-8111-111111111111','ARBDdemo101010101010101010101010101010101','ARBD','Archive Bird','2026-08-11T00:00:00Z','Simulated demo token'),
('aaaa0006-1111-4111-8111-111111111111','QWHLdemo111111111111111111111111111111111','QWHL','Quiet Whale','2026-08-24T00:00:00Z','Simulated demo token');

INSERT INTO public.token_snapshots (token_id, captured_at, price_usd, market_cap, fdv, liquidity_usd, volume_24h, holder_count, top_10_holder_pct, top_20_holder_pct, data_source) VALUES
('11111111-1111-4111-8111-111111111111','2026-08-29T11:00:00Z',0.00085,850000,850000,140000,1300000,4210,18.4,24.9,'seed'),
('22222222-2222-4222-8222-222222222222','2026-08-29T11:00:00Z',0.00041,410000,410000,72000,640000,1890,26.8,34.2,'seed'),
('33333333-3333-4333-8333-333333333333','2026-08-29T11:00:00Z',0.0062,6200000,6200000,720000,4900000,15400,12.1,16.8,'seed'),
('44444444-4444-4444-8444-444444444444','2026-08-29T11:00:00Z',NULL,320000,NULL,58000,NULL,NULL,NULL,NULL,'seed'),
('55555555-5555-4555-8555-555555555555','2026-08-29T11:00:00Z',NULL,1100000,NULL,96000,NULL,NULL,NULL,NULL,'seed'),
('66666666-6666-4666-8666-666666666666','2026-08-29T11:00:00Z',NULL,240000,NULL,31000,NULL,NULL,NULL,NULL,'seed'),
('77777777-7777-4777-8777-777777777777','2026-08-29T11:00:00Z',NULL,180000,NULL,24000,NULL,NULL,NULL,NULL,'seed'),
('88888888-8888-4888-8888-888888888888','2026-08-29T11:00:00Z',NULL,95000,NULL,12000,NULL,NULL,NULL,NULL,'seed');

INSERT INTO public.scan_runs (id, started_at, completed_at, status, tokens_scanned, passed_hard_filters, passed_quantitative_ranking, passed_ai_triage, deep_researched, actionable_count, market_regime, scanner_version, notes) VALUES
('dddd0002-1111-4111-8111-111111111111','2026-08-25T11:00:00Z','2026-08-25T11:08:00Z','completed',2210,54,21,12,12,2,'NEUTRAL','v0.1.0','Simulated historical scan'),
('dddd0001-1111-4111-8111-111111111111','2026-08-29T10:52:00Z','2026-08-29T11:00:00Z','completed',2483,61,23,14,14,3,'NEUTRAL','v0.1.0','Simulated demonstration scan');

INSERT INTO public.scan_candidates (scan_run_id, token_id, quantitative_score, stage_reached, promoted_reason, rejection_reason) VALUES
('dddd0001-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',91,'shortlist','Promoted to shortlist — thesis 84 / evidence 89',NULL),
('dddd0001-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333',89,'shortlist','Promoted — flagged EXTENDED, tracked for retrace',NULL),
('dddd0001-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',84,'shortlist','Promoted with low evidence confidence (54)',NULL),
('dddd0001-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444',77,'deep_research',NULL,'Rejected — thesis 61, derivative meme with no catalyst'),
('dddd0001-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555',74,'deep_research',NULL,'Rejected — top 10 hold 41%, distribution risk'),
('dddd0001-1111-4111-8111-111111111111','66666666-6666-4666-8666-666666666666',68,'ai_triage',NULL,'Rejected — narrative recycled from a dead 2025 token'),
('dddd0001-1111-4111-8111-111111111111','77777777-7777-4777-8777-777777777777',61,'quantitative',NULL,'Rejected — volume/liquidity profile indicates wash trading'),
('dddd0001-1111-4111-8111-111111111111','88888888-8888-4888-8888-888888888888',44,'hard_filters',NULL,'Rejected — liquidity below floor, dev on blacklist');

INSERT INTO public.research_reports (id, token_id, scan_run_id, created_at, thesis_score, evidence_confidence, entry_score, structural_multiplier,
 meme_quality_score, catalyst_score, distribution_score, liquidity_score, dev_integrity_score, chart_entry_score, mindshare_score, valuation_score,
 entry_state, opportunity_stage, wingman_verdict, why_now, core_thesis, meme_lore, catalyst_analysis, distribution_analysis, wallet_analysis,
 developer_analysis, liquidity_analysis, mindshare_analysis, chart_analysis, bull_case, bear_case, invalidation,
 failure_mc_low, failure_mc_high, base_mc_low, base_mc_high, bull_mc_low, bull_mc_high, model_name, prompt_version, scoring_version) VALUES
('cccc0001-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','dddd0001-1111-4111-8111-111111111111','2026-08-29T11:00:00Z',84,89,8,1,
 17,13,12,12,9,8,9,4,'BUY_ZONE','DEVELOPING',
 'Strong GTA-related cultural thesis with accelerating holder growth and healthy liquidity. Current chart has formed a constructive higher low after the initial impulse. Structure remains clean and the current entry is attractive relative to invalidation.',
 'A new trailer cycle has pushed GTA-adjacent content back to the top of gaming feeds this week, and this token is currently the highest-liquidity community expression of that attention on Solana.',
 'A durable mainstream culture reference with a natural refresh schedule, paired with clean distribution and enough liquidity for real position sizing. The thesis is that attention flows toward the single most liquid meme expression of a mainstream cultural event, and this token currently owns that slot.',
 'Originated from a community edit account that has been posting GTA-styled loading-screen art for two years. The art direction is instantly recognisable, reproducible by anyone, and predates the token itself — a strong signal of organic origin rather than a launch-day narrative.',
 'Attention is likely to expand as the trailer cycle continues and mainstream gaming coverage picks up. Secondary catalyst: several mid-size accounts have begun using the loading-screen format for unrelated posts, which historically precedes broader propagation.',
 'Top 10 hold 18.4% and top 20 hold 24.9% with 4,210 holders and 27.5% 24h holder growth. Insider estimate 3.1%, bundled supply 1.8%.',
 'Smart wallets accumulated during the retrace, one top-20 wallet trimmed into strength, dev wallet static since launch.',
 'No rug history detected. Prior launch peaked near $4M and did not collapse abruptly.',
 'Depth supports a mid-size position with tolerable slippage in both directions.',
 'Mention velocity 62/h across 431 unique authors with 81% organic share; narrative is spreading.',
 'Uptrend with a completed first pullback; confirmed higher low with contracting volume into the retrace.',
 'The cultural reference keeps refreshing without any effort from the community, holder growth continues at its current pace, and the token remains the most liquid expression of the theme. That combination historically supports a multi-week reflexive expansion.',
 'Mainstream gaming attention is episodic. If the trailer cycle cools before holder growth compounds, the token loses its attention anchor and reverts toward the pre-impulse base with little support from fundamentals.',
 ARRAY['Loss of the confirmed higher low on closing basis','Liquidity falls below ~$90K or depth thins sharply','Coordinated distribution from more than two top-20 wallets','Trailer/attention catalyst fails to sustain coverage','24h holder growth turns negative for two consecutive scans'],
 200000,350000,2000000,4000000,8000000,15000000,'simulated','v0','v0'),
('cccc0002-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','dddd0001-1111-4111-8111-111111111111','2026-08-29T11:00:00Z',76,54,6,0.75,
 15,12,10,10,8,6,11,4,'SETTING_UP','EMERGING',
 'Genuinely original meme with unusually high engagement quality, but the evidence base is thin: the token is under 48 hours old and wallet history is too short to verify distribution claims. Thesis is interesting; confidence is not yet there.',
 'A single high-reach post drove the first wave of attention 30 hours ago and the follow-through has been unusually organic rather than paid.',
 'Original artwork with a repeatable format and no obvious parent project to compete with. If the community holds through the first real drawdown, the meme has room to become a persistent format rather than a one-day event.',
 'A hand-drawn cat rendered in the style of early 2000s screensavers. No prior token history attached to the art. Originality is high; cultural reach is currently narrow.',
 'Format is being copied by small accounts, which is the earliest stage of propagation. No scheduled external catalyst.',
 'Top 10 hold 26.8% and top 20 hold 34.2% across 1,890 holders with 61% 24h growth. Insider estimate 7.9%, bundled supply 4.4%.',
 'Two known-profitable wallets opened small positions; dev sold 40% of an initial 5% allocation on day one.',
 'One prior launch showed an abrupt dev exit. Treat as a meaningful structural concern.',
 'Adequate for a starter position only. Exit costs rise steeply above ~$6K.',
 'Mention velocity 38/h across 212 authors with 88% organic share.',
 'First base forming after the initial discovery move; higher low not yet confirmed.',
 'Original art plus high organic share is the profile that produces persistent formats. A confirmed higher low with continued holder growth would materially raise both thesis and entry quality.',
 'Dev sold into day-one strength, bundled supply is non-trivial, and the token has no external catalyst. Attention could fade before any structure forms.',
 ARRAY['Dev wallet sells further','Base fails to form within 24 hours','Organic share falls below 60%','Liquidity deteriorates below ~$50K'],
 80000,150000,1000000,2500000,5000000,9000000,'simulated','v0','v0'),
('cccc0003-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','dddd0001-1111-4111-8111-111111111111','2026-08-29T11:00:00Z',88,91,3,1,
 18,14,13,14,9,3,10,3,'EXTENDED','ESTABLISHED',
 'One of the strongest theses currently tracked — clean distribution, deep liquidity, well-verified evidence. The problem is location: price is vertically extended above its last base and offers no acceptable risk definition. High thesis score does not make this a buy today.',
 'The narrative is already widely known. Wingman is tracking it for a future retrace rather than an immediate entry.',
 'Best-in-class community structure for its narrative, deep enough liquidity for institutional-size memecoin flow, and a dev team with a clean multi-launch record.',
 'A long-running hardware-wallet joke that predates this cycle by years, giving it durability most memes lack.',
 'Attention already expanded. Further expansion likely requires a new external event rather than continuation of the current one.',
 'Top 10 hold 12.1% and top 20 hold 16.8% across 15,400 holders. Insider estimate 1.4%, bundled supply 0.6%.',
 'Three top-20 wallets reduced exposure into the vertical move; net smart-wallet flow has flattened.',
 'Clean multi-launch history with no abrupt exits.',
 'Deepest book in the current shortlist. Exitability is not a constraint here.',
 'Mention velocity 104/h across 980 authors, 64% organic; narrative is viral.',
 'Vertical expansion with no nearby support and climactic volume behaviour.',
 'Deep liquidity and durable meme mean continuation is possible, and a controlled retrace would create an excellent entry within days.',
 'Climactic volume plus top-20 distribution into strength is the classic profile of a local top. Buying here risks a 35%+ drawdown before any thesis-level invalidation triggers.',
 ARRAY['Break of the last consolidation shelf','Continued distribution from top-20 wallets','Organic share falling below 50%','Holder growth turning negative'],
 1500000,2500000,8000000,12000000,25000000,40000000,'simulated','v0','v0');

INSERT INTO public.opportunities (id, token_id, research_report_id, scan_run_id, rank, is_active, thesis_score_at_promotion, market_cap_at_promotion, entry_state_at_promotion, created_at) VALUES
('bbbb0001-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','cccc0001-1111-4111-8111-111111111111','dddd0001-1111-4111-8111-111111111111',1,true,84,850000,'BUY_ZONE','2026-08-29T11:00:00Z'),
('bbbb0002-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','cccc0002-1111-4111-8111-111111111111','dddd0001-1111-4111-8111-111111111111',2,true,76,410000,'SETTING_UP','2026-08-29T11:00:00Z'),
('bbbb0003-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333333','cccc0003-1111-4111-8111-111111111111','dddd0001-1111-4111-8111-111111111111',3,true,88,6200000,'EXTENDED','2026-08-29T11:00:00Z'),
('bbbb0011-1111-4111-8111-111111111111','aaaa0001-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',1,false,86,640000,'BUY_ZONE','2026-07-14T09:30:00Z'),
('bbbb0012-1111-4111-8111-111111111111','aaaa0002-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',2,false,81,1200000,'ACCEPTABLE','2026-07-22T16:05:00Z'),
('bbbb0013-1111-4111-8111-111111111111','aaaa0003-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',3,false,74,380000,'SETTING_UP','2026-08-02T11:45:00Z'),
('bbbb0014-1111-4111-8111-111111111111','aaaa0004-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',4,false,72,520000,'SETTING_UP','2026-08-06T20:15:00Z'),
('bbbb0015-1111-4111-8111-111111111111','aaaa0005-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',5,false,83,760000,'BUY_ZONE','2026-08-12T08:20:00Z'),
('bbbb0016-1111-4111-8111-111111111111','aaaa0006-1111-4111-8111-111111111111',NULL,'dddd0002-1111-4111-8111-111111111111',6,false,78,940000,'ACCEPTABLE','2026-08-25T13:00:00Z');

INSERT INTO public.opportunity_outcomes (opportunity_id, token_id, discovery_at, discovery_market_cap, discovery_thesis_score, discovery_entry_score, peak_market_cap, maximum_gain_pct, maximum_drawdown_pct, status) VALUES
('bbbb0011-1111-4111-8111-111111111111','aaaa0001-1111-4111-8111-111111111111','2026-07-14T09:30:00Z',640000,86,8,7900000,1134,-18,'TARGET_HIT'),
('bbbb0012-1111-4111-8111-111111111111','aaaa0002-1111-4111-8111-111111111111','2026-07-22T16:05:00Z',1200000,81,7,4100000,242,-26,'TARGET_HIT'),
('bbbb0013-1111-4111-8111-111111111111','aaaa0003-1111-4111-8111-111111111111','2026-08-02T11:45:00Z',380000,74,6,910000,139,-47,'EXPIRED'),
('bbbb0014-1111-4111-8111-111111111111','aaaa0004-1111-4111-8111-111111111111','2026-08-06T20:15:00Z',520000,72,5,610000,17,-63,'INVALIDATED'),
('bbbb0015-1111-4111-8111-111111111111','aaaa0005-1111-4111-8111-111111111111','2026-08-12T08:20:00Z',760000,83,9,5400000,610,-22,'TARGET_HIT'),
('bbbb0016-1111-4111-8111-111111111111','aaaa0006-1111-4111-8111-111111111111','2026-08-25T13:00:00Z',940000,78,7,2300000,145,-31,'OPEN');

INSERT INTO public.watchlist (token_id, alerts_enabled) VALUES
('11111111-1111-4111-8111-111111111111', true),
('33333333-3333-4333-8333-333333333333', false);
