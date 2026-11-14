# Comet Hop leaderboard

The daily leaderboard for the GitHub Pages copy of the game: a Cloudflare Worker with a D1 (SQLite) database. Players pick a nickname; there are no accounts. Each browser makes a random private key and sends it with its scores, and the database stores only a hash of it, so one player can't overwrite another's row.

## API

- `GET /scores?day=YYYY-MM-DD` returns that day's top 50 (UTC day, defaults to today).
- `POST /scores` with `{ day, key, nickname, score, hops, bulls, chain }` records a run. Each player keeps their best score per day, and the latest nickname always applies.

Checks: nicknames are 1–20 letters, numbers, spaces or `. _ ' -`; only today and yesterday are accepted; impossible scores and posts more than once every 2 seconds per player are refused; browsers can post only from the sites in `ALLOWED_ORIGINS` (`wrangler.toml`).

## Deploy

Needs a free Cloudflare account.

```sh
cd worker
npm install
npx wrangler login                 # or set CLOUDFLARE_API_TOKEN
npx wrangler d1 create comet-hop   # copy the database_id into wrangler.toml
npm run db:init                    # creates the table
npm run deploy                     # prints the Worker's URL
```

Then set `LEADERBOARD_API` near the top of the leaderboard code in `../index.html` to that URL (no trailing slash).

## Develop

```sh
npm run db:init:local
npm run dev       # http://localhost:8787
npm test          # in another terminal, runs test/ against the local server
```

## Moderation

Remove a player's row for a day:

```sh
npx wrangler d1 execute comet-hop --remote --command "DELETE FROM scores WHERE day = '2026-11-14' AND nickname = 'Someone'"
```
