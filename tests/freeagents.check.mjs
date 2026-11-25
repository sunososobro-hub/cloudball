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
import { CREATE, BLOCKED, NAME_DECADE, drawName, validateCreate, makePlayer } from '../league/freeagents.js';

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
  'look out of range': { ...BAT, look: { ...look, hair: 10 } },
  'look with text': { ...BAT, look: { ...look, hat: 'red' } },
  'bad nameDraw': { ...BAT, nameDraw: -1 },
  'no choice': null,
};
for (const role of CREATE.roles) { const w = validateCreate({ ...PIT, role }); if (w.length) bad(`role ${role} refused: ${w.join('; ')}`); }
if (!['SP', 'MR', 'RP', 'CL'].every(x => CREATE.roles.includes(x))) bad(`CREATE.roles ${CREATE.roles.join(', ')} misses one of SP, MR, RP, CL`);
for (const [what, c] of Object.entries(off)) if (!validateCreate(c).length) bad(`${what}: accepted`);
try { makePlayer(1, off['over budget']); bad('makePlayer accepted an invalid choice'); } catch { /* expected */ }

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

const src = readFileSync(path.join(ROOT, 'league/freeagents.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) bad('league/freeagents.js uses Math.random or Date');
if (JSON.stringify(ROSTERS) !== before) bad('ROSTERS changed while creating players');

console.log(`freeagents: ${SAMPLES} created players, overall bat ${ovr.bat.join('..')}, pit ${ovr.pit.join('..')}; ${NAME_DRAWS} names drawn (${names.size} distinct)`);
if (problems.length) { console.error(`freeagents.check FAILED: ${problems.length} problem(s)`); for (const p of problems.slice(0, 30)) console.error('  ' + p); process.exit(1); }
console.log('freeagents.check OK');
