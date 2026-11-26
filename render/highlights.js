/* Highlights showing of a recorded game (#118). Pure: the reel is computed from the recorded event stream (rule 10 spirit:
 * the engine decided what happened, nothing is hand-picked). Loaded by play.html as window.HIGHLIGHTS; render/game.js plays it
 * with the player bar's seek. No import from commentary/ (rule 9): the booth lines are passed in by the caller.
 *
 * A play is in the reel when it is a pitch event that scores (`runs > 0`) or the last pitch of the game (the last out, or the
 * walk-off). A segment starts HL_LEAD s before the play and ends when the booth has finished the lines bound to the play
 * (HL_LINE_PAD after the last one ends) but never before the play itself is over; with no bound line it ends HL_TAIL s after the
 * play. Segments closer than HL_MERGE_GAP merge into one. */
export const HL_LEAD = 3;        /* s of picture before the pitch of the play (pitcher set, batter in the box) */
export const HL_TAIL = 2;        /* s after the end of a play that no booth line is bound to */
export const HL_LINE_PAD = 0.8;  /* s after the last bound line has ended */
export const HL_LINE_EST = 3;    /* s a line lasts when the plan gives no end (browser voice, no recorded clip) */
export const HL_PLAY_MAX = 24;   /* s: a long event (a home-run trot) is followed at most this long, so the reel keeps moving */
export const HL_MERGE_GAP = 3;   /* s: segments whose gap is shorter than this play as one */

/* the event indices of the plays in the reel, in game order */
export function highlightPlays(game) {
  const ev = game.ev, out = [];
  let last = -1;
  ev.forEach((e, i) => { if (e.k !== 'P') return; last = i; if (e.runs > 0) out.push(i); });
  if (last >= 0 && !out.includes(last)) out.push(last);
  return out;
}

/* [{start, end, plays: [event index], first: event index}] in game order. lines: the booth's lines ({at: stream index, time,
 * end?}), or [] when there is no booth. */
export function highlightSegments(game, lines = []) {
  const ev = game.ev, st = game.stream || [], lastEnd = new Map();
  for (const l of lines) {
    const s = st[l.at]; if (!s) continue;
    const end = l.end != null ? l.end : (l.time != null ? l.time : s.t) + HL_LINE_EST;
    lastEnd.set(s.f, Math.max(lastEnd.get(s.f) || 0, end));
  }
  const segs = [];
  for (const i of highlightPlays(game)) {
    const e = ev[i], playEnd = e.t + Math.min(e.d, HL_PLAY_MAX);
    const start = Math.max(0, e.t - HL_LEAD);
    const end = Math.min(game.dur, lastEnd.has(i) ? Math.max(playEnd, lastEnd.get(i) + HL_LINE_PAD) : playEnd + HL_TAIL);
    const prev = segs[segs.length - 1];
    if (prev && start - prev.end < HL_MERGE_GAP) { prev.end = Math.max(prev.end, end); prev.plays.push(i); }
    else segs.push({ start, end, plays: [i], first: i });
  }
  return segs;
}

/* total length of a reel in seconds */
export const reelLength = segs => segs.reduce((a, s) => a + s.end - s.start, 0);
