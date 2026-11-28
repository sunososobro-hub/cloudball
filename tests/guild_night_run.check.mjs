/* Scheduled guild games, the roster rule and the runner (#809 part 3): league/guild_roster.js + league/tools/guild_night.mjs with the real engine.
 * Fails when
 *   - a member does not take the lineup seat of his position (and play it), a pitcher not a starter seat, a name clash is not renamed, a 10th batter or a 6th SP is not left out,
 *     the NPC of a seat stays, the bench changes, or guildRoster edits the roster it was given;
 *   - the same export + night gives different bytes (run twice), or a line in a file names an NPC (only members' batting lines);
 *   - readExport does not merge pages / drop a repeated guild, readPrev does not read back what a night wrote, or a second night does not continue the first one's standings;
 *   - two guilds of ONE base team play the same roster (the rosters sit at slots 0 and 1), or an unknown base team is not named;
 *   - (#795 part 4b) the lock does not keep a valid member 經紀人 set in canonical form, keeps an invalid / other-kind / neutral one, a lock without
 *     sets changes; guildRoster does not map a set to the seated (renamed) name; gameAgents lends a set to a same-named player of the other side;
 *     a neutral set changes a game, a set does not change any of 8 games, or the same set twice gives different games;
 *   - the tool writes anything without --write (the check runs the pure functions only and writes nothing).
 * Usage: node tests/guild_night_run.check.mjs */
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guildRoster } from '../league/guild_roster.js';
import { siteRoster } from '../league/site_roster.js';
import { readExport, readPrev, makePlay } from '../league/tools/guild_night.mjs';
import { guildNight, GUILD_DIR, freeze } from '../league/guild_night.js';
import { gameAgents } from '../league/tools/guild_night.mjs';
import { freezeSet } from '../league/agentset.js';

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

/* #804 part 5: a pitcher member gets pitching rows [night, bf, outs, k, bb, r] in his shard (the engine's own count), a batter none; NPC pitchers none */
const two = guildNight({ exp: { guilds: [g1, sps] }, date: '2026-12-09', commit: 'abc1234', season: 1, night: 0, prev: {}, play, rosterOf });   /* two guilds: nobody on a bye */
const shards = Object.entries(two).filter(([p]) => p.includes('/lines/')).map(([, t]) => JSON.parse(t));
const rowsOf = n => shards.flatMap(sh => Object.entries(sh).filter(([k]) => k.slice(k.indexOf(':') + 1) === n).flatMap(([, r]) => r));
const pr = rowsOf('阿丙');
if (!pr.length || pr.some(r => r.length !== 6 || !r.every(Number.isInteger))) bad('the pitcher member has no valid pitching rows');
if (pr.length && pr.every(r => r[1] === 0)) bad('the pitcher member faced no batter in any game');
if (rowsOf('阿甲').some(r => r.length !== 10)) bad('a batter member got a pitching row');
if (shards.flatMap(sh => Object.keys(sh)).some(k => !nm.has(k.slice(k.indexOf(':') + 1)))) bad('a shard key of a non-member (NPC pitcher?)');

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

/* #795 part 4b: the 經紀人 set from the export, through the lock, into the engine */
const edges = { v: 1, kind: 'pit', rows: { normal: { edges: 4, pickoff: 0 }, risp: { edges: 4 } } };
const withT = (mm, t) => ({ ...mm, player: { ...mm.player, tactics: t } });
const tg = { ...g1, members: [withT(g1.members[0], { v: 1, kind: 'bat', rows: { normal: { steal: 4, bunt: 0 } } }), g1.members[1], withT(g1.members[2], edges),
  withT(g1.members[3], { v: 1, kind: 'bat', rows: { normal: { steal: 4, bunt: 4, swing_early: 4 } } }), g1.members[4]] };
const lk = freeze({ guilds: [tg, withT({ ...crowd, members: crowd.members.slice(0, 2) }, null)].map((g, i) => i ? { ...g, members: [withT(g.members[0], { v: 1, kind: 'pit', rows: { normal: { edges: 4 } } }), withT(g.members[1], { v: 1, kind: 'bat', rows: {} })] } : g) }, '2026-12-10', 'abc1234');
const lm = lk.guilds.find(x => x.id === g1.id).members, lc = lk.guilds.find(x => x.id === crowd.id).members;
if (JSON.stringify(lm[2].player.tactics) !== JSON.stringify(freezeSet(edges)) || JSON.stringify(lm[0].player.tactics) !== JSON.stringify(freezeSet(tg.members[0].player.tactics))) bad('the lock must keep a valid set in canonical form');
if ('tactics' in lm[3].player) bad('the lock kept a set over the points pool');
if ('tactics' in lc[0].player || 'tactics' in lc[1].player) bad('the lock kept a set of the other kind or an all-neutral set');
if (JSON.stringify(freeze({ guilds: [g1, sps] }, 'd', 'c')).includes('tactics')) bad('a lock without sets must not name tactics');
const lockedG = lk.guilds.find(x => x.id === g1.id), gr = guildRoster(lockedG, base);
if (JSON.stringify(Object.keys(gr.agents).sort()) !== JSON.stringify(['阿丙', '阿甲'].sort())) bad(`guildRoster agents = ${Object.keys(gr.agents).join()}`);
const ga = gameAgents([gr.roster, base], [{ ...gr.agents, [base.bat[1].name]: edges }, {}]);
if (!ga || ga[base.bat[1].name] || !ga['阿丙']) bad('gameAgents must drop a name that also plays on the other side and keep the others');
if (gameAgents([base, base], [{}, {}]) !== null) bad('gameAgents of no sets must be null (factory game)');
const tp = makePlay(players), plain = makePlay(players);
const neutralG = { ...g1, members: g1.members.map((mm, i) => i === 2 ? withT(mm, { v: 1, kind: 'pit', rows: {} }) : mm) };
const runs = (pl, gA) => [0, 1, 2, 3, 4, 5, 6, 7].map(sd => JSON.stringify(pl.play(1000 + sd, { home: pl.rosterOf(sps), away: pl.rosterOf(freeze({ guilds: [gA] }, 'd', 'c').guilds[0]) })));
const r0 = runs(plain, g1), rN = runs(tp, neutralG), rT = runs(tp, tg), rT2 = runs(makePlay(players), tg);
if (rN.join() !== r0.join()) bad('a neutral set changed a game');
if (rT.every((x, i) => x === r0[i])) bad('a non-neutral set changed none of 8 games (not read by the engine?)');
if (rT.join() !== rT2.join()) bad('the same sets gave different games');

if (problems.length) { console.log('FAIL guild_night_run:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`ok guild_night_run: ${nightFile.games.length} games a night, ${Object.keys(a).length} files, byte-identical twice, night 2 continues night 1`);
