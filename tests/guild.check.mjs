/* Guilds (#800 part 1): the real handlers of functions/lib/guild.js against an in-memory SQLite behind the same small D1 shim as agent.check.mjs.
 * Fails when
 *   - without the DB binding, or on a production host, the guild route answers anything but 503 {"ok":false,"why":"closed"};
 *   - a call without a valid key is let in;
 *   - a name off the rules (empty, over 12 characters, markup characters, not text) or an unknown base team is accepted;
 *   - the founder is not 領隊 and 總教練 and the first member, or his player is missing from the member list;
 *   - a second guild of one fan, or two guilds with one name, is accepted;
 *   - an answer shows an agent id, or one fan sees another fan's guild.
 *   - (part 2) a join without a free seat, twice, or by a fan who has a guild, is accepted; a leave / remove writes more than the member row;
 *     the 領隊 can leave or remove himself, a member can remove; a leaving 總教練 does not hand the seat back; an agent id shows; a move past the daily cap is accepted.
 *   - (part 3) the lineup is saved by anyone but the 總教練, or off the rules (not nine distinct batting slots, a bad starter slot); a save is not shown back;
 *     no save plays the automatic lineup; the 領隊 hands the seat to a non-member / a member can hand it over; the new 總教練 cannot save, the old one cannot.
 *   - (#809 part 2) the export is not closed without the binding / on production, repeats or skips a guild across pages, shows an agent id, or writes.
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
const call = async (handler, env, { method = 'GET', k, body, host = HOST, q = '' } = {}) => {
  const headers = { 'CF-Connecting-IP': `10.0.0.${++ipN}` }; if (k) headers.authorization = `Bearer ${k}`;
  const res = await handler({ request: new Request(host + '/api/guild' + q, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env });
  return { status: res.status, body: await res.json().catch(() => null) };
};
const is = (what, r, status, why) => { if (r.status !== status || (why && r.body?.why !== why)) bad(`${what}: expected ${status}${why ? ' ' + why : ''}, got ${r.status} ${JSON.stringify(r.body)}`); };

/* closed without the binding and on production */
for (const [h, method] of [[guild.mine, 'GET'], [guild.create, 'POST'], [guild.lineup, 'POST'], [guild.coach, 'POST']]) {
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

/* part 2: invite link, join, leave, remove */
const INV = g.id;
const peek = await call(guild.mine, env, { k: kb, q: `?join=${INV}` });
if (peek.body?.invite?.name !== '雲端隊' || peek.body.invite.taken !== 1 || peek.body.invite.seats !== guild.GUILD_SEATS || peek.body.guild !== null) bad('?join must show the invite (name, seats taken) to a fan with no guild');
if (JSON.stringify(peek.body?.invite).includes('members')) bad('the invite preview must not list members');
if ((await call(guild.mine, env, { k: kb, q: '?join=zzzz' })).body?.invite !== null) bad('a bad invite code must show nothing');
const jn = (k, guildId) => call(guild.join, env, { method: 'POST', k, body: { guild: guildId } });
is('join without a body', await call(guild.join, env, { method: 'POST', k: kb }), 400, 'invalid');
is('join with a bad code', await jn(kb, 'nope'), 400, 'invalid');
is('join an unknown guild', await jn(kb, '0'.repeat(12)), 404, 'none');
const joined = await jn(kb, INV); is('join by the invite', joined, 200);
if (joined.body?.guild?.members.length !== 2 || joined.body.guild.members.filter(m => m.leader || m.coach).length !== 1) bad('the joiner must be a plain second member');
is('join twice', await jn(kb, INV), 409, 'already');
is('the founder joins his own guild', await jn(ka, INV), 409, 'already');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_members').get().n !== 2) bad('join must add exactly one member row (the founder + the joiner)');
if (/[0-9a-f]{64}/.test(JSON.stringify(joined.body))) bad('a join answer must not show an agent id');
const leaderView = (await call(guild.mine, env, { k: ka })).body.guild, plain = leaderView.members.find(m => !m.leader);
const refs = leaderView.members.map(m => m.ref);
if (refs.some(r => !/^[0-9a-f]{10}$/.test(r)) || new Set(refs).size !== refs.length) bad('every member needs his own ref');
const rm = (k, ref) => call(guild.remove, env, { method: 'POST', k, body: { ref } });
is('a member removes the 領隊', await rm(kb, leaderView.members.find(m => m.leader).ref), 403, 'leader');
is('the 領隊 removes himself', await rm(ka, leaderView.members.find(m => m.leader).ref), 404, 'member');
is('remove an unknown ref', await rm(ka, '0'.repeat(10)), 404, 'member');
is('the 領隊 cannot leave', await call(guild.leave, env, { method: 'POST', k: ka }), 409, 'leader');
is('leave with no guild', await call(guild.leave, env, { method: 'POST', k: kc }), 404, 'none');
const gone = await rm(ka, plain.ref); is('the 領隊 removes a member', gone, 200);
if (gone.body?.guild?.members.length !== 1) bad('the removed member must be gone');
if ((await call(guild.mine, env, { k: kb })).body?.guild !== null) bad('a removed fan must have no guild');
/* he is free to move at once: no cooldown. A 總教練 who leaves hands the seat back to the 領隊 */
is('rejoin at once', await jn(kb, INV), 200);
db.sql.prepare('UPDATE guilds SET coach = (SELECT agent_id FROM guild_members WHERE guild_id = ?1 AND agent_id != leader) WHERE id = ?1').run(INV);
if ((await call(guild.mine, env, { k: ka })).body.guild.members.find(m => m.coach)?.leader) bad('test setup: the joiner should be 總教練');
const lv = await call(guild.leave, env, { method: 'POST', k: kb }); is('a member leaves', lv, 200);
if (lv.body?.guild !== null) bad('leave answers guild:null');
const after = (await call(guild.mine, env, { k: ka })).body.guild;
if (after.members.length !== 1 || !after.members[0].coach) bad('after the 總教練 leaves, the 領隊 must be 總教練 again');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_members').get().n !== 1) bad('leave must delete exactly the member row');

/* part 3: the 總教練's lineup and the hand-over of his seat */
const fresh = (await call(guild.mine, env, { k: ka })).body.guild;
const auto = [0, 1, 2, 3, 4, 5, 6, 7, 8];
if (JSON.stringify(fresh.lineup) !== JSON.stringify({ batting: auto, sp: 0, saved: false })) bad('with nothing saved the lineup must be the automatic one (saved:false)');
const save = (k, order, sp) => call(guild.lineup, env, { method: 'POST', k, body: { order, sp } });
is('lineup without a body', await call(guild.lineup, env, { method: 'POST', k: ka }), 400, 'invalid');
for (const [what, order, sp] of [['eight batters', auto.slice(1), 0], ['a repeated slot', [0, 0, 2, 3, 4, 5, 6, 7, 8], 0], ['a slot out of range', [0, 1, 2, 3, 4, 5, 6, 7, 9], 0],
  ['text slots', auto.map(String), 0], ['not a list', 'x', 0], ['sp out of range', auto, 5], ['sp negative', auto, -1], ['sp not whole', auto, 1.5], ['sp missing', auto, undefined]])
  is(`lineup with ${what}`, await save(ka, order, sp), 400, 'invalid');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_lineups').get().n) bad('a refused lineup must save nothing');
is('lineup with no guild', await save(kb, auto, 0), 404, 'none');
const LU = [8, 7, 6, 5, 4, 3, 2, 1, 0], sv = await save(ka, LU, 3); is('the 總教練 saves a lineup', sv, 200);
if (JSON.stringify(sv.body?.guild?.lineup) !== JSON.stringify({ batting: LU, sp: 3, saved: true })) bad('the saved lineup must be shown back');
const sv2 = await save(ka, auto, 1); is('a second save replaces the first', sv2, 200);
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_lineups').get().n !== 1 || sv2.body?.guild?.lineup.sp !== 1) bad('one row per guild, the last save wins');
is('a member joins for the hand-over', await jn(kb, INV), 200);
is('a plain member saves a lineup', await save(kb, LU, 0), 403, 'coach');
const hand = (k, ref) => call(guild.coach, env, { method: 'POST', k, body: { ref } });
const lv2 = (await call(guild.mine, env, { k: ka })).body.guild, other = lv2.members.find(m => !m.leader), mine = lv2.members.find(m => m.leader);
is('hand-over without a body', await call(guild.coach, env, { method: 'POST', k: ka }), 400, 'invalid');
is('a member hands over the seat', await hand(kb, other.ref), 403, 'leader');
is('hand-over to nobody', await hand(ka, '0'.repeat(10)), 404, 'member');
const ho = await hand(ka, other.ref); is('the 領隊 hands over the seat', ho, 200);
if (!ho.body?.guild?.members.find(m => m.coach && !m.leader) || !ho.body?.guild?.members.find(m => m.leader)) bad('after the hand-over the member is 總教練 and the 領隊 stays 領隊');
if (JSON.stringify(ho.body?.guild?.lineup) !== JSON.stringify({ batting: auto, sp: 1, saved: true })) bad('the saved lineup must survive the hand-over');
is('the old 總教練 saves a lineup', await save(ka, LU, 0), 403, 'coach');
is('the new 總教練 saves a lineup', await save(kb, LU, 0), 200);
is('the 領隊 takes the seat back', await hand(ka, mine.ref), 200);
/* #808: an unchanged lineup writes nothing; the save number SAVES_PER_DAY + 1 of a day is 429 limit */
{
  const { SAVES_PER_DAY } = await import('../functions/lib/caps.js');
  is('a lineup to start from', await save(ka, LU, 2), 200);
  const before = db.sql.prepare('SELECT total_changes() AS n').get().n;
  is('the same lineup again', await save(ka, LU, 2), 200);
  if (db.sql.prepare('SELECT total_changes() AS n').get().n !== before) bad('an unchanged lineup save must write nothing (no row, no counter)');
  let n = 0, last;
  for (let i = 0; i < SAVES_PER_DAY + 2; i++) { last = await save(ka, auto, i % 2 ? 4 : 3); if (last.status === 429) break; n++; }
  if (last.status !== 429 || last.body?.why !== 'limit') bad('lineup save past SAVES_PER_DAY must be 429 limit');
  if (n > SAVES_PER_DAY) bad(`${n} lineup saves accepted in one day, the cap is ${SAVES_PER_DAY}`);
  if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_lineups').get().n !== 1) bad('capped lineup saves must still be one row per guild');
}
if (/[0-9a-f]{64}/.test(JSON.stringify(ho.body))) bad('a hand-over answer must not show an agent id');
if (guild.lineupAtLock({ batting: 'not json', sp: 0 }).saved || guild.lineupAtLock({ batting: '[1,2]', sp: 0 }).saved || guild.lineupAtLock(null).saved) bad('a row that does not parse, or off the rules, must fall back to the automatic lineup');
is('the member leaves again', await call(guild.leave, env, { method: 'POST', k: kb }), 200);

/* seats: a guild takes GUILD_SEATS members, the next join is refused and counts nothing in the guild */
for (let i = 1; i < guild.GUILD_SEATS; i++) db.sql.prepare('INSERT INTO guild_members (agent_id, guild_id, joined_at) VALUES (?1, ?2, ?3)').run('fill' + i, INV, i);
is('a full guild', await jn(kb, INV), 409, 'full');
db.sql.prepare("DELETE FROM guild_members WHERE agent_id LIKE 'fill%'").run();

/* the daily move cap (#808): moves of one fan are counted in his guild_fans row; a leave and a join are two moves */
let capped = null;
for (let i = 0; i < 12 && !capped; i++) { const r = await call(guild.join, env, { method: 'POST', k: kb, body: { guild: INV } }); if (r.status === 429) capped = r; else await call(guild.leave, env, { method: 'POST', k: kb }); }
if (!capped || capped.body?.why !== 'limit') bad('moves past GUILD_MOVES_PER_DAY must answer 429 limit');
if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_fans').get().n > 2) bad('the counter is one row per fan, never one row per move');

/* a founder who has a player: he is listed as a member with his player */
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look: { head: 3, skin: 2, hair: 5 }, points: { stuff: 66, ctrl: 62, arm: 55 }, nameDraw: 0 };
const pc = await call(agents.create, env, { method: 'POST', k: kc, body: PIT }); is('create a player', pc, 201);
const gc = (await post(kc, { name: '十二個字十二個字十二個字', base: TEAMS[1].id })).body?.guild;
if (!gc || gc.members[0].player?.name !== pc.body?.player?.name || gc.members[0].player?.pos !== 'SP') bad('the founder\'s player must be listed with his role');
if (gc && [...gc.name].length !== guild.NAME_MAX) bad('a name of exactly the maximum length must be accepted');

