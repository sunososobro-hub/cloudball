/* Infield hits pay off speed (#815 part 2): the slow rollers of #815 part 1 race the batter to first at his own pace
 * (engine/rules/field.js runPace of his `spd`, #794), so a fast batter beats more of them out. This is the engine half of
 * "a speed build hits for a higher average". Fails when
 *   - over GAMES games, an all-fast offence (spd 1.3) does not get at least SPD_RATIO times as many infield singles per
 *     plate appearance as an all-slow one (spd 0.7), or not more than an average one (spd 1.0),
 *   - the same seed and rosters give two different games (rule 11).
 * static.mjs runs this file. Usage: node tests/ifh_spd.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300, SPD_RATIO = 1.5;
const withSpd = spd => ROSTERS.map(t => ({ ...t, bat: t.bat.map(b => ({ ...b, spd })) }));
const play = (s, rosters) => simGame(s, {}, { teams: [s % 4, (s + 1) % 4], rosters });
const ifh = rosters => {
  let pa = 0, n = 0;
  for (let s = 1; s <= GAMES; s++) for (const e of play(s, rosters).stream) {
    if (e.type !== 'pa_end') continue;
    pa++; if (e.result === 'infield_single') n++;
  }
  return { pa, n, r: n / Math.max(1, pa) };
};
const problems = [];
const fast = ifh(withSpd(1.3)), mid = ifh(withSpd(1)), slow = ifh(withSpd(0.7));
if (!(fast.r >= SPD_RATIO * slow.r)) problems.push(`infield singles per PA: spd 1.3 ${fast.r.toFixed(4)}, spd 0.7 ${slow.r.toFixed(4)}: speed does not beat out rollers`);
if (!(fast.r > mid.r)) problems.push(`infield singles per PA: spd 1.3 ${fast.r.toFixed(4)} is not above spd 1.0 ${mid.r.toFixed(4)}`);
const R = withSpd(1.2);
for (let s = 1; s <= 10; s++) if (JSON.stringify(play(s, R).stream) !== JSON.stringify(play(s, R).stream)) problems.push(`seed ${s}: same seed and rosters, two games`);
const f = o => `${o.r.toFixed(4)} (${o.n}/${o.pa})`;
console.log(`ifh_spd: ${GAMES} games each, infield singles per PA: spd 1.3 ${f(fast)}, spd 1.0 ${f(mid)}, spd 0.7 ${f(slow)}`);
if (problems.length) { for (const p of problems) console.error('FAIL ' + p); process.exit(1); }
console.log('ifh_spd: ok');
