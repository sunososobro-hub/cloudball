/* render/props/bases.js: bases, home plate and pitcher's rubber (#215 polish lane, rounds 1-3). Polish rounds edit only this file (slot rule #237).
 * (rounds 1-2) Before: no geometry at all. The three bags, the plate and the rubber were white shapes painted into the field map (game.js fieldTex),
 * flat on the dirt, so from the low cameras they had no edge, no thickness and no shadow. Nothing to hide: old() is [].
 * Shape: every piece is one "rounded slab": its outline (square bag, pentagon plate, rectangle rubber) inset by the edge radius, a top
 * that crowns a little, a rolled edge (quarter circle, corners rounded too) and a side wall that sinks just under the dirt.
 *   bags: BAG_H tall, soft rolled edge and a piped welt around the top (the stitched seam of a real bag), contact shadow on the dirt.
 *   plate: nearly flush with the dirt, a narrow bevel; rubber: a low slab on the mound line.
 * Surface: kinds basesVinyl (pebble grain, a soft sheen) and basesRubber (relief basesScuffed: cleat scratches, pits), registered into
 *   pbr.js's KINDS/RELIEFS from this file (pbr.js itself stays read-only, slot rule); UVs in metres.
 * Wear, baked per vertex from seeded noise (same picture every load): dirt specks on the tops, heavier near the edges, a dirt band
 * climbing the sides, cleat scuffs where the runners' feet land on the bags and where the pitcher's foot pushes off the rubber.
 * Frame: world. Bag centres are the engine's BASES (the painted squares are centred there too), plate at home, rubber at RUBBER_Z.
 * Round 2 (board: feet sink into the bags, the plate floats, barely changes the broadcast shot):
 *   (1) shape: bags 7.6 cm (BAG_H, the 3 in floor of the rule book; was 9 cm), so the runners' soles at y 0 sink less; every piece now
 *   sits in a berm of loose dirt (BERM: kicked up against its sides, ragged outer edge, falls to the dirt), so nothing floats.
 *   (2) surface: the berm wears the ground's own material (old:field cloned at its field-map uv, the polished field's watering, the same
 *   ratio trick as props/mound.js), so it has no seam; without old:field (prop viewer) the shared `dirt` kind is used.
 *   (3) small parts: the plate's bevel is black rubber like a real plate (PLATE_RIM), wider and taller, so from the CF camera it reads as
 *   a white pentagon with a dark outline instead of a white smear; a slide mark of loose dirt fans out on the near side of each bag.
 * Round 3 (board: no slide marks or footprints running into the bags, broadcast shot almost unchanged, rubber not shot):
 *   (1) shape: base-path patches round every bag (PATH: one along the path in, one along the path out, so the runner's turn is covered),
 *   in the berm's draped ground material and world uv: a feet-first slide trail into 2B and 3B and a head-first dive back into 1B from
 *   the lead (SLIDE: scraped trough, ridges of pushed-aside dry dirt, cleat drag lines, heel gouges where the slide starts), and seeded
 *   cleat prints of several runners (PRINTS: oval sole, deeper toe, a lighter rim of kicked dirt) on the run in, the run through and the lead.
 *   Features fade to ratio 1 near the bag (PATH_IN) and at the patch edges, so the berm, the two patches and the field meet with no seam.
 *   (2) surface: dirt smeared over the top of each bag on the slide side (SMEAR), a brushed dust film on the plate (the umpire sweeps
 *   the middle, dust stays at the point and the corners: PLATE_DUST), dirt dragged over the front edge of the rubber (RUBBER_DUST),
 *   so from the CF camera the pieces read as used white, not as clean stickers.
 *   (3) #267 MRT trap: the bags' contact shadows are a transparent overlay; they now keep the normal, diffuse and velocity under them on
 *   max (keepBehind, as in mound.js and ondeck.js). They did not before. */
import * as THREE from 'three/webgpu';
import {BASES} from '../../engine/index.js';
import * as TSL from 'three/tsl';
import {mat,KINDS,RELIEFS} from '../pbr.js';
import {FIELD} from './field.js';/* round 2: the watering of the polished field (read only), so the berms match the dirt round them */

