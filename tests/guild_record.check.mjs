/* Guild record (#800 part 8, league/guild_record.js + ui/guild.js). Fixed fixtures, no network. Fails when
 *   - the record of a guild in a standings file written by league/guild_night.js is not its own W-L / runs and its place in `rank`;
 *   - a missing file, a bad file or a guild not in it gives anything but "no record";
 *   - ui/guild.js does not read the record from this module or asks the server for it (the record comes from the published file, rule 10);
 *   - the module imports anything but guild_night.js, or uses Math.random, Date or the network.
 * Usage: node tests/guild_record.check.mjs */
import { readFileSync } from 'node:fs';
import { guildRecord, recordText, RECORD_NONE, STANDINGS_URL } from '../league/guild_record.js';
import { guildNight, GUILD_DIR } from '../league/guild_night.js';

const bad = [], eq = (a, b, m) => { if (a !== b) bad.push(`${m}: got ${a}, expected ${b}`); };
eq(STANDINGS_URL, `${GUILD_DIR}/standings.json`, 'url');

/* a real standings file from the nightly core: four guilds, two nights, a fake `play` whose home side wins by the seed's parity */
const guilds = ['ga', 'gb', 'gc', 'gd'].map(id => ({ id, name: id, base: 'x', members: [] }));
const play = seed => ({ score: seed % 2 ? [1, 3] : [4, 2], players: [{}, {}] });
let prev = {};
for (const [night, date] of [[0, '2026-12-01'], [1, '2026-12-02']]) {
  const files = guildNight({ exp: { guilds }, date, commit: 'c0', season: 1, night, prev, play, rosterOf: () => ({}) });
  prev = { standings: JSON.parse(files[STANDINGS_URL]) };
}
const st = prev.standings;
let games = 0;
st.rank.forEach((row, i) => {
  const r = guildRecord(st, row.id);
  eq(r.w, st.teams[row.id].w, `${row.id} wins`); eq(r.l, st.teams[row.id].l, `${row.id} losses`);
  eq(r.rf, st.teams[row.id].rf, `${row.id} runs for`); eq(r.ra, st.teams[row.id].ra, `${row.id} runs against`);
  eq(r.rank, i + 1, `${row.id} rank`); eq(r.of, 4, `${row.id} of`); eq(r.season, 1, 'season'); eq(r.night, 1, 'night');
  games += r.w + r.l;
});
eq(games, 8, 'four guilds x two nights = 8 decisions');
const top = guildRecord(st, st.rank[0].id), text = recordText(top);
for (const part of [`${top.w} 勝`, `${top.l} 敗`, '第 1 名', '共 4 隊', '試跑']) eq(text.includes(part), true, `text has ${part}`);

for (const [name, s, id] of [['missing guild', st, 'gz'], ['null file', null, 'ga'], ['no rank', { season: 1 }, 'ga'], ['no season', { rank: st.rank }, 'ga'],
  ['bad row', { season: 1, rank: [{ id: 'ga', w: 'x', l: 0, rf: 0, ra: 0 }] }, 'ga'], ['negative', { season: 1, rank: [{ id: 'ga', w: -1, l: 0, rf: 0, ra: 0 }] }, 'ga']])
  eq(recordText(guildRecord(s, id)), RECORD_NONE, name);

const ui = readFileSync(new URL('../ui/guild.js', import.meta.url), 'utf8');
if (!ui.includes("from '../league/guild_record.js'") || !ui.includes('guildRecord(') || !ui.includes('STANDINGS_URL')) bad.push('ui/guild.js does not read the record through league/guild_record.js');
if (/api\([^)]*(record|standings)/.test(ui)) bad.push('ui/guild.js asks the server for the record');
const src = readFileSync(new URL('../league/guild_record.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\s[^;]*from\s+['"](?!\.\/guild_night\.js)/m.test(src)) bad.push('guild_record.js imports something else');
if (/Math\.random|\bDate\b|fetch\(|XMLHttpRequest/.test(src)) bad.push('guild_record.js uses randomness, the clock or the network');

if (bad.length) { console.error('guild_record.check FAILED\n' + bad.join('\n')); process.exit(1); }
console.log('guild_record.check ok (record, rank and the no-record cases)');
