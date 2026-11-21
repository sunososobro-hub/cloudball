/* Commentary booth: decides which line is spoken when, for one simulated game.
 *
 * Input is the finished engine event stream. A line is always bound to the index of a stream
 * event and may only use what happened at or before that index, so commentary can describe
 * the game but can never change it. Nothing here is imported by the engine.
 *
 * Two sources of lines:
 *   1. a per-game script (see SCRIPT_FORMAT.md), written after the game was simulated;
 *   2. otherwise a draft made on the spot from the fallback bank (lines.json), with slots
 *      filled from the game so far. The draft is deterministic for a given seed.
 * No network, no AI call, no DOM: this module runs under plain Node. */
import { mulberry32 } from '../engine/rng.js';

export const SPEAKERS = ['pbp', 'color'];          /* play-by-play voice, colour voice */
const SEEK_GAP = 6;                                /* a jump in playback time longer than this is a seek, not playback */
const RESPONSE_DELAY = 0.1;
const HIT_RESULTS = new Set(['single', 'double', 'triple', 'home_run', 'infield_single', 'bunt_single']);
const NOT_AT_BAT = new Set(['walk', 'intentional_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly']);

/* ---------- what the booth remembers about the game so far ---------- */
function createMemory(teams) {
  const m = { inning: 1, half: 0, score: [0, 0], outs: 0, batters: {}, pitchers: {}, halfRuns: [[], []], frameRuns: 0, frame: -1, strikes: 0, balls: 0, last: {} };
  const batter = n => m.batters[n] || (m.batters[n] = { pa: 0, ab: 0, h: 0, k: 0, hr: 0, prev: null });
  const pitcher = n => m.pitchers[n] || (m.pitchers[n] = { k: 0, pitches: 0 });
  m.apply = x => {
    if (x.f !== m.frame) { m.frame = x.f; m.frameRuns = 0; }
    if (x.type === 'half_start') { m.inning = x.inning; m.half = x.half; m.outs = 0; m.halfRuns[x.team][x.inning - 1] = 0; }
    else if (x.type === 'pitch') { pitcher(x.pitcher).pitches++; m.strikes = x.count[1]; m.balls = x.count[0]; m.last = { batter: x.batter, pitcher: x.pitcher, team: x.team }; }
    else if (x.type === 'call') { m.balls = x.count[0]; m.strikes = x.count[1]; }
    else if (x.type === 'out') m.outs = x.outs;
    else if (x.type === 'run_scored') { m.score[x.team]++; m.frameRuns++; m.halfRuns[x.team][m.inning - 1] = (m.halfRuns[x.team][m.inning - 1] || 0) + 1; }
    else if (x.type === 'pa_end') {
      const b = batter(x.batter); b.pa++; b.prev = b.now || null; b.now = x.result;
      if (!NOT_AT_BAT.has(x.result)) b.ab++;
      if (HIT_RESULTS.has(x.result)) b.h++;
      if (x.result === 'home_run') b.hr++;
      if (x.result === 'strikeout') { b.k++; pitcher(x.pitcher).k++; }
    }
  };
  /* slot values for a line bound to event x (called after apply(x)) */
  m.slots = (x, desc) => {
    const who = x.batter || m.last.batter, team = x.team != null ? x.team : m.last.team, b = who ? batter(who) : {}, p = x.pitcher || m.last.pitcher;
    const lead = m.score[0] > m.score[1] ? 0 : m.score[1] > m.score[0] ? 1 : -1, bat = team == null ? m.half : team;
    return {
      desc: desc || '', batter: who || '', pitcher: p || '', runner: x.runner || '',
      team: teams[bat] ? teams[bat].short : '', fieldTeam: teams[1 - bat] ? teams[1 - bat].short : '', away: teams[0].short, home: teams[1].short,
      inning: m.inning, half: m.half ? '下' : '上', outs: m.outs, awayScore: m.score[0], homeScore: m.score[1],
      margin: Math.abs(m.score[0] - m.score[1]), leadTeam: lead < 0 ? '' : teams[lead].short, tied: lead < 0 ? 1 : 0,
      runs: m.frameRuns, halfRuns: m.halfRuns[bat][m.inning - 1] || 0,
      /* callback to the previous inning: what this team did the last time it batted */
      lastInningRuns: m.inning > 1 ? (m.halfRuns[bat][m.inning - 2] || 0) : 0, hadLastInning: m.inning > 1 ? 1 : 0,
      batterPa: b.pa || 0, batterAb: b.ab || 0, batterHits: b.h || 0, batterKToday: b.k || 0, batterHrToday: b.hr || 0,
      batterPrev: PREV_LABEL[b.prev] || '', hasPrev: b.prev ? 1 : 0,
      pitcherK: p ? pitcher(p).k : 0, pitchCount: p ? pitcher(p).pitches : 0,
    };
  };
  return m;
}
/* how the booth refers to a batter's previous plate appearance (game content) */
const PREV_LABEL = { strikeout: '被三振', walk: '選到保送', intentional_walk: '被敬遠', hit_by_pitch: '挨了觸身球', single: '打了安打', infield_single: '跑出內野安打', bunt_single: '點出安打',
  double: '打了二壘安打', triple: '打了三壘安打', home_run: '開轟', groundout: '滾地出局', flyout: '飛球被接殺', lineout: '平飛被接殺', popout: '打成內野高飛', double_play: '打成雙殺',
  fielders_choice: '靠野手選擇上壘', sac_bunt: '短打推進', sac_fly: '打了高飛犧牲打', error: '靠失誤上壘' };

