/* Scheduled guild games, pure core (#809 part 1): league/guild_night.js with a hand-made export of 3 guilds and a fake `play`.
 * Fails when
 *   - the same inputs give different bytes (run twice), or the input order of the guilds changes the output;
 *   - a night's pairings repeat a guild, or a full cycle does not meet every pair;
 *   - a file path is outside league/site/guilds/, a lines file is outside the LINE_SHARDS range, or a shard index is not in 0..LINE_SHARDS-1;
 *   - 30 nights of 3 guilds with 12 players write more than LINE_SHARDS lines files (no file grows per fan beyond its shard);
 *   - the standings do not add up to the games played, or a game is tied;
 *   - an agent id or other private field of the export reaches a file.
 * Usage: node tests/guild_night.check.mjs */
import * as G from '../league/guild_night.js';

const problems = [], bad = m => problems.push(m);
const guild = (id, n) => ({ id, name: `隊${id}`, base: 'x', agent: 'SECRET-' + id, settings: { shift: n },
  members: Array.from({ length: 4 }, (_, i) => ({ leader: i === 0, coach: i === 0, agent_id: 'SECRET-' + id + i, player: { name: `${id}-p${i}`, kind: 'bat', ovr: 50 + i, pos: 'C' } })) });
const exp = { guilds: [guild('b', 1), guild('c', 2), guild('a', 3)] };
/* a fake engine: score and lines are a pure function of the seed, so the check needs no engine */
const play = (seed, { teams }) => {
  const a = seed % 7, h = (seed >>> 3) % 7;
  const players = teams.map(t => Object.fromEntries(t.members.map((m, i) => [m.player.name, { pa: 4, ab: 3, h: (seed + i) % 3, d: 0, t: 0, hr: i === 0 ? seed % 2 : 0, bb: 1, hbp: 0, sf: 0 }])));
  return { score: [a, h === a ? h + 1 : h], players };
};
const rosterOf = g => g;

const run = (e, nights, season = 1) => {
  let prev = {}, all = {};
  for (let n = 0; n < nights; n++) {
    const date = new Date(Date.UTC(2026, 11, 1 + n)).toISOString().slice(0, 10);
    const files = G.guildNight({ exp: e, date, commit: 'abc1234', season, night: n, prev, play, rosterOf });
    Object.assign(all, files);
    const st = JSON.parse(files[`${G.GUILD_DIR}/standings.json`]);
    const lines = { ...(prev.lines || {}) };
    for (const [p, t] of Object.entries(files)) { const m = /lines\/\d+\/(\d{3})\.json$/.exec(p); if (m) lines[Number(m[1])] = JSON.parse(t); }
    prev = { standings: st, lines };
  }
  return all;
};
const a = run(exp, 30), b = run(exp, 30), c = run({ guilds: exp.guilds.slice().reverse() }, 30);
const keys = Object.keys(a);
if (keys.join() !== Object.keys(b).join() || keys.some(k => a[k] !== b[k])) bad('same inputs gave different bytes');
if (keys.some(k => a[k] !== c[k])) bad('guild input order changed the output');

for (const p of keys) {
  if (!p.startsWith(G.GUILD_DIR + '/')) bad(`file outside ${G.GUILD_DIR}: ${p}`);
  const m = /lines\/\d+\/(\d{3})\.json$/.exec(p);
  if (m && Number(m[1]) >= G.LINE_SHARDS) bad(`shard ${m[1]} is out of range`);
}
const lineFiles = keys.filter(p => p.includes('/lines/')).length;
if (lineFiles > G.LINE_SHARDS) bad(`${lineFiles} lines files, more than ${G.LINE_SHARDS}`);
if (/SECRET|agent/.test(Object.values(a).join('\n'))) bad('a private field reached a file');

const st = JSON.parse(a[`${G.GUILD_DIR}/standings.json`]);
const wins = st.rank.reduce((s, r) => s + r.w, 0), losses = st.rank.reduce((s, r) => s + r.l, 0);
if (wins !== losses || wins !== st.games.length) bad(`standings do not add up: ${wins} W, ${losses} L, ${st.games.length} games`);
if (st.games.some(g => g.homeRuns === g.awayRuns)) bad('a tied game');
if (st.games.length !== 30) bad(`3 guilds, 30 nights = 30 games (one bye each night), got ${st.games.length}`);

/* pairings: no guild twice a night; even count plays everyone; a full cycle meets every pair */
for (const ids of [['a', 'b', 'c'], ['a', 'b', 'c', 'd'], ['a', 'b', 'c', 'd', 'e', 'f']]) {
  const seen = new Set(), cycle = ids.length % 2 ? ids.length : ids.length - 1;
  for (let n = 0; n < cycle; n++) {
    const f = G.fixtures(ids, n), used = f.flatMap(g => [g.home, g.away]);
    if (new Set(used).size !== used.length) bad(`${ids.length} guilds night ${n}: a guild plays twice`);
    if (ids.length % 2 === 0 && used.length !== ids.length) bad(`${ids.length} guilds night ${n}: not everyone plays`);
    for (const g of f) seen.add([g.home, g.away].sort().join());
  }
  if (seen.size !== ids.length * (ids.length - 1) / 2) bad(`${ids.length} guilds: a cycle met ${seen.size} pairs`);
}
if (G.fixtures(['a'], 0).length) bad('one guild has no game');

if (problems.length) { console.log('FAIL guild_night:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`ok guild_night: 30 nights, ${keys.length} files, ${lineFiles} lines files of ${G.LINE_SHARDS} shards, byte-identical twice`);
