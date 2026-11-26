/* 九宮格 3D body acts (#563 part 2): which recorded mocap act (render/ clips, assets/mocap) the pitcher and the batter play for one pitch, and
 * the clip time / weight at each moment. Pure and seedable-free: it only READS the result (`out.res.kind`, `out.play`) and never changes one (rule 10);
 * nothing here uses a random number. Times are field.js script times (s): the ball leaves the hand at 0 and reaches the plate at PITCH_S.
 * The act clip numbers are the broadcast's (render/game.js PM_* / SW_*), the clips are time-warped to fit the short 九宮格 pitch. */
import { PITCH_S } from './field.js';

export const LEAD_S = 1.0;                                   // wind-up shown before the ball is released (script time starts at -LEAD_S)
export const PITCH_CLIP = { url: 'assets/mocap/pitch_124_01.json', start: 2.33, release: 111 / 30, end: 4.6, outS: [.9, 1.5] };   // knee lift -> release -> follow-through
export const SWING_CLIP = { url: 'assets/mocap/swing_124_07.json', start: 1.6, contact: 85 / 30, end: 3.6, preS: .8, postS: .8, inS: .25, outS: [.5, .8] };

/** 'swing' | 'take' | 'bunt' for one result: a whiff, foul, contact, popup or any batted ball swings; called strike / ball / steal-only take; a bunt squares. */
export function actOf(out) {
  const res = out && out.res || {}, play = out && out.play, k = res.kind;
  if (k === 'bunt' || k === 'foulBunt' || (play && play.bunt)) return 'bunt';
  if (k === 'called' || k === 'ball') return 'take';
  if (k === 'whiff' || k === 'foul' || k === 'contact' || k === 'popup' || (play && play.ball && play.ball.length)) return 'swing';
  return 'take';
}
const sat = x => Math.max(0, Math.min(1, x)), ease = x => x * x * (3 - 2 * x);

/** Pitcher: {t: clip time, w: clip weight 0..1} at script time t (s). Wind-up [-LEAD_S, 0] plays knee lift -> release, then the follow-through, fading out. */
export function pitcherAt(t, C = PITCH_CLIP) {
  if (t < -LEAD_S) return { t: C.start, w: 0 };
  const ct = t < 0 ? C.start + (C.release - C.start) * (t + LEAD_S) / LEAD_S : Math.min(C.end, C.release + t);
  return { t: ct, w: ease(sat((t + LEAD_S) / .25)) * (1 - ease(sat((t - C.outS[0]) / (C.outS[1] - C.outS[0])))) };
}

/** Batter: {t, w} for a 'swing' (nothing for take / bunt: w 0, the stance stays). Contact lands on the pitch's arrival (PITCH_S). */
export function batterAt(act, t, C = SWING_CLIP) {
  if (act !== 'swing') return { t: C.start, w: 0 };
  const t0 = PITCH_S - C.preS;
  const ct = t < PITCH_S ? C.start + (C.contact - C.start) * sat((t - t0) / C.preS) : Math.min(C.end, C.contact + (t - PITCH_S) * (C.end - C.contact) / C.postS);
  const w = ease(sat((t - (t0 - C.inS)) / C.inS)) * (1 - ease(sat((t - (PITCH_S + C.outS[0])) / (C.outS[1] - C.outS[0]))));
  return { t: ct, w };
}
