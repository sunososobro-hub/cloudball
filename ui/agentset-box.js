/* #795 part 5: the 經紀人 box on agent.html (under 你的球員). The 4 x 3 grid of league/agentset.js (situations x frequencies) for the fan's
 * own player, with the points pool: every cell has − / +, a raise must be paid for by a cut elsewhere (the pool is the all-neutral grid).
 * Rows other than 一般 follow 一般 until a cell is set. Edits are a local draft (localStorage, per player id) until the explicit 儲存 button
 * POSTs /api/player/agentset (one row, overwritten, #808 save cap). Nothing here touches a game outcome (rule 10): the engine reads the
 * saved set at the game lock (part 4b). The pure helpers (stepCell, readDraft, tryLink) are exported for tests/agentsetbox.check.mjs.
 * Part 8: 試試看 opens the 友誼賽 picker with the current draft (`friendly.html?t=`, league/friendly_agent.js): a browser-only practice
 * game, never official (rule 24), no save needed. */
import { SITUATIONS, FREQS, LABELS, NORMAL, LEVEL_MIN, LEVEL_MAX, LEVEL_NEUTRAL, AGENT_POOL,
  defaultSet, validateSet, resolveSet, freezeSet, pointsLeft } from '../league/agentset.js';
import { agentParam } from '../league/friendly_agent.js';

export const DRAFT_PREFIX = 'cloudball.agentDraft.';
/* level words, LEVEL_MIN..LEVEL_MAX (game content) */
export const LEVEL_WORDS = ['很少', '少', '照常', '多', '很多'];
const WHY = { limit: '今天的儲存次數用完了，明天再存。草稿還留在這個瀏覽器。', invalid: '設定有誤，請重新調整。', none: '你還沒有球員。' };

/* one step on one cell: the new canonical set, or null when the level would leave LEVEL_MIN..LEVEL_MAX or the pool */
export function stepCell(set, situation, freq, delta) {
  const g = resolveSet(set), lv = g[situation] && g[situation][freq];
  if (lv === undefined) return null;
  const next = lv + delta;
  if (next < LEVEL_MIN || next > LEVEL_MAX) return null;
  const rows = {};
  for (const s of SITUATIONS[set.kind]) rows[s] = { ...((set.rows && set.rows[s]) || {}) };
  rows[situation][freq] = next;
  const out = freezeSet({ v: set.v, kind: set.kind, rows });
  return validateSet(out).length ? null : out;
}

/* the 試試看 link for a set: the 友誼賽 picker carrying it (#795 part 8) */
export const tryLink = set => `friendly.html?t=${agentParam(set)}`;

/* the stored draft of this player when it is a valid set of his kind, else null */
export function readDraft(storage, pid, kind) {
  let v = null;
  try { v = JSON.parse(storage.getItem(DRAFT_PREFIX + pid) || 'null'); } catch (e) { v = null; }
  return v && v.kind === kind && !validateSet(v).length ? freezeSet(v) : null;
}
const writeDraft = (storage, pid, set) => { try { storage.setItem(DRAFT_PREFIX + pid, JSON.stringify(set)); } catch (e) { /* storage blocked: the draft lives only on this page */ } };
const dropDraft = (storage, pid) => { try { storage.removeItem(DRAFT_PREFIX + pid); } catch (e) { /* nothing stored */ } };
const same = (a, b) => JSON.stringify(freezeSet(a)) === JSON.stringify(freezeSet(b));

/* the box. api(path, opts) -> { status, body } as in ui/agent.js; isClosed(r) true when the API is not open */
export function agentSetBox({ api, key, pid, kind, storage, isClosed }) {
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const box = el('section', 'agentset'), status = el('p', 'status', '載入經紀人設定…'); status.setAttribute('role', 'status');
  box.append(el('h3', null, '經紀人'), status);
  let saved = defaultSet(kind), draft = saved;

  const grid = el('div', 'as-grid'), pool = el('p', 'left'), note = el('p', 'status'), save = el('button', 'btn'), reset = el('button', 'btn ghost');
  note.setAttribute('role', 'status'); save.type = 'button'; reset.type = 'button'; save.textContent = '儲存'; reset.textContent = '全部照常';
  const tryIt = el('a', 'btn ghost', '試試看'); tryIt.title = '用這份草稿開一場友誼賽（不算正式比賽，不用先存）';
  const bar = el('div', 'as-bar'); bar.append(save, reset, tryIt);

  function draw() {
    const g = resolveSet(draft), rows = draft.rows || {};
    grid.replaceChildren();
    grid.appendChild(el('span', 'as-head', ''));
    for (const f of FREQS[kind]) grid.appendChild(el('span', 'as-head', LABELS[f]));
    for (const s of SITUATIONS[kind]) {
      grid.appendChild(el('span', 'as-sit', LABELS[s]));
      for (const f of FREQS[kind]) {
        const lv = g[s][f], own = s === NORMAL || (rows[s] && rows[s][f] !== undefined);
        const cell = el('div', 'as-cell' + (own ? '' : ' follow')); cell.dataset.cell = `${s}.${f}`;
        const minus = el('button', 'as-step', '−'), plus = el('button', 'as-step', '+');
        minus.type = plus.type = 'button';
        minus.setAttribute('aria-label', `${LABELS[s]} ${LABELS[f]} 少一點`); plus.setAttribute('aria-label', `${LABELS[s]} ${LABELS[f]} 多一點`);
        const down = stepCell(draft, s, f, -1), up = stepCell(draft, s, f, 1);
        minus.disabled = !down; plus.disabled = !up;
        minus.onclick = () => edit(down); plus.onclick = () => edit(up);
        cell.append(minus, el('span', 'as-lv' + (lv === LEVEL_NEUTRAL ? '' : ' off'), LEVEL_WORDS[lv]), plus);
        grid.appendChild(cell);
      }
    }
    const left = pointsLeft(draft);
    pool.textContent = `經紀點數 ${AGENT_POOL[kind]}，剩 ${left} 點。要在一格多一點，就得在別格少一點。灰色的格子跟著「一般」。`;
    const dirty = !same(draft, saved);
    save.disabled = !dirty; save.textContent = dirty ? '儲存' : '已儲存';
    tryIt.href = tryLink(draft);
  }
  function edit(next) { if (!next) return; draft = next; writeDraft(storage, pid, draft); note.textContent = ''; note.classList.remove('err'); draw(); }

  reset.onclick = () => edit(defaultSet(kind));
  save.onclick = async () => {
    save.disabled = true; note.classList.remove('err'); note.textContent = '儲存中…';
    const r = await api('/api/player/agentset', { method: 'POST', key, body: { set: draft } });
    if (r.body && r.body.ok) { saved = r.body.set; draft = saved; dropDraft(storage, pid); note.textContent = '存好了，下一場鎖定時生效。'; draw(); return; }
    note.classList.add('err'); note.textContent = isClosed(r) ? '還沒開放。' : (WHY[r.body && r.body.why] || '存不進去，等一下再試。'); draw();
  };

  (async () => {
    const r = await api('/api/player/agentset', { key });
    if (r.body && r.body.ok && r.body.kind === kind) saved = r.body.set;
    else if (!isClosed(r)) { status.textContent = WHY[r.body && r.body.why] || '讀不到經紀人設定。'; return; }
    else { status.textContent = '經紀人設定還沒開放。'; return; }
    const d = readDraft(storage, pid, kind);
    draft = d || saved;
    status.textContent = d && !same(d, saved) ? '這是你還沒存的草稿。' : '每一格是你的球員在那個情況下多常這樣做。';
    box.append(grid, pool, bar, note); draw();
  })();
  return box;
}
