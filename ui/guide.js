/* League guide page (guide.html). Reads the league files directly; no copy of the data, no network besides static files.
 * Ratings are stored centred on 1.0; the page shows only the whole numbers 1 to 100 from league/ratings.js (#170), never the raw floats.
 * Each player shows his overall as the large bar on top, then one bar per ability (ui/bars.js, #192); each list starts sorted by overall, the star first; the sort bar above it re-sorts by any one ability, and 比較 on a card opens the two-player panel (ui/compare.js, #192).
 * Wide screens (1000 px and up, #197): each team opens with its star strip (best overall, fielder or pitcher), then one dense sortable table per group
 * (one row per player, a short bar and its number per ability); a tap on a row opens his bio line and the compare button. The card list stays for phones and
 * mid widths; both lists share one sort, and CSS decides which one shows.
 * The staff and umpire block reads league/staff.js at load and stays hidden if the file is missing or looks wrong.
 * The box score of the frozen first game (ui/boxscore.js, #53 part 2) reads league/preseason/opening.json and stays hidden the same way. */
import {TEAMS} from '../league/teams.js';
import {ROSTERS} from '../league/players.js';
import {ratingsOf} from '../league/ratings.js';
import {bioOf} from '../league/bios.js';
import {ratingRow,barColor,RATING_MAX} from './bars.js';
import {attachCompare} from './compare.js';

const POS={C:'捕手','1B':'一壘手','2B':'二壘手','3B':'三壘手',SS:'游擊手',LF:'左外野',CF:'中外野',RF:'右外野',DH:'指定打擊'};
const ROLE={SP:'先發投手',RP:'後援投手'};
const SIDE={L:'左',R:'右',S:'左右開弓'};
const BAT_RATINGS=[['con','打擊'],['pow','長打'],['eye','選球'],['spd','速度'],['arm','傳球']];
const PIT_RATINGS=[['stuff','球威'],['ctrl','控球'],['arm','臂力']];

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
function playerRow(p,pitcher,team){
  const li=el('li','p'),who=el('div','who'),r=el('dl','r'),R=ratingsOf(p);
  const meta=pitcher?`${ROLE[p.role]||p.role}・${SIDE[p.throws]||''}投`:`${POS[p.pos]||p.pos}・${SIDE[p.hand]||''}打`;
  who.append(el('b',null,p.name),el('span','no num',`#${p.num}`),el('span',null,meta),el('span',null,`${p.age} 歲`));
  r.appendChild(ratingRow('綜合',R.ovr,'ovr'));
  for(const [k,label] of pitcher?PIT_RATINGS:BAT_RATINGS)r.appendChild(ratingRow(label,R[k]));
  r.appendChild(ratingRow('潛力',R.pot,'pot'));
  li.append(who,r);attachCompare(li,{id:`${team}:${p.num}:${p.name}`,name:p.name,num:p.num,meta:`${team}・${meta}`,kind:pitcher?'pit':'bat',R});return li}
/* Dense table (#197): one row per player. cell() = short bar + the number beside it (never colour alone). */
const cell=(v,cls)=>{const td=el('td',cls),m=el('span','mini'),i=el('i');i.style.width=`${v/RATING_MAX*100}%`;i.style.background=barColor(v);m.appendChild(i);td.append(m,el('b','num',v));return td};
function tableRow(p,pitcher,team,R,cols,meta){
  const tr=el('tr','row'),more=el('tr','more'),nm=el('td','nm'),tog=el('button','rowtog');tog.type='button';tog.setAttribute('aria-expanded','false');
  tog.append(el('b',null,p.name),el('span','no num',`#${p.num}`));nm.appendChild(tog);
  tr.append(nm,el('td','mt',meta),el('td','ag',`${p.age} 歲`),cell(R.ovr,'ov'));
  for(const [k] of cols)tr.appendChild(cell(R[k]));
  tr.appendChild(cell(R.pot,'pt'));
  const td=el('td'),d=el('div','detail'),bio=bioOf(p.id);td.colSpan=cols.length+5;more.hidden=true;
  if(bio&&bio.line)d.appendChild(el('p','bio',bio.line));
  d.appendChild(el('div','who'));td.appendChild(d);more.appendChild(td);
  attachCompare(d,{id:`${team}:${p.num}:${p.name}`,name:p.name,num:p.num,meta:`${team}・${meta}`,kind:pitcher?'pit':'bat',R});
  tr.onclick=()=>{const open=more.hidden;more.hidden=!open;tog.setAttribute('aria-expanded',String(open))};
  return [tr,more]}
