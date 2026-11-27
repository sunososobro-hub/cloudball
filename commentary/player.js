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
import { staffOf, crewFor, umpire } from '../league/staff.js';
import { validateLine, speak, partsOf } from './clips.js';

export const SPEAKERS = ['pbp', 'color', 'fan'];   /* play-by-play voice, colour voice, the home team's fan guest */
const SEEK_GAP = 6;                                /* a jump in playback time longer than this is a seek, not playback */
const RESPONSE_DELAY = 0.1;
const HIT_RESULTS = new Set(['single', 'double', 'triple', 'home_run', 'infield_single', 'bunt_single']);
const NOT_AT_BAT = new Set(['walk', 'intentional_walk', 'hit_by_pitch', 'catcher_interference', 'sac_bunt', 'sac_fly']);
const FAN_DELAY = 0.2;                             /* each line of a fan moment follows the previous one by this much */
/* The fan guest only talks once a play is over: never during a live at-bat or a live running play. */
export const FAN_TRIGGERS = new Set(['game_start', 'run_scores', 'pitching_change', 'half_end', 'walkoff', 'game_end', 'strikeout', 'walk', 'intentional_walk', 'hit_by_pitch',
  'single', 'infield_single', 'bunt_single', 'double', 'triple', 'home_run', 'groundout', 'flyout', 'lineout', 'popout', 'double_play', 'fielders_choice', 'sac_bunt', 'sac_fly', 'error']);
const FAN_SIDES = new Set(['up', 'down', 'any']);
/* results that helped / hurt the batting team */
const BAT_GAIN = new Set(['run_scores', 'home_run', 'single', 'infield_single', 'bunt_single', 'double', 'triple', 'walk', 'intentional_walk', 'hit_by_pitch', 'error', 'sac_fly']);
const BAT_LOSS = new Set(['strikeout', 'groundout', 'flyout', 'lineout', 'popout', 'double_play', 'fielders_choice']);

/* ---------- the people besides the players (league/staff.js) ---------- */
const COMPOUND_SURNAMES = ['歐陽', '司馬', '上官', '諸葛', '張簡', '范姜'];
const surname = name => COMPOUND_SURNAMES.find(c => name.startsWith(c)) || name.slice(0, 1);
const COACH_TITLE = '教練';   /* on air a coach is surname + title: 「廖教練」 */
const coachOf = (team, role) => (team && staffOf(team.id).find(s => s.role === role)) || null;
const onAir = s => (s ? surname(s.name) + COACH_TITLE : '');
/* a team's coach as the booth says it on air (checks use it to verify who is named) */
export const coachOnAir = (team, role) => onAir(coachOf(team, role));
/* how the booth names tonight's people; the crew comes from the game seed, like the picture's */
function peopleOf(teams, seed) {
  const plate = umpire(crewFor(seed).plate);
  return {
    team: [0, 1].map(i => ({ manager: coachOf(teams[i], 'manager'), pitching: coachOf(teams[i], 'pitching') })),
    plate,
  };
}

/* occupied-bases bit mask (1st = 1, 2nd = 2, 3rd = 4) -> state id of VOICED.bases in clips.js */
const BASE_STATE = [0, 1, 2, 4, 3, 5, 6, 7];

