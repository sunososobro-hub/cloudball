/* #42: where each fielder's half-inning jog starts and ends (pure, no DOM, no three.js).
 * The retiring side jogs off from the spot the last pitch of the half left him on (the engine's fielderStart for that
 * pitch's bases and outs, e.g. double-play depth), not from the spot of the break's own base state; the new side jogs
 * out to the spot the next pitch poses him on (holding the extra-inning runner, the catcher's spot), not to his home.
 * Without this the figures jumped up to 4.4 m at the first or last frame of the break (render/tools/brk_probe.py).
 *   brkEnds(ev, i, key, start) -> {from, to}: start = fielderStart(key, bases, outs) from the engine. */
export function brkEnds(ev, i, key, start) {
  const e = ev[i], prev = ev[i - 1], next = ev[i + 1];
  const at = q => start(key, q.b, q.outs);
  const from = at(prev && prev.k === 'P' && prev.s0 ? prev.s0 : e.s0);
  const to = at(next && next.s0 ? next.s0 : e.s1 || e.s0);
  return { from, to };
}

