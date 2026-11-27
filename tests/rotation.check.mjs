/* Rotation check (#599 part 2, plain Node). Fails when
 *   - a hand-made rotation picks a pitcher on fewer than MIN_REST_DAYS, skips the most rested arm, or accepts a roster
 *     with fewer than ROTATION_SIZE starters or two starts of one team on one day,
 *   - over SEASONS seeded seasons (schedule of league/season.js, every game really played by the engine with the picked
 *     starters as opts.starters) a pitcher starts on short rest, a team does not use its whole rotation, a team plays
 *     twice in a night, the engine's game_start names a different starter than the one picked, or the same seed gives
 *     a different season.
 * Usage: node tests/rotation.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = await import(pathToFileURL(path.join(ROOT, 'league/season.js')));
const { simGame, TEAMS, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const problems = [], bad = s => problems.push(s), eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) bad(`${m}: got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`); };
const SEASONS = 20;

eq([S.ROTATION_SIZE, S.MIN_REST_DAYS], [5, 4], 'constants (MLB five-man rotation on four days of rest)');

/* hand-made: a roster with a reliever listed between the starters; rotation = the SP indices in order */
const pit = ['SP', 'SP', 'RP', 'SP', 'SP', 'SP', 'RP'].map((role, i) => ({ name: `p${i}`, role }));
eq(S.rotationOf(pit), [0, 1, 3, 4, 5], 'rotationOf skips relievers');
try { S.rotationOf(pit.slice(0, 5)); bad('a staff of 4 starters accepted'); } catch {}
const r = S.newRotation(['X']);
const picks = [];
for (let day = 0; day < 6; day++) { const i = S.pickStarter(r, 'X', pit, day); picks.push(i); S.recordStart(r, 'X', i, day); }
eq(picks, [0, 1, 3, 4, 5, 0], 'six days in a row: through the rotation, then the ace on four days of rest');
eq(S.restDays(r, 'X', 0, 9), 3, 'rest after a start on day 5');
eq(S.restDays(r, 'X', 1, 9) >= S.MIN_REST_DAYS, true, 'p1 rested on day 9');
try { S.recordStart(r, 'X', 1, 5); bad('two starts on one day accepted'); } catch {}
/* an off day: day 6 nobody pitches; day 7 the most rested is p1 (5 days), not p3 (4) */
eq(S.pickStarter(r, 'X', pit, 7), 1, 'most rested first');
/* only a starter on short rest left: throws instead of starting him */
const tight = S.newRotation(['Y']);
[0, 1, 3, 4, 5].forEach((i, d) => S.recordStart(tight, 'Y', i, d + 10));
try { S.pickStarter(tight, 'Y', pit, 14); bad('a starter on 0..3 days of rest was picked'); } catch {}

/* seeded seasons, every game played by the engine */
const ids = TEAMS.map(t => t.id), ix = Object.fromEntries(ids.map((id, i) => [id, i]));
function season(seed) {
  const sch = S.makeSchedule(ids), rot = S.newRotation(ids), log = [];
  sch.forEach((night, day) => {
    const seen = night.flatMap(g => [g.home, g.away]);
    if (new Set(seen).size !== seen.length) bad(`seed ${seed} night ${day}: a team plays twice`);
    night.forEach((g, slot) => {
      const sp = [g.away, g.home].map(id => S.pickStarter(rot, id, ROSTERS[ix[id]].pit, day));
      [g.away, g.home].forEach((id, k) => {
        if (S.restDays(rot, id, sp[k], day) < S.MIN_REST_DAYS) bad(`seed ${seed} day ${day}: ${id} starter ${sp[k]} on short rest`);
        S.recordStart(rot, id, sp[k], day);
      });
      const game = simGame((seed * 1000 + day * 10 + slot) >>> 0, {}, { teams: [ix[g.away], ix[g.home]], starters: sp });
      const start = game.stream.find(e => e.type === 'game_start');
      eq(start.starters, sp.map((s, k) => ROSTERS[ix[[g.away, g.home][k]]].pit[s].name), `seed ${seed} day ${day}: engine starters`);
      log.push([g.away, g.home, sp, game.final.sc]);
    });
  });
  return { rot, log };
}
for (let seed = 1; seed <= SEASONS; seed++) {
  const { rot, log } = season(seed);
  for (const id of ids) {
    const used = Object.keys(rot.last[id]).map(Number).sort((a, b) => a - b);
    eq(used, S.rotationOf(ROSTERS[ix[id]].pit), `seed ${seed}: ${id} uses its whole rotation`);
  }
  if (seed === 1) eq(season(1).log, log, 'same seed, same season');
}

console.log(`rotation: hand-made staff + ${SEASONS} seeded seasons played by the engine (${SEASONS * 12} games)`);
if (problems.length) { console.error(`FAILED: ${problems.length} rotation problem(s)`); for (const p of problems.slice(0, 20)) console.error('  ' + p); process.exit(1); }
console.log('OK: every start on at least four days of rest, every team uses its five starters.');
