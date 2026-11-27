/* Lazy daily growth of created players (#564, league/growth.js + functions/lib/agents.js). Fails when
 *   - 0 days does not give the creation ratings, or day N differs between two runs (determinism),
 *   - a replay from a checkpoint differs from a replay from creation (any day, any player),
 *   - the overall passes the potential, an ability passes ABIL_MAX, or a hands-off player does not grow in his first season,
 *   - a bonus day does not change the numbers, or a player stops growing at the wrong time (retired: nothing after RETIRE_AGE),
 *   - the server: a player created 100 days ago shows other numbers than at creation, two reads differ, the checkpoint is not
 *     written back or changes the numbers, it leaks into the public row, a 系統 filler moves, or the stored creation ratings change.
 * Usage: node tests/growth.check.mjs */
import { createRequire } from 'node:module';
import { CREATE, makePlayer } from '../league/freeagents.js';
import { growTo, viewOf, checkpointOf, CKPT_EVERY } from '../league/growth.js';
import { ABIL_MAX, DAYS_PER_SEASON, overallOf } from '../league/training.js';
import { RETIRE_AGE } from '../league/callup.js';
import { choiceOf } from '../league/tools/train_sim.mjs';
import * as lib from '../functions/lib/agents.js';

const problems = [], bad = m => problems.push(m);
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const r = rng(564), same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const DAYS = [1, 7, 29, 30, 31, 100, DAYS_PER_SEASON, 400];

for (let i = 0; i < 40; i++) {
  const made = makePlayer(1000 + i * 7, choiceOf(i, r)), { player: p, ratings: R } = made, tag = `${p.id} (${p.role ? 'pit' : 'bat'})`;
  const v0 = viewOf(p, R, growTo(p, R, 0));
  for (const k of Object.keys(R)) if (k !== 'ovr' && v0.ratings[k] !== R[k]) bad(`${tag}: 0 days changes ${k} ${R[k]} -> ${v0.ratings[k]}`);
  if (v0.ratings.ovr !== R.ovr) bad(`${tag}: 0 days changes ovr ${R.ovr} -> ${v0.ratings.ovr}`);
  if (v0.player.age !== p.age) bad(`${tag}: 0 days changes the age`);
  for (const d of DAYS) {
    const full = growTo(p, R, d), again = growTo(p, R, d);
    if (!same(full, again)) bad(`${tag}: day ${d} is not deterministic`);
    for (const c of [1, 10, 30, 99]) if (c < d) {
      const mid = growTo(p, R, c), viaCkpt = growTo(p, R, d, JSON.parse(JSON.stringify(checkpointOf(mid))));
      if (!same(full.abil, viaCkpt.abil) || full.day !== viaCkpt.day) bad(`${tag}: checkpoint at ${c} differs from a replay at day ${d}`);
    }
    if (overallOf(full) > Math.max(R.pot, R.ovr)) bad(`${tag}: day ${d} overall ${overallOf(full)} passes the potential ${R.pot}`);
    for (const [k, x] of Object.entries(full.abil)) if (x > ABIL_MAX) bad(`${tag}: ${k} ${x} passes ${ABIL_MAX}`);
  }
  if (!p.role) { const g = viewOf(p, R, growTo(p, R, DAYS_PER_SEASON)); if (R.pot > R.ovr + 5 && g.ratings.ovr <= R.ovr) bad(`${tag}: no growth in a season (${R.ovr} -> ${g.ratings.ovr}, pot ${R.pot})`); }
  const bonus = { ...p, bonus: Object.fromEntries(Array.from({ length: 60 }, (_, d) => [d, 0.5])) };
  if (R.pot > R.ovr + 8 && overallOf(growTo(bonus, R, 60)) <= overallOf(growTo(p, R, 60))) bad(`${tag}: a 60-day bonus does not help`);
  const old = { ...p, age: RETIRE_AGE - 1 }, a = growTo(old, R, 5 * DAYS_PER_SEASON), b = growTo(old, R, 9 * DAYS_PER_SEASON);
  if (a.day !== DAYS_PER_SEASON || !same(a.abil, b.abil)) bad(`${tag}: a player reaching age ${RETIRE_AGE} keeps training (day ${a.day})`);
}

