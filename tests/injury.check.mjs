/* Short injuries (#379 part 10). Runs simGame over GAMES seeds with opts.injury on; fails when
 *   - INJURY_ON is not off by default, INJURY_P / INJURY_HBP_P are not chances in (0, 1), or INJURY_DAYS is not whole days 1 <= min <= max,
 *   - a game with injuries off returns `injuries`,
 *   - switching injuries on changes the game (stream, final score, box lines): the draws come after the last out from their own RNG,
 *   - an injury names a player who did not appear for that team (batting row or a pitcher who faced a batter), a player twice,
 *     or days outside INJURY_DAYS (whole numbers),
 *   - `hbp` on an injury is not the number of times the stream shows that batter hit by a pitch,
 *   - over GAMES games the rate per appearance is far from INJURY_P (outside 0.5x..2x), or hit batters are not hurt more often,
 *   - the same seed gives two different injury lists (rule 11).
 * static.mjs runs this file. Usage: node tests/injury.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 1500;
const errs = [], bad = m => { if (errs.length < 20) errs.push(m); };
const prob = x => x > 0 && x < 1;

if (K.INJURY_ON !== false) bad('INJURY_ON must be false by default');
if (!prob(K.INJURY_P) || !prob(K.INJURY_HBP_P)) bad('INJURY_P / INJURY_HBP_P out of (0, 1)');
const [dMin, dMax] = K.INJURY_DAYS;
if (!(Number.isInteger(dMin) && Number.isInteger(dMax) && dMin >= 1 && dMin <= dMax)) bad(`INJURY_DAYS ${K.INJURY_DAYS}`);

let apps = 0, hurt = 0, hbpApps = 0, hbpHurt = 0;
for (let s = 1; s <= GAMES; s++) {
  const off = K.simGame(s), on = K.simGame(s, null, { injury: true });
  if ('injuries' in off) bad(`seed ${s}: injuries returned with injuries off`);
  if (s <= 300 && (JSON.stringify(off.stream) !== JSON.stringify(on.stream) || JSON.stringify(off.stats) !== JSON.stringify(on.stats)
    || JSON.stringify(off.pst) !== JSON.stringify(on.pst))) bad(`seed ${s}: injuries on changes the game`);
  if (s <= 300 && JSON.stringify(on.injuries) !== JSON.stringify(K.simGame(s, null, { injury: true }).injuries)) bad(`seed ${s}: not deterministic`);
  if (!Array.isArray(on.injuries)) { bad(`seed ${s}: injuries is not a list`); continue; }
  /* who appeared, and how often each batter was hit, read from the result and the stream */
  const appeared = [0, 1].map(k => new Set([...on.batters[k], ...on.staff[k].filter((_, i) => on.pst[k][i].bf > 0).map(p => p.name)]));
  const hbp = [new Map(), new Map()];
  for (const e of on.stream) if (e.type === 'pa_end' && e.result === 'hit_by_pitch') {
    const k = e.team ?? null, name = e.batter;   /* pa_end team = the batting side (0 away, 1 home) */
    if (k === null || !name) continue;
    hbp[k].set(name, (hbp[k].get(name) || 0) + 1);
  }
  const seen = new Set();
  for (const inj of on.injuries) {
    const k = on.teams.indexOf(inj.team);
    if (k < 0 || !appeared[k].has(inj.name)) bad(`seed ${s}: ${inj.name} (team ${inj.team}) did not appear`);
    if (seen.has(`${inj.team}:${inj.name}`)) bad(`seed ${s}: ${inj.name} injured twice`);
    seen.add(`${inj.team}:${inj.name}`);
    if (!(Number.isInteger(inj.days) && inj.days >= dMin && inj.days <= dMax)) bad(`seed ${s}: ${inj.name} days ${inj.days}`);
    if (k >= 0 && (inj.hbp || 0) !== (hbp[k].get(inj.name) || 0)) bad(`seed ${s}: ${inj.name} hbp ${inj.hbp}, stream ${hbp[k].get(inj.name) || 0}`);
  }
  for (const k of [0, 1]) for (const n of appeared[k]) {
    const h = hbp[k].get(n) || 0, got = seen.has(`${on.teams[k]}:${n}`) ? 1 : 0;
    if (h) { hbpApps++; hbpHurt += got; } else { apps++; hurt += got; }
  }
}
const rate = hurt / apps, hbpRate = hbpHurt / Math.max(1, hbpApps);
if (!(rate > K.INJURY_P * 0.5 && rate < K.INJURY_P * 2)) bad(`injury rate ${rate.toFixed(4)} per appearance, INJURY_P ${K.INJURY_P}`);
if (!(hbpApps > 0 && hbpRate > rate)) bad(`hit batters hurt at ${hbpRate.toFixed(4)}, others ${rate.toFixed(4)}`);

if (errs.length) { console.error('injury.check: FAIL\n  ' + errs.join('\n  ')); process.exit(1); }
console.log(`injury.check: ok (${GAMES} games, ${(rate * 1000).toFixed(1)} per 1000 appearances, hit batters ${(hbpRate * 1000).toFixed(1)}, ${hbpApps} hit-batter appearances)`);
