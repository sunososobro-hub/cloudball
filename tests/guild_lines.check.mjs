/* Guild member season line (#804 part 4, league/guild_lines.js + ui/guild.js). Fixed fixtures, no network. Fails when
 *   - the shard of a key is not league/site/guilds/lines/<season>/<NNN>.json with NNN = guild_night.shardOf(key), or two keys of two guilds collide;
 *   - the line of fixed rows is not the plain sum (PA, AVG, OBP, SLG, HR), or a bad row / bad shard / missing key gives anything but "no record";
 *   - ui/guild.js does not read the line from this module or calls the server for it (the line comes from the published shard file, rule 10);
 *   - the module imports anything but the two league files, or uses Math.random, Date or the network.
 * Usage: node tests/guild_lines.check.mjs */
import { readFileSync } from 'node:fs';
import { memberKey, shardUrl, memberLine, memberText, GUILD_NONE } from '../league/guild_lines.js';
import { shardOf, LINE_SHARDS } from '../league/guild_night.js';

const bad = [], eq = (a, b, m) => { if (a !== b) bad.push(`${m}: got ${a}, expected ${b}`); };
const key = memberKey('g1', '阿明');
eq(key, 'g1:阿明', 'key');
eq(shardUrl(3, key), `league/site/guilds/lines/3/${String(shardOf(key)).padStart(3, '0')}.json`, 'shard url');
eq(shardOf(key) >= 0 && shardOf(key) < LINE_SHARDS, true, 'shard range');
eq(memberKey('g1', 'x') === memberKey('g2', 'x'), false, 'same name in two guilds is two keys');

/* row = [night, pa, ab, h, d, t, hr, bb, hbp, sf] */
const shard = { [key]: [[1, 5, 4, 2, 1, 0, 0, 1, 0, 0], [2, 4, 4, 1, 0, 0, 1, 0, 0, 0]], other: [[1, 4, 4, 4, 0, 0, 0, 0, 0, 0]] };
const l = memberLine(shard, key);
eq(l.g, 2, 'games'); eq(l.pa, 9, 'pa'); eq(l.ab, 8, 'ab'); eq(l.h, 3, 'h'); eq(l.hr, 1, 'hr');
eq(l.avg, 3 / 8, 'avg'); eq(l.obp, 4 / 9, 'obp'); eq(l.slg, (3 + 1 + 3) / 8, 'slg');
eq(memberText(shard, key).includes('打席 9'), true, 'text shows PA');
for (const [name, s, k] of [['missing key', shard, 'g9:nobody'], ['null shard', null, key], ['array shard', [], key], ['bad row', { [key]: [[1, 'x', 4, 2, 1, 0, 0, 1, 0, 0]] }, key], ['short row', { [key]: [[1, 2]] }, key], ['not a list', { [key]: 5 }, key]])
  eq(memberText(s, k), GUILD_NONE, name);

const ui = readFileSync(new URL('../ui/guild.js', import.meta.url), 'utf8');
if (!ui.includes("from '../league/guild_lines.js'") || !ui.includes('shardUrl(')) bad.push('ui/guild.js does not read the shard through league/guild_lines.js');
if (/api\([^)]*lines?\b/.test(ui)) bad.push('ui/guild.js asks the server for the line');
const src = readFileSync(new URL('../league/guild_lines.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/^\s*import\s[^;]*from\s+['"](?!\.\/(guild_night|player_stats)\.js)/m.test(src)) bad.push('guild_lines.js imports something else');
if (/Math\.random|\bDate\b|\bfetch\s*\(|XMLHttpRequest|WebSocket/.test(src)) bad.push('guild_lines.js uses randomness, the clock or the network');
if (bad.length) { console.error('guild_lines FAIL\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('guild_lines: ok');
