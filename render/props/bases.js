/* render/props/bases.js: bases, home plate and pitcher's rubber (#215 polish lane, round 1). Polish rounds edit only this file (slot rule #237).
 * Before: no geometry at all. The three bags, the plate and the rubber were white shapes painted into the field map (game.js fieldTex),
 * flat on the dirt, so from the low cameras they had no edge, no thickness and no shadow. Nothing to hide: old() is [].
 * Shape: every piece is one "rounded slab": its outline (square bag, pentagon plate, rectangle rubber) inset by the edge radius, a top
 * that crowns a little, a rolled edge (quarter circle, corners rounded too) and a side wall that sinks just under the dirt.
 *   bags: BAG_H tall, soft rolled edge and a piped welt around the top (the stitched seam of a real bag), contact shadow on the dirt.
 *   plate: nearly flush with the dirt, a narrow bevel; rubber: a low slab on the mound line.
 * Surface: kinds basesVinyl (pebble grain, a soft sheen) and basesRubber (relief basesScuffed: cleat scratches, pits), registered into
 *   pbr.js's KINDS/RELIEFS from this file (pbr.js itself stays read-only, slot rule); UVs in metres.
 * Wear, baked per vertex from seeded noise (same picture every load): dirt specks on the tops, heavier near the edges, a dirt band
 * climbing the sides, cleat scuffs where the runners' feet land on the bags and where the pitcher's foot pushes off the rubber.
 * Frame: world. Bag centres are the engine's BASES (the painted squares are centred there too), plate at home, rubber at RUBBER_Z. */
import * as THREE from 'three/webgpu';
import {BASES} from '../../engine/index.js';
import {mat,KINDS,RELIEFS} from '../pbr.js';

export const BASE={
  BAG_W:.44,BAG_H:.09,BAG_R:.03,BAG_CROWN:.008,WELT_R:.0055,/* bag: side (m, = the painted square), height, edge roll, crown, piping radius */
  PLATE_W:.44,PLATE_H:.014,PLATE_R:.008,PLATE_CROWN:.002,/* home plate: width (= the painted pentagon), top above the dirt, bevel */
  RUBBER_W:.6,RUBBER_D:.15,RUBBER_Z:-18.425,RUBBER_H:.022,RUBBER_R:.008,RUBBER_CROWN:.002,/* pitcher's rubber (= the painted strip) */
  SINK:.012,/* the side wall goes this far under the dirt so no gap shows at grazing angles */
  RINGS:9,EDGE_SEG:5,CORNER_SEG:4,SIDE_M:.04,/* top rings, points per quarter-circle edge, per corner, side subdivision (m) */
  SPECK:.15,EDGE_DIRT:.2,SIDE_DIRT:.32,SCUFF:.22,/* how dark (fraction) dirt specks, edge dirt, the side band and cleat scuffs get */
  SHADOW_K:1.55,SHADOW_A:.55,/* contact shadow: size in bag widths, darkest alpha */
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
const wearFn=(seed,h,feet=[])=>(x,z,y,side)=>{const {SPECK,EDGE_DIRT,SIDE_DIRT,SCUFF}=BASE;
  const sp=smooth(.62,.9,vn(x*90,z*90,seed))*SPECK+smooth(.6,.85,vn(x*25+7,z*25,seed+1))*SPECK*.4,
    sd=side*EDGE_DIRT*(.6+.4*vn(x*40,z*40+y*40,seed+2))+sat(1-y/Math.max(h,.02))**1.5*SIDE_DIRT*side*(.8+.2*vn(x*30,y*60,seed+3));
  let sc=0;for(const [fx,fz,fr] of feet){const d=Math.hypot(x-fx,z-fz)/fr;sc=Math.max(sc,(1-smooth(.3,1,d))*(.5+.5*vn(x*60,z*60,seed+4)))}
  return sp+sd+sc*SCUFF};

/* a soft dark disc on the dirt under a bag: the bag's own contact shadow, so it sits on the ground from the broadcast distance too */
let SHADOW_TEX=null;
function shadowTex(){if(SHADOW_TEX)return SHADOW_TEX;const N=64,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),gr=g.createRadialGradient(N/2,N/2,N*.18,N/2,N/2,N/2);
  gr.addColorStop(0,'rgba(0,0,0,1)');gr.addColorStop(.55,'rgba(0,0,0,.45)');gr.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gr;g.fillRect(0,0,N,N);
  return SHADOW_TEX=new THREE.CanvasTexture(c)}

