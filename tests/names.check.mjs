/* League name rules (plain Node). Fails when a person in league data
 *   - has the full name of a real athlete (league/tools/blocklist.txt),
 *   - shares a full name with another person,
 *   - shares a given name with more than MAX_GIVEN_LEAGUE people league-wide, or with a teammate,
 *   - has a given name common only for births after 2011.
 * Covers league/players.js, league/staff.js, and the booth: the fan guests of commentary/lines.json
 * and the two fixed voices (pbp, color) of commentary/voices.json. static.mjs runs this file.
 * Usage: node tests/names.check.mjs */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAX_GIVEN_LEAGUE = 2;
const TOO_YOUNG = ['承恩', '宥廷', '品睿', '恩碩', '子睿'];
const COMPOUND = ['歐陽', '司馬', '諸葛', '上官', '張簡', '范姜'];
const givenOf = n => n.slice(COMPOUND.some(c => n.startsWith(c)) ? 2 : 1);

const blocked = new Set(readFileSync(path.join(ROOT, 'league/tools/blocklist.txt'), 'utf8')
  .split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')));
const people = [];
const { ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'league/players.js')));
for (const t of ROSTERS) for (const p of [...t.bat, ...t.pit]) people.push({ id: p.id, name: p.name, team: p.id.split('-')[0], player: true });
const staffFile = path.join(ROOT, 'league/staff.js');
if (existsSync(staffFile)) {
  const S = await import(pathToFileURL(staffFile));
  for (const list of Object.values(S)) if (Array.isArray(list)) for (const p of list.flat(2)) if (p && p.id && p.name) people.push({ id: p.id, name: p.name, team: p.team || null, player: false });
}
/* the booth: fan guests from the bank, the two fixed voices from the voice config (#71) */
const bank = JSON.parse(readFileSync(path.join(ROOT, 'commentary/lines.json'), 'utf8'));
for (const [team, g] of Object.entries(bank.guests || {})) people.push({ id: `guest-${team}`, name: g.name, team, player: false });
const roles = JSON.parse(readFileSync(path.join(ROOT, 'commentary/voices.json'), 'utf8')).roles || {};
for (const r of ['pbp', 'color']) {
  if (!roles[r] || !roles[r].name) { console.error(`FAILED: commentary/voices.json has no name for ${r}`); process.exit(1); }
  people.push({ id: `voice-${r}`, name: roles[r].name, team: null, player: false });
}

const problems = [], full = new Map(), given = new Map(), onTeam = new Map();
for (const p of people) {
  if (blocked.has(p.name)) problems.push(`${p.id} ${p.name}: full name of a real athlete (blocklist)`);
  if (full.has(p.name)) problems.push(`${p.id} ${p.name}: same full name as ${full.get(p.name)}`); else full.set(p.name, p.id);
  const g = givenOf(p.name);
  if (TOO_YOUNG.includes(g)) problems.push(`${p.id} ${p.name}: given name ${g} is common only for births after 2011`);
  if (!p.player) continue;            /* repeat limits are for players: the booth calls them on the field */
  given.set(g, [...(given.get(g) || []), p.id]);
  const key = `${p.team}/${g}`;
  if (onTeam.has(key)) problems.push(`${p.id} ${p.name}: given name ${g} already on ${p.team} (${onTeam.get(key)})`); else onTeam.set(key, p.id);
}
for (const [g, ids] of given) if (ids.length > MAX_GIVEN_LEAGUE) problems.push(`given name ${g} used ${ids.length} times (max ${MAX_GIVEN_LEAGUE}): ${ids.join(', ')}`);

console.log(`names: ${people.length} people checked against ${blocked.size} blocked names, ${given.size} distinct player given names`);
if (problems.length) { console.error(`FAILED: ${problems.length} name problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: no real-athlete names, no repeated full names, given-name limits hold.');
