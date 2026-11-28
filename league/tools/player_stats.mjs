/* Builds league/site/player_stats.json (#804 part 1): every recorded 試跑 game (一軍 league/site/trial_games.json, 二軍 farm_games.json)
 * is played again with the engine, the score is checked against the record, and each batter's box line becomes one row.
 *
 *   node league/tools/player_stats.mjs [--engine <checkout dir>] [--write]      prints the size; --write replaces league/site/player_stats.json
 * --engine = a checkout of the commit the data files name (git worktree add <dir> <commit>); default = this checkout.
 *
 * Hand-run, engine only, no network. A game whose replay score differs from its record stops the run (the data was made with
 * another engine commit: regenerate the games first). Nothing here edits a stat (rule 10). Nothing is written to cloudball-league. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { COLS, PCOLS } from '../player_stats.js';

const site = n => fileURLToPath(new URL(`../site/${n}`, import.meta.url));
export const OUT = site('player_stats.json');
const block = m => `{\n${Object.keys(m).sort().map(id => `  ${JSON.stringify(id)}:${JSON.stringify(m[id])}`).join(',\n')}\n}`;
export const serialize = f => JSON.stringify({ ...f, players: {}, pitchers: {} }).replace('"players":{}', `"players":${block(f.players)}`).replace('"pitchers":{}', `"pitchers":${block(f.pitchers)}`) + '\n';

/* one game's pitching rows: { <pitcher name>: [bf, outs, k, bb, r] } per side (side = the DEFENDING team). Runs and outs go to the pitcher on the mound. */
export function pitchingFromStream(stream) {
  const out = [{}, {}], on = [null, null], row = (side, n) => out[side][n] || (out[side][n] = [0, 0, 0, 0, 0]);
  for (const x of stream) {
    const d = x.team == null ? null : 1 - x.team;
    if (x.type === 'game_start') x.starters.forEach((n, side) => { on[side] = n; row(side, n); });
    else if (x.type === 'substitution' && x.role === 'pitcher') { on[x.team] = x.in; row(x.team, x.in); }
    else if (x.type === 'pa_end') { const r = row(d, x.pitcher); on[d] = x.pitcher; r[0]++; if (x.result === 'strikeout') r[2]++; if (x.result === 'walk' || x.result === 'intentional_walk') r[3]++; }
    else if (x.type === 'out' && on[d]) row(d, on[d])[1]++;
    else if (x.type === 'run_scored' && on[d]) row(d, on[d])[4]++;
  }
  return out;
}

const seasonOfDay = (seasons, day) => (seasons.filter(s => s.firstDay <= day).pop() || seasons[0]).n;

/* trial = trial_games.json, farm = farm_games.json (array), seasonFile = season.json (the season of a 二軍 night) */
export function build({ trial, farm, seasonFile, engine }) {
  const { simGame, boxFromStream } = engine;
  const players = {}, pitchers = {}, games = [];
  for (const g of trial.games) games.push({ season: g.season, day: g.day, seed: g.seed, score: g.score, teams: g.teams, opts: { starters: g.sp, rosters: trial.seasons[g.season - 1].rosters }, where: `一軍 ${g.day}-${g.slot}` });
  for (const r of farm) if (r.trial === true && r.opts && r.opts.rosters) games.push({ season: seasonOfDay(seasonFile.seasons, r.day), day: r.day, seed: r.seed, score: r.result.score, teams: r.teams, opts: r.opts, where: `二軍 ${r.id}` });
  for (const g of games) {
    const stream = simGame(g.seed, {}, { teams: g.teams, ...g.opts }).stream, box = boxFromStream(stream), pitching = pitchingFromStream(stream);
    if (box.score[0] !== g.score[0] || box.score[1] !== g.score[1]) throw new Error(`${g.where}: replay ${box.score} differs from the record ${g.score}`);
    g.teams.forEach((t, side) => {
      const pit = Object.fromEntries(g.opts.rosters[t].pit.map(p => [p.name, p.id]));
      for (const [name, v] of Object.entries(pitching[side])) {
        if (!pit[name]) throw new Error(`${g.where}: pitcher ${name} is not on the roster`);
        (pitchers[pit[name]] = pitchers[pit[name]] || []).push([g.season, g.day, ...v]);
      }
      const r = g.opts.rosters[t], ids = Object.fromEntries([...r.bat, ...(r.bench || [])].map(p => [p.name, p.id]));
      for (const [name, b] of Object.entries(box.players[side])) {
        if (!ids[name]) throw new Error(`${g.where}: batter ${name} is not on the roster`);
        (players[ids[name]] = players[ids[name]] || []).push([g.season, g.day, b.pa, b.ab, b.h, b.d, b.t, b.hr, b.bb, b.hbp, b.sf]);
      }
    });
  }
  for (const rows of [...Object.values(players), ...Object.values(pitchers)]) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { trial: true, engine: trial.engine, cols: COLS, pcols: PCOLS, players, pitchers };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rd = n => JSON.parse(readFileSync(site(n), 'utf8'));
  const at = process.argv.indexOf('--engine'), dir = at > 0 ? path.resolve(process.argv[at + 1]) : fileURLToPath(new URL('../..', import.meta.url));
  const engine = await import(pathToFileURL(path.join(dir, 'engine/index.js')).href);
  const text = serialize(build({ trial: rd('trial_games.json'), farm: rd('farm_games.json'), seasonFile: rd('season.json'), engine }));
  console.log(`${Object.keys(JSON.parse(text).players).length} players, ${text.length} bytes`);
  if (process.argv.includes('--write')) { writeFileSync(OUT, text); console.log('wrote league/site/player_stats.json'); }
}
