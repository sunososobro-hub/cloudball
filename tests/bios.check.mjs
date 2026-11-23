/* Player bio rules (plain Node). Fails when league/bios.js
 *   - has a key that is not a player id, an empty line, a line longer than MAX_LINE characters,
 *     or the same line twice,
 *   - has fewer than 2 or more than 3 tags, a repeated tag, or a tags[0] that is not the
 *     SKILL_TAGS word of the player's best rating (batters: con pow eye spd arm; pitchers:
 *     stuff ctrl arm),
 *   - repeats a gimmick (tags[1]) or uses a skill or data word as one,
 *   - has a tags[2] that is not a DATA_TAGS word or does not match the data (bats/throws left, age),
 *   - misses a player (wave 1, #54: the default pairing's batters and starters; wave 2: the other 44),
 *   - uses Math.random or Date, or is imported by engine/.
 * static.mjs runs this file.
 * Usage: node tests/bios.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_LINE = 30, MIN_TAGS = 2, MAX_TAGS = 3;
const B = await import(pathToFileURL(path.join(ROOT, 'league/bios.js')));
const { TEAMS } = await import(pathToFileURL(path.join(ROOT, 'league/teams.js')));
const { ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'league/players.js')));
const opening = JSON.parse(readFileSync(path.join(ROOT, 'league/preseason/opening.json'), 'utf8'));
const problems = [];

const players = new Map();
for (const r of ROSTERS) {
  for (const p of r.bat) players.set(p.id, { p, ratings: ['con', 'pow', 'eye', 'spd', 'arm'], left: p.hand === 'L', leftTag: B.DATA_TAGS.batsLeft });
  for (const p of r.pit) players.set(p.id, { p, ratings: ['stuff', 'ctrl', 'arm'], left: p.throws === 'L', leftTag: B.DATA_TAGS.throwsLeft });
}
const skillWords = new Set(Object.values(B.SKILL_TAGS)), dataWords = new Set(Object.values(B.DATA_TAGS));
const dataOk = (word, info) => {
  const age = info.p.age;
  if (word === B.DATA_TAGS.batsLeft || word === B.DATA_TAGS.throwsLeft) return word === info.leftTag && info.left;
  if (word === B.DATA_TAGS.young) return age <= B.YOUNG_MAX_AGE;
  if (word === B.DATA_TAGS.veteran) return age >= B.VETERAN_MIN_AGE;
  return false;
};

const lines = new Map(), gimmicks = new Map();
for (const [id, bio] of Object.entries(B.BIOS)) {
  const info = players.get(id);
  if (!info) { problems.push(`${id}: not a player id`); continue; }
  const l = bio.line;
  if (typeof l !== 'string' || !l.trim()) problems.push(`${id}: empty line`);
  else {
    if ([...l].length > MAX_LINE) problems.push(`${id}: line has ${[...l].length} characters (max ${MAX_LINE})`);
    if (lines.has(l)) problems.push(`${id}: same line as ${lines.get(l)}`); lines.set(l, id);
  }
  const tags = bio.tags;
  if (!Array.isArray(tags) || tags.length < MIN_TAGS || tags.length > MAX_TAGS) { problems.push(`${id}: needs ${MIN_TAGS}..${MAX_TAGS} tags`); continue; }
  if (new Set(tags).size !== tags.length) problems.push(`${id}: repeated tag`);
  const best = info.ratings.reduce((a, b) => (info.p[b] > info.p[a] ? b : a));
  if (tags[0] !== B.SKILL_TAGS[best]) problems.push(`${id}: tags[0] is ${tags[0]}, his best rating is ${best} (${B.SKILL_TAGS[best]})`);
  const g = tags[1];
  if (typeof g !== 'string' || !g.trim() || skillWords.has(g) || dataWords.has(g)) problems.push(`${id}: tags[1] must be his own gimmick, got ${g}`);
  else { if (gimmicks.has(g)) problems.push(`${id}: gimmick ${g} already used by ${gimmicks.get(g)}`); gimmicks.set(g, id); }
  if (tags.length === MAX_TAGS && !dataOk(tags[2], info)) problems.push(`${id}: tags[2] ${tags[2]} does not match his data`);
}

/* waves 1 and 2: every factory player has a line; the default pairing is named first (wave 1) */
for (const teamId of opening.teams) if (TEAMS.findIndex(t => t.id === teamId) < 0) problems.push(`opening team ${teamId} has no roster`);
for (const { p } of players.values()) if (!B.BIOS[p.id]) problems.push(`${p.id} (${p.name}): player without a bio`);

const src = readFileSync(path.join(ROOT, 'league/bios.js'), 'utf8');
if (/Math\.random|\bDate\b/.test(src)) problems.push('league/bios.js uses Math.random or Date');
const walk = dir => readdirSync(dir).flatMap(f => { const p = path.join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(path.join(ROOT, 'engine')).filter(f => /\.m?js$/.test(f)))
  if (/league\/bios\.js|['"][./]*bios\.js['"]/.test(readFileSync(f, 'utf8'))) problems.push(`${path.relative(ROOT, f)} imports league/bios.js`);

console.log(`bios: ${Object.keys(B.BIOS).length}/${players.size} players have a line, ${gimmicks.size} distinct gimmicks`);
if (problems.length) { console.error(`bios.check FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('bios.check OK');
