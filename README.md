# Tully White Paper website

Static white-paper site behind a login gate, deployed on Vercel from GitHub (`.github/workflows/vercel-deploy.yml`).

## How access works

- `middleware.js` runs on Vercel's servers before any file is served. Without a valid session cookie, every page shows the login page and every asset returns 401. Only the login page, the fonts and `robots.txt` are public.
- Visitors only enter their password. `api/login.js` checks it, records the sign-in in Postgres (Neon) against the invite the password belongs to, and sets a signed, HttpOnly cookie valid for 30 days.
- The **master password** always works and is the only way into `/admin`.
- On `/admin` you create a personal password per person, see every sign-in (CSV export), revoke a password or issue a new one. Revoking takes effect on that person's next page load.
- No password is in the frontend. Invite passwords are stored only as SHA-256 hashes, and raw IP addresses are never stored (a salted hash is kept for rate limiting: 8 failed attempts per 15 minutes per IP).

## One-time setup with the CLI

Run these from the repo root. The repo is already linked to the Vercel project (`.vercel/project.json`).

```bash
npm i -g vercel neonctl   # Vercel CLI and Neon CLI
vercel login
npm install
```

**1. Create the database and connect it to Production and Preview**

```bash
vercel integration add neon -e production -e preview
```

The first time, it may open the browser to accept Neon's terms. It creates a Neon Postgres database billed through Vercel and adds `DATABASE_URL`, `DATABASE_URL_UNPOOLED` and the other `PG*` variables to the project. If the integration name is different on your account, `vercel integration discover postgres` lists it.

**2. A separate dev branch for local work**

Neon branches are copy-on-write copies of the database, so local test sign-ins never reach the real list.

```bash
vercel integration open neon            # opens the Neon console; Settings → API keys → create one
export NEON_API_KEY=...                 # or run `neonctl auth`
neonctl projects list                   # note the project id
neonctl set-context --project-id <id>
neonctl branches create --name dev
neonctl connection-string dev --pooled | vercel env add DATABASE_URL development
neonctl connection-string dev          | vercel env add DATABASE_URL_UNPOOLED development
```

**3. The two secrets, for every environment**

```bash
vercel env add MASTER_PASSWORD production      # type it at the prompt (keeps it out of shell history)
vercel env add MASTER_PASSWORD preview
vercel env add MASTER_PASSWORD development     # can be a different, local-only password
openssl rand -base64 48                        # run once per environment and paste the output:
vercel env add SESSION_SECRET production
vercel env add SESSION_SECRET preview
vercel env add SESSION_SECRET development
vercel env ls                                  # check that all of them are there
```

For `preview`, the CLI may ask for a Git branch: press Enter to apply it to all preview branches.

- `MASTER_PASSWORD`: at least 10 characters. Changing it signs out every master session.
- `SESSION_SECRET`: at least 32 characters. Changing it signs everyone out.

If either is missing, the site answers 503 instead of opening up.

**4. Create the tables:** see Migrations below. The first push to `main` also does it.

## Migrations

The schema lives in `db/migrations/*.sql`, applied in file-name order. The runner is `scripts/migrate.mjs`, and the applied versions are recorded in the `schema_migrations` table.

```bash
npm run db:status                      # applied, pending, or CHANGED (an applied file was edited)
npm run db:migrate                     # apply everything pending
npm run db:migrate -- --dry-run        # list what would run
npm run db:new -- add_invite_language  # new file db/migrations/<UTC timestamp>_add_invite_language.sql
npm run db:rollback                    # undo the newest migration (asks; --yes to skip)
```

A migration file has an up and a down part (the same format as dbmate):

```sql
-- migrate:up
alter table tw_invites add column language text;

-- migrate:down
alter table tw_invites drop column language;
```

- Every migration runs in its own transaction. If it fails, nothing from it is kept. For statements that cannot run in a transaction, write `-- migrate:up transaction:false`, as `create index concurrently` needs.
- Concurrent runs are safe: a lock makes the second run wait and then skip what the first one applied.
- Never edit a migration that has been applied. `db:migrate` refuses while a file is CHANGED; add a new migration instead.
- Keep changes backwards compatible (add a column, deploy, then remove the old one later). The old code keeps serving until the new deploy finishes.

**Which database it targets:** `DATABASE_URL_UNPOOLED` (direct connection, the right one for schema changes), falling back to `DATABASE_URL`. These come from `.env`, or from `--env <file>`; variables already set in the shell win. The first line of the output names the host, so you always see where it is going.

| Target | Command |
|---|---|
| dev branch | `vercel env pull .env --environment=development`, then `npm run db:migrate` |
| production, by hand | `vercel env pull .vercel/.env.production.local --environment=production`, then `npm run db:migrate -- --env .vercel/.env.production.local` |
| production, automatic | push to `main`: the workflow runs `db:migrate` before `vercel build`. A failing migration stops the deploy. |

Pull requests do not migrate, because previews share the production database. Test migrations on the dev branch first. To refresh the dev branch from production, run `neonctl branches reset dev --parent`.

If a variable is marked Sensitive in Vercel, `vercel pull` cannot read it in CI. In that case add the unpooled URL as a GitHub repository secret `DATABASE_URL_UNPOOLED`; the workflow passes it through.

## Run it locally

```bash
vercel env pull .env --environment=development   # overwrites .env: MASTER_PASSWORD, SESSION_SECRET, DATABASE_URL(_UNPOOLED) of the dev branch
npm run db:migrate                                 # tables on the dev branch
vercel dev                                         # http://localhost:3000, runs the middleware and api/ like production
```

`vercel dev` reads `.env` only (not `.env.local`). When there is no `.env`, it fetches the Development variables from Vercel itself. `.env*` is in `.gitignore` and `.vercelignore`, so it is never committed or deployed.

## Contents

| Path | What it is |
|---|---|
| `index.html` | the white paper |
| `login.html`, `admin.html` | login page, access admin (admin needs the master password) |
| `middleware.js` | the gate: checks the session cookie on every request |
| `api/login.js`, `api/logout.js`, `api/admin.js` | sign in, sign out (`/api/logout`), admin API |
| `lib/` | shared session and database code (not served as files) |
| `db/migrations/` | the database schema as SQL migrations |
| `scripts/migrate.mjs` | the migration runner (`npm run db:*`) |
| `package.json` | `@neondatabase/serverless` at runtime, `pg` for migrations |
| `.github/workflows/` | deploy on push; production pushes run the migrations first |
| `assets/` | CSS, the simulation, page script. File names are content-hashed, so they are cached for a year. |
| `vendor/three-0.128.0/` | three.js r128, MIT licence included, served from this site |
| `img/` | renders and diagrams |
| `fonts/` | self-hosted web fonts with their licences (SIL OFL) |
| `vercel.json` | caching and security headers |

## Search engines and crawlers

Crawlers only ever see the login page. On top of that, every response carries `X-Robots-Tag: noindex`, the pages have a `noindex` meta tag and `robots.txt` disallows all crawlers.
