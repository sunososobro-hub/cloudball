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
import { COLS } from '../player_stats.js';

const site = n => fileURLToPath(new URL(`../site/${n}`, import.meta.url));
export const OUT = site('player_stats.json');
export const serialize = f => JSON.stringify({ ...f, players: {} }).replace('"players":{}', `"players":{\n${Object.keys(f.players).sort().map(id => `  ${JSON.stringify(id)}:${JSON.stringify(f.players[id])}`).join(',\n')}\n}`) + '\n';

const seasonOfDay = (seasons, day) => (seasons.filter(s => s.firstDay <= day).pop() || seasons[0]).n;

/* trial = trial_games.json, farm = farm_games.json (array), seasonFile = season.json (the season of a 二軍 night) */
export function build({ trial, farm, seasonFile, engine }) {
  const { simGame, boxFromStream } = engine;
  const players = {}, games = [];
  for (const g of trial.games) games.push({ season: g.season, day: g.day, seed: g.seed, score: g.score, teams: g.teams, opts: { starters: g.sp, rosters: trial.seasons[g.season - 1].rosters }, where: `一軍 ${g.day}-${g.slot}` });
  for (const r of farm) if (r.trial === true && r.opts && r.opts.rosters) games.push({ season: seasonOfDay(seasonFile.seasons, r.day), day: r.day, seed: r.seed, score: r.result.score, teams: r.teams, opts: r.opts, where: `二軍 ${r.id}` });
  for (const g of games) {
    const box = boxFromStream(simGame(g.seed, {}, { teams: g.teams, ...g.opts }).stream);
    if (box.score[0] !== g.score[0] || box.score[1] !== g.score[1]) throw new Error(`${g.where}: replay ${box.score} differs from the record ${g.score}`);
    g.teams.forEach((t, side) => {
      const r = g.opts.rosters[t], ids = Object.fromEntries([...r.bat, ...(r.bench || [])].map(p => [p.name, p.id]));
      for (const [name, b] of Object.entries(box.players[side])) {
        if (!ids[name]) throw new Error(`${g.where}: batter ${name} is not on the roster`);
        (players[ids[name]] = players[ids[name]] || []).push([g.season, g.day, b.pa, b.ab, b.h, b.d, b.t, b.hr, b.bb, b.hbp, b.sf]);
      }
    });
  }
  for (const rows of Object.values(players)) rows.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return { trial: true, engine: trial.engine, cols: COLS, players };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const rd = n => JSON.parse(readFileSync(site(n), 'utf8'));
  const at = process.argv.indexOf('--engine'), dir = at > 0 ? path.resolve(process.argv[at + 1]) : fileURLToPath(new URL('../..', import.meta.url));
  const engine = await import(pathToFileURL(path.join(dir, 'engine/index.js')).href);
  const text = serialize(build({ trial: rd('trial_games.json'), farm: rd('farm_games.json'), seasonFile: rd('season.json'), engine }));
  console.log(`${Object.keys(JSON.parse(text).players).length} players, ${text.length} bytes`);
  if (process.argv.includes('--write')) { writeFileSync(OUT, text); console.log('wrote league/site/player_stats.json'); }
}
