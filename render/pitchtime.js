/* #643: when the pitch leaves the hand, from the shown km/h (pure, no DOM, no three.js).
 * The ball used to fly RELEASE->ARRIVE in a fixed .45 s whatever the speed (implied 138 km/h; render/tools/phys_audit.mjs row 1).
 * Now it leaves at ARRIVE - dist/(kmh/3.6) and still reaches the plate spot exactly at ARRIVE. The pitcher's clip is warped so its
 * release frame lands on that time and the warp is gone by PT_TAIL, so nothing after the pitch frame's own motion moves (cpEvents).
 *   pitchRelease(dist, kmh, release, arrive) -> release time (clamped to [release-PT_EARLY, release+PT_LATE])
 *   pitchU(u, tR, release, tail)             -> clip time for event time u (continuous, monotone, identity from tail on) */
export const PT_EARLY = .2, PT_LATE = .12, PT_TAIL = 2.2;
export const pitchRelease = (dist, kmh, release, arrive) => {
  if (!(dist > 0) || !(kmh > 0)) return release;
  const t = arrive - dist / (kmh / 3.6);
  return Math.max(release - PT_EARLY, Math.min(release + PT_LATE, t));
};
export const pitchU = (u, tR, release, tail = PT_TAIL) =>
  u >= tail ? u : u < tR ? u * release / tR : release + (u - tR) * (tail - release) / (tail - tR);
