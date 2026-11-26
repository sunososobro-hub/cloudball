/* 九宮格棒球 practice screen (#332 part 2). Plain DOM over practice.js: no three.js, no engine/, no network.
 * Bat: pick a guess mode, tap a zone cell (3x3), the computer pitches. Pitch: pick a pitch type, tap a cell of the 5x5 grid
 * (the outer ring is outside the zone), the computer swings. The result stays on this page (local only). */
import { createPractice, PRACTICE_PITCHES, HIT_Q, MODE, PT, STAMINA, inZ } from './practice.js';
import { describeOutcome, describeResult } from './text.js';
import { startGame } from './gamescreen.js';
import { createField, SPEEDS } from './field.js';

const $ = id => document.getElementById(id);
let sess = null, side = null, mode = 'one', ptk = 'fb', field = null, speedI = 0;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

function drawOptions() {
  const box = $('opts'); box.textContent = '';
  const items = side === 'bat' ? Object.entries(MODE).map(([k, n]) => [k, n]) : Object.entries(PT).map(([k, p]) => [k, `${p.n}（${p.cost}）`]);
  const cur = side === 'bat' ? mode : ptk;
  for (const [k, n] of items) {
    const b = el('button', 'opt' + (k === cur ? ' on' : ''), n); b.type = 'button'; b.dataset.k = k;
    b.onclick = () => { if (side === 'bat') mode = k; else ptk = k; drawOptions(); drawGrid(); };
    box.append(b);
  }
}

function drawGrid() {
  const g = $('grid'); g.textContent = '';
  const bat = side === 'bat', n = bat ? 3 : 5, off = bat ? 1 : 0;
  g.style.setProperty('--n', n); g.className = 'grid' + (bat ? ' bat' : ' pitch');
  const noCell = bat && (mode === 'take' || mode === 'bunt');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const b = el('button', 'cell' + (!bat && !inZ(r, c) ? ' ring' : ''), ''); b.type = 'button';
    b.setAttribute('aria-label', `第 ${r + off} 列第 ${c + off} 行`);
    b.disabled = !sess || sess.S.done || noCell; b.onclick = () => play(r + off, c + off); g.append(b);
  }
  $('go').hidden = !(bat && noCell); $('go').disabled = !sess || sess.S.done;
}

function status() {
  const S = sess.S; $('count').textContent = `第 ${Math.min(S.pitches + 1, PRACTICE_PITCHES)} / ${PRACTICE_PITCHES} 球`;
  $('score').textContent = `${side === 'bat' ? '安打' : '成功'} ${S.hits}`;
  $('stam').hidden = side !== 'pitch'; $('stam').textContent = `體力 ${S.stamina} / ${STAMINA}`;
}

function play(r, c) {
  if (!sess || sess.S.done) return;
  let res;
  try { res = side === 'bat' ? sess.swing({ mode, r, c }) : sess.pitch({ pt: ptk, r, c }); }
  catch (e) { $('line').textContent = String(e.message || e); return; }
  const li = el('li', '', describeOutcome(res.out, side, HIT_Q)); $('log').prepend(li);
  $('line').textContent = li.textContent; status();
  if (field) field.play({ res: res.out });   // picture only: pitch leg + a text beat, reads the result, never changes it
  if (res.done) { $('end').textContent = describeResult(res.result); $('end').hidden = false; window.baseball9Result = res.result; drawGrid(); }
}

function start(s) {
  if (!field) { field = createField($('pfield')); $('pfbar').hidden = !field; $('pfield').hidden = !field; }
  if (field) field.skip();
  side = s; sess = createPractice(s); window.baseball9Result = null;
  $('menu').hidden = true; $('stage').hidden = false; $('end').hidden = true; $('log').textContent = ''; $('line').textContent = '';
  $('title').textContent = s === 'bat' ? '打擊練習：猜投手會投哪一格' : '投球練習：選球種，投進哪一格';
  drawOptions(); drawGrid(); status();
}

$('bat').onclick = () => start('bat'); $('pitch').onclick = () => start('pitch');
$('game').onclick = startGame;
$('go').onclick = () => play(2, 2);
$('again').onclick = () => start(side);
$('back').onclick = () => { $('stage').hidden = true; $('menu').hidden = false; };
$('pskip').onclick = () => { if (field) field.skip(); };
$('pspeed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; if (field) field.setSpeed(SPEEDS[speedI]); $('pspeed').textContent = `速度 ${SPEEDS[speedI]}x`; };
