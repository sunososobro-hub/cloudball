{


/* Everything about the game itself (rules, outcomes, timings of plays) comes from engine/. This file only draws it. */
const {simGame,ROSTERS,TEAMS,ENGINE_VERSION,mulberry32,FIELD_VAVG,FIELD_REACT,VOTE_WINDOW,FIELD_SPOTS,FIELDER_KEYS,spotXZ,BASES,RELEASE,ARRIVE,CATCH_SNAP,CATCHER_POP,BK_CALL_AT,CHECK_APPEAL_AT,
  runDist,runTime,leadAt,tagLeadAt,LEAD_PRIMARY,fielderStart,SLIDE_D,THROW_MIN,RUN_ACCEL,COVER_REACT,COVER_SPEED,PIVOT_SPEED,runnerTimeline}=window.ENGINE;
const $=id=>document.getElementById(id);
/* #162: dev-site switches, one per boot suspect, so each can be timed on a real GPU without a PR: ?off=shadows,faces,warm,prog,post,shadowmap,park,par
   par = the serial compile (no WARM_PARALLEL phase),
   shadows = #152 contact shadows, faces = #157 head shapes (every player on head 0), warm = no compileAsync (the frames compile it), prog = the old
   PassNode.compileAsync path without the #149 progress callback, post = no post pass, shadowmap = no key-light shadow map, park = #150 shaders off.
   Production ignores the URL. BOOT_MARK writes a stage time into window.BOOT.t (play.html), read back by the 🐞 report's boot= field. */
const OFF=new Set((()=>{try{return window.SITE&&window.SITE.dev?(new URLSearchParams(location.search).get('off')||'').split(',').map(x=>x.trim()).filter(Boolean):[]}catch(e){return[]}})());
/* #256 interim: SSR is off by default on max until its reflected radiance is clamped (owner's GPU: white blobs on the plate, ?off=ssr clean).
   ?on=ssr (dev only) turns it back on for tests. */
const MAX_SSR_DEFAULT=false;
if(!MAX_SSR_DEFAULT&&!(()=>{try{return window.SITE&&window.SITE.dev&&(new URLSearchParams(location.search).get('on')||'').split(',').map(x=>x.trim()).includes('ssr')}catch(e){return false}})())OFF.add('ssr');
const BOOT_MARK=k=>{const B=window.BOOT;if(B&&B.mark)B.mark(k)};BOOT_MARK('script');
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t;
const CYCLE=7200,BPM=132;
const fmtT=ms=>{const d=new Date(ms);return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`};
const seedOf=gs=>(Math.imul((gs/1000)>>>0,2654435761)^0x5bd1e995)>>>0;

/* ---------- schedule & game ---------- */
let gameStart=0,game=null,mode='live',replayT=0,speed=1,lastIdx=-1,seedCur=0,decisions={},myVotes={};const cues=new Set();
let myTeam=-1;try{const v=localStorage.getItem('zu_team');if(v!==null)myTeam=+v}catch(e){}
let DB=null,UID=null,unsubDec=null,unsubVotes=null,voteDocs=[];let parkHook=null;/* #203: set once the park exists; reskins it for the home team of the game */
const DEC_KEY=/^[PSI]\d+$/;
function regen(){game=simGame(seedCur,decisions);if(parkHook)parkHook()}
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
/* #132 light balance (all tiers, constants only): a night park, not a noon field. The grass used to sit in the shoulder of the tone curve
   (193/255, 20 levels between p5 and p95) and the sky above it was lifted like dusk. Exposure down, key/fill/hemisphere down, a dark sky;
   the tower spots aim at the infield with a soft edge, so the infield is brightest and the corners sit lower. */
const EXPOSURE=.75,KEY_I=1.1*Math.PI,FILL_I=.25*Math.PI,HEMI_I=.12*Math.PI,HEMI_GROUND=0x141a12,KEY_SHADOW_I=.7;/* KEY_SHADOW_I: the contact shadows carry the planting now, the real shadow must not double them */
const SKY_HORIZON=[.02,.025,.04],SKY_ZENITH=[.002,.003,.007],SKY_GLOW=[.025,.02,.012];
/* #203 item 2: one sky per home park (台北 night, 新竹 dusk, 高雄 afternoon, 台東 morning). Colours, intensities (x PI) and exposure only;
   the night set is the #132 look above. Applied live by applySky (uniforms and light values: nothing recompiles). Sky colours are linear.
   #208: fogD = depth haze at the ground (thins with height, see HAZE_H), hazeSky = how far the haze colour leans to the sky horizon; halo = wide lamp
   aureole in the haze, motes = dust drifting in the tower beams (both night and dusk; boosted on max). */
const SKIES={
  night:{exposure:EXPOSURE,key:1.1,keyC:0xfff1dc,fill:.25,fillC:0xd6e2ff,hemi:.12,hemiC:0x9fb4e6,ground:HEMI_GROUND,horizon:SKY_HORIZON,zenith:SKY_ZENITH,glow:SKY_GLOW,fog:0x0d1220,fogD:.0056,hazeSky:.3,tower:.16,beam:.025,lamp:1,halo:.16,motes:1,stars:true,bugs:true},
  dusk:{exposure:.78,key:1.5,keyC:0xffc08a,fill:.3,fillC:0xa89ad8,hemi:.22,hemiC:0xc79a9a,ground:0x1c1a12,horizon:[.42,.17,.07],zenith:[.025,.03,.09],glow:[.3,.11,.03],fog:0x3a2830,fogD:.006,hazeSky:.35,tower:.12,beam:.016,lamp:.7,halo:.1,motes:.6,stars:false,bugs:true},
  afternoon:{exposure:.68,key:2.7,keyC:0xfff6e6,fill:.55,fillC:0xcfe0ff,hemi:.5,hemiC:0xb8d4ff,ground:0x2a3420,horizon:[.46,.56,.7],zenith:[.05,.16,.58],glow:[.2,.18,.12],fog:0x9fb2c6,fogD:.0031,hazeSky:.4,tower:.03,beam:0,lamp:.15,halo:0,motes:0,stars:false,bugs:false},
  morning:{exposure:.72,key:2.1,keyC:0xffe6c8,fill:.45,fillC:0xc8dcff,hemi:.45,hemiC:0xa8c8ff,ground:0x26301e,horizon:[.42,.58,.82],zenith:[.04,.14,.48],glow:[.14,.14,.12],fog:0x8aa4c8,fogD:.0036,hazeSky:.4,tower:.03,beam:0,lamp:.15,halo:0,motes:0,stars:false,bugs:false}};
const LAMP_RGB=[5,4.8,4.4],BEAM_DEFAULT=.025;
const renderer=window.RENDERER;
renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setSize(innerWidth,innerHeight);
renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=EXPOSURE;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
const LC=h=>new THREE.Color(h);
/* CC0 textures (ambientCG): assets/tex/<name>_c/_n/_orm.jpg; orm = R:AO G:roughness */
const TXL=new THREE.TextureLoader(),TX={};
function tex(name,srgb){if(TX[name])return TX[name];const t=TXL.load('assets/tex/'+name+'.jpg');t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return TX[name]=t}/* r152+ colour management: hex is treated as sRGB and converted to linear */
$('stage').appendChild(renderer.domElement);
/* #144: the dip to dark over a covered half-inning cut (compact.js dipAlpha); opacity set per frame from the game time */
const cutDip=document.createElement('div');cutDip.id='cutDip';cutDip.style.cssText='position:absolute;inset:0;background:#000;opacity:0;pointer-events:none';$('stage').appendChild(cutDip);let cutDipK=0;
const scene=new THREE.Scene();scene.fog=new THREE.FogExp2(LC(0x0d1220),.0032);/* Thin night-stadium haze: the distance fades out, adding depth */
/* #208 item 1, depth haze (all tiers: one fog node, uniforms only, no extra pass). Exp2 haze whose density thins with the mean height of the
   view ray (HAZE_H m e-folding, never below HAZE_FLOOR), so the wall, the stands and the towers sit back in the air while a fly ball high
   up stays clear. Colour and density come from the park sky (applySky); scene.fog keeps the same values for anything that reads it. */
const HAZE_H=38,HAZE_FLOOR=.35,hazeU={color:TSL.uniform(new THREE.Color(0x0d1220)),dens:TSL.uniform(.0056)};
{const {positionView,positionWorld,cameraPosition,exp,max,fog}=TSL;const y=max(positionWorld.y.add(cameraPosition.y).mul(.5),0),m=hazeU.dens.mul(max(exp(y.div(-HAZE_H)),HAZE_FLOOR)).mul(positionView.z.negate());
  scene.fogNode=fog(hazeU.color,m.mul(m).negate().exp().oneMinus())}
const camera=new THREE.PerspectiveCamera(55,innerWidth/innerHeight,0.1,800);camera.rotation.order='YXZ';
const rig=new THREE.Group();rig.add(camera);scene.add(rig);
const hemi=new THREE.HemisphereLight(LC(0x9fb4e6),LC(HEMI_GROUND),HEMI_I);scene.add(hemi);
const key=new THREE.DirectionalLight(LC(0xfff1dc),KEY_I);key.position.set(-45,85,35);key.target.position.set(0,0,-38);scene.add(key,key.target);
key.castShadow=true;Object.assign(key.shadow.camera,{left:-75,right:75,top:75,bottom:-75,near:10,far:260});key.shadow.mapSize.set(2048,2048);key.shadow.bias=-.0004;key.shadow.normalBias=.03;key.shadow.intensity=KEY_SHADOW_I;
const fill=new THREE.DirectionalLight(LC(0xd6e2ff),FILL_I);fill.position.set(60,55,-110);scene.add(fill);
/* sky dome */
const skyU={horizon:TSL.uniform(new THREE.Vector3(...SKY_HORIZON)),zenith:TSL.uniform(new THREE.Vector3(...SKY_ZENITH)),glow:TSL.uniform(new THREE.Vector3(...SKY_GLOW)),beam:TSL.uniform(BEAM_DEFAULT)};
{const {positionLocal,normalize,clamp:tc,mix,vec3,pow,exp,float}=TSL;const p=normalize(positionLocal),h=tc(p.y,0,1);
  const c=mix(skyU.horizon,skyU.zenith,pow(h,.45)).add(skyU.glow.mul(exp(h.mul(-14))));
  const m=new THREE.MeshBasicNodeMaterial({side:THREE.BackSide,depthWrite:false,fog:false});m.colorNode=c;scene.add(new THREE.Mesh(new THREE.SphereGeometry(520,32,16),m))}

/* field texture */
const GROUND_FADE_NEAR=25,GROUND_FADE_FAR=70,GROUND_FADE_MAX=.85,GROUND_CHECK_M=9,GROUND_CHECK_K=.035;/* #132 item 3 */
const CHALK_SCUFFS=420,FIELD_WEAR_R=30,BOX_SCUFFS=160,BASE_DUST=60,DIRT_RGB='122,88,58';
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
  /* #150 round 2: worn chalk, dusty bases, plate and rubber. Dirt-coloured dabs (fixed LCG, same park every load): CHALK_SCUFFS along each
     foul line inside FIELD_WEAR_R, heavier rub-out on the batter's boxes, a dusting on each base, the plate and the rubber. */
  {let r=4242;const R=()=>(r=(r*1103515245+12345)&0x7fffffff)/0x7fffffff,dab=(x,z,rad,n,a,col)=>{for(let i=0;i<n;i++){const t=R()*6.283,d=Math.sqrt(R())*rad,s=(.03+R()*.09)*S;
      g.fillStyle=`rgba(${col},${a*(.4+R()*.6)})`;g.fillRect(X(x+Math.cos(t)*d)-s/2,Y(z+Math.sin(t)*d)-s/2,s,s*(.5+R()))}};
    for(const s of [-1,1])for(let i=0;i<CHALK_SCUFFS;i++){const L=R()*FIELD_WEAR_R;dab(s*L*Math.SQRT1_2,-L*Math.SQRT1_2,.12,1,.55,DIRT_RGB)}
    for(const x of [-1.05,1.05])dab(x,-.1,1.1,BOX_SCUFFS,.6,DIRT_RGB);
    for(const [x,z] of [[19.4,-19.4],[0,-38.8],[-19.4,-19.4],[0,0]])dab(x,z,.24,BASE_DUST,.35,DIRT_RGB);
    dab(0,-18.42,.3,BASE_DUST,.4,DIRT_RGB)}
  try{const im=g.getImageData(0,0,c.width,c.height),d=im.data;let r=12345;for(let i=0;i<d.length;i+=4){r=(r*1103515245+12345)&0x7fffffff;const n=((r>>16)&31)-15;d[i]+=n;d[i+1]+=n*1.1;d[i+2]+=n*.7}g.putImageData(im,0,0)}catch(e){}
  try{FIELD_PIX={d:g.getImageData(0,0,c.width,c.height).data,w:c.width,h:c.height,X,Y}}catch(e){}
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.getMaxAnisotropy();FIELD_CV={c,g,X,Y,S,t};return t;
}
let FIELD_PIX=null,FIELD_CV=null;
const isGrassAt=(x,z)=>{const F=FIELD_PIX;if(!F)return false;const px=Math.round(F.X(x)),py=Math.round(F.Y(z));if(px<0||py<0||px>=F.w||py>=F.h)return false;const i=(py*F.w+px)*4;return F.d[i+1]-F.d[i]>18};
/* #203 item 5 slice 4: turf look per park (TURF below, picked by PARKS[id].shape.turf in applyPark). Uniforms only, so a park change does
   not recompile: grass and dirt colour gains, and `even` = how much of the grass's light/dark variation is flattened (artificial turf
   reads flatter; below 0 = patchier natural grass). Tier 0-3 ground only: on max props/field.js draws the field and ignores this. */
const turfU={grass:TSL.uniform(new THREE.Vector3(1,1,1)),dirt:TSL.uniform(new THREE.Vector3(1,1,1)),even:TSL.uniform(0)};
const ground=new THREE.Mesh(new THREE.PlaneGeometry(260,190),(()=>{const {texture,positionWorld,mx_fractal_noise_float:fn,vec2,vec3,float,clamp:tc,mix,smoothstep,uv,dot,normalMap}=TSL;
  const map=fieldTex(),m=new THREE.MeshStandardNodeMaterial({roughness:.95,metalness:0});const base=texture(map,uv()),w=positionWorld.xz;
  const isGrass=smoothstep(.02,.12,base.g.sub(base.r));/* Field map: more green than red = grass */
  const LUM=vec3(.2126,.7152,.0722),GR_MEAN=.118,DR_MEAN=.147;/* Mean texture luminance (linear) */
  /* Sample at two scales to reduce visible tiling */
  const gUV=w.div(2.6),gUV2=w.div(9.1).add(vec2(.37,.71)),dUV=w.div(3.2),dUV2=w.div(11.3).add(vec2(.13,.52));
  const gC=mix(texture(tex('grass_c',1),gUV),texture(tex('grass_c',1),gUV2),.35),dC=mix(texture(tex('dirt_c',1),dUV),texture(tex('dirt_c',1),dUV2),.35);
  const gK=dot(gC.rgb,LUM).div(GR_MEAN),dK=dot(dC.rgb,LUM).div(DR_MEAN);
  const big=fn(vec3(w.mul(.045),0),3,2,.5).mul(.12);
  /* #132 item 3: the fine albedo and normal detail fades with distance from the eye (GROUND_FADE_NEAR..FAR m), so the 8 deg look-down
     from centre field is not carpet; the mowing check (diagonal squares, GROUND_CHECK_K) is seen from any side and survives that shot. */
  const eyeD=positionWorld.sub(TSL.cameraPosition).length(),fade=smoothstep(GROUND_FADE_NEAR,GROUND_FADE_FAR,eyeD).mul(GROUND_FADE_MAX);
  const cu=w.x.add(w.y).div(GROUND_CHECK_M),cv=w.x.sub(w.y).div(GROUND_CHECK_M),chk=TSL.sin(cu.mul(Math.PI)).mul(TSL.sin(cv.mul(Math.PI))).sign().mul(GROUND_CHECK_K);
  const kRaw=mix(dK.add(big),mix(gK.add(big),float(1),turfU.even),isGrass);
  const k=tc(mix(kRaw,float(1).add(big),fade).add(chk.mul(isGrass)),.45,1.7);
  m.colorNode=base.rgb.mul(k).mul(mix(dC.rgb.div(vec3(.20,.14,.08)).mul(.25).add(.75),vec3(1),isGrass)).mul(mix(turfU.dirt,turfU.grass,isGrass));
  const nG=texture(tex('grass_n'),gUV),nD=texture(tex('dirt_n'),dUV);
  m.normalNode=normalMap(mix(nD,nG,isGrass),vec2(mix(float(1.2),float(.8),isGrass)).mul(float(1).sub(fade)));
  const oG=texture(tex('grass_orm'),gUV),oD=texture(tex('dirt_orm'),dUV);const orm=mix(oD,oG,isGrass);
  m.roughnessNode=tc(orm.g.mul(.3).add(.75),.82,1);/* Grass and dirt must be very matte: too glossy and backlight turns them into a white sheet */m.aoNode=mix(float(1),orm.r,.6);return m})());ground.name='old:field';ground.rotation.x=-Math.PI/2;ground.position.z=-55;ground.receiveShadow=true;scene.add(ground);
/* #150: code-generated surface detail (no download). genTex(size, w, h, fn) fills a canvas pixel by pixel: fn(u, v) -> [r, g, b] in 0..1.
   srgb = colour map; otherwise data (normal / roughness). Cached by key. */
/* #162: PARK_SHADERS = the shader side of #150 (noise on the outer ground and the stand concrete, painted-steel maps, pillowed pad normals).
   On again: switching it off did not change the time to the button on the owner's GPU (31.5 s off, 20-32 s on). ?off=park on the dev site turns it off.
   The canvas-only detail (chalk scuffs, pad seams, fascia lamps, ribs, seat tint) does not depend on it. */
const PARK_SHADERS=!OFF.has('park');
const GEN={};
function genTex(key,w,h,fn,srgb){if(GEN[key])return GEN[key];const c=document.createElement('canvas');c.width=w;c.height=h;const g=c.getContext('2d'),im=g.createImageData(w,h),d=im.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const p=fn((x+.5)/w,(y+.5)/h,x,y),i=(y*w+x)*4;d[i]=p[0]*255;d[i+1]=p[1]*255;d[i+2]=p[2]*255;d[i+3]=255}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;if(srgb)t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return GEN[key]=t}
function hashG(x,z,k){let h=Math.imul(x*73856093^z*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}/* same as hash2 below, hoisted */
const vnoise=(x,y,k,p)=>{/* tileable value noise, period p cells */const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  H=(a,b)=>hashG(((a%p)+p)%p,((b%p)+p)%p,k),a=H(xi,yi),b=H(xi+1,yi),c=H(xi,yi+1),e=H(xi+1,yi+1);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy};
/* Painted steel (light masts, scoreboard frame, backstop posts): grey with drip streaks and chips; same image is the roughness map (G) */
const PAINT_PX=128,PAINT_STREAK=.12,PAINT_CHIP=.94;
const paintTex=()=>!PARK_SHADERS?null:genTex('paint',PAINT_PX,PAINT_PX,(u,v)=>{const s=vnoise(u*24,v*3,21,24)*PAINT_STREAK,n=vnoise(u*16,v*16,22,16)*.08,chip=vnoise(u*40,v*40,23,40)>PAINT_CHIP?.25:0,k=.86-s-n-chip;return[k,k,k]},1);
/* Ground outside the park: the grass texture's light and shade on the dark outer colour, so it is not one flat sheet */
const OUTER_TILE=7,OUTER_BIG=.02;
const outerMat=!PARK_SHADERS?new THREE.MeshStandardMaterial({color:LC(0x1a2018),roughness:1}):(()=>{const {texture,positionWorld,mx_fractal_noise_float:fn,vec3,dot,color,clamp:tc}=TSL;const m=new THREE.MeshStandardNodeMaterial({roughness:1});const w=positionWorld.xz;
  const k=dot(texture(tex('grass_c',1),w.div(OUTER_TILE)).rgb,vec3(.2126,.7152,.0722)).div(.118).add(fn(vec3(w.mul(OUTER_BIG),0),3,2,.5).mul(.35));
  m.colorNode=color(LC(0x1a2018)).mul(tc(k,.5,1.6));return m})();
const outer=new THREE.Mesh(new THREE.PlaneGeometry(500,500),outerMat);outer.rotation.x=-Math.PI/2;outer.position.set(0,-.03,-55);scene.add(outer);
const AD_DARK_TEXT_LUM=.5,PAD_PER_BOARD=5,PAD_SCUFFS=900,PAD_BOARDS=6,AD_REPEAT=4,PAD_EDGE=.1,PAD_TOP=.06,PAD_BULGE=3;
const adC=document.createElement('canvas');adC.width=2048;adC.height=96;function drawAds(pad){const g=adC.getContext('2d');/* league boards plus one board per team (name on the team colour; dark text on a light colour) */
  const teamAd=T=>{const c=parseInt(T.css.slice(1),16),lum=(.2126*(c>>16)+.7152*(c>>8&255)+.0722*(c&255))/255;return[T.name,T.css,lum>AD_DARK_TEXT_LUM?'#06231f':'#ffffff']};
  const ads=[['雲端職棒',pad,'#f2c230'],...TEAMS.slice(0,2).map(teamAd),['CLOUD BASEBALL',pad,'#ffffff'],...TEAMS.slice(2,4).map(teamAd)];
  ads.forEach(([t,bg,fg],i)=>{const w=2048/ads.length;g.fillStyle=bg;g.fillRect(i*w,0,w,96);g.fillStyle=fg;g.textAlign='center';g.textBaseline='middle';let fs=54;do{g.font=`700 ${fs}px "Noto Sans TC",sans-serif`;fs-=2}while(g.measureText(t).width>w-40&&fs>20);g.fillText(t,i*w+w/2,50);g.fillStyle='rgba(0,0,0,.35)';g.fillRect(i*w+w-3,0,3,96)})
  /* #150 padding: PAD_PER_BOARD vinyl pads per board, a seam between pads, the top roll lit and the bottom scuffed by the warning track */
  const pw=2048/(ads.length*PAD_PER_BOARD);for(let x=pw;x<2048;x+=pw){g.fillStyle='rgba(0,0,0,.5)';g.fillRect(Math.round(x)-1,0,2,96);g.fillStyle='rgba(255,255,255,.07)';g.fillRect(Math.round(x)+1,0,1,96)}
  let gr=g.createLinearGradient(0,0,0,96);gr.addColorStop(0,'rgba(255,255,255,.10)');gr.addColorStop(.12,'rgba(0,0,0,0)');gr.addColorStop(.8,'rgba(0,0,0,0)');gr.addColorStop(1,'rgba(40,28,16,.45)');g.fillStyle=gr;g.fillRect(0,0,2048,96);
  let r=777;for(let i=0;i<PAD_SCUFFS;i++){r=(r*1103515245+12345)&0x7fffffff;const x=r%2048;r=(r*1103515245+12345)&0x7fffffff;const y=96-(r%30),a=.08+(r%7)/60;g.fillStyle=`rgba(70,52,34,${a})`;g.fillRect(x,y,3+(r%9),2+(r%4))}}
drawAds('#1d4d2a');
const adTex=new THREE.CanvasTexture(adC);adTex.colorSpace=THREE.SRGBColorSpace;adTex.wrapS=THREE.RepeatWrapping;adTex.repeat.set(-4,1);
const fence=new THREE.Mesh(new THREE.CylinderGeometry(110,110,3,96,1,true,Math.PI*.75,Math.PI/2),new THREE.MeshStandardMaterial({map:adTex,side:THREE.DoubleSide,roughness:.7,emissive:0xffffff,emissiveMap:adTex,emissiveIntensity:.25}));fence.name='old:wall';fence.position.y=1.5;scene.add(fence);
{const bt=adTex.clone();bt.repeat.set(4,1);bt.needsUpdate=true;const fm=fence.material.clone();fm.map=bt;fm.emissiveMap=bt;fm.side=THREE.FrontSide;fence.material.side=THREE.BackSide;const fb=new THREE.Mesh(fence.geometry,fm);fb.position.y=1.5;scene.add(fb)}/* A second, unmirrored ad on the back of the wall, so text reads correctly from the outfield stands */
/* #150 pillowed pads: height = rounded edges on every pad side, normal from its slope; one image column = one pad */
{const hp=(u,v)=>{const e=x=>{const a=Math.min(x,1-x);return a>PAD_EDGE?1:Math.sin(a/PAD_EDGE*Math.PI/2)};return e(u)*Math.min(1,v/PAD_TOP>1?1:Math.sin(v/PAD_TOP*Math.PI/2))},D=1/64;
 const padN=genTex('padN',32,64,(u,v)=>{const dx=(hp(u+D,v)-hp(u-D,v))*PAD_BULGE*D*8,dy=(hp(u,v+D)-hp(u,v-D))*PAD_BULGE*D*8,l=Math.hypot(dx,dy,1);return[.5-dx/l/2,.5+dy/l/2,.5+.5/l]});
 padN.repeat.set(PAD_BOARDS*PAD_PER_BOARD*AD_REPEAT,1);
 if(PARK_SHADERS)for(const o of scene.children)if(o.geometry===fence.geometry){o.material.normalMap=padN;o.material.normalScale.set(1,1);o.material.roughness=.6}}
/* #150 round 2: fence top and foul poles are painted steel (streaks, chips) instead of flat unlit yellow; YELLOW_GLOW keeps them reading at night */
const YELLOW_GLOW=.35,yellowPaint=new THREE.MeshStandardMaterial({color:0xf2c230,roughness:.55,metalness:.2,map:paintTex(),roughnessMap:paintTex(),emissive:0xf2c230,emissiveIntensity:YELLOW_GLOW,side:THREE.DoubleSide});
const fenceTop=new THREE.Mesh(new THREE.CylinderGeometry(110.05,110.05,.15,72,1,true,Math.PI*.75,Math.PI/2),yellowPaint);fenceTop.name='old:wall:top';fenceTop.position.y=3;scene.add(fenceTop);
for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.CylinderGeometry(.18,.18,18,8),yellowPaint);p.position.set(s*110*Math.SQRT1_2,9,-110*Math.SQRT1_2);p.name='old:foulpole:'+s;scene.add(p)}
/* Backstop: textured net (5 cm diamond mesh; mipmaps fade it to a thin veil at distance) plus top cable and posts */
const NET_W=40,NET_H=9,NET_Z=20,NET_CELL=.05,NET_OPACITY=.55;
const net=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const g=c.getContext('2d');g.strokeStyle='rgba(220,226,235,.85)';g.lineWidth=3;
  g.beginPath();g.moveTo(0,0);g.lineTo(64,64);g.moveTo(64,0);g.lineTo(0,64);g.stroke();
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(NET_W/NET_CELL,NET_H/NET_CELL);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;
  const m=new THREE.Mesh(new THREE.PlaneGeometry(NET_W,NET_H),new THREE.MeshBasicMaterial({map:t,transparent:true,opacity:NET_OPACITY,depthWrite:false,side:THREE.DoubleSide,fog:true}));
  m.name='old:backstop';m.position.set(0,NET_H/2,NET_Z);m.renderOrder=2;scene.add(m);
  const steel=new THREE.MeshStandardMaterial({color:LC(0x2a2f38),roughness:.7,metalness:.5,map:paintTex(),roughnessMap:paintTex()});
  for(const x of [-NET_W/2,-NET_W/6,NET_W/6,NET_W/2]){const pl=new THREE.Mesh(new THREE.CylinderGeometry(.09,.09,NET_H,8),steel);pl.name='old:backstop';pl.position.set(x,NET_H/2,NET_Z+.05);scene.add(pl)}
  const top=new THREE.Mesh(new THREE.CylinderGeometry(.025,.025,NET_W,6),steel);top.name='old:backstop';top.rotation.z=Math.PI/2;top.position.set(0,NET_H,NET_Z);scene.add(top);return m})();

/* stands + crowd */
/* #150 concrete wear: broad water stains (low noise) and rain streaks (noise stretched downwards) darken the tinted concrete */
const STAIN_F=.12,STAIN_K=.22,STREAK_XZ=1.4,STREAK_Y=.07,STREAK_K=.14;
const standMat=(()=>{const {triplanarTexture,texture,positionWorld,normalWorld,float,dot,vec3,clamp:tc,color,mx_fractal_noise_float:fn}=TSL;const m=new THREE.MeshStandardNodeMaterial({roughness:.9});
  const p=positionWorld,wear=float(1).sub(tc(fn(p.mul(STAIN_F),3,2,.5).add(.15),0,1).mul(STAIN_K)).sub(tc(fn(vec3(p.x.mul(STREAK_XZ),p.y.mul(STREAK_Y),p.z.mul(STREAK_XZ)),2,2,.5),0,1).mul(STREAK_K));
  const t=triplanarTexture(texture(tex('concrete_c',1)),null,null,float(.35),positionWorld,normalWorld);m.colorNode=color(LC(0x2a3246)).mul(tc(dot(t.rgb,vec3(.2126,.7152,.0722)).div(.31),.6,1.4)).mul(PARK_SHADERS?wear:1);
  const o=triplanarTexture(texture(tex('concrete_orm')),null,null,float(.35),positionWorld,normalWorld);m.roughnessNode=o.g;return m})(),seatMat=new THREE.MeshStandardMaterial({color:LC(0x16365c),roughness:.6,metalness:.3,map:paintTex(),roughnessMap:paintTex()});const fans=[];/* front rail: painted steel (#150 round 2) */
/* #33 scale, real stadium figures: seat width ~.5 m (was .82), row depth .9 m and rise .55 m (~31 deg rake, a steep lower bowl).
   Foul-line stands 16 m off the line and the backstop 24 m behind the plate are already in the real range (MLB backstop >= 18 m). */
const CROWD_EMPTY=.1,/* share of seats left empty */SEAT_W=.55,ROW_D=.9,ROW_RISE=.55,FRONT_H=1,BACK_WALL=4,RAIL_H=1.1;
/* #150 round 3: roof front = painted dark steel fascia carrying a row of lamp housings (was one flat unlit cream bar); ribs under the roof.
   The lamp row keeps the old cream glow so the roof line still reads at night. FASCIA_LAMP_M = metres per lamp. */
const FASCIA_H=.9,FASCIA_LAMP_M=2.4,FASCIA_GLOW=2.2,RIB_GAP=6,RIB_W=.25,RIB_H=.55;
const fasciaTex=genTex('fascia',64,32,(u,v)=>{const dx=Math.abs(u-.5)/.3,dy=Math.abs(v-.62)/.16,lamp=dx<1&&dy<1?1-.5*Math.max(dx,dy)**4:0,seam=u<.03||u>.97?.6:1,band=v<.12?.75:1,k=(.8+.2*vnoise(u*8,v*4,31,8))*seam*band;return[Math.max(k*.35,lamp),Math.max(k*.35,lamp),Math.max(k*.35,lamp)]},1);
const fasciaGlow=genTex('fasciaG',64,32,(u,v)=>{const dx=Math.abs(u-.5)/.3,dy=Math.abs(v-.62)/.16,l=dx<1&&dy<1?1:0;return[l,l,l]},1);
const fasciaMat0=new THREE.MeshStandardMaterial({color:LC(0x9aa3b5),roughness:.65,metalness:.4,map:fasciaTex,roughnessMap:paintTex(),emissive:0xfff3d6,emissiveMap:fasciaGlow,emissiveIntensity:FASCIA_GLOW}),FASCIA_M={};
const fasciaMat=L=>{if(FASCIA_M[L])return FASCIA_M[L];const m=fasciaMat0.clone();for(const t of ['map','emissiveMap']){m[t]=m[t].clone();m[t].repeat.set(Math.round(L/FASCIA_LAMP_M),1);m[t].needsUpdate=true}return FASCIA_M[L]=m};
const ribGeo=d=>new THREE.BoxGeometry(RIB_W,RIB_H,d),ribMat=new THREE.MeshStandardMaterial({color:LC(0x3a4256),roughness:.8,metalness:.3,map:paintTex(),roughnessMap:paintTex()}),ribO=new THREE.Object3D();
function stand(px,pz,rotY,len,rows,side,roof,base=0){
  const g=new THREE.Group();g.name='stand';g.userData.stand={px,pz,rotY,len,rows,side,roof,base};g.position.set(px,0,pz);g.rotation.y=rotY;scene.add(g);
  for(let r=0;r<rows;r++){const h=base+FRONT_H+r*ROW_RISE,d=r*ROW_D+ROW_D/2;const b=new THREE.Mesh(new THREE.BoxGeometry(len,h,ROW_D),standMat);b.name='old:seats';b.position.set(0,h/2,d);g.add(b);
    for(let x=-len/2+.4;x<len/2-.3;x+=SEAT_W)fans.push({g,x,y:h,z:d,side,empty:Math.random()<CROWD_EMPTY})}
  const top=base+FRONT_H+rows*ROW_RISE,w=new THREE.Mesh(new THREE.BoxGeometry(len,top+BACK_WALL,1),standMat);w.name='old:seats:back';w.position.set(0,(top+BACK_WALL)/2,rows*ROW_D+.5);g.add(w);
  const rail=new THREE.Mesh(new THREE.BoxGeometry(len,RAIL_H,.25),seatMat);rail.name='old:seats:rail';rail.position.set(0,base+RAIL_H/2,-.1);g.add(rail);
  if(roof){const rf=new THREE.Mesh(new THREE.BoxGeometry(len+2,.5,rows*.9+6),standMat);rf.name='old:roof';rf.position.set(0,top+8,rows*.45-2);rf.rotation.x=-.08;g.add(rf);
    const lip=new THREE.Mesh(new THREE.BoxGeometry(len+2,FASCIA_H,.25),fasciaMat(len+2));lip.name='old:roof:fascia';lip.position.set(0,top+7.4-FASCIA_H/2+.12,-4.9);g.add(lip);
    const n=Math.floor((len+2)/RIB_GAP),ribs=new THREE.InstancedMesh(ribGeo(rows*.9+6),ribMat,n);/* #150 round 3: steel ribs under the roof, one draw call per stand */
    for(let i=0;i<n;i++){ribO.position.set(-(len+2)/2+RIB_GAP*(i+.5),-.25-RIB_H/2,0);ribO.updateMatrix();ribs.setMatrixAt(i,ribO.matrix)}
    rf.add(ribs)}
  g.updateMatrixWorld(true);
}
const Q=Math.PI/4;
stand(0,24,0,48,16,2,true);stand(46.7,-24.1,Q,72,14,1,true);stand(-46.7,-24.1,-Q,72,14,0,true);
/* Outfield bleachers start right behind the 3 m fence (110 m) with the front row above its top, as in a real park; they used to sit 6 m back
   at ground level, so the first rows peeked over the wall and made it look small. */
const OF_R=111.5,OF_BASE=2.4,OF_ROWS=10,OF_SEAT_ROW=5;
for(let a=-40;a<=40;a+=10){const t=a*Math.PI/180;stand(Math.sin(t)*OF_R,-Math.cos(t)*OF_R,Math.atan2(Math.sin(t),-Math.cos(t)),20,OF_ROWS,a<0?0:a>0?1:2,false,OF_BASE)}
/* #215: polished props (render/props/, materials in render/pbr.js) swap in on the tiers props/index.js allows; any failure keeps the old park.
   #237: every old park mesh a slot replaces is named old:<slot>[:<part>] above (field, wall, foulpole, backstop, seats, roof, towers, scoreboard);
   polish rounds never edit this file: an object file finds its old meshes with ctx.old('<slot>'). */
{const PROPS_POLL_MS=1000,url=new URL('props/index.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href;/* max only (#215 10:30): nothing is fetched until max is on; gfxMax is declared further down, so the first look waits a tick */
  const go=()=>{let on=false;try{on=gfxMax}catch(e){}if(!on)return void setTimeout(go,PROPS_POLL_MS);import(url).then(M=>M.mountProps({scene,tier:()=>gfxTier,max:()=>gfxMax,dugout,park:()=>PARKS[parkCur&&parkCur.id]||PARK_DEFAULT})).catch(err=>console.warn('props off',err))};setTimeout(go,0)}
/* #214 item 2 part 2: sky occlusion baked into the old stands (render/skyocc_stands.js), max only: nothing is fetched before max is on; bakes once, then follows gfxMax (off = the old material). `?off=skyocc`. Any failure keeps the old look. */
{const SKYOCC_POLL_MS=1000,url=new URL('skyocc_stands.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href;let ctl=null,loading=false;
  const go=()=>{let on=false;try{on=gfxMax&&!OFF.has('skyocc')}catch(e){}
    if(ctl)ctl.apply(on);else if(on&&!loading){loading=true;import(url).then(M=>{ctl=M.mountSkyOcc({THREE,TSL,scene,standMat});ctl.apply(true)}).catch(err=>console.warn('skyocc off',err))}
    setTimeout(go,SKYOCC_POLL_MS)};setTimeout(go,0)}
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
/* #150 (owner 11/22 「挪」): the centre-field block in front of the batter's eye (render/props/batterseye.js, EYE.HALF 7.5 deg) is closed: no seat or fan
   within EYE_CLEAR_DEG of the CF line, so the batter's sightline to the release point lands on empty stand. Fans' geometry elsewhere untouched. */
const EYE_CLEAR_DEG=7.5;
for(let i=fans.length-1;i>=0;i--)if(fans[i].wz<0&&Math.abs(Math.atan2(fans[i].wx,-fans[i].wz))<EYE_CLEAR_DEG*Math.PI/180&&Math.hypot(fans[i].wx,fans[i].wz)>OF_R-1)fans.splice(i,1);
const wrapPI=a=>Math.atan2(Math.sin(a),Math.cos(a)),people=fans.filter(f=>!f.empty);
for(let i=people.length-1;i>0;i--){const j=(Math.random()*(i+1))|0;[people[i],people[j]]=[people[j],people[i]]}/* random order: a lower quality tier draws a prefix, i.e. a random subset */
people.forEach((f,i)=>f.pi=i);const cheerers=people.filter(()=>Math.random()<CROWD_CHEER_SHARE);
const seats=new THREE.InstancedMesh(seatGeo,new THREE.MeshStandardMaterial({color:LC(0x1d4f8f),roughness:.55}),fans.length);seats.name='old:seats:chair';
/* #150 round 3: moulded seats are not one flat blue: each seat a little lighter or darker (SEAT_VAR), higher rows sun-faded (SEAT_FADE per metre),
   a few newer replacement seats (SEAT_NEW share). Seats only: the people on them are untouched. */
const SEAT_VAR=.16,SEAT_FADE=.018,SEAT_NEW=.03;
fans.forEach((f,i)=>{const h=hashG(i,7,41),fade=Math.min(.3,Math.max(0,f.wy-2)*SEAT_FADE);/* instance colour multiplies the base blue: lifting red and green more than blue greys it out like sun-bleached plastic */
  if(h<SEAT_NEW)col.setRGB(1.25,1.25,1.25);else col.setRGB(1+fade*2.5,1+fade*1.5,1+fade*.6).multiplyScalar(1-SEAT_VAR/2+SEAT_VAR*hashG(i,9,43));seats.setColorAt(i,col)});
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
const TOWER_I=.16*Math.PI,BEAM_K=BEAM_DEFAULT,TOWER_ANGLE=.6,TOWER_PENUMBRA=1,TOWER_AIM=[0,-24],TOWER_AIM_K=.1;/* Keep only a hint of light beam, so the camera passing through it does not white out */
const lampMat=new THREE.MeshBasicMaterial({color:new THREE.Color(...LAMP_RGB),toneMapped:false}),mast=new THREE.MeshStandardMaterial({color:LC(0x3a4256),roughness:.8,metalness:.3,map:paintTex(),roughnessMap:paintTex()});
const glowC=document.createElement('canvas');glowC.width=glowC.height=128;{const g=glowC.getContext('2d'),gr=g.createRadialGradient(64,64,0,64,64,64);gr.addColorStop(0,'rgba(255,248,230,1)');gr.addColorStop(.18,'rgba(255,240,210,.55)');gr.addColorStop(1,'rgba(255,230,190,0)');g.fillStyle=gr;g.fillRect(0,0,128,128)}
/* #255: both lamp sprites fade out near the camera (render/lampfade.js; uniforms start at the same numbers until it loads) */
const lampNear=TSL.uniform(45),lampFar=TSL.uniform(140),lampFadeN=()=>TSL.smoothstep(lampNear,lampFar,TSL.length(TSL.positionView));
import(new URL('lampfade.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{lampNear.value=M.LAMP_FADE_NEAR;lampFar.value=M.LAMP_FADE_FAR}).catch(err=>console.warn('lamp fade defaults',err));
const glowMat=(()=>{const m=new THREE.SpriteNodeMaterial({blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,fog:false});m.colorNode=TSL.texture(new THREE.CanvasTexture(glowC)).mul(lampFadeN());m.toneMapped=false;return m})();
/* #208 item 2, light you can see: on max the beams are stronger (BEAM_MAX_K) and carry slow drifting dust (3D noise scrolled by time: decoration,
   like the bugs), each lamp gets a wide aureole in the haze (haloMat) and dust motes drift through every beam (motes). Below max: the old faint beam and a fainter aureole. */
const BEAM_MAX_K=2.4,BEAM_DUST=.9,BEAM_DUST_SCALE=.09,BEAM_DUST_DRIFT=.35,HALO_SCALE=95,HALO_LOW=.35,MOTE_PER=140,MOTE_CORE=.45,MOTE_FALL=.18;
const beamK=TSL.uniform(1).onFrameUpdate(()=>gfxMax?BEAM_MAX_K:1),dustK=TSL.uniform(0).onFrameUpdate(()=>gfxMax?BEAM_DUST:0);
const beamMat=(()=>{const {uv,pow,abs,dot,normalView,positionViewDirection,vec4,vec3,color,positionView,positionWorld,length,smoothstep,mx_noise_float,time}=TSL;const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide,fog:false});
  const e=pow(abs(dot(normalView,positionViewDirection)),2),dust=mx_noise_float(positionWorld.mul(BEAM_DUST_SCALE).add(vec3(time.mul(BEAM_DUST_DRIFT*.6),time.mul(-BEAM_DUST_DRIFT),time.mul(BEAM_DUST_DRIFT*.3)))).mul(dustK).add(1).max(0);
  m.colorNode=vec4(color(LC(0xfff0d0)).mul(pow(uv().y,2.2)).mul(e).mul(skyU.beam).mul(beamK).mul(dust).mul(smoothstep(45,130,length(positionView))),1);return m})();/* Fade out near the camera, so being inside a beam does not white out */
const haloK=TSL.uniform(0).onFrameUpdate(()=>skyCur.halo*(gfxMax?1:HALO_LOW));
const haloMat=(()=>{const m=new THREE.SpriteNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});const t=new THREE.CanvasTexture(glowC);
  m.colorNode=TSL.texture(t).mul(haloK).mul(lampFadeN());m.toneMapped=false;return m})();
const towerSpots=[];
for(const [x,z] of [[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]]){const m=new THREE.Mesh(new THREE.CylinderGeometry(.5,.8,46,8),mast);m.name='old:towers';m.position.set(x,23,z);scene.add(m);
  const l=new THREE.Mesh(new THREE.BoxGeometry(9,4,.6),lampMat);l.name='old:towers:lamp';l.position.set(x,46,z);l.lookAt(0,0,-45);scene.add(l);
  const gl=new THREE.Sprite(glowMat);gl.position.set(x,46,z);gl.scale.set(30,30,1);scene.add(gl);
  const ha=new THREE.Sprite(haloMat);ha.position.set(x,46,z);ha.scale.set(HALO_SCALE,HALO_SCALE,1);scene.add(ha);
  const lamp=new THREE.Vector3(x,46,z),tgt=new THREE.Vector3(x*.15,0,-40+(z+40)*.15),aim=new THREE.Vector3(TOWER_AIM[0]+x*TOWER_AIM_K,0,TOWER_AIM[1]+(z-TOWER_AIM[1])*TOWER_AIM_K),dir=lamp.clone().sub(tgt),L=dir.length();
  const beam=new THREE.Mesh(new THREE.ConeGeometry(L*.32,L,32,1,true),beamMat);beam.position.copy(lamp.clone().add(tgt).multiplyScalar(.5));beam.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),dir.normalize());scene.add(beam);
  /* Light-tower spots: lit areas and dark corners (no shadows, for performance; the key light still casts the main shadow) */
  const spot=new THREE.SpotLight(LC(0xfff2dc),TOWER_I,0,TOWER_ANGLE,TOWER_PENUMBRA,0);spot.position.copy(lamp);spot.target.position.copy(aim);scene.add(spot,spot.target);towerSpots.push(spot)}
const sg=new THREE.BufferGeometry(),sp=[];for(let i=0;i<600;i++){const a=Math.random()*6.28,e=.15+Math.random()*1.2;sp.push(Math.cos(a)*Math.cos(e)*420,Math.sin(e)*420,Math.sin(a)*Math.cos(e)*420)}
sg.setAttribute('position',new THREE.Float32BufferAttribute(sp,3));const stars=new THREE.Points(sg,new THREE.PointsMaterial({color:0xaab8d8,size:1.1,fog:false,sizeAttenuation:true}));scene.add(stars);
/* Bugs under the lights: a cloud of small dots in front of each tower, flying around (pure decoration, unrelated to the game) */
const BUG_PER=70,BUG_R=5,BUG_SIZE=.18,LAMPS=[[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]];
const bugs=(()=>{const n=LAMPS.length*BUG_PER,pos=new Float32Array(n*3),seed=[];let r=7;const rnd=()=>(r=(r*16807)%2147483647)/2147483647;
  for(let i=0;i<n;i++){const [x,z]=LAMPS[Math.floor(i/BUG_PER)],to=new THREE.Vector3(-x,-46,-45-z).normalize();seed.push({c:[x+to.x*4,46+to.y*4,z+to.z*4],a:rnd()*6.28,b:rnd()*6.28,w1:.6+rnd()*1.4,w2:.5+rnd()*1.2,r:.5+rnd()*BUG_R,h:rnd()})}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
  const pts=new THREE.Points(g,new THREE.PointsMaterial({color:new THREE.Color(3,2.8,2.2),size:BUG_SIZE,sizeAttenuation:true,transparent:true,opacity:.9,depthWrite:false,blending:THREE.AdditiveBlending,toneMapped:false,fog:false}));
  pts.frustumCulled=false;scene.add(pts);return{pts,pos,seed}})();
/* #208 motes (max only): MOTE_PER points in the core of each tower beam (between 20 % and 90 % of the way down), sinking slowly and swirling; seeded, no Math.random */
const moteK=TSL.uniform(0).onFrameUpdate(()=>envOn&&gfxMax?skyCur.motes:0);/* max only: on WebGL the points draw as big flakes (snow) */
const motes=(()=>{const n=LAMPS.length*MOTE_PER,pos=new Float32Array(n*3),seed=[];let r=11;const rnd=()=>(r=(r*16807)%2147483647)/2147483647;
  for(let i=0;i<n;i++){const [x,z]=LAMPS[Math.floor(i/MOTE_PER)],lamp=new THREE.Vector3(x,46,z),tgt=new THREE.Vector3(x*.15,0,-40+(z+40)*.15),f=.2+rnd()*.7,c=lamp.clone().lerp(tgt,f),R=lamp.distanceTo(tgt)*.32*f*MOTE_CORE*Math.sqrt(rnd());
    seed.push({c:[c.x,c.y,c.z],R,a:rnd()*6.28,w:(.05+rnd()*.12)*(rnd()<.5?-1:1),h:rnd()*8,ph:rnd()*6.28})}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));const m=new THREE.PointsNodeMaterial({transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,fog:false});
  m.colorNode=TSL.color(new THREE.Color(2.4,2.2,1.8)).mul(moteK);m.toneMapped=false;const pts=new THREE.Points(g,m);pts.frustumCulled=false;scene.add(pts);return{pts,pos,seed}})();
function updateMotes(t){const {pos,seed}=motes;for(let i=0;i<seed.length;i++){const q=seed[i],a=q.a+t*q.w,y=((q.h-t*MOTE_FALL)%8+8)%8-4;
  pos[i*3]=q.c[0]+Math.cos(a)*q.R;pos[i*3+1]=q.c[1]+y+Math.sin(t*.4+q.ph)*.3;pos[i*3+2]=q.c[2]+Math.sin(a)*q.R}
  motes.pts.geometry.attributes.position.needsUpdate=true}
function updateBugs(t){const {pos,seed}=bugs;for(let i=0;i<seed.length;i++){const q=seed[i],a=q.a+t*q.w1,b=q.b+t*q.w2;
  pos[i*3]=q.c[0]+Math.cos(a)*q.r+Math.sin(t*7+i)*.15;pos[i*3+1]=q.c[1]+Math.sin(b)*q.r*.6;pos[i*3+2]=q.c[2]+Math.sin(a)*q.r*Math.cos(b)}
  bugs.pts.geometry.attributes.position.needsUpdate=true;if(skyCur.motes&&gfxMax)updateMotes(t)}/* motes ride the bugs' call: tiers 0-1 only (envOn) */
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
let MB_SAMPLES=8;/* from render/mblur.js once loaded */
const dofU={};/* uniforms of the depth-of-field pass (#211 item 4); filled by dofInit once TSL is there, driven by dofFrame */
try{const {uniform}=TSL;dofU.focus=uniform(1);dofU.len=uniform(1);dofU.scale=uniform(0)}catch(e){console.warn('dof uniforms',e)}
const mbU={};/* uniforms of the motion-blur pass (#211 item 4, render/mblur.js); driven by mbFrame */
try{const {uniform}=TSL;mbU.scale=uniform(0);mbU.cap=uniform(.02)}catch(e){console.warn('mb uniforms',e)}
const finU={};/* uniforms of the video finish (#209 item 3, render/finish.js); knee 99 / amount 0 = pass-through until the module is loaded */
try{const {uniform}=TSL;finU.knee=uniform(99);finU.max=uniform(100);finU.amt=uniform(0);finU.f=uniform(0);finU.lift=uniform(0)}catch(e){console.warn('finish uniforms',e)}
/* #211 item 3, max only: SSGI (bounce light from grass and dirt onto uniforms; its own AO replaces GTAO) and SSR on glossy surfaces.
   fxKey says which max passes this PP was built with, so a module that loads later (or fails) rebuilds exactly once. */
const fxKey=()=>gfxMax&&HQ?[['traa','t'],['ssgi','g'],['ssr','r'],['dof','d'],['motionBlur','m']].map(([k,l])=>FX[k]&&!OFF.has(k)?l:'-').join(''):'';/* 'tgrdm' = all five, '-' = not loaded or ?off= */
/* #267: side targets blend like the material (opaque: no blending, as before), so a see-through overlay can leave the ground's normal, albedo
   and velocity under it by writing alpha 0 there (contact shadows, csMrt). Outputs with alpha 1 (normalView, velocity) still replace. */
const MRT_KEEP=['normal','diffuse','velocity'];
function setupPost(){try{const {int,pass,mrt,output,normalView,velocity,screenUV,length,smoothstep,mix,float,renderOutput,vec4,diffuseColor,metalness,roughness,step,blendColor}=TSL;
  const key=fxKey(),mx=key[0]==='t',gi=key[1]==='g',sr=key[2]==='r',df=key[3]==='d',mb=mx&&key[4]==='m',pp=new THREE.RenderPipeline(renderer),sp=pass(scene,camera,mx||HQ?{samples:0}:{});let c;/* #211: TRAA needs MSAA off in the scene pass. #236 A1: so do GTAO and SSGI (their textureGather needs a single-sample depth; on a real GPU a multisampled one failed renderPipeline_GTAO every frame); FXAA covers the edges */
  if(HQ){/* WebGPU allows 32 colour bytes per pixel (four 8-byte targets), so the SSR inputs ride in spare channels: normal.a = gloss mask
      (SSR's metalness input: 0, skipped, unless the surface is smoother than MAX_SSR_ROUGH: helmets, wet or polished props), diffuse.a = roughness */
    const ch={output,normal:sr?vec4(normalView,step(roughness,float(MAX_SSR_ROUGH)).mul(metalness.max(MAX_SSR_F0))):normalView};if(mx)ch.velocity=velocity;
    if(gi||sr)ch.diffuse=vec4(diffuseColor.rgb,roughness);const M=mrt(ch),kb=new THREE.BlendMode(THREE.MaterialBlending);MRT_KEEP.forEach(n=>{if(ch[n])M.setBlendMode(n,kb)});sp.setMRT(M);if(ch.diffuse)sp.getTexture('diffuse').type=THREE.UnsignedByteType;/* 8-bit is enough here */
    const dep=sp.getTextureNode('depth'),nor=sp.getTextureNode('normal');c=sp.getTextureNode('output');
    if(gi){const g=FX.ssgi(c,dep,nor,camera);g.sliceCount.value=MAX_GI_SLICES;g.stepCount.value=MAX_GI_STEPS;g.radius.value=MAX_GI_RADIUS;g.giIntensity.value=MAX_GI_I;g.aoIntensity.value=MAX_GI_AO;
      /* #256: bounce light is capped at MAX_GI_CAP before it meets the albedo, so a white plate, bag or chalk line next to lit dirt can not
         climb past the bloom threshold (1.6) on bounce alone; at MAX_GI_I 4 a white surface got ~4x its neighbours' light and bloomed into blobs */
      c=vec4(c.rgb.mul(g.a).add(sp.getTextureNode('diffuse').rgb.mul(g.rgb.min(float(MAX_GI_CAP)))),c.a)}
    else{const aoN=FX.ao(dep,nor,camera);aoN.resolutionScale=gfxMax?MAX_AO_RES:AO_RES;aoN.radius.value=.6;aoN.distanceFallOff.value=1;
      c=vec4(c.rgb.mul(mix(float(.35),float(1),aoN.getTextureNode().sample(screenUV).r)),c.a)}
    if(sr){const r=FX.ssr(sp.getTextureNode('output'),dep,nor,{metalnessNode:nor.a,roughnessNode:sp.getTextureNode('diffuse').a,camera});
      r.resolutionScale=MAX_SSR_RES;r.maxDistance.value=MAX_SSR_DIST;r.thickness.value=MAX_SSR_THICK;r.quality.value=MAX_SSR_Q;c=blendColor(c,r)}
    if(df)c=FX.dof(c,sp.getViewZNode('depth'),dofU.focus,dofU.len,dofU.scale);/* #211 item 4: scale 0 outside the tight and plate shots = pass-through */
    if(mb){const v=sp.getTextureNode('velocity').xy.mul(mbU.scale);c=FX.motionBlur(c,v.mul(mbU.cap.div(length(v).max(mbU.cap))),int(MB_SAMPLES))}/* #211 item 4: scale 0 outside the shots = pass-through; streak capped */
    if(mx)c=FX.traa(c,dep,sp.getTextureNode('velocity'),camera)}
  else c=sp.getTextureNode();
  c=c.add(FX.bloom(c,.3,.3,1.6));
  if(gfxMax&&HQ&&finU.knee&&!OFF.has('finish')){/* #209 item 3, max only, no extra pass: highlight roll-off (same maths as finish.js roll) and film grain (hash of the pixel and the 24/s grain frame) */
    const {select,exp,fract,sin,dot,vec2,screenCoordinate}=TSL,K=finU.knee,R=finU.max.sub(K),LF=finU.lift,rl0=v=>v.mul(float(1).sub(LF)).add(LF),rl=v0=>{const v=rl0(v0);return select(v.greaterThan(K),K.add(R.mul(float(1).sub(exp(v.sub(K).negate().div(R))))),v)},
      gr=fract(sin(dot(screenCoordinate.xy.add(finU.f.mul(vec2(37.2,17.9))),vec2(12.9898,78.233))).mul(43758.5453)).sub(.5).mul(finU.amt.mul(2));
    c=vec4(rl(c.r).add(gr),rl(c.g).add(gr),rl(c.b).add(gr),c.a)}
  const d=length(screenUV.sub(.5));c=vec4(c.rgb.mul(mix(float(1),float(.7),smoothstep(.3,.85,d))),1);
  pp.outputColorTransform=false;pp.outputNode=mx?renderOutput(c):FX.fxaa(renderOutput(c));pp.scenePass=sp;pp.max=gfxMax;pp.fx=key;return pp}catch(e){console.error('post',e);return null}}
let gfxLow=false;try{gfxLow=localStorage.getItem('zu_gfx')==='low'}catch(e){}
/* ---------- max tier (#211): the owner's desktop, above tier 0 ----------
   Dev site only: ?q=max (or the 畫面 button's 最高 step) turns it on and zu_max remembers it; ?q=<anything else> turns it off. WebGPU backend
   only: on the WebGL fallback the wish is kept but nothing changes (🐞 tier=0(max-gl)). While on: tier 0 at the screen's native pixel ratio,
   no automatic drop, TRAA instead of FXAA, full-resolution AO, a MAX_SHADOW_MAP key shadow map with a wider PCF radius, image-based light from
   the sky (skyEnv). TRAA's module is fetched only when max is on, so the default download does not grow. Tiers 0-3 are untouched. */
const IS_GPU=!!(renderer.backend&&renderer.backend.isWebGPUBackend),IS_DEV=!!(window.SITE&&window.SITE.dev);
/* SSGI presets: three's "medium with temporal filtering" (TRAA is on); radius in metres. #256: MAX_GI_I 1 = bounce equal to the light the
   neighbours send (was 4: four times that), MAX_GI_CAP = most bounce light one pixel takes (direct ~1.06 on the plate + .45 stays under bloom's 1.6). SSR: half resolution, rays up to MAX_SSR_DIST m. */
const MAX_GI_SLICES=2,MAX_GI_STEPS=8,MAX_GI_RADIUS=4,MAX_GI_I=1,MAX_GI_CAP=.45,MAX_GI_AO=1,MAX_SSR_ROUGH=.35,MAX_SSR_F0=.04,MAX_SSR_RES=.5,MAX_SSR_DIST=25,MAX_SSR_THICK=.05,MAX_SSR_Q=.5;
const MAX_SHADOW_MAP=4096,MAX_SHADOW_RADIUS=2.5,TIER_SHADOW_RADIUS=1,MAX_AO_RES=1,AO_RES=.5,MAX_IBL_I=.6,SKY_ENV_FAR=1000,SKY_ENV_MIN_R=400;
let maxWish=false;try{if(IS_DEV){const q=new URLSearchParams(location.search).get('q');if(q!==null)localStorage.setItem('zu_max',q==='max'?'1':'0');maxWish=localStorage.getItem('zu_max')==='1'}}catch(e){}
let gfxMax=maxWish&&IS_GPU&&HQ&&!gfxLow&&!OFF.has('post');
if(window.PL&&PL.SKIN)PL.SKIN.on=()=>gfxMax;/* #207: the real skin maps follow max (players.js polls it; nothing extra loads while max is off) */
const maxSave=v=>{maxWish=v;try{localStorage.setItem('zu_max',v?'1':'0')}catch(e){}};
/* the max modules are fetched only when max is on; each one may fail alone (max then keeps FXAA / GTAO / no reflections). ?off=traa,ssgi,ssr skips one on dev; a skipped one is not fetched */
const MAX_MODS=[['traa','TRAANode'],['ssgi','SSGINode'],['ssr','SSRNode'],['dof','DepthOfFieldNode'],['motionBlur','MotionBlur']];
const maxLoad=()=>Promise.all(MAX_MODS.map(([k,f])=>FX[k]||OFF.has(k)?0:import(`three/addons/tsl/display/${f}.js`).then(m=>{FX[k]=m[k]}).catch(e=>console.warn(`${f} failed to load; max goes on without it`,e))));
/* image-based light: the sky mesh is drawn alone into a PMREM. One entry point: applySky (#203 park skies) calls skyEnv() again after it changes the sky. */
let skyEnvRT=null;
function skySource(){let s=null;scene.traverse(o=>{const g=o.geometry&&o.geometry.parameters;if(!s&&o.isMesh&&o.material&&o.material.side===THREE.BackSide&&o.material.fog===false&&g&&g.radius>=SKY_ENV_MIN_R)s=o});return s}
function skyEnv(){if(skyEnvRT){skyEnvRT.dispose();skyEnvRT=null}scene.environment=null;if(!gfxMax)return;const sky=skySource();if(!sky)return;
  try{const sc=new THREE.Scene();sc.add(new THREE.Mesh(sky.geometry,sky.material));const g=new THREE.PMREMGenerator(renderer);skyEnvRT=g.fromScene(sc,0,1,SKY_ENV_FAR);g.dispose();
    scene.environment=skyEnvRT.texture;scene.environmentIntensity=MAX_IBL_I}catch(e){console.warn('sky env failed',e);scene.environment=null}}
window.skyEnv=skyEnv;
PP=gfxLow?null:setupPost();
if(gfxMax)maxLoad().then(()=>{if(gfxMax&&typeof setTier==='function')setTier(0)});
const gfxText=()=>{$('gfx').innerHTML=(gfxLow?'畫面：順暢':gfxMax?'畫面：最高':'畫面：精緻')+'<small>卡卡的就選順暢</small>'};gfxText();
$('gfx').onclick=()=>{
  /* dev: 精緻 -> 最高 (WebGPU only) -> 順暢 -> 精緻; production keeps the two steps */
  if(IS_DEV&&IS_GPU&&HQ&&!gfxLow&&!gfxMax){gfxMax=true;maxSave(true);gfxText();note('畫面最高：原生解析度、柔和陰影、不自動降畫質（給桌機）');
    maxLoad().then(()=>{if(gfxMax){setTier(0);tierT0=performance.now()}});return}
  if(gfxMax){gfxMax=false;maxSave(false)}
  gfxLow=!gfxLow;try{localStorage.setItem('zu_gfx',gfxLow?'low':'high')}catch(e){}PP=gfxLow?null:(PP||setupPost());if(typeof setTier==='function'){setTier(gfxLow?2:(IS_MOBILE?1:0));tierT0=performance.now()}gfxText();note(gfxLow?'畫面順暢：簡化光影，比較不卡':'畫面精緻：開啟完整光影')};
{const on=(()=>{try{return localStorage.getItem('zu_gl')==='1'}catch(e){return false}})();$('compat').setAttribute('aria-pressed',on);$('compat').textContent=on?'已切換相容畫面（點一下換回來）':'畫面怪怪的？點這裡';
 $('compat').onclick=()=>{try{localStorage.setItem('zu_gl',on?'0':'1')}catch(e){}note(on?'換回一般畫面，重新載入…':'改用相容畫面，重新載入…');setTimeout(()=>location.reload(),800)}}
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
 const back=new THREE.Mesh(new THREE.BoxGeometry(27,11,.6),mast);back.name='old:scoreboard';back.position.copy(sbMesh.position);back.quaternion.copy(sbMesh.quaternion);back.translateZ(-.35);scene.add(back);
 const leg=new THREE.Mesh(new THREE.BoxGeometry(2,SB_Y-5,1),mast);leg.name='old:scoreboard';leg.position.set(sbMesh.position.x,(SB_Y-5)/2,sbMesh.position.z);scene.add(leg)}
let sbKey='';
function drawBoard(s,txt){const k=s.sc.join()+txt;if(k===sbKey)return;sbKey=k;const g=sbC.getContext('2d');
  g.fillStyle='#05070d';g.fillRect(0,0,1024,400);g.font='600 64px "Noto Sans TC",sans-serif';g.textBaseline='middle';
  TEAMS.slice(0,2).forEach((T,i)=>{g.fillStyle=T.css;g.fillRect(40,70+i*120,18,80);const lg=logoImgs[T.id];if(lg&&lg.complete&&lg.naturalWidth)g.drawImage(lg,70,64+i*120,92,92);g.fillStyle='#fff';g.fillText(T.name,178,110+i*120);g.font='700 110px "Barlow Condensed",sans-serif';g.textAlign='right';g.fillStyle='#ffe28a';g.fillText(s.sc[i],980,112+i*120);g.textAlign='left';g.font='600 64px "Noto Sans TC",sans-serif'});
  g.fillStyle='#9aa6bd';g.font='500 44px "Noto Sans TC",sans-serif';g.fillText(txt,80,350);
  if(parkCur){const P=parkCur;g.strokeStyle=P.trimCss;g.lineWidth=SB_FRAME;g.strokeRect(SB_FRAME/2,SB_FRAME/2,1024-SB_FRAME,400-SB_FRAME);
    g.textAlign='right';g.fillStyle=P.trimCss;g.font='600 40px "Noto Sans TC",sans-serif';g.fillText(`主場・${P.home}`,980,350);g.textAlign='left'}
  sbTex.needsUpdate=true}
/* ---------- #203 home parks: one park, four skins. The home team of the game picks the wall pads, the fence-top and foul-pole paint,
   the scoreboard frame and three big wall logos (both power alleys and behind home plate). Colours only: no geometry, no new shader
   (materials are made once, the logo is drawn into one shared canvas), so a reskin never recompiles. ?park=<team id> forces one. ---------- */
/* power-alley logos are cut-out signs standing on the wall top (a 3 m wall would make them ~10 px from home plate) */
const SB_FRAME=14,PARK_LOGO_PX=512,PARK_LOGO_M=6,PARK_LOGO_R=109.85,PARK_LOGO_ALLEY=Math.PI/7,PARK_LOGO_Y=3+PARK_LOGO_M/2-.4,
  PLATE_LOGO_M=2.2,PLATE_LOGO_Y=1.4,PLATE_LOGO_Z=NET_Z-.15,PARK_LOGO_GLOW=.35;
/* pad = wall vinyl behind the league boards, trim = fence top, foul poles and scoreboard frame (team colour, lifted to read at night) */
const PARKS={
  pheasants:{pad:'#0d3a35',trim:0x5fd8c9,sky:'night'},
  owls:{pad:'#2a1436',trim:0xd58cf0,sky:'dusk'},
  macaques:{pad:'#47200f',trim:0xffa463,sky:'afternoon'},
  muntjacs:{pad:'#0e2450',trim:0x7fb0ff,sky:'morning'}};
/* #203 item 5: PARKS[id].shape = how the four parks differ in shape and surroundings (shape and size only: no real names or marks).
   Slice 1 reads `backdrop` only (the kit beyond the outfield and behind the stands, BACKDROPS below); stand levels, roof, bullpen,
   light towers are the next slice and join this block (slice 3 added `links`, slice 4 `turf`). The field and the engine never change. */
PARKS.pheasants.shape={backdrop:'hills',upper:'low',turf:'artificial'};/* 台北: hillside district, apartment blocks, hills behind; low two-level stands */
PARKS.owls.shape={backdrop:'city',upper:'block',links:'bridges',turf:'natural'};/* 新竹: dense town of row houses and mid-rise blocks, low hills far east; roofed four-level infield block,
   glazed bridges from the infield building to the outfield stands, a tight row of houses packed against the outfield stands */
PARKS.macaques.shape={backdrop:'lake',upper:'tall',turf:'sunbaked'};/* 高雄: a lake beyond the outfield, trees on its shore, low hills across; the tallest stands */
PARKS.muntjacs.shape={backdrop:'mountains',upper:'arcade',roof:false,turf:'redclay'};/* 台東: open sky, two mountain ridges; small park, arcade gallery on the home stand */
const PARK_DEFAULT={pad:'#1d4d2a',trim:0xf2c230,sky:'night',shape:{backdrop:null,upper:null,links:null,turf:'natural'}};
/* slice 4: turf looks (gains on the field map; 1 = as painted). artificial: 台北's synthetic carpet, cooler green, even; natural: as before;
   sunbaked: 高雄's natural grass in a hot afternoon, a touch yellow and patchier; redclay: 台東's 紅土 infield, much redder dirt. ?off=turf = natural. */
const TURF={natural:{grass:[1,1,1],dirt:[1,1,1],even:0},artificial:{grass:[.76,1.06,1.12],dirt:[1,1,1],even:.85},
  sunbaked:{grass:[1.28,1.04,.66],dirt:[1.06,1,.9],even:-.6},redclay:{grass:[1,1,1],dirt:[1.32,.8,.6],even:0}};
function applyTurf(P){const T=(!OFF.has('turf')&&TURF[P.shape&&P.shape.turf])||TURF.natural;turfU.grass.value.set(...T.grass);turfU.dirt.value.set(...T.dirt);turfU.even.value=T.even}
/* ---------- #203 item 5 slice 1: backdrop kits. Built once on first use (applyPark), then only shown or hidden: no recompile on a park change
   after the first. Four materials in all (ridge, block, tree, water); nothing casts or takes the key shadow. Buildings: instanced boxes, the
   windows are drawn by the material from world position (BD_FLOOR x BD_BAY cells, BD_LIT of them lit, lit strength follows the sky's lamp
   value: on at night, half at dusk, off by day). Angles: 0 = centre field (-z), as the outfield bleachers. ?off=backdrop (dev) = none. ---------- */
const BD_FLOOR=3.2,BD_BAY=3.4,BD_LIT=.42,BD_WIN_I=1.6,BD_WIN_C=0xffd9a8,BD_GLASS=.42,BD_BASE_Y=-6,BD_TOWER_GAP=12,BD_SEED=2030,
  BD_DAY_LAMP=.2;/* sky lamp value at or below which no window is lit */
const D2R=Math.PI/180;
const BACKDROPS={
  hills:{ridges:[{r:300,a:[-115,115],h:[38,82],c:0x1f3a22,seed:1},{r:250,a:[115,245],h:[22,46],c:0x1d3420,seed:2},{r:420,a:[-180,180],h:[70,120],c:0x2a4436,seed:3}],
    blocks:{n:70,r:[150,255],a:[[-110,110],[125,235]],w:[14,24],d:[10,16],h:[18,45],c:[0xb8b2a6,0x9a978f,0xcfc6b4,0x8c8a86]}},
  city:{ridges:[{r:440,a:[-180,180],h:[26,48],c:0x334034,seed:4}],
    blocks:{n:130,r:[135,215],a:[[-120,120],[120,240]],w:[6,9],d:[11,16],h:[9,16],c:[0xd8cdb8,0xbfb5a3,0xe2d9c8,0xa9a294,0xc9b79c]},
    blocks2:{n:34,r:[225,330],a:[[-100,100],[135,225]],w:[16,26],d:[14,22],h:[26,62],c:[0xb4b8bc,0x9ea4aa,0xc8c4ba]}},
  lake:{ridges:[{r:430,a:[-75,75],h:[34,60],c:0x41604a,seed:5},{r:380,a:[80,280],h:[14,30],c:0x3a5a40,seed:6}],
    water:{r:[146,395],a:[-68,68],c:0x355a66},trees:{n:260,r:[126,148],a:[[-80,80]],s:[4,8],c:[0x2f5a2a,0x3c6a30,0x27502a,0x4a7034]},
    trees2:{n:140,r:[395,412],a:[[-72,72]],s:[6,11],c:[0x2f5a2a,0x3c6a30,0x27502a]}},
  mountains:{ridges:[{r:330,a:[-180,180],h:[34,78],c:0x2c4a30,seed:7},{r:470,a:[-180,180],h:[100,170],c:0x3e5668,seed:8}],
    trees:{n:90,r:[126,150],a:[[-85,85]],s:[4,7],c:[0x2f5a2a,0x3c6a30,0x4a7034]}}};
const bdWinU=TSL.uniform(1),bdKits={};let bdMats=null;
const bdTowers=[[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]];/* same spots as the light towers below */
function bdMaterials(){if(bdMats)return bdMats;
  const ridge=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,side:THREE.DoubleSide}),tree=new THREE.MeshStandardMaterial({roughness:1,flatShading:true}),
    water=new THREE.MeshStandardMaterial({color:LC(0xffffff),roughness:.2,metalness:0});
  let block;if(!PARK_SHADERS)block=new THREE.MeshStandardMaterial({roughness:.9});else{const {positionWorld:p,normalWorld:n,fract,floor,sin,dot,vec2,vec3,step,abs,mix,float,color}=TSL;
    const u=dot(p.xz,vec2(n.z.negate(),n.x)).div(BD_BAY),v=p.y.div(BD_FLOOR),cell=floor(vec2(u,v)),f=fract(vec2(u,v));
    const win=step(.2,f.x).mul(step(f.x,.8)).mul(step(.3,f.y)).mul(step(f.y,.82)).mul(step(abs(n.y),.5)).mul(step(1,p.y)),
      lit=step(1-BD_LIT,fract(sin(dot(cell,vec2(12.9898,78.233))).mul(43758.5453)));
    block=new THREE.MeshStandardNodeMaterial({roughness:.85});block.colorNode=vec3(mix(float(1),float(BD_GLASS),win));
    block.emissiveNode=color(LC(BD_WIN_C)).mul(win.mul(lit).mul(bdWinU).mul(BD_WIN_I))}
  return bdMats={ridge,tree,water,block}}
function bdRidge(R0){const {r,h:[h0,h1],c,seed}=R0,a0=R0.a[0]*D2R,a1=R0.a[1]*D2R,full=R0.a[1]-R0.a[0]>=360,N=Math.max(24,Math.round((a1-a0)/D2R*1.2)),rnd=mulberry32(seed+BD_SEED),
    ph=[rnd()*6.283,rnd()*6.283,rnd()*6.283],col=new THREE.Color(c),pos=[],cols=[],uvs=[],idx=[];
  for(let i=0;i<=N;i++){const t=i/N,a=a0+(a1-a0)*t,k=.5+.5*(.55*Math.sin(a*3+ph[0])+.3*Math.sin(a*7+ph[1])+.15*Math.sin(a*17+ph[2])),
      edge=full?1:Math.min(1,Math.min(t,1-t)*10),h=(h0+(h1-h0)*k)*edge,rb=r-h*.9,s=Math.sin(a),q=-Math.cos(a);
    pos.push(s*rb,BD_BASE_Y,q*rb,s*r,h,q*r);cols.push(col.r*.55,col.g*.55,col.b*.55,col.r,col.g,col.b);uvs.push(t,0,t,1);
    if(i<N){const j=i*2;idx.push(j,j+1,j+2,j+1,j+3,j+2)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(cols,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));g.setIndex(idx);g.computeVertexNormals();
  return new THREE.Mesh(g,bdMats.ridge)}
/* n instances spread over the ranges (radius, angle sets in degrees), rejected near a light tower or an earlier instance */
function bdScatter(S,geo,mat,seed,place){const rnd=mulberry32(seed+BD_SEED),m=new THREE.InstancedMesh(geo,mat,S.n),o=new THREE.Object3D(),done=[],c=new THREE.Color();let k=0;
  for(let tries=0;k<S.n&&tries<S.n*12;tries++){const A=S.a[Math.floor(rnd()*S.a.length)],a=(A[0]+(A[1]-A[0])*rnd())*D2R,r=S.r[0]+(S.r[1]-S.r[0])*rnd(),x=Math.sin(a)*r,z=-Math.cos(a)*r,
      sz=place(o,x,z,rnd);if(bdTowers.some(([tx,tz])=>Math.hypot(tx-x,tz-z)<BD_TOWER_GAP+sz)||done.some(([dx,dz,ds])=>Math.hypot(dx-x,dz-z)<(ds+sz)*.6))continue;
    o.updateMatrix();m.setMatrixAt(k,o.matrix);m.setColorAt(k,c.set(S.c[Math.floor(rnd()*S.c.length)]));done.push([x,z,sz]);k++}
  m.count=k;m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;m.computeBoundingSphere();return m}
const bdSpan=(v,t)=>v[0]+(v[1]-v[0])*t;
function bdBlocks(S,seed){return bdScatter(S,new THREE.BoxGeometry(1,1,1).translate(0,.5,0),bdMats.block,seed,(o,x,z,rnd)=>{const w=bdSpan(S.w,rnd()),d=bdSpan(S.d,rnd()),h=bdSpan(S.h,rnd());
  o.position.set(x,0,z);o.rotation.set(0,Math.atan2(x,z)+(rnd()-.5)*.3,0);o.scale.set(w,h,d);return Math.max(w,d)/2})}
function bdTrees(S,seed){return bdScatter(S,new THREE.IcosahedronGeometry(1,0).scale(.8,1,.8).translate(0,1.1,0),bdMats.tree,seed,(o,x,z,rnd)=>{const s=bdSpan(S.s,rnd());
  o.position.set(x,0,z);o.rotation.set(0,rnd()*6.283,0);o.scale.set(s,s*(1+rnd()*.5),s);return s*.8})}
function bdBuild(id){const K=BACKDROPS[id];if(!K)return null;bdMaterials();const g=new THREE.Group();g.name='backdrop:'+id;
  for(const R of K.ridges||[])g.add(bdRidge(R));
  if(K.blocks)g.add(bdBlocks(K.blocks,11));if(K.blocks2)g.add(bdBlocks(K.blocks2,12));if(K.trees)g.add(bdTrees(K.trees,13));if(K.trees2)g.add(bdTrees(K.trees2,14));
  if(K.water){const W=K.water,len=(W.a[1]-W.a[0])*D2R,geo=new THREE.RingGeometry(W.r[0],W.r[1],64,1,Math.PI/2-W.a[1]*D2R,len);/* ring in XY laid flat: x = cos theta, z = -sin theta, so theta = 90 deg - angle */
    const wm=bdMats.water.clone();wm.color.set(W.c);const m=new THREE.Mesh(geo,wm);m.rotation.x=-Math.PI/2;m.position.y=.03;g.add(m)}
  g.traverse(o=>{o.castShadow=o.receiveShadow=false});g.updateMatrixWorld(true);scene.add(g);return g}
function applyBackdrop(P,S){const want=OFF.has('backdrop')?null:(P.shape||{}).backdrop;
  if(want&&!bdKits[want])bdKits[want]=bdBuild(want);for(const k in bdKits)if(bdKits[k])bdKits[k].visible=k===want;
  bdWinU.value=Math.max(0,(S.lamp-BD_DAY_LAMP)/(1-BD_DAY_LAMP))}
/* ---------- #203 item 5 slice 2: stand levels and roof per park (PARKS[id].shape.upper). Additive: built behind or on top of the three infield
   stands (the fans, the old stand meshes, the old roof and render/props/ are not touched), once on first use, then shown or hidden like the
   backdrops. Local stand frame as stand(): +z away from the field, back wall face at z = rows*ROW_D+1, wall top = FRONT_H+rows*ROW_RISE+BACK_WALL.
   Kits (only = 'home' builds behind the home-plate stand alone):
   low    (台北) a two-floor concourse block just over the home stand's back wall: the park stays small and low.
   block  (新竹) a four-floor infield building behind every infield stand (windows from the backdrop block material) under one deep canopy
          that reaches over the seats: the covered, boxy silhouette.
   tall   (高雄) an upper bowl of UP_BOWL_ROWS raked rows over every infield stand (distant crowd painted on the rake), its own canopy: four levels.
   arcade (台東) a low arched gallery with a tiled roof crowning the home stand (the arcade facade, seen from the field); no upper level.
   shape.roof === false (台東): the old roof meshes (old:roof*) move into a hidden holder in their stand, so props/index.js can keep flipping
   their visible flag; the polished roof on max (props/roof.js) is the polish lane's to hide (issue filed).
   Draw calls: low 1, block 2, tall 4, arcade 4 (instanced across the stands). Nothing casts or takes the key shadow. ?off=upper (dev) = none. */
const UP_FLOOR=4,UP_LOW_FLOORS=2,UP_LOW_LEN=30,UP_BLOCK_FLOORS=4,UP_BLOCK_D=12,UP_BLOCK_INSET=3,UP_CANOPY_T=.7,UP_CANOPY_FRONT=-7,UP_CANOPY_GAP=1.5,UP_CANOPY_TILT=.05,
  UP_BOWL_ROWS=16,UP_BOWL_RISE=.62,UP_BOWL_LIFT=1.5,UP_BOWL_BACK=3,UP_BOWL_ROOF_GAP=6,UP_BOWL_ROOF_OVER=4,UP_CROWD_TILE=17.6,
  UP_ARC_H=4.6,UP_ARC_D=4,UP_ARC_W=4.5,UP_ARC_ROOF=1.8,UP_ARC_LEN=44,
  UP_C={low:0xc9c2b4,block:0xd6d9dc,canopy:0xe4e7ea,bowlRoof:0xcfd3d8,arcRoof:0x7a3b26};
const upKits={};
function upStands(){const S=[];scene.traverse(o=>{const u=o.name==='stand'&&o.userData.stand;if(u&&!u.base)S.push({g:o,u,home:u.side===2,back:u.rows*ROW_D+1,top:FRONT_H+u.rows*ROW_RISE+BACK_WALL})});return S}
/* one InstancedMesh of a unit box per material; P = [stand, local x,y,z (box centre), w,h,d, tiltX] */
const upBoxGeo=new THREE.BoxGeometry(1,1,1),upM4=new THREE.Matrix4(),upO=new THREE.Object3D(),upCol=new THREE.Color();
function upBoxes(mat,P,col){const m=new THREE.InstancedMesh(upBoxGeo,mat,P.length);P.forEach(([st,x,y,z,w,h,d,tx=0],i)=>{upO.position.set(x,y,z);upO.rotation.set(tx,0,0);upO.scale.set(w,h,d);upO.updateMatrix();
  m.setMatrixAt(i,upM4.multiplyMatrices(st.g.matrixWorld,upO.matrix));m.setColorAt(i,upCol.set(col))});m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();return m}
const upCrowdTex=()=>genTex('upCrowd',256,64,(u,v,x,y)=>{const cx=Math.floor(x/8),cy=Math.floor(y/4),fx=x%8,fy=y%4,h=hashG(cx,cy,7),seat=[.10,.22,.36];
  if(fy===0||fx===0)return[.05,.05,.06];if(h<.12)return seat;const k=hashG(cx,cy,9),sh=hashG(cx,cy,11);/* row edge, empty seat, else a shirt and a head (fy 3 = up the rake) */
  if(fy===3)return[.35+.2*k,.25+.15*k,.18+.1*k];return sh<.3?[.85,.85,.82]:sh<.5?[.15+.6*k,.1,.1]:sh<.7?[.1,.2+.4*k,.5]:[.2+.3*k,.2+.3*k,.2+.3*k]},1);
/* one arch per tile: canvas v runs top to bottom; ARC_SPRING = where the round head meets the straight jambs, band = the brown frieze */
const ARC_TOP=.26,ARC_SPRING=.44,ARC_W=.34;
const upArcTex=()=>genTex('upArc',64,64,(u,v)=>{const dx=Math.abs(u-.5)/ARC_W,head=(ARC_SPRING-v)/(ARC_SPRING-ARC_TOP),open=dx<1&&v<.94&&(v>=ARC_SPRING||dx*dx+head*head<1),band=v<.12;
  const n=.9+.1*vnoise(u*8,v*8,41,8);if(open)return[.09,.08,.07];if(band)return[.42*n,.26*n,.17*n];return[.85*n,.75*n,.58*n]},1);
function upBuild(id){const St=upStands(),home=St.filter(s=>s.home),g=new THREE.Group();g.name='upper:'+id;
  if(id==='low'){const m=bdMaterials().block,H=UP_LOW_FLOORS*UP_FLOOR;g.add(upBoxes(m,home.map(s=>[s,0,(s.top+H)/2,s.back+UP_BLOCK_D/2,UP_LOW_LEN,s.top+H,UP_BLOCK_D]),UP_C.low))}
  if(id==='block'){const m=bdMaterials().block,H=UP_BLOCK_FLOORS*UP_FLOOR,roof=new THREE.MeshStandardMaterial({roughness:.6,metalness:.3,map:paintTex(),roughnessMap:paintTex()});
    g.add(upBoxes(m,St.map(s=>[s,0,(s.top+H)/2,s.back+UP_BLOCK_D/2,s.u.len-2*UP_BLOCK_INSET,s.top+H,UP_BLOCK_D]),UP_C.block));
    const z0=UP_CANOPY_FRONT;g.add(upBoxes(roof,St.map(s=>{const y=s.top+H+UP_CANOPY_GAP,L=s.back+UP_BLOCK_D-z0;return[s,0,y,z0+L/2,s.u.len+2,UP_CANOPY_T,L,-UP_CANOPY_TILT]}),UP_C.canopy))}
  if(id==='tall'){const rows=[],walls=[],roofs=[],N=UP_BOWL_ROWS,D=N*ROW_D;
    for(const s of St){const y0=s.top+UP_BOWL_LIFT;for(let r=0;r<N;r++){const h=y0+r*UP_BOWL_RISE;rows.push([s,0,h/2,s.back+(r+.5)*ROW_D,s.u.len,h,ROW_D])}
      const yt=y0+N*UP_BOWL_RISE;walls.push([s,0,(yt+UP_BOWL_BACK)/2,s.back+D+.5,s.u.len,yt+UP_BOWL_BACK,1]);
      roofs.push([s,0,yt+UP_BOWL_ROOF_GAP,s.back+D/2-UP_BOWL_ROOF_OVER/2,s.u.len+2,UP_CANOPY_T,D+UP_BOWL_ROOF_OVER+2,-UP_CANOPY_TILT*1.6])}
    g.add(upBoxes(standMat,rows,0xffffff),upBoxes(standMat,walls,0xffffff),upBoxes(new THREE.MeshStandardMaterial({roughness:.6,metalness:.3,map:paintTex(),roughnessMap:paintTex()}),roofs,UP_C.bowlRoof));
    const cm=new THREE.MeshStandardMaterial({map:upCrowdTex(),roughness:.9}),rake=Math.atan2(UP_BOWL_RISE,ROW_D);/* one plane per stand on the row edges, its UVs scaled to the stand length */
    for(const s of St){const L=Math.hypot(D,N*UP_BOWL_RISE),geo=new THREE.PlaneGeometry(s.u.len,L),uv=geo.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*s.u.len/UP_CROWD_TILE,uv.getY(i)*N/16);
      const p=new THREE.Mesh(geo,cm);p.position.set(0,s.top+UP_BOWL_LIFT+N*UP_BOWL_RISE/2+.05,s.back+D/2);p.rotation.set(-Math.PI/2-rake,0,0);/* faces the field and up, local +y down the rake */p.updateMatrix();p.matrixAutoUpdate=false;p.matrix.premultiply(s.g.matrixWorld);g.add(p)}}
  if(id==='arcade'){const at=upArcTex(),wall=new THREE.MeshStandardMaterial({map:at,roughness:.85}),tile=new THREE.MeshStandardMaterial({roughness:.75,flatShading:true});
    at.repeat.set(UP_ARC_LEN/UP_ARC_W,1);
    g.add(upBoxes(wall,home.map(s=>[s,0,s.top+UP_ARC_H/2,s.back+UP_ARC_D/2,UP_ARC_LEN,UP_ARC_H,UP_ARC_D]),0xffffff),
      upBoxes(standMat,home.map(s=>[s,0,s.top/2,s.back+UP_ARC_D/2,UP_ARC_LEN,s.top,UP_ARC_D]),0xffffff));/* the gallery on its plain base, right behind the back wall */
    const prism=new THREE.CylinderGeometry(1,1,1,3).rotateZ(Math.PI/2).rotateX(Math.PI),pr=new THREE.InstancedMesh(prism,tile,home.length);/* triangular prism along x, ridge up */
    home.forEach((s,i)=>{upO.position.set(0,s.top+UP_ARC_H+UP_ARC_ROOF*.5,s.back+UP_ARC_D/2);upO.rotation.set(0,0,0);upO.scale.set(UP_ARC_LEN+1.5,UP_ARC_ROOF,UP_ARC_D*.62);upO.updateMatrix();
      pr.setMatrixAt(i,upM4.multiplyMatrices(s.g.matrixWorld,upO.matrix));pr.setColorAt(i,upCol.set(UP_C.arcRoof))});pr.computeBoundingSphere();g.add(pr)}
  g.traverse(o=>{o.castShadow=o.receiveShadow=false});scene.add(g);return g}
/* the hidden holder is a child of the same stand group at identity and carries its userData.stand, so world transforms stay and
   props/roof.js (which reads parent.userData.stand) still builds every roof whichever park was on when max mounted */
const upRoofs=[];
function applyUpper(P){const sh=P.shape||{},want=OFF.has('upper')?null:sh.upper;if(want&&!upKits[want])upKits[want]=upBuild(want);for(const k in upKits)if(upKits[k])upKits[k].visible=k===want;
  if(!upRoofs.length){const L=[];scene.traverse(o=>{if(o.name==='old:roof'||o.name==='old:roof:fascia')L.push(o)});for(const o of L){const p=o.parent;
    if(!p.userData.roofHold){const h=new THREE.Group();h.name='stand:roofHold';h.visible=false;h.userData.stand=p.userData.stand;p.add(h);p.userData.roofHold=h}upRoofs.push({o,p,h:p.userData.roofHold})}}
  const off=sh.roof===false&&!OFF.has('upper');for(const R of upRoofs){const to=off?R.h:R.p;if(R.o.parent!==to)to.add(R.o)}}
/* ---------- #203 item 5 slice 3: links between the stands and the town (PARKS[id].shape.links). Additive like the kits above: built once on
   first use, then shown or hidden; the stands, the fans and render/props/ are not touched. Kit:
   bridges (新竹) one glazed sky bridge per side, from the outer end of the infield building (the block kit's inset end, half its depth back)
          to the near end of the closest outfield stand at that stand's back, deck at LK_DECK_Y (about one floor over both stand tops),
          on LK_PIERS plain piers; the glass body uses the backdrop block material, so its one floor of windows lights with the sky like the
          town. Plus LK_HOUSES: a tight ring of two- and three-floor houses right behind the outfield stands, roofs just under their back wall
          top, so the stands read as built over the neighbours (not in front of the scoreboard: LK_HOUSES.a skips its arc).
   Draw calls: 3 (glass, slabs and piers, houses). Nothing casts or takes the key shadow. ?off=links (dev) = none. */
const LK_DECK_Y=12.6,LK_W=4.2,LK_H=3.2,LK_SLAB=.5,LK_ROOF_OVER=.4,LK_PIER=1.1,LK_PIERS=3,LK_C={slab:0xc9ccd0,pier:0x9a9ea4},
  LK_HOUSES={n:70,r:[123,133],a:[[-47,-37],[-18,47]],w:[5,8],d:[8,11],h:[5.5,10],c:[0xd9cdb5,0xc2b59c,0xe6dccb,0xb3a892,0xcbbfa6,0x9f9a8e]};
const lkKits={};
function lkEnds(){const inf=[],of=[];scene.traverse(o=>{const u=o.name==='stand'&&o.userData.stand;if(!u)return;(u.base?of:inf).push({g:o,u})});
  const W=(st,x,z)=>new THREE.Vector3(x,0,z).applyMatrix4(st.g.matrixWorld),out=[];
  for(const s of inf){if(s.u.side===2)continue;const x=s.u.len/2-UP_BLOCK_INSET,z=s.u.rows*ROW_D+1+UP_BLOCK_D/2,a=W(s,x,z),b=W(s,-x,z),A=a.length()>b.length()?a:b;
    let best=null;for(const o of of)for(const sg of[1,-1]){const B=W(o,sg*o.u.len/2,o.u.rows*ROW_D+.5),d=A.distanceTo(B);if(!best||d<best.d)best={d,B}}
    if(best)out.push([A,best.B])}
  return out}
function lkBuild(id){if(id!=='bridges')return null;const E=lkEnds(),g=new THREE.Group(),o=new THREE.Object3D();g.name='links:'+id;
  const glass=new THREE.InstancedMesh(upBoxGeo,bdMaterials().block,E.length),plain=new THREE.MeshStandardMaterial({roughness:.7,metalness:.2}),
    slabs=new THREE.InstancedMesh(upBoxGeo,plain,E.length*(2+LK_PIERS));let k=0;
  const put=(m,i,x,y,z,yaw,w,h,d,c)=>{o.position.set(x,y,z);o.rotation.set(0,yaw,0);o.scale.set(w,h,d);o.updateMatrix();m.setMatrixAt(i,o.matrix);m.setColorAt(i,upCol.set(c))};
  E.forEach(([A,B],i)=>{const dx=B.x-A.x,dz=B.z-A.z,L=Math.hypot(dx,dz),yaw=Math.atan2(dx,dz),mx=(A.x+B.x)/2,mz=(A.z+B.z)/2;
    put(glass,i,mx,LK_DECK_Y+LK_H/2,mz,yaw,LK_W,LK_H,L,0xdde3e8);
    put(slabs,k++,mx,LK_DECK_Y-LK_SLAB/2,mz,yaw,LK_W+LK_ROOF_OVER,LK_SLAB,L,LK_C.slab);
    put(slabs,k++,mx,LK_DECK_Y+LK_H+LK_SLAB/2,mz,yaw,LK_W+2*LK_ROOF_OVER,LK_SLAB,L+LK_ROOF_OVER,LK_C.slab);
    for(let p=1;p<=LK_PIERS;p++){const t=p/(LK_PIERS+1),h=LK_DECK_Y-LK_SLAB;put(slabs,k++,A.x+dx*t,h/2,A.z+dz*t,yaw,LK_PIER,h,LK_PIER,LK_C.pier)}});
  for(const m of[glass,slabs]){m.instanceMatrix.needsUpdate=true;m.computeBoundingSphere();g.add(m)}
  g.add(bdBlocks(LK_HOUSES,15));
  g.traverse(o=>{o.castShadow=o.receiveShadow=false});g.updateMatrixWorld(true);scene.add(g);return g}
function applyLinks(P){const want=OFF.has('links')?null:(P.shape||{}).links;if(want&&!(want in lkKits))lkKits[want]=lkBuild(want);for(const k in lkKits)if(lkKits[k])lkKits[k].visible=k===want}
let skyCur=SKIES.night;
/* #208 item 5: colour mood per park (render/grade.js, pure): light colours graded, exposure scaled. Loaded once; applySky reruns when it arrives (without it the sky's own values stand). */
for(const k in SKIES)SKIES[k].mood=k;
let GRADE=null,csSoft={r:1,a:1};/* #209 item 4: contact-shadow widen/soften per sky, from grade.js softOf */
/* #208 item 3: cloud shadows (render/cloud.js constants; loaded once). One flat dark overlay over the field: no extra pass, no download. Tiers 0-1 and max (envOn); strength by the sky's lamp value; time = curT() so a seek matches playing. */
let CLOUD=null;const cloudU={t:TSL.uniform(0),k:TSL.uniform(0)};let cloudMesh=null;
function cloudSet(){if(!cloudMesh||!CLOUD)return;const k=OFF.has('cloud')?0:CLOUD.strengthOf(skyCur.lamp);cloudU.k.value=k;cloudMesh.visible=envOn&&k>0}
import(new URL('cloud.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{CLOUD=M;
  const {positionWorld,mx_noise_float:nz,vec2,vec3,float,smoothstep}=TSL,w=positionWorld.xz.sub(vec2(M.CLOUD_SPEED[0],M.CLOUD_SPEED[1]).mul(cloudU.t));
  const n=nz(vec3(w.div(M.CLOUD_SCALE),0)).mul(.5).add(.5).mul(.65).add(nz(vec3(w.div(M.CLOUD_SCALE*.37).add(vec2(11.3,4.7)),0)).mul(.5).add(.5).mul(.35));
  const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  m.colorNode=vec3(0,0,0);m.opacityNode=smoothstep(float(M.CLOUD_COVER-M.CLOUD_SOFT),float(M.CLOUD_COVER+M.CLOUD_SOFT),n).mul(M.CLOUD_MAX).mul(cloudU.k);
  cloudMesh=new THREE.Mesh(new THREE.PlaneGeometry(260,190),m);cloudMesh.name='old:cloud';cloudMesh.rotation.x=-Math.PI/2;cloudMesh.position.set(0,.02,-55);cloudMesh.renderOrder=1;cloudMesh.visible=false;scene.add(cloudMesh);cloudSet()}).catch(err=>console.warn('cloud shadows off',err));
/* #208 item 3 (part 6): damp sheen on the fair grass at night (render/damp.js constants). One flat pale overlay, no extra pass, no download; tiers 0-1 and max (envOn); strength by the sky's lamp value (night full, dusk a little, day none). Static, so a seek matches playing. `?off=damp`. */
let DAMP=null;const dampU={k:TSL.uniform(0)};let dampMesh=null;
function dampSet(){if(!dampMesh||!DAMP)return;const k=OFF.has('damp')?0:DAMP.strengthOf(skyCur.lamp);dampU.k.value=k;dampMesh.visible=envOn&&k>0}
import(new URL('damp.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{DAMP=M;
  const {positionWorld,mx_noise_float:nz,vec2,vec3,float,smoothstep,abs,length,select}=TSL,x=positionWorld.x,z=positionWorld.z,w=vec2(x,z);
  const n=nz(vec3(w.div(M.DAMP_SCALE),0)).mul(.5).add(.5).mul(.65).add(nz(vec3(w.div(M.DAMP_SCALE*.41).add(vec2(7.1,2.9)),0)).mul(.5).add(.5).mul(.35));
  const mask=select(z.greaterThanEqual(0),float(0),smoothstep(float(-2),float(6),z.negate().sub(abs(x))).mul(float(1).sub(smoothstep(float(M.DAMP_R[0]),float(M.DAMP_R[0]+M.DAMP_R[1]),length(w)))));
  const m=new THREE.MeshBasicNodeMaterial({transparent:true,depthWrite:false,fog:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  m.colorNode=vec3(...M.DAMP_COLOR);m.opacityNode=smoothstep(float(M.DAMP_COVER-M.DAMP_SOFT),float(M.DAMP_COVER+M.DAMP_SOFT),n).mul(M.DAMP_MAX).mul(mask).mul(dampU.k);
  dampMesh=new THREE.Mesh(new THREE.PlaneGeometry(260,190),m);dampMesh.name='old:damp';dampMesh.rotation.x=-Math.PI/2;dampMesh.position.set(0,.025,-55);dampMesh.renderOrder=1;dampMesh.visible=false;scene.add(dampMesh);dampSet()}).catch(err=>console.warn('damp sheen off',err));
/* #208 item 4 (part 4): slide dust drawn; part 5: plus a puff where a batted ball comes down on dirt (DUST.eventDust). render/dust.js is pure (event + time -> puffs); here DUST_MAX soft sprites show the current event's puffs at curU, so a seek shows what playing shows.
   Tiers 0-1 and max (envOn), no new pass; `?off=dust`. Colour = the dirt dabs (DIRT_RGB). */
let DUST=null;const DUST_MAX=32,DUST_BASES=[[0,0],[19.4,-19.4],[0,-38.8],[-19.4,-19.4],[0,0]],dustCache=new WeakMap(),dustSprites=[];
function dustPuffs(e){let p=dustCache.get(e);if(!p){p=DUST.eventDust(e,DUST_BASES);dustCache.set(e,p)}return p}
function dustTick(e,u){if(!DUST)return;let n=0;if(envOn&&!OFF.has('dust')&&e)for(const p of dustPuffs(e)){const q=DUST.puffAt(p,u);if(!q||n>=DUST_MAX)continue;const sp=dustSprites[n++];sp.visible=true;sp.position.set(q.x,q.y,q.z);sp.scale.set(q.r*2,q.r*2,1);sp.material.opacity=q.a}
  for(let k=n;k<dustSprites.length;k++)dustSprites[k].visible=false}
import(new URL('dust.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{DUST=M;
  const c=document.createElement('canvas');c.width=c.height=64;{const g=c.getContext('2d'),gr=g.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,`rgba(${DIRT_RGB},1)`);gr.addColorStop(.6,`rgba(${DIRT_RGB},.5)`);gr.addColorStop(1,`rgba(${DIRT_RGB},0)`);g.fillStyle=gr;g.fillRect(0,0,64,64)}
  const tex=new THREE.CanvasTexture(c);
  for(let i=0;i<DUST_MAX;i++){const m=new THREE.SpriteNodeMaterial({transparent:true,depthWrite:false});m.colorNode=TSL.texture(tex);const sp=new THREE.Sprite(m);sp.name='old:dust';sp.visible=false;sp.frustumCulled=false;scene.add(sp);dustSprites.push(sp)}}).catch(err=>console.warn('slide dust off',err));
function applySky(S){skyCur=S;csSoft=GRADE?GRADE.softOf(S.mood):csSoft;const mood=GRADE?GRADE.moodOf(S.mood):null,gr=h=>mood?GRADE.grade(h,mood):h;renderer.toneMappingExposure=S.exposure*(mood?mood.exp:1);key.intensity=S.key*Math.PI;key.color.set(gr(S.keyC));fill.intensity=S.fill*Math.PI;fill.color.set(gr(S.fillC));
  hemi.intensity=S.hemi*Math.PI;hemi.color.set(gr(S.hemiC));hemi.groundColor.set(S.ground);scene.fog.color.set(S.fog).lerp(new THREE.Color(...S.horizon),S.hazeSky);scene.fog.density=S.fogD;hazeU.color.value.copy(scene.fog.color);hazeU.dens.value=S.fogD;
  skyU.horizon.value.set(...S.horizon);skyU.zenith.value.set(...S.zenith);skyU.glow.value.set(...S.glow);skyU.beam.value=S.beam;
  for(const sp of towerSpots)sp.intensity=S.tower*Math.PI;glowMat.opacity=S.lamp;lampMat.color.setRGB(...LAMP_RGB.map(v=>Math.max(1,v*S.lamp)));
  stars.visible=S.stars;bugs.pts.material.visible=S.bugs;/* material switch: the tier code keeps owning bugs.pts.visible */
  cloudSet();dampSet();if(scene.environment)skyEnv()}/* #211 max: the image-based light follows the new sky; only once setTier has turned it on (renderer ready), same shaders, new texture */
const PARK_Q=(()=>{try{return new URLSearchParams(location.search).get('park')||''}catch(e){return''}})();
const PROP_Q=(()=>{try{return new URLSearchParams(location.search).get('prop')}catch(e){return null}})();if(PROP_Q!==null)import(new URL('props/viewer.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>M.startViewer({name:PROP_Q,renderer,scene,tier:()=>gfxTier,max:()=>gfxMax,dugout,park:()=>PARKS[parkCur&&parkCur.id]||PARK_DEFAULT})).catch(err=>console.warn('prop viewer off',err));/* #215: ?prop=<object> = one polished prop alone on a neutral floor (render/props/viewer.js, imported only with the switch) */
let parkCur=null;
const parkLogoC=document.createElement('canvas');parkLogoC.width=parkLogoC.height=PARK_LOGO_PX;
const parkLogoTex=new THREE.CanvasTexture(parkLogoC);parkLogoTex.colorSpace=THREE.SRGBColorSpace;parkLogoTex.anisotropy=8;
const parkLogoMat=new THREE.MeshStandardMaterial({map:parkLogoTex,transparent:true,alphaTest:.5,roughness:.7,emissive:0xffffff,emissiveMap:parkLogoTex,emissiveIntensity:PARK_LOGO_GLOW,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
{const geo=new THREE.PlaneGeometry(PARK_LOGO_M,PARK_LOGO_M);
 for(const sd of [-1,1]){const a=Math.PI+sd*PARK_LOGO_ALLEY,m=new THREE.Mesh(geo,parkLogoMat);m.position.set(Math.sin(a)*PARK_LOGO_R,PARK_LOGO_Y,Math.cos(a)*PARK_LOGO_R);m.lookAt(0,PARK_LOGO_Y,0);scene.add(m)}
 const pm=new THREE.Mesh(new THREE.PlaneGeometry(PLATE_LOGO_M,PLATE_LOGO_M),parkLogoMat);pm.position.set(0,PLATE_LOGO_Y,PLATE_LOGO_Z);pm.lookAt(0,PLATE_LOGO_Y,0);scene.add(pm)}
const parkLogoImgs={};
function drawParkLogo(id){const g=parkLogoC.getContext('2d');g.clearRect(0,0,PARK_LOGO_PX,PARK_LOGO_PX);let im=parkLogoImgs[id];
  if(!im&&id){im=parkLogoImgs[id]=new Image();im.onload=()=>{if(parkCur&&parkCur.id===id)drawParkLogo(id)};im.src=`${LOGO_DIR}${id}_${PARK_LOGO_PX}.webp`}
  if(im&&im.complete&&im.naturalWidth)g.drawImage(im,0,0,PARK_LOGO_PX,PARK_LOGO_PX);parkLogoTex.needsUpdate=true}
function applyPark(){const T=TEAMS.find(t=>t.id===PARK_Q)||TEAMS[game&&game.teams?game.teams[1]:1]||{};if(parkCur&&parkCur.id===T.id)return;
  const P=PARKS[T.id]||PARK_DEFAULT,c=new THREE.Color(P.trim);parkCur={id:T.id,home:T.short||'',trimCss:'#'+c.getHexString()};
  const S=SKIES[P.sky]||SKIES.night;applySky(S);applyBackdrop(P,S);applyUpper(P);applyLinks(P);applyTurf(P);drawAds(P.pad);adTex.needsUpdate=true;yellowPaint.color.copy(c);yellowPaint.emissive.copy(c);for(const m of deckRings||[])m.color.copy(c);drawParkLogo(T.id);sbKey=''}
parkHook=applyPark;applyPark();

/* ---------- figures ---------- */
const GEO={torso:new THREE.CylinderGeometry(.24,.19,.62,12),hips:new THREE.CylinderGeometry(.2,.22,.28,12),head:new THREE.SphereGeometry(.12,16,12),cap:new THREE.SphereGeometry(.13,16,8,0,Math.PI*2,0,Math.PI/2),brim:new THREE.BoxGeometry(.2,.02,.14),
  leg:new THREE.CylinderGeometry(.09,.065,.84,10),arm:new THREE.CylinderGeometry(.062,.05,.6,10),shoe:new THREE.BoxGeometry(.12,.08,.26),glove:new THREE.SphereGeometry(.09,10,8),neck:new THREE.CylinderGeometry(.06,.07,.1,8),shadow:new THREE.CircleGeometry(.45,16)};
GEO.torso.scale(1,1,.62);GEO.hips.scale(1,1,.7);
const SM=(h,r=.6)=>new THREE.MeshStandardMaterial({color:LC(h),roughness:r});
const skin=SM(0xc99572,.7),pants=SM(0xeeeeee,.75),dark=SM(0x1a1a1e,.5),leather=SM(0x8a5a2b,.6),shadowMat=new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.35,depthWrite:false});
const matDef=SM(0xffffff,.55),matOff=SM(0xffffff,.55),matCo=SM(0xffffff,.55),matMgr=SM(0xffffff,.55),matUmp=SM(0x111318,.7),matBn=[SM(0xffffff,.55),SM(0xffffff,.55)];/* #612: the two benches' kits *//* matCo: base coaches (#42), the batting team's kit; matMgr: the fielding team's manager on a pitching change (#81) */
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
  const f=PL.makePlayer({jersey:m,pants:pm,sock:m,kit:kitOf(m),skin,glove,head:o.head||'cap',role:o.role,throws:'R',parent:scene});
  if(f.glove)f.glove.traverse(x=>{if(x.isMesh)x.material=leather});
  return f}
const KITS=new Map(),kitOf=m=>window.PL&&PL.makeKit&&(m===matDef||m===matOff||m===matCo||m===matMgr||m===matBn[0]||m===matBn[1])?KITS.get(m)||KITS.set(m,PL.makeKit(m)).get(m):undefined,paintKit=(m,t)=>{const k=window.PL&&kitOf(m);if(k)PL.setKit(k,TEAMS[t],t===1);else m.color.setHex(TEAMS[t].color)};/* #204: side 1 = home (white), side 0 = road */
const BODY_OF=(team,name)=>{const R=ROSTERS[team];return R.bat.find(x=>x.name===name)||(R.bench||[]).find(x=>x.name===name)||R.pit.find(x=>x.name===name)};
/* Body-type weights are snapped to .25 steps so the geometry cache is not one entry per player */
const qBody=b=>{const o={};for(const k in b){const v=Math.round(b[k]*4)/4;if(v)o[k]=v}return o};
/* Prewarm: before first pitch, build every player's body geometry plus cap/helmet for both teams (one at a time while idle), so a substitution does not stutter mid-game */
function prewarmBodies(){if(!window.PL)return;const dummies=[PL.makePlayer({head:'cap'}),PL.makePlayer({head:'helmet',role:'batter'})],list=[];
  for(const t of [0,1])for(const p of [...ROSTERS[t].bat,...(ROSTERS[t].bench||[]),...ROSTERS[t].pit])list.push(p);
  const step=()=>{const t0=performance.now();while(list.length&&performance.now()-t0<8){const p=list.shift();for(const d of dummies)d.setBuild(p.body?qBody(p.body):'normal',p.ht,headIx(p))}if(list.length)(window.requestIdleCallback||setTimeout)(step)};step()}
const headIx=p=>OFF.has('faces')||!window.PL?0:PL.headOfPlayer(p);/* ?off=faces: one head shape for all */
function dress(f,p){if(f.setName)f.setName(p&&p.name);/* #204: family name on the back */if(!p){f.setBuild('normal');return}f.setBuild(p.body?qBody(p.body):'normal',p.ht,headIx(p))}
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
if(window.PL){fielders.C.setHead('helmet');if(fielders.C.setGear)fielders.C.setGear('catcher');addMask(fielders.C);addMask(ump)}/* #204: catcher's gear in the defence's team colour */
const BR=rigUpper(batter),CR=rigUpper(fielders.C),UR=rigUpper(ump),PR=rigUpper(fielders.P);
const batPivot=new THREE.Group();BR.up.add(batPivot);
const bat=window.PL?PL.makeBat(0xc9a06a):new THREE.Mesh(new THREE.CylinderGeometry(.04,.022,.85,8),SM(0xc9a06a,.45));if(!window.PL)bat.position.y=.42;bat.castShadow=true;batPivot.add(bat);
/* #43 items 2-3: the bat he lets go when he sets off (render/batdrop.js plans the flight: HR flip, toss, walk lay). One loose copy in world
   space, handle origin at the group origin like batPivot; shown from the batter's st0 to the end of the event. Dev switch ?off=batdrop. */
const looseBat=new THREE.Group(),looseIn=bat.clone();looseBat.add(looseIn);looseBat.visible=false;scene.add(looseBat);let batM=null;
let PTM=null;import(new URL('pitchtime.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{PTM=M}).catch(err=>console.warn('pitch time off',err));
import(new URL('batdrop.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{batM=M}).catch(err=>console.warn('bat drop off',err));
const _lb0=new THREE.Vector3(),_lb1=new THREE.Vector3(),_lbq=new THREE.Quaternion(),_lbq2=new THREE.Quaternion(),_lba=new THREE.Vector3();
/* Release pose = the held bat at st0 (the batter re-posed there: pure in (event, time)), then the planned arc, slerped to lying flat and
   spun end over end a whole number of turns about the horizontal axis square to where it lies */
function poseLooseBat(e,u){const k=batM&&!OFF.has('batdrop')?batM.batKind(e):null;if(!k)return;const rel=batM.batRelease(e);if(u<rel)return;
  const vis=batter.g.visible;batter.g.visible=true;poseBatter(e,rel);batterWalk(e,rel);batterMocap(e,rel);batter.g.updateMatrixWorld(true);
  batPivot.localToWorld(_lb0.set(0,0,0));batPivot.localToWorld(_lb1.set(0,1,0));batter.g.visible=vis;
  _lb1.sub(_lb0).normalize();_lbq.setFromUnitVectors(_up,_lb1);
  const lf=e.bat&&batOf(e).hand==='L',F=batM.batFlight(k,[_lb0.x,_lb0.y,_lb0.z],lf?1:-1,u-rel);
  _lb1.set(Math.sin(F.head),0,Math.cos(F.head));_lbq2.setFromUnitVectors(_up,_lb1);_lbq.slerp(_lbq2,ease(F.s));
  _lba.set(Math.cos(F.head),0,-Math.sin(F.head));_lbq2.setFromAxisAngle(_lba,-F.spin);
  looseBat.quaternion.multiplyQuaternions(_lbq2,_lbq);looseBat.position.set(...F.p);looseBat.visible=true}
/* #43 item 2: the bat boy (render/batboy.js plans the trip). The batting team's boy runs out of its dugout once the bat lies still, bends,
   picks it up and runs back into the dugout with it. Drawn from the newest bat let go (this event or an earlier one within BOY_LOOK s,
   like peelers), so he never vanishes when the play ends; an earlier bat still lying is drawn lying. Dev switch ?off=batboy. */
const BOY_LOOK=40,boy=figure(matOff,pants,false);boy.g.visible=false;let boyM=null;
import(new URL('batboy.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{boyM=M;boy.g.scale.setScalar(M.BOY_SCALE)}).catch(err=>console.warn('bat boy off',err));
const _bbq=new THREE.Quaternion(),_bbv=new THREE.Vector3();
function poseBatBoy(e,u,ei){boy.g.visible=false;if(!batM||!boyM||!game||OFF.has('batdrop')||OFF.has('batboy')||!Number.isFinite(ei))return;
  const T=e.t+u;let q=null,k=null,rel=0;
  for(let j=ei;j>=0&&T-game.ev[j].t<BOY_LOOK;j--){const c=game.ev[j],kk=batM.batKind(c);if(!kk)continue;const r=batM.batRelease(c);if(T>=c.t+r){q=c;k=kk;rel=r;break}}
  if(!q)return;
  const lf=q.bat&&batOf(q).hand==='L',L=batM.batLand(k,lf?1:-1),tau=T-q.t-rel,plan=boyM.boyPlan(L,dugout(q.s0.half),batM.BAT_LEN),st=boyM.boyAt(plan,tau);
  if(tau>=plan.end||st&&st.carry)looseBat.visible=false
  else if(q!==e){_bbv.set(Math.sin(L.head),0,Math.cos(L.head));looseBat.quaternion.setFromUnitVectors(_up,_bbv);looseBat.position.set(L.x,batM.BAT_REST_Y,L.z);looseBat.visible=true}
  if(!st)return;
  resetPose(boy);boy.noAnim=st.bend>0;boy.g.visible=true;boy.g.position.set(st.x,-.12*st.bend,st.z);face(boy,st.fx,st.fz);setNum(boy,undefined);
  if(st.bend>0){const R=boy.rig;R.up.rotation.x=.85*st.bend;if(boy.bend)boy.bend.knee[0]=boy.bend.knee[1]=.9*st.bend}
  if(st.carry){/* held by the handle in his right hand, barrel hanging down and a little forward */
    const a=boy.g.rotation.y,fx=Math.sin(a),fz=Math.cos(a),rx=-fz,rz=fx,h=st.bend>0?.75-.45*st.bend:.75;
    looseBat.position.set(st.x+rx*.28+fx*.08,h,st.z+rz*.28+fz*.08);_bbv.set(fx*.35,-1,fz*.35).normalize();looseBat.quaternion.setFromUnitVectors(_up,_bbv);looseBat.visible=true}}
/* batting keyframes: S stance, L load (stride + hands back), C contact, F follow-through. Frame: batter-local, +z faces the plate, +x faces the pitcher */
const BK={yaw:[-.15,-.45,.75,1.7],lean:[.12,.16,.2,.1],hx:[-.2,-.3,-.05,.35],hy:[.55,.62,.38,.65],hz:[.3,.22,.56,.35],
  bx:[-.3,-.5,-.55,.4],by:[.95,.85,.12,.7],bz:[.12,.1,.82,.55],stride:[.2,.3,.42,.4],back:[-.2,-.2,-.25,-.32],head:[1.1,1.15,.6,.2]};
/* When the batter stays in the box after a pitch (foul, take, swing and miss), the bat comes down to rest on his back shoulder, hands low in front
   (never held vertical in front of him, #43), and goes back up before the next pitch */
const BAT_REST={yaw:-.1,hx:.02,hy:.3,hz:.28,bx:-.6,by:.55,bz:-.55},BAT_REST_AT=1.4,BAT_REST_DUR=.6,BAT_UNREST_DUR=.5;
/* #124 the batter after strike three (owner 11/22: up on his toes in a running stride with the bat still raised). He stays planted, the bat
   comes down to the shoulder rest (from BAT_K_REST_AT[called, swinging] s after the pitch arrives: a swinging K first finishes the swing and
   the clip blends out), then he walks off from BAT_AWAY_AT at BAT_K_WALK_V, picking up to BAT_AWAY_SPEED over BAT_K_RAMP s (batAwayD).
   A dropped third strike (he runs to first) is not this. */
const BAT_K_REST_AT=[.35,.8],BAT_K_REST_DUR=.6,BAT_K_WALK_V=1.3,BAT_K_RAMP=1.8;
/* #124 round 2. Called K: a beat looking back at the plate umpire (head BAT_LOOK_HEAD, chest BAT_LOOK_YAW, absolute in his ground frame:
   0 = facing the plate, + = toward the pitcher) from BAT_LOOK_AT s after the pitch arrives, eased in over BAT_LOOK_IN, out over BAT_LOOK_OUT
   so he faces his walk when it starts at BAT_AWAY_AT. Swinging K: after the swing clip is out the top hand lets go (BAT_ONE_AT, over
   BAT_ONE_DUR) and the bat hangs from the bottom hand at his side, barrel down and forward (BAT_ONE), the free arm hangs (BAT_FREE_HAND);
   he carries it like that on the walk off. Upper-body frame like BAT_REST. */
const BAT_LOOK_AT=.45,BAT_LOOK_IN=.3,BAT_LOOK_OUT=.35,BAT_LOOK_HEAD=-.8,BAT_LOOK_YAW=-.3;
const BAT_ONE={hx:.33,hy:-.02,hz:.12,bx:.08,by:-.8,bz:.5},BAT_ONE_AT=1.15,BAT_ONE_DUR=.45,BAT_FREE_HAND=[-.32,-.02,.04];
const batLookW=(e,u)=>e.r!=='cstr'?0:Math.min(ease(sat01((u-(ARRIVE+BAT_LOOK_AT))/BAT_LOOK_IN)),1-ease(sat01((u-(BAT_AWAY_AT-BAT_LOOK_OUT))/BAT_LOOK_OUT)));
const batKOut=e=>!!(e.pa&&e.bat&&(e.r==='cstr'||e.r==='sstr')&&!k3Moves(e).some(m=>m[0]===0));
const BAT_LOAD_LEAD=.9,BAT_LOAD_DUR=.6,BAT_SWING_LEAD=.22,BAT_SWING_DUR=.3,BAT_FT_DELAY=.06,BAT_FT_DUR=.3,BAT_ARM_LEN=.6,BAT_SHOULDER_X=.3,BAT_SHOULDER_Y=.57;
const _bv=new THREE.Vector3(),_bq=new THREE.Quaternion(),_dn=new THREE.Vector3(0,-1,0),_up=new THREE.Vector3(0,1,0),sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);
function aimArm(a,sx,tx,ty,tz){_bv.set(tx-sx,ty-BAT_SHOULDER_Y,tz);const d=_bv.length();_bq.setFromUnitVectors(_dn,_bv.normalize());a.quaternion.copy(_bq);a.scale.y=Math.max(ARM_S_MIN,Math.min(1.2,d/BAT_ARM_LEN))}
/* #124 r3: aim an arm AND say where its elbow points. players.js solve() bends a skinned elbow toward the proxy's local -z (its twist), and
   aimArm's shortest-arc turn leaves that twist to chance (the hammer's elbow went back and up). Build the proxy frame from the stick
   (local -y = shoulder -> hand) and the pole (local -z = pole made square to the stick), slerped in by w. Block figures: only the twist changes. */
const _pq=new THREE.Quaternion(),_pm=new THREE.Matrix4(),_px=new THREE.Vector3(),_py=new THREE.Vector3(),_pz=new THREE.Vector3();
function aimArmPole(a,sx,tx,ty,tz,pole,w){aimArm(a,sx,tx,ty,tz);if(!(w>0))return;_py.set(sx-tx,BAT_SHOULDER_Y-ty,-tz).normalize();
  _pz.set(-pole[0],-pole[1],-pole[2]);_pz.addScaledVector(_py,-_pz.dot(_py)).normalize();_px.crossVectors(_py,_pz);_pq.setFromRotationMatrix(_pm.makeBasis(_px,_py,_pz));a.quaternion.slerp(_pq,Math.min(1,w))}
/* Skinned players: shortening the arm proxy = bending the elbow, so the hand really lands on the target; on block figures too short looks like a stub, so keep .85 */
const ARM_S_MIN=window.PL?.3:.85;
/* Sacrifice/drag bunt: during the delivery the batter squares around to the pitcher, bends his knees and holds the bat out over the plate,
   barrel a little above the hands, top hand slid up the barrel; the sweet spot sits on the pitch line, and he gives with the pitch at contact.
   Targets are in the batter's ground frame (batter.g local: +x toward the pitcher, +z toward the plate, y up) and converted into the twisted upper body */
const BUNT={yaw:1.25,hips:.75,head:1.45,lean:.45,gap:.32},BUNT_SQUARE_LEAD=1.05,BUNT_SQUARE_DUR=.45,BUNT_GIVE=.08,BUNT_GIVE_DUR=.15;
const BUNT_DIR=[.25,.18,1],BUNT_SWEET=.55,BUNT_SWEET_X=.42,BUNT_KNEE=.3,BUNT_KNEE_REF=.92,BUNT_KNEE_LOW=.25,BUNT_KNEE_MIN=.2,BUNT_KNEE_MAX=.4,BUNT_HAND_MIN=.6,BUNT_HAND_MAX=1.25,BUNT_RISE=.3;
const _ugm=new THREE.Matrix4(),_ugh=new THREE.Vector3(),_ugd=new THREE.Vector3(),_ugs=new THREE.Vector3();
let buntK=0,buntDrop=0;const buntPt=[0,1,.3];
/* #655: a bunt attempt that goes foul (engine e.r 'foul', e.bunt) is squared around like a bunt in play, then he straightens up; the ball dribbles foul near the plate */
const buntE=e=>e.r==='inplay'&&!!e.play&&!!e.play.bunt||e.r==='foul'&&!!e.bunt;
const BUNT_FOUL_HOLD=.5,BUNT_FOUL_UP=.4;/* seconds after ARRIVE he stays squared, then straightens over BUNT_FOUL_UP */
const bfbRel=(e,u)=>e.r==='foul'&&e.bunt?1-ease(sat01((u-ARRIVE-BUNT_FOUL_HOLD)/BUNT_FOUL_UP)):1;
let FBB=null;import(new URL('foul_bunt.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{FBB=M}).catch(err=>console.warn('foul bunt ball off',err));/* #655: render/foul_bunt.js */
/* Convert a point (or direction) from the batter's ground frame into the upper-body frame batPivot lives in */
function groundToUp(v,dir){batter.g.updateMatrixWorld(true);_ugm.copy(batter.g.matrixWorld).invert().multiply(BR.up.matrixWorld).invert();return dir?v.transformDirection(_ugm):v.applyMatrix4(_ugm)}
/* Hit by pitch: the ball ends on the batter's body (spot picked from the pitch height, on the pitcher's side of him), he flinches and turns away,
   the ball drops and hops, then he goes to first at the engine's st0. Batter-local: +x faces the pitcher. */
const HBP_BODY_R=.2,HBP_Y_MIN=.55,HBP_Y_MAX=1.5,HBP_DROP_DUR=.5,HBP_HOP_DUR=.3,HBP_DROP_DX=.3,HBP_DROP_DZ=.35,HBP_HOP_DX=.2,HBP_HOP_DZ=.25,HBP_HOP_PEAK=.1,HBP_DROP_PEAK=.12,HBP_BALL_GONE=2.2;
const HBP_REACT_IN=.15,HBP_REACT_OUT_AT=.45,HBP_REACT_OUT=.35,HBP_YAW=-.9,HBP_LEAN=.4,HBP_KNEE=.15;
const hbpReact=u=>ease(sat01((u-ARRIVE)/HBP_REACT_IN))*(1-ease(sat01((u-ARRIVE-HBP_REACT_OUT_AT)/HBP_REACT_OUT)));
function hbpSpot(e){const lf=e.bat&&batOf(e).hand==='L',kk=batter.k||1;
  return[lf?-BAT_BOX[0]:BAT_BOX[0],clamp(.45+e.zy*.75,HBP_Y_MIN,HBP_Y_MAX)*kk,BAT_BOX[1]-HBP_BODY_R]}
function hbpBall(e,u){const S=hbpSpot(e),t=u-ARRIVE,sg=S[0]>0?-1:1;/* he stands on the side away from the plate: the ball bounces back toward it and toward the pitcher */
  const g1=[S[0]+sg*HBP_DROP_DX,BALL_R,S[2]-HBP_DROP_DZ],g2=[g1[0]+sg*HBP_HOP_DX,BALL_R,g1[2]-HBP_HOP_DZ];
  if(t<HBP_DROP_DUR)return arc(S,g1,HBP_DROP_PEAK,t/HBP_DROP_DUR);
  if(t<HBP_DROP_DUR+HBP_HOP_DUR)return arc(g1,g2,HBP_HOP_PEAK,(t-HBP_DROP_DUR)/HBP_HOP_DUR);
  return t<HBP_BALL_GONE?g2:null}
function poseBatter(e,u){
  const bn=buntE(e)?ease(sat01((u-(ARRIVE-BUNT_SQUARE_LEAD))/BUNT_SQUARE_DUR))*bfbRel(e,u):0;
  const hs=chkHalf(e,u),ld=ease(sat01((u-(ARRIVE-BAT_LOAD_LEAD))/BAT_LOAD_DUR)),sw=hs&&!bn?Math.min(ease(sat01((u-(ARRIVE-BAT_SWING_LEAD))/BAT_SWING_DUR)),hs.cap)*(1-hs.back):e.swing&&!bn?ease(sat01((u-(ARRIVE-BAT_SWING_LEAD))/BAT_SWING_DUR)):0,ft=e.swing&&!bn&&!hs?ease(sat01((u-(ARRIVE+BAT_FT_DELAY))/BAT_FT_DUR)):0;
  const K=(k,c)=>{const a=BK[k];let v=lerp(a[0],a[1],ld);v=lerp(v,c===undefined?a[2]:c,sw);return lerp(v,a[3],ft)};
  const stay=!(e.pa&&e.r!=='ibb'),kOut=batKOut(e),rw=kOut?ease(sat01((u-(ARRIVE+BAT_K_REST_AT[e.r==='sstr'?1:0]))/BAT_K_REST_DUR)):stay?Math.max(ease(sat01((u-(ARRIVE+BAT_REST_AT))/BAT_REST_DUR)),(e.c0[0]+e.c0[1]>0&&e.c0[0]+e.c0[1]!==undefined)?1-ease(sat01(u/BAT_UNREST_DUR)):0):0;
  const lk=kOut?batLookW(e,u):0,oh=kOut&&e.r==='sstr'?ease(sat01((u-(ARRIVE+BAT_ONE_AT))/BAT_ONE_DUR)):0;
  const yaw=lerp(lerp(K('yaw'),BAT_REST.yaw,rw),BAT_LOOK_YAW,lk),py=.45+e.zy*.75,dyC=Math.max(-.7,Math.min(.2,(py-1.33)/.85));
  const byaw=lerp(yaw,BUNT.yaw,bn);const hb=e.r==='hbp'?hbpReact(u):0;BR.up.rotation.set(lerp(K('lean'),BUNT.lean,bn)+HBP_LEAN*hb,byaw+HBP_YAW*hb,0);BR.hips.rotation.y=lerp(yaw*.6,BUNT.hips,bn);BR.hg.rotation.y=lerp(lerp(K('head'),BUNT.head,bn),BAT_LOOK_HEAD,lk)-byaw;
  BR.l0.rotation.z=K('back');BR.l1.rotation.z=lerp(lerp(BK.stride[0],BK.stride[1],ld),BK.stride[2],sw);
  /* Knees bend with the square-around, deeper for a low pitch so the bat stays level instead of chopping down */
  const knee=Math.max(clamp(BUNT_KNEE+(BUNT_KNEE_REF-py)*BUNT_KNEE_LOW,BUNT_KNEE_MIN,BUNT_KNEE_MAX)*bn,HBP_KNEE*hb);buntK=bn;buntDrop=LEG_LEN*knee*(batter.k||1);BR.l0.scale.y=BR.l1.scale.y=1-knee;
  const RK=k=>lerp(BAT_REST[k],BAT_ONE[k],oh);
  let gx=lerp(K('hx'),RK('hx'),rw),gy=lerp(K('hy'),RK('hy'),rw),gz=lerp(K('hz'),RK('hz'),rw);
  _bv.set(lerp(K('bx'),RK('bx'),rw),lerp(K('by',dyC),RK('by'),rw),lerp(K('bz'),RK('bz'),rw)).normalize();
  if(bn>0){const give=BUNT_GIVE*ease(sat01((u-ARRIVE)/BUNT_GIVE_DUR)),L=Math.hypot(...BUNT_DIR),sl=e.bat&&batOf(e).hand==='L'?-1:1;
    /* Sweet spot on the pitch line: world x = e.zx, height = pitch height (ground frame is lowered by the knee bend) */
    const sx=BUNT_SWEET_X,sz=-BAT_BOX[0]+sl*e.zx,sy=clamp(py,BUNT_HAND_MIN,BUNT_HAND_MAX)+buntDrop;
    _ugh.set(sx-BUNT_SWEET*BUNT_DIR[0]/L-give,sy-BUNT_SWEET*BUNT_DIR[1]/L,sz-BUNT_SWEET*BUNT_DIR[2]/L);groundToUp(_ugh,false);
    _ugd.set(BUNT_DIR[0],BUNT_DIR[1],BUNT_DIR[2]);groundToUp(_ugd,true);
    gx=lerp(gx,_ugh.x,bn);gy=lerp(gy,_ugh.y,bn);gz=lerp(gz,_ugh.z,bn);_bv.lerp(_ugd,bn).normalize()}
  batPivot.position.set(gx,gy,gz);batPivot.quaternion.setFromUnitVectors(_up,_bv);
  const gap=lerp(BAT_HAND_GAP,BUNT.gap,bn);
  /* Hands apart on the bat: bottom hand (arms[1], a right-handed batter's left hand) on the handle, top hand (arms[0]) BAT_HAND_GAP toward the barrel */
  const tx=gx+_bv.x*gap,ty=gy+_bv.y*gap,tz=gz+_bv.z*gap;/* top hand on the bat, or (swinging K, oh) let go and hanging at his side */
  aimArm(BR.a0,-BAT_SHOULDER_X,lerp(tx,BAT_FREE_HAND[0],oh),lerp(ty,BAT_FREE_HAND[1],oh),lerp(tz,BAT_FREE_HAND[2],oh));aimArm(BR.a1,BAT_SHOULDER_X,gx,gy,gz)}
/* #185 act 1: the real swing (CMU 124_07, assets/mocap) on the skinned batter, over the keyframes above. Clip time runs at real speed
   with the clip's contact frame (SW_CONTACT, set by hand: the clip's auto release frame is noise for a swing) exactly at ARRIVE, held
   between SW_START (stance) and SW_END (follow-through held). Blends in from the stance (SW_IN before the load starts) and out to the
   run (in play, SW_OUT_HIT) or to the take and bat rest (SW_OUT). No clip mirror: a left-handed batter is the whole figure mirrored
   (batterWalk), so the clip follows. While it holds, the bat leaves the keyframe pivot: handle in the bottom hand, axis through the top
   hand. Called after batterWalk (the clip holds only while the proxies stay as set). Dev switch ?off=mocap. */
const SWING_CLIP_URL='assets/mocap/swing_124_07.json',SW_FPS=30,SW_CONTACT=85/SW_FPS,SW_START=1.6,SW_END=3.6,SW_IN=.4,SW_OUT=[ARRIVE+.6,ARRIVE+1.1],SW_OUT_HIT=[ARRIVE+.2,ARRIVE+.35],SW_HAND_GAP_MIN=.03;
let swingClip=null,swingClipP=null;const _sw0=new THREE.Vector3(),_sw1=new THREE.Vector3(),_swm=new THREE.Matrix4();
const swTime=u=>Math.max(SW_START,Math.min(SW_END,SW_CONTACT+(u-ARRIVE)));
function swW(e,u){if(!e.swing||buntE(e)||chkHalf(e,u))return 0;/* #708: a check swing is the keyframe half swing, not the full clip */const a=ARRIVE-BAT_LOAD_LEAD-SW_IN,o=e.r==='inplay'?SW_OUT_HIT:SW_OUT;
  return Math.min(ease(sat01((u-a)/SW_IN)),1-ease(sat01((u-o[0])/(o[1]-o[0]))))}
/* #303: a bunt plays bunt_124_08.json instead (square 52-64, hold 64-80, time warp and weight in render/bunt_clip.js). The clip has its
   own crouch, so the knee-bend drop of the ground frame (buntDrop) is taken back by the clip weight; the bat follows the hands as on the swing,
   and buntContact() then reads the clip's bat, so the pitch still ends on the sweet spot. */
let buntClip=null,buntClipP=null,BCL=null;
/* #646: base-hit roll under friction (render/roll.js); null until loaded -> the old fixed .8 s arc */
let RL=null;import(new URL('roll.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{RL=M}).catch(err=>console.warn('roll off',err));
let TIPB=null;import(new URL('tipball.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{TIPB=M}).catch(err=>console.warn('tip ball off',err));/* #631 */
let GRDP=null;/* #718: ground-rule double ball (render/grd_path.js) */
import(new URL('grd_path.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{GRDP=M}).catch(err=>console.warn('grd path off',err));
let GBP=null;/* #645: grounder hops (render/gb_path.js gbPath / gbGlove) */
import(new URL('gb_path.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{GBP=M}).catch(err=>console.warn('gb path off',err));
import(new URL('bunt_clip.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{BCL=M}).catch(err=>console.warn('bunt clip off',err));
/* #649 part 4: the mocap swing meets the ball ~1.5 m high wherever the pitch is, so the batter is moved (world shift of his ground frame, like the bunt's
   knee drop) by the gap between the bat's sweet spot and the pitch's contact point at ARRIVE, clamped per axis (SW_WARP_MAX: x, y, z), weighted by a window
   around ARRIVE (y clamp .85 since part 5: foul:2 .164 -> .072). The gap is measured once per event on the unshifted swing (swRaw guards the re-entry). Only the picture moves: the ball path is unchanged. */
const SW_WARP_MAX=[.4,.85,.4],SW_WARP_IN=.4,SW_WARP_OUT_AT=.12,SW_WARP_OUT=.25;
let swRaw=false,swWarpAt=null;const _swc=new THREE.Vector3();
const swWarpW=u=>ease(sat01((u-(ARRIVE-SW_WARP_IN))/SW_WARP_IN))*(1-ease(sat01((u-ARRIVE-SW_WARP_OUT_AT)/SW_WARP_OUT)));
function swingWarp(e,u){if(swRaw||OFF.has('swingwarp')||!(e.r==='inplay'||e.r==='foul')||!e.swing||swWarpW(u)<=0)return null;
  if(!(swWarpAt&&swWarpAt.e===e&&swWarpAt.c===swingClip)){const c=contactPt(e);swRaw=true;
    poseBatter(e,ARRIVE);batterWalk(e,ARRIVE);batterMocap(e,ARRIVE);batter.g.updateMatrixWorld(true);_swc.set(0,BUNT_SWEET,0);bat.localToWorld(_swc);
    const d=new THREE.Vector3(c[0]-_swc.x,c[1]-_swc.y,c[2]-_swc.z);for(let i=0;i<3;i++){const m=SW_WARP_MAX[i];d.setComponent(i,clamp(d.getComponent(i),-m,m))}
    swWarpAt={e,c:swingClip,d};poseBatter(e,u);batterWalk(e,u);batterMocap(e,u);swRaw=false}
  return swWarpAt.d}
function batterMocap(e,u){if(!batter.setMocap||OFF.has('mocap'))return;
  const bu=buntE(e);let w;
  if(bu){if(BCL&&!buntClipP&&window.PL&&PL.loadClip)buntClipP=PL.loadClip(BCL.BUNT_CLIP_URL).then(c=>{buntClip=c}).catch(x=>console.warn('mocap',x));
    w=buntClip&&BCL&&batter.g.visible?BCL.buntClipW(true,u,ARRIVE,BUNT_SQUARE_LEAD,BUNT_SQUARE_DUR):0;
    batter.setMocap(buntClip,w>0?BCL.buntClipTime(u,ARRIVE,BUNT_SQUARE_LEAD,BUNT_SQUARE_DUR):0,w,false,BCL?BCL.BUNT_CLIP_T0:0,0);if(w<=0)return;
    batter.g.position.y+=buntDrop*w}
  else{if(!swingClipP&&window.PL&&PL.loadClip)swingClipP=PL.loadClip(SWING_CLIP_URL).then(c=>{swingClip=c}).catch(x=>console.warn('mocap',x));
    w=swingClip&&batter.g.visible?swW(e,u):0;batter.setMocap(swingClip,swTime(u),w,false,SW_START,0);if(w<=0)return;
    const sh=swingWarp(e,u);if(sh){batter.g.position.addScaledVector(sh,swWarpW(u));batter.g.updateMatrixWorld(true);batter.setMocap(swingClip,swTime(u),w,false,SW_START,0)}}
  batter.handWorld(1,_sw0);batter.handWorld(0,_sw1);/* bottom hand (arms[1]) holds the handle, top hand (arms[0]) gives the axis */
  const up=batPivot.parent;up.updateMatrixWorld(true);_sw1.sub(_sw0);const L=_sw1.length();
  up.worldToLocal(_sw0);batPivot.position.lerp(_sw0,w);
  if(L>SW_HAND_GAP_MIN){_swm.copy(up.matrixWorld).invert();_sw1.transformDirection(_swm);_bv.set(0,1,0).applyQuaternion(batPivot.quaternion).lerp(_sw1,w).normalize();batPivot.quaternion.setFromUnitVectors(_up,_bv)}}
/* World position of the bat's sweet spot (call after batterWalk has placed the batter): a bunted pitch ends here and the bunted ball starts here */
function buntContact(){batter.g.updateMatrixWorld(true);_ugs.set(0,BUNT_SWEET,0);bat.localToWorld(_ugs);buntPt[0]=_ugs.x;buntPt[1]=_ugs.y;buntPt[2]=_ugs.z;return buntPt}
/* Where the bunted ball leaves the bat: the live sweet spot up to contact; after ARRIVE the spot at ARRIVE, so the ball does not follow the bat
   as the clip hands back to the run (pose at ARRIVE once per event and clip state, then the pose at u again) */
let buntAt=null;
function buntHit(e,u){if(u<=ARRIVE)return buntContact().slice();
  if(buntAt&&buntAt.e===e&&buntAt.c===buntClip&&buntAt.m===BCL)return buntAt.p;
  poseBatter(e,ARRIVE);batterWalk(e,ARRIVE);batterMocap(e,ARRIVE);const p=buntContact().slice();
  poseBatter(e,u);batterWalk(e,u);batterMocap(e,u);buntAt={e,c:buntClip,m:BCL,p};return p}
const BAT_HAND_GAP=.09,BUNT_CRACK=.3;
/* #649: a swung-at ball (foul or in play) meets the bat where the pitch is, CONTACT_Z m out in front of the plate spot's line (z .6) toward
   the pitcher: the pitch path ends there and the batted ball leaves from there, so nothing jumps at contact (was a fixed [0,1,.3]) */
const CONTACT_Z=.3;function contactPt(e){return[e.zx,.45+e.zy*.75,CONTACT_Z]}
/* Six runner bodies: up to four movers or base runners of this play plus scorers of earlier plays still jogging off to their dugout (#43) */
const runners=[0,1,2,3,4,5].map(()=>figure(matOff,pants,false,{head:'helmet'}));
/* #42 slice 1, on-deck batter: the next batter waits on his team's on-deck circle (DECK in render/props/ondeck.js: |x| 11.3, z 1.2; the
   circle is drawn on `max` only, the figure on every tier). Once the plate appearance before his is over (OD_GO_AT after a pitch that ends
   it, or the last seconds of a ball in play) he walks up to BAT_FROM, the spot the first-pitch walk-in (batterWalk) starts from, going
   round behind the umpire (OD_BEHIND_Z) when his box is on the other side; at the same moment the batter after him walks out of the
   dugout to the circle. So nobody appears at the plate between two batters of one half inning. Only when the next pitch (past a vote or a
   pitching change, where they hold) is to the same team. Slice 3: the leadoff pair comes out of the dugout in a BRK/PRE frame, the
   on-deck man of the side just retired goes back to it (odLead, odOff). Pure function of (event, time, neighbouring events). */
const OD_AT=[11.3,1.2],OD_GO_AT=ARRIVE+1.5,OD_WALK_V=1.8,OD_JOG_V=2.4,OD_HOLD=.6,OD_MIN_DUR=.5,OD_BEHIND_Z=4.2,OD_LEAD_PRE_AT=2,OD_SUB_GO=1;/* OD_SUB_GO: s into a pinch-hit SUB frame when he leaves the dugout */
const odSpot=t=>[(t===0?1:-1)*OD_AT[0],OD_AT[1]];/* team 0 (road) on +x, like dugout(0) */
/* #128 item 3: the walk F -> A of a man whose box is on the far side goes round behind the umpire, then down the far side at OD_ROUND_X:
   the straight line from behind the plate to BAT_FROM ran through the plate umpire walking back from UMP_GIVE after a ball in play
   (0.19 m apart on seed 704, 445 passes under 0.55 m on 31 seeds) */
const OD_ROUND_X=3,odRoute=(F,A)=>Math.sign(F[0])===Math.sign(A[0])?[F,A]:[F,[0,OD_BEHIND_Z],[Math.sign(A[0])*OD_ROUND_X,OD_BEHIND_Z],A];
const odNext=figure(matOff,pants,false,{role:'batter',head:'helmet'}),odDeck=figure(matOff,pants,false,{role:'batter',head:'helmet'});
/* #42 slice 5: both on-deck men carry a bat (role 'batter' = the batter's rig and frame, lefty = whole figure mirrored, like batterWalk).
   On the circle he stands side-on to the plate and takes one slow practice swing per pitch (BK stance -> contact -> follow-through, then
   back, odSwingS); between swings and walking, the bat rests on his shoulder (BAT_REST) and only
   the legs walk (f.armsHeld keeps animate off the arms). Pure function of (event, time). */
const OD_SWING_AT=.9,OD_UP_DUR=.5,OD_SWING_DUR=.9,OD_BACK_DUR=1.1,OD_SWING_SLOW=.7;
function odBatOf(f){const P=new THREE.Group(),b=window.PL?PL.makeBat(0xc9a06a):new THREE.Mesh(new THREE.CylinderGeometry(.04,.022,.85,8),SM(0xc9a06a,.45));
  if(!window.PL)b.position.y=.42;b.castShadow=true;P.add(b);f.rig.up.add(P);f.batP=P;return P}
odBatOf(odNext);odBatOf(odDeck);
const BKS=k=>(s,c)=>{const a=BK[k];if(s<=1)return lerp(a[0],a[1],s);if(s<=2)return lerp(a[1],c===undefined?a[2]:c,s-1);return lerp(c===undefined?a[2]:c,a[3],Math.min(s-2,1))};
/* s 0..3 along the batter keyframes (0 stance, 1 load, 2 contact, 3 follow-through), r 0..1 toward the bat-on-shoulder rest */
function odHold(f,s,r,lf){const R=f.rig,K=k=>lerp(BKS(k)(s),BAT_REST[k]!==undefined?BAT_REST[k]:BKS(k)(s),r);f.auto=false;f.armsHeld=true;
  const yaw=K('yaw')*OD_SWING_SLOW;R.up.rotation.set(lerp(BKS('lean')(s),0,r),yaw,0);R.hips.rotation.y=yaw*.6;R.hg.rotation.y=lerp(BKS('head')(s),0,r)-yaw;
  const gx=K('hx'),gy=K('hy'),gz=K('hz');_bv.set(K('bx'),K('by'),K('bz')).normalize();f.batP.position.set(gx,gy,gz);f.batP.quaternion.setFromUnitVectors(_up,_bv);
  aimArm(R.a0,-BAT_SHOULDER_X,gx+_bv.x*BAT_HAND_GAP,gy+_bv.y*BAT_HAND_GAP,gz+_bv.z*BAT_HAND_GAP);aimArm(R.a1,BAT_SHOULDER_X,gx,gy,gz);f.g.scale.x=lf?-1:1}
/* one practice swing per pitch, early in the frame (done by OD_SWING_END, inside PITCH_STILL, so a compact cut never lands in it):
   bat up from the shoulder to the stance, swing through, back to the stance, down to the shoulder. Returns [s 0..3, rest 0..1] at u */
const OD_SWING_END=OD_SWING_AT+OD_SWING_DUR+OD_BACK_DUR+OD_UP_DUR;
function odSwingS(u){const a=OD_SWING_AT,b=a+OD_SWING_DUR,r=ease(sat01((a-u)/OD_UP_DUR))+ease(sat01((u-b-OD_BACK_DUR)/OD_UP_DUR));
  return[u<b?3*ease(sat01((u-a)/OD_SWING_DUR)):3*(1-ease(sat01((u-b)/OD_BACK_DUR))),Math.min(r,1)]}
function odPath(pts){const cum=[0];for(let i=1;i<pts.length;i++)cum.push(cum[i-1]+Math.hypot(pts[i][0]-pts[i-1][0],pts[i][1]-pts[i-1][1]));return{pts,cum,L:cum[cum.length-1]}}
function odAt(P,k){const d=k*P.L;let i=1;while(i<P.pts.length-1&&P.cum[i]<d)i++;const a=P.pts[i-1],b=P.pts[i],s=P.cum[i]-P.cum[i-1],t=s>0?sat01((d-P.cum[i-1])/s):1;
  return[lerp(a[0],b[0],t),lerp(a[1],b[1],t),b[0]-a[0],b[1]-a[1]]}
const odGap=k=>k==='VOTE'||k==='CHG'||k==='VIS'||k==='SUB';/* frames with no pitch inside a half inning: a vote, a pitching change, a mound visit, a pinch hitter / runner (#436) */
/* #436 part 4: who holds a lineup slot at a frame (render/lineup.js: pinch hitters and runners stay in). Module not in yet, or no
   substitution: the roster's own `bat`, as before. */
let lineM=null,luG=null,luF=null;
import(new URL('lineup.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{lineM=M}).catch(err=>console.warn('lineup follow off',err));
const luOf=()=>{if(game&&(luG!==game||(!luF&&lineM))){luG=game;luF=lineM?lineM.lineupsByFrame(game.ev,game.stream,ROSTERS):null}return luG===game?luF:null};
const lineupNow=(e,t)=>{const L=luOf();return L?L.lineupAt(e,t):undefined};
function batOf(e,k=0){const L=luOf(),b=L&&L.batterOf(e,k);if(b)return b;const R=ROSTERS[e.bat[0]].bat;return R[(e.bat[1]+k)%R.length]}
/* a pinch-hit SUB frame (no `base`; a pinch runner has one) between pitch i and pitch j: the new man comes from the dugout in it */
const odPhBetween=(ev,i,j)=>{for(let k=i+1;k<j;k++)if(ev[k].k==='SUB'&&ev[k].base===undefined&&ev[k].role!=='defensive')return true;return false};
function odNextP(ev,i){let j=i+1;while(ev[j]&&odGap(ev[j].k))j++;return ev[j]&&ev[j].k==='P'&&ev[j].bat?j:-1}
/* The walk to the plate of the batter of pitch n (team t): `from` = the circle (he was on deck) or the dugout (leadoff, slice 3), the
   batter after him jogs dugout -> circle. Both start at `go` (event-local s) and are done by OD_HOLD before the event ends. */
function odMake(e,n,from,go,v){const t=n.bat[0],nb=batOf(n),lf=nb&&nb.hand==='L',D=odSpot(t),A=[lf?-BAT_FROM[0]:BAT_FROM[0],BAT_FROM[1]],G=dugout(t);
  const F=from==='deck'?D:G,walk=odPath(odRoute(F,A)),jog=odPath([G,D]),room=Math.max(e.d-OD_HOLD-go,OD_MIN_DUR);
  return{go,walk,jog,t1:Math.min(walk.L/v,room),t2:Math.min(jog.L/OD_JOG_V,room),box:[lf?-BAT_BOX[0]:BAT_BOX[0],BAT_BOX[1]],nb,nn:batOf(n,1)}}
/* Pitch i ends a plate appearance and the next pitch (past a vote or a pitching change) is to the same team: on-deck man walks up */
function odPlan(ev,i){const e=ev[i],j=odNextP(ev,i),n=ev[j];if(!e||e.k!=='P'||!e.pa||!e.bat||j<0||n.bat[0]!==e.bat[0]||odPhBetween(ev,i,j))return null;
  const t=e.bat[0],nb=batOf(n),lf=nb&&nb.hand==='L',D=odSpot(t),A=[lf?-BAT_FROM[0]:BAT_FROM[0],BAT_FROM[1]];
  const L=odPath(odRoute(D,A)).L,J=odPath([dugout(t),D]).L;
  return odMake(e,n,'deck',e.r==='inplay'?Math.max(0,e.d-OD_HOLD-Math.max(L/OD_WALK_V,J/OD_JOG_V)):OD_GO_AT,OD_WALK_V)}
/* #42 slice 3: a half-inning break or the pregame (i = BRK/PRE) before the leadoff pitch: the leadoff man and the batter after him come
   out of their dugout (BRK: when the fielders change, BRK_ON_AT; PRE: OD_LEAD_PRE_AT), jogging, and stand at BAT_FROM / on the circle */
function odLead(ev,i){const e=ev[i],j=odNextP(ev,i);if(j<0||!(e.k==='BRK'||e.k==='PRE'))return null;return odMake(e,ev[j],'dugout',e.k==='BRK'?BRK_ON_AT:OD_LEAD_PRE_AT,OD_JOG_V)}
/* ... and the on-deck man of the side that has just made its third out (or ended the game) jogs circle -> dugout and goes down the steps */
function odOff(ev,i){const e=ev[i];if(e.k!=='BRK'&&e.k!=='END')return null;let b=i-1;while(ev[b]&&odGap(ev[b].k))b--;const q=ev[b];if(!q||q.k!=='P'||!q.bat)return null;
  const t=q.bat[0],path=odPath([odSpot(t),dugout(t)]);return{go:e.k==='BRK'?BRK_OFF_AT:0,path,t:path.L/OD_JOG_V,team:t,p:batOf(q,1)}}
const odEnd=(ev,i)=>{const o=odOff(ev,i),l=odLead(ev,i);return Math.max(o?o.go+o.t:0,l?l.go+Math.max(l.t1,l.t2):0)};/* cpEvents: they move until here */
function poseOnDeck(e,u,ei){odNext.g.visible=odDeck.g.visible=false;if(!game)return;
  const ev=game.ev,put=(f,p,x,z,fx,fz)=>{resetPose(f);f.noAnim=false;f.g.visible=true;f.g.position.set(x,0,z);setNum(f,p?p.num:undefined);dress(f,p);face(f,fx,fz);odHold(f,0,1,p&&p.hand==='L')};
  /* waiting on the circle: side-on to the plate (batter frame, +z at the plate), practice swings; the bat comes down to rest once it is time to walk */
  const deck=(t,p,uu,go)=>{const D=odSpot(t);put(odDeck,p,D[0],D[1],-D[0],-D[1]);if(uu===undefined)return;odDeck.noAnim=true;
    const [sw,r]=odSwingS(uu);odHold(odDeck,sw,go===undefined?r:Math.max(r,ease(sat01((uu-(go-OD_UP_DUR))/OD_UP_DUR))),p&&p.hand==='L')};
  const walkUp=(pl,u)=>{const k1=sat01((u-pl.go)/pl.t1),k2=sat01((u-pl.go)/pl.t2),[ax,az,adx,adz]=odAt(pl.walk,k1),[bx,bz,bdx,bdz]=odAt(pl.jog,k2);
    if(k1<1)put(odNext,pl.nb,ax,az,adx,adz);else put(odNext,pl.nb,ax,az,pl.box[0]-ax,pl.box[1]-az);
    if(k2<1)put(odDeck,pl.nn,bx,bz,bdx,bdz);else put(odDeck,pl.nn,bx,bz,-bx,-bz)};
  if(e.k==='P'){if(!e.bat)return;const pl=odPlan(ev,ei);if(!pl||u<pl.go){deck(e.bat[0],batOf(e,1),u,pl?pl.go:undefined);return}walkUp(pl,u);return}
  if(e.k==='SUB'&&e.base===undefined&&e.role!=='defensive'){const j=odNextP(ev,ei);if(j>=0){walkUp(odMake(e,ev[j],'dugout',OD_SUB_GO,OD_WALK_V),u);return}}/* #436: the pinch hitter walks up from the dugout, the next man jogs to the circle */
  if(odGap(e.k)){/* a vote or a pitching change: everyone holds where the frame before left him */
    let b=ei-1;while(ev[b]&&odGap(ev[b].k))b--;const q=ev[b];if(!q)return;
    if(q.k==='BRK'||q.k==='PRE'){const pl=odLead(ev,b);if(pl)walkUp(pl,Infinity);return}
    if(q.k!=='P'||!q.bat)return;const pl=odPlan(ev,b);if(pl){walkUp(pl,Infinity);return}deck(q.bat[0],batOf(q,1));return}
  const o=odOff(ev,ei);if(o&&u<o.go+o.t){const k=sat01((u-o.go)/o.t),[x,z,dx,dz]=odAt(o.path,k);if(k>0)put(odDeck,o.p,x,z,dx,dz);else deck(o.team,o.p)}
  const pl=odLead(ev,ei);if(pl&&u>=pl.go)walkUp(pl,u)}
/* #42 slice 2 (owner 11/22 14:25): field umpires and base coaches at their posts, idle poses only (no signals yet). Base umpires (dark,
   matUmp) stand at first, second and third on every event; their numbers, and the plate umpire's, come from league/staff.js
   crewFor(seed). The two base coaches wear the batting team's kit (matCo) with the numbers and names of STAFF `<team>-first`/`<team>-third`
   and stand in the coach's boxes facing the plate. At a half-inning break the old pair jogs to its dugout from BRK_OFF_AT and the new pair
   jogs out from BRK_ON_AT (round behind home plate, ST_BEHIND_Z, when the box is on the far side); at PRE they jog out, at END they jog off.
   Posts are [s, d]: s metres from home along the base line, d metres into foul ground, so one pair of numbers mirrors to third.
   Pure function of (event, time); the names wait for the module (no number until it is in). */
const ST_UMP_POST=[32,1.2],ST_U2_POST=[-2.5,-47],ST_U2_IN=[-3,-30],ST_U2_V=4,ST_U2_SETTLE=.3,ST_BOX=[24,5.5],ST_JOG_V=4,ST_BEHIND_Z=5;
const lineXZ=(side,[s,d])=>[side*(s+d)*Math.SQRT1_2,(d-s)*Math.SQRT1_2];/* side +1 = first-base line, -1 = third */
const stUmpAt=[lineXZ(1,ST_UMP_POST),ST_U2_POST,lineXZ(-1,ST_UMP_POST)],ST_CREW=['first','second','third'],ST_ROLE=['first','third'];
/* #612 part 1 (render/rail.js): bench players at the front rail of both dugouts, idle (every other one leans on the rail), clapping when their side scores.
   Tier budget: max 4 figures per dugout, others 2 (8 / 4 figures, one skinned mesh set each). Same bodies all game: nobody appears or vanishes (#42). */
let railM=null;import(new URL('rail.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{railM=M}).catch(err=>console.warn('rail off',err));
/* #612 part 2 (render/coachsig.js): the third-base coach windmills a runner home and holds one at third with both arms, read from the P event's moves. Off with ?off=coachsig. */
let csigM=null;import(new URL('coachsig.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{csigM=M}).catch(err=>console.warn('coach signals off',err));
function coachSigPose(f,e,u){if(!csigM||OFF.has('coachsig')||!e||e.k!=='P')return;const g=csigM.signalAt(csigM.coachSignals(e),u),h=g&&csigM.handsFor(g);if(!h)return;
  f.auto=false;f.armsHeld=true;aimArm(f.rig.a1,BAT_SHOULDER_X,h.r[0],h.r[1],h.r[2]);aimArm(f.rig.a0,-BAT_SHOULDER_X,-h.l[0],h.l[1],h.l[2])}
/* #612 part 3: the first-base coach pumps both palms down ("back!") on a pickoff throw (P event with po), same switch. */
function coachBackPose(f,e,u){if(!csigM||OFF.has('coachsig')||!e||e.k!=='P'||!e.po)return;const g=csigM.signalAt(csigM.backSignals(e),u),h=g&&csigM.handsFor(g);if(!h)return;
  f.auto=false;f.armsHeld=true;aimArm(f.rig.a1,BAT_SHOULDER_X,h.r[0],h.r[1],h.r[2]);aimArm(f.rig.a0,-BAT_SHOULDER_X,-h.l[0],h.l[1],h.l[2])}
const railFigs=[0,1].map(t=>[0,1,2,3].map(()=>figure(matBn[t],pants,false)));
function poseRail(e,u){const R=railM;for(const t of [0,1]){const n=!R||OFF.has('rail')?0:gfxMax?R.RAIL_N:2,P=ROSTERS[t].bench||[],c=R&&e&&e.s0&&e.s0.half===t?R.clapAt(R.scoreTimes(e),u):{w:0,phase:0};
  if(R)paintKit(matBn[t],t);
  railFigs[t].forEach((f,i)=>{f.g.visible=i<n;if(i>=n)return;const sl=R.railSlot(dugout(t),i),h=R.handsAt(sl,c.w,c.phase),b=P[i];
    resetPose(f);f.noAnim=true;f.g.position.set(sl.x,0,sl.z);face(f,sl.fx,sl.fz);setNum(f,b?b.num:undefined);
    if(h){f.auto=false;f.armsHeld=true;aimArm(f.rig.a1,BAT_SHOULDER_X,h[0],h[1],h[2]);aimArm(f.rig.a0,-BAT_SHOULDER_X,-h[0],h[1],h[2])}else f.armsHeld=false})}}
/* #612 part 4 (render/pen.js): two relievers and a bullpen catcher in each pen (max tier only, like the pen props). From a pitching vote (VOTE kind P) one reliever walks to the
   rubber, throws to the crouched catcher until the change or a "stay", then walks back / on to the gate where the reliever of #611 takes over. Off with ?off=pen. */
let penM=null;import(new URL('pen.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{penM=M}).catch(err=>console.warn('pen people off',err));
const penFigs=[0,1].map(t=>[0,1,2].map(()=>figure(matBn[t],pants,false)));
function posePen(e,u){const M=penM;if(!M)return;const T=e&&Number.isFinite(e.t)?e.t+u:0;
  for(const t of [0,1]){const side=M.sideOf(t);penFigs[t].forEach((f,i)=>{const on=gfxMax&&!OFF.has('pen')&&e;f.g.visible=!!on;if(!on)return;resetPose(f);f.noAnim=true;
    if(i===2){const [x,z]=M.penWorld(side,M.PEN_CATCHER[0],M.PEN_CATCHER[1]),[fx,fz]=M.penDir(side,-1,0);f.g.position.set(x,0,z);face(f,fx,fz);setNum(f,undefined);
      crouch(f,f.rig,1,CROUCH_FWD,CROUCH_SPLAY,CROUCH_LEAN,CROUCH_SHRINK);aimArm(f.rig.a0,-BAT_SHOULDER_X,-.3,.5,.6);return}
    const st=M.warmAt(game&&game.ev,t,i,T);if(st&&st.over){f.g.visible=false;return}
    const r=M.relieverAt(i,st),[x,z]=M.penWorld(side,r.p[0],r.p[1]),[fx,fz]=M.penDir(side,r.face[0],r.face[1]);f.g.position.set(x,0,z);face(f,fx,fz);setNum(f,undefined);
    if(st&&st.k==='throw'){const h=M.throwHands(st.tt);f.auto=false;f.armsHeld=true;aimArm(f.rig.a1,BAT_SHOULDER_X,h.r[0],h.r[1],h.r[2]);aimArm(f.rig.a0,-BAT_SHOULDER_X,-h.l[0],h.l[1],h.l[2])}
    else if(st&&st.f<1&&st.f>0){f.noAnim=false;f.armsHeld=false}else f.armsHeld=false})}}
/* #612 part 6 (render/ballkid.js): a ball kid sits out on each foul line in the home team's colours, idle, the whole game (nobody appears or vanishes). Off with ?off=ballkid. */
let kidM=null;const kidFigs=[1,-1].map(()=>{const f=figure(matBn[1],pants,false);f.g.scale.setScalar(.88);f.g.visible=false;return f});
import(new URL('ballkid.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{kidM=M;kidFigs.forEach(f=>f.g.scale.setScalar(M.KID_SCALE))}).catch(err=>console.warn('ball kids off',err));
/* #612 part 7: the kid on a foul bunt's side fetches the dribbled ball (ballkid.js kidAt from the seconds since that pitch arrived, read over the last 3 events so the trip runs on into the next frame); showing only, the compact cut keeps him idle */
function kidFoulTT(e,u,ei){if(cpOn()||!game||!game.ev||!Number.isFinite(ei)||!Number.isFinite(e.t))return null;for(let j=ei;j>=0&&j>=ei-2;j--){const q=game.ev[j];if(q&&q.k==='P'&&q.r==='foul'&&q.bunt&&Number.isFinite(q.t))return{side:q.foulDir,tt:e.t+u-(q.t+ARRIVE)}}return null}
function poseKids(e,u,ei){const ft=kidM&&e?kidFoulTT(e,u,ei):null;kidFigs.forEach((f,i)=>{const on=!!(kidM&&e&&!OFF.has('ballkid'));f.g.visible=on;if(!on)return;const side=i?-1:1,a=ft&&ft.side===side?kidM.kidAt(side,ft.tt):kidM.kidAt(side,null);
  resetPose(f);f.noAnim=a.k==='idle';f.g.position.set(a.x,0,a.z);face(f,a.fx,a.fz);setNum(f,undefined);f.rig.up.rotation.x=a.lean})}
const umpB=stUmpAt.map(()=>{const f=figure(matUmp,matUmp,false);f.g.scale.y=.95;return f}),coaches=ST_ROLE.map(()=>figure(matCo,pants,false));
/* #81: on a pitching change (CHG) the fielding team's manager (STAFF `<team>-manager`, his number and name) walks from his dugout to the
   mound and back inside the frame: render/visit.js plans it (pure). A mound visit (engine VIS frame) is the same walk by the pitching coach
   (STAFF `<team>-pitching`). Until that module is in he stays in the dugout and cpEvents keeps the
   whole frame. */
const mgr=figure(matMgr,pants,false);mgr.g.visible=false;let visitM=null;
/* #266 item 2: on a home run WELCOME_N teammates come out of the batting team's dugout, line up along the scorers' path (peelPath) and
   hop with their arms up as the runners come through, then walk back behind the batter: render/welcome.js plans it (pure). The walk back
   runs into the next frames of the same half, so the pose looks back up to WEL_LOOK s for the latest home run. Who: lineup men not
   scoring on the play and not the next two hitters (on deck), then the bench arms. Module not in yet -> nobody comes out. */
let welM=null;const WEL_LOOK=60,welCache=new WeakMap(),welF=[0,1,2,3,4].map(()=>figure(matOff,pants,false));welF.forEach(f=>f.g.visible=false);
import(new URL('welcome.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{welM=M}).catch(err=>console.warn('home-run welcome off',err));
function welPlanOf(q){if(!welM||!q||q.k!=='P'||!q.play||q.play.res!=='HR'||!q.moves||!q.bat)return null;if(welCache.has(q))return welCache.get(q);
  const off=q.s0.half,arr=q.moves.filter(m=>m[1]===4).map(m=>m[3].arriveT),pl=arr.length?welM.welcomePlan(dugout(off),peelPath(off,false),Math.min(...arr),Math.max(...arr)):null;
  if(pl){const R=ROSTERS[off],skip=new Set(q.moves.map(m=>m[2]));for(const k of [1,2]){const b=batOf(q,k);if(b)skip.add(b.name)}
    pl.who=(lineupNow(q,off)||R.bat).filter(b=>!skip.has(b.name)).concat(R.pit.filter(p=>!skip.has(p.name))).slice(0,pl.members.length)}
  welCache.set(q,pl);return pl}
/* the latest home run of this half whose party is still out at T (game s) -> [plan, frame-local s] or null */
function welNow(ev,ei,T,off){for(let j=ei;j>=0&&T-ev[j].t<WEL_LOOK;j--){const q=ev[j];if(q.k!=='P'||q.s0.half!==off)continue;const pl=welPlanOf(q);if(pl)return T-q.t<pl.end?[pl,T-q.t]:null}return null}
function poseWelcome(e,u,ei){welF.forEach(f=>f.g.visible=false);if(!game||!welM||!e.s0)return;const off=e.s0.half,w=welNow(game.ev,ei,e.t+u,off);if(!w)return;const [pl,uq]=w;
  pl.members.forEach((m,i)=>{const f=welF[i],a=welM.welcomeAt(pl,i,uq);if(!a.visible)return;const p=pl.who[i];resetPose(f);f.noAnim=!a.moving;f.g.visible=true;f.g.position.set(a.x,a.hop,a.z);
    setNum(f,p?p.num:undefined);dress(f,p);face(f,a.fx,a.fz);if(a.arms>0){const R=f.rig;R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1;R.a0.rotation.set(-2.8*a.arms,0,-.35*a.arms);R.a1.rotation.set(-2.8*a.arms,0,.35*a.arms)}})}

import(new URL('visit.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{visitM=M}).catch(err=>console.warn('mound visit off',err));
let pbM=null,pbOn=false,pbS=0,pbSeed=0,pbEi=0,pbDur=12,pbSit=null;/* #642 part 2: pitcher seed (id hash), event index and frame length for the rubber routine */
const pbGlove=h=>{if(!pbOn||!pbM||OFF.has('pbback'))return h;const g=fielders.P.handWorld(0);return[g.x,g.y,g.z]};/* #642 part 1: the pitcher's return-throw routine (pitchback.js); pbOn = this frame is a pitch the catcher lobs back */
import(new URL('pitchback.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{pbM=M}).catch(err=>console.warn('pitcher routine off',err));
const visitOf=e=>visitM&&e&&(e.k==='CHG'||e.k==='VIS')?visitM.visitPlan(dugout(e.def!==undefined?e.def:1-e.s0.half),fielders.P.home,e.d):null;
let staffM=null;const stHere=document.currentScript&&document.currentScript.src;
import(new URL('../league/staff.js',stHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{staffM=M}).catch(err=>console.warn('staff numbers off',err));
const stCrew=new Map(),teamIdOf=t=>{const T=TEAMS[game&&game.teams?game.teams[t]:t];return T&&T.id};
function crewNums(seed){if(!staffM||!staffM.crewFor)return null;if(!stCrew.has(seed)){const c=staffM.crewFor(seed),o={};for(const k in c){const u=staffM.umpire(c[k]);o[k]=u?u.num:undefined}stCrew.set(seed,o)}return stCrew.get(seed)}
const stPath=(i,team)=>{const side=i?-1:1,B=lineXZ(side,ST_BOX),G=dugout(team);return odPath(Math.sign(G[0])===side?[G,B]:[G,[0,ST_BEHIND_Z],B])};
const stJogDur=(team,i)=>stPath(i,team).L/ST_JOG_V,stJogEnd=(team,t0)=>t0+Math.max(stJogDur(team,0),stJogDur(team,1));/* cpEvents: they move until here */
/* #42 slice 9: with a runner on base the second-base umpire works inside, on the infield grass between the mound and second on the
   shortstop's side (ST_U2_IN, off the catcher-to-second throw line x = 0), and goes back behind the bag (ST_U2_POST) when the bases
   empty. He never jumps: an event whose base state differs from the next event's ends with his jog (ST_U2_V) from one spot to the
   other, starting ST_U2_SETTLE after the last runner of the play arrives (on a half-inning break: out at BRK_OFF_AT, in at BRK_ON_AT
   when the next half starts with a runner, the extra-inning runner on second), and finishing inside the event (cpEvents keeps it on
   screen). Base state = e.s0.b of the event; END ends empty.
   Pure function of (event list, index, time). */
const u2In=e=>!!(e&&e.k!=='PRE'&&e.s0&&e.s0.b&&e.s0.b.some(Boolean)),u2Cache=new WeakMap();
const u2Spot=inside=>inside?ST_U2_IN:ST_U2_POST,u2Dur=()=>Math.hypot(ST_U2_IN[0]-ST_U2_POST[0],ST_U2_IN[1]-ST_U2_POST[1])/ST_U2_V;
function u2Plan(ev,i){const e=ev[i];if(!e)return null;if(u2Cache.has(e))return u2Cache.get(e);
  const a=u2In(e),b=e.k==='END'?false:i+1<ev.length?u2In(ev[i+1]):a;let pl=null;
  if(a!==b){const T=u2Dur();let go=e.k!=='BRK'?0:b?BRK_ON_AT:BRK_OFF_AT;for(const m of e.moves||[])if(m[3]&&Number.isFinite(m[3].arriveT))go=Math.max(go,m[3].arriveT+ST_U2_SETTLE);
    if(e.k==='P'&&e.r==='inplay')go=Math.max(go,ARRIVE+ST_U2_SETTLE);if(Number.isFinite(e.d))go=Math.max(0,Math.min(go,e.d-T));
    pl={go,t:T,path:odPath([u2Spot(a),u2Spot(b)])}}
  const r={a,b,pl};u2Cache.set(e,r);return r}
/* #42: from inside he turns to watch the play at first while U1 calls it (render/u2watch.js; no turn until the module is in) */
let u2wM=null;import(new URL('u2watch.js',stHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{u2wM=M}).catch(err=>console.warn('u2 watch off',err));
function u2Watch(f,e,u){if(!u2wM)return;const w=u2wM.watchWeight(bcCalls(e),1,u,{up:BC_UP,hold:BC_HOLD,down:BC_DOWN});if(w<=0)return;
  const p=f.g.position,[bx,bz]=BASES[1];f.g.rotation.y=u2wM.turnYaw(f.g.rotation.y,p.x,p.z,bx,bz,u2wM.U2_WATCH.TURN*w)}
const u2End=(ev,i)=>{const q=u2Plan(ev,i);return q&&q.pl?q.pl.go+q.pl.t:0};/* cpEvents: he moves until here */
function u2At(ev,i,u){const q=u2Plan(ev,i);if(!q)return[...ST_U2_POST,0,0,false];if(!q.pl)return[...u2Spot(q.a),0,0,false];
  const k=sat01((u-q.pl.go)/q.pl.t),[x,z,dx,dz]=odAt(q.pl.path,k);return[x,z,dx,dz,k>0&&k<1]}
function poseStaff(e,u,ei){const crew=crewNums(seedCur);setNum(ump,crew?crew.plate:undefined);
  umpB.forEach((f,i)=>{let [x,z]=stUmpAt[i],mv=null;if(i===1&&game&&Number.isFinite(ei)){const p=u2At(game.ev,ei,u);x=p[0];z=p[1];if(p[4])mv=p}resetPose(f);f.noAnim=false;f.g.visible=true;f.gw=1;f.g.position.set(x,0,z);if(mv)face(f,mv[2],mv[3]);else face(f,-x,-z);setNum(f,crew?crew[ST_CREW[i]]:undefined);bcPose(f,i+1,e,u);lineSigPose(f,i+1,e,u);infSigPose(f,i+1,e,u);chkSigPose(f,i+1,e,u);
    if(i===1&&!mv&&!f.armsHeld&&x===ST_U2_IN[0]&&z===ST_U2_IN[1])u2Watch(f,e,u)});
  const off=e.s0?e.s0.half:0,brk=e.k==='BRK',on=brk&&u>=BRK_ON_AT,team=on?1-off:off,leave=brk&&!on||e.k==='END',walk=brk||e.k==='PRE'||e.k==='END',t0=on?BRK_ON_AT:brk?BRK_OFF_AT:0;
  paintKit(matCo,team);const tid=teamIdOf(team),S=staffM&&staffM.STAFF||[];
  coaches.forEach((f,i)=>{const P=stPath(i,team),k=walk?sat01((u-t0)/(P.L/ST_JOG_V)):1,[x,z,dx,dz]=odAt(P,leave?1-k:k),p=S.find(q=>q.id===`${tid}-${ST_ROLE[i]}`);
    resetPose(f);f.noAnim=false;f.g.visible=!(leave&&k>=1);f.gw=!walk?1:leave?0:sat01((k-GW_ARRIVE)/(1-GW_ARRIVE));f.g.position.set(x,0,z);if(k>0&&k<1)face(f,leave?-dx:dx,leave?-dz:dz);else face(f,-x,-z);
    setNum(f,p?p.num:undefined);if(f.setName)f.setName(p&&p.name);if(i===1&&!walk)coachSigPose(f,e,u);if(i===0&&!walk)coachBackPose(f,e,u)});
  poseRail(e,u);posePen(e,u);poseKids(e,u,ei);
  const vp=visitOf(e),va=visitM&&vp?visitM.visitAt(vp,u):null;mgr.g.visible=!!(va&&va.visible);
  if(mgr.g.visible){const dt=e.def!==undefined?e.def:1-off,m=S.find(q=>q.id===`${teamIdOf(dt)}-${e.k==='VIS'?'pitching':'manager'}`);paintKit(matMgr,dt);resetPose(mgr);mgr.noAnim=false;
    mgr.g.position.set(va.x,0,va.z);face(mgr,va.fx,va.fz);setNum(mgr,m?m.num:undefined);if(mgr.setName)mgr.setName(m&&m.name)}}
/* #42 slice 6 (item 3: "step out of the way ... rather than be walked through"): after the frame is posed, each base umpire and base
   coach is pushed off his post by every visible runner, fielder or batter closer than GW_R, by GW_MAX x smoothstep(1 - d/GW_R) along the
   line from that mover to the post, leaned GW_OUT toward foul ground for the line staff (U2 behind second has no foul side); the sum is
   capped at GW_MAX. Pure function of the posed frame, so of (event, time): a seek lands where playing would; animate() gives the step its
   legs. Throws are not dodged (the ball passes over or beside the posts). */
const GW_R=4,GW_MAX=1.5,GW_OUT=.6,GW_ARRIVE=.8;/* a coach on his jog gives no way (f.gw 0: the dugout is where catchers and fielders vanish, a snap); it fades in over the last fifth of the jog to the box */
const gwFoul=[[Math.SQRT1_2,Math.SQRT1_2],null,[-Math.SQRT1_2,Math.SQRT1_2]],gwCoachFoul=[gwFoul[0],gwFoul[2]];/* foul-side unit normal of each line */
function staffGiveWay(){const mv=[...FIELDER_KEYS.map(k=>fielders[k]),...runners,batter].filter(m=>m.g.visible);let most=0;
  const push=(f,out)=>{if(!f.g.visible)return;const p=f.g.position;let ox=0,oz=0;
    for(const m of mv){let dx=p.x-m.g.position.x,dz=p.z-m.g.position.z;const d=Math.hypot(dx,dz);if(d>=GW_R)continue;
      const w=1-d/GW_R,k=GW_MAX*w*w*(3-2*w);if(d>1e-4){dx/=d;dz/=d}else{dx=0;dz=0}
      if(out){dx+=out[0]*GW_OUT;dz+=out[1]*GW_OUT}const n=Math.hypot(dx,dz)||1;ox+=dx/n*k;oz+=dz/n*k}
    const o=Math.hypot(ox,oz);if(o>GW_MAX){ox*=GW_MAX/o;oz*=GW_MAX/o}const g=f.gw===undefined?1:f.gw;ox*=g;oz*=g;p.x+=ox;p.z+=oz;most=Math.max(most,Math.hypot(ox,oz))};
  umpB.forEach((f,i)=>push(f,gwFoul[i]));coaches.forEach((f,i)=>push(f,gwCoachFoul[i]));return most}
/* #42 slice 7 (item 3: "out/safe ... signals driven by the engine events", rule 12: the event is right): the umpire of each bag calls the
   plays at first, second and third, from the engine's plan only. A 'touch' (force) or 'tag' action at the bag = out, from its time; a throw
   'receive'd at a bag where nobody is out and a runner of e.moves arrives there within BC_CLOSE s of the ball = safe, from the later of the
   two (a ball coming back in long after the runner is no play: no call). Out = the fist: upper arm out at shoulder height, fist beside the
   head (UC_HAMMER), one sharp beat (UC_BEAT). Safe = both arms crossed in front of the chest (BC_CROSS) sweep out flat to the sides
   (BC_SPREAD). He turns BC_TURN of the way from home to the bag while he calls. In-play plan times count from ARRIVE, steal plans from
   the event start. Pure function of (event, time).
   #42 slice 8: plays at the plate (b 4, same rules) are the plate umpire's (bcPose on `ump` after placeUmp; today only the tag-up
   throw home, which the engine makes arrive after the runner = safe). A fly caught for an out (plan action 'catch', rule 13: the catch is
   the out) gets the out fist from the umpire whose ground it falls in (BC_FLY_UMP by fielder: left side U3, centre U2, right side U1,
   the pitcher's pop-up the plate umpire), turned toward the catch spot (`at`) instead of a bag, from the catch + BC_DELAY. */
const BC_DELAY=.15,BC_UP=.2,BC_BEAT_AT=.25,BC_HOLD=1,BC_DOWN=.4,BC_SWEEP_AT=.15,BC_SWEEP=.25,BC_CLOSE=1.2,BC_TURN=.7;
const BC_REST=[BAT_SHOULDER_X,BAT_SHOULDER_Y-BAT_ARM_LEN,0],BC_CROSS=[-.12,.62,.36],BC_SPREAD=[.88,.62,.12],bcCache=new WeakMap();
const BC_FLY_UMP={LF:3,'3B':3,SS:3,CF:2,RF:1,'1B':1,'2B':1,P:4,C:4},bcBag=b=>b>=1&&b<=4;
function bcCalls(e){if(bcCache.has(e))return bcCache.get(e);const C=[],S=e.plan;
  if(e.k==='P'&&S&&S.actions&&(e.r==='inplay'||e.sbGo||e.po)){const t0=e.r==='inplay'?ARRIVE:0,mv=e.moves||[],outAt=new Map();
    for(const a of S.actions)if((a.a==='touch'||a.a==='tag')&&bcBag(a.base))outAt.set(a.base,Math.max(outAt.get(a.base)||-Infinity,t0+a.t));
    for(const [b,t] of outAt)C.push({b,t:t+BC_DELAY,out:true});
    for(const a of S.actions){if(a.a!=='receive'||!bcBag(a.base)||outAt.has(a.base)||C.some(c=>c.b===a.base))continue;
      const ta=t0+a.t,r=mv.filter(m=>m[1]===a.base&&m[3]&&Number.isFinite(m[3].arriveT)).map(m=>m[3].arriveT);if(!r.length)continue;
      const tr=Math.max(...r);if(Math.abs(ta-tr)<=BC_CLOSE)C.push({b:a.base,t:Math.max(ta,tr)+BC_DELAY,out:false})}
    for(const a of S.actions)if(a.a==='catch'&&BC_FLY_UMP[a.f])C.push({b:BC_FLY_UMP[a.f],t:t0+a.t+BC_DELAY,out:true,at:S.target||S.stand})}
  bcCache.set(e,C);return C}
const bcLen=()=>BC_HOLD+BC_DOWN;
function bcPose(f,b,e,u){let c=null;for(const q of bcCalls(e))if(q.b===b&&u>=q.t&&u<q.t+bcLen()&&(!c||q.t>c.t))c=q;
  if(!c){f.armsHeld=false;return}const t=u-c.t,w=ease(sat01(t/BC_UP))*(1-ease(sat01((t-BC_HOLD)/BC_DOWN))),R=f.rig;if(w<=0){f.armsHeld=false;return}
  f.auto=false;f.armsHeld=true;const [bx,bz]=c.at||BASES[b],p=f.g.position,y0=f.g.rotation.y,y1=Math.atan2(bx-p.x,bz-p.z);
  f.g.rotation.y=y0+Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0))*BC_TURN*w;let Rt,Lt;
  if(c.out){const k=Math.sin(Math.PI*sat01((t-BC_BEAT_AT)/UC_BEAT_DUR));Rt=UC_HAMMER.map((v,i)=>v+UC_BEAT[i]*k);Lt=[-BC_REST[0],BC_REST[1],BC_REST[2]]}
  else{const k=ease(sat01((t-BC_SWEEP_AT)/BC_SWEEP));Rt=BC_CROSS.map((v,i)=>lerp(v,BC_SPREAD[i],k));Lt=[-Rt[0],Rt[1],Rt[2]]}
  const L0=[-BC_REST[0],BC_REST[1],BC_REST[2]],r=BC_REST.map((v,i)=>lerp(v,Rt[i],w)),l=L0.map((v,i)=>lerp(v,Lt[i],w));
  aimArm(R.a1,BAT_SHOULDER_X,r[0],r[1],r[2]);aimArm(R.a0,-BAT_SHOULDER_X,l[0],l[1],l[2])}
/* Throws: speed THROW_V m/s (about 120 km/h, including the grip transfer before release); flight time = distance / speed; longer throws arc higher but stay flat */
const BALL_R=.042,BUNT_GROUND_Y=BALL_R,/* #43: a rolling bunt sits on the dirt, not 15 cm above it */BALL_MIN_PX=1.5,BALL_MAX=3.5,_cw=new THREE.Vector3();
const ZONE_W=.43,ZONE_LO=.55,ZONE_HI=1.1,ZONE_Z=0;
const zoneBox=new THREE.Line(new THREE.BufferGeometry().setFromPoints([[-1,0],[1,0],[1,1],[-1,1],[-1,0]].map(([x,y])=>new THREE.Vector3(x*ZONE_W/2,ZONE_LO+y*(ZONE_HI-ZONE_LO),ZONE_Z))),new THREE.LineBasicMaterial({color:0xffffff,transparent:true,opacity:.75,toneMapped:false}));scene.add(zoneBox);
$('zone').onclick=e=>{const on=e.currentTarget.getAttribute('aria-pressed')!=='true';e.currentTarget.setAttribute('aria-pressed',on);zoneBox.visible=on};
const ball=new THREE.Mesh(new THREE.SphereGeometry(BALL_R,14,10),new THREE.MeshBasicMaterial({color:0xffffff,toneMapped:false}));scene.add(ball);
const ballSh=new THREE.Mesh(GEO.shadow,shadowMat);ballSh.rotation.x=-Math.PI/2;ballSh.scale.setScalar(.35);scene.add(ballSh);
function pathPos(from,to,dist){let d=dist;for(let b=from;b<to;b++){const [x1,z1]=BASES[b],[x2,z2]=BASES[b+1],L=27.43;if(d<=L){const t=d/L;return[lerp(x1,x2,t),lerp(z1,z2,t),false]}d-=L}const [x,z]=BASES[to];return[x,z,true]}
function face(f,x,z){f.g.rotation.y=Math.atan2(x,z)}
/* #268 lead: a runner off the bag (engine leadAt: on the bag in the set, out over the delivery, back after the pitch) shuffles sideways
   facing the pitcher, feet apart, knees bent (render/lead.js, loaded below; until it is in he stands as before). st0 = his break
   (Infinity = he stays): from there the stance and the turn fade into the run over LEAD_TURN while animate() swings the legs.
   Pure in (event, time): the step phase comes from the lead metres, not from a clock. Position stays the caller's (rule 12). */
function leadPose(r,u,ld,st0){const M=leadM;if(!M||!r)return;const b=M.breakW(u,st0),w=M.leadW(ld)*b;if(w<=0)return;
  const x=r.g.position.x,z=r.g.position.z,P=fielders.P.home,cw=M.LEAD_CROUCH*w,sp=M.leadSplay(ld,w);
  r.g.rotation.y=M.yawMix(r.g.rotation.y,M.leadYaw(x,z,P[0],P[1]),w);crouch(r,r.rig,cw,CROUCH_FWD,sp/cw,CROUCH_LEAN,CROUCH_SHRINK);
  if(b>=1){r.noAnim=true;r.px=x;r.pz=z}}
function animate(f,dt){const x=f.g.position.x,z=f.g.position.z;if(f.still){f.px=x;f.pz=z;f.still=false}/* #687: the last frame did not animate him, so px / pz are old: no stride from them */const s=Math.hypot(x-f.px,z-f.pz)/Math.max(dt,1e-3);f.px=x;f.pz=z;
  const sp=Math.min(s,9);f.ph+=sp*dt*2.4;const sw=Math.sin(f.ph)*Math.min(1,sp/6)*.9;f.legs[0].rotation.x=sw;f.legs[1].rotation.x=-sw;if(!f.armsHeld){f.arms[0].rotation.x=-sw*.8;f.arms[1].rotation.x=sw*.8}
  /* f.mix: limb angles of the motion this run grows out of (the pitcher's follow-through), faded out by f.mix.k */
  const m=f.mix;if(m&&m.k>0){f.legs[0].rotation.x=lerp(sw,m.l0,m.k);f.legs[1].rotation.x=lerp(-sw,m.l1,m.k);f.arms[0].rotation.x=lerp(-sw*.8,m.a0,m.k);f.arms[1].rotation.x=lerp(sw*.8,m.a1,m.k)}return sp}
/* Batter: before the first pitch of each plate appearance he walks from BAT_FROM (where the on-deck walk-up left him, just outside the
   box: #42 slice 4 moved it in from [-7, 2.6], a 6.6 m/s dash) into the box; if the PA ends without him running (strikeout) he walks
   back to his own team's dugout (dugout(t), behind the plate at OD_BEHIND_Z when it is on the far side; slice 4: it was a fixed
   batter-local spot, so every lefty went to the other team's side) and goes down the steps there. */
const BAT_BOX=[-.9,.15],BAT_FROM=[-2.6,1],BAT_WALK_DUR=1.0,BAT_TURN=.3,BAT_AWAY_AT=ARRIVE+1.5,BAT_AWAY_AT_HIT=ARRIVE+.35,BAT_AWAY_SPEED=4,BAT_AWAY_SPEED_HIT=4.6,BAT_STEP_HZ=2.4,BAT_STEP_AMP=.7,BAT_LEAVE_BLEND=4,BAT_CROSS_FWD=.8;
/* the strikeout walk-off, in the batter-local frame (a lefty's figure is mirrored, so his dugout is mirrored into that frame too) */
function batAway(e){const lf=batOf(e).hand==='L',G=dugout(e.bat[0]),D=[lf?-G[0]:G[0],G[1]];
  return odPath(Math.sign(D[0])===Math.sign(BAT_BOX[0])?[BAT_BOX,D]:[BAT_BOX,[0,OD_BEHIND_Z],D])}
/* distance walked off tau s after the start, its speed, and the time to cover L (in play: flat BAT_AWAY_SPEED_HIT; strikeout: walk then pick up) */
function batAwayD(e,tau){if(e.r==='inplay')return[tau*BAT_AWAY_SPEED_HIT,BAT_AWAY_SPEED_HIT];const v0=BAT_K_WALK_V,v1=BAT_AWAY_SPEED,R=BAT_K_RAMP;
  return tau<R?[v0*tau+(v1-v0)*tau*tau/(2*R),v0+(v1-v0)*tau/R]:[(v0+v1)*R/2+v1*(tau-R),v1]}
function batAwayT(e,L){if(e.r==='inplay')return L/BAT_AWAY_SPEED_HIT;const v0=BAT_K_WALK_V,v1=BAT_AWAY_SPEED,R=BAT_K_RAMP,dR=(v0+v1)*R/2,a=(v1-v0)/(2*R);
  return L<=dR?(-v0+Math.sqrt(v0*v0+4*a*L))/(2*a):R+(L-dR)/v1}
function batterWalk(e,u){
  let x=BAT_BOX[0],z=BAT_BOX[1],yaw=Math.PI/2,sw=0;
  if(e.c0[0]===0&&e.c0[1]===0&&u<BAT_WALK_DUR){
    const t=ease(sat01(u/BAT_WALK_DUR)),k=sat01((u-(BAT_WALK_DUR-BAT_TURN))/BAT_TURN),wy=Math.atan2(BAT_BOX[0]-BAT_FROM[0],BAT_BOX[1]-BAT_FROM[1]);
    x=lerp(BAT_FROM[0],BAT_BOX[0],t);z=lerp(BAT_FROM[1],BAT_BOX[1],t);yaw=lerp(wy,Math.PI/2,k);sw=Math.sin(u*2*Math.PI*BAT_STEP_HZ)*BAT_STEP_AMP*(1-k)}
  else if(e.pa&&e.bat&&!k3Moves(e).some(m=>m[0]===0)&&u>=(e.r==='inplay'?BAT_AWAY_AT_HIT:BAT_AWAY_AT)){
    const at=e.r==='inplay'?BAT_AWAY_AT_HIT:BAT_AWAY_AT,P=batAway(e),[d,v]=batAwayD(e,u-at),t=d/P.L;
    if(t>=1)batter.g.visible=false;
    const [px,pz,dx,dz]=odAt(P,Math.min(t,1));x=px;z=pz;yaw=Math.atan2(dx,dz);sw=Math.sin(u*2*Math.PI*BAT_STEP_HZ)*BAT_STEP_AMP*Math.min(1,v/BAT_AWAY_SPEED)}
  const lf=e.bat&&batOf(e).hand==='L';/* Left-handed batter = the whole figure mirrored left/right */
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
/* #186: the real delivery (CMU 124_01, assets/mocap) on the skinned pitcher, over the keyframes above. Clip time is warped to the
   event: PM_START (set, before the rock) at u 0, PM_KNEE (leg lift) at PM_KNEE_U, the clip's release frame exactly at RELEASE, then real
   speed to PM_END. Blends in over PM_IN and back to the keyframes over PM_OUT. The ball leaves from the hand of the clip at RELEASE
   (measured once per pitcher and spot), so release time and point are the engine's and the picture's together. The performer throws
   right-handed: his clip is mirrored onto the throwing side (bones R) and the figure's own mirror makes it right- or left-handed. */
const PITCH_CLIP_URL='assets/mocap/pitch_124_01.json',PM_START=1.2,PM_KNEE=2.33,PM_KNEE_U=.6,PM_END=4.6,PM_IN=.25,PM_OUT=[2.2,2.8];
let pitchClip=null,pitchClipP=null;const pmRel=new Map();
/* #186 (owner 11/22 10:33: no gliding back to the rubber). After the release the pitcher finishes on the spot his stride landed on: PM_LAND
   (keyframes) or, with the clip, where the clip's hips stand at PM_END, so blending out of the clip moves nothing. Then he walks back to
   the rubber in PM_STEPS backward steps between PM_BACK[0] and PM_BACK[1] (inside the pitch frame, PK_END): one foot swings (lifted by
   PM_LIFT of its length) while the other stays planted, the hips ride at the middle of the two feet, every leg angle is solved from where
   its foot is (leg PM_LEG m, hip over the rubber line), so a planted foot does not slide. Pure function of u. */
const PM_LAND=.85,PM_BACK=[3.4,4.6],PM_STEPS=4,PM_LIFT=.12,PM_LIFT_B=.12,PM_LEG=.9,PM_FOOT_MAX=.9;const pmLand=new Map();
function pmBack(u,S,k){if(u<PM_BACK[0])return null;
  const s=sat01((u-PM_BACK[0])/(PM_BACK[1]-PM_BACK[0]))*PM_STEPS,i=Math.min(PM_STEPS-1,Math.floor(s)),f=ease(Math.min(1,s-i)),d=S/(PM_STEPS-1),
    at=n=>Math.max(0,S-n*d),/* foot 0 moves on steps 1, 3, ...; foot 1 on steps 2, 4, ... */
    after=(ft,n)=>{let m=0;for(let j=1;j<=n;j++)if((j-1)%2===ft)m=j;return m?at(m):S},sw=i%2,
    F=[0,1].map(ft=>ft===sw?lerp(after(ft,i),after(ft,i+1),f):after(ft,i)),z=(F[0]+F[1])/2;
  return{z,leg:F.map(Fz=>Math.asin(clamp((z-Fz)/(PM_LEG*k),-PM_FOOT_MAX,PM_FOOT_MAX))),sc:[0,1].map(ft=>ft===sw?1-PM_LIFT*Math.sin(Math.PI*f):1)}}
const pmTime=(u,c)=>{const tr=c.release.frame/c.fps;return u<PM_KNEE_U?PM_START+Math.max(0,u)*(PM_KNEE-PM_START)/PM_KNEE_U:u<RELEASE?PM_KNEE+(u-PM_KNEE_U)*(tr-PM_KNEE)/(RELEASE-PM_KNEE_U):Math.min(PM_END,tr+(u-RELEASE))};
const pmW=u=>Math.min(ease(sat01(u/PM_IN)),1-ease(sat01((u-PM_OUT[0])/(PM_OUT[1]-PM_OUT[0]))));
/* #274 part 2: the stride leg (legs[0]) keeps the clip PM_STRIDE_LAG s longer than the body, then leaves it over PM_OUT_STRIDE s (ends with
   PM_OUT): the clip plants that foot, and the keyframe leg turned it while the whole-body weight was still > .9, so it glided ~10 cm.
   Values from render/tools/pitch_foot_scan.py (lag 0 / -.1 glide 10-27 cm, .1 6.8, .2-.3 4.7) */
const PM_STRIDE_LAG=.2,PM_OUT_STRIDE=.4,pmStrideW=u=>Math.min(ease(sat01(u/PM_IN)),1-ease(sat01((u-PM_OUT[0]-PM_STRIDE_LAG)/PM_OUT_STRIDE)));
function pitchPose(u){const P=fielders.P,y=kf(u,PK.yaw),L=kf(u,PK.lean),th=kf(u,PK.a1),bx=P.g.position.x,bz=P.g.position.z;
  PR.up.rotation.set(L,y,0);PR.hg.rotation.y=-y*.9;P.legs[0].rotation.x=kf(u,PK.l0);P.legs[1].rotation.x=kf(u,PK.l1);P.arms[0].rotation.x=kf(u,PK.a0);P.arms[1].rotation.x=th;
  const mo=P.setMocap&&!OFF.has('mocap'),c=mo?pitchClip:null,mkey=[bx,bz,P.buildKey,P.throws,P.k].join();
  let S=PM_LAND;if(c&&P.moTravel){S=pmLand.get(mkey);if(S===undefined){S=P.moTravel(c,PM_END,PM_START);pmLand.set(mkey,S)}}
  pbS=S;const PB=pbOn&&pbM&&!OFF.has('pbback')?pbM.pbAt(u,BALL_BACK_AT+BALL_BACK_DUR,S):null,dz=u<PM_OUT[0]?kf(u,PK.dz):S,B=PB?(PB.moving?{z:PB.z,leg:[PB.swing,-PB.swing],sc:[1,1]}:null):pmBack(u,S,P.k||1);P.legs[0].scale.y=P.legs[1].scale.y=1;
  if(B){P.legs[0].rotation.x=B.leg[0];P.legs[1].rotation.x=B.leg[1];P.legs[0].scale.y=B.sc[0];P.legs[1].scale.y=B.sc[1]}
  /* #274: both feet leave the ground as soon as the hand-off starts moving them (each used to slide 13-14 cm along the ground first):
     the stride foot rises over the first half of PM_OUT and stays up until PM_BACK; the back foot, coming down from the follow-through,
     stays off the ground until the blend has put it at its keyframe spot under the hips (a lift of PM_LIFT_B over PM_OUT) */
  else if(u>=PM_OUT[0]){const o=sat01((u-PM_OUT[0])/(PM_OUT[1]-PM_OUT[0]));
    P.legs[0].scale.y=1-PM_LIFT*(PB?1-ease(sat01((u-PM_OUT[1])/(PM_BACK[0]-PM_OUT[1]))):1)/* #687: the return-throw routine has no pmBack to put the stride leg down: let the lift go over PM_OUT[1]..PM_BACK[0], it stayed .88 to the frame end */*Math.max(Math.sin(Math.PI*Math.min(o,.5)),Math.sin(Math.PI*sat01((u-PM_OUT[0])/(PM_BACK[0]-PM_OUT[0]))));
    P.legs[1].scale.y=1-PM_LIFT_B*Math.sin(Math.PI*o)}
  P.g.position.z+=B?B.z:PB&&u>=PM_OUT[0]?PB.z:dz;
  if(PB){PR.up.rotation.x+=PB.look*pbM.PB_LOOK_LEAN;P.g.rotation.y+=PB.yaw;if(PB.glove>0)gloveTo(P,PB.glove,null)}
  if(PB&&!OFF.has('pbrubber')){const Q=pbM.pbRubberAt(u,pbM.pbRubberPlan(pbM.pbPlan(BALL_BACK_AT+BALL_BACK_DUR,S).end,pbDur,pbSeed,pbEi,pbSit)),W=pbM.PB_POLE;/* #642 part 2: habit, sign, set */
    PR.up.rotation.x+=Q.lean;PR.hg.rotation.y+=Q.headYaw;PR.hg.rotation.x+=Q.headPitch;
    if(Q.handW>0){P.auto=false;pbArm(P.rig.a1,T_SX,Q.hand,Q.handW,Q.hand===pbM.PB_HAND.cap?W.cap:null)}
    if(Q.set>0){P.auto=false;pbArm(P.rig.a1,T_SX,pbM.PB_SET_T,Q.set,W.setT);pbArm(P.rig.a0,G_SX,pbM.PB_SET_G,Q.set,W.setG)}}
  let rel=pitchTipAt(RELEASE,bx,bz);
  if(mo){if(!pitchClipP&&window.PL&&PL.loadClip)pitchClipP=PL.loadClip(PITCH_CLIP_URL).then(c=>{pitchClip=c}).catch(e=>console.warn('mocap',e));
    if(c){const mir=c.release.hand==='right',key=[bx,bz,P.buildKey,P.throws].join();let r=pmRel.get(key);
      if(!r){const z=P.g.position.z,dR=kf(RELEASE,PK.dz);P.g.position.z=bz+dR;P.setMocap(c,pmTime(RELEASE,c),1,mir,PM_START,dR);const q=P.handWorld(1);r=[q.x,q.y,q.z];pmRel.set(key,r);P.g.position.z=z}
      const w=pmW(u);P.setMocap(c,pmTime(u,c),w,mir,PM_START,dz,[pmStrideW(u),w]);if(w>0)rel=r}}
  return{tip:pitchTipAt(u,bx,bz),rel}}
/* #643: the release time of this pitch from its shown km/h (render/pitchtime.js); the hand is measured at the clip's release frame, which is
   the same point whatever the warp, so one call at RELEASE gives it. Cached per event; balk / pickoff / module not loaded: RELEASE. */
const prCache=new WeakMap();
function pitchRel(e){if(!PTM||e.bk||e.po||!e.kmh||e.r==='ibb')return RELEASE;let r=prCache.get(e);if(r!==undefined)return r;
  const hbp=e.r==='hbp',T=hbp?hbpSpot(e):[e.zx,.45+e.zy*.75,.6],P=fielders.P,z0=P.g.position.z,h=pitchPose(RELEASE).rel;P.g.position.z=z0;r=PTM.pitchRelease(Math.hypot(T[0]-h[0],T[1]-h[1],T[2]-h[2]),e.kmh,RELEASE,ARRIVE);if(pitchClip||!fielders.P.setMocap||OFF.has('mocap'))prCache.set(e,r);return r}/* the mocap hand is known only once the clip is in: no cache before it */
/* #274 item 2: a pitcher who fields the ball or covers a bag used to drop the clip at ARRIVE (the run code moves his proxies, which
   unkeys setMocap): a snap from the follow-through to the proxy pose. Now the clip stays on, at pmW(u) times a fade from 1 at ARRIVE to
   0 after PF_FADE s (FIELD_REACT + P_RUN_BLEND, the same span his trunk and limbs grow into the run) or at his first plan action (tP,
   since ARRIVE: catch, field, cover) if that is sooner, so the ball always meets the proxy hand. pmField is re-applied after animate(). */
const pfFade=tP=>Math.min(FIELD_REACT+P_RUN_BLEND,tP);
const pmFieldW=(u,tP)=>{const T=pfFade(tP);return T>0?pmW(u)*(1-ease(sat01((u-ARRIVE)/T))):0};
let pmField=null;
function pmFieldSet(e,u){pmField=null;const P=fielders.P,c=pitchClip;if(!c||!P.setMocap||OFF.has('mocap')||u<ARRIVE)return;
  const tP=Math.min(...((e.plan&&e.plan.actions)||[]).filter(a=>a.f==='P').map(a=>a.t)),w=pmFieldW(u,tP);
  if(w>0)pmField={c,t:pmTime(u,c),w,mir:c.release.hand==='right',dz:kf(ARRIVE,PK.dz)}}
function pmFieldApply(){const m=pmField;if(m)fielders.P.setMocap(m.c,m.t,m.w,m.mir,PM_START,m.dz)}
function arc(p0,p1,peak,t){return[lerp(p0[0],p1[0],t),lerp(p0[1],p1[1],t)+peak*4*t*(1-t),lerp(p0[2],p1[2],t)]}
const THROW_G=9.81,throwPeak=TT=>THROW_G*TT*TT/8; /* #647: a throw is a gravity parabola over its flight time TT: peak above the chord = g*TT^2/8 */
/* #644: pitch break by type. Metres at the plate beyond the old straight-plus-hump line (the fastball look): [vertical, arm-side horizontal]
   (vertical + = up, horizontal + = toward the throwing-arm side, flipped for a lefty by the release x). Public Statcast pitch-tracking
   averages, induced break in inches (vertical vs gravity-only / horizontal): 直球 +16 / 8 arm, 滑球 +2 / 3 glove, 曲球 -10 / 10 glove,
   變速球 +8 / 14 arm, 指叉球 +4 / 12 arm; vertical here is that minus the fastball's +16 (the hump already draws it), 1 in = .0254 m. */
const PITCH_BRK_IN={'直球':[0,8],'滑球':[-14,-3],'曲球':[-26,-10],'變速球':[-8,14],'指叉球':[-12,12]},IN_M=.0254;
const pitchBreak=(pt,hand)=>{const b=PITCH_BRK_IN[pt]||PITCH_BRK_IN['直球'];return[b[1]*IN_M*(hand[0]<0?-1:1),b[0]*IN_M]};
/* the hump path plus a quadratic bend that is 0 at release and at the plate, so it still ends exactly on the engine's spot: the ball leaves
   aimed `brk` short of it and is pulled there, so the break at the plate vs its release line is exactly `brk` */
function pitchArc(p0,p1,peak,t,brk){const q=arc(p0,p1,peak,t),k=t*t-t;return[q[0]+brk[0]*k,q[1]+brk[1]*k,q[2]]}

/* ---------- Fielding: catch / transfer / throw (frame-steppable in the studio) ---------- */
/* Throw speed by arm strength and distance (m/s): short toss 25-30, infield 34-40, outfield 36-43; transfer (catch to release) 0.6-1.2 s.
   On a ground ball to first, if a normal transfer would arrive after the batter, compress it (down to XFER_RUSH), so the picture never shows an out before the ball gets there */
const CHASE_VMIN=5,CHASE_VMAX=9;
const CHEST=[0,.32,.34],G_SX=-BAT_SHOULDER_X,T_SX=BAT_SHOULDER_X;
const resetPose=f=>{const R=f.rig;f.auto=true;f.mix=null;if(f.bend){f.bend.elbow[0]=f.bend.elbow[1]=0}armsDown(R);R.l0.rotation.set(0,0,0);R.l1.rotation.set(0,0,0);R.l0.scale.y=R.l1.scale.y=1;R.up.rotation.set(0,0,0);R.hg.rotation.set(0,0,0);R.hips.rotation.set(0,0,0);f.g.position.y=0};
/* Reach the glove to world point w; bend at waist and knees for low balls */
const CATCH_CROUCH_TOP=1.2,CATCH_CROUCH_SPAN=1;/* #650: a fielder bends from 1.2 m down (was .7) so the glove arm, at most 1.2 x .6 m, reaches a ball at .2 m */
const CATCH_LEAN_K=1.2,CATCH_LEAN_MAX=.7,CATCH_LIFT_FROM=1.7,CATCH_LIFT_SPAN=.5,CATCH_LIFT=.25,CATCH_DEEP=.25;/* #650 part 3: the body leans toward a ball beside him (z lean per m, max rad), rises on his toes for a high one (m), crouches CATCH_DEEP deeper (shrink) */
function reachGlove(f,w){f.auto=false;const R=f.rig,low=w[1]<CATCH_CROUCH_TOP;f.g.updateWorldMatrix(true,false);_tv.set(w[0],0,w[2]);f.g.worldToLocal(_tv);const lx=_tv.x;if(low)crouch(f,R,clamp((CATCH_CROUCH_TOP-w[1])/CATCH_CROUCH_SPAN,0,1),.5,.3,.7,.3+CATCH_DEEP);R.up.rotation.z=clamp(lx*CATCH_LEAN_K,-CATCH_LEAN_MAX,CATCH_LEAN_MAX);f.g.position.y+=CATCH_LIFT*clamp((w[1]-CATCH_LIFT_FROM)/CATCH_LIFT_SPAN,0,1);aimWorld(R,R.a0,G_SX,w[0],w[1],w[2]);aimArm(R.a1,T_SX,CHEST[0]+.05,CHEST[1]-.1,CHEST[2])}
/* Throw receiver: reach 0->1 raises the glove to chest height, slightly forward; hold 0->1 brings the throwing hand over to take the ball after the catch */
/* #642 part 2: blend an arm from the pose it has now (keyframes) toward a hand target by w (pole: where the elbow points) */
const _pbq=new THREE.Quaternion();function pbArm(a,sx,t,w,pole){_pbq.copy(a.quaternion);const sy=a.scale.y;if(pole)aimArmPole(a,sx,t[0],t[1],t[2],pole,1);else aimArm(a,sx,t[0],t[1],t[2]);const ty=a.scale.y;a.quaternion.copy(_pbq.slerp(a.quaternion,w));a.scale.y=sy+(ty-sy)*w}
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
/* Batted-ball path: the simulation already decided the outcome (landing point, hang time); here we solve back for the launch velocity and draw it with a drag integration (Cd .33, an assumed coefficient):
   steeper rise and straighter fall than a parabola. Solved once per event and stored as a sample table.
   #648: a ball whose solved exit speed would pass EV_MAX (197 km/h = 122.4 mph, the hardest Statcast-tracked ball) gets less drag, the most that keeps it at EV_MAX
   (CD_MIN 0: the engine's hang and distance for the hardest ~2% of balls need near-vacuum flight, any real Cd leaves 207-227 km/h); it still lands where and when the engine says. Balls under EV_MAX draw as before. */
const CD_MAX=.33,CD_MIN=0,EV_MAX=197/3.6,airK=cd=>1.2*cd*Math.PI*.0366*.0366/(2*.145),GRAV=9.81,FLY_DT=1/120,flyCache=new Map();
function flyPath(e,p0,p1,T){const key=e.t;let tab=flyCache.get(key);
  if(!tab){const n=Math.max(2,Math.ceil(T/FLY_DT)),h=T/n,sim=(v,K)=>{const P=p0.slice(),V=v.slice(),out=[P.slice()];for(let i=0;i<n;i++){const sp=Math.hypot(...V);for(let k=0;k<3;k++)V[k]+=h*(-K*sp*V[k]-(k===1?GRAV:0));for(let k=0;k<3;k++)P[k]+=h*V[k];out.push(P.slice())}return out},
    solve=cd=>{const K=airK(cd),v=[(p1[0]-p0[0])/T,(p1[1]-p0[1])/T+GRAV*T/2,(p1[2]-p0[2])/T];
      for(let it=0;it<40;it++){const end=sim(v,K)[n],err=[p1[0]-end[0],p1[1]-end[1],p1[2]-end[2]];if(Math.hypot(...err)<.01)break;for(let k=0;k<3;k++)v[k]+=err[k]/T*(k===1?1:1.3)}return v};
    let cd=CD_MAX,v=solve(cd);
    if(Math.hypot(...v)>EV_MAX){let lo=CD_MIN,hi=CD_MAX,vl=solve(lo);if(Math.hypot(...vl)<=EV_MAX){for(let i=0;i<12;i++){const m=(lo+hi)/2,vm=solve(m);if(Math.hypot(...vm)>EV_MAX)hi=m;else{lo=m;vl=vm}}}cd=lo;v=vl}
    tab={pts:sim(v,airK(cd)),h,v0:v,cd};if(flyCache.size>200)flyCache.clear();flyCache.set(key,tab)}
  return t=>{const x=clamp(t/tab.h,0,tab.pts.length-1),i=Math.min(tab.pts.length-2,Math.floor(x)),a=x-i,P=tab.pts[i],Q=tab.pts[i+1];return[lerp(P[0],Q[0],a),lerp(P[1],Q[1],a),lerp(P[2],Q[2],a)]}}

const INTRO_GAP=.7,INTRO_RUN=4.5,INTRO_X=26,INTRO_Z=-6;
/* ---------- per-frame scene from event ---------- */
/* catcher + home-plate umpire crouch, mitt tracking, strike call; half-inning swap (defense jogs off, other team jogs on) */
const CROUCH_FWD=.7,CROUCH_SPLAY=.45,CROUCH_LEAN=.4,CROUCH_SHRINK=.5,UMP_FWD=.35,UMP_SPLAY=.3,UMP_LEAN=.4,UMP_SHRINK=.18,UMP_HEAD_UP=.45,MITT_Z=.8,MITT_SET_LEAD=.7,MITT_SET_DUR=.5,CALL_STAND=.75,LEG_LEN=.86;
const JOG_SPEED=6.5,JOG_GAP=.3,BRK_OFF_AT=1,BRK_ON_AT=17.5,_tv=new THREE.Vector3();
const jogRank=k=>JOG_ORDER.indexOf(k),JOG_ORDER=FIELDER_KEYS.slice().sort((a,b)=>Math.hypot(...fielders[b].home)-Math.hypot(...fielders[a].home));
const dugout=t=>[(t===0?1:-1)*INTRO_X,INTRO_Z];
/* #313: the cheap dugouts every tier draws (4 unlit-cheap boxes each, no textures); props/index.js hides them while max shows the polished ones (named old:dugout) */
import(new URL('dugout_lite.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{for(const t of [0,1]){const [dx,dz]=dugout(t),D=M.liteDugout(dx,dz),g=new THREE.Group();g.name='old:dugout';g.position.set(dx,0,dz);g.rotation.y=D.rotY;
  for(const p of D.parts){const m=new THREE.Mesh(new THREE.BoxGeometry(p.w,p.h,p.d),new THREE.MeshLambertMaterial({color:p.color}));m.name='old:dugout';m.position.set(p.x,p.y,p.z);g.add(m)}scene.add(g)}}).catch(err=>console.warn('lite dugouts off',err));
/* #392: the cheap on-deck circles every tier draws (a mat disc and a trim-colour ring each, 4 meshes, no textures); props/index.js hides them while max shows the polished ones (named old:ondeck). applyPark recolours the rings. */
var deckRings=[];
import(new URL('ondeck_lite.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{const trim=(PARKS[parkCur&&parkCur.id]||PARK_DEFAULT).trim;for(const side of [-1,1])for(const p of M.liteOnDeck(side)){
  const ring=p.kind==='ring',m=new THREE.Mesh(ring?new THREE.RingGeometry(p.r0,p.r1,32).rotateX(-Math.PI/2):new THREE.CylinderGeometry(p.r0,p.r1,p.h,24),new THREE.MeshLambertMaterial({color:ring?trim:p.color}));
  m.name='old:ondeck';m.position.set(p.x,p.y,p.z);m.receiveShadow=true;if(ring)deckRings.push(m.material);scene.add(m)}}).catch(err=>console.warn('lite on-deck circles off',err));
/* #150 part 6: the cheap batter's eye every tier draws (one open curved screen behind the cleared CF block, Lambert, 1 draw call); props/index.js hides it while max shows the polished one (named old:batterseye). */
import(new URL('batterseye_lite.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{const E=M.liteEye(),m=new THREE.Mesh(new THREE.CylinderGeometry(E.r,E.r,E.top,24,1,true,E.thetaStart,E.thetaLength),new THREE.MeshLambertMaterial({color:E.color,side:THREE.DoubleSide}));
  m.name='old:batterseye';m.position.y=E.top/2;scene.add(m)}).catch(err=>console.warn('lite batter\'s eye off',err));
function crouch(f,R,c,fwd,splay,lean,shrink){const fw=fwd*c,sp=splay*c,len=LEG_LEN*(1-shrink*c);f.g.position.y=-(LEG_LEN-len*Math.cos(sp)*Math.cos(fw))*(f.k||1);R.l0.scale.y=R.l1.scale.y=1-shrink*c;R.l0.rotation.set(-fw,0,-sp);R.l1.rotation.set(-fw,0,sp);R.up.rotation.set(lean*c,0,0)}
function aimWorld(R,arm,sx,wx,wy,wz){R.up.updateWorldMatrix(true,false);_tv.set(wx,wy,wz);R.up.worldToLocal(_tv);aimArm(arm,sx,_tv.x,_tv.y,_tv.z)}
function armsDown(R){R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1}
/* #43 plate pose: a crouched catcher's head is ~1.1 m up, a high miss arrives at 1.3-1.55 m. Instead of an arm straight up he rises out of the
   crouch in a controlled way (up to C_HIGH_RISE of it, from C_HIGH_Y over C_HIGH_SPAN of pitch height). After the catch he holds the mitt
   MITT_HOLD s, then brings it back to rest at his chest and sinks back into the crouch over MITT_BACK s (the return throw starts from there).
   #128: he receives from the crouch. The rise starts only C_RISE_LEAD s before the ball arrives (it used to follow the mitt set, 0.65 s early,
   so he stood up into the swing); the bat has passed his head by the time he is half up */
const C_HIGH_Y=.95,C_HIGH_SPAN=.5,C_HIGH_RISE=.6,C_RISE_LEAD=.3,MITT_HOLD=.35,MITT_BACK=.5;
const pitchY=e=>.45+e.zy*.75,catchRise=e=>C_HIGH_RISE*sat01((pitchY(e)-C_HIGH_Y)/C_HIGH_SPAN);/* mitt height of a pitch; how far a catch there lifts him */
/* #128: the glove arm cannot reach far across his body (backhand side, world +x), so for a pitch there he shifts his whole body over during
   the mitt set, like a real catcher framing it: (zx - C_GLOVE_X) * C_SHIFT_K, at most C_SHIFT_MAX, back to his spot with the mitt */
const C_GLOVE_X=-.1,C_SHIFT_K=.8,C_SHIFT_MAX=.25,cShift=e=>clamp((e.zx-C_GLOVE_X)*C_SHIFT_K,0,C_SHIFT_MAX);
/* #43 overlaps at the plate: once a ball is in play the catcher and the plate umpire stand up (PLATE_UP_AT after contact, over PLATE_UP_DUR),
   the catcher's mitt goes back to rest and the umpire's arms hang, so either can move (legs animated) instead of gliding in a crouch.
   They sink back into the crouch PLATE_DOWN_AT s before the play ends, so the next pitch does not start with a jump into the crouch */
const PLATE_UP_AT=.25,PLATE_UP_DUR=.45,PLATE_DOWN_AT=1,PLATE_DOWN_DUR=.6,ARM_HANG=[0,BAT_SHOULDER_Y-BAT_ARM_LEN,0];/* hand straight below the shoulder (x = the shoulder's own x) */
/* #609 part 1: plate signals for foul, hit by pitch, intentional walk and balk (render/umpsig.js, pure function of event and time). Dev switch ?off=umpsig. */
let sigM=null;const SIG_T={ARRIVE,BK_CALL_AT};import(new URL('umpsig.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('umpsig'))sigM=M}).catch(err=>console.warn('plate signals off',err));
/* #708: check-swing appeal (render/chkswing.js, pure function of event and time): half swing, the catcher points at the base umpire, who signals swing / no swing. Dev switch ?off=chkswing. */
var chkM=null;const CHK_T={ARRIVE,CHECK_APPEAL_AT};import(new URL('chkswing.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('chkswing')&&Number.isFinite(CHECK_APPEAL_AT))chkM=M}).catch(err=>console.warn('check-swing appeal off',err));
function chkHalf(e,u){return chkM?chkM.halfSwing(e,u,CHK_T):null}
/* #609 part 2: line umpires (U1 right line, U3 left line) signal foul, a fair ball near the line and a home run (render/umpline.js, pure function of event and time). Dev switch ?off=umpline. */
let lsM=null;import(new URL('umpline.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('umpline'))lsM=M}).catch(err=>console.warn('line signals off',err));
let infM=null;import(new URL('umpinf.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('umpinf'))infM=M}).catch(err=>console.warn('infield fly signal off',err));
/* #609 part 3a: plate umpire time (VOTE / CHG / VIS / SUB frame starts) and play (the pitch after one) (render/umptime.js, pure function of event, previous event and time). Dev switch ?off=umptime. */
/* #612 part 5: after a foul out of play the plate umpire takes a new ball from his bag and hands it to the catcher, who lobs it to the pitcher (render/newball.js, pure function of event and time). Full-speed showing only (a compact cut ends the frame first, like the return throw). Dev switch ?off=newball. */
let nbM=null;import(new URL('newball.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('newball'))nbM=M}).catch(err=>console.warn('new ball off',err));
const nbNow=(e,u)=>nbM&&e&&e.k==='P'&&!cpOn()?nbM.newBallAt(nbM.newBallPlan(e,SIG_T),u):null;
let tmM=null;import(new URL('umptime.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('umptime'))tmM=M}).catch(err=>console.warn('time/play signals off',err));
/* #620 part 1: on a caught foul pop-up the catcher pulls his mask off and tosses it away from the ball (render/maskoff.js, pure function of event and time); it lies there to the end of the play. Dev switch ?off=maskoff. */
/* #620 part 3: on a caught foul fly 1B / 3B drift toward the stands side-on and LF / RF run at the line facing their run, turning to the ball for the catch (render/foulchase.js, pure). Dev switch ?off=foulchase. */
let chaseM=null;import(new URL('foulchase.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('foulchase'))chaseM=M}).catch(err=>console.warn('foul chase off',err));
let maskM=null,looseMask=null;import(new URL('maskoff.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{if(!OFF.has('maskoff'))maskM=M}).catch(err=>console.warn('mask toss off',err));
function poseMask(e,u){const C=fielders.C;if(!C.mask)return;const m=maskM&&e.k==='P'?maskM.maskAt(e,u,SIG_T,C.pos):null;C.mask.visible=!m;
  if(!m){if(looseMask)looseMask.visible=false;return}
  if(!looseMask){looseMask=C.mask.clone();looseMask.name='maskoff';scene.add(looseMask)}
  looseMask.visible=true;looseMask.position.set(m.pos[0],m.pos[1],m.pos[2]);looseMask.rotation.set(m.ground?-Math.PI/2:-m.spin,0,0)}
function lineSigPose(f,b,e,u){const s=lsM&&!f.armsHeld&&(b===1||b===3)?lsM.lineSignal(e,u,b,SIG_T):null;if(!s)return;
  f.auto=false;f.armsHeld=true;const R=f.rig,L0=[-BC_REST[0],BC_REST[1],BC_REST[2]],r=BC_REST.map((v,i)=>lerp(v,s.arms[i],s.w)),l=L0.map((v,i)=>lerp(v,s.arms[3+i],s.w));
  aimArm(R.a1,BAT_SHOULDER_X,r[0],r[1],r[2]);aimArm(R.a0,-BAT_SHOULDER_X,l[0],l[1],l[2])}
/* #609 part 3b infield fly: the nearest base umpire points up while the ball is in the air (render/umpinf.js) */
function chkSigPose(f,b,e,u){const s=chkM&&!f.armsHeld?chkM.appealSignal(e,u,b,CHK_T):null;if(!s)return;
  f.auto=false;f.armsHeld=true;const R=f.rig,L0=[-BC_REST[0],BC_REST[1],BC_REST[2]],r=BC_REST.map((v,i)=>lerp(v,s.arms[i],s.w)),l=L0.map((v,i)=>lerp(v,s.arms[3+i],s.w));
  aimArm(R.a1,BAT_SHOULDER_X,r[0],r[1],r[2]);aimArm(R.a0,-BAT_SHOULDER_X,l[0],l[1],l[2])}
function infSigPose(f,b,e,u){const s=infM&&!f.armsHeld?infM.infSignal(e,u,b,SIG_T):null;if(!s)return;
  f.auto=false;f.armsHeld=true;const R=f.rig,L0=[-BC_REST[0],BC_REST[1],BC_REST[2]],r=BC_REST.map((v,i)=>lerp(v,s.arms[i],s.w)),l=L0.map((v,i)=>lerp(v,s.arms[3+i],s.w));
  aimArm(R.a1,BAT_SHOULDER_X,r[0],r[1],r[2]);aimArm(R.a0,-BAT_SHOULDER_X,l[0],l[1],l[2])}
const CHK_REACH=.75,CHK_POINT_Y=1.05;/* #708: the catcher's pointing hand: CHK_REACH m from his body toward the base umpire, CHK_POINT_Y m up (world) */
function chkPointAt(C,b){const s=stUmpAt[b===1?0:2],x=C.g.position.x,z=C.g.position.z,dx=s[0]-x,dz=s[1]-z,d=Math.hypot(dx,dz)||1;return[x+dx/d*CHK_REACH,CHK_POINT_Y,z+dz/d*CHK_REACH]}
function poseBattery(e,u,prev){
  const C=fielders.C,set=e.k==='P'||e.k==='VOTE'||e.k==='CHG'||e.k==='VIS',isP=e.k==='P',up=isP&&(e.r==='inplay'||e.wp)?ease(sat01((u-ARRIVE-PLATE_UP_AT)/PLATE_UP_DUR))*(e.d?1-ease(sat01((u-(e.d-PLATE_DOWN_AT))/PLATE_DOWN_DUR)):1):0;
  const py=isP?pitchY(e):MITT_REST_Y,k=isP?ease(sat01((u-(RELEASE-MITT_SET_LEAD))/MITT_SET_DUR)):0,
    back=isP&&!e.sbGo?Math.max(up,ease(sat01((u-(ARRIVE+CATCH_SNAP+MITT_HOLD))/MITT_BACK))):0,rk=isP?ease(sat01((u-(ARRIVE-C_RISE_LEAD))/C_RISE_LEAD)):0,rise=C_HIGH_RISE*sat01((py-C_HIGH_Y)/C_HIGH_SPAN)*rk*(1-back),c=set?(1-rise)*(1-up):0;
  const nb=isP?nbNow(e,u):null;
  C.noAnim=set&&up<1;if(C.noAnim)C.auto=false;/* #128: no automatic elbow bend on the glove arm, or a reach for a high/low/wide pitch falls ~.4 m short */crouch(C,CR,c,CROUCH_FWD,CROUCH_SPLAY,CROUCH_LEAN,CROUCH_SHRINK);
  if(isP&&up<1)C.g.position.x+=cShift(e)*k*(1-back)*(1-up);
  if(set&&up<1){const gx=lerp(lerp(0,isP?e.zx:0,k),0,back),gy=lerp(lerp(MITT_REST_Y,py,k),MITT_REST_Y,back);
    const nh=nb&&nb.cat>0?nbM.handSpot(C.g.position.x,C.g.position.z):null,rw=nh?nb.cat:0;/* #612 part 5: bare hand back over his right shoulder for the new ball */
    const cp=isP&&chkM?chkM.catcherPoint(e,u,CHK_T):null,pt=cp?chkPointAt(C,cp.b):null,pw=pt?cp.w:0;/* #708: bare hand points at the base umpire for the appeal */
    aimWorld(CR,CR.a0,-BAT_SHOULDER_X,gx,gy,MITT_Z);aimWorld(CR,CR.a1,BAT_SHOULDER_X,lerp(lerp(gx*.8,nh?nh[0]:0,rw),pt?pt[0]:0,pw),lerp(lerp(gy-.15,nh?nh[1]:0,rw),pt?pt[1]:0,pw),lerp(lerp(MITT_Z+.2,nh?nh[2]:0,rw),pt?pt[2]:0,pw))}else armsDown(CR);
  const cl=isP?umpCall(e,u):UC_NONE,sg=isP&&sigM?sigM.plateSignal(e,u,SIG_T):null,tm=!sg&&tmM?tmM.timeSignal(e,prev,u):null,cu=(set?1:0)*(1-(cl.k?UC_K_STAND:CALL_STAND)*cl.w)*(1-(sg?sigM.SIG_STAND*sg.w:0))*(1-(tm?tmM.TM_STAND*tm.w:0))*(1-(nb?nbM.NB_STAND*nb.stand:0))*(1-up);
  crouch(ump,UR,cu,UMP_FWD,UMP_SPLAY,UMP_LEAN,UMP_SHRINK);UR.up.rotation.y=UC_K_TURN*cl.turn;UR.hg.rotation.x=-UMP_HEAD_UP*cu;UR.hg.rotation.y=-UC_K_TURN*cl.turn*UC_K_HEAD_KEEP;ump.noAnim=(set||!!tm)&&up<1;
  if((set||tm)&&up<1){const h=(v,i,sx)=>lerp(v,i?ARM_HANG[i]:sx,up),R=umpArms(cl);if(sg)for(let i=0;i<6;i++)R[i]=lerp(R[i],sg.arms[i],sg.w);if(tm)for(let i=0;i<6;i++)R[i]=lerp(R[i],tm.arms[i],tm.w);if(nb&&nb.reach>0){const H=nbM.handSpot(C.g.position.x,C.g.position.z);UR.up.updateWorldMatrix(true,false);_tv.set(H[0],H[1],H[2]);UR.up.worldToLocal(_tv);const hl=[_tv.x,_tv.y,_tv.z];for(let i=0;i<3;i++)R[i]=lerp(lerp(lerp(R[i],nbM.NB_BAG[i],nb.reach),hl[i],nb.give),R[i],nb.drop)}/* #612 part 5: right hand to the ball bag, forward to the catcher, back */aimArmPole(UR.a1,BAT_SHOULDER_X,h(R[0],0,BAT_SHOULDER_X),h(R[1],1),h(R[2],2),UC_HAMMER_POLE,cl.w*(1-cl.k)*(1-up));aimArm(UR.a0,-BAT_SHOULDER_X,h(R[3],0,-BAT_SHOULDER_X),h(R[4],1),h(R[5],2))}else armsDown(UR)}
/* #124 strike calls (owner 11/21 and 11/22: the arm straight up over the head read as a pupil raising his hand). Targets are hands in the
   umpire's upper-body frame (+z forward, +x = his RIGHT: arms[1] at +x is the calling arm; checked on a front studio shot, the old call raised it). All start UC_DELAY s after the
   ball is in the mitt (ARRIVE + CATCH_SNAP), never before; the mask stays on the plate (the head turns back against the torso turn).
   - called strike (not the third): the hammer. Upper arm out to the side at shoulder height, elbow ~90 deg, fist beside the head
     (UC_HAMMER, elbow aimed out by UC_HAMMER_POLE), one short sharp beat down and forward (UC_BEAT), held to UC_HOLD, back down.
   - swinging strike (not the third): nothing, the swing tells it. Ball: nothing.
   - swinging third strike: a quick hammer (UC_QUICK_HOLD), no bow pull.
   - called third strike, the punch-out (拉弓): he rises fully, turns his chest UC_K_TURN to his right, the right fist punches out to the side
     (UC_PUNCH) and is pulled back past the hip like drawing a bow (UC_PULL) while the left arm holds out in front (UC_BOW); held UC_K_HOLD.
   Pure function of (event, time): umpCall gives weights, umpArms turns them into the two hand targets. */
const UC_DELAY=.12,UC_UP=.22,UC_BEAT_AT=.3,UC_BEAT_DUR=.14,UC_HOLD=1.2,UC_QUICK_HOLD=.6,UC_DOWN=.4,UC_K_UP=.3,UC_K_PULL_AT=.45,UC_K_PULL=.3,UC_K_HOLD=1.9,UC_K_DOWN=.5;
const UC_K_TURN=.75,UC_K_HEAD_KEEP=.85,UC_K_STAND=.95,UC_REST_R=[.25,.1,.45],UC_REST_L=[-.25,.1,.45],UC_HAMMER=[.56,.86,.1],UC_BEAT=[0,-.1,.12];
/* Hammer elbow pole (round 3): out to his right and a little down, so the skinned upper arm lies flat at shoulder height (elbow .56 m,
   shoulder .57) and the forearm stands up beside the head; without it the elbow went .13 m back and the arm rose (render/tools/elbow_probe.mjs) */
const UC_HAMMER_POLE=[1,-.15,0];
const UC_PUNCH=[.86,.6,.3],UC_PULL=[.36,.08,-.32],UC_BOW=[-.3,.52,.55],UC_NONE={w:0,beat:0,k:0,turn:0,pull:0};
const ucK3=e=>e.pa&&e.c0&&e.c0[1]===2,ucEnd=e=>e.r==='cstr'?(ucK3(e)?UC_K_HOLD+UC_K_DOWN:UC_HOLD+UC_DOWN):e.r==='sstr'&&ucK3(e)?UC_QUICK_HOLD+UC_DOWN:0;
function umpCall(e,u){const t=u-(ARRIVE+CATCH_SNAP+UC_DELAY);if(t<=0||!(e.r==='cstr'||e.r==='sstr'))return UC_NONE;
  if(e.r==='cstr'&&ucK3(e)){const w=ease(sat01(t/UC_K_UP))*(1-ease(sat01((t-UC_K_HOLD)/UC_K_DOWN)));return{w,beat:0,k:1,turn:w,pull:ease(sat01((t-UC_K_PULL_AT)/UC_K_PULL))}}
  if(e.r==='sstr'&&!ucK3(e))return UC_NONE;
  const hold=e.r==='sstr'?UC_QUICK_HOLD:UC_HOLD,b=sat01((t-UC_BEAT_AT)/UC_BEAT_DUR);
  return{w:ease(sat01(t/UC_UP))*(1-ease(sat01((t-hold)/UC_DOWN))),beat:Math.sin(Math.PI*b),k:0,turn:0,pull:0}}
function umpArms(c){const R=[],L=[];for(let i=0;i<3;i++){
    const ham=UC_HAMMER[i]+UC_BEAT[i]*c.beat,bow=lerp(UC_PUNCH[i],UC_PULL[i],c.pull);
    R.push(lerp(UC_REST_R[i],c.k?bow:ham,c.w));L.push(lerp(UC_REST_L[i],c.k?UC_BOW[i]:UC_REST_L[i],c.w))}
  return R.concat(L)}
/* Plate umpire's spot: behind the catcher on the side away from the batter. On a ball in play he comes out from behind the standing catcher
   (who would hide him from the centre-field camera) and out of the runners' way to UMP_GIVE (behind the plate, on the side away from the
   batting team's dugout, where scorers peel off), stays until UMP_HOLD s after the last runner reaches home, and is back on his spot
   before he crouches again at the end of the play */
const UMP_X=.3,UMP_Z=2.6,UMP_GIVE=[2,2.1],UMP_GO_AT=PLATE_UP_AT+PLATE_UP_DUR,UMP_HOLD=1.5,UMP_WALK=2.2,UMP_BACK_PAD=PLATE_DOWN_AT+.2;
function placeUmp(e,u){const lf=e.bat&&batOf(e).hand==='L',hx=lf?-UMP_X:UMP_X;let x=hx,z=UMP_Z,yaw=Math.PI;
  if(e.r==='inplay'){const last=Math.max(-Infinity,...(e.moves||[]).filter(m=>m[1]===4).map(m=>m[3].arriveT)),gx=-Math.sign(dugout(e.s0.half)[0])*UMP_GIVE[0],gz=UMP_GIVE[1],tw=Math.hypot(gx-hx,gz-UMP_Z)/UMP_WALK,t0=ARRIVE+UMP_GO_AT,
      end=e.d||Math.max(t0,last)+UMP_HOLD+2*tw+UMP_BACK_PAD,tb=Math.max(t0+tw,Math.min(last>-Infinity?last+UMP_HOLD:Infinity,end-tw-UMP_BACK_PAD)),go=ease(sat01((u-t0)/tw)),bk=ease(sat01((u-tb)/tw));
    x=lerp(lerp(hx,gx,go),hx,bk);z=lerp(lerp(UMP_Z,gz,go),UMP_Z,bk);
    if(go>0&&go<1)yaw=Math.atan2(gx-hx,gz-UMP_Z);else if(bk>0&&bk<1)yaw=Math.atan2(hx-gx,UMP_Z-gz);else if(go>=1&&bk===0)yaw=Math.atan2(-x,-z)}
  ump.g.position.x=x;ump.g.position.z=z;ump.g.rotation.y=yaw;if(ump.noAnim){ump.px=x;ump.pz=z}}
/* #42: jog ends from render/brkjog.js (off from where the last pitch left him, out to where the next pitch poses him); home until it is in */
let bjM=null;import(new URL('brkjog.js',stHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{bjM=M}).catch(err=>console.warn('break jog ends off',err));
const brkEndsOf=(ev,i,k)=>bjM&&ev&&ev[i]&&ev[i].k==='BRK'?bjM.brkEnds(ev,i,k,fielderStart):null;
/* #42: the opening jog ends on the spot the first pitch poses each fielder on (the catcher's spot is .45 m in front of his home) */
const preEndOf=(ev,i,k)=>bjM&&ev&&ev[i]&&ev[i].k==='PRE'&&ev[i+1]&&ev[i+1].s0?bjM.brkEnds(ev,i,k,fielderStart).to:null;
function brkSwap(e,u,off,def,ei){const ev=game&&game.ev&&game.ev[ei]===e?game.ev:null;FIELDER_KEYS.forEach((k,i)=>{const f=fielders[k],be=brkEndsOf(ev,ei,k),on=u>=BRK_ON_AT,[dx,dz]=dugout(on?off:def),t0=(on?BRK_ON_AT:BRK_OFF_AT)+jogRank(k)*JOG_GAP,[ax,az]=on?[dx,dz]:be?be.from:f.pos,[bx,bz]=on?be?be.to:f.home:[dx,dz],tt=sat01((u-t0)/(Math.hypot(bx-ax,bz-az)/JOG_SPEED)),x=lerp(ax,bx,tt),z=lerp(az,bz,tt);
  f.g.visible=on?u>=t0:tt<1;f.g.position.set(x,tt>0&&tt<1?Math.abs(Math.sin(u*9+i))*.07:0,z);if(tt>0&&tt<1)face(f,bx-ax,bz-az);else face(f,-x,-z)})}
const curPit=[0,0],numOf=(t,name)=>{const R=ROSTERS[t],b=R.bat.find(x=>x.name===name)||(R.bench||[]).find(x=>x.name===name);return b?b.num:undefined};
function applyNums(e,off,def){const R=ROSTERS[def];if(e.pit&&e.pit[0]!==undefined)curPit[e.pit[0]]=e.pit[1];
  const LU=lineupNow(e,def)||R.bat;/* #436: a pinch hitter / runner who stayed in plays his man's position */
  for(const k of FIELDER_KEYS){const b=k==='P'?R.pit[curPit[def]+(e.k==='CHG'&&R.pit[curPit[def]+1]?1:0)]:LU.find(x=>x.pos===k);/* #611 part 3: on a CHG frame the figure on the mound is the reliever, the old pitcher is dsOut */setNum(fielders[k],b?b.num:undefined);dress(fielders[k],b);if(k==='P')fielders.P.setThrows(b&&b.throws||'R')}
  const bb=e.k==='P'&&e.bat?batOf(e):null;setNum(batter,bb?bb.num:undefined);if(bb)dress(batter,bb)}
/* Slide pose (feet first): k 0->1; torso leans back, lead leg straight, trail leg bent, arms up, centre of mass low */
const SLIDE_HOLD=.6,SLIDE_UP=.45;
/* #23 part 1: a runner who ends a play on a base walks off it to the engine's primary lead (LEAD_PRIMARY), so the next pitch frame
   (leadAt(0) = LEAD_PRIMARY) starts where this one ends. He starts LEAD_WALK_WAIT s after he arrives (up from a slide) and takes
   LEAD_WALK_DUR s; never past the end of the event. leadWalk = metres off the bag toward the next base at u. */
const LEAD_WALK_WAIT=SLIDE_HOLD+SLIDE_UP+.2,LEAD_WALK_DUR=2;
const leadWalk=(u,from,end)=>{const t1=Math.min(from+LEAD_WALK_WAIT+LEAD_WALK_DUR,end),t0=Math.max(from,t1-LEAD_WALK_DUR);return LEAD_PRIMARY*ease(sat01((u-t0)/Math.max(t1-t0,.01)))};
function slidePose(f,k){const R=f.rig;f.noAnim=true;f.auto=false;R.up.rotation.set(lerp(0,-1.05,k),0,0);R.hips.rotation.set(lerp(0,-.5,k),0,0);
  R.l0.rotation.set(lerp(0,-1.4,k),0,0);R.l1.rotation.set(lerp(0,-.75,k),0,lerp(0,.25,k));if(f.bend){f.bend.knee[0]=0;f.bend.knee[1]=1.5*k}
  R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1;R.a0.rotation.set(lerp(0,-2.5,k),0,lerp(0,-.3,k));R.a1.rotation.set(lerp(0,-2.2,k),0,lerp(0,.3,k));R.hg.rotation.set(lerp(0,.6,k),0,0);
  f.g.position.y=-SLIDE_DROP*k*(f.k||1)}
const SLIDE_DROP=.62;
/* #43 a runner who reaches home (scored, or out at the plate) does not stay on it: he runs through a little along his line (less when he
   turns back toward a third-base-side dugout, hardly at all after a slide, which he first gets up from), eases to a jog and goes to his
   team's dugout, where he is gone. Path: quadratic Bezier home -> home + PEEL_IN * through -> dugout, walked by arc length. The same
   function draws him in the next events (peelers) until he gets there, so he never vanishes on the plate when the play ends.
   #128 item 4: after a slide toward a first-base-side dugout the straight line ran through the catcher covering home on the 1B side
   (sac fly, tag-up): PEEL_THRU_SLIDE_1B bends it behind the plate first (plate_scan, 31 seeds: catcher vs runner min .44 m -> .74 m) */
const PEEL_THRU=1.6,PEEL_THRU_TURN=.6,PEEL_THRU_SLIDE=.3,PEEL_THRU_SLIDE_1B=1.8,PEEL_SPEED=5.5,PEEL_MIN=3,PEEL_DECEL=.8,PEEL_N=32,PEEL_LOOK=15,PEEL_IN=[Math.SQRT1_2,Math.SQRT1_2],peelCache={};
function peelPath(team,slide){const key=team+(slide?'s':'');if(peelCache[key])return peelCache[key];
  const D=dugout(team),thr=slide?(D[0]<0?PEEL_THRU_SLIDE:PEEL_THRU_SLIDE_1B):D[0]<0?PEEL_THRU_TURN:PEEL_THRU,P1=[PEEL_IN[0]*thr,PEEL_IN[1]*thr],pts=[],cum=[0];
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
function tagPose(f,u,ballIn,tagT,base,out,lane=base-1){f.auto=false;f.noAnim=true;const R=f.rig,t0=Math.min(Math.max(ballIn+TAG_AFTER_CATCH,tagT-TAG_SET),tagT-TAG_MIN),
    k=ease(sat01((u-t0)/(tagT-t0)))*(1-ease(sat01((u-tagT-TAG_HOLD)/TAG_UP))),show=out?ease(sat01((u-tagT-TAG_HOLD)/TAG_UP)):0,hold=ease(sat01((u-ballIn)/.25));
  /* Glove on the runner's lane, TAG_BACK in front of the bag, or TAG_REACH ahead of the fielder's feet when he stands on the lane himself;
     pulled toward him when it would be out of reach */
  const [bx,bz]=BASES[base],[ax,az]=BASES[lane],L=Math.hypot(ax-bx,az-bz),ux=(ax-bx)/L,uz=(az-bz)/L,fx=f.g.position.x,fz=f.g.position.z,
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
/* #128: the transfer starts from the catch pose (mitt on the ball, body as high as the catch left him) and blends into the throw over
   C_XFER_BLEND s, so neither the mitt nor the ball jumps at the catch */
const C_XFER_BLEND=.18,_qa=new THREE.Quaternion(),_qb=new THREE.Quaternion();
function catcherThrow(e,u,S,sp){const C=fielders.C,catchAt=ARRIVE+CATCH_SNAP,xfer=Math.min(CATCHER_POP,S.t0-catchAt),hold=S.t0-catchAt-xfer,tgt=[sp[0],1.2,sp[1]];
  const [h0,hz]=C.pos,hx=h0+cShift(e),dx=sp[0]-hx,dz=sp[1]-hz,L=Math.hypot(dx,dz),at=[hx+dx/L*C_STEP,hz+dz/L*C_STEP],rel=throwRelease(e,C,at,xfer,tgt);
  /* Motion clock: transfer, hold at the end of the transfer, then the throw */
  const x0=xfer*XFER_HAND_SWAP,t=u-catchAt,tt=t<x0?t:t<x0+hold?x0:t-hold,r={rel,tgt,xfer,xferT:tt};
  if(t<0)return r;
  const step=ease(sat01(tt/xfer)),back=e.d?ease(sat01((u-(e.d-C_RECROUCH))/C_RECROUCH)):0,c=Math.max((1-catchRise(e))*(1-ease(sat01(t/(xfer*C_RISE)))),back);
  resetPose(C);C.noAnim=true;C.g.position.set(lerp(lerp(hx,at[0],step),h0,back),0,lerp(hz,at[1],step*(1-back)));{const a0=Math.atan2(-h0,-hz),d=((Math.atan2(dx,dz)-a0)%(2*Math.PI)+3*Math.PI)%(2*Math.PI)-Math.PI;C.g.rotation.y=a0+d*ease(sat01(t/C_XFER_BLEND))}/* #128: the throw starts from the shifted catch, turning from the pitcher; he re-crouches on his own spot */
  if(c>0)crouch(C,CR,c,CROUCH_FWD,CROUCH_SPLAY,CROUCH_LEAN,CROUCH_SHRINK);
  if(back>0){aimWorld(CR,CR.a0,-BAT_SHOULDER_X,0,MITT_REST_Y,MITT_Z);aimWorld(CR,CR.a1,BAT_SHOULDER_X,0,MITT_REST_Y-.15,MITT_Z+.2)}
  else if(u-S.t0<THROW_FT_DUR){throwPose(C,tt,xfer,tgt);
    const bl=ease(sat01(t/C_XFER_BLEND));if(bl<1){const q0=_qa.copy(CR.a0.quaternion),q1=_qb.copy(CR.a1.quaternion),s0=CR.a0.scale.y,s1=CR.a1.scale.y,py=pitchY(e);
      aimWorld(CR,CR.a0,-BAT_SHOULDER_X,e.zx,py,MITT_Z);aimWorld(CR,CR.a1,BAT_SHOULDER_X,e.zx*.8,py-.15,MITT_Z+.2);
      CR.a0.quaternion.slerp(q0,bl);CR.a1.quaternion.slerp(q1,bl);CR.a0.scale.y=lerp(CR.a0.scale.y,s0,bl);CR.a1.scale.y=lerp(CR.a1.scale.y,s1,bl)}}
  return r}
/* #38 balk (engine: e.bk, r 'bk', runners' runner_advance how 'balk'): no pitch. The pitcher starts his delivery, stops at BK_STOP s
   (into the leg lift), holds it until the call at BK_CALL_AT, then winds the motion back to the set over BK_BACK s with the ball still in his hand.
   Runners trot from e.moves like every other advance. Pure function of (event, time). */
const BK_STOP=.45,BK_BACK=1.2;
const bkU=u=>u<BK_STOP?u:u<BK_CALL_AT+.3?BK_STOP:Math.max(0,BK_STOP*(1-(u-BK_CALL_AT-.3)/BK_BACK));
/* #38 pickoff (engine: e.po, r 'po', e.plan.po, the out is a tag at first with pickoff:true): no pitch. The runner on first walks out to
   his lead (plan.lead m, from PO_LEAD_FROM over PO_LEAD_GROW s); the pitcher stays in the set, turns to first over PO_TURN s and throws
   at plan.t0 (throwPose, PO_XFER s of arm action); the first baseman holding him on takes it at plan.arrive and tags the runner, who
   breaks back PO_REACT s after the throw and slides into the bag at plan.runnerAt. He gets up and is gone PO_OFF s later.
   Throw-over that misses (e.pof, plan.safe): shorter lead, he breaks back plan.react s from the throw (before it) and is on the bag
   before the ball; the swipe tag comes POF_TAG_LATE s after the catch (no call), he stays on the bag (LEAD_STAND 0) and the first baseman
   lobs the ball back to the pitcher (plan.back: throwPose over POF_BACK_XFER s, the pitcher's glove up POF_GLOVE_UP s before it lands),
   who turns back to the plate over PO_TURN s. Pure function of (event, time). */
const PO_LEAD_FROM=.2,PO_LEAD_GROW=.8,PO_TURN=.3,PO_XFER=.35,PO_REACT=.3,PO_SLIDE_D=1.6,PO_OFF=1.6,POF_TAG_LATE=.05,POF_BACK_XFER=.45,POF_GLOVE_UP=.4,POF_CATCH_Y=1.4;
function poRunner(e,u,nm,show){const S=e.plan,[x,z]=BASES[1],[nx,nz]=BASES[2],dx=nx-x,dz=nz-z,L=Math.hypot(dx,dz),b0=S.t0+(S.react??PO_REACT);
  if(!S.safe&&u>S.runnerAt+PO_OFF)return;
  const out=lerp(LEAD_PRIMARY,S.lead,ease(sat01((u-PO_LEAD_FROM)/PO_LEAD_GROW))),k=sat01((u-b0)/(S.runnerAt-b0)),ld=u<b0?out:u<S.runnerAt||!S.safe?out*(1-k*k):leadWalk(u,S.runnerAt,e.d||Infinity);/* #23 part 1: from the primary lead; safe: back out to it */
  const r=show(x+dx/L*ld,z+dz/L*ld,-x,-z,nm);if(!r||u<b0)return;
  face(r,-dx,-dz);const sl=ld<PO_SLIDE_D?ease(sat01((PO_SLIDE_D-ld)/(PO_SLIDE_D*.5)))*(1-ease(sat01((u-S.runnerAt-SLIDE_HOLD)/SLIDE_UP))):0;if(sl>0)slidePose(r,sl)}
function poField(e,u){const S=e.plan,P=fielders.P,c=fielders[S.CV.key],sp=S.CV.spot,tgt=[sp[0],1.2,sp[1]],px=P.g.position.x,pz=P.g.position.z;
  c.g.position.set(sp[0],0,sp[1]);face(c,px-sp[0],pz-sp[1]);c.noAnim=true;
  const B=S.safe?S.back:null,bs=B?B.t0-POF_BACK_XFER:Infinity,ptgt=[px,POF_CATCH_Y,pz];
  const tagA=S.actions.find(a=>a.a==='tag');if(u>=S.t0-.2){if(u<S.arrive)gloveTo(c,lerp(.45,1,ease(sat01((u-(S.arrive-.45))/.3))),null);
    else if(!B)tagPose(c,u,S.arrive,tagA.t,1,true,2);else if(u<bs)tagPose(c,u,S.arrive,S.arrive+POF_TAG_LATE,1,false,2);else throwPose(c,u-bs,POF_BACK_XFER,ptgt)}
  const ts=S.t0-PO_XFER,y0=P.g.rotation.y,y1=Math.atan2(sp[0]-px,sp[1]-pz),w=ease(sat01((u-(ts-PO_TURN))/PO_TURN))*(B?1-ease(sat01((u-B.arrive)/PO_TURN)):1);
  P.g.rotation.y=y0+Math.atan2(Math.sin(y1-y0),Math.cos(y1-y0))*w;
  if(B&&u>=B.arrive-POF_GLOVE_UP){P.noAnim=true;gloveTo(P,1-ease(sat01((u-B.arrive-.3)/.4)),null)}
  else if(u>=ts){P.noAnim=true;throwPose(P,u-ts,PO_XFER,tgt)}
  let bp;if(u<S.t0){const q=P.handWorld(1);bp=[q.x,q.y,q.z]}
  else if(u<S.arrive){const rel=throwRelease(e,P,[px,pz],PO_XFER,tgt);bp=arc(rel,tgt,.2,(u-S.t0)/S.TT)}
  else if(B&&u>=B.t0&&u<B.arrive){const rel=throwRelease(e,c,sp,POF_BACK_XFER,ptgt);bp=arc(rel,ptgt,.6,(u-B.t0)/B.TT)}
  else if(B&&u>=B.arrive){const q=P.handWorld(0);bp=[q.x,q.y,q.z]}
  else if(B||u<S.arrive+2.5){const q=c.handWorld(0);bp=[q.x,q.y,q.z]}else bp=null;
  return bp}
const BALL_BACK_AT=3.4,BALL_BACK_DUR=.9;/* a pitch not put in play: the catcher holds the ball until BALL_BACK_AT s into the frame, then lobs it back to the pitcher over BALL_BACK_DUR s */
/* #38 wild pitch (engine: e.wp, runners' runner_advance how 'wild_pitch'): the ball hits the dirt in front of the plate, skips under the mitt
   and rolls toward the backstop (left or right by the pitch's side); the catcher gets up, runs it down, picks it up and walks back to his spot.
   Passed ball (e.pb too, how 'passed_ball'): a catchable pitch glances off the mitt instead of the dirt, then rolls the same way.
   Runners are drawn from e.moves like every other advance. Pure function of (event, time). */
const WP_DIRT_Z=-.3,WP_SKIP=.25,WP_ROLL=1.7,WP_REST_X=4,WP_REST_Z=NET_Z-2.5,WP_C_REACT=.35,WP_C_SPEED=6.5,WP_PICK=.5,WP_BACK_V=4;
/* #128: the straight line spot -> ball passes over the plate umpire (UMP_X, UMP_Z) when the ball rolls to his side: 12 walk-throughs on
   31 seeds (plate_scan.py, C-U .01 m). The catcher now goes round a corner WP_ROUND_X out at the umpire's depth, both ways. */
const WP_ROUND_X=UMP_X+.9,WP_STOP=.6;
function wpPlan(e){const sx=e.zx<0?-1:1,rest=[sx*WP_REST_X,.04,WP_REST_Z],c0=[0,MITT_Z+.6],M=[sx*WP_ROUND_X,UMP_Z],L1=Math.hypot(M[0]-c0[0],M[1]-c0[1]),
  D2=Math.hypot(rest[0]-M[0],rest[2]-M[1]),E=[M[0]+(rest[0]-M[0])*(1-WP_STOP/D2),M[1]+(rest[2]-M[1])*(1-WP_STOP/D2)],L=L1+D2-WP_STOP,
  reach=ARRIVE+WP_C_REACT+runTime(L,WP_C_SPEED),back=reach+WP_PICK;return{rest,c0,M,E,L1,L,reach,back,end:back+L/WP_BACK_V}}
/* point and heading at distance d along c0 -> M -> E */
function wpAt(W,d){const [a,b,k]=d<W.L1?[W.c0,W.M,d/W.L1]:[W.M,W.E,(d-W.L1)/Math.max(1e-6,W.L-W.L1)],dx=b[0]-a[0],dz=b[1]-a[1],n=Math.hypot(dx,dz)||1;
  return[a[0]+dx*k,a[1]+dz*k,dx/n,dz/n]}
function wpBall(e,u,plate){const W=wpPlan(e),dirt=e.pb?[plate[0],plate[1],MITT_Z]:[plate[0]*.8,.03,WP_DIRT_Z+.6];/* PB: off the mitt where it was set */
  if(u<ARRIVE)return null;if(u<ARRIVE+WP_SKIP)return arc(plate,dirt,0,(u-ARRIVE)/WP_SKIP);
  if(u<ARRIVE+WP_SKIP+WP_ROLL){const k=(u-ARRIVE-WP_SKIP)/WP_ROLL;return arc(dirt,W.rest,(e.pb?.3:.5)*(1-k),1-(1-k)*(1-k))}
  if(u<W.reach)return W.rest;const q=fielders.C.handWorld(1);return[q.x,q.y,q.z]}
function wpCatcher(e,u){const C=fielders.C,W=wpPlan(e),t=u-ARRIVE-WP_C_REACT;if(t<=0)return;
  const [hx,hz]=W.c0;let d;
  if(u<W.reach)d=Math.min(W.L,runDist(t,WP_C_SPEED));else if(u<W.back)d=W.L;else d=Math.max(0,W.L-(u-W.back)*WP_BACK_V);
  const [x,z,dx,dz]=wpAt(W,d);C.g.position.set(x,0,z);C.noAnim=false;if(u<W.back)face(C,dx,dz);else if(d>0)face(C,-dx,-dz);else face(C,-hx,-hz)}
/* #671 dropped third strike (engine: e.k3, e.plan.k3 with t0 = pickup, arrive = the throw lands in the 1B glove, CV = 1B cover): the pitch glances off
   the mitt and rolls toward the backstop on the wild-pitch path (wpPlan), only as far as the catcher can run by plan.t0; he chases it, picks it up
   at t0, throws to first (arc over plan.TT), and walks back. The batter runs from e.moves like any advance. Pure function of (event, time). */
const K3_MIN_D=2.5,K3_XFER=.35,K3_BACK_HOLD=.6,K3_TAG_HOLD=.7,K3_TAG_BEHIND=.45;
/* The batter's run to first on a dropped third strike: the engine gives him no move when he is out (tag or force), so he is drawn from the same
   timeline the engine used (runnerTimeline wp); a tagged batter stops where the catcher's tag lands (plan.tagAt) and goes off like any out. */
function k3Moves(e){const m=e.moves||[];if(!(e.k3&&e.plan&&e.plan.k3)||m.some(x=>x[0]===0)||!e.bat)return m;
  if(!e._k3mv){const tl={...runnerTimeline(0,1,{kind:'wp'})};if(e.plan.k3tag){tl.arriveT=e.plan.tagAt;tl.tagStop=e.plan.tagAt}e._k3mv=[...m,[0,1,batOf(e).name,tl]]}
  return e._k3mv}
/* Where he leaves the box: from the box he stood in, not from the middle of the plate. Walk / hit by pitch from the third-base-side box: he crosses the plate in an arc BAT_CROSS_FWD out in front of it, clear of the crouched catcher (#43) */
function batLeave(e,prog,x,z){const lf=e.bat&&batOf(e).hand==='L',w=1-ease(sat01(prog/BAT_LEAVE_BLEND));x+=(lf?-BAT_BOX[0]:BAT_BOX[0])*w;z+=BAT_BOX[1]*w;
  if(e.r!=='inplay'&&!lf)z-=BAT_CROSS_FWD*4*w*(1-w);return[x,z]}
function k3Plan(e){const W=wpPlan(e),S=e.plan,D=Math.max(K3_MIN_D,Math.min(W.L,(S.t0-ARRIVE-WP_C_REACT)*WP_C_SPEED)),r=wpAt(W,D),K={W,D,Db:D,rest:[r[0],.04,r[1]],t0:S.t0,back:S.t0+K3_BACK_HOLD};
  if(S.k3tag){/* #671 part: he picks it up and runs up the line to tag the batter (plan.k3tag: pickup t0, tag at tagAt, no throw) */
    const tl=runnerTimeline(0,1,{kind:'wp'}),pr=runDist(S.tagAt-tl.st0,tl.spd),[px,pz]=pathPos(0,1,pr),[qx,qz]=pathPos(0,1,pr+1),[bx,bz]=batLeave(e,pr,px,pz),L=Math.hypot(qx-px,qz-pz)||1,ux=(qx-px)/L,uz=(qz-pz)/L,
      P=[bx-ux*K3_TAG_BEHIND,bz-uz*K3_TAG_BEHIND],s0=wpAt(W,0);
    Object.assign(K,{tag:{P,u:[ux,uz],r:[r[0],r[1]],s0:[s0[0],s0[1]]},back:S.tagAt+K3_TAG_HOLD,Db:Math.hypot(P[0]-s0[0],P[1]-s0[1])})}
  return K}
function k3Ball(e,u,plate,K){const S=e.plan,dirt=[plate[0],plate[1],MITT_Z];
  if(u<ARRIVE)return null;const roll=Math.max(.2,Math.min(WP_ROLL,S.t0-ARRIVE-WP_SKIP-.1));
  if(u<ARRIVE+WP_SKIP)return arc(plate,dirt,0,(u-ARRIVE)/WP_SKIP);
  if(u<ARRIVE+WP_SKIP+roll){const k=(u-ARRIVE-WP_SKIP)/roll;return arc(dirt,K.rest,.3*(1-k),1-(1-k)*(1-k))}
  if(u<S.t0)return K.rest;
  if(K.tag){const q=fielders.C.handWorld(1);return[q.x,q.y,q.z]}/* in his hand until the tag is made */
  const C=fielders.C,f=fielders[S.CV.key],sp=S.CV.spot,tgt=[sp[0],1.2,sp[1]];
  if(u<S.arrive){const rel=throwRelease(e,C,[C.g.position.x,C.g.position.z],K3_XFER,tgt);return arc(rel,tgt,throwPeak(S.TT),(u-S.t0)/S.TT)}
  if(u<S.arrive+2.5){const q=f.handWorld(0);return[q.x,q.y,q.z]}
  return null}
function k3Catcher(e,u,K){const C=fielders.C,S=e.plan,W=K.W,t=u-ARRIVE-WP_C_REACT;if(t<=0)return;
  const [hx,hz]=W.c0;let d;
  if(K.tag&&u>=K.t0){const T=K.tag,k=ease(sat01((u-K.t0)/(S.tagAt-K.t0))),w=sat01((u-K.back)*WP_BACK_V/(K.Db||1));let x,z;C.noAnim=false;
    if(u<K.back){x=lerp(T.r[0],T.P[0],k);z=lerp(T.r[1],T.P[1],k);C.g.position.set(x,0,z);face(C,T.u[0],T.u[1]);tagPose(C,u,K.t0,S.tagAt,0,true,1)}
    else{x=lerp(T.P[0],T.s0[0],w);z=lerp(T.P[1],T.s0[1],w);C.g.position.set(x,0,z);if(w<1)face(C,T.s0[0]-T.P[0],T.s0[1]-T.P[1]);else face(C,-hx,-hz)}
    return}
  if(u<K.t0)d=Math.min(K.D,runDist(t,WP_C_SPEED));else if(u<K.back)d=K.D;else d=Math.max(0,K.D-(u-K.back)*WP_BACK_V);
  const [x,z,dx,dz]=wpAt(W,d);C.g.position.set(x,0,z);C.noAnim=false;
  if(u<K.t0-K3_XFER)face(C,dx,dz);
  else if(u<K.back){const sp=S.CV.spot;face(C,sp[0]-x,sp[1]-z);C.noAnim=true;throwPose(C,Math.max(0,u-(K.t0-K3_XFER)),K3_XFER,[sp[0],1.2,sp[1]])}
  else if(d>0)face(C,-dx,-dz);else face(C,-hx,-hz)}
/* #671: the first baseman breaks for the bag (the engine's cover time) and takes the throw with the glove out */
function k3First(e,u){const S=e.plan;if(!S.CV)return;const f=fielders[S.CV.key],sp=S.CV.spot,D=Math.hypot(sp[0]-f.pos[0],sp[1]-f.pos[1]),k=D<.3?1:clamp(runDist(u-ARRIVE-FIELD_REACT,COVER_SPEED)/D,0,1);
  f.g.position.set(lerp(f.pos[0],sp[0],k),0,lerp(f.pos[1],sp[1],k));if(k>=1&&u<S.arrive+.5){face(f,-sp[0],-sp[1]);f.noAnim=true;gloveTo(f,lerp(.45,1,ease(sat01((u-(S.arrive-.45))/.3))),null)}}
/* #526: a pitch followed by a pitch of the same half ends on the spot the NEXT pitch poses each fielder on (fielderStart of its s0: holding a
   runner, double-play depth), not the spot of its own start, so no one pops 1-4 m at the boundary (render/tools/edge_probe.py). Anyone the
   play does not move walks there at RET_V m/s, starting RET_GAP s before the event ends (an in-play pitch: when the play returns, PL.rt) */
const RET_V=6.5,RET_GAP=.3,RET_SKIP=['P','C'];
const RET_NEXT=['P','VOTE','CHG','VIS'];
const retNext=(e,ei)=>{const nx=game&&game.ev&&game.ev[ei]===e?game.ev[ei+1]:null;return e.k==='P'&&nx&&RET_NEXT.includes(nx.k)&&nx.s0&&e.s0&&nx.s0.half===e.s0.half?nx:null};
function retSpot(e,ei,k,pos){const nx=retNext(e,ei);return nx?fielderStart(k,nx.s0.b,nx.s0.outs):pos}
/* #42: event-local time the last retDrift walk of a pitch not in play ends (0 = nobody moves); cpEvents must not cut it */
const retEnd=(ev,i)=>{const e=ev[i],nx=ev[i+1];if(!(e.k==='P'&&nx&&RET_NEXT.includes(nx.k)&&nx.s0&&e.s0&&nx.s0.half===e.s0.half))return 0;const dur=Number.isFinite(nx.t-e.t)?nx.t-e.t:e.d;
  return FIELDER_KEYS.some(k=>{if(RET_SKIP.includes(k))return false;const a=fielderStart(k,e.s0.b,e.s0.outs),b=fielderStart(k,nx.s0.b,nx.s0.outs);return Math.hypot(b[0]-a[0],b[1]-a[1])>=.01})?dur-RET_GAP:0};
function retDrift(e,u,ei){const nx=retNext(e,ei);if(!nx)return;const dur=Number.isFinite(nx.t-e.t)?nx.t-e.t:e.d;
  for(const k of FIELDER_KEYS){const f=fielders[k];if(RET_SKIP.includes(k))continue;const D=Math.hypot(f.ret[0]-f.pos[0],f.ret[1]-f.pos[1]);if(D<.01)continue;
    const t0=e.r==='inplay'&&e.plan?ARRIVE+e.plan.rt:dur-RET_GAP-runTime(D,RET_V),w=clamp(runDist(u-t0,RET_V)/D,0,1);f.g.position.set(lerp(f.pos[0],f.ret[0],w),0,lerp(f.pos[1],f.ret[1],w))}}
/* #611 part 1: a pinch runner (SUB frame with `base`) jogs out from his dugout to the bag while the man he replaces jogs off,
   paths and pace in render/subjog.js; module not in yet -> the old swap on the bag */
let sjM=null;import(new URL('subjog.js',stHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{sjM=M}).catch(err=>console.warn('pinch-run jog off',err));
function prRunners(e,u,i,off,standRunner,showRunner){const [bx,bz]=BASES[i+1],[nx,nz]=BASES[i+2],dx=nx-bx,dz=nz-bz,L=Math.hypot(dx,dz),ld=leadAt(0),spot=[bx+dx/L*ld,bz+dz/L*ld];
  const J=sjM.prJog(spot,dugout(off),u,e.d,[-bx,-bz]),oldN=e.s0.b[i],newN=e.s1.b[i];
  if(J.out&&oldN)showRunner(...J.out,oldN);
  if(J.in&&newN){if(J.in[0]===spot[0]&&J.in[1]===spot[1])standRunner(i,0,newN);else showRunner(...J.in,newN)}}
/* #611 part 2: a defensive replacement (SUB frame, role 'defensive') jogs the new fielder out from the dugout to his position while
   the man he replaces jogs off (dsOut, a spare fielder-kit figure); paths in render/subjog.js dsJog; lineup or module missing -> old swap */
const dsOut=figure(matDef,pants,true);dsOut.g.visible=false;
function dsFielders(e,u,ei,def){const L=luOf();if(!sjM||!sjM.dsJog||!L||ei<1)return;
  const nw=(L.lineupAt(e,def)||[])[e.lineup],od=(L.lineupAt(game.ev[ei-1],def)||[])[e.lineup],f=nw&&fielders[nw.pos];if(!f||!od)return;
  const J=sjM.dsJog(f.pos,dugout(def),u,e.d),bob=Math.abs(Math.sin(u*9))*.07;
  if(J.in){f.g.position.set(J.in[0],bob,J.in[1]);face(f,J.in[2],J.in[3])}else f.g.visible=false;
  if(J.out){resetPose(dsOut);dsOut.noAnim=false;dsOut.g.visible=true;dsOut.g.position.set(J.out[0],bob,J.out[1]);setNum(dsOut,od.num);dress(dsOut,od);face(dsOut,J.out[2],J.out[3])}}
/* #611 part 3: a pitching change (CHG frame): the old pitcher (dsOut, his own number and kit) walks to his dugout, the reliever (the P figure,
   already carrying the new number) comes in from his bullpen gate and stops on the rubber; paths and pace in render/chgwalk.js; module not in yet -> old swap */
let cwM=null;import(new URL('chgwalk.js',stHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{cwM=M}).catch(err=>console.warn('pitching change walk off',err));
function chgPitchers(e,u,def){const R=ROSTERS[def],i=curPit[def],od=R.pit[i],nw=R.pit[i+1];if(!cwM||!od||!nw)return;
  const f=fielders.P,m=f.pos,dug=dugout(def),bob=Math.abs(Math.sin(u*9))*.07,O=cwM.oldAt(m,dug,u,e.d),N=cwM.newAt(m,cwM.bullpenGate(dug),u,cwM.bullpenExit?cwM.bullpenExit(dug):null);
  if(O){resetPose(dsOut);dsOut.noAnim=false;dsOut.g.visible=true;dsOut.g.position.set(O[0],u>cwM.CW_OLD_GO?bob:0,O[1]);setNum(dsOut,od.num);dress(dsOut,od);face(dsOut,O[2],O[3])}
  if(N){f.g.visible=true;f.g.position.set(N[0],u<cwM.CW_SIGNAL+cwM.CW_JOG?bob:0,N[1]);face(f,N[2],N[3])}else f.g.visible=false}
/* #613 end of the game: render/finale.js plans it from the END frame (winner from the final score, walk-off = the winners were batting).
   Winners on the field jog to the ring between mound and plate and slap hands, walk-off winners (the runners' six, the two on-deck men) run
   out of their dugout and mob the scorer at the plate; then the winners line up behind the plate, bow to the stands, and leave; the losers
   on the field and the four umpires walk off. Pure function of (event, time) like every pose. */
let FINM=null;import(new URL('finale.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{FINM=M}).catch(err=>console.warn('finale off',err));
const FIN_LEAN=.95,FIN_ARMS=-2.6,FIN_PUMP=.25;let finKey=null,finPlan=null;
function finFig(f,c,u){f.g.visible=c.vis;if(!c.vis)return;f.noAnim=false;f.g.scale.x=1;f.g.position.set(c.x,c.hop,c.z);face(f,c.fx,c.fz);const R=f.rig;R.up.rotation.x=c.bow*FIN_LEAN;f.armsHeld=c.arms>0;
  if(c.arms>0){R.a0.quaternion.identity();R.a1.quaternion.identity();R.a0.scale.y=R.a1.scale.y=1;const w=u*8+(f.finI||0);R.a0.rotation.set(FIN_ARMS+FIN_PUMP*Math.sin(w),0,-.3);R.a1.rotation.set(FIN_ARMS+FIN_PUMP*Math.cos(w),0,.3)}}
function finPlanOf(e,off,def){const k=[e,off];if(finKey&&finKey[0]===k[0]&&finKey[1]===k[1])return finPlan;
  const winner=FINM.winnerSide(e.s1&&e.s1.sc,off),pool=[...runners,odNext,odDeck];
  finPlan=FINM.finalePlan({winner,fielders:FIELDER_KEYS.map(k=>fielders[k].pos),nOff:pool.length,dugDef:dugout(def),dugOff:dugout(off),
    umps:[[UMP_X,UMP_Z],...umpB.map((f,i)=>stUmpAt[i])]});finKey=k;return finPlan}
function poseFinale(e,u,ei,off,def){if(!FINM)return;const P=finPlanOf(e,off,def),winner=FINM.winnerSide(e.s1&&e.s1.sc,off),pool=[...runners,odNext,odDeck];
  const fl=FIELDER_KEYS.map(k=>fielders[k]);
  (winner==='def'?P.W:P.L).forEach((g,i)=>{fl[i].finI=i;finFig(fl[i],g.at(u),u)});
  if(winner==='off'){const R=ROSTERS[off].bat;P.W.forEach((g,i)=>{const f=pool[i];if(!f)return;resetPose(f);if(f.bend)f.bend.knee[0]=f.bend.knee[1]=0;f.finI=i;if(f.batP)f.batP.visible=false;
    const pl=R[i%R.length];setNum(f,pl?pl.num:undefined);dress(f,pl);finFig(f,g.at(u),u)})}
  [ump,...umpB].forEach((f,i)=>{const c=P.U[i].at(u);f.g.visible=c.vis;if(c.vis){f.g.position.set(c.x,0,c.z);face(f,c.fx,c.fz);f.noAnim=false}})}
/* #611 part 4: the ball on a pitching change: old pitcher -> manager (at the mound) -> reliever's glove (render/chgwalk.js holdAt); dev switch ?off=chgball */
const CW_REL_FWD=.9,CW_REL_Y=1.75,CW_MITT_FWD=.35,CW_MITT_Y=.7;/* #611 part 5: warm-up release point (m in front of the rubber, height) and the crouched catcher's mitt (m in front of him, height) */
/* the reliever's warm-up wind-up on a CHG frame (pen.js throwHands, release at chgwalk.js CW_WARM_REL); after the arm resets of poseScene */
function chgWarmArms(e,u){if(!cwM||!cwM.warmAt||!penM||OFF.has('chgwarm'))return;const w=cwM.warmAt(u,e.d);if(!w)return;const f=fielders.P,h=penM.throwHands(Math.min(w.tt,penM.PEN_THROW_PERIOD*.999));
  f.auto=false;f.armsHeld=true;aimArm(f.rig.a1,BAT_SHOULDER_X,h.r[0],h.r[1],h.r[2]);aimArm(f.rig.a0,-BAT_SHOULDER_X,-h.l[0],h.l[1],h.l[2])}
function chgBall(e,u){if(!cwM||!cwM.holdAt||!visitM||OFF.has('chgball'))return;const vp=visitOf(e),h=cwM.holdAt(!!vp,u);if(!h)return;
  const q=fielders.P.handWorld(0);let b=[q.x,q.y,q.z];
  if(h.who==='P'&&!OFF.has('chgwarm')){const w=cwM.warmAt&&cwM.warmAt(u,e.d);if(w){const P=fielders.P,C=fielders.C.g.position,px=P.pos[0],pz=P.pos[1],dx=px-C.x,dz=pz-C.z,L=Math.hypot(dx,dz)||1;
    const rel=[px-dx/L*CW_REL_FWD,CW_REL_Y,pz-dz/L*CW_REL_FWD],mitt=[C.x+dx/L*CW_MITT_FWD,CW_MITT_Y,C.z+dz/L*CW_MITT_FWD],wb=cwM.warmBall(w,rel,mitt,b);
    if(wb)b=wb;else if(w.tt<cwM.CW_WARM_REL){const r=P.handWorld(1);b=[r.x,r.y,r.z]}}}/* #611 part 5: warm-up pitches (chgwalk.js warmAt); ?off=chgwarm */
  if(h.who!=='P'){const va=visitM.visitAt(vp,u),L=Math.hypot(va.fx,va.fz)||1,m=[va.x+va.fx/L*.3,1.05,va.z+va.fz/L*.3];b=h.who==='mgr'?m:[m[0]+(q.x-m[0])*h.k,m[1]+(q.y-m[1])*h.k,m[2]+(q.z-m[2])*h.k]}
  ball.visible=true;ball.position.set(b[0],b[1],b[2]);ballSh.position.set(b[0],.03,b[2]);ballSh.visible=true}
function poseScene(e,u,dt,ei){
  dsOut.g.visible=false;pmField=null;/* #274: set again below only for a fielding pitcher */
  const s=u>=(e.showAt||0)?e.s1:e.s0,off=e.s0.half,def=1-off,defT=e.k==='BRK'&&u>=BRK_ON_AT?off:def;
  paintKit(matDef,defT);paintKit(matOff,e.k==='BRK'&&u>=BRK_ON_AT?def:off);/* #42: after the change the walkers out of the dugout are the new batting side */
  applyNums(e,off,defT);
  /* fielders default */
  for(const k of FIELDER_KEYS){const f=fielders[k];f.still=f.noAnim;resetPose(f);f.noAnim=false;f.pos=f.ret=fielderStart(k,e.s0.b,e.s0.outs);if(k!=='P')f.ret=retSpot(e,ei,k,f.pos);f.g.position.set(f.pos[0],0,f.pos[1]);face(f,-f.pos[0],-f.pos[1]);f.g.visible=e.k!=='END'&&e.k!=='PRE'||k==='P'||k==='C'}
  retDrift(e,u,ei);
  if(e.k==='SUB'&&e.role==='defensive')dsFielders(e,u,ei,def);
  if(e.k==='CHG')chgPitchers(e,u,def);
  ump.auto=true;ump.armsHeld=false;/* ump never gets resetPose: undo a call of the last frame (#42 slice 8) */ump.g.visible=e.k!=='END'&&e.k!=='PRE';/* #81: introScene hides every figure under the entry card; like the catcher, the plate umpire is shown again by his own pose every frame */poseBattery(e,u,ei>0?game.ev[ei-1]:null);poseMask(e,u);
  if(e.k==='BRK')brkSwap(e,u,off,def,ei);
  const P=fielders.P;P.arms[1].rotation.x=0;PR.up.rotation.set(0,0,0);PR.hg.rotation.set(0,0,0);P.noAnim=e.k==='P';
  /* opening ceremony: defenders jog in from the 1B-side dugout one by one */
  if(e.k==='PRE'){const ev=game&&game.ev&&game.ev[ei]===e?game.ev:null;FIELDER_KEYS.forEach((k,i)=>{const f=fielders[k],h=preEndOf(ev,ei,k)||f.home,d0=jogRank(k)*JOG_GAP,sx=dugout(def)[0],sz=INTRO_Z,tt=sat01((u-d0)/(Math.hypot(h[0]-sx,h[1]-sz)/JOG_SPEED));
    f.g.visible=u>=d0;f.g.position.set(lerp(sx,h[0],tt),tt>0&&tt<1?Math.abs(Math.sin(u*9+i))*.07:0,lerp(sz,h[1],tt));
    if(tt<1)face(f,h[0]-sx,h[1]-sz);else face(f,-h[0],-h[1])})}
  batter.g.visible=e.k==='P';runners.forEach(r=>r.g.visible=false);ball.visible=false;looseBat.visible=false;
  batter.g.position.set(-.9,0,.15);batter.g.rotation.y=Math.PI/2;
  odNext.batP.visible=odDeck.batP.visible=true;/* #613: hidden only in the finale mob */
  poseOnDeck(e,u,ei);poseStaff(e,u,ei);poseWelcome(e,u,ei);
  let ri=0;const showRunner=(x,z,fx,fz,nm)=>{const r=runners[ri++];if(!r)return;resetPose(r);if(r.bend)r.bend.knee[0]=r.bend.knee[1]=0;r.noAnim=false;r.g.visible=true;r.g.position.set(x,0,z);setNum(r,numOf(off,nm));dress(r,BODY_OF(off,nm));if(fx!==undefined)face(r,fx,fz)};
  const standRunner=(i,uu,nm)=>{const [x,z]=BASES[i+1],[nx,nz]=BASES[i+2],dx=nx-x,dz=nz-z,L=Math.hypot(dx,dz),ld=leadAt(uu);showRunner(x+dx/L*ld,z+dz/L*ld,-x,-z,nm);leadPose(runners[ri-1],uu,ld,Infinity)};
  /* Scorers of earlier plays (same batting team) still jogging to their dugout */
  const peelers=()=>{const T=e.t+u;for(let j=ei-1;j>=0&&T-game.ev[j].t<PEEL_LOOK;j--){const q=game.ev[j];if(q.k!=='P'||q.s0.half!==off)continue;
    for(const [,to,name,tl] of q.moves||[])if(to===4){const P=peelAt(off,tl,T-q.t-tl.arriveT);if(P)showRunner(...P,name)}}};
  if(e.k!=='P'){const pr=e.k==='SUB'&&e.base>=1&&e.base<=3&&sjM?e.base-1:-1;for(let i=0;i<3;i++)if(s.b[i]&&e.k!=='BRK'&&i!==pr)standRunner(i,0,s.b[i]);if(pr>=0)prRunners(e,u,pr,off,standRunner,showRunner);peelers();poseBatBoy(e,u,ei);if(e.k==='CHG'){chgWarmArms(e,u);chgBall(e,u)}if(e.k==='END')poseFinale(e,u,ei,off,def);return s}
  /* pitch */
  pbOn=e.r!=='inplay'&&e.r!=='foul'&&e.r!=='hbp'&&!e.wp&&!(e.k3&&e.plan&&e.plan.k3)&&!e.bk&&!e.po&&!e.sbGo&&!cpOn();if(pbOn&&pbM){const nx=game&&game.ev&&game.ev[ei+1];pbSeed=pbM.pbSeedOf(e.pit?e.pit.join(':'):'');pbEi=ei;pbSit={b:e.s0&&e.s0.b,c:e.c0};pbDur=nx&&nx.t>e.t?nx.t-e.t:12}/* compact showing keeps the old walk (done by PITCH_STILL); the same frames the catcher lobs the ball back (see the ball below) */
  const pr=pitchRel(e),pp=pitchPose(e.bk?bkU(u):e.po?0:PTM&&pr!==RELEASE?PTM.pitchU(u,pr,RELEASE):u),tip=pp.tip;
  /* A pitcher who fields the ball or covers first starts from where his delivery stride left him at contact (not from the rubber, which
     was a ~1 m jump), and his limbs and trunk grow out of the follow-through into the run over P_RUN_BLEND s (P.mix, read by animate) */
  if(e.r==='inplay'&&(e.play.fielder==='P'||e.plan.CV.key==='P')&&u>=ARRIVE){pmFieldSet(e,u);const k=1-ease(sat01((u-ARRIVE-FIELD_REACT)/P_RUN_BLEND));
    P.pos=[P.pos[0],P.pos[1]+kf(ARRIVE,PK.dz)];P.noAnim=false;PR.up.rotation.x*=k;PR.up.rotation.y*=k;PR.hg.rotation.y*=k;
    P.mix={k,l0:P.legs[0].rotation.x,l1:P.legs[1].rotation.x,a0:P.arms[0].rotation.x,a1:wrapA(P.arms[1].rotation.x)}}
  const hand=pp.rel,plate=[e.zx,.45+e.zy*.75,.6],bunt=e.r==='inplay'&&e.play.bunt,hbp=e.r==='hbp',fbunt=e.r==='foul'&&!!e.bunt;
  const moving=new Set(k3Moves(e).map(m=>m[2]));
  for(let i=0;i<3;i++){const n=e.s0.b[i];if(n&&!moving.has(n)){if(e.po&&i===0)poRunner(e,u,n,(...a)=>{showRunner(...a);return runners[ri-1]});else standRunner(i,u,n)}}
  const contact=e.r==='inplay'||e.r==='foul';
  poseBatter(e,u);batterWalk(e,u);batterMocap(e,u);placeUmp(e,u);bcPose(ump,4,e,u);/* #42 slice 8: his calls at the plate and on pop-ups */
  const hit0=bunt||fbunt?buntHit(e,u):contact?contactPt(e):null;if(hit0)plate.splice(0,3,...hit0);
  let bp=null;
  if(u<pr||e.bk){const q=fielders.P.handWorld(1);bp=[q.x,q.y,q.z]}/* balk: the ball never leaves his hand */
  else if(u<ARRIVE)bp=pitchArc(hand,hbp?hbpSpot(e):plate,.3,(u-pr)/(ARRIVE-pr),pitchBreak(e.pt,hand));
  else if(!contact&&e.wp){bp=wpBall(e,u,plate);wpCatcher(e,u)}
  else if(!contact&&e.k3&&e.plan&&e.plan.k3){const K=k3Plan(e);bp=k3Ball(e,u,plate,K);k3Catcher(e,u,K);k3First(e,u)}
  else if(!contact){ if(hbp)bp=hbpBall(e,u);
    else if(u<ARRIVE+CATCH_SNAP){const q=fielders.C.handWorld(0);bp=e.tip&&TIPB?TIPB.tipPath(plate,[q.x,q.y,q.z],e.bat&&batOf(e).hand==='L'?1:-1,(u-ARRIVE)/CATCH_SNAP):arc(plate,[q.x,q.y,q.z],0,(u-ARRIVE)/CATCH_SNAP)}/* #631: a foul tip bends once at the bat (render/tipball.js) *//* #128: into the mitt where it really is (no jump to the hand after the snap) */else if(u<BALL_BACK_AT){const q=fielders.C.handWorld(0);bp=[q.x,q.y,q.z]}else if(u<BALL_BACK_AT+BALL_BACK_DUR){const q=fielders.C.handWorld(0);bp=arc([q.x,q.y,q.z],pbGlove(hand),3,(u-BALL_BACK_AT)/BALL_BACK_DUR)}}
  else if(fbunt&&FBB){bp=FBB.foulBuntBall(hit0,e.foulDir,u-ARRIVE,BUNT_GROUND_Y);if(kidM&&!OFF.has('ballkid')&&!cpOn()){const tt=u-ARRIVE,ka=kidM.kidAt(e.foulDir,tt),T=kidM.kidTrip(e.foulDir);/* #612 part 7: it lies there until the kid picks it up, then rides in his hand */if(ka.ball)bp=ka.ball;else if(tt<T.tPick-kidM.KID_PICK/2&&!bp&&tt>=FBB.FB_GONE){const E=kidM.restSpot(e.foulDir);bp=[E[0],BUNT_GROUND_Y,E[1]]}}}
  else if(e.r==='foul'){const tt=(u-ARRIVE)/1.6;if(tt<1)bp=arc(hit0,[e.foulDir*24,9,22],12,tt);
    else{const nb=nbNow(e,u);if(nb&&nb.ball){const q=nb.ball==='ump'?ump.handWorld(1):fielders.C.handWorld(1);bp=nb.ball==='lob'?arc([q.x,q.y,q.z],hand,3,nb.k):[q.x,q.y,q.z]}}}/* #612 part 5: the new ball from the umpire's bag to the catcher, then to the pitcher */
  /* steal: the engine planned the catcher's throw and who covers the bag (e.plan: SS at second, 3B at third, #38); draw it */
  if(e.sbGo&&e.plan){const S=e.plan,c=fielders[S.CV.key],sp=S.CV.spot,D2=Math.hypot(sp[0]-c.pos[0],sp[1]-c.pos[1]),kc=D2<.3?1:clamp(runDist(u-RELEASE-FIELD_REACT,COVER_SPEED)/D2,0,1),D2b=Math.hypot(sp[0]-c.ret[0],sp[1]-c.ret[1]),bk=D2b<.3?0:clamp(runDist(u-(S.arrive+2.2),COVER_SPEED)/D2b,0,1);
    c.g.position.set(lerp(lerp(c.pos[0],sp[0],kc),c.ret[0],bk),0,lerp(lerp(c.pos[1],sp[1],kc),c.ret[1],bk));
    const tagA=S.actions.find(a=>a.a==='tag'),tagT=tagA?tagA.t:S.arrive+TAG_LATE_SWEEP;/* out: the engine's tag time; safe: a late swipe */
    if(bk===0&&u>S.t0-.2){face(c,-c.g.position.x,-c.g.position.z);c.noAnim=true;if(u<S.arrive)gloveTo(c,lerp(.45,1,ease(sat01((u-(S.arrive-.45))/.3))),null);else tagPose(c,u,S.arrive,tagT,S.CV.base,!!tagA)}
    const C=fielders.C,ct=catcherThrow(e,u,S,sp);
    if(u>=ARRIVE+CATCH_SNAP&&u<S.t0){const q=C.handWorld(ct.xferT<ct.xfer*XFER_HAND_SWAP?0:1);bp=[q.x,q.y,q.z]}
    else if(u>=S.t0&&u<S.arrive)bp=arc(ct.rel,ct.tgt,throwPeak(S.TT),(u-S.t0)/S.TT);
    else if(u>=S.arrive&&u<S.arrive+2.5){const q=c.handWorld(0);bp=[q.x,q.y,q.z]}
    else if(u>=S.arrive+2.5)bp=null}
  if(e.po&&e.plan)bp=poField(e,u);/* #38 pickoff: the pitcher's throw to first, the first baseman's catch and tag */
  /* runner moves: when each runner starts, slides and arrives is decided by the engine (4th element of a move) */
  const flyOut=e.r==='inplay'&&e.play.res==='out'&&e.play.type!=='GB';let batGone=Infinity;
  for(const [from,to,name,tl] of k3Moves(e)){
    const {st0,spd,slide,ts,slideTime:ST,arriveT}=tl,lead=from>0&&u<st0?(tl.tag?tagLeadAt(u,st0):leadAt(u)):tl.lead,Ltot=(to-from)*27.43;
    if(from===0)batGone=st0;
    let prog;if(u<ts)prog=runDist(Math.min(u,tl.tagStop??Infinity)-st0,spd)+lead;else{const sl=sat01((u-ts)/ST);prog=Ltot-SLIDE_D+SLIDE_D*(1-(1-sl)*(1-sl))}
    let [x,z,done]=pathPos(from,to,prog);
    if(from===0&&u<st0)continue;
    if(from===0)[x,z]=batLeave(e,prog,x,z);
    if(to===4&&u>=arriveT){const P=peelAt(off,tl,u-arriveT);if(!P)continue;showRunner(...P,name);const r=runners[ri-1];
      if(r&&slide){const k=ease(sat01((u-ts)/(ST*.35)))*(1-ease(sat01((u-arriveT-SLIDE_HOLD)/SLIDE_UP)));if(k>0)slidePose(r,k)}continue}
    const stays=to<4&&e.s1.b[to-1]===name;
    if(done&&!stays&&u-arriveT>.6)continue;
    const wk=stays&&u>=arriveT?leadWalk(u,arriveT,e.d||Infinity):0;/* #23 part 1: off the bag to the primary lead */
    if(wk>0){const [nx,nz]=BASES[to+1],dx=nx-x,dz=nz-z,L=Math.hypot(dx,dz);x+=dx/L*wk;z+=dz/L*wk}
    showRunner(x,z,undefined,undefined,name);
    const r=runners[ri-1];if(!r)continue;const [b0x,b0z]=BASES[to-1],[b1x,b1z]=BASES[to];
    if(!done){const [nx,nz]=pathPos(from,to,prog+1);face(r,nx-x,nz-z)}else if(slide)face(r,b1x-b0x,b1z-b0z);
    if(wk>0&&wk<LEAD_PRIMARY){const [nx,nz]=BASES[to+1];face(r,nx-b1x,nz-b1z)}else if(wk>0)face(r,-x,-z);/* walks out, then faces the plate as standRunner does */
    if(wk>0)leadPose(r,u,wk,Infinity);/* #23: shuffles out to the primary lead, so the next pitch frame starts in the same stance */
    else if(from>0)leadPose(r,u,lead,st0);/* #268: shuffle stance until the break, turned into the run over LEAD_TURN */
    if(from===0&&bunt&&buntDrop>0){const rk=1-ease(sat01((u-st0)/BUNT_RISE));if(rk>0){r.rig.l0.scale.y=r.rig.l1.scale.y=1-buntDrop/((r.k||1)*LEG_LEN)*rk;r.g.position.y=-buntDrop*rk}}/* Bunter comes up out of his crouch as he breaks for first */
    if(slide&&u>=ts){const k=ease(sat01((u-ts)/(ST*.35)))*(1-ease(sat01((u-arriveT-SLIDE_HOLD)/SLIDE_UP)));if(k>0)slidePose(r,k)}
  }
  peelers();
  poseLooseBat(e,u);/* #43: before hiding him, so the release pose can be read from his hands */
  poseBatBoy(e,u,ei);
  if(u>=batGone)batter.g.visible=false;
  if(e.r==='inplay'){
    /* the whole defensive play (who fields, who covers, every throw and its timing) is e.plan, computed by the engine */
    const p=e.play,PL=e.plan,f=fielders[p.fielder],T=p.hang,u2=u-ARRIVE,hr=p.res==='HR',hit=PL.hit;
    const land=[p.lx,hr?6+(p.dist-114)*.15:bunt&&BCL?BUNT_GROUND_Y:(hit||p.type==='GB'?.15:1.5),p.lz];
    const rollEnd=[PL.target[0],bunt&&BCL?BUNT_GROUND_Y:.15,PL.target[1]];
    /* #43 item 5: a bunt goes down off the bat, hops low and rolls slowing to the engine's stop point at T (render/bunt_clip.js buntRoll) */
    const RP=hit&&!hr&&RL?RL.rollPlan(land,rollEnd,PL.catchT-T,!!(DUST&&DUST.onDirt(p.lx,p.lz))):null;if(RP&&bunt)RP.hop=RP.th=0;
    const rollDur=RP?RP.dur:.8,rollBall=t=>RP?RL.rollAt(RP,land,rollEnd,t):arc(land,rollEnd,rollPk,t/.8);/* #646: the roll lasts rollDur, then he waits at rollEnd for the pickup */
    /* #645: any other grounder drops off the bat, hops with gravity (dirt or grass at the land point) and rolls to the land point at T, then into the glove by catchT (render/gb_path.js) */
    const gbHop=!bunt&&GBP&&p.type==='GB',gbP=gbHop?GBP.gbPlan(hit0,land,T,!!(DUST&&DUST.onDirt(p.lx,p.lz))):null;
    const gbAt=t=>bunt&&BCL?BCL.buntRoll(hit0,land,T,t):gbHop?GBP.gbPath(hit0,land,T,t,false,gbP):arc(hit0,land,p.peak,t/T),rollPk=bunt&&BCL?0:.3;
    const CV=PL.CV,tagPlay=PL.tagPlay,tagA=PL.actions.find(a=>a.a==='tag'&&a.f===CV.key),tg=tagA?{t:tagA.t,out:true}:tagPlay?{t:PL.arrive+TAG_LATE_SWEEP,out:false}:null,solo=PL.solo,dp=PL.dp,PV=PL.PV,PVspot=PL.PVspot,pv=dp?fielders[PV]:null,PIVOT_XFER=PL.pxfer;
    const catchT=PL.catchT,D=PL.D,cx=PL.stand[0],cz=PL.stand[1];
    const tgt=[CV.spot[0],PL.wild?.15:1.4,CV.spot[1]],tgtF=dp?[PVspot[0],1.4,PVspot[1]]:tgt,TD=PL.TD,TH={v:PL.v,xfer:PL.xfer},TD2=PL.TD2,V2=PL.V2,TT2=PL.TT2;
    const BAG=[BASES[1][0],BASES[1][1]],DB=Math.hypot(BAG[0]-cx,BAG[1]-cz),soloAt=PL.soloAt;
    const crowd=!!CV.key&&CV.key!==p.fielder&&Math.hypot(f.pos[0]-CV.spot[0],f.pos[1]-CV.spot[1])<BAG_CROWD_R;
    const t0=solo?Infinity:PL.t0,TT=PL.TT,rt=PL.rt,a1=dp?PL.a1:t0+TT,t1=dp?PL.t1:a1,arrive=PL.arrive;
    const rtF=crowd?Math.max(rt,arrive+COVER_BACK_AT+CROWD_CLEAR_T):rt;
    if(u2>0){const tc=catchT-FIELD_REACT,cc=tc<=0?1:tc<RUN_ACCEL?.5*tc*tc/RUN_ACCEL:.5*RUN_ACCEL+(tc-RUN_ACCEL),vCh=clamp(D/cc,CHASE_VMIN,CHASE_VMAX);/* Chase speed: arrive exactly at the catch moment (capped at 9 m/s) */
      const k=D<.5?1:clamp(runDist(u2-FIELD_REACT,vCh)/D,0,1),kk=hr?Math.min(k,.5):k,tx=lerp(f.pos[0],cx,kk),tz=lerp(f.pos[1],cz,kk);
      if(CV.key){const c=fielders[CV.key],D2=Math.hypot(CV.spot[0]-c.pos[0],CV.spot[1]-c.pos[1]),kc=D2<.3?1:clamp(runDist(u2-FIELD_REACT-COVER_REACT,COVER_SPEED)/D2,0,1),D2b=Math.hypot(CV.spot[0]-c.ret[0],CV.spot[1]-c.ret[1]),bk=D2b<.3?0:clamp(runDist(u2-(arrive+COVER_BACK_AT),COVER_SPEED)/D2b,0,1);
        c.g.position.set(lerp(lerp(c.pos[0],CV.spot[0],kc),c.ret[0],bk),0,lerp(lerp(c.pos[1],CV.spot[1],kc),c.ret[1],bk));/* #42: back to his pitch spot (the rubber for a pitcher covering first); #526: the next pitch's spot */
        if(tagPlay&&CV.key==='C'){resetPose(c);c.g.position.y=0}
        const fromX=dp?PVspot[0]:cx,fromZ=dp?PVspot[1]:cz;if(bk===0&&u2>arrive-TT-(dp?TT2:0)-.2){face(c,fromX-c.g.position.x,fromZ-c.g.position.z);c.noAnim=true;
          /* Receiving a throw: glove meets the ball, then the other hand takes it */
          const reach=ease(sat01((u2-(arrive-.45))/.3)),hold=sat01((u2-arrive)/.25);
          if(tg&&u2>=arrive)tagPose(c,u2,arrive,tg.t,CV.base,tg.out);/* A runner to tag (FC lead runner, tag-up at home or third): the tag */
          else gloveTo(c,lerp(.45,1,reach),u2<arrive?null:hold)}
        else face(c,p.lx-c.g.position.x,p.lz-c.g.position.z)}
      if(dp){const D3=Math.hypot(PVspot[0]-pv.pos[0],PVspot[1]-pv.pos[1]),kp=D3<.3?1:clamp(runDist(u2-FIELD_REACT,PIVOT_SPEED)/D3,0,1),D3b=Math.hypot(PVspot[0]-pv.ret[0],PVspot[1]-pv.ret[1]),bp2=D3b<.3?0:clamp(runDist(u2-(t1+1.5),6.5)/D3b,0,1);
        pv.g.position.set(lerp(lerp(pv.pos[0],PVspot[0],kp),pv.ret[0],bp2),0,lerp(lerp(pv.pos[1],PVspot[1],kp),pv.ret[1],bp2));
        if(bp2===0&&u2>a1-.6){pv.noAnim=true;if(u2<a1){face(pv,cx-pv.g.position.x,cz-pv.g.position.z);gloveTo(pv,ease(sat01((u2-(a1-.45))/.3)),null)}
          else{face(pv,tgt[0]-pv.g.position.x,tgt[2]-pv.g.position.z);throwPose(pv,u2-a1,PIVOT_XFER,tgt)}}else if(kp<1)face(pv,PVspot[0]-pv.g.position.x,PVspot[1]-pv.g.position.z)}
      const [sx0,sz0]=solo&&u2>=rt?[BAG[0],BAG[1]]:[tx,tz],DR=Math.hypot(f.ret[0]-sx0,f.ret[1]-sz0),back=DR<.5?0:clamp(runDist(u2-rtF,6.5)/DR,0,1);f.g.position.set(lerp(sx0,f.ret[0],back),0,lerp(sz0,f.ret[1],back));/* Back to position: walk back from wherever he last stood; #42: a pitcher who fielded walks back to the rubber (f.ret), not to his stride spot, so the next frame does not jump ~1 m */
      if(solo&&u2>catchT+.15&&back===0){const k2=DB<.3?1:clamp(runDist(u2-catchT-.15,6.5)/DB,0,1);f.g.position.set(lerp(tx,BAG[0],k2),0,lerp(tz,BAG[1],k2));if(k2<1){face(f,BAG[0]-cx,BAG[1]-cz);f.noAnim=false}}
      const fx=f.g.position.x,fz=f.g.position.z;
      if(back>0&&back<1)face(f,f.ret[0]-sx0,f.ret[1]-sz0);
      else if(!hr&&u2>=catchT&&u2<rt)face(f,tgtF[0]-fx,tgtF[2]-fz);/* Ball caught -> turn toward the throw target */
      else if(crowd&&u2<rtF)face(f,CV.spot[0]-fx,CV.spot[1]-fz);/* Waiting off the bag: watch the coverer */
      else{const fc=chaseM&&chaseM.foulChaseFace(e,u2,catchT,f.pos);if(fc)face(f,fc[0],fc[1]);else if(p.fielder==='P'&&back>=1)face(f,-f.ret[0],-f.ret[1]);/* #687: a pitcher back on the rubber stands as the next frame poses him (facing the plate), not away from where the ball landed */else face(f,-p.lx,-p.lz)}/* #620 part 3: corner fielders drift / run on a foul fly instead of backpedalling */
      /* Catch motion: glove reaches toward the ball in the last .35 s; after the catch both hands come to the chest for the transfer; then arm up and throw */
      if(!hr&&back===0&&u2>catchT-.35&&(u2<rt||!crowd)){f.noAnim=true;const low=p.type==='GB'||hit;
        if(u2<catchT+.12){const bpos=ballAt(u2+.04);reachGlove(f,bpos||[fx,low?.25:1.6,fz])}
        else if(solo){if(u2>=soloAt-.05){f.noAnim=true;gloveTo(f,1,null)}}/* Glove raised holding the ball while touching the base */
        else throwPose(f,u2-catchT,TH.xfer,tgtF)}}
    if(u2>0&&u2<T)bp=p.type==='GB'?gbAt(u2):flyPath(e,hit0,land,T)(u2);
    else if(u2>=T&&!hr&&p.groundRule&&GRDP)bp=GRDP.grdAt(GRDP.grdPlan(land),u2-T);/* #718: one bounce on the warning track and over the wall; the ball is dead, nobody picks it up */
    else if(u2>=T&&!hr){
      if(hit&&u2<T+rollDur)bp=rollBall(u2-T);
      else{const fx=f.g.position.x,fz=f.g.position.z,c=CV.key&&fielders[CV.key];
        if(u2<catchT)bp=hit?[rollEnd[0],rollEnd[1],rollEnd[2]]:gbHop?GBP.gbGlove(land,PL.stand,T,catchT,u2):[p.lx,bunt&&BCL?land[1]:.15,p.lz];
        else if(solo&&u2>=catchT){if(u2<rt+.3){const q=f.handWorld(0);bp=[q.x,q.y,q.z]}}
        else if(u2>=catchT&&u2<t0){const q=f.handWorld(u2-catchT<TH.xfer*.45?0:1);bp=[q.x,q.y,q.z]}/* In the glove first, in the throwing hand after the transfer */
        else if(u2>=t0&&u2<a1){const rel=throwRelease(e,f,[cx,cz],TH.xfer,tgtF);bp=arc(rel,tgtF,throwPeak(TT),(u2-t0)/TT)}
        else if(dp&&u2<t1){const q=pv.handWorld(u2-a1<PIVOT_XFER*.45?0:1);bp=[q.x,q.y,q.z]}
        else if(dp&&u2<arrive){const rel=throwRelease({t:e.t+.5},pv,PVspot,PIVOT_XFER,tgt);bp=arc(rel,tgt,throwPeak(TT2),(u2-t1)/TT2)}
        else if(u2<arrive+3.2){if(c){const q=c.handWorld(tg||u2-arrive<.25?0:1);bp=[q.x,q.y,q.z]}else bp=tgt}}}
    if(hr&&u2>0&&u2<T+.2&&!bp)bp=null;
    function ballAt(t){if(t<=0)return null;if(t<T)return p.type==='GB'?gbAt(t):flyPath(e,hit0,land,T)(t);if(hit)return t<T+rollDur?rollBall(t-T):rollEnd;if(gbHop&&t<=catchT)return GBP.gbGlove(land,PL.stand,T,catchT,t);return null}
  }
  if(!bp&&pbOn&&pbM&&!OFF.has('pbback')&&u>=BALL_BACK_AT+BALL_BACK_DUR&&pbM.pbAt(u,BALL_BACK_AT+BALL_BACK_DUR,pbS).holdsBall){const g=fielders.P.handWorld(0);bp=[g.x,g.y,g.z]}/* #642: the ball stays in his glove through the look, the turn and the walk */
  if(bp){ball.visible=true;ball.position.set(bp[0],bp[1],bp[2]);ballSh.position.set(bp[0],.03,bp[2]);const dB=ball.position.distanceTo(camera.getWorldPosition(_cw)),pxR=BALL_R*(innerHeight/2)/(dB*Math.tan(camera.fov*Math.PI/360)),bs=clamp(BALL_MIN_PX/pxR,1,BALL_MAX);ball.scale.setScalar(bs);ballSh.scale.setScalar(.35*bs)}
  ballSh.visible=ball.visible;
  /* sound cues */
  const cue=(name,at,fn)=>{const key=e.t+name;if(u>=at&&u<at+.6&&!cues.has(key)){cues.add(key);fn()}};
  if(contact)cue('crack',ARRIVE,()=>crack(bunt?BUNT_CRACK:e.r==='inplay'?1:.5));
  else if(e.r!=='hbp'&&!e.bk&&!e.po&&(!e.wp||e.pb))cue('pop',ARRIVE+.05,pop);/* a passed ball still hits the mitt */
  if(e.big)cue('roar',e.showAt,()=>roar(e.big));
  return s;
}

/* ---------- HUD ---------- */
const inningLabel=s=>`${s.inn} 局${s.half?'下':'上'}`;
let hudKey='',feedKey='';
function setDots(el,n){el.querySelectorAll('i').forEach((d,i)=>d.classList.toggle('on',i<n))}
const dotRows=document.querySelectorAll('.sit .dots');
const {bugPlace,applyLayout,editing:isEditing}=window.UILAYOUT({$,clamp,note});/* #4: ui/layout.js */

let bugKey='';
function hudBug(e,u,s,c){const P=e.k==='P'&&e.r!=='ibb'&&e.r!=='bk'&&!e.po,np=P?(u>=ARRIVE?e.pc:e.pc-1):'',sh=P&&u>=RELEASE+.05&&u<ARRIVE+4,k=[s.sc,s.inn,s.half,s.outs,s.b.map(Boolean),c,P?e.t:'',np,sh,e.k==='END'].join('|');if(k===bugKey)return;bugKey=k;
  const dot=(n,t,cl)=>{let h='';for(let i=0;i<t;i++)h+=`<span style="color:${i<n?cl:'rgba(255,255,255,.28)'}">●</span>`;return h};
  let bp='',bb='';
  if(P){const B=batOf(e),Pp=ROSTERS[e.pit[0]].pit[e.pit[1]];
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
  if(e.k==='P'){const B=batOf(e),Pp=ROSTERS[e.pit[0]].pit[e.pit[1]];m=`打者 <b>${B.num} ${B.name}</b>（${B.pos}）<br><small>${e.line}</small>投手 ${Pp.num} ${Pp.name}<small>本場用球數 ${e.pc}</small>`}
  {const pi=$('pinfo');let h='';
    if(e.k==='P'&&e.r!=='ibb'&&e.r!=='bk'&&!e.po){const B=batOf(e),Pp=ROSTERS[e.pit[0]].pit[e.pit[1]],sh=u>=RELEASE+.05&&u<ARRIVE+4,rt=x=>Math.round(x*70-12);
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
const scriptP=new Map(),loadScript=seed=>{if(window.FARM||window.LEDGER_GAME)return Promise.reject(new Error('replayed record: no commentary script (silent, feed only, #600 #592)'));if(!scriptP.has(seed))scriptP.set(seed,window.COMMENTARY.loadScript(seed).catch(err=>{scriptP.delete(seed);throw err}));return scriptP.get(seed)};
if(window.FARM_NOTE)window.READY.then(()=>note(window.FARM_NOTE));
if(window.OPENING)loadScript(window.OPENING.seed).catch(()=>{});/* fetched while the park compiles, not after the click */
function makeBooth(script){const g=game;return window.COMMENTARY.createBooth({stream:g.stream,seed:g.seed,bank:window.COMMENTARY_BANK,script,teams:g.teams.map(i=>TEAMS[i]),describe:x=>g.ev[x.f].desc})}
function showAiTag(){const v=!(sayOn&&booth&&booth.recorded);if(aiTag.hidden!==v)aiTag.hidden=v}
/* lines: [[who,text],...] said by the browser voice only if this game turns out to have no recorded voice */
function sayHello(lines){if(boothFor===game&&booth){if(!booth.recorded)for(const [w,t] of lines)say(w,t)}else hello=lines}
function setBooth(b,T0){booth=b;VOICE.setRecorded(b.recorded);b.due(T0-BOOTH_PRIME);showAiTag();
  const h=hello;hello=null;if(h&&!b.recorded)for(const [w,t] of h)say(w,t)}
function commentary(T){if(!sayOn||!window.COMMENTARY_BANK)return;
  if(boothFor!==game){const g=boothFor=game;booth=null;VOICE.setRecorded(false);loadScript(g.seed).then(sc=>{if(boothFor===g)setBooth(makeBooth(sc),T)},()=>{})}
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
let shotNow=-1,autoSeat=-1,hitPrev=false,tightPrev=false,platePrev=false;
/* Seat fovs are vertical. On a 19.5:9 phone 55 deg vertical is ~97 deg across, a fisheye that stretches the near stands while dragging the
   view around and makes the park feel like a model; cap the horizontal angle at HFOV_MAX (a 16:10 desktop stays as it was). */
const HFOV_MAX=80,fitFov=f=>Math.min(f,2*Math.atan(Math.tan(HFOV_MAX*Math.PI/360)/camera.aspect)*180/Math.PI);
/* Broadcast camera after contact: high behind home plate looking at the whole field, aim drifting slowly between the field centre and the ball */
const HITCAM={x:0,y:8,z:11,fov:62,mid:[0,0,-26]};
/* Tight shot of the batter (#158): on the first pitch of each plate appearance the broadcast lens (auto seat, also inside the director)
   closes from 5.5 to TIGHT_FOV on the batter while he walks in from the on-deck circle and sets, holds until TIGHT_OUT_AT, then opens
   back over TIGHT_OUT_DUR so the frame is the normal one .15 s before the release: pitch tracking is unchanged. Camera only, no
   event timing. Weight and aim are a pure function of (event, time, batter pose), so a bar jump lands on the same framing. Off with
   the 望遠鏡 toggle (already tighter). Aim: TIGHT_AIM_Y m up the batter (scaled by his build), head in the upper part of the frame. */
const TIGHT_FOV=2.4,TIGHT_OUT_AT=RELEASE-.6,TIGHT_OUT_DUR=.45,TIGHT_AIM_Y=1.45;
const tightW=(e,u)=>!e||e.k!=='P'||e.r==='ibb'||e.r==='bk'||e.po||!e.c0||e.c0[0]+e.c0[1]!==0||u>=TIGHT_OUT_AT+TIGHT_OUT_DUR?0:1-ease(sat01((u-TIGHT_OUT_AT)/TIGHT_OUT_DUR));
/* #209 item 1 (render/platecam.js): the play at the plate, auto seat only. A high home camera behind the net on a narrow lens while a runner is tagged
   or tags up at home; weight = pure function of (event, time), camera only. Loaded by dynamic import: until it is in, the weight is 0. */
let leadM=null;import(new URL('lead.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{leadM=M}).catch(err=>console.warn('runner lead stance off',err));/* #268 */
let platecamM=null;import(new URL('platecam.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{platecamM=M}).catch(err=>console.warn('plate camera off',err));
/* #211: tight key-shadow frustum on the batter while the tight shot is on, max only (render/keyfit.js, pure). Light direction is unchanged. */
let keyfitM=null,keyTight=false;import(new URL('keyfit.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{keyfitM=M}).catch(err=>console.warn('key fit off',err));
/* #211 item 4: depth of field on the tight batter shot and the plate camera, max only (render/dof.js, pure). Focus = distance to the batter / the plate aim. */
let dofM=null;import(new URL('dof.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{dofM=M}).catch(err=>console.warn('dof off',err));
function dofFrame(tw,pw){if(!dofM||!dofU.scale)return;let d=0;if(gfxMax){const t=pw>=dofM.DOF_MIN_W&&platecamM?_dofT.set(...platecamM.PLATE_AIM):tw>0?batter.g.position:null;if(t)d=rig.position.distanceTo(t)}
  const p=dofM.dofParams(gfxMax?tw:0,gfxMax?pw:0,d);dofU.focus.value=p.focus;dofU.len.value=p.length;dofU.scale.value=p.scale}
const _dofT=new THREE.Vector3();
/* #211 item 4: per-object motion blur (bat, arm, ball) on the same two shots, max only; render/mblur.js is pure, a frame over MB_MAX_DT is a jump and gets none */
let mbM=null;import(new URL('mblur.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{mbM=M;MB_SAMPLES=M.MB_SAMPLES}).catch(err=>console.warn('motion blur off',err));
function mbFrame(tw,pw,dt){if(!mbM||!mbU.scale)return;const p=mbM.mbParams(gfxMax?tw:0,gfxMax?pw:0,dt);mbU.scale.value=p.scale;mbU.cap.value=p.cap}
/* #209 item 3: video finish on max (render/finish.js, pure). The grain frame is a function of the game time, so a seek shows the grain of playing there. */
let finM=null;import(new URL('finish.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{finM=M;if(finU.knee){finU.knee.value=M.ROLL_KNEE;finU.max.value=M.ROLL_MAX;finU.amt.value=M.GRAIN_AMT;finU.lift.value=M.SOFT_LIFT}}).catch(err=>console.warn('finish off',err));
function finFrame(){if(finM&&finU.f)finU.f.value=finM.grainFrame(curT())}
function fitKey(on){if(!keyfitM)return;on=on&&gfxMax;if(!on&&!keyTight)return;const f=keyfitM.keyFit(on?batter.g.position:null),c=key.shadow.camera;keyTight=on;key.target.position.set(...f.target);key.position.set(...f.position);Object.assign(c,{left:-f.half,right:f.half,top:f.half,bottom:-f.half});c.updateProjectionMatrix();key.target.updateMatrixWorld()}
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
  const tw=s.auto&&!trk&&!zoomed&&batter.g.visible?tightW(curEvent,curU):0;
  if(tw>0){const bp=batter.g.position;tx=lerp(tx,bp.x,tw);ty=lerp(ty,TIGHT_AIM_Y*(batter.k||1),tw);tz=lerp(tz,bp.z,tw)}
  const pw=s.auto&&!zoomed&&platecamM?platecamM.plateW(curEvent,curU,ARRIVE):0;
  if(pw>0){rig.position.set(lerp(cs.x,0,pw),lerp(py,platecamM.PLATE_CAM_Y,pw),lerp(cs.z,platecamM.PLATE_CAM_Z,pw));const A=platecamM.plateAim?platecamM.plateAim(curEvent,curU,ARRIVE):platecamM.PLATE_AIM;tx=lerp(tx,A[0],pw);ty=lerp(ty,A[1],pw);tz=lerp(tz,A[2],pw)}
  const rp=rig.position,[y,p]=look(rp.x,rp.y,rp.z,tx,ty,tz);camera.rotation.set(clamp(p+pitchOff,-1.3,.9),y+yawOff,0);
  const fov=fitFov(zoomed?bf*.4:pw>0?lerp(tw>0?lerp(bf,TIGHT_FOV,tw):bf,platecamM.PLATE_FOV,pw):tw>0?lerp(bf,TIGHT_FOV,tw):bf);
  if(tw>0||tightPrev||pw>0||platePrev){if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix()}}/* the tight shot is a cut in and a timed ease out: no lag */
  else if(Math.abs(camera.fov-fov)>.05){camera.fov+=(fov-camera.fov)*Math.min(1,dt*6);camera.updateProjectionMatrix()}tightPrev=tw>0;platePrev=pw>0;fitKey(tw>0&&gfxMax);dofFrame(tw,pw);mbFrame(tw,pw,dt);finFrame()}
$('seats').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;seat=+b.dataset.seat;yawOff=pitchOff=0;for(const x of $('seats').children)x.setAttribute('aria-pressed',x===b)});
$('gear').onclick=()=>{if(isEditing())return;const b=$('bar');b.classList.toggle('collapsed');$('gear').textContent=b.classList.contains('collapsed')?'⚙ 設定':'✕ 收起';bugPlace()};

addEventListener('orientationchange',()=>setTimeout(()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);bugPlace()},300));
/* Collapse the studio panel: keep only play and the timeline so it covers less of the view (stored in zu_stFold) */
{let fold=false;try{fold=localStorage.getItem('zu_stFold')==='1'}catch(e){}const setFold=v=>{fold=v;$('studio').classList.toggle('fold',v);$('stFold').textContent=v?'▴':'▾';try{localStorage.setItem('zu_stFold',v?'1':'0')}catch(e){}};setFold(fold);$('stFold').onclick=()=>setFold(!fold)}
/* #133 entry log: what happened in the first seconds after the click (ms from the click), carried in the report code so a cold visit on a real
   machine can be read back: f1 first drawn frame, gap longest stretch without a drawn frame in the first ENTRY_WATCH_MS, tA>B a quality drop (r = shaders rebuilt), wN warm-up ms */
const ENTRY_WATCH_MS=15000;let entryT0=0,entryDraw=0,entryGap=0;const entryLog=[];
const entryNote=x=>{if(entryT0&&entryLog.length<12)entryLog.push(`${x}@${Math.round(performance.now()-entryT0)}`)};
function entryFrame(now){if(!entryT0||now-entryT0>ENTRY_WATCH_MS)return;if(!entryDraw)entryNote('f1');else entryGap=Math.max(entryGap,now-entryDraw);entryDraw=now}
$('report').onclick=async()=>{const B=window.BOOT,code=`#BUG entry=${entryLog.join(',')||'-'},gap${Math.round(entryGap)} boot=${B&&B.str?B.str()||'-':'-'}${OFF.size?` off=${[...OFF].join('+')}`:''} fps=${fpsAvg.toFixed(0)} tier=${gfxMax?`max(${PP?PP.fx:'nopost'})`:gfxTier}${maxWish&&!gfxMax?`(max-${IS_GPU?'off':'gl'})`:''} be=${IS_GPU?'gpu':'gl'} px=${renderer.domElement.width}x${renderer.domElement.height} seed=${seedCur} t=${curT().toFixed(1)} seat=${seat} zoom=${zoomed} mode=${mode} dec=${JSON.stringify(decisions||{})} ev=${curEvent?curEvent.k+(curEvent.r?'/'+curEvent.r:''):''} u=${curU.toFixed(2)}${studio?` act=${studio.key}#${studio.n+1}`:''}`;
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
/* The frozen first game (league/preseason/opening.json, loaded by play.html): the recorded stream is played from the top, nothing is simulated. */
function startOpening(){const O=window.OPENING;stopTalk();mode='opening';gameStart=Date.now();seedCur=O.seed;decisions={};myVotes={};resolving.clear();game=O.game;lastIdx=-1;cues.clear();replayT=0;speed=1;voteKey='';subscribeGame();plReset();cpLoad(game);
  $('seedTag').textContent=`季前熱身賽・重播・引擎 ${O.engine}・種子 #${seedCur}`;$('spd').hidden=false;$('spd').textContent='1×';$('mode').hidden=true}
$('practice').onclick=()=>{startPractice();note('新的一場：兩隊都由你調度，暫停時速度會自動回到 1×')};
$('spd').onclick=e=>{speed=speed===1?4:speed===4?16:1;e.currentTarget.textContent=speed+'×'};
/* ---------- player bar (#47): play / pause, elapsed / total, a mark at every half inning, click or drag to move. Frozen game only (mode 'opening').
 * A jump lands on the start of the nearest play. Pictures are posed from (event, time), so nothing is replayed: the scorebug, feed and
 * cue keys are reset, the voice is stopped and the booth re-primed, and only lines bound at or after the landing frame are said (seekFloor).
 * Every jump fires a 'cloudball:seek' event on window ({from, to} seconds; a drag also fires one when it starts, {drag: true, to: null}) for ui/stats.js (#117). Markup in play.html, styles in ui/player.css. */
const SEEK_EPS=1e-3,PL_KEY_STEP=1;/* SEEK_EPS s: re-prime the booth just before the landing time, so a line due exactly there is said; PL_KEY_STEP: plays per arrow key */
let paused=false,scrubbing=false,plFresh=false,seekFloor=0,seekGame=null,plFor=null,plStarts=[0],plLast='';
const plEl=$('player'),plTrack=$('plTrack'),plTip=$('plTip'),plPlay=$('plPlay');
const fmtClock=x=>{x=Math.max(0,Math.floor(x));const h=Math.floor(x/3600),m=Math.floor(x/60)%60,sx=String(x%60).padStart(2,'0');return h?`${h}:${String(m).padStart(2,'0')}:${sx}`:`${m}:${sx}`};
const halfTag=e=>e.k==='PRE'?'賽前':e.k==='END'?'終':`${e.s0.half?'▼':'▲'}${e.s0.inn}`;
/* starts of every play (plus 0, the pregame) and one mark at the first pitch of each half inning */
function plBuild(){plFor=game;plStarts=[0];const marks=[];let k='';
  for(const e of game.ev){if(e.k!=='P')continue;plStarts.push(e.t);const h=e.s0.inn+'|'+e.s0.half;if(h!==k){k=h;marks.push(e)}}
  $('plMarks').innerHTML=marks.map(e=>`<i class="${e.s0.half?'bot':'top'}" style="left:${(cpView(e.t)/cpDur()*100).toFixed(3)}%"${e.s0.half?'':` data-inn="${e.s0.inn}"`}></i>`).join('');
  plCurve();
  plTrack.setAttribute('aria-valuemax',Math.round(cpDur()));$('plTime').style.minWidth=`${2*fmtClock(cpDur()).length+3}ch`/* the track must not change width as the clock grows */}
/* excitement curve + scoring dots (#121, render/barcurve.js): computed once per build from the recorded stream, display only (pointer-events none) */
let plDots=[];
function plCurve(){const g=game;plDots=[];$('plCurve').innerHTML='';$('plDots').innerHTML='';
  BARCURVE.then(B=>{if(!B||plFor!==g||game!==g||!window.COMMENTARY)return;let c;try{c=B.barCurve(g,window.COMMENTARY.tensionTrack)}catch(err){console.warn('bar curve off',err);return}
    const W=1000,H=100,vd=cpDur(),x=t=>cpView(t)/vd;plDots=c.dots;
    $('plCurve').innerHTML=`<path d="M0,${H} L${c.pts.map(p=>`${(x(p.t)*W).toFixed(1)},${(H-p.v*H).toFixed(1)}`).join(' L')} L${W},${H} Z"/>`;
    $('plDots').innerHTML=c.dots.map(d=>`<i${d.hr?' class="hr"':''} style="left:${(x(d.t)*100).toFixed(3)}%"></i>`).join('')})}
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
function plShowTip(t){const e=game.ev[findIdx(t)],d=plDots.find(d=>d.t===t);plTip.textContent=d?d.label:`${halfTag(e)}・${fmtClock(cpView(t))}`;plTip.style.left=(cpView(t)/cpDur()*100)+'%';plTip.hidden=false}
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
const PITCH_STILL=Math.max(PK_END,BALL_BACK_AT+BALL_BACK_DUR,ARRIVE+CATCH_SNAP+UC_DELAY+UC_K_HOLD+UC_K_DOWN,ARRIVE+BAT_REST_AT+BAT_REST_DUR,
  ARRIVE+window.ENGINE.LEAD_BACK_AT+window.ENGINE.LEAD_BACK_DUR,ARRIVE+CATCH_SNAP+MITT_HOLD+MITT_BACK);
const CP_RUNNER_SETTLE=.6+SLIDE_HOLD+SLIDE_UP,CP_PEEL_STEP=.05,CP_PEEL_MAX=30;/* after a runner arrives (vanish / get up from a slide); peel search step and cap */
const cpHere=document.currentScript&&document.currentScript.src;
import(new URL('grade.js',cpHere||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{GRADE=M;applySky(skyCur)}).catch(err=>console.warn('park mood off',err));/* #208 item 5 */
const BARCURVE=import(new URL('barcurve.js',cpHere||location.href.replace(/[^/]*$/,'render/')).href).catch(err=>{console.warn('bar curve off',err);return null});
const COMPACT=import(new URL('compact.js',cpHere||location.href.replace(/[^/]*$/,'render/')).href).catch(err=>{console.warn('compact showing off',err);return null});
function peelLen(team,tl){for(let t=0;t<CP_PEEL_MAX;t+=CP_PEEL_STEP)if(!peelAt(team,tl,t))return t;return CP_PEEL_MAX}
const jogEnd=(from,t0,end)=>t0+Math.max(...FIELDER_KEYS.map(k=>{const h=end&&end(k)||fielders[k].home;return jogRank(k)*JOG_GAP+Math.hypot(h[0]-from[0],h[1]-from[1])/JOG_SPEED}));
/* [{t, d, head, tail, kind}] for render/compact.js: nothing moves in [0, head) and [tail, d) of each event (event-local s). A ball in play,
   a steal and a hit batsman are never cut (their motion depends on the whole plan). Scorers of earlier plays still peeling off to their
   dugout (drawn until PEEL_LOOK s after their play) keep any event they cross moving. */
const TIME_FRAMES=new Set(['VOTE','CHG','VIS','SUB']);/* frames that open with the plate ump's time signal (umptime.js TIME_KINDS) */
function cpEvents(g){const ev=g.ev;
  return ev.map((e,i)=>{const off=e.s0?e.s0.half:0;let pe=0,head=0,tail=e.d;
    for(let j=i-1;j>=0&&e.t-ev[j].t<PEEL_LOOK;j--){const q=ev[j];if(q.k!=='P'||q.s0.half!==off)continue;
      for(const [,to,,tl] of q.moves||[])if(to===4)pe=Math.max(pe,Math.min(q.t+PEEL_LOOK,q.t+tl.arriveT+peelLen(off,tl))-e.t)}
    {const w=welNow(ev,i,e.t,off);if(w)pe=Math.max(pe,w[0].end-w[1])}/* #266: teammates of a home run still walking back */
    if(e.k==='VOTE'){head=e.d;tail=0}
    else if(e.k==='CHG'||e.k==='VIS'){const vp=visitOf(e);if(vp){head=vp.go;tail=vp.end}else if(visitM){head=e.d;tail=0}if(e.k==='CHG'&&cwM&&cwM.warmEnd&&!OFF.has('chgwarm')){head=Math.min(head,cwM.warmStart());tail=Math.max(tail,cwM.warmEnd(e.d))}}/* #611 part 5: warm-up pitches *//* #81: the manager's walk to the mound and back; module not in yet -> keep it all */
    else if(e.k==='BRK'){head=BRK_OFF_AT;tail=Math.max(jogEnd(dugout(off),BRK_ON_AT),jogEnd(dugout(off),BRK_ON_AT,k=>{const b=brkEndsOf(ev,i,k);return b&&b.to}),stJogEnd(1-off,BRK_ON_AT),odEnd(ev,i),u2End(ev,i))}/* #42: base coaches, leadoff and on-deck men too */
    else if(e.k==='PRE')tail=Math.max(jogEnd([dugout(1-off)[0],INTRO_Z],0),jogEnd([dugout(1-off)[0],INTRO_Z],0,k=>preEndOf(ev,i,k)),stJogEnd(off,0),odEnd(ev,i));
    else if(e.k==='P'&&e.r!=='inplay'&&e.r!=='hbp'&&!e.sbGo){const mv=k3Moves(e);tail=PITCH_STILL;
      if(e.pa&&e.bat&&!mv.some(m=>m[0]===0))tail=Math.max(tail,BAT_AWAY_AT+batAwayT(e,batAway(e).L));/* strikeout: he walks off to his dugout */
      const od=odPlan(ev,i);if(od)tail=Math.max(tail,od.go+Math.max(od.t1,od.t2));/* #42: next batter walks up, the one after him to the circle */
      for(const [,to,,tl] of mv)tail=Math.max(tail,tl.arriveT+(to===4?peelLen(off,tl):Math.max(CP_RUNNER_SETTLE,LEAD_WALK_WAIT+LEAD_WALK_DUR)));/* #23: walk-out to the lead */
      if(e.wp)tail=Math.max(tail,wpPlan(e).end);if(e.k3&&e.plan&&e.plan.k3){const K=k3Plan(e);tail=Math.max(tail,K.back+K.Db/WP_BACK_V)}if(e.bk)tail=Math.max(tail,BK_CALL_AT+.3+BK_BACK);if(e.po&&e.plan)tail=Math.max(tail,e.plan.safe?Math.max(e.plan.back.arrive+PO_TURN,e.plan.runnerAt+LEAD_WALK_WAIT+LEAD_WALK_DUR):e.plan.runnerAt+PO_OFF)}/* walk: runners trot on; #38 wild pitch: the catcher walks back; balk: the pitcher winds back */
    if(e.k==='P'&&e.r!=='inplay')tail=Math.max(tail,retEnd(ev,i));/* #42: fielders walking to the next pitch's depth (retDrift) */
    if(e.k==='P')tail=Math.max(tail,u2End(ev,i));if(e.k==='P'&&DUST)tail=Math.max(tail,DUST.dustEnd(e,DUST_BASES));/* #208: slide dust is motion too *//* #42 slice 9: U2 jogs between his inside spot and his post */
    {const tc=tmM?tmM.timeCall(e,ev[i-1]):null;/* #638: the plate ump's time / play signal (#609 part 3a) moves him in VOTE/CHG/VIS/SUB and the next pitch */
      if(tc){head=0;/* not tc.at: a figure can still settle in the frame's first steps (pitcher after a strikeout, edge_probe) */tail=Math.max(tail,tmM.timeEnd(e,ev[i-1]))}else if(!tmM&&!OFF.has('umptime')&&TIME_FRAMES.has(e.k)){head=0;tail=e.d}}/* module not in yet -> keep it all */
    if(pe>0){head=0;tail=Math.max(tail,pe)}
    return{t:e.t,d:e.d,head,tail:Math.min(tail,e.d),kind:e.k==='BRK'?'half':e.k==='CHG'||e.k==='VIS'||e.k==='SUB'?'change':'pitch',jogEnd:e.k==='BRK'?Math.max(jogEnd(dugout(off),BRK_ON_AT),jogEnd(dugout(off),BRK_ON_AT,k=>{const b=brkEndsOf(ev,i,k);return b&&b.to})):0}})}/* #144: jogEnd = new defence at its posts */
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
  if(mode==='opening')return{cls:'',txt:window.FARM?'二軍比賽（重播）':window.LEDGER_GAME?'正式比賽（重播）':'季前熱身賽（重播）',sub:window.SITE&&window.SITE.dev?`${speed}× 速度`:''};
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
const isL=e=>e.bat&&batOf(e).hand==='L';
const pl=(e,f)=>e.k==='P'&&e.play&&f(e.play);
const K3=e=>/三振/.test(e.desc||'');
const STUDIO_SEEDS=40,STUDIO_SEEDS_RARE=400,STUDIO_MAX=30;/* rare acts (5th field) scan a bigger seed bank */
const STUDIO_ACTS=[
  ['投打','cstr','投球・看好球',e=>e.k==='P'&&e.r==='cstr'&&!K3(e)],
  ['投打','sstr','投球・揮空好球',e=>e.k==='P'&&e.r==='sstr'&&!K3(e)],
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
  ['跑壘','outhome','一壘安打・二壘跑者衝本壘遭捕手觸殺（#38）',e=>pl(e,p=>!!p.outHome),STUDIO_SEEDS_RARE],
  ['跑壘','stretch','一壘安打・打者硬闖二壘遭觸殺（#38）',e=>pl(e,p=>!!p.outStretch),STUDIO_SEEDS_RARE],
  ['跑壘','bobble','一壘安打・外野漏接、跑者多推進（#38）',e=>pl(e,p=>!!p.errAdvance),STUDIO_SEEDS_RARE],
  ['跑壘','wildthrow','滾地球・內野暴傳一壘、跑者多推進（#38）',e=>pl(e,p=>!!p.wildThrow),STUDIO_SEEDS_RARE],/* the ball ends on the ground past first (plan.wild) */
  ['跑壘','score','跑壘・跑者回本壘得分',e=>e.k==='P'&&e.play&&e.play.res!=='HR'&&e.runs>0],
  ['跑壘','HR','跑壘・全壘打繞壘',e=>pl(e,p=>p.res==='HR')],
  ['跑壘','sb','盜壘',e=>e.k==='P'&&e.sbGo],
  ['跑壘','sbout','盜壘・觸殺出局',e=>e.k==='P'&&e.sbGo&&e.plan&&e.plan.actions.some(a=>a.a==='tag')],
  ['跑壘','sb3','盜三壘（三壘手補位、捕手傳三壘）',e=>e.k==='P'&&e.sbGo&&e.plan&&e.plan.CV.base===3,STUDIO_SEEDS_RARE],
  ['傳球','tagfc','短打・野選觸殺',e=>pl(e,p=>p.bunt)&&e.plan.actions.some(a=>a.a==='tag'),STUDIO_SEEDS_RARE],
  ['跑壘','slide','滑壘・二壘/三壘安打',e=>pl(e,p=>p.res==='2B'||p.res==='3B')],
  ['跑壘','dpslide','滑壘・雙殺被封殺',e=>pl(e,p=>p.dp)],
  ['跑壘','tagup','高飛犧牲打・回壘再衝本壘',e=>pl(e,p=>p.res==='out'&&p.type==='FB'&&e.runs>0)],
  ['跑壘','tag3','高飛接殺・二壘跑者回壘衝三壘',e=>pl(e,p=>p.res==='out')&&e.plan.tagPlay&&e.plan.CV.base===3],
  ['跑壘','sf23','高飛犧牲打・二壘跑者跟進三壘',e=>pl(e,p=>p.res==='out'&&p.type==='FB')&&(e.moves||[]).some(m=>m[0]===3&&m[1]===4)&&(e.moves||[]).some(m=>m[0]===2&&m[1]===3),STUDIO_SEEDS_RARE],
  ['跑壘','k3','振落・球漏接、捕手追球傳一壘',e=>e.k==='P'&&e.k3&&e.plan&&e.plan.k3,STUDIO_SEEDS_RARE],
  ['跑壘','wp','暴投・跑者推進（捕手追球）',e=>e.k==='P'&&e.wp&&!e.pb],
  ['跑壘','pb','捕逸・球彈出手套（捕手追球）',e=>e.k==='P'&&e.pb,STUDIO_SEEDS_RARE],
  ['跑壘','bk','投手犯規・投球動作中止，跑者推進',e=>e.k==='P'&&e.bk,STUDIO_SEEDS_RARE],
  ['跑壘','po','牽制出局・投手傳一壘，跑者回壘被觸殺',e=>e.k==='P'&&e.po&&!e.pof,STUDIO_SEEDS_RARE],
  ['跑壘','pof','牽制球・跑者撲回壘包安全，一壘手回傳投手',e=>e.k==='P'&&e.pof],
  ['上壘','bb','四壞保送',e=>e.k==='P'&&/保送/.test(e.desc||'')&&e.r!=='ibb'],
  ['上壘','hbp','觸身球',e=>e.k==='P'&&e.r==='hbp'],
  ['上壘','ibb','故意四壞',e=>e.k==='P'&&e.r==='ibb'],
  ['裁判','utime','主審・暫停（換人／教練團／球迷投票開始）雙手舉高',e=>e.k==='SUB'||e.k==='VOTE'||e.k==='CHG'||e.k==='VIS',STUDIO_SEEDS_RARE],
  ['裁判','uplay','主審・比賽繼續（暫停後第一球）指向投手',(e,ev,i)=>e.k==='P'&&!e.bk&&e.r!=='ibb'&&i>0&&['SUB','VOTE','CHG','VIS'].includes(ev[i-1].k),STUDIO_SEEDS_RARE],
  ['裁判','lfoul','邊線裁判・界外球雙手舉高',e=>e.k==='P'&&e.r==='foul'],
  ['裁判','lfair','邊線裁判・近邊線的界內球指向界內',e=>e.k==='P'&&e.r==='inplay'&&e.play&&!e.play.bunt&&e.play.res!=='HR'&&!(e.play.dist<27.43)&&Math.abs(e.play.spray)>=37&&Math.abs(e.play.spray)<=45,STUDIO_SEEDS_RARE],
  ['裁判','pfair','主審・近邊線、未到壘的界內球指向界內',e=>e.k==='P'&&e.r==='inplay'&&e.play&&!e.play.foul&&e.play.res!=='HR'&&e.play.dist<27.43&&Math.abs(e.play.spray)>=37&&Math.abs(e.play.spray)<=45,STUDIO_SEEDS_RARE],
  ['裁判','lhr','邊線裁判・全壘打手指繞圈',e=>e.k==='P'&&e.r==='inplay'&&e.play&&e.play.res==='HR',STUDIO_SEEDS_RARE],
  /* #611: one act per change of player (every one walks on and off, read from the CHG / SUB event) */
  ['換人','chg','換投・後援投手從牛棚跑上投手丘、原投手走回休息區',e=>e.k==='CHG'],
  ['換人','prun','代跑・代跑者從休息區跑到壘上、原跑者跑回',e=>e.k==='SUB'&&e.base>=1&&e.base<=3],
  ['換人','dsub','守備替補・替補野手跑到守位、原野手跑回休息區',e=>e.k==='SUB'&&e.role==='defensive'],
];
let studio=null;const stCache={};
function studioClips(key){if(stCache[key])return stCache[key];const A=STUDIO_ACTS.find(a=>a[1]===key),f=A[3],nS=A[4]||STUDIO_SEEDS,out=[];
  for(let sd=1;sd<=nS&&out.length<STUDIO_MAX;sd++){const g=simGame(sd,{});g.ev.forEach((e,i)=>{if(out.length<STUDIO_MAX&&f(e,g.ev,i))out.push({seed:sd,i})})}
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
   0 everything on (desktop) -> 1 phone start: 1.25x resolution, 1024 shadow map -> 2 1x resolution, no post/grass blades/bugs -> 3 no realtime shadows (the contact shadows of #132 stay on every tier).
   Drop one tier whenever the average over FPS_WIN frames exceeds FPS_BUDGET_MS (down only, never up, to avoid flip-flopping); a chosen tier is saved in zu_tier and used as the start next time.
   #236: saved as "tier@ms" and used for TIER_KEEP_MS only, so one bad session (a GPU fault, a busy machine) no longer parks a browser on a low tier for good;
   an old plain number from before is ignored. */
const IS_MOBILE=/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)||matchMedia('(pointer:coarse)').matches,FPS_WIN=90,FPS_BUDGET_MS=19,FPS_WARMUP_MS=4000,TIER_MAX=3;
const TIER_KEEP_MS=2*864e5;/* two days */
let gfxTier=IS_MOBILE?1:0,fpsAcc=0,fpsN=0,fpsAvg=0,tierT0=performance.now();try{const [a,b]=(localStorage.getItem('zu_tier')||'').split('@'),t=+a,at=+b;if(at&&Date.now()-at<TIER_KEEP_MS&&t>gfxTier&&t<=TIER_MAX)gfxTier=t}catch(e){}
/* ---------- contact shadows (#132) ----------
   Every figure, on every tier (Low included), gets a soft dark patch at the feet plus a fan of six faint long shadows pointing away from the six
   towers, as a night game shows: what keeps players from looking pasted on the grass. Two instanced meshes, no depth write, matrices set each
   frame from the figures' positions; fan length follows the lamp height. Replaces the old tier-3 round blobs. */
const CS_R=.3,CS_R_CROUCH=.42,CS_PATCH_A=.45,CS_FAN_OP=.12,CS_FAN_W=.5,CS_BODY_H=1.85,LAMP_H=46,CS_FAN_MIN=1.2,CS_FAN_MAX=5,CS_Y=.02,CS_TEX=64;
const csFigs=[...Object.values(fielders),batter,ump,...runners,...umpB,...coaches,mgr],csBig=new Set([fielders.C,ump]);
const csTex=draw=>{const c=document.createElement('canvas');c.width=c.height=CS_TEX;draw(c.getContext('2d'),CS_TEX);return new THREE.CanvasTexture(c)};
/* #267: three gives the scene pass's side targets (normal for AO/SSGI, diffuse for SSGI, velocity for TRAA) no blending by default, so each
   patch and fan quad overwrote the ground's normal, albedo and velocity over its whole rectangle, alpha-0 corners included: AO/GI/TRAA read a
   different ground there and drew a pale star of 6 spokes around every figure. setupPost now blends those targets like the material
   (MRT_KEEP); csMrt writes alpha 0 into them, so they keep the ground's values and only the colour target gets the shadow. Only while the
   renderer has an MRT: three uses a material MRT alone when the pass has none (tiers without AO), and that would drop the colour output. */
const csMrt=TSL.mrt(Object.fromEntries(MRT_KEEP.map(n=>[n,TSL.vec4(0)])));
const csMat=(map,opacity)=>{const m=new THREE.MeshBasicNodeMaterial({color:0,map,opacity,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  Object.defineProperty(m,'mrtNode',{get:()=>renderer.getMRT()?csMrt:null,set(){}});return m};
const csPatch=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),csMat(csTex((g,n)=>{const gr=g.createRadialGradient(n/2,n/2,0,n/2,n/2,n/2);
  gr.addColorStop(0,`rgba(0,0,0,${CS_PATCH_A})`);gr.addColorStop(.45,`rgba(0,0,0,${CS_PATCH_A*.7})`);gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,n,n)}),1),csFigs.length);
const csFan=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2).translate(0,0,-.5),csMat(csTex((g,n)=>{/* canvas bottom = feet (v 0), fades to the tip and to both sides */
  let gr=g.createLinearGradient(0,n,0,0);gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,n,n);
  g.globalCompositeOperation='destination-in';gr=g.createLinearGradient(0,0,n,0);gr.addColorStop(0,'rgba(0,0,0,0)');gr.addColorStop(.5,'rgba(0,0,0,1)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,n,n)}),CS_FAN_OP),csFigs.length*LAMPS.length);
const CS_ON=!OFF.has('shadows');if(CS_ON)[csPatch,csFan].forEach(m=>{m.frustumCulled=false;m.renderOrder=1;scene.add(m)});
function updateContactShadows(){csPatch.material.opacity=csSoft.a;csFan.material.opacity=CS_FAN_OP*csSoft.a;csFigs.forEach((f,i)=>{const g=f.g,p=g.position;
  if(!g.visible){csPatch.setMatrixAt(i,HIDE);for(let j=0;j<LAMPS.length;j++)csFan.setMatrixAt(i*LAMPS.length+j,HIDE);return}
  const r=2*csSoft.r*(csBig.has(f)?CS_R_CROUCH:CS_R);dummy.position.set(p.x,p.y+CS_Y,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(r,1,r);dummy.updateMatrix();csPatch.setMatrixAt(i,dummy.matrix);
  LAMPS.forEach(([lx,lz],j)=>{const dx=p.x-lx,dz=p.z-lz,d=Math.hypot(dx,dz)||1;dummy.rotation.set(0,Math.atan2(-dx/d,-dz/d),0);
    dummy.scale.set(CS_FAN_W,1,clamp(CS_BODY_H*d/(LAMP_H-CS_BODY_H),CS_FAN_MIN,CS_FAN_MAX));dummy.updateMatrix();csFan.setMatrixAt(i*LAMPS.length+j,dummy.matrix)})});
  csPatch.instanceMatrix.needsUpdate=true;csFan.instanceMatrix.needsUpdate=true}
/* #258: the tier actually drawn, always on screen on dev (the owner will not open the console). A quiet line under the dev tag in the top-right corner,
   away from the score box and the bar; setTier() is the only writer, so a ?q= force, the 畫面 button and the automatic drop all show up. A click or ?hud=0 hides it
   (kept in zu_hud), ?hud=1 brings it back. Production never shows it. `var` on purpose: setTier may run before this line has been reached. */
const TIER_HUD_CSS='margin-top:2px;font-size:12px;color:inherit;text-shadow:0 1px 2px rgba(0,0,0,.8);cursor:pointer;user-select:none';
var tierHud=null;
function tierHudInit(){if(!IS_DEV||tierHud!==null)return;tierHud=false;let on=true;
  try{const q=new URLSearchParams(location.search).get('hud');if(q!==null)localStorage.setItem('zu_hud',q==='0'?'0':'1');on=localStorage.getItem('zu_hud')!=='0'}catch(e){}if(!on)return;
  const el=document.createElement('div');el.id='tierTag';el.className='dev-only';el.style.cssText=TIER_HUD_CSS;
  el.onclick=ev=>{ev.stopPropagation();el.remove();tierHud=false;try{localStorage.setItem('zu_hud','0')}catch(e){}note('畫質標籤收起來了（網址加 ?hud=1 叫回來）')};
  ($('tag')||document.body).appendChild(el);tierHud=el}
function tierHudText(){if(tierHud===null)tierHudInit();if(!tierHud)return;
  const t=gfxMax?'畫質 max':`畫質 ${gfxTier}/${TIER_MAX}${maxWish&&!gfxTier?'（最高沒開）':''}`;tierHud.textContent=t;
  tierHud.title=`${gfxMax?`max: ${PP?PP.fx||'-':'no post'} (t TRAA, g SSGI, r SSR, d DoF, m motion blur; - = off)`:`0 = 最好、${TIER_MAX} = 最省`}・點一下收起來`}
function setTier(n){const was=gfxTier;gfxTier=clamp(n,0,TIER_MAX);if(gfxTier>0)gfxMax=false;try{localStorage.setItem('zu_tier',`${gfxTier}@${Date.now()}`)}catch(e){}
  renderer.setPixelRatio(gfxMax?devicePixelRatio:Math.min(devicePixelRatio,[2,1.25,1,1][gfxTier]));renderer.setSize(innerWidth,innerHeight);
  {const sm=gfxMax?MAX_SHADOW_MAP:gfxTier?1024:2048;key.shadow.mapSize.set(sm,sm);key.shadow.radius=gfxMax?MAX_SHADOW_RADIUS:TIER_SHADOW_RADIUS}/* radius is a uniform: no rebuild *//* the shadow node resizes its map from mapSize every frame: a size change needs no rebuild */
  PP=gfxTier>=2||gfxLow||OFF.has('post')?null:(PP&&PP.max===gfxMax&&PP.fx===fxKey()?PP:setupPost());if(!!scene.environment!==gfxMax)skyEnv();
  const sh=gfxTier<3&&!OFF.has('shadowmap');renderer.shadowMap.enabled=sh;key.castShadow=sh;
  envOn=gfxTier<2;cloudSet();dampSet();bugs.pts.visible=envOn;setCrowdDensity(CROWD_DENSITY[gfxTier]);if(!envOn)blades.im.visible=false;
  /* #133: only shadows on/off and post on/off change the shaders. A drop that changes neither (0->1: resolution, map size, crowd) used to
     rebuild every material and freeze the picture for the whole warm-up, right after the click on a first visit; now it costs nothing. */
  tierHudText();/* #258: before the no-rebuild return below, so every tier change shows */
  const sig=`${sh}|${!!PP}|${gfxMax}|${PP?PP.fx:''}`;/* max: environment map + velocity/diffuse MRT change every shader */entryNote(`t${was}>${gfxTier}${sig===tierSig?'':'r'}`);if(sig===tierSig)return;const first=tierSig===null;tierSig=sig;
  if(!first&&key.shadow.map){key.shadow.map.dispose();key.shadow.map=null}
  scene.traverse(o=>{if(o.material){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>m.needsUpdate=true)}});
  if(warmStarted)warmUp()}/* a drop in play rebuilds every material: compile it off the frame instead of freezing the tab (#125) */
let tierSig=null;
let envOn=true;
/* ---------- cold start (#125) ----------
   On a first visit the first frame built and compiled every material in one go: a frozen tab for seconds, right when the visitor presses enter.
   Now the loop runs without drawing while compileAsync builds the whole park (it yields between objects; frustum culling is off for that call so
   what the poster camera does not see is included; with post on it compiles for the post's scene pass). READY_FRAMES real frames follow (shadow and post passes compile there, behind the poster),
   then window.READY resolves and play.html enables the entry buttons. A quality drop in play goes through the same path. */
const READY_FRAMES=3,READY_MAX_MS=30000;/* READY_MAX_MS: a compile that never ends (lost device) must not keep the buttons asleep for good */let warming=false,warmStarted=false,warmRun=0,readyN=0,readyOk,bootReady=false;window.READY=new Promise(ok=>readyOk=ok);
/* #162: boot must not depend on the frame rate. A throttled tab (1 frame a second) or a hidden one (no frames) would make the READY_FRAMES
   wait seconds or forever. When the compile ends and frames come slower than READY_SLOW_GAP_MS (median gap since w0), or the tab is hidden,
   or READY_FRAMES are not drawn READY_AFTER_W1_MS after it, the buttons wake at once; the frames still draw when the tab gets them. */
const READY_SLOW_GAP_MS=200,READY_AFTER_W1_MS=500,BOOT_SLOW_N=5;/* BOOT_SLOW_N: slowest compiled objects named in BOOT.t (s1 .. s5) */const bootGaps=[];
const rafMedian=()=>{if(!bootGaps.length)return Infinity;const a=[...bootGaps].sort((x,y)=>x-y);return a[a.length>>1]};
function readyNow(tag){if(bootReady)return;bootReady=true;if(tag)BOOT_MARK(tag);const B=window.BOOT;if(B&&B.t)B.t.raf=bootGaps.length?Math.round(rafMedian()):'none';
  if(warmRun===1&&!warming)warmFramesLeft=0;/* the bar does not sit near the end waiting for frames */readyOk()}
setTimeout(()=>{if(bootReady)return;if(readyN<READY_FRAMES)BOOT_MARK(`timeout${warming?'W':'F'}${readyN}`);if(warmRun===1&&!wbar.hidden&&warming){const p=wbar.querySelector('p');if(p)p.textContent='還在準備，可以先進場'}readyNow()},READY_MAX_MS);
function bootCompiled(){if(bootReady)return;if(document.hidden||rafMedian()>READY_SLOW_GAP_MS){readyNow(document.hidden?'rdyHidden':'rdySlow');return}
  setTimeout(()=>{if(!bootReady&&readyN<READY_FRAMES)readyNow(`rdyWait${readyN}`)},READY_AFTER_W1_MS)}/* #162: timeoutW = the compile never ended, timeoutFn = n of READY_FRAMES drawn */
/* #133 progress bar: from the start of a warm-up (behind the entry card, or a quality drop in play) until the frames after it are drawn.
   Real progress only: objects compiled / objects to compile (compileAsync's onProgress), then the WARM_BAR_FRAME_SHARE for the frames that
   compile the shadow and post passes. It shows only once the wait passes WARM_BAR_DELAY_MS, so a warm visit does not flash it. */
const BOOT_COMPILE_Q=[.25,.5,.75,.9,1];/* compile progress points timed in BOOT.t (c25 .. c100) */
const WARM_BAR_DELAY_MS=700,WARM_BAR_FRAME_SHARE=.15,WARM_FRAMES=READY_FRAMES;let warmT0=0,warmLoaded=0,warmTotal=0,warmFramesLeft=0;
/* the bar element is static markup in play.html (on screen from the first paint, BOOT fills its loading share); the first warm-up continues it from BOOT.share */
const BOOT=window.BOOT||{share:0};let wbar=document.getElementById('warmBar');if(!wbar){wbar=document.createElement('div');wbar.id='warmBar';wbar.setAttribute('role','progressbar');wbar.innerHTML='<div><i></i></div><p>球場準備中…</p>';document.body.appendChild(wbar)}
const wbarFill=wbar.querySelector('i');BOOT.own=true;
function warmBarTick(now){const busy=warming||warmFramesLeft>0;if(!busy){if(!wbar.hidden)wbar.hidden=true;return}
  const first=warmRun===1;if(!first&&now-warmT0<WARM_BAR_DELAY_MS)return;/* the first one is already on screen (play.html) */
  const f=(1-WARM_BAR_FRAME_SHARE)*(warmTotal?warmLoaded/warmTotal:0)+WARM_BAR_FRAME_SHARE*(WARM_FRAMES-warmFramesLeft)/WARM_FRAMES,base=first?BOOT.share:0,pc=Math.round(100*(base+(1-base)*f));
  wbarFill.style.width=pc+'%';wbar.setAttribute('aria-valuenow',String(pc));if(wbar.hidden)wbar.hidden=false}
/* #162: on the owner's throttled Chrome the compile moved in whole frames. three 0.186.1 (read): its yields are scheduler.yield when present
   (Chrome 157 has it), so what is left to wait is the browser's pipeline promises (WebGPU createRenderPipelineAsync, WebGL parallel-compile
   polls via requestAnimationFrame), awaited one object after another. In a
   throttled tab (1 frame a second) that made the compile 30 s. So the warm-up first compiles one object per distinct material and geometry
   layout, all at once (WARM_PARALLEL), so those waits overlap; then the usual whole-scene compile only finds what is left (cache hits).
   Same programs, same picture: it only changes the order and overlap of the compile. Dev switch ?off=par = the old serial compile. */
const WARM_PARALLEL=true,WARM_PAR_SHARE=.8;/* share of the compile part of the bar given to the parallel phase */
/* #236: a warm-up phase that has not finished after WARM_STALL_MS is let go (the objects still building are named in BOOT.t.stall) so the
   buttons never wait for the 30 s READY_MAX_MS timeout; WARM_FAIL_N failed pipelines are named in BOOT.t.pf (count) and pf1 .. pfN. */
const WARM_STALL_MS=12000,WARM_FAIL_N=3;let warmHold=null;/* warmHold: the renderer's own target and MRT while a warm-up holds the scene pass's */
async function warmUp(){warmStarted=warming=true;const run=++warmRun,off=[],w0=performance.now();warmT0=w0;warmLoaded=warmTotal=0;warmFramesLeft=WARM_FRAMES;
  let parF=0,serF=0,nObj=0;const setF=()=>{warmTotal=1;warmLoaded=WARM_PAR_SHARE*parF+(1-WARM_PAR_SHARE)*serF;if(run===1)for(const q of BOOT_COMPILE_Q)if(warmLoaded>=q-1e-9)BOOT_MARK(`c${Math.round(q*100)}`);warmBarTick(performance.now())};
  const prog=ev=>{if(run!==warmRun)return;nObj=ev.total;serF=ev.total?ev.loaded/ev.total:1;setF()};
  if(run===1)BOOT_MARK('w0');
  /* #162: time each compiled object of the first warm-up: from getForRenderAsync to its new pipelines done (or to the pipeline lookup when nothing
     new is made); the BOOT_SLOW_N slowest go into BOOT.t as s1..sN = "material name or type / object name or type, xN = instances / vN = vertices:ms".
     The same wrapper makes concurrent builds of one node cache key wait for the first one (no duplicate shader builds in the parallel phase). */
  const nd=renderer._nodes,pl=renderer._pipelines,slow=[],failed=[],gfr=nd&&nd.getForRenderAsync,gpr=pl&&pl.getForRender,t0=new Map(),pend=new Map();
  const roName=ro=>{const m=ro.material||{},ob=ro.object||{},g=ob.geometry,nv=g&&g.attributes&&g.attributes.position?g.attributes.position.count:0;return `${m.name||m.type||'?'}/${ob.name||ob.type||'?'}${ob.isInstancedMesh?'x'+ob.count:''}/v${nv}`};
  const done=ro=>{const t=t0.get(ro);if(t!==undefined){t0.delete(ro);if(run===1)slow.push([performance.now()-t,roName(ro)])}};
  if(gfr&&gpr){nd.getForRenderAsync=function(ro){if(!t0.has(ro))t0.set(ro,performance.now());let k=null;try{k=nd.getForRenderCacheKey(ro)}catch(e){}
      const q=k!==null&&pend.get(k);if(q)return q.then(()=>gfr.call(nd,ro));const r=gfr.call(nd,ro);if(k!==null){pend.set(k,r);r.finally(()=>{if(pend.get(k)===r)pend.delete(k)})}
      /* #236: a build that ends after a stall let go of the scene pass's MRT read the wrong one: rebuild it at its first real draw */
      r.then(()=>{if(stalled){const m=ro.material;if(m)m.needsUpdate=true}},()=>{});return r};
    /* #236: a pipeline the GPU refused is marked error by the backend: name its object (pf in the bug report) instead of a black object */
    const chk=(ro,r)=>{try{const b=renderer.backend.get(r);if(b&&b.error&&failed.length<WARM_FAIL_N*10)failed.push(roName(ro))}catch(e){}};
    pl.getForRender=function(ro,promises){const n=promises?promises.length:0,r=gpr.call(pl,ro,promises);if(promises&&promises.length>n)Promise.all(promises.slice(n)).then(()=>{done(ro);chk(ro,r)});else done(ro);return r}}
  scene.traverse(o=>{if(o.frustumCulled){o.frustumCulled=false;off.push(o)}});
  /* with post on, the scene is drawn by the post's scene pass (its own target and MRT outputs, part of every shader): compile for that one.
     #236: compileAsync picks the render context (target + MRT: the pipeline's colour targets) before its first await, but builds each shader
     after it, reading renderer.getMRT() then. Putting the MRT back right after the call (#182) built shaders with one output for a pipeline
     with two targets: refused on a real GPU ("Color target has no corresponding fragment stage output ... targets[1]"), black on every tier.
     So the scene pass's target and MRT are held for the whole warm-up (the loop does not draw while warming) and put back at its end. */
  const sp=PP&&PP.scenePass,cs=sp?sp.scene:scene,cc=sp?sp.camera:camera;
  if(!warmHold)warmHold={rt:renderer.getRenderTarget(),mrt:renderer.getMRT()};
  if(sp){if(sp.options.samples===undefined)sp.renderTarget.samples=renderer.samples;renderer.setRenderTarget(sp.renderTarget);renderer.setMRT(sp.getMRT())}
  else{renderer.setRenderTarget(warmHold.rt);renderer.setMRT(warmHold.mrt)}
  const inTarget=f=>f();
  /* a phase that never settles (a pipeline promise the driver never answers) is let go after WARM_STALL_MS */
  let stalled=false;const jobs=[],stall=pr=>{jobs.push(pr);return Promise.race([pr,new Promise(r=>setTimeout(()=>{stalled=true;r()},WARM_STALL_MS))])};
  try{
    if(OFF.has('warm')){}
    else if(OFF.has('prog'))await (sp?(sp.compileAsync?sp.compileAsync(renderer):null):renderer.compileAsync(scene,camera));
    else if(renderer.compileAsync){
      if(WARM_PARALLEL&&!OFF.has('par')){
        /* one object per distinct (material, geometry layout, mesh kind); objects holding lights are left to the whole-scene pass (a light passed
           twice would change the light set of the shader) */
        const reps=new Map();cs.traverseVisible(o=>{if(!(o.isMesh||o.isLine||o.isPoints||o.isSprite)||!o.material)return;let lit=false;o.traverse(c=>{if(c.isLight)lit=true});if(lit)return;
          const g=o.geometry,ms=Array.isArray(o.material)?o.material:[o.material],key=ms.map(m=>m.uuid).join('+')+'|'+(g?Object.keys(g.attributes).sort().join(',')+(g.index?'i':'')+Object.keys(g.morphAttributes||{}).join(','):'')+'|'+(o.isInstancedMesh?'I':'')+(o.isBatchedMesh?'B':'')+(o.isSkinnedMesh?'S':'')+(o.isSprite?'P':'')+(o.isLine?'L':'')+(o.isPoints?'O':'');
          if(!reps.has(key))reps.set(key,o)});
        let nd2=0;const N=reps.size||1;
        await stall(Promise.all([...reps.values()].map(o=>inTarget(()=>renderer.compileAsync(o,cc,cs)).catch(e=>console.warn('warm-up part failed',e)).finally(()=>{if(run!==warmRun)return;parF=++nd2/N;setF()}))));
        if(run===1)BOOT_MARK(`wp/${reps.size}`)}
      else parF=1;
      if(run===warmRun&&!stalled){setF();await stall(inTarget(()=>renderer.compileAsync(cs,cc,null,prog)))}}}
  catch(e){console.warn('warm-up failed',e)}finally{for(const o of off)o.frustumCulled=true;
    const unwrap=()=>{if(gfr&&gpr&&nd.getForRenderAsync!==gfr){nd.getForRenderAsync=gfr;pl.getForRender=gpr}};
    if(stalled)Promise.allSettled(jobs).then(unwrap);else unwrap();/* after a stall the wrappers stay until the late builds end (they mark them) */
    if(run===warmRun&&warmHold){renderer.setRenderTarget(warmHold.rt);renderer.setMRT(warmHold.mrt);warmHold=null}}/* a newer warm-up holds on */
  {const B=window.BOOT,nm=x=>x.replace(/[,@]/g,'_');if(B&&B.t){
    if(run===1){slow.sort((a,b)=>b[0]-a[0]);slow.slice(0,BOOT_SLOW_N).forEach(([ms,n],i)=>B.t[`s${i+1}`]=`${nm(n)}:${Math.round(ms)}`)}
    if(failed.length){B.t.pf=failed.length;[...new Set(failed)].slice(0,WARM_FAIL_N).forEach((n,i)=>B.t[`pf${i+1}`]=nm(n));console.warn('#236 pipelines refused by the GPU:',failed)}
    if(stalled){B.t.stall=[...t0.keys()].slice(0,WARM_FAIL_N).map(ro=>nm(roName(ro))).join('+')||'?';console.warn('#236 warm-up let go after',WARM_STALL_MS,'ms; still building:',B.t.stall)}}}
  if(run!==warmRun)return;warming=false;if(run===1){BOOT_MARK(`w1/${nObj}`);bootCompiled()}entryNote(`w${Math.round(performance.now()-w0)}`);fpsAcc=fpsN=0;tierT0=performance.now()/* the compile is not a slow frame */}
let ftWin=null;/* #211 item 5: max-tier frame window (avg, worst, p95 ms), render/frametime.js */
import(new URL('frametime.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{ftWin=M.frameWindow(FPS_WIN)}).catch(err=>console.warn('frame time off',err));
function fpsTick(dtMs){const ftR=gfxMax&&ftWin?ftWin.push(dtMs):null;fpsAcc+=dtMs;fpsN++;if(fpsN<FPS_WIN)return;fpsAvg=1000/(fpsAcc/fpsN);const avg=fpsAcc/fpsN;fpsAcc=fpsN=0;
  if(gfxMax){const B=window.BOOT;if(B&&B.t&&!warming){B.t.ftmax=Math.round(avg*10)/10;if(ftR)B.t.ftw=ftR.worst+'/'+ftR.p95}return}/* #211: max never drops; its frame time (ms, last FPS_WIN frames) goes to boot= */
  if(performance.now()-tierT0>FPS_WARMUP_MS&&$('intro').hidden&&!document.hidden&&avg>FPS_BUDGET_MS&&gfxTier<TIER_MAX){setTier(gfxTier+1);tierT0=performance.now();note(`有點卡，自動降畫質（${gfxTier}/${TIER_MAX}）`)}}
setTier(gfxMax?0:gfxTier);

/* ---------- loop ---------- */
applyLayout();let lastNow=performance.now(),stKey='',outFixed=null,introVis=null;prewarmBodies();
/* #73: while the entry card is up the camera drifts over the empty park (render/intro_cam.js) and every figure is hidden, so nobody stands behind the card. Poses run as usual underneath; the first shot after the card closes is the normal one. */
let introM=null;import(new URL('intro_cam.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{introM=M}).catch(err=>console.warn('intro camera off',err));
function introScene(now){if($('intro').hidden||!introM||renderer.xr&&renderer.xr.isPresenting)return;
  for(const f of [...Object.values(fielders),...runners,batter,ump,odNext,odDeck,...umpB,...coaches,...railFigs.flat()])f.g.visible=false;
  const c=introM.introShot(now/1000),[y,p]=look(c.x,c.y,c.z,c.tx,c.ty,c.tz);rig.position.set(c.x,c.y,c.z);camera.rotation.set(p,y,0);
  const fov=fitFov(c.fov);if(camera.fov!==fov){camera.fov=fov;camera.updateProjectionMatrix()}}
/* #209 item 2, part 3 (render/wear.js): on max the scuffs of the game so far are painted on the field canvas, a function of the pitch count before the current event
   (every repaint starts from a clean copy). Dabs are drawn like the #150 static ones; the texture is re-uploaded only when the pitch count changes. */
let wearM=null,wearBk=null,wearN=-1,wearEv=null,wearPre=null,wearDr=null;const WEAR_BASES=[[0,0],[19.4,-19.4],[0,-38.8],[-19.4,-19.4],[0,0]];import(new URL('wear.js',document.currentScript&&document.currentScript.src||location.href.replace(/[^/]*$/,'render/')).href).then(M=>{wearM=M}).catch(err=>console.warn('ground wear off',err));
function wearTick(i){
  if(!gfxMax||!wearM||!FIELD_CV||!game)return;
  if(wearEv!==game.ev){wearEv=game.ev;wearPre=wearM.pitchPrefix(game.ev);wearDr=wearM.slideDrags(game.ev,WEAR_BASES);wearN=-1}
  const dr=wearM.dragsBefore(wearDr,i),n=(wearPre[i]||0)+':'+dr.length;if(n===wearN)return;
  const {c,g,X,Y,S,t}=FIELD_CV;
  try{
    if(!wearBk){wearBk=document.createElement('canvas');wearBk.width=c.width;wearBk.height=c.height;wearBk.getContext('2d').drawImage(c,0,0)}
    else{g.globalCompositeOperation='copy';g.drawImage(wearBk,0,0);g.globalCompositeOperation='source-over'}/* always from the clean canvas: wear is a function of n only */
    for(const d of wearM.wearDabs(wearPre[i]||0)){const s=d.r*S;g.fillStyle=`rgba(${DIRT_RGB},${d.a})`;g.fillRect(X(d.x)-s/2,Y(d.z)-s/2,s,s*.75)}
    g.lineCap='round';for(const d of dr){g.strokeStyle=`rgba(${DIRT_RGB},${d.a})`;g.lineWidth=d.w*S;g.beginPath();g.moveTo(X(d.x0),Y(d.z0));g.lineTo(X(d.x1),Y(d.z1));g.stroke()}/* #209 part 8: slide drag marks */
    t.needsUpdate=true;wearN=n;
  }catch(e){wearN=n;console.warn('ground wear',e)}
}
window.CB_PLATE_UMP=()=>({visible:ump.g.visible,k:curEvent&&curEvent.k,card:!$('intro').hidden});/* #81: read-only hook for tests/smoke/play.mjs */
renderer.setAnimationLoop(()=>{
  const now=performance.now(),dtMs=now-lastNow,dt=Math.min(dtMs/1000,.1);lastNow=now;if(!warming)fpsTick(dtMs);if(!bootReady&&warmStarted)bootGaps.push(dtMs);
  if(LIVE_ENABLED&&mode==='live'&&liveStart()!==gameStart&&(Date.now()-gameStart)/1000>game.dur){loadGame(liveStart());cues.clear()}
  if(mode==='studio')studioTick(dt);
  else if(mode!=='live'&&!(mode==='opening'&&(paused||scrubbing))){const vv=findVote(Math.max(0,replayT));const prev=replayT;replayT=Math.min(game.dur+5,replayT+dt*(vv&&replayT<vv.t?1:speed));if(cpOn()){replayT=cpClock.step(prev,replayT);if(replayT-prev>dt*speed+.5)plFresh=true}}/* #144: a covered cut moves the figures: not a stride */
  hlTick();
  cloudU.t.value=curT();
  {const k=cpOn()&&mode==='opening'?cpClock.dip(replayT):0;if(k!==cutDipK){cutDipK=k;cutDip.style.opacity=String(k)}}
  const T=curT(),i=findIdx(Math.max(0,T)),e=game.ev[i],u=Math.max(0,T)-e.t;
  if(i!==lastIdx){if(lastIdx>=0&&i<lastIdx-1)cues.clear();lastIdx=i;if(e.big===2&&mode==='live'&&u<1)setTimeout(()=>bigText(e.walkoff?'再見！':'全壘打！'),Math.max(0,(e.showAt-u)*1000))}
  wearTick(i);curEvent=e;curU=u;dustTick(e,u);if(e.k==='VOTE'&&e.pending&&mode!=='replay'&&mode!=='studio'&&mode!=='opening')resolveVote(e);
  voteEv=mode==='studio'?null:findVote(Math.max(0,T));if(voteEv&&sayOn&&!cues.has(voteEv.id+'open')&&mode!=='replay'){cues.add(voteEv.id+'open');say(0,`${TEAMS[voteEv.team].short}教練團請球迷幫忙決定。${voteEv.q}`,true)}
  const s=poseScene(e,u,dt,i);staffGiveWay();/* #42: staff step off their posts for runners and fielders */
  if(plFresh||scrubbing){plFresh=false;for(const f of [...Object.values(fielders),...runners,ump,...umpB,...coaches,mgr]){f.px=f.g.position.x;f.pz=f.g.position.z}}/* a jump is not a stride */
  for(const k of FIELDER_KEYS)if(!fielders[k].noAnim)animate(fielders[k],dt);runners.forEach(r=>{if(!r.noAnim)animate(r,dt)});[odNext,odDeck,...umpB,...coaches,mgr].forEach(f=>{if(f.g.visible)animate(f,dt)});welF.forEach(f=>{if(f.g.visible&&!f.noAnim)animate(f,dt)});if(!ump.noAnim)animate(ump,dt);pmFieldApply();/* #274: after animate, so its key holds */
  hud(e,u,s);if(mode!=='studio'&&!scrubbing)commentary(T);renderVote(voteEv,T);plUpdate();
  {const iv=!$('intro').hidden;if(iv!==introVis){introVis=iv;$('bug').style.visibility=iv?'hidden':''}}/* Hide the scorebug on the intro screen */
  const st=statusText(),sk=st.txt+st.sub;if(sk!==stKey){stKey=sk;$('status').textContent=st.txt;$('status').className=st.cls;$('sched').textContent=st.sub;
    $('introStatus').textContent=!LIVE_ENABLED?'按進場，馬上開一場新的比賽':st.cls==='live'?`現在 ${inningLabel(s)}，${TEAMS[0].short} ${s.sc[0]}：${s.sc[1]} ${TEAMS[1].short}，直播中`:st.txt}
  const playing=e.k==='P'||e.k==='BRK';drumOn=false;excite=Math.max(0,excite-dt*.12);
  if(gfxMax&&window.PL&&PL.setEyeClock)PL.setEyeClock(curT());updateCrowd(now,excite,s.half,playing&&$('intro').hidden);updateAudio(playing&&$('intro').hidden);placeCamera(dt);introScene(now);if(CS_ON)updateContactShadows();if(envOn){updateBugs(now/1000);updateBlades()}
  warmBarTick(now);if(warming)return;/* the last drawn picture stays up while the materials compile */
  if(PP){try{PP.render()}catch(err){console.error(err);PP=null}}else renderer.render(scene,camera);entryFrame(performance.now());if(warmFramesLeft>0)warmFramesLeft--;
  if(readyN<READY_FRAMES){++readyN;BOOT_MARK(`f${readyN}`);if(readyN===READY_FRAMES)readyNow()}
});
warmUp();
addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
}
