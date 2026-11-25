/* render/props/roof.js: roofs and fascia of the three infield stands (#215 polish lane, round 1). Polish rounds edit only this file
 * (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Old: ctx.old('roof') = roof slabs (old:roof, the ribs are its children) and fascia lamp bars (old:roof:fascia).
 * Round 1: per stand, a corrugated steel deck on tapered I-girders (one per old rib, 6 m apart) and purlins, a deep fascia with end returns,
 * a row of lamp housings (the old cream glow, so the roof line still reads at night), a trim-colour stripe (follows the park), downlights
 * under the deck, a back gutter with downpipes, and back columns with knee braces standing on the back wall, closed by ribbed cladding
 * (the old slab floated 4-5 m over the back wall with nothing under it).
 * Placement comes from the stand group itself (`userData.stand` = {px, pz, rotY, len, rows, side, roof, base}): the new roof plane is the
 * old slab's plane (same size, same tilt), so the silhouette from the broadcast camera does not move.
 * Round 2: weathering as vertex colour on finely cut fascia and cladding boxes (no decal planes, so nothing lies coplanar: #256): rust runs
 * from the lamp brackets and the panel seams down to the drip edge, pale bird streaks under a few lamps, a dark grime band along the drip
 * edge, a chalky sun-faded top; on the back cladding rust runs from the gutter overflows and seams, splash grime at the foot, dirt under
 * each louvre. Under the deck: a ladder cable tray on hanger rods with cable bundles, and PA speaker cabinets on yokes aimed down over the
 * rows. Back cladding: louvre panels in every other bay. All seeded per stand (no Math.random).
 * Still gives it away (round 3): no shadow cast (left off: on the real GPU it may darken the upper rows too much, decide there), deck top
 * clean (no ponding stains or moss), weathering is vertex-coarse (20 cm) so close up the runs have soft ends, speakers have no cables to the
 * tray, no doors in the cladding (it hangs over the drop behind the back wall: a door needs a landing), not seen on a real GPU.
 * Stand-local frame: +z = up the rows (away from the field), x along the stand, y up. Roof frame R = the old slab's frame (tilt ROOF_TILT). */
import * as THREE from 'three/webgpu';
import {roofOn} from './roof_rule.js';
import {mat,box,cyl} from '../pbr.js';

/* copied from game.js (stand(): FRONT_H, ROW_RISE, ROW_D, BACK_WALL; old roof: y top+8, depth rows*.9+6, z centre rows*.45-2, tilt -.08) */
export const ST={FRONT_H:1,ROW_RISE:.55,ROW_D:.9,BACK_WALL:4,ROOF_Y:8,ROOF_TILT:.08,ROOF_D0:6,ROOF_Z0:-2,OVER:2};
export const RF={DECK_T:.08,DECK_TOP:.25,/* deck sheet thickness and top (old slab top) */
  GAP:6,GD_FRONT:.42,GD_BACK:1.25,WEB_T:.03,FL_W:.3,FL_T:.04,/* girders: spacing, web depth front/back, web and flange size */
  PURLIN_GAP:1.7,PURLIN_H:.2,PURLIN_W:.09,
  FASCIA_H:1.1,FASCIA_D:.35,FASCIA_UP:.25,STRIPE_H:.14,/* fascia: height, depth, how far it rises over the deck top, trim stripe */
  LAMP_M:2.4,LAMP_W:.7,LAMP_H:.3,LAMP_D:.32,LAMP_GLOW:2.2,/* same pitch and glow as the old lamp bar */
  DOWN_M:4.8,DOWN_GLOW:.9,DOWN_ROWS:[.22,.55],/* downlights under the deck: pitch, glow, rows as fractions of depth */
  COL_W:.36,BRACE:3,GUTTER_W:.32,GUTTER_H:.22,PIPE_R:.06,CLAD_T:.04,
  RIB_K:2,CLAD_K:3};/* deck ribs .4 m and cladding seams .6 m apart: the library's .2 m ribs shimmer (moire) at stand distance */
/* round 2: weathering (vertex colour) and the parts under the deck and on the back */
export const WX={SEG:.2,/* vertex spacing of the weathered boxes (m) */PANEL:3,/* fascia panel width: a seam every PANEL m */
  RUST:0x7a4426,GUANO:0xd9d6cc,FADE:0x8a90a0,/* rust, bird dirt, sun-chalked paint */
  LAMP_RUST:.45,LAMP_GUANO:.17,/* share of lamps with a rust run / a bird streak */RUN_W:.09,RUN_K:.55,SEAM_K:.28,GUANO_K:.5,GRIME_H:.2,GRIME_K:.45,FADE_H:.25,FADE_K:.18,
  CLAD_RUNS:.22,/* rust runs per metre of gutter */CLAD_RUN_L:[1.2,3.2],SPLASH_H:.5,SPLASH_K:.35};
