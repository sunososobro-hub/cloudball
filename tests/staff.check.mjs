/* League staff rules (plain Node). Fails when league/staff.js
 *   - misses one of the four roles of a team, or has an unknown role or team,
 *   - repeats an id, a coach number on a team (or takes a player's number there) or an umpire number,
 *   - has an empty character line or one longer than MAX_LINE characters, or an impossible age,
 *   - gives a crew that is not four distinct pool umpires, or a different crew for the same seed,
 *   - uses Math.random or Date, or is imported by engine/ (staff never changes a game).
 * Names are covered by tests/names.check.mjs. static.mjs runs this file.
 * Usage: node tests/staff.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINE = 30, UMPIRE_POOL = 8, CREW_SEEDS = 2000, MIN_AGE = 25, MAX_AGE = 75, MIN_START_AGE = 18;
const S = await import(pathToFileURL(path.join(ROOT, 'league/staff.js')));
const { TEAMS } = await import(pathToFileURL(path.join(ROOT, 'league/teams.js')));
const { ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'league/players.js')));
const problems = [], ids = new Set();
const lineOk = (who, l) => { if (typeof l !== 'string' || !l.trim()) problems.push(`${who}: empty line`); else if ([...l].length > MAX_LINE) problems.push(`${who}: line has ${[...l].length} characters (max ${MAX_LINE})`); };
const person = p => {
  if (ids.has(p.id)) problems.push(`${p.id}: repeated id`); ids.add(p.id);
  if (!Number.isInteger(p.num) || p.num < 0 || p.num > 99) problems.push(`${p.id}: bad number ${p.num}`);
  if (!Number.isInteger(p.age) || p.age < MIN_AGE || p.age > MAX_AGE) problems.push(`${p.id}: bad age ${p.age}`);
  lineOk(p.id, p.line);
};

const roles = Object.keys(S.ROLES), teamIds = TEAMS.map(t => t.id);
for (const s of S.STAFF) {
  person(s);
  if (!teamIds.includes(s.team)) problems.push(`${s.id}: unknown team ${s.team}`);
  if (!roles.includes(s.role)) problems.push(`${s.id}: unknown role ${s.role}`);
  if (s.id !== `${s.team}-${s.role}`) problems.push(`${s.id}: id must be <team>-<role>`);
}
for (const t of teamIds) {
  const staff = S.STAFF.filter(s => s.team === t), nums = new Set();
  for (const r of roles) if (staff.filter(s => s.role === r).length !== 1) problems.push(`${t}: needs exactly one ${r}`);
  const roster = ROSTERS.find(x => x.bat[0].id.startsWith(t + '-'));
  const playerNums = new Set(roster ? [...roster.bat, ...roster.pit].map(p => p.num) : []);
  for (const s of staff) {
    if (nums.has(s.num)) problems.push(`${s.id}: number ${s.num} repeated on ${t}`); nums.add(s.num);
    if (playerNums.has(s.num)) problems.push(`${s.id}: number ${s.num} is a ${t} player's`);
  }
}
if (S.UMPIRES.length !== UMPIRE_POOL) problems.push(`umpire pool has ${S.UMPIRES.length} (want ${UMPIRE_POOL})`);
const umpNums = new Set();
for (const u of S.UMPIRES) {
  person(u);
  if (umpNums.has(u.num)) problems.push(`${u.id}: umpire number ${u.num} repeated`); umpNums.add(u.num);
  if (!Number.isInteger(u.years) || u.years < 0 || u.years > u.age - MIN_START_AGE) problems.push(`${u.id}: ${u.years} years of service at age ${u.age}`);
}

const pool = new Set(S.UMPIRES.map(u => u.id)), plates = new Map();
for (let seed = 0; seed < CREW_SEEDS; seed++) {
  const c = S.crewFor(seed), d = S.crewFor(seed), got = S.CREW_POSITIONS.map(p => c[p]);
  if (JSON.stringify(c) !== JSON.stringify(d)) { problems.push(`crewFor(${seed}) is not deterministic`); break; }
  if (new Set(got).size !== S.CREW_POSITIONS.length || got.some(id => !pool.has(id))) { problems.push(`crewFor(${seed}) is not four distinct pool umpires: ${got}`); break; }
  plates.set(c.plate, (plates.get(c.plate) || 0) + 1);
}
if (plates.size !== UMPIRE_POOL) problems.push(`only ${plates.size} of ${UMPIRE_POOL} umpires ever work the plate over ${CREW_SEEDS} seeds`);

const src = readFileSync(path.join(ROOT, 'league/staff.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) problems.push('league/staff.js uses Math.random or Date');
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(path.join(ROOT, 'engine'))) if (/\.m?js$/.test(f) && /staff(\.js)?['"]/.test(readFileSync(f, 'utf8'))) problems.push(`${path.relative(ROOT, f)} imports league/staff.js`);

console.log(`staff: ${S.STAFF.length} coaches, ${S.UMPIRES.length} umpires, ${CREW_SEEDS} crews checked; plate games per umpire ${[...plates.values()].sort((a, b) => a - b).join('/')}`);
if (problems.length) { console.error(`FAILED: ${problems.length} staff problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: four roles per team, numbers free, lines short, crews deterministic and legal.');
