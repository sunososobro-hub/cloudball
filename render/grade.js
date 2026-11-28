/* #208 item 5, one colour mood per park (plain data + pure maths, no three.js, no DOM, no Date / Math.random).
 * Each park sky (SKIES in game.js: night 台北, dusk 新竹, afternoon 高雄, morning 台東) names a MOOD here. applySky runs the light colours
 * (key, fill, hemisphere) through `grade` and multiplies the exposure by `mood.exp`: uniforms and light values only, no extra pass, no recompile,
 * so every tier gets it and a seek shows the same picture as playing there. Tune the numbers here; `tests/grade.check.mjs` guards the ranges. */
export const MOOD_NEUTRAL = { tint: [1, 1, 1], amt: 0, exp: 1 };
export const MOODS = {
  night: { tint: [.86, .93, 1.12], amt: .35, exp: 1 },      /* cool blue-teal lamp night */
  dusk: { tint: [1.12, .94, .86], amt: .4, exp: 1.02 },     /* warm amber-rose */
  afternoon: { tint: [1.04, 1.02, .94], amt: .25, exp: 1 }, /* clean sun, slightly warm */
  morning: { tint: [.94, 1.0, 1.1], amt: .3, exp: 1 },      /* fresh, cool and clear */
};
export const MOOD_AMT_MAX = .6, MOOD_EXP_MIN = .9, MOOD_EXP_MAX = 1.1, MOOD_TINT_MIN = .7, MOOD_TINT_MAX = 1.3;

/* 0xRRGGBB -> 0xRRGGBB: each channel times (1 + amt * (tint - 1)); amt 0 or the neutral tint = identity. Channels clamp to 0..255. */
export function grade(hex, mood) {
  const m = mood || MOOD_NEUTRAL, ch = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const o = ch.map((v, i) => Math.max(0, Math.min(255, Math.round(v * (1 + m.amt * (m.tint[i] - 1))))));
  return (o[0] << 16) | (o[1] << 8) | o[2];
}
export const moodOf = name => MOODS[name] || MOOD_NEUTRAL;

/* #209 item 4, contact-shadow softness per sky: `r` scales the patch under each figure (wider), `a` scales the patch and fan opacity (softer).
 * Hard lamp night = 1 / 1; overcast-like daylight and dusk get broad, faint shadows. Pure; applied in game.js updateContactShadows. */
export const SOFT_NEUTRAL = { r: 1, a: 1 };
export const SOFT = {
  night: { r: 1, a: 1 },
  dusk: { r: 1.3, a: .85 },
  afternoon: { r: 1.6, a: .7 },
  morning: { r: 1.45, a: .75 },
};
export const SOFT_R_MAX = 2, SOFT_A_MIN = .5;
export const softOf = name => SOFT[name] || SOFT_NEUTRAL;
