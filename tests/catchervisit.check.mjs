/* #614 part 11: the catcher's mound visit (plain Node). Over 1500 seeds:
 *   - every CVIS frame lasts CATCHER_VISIT_DUR, follows a pitch frame of the same half, has a runner on second or third, changes
 *     no state (s0 = s1) and carries exactly one `mound_visit` stream event of its frame with staff 'catcher', the fielding team,
 *     its catcher (the lineup's C) and `left` >= 0
 *   - coach (VIS) and catcher (CVIS) visits of a team never pass MOUND_VISIT_LIMIT, plus MOUND_VISIT_EXTRA per extra inning
 *   - deterministic: the same seed gives the same events (times left out); that outcomes do not move is pinned by deadball.check.mjs
 *   - the rate per team per game is printed and must stay in [0.3, 1.5] (estimate, see constants.js)
 * static.mjs runs this file. Usage: node tests/catchervisit.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
const E = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const { simGame } = E;
const SEEDS = 1500;
let cvis = 0, games = 0, capped = 0;
const outcome = g => g.stream.filter(x => x.type !== 'mound_visit').map(x => { const { t, i, f, ...rest } = x; return JSON.stringify(rest); }).join('\n');
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = simGame(seed, {}); games++;
  const used = [0, 0];
  g.ev.forEach((e, fi) => {
    if (e.k === 'VIS') used[e.def]++;
    if (e.k !== 'CVIS') return;
    cvis++; used[e.def]++;
    const p = g.ev[fi - 1], tag = `seed ${seed} CVIS at ${e.t}`;
    if (e.d !== K.CATCHER_VISIT_DUR) bad.push(`${tag}: d ${e.d}`);
    if (!p || p.k !== 'P' || p.s1.half !== e.s0.half) bad.push(`${tag}: not right after a pitch of the same half`);
    if (!(e.s0.b[1] || e.s0.b[2])) bad.push(`${tag}: nobody in scoring position`);
    if (JSON.stringify(e.s0) !== JSON.stringify(e.s1)) bad.push(`${tag}: state changed`);
    if (e.def !== 1 - e.s0.half) bad.push(`${tag}: def ${e.def} is not the fielding team`);
    const sv = g.stream.filter(x => x.type === 'mound_visit' && x.f === fi);
    if (sv.length !== 1 || sv[0].staff !== 'catcher' || sv[0].team !== e.def || !(sv[0].left >= 0)) { bad.push(`${tag}: ${sv.length} catcher mound_visit events`); return; }
    if (!sv[0].catcher) bad.push(`${tag}: no catcher name`);
    if (e.s0.inn <= K.REGULATION_INNINGS && sv[0].left !== K.MOUND_VISIT_LIMIT - used[e.def]) bad.push(`${tag}: left ${sv[0].left}, used ${used[e.def]}`);
  });
  const inn = Math.max(...g.ev.map(e => e.s0 ? e.s0.inn : 1));
  const cap = K.MOUND_VISIT_LIMIT + Math.max(0, inn - K.REGULATION_INNINGS) * K.MOUND_VISIT_EXTRA;
  for (const d of [0, 1]) { if (used[d] > cap) bad.push(`seed ${seed} team ${d}: ${used[d]} visits, cap ${cap}`); if (used[d] === K.MOUND_VISIT_LIMIT) capped++; }
  if (g.stream.filter(x => x.type === 'mound_visit').length !== g.ev.filter(e => e.k === 'VIS' || e.k === 'CVIS').length) bad.push(`seed ${seed}: mound_visit events and VIS + CVIS frames differ`);
  if (seed <= 300) {
    const h = simGame(seed, {});
    if (outcome(g) !== outcome(h)) bad.push(`seed ${seed}: not deterministic`);
  }
}
const rate = cvis / games / 2;
if (!cvis) bad.push('no CVIS frame: the check saw nothing');
if (rate < 0.3 || rate > 1.5) bad.push(`catcher visits ${rate.toFixed(3)} per team per game, want 0.3..1.5`);
if (bad.length) { console.error('FAIL catchervisit:\n - ' + bad.slice(0, 30).join('\n - ')); process.exit(1); }
console.log(`catchervisit ok: ${cvis} catcher visits in ${games} games (${rate.toFixed(3)} per team per game), ${capped} team-games at the cap of ${K.MOUND_VISIT_LIMIT}`);
