/* Banter score of a game script (#134): which exchanges of the booth are people talking to each
 * other, not one voice describing a play, so the highlights can keep the best ones.
 *
 * Pure: reads a script (SCRIPT_FORMAT.md), optionally the engine stream (for game time) and the
 * fallback bank (for `once` and gag lines). No DOM, no network, no randomness, no clock. It
 * scores what was already said; it never changes a line or a result (rules 10 and 15).
 *
 * An exchange is the lines bound to one event (`at`), plus up to SETUP_MAX_LINES lone lines just
 * before it (a call that the answer refers to: 「打出去了——很遠喔！」 then the catch and the jab).
 * Reusable introductions (lines with `src`, e.g. `lineup`, `batter_up`) are never banter and are
 * left out. `first` and `last` are line indexes in `script.lines`: a clip that plays first..last
 * never cuts a joke in half. */

/* scoring weights (the owner tunes these from his verdict on the top 8) */
export const SPEAKER_POINTS = 10;      /* per speaker beyond the first: two people talking */
export const TURN_POINTS = 4;          /* per change of speaker inside the exchange: they answer each other */
export const FAN_POINTS = 8;           /* the guest is in it */
export const AMUSED_POINTS = 5;        /* per line delivered `amused` (the writer marked it as a joke) */
export const GAG_PAYOFF_POINTS = 12;   /* per running gag raised earlier in the game that the exchange calls back
                                          (once per gag: an echo of the same word in the same exchange is one payoff) */
export const CUE_POINTS = 40;          /* the analyst speaks before the guest: the moment is framed, so the guest's
                                          line lands as a punchline instead of a complaint at the call (#175) */
export const ONCE_POINTS = 6;          /* a once-only line of the bank (a payoff that never repeats) */
export const NEEDS_POINTS = 6;         /* a bank line that needs a gag flag: a payoff by construction */

/* exchange building */
export const SETUP_MAX_LINES = 2;      /* lone lines before an exchange that can be its set-up */
export const SETUP_MAX_EVENTS = 12;    /* ...when at most this many stream events before it */

/* top list */
export const TOP_DEFAULT = 8;
export const MIN_GAP_SEC = 90;         /* game seconds between two listed exchanges */
export const MIN_GAP_EVENTS = 60;      /* the same without a stream (stream indexes) */

/* Running gags, by the words that mark them in a line. The booth's three gags are in
 * personas/pbp.md (`earlyCall`, `story`, `bet`); the guests' own running jokes are in their sheets.
 * The first line with a gag's mark raises it; a later line with a mark of the same gag pays it off. */
export const GAG_MARKS = {
  earlyCall: ['喊得像', '喊錯', '喊太早', '太早喊', '喊太晚', '又想喊'],
  story: ['我當年'],
  bet: ['鹹酥雞'],
  overtime: ['加班', '上班', '下班', '主管', '打卡'],   /* fan-owls.md */
  mortgage: ['房貸'],                                   /* fan-pheasants.md (on fan lines only: the team name has it) */
};
const GAG_SPEAKERS = { mortgage: ['fan'] };

const isIntro = l => !!l.src;

/* bank lines as patterns: slot {x} matches any text; punctuation-insensitive */
const norm = t => String(t).replace(/[\s，。！？、…—「」『』,.!?~～-]/g, '');
const esc = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function bankPatterns(bank) {
  const out = [];
  if (!bank) return out;
  const add = (text, e) => {
    if (typeof text !== 'string') return;
    const parts = norm(text).split(/\{[^}]*\}/);
    if (parts.join('').length < 4) return;   /* a pure slot line ({desc}) is no evidence */
    out.push({ re: new RegExp('^' + parts.map(esc).join('.+?') + '$'), once: !!e.once, needs: !!(e.needs && e.needs.length) });
  };
  for (const t of Object.values(bank.triggers || {})) for (const e of t.exchanges || []) {
    add(e.call, e); add(e.response, e); for (const a of e.alt || []) add(a, e);
  }
  for (const m of bank.fan || []) for (const [, text] of m.lines || []) add(text, m);
  return out;
}

