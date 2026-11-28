/* Scheduled guild games, the roster rule and the runner (#809 part 3): league/guild_roster.js + league/tools/guild_night.mjs with the real engine.
 * Fails when
 *   - a member does not take the lineup seat of his position (and play it), a pitcher not a starter seat, a name clash is not renamed, a 10th batter or a 6th SP is not left out,
 *     the NPC of a seat stays, the bench changes, or guildRoster edits the roster it was given;
 *   - the same export + night gives different bytes (run twice), or a line in a file names an NPC (only members' batting lines);
 *   - readExport does not merge pages / drop a repeated guild, readPrev does not read back what a night wrote, or a second night does not continue the first one's standings;
 *   - two guilds of ONE base team play the same roster (the rosters sit at slots 0 and 1), or an unknown base team is not named;
 *   - the tool writes anything without --write (the check runs the pure functions only and writes nothing).
 * Usage: node tests/guild_night_run.check.mjs */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guildRoster } from '../league/guild_roster.js';
import { siteRoster } from '../league/site_roster.js';
import { readExport, readPrev, makePlay } from '../league/tools/guild_night.mjs';
import { guildNight, GUILD_DIR, PIT_COLS, shardOf } from '../league/guild_night.js';
import { memberLine } from '../league/guild_lines.js';

const problems = [], bad = m => problems.push(m);
const players = JSON.parse(readFileSync(fileURLToPath(new URL('../league/site/players.json', import.meta.url)), 'utf8'));
const base = siteRoster(players, 'owls', 1), baseJson = JSON.stringify(base);
const m = (name, kind, ovr, pos, leader = false) => ({ leader, coach: leader, player: { name, kind, ovr, pos } });

/* the roster rule */
const posOf = base.bat.map(b => b.pos), pickPos = posOf[3];
const g1 = { id: 'aaaaaaaaaaaa', name: '甲', base: 'owls', settings: null, members: [
  m('阿甲', 'bat', 90, pickPos, true), m('阿乙', 'bat', 80, 'ZZ'), m('阿丙', 'pit', 85, 'SP'), m(base.bat[0].name, 'bat', 70, posOf[0]), { leader: false, coach: false, player: null }] };
const { roster, names } = guildRoster(g1, base);
if (JSON.stringify(base) !== baseJson) bad('guildRoster edited the roster it was given');
if (roster.bat[3].name !== '阿甲' || roster.bat[3].pos !== pickPos) bad('a batter did not take the lineup seat of his position');
if (roster.bat.length !== base.bat.length || roster.pit.length !== base.pit.length) bad('seat count changed');
if (roster.pit[0].name !== '阿丙' || roster.pit[0].role !== 'SP') bad('an SP did not take the first starter seat');
const last = roster.bat[base.bat.length - 1];
if (last.name !== '阿乙' || last.pos !== base.bat[base.bat.length - 1].pos) bad('a batter with no seat of his position did not take the last free seat and play its position');
if (!names.includes('阿甲') || names.length !== 4) bad(`names = ${names.join()}`);
const clash = roster.bat[0].name;
if (clash === base.bat[0].name || !clash.startsWith(base.bat[0].name + '·')) bad(`a name clash was not renamed: ${clash}`);
if (JSON.stringify(roster.bench) !== JSON.stringify(base.bench)) bad('the bench changed');
const crowd = { id: 'bbbbbbbbbbbb', name: '乙', base: 'owls', members: Array.from({ length: 12 }, (_, i) => m(`B${i}`, 'bat', 60, 'DH')) };
const cr = guildRoster(crowd, base);
if (cr.names.length !== base.bat.length) bad(`${cr.names.length} batters seated in ${base.bat.length} seats`);
const sps = { id: 'cccccccccccc', name: '丙', base: 'owls', members: Array.from({ length: 12 }, (_, i) => m(`P${i}`, 'pit', 60, 'SP')) };
if (guildRoster(sps, base).names.length !== base.pit.length) bad('pitchers did not fill exactly the pitching seats');

/* export / prev */
const pg1 = { ok: true, guilds: [g1, { ...crowd }], next: 'x' }, pg2 = [{ guilds: [g1, sps] }];
const ex = readExport(JSON.stringify([pg1, ...pg2]));
if (ex.guilds.map(g => g.id).join() !== [g1.id, crowd.id, sps.id].join()) bad('readExport did not merge pages or dropped a repeated guild wrongly');