export const UD={TRAY_F:.42,/* cable tray at this fraction of the depth from the front */TRAY_W:.45,TRAY_DROP:.35,RUNG:.3,
  SPK_F:.24,SPK_EVERY:2,/* a speaker under every 2nd girder */SPK:[.5,.75,.42],SPK_DROP:.55,SPK_AIM:-2.1,/* rad about x: grille down and back over the rows */
  LOUV:[1.8,1.1],LOUV_SLATS:7,LOUV_UP:.15/* louvre centre above the cladding middle, in cladding heights */};

/* tapered web: trapezoid in the (z, y) plane, depth dFront at z=-D/2, dBack at z=+D/2, top edge at y=0, extruded thickness t along x */
function webGeo(D,dF,dB,t){const s=new THREE.Shape();s.moveTo(-D/2,0);s.lineTo(D/2,0);s.lineTo(D/2,-dB);s.lineTo(-D/2,-dF);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false});g.translate(0,0,-t/2);g.rotateY(-Math.PI/2);return g}/* UVs of ExtrudeGeometry are in shape units = metres */

function inst(geo,m,mats){const n=mats.length,im=new THREE.InstancedMesh(geo,m,n);for(let i=0;i<n;i++)im.setMatrixAt(i,mats[i]);im.instanceMatrix.needsUpdate=true;
  im.computeBoundingSphere&&im.computeBoundingSphere();return im}
const M4=(x,y,z,rx=0,ry=0,rz=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));

/* seeded 0..1 generator (mulberry32): weathering differs per stand but is the same on every load */
function rng(seed){let a=seed>>>0;return()=>{a=(a+0x6d2b79f5)>>>0;let t=a;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296}}
const sm=(a,b,x)=>{const t=Math.min(1,Math.max(0,(x-a)/(b-a)));return t*t*(3-2*t)};
/* box cut every WX.SEG m with UVs in tiles from the vertex position (u, v per face like pbr.js box(); swap = u and v exchanged on +-z,
   so a ribbed relief runs upright), and a colour attribute filled by paint(x, y, z) -> [r, g, b] in the box's own frame */
function wbox(w,h,d,tile,paint,swap=false){const n=a=>Math.max(1,Math.round(a/WX.SEG)),g=new THREE.BoxGeometry(w,h,d,n(w),n(h),n(d)),
  P=g.attributes.position,N=g.attributes.normal,U=g.attributes.uv,C=new Float32Array(P.count*3);
  for(let i=0;i<P.count;i++){const x=P.getX(i),y=P.getY(i),z=P.getZ(i),ax=Math.abs(N.getX(i)),ay=Math.abs(N.getY(i));
    if(ax>.5)U.setXY(i,z/tile,y/tile);else if(ay>.5)U.setXY(i,x/tile,z/tile);else if(swap)U.setXY(i,y/tile,x/tile);else U.setXY(i,x/tile,y/tile);
    const c=paint(x,y,z);C[i*3]=c[0];C[i*3+1]=c[1];C[i*3+2]=c[2]}
  U.needsUpdate=true;g.setAttribute('color',new THREE.BufferAttribute(C,3));return g}
/* paint mixer: base colour, then sun fade, grime (darker), rust, bird dirt; colours in linear working space */
const LC=h=>new THREE.Color(h);
function mix(base,fade,grime,rust,guano){const c=base.clone().lerp(LC(WX.FADE),fade).multiplyScalar(1-grime).lerp(LC(WX.RUST),rust).lerp(LC(WX.GUANO),guano);return[c.r,c.g,c.b]}
/* a run: a narrow streak below a source at (sx, sy), wobbling as it falls, fading over length L */
const run=(x,y,sx,sy,w,L,ph)=>{if(y>sy)return 0;const f=(sy-y)/L;if(f>1)return 0;const dx=(x-sx-.04*Math.sin((sy-y)*7+ph))/(w*(1+.8*f));return Math.exp(-dx*dx)*(1-f)**1.4};
/* white-painted copy of a material with vertex colours on (the paint lives in the colour attribute) */
function vcMat(m){const c=m.clone();c.color.set(0xffffff);c.vertexColors=true;c.userData.tileM=m.userData.tileM;return c}

