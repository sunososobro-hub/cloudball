/* Guard for the team needs board (league/needs.js, #431). Runs on the real league/site/players.json; deterministic.
 * Fails when
 *   - a position with no starter does not show as short, or a team's starters do not add up to the file's 一軍 count;
 *   - the ability medians or gaps are not read from the data (a gap must equal median - team average, and `short` counts gap > 0);
 *   - the creation page lines are empty, miss the RBI note, or the tag shows below TAG_MIN_TEAMS;
 *   - the comparison does not use the overall his points read as (a batter at the data's own abilities reads his own overall).
 * Usage: node tests/needs.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { needsOf, slotLine, abilityTag, compareLine, weakestStarter, overallOfPoints, BAT_POSITIONS, PIT_ROLES, BAT_KEYS, PIT_KEYS, TAG_MIN_TEAMS, RBI_NOTE } from '../league/needs.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), problems = [], bad = m => problems.push(m);
const players = JSON.parse(readFileSync(path.join(ROOT, 'league/site/players.json'), 'utf8'));
const first = Object.values(players).filter(p => p.tier === 1);
const n = needsOf(players), again = needsOf(players);
if (JSON.stringify(n) !== JSON.stringify(again)) bad('needsOf must be deterministic');
if (!n.teams.length) bad('no teams read from players.json');

/* numbers add up: every 一軍 player is counted once, at his position */
const counted = Object.values(n.pos).reduce((t, byTeam) => t + Object.values(byTeam).reduce((u, c) => u + c.count, 0), 0);
if (counted !== first.length) bad(`starters counted ${counted}, the file has ${first.length}`);
for (const slot of [...BAT_POSITIONS, ...PIT_ROLES]) for (const t of n.teams) {
  const mine = first.filter(p => p.team === t && p.pos === slot), c = n.pos[slot][t];
  if (c.count !== mine.length || c.best !== (mine.length ? Math.max(...mine.map(p => p.overall)) : 0)) bad(`${t} ${slot}: count/best do not match the file`);
}
/* a slot nobody starts at is short for every team (MR / CL are empty in the data) */
const empty = [...BAT_POSITIONS, ...PIT_ROLES].filter(s => !first.some(p => p.pos === s));
if (!empty.length) bad('expected at least one slot with no starter in the data (MR / CL)');
for (const s of empty) if (n.shortSlots[s] !== n.teams.length) bad(`${s} has no starter but is short for ${n.shortSlots[s]} of ${n.teams.length} teams`);
/* a synthetic league with one position missing on one team shows that team as short */
{
  const fake = { a1: { team: 'a', tier: 1, role: 'B', pos: 'C', overall: 70, abilities: { con: 60, pow: 60, eye: 60, spd: 60, arm: 60 } }, b1: { team: 'b', tier: 1, role: 'B', pos: 'SS', overall: 70, abilities: { con: 60, pow: 60, eye: 60, spd: 60, arm: 60 } } };
  const f = needsOf(fake);
  if (f.shortSlots.C !== 1 || f.shortSlots.SS !== 1) bad('a position missing on one of two teams must count that team as short');
  if (!slotLine(f, 'C').includes('1 隊')) bad('slotLine must name the number of short teams');
}
/* abilities: median from the data, gap = median - average, short = teams with gap > 0 */
for (const [group, keys] of [[false, BAT_KEYS], [true, PIT_KEYS]]) for (const k of keys) {
  const vals = first.filter(p => (p.role === 'P') === group).map(p => p.abilities[k]).sort((a, b) => a - b), m = vals.length >> 1;
  const med = vals.length % 2 ? vals[m] : (vals[m - 1] + vals[m]) / 2, a = n.abilities[k];
  if (a.median !== med) bad(`${k}: median ${a.median}, data says ${med}`);
  let short = 0;
  for (const t of n.teams) {
    const mine = first.filter(p => p.team === t && (p.role === 'P') === group).map(p => p.abilities[k]), avg = mine.reduce((x, y) => x + y, 0) / mine.length;
    if (Math.abs(a.teams[t].avg - avg) > 1e-9 || Math.abs(a.teams[t].gap - (med - avg)) > 1e-9) bad(`${k} ${t}: avg/gap do not match the file`);
    if (med - avg > 0) short++;
  }
  if (a.short !== short) bad(`${k}: short ${a.short}, expected ${short}`);
  const tag = abilityTag(n, k);
  if ((short >= TAG_MIN_TEAMS) !== !!tag) bad(`${k}: tag ${JSON.stringify(tag)} with ${short} short teams (needs ${TAG_MIN_TEAMS})`);
}
if (!RBI_NOTE.includes('打點') || !RBI_NOTE.includes('長打') || !RBI_NOTE.includes('安打')) bad('RBI note must map 打點 to 長打 + 安打');
/* the comparison reads his overall through the rating scale */
const b = first.find(p => p.role === 'B' && p.pos === 'SS' && p.abilities.arm !== undefined);
if (b) {
  const pts = { con: b.abilities.con, pow: b.abilities.pow, eye: b.abilities.eye, spd: b.abilities.spd, arm: b.abilities.arm };
  if (overallOfPoints('bat', pts) !== b.overall) bad(`a batter at the file's own abilities must read his own overall (${overallOfPoints('bat', pts)} vs ${b.overall})`);
  const w = weakestStarter(players, 'SS');
  if (!w || first.some(p => p.pos === 'SS' && p.overall < w.overall)) bad('weakestStarter must be the lowest overall at the position');
  const line = compareLine(players, { kind: 'bat', pos: 'SS', points: pts });
  if (!line.includes(w.name) || !line.includes(String(w.overall))) bad(`compare line must name the weakest starter: ${line}`);
}
if (!compareLine(players, { kind: 'pit', role: 'CL', points: { stuff: 50, ctrl: 50, arm: 50 } }).includes('沒有人')) bad('a role with no starter must say so');
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log(`needs.check: ok (${n.teams.length} teams, ${first.length} starters, empty slots: ${empty.join(' ')})`);
