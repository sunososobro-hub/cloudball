/* render/props/backstop.js: the backstop behind home plate (#215 round 1). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Replaces game.js's flat net (one plane, four plain posts, one straight top cable) with a real backstop:
 *   a padded wall at the foot of the net (vinyl pads in the home park's pad colour on a concrete curb, padded top roll, trim flashing,
 *   dirt kicked up on the bottom of the pads), dark knotted netting that hangs from a sagging top cable between the posts and bellies
 *   back between them, border ropes, tapered steel posts on base plates with caps and cable brackets, guy cables back to the stand rail.
 * World frame as in game.js: plate near z 0, field towards -z, the net plane at z NET_Z, the stand behind it from about z 24.
 * Size and place are read from the old net mesh ('old:backstop'), so this stands exactly where the old one stood.
 * Round 2 (from CF the net barely read and the pads were one dark band): the pads are separate panels with a 2 cm seam over a dark backer and
 *   each its own fade; one skin over the whole wall (dirt splash, pale ball marks thickest behind the plate, rub streaks) stands 3 cm off
 *   the pads (round 1's 3 mm splash would depth-fight at 130 m: ~1 cm depth steps there); vertical seam ropes across the net panels;
 *   the net and the skin keep the normal, diffuse and velocity of what lies behind them on max (the #267 MRT trap; `keepBehind`).
 *   Still gives it away (round 3): net has no slack folds or ties at the posts, no padded cap on the dugout-side returns, pads have no
 *   fasteners or made-up sponsor panel, the stand behind still shows its full crowd through the net (owner: crowd untouched). */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

/* round 2, #267 trap: the scene pass's side targets (normal, diffuse, velocity for AO/SSGI/TRAA) take whatever a transparent quad writes over its
   whole rectangle, gaps between the cords included, so the net put one flat normal and its dark albedo over the stand behind the plate.
   game.js blends those targets like the material (MRT_KEEP); writing alpha 0 there keeps what lies behind. Only while the pass has an MRT
   (a material MRT alone would drop the colour output), so the renderer is caught in setup, where three reads mrtNode. */
const KEEP=['normal','diffuse','velocity'];let KEEP_MRT=null;
function keepBehind(m){let R=null;const setup=m.setup;
  m.setup=function(b){R=b.renderer;return setup.call(this,b)};
  Object.defineProperty(m,'mrtNode',{get:()=>R&&R.getMRT&&R.getMRT()?(KEEP_MRT||(KEEP_MRT=THREE.TSL.mrt(Object.fromEntries(KEEP.map(n=>[n,THREE.TSL.vec4(0)]))))):null,set(){}});
  return m}

/* Fallback when no old net is found (the ?prop viewer): game.js NET_W, NET_H, NET_Z */
export const BS={W:40,H:9,Z:20,
  WALL_H:1.32,CURB:.12,PAD_M:1.2,PAD_T:.12,CORE_T:.3,ROLL_R:.07,/* padded wall: height, concrete curb, pad width/thickness, wall core */
  SPLASH_H:.38,SPLASH_A:.7,/* dirt kicked onto the pad bottoms; round 2: opacity of the whole skin (dirt .55 x .7 at the curb, as before x 1.4) */
  /* round 2 */PAD_GAP:.02,PAD_TONE:.07,/* seam between pads (dark backer shows), per-pad fade */SKIN_DZ:.03,/* splash/scuff skin stands this far off the pad face (3 mm z-fought from CF) */
  SCUFF_N:340,SCUFF_A:.5,/* pale ball marks, thickest behind the plate */SEAM_N:12,SEAM_R:.016,/* net panels: vertical seam ropes that read from CF */
  CELL:.05,CORD_PX:64,NET_DZ:.22,SAG:.16,BELLY:.18,/* net: mesh cell (m), texture px per cell, set back from the pad face, top-cable sag, belly */
  POST_R0:.1,POST_R1:.075,POST_UP:.3,PLATE:.36,ROPE_R:.009,CABLE_R:.014,/* posts and ropes */
  GUY_DZ:3.75,GUY_Y:1.1,/* guy-cable anchor: the stand's front rail top, behind the net */
  NET_OPACITY:.85};

