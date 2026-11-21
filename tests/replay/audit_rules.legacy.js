// 規則稽核：每個出局怎麼判的；違規就標 ✗
const {open}=require('./h');(async()=>{const {b,p,errs}=await open('test.html',{w:320,h:240});
await p.waitForFunction(()=>typeof poseScene==="function"&&typeof game!=="undefined"&&game,null,{timeout:60000});await p.evaluate(()=>renderer.setAnimationLoop(null));
const r=await p.evaluate(()=>{const lines=[],bad=[];const seeds=[3,17,29,41,55];let n=0;
  const B1=new THREE.Vector3(BASES[1][0],0,BASES[1][1]),B2=new THREE.Vector3(BASES[2][0],0,BASES[2][1]);
  const runnerPos=name=>{for(const r of runners)if(r.g.visible&&r.numN===numOf(curOff,name))return r.g.position.clone();return null};
  let curOff=0;
  for(const sd of seeds){seedCur=sd;decisions={};regen();
    for(const e of game.ev){if(e.r!=='inplay'||e.play.res!=='out')continue;curOff=e.s0.half;const q=e.play;poseScene(e,ARRIVE+.01,0);const P=e._plan;n++;
      const tag=`#${sd} ${e.s0.inn}${e.s0.half?'下':'上'} ${q.type} ${q.fielder}${q.dp?' 雙殺':''}`;let msg='',ok=true;
      if(q.type==='GB'){
        // 1) 球到一壘那刻：接球的人要在壘包上、打者還沒到
        const uA=ARRIVE+P.arrive;poseScene(e,uA,0);const rk=P.solo?q.fielder:(P.dp&&q.fielder==='1B'?'P':'1B'),rp=fielders[rk].g.position,dBag=Math.hypot(rp.x-B1.x,rp.z-B1.z);
        const bat=runnerPos(e.moves.find(m=>m[0]===0)[2]),batD=bat?Math.hypot(bat.x-B1.x,bat.z-B1.z):99;
        msg=`${P.solo?'自己踩壘':rk+'接傳球'} 球到@${P.arrive.toFixed(2)}s 腳離壘${dBag.toFixed(2)}m 打者離壘${batD.toFixed(1)}m 出局顯示@${(e.showAt-ARRIVE).toFixed(2)}s`;
        if(dBag>.35){ok=false;msg+=' ✗沒踩壘'}if(batD<.5){ok=false;msg+=' ✗打者已到'}if(e.showAt<uA){ok=false;msg+=' ✗先判出局'}
        if(P.dp){const uB=ARRIVE+P.a1;poseScene(e,uB,0);const pv=fielders[P.PV].g.position,d2=Math.hypot(pv.x-B2.x,pv.z-B2.z),rn=runnerPos(e.moves.find(m=>m[0]===1)[2]),rD=rn?Math.hypot(rn.x-B2.x,rn.z-B2.z):99;
          msg+=` | 二壘 ${P.PV}踩壘${d2.toFixed(2)}m 一壘跑者離二壘${rD.toFixed(1)}m @${P.a1.toFixed(2)}s`;if(d2>.35){ok=false;msg+=' ✗'}if(rD<.5){ok=false;msg+=' ✗跑者已到'}}
        // 被擠的跑者有沒有在跑
        for(const m of e.moves)if(m[0]>0){poseScene(e,ARRIVE+2,0);const rp2=runnerPos(m[2]);if(!rp2){ok=false;msg+=` ✗跑者${m[0]}壘不見`}}
      }else{
        const cT=flyCatchT(e);msg=`接殺@${cT.toFixed(2)}s`;
        for(const m of e.moves)if(m[0]>0){poseScene(e,ARRIVE+cT-.3,0);const rp=runnerPos(m[2]),[bx,bz]=BASES[m[0]],d=rp?Math.hypot(rp.x-bx,rp.z-bz):99;msg+=` ${m[0]}壘跑者接殺前離壘${d.toFixed(2)}m`;if(d>.3){ok=false;msg+=' ✗沒tag up'}}
      }
      if(!ok)bad.push(tag+' '+msg);if(lines.length<14)lines.push((ok?'✓ ':'✗ ')+tag+' '+msg)}}
  return {n,lines,bad:bad.slice(0,20),nbad:bad.length}});
console.log('出局數',r.n,'違規',r.nbad);console.log(r.lines.join('\n'));if(r.nbad)console.log('--- 違規 ---\n'+r.bad.join('\n'));console.log('errs',errs.filter(x=>!x.includes('ERR_FAILED')).slice(0,5));await b.close()})();