/* ---------- what the booth remembers about the game so far ---------- */
function createMemory(teams, seed = 0) {
  const people = peopleOf(teams, seed);
  const m = { inning: 1, half: 0, score: [0, 0], outs: 0, batters: {}, pitchers: {}, halfRuns: [[], []], frameRuns: 0, frame: -1, strikes: 0, balls: 0, last: {}, runners: [null, null, null, null] };
  const batter = n => m.batters[n] || (m.batters[n] = { pa: 0, ab: 0, h: 0, k: 0, hr: 0, prev: null });
  const pitcher = n => m.pitchers[n] || (m.pitchers[n] = { k: 0, pitches: 0 });
  m.apply = x => {
    if (x.f !== m.frame) { m.frame = x.f; m.frameRuns = 0; }
    if (x.type === 'half_start') { m.inning = x.inning; m.half = x.half; m.outs = 0; m.halfRuns[x.team][x.inning - 1] = 0; m.runners = [null, null, null, null]; }
    else if (x.type === 'runner_placed') m.runners[x.base] = x.runner;
    else if (x.type === 'substitution') { if (x.role === 'pinch_runner' && m.runners[x.base] === x.out) m.runners[x.base] = x.in; }
    else if (x.type === 'runner_advance') { if (x.from >= 1 && x.from <= 3 && m.runners[x.from] === x.runner) m.runners[x.from] = null; if (x.to >= 1 && x.to <= 3) m.runners[x.to] = x.runner; }
    else if (x.type === 'half_end') m.runners = [null, null, null, null];
    else if (x.type === 'pitch') { pitcher(x.pitcher).pitches++; m.strikes = x.count[1]; m.balls = x.count[0]; m.last = { batter: x.batter, pitcher: x.pitcher, team: x.team }; m.pitchType = x.pitchType; }
    else if (x.type === 'contact') m.pos = x.fielder;
    else if (x.type === 'call') { m.balls = x.count[0]; m.strikes = x.count[1]; }
    else if (x.type === 'out') { m.outs = x.outs; if (x.from >= 1 && x.from <= 3 && m.runners[x.from] === x.runner) m.runners[x.from] = null; }
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
    /* "the previous plate appearance": on a pitch the batter is mid-PA, so it is the last finished one (now); after a PA ends it is the one before it (prev) */
    const last = x.type === 'pitch' ? b.now : b.prev;
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
      batterPrev: PREV_LABEL[last] || '', hasPrev: last ? 1 : 0,
      pitcherK: p ? pitcher(p).k : 0, pitchCount: p ? pitcher(p).pitches : 0,
      /* voiced closed-set values (clips.js): the count, the last pitch's type, the fielder of the last ball in play; the bases as the id of the 8 states in clips.js (0 empty, 1 first, 2 second, 3 third, 4 first+second, 5 first+third, 6 second+third, 7 loaded) */
      count: m.balls >= 0 && m.strikes >= 0 ? `${m.balls}-${m.strikes}` : '', pitchType: m.pitchType || '', pos: m.pos || '', bases: BASE_STATE[(m.runners[1] ? 1 : 0) | (m.runners[2] ? 2 : 0) | (m.runners[3] ? 4 : 0)],
      /* staff of the team in {team} (on a pitching change: the team making it), the home manager, the plate umpire */
      manager: onAir(people.team[bat].manager), pitchingCoach: onAir(people.team[bat].pitching), homeManager: onAir(people.team[1].manager),
      managerName: people.team[bat].manager ? people.team[bat].manager.name : '', managerLine: people.team[bat].manager ? people.team[bat].manager.line : '',
      plateUmp: people.plate ? people.plate.name : '', plateUmpLine: people.plate ? people.plate.line : '',
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
    case 'substitution': return x.role === 'pitcher' ? 'pitching_change' : null;   /* #436: a pinch hitter / runner is not a pitching change; the feed shows its line */
    case 'decision': return x.pending ? null : 'fan_decision';
    case 'half_end': return 'half_end';
    case 'game_end': return x.walkoff ? 'walkoff' : 'game_end';
    default: return null;
  }
}

/* Did the home team (index 1) just gain ('up') or lose ('down')? null when the moment is neither.
 * Uses only the event itself, so it can never be wrong about what happened. */
function homeSide(name, x) {
  if (name === 'game_end' || name === 'walkoff') return x.winner === 1 ? 'up' : x.winner === 0 ? 'down' : null;   /* a tie is neither */
  if (name === 'pitching_change') return x.team === 1 ? 'down' : 'up';       /* the team making the change lost its pitcher */
  let batGain;
  if (name === 'half_end') batGain = x.runs > 0;
  else if (BAT_GAIN.has(name)) batGain = true;
  else if (BAT_LOSS.has(name)) batGain = false;
  else return null;
  return (x.team === 1) === batGain ? 'up' : 'down';
}
/* The fan in the third seat: the fan of the home team, or the one a script names. */
const guestOf = (bank, id) => (id && bank && bank.guests && bank.guests[id]) ? { id, ...bank.guests[id] } : null;

const fill = (text, slots) => String(text).replace(/\{(\w+)\}/g, (all, k) => (k in slots ? String(slots[k]) : all));
const matches = (when, slots) => !when || Object.entries(when).every(([k, c]) => {
  const v = slots[k]; if (v === undefined) return false;
  if (typeof c !== 'object') return v === c;
  return (c.min === undefined || v >= c.min) && (c.max === undefined || v <= c.max) && (c.eq === undefined || v === c.eq);
});

