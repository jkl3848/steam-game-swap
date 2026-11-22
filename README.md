# Steam Game Swap

Anonymous gift swaps for Steam. Create a swap, share a code, collect wishlists, set blackouts, and run matches. Each gifter learns who they're buying for — not who got them.

## Features

- **Creators** sign in with Discord and manage swaps (dates, price rules, blackouts, matching)
- **Participants** join with a code, link Discord, and build a wishlist via Steam store search
- **Matching** respects blackout pairs; runs manually or automatically on the start date
- **Notifications** via Discord bot DM (REST API — no persistent gateway)
- **Privacy** — swap data is isolated; participants only see their own giftee after matching

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Vite, Tailwind CSS v4, Vue Router, Pinia |
| API | Fastify on Cloud Functions (2nd gen) |
| Database | Firestore (Admin SDK from functions only) |
| Jobs | Scheduled Cloud Function (hourly auto-match + reminders) |
| Hosting | Firebase Hosting |
| Auth | Discord OAuth (creators), secret-link tokens (participants) |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- [Firebase CLI](https://firebase.google.com/docs/cli) (`firebase-tools`, included as a dev dependency)
- Java 21+ on `PATH` (required by the Firestore emulator used for `pnpm test:api`)

No Docker or local Postgres required.

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

If native modules fail to build (e.g. `bcrypt`):

```bash
pnpm rebuild bcrypt
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` with your values. **Never commit `.env`** or service account JSON — both are gitignored.

| Variable | Required | Description |
|----------|----------|-------------|
| `FIREBASE_PROJECT_ID` | Deploy | Your Firebase project ID (update `.firebaserc` too) |
| `GOOGLE_APPLICATION_CREDENTIALS` | Deploy / optional local | Path to service account JSON (local only) |
| `FIRESTORE_EMULATOR_HOST` | Auto | Set by `firebase emulators:start` |
| `SESSION_SECRET` | Prod | Random string, 32+ chars (required in production) |
| `WEB_ORIGIN` | Yes | Frontend URL (e.g. `http://localhost:5173`) |
| `API_PUBLIC_URL` | Yes | Public API base for OAuth (emulator or Hosting URL) |
| `DISCORD_CLIENT_ID` | Yes | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord application client secret |
| `DISCORD_BOT_TOKEN` | Later | Bot token (match + reminder DMs) — optional until notifications |
| `DISCORD_BOT_INVITE_URL` | Later | Permanent invite to your hub server |
| `STEAM_WEB_API_KEY` | No | Steam Web API key (profile resolve + wishlist import). Store search works without it. |
| `GIFT_REMINDER_DAYS_BEFORE` | No | Days before deadline to send reminders (default: 3) |
| `DEV_TOOLS` | No | `true` / `false`. When omitted, test-participant tools are on locally and off on the hosted site |

### 3. Firebase project

The repo is wired to **`steam-game-swap-dev`** (Firestore Native in `nam5`). Local `pnpm dev` uses the Emulator Suite and does not need a service account.

To talk to the cloud project (not emulators):

1. Open [Firebase console](https://console.firebase.google.com/project/steam-game-swap-dev)
2. Optional local Admin SDK: Project settings → Service accounts → download JSON → `GOOGLE_APPLICATION_CREDENTIALS` — **do not commit this file**
3. For production secrets (`DISCORD_*`, `SESSION_SECRET`, `STEAM_WEB_API_KEY`), use [Firebase Secret Manager](https://firebase.google.com/docs/functions/config-env)
4. Enable the **Blaze** plan before deploying Cloud Functions or the hourly scheduler

### 4. Discord application

1. Create an app at the [Discord Developer Portal](https://discord.com/developers/applications)
2. **OAuth2** → add redirect URL: `{API_PUBLIC_URL}/auth/discord/callback`  
   (production: `https://<your-hosting-domain>/auth/discord/callback` via Hosting rewrite)
3. **Bot** → enable bot, copy token → `DISCORD_BOT_TOKEN`
4. Create a permanent invite to your hub server → `DISCORD_BOT_INVITE_URL`  
   Participants must share a server with the bot to receive DMs

### 5. Local development (emulators)

```bash
pnpm dev
```

This runs the Firebase Emulator Suite (Firestore, Functions, Hosting emulator) and the Vite dev server. The web app proxies `/api` and `/auth` to the Functions emulator.

- Web (Vite): http://localhost:5173  
- Emulator UI: http://localhost:4000  
- Functions: http://127.0.0.1:5001  
- Hosting emulator: http://localhost:5002  
- Firestore emulator: http://127.0.0.1:8080  

To run the API alone without emulators (Fastify on port 3000):

```bash
pnpm dev:api
```

Set `VITE_API_PROXY=http://localhost:3000` when running the web app against the standalone API.

Locally, the swap manage page can add test people and open the swap as any of them, including yourself, without extra Discord accounts. Your creator login stays in the same browser. The hosted site does not show those controls. Set `DEV_TOOLS=true` to force them on.

### 6. Deploy

Live site: **https://steam-game-swap-dev.web.app**

Merges (and pushes) to `main` deploy Hosting via GitHub Actions (`.github/workflows/firebase-hosting-merge.yml`). The workflow authenticates with Workload Identity Federation — no service-account JSON in GitHub secrets.

One-time GCP wiring (already run for this project):

```bash
node scripts/setup-github-deploy.mjs
```

Manual deploy from your machine:

```bash
pnpm deploy:hosting
```

`pnpm deploy` / `pnpm deploy:functions` need the Firebase **Blaze** plan (2nd-gen Cloud Functions). Hosting-only deploys work on Spark. The site rewrites `/api` and `/auth` to the `api` function, so those routes 404 until Functions are deployed.

## Project layout

```
apps/
  web/                  Vue 3 frontend (built to apps/web/dist for Hosting)
  api/                  Fastify API + Cloud Functions exports (firebase.ts)
packages/
  shared/               Shared Zod validation schemas
firebase.json           Hosting, Functions, emulator config
firestore.rules         Deny all client access (Admin SDK only)
firestore.indexes.json  Composite indexes for queries
.env.example            Environment template (safe to commit)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Emulators + Vite dev server |
| `pnpm dev:api` | Fastify API only on port 3000 |
| `pnpm dev:web` | Vite only |
| `pnpm dev:emulators` | Firebase Emulator Suite |
| `pnpm build` | Build all packages |
| `pnpm deploy` | Deploy Hosting + Functions (Functions need Blaze) |
| `pnpm deploy:functions` | Deploy Cloud Functions only (stages workspace deps for npm) |
| `pnpm deploy:hosting` | Deploy Hosting only (used by GitHub Actions on `main`) |
| `pnpm test` | Web unit tests + API tests (Firestore emulator) |
| `pnpm test:web` | Vue / create-form unit tests |
| `pnpm test:api` | API tests under `firebase emulators:exec` |

## Security

- **Secrets** live in `.env` locally and Secret Manager in production. Never commit credentials.
- **Firestore rules** deny all client reads/writes; only Cloud Functions use the Admin SDK.
- **Creators** authenticate via Discord OAuth; session stored in an httpOnly cookie.
- **Participants** get a one-time secret URL; tokens are bcrypt-hashed at rest.
- **OAuth state** is persisted in Firestore (survives cold starts).
- **Isolation** — every API query is scoped by swap ID and role.

## License

Private / friends use — add a license if you open-source this.
