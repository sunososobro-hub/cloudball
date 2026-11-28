/* Guild power summary (#800 part 4, league/guild_power.js + ui/guild.js). Fixed fixtures, no network. Fails when
 *   - a guild with no members does not read as its base team's 一軍 (投球 / 打擊 / 守備 are the means of league/ratings.js numbers);
 *   - a strong member does not raise his side (a 99 batter -> 打擊, a 99 SP -> 投球) and a weak one does not lower it, or 守備 moves for a pitcher;
 *   - a number leaves 1..100, the same input gives another answer, or guildPower edits the roster or the guild it was given;
 *   - the module imports anything but ratings.js and guild_roster.js, or uses Math.random, Date or the network;
 *   - ui/guild.js does not show the numbers from this module (it must not recompute them) or calls the server for them.
 * Usage: node tests/guild_power.check.mjs */
import { readFileSync } from 'node:fs';
import { siteRoster } from '../league/site_roster.js';
import { ratingsOf } from '../league/ratings.js';
import { guildPower, DEF_ARM_SHARE } from '../league/guild_power.js';

const bad = [], eq = (a, b, m) => { if (a !== b) bad.push(`${m}: got ${a}, expected ${b}`); };
const players = JSON.parse(readFileSync(new URL('../league/site/players.json', import.meta.url), 'utf8'));
const base = siteRoster(players, 'owls', 1), baseJson = JSON.stringify(base);
const mem = (name, kind, ovr, pos) => ({ leader: false, coach: false, player: { name, kind, ovr, pos } });
const guild = ms => ({ id: 'aaaaaaaaaaaa', name: '甲', base: 'owls', members: ms });

const mean = a => a.reduce((s, x) => s + x, 0) / a.length;
const bats = base.bat.map(p => ratingsOf(p)), pits = base.pit.map(p => ratingsOf(p));
const want = { pit: Math.round(mean(pits.map(r => r.ovr))), bat: Math.round(mean(bats.map(r => (r.con + r.pow + r.eye) / 3))),
  def: Math.round(mean(bats.map(r => DEF_ARM_SHARE * r.arm + (1 - DEF_ARM_SHARE) * 62))) };
const empty = guildPower(guild([]), base);
for (const k of ['pit', 'bat', 'def']) eq(empty[k], want[k], `empty guild ${k}`);

const gJson = JSON.stringify(guild([mem('強打', 'bat', 99, base.bat[0].pos)]));
const hi = guildPower(JSON.parse(gJson), base);
if (!(hi.bat > empty.bat)) bad.push(`a 99 batter did not raise 打擊 (${empty.bat} -> ${hi.bat})`);
eq(hi.pit, empty.pit, 'a batter moved 投球');
const ace = guildPower(guild([mem('王牌', 'pit', 99, 'SP')]), base);
if (!(ace.pit > empty.pit)) bad.push(`a 99 SP did not raise 投球 (${empty.pit} -> ${ace.pit})`);
eq(ace.bat, empty.bat, 'a pitcher moved 打擊'); eq(ace.def, empty.def, 'a pitcher moved 守備');
const weak = guildPower(guild([mem('弱棒', 'bat', 1, base.bat[0].pos)]), base);
if (!(weak.bat < empty.bat)) bad.push(`a 1 batter did not lower 打擊 (${empty.bat} -> ${weak.bat})`);
for (const p of [empty, hi, ace, weak]) for (const k of ['pit', 'bat', 'def', 'all']) if (!Number.isInteger(p[k]) || p[k] < 1 || p[k] > 100) bad.push(`${k} out of 1..100: ${p[k]}`);
eq(JSON.stringify(guildPower(JSON.parse(gJson), base)), JSON.stringify(hi), 'same input, other answer');
eq(JSON.stringify(base), baseJson, 'the base roster was edited');

const src = readFileSync(new URL('../league/guild_power.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
for (const m of src.matchAll(/from '([^']+)'/g)) if (!['./ratings.js', './guild_roster.js'].includes(m[1])) bad.push(`guild_power.js imports ${m[1]}`);
if (/Math\.random|Date|fetch\(|XMLHttp/.test(src)) bad.push('guild_power.js uses randomness, the clock or the network');
const ui = readFileSync(new URL('../ui/guild.js', import.meta.url), 'utf8');
if (!ui.includes("from '../league/guild_power.js'") || !ui.includes('guildPower(')) bad.push('ui/guild.js does not take the numbers from league/guild_power.js');
if (/api\([^)]*power/i.test(ui)) bad.push('ui/guild.js asks the server for the power');

if (bad.length) { console.error('guild_power.check FAILED:\n- ' + bad.join('\n- ')); process.exit(1); }
console.log('guild_power.check ok');