/* #809 part 2: GET /api/guilds/export, public data, keyset paging, no write */
{
  const exp = async (q = '', e = env, host = HOST) => { const res = await guild.exportPage({ request: new Request(host + '/api/guilds/export' + q), env: e }); return { status: res.status, body: await res.json().catch(() => null) }; };
  for (const r of [await exp('', {}), await exp('', env, 'https://cloudball-3uy.pages.dev')]) if (r.status !== 503) bad('the export must answer 503 without the binding and on production');
  is('export, bad after', await exp('?after=nope'), 400, 'invalid');
  const before = db.sql.prepare('SELECT COUNT(*) AS n FROM guilds').get().n;
  for (let i = 0; i < guild.EXPORT_PAGE + 3; i++) db.sql.prepare('INSERT INTO guilds (id, name, base, leader, coach, created_at) VALUES (?1, ?2, ?3, ?4, ?4, 1)').run(String(i).padStart(12, '0').replace(/./g, c => 'abcdef0123'[+c % 10]).slice(0, 12).replace(/^./, 'f'), 'N' + i, BASE, 'L' + i);
  const total = before + guild.EXPORT_PAGE + 3, seen = [];
  let q = '', pages = 0, next;
  do { const r = await exp(q); is('export page', r, 200); pages++; seen.push(...r.body.guilds); next = r.body.next; q = '?after=' + next; if (r.body.guilds.length > guild.EXPORT_PAGE) bad('a page holds more than EXPORT_PAGE guilds'); } while (next && pages < 10);
  if (seen.length !== total || new Set(seen.map(x => x.id)).size !== total) bad(`the pages must list every guild exactly once, got ${seen.length} of ${total}`);
  if (seen.some((x, i) => i && seen[i - 1].id >= x.id)) bad('guilds must come in id order');
  if (/[0-9a-f]{64}|agent|ref/.test(JSON.stringify(seen.map(x => ({ ...x, id: 0 }))))) bad('the export must show no agent id or member ref');
  const mine = seen.find(x => x.id === INV);
  if (!mine || mine.members.length !== 1 || !mine.members[0].leader || !mine.members[0].coach || mine.settings !== null) bad('a guild must list its members with the leader / coach flags and settings null');
  /* #795 part 4b: a member's stored, non-neutral 經紀人 set rides along as player.tactics (canonical); a neutral set, a set saved for an
   * earlier player, or none -> no tactics key (the export of a fan without a set is unchanged) */
  {
    const G = seen[seen.length - 1].id, put = (aid, pid, name, kind, set) => {
      db.sql.prepare("INSERT INTO players (agent_id, pid, name, kind, ovr, player, ratings, created_at) VALUES (?1, ?2, ?3, ?4, 60, '{}', '{}', 1)").run(aid, pid, name, kind);
      db.sql.prepare('INSERT INTO guild_members (agent_id, guild_id, joined_at) VALUES (?1, ?2, ?3)').run(aid, G, name.length);
      if (set !== undefined) db.sql.prepare('INSERT INTO guild_saves (agent_id, agentset) VALUES (?1, ?2)').run(aid, set);
    };
    const hot = { v: 1, kind: 'bat', rows: { normal: { steal: 4, bunt: 0 } } };
    put('t1', 'p-t1', 'T一', 'bat', JSON.stringify({ pid: 'p-t1', set: hot }));
    put('t2', 'p-t2', 'T二二', 'bat', JSON.stringify({ pid: 'p-t2', set: { v: 1, kind: 'bat', rows: {} } }));
    put('t3', 'p-t3', 'T三三三', 'bat', JSON.stringify({ pid: 'p-old', set: hot }));
    put('t4', 'p-t4', 'T四四四四', 'pit');
    const r = await exp('?after=' + seen[seen.length - 2].id), gm = r.body?.guilds?.find(x => x.id === G), by = n => gm && gm.members.find(x => x.player && x.player.name === n);
    if (!gm || gm.members.length < 4) bad('the export must list the tactics test members');
    else {
      if (JSON.stringify(by('T一').player.tactics) !== JSON.stringify(hot)) bad(`a stored set must export as player.tactics, got ${JSON.stringify(by('T一').player.tactics)}`);
      for (const n of ['T二二', 'T三三三', 'T四四四四']) if ('tactics' in by(n).player) bad(`${n}: a neutral, other-player or missing set must export no tactics`);
      if (/[0-9a-f]{64}|agent|ref/.test(JSON.stringify({ ...gm, id: 0 }))) bad('the export with tactics must still show no agent id or member ref');
    }
  }
  const w = db.sql.prepare('SELECT COUNT(*) AS n FROM guild_members').get().n;
  await exp(); if (db.sql.prepare('SELECT COUNT(*) AS n FROM guild_members').get().n !== w) bad('the export must write nothing');
}