export const BASE={
  BAG_W:.44,BAG_H:.076,BAG_R:.03,BAG_CROWN:.008,WELT_R:.0055,/* bag: side (m, = the painted square), height, edge roll, crown, piping radius */
  PLATE_W:.44,PLATE_H:.024,PLATE_R:.02,PLATE_RIM:.86,/* round 2: the bevel is black rubber (darkening) */PLATE_CROWN:.002,/* home plate: width (= the painted pentagon), top above the dirt, bevel */
  RUBBER_W:.6,RUBBER_D:.15,RUBBER_Z:-18.425,RUBBER_H:.022,RUBBER_R:.008,RUBBER_CROWN:.002,/* pitcher's rubber (= the painted strip) */
  SINK:.012,/* the side wall goes this far under the dirt so no gap shows at grazing angles */
  RINGS:9,EDGE_SEG:5,CORNER_SEG:4,SIDE_M:.04,/* top rings, points per quarter-circle edge, per corner, side subdivision (m) */
  SPECK:.15,EDGE_DIRT:.2,SIDE_DIRT:.32,SCUFF:.22,/* how dark (fraction) dirt specks, edge dirt, the side band and cleat scuffs get */
  SHADOW_K:1.55,SHADOW_A:.55,/* contact shadow: size in bag widths, darkest alpha */
  BAG_ROUGH:.58,RUBBER_ROUGH:.78,/* #256: flat roughness, no roughness map (see the note above buildBases) */
  /* round 2: loose dirt round every piece: ring width (m), height against the side (below the plate bevel, so the black rim shows), ragged share of the width, rings, lift at the outer edge */
  BERM:{bag:[.2,.022],plate:[.26,.005],rubber:[.16,.007]},BERM_RAG:.45,BERM_RINGS:6,BERM_EDGE:.0015,
  BERM_DRY:.12,BERM_SLIDE:[.55,.32,.012],/* loose dirt is drier (lighter) by this; slide fan: length, half width, height (bags only) */
  MAP:[-130,-150,260,190],/* the field map in game.js (x0, z0, width, depth), the same numbers as MOUND.MAP */
  /* round 3: base-path patches. PATH: length of the patch along the path in, along the path out, half width, grid step (m);
     PATH_IN: features fade in between these distances from the bag centre (inside: the berm, its slide fan and the other patch; ratio 1 there, so the higher berm never cuts a mark off);
     PATH_Y: patch height over the field plane */
  PATH:[3.4,2.4,.55,.025],PATH_IN:[.8,1.3],PATH_Y:.0006,
  /* LANE[bag][side]: the runners' lane across the patch (m, + = the patch's left): into 1B in the running lane on the foul side of the
     line, the lead off 3B in foul ground; elsewhere on the path. The chalk line (on the path to home) stays in the patch but clear of most prints */
  LANE:{1:{in:-.38,out:0},2:{in:0,out:0},3:{in:0,out:.38}},
  /* SLIDE[bag] = [which patch ('in' = toward the previous base, 'out' = toward the next), length, half width, head-first?] */
  SLIDE:{1:['out',2.0,.27,true],2:['in',2.7,.21,false],3:['in',2.7,.21,false]},
  SLIDE_K:{TROUGH:.14,RIDGE:.1,RIDGE_W:.09,RIDGE_H:.006,GROOVE:.14,GROOVE_W:.007,HEEL:.16},/* trough darker (scraped damp layer), ridge lighter and its height, cleat drag lines, heel gouges */
  PRINTS:{RUNNERS:6,STRIDE:[1.7,2.2],SPREAD:.16,FOOT:.1,L:.27,W:.1,DARK:.24,RIM:.06,RIM_H:.0022},/* runners per patch, stride range, lateral spread, half step, print size, packed darker, kicked rim lighter and high */
  SMEAR:.2,PLATE_DUST:.16,RUBBER_DUST:.18,/* dirt over the top of a bag on its slide side, dust film on the plate, dirt over the rubber's front edge */
};
function hash(x,y,k){let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
function vn(x,y,k){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  a=hash(xi,yi,k),b=hash(xi+1,yi,k),c=hash(xi,yi+1,k),e=hash(xi+1,yi+1,k);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
const sat=x=>x<0?0:x>1?1:x,smooth=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)};

/* tileable noise for the relief below (period p cells; the same family as pbr.js, which keeps its own private) */
function tvn(x,y,k,p){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  H=(a,b)=>hash(((a%p)+p)%p,((b%p)+p)%p,k),a=H(xi,yi),b=H(xi+1,yi),c=H(xi,yi+1),e=H(xi+1,yi+1);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
function tfbm(u,v,k,p,oct=4){let s=0,a=.5,n=0;for(let o=0;o<oct;o++){s+=tvn(u*p,v*p,k+o,p)*a;n+=a;a*=.5;p*=2}return s/n}
function tcell(u,v,k,p){const x=u*p,y=v*p,xi=Math.floor(x),yi=Math.floor(y);let d=9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=xi+i,cy=yi+j,wx=((cx%p)+p)%p,wy=((cy%p)+p)%p,px=cx+hash(wx,wy,k),py=cy+hash(wx,wy,k+1);d=Math.min(d,Math.hypot(px-x,py-y))}
  return Math.min(1,d)}
