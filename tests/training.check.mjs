/* Training model of created players (league/training.js, #369) and its simulation (league/tools/train_sim.mjs). Fails when
 *   - a legal split is refused, or a split off the rules (sum, keys, whole numbers, range) is accepted,
 *   - a created player does not carry his split (or the default one when none was chosen: even for a batter, ROLE_SPLIT
 *     by pitcher role, #378), a ROLE_SPLIT entry is not a legal split, or the starter and the short relievers share a
 *     default (SP must lean less on stuff than RP and CL),
 *   - a day gains more than DAILY_CAP, the overall passes the potential, an ability passes ABIL_MAX or drops,
 *     an ability with 0 % grows, or a player at an age of AGE_CURVE's last point grows,
 *   - growth does not slow inside POT_SLOW_BAND below the potential, or a player below it with room stops (#374),
 *   - the potential draw misses the 一軍 of league/site/players.json: median under the 一軍 median, share above the
 *     一軍 p75 off a fifth (POT_FIFTH_TOL), star-line tail (>= RATING_TOP) outside 2 to 5 %, or potShareAtLeast()
 *     disagrees with makePlayer's draws,
 *   - the same seed does not give the same days (determinism), or a bonus makes a player slower,
 *   - the sim targets are not the nearest-rank median and bottom quartile of the 一軍 in league/site/players.json,
 *   - league/training.js uses Math.random or Date.
 * static.mjs runs this file.
 * Usage: node tests/training.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREATE, validateCreate, makePlayer, potShareAtLeast } from '../league/freeagents.js';
import { RATING_TOP } from '../league/ratings.js';
import { validateSplit, evenSplit, defaultSplit, ROLE_SPLIT, trainDay, ageFactor, overallOf, roomFactor, DAILY_CAP, ABIL_MAX, POT_SLOW_BAND, AGE_CURVE, DAYS_PER_SEASON, ACTIVE_BONUS, SPLIT_TOTAL } from '../league/training.js';
import { targets, daysTo, choiceOf } from '../league/tools/train_sim.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAYS = 400, EPS = 1e-9;
const problems = [], bad = m => problems.push(m);
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

/* split rules */
const kb = CREATE.keys.bat, kp = CREATE.keys.pit;
for (const [keys, s] of [[kb, { con: 40, pow: 40, eye: 20, spd: 0, arm: 0 }], [kp, { stuff: 100, ctrl: 0, arm: 0 }], [kb, evenSplit(kb)], [kp, evenSplit(kp)]])
  if (validateSplit(keys, s).length) bad(`legal split refused: ${JSON.stringify(s)}`);
for (const [what, keys, s] of [['sum 99', kp, { stuff: 50, ctrl: 49, arm: 0 }], ['sum 101', kp, { stuff: 50, ctrl: 51, arm: 0 }], ['missing key', kp, { stuff: 50, ctrl: 50 }],
  ['extra key', kp, { stuff: 50, ctrl: 50, arm: 0, pot: 0 }], ['fraction', kp, { stuff: 50.5, ctrl: 49.5, arm: 0 }], ['negative', kp, { stuff: 110, ctrl: -10, arm: 0 }], ['array', kp, [100, 0, 0]], ['null', kp, null]])
  if (!validateSplit(keys, s).length) bad(`split ${what}: accepted`);

