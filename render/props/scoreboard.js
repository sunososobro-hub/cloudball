/* render/props/scoreboard.js: the outfield scoreboard (#215 polish lane, rounds 1-2). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * game.js keeps drawing the score into its own face plane (canvas texture, untouched and always on). This prop replaces only the old
 * housing and leg (`old:scoreboard`): a deep steel cabinet with a bezel in the home trim colour, a sun hood and a cornice, an LED pixel
 * screen laid over the face, a grated catwalk with a rail under it, two lattice steel columns on concrete footings, cross beam and ladder.
 * Placement comes from the old meshes themselves (the box behind the face and the leg under it), so it stands exactly where they stood.
 * Round 2: weathering as vertex colour on finely cut boxes and cylinders (no decal planes, nothing coplanar: #256): rust runs from the
 * cornice seams and hood brackets down the frame, a grime band and drip runs below the bezel, sun-chalked paint on top, rust and dirt splash at
 * the column feet, stained footings, runs down the cross beam; a cable tray with cables under the catwalk that drops down the right column to a
 * junction box; bulkhead lamps on the catwalk rail; the back is no longer one flat panel: stiffener channels, louvred vents, three
 * condenser units on brackets with fan grilles.
 * Still gives it away after round 2: weathering is vertex-coarse (15 cm) so runs have soft ends close up, the face itself (game.js canvas)
 * is clean, lamps are off by night (no light), no aircraft-warning lamp or lightning rod, not checked on a real GPU.
 * Local frame of the cabinet: origin at the face centre, +z toward home plate (the face's own facing), x along the face, y up the face. */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const SB={W:26,H:10,BACK_Z:.35,/* face size and how far game.js set the old box behind it */
  CAB_D:1.8,CAB_M:.8,/* cabinet depth and margin around the face */BEZ_W:.42,BEZ_D:.26,HOOD_D:1.3,HOOD_TILT:.22,
  COL_X:8,COL_W:1.3,COL_BRACE:1.6,PIPE_R:.1,FOOT:2.4,FOOT_H:.6,
  WALK_Y:.55,WALK_D:1.1,RAIL_H:1.05,POST_GAP:2.6,
  LED_PITCH:.1,LED_PX:16,LED_EDGE:.65};/* LED pitch in metres, size of the one-LED tile, darkness of the gap between LEDs */

/* round 2: weathering (vertex colour) and the service parts */
export const WX={SEG:.15,/* vertex spacing of weathered boxes (m) */RUST:0x7a4426,FADE:0x7e8596,DIRT:0x3a3128,
  RUN_W:.08,RUN_K:.7,/* rust run width and strength */CORN_RUNS:.35,/* runs per metre below the cornice */RUN_L:[.6,2.4],
  BEZ_RUNS:.3,/* drip runs per metre below the bezel */GRIME_H:.5,GRIME_K:.45,FADE_H:.6,FADE_K:.3,
  FOOT_RUST_H:1.1,/* rust and splash up the column pipes from the footing (m) */FOOT_RUST_K:.65,SPLASH_K:.4};
export const SV={TRAY_W:.3,TRAY_DY:.42,/* cable tray width and drop below the catwalk deck */CABLES:3,LAMP_EVERY:2,/* a lamp on every 2nd rail post */
  RIB_GAP:2.3,RIB_W:.14,RIB_D:.1,VENTS:4,VENT:[1.6,.9],SLATS:6,AC:3,AC_S:[1.2,.9,.55],FAN_R:.36,DOOR:[.9,2]};

/* seeded 0..1 generator (mulberry32): weathering is the same on every load */
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)},LC=h=>new THREE.Color(h);
/* box cut every WX.SEG m, UVs in tiles (u, v per face like pbr.js box()), colour attribute from paint(x, y, z) in the box's own frame */
function wbox(w,h,d,tile,paint){const n=a=>Math.max(1,Math.round(a/WX.SEG)),g=new THREE.BoxGeometry(w,h,d,n(w),n(h),n(d)),
  P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv,C=new Float32Array(P.count*3);
  for(let i=0;i<P.count;i++){const x=P.getX(i),y=P.getY(i),z=P.getZ(i),ax=Math.abs(N.getX(i)),ay=Math.abs(N.getY(i));
    if(ax>.5)U.setXY(i,z/tile,y/tile);else if(ay>.5)U.setXY(i,x/tile,z/tile);else U.setXY(i,x/tile,y/tile);
    const c=paint(x,y,z);C[i*3]=c[0];C[i*3+1]=c[1];C[i*3+2]=c[2]}
  U.needsUpdate=true;g.setAttribute('color',new THREE.BufferAttribute(C,3));return g}