/* Running gags (see personas/): one gag per game, and a payoff only after its setup.
 * gag: which gag a line belongs to; sets: flags it raises when spoken; needs: flags it requires;
 * once: spoken at most once per game. */
const gagAllows = (e, g) => (!e.gag || g.chosen === null || g.chosen === e.gag) && (e.needs || []).every(f => g.flags.has(f)) && !(e.once && g.used.has(e));

/* Every slot the booth can fill (the fan guest's lines also have {guest}). */
const NO_TEAM = { id: '', short: '' };
export const SLOTS = new Set(Object.keys(createMemory([NO_TEAM, NO_TEAM]).slots({}, '')));
const FAN_SLOTS = new Set([...SLOTS, 'guest']);
const slotErrs = (where, text, known) => [...(text || '').matchAll(/\{(\w+)\}/g)].filter(m => !known.has(m[1])).map(m => `${where}: unknown slot {${m[1]}}`);

/* Problems in the fallback bank's slots and gag wiring (empty array = fine). */
export function validateBank(bank) {
  const errs = [], sets = new Map(), all = [], v2 = bank.version === 2;
  /* v2 (#603): every spoken text is a list of clip parts over closed sets; no name slot and no {desc} (see clips.js) */
  const spoken = (where, t) => { errs.push(...(v2 ? validateLine(where, t) : slotErrs(where, t, where.startsWith('fan') ? FAN_SLOTS : SLOTS))); };
  for (const [name, T] of Object.entries(bank.triggers || {})) for (const e of T.exchanges || []) {
    all.push([name, e]);
    for (const t of [e.call, e.response, ...(e.alt || [])]) if (t !== undefined) spoken(name, t);
    for (const k of Object.keys(e.when || {})) if (!SLOTS.has(k)) errs.push(`${name}: condition on unknown slot "${k}"`);
    if ((e.sets || e.needs) && !e.gag) errs.push(`${name}: a line with sets/needs must name its gag`);
    if (e.alt !== undefined) {
      /* other wordings of the same response, said in turn: same slots, so any of them fits the moment */
      const slotsOf = t => [...new Set(partsOf(t).filter(p => p.slot).map(p => p.slot + (p.slot === 'n' ? ':' + p.src : '')))].sort().join();
      if (!e.response || !Array.isArray(e.alt) || !e.alt.length) errs.push(`${name}: "alt" needs a response and a list of other wordings`);
      else for (const a of e.alt) if ((typeof a !== 'string' && !Array.isArray(a)) || slotsOf(a) !== slotsOf(e.response)) errs.push(`${name}: alt wording ${JSON.stringify(a)} must use the same slots as its response`);
    }
    for (const f of e.sets || []) sets.set(f, e.gag);
  }
  for (const [name, e] of all) for (const f of e.needs || []) {
    if (!sets.has(f)) errs.push(`${name}: needs "${f}" but no line sets it`);
    else if (sets.get(f) !== e.gag) errs.push(`${name}: needs "${f}" from gag "${sets.get(f)}" but belongs to gag "${e.gag}"`);
  }
  /* the fan guest: who he is, when he may talk, and that every moment of his has a fan line */
  for (const [id, g] of Object.entries(bank.guests || {})) if (!g.nick || !g.name) errs.push(`guest ${id}: needs a name and a nick`);
  (bank.fan || []).forEach((e, n) => {
    const where = `fan ${n}`;
    if (!Array.isArray(e.on) || !e.on.length) errs.push(`${where}: needs a list of triggers in "on"`);
    for (const t of e.on || []) if (!FAN_TRIGGERS.has(t)) errs.push(`${where}: the fan may not talk on "${t}" (live play or unknown trigger)`);
    if (!FAN_SIDES.has(e.side)) errs.push(`${where}: side must be up, down or any`);
    if (e.guest && !(bank.guests || {})[e.guest]) errs.push(`${where}: unknown guest "${e.guest}"`);
    if (!Array.isArray(e.lines) || !e.lines.some(l => l[0] === 'fan')) errs.push(`${where}: needs at least one fan line`);
    for (const l of e.lines || []) if (!SPEAKERS.includes(l[0]) || (typeof l[1] !== 'string' && !Array.isArray(l[1]))) errs.push(`${where}: bad line ${JSON.stringify(l)}`); else spoken(where, l[1]);
    for (const k of Object.keys(e.when || {})) if (!FAN_SLOTS.has(k)) errs.push(`${where}: condition on unknown slot "${k}"`);
  });
  return errs;
}