/* the split goes through creation and is stored */
const look = { head: 0, skin: 0, hair: 0 };
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 } };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 66, ctrl: 62, arm: 55 } };
const split = { con: 0, pow: 60, eye: 40, spd: 0, arm: 0 };
if (validateCreate({ ...BAT, train: split }).length) bad('choice with a legal split refused');
if (!validateCreate({ ...BAT, train: { con: 100 } }).length) bad('choice with a bad split accepted');
if (JSON.stringify(makePlayer(9, { ...BAT, train: split }).player.train) !== JSON.stringify(split)) bad('created player does not carry his split');
if (JSON.stringify(makePlayer(9, BAT).player.train) !== JSON.stringify(evenSplit(kb)) || validateSplit(kb, evenSplit(kb)).length) bad('created player without a split does not carry the even one');
for (const role of CREATE.roles) {
  const want = defaultSplit('pit', role), got = makePlayer(9, { ...PIT, role }).player.train;
  if (JSON.stringify(got) !== JSON.stringify(want)) bad(`created ${role} without a split carries ${JSON.stringify(got)}, not ${JSON.stringify(want)}`);
  if (validateSplit(kp, want).length) bad(`default split of ${role} is not legal: ${validateSplit(kp, want).join('; ')}`);
}
for (const [role, sp] of Object.entries(ROLE_SPLIT)) if (!CREATE.roles.includes(role) || validateSplit(kp, sp).length) bad(`ROLE_SPLIT.${role}: not a creatable role or not a legal split`);
for (const role of ['RP', 'CL']) if (!(ROLE_SPLIT.SP.stuff < ROLE_SPLIT[role].stuff)) bad(`SP default leans on stuff as much as ${role}`);

/* daily cap, potential caps the overall, no drop, 0 % does not grow, age */
const last = AGE_CURVE[AGE_CURVE.length - 1];
if (ageFactor(last[0]) !== 0 || ageFactor(AGE_CURVE[0][0]) !== AGE_CURVE[0][1]) bad('ageFactor does not follow AGE_CURVE ends');
for (let a = AGE_CURVE[0][0]; a < last[0]; a++) if (ageFactor(a + 1) > ageFactor(a) + EPS) bad(`ageFactor grows with age at ${a}`);
const r = rng(7);
for (let i = 0; i < 40; i++) {
  const pot = 55 + i, s = { pit: false, age0: 20 + (i % 5), day: 0, pot, split: { con: 50, pow: 30, eye: 20, spd: 0, arm: 0 }, abil: { con: 60, pow: 45, eye: 70, spd: 50, arm: 50 } };
  const before = { ...s.abil };
  for (let d = 0; d < DAYS; d++) {
    const prev = { ...s.abil }, g = trainDay(s, r, i % 2 ? ACTIVE_BONUS * 4 : 0);
    if (g > DAILY_CAP + EPS) bad(`day gain ${g} over DAILY_CAP`);
    for (const k of kb) {
      if (s.abil[k] < prev[k] - EPS) bad(`${k} dropped`);
      if (s.abil[k] > Math.max(before[k], ABIL_MAX) + EPS) bad(`${k} passed ABIL_MAX (${s.abil[k]})`);
    }
    const ovr = overallOf(s);
    if (ovr > Math.max(pot, overallOf({ ...s, abil: before }))) bad(`overall ${ovr} passed the potential ${pot}`);
  }
  if (pot <= 70 && overallOf(s) < pot - 1) bad(`pot ${pot}: overall stuck at ${overallOf(s)} after ${DAYS} days`);
  if (s.abil.spd !== before.spd || s.abil.arm !== before.arm) bad('an ability with 0 % grew');
  if (s.day !== DAYS) bad('day counter wrong');
}
/* the ceiling is felt only near it: full speed outside the band, slower inside, zero at it */
if (roomFactor(50, 50 + POT_SLOW_BAND) !== 1 || roomFactor(60, 60) !== 0 || roomFactor(70, 69) !== 0) bad('roomFactor ends wrong');
for (let d = 1; d < POT_SLOW_BAND; d++) if (!(roomFactor(60 - d, 60) < roomFactor(60 - d - 1, 60))) bad(`roomFactor does not slow toward the potential at ${d}`);
{ const far = { pit: false, age0: 20, day: 0, pot: 90, split: evenSplit(kb), abil: { con: 50, pow: 50, eye: 50, spd: 50, arm: 50 } };
  const near = { ...far, pot: overallOf(far) + 1, abil: { ...far.abil } };
  if (!(trainDay(near, rng(3), 0) < trainDay(far, rng(3), 0))) bad('a player one point under his potential grows as fast as one far below'); }
