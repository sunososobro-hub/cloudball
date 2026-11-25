/* Compare two players (#192 item 3). One small 比較 button per card (attachCompare); picks go into a bottom panel with two slots and
 * mirrored bars: the left player's bar grows from the middle to the left, the right player's to the right, numbers at the outer ends,
 * ability name in the middle. Same 1 to 100 scale and cold-to-warm colour as ui/bars.js; the number is always printed.
 * Used by guide.html (roster) and agent.html (free agents, your player). Display only: it reads numbers the page already has.
 * A batter and a pitcher share only overall, arm and potential, so a mixed pair shows those three and says so. */
import { barColor, RATING_MAX } from './bars.js';

const BAT = [['con', '打擊'], ['pow', '長打'], ['eye', '選球'], ['spd', '速度'], ['arm', '傳球']];
const PIT = [['stuff', '球威'], ['ctrl', '控球'], ['arm', '臂力']];
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
const keysOf = e => e.kind === 'pit' ? PIT : BAT;

/* the rows to draw for two entries: overall on top, shared abilities, potential last */
export const compareKeys = (a, b) => {
  const mid = a.kind === b.kind ? keysOf(a) : [['arm', '臂力']];
  return [['ovr', '綜合'], ...mid, ...(a.hidePot || b.hidePot ? [] : [['pot', '潛力']])];   /* #384: a created player's potential is never shown */
};

function side(e, cls) {
  const h = el('div', `cmp-who ${cls}`);
  h.append(el('b', null, e.name), el('span', 'num', `#${e.num}`), el('span', null, e.meta || ''));
  return h;
}
function row(label, va, vb, big) {
  const d = el('div', big ? 'cmp-row big' : 'cmp-row');
  const bar = (v, cls) => { const s = el('span', `bar ${cls}`), f = el('i'); f.style.width = `${v / RATING_MAX * 100}%`; f.style.background = barColor(v); s.appendChild(f); return s; };
  const win = va === vb ? '' : va > vb ? 'l' : 'r';   /* the larger number is marked bold-gold, so the winner shows without colour */
  d.dataset.win = win;
  d.append(el('span', 'num n-l', va), bar(va, 'l'), el('span', 'lab', label), bar(vb, 'r'), el('span', 'num n-r', vb));
  return d;
}

let panel = null, state = null;
function build() {
  const p = el('section', 'cmp'); p.id = 'compare'; p.hidden = true; p.setAttribute('aria-label', '球員比較');
  const head = el('div', 'cmp-head'), title = el('b', null, '比較'), fold = el('button', 'cmp-btn', '收合'), close = el('button', 'cmp-btn', '關閉');
  fold.type = close.type = 'button'; head.append(title, fold, close);
  const body = el('div', 'cmp-body');
  p.append(head, body); document.body.appendChild(p);
  fold.onclick = () => { const f = p.classList.toggle('folded'); fold.textContent = f ? '展開' : '收合'; fold.setAttribute('aria-expanded', String(!f)); };
  close.onclick = () => { state.picks = []; render(); };
  return { p, body };
}
function render() {
  const { p, body } = panel, [a, b] = state.picks;
  p.hidden = !a; document.body.classList.toggle('cmp-open', !!a);
  const ids = state.picks.map(x => x.id);   /* by id, so a list that was rebuilt (new sort) still shows who is picked */
  for (const b2 of document.querySelectorAll('.cmp-add')) b2.setAttribute('aria-pressed', String(ids.includes(b2.dataset.id)));
  body.replaceChildren();
  if (!a) return;
  const heads = el('div', 'cmp-heads'); heads.append(side(a, 'l'), b ? side(b, 'r') : el('div', 'cmp-who r hint', '再選一位，按他卡片上的「比較」。'));
  body.appendChild(heads);
  if (!b) return;
  if (a.kind !== b.kind) body.appendChild(el('p', 'cmp-note', a.hidePot || b.hidePot ? '打者和投手只比共同的兩項。' : '打者和投手只比共同的三項。'));
  const rows = el('div', 'cmp-rows');
  for (const [k, label] of compareKeys(a, b)) rows.appendChild(row(label, a.R[k], b.R[k], k === 'ovr'));
  body.appendChild(rows);
}

/* Adds the button to a card's .who line. entry = { name, num, meta, kind: 'bat'|'pit', R: {ovr, pot, ...} }.
 * A third pick replaces the second slot; picking one that is already in a slot takes it out. */
export function attachCompare(li, entry) {
  if (!panel) { state = { picks: [] }; panel = build(); }
  const btn = el('button', 'cmp-add', '比較'); btn.type = 'button'; btn.setAttribute('aria-pressed', 'false'); btn.setAttribute('aria-label', `把 ${entry.name} 放進比較`);
  const e = { ...entry, id: entry.id ?? `${entry.name}#${entry.num}` }; btn.dataset.id = e.id;
  btn.onclick = ev => {
    ev.stopPropagation();   /* on the agent page a tap on the card previews him; this button only compares */
    const at = state.picks.findIndex(x => x.id === e.id);
    if (at >= 0) state.picks.splice(at, 1);
    else if (state.picks.length < 2) state.picks.push(e);
    else state.picks[1] = e;
    render();
  };
  const who = li.querySelector('.who'); (who || li).appendChild(btn);
  if (state.picks.some(x => x.id === e.id)) btn.setAttribute('aria-pressed', 'true');
  return btn;
}