/* Each roster has a sort bar (#192 item 2) on the cards and sortable column heads on the table (#197): overall (default) or any one ability; ties fall back to overall, then to the factory order. */
function section(title,list,pitcher,team){const blk=el('div','blk'),h=el('h3',null,title),ul=el('ul','roster'),bar=el('div','sortbar');bar.setAttribute('role','group');bar.setAttribute('aria-label',`${title}排序`);
  const cols=pitcher?PIT_RATINGS:BAT_RATINGS,keys=[['ovr','綜合'],...cols,['pot','潛力']];
  const tw=el('div','tblw'),tbl=el('table','tbl'),tb=el('tbody'),hr=el('tr');tbl.setAttribute('aria-label',`${team}${title}`);
  hr.append(el('th',null,'球員'),el('th',null,pitcher?'角色・投':'守位・打'),el('th',null,'年齡'));
  const heads=[];for(const [k,label] of keys){const th=el('th',k==='ovr'?'ov':null),b=el('button',null,label);b.type='button';b.dataset.k=k;th.appendChild(b);hr.appendChild(th);heads.push(th)}
  const thead=el('thead');thead.appendChild(hr);tbl.append(thead,tb);tw.appendChild(tbl);
  const rows=list.map((p,i)=>{const R=ratingsOf(p),meta=pitcher?`${ROLE[p.role]||p.role}・${SIDE[p.throws]||''}投`:`${POS[p.pos]||p.pos}・${SIDE[p.hand]||''}打`;
    const [tr,more]=tableRow(p,pitcher,team,R,cols,meta);return {li:playerRow(p,pitcher,team),tr,more,R,i}});
  const sortBy=k=>{rows.sort((a,b)=>b.R[k]-a.R[k]||b.R.ovr-a.R.ovr||a.i-b.i);ul.replaceChildren(...rows.map(x=>x.li));tb.replaceChildren(...rows.flatMap(x=>[x.tr,x.more]));
    for(const b of bar.children)b.setAttribute('aria-pressed',String(b.dataset.k===k));
    for(const th of heads)th.setAttribute('aria-sort',th.firstChild.dataset.k===k?'descending':'none')};
  for(const [k,label] of keys){const b=el('button',null,label);b.type='button';b.dataset.k=k;b.onclick=()=>sortBy(k);bar.appendChild(b)}
  for(const th of heads)th.firstChild.onclick=()=>sortBy(th.firstChild.dataset.k);
  sortBy('ovr');blk.append(h,bar,ul,tw);return blk}
/* The star of a team: the best overall of his fielders and pitchers together (the first one listed wins a tie). */
function starOf(R){let best=null;
  for(const [list,pitcher] of [[R.bat,false],[R.pit,true]])for(const p of list){const ovr=ratingsOf(p).ovr;if(!best||ovr>best.ovr)best={p,pitcher,ovr}}
  return best}
