/* Call-up rule (league/callup.js, #500). Fails when
 *   - the real roster (league/site/players.json) has an open slot, or a slot count differs from the data (no typed numbers),
 *   - a ready player with no open slot is called up, or his queue number is wrong (overall, then days waited),
 *   - a player under the weakest starter of his position is called ready, or a created pitcher (role, no pos) is not placed by role,
 *   - a starter who reaches RETIRE_AGE does not open exactly his own slot, or the first in the queue is not the one called up,
 *   - a fake extra team does not bring its slots (the template of a team) with no code change,
 *   - league/callup.js uses Math.random, Date or an import of engine/, DOM or the network, or one input gives two answers.
 * Usage: node tests/callup.check.mjs */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RETIRE_AGE, STATUS, slotTemplate, teamsOf, openSlots, weakestAt, isReady, decide, starters } from '../league/callup.js';

const read = f => readFileSync(new URL(f, import.meta.url), 'utf8');
const players = JSON.parse(read('../league/site/players.json'));
const all = Object.values(players), tpl = slotTemplate(players), teams = teamsOf(players);
const count = (team, pos) => all.filter(p => p.team === team && p.tier === 1 && p.pos === pos).length;

assert.ok(teams.length >= 4 && Object.keys(tpl).length >= 11, 'template read from the data');
for (const t of teams) for (const [pos, n] of Object.entries(tpl)) assert.equal(count(t, pos), n, `${t} ${pos} slots match the data`);
assert.equal(openSlots(players).length, 0, 'a full real roster has no open slot');
assert.equal(starters(players).length, all.filter(p => p.tier === 1).length, 'nobody in the data is at retirement age yet');

/* a ready player, no slot: waits, with queue numbers by overall then days waited */
const pos = 'SS', weakest = weakestAt(players, pos);
assert.equal(weakest, Math.min(...all.filter(p => p.pos === pos).map(p => p.overall)));
const wait = [
  { id: 'a', pos, overall: weakest + 5, waited: 10 }, { id: 'b', pos, overall: weakest + 5, waited: 30 },
  { id: 'c', pos, overall: weakest + 9, waited: 1 }, { id: 'd', pos, overall: weakest - 1, waited: 99 },
];
let r = decide(players, wait);
assert.deepEqual(r.called, [], 'no slot: nobody is called up');
assert.deepEqual(r.waiting.map(w => [w.id, w.queue, w.status]), [['c', 1, STATUS.wait], ['b', 2, STATUS.wait], ['a', 3, STATUS.wait]]);
assert.deepEqual(r.farm.map(f => [f.id, f.status]), [['d', STATUS.farm]], 'under the weakest starter: not ready, stays 二軍');
assert.equal(isReady(wait[0], players), true); assert.equal(isReady(wait[3], players), false);

/* a starter retires: his slot opens, the first in the queue goes there */
const gone = structuredClone(players), id = Object.keys(gone).find(k => gone[k].pos === pos && gone[k].overall > weakest + 9);   /* not the weakest: the line stays */
const slotTeam = gone[id].team;
gone[id].age = RETIRE_AGE;
assert.deepEqual(openSlots(gone), [{ team: slotTeam, pos }], 'exactly his own slot opens');
r = decide(gone, wait);
assert.deepEqual(r.called, [{ id: 'c', team: slotTeam, pos }]);
assert.deepEqual(r.waiting.map(w => [w.id, w.queue]), [['b', 1], ['a', 2]], 'the rest move up');
assert.ok(weakestAt(gone, pos) !== undefined, 'the other starters still set the line');

/* another position is not affected, and a created pitcher is placed by role */
const sp = { id: 'p1', role: 'SP', overall: 99, waited: 0 }, cl = { id: 'p2', role: 'CL', overall: 99, waited: 0 };
r = decide(gone, [sp, cl, wait[0]]);
assert.deepEqual(r.called.map(c => c.id), ['a'], 'only SS had a slot');
assert.deepEqual(r.waiting.map(w => [w.id, w.pos]).sort(), [['p1', 'SP'], ['p2', 'RP']], 'SP -> SP, CL -> RP');

/* a new team: its slots are open with no code change, filled by the queue */
const more = [...teams, 'newteam'], slots = openSlots(players, { teams: more });
assert.equal(slots.length, Object.values(tpl).reduce((a, b) => a + b, 0), 'one whole template of slots');
assert.ok(slots.every(s => s.team === 'newteam'));
for (const [p, n] of Object.entries(tpl)) assert.equal(slots.filter(s => s.pos === p).length, n);
r = decide(players, wait, { teams: more });
assert.deepEqual(r.called, [{ id: 'c', team: 'newteam', pos }], 'a waiting player gets the new slot');
assert.deepEqual(r.waiting.map(w => [w.id, w.queue]), [['b', 1], ['a', 2]]);

/* same input, same answer; the file is pure */
assert.equal(JSON.stringify(decide(players, wait, { teams: more })), JSON.stringify(decide(players, wait, { teams: more })));
const src = read('../league/callup.js');
assert.ok(!/Math\.random|Date|document|window|fetch\(|engine\//.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'callup.js is pure');
console.log('callup.check ok');
