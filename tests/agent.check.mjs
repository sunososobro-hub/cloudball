/* Fan agents and created free agents on the dev site (functions/, #179). Runs the real handlers of functions/lib/agents.js
 * against an in-memory SQLite behind a small D1 shim (node:sqlite). Fails when
 *   - the host rule of the functions differs from ui/site.js for any sample host name;
 *   - without the DB binding, or on a production host, any route answers anything but 503 {"ok":false,"why":"closed"};
 *   - a call without a valid key is let in, or the key is stored in the clear (only its SHA-256 is);
 *   - a second agent from one address over the daily cap, or the daily total cap, is let in;
 *   - the abuse tables hold anything but a day and a salted hash, keep an older day, or sit next to an agent;
 *   - a draw past the cap is answered, a choice off the rules is accepted, a second player of one agent is accepted,
 *     or two players get the same name;
 *   - the public list shows an agent id, or its order or paging is wrong.
 * Usage: node tests/agent.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import * as lib from '../functions/lib/agents.js';
import { drawName, CREATE } from '../league/freeagents.js';

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
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 72, pow: 40, eye: 70, spd: 72, arm: 71 }, nameDraw: 0 };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 68, ctrl: 62, arm: 50 }, nameDraw: 0 };
const is = (what, r, status, why) => { if (r.status !== status || (why && r.body?.why !== why)) bad(`${what}: expected ${status}${why ? ' ' + why : ''}, got ${r.status} ${JSON.stringify(r.body)}`); };

/* closed: no binding, and a production host with a binding */
const ROUTES = [[lib.register, 'POST'], [lib.draw, 'GET'], [lib.mine, 'GET'], [lib.create, 'POST'], [lib.list, 'GET']];
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
for (const t of tables) if (!['agents', 'players', 'reg_salt', 'reg_seen'].includes(t)) bad(`unexpected table ${t}`);
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
const made = await call(lib.create, env, { method: 'POST', k: k1, body: BAT }); is('create', made, 201);
if (made.body?.player?.name !== d0.body?.name) bad('the created player does not carry the drawn name');
if (made.body?.player?.player?.id !== `fa-${seed.toString(36)}`) bad('the player was not made from the seed the server made');
is('create a second player', await call(lib.create, env, { method: 'POST', k: k1, body: BAT }), 409, 'already');
const mineNow = await call(lib.mine, env, { k: k1 }); if (mineNow.body?.player?.name !== made.body?.player?.name) bad('GET /api/player does not give the created player back');
is('create with the points moved by a client-made seed', await call(lib.create, env, { method: 'POST', k: k2, body: { ...PIT, seed: 5 } }), 400, 'invalid');
/* the same name for two agents: marked taken in the draw, refused at the create */
const id2 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k2)))].map(b => b.toString(16).padStart(2, '0')).join('');
db.sql.prepare('UPDATE agents SET seed = ? WHERE id = ?').run(seed, id2);
const shown = await call(lib.draw, env, { k: k2, url: '/api/agent/draw?n=0' });
if (shown.body?.taken !== true) bad('a name already taken is not marked taken in the draw');
is('create with a taken name', await call(lib.create, env, { method: 'POST', k: k2, body: BAT }), 409, 'name');

/* the list */
const lister = makeDb(), lenv = { DB: lister }, keys = [];
for (let i = 0; i < lib.PAGE_SIZE + 5; i++) {
  const k = key(); keys.push(k);
  is(`register ${i}`, await call(lib.register, lenv, { method: 'POST', k, ip: `10.0.${i}.1` }), 201);
  const c = i % 2 ? { ...PIT, points: { stuff: 68 - (i % 5), ctrl: 62, arm: CREATE.budget.pit - 130 + (i % 5) } } : { ...BAT };
  /* names are drawn at random, so two of the sample can meet: redraw like a fan would */
  for (c.nameDraw = 0; c.nameDraw <= lib.DRAW_CAP; c.nameDraw++) if ((await call(lib.create, lenv, { method: 'POST', k, body: c })).status !== 409) break;
}
const p0 = await call(lib.list, lenv, { url: '/api/freeagents?page=0' }); is('list page 0', p0, 200);
const p1 = await call(lib.list, lenv, { url: '/api/freeagents?page=1' }); is('list page 1', p1, 200);
const n0 = p0.body?.players?.length, n1 = p1.body?.players?.length, total = lister.sql.prepare('SELECT COUNT(*) n FROM players').get().n;
if (n0 !== lib.PAGE_SIZE || p0.body.more !== (total > lib.PAGE_SIZE)) bad(`page 0 holds ${n0} players, more=${p0.body?.more}; ${total} stored`);
if (n0 + n1 !== total || p1.body?.more !== false) bad(`pages hold ${n0 + n1} of ${total} players`);
const ovrs = [...p0.body.players, ...p1.body.players].map(p => p.ovr);
if (ovrs.some((o, i) => i && o > ovrs[i - 1])) bad('the list is not ordered by overall, best first');
const newest = await call(lib.list, lenv, { url: '/api/freeagents?sort=new' }); const times = newest.body?.players?.map(p => p.created) || [];
if (times.some((t, i) => i && t > times[i - 1])) bad('sort=new is not newest first');
const everything = JSON.stringify([p0.body, p1.body, newest.body]);
for (const t of lister.sql.prepare('SELECT agent_id FROM players').all()) if (everything.includes(t.agent_id)) bad('the public list shows an agent id');
is('list page past the max', await call(lib.list, lenv, { url: `/api/freeagents?page=${lib.MAX_PAGE + 1}` }), 400, 'page');

/* nothing here may reach the engine's results or the production site by accident */
const src = readFileSync(path.join(ROOT, 'functions/lib/agents.js'), 'utf8');
if (/engine\//.test(src.replace(/\/\*[\s\S]*?\*\//g, ''))) bad('functions/lib/agents.js must not import the engine (rule 10)');

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: ${ROUTES.length} routes closed without the binding and on production, caps, one player per agent, unique names, public list of ${total}.`);
