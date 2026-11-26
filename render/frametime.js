/* #211 item 5: frame-time window for the max tier's numbers in the 🐞 report (boot= ftmax / ftw). Pure: game.js feeds it frame dt (ms).
 * push(dt) returns null until `win` frames are in, then {avg, worst, p95} in ms (one decimal) and starts a new window. */
export function frameWindow(win = 90) {
  let a = [];
  const r1 = v => Math.round(v * 10) / 10;
  return {
    push(dt) {
      a.push(dt); if (a.length < win) return null;
      const s = a.slice().sort((x, y) => x - y), out = { avg: r1(a.reduce((x, y) => x + y, 0) / a.length), worst: r1(s[s.length - 1]), p95: r1(s[Math.ceil(s.length * .95) - 1]) };
      a = []; return out;
    },
    reset() { a = []; },
  };
}
