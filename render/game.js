{


/* Everything about the game itself (rules, outcomes, timings of plays) comes from engine/. This file only draws it. */
const {simGame,ROSTERS,TEAMS,ENGINE_VERSION,mulberry32,FIELD_VAVG,FIELD_REACT,VOTE_WINDOW,FIELD_SPOTS,FIELDER_KEYS,spotXZ,BASES,RELEASE,ARRIVE,CATCH_SNAP,CATCHER_POP,
  runDist,runTime,leadAt,fielderStart,SLIDE_D,THROW_MIN,RUN_ACCEL,COVER_REACT,COVER_SPEED,PIVOT_SPEED}=window.ENGINE;
const $=id=>document.getElementById(id);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const CYCLE=7200,BPM=132;
const fmtT=ms=>{const d=new Date(ms);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
const seedOf=gs=>(Math.imul((gs/1000)>>>0,2654435761)^0x5bd1e995)>>>0;

/* ---------- schedule & game ---------- */
let gameStart=0,game=null,mode='live',replayT=0,speed=1,lastIdx=-1,seedCur=0,decisions={},myVotes={};const cues=new Set();
let myTeam=-1;try{const v=localStorage.getItem('zu_team');if(v!==null)myTeam=+v}catch(e){}
let DB=null,UID=null,unsubDec=null,unsubVotes=null,voteDocs=[];
const DEC_KEY=/^[PSI]\d+$/;
function regen(){game=simGame(seedCur,decisions)}
function loadGame(gs){gameStart=gs;seedCur=seedOf(gs);decisions={};myVotes={};regen();$('seedTag').textContent=`引擎 ${ENGINE_VERSION}・種子 #${seedCur.toString(16)}`;lastIdx=-1;subscribeGame()}
function subscribeGame(){if(unsubDec)unsubDec();if(unsubVotes)unsubVotes();unsubDec=unsubVotes=null;voteDocs=[];
  if(!DB||mode==='practice'||mode==='opening')return;const key=String(gameStart);
  try{unsubDec=DB.doc('decisions/g'+key).onSnapshot(snap=>{const d=snap.exists?snap.data():{},nd={};for(const k in d)if(DEC_KEY.test(k)&&typeof d[k]==='string')nd[k]=d[k];
      if(JSON.stringify(nd)!==JSON.stringify(decisions)){decisions=nd;regen()}},()=>{});
    unsubVotes=DB.collection('votes').where('g','==',key).onSnapshot(snap=>{voteDocs=snap.docs.map(x=>x.data())},()=>{})}catch(e){}}
function tally(e){const c={};for(const [v] of e.opts)c[v]=0;
  if(mode==='practice'){if(myVotes[e.id])c[myVotes[e.id]]++;return c}
  for(const d of voteDocs)if(d&&d.id===e.id&&d.team===e.team&&c[d.c]!==undefined)c[d.c]++;return c}
const resolving=new Set();
async function resolveVote(e){if(resolving.has(e.id))return;resolving.add(e.id);
  const c=tally(e),tot=Object.values(c).reduce((a,b)=>a+b,0);
  const pick=tot?Object.keys(c).sort((a,b)=>c[b]-c[a]||(a===e.ai?-1:b===e.ai?1:0))[0]:e.ai;
  if(mode==='practice'||!DB){decisions={...decisions,[e.id]:pick};regen();return}
  await new Promise(r=>setTimeout(r,Math.random()*1200));if(Object.prototype.hasOwnProperty.call(decisions,e.id))return;
  try{const ref=DB.doc('decisions/g'+gameStart),L=await ref.acquire({holder:UID||('t'+Math.random().toString(36).slice(2)),ttlMs:5000});if(!L.acquired)return;
    const snap=await ref.get(),cur={};if(snap.exists){const d=snap.data();for(const k in d)if(DEC_KEY.test(k))cur[k]=d[k]}
    if(cur[e.id]===undefined){cur[e.id]=pick;await ref.set(cur)}}catch(err){}}
async function castVote(e,v){if(!e||e.k!=='VOTE')return;myVotes[e.id]=v;voteKey='';
  if(mode==='practice')return;
  if(DB&&UID){try{await DB.doc('votes/'+UID).set({g:String(gameStart),id:e.id,c:v,team:e.team})}catch(err){note('投票沒送出去：你可能只有檢視權限，請分享者把你設成「參與者」')}}
  else note('這個畫面沒有登入，票不會被計入（練習場可以自己玩）')}
/* Voting never pauses: the window opens VOTE_WINDOW s before the decision point while play goes on; at the decision point the result is applied */
let voteEv=null;
function findVote(T){if(mode==='opening')return null;/* the frozen game never opens a vote */const ev=game.ev;for(let i=Math.max(0,findIdx(T)-1);i<ev.length&&ev[i].t-VOTE_WINDOW<=T;i++)if(ev[i].k==='VOTE'&&T<ev[i].t+3)return ev[i];return null}
let voteKey='';const voteLabel=(e,v)=>(e.opts.find(o=>o[0]===v)||[,''])[1];
function renderVote(e,T){const vp=$('vote');if(e)bugPlace();if(!e){if(!vp.hidden){vp.hidden=true;voteKey=''}return}
  const u=T-(e.t-VOTE_WINDOW),W=VOTE_WINDOW,left=Math.max(0,Math.ceil(W-u)),open=u<W&&(mode==='practice'||mode==='live');
  const c=tally(e),tot=Object.values(c).reduce((a,b)=>a+b,0);
  let foot;if(u<W)foot=`剩 ${left} 秒`+(open?'・點一個選項投票':'・重播中不能投票');
  else if(!e.pending)foot=tot?`球迷決定：${voteLabel(e,e.pick)}（共 ${tot} 票）`:`沒人投票，由 AI 教練決定：${voteLabel(e,e.pick)}`;
  else foot=u<W+3?'計票中…':`由 AI 教練決定：${voteLabel(e,e.ai)}`;
  const k=[e.id,foot,open,JSON.stringify(c),myVotes[e.id]].join('|');if(k===voteKey)return;voteKey=k;vp.hidden=false;
  vp.innerHTML=`<div class="vq"><b>${TEAMS[e.team].short}教練團決策・球迷投票</b>${e.q}</div><div class="vopts">${e.opts.map(([v,l])=>`<button data-v="${v}" ${open?'':'disabled'} aria-pressed="${myVotes[e.id]===v}">${l}<span>${c[v]||0} 票</span></button>`).join('')}</div><div class="vfoot">${foot}</div>`}
let curEvent=null,curU=0;
$('vote').addEventListener('click',ev=>{const b=ev.target.closest('button[data-v]');if(b&&!b.disabled)castVote(voteEv,b.dataset.v)});
function setTeam(t){myTeam=t;try{localStorage.setItem('zu_team',String(t))}catch(e){}$('team').textContent=t<0?'選邊站':`挺${TEAMS[t].short}`;voteKey=''}
$('team').onclick=()=>setTeam(myTeam===-1?0:myTeam===0?1:-1);
$('introTeam').addEventListener('click',ev=>{const b=ev.target.closest('button[data-t]');if(!b)return;setTeam(+b.dataset.t);for(const x of $('introTeam').children)x.setAttribute('aria-pressed',x===b)});
function liveStart(){return Math.floor(Date.now()/1000/CYCLE)*CYCLE*1000}
loadGame(liveStart());
function curT(){return mode==='live'?(Date.now()-gameStart)/1000:replayT}
(async()=>{try{if(!window.claude||!claude.use)return;const [db,u]=await Promise.all([claude.use('db'),claude.use('user')]);DB=db;if(u){try{UID=await u.id()}catch(e){}}if(DB)subscribeGame()}catch(e){}})();
function findIdx(T){const ev=game.ev;let lo=0,hi=ev.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(ev[m].t<=T)lo=m;else hi=m-1}return lo}

/* ---------- renderer & scene ---------- */
const renderer=window.RENDERER;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.0;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const LC=h=>new THREE.Color(h);
/* CC0 textures (ambientCG): assets/tex/<name>_c/_n/_orm.jpg; orm = R:AO G:roughness */
const TXL=new THREE.TextureLoader(),TX={};
function tex(name,srgb){if(TX[name])return TX[name];const t=TXL.load('assets/tex/'+name+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return TX[name]=t}/* r152+ colour management: hex is treated as sRGB and converted to linear */
$('stage').appendChild(renderer.domElement);
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(LC(0x0d1220),.0032);/* Thin night-stadium haze: the distance fades out, adding depth */
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.1,800);camera.rotation.order='YXZ';
const rig=new THREE.Group();rig.add(camera);scene.add(rig);
scene.add(new THREE.HemisphereLight(LC(0x9fb4e6),LC(0x2a3a24),0.22*Math.PI));
const key=new THREE.DirectionalLight(LC(0xfff1dc),1.9*Math.PI);key.position.set(-45,85,35);key.target.position.set(0,0,-38);scene.add(key,key.target);
key.castShadow=true;Object.assign(key.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:10,far:260});key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0004;key.shadow.normalBias=.03;
const fill=new THREE.DirectionalLight(LC(0xd6e2ff),.5*Math.PI);fill.position.set(60,55,-110);scene.add(fill);
/* sky dome */
{const {positionLocal,normalize,clamp:tc,mix,vec3,pow,exp,float}=TSL;const p=normalize(positionLocal),h=tc(p.y,0,1);
  const c=mix(vec3(.11,.14,.24),vec3(.008,.012,.03),pow(h,.45)).add(vec3(.12,.1,.06).mul(exp(h.mul(-14))));
  const m=new THREE.MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});m.colorNode=c;scene.add(new THREE.Mesh(new THREE.SphereGeometry(520,32,16),m))}

/* field texture */
function fieldTex(){
  const X0=-130,Z0=-150,W=260,H=190,S=3072/W,c=document.createElement('canvas');c.width=3072;c.height=Math.round(H*S);
  const g=c.getContext('2d'),X=x=>(x-X0)*S,Y=z=>(z-Z0)*S;
  const wedge=r=>{g.beginPath();g.moveTo(X(0),Y(0));for(let a=-45;a<=45;a+=1){const t=a*Math.PI/180;g.lineTo(X(Math.sin(t)*r),Y(-Math.cos(t)*r))}g.closePath()};
  g.fillStyle='#2c6331';g.fillRect(0,0,c.width,c.height);
  g.save();wedge(110);g.clip();for(let z=-150,i=0;z<10;z+=6,i++){g.fillStyle=i%2?'#27662c':'#317a36';g.fillRect(0,Y(z),c.width,6*S)}g.restore();
  g.save();wedge(110);g.fillStyle='#7a5a3c';g.fill();wedge(106);g.clip();for(let z=-150,i=0;z<10;z+=6,i++){g.fillStyle=i%2?'#27662c':'#317a36';g.fillRect(0,Y(z),c.width,6*S)}g.restore();
  g.fillStyle='#9c6b42';g.beginPath();g.arc(X(0),Y(-18.4),29*S,0,7);g.fill();
  g.fillStyle='#3a8440';g.beginPath();g.moveTo(X(0),Y(-3.2));g.lineTo(X(16.2),Y(-19.4));g.lineTo(X(0),Y(-35.6));g.lineTo(X(-16.2),Y(-19.4));g.closePath();g.fill();
  g.fillStyle='#9c6b42';for(const [x,z,r] of [[0,-18.4,2.7],[0,0,4],[19.4,-19.4,2.2],[0,-38.8,2.2],[-19.4,-19.4,2.2]]){g.beginPath();g.arc(X(x),Y(z),r*S,0,7);g.fill()}
  g.strokeStyle='#fff';g.lineWidth=.12*S;
  for(const s of [-1,1]){g.beginPath();g.moveTo(X(0),Y(0));g.lineTo(X(s*Math.sin(Math.PI/4)*110),Y(-Math.cos(Math.PI/4)*110));g.stroke();g.strokeRect(X(s>0?.6:-1.5),Y(-.9),.9*S,1.8*S)}
  g.fillStyle='#fff';for(const [x,z] of [[19.4,-19.4],[0,-38.8],[-19.4,-19.4]]){g.save();g.translate(X(x),Y(z));g.rotate(Math.PI/4);g.fillRect(-.22*S,-.22*S,.44*S,.44*S);g.restore()}
  g.beginPath();g.moveTo(X(-.22),Y(-.22));g.lineTo(X(.22),Y(-.22));g.lineTo(X(.22),Y(0));g.lineTo(X(0),Y(.22));g.lineTo(X(-.22),Y(0));g.closePath();g.fill();
  g.fillRect(X(-.3),Y(-18.5),.6*S,.15*S);
  try{const im=g.getImageData(0,0,c.width,c.height),d=im.data;let r=12345;for(let i=0;i<d.length;i+=4){r=(r*1103515245+12345)&0x7fffffff;const n=((r>>16)&31)-15;d[i]+=n;d[i+1]+=n*1.1;d[i+2]+=n*.7}g.putImageData(im,0,0)}catch(e){}
  try{FIELD_PIX={d:g.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height,X,Y}}catch(e){}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.getMaxAnisotropy();return t;
}
let FIELD_PIX=null;
const isGrassAt=(x,z)=>{const F=FIELD_PIX;if(!F)return false;const px=Math.round(F.X(x)),py=Math.round(F.Y(z));if(px<0||py<0||px>=F.w||py>=F.h)return false;const i=(py*F.w+px)*4;return F.d[i+1]-F.d[i]>18};
const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,190),(()=>{const {texture,positionWorld,mx_fractal_noise_float:fn,vec2,vec3,float,clamp:tc,mix,smoothstep,uv,dot,normalMap}=TSL;
  const map=fieldTex(),m=new THREE.MeshStandardNodeMaterial({roughness:.95,metalness:0});const base=texture(map,uv()),w=positionWorld.xz;
  const isGrass=smoothstep(.02,.12,base.g.sub(base.r));/* Field map: more green than red = grass */
  const LUM=vec3(.2126,.7152,.0722),GR_MEAN=.118,DR_MEAN=.147;/* Mean texture luminance (linear) */
  /* Sample at two scales to reduce visible tiling */
  const gUV=w.div(2.6),gUV2=w.div(9.1).add(vec2(.37,.71)),dUV=w.div(3.2),dUV2=w.div(11.3).add(vec2(.13,.52));
  const gC=mix(texture(tex('grass_c',1),gUV),texture(tex('grass_c',1),gUV2),.35),dC=mix(texture(tex('dirt_c',1),dUV),texture(tex('dirt_c',1),dUV2),.35);
  const gK=dot(gC.rgb,LUM).div(GR_MEAN),dK=dot(dC.rgb,LUM).div(DR_MEAN);
  const big=fn(vec3(w.mul(.045),0),3,2,.5).mul(.12);
  const k=tc(mix(dK,gK,isGrass).add(big),.45,1.7);
  m.colorNode=base.rgb.mul(k).mul(mix(dC.rgb.div(vec3(.20,.14,.08)).mul(.25).add(.75),vec3(1),isGrass));
  const nG=texture(tex('grass_n'),gUV),nD=texture(tex('dirt_n'),dUV);
  m.normalNode=normalMap(mix(nD,nG,isGrass),vec2(mix(float(1.2),float(.8),isGrass)));
  const oG=texture(tex('grass_orm'),gUV),oD=texture(tex('dirt_orm'),dUV);const orm=mix(oD,oG,isGrass);
  m.roughnessNode=tc(orm.g.mul(.3).add(.75),.82,1);/* Grass and dirt must be very matte: too glossy and backlight turns them into a white sheet */m.aoNode=mix(float(1),orm.r,.6);return m})());ground.rotation.x=-Math.PI/2;ground.position.z=-55;ground.receiveShadow=true;scene.add(ground);
const outer=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:LC(0x1a2018),roughness:1}));outer.rotation.x=-Math.PI/2;outer.position.set(0,-.03,-55);scene.add(outer);
const AD_DARK_TEXT_LUM=.5;
const adC=document.createElement('canvas');adC.width=2048;adC.height=96;{const g=adC.getContext('2d');/* league boards plus one board per team (name on the team colour; dark text on a light colour) */
  const teamAd=T=>{const c=parseInt(T.css.slice(1),16),lum=(.2126*(c>>16)+.7152*(c>>8&255)+.0722*(c&255))/255;return[T.name,T.css,lum>AD_DARK_TEXT_LUM?'#06231f':'#ffffff']};
  const ads=[['雲端職棒','#1d4d2a','#f2c230'],...TEAMS.slice(0,2).map(teamAd),['CLOUD BASEBALL','#1d4d2a','#ffffff'],...TEAMS.slice(2,4).map(teamAd)];
  ads.forEach(([t,bg,fg],i)=>{const w=2048/ads.length;g.fillStyle=bg;g.fillRect(i*w,0,w,96);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';let fs=54;do{g.font=`700 ${fs}px "Noto Sans TC",sans-serif`;fs-=2}while(g.measureText(t).width>w-40&&fs>20);g.fillText(t,i*w+w/2,50);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(i*w+w-3,0,3,96)})}
const adTex=new THREE.CanvasTexture(adC);adTex.colorSpace=THREE.SRGBColorSpace;adTex.wrapS=THREE.RepeatWrapping;adTex.repeat.set(-4,1);
const fence=new THREE.Mesh(new THREE.CylinderGeometry(110,110,3,96,1,true,Math.PI*.75,Math.PI/2),new THREE.MeshStandardMaterial({map:adTex,side:THREE.DoubleSide,roughness:.7,emissive:0xffffff,emissiveMap:adTex,emissiveIntensity:.25}));fence.position.y=1.5;scene.add(fence);
{const bt=adTex.clone();bt.repeat.set(4,1);bt.needsUpdate=true;const fm=fence.material.clone();fm.map=bt;fm.emissiveMap=bt;fm.side=THREE.FrontSide;fence.material.side=THREE.BackSide;const fb=new THREE.Mesh(fence.geometry,fm);fb.position.y=1.5;scene.add(fb)}/* A second, unmirrored ad on the back of the wall, so text reads correctly from the outfield stands */
const fenceTop=new THREE.Mesh(new THREE.CylinderGeometry(110.05,110.05,.15,72,1,true,Math.PI*.75,Math.PI/2),new THREE.MeshBasicMaterial({color:0xf2c230,side:THREE.DoubleSide}));fenceTop.position.y=3;scene.add(fenceTop);
for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,18,8),new THREE.MeshBasicMaterial({color:0xf2c230}));p.position.set(s*110*Math.SQRT1_2,9,-110*Math.SQRT1_2);scene.add(p)}
/* Backstop: textured net (5 cm diamond mesh; mipmaps fade it to a thin veil at distance) plus top cable and posts */
const NET_W=40,NET_H=9,NET_Z=20,NET_CELL=.05,NET_OPACITY=.55;
const net=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.strokeStyle='rgba(220,226,235,.85)';g.lineWidth=3;
  g.beginPath();g.moveTo(0,0);g.lineTo(64,64);g.moveTo(64,0);g.lineTo(0,64);g.stroke();
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(NET_W/NET_CELL,NET_H/NET_CELL);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(NET_W,NET_H),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:NET_OPACITY,depthWrite:false,side:THREE.DoubleSide,fog:true}));
  m.position.set(0,NET_H/2,NET_Z);m.renderOrder=2;scene.add(m);
  const steel=new THREE.MeshStandardMaterial({color:LC(0x2a2f38),roughness:.6,metalness:.5});
  for(const x of [-NET_W/2,-NET_W/6,NET_W/6,NET_W/2]){const pl=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,NET_H,8),steel);pl.position.set(x,NET_H/2,NET_Z+.05);scene.add(pl)}
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,NET_W,6),steel);top.rotation.z=Math.PI/2;top.position.set(0,NET_H,NET_Z);scene.add(top);return m})();

/* stands + crowd */
const standMat=(()=>{const {triplanarTexture,texture,positionWorld,normalWorld,float,dot,vec3,clamp:tc,color}=TSL;const m=new THREE.MeshStandardNodeMaterial({roughness:.9});
  const t=triplanarTexture(texture(tex('concrete_c',1)),null,null,float(.35),positionWorld,normalWorld);m.colorNode=color(LC(0x2a3246)).mul(tc(dot(t.rgb,vec3(.2126,.7152,.0722)).div(.31),.6,1.4));
  const o=triplanarTexture(texture(tex('concrete_orm')),null,null,float(.35),positionWorld,normalWorld);m.roughnessNode=o.g;return m})(),seatMat=new THREE.MeshStandardMaterial({color:LC(0x16365c),roughness:.6});const fans=[];
/* #33 scale, real stadium figures: seat width ~.5 m (was .82), row depth .9 m and rise .55 m (~31 deg rake, a steep lower bowl).
   Foul-line stands 16 m off the line and the backstop 24 m behind the plate are already in the real range (MLB backstop >= 18 m). */
const CROWD_EMPTY=.1,/* share of seats left empty */SEAT_W=.55,ROW_D=.9,ROW_RISE=.55,FRONT_H=1,BACK_WALL=4,RAIL_H=1.1;
function stand(px,pz,rotY,len,rows,side,roof,base=0){
  const g=new THREE.Group();g.position.set(px,0,pz);g.rotation.y=rotY;scene.add(g);
  for(let r=0;r<rows;r++){const h=base+FRONT_H+r*ROW_RISE,d=r*ROW_D+ROW_D/2;const b=new THREE.Mesh(new THREE.BoxGeometry(len,h,ROW_D),standMat);b.position.set(0,h/2,d);g.add(b);
    for(let x=-len/2+.4;x<len/2-.3;x+=SEAT_W)fans.push({g,x,y:h,z:d,side,empty:Math.random()<CROWD_EMPTY})}
  const top=base+FRONT_H+rows*ROW_RISE,w=new THREE.Mesh(new THREE.BoxGeometry(len,top+BACK_WALL,1),standMat);w.position.set(0,(top+BACK_WALL)/2,rows*ROW_D+.5);g.add(w);
  const rail=new THREE.Mesh(new THREE.BoxGeometry(len,RAIL_H,.25),seatMat);rail.position.set(0,base+RAIL_H/2,-.1);g.add(rail);
  if(roof){const rf=new THREE.Mesh(new THREE.BoxGeometry(len+2,.5,rows*.9+6),standMat);rf.position.set(0,top+8,rows*.45-2);rf.rotation.x=-.08;g.add(rf);
    const lip=new THREE.Mesh(new THREE.BoxGeometry(len+2,.25,.25),new THREE.MeshBasicMaterial({color:0xfff3d6}));lip.position.set(0,top+7.4,-4.9);g.add(lip)}
  g.updateMatrixWorld(true);
}
const Q=Math.PI/4;
stand(0,24,0,48,16,2,true);stand(46.7,-24.1,Q,72,14,1,true);stand(-46.7,-24.1,-Q,72,14,0,true);
/* Outfield bleachers start right behind the 3 m fence (110 m) with the front row above its top, as in a real park; they used to sit 6 m back
   at ground level, so the first rows peeked over the wall and made it look small. */
const OF_R=111.5,OF_BASE=2.4,OF_ROWS=10,OF_SEAT_ROW=5;
for(let a=-40;a<=40;a+=10){const t=a*Math.PI/180;stand(Math.sin(t)*OF_R,-Math.cos(t)*OF_R,Math.atan2(Math.sin(t),-Math.cos(t)),20,OF_ROWS,a<0?0:a>0?1:2,false,OF_BASE)}
const SEATS=[{x:0,y:5.4,z:31.6,tx:0,ty:1,tz:-30,fov:55},{x:36.7,y:4.3,z:-5.8,tx:-2,ty:1,tz:-26,fov:55},
  {x:0,y:OF_BASE+FRONT_H+OF_SEAT_ROW*ROW_RISE+.55,z:-(OF_R+OF_SEAT_ROW*ROW_D+ROW_D/2+.12),tx:0,ty:1,tz:0,fov:50},{x:1.6,y:16,z:-112,tx:0,ty:1.0,tz:0,fov:5.5,cam:true,auto:true},{x:0,y:7,z:14,tx:0,ty:1.3,tz:-9,fov:45,cam:true,follow:true},{x:0,y:20,z:20,tx:0,ty:0,tz:-32,fov:55,cam:true},{director:true}];
const FIELD_SPOTS_XZ={P:spotXZ(...FIELD_SPOTS.P)};
const FOLLOW_T=new THREE.Vector3(0,1.3,-9),_fw=new THREE.Vector3();
const v3=new THREE.Vector3(),dummy=new THREE.Object3D(),col=new THREE.Color();
/* Crowd (#33): seated people from a few low-poly capsules, instanced. Draw calls: seats, seated bodies, arms-up bodies, heads.
   Body = shirt (per-instance 'shirt' attribute) + trousers (vertex colour CROWD_PANTS). Not instanceColor: node materials multiply it into every
   vertex, so trousers came out shirt-tinted. The per-vertex 'tint' mask (1 = shirt part) picks where the shirt colour applies. A CROWD_CHEER_SHARE of fans also
   have an arms-up body that replaces the seated one while they bounce above CROWD_CHEER_ON m. Seats and bodies face along the row; the body turns
   toward home plate by at most CROWD_YAW_MAX, the head turns the rest (up to CROWD_HEAD_MAX) and sways. Real proportions: seat .44 m, head top ~1.35 m */
