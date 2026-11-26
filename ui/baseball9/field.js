/* 九宮格棒球 field picture (#430 part 1): the pitch and the batted ball on a small top-down field, plain canvas 2D (no three.js: the page
 * loads none, and the prototype's look only needs a diamond, a ball and its shadow). It only READS a result from game.js (`out.play.ball`
 * = the points ball.js already computed, `out.res`, `out.steal`); it never changes one (rule 10), and nothing here uses a random number,
 * so the same result draws the same picture. `buildBeats` / `ballAt` are pure (tested without a DOM); `createField` is the canvas part.
 * Units as ball.js: metres, seconds, home (0,0), +z toward centre field, +x toward first base. Runners (part 2) come from `out.play.runners` (play.js `sc.runners`). */
import { BASES } from './play.js';
import { fenceR, POS_N } from './ball.js';

export const PITCH_S = .55;                 // pitch flight, mound to plate
export const MOUND = POS_N[0];              // [0, 18.4]
export const PLATE_Y = .8;                  // pitch height at the plate (m)
export const BEAT_S = 1.1;                  // a text beat (strikeout, walk, steal, ...) stays this long
export const SPEEDS = [1, 3];               // speed toggle
export const VIEW = { w: 230, top: 112, bottom: -6 };   // metres shown: width, far edge (z), near edge (z)
export const ARC_PX = .7;                   // pixels of lift per metre of ball height, in field metres scale

/** The script of one pitch: {dur, pitch:{t0,t1}, ball:[{t,x,y,z,air}] (already shifted after the pitch), beats:[{t,txt}], hr}. Pure. */
export function buildBeats(out) {
  const res = out && out.res || {}, play = out && out.play, beats = [], ball = [], runners = [];
  let dur = PITCH_S + .3, hr = false;
  if (play && play.ball && play.ball.length) {
    for (const p of play.ball) ball.push({ t: PITCH_S + p.t, x: p.x, y: p.y, z: p.z, air: p.air !== false });
    hr = play.kind === 'HR'; dur = Math.max(dur, PITCH_S + (play.dur || play.ball[play.ball.length - 1].t) + .3);
    if (hr) beats.push({ t: ball[ball.length - 1].t, txt: '全壘打！' });
    for (const r of play.runners || []) if (r.pts && r.pts.length) {
      const pts = r.pts.map(p => ({ t: PITCH_S + p.t, x: p.x, z: p.z })); runners.push({ bat: !!r.bat, out: !!r.out, pts });
      dur = Math.max(dur, pts[pts.length - 1].t + .3); }
  } else {
    const k = res.kind, txt = k === 'whiff' ? '揮空' : k === 'called' ? '好球' : k === 'ball' ? '壞球' : k === 'foul' || k === 'foulBunt' ? '界外' : k === 'contact' ? '擊中' : k === 'bunt' ? '觸擊' : k === 'popup' ? '內野高飛' : '';
    if (txt) beats.push({ t: PITCH_S, txt });
    if (out && out.paEnd && !(play)) { const w = /保送/.test(out.txt || ''), kk = /三振/.test(out.txt || ''); if (w || kk) beats.push({ t: PITCH_S + .35, txt: w ? '保送' : '三振！' }); }
    if (out && out.steal) beats.push({ t: PITCH_S + .5, txt: out.steal.ok ? '盜壘成功' : '盜壘失敗' });
    dur = Math.max(dur, ...beats.map(b => b.t + BEAT_S));
  }
  return { dur, pitch: { t0: 0, t1: PITCH_S }, ball, beats, hr, runners };
}

/** Ball position at time t: pitch leg, then the batted-ball points (linear between them); null when no ball is shown. Pure. */
export function ballAt(S, t) {
  if (t < 0) return null;
  if (t <= S.pitch.t1) { const u = t / S.pitch.t1; return { x: MOUND[0] * (1 - u), z: MOUND[1] * (1 - u), y: 1.7 + (PLATE_Y - 1.7) * u, air: true }; }
  const B = S.ball; if (!B.length || t < B[0].t) return null;
  if (t >= B[B.length - 1].t) return { x: B[B.length - 1].x, y: B[B.length - 1].y, z: B[B.length - 1].z, air: B[B.length - 1].air };
  let i = 1; while (B[i].t < t) i++;
  const a = B[i - 1], b = B[i], u = (t - a.t) / ((b.t - a.t) || 1);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u, z: a.z + (b.z - a.z) * u, air: b.air };
}

