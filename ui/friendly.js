/* 友誼賽 picker (#751 part 1, share link part 2). Reads the factory rosters only (league/players.js, league/teams.js); writes nothing anywhere.
 * 開始 goes to play.html?x=...&e=<pinned engine commit> (league/friendly.js, league/engine_pin.js), which plays the game with the engine in the browser;
 * the same link, copied from 分享連結, gives a friend the same game. */
import { TEAMS } from '../league/teams.js';
import { ROSTERS } from '../league/players.js';
import { STARTERS, friendlyShare, friendlyProblem } from '../league/friendly.js';
import { myBatter, myPitcher, ownOf, ownOfPitcher } from './friendly_me.js';
import { ENGINE_PIN } from '../league/engine_pin.js';
import { gamesLeft, takeGame, PRACTICE_PER_DAY } from './practice_limit.js';
import { parseAgent, ownKind, withAgent } from '../league/friendly_agent.js';

const $ = id => document.getElementById(id);
const st = { away: 0, home: 1, sp: [0, 0], seed: 0, own: -1 };
let me = null;   /* { team, row } of the visitor's own batter, or null */
let mp = null;   /* same for his pitcher (#751 part 4): he takes one of the five starter places and starts */
const arr = () => {
  const a = { away: st.away, home: st.home, sp: st.sp.slice(), seed: st.seed };
  if (me && st.own >= 0 && (me.team === st.away || me.team === st.home)) a.own = ownOf(me.row, me.team === st.away ? 0 : 1, st.own);
  if (mp && st.own >= 0 && (mp.team === st.away || mp.team === st.home)) {
    const k = mp.team === st.away ? 0 : 1;
    a.sp[k] = st.own;
    a.own = ownOfPitcher(mp.row, k, st.own);
  }
  return a;
};
/* #795 part 8: friendly.html?t=<digits> comes from the 試試看 link of the 經紀人 box (agent.html); the set rides on the link of a game
 * with his own player in it (`t=`, league/friendly_agent.js), so the engine reads his draft. No own player placed = no set. */
const T = new URLSearchParams(location.search).get('t');
const agentOf = own => (T && own ? parseAgent(T, ownKind(own)) : null);
const link = a => withAgent(friendlyShare(a, ENGINE_PIN.commit), a.own, agentOf(a.own));
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
    const mine = mp && mp.team === t && st.own >= 0 ? st.own : -1;   /* his place among the five starters */
    chips($(spBox), ROSTERS[t].pit.slice(0, STARTERS).map((p, i) => (i === mine ? [mp.row.name, `${mp.row.hand === 'L' ? '左' : '右'}投 #${mp.row.num}（我的球員）`] : [p.name, `${p.throws === 'L' ? '左' : '右'}投 #${p.num}`])), mine >= 0 ? mine : st.sp[k], i => { st.sp[k] = i; if (mine >= 0) st.own = i; draw(); });
  };
  side(0, 'awayTeam', 'awaySP'); side(1, 'homeTeam', 'homeSP');
  const inGame = me && (me.team === st.away || me.team === st.home), pInGame = mp && (mp.team === st.away || mp.team === st.home);
  $('ownBox').hidden = !inGame && !pInGame;
  if (pInGame) {
    $('ownWho').textContent = `${mp.row.name}（${TEAMS[mp.team].short}，投手，戰力 ${mp.row.overall}）：選一個先發位置放他進去，他先發；不選就不放。`;
    chips($('ownSlot'), [['不放他'], ...ROSTERS[mp.team].pit.slice(0, STARTERS).map((p, i) => [`先發${i + 1}`, p.name])], st.own + 1, i => { st.own = i - 1; if (i > 0) st.sp[mp.team === st.away ? 0 : 1] = i - 1; draw(); });
  } else if (inGame) {
    $('ownWho').textContent = `${me.row.name}（${TEAMS[me.team].short}，${me.row.pos}，戰力 ${me.row.overall}）：選一個打序放他進去，他守那個位置；不選就不放。`;
    chips($('ownSlot'), [['不放他'], ...ROSTERS[me.team].bat.map((b, i) => [`${i + 1}棒`, `${b.pos} ${b.name}`])], st.own + 1, i => { st.own = i - 1; draw(); });
  }
  const a = arr(), why = friendlyProblem(a);
  $('need').textContent = why ? (st.away === st.home ? '客隊和主隊要不同隊。' : /^own/.test(why) ? '我的球員的資料放不進連結，先不放他。' : '種子要是 0 到 4294967295 的整數。') : '';
  const left = gamesLeft();
  $('left').textContent = left > 0 ? `今天還能自己開 ${left} 場（每天 ${PRACTICE_PER_DAY} 場，只記在這個瀏覽器；朋友打開你的連結不算）。` : `今天自己開的 ${PRACTICE_PER_DAY} 場用完了，明天再來；打開朋友的連結不受限。`;
  $('go').disabled = !!why || left <= 0;
  if (T && (inGame || pInGame)) $('ownWho').textContent += a.own && agentOf(a.own) ? ' 這場帶著你的經紀人草稿。' : a.own ? '' : ' 放他進去，這場就用你的經紀人草稿。';
  $('share').value = why ? '' : new URL(link(a), location.href).href;
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
  if (friendlyProblem(a) || !takeGame().ok) { draw(); return; }
  location.href = link(a);
});
$('copy').onclick = async () => {
  const box = $('share');
  try { await navigator.clipboard.writeText(box.value); $('copied').textContent = '已複製連結'; } catch { box.select(); $('copied').textContent = '請長按上面的連結複製'; }
};
st.seed = roll(); $('seed').value = String(st.seed);
[me, mp] = await Promise.all([myBatter(), myPitcher()]);
$('status').hidden = true; $('form').hidden = false;
draw();