const CROWD_HIP_BACK=.12,CROWD_YAW_MAX=.35,CROWD_HEAD_MAX=.6,CROWD_YAW_JIT=.15,CROWD_LEAN=.07,CROWD_CHEER_SHARE=.35,CROWD_CHEER_ON=.12,CROWD_TEAM_SHARE=.35,
  CROWD_SCALE_MIN=.92,CROWD_SCALE_SPAN=.16,CROWD_SWAY=.25,CROWD_PANTS=[.07,.08,.12],CROWD_WHITE=[1,1,1],
  CROWD_SHIRTS=[0xf2f2f2,0x2b2b2e,0x8d929a,0x1f3a5f,0x3d5a80,0xb23a3a,0x2f6b4a,0xd8c9a3,0xe0b030,0x5a4a8a];
function crowdGeo(parts){const gs=parts.map(([g,c])=>[g.index?g.toNonIndexed():g,c]),n=gs.reduce((a,[q])=>a+q.attributes.position.count,0);
  const P=new Float32Array(n*3),N=new Float32Array(n*3),C=new Float32Array(n*3),M=new Float32Array(n);let o=0;
  for(const [q,c] of gs){const k=q.attributes.position.count;P.set(q.attributes.position.array,o*3);N.set(q.attributes.normal.array,o*3);for(let i=0;i<k;i++)C.set(c,(o+i)*3);if(c===CROWD_WHITE)M.fill(1,o,o+k);o+=k}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(P,3));g.setAttribute('normal',new THREE.BufferAttribute(N,3));g.setAttribute('color',new THREE.BufferAttribute(C,3));
  g.setAttribute('tint',new THREE.BufferAttribute(M,1));return g}
const cLimb=(a,b,r)=>{const d=new THREE.Vector3(b[0]-a[0],b[1]-a[1],b[2]-a[2]),L=d.length(),g=new THREE.CylinderGeometry(r,r,L+r,5,1,true);/* open 5-sided prism, 10 triangles */
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate((a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2);return g};
const cBox=(w,h,d,x,y,z)=>new THREE.BoxGeometry(w,h,d).translate(x,y,z);
/* Local frame: floor of the tread at y=0, hip above the origin, +z = facing the field */
function crowdBody(up){const W=CROWD_WHITE,T=CROWD_PANTS,P=[[new THREE.CylinderGeometry(.17,.14,.58,6).scale(1.25,1,.8).translate(0,.81,-.04),W],[new THREE.CylinderGeometry(.045,.045,.12,5,1,true).translate(0,1.12,-.03),W]];
  for(const s of [-1,1]){P.push([cLimb([s*.1,.53,-.02],[s*.11,.54,.4],.075),T],[cLimb([s*.11,.5,.42],[s*.12,.04,.5],.06),T]);
    if(up)P.push([cLimb([s*.21,1.02,-.04],[s*.3,1.3,0],.055),W],[cLimb([s*.3,1.3,0],[s*.31,1.6,.08],.05),W]);
    else P.push([cLimb([s*.21,1.02,-.04],[s*.25,.77,.1],.055),W],[cLimb([s*.25,.77,.1],[s*.15,.6,.36],.05),W])}
  return crowdGeo(P)}
const seatGeo=crowdGeo([[cBox(.46,.05,.42,0,.42,-.02),CROWD_WHITE],[cBox(.46,.42,.04,0,.64,-.24),CROWD_WHITE]]);
for(const f of fans){v3.set(f.x,f.y,f.z+CROWD_HIP_BACK).applyMatrix4(f.g.matrixWorld);f.wx=v3.x;f.wy=v3.y;f.wz=v3.z;f.sy=f.g.rotation.y+Math.PI}
for(let i=fans.length-1;i>=0;i--)if(SEATS.some(s=>!s.cam&&Math.hypot(fans[i].wx-s.x,fans[i].wz-s.z)<2.2))fans.splice(i,1);
const wrapPI=a=>Math.atan2(Math.sin(a),Math.cos(a)),people=fans.filter(f=>!f.empty);
for(let i=people.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[people[i],people[j]]=[people[j],people[i]]}/* random order: a lower quality tier draws a prefix, i.e. a random subset */
people.forEach((f,i)=>f.pi=i);const cheerers=people.filter(()=>Math.random()<CROWD_CHEER_SHARE);
const seats=new THREE.InstancedMesh(seatGeo,new THREE.MeshStandardMaterial({color:LC(0x1d4f8f),roughness:.5}),fans.length);
const crowdMat=(()=>{const {attribute,mix,vec3}=TSL;const m=new THREE.MeshStandardNodeMaterial({roughness:.85});
  m.colorNode=attribute('color','vec3').mul(mix(vec3(1),attribute('shirt','vec3'),attribute('tint','float')));return m})();
const crowdShirts=(geo,n)=>{const a=new THREE.InstancedBufferAttribute(new Float32Array(n*3),3);geo.setAttribute('shirt',a);return a};
const crowd=new THREE.InstancedMesh(crowdBody(false),crowdMat,people.length),crowdUp=new THREE.InstancedMesh(crowdBody(true),crowdMat,cheerers.length);
const shirtA=crowdShirts(crowd.geometry,people.length),shirtUpA=crowdShirts(crowdUp.geometry,cheerers.length);
const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.11,6,4).scale(.9,1.05,.95).translate(0,1.25,0),new THREE.MeshStandardMaterial({roughness:.7}),people.length);
fans.forEach((f,i)=>{dummy.position.set(f.wx,f.wy,f.wz);dummy.rotation.set(0,f.sy,0);dummy.scale.set(1,1,1);dummy.updateMatrix();seats.setMatrixAt(i,dummy.matrix)});
people.forEach((f,i)=>{f.ph=Math.random()*6.28;const home=Math.atan2(-f.wx,-f.wz),d=wrapPI(home-f.sy);
  f.ry=f.sy+clamp(d,-CROWD_YAW_MAX,CROWD_YAW_MAX)+(Math.random()-.5)*2*CROWD_YAW_JIT;f.hy=clamp(wrapPI(home-f.ry),-CROWD_HEAD_MAX,CROWD_HEAD_MAX);
  f.rx=(Math.random()-.5)*2*CROWD_LEAN;f.k=CROWD_SCALE_MIN+Math.random()*CROWD_SCALE_SPAN;
  const tm=f.side===2?(Math.random()<.5?0:1):(Math.random()<.85?f.side:1-f.side);f.team=tm;
  col.setHex(Math.random()<CROWD_TEAM_SHARE?TEAMS[tm].color:CROWD_SHIRTS[(Math.random()*CROWD_SHIRTS.length)|0]).multiplyScalar(.7+Math.random()*.35);shirtA.setXYZ(i,col.r,col.g,col.b);f.shirt=col.getHex();
  col.setHex([0xc99572,0xe0b48f,0xa8775a,0xd9a983,0x8a5a3c][i%5]);if(Math.random()<.35)col.setHex(Math.random()<.5?0x1a1a1e:0x3a2a1c);heads.setColorAt(i,col)});
cheerers.forEach((f,i)=>{f.ui=i;col.setHex(f.shirt);shirtUpA.setXYZ(i,col.r,col.g,col.b)});
seats.instanceMatrix.needsUpdate=true;
scene.add(seats,crowd,crowdUp,heads);
const HIDE=new THREE.Matrix4().makeScale(0,0,0);
/* Share of fans drawn per quality tier (0 desktop .. 3 lowest); the rest become empty seats. Cheer bodies follow people order, so a prefix too. */
const CROWD_DENSITY=[1,.6,.45,.35];let crowdN=people.length;
function setCrowdDensity(k){crowdN=Math.round(people.length*k);crowd.count=heads.count=crowdN;let c=0;while(c<cheerers.length&&cheerers[c].pi<crowdN)c++;crowdUp.count=c}
function updateCrowd(now,ex,batTeam,live){
  const beat=(now/1000)*BPM/60*2,ts=now/1000;
  for(let i=0;i<crowdN;i++){const f=people[i];let up=Math.max(0,Math.sin(now*.008+f.ph))*ex*.5;
    if(live&&f.team===batTeam)up+=Math.max(0,Math.sin(beat*Math.PI))*.1*(i%2?1:.6);
    dummy.position.set(f.wx,f.wy+up,f.wz);dummy.rotation.set(f.rx,f.ry,0,'YXZ');dummy.scale.setScalar(f.k);dummy.updateMatrix();
    const cheer=f.ui!==undefined&&up>CROWD_CHEER_ON;crowd.setMatrixAt(i,cheer?HIDE:dummy.matrix);if(f.ui!==undefined)crowdUp.setMatrixAt(f.ui,cheer?dummy.matrix:HIDE);
    dummy.rotation.set(f.rx,f.ry+f.hy+Math.sin(ts*.3+f.ph)*CROWD_SWAY,0,'YXZ');dummy.updateMatrix();heads.setMatrixAt(i,dummy.matrix)}
  crowd.instanceMatrix.needsUpdate=true;crowdUp.instanceMatrix.needsUpdate=true;heads.instanceMatrix.needsUpdate=true;
}
/* light towers + sky */
const TOWER_I=.16*Math.PI,BEAM_K=.025;/* Keep only a hint of light beam, so the camera passing through it does not white out */
const lampMat=new THREE.MeshBasicMaterial({color:new THREE.Color(5,4.8,4.4),toneMapped:false}),mast=new THREE.MeshStandardMaterial({color:LC(0x3a4256),roughness:.7,metalness:.3});
const glowC=document.createElement('canvas');glowC.width=glowC.height=128;{const g=glowC.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,248,230,1)');gr.addColorStop(.18,'rgba(255,240,210,.55)');gr.addColorStop(1,'rgba(255,230,190,0)');g.fillStyle=gr;g.fillRect(0,0,128,128)}
const glowMat=new THREE.SpriteMaterial({map:new THREE.CanvasTexture(glowC),blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false,toneMapped:false});
const beamMat=(()=>{const {uv,pow,abs,dot,normalView,positionViewDirection,vec4,color,positionView,length,smoothstep}=TSL;const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
  const e=pow(abs(dot(normalView,positionViewDirection)),2);m.colorNode=vec4(color(LC(0xfff0d0)).mul(pow(uv().y,2.2)).mul(e).mul(BEAM_K).mul(smoothstep(45,130,length(positionView))),1);return m})();/* Fade out near the camera, so being inside a beam does not white out */
for(const [x,z] of [[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.5,.8,46,8),mast);m.position.set(x,23,z);scene.add(m);
  const l=new THREE.Mesh(new THREE.BoxGeometry(9,4,.6),lampMat);l.position.set(x,46,z);l.lookAt(0,0,-45);scene.add(l);
  const gl=new THREE.Sprite(glowMat);gl.position.set(x,46,z);gl.scale.set(30,30,1);scene.add(gl);
  const lamp=new THREE.Vector3(x,46,z),tgt=new THREE.Vector3(x*.15,0,-40+(z+40)*.15),dir=lamp.clone().sub(tgt),L=dir.length();
  const beam=new THREE.Mesh(new THREE.ConeGeometry(L*.32,L,32,1,true),beamMat);beam.position.copy(lamp.clone().add(tgt).multiplyScalar(.5));beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());scene.add(beam);
  /* Light-tower spots: lit areas and dark corners (no shadows, for performance; the key light still casts the main shadow) */
  const spot=new THREE.SpotLight(LC(0xfff2dc),TOWER_I,0,.42,.75,0);spot.position.copy(lamp);spot.target.position.copy(tgt);scene.add(spot,spot.target)}
const sg=new THREE.BufferGeometry(),sp=[];for(let i=0;i<600;i++){const a=Math.random()*6.28,e=.15+Math.random()*1.2;sp.push(Math.cos(a)*Math.cos(e)*420,Math.sin(e)*420,Math.sin(a)*Math.cos(e)*420)}
sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));scene.add(new THREE.Points(sg,new THREE.PointsMaterial({color:0xaab8d8,size:1.1,fog:false,sizeAttenuation:true})));
/* Bugs under the lights: a cloud of small dots in front of each tower, flying around (pure decoration, unrelated to the game) */
const BUG_PER=70,BUG_R=5,BUG_SIZE=.18,LAMPS=[[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]];
const bugs=(()=>{const n=LAMPS.length*BUG_PER,pos=new Float32Array(n*3),seed=[];let r=7;const rnd=()=>(r=(r*16807)%2147483647)/2147483647;
  for(let i=0;i<n;i++){const [x,z]=LAMPS[Math.floor(i/BUG_PER)],to=new THREE.Vector3(-x,-46,-45-z).normalize();seed.push({c:[x+to.x*4,46+to.y*4,z+to.z*4],a:rnd()*6.28,b:rnd()*6.28,w1:.6+rnd()*1.4,w2:.5+rnd()*1.2,r:.5+rnd()*BUG_R,h:rnd()})}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({color:new THREE.Color(3,2.8,2.2),size:BUG_SIZE,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
  pts.frustumCulled=false;scene.add(pts);return{pts,pos,seed}})();
function updateBugs(t){const {pos,seed}=bugs;for(let i=0;i<seed.length;i++){const q=seed[i],a=q.a+t*q.w1,b=q.b+t*q.w2;
  pos[i*3]=q.c[0]+Math.cos(a)*q.r+Math.sin(t*7+i)*.15;pos[i*3+1]=q.c[1]+Math.sin(b)*q.r*.6;pos[i*3+2]=q.c[2]+Math.sin(a)*q.r*Math.cos(b)}
  bugs.pts.geometry.attributes.position.needsUpdate=true}
/* Close-up grass blades: blades only where the camera looks (closer than BLADE_SHOW m), placed by a world-grid hash so they do not jitter as the camera moves. Grass areas of the field map only */
const BLADE_N=16000,BLADE_R=6,BLADE_SHOW=15,BLADE_CELL=.08,BLADE_SNAP=1;
const blades=(()=>{const geo=new THREE.BufferGeometry(),w=.006;geo.setAttribute('position',new THREE.Float32BufferAttribute([-w,0,0,w,0,0,0,1,.15,w,0,0,-w,0,0,0,1,.15],3));geo.setAttribute('normal',new THREE.Float32BufferAttribute([0,1,0,0,1,0,0,1,0,0,1,0,0,1,0,0,1,0],3));/* Two faces, both normals pointing up (with DoubleSide the back normal flips down and goes black) *//* Normals point up: lit like the ground, so individual blades do not turn black */
  const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.85});
  const im=new THREE.InstancedMesh(geo,m,BLADE_N);im.count=0;im.frustumCulled=false;im.receiveShadow=true;im.instanceColor=new THREE.InstancedBufferAttribute(new Float32Array(BLADE_N*3),3);scene.add(im);return{im,key:''}})();
const _bm=new THREE.Matrix4(),_bqq=new THREE.Quaternion(),_bs=new THREE.Vector3(),_bp=new THREE.Vector3(),_be=new THREE.Euler(),_bc=new THREE.Color(),_ray=new THREE.Vector3();
const hash2=(x,z,k)=>{let h=Math.imul(x*73856093^z*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296};
function updateBlades(){const cp=camera.getWorldPosition(_cw),dir=camera.getWorldDirection(_ray),im=blades.im;
  if(dir.y>-.02){im.visible=false;return}const t=-cp.y/dir.y,lx=cp.x+dir.x*t,lz=cp.z+dir.z*t;
  if(t>BLADE_SHOW){im.visible=false;return}im.visible=true;
  const cx=Math.round(lx/BLADE_SNAP),cz=Math.round(lz/BLADE_SNAP),key=cx+','+cz;if(key===blades.key)return;blades.key=key;
  let n=0;const g0=Math.floor((cx*BLADE_SNAP-BLADE_R)/BLADE_CELL),g1=Math.ceil((cx*BLADE_SNAP+BLADE_R)/BLADE_CELL),h0=Math.floor((cz*BLADE_SNAP-BLADE_R)/BLADE_CELL),h1=Math.ceil((cz*BLADE_SNAP+BLADE_R)/BLADE_CELL);
  for(let i=g0;i<=g1&&n<BLADE_N;i++)for(let j=h0;j<=h1&&n<BLADE_N;j++)for(let k=0;k<2&&n<BLADE_N;k++){
    const x=(i+hash2(i,j,k))*BLADE_CELL,z=(j+hash2(j,i,k+7))*BLADE_CELL,d=Math.hypot(x-cx*BLADE_SNAP,z-cz*BLADE_SNAP);if(d>BLADE_R||!isGrassAt(x,z))continue;
    const fade=1-sat01((d-BLADE_R*.5)/(BLADE_R*.5)),hgt=(.02+hash2(i,j,k+3)*.03)*fade;if(hgt<.006)continue;
    _be.set((hash2(i,j,k+5)-.5)*.7,hash2(i,j,k+9)*6.28,(hash2(i,j,k+11)-.5)*.5);_bqq.setFromEuler(_be);_bs.set(.6+hash2(j,i,k)*.6,hgt,1);_bp.set(x,0,z);
    im.setMatrixAt(n,_bm.compose(_bp,_bqq,_bs));const v=.8+hash2(i,j,k+13)*.45;im.setColorAt(n,_bc.setRGB(.085*v,.26*v,.055*v));n++}
  im.count=n;im.instanceMatrix.needsUpdate=true;im.instanceColor.needsUpdate=true}

/* ---------- Post-processing: AO (contact shadows) + bloom + vignette + FXAA; lightweight version for the WebGL fallback or phones ---------- */
const HQ=(window.FORCE_HQ||!!(renderer.backend&&renderer.backend.isWebGPUBackend))&&!/Mobi|Android/i.test(navigator.userAgent);
let PP=null;
function setupPost(){try{const {pass,mrt,output,normalView,screenUV,length,smoothstep,mix,float,renderOutput,vec4}=TSL;
  const pp=new THREE.RenderPipeline(renderer),sp=pass(scene,camera);let c;
  if(HQ){sp.setMRT(mrt({output,normal:normalView}));const aoN=FX.ao(sp.getTextureNode('depth'),sp.getTextureNode('normal'),camera);aoN.resolutionScale=.5;aoN.radius.value=.6;aoN.distanceFallOff.value=1;
    c=sp.getTextureNode('output');c=vec4(c.rgb.mul(mix(float(.35),float(1),aoN.getTextureNode().sample(screenUV).r)),c.a)}
  else c=sp.getTextureNode();
  c=c.add(FX.bloom(c,.3,.3,1.6));
  const d=length(screenUV.sub(.5));c=vec4(c.rgb.mul(mix(float(1),float(.7),smoothstep(.3,.85,d))),1);
  pp.outputColorTransform=false;pp.outputNode=FX.fxaa(renderOutput(c));pp.scenePass=sp;return pp}catch(e){console.error('post',e);return null}}
let gfxLow=false;try{gfxLow=localStorage.getItem('zu_gfx')==='low'}catch(e){}
PP=gfxLow?null:setupPost();
$('gfx').textContent=gfxLow?'畫質：低':'畫質：高';
$('gfx').onclick=()=>{gfxLow=!gfxLow;try{localStorage.setItem('zu_gfx',gfxLow?'low':'high')}catch(e){}PP=gfxLow?null:(PP||setupPost());if(typeof setTier==='function'){setTier(gfxLow?2:(IS_MOBILE?1:0));tierT0=performance.now()}$('gfx').textContent=gfxLow?'畫質：低':'畫質：高';note(gfxLow?'畫質低：關掉後製，比較順':'畫質高：開後製光影')};
{const on=(()=>{try{return localStorage.getItem('zu_gl')==='1'}catch(e){return false}})();$('compat').setAttribute('aria-pressed',on);
 $('compat').onclick=()=>{try{localStorage.setItem('zu_gl',on?'0':'1')}catch(e){}note(on?'關閉相容模式，重新載入…':'改用相容模式（WebGL），重新載入…');setTimeout(()=>location.reload(),800)}}
/* ---------- Team logos: the owner's own team marks, assets/logos/<team id>_<px>.webp (see assets/SOURCES.md), found by team id.
   Replacing a logo is replacing its file (assets/tools/make_logos.py). A team without a file shows no logo, nothing breaks ---------- */
const LOGO_DIR='assets/logos/',LOGO_PX=128,logoSrc=id=>`${LOGO_DIR}${id}_${LOGO_PX}.webp`;
/* HTML for team i's logo: px wide, or filling its box when px is omitted */
const logoOf=(i,px)=>{const T=TEAMS[i];if(!T||!T.id)return'';return`<img src="${logoSrc(T.id)}" alt="" draggable="false" ${px?`width="${px}" height="${px}"`:'style="width:100%;height:100%;display:block;object-fit:contain"'} onerror="this.remove()">`};
const INTRO_LOGO_PX=84;$('mas').innerHTML=logoOf(0,INTRO_LOGO_PX)+logoOf(1,INTRO_LOGO_PX);
const logoImgs={};for(const T of TEAMS){if(!T.id)continue;const im=new Image();im.onload=()=>{sbKey=''};im.src=logoSrc(T.id);logoImgs[T.id]=im}
/* outfield scoreboard (raised with the outfield bleachers so their back wall does not cover its bottom edge) */
const SB_Y=18;
const sbC=document.createElement('canvas');sbC.width=1024;sbC.height=400;const sbTex=new THREE.CanvasTexture(sbC);sbTex.colorSpace=THREE.SRGBColorSpace;
const sbMesh=new THREE.Mesh(new THREE.PlaneGeometry(26,10),new THREE.MeshBasicMaterial({map:sbTex,toneMapped:false}));
{const t=-28*Math.PI/180;sbMesh.position.set(Math.sin(t)*128,SB_Y,-Math.cos(t)*128);sbMesh.lookAt(0,10,0);scene.add(sbMesh);
 const back=new THREE.Mesh(new THREE.BoxGeometry(27,11,.6),mast);back.position.copy(sbMesh.position);back.quaternion.copy(sbMesh.quaternion);back.translateZ(-.35);scene.add(back);
 const leg=new THREE.Mesh(new THREE.BoxGeometry(2,SB_Y-5,1),mast);leg.position.set(sbMesh.position.x,(SB_Y-5)/2,sbMesh.position.z);scene.add(leg)}
let sbKey='';
function drawBoard(s,txt){const k=s.sc.join()+txt;if(k===sbKey)return;sbKey=k;const g=sbC.getContext('2d');
  g.fillStyle='#05070d';g.fillRect(0,0,1024,400);g.font='600 64px "Noto Sans TC",sans-serif';g.textBaseline='middle';
  TEAMS.slice(0,2).forEach((T,i)=>{g.fillStyle=T.css;g.fillRect(40,70+i*120,18,80);const lg=logoImgs[T.id];if(lg&&lg.complete&&lg.naturalWidth)g.drawImage(lg,70,64+i*120,92,92);g.fillStyle='#fff';g.fillText(T.name,178,110+i*120);g.font='700 110px "Barlow Condensed",sans-serif';g.textAlign='right';g.fillStyle='#ffe28a';g.fillText(s.sc[i],980,112+i*120);g.textAlign='left';g.font='600 64px "Noto Sans TC",sans-serif'});
  g.fillStyle='#9aa6bd';g.font='500 44px "Noto Sans TC",sans-serif';g.fillText(txt,80,350);sbTex.needsUpdate=true}

/* ---------- figures ---------- */
const GEO={torso:new THREE.CylinderGeometry(.24,.19,.62,12),hips:new THREE.CylinderGeometry(.2,.22,.28,12),head:new THREE.SphereGeometry(.12,16,12),cap:new THREE.SphereGeometry(.13,16,8,0,Math.PI*2,0,Math.PI/2),brim:new THREE.BoxGeometry(.2,.02,.14),
  leg:new THREE.CylinderGeometry(.09,.065,.84,10),arm:new THREE.CylinderGeometry(.062,.05,.6,10),shoe:new THREE.BoxGeometry(.12,.08,.26),glove:new THREE.SphereGeometry(.09,10,8),neck:new THREE.CylinderGeometry(.06,.07,.1,8),shadow:new THREE.CircleGeometry(.45,16)};
GEO.torso.scale(1,1,.62);GEO.hips.scale(1,1,.7);
const SM=(h,r=.6)=>new THREE.MeshStandardMaterial({color:LC(h),roughness:r});
const skin=SM(0xc99572,.7),pants=SM(0xeeeeee,.75),dark=SM(0x1a1a1e,.5),leather=SM(0x8a5a2b,.6),shadowMat=new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.35,depthWrite:false});
const matDef=SM(0xffffff,.55),matOff=SM(0xffffff,.55),matUmp=SM(0x111318,.7);
{const n=tex('fabric_n'),r=tex('fabric_orm');n.repeat.set(5,5);r.repeat.set(5,5);/* Fabric texture is only used for jerseys and pants, so set the repeat directly */
 for(const m of [matDef,matOff,matUmp,pants]){m.normalMap=n;m.normalScale.set(.6,.6);m.roughnessMap=r;m.roughness=1;/* Roughness is in the G channel */}}
{const c=tex('leather_c',1),n=tex('leather_n');leather.map=c;leather.color.setHex(0xb08060);leather.normalMap=n;leather.roughness=.5}
/* jersey numbers: one shared material per number, drawn once on a canvas */
const NUM_GEO=new THREE.PlaneGeometry(.26,.26),NUM_Y=1.3,NUM_Z=-.228,NUM_PX=128,NUM_FONT_PX=92,NUM_STROKE_PX=10,numMats=new Map();
function numMat(n){let m=numMats.get(n);if(m)return m;const c=document.createElement('canvas');c.width=c.height=NUM_PX;const g=c.getContext('2d');
  g.font=`bold ${NUM_FONT_PX}px 'Barlow Condensed','Arial Narrow',sans-serif`;g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';g.lineWidth=NUM_STROKE_PX;g.strokeStyle='#14161c';g.fillStyle='#fff';
  g.strokeText(String(n),NUM_PX/2,NUM_PX/2+4);g.fillText(String(n),NUM_PX/2,NUM_PX/2+4);const t=new THREE.CanvasTexture(c);
  m=new THREE.MeshBasicMaterial({map:t,transparent:true,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});numMats.set(n,m);return m}
