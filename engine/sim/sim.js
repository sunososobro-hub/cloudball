/* ===== 零號雲端職棒 baseball sim core (deterministic) ===== */
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296}}
const ENGINE_VERSION='0.2-demo';/* 0.2：滾地刺殺時被擠的跑者強制推進（舊 #BUG 字串的種子結果會不同） */
const TEAMS=[{name:'台北捷運沙丁魚',short:'沙丁魚',color:0x2fb5a8,css:'#2fb5a8'},{name:'新竹爆肝貓頭鷹',short:'貓頭鷹',color:0xb04fc8,css:'#b04fc8'},{name:'台南溫體金剛牛',short:'金剛牛',color:0xe8743b,css:'#e8743b'},{name:'長尾山娘',short:'山娘',color:0x2f6fd6,css:'#2f6fd6'}];
const SUR='陳林黃張李王吳劉蔡楊許鄭謝洪郭邱曾廖賴徐周葉蘇莊呂江何蕭羅高潘簡朱鍾游彭詹胡施沈余盧梁顏柯翁魏孫戴范方宋鄧杜傅侯曹薛卓阮馬董唐藍石蔣古紀姚連馮歐程湯田康姜白汪尤巫黎涂龔嚴韓袁金童陸夏柳邵錢伍倪溫于譚駱熊任甘秦顧毛章史官萬俞雷饒'.split('');
const GIV='宇翔 冠廷 柏翰 家豪 承恩 宥辰 子傑 品睿 彥廷 俊宏 志明 建宏 冠宇 昱廷 柏宇 哲維 文傑 聖凱 宗翰 育誠 致遠 泓毅 竣崴 秉諺 立恆 晉豪 恩碩 東昇 冠霖 振宇 博文 宏達 子豪 鈞凱 詠勝 浩然 俊佑 奕辰 威廷 書豪'.split(' ');
const POS=['CF','SS','LF','1B','3B','RF','2B','C','DH'];
const PITCH_DUR={ball:12,cstr:12,sstr:12,foul:12,hbp:15,ibb:10,sb:12,bunt:12},BREAK_DUR=34,CHANGE_DUR=14,PRE_DUR=18,FIELD_VAVG=6.4,FIELD_REACT=.25,FIELD_REACH_BONUS=.5,VOTE_DUR=2,VOTE_WINDOW=15,BUNT_POW_MAX=1.0,BUNT_ASK_P=.6,BUNT_OK=.7,BUNT_HIT=.12;
function makeRosters(){
  const used=new Set();
  return TEAMS.map((T,ti)=>{
    const r=mulberry32(20261120+ti*7919);
    const name=()=>{let n;do{n=SUR[Math.floor(r()*SUR.length)]+GIV[Math.floor(r()*GIV.length)]}while(used.has(n));used.add(n);return n};
    const nums=new Set(),num=()=>{let n;do{n=1+Math.floor(r()*98)}while(nums.has(n));nums.add(n);return n};
    const v=(a,b)=>a+r()*(b-a);
    const bat=POS.map((p,i)=>{const slug=i>=2&&i<=5;return{name:name(),num:num(),pos:p,con:v(.9,1.12),pow:slug?v(1.0,1.3):v(.7,1.0),eye:v(.85,1.15)}});
    const pit=[0,1,2,3,4,5,6,7,8].map(i=>({name:name(),num:num(),role:i<5?'SP':'RP',stuff:i<5?v(.96,1.1):v(.92,1.08),ctrl:i<5?v(.95,1.08):v(.9,1.06)}));
    const ra=mulberry32(777+ti*31);for(const p of [...bat,...pit]){p.age=21+Math.floor(ra()*14);p.pot=.9+ra()*.25}
    {const rt=mulberry32(6060+ti*17);for(const p of pit)p.throws=rt()<.3?'L':'R'} /* 投手約 3 成左投 */
    {const ra=mulberry32(7070+ti*23);for(const p of [...bat,...pit])p.arm=+(.85+ra()*.3).toFixed(3)} /* 臂力：.85–1.15，傳球球速 */
    for(const b of bat)b.avg=+(.228+(b.con-.9)/.22*.09+(b.pow-.7)*.02).toFixed(3); /* 預設打擊率：由打擊評級換算，接上整季後改成真實成績 */
    {const rs=mulberry32(8800+ti*29);for(const b of bat)b.spd=+(.85+rs()*.3).toFixed(3)}
    {const rh=mulberry32(5150+ti*31);for(const b of bat)b.hand=rh()<.3?'L':'R'} /* 左右打：約 3 成左打 */ /* 跑速：.85–1.15，影響盜壘企圖與成功率 */
    /* 打序：1-2 棒＝上壘/速度型（打擊+選球），3-5 棒＝長打型（4 棒最強），6-9 棒其餘；每隊用自己的種子洗牌，所以兩隊打序、守位順序都不同 */
    {const o=mulberry32(4242+ti*13),L=bat.slice(),take=(arr,key,n)=>{const r=arr.slice().sort((x,y)=>key(y)-key(x)+(o()-.5)*.08).slice(0,n);r.forEach(x=>L.splice(L.indexOf(x),1));return r};
     const rest=bat.slice(),top=take(rest,b=>b.con*b.eye,2);rest.splice(0,rest.length,...bat.filter(b=>!top.includes(b)));
     const pw=take(rest,b=>b.pow*b.con,3);const left=rest.filter(b=>!pw.includes(b)).sort((x,y)=>(y.con*y.eye)-(x.con*x.eye)+(o()-.5)*.2);
     if(o()<.5)top.reverse();const clean=pw.slice().sort((x,y)=>y.pow-x.pow);
     const three=[clean[1],clean[0],clean[2]];if(o()<.4)three.reverse();
     bat.splice(0,9,...top,...three,...left)}
    /* 體型（相對標準體型的混合權重）＋身高：長打高→壯/重砲，跑速高→瘦長；純外觀，不影響模擬 */
    {const rb=mulberry32(9090+ti*41),c=x=>+Math.max(0,Math.min(1,x)).toFixed(2);
     for(const p of [...bat,...pit]){const pw=p.pow||(p.stuff||1)*.95,sp=p.spd||1,j=rb();
       p.body={slim:c((sp-1)*3.5-(pw-.9)*1.5+(j-.5)*.4),power:c((pw-.95)*3+(j-.5)*.5),heavy:c((pw-1.08)*4-(sp-1)*3+(rb()-.6)*.6)};
       p.ht=+(1.74+rb()*.16+(p.body.power+p.body.heavy)*.03).toFixed(2)}}
    return{bat,pit};
  });
}
const ROSTERS=makeRosters();

