// Runs against a local server: `npm run db:init:local && npm run dev`, then `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const BASE = process.env.BASE || 'http://localhost:8787';
const ORIGIN = 'http://localhost:8080';
const day = new Date().toISOString().slice(0, 10);
const post = body => fetch(BASE + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: ORIGIN }, body: JSON.stringify(body) });
const run = (key, extra = {}) => ({ day, key, nickname: 'Tester', score: 40, hops: 12, bulls: 5, chain: 3, ...extra });
const wait = ms => new Promise(r => setTimeout(r, ms));

test('keeps each player’s best score and latest nickname', async () => {
  const key = randomBytes(16).toString('hex');
  let r = await post(run(key, { score: 40 }));
  assert.equal(r.status, 200);
  const { pid } = await r.json();
  await wait(2100);
  r = await post(run(key, { score: 25, nickname: 'Renamed' }));
  assert.equal(r.status, 200);
  assert.equal((await r.json()).best, 40);
  const board = await (await fetch(`${BASE}/scores?day=${day}`)).json();
  const mine = board.scores.find(s => s.pid === pid);
  assert.equal(mine.score, 40);
  assert.equal(mine.hops, 12);
  assert.equal(mine.nickname, 'Renamed');
  assert.ok(!JSON.stringify(board).includes(key), 'private key never returned');
});

test('rejects bad input', async () => {
  const key = randomBytes(16).toString('hex');
  const cases = [
    [{ nickname: '' }, 'bad_nickname'],
    [{ nickname: '<script>' }, 'bad_nickname'],
    [{ nickname: 'x'.repeat(21) }, 'bad_nickname'],
    [{ day: '2020-01-01' }, 'bad_day'],
    [{ key: 'nope' }, 'bad_key'],
    [{ score: -1 }, 'bad_score'],
    [{ score: 1.5 }, 'bad_score'],
    [{ bulls: 13 }, 'bad_bulls'],
    [{ score: 999999, hops: 3, bulls: 1, chain: 1 }, 'implausible_score'],
  ];
  for (const [extra, err] of cases) {
    const r = await post(run(key, extra));
    assert.equal(r.status, 400, JSON.stringify(extra));
    assert.equal((await r.json()).error, err);
  }
});

test('rate-limits rapid submissions from one player', async () => {
  const key = randomBytes(16).toString('hex');
  assert.equal((await post(run(key))).status, 200);
  assert.equal((await post(run(key, { score: 41 }))).status, 429);
});

test('refuses posts from other sites', async () => {
  const r = await fetch(BASE + '/scores', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body: JSON.stringify(run(randomBytes(16).toString('hex'))) });
  assert.equal(r.status, 403);
});

test('answers CORS preflight for the game’s site', async () => {
  const r = await fetch(BASE + '/scores', { method: 'OPTIONS', headers: { Origin: ORIGIN, 'Access-Control-Request-Method': 'POST' } });
  assert.equal(r.status, 204);
  assert.equal(r.headers.get('access-control-allow-origin'), ORIGIN);
});

test('endless board keeps an all-time best per player, separate from daily', async () => {
  const key = randomBytes(16).toString('hex');
  let r = await post(run(key, { board: 'endless', day: undefined, score: 60, hops: 20 }));
  assert.equal(r.status, 200);
  const { pid } = await r.json();
  // a daily post right away is not rate-limited by the endless one
  assert.equal((await post(run(key, { score: 10 }))).status, 200);
  await wait(2100);
  r = await post(run(key, { board: 'endless', score: 30, hops: 20 }));
  assert.equal((await r.json()).best, 60);
  const endless = await (await fetch(`${BASE}/scores?board=endless`)).json();
  assert.equal(endless.board, 'endless');
  assert.equal(endless.scores.find(s => s.pid === pid).score, 60);
  const daily = await (await fetch(`${BASE}/scores?day=${day}`)).json();
  assert.equal(daily.scores.find(s => s.pid === pid).score, 10);
});

test('rejects unknown boards', async () => {
  assert.equal((await post(run(randomBytes(16).toString('hex'), { board: 'weekly' }))).status, 400);
  assert.equal((await fetch(`${BASE}/scores?board=weekly`)).status, 400);
});