function setNum(f,n){if(f.numN===n)return;f.numN=n;f.numMesh.visible=n!=null;if(n!=null)f.numMesh.material=numMat(n)}
function figureBlocky(m,pm=pants,glove=false){
  const g=new THREE.Group(),add=(geo,mat,x,y)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,0);g.add(o);return o};
  add(GEO.torso,m,0,1.27);add(GEO.hips,pm,0,.95);add(GEO.neck,skin,0,1.6);add(GEO.head,skin,0,1.73);add(GEO.cap,m,0,1.76);const br=add(GEO.brim,m,0,1.77);br.position.z=.15;
  const limb=(geo,mat,x,y,oy,extra)=>{const p=new THREE.Group();p.position.set(x,y,0);const o=new THREE.Mesh(geo,mat);o.position.y=oy;p.add(o);if(extra){const e=new THREE.Mesh(extra[0],extra[1]);e.position.set(0,extra[2],extra[3]);p.add(e)}g.add(p);return p};
  const legs=[limb(GEO.leg,pm,-.11,.86,-.42,[GEO.shoe,dark,-.86,.05]),limb(GEO.leg,pm,.11,.86,-.42,[GEO.shoe,dark,-.86,.05])],arms=[limb(GEO.arm,m,-.3,1.52,-.3,glove?[GEO.glove,leather,-.62,0]:[GEO.glove,skin,-.6,0]),limb(GEO.arm,m,.3,1.52,-.3,[GEO.glove,skin,-.6,0])];
  arms[0].children[1].scale.setScalar(glove?1:.55);arms[1].children[1].scale.setScalar(.55);
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});
  const numMesh=new THREE.Mesh(NUM_GEO,numMats.get(0)||numMat(0));numMesh.position.set(0,NUM_Y,NUM_Z);numMesh.rotation.y=Math.PI;numMesh.visible=false;g.add(numMesh);scene.add(g);
  const f={g,legs,arms,numMesh,ph:0,px:0,pz:0,k:1,blocky:true,setThrows(){},setBuild(){},handWorld(i,out=new THREE.Vector3()){g.updateMatrixWorld(true);return arms[i].children[1].getWorldPosition(out)}};
  const [torso,hips,neck,head,cap,brim,l0,l1,a0,a1,nm]=g.children.slice(),up=new THREE.Group();up.position.y=.95;g.add(up);
  for(const o of [torso,a0,a1,nm]){up.add(o);o.position.y-=.95}
  const hg=new THREE.Group();hg.position.y=.7;up.add(hg);for(const o of [neck,head,cap,brim]){hg.add(o);o.position.y-=1.65}
  hips.scale.set(1.08,1,1.08);f.rig={up,hips,hg,l0,l1,a0,a1};return f}
/* Skinned players: players.js (MakeHuman CC0 bodies + 16 bones) with the same proxy-joint interface as the block figures, so the old keyframes still work.
   role:'batter' skips the inner mirror; everyone else defaults to right-handed (inner mirror, arms[1] is the right hand). On a substitution call setBuild(build, height), and setThrows for pitchers */
function figure(m,pm=pants,glove=false,o={}){
  if(!window.PL)return figureBlocky(m,pm,glove);
  const f=PL.makePlayer({jersey:m,pants:pm,sock:m,skin,glove,head:o.head||'cap',role:o.role,throws:'R',parent:scene});
  if(f.glove)f.glove.traverse(x=>{if(x.isMesh)x.material=leather});
  return f}
const BODY_OF=(team,name)=>{const R=ROSTERS[team];return R.bat.find(x=>x.name===name)||R.pit.find(x=>x.name===name)};
/* Body-type weights are snapped to .25 steps so the geometry cache is not one entry per player */
const qBody=b=>{const o={};for(const k in b){const v=Math.round(b[k]*4)/4;if(v)o[k]=v}return o};
/* Prewarm: before first pitch, build every player's body geometry plus cap/helmet for both teams (one at a time while idle), so a substitution does not stutter mid-game */
function prewarmBodies(){if(!window.PL)return;const dummies=[PL.makePlayer({head:'cap'}),PL.makePlayer({head:'helmet',role:'batter'})],list=[];
  for(const t of [0,1])for(const p of [...ROSTERS[t].bat,...ROSTERS[t].pit])if(p.body)list.push(p);
  const step=()=>{const t0=performance.now();while(list.length&&performance.now()-t0<8){const p=list.shift();for(const d of dummies)d.setBuild(qBody(p.body),p.ht)}if(list.length)(window.requestIdleCallback||setTimeout)(step)};step()}
function dress(f,p){if(!p){f.setBuild('normal');return}f.setBuild(p.body?qBody(p.body):'normal',p.ht)}
const fielders={};for(const k of FIELDER_KEYS){const f=figure(matDef,pants,true);f.home=spotXZ(...FIELD_SPOTS[k]);fielders[k]=f}
fielders.C.home=[0,1.75];
const ump=figure(matUmp,matUmp,false);ump.g.position.set(.3,0,2.6);ump.g.rotation.y=Math.PI;ump.g.scale.y=.95;
const batter=figure(matOff,pants,false,{role:'batter',head:'helmet'});
/* batter rig: hips/legs stay put, upper body (torso+arms+head) twists, arms aim at the bat grip */
/* split a figure into hips/legs + a twistable upper body (torso, arms, number, head group) */
function rigUpper(f){return f.rig}
/* Face mask (catcher, plate umpire): attached to the head socket, dark steel bars plus padding. The catcher also wears a helmet */
function addMask(f){if(!f.sockets||!f.sockets.head)return;const g=new THREE.Group(),steel=SM(0x1d2026,.45),pad=SM(0x2b2b30,.8),bar=(w,y,z,rx)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,.012,.012),steel);m.position.set(0,y,z);m.rotation.x=rx||0;g.add(m)};
  bar(.19,.01,.115);bar(.2,-.045,.122);bar(.17,-.1,.118);bar(.12,-.15,.1,-.4);
  for(const x of [-.095,-.03,.03,.095]){const m=new THREE.Mesh(new THREE.BoxGeometry(.012,.19,.012),steel);m.position.set(x,-.065,.112-Math.abs(x)*.25);m.rotation.y=-x*2.2;g.add(m)}
  for(const s of [-1,1]){const m=new THREE.Mesh(new THREE.BoxGeometry(.03,.17,.06),pad);m.position.set(s*.105,-.06,.075);g.add(m)}
  g.traverse(o=>{if(o.isMesh)o.castShadow=true});f.sockets.head.add(g);f.mask=g;return g}
if(window.PL){fielders.C.setHead('helmet');addMask(fielders.C);addMask(ump)}
const BR=rigUpper(batter),CR=rigUpper(fielders.C),UR=rigUpper(ump),PR=rigUpper(fielders.P);
const batPivot=new THREE.Group();BR.up.add(batPivot);
const bat=window.PL?PL.makeBat(0xc9a06a):new THREE.Mesh(new THREE.CylinderGeometry(.04,.022,.85,8),SM(0xc9a06a,.45));if(!window.PL)bat.position.y=.42;bat.castShadow=true;batPivot.add(bat);
/* batting keyframes: S stance, L load (stride + hands back), C contact, F follow-through. Frame: batter-local, +z faces the plate, +x faces the pitcher */
const BK={yaw:[-.15,-.45,.75,1.7],lean:[.12,.16,.2,.1],hx:[-.2,-.3,-.05,.35],hy:[.55,.62,.38,.65],hz:[.3,.22,.56,.35],
  bx:[-.3,-.5,-.55,.4],by:[.95,.85,.12,.7],bz:[.12,.1,.82,.55],stride:[.2,.3,.42,.4],back:[-.2,-.2,-.25,-.32],head:[1.1,1.15,.6,.2]};
/* When the batter stays in the box after a pitch (foul, take, swing and miss), the bat comes down to rest on his back shoulder, hands low in front
   (never held vertical in front of him, #43), and goes back up before the next pitch */
const BAT_REST={yaw:-.1,hx:.02,hy:.3,hz:.28,bx:-.6,by:.55,bz:-.55},BAT_REST_AT=1.4,BAT_REST_DUR=.6,BAT_UNREST_DUR=.5;
const BAT_LOAD_LEAD=.9,BAT_LOAD_DUR=.6,BAT_SWING_LEAD=.22,BAT_SWING_DUR=.3,BAT_FT_DELAY=.06,BAT_FT_DUR=.3,BAT_ARM_LEN=.6,BAT_SHOULDER_X=.3,BAT_SHOULDER_Y=.57;
const _bv=new THREE.Vector3(),_bq=new THREE.Quaternion(),_dn=new THREE.Vector3(0,-1,0),_up=new THREE.Vector3(0,1,0),sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);
function aimArm(a,sx,tx,ty,tz){_bv.set(tx-sx,ty-BAT_SHOULDER_Y,tz);const d=_bv.length();_bq.setFromUnitVectors(_dn,_bv.normalize());a.quaternion.copy(_bq);a.scale.y=Math.max(ARM_S_MIN,Math.min(1.2,d/BAT_ARM_LEN))}
/* Skinned players: shortening the arm proxy = bending the elbow, so the hand really lands on the target; on block figures too short looks like a stub, so keep .85 */
const ARM_S_MIN=window.PL?.3:.85;
/* Sacrifice/drag bunt: during the delivery the batter squares around to the pitcher, bends his knees and holds the bat out over the plate,
   barrel a little above the hands, top hand slid up the barrel; the sweet spot sits on the pitch line, and he gives with the pitch at contact.
   Targets are in the batter's ground frame (batter.g local: +x toward the pitcher, +z toward the plate, y up) and converted into the twisted upper body */
const BUNT={yaw:1.25,hips:.75,head:1.45,lean:.45,gap:.32},BUNT_SQUARE_LEAD=1.05,BUNT_SQUARE_DUR=.45,BUNT_GIVE=.08,BUNT_GIVE_DUR=.15;
const BUNT_DIR=[.25,.18,1],BUNT_SWEET=.55,BUNT_SWEET_X=.42,BUNT_KNEE=.3,BUNT_KNEE_REF=.92,BUNT_KNEE_LOW=.25,BUNT_KNEE_MIN=.2,BUNT_KNEE_MAX=.4,BUNT_HAND_MIN=.6,BUNT_HAND_MAX=1.25,BUNT_RISE=.3;
const _ugm=new THREE.Matrix4(),_ugh=new THREE.Vector3(),_ugd=new THREE.Vector3(),_ugs=new THREE.Vector3();
let buntK=0,buntDrop=0;const buntPt=[0,1,.3];
/* Convert a point (or direction) from the batter's ground frame into the upper-body frame batPivot lives in */
function groundToUp(v,dir){batter.g.updateMatrixWorld(true);_ugm.copy(batter.g.matrixWorld).invert().multiply(BR.up.matrixWorld).invert();return dir?v.transformDirection(_ugm):v.applyMatrix4(_ugm)}
/* Hit by pitch: the ball ends on the batter's body (spot picked from the pitch height, on the pitcher's side of him), he flinches and turns away,
   the ball drops and hops, then he goes to first at the engine's st0. Batter-local: +x faces the pitcher. */
const HBP_BODY_R=.2,HBP_Y_MIN=.55,HBP_Y_MAX=1.5,HBP_DROP_DUR=.5,HBP_HOP_DUR=.3,HBP_DROP_DX=.3,HBP_DROP_DZ=.35,HBP_HOP_DX=.2,HBP_HOP_DZ=.25,HBP_HOP_PEAK=.1,HBP_DROP_PEAK=.12,HBP_BALL_GONE=2.2;
const HBP_REACT_IN=.15,HBP_REACT_OUT_AT=.45,HBP_REACT_OUT=.35,HBP_YAW=-.9,HBP_LEAN=.4,HBP_KNEE=.15;
const hbpReact=u=>ease(sat01((u-ARRIVE)/HBP_REACT_IN))*(1-ease(sat01((u-ARRIVE-HBP_REACT_OUT_AT)/HBP_REACT_OUT)));
function hbpSpot(e){const lf=e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L',kk=batter.k||1;
  return[lf?-BAT_BOX[0]:BAT_BOX[0],clamp(.45+e.zy*.75,HBP_Y_MIN,HBP_Y_MAX)*kk,BAT_BOX[1]-HBP_BODY_R]}
function hbpBall(e,u){const S=hbpSpot(e),t=u-ARRIVE,sg=S[0]>0?-1:1;/* he stands on the side away from the plate: the ball bounces back toward it and toward the pitcher */
  const g1=[S[0]+sg*HBP_DROP_DX,BALL_R,S[2]-HBP_DROP_DZ],g2=[g1[0]+sg*HBP_HOP_DX,BALL_R,g1[2]-HBP_HOP_DZ];
  if(t<HBP_DROP_DUR)return arc(S,g1,HBP_DROP_PEAK,t/HBP_DROP_DUR);
  if(t<HBP_DROP_DUR+HBP_HOP_DUR)return arc(g1,g2,HBP_HOP_PEAK,(t-HBP_DROP_DUR)/HBP_HOP_DUR);
  return t<HBP_BALL_GONE?g2:null}
function poseBatter(e,u){
  const bn=e.r==='inplay'&&e.play&&e.play.bunt?ease(sat01((u-(ARRIVE-BUNT_SQUARE_LEAD))/BUNT_SQUARE_DUR)):0;
  const ld=ease(sat01((u-(ARRIVE-BAT_LOAD_LEAD))/BAT_LOAD_DUR)),sw=e.swing&&!bn?ease(sat01((u-(ARRIVE-BAT_SWING_LEAD))/BAT_SWING_DUR)):0,ft=e.swing&&!bn?ease(sat01((u-(ARRIVE+BAT_FT_DELAY))/BAT_FT_DUR)):0;
  const K=(k,c)=>{const a=BK[k];let v=lerp(a[0],a[1],ld);v=lerp(v,c===undefined?a[2]:c,sw);return lerp(v,a[3],ft)};
  const stay=!(e.pa&&e.r!=='ibb'),rw=stay?Math.max(ease(sat01((u-(ARRIVE+BAT_REST_AT))/BAT_REST_DUR)),(e.c0[0]+e.c0[1]>0&&e.c0[0]+e.c0[1]!==undefined)?1-ease(sat01(u/BAT_UNREST_DUR)):0):0;
  const yaw=lerp(K('yaw'),BAT_REST.yaw,rw),py=.45+e.zy*.75,dyC=Math.max(-.7,Math.min(.2,(py-1.33)/.85));
  const byaw=lerp(yaw,BUNT.yaw,bn);const hb=e.r==='hbp'?hbpReact(u):0;BR.up.rotation.set(lerp(K('lean'),BUNT.lean,bn)+HBP_LEAN*hb,byaw+HBP_YAW*hb,0);BR.hips.rotation.y=lerp(yaw*.6,BUNT.hips,bn);BR.hg.rotation.y=lerp(K('head'),BUNT.head,bn)-byaw;
  BR.l0.rotation.z=K('back');BR.l1.rotation.z=lerp(lerp(BK.stride[0],BK.stride[1],ld),BK.stride[2],sw);
  /* Knees bend with the square-around, deeper for a low pitch so the bat stays level instead of chopping down */
  const knee=Math.max(clamp(BUNT_KNEE+(BUNT_KNEE_REF-py)*BUNT_KNEE_LOW,BUNT_KNEE_MIN,BUNT_KNEE_MAX)*bn,HBP_KNEE*hb);buntK=bn;buntDrop=LEG_LEN*knee*(batter.k||1);BR.l0.scale.y=BR.l1.scale.y=1-knee;
  let gx=lerp(K('hx'),BAT_REST.hx,rw),gy=lerp(K('hy'),BAT_REST.hy,rw),gz=lerp(K('hz'),BAT_REST.hz,rw);
  _bv.set(lerp(K('bx'),BAT_REST.bx,rw),lerp(K('by',dyC),BAT_REST.by,rw),lerp(K('bz'),BAT_REST.bz,rw)).normalize();
  if(bn>0){const give=BUNT_GIVE*ease(sat01((u-ARRIVE)/BUNT_GIVE_DUR)),L=Math.hypot(...BUNT_DIR),sl=e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L'?-1:1;
    /* Sweet spot on the pitch line: world x = e.zx, height = pitch height (ground frame is lowered by the knee bend) */
    const sx=BUNT_SWEET_X,sz=-BAT_BOX[0]+sl*e.zx,sy=clamp(py,BUNT_HAND_MIN,BUNT_HAND_MAX)+buntDrop;
    _ugh.set(sx-BUNT_SWEET*BUNT_DIR[0]/L-give,sy-BUNT_SWEET*BUNT_DIR[1]/L,sz-BUNT_SWEET*BUNT_DIR[2]/L);groundToUp(_ugh,false);
    _ugd.set(BUNT_DIR[0],BUNT_DIR[1],BUNT_DIR[2]);groundToUp(_ugd,true);
    gx=lerp(gx,_ugh.x,bn);gy=lerp(gy,_ugh.y,bn);gz=lerp(gz,_ugh.z,bn);_bv.lerp(_ugd,bn).normalize()}
  batPivot.position.set(gx,gy,gz);batPivot.quaternion.setFromUnitVectors(_up,_bv);
  const gap=lerp(BAT_HAND_GAP,BUNT.gap,bn);
  /* Hands apart on the bat: bottom hand (arms[1], a right-handed batter's left hand) on the handle, top hand (arms[0]) BAT_HAND_GAP toward the barrel */
  aimArm(BR.a0,-BAT_SHOULDER_X,gx+_bv.x*gap,gy+_bv.y*gap,gz+_bv.z*gap);aimArm(BR.a1,BAT_SHOULDER_X,gx,gy,gz)}
/* World position of the bat's sweet spot (call after batterWalk has placed the batter): a bunted pitch ends here and the bunted ball starts here */
function buntContact(){batter.g.updateMatrixWorld(true);_ugs.set(0,BUNT_SWEET,0);bat.localToWorld(_ugs);buntPt[0]=_ugs.x;buntPt[1]=_ugs.y;buntPt[2]=_ugs.z;return buntPt}
const BAT_HAND_GAP=.09,BUNT_CRACK=.3,HIT0=[0,1,.3];/* HIT0: where a swung-at ball leaves the bat */
/* Six runner bodies: up to four movers or base runners of this play plus scorers of earlier plays still jogging off to their dugout (#43) */
const runners=[0,1,2,3,4,5].map(()=>figure(matOff,pants,false,{head:'helmet'}));
/* Throws: speed THROW_V m/s (about 120 km/h, including the grip transfer before release); flight time = distance / speed; longer throws arc higher but stay flat */
const THROW_ARC=.05;
const BALL_R=.042,BALL_MIN_PX=1.5,BALL_MAX=3.5,_cw=new THREE.Vector3();
const ZONE_W=.43,ZONE_LO=.55,ZONE_HI=1.1,ZONE_Z=0;
const zoneBox=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-1,0],[1,0],[1,1],[-1,1],[-1,0]].map(([x,y])=>new THREE.Vector3(x*ZONE_W/2,ZONE_LO+y*(ZONE_HI-ZONE_LO),ZONE_Z))),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.75,toneMapped:false}));scene.add(zoneBox);
$('zone').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);zoneBox.visible=on};
const ball=new THREE.Mesh(new THREE.SphereGeometry(BALL_R,14,10),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}));scene.add(ball);
const ballSh=new THREE.Mesh(GEO.shadow,shadowMat);ballSh.rotation.x=-Math.PI/2;ballSh.scale.setScalar(.35);scene.add(ballSh);
function pathPos(from,to,dist){let d=dist;for(let b=from;b<to;b++){const [x1,z1]=BASES[b],[x2,z2]=BASES[b+1],L=27.43;if(d<=L){const t=d/L;return[lerp(x1,x2,t),lerp(z1,z2,t),false]}d-=L}const [x,z]=BASES[to];return[x,z,true]}
function face(f,x,z){f.g.rotation.y=Math.atan2(x,z)}
function animate(f,dt){const x=f.g.position.x,z=f.g.position.z,s=Math.hypot(x-f.px,z-f.pz)/Math.max(dt,1e-3);f.px=x;f.pz=z;
  const sp=Math.min(s,9);f.ph+=sp*dt*2.4;const sw=Math.sin(f.ph)*Math.min(1,sp/6)*.9;f.legs[0].rotation.x=sw;f.legs[1].rotation.x=-sw;f.arms[0].rotation.x=-sw*.8;f.arms[1].rotation.x=sw*.8;
  /* f.mix: limb angles of the motion this run grows out of (the pitcher's follow-through), faded out by f.mix.k */
  const m=f.mix;if(m&&m.k>0){f.legs[0].rotation.x=lerp(sw,m.l0,m.k);f.legs[1].rotation.x=lerp(-sw,m.l1,m.k);f.arms[0].rotation.x=lerp(-sw*.8,m.a0,m.k);f.arms[1].rotation.x=lerp(sw*.8,m.a1,m.k)}return sp}
/* Batter: before the first pitch of each plate appearance he walks from the on-deck circle into the box; if the PA ends without him running (strikeout) he walks back to the dugout, no more popping in and out */
const BAT_BOX=[-.9,.15],BAT_FROM=[-7,2.6],BAT_WALK_DUR=1.0,BAT_TURN=.3,BAT_AWAY=[-14,6],BAT_AWAY_AT=ARRIVE+.9,BAT_AWAY_AT_HIT=ARRIVE+.35,BAT_AWAY_SPEED=4,BAT_AWAY_SPEED_HIT=4.6,BAT_STEP_HZ=2.4,BAT_STEP_AMP=.7,BAT_LEAVE_BLEND=4,BAT_CROSS_FWD=.8;
function batterWalk(e,u){
  let x=BAT_BOX[0],z=BAT_BOX[1],yaw=Math.PI/2,sw=0;
  if(e.c0[0]===0&&e.c0[1]===0&&u<BAT_WALK_DUR){
    const t=ease(sat01(u/BAT_WALK_DUR)),k=sat01((u-(BAT_WALK_DUR-BAT_TURN))/BAT_TURN),wy=Math.atan2(BAT_BOX[0]-BAT_FROM[0],BAT_BOX[1]-BAT_FROM[1]);
    x=lerp(BAT_FROM[0],BAT_BOX[0],t);z=lerp(BAT_FROM[1],BAT_BOX[1],t);yaw=lerp(wy,Math.PI/2,k);sw=Math.sin(u*2*Math.PI*BAT_STEP_HZ)*BAT_STEP_AMP*(1-k)}
  else if(e.pa&&!(e.moves||[]).some(m=>m[0]===0)&&u>=(e.r==='inplay'?BAT_AWAY_AT_HIT:BAT_AWAY_AT)){
    const at=e.r==='inplay'?BAT_AWAY_AT_HIT:BAT_AWAY_AT,dx=BAT_AWAY[0]-BAT_BOX[0],dz=BAT_AWAY[1]-BAT_BOX[1],L=Math.hypot(dx,dz),t=(u-at)*(e.r==='inplay'?BAT_AWAY_SPEED_HIT:BAT_AWAY_SPEED)/L;
    if(t>=1)batter.g.visible=false;
    x=lerp(BAT_BOX[0],BAT_AWAY[0],Math.min(t,1));z=lerp(BAT_BOX[1],BAT_AWAY[1],Math.min(t,1));yaw=Math.atan2(dx,dz);sw=Math.sin(u*2*Math.PI*BAT_STEP_HZ)*BAT_STEP_AMP}
  const lf=e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L';/* Left-handed batter = the whole figure mirrored left/right */
  batter.g.scale.x=lf?-1:1;
  batter.g.position.set(lf?-x:x,-buntDrop,z);batter.g.rotation.y=lf?-yaw:yaw;batter.legs[0].rotation.x=sw;batter.legs[1].rotation.x=-sw}