/* Which bank trigger (if any) a stream event fires. Uses only the event and the memory so far. */
function triggerOf(x, m) {
  switch (x.type) {
    case 'game_start': return 'game_start';
    case 'pitch': return x.count[0] === 0 && x.count[1] === 0 ? 'batter_up' : null;
    case 'call': if (x.count[0] === 3 && x.count[1] === 2 && x.call !== 'foul') return 'full_count'; return x.count[1] === 2 && x.call !== 'foul' && x.call !== 'ball' ? 'two_strikes' : null;
    case 'runner_advance': return x.how === 'steal' ? 'stolen_base' : null;
    case 'out': return x.steal ? 'caught_stealing' : null;
    case 'pa_end': if (m.frameRuns > 0 && x.result !== 'home_run') return 'run_scores'; return x.result;
    case 'substitution': return 'pitching_change';
    case 'decision': return x.pending ? null : 'fan_decision';
    case 'half_end': return 'half_end';
    case 'game_end': return x.walkoff ? 'walkoff' : 'game_end';
    default: return null;
  }
}

const fill = (text, slots) => text.replace(/\{(\w+)\}/g, (all, k) => (k in slots ? String(slots[k]) : all));
const matches = (when, slots) => !when || Object.entries(when).every(([k, c]) => {
  const v = slots[k]; if (v === undefined) return false;
  if (typeof c !== 'object') return v === c;
  return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max) && (c.eq === undefined || v === c.eq);
});

/* Draft a whole game's lines from the fallback bank. Same stream + same seed = same draft. */
export function draftFromBank(stream, bank, { seed = 0, teams, describe = () => '' }) {
  const rng = mulberry32((seed ^ 0xc0ffee) >>> 0), mem = createMemory(teams), rules = bank.rules || {}, lines = [], recent = [];
  let quietUntil = -Infinity;
  for (const x of stream) {
    mem.apply(x);
    const name = triggerOf(x, mem), T = name && bank.triggers[name];
    if (!T) continue;
    const roll = rng(), pickRoll = rng();            /* always drawn, so one silent moment does not shift every later choice */
    const priority = T.priority || 0;
    if (priority < 2 && x.t < quietUntil) continue;  /* the booth just spoke: let the picture breathe */
    if (roll < (T.silence || 0)) continue;           /* sometimes nobody talks */
    const slots = mem.slots(x, describe(x));
    const fits = T.exchanges.filter(e => matches(e.when, slots) && !recent.includes(e));
    if (!fits.length) continue;
    const specific = fits.filter(e => e.when), pool = specific.length ? specific : fits, ex = pool[Math.floor(pickRoll * pool.length)];
    recent.push(ex); if (recent.length > (rules.noRepeatWindow || 12)) recent.shift();
    const delay = T.delay || 0;
    if (ex.call) lines.push({ at: x.i, speaker: 'pbp', text: fill(ex.call, slots), delay, priority });
    if (ex.response) lines.push({ at: x.i, speaker: 'color', text: fill(ex.response, slots), delay: delay + RESPONSE_DELAY, priority });
    quietUntil = x.t + (rules.minGapSec || 0);
  }
  return lines;
}

/* Problems that make a per-game script unusable for this stream (empty array = fine). */
export function validateScript(script, stream) {
  const errs = [], start = stream[0] || {};
  if (!script || !Array.isArray(script.lines)) return ['no lines array'];
  if (script.seed !== undefined && script.seed !== start.seed) errs.push(`script is for seed ${script.seed}, game is ${start.seed}`);
  if (script.engine !== undefined && script.engine !== start.engine) errs.push(`script is for engine ${script.engine}, game is ${start.engine}`);
  if (script.events !== undefined && script.events !== stream.length) errs.push(`script expects ${script.events} events, game has ${stream.length}`);
  let prev = -1;
  script.lines.forEach((l, n) => {
    if (!Number.isInteger(l.at) || l.at < 0 || l.at >= stream.length) errs.push(`line ${n}: event index ${l.at} is outside the game`);
    else if (l.at < prev) errs.push(`line ${n}: lines must be ordered by event index`);
    else prev = l.at;
    if (!SPEAKERS.includes(l.speaker)) errs.push(`line ${n}: unknown speaker "${l.speaker}"`);
    if (typeof l.text !== 'string' || !l.text.trim()) errs.push(`line ${n}: empty text`);
  });
  return errs;
}

/* The booth for one game. due(T) returns the lines whose moment has come since the last call. */
export function createBooth({ stream, seed, bank, script, teams, describe }) {
  const usable = script && validateScript(script, stream).length === 0;
  const lines = (usable ? script.lines : draftFromBank(stream, bank, { seed, teams, describe }))
    .map(l => ({ ...l, time: stream[l.at].t + (l.delay || 0) }));
  let cursor = 0, lastT = null;
  return {
    lines, scripted: !!usable,
    due(T, { fast = false } = {}) {
      if (lastT === null || T < lastT || T - lastT > SEEK_GAP) { cursor = lines.findIndex(l => l.time > T); if (cursor < 0) cursor = lines.length; lastT = T; return []; }
      lastT = T; const out = [];
      while (cursor < lines.length && lines[cursor].time <= T) { const l = lines[cursor++]; if (!fast || (l.priority || 0) >= 2) out.push(l); }
      return out;
    },
  };
}