/* exchanges of a script: [{at, first, last, lines: [line index], speakers}] in script order */
export function exchangesOf(script) {
  const L = script.lines || [], groups = [];
  L.forEach((l, k) => {
    if (isIntro(l)) return;
    const g = groups[groups.length - 1];
    if (g && g.at === l.at) g.lines.push(k); else groups.push({ at: l.at, lines: [k] });
  });
  const out = [];
  for (let n = 0; n < groups.length; n++) {
    const g = groups[n], lines = [...g.lines];
    for (let back = 1; back <= SETUP_MAX_LINES; back++) {
      const p = groups[n - back], next = groups[n - back + 1];
      if (!p || p.lines.length !== 1 || next.at - p.at > SETUP_MAX_EVENTS) break;
      /* an intro between the set-up and the exchange means a new batter: not the same moment */
      if (L.slice(p.lines[0] + 1, next.lines[0]).some(isIntro)) break;
      lines.unshift(p.lines[0]);
    }
    out.push({ at: g.at, first: lines[0], last: lines[lines.length - 1], lines, speakers: [...new Set(lines.map(k => L[k].speaker))] });
  }
  return out;
}

/* Every exchange with its banter score and why: [{at, first, last, score, parts, speakers}].
 * opts.bank: the fallback bank (`lines.json`) for once-only and gag-payoff lines. */
export function banterScores(script, opts = {}) {
  const L = script.lines || [], pats = bankPatterns(opts.bank);
  const raised = new Set();
  const gagsOf = l => Object.entries(GAG_MARKS)
    .filter(([g, marks]) => (!GAG_SPEAKERS[g] || GAG_SPEAKERS[g].includes(l.speaker)) && marks.some(m => l.text.includes(m)))
    .map(([g]) => g);
  /* gag state is causal: a line pays off only what was raised by an earlier line */
  const payoff = L.map(() => []);   /* per line: the gags it pays off */
  L.forEach((l, k) => { for (const g of gagsOf(l)) { if (raised.has(g)) payoff[k].push(g); raised.add(g); } });
  const bankHit = L.map(l => { const t = norm(l.text); return pats.find(p => p.re.test(t)) || null; });

  return exchangesOf(script).map(x => {
    const parts = {};
    const nSpeakers = x.speakers.length;
    if (nSpeakers >= 2) {
      let turns = 0;
      for (let j = 1; j < x.lines.length; j++) if (L[x.lines[j]].speaker !== L[x.lines[j - 1]].speaker) turns++;
      parts.speakers = SPEAKER_POINTS * (nSpeakers - 1);
      parts.turns = TURN_POINTS * turns;
      if (x.speakers.includes('fan')) parts.fan = FAN_POINTS;
      const amused = x.lines.filter(k => L[k].emotion === 'amused').length;
      if (amused) parts.amused = AMUSED_POINTS * amused;
      const pay = new Set(x.lines.flatMap(k => payoff[k]));
      if (pay.size) parts.gag = GAG_PAYOFF_POINTS * pay.size;
      const guest = x.lines.findIndex(k => L[k].speaker === 'fan');
      if (guest > 0 && x.lines.slice(0, guest).some(k => L[k].speaker === 'color')) parts.cue = CUE_POINTS;
      const once = x.lines.filter(k => bankHit[k] && bankHit[k].once).length;
      if (once) parts.once = ONCE_POINTS * once;
      const needs = x.lines.filter(k => bankHit[k] && bankHit[k].needs).length;
      if (needs) parts.needs = NEEDS_POINTS * needs;
    }
    const score = Object.values(parts).reduce((a, v) => a + v, 0);
    return { at: x.at, first: x.first, last: x.last, score, parts, speakers: x.speakers };
  });
}

/* The top exchanges, best first, at least minGap apart (game seconds with opts.stream, else
 * stream indexes), never overlapping in lines: [{at, first, last, score, parts, speakers}].
 * Ties go to the earlier exchange. Only exchanges with a score above zero are listed. */
export function topBanter(script, opts = {}) {
  const n = opts.n != null ? opts.n : TOP_DEFAULT, st = opts.stream;
  const gap = opts.minGap != null ? opts.minGap : st ? MIN_GAP_SEC : MIN_GAP_EVENTS;
  const when = x => (st ? (st[x.at] ? st[x.at].t : 0) : x.at);
  const ranked = banterScores(script, opts).filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score || a.first - b.first);
  const out = [];
  for (const x of ranked) {
    if (out.length >= n) break;
    if (out.some(y => Math.abs(when(y) - when(x)) < gap || !(x.last < y.first || x.first > y.last))) continue;
    out.push(x);
  }
  return out;
}
