/* #807: the inactive sweep leaves the public GET and works in bounded chunks; the ckpt write-back is a compare-and-set.
 * Fake D1 over node:sqlite holding 20 000 fan players. Fails when
 *   - /api/freeagents (GET) runs the sweep, or one sweep call reads more than SWEEP_ROWS_PER_CALL rows;
 *   - the released set differs from league/inactive.js releaseInactive, or more than RELEASES_PER_DAY go in one day (the rest the next day);
 *   - a failing call makes the next one start over (total rows read over the day must stay about one table), or two calls at once release twice;
 *   - two concurrent readers both write the grown checkpoint back.
 * Usage: node tests/sweep.check.mjs */
import { createRequire } from 'node:module';
import * as lib from '../functions/lib/agents.js';
import { releaseInactive, INACTIVE_DAYS } from '../league/inactive.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = (process.removeAllListeners('warning'), require('node:sqlite'));
const problems = [], bad = m => problems.push(m), DMS = 86400000;

const makeDb = () => {
  const sql = new DatabaseSync(':memory:'), st = { read: 0, writes: [], failBatch: 0 };
  const stmt = (text, args = []) => ({
    bind: (...a) => stmt(text, a),
    first: async () => sql.prepare(text).get(...args) ?? null,
    run: async () => { const c = Number(sql.prepare(text).run(...args).changes); st.writes.push([text, c]); return { meta: { changes: c } }; },
    all: async () => { const r = sql.prepare(text).all(...args); if (/FROM players/.test(text)) st.read += r.length; return { results: r }; },
  });
  return { sql, st, prepare: t => stmt(t), batch: async list => { if (st.failBatch > 0 && list.length > 3) { st.failBatch--; throw new Error('boom'); } const out = []; for (const s of list) out.push(await s.run()); return out; } };
};
const now = Date.now(), day = Math.floor(now / DMS);
const N = 20000, INACTIVE = 120;

const build = () => {
  const db = makeDb();
  const ready = lib.list({ request: new Request('https://dev.cloudball-3uy.pages.dev/api/freeagents'), env: { DB: db } });   /* creates the schema */
  return { db, ready };
};
const fill = db => {
  const ins = db.sql.prepare("INSERT INTO players (agent_id, pid, name, kind, ovr, player, ratings, created_at) VALUES (?, ?, ?, 'bat', 50, '{}', '{}', ?)");
  const seen = db.sql.prepare('INSERT INTO agent_seen (agent_id, day) VALUES (?, ?)'), agent = db.sql.prepare('INSERT INTO agents (id, seed, created_at) VALUES (?, 1, ?)');
  db.sql.exec('BEGIN');
  for (let i = 0; i < N; i++) {
    const id = 'a' + String(i).padStart(63, '0');
    agent.run(id, now); ins.run(id, 'p' + i, 'n' + i, now - 400 * DMS);
    seen.run(id, i % 167 === 0 && i / 167 < INACTIVE ? day - INACTIVE_DAYS - 1 : day - 1);      /* 120 fans silent for 31 days */
  }
  db.sql.exec('COMMIT');
};
const expected = db => {
  const rows = db.sql.prepare("SELECT p.agent_id a, p.pid, p.created_at c, s.day seen FROM players p LEFT JOIN agent_seen s ON s.agent_id = p.agent_id WHERE p.agent_id NOT LIKE 'sys:%' AND p.agent_id NOT LIKE 'free:%'").all();
  const players = {}, lastSeen = {}; for (const r of rows) { players[r.pid] = { owner: r.a, created: Math.floor(r.c / DMS) }; if (r.seen != null) lastSeen[r.a] = r.seen; }
  return releaseInactive(players, { today: day, lastSeen }).released;
};

/* 1. chunks: bounded reads, budget per day, the whole set over several days, same as releaseInactive */
{
  const { db, ready } = build(); await ready; fill(db);
  const want = expected(db); if (want.length !== INACTIVE) bad(`test setup: expected ${INACTIVE} inactive, got ${want.length}`);
  const got = []; let maxRead = 0;
  for (let d = 0; d < 4; d++) {
    const before = got.length;
    for (let guard = 0; guard < 500; guard++) {
      const r0 = db.st.read; const out = await lib.sweepInactive(db, now + d * DMS); maxRead = Math.max(maxRead, db.st.read - r0); got.push(...out);
      if (!out.length && db.sql.prepare("SELECT v FROM meta WHERE k = 'inactive_swept'").get()?.v === String(day + d)) break;
    }
    if (got.length - before > lib.RELEASES_PER_DAY) bad(`day ${d}: released ${got.length - before} (> RELEASES_PER_DAY ${lib.RELEASES_PER_DAY})`);
    if (d === 0 && got.length !== lib.RELEASES_PER_DAY) bad(`day 0 released ${got.length}, want exactly RELEASES_PER_DAY (${INACTIVE} are due)`);
  }
  if (maxRead > lib.SWEEP_ROWS_PER_CALL) bad(`one sweep call read ${maxRead} rows (> ${lib.SWEEP_ROWS_PER_CALL})`);
  if (JSON.stringify([...got].sort()) !== JSON.stringify([...want].sort())) bad(`released ${got.length} players, releaseInactive says ${want.length} (or different ones)`);
  if (new Set(got).size !== got.length) bad('a player was released twice');
}