export function buildBases(){const B=BASE,g=new THREE.Group();g.name='prop:bases';
  const vinyl=mat('basesVinyl').clone(),rub=mat('basesRubber').clone();vinyl.vertexColors=rub.vertexColors=true;
  const shM=new THREE.MeshBasicMaterial({color:0x000000,alphaMap:shadowTex(),transparent:true,opacity:B.SHADOW_A,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const add=(geo,m,x,z,ry)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,0,z);ms.rotation.y=ry;ms.castShadow=ms.receiveShadow=true;g.add(ms);return ms};
  /* bags: square turned 45 degrees (corners on the base paths), welt piping along the top of the rolled edge */
  const hw=B.BAG_W/2,sq=[[-hw,hw],[hw,hw],[hw,-hw],[-hw,-hw]];
  for(let b=1;b<=3;b++){const [x,z]=BASES[b],
    /* cleat scuffs: where the runner's foot lands, on the corners facing the previous and the next base (local frame after the 45 degree turn) */
    feet=[[-hw*.55,hw*.55,.16],[hw*.5,hw*.6,.12],[hw*.3,-hw*.5,.1]].map(([fx,fz,fr])=>[fx*(hash(b,1,7)>.5?1:-1),fz,fr]);
    add(slab(sq,B.BAG_H,B.BAG_R,B.BAG_CROWN,vinyl.userData.tileM||1,wearFn(300+b*17,B.BAG_H,feet)),vinyl,x,z,Math.PI/4);
    const W=insetOutline(sq,B.BAG_R,.03,B.CORNER_SEG),ws=Math.sin(Math.PI/6)*B.BAG_R,wy=B.BAG_H-B.BAG_R+Math.cos(Math.PI/6)*B.BAG_R,
      curve=new THREE.CatmullRomCurve3(W.map(o=>new THREE.Vector3(o[0]+o[2]*ws,wy,o[1]+o[3]*ws)),true,'centripetal');
    const wm=add(new THREE.TubeGeometry(curve,96,B.WELT_R,6,true),vinyl,x,z,Math.PI/4);
    const wg=wm.geometry,wc=new Float32Array(wg.attributes.position.count*3);for(let i=0;i<wg.attributes.position.count;i++){const k=1-.18-.12*vn(i*.37,b,9);wc.set([k,k*.97,k*.92],i*3)}
    wg.setAttribute('color',new THREE.BufferAttribute(wc,3));
    const sh=new THREE.Mesh(new THREE.PlaneGeometry(B.BAG_W*B.SHADOW_K,B.BAG_W*B.SHADOW_K),shM);sh.rotation.set(-Math.PI/2,0,Math.PI/4);sh.position.set(x,.004,z);sh.renderOrder=1;g.add(sh)}
  /* home plate: the painted pentagon (front edge toward the pitcher at -z, point toward the catcher), nearly flush */
  const p=B.PLATE_W/2,plate=[[-p,-p],[-p,0],[0,p],[p,0],[p,-p]];
  add(slab(plate,B.PLATE_H,B.PLATE_R,B.PLATE_CROWN,rub.userData.tileM||1,wearFn(400,B.PLATE_H,[[-.16,.02,.12],[.16,.02,.12],[0,-.2,.1]])),rub,BASES[0][0],BASES[0][1],0);
  /* pitcher's rubber: scuffed in front where the pivot foot pushes off */
  const rw=B.RUBBER_W/2,rd=B.RUBBER_D/2,rr=[[-rw,-rd],[-rw,rd],[rw,rd],[rw,-rd]];
  add(slab(rr,B.RUBBER_H,B.RUBBER_R,B.RUBBER_CROWN,rub.userData.tileM||1,wearFn(500,B.RUBBER_H,[[-.08,-rd,.14],[.1,-rd,.1]])),rub,0,B.RUBBER_Z,0);
  return g}

/* slot descriptor (render/props/index.js): painted on the field map before, so there are no old meshes to hide */
export const PROPS=[{name:'bases',build:()=>buildBases(),old:()=>[]}];
