/* Guilds, #800 part 1: one fan founds a guild and is its 領隊 (management) and, by default, its 總教練 (strategy, part 3).
 * Never official, no chat, $0. Uses the fan account of agents.js (key -> SHA-256 id) and the same D1 store; the engine is not touched
 * (rule 10). A guild plays on the roster of one league team (`base`); a member replaces the NPC at his position (part 2).
 * One guild per fan: guilds.leader and guild_members.agent_id are unique. */
import { guarded, json, fail, readBody, methodNotAllowed, sha256 } from './agents.js';
import { moveStep, limited } from './caps.js';
import { TEAMS } from '../../league/teams.js';

export const NAME_MAX = 12;                       /* characters (code points) of a guild name */
export const GUILD_SEATS = 10;                  /* members per guild (the rest of the lineup is NPC fill): limited roster seats, owner 2026-11-28 */
export const REF_LEN = 10;
export const BASES = TEAMS.map(t => t.id);
/* a guild name: 1..NAME_MAX characters, no control characters, no < > & " ' (it is drawn as text, never as markup) */
export const nameProblem = raw => {
  if (typeof raw !== 'string') return 'name must be text';
  const n = raw.trim(), len = [...n].length;
  if (!len) return 'name is empty';
  if (len > NAME_MAX) return `name must be at most ${NAME_MAX} characters`;
  if (/[\u0000-\u001f\u007f<>&"']/.test(n)) return 'name has characters that are not allowed';
  return '';
};

const viewOf = async (db, g, viewer) => {
  const rows = (await db.prepare(`SELECT m.agent_id, p.name, p.kind, p.ovr, p.player FROM guild_members m
    LEFT JOIN players p ON p.agent_id = m.agent_id WHERE m.guild_id = ?1 ORDER BY m.joined_at, m.agent_id`).bind(g.id).all()).results;
  const team = TEAMS.find(t => t.id === g.base);
  /* a member's ref names him to the 領隊 for a removal without showing his agent id */
  const refs = await Promise.all(rows.map(async r => (await sha256(`${g.id}:${r.agent_id}`)).slice(0, REF_LEN)));
  return { id: g.id, name: g.name, base: { id: g.base, name: team ? team.name : g.base }, created: g.created_at,
    /* agent ids never leave the server: roles are flags on the member rows */
    members: rows.map((r, i) => {
      let pos = null; try { const p = JSON.parse(r.player || 'null'); pos = p && (p.pos || p.role) || null; } catch (e) { /* no player */ }
      return { ref: refs[i], me: r.agent_id === viewer, leader: r.agent_id === g.leader, coach: r.agent_id === g.coach, player: r.name ? { name: r.name, kind: r.kind, ovr: r.ovr, pos } : null };
    }) };
};
const myGuild = (db, agent) => db.prepare('SELECT g.* FROM guilds g JOIN guild_members m ON m.guild_id = g.id WHERE m.agent_id = ?1').bind(agent.id).first();

/* GET /api/guild: this agent's guild, or null */
export const mine = guarded(async ({ request, db, agent }) => {
  const g = await myGuild(db, agent);
  /* ?join=<guild id>: what the invite link shows before he taps join (name, base, seats; no member names) */
  const code = new URL(request.url).searchParams.get('join');
  const inv = code && /^[0-9a-f]{12}$/.test(code) ? await db.prepare('SELECT g.id, g.name, g.base, (SELECT COUNT(*) FROM guild_members WHERE guild_id = g.id) AS n FROM guilds g WHERE g.id = ?1').bind(code).first() : null;
  const invite = inv ? { id: inv.id, name: inv.name, base: TEAMS.find(t => t.id === inv.base)?.name || inv.base, seats: GUILD_SEATS, taken: inv.n } : null;
  return json(200, { ok: true, guild: g ? await viewOf(db, g, agent.id) : null, invite, seats: GUILD_SEATS, bases: TEAMS.map(t => ({ id: t.id, name: t.name })), nameMax: NAME_MAX });
}, { needKey: true });

/* POST /api/guild { name, base }: found a guild; the founder is 領隊 and 總教練 and the first member */
export const create = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body) return fail(400, 'invalid', { reasons: ['no choice given'] });
  const reasons = [], bad = nameProblem(body.name);
  if (bad) reasons.push(bad);
  if (!BASES.includes(body.base)) reasons.push(`base must be one of ${BASES.join(', ')}`);
  if (reasons.length) return fail(400, 'invalid', { reasons });
  if (await myGuild(db, agent)) return fail(409, 'already');
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 12), name = body.name.trim(), now = Date.now();
  try {
    await db.batch([
      db.prepare('INSERT INTO guilds (id, name, base, leader, coach, created_at) VALUES (?1, ?2, ?3, ?4, ?4, ?5)').bind(id, name, body.base, agent.id, now),
      db.prepare('INSERT INTO guild_members (agent_id, guild_id, joined_at) VALUES (?1, ?2, ?3)').bind(agent.id, id, now),
    ]);
  } catch (e) {
    /* a unique key said no: this fan already founded one (a second tap), or the name is taken */
    return fail(409, (await myGuild(db, agent)) ? 'already' : 'name');
  }
  return json(201, { ok: true, guild: await viewOf(db, { id, name, base: body.base, leader: agent.id, coach: agent.id, created_at: now }, agent.id) });
}, { needKey: true });

