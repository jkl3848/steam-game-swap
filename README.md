# Steam Game Swap

Secret Santa–style game swaps for Steam. Create a swap, share a code, collect wishlists, set blackouts, and run matches. Each gifter learns who they're buying for — not who got them.

## Features

- **Creators** sign in with Discord and manage swaps (dates, price rules, blackouts, matching)
- **Participants** join with a code, link Discord, and build a wishlist via Steam store search
- **Matching** respects blackout pairs; runs manually or automatically on the start date
- **Notifications** via Discord bot DM (requires joining your hub server)
- **Privacy** — swap data is isolated; participants only see their own giftee after matching

## Stack

| Layer | Tech |
|-------|------|
| Frontend | Vue 3, Vite, Tailwind CSS v4, Vue Router, Pinia |
| API | Fastify, TypeScript, Prisma |
| Database | PostgreSQL |
| Jobs | BullMQ + Redis |
| Auth | Discord OAuth (creators), secret-link tokens (participants) |

## Prerequisites

- Node.js 20+
- [pnpm](https://pnpm.io/) 10+
- Docker (for local Postgres + Redis)

## Quick start

### 1. Install dependencies

```bash
pnpm install
```

If native modules fail to build (e.g. `bcrypt`), run:

```bash
pnpm rebuild bcrypt
```

### 2. Environment

```bash
cp .env.example .env
```

Edit `.env` with your values. **Never commit `.env`** — it is gitignored.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis URL (for BullMQ jobs) |
| `SESSION_SECRET` | Prod | Random string, 32+ chars (required in production) |
| `WEB_ORIGIN` | Yes | Frontend URL (e.g. `http://localhost:5173`) |
| `API_PUBLIC_URL` | Yes | API URL for OAuth callbacks (e.g. `http://localhost:3000`) |
| `DISCORD_CLIENT_ID` | Yes | Discord application client ID |
| `DISCORD_CLIENT_SECRET` | Yes | Discord application client secret |
| `DISCORD_BOT_TOKEN` | Yes | Bot token (match + reminder DMs) |
| `DISCORD_BOT_INVITE_URL` | Yes | Permanent invite to your hub server |
| `DISCORD_GUILD_ID` | No | Your Discord server ID |
| `STEAM_WEB_API_KEY` | No | Steam Web API key (profile resolve + wishlist import) |
| `GIFT_REMINDER_DAYS_BEFORE` | No | Days before deadline to send reminders (default: 3) |

### 3. Database & Redis

```bash
docker compose up -d
pnpm db:push
```

`docker-compose.yml` uses default local credentials (`postgres` / `postgres`) — **for local development only**.

### 4. Discord application

1. Create an app at the [Discord Developer Portal](https://discord.com/developers/applications)
2. **OAuth2** → add redirect URL: `{API_PUBLIC_URL}/auth/discord/callback`  
   (local: `http://localhost:3000/auth/discord/callback`)
3. **Bot** → enable bot, copy token → `DISCORD_BOT_TOKEN`  
   Enable **Server Members Intent** if needed; ensure **Direct Messages** intent is available
4. Create a permanent invite to your hub server → `DISCORD_BOT_INVITE_URL`  
   Participants must share a server with the bot to receive DMs

### 5. Steam API key (optional)

Get a key at [steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey) → `STEAM_WEB_API_KEY`  
Used to resolve Steam usernames and import public wishlists. Store search works without a key.

### 6. Run

```bash
pnpm dev          # API :3000 + web :5173 (Vite proxies /api and /auth)
```

In a second terminal:

```bash
pnpm worker       # BullMQ worker + Discord bot (auto-match, reminders)
```

- Web: http://localhost:5173  
- API health: http://localhost:3000/health  

## Project layout

```
apps/
  web/              Vue 3 frontend
  api/              Fastify API (src/worker.ts for background jobs)
packages/
  shared/           Shared Zod validation schemas
prisma/             Database schema and migrations
docker-compose.yml  Local Postgres + Redis
.env.example        Environment template (safe to commit)
```

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Run API and web in development |
| `pnpm worker` | Run job worker and Discord bot |
| `pnpm build` | Build all packages |
| `pnpm db:push` | Push Prisma schema to the database |
| `pnpm db:migrate` | Create/apply migrations |
| `pnpm db:generate` | Regenerate Prisma client |
| `pnpm test` | Run API unit tests |

## Security

- **Secrets** live only in `.env` (gitignored). `.env.example` has empty placeholders.
- **Creators** authenticate via Discord OAuth; session stored in an httpOnly cookie.
- **Participants** get a one-time secret URL; tokens are bcrypt-hashed at rest.
- **Isolation** — every API query is scoped by swap ID and role; participants cannot list other swaps or rosters.
- **Production** — set a strong `SESSION_SECRET` (32+ characters); the API refuses to start without one when `NODE_ENV=production`.

## Deployment notes

- Set `NODE_ENV=production`, `WEB_ORIGIN`, and `API_PUBLIC_URL` to your real domains
- Update the Discord OAuth redirect URL to match production
- Use managed Postgres and Redis in production; do not expose `docker-compose.yml` credentials publicly
- Run the API and worker as separate processes (both need database access; worker needs Redis and Discord bot token)

## License

Private / friends use — add a license if you open-source this.