/* fielders: angle from CF line (deg), distance (m) */
const FIELD_SPOTS={P:[0,18.4],C:[180,1.3],'1B':[38,30],'2B':[15,42],SS:[-15,42],'3B':[-38,30],LF:[-28,84],CF:[0,95],RF:[28,84]};
const FIELDER_KEYS=['P','C','1B','2B','SS','3B','LF','CF','RF'];
const spotXZ=(a,d)=>[Math.sin(a*Math.PI/180)*d,-Math.cos(a*Math.PI/180)*d];

/* decisions: {id: choice}. Unresolved ids fall back to the AI coach's pick and are marked pending. */
function simGame(seed,decisions,opts){
  decisions=decisions||{};opts=opts||{};
  const TI=opts.teams||[0,1],TT=TI.map(i=>TEAMS[i]);
  const RR=TI.map((ti,k)=>{const r=(opts.rosters||ROSTERS)[ti],sp=opts.starters?opts.starters[k]:(seed>>>0)%5;const rp=r.pit.filter(p=>p.role==='RP'),o=opts.pen?opts.pen[k]%rp.length:0;return{bat:r.bat,pit:[r.pit[sp],...rp.slice(o),...rp.slice(0,o)]}});
  const R=mulberry32(seed>>>0),ev=[];let t=PRE_DUR,dn=0;
  const st={inn:1,half:0,outs:0,b:[null,null,null],sc:[0,0],ls:[[],[]],H:[0,0],E:[0,0],lu:[0,0],pi:[0,0],pc:[0,0],ra:[0,0],hold:[0,0]};
  const spdOf=(t,n)=>(RR[t].bat.find(b=>b.name===n)||{spd:1}).spd,clampP=(x,a,b)=>Math.max(a,Math.min(b,x)),stealP=(t,n)=>clampP(.45+(spdOf(t,n)-1)*1.2,.1,.85),stealOk=(t,n)=>clampP(.72+(spdOf(t,n)-1)*.6,.5,.9);
  const vote=(team,kind,q,opts,ai)=>{const id=`${kind}${dn++}`,has=Object.prototype.hasOwnProperty.call(decisions,id),pick=has?decisions[id]:ai;
    ev.push({t,d:VOTE_DUR,k:'VOTE',id,team,kind,q,opts,ai,pick,pending:!has,s0:snap(),s1:snap(),
      desc:`${TT[team].short}球迷決定：${opts.find(o=>o[0]===pick)[1]}`});t+=VOTE_DUR;return pick};
  const stats=[0,1].map(ti=>RR[ti].bat.map(()=>({ab:0,h:0,d:0,t:0,hr:0,rbi:0,bb:0,k:0})));
  const pst=[0,1].map(ti=>RR[ti].pit.map(()=>({outs:0,r:0,h:0,bb:0,k:0,hr:0,bf:0})));let lead=-1,wp=null,lp=null;
  const pIdx=d=>(opts.rosters||ROSTERS)[TI[d]].pit.indexOf(RR[d].pit[st.pi[d]]); /* 事件裡的投手編號＝球隊名單裡的索引（頁面用 ROSTERS 查） */
  const snap=()=>({inn:st.inn,half:st.half,outs:st.outs,b:st.b.slice(),sc:st.sc.slice(),ls:[st.ls[0].slice(),st.ls[1].slice()],H:st.H.slice(),E:st.E.slice()});
  ev.push({t:0,d:PRE_DUR,k:'PRE',desc:'球員進場，比賽即將開始',s0:snap(),s1:snap()});
  let over=false;
  const addRun=(n)=>{const o=st.half;st.sc[o]+=n;st.ls[o][st.inn-1]=(st.ls[o][st.inn-1]||0)+n};
  while(!over){
    const off=st.half,def=1-off;
    st.ls[off][st.inn-1]=st.ls[off][st.inn-1]||0;
    if(st.inn>9&&!st.b[1]){st.b[1]=RR[off].bat[(st.lu[off]+8)%9].name}
    while(st.outs<3&&!over){
      /* pitching change */
      const P=RR[def].pit[st.pi[def]];
      if(st.pi[def]<RR[def].pit.length-1&&st.hold[def]<=0&&(st.pi[def]?(st.pc[def]>20+R()*14||st.ra[def]>=3):(st.pc[def]>75+R()*20||st.ra[def]>=4+R()*2))){
        const cur=RR[def].pit[st.pi[def]],nx=RR[def].pit[st.pi[def]+1];
        const pick=vote(def,'P',`${cur.name} 用球數 ${st.pc[def]}，要換投嗎？`,[['change',`換上 ${nx.name}`],['stay',`${cur.name} 繼續投`]],'change');
        if(pick==='stay'){st.hold[def]=3;continue}
        const s0=snap();st.pi[def]++;st.pc[def]=0;st.ra[def]=0;const np=RR[def].pit[st.pi[def]];
        ev.push({t,d:CHANGE_DUR,k:'CHG',desc:`${TT[def].short}換投：${np.num} 號 ${np.name}`,s0,s1:snap(),def});t+=CHANGE_DUR;continue;
      }
      const pit0=RR[def].pit[st.pi[def]],bi=st.lu[off],bat=RR[off].bat[bi],bs=stats[off][bi];
      const tire=Math.max(0,st.pc[def]-85),pit={name:pit0.name,num:pit0.num,stuff:pit0.stuff*(1-tire*.003),ctrl:pit0.ctrl*(1-tire*.002)};
      const line=`${bs.ab} 打數 ${bs.h} 安打${bs.hr?`，${bs.hr} 轟`:''}`;
      const pS=pst[def][st.pi[def]],pline=`${Math.floor(pS.outs/3)}${pS.outs%3?'.'+pS.outs%3:''} 局 ${pS.k} K ${pS.bb} BB 失 ${pS.r} 分`;
      /* offense decision: steal second — coaches decide in the background; the runner breaks on the NEXT real pitch (no phantom pitch) */
      if(st.b[0]&&!st.b[1]&&st.outs<2&&!st.sbAsked&&R()<.6){
        st.sbAsked=true;if(R()<stealP(off,st.b[0]))st.steal=true;
        continue}
      st.sbAsked=false;
      /* defense decision: intentional walk */
      if((st.b[1]||st.b[2])&&!st.b[0]&&st.outs<2&&st.inn>=4&&bat.pow>1&&!st.ibbAsked&&R()<.8){
        st.ibbAsked=true;const close=Math.abs(st.sc[0]-st.sc[1])<=2;
        const pick=vote(def,'I',`得點圈有人，打者是強打 ${bat.name}，要敬遠嗎？`,[['ibb','敬遠保送'],['pitch','正面對決']],close?'ibb':'pitch');
        if(pick==='ibb'){const s0=snap(),nb=st.b.slice();nb[0]=bat.name;st.b=nb;bs.bb++;st.lu[off]=(bi+1)%9;st.hold[def]--;
          ev.push({t,k:'P',r:'ibb',bat:[off,bi],pit:[def,pIdx(def)],pc:st.pc[def],c0:[0,0],c1:[0,0],inZ:false,zx:.6,zy:.7,line,s0,moves:[[0,1,bat.name]],runs:0,pa:true,swing:false,
            desc:`${bat.name} 被故意四壞球保送`,s1:snap(),d:PITCH_DUR.ibb,showAt:1.9});t+=PITCH_DUR.ibb;st.ibbAsked=false;continue}
      }
      st.ibbAsked=false;
      /* offense decision: sacrifice bunt (no outs, runner on 1st/2nd, 3rd empty, weak-ish bat) */
      if(st.outs===0&&(st.b[0]||st.b[1])&&!st.b[2]&&st.inn>=1&&bat.pow<BUNT_POW_MAX&&R()<BUNT_ASK_P){
        const close=st.inn>=7&&st.sc[off]-st.sc[def]<=0&&st.sc[off]-st.sc[def]>=-1;
        const pick=close?'bunt':'swing'; /* 短打改教練背景決定，不再暫停投票（同盜壘） */
        if(pick==='bunt'){const s0=snap(),B=st.b.slice(),q=R();st.pc[def]++;
          let nb,moves,desc,outsAdd=0;
          if(q<BUNT_OK){ /* sacrifice: batter out, runners advance one base */
            nb=[null,B[0],B[1]];moves=[[0,1,bat.name]];if(B[1])moves.push([2,3,B[1]]);if(B[0])moves.push([1,2,B[0]]);outsAdd=1;
            desc=`${bat.name} 短打犧牲成功，跑者推進`}
          else if(q<BUNT_OK+BUNT_HIT){ /* bunt for a hit */
            nb=[bat.name,B[0],B[1]];moves=[[0,1,bat.name]];if(B[1])moves.push([2,3,B[1]]);if(B[0])moves.push([1,2,B[0]]);
            bs.ab++;bs.h++;st.H[off]++;desc=`${bat.name} 短打造成內野安打！`}
          else{ /* fielder's choice: lead runner cut down */
            bs.ab++;outsAdd=1;
            if(B[1]){nb=[bat.name,B[0],null];moves=[[0,1,bat.name],[2,3,B[1]]];if(B[0])moves.push([1,2,B[0]]);desc=`${bat.name} 短打被封殺，三壘前攔下 ${B[1]}`}
            else{nb=[bat.name,null,null];moves=[[0,1,bat.name],[1,2,B[0]]];desc=`${bat.name} 短打，二壘封殺 ${B[0]}`}}
          st.b=nb;st.outs+=outsAdd;pst[def][st.pi[def]].outs+=outsAdd;
          st.lu[off]=(bi+1)%9;st.hold[def]--;pst[def][st.pi[def]].bf++;
          ev.push({t,k:'P',r:'bunt',bat:[off,bi],pit:[def,pIdx(def)],pc:st.pc[def],c0:[0,0],c1:[0,0],inZ:true,zx:0,zy:.6,line,s0,moves,runs:0,pa:true,swing:false,
            desc,s1:snap(),d:PITCH_DUR.bunt,showAt:2.2});t+=PITCH_DUR.bunt;continue}
      }
      let balls=0,strikes=0,paDone=false;
      while(!paDone){
        const s0=snap(),c0=[balls,strikes];st.pc[def]++;const go=st.steal&&st.b[0]&&!st.b[1]&&st.outs<2;st.steal=false;
        const zoneP=Math.min(.64,.53*pit.ctrl),inZ=R()<zoneP;
        const zx=inZ?(R()-.5)*.42:(R()<.5?-1:1)*(.24+R()*.25),zy=inZ?.55+R()*.55:(R()<.5?.35-R()*.25:1.15+R()*.3);
        let sw=inZ?.65:.33/bat.eye;
        if(strikes===2)sw+=inZ?.18:.1;if(balls===3&&strikes<2)sw*=.5;if(balls===3&&strikes===0)sw*=.3;
        const jr=n=>{const x=Math.sin(n*127.1+(seed>>>0)%9973*311.7)*43758.5453;return x-Math.floor(x)};
        const pq=jr(st.pc[def]+t*.37),PT=pq<.5?['直球',0]:pq<.7?['滑球',-10]:pq<.82?['曲球',-22]:pq<.92?['變速球',-14]:['指叉球',-12];
        const kmh=Math.round(135+(pit.stuff-.95)*70+PT[1]+(jr(t*1.3+7)-.5)*7);
        const e={t,k:'P',bat:[off,bi],pit:[def,pIdx(def)],pc:st.pc[def],c0,inZ,zx,zy,line,pline,pt:PT[0],kmh,s0};
        if(R()<Math.min(.95,sw)){
          e.swing=true;
          const ct=Math.min(.97,(inZ?.86:.62)*bat.con/pit.stuff);
          if(R()>ct){strikes++;e.r='sstr'}
          else if(R()<(strikes===2?.56:.5)){e.r='foul';if(strikes<2)strikes++;e.foulDir=(R()<.5?-1:1)}
          else{e.r='inplay'}
        }else{
          if(inZ){strikes++;e.r='cstr'}else{balls++;e.r='ball'}
          if(!inZ&&R()<.012){e.r='hbp'}
        }
        let desc='',moves=[],runs=0,outsAdd=0,play=null;
        const name=`${bat.name}`;
        const force=(who)=>{ /* walk/hbp forcing */
          const m=[];if(st.b[0]){if(st.b[1]){if(st.b[2]){m.push([3,4,st.b[2]]);runs++}m.push([2,3,st.b[1]])}m.push([1,2,st.b[0]])}
          m.push([0,1,who]);
          const nb=st.b.slice();if(st.b[0]){if(st.b[1]){nb[2]=st.b[1]}nb[1]=st.b[0]}nb[0]=who;st.b=nb;return m};
        if(e.r==='hbp'||balls===4){
          moves=force(bat.name);bs.bb++;desc=e.r==='hbp'?`${name} 觸身球上壘`:`${name} 四壞球保送`;if(runs){bs.rbi+=runs;desc+=`，擠回 ${runs} 分`}paDone=true;
        }else if(strikes===3){
          outsAdd=1;bs.ab++;bs.k++;desc=`${name} ${e.r==='sstr'?'揮棒落空':'站著不動'}，三振出局`;paDone=true;
        }else if(e.r==='inplay'){
          paDone=true;bs.ab++;
          const tr=R(),type=tr<.43?'GB':tr<.64?'LD':(R()<.22?'PU':'FB');
          const spray=Math.max(-44,Math.min(44,(R()-.5)*88+(R()-.5)*20));
          let res='out',hr=false;
          const hrP=.155*bat.pow*bat.pow/pit.stuff;
          if(type==='GB'){if(R()<.255*bat.con/pit.stuff)res=R()<.04?'2B':'1B'}
          else if(type==='LD'){if(R()<.7*bat.con/pit.stuff){const q=R();res=q<.68?'1B':q<.97?'2B':'3B'}}
          else if(type==='FB'){if(R()<hrP){res='HR'}else if(R()<.17){const q=R();res=q<.35?'1B':q<.9?'2B':'3B'}}
          else{if(R()<.02)res='1B'}
          if(res==='out'&&R()<.015)res='E';
          /* geometry */
          let dist,hang,peak;
          if(type==='GB'){dist=res==='out'||res==='E'?24+R()*16:55+R()*20;hang=dist/(res==='out'?28:32);peak=.6}
          else if(type==='LD'){dist=res==='out'?(R()<.4?35+R()*10:60+R()*30):60+R()*40;hang=dist/34;peak=3+R()*3}
          else if(type==='PU'){dist=15+R()*30;hang=4+R()*1.2;peak=30+R()*8}
          else{dist=res==='HR'?114+R()*22:(res==='out'?65+R()*35:85+R()*25);hang=3.4+R()*1.4;peak=22+R()*12}
          if(res==='3B')dist=Math.max(dist,100);
          const [lx,lz]=spotXZ(spray,dist);
          /* fielder */
          let best='P',bd=1e9;for(const k of FIELDER_KEYS){if(k==='C')continue;const [fx,fz]=spotXZ(...FIELD_SPOTS[k]);const d=Math.hypot(fx-lx,fz-lz);if(d<bd){bd=d;best=k}}
          /* a ball that is caught/fielded must be reachable at a human average speed from the fielder's spot: pull the landing point toward him */
          let plx=lx,plz=lz;
          if(res==='out'||res==='E'){const [fx,fz]=spotXZ(...FIELD_SPOTS[best]),reach=Math.max(0,FIELD_VAVG*(hang-FIELD_REACT))+FIELD_REACH_BONUS;
            if(bd>reach){const k=reach/bd;plx=fx+(lx-fx)*k;plz=fz+(lz-fz)*k}}
          play={type,res,lx:plx,lz:plz,hang,peak,fielder:best,spray,dist};
          const B=st.b;
          if(res==='HR'){moves=[];for(let i=2;i>=0;i--)if(B[i]){moves.push([i+1,4,B[i]]);runs++}moves.push([0,4,bat.name]);runs++;st.b=[null,null,null];bs.h++;bs.hr++;st.H[off]++;
            desc=`${name} ${runs===4?'滿貫全壘打！':runs>1?`${runs} 分砲！`:'陽春全壘打！'}`;e.big=2}
          else if(res==='1B'||res==='2B'||res==='3B'||res==='E'){
            const adv=res==='3B'?3:res==='2B'?2:1;const nb=[null,null,null];moves=[];
            for(let i=2;i>=0;i--){if(!B[i])continue;let to=i+1+adv;
              if(res==='1B'&&i===1&&R()<.6)to=4;if(res==='1B'&&i===0&&!nb[2]&&R()<.25)to=3;if(res==='2B'&&i===0&&R()<.4)to=4;
              to=Math.min(4,to);while(to<4&&nb[to-1])to++;to=Math.min(4,to);
              moves.push([i+1,to,B[i]]);if(to===4)runs++;else nb[to-1]=B[i]}
            moves.push([0,adv,bat.name]);nb[adv-1]=bat.name;st.b=nb;
            if(res==='E'){st.E[def]++;desc=`${name} 擊出${type==='GB'?'滾地球':'飛球'}，守備失誤上壘`}
            else{bs.h++;st.H[off]++;desc=`${name} ${{'1B':'一壘安打','2B':'二壘安打','3B':'三壘安打'}[res]}`}
            if(runs)desc+=`，帶回 ${runs} 分`;e.big=runs?1:0}
          else{ /* outs */
            const fn={P:'投手',C:'捕手','1B':'一壘手','2B':'二壘手',SS:'游擊手','3B':'三壘手',LF:'左外野手',CF:'中外野手',RF:'右外野手'}[best];
            if(type==='GB'&&B[0]&&st.outs<2&&R()<.5){outsAdd=2;moves=[[1,2,B[0]],[0,1,bat.name]];play.dp=true;const nb=[null,B[1],B[2]];
              if(st.outs===0&&B[2]){moves.push([3,4,B[2]]);runs++;nb[2]=null}
              if(st.outs===0&&B[1]){moves.push([2,3,B[1]]);nb[2]=B[1];nb[1]=null}
              st.b=nb;desc=`${name} 擊出${fn}方向滾地球，雙殺！`}
            else{outsAdd=1;const nb=B.slice();moves=[[0,1,bat.name]];
              /* 規則：滾地球一出手，打者與被擠的跑者（一壘起連續有人）都必須跑；一壘封殺打者後，被擠的跑者已經到下一個壘 */
              if(type==='GB'&&B[0]&&st.outs<2){const fc=B[1]?(B[2]?3:2):1;for(let k=fc-1;k>=0;k--){if(k===2){moves.push([3,4,B[2]]);runs++;nb[2]=null}else{moves.push([k+1,k+2,B[k]]);nb[k+1]=B[k];nb[k]=null}}
                desc=`${name} ${fn}前滾地球出局，跑者推進`;st.b=nb}
              else{
              if(st.outs<2&&type==='FB'&&B[2]&&R()<.55){moves.push([3,4,B[2]]);runs++;nb[2]=null;desc=`${name} 高飛犧牲打，${B[2]} 回來得分`}
              else if(st.outs<2&&type==='GB'&&(B[1]||B[2])&&R()<.5){if(B[2]){moves.push([3,4,B[2]]);runs++;nb[2]=null}if(B[1]&&!nb[2]){moves.push([2,3,B[1]]);nb[2]=B[1];nb[1]=null}desc=`${name} ${fn}前滾地球出局，跑者推進`}
              else desc=`${name} ${type==='GB'?`${fn}前滾地球`:type==='LD'?`平飛球被${fn}接殺`:type==='PU'?'內野高飛球':`${fn}接殺`}出局`;
              st.b=nb}}
            if(runs)desc+=runs>1?`（${runs} 分）`:''}
          bs.rbi+=res==='E'?0:runs;
        }else{
          desc={ball:'壞球',cstr:'好球',sstr:'揮空',foul:'界外球'}[e.r];
          if(go&&e.r!=='foul'){const rn=st.b[0],ok=R()<stealOk(off,rn);moves=[[1,2,rn]];e.sbGo=true;e.big=ok?1:0;
            if(ok){st.b=[null,rn,st.b[2]];desc+=`，${rn} 盜壘成功！`}else{st.b=[null,null,st.b[2]];outsAdd=1;desc+=`，${rn} 盜壘失敗，被觸殺出局`}}
        }
        if(paDone){st.lu[off]=(bi+1)%9;st.hold[def]--;const ps=pst[def][st.pi[def]];ps.bf++;if(/三振/.test(desc))ps.k++;if(e.r==='hbp'||/保送/.test(desc))ps.bb++;
          if(play&&['1B','2B','3B','HR'].includes(play.res)){ps.h++;if(play.res==='HR')ps.hr++;if(play.res==='2B')bs.d++;if(play.res==='3B')bs.t++}}
        pst[def][st.pi[def]].outs+=Math.min(outsAdd,3-Math.min(st.outs,3));
        st.outs+=outsAdd;
        if(st.outs>=3){ /* runs on 3rd out only if not force/batter out: simplified — no runs if inning ends */
          if(runs&&outsAdd){runs=0;desc=desc.replace(/，.*回來得分|（\d+ 分）|，跑者推進/,'')}
          st.outs=3}
        if(runs){addRun(runs);st.ra[def]+=runs;pst[def][st.pi[def]].r+=runs;
          const nl=st.sc[0]>st.sc[1]?0:st.sc[1]>st.sc[0]?1:-1;if(nl!==lead){lead=nl;if(nl>=0){wp=[nl,st.pi[nl]];lp=[1-nl,st.pi[1-nl]]}}}
        if(paDone){balls=0;strikes=0}
        e.c1=[balls,strikes];e.moves=moves;e.play=play;e.runs=runs;e.desc=desc;e.pa=paDone;
        if(st.half===1&&st.inn>=9&&st.sc[1]>st.sc[0]){over=true;e.walkoff=true;e.desc+='，再見比賽！';e.big=2}
        e.s1=snap();
        let d=PITCH_DUR[e.r]||10;
        if(e.r==='inplay'){d=8+play.hang+(moves.length?2.5:0)+(runs?2:0);{const [fx,fz]=spotXZ(...FIELD_SPOTS[play.fielder]),dd=Math.hypot(play.lx-fx,play.lz-fz),catchT=Math.max(play.hang+.8,dd/FIELD_VAVG+FIELD_REACT);d=Math.max(d,2.05+catchT+1.2+dd/6.5+.6)}}
        if(e.r==='hbp'||balls===0&&paDone&&e.r==='ball')d=12;
        if(paDone)d+=3;
        e.d=d;e.showAt=e.r==='inplay'?1.75+play.hang:e.sbGo?2.6:1.9;ev.push(e);t+=d;if(st.outs>=3&&!paDone)break;
      }
    }
    if(over)break;
    /* end half inning */
    const s0=snap();
    if(st.half===0&&st.inn>=9&&st.sc[1]>st.sc[0]){over=true;break}
    if(st.half===1&&st.inn>=9&&st.sc[0]!==st.sc[1]){over=true;break}
    if(st.half===1&&st.inn>=15){over=true;break}
    if(st.half===0){st.half=1}else{st.half=0;st.inn++}
    st.outs=0;st.b=[null,null,null];st.sbAsked=false;st.ibbAsked=false;st.steal=false;
    ev.push({t,d:BREAK_DUR,k:'BRK',desc:`${s0.half?`${s0.inn} 局下`:`${s0.inn} 局上`}結束，${TT[0].short} ${s0.sc[0]}：${s0.sc[1]} ${TT[1].short}`,s0,s1:snap()});t+=BREAK_DUR;
  }
  const fin=snap();fin.outs=3;
  const w=fin.sc[0]>fin.sc[1]?0:fin.sc[1]>fin.sc[0]?1:-1;
  ev.push({t,d:1e9,k:'END',desc:w<0?`比賽結束，雙方 ${fin.sc[0]}：${fin.sc[1]} 戰平`:`比賽結束！${TT[w].name} ${Math.max(...fin.sc)}：${Math.min(...fin.sc)} 獲勝`,s0:fin,s1:fin});
  return{ev,dur:t,stats,pst,final:fin,wp,lp,staff:RR.map(r=>r.pit),teams:TI};
}
if(typeof module!=='undefined')module.exports={simGame,ROSTERS,TEAMS};

