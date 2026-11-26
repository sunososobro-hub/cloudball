/* 我的球員 訓練 screen (#429): the 訓練 entry, the split sliders (always sum 100), both modes reachable, the practice result shown as the plain bonus
 * number, and the 放養 numbers equal a fresh train_sim run. The screen is driven on a tiny fake DOM. Usage: node tests/train.check.mjs */
import { readFileSync } from 'node:fs';
import { combine, render, mergeCreated } from '../ui/site-data.js';
import { mountTrain, keysOf, setShare, splitOf, bonusOf, sideOf, gameUrl, handsOffText, SPLIT_KEY, RESULT_KEY, BONUS_HALF } from '../ui/site/train.js';
import { KEYS, ACTIVE_BONUS, validateSplit } from '../league/training.js';
import { table } from '../league/tools/train_days.mjs';

const problems = [], bad = m => problems.push(m);
const sum = s => Object.values(s).reduce((t, x) => t + x, 0);
const bat = { name: '新打者', age: 21, role: 'B', pos: 'SS', overall: 55, abilities: {}, team: null, tier: 3 }, pit = { name: '新投手', age: 22, role: 'P', pos: 'SP', overall: 48, abilities: {}, team: null, tier: 3 };
const d = combine({ teams: [], players: { b1: bat, p1: pit }, games: [] });

/* the entry: a 訓練 link on the created player, text when there is no id, the shell on #me/train */
if (!render('me', d, 'b1').includes('href="#me/train"')) bad('我的球員 has no 訓練 link');
if (!/你還沒有自己的球員/.test(render('me', d, '', 'train')) || render('me', d, '', 'train').includes('train-root')) bad('no player id: say so in text, no screen');
if (!render('me', d, 'b1', 'train').includes('id="train-root"')) bad('#me/train has no screen shell');

/* pure helpers */
for (const kind of ['bat', 'pit']) {
  let s = splitOf(kind === 'bat' ? bat : pit, null);
  if (validateSplit(KEYS[kind], s).length) bad(`${kind}: default split illegal`);
  for (const [k, v] of [[KEYS[kind][0], 0], [KEYS[kind][1], 100], [KEYS[kind][0], 37], [KEYS[kind][2], 64], [KEYS[kind][1], 3.6], [KEYS[kind][0], 'x'], [KEYS[kind][0], 500]]) {
    s = setShare(s, k, v); if (validateSplit(KEYS[kind], s).length || sum(s) !== 100) bad(`${kind}: setShare ${k}=${v} -> ${JSON.stringify(s)}`);
  }
  if (setShare(splitOf(kind === 'bat' ? bat : pit, null), KEYS[kind][0], 40)[KEYS[kind][0]] !== 40) bad(`${kind}: setShare does not hold the moved slider`);
}
if (sideOf(bat) !== 'bat' || sideOf(pit) !== 'pitch') bad('九宮格 side must follow batting / pitching');
if (JSON.stringify(splitOf(bat, { con: 50, pow: 50 })) !== JSON.stringify(splitOf(bat, null))) bad('an illegal saved split must fall back to the default');
if (bonusOf({ tier: 'full' }) !== ACTIVE_BONUS || bonusOf({ tier: 'half' }) !== BONUS_HALF || bonusOf(null) !== 0 || BONUS_HALF >= ACTIVE_BONUS) bad('bonusOf: full = ACTIVE_BONUS, half less, none 0');
if (gameUrl('fa 1', 'bat') !== 'baseball9.html?player=fa%201&side=bat') bad('gameUrl: ' + gameUrl('fa 1', 'bat'));

/* the 放養 numbers are train_sim's, not typed in: the published file equals a fresh run */
const fresh = table(), disk = JSON.parse(readFileSync(new URL('../league/site/train_days.json', import.meta.url), 'utf8'));
if (JSON.stringify(fresh) !== JSON.stringify(disk)) bad('league/site/train_days.json is stale: run node league/tools/train_days.mjs --write');
if (!handsOffText(disk, bat).includes(String(disk.hands.median)) || /undefined|NaN/.test(handsOffText(disk, bat)) || !/沒有可用/.test(handsOffText(null, bat)) || !/已經/.test(handsOffText(disk, { overall: 99 }))) bad('handsOffText');

