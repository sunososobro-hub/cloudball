/* 經紀人 agent set check (#795 part 1). Runs league/agentset.js; fails when
 *   - the default set is invalid, not neutral, or does not spend exactly AGENT_POOL,
 *   - a row other than 'normal' does not inherit from 'normal', or a set cell does not override it,
 *   - the price is off: raising one cell must cost one point, raising 'normal' one per inheriting row, over the pool is refused,
 *   - a bad set (unknown kind / situation / frequency, a level out of range or not an integer, extra field) is accepted,
 *   - freezeSet is not canonical (two sets with the same grid freeze to different JSON) or changes the grid,
 *   - situationOf picks the wrong row,
 *   - an engine file imports league/agentset.js (part 2 wires it; until then today's games stay byte for byte).
 * static.mjs runs this file. Usage: node tests/agentset.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  KINDS, SITUATIONS, FREQS, LABELS, NORMAL, LEVEL_MIN, LEVEL_MAX, LEVEL_NEUTRAL, AGENT_POOL, LATE_INNING,
  defaultSet, validateSet, resolveSet, levelOf, pointsUsed, pointsLeft, isNeutral, freezeSet, situationOf,
} from '../league/agentset.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const J = JSON.stringify;

for (const k of KINDS) {
  const sits = SITUATIONS[k], freqs = FREQS[k], other = sits.find(s => s !== NORMAL), f0 = freqs[0], f1 = freqs[1];
  if (sits.length !== 4 || freqs.length !== 3) bad(`${k}: grid is not 4 x 3`);
  if (sits[0] !== NORMAL) bad(`${k}: first row is not normal`);
  for (const x of [...sits, ...freqs]) if (!LABELS[x]) bad(`${k}: no label for ${x}`);
  const d = defaultSet(k);
  if (validateSet(d).length) bad(`${k}: default refused: ${validateSet(d).join('; ')}`);
  if (!isNeutral(d)) bad(`${k}: default is not neutral`);
  if (pointsUsed(d) !== AGENT_POOL[k] || pointsLeft(d) !== 0) bad(`${k}: default uses ${pointsUsed(d)}, pool ${AGENT_POOL[k]}`);
  if (!isNeutral({ v: 1, kind: k })) bad(`${k}: set without rows is not neutral`);

  /* inheritance */
  const n = { v: 1, kind: k, rows: { [NORMAL]: { [f0]: LEVEL_NEUTRAL + 1, [f1]: LEVEL_NEUTRAL - 1 } } };
  for (const s of sits) {
    if (levelOf(n, s, f0) !== LEVEL_NEUTRAL + 1 || levelOf(n, s, f1) !== LEVEL_NEUTRAL - 1) bad(`${k}: ${s} does not inherit normal`);
    if (levelOf(n, s, freqs[2]) !== LEVEL_NEUTRAL) bad(`${k}: ${s}.${freqs[2]} unset is not neutral`);
  }
  const o = { v: 1, kind: k, rows: { [NORMAL]: { [f0]: 3 }, [other]: { [f0]: 0 } } };
  if (levelOf(o, other, f0) !== 0 || levelOf(o, NORMAL, f0) !== 3 || levelOf(o, sits[3], f0) !== 3) bad(`${k}: a set cell does not override normal`);

  /* price */
  const up1 = { v: 1, kind: k, rows: { [other]: { [f0]: LEVEL_NEUTRAL + 1 } } };
  if (pointsUsed(up1) !== AGENT_POOL[k] + 1) bad(`${k}: one cell up costs ${pointsUsed(up1) - AGENT_POOL[k]}, not 1`);
  if (!validateSet(up1).some(x => /pool/.test(x))) bad(`${k}: over the pool accepted`);
  const trade = { v: 1, kind: k, rows: { [other]: { [f0]: LEVEL_MAX, [f1]: LEVEL_MIN } } };
  if (validateSet(trade).length || pointsLeft(trade) !== 0) bad(`${k}: an even trade is refused or not even`);
  const nup = { v: 1, kind: k, rows: { [NORMAL]: { [f0]: LEVEL_NEUTRAL + 1 } } };
  if (pointsUsed(nup) - AGENT_POOL[k] !== sits.length) bad(`${k}: normal up costs ${pointsUsed(nup) - AGENT_POOL[k]}, not ${sits.length}`);
  const nupPaid = { v: 1, kind: k, rows: { [NORMAL]: { [f0]: LEVEL_NEUTRAL + 1, [f1]: LEVEL_NEUTRAL - 1 } } };
  if (validateSet(nupPaid).length) bad(`${k}: normal up paid by normal down refused`);
  const low = { v: 1, kind: k, rows: { [NORMAL]: Object.fromEntries(freqs.map(f => [f, LEVEL_MIN])) } };
  if (validateSet(low).length || pointsUsed(low) !== 0) bad(`${k}: all-minimum refused or not 0 points`);

  /* bad sets */
  const otherKind = KINDS.find(x => x !== k);
  const BAD = [
    null, [], { v: 2, kind: k }, { v: 1, kind: 'fan' }, { v: 1, kind: k, rows: [] }, { v: 1, kind: k, extra: 1 },
    { v: 1, kind: k, rows: { nowhere: {} } }, { v: 1, kind: k, rows: { [NORMAL]: { [FREQS[otherKind][0]]: 2 } } },
    { v: 1, kind: k, rows: { [NORMAL]: { [f0]: LEVEL_MAX + 1 } } }, { v: 1, kind: k, rows: { [NORMAL]: { [f0]: -1 } } },
    { v: 1, kind: k, rows: { [NORMAL]: { [f0]: 1.5 } } }, { v: 1, kind: k, rows: { [NORMAL]: { [f0]: '2' } } },
    { v: 1, kind: k, rows: { [NORMAL]: 3 } },
  ];
  for (const b of BAD) if (!validateSet(b).length) bad(`${k}: bad set accepted: ${J(b)}`);

  /* freeze: canonical, grid unchanged */
  const a1 = { v: 1, kind: k, rows: { [NORMAL]: { [f0]: 3, [f1]: 2 }, [other]: { [f0]: 3, [f1]: 1 } } };
  const a2 = { v: 1, kind: k, rows: { [other]: { [f1]: 1 }, [NORMAL]: { [f0]: 3 } } };
  if (J(freezeSet(a1)) !== J(freezeSet(a2))) bad(`${k}: same grid freezes differently: ${J(freezeSet(a1))} vs ${J(freezeSet(a2))}`);
  if (J(resolveSet(freezeSet(a1))) !== J(resolveSet(a1))) bad(`${k}: freeze changes the grid`);
  if (J(freezeSet(d)) !== J(defaultSet(k))) bad(`${k}: default does not freeze to itself`);
  if (J(freezeSet(freezeSet(a1))) !== J(freezeSet(a1))) bad(`${k}: freeze is not idempotent`);
}

