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