/* cylinder along y cut every WX.SEG m of height, painted by paint(y) */
function wcyl(r,h,tile,paint){const g=new THREE.CylinderGeometry(r,r,h,10,Math.max(1,Math.round(h/WX.SEG)),true),P=g.attributes.position,U=g.attributes.uv,C=new Float32Array(P.count*3),c0=2*Math.PI*r;
  for(let i=0;i<P.count;i++){U.setXY(i,U.getX(i)*c0/tile,U.getY(i)*h/tile);const c=paint(P.getY(i)+h/2);C[i*3]=c[0];C[i*3+1]=c[1];C[i*3+2]=c[2]}
  U.needsUpdate=true;g.setAttribute('color',new THREE.BufferAttribute(C,3));return g}
/* paint mixer: base, sun fade, grime (darker), dirt, rust; linear working space */
function mix(base,fade,grime,dirt,rust){const c=base.clone().lerp(LC(WX.FADE),fade).multiplyScalar(1-grime).lerp(LC(WX.DIRT),dirt).lerp(LC(WX.RUST),rust);return[c.r,c.g,c.b]}
/* a run below a source at (sx, sy): narrow, wobbling as it falls, fading over length L */
const run=(x,y,sx,sy,w,L,ph)=>{if(y>sy)return 0;const f=(sy-y)/L;if(f>1)return 0;const dx=(x-sx-.03*Math.sin((sy-y)*6+ph))/(w*(1+.8*f));return Math.exp(-dx*dx)*(1-f)**1.4};
/* white copy of a material with vertex colours on (the paint lives in the colour attribute) */
function vcMat(m){const c=m.clone();c.color.set(0xffffff);c.vertexColors=true;c.userData.tileM=m.userData.tileM;return c}
const nz=(x,y)=>.6+.4*Math.sin(x*3.1+Math.sin(y*1.7))*Math.sin(y*2.3+x*.9);/* cheap blotch so grime and runs are not even */

/* one LED: alpha 0 on the diode, rising to LED_EDGE in the gap. Mip levels average it out, so from home plate it is only a slight dimming */
function ledTex(px,edge){const c=document.createElement('canvas');c.width=c.height=px;const g=c.getContext('2d'),im=g.createImageData(px,px),d=im.data;
  for(let y=0;y<px;y++)for(let x=0;x<px;x++){const r=Math.hypot((x+.5)/px-.5,(y+.5)/px-.5)*2,a=Math.min(1,Math.max(0,(r-.55)/.35))*edge;const i=(y*px+x)*4;d[i]=d[i+1]=d[i+2]=a*255;d[i+3]=255}/* alphaMap reads the green channel */
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}