/* pitching delivery: Catmull-Rom keyframes in event-local seconds. angles: limb x-rotation (neg = forward/up), arm a1 keeps increasing through the top (2π = back to hanging) */
const kf=(u,K)=>{const n=K.length;if(u<=K[0][0])return K[0][1];if(u>=K[n-1][0])return K[n-1][1];let i=1;while(u>K[i][0])i++;
  const [t0,v0]=K[i-1],[t1,v1]=K[i],h=t1-t0,s=(u-t0)/h,m=j=>j<=0||j>=n-1?0:(K[j+1][1]-K[j-1][1])/(K[j+1][0]-K[j-1][0]),m0=m(i-1)*h,m1=m(i)*h,s2=s*s,s3=s2*s;
  return(2*s3-3*s2+1)*v0+(s3-2*s2+s)*m0+(-2*s3+3*s2)*v1+(s3-s2)*m1};
const PK={
  yaw:[[0,0],[.4,0],[.95,.6],[1.25,.85],[1.45,.3],[1.6,-.25],[2.2,-.3],[3.2,0]],
  lean:[[0,0],[.4,0],[.95,-.12],[1.4,.1],[1.6,.55],[2,.7],[3,.1],[3.6,0]],
  l0:[[0,0],[.4,0],[.95,-1.4],[1.25,-1.15],[1.45,-.55],[2.6,-.5],[3.4,0]],
  l1:[[0,0],[.95,0],[1.4,.75],[1.7,.9],[2.3,.15],[3,0]],
  a0:[[0,0],[.4,0],[.95,-1.1],[1.25,-1.5],[1.6,-.8],[2,-.9],[3,0]],
  a1:[[0,0],[.4,0],[.95,-1.1],[1.25,1.5],[1.4,2.6],[1.6,3.5],[1.9,4.9],[2.5,6.28]],
  dz:[[0,0],[.95,0],[1.4,.85],[3.2,.85],[4.6,0]]};
const PITCH_SH_Y=.57,PITCH_ARM=.62,P_RUN_BLEND=.4;
/* Coverer leaves the base COVER_BACK_AT s after the throw arrives. A fielder whose home spot is within BAG_CROWD_R m of
   that base (1B holding the runner, 3-1 / 3-6-3) waits until the coverer is CROWD_CLEAR_T s off the bag before walking back */
const COVER_BACK_AT=2.2,BAG_CROWD_R=2.5,CROWD_CLEAR_T=.6;
/* Release point (closed form, same model as the proxy joints). Right-handed = inner x mirror, so world x flips sign; skinned figure scaled by k */
const pitchTipAt=(u,px,pz)=>{const P=fielders.P,sg=P.mirrored?-1:1,k=P.k||1,L=kf(u,PK.lean),th=kf(u,PK.a1),y=kf(u,PK.yaw),lz=PITCH_SH_Y*Math.sin(L)-PITCH_ARM*Math.sin(th);return[px+sg*k*(.3*Math.cos(y)+lz*Math.sin(y)),k*(.95+PITCH_SH_Y*Math.cos(L)-PITCH_ARM*Math.cos(th)),pz+kf(u,PK.dz)+k*(-.3*Math.sin(y)+lz*Math.cos(y))]};
function pitchPose(u){const P=fielders.P,y=kf(u,PK.yaw),L=kf(u,PK.lean),th=kf(u,PK.a1),bx=P.g.position.x,bz=P.g.position.z;
  PR.up.rotation.set(L,y,0);PR.hg.rotation.y=-y*.9;P.legs[0].rotation.x=kf(u,PK.l0);P.legs[1].rotation.x=kf(u,PK.l1);P.arms[0].rotation.x=kf(u,PK.a0);P.arms[1].rotation.x=th;
  P.g.position.z+=kf(u,PK.dz);
  return{tip:pitchTipAt(u,bx,bz),rel:pitchTipAt(RELEASE,bx,bz)}}
function arc(p0,p1,peak,t){return[lerp(p0[0],p1[0],t),lerp(p0[1],p1[1],t)+peak*4*t*(1-t),lerp(p0[2],p1[2],t)]}

/* ---------- Fielding: catch / transfer / throw (frame-steppable in the studio) ---------- */
/* Throw speed by arm strength and distance (m/s): short toss 25-30, infield 34-40, outfield 36-43; transfer (catch to release) 0.6-1.2 s.
   On a ground ball to first, if a normal transfer would arrive after the batter, compress it (down to XFER_RUSH), so the picture never shows an out before the ball gets there */
const CHASE_VMIN=5,CHASE_VMAX=9;
const CHEST=[0,.32,.34],G_SX=-BAT_SHOULDER_X,T_SX=BAT_SHOULDER_X;
const resetPose=f=>{const R=f.rig;f.auto=true;f.mix=null;if(f.bend){f.bend.elbow[0]=f.bend.elbow[1]=0}armsDown(R);R.l0.rotation.set(0,0,0);R.l1.rotation.set(0,0,0);R.l0.scale.y=R.l1.scale.y=1;R.up.rotation.set(0,0,0);R.hg.rotation.set(0,0,0);R.hips.rotation.set(0,0,0);f.g.position.y=0};
/* Reach the glove to world point w; bend at waist and knees for low balls */
function reachGlove(f,w){f.auto=false;const R=f.rig,low=w[1]<.7;if(low)crouch(f,R,clamp((.7-w[1])/.5,0,1),.5,.3,.7,.3);aimWorld(R,R.a0,G_SX,w[0],w[1],w[2]);aimArm(R.a1,T_SX,CHEST[0]+.05,CHEST[1]-.1,CHEST[2])}
/* Throw receiver: reach 0->1 raises the glove to chest height, slightly forward; hold 0->1 brings the throwing hand over to take the ball after the catch */
function gloveTo(f,reach,hold){f.auto=false;const R=f.rig;aimArm(R.a0,G_SX,-.05,lerp(.1,.42,reach),lerp(.25,.55,reach));
  if(hold==null)return;aimArm(R.a0,G_SX,-.05,lerp(.42,CHEST[1],hold),lerp(.55,CHEST[2],hold));aimArm(R.a1,T_SX,lerp(.25,.05,hold),lerp(-.3,CHEST[1],hold),lerp(.1,CHEST[2],hold))}
/* t seconds after the catch: 0-45% transfer (both hands to the chest, other hand takes the ball), then arm up, stride, release, follow-through */
/* Target point of the throwing hand, up-local (shoulder at x .3, y .57): chest -> back past the ear (elbow naturally bent) -> release in front of the head -> finish at the opposite hip. No more full-arm windmill */
const THR_HAND=[[0,[.05,.3,.34]],[.45,[.42,.62,-.18]],[.8,[.38,.86,-.12]],[1,[.22,.9,.42]]],THR_HAND_FT=[[0,[.22,.9,.42]],[.18,[.02,.35,.55]],[.45,[-.22,.02,.4]],[1,[-.15,-.05,.3]]];
const THR_YAW=[[0,0],[.5,.55],[.85,.6],[1,-.25]],THR_YAW_FT=[[0,-.25],[.3,-.55],[1,-.2]];
const kv=(t,K)=>{if(t<=K[0][0])return K[0][1];for(let i=1;i<K.length;i++)if(t<=K[i][0]){const a=K[i-1],b=K[i],s=ease((t-a[0])/(b[0]-a[0]));return a[1].map((v,j)=>lerp(v,b[1][j],s))}return K[K.length-1][1]};
function throwPose(f,t,xfer,tgt){f.auto=false;const R=f.rig,x0=xfer*.45;
  if(t<x0){const h=ease(sat01(t/(x0*.7)));aimArm(R.a0,G_SX,lerp(-.15,CHEST[0]-.03,h),lerp(.2,CHEST[1],h),lerp(.5,CHEST[2],h));aimArm(R.a1,T_SX,lerp(.3,CHEST[0]+.05,h),lerp(-.25,CHEST[1]-.02,h),lerp(.15,CHEST[2],h));return}
  const w=sat01((t-x0)/(xfer-x0)),ft=t-xfer,ftn=sat01(ft/THROW_FT_DUR),hp=ft<0?kv(w,THR_HAND):kv(ftn,THR_HAND_FT);
  R.up.rotation.set(ft<0?-.05*w:lerp(.05,.4,ease(sat01(ft/.2)))*(1-ease(sat01((ft-.5)/.5))),ft<0?kf(w,THR_YAW):kf(ftn,THR_YAW_FT),0);
  aimArm(R.a1,T_SX,hp[0],hp[1],hp[2]);
  /* Glove hand: raised to point at the target, tucked back to the chest on release */
  const gp=ft<0?[-.35,lerp(.35,.6,ease(w)),lerp(.35,.55,ease(w))]:[lerp(-.35,-.12,ease(sat01(ft/.25))),lerp(.6,.25,ease(sat01(ft/.25))),lerp(.55,.3,ease(sat01(ft/.25)))];aimArm(R.a0,G_SX,gp[0],gp[1],gp[2]);
  const st=ft<0?ease(sat01((w-.3)/.7)):1-ease(sat01((ft-.5)/.5));R.l0.rotation.x=-.45*st;R.l1.rotation.x=.3*st}
const THROW_FT_DUR=1.2;
/* Release point: temporarily pose the player at the catch spot, facing the target, at the moment of release, measure the throwing hand, then restore. Cached once per event */
const relCache=new Map();
function throwRelease(e,f,at,xfer,tgt){const key=e.t+':'+xfer;let r=relCache.get(key);if(r)return r;
  const R=f.rig,o=[f.g.position.clone(),f.g.quaternion.clone(),...[R.up,R.hips,R.hg,R.l0,R.l1,R.a0,R.a1].flatMap(x=>[x.quaternion.clone(),x.scale.clone()])];
  resetPose(f);f.g.position.set(at[0],0,at[1]);face(f,tgt[0]-at[0],tgt[2]-at[1]);throwPose(f,xfer,xfer,tgt);const q=f.handWorld(1);r=[q.x,q.y,q.z];
  f.g.position.copy(o[0]);f.g.quaternion.copy(o[1]);[R.up,R.hips,R.hg,R.l0,R.l1,R.a0,R.a1].forEach((x,i)=>{x.quaternion.copy(o[2+2*i]);x.scale.copy(o[3+2*i])});
  if(relCache.size>200)relCache.clear();relCache.set(key,r);return r}
/* Batted-ball path: the simulation already decided the outcome (landing point, hang time); here we solve back for the launch velocity and draw it with a drag integration (Cd ~ .33, an assumed coefficient):
   steeper rise and straighter fall than a parabola. Solved once per event and stored as a sample table */
const AIR_K=1.2*.33*Math.PI*.0366*.0366/(2*.145),GRAV=9.81,FLY_DT=1/120,flyCache=new Map();
function flyPath(e,p0,p1,T){const key=e.t;let tab=flyCache.get(key);
  if(!tab){const n=Math.max(2,Math.ceil(T/FLY_DT)),h=T/n,sim=v=>{const P=p0.slice(),V=v.slice(),out=[P.slice()];for(let i=0;i<n;i++){const sp=Math.hypot(...V);for(let k=0;k<3;k++)V[k]+=h*(-AIR_K*sp*V[k]-(k===1?GRAV:0));for(let k=0;k<3;k++)P[k]+=h*V[k];out.push(P.slice())}return out};
    let v=[(p1[0]-p0[0])/T,(p1[1]-p0[1])/T+GRAV*T/2,(p1[2]-p0[2])/T];
    for(let it=0;it<40;it++){const end=sim(v)[n],err=[p1[0]-end[0],p1[1]-end[1],p1[2]-end[2]];if(Math.hypot(...err)<.01)break;for(let k=0;k<3;k++)v[k]+=err[k]/T*(k===1?1:1.3)}
    tab={pts:sim(v),h,v0:v};if(flyCache.size>200)flyCache.clear();flyCache.set(key,tab)}
  return t=>{const x=clamp(t/tab.h,0,tab.pts.length-1),i=Math.min(tab.pts.length-2,Math.floor(x)),a=x-i,P=tab.pts[i],Q=tab.pts[i+1];return[lerp(P[0],Q[0],a),lerp(P[1],Q[1],a),lerp(P[2],Q[2],a)]}}

const INTRO_GAP=.7,INTRO_RUN=4.5,INTRO_X=26,INTRO_Z=-6;
/* ---------- per-frame scene from event ---------- */
/* catcher + home-plate umpire crouch, mitt tracking, strike call; half-inning swap (defense jogs off, other team jogs on) */
const CROUCH_FWD=.55,CROUCH_SPLAY=.45,CROUCH_LEAN=.2,CROUCH_SHRINK=.35,UMP_FWD=.35,UMP_SPLAY=.3,UMP_LEAN=.4,UMP_SHRINK=.18,UMP_HEAD_UP=.45,MITT_Z=1.1,MITT_SET_LEAD=.7,MITT_SET_DUR=.5,CALL_DELAY=.15,CALL_UP=.25,CALL_HOLD=1.4,CALL_DOWN=.4,CALL_STAND=.75,LEG_LEN=.86;
const JOG_SPEED=6.5,JOG_GAP=.3,BRK_OFF_AT=1,BRK_ON_AT=17.5,_tv=new THREE.Vector3();
const jogRank=k=>JOG_ORDER.indexOf(k),JOG_ORDER=FIELDER_KEYS.slice().sort((a,b)=>Math.hypot(...fielders[b].home)-Math.hypot(...fielders[a].home));
const dugout=t=>[(t===0?1:-1)*INTRO_X,INTRO_Z];
function crouch(f,R,c,fwd,splay,lean,shrink){const fw=fwd*c,sp=splay*c,len=LEG_LEN*(1-shrink*c);f.g.position.y=-(LEG_LEN-len*Math.cos(sp)*Math.cos(fw))*(f.k||1);R.l0.scale.y=R.l1.scale.y=1-shrink*c;R.l0.rotation.set(-fw,0,-sp);R.l1.rotation.set(-fw,0,sp);R.up.rotation.set(lean*c,0,0)}
function aimWorld(R,arm,sx,wx,wy,wz){R.up.updateWorldMatrix(true,false);_tv.set(wx,wy,wz);R.up.worldToLocal(_tv);aimArm(arm,sx,_tv.x,_tv.y,_tv.z)}
function armsDown(R){R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1}
/* #43 plate pose: a crouched catcher's head is ~1.1 m up, a high miss arrives at 1.3-1.55 m. Instead of an arm straight up he rises out of the
   crouch in a controlled way (up to C_HIGH_RISE of it, from C_HIGH_Y over C_HIGH_SPAN of pitch height). After the catch he holds the mitt
   MITT_HOLD s, then brings it back to rest at his chest and sinks back into the crouch over MITT_BACK s (the return throw starts from there). */
const C_HIGH_Y=.95,C_HIGH_SPAN=.5,C_HIGH_RISE=.6,MITT_HOLD=.35,MITT_BACK=.5;
/* #43 overlaps at the plate: once a ball is in play the catcher and the plate umpire stand up (PLATE_UP_AT after contact, over PLATE_UP_DUR),
   the catcher's mitt goes back to rest and the umpire's arms hang, so either can move (legs animated) instead of gliding in a crouch.
   They sink back into the crouch PLATE_DOWN_AT s before the play ends, so the next pitch does not start with a jump into the crouch */
const PLATE_UP_AT=.25,PLATE_UP_DUR=.45,PLATE_DOWN_AT=1,PLATE_DOWN_DUR=.6,ARM_HANG=[0,BAT_SHOULDER_Y-BAT_ARM_LEN,0];/* hand straight below the shoulder (x = the shoulder's own x) */
function poseBattery(e,u){
  const C=fielders.C,set=e.k==='P'||e.k==='VOTE'||e.k==='CHG',isP=e.k==='P',up=isP&&e.r==='inplay'?ease(sat01((u-ARRIVE-PLATE_UP_AT)/PLATE_UP_DUR))*(e.d?1-ease(sat01((u-(e.d-PLATE_DOWN_AT))/PLATE_DOWN_DUR)):1):0;
  const py=isP?.45+e.zy*.75:MITT_REST_Y,k=isP?ease(sat01((u-(RELEASE-MITT_SET_LEAD))/MITT_SET_DUR)):0,
    back=isP&&!e.sbGo?Math.max(up,ease(sat01((u-(ARRIVE+CATCH_SNAP+MITT_HOLD))/MITT_BACK))):0,rise=C_HIGH_RISE*sat01((py-C_HIGH_Y)/C_HIGH_SPAN)*k*(1-back),c=set?(1-rise)*(1-up):0;
  C.noAnim=set&&up<1;crouch(C,CR,c,CROUCH_FWD,CROUCH_SPLAY,CROUCH_LEAN,CROUCH_SHRINK);
  if(set&&up<1){const gx=lerp(lerp(0,isP?e.zx:0,k),0,back),gy=lerp(lerp(MITT_REST_Y,py,k),MITT_REST_Y,back);
    aimWorld(CR,CR.a0,-BAT_SHOULDER_X,gx,gy,MITT_Z);aimWorld(CR,CR.a1,BAT_SHOULDER_X,gx*.8,gy-.15,MITT_Z+.2)}else armsDown(CR);
  const call=isP&&(e.r==='cstr'||e.r==='sstr')?ease(sat01((u-(ARRIVE+CALL_DELAY))/CALL_UP))*(1-ease(sat01((u-(ARRIVE+CALL_HOLD))/CALL_DOWN))):0,cu=(set?1:0)*(1-CALL_STAND*call)*(1-up);
  crouch(ump,UR,cu,UMP_FWD,UMP_SPLAY,UMP_LEAN,UMP_SHRINK);UR.hg.rotation.x=-UMP_HEAD_UP*cu;ump.noAnim=set&&up<1;
  if(set&&up<1){const h=(v,i,sx)=>lerp(v,i?ARM_HANG[i]:sx,up);aimArm(UR.a0,-BAT_SHOULDER_X,h(-.25,0,-BAT_SHOULDER_X),h(.1,1),h(.45,2));aimArm(UR.a1,BAT_SHOULDER_X,h(lerp(.25,.45,call),0,BAT_SHOULDER_X),h(lerp(.1,1.3,call),1),h(lerp(.45,.05,call),2))}else armsDown(UR)}
/* Plate umpire's spot: behind the catcher on the side away from the batter. On a ball in play he comes out from behind the standing catcher
   (who would hide him from the centre-field camera) and out of the runners' way to UMP_GIVE (behind the plate, on the side away from the
   batting team's dugout, where scorers peel off), stays until UMP_HOLD s after the last runner reaches home, and is back on his spot
   before he crouches again at the end of the play */
const UMP_X=.3,UMP_Z=2.6,UMP_GIVE=[2,2.1],UMP_GO_AT=PLATE_UP_AT+PLATE_UP_DUR,UMP_HOLD=1.5,UMP_WALK=2.2,UMP_BACK_PAD=PLATE_DOWN_AT+.2;
function placeUmp(e,u){const lf=e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L',hx=lf?-UMP_X:UMP_X;let x=hx,z=UMP_Z,yaw=Math.PI;
  if(e.r==='inplay'){const last=Math.max(-Infinity,...(e.moves||[]).filter(m=>m[1]===4).map(m=>m[3].arriveT)),gx=-Math.sign(dugout(e.s0.half)[0])*UMP_GIVE[0],gz=UMP_GIVE[1],tw=Math.hypot(gx-hx,gz-UMP_Z)/UMP_WALK,t0=ARRIVE+UMP_GO_AT,
      end=e.d||Math.max(t0,last)+UMP_HOLD+2*tw+UMP_BACK_PAD,tb=Math.max(t0+tw,Math.min(last>-Infinity?last+UMP_HOLD:Infinity,end-tw-UMP_BACK_PAD)),go=ease(sat01((u-t0)/tw)),bk=ease(sat01((u-tb)/tw));
    x=lerp(lerp(hx,gx,go),hx,bk);z=lerp(lerp(UMP_Z,gz,go),UMP_Z,bk);
    if(go>0&&go<1)yaw=Math.atan2(gx-hx,gz-UMP_Z);else if(bk>0&&bk<1)yaw=Math.atan2(hx-gx,UMP_Z-gz);else if(go>=1&&bk===0)yaw=Math.atan2(-x,-z)}
  ump.g.position.x=x;ump.g.position.z=z;ump.g.rotation.y=yaw;if(ump.noAnim){ump.px=x;ump.pz=z}}
function brkSwap(e,u,off,def){FIELDER_KEYS.forEach((k,i)=>{const f=fielders[k],on=u>=BRK_ON_AT,[dx,dz]=dugout(on?off:def),t0=(on?BRK_ON_AT:BRK_OFF_AT)+jogRank(k)*JOG_GAP,[ax,az]=on?[dx,dz]:f.pos,[bx,bz]=on?f.home:[dx,dz],tt=sat01((u-t0)/(Math.hypot(bx-ax,bz-az)/JOG_SPEED)),x=lerp(ax,bx,tt),z=lerp(az,bz,tt);
  f.g.visible=on?u>=t0:tt<1;f.g.position.set(x,tt>0&&tt<1?Math.abs(Math.sin(u*9+i))*.07:0,z);if(tt>0&&tt<1)face(f,bx-ax,bz-az);else face(f,-x,-z)})}
const curPit=[0,0],numOf=(t,name)=>{const b=ROSTERS[t].bat.find(x=>x.name===name);return b?b.num:undefined};
function applyNums(e,off,def){const R=ROSTERS[def];if(e.pit&&e.pit[0]!==undefined)curPit[e.pit[0]]=e.pit[1];
  for(const k of FIELDER_KEYS){const b=k==='P'?R.pit[curPit[def]]:R.bat.find(x=>x.pos===k);setNum(fielders[k],b?b.num:undefined);dress(fielders[k],b);if(k==='P')fielders.P.setThrows(b&&b.throws||'R')}
  const bb=e.k==='P'&&e.bat?ROSTERS[e.bat[0]].bat[e.bat[1]]:null;setNum(batter,bb?bb.num:undefined);if(bb)dress(batter,bb)}
/* Slide pose (feet first): k 0->1; torso leans back, lead leg straight, trail leg bent, arms up, centre of mass low */
const SLIDE_HOLD=.6,SLIDE_UP=.45;
function slidePose(f,k){const R=f.rig;f.noAnim=true;f.auto=false;R.up.rotation.set(lerp(0,-1.05,k),0,0);R.hips.rotation.set(lerp(0,-.5,k),0,0);
  R.l0.rotation.set(lerp(0,-1.4,k),0,0);R.l1.rotation.set(lerp(0,-.75,k),0,lerp(0,.25,k));if(f.bend){f.bend.knee[0]=0;f.bend.knee[1]=1.5*k}
  R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1;R.a0.rotation.set(lerp(0,-2.5,k),0,lerp(0,-.3,k));R.a1.rotation.set(lerp(0,-2.2,k),0,lerp(0,.3,k));R.hg.rotation.set(lerp(0,.6,k),0,0);
  f.g.position.y=-SLIDE_DROP*k*(f.k||1)}
const SLIDE_DROP=.62;
/* #43 a runner who reaches home (scored, or out at the plate) does not stay on it: he runs through a little along his line (less when he
   turns back toward a third-base-side dugout, hardly at all after a slide, which he first gets up from), eases to a jog and goes to his
   team's dugout, where he is gone. Path: quadratic Bezier home -> home + PEEL_IN * through -> dugout, walked by arc length. The same
   function draws him in the next events (peelers) until he gets there, so he never vanishes on the plate when the play ends */
const PEEL_THRU=1.6,PEEL_THRU_TURN=.6,PEEL_THRU_SLIDE=.3,PEEL_SPEED=5.5,PEEL_MIN=3,PEEL_DECEL=.8,PEEL_N=32,PEEL_LOOK=15,PEEL_IN=[Math.SQRT1_2,Math.SQRT1_2],peelCache={};
function peelPath(team,slide){const key=team+(slide?'s':'');if(peelCache[key])return peelCache[key];
  const D=dugout(team),thr=slide?PEEL_THRU_SLIDE:D[0]<0?PEEL_THRU_TURN:PEEL_THRU,P1=[PEEL_IN[0]*thr,PEEL_IN[1]*thr],pts=[],cum=[0];
  for(let i=0;i<=PEEL_N;i++){const t=i/PEEL_N,a=2*t*(1-t),b=t*t;pts.push([a*P1[0]+b*D[0],a*P1[1]+b*D[1]]);if(i)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]))}
  return peelCache[key]={pts,cum,L:cum[PEEL_N]}}
