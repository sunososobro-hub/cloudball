/* League guide page (guide.html). Reads the league files directly; no copy of the data, no network besides static files.
 * Ratings are stored centred on 1.0; the page shows only the whole numbers 1 to 100 from league/ratings.js (#170), never the raw floats.
 * Each player shows his overall as the large bar on top, then one bar per ability (ui/bars.js, #192); each list is sorted by overall, the star first.
 * The staff and umpire block reads league/staff.js at load and stays hidden if the file is missing or looks wrong. */
import {TEAMS} from '../league/teams.js';
import {ROSTERS} from '../league/players.js';
import {ratingsOf} from '../league/ratings.js';
import {ratingRow} from './bars.js';

const POS={C:'捕手','1B':'一壘手','2B':'二壘手','3B':'三壘手',SS:'游擊手',LF:'左外野',CF:'中外野',RF:'右外野',DH:'指定打擊'};
const ROLE={SP:'先發投手',RP:'後援投手'};
const SIDE={L:'左',R:'右',S:'左右開弓'};
const BAT_RATINGS=[['con','打擊'],['pow','長打'],['eye','選球'],['spd','速度'],['arm','傳球']];
const PIT_RATINGS=[['stuff','球威'],['ctrl','控球'],['arm','臂力']];

const el=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
function playerRow(p,pitcher){
  const li=el('li','p'),who=el('div','who'),r=el('dl','r'),R=ratingsOf(p);
  const meta=pitcher?`${ROLE[p.role]||p.role}・${SIDE[p.throws]||''}投`:`${POS[p.pos]||p.pos}・${SIDE[p.hand]||''}打`;
  who.append(el('b',null,p.name),el('span','no num',`#${p.num}`),el('span',null,meta),el('span',null,`${p.age} 歲`));
  r.appendChild(ratingRow('綜合',R.ovr,'ovr'));
  for(const [k,label] of pitcher?PIT_RATINGS:BAT_RATINGS)r.appendChild(ratingRow(label,R[k]));
  r.appendChild(ratingRow('潛力',R.pot,'pot'));
  li.append(who,r);return li}
function section(title,list,pitcher){const h=el('h3',null,title),ul=el('ul','roster');
  const ranked=list.map((p,i)=>[p,ratingsOf(p).ovr,i]).sort((a,b)=>b[1]-a[1]||a[2]-b[2]);
  for(const [p] of ranked)ul.appendChild(playerRow(p,pitcher));return [h,ul]}

const nav=document.getElementById('nav'),main=document.getElementById('teams');
TEAMS.forEach((T,i)=>{
  const R=ROSTERS[i];if(!R)return;
  const logo=()=>{const img=new Image();img.alt='';img.draggable=false;img.src=`assets/logos/${T.id}_128.webp`;img.onerror=()=>img.remove();return img};
  const a=el('a');a.href=`#${T.id}`;a.style.setProperty('--tc',T.css);a.append(logo(),T.short);nav.appendChild(a);
  const s=el('section','team');s.id=T.id;s.style.setProperty('--tc',T.css);
  const head=el('header');head.append(logo(),el('h2',null,T.name));
  s.append(head,...section('野手（綜合評分高到低）',R.bat,false),...section('投手（綜合評分高到低）',R.pit,true));
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
