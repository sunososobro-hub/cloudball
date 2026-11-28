/* #795 part 4: the 經紀人 set store (functions/lib/agentset_store.js, route functions/api/player/agentset.js) against an in-memory SQLite
 * behind the same small D1 shim as agent.check.mjs. Fails when
 *   - without the DB binding, or on a production host, the route answers anything but 503 closed; a call without a valid key is let in;
 *   - a fan without a player gets anything but 404 none; a fresh player does not read the default (all-neutral) set of his kind;
 *   - a set off league/agentset.js (unknown cell, level out of range, over the points pool) or of the other kind is accepted;
 *   - a save is not read back in its canonical (freezeSet) form, or a cell equal to what it inherits changes the stored text;
 *   - a changed save writes more than the fan's one guild_saves row (the table gets a row per save, or another table grows);
 *     an unchanged save writes anything (text or counter); a save past SAVES_PER_DAY is accepted;
 *   - a set saved for a released player applies to the agent's next player;
 *   - an old guild_saves table without the agentset column is not migrated.
 * Usage: node tests/agentset_store.check.mjs */
import { createRequire } from 'node:module';
import * as lib from '../functions/lib/agents.js';
import * as store from '../functions/lib/agentset_store.js';
import * as route from '../functions/api/player/agentset.js';
import { SAVES_PER_DAY } from '../functions/lib/caps.js';
import { AGENT_POOL, LEVEL_NEUTRAL, LEVEL_MAX, freezeSet } from '../league/agentset.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = (process.removeAllListeners('warning'), require('node:sqlite'));
const problems = [], bad = m => problems.push(m);
const makeDb = () => {
  const sql = new DatabaseSync(':memory:');
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
    all: async () => ({ results: sql.prepare(text).all(...args) }),
  });
  return { sql, prepare: t => stmt(t), batch: async list => { const out = []; for (const s of list) out.push(await s.run()); return out; } };
};
const HOST = 'https://dev.cloudball-3uy.pages.dev';
const key = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
let ipN = 0;
const call = async (handler, env, { method = 'GET', k, body, host = HOST } = {}) => {
  const headers = { 'CF-Connecting-IP': `10.1.0.${++ipN}` }; if (k) headers.authorization = `Bearer ${k}`;
  const res = await handler({ request: new Request(host + '/api/player/agentset', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const is = (what, r, status, why) => { if (r.status !== status || (why && r.body?.why !== why)) bad(`${what}: expected ${status}${why ? ' ' + why : ''}, got ${r.status} ${JSON.stringify(r.body)}`); };
const look = { head: 3, skin: 2, hair: 5 };
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 66, ctrl: 62, arm: 55 }, nameDraw: 0 };

if (route.onRequestGet !== store.getSet || route.onRequestPost !== store.saveSet) bad('the route must serve getSet (GET) and saveSet (POST)');
for (const [h, method] of [[store.getSet, 'GET'], [store.saveSet, 'POST']]) {
  const a = await call(h, {}, { method, k: key() }), b = await call(h, { DB: makeDb() }, { method, k: key(), host: 'https://cloudball-3uy.pages.dev' });
  for (const r of [a, b]) if (r.status !== 503 || r.body?.why !== 'closed') bad(`agentset ${method} must answer 503 closed (no binding / production), got ${r.status}`);
}

const db = makeDb(), env = { DB: db };
const post = (h, k, body) => call(h, env, { method: 'POST', k, body });
const mk = async (k, c) => { for (let n = 0; n <= lib.DRAW_CAP; n++) { const r = await post(lib.create, k, { ...c, nameDraw: n }); if (r.status === 201) return r.body.player; } bad('no free name'); return null; };
const [ka, kb, kc] = [key(), key(), key()];
for (const k of [ka, kb, kc]) is('register', await post(lib.register, k), 201);
is('GET without a key', await call(store.getSet, env), 401, 'key');
is('POST without a key', await call(store.saveSet, env, { method: 'POST', body: { set: { v: 1, kind: 'bat' } } }), 401, 'key');
is('GET without a player', await call(store.getSet, env, { k: kc }), 404, 'none');
is('POST without a player', await post(store.saveSet, kc, { set: { v: 1, kind: 'bat', rows: {} } }), 404, 'none');

const pa = await mk(ka, BAT); await mk(kb, PIT);
const g0 = await call(store.getSet, env, { k: ka }); is('GET fresh batter', g0, 200);
if (JSON.stringify(g0.body?.set) !== JSON.stringify({ v: 1, kind: 'bat', rows: {} }) || g0.body?.pool !== AGENT_POOL.bat || g0.body?.used !== AGENT_POOL.bat) bad(`a fresh batter must read the default set, got ${JSON.stringify(g0.body)}`);
const gp = await call(store.getSet, env, { k: kb });
if (gp.body?.kind !== 'pit' || gp.body?.set?.kind !== 'pit') bad('a fresh pitcher must read the default pit set');

const rowsOf = t => db.sql.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
const tables = () => db.sql.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(r => r.name).sort();
const total = () => tables().reduce((n, t) => n + rowsOf(t), 0);
const saveRow = k => db.sql.prepare('SELECT s.agentset, s.saves_today FROM guild_saves s JOIN players p ON p.agent_id = s.agent_id WHERE p.pid = ?').get(k);

for (const [what, set] of [['no body set', undefined], ['unknown frequency', { v: 1, kind: 'bat', rows: { normal: { fastball: 3 } } }],
  ['level out of range', { v: 1, kind: 'bat', rows: { normal: { steal: LEVEL_MAX + 1 } } }],
  ['over the pool', { v: 1, kind: 'bat', rows: { normal: { steal: LEVEL_MAX, bunt: LEVEL_MAX, swing_early: LEVEL_MAX } } }],
  ['other kind', { v: 1, kind: 'pit', rows: {} }], ['not an object', 'x']]) is(`save ${what}`, await post(store.saveSet, ka, set === undefined ? {} : { set }), 400, 'invalid');
if (rowsOf('guild_saves')) bad('a refused save must write nothing');

/* steal up in two outs, bunt down there; swing_early in late_close equal to what it inherits (dropped by freezeSet) */
const S1 = { v: 1, kind: 'bat', rows: { two_outs: { steal: LEVEL_NEUTRAL + 1, bunt: LEVEL_NEUTRAL - 1 }, late_close: { swing_early: LEVEL_NEUTRAL } } };
const before = total(), s1 = await post(store.saveSet, ka, { set: S1 }); is('save S1', s1, 200);
if (s1.body?.saved !== true) bad('the first save must say saved:true');
if (total() - before !== 1 || rowsOf('guild_saves') !== 1) bad(`the first save must add exactly the fan's one guild_saves row, added ${total() - before}`);
const canon = freezeSet(S1), r1 = await call(store.getSet, env, { k: ka });
if (JSON.stringify(r1.body?.set) !== JSON.stringify(canon)) bad(`read back ${JSON.stringify(r1.body?.set)}, want ${JSON.stringify(canon)}`);
if (r1.body?.set?.rows?.late_close) bad('a cell equal to what it inherits must not be stored');
const t1 = saveRow(pa.id);
const same = await post(store.saveSet, ka, { set: { ...S1, rows: { two_outs: S1.rows.two_outs } } }); is('save the same grid again', same, 200);
if (same.body?.saved !== false || JSON.stringify(saveRow(pa.id)) !== JSON.stringify(t1)) bad('an unchanged save must write nothing (text and counter)');

/* the daily cap: SAVES_PER_DAY changed saves in all, the next is 429 */
for (let i = 2; i <= SAVES_PER_DAY; i++) {
  /* level pairs (a, 2 * LEVEL_NEUTRAL - a) keep the points spent at the pool; two rows give enough distinct grids */
  const a = i % (LEVEL_MAX + 1), b = Math.floor(i / (LEVEL_MAX + 1)) % (LEVEL_MAX + 1), pair = x => ({ steal: x, bunt: 2 * LEVEL_NEUTRAL - x });
  const set = { v: 1, kind: 'bat', rows: { runners_on: pair(a), two_outs: pair(b) } };
  const r = await post(store.saveSet, ka, { set }); if (r.status !== 200 || r.body?.saved !== true) { bad(`save ${i} of ${SAVES_PER_DAY}: ${r.status} ${JSON.stringify(r.body)}`); break; }
}
if (rowsOf('guild_saves') !== 1) bad('repeated saves must keep one row per fan');
is(`save ${SAVES_PER_DAY + 1}`, await post(store.saveSet, ka, { set: { v: 1, kind: 'bat', rows: { late_close: { swing_early: LEVEL_NEUTRAL + 1, bunt: LEVEL_NEUTRAL - 1 } } } }), 429, 'limit');
const other = await post(store.saveSet, kb, { set: { v: 1, kind: 'pit', rows: { risp: { pickoff: LEVEL_NEUTRAL + 1, edges: LEVEL_NEUTRAL - 1 } } } });
if (other.status !== 200 || other.body?.saved !== true) bad('one fan at the cap must not spend another fan\'s saves');

/* a released player's set does not follow the agent to his next player */
is('release', await post(lib.release, ka), 200);
is('GET after release', await call(store.getSet, env, { k: ka }), 404, 'none');
await mk(ka, BAT);
const fresh = await call(store.getSet, env, { k: ka });
if (JSON.stringify(fresh.body?.set) !== JSON.stringify({ v: 1, kind: 'bat', rows: {} })) bad(`the next player must start from the default set, got ${JSON.stringify(fresh.body?.set)}`);
if (store.storedSet('not json', 'p', 'bat').rows === undefined || store.storedSet(JSON.stringify({ pid: 'p', set: { v: 1, kind: 'bat', rows: { normal: { steal: 99 } } } }), 'p', 'bat').rows.normal) bad('an unreadable or invalid stored value must read as the default set');

/* migration: a guild_saves table made before #795 part 4 */
{
  const odb = makeDb();
  odb.sql.exec('CREATE TABLE guild_saves (agent_id TEXT PRIMARY KEY, saved_day INTEGER NOT NULL DEFAULT 0, saves_today INTEGER NOT NULL DEFAULT 0)');
  odb.sql.exec("INSERT INTO guild_saves (agent_id, saves_today) VALUES ('old', 3)");
  const k = key(), oenv = { DB: odb };
  is('register (old table)', await call(lib.register, oenv, { method: 'POST', k }), 201);
  const cols = odb.sql.prepare("SELECT name FROM pragma_table_info('guild_saves')").all().map(r => r.name);
  if (!cols.includes('agentset')) bad('an old guild_saves table must get the agentset column');
  if (odb.sql.prepare("SELECT saves_today AS n FROM guild_saves WHERE agent_id = 'old'").get()?.n !== 3) bad('the migration must keep the old rows');
}

if (problems.length) { console.error('agentset store check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`agentset store check ok: closed off dev, keyed, validated against the pool, canonical one-row overwrite, unchanged = no write, cap ${SAVES_PER_DAY}/day, released player resets, old table migrated`);
