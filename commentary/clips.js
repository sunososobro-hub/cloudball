/* Name-free clip bank, format v2 (#603 part 1). A bank line is a list of SPOKEN PARTS; every part is one clip.
 *   - fixed text: a plain string part;
 *   - a voiced slot: `{inning}`, `{half}`, `{outs}`, `{count}`, `{bases}`, `{n:<source>}`, `{team}`, `{fieldTeam}`,
 *     `{leadTeam}`, `{pos}`, `{pitchType}`; each takes its value from a CLOSED SET and every value is its own clip.
 * A line may be written as a list of parts or as one string; the string is split on its slot tokens.
 * Names (players, coaches, umpires) and `{desc}` are never spoken: they stay on screen.
 * The clip id is the one of tools/line-id.mjs (role + tone + text), so a clip is shared by every line that says it.
 * Pure module: no DOM, no network, nothing the engine imports. */
import { TEAMS } from '../engine/index.js';
import { PITCH_TYPES } from '../engine/constants.js';
import { lineId } from './clip-id.js';

const DIGITS = '零一二三四五六七八九';
export const cn = n => (n <= 10 ? (n === 10 ? '十' : DIGITS[n]) : n < 20 ? '十' + DIGITS[n - 10] : n === 20 ? '二十' : String(n));
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const BASES = ['壘上無人', '一壘有人', '二壘有人', '三壘有人', '一二壘有人', '一三壘有人', '二三壘有人', '滿壘'];
const POS = { P: '投手', C: '捕手', '1B': '一壘手', '2B': '二壘手', '3B': '三壘手', SS: '游擊手', LF: '左外野手', CF: '中外野手', RF: '右外野手' };
const teamSet = Object.fromEntries(TEAMS.map(t => [t.short, t.short]));
/* closed sets: slot -> { value: spoken text } */
export const VOICED = {
  inning: Object.fromEntries(range(1, 15).map(i => [i, cn(i)])),
  half: { '上': '上半', '下': '下半' },
  outs: Object.fromEntries(range(0, 3).map(i => [i, cn(i)])),
  count: Object.fromEntries(range(0, 3).flatMap(b => range(0, 2).map(s => [`${b}-${s}`, `${cn(s)}好${cn(b)}壞`]))),
  bases: Object.fromEntries(BASES.map((t, i) => [i, t])),
  n: Object.fromEntries(range(0, 20).map(i => [i, cn(i)])),
  team: teamSet, fieldTeam: teamSet, leadTeam: teamSet,
  pos: POS,
  pitchType: Object.fromEntries(PITCH_TYPES.map(t => [t[0], t[0]])),
};
/* what `{n:<source>}` may count: runs, RBI, strikeouts today (slot names of the booth's memory) */
export const N_SOURCES = new Set(['runs', 'halfRuns', 'lastInningRuns', 'batterKToday', 'batterHits', 'batterHrToday', 'pitcherK', 'awayScore', 'homeScore', 'margin']);
/* never voiced, even by a wrong edit */
export const NAME_SLOTS = new Set(['batter', 'pitcher', 'runner', 'manager', 'pitchingCoach', 'homeManager', 'managerName', 'plateUmp', 'plateUmpLine', 'managerLine', 'guest', 'desc', 'away', 'home']);

/* a line (string or list of parts) -> [{ text } | { slot, src }] */
export function partsOf(line) {
  if (Array.isArray(line)) return line.flatMap(p => (typeof p === 'string' && /\{[\w:]+\}/.test(p) ? partsOf(p) : [typeof p === 'string' ? { text: p } : p]));
  return String(line).split(/(\{[\w:]+\})/).filter(Boolean).map(s => {
    const m = /^\{(\w+)(?::(\w+))?\}$/.exec(s);
    return m ? { slot: m[1], src: m[2] || m[1] } : { text: s };
  });
}
/* problems in one line of a v2 bank */
export function validateLine(where, line) {
  const errs = [];
  if (typeof line !== 'string' && !Array.isArray(line)) return [`${where}: a line is a string or a list of parts`];
  for (const p of partsOf(line)) {
    if (p.text !== undefined) { if (!p.text.trim()) errs.push(`${where}: empty spoken part`); continue; }
    if (NAME_SLOTS.has(p.slot)) errs.push(`${where}: {${p.slot}} is a name or on-screen text and is never spoken`);
    else if (!VOICED[p.slot]) errs.push(`${where}: {${p.slot}} is not a voiced slot (closed sets: ${Object.keys(VOICED).join(', ')})`);
    else if (p.slot === 'n' && !N_SOURCES.has(p.src)) errs.push(`${where}: {n:${p.src}} is not a counted source (${[...N_SOURCES].join(', ')})`);
    else if (p.slot !== 'n' && p.src !== p.slot) errs.push(`${where}: only {n:...} takes a source`);
  }
  return errs;
}
/* key of a slot value in its closed set, or null when the game has none (the line then does not fit) */
const keyOf = (p, slots) => {
  const v = p.slot === 'n' ? slots[p.src] : slots[p.slot];
  return v !== undefined && v !== '' && v !== null && VOICED[p.slot][v] !== undefined ? v : null;
};
/* The spoken form of a line for this game state: { text, clips: [id...] }, or null when a voiced value is
 * outside its closed set (the draft then picks another line; it never looks at which audio exists). */
export function speak(line, slots, speaker, guest, emotion) {
  const out = [];
  for (const p of partsOf(line)) {
    let text = p.text;
    if (text === undefined) { const k = keyOf(p, slots); if (k === null) return null; text = VOICED[p.slot][k]; }
    out.push(text);
  }
  const ids = out.map(text => lineId({ speaker, emotion, text }, guest));
  return { text: out.join(''), clips: ids, parts: out };
}
/* Every clip a v2 bank can ever ask for: id -> { role, text }. Fixed parts once, a voiced slot once per value. */
export function bankClips(bank) {
  const clips = new Map(), guests = Object.keys(bank.guests || {});
  const add = (line, speaker, guest) => {
    for (const p of partsOf(line)) for (const text of p.text !== undefined ? [p.text] : Object.values(VOICED[p.slot]))
      clips.set(lineId({ speaker, text }, guest), { role: speaker === 'fan' ? `fan_${guest}` : speaker, text });
  };
  for (const T of Object.values(bank.triggers || {})) for (const e of T.exchanges || []) {
    if (e.call) add(e.call, 'pbp'); for (const t of [e.response, ...(e.alt || [])]) if (t) add(t, 'color');
  }
  for (const F of bank.fan || []) for (const [speaker, text] of F.lines || []) {
    if (speaker === 'fan') for (const g of F.guest ? [F.guest] : guests) add(text, 'fan', g); else add(text, speaker);
  }
  return clips;
}