/* this object's own relief and kinds, added to the shared registry under names only this file uses (never replaces one) */
RELIEFS.basesScuffed??={m:.6,n:1.1,h:(u,v)=>{/* worn whitened rubber (plate, pitcher's rubber): soft unevenness, cleat scratches, small pits */
  let sc=0;for(let i=0;i<12;i++){const a=hash(i,0,111)*Math.PI,ca=Math.cos(a),sa=Math.sin(a),du=u-hash(i,1,111),dv=v-hash(i,3,111),
    d=Math.abs(du*sa-dv*ca),t=Math.abs(du*ca+dv*sa),L=.04+.12*hash(i,4,111);/* short cleat scratches: a segment, fading toward its ends */
    sc=Math.max(sc,(1-smooth(0,.004,d))*(1-smooth(L*.6,L,t))*.14*(.4+.6*hash(i,2,111)))}
  return sat(.84+.1*tfbm(u,v,112,6)-sc-(tcell(u,v,113,40)<.06?.18:0))}};
KINDS.basesVinyl??={color:0xf7f6f1,rough:.5, metal:0,relief:'grain',       rv:.15};/* rubber-coated vinyl base bag: pebble grain, a soft sheen */
KINDS.basesRubber??={color:0xf4f3ee,rough:.72,metal:0,relief:'basesScuffed',rv:.12};/* whitened rubber: home plate, pitcher's rubber */

/* outline (convex, either direction, local x/z) inset by r -> points with outward normals; each corner becomes a fan of
   normals at one point, so offsetting by r*n afterwards rounds the corner exactly */
function insetOutline(P,r,edgeM,cornerSeg){const n=P.length,N=[];
  let cx0=0,cz0=0;for(const p of P){cx0+=p[0]/n;cz0+=p[1]/n}
  for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n],dx=b[0]-a[0],dz=b[1]-a[1],L=Math.hypot(dx,dz);let nx=dz/L,nz=-dx/L;
    if(nx*((a[0]+b[0])/2-cx0)+nz*((a[1]+b[1])/2-cz0)<0){nx=-nx;nz=-nz}N.push([nx,nz])}/* outward, whichever way the outline runs */
  const out=[];for(let i=0;i<n;i++){const n0=N[(i+n-1)%n],n1=N[i],a=Math.atan2(n0[1],n0[0]),b=a+Math.atan2(n0[0]*n1[1]-n0[1]*n1[0],n0[0]*n1[0]+n0[1]*n1[1]);/* turn the short way */
    /* inset corner point: the corner moved in along both edge normals */
    const s=1/(1+n0[0]*n1[0]+n0[1]*n1[1]),cx=P[i][0]-r*(n0[0]+n1[0])*s,cz=P[i][1]-r*(n0[1]+n1[1])*s;
    for(let k=0;k<=cornerSeg;k++){const t=a+(b-a)*k/cornerSeg;out.push([cx,cz,Math.cos(t),Math.sin(t)])}
    /* then along the edge to the next corner */
    const nx=P[(i+1)%n],n2=N[(i+1)%n],s2=1/(1+n1[0]*n2[0]+n1[1]*n2[1]),ex=nx[0]-r*(n1[0]+n2[0])*s2,ez=nx[1]-r*(n1[1]+n2[1])*s2,
      m=Math.max(1,Math.round(Math.hypot(ex-cx,ez-cz)/edgeM));
    for(let k=1;k<m;k++)out.push([cx+(ex-cx)*k/m,cz+(ez-cz)*k/m,n1[0],n1[1]])}
  return out}

/* one rounded slab: outline P (local x/z, CCW), height h (top above the dirt), edge radius r, crown c; wear(x,z,y,side) -> darkening 0..1.
   uv in metres (top: x/z; sides: length along the outline, height), vertex colour = wear. */
