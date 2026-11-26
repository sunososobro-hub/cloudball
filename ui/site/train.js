/* 訓練 screen of 我的球員 (#429): the created player's training split (sliders, sum 100) and the two ways to train,
 * 放養 (hands-off: the daily model runs by itself; the days come from league/site/train_days.json, written by
 * league/tools/train_days.mjs out of train_sim.mjs) and 認真玩 (the 九宮格 practice, baseball9.html).
 * Plain DOM, no three.js, no network. Local only: the split and the last practice result live in this browser; no ability
 * changes, no weekly cap, no server credit (season-1 design). The practice score never converts to ability: it becomes the
 * plain bonus number of league/training.js (#369), shown here and nowhere else. Pure helpers first, `mountTrain` last. */
import { esc, ABILITY_LABEL } from './shared.js';
import { SPLIT_TOTAL, ACTIVE_BONUS, validateSplit, defaultSplit, trainKeys } from '../../league/training.js';

export const TRAIN_FILE = 'league/site/train_days.json';
export const SPLIT_KEY = 'cloudball.trainSplit.';   /* + player id */
export const RESULT_KEY = 'cloudball.trainResult';   /* last practice result from baseball9.html: { id, result } */
export const BONUS_HALF = ACTIVE_BONUS / 2;          /* a half-tier practice gives half of train_sim's active bonus */
export const GAME_PAGE = 'baseball9.html';

export const kindOf = p => (p && p.role === 'P' ? 'pit' : 'bat');
/* the split keys of this player (#429 part 2): his abilities, plus each pitch of a pitcher's list (`pitches: { name: rating }`, #378) */
export const pitchesOf = p => (kindOf(p) === 'pit' && p.pitches && typeof p.pitches === 'object' && !Array.isArray(p.pitches) ? Object.keys(p.pitches) : []);
export const keysOf = p => trainKeys(kindOf(p), pitchesOf(p));
const labelOf = k => ABILITY_LABEL[k] || k;   /* a pitch is shown by its own name (直球, 滑球, ...) */
/* the 九宮格 side that follows the split: batting abilities train in bat practice, pitching abilities in pitch practice */
export const sideOf = p => (kindOf(p) === 'pit' ? 'pitch' : 'bat');
export const bonusOf = r => (r && r.tier === 'full' ? ACTIVE_BONUS : r && r.tier === 'half' ? BONUS_HALF : 0);
export const gameUrl = (id, side) => `${GAME_PAGE}?player=${encodeURIComponent(id)}&side=${side}`;

/* the saved split when it is a legal one for this player, else his default (pitchers by role, batters even) */
export function splitOf(p, saved) {
  const kind = kindOf(p), list = pitchesOf(p);
  return saved && !validateSplit(keysOf(p), saved).length ? { ...saved } : defaultSplit(kind, p && p.pos, list.length ? list : undefined);
}
/* move one slider to pct (whole, 0..100); the others share what is left in their old ratio, whole percents, sum stays 100 */
export function setShare(split, key, pct) {
  const keys = Object.keys(split), v = Math.max(0, Math.min(SPLIT_TOTAL, Math.round(+pct) || 0)), rest = SPLIT_TOTAL - v, others = keys.filter(k => k !== key);
  const sum = others.reduce((t, k) => t + split[k], 0), out = { [key]: v };
  const exact = others.map(k => (sum ? split[k] * rest / sum : rest / others.length));
  others.forEach((k, i) => { out[k] = Math.floor(exact[i]); });
  let left = rest - others.reduce((t, k) => t + out[k], 0);
  for (const i of others.map((k, i) => i).sort((a, b) => (exact[b] % 1) - (exact[a] % 1) || a - b)) { if (left <= 0) break; out[others[i]]++; left--; }
  return Object.fromEntries(keys.map(k => [k, out[k]]));
}
/* the 放養 line: expected days to the ready line (the 一軍 median) from the table; worded "ready", never a call-up date (#500), or why there is none */
export function handsOffText(table, p) {
  const h = table && table.hands;
  if (!h || !Number.isFinite(h.median)) return '目前沒有可用的預估天數。';
  if (p && p.overall >= table.target) return `他的綜合已經到 ${table.target}（ready 線）。`;
  return `放養：${Math.round(100 * h.share)}% 的球員在 ${table.horizon} 天內達到 ready 線 ${table.target}，這些人要 ${h.median} 天（中間一半在 ${h.p25}–${h.p75} 天）。` +
    (table.active ? `認真練的話約 ${table.active.median} 天。` : '');
}
export const resultText = r => (r && r.result ? `最近一次練習：${r.result.side === 'bat' ? '打擊' : '投球'} ${r.result.pitches} 球 ${r.result.hits} ${r.result.side === 'bat' ? '安打' : '成功'}，訓練加成 +${bonusOf(r.result)}。` : '還沒有練習紀錄。');

/* the placeholder the 我的球員 tab draws for `#me/train`; mountTrain fills it */
export const trainShell = '<section id="train-root" class="train"></section>';

/* ctx: { doc, player, id, table, load(key) -> string|null, save(key, string), go(url) }; builds the screen in root */
export function mountTrain(root, ctx) {
  const { doc, player: p, id } = ctx, keys = keysOf(p), el = (tag, cls, text) => { const e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const read = key => { try { return JSON.parse(ctx.load(key)); } catch (e) { return null; } };
  let split = splitOf(p, read(SPLIT_KEY + id));
  root.textContent = '';
  root.append(el('h2', '', `訓練：${p.name}`), el('p', 'mut', '決定他每天練什麼（加起來 100%），再選放養或自己打九宮格。成績只留在這個瀏覽器，不會直接改能力。'));
  const rows = {}, total = el('p', 'train-total', ''), note = el('p', 'train-note', ''), out = el('p', 'train-result', '');
  for (const k of keys) {
    const row = el('label', 'train-row'), name = el('span', '', labelOf(k)), pct = el('span', 'num', ''), range = el('input', '');
    range.type = 'range'; range.min = 0; range.max = SPLIT_TOTAL; range.step = 1; range.dataset.k = k; range.setAttribute('aria-label', labelOf(k));
    range.oninput = () => { split = setShare(split, k, range.value); ctx.save(SPLIT_KEY + id, JSON.stringify(split)); sync(); };
    row.append(name, range, pct); rows[k] = { range, pct }; root.append(row);
  }
  function sync() {
    for (const k of keys) { rows[k].range.value = split[k]; rows[k].pct.textContent = `${split[k]}%`; }
    total.textContent = `合計 ${keys.reduce((t, k) => t + split[k], 0)}%`;
  }
  const hands = el('button', 'big', '放養：讓他自己練'), play = el('button', 'big', '認真玩：打九宮格');
  hands.type = play.type = 'button'; hands.dataset.mode = 'hands'; play.dataset.mode = 'play';
  hands.onclick = () => { note.textContent = handsOffText(ctx.table, p); };
  play.onclick = () => ctx.go(gameUrl(id, sideOf(p)));
  const last = read(RESULT_KEY); out.textContent = resultText(last && String(last.id) === String(id) ? last : null);
  root.append(total, hands, note, play, out);
  sync();
}
