/* The 經紀人 effect report (league/tools/agent_sim.mjs, #795 part 3). Fails when
 *   - a listed trade is not a legal set (validateSet) or does not spend the pool exactly, or a kind lists no trade,
 *   - an all-neutral 'normal' row measures differently from no agents (the report's baseline would be wrong),
 *   - two measures of the same config differ (seeded, rule 11),
 *   - the trade-offs the report prints vanish: steal 4 has no more caught stealing than steal 0; edges 4 has not more
 *     strikeouts AND more walks than edges 0; pickoff 0 throws over.
 * Small game counts: the report itself runs 2000+. Usage: node tests/agent_sim.check.mjs */
import assert from 'node:assert/strict';
import { measure, trades, agentsFor } from '../league/tools/agent_sim.mjs';
import * as A from '../league/agentset.js';

const G = 60;
for (const kind of A.KINDS) {
  const list = trades(kind);
  assert.ok(list.length > 0, `${kind}: no trades`);
  for (const { label, row } of list) {
    const set = { v: A.AGENT_SET_VERSION, kind, rows: { [A.NORMAL]: row } };
    assert.deepEqual(A.validateSet(set), [], `${kind} ${label}`);
    assert.equal(A.pointsLeft(set), 0, `${kind} ${label}: pool not spent exactly`);
  }
  assert.ok(Object.keys(agentsFor(0, kind, {})).length > 0, `${kind}: no players carry the set`);
  assert.deepEqual(measure(kind, {}, G), measure(kind, null, G), `${kind}: neutral row differs from no agents`);
  const busy = Object.fromEntries(A.FREQS[kind].map((f, i) => [f, i % 2 ? A.LEVEL_MIN : A.LEVEL_MAX]));
  assert.deepEqual(measure(kind, busy, G), measure(kind, busy, G), `${kind}: not deterministic`);
}
const s0 = measure('bat', { steal: 0 }, G), s4 = measure('bat', { steal: 4 }, G);
assert.ok(s4.sbTry - s4.sbOk > s0.sbTry - s0.sbOk, 'steal 4: no more caught stealing than steal 0');
const e0 = measure('pit', { edges: 0 }, G), e4 = measure('pit', { edges: 4 }, G);
assert.ok(e4.k > e0.k && e4.bb > e0.bb, `edges 4 vs 0: K ${e4.k}/${e0.k}, BB ${e4.bb}/${e0.bb}`);
assert.equal(measure('pit', { pickoff: 0 }, G).po, 0, 'pickoff 0 still throws over');
console.log('agent_sim.check ok');