function slab(P,h,r,c,tileM,wear){const {RINGS,EDGE_SEG,CORNER_SEG,SINK,SIDE_M}=BASE,O=insetOutline(P,r,.03,CORNER_SEG),n=O.length,
  pos=[],uv=[],col=[],idx=[],rings=[];let ext=0;for(const o of O)ext=Math.max(ext,Math.hypot(o[0],o[1]));
  const len=[0];for(let i=1;i<=n;i++){const a=O[i-1],b=O[i%n];len.push(len[i-1]+Math.hypot(b[0]-a[0],b[1]-a[1])+r*Math.acos(Math.min(1,a[2]*b[2]+a[3]*b[3])))}
  const ring=f=>{const b=pos.length/3;for(let i=0;i<=n;i++){const o=O[i%n],[x,y,z,u,v,side]=f(o,i);pos.push(x,y,z);uv.push(u/tileM,v/tileM);
    const k=1-sat(wear(x,z,y,side));col.push(k*(1-.06*(1-k)),k*(1-.12*(1-k)),k*(1-.22*(1-k)))}rings.push(b)};
  /* top: rings from the centre out to the inset outline, crowned */
  for(let j=0;j<=RINGS;j++){const s=j/RINGS;ring(o=>{const x=o[0]*s,z=o[1]*s,d=Math.hypot(x,z)/ext;return[x,h+c*(1-d*d),z,x,z,0]})}
  /* rolled edge: quarter circle from the top down to the side */
  for(let j=1;j<=EDGE_SEG;j++){const p=j/EDGE_SEG*Math.PI/2;ring((o,i)=>{const x=o[0]+o[2]*r*Math.sin(p),z=o[1]+o[3]*r*Math.sin(p),y=h-r+r*Math.cos(p);
    return[x,y,z,len[i],h-y+r*p,sat(p/(Math.PI/2))]})}
  /* side wall down into the dirt */
  const sideN=Math.max(1,Math.ceil((h-r+SINK)/SIDE_M));for(let j=1;j<=sideN;j++){const y=h-r-(h-r+SINK)*j/sideN;
    ring((o,i)=>{const x=o[0]+o[2]*r,z=o[1]+o[3]*r;return[x,y,z,len[i],h-y+r*Math.PI/2,1]})}
  /* winding: the top must face up whichever way the outline runs (the top ring's cross products, y) */
  const q=(a,b,c)=>{const P3=i=>[pos[i*3],pos[i*3+1],pos[i*3+2]],[A,B,C]=[P3(a),P3(b),P3(c)],ux=B[0]-A[0],uz=B[2]-A[2],vx=C[0]-A[0],vz=C[2]-A[2];return uz*vx-ux*vz},
    flip=(()=>{let t=0;for(let i=0;i<n;i++)t+=q(rings[RINGS-1]+i,rings[RINGS-1]+i+1,rings[RINGS]+i);return t<0})();/* summed: corner fans repeat a point */
  for(let k=0;k<rings.length-1;k++){const A=rings[k],B=rings[k+1];for(let i=0;i<n;i++)flip?idx.push(A+i,B+i,A+i+1,A+i+1,B+i,B+i+1):idx.push(A+i,A+i+1,B+i,A+i+1,B+i+1,B+i)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  const nm=g.attributes.normal;for(let i=0;i<nm.count;i++)if(Math.hypot(nm.getX(i),nm.getY(i),nm.getZ(i))<.5)nm.setXYZ(i,0,1,0);
  /* the centre point and the corner fans on the flat top only touch zero-area triangles: they face straight up */return g}

/* wear: seeded specks + edge dirt + side band + cleat scuffs near the points `feet` (local x/z, radius) */
const wearFn=(seed,h,feet=[],smear=null)=>(x,z,y,side)=>{const {SPECK,EDGE_DIRT,SIDE_DIRT,SCUFF,SMEAR}=BASE;
  const sp=smooth(.62,.9,vn(x*90,z*90,seed))*SPECK+smooth(.6,.85,vn(x*25+7,z*25,seed+1))*SPECK*.4,
    sd=side*EDGE_DIRT*(.6+.4*vn(x*40,z*40+y*40,seed+2))+sat(1-y/Math.max(h,.02))**1.5*SIDE_DIRT*side*(.8+.2*vn(x*30,y*60,seed+3));
  let sc=0;for(const [fx,fz,fr] of feet){const d=Math.hypot(x-fx,z-fz)/fr;sc=Math.max(sc,(1-smooth(.3,1,d))*(.5+.5*vn(x*60,z*60,seed+4)))}
  /* round 3: dirt smeared over the slide side (smear = local direction x, z): streaks along the slide, thinning toward the far edge */
  const sm=smear?smooth(-.08,.2,x*smear[0]+z*smear[1])*(.45+.55*vn((x*smear[1]-z*smear[0])*55,(x*smear[0]+z*smear[1])*6,seed+5))*SMEAR:0;
  return sp+sd+sc*SCUFF+sm};

/* a soft dark disc on the dirt under a bag: the bag's own contact shadow, so it sits on the ground from the broadcast distance too */
let SHADOW_TEX=null;
function shadowTex(){if(SHADOW_TEX)return SHADOW_TEX;const N=64,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),gr=g.createRadialGradient(N/2,N/2,N*.18,N/2,N/2,N/2);
  gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.55,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,N,N);
  return SHADOW_TEX=new THREE.CanvasTexture(c)}

/* round 3, #267 trap (same as mound.js, ondeck.js and backstop.js): a transparent overlay keeps the normal, diffuse and velocity under it
   on max (game.js MRT_KEEP blends those targets like the material; alpha 0 there = keep). Only while the renderer has an MRT. */
