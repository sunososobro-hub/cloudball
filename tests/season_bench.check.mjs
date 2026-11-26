/* Bench season lines in the season simulator (engine/sim/season.js, #436 part 6). Fails when
 *   - a plate appearance, hit or run batted in of a game is lost from the season lines (lineup + bench),
 *   - no bench man gets a game or a plate appearance over a season (pinch hit / run are on since 0.4.15),
 *   - a bench line counts a game without the bench man being named in that game's batters,
 *   - the same season differs between two runs.
 * Usage: node tests/season_bench.check.mjs */
import assert from 'node:assert/strict';
import { ROSTERS } from '../league/players.js';
import { emptyStats, playGame, runSeason } from '../engine/sim/season.js';

const rosters = JSON.parse(JSON.stringify(ROSTERS));
assert.ok(rosters.every(r => (r.bench || []).length > 0), 'every team has a bench');

/* one night: the season lines of both teams equal the box score rows of the game, bench rows included */
let checked = 0;
for (let night = 0; night < 40; night++) {
  const S = emptyStats(rosters), starts = [0, 0, 0, 0];
  const { g } = playGame(1, night, 0, 0, 1, rosters, starts, S);
  [0, 1].forEach((ti, k) => {
    for (const f of ['ab', 'h', 'hr', 'rbi', 'bb', 'k']) {
      const game = g.stats[k].reduce((a, b) => a + b[f], 0);
      const season = [...S[ti].bat, ...S[ti].bench].reduce((a, b) => a + b[f], 0);
      assert.equal(season, game, `night ${night} team ${ti}: ${f} kept`);
    }
    const named = new Set(g.batters[k].slice(rosters[ti].bat.length));
    rosters[ti].bench.forEach((p, i) => assert.equal(S[ti].bench[i].g, named.has(p.name) ? 1 : 0, `bench ${p.name} game count`));
    checked += named.size;
  });
}
assert.ok(checked > 0, 'some game in 40 nights uses a bench man');

const season = () => runSeason(1, rosters);
const a = season(), bench = a.S.flatMap(t => t.bench);
assert.ok(bench.some(b => b.g > 0), 'a bench man appears in a season');
assert.ok(bench.some(b => b.pa > 0), 'a bench man bats in a season');
assert.equal(JSON.stringify(season().S), JSON.stringify(a.S), 'same seed, same season lines');
console.log(`season_bench.check ok (${checked} bench appearances in 40 nights, ${bench.reduce((x, b) => x + b.pa, 0)} bench PA in a season)`);