/** Position of one scripted runner at time t (linear between points, held before the first and after the last point). Pure. */
export function runnerAt(R, t) {
  const P = R.pts; if (t <= P[0].t) return { x: P[0].x, z: P[0].z };
  const L = P[P.length - 1]; if (t >= L.t) return { x: L.x, z: L.z };
  let i = 1; while (P[i].t < t) i++;
  const a = P[i - 1], b = P[i], u = (t - a.t) / ((b.t - a.t) || 1); return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}

/** Canvas field. `createField(canvas)` -> {play(out), skip(), setSpeed(n)}; no canvas or no 2D context -> null (the screen then just has no picture). */
export function createField(canvas) {
  const cx = canvas && canvas.getContext && canvas.getContext('2d'); if (!cx) return null;
  const W = canvas.width, H = canvas.height, k = W / VIEW.w, ox = W / 2, oy = H + VIEW.bottom * k;
  const X = x => ox + x * k, Y = z => oy - z * k;
  let S = null, t0 = 0, speed = SPEEDS[0], raf = 0, trail = [];
  const css = (n, d) => (typeof getComputedStyle === 'function' && getComputedStyle(canvas).getPropertyValue(n).trim()) || d;
  function field() {
    cx.clearRect(0, 0, W, H); cx.fillStyle = css('--cell', '#1b2d22'); cx.fillRect(0, 0, W, H);
    cx.beginPath(); for (let i = -60; i <= 60; i++) { const a = i / 60 * Math.PI / 4, r = fenceR(a); cx[i === -60 ? 'moveTo' : 'lineTo'](X(r * Math.sin(a)), Y(r * Math.cos(a))); }
    cx.lineTo(X(0), Y(0)); cx.closePath(); cx.fillStyle = css('--on', '#2f6b46'); cx.fill(); cx.strokeStyle = css('--acc', '#e9b949'); cx.lineWidth = 2; cx.stroke();
    cx.beginPath(); cx.moveTo(X(0), Y(0)); for (const b of BASES.slice(1, 4)) cx.lineTo(X(b[0]), Y(b[1])); cx.closePath();
    cx.fillStyle = '#b9895a'; cx.fill(); cx.strokeStyle = '#f1efe6'; cx.lineWidth = 1.5; cx.stroke();
    cx.fillStyle = '#f1efe6'; for (const b of BASES.slice(0, 4)) cx.fillRect(X(b[0]) - 3, Y(b[1]) - 3, 6, 6);
    cx.beginPath(); cx.arc(X(MOUND[0]), Y(MOUND[1]), 4, 0, 6.3); cx.fillStyle = '#b9895a'; cx.fill();
  }
  function frame(now) {
    const t = ((now - t0) / 1000) * speed; field();
    const p = ballAt(S, t); if (p) { trail.push(p); if (trail.length > 24) trail.shift(); }
    cx.strokeStyle = 'rgba(241,239,230,.45)'; cx.lineWidth = 1.5; cx.beginPath(); trail.forEach((q, i) => cx[i ? 'lineTo' : 'moveTo'](X(q.x), Y(q.z) - q.y * ARC_PX * k)); cx.stroke();
    for (const R of S.runners) { const q = runnerAt(R, t), end = t >= R.pts[R.pts.length - 1].t;
      cx.fillStyle = R.out && end ? 'rgba(220,80,80,.55)' : R.bat ? '#e9b949' : '#8fd3ff'; cx.beginPath(); cx.arc(X(q.x), Y(q.z), 3.6, 0, 6.3); cx.fill(); }
    if (p) { cx.fillStyle = 'rgba(0,0,0,.35)'; cx.beginPath(); cx.ellipse(X(p.x), Y(p.z), 3, 1.6, 0, 0, 6.3); cx.fill();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(X(p.x), Y(p.z) - p.y * ARC_PX * k, 3.2, 0, 6.3); cx.fill(); }
    for (const b of S.beats) if (t >= b.t && t < b.t + BEAT_S) { cx.font = 'bold 22px "Noto Sans TC", system-ui, sans-serif'; cx.textAlign = 'center'; cx.fillStyle = css('--acc', '#e9b949'); cx.fillText(b.txt, W / 2, H * .3); }
    if (t < S.dur) raf = requestAnimationFrame(frame); else { raf = 0; S = null; }
  }
  const api = {
    play(out) { api.skip(); S = buildBeats(out); trail = []; t0 = performance.now(); raf = requestAnimationFrame(frame); },
    skip() { if (raf) cancelAnimationFrame(raf); raf = 0; S = null; trail = []; field(); },
    setSpeed(n) { if (SPEEDS.includes(n)) { const now = performance.now(); if (S) t0 = now - (now - t0) * speed / n; speed = n; } },
  };
  field(); return api;
}
