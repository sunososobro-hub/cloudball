/* bench.mjs: draws the factory bench of every 一軍 team (#436 part 1). Hand-run, never at game time.
 *   node league/tools/bench.mjs            prints the draw
 *   node league/tools/bench.mjs --write    rewrites the `bench: [...]` list of every team in ../players.js
 * Per team BENCH_SIZE batters, one of each BENCH_SLOTS kind: a backup catcher (arm), a utility infielder, a fast
 * outfielder (the pinch runner) and a bat (the pinch hitter). Each rating is drawn around the factory lineup batters
 * of ../players.js: mean + sd * (BENCH_Z + JITTER * normal), the kind's own ratings at their own z instead, so the
 * bench reads under the lineup on the existing ../ratings.js scale (that scale comes from `bat` only and does not move).
 * Names come from names.mjs drawNames (market names, blocklist, full names unique league-wide, a given name at most
 * twice among the players and never twice on a team, never a coach's given name on his team).
 * avg and body follow the same formulas as abilities.mjs. Deterministic (BENCH_SEED). */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { drawNames } from './names.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url)), FILE = path.join(HERE, '../players.js');

export const BENCH_SEED = 436;
export const BENCH_SIZE = 4;
export const BENCH_Z = -0.6, JITTER = 0.35;
/* [slot, pos, age range, {rating: z}] : the kind's own ratings replace BENCH_Z */
export const BENCH_SLOTS = [
  ['x1', 'C', [28, 34], { arm: 0.8 }],
  ['x2', 'SS', [23, 28], { spd: 0, arm: 0 }],
  ['x3', 'CF', [22, 27], { spd: 1.8 }],
  ['x4', '1B', [29, 35], { con: 0.6, pow: 0.9 }],
];
const KEYS = ['con', 'pow', 'eye', 'spd', 'arm', 'pot'];
const LEFT_P = 0.3, HT = [1.72, 1.92];

const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const normal = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const sd = a => { const m = mean(a); return Math.sqrt(mean(a.map(x => (x - m) ** 2))); };
const r3 = x => Math.round(x * 1000) / 1000, r2 = x => Math.round(x * 100) / 100, clamp01 = x => Math.max(0, Math.min(1, x));

/* draw(rosters, staff) -> one bench list per team, in roster order */
export function draw(rosters, staff) {
  const r = mulberry32(BENCH_SEED), bats = rosters.flatMap(t => t.bat);
  const S = Object.fromEntries(KEYS.map(k => [k, { m: mean(bats.map(p => p[k])), sd: sd(bats.map(p => p[k])) }]));
  const A = (() => { const m = S.con.m, a = mean(bats.map(p => p.avg)); let xy = 0, xx = 0; for (const p of bats) { xy += (p.con - m) * (p.avg - a); xx += (p.con - m) ** 2; } return { m, a, b: xy / xx }; })();
  const benches = rosters.map(t => {
    const team = t.bat[0].id.split('-')[0];
    const nums = new Set([...t.bat, ...t.pit, ...staff.filter(s => s.team === team)].map(p => p.num));
    return BENCH_SLOTS.map(([slot, pos, [a0, a1], own]) => {
      const p = { id: `${team}-${slot}`, name: '', num: 0, pos };
      for (const k of KEYS) p[k] = r3(S[k].m + S[k].sd * ((k in own ? own[k] : BENCH_Z) + JITTER * normal(r)));
      p.age = a0 + Math.floor(r() * (a1 - a0 + 1));
      do p.num = 1 + Math.floor(r() * 99); while (nums.has(p.num));
      nums.add(p.num);
      p.avg = r3(A.a + A.b * (p.con - A.m));
      p.hand = r() < LEFT_P ? 'L' : 'R';
      const pw = p.pow - 1, sp = p.spd - 1;
      p.body = { slim: r2(clamp01((sp - 0.04) / 0.1 - pw / 0.2)), power: r2(clamp01((pw - 0.02) / 0.2)), heavy: r2(clamp01((pw - 0.1) / 0.15 - sp / 0.1)) };
      p.ht = r2(HT[0] + (HT[1] - HT[0]) * r());
      return p;
    });
  });
  /* names: every factory player and staff name is taken; a given name already used twice by players is full */
  const players = rosters.flatMap(t => [...t.bat, ...t.pit]);
  const taken = new Set([...players, ...staff].map(p => p.name)), teamGiven = new Map(), leagueGiven = new Map();
  for (const p of [...players, ...staff]) {
    const team = p.team || p.id.split('-')[0];
    teamGiven.set(team, (teamGiven.get(team) || new Set()).add(p.name.slice(1)));
  }
  for (const p of players) leagueGiven.set(p.name.slice(1), (leagueGiven.get(p.name.slice(1)) || 0) + 1);
  const people = benches.flat().map(p => ({ id: p.id, team: p.id.split('-')[0], age: p.age }));
  const names = drawNames(people, { seed: BENCH_SEED, taken, teamGiven, leagueGiven });
  for (const p of benches.flat()) p.name = names.get(p.id);
  return benches;
}

const line = p => `      {id: "${p.id}", name: "${p.name}", num: ${p.num}, pos: "${p.pos}", con: ${p.con}, pow: ${p.pow}, eye: ${p.eye}, age: ${p.age}, pot: ${p.pot}, arm: ${p.arm}, avg: ${p.avg}, spd: ${p.spd}, hand: "${p.hand}", body: {slim: ${p.body.slim}, power: ${p.body.power}, heavy: ${p.body.heavy}}, ht: ${p.ht}},`;
export const benchSource = list => `    bench: [\n${list.map(line).join('\n')}\n    ],\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ROSTERS } = await import(pathToFileURL(FILE));
  const { STAFF } = await import(pathToFileURL(path.join(HERE, '../staff.js')));
  const { ratingsOf } = await import(pathToFileURL(path.join(HERE, '../ratings.js')));
  const B = draw(ROSTERS.map(t => ({ bat: t.bat, pit: t.pit })), STAFF);
  for (const p of B.flat()) { const q = ratingsOf(p); console.log(`${p.id}\t${p.pos}\t${p.name}\t#${p.num}\tovr ${q.ovr}\tcon ${q.con} pow ${q.pow} eye ${q.eye} spd ${q.spd} arm ${q.arm}`); }
  if (process.argv.includes('--write')) {
    let src = readFileSync(FILE, 'utf8').replace(/    bench: \[\n[\s\S]*?\n    \],\n/g, '');
    let i = 0;
    src = src.replace(/(    bat: \[\n[\s\S]*?\n    \],\n)/g, m => m + benchSource(B[i++]));
    if (i !== B.length) throw new Error(`wrote ${i} benches, expected ${B.length}`);
    writeFileSync(FILE, src);
    console.log(`wrote ${i} benches into league/players.js`);
  }
}