/* situations */
const S = [
  ['bat', { inning: 1, outs: 0, bases: [0, 0, 0], margin: 0 }, 'normal'],
  ['bat', { inning: 3, outs: 1, bases: [1, 0, 0], margin: 4 }, 'runners_on'],
  ['bat', { inning: 3, outs: 2, bases: [1, 0, 0], margin: 4 }, 'two_outs'],
  ['bat', { inning: LATE_INNING, outs: 2, bases: [0, 1, 0], margin: -1 }, 'late_close'],
  ['bat', { inning: LATE_INNING, outs: 0, bases: [0, 0, 0], margin: 5 }, 'normal'],
  ['pit', { inning: 2, outs: 0, bases: [0, 0, 0], margin: 0 }, 'normal'],
  ['pit', { inning: 2, outs: 0, bases: [1, 0, 0], margin: 0 }, 'runners_on'],
  ['pit', { inning: 2, outs: 2, bases: [0, 0, 1], margin: -2 }, 'risp'],
  ['pit', { inning: 9, outs: 1, bases: [0, 0, 0], margin: 3 }, 'late_close'],
  ['pit', { inning: 9, outs: 1, bases: [0, 1, 0], margin: -1 }, 'risp'],
  ['pit', { inning: 9, outs: 1, bases: [0, 0, 0], margin: 4 }, 'normal'],
];
for (const [k, st, want] of S) { const got = situationOf(k, st); if (got !== want) bad(`situationOf(${k}, ${J(st)}) = ${got}, want ${want}`); }
for (const k of KINDS) if (!SITUATIONS[k].includes(situationOf(k, {}))) bad(`${k}: empty state has no row`);

/* no engine import yet (part 2 wires it) */
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(path.join(ROOT, 'engine')).filter(f => f.endsWith('.js'))) if (/agentset\.js/.test(readFileSync(f, 'utf8'))) bad(`${path.relative(ROOT, f)} imports league/agentset.js before part 2`);

if (problems.length) { console.error('agentset.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`agentset.check ok: ${KINDS.map(k => `${k} ${SITUATIONS[k].length}x${FREQS[k].length} pool ${AGENT_POOL[k]}`).join(', ')}; inheritance, price, freeze, situations`);