/* the server, against an in-memory SQLite (the shim of tests/agent.check.mjs) */
const { DatabaseSync } = (process.removeAllListeners('warning'), createRequire(import.meta.url)('node:sqlite'));
const sql = new DatabaseSync(':memory:');
const stmt = (text, args = []) => ({ bind: (...a) => stmt(text, a), first: async () => sql.prepare(text).get(...args) ?? null,
  run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }), all: async () => ({ results: sql.prepare(text).all(...args) }) });
const db = { prepare: t => stmt(t), batch: async l => { const o = []; for (const s of l) o.push(await s.run()); return o; } }, env = { DB: db };
const key = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
const call = async (h, { method = 'GET', url = '/api/x', k, body } = {}) => {
  const headers = { 'CF-Connecting-IP': '1.1.1.1' }; if (k) headers.authorization = `Bearer ${k}`;
  const res = await h({ request: new Request('https://dev.cloudball-3uy.pages.dev' + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const k = key();
await call(lib.register, { method: 'POST', k });
sql.prepare('UPDATE agents SET seed = 564001').run();   /* a fixed seed: this player has room to grow (a random one may sit at his potential) */
const choice = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look: { head: 3, skin: 2, hair: 5 }, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
const made = await call(lib.create, { method: 'POST', k, body: choice });
if (made.status !== 201) bad(`create: ${made.status}`);
const fresh = (await call(lib.mine, { k })).body.player;
if (!same(fresh.ratings, made.body.player.ratings)) bad('a player created just now must read his creation ratings');
const created0 = sql.prepare('SELECT ratings, created_at FROM players WHERE agent_id != ?1 AND agent_id NOT LIKE ?2').get('x', 'sys:%');
sql.prepare('UPDATE players SET created_at = created_at - ?1 WHERE ratings = ?2').run(100 * 86400000, created0.ratings);
const a = (await call(lib.mine, { k })).body.player, b = (await call(lib.mine, { k })).body.player;
if (same(a.ratings, fresh.ratings)) bad('a player created 100 days ago shows his creation numbers');
if (!same(a, b)) bad('two reads of the same day differ');
if ('ckpt' in a.player) bad('the checkpoint leaks into the public player');
const row = sql.prepare("SELECT player, ratings, ovr FROM players WHERE agent_id NOT LIKE 'sys:%'").get();
if (row.ratings !== created0.ratings) bad('the creation ratings in the row were changed');
const stored = JSON.parse(row.player).ckpt;
if (!stored || stored.day < 100 - CKPT_EVERY) bad('no checkpoint written back after 100 days');
if (row.ovr !== a.ratings.ovr && Math.abs(row.ovr - a.ratings.ovr) > 6) bad('the ovr column does not follow the checkpoint');
const list = (await call(lib.list, { url: '/api/freeagents?sort=new' })).body.players, mineRow = list.find(x => x.id === a.id);
if (!mineRow || !same(mineRow.ratings, a.ratings)) bad('the free-agent list shows other numbers than the player page');
const sys = list.filter(x => x.player.system), sysRaw = sql.prepare("SELECT ratings FROM players WHERE agent_id LIKE 'sys:%' ORDER BY pid").all().map(x => JSON.parse(x.ratings));
if (!sys.length || sys.some(x => x.ratings.ovr !== sysRaw.find(y => y.ovr === x.ratings.ovr)?.ovr)) bad('a 系統 filler grew');
const full = growTo(JSON.parse(row.player), JSON.parse(row.ratings), 100);
if (!same(viewOf(JSON.parse(row.player), JSON.parse(row.ratings), full).ratings, a.ratings)) bad('the server numbers differ from a full replay from creation');

if (problems.length) { console.error(`growth check FAILED (${problems.length}):\n` + problems.slice(0, 30).map(x => '  - ' + x).join('\n')); process.exit(1); }
console.log('growth check ok: determinism, checkpoint = full replay, potential and ABIL_MAX hold, bonus and retirement, server lazy growth + write-back');