/* tp = seconds since the engine's arrival at home. Returns [x, z, faceX, faceZ], or null once he is in the dugout */
function peelAt(team,tl,tp){const P=peelPath(team,tl.slide),t=tp-(tl.slide?SLIDE_HOLD+SLIDE_UP:0);if(t<=0)return[0,0,PEEL_IN[0],PEEL_IN[1]];
  const v0=tl.slide?0:tl.spd,vT=clamp(tl.spd,PEEL_MIN,PEEL_SPEED),s=t<PEEL_DECEL?v0*t+(vT-v0)*t*t/(2*PEEL_DECEL):(v0+vT)*PEEL_DECEL/2+vT*(t-PEEL_DECEL);
  if(s>=P.L)return null;let i=0;while(i<PEEL_N-1&&P.cum[i+1]<s)i++;
  const a=P.pts[i],b=P.pts[i+1],f=(s-P.cum[i])/Math.max(1e-6,P.cum[i+1]-P.cum[i]);return[lerp(a[0],b[0],f),lerp(a[1],b[1],f),b[0]-a[0],b[1]-a[1]]}
/* Tag: holding the ball in the glove (throwing hand over it), the fielder crouches and lays the glove at the front edge of the bag on the side
   the runner comes from, so it is there when the runner arrives (tagT, from the engine); he turns partly toward the runner. After TAG_HOLD the
   glove comes up; on an out he shows the ball. Until ballIn he is still receiving (gloveTo). All times share the caller's clock. On a safe play
   the engine's ball is late (TAG_LATE), so the caller passes tagT = arrival + TAG_LATE_SWEEP: a late swipe, no out */
const TAG_SET=.45,TAG_MIN=.12,TAG_AFTER_CATCH=.1,TAG_HOLD=.25,TAG_UP=.4,TAG_BACK=.3,TAG_REACH=.45,TAG_REACH_MAX=.8,TAG_Y=.15,TAG_TURN=.35,TAG_HAND_UP=.12,TAG_LATE_SWEEP=.15,
  TAG_SHOW=[-.1,.85,.4],TAG_CROUCH=[.6,.45,.9,.45],TAG_RECV=[-.05,.42,.55],TAG_HAND0=[.25,-.3,.1];
const wrapA=a=>a-2*Math.PI*Math.round(a/(2*Math.PI));
function upLocal(R,w){R.up.updateWorldMatrix(true,false);_tv.set(w[0],w[1],w[2]);R.up.worldToLocal(_tv);return[_tv.x,_tv.y,_tv.z]}
function tagPose(f,u,ballIn,tagT,base,out){f.auto=false;f.noAnim=true;const R=f.rig,t0=Math.min(Math.max(ballIn+TAG_AFTER_CATCH,tagT-TAG_SET),tagT-TAG_MIN),
    k=ease(sat01((u-t0)/(tagT-t0)))*(1-ease(sat01((u-tagT-TAG_HOLD)/TAG_UP))),show=out?ease(sat01((u-tagT-TAG_HOLD)/TAG_UP)):0,hold=ease(sat01((u-ballIn)/.25));
  /* Glove on the runner's lane, TAG_BACK in front of the bag, or TAG_REACH ahead of the fielder's feet when he stands on the lane himself;
     pulled toward him when it would be out of reach */
  const [bx,bz]=BASES[base],[ax,az]=BASES[base-1],L=Math.hypot(ax-bx,az-bz),ux=(ax-bx)/L,uz=(az-bz)/L,fx=f.g.position.x,fz=f.g.position.z,
    sd=Math.max(TAG_BACK,(fx-bx)*ux+(fz-bz)*uz+TAG_REACH),w=[bx+ux*sd,TAG_Y,bz+uz*sd],dw=Math.hypot(w[0]-fx,w[2]-fz);
  if(dw>TAG_REACH_MAX){w[0]=fx+(w[0]-fx)*TAG_REACH_MAX/dw;w[2]=fz+(w[2]-fz)*TAG_REACH_MAX/dw}
  const ry=f.g.rotation.y;f.g.rotation.y=ry+wrapA(Math.atan2(ax-f.g.position.x,az-f.g.position.z)-ry)*TAG_TURN*k;
  crouch(f,R,k,...TAG_CROUCH);const wl=upLocal(R,w),g0=TAG_RECV.map((v,i)=>lerp(v,CHEST[i],hold)),h0=TAG_HAND0.map((v,i)=>lerp(v,CHEST[i]+(i===0?.05:0),hold));
  aimArm(R.a0,G_SX,...[0,1,2].map(i=>lerp(lerp(g0[i],wl[i],k),TAG_SHOW[i],show)));
  aimArm(R.a1,T_SX,...[0,1,2].map(i=>lerp(h0[i],wl[i]+(i===1?TAG_HAND_UP:0),k)))}
/* Steal: the catcher pops out of his crouch while moving the ball to his throwing hand, steps toward the bag and throws at the engine's
   release time (plan.t0). When plan.t0 is later than catch + CATCHER_POP (safe steals: the engine times the ball to arrive after the
   runner), he comes up with the ball at his chest, holds it, and starts the arm action CATCHER_POP*(1-XFER_HAND_SWAP) before release.
   Then he watches the play standing and sinks back into the crouch before the next pitch. Returns the release point for the ball */
const C_STEP=.45,C_RISE=.6,C_RECROUCH=.7,XFER_HAND_SWAP=.45,MITT_REST_Y=.7;
function catcherThrow(e,u,S,sp){const C=fielders.C,catchAt=ARRIVE+CATCH_SNAP,xfer=Math.min(CATCHER_POP,S.t0-catchAt),hold=S.t0-catchAt-xfer,tgt=[sp[0],1.2,sp[1]];
  const [hx,hz]=C.pos,dx=sp[0]-hx,dz=sp[1]-hz,L=Math.hypot(dx,dz),at=[hx+dx/L*C_STEP,hz+dz/L*C_STEP],rel=throwRelease(e,C,at,xfer,tgt);
  /* Motion clock: transfer, hold at the end of the transfer, then the throw */
  const x0=xfer*XFER_HAND_SWAP,t=u-catchAt,tt=t<x0?t:t<x0+hold?x0:t-hold,r={rel,tgt,xfer,xferT:tt};
  if(t<0)return r;
  const step=ease(sat01(tt/xfer)),back=e.d?ease(sat01((u-(e.d-C_RECROUCH))/C_RECROUCH)):0,c=Math.max(1-ease(sat01(t/(xfer*C_RISE))),back);
  resetPose(C);C.noAnim=true;C.g.position.set(lerp(hx,at[0],step*(1-back)),0,lerp(hz,at[1],step*(1-back)));face(C,dx,dz);
  if(c>0)crouch(C,CR,c,CROUCH_FWD,CROUCH_SPLAY,CROUCH_LEAN,CROUCH_SHRINK);
  if(back>0){aimWorld(CR,CR.a0,-BAT_SHOULDER_X,0,MITT_REST_Y,MITT_Z);aimWorld(CR,CR.a1,BAT_SHOULDER_X,0,MITT_REST_Y-.15,MITT_Z+.2)}
  else if(u-S.t0<THROW_FT_DUR)throwPose(C,tt,xfer,tgt);
  return r}
const BALL_BACK_AT=3.4,BALL_BACK_DUR=.9;/* a pitch not put in play: the catcher holds the ball until BALL_BACK_AT s into the frame, then lobs it back to the pitcher over BALL_BACK_DUR s */
function poseScene(e,u,dt,ei){
  const s=u>=(e.showAt||0)?e.s1:e.s0,off=e.s0.half,def=1-off,defT=e.k==='BRK'&&u>=BRK_ON_AT?off:def;
  matDef.color.setHex(TEAMS[defT].color);matOff.color.setHex(TEAMS[off].color);
  applyNums(e,off,defT);
  /* fielders default */
  for(const k of FIELDER_KEYS){const f=fielders[k];resetPose(f);f.noAnim=false;f.pos=fielderStart(k,e.s0.b,e.s0.outs);f.g.position.set(f.pos[0],0,f.pos[1]);face(f,-f.pos[0],-f.pos[1]);f.g.visible=e.k!=='END'&&e.k!=='PRE'||k==='P'||k==='C'}
  poseBattery(e,u);
  if(e.k==='BRK')brkSwap(e,u,off,def);
  const P=fielders.P;P.arms[1].rotation.x=0;PR.up.rotation.set(0,0,0);PR.hg.rotation.set(0,0,0);P.noAnim=e.k==='P';
  /* opening ceremony: defenders jog in from the 1B-side dugout one by one */
  if(e.k==='PRE'){FIELDER_KEYS.forEach((k,i)=>{const f=fielders[k],d0=jogRank(k)*JOG_GAP,sx=dugout(def)[0],sz=INTRO_Z,tt=sat01((u-d0)/(Math.hypot(f.home[0]-sx,f.home[1]-sz)/JOG_SPEED));
    f.g.visible=u>=d0;f.g.position.set(lerp(sx,f.home[0],tt),tt>0&&tt<1?Math.abs(Math.sin(u*9+i))*.07:0,lerp(sz,f.home[1],tt));
    if(tt<1)face(f,f.home[0]-sx,f.home[1]-sz);else face(f,-f.home[0],-f.home[1])})}
  batter.g.visible=e.k==='P';runners.forEach(r=>r.g.visible=false);ball.visible=false;
  batter.g.position.set(-.9,0,.15);batter.g.rotation.y=Math.PI/2;
  let ri=0;const showRunner=(x,z,fx,fz,nm)=>{const r=runners[ri++];if(!r)return;resetPose(r);if(r.bend)r.bend.knee[0]=r.bend.knee[1]=0;r.noAnim=false;r.g.visible=true;r.g.position.set(x,0,z);setNum(r,numOf(off,nm));dress(r,BODY_OF(off,nm));if(fx!==undefined)face(r,fx,fz)};
  const standRunner=(i,uu,nm)=>{const [x,z]=BASES[i+1],[nx,nz]=BASES[i+2],dx=nx-x,dz=nz-z,L=Math.hypot(dx,dz),ld=leadAt(uu);showRunner(x+dx/L*ld,z+dz/L*ld,-x,-z,nm)};
  /* Scorers of earlier plays (same batting team) still jogging to their dugout */
  const peelers=()=>{const T=e.t+u;for(let j=ei-1;j>=0&&T-game.ev[j].t<PEEL_LOOK;j--){const q=game.ev[j];if(q.k!=='P'||q.s0.half!==off)continue;
    for(const [,to,name,tl] of q.moves||[])if(to===4){const P=peelAt(off,tl,T-q.t-tl.arriveT);if(P)showRunner(...P,name)}}};
  if(e.k!=='P'){for(let i=0;i<3;i++)if(s.b[i]&&e.k!=='BRK')standRunner(i,0,s.b[i]);peelers();return s}
  /* pitch */
  const pp=pitchPose(u),tip=pp.tip;
  /* A pitcher who fields the ball or covers first starts from where his delivery stride left him at contact (not from the rubber, which
     was a ~1 m jump), and his limbs and trunk grow out of the follow-through into the run over P_RUN_BLEND s (P.mix, read by animate) */
  if(e.r==='inplay'&&(e.play.fielder==='P'||e.plan.CV.key==='P')&&u>=ARRIVE){const k=1-ease(sat01((u-ARRIVE-FIELD_REACT)/P_RUN_BLEND));
    P.pos=[P.pos[0],P.pos[1]+kf(ARRIVE,PK.dz)];P.noAnim=false;PR.up.rotation.x*=k;PR.up.rotation.y*=k;PR.hg.rotation.y*=k;
    P.mix={k,l0:P.legs[0].rotation.x,l1:P.legs[1].rotation.x,a0:P.arms[0].rotation.x,a1:wrapA(P.arms[1].rotation.x)}}
  const hand=pp.rel,plate=[e.zx,.45+e.zy*.75,.6],mitt=[e.zx,plate[1],MITT_Z],bunt=e.r==='inplay'&&e.play.bunt,hbp=e.r==='hbp';
  const moving=new Set((e.moves||[]).map(m=>m[2]));
  for(let i=0;i<3;i++){const n=e.s0.b[i];if(n&&!moving.has(n))standRunner(i,u,n)}
  const contact=e.r==='inplay'||e.r==='foul';
  poseBatter(e,u);batterWalk(e,u);placeUmp(e,u);
  const hit0=bunt?buntContact().slice():HIT0;if(bunt)plate.splice(0,3,...hit0);
  let bp=null;
  if(u<RELEASE){const q=fielders.P.handWorld(1);bp=[q.x,q.y,q.z]}
  else if(u<ARRIVE)bp=arc(hand,hbp?hbpSpot(e):plate,.3,(u-RELEASE)/(ARRIVE-RELEASE));
  else if(!contact){ if(hbp)bp=hbpBall(e,u);
    else if(u<ARRIVE+CATCH_SNAP)bp=arc(plate,mitt,0,(u-ARRIVE)/CATCH_SNAP);else if(u<BALL_BACK_AT){const q=fielders.C.handWorld(0);bp=[q.x,q.y,q.z]}else if(u<BALL_BACK_AT+BALL_BACK_DUR){const q=fielders.C.handWorld(0);bp=arc([q.x,q.y,q.z],hand,3,(u-BALL_BACK_AT)/BALL_BACK_DUR)}}
  else if(e.r==='foul'){const tt=(u-ARRIVE)/1.6;if(tt<1)bp=arc(HIT0,[e.foulDir*24,9,22],12,tt)}
  /* steal: the engine planned the catcher's throw and who covers second (e.plan); draw it */
  if(e.sbGo&&e.plan){const S=e.plan,c=fielders[S.CV.key],sp=S.CV.spot,D2=Math.hypot(sp[0]-c.pos[0],sp[1]-c.pos[1]),kc=D2<.3?1:clamp(runDist(u-RELEASE-FIELD_REACT,COVER_SPEED)/D2,0,1),bk=D2<.3?0:clamp(runDist(u-(S.arrive+2.2),COVER_SPEED)/D2,0,1);
    c.g.position.set(lerp(lerp(c.pos[0],sp[0],kc),c.pos[0],bk),0,lerp(lerp(c.pos[1],sp[1],kc),c.pos[1],bk));
    const tagA=S.actions.find(a=>a.a==='tag'),tagT=tagA?tagA.t:S.arrive+TAG_LATE_SWEEP;/* out: the engine's tag time; safe: a late swipe */
    if(bk===0&&u>S.t0-.2){face(c,-c.g.position.x,-c.g.position.z);c.noAnim=true;if(u<S.arrive)gloveTo(c,lerp(.45,1,ease(sat01((u-(S.arrive-.45))/.3))),null);else tagPose(c,u,S.arrive,tagT,S.CV.base,!!tagA)}
    const C=fielders.C,ct=catcherThrow(e,u,S,sp);
    if(u>=ARRIVE+CATCH_SNAP&&u<S.t0){const q=C.handWorld(ct.xferT<ct.xfer*XFER_HAND_SWAP?0:1);bp=[q.x,q.y,q.z]}
    else if(u>=S.t0&&u<S.arrive)bp=arc(ct.rel,ct.tgt,Math.min(3,S.TD*THROW_ARC*(32/S.v)),(u-S.t0)/S.TT);
    else if(u>=S.arrive&&u<S.arrive+2.5){const q=c.handWorld(0);bp=[q.x,q.y,q.z]}
    else if(u>=S.arrive+2.5)bp=null}
  /* runner moves: when each runner starts, slides and arrives is decided by the engine (4th element of a move) */
  const flyOut=e.r==='inplay'&&e.play.res==='out'&&e.play.type!=='GB';let batGone=Infinity;
  for(const [from,to,name,tl] of e.moves||[]){
    const {st0,spd,slide,ts,slideTime:ST,arriveT}=tl,lead=from>0&&u<st0?leadAt(u):tl.lead,Ltot=(to-from)*27.43;
    if(from===0)batGone=st0;
    let prog;if(u<ts)prog=runDist(u-st0,spd)+lead;else{const sl=sat01((u-ts)/ST);prog=Ltot-SLIDE_D+SLIDE_D*(1-(1-sl)*(1-sl))}
    let [x,z,done]=pathPos(from,to,prog);
    if(from===0&&u<st0)continue;
    if(from===0){const lf=e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L',w=1-ease(sat01(prog/BAT_LEAVE_BLEND));x+=(lf?-BAT_BOX[0]:BAT_BOX[0])*w;z+=BAT_BOX[1]*w;/* Leave from the box he stood in, not from the middle of the plate */
      /* Walk / hit by pitch from the third-base-side box: he crosses the plate in an arc BAT_CROSS_FWD out in front of it, clear of the crouched catcher (#43) */
      if(e.r!=='inplay'&&!lf)z-=BAT_CROSS_FWD*4*w*(1-w)}
    if(to===4&&u>=arriveT){const P=peelAt(off,tl,u-arriveT);if(!P)continue;showRunner(...P,name);const r=runners[ri-1];
      if(r&&slide){const k=ease(sat01((u-ts)/(ST*.35)))*(1-ease(sat01((u-arriveT-SLIDE_HOLD)/SLIDE_UP)));if(k>0)slidePose(r,k)}continue}
    const stays=to<4&&e.s1.b[to-1]===name;
    if(done&&!stays&&u-arriveT>.6)continue;
    showRunner(x,z,undefined,undefined,name);
    const r=runners[ri-1];if(!r)continue;const [b0x,b0z]=BASES[to-1],[b1x,b1z]=BASES[to];
    if(!done){const [nx,nz]=pathPos(from,to,prog+1);face(r,nx-x,nz-z)}else if(slide)face(r,b1x-b0x,b1z-b0z);
    if(from===0&&bunt&&buntDrop>0){const rk=1-ease(sat01((u-st0)/BUNT_RISE));if(rk>0){r.rig.l0.scale.y=r.rig.l1.scale.y=1-buntDrop/((r.k||1)*LEG_LEN)*rk;r.g.position.y=-buntDrop*rk}}/* Bunter comes up out of his crouch as he breaks for first */
    if(slide&&u>=ts){const k=ease(sat01((u-ts)/(ST*.35)))*(1-ease(sat01((u-arriveT-SLIDE_HOLD)/SLIDE_UP)));if(k>0)slidePose(r,k)}
  }
  peelers();
  if(u>=batGone)batter.g.visible=false;
  if(e.r==='inplay'){
    /* the whole defensive play (who fields, who covers, every throw and its timing) is e.plan, computed by the engine */
    const p=e.play,PL=e.plan,f=fielders[p.fielder],T=p.hang,u2=u-ARRIVE,hr=p.res==='HR',hit=PL.hit;
    const land=[p.lx,hr?6+(p.dist-114)*.15:(hit||p.type==='GB'?.15:1.5),p.lz];
    const rollEnd=[PL.target[0],.15,PL.target[1]];
    const CV=PL.CV,tagPlay=PL.tagPlay,tagA=PL.actions.find(a=>a.a==='tag'&&a.f===CV.key),tg=tagA?{t:tagA.t,out:true}:tagPlay?{t:PL.arrive+TAG_LATE_SWEEP,out:false}:null,solo=PL.solo,dp=PL.dp,PV=PL.PV,PVspot=PL.PVspot,pv=dp?fielders[PV]:null,PIVOT_XFER=PL.pxfer;
    const catchT=PL.catchT,D=PL.D,cx=PL.stand[0],cz=PL.stand[1];
    const tgt=[CV.spot[0],1.4,CV.spot[1]],tgtF=dp?[PVspot[0],1.4,PVspot[1]]:tgt,TD=PL.TD,TH={v:PL.v,xfer:PL.xfer},TD2=PL.TD2,V2=PL.V2,TT2=PL.TT2;
    const BAG=[BASES[1][0],BASES[1][1]],DB=Math.hypot(BAG[0]-cx,BAG[1]-cz),soloAt=PL.soloAt;
    const crowd=!!CV.key&&CV.key!==p.fielder&&Math.hypot(f.pos[0]-CV.spot[0],f.pos[1]-CV.spot[1])<BAG_CROWD_R;
    const t0=solo?Infinity:PL.t0,TT=PL.TT,rt=PL.rt,a1=dp?PL.a1:t0+TT,t1=dp?PL.t1:a1,arrive=PL.arrive;
    const rtF=crowd?Math.max(rt,arrive+COVER_BACK_AT+CROWD_CLEAR_T):rt;
    if(u2>0){const tc=catchT-FIELD_REACT,cc=tc<=0?1:tc<RUN_ACCEL?.5*tc*tc/RUN_ACCEL:.5*RUN_ACCEL+(tc-RUN_ACCEL),vCh=clamp(D/cc,CHASE_VMIN,CHASE_VMAX);/* Chase speed: arrive exactly at the catch moment (capped at 9 m/s) */
      const k=D<.5?1:clamp(runDist(u2-FIELD_REACT,vCh)/D,0,1),kk=hr?Math.min(k,.5):k,tx=lerp(f.pos[0],cx,kk),tz=lerp(f.pos[1],cz,kk);
      if(CV.key){const c=fielders[CV.key],D2=Math.hypot(CV.spot[0]-c.pos[0],CV.spot[1]-c.pos[1]),kc=D2<.3?1:clamp(runDist(u2-FIELD_REACT-COVER_REACT,COVER_SPEED)/D2,0,1),bk=D2<.3?0:clamp(runDist(u2-(arrive+COVER_BACK_AT),COVER_SPEED)/D2,0,1);
        c.g.position.set(lerp(lerp(c.pos[0],CV.spot[0],kc),c.pos[0],bk),0,lerp(lerp(c.pos[1],CV.spot[1],kc),c.pos[1],bk));
        if(tagPlay&&CV.key==='C'){resetPose(c);c.g.position.y=0}
        const fromX=dp?PVspot[0]:cx,fromZ=dp?PVspot[1]:cz;if(bk===0&&u2>arrive-TT-(dp?TT2:0)-.2){face(c,fromX-c.g.position.x,fromZ-c.g.position.z);c.noAnim=true;
          /* Receiving a throw: glove meets the ball, then the other hand takes it */
          const reach=ease(sat01((u2-(arrive-.45))/.3)),hold=sat01((u2-arrive)/.25);
          if(tg&&u2>=arrive)tagPose(c,u2,arrive,tg.t,CV.base,tg.out);/* A runner to tag (FC lead runner, tag-up at home or third): the tag */
          else gloveTo(c,lerp(.45,1,reach),u2<arrive?null:hold)}
        else face(c,p.lx-c.g.position.x,p.lz-c.g.position.z)}
      if(dp){const D3=Math.hypot(PVspot[0]-pv.pos[0],PVspot[1]-pv.pos[1]),kp=D3<.3?1:clamp(runDist(u2-FIELD_REACT,PIVOT_SPEED)/D3,0,1),bp2=D3<.3?0:clamp(runDist(u2-(t1+1.5),6.5)/D3,0,1);
        pv.g.position.set(lerp(lerp(pv.pos[0],PVspot[0],kp),pv.pos[0],bp2),0,lerp(lerp(pv.pos[1],PVspot[1],kp),pv.pos[1],bp2));
        if(bp2===0&&u2>a1-.6){pv.noAnim=true;if(u2<a1){face(pv,cx-pv.g.position.x,cz-pv.g.position.z);gloveTo(pv,ease(sat01((u2-(a1-.45))/.3)),null)}
          else{face(pv,tgt[0]-pv.g.position.x,tgt[2]-pv.g.position.z);throwPose(pv,u2-a1,PIVOT_XFER,tgt)}}else if(kp<1)face(pv,PVspot[0]-pv.g.position.x,PVspot[1]-pv.g.position.z)}
      const [sx0,sz0]=solo&&u2>=rt?[BAG[0],BAG[1]]:[tx,tz],DR=Math.hypot(f.pos[0]-sx0,f.pos[1]-sz0),back=DR<.5?0:clamp(runDist(u2-rtF,6.5)/DR,0,1);f.g.position.set(lerp(sx0,f.pos[0],back),0,lerp(sz0,f.pos[1],back));/* Back to position: walk back from wherever he last stood */
      if(solo&&u2>catchT+.15&&back===0){const k2=DB<.3?1:clamp(runDist(u2-catchT-.15,6.5)/DB,0,1);f.g.position.set(lerp(tx,BAG[0],k2),0,lerp(tz,BAG[1],k2));if(k2<1){face(f,BAG[0]-cx,BAG[1]-cz);f.noAnim=false}}
      const fx=f.g.position.x,fz=f.g.position.z;
      if(back>0&&back<1)face(f,f.pos[0]-sx0,f.pos[1]-sz0);
      else if(!hr&&u2>=catchT&&u2<rt)face(f,tgtF[0]-fx,tgtF[2]-fz);/* Ball caught -> turn toward the throw target */
      else if(crowd&&u2<rtF)face(f,CV.spot[0]-fx,CV.spot[1]-fz);/* Waiting off the bag: watch the coverer */
      else face(f,-p.lx,-p.lz);
      /* Catch motion: glove reaches toward the ball in the last .35 s; after the catch both hands come to the chest for the transfer; then arm up and throw */
      if(!hr&&back===0&&u2>catchT-.35&&(u2<rt||!crowd)){f.noAnim=true;const low=p.type==='GB'||hit;
        if(u2<catchT+.12){const bpos=ballAt(u2+.04);reachGlove(f,bpos||[fx,low?.25:1.6,fz])}
        else if(solo){if(u2>=soloAt-.05){f.noAnim=true;gloveTo(f,1,null)}}/* Glove raised holding the ball while touching the base */
        else throwPose(f,u2-catchT,TH.xfer,tgtF)}}
    if(u2>0&&u2<T)bp=p.type==='GB'?arc(hit0,land,p.peak,u2/T):flyPath(e,hit0,land,T)(u2);
    else if(u2>=T&&!hr){
      if(hit&&u2<T+.8)bp=arc(land,rollEnd,.3,(u2-T)/.8);
      else{const fx=f.g.position.x,fz=f.g.position.z,c=CV.key&&fielders[CV.key];
        if(u2<catchT)bp=hit?[rollEnd[0],.15,rollEnd[2]]:[p.lx,.15,p.lz];
        else if(solo&&u2>=catchT){if(u2<rt+.3){const q=f.handWorld(0);bp=[q.x,q.y,q.z]}}
        else if(u2>=catchT&&u2<t0){const q=f.handWorld(u2-catchT<TH.xfer*.45?0:1);bp=[q.x,q.y,q.z]}/* In the glove first, in the throwing hand after the transfer */
        else if(u2>=t0&&u2<a1){const rel=throwRelease(e,f,[cx,cz],TH.xfer,tgtF);bp=arc(rel,tgtF,Math.min(3,TD*THROW_ARC*(32/TH.v)),(u2-t0)/TT)}
        else if(dp&&u2<t1){const q=pv.handWorld(u2-a1<PIVOT_XFER*.45?0:1);bp=[q.x,q.y,q.z]}
        else if(dp&&u2<arrive){const rel=throwRelease({t:e.t+.5},pv,PVspot,PIVOT_XFER,tgt);bp=arc(rel,tgt,Math.min(3,TD2*THROW_ARC*(32/V2)),(u2-t1)/TT2)}
        else if(u2<arrive+3.2){if(c){const q=c.handWorld(tg||u2-arrive<.25?0:1);bp=[q.x,q.y,q.z]}else bp=tgt}}}
    if(hr&&u2>0&&u2<T+.2&&!bp)bp=null;
    function ballAt(t){if(t<=0)return null;if(t<T)return p.type==='GB'?arc(hit0,land,p.peak,t/T):flyPath(e,hit0,land,T)(t);if(hit)return t<T+.8?arc(land,rollEnd,.3,(t-T)/.8):rollEnd;return null}
  }
  if(bp){ball.visible=true;ball.position.set(bp[0],bp[1],bp[2]);ballSh.position.set(bp[0],.03,bp[2]);const dB=ball.position.distanceTo(camera.getWorldPosition(_cw)),pxR=BALL_R*(innerHeight/2)/(dB*Math.tan(camera.fov*Math.PI/360)),bs=clamp(BALL_MIN_PX/pxR,1,BALL_MAX);ball.scale.setScalar(bs);ballSh.scale.setScalar(.35*bs)}
  ballSh.visible=ball.visible;
  /* sound cues */
  const cue=(name,at,fn)=>{const key=e.t+name;if(u>=at&&u<at+.6&&!cues.has(key)){cues.add(key);fn()}};
  if(contact)cue('crack',ARRIVE,()=>crack(bunt?BUNT_CRACK:e.r==='inplay'?1:.5));
  else if(e.r!=='hbp')cue('pop',ARRIVE+.05,pop);
  if(e.big)cue('roar',e.showAt,()=>roar(e.big));
  return s;
}

