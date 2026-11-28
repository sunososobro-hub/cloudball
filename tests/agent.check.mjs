/* Fan agents and created free agents on the dev site (functions/, #179). Runs the real handlers of functions/lib/agents.js
 * against an in-memory SQLite behind a small D1 shim (node:sqlite). Fails when
 *   - the host rule of the functions differs from ui/site.js for any sample host name;
 *   - without the DB binding, or on a production host, any route answers anything but 503 {"ok":false,"why":"closed"};
 *   - a call without a valid key is let in, or the key is stored in the clear (only its SHA-256 is);
 *   - a second agent from one address over the daily cap, or the daily total cap, is let in;
 *   - the abuse tables hold anything but a day and a salted hash, keep an older day, or sit next to an agent;
 *   - a draw past the cap is answered, a choice off the rules is accepted, a second player of one agent is accepted,
 *     or two players get the same name;
 *   - the public list shows an agent id, or its order or paging is wrong;
 *   - (#437) the 系統 fillers are not seeded once per kind with system:true, a fan does not replace the oldest filler of his kind
 *     (or replaces another kind / a fan), or a store without fillers breaks create;
 *   - (#628 part 2) the daily sweep releases a fan seen 29 days ago, keeps one seen 30 days ago from being released, ignores 系統 and free players,
 *     treats a fan never seen as seen on his created day, runs once a day, lets the old agent reclaim, and a keyed call records the day only;
 *   - (#438) the start place is not stored (default 二軍), an unknown place is accepted, or a move changes anything but the place.
 * Usage: node tests/agent.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as lib from '../functions/lib/agents.js';
import { INACTIVE_DAYS } from '../league/inactive.js';
import { drawName, CREATE, DEFAULT_PLACE, placeOf } from '../league/freeagents.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = (process.removeAllListeners('warning'), require('node:sqlite'));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);

/* the host rule */
const siteJs = readFileSync(path.join(ROOT, 'ui/site.js'), 'utf8');
for (const h of ['cloudball-3uy.pages.dev', 'dev.cloudball-3uy.pages.dev', 'a1b2c3.cloudball-3uy.pages.dev', 'localhost', '127.0.0.1', '[::1]', '', 'example.com',
  'evilcloudball-3uy.pages.dev', 'cloudball-3uy.pages.dev.example.com']) {
  const ctx = { location: { hostname: h }, document: { documentElement: { dataset: {} } } }; ctx.globalThis = ctx; vm.runInNewContext(siteJs, ctx);
  if (ctx.SITE.dev !== lib.isDev(h)) bad(`host "${h}": ui/site.js says dev=${ctx.SITE.dev}, functions/lib/agents.js says ${lib.isDev(h)}`);
}

/* a D1 shim over node:sqlite: prepare().bind().first()/run()/all(), batch() */
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
const call = async (handler, env, { method = 'GET', url = '/api/x', k, ip = '1.1.1.1', body, host = HOST } = {}) => {
  const headers = { 'CF-Connecting-IP': ip }; if (k) headers.authorization = `Bearer ${k}`;
  const res = await handler({ request: new Request(host + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const look = { head: 3, skin: 2, hair: 5 };
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 66, ctrl: 62, arm: 55 }, nameDraw: 0 };
const is = (what, r, status, why) => { if (r.status !== status || (why && r.body?.why !== why)) bad(`${what}: expected ${status}${why ? ' ' + why : ''}, got ${r.status} ${JSON.stringify(r.body)}`); };

/* closed: no binding, and a production host with a binding */
const ROUTES = [[lib.register, 'POST'], [lib.draw, 'GET'], [lib.mine, 'GET'], [lib.create, 'POST'], [lib.list, 'GET'], [lib.release, 'POST'], [lib.reclaim, 'POST'], [lib.place, 'POST']];
for (const [h, method] of ROUTES) {
  const none = await call(h, {}, { method, k: key() });
  if (none.status !== 503 || JSON.stringify(none.body) !== '{"ok":false,"why":"closed"}') bad(`no DB binding: expected 503 closed, got ${none.status} ${JSON.stringify(none.body)}`);
  const prod = await call(h, { DB: makeDb() }, { method, k: key(), host: 'https://cloudball-3uy.pages.dev' });
  if (prod.status !== 503 || prod.body?.why !== 'closed') bad(`production host: expected 503 closed, got ${prod.status} ${JSON.stringify(prod.body)}`);
}

/* register */
const db = makeDb(), env = { DB: db };
const k1 = key(), k2 = key(), k3 = key();
is('register without a key', await call(lib.register, env, { method: 'POST' }), 400, 'key');
is('register with a short key', await call(lib.register, env, { method: 'POST', k: 'abcd' }), 400, 'key');
is('register', await call(lib.register, env, { method: 'POST', k: k1 }), 201);
const again = await call(lib.register, env, { method: 'POST', k: k1 }); is('register again', again, 200); if (again.body?.new !== false) bad('registering the same key again must say new:false');
const stored = JSON.stringify(db.sql.prepare('SELECT * FROM agents').all());
if (stored.includes(k1)) bad('the key is stored in the clear');
const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k1)))].map(b => b.toString(16).padStart(2, '0')).join('');
if (!stored.includes(hash)) bad('agents.id is not SHA-256 of the key');
is('no key on draw', await call(lib.draw, env), 401, 'key');
is('unknown key on draw', await call(lib.draw, env, { k: key() }), 401, 'unknown');

