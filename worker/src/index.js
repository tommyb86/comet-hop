// Comet Hop leaderboards.
//
// GET  /scores?day=YYYY-MM-DD  -> that day's Daily top 50 (defaults to today, UTC)
// GET  /scores?board=endless   -> the all-time Endless top 50
// POST /scores                 -> submit a run; keeps each player's best per board
//
// Players have no accounts. The game makes a random private key on each device
// and sends it with every score; we store only its SHA-256, so nobody can post
// over someone else's row without that device's key. The first 12 hex digits of
// the hash are the public id the game uses to highlight "you".

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[0-9a-f]{32,64}$/;
const NICK_RE = /^[\p{L}\p{N} _.'-]{1,20}$/u;
const MAX_BODY = 1024;
const MIN_GAP_MS = 2000; // per player per board, between submissions

// Each board is a table keyed by player, plus the day for Daily.
const BOARDS = {
  daily: { table: 'scores', keys: ['day', 'player'] },
  endless: { table: 'endless', keys: ['player'] },
};

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
    const cors = {
      'Access-Control-Allow-Origin': allowed.includes(origin) ? origin : (allowed[0] || '*'),
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400',
      'Vary': 'Origin',
    };
    const json = (data, status = 200) =>
      new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...cors } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (url.pathname !== '/scores') return json({ error: 'not_found' }, 404);

    try {
      if (req.method === 'GET') {
        const board = url.searchParams.get('board') || 'daily';
        if (board === 'endless') return json(await listScores(env, 'endless'));
        if (board !== 'daily') throw new BadRequest('bad_board');
        return json(await listScores(env, 'daily', url.searchParams.get('day') || utcDay(0)));
      }
      if (req.method === 'POST') {
        if (allowed.length && !allowed.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);
        return await submitScore(req, env, json);
      }
      return json({ error: 'method_not_allowed' }, 405);
    } catch (e) {
      if (e instanceof BadRequest) return json({ error: e.message }, 400);
      console.error(e);
      return json({ error: 'server_error' }, 500);
    }
  },
};

class BadRequest extends Error {}

function utcDay(offsetDays) {
  return new Date(Date.now() + offsetDays * 86400000).toISOString().slice(0, 10);
}

async function sha256hex(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function listScores(env, board, day) {
  const { table } = BOARDS[board];
  if (board === 'daily' && !DAY_RE.test(day)) throw new BadRequest('bad_day');
  const where = board === 'daily' ? 'WHERE day = ?1' : '';
  const args = board === 'daily' ? [day] : [];
  const { results } = await env.DB.prepare(
    `SELECT substr(player, 1, 12) AS pid, nickname, score, hops, bulls, chain
       FROM ${table} ${where}
      ORDER BY score DESC, updated_at ASC LIMIT 50`
  ).bind(...args).all();
  const { n } = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table} ${where}`).bind(...args).first();
  return board === 'daily' ? { board, day, total: n, scores: results } : { board, total: n, scores: results };
}

function int(v, name, max) {
  if (!Number.isInteger(v) || v < 0 || v > max) throw new BadRequest('bad_' + name);
  return v;
}

async function submitScore(req, env, json) {
  const text = await req.text();
  if (text.length > MAX_BODY) throw new BadRequest('too_large');
  let body;
  try { body = JSON.parse(text); } catch { throw new BadRequest('bad_json'); }
  if (!body || typeof body !== 'object') throw new BadRequest('bad_json');

  const board = body.board === undefined ? 'daily' : body.board;
  if (!BOARDS[board]) throw new BadRequest('bad_board');
  const { table, keys } = BOARDS[board];
  const { day, key } = body;
  // Allow yesterday too, so a run that ends just after midnight UTC still counts.
  if (board === 'daily' && day !== utcDay(0) && day !== utcDay(-1)) throw new BadRequest('bad_day');
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw new BadRequest('bad_key');
  const nickname = typeof body.nickname === 'string' ? body.nickname.trim().replace(/\s+/g, ' ') : '';
  if (!NICK_RE.test(nickname)) throw new BadRequest('bad_nickname');
  const hops = int(body.hops, 'hops', 5000);
  const bulls = int(body.bulls, 'bulls', hops);
  const chain = int(body.chain, 'chain', bulls);
  const score = int(body.score, 'score', 1000000);
  // Loose ceiling: bullseye chains grow quadratically, plus skips, bosses and stardust.
  if (score > (hops + 1) * (hops + 20) + 100) throw new BadRequest('implausible_score');

  const player = await sha256hex(key);
  const now = new Date();
  const keyVals = board === 'daily' ? [day, player] : [player];
  const match = keys.map((k, i) => `${k} = ?${i + 1}`).join(' AND ');
  const prev = await env.DB.prepare(`SELECT score, updated_at FROM ${table} WHERE ${match}`).bind(...keyVals).first();
  if (prev && now - new Date(prev.updated_at) < MIN_GAP_MS) return json({ error: 'too_fast' }, 429);

  // Keep the best run; a new nickname always applies.
  const cols = [...keys, 'nickname', 'score', 'hops', 'bulls', 'chain', 'updated_at'];
  await env.DB.prepare(
    `INSERT INTO ${table} (${cols.join(', ')})
     VALUES (${cols.map((_, i) => '?' + (i + 1)).join(', ')})
     ON CONFLICT (${keys.join(', ')}) DO UPDATE SET
       nickname = excluded.nickname,
       hops  = CASE WHEN excluded.score > ${table}.score THEN excluded.hops  ELSE ${table}.hops  END,
       bulls = CASE WHEN excluded.score > ${table}.score THEN excluded.bulls ELSE ${table}.bulls END,
       chain = CASE WHEN excluded.score > ${table}.score THEN excluded.chain ELSE ${table}.chain END,
       score = MAX(${table}.score, excluded.score),
       updated_at = excluded.updated_at`
  ).bind(...keyVals, nickname, score, hops, bulls, chain, now.toISOString()).run();

  return json({ ok: true, pid: player.slice(0, 12), best: Math.max(score, prev ? prev.score : 0) });
}