/* one stand's roof; S = userData.stand of the old stand group; M = shared materials */
function buildOne(S,M){const r=rng(Math.round(S.px*7.3+S.pz*13.1+S.rotY*1000)+911),W=S.len+ST.OVER,D=S.rows*ST.ROW_D+ST.ROOF_D0,top=S.base+ST.FRONT_H+S.rows*ST.ROW_RISE,
  yc=top+ST.ROOF_Y,zc=S.rows*ST.ROW_D/2+ST.ROOF_Z0,th=-ST.ROOF_TILT,c=Math.cos(th),s=Math.sin(th),T=m=>m.userData.tileM;
  const toG=(y,z)=>[yc+y*c-z*s,zc+y*s+z*c];/* roof frame -> stand frame (rotation about x by th) */
  const g=new THREE.Group();g.name='prop:roof';g.position.set(S.px,0,S.pz);g.rotation.y=S.rotY;
  const R=new THREE.Group();R.position.set(0,yc,zc);R.rotation.x=th;g.add(R);
  const add=(par,geo,m,x,y,z,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);o.receiveShadow=true;par.add(o);return o};
  /* deck: corrugated sheet, ribs running front to back (box built D x W then turned, so the relief's ribs follow z) */
  const dy=RF.DECK_TOP-RF.DECK_T/2;add(R,box(D,RF.DECK_T,W,T(M.deck)*RF.RIB_K),M.deck,0,dy,0,0,Math.PI/2);
  const under=RF.DECK_TOP-RF.DECK_T;
  /* purlins across the girders, just under the deck */
  const P=[];for(let z=-D/2+.6;z<D/2-.3;z+=RF.PURLIN_GAP)P.push(M4(0,under-RF.PURLIN_H/2,z));
  R.add(inst(box(W-.2,RF.PURLIN_H,RF.PURLIN_W,T(M.steel)),M.steel,P));
  /* girders: one tapered I per old rib (same 6 m spacing), plus one at each end */
  const n=Math.floor(W/RF.GAP),gx=[];for(let i=0;i<n;i++)gx.push(-W/2+RF.GAP*(i+.5));gx.push(-W/2+.2,W/2-.2);
  const gy=under-RF.PURLIN_H,ang=Math.atan2(RF.GD_BACK-RF.GD_FRONT,D),fl=Math.hypot(D,RF.GD_BACK-RF.GD_FRONT),midD=(RF.GD_FRONT+RF.GD_BACK)/2;
  R.add(inst(webGeo(D,RF.GD_FRONT,RF.GD_BACK,RF.WEB_T),M.steel,gx.map(x=>M4(x,gy,0))));
  R.add(inst(box(RF.FL_W,RF.FL_T,D,T(M.steel)),M.steel,gx.map(x=>M4(x,gy-RF.FL_T/2,0))));/* top flange */
  R.add(inst(box(RF.FL_W,RF.FL_T,fl,T(M.steel)),M.steel,gx.map(x=>M4(x,gy-midD,0,ang))));/* bottom flange follows the taper */
  /* downlights under the deck, between the girders */
  const L=[];for(const f of RF.DOWN_ROWS)for(let x=-W/2+RF.DOWN_M/2;x<W/2;x+=RF.DOWN_M)L.push(M4(x,gy-.12,-D/2+f*D));
  R.add(inst(cyl(.16,.2,.18,12,T(M.dark)),M.dark,L));R.add(inst(new THREE.CircleGeometry(.15,12),M.down,L.map(m=>m.clone().multiply(M4(0,-.091,0,Math.PI/2)))));
  /* fascia: deep box at the front edge, end returns along both sides, top flashing and drip edge */
  const fz=-D/2+RF.FASCIA_D/2-.1,fy=RF.DECK_TOP+RF.FASCIA_UP-RF.FASCIA_H/2,nl=Math.round(W/RF.LAMP_M),Hh=RF.FASCIA_H/2;
  /* round 2: weathered fascia. Lamp brackets (housing bottom ~ -.05 in the box frame) bleed rust, some lamps have a bird perch, every
     panel seam bleeds from its top bolt; grime along the drip edge, chalky top */
  const LA=[];for(let i=0;i<nl;i++)LA.push({x:-W/2+W*(i+.5)/nl,rust:r()<WX.LAMP_RUST?.55+.45*r():0,guano:r()<WX.LAMP_GUANO?.6+.4*r():0,go:(r()-.5)*.4,ph:r()*6,L:.35+.25*r()});
  const ns=Math.floor((W+.1)/WX.PANEL),SE=[];for(let i=1;i<=ns;i++)SE.push({x:-(W+.1)/2+i*WX.PANEL,k:.4+.6*r(),ph:r()*6});
  const fBase=LC(0x2a3040),noise=(x,y)=>.75+.25*Math.sin(x*37.1+y*11.3)*Math.sin(x*5.3-y*23.9);
  const fPaint=(x,y)=>{const li=Math.round((x+W/2)/(W/nl)-.5);let ru=0,gu=0;
    for(let k=li-1;k<=li+1;k++){const a=LA[k];if(!a)continue;if(a.rust)ru+=a.rust*run(x,y,a.x,-.05,WX.RUN_W,Hh+.1,a.ph);if(a.guano)gu+=a.guano*run(x,y,a.x+a.go,-.03,.05,a.L,a.ph+1)}
    const si=Math.floor((x+(W+.1)/2)/WX.PANEL)-1;for(let k=si;k<=si+1;k++){const e=SE[k];if(e)ru+=WX.SEAM_K/WX.RUN_K*e.k*run(x,y,e.x,Hh-.08,.05,RF.FASCIA_H,e.ph)}
    const n=noise(x,y);return mix(fBase,WX.FADE_K*sm(Hh-WX.FADE_H,Hh,y),WX.GRIME_K*sm(-Hh+WX.GRIME_H,-Hh,y)*n,Math.min(.85,WX.RUN_K*ru*n),Math.min(.8,WX.GUANO_K*gu))};
  add(R,wbox(W+.1,RF.FASCIA_H,RF.FASCIA_D,T(M.fascia),fPaint),M.fasciaV,0,fy,fz);
  add(R,box(W+.3,.06,RF.FASCIA_D+.12,T(M.galv)),M.galv,0,RF.DECK_TOP+RF.FASCIA_UP+.03,fz);
  add(R,box(W+.2,.05,RF.FASCIA_D+.06,T(M.galv)),M.galv,0,fy-RF.FASCIA_H/2-.025,fz-.02);
  const eh=RF.FASCIA_H*.375,ePaint=(x,y,z)=>mix(fBase,WX.FADE_K*sm(eh-WX.FADE_H,eh,y),WX.GRIME_K*sm(-eh+WX.GRIME_H,-eh,y)*noise(z,y),0,0);
  for(const sx of [-1,1])add(R,wbox(.12,RF.FASCIA_H*.75,D,T(M.fascia),ePaint),M.fasciaV,sx*(W/2+.04),RF.DECK_TOP+RF.FASCIA_UP-eh,0);
  /* trim stripe along the bottom of the fascia face (park colour) */
  const fFront=fz-RF.FASCIA_D/2;add(R,box(W+.1,RF.STRIPE_H,.02,T(M.trim)),M.trim,0,fy-RF.FASCIA_H/2+RF.STRIPE_H/2+.06,fFront-.01);
  /* lamp housings on the fascia face, a lit lens in each (the old lamp row's pitch and glow) */
  const H=[],Ln=[];for(let i=0;i<nl;i++){const x=-W/2+W*(i+.5)/nl;H.push(M4(x,fy+.12,fFront-RF.LAMP_D/2,-.25));Ln.push(M4(x,fy+.07,fFront-RF.LAMP_D-.01,-.25,Math.PI))}
  R.add(inst(box(RF.LAMP_W,RF.LAMP_H,RF.LAMP_D,T(M.dark)),M.dark,H));
  R.add(inst(new THREE.PlaneGeometry(RF.LAMP_W*.84,RF.LAMP_H*.7),M.lamp,Ln));
  /* round 2, under the deck: a ladder cable tray on hanger rods with two cable bundles, and PA speakers on yokes under every 2nd girder */
  const fb=z=>gy-(RF.GD_FRONT+(z+D/2)/D*(RF.GD_BACK-RF.GD_FRONT))-RF.FL_T,zT=-D/2+UD.TRAY_F*D,yT=fb(zT)-UD.TRAY_DROP,LT=W-.4,tw=UD.TRAY_W/2;
  R.add(inst(box(LT,.08,.015,T(M.galv)),M.galv,[M4(0,yT,zT-tw),M4(0,yT,zT+tw)]));
  const RG=[];for(let x=-LT/2+.1;x<LT/2;x+=UD.RUNG)RG.push(M4(x,yT-.03,zT));R.add(inst(box(.035,.02,UD.TRAY_W,T(M.galv)),M.galv,RG));
  R.add(inst(cyl(.03,.03,LT,8,T(M.cable)),M.cable,[M4(0,yT,zT-.08,0,0,Math.PI/2)]));R.add(inst(cyl(.022,.022,LT,8,T(M.cable)),M.cable,[M4(0,yT-.005,zT+.07,0,0,Math.PI/2)]));
  const gi=gx.slice(0,n),HG=[];for(const x of gi)HG.push(M4(x,yT+UD.TRAY_DROP/2,zT-tw),M4(x,yT+UD.TRAY_DROP/2,zT+tw));
  if(HG.length)R.add(inst(cyl(.008,.008,UD.TRAY_DROP,6,T(M.galv)),M.galv,HG));
  const zS=-D/2+UD.SPK_F*D,yS=fb(zS)-UD.SPK_DROP,SP=[],SR=[];for(let i=1;i<gi.length;i+=UD.SPK_EVERY){SP.push(M4(gi[i],yS,zS,UD.SPK_AIM));SR.push(M4(gi[i],yS+UD.SPK_DROP/2,zS))}
  if(SP.length){const[sw,sh,sd]=UD.SPK,gp=new THREE.PlaneGeometry(sw*.86,sh*.86),gt=T(M.grille),uv=gp.attributes.uv;
    for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*sw*.86/gt,uv.getY(j)*sh*.86/gt);
    R.add(inst(box(sw,sh,sd,T(M.dark)),M.dark,SP));R.add(inst(gp,M.grille,SP.map(m=>m.clone().multiply(M4(0,0,-sd/2-.006,0,Math.PI)))));
    R.add(inst(cyl(.02,.02,UD.SPK_DROP,8,T(M.steel)),M.steel,SR))}
  /* back: gutter on the high edge, columns on the back wall with knee braces to the girders, ribbed cladding closing the gap, downpipes */
  const [gbY,gbZ]=toG(RF.DECK_TOP,D/2);add(g,box(W,RF.GUTTER_H,RF.GUTTER_W,T(M.galv)),M.galv,0,gbY-RF.GUTTER_H/2,gbZ+RF.GUTTER_W/2);
  const wallTop=top+ST.BACK_WALL,wallZ=S.rows*ST.ROW_D+.5,[cbY]=toG(gy-RF.GD_BACK,D/2-.3),ch=cbY-wallTop;
  if(ch>.2){const C=[],B=[],kd=RF.GD_FRONT+(D-RF.BRACE)/D*(RF.GD_BACK-RF.GD_FRONT),[kY,kZ]=toG(gy-kd,D/2-RF.BRACE),aY=wallTop+ch*.45,kl=Math.hypot(kZ-wallZ,kY-aY),ka=Math.atan2(kZ-wallZ,kY-aY);
    for(const x of gx){C.push(M4(x,wallTop+ch/2,wallZ));B.push(M4(x,(aY+kY)/2,(wallZ+kZ)/2,ka))}
    g.add(inst(box(RF.COL_W,ch,RF.COL_W,T(M.steel)),M.steel,C));g.add(inst(box(.14,kl,.14,T(M.steel)),M.steel,B));
    const cz=wallZ+.5+RF.CLAD_T/2,cy=(wallTop+gbY)/2,chh=gbY-wallTop,ch2=chh/2;
    /* round 2: louvres in every other bay (when the cladding is tall enough), then the weathered sheet (ribs upright: swapped UVs) */
    const xs=[...gx].sort((a,b)=>a-b),LV=[],[lw,lh]=UD.LOUV,ly=chh*UD.LOUV_UP;
    if(chh>lh+.8)for(let i=1;i<xs.length;i+=2)if(xs[i]-xs[i-1]>lw+.6)LV.push((xs[i]+xs[i-1])/2);
    const RU=[];for(let i=0,k=Math.round(W*WX.CLAD_RUNS);i<k;i++)RU.push({x:(r()-.5)*W,k:.5+.5*r(),L:WX.CLAD_RUN_L[0]+r()*(WX.CLAD_RUN_L[1]-WX.CLAD_RUN_L[0]),ph:r()*6});
    const cBase=LC(0x4a5264),cPaint=(x,y)=>{let ru=0,dd=0;for(const e of RU)if(Math.abs(x-e.x)<.6)ru+=e.k*run(x,y,e.x,ch2-.05,WX.RUN_W*1.3,e.L,e.ph);
      for(const lx of LV)if(Math.abs(x-lx)<lw)dd+=run(x,y,lx,ly-lh/2,lw*.35,.9,0);const n=noise(x,y);
      return mix(cBase,WX.FADE_K*sm(ch2-WX.FADE_H*2,ch2,y),Math.min(.6,(WX.SPLASH_K*sm(-ch2+WX.SPLASH_H,-ch2,y)+.3*dd)*n),Math.min(.8,WX.RUN_K*ru*n),0)};
    add(g,wbox(W,chh,RF.CLAD_T,T(M.clad)*RF.CLAD_K,cPaint,true),M.cladV,0,cy,cz);
    if(LV.length){const oz=cz+RF.CLAD_T/2,Lb=[],Lh=[],Lv=[],Ls=[];
      for(const x of LV){const y=cy+ly;Lb.push(M4(x,y,oz+.02));Lh.push(M4(x,y+lh/2,oz+.05),M4(x,y-lh/2,oz+.05));Lv.push(M4(x-lw/2,y,oz+.05),M4(x+lw/2,y,oz+.05));
        for(let j=0;j<UD.LOUV_SLATS;j++)Ls.push(M4(x,y-lh/2+lh*(j+.5)/UD.LOUV_SLATS,oz+.06,.6))}
      g.add(inst(box(lw,lh,.04,T(M.dark)),M.dark,Lb));g.add(inst(box(lw+.06,.06,.08,T(M.steel)),M.steel,Lh));g.add(inst(box(.06,lh,.08,T(M.steel)),M.steel,Lv));
      g.add(inst(box(lw-.08,.025,.13,T(M.fascia)),M.fascia,Ls))}}
  const DP=[];for(let i=0;i<gx.length-2;i+=2)DP.push(M4(gx[i]+.5,gbY/2,wallZ+.5+RF.CLAD_T+.12));
  if(DP.length)g.add(inst(cyl(RF.PIPE_R,RF.PIPE_R,gbY,10,T(M.galv)),M.galv,DP));
  g.traverse(o=>{if(o.isMesh)o.receiveShadow=true});return g}