/* abuse caps: per address, then in total */
for (let i = 1; i < lib.AGENTS_PER_ADDRESS_PER_DAY; i++) is(`agent ${i + 1} of one address`, await call(lib.register, env, { method: 'POST', k: key() }), 201);
is('one address over its cap', await call(lib.register, env, { method: 'POST', k: key() }), 429, 'limit');
is('another address', await call(lib.register, env, { method: 'POST', k: k2, ip: '2.2.2.2' }), 201);
const tables = db.sql.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(r => r.name);
const seenCols = db.sql.prepare('PRAGMA table_info(reg_seen)').all().map(c => c.name).join();
if (seenCols !== 'day,h') bad(`reg_seen must hold only day and h, has ${seenCols}`);
const seen = db.sql.prepare('SELECT * FROM reg_seen').all();
if (seen.some(r => r.h.includes('1.1.1.1') || r.h.includes('2.2.2.2'))) bad('an address is stored in the clear');
for (const t of tables) if (!['agents', 'players', 'reg_salt', 'reg_seen', 'releases', 'meta', 'agent_seen', 'guilds', 'guild_members', 'guild_fans', 'guild_saves', 'guild_lineups'].includes(t)) bad(`unexpected table ${t}`);
db.sql.prepare("UPDATE reg_seen SET day='2000-01-01'").run(); db.sql.prepare("UPDATE reg_salt SET day='2000-01-01'").run();
is('a new day', await call(lib.register, env, { method: 'POST', k: k3, ip: '3.3.3.3' }), 201);
if (db.sql.prepare("SELECT COUNT(*) n FROM reg_seen WHERE day < date('now')").get().n || db.sql.prepare("SELECT COUNT(*) n FROM reg_salt WHERE day < date('now')").get().n) bad('rows of an older day were not deleted');
const small = makeDb(), tiny = { DB: small }, DAY = new Date().toISOString().slice(0, 10);
is('first agent of a fresh database', await call(lib.register, tiny, { method: 'POST', k: key() }), 201);
small.sql.prepare('DELETE FROM reg_seen').run();
for (let i = 0; i < lib.AGENTS_PER_DAY; i++) small.sql.prepare('INSERT INTO reg_seen VALUES (?, ?)').run(DAY, 'h' + i);
is('the daily total over its cap', await call(lib.register, tiny, { method: 'POST', k: key(), ip: '9.9.9.9' }), 429, 'limit');

/* draw */
const d0 = await call(lib.draw, env, { k: k1, url: '/api/agent/draw?n=0' }); is('draw 0', d0, 200);
const seed = db.sql.prepare('SELECT seed FROM agents WHERE id = ?').get(hash).seed >>> 0;
if (d0.body?.name !== drawName(seed, 0)) bad('draw 0 is not drawName(seed, 0) of the agent');
is('draw at the cap', await call(lib.draw, env, { k: k1, url: `/api/agent/draw?n=${lib.DRAW_CAP}` }), 200);
is('draw past the cap', await call(lib.draw, env, { k: k1, url: `/api/agent/draw?n=${lib.DRAW_CAP + 1}` }), 400, 'cap');
is('draw with junk', await call(lib.draw, env, { k: k1, url: '/api/agent/draw?n=-1' }), 400, 'cap');

