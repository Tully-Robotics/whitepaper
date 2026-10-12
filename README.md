# Tully White Paper website

Static site. No build step and no dependencies.

## Deploy on Vercel

Deploys run automatically from GitHub Actions ([`.github/workflows/vercel-deploy.yml`](.github/workflows/vercel-deploy.yml)) to the Vercel project `tully-white-paper`.

- **Push to `main`:** production deploy.
- **Pull request:** preview deploy. The URL is in the run summary.
- **Manual:** Actions tab → "Deploy to Vercel" → Run workflow.

The workflow needs three repository secrets (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VERCEL_TOKEN` | a token from vercel.com/account/tokens |
| `VERCEL_ORG_ID` | `orgId` in `.vercel/project.json` |
| `VERCEL_PROJECT_ID` | `projectId` in `.vercel/project.json` |

To deploy by hand, run `npx vercel` from this folder for a preview, then `npx vercel --prod` for production.

`.vercelignore` keeps this README and `.github/` out of the deployed site.

## Contents

| Path | What it is |
|---|---|
| `index.html` | the page |
| `assets/` | CSS, the simulation, page script. File names are content-hashed, so they are cached for a year. |
| `vendor/three-0.128.0/` | three.js r128, MIT licence included, served from this site |
| `img/` | renders and diagrams |
| `fonts/` | self-hosted web fonts with their licences |
| `vercel.json` | caching and security headers |
| `.vercelignore` | repo files kept out of the deployment |
| `.github/workflows/` | the auto-deploy workflow |

Fonts (Archivo, Source Serif 4, JetBrains Mono; SIL OFL, licences in `fonts/`) are self-hosted, so the page makes no third-party requests at all.

## Search engines

Search engines are blocked by default: there is a `noindex` meta tag in `index.html` and `robots.txt` disallows all crawlers. To allow indexing, delete both.
