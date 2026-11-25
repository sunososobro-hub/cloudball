/* Training model of created players (league/training.js, #369) and its simulation (league/tools/train_sim.mjs). Fails when
 *   - a legal split is refused, or a split off the rules (sum, keys, whole numbers, range) is accepted,
 *   - a created player does not carry his split (or the even one when none was chosen),
 *   - a day gains more than DAILY_CAP, an ability passes the potential stop, an ability above potential drops,
 *     an ability with 0 % grows, or a player at an age of AGE_CURVE's last point grows,
 *   - the same seed does not give the same days (determinism), or a bonus makes a player slower,
 *   - the sim targets are not the nearest-rank median and bottom quartile of the 一軍 in league/site/players.json,
 *   - league/training.js uses Math.random or Date.
 * static.mjs runs this file.
 * Usage: node tests/training.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { CREATE, validateCreate, makePlayer } from '../league/freeagents.js';
import { validateSplit, evenSplit, trainDay, ageFactor, overallOf, DAILY_CAP, POT_STOPS_AT, AGE_CURVE, DAYS_PER_SEASON, ACTIVE_BONUS, SPLIT_TOTAL } from '../league/training.js';
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
const split = { con: 0, pow: 60, eye: 40, spd: 0, arm: 0 };
if (validateCreate({ ...BAT, train: split }).length) bad('choice with a legal split refused');
if (!validateCreate({ ...BAT, train: { con: 100 } }).length) bad('choice with a bad split accepted');
if (JSON.stringify(makePlayer(9, { ...BAT, train: split }).player.train) !== JSON.stringify(split)) bad('created player does not carry his split');
if (JSON.stringify(makePlayer(9, BAT).player.train) !== JSON.stringify(evenSplit(kb)) || validateSplit(kb, evenSplit(kb)).length) bad('created player without a split does not carry the even one');

/* daily cap, potential stop, no drop, 0 % does not grow, age */
const last = AGE_CURVE[AGE_CURVE.length - 1];
if (ageFactor(last[0]) !== 0 || ageFactor(AGE_CURVE[0][0]) !== AGE_CURVE[0][1]) bad('ageFactor does not follow AGE_CURVE ends');
for (let a = AGE_CURVE[0][0]; a < last[0]; a++) if (ageFactor(a + 1) > ageFactor(a) + EPS) bad(`ageFactor grows with age at ${a}`);
const r = rng(7);
for (let i = 0; i < 40; i++) {
  const pot = 40 + i, s = { pit: false, age0: 20 + (i % 5), day: 0, pot, split: { con: 50, pow: 30, eye: 20, spd: 0, arm: 0 }, abil: { con: 60, pow: 45, eye: 70, spd: 50, arm: 50 } };
  const before = { ...s.abil };
  for (let d = 0; d < DAYS; d++) {
    const prev = { ...s.abil }, g = trainDay(s, r, i % 2 ? ACTIVE_BONUS * 4 : 0);
    if (g > DAILY_CAP + EPS) bad(`day gain ${g} over DAILY_CAP`);
    for (const k of kb) {
      if (s.abil[k] < prev[k] - EPS) bad(`${k} dropped`);
      if (s.abil[k] > Math.max(before[k], pot * POT_STOPS_AT) + EPS) bad(`${k} passed the potential stop (${s.abil[k]} > ${pot})`);
    }
  }
  if (s.abil.spd !== before.spd || s.abil.arm !== before.arm) bad('an ability with 0 % grew');
  if (s.day !== DAYS) bad('day counter wrong');
}
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

const src = readFileSync(path.join(ROOT, 'league/training.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) bad('league/training.js uses Math.random or Date');

console.log(`training: splits, cap, potential stop, age curve, determinism; 一軍 targets ${t.median}/${t.bottom}`);
if (problems.length) { console.error(`training.check FAILED: ${problems.length} problem(s)`); for (const p of problems.slice(0, 30)) console.error('  ' + p); process.exit(1); }
console.log('training.check OK');
