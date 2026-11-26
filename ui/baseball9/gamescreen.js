/* 九宮格棒球 3-inning game screen (#332 part 3c-2). Plain DOM over game.js: no three.js, no engine/, no network.
 * You bat in the top half (pick an approach, a guess mode, a cell) and pitch in the bottom (pick a shift, a pitch type, a cell);
 * the computer does the other side. The result stays on this page in window.baseball9GameResult (local only). */
import { createGame, SHIFTS, MODE_NAME } from './game.js';
import { PT } from './practice.js';
import { createField, SPEEDS } from './field.js';
import { describeHalf, describeBases, describeCount, describeScore, describeLine, describeGameResult, canSteal } from './text.js';

const $ = id => document.getElementById(id);
const APPS = { pull: '拉打', mid: '中間', push: '推打', bunt: '觸擊' };
let field = null, speedI = 0, g = null, mode = 'one', app = 'mid', ptk = 'fb', shift = 'N', steal = false, hold = false;

function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
function chips(box, items, cur, pick) {
  for (const [k, n] of items) { const b = el('button', 'opt' + (k === cur ? ' on' : ''), n); b.type = 'button'; b.onclick = () => { pick(k); draw(); }; box.append(b); }
}
function draw() {
  const S = g.S, bats = g.userBats(), fresh = S.balls + S.strikes === 0, over = S.over;
  $('ghalf').textContent = over ? '比賽結束' : describeHalf(S); $('gscore').textContent = describeScore(S);
  $('gcount').textContent = describeCount(S); $('gbases').textContent = describeBases(S.bases); $('gline').textContent = describeLine(S);
  $('gstam').textContent = `你的體力 ${S.stamina[0]}`; $('gbatter').textContent = bats ? `你的打者：${g.batter().name}` : `對手打者：${g.batter().name}`;
  const a = $('gapp'), o = $('gopts'), sh = $('gshift'); a.textContent = o.textContent = sh.textContent = '';
  a.hidden = !(bats && fresh && !over); sh.hidden = !(!bats && fresh && !over);
  if (bats) { chips(a, Object.entries(APPS), app, k => { app = k; }); chips(o, Object.entries(MODE_NAME), app === 'bunt' ? 'bunt' : mode, k => { mode = k; }); }
  else { chips(sh, Object.entries(SHIFTS).map(([k, s]) => [k, s.n]), shift, k => { shift = k; }); chips(o, Object.entries(PT).map(([k, p]) => [k, `${p.n}（${p.cost}）`]), ptk, k => { ptk = k; }); }
  const noCell = bats && (app === 'bunt' || mode === 'take' || mode === 'bunt'), n = bats ? 3 : 5, off = bats ? 1 : 0, grid = $('ggrid');
  grid.textContent = ''; grid.style.setProperty('--n', n); grid.className = 'grid' + (bats ? ' bat' : ' pitch');
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const b = el('button', 'cell' + (!bats && !(r > 0 && r < 4 && c > 0 && c < 4) ? ' ring' : ''), ''); b.type = 'button';
    b.setAttribute('aria-label', `第 ${r + off} 列第 ${c + off} 行`); b.disabled = over || noCell; b.onclick = () => play(r + off, c + off); grid.append(b);
  }
  $('ggo').hidden = !noCell || over; const sOk = canSteal(S);
  $('gstealbox').hidden = over || !sOk; $('gstealtxt').textContent = bats ? '盜壘' : '牽制（防盜壘）'; if (!sOk) steal = hold = false;
  $('gsteal').checked = bats ? steal : hold; $('gsteal').onchange = e => { if (bats) steal = e.target.checked; else hold = e.target.checked; };
}
function play(r, c) {
  if (!g || g.S.over) return;
  const bats = g.userBats(); let o;
  try { o = g.pitch(bats ? { mode, r, c, steal, app } : { pt: ptk, r, c, hold, shift }); }
  catch (e) { $('gtxt').textContent = String(e.message || e); return; }
  const li = el('li', '', o.txt); $('glog').prepend(li); $('gtxt').textContent = o.txt;
  if (field) field.play(o);            // picture only: reads the result, never changes it
  if (o.paEnd) steal = hold = false;
  if (o.halfEnded && !g.S.over) app = 'mid';
  if (g.S.over) { const res = g.result(); window.baseball9GameResult = res; $('gend').textContent = describeGameResult(res); $('gend').hidden = false; }
  draw();
}
export function startGame() {
  if (!field) { field = createField($('gfield')); $('gfbar').hidden = !field; $('gfield').hidden = !field; }
  if (field) field.skip();
  g = createGame(); window.baseball9GameResult = null; mode = 'one'; app = 'mid'; ptk = 'fb'; shift = 'N'; steal = hold = false;
  $('menu').hidden = true; $('stage').hidden = true; $('gstage').hidden = false; $('gend').hidden = true; $('glog').textContent = ''; $('gtxt').textContent = ''; draw();
}
$('ggo').onclick = () => play(2, 2);
$('gskip').onclick = () => { if (field) field.skip(); };
$('gspeed').onclick = () => { speedI = (speedI + 1) % SPEEDS.length; if (field) field.setSpeed(SPEEDS[speedI]); $('gspeed').textContent = `速度 ${SPEEDS[speedI]}x`; };
$('gagain').onclick = startGame;
$('gback').onclick = () => { $('gstage').hidden = true; $('menu').hidden = false; };