/* ---------- HUD ---------- */
const inningLabel=s=>`${s.inn} 局${s.half?'下':'上'}`;
let hudKey='',feedKey='';
function setDots(el,n){el.querySelectorAll('i').forEach((d,i)=>d.classList.toggle('on',i<n))}
const dotRows=document.querySelectorAll('.sit .dots');
/* the scorebug sits above the player bar (#47) while that is shown; bottom is in the bug's own zoomed pixels */
function bugPlace(){const bar=document.querySelector('.bar'),bug=$('bug');if(!bar||!bug)return;const pl=$('player'),z=parseFloat(getComputedStyle(bug).zoom)||1;
  const bh=pl&&!pl.hidden?Math.round((pl.offsetHeight+parseFloat(getComputedStyle(pl).bottom)+8)/z):20;if(!L.bug)bug.style.bottom=bh+'px';const top=bh+bug.offsetHeight+8;if(!L.feed)$('feed').style.bottom=top+'px';$('vote').style.bottom=top+'px'}
addEventListener('resize',bugPlace);
/* ---------- Layout editor: every UI element can be dragged and scaled; saved in this browser ---------- */
const LAYOUT_KEY='zu_layout',EDIT_ELS=[['bug','A1','比分面板'],['feed','A2','戰況列'],['who','A3','左上狀態'],['gear','A4','設定鈕'],['tag','A5','版本標'],['report','A6','回報鈕']];
let L={},editing=false,selId='bug',ed=null;
try{const v=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');for(const k in v){const o=v[k];if(EDIT_ELS.some(x=>x[0]===k)&&o&&isFinite(o.x)&&isFinite(o.y)&&isFinite(o.s))L[k]={x:o.x,y:o.y,s:clamp(o.s,.5,2)}}}catch(e){}
const layoutSave=()=>{try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(L))}catch(e){}};
function applyEl(id){const el=$(id),o=L[id];
  if(!o){el.style.left=el.style.top=el.style.right=el.style.bottom=el.style.transform=el.style.transformOrigin='';return}
  el.style.left=o.x+'px';el.style.top=o.y+'px';el.style.right='auto';el.style.bottom='auto';el.style.transformOrigin='top left';el.style.transform=o.s===1?'':`scale(${o.s})`}
function applyLayout(){for(const [id] of EDIT_ELS)applyEl(id);bugPlace()}
function pinEl(id){if(!L[id]){const r=$(id).getBoundingClientRect();L[id]={x:Math.round(r.left),y:Math.round(r.top),s:1}}}
const lbls=document.createElement('div');lbls.id='lbls';document.body.appendChild(lbls);
function drawLabels(){if(!editing){lbls.innerHTML='';return}
  lbls.innerHTML=EDIT_ELS.map(([id,c,n])=>{const r=$(id).getBoundingClientRect(),s=id===selId?' sel':'';return `<div class="bx${s}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div><div class="lb${s}" style="left:${r.left}px;top:${Math.max(0,r.top-22)}px">${c} ${n}</div>`}).join('');
  const o=EDIT_ELS.find(x=>x[0]===selId);$('edTxt').textContent=`${o[1]} ${o[2]}・縮放 ${Math.round((L[selId]?L[selId].s:1)*100)}%`}
setInterval(drawLabels,150);
function scaleSel(d,id){id=id||selId;pinEl(id);L[id].s=Math.round(clamp(L[id].s+d,.5,2)*100)/100;applyEl(id);bugPlace();layoutSave();drawLabels()}
function setEditing(on){editing=on;document.body.classList.toggle('edit',on);$('edbar').hidden=!on;if(on){$('bar').classList.add('collapsed');$('gear').textContent='⚙ 設定'}drawLabels()}
for(const [id] of EDIT_ELS){const el=$(id);
  el.addEventListener('pointerdown',e=>{if(!editing)return;e.preventDefault();e.stopImmediatePropagation();selId=id;pinEl(id);applyEl(id);const r=el.getBoundingClientRect();ed={id,dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height};try{el.setPointerCapture(e.pointerId)}catch(err){}drawLabels()},true);
  el.addEventListener('pointermove',e=>{if(!ed||ed.id!==id)return;L[id].x=Math.round(clamp(e.clientX-ed.dx,0,Math.max(0,innerWidth-ed.w)));L[id].y=Math.round(clamp(e.clientY-ed.dy,0,Math.max(0,innerHeight-ed.h)));applyEl(id);bugPlace();drawLabels()});
  const end=()=>{if(ed&&ed.id===id){ed=null;layoutSave()}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{if(!editing)return;e.preventDefault();scaleSel(e.deltaY<0?.1:-.1,id)},{passive:false});
  el.addEventListener('click',e=>{if(editing){e.preventDefault();e.stopImmediatePropagation()}},true)}
let histOn=false;try{histOn=localStorage.getItem('zu_hist')==='1'}catch(e){}
const histApply=()=>{document.body.classList.toggle('hist',histOn);$('hist').setAttribute('aria-pressed',histOn)};histApply();
$('hist').onclick=()=>{histOn=!histOn;histApply();try{localStorage.setItem('zu_hist',histOn?'1':'0')}catch(e){}};
$('editUI').onclick=()=>setEditing(true);$('edDone').onclick=()=>setEditing(false);
$('edMinus').onclick=()=>scaleSel(-.1);$('edPlus').onclick=()=>scaleSel(.1);
$('edOne').onclick=()=>{delete L[selId];applyEl(selId);bugPlace();layoutSave();drawLabels()};
$('edAll').onclick=()=>{L={};applyLayout();layoutSave();drawLabels()};

let bugKey='';
function hudBug(e,u,s,c){const P=e.k==='P'&&e.r!=='ibb',np=P?(u>=ARRIVE?e.pc:e.pc-1):'',sh=P&&u>=RELEASE+.05&&u<ARRIVE+4,k=[s.sc,s.inn,s.half,s.outs,s.b.map(Boolean),c,P?e.t:'',np,sh,e.k==='END'].join('|');if(k===bugKey)return;bugKey=k;
  const dot=(n,t,cl)=>{let h='';for(let i=0;i<t;i++)h+=`<span style="color:${i<n?cl:'rgba(255,255,255,.28)'}">●</span>`;return h};
  let bp='',bb='';
  if(P){const B=ROSTERS[e.bat[0]].bat[e.bat[1]],Pp=ROSTERS[e.pit[0]].pit[e.pit[1]];
    bp=`<b>P</b> ${Pp.name}`+(sh?`<span class="sp">${e.kmh} km/h ${e.pt}</span>`:'')+`<span class="st">NP ${np}</span>`;
    bb=`<b>${B.num}</b> ${B.name}${B.hand==='L'?'<small>（左打）</small>':''}<span class="av"><i>AVG</i> ${B.avg.toFixed(3).replace(/^0/,'')}</span><span class="st">今日 ${e.line.replace(' 打數 ','打 ').replace(' 安打','安').replace('，',' ')}</span>`}
  const on=i=>s.b[i]&&e.k!=='BRK'?'#ffd24d':'rgba(255,255,255,.18)',dia=`<svg class="dia" viewBox="0 0 66 46"><g stroke="rgba(255,255,255,.7)" stroke-width="1.2"><rect x="26" y="4" width="14" height="14" transform="rotate(45 33 11)" fill="${on(1)}"/><rect x="43" y="21" width="14" height="14" transform="rotate(45 50 28)" fill="${on(0)}"/><rect x="9" y="21" width="14" height="14" transform="rotate(45 16 28)" fill="${on(2)}"/></g></svg>`;
  for(let t=0;t<2;t++)$('bt'+t).style.background=`linear-gradient(180deg,${TEAMS[t].css},${TEAMS[t].css}aa)`,$('bt'+t).innerHTML=`${logoOf(t)?`<span class="lg">${logoOf(t)}</span>`:''}<span class="tn">${TEAMS[t].short}</span><span class="sc">${s.sc[t]}</span>`;
  $('bin').textContent=e.k==='END'?'終':`${s.half?'▼':'▲'}${s.inn}`;$('bs').innerHTML=dia;
  $('bso').innerHTML=`<div><b>B</b>${dot(c[0],3,'#4cd964')}</div><div><b>S</b>${dot(c[1],2,'#ffd24d')}</div><div><b>O</b>${dot(Math.min(s.outs,2)+(s.outs>=3?1:0),2,'#ff5a5a')}</div>`;
  if(P){const bc=TEAMS[e.bat[0]].css,pc=TEAMS[e.pit[0]].css;$('bb').style.borderLeft=`6px solid ${bc}`;$('bb').style.background=`linear-gradient(90deg,${bc}40,transparent 65%)`;$('bp').style.borderLeft=`6px solid ${pc}`;$('bp').style.background=`linear-gradient(90deg,${pc}40,transparent 65%)`}
  $('bp').innerHTML=bp;$('bb').innerHTML=bb;$('bp').style.display=bp?'':'none';$('bb').style.display=bb?'':'none';bugPlace()}
function hud(e,u,s){
  const T=e.t+u;
  const c=e.k==='P'?(u>=e.showAt?e.c1:e.c0):[0,0];
  hudBug(e,u,s,c);
  const key=[JSON.stringify(s.ls),s.H,s.E,s.inn,s.half,s.outs,s.b.map(Boolean),c].join('|');
  if(key!==hudKey){hudKey=key;
    const n=Math.max(9,s.ls[0].length,s.ls[1].length);let h='<tr><th></th>';for(let i=1;i<=n;i++)h+=`<th class="num">${i}</th>`;h+='<th class="num rhe">R</th><th class="num">H</th><th class="num">E</th></tr>';
    for(let t=0;t<2;t++){h+=`<tr><td><i class="chip" style="background:${TEAMS[t].css}"></i>${TEAMS[t].short}</td>`;for(let i=0;i<n;i++){const v=s.ls[t][i];h+=`<td class="num">${v===undefined?'':v}</td>`}h+=`<td class="num rhe R">${s.sc[t]}</td><td class="num">${s.H[t]}</td><td class="num">${s.E[t]}</td></tr>`}
    $('ls').innerHTML=h;$('inn').textContent=e.k==='END'?'比賽結束':inningLabel(s);
    setDots(dotRows[0],c[0]);setDots(dotRows[1],c[1]);setDots(dotRows[2],Math.min(s.outs,2)+(s.outs>=3?1:0));
    document.querySelectorAll('.bases i').forEach((d,i)=>d.classList.toggle('on',!!s.b[[1,0,2][i]]&&e.k!=='BRK'))}
  /* matchup */
  let m='';
  if(e.k==='P'){const B=ROSTERS[e.bat[0]].bat[e.bat[1]],Pp=ROSTERS[e.pit[0]].pit[e.pit[1]];m=`打者 <b>${B.num} ${B.name}</b>（${B.pos}）<br><small>${e.line}</small>投手 ${Pp.num} ${Pp.name}<small>本場用球數 ${e.pc}</small>`}
  {const pi=$('pinfo');let h='';
    if(e.k==='P'&&e.r!=='ibb'){const B=ROSTERS[e.bat[0]].bat[e.bat[1]],Pp=ROSTERS[e.pit[0]].pit[e.pit[1]],sh=u>=RELEASE+.05&&u<ARRIVE+4,rt=x=>Math.round(x*70-12);
      h=`<b>投</b> ${Pp.num} ${Pp.name} <small>${e.pline}・${e.pc} 球</small><br><small>球威 ${rt(Pp.stuff)}　控球 ${rt(Pp.ctrl)}</small><br>`+(sh?`<span class="spd">${e.kmh}</span> km/h <small>${e.pt}</small>`:'<small>&nbsp;</small>')+`<br><b>打</b> ${B.num} ${B.name} <small>${e.line}</small><br><small>擊球 ${rt(B.con)}　長打 ${rt(B.pow)}　選球 ${rt(B.eye)}</small>`}
    if(pi.dataset.k!==h){pi.dataset.k=h;pi.innerHTML=h;pi.hidden=!h}}
  if($('matchup').dataset.k!==m){$('matchup').dataset.k=m;$('matchup').innerHTML=m}
  /* feed: last 5 notable */
  const idx=findIdx(T),items=[];
  for(let i=idx;i>=0&&items.length<5;i--){const x=game.ev[i];if(x.k==='P'&&!x.pa&&!x.walkoff&&!x.sbGo)continue;if(x.k==='VOTE'&&(x.pending||T<x.t))continue;if(i===idx&&u<(x.showAt||0))continue;items.push(x)}
  const fk=items.map(x=>x.t).join();if(fk!==feedKey){feedKey=fk;$('feed').innerHTML=items.reverse().map(x=>`<li class="panel${x.big?' big':''}"><b>${x.k==='P'||x.k==='VOTE'?inningLabel(x.s0):''}</b>${x.desc}</li>`).reverse().join('')}
  drawBoard(s,e.k==='END'?'比賽結束':`${inningLabel(s)}  ${Math.min(s.outs,3)} 出局`);
}
let bigTimer=0;function bigText(t){const b=$('big');b.textContent=t;b.style.opacity=1;clearTimeout(bigTimer);bigTimer=setTimeout(()=>b.style.opacity=0,2600)}

/* ---------- audio ---------- */
let ac=null,cGain,cFilt,nextBeat=0,step=0,noiseBuf;
function startAudio(){
  if(ac)return;try{ac=new (window.AudioContext||window.webkitAudioContext)()}catch(e){return}
  const len=ac.sampleRate*4;noiseBuf=ac.createBuffer(1,len,ac.sampleRate);const d=noiseBuf.getChannelData(0);let last=0;
  for(let i=0;i<len;i++){const w=Math.random()*2-1;last=(last+.02*w)/1.02;d[i]=last*3.5}
  const src=ac.createBufferSource();src.buffer=noiseBuf;src.loop=true;cFilt=ac.createBiquadFilter();cFilt.type='lowpass';cFilt.frequency.value=700;cGain=ac.createGain();cGain.gain.value=.12;
  src.connect(cFilt).connect(cGain).connect(ac.destination);src.start();nextBeat=ac.currentTime+.1;
}
const on=()=>ac&&ac.state==='running';
function drum(t,f,v){const o=ac.createOscillator(),g=ac.createGain();o.frequency.setValueAtTime(f,t);o.frequency.exponentialRampToValueAtTime(f*.45,t+.18);g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.25);o.connect(g).connect(ac.destination);o.start(t);o.stop(t+.3)}
function clap(t,v){const s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=noiseBuf;f.type='highpass';f.frequency.value=1500;g.gain.setValueAtTime(v,t);g.gain.exponentialRampToValueAtTime(.001,t+.12);s.connect(f).connect(g).connect(ac.destination);s.start(t,Math.random()*2,.15)}
function crack(v){if(!on())return;const t=ac.currentTime,s=ac.createBufferSource(),f=ac.createBiquadFilter(),g=ac.createGain();s.buffer=noiseBuf;f.type='bandpass';f.frequency.value=2400;f.Q.value=.8;g.gain.setValueAtTime(1.6*v,t);g.gain.exponentialRampToValueAtTime(.001,t+.09);s.connect(f).connect(g).connect(ac.destination);s.start(t,1,.1)}
function pop(){if(!on())return;drum(ac.currentTime,420,.22)}
let excite=0,drumOn=false;
function roar(level){excite=level>1?1:.6;if(!on())return;const t=ac.currentTime;cGain.gain.cancelScheduledValues(t);cGain.gain.setTargetAtTime((level>1?1.1:.6)*talkDuck,t,.08);cFilt.frequency.setTargetAtTime(2600,t,.1)}
function updateAudio(playing){if(!on())return;const t=ac.currentTime;
  cGain.gain.setTargetAtTime((.1+excite*.5)*talkDuck,t,.5);cFilt.frequency.setTargetAtTime(650+excite*1600,t,.5);
  if(!playing){nextBeat=t+.1;return}
  if(!drumOn){nextBeat=t+.1;return}
  const st=60/BPM/2;while(nextBeat<t+.2){const k=step%8;if([0,2,4,5,6].includes(k))drum(nextBeat,95,.09);if(k===2||k===6)clap(nextBeat,.035);nextBeat+=st;step++}}

/* ---------- commentary: two voices from commentary/ (scripted after the game is simulated; no AI call while watching) ---------- */
/* Never two voices in one game (#96, #101): once the script is known, a game with recorded voice never uses the browser voice.
 * Spoken hellos (welcome on enter, "播報開啟") wait until then, are dropped for a recorded game, and by stopTalk (mode change, booth off). */
const BOOTH_PRIME=1;/* BOOTH_PRIME s: lines due up to this long before the script started loading still play (the recorded hello is at t 0, a slow first frame must not skip it) */
let talkDuck=1;/* crowd bed multiplier, CROWD_DUCK while somebody in the booth talks */
const VOICE=window.COMMENTARY.createVoice({onTalk:talk=>{talkDuck=talk?window.COMMENTARY.CROWD_DUCK:1}}),WHO=['pbp','color'];
let sayOn=false,booth=null,boothFor=null,hello=null;
function say(who,text,urgent){if(sayOn)VOICE.say(WHO[who]||who,text,{urgent:!!urgent})}
/* #133: one fetch per script, shared by the booth, the compact clock and the highlights, and started behind the entry card (createBooth copies the lines, so sharing the parsed script is safe) */
const scriptP=new Map(),loadScript=seed=>{if(!scriptP.has(seed))scriptP.set(seed,window.COMMENTARY.loadScript(seed).catch(err=>{scriptP.delete(seed);throw err}));return scriptP.get(seed)};
if(window.OPENING)loadScript(window.OPENING.seed).catch(()=>{});/* fetched while the park compiles, not after the click */
function makeBooth(script){const g=game;return window.COMMENTARY.createBooth({stream:g.stream,seed:g.seed,bank:window.COMMENTARY_BANK,script,teams:g.teams.map(i=>TEAMS[i]),describe:x=>g.ev[x.f].desc})}
function showAiTag(){const v=!(sayOn&&booth&&booth.recorded);if(aiTag.hidden!==v)aiTag.hidden=v}
/* lines: [[who,text],...] said by the browser voice only if this game turns out to have no recorded voice */
function sayHello(lines){if(boothFor===game&&booth){if(!booth.recorded)for(const [w,t] of lines)say(w,t)}else hello=lines}
function setBooth(b,T0){booth=b;VOICE.setRecorded(b.recorded);b.due(T0-BOOTH_PRIME);showAiTag();
  const h=hello;hello=null;if(h&&!b.recorded)for(const [w,t] of h)say(w,t)}
function commentary(T){if(!sayOn||!window.COMMENTARY_BANK)return;
  if(boothFor!==game){const g=boothFor=game;booth=null;VOICE.setRecorded(false);loadScript(g.seed).then(sc=>{if(boothFor===g)setBooth(makeBooth(sc),T)})}
  if(!booth)return;showAiTag();
  for(const l of booth.due(T,{fast:mode!=='live'&&speed>1}))if(seekGame!==game||l.at>=seekFloor)VOICE.say(l.speaker,l.text,{urgent:l.priority>=2&&l.speaker==='pbp',audio:l.audio,cast:l.cast,aside:l.aside})}
const sayBtn=$('say');
/* "AI 語音" licence note (#26): shown while recorded voice can play. Styled here; a ui/ stylesheet rule for .ai-voice overrides it. */
const aiTag=document.createElement('span');aiTag.className='ai-voice';aiTag.textContent='AI 語音';aiTag.hidden=true;
aiTag.style.cssText='grid-column:1/-1;text-align:center;font-size:11px;color:var(--muted);letter-spacing:.08em';sayBtn.after(aiTag);
if(!VOICE.available){sayBtn.disabled=true;sayBtn.textContent='不支援播報'}
setTeam(myTeam);
sayBtn.onclick=()=>{sayOn=!sayOn;sayBtn.setAttribute('aria-pressed',sayOn);if(sayOn){if(!VOICE.hasMandarin()&&!(booth&&booth.recorded))note('這台裝置找不到國語語音，會用系統預設中文');sayHello([[0,'播報開啟']])}else stopTalk()};
/* ---------- camera & controls ---------- */
let seat=3,yawOff=0,pitchOff=0,zoomed=false;
const look=(sx,sy,sz,tx,ty,tz)=>[Math.atan2(-(tx-sx),-(tz-sz)),Math.atan2(ty-sy,Math.hypot(tx-sx,tz-sz))];
let shotNow=-1,autoSeat=-1,hitPrev=false;
/* Seat fovs are vertical. On a 19.5:9 phone 55 deg vertical is ~97 deg across, a fisheye that stretches the near stands while dragging the
   view around and makes the park feel like a model; cap the horizontal angle at HFOV_MAX (a 16:10 desktop stays as it was). */
