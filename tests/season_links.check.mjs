/* 試跑 panel replay links resolve (#743 part 5, plain Node). For every date from the day before the start to the day after
 * the last night of league/site/season.json, the 首頁 panel is drawn from the real site files and every replay link in it
 * must open a game: `play.html?t=<night>-<slot>` -> trialRecord(trial_games.json) with the same teams and score as the row,
 * `play.html?f=<id>` -> a farm_games.json record with no farmProblem. Fails on a link that opens nothing, or on a night
 * with results but no 一軍 link (Acceptance: "every replay link opens").
 * Usage: node tests/season_links.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)));
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));
const { trialPanel } = await imp('ui/site/home.js');
const { combine } = await imp('ui/site/shared.js');
const { DATA_FILES } = await imp('ui/site-data.js');
const { trialRecord, TRIAL_GAMES_FILE } = await imp('league/trial_games.js');
const { findFarm, farmProblem } = await imp('league/farm.js');
const { TEAMS } = await imp('league/teams.js');

const problems = [], bad = s => problems.push(s);
const d = combine(Object.fromEntries(Object.entries(DATA_FILES).map(([k, p]) => [k, json(p)])));
const trialGames = json(TRIAL_GAMES_FILE);
const ixOf = id => TEAMS.findIndex(t => t.id === id);
const addDays = (iso, n) => { const t = new Date(iso + 'T00:00:00Z'); t.setUTCDate(t.getUTCDate() + n); return t.toISOString().slice(0, 10); };

let tLinks = 0, fLinks = 0;
for (let k = -1; k <= d.trial.nights.length + 1; k++) {
  const today = addDays(d.trial.start, k), html = trialPanel({ ...d, today, hour: 12 });
  const rows = [...html.matchAll(/<li>(.*?)<\/li>/g)].map(m => m[1]).filter(r => r.includes('class="num"'));
  if (rows.length && !html.includes('?t=')) bad(`${today}: results shown with no 一軍 replay link`);
  for (const m of html.matchAll(/href="play\.html\?t=([^"]+)"/g)) {
    tLinks++;
    const rec = trialRecord(trialGames, m[1]), [day, slot] = m[1].split('-').map(Number), g = d.trial.nights[day] && d.trial.nights[day].games[slot];
    if (!rec) { bad(`${today}: ?t=${m[1]} opens no 試跑 game`); continue; }
    if (!g || rec.teams[0] !== ixOf(g.away) || rec.teams[1] !== ixOf(g.home) || JSON.stringify(rec.result.score) !== JSON.stringify(g.score))
      bad(`${today}: ?t=${m[1]} opens teams ${rec.teams} ${rec.result.score}, the row shows ${g && `${g.away}-${g.home} ${g.score}`}`);
  }
  for (const m of html.matchAll(/href="play\.html\?f=([^"]+)"/g)) {
    fLinks++;
    const r = findFarm(d.farm, decodeURIComponent(m[1]));
    if (!r || farmProblem(r)) bad(`${today}: ?f=${m[1]} opens no 二軍 record (${r ? farmProblem(r) : 'missing'})`);
  }
}
if (tLinks === 0) bad('no 一軍 replay link drawn on any date: the check would pass on nothing');

if (problems.length) { console.error(`season_links: ${problems.length} problem(s)\n  ` + problems.slice(0, 20).join('\n  ')); process.exit(1); }
console.log(`season_links: ok (${d.trial.nights.length + 3} dates, ${tLinks} 一軍 and ${fLinks} 二軍 replay links open a game)`);
