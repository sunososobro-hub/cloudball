/* Guild power summary (#800 part 4, league/guild_power.js + ui/guild.js). Fixed fixtures, no network. Fails when
 *   - the same inputs give different numbers, or a number leaves 1..100 or is not a whole number;
 *   - a guild with no member reads differently from its base team, or a stronger member does not raise 打擊 (batter) / 投球 (pitcher);
 *   - a batter member moves 投球 or a pitcher member moves 打擊 (members only replace seats of their own kind);
 *   - the base roster passed in is changed;
 *   - ui/guild.js does not show the three numbers from this module, or the module imports anything but ratings.js and guild_roster.js, or uses Math.random, Date or the network.
 * Usage: node tests/guild_power.check.mjs */
import { readFileSync } from 'node:fs';
import { siteRoster } from '../league/site_roster.js';
import { guildPower, rosterPower } from '../league/guild_power.js';

const bad = [], eq = (a, b, m) => { if (a !== b) bad.push(`${m}: got ${a}, expected ${b}`); };
const players = JSON.parse(readFileSync(new URL('../league/site/players.json', import.meta.url), 'utf8'));
const teamId = Object.values(players).find(p => p.tier === 1).team;
const base = siteRoster(players, teamId, 1), before = JSON.stringify(base);
const guild = members => ({ id: 'g1', name: 't', members });
const m = (kind, ovr, pos) => ({ player: { name: `${kind}${ovr}`, kind, ovr, pos } });

const p0 = guildPower(guild([]), base), p1 = guildPower(guild([]), base);
eq(JSON.stringify(p0), JSON.stringify(p1), 'same inputs');
eq(JSON.stringify(p0), JSON.stringify(rosterPower(base)), 'empty guild = base team');
for (const k of ['bat', 'pit', 'def']) eq(Number.isInteger(p0[k]) && p0[k] >= 1 && p0[k] <= 100, true, `${k} is a whole number in 1..100 (${p0[k]})`);

const strongBat = guildPower(guild([m('bat', 99, base.bat[0].pos)]), base), weakBat = guildPower(guild([m('bat', 1, base.bat[0].pos)]), base);
eq(strongBat.bat > weakBat.bat, true, 'a stronger batter raises 打擊');
eq(strongBat.pit, p0.pit, 'a batter does not move 投球');
const strongPit = guildPower(guild([m('pit', 99, 'SP')]), base), weakPit = guildPower(guild([m('pit', 1, 'SP')]), base);
eq(strongPit.pit > weakPit.pit, true, 'a stronger pitcher raises 投球');
eq(strongPit.bat, p0.bat, 'a pitcher does not move 打擊');
eq(JSON.stringify(base), before, 'base roster unchanged');

const ui = readFileSync(new URL('../ui/guild.js', import.meta.url), 'utf8');
if (!ui.includes("from '../league/guild_power.js'") || !ui.includes('guildPower(')) bad.push('ui/guild.js does not show the power from league/guild_power.js');
const src = readFileSync(new URL('../league/guild_power.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const imports = [...src.matchAll(/from '([^']+)'/g)].map(x => x[1]).sort().join();
eq(imports, './guild_roster.js,./ratings.js', 'imports');
if (/Math\.random|Date|fetch\(|localStorage/.test(src)) bad.push('guild_power.js uses randomness, the clock, the network or storage');
if (bad.length) { console.log('guild_power.check FAIL\n  ' + bad.join('\n  ')); process.exit(1); }
console.log(`guild_power.check ok (base ${p0.bat}/${p0.pit}/${p0.def})`);