const KEEP=['normal','diffuse','velocity'];let KEEP_MRT=null;
function keepBehind(m){let Rn=null;const setup=m.setup;
  m.setup=function(b){Rn=b.renderer;return setup.call(this,b)};
  Object.defineProperty(m,'mrtNode',{get:()=>Rn&&Rn.getMRT&&Rn.getMRT()?(KEEP_MRT||(KEEP_MRT=TSL.mrt(Object.fromEntries(KEEP.map(n=>[n,TSL.vec4(0)]))))):null,set(){}});
  return m}

/* #256 (two white blobs on home plate in the max broadcast shot): pbr.js's roughness image is multiplied into the kind's roughness, and
   for these reliefs it averages .19 (basesScuffed) and .27 (grain) with texels at 0, so the "rough .72" plate came out about .15 with
   mirror spots: SSR on max took it (its gloss mask is roughness under .35), it mirrored the tower lamps and halos (HDR > the 1.6 bloom
   threshold) and bloom grew them past the plate. Here the map is dropped and the roughness set flat; the wear stays in the vertex colours,
   the grain and scuffs in the normal map. Diffuse alone under key + fill + towers is about 1.06 from the broadcast seat: under 1.6. */
export function buildBases(ctx){const B=BASE,g=new THREE.Group(),berms=[];g.name='prop:bases';
  const vinyl=mat('basesVinyl').clone(),rub=mat('basesRubber').clone();vinyl.vertexColors=rub.vertexColors=true;
  vinyl.roughnessMap=rub.roughnessMap=null;vinyl.roughness=B.BAG_ROUGH;rub.roughness=B.RUBBER_ROUGH;
  const shM=keepBehind(new THREE.MeshBasicNodeMaterial({color:0x000000,alphaMap:shadowTex(),transparent:true,opacity:B.SHADOW_A,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));
  const add=(geo,m,x,z,ry)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,0,z);ms.rotation.y=ry;ms.castShadow=ms.receiveShadow=true;g.add(ms);return ms};
  /* bags: square turned 45 degrees (corners on the base paths), welt piping along the top of the rolled edge */
  const hw=B.BAG_W/2,sq=[[-hw,hw],[hw,hw],[hw,-hw],[-hw,-hw]];
  for(let b=1;b<=3;b++){const [x,z]=BASES[b],
    /* cleat scuffs: where the runner's foot lands, on the corners facing the previous and the next base (local frame after the 45 degree turn) */
    feet=[[-hw*.55,hw*.55,.16],[hw*.5,hw*.6,.12],[hw*.3,-hw*.5,.1]].map(([fx,fz,fr])=>[fx*(hash(b,1,7)>.5?1:-1),fz,fr]);
    /* round 3: the slide side, world direction from the bag toward where the slide comes from, turned into the bag's local frame */
    const [sw]=B.SLIDE[b],o=BASES[sw==='in'?b-1:b+1],sl=Math.hypot(o[0]-x,o[1]-z),sdx=(o[0]-x)/sl,sdz=(o[1]-z)/sl,c4=Math.cos(Math.PI/4),s4=Math.sin(Math.PI/4),
      smear=[sdx*c4-sdz*s4,sdx*s4+sdz*c4];
    add(slab(sq,B.BAG_H,B.BAG_R,B.BAG_CROWN,vinyl.userData.tileM||1,wearFn(300+b*17,B.BAG_H,feet,smear)),vinyl,x,z,Math.PI/4);
    berms.push([sq,B.BAG_R,x,z,Math.PI/4,B.BERM.bag,310+b*17,Math.atan2(BASES[b-1][0]-x,BASES[b-1][1]-z)]);/* slide fan on the side the runner comes in from (the previous base) */
    const W=insetOutline(sq,B.BAG_R,.03,B.CORNER_SEG),ws=Math.sin(Math.PI/6)*B.BAG_R,wy=B.BAG_H-B.BAG_R+Math.cos(Math.PI/6)*B.BAG_R,
      curve=new THREE.CatmullRomCurve3(W.map(o=>new THREE.Vector3(o[0]+o[2]*ws,wy,o[1]+o[3]*ws)),true,'centripetal');
    const wm=add(new THREE.TubeGeometry(curve,96,B.WELT_R,6,true),vinyl,x,z,Math.PI/4);
    const wg=wm.geometry,wc=new Float32Array(wg.attributes.position.count*3);for(let i=0;i<wg.attributes.position.count;i++){const k=1-.18-.12*vn(i*.37,b,9);wc.set([k,k*.97,k*.92],i*3)}
    wg.setAttribute('color',new THREE.BufferAttribute(wc,3));
    const sh=new THREE.Mesh(new THREE.PlaneGeometry(B.BAG_W*B.SHADOW_K,B.BAG_W*B.SHADOW_K),shM);sh.rotation.set(-Math.PI/2,0,Math.PI/4);sh.position.set(x,.004,z);sh.renderOrder=1;g.add(sh)}
  /* home plate: the painted pentagon (front edge toward the pitcher at -z, point toward the catcher), nearly flush */
  const p=B.PLATE_W/2,plate=[[-p,-p],[-p,0],[0,p],[p,0],[p,-p]];
  const pw0=wearFn(400,B.PLATE_H,[[-.16,.02,.12],[.16,.02,.12],[0,-.2,.1]]),
    /* round 3: brushed dust film: the brush sweeps side to side across the middle, dust stays toward the point (+z) and the corners */
    pw=(x,z,y,side)=>pw0(x,z,y,side)+B.PLATE_DUST*smooth(.1,.3,Math.hypot(x*.8,z+.04))*(.35+.65*vn(x*7,z*48,404))*(1-.6*side);
  add(slab(plate,B.PLATE_H,B.PLATE_R,B.PLATE_CROWN,rub.userData.tileM||1,(x,z,y,side)=>side>0?Math.max(pw(x,z,y,side),B.PLATE_RIM*smooth(.05,.35,side)):pw(x,z,y,side)),rub,BASES[0][0],BASES[0][1],0);
  berms.push([plate,B.PLATE_R,BASES[0][0],BASES[0][1],0,B.BERM.plate,410,null]);
  /* pitcher's rubber: scuffed in front where the pivot foot pushes off */
  const rw=B.RUBBER_W/2,rd=B.RUBBER_D/2,rr=[[-rw,-rd],[-rw,rd],[rw,rd],[rw,-rd]];
  const rw0=wearFn(500,B.RUBBER_H,[[-.08,-rd,.14],[.1,-rd,.1]]),/* round 3: dirt dragged over the front edge (+z, toward home, the push-off trench of mound.js) by the pivot foot */
    rwf=(x,z,y,side)=>rw0(x,z,y,side)+B.RUBBER_DUST*smooth(rd*.1,rd*.95,z)*(.4+.6*vn(x*30,z*80,505));
  add(slab(rr,B.RUBBER_H,B.RUBBER_R,B.RUBBER_CROWN,rub.userData.tileM||1,rwf),rub,0,B.RUBBER_Z,0);
  berms.push([rr,B.RUBBER_R,0,B.RUBBER_Z,0,B.BERM.rubber,510,null]);
  /* round 2: one mesh for every berm, in world coordinates (the draped material reads the field map at world x/z) */
  const dr=drapeMat(ctx);let dm=dr;if(!dm){dm=mat('dirt',{color:0xffffff}).clone();dm.vertexColors=true;dm.roughnessMap=null;dm.roughness=.96}
  const bm=new THREE.Mesh(bermGeo(berms,!!dr),dm);bm.receiveShadow=true;bm.name='bases:berm';g.add(bm);
  /* round 3: the base-path patches (slide trails, cleat prints), same material and uv as the berms */
  const pm=new THREE.Mesh(pathGeo(!!dr),dm);pm.receiveShadow=true;pm.name='bases:paths';g.add(pm);
  return g}

