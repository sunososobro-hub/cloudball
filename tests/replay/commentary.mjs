/* Commentary checks (plain Node):
 *   - the fallback bank is well formed and uses only known slots and triggers
 *   - gag wiring is valid (validateBank returns no problems)
 *   - a draft never leaves a slot unfilled and is deterministic
 *   - causality: a line bound to event i is identical when the booth is only shown events 0..i
 *     (so it cannot be talking about something that has not happened yet)
 *   - drafting commentary does not change the game
 *   - every registered per-game script is valid for the game it names
 *   - fan guest moments (bank.fan) use known slots ({guest} allowed there only), and the fan's
 *     share of all drafted lines stays within FAN_SHARE over the sample (target about one in five)
 *   - the tension index, banter score, recorded audio and clip-bank checks (commentary/tension.check.mjs,
 *     banter.check.mjs, audio.check.mjs, clips.check.mjs) pass; they run as child processes so CI covers them
 * Usage: node tests/replay/commentary.mjs */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, TEAMS } from '../../engine/index.js';
import { parseRecording } from '../../league/recording.js';
import { createBooth, draftFromBank, validateScript, validateBank, SPEAKERS } from '../../commentary/player.js';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../commentary');
const GAMES = Number(process.env.GAMES || 60);
const KNOWN_SLOTS = new Set(['desc', 'batter', 'pitcher', 'runner', 'team', 'fieldTeam', 'away', 'home', 'inning', 'half', 'outs', 'awayScore', 'homeScore', 'margin', 'leadTeam', 'tied', 'runs', 'halfRuns',
  'lastInningRuns', 'hadLastInning', 'batterPa', 'batterAb', 'batterHits', 'batterKToday', 'batterHrToday', 'batterPrev', 'hasPrev', 'pitcherK', 'pitchCount',
  'manager', 'pitchingCoach', 'homeManager', 'managerName', 'managerLine', 'plateUmp', 'plateUmpLine', 'count', 'pitchType', 'pos', 'bases']);
const KNOWN_TRIGGERS = new Set(['game_start', 'batter_up', 'two_strikes', 'full_count', 'stolen_base', 'caught_stealing', 'run_scores', 'pitching_change', 'fan_decision', 'half_end', 'walkoff', 'game_end',
  'strikeout', 'walk', 'intentional_walk', 'hit_by_pitch', 'single', 'infield_single', 'bunt_single', 'double', 'triple', 'home_run', 'groundout', 'flyout', 'lineout', 'popout', 'double_play', 'fielders_choice', 'sac_bunt', 'sac_fly', 'error',
  'wild_pitch', 'passed_ball', 'balk', 'pickoff_safe', 'catcher_visit', 'pickoff_out', 'pickoff_rundown', 'catcher_interference', 'triple_play']);
const FAN_SLOTS = new Set([...KNOWN_SLOTS, 'guest']);
const FAN_SHARE = { min: 0.10, max: 0.30 };
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };

const bank = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8'));
let exchanges = 0, paired = 0, neverSilent = 0;
for (const [name, T] of Object.entries(bank.triggers)) {
  if (!KNOWN_TRIGGERS.has(name)) bad(`bank: unknown trigger "${name}"`);
  if (!(T.silence >= 0 && T.silence <= 1)) bad(`bank: ${name} needs a silence probability`);
  if (!T.silence && (T.priority || 0) < 1) neverSilent++;
  for (const ex of T.exchanges || []) {
    exchanges++; if (ex.response) paired++;
    if (!ex.call) bad(`bank: ${name} has an exchange without a call`);
    for (const text of [ex.call, ex.response]) for (const m of (text || '').matchAll(/\{(\w+)\}/g)) if (!KNOWN_SLOTS.has(m[1])) bad(`bank: ${name} uses unknown slot {${m[1]}}`);
    for (const k of Object.keys(ex.when || {})) if (!KNOWN_SLOTS.has(k)) bad(`bank: ${name} has a condition on unknown slot "${k}"`);
  }
}
let fanMoments = 0, fanTexts = 0;
for (const [i, F] of (bank.fan || []).entries()) {
  fanMoments++;
  const where = `bank: fan[${i}] (${(F.on || []).join('/')})`;
  for (const l of F.lines || []) {
    fanTexts++;
    for (const m of (l[1] || '').matchAll(/\{(\w+)\}/g)) if (!FAN_SLOTS.has(m[1])) bad(`${where} uses unknown slot {${m[1]}}`);
  }
  for (const k of Object.keys(F.when || {})) if (!FAN_SLOTS.has(k)) bad(`${where} has a condition on unknown slot "${k}"`);
}
if (neverSilent) bad('bank: a routine trigger is never silent');
for (const e of validateBank(bank)) bad(`bank: ${e}`);

