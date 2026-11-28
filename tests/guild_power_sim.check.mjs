/* Guild power vs win rate tool (#800 part 4, league/tools/guild_power_sim.mjs). Fixed seed, engine only, no network. Fails when
 *   - the same seed does not give the same guilds and the same report (the tool must be deterministic);
 *   - a guild's power is not the one league/guild_power.js gives for its roster, or a number leaves 1..100;
 *   - pearson() is wrong on a line, an inverted line or a constant;
 *   - the tool plays two guilds of one base team, or a guild plays no game, or the tool uses Math.random, Date or the network;
 *   - the tool tunes anything: it imports no file but the engine index and league modules, and writes no file.
 * It does NOT require power to predict wins (the number is display only, rule 10): the correlation is reported by the tool, not asserted.
 * Usage: node tests/guild_power_sim.check.mjs */
import { readFileSync } from 'node:fs';
import { makeGuilds, pearson, run, BASES } from '../league/tools/guild_power_sim.mjs';
import { guildPower } from '../league/guild_power.js';
import { siteRoster } from '../league/site_roster.js';

const bad = [], players = JSON.parse(readFileSync(new URL('../league/site/players.json', import.meta.url), 'utf8'));
const a = makeGuilds(players, 8, 5), b = makeGuilds(players, 8, 5), c = makeGuilds(players, 8, 6);
if (JSON.stringify(a) !== JSON.stringify(b)) bad.push('same seed gave other guilds');
if (JSON.stringify(a) === JSON.stringify(c)) bad.push('another seed gave the same guilds');
a.forEach((g, i) => {
  const want = guildPower(g.guild, siteRoster(players, g.base, 1));
  if (JSON.stringify(want) !== JSON.stringify(g.power)) bad.push(`guild ${i}: power differs from guildPower`);
  for (const k of ['pit', 'bat', 'def', 'all']) if (!(g.power[k] >= 1 && g.power[k] <= 100)) bad.push(`guild ${i}: ${k} ${g.power[k]} outside 1..100`);
  if (!BASES.includes(g.base)) bad.push(`guild ${i}: unknown base ${g.base}`);
});
const near = (x, y) => Math.abs(x - y) < 1e-9;
if (!near(pearson([1, 2, 3, 4], [2, 4, 6, 8]), 1)) bad.push('pearson of a line is not 1');
if (!near(pearson([1, 2, 3, 4], [8, 6, 4, 2]), -1)) bad.push('pearson of an inverted line is not -1');
if (!Number.isNaN(pearson([1, 2, 3], [5, 5, 5]))) bad.push('pearson of a constant is not NaN');

const lines1 = [], lines2 = [];
const o1 = run({ guilds: 8, games: 2, log: s => lines1.push(s) }), o2 = run({ guilds: 8, games: 2, log: s => lines2.push(s) });
if (lines1.join('\n') !== lines2.join('\n')) bad.push('the report changed between two runs');
if (!(o1.games > 0)) bad.push('no game was played');
if (lines1.length < 8 + 3) bad.push('the report has no row per guild');
if (!Object.values(o1.corr).every(Number.isFinite)) bad.push('a correlation is not a number');
if (!(o1.top >= 0 && o1.top <= 1 && o1.bottom >= 0 && o1.bottom <= 1)) bad.push('a win rate left 0..1');

const src = readFileSync(new URL('../league/tools/guild_power_sim.mjs', import.meta.url), 'utf8');
if (/Math\.random|Date\.now|new Date|fetch\(|XMLHttpRequest|writeFile/.test(src)) bad.push('the tool uses randomness from outside, the clock, the network or writes a file');
const imports = [...src.matchAll(/^import .* from '([^']+)'/gm)].map(m => m[1]).filter(x => x.startsWith('.'));
for (const i of imports) if (!/^\.\.\/(\.\.\/engine\/index\.js|site_roster\.js|guild_roster\.js|guild_power\.js)$/.test(i)) bad.push(`unexpected import ${i}`);

if (bad.length) { console.error('FAIL guild_power_sim.check\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`ok guild_power_sim.check (${o1.games} games, 8 guilds)`);
