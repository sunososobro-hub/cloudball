/* Guilds (#800 part 1): the real handlers of functions/lib/guild.js against an in-memory SQLite behind the same small D1 shim as agent.check.mjs.
 * Fails when
 *   - without the DB binding, or on a production host, the guild route answers anything but 503 {"ok":false,"why":"closed"};
 *   - a call without a valid key is let in;
 *   - a name off the rules (empty, over 12 characters, markup characters, not text) or an unknown base team is accepted;
 *   - the founder is not 領隊 and 總教練 and the first member, or his player is missing from the member list;
 *   - a second guild of one fan, or two guilds with one name, is accepted;
 *   - an answer shows an agent id, or one fan sees another fan's guild.
 * Usage: node tests/guild.check.mjs */
import { createRequire } from 'node:module';
import * as agents from '../functions/lib/agents.js';
import * as guild from '../functions/lib/guild.js';
import { TEAMS } from '../league/teams.js';

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
  const headers = { 'CF-Connecting-IP': `10.0.0.${++ipN}` }; if (k) headers.authorization = `Bearer ${k}`;
  const res = await handler({ request: new Request(host + '/api/guild', { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const is = (what, r, status, why) => { if (r.status !== status || (why && r.body?.why !== why)) bad(`${what}: expected ${status}${why ? ' ' + why : ''}, got ${r.status} ${JSON.stringify(r.body)}`); };

/* closed without the binding and on production */
for (const [h, method] of [[guild.mine, 'GET'], [guild.create, 'POST']]) {
  const a = await call(h, {}, { method, k: key() }), b = await call(h, { DB: makeDb() }, { method, k: key(), host: 'https://cloudball-3uy.pages.dev' });
  for (const r of [a, b]) if (r.status !== 503 || r.body?.why !== 'closed') bad(`a guild route must answer 503 closed (no binding / production), got ${r.status}`);
}

const db = makeDb(), env = { DB: db };
const BASE = TEAMS[0].id, [ka, kb, kc] = [key(), key(), key()];
for (const k of [ka, kb, kc]) is('register', await call(agents.register, env, { method: 'POST', k }), 201);
is('GET without a key', await call(guild.mine, env), 401, 'key');
is('POST without a key', await call(guild.create, env, { method: 'POST', body: { name: 'x', base: BASE } }), 401, 'key');
is('GET with an unknown key', await call(guild.mine, env, { k: key() }), 401, 'unknown');

const none = await call(guild.mine, env, { k: ka }); is('GET before founding', none, 200);
if (none.body.guild !== null || none.body.bases?.length !== TEAMS.length || none.body.nameMax !== guild.NAME_MAX) bad('GET before founding must give guild:null, the base teams and nameMax');

const post = (k, body) => call(guild.create, env, { method: 'POST', k, body });
is('no body', await call(guild.create, env, { method: 'POST', k: ka }), 400, 'invalid');
for (const name of ['', '   ', 'x'.repeat(guild.NAME_MAX + 1), '<b>', 'a&b', 'a"b', "a'b", 'tab\there', 7, null])
  is(`name ${JSON.stringify(name)}`, await post(ka, { name, base: BASE }), 400, 'invalid');
for (const base of ['nobody', '', 3, undefined]) is(`base ${JSON.stringify(base)}`, await post(ka, { name: '雲端隊', base }), 400, 'invalid');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guilds').get().n) bad('a refused call must create nothing');

const made = await post(ka, { name: '  雲端隊  ', base: BASE }); is('found a guild', made, 201);
const g = made.body?.guild;
if (!g || g.name !== '雲端隊') bad('the name must be stored trimmed');
if (g?.base.id !== BASE || g?.base.name !== TEAMS[0].name) bad('the base team is not shown');
if (g?.members.length !== 1 || !g.members[0].leader || !g.members[0].coach || g.members[0].player !== null) bad('the founder must be the only member, 領隊 and 總教練, with no player yet');
if ('leader' in (g || {}) || /[0-9a-f]{64}/.test(JSON.stringify(made.body))) bad('an agent id must never be in an answer');
const again = await call(guild.mine, env, { k: ka });
if (JSON.stringify(again.body?.guild) !== JSON.stringify(g)) bad('GET must show the guild just founded');
is('a second guild of one fan', await post(ka, { name: '另一隊', base: BASE }), 409, 'already');
is('a taken name', await post(kb, { name: '雲端隊', base: BASE }), 409, 'name');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guilds').get().n !== 1) bad('exactly one guild must exist');
if ((await call(guild.mine, env, { k: kb })).body?.guild !== null) bad("a fan must not see another fan's guild");

/* a founder who has a player: he is listed as a member with his player */
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look: { head: 3, skin: 2, hair: 5 }, points: { stuff: 66, ctrl: 62, arm: 55 }, nameDraw: 0 };
const pc = await call(agents.create, env, { method: 'POST', k: kc, body: PIT }); is('create a player', pc, 201);
const gc = (await post(kc, { name: '十二個字十二個字十二個字', base: TEAMS[1].id })).body?.guild;
if (!gc || gc.members[0].player?.name !== pc.body?.player?.name || gc.members[0].player?.pos !== 'SP') bad('the founder\'s player must be listed with his role');
if (gc && [...gc.name].length !== guild.NAME_MAX) bad('a name of exactly the maximum length must be accepted');

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: guild routes closed without the binding and on production, name and base rules, founder is 領隊 + 總教練, one guild per fan, unique names.`);
