/* Extra bases taken (#794 part 3): on an outfield single the runner from first goes to third and the runner from second
 * scores, and on a double the runner from first scores, more often when he is fast (`spd`) and less often when the
 * outfielder who fields it has a strong `arm` (engine/constants.js XB_*; engine/sim/game.js xbP). This is the payoff a fan
 * sees for spending points on spd (running) and on a batter's arm (holding runners). Fails when
 *   - over GAMES games, an all-fast offence (spd 1.3) does not take the extra base at least SPD_RATIO times as often as
 *     an all-slow one (spd 0.7), or a strong-armed outfield (arm ARM_MIN + ARM_SPAN) does not cut it to at most
 *     1 / ARM_RATIO of a weak-armed one (arm ARM_MIN),
 *   - the same seed and rosters give two different games (rule 11).
 * static.mjs runs this file. Usage: node tests/xbt.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS, ARM_MIN, ARM_SPAN, OUTFIELD_KEYS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const GAMES = 300, SPD_RATIO = 1.5, ARM_RATIO = 1.25, HOME = 4;
const withBat = o => ROSTERS.map(t => ({ ...t, bat: t.bat.map(b => ({ ...b, ...o })) }));
const play = (s, rosters) => simGame(s, {}, { teams: [s % 4, (s + 1) % 4], rosters });
/* chances and extra bases: runner from 1st on an outfield single (3rd = extra), from 2nd on one (home), from 1st on a double (home);
 * bobbles and wild throws give everyone a base and are left out */
const xbt = rosters => {
  let n = 0, x = 0;
  for (let s = 1; s <= GAMES; s++) for (const e of play(s, rosters).ev) {
    const p = e.play; if (!p || !e.moves || p.errAdvance || p.wildThrow || p.groundRule || !OUTFIELD_KEYS.includes(p.fielder)) continue;
    for (const [from, to] of e.moves) {
      if (p.res === '1B' && from === 1) { n++; if (to >= 3) x++; }
      else if (p.res === '1B' && from === 2) { n++; if (to === HOME) x++; }
      else if (p.res === '2B' && from === 1) { n++; if (to === HOME) x++; }
    }
  }
  return { n, x, r: x / Math.max(1, n) };
};
const problems = [];
const fast = xbt(withBat({ spd: 1.3, arm: 1 })), slow = xbt(withBat({ spd: 0.7, arm: 1 }));
const strong = xbt(withBat({ spd: 1, arm: ARM_MIN + ARM_SPAN })), weak = xbt(withBat({ spd: 1, arm: ARM_MIN }));
if (!(fast.r >= SPD_RATIO * slow.r)) problems.push(`fast runners take ${fast.r.toFixed(3)}, slow ${slow.r.toFixed(3)}: spd does not reach the extra base`);
if (!(weak.r >= ARM_RATIO * strong.r)) problems.push(`against weak arms ${weak.r.toFixed(3)}, strong ${strong.r.toFixed(3)}: the outfielder's arm does not hold runners`);
const R = withBat({ spd: 1.2, arm: 1.1 });
for (let s = 1; s <= 10; s++) if (JSON.stringify(play(s, R).stream) !== JSON.stringify(play(s, R).stream)) problems.push(`seed ${s}: same seed and rosters, two games`);
const f = o => `${o.r.toFixed(3)} (${o.x}/${o.n})`;
console.log(`xbt: ${GAMES} games each, extra base taken: spd 1.3 ${f(fast)}, spd 0.7 ${f(slow)}; arm ${ARM_MIN + ARM_SPAN} ${f(strong)}, arm ${ARM_MIN} ${f(weak)}`);
if (problems.length) { for (const p of problems) console.error(`FAIL ${p}`); process.exit(1); }
console.log('xbt check: OK');