/* create */
is('player of a new agent', await call(lib.mine, env, { k: k1 }), 200);
if ((await call(lib.mine, env, { k: k1 })).body?.player !== null) bad('a new agent has no player');
is('create with free text', await call(lib.create, env, { method: 'POST', k: k1, body: { ...BAT, nickname: 'x' } }), 400, 'invalid');
is('create over the budget', await call(lib.create, env, { method: 'POST', k: k1, body: { ...BAT, points: { ...BAT.points, pow: 70 } } }), 400, 'invalid');
is('create past the draw cap', await call(lib.create, env, { method: 'POST', k: k1, body: { ...BAT, nameDraw: lib.DRAW_CAP + 1 } }), 400, 'invalid');
is('create without a body', await call(lib.create, env, { method: 'POST', k: k1 }), 400, 'invalid');
/* the agent's seed is random and a 系統 filler may hold the first name drawn: use the first free draw, as the page does (#437) */
let nd = 0; while (nd < lib.DRAW_CAP && (await call(lib.draw, env, { k: k1, url: `/api/agent/draw?n=${nd}` })).body?.taken) nd++;
const ownBat = { ...BAT, nameDraw: nd };
const made = await call(lib.create, env, { method: 'POST', k: k1, body: ownBat }); is('create', made, 201);
if (made.body?.player?.name !== drawName(seed, nd)) bad('the created player does not carry the drawn name');
if (made.body?.player?.player?.id !== `fa-${seed.toString(36)}`) bad('the player was not made from the seed the server made');
is('create a second player', await call(lib.create, env, { method: 'POST', k: k1, body: ownBat }), 409, 'already');
const mineNow = await call(lib.mine, env, { k: k1 }); if (mineNow.body?.player?.name !== made.body?.player?.name) bad('GET /api/player does not give the created player back');
if (DEFAULT_PLACE !== 'second' || mineNow.body?.player?.player?.place !== 'second') bad(`a create without a place must start in 二軍, got ${mineNow.body?.player?.player?.place}`);
is('create with the points moved by a client-made seed', await call(lib.create, env, { method: 'POST', k: k2, body: { ...PIT, seed: 5 } }), 400, 'invalid');
/* the same name for two agents: marked taken in the draw, refused at the create */
const id2 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k2)))].map(b => b.toString(16).padStart(2, '0')).join('');
db.sql.prepare('UPDATE agents SET seed = ? WHERE id = ?').run(seed, id2);
const shown = await call(lib.draw, env, { k: k2, url: `/api/agent/draw?n=${nd}` });
if (shown.body?.taken !== true) bad('a name already taken is not marked taken in the draw');
is('create with a taken name', await call(lib.create, env, { method: 'POST', k: k2, body: ownBat }), 409, 'name');