/* o: {old: [old meshes named old:scoreboard: the box behind the face first, then the leg], colors: {pad, trim}} -> THREE.Group */
export function buildScoreboard(o){const S=SB,[back]=o.old;if(!back)throw new Error('old:scoreboard not found');
  const g=new THREE.Group();g.name='prop:scoreboard';
  const cab=new THREE.Group();cab.quaternion.copy(back.quaternion);cab.position.copy(back.position);cab.translateZ(S.BACK_Z);g.add(cab);
  const add=(par,geo,m,x,y,z,rx=0,ry=0,rz=0)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.rotation.set(rx,ry,rz);ms.castShadow=ms.receiveShadow=true;par.add(ms);return ms};
  const steel=mat('paintedSteel',{color:0x343c4e}),dark=mat('paintedSteel',{color:0x1c2028,rough:.7}),galv=mat('galvSteel'),conc=mat('concrete'),
    grate=mat('galvSteel',{relief:'lattice',rough:.55}),deck=mat('paintedSteel',{relief:'ribbed',color:0x2e3546}),T=m=>m.userData.tileM;
  const trim=mat('paintedSteel',{relief:'plain',rough:.38}).clone();
  /* cabinet: housing behind the face, ribbed service panel on the back, cornice cap */
  const CW=S.W+2*S.CAB_M,CH=S.H+2*S.CAB_M,cz=-.05-S.CAB_D/2;
  /* round 2: the housing is weathered in its vertex colours. Runs fall from the cornice seam on every side, drip runs from the bezel's
     bottom edge on the front, sun-chalked paint at the top, a grime band at the bottom; blotchy (nz) so nothing is even */
  const r=rng(Math.round(back.position.x*31+back.position.z*17)+215),RU=[],D=S.CAB_D,bzB=-S.H/2-S.BEZ_W;
  const runs=(face,a,b,per,y0,L)=>{for(let i=0,k=Math.round((b-a)*per);i<k;i++)RU.push({face,h:a+(b-a)*r(),y0,L:L[0]+(L[1]-L[0])*r(),k:.5+.5*r(),ph:r()*6})};
  runs('f',-CW/2,CW/2,WX.CORN_RUNS,CH/2,WX.RUN_L);runs('b',-CW/2,CW/2,WX.CORN_RUNS,CH/2,WX.RUN_L);runs('l',-D/2,D/2,1,CH/2,[3,8]);runs('r',-D/2,D/2,1,CH/2,[3,8]);
  runs('f',-S.W/2,S.W/2,WX.BEZ_RUNS,bzB,[.25,.5]);
  const sBase=LC(0x343c4e),cabPaint=(x,y,z)=>{const face=Math.abs(z-D/2)<1e-3?'f':Math.abs(z+D/2)<1e-3?'b':x<-CW/2+1e-3?'l':x>CW/2-1e-3?'r':'t',h=face==='f'||face==='b'?x:z,n=nz(x+z,y);
    let ru=0;for(const e of RU)if(e.face===face&&Math.abs(h-e.h)<.5)ru+=e.k*run(h,y,e.h,e.y0,WX.RUN_W,e.L,e.ph);
    return mix(sBase,WX.FADE_K*sm(CH/2-WX.FADE_H,CH/2,y),WX.GRIME_K*sm(-CH/2+WX.GRIME_H,-CH/2,y)*n,face==='t'?.35*n:0,Math.min(.85,WX.RUN_K*ru*n))};
  const steelV=vcMat(steel),beamV=vcMat(steel),footV=vcMat(conc);
  add(cab,wbox(CW,CH,D,T(steel),cabPaint),steelV,0,0,cz);
  add(cab,box(CW-1,CH-1,.05,T(deck)),deck,0,0,cz-S.CAB_D/2-.025);
  add(cab,box(CW+.5,.35,S.CAB_D+.6,T(dark)),dark,0,CH/2+.17,cz+.15);
  /* bezel in the trim colour: four bars framing the face, standing proud of it */
  const bz=S.BEZ_D/2-.04,bw=S.BEZ_W;
  /* round 2: the bezel keeps its trim colour (recolor) and carries grime and rust as a multiplier in its vertex colours: darker on the
     bottom bar where water stands, runs down the side bars from the top corners and the hood brackets */
  const trimV=trim.clone();trimV.vertexColors=true;trimV.userData.tileM=trim.userData.tileM;
  const mul=(g,ru)=>[(1-g)*(1-.45*ru),(1-g)*(1-.7*ru),(1-g)*(1-.8*ru)],SR=[];for(let i=0;i<8;i++)SR.push({h:(r()-.5)*bw*.8,L:3+6*r(),k:.6+.4*r(),ph:r()*6});
  const bTop=(x,y,z)=>mul(.12*nz(x,y),0),bBot=(x,y,z)=>mul((.3+.3*sm(bw/2,-bw/2,y))*nz(x,y*4),.35*sm(.4,1,nz(x*2.3,1))),
    bSide=k=>(x,y,z)=>{let ru=0;for(const e of SR.slice(k*4,k*4+4))ru+=e.k*run(x,y,e.h,S.H/2,WX.RUN_W*.6,e.L,e.ph);return mul(.1*nz(x,y),Math.min(.8,ru*nz(y,x)))};
  add(cab,wbox(S.W+2*bw,bw,S.BEZ_D,T(trim),bTop),trimV,0,S.H/2+bw/2,bz);add(cab,wbox(S.W+2*bw,bw,S.BEZ_D,T(trim),bBot),trimV,0,-S.H/2-bw/2,bz);
  for(const s of [-1,1])add(cab,wbox(bw,S.H,S.BEZ_D,T(trim),bSide(s>0?1:0)),trimV,s*(S.W/2+bw/2),0,bz);
  /* sun hood over the face: a sloped steel lip with its brackets */
  add(cab,box(CW,.1,S.HOOD_D,T(steel)),steel,0,CH/2-.25,S.HOOD_D/2-.1,S.HOOD_TILT);
  for(let i=0;i<=6;i++)add(cab,box(.08,.5,S.HOOD_D*.9,T(dark)),dark,-CW/2+.2+(CW-.4)*i/6,CH/2-.45,S.HOOD_D*.45-.1,S.HOOD_TILT);
  /* LED screen over the face: a pixel grid in front of the canvas game.js draws (that plane stays as it is) */
  const led=ledTex(S.LED_PX,S.LED_EDGE);led.repeat.set(S.W/S.LED_PITCH,S.H/S.LED_PITCH);
  const ledM=new THREE.MeshBasicMaterial({color:0x000000,alphaMap:led,transparent:true,depthWrite:false,toneMapped:false});
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(S.W,S.H),ledM);scr.position.z=.012;cab.add(scr);
  /* catwalk under the face: grated deck on brackets, posts and two rails */
  const wy=-CH/2-S.WALK_Y,wz=S.WALK_D/2;
  add(cab,box(CW,.06,S.WALK_D,T(grate)),grate,0,wy,wz);
  for(let i=0;i<=8;i++){const x=-CW/2+.3+(CW-.6)*i/8;add(cab,box(.08,.08,S.WALK_D+.2,T(dark)),dark,x,wy-.07,wz-.1);
    add(cab,box(.06,S.WALK_Y+.1,.06,T(dark)),dark,x,wy+S.WALK_Y/2,-.03)}
  const n=Math.round(CW/S.POST_GAP);for(let i=0;i<=n;i++)add(cab,cyl(.025,.025,S.RAIL_H,8,T(galv)),galv,-CW/2+CW*i/n,wy+S.RAIL_H/2,S.WALK_D-.04);
  for(const h of [S.RAIL_H,S.RAIL_H*.5])add(cab,cyl(.03,.03,CW,10,T(galv)),galv,0,wy+h,S.WALK_D-.04,0,0,Math.PI/2);
  /* columns: world-vertical lattice towers on footings under the cabinet's centre line, a cross beam, a ladder on one column */
  g.updateMatrixWorld(true);const fwd=new THREE.Vector3(0,0,1).applyQuaternion(cab.quaternion);fwd.y=0;fwd.normalize();
  const base=new THREE.Vector3(0,-CH/2,cz).applyMatrix4(cab.matrixWorld),top=base.y-.1;
  const legs=new THREE.Group();legs.position.set(base.x,0,base.z);legs.rotation.y=Math.atan2(fwd.x,fwd.z);g.add(legs);
  const W=S.COL_W,h0=S.FOOT_H,ch=top-h0;
  /* round 2: rust and dirt splash climb the pipes from the footing; the footing is stained under each pipe and splashed at its foot */
  const pipeG=wcyl(S.PIPE_R,ch,T(steel),y=>{const n=nz(y*3,y);return mix(sBase,0,.15*n,WX.SPLASH_K*(1-sm(0,.5,y)),WX.FOOT_RUST_K*(1-sm(0,WX.FOOT_RUST_H,y))*n)});
  const cBase=LC(0x8c8a84),footG=wbox(S.FOOT,S.FOOT_H,S.FOOT,T(conc),(x,y,z)=>{let st=0;for(const a of [-1,1])for(const b of [-1,1])st+=Math.exp(-((x-a*W/2)**2+(z-b*W/2)**2)/.09);
    const n=nz(x*2,z*2),top=y>S.FOOT_H/2-1e-3;return mix(cBase,0,.1*n,.5*sm(0,-S.FOOT_H/2,y)*n,top?Math.min(.7,.7*st):Math.min(.5,.5*st*sm(-S.FOOT_H/2,S.FOOT_H/2,y)))});
  for(const s of [-1,1]){const x0=s*S.COL_X;add(legs,footG,footV,x0,S.FOOT_H/2,0);
    for(const a of [-1,1])for(const b of [-1,1])add(legs,pipeG,steelV,x0+a*W/2,h0+ch/2,b*W/2);
    const nb=Math.floor(ch/S.COL_BRACE),dg=Math.hypot(W,S.COL_BRACE),ang=Math.atan2(W,S.COL_BRACE);
    for(let k=0;k<=nb;k++){const y=h0+Math.min(ch-.05,k*S.COL_BRACE);
      for(const b of [-1,1]){add(legs,box(W,.07,.07,T(steel)),steel,x0,y,b*W/2);add(legs,box(.07,.07,W,T(steel)),steel,x0+b*W/2,y,0)}
      if(k<nb)for(const b of [-1,1]){const yc=y+S.COL_BRACE/2;add(legs,box(.05,dg,.05,T(steel)),steel,x0,yc,b*W/2,0,0,(k%2?1:-1)*ang);
        add(legs,box(.05,dg,.05,T(steel)),steel,x0+b*W/2,yc,0,(k%2?-1:1)*ang,0,0)}}}
  const BW=2*S.COL_X+W+1,BR=[];for(let i=0,k=Math.round(BW*.5);i<k;i++)BR.push({h:(r()-.5)*BW,k:.5+.5*r(),ph:r()*6});/* round 2: runs down the cross beam */
  add(legs,wbox(BW,.7,.9,T(steel),(x,y,z)=>{let ru=0;for(const e of BR)if(Math.abs(x-e.h)<.5)ru+=e.k*run(x,y,e.h,.35,WX.RUN_W,.9,e.ph);const n=nz(x,y*3);
    return mix(sBase,y>.35-1e-3?.2:0,.15*n,y>.35-1e-3?.35*n:0,Math.min(.8,WX.RUN_K*ru*n))}),beamV,0,top-.35,0);
  const lx=-S.COL_X-W/2-.45,lz=W/2+.1;for(const d of [-.22,.22])add(legs,cyl(.025,.025,top,8,T(galv)),galv,lx+d,top/2,lz);
  for(let y=.4;y<top;y+=.3)add(legs,cyl(.015,.015,.44,6,T(galv)),galv,lx,y,lz,0,0,Math.PI/2);
  service(cab,legs,add,{CW,CH,cz,wy,wz,top,steel,dark,galv,grate,T,S,n});
  g.userData.recolor=P=>{if(P){trim.color.set(P.trim);trimV.color.set(P.trim)}};g.userData.recolor(o.colors);
  return g}

