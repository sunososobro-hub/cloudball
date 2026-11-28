/* Per-fan daily write caps, #808. D1 Free allows 100,000 rows written per day and every indexed column adds one more row, so every
 * fan write that can repeat (settings / lineup saves, guild moves) is capped per UTC day. The counter lives INSIDE the row being
 * written (a day column + a count column), never in a counter row per action: one write = one row. Past the cap the answer is
 * 429 {"ok":false,"why":"limit"}. Not a route; no engine change (rule 10). Table and column names come from this code, never a request.
 * Row shape for a table that uses it: `saved_day INTEGER NOT NULL DEFAULT 0, saves_today INTEGER NOT NULL DEFAULT 0` (kind 'save')
 * and `moved_day ..., moves_today ...` (kind 'move'; keep it on the fan's own persistent row: a leave deletes the member row).
 * Next (#795, #800 part 2+3): their handlers call these; their UIs save on one explicit 儲存 button, never per slider change.
 * No HANDOFF.md under functions/: every file there becomes a route (tests/stats.check.mjs). */
import { fail } from './agents.js';

export const SAVES_PER_DAY = 20;          /* settings + lineup saves together, per fan per UTC day */
export const GUILD_MOVES_PER_DAY = 10;    /* join + leave + remove + hand-over together, per fan per UTC day */
export const KINDS = {
  save: { day: 'saved_day', n: 'saves_today', cap: SAVES_PER_DAY },
  move: { day: 'moved_day', n: 'moves_today', cap: GUILD_MOVES_PER_DAY },
};
const DAY_MS = 86400000;
export const dayOf = now => Math.floor(now / DAY_MS);
const IDENT = /^[a-z_]+$/;
const kindOf = kind => { const k = KINDS[kind]; if (!k) throw new Error('unknown cap kind'); return k; };
const ident = s => { if (!IDENT.test(s)) throw new Error('bad identifier'); return s; };

/* UPDATE fragment: the count restarts at 1 on a new day, else +1 */
const bump = k => `${k.day} = ?1, ${k.n} = CASE WHEN ${k.day} = ?1 THEN ${k.n} + 1 ELSE 1 END`;
/* WHERE fragment: a new day, or still under the cap */
const room = k => `(${k.day} < ?1 OR ${k.n} < ${k.cap})`;

/* A guild move (or any counted action with no JSON body): one UPDATE of the fan's row. changes 0 = no such row or over the cap. */
export const moveStep = (db, table, keyCol, key, kind = 'move', now = Date.now()) => {
  const k = kindOf(kind);
  return db.prepare(`UPDATE ${ident(table)} SET ${bump(k)} WHERE ${ident(keyCol)} = ?2 AND ${room(k)}`).bind(dayOf(now), key);
};
export const withinCap = async (db, table, keyCol, key, kind = 'move', now = Date.now()) => (await moveStep(db, table, keyCol, key, kind, now).run()).meta.changes > 0;

/* One JSON row per fan / guild, overwritten, no history rows. `json` is the whole new value as text; `col` its column.
 * An unchanged value is a no-op that writes nothing (not even a counter); a changed one is ONE row write with its counter bumped.
 * Returns 'saved' | 'unchanged' | 'limit'. The row must exist (create it with the account); no row = 'missing'. */
export const saveJson = async (db, { table, keyCol, key, col, json, kind = 'save', now = Date.now() }) => {
  const k = kindOf(kind), t = ident(table), kc = ident(keyCol), c = ident(col);
  const done = await db.prepare(`UPDATE ${t} SET ${c} = ?3, ${bump(k)} WHERE ${kc} = ?2 AND ${c} IS NOT ?3 AND ${room(k)}`).bind(dayOf(now), key, json).run();
  if (done.meta.changes > 0) return 'saved';
  const row = await db.prepare(`SELECT ${c} AS v FROM ${t} WHERE ${kc} = ?1`).bind(key).first();
  if (!row) return 'missing';
  return row.v === json ? 'unchanged' : 'limit';
};

export const limited = () => fail(429, 'limit');