/* #435 release + reclaim: switch, reclaim, reclaim after another agent took him (refused), two rapid switches */
{ const rdb = makeDb(), renv = { DB: rdb }, ka = key(), kb = key(), post = (h, k, body) => call(h, renv, { method: 'POST', k, body });
  const mk = async (k, ip, c) => { const reg = await call(lib.register, renv, { method: 'POST', k, ip }); if (reg.status !== 201 && reg.status !== 200) bad('register ' + reg.status);
    for (c.nameDraw = 0; c.nameDraw <= lib.DRAW_CAP; c.nameDraw++) { const r = await call(lib.create, renv, { method: 'POST', k, body: c }); if (r.status === 201) return r.body.player; } bad('no free name'); return null; };
  const pa = await mk(ka, '5.5.5.1', { ...BAT }), pb = await mk(kb, '5.5.5.2', { ...PIT });
  is('release without a key', await call(lib.release, renv, { method: 'POST' }), 401, 'key');
  is('release when a new agent has no player', await post(lib.release, key()), 401, 'unknown');
  const rel = await post(lib.release, ka); is('release', rel, 200);
  const row = rdb.sql.prepare('SELECT name, ratings, player FROM players WHERE pid = ?').get(pa.id);
  if (!row || row.name !== pa.name || JSON.parse(row.ratings).ovr !== pa.ratings.ovr) bad('a released player must keep name and ratings');
  if ((await call(lib.mine, renv, { k: ka })).body?.player !== null) bad('after release the agent has no player');
  is('release twice (two rapid taps)', await post(lib.release, ka), 404, 'none');
  const fl = (await call(lib.list, renv, { url: '/api/freeagents?page=0' })).body.players;
  if (!fl.find(p => p.id === pa.id)?.free || fl.find(p => p.id === pb.id)?.free) bad('the free list must mark the released player free and only him');
  if (JSON.stringify(fl).includes(rdb.sql.prepare('SELECT id FROM agents LIMIT 1').get().id)) bad('the list shows an agent id after release');
  is('reclaim by another agent', await post(lib.reclaim, kb, { id: pa.id }), 403, 'notyours');
  is('reclaim without an id', await post(lib.reclaim, ka, {}), 400, 'invalid');
  is('reclaim of a player that was never released', await post(lib.reclaim, kb, { id: pb.id }), 403, 'notyours');
  const sw = await mk(ka, '5.5.5.1', { ...PIT }); if (sw?.id === pa.id) bad('the next player of the same agent must not reuse the released player id'); is('create the new player after release', { status: sw ? 201 : 0 }, 201);
  const back = await post(lib.reclaim, ka, { id: pa.id }); is('reclaim', back, 200);
  if (back.body?.released !== sw.id) bad('reclaim must release the player he controls now');
  if ((await call(lib.mine, renv, { k: ka })).body?.player?.id !== pa.id) bad('after reclaim the old player is his again');
  const fl2 = (await call(lib.list, renv, { url: '/api/freeagents?page=0' })).body.players;
  if (fl2.find(p => p.id === pa.id)?.free || !fl2.find(p => p.id === sw.id)?.free) bad('reclaim must swap who is free');
  is('reclaim again (already his)', await post(lib.reclaim, ka, { id: pa.id }), 403, 'notyours');
  /* two rapid switches: release, release, reclaim of the other one, all leave exactly one player per agent */
  is('switch 1', await post(lib.release, ka), 200); is('switch 2', await post(lib.release, ka), 404, 'none');
  is('reclaim the newer one', await post(lib.reclaim, ka, { id: sw.id }), 200);
  const held = rdb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id NOT LIKE 'free:%' AND agent_id NOT LIKE 'sys:%'").get().n; if (held !== 2) bad(`two agents must hold two players, hold ${held}`);
  /* another agent took him (the pickup rule is not built yet: simulate it in the table): reclaim is refused */
  is('release again', await post(lib.release, ka), 200);
  rdb.sql.prepare('UPDATE players SET agent_id = ? WHERE pid = ?').run('c'.repeat(64), sw.id);
  is('reclaim after another agent took him', await post(lib.reclaim, ka, { id: sw.id }), 409, 'taken');
  const kc = rdb.sql.prepare('SELECT COUNT(*) n FROM players WHERE agent_id = ?').get('c'.repeat(64)).n; if (kc !== 1) bad('the other agent lost the player he took'); }

