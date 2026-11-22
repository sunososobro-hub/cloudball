/* render/props/foulpoles.js: the two foul poles (#215 round 1). Polish rounds edit only this file (and add to render/pbr.js).
 * Replaces the old poles (`old:foulpole:-1` left field, `old:foulpole:1` right field: plain 8-sided cylinders, r .18, 18 m tall,
 * standing on the wall line at the ends of the fence arc).
 * Shape: three tapered steel sections joined by bolted flange collars, a base plate with anchor nuts on a concrete footing, a cap
 * with a ball finial, step bolts up the back, and the wing screen on the fair side: a framed wire mesh panel facing home plate
 * (perpendicular to the foul line), from above the wall top to near the top, so the umpire can see the ball pass in front of it.
 * Surface: painted steel in the home team's trim colour (same colour input as #203's PARKS.trim, same night glow as the old poles);
 * vertex colour bakes warning-track dirt at the foot and grime that runs down under each collar. The mesh is see-through
 * (alpha from a drawn wire grid, mipmapped, so from the broadcast camera it reads as a tinted veil, close up as wire).
 * Local frame per pole: origin on the ground at the pole axis, +y up, +x = the wing (toward fair territory), home plate at local z sign -s. */
import * as THREE from 'three/webgpu';
import {mat,box} from '../pbr.js';

export const POLE={A:110*Math.SQRT1_2,/* the old poles' x/z offset (on the wall arc, r 110, at 45 deg) */H:18,R0:.2,R1:.15,SECT:3,SEG:20,
  COLLAR_R:.04,COLLAR_H:.09,BOLTS:8,BASE:.72,BASE_T:.035,FOOT:.95,FOOT_H:.09,CAP_H:.035,BALL_R:.085,
  WING_W:.85,WING_Y0:3.5,WING_Y1:16.6,WING_BAYS:4,TUBE_R:.032,MESH_M:.05,/* wire mesh opening (m) */WIRE:.12,/* wire width as a share of the opening */
  STEP_Y0:2.2,STEP_GAP:.4,STEP_L:.17,STEP_R:.011,STEP_ANG:.5,/* step bolts: alternate +-STEP_ANG rad round the back */
  DIRT_H:1.1,GRIME_L:.9,GRIME:.22,GLOW:.35,MESH_GLOW:.25};

/* pole radius at height y (linear taper over the whole height) */
const rad=y=>POLE.R0+(POLE.R1-POLE.R0)*y/POLE.H;

/* one tapered section [y0,y1], uv in metres, vertex colour: dirt at the foot, grime under the collar at its foot (runs down from y0 of the
   section above, i.e. below each collar) */
function sectionGeo(y0,y1,tileM){const {SEG,DIRT_H,GRIME_L,GRIME,H,SECT}=POLE,h=y1-y0,n=Math.max(4,Math.round(h*4)),g=new THREE.CylinderGeometry(rad(y1),rad(y0),h,SEG,n,true);
  const p=g.attributes.position,uv=g.attributes.uv,col=new Float32Array(p.count*3),c=Math.PI*(rad(y0)+rad(y1));
  for(let i=0;i<p.count;i++){const y=p.getY(i)+h/2+y0,a=Math.atan2(p.getX(i),p.getZ(i));uv.setXY(i,uv.getX(i)*c/tileM,(y-y0)/tileM);
    const dirt=Math.max(0,1-y/DIRT_H)**1.8*(.75+.25*Math.sin(a*3+1)),
      below=[...Array(SECT-1)].map((_,k)=>(k+1)*H/SECT).reduce((m,yc)=>Math.max(m,yc>y&&yc-y<GRIME_L?(1-(yc-y)/GRIME_L)**2*(.6+.4*Math.sin(a*7)**2):0),0),
      k=1-GRIME*below;col.set([k*(1-dirt*.3),k*(1-dirt*.4),k*(1-dirt*.52)],i*3)}
  g.setAttribute('color',new THREE.BufferAttribute(col,3));uv.needsUpdate=true;g.translate(0,y0+h/2,0);return g}

/* the wire grid of the wing screen: alpha only (G channel), one tile = 4 openings */
let meshAlpha;
function wireAlpha(){if(meshAlpha)return meshAlpha;const N=256,cells=4,c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d');
  g.fillStyle='#000';g.fillRect(0,0,N,N);g.fillStyle='#fff';const w=Math.max(2,Math.round(N/cells*POLE.WIRE));
  for(let i=0;i<cells;i++){const o=Math.round(i*N/cells-w/2);g.fillRect(o,0,w,N);g.fillRect(0,o,N,w);if(o<0){g.fillRect(o+N,0,w,N);g.fillRect(0,o+N,N,w)}}
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return meshAlpha=t}

