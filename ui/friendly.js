/* 友誼賽 picker (#751 part 1, share link part 2). Reads the factory rosters only (league/players.js, league/teams.js); writes nothing anywhere.
 * 開始 goes to play.html?x=...&e=<pinned engine commit> (league/friendly.js, league/engine_pin.js), which plays the game with the engine in the browser;
 * the same link, copied from 分享連結, gives a friend the same game. */
import { TEAMS } from '../league/teams.js';
import { ROSTERS } from '../league/players.js';
import { STARTERS, friendlyShare, friendlyProblem } from '../league/friendly.js';
import { myBatter, ownOf } from './friendly_me.js';
import { ENGINE_PIN } from '../league/engine_pin.js';

const $ = id => document.getElementById(id);
const st = { away: 0, home: 1, sp: [0, 0], seed: 0, own: -1 };
let me = null;   /* { team, row } of the visitor's own batter, or null */
const arr = () => {
  const a = { away: st.away, home: st.home, sp: st.sp.slice(), seed: st.seed };
  if (me && st.own >= 0 && (me.team === st.away || me.team === st.home)) a.own = ownOf(me.row, me.team === st.away ? 0 : 1, st.own);
  return a;
};
const roll = () => (crypto.getRandomValues(new Uint32Array(1))[0]) >>> 0;

function chips(box, items, current, pick) {
  box.replaceChildren(...items.map(([label, sub], i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.setAttribute('aria-pressed', String(i === current));
    b.append(label);
    if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
    b.onclick = () => pick(i);
    return b;
  }));
}

function draw() {
  const side = (k, teamBox, spBox) => {
    const t = k ? st.home : st.away;
    chips($(teamBox), TEAMS.map(x => [x.short]), t, i => { st[k ? 'home' : 'away'] = i; st.sp[k] = 0; draw(); });
    chips($(spBox), ROSTERS[t].pit.slice(0, STARTERS).map(p => [p.name, `${p.throws === 'L' ? '左' : '右'}投 #${p.num}`]), st.sp[k], i => { st.sp[k] = i; draw(); });
  };
  side(0, 'awayTeam', 'awaySP'); side(1, 'homeTeam', 'homeSP');
  const inGame = me && (me.team === st.away || me.team === st.home);
  $('ownBox').hidden = !inGame;
  if (inGame) {
    $('ownWho').textContent = `${me.row.name}（${TEAMS[me.team].short}，${me.row.pos}，戰力 ${me.row.overall}）：選一個打序放他進去，他守那個位置；不選就不放。`;
    chips($('ownSlot'), [['不放他'], ...ROSTERS[me.team].bat.map((b, i) => [`${i + 1}棒`, `${b.pos} ${b.name}`])], st.own + 1, i => { st.own = i - 1; draw(); });
  }
  const a = arr(), why = friendlyProblem(a);
  $('need').textContent = why ? (st.away === st.home ? '客隊和主隊要不同隊。' : /^own/.test(why) ? '我的球員的資料放不進連結，先不放他。' : '種子要是 0 到 4294967295 的整數。') : '';
  $('go').disabled = !!why;
  $('share').value = why ? '' : new URL(friendlyShare(a, ENGINE_PIN.commit), location.href).href;
  $('copy').disabled = !!why;
}

$('seed').addEventListener('input', e => {
  const v = e.target.value.trim();
  st.seed = /^[0-9]{1,10}$/.test(v) ? Number(v) : -1;
  draw();
});
$('dice').onclick = () => { st.seed = roll(); $('seed').value = String(st.seed); draw(); };
$('form').addEventListener('submit', e => {
  e.preventDefault();
  const a = arr();
  if (!friendlyProblem(a)) location.href = friendlyShare(a, ENGINE_PIN.commit);
});
$('copy').onclick = async () => {
  const box = $('share');
  try { await navigator.clipboard.writeText(box.value); $('copied').textContent = '已複製連結'; } catch { box.select(); $('copied').textContent = '請長按上面的連結複製'; }
};
st.seed = roll(); $('seed').value = String(st.seed);
me = await myBatter();
$('status').hidden = true; $('form').hidden = false;
draw();
