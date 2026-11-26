/* Name generator for league people (CC0). Run by hand, never at game time:
 *   node league/tools/names.mjs          print the names it would give, change nothing
 *   node league/tools/names.mjs --write  rewrite only the `name` fields of league/players.js
 *   node league/tools/names.mjs --staff [--write]  the same for league/staff.js (coaches and
 *                                        umpires, STAFF_SEED, player full names are taken)
 * Names are "market names": the most common real Taiwanese names, so one name points at
 * thousands of people and at nobody in particular. Surnames follow the real frequency order,
 * given names come from the pool of the decade the person was born in (age -> birth year).
 * Every full name is filtered against blocklist.txt (real athletes) and redrawn on a hit.
 * Repeat limits: a given name at most MAX_GIVEN_LEAGUE times in the league, never twice on
 * one team, and no two people share a full name. Sources and edition: see README.md here. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { SURNAMES, GIVEN } from '../namepool.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const NAME_SEED = 50;            /* issue #50: change it only to re-roll the whole league */
export const STAFF_SEED = 52;           /* issue #52: coaches and umpires */
export const MAX_GIVEN_LEAGUE = 2;
export const SEASON_YEAR = 2026;        /* age is counted against this year */
const MAX_TRIES = 10000;

/* SURNAMES and GIVEN live in league/namepool.js (pure, so the page can draw free-agent names, #178). */
export { SURNAMES, GIVEN };

export const decadeOf = age => Math.max(1950, Math.min(1990, Math.floor((SEASON_YEAR - age) / 10) * 10));

export const readBlocklist = () => new Set(readFileSync(path.join(HERE, 'blocklist.txt'), 'utf8')
  .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));

/* mulberry32: small seeded PRNG, so the same seed always gives the same league */
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, items) => { const total = items.reduce((s, [, w]) => s + w, 0); let x = r() * total; for (const [v, w] of items) if ((x -= w) < 0) return v; return items[items.length - 1][0]; };
const poolOf = age => Object.entries(GIVEN[decadeOf(age)]).flatMap(([w, s]) => s.split(' ').map(g => [g, Number(w)]));

/* people: [{id, team, age}] in a stable order. Returns Map id -> name.
 * taken: full names already in use; teamGiven: Map team -> Set of given names already on it;
 * leagueGiven: Map given name -> times already used league-wide (counts toward MAX_GIVEN_LEAGUE). */
export function drawNames(people, { seed = NAME_SEED, blocked = readBlocklist(), taken = new Set(), teamGiven = new Map(), leagueGiven = new Map() } = {}) {
  const r = rng(seed), out = new Map(), full = new Set(taken), league = new Map(leagueGiven);
  const team = new Map([...teamGiven].map(([t, g]) => [t, new Set(g)]));
  for (const p of people) {
    const onTeam = team.get(p.team) || new Set();
    const pool = poolOf(p.age).filter(([g]) => (league.get(g) || 0) < MAX_GIVEN_LEAGUE && !onTeam.has(g));
    let name = null;
    for (let i = 0; i < MAX_TRIES && !name; i++) {
      const n = pick(r, SURNAMES) + pick(r, pool);
      if (!blocked.has(n) && !full.has(n)) name = n;
    }
    if (!name) throw new Error(`no free name for ${p.id} (pool of ${decadeOf(p.age)}s exhausted)`);
    const g = name.slice(1);
    out.set(p.id, name); full.add(name); league.set(g, (league.get(g) || 0) + 1); onTeam.add(g); team.set(p.team, onTeam);
  }
  return out;
}

/* Rewrites only `name: "..."` right after `{id: "<id>"` in a data file. */
function writeNames(file, names) {
  let src = readFileSync(file, 'utf8'), n = 0;
  src = src.replace(/(\{id: "([^"]+)", name: ")([^"]*)(")/g, (m, a, id, old, b) => names.has(id) ? (n++, a + names.get(id) + b) : m);
  if (n !== names.size) throw new Error(`rewrote ${n} names, expected ${names.size}`);
  writeFileSync(file, src);
  console.log(`wrote ${n} names into ${path.relative(path.join(HERE, '../..'), file)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { ROSTERS } = await import('../players.js');
  const players = ROSTERS.flatMap(t => [...t.bat, ...t.pit].map(p => ({ id: p.id, team: p.id.split('-')[0], age: p.age, old: p.name })));
  let file, people, names;
  if (process.argv.includes('--staff')) {
    file = path.join(HERE, '../staff.js');
    const { STAFF, UMPIRES } = await import('../staff.js');
    people = [...STAFF.map(s => ({ id: s.id, team: s.team, age: s.age, old: s.name })),
      ...UMPIRES.map(u => ({ id: u.id, team: 'umpires', age: u.age, old: u.name }))];
    /* a coach never shares a given name with a player of his own team: the booth calls both */
    const teamGiven = new Map();
    for (const p of players) teamGiven.set(p.team, (teamGiven.get(p.team) || new Set()).add(p.old.slice(1)));
    names = drawNames(people, { seed: STAFF_SEED, taken: new Set(players.map(p => p.old)), teamGiven });
  } else {
    file = path.join(HERE, '../players.js');
    people = players;
    names = drawNames(people);
  }
  for (const p of people) console.log(`${p.id}\t${p.age}\t${p.old} -> ${names.get(p.id)}`);
  if (process.argv.includes('--write')) writeNames(file, names);
}