function buildPole(s,M){const {A,H,SECT,COLLAR_R,COLLAR_H,BOLTS,BASE,BASE_T,FOOT,FOOT_H,CAP_H,BALL_R,WING_W,WING_Y0,WING_Y1,WING_BAYS,TUBE_R,MESH_M,
    STEP_Y0,STEP_GAP,STEP_L,STEP_R,STEP_ANG}=POLE;
  const g=new THREE.Group();g.name='prop:foulPole:'+s;g.position.set(s*A,0,-A);g.rotation.y=Math.atan2(Math.SQRT1_2,-s*Math.SQRT1_2);
  const add=(geo,m,x,y,z,cast=true)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.castShadow=cast;ms.receiveShadow=true;g.add(ms);return ms};
  const T=m=>m.userData.tileM||1;
  /* footing, base plate, anchor nuts */
  add(box(FOOT,FOOT_H,FOOT,T(M.conc)),M.conc,0,FOOT_H/2-.02,0);add(box(BASE,BASE_T,BASE,T(M.paint)),M.paint,0,FOOT_H+BASE_T/2-.02,0);
  const nutG=new THREE.CylinderGeometry(.028,.028,.04,6),boltG=new THREE.CylinderGeometry(.012,.012,.07,8);
  for(const x of [-1,1])for(const z of [-1,1]){add(nutG,M.galv,x*BASE*.38,FOOT_H+BASE_T+.0,z*BASE*.38);add(boltG,M.galv,x*BASE*.38,FOOT_H+BASE_T+.02,z*BASE*.38)}
  /* gusset plates at the foot */
  for(let k=0;k<4;k++){const gs=add(new THREE.BoxGeometry(.012,.28,.18),M.paint,0,FOOT_H+BASE_T+.12,0);const a=k*Math.PI/2+Math.PI/4;
    gs.position.x=Math.sin(a)*(POLE.R0+.08);gs.position.z=Math.cos(a)*(POLE.R0+.08);gs.rotation.y=a}
  /* three tapered sections, flange collars with bolts between them */
  for(let k=0;k<SECT;k++)add(sectionGeo(k*H/SECT,(k+1)*H/SECT,T(M.pole)),M.pole,0,0,0);
  const boltH=new THREE.CylinderGeometry(.014,.014,.03,6);
  for(let k=1;k<SECT;k++){const y=k*H/SECT,r=rad(y)+COLLAR_R;add(new THREE.CylinderGeometry(r,r,COLLAR_H,POLE.SEG),M.paint,0,y,0);
    for(let b=0;b<BOLTS;b++){const a=(b+.5)*Math.PI*2/BOLTS;for(const d of [-1,1])add(boltH,M.galv,Math.sin(a)*(r-.018),y+d*(COLLAR_H/2+.012),Math.cos(a)*(r-.018),false)}}
  /* cap plate and ball finial */
  add(new THREE.CylinderGeometry(rad(H)+.02,rad(H)+.02,CAP_H,POLE.SEG),M.paint,0,H+CAP_H/2,0);
  add(new THREE.SphereGeometry(BALL_R,16,10),M.paint,0,H+CAP_H+BALL_R*.85,0);
  /* step bolts up the back (away from home plate: local z sign +s), alternating either side */
  const stepG=new THREE.CylinderGeometry(STEP_R,STEP_R,STEP_L,6);stepG.rotateX(Math.PI/2);stepG.translate(0,0,STEP_L/2);
  const n=Math.floor((H-.6-STEP_Y0)/STEP_GAP),steps=new THREE.InstancedMesh(stepG,M.galv,n),d=new THREE.Object3D();
  for(let i=0;i<n;i++){const y=STEP_Y0+i*STEP_GAP,a=(s>0?0:Math.PI)+(i%2?STEP_ANG:-STEP_ANG),r=rad(y)-.01;
    d.position.set(Math.sin(a)*r,y,Math.cos(a)*r);d.rotation.set(0,a,0);d.updateMatrix();steps.setMatrixAt(i,d.matrix)}
  steps.castShadow=true;g.add(steps);
  /* wing screen: frame tubes (outer upright, top, bottom and bay rails; no diagonals, like the real ones), pole clamps, see-through wire mesh */
  const x0=rad(WING_Y0)-.01,x1=x0+WING_W,ym=(WING_Y0+WING_Y1)/2,hh=WING_Y1-WING_Y0;
  add(new THREE.CylinderGeometry(TUBE_R,TUBE_R,hh,10),M.paint,x1,ym,0);
  for(let b=0;b<=WING_BAYS;b++){const y=WING_Y0+hh*b/WING_BAYS,xa=rad(y),L=x1-xa,t=add(new THREE.CylinderGeometry(TUBE_R*.8,TUBE_R*.8,L,8),M.paint,(xa+x1)/2,y,0);t.rotation.z=Math.PI/2;
    add(new THREE.CylinderGeometry(rad(y)+.025,rad(y)+.025,.12,POLE.SEG),M.paint,0,y,0)}/* clamp band round the pole at each rail */
  const mw=x1-x0,pg=new THREE.PlaneGeometry(mw,hh),uv=pg.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*mw/(MESH_M*4),uv.getY(i)*hh/(MESH_M*4));uv.needsUpdate=true;
  add(pg,M.mesh,x0+mw/2,ym,0,false);
  return g}

/* o: {colors: {pad, trim} of the home park} -> THREE.Group with both poles */
export function buildFoulPoles(o){const {GLOW,MESH_GLOW}=POLE;
  const g=new THREE.Group();g.name='prop:foulPoles';
  const pole=mat('paintedSteel',{relief:'plain',rough:.42,metal:.25}).clone();pole.vertexColors=true;pole.emissiveIntensity=GLOW;
  const paint=mat('paintedSteel',{relief:'plain',rough:.45,metal:.25}).clone();paint.emissiveIntensity=GLOW;
  const meshM=new THREE.MeshStandardMaterial({alphaMap:wireAlpha(),transparent:true,depthWrite:false,side:THREE.DoubleSide,roughness:.5,metalness:.3,emissiveIntensity:MESH_GLOW});
  const M={pole,paint,mesh:meshM,galv:mat('galvSteel'),conc:mat('concrete')};
  for(const s of [-1,1])g.add(buildPole(s,M));
  /* colours from the home park: everything painted takes the trim, with the old poles' glow so they read at night */
  g.userData.recolor=P=>{if(!P)return;const c=new THREE.Color(P.trim);for(const m of [pole,paint,meshM]){m.color.copy(c);m.emissive.copy(c)}};
  g.userData.recolor(o.colors);return g}
