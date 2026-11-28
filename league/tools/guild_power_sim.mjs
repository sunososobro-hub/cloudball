/* Does the guild power number mean anything? (#800 part 4). Hand-run, seeded, engine only, no network, prints only.
 *
 *   node league/tools/guild_power_sim.mjs [--guilds N] [--games N]
 *
 * GUILDS seeded guilds, spread over the four base teams (league/site_roster.js, 一軍). Each has 0..MAX_MEMBERS members, a member
 * being { kind, pos, ovr } with ovr drawn between OVR_LO and OVR_HI (league/guild_roster.js turns him into a flat-profile player on
 * the seat he takes). Every guild plays GAMES games, half home, half away, against every guild of ANOTHER base team (same-base
 * pairs are skipped: both sides would share player names), so the win rate is over the same opposition mix.
 * Prints per guild: power (pit / bat / def / all from league/guild_power.js), win rate, run difference per game; then the Pearson
 * correlation of win rate with each of the four numbers, and the win rate of the top third against the bottom third by `all`.
 * Reported, never tuned (rule 10: the number is display only and changes no result). */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { simGame, boxFromStream, TEAMS } from '../../engine/index.js';
import { siteRoster } from '../site_roster.js';
import { guildRoster } from '../guild_roster.js';
import { guildPower } from '../guild_power.js';

export const SIM_SEED = 800, GUILDS = 24, GAMES = 4, MAX_MEMBERS = 9, OVR_LO = 35, OVR_HI = 95;
export const BASES = TEAMS.map(t => t.id);   /* the engine indexes teams and rosters by this order */
const BAT_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const rng = seed => () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const mix = (...n) => n.reduce((h, x) => Math.imul(h ^ (x >>> 0), 0x9e3779b1) >>> 0, 0x811c9dc5);

export function makeGuilds(players, count = GUILDS, seed = SIM_SEED) {
  const r = rng(seed), base = Object.fromEntries(BASES.map(b => [b, siteRoster(players, b, 1)]));
  return Array.from({ length: count }, (_, i) => {
    const b = BASES[i % BASES.length], n = Math.floor(r() * (MAX_MEMBERS + 1)), bias = r();   /* bias: a whole guild leaning weak or strong */
    const members = Array.from({ length: n }, (_, k) => {
      const kind = r() < 0.5 ? 'pit' : 'bat', ovr = Math.round(OVR_LO + (OVR_HI - OVR_LO) * Math.min(1, Math.max(0, 0.5 * bias + 0.5 * r())));
      return { player: { name: `G${i}M${k}`, kind, ovr, pos: kind === 'pit' ? (r() < 0.5 ? 'SP' : 'RP') : BAT_POS[Math.floor(r() * BAT_POS.length)] } };
    });
    const guild = { id: `sim${String(i).padStart(8, '0')}`, name: `G${i}`, base: b, members };
    return { guild, base: b, power: guildPower(guild, base[b]), roster: guildRoster(guild, base[b]).roster };
  });
}

export function pearson(xs, ys) {
  const n = xs.length, mx = xs.reduce((s, x) => s + x, 0) / n, my = ys.reduce((s, x) => s + x, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : NaN;
}

export function run({ guilds = GUILDS, games = GAMES, log = console.log } = {}) {
  const players = JSON.parse(readFileSync(new URL('../site/players.json', import.meta.url), 'utf8'));
  const gs = makeGuilds(players, guilds), st = gs.map(() => ({ w: 0, g: 0, d: 0 }));
  let n = 0;
  for (let a = 0; a < gs.length; a++) for (let b = a + 1; b < gs.length; b++) {
    if (gs[a].base === gs[b].base) continue;
    for (let k = 0; k < games; k++) {
      const [h, v] = k % 2 ? [b, a] : [a, b], rosters = BASES.map(() => null), teams = [BASES.indexOf(gs[h].base), BASES.indexOf(gs[v].base)];
      rosters[teams[0]] = gs[h].roster; rosters[teams[1]] = gs[v].roster;
      const g = simGame(mix(SIM_SEED, a, b, k, n++), {}, { rosters, teams }), [x, y] = boxFromStream(g.stream).score;
      st[h].g++; st[v].g++; st[h].d += x - y; st[v].d += y - x;
      if (x !== y) st[x > y ? h : v].w++;
    }
  }
  const win = st.map(s => (s.g ? s.w / s.g : NaN)), out = { games: n, corr: {} };
  log(`guild  base       n   pit bat def all   win%   run diff/game`);
  gs.forEach((g, i) => log(`${String(i).padStart(5)}  ${g.base.padEnd(10)} ${String(g.guild.members.length).padStart(2)}  ${[g.power.pit, g.power.bat, g.power.def, g.power.all].map(x => String(x).padStart(3)).join(' ')}   ${(100 * win[i]).toFixed(0).padStart(3)}%   ${(st[i].d / st[i].g).toFixed(2)}`));
  for (const key of ['pit', 'bat', 'def', 'all']) out.corr[key] = pearson(gs.map(g => g.power[key]), win);
  const order = gs.map((_, i) => i).sort((p, q) => gs[q].power.all - gs[p].power.all || p - q), third = Math.floor(gs.length / 3);
  const avg = ix => ix.reduce((s, i) => s + win[i], 0) / ix.length;
  out.top = avg(order.slice(0, third)); out.bottom = avg(order.slice(-third));
  log(`games ${n}; correlation of win rate with power: ${Object.entries(out.corr).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(', ')}`);
  log(`top third by all: win ${(100 * out.top).toFixed(0)}%, bottom third: win ${(100 * out.bottom).toFixed(0)}%`);
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? Number(process.argv[i + 1]) : undefined; };
  run({ guilds: arg('--guilds') || GUILDS, games: arg('--games') || GAMES });
}