/* the list */
const lister = makeDb(), lenv = { DB: lister }, keys = [];
for (let i = 0; i < lib.PAGE_SIZE + 5; i++) {
  const k = key(); keys.push(k);
  is(`register ${i}`, await call(lib.register, lenv, { method: 'POST', k, ip: `10.0.${i}.1` }), 201);
  const c = i % 2 ? { ...PIT, points: { stuff: 66 - (i % 5), ctrl: 62, arm: CREATE.budget.pit - 128 + (i % 5) } } : { ...BAT };
  /* names are drawn at random, so two of the sample can meet: redraw like a fan would */
  for (c.nameDraw = 0; c.nameDraw <= lib.DRAW_CAP; c.nameDraw++) if ((await call(lib.create, lenv, { method: 'POST', k, body: c })).status !== 409) break;
}
const p0 = await call(lib.list, lenv, { url: '/api/freeagents?page=0' }); is('list page 0', p0, 200);
const p1 = await call(lib.list, lenv, { url: `/api/freeagents?after=${encodeURIComponent(p0.body?.next)}` }); is('list page 1 (cursor)', p1, 200);
const n0 = p0.body?.players?.length, n1 = p1.body?.players?.length, total = lister.sql.prepare('SELECT COUNT(*) n FROM players').get().n;
if (n0 !== lib.PAGE_SIZE || p0.body.more !== (total > lib.PAGE_SIZE)) bad(`page 0 holds ${n0} players, more=${p0.body?.more}; ${total} stored`);
if (n0 + n1 !== total || p1.body?.more !== false) bad(`pages hold ${n0 + n1} of ${total} players`);
const ovrs = [...p0.body.players, ...p1.body.players].map(p => p.ovr);
if (ovrs.some((o, i) => i && o > ovrs[i - 1])) bad('the list is not ordered by overall, best first');
const newest = await call(lib.list, lenv, { url: '/api/freeagents?sort=new' }); const times = newest.body?.players?.map(p => p.created) || [];
if (times.some((t, i) => i && t > times[i - 1])) bad('sort=new is not newest first');
/* ability sorts (#192 item 2): each allowed key orders its holders best first, the others come last; a key outside the list falls back to overall */
for (const key of ['con', 'pow', 'eye', 'spd', 'arm', 'stuff', 'ctrl', 'pot']) {
  const r = await call(lib.list, lenv, { url: `/api/freeagents?sort=${key}` }), v = (r.body?.players || []).map(p => p.ratings[key]);
  const have = v.filter(x => x != null);
  if (r.body?.sort !== key || v.slice(0, have.length).includes(undefined) || have.some((x, i) => i && x > have[i - 1])) bad(`sort=${key} is not best first with the holders ahead`);
}
const junk = await call(lib.list, lenv, { url: "/api/freeagents?sort=ovr);DROP TABLE players;--" });
if (junk.body?.sort !== 'ovr' || junk.body?.players?.map(p => p.ovr).some((o, i, a) => i && o > a[i - 1])) bad('an unknown sort key does not fall back to overall');
const everything = JSON.stringify([p0.body, p1.body, newest.body]);
for (const t of lister.sql.prepare('SELECT agent_id FROM players').all()) if (everything.includes(t.agent_id)) bad('the public list shows an agent id');
is('list page past the max', await call(lib.list, lenv, { url: `/api/freeagents?page=${lib.MAX_PAGE + 1}` }), 400, 'page');
/* #806: keyset paging walks every sort to the end with no row twice and none missing; each list query uses an index (no scan, no sort step)
 * and reads at most PAGE_SIZE + 1 rows whatever the page; a bad cursor is a 400 */
{ const seen = [], plans = [], spy = { sql: lister.sql, batch: lister.batch, prepare: t => { const st = lister.prepare(t); if (/FROM players\s+(WHERE[^O]*)?ORDER BY/.test(t) && /LIMIT \?1/.test(t)) return { ...st, bind: (...a) => { plans.push({ t, a }); return st.bind(...a); } }; return st; } };
  for (const sort of ['ovr', 'new', 'con', 'pow', 'eye', 'spd', 'arm', 'stuff', 'ctrl', 'pot']) {
    const ids = []; let after = '', n = 0;
    for (;;) { const r = await call(lib.list, { DB: spy }, { url: `/api/freeagents?sort=${sort}${after}` }); if (r.status !== 200) { bad(`sort=${sort} cursor step ${n}: ${r.status}`); break; }
      ids.push(...r.body.players.map(p => p.id)); if (!r.body.more) break; after = `&after=${encodeURIComponent(r.body.next)}`; if (++n > 20) { bad(`sort=${sort} never ends`); break; } }
    if (new Set(ids).size !== ids.length || ids.length !== total) bad(`sort=${sort} walked ${ids.length} rows (${new Set(ids).size} distinct) of ${total}`);
    seen.push(sort); }
  if (!plans.length) bad('no list query was seen');
  for (const { t, a } of plans) {
    const plan = lister.sql.prepare('EXPLAIN QUERY PLAN ' + t).all(...a).map(r => r.detail).join(' | ');
    if (!/USING (COVERING )?INDEX players_/.test(plan) || /SCAN players(?! USING)|TEMP B-TREE/.test(plan)) bad(`a list query is not an index walk: ${plan}`);
    if (lister.sql.prepare(t).all(...a).length > lib.PAGE_SIZE + 1) bad('a list query returned more than PAGE_SIZE + 1 rows'); }
  for (const x of ['abc', '1~2', 'x~y~z~w', '1~1~1~a;b', '1~1~1~1~1~1']) if ((await call(lib.list, lenv, { url: `/api/freeagents?sort=con&after=${encodeURIComponent(x)}` })).status !== 400) bad(`cursor ${x} must be a 400`);
  /* the ability columns follow ovr: a growth write-back moves them with the grown ratings, and the ability sort reads them */
  const row = lister.sql.prepare("SELECT pid, ratings FROM players WHERE kind = 'pit' AND agent_id NOT LIKE 'sys:%' LIMIT 1").get();
  const r0 = JSON.parse(row.ratings), col = lister.sql.prepare('SELECT a_stuff s, a_ctrl c, a_arm a FROM players WHERE pid = ?').get(row.pid);
  if (col.s !== Math.round(r0.stuff) || col.c !== Math.round(r0.ctrl) || col.a !== Math.round(r0.arm)) bad('the ability columns differ from the creation ratings at create time');
  const bt = lister.sql.prepare("SELECT a_stuff s FROM players WHERE kind = 'bat' LIMIT 1").get(); if (bt.s !== -1) bad('a batter must hold -1 for stuff'); }