/* Draft a whole game's lines from the fallback bank. Same stream + same seed = same draft. */
export function draftFromBank(stream, bank, { seed = 0, teams, describe = () => '' }) {
  const rng = mulberry32((seed ^ 0xc0ffee) >>> 0), mem = createMemory(teams, seed), rules = bank.rules || {}, lines = [], recent = [];
  const gags = { chosen: null, flags: new Set(), used: new Set() };   /* the one running gag of this game and how far it has got */
  const turns = new Map();   /* how often each exchange was said: its response and "alt" wordings are said in turn */
  /* the fan guest has his own random stream, so his picks never shift what the other two pick */
  const fanRng = mulberry32((seed ^ 0xfa11) >>> 0), guest = guestOf(bank, teams[1] && teams[1].id), fanRecent = [], fanUses = new Map();
  const v2 = bank.version === 2;
  /* v2: what a line says for this game state, { text, clips } or null (a value outside its closed set); v1: the filled text */
  const say = (line, slots, speaker, emotion) => v2 ? speak(line, slots, speaker, guest ? guest.id : undefined, emotion) : { text: fill(line, slots) };
  const at = (x, speaker, s, extra) => ({ at: x.i, speaker, text: s.text, ...(s.clips ? { clips: s.clips } : {}), ...extra });
  let quietUntil = -Infinity;
  for (const x of stream) {
    mem.apply(x);
    const name = triggerOf(x, mem), T = name && bank.triggers[name];
    if (!T) continue;
    const roll = rng(), pickRoll = rng();            /* always drawn, so one silent moment does not shift every later choice */
    const fanRoll = fanRng(), fanPick = fanRng();
    const priority = T.priority || 0;
    if (priority < 2 && x.t < quietUntil) continue;  /* the booth just spoke: let the picture breathe */
    if (roll < (T.silence || 0)) continue;           /* sometimes nobody talks */
    const slots = mem.slots(x, describe(x));
    const fits = T.exchanges.filter(e => matches(e.when, slots) && !recent.includes(e) && gagAllows(e, gags)
      && (!v2 || [e.call, e.response, ...(e.alt || [])].every(t => !t || say(t, slots, 'pbp')))); /* v2: every wording is sayable now, so the pick never depends on the turn */
    if (!fits.length) continue;
    /* a gag payoff beats a line about this moment, which beats a generic line */
    const payoff = fits.filter(e => e.needs), specific = fits.filter(e => e.when), pool = payoff.length ? payoff : specific.length ? specific : fits, ex = pool[Math.floor(pickRoll * pool.length)];
    recent.push(ex); if (recent.length > (rules.noRepeatWindow || 12)) recent.shift();
    gags.used.add(ex);
    if (ex.gag) { gags.chosen = ex.gag; for (const f of ex.sets || []) gags.flags.add(f); }
    const delay = T.delay || 0;
    if (ex.call) lines.push(at(x, 'pbp', say(ex.call, slots, 'pbp'), { delay, priority }));
    const turn = turns.get(ex) || 0, wordings = [ex.response, ...(ex.alt || [])];
    turns.set(ex, turn + 1);
    if (ex.response) lines.push(at(x, 'color', say(wordings[turn % wordings.length], slots, 'color'), { delay: delay + RESPONSE_DELAY, priority }));
    quietUntil = x.t + (rules.minGapSec || 0);
    /* the fan guest, after the two professionals, only on moments where the play is over */
    if (!guest || !FAN_TRIGGERS.has(name)) continue;
    const side = homeSide(name, x), chance = T.fanChance !== undefined ? T.fanChance : (rules.fanChance || 0);
    if (fanRoll >= chance) continue;
    const fanSlots = { ...slots, guest: guest.nick };
    const ok = (bank.fan || []).filter(e => e.on.includes(name) && (e.side === 'any' || e.side === side) && (!e.guest || e.guest === guest.id)
      && matches(e.when, fanSlots) && (!v2 || e.lines.every(([sp, t]) => say(t, fanSlots, sp))) && !fanRecent.includes(e) && (fanUses.get(e) || 0) < (e.once ? 1 : rules.fanMaxUses || 2));
    if (!ok.length) continue;
    /* his own signature lines get a fixed share of his moments; the rest are drawn from everything that fits */
    const own = ok.filter(e => e.guest), share = own.length ? (rules.fanOwnShare || 0) : 0, mine = fanPick < share;
    const fanPool = mine ? own : ok, u = mine ? fanPick / share : (fanPick - share) / (1 - share);
    const fe = fanPool[Math.min(fanPool.length - 1, Math.floor(u * fanPool.length))];
    fanRecent.push(fe); if (fanRecent.length > (rules.fanNoRepeatWindow || 8)) fanRecent.shift();
    fanUses.set(fe, (fanUses.get(fe) || 0) + 1);
    let d = delay + RESPONSE_DELAY;
    for (const [speaker, text] of fe.lines) {
      d += FAN_DELAY;
      const l = at(x, speaker, say(text, fanSlots, speaker), { delay: d, priority: 0, aside: true });   /* aside: the voice may drop it for a new call */
      if (speaker === 'fan' && guest.cast) l.cast = guest.cast;
      lines.push(l);
    }
    quietUntil += rules.fanGapSec || 0;                /* he took the air: the next routine call waits a little longer */
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
  if (script.guest !== undefined && typeof script.guest !== 'string') errs.push('guest must be a team id');
  if (script.pregame !== undefined) errs.push(...validatePregame(script.pregame));
  return errs;
}

/* The pregame part of a script: what the booth says before the first pitch, in the six segments of
 * the shared showing contract (#55/#56), in this order. Nothing in it may hint at the result. */
export const PREGAME_SEGMENTS = ['open', 'pitchers', 'lineup_away', 'lineup_home', 'officials', 'playball'];
export function validatePregame(pregame) {
  if (!Array.isArray(pregame)) return ['pregame must be a list of lines'];
  const errs = []; let seg = 0, t = 0;
  pregame.forEach((l, n) => {
    const k = PREGAME_SEGMENTS.indexOf(l.seg);
    if (k < 0) { errs.push(`pregame ${n}: unknown segment "${l.seg}"`); return; }
    if (k < seg) errs.push(`pregame ${n}: segments must follow the order ${PREGAME_SEGMENTS.join(', ')}`);
    if (k !== seg) { seg = k; t = 0; }
    if (typeof l.t !== 'number' || !(l.t >= 0)) errs.push(`pregame ${n}: offset t must be seconds from the start of the segment`);
    else if (l.t < t) errs.push(`pregame ${n}: lines must be ordered by offset inside a segment`);
    else t = l.t;
    if (!SPEAKERS.includes(l.speaker)) errs.push(`pregame ${n}: unknown speaker "${l.speaker}"`);
    if (typeof l.text !== 'string' || !l.text.trim()) errs.push(`pregame ${n}: empty text`);
  });
  return errs;
}

/* The file layout of a script, shared by every tool that writes one: header on one line, then one
 * line per entry, so the owner can edit a single line by hand and a diff shows only that line. */
export function formatScript(script) {
  const { pregame, lines, ...head } = script;
  const list = a => '[\n' + a.map(l => JSON.stringify(l)).join(',\n') + '\n]';
  return JSON.stringify(head).slice(0, -1) + (pregame ? ',"pregame":' + list(pregame) : '') + ',"lines":' + list(lines) + '}\n';
}

/* ---------- recorded voice (#96) ----------
 * A script with recorded audio (`audio` + `dur` on its lines, filled by tools/wire-audio.mjs) is
 * timed by the real length of each clip, so it never sounds odd:
 *   - only lines with a file are spoken: a line without one stays silent, never the browser voice;
 *   - two lines never overlap: a line starts after the previous one has ended;
 *   - an answer (a line bound to the same event as the line before it) follows it after a short,
 *     constant pause;
 *   - a line that cannot be over by the next play-by-play call (a pbp line of a later event that is
 *     not an aside) is dropped, never played late; it may hold that call back by CALL_GRACE at most;
 *     asides (lineup intros) never hold a line back;
 *   - a priority-2 play-by-play call is never moved or dropped: it is said on its moment and cuts
 *     whatever is still playing (the viewer sends it as urgent).
 * Times only ever move later than the event, so a line still never talks about the future. */
const REPLY_GAP = 0.35;     /* seconds between a line and the answer to it */
const LINE_GAP = 0.2;       /* shortest pause between two lines that are not an answer */
export const CALL_GRACE = 1;   /* a line must be over within this long after the next play-by-play call is due (that call then
                                  waits for it); the recorded booth opening of #98 needs about 0.9 s more than the 23 s before the first out */
const SPEECH_CPS = 4.5;     /* characters per second: rough length of a clip that has no measured `dur` */
const SPEECH_PAD = 0.4;
export const estimateDur = text => [...String(text).replace(/[\s，。、！？「」—…：；（）]/g, '')].length / SPEECH_CPS + SPEECH_PAD;
export const isRecorded = script => !!(script && Array.isArray(script.lines) && script.lines.some(l => l.audio));

/* Every line with { due, time, end, reply, drop } (drop: null, 'no audio', 'late' or 'too long'; `cut`: a
 * priority-2 call starts before it ends). Pure: used by the booth and by tools/wire-audio.mjs. */
export function planRecorded(lines, stream) {
  const out = lines.map(l => ({ ...l, due: stream[l.at].t + (l.delay || 0), time: null, end: null, drop: null }));
  /* the next call: the next play-by-play line of a later event that is not an aside (lineup intros are asides) */
  const isCall = l => l.speaker === 'pbp' && l.audio && !l.aside;
  for (let k = out.length - 1, next = Infinity, nextAt = Infinity, after = Infinity; k >= 0; k--) {
    if (out[k].at < nextAt) { after = next; nextAt = out[k].at; }   /* first line (from the end) of an earlier event: calls of later events only */
    out[k].nextCall = after;
    if (isCall(out[k])) next = Math.min(next, out[k].due);
  }
  let prev = null;
  for (const l of out) {
    if (!l.audio) { l.drop = 'no audio'; continue; }
    const dur = l.dur > 0 ? l.dur : estimateDur(l.text), urgent = l.speaker === 'pbp' && (l.priority || 0) >= 2;
    const reply = prev && prev.at === l.at && (l.delay || 0) <= (prev.delay || 0) + RESPONSE_DELAY;
    const start = urgent || !prev ? l.due : Math.max(l.due, prev.end + (reply ? REPLY_GAP : LINE_GAP));
    if (!urgent && start + dur > l.nextCall + CALL_GRACE) { l.drop = start > l.nextCall ? 'late' : 'too long'; continue; }
    if (urgent && prev && prev.end > start) prev.cut = true;
    l.time = start; l.end = start + dur; l.reply = !!reply; prev = l;
  }
  return out;
}

/* The booth for one game. due(T) returns the lines whose moment has come since the last call. */
export function createBooth({ stream, seed, bank, script, teams, describe }) {
  const usable = script && validateScript(script, stream).length === 0, recorded = usable && isRecorded(script);
  const guest = guestOf(bank, (usable && script.guest) || (teams && teams[1] && teams[1].id));
  const all = (usable ? script.lines : draftFromBank(stream, bank, { seed, teams, describe }))
    .map(l => ({ ...l, ...(l.speaker === 'fan' && guest && guest.cast && !l.cast ? { cast: guest.cast } : {}), time: stream[l.at].t + (l.delay || 0) }));
  const plan = recorded ? planRecorded(all, stream) : null;
  const lines = plan ? plan.filter(l => !l.drop).sort((a, b) => a.time - b.time) : all;
  let cursor = 0, lastT = null;
  return {
    /* recorded: the game has recorded voice, so the viewer shows the "AI 語音" label and never uses the browser voice */
    lines, plan, scripted: !!usable, recorded, guest,
    due(T, { fast = false } = {}) {
      if (lastT === null || T < lastT || T - lastT > SEEK_GAP) { cursor = lines.findIndex(l => l.time > T); if (cursor < 0) cursor = lines.length; lastT = T; return []; }
      lastT = T; const out = [];
      while (cursor < lines.length && lines[cursor].time <= T) { const l = lines[cursor++]; if (!fast || (l.priority || 0) >= 2) out.push(l); }
      return out;
    },
  };
}