/* the screen on a fake DOM */
const mk = tag => ({ tag, children: [], dataset: {}, value: '', className: '', _t: '', setAttribute() {}, append(...k) { this.children.push(...k); }, set textContent(v) { this._t = v; if (v === '') this.children = []; }, get textContent() { return this._t; } });
const doc = { createElement: mk }, find = (n, f, out = []) => { if (f(n)) out.push(n); n.children.forEach(c => find(c, f, out)); return out; };
function run(p, id, saved, last) {
  const mem = {}; if (saved) mem[SPLIT_KEY + id] = JSON.stringify(saved); if (last) mem[RESULT_KEY] = JSON.stringify(last);
  const went = [], root = mk('section'); mountTrain(root, { doc, player: p, id, table: disk, load: k => mem[k] ?? null, save: (k, v) => { mem[k] = v; }, go: u => went.push(u) });
  return { root, mem, went, sliders: find(root, n => n.tag === 'input'), btn: m => find(root, n => n.dataset.mode === m)[0], text: () => find(root, () => true).map(n => n._t).join('|') };
}
for (const [p, id, kind] of [[bat, 'b1', 'bat'], [pit, 'p1', 'pit']]) {
  const t = run(p, id);
  if (t.sliders.length !== KEYS[kind].length) bad(`${kind}: ${t.sliders.length} sliders, want ${KEYS[kind].length}`);
  if (!t.text().includes('合計 100%')) bad(`${kind}: total line`);
  t.sliders[0].value = 60; t.sliders[0].oninput(); t.sliders[1].value = 5; t.sliders[1].oninput();
  const saved = JSON.parse(t.mem[SPLIT_KEY + id]);
  if (validateSplit(KEYS[kind], saved).length || sum(saved) !== 100) bad(`${kind}: saved split ${t.mem[SPLIT_KEY + id]}`);
  if (!t.text().includes('合計 100%') || t.sliders.some((s, i) => +s.value !== saved[KEYS[kind][i]])) bad(`${kind}: sliders do not follow the split`);
  if (!t.btn('hands') || !t.btn('play')) { bad(`${kind}: both mode buttons must exist`); continue; }
  t.btn('hands').onclick(); if (!t.text().includes(String(disk.hands.median))) bad(`${kind}: 放養 shows no days`);
  t.btn('play').onclick(); if (t.went.join() !== gameUrl(id, sideOf(p))) bad(`${kind}: 認真玩 goes to ${t.went}`);
  const again = run(p, id, saved); if (JSON.stringify(again.sliders.map(s => +s.value)) !== JSON.stringify(KEYS[kind].map(k => saved[k]))) bad(`${kind}: the saved split is not restored`);
}
if (!run(bat, 'b1').text().includes('還沒有練習紀錄')) bad('no result yet must say so');
if (!run(bat, 'b1', null, { id: 'b1', result: { side: 'bat', mode: 'practice', hits: 5, pitches: 10, tier: 'full' } }).text().includes(`加成 +${ACTIVE_BONUS}`)) bad('result bonus number not shown');
if (run(bat, 'b1', null, { id: 'other', result: { side: 'bat', hits: 5, pitches: 10, tier: 'full' } }).text().includes('加成')) bad("another player's result must not show");
const html = readFileSync(new URL('../baseball9.html', import.meta.url), 'utf8');
if (!/id="me-link"/.test(html)) bad('baseball9.html has no link back to 我的球員');
const scr = readFileSync(new URL('../ui/baseball9/screen.js', import.meta.url), 'utf8');
if (!/cloudball\.trainResult/.test(scr) || /fetch\(|XMLHttpRequest|sendBeacon/.test(scr)) bad('screen.js: keep the result in localStorage only, no network');

/* pitches in the pitcher's split (#429 part 2): the list comes through mergeCreated, each pitch is a slider, the split sums to 100 */
const made = mergeCreated(combine({}), [{ id: 'p9', kind: 'pit', player: { name: '新球', age: 20, role: 'SP', throws: 'R', pitches: { 直球: 60, 滑球: 60, 曲球: 60 } }, ratings: { ovr: 50, stuff: 60, ctrl: 60, arm: 60 } }]).players.p9;
if (JSON.stringify(made.pitches) !== JSON.stringify(['直球', '滑球', '曲球'])) bad('mergeCreated drops the pitch list: ' + JSON.stringify(made.pitches));
if (keysOf(made).length !== KEYS.pit.length + 3 || keysOf(bat).length !== KEYS.bat.length || keysOf(pit).length !== KEYS.pit.length) bad('keysOf: abilities + one key per pitch, batters and list-less pitchers unchanged');
const withP = run(made, 'p9'), sp = JSON.parse(JSON.stringify(splitOf(made, null)));
if (withP.sliders.length !== KEYS.pit.length + 3 || !withP.text().includes('滑球') || !withP.text().includes('合計 100%') || sum(sp) !== 100) bad('pitch sliders / total missing: ' + withP.sliders.length);
withP.sliders[KEYS.pit.length].value = 40; withP.sliders[KEYS.pit.length].oninput();
const sv = JSON.parse(withP.mem[SPLIT_KEY + 'p9']);
if (sum(sv) !== 100 || validateSplit(keysOf(made), sv).length || sv[Object.keys(sv)[KEYS.pit.length]] !== 40) bad('pitch split after a move: ' + JSON.stringify(sv));
if (JSON.stringify(run(made, 'p9', sv).sliders.map(s => +s.value)) !== JSON.stringify(keysOf(made).map(k => sv[k]))) bad('pitch split not restored');
if (JSON.stringify(splitOf(made, { stuff: 40, ctrl: 30, arm: 30 })) !== JSON.stringify(sp)) bad('an old split without the pitches must fall back to the default');
if (problems.length) { console.error('train.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('train.check ok (both kinds, split sums to 100, both modes, result bonus shown, days = train_sim, pitches in the pitcher split)');