/* one net cell: a diamond of twisted cord with a knot at each crossing. RGB = cord shading, A = cord coverage (mipmaps fade it to a veil) */
let NETTEX=null;
function netTex(){if(NETTEX)return NETTEX;const N=BS.CORD_PX,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
  g.lineCap='round';
  for(const [w,col] of [[5,'rgba(255,255,255,.55)'],[3,'rgba(255,255,255,1)']]){g.lineWidth=w;g.strokeStyle=col;g.beginPath();
    for(const o of [-N,0,N]){g.moveTo(o,0);g.lineTo(o+N,N);g.moveTo(o+N,0);g.lineTo(o,N)}g.stroke()}
  /* twist: short darker dashes along the cord */
  g.strokeStyle='rgba(0,0,0,.35)';g.lineWidth=1;g.setLineDash([2,3]);g.beginPath();g.moveTo(0,0);g.lineTo(N,N);g.moveTo(N,0);g.lineTo(0,N);g.stroke();g.setLineDash([]);
  g.fillStyle='#fff';for(const [x,y] of [[0,0],[N,0],[0,N],[N,N],[N/2,N/2]]){g.beginPath();g.arc(x,y,4.2,0,Math.PI*2);g.fill()}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return NETTEX=t}

/* the pad skin, one image over the whole wall (round 2; round 1 tiled a 12 m splash strip): dirt splash dense at the curb and thinning up
   (SPLASH_H), pale ball marks (round, a darker scuffed rim, thickest in the 6 m behind the plate and at 0.3-1 m up, where wild pitches and
   foul tips land), a few long rub streaks. Seeded, no Math.random. W, H in metres. */
function skinTex(W,H){const PX=96,cw=Math.min(4096,Math.round(W*PX)),ch=Math.round(H*PX),c=document.createElement('canvas');c.width=cw;c.height=ch;
  const g=c.getContext('2d'),sx=cw/W,sy=ch/H;let r=215;const rnd=()=>(r=(Math.imul(r,1103515245)+12345)&0x7fffffff)/0x7fffffff;
  const sh=BS.SPLASH_H*sy,gr=g.createLinearGradient(0,ch,0,ch-sh);gr.addColorStop(0,'rgba(92,66,42,.55)');gr.addColorStop(.35,'rgba(92,66,42,.18)');gr.addColorStop(1,'rgba(92,66,42,0)');
  g.fillStyle=gr;g.fillRect(0,ch-sh,cw,sh);
  for(let i=0;i<Math.round(W*420);i++){const x=rnd()*cw,y=ch-rnd()**2.2*sh,a=.08+.3*rnd()*((ch-y)/sh<.5?1:.5);g.fillStyle=`rgba(80,58,36,${a})`;g.fillRect(x,y,1+rnd()*3,1+rnd()*2)}
  for(let i=0;i<BS.SCUFF_N;i++){/* x: half the marks within 3 m of the plate line, the rest spread; y: 0.25-1.1 m */
    const xm=(rnd()<.5?(rnd()-.5)*6:(rnd()-.5)*W*.9)+W/2,ym=.25+rnd()*.85*(.6+.4*rnd()),rr=(.035+.025*rnd())*sx,a=BS.SCUFF_A*(.35+.65*rnd());
    const x=xm*sx,y=ch-ym*sy,rg=g.createRadialGradient(x,y,0,x,y,rr);
    rg.addColorStop(0,`rgba(214,206,190,${a})`);rg.addColorStop(.7,`rgba(200,192,176,${a*.8})`);rg.addColorStop(.85,`rgba(60,50,40,${a*.5})`);rg.addColorStop(1,'rgba(60,50,40,0)');
    g.fillStyle=rg;g.beginPath();g.ellipse(x,y,rr*(1+.4*rnd()),rr,rnd()*Math.PI,0,Math.PI*2);g.fill()}
  g.lineCap='round';for(let i=0;i<26;i++){/* rub streaks: equipment carts and the catcher's gear dragged along the wall */
    const x=rnd()*cw,y=ch-(.15+.5*rnd())*sy,l=(.4+1.6*rnd())*sx;g.strokeStyle=`rgba(190,182,166,${.12+.15*rnd()})`;g.lineWidth=1+2*rnd();
    g.beginPath();g.moveTo(x,y);g.lineTo(x+l,y+(rnd()-.5)*6);g.stroke()}
  const t=new THREE.CanvasTexture(c);t.anisotropy=8;t.colorSpace=THREE.SRGBColorSpace;return t}

/* the old meshes this replaces: every scene child named 'old:backstop' (net, posts, top cable) */
export const oldBackstop=scene=>scene?scene.children.filter(o=>o.name==='old:backstop'):[];

