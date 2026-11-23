/* Ability bars shared by guide.html and agent.html (#192 item 1). One row = label, bar, number.
 * The bar runs from cold (low) through a neutral grey to warm (high) on the 1 to 100 scale of league/ratings.js;
 * the number is always printed in plain ink next to the bar, so colour is never the only signal.
 * Display only: it reads the whole numbers the page already has and computes nothing about the game. */
export const RATING_MAX = 100;
const COLD = [59, 130, 196], MID = [138, 150, 168], WARM = [240, 100, 42];
const mix = (a, b, t) => a.map((x, i) => Math.round(x + (b[i] - x) * t));
export const barColor = v => {
  const t = Math.max(0, Math.min(1, (v - 1) / (RATING_MAX - 1)));
  const [r, g, b] = t < 0.5 ? mix(COLD, MID, t / 0.5) : mix(MID, WARM, (t - 0.5) / 0.5);
  return `rgb(${r},${g},${b})`;
};
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
/* cls: 'ovr' for the large overall row on top, 'pot' for the potential row. */
export const ratingRow = (label, v, cls) => {
  const d = el('div', cls), bar = el('span', 'bar'), fill = el('i');
  fill.style.width = `${v / RATING_MAX * 100}%`; d.style.setProperty('--bc', barColor(v));
  bar.appendChild(fill); d.append(el('dt', null, label), bar, el('dd', 'num', v)); return d;
};