let lines = 0, events = 0, seconds = 0, fanLines = 0;
for (let seed = 1; seed <= GAMES; seed++) {
  const g = simGame(seed, {}), before = JSON.stringify(g.stream), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const booth = createBooth({ stream: g.stream, seed, bank, teams, describe });
  if (JSON.stringify(g.stream) !== before) bad(`seed ${seed}: commentary modified the event stream`);
  if (JSON.stringify(createBooth({ stream: g.stream, seed, bank, teams, describe }).lines) !== JSON.stringify(booth.lines)) bad(`seed ${seed}: draft is not deterministic`);
  lines += booth.lines.length; fanLines += booth.lines.filter(l => l.speaker === 'fan').length; events += g.stream.length; seconds += g.dur;
  let prev = -1;
  for (const l of booth.lines) {
    if (/\{\w+\}/.test(l.text)) bad(`seed ${seed}: unfilled slot in "${l.text}"`);
    if (!SPEAKERS.includes(l.speaker)) bad(`seed ${seed}: unknown speaker ${l.speaker}`);
    if (l.at < prev) bad(`seed ${seed}: lines out of order`); prev = l.at;
    if (l.time + 1e-9 < g.stream[l.at].t) bad(`seed ${seed}: line is due before its event`);
  }
  const asScript = { version: 1, seed: g.seed, engine: g.engine, events: g.stream.length, lines: booth.lines.map(({ at, speaker, text, delay }) => ({ at, speaker, text, delay })) };
  for (const e of validateScript(asScript, g.stream)) bad(`seed ${seed}: draft fails script validation: ${e}`);
  /* causality: cut the game short and the lines up to the cut must not change */
  for (const cut of [Math.floor(g.stream.length / 3), Math.floor(g.stream.length * 0.8)]) {
    const part = draftFromBank(g.stream.slice(0, cut + 1), bank, { seed, teams, describe });
    const full = booth.lines.filter(l => l.at <= cut).map(l => l.text).join('|');
    if (part.map(l => l.text).join('|') !== full) bad(`seed ${seed}: lines before event ${cut} depend on later events`);
  }
  /* playback: stepping through time delivers every line once, in order */
  if (seed <= 3) { let n = 0; booth.due(-1); for (let T = 0; T <= g.dur + 5; T += 0.5) n += booth.due(T).length; if (n !== booth.lines.length) bad(`seed ${seed}: playback delivered ${n} of ${booth.lines.length} lines`); }
}

const index = JSON.parse(readFileSync(path.join(DIR, 'scripts/index.json'), 'utf8')).scripts || {};
/* the demonstration game was recorded against the rosters of its day (#169): its script is checked against that game */
const opening = parseRecording(readFileSync(path.join(DIR, '../league/preseason/opening.json'), 'utf8'));
for (const [seed, file] of Object.entries(index)) {
  const script = JSON.parse(readFileSync(path.join(DIR, 'scripts', file), 'utf8')), g = Number(seed) === opening.seed ? opening.game : simGame(Number(seed), {});
  for (const e of validateScript(script, g.stream)) bad(`script ${file}: ${e}`);
}

console.log(`bank: ${Object.keys(bank.triggers).length} triggers, ${exchanges} exchanges (${paired} call-and-response)`);
const fanShare = lines ? fanLines / lines : 0;
if (fanShare < FAN_SHARE.min || fanShare > FAN_SHARE.max) bad(`fan share ${(fanShare * 100).toFixed(1)}% is outside ${FAN_SHARE.min * 100}%..${FAN_SHARE.max * 100}% over ${GAMES} games`);
console.log(`bank: ${fanMoments} fan moments, ${fanTexts} fan-moment lines`);
console.log(`${GAMES} games: ${(lines / GAMES).toFixed(0)} lines/game, one line every ${(seconds / lines).toFixed(0)} s on average, fan share ${(fanShare * 100).toFixed(1)}%, ${Object.keys(index).length} registered script(s)`);
for (const file of ['tension.check.mjs', 'banter.check.mjs', 'calls.check.mjs', 'audio.check.mjs', 'clips.check.mjs', 'repeat.check.mjs']) {
  const child = spawnSync(process.execPath, [path.join(DIR, file)], { encoding: 'utf8', env: { ...process.env, GAMES: String(GAMES) } });
  process.stdout.write(child.stdout || ''); process.stderr.write(child.stderr || '');
  if (child.status !== 0) bad(`commentary/${file} failed (exit ${child.status === null ? 'killed by ' + child.signal : child.status})`);
}
if (problems.length) { console.error(`\nFAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: bank is well formed, drafts are deterministic and causal, commentary does not touch the game, fan slots and share hold, tension index, banter and audio checks pass.');