/* 2. a failing chunk: the next call continues, the day does not start over */
{
  const { db, ready } = build(); await ready; fill(db);
  const want = expected(db).slice(0, 30).length; void want;
  db.st.failBatch = 0; const r0 = db.st.read; let fails = 0, out = [];
  for (let i = 0; i < 400; i++) {
    if (i % 17 === 5) db.st.failBatch = 1;
    try { out = await lib.sweepInactive(db, now); } catch (e) { fails++; }
    if (db.sql.prepare("SELECT v FROM meta WHERE k = 'inactive_swept'").get()?.v === String(day)) break;
  }
  const read = db.st.read - r0;
  if (!fails) bad('test setup: no call failed');
  if (read > N + lib.SWEEP_ROWS_PER_CALL * (fails + 4)) bad(`after ${fails} failing calls the day read ${read} rows for a ${N} row table: a failure made the sweep start over`);
}

/* 3. two calls at once: one chunk, one winner */
{
  const { db, ready } = build(); await ready; fill(db);
  const [a, b] = await Promise.all([lib.sweepInactive(db, now), lib.sweepInactive(db, now)]);
  const notes = db.sql.prepare('SELECT COUNT(*) n FROM releases').get().n;
  if (notes !== new Set([...a, ...b]).size || (a.length && b.length && a.some(x => b.includes(x)))) bad('two concurrent sweep calls released the same player twice');
  const cur = db.sql.prepare("SELECT v FROM meta WHERE k = 'inactive_cursor'").get().v;
  if (Number(cur.split(':')[0]) > lib.SWEEP_ROWS_PER_CALL * 2) bad(`cursor ${cur} moved more than the claimed chunk`);
}

/* 4. the public GET never sweeps */
{
  const { db, ready } = build(); await ready; fill(db);
  const res = await lib.list({ request: new Request('https://dev.cloudball-3uy.pages.dev/api/freeagents?page=0&sort=new'), env: { DB: db } });
  if (res.status !== 200) bad(`list answered ${res.status}`);
  if (db.sql.prepare("SELECT COUNT(*) n FROM meta WHERE k LIKE 'inactive_%'").get().n) bad('GET /api/freeagents touched the sweep state');
  if (db.sql.prepare('SELECT COUNT(*) n FROM releases').get().n) bad('GET /api/freeagents released a player');
}

/* 5. ckpt write-back: two readers at once, one write */
{
  const db = makeDb(), env = { DB: db }, k = [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
  const call = (h, o = {}) => h({ request: new Request('https://dev.cloudball-3uy.pages.dev' + (o.url || '/api/x'), { method: o.method || 'GET', headers: { 'CF-Connecting-IP': '5.5.5.5', ...(o.k ? { authorization: 'Bearer ' + o.k } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }), env });
  await call(lib.register, { method: 'POST' }); await call(lib.register, { method: 'POST', k });
  const choice = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look: { head: 3, skin: 2, hair: 5 }, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
  let made = 0; for (let i = 0; i <= lib.DRAW_CAP && !made; i++) made = (await call(lib.create, { method: 'POST', k, body: { ...choice, nameDraw: i } })).status === 201;
  if (!made) bad('ckpt test: could not create a player');
  db.sql.prepare('UPDATE players SET created_at = ? WHERE agent_id NOT LIKE ?').run(now - 60 * DMS, 'sys:%');
  db.st.writes.length = 0;
  await Promise.all([call(lib.list, { url: '/api/freeagents?sort=new' }), call(lib.list, { url: '/api/freeagents?sort=new' })]);
  const wrote = db.st.writes.filter(([t, c]) => /^UPDATE players SET player/.test(t) && c > 0).length;
  if (wrote !== 1) bad(`two concurrent readers wrote the checkpoint ${wrote} times (want 1)`);
  const tried = db.st.writes.filter(([t]) => /^UPDATE players SET player/.test(t)).length;
  if (tried < 2) bad('ckpt test setup: both readers should have tried to write');
}

if (problems.length) { console.error('sweep.check FAILED:'); for (const m of problems) console.error('  ' + m); process.exit(1); }
console.log('OK: sweep chunks <= SWEEP_ROWS_PER_CALL rows, <= RELEASES_PER_DAY a day, resumes after a failure, GET never sweeps, ckpt written once.');
