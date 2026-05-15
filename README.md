# Steam Game Swap

Secret Santa–style game swaps for Steam. Create a swap, share a code, collect wishlists, set blackouts, and run matches. Each gifter learns who they're buying for — not who got them.

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
| `DISCORD_BOT_TOKEN` | Yes | Bot token (match + reminder DMs) |
| `DISCORD_BOT_INVITE_URL` | Yes | Permanent invite to your hub server |
| `STEAM_WEB_API_KEY` | No | Steam Web API key (profile resolve + wishlist import) |
| `GIFT_REMINDER_DAYS_BEFORE` | No | Days before deadline to send reminders (default: 3) |

### 3. Firebase project (when you have credentials)

1. Create a project in the [Firebase console](https://console.firebase.google.com/)
2. Set the project ID in `.firebaserc` and `FIREBASE_PROJECT_ID`
3. Download a service account key (Project settings → Service accounts) and set `GOOGLE_APPLICATION_CREDENTIALS` locally — **do not commit this file**
4. For production secrets (`DISCORD_*`, `SESSION_SECRET`, etc.), use [Firebase Secret Manager](https://firebase.google.com/docs/functions/config-env)

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

This runs the Firebase Emulator Suite (Firestore, Functions, Hosting UI) and the Vite dev server. The web app proxies `/api` and `/auth` to the Functions emulator.

- Web (Vite): http://localhost:5173  
- Emulator UI: http://localhost:4000  
- Functions: http://127.0.0.1:5001  

To run the API alone without emulators (Fastify on port 3000):

```bash
pnpm dev:api
```

Set `VITE_API_PROXY=http://localhost:3000` when running the web app against the standalone API.

### 6. Deploy

```bash
pnpm build
firebase deploy
```

Or deploy separately: `pnpm deploy:hosting`, `pnpm deploy:functions`.

**Plan note:** Scheduled functions and outbound calls to Discord/Steam may require the Firebase **Blaze** billing plan.

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
| `pnpm deploy` | Deploy Hosting + Functions |
| `pnpm test` | Run API unit tests |

## Security

- **Secrets** live in `.env` locally and Secret Manager in production. Never commit credentials.
- **Firestore rules** deny all client reads/writes; only Cloud Functions use the Admin SDK.
- **Creators** authenticate via Discord OAuth; session stored in an httpOnly cookie.
- **Participants** get a one-time secret URL; tokens are bcrypt-hashed at rest.
- **OAuth state** is persisted in Firestore (survives cold starts).
- **Isolation** — every API query is scoped by swap ID and role.

## License

Private / friends use — add a license if you open-source this.
