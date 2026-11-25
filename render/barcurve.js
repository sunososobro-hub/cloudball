/* Excitement curve and scoring dots of the player bar (#121). Pure: computed once from the recorded game, no network, no
 * stored file, no hand-picked list (rule 10 spirit; the engine decided what happened). The tension function is passed in by the
 * caller (window.COMMENTARY.tensionTrack), so render/ does not import commentary/ and nothing is copied.
 *
 * curve: one point per play (pitch event), height = the highest tension inside the play, smoothed over CV_SMOOTH plays on each
 * side and scaled to the game's own maximum (0..1). dots: one per play with `runs > 0`, `hr` for a home run. */
export const CV_SMOOTH = 2;      /* plays on each side in the moving average */
export const CV_FLOOR = 0.06;    /* a curve of all zeros still draws a hairline, not nothing */

/* the label of a scoring play: `10 上・2 分砲` */
export function dotLabel(e) {
  const hr = !!(e.play && e.play.res === 'HR'), n = e.runs;
  const what = hr ? (n === 1 ? '陽春砲' : n >= 4 ? '滿貫砲' : `${n} 分砲`) : `得 ${n} 分`;
  return `${e.s0.inn} ${e.s0.half ? '下' : '上'}・${what}`;
}

/* game: {ev, stream}; tensionTrack: stream -> number[] (one value per stream event, 0..100) */
export function barCurve(game, tensionTrack) {
  const ev = game.ev, st = game.stream || [], track = tensionTrack(st), top = new Map();
  st.forEach((x, i) => top.set(x.f, Math.max(top.has(x.f) ? top.get(x.f) : 0, track[i])));
  const raw = [], dots = [];
  let prev = 0;
  ev.forEach((e, i) => {
    if (e.k !== 'P') return;
    prev = top.has(i) ? top.get(i) : prev;
    raw.push({ t: e.t, v: prev });
    if (e.runs > 0) dots.push({ t: e.t, i, runs: e.runs, hr: !!(e.play && e.play.res === 'HR'), label: dotLabel(e) });
  });
  const sm = raw.map((p, k) => {
    let s = 0, n = 0;
    for (let j = Math.max(0, k - CV_SMOOTH); j <= Math.min(raw.length - 1, k + CV_SMOOTH); j++) { s += raw[j].v; n++; }
    return s / n;
  });
  const max = Math.max(...sm, 1e-9);
  const pts = raw.map((p, k) => ({ t: p.t, v: Math.max(CV_FLOOR, sm[k] / max) }));
  return { pts, dots };
}