/* a night with the real engine, twice */
const { play, rosterOf } = makePlay(players);
const night = (n, prev) => guildNight({ exp: ex, date: `2026-12-0${n + 1}`, commit: 'abc1234', season: 1, night: n, prev, play, rosterOf });
const a = night(0, {}), b = night(0, {});
if (Object.keys(a).join() !== Object.keys(b).join() || Object.keys(a).some(k => a[k] !== b[k])) bad('same export + night gave different bytes');
const nm = new Set([...names, ...cr.names, ...guildRoster(sps, base).names]);
const nightFile = JSON.parse(a[`${GUILD_DIR}/night-2026-12-01.json`]);
if (!nightFile.games.length) bad('no game was played');
for (const g of nightFile.games) for (const k of Object.keys(g.lines)) if (!nm.has(k.slice(k.indexOf(':') + 1))) bad(`a line of a non-member: ${k}`);
if (nightFile.games.some(g => g.score[0] === g.score[1])) bad('a tied game');
/* pitching lines: members only, 5 numbers, outs add up, and the same row sits in its shard next to the batting rows */
const pitNames = new Set(guildRoster(sps, base).names), pitRows = nightFile.games.flatMap(g => Object.entries(g.pitching || {}));
if (!pitRows.length) bad('no pitching line of a member was written');
for (const [k, row] of pitRows) {
  if (!pitNames.has(k.slice(k.indexOf(':') + 1)) && !nm.has(k.slice(k.indexOf(':') + 1))) bad(`a pitching line of a non-member: ${k}`);
  if (row.length !== PIT_COLS.length || !row.every(Number.isInteger)) bad(`pitching row of ${k} is not ${PIT_COLS.length} whole numbers`);
  const sh = JSON.parse(a[`${GUILD_DIR}/lines/1/${String(shardOf(k)).padStart(3, '0')}.json`]);
  if (!sh[k] || !sh[k].some(r => r.length === PIT_COLS.length + 1 && r[0] === 0 && r.slice(1).join() === row.join())) bad(`pitching row of ${k} is not in its shard`);
  if (memberLine(sh, k) !== null) bad(`memberLine read the pitching rows of ${k} as batting`);
}

/* readPrev reads back what a night wrote; the next night continues it */
const dir = mkdtempSync(path.join(tmpdir(), 'gnight-'));
try {
  for (const [p, t] of Object.entries(a)) { const dest = path.join(dir, p.replace(/^league\/site\//, '')); mkdirSync(path.dirname(dest), { recursive: true }); writeFileSync(dest, t); }
  const prev = readPrev(dir, 1), st = JSON.parse(a[`${GUILD_DIR}/standings.json`]);
  if (JSON.stringify(prev.standings) !== JSON.stringify(st)) bad('readPrev did not read standings back');
  if (!prev.lines || Object.keys(prev.lines).length !== Object.keys(a).filter(p => p.includes('/lines/')).length) bad('readPrev did not read the line shards back');
  const c = night(1, prev), st2 = JSON.parse(c[`${GUILD_DIR}/standings.json`]);
  if (st2.games.length !== st.games.length + nightFile.games.length || st2.games.length < 2) bad('night 2 did not continue the standings');
  if (Object.keys(readPrev(dir, 2)).includes('lines')) bad('readPrev of another season read lines');
} finally { rmSync(dir, { recursive: true, force: true }); }

/* two guilds of one base team: different rosters at slots 0 and 1 */
const ro = rosterOf(g1), ro2 = rosterOf(sps);
if (JSON.stringify(ro) === JSON.stringify(ro2)) bad('two guilds of one base team got one roster');
try { rosterOf({ id: 'dddddddddddd', base: 'nowhere', members: [] }); bad('an unknown base team was accepted'); } catch (e) { if (!/nowhere/.test(e.message)) bad('the unknown base error does not name the team'); }

if (problems.length) { console.log('FAIL guild_night_run:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`ok guild_night_run: ${nightFile.games.length} games a night, ${Object.keys(a).length} files, byte-identical twice, night 2 continues night 1`);