const HFOV_MAX=80,fitFov=f=>Math.min(f,2*Math.atan(Math.tan(HFOV_MAX*Math.PI/360)/camera.aspect)*180/Math.PI);
/* Broadcast camera after contact: high behind home plate looking at the whole field, aim drifting slowly between the field centre and the ball */
const HITCAM={x:0,y:8,z:11,fov:62,mid:[0,0,-26]};
function directorShot(){const e=curEvent,u=curU;let id=5;
  if(e&&e.k==='P'){if(u<ARRIVE+.35)id=3;else if(e.r==='inplay'&&u<ARRIVE+e.play.hang+.6)id=4;else id=5}
  if(id!==shotNow){shotNow=id;FOLLOW_T.set(0,1.3,-9);camera.fov=fitFov(SEATS[id].follow?30:SEATS[id].fov);camera.updateProjectionMatrix()}
  return SEATS[id]}
function placeCamera(dt){const s=SEATS[seat].director?directorShot():SEATS[seat];
  if(renderer.xr&&renderer.xr.isPresenting){const v=s.cam?SEATS[0]:s;rig.position.set(v.x,v.y,v.z);rig.rotation.set(0,look(v.x,0,v.z,v.tx,0,v.tz)[0],0);return}
  rig.rotation.set(0,0,0);camera.position.set(0,0,0);
  const hit=!!(s.auto&&curEvent&&curEvent.k==='P'&&(curEvent.r==='inplay'||curEvent.r==='foul')&&curU>=ARRIVE&&ball.visible);
  const cs=hit?HITCAM:s,py=cs.y+(cs.cam?0:1.25);rig.position.set(cs.x,py,cs.z);
  if(hit!==hitPrev){hitPrev=hit;if(hit)FOLLOW_T.set(...HITCAM.mid);else FOLLOW_T.set(s.tx,s.ty,s.tz);camera.fov=fitFov(hit?HITCAM.fov:s.fov);camera.updateProjectionMatrix()}
  let tx=s.tx,ty=s.ty,tz=s.tz,bf=s.fov;
  /* Broadcast camera (auto): normally a fixed long lens on home plate; once the ball is hit (fair or foul) it follows the ball, then pans slowly back to home after the ball is gone */
  const trk=s.auto&&curEvent&&curEvent.k==='P'&&(curEvent.r==='inplay'||curEvent.r==='foul')&&curU>=ARRIVE&&ball.visible;
  if(s.auto&&autoSeat!==seat)FOLLOW_T.set(s.tx,s.ty,s.tz);autoSeat=s.auto?seat:-1;
  if(s.follow||s.auto){const want=s.follow?(ball.visible?ball.position:_fw.set(0,1.3,-9)):(trk?_fw.set(HITCAM.mid[0],HITCAM.mid[1],HITCAM.mid[2]).lerp(ball.position,.35):_fw.set(s.tx,s.ty,s.tz)),k=Math.min(1,dt*(ball.visible&&(s.follow||trk)?7:s.auto?4:2.5));FOLLOW_T.lerp(want,k);tx=FOLLOW_T.x;ty=FOLLOW_T.y;tz=FOLLOW_T.z;
    const d=Math.hypot(tx-s.x,tz-s.z);if(s.follow)bf=clamp(2*Math.atan(14/Math.max(d,8))*180/Math.PI,16,40);else if(trk)bf=HITCAM.fov}
  const [y,p]=look(cs.x,py,cs.z,tx,ty,tz);camera.rotation.set(clamp(p+pitchOff,-1.3,.9),y+yawOff,0);
  const fov=fitFov(zoomed?bf*.4:bf);if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*Math.min(1,dt*6);camera.updateProjectionMatrix()}}
$('seats').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;seat=+b.dataset.seat;yawOff=pitchOff=0;for(const x of $('seats').children)x.setAttribute('aria-pressed',x===b)});
$('gear').onclick=()=>{if(editing)return;const b=$('bar');b.classList.toggle('collapsed');$('gear').textContent=b.classList.contains('collapsed')?'⚙ 設定':'✕ 收起';bugPlace()};

/* Phone landscape: fullscreen + orientation lock (works on Android Chrome; iPhone Safari cannot lock orientation, so tell the user to rotate) */
async function goLandscape(){const d=document,inFs=d.fullscreenElement||d.webkitFullscreenElement;
  if(inFs){try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}(d.exitFullscreen||d.webkitExitFullscreen).call(d);$('land').textContent='⛶ 橫向';return}
  let ok=false;try{const el=d.documentElement;await (el.requestFullscreen||el.webkitRequestFullscreen).call(el);await screen.orientation.lock('landscape');ok=true;$('land').textContent='⤢ 離開'}catch(e){}
  if(!ok)note('這台不能自動轉：關掉螢幕旋轉鎖定，把手機轉橫就好')}
$('land').onclick=goLandscape;
{const mq=matchMedia('(pointer:coarse) and (orientation:portrait)');let told=false;try{told=localStorage.getItem('zu_landHint')==='1'}catch(e){}
 if(mq.matches&&!told)setTimeout(()=>{note('手機轉橫看，畫面比較大（右上「⛶ 橫向」）');try{localStorage.setItem('zu_landHint','1')}catch(e){}},2500)}
addEventListener('orientationchange',()=>setTimeout(()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);bugPlace()},300));
/* Collapse the studio panel: keep only play and the timeline so it covers less of the view (stored in zu_stFold) */
{let fold=false;try{fold=localStorage.getItem('zu_stFold')==='1'}catch(e){}const setFold=v=>{fold=v;$('studio').classList.toggle('fold',v);$('stFold').textContent=v?'▴':'▾';try{localStorage.setItem('zu_stFold',v?'1':'0')}catch(e){}};setFold(fold);$('stFold').onclick=()=>setFold(!fold)}
/* #133 entry log: what happened in the first seconds after the click (ms from the click), carried in the report code so a cold visit on a real
   machine can be read back: f1 first drawn frame, gap longest stretch without a drawn frame in the first ENTRY_WATCH_MS, tA>B a quality drop (r = shaders rebuilt), wN warm-up ms */
const ENTRY_WATCH_MS=15000;let entryT0=0,entryDraw=0,entryGap=0;const entryLog=[];
const entryNote=x=>{if(entryT0&&entryLog.length<12)entryLog.push(`${x}@${Math.round(performance.now()-entryT0)}`)};
function entryFrame(now){if(!entryT0||now-entryT0>ENTRY_WATCH_MS)return;if(!entryDraw)entryNote('f1');else entryGap=Math.max(entryGap,now-entryDraw);entryDraw=now}
$('report').onclick=async()=>{const code=`#BUG entry=${entryLog.join(',')||'-'},gap${Math.round(entryGap)} fps=${fpsAvg.toFixed(0)} tier=${gfxTier} seed=${seedCur} t=${curT().toFixed(1)} seat=${seat} zoom=${zoomed} mode=${mode} dec=${JSON.stringify(decisions||{})} ev=${curEvent?curEvent.k+(curEvent.r?'/'+curEvent.r:''):''} u=${curU.toFixed(2)}${studio?` act=${studio.key}#${studio.n+1}`:''}`;
  try{await navigator.clipboard.writeText(code);note('已複製，貼給 Claude 就能重現這一刻')}catch(err){prompt('複製這行貼給 Claude：',code)}};
const luEl=$('lu');
function showLineup(){let h='<div class="cols">';for(let t=0;t<2;t++){const R=ROSTERS[t],f=game.ev.find(x=>x.k==='P'&&x.pit&&x.pit[0]===t),sp=f?R.pit[f.pit[1]]:R.pit[0];
  h+=`<div><h3 style="border-left:6px solid ${TEAMS[t].css};padding-left:6px">${TEAMS[t].short}</h3><table>${R.bat.map((b,i)=>`<tr><td>${i+1}</td><td>${b.pos}</td><td>${b.num}</td><td>${b.name}</td><td>.${Math.round(b.avg*1000)}</td></tr>`).join('')}</table><div class="sp"><b style="color:#8fd0ff">先發投手</b> ${sp.num} ${sp.name}</div></div>`}
  luEl.innerHTML=h+'</div><div class="hint">AVG 為預設值，點一下關閉</div>';luEl.hidden=false}
$('lineup').onclick=()=>{if(luEl.hidden)showLineup();else luEl.hidden=true;if(!$('bar').classList.contains('collapsed'))$('gear').click()};
luEl.onclick=()=>luEl.hidden=true;
$('zoom').onclick=e=>{zoomed=!zoomed;e.currentTarget.setAttribute('aria-pressed',zoomed)};
const sndBtn=$('snd');sndBtn.onclick=async()=>{startAudio();if(!ac)return;if(ac.state==='running'){await ac.suspend();sndBtn.setAttribute('aria-pressed','false')}else{await ac.resume();sndBtn.setAttribute('aria-pressed','true')}};
let drag=null;const cv=renderer.domElement;
cv.addEventListener('pointerdown',e=>{drag={x:e.clientX,y:e.clientY};cv.setPointerCapture(e.pointerId);cv.style.cursor='grabbing'});
cv.addEventListener('pointermove',e=>{if(!drag)return;const k=(zoomed||SEATS[seat].cam?.0012:.004);yawOff+=(e.clientX-drag.x)*k;pitchOff+=(e.clientY-drag.y)*k;drag={x:e.clientX,y:e.clientY}});
const endDrag=()=>{drag=null;cv.style.cursor='grab'};cv.addEventListener('pointerup',endDrag);cv.addEventListener('pointercancel',endDrag);
function note(t){const n=$('note');n.textContent=t;n.style.display='block';clearTimeout(note.t);note.t=setTimeout(()=>n.style.display='none',4500)}
/* live / replay */
function stopTalk(){VOICE.stop();aiTag.hidden=true;hello=null}
$('mode').onclick=()=>{stopTalk();if(mode==='live'){mode='replay';const T=(Date.now()-gameStart)/1000;replayT=T>game.dur?0:Math.max(0,T-90);$('mode').textContent='回到直播';$('spd').hidden=false;note(T>game.dur?'從頭重播這一場':'倒退 90 秒重播')}
  else{mode='live';loadGame(liveStart());$('mode').textContent='看重播';$('spd').hidden=true}cues.clear();voteKey=''};
const LIVE_ENABLED=false;
function startPractice(){stopTalk();mode='practice';gameStart=Date.now();seedCur=(Math.random()*4294967296)>>>0;decisions={};myVotes={};resolving.clear();regen();lastIdx=-1;cues.clear();replayT=0;voteKey='';subscribeGame();
  $('seedTag').textContent=`開發版・種子 #${seedCur.toString(16)}`;$('spd').hidden=false;if(LIVE_ENABLED)$('mode').hidden=false;$('mode').textContent='回到直播'}
/* The frozen first game (league/preseason/opening.json, loaded by index.html): the recorded stream is played from the top, nothing is simulated. */
function startOpening(){const O=window.OPENING;stopTalk();mode='opening';gameStart=Date.now();seedCur=O.seed;decisions={};myVotes={};resolving.clear();game=O.game;lastIdx=-1;cues.clear();replayT=0;speed=1;voteKey='';subscribeGame();plReset();cpLoad(game);
  $('seedTag').textContent=`季前熱身賽・重播・引擎 ${O.engine}・種子 #${seedCur}`;$('spd').hidden=false;$('spd').textContent='1×';$('mode').hidden=true}
$('practice').onclick=()=>{startPractice();note('新的一場：兩隊都由你調度，暫停時速度會自動回到 1×')};
$('spd').onclick=e=>{speed=speed===1?4:speed===4?16:1;e.currentTarget.textContent=speed+'×'};
/* ---------- player bar (#47): play / pause, elapsed / total, a mark at every half inning, click or drag to move. Frozen game only (mode 'opening').
 * A jump lands on the start of the nearest play. Pictures are posed from (event, time), so nothing is replayed: the scorebug, feed and
 * cue keys are reset, the voice is stopped and the booth re-primed, and only lines bound at or after the landing frame are said (seekFloor).
 * Every jump fires a 'cloudball:seek' event on window ({from, to} seconds; a drag also fires one when it starts, {drag: true, to: null}) for ui/stats.js (#117). Markup in index.html, styles in ui/player.css. */
