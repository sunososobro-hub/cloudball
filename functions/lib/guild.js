/* Guilds, #800 part 1: one fan founds a guild and is its 領隊 (management) and, by default, its 總教練 (strategy, part 3).
 * Never official, no chat, $0. Uses the fan account of agents.js (key -> SHA-256 id) and the same D1 store; the engine is not touched
 * (rule 10). A guild plays on the roster of one league team (`base`); a member replaces the NPC at his position (part 2).
 * One guild per fan: guilds.leader and guild_members.agent_id are unique. */
import { guarded, json, fail, readBody, methodNotAllowed, sha256 } from './agents.js';
import { moveStep, limited } from './caps.js';
import { TEAMS } from '../../league/teams.js';
import { storedSet } from './agentset_store.js';
import { isNeutral } from '../../league/agentset.js';

export const NAME_MAX = 12;                       /* characters (code points) of a guild name */
export const GUILD_SEATS = 10;                  /* members per guild (the rest of the lineup is NPC fill): limited roster seats, owner 2026-11-28 */
export const REF_LEN = 10;
/* the lineup is by slot number, so it stays valid when members come and go: batting slots 0..8 are the nine lineup spots of the base team,
 * rotation slots 0..4 its five starters (the engine's ROTATION_SIZE); a member sits in the slot of the NPC he replaced (part 2 / 5) */
export const BAT_SLOTS = 9;
export const ROTATION_SLOTS = 5;
export const AUTO_LINEUP = { batting: Array.from({ length: BAT_SLOTS }, (_, i) => i), sp: 0 };
/* lineup problem: '' when `order` is each of the nine batting slots exactly once and `sp` a rotation slot */
export const lineupProblem = (order, sp) => {
  if (!Array.isArray(order) || order.length !== BAT_SLOTS) return `order must list ${BAT_SLOTS} batters`;
  if (new Set(order).size !== BAT_SLOTS || order.some(x => !Number.isInteger(x) || x < 0 || x >= BAT_SLOTS)) return `order must use each of the slots 0..${BAT_SLOTS - 1} once`;
  if (!Number.isInteger(sp) || sp < 0 || sp >= ROTATION_SLOTS) return `sp must be a rotation slot 0..${ROTATION_SLOTS - 1}`;
  return '';
};
/* what the game plays at the lock: the saved lineup, else (nothing saved, or a row that no longer parses) the automatic one */
export const lineupAtLock = row => {
  try { const batting = JSON.parse(row && row.batting); if (row && !lineupProblem(batting, row.sp)) return { batting, sp: row.sp, saved: true }; } catch (e) { /* fall through */ }
  return { ...AUTO_LINEUP, saved: false };
};
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
  const lineup = lineupAtLock(await db.prepare('SELECT batting, sp FROM guild_lineups WHERE guild_id = ?1').bind(g.id).first());
  /* a member's ref names him to the 領隊 for a removal without showing his agent id */
  const refs = await Promise.all(rows.map(async r => (await sha256(`${g.id}:${r.agent_id}`)).slice(0, REF_LEN)));
  return { id: g.id, name: g.name, base: { id: g.base, name: team ? team.name : g.base }, created: g.created_at, lineup,
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

/* POST /api/guild/lineup { order, sp }: the 總教練 saves the batting order and the starting pitcher (replaces the last save; counted as a daily save, SAVES_PER_DAY, #808; the same lineup again writes nothing) */
export const lineup = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body) return fail(400, 'invalid', { reasons: ['no lineup given'] });
  const bad = lineupProblem(body.order, body.sp);
  if (bad) return fail(400, 'invalid', { reasons: [bad] });
  const g = await myGuild(db, agent);
  if (!g) return fail(404, 'none');
  if (g.coach !== agent.id) return fail(403, 'coach');
  const batting = JSON.stringify(body.order), old = await db.prepare('SELECT batting, sp FROM guild_lineups WHERE guild_id = ?1').bind(g.id).first();
  if (old && old.batting === batting && old.sp === body.sp) return json(200, { ok: true, guild: await viewOf(db, g, agent.id) });   /* unchanged: writes nothing (#808) */
  await db.prepare('INSERT OR IGNORE INTO guild_saves (agent_id) VALUES (?1)').bind(agent.id).run();
  if (!((await moveStep(db, 'guild_saves', 'agent_id', agent.id, 'save').run()).meta.changes > 0)) return limited();
  await db.prepare(`INSERT INTO guild_lineups (guild_id, batting, sp, saved_at) VALUES (?1, ?2, ?3, ?4)
    ON CONFLICT(guild_id) DO UPDATE SET batting = excluded.batting, sp = excluded.sp, saved_at = excluded.saved_at`).bind(g.id, batting, body.sp, Date.now()).run();
  return json(200, { ok: true, guild: await viewOf(db, g, agent.id) });
}, { needKey: true });

