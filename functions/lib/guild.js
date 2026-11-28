/* Guilds, #800 part 1: one fan founds a guild and is its 領隊 (management) and, by default, its 總教練 (strategy, part 3).
 * Never official, no chat, $0. Uses the fan account of agents.js (key -> SHA-256 id) and the same D1 store; the engine is not touched
 * (rule 10). A guild plays on the roster of one league team (`base`); a member replaces the NPC at his position (part 2).
 * One guild per fan: guilds.leader and guild_members.agent_id are unique. */
import { guarded, json, fail, readBody, methodNotAllowed } from './agents.js';
import { TEAMS } from '../../league/teams.js';

export const NAME_MAX = 12;                       /* characters (code points) of a guild name */
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

const viewOf = async (db, g) => {
  const rows = (await db.prepare(`SELECT m.agent_id, p.name, p.kind, p.ovr, p.player FROM guild_members m
    LEFT JOIN players p ON p.agent_id = m.agent_id WHERE m.guild_id = ?1 ORDER BY m.joined_at, m.agent_id`).bind(g.id).all()).results;
  const team = TEAMS.find(t => t.id === g.base);
  return { id: g.id, name: g.name, base: { id: g.base, name: team ? team.name : g.base }, created: g.created_at,
    /* agent ids never leave the server: roles are flags on the member rows */
    members: rows.map(r => {
      let pos = null; try { const p = JSON.parse(r.player || 'null'); pos = p && (p.pos || p.role) || null; } catch (e) { /* no player */ }
      return { leader: r.agent_id === g.leader, coach: r.agent_id === g.coach, player: r.name ? { name: r.name, kind: r.kind, ovr: r.ovr, pos } : null };
    }) };
};
const myGuild = (db, agent) => db.prepare('SELECT g.* FROM guilds g JOIN guild_members m ON m.guild_id = g.id WHERE m.agent_id = ?1').bind(agent.id).first();

/* GET /api/guild: this agent's guild, or null */
export const mine = guarded(async ({ db, agent }) => {
  const g = await myGuild(db, agent);
  return json(200, { ok: true, guild: g ? await viewOf(db, g) : null, bases: TEAMS.map(t => ({ id: t.id, name: t.name })), nameMax: NAME_MAX });
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
  return json(201, { ok: true, guild: await viewOf(db, { id, name, base: body.base, leader: agent.id, coach: agent.id, created_at: now }) });
}, { needKey: true });

export { methodNotAllowed };