const SEEK_EPS=1e-3,PL_KEY_STEP=1;/* SEEK_EPS s: re-prime the booth just before the landing time, so a line due exactly there is said; PL_KEY_STEP: plays per arrow key */
let paused=false,scrubbing=false,plFresh=false,seekFloor=0,seekGame=null,plFor=null,plStarts=[0],plLast='';
const plEl=$('player'),plTrack=$('plTrack'),plTip=$('plTip'),plPlay=$('plPlay');
const fmtClock=x=>{x=Math.max(0,Math.floor(x));const h=Math.floor(x/3600),m=Math.floor(x/60)%60,sx=String(x%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sx}`:`${m}:${sx}`};
const halfTag=e=>e.k==='PRE'?'賽前':e.k==='END'?'終':`${e.s0.half?'▼':'▲'}${e.s0.inn}`;
/* starts of every play (plus 0, the pregame) and one mark at the first pitch of each half inning */
function plBuild(){plFor=game;plStarts=[0];const marks=[];let k='';
  for(const e of game.ev){if(e.k!=='P')continue;plStarts.push(e.t);const h=e.s0.inn+'|'+e.s0.half;if(h!==k){k=h;marks.push(e)}}
  $('plMarks').innerHTML=marks.map(e=>`<i class="${e.s0.half?'bot':'top'}" style="left:${(cpView(e.t)/cpDur()*100).toFixed(3)}%"${e.s0.half?'':` data-inn="${e.s0.inn}"`}></i>`).join('');
  plTrack.setAttribute('aria-valuemax',Math.round(cpDur()));$('plTime').style.minWidth=`${2*fmtClock(cpDur()).length+3}ch`/* the track must not change width as the clock grows */}
function plNear(T){const a=plStarts;let lo=0,hi=a.length-1;while(lo<hi){const m=(lo+hi+1)>>1;if(a[m]<=T)lo=m;else hi=m-1}return lo<a.length-1&&a[lo+1]-T<T-a[lo]?lo+1:lo}
const plSnap=T=>plStarts[plNear(clamp(T,0,game.dur))];
/* floorEv (highlights, #118): land exactly on T, not on a play start, and say only lines bound to event floorEv or later */
function seekTo(T,floorEv){const from=replayT,t=floorEv==null?plSnap(T):clamp(T,0,game.dur);replayT=t;plFresh=true;lastIdx=-1;cues.clear();bugKey=hudKey=feedKey='';
  VOICE.stop();hello=null;const ei=floorEv==null?findIdx(t):floorEv,st=game.stream||[];let j=0;while(j<st.length&&st[j].f<ei)j++;seekFloor=j;seekGame=game;
  if(booth&&boothFor===game)booth.due(t-SEEK_EPS);
  dispatchEvent(new CustomEvent('cloudball:seek',{detail:{from,to:t}}))}
function plSetPaused(v){paused=v;if(v)VOICE.stop();plLast=''}
function plReset(){paused=scrubbing=false;seekFloor=0;seekGame=null;plFor=null;plLast='';hlStop()}
const plAt=x=>{const r=plTrack.getBoundingClientRect();return cpGame(clamp((x-r.left)/Math.max(1,r.width),0,1)*cpDur())};
function plShowTip(t){const e=game.ev[findIdx(t)];plTip.textContent=`${halfTag(e)}・${fmtClock(cpView(t))}`;plTip.style.left=(cpView(t)/cpDur()*100)+'%';plTip.hidden=false}
plPlay.onclick=()=>{if(mode!=='opening'||hl&&(hl.done||!hl.segs))return;if(replayT>=game.dur){seekTo(0);plSetPaused(false)}else plSetPaused(!paused)};
plTrack.addEventListener('pointerdown',ev=>{if(mode!=='opening'||ev.button>0)return;ev.preventDefault();plTrack.setPointerCapture(ev.pointerId);scrubbing=true;plEl.classList.add('drag');VOICE.stop();dispatchEvent(new CustomEvent('cloudball:seek',{detail:{from:replayT,to:null,drag:true}}));
  replayT=plSnap(plAt(ev.clientX));plShowTip(replayT)});
plTrack.addEventListener('pointermove',ev=>{if(mode!=='opening')return;if(scrubbing)replayT=plSnap(plAt(ev.clientX));plShowTip(scrubbing?replayT:plSnap(plAt(ev.clientX)))});
const plEnd=ev=>{if(!scrubbing)return;scrubbing=false;plEl.classList.remove('drag');plTip.hidden=true;seekTo(plAt(ev.clientX))};
plTrack.addEventListener('pointerup',plEnd);plTrack.addEventListener('pointercancel',ev=>{if(!scrubbing)return;scrubbing=false;plEl.classList.remove('drag');plTip.hidden=true;seekTo(replayT)});
plTrack.addEventListener('pointerleave',()=>{if(!scrubbing)plTip.hidden=true});
plTrack.addEventListener('keydown',ev=>{if(mode!=='opening')return;const i=plNear(replayT),go={ArrowLeft:i-PL_KEY_STEP,ArrowRight:i+PL_KEY_STEP,Home:0,End:plStarts.length-1}[ev.key];
  if(go===undefined)return;ev.preventDefault();seekTo(plStarts[clamp(go,0,plStarts.length-1)])});
addEventListener('keydown',ev=>{if(mode!=='opening'||ev.key!==' '||!$('intro').hidden||ev.target.closest('button,input,select,textarea,[role=slider]'))return;ev.preventDefault();plPlay.click()});
/* per frame: show the bar in the frozen game only, move the fill / handle, labels only when they change */
function plUpdate(){const vis=mode==='opening'&&!hl&&$('intro').hidden;/* the highlights reel has no bar: it is its own showing */if(plEl.hidden===vis){plEl.hidden=!vis;bugPlace()}if(!vis)return;if(plFor!==game)plBuild();
  const t=clamp(replayT,0,game.dur),end=t>=game.dur,v=cpView(t),vd=cpDur(),k=[Math.floor(v),paused,end].join('|');plEl.style.setProperty('--p',(v/vd).toFixed(5));
  if(k===plLast)return;plLast=k;$('plTime').textContent=`${fmtClock(v)} / ${fmtClock(vd)}`;plTrack.setAttribute('aria-valuenow',Math.floor(v));plTrack.setAttribute('aria-valuetext',`${halfTag(game.ev[findIdx(t)])} ${fmtClock(v)}`);
  const stop=paused||end;plPlay.textContent=stop?'▶':'❚❚';plPlay.setAttribute('aria-label',end?'從頭看':stop?'播放':'暫停')}
/* ---------- compact showing (#126): the recorded game without its dead air. render/compact.js (pure) shortens every stretch where
 * nothing on the field moves and the booth is quiet to a named minimum; this part says when the figures of each event stop moving
 * (cpEvents) and carries the clock across the cuts. replayT stays game time everywhere (poses, booth, highlights, seeks, 'cloudball:seek');
 * only the bar shows view time (cpView / cpGame / cpDur). A seek that lands inside a cut plays it in real time (the highlights lead).
 * On by default; on the dev site the 「緊湊／原速」 button in the settings bar (zu_realTime) or ?rt=1 shows real time for review. */
const PK_END=Math.max(...Object.values(PK).map(K=>K[K.length-1][0]));
/* a pitch not put in play is still from here on: delivery and walk back to the rubber, return throw, strike call, bat to the shoulder,
   runners back from their lead, mitt back to rest */
const PITCH_STILL=Math.max(PK_END,BALL_BACK_AT+BALL_BACK_DUR,ARRIVE+CALL_HOLD+CALL_DOWN,ARRIVE+BAT_REST_AT+BAT_REST_DUR,
  ARRIVE+window.ENGINE.LEAD_BACK_AT+window.ENGINE.LEAD_BACK_DUR,ARRIVE+CATCH_SNAP+MITT_HOLD+MITT_BACK);
const CP_RUNNER_SETTLE=.6+SLIDE_HOLD+SLIDE_UP,CP_PEEL_STEP=.05,CP_PEEL_MAX=30;/* after a runner arrives (vanish / get up from a slide); peel search step and cap */
const cpHere=document.currentScript&&document.currentScript.src;
const COMPACT=import(new URL('compact.js',cpHere||location.href.replace(/[^/]*$/,'render/')).href).catch(err=>{console.warn('compact showing off',err);return null});
function peelLen(team,tl){for(let t=0;t<CP_PEEL_MAX;t+=CP_PEEL_STEP)if(!peelAt(team,tl,t))return t;return CP_PEEL_MAX}
const jogEnd=(from,t0)=>t0+Math.max(...FIELDER_KEYS.map(k=>jogRank(k)*JOG_GAP+Math.hypot(fielders[k].home[0]-from[0],fielders[k].home[1]-from[1])/JOG_SPEED));
/* [{t, d, head, tail, kind}] for render/compact.js: nothing moves in [0, head) and [tail, d) of each event (event-local s). A ball in play,
   a steal and a hit batsman are never cut (their motion depends on the whole plan). Scorers of earlier plays still peeling off to their
   dugout (drawn until PEEL_LOOK s after their play) keep any event they cross moving. */
function cpEvents(g){const ev=g.ev;
  return ev.map((e,i)=>{const off=e.s0?e.s0.half:0;let pe=0,head=0,tail=e.d;
    for(let j=i-1;j>=0&&e.t-ev[j].t<PEEL_LOOK;j--){const q=ev[j];if(q.k!=='P'||q.s0.half!==off)continue;
      for(const [,to,,tl] of q.moves||[])if(to===4)pe=Math.max(pe,Math.min(q.t+PEEL_LOOK,q.t+tl.arriveT+peelLen(off,tl))-e.t)}
    if(e.k==='VOTE'||e.k==='CHG'){head=e.d;tail=0}
    else if(e.k==='BRK'){head=BRK_OFF_AT;tail=jogEnd(dugout(off),BRK_ON_AT)}
    else if(e.k==='PRE')tail=jogEnd([dugout(1-off)[0],INTRO_Z],0);
    else if(e.k==='P'&&e.r!=='inplay'&&e.r!=='hbp'&&!e.sbGo){const mv=e.moves||[];tail=PITCH_STILL;
      if(e.pa&&!mv.some(m=>m[0]===0))tail=Math.max(tail,BAT_AWAY_AT+Math.hypot(BAT_AWAY[0]-BAT_BOX[0],BAT_AWAY[1]-BAT_BOX[1])/BAT_AWAY_SPEED);/* strikeout: he walks off */
      for(const [,to,,tl] of mv)tail=Math.max(tail,tl.arriveT+(to===4?peelLen(off,tl):CP_RUNNER_SETTLE))}/* walk: runners trot on */
    if(pe>0){head=0;tail=Math.max(tail,pe)}
    return{t:e.t,d:e.d,head,tail:Math.min(tail,e.d),kind:e.k==='BRK'?'half':e.k==='CHG'?'change':'pitch'}})}
let cpClock=null,cpFor=null,cpReal=false;
try{cpReal=!!(window.SITE&&window.SITE.dev)&&(localStorage.getItem('zu_realTime')==='1'||new URLSearchParams(location.search).get('rt')==='1')}catch(e){}
/* the cuts need the booth's line times, so they are known once the script has loaded (a second or so; real time until then) */
function cpLoad(g){cpFor=g;cpClock=null;plFor=null;
  Promise.all([COMPACT,loadScript(g.seed).catch(()=>null)]).then(([C,sc])=>{if(!C||cpFor!==g||game!==g)return;let ls=[];try{ls=makeBooth(sc).lines}catch(err){console.warn('compact: no booth lines',err)}
    cpClock=C.compactClock(C.compactCuts(cpEvents(g),ls),g.dur);plFor=null;plLast=''})}
const cpOn=()=>mode==='opening'&&!!cpClock&&cpFor===game&&!cpReal;
const cpView=T=>cpOn()?cpClock.toView(T):T,cpGame=v=>cpOn()?cpClock.toGame(v):v,cpDur=()=>cpOn()?cpClock.dur:game.dur;
if(window.SITE&&window.SITE.dev){const b=document.createElement('button');b.id='realTime';b.className='dev-only';b.title='重播的時間軸：緊湊（剪掉沒人動、沒人講話的空檔）或原速';
  const lab=()=>{b.textContent=cpReal?'原速重播':'緊湊重播';b.setAttribute('aria-pressed',String(!cpReal))};lab();
  b.onclick=()=>{cpReal=!cpReal;try{localStorage.setItem('zu_realTime',cpReal?'1':'0')}catch(e){}lab();plFor=null;plLast='';note(cpReal?'原速：照比賽的真實時間播':'緊湊：剪掉沒人動、沒人講話的空檔')};$('spd').after(b)}
/* ---------- highlights showing (#118): the scoring plays and the last out of the frozen game, back to back, with the bar's seek.
 * The list comes from render/highlights.js (window.HIGHLIGHTS, pure, from the recorded stream and the booth's lines). In: the
 * 「看精華」 button of the entry screen or ?hl=1. A short card (inning and score before the play) after every jump; after the last
 * segment the final score, and the reel stops. Every jump is a seekTo, so it fires 'cloudball:seek' like the bar. */
const HL_CARD_S=3.2;/* s the card stays up after a jump (real time) */
let hl=null;/* {segs, i, done, cardT}; segs is null while the booth's lines load */
const hlCard=$('hlCard');
const hlScore=sc=>`${TEAMS[0].short} ${sc[0]}：${sc[1]} ${TEAMS[1].short}`;
function hlShow(step,text,end){$('hlStep').textContent=step;$('hlText').textContent=text;$('hlEnd').hidden=!end;hlCard.classList.toggle('end',!!end);
  hlCard.hidden=false;hlCard.classList.remove('off');hl.cardT=end?Infinity:performance.now()+HL_CARD_S*1000}
function hlStop(){hl=null;if(hlCard){hlCard.hidden=true;hlCard.classList.remove('end')}}
function hlGo(){const s=hl.segs[hl.i],e=game.ev[s.first];if(Math.abs(replayT-s.start)>SEEK_EPS)seekTo(s.start,s.first);
  hlShow(`精華 ${hl.i+1}／${hl.segs.length}`,`${e.s0.inn} 局${e.s0.half?'下':'上'}・${hlScore(e.s0.sc)}`)}
function startHighlights(){const H=window.HIGHLIGHTS,g=game;if(mode!=='opening'||!H)return;hlStop();
  const first=H.highlightSegments(g,[])[0];if(!first)return;/* the starts do not depend on the booth: jump now, play once the ends are known */
  hl={segs:null,i:0,done:false,cardT:0};paused=true;seekTo(first.start,first.first);hlShow('精華','準備中…');
  const go=lines=>{if(!hl||hl.segs||game!==g)return;hl.segs=H.highlightSegments(g,lines);paused=false;hlGo()};
  loadScript(g.seed).then(sc=>{let ls=[];try{ls=makeBooth(sc).lines}catch(err){console.warn('highlights: no booth lines, fixed tails',err)}go(ls)},()=>go([]))}
function hlTick(){if(!hl)return;if(mode!=='opening'){hlStop();return}
  if(performance.now()>hl.cardT)hlCard.classList.add('off');
  if(!hl.segs||hl.done||paused||replayT<hl.segs[hl.i].end)return;
  if(hl.i+1<hl.segs.length){hl.i++;hlGo();return}
  hl.done=true;plSetPaused(true);const fin=game.ev[game.ev.length-1];hlShow('終場',hlScore(fin.s0.sc),true)}
$('hlAgain').onclick=()=>startHighlights();
$('hlFull').onclick=()=>{hlStop();seekTo(0);plSetPaused(false)};
function statusText(){const now=Date.now(),T=(now-gameStart)/1000,next=gameStart+CYCLE*1000;
  if(mode==='studio')return{cls:'',txt:'動作片場',sub:studio?`${studio.e.desc||''}・${studio.spd}×`:''};
  if(mode==='opening')return{cls:'',txt:'季前熱身賽（重播）',sub:window.SITE&&window.SITE.dev?`${speed}× 速度`:''};
  if(mode==='practice')return{cls:'',txt:window.SITE&&window.SITE.dev?'開發模式':'季前熱身賽',sub:window.SITE&&window.SITE.dev?`${speed}× 速度・兩隊都由你調度`:''};
  if(mode==='replay')return{cls:'',txt:`重播中（${fmtT(gameStart)} 場）`,sub:`${speed}× 速度・不影響直播`};
  if(T<game.dur)return{cls:'live',txt:'直播中',sub:`${fmtT(gameStart)} 開打・下一場 ${fmtT(next)}`};
  const left=Math.max(0,Math.floor((next-now)/1000));return{cls:'',txt:`下一場 ${fmtT(next)} 開打`,sub:`倒數 ${Math.floor(left/60)} 分 ${left%60} 秒・可按「看重播」回顧上一場`}}
const enter=(snd,hlWant)=>{$('intro').hidden=true;entryT0=performance.now();entryDraw=entryGap=0;entryLog.length=0;fpsAcc=fpsN=0;tierT0=performance.now();/* #133: frames drawn under the blurred entry card are not the game's frame rate */if(!LIVE_ENABLED){if(window.OPENING){startOpening();if(hlWant)startHighlights()}else startPractice()}if(snd){startAudio();if(ac){ac.resume();sndBtn.setAttribute('aria-pressed','true')}if(VOICE.available){sayOn=true;sayBtn.setAttribute('aria-pressed','true');sayHello([[0,'歡迎來到雲端職棒'],[1,'今晚一起來看球']])}}};
$('enter').onclick=()=>enter(true);$('enterMute').onclick=()=>enter(false);$('enterHl').onclick=()=>enter(true,true);
$('enterHl').hidden=!(window.OPENING&&window.HIGHLIGHTS);
/* ?hl=1 (#118): straight into the highlights, for a link in a post. Without a click the browser keeps the sound off: the first tap turns it on. */
if(window.OPENING&&window.HIGHLIGHTS&&new URLSearchParams(location.search).get('hl')==='1')window.READY.then(()=>{enter(true,true);
  const unlock=()=>{removeEventListener('pointerdown',unlock,true);removeEventListener('keydown',unlock,true);if(ac&&ac.state!=='running')ac.resume()};
  addEventListener('pointerdown',unlock,true);addEventListener('keydown',unlock,true);setTimeout(()=>{if(!ac||ac.state!=='running')note('點一下畫面開聲音')},HL_CARD_S*1000)});


/* ---------- Action studio: pick one kind of action, find examples in a fixed seed bank, loop it on its own ---------- */
const isL=e=>e.bat&&ROSTERS[e.bat[0]].bat[e.bat[1]].hand==='L';
const pl=(e,f)=>e.k==='P'&&e.play&&f(e.play);
const K3=e=>/三振/.test(e.desc||'');
const STUDIO_SEEDS=40,STUDIO_SEEDS_RARE=400,STUDIO_MAX=30;/* rare acts (5th field) scan a bigger seed bank */
const STUDIO_ACTS=[
  ['投打','cstr','投球・看好球',e=>e.k==='P'&&e.r==='cstr'&&!K3(e)],
  ['投打','ball','投球・壞球',e=>e.k==='P'&&e.r==='ball'],
  ['投打','hiball','投球・高壞球（捕手起身接）',e=>e.k==='P'&&e.r==='ball'&&!e.sbGo&&e.zy>1.15],
  ['投打','foul','打者・界外球',e=>e.k==='P'&&e.r==='foul'],
  ['投打','Ks','被三振・揮棒落空',e=>e.k==='P'&&e.r==='sstr'&&K3(e)],
  ['投打','Kc','被三振・站著不動',e=>e.k==='P'&&e.r==='cstr'&&K3(e)],
  ['投打','Lk','左打・被三振',e=>e.k==='P'&&K3(e)&&isL(e)],
  ['投打','Lhit','左打・擊出球',e=>e.k==='P'&&e.r==='inplay'&&isL(e)],
  ['投打','bunt','短打',e=>pl(e,p=>p.bunt)],
  ['投打','LP','左投・投球',e=>e.k==='P'&&e.r!=='ibb'&&ROSTERS[e.pit[0]].pit[e.pit[1]].throws==='L'],
  ['傳球','catch','接傳球・一壘手接球換手',e=>pl(e,p=>p.type==='GB'&&p.res==='out'&&p.fielder!=='1B'&&!p.dp)],
  ['接球','fb','準備接殺・外野高飛',e=>pl(e,p=>p.type==='FB'&&p.res==='out')],
  ['接球','ld','接殺・平飛球',e=>pl(e,p=>p.type==='LD'&&p.res==='out')],
  ['接球','pu','接殺・內野高飛',e=>pl(e,p=>p.type==='PU'&&p.res==='out')],
  ['傳球','gb','傳球・滾地傳一壘',e=>pl(e,p=>p.type==='GB'&&p.res==='out'&&!p.dp)],
  ['傳球','dp','傳球・雙殺',e=>pl(e,p=>p.dp)],
  ['傳球','dp3','雙殺・3-6-3 投手補一壘',e=>pl(e,p=>p.dp&&p.fielder==='1B')],
  ['傳球','relay','傳球・外野安打傳回',e=>pl(e,p=>(p.res==='1B'||p.res==='2B')&&p.type!=='GB')],
  ['傳球','E','守備失誤',e=>pl(e,p=>p.res==='E')],
  ['跑壘','1B','跑壘・一壘安打',e=>pl(e,p=>p.res==='1B')],
  ['跑壘','2B','跑壘・二壘安打',e=>pl(e,p=>p.res==='2B')],
  ['跑壘','3B','跑壘・三壘安打',e=>pl(e,p=>p.res==='3B')],
  ['跑壘','homeplay','本壘攻防・捕手觸殺',e=>pl(e,p=>true)&&e.plan&&e.plan.CV&&e.plan.CV.base===4&&e.plan.tagPlay,STUDIO_SEEDS_RARE],
  ['跑壘','score','跑壘・跑者回本壘得分',e=>e.k==='P'&&e.play&&e.play.res!=='HR'&&e.runs>0],
  ['跑壘','HR','跑壘・全壘打繞壘',e=>pl(e,p=>p.res==='HR')],
  ['跑壘','sb','盜壘',e=>e.k==='P'&&e.sbGo],
  ['跑壘','sbout','盜壘・觸殺出局',e=>e.k==='P'&&e.sbGo&&e.plan&&e.plan.actions.some(a=>a.a==='tag')],
  ['傳球','tagfc','短打・野選觸殺',e=>pl(e,p=>p.bunt)&&e.plan.actions.some(a=>a.a==='tag'),STUDIO_SEEDS_RARE],
  ['跑壘','slide','滑壘・二壘/三壘安打',e=>pl(e,p=>p.res==='2B'||p.res==='3B')],
  ['跑壘','dpslide','滑壘・雙殺被封殺',e=>pl(e,p=>p.dp)],
  ['跑壘','tagup','高飛犧牲打・回壘再衝本壘',e=>pl(e,p=>p.res==='out'&&p.type==='FB'&&e.runs>0)],
  ['跑壘','tag3','高飛接殺・二壘跑者回壘衝三壘',e=>pl(e,p=>p.res==='out')&&e.plan.tagPlay&&e.plan.CV.base===3],
  ['跑壘','sf23','高飛犧牲打・二壘跑者跟進三壘',e=>pl(e,p=>p.res==='out'&&p.type==='FB')&&(e.moves||[]).some(m=>m[0]===3&&m[1]===4)&&(e.moves||[]).some(m=>m[0]===2&&m[1]===3),STUDIO_SEEDS_RARE],
  ['上壘','bb','四壞保送',e=>e.k==='P'&&/保送/.test(e.desc||'')&&e.r!=='ibb'],
  ['上壘','hbp','觸身球',e=>e.k==='P'&&e.r==='hbp'],
  ['上壘','ibb','故意四壞',e=>e.k==='P'&&e.r==='ibb'],
];
let studio=null;const stCache={};
function studioClips(key){if(stCache[key])return stCache[key];const A=STUDIO_ACTS.find(a=>a[1]===key),f=A[3],nS=A[4]||STUDIO_SEEDS,out=[];
  for(let sd=1;sd<=nS&&out.length<STUDIO_MAX;sd++){const g=simGame(sd,{});g.ev.forEach((e,i)=>{if(out.length<STUDIO_MAX&&f(e))out.push({seed:sd,i})})}
  return stCache[key]=out}
function studioLoad(key,n){const clips=studioClips(key);if(!clips.length){note('種子庫裡找不到這種動作');return}
  n=(n+clips.length)%clips.length;const c=clips[n];
  if(seedCur!==c.seed||mode!=='studio'){seedCur=c.seed;decisions={};regen()}
  mode='studio';const e=game.ev[c.i];studio={key,n,e,t0:e.t,t1:e.t+Math.max(.5,e.d||(game.ev[c.i+1]?game.ev[c.i+1].t-e.t:6)),play:true,spd:studio?studio.spd:1,loop:studio?studio.loop:true};
  replayT=studio.t0;lastIdx=-1;cues.clear();stopTalk();
  $('stIdx').textContent=`${n+1}/${clips.length}`;$('stPlay').textContent='暫停';
  $('seedTag').textContent=`動作片場・種子 #${seedCur.toString(16)}`}
function studioOpen(){const sel=$('stAct');if(!sel.options.length)sel.innerHTML=[...new Set(STUDIO_ACTS.map(a=>a[0]))].map(g=>`<optgroup label="${g}">${STUDIO_ACTS.filter(a=>a[0]===g).map(a=>`<option value="${a[1]}">${a[2]}</option>`).join('')}</optgroup>`).join('');
  $('studio').hidden=false;document.body.classList.add('studio');if(!$('bar').classList.contains('collapsed'))$('gear').click();studioLoad(sel.value,0)}
function studioExit(){$('studio').hidden=true;document.body.classList.remove('studio');studio=null;startPractice()}
$('studioBtn').onclick=studioOpen;$('stExit').onclick=studioExit;
$('stAct').onchange=e=>studioLoad(e.target.value,0);
$('stPrev').onclick=()=>studio&&studioLoad(studio.key,studio.n-1);$('stNext').onclick=()=>studio&&studioLoad(studio.key,studio.n+1);
$('stPlay').onclick=()=>{if(!studio)return;studio.play=!studio.play;if(studio.play&&replayT>=studio.t1)replayT=studio.t0;$('stPlay').textContent=studio.play?'暫停':'播放'};
$('stSpd').onclick=e=>{if(!studio)return;studio.spd=studio.spd===1?.5:studio.spd===.5?.25:studio.spd===.25?.1:1;e.currentTarget.textContent=studio.spd+'×'};
$('stLoop').onclick=e=>{if(!studio)return;studio.loop=!studio.loop;e.currentTarget.setAttribute('aria-pressed',studio.loop)};
$('stStep').onclick=()=>{if(!studio)return;studio.play=false;$('stPlay').textContent='播放';replayT=Math.min(studio.t1,replayT+.05)};
$('stScrub').oninput=e=>{if(!studio)return;studio.play=false;$('stPlay').textContent='播放';replayT=studio.t0+(studio.t1-studio.t0)*e.target.value/1000};
function studioTick(dt){if(!studio)return;if(studio.play){replayT+=dt*studio.spd;if(replayT>=studio.t1){if(studio.loop)replayT=studio.t0;else{replayT=studio.t1-1e-3;studio.play=false;$('stPlay').textContent='播放'}}}
  const u=replayT-studio.t0;$('stT').textContent=u.toFixed(2)+'s';if(document.activeElement!==$('stScrub'))$('stScrub').value=Math.round(1000*u/(studio.t1-studio.t0))}
addEventListener('keydown',e=>{if(!studio||e.target.tagName==='SELECT')return;if(e.key===' '){e.preventDefault();$('stPlay').click()}else if(e.key==='ArrowRight'){replayT=Math.min(studio.t1,replayT+.05);studio.play=false;$('stPlay').textContent='播放'}else if(e.key==='ArrowLeft'){replayT=Math.max(studio.t0,replayT-.05);studio.play=false;$('stPlay').textContent='播放'}});

/* ---------- Auto quality (target: steady 60 fps on a phone in landscape, no dropped frames on substitutions) ----------
   0 everything on (desktop) -> 1 phone start: 1.25x resolution, 1024 shadow map -> 2 1x resolution, no post/grass blades/bugs -> 3 no realtime shadows, round blob shadows under players.
   Drop one tier whenever the average over FPS_WIN frames exceeds FPS_BUDGET_MS (down only, never up, to avoid flip-flopping); a chosen tier is saved in zu_tier and used as the start next time */
const IS_MOBILE=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)||matchMedia('(pointer:coarse)').matches,FPS_WIN=90,FPS_BUDGET_MS=19,FPS_WARMUP_MS=4000,TIER_MAX=3;
let gfxTier=IS_MOBILE?1:0,fpsAcc=0,fpsN=0,fpsAvg=0,tierT0=performance.now();try{const t=+localStorage.getItem('zu_tier');if(t>gfxTier&&t<=TIER_MAX)gfxTier=t}catch(e){}
const blobShadows=[...Object.values(fielders),batter,ump,...runners].map(f=>{const m=new THREE.Mesh(GEO.shadow,shadowMat);m.rotation.x=-Math.PI/2;m.position.y=.02;m.scale.setScalar(.8);m.visible=false;f.g.add(m);return m});
function setTier(n){const was=gfxTier;gfxTier=clamp(n,0,TIER_MAX);try{localStorage.setItem('zu_tier',String(gfxTier))}catch(e){}
  renderer.setPixelRatio(Math.min(devicePixelRatio,[2,1.25,1,1][gfxTier]));renderer.setSize(innerWidth,innerHeight);
  key.shadow.mapSize.set(gfxTier?1024:2048,gfxTier?1024:2048);/* the shadow node resizes its map from mapSize every frame: a size change needs no rebuild */
  PP=gfxTier>=2||gfxLow?null:(PP||setupPost());
  const sh=gfxTier<3;renderer.shadowMap.enabled=sh;key.castShadow=sh;blobShadows.forEach(m=>m.visible=!sh);
  envOn=gfxTier<2;bugs.pts.visible=envOn;setCrowdDensity(CROWD_DENSITY[gfxTier]);if(!envOn)blades.im.visible=false;
  /* #133: only shadows on/off and post on/off change the shaders. A drop that changes neither (0->1: resolution, map size, crowd) used to
     rebuild every material and freeze the picture for the whole warm-up, right after the click on a first visit; now it costs nothing. */
  const sig=`${sh}|${!!PP}`;entryNote(`t${was}>${gfxTier}${sig===tierSig?'':'r'}`);if(sig===tierSig)return;const first=tierSig===null;tierSig=sig;
  if(!first&&key.shadow.map){key.shadow.map.dispose();key.shadow.map=null}
  scene.traverse(o=>{if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.needsUpdate=true)}});
  if(warmStarted)warmUp()}/* a drop in play rebuilds every material: compile it off the frame instead of freezing the tab (#125) */
let tierSig=null;
let envOn=true;
/* ---------- cold start (#125) ----------
   On a first visit the first frame built and compiled every material in one go: a frozen tab for seconds, right when the visitor presses enter.
   Now the loop runs without drawing while compileAsync builds the whole park (it yields between objects; frustum culling is off for that call so
   what the poster camera does not see is included; with post on it compiles for the post's scene pass). READY_FRAMES real frames follow (shadow and post passes compile there, behind the poster),
   then window.READY resolves and index.html enables the entry buttons. A quality drop in play goes through the same path. */
const READY_FRAMES=3,READY_MAX_MS=30000;/* READY_MAX_MS: a compile that never ends (lost device) must not keep the buttons asleep for good */let warming=false,warmStarted=false,warmRun=0,readyN=0,readyOk;window.READY=new Promise(ok=>readyOk=ok);setTimeout(()=>readyOk(),READY_MAX_MS);
async function warmUp(){warmStarted=warming=true;const run=++warmRun,off=[],w0=performance.now();
  scene.traverse(o=>{if(o.frustumCulled){o.frustumCulled=false;off.push(o)}});
  /* with post on, the scene is drawn by the post's scene pass (its own target and MRT outputs, part of every shader): compile for that one */
  const sp=PP&&PP.scenePass;let p=null;
  try{if(sp){if(sp.options.samples===undefined)sp.renderTarget.samples=renderer.samples;p=sp.compileAsync(renderer)}else if(renderer.compileAsync)p=renderer.compileAsync(scene,camera)}
  catch(e){console.warn('warm-up failed',e)}finally{for(const o of off)o.frustumCulled=true}
  try{await p}catch(e){console.warn('warm-up failed',e)}
  if(run!==warmRun)return;warming=false;entryNote(`w${Math.round(performance.now()-w0)}`);fpsAcc=fpsN=0;tierT0=performance.now()/* the compile is not a slow frame */}
function fpsTick(dtMs){fpsAcc+=dtMs;fpsN++;if(fpsN<FPS_WIN)return;fpsAvg=1000/(fpsAcc/fpsN);const avg=fpsAcc/fpsN;fpsAcc=fpsN=0;
  if(performance.now()-tierT0>FPS_WARMUP_MS&&$('intro').hidden&&!document.hidden&&avg>FPS_BUDGET_MS&&gfxTier<TIER_MAX){setTier(gfxTier+1);tierT0=performance.now();note(`有點卡，自動降畫質（${gfxTier}/${TIER_MAX}）`)}}
setTier(gfxTier);

/* ---------- loop ---------- */
applyLayout();let lastNow=performance.now(),stKey='',outFixed=null,introVis=null;prewarmBodies();
renderer.setAnimationLoop(()=>{
  const now=performance.now(),dtMs=now-lastNow,dt=Math.min(dtMs/1000,.1);lastNow=now;if(!warming)fpsTick(dtMs);
  if(LIVE_ENABLED&&mode==='live'&&liveStart()!==gameStart&&(Date.now()-gameStart)/1000>game.dur){loadGame(liveStart());cues.clear()}
  if(mode==='studio')studioTick(dt);
  else if(mode!=='live'&&!(mode==='opening'&&(paused||scrubbing))){const vv=findVote(Math.max(0,replayT));const prev=replayT;replayT=Math.min(game.dur+5,replayT+dt*(vv&&replayT<vv.t?1:speed));if(cpOn())replayT=cpClock.step(prev,replayT)}
  hlTick();
  const T=curT(),i=findIdx(Math.max(0,T)),e=game.ev[i],u=Math.max(0,T)-e.t;
  if(i!==lastIdx){if(lastIdx>=0&&i<lastIdx-1)cues.clear();lastIdx=i;if(e.big===2&&mode==='live'&&u<1)setTimeout(()=>bigText(e.walkoff?'再見！':'全壘打！'),Math.max(0,(e.showAt-u)*1000))}
  curEvent=e;curU=u;if(e.k==='VOTE'&&e.pending&&mode!=='replay'&&mode!=='studio'&&mode!=='opening')resolveVote(e);
  voteEv=mode==='studio'?null:findVote(Math.max(0,T));if(voteEv&&sayOn&&!cues.has(voteEv.id+'open')&&mode!=='replay'){cues.add(voteEv.id+'open');say(0,`${TEAMS[voteEv.team].short}教練團請球迷幫忙決定。${voteEv.q}`,true)}
  const s=poseScene(e,u,dt,i);
  if(plFresh||scrubbing){plFresh=false;for(const f of [...Object.values(fielders),...runners,ump]){f.px=f.g.position.x;f.pz=f.g.position.z}}/* a jump is not a stride */
  for(const k of FIELDER_KEYS)if(!fielders[k].noAnim)animate(fielders[k],dt);runners.forEach(r=>{if(!r.noAnim)animate(r,dt)});if(!ump.noAnim)animate(ump,dt);
  hud(e,u,s);if(mode!=='studio'&&!scrubbing)commentary(T);renderVote(voteEv,T);plUpdate();
  {const iv=!$('intro').hidden;if(iv!==introVis){introVis=iv;$('bug').style.visibility=iv?'hidden':''}}/* Hide the scorebug on the intro screen */
  const st=statusText(),sk=st.txt+st.sub;if(sk!==stKey){stKey=sk;$('status').textContent=st.txt;$('status').className=st.cls;$('sched').textContent=st.sub;
    $('introStatus').textContent=!LIVE_ENABLED?'按進場，馬上開一場新的比賽':st.cls==='live'?`現在 ${inningLabel(s)}，${TEAMS[0].short} ${s.sc[0]}：${s.sc[1]} ${TEAMS[1].short}，直播中`:st.txt}
  const playing=e.k==='P'||e.k==='BRK';drumOn=false;excite=Math.max(0,excite-dt*.12);
  updateCrowd(now,excite,s.half,playing&&$('intro').hidden);updateAudio(playing&&$('intro').hidden);placeCamera(dt);if(envOn){updateBugs(now/1000);updateBlades()}
  if(warming)return;/* the last drawn picture stays up while the materials compile */
  if(PP){try{PP.render()}catch(err){console.error(err);PP=null}}else renderer.render(scene,camera);entryFrame(performance.now());
  if(readyN<READY_FRAMES&&++readyN===READY_FRAMES)readyOk();
});
warmUp();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
}
