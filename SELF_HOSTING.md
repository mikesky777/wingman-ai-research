# Self-hosting Wingman AI (app + database)

This guide runs the full Wingman app outside Lovable: your own database, your own
server. Nothing here changes app behaviour — it is the same code with your own
infrastructure behind it.

Everything below assumes a machine with **Node 20+** (or Bun) and Docker if you
want the database local.

---

## 1. Get the code

Export the project to GitHub from Lovable (top-right **GitHub** button), then:

```bash
git clone <your-repo-url> wingman
cd wingman
bun install     # or: npm install
```

---

## 2. Database (Supabase)

The app uses Postgres with the Supabase Data API (PostgREST), Auth, and
`pg_cron`/`pg_net`. Two supported options:

### Option A — Supabase Cloud (easiest)

1. Create a project at supabase.com.
2. Install the CLI: `npm i -g supabase`.
3. Link and push all migrations in `supabase/migrations/` (60 files, ordered):

```bash
supabase login
supabase link --project-ref <your-project-ref>
supabase db push
```

4. In the dashboard: **Database → Extensions**, enable `pg_cron` and `pg_net`.
5. Copy the Project URL, publishable (anon) key, and service-role key.

### Option B — Fully local / your own server

```bash
supabase init      # only if supabase/config.toml is missing
supabase start     # runs Postgres + PostgREST + Auth in Docker
supabase db reset  # applies every migration in supabase/migrations/
```

`supabase start` prints the local API URL and keys. For a permanent server, use
the official self-hosted Docker Compose stack
(<https://supabase.com/docs/guides/self-hosting/docker>) and apply the same
migrations with `psql -f` in filename order.

**Data migration (optional).** To carry over existing scans/reports, dump from
the current database and restore into the new one:

```bash
pg_dump --data-only --schema=public "$OLD_DB_URL" > wingman-data.sql
psql "$NEW_DB_URL" -f wingman-data.sql
```

---

## 3. Environment variables

Create `.env` in the project root:

```bash
# Client (bundled into the browser build — publishable values only)
VITE_SUPABASE_URL="https://<ref>.supabase.co"
VITE_SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
VITE_SUPABASE_PROJECT_ID="<ref>"

# Server
SUPABASE_URL="https://<ref>.supabase.co"
SUPABASE_PUBLISHABLE_KEY="<anon/publishable key>"
SUPABASE_SERVICE_ROLE_KEY="<service role key>"   # secret, server only

# Scheduled-job authentication (any long random string you choose)
LOVABLE_CRON_SECRET="<random 40+ chars>"
# LOVABLE_CRON_SECRET_PREVIOUS=""                # only during a secret rotation

# Data + AI providers
BIRDEYE_API_KEY="<birdeye key>"                  # discovery, holders, OHLCV
FIRECRAWL_API_KEY="<firecrawl key>"              # deep-research web search
LOVABLE_API_KEY="<ai gateway key>"               # triage / thesis / deep research
```

Notes:

- `LOVABLE_API_KEY` is the AI Gateway key. Outside Lovable you can generate one
  in Lovable settings and keep using the gateway, or point the AI calls at
  another OpenAI-compatible endpoint — the call sites are
  `src/lib/wingman/services/research/{triage.server.ts,thesis/thesis.server.ts,deep/*.ts}`.
- DexScreener needs no key.
- Without `BIRDEYE_API_KEY` the scanner cannot discover candidates; without
  `FIRECRAWL_API_KEY` deep research returns `SEARCH_UNAVAILABLE` (by design, it
  never invents evidence).

---

## 4. Run it

```bash
bun run dev              # http://localhost:8080
bun run build            # production build
```

The build targets a Cloudflare-Worker-style edge runtime via Nitro. Deployment
targets, in order of least friction:

| Target | How |
| --- | --- |
| Cloudflare Workers | `npx nitro build --preset cloudflare_module`, then `npx wrangler deploy` |
| Vercel | import the repo; framework auto-detected; add the env vars |
| Netlify | same, build `npm run build` |
| Your own VPS | `NITRO_PRESET=node_server npm run build` then `node .output/server/index.mjs` behind nginx/Caddy |

Set every variable from step 3 in the host's environment settings. `VITE_*`
values are read at build time, so rebuild after changing them.

---

## 5. Scheduled jobs (required for unattended running)

Two endpoints must be called on a schedule. Both require
`Authorization: Bearer $LOVABLE_CRON_SECRET`.

| Endpoint | Cadence | Purpose |
| --- | --- | --- |
| `POST /api/public/outcome-sampler` | every 5 min | collects market outcome snapshots |
| `POST /api/public/production-cycle-tick` | every 1 min | watchdog that recovers a stalled Full Cycle |

Use any scheduler. With `pg_cron` + `pg_net` inside the database:

```sql
select cron.schedule(
  'outcome-sampler-5min', '*/5 * * * *',
  $$select net.http_post(
      url := 'https://your-app-domain/api/public/outcome-sampler',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb,
      body := '{}'::jsonb
  )$$
);

select cron.schedule(
  'production-cycle-tick-1min', '* * * * *',
  $$select net.http_post(
      url := 'https://your-app-domain/api/public/production-cycle-tick',
      headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_CRON_SECRET"}'::jsonb,
      body := '{}'::jsonb
  )$$
);
```

A plain crontab with `curl -X POST -H "Authorization: Bearer …" <url>` works
equally well.

---

## 6. Verify

1. Open the app — the dashboard loads with your data.
2. **Settings → Provider health**: each provider should report configured.
3. **Scanner → Run Scan**: a new scan row appears and survivors populate.
4. **Scanner → Run Full Cycle**: progresses through the stages on its own.
5. Close the tab mid-cycle: the watchdog continues it (proves the cron works).

---

## 7. Security checklist

- `SUPABASE_SERVICE_ROLE_KEY` and `LOVABLE_CRON_SECRET` are server-side only.
  Never prefix them with `VITE_`.
- Row-level security is enabled by the migrations; do not disable it.
- Keep `/api/public/*` behind the cron secret — those routes bypass site auth.
- Rotate the cron secret by setting the old value as
  `LOVABLE_CRON_SECRET_PREVIOUS` for one deploy, then removing it.

---

## 8. Ongoing cost shape

Postgres hosting, plus per-call provider spend: Birdeye (discovery/holders),
Firecrawl (deep research search), and the AI gateway (triage + thesis). The
built-in spend controls (`research_spend_policy/v1`: 6-hour per-mint cooldown
and rolling budgets) still apply and are the main lever on cost.
