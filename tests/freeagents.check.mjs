/* Created free agents (league/freeagents.js, #178). Fails when
 *   - BLOCKED is not exactly the free-agent name pool crossed with league/tools/blocklist.txt,
 *   - a valid choice is refused, or a choice off the rules (budget, floor, cap, position, hands, build, look,
 *     unknown or free-text fields) is accepted,
 *   - a created player does not read his own points back, or his overall is outside OVR_RANGE
 *     (over SAMPLES spreads of the budget, even and concentrated),
 *   - the same seed and choice do not give the same player byte for byte,
 *   - over NAME_DRAWS draws a name is a real athlete's, a league person's (players, staff, booth), or uses a given
 *     name common only for births after 2011,
 *   - a created batter and a created starter, put on a copy of a roster, do not play one legal game in the engine,
 *   - a pitcher role other than SP (MR, RP, CL, #378) is refused, or the engine does not treat MR and CL as bullpen
 *     arms exactly like RP (a roster whose relievers are relabelled MR / CL plays the same game byte for byte),
 *   - fielder defence (#378 part 6): a batter choice with points.def (budget + defBudget over six) is refused, one off
 *     its rules (on a pitcher, over the cap, the old budget) accepted; def does not read back its points, a display
 *     point does not go to raw def and back unchanged, the middle point is not the factory fielder (1.0), the ends
 *     are not the engine's DEF_MIN / DEF_MAX, a factory player shows a def, or a created def does not reach the game;
 *     positionFit gives the wrong word for a DH, a strong glove at SS or a floor glove at SS,
 *   - league/freeagents.js uses Math.random or Date, or touches ROSTERS.
 * static.mjs runs this file.
 * Usage: node tests/freeagents.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame } from '../engine/index.js';
import { ROSTERS } from '../league/players.js';
import { STAFF, UMPIRES } from '../league/staff.js';
import { SURNAMES, GIVEN } from '../league/namepool.js';
import { CREATE, BLOCKED, NAME_DECADE, drawName, validateCreate, makePlayer, pointKeys, budgetOf, positionFit, FIT_TEXT, presetBody, presetHt } from '../league/freeagents.js';
import { ratingsOf, defRaw, defRating, RATING_MID, RATING_MIN, RATING_MAX } from '../league/ratings.js';
import { DEF_MIN, DEF_MAX } from '../engine/constants.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OVR_RANGE = [50, 58], SAMPLES = 4000, NAME_DRAWS = 10000;
const TOO_YOUNG = ['承恩', '宥廷', '品睿', '恩碩', '子睿'];
const problems = [], bad = m => problems.push(m);
const before = JSON.stringify(ROSTERS);

/* blocklist mirror */
const blocked = new Set(readFileSync(path.join(ROOT, 'league/tools/blocklist.txt'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
const pool = Object.values(GIVEN[NAME_DECADE]).flatMap(s => s.split(' '));
const expect = SURNAMES.flatMap(([s]) => pool.map(g => s + g)).filter(n => blocked.has(n));
if (JSON.stringify([...expect].sort()) !== JSON.stringify([...BLOCKED].sort())) bad(`BLOCKED differs from the pool crossed with the blocklist: expected ${JSON.stringify(expect)}`);

/* rules */
const look = { head: 3, skin: 2, hair: 5 };
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 66, ctrl: 62, arm: 55 } };
/* #541: look is optional, key by key: nothing picked, or one chip picked, is legal and kept as is (the id fills the rest at draw time) */
{ const { look: _l, ...NOL } = BAT;
  for (const [what, c] of [['no look', NOL], ['empty look', { ...BAT, look: {} }], ['head only', { ...BAT, look: { head: 2 } }]]) { const w = validateCreate(c); if (w.length) bad(`${what}: refused: ${w.join('; ')}`); }
  if (JSON.stringify(makePlayer(5, NOL).player.look) !== '{}' || JSON.stringify(makePlayer(5, { ...BAT, look: { head: 2 } }).player.look) !== '{"head":2}') bad('makePlayer must keep exactly the picked look keys'); }
for (const c of [BAT, PIT]) { const w = validateCreate(c); if (w.length) bad(`valid ${c.kind} choice refused: ${w.join('; ')}`); }
const off = {
  'over budget': { ...BAT, points: { ...BAT.points, pow: 41 } },
  'under budget': { ...PIT, points: { ...PIT.points, arm: 54 } },
  'below floor': { ...BAT, points: { con: 70, pow: 39, eye: 66, spd: 70, arm: 60 } },
  'above cap': { ...PIT, points: { stuff: 67, ctrl: 61, arm: 55 } },
  'not whole': { ...PIT, points: { stuff: 65.5, ctrl: 62.5, arm: 55 } },
  'missing ability': { ...PIT, points: { stuff: 90, ctrl: 90 } },
  'potential chosen': { ...BAT, points: { ...BAT.points, pot: 99 } },
  'free-text name': { ...BAT, name: '王建民' },
  'bad position': { ...BAT, pos: 'P' },
  'bad role': { ...PIT, role: 'P' },
  'switch hitter': { ...BAT, bats: 'S' },
  'bad build': { ...BAT, build: 'giant' },
  'look not an object': { ...BAT, look: 3 },
  'look out of range': { ...BAT, look: { ...look, hair: 10 } },
  'look with text': { ...BAT, look: { ...look, hat: 'red' } },
  'bad nameDraw': { ...BAT, nameDraw: -1 },
  'no choice': null,
};
/* #442: body sliders + height instead of a build; one or the other */
const { build: _b, ...NOB } = BAT, SL = { ...NOB, body: { slim: 30, power: 40, heavy: 30 }, ht: 1.85 };
if (validateCreate(SL).length) bad(`valid body choice refused: ${validateCreate(SL).join('; ')}`);
for (const b of Object.keys(CREATE.builds)) { const w = validateCreate({ ...NOB, body: presetBody(b), ht: presetHt(b) }); if (w.length) bad(`preset ${b} as sliders refused: ${w.join('; ')}`); }
Object.assign(off, {
  'build and body': { ...SL, build: 'slim' },
  'body without ht': { ...NOB, body: SL.body },
  'ht without body': { ...NOB, ht: 1.8 },
  'mix over 100': { ...SL, body: { slim: 50, power: 40, heavy: 20 } },
  'negative weight': { ...SL, body: { slim: -1, power: 0, heavy: 0 } },
  'fractional percent': { ...SL, body: { slim: 10.5, power: 0, heavy: 0 } },
  'unknown body key': { ...SL, body: { slim: 0, power: 0, heavy: 0, fat: 1 } },
  'too short': { ...SL, ht: 1.71 }, 'too tall': { ...SL, ht: 1.93 }, 'ht not whole cm': { ...SL, ht: 1.855 }, 'ht text': { ...SL, ht: '1.85' },
});
for (const role of CREATE.roles) { const w = validateCreate({ ...PIT, role }); if (w.length) bad(`role ${role} refused: ${w.join('; ')}`); }
if (!['SP', 'MR', 'RP', 'CL'].every(x => CREATE.roles.includes(x))) bad(`CREATE.roles ${CREATE.roles.join(', ')} misses one of SP, MR, RP, CL`);
for (const [what, c] of Object.entries(off)) if (!validateCreate(c).length) bad(`${what}: accepted`);
try { makePlayer(1, off['over budget']); bad('makePlayer accepted an invalid choice'); } catch { /* expected */ }

/* the chosen body and height are stored as asked; two mixes give different render body data; nothing else about the player moves */
{
  const a = makePlayer(42, SL).player, b = makePlayer(42, { ...SL, body: { slim: 0, power: 0, heavy: 80 }, ht: 1.72 }).player;
  if (a.ht !== 1.85 || JSON.stringify(a.body) !== JSON.stringify({ slim: 0.3, power: 0.4, heavy: 0.3 })) bad(`body choice stored as ${JSON.stringify([a.body, a.ht])}`);
  if (JSON.stringify(a.body) === JSON.stringify(b.body) || a.ht === b.ht) bad('two different mixes give the same body data');
  const { body: _x, ht: _y, ...ra } = a, { body: _z, ht: _w, ...rb } = b;
  if (JSON.stringify(ra) !== JSON.stringify(rb)) bad('body or height changed something else about the player (potential, age, number, points)');
  if (JSON.stringify(makePlayer(42, SL).ratings) !== JSON.stringify(makePlayer(42, { ...SL, body: { slim: 0, power: 0, heavy: 80 } }).ratings)) bad('the body changed the ratings');
  const old = makePlayer(42, BAT).player, again = makePlayer(42, { ...BAT }).player;
  if (JSON.stringify(old) !== JSON.stringify(again) || !(old.ht >= CREATE.builds.slim.ht[0] && old.ht <= CREATE.builds.slim.ht[1])) bad('a build choice no longer draws as before');
}

/* points read back, overall range, determinism */
let s = 178; const r = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296;
const ovr = { bat: [100, 0], pit: [100, 0] };
for (let i = 0; i < SAMPLES; i++) {
  const base = i % 2 ? BAT : PIT, keys = CREATE.keys[base.kind], cap = CREATE.cap[base.kind];
  const pts = Object.fromEntries(keys.map(k => [k, CREATE.floor])); let left = CREATE.budget[base.kind] - CREATE.floor * keys.length;
  if (i % 4 < 2) for (const k of [...keys].sort(() => r() - 0.5)) { const a = Math.min(left, cap - CREATE.floor); pts[k] += a; left -= a; }
  else while (left > 0) { const k = keys[Math.floor(r() * keys.length)]; if (pts[k] < cap) { pts[k]++; left--; } }
  const c = { ...base, points: pts }, { player, ratings } = makePlayer(i * 7919, c);
  for (const k of keys) if (ratings[k] !== pts[k]) bad(`seed ${i * 7919}: ${k} chosen ${pts[k]}, reads ${ratings[k]}`);
  const o = ovr[base.kind]; o[0] = Math.min(o[0], ratings.ovr); o[1] = Math.max(o[1], ratings.ovr);
  if (i < 50 && JSON.stringify(makePlayer(i * 7919, c)) !== JSON.stringify({ player, ratings })) bad(`seed ${i * 7919}: not deterministic`);
}
for (const [k, [lo, hi]] of Object.entries(ovr)) if (lo < OVR_RANGE[0] || hi > OVR_RANGE[1]) bad(`${k}: created overall ${lo}..${hi}, outside ${OVR_RANGE.join('..')}`);

/* names */
const league = new Set([...ROSTERS.flatMap(t => [...t.bat, ...t.pit]), ...STAFF, ...UMPIRES].map(p => p.name));
const bank = JSON.parse(readFileSync(path.join(ROOT, 'commentary/lines.json'), 'utf8'));
for (const g of Object.values(bank.guests || {})) league.add(g.name);
for (const v of Object.values(JSON.parse(readFileSync(path.join(ROOT, 'commentary/voices.json'), 'utf8')).roles || {})) if (v.name) league.add(v.name);
const names = new Set();
for (let i = 0; i < NAME_DRAWS; i++) {
  const n = drawName(i * 2654435761 >>> 0, i % 7); names.add(n);
  if (blocked.has(n)) bad(`draw ${i}: ${n} is a real athlete`);
  if (league.has(n)) bad(`draw ${i}: ${n} is already a league person`);
  if (TOO_YOUNG.includes(n.slice(1))) bad(`draw ${i}: ${n} has a given name common only after 2011`);
}
if (drawName(5, 0) !== drawName(5, 0) || drawName(5, 0) === drawName(5, 1) && drawName(5, 1) === drawName(5, 2)) bad('drawName is not deterministic, or a redraw never changes the name');

/* one legal game with a created batter and a created starter on a copy of the pheasants */
const fb = makePlayer(1001, BAT).player, fp = makePlayer(1002, PIT).player;
const copy = JSON.parse(JSON.stringify(ROSTERS));
copy[0].bat[0] = { ...fb, pos: copy[0].bat[0].pos }; copy[0].pit[0] = fp;
try {
  const g = simGame(178, {}, { rosters: copy, starters: [0, 0] });
  const outs = g.stream.filter(e => e.type === 'out');
  if (!g.final || !outs.length || outs.some(e => !e.reason)) bad('game with created players: no final score, or an out without a reason');
  if (!g.stream.some(e => JSON.stringify(e).includes(fb.name))) bad(`created batter ${fb.name} never appears in the game`);
  if (!g.stream.some(e => JSON.stringify(e).includes(fp.name))) bad(`created starter ${fp.name} never appears in the game`);
} catch (e) { bad(`engine threw with created players: ${e.message}`); }

/* MR and CL pitch out of the bullpen exactly like RP: relabel every reliever, the games stay the same */
const relabel = JSON.parse(JSON.stringify(ROSTERS));
for (const t of relabel) { let n = 0; for (const p of t.pit) if (p.role === 'RP') p.role = n++ % 2 ? 'CL' : 'MR'; }
for (const seed of [3, 378, 704]) {
  const a = simGame(seed, {}, { rosters: ROSTERS }), b = simGame(seed, {}, { rosters: relabel });
  if (JSON.stringify(a.stream) !== JSON.stringify(b.stream)) { bad(`seed ${seed}: relievers labelled MR / CL do not pitch like RP`); break; }
  if (!a.stream.some(e => e.type === 'substitution' && e.role === 'pitcher')) bad(`seed ${seed}: no pitching change, the bullpen check proves nothing`);
}

/* fielder defence (#378 part 6) */
const DEF = { ...BAT, points: { ...BAT.points, def: 61 } };
if (pointKeys(DEF).length !== 6 || budgetOf(DEF) !== CREATE.budget.bat + CREATE.defBudget) bad('a batter with def does not spend budget + defBudget over six keys');
if ((CREATE.budget.bat + CREATE.defBudget) % 6) bad('budget + defBudget is not divisible by six (the form splits it evenly)');
{ const w = validateCreate(DEF); if (w.length) bad(`valid batter with def refused: ${w.join('; ')}`); }
for (const [what, c] of Object.entries({
  'def on a pitcher': { ...PIT, points: { ...PIT.points, def: 61 } },
  'def over the cap': { ...DEF, points: { ...DEF.points, def: CREATE.cap.bat + 1, con: 70 - 10 } },
  'def on the old budget': { ...DEF, points: { ...BAT.points, pow: 40 - 0, def: 0 } },
  'def over the budget': { ...DEF, points: { ...DEF.points, def: 62 } },
})) if (!validateCreate(c).length) bad(`${what}: accepted`);
for (let d = RATING_MIN; d <= RATING_MAX; d++) if (defRating(defRaw(d)) !== d) { bad(`def display ${d} does not go to raw and back`); break; }
if (defRaw(RATING_MID) !== 1 || Math.abs(defRaw(RATING_MAX) - DEF_MAX) > 1e-9 || Math.abs(defRaw(RATING_MIN) - DEF_MIN) > 1e-9) bad('def scale: the middle is not 1.0 or the ends are not DEF_MIN / DEF_MAX');
if (ROSTERS.some(t => t.bat.some(b => 'def' in ratingsOf(b)))) bad('a factory batter shows a def rating');
const hiDef = makePlayer(1001, { ...DEF, points: { con: 61, pow: 61, eye: 61, spd: 53, arm: 60, def: 70 } });
const loDef = makePlayer(1001, { ...DEF, points: { con: 61, pow: 61, eye: 61, spd: 70, arm: 73 - 10, def: 50 } });
for (const m of [hiDef, loDef]) if (ratingsOf(m.player).def !== m.ratings.def || m.ratings.def !== (m === hiDef ? 70 : 50)) bad(`created def reads ${m.ratings.def}, chosen ${m === hiDef ? 70 : 50}`);
if (!(hiDef.player.def > 1 && hiDef.player.def <= DEF_MAX && loDef.player.def < 1 && loDef.player.def >= DEF_MIN)) bad(`created raw def ${hiDef.player.def} / ${loDef.player.def} off the engine band`);
{ /* the same created shortstop with a strong and a weak glove: the engine must play different games */
  const at = (pl, seed) => { const c = JSON.parse(JSON.stringify(ROSTERS)), i = c[1].bat.findIndex(b => b.pos === 'SS'); c[1].bat[i] = { ...pl, pos: 'SS', def: pl.def }; return simGame(seed, {}, { rosters: c, starters: [0, 0] }).stream; };
  const strong = { ...hiDef.player, def: DEF_MAX }, weak = { ...hiDef.player, def: DEF_MIN };
  if ([1, 2, 3, 4, 5].every(seed => JSON.stringify(at(strong, seed)) === JSON.stringify(at(weak, seed)))) bad('a created fielder\'s def never reaches the game');
}
if (positionFit('DH', { def: 99, arm: 99 }) !== FIT_TEXT.none) bad('a DH should read 不守備');
if (positionFit('SS', { def: 70, arm: 70 }) !== FIT_TEXT.good) bad('a 70/70 shortstop should read 拿手');
if (positionFit('SS', { def: CREATE.floor, arm: CREATE.floor }) !== FIT_TEXT.poor) bad('a floor-glove shortstop should read 吃力');
if (positionFit('1B', { arm: 40 }) !== FIT_TEXT.good) bad('an old choice (no def) at 1B should read 拿手 (def = the middle)');

const src = readFileSync(path.join(ROOT, 'league/freeagents.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) bad('league/freeagents.js uses Math.random or Date');
if (JSON.stringify(ROSTERS) !== before) bad('ROSTERS changed while creating players');

console.log(`freeagents: ${SAMPLES} created players, overall bat ${ovr.bat.join('..')}, pit ${ovr.pit.join('..')}; ${NAME_DRAWS} names drawn (${names.size} distinct)`);
if (problems.length) { console.error(`freeagents.check FAILED: ${problems.length} problem(s)`); for (const p of problems.slice(0, 30)) console.error('  ' + p); process.exit(1); }
console.log('freeagents.check OK');
