/* Full 二軍 rosters and the site -> engine converter (#748 part 1). Fails when
 *   - fullSecond is not a full roster per team (one batter per position of CREATE.positions, ROTATION_SIZE SP, SECOND_BULLPEN relievers),
 *     reuses a name in the league, or two calls differ (same seed = same bytes);
 *   - the converter does not give every factory 一軍 player back with his own name, number, age, position / role and hand,
 *     or a converted player does not rate exactly like his site row (each display number unchanged, overall within 2);
 *   - a converted 二軍 lineup has no 9 distinct positions, or a game played with converted rosters (both tiers) names a player of another team / tier;
 *   - the same game on the same converted rosters is not byte for byte the same.
 * Usage: node tests/second_full.check.mjs */
import { ROSTERS } from '../league/players.js';
import { TEAMS } from '../league/teams.js';
import { ratingsOf } from '../league/ratings.js';
import { CREATE } from '../league/freeagents.js';
import { buildSite, fullSecond, fillSecond, SECOND_BULLPEN } from '../league/tools/site.mjs';
import { siteRoster } from '../league/site_roster.js';
import { simGame, boxFromStream } from '../engine/index.js';
import { ROTATION_SIZE } from '../engine/constants.js';

const OVR_SLACK = 2;
const problems = [], bad = m => problems.push(m);
const second = fullSecond(), again = fullSecond();
if (JSON.stringify(second) !== JSON.stringify(again)) bad('fullSecond: two calls differ');
const names = new Set(ROSTERS.flatMap(r => [...r.bat, ...r.pit].map(p => p.name))), ids = new Set();
for (const t of TEAMS) {
  const list = second[t.id] || [], bat = list.filter(p => !p.role), pit = list.filter(p => p.role);
  if (bat.map(p => p.pos).sort().join() !== [...CREATE.positions].sort().join()) bad(`${t.id}: batters are not one per position (${bat.map(p => p.pos)})`);
  if (pit.filter(p => p.role === 'SP').length !== ROTATION_SIZE) bad(`${t.id}: not ${ROTATION_SIZE} starters`);
  if (pit.filter(p => p.role !== 'SP').length !== SECOND_BULLPEN) bad(`${t.id}: bullpen is not ${SECOND_BULLPEN}`);
  for (const p of list) {
    if (p.system !== true) bad(`${p.id}: no system flag`);
    if (names.has(p.name)) bad(`${p.id}: name ${p.name} is used twice in the league`);
    if (ids.has(p.id)) bad(`${p.id}: id used twice`);
    names.add(p.name); ids.add(p.id);
  }
}

const site = buildSite({ second }), rows = site.players;
for (const [i, t] of ROSTERS.entries()) {
  const tid = TEAMS[i].id, back = siteRoster(rows, tid, 1);
  for (const [side, want] of [['bat', t.bat], ['pit', t.pit]]) {
    if (back[side].length !== want.length) { bad(`${tid} 一軍 ${side}: ${back[side].length} back, ${want.length} expected`); continue; }
    for (const w of want) {
      const g = back[side].find(p => p.id === w.id);
      if (!g) { bad(`${tid}: ${w.id} did not come back`); continue; }
      for (const k of ['name', 'num', 'age', 'pos', 'role', 'hand', 'throws']) if (g[k] !== w[k]) bad(`${w.id}: ${k} ${g[k]} != ${w[k]}`);
      const a = ratingsOf(g), b = ratingsOf(w), { ovr: oa, ...ka } = a, { ovr: ob, ...kb } = b;   /* each display number is exact; the overall is a sum of raw values snapped one by one, so it may move by OVR_SLACK */
      if (JSON.stringify(ka) !== JSON.stringify(kb) || Math.abs(oa - ob) > OVR_SLACK) bad(`${w.id}: rates ${JSON.stringify(a)}, factory ${JSON.stringify(b)}`);
    }
  }
  const farm = siteRoster(rows, tid, 2);
  if (new Set(farm.bat.map(p => p.pos)).size !== 9) bad(`${tid} 二軍 lineup has ${new Set(farm.bat.map(p => p.pos)).size} positions, expected 9`);
  if (farm.pit.slice(0, ROTATION_SIZE).some(p => p.role !== 'SP')) bad(`${tid} 二軍: the first ${ROTATION_SIZE} pitchers are not all starters`);
}

{   /* fillSecond (part 2): tops a lopsided 二軍 up, adds only, same input = same bytes, a full 二軍 comes back unchanged */
  const lop = JSON.parse(JSON.stringify(rows)), mine = Object.entries(lop).filter(([, p]) => p.team === TEAMS[0].id && p.tier === 2);
  for (const [id, p] of mine) if ((p.role === 'B' && p.pos !== 'C') || (p.role === 'P' && p.pos !== 'SP')) delete lop[id];   /* leaves a catcher and starters only */
  const f = fillSecond(lop), g = fillSecond(lop);
  if (JSON.stringify(f) !== JSON.stringify(g)) bad('fillSecond: two calls differ');
  if (JSON.stringify(fillSecond(f)) !== JSON.stringify(f)) bad('fillSecond: a full 二軍 changed');
  if (JSON.stringify(fillSecond(rows)) !== JSON.stringify(rows)) bad('fillSecond: the full factory 二軍 changed');
  for (const [id, p] of Object.entries(lop)) if (JSON.stringify(f[id]) !== JSON.stringify(p)) bad(`fillSecond: ${id} was changed`);
  const farm = siteRoster(f, TEAMS[0].id, 2);
  if (new Set(farm.bat.map(p => p.pos)).size !== 9 || farm.pit.filter(p => p.role === 'SP').length < ROTATION_SIZE || farm.pit.filter(p => p.role !== 'SP').length < SECOND_BULLPEN) bad('fillSecond: the topped-up 二軍 is not a full roster');
  const named = Object.values(f).map(p => p.name);
  if (new Set(named).size !== named.length) bad('fillSecond: a name is used twice');
  const crowd = JSON.parse(JSON.stringify(rows)), extra = Object.entries(crowd).find(([, p]) => p.team === TEAMS[0].id && p.tier === 2 && p.role === 'B');
  crowd['x-dup'] = { ...extra[1], name: 'Crowd Extra', overall: 99 };   /* a tenth batter at an owned position: the lineup keeps 9 distinct positions */
  if (new Set(siteRoster(crowd, TEAMS[0].id, 2).bat.map(p => p.pos)).size !== 9) bad('lineup: a surplus batter pushed a position out');
}

const tiers = tier => TEAMS.map(t => siteRoster(rows, t.id, tier)), play = (rs, seed) => simGame(seed, {}, { rosters: rs, teams: [0, 1] });
for (const tier of [1, 2]) {
  const rs = tiers(tier), g = play(rs, 748), h = play(rs, 748), own = new Set([...rs[0].bat, ...rs[0].pit, ...rs[1].bat, ...rs[1].pit].map(p => p.name));
  if (JSON.stringify(g.stream) !== JSON.stringify(h.stream)) bad(`tier ${tier}: same seed, different game`);
  const text = JSON.stringify(boxFromStream(g.stream));
  const other = new Set(tiers(tier === 1 ? 2 : 1).slice(0, 2).flatMap(r => [...r.bat, ...r.pit].map(p => p.name)));
  for (const n of other) if (text.includes(n) && !own.has(n)) bad(`tier ${tier}: box score names ${n} of the other tier`);
  if (!g.final || !Array.isArray(g.final.sc)) bad(`tier ${tier}: no final score`);
}

if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('second_full: ok');