/* round 3: the seeded cleat prints of one patch, in patch coordinates (t along the patch away from the bag, s across):
   [t, s, heading offset, weight]. Fixed per (bag, side), so the picture is the same every load. */
function printsOf(b,side,L){const P=BASE.PRINTS,out=[],lane=BASE.LANE[b][side];
  for(let r=0;r<P.RUNNERS;r++){const k=b*100+(side==='in'?0:50)+r,st=P.STRIDE[0]+(P.STRIDE[1]-P.STRIDE[0])*hash(k,1,61),
      off=lane+(hash(k,2,61)+hash(k,3,61)-1)*P.SPREAD*1.6,w=.35+.65*hash(k,4,61),ph=hash(k,5,61)*st;
    for(let t=.7+ph*.5,f=hash(k,6,61)>.5?1:-1;t<L-.15;t+=st/2,f=-f)
      out.push([t+(hash(k,Math.round(t*10),62)-.5)*.08,off+f*P.FOOT+(hash(k,Math.round(t*10),63)-.5)*.05,(hash(k,Math.round(t*10),64)-.5)*.35,w])}
  return out}

/* round 3: ratio (colour) and lift (height over PATH_Y) at patch point (t, s) for bag b, patch side 'in' or 'out' */
function pathAt(b,side,t,s,prints,L){const B=BASE,K=B.SLIDE_K,P=B.PRINTS,Hw=B.PATH[2],seed=700+b*31+(side==='in'?0:13);
  const env=smooth(B.PATH_IN[0],B.PATH_IN[1],t)*smooth(L,L-.35,t)*smooth(Hw,Hw*.7,Math.abs(s-B.LANE[b][side]));/* ratio 1 near the bag, at the far end and the sides */
  let k=1,y=0;
  const [sw,SL,SW,head]=B.SLIDE[b];
  if(sw===side&&t<SL+.25){/* the slide: a trough as wide as the body, wandering a little, pushed-aside ridges either side */
    const sc=.05*Math.sin(t*1.4+b)+.03*(vn(t*2,b,seed)-.5),w=SW*(head?1-.25*smooth(.4,SL,t):.8+.35*smooth(SL,.6,t)),d=Math.abs(s-sc),
      te=smooth(SL+.2,SL-.3,t),tr=smooth(w,w*.7,d)*te,ri=Math.max(0,1-Math.abs(d-w-K.RIDGE_W*.5)/(K.RIDGE_W*.7))*te*(.6+.4*vn(t*6,s*20,seed+1));
    let gr=0;if(!head)for(const go of [-.13,-.05,.04,.12]){const gd=Math.abs(s-sc-go-.01*Math.sin(t*5+go*40));gr=Math.max(gr,(1-smooth(0,K.GROOVE_W,gd))*(.5+.5*vn(t*3,go*10,seed+2)))}
    else gr=.6*smooth(.5,.95,vn(t*9,s*30,seed+2))*tr;/* head-first: the chest smears rather than cuts */
    gr*=tr;
    const heel=head?0:Math.max(...[-.09,.09].map(hs=>1-smooth(.02,.06,Math.hypot((t-SL+.08)*.6,s-sc-hs))));
    k+= -K.TROUGH*tr*(.7+.3*vn(t*4,s*12,seed+3))+K.RIDGE*ri-K.GROOVE*gr-K.HEEL*heel;y+=K.RIDGE_H*ri*(.7+.3*vn(t*8,s*25,seed+4))+.0012*heel}
  /* cleat prints: an oval sole, the toe (front, away from the bag on the way in) deeper; a lighter rim of kicked dirt */
  for(const [pt,ps,ph,pw] of prints){const dt=t-pt,ds=s-ps;if(dt*dt+ds*ds>.06)continue;
    const c=Math.cos(ph),sn=Math.sin(ph),u=(dt*c-ds*sn)/(P.L/2),v=(dt*sn+ds*c)/(P.W/2),r=Math.hypot(u,v*(1+.25*u)),
      toe=side==='in'?smooth(.6,-.6,u):smooth(-.6,.6,u),cl=smooth(.55,.85,vn(u*4+pt*9,v*4,seed+5));
    k+=(-P.DARK*(1-smooth(.75,1,r))*(.55+.45*toe+.25*cl)+P.RIM*Math.max(0,1-Math.abs(r-1.12)/.22))*pw;
    y+=P.RIM_H*Math.max(0,1-Math.abs(r-1.12)/.22)*pw*(side==='in'?.6+.8*toe:1)}
  k=1+(k-1)*env;return[k,y*env]}

