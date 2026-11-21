/* Tension index: how much the current moment matters, 0 (nothing at stake) to 100 (the game
 * hangs on this pitch). Script writing uses it to pick how excited a line should be.
 *
 * Pure function of the engine event stream. The value at index i depends only on events
 * 0..i, so it can never leak what happens next (rule 15). It reads the stream and changes
 * nothing; it does not decide or alter any result (rule 10). No randomness, no clock.
 *
 * It is a broadcast heuristic shaped like baseball's leverage index, not a win-probability
 * model: inning x score x bases/outs x count, plus the walk-off and tying-run situations. */

/* the weight of each inning: early innings matter less, extra innings the most */
const INNING_WEIGHT = [0.6, 0.6, 0.6, 0.8, 0.8, 0.8, 1.0, 1.2, 1.5];
const EXTRA_INNING_WEIGHT = 1.6;
/* score difference (absolute) -> weight; 5 or more runs apart is close to dead */
const MARGIN_WEIGHT = [1.0, 0.9, 0.7, 0.5, 0.3];
const BLOWOUT_WEIGHT = 0.1;
/* the tying run is at the plate or on base: the margin matters less than usual */
const TYING_RUN_UP_WEIGHT = 0.95;
/* bases, as a bit mask (1st = 1, 2nd = 2, 3rd = 4) -> weight; loaded is the top */
const BASES_WEIGHT = [1.0, 1.35, 1.55, 1.6, 1.9, 2.0, 2.2, 2.6];
/* outs before the play -> weight; with two out the next pitch can end the threat */
const OUTS_WEIGHT = [0.9, 1.0, 1.15];
const THREE_OUTS_WEIGHT = 0.5;     /* between half innings */
const FULL_COUNT_WEIGHT = 1.2;
const TWO_STRIKES_WEIGHT = 1.08;
/* bottom of the ninth or later, home team tied or behind: one swing can end it */
const WALKOFF_WEIGHT = 1.25;
const LAST_INNING = 9;
const BASES = 3;
const HOME_PLATE = BASES + 1;
/* the raw value that maps to 100: roughly bases loaded, two out, bottom 9, down one, full count */
const RAW_AT_MAX = 6.5;
export const TENSION_MAX = 100;

const clampInt = v => Math.max(0, Math.min(TENSION_MAX, Math.round(v)));

/* Running situation, updated event by event. */
function createSituation() {
  return { inning: 1, half: 0, outs: 0, score: [0, 0], bases: [null, null, null, null], balls: 0, strikes: 0, over: false };
}
function applyEvent(s, x) {
  switch (x.type) {
    case 'half_start': s.inning = x.inning; s.half = x.half; s.outs = 0; s.bases = [null, null, null, null]; s.balls = 0; s.strikes = 0; break;
    case 'pitch': s.balls = x.count[0]; s.strikes = x.count[1]; break;
    case 'call': s.balls = x.count[0]; s.strikes = x.count[1]; break;
    case 'runner_placed': s.bases[x.base] = x.runner; break;
    case 'runner_advance':
      if (x.from >= 1 && x.from <= BASES && s.bases[x.from] === x.runner) s.bases[x.from] = null;
      if (x.to >= 1 && x.to <= BASES) s.bases[x.to] = x.runner;
      break;
    case 'out':
      if (x.from >= 1 && x.from <= BASES && s.bases[x.from] === x.runner) s.bases[x.from] = null;
      s.outs = x.outs; break;
    case 'run_scored': s.score[x.team] = (s.score[x.team] || 0) + 1; break;
    case 'pa_end': s.balls = 0; s.strikes = 0; break;
    case 'half_end': s.outs = x.outs; s.bases = [null, null, null, null]; if (x.score) s.score = [...x.score]; break;
    case 'game_end': s.over = true; if (x.score) s.score = [...x.score]; break;
    default: break;
  }
}

/* Tension of a situation (0..100). Exported for the checks and for hand-made situations. */
export function tensionOf(s) {
  if (s.over) return 0;
  const batting = s.half, diff = (s.score[batting] || 0) - (s.score[1 - batting] || 0), gap = Math.abs(diff);
  const onBase = s.bases.slice(1, HOME_PLATE).filter(Boolean).length;
  const mask = (s.bases[1] ? 1 : 0) | (s.bases[2] ? 2 : 0) | (s.bases[3] ? 4 : 0);
  const inningW = s.inning > LAST_INNING ? EXTRA_INNING_WEIGHT : INNING_WEIGHT[s.inning - 1];
  let marginW = gap < MARGIN_WEIGHT.length ? MARGIN_WEIGHT[gap] : BLOWOUT_WEIGHT;
  if (diff < 0 && gap <= onBase + 1) marginW = Math.max(marginW, TYING_RUN_UP_WEIGHT);
  const outsW = s.outs >= 3 ? THREE_OUTS_WEIGHT : OUTS_WEIGHT[s.outs];
  const countW = s.balls === 3 && s.strikes === 2 ? FULL_COUNT_WEIGHT : s.strikes === 2 ? TWO_STRIKES_WEIGHT : 1;
  const walkoffW = s.half === 1 && s.inning >= LAST_INNING && diff <= 0 && s.outs < 3 ? WALKOFF_WEIGHT : 1;
  return clampInt(TENSION_MAX * inningW * marginW * BASES_WEIGHT[mask] * outsW * countW * walkoffW / RAW_AT_MAX);
}

/* One tension value per stream event: track[i] is the tension right after event i. */
export function tensionTrack(stream) {
  const s = createSituation(), out = new Array(stream.length);
  for (let i = 0; i < stream.length; i++) { applyEvent(s, stream[i]); out[i] = tensionOf(s); }
  return out;
}

/* The bases as the index sees them after event i (for the checks). */
export function basesAfter(stream, i) {
  const s = createSituation();
  for (let k = 0; k <= i; k++) applyEvent(s, stream[k]);
  return s.bases.slice(1, HOME_PLATE).map(Boolean);
}

/* Emotion tag for a line, from the tension at its moment and what happened. Script writing
 * and the synthesis sheet use these names. */
export const EMOTIONS = ['calm', 'excited', 'tense', 'thrilled', 'disappointed', 'amused'];
const TENSE_FROM = 55, EXCITED_FROM = 25;
export function emotionFor(tension, { big = false, letdown = false, joke = false } = {}) {
  if (joke) return 'amused';
  if (letdown) return 'disappointed';
  if (big) return tension >= EXCITED_FROM ? 'thrilled' : 'excited';
  if (tension >= TENSE_FROM) return 'tense';
  if (tension >= EXCITED_FROM) return 'excited';
  return 'calm';
}
