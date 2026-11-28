/* #795 part 4: store the 經紀人 set (league/agentset.js) of a fan's player. Not a route (no onRequest); functions/api/player/agentset.js uses it.
 * One row per fan, overwritten, no history: the `agentset` column of the fan's guild_saves row, the same row that holds his daily save counter
 * (functions/lib/caps.js kind 'save', #808: settings + lineup saves share SAVES_PER_DAY), so a changed save is ONE row write and an unchanged one
 * writes nothing. Stored value: {"pid": <player id>, "set": freezeSet(set)} (canonical: same grid = same text). A set saved for an earlier
 * player (released, or reclaimed another) never applies to the current one: GET answers the default (all-neutral) set of his kind.
 * Freezing into a game at its lock (the next part) reads the stored canonical set as is. Game outcomes are not touched here (rule 10). */
import { guarded, readBody, json, fail } from './agents.js';
import { saveJson, limited } from './caps.js';
import { validateSet, freezeSet, defaultSet, pointsUsed, AGENT_POOL } from '../../league/agentset.js';

const myPlayer = (db, agent) => db.prepare('SELECT pid, kind FROM players WHERE agent_id = ?1').bind(agent.id).first();

/* the stored set of this player, or the default of his kind (a missing, unreadable, other-player or invalid value) */
export const storedSet = (text, pid, kind) => {
  let v = null; try { v = JSON.parse(text || 'null'); } catch (e) { v = null; }
  const set = v && v.pid === pid && v.set && v.set.kind === kind && !validateSet(v.set).length ? v.set : null;
  return set || defaultSet(kind);
};
const view = (set, kind) => ({ ok: true, kind, set, pool: AGENT_POOL[kind], used: pointsUsed(set) });

/* GET: { ok, kind, set, pool, used }; 404 none without a player */
export const getSet = guarded(async ({ db, agent }) => {
  const p = await myPlayer(db, agent);
  if (!p) return fail(404, 'none');
  const row = await db.prepare('SELECT agentset FROM guild_saves WHERE agent_id = ?1').bind(agent.id).first();
  return json(200, view(storedSet(row && row.agentset, p.pid, p.kind), p.kind));
}, { needKey: true });

/* POST { set }: validate (league/agentset.js validateSet, the points pool included) and save the canonical form; the kind must be the player's.
 * 200 { ..., saved: true | false (unchanged) }; 400 invalid { reasons }; 404 none; 429 limit (past SAVES_PER_DAY). */
export const saveSet = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body || body.set === undefined) return fail(400, 'invalid', { reasons: ['no set given'] });
  const reasons = validateSet(body.set);
  if (reasons.length) return fail(400, 'invalid', { reasons });
  const p = await myPlayer(db, agent);
  if (!p) return fail(404, 'none');
  if (body.set.kind !== p.kind) return fail(400, 'invalid', { reasons: [`set kind ${body.set.kind} is not the player's kind ${p.kind}`] });
  const set = freezeSet(body.set), text = JSON.stringify({ pid: p.pid, set });
  const row = await db.prepare('SELECT agentset FROM guild_saves WHERE agent_id = ?1').bind(agent.id).first();
  if (row && row.agentset === text) return json(200, { ...view(set, p.kind), saved: false });   /* unchanged: writes nothing (#808) */
  if (!row) await db.prepare('INSERT OR IGNORE INTO guild_saves (agent_id) VALUES (?1)').bind(agent.id).run();
  const r = await saveJson(db, { table: 'guild_saves', keyCol: 'agent_id', key: agent.id, col: 'agentset', json: text });
  if (r === 'limit') return limited();
  if (r === 'missing') return fail(500, 'error');
  return json(200, { ...view(set, p.kind), saved: r === 'saved' });
}, { needKey: true });