/* #800 part 8: name + colour by the 領隊 only, palette only, unchanged writes nothing, a taken name is refused */
{
  const sty = (k, body) => call(guild.style, env, { method: 'POST', k, body });
  const C = guild.GUILD_COLORS[2], [kl, km, kn] = [key(), key(), key()];
  for (const k of [kl, km, kn]) is('register', await call(agents.register, env, { method: 'POST', k }), 201);
  const founded = await post(kl, { name: '風格隊', base: BASE }); is('found for the style check', founded, 201);
  is('a member joins for the style check', await call(guild.join, env, { method: 'POST', k: km, body: { guild: founded.body?.guild?.id } }), 200);
  is('style with no body', await call(guild.style, env, { method: 'POST', k: kl }), 400, 'invalid');
  is('style with nothing to change', await sty(kl, {}), 400, 'invalid');
  is('style off the palette', await sty(kl, { color: 'red' }), 400, 'invalid');
  is('style with markup in the name', await sty(kl, { name: '<b>x' }), 400, 'invalid');
  is('style with no guild', await sty(kn, { color: C }), 404, 'none');
  is('a member styles the guild', await sty(km, { color: C }), 403, 'leader');
  const ok = await sty(kl, { name: '改名隊', color: C });
  is('the 領隊 styles the guild', ok, 200);
  if (ok.body?.guild?.name !== '改名隊' || ok.body.guild.color !== C) bad('a style change must show back the new name and colour');
  const rows = () => db.sql.prepare('SELECT COALESCE(SUM(saves_today), 0) AS n FROM guild_saves').get().n;
  const before = rows();
  is('the same style again', await sty(kl, { name: '改名隊', color: C }), 200);
  if (rows() !== before) bad('an unchanged style must write nothing (no counter bump)');
  if ((await call(guild.mine, env, { k: kl })).body?.guild?.color !== C) bad('the colour must be kept');
  is('clear the colour', await sty(kl, { color: null }), 200);
  if ((await call(guild.mine, env, { k: kl })).body?.guild?.color !== null) bad('a null colour must clear it');
  const other = key(); is('register for the name clash', await call(agents.register, env, { method: 'POST', k: other }), 201);
  is('found a second guild', await post(other, { name: '另一隊', base: BASE }), 201);
  is('rename to a taken name', await sty(other, { name: '改名隊' }), 409, 'name');
}

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: guild routes closed without the binding and on production, name and base rules, founder is 領隊 + 總教練, one guild per fan, unique names.`);