/* POST /api/guild/coach { ref }: the 領隊 hands the 總教練 seat to a member (the ref from the guild view; his own ref takes it back) */
export const coach = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body || typeof body.ref !== 'string') return fail(400, 'invalid', { reasons: ['no member given'] });
  const g = await myGuild(db, agent);
  if (!g) return fail(404, 'none');
  if (g.leader !== agent.id) return fail(403, 'leader');
  const rows = (await db.prepare('SELECT agent_id FROM guild_members WHERE guild_id = ?1').bind(g.id).all()).results;
  let target = null;
  for (const r of rows) if ((await sha256(`${g.id}:${r.agent_id}`)).slice(0, REF_LEN) === body.ref) target = r.agent_id;
  if (!target) return fail(404, 'member');
  if (target !== g.coach) {
    if (!(await countMove(db, agent))) return limited();
    await db.prepare('UPDATE guilds SET coach = ?2 WHERE id = ?1').bind(g.id, target).run();
  }
  return json(200, { ok: true, guild: await viewOf(db, { ...g, coach: target }, agent.id) });
}, { needKey: true });

/* GET /api/guilds/export[?after=<guild id>]: every guild with its members and saved settings for the nightly Node run (#809 part 2), one page at a time.
 * Public data only (the shape league/guild_night.js reads): no agent id, no member ref. Keyset paging by guild id, EXPORT_PAGE guilds a page; `next` is the
 * last id of a full page (pass it as ?after=), null on the last one. Two reads per page, no write. `settings` stays null until the settings store exists (#795). */
export const EXPORT_PAGE = 50;
export const exportPage = guarded(async ({ request, db }) => {
  const after = new URL(request.url).searchParams.get('after') || '';
  if (after && !/^[0-9a-f]{12}$/.test(after)) return fail(400, 'invalid', { reasons: ['after is a guild id'] });
  const gs = (await db.prepare('SELECT id, name, base, leader, coach FROM guilds WHERE id > ?1 ORDER BY id LIMIT ?2').bind(after, EXPORT_PAGE).all()).results;
  const mem = gs.length ? (await db.prepare(`SELECT m.guild_id, m.agent_id, p.pid, p.name, p.kind, p.ovr, p.player, s.agentset FROM guild_members m LEFT JOIN players p ON p.agent_id = m.agent_id
    LEFT JOIN guild_saves s ON s.agent_id = m.agent_id WHERE m.guild_id IN (${gs.map((_, i) => '?' + (i + 1)).join(',')}) ORDER BY m.guild_id, m.joined_at, m.agent_id`).bind(...gs.map(g => g.id)).all()).results : [];
  const guilds = gs.map(g => ({ id: g.id, name: g.name, base: g.base, settings: null,
    members: mem.filter(r => r.guild_id === g.id).map(r => {
      let pos = null; try { const p = JSON.parse(r.player || 'null'); pos = p && (p.pos || p.role) || null; } catch (e) { /* no player */ }
      /* #795 part 4b: his stored 經紀人 set (canonical, functions/lib/agentset_store.js) rides along as `tactics`, only when it is not all-neutral,
       * so the nightly lock freezes it into his games (league/guild_night.js freeze) and a fan without a set exports exactly as before */
      const set = r.name ? storedSet(r.agentset, r.pid, r.kind) : null, tactics = set && !isNeutral(set) ? { tactics: set } : {};
      return { leader: r.agent_id === g.leader, coach: r.agent_id === g.coach, player: r.name ? { name: r.name, kind: r.kind, ovr: r.ovr, pos, ...tactics } : null };
    }) }));
  return json(200, { ok: true, guilds, next: gs.length === EXPORT_PAGE ? gs[gs.length - 1].id : null });
});

export { methodNotAllowed };