/* round 3: one mesh holding both patches of every bag: grids along the path in (toward the previous base) and out (toward the next),
   world coordinates, uv as the berms (field map uv when draped). Only cells with something in them are drawn (a flat cell would show
   the draped map over field.js's own top, e.g. its chalk tilt), so the patch is the marks alone. */
function pathGeo(drape){const B=BASE,[LI,LO,Hw,step]=B.PATH,pos=[],uv=[],col=[],idx=[];
  for(let b=1;b<=3;b++){const [cx,cz]=BASES[b];
    for(const side of ['in','out']){const o=BASES[side==='in'?b-1:b+1],L=side==='in'?LI:LO,dl=Math.hypot(o[0]-cx,o[1]-cz),ax=(o[0]-cx)/dl,az=(o[1]-cz)/dl,
        nt=Math.ceil(L/step),ns=Math.ceil(2*Hw/step),base=pos.length/3,pr=printsOf(b,side,L),cs=B.LANE[b][side],on=[];
      for(let i=0;i<=nt;i++){const t=L*i/nt;for(let j=0;j<=ns;j++){const s=cs-Hw+2*Hw*j/ns,x=cx+ax*t-az*s,z=cz+az*t+ax*s,[k,dy]=pathAt(b,side,t,s,pr,L);
        pos.push(x,B.PATH_Y+dy,z);uv.push(...(drape?[(x-B.MAP[0])/B.MAP[2],(B.MAP[1]+B.MAP[3]-z)/B.MAP[3]]:[x,z]));col.push(k,k*.99,k*.97);on.push(Math.abs(k-1)>.004||dy>.0002)}}
      const A=(i,j)=>i*(ns+1)+j;
      for(let i=0;i<nt;i++)for(let j=0;j<ns;j++){const q=[A(i,j),A(i+1,j),A(i,j+1),A(i+1,j+1)];if(!q.some(v=>on[v]))continue;
        const a=base+q[0],c=base+q[1];idx.push(a,c,a+1,a+1,c,c+1)}}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  /* winding: the patch must face up */const ny=g.attributes.normal;let up=0;for(let i=0;i<ny.count;i++)up+=ny.getY(i);
  if(up<0){const a=g.index.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t}g.computeVertexNormals()}return g}