/* old: the old:roof meshes (their parent is the stand group with userData.stand); colors: {pad, trim} of the home park */
export function buildRoofs(o){const slabs=o.old.filter(m=>m.name==='old:roof');if(!slabs.length)throw new Error('old:roof not found');
  const M={deck:mat('paintedSteel',{relief:'ribbed',color:0x9aa1ad,rough:.6}),steel:mat('paintedSteel',{relief:'plain',color:0x3a4256,rough:.72}),dark:mat('paintedSteel',{color:0x1e232c,rough:.65}),
    fascia:mat('paintedSteel',{color:0x2a3040,rough:.5}),galv:mat('galvSteel'),clad:mat('paintedSteel',{relief:'ribbed',color:0x4a5264,rough:.6}),
    lamp:mat('paintedSteel',{relief:'plain',color:0xfff3d6,rough:.3,metal:0,emissive:0xfff3d6,emissiveIntensity:RF.LAMP_GLOW}),
    down:mat('paintedSteel',{relief:'plain',color:0xfff6e6,rough:.3,metal:0,emissive:0xfff6e6,emissiveIntensity:RF.DOWN_GLOW}),
    trim:mat('paintedSteel',{relief:'plain',rough:.38}).clone(),cable:mat('rubber',{relief:'plain',color:0x15161a}),
    grille:mat('paintedSteel',{relief:'woven',color:0x15171b,rough:.8})};
  M.fasciaV=vcMat(M.fascia);M.cladV=vcMat(M.clad);/* round 2: weathered copies (paint in the vertex colours) */
  const g=new THREE.Group();g.name='prop:roofs';
  for(const sl of slabs){const S=sl.parent&&sl.parent.userData.stand;if(S&&S.roof)g.add(buildOne(S,M))}
  if(!g.children.length)throw new Error('no roofed stand found');
  g.userData.recolor=P=>{if(P)M.trim.color.set(P.trim);const on=roofOn(P);for(const c of g.children)c.visible=on};g.userData.recolor(o.colors);return g}

export const PROPS=[{name:'roof',build:c=>buildRoofs({old:c.old('roof'),colors:c.park()}),old:c=>c.old('roof')}];