/* one counted move of this fan (join / leave / remove / hand-over): the first one makes his counter row, then the capped UPDATE. false = over the cap */
const countMove = async (db, agent) => {
  await db.prepare('INSERT OR IGNORE INTO guild_fans (agent_id) VALUES (?1)').bind(agent.id).run();
  return (await moveStep(db, 'guild_fans', 'agent_id', agent.id).run()).meta.changes > 0;
};

/* POST /api/guild/join { guild }: join by the invite link (the guild id); one guild per fan, any time, no cooldown (daily move cap only) */
export const join = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body || typeof body.guild !== 'string' || !/^[0-9a-f]{12}$/.test(body.guild)) return fail(400, 'invalid', { reasons: ['no invite given'] });
  if (await myGuild(db, agent)) return fail(409, 'already');
  const g = await db.prepare('SELECT * FROM guilds WHERE id = ?1').bind(body.guild).first();
  if (!g) return fail(404, 'none');
  if (!(await countMove(db, agent))) return limited();
  /* the seat check is part of the INSERT, so two fans taking the last seat cannot both get it */
  const done = await db.prepare(`INSERT INTO guild_members (agent_id, guild_id, joined_at) SELECT ?1, ?2, ?3
    WHERE (SELECT COUNT(*) FROM guild_members WHERE guild_id = ?2) < ?4`).bind(agent.id, g.id, Date.now(), GUILD_SEATS).run().catch(() => null);
  if (!done) return fail(409, 'already');
  if (!done.meta.changes) return fail(409, 'full');
  return json(200, { ok: true, guild: await viewOf(db, g, agent.id) });
}, { needKey: true });

/* POST /api/guild/leave: a member leaves; the 領隊 cannot (he removes the others, or the guild stays); a leaving 總教練's seat goes back to the 領隊 */
export const leave = guarded(async ({ db, agent }) => {
  const g = await myGuild(db, agent);
  if (!g) return fail(404, 'none');
  if (g.leader === agent.id) return fail(409, 'leader');
  if (!(await countMove(db, agent))) return limited();
  await db.batch([
    db.prepare('UPDATE guilds SET coach = leader WHERE id = ?1 AND coach = ?2').bind(g.id, agent.id),
    db.prepare('DELETE FROM guild_members WHERE agent_id = ?1 AND guild_id = ?2').bind(agent.id, g.id),
  ]);
  return json(200, { ok: true, guild: null });
}, { needKey: true });

/* POST /api/guild/remove { ref }: the 領隊 removes a member (the ref from the guild view); not himself */
export const remove = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body || typeof body.ref !== 'string') return fail(400, 'invalid', { reasons: ['no member given'] });
  const g = await myGuild(db, agent);
  if (!g) return fail(404, 'none');
  if (g.leader !== agent.id) return fail(403, 'leader');
  const rows = (await db.prepare('SELECT agent_id FROM guild_members WHERE guild_id = ?1').bind(g.id).all()).results;
  let target = null;
  for (const r of rows) if ((await sha256(`${g.id}:${r.agent_id}`)).slice(0, REF_LEN) === body.ref) target = r.agent_id;
  if (!target || target === agent.id) return fail(404, 'member');
  if (!(await countMove(db, agent))) return limited();
  await db.batch([
    db.prepare('UPDATE guilds SET coach = leader WHERE id = ?1 AND coach = ?2').bind(g.id, target),
    db.prepare('DELETE FROM guild_members WHERE agent_id = ?1 AND guild_id = ?2').bind(target, g.id),
  ]);
  return json(200, { ok: true, guild: await viewOf(db, g, agent.id) });
}, { needKey: true });

/* GET /api/guilds/export[?after=<guild id>]: every guild with its members and saved settings for the nightly Node run (#809 part 2), one page at a time.
 * Public data only (the shape league/guild_night.js reads): no agent id, no member ref. Keyset paging by guild id, EXPORT_PAGE guilds a page; `next` is the
 * last id of a full page (pass it as ?after=), null on the last one. Two reads per page, no write. `settings` stays null until the settings store exists (#795). */
export const EXPORT_PAGE = 50;
export const exportPage = guarded(async ({ request, db }) => {
  const after = new URL(request.url).searchParams.get('after') || '';
  if (after && !/^[0-9a-f]{12}$/.test(after)) return fail(400, 'invalid', { reasons: ['after is a guild id'] });
  const gs = (await db.prepare('SELECT id, name, base, leader, coach FROM guilds WHERE id > ?1 ORDER BY id LIMIT ?2').bind(after, EXPORT_PAGE).all()).results;
  const mem = gs.length ? (await db.prepare(`SELECT m.guild_id, m.agent_id, p.name, p.kind, p.ovr, p.player FROM guild_members m LEFT JOIN players p ON p.agent_id = m.agent_id
    WHERE m.guild_id IN (${gs.map((_, i) => '?' + (i + 1)).join(',')}) ORDER BY m.guild_id, m.joined_at, m.agent_id`).bind(...gs.map(g => g.id)).all()).results : [];
  const guilds = gs.map(g => ({ id: g.id, name: g.name, base: g.base, settings: null,
    members: mem.filter(r => r.guild_id === g.id).map(r => {
      let pos = null; try { const p = JSON.parse(r.player || 'null'); pos = p && (p.pos || p.role) || null; } catch (e) { /* no player */ }
      return { leader: r.agent_id === g.leader, coach: r.agent_id === g.coach, player: r.name ? { name: r.name, kind: r.kind, ovr: r.ovr, pos } : null };
    }) }));
  return json(200, { ok: true, guilds, next: gs.length === EXPORT_PAGE ? gs[gs.length - 1].id : null });
});

export { methodNotAllowed };
