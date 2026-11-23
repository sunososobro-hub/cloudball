/* Season simulator (development tool): 4 teams, two halves x 30 nights, best-of-7 finals, aging
 * between seasons. Usage: node engine/sim/season.js [seasons]. The report is printed in the
 * league's language (game content). Official seasons will not age players here: ability comes
 * from the factory settings plus the ledger. */
import { simGame } from './game.js';
import { TEAMS } from '../../league/teams.js';
import { ROSTERS } from '../../league/players.js';
const N_TEAMS=4,HALF_NIGHTS=30,ROTATION=5,QUAL_PA_PER_G=3.1,QUAL_IP_PER_G=1.0;
const MATCHINGS=[[[0,1],[2,3]],[[0,2],[1,3]],[[0,3],[1,2]]];
const hash=(...a)=>a.reduce((h,x)=>Math.imul(h^(x>>>0),2654435761)>>>0,0x9e3779b9);
const clone=o=>JSON.parse(JSON.stringify(o));

function emptyStats(rosters){return rosters.map(r=>({bat:r.bat.map(()=>({g:0,pa:0,ab:0,h:0,d:0,t:0,hr:0,rbi:0,bb:0,k:0})),pit:r.pit.map(()=>({g:0,gs:0,outs:0,r:0,h:0,bb:0,k:0,hr:0,w:0,l:0}))}))}
function playGame(season,night,slot,away,home,rosters,starts,S){
  const sp=[starts[away]++%ROTATION,starts[home]++%ROTATION];
  const g=simGame(hash(season,night,slot),{}, {teams:[away,home],starters:sp,pen:[starts[away]*3,starts[home]*3],rosters});
  [away,home].forEach((ti,k)=>{
    g.stats[k].forEach((b,i)=>{const t=S[ti].bat[i];t.g++;t.pa+=b.ab+b.bb;for(const f of ['ab','h','d','t','hr','rbi','bb','k'])t[f]+=b[f]});
    g.pst[k].forEach((p,j)=>{if(!p.bf)return;const idx=rosters[ti].pit.indexOf(g.staff[k][j]),t=S[ti].pit[idx];t.g++;if(j===0)t.gs++;for(const f of ['outs','r','h','bb','k','hr'])t[f]+=p[f]});
  });
  const credit=(rec,f)=>{if(!rec)return;const [k,j]=rec,ti=[away,home][k],idx=rosters[ti].pit.indexOf(g.staff[k][j]);S[ti].pit[idx][f]++};
  credit(g.wp,'w');credit(g.lp,'l');
  const w=g.final.sc[0]>g.final.sc[1]?away:home;return{w,l:w===away?home:away,sc:g.final.sc};
}
function runSeason(season,rosters){
  const S=emptyStats(rosters),starts=Array(N_TEAMS).fill(0),halves=[Array(N_TEAMS).fill(0).map(()=>({w:0,l:0})),Array(N_TEAMS).fill(0).map(()=>({w:0,l:0}))];
  for(let h=0;h<2;h++)for(let n=0;n<HALF_NIGHTS;n++){const night=h*HALF_NIGHTS+n,m=MATCHINGS[n%3],flip=Math.floor(n/3)%2;
    m.forEach(([a,b],slot)=>{const [away,home]=flip?[b,a]:[a,b];const r=playGame(season,night,slot,away,home,rosters,starts,S);halves[h][r.w].w++;halves[h][r.l].l++})}
  const pct=x=>x.w/(x.w+x.l),champ=h=>[...Array(N_TEAMS).keys()].sort((a,b)=>pct(halves[h][b])-pct(halves[h][a]))[0];
  const total=[...Array(N_TEAMS).keys()].map(i=>({w:halves[0][i].w+halves[1][i].w,l:halves[0][i].l+halves[1][i].l}));
  let c1=champ(0),c2=champ(1);if(c1===c2)c2=[...Array(N_TEAMS).keys()].filter(i=>i!==c1).sort((a,b)=>pct(total[b])-pct(total[a]))[0];
  const series=[0,0];let gno=0;while(series[0]<4&&series[1]<4){const [away,home]=gno%2?[c1,c2]:[c2,c1];const r=playGame(season,1000+gno,0,away,home,rosters,starts,emptyStats(rosters));series[r.w===c1?0:1]++;gno++}
  return{S,halves,total,c1,c2,series,champion:series[0]===4?c1:c2};
}
/* aging: young players grow toward potential, peak ~27-30, decline after 31 */
function ageRosters(rosters,season){
  const rnd=(()=>{let a=hash(season,99);return()=>{a=Math.imul(a^a>>>15,a|1)+0x6D2B79F5>>>0;return a/4294967296}})();
  const grow=age=>age<=23?.05:age<=26?.025:age<=30?0:age<=33?-.03:-.06;
  const out=clone(rosters),log=[];
  out.forEach((r,ti)=>{for(const p of [...r.bat,...r.pit]){p.age++;const g=grow(p.age)*(p.pot)+ (rnd()-.5)*.03;
    for(const f of ['con','pow','eye','stuff','ctrl'])if(p[f]!==undefined){const cap=1.35;p[f]=Math.max(.6,Math.min(cap,p[f]*(1+g)))}
    if(p.age>=36&&rnd()<.6){log.push(`${TEAMS[ti].short} ${p.name}（${p.age} 歲）退休`);p.name=p.name+'·新秀';p.age=21;p.pot=.95+rnd()*.25;for(const f of ['con','pow','eye','stuff','ctrl'])if(p[f]!==undefined)p[f]*=.85}}});
  return{rosters:out,log};
}
/* ---------- report ---------- */
const f3=x=>x.toFixed(3).replace(/^0/,''),f2=x=>x.toFixed(2);
function report(res,rosters,season){
  const {S,halves,total,c1,c2,series,champion}=res,L=[];
  L.push(`===== 第 ${season} 季 =====`);
  for(const h of [0,1]){L.push(`${h?'下':'上'}半季：`+[...Array(N_TEAMS).keys()].sort((a,b)=>halves[h][b].w-halves[h][a].w).map(i=>`${TEAMS[i].short} ${halves[h][i].w}-${halves[h][i].l}`).join('、'))}
  L.push(`總冠軍賽：${TEAMS[c1].short} vs ${TEAMS[c2].short} → ${TEAMS[champion].short} 奪冠（${Math.max(...series)}-${Math.min(...series)}）`);
  const bats=[],pits=[];S.forEach((t,ti)=>{t.bat.forEach((b,i)=>bats.push({...b,ti,p:rosters[ti].bat[i]}));t.pit.forEach((p,i)=>pits.push({...p,ti,p:rosters[ti].pit[i]}))});
  const games=HALF_NIGHTS*2,qb=bats.filter(b=>b.pa>=QUAL_PA_PER_G*games),qp=pits.filter(p=>p.outs/3>=QUAL_IP_PER_G*games);
  const avg=b=>b.h/b.ab,obp=b=>(b.h+b.bb)/(b.ab+b.bb),slg=b=>(b.h+b.d+2*b.t+3*b.hr)/b.ab,era=p=>p.r*27/p.outs;
  const lg=bats.reduce((a,b)=>({ab:a.ab+b.ab,h:a.h+b.h,hr:a.hr+b.hr}),{ab:0,h:0,hr:0}),lgp=pits.reduce((a,p)=>({r:a.r+p.r,o:a.o+p.outs}),{r:0,o:0});
  L.push(`聯盟打擊率 ${f3(lg.h/lg.ab)}、聯盟防禦率 ${f2(lgp.r*27/lgp.o)}、每隊每場全壘打 ${f2(lg.hr/(games*N_TEAMS))}`);
  const top=(arr,fn,fmt,n=3)=>[...arr].sort((a,b)=>fn(b)-fn(a)).slice(0,n).map(x=>`${TEAMS[x.ti].short}${x.p.name}（${x.p.age}歲）${fmt(x)}`).join('、');
  L.push(`打擊王：${top(qb,avg,b=>f3(avg(b)))}`);
  L.push(`全壘打王：${top(bats,b=>b.hr,b=>b.hr+' 轟')}`);
  L.push(`打點王：${top(bats,b=>b.rbi,b=>b.rbi+' 分')}`);
  L.push(`OPS 前三：${top(qb,b=>obp(b)+slg(b),b=>f3(obp(b)+slg(b)))}`);
  L.push(`防禦率王：${top(qp,p=>-era(p),p=>f2(era(p)))}`);
  L.push(`勝投王：${top(pits,p=>p.w,p=>p.w+' 勝'+p.l+' 敗')}`);
  L.push(`三振王：${top(pits,p=>p.k,p=>p.k+' K')}`);
  return L.join('\n');
}
let rosters=clone(ROSTERS);const SEASONS=+(process.argv[2]||3);const watch=[[0,'bat',0],[1,'bat',3],[2,'pit',0]];
for(let s=1;s<=SEASONS;s++){
  const res=runSeason(s,rosters);console.log(report(res,rosters,s));
  console.log('追蹤：'+watch.map(([ti,k,i])=>{const p=rosters[ti][k][i],st=res.S[ti][k][i];return k==='bat'?`${p.name}（${p.age}歲）${f3(st.h/st.ab)}、${st.hr} 轟`:`${p.name}（${p.age}歲）防禦率 ${f2(st.r*27/st.outs)}`}).join('；'));
  const a=ageRosters(rosters,s);rosters=a.rosters;if(a.log.length)console.log('休賽季：'+a.log.join('、'));console.log('');
}