/* #806 migration: a players table made before the a_* columns gets them, filled from the stored ratings, and the list works on it */
{ const old = makeDb(); old.sql.exec("CREATE TABLE players (agent_id TEXT PRIMARY KEY, pid TEXT NOT NULL, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, ovr INTEGER NOT NULL, player TEXT NOT NULL, ratings TEXT NOT NULL, created_at INTEGER NOT NULL)");
  old.sql.prepare("INSERT INTO players VALUES ('free:o1', 'o1', 'Old One', 'pit', 60, '{\"id\":\"o1\"}', '{\"ovr\":60,\"stuff\":71,\"ctrl\":55,\"arm\":50}', 1)").run();
  const r = await call(lib.list, { DB: old }, { url: '/api/freeagents?sort=stuff' });
  const c = old.sql.prepare("SELECT a_stuff s, a_con c FROM players WHERE pid = 'o1'").get();
  if (r.status !== 200 || c?.s !== 71 || c?.c !== -1) bad(`an old players table is not migrated: ${r.status} ${JSON.stringify(c)}`); }

/* nothing here may reach the engine's results or the production site by accident */
const src = readFileSync(path.join(ROOT, 'functions/lib/agents.js'), 'utf8');
if (/engine\//.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))) bad('functions/lib/agents.js must not import the engine (rule 10)');

/* 系統 fillers (#437): seeded once, a fan takes the oldest filler of his kind */
{ const sdb = makeDb(), senv = { DB: sdb }, count = (kind) => sdb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id LIKE 'sys:%' AND kind = ?").get(kind).n;
  const ka = key(); is('system: register', await call(lib.register, senv, { method: 'POST', k: ka }), 201);
  if (count('bat') !== lib.SYSTEM_PER_KIND || count('pit') !== lib.SYSTEM_PER_KIND) bad(`expected ${lib.SYSTEM_PER_KIND} 系統 fillers per kind, have ${count('bat')} bat, ${count('pit')} pit`);
  if (sdb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id LIKE 'sys:%'").all()[0].n !== 2 * lib.SYSTEM_PER_KIND) bad('fillers are not all marked sys:');
  const flags = sdb.sql.prepare("SELECT player FROM players WHERE agent_id LIKE 'sys:%'").all().map(r => JSON.parse(r.player).system);
  if (flags.some(f => f !== true)) bad('a 系統 filler lacks system:true');
  const oldest = sdb.sql.prepare("SELECT pid FROM players WHERE agent_id LIKE 'sys:%' AND kind = 'bat' ORDER BY created_at, pid LIMIT 1").get().pid;
  /* the agent's seed is random, so his name can hit a filler's (409 name): draw the next name until it is free, as the maker does */
  let made; for (let draw = 0; draw < 20; draw++) { made = await call(lib.create, senv, { method: 'POST', k: ka, body: { ...BAT, nameDraw: draw } }); if (!made || made.status !== 409) break; }
  is('system: create batter', made, 201);
  if (count('bat') !== lib.SYSTEM_PER_KIND - 1 || count('pit') !== lib.SYSTEM_PER_KIND) bad('a fan batter must remove exactly one batter filler and no pitcher filler');
  if (sdb.sql.prepare('SELECT 1 FROM players WHERE pid = ?').get(oldest)) bad('the fan did not replace the oldest filler of his kind');
  if (sdb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id NOT LIKE 'sys:%'").get().n !== 1) bad('the fan row is missing');
  const again = makeDb(), aenv = { DB: again }; await call(lib.register, aenv, { method: 'POST', k: key() });
  if (again.sql.prepare("SELECT COUNT(*) n FROM meta WHERE k = 'system_seeded'").get().n !== 1) bad('the seed marker is not written once');
  await call(lib.list, aenv, { url: '/api/freeagents' }); if (again.sql.prepare("SELECT COUNT(*) n FROM players").get().n !== 2 * lib.SYSTEM_PER_KIND) bad('fillers were seeded twice');
  const listed = await call(lib.list, senv, { url: '/api/freeagents' }); if (!listed.body?.players?.some(p => p.player.system === true)) bad('the public list does not show the system flag'); }

/* #628 part 2: the daily sweep of inactive fans */
{ const idb = makeDb(), ienv = { DB: idb }, ks = [key(), key(), key(), key()], D = INACTIVE_DAYS, DMS = 86400000, now = Date.now(), day = Math.floor(now / DMS);
  const post = (h, k, body) => call(h, ienv, { method: 'POST', k, body });
  const mk = async (k, i, c) => { await call(lib.register, ienv, { method: 'POST', k, ip: `7.7.7.${i}` });
    for (c.nameDraw = 0; c.nameDraw <= lib.DRAW_CAP; c.nameDraw++) { const r = await call(lib.create, ienv, { method: 'POST', k, ip: `7.7.7.${i}`, body: c }); if (r.status === 201) return r.body.player; } bad('sweep: no free name'); return null; };
  const ps = [await mk(ks[0], 1, { ...BAT }), await mk(ks[1], 2, { ...PIT }), await mk(ks[2], 3, { ...BAT }), await mk(ks[3], 4, { ...PIT })];
  const hash = async k => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const ids = await Promise.all(ks.map(hash));
  idb.sql.prepare('DELETE FROM agent_seen').run();
  const seenDay = idb.sql.prepare('INSERT INTO agent_seen (agent_id, day) VALUES (?, ?)');
  seenDay.run(ids[0], day - (D - 1)); seenDay.run(ids[1], day - D); seenDay.run(ids[2], day - 400);
  idb.sql.prepare('UPDATE players SET created_at = ? WHERE agent_id = ?').run(now - (D + 5) * DMS, ids[3]);      /* never seen: created D + 5 days ago */
  idb.sql.prepare('UPDATE players SET created_at = ? WHERE agent_id = ?').run(now - 500 * DMS, ids[0]);
  idb.sql.prepare("UPDATE players SET created_at = ? WHERE agent_id = ? OR agent_id = ?").run(now - 500 * DMS, ids[1], ids[2]);
  idb.sql.prepare("DELETE FROM meta WHERE k LIKE 'inactive_%'").run();   /* the keyed calls above already ran a (then empty) sweep chunk today (#807) */
  const sysBefore = idb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id LIKE 'sys:%'").get().n;
  const out = await lib.sweepInactive(idb, now);
  const owner = pid => idb.sql.prepare('SELECT agent_id a FROM players WHERE pid = ?').get(pid)?.a;
  if (owner(ps[0].id) !== ids[0]) bad('a fan seen D-1 days ago must keep his player');
  for (const i of [1, 2, 3]) if (owner(ps[i].id) !== 'free:' + ps[i].id) bad(`fan ${i} (seen D days ago, long ago, never seen and created D+5 ago) must be released`);
  if (JSON.stringify([...out].sort()) !== JSON.stringify([ps[1].id, ps[2].id, ps[3].id].sort())) bad(`sweep returned ${out}`);
  if (idb.sql.prepare("SELECT COUNT(*) n FROM players WHERE agent_id LIKE 'sys:%'").get().n !== sysBefore) bad('the sweep touched a 系統 player');
  for (const i of [1, 2, 3]) if (idb.sql.prepare('SELECT former FROM releases WHERE pid = ?').get(ps[i].id)?.former !== ids[i]) bad(`no release note for fan ${i}`);
  if ((await lib.sweepInactive(idb, now)).length || (await lib.sweepInactive(idb, now + 1000)).length) bad('the sweep must run once a day');
  if (idb.sql.prepare('SELECT COUNT(*) n FROM releases').get().n !== 3) bad('a second sweep wrote release notes');
  const row = idb.sql.prepare('SELECT ratings FROM players WHERE pid = ?').get(ps[1].id); if (JSON.parse(row.ratings).ovr !== ps[1].ratings.ovr) bad('a released player must keep his ratings');
  is('the old agent reclaims after the sweep', await post(lib.reclaim, ks[1], { id: ps[1].id }), 200);
  /* #628 part 3: a stranger is refused inside RECLAIM_DAYS and may take the player after it */
  is('a stranger inside RECLAIM_DAYS', await post(lib.reclaim, ks[0], { id: ps[2].id }), 403, 'notyours');
  idb.sql.prepare('UPDATE releases SET released_at = ? WHERE pid = ?').run(Date.now() - 29 * DMS, ps[2].id);
  is('a stranger on day 29', await post(lib.reclaim, ks[0], { id: ps[2].id }), 403, 'notyours');
  idb.sql.prepare('UPDATE releases SET released_at = ? WHERE pid = ?').run(Date.now() - 31 * DMS, ps[2].id);
  is('a stranger after RECLAIM_DAYS', await post(lib.reclaim, ks[0], { id: ps[2].id }), 200);
  if (owner(ps[2].id) !== ids[0]) bad('after RECLAIM_DAYS the stranger must own the player');
  const wasSeen = day => idb.sql.prepare('SELECT day FROM agent_seen WHERE agent_id = ?').get(ids[1])?.day;
  await call(lib.mine, ienv, { k: ks[1] }); if (wasSeen() !== Math.floor(Date.now() / DMS)) bad('a keyed call must record today as the last seen day');
  if (JSON.stringify(idb.sql.prepare('PRAGMA table_info(agent_seen)').all().map(c => c.name)) !== '["agent_id","day"]') bad('agent_seen must hold only agent_id and day');
  const empty = makeDb(); await call(lib.list, { DB: empty }, { url: '/api/freeagents' }); if ((await lib.sweepInactive(empty, now + DMS)).length) bad('a store with only 系統 players must release nobody'); }

/* #438: start place chosen at create (二軍 / 自由市場), stored once on the player, moved either way with POST /api/player/place */
{ const pdb = makeDb(), penv = { DB: pdb };
  const post = (h, k, body) => call(h, penv, { method: 'POST', k, body });
  const [ka, kb] = [key(), key()]; is('register a', await post(lib.register, ka), 201); is('register b', await post(lib.register, kb), 201);
  const mk = async (k, c) => { for (c.nameDraw = 0; c.nameDraw <= lib.DRAW_CAP; c.nameDraw++) { const r = await post(lib.create, k, c); if (r.status === 201) return r.body.player; } bad('no free name'); return null; };
  is('create with an unknown place', await post(lib.create, ka, { ...BAT, place: '一軍' }), 400, 'invalid');
  is('create with a place that is not text', await post(lib.create, ka, { ...BAT, place: 1 }), 400, 'invalid');
  const pa = await mk(ka, { ...BAT, place: 'free' }), pb = await mk(kb, { ...PIT, place: 'second' });
  const placeIn = pid => JSON.parse(pdb.sql.prepare('SELECT player FROM players WHERE pid = ?').get(pid).player).place;
  if (pa?.player?.place !== 'free' || placeIn(pa?.id) !== 'free') bad('a 自由市場 choice is not stored');
  if (pb?.player?.place !== 'second' || placeIn(pb?.id) !== 'second') bad('a 二軍 choice is not stored');
  if (placeOf({ system: true }) !== 'free' || placeOf(null) !== 'free') bad('a player with no stored place must count as 自由市場');
  const before = pdb.sql.prepare('SELECT pid, name, kind, ovr, ratings, created_at, player FROM players WHERE pid = ?').get(pa.id);
  is('move without a key', await call(lib.place, penv, { method: 'POST', body: { place: 'second' } }), 401, 'key');
  is('move to an unknown place', await post(lib.place, ka, { place: 'main' }), 400, 'invalid');
  is('move without a body', await post(lib.place, ka), 400, 'invalid');
  const kc = key(); await post(lib.register, kc); is('move when the agent has no player', await post(lib.place, kc, { place: 'second' }), 404, 'none');
  const mv = await post(lib.place, ka, { place: 'second' }); is('move 自由市場 -> 二軍', mv, 200);
  const after = pdb.sql.prepare('SELECT pid, name, kind, ovr, ratings, created_at, player FROM players WHERE pid = ?').get(pa.id);
  if (placeIn(pa.id) !== 'second' || (await call(lib.mine, penv, { k: ka })).body?.player?.player?.place !== 'second') bad('the move to 二軍 is not shown');
  const { place: p0, ...restBefore } = JSON.parse(before.player), { place: p1, ...restAfter } = JSON.parse(after.player);
  if (JSON.stringify(restBefore) !== JSON.stringify(restAfter) || before.ratings !== after.ratings || before.ovr !== after.ovr || before.name !== after.name || before.created_at !== after.created_at)
    bad('a move must change nothing but the place');
  is('move 二軍 -> 自由市場', await post(lib.place, ka, { place: 'free' }), 200); if (placeIn(pa.id) !== 'free') bad('the move back to 自由市場 is not stored');
  if (placeIn(pb.id) !== 'second') bad("a move changed another agent's player");
  const listed = (await call(lib.list, penv, { url: '/api/freeagents' })).body?.players || [];
  for (const p of [pa, pb]) if (listed.filter(x => x.id === p.id).length !== 1) bad(`player ${p.id} must be listed exactly once`); }

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: ${ROUTES.length} routes closed without the binding and on production, caps, one player per agent, unique names, public list of ${total}.`);