/* round 2: cable tray, catwalk lamps, the back's stiffeners, vents and condensers. Cabinet frame = cab, column frame = legs */
function service(cab,legs,add,{CW,CH,cz,wy,wz,top,steel,dark,galv,grate,T,S,n}){const V=SV,rub=mat('rubber',{relief:'plain'}),lens=mat('gloss',{color:0xe6e0c6,rough:.25});
  /* tray hung under the catwalk on rods, three cables lying in it */
  const ty=wy-V.TRAY_DY,tz=wz-.12,tw=V.TRAY_W;
  add(cab,box(CW-.4,.015,tw,T(grate)),grate,0,ty,tz);for(const s of [-1,1])add(cab,box(CW-.4,.08,.02,T(galv)),galv,0,ty+.03,tz+s*tw/2);
  for(let i=0;i<V.CABLES;i++){const rr=.02+.008*i;add(cab,cyl(rr,rr,CW-.5,8,T(rub)),rub,0,ty+.01+rr,tz+(i-1)*.08,0,0,Math.PI/2)}
  for(let i=0;i<=8;i++){const x=-CW/2+.3+(CW-.6)*i/8;for(const s of [-1,1])add(cab,cyl(.01,.01,V.TRAY_DY,6,T(galv)),galv,x,wy-V.TRAY_DY/2,tz+s*tw/2)}
  /* bulkhead lamps on every 2nd rail post, aimed up at the frame */
  for(let i=0;i<=n;i+=V.LAMP_EVERY){const x=-CW/2+CW*i/n,y=wy+S.RAIL_H+.1,z=S.WALK_D-.04;
    add(cab,box(.22,.16,.14,T(dark)),dark,x,y,z,-.5);add(cab,cyl(.065,.065,.02,12,T(lens)),lens,x,y+.07,z-.04,-.5)}
  /* the tray drops down the right column to a junction box: tray end found in the column frame */
  cab.updateMatrixWorld(true);legs.updateMatrixWorld(true);const e=legs.worldToLocal(cab.localToWorld(new THREE.Vector3(0,ty,tz))),dx=S.COL_X+S.COL_W/2+.4,dz=e.z,L=e.y-1.5;
  add(legs,box(.3,.015,.3,T(grate)),grate,dx,e.y,dz);/* tee where the drop leaves the tray */
  add(legs,box(tw,L,.015,T(grate)),grate,dx,1.5+L/2,dz);for(const s of [-1,1])add(legs,box(.02,L,.08,T(galv)),galv,dx+s*tw/2,1.5+L/2,dz+.03);
  for(let i=0;i<V.CABLES;i++){const rr=.02+.008*i;add(legs,cyl(rr,rr,L,8,T(rub)),rub,dx+(i-1)*.08,1.5+L/2,dz+.01+rr)}
  const px=S.COL_X+S.COL_W/2;/* stand-off arms: out from the column's front pipe, then across to the drop */
  for(let y=2.5;y<e.y-.5;y+=2.5){add(legs,box(.06,.06,Math.max(.06,dz-S.COL_W/2),T(dark)),dark,px,y,(dz+S.COL_W/2)/2);add(legs,box(dx-px,.06,.06,T(dark)),dark,(px+dx)/2,y,dz-.03)}
  const jb=mat('paintedSteel',{color:0x5c6470,relief:'plain'});add(legs,box(.6,.8,.3,T(jb)),jb,dx,1.1,dz);add(legs,cyl(.04,.04,.7,8,T(galv)),galv,dx,.35,dz);
  /* back: stiffener channels, louvred vents in two bays, three condenser units on brackets in the others */
  const zb=cz-S.CAB_D/2-.05,nR=Math.floor((CW-1)/V.RIB_GAP),x0=-nR*V.RIB_GAP/2;
  for(let k=0;k<=nR;k++)add(cab,box(V.RIB_W,CH-1.2,V.RIB_D,T(steel)),steel,x0+k*V.RIB_GAP,0,zb-V.RIB_D/2+.01);
  const bay=k=>x0+(k+.5)*V.RIB_GAP,[vw,vh]=V.VENT;
  for(const k of [1,3,nR-4,nR-2].slice(0,V.VENTS)){const x=bay(k),y=2.6;add(cab,box(vw,vh,.06,T(dark)),dark,x,y,zb-.03);
    for(let j=0;j<V.SLATS;j++)add(cab,box(vw-.1,.035,.14,T(steel)),steel,x,y-vh/2+.1+(vh-.2)*j/(V.SLATS-1),zb-.1,-.6)}
  const [aw,ah,ad]=V.AC_S;for(const k of [2,Math.floor(nR/2),nR-3].slice(0,V.AC)){const x=bay(k),y=-2.6,z=zb-.15-ad/2;
    add(cab,box(aw,ah,ad,T(galv)),galv,x,y,z);add(cab,cyl(V.FAN_R,V.FAN_R,.03,20,T(dark)),dark,x,y,z-ad/2-.015,Math.PI/2);
    add(cab,box(.06,.06,ad+.2,T(dark)),dark,x,y-ah/2-.03,zb-.1-ad/2);for(const s of [-1,1])add(cab,box(.06,ah*.8,.06,T(dark)),dark,x+s*(aw/2-.1),y-ah/2-.03-ah*.4+.03,zb-.08)}}

/* slot descriptor (#237): new housing, bezel, LED grid, catwalk and columns; the score face of game.js stays (it is not old:scoreboard) */
export const PROPS=[{name:'scoreboard',build:c=>buildScoreboard({old:c.old('scoreboard'),colors:c.park()}),old:c=>c.old('scoreboard')}];