function starStrip(star,team){
  const {p,pitcher,ovr}=star,meta=pitcher?`${ROLE[p.role]||p.role}・${SIDE[p.throws]||''}投`:`${POS[p.pos]||p.pos}・${SIDE[p.hand]||''}打`,bio=bioOf(p.id);
  const s=el('div','star'),info=el('div','info'),top=el('div','top1');
  top.append(el('span','tag','球星'),el('b',null,p.name),el('span','no num',`#${p.num}`),el('span','mt',`${meta}・${p.age} 歲`));
  info.appendChild(top);if(bio&&bio.line)info.appendChild(el('p','bio',bio.line));
  const big=el('div','bigovr'),n=el('b','num',ovr);big.append(n,el('small',null,'綜合'));
  s.append(big,info);return s}

const nav=document.getElementById('nav'),main=document.getElementById('teams');
TEAMS.forEach((T,i)=>{
  const R=ROSTERS[i];if(!R)return;
  const logo=()=>{const img=new Image();img.alt='';img.draggable=false;img.src=`assets/logos/${T.id}_128.webp`;img.onerror=()=>img.remove();return img};
  const star=starOf(R);
  const a=el('a');a.href=`#${T.id}`;a.style.setProperty('--tc',T.css);a.append(logo(),T.short);if(star){const c=el('small','nstar');c.append('球星 ',el('b','num',star.ovr));a.appendChild(c)}nav.appendChild(a);
  const s=el('section','team');s.id=T.id;s.style.setProperty('--tc',T.css);
  const head=el('header');head.append(logo(),el('h2',null,T.name));
  const pair=el('div','pair');pair.append(section('野手',R.bat,false,T.short),section('投手',R.pit,true,T.short));
  s.append(head);if(star)s.appendChild(starStrip(star,T.short));s.appendChild(pair);
  s.appendChild(el('p','empty','生涯成績：尚無。季前熱身賽不列入正史，正式開季後才會有數字。'));
  main.appendChild(s)});

/* Staff and umpires: hidden unless league/staff.js loads and holds what we can read. No placeholder names, no error on screen.
 * staff.js exports STAFF as one flat list (team, role), staffOf(team), ROLES (Chinese label per role) and UMPIRES (with years). */
const isPerson=x=>x&&typeof x==='object'&&typeof x.name==='string'&&x.name;
function crewList(items,tagOf){const ul=el('ul','crew');for(const x of items){const li=el('li');li.append(el('b',null,`${x.num!=null?'#'+x.num+' ':''}${x.name}`));
  const tag=tagOf(x);if(tag)li.append(` ${tag}`);
  if(typeof x.line==='string'&&x.line){li.appendChild(el('span','line',x.line))}ul.appendChild(li)}return ul}
/* The path sits in a variable on purpose: the file is optional, so tests/replay/static.mjs must not demand it. */
const STAFF_FILE='../league/staff.js';
try{
  const S=await import(STAFF_FILE);
  const host=document.getElementById('staff'),blocks=[],roles=S.ROLES||{};
  TEAMS.forEach(T=>{
    const list=(typeof S.staffOf==='function'?S.staffOf(T.id):[]).filter(isPerson);
    if(!list.length)return;
    const sec=el('section','team');sec.style.setProperty('--tc',T.css);sec.append(el('h3',null,`${T.short}教練團`),crewList(list,x=>roles[x.role]||''));blocks.push(sec)});
  const umps=(Array.isArray(S.UMPIRES)?S.UMPIRES:[]).filter(isPerson);
  if(umps.length){const sec=el('section','team');sec.append(el('h3',null,'聯盟裁判'),crewList(umps,x=>Number.isFinite(x.years)?`資歷 ${x.years} 年`:''));blocks.push(sec)}
  if(blocks.length){host.append(el('h2',null,'教練團與裁判'),...blocks);host.hidden=false}
}catch(e){/* no staff file yet: the block stays hidden */}

/* Box score of the frozen first game: hidden unless the recording loads and parses. */
try{
  const {loadBox}=await import('./boxscore.js'),blk=await loadBox(),host=document.getElementById('box');
  if(blk&&host){host.appendChild(blk);host.hidden=false}
}catch(e){/* no recording or no module: the block stays hidden */}