/* o: {old: old meshes, colors: {pad (css), trim (int)}} -> THREE.Group in world coordinates */
export function buildBackstop(o={}){
  const net0=(o.old||[]).find(m=>m.geometry&&m.geometry.type==='PlaneGeometry'),P=net0?net0.geometry.parameters:null;
  const W=P?P.width:BS.W,H=P?P.height:BS.H,Z=net0?net0.position.z:BS.Z;
  const {WALL_H,CURB,PAD_M,PAD_T,PAD_GAP,PAD_TONE,CORE_T,ROLL_R,SPLASH_H,SPLASH_A,CELL,NET_DZ,SAG,BELLY,POST_R0,POST_R1,POST_UP,PLATE,ROPE_R,CABLE_R,GUY_DZ,GUY_Y,NET_OPACITY}=BS;
  const g=new THREE.Group();g.name='prop:backstop';
  const add=(geo,m,x,y,z,sh=true)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.castShadow=sh;ms.receiveShadow=true;g.add(ms);return ms};
  const conc=mat('concrete'),steel=mat('paintedSteel',{color:0x22262d}),galv=mat('galvSteel'),T=m=>m.userData.tileM;
  const pad=mat('vinylPad',{relief:'pillow'}).clone(),roll=mat('vinylPad',{relief:'plain'}).clone(),trim=mat('paintedSteel',{relief:'plain',rough:.4}).clone();

  /* ---- padded wall: concrete curb and core, one vinyl pad per PAD_M, top roll, trim flashing, dirt splash ---- */
  const nPad=Math.max(1,Math.round(W/PAD_M)),padH=WALL_H-CURB,fz=Z;/* fz = pad face, where the old net plane stood */
  add(box(W,CURB,PAD_T+CORE_T+.08,T(conc)),conc,0,CURB/2,fz+(PAD_T+CORE_T+.08)/2-.04);
  add(box(W,WALL_H,CORE_T,T(conc)),conc,0,WALL_H/2,fz+PAD_T+CORE_T/2);
  /* round 2: one pad per PAD_M with a PAD_GAP seam (a dark backer shows through, so the wall reads as panels from CF, not one band),
     each pad its own fade (instance colour multiplies the park's pad colour) */
  {const pw=W/nPad,pg=box(pw-PAD_GAP,padH,PAD_T,pw-PAD_GAP),im=new THREE.InstancedMesh(pg,pad,nPad),d=new THREE.Object3D(),c=new THREE.Color();let r=1215;
   const rnd=()=>(r=(Math.imul(r,1103515245)+12345)&0x7fffffff)/0x7fffffff;
   for(let i=0;i<nPad;i++){d.position.set(-W/2+pw*(i+.5),CURB+padH/2,fz+PAD_T/2);d.updateMatrix();im.setMatrixAt(i,d.matrix);
     const k=1-PAD_TONE*rnd();im.setColorAt(i,c.setRGB(k,k*(1+.01*rnd()),k))}
   im.castShadow=im.receiveShadow=true;g.add(im);
   add(box(W,padH,.01,1),mat('rubber',{relief:'plain',color:0x0b0c0d}),0,CURB+padH/2,fz+PAD_T-.005,false)}
  const rl=add(cyl(ROLL_R,ROLL_R,W,14,T(roll)),roll,0,WALL_H+ROLL_R*.6,fz+PAD_T*.6);rl.rotation.z=Math.PI/2;
  add(box(W+.02,.035,CORE_T+.06,1),trim,0,WALL_H+.018,fz+PAD_T+CORE_T/2);
  {const sk=new THREE.MeshStandardNodeMaterial({map:skinTex(W,padH),transparent:true,opacity:SPLASH_A,depthWrite:false,roughness:1,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
   const sp=new THREE.Mesh(new THREE.PlaneGeometry(W,padH),keepBehind(sk));sp.name='prop:backstopSkin';
   sp.position.set(0,CURB+padH/2,fz-BS.SKIN_DZ);sp.rotation.y=Math.PI;/* face the field (-z) */sp.renderOrder=1;g.add(sp)}

  /* ---- posts: same x as the old ones, tapered, on base plates behind the wall, with caps and a forward bracket for the cable ---- */
  const PX=[-W/2,-W/6,W/6,W/2],pz=fz+PAD_T+CORE_T+POST_R0+.02,top=H,netZ=fz+NET_DZ;
  for(const x of PX){add(cyl(POST_R1,POST_R0,top+POST_UP-CURB,12,T(steel)),steel,x,CURB+(top+POST_UP-CURB)/2,pz);
    add(box(PLATE,.025,PLATE,1),steel,x,CURB+.0125,pz);
    add(new THREE.SphereGeometry(POST_R1*1.15,12,6,0,Math.PI*2,0,Math.PI/2),steel,x,top+POST_UP,pz);
    add(box(.05,.08,pz-netZ+.04,1),steel,x,top,(pz+netZ)/2)}

  /* ---- top cable: a sagging catenary between post brackets; guy cables back to the stand rail ---- */
  const sagAt=x=>{for(let i=0;i<PX.length-1;i++)if(x<=PX[i+1]+1e-6){const s=(x-PX[i])/(PX[i+1]-PX[i]);return {s,sag:SAG*4*s*(1-s)}}return {s:0,sag:0}};
  for(let i=0;i<PX.length-1;i++){const pts=[];for(let k=0;k<=16;k++){const x=PX[i]+(PX[i+1]-PX[i])*k/16;pts.push(new THREE.Vector3(x,top-sagAt(x).sag,netZ))}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),24,CABLE_R,6,false),galv,0,0,0)}
  for(const x of PX){const a=new THREE.Vector3(x,top+POST_UP*.6,pz),b=new THREE.Vector3(x*1.04,GUY_Y,Z+GUY_DZ);
    add(new THREE.TubeGeometry(new THREE.LineCurve3(a,b),4,CABLE_R*.8,5,false),galv,0,0,0,false);
    add(box(.12,.06,.12,1),steel,b.x,b.y+.03,b.z)}

  /* ---- netting: from the pad roll up to the cable, belly backwards between posts, knotted dark cord; UVs in cells ---- */
  const NH=top-WALL_H,nx=Math.round(W*2),ny=12,geo=new THREE.PlaneGeometry(W,NH,nx,ny),pa=geo.attributes.position,uv=geo.attributes.uv;
  for(let i=0;i<pa.count;i++){const x=pa.getX(i),t=pa.getY(i)/NH+.5,{s,sag}=sagAt(x),y=WALL_H+ROLL_R+t*(NH-ROLL_R-sag);
    pa.setXYZ(i,x,y,BELLY*Math.sin(Math.PI*s)*Math.sin(Math.PI*t));uv.setXY(i,(x+W/2)/CELL,y/CELL)}
  geo.computeVertexNormals();
  const nm=new THREE.MeshStandardNodeMaterial({color:0x1d2024,roughness:.55,metalness:.1,map:netTex(),alphaMap:netTex(),transparent:true,opacity:NET_OPACITY,depthWrite:false,side:THREE.DoubleSide});
  keepBehind(nm);const netM=add(geo,nm,0,0,netZ,false);netM.renderOrder=2;netM.name='prop:backstopNet';
  /* border ropes: along the bottom tie line and up each post */
  const rope=mat('rubber',{relief:'plain',color:0x15171a});
  {const b=add(cyl(ROPE_R,ROPE_R,W,6,1),rope,0,WALL_H+ROLL_R,netZ,false);b.rotation.z=Math.PI/2}
  for(const x of PX)add(cyl(ROPE_R,ROPE_R,NH-ROLL_R,6,1),rope,x,WALL_H+ROLL_R+(NH-ROLL_R)/2,netZ,false);
  /* round 2: the net is sewn from panels; their seam ropes follow the sag and the belly, so from CF the net shows as a veil with lines */
  for(let k=1;k<BS.SEAM_N;k++){const x=-W/2+W*k/BS.SEAM_N;if(PX.some(p=>Math.abs(p-x)<.5))continue;const {s,sag}=sagAt(x),pts=[];
    for(let j=0;j<=8;j++){const t=j/8;pts.push(new THREE.Vector3(x,WALL_H+ROLL_R+t*(NH-ROLL_R-sag),netZ+BELLY*Math.sin(Math.PI*s)*Math.sin(Math.PI*t)))}
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts),12,BS.SEAM_R,5,false),rope,0,0,0,false)}

  /* colours from the home park (pad = vinyl pads and roll, trim = flashing); called again when the park changes */
  g.userData.recolor=C=>{if(!C)return;pad.color.set(C.pad);roll.color.set(C.pad);trim.color.set(C.trim)};
  g.userData.recolor(o.colors);return g}

/* slot descriptor (#237): replaces game.js's old net, posts and top cable, all named old:backstop */
export const PROPS=[{name:'backstop',build:c=>buildBackstop({old:oldBackstop(c.scene),colors:c.park()}),old:c=>oldBackstop(c.scene)}];
