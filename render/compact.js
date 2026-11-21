/* Compact showing of a recorded game (#126). Pure: no imports, no clock, no DOM.
 * The game and its recording stay byte for byte (rules 10 to 12): only the viewer's time on dead air changes. A stretch where nothing
 * on the field moves AND no booth line is playing or about to play is shortened to a named minimum; the picture over it is the same
 * at both ends, so the cut cannot be seen. Motion is never sped up, no pitch or play is cut, and a line is never clipped or dropped.
 *
 * Input, from render/game.js (it knows when its own figures stop moving):
 *   events: [{t, d, head, tail, kind}] in game order, game seconds. Nothing moves in [t, t+head) and in [t+tail, t+d).
 *           head >= d means the whole event is still. kind: 'half' (half-inning change), 'change' (pitching change), else 'pitch'.
 *   lines:  the booth's lines [{time, end?}] (end missing: CP_LINE_EST s), [] when there is no booth.
 * Output: the cuts [{at, to}]: game time [at, to) is not shown; playback that reaches `at` goes on from `to`.
 * Same recording + same script = same cuts for everybody (needed by the 21:00 synchronized showing). */
export const CP_PITCH_GAP = 1.5;   /* s of stillness kept between pitches */
export const CP_HALF_GAP = 8;      /* s kept in a still stretch that touches a half-inning change */
export const CP_CHANGE_GAP = 4;    /* s kept in a still stretch that touches a pitching change */
export const CP_LINE_LEAD = .5;    /* s of stillness kept before a booth line starts */
export const CP_LINE_TAIL = .3;    /* s after a booth line has ended before anything is cut */
export const CP_LINE_EST = 3;      /* s a line lasts when the plan gives no end (browser voice, no recorded clip) */
export const CP_MIN_CUT = .25;     /* s: shorter cuts are not worth a jump */

const GAP_OF = { pitch: CP_PITCH_GAP, half: CP_HALF_GAP, change: CP_CHANGE_GAP };
const RANK = { pitch: 0, change: 1, half: 2 };

/* still stretches of the whole game [{a, b, kind}]: an event's still tail, joined with the events after it that are still from their
 * start (all through, or up to their head) */
export function stillStretches(events) {
  const out = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!(e.tail < e.d)) continue;
    let a = e.t + Math.max(0, e.tail), b = e.t + e.d, kind = e.kind || 'pitch', j = i + 1;
    for (; j < events.length; j++) {
      const n = events[j]; if (n.t > b + 1e-6) break;
      const h = Math.max(0, Math.min(n.head || 0, n.d));
      if (RANK[n.kind] > RANK[kind]) kind = n.kind;
      b = n.t + h;
      if (h < n.d) break;
    }
    if (b - a > 1e-6) out.push({ a, b, kind });
    i = j - 1;   /* event j (head < d) may start the next stretch with its own tail */
  }
  return out;
}

/* the cuts [{at, to}], sorted, not overlapping */
export function compactCuts(events, lines = []) {
  const busy = lines.map(l => {
    const s = l.time, e = l.end != null ? l.end : s + CP_LINE_EST;
    return [s - CP_LINE_LEAD, e + CP_LINE_TAIL];
  }).sort((x, y) => x[0] - y[0]);
  const cuts = [];
  for (const st of stillStretches(events)) {
    const gap = GAP_OF[st.kind] ?? CP_PITCH_GAP;
    /* free pieces of the stretch: not inside any line's window */
    let a = st.a;
    const pieces = [];
    for (const [s, e] of busy) {
      if (e <= a) continue; if (s >= st.b) break;
      if (s > a) pieces.push([a, s]);
      a = Math.max(a, e);
    }
    if (a < st.b) pieces.push([a, st.b]);
    for (const [p, q] of pieces) if (q - p - gap >= CP_MIN_CUT) cuts.push({ at: p + gap, to: q });
  }
  return cuts.sort((x, y) => x.at - y.at);
}

/* The clock of a compact showing over a game of `dur` game seconds. View time = what the viewer's bar shows. */
export function compactClock(cuts, dur) {
  const at = [], to = [], vAt = [];
  let removed = 0;
  for (const c of cuts) { if (c.at >= dur) break; const t2 = Math.min(c.to, dur); at.push(c.at); to.push(t2); vAt.push(c.at - removed); removed += t2 - c.at; }
  const n = at.length;
  /* index of the last cut whose start is <= T (or -1) */
  const last = (A, T) => { let lo = -1, hi = n - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (A[m] <= T) lo = m; else hi = m - 1; } return lo; };
  const removedBefore = k => (k < 0 ? 0 : (at[k] - vAt[k]) + (to[k] - at[k]));
  return {
    cuts: at.map((a, k) => ({ at: a, to: to[k] })), real: dur, dur: dur - removed, removed,
    /* game time -> view time (inside a cut: where the cut is on the bar) */
    toView(T) { const k = last(at, T); if (k < 0) return T; return T < to[k] ? vAt[k] : T - removedBefore(k); },
    /* view time -> game time (exactly on a cut: after it) */
    toGame(v) { const k = last(vAt, v); return k < 0 ? v : v + removedBefore(k); },
    /* playback moved from `prev` to `T`: if it reached the start of a cut on the way, go on from the end of it (with the same overshoot) */
    step(prev, T) {
      for (let k = last(at, prev) + 1; k < n && at[k] <= T; k++) T = to[k] + (T - at[k]);
      return T;
    },
  };
}