/* round 2: the loose dirt round one piece: rings from the piece's outer outline (its side wall, a hair inside so no gap shows) out to a
   ragged edge, height falling from h against the side to BERM_EDGE; for a bag, a low fan of slid dirt toward angle `slide` (world).
   Vertex colour is a ratio to the ground under it (1 at the edge: no seam), a little lighter where the dirt is loose. */
function bermGeo(list,drape){const B=BASE,pos=[],uv=[],col=[],idx=[];
  for(const [P,r,cx,cz,ry,[W,H],seed,slide] of list){const O=insetOutline(P,r,.03,B.CORNER_SEG),n=O.length,c=Math.cos(ry),s=Math.sin(ry),base=pos.length/3;
    for(let j=0;j<=B.BERM_RINGS;j++){const t=j/B.BERM_RINGS;
      for(let i=0;i<=n;i++){const o=O[i%n],lx0=o[0]+o[2]*r,lz0=o[1]+o[3]*r,
        wx0=cx+lx0*c+lz0*s,wz0=cz-lx0*s+lz0*c,nwx=o[2]*c+o[3]*s,nwz=-o[2]*s+o[3]*c,a=Math.atan2(nwx,nwz),
        fan=slide==null?0:Math.max(0,Math.cos(a-slide))**3,rag=1-B.BERM_RAG*.5+B.BERM_RAG*vn(Math.cos(a)*3+seed,Math.sin(a)*3,seed),
        w=W*rag+fan*B.BERM_SLIDE[0]*(.8+.4*vn(a*5,seed,seed+1)),d=-.003+t*w,x=wx0+nwx*d,z=wz0+nwz*d,
        hk=(1-t)**1.6,y=B.BERM_EDGE+(H*(.75+.5*vn(x*20,z*20,seed+2))*hk+fan*B.BERM_SLIDE[2]*Math.sin(Math.PI*Math.min(1,t*1.3))*(1-t))+.003*(vn(x*45,z*45,seed+3)-.5)*(1-t);
        pos.push(x,y,z);uv.push(...(drape?[(x-B.MAP[0])/B.MAP[2],(B.MAP[1]+B.MAP[3]-z)/B.MAP[3]]:[x,z]));
        const k=1+B.BERM_DRY*smooth(1,.25,t)*(.6+.4*vn(x*30,z*30,seed+4))-.05*smooth(.6,.85,vn(x*70,z*70,seed+5))*(1-t);col.push(k,k*.99,k*.97)}}
    for(let j=0;j<B.BERM_RINGS;j++){const A=base+j*(n+1),C=A+n+1;for(let i=0;i<n;i++)idx.push(A+i,C+i,A+i+1,A+i+1,C+i,C+i+1)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();
  /* winding: the berm must face up */const ny=g.attributes.normal;let up=0;for(let i=0;i<ny.count;i++)up+=ny.getY(i);
  if(up<0){const a=g.index.array;for(let i=0;i<a.length;i+=3){const t=a[i+1];a[i+1]=a[i+2];a[i+2]=t}g.computeVertexNormals()}return g}

/* round 2: the ground's own material (field map at its uv, the CC0 scans, the watering of the polished field) times the vertex colour;
   null without old:field (the prop viewer): then the shared `dirt` kind is used */
function drapeMat(ctx){try{const old=ctx&&ctx.scene&&ctx.scene.getObjectByName('old:field');if(!old||!old.material||!old.material.colorNode)return null;
  const {attribute,positionWorld,mx_fractal_noise_float:fn,vec3,float,vec4}=TSL,m=old.material.clone();m.name='prop:bases:berm';
  const patch=fn(vec3(positionWorld.xz.mul(.12),3),3,2,.5),wet=float(FIELD.WET).add(patch.mul(FIELD.WET_PATCH));
  const c=old.material.colorNode,rgb=(c.rgb||c).mul(attribute('color','vec3')).mul(wet);m.colorNode=vec4(rgb,1);
  if(old.material.roughnessNode)m.roughnessNode=old.material.roughnessNode.mul(FIELD.WET_ROUGH);
  m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-1;return m}catch(e){console.warn('bases: berm drape off, dirt kind used',e);return null}}

/* slot descriptor (render/props/index.js): painted on the field map before, so there are no old meshes to hide */
export const PROPS=[{name:'bases',build:c=>buildBases(c),old:()=>[]}];
