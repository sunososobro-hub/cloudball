/* 看他的打席 check (#804 part 8, plain Node). Plays the shipped 一軍 試跑 record 1-0 (and the first 二軍 record) with this
 * checkout's engine and the record's own rosters (the score may differ from the record: its engine is a pinned commit), then fails when
 *   - a lineup batter's PA starts (render/pa_start.js) are not one per `pa_end` of his name and team in the stream, or not in game order,
 *   - a start frame is not a pitch to him, or its seek time is not PA_LEAD_S before that pitch,
 *   - a starting pitcher's first start is not his first pitch, or a bad / unknown id gives a jump,
 *   - the game is changed by the lookup (rule 10). The 我的球員 `&p=<id>` links: tests/player_stats.check.mjs.
 * Usage: node tests/pa_start.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = p => import(pathToFileURL(path.join(ROOT, p)));
const E = await imp('engine/index.js');
const PS = await imp('render/pa_start.js');
const { lineupsByFrame } = await imp('render/lineup.js');
const TG = await imp('league/trial_games.js');
const problems = [], bad = s => problems.push(s);
const eq = (a, b, what) => { if (a !== b) bad(`${what}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`); };
const json = p => JSON.parse(readFileSync(path.join(ROOT, p), 'utf8'));

const recs = [TG.trialRecord(json(TG.TRIAL_GAMES_FILE), '1-0'), json('league/site/farm_games.json').find(r => r && r.opts && Array.isArray(r.opts.rosters))];
let checked = 0;
for (const rec of recs) {
  if (!rec) { bad('no shipped record to replay'); continue; }
  const T = rec.teams || [0, 1], R = T.map(t => rec.opts.rosters[t]), A = rec.opts.rosters, g = E.simGame(rec.seed, rec.decisions || {}, { ...rec.opts, teams: rec.teams || [0, 1] });
  const before = JSON.stringify(g.ev), L = lineupsByFrame(g.ev, g.stream, R);
  for (const t of [0, 1]) for (const b of (R[t] && R[t].bat) || []) {
    const s = PS.paStarts(g, A, b.id, T), ends = g.stream.filter(x => x.type === 'pa_end' && x.team === t && x.batter === b.name).length;
    eq(s.length, ends, `${rec.seed} ${b.id}: PA starts = his pa_end events`); checked++;
    s.forEach((x, k) => { const e = g.ev[x.i];
      if (!e || e.k !== 'P' || !L.batterOf(e) || L.batterOf(e).id !== b.id) bad(`${b.id}: start ${k} is not a pitch to him`);
      else eq(x.t, Math.max(0, e.t - PS.PA_LEAD_S), `${b.id}: start ${k} seek time`);
      if (k && s[k - 1].i >= x.i) bad(`${b.id}: starts out of order`); });
  }
  for (const t of [0, 1]) { if (!R[t]) continue; const first = g.ev.find(e => e.k === 'P' && e.pit && e.pit[0] === t), sp = first && R[t].pit[first.pit[1]];
    if (!sp) { bad(`${rec.seed}: no starting pitcher for team ${t}`); continue; }
    const j = PS.paJump(g, A, sp.id, T); if (!j || g.ev[j.i] !== first) bad(`${sp.id}: pitcher jump is not his first pitch`);
    else if (!j.note.includes('投球')) bad(`${sp.id}: pitcher note`); }
  const b0 = (R[0] || R[1]).bat[0], j0 = PS.paJump(g, A, b0.id, T);
  if (!j0 || !j0.note.includes(`共 ${j0.n} 個`)) bad('batter jump note');
  for (const id of ['nobody-here', 'bad id!', '', null]) if (PS.paJump(g, A, id, T)) bad(`id ${JSON.stringify(id)} gave a jump`);
  eq(PS.paStarts(g, null, b0.id, T).length, 0, 'no rosters gives no starts');
  eq(JSON.stringify(g.ev), before, `${rec.seed}: the lookup changed the game`);
}
if (checked < 18) bad(`only ${checked} batters checked`);
eq(PS.paLink('play.html?t=1-0', 'fa-x1'), 'play.html?t=1-0&p=fa-x1', 'link on a replay url');
eq(PS.paLink('play.html', 'a b'), 'play.html?p=a%20b', 'link encodes the id');

if (problems.length) { console.error(`pa_start: ${problems.length} problem(s)\n` + problems.join('\n')); process.exit(1); }
console.log(`pa_start: ok (${checked} batters, ${recs.length} games)`);
