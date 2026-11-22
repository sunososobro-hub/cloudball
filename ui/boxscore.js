/* Box score of the frozen first game for the guide page (#53 part 2). Reads league/preseason/opening.json at load; nothing is copied.
 * Batting lines and team totals come from boxFromStream (engine/stats/box.js) on the recorded event stream; the line score is the same stream.
 * The recording has no pitching lines in the stream, so those are the recorded `pst` rows, paired with the pitchers the game used (`staff`).
 * Positions come from the frozen rosters of that day (league/preseason/rosters-opening.js), never from the live ones.
 * Display only: nothing here can change a result (rule 10). A pre-season game: it is labelled so and does not count (rule 24).
 * loadBox() resolves to null on any failure and the page keeps the block hidden: no error on screen, no placeholder numbers. */
import {boxFromStream} from '../engine/stats/box.js';
import {TEAMS} from '../league/teams.js';
import {OPENING_ROSTERS} from '../league/preseason/rosters-opening.js';
import {parseRecording} from '../league/recording.js';

const POS={C:'捕手',"1B":'一壘',"2B":'二壘',"3B":'三壘',SS:'游擊',LF:'左外',CF:'中外',RF:'右外',DH:'指打'};
const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
const ip=outs=>`${Math.floor(outs/3)}.${outs%3}`;

/* One table: head = column labels, rows = arrays of cells (a string, or {t, cls}); the first cell of a row is its row header. */
function table(label,head,rows,foot){
  const wrap=el('div','bwrap'),t=el('table','box'),cap=el('caption',null,label);t.appendChild(cap);
  const hr=el('tr');head.forEach((h,i)=>{const th=el('th',i?'n':null,h);th.scope='col';hr.appendChild(th)});
  const thead=el('thead');thead.appendChild(hr);t.appendChild(thead);
  const tb=el('tbody');
  for(const r of rows){const tr=el('tr',r.cls);r.cells.forEach((c,i)=>{const o=typeof c==='object'&&c!==null?c:{t:c};
    const cell=el(i?'td':'th',[i?'n num':'',o.cls||''].join(' ').trim()||null);if(!i)cell.scope='row';
    if(Array.isArray(o.t))cell.append(...o.t);else cell.textContent=o.t;tr.appendChild(cell)});tb.appendChild(tr)}
  t.appendChild(tb);if(foot){const tf=el('tfoot'),tr=el('tr');foot.forEach((c,i)=>{const cell=el(i?'td':'th',i?'n num':null,c);if(!i)cell.scope='row';tr.appendChild(cell)});tf.appendChild(tr);t.appendChild(tf)}
  wrap.appendChild(t);return wrap}

/* "林家銘 2" style list for the footnotes under a batting table; null when nobody did it. */
function noteLine(title,players,key,lineup){
  const parts=[];for(const n of lineup){const c=players[n]?players[n][key]:0;if(c)parts.push(c>1?`${n} ${c}`:n)}
  if(!parts.length)return null;const p=el('p','note');p.append(el('b',null,`${title}：`),parts.join('、'));return p}

export function buildBox(rec){
  const g=rec&&rec.game;if(!g||!Array.isArray(g.stream))return null;
  const start=g.stream.find(x=>x.type==='game_start'),end=g.stream.find(x=>x.type==='game_end');
  if(!start||!end||!Array.isArray(start.lineups))return null;
  const box=boxFromStream(g.stream),fin=g.final||{},T=start.teams.map(id=>TEAMS.find(t=>t.id===id));
  if(T.some(t=>!t))return null;
  const innings=box.innings,sec=el('div','boxwrap');
  const win=end.winner,lose=1-win,decided=end.innings>9?`${end.innings} 局`:'';
  const head=el('div','boxhead'),h2=el('h2',null,'首場熱身賽 Box Score'),tag=el('p','boxtag','季前熱身賽，不列入正史，不計入任何成績。');
  const res=el('p','result');res.append(el('b',null,`${T[win].short} ${box.score[win]} : ${box.score[lose]} ${T[lose].short}`),decided?`（${decided}）`:'');
  head.append(h2,tag,res);

  /* line score: runs per inning from the stream; H from the batting totals; E from the recording's own count */
  const cols=['',...Array.from({length:innings},(_,i)=>String(i+1)),'R','H','E'];
  const ls=T.map((t,k)=>({cls:k===win?'win':'',cells:[{t:t.short,cls:'tn'},...Array.from({length:innings},(_,i)=>box.line[k][i]==null?'X':box.line[k][i]),
    {t:box.score[k],cls:'tot'},box.team[k].h,Array.isArray(fin.E)?fin.E[k]:'–']}));
  const lsw=table('逐局比分',cols,ls);lsw.classList.add('linescore');

  const teams=el('div','boxteams');
  T.forEach((t,k)=>{
    const col=el('section','boxteam');col.style.setProperty('--tc',t.css);col.appendChild(el('h3',null,t.name));
    const lineup=start.lineups[k],R=(OPENING_ROSTERS[k]&&OPENING_ROSTERS[k].bat)||[],P=box.players[k];
    const rows=lineup.map(n=>{const s=P[n]||{ab:0,h:0,hr:0,rbi:0,bb:0,k:0},pos=(R.find(b=>b.name===n)||{}).pos;
      return {cells:[{t:[n,...(pos&&POS[pos]?[el('small',null,POS[pos])]:[])]},s.ab,s.h,s.hr,s.rbi,s.bb,s.k]}});
    const tt=box.team[k];
    col.appendChild(table(`${t.short}打擊`,['打者','打數','安打','全壘打','打點','保送','三振'],rows,['合計',tt.ab,tt.h,tt.hr,tt.rbi,tt.bb,tt.k]));
    for(const n of [noteLine('二壘打',P,'d',lineup),noteLine('三壘打',P,'t',lineup),noteLine('全壘打',P,'hr',lineup)])if(n)col.appendChild(n);
    /* pitching: pst[k][j] belongs to staff[k][j]; the ones who faced nobody are left out. H and HR are hits and home runs allowed. W/L from the recording's wp/lp = [team, index]. */
    const pit=[];(g.pst&&g.pst[k]||[]).forEach((p,j)=>{const who=g.staff&&g.staff[k]&&g.staff[k][j];if(!p||!who||!p.bf)return;
      const dec=g.wp&&g.wp[0]===k&&g.wp[1]===j?'勝':g.lp&&g.lp[0]===k&&g.lp[1]===j?'敗':'';
      pit.push({cells:[{t:[who.name,...(dec?[el('small','dec',dec)]:[])]},ip(p.outs),p.h,p.r,p.bb,p.k,p.hr]})});
    if(pit.length)col.appendChild(table(`${t.short}投手`,['投手','局數','安打','失分','保送','三振','全壘打'],pit));
    teams.appendChild(col)});
  sec.append(head,lsw,teams);return sec}

/* Fetch and parse the recording the same way index.html does; null on any failure. */
export async function loadBox(url='league/preseason/opening.json'){
  try{const r=await fetch(url);if(!r.ok)return null;const rec=parseRecording(await r.text());return rec?buildBox(rec):null}
  catch(e){return null}}
