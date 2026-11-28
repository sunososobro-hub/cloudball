/* Per-fan daily write caps (#808): functions/lib/caps.js against an in-memory SQLite behind the D1 shim of guild.check.mjs.
 * Fails when
 *   - save number SAVES_PER_DAY + 1 of one UTC day is accepted (or a move past GUILD_MOVES_PER_DAY);
 *   - an unchanged save writes anything (a row change or a counter bump), even at the cap;
 *   - a changed save writes more than the one row, or the counter is not in that row (the table gets no extra rows);
 *   - the next UTC day does not restart the count, or one fan's cap spends another fan's;
 *   - a table or column name that is not a plain identifier is let into the SQL.
 * Usage: node tests/caps.check.mjs */
import { createRequire } from 'node:module';
import * as caps from '../functions/lib/caps.js';

const require = createRequire(import.meta.url);
const { DatabaseSync } = (process.removeAllListeners('warning'), require('node:sqlite'));
const problems = [], bad = m => problems.push(m);
const sql = new DatabaseSync(':memory:');
const stmt = (text, args = []) => ({
  bind: (...a) => stmt(text, a),
  first: async () => sql.prepare(text).get(...args) ?? null,
  run: async () => ({ meta: { changes: Number(sql.prepare(text).run(...args).changes) } }),
});
const db = { prepare: t => stmt(t) };
sql.exec(`CREATE TABLE fan_settings (agent_id TEXT PRIMARY KEY, settings TEXT NOT NULL, saved_day INTEGER NOT NULL DEFAULT 0, saves_today INTEGER NOT NULL DEFAULT 0,
  moved_day INTEGER NOT NULL DEFAULT 0, moves_today INTEGER NOT NULL DEFAULT 0)`);
sql.exec("INSERT INTO fan_settings (agent_id, settings) VALUES ('a', '{}'), ('b', '{}')");
const rows = () => sql.prepare('SELECT COUNT(*) AS n FROM fan_settings').get().n;
const T0 = Date.UTC(2026, 10, 28, 12), T1 = T0 + 86400000;
const save = (key, v, now = T0) => caps.saveJson(db, { table: 'fan_settings', keyCol: 'agent_id', key, col: 'settings', json: JSON.stringify(v), now });
const move = (key, now = T0) => caps.withinCap(db, 'fan_settings', 'agent_id', key, 'move', now);
const eq = (what, got, want) => { if (got !== want) bad(`${what}: expected ${want}, got ${got}`); };

if (caps.SAVES_PER_DAY < 1 || caps.GUILD_MOVES_PER_DAY < 1) bad('the caps must be named positive numbers');
for (let i = 1; i <= caps.SAVES_PER_DAY; i++) eq(`save ${i}`, await save('a', { n: i }), 'saved');
eq('save cap+1', await save('a', { n: 'over' }), 'limit');
eq('unchanged save at the cap', await save('a', { n: caps.SAVES_PER_DAY }), 'unchanged');
eq('counter after cap+1', sql.prepare("SELECT saves_today AS n FROM fan_settings WHERE agent_id = 'a'").get().n, caps.SAVES_PER_DAY);
eq('other fan unaffected', await save('b', { n: 1 }), 'saved');
eq('missing row', await save('nobody', { n: 1 }), 'missing');
eq('next day restarts', await save('a', { n: 'next' }, T1), 'saved');
eq('next day counter', sql.prepare("SELECT saves_today AS n FROM fan_settings WHERE agent_id = 'a'").get().n, 1);
eq('table rows (no history, no counter rows)', rows(), 2);

/* a changed save is one row change; an unchanged one is none */
const before = sql.prepare("SELECT * FROM fan_settings WHERE agent_id = 'b'").get();
eq('unchanged save', await save('b', { n: 1 }), 'unchanged');
if (JSON.stringify(sql.prepare("SELECT * FROM fan_settings WHERE agent_id = 'b'").get()) !== JSON.stringify(before)) bad('an unchanged save changed the row');
const one = await caps.moveStep(db, 'fan_settings', 'agent_id', 'b', 'move', T0).run();
eq('a move changes one row', one.meta.changes, 1);

/* moves are counted apart from saves */
for (let i = 2; i <= caps.GUILD_MOVES_PER_DAY; i++) eq(`move ${i}`, await move('b'), true);
eq('move cap+1', await move('b'), false);
eq('move next day', await move('b', T1), true);
eq('moves do not spend saves', sql.prepare("SELECT saves_today AS n FROM fan_settings WHERE agent_id = 'b'").get().n, 1);

for (const [t, c] of [['fan_settings; DROP TABLE x', 'settings'], ['fan_settings', 'settings --']]) {
  let threw = false; try { await caps.saveJson(db, { table: t, keyCol: 'agent_id', key: 'a', col: c, json: '{}', now: T0 }); } catch (e) { threw = true; }
  if (!threw) bad(`identifier ${JSON.stringify([t, c])} must be refused`);
}
if (problems.length) { console.error(problems.map(p => '  - ' + p).join('\n')); console.error(`caps.check: FAIL (${problems.length})`); process.exit(1); }
console.log(`caps.check: ok (save cap ${caps.SAVES_PER_DAY}, move cap ${caps.GUILD_MOVES_PER_DAY})`);
