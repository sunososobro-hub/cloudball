/* #209 item 2, part 2a: ground that has been played on. Plain data + pure maths (no three.js, no DOM, no Date / Math.random).
 * `wearDabs(n)` = the scuffs on the ground after n pitches of the game (n = the pitch / event index, so a seek to event n shows exactly what
 * playing to n shows). Dab i depends only on i (an integer hash), and the list for n is the first `wearCount(n)` dabs, so wear only grows:
 * wearDabs(n) is always a prefix of wearDabs(n + k). Nothing here is drawn yet; part 2b paints these onto the field canvas on max.
 * Dab = {kind, x, z, r, a}: world metres (x right, z toward the plate = 0 at the plate, the mound at -18.4), radius m, alpha 0..1.
 * Kinds: 'box' scuffed batter's-box chalk, 'cleat' cleat marks round the plate and the bases, 'dust' dirt on the plate. */
export const WEAR_FULL_N = 300;        /* pitches until the ground is fully worn (about one game) */
export const WEAR_MAX = { box: 160, cleat: 220, dust: 60 };  /* dab count at full wear, per kind */
export const WEAR_SPOTS = { box: [[-1.05, -.1, 1.1], [1.05, -.1, 1.1]], dust: [[0, 0, .3]],
  cleat: [[0, 0, 1.6], [19.4, -19.4, 1.2], [0, -38.8, 1.2], [-19.4, -19.4, 1.2], [0, -18.4, 1.8]] };   /* [x, z, spread radius] */
export const WEAR_ALPHA = { box: .6, cleat: .3, dust: .4 };
export const WEAR_KINDS = ['box', 'cleat', 'dust'];

/* integer hash -> 0..1 (same on every machine: only 32-bit integer maths) */
const h01 = (i, k) => { let x = (Math.imul(i + 1, 0x9e3779b1) ^ Math.imul(k + 1, 0x85ebca6b)) >>> 0; x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d) >>> 0; x = Math.imul(x ^ (x >>> 12), 0x297a2d39) >>> 0; return ((x ^ (x >>> 15)) >>> 0) / 4294967296; };

/* how many dabs of a kind exist after n pitches: 0 at n <= 0, WEAR_MAX at WEAR_FULL_N or more, never decreasing */
export const wearCount = (kind, n) => Math.floor(WEAR_MAX[kind] * Math.max(0, Math.min(1, (n || 0) / WEAR_FULL_N)));

export function wearDabs(n) {
  const out = [];
  WEAR_KINDS.forEach((kind, ki) => {
    const spots = WEAR_SPOTS[kind], c = wearCount(kind, n);
    for (let i = 0; i < c; i++) {
      const s = spots[Math.floor(h01(i, ki * 8 + 1) * spots.length) % spots.length], t = h01(i, ki * 8 + 2) * 6.283185307, d = Math.sqrt(h01(i, ki * 8 + 3)) * s[2];
      out.push({ kind, x: s[0] + Math.cos(t) * d, z: s[1] + Math.sin(t) * d, r: .03 + h01(i, ki * 8 + 4) * .09, a: WEAR_ALPHA[kind] * (.4 + h01(i, ki * 8 + 5) * .6) });
    }
  });
  return out;
}

/* Pitches thrown before event i, for every i of a game's event list (a Float-free prefix array, length ev.length). Only real pitches count
   (k 'P', not an intentional walk or a balk): the wear a viewer sees at event i is wearDabs(pitchPrefix(ev)[i]), so a seek shows what playing to i shows. */
export const pitchPrefix = ev => { const out = new Array(ev.length); let n = 0; for (let i = 0; i < ev.length; i++) { out[i] = n; if (ev[i].k === 'P' && ev[i].r !== 'ibb' && ev[i].r !== 'bk') n++; } return out; };

/* #209 item 2, part 8: drag marks after slides. A slide in an event (engine move 4th element `slide`, `slideTime`) scrapes a line over the last
   WEAR_SLIDE_D m before the bag it ends at (same 3 m as engine SLIDE_D and render/dust.js). `slideDrags(ev, bases)` lists them in event order, each
   tagged with its event index `i`; `dragsBefore(list, i)` = the marks of events before i (the newest WEAR_DRAG_MAX), so a seek to i shows what playing
   to i shows and the list only grows. Mark = {i, x0, z0, x1, z1, w, a}: world metres, width m, alpha. Pure: the sideways offset is a hash of (i, move). */
export const WEAR_SLIDE_D = 3, WEAR_DRAG_MAX = 40, WEAR_DRAG_W = .35, WEAR_DRAG_A = .28, WEAR_DRAG_SIDE = .5;
export function slideDrags(ev, bases) {
  const out = [], L = 27.43;
  if (!ev || !bases) return out;
  for (let i = 0; i < ev.length; i++) {
    const mv = ev[i] && ev[i].moves; if (!mv) continue;
    mv.forEach((m, mi) => {
      const to = m[1], tl = m[3];
      if (!tl || !tl.slide || !(tl.slideTime > 0) || !(to >= 1 && to <= 4)) return;
      const [x0, z0] = bases[to - 1], [x1, z1] = bases[to], dx = x1 - x0, dz = z1 - z0, a0 = (L - WEAR_SLIDE_D) / L, side = (h01(i * 8 + mi, 77) - .5) * 2 * WEAR_DRAG_SIDE, nx = -dz / L * side, nz = dx / L * side;
      out.push({ i, x0: x0 + dx * a0 + nx, z0: z0 + dz * a0 + nz, x1: x1 + nx * .4, z1: z1 + nz * .4, w: WEAR_DRAG_W * (.7 + .6 * h01(i * 8 + mi, 78)), a: WEAR_DRAG_A });
    });
  }
  return out;
}
export const dragsBefore = (list, i) => { const k = list.filter(d => d.i < i); return k.slice(Math.max(0, k.length - WEAR_DRAG_MAX)); };