const old = { pit: true, age0: last[0], day: 0, pot: 99, split: { stuff: 50, ctrl: 50, arm: 0 }, abil: { stuff: 50, ctrl: 50, arm: 50 } };
for (let d = 0; d < DAYS_PER_SEASON; d++) if (trainDay(old, r, 0) > 0) { bad(`a ${last[0]}-year-old grew hands-off`); break; }
if (overallOf({ pit: false, pot: 50, abil: { con: 61, pow: 61, eye: 61, spd: 61, arm: 61 } }) !== makePlayer(9, { ...BAT, points: { con: 61, pow: 61, eye: 61, spd: 61, arm: 61 } }).ratings.ovr) bad('overallOf disagrees with ratingsOf of a created player');

/* determinism and bonus */
const sr = rng(11);
for (let i = 0; i < 60; i++) {
  const made = makePlayer(1000 + i, choiceOf(i, sr)), goals = [62, 70];
  const a = daysTo(made, 0, i, goals, true), b = daysTo(made, 0, i, goals, true), c = daysTo(made, ACTIVE_BONUS, i, goals, true);
  if (JSON.stringify(a) !== JSON.stringify(b)) bad(`seed ${i}: not deterministic`);
  if (c.some((d, j) => d > a[j])) bad(`seed ${i}: the bonus made the player slower (${c} vs ${a})`);
}

/* targets from the site data */
const players = JSON.parse(readFileSync(path.join(ROOT, 'league/site/players.json'), 'utf8'));
const o = Object.values(players).filter(p => p.tier === 1).map(p => p.overall).sort((x, y) => x - y), t = targets(players);
if (t.median !== o[Math.ceil(o.length / 2) - 1] || t.bottom !== o[Math.ceil(o.length / 4) - 1]) bad(`sim targets ${t.median}/${t.bottom} are not the nearest-rank median and bottom quartile of the 一軍`);

/* potential draw against the 一軍 (#374): numbers from players.json, never typed in */
const POT_FIFTH = 0.2, POT_FIFTH_TOL = 0.03, STAR_TAIL = [0.02, 0.05], DRAWS = 20000;
const p75 = o[Math.ceil(o.length * 3 / 4) - 1];
const potMedian = (() => { let lo = 1; while (potShareAtLeast(lo + 1) >= 0.5) lo++; return lo; })();
if (potMedian < t.median) bad(`potential median ${potMedian} under the 一軍 median ${t.median}`);
if (Math.abs(potShareAtLeast(p75 + 1) - POT_FIFTH) > POT_FIFTH_TOL) bad(`share of potential above the 一軍 p75 ${p75} is ${potShareAtLeast(p75 + 1).toFixed(3)}, not about ${POT_FIFTH}`);
const tail = potShareAtLeast(RATING_TOP);
if (tail < STAR_TAIL[0] || tail > STAR_TAIL[1]) bad(`star tail (potential >= ${RATING_TOP}) is ${tail.toFixed(3)}, outside ${STAR_TAIL.join(' to ')}`);
{ const c = { ...BAT, points: { con: 61, pow: 61, eye: 61, spd: 61, arm: 61 } }; let hi = 0, star = 0;
  for (let i = 0; i < DRAWS; i++) { const pp = makePlayer(i, c).ratings.pot; if (pp > p75) hi++; if (pp >= RATING_TOP) star++; }
  for (const [what, got, want] of [['above p75', hi / DRAWS, potShareAtLeast(p75 + 1)], ['star tail', star / DRAWS, tail]])
    if (Math.abs(got - want) > 4 * Math.sqrt(want * (1 - want) / DRAWS)) bad(`drawn ${what} ${got.toFixed(3)} disagrees with potShareAtLeast ${want.toFixed(3)}`); }

const src = readFileSync(path.join(ROOT, 'league/training.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) bad('league/training.js uses Math.random or Date');

console.log(`training: splits, cap, potential caps the overall, age curve, determinism; 一軍 targets ${t.median}/${t.bottom}; potential median ${potMedian}, above p75 ${p75} ${(100 * potShareAtLeast(p75 + 1)).toFixed(1)} %, star tail ${(100 * tail).toFixed(1)} %`);
if (problems.length) { console.error(`training.check FAILED: ${problems.length} problem(s)`); for (const p of problems.slice(0, 30)) console.error('  ' + p); process.exit(1); }
console.log('training.check OK');
