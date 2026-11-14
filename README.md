# Comet Hop

A one-tap mobile game. Your comet orbits a planet: tap to break orbit, fly into the next planet's gravity ring, and keep climbing before your orbit decays.

**Play it:** https://tombawden.dev/comet-hop/ (once GitHub Pages is turned on)

## How to play

- **Tap** (or press Space) to launch along the dotted line.
- Cross a planet's dashed ring and its gravity catches you.
- Aim straight at the planet for a **Bullseye**. Chain them to multiply your points.
- Orbits shrink over time. Leave before you burn up.

## Features

- **Power-ups:** Shield (survive one crash), Slow-mo (half speed for 6s), Magnet (pulls in stardust and widens capture rings for 10s).
- **Boss planets:** every 25th planet is guarded by orbiting moons. Land on it for +10.
- **Deep space:** asteroids from planet 40, black holes from planet 60.
- **Daily mode:** the same sky for everyone each day (UTC), with a ghost of your best run to race.
- **Unlockable comets:** six trails earned by your best score.
- **Sound:** generated live in the browser, one note higher for each hop in a row.

## About this version

The game is a single self-contained `index.html` with no build step or dependencies (fonts load from Google Fonts). Open it in any browser.

On this site the Daily and all-time Endless leaderboards run on a small Cloudflare Worker (see [`worker/`](worker/README.md)), and players post under a nickname. The "Save card" button only works in the claude.ai version. Scores, unlocks and ghosts are saved in your own browser.
