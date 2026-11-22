/* render/props/seats.js: seats, rails and aisles of every stand (#215 slot; rounds 1-2). Polish rounds edit only this file (slot rule #237);
 * round notes go here and on the #215 board.
 * Replaces game.js's flat seat (two boxes per seat, the instanced `old:seats:chair`) and the front rail of each stand (one painted box, `old:seats:rail`).
 * The stepped rows (`old:seats`) and back walls (`old:seats:back`) stay game.js's: nosings and end walls are added on them, not swapped.
 * The people in the seats are not touched (no fans' geometry): the new seats reuse the old seats' instance matrices and colours one for one,
 * so every person still sits in the same place, and the seats the crowd density leaves empty are the same ones.
 * Shape: a moulded plastic shell (seat pan dished, front lip rolled down, back curved and leaning back, real thickness), on a painted steel
 *   standard bolted to the tread (leg, pivot arm under the pan, armrest with a dark cap; one per seat, the neighbour's covers the other side).
 *   Seat pan and back are two mouldings with a hinge gap (a folding bottom, shown down; empty seats are not known here, the crowd is game.js's).
 *   Front rail: steel parapet panel with a rolled top and a vinyl pad on its field face (home park pad colour), posts and a tube handrail
 *   at the old rail height, a kick plate at the foot.
 * Round 1 notes (still gives it away): no aisle stairs inside a stand (every seat column has a person, and the fans are not touched),
 *   no seat numbers, scuffs or fade on the shells, empty seats are not folded up, little change at broadcast distance.
 *   Rows: a steel nosing strip on the front edge of every tread. Ends: a sloped concrete end wall following the rake, with a handrail on it.
 * Round 2: empty seats are folded up. Who sits where is read from the crowd's head instances (one per drawn person, same x/z as its seat;
 *   the crowd itself is not touched); a seat with no head on it shows its pan swung up against the back (FOLD rad about the pivot).
 *   Re-read when the drawn crowd count changes, and once a second while no crowd is found yet (all pans down meanwhile).
 *   Cup holder on every standard (ring under the armrest's front end), seat-number tag on the back's top edge
 *   (a pale plate, no digits: they never read past 5 m), nosings painted matte (no metal: they flared under the tower lamps).
 * Round 2 notes (still gives it away): no aisle stairs (the fans are not touched), shells have no scuffs or texture (extrude uvs),
 *   folded seats only change ~1 seat in 10 at broadcast distance, no row letters on the end walls.
 * Frame: seat local = old seat local (person faces +z, origin on the tread); rail local = old rail box local (centre of the box). */
import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mat,box,cyl} from '../pbr.js';

export const SEATS={W:.44,/* shell width (m), seat pitch is .55 */TH:.022,/* shell thickness */
  SHELL_C:0x1d4f8f,SHELL_ROUGH:.38,FRAME_C:0x2a2f38,CAP_C:0x16181c,
  ARM_Y:.6,ARM_X:-.265,/* armrest height and side (left of the person; the neighbour's arm is on the right) */
  PANEL_H:.86,TUBE_R:.034,POST_R:.024,POST_M:1.5,HAND_R:.024,KICK_H:.12,
  FOLD:-1.62,/* empty seat: pan swung up about the pivot (rad about seat-local x) */PIV_Z:-.13,PIV_Y:.42,MATCH_MIN:.5,/* share of heads that must land on a seat */
  RECHECK_MS:1000,
  PAD_H:.46,PAD_T:.07,NOSE_H:.045,NOSE_D:.06,END_T:.2,END_UP:.35,/* end wall thickness and height above the treads */ROW_D:.9,ROW_RISE:.55};

/* shell centreline in the seat's own (z forward, y up) plane, front lip to the top of the back */
const LINE=[[.215,.37],[.21,.415],[.18,.44],[.1,.445],[0,.437],[-.1,.432],[-.17,.44],[-.215,.47],[-.24,.53],[-.255,.62],[-.27,.72],[-.285,.82],[-.295,.87]];
function moulding(pts){const {W,TH}=SEATS,P=pts.map(([z,y])=>new THREE.Vector2(z,y)),up=[],dn=[];
  for(let i=0;i<P.length;i++){const a=P[Math.max(0,i-1)],b=P[Math.min(P.length-1,i+1)],t=b.clone().sub(a).normalize(),n=new THREE.Vector2(-t.y,t.x);
    up.push(P[i].clone().addScaledVector(n,TH/2));dn.push(P[i].clone().addScaledVector(n,-TH/2))}
  const sh=new THREE.Shape([...up,...dn.reverse()]);
  const g=new THREE.ExtrudeGeometry(sh,{depth:W-.03,bevelEnabled:true,bevelThickness:.015,bevelSize:.008,bevelSegments:2,curveSegments:4});
  /* shape (s=z, t=y), extruded along e -> seat local (x=-e, y=t, z=s); a proper rotation, so the winding stays outward */
  const m=new THREE.Matrix4().set(0,0,-1,0, 0,1,0,0, 1,0,0,0, 0,0,0,1);g.applyMatrix4(m);g.translate((W-.03)/2,0,0);
  /* the pan sags a little in the middle of the width (moulded dish) */
  const p=g.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i);if(z>-.2)p.setY(i,p.getY(i)-.012*(1-(2*x/W)**2)*Math.max(0,1-Math.abs(z)/.22))}
  g.computeVertexNormals();return g.index?g.toNonIndexed():g}
/* folding bottom: the pan (front lip to its pivot) and the back are separate mouldings with a hinge gap between them */
const panGeo=up=>{const g=moulding(LINE.slice(0,7));if(up){g.translate(0,-SEATS.PIV_Y,-SEATS.PIV_Z);g.rotateX(SEATS.FOLD);g.translate(0,SEATS.PIV_Y,SEATS.PIV_Z)}return g};
/* seat-number tag: a small pale plate on the top edge of the back, facing the row behind */
const tagGeo=()=>{const [z,y]=LINE[LINE.length-2],g=new THREE.BoxGeometry(.07,.035,.006);g.rotateX(-.25);g.translate(0,y-.01,z-.016);return g.toNonIndexed()};
const shellGeo=up=>mergeGeometries([panGeo(up),moulding(LINE.slice(8))]);

function at(g,x,y,z,rx=0,ry=0,rz=0){g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);return g}
/* standard: leg from the tread to the pan pivot, foot plate, pivot arm under the pan, armrest post and bar (bar cap is a separate material) */
function frameGeo(){const {ARM_X:X,ARM_Y:Y}=SEATS,t=.4;return mergeGeometries([
  at(box(.09,.012,.16,t),X,.006,-.05),/* foot plate bolted to the tread */
  at(box(.035,.4,.05,t),X,.2,-.06,0,0,0),/* leg */
  at(box(.03,.035,.3,t),X,.4,-.04),/* pivot arm under the pan */
  at(cyl(.018,.018,.05,8,t),X+.03,.41,-.06,0,0,Math.PI/2),/* pivot boss */
  at(box(.03,.24,.035,t),X,.5,-.16,.12),/* armrest post, raked like the back */
  at(cyl(.008,.008,.012,6,t),X+.03,.012,-.1),at(cyl(.008,.008,.012,6,t),X+.03,.012,0),/* anchor bolts */
  at(box(.02,.02,.07,t),X,.565,.17),/* cup holder bracket under the armrest's front end (the row behind sits .55 m higher: no room on the back) */
  at(cyl(.042,.036,.07,10,t,true),X,.55,.24),at(cyl(.036,.036,.006,10,t),X,.518,.24),/* cup holder ring and its floor */
].map(g=>g.index?g.toNonIndexed():g))}
function capGeo(){const {ARM_X:X,ARM_Y:Y}=SEATS;const g=box(.045,.03,.3,.4);/* moulded armrest cap, rounded front */
  const e=cyl(.0225,.0225,.045,10,.4);e.rotateZ(Math.PI/2);e.translate(0,0,.15);
  const m=mergeGeometries([g.toNonIndexed(),e.toNonIndexed()]);m.translate(X,Y,-.06);return m}

/* instanced copy of the old seats: same count, same matrices, same per-seat colours (the shells are re-filled by fold() below) */
function instanced(geo,m,old,colors){const n=old.count,I=new THREE.InstancedMesh(geo,m,n);I.instanceMatrix.array.set(old.instanceMatrix.array.subarray(0,n*16));
  I.instanceMatrix.needsUpdate=true;if(colors&&old.instanceColor){I.instanceColor=old.instanceColor.clone();I.instanceColor.needsUpdate=true}
  old.updateWorldMatrix(true,false);I.matrixAutoUpdate=false;I.matrix.copy(old.matrixWorld);I.castShadow=old.castShadow;I.receiveShadow=true;I.frustumCulled=false;return I}

/* front rail + row nosings + end walls of one stand, in the old rail box's local frame (row boxes found beside it in the stand group) */
function standParts(rail,M){const {PANEL_H,TUBE_R,POST_R,POST_M,HAND_R,KICK_H,NOSE_H,NOSE_D,END_T,END_UP}=SEATS,P=rail.geometry.parameters,L=P.width,H=P.height,y0=-H/2,
  g=new THREE.Group(),steel=[],galv=[],conc=[],nose=[];
  steel.push(at(box(L,PANEL_H-TUBE_R,.05,M.steel.userData.tileM),0,y0+(PANEL_H-TUBE_R)/2,-.03));/* parapet panel */
  steel.push(at(cyl(TUBE_R,TUBE_R,L,14,M.steel.userData.tileM),0,y0+PANEL_H,-.03,0,0,Math.PI/2));/* rolled top */
  conc.push(at(box(L,KICK_H,.16,M.conc.userData.tileM),0,y0+KICK_H/2,-.01));/* kick plate */
  const n=Math.max(2,Math.round(L/POST_M));for(let i=0;i<=n;i++){const x=-L/2+.06+(L-.12)*i/n;
    galv.push(at(cyl(POST_R,POST_R,H-PANEL_H,8,.5),x,y0+PANEL_H+(H-PANEL_H)/2,-.03));
    steel.push(at(box(.09,PANEL_H-.05,.012,.5),x,y0+(PANEL_H-.05)/2,.002))}/* panel stiffener behind each post */
  galv.push(at(cyl(HAND_R,HAND_R,L+.04,14,.5),0,y0+H,-.03,0,0,Math.PI/2));/* handrail */
  const pad=new THREE.Mesh(box(L-.04,SEATS.PAD_H,SEATS.PAD_T,M.pad.userData.tileM),M.pad);/* vinyl pad on the field face of the parapet */
  pad.position.set(0,y0+PANEL_H-TUBE_R-SEATS.PAD_H/2-.01,-.055-SEATS.PAD_T/2);pad.castShadow=pad.receiveShadow=true;pad.userData.pad=true;g.add(pad);
  /* rows: the stepped boxes of the same stand (depth = one row) */
  const rows=rail.parent?rail.parent.children.filter(o=>o.isMesh&&o.geometry.type==='BoxGeometry'&&Math.abs(o.geometry.parameters.depth-SEATS.ROW_D)<.02&&Math.abs(o.geometry.parameters.width-L)<.01):[];
  const ry=rail.position.y,rz=rail.position.z;let topY=0,backZ=0,frontZ=0,botY=0;
  rows.forEach((b,i)=>{const h=b.geometry.parameters.height,yT=b.position.y+h/2-ry,zF=b.position.z-SEATS.ROW_D/2-rz;
    nose.push(at(box(L,NOSE_H,NOSE_D,.5),0,yT-NOSE_H/2+.004,zF+NOSE_D/2-.006));/* tread nosing: worn, dull aluminium (a bright metal flared in the lamp light) */
    if(i===0){frontZ=zF;botY=yT}topY=Math.max(topY,yT);backZ=Math.max(backZ,zF+SEATS.ROW_D)});
  if(rows.length){/* sloped end walls: a prism from the front row up the rake to the back wall, with a handrail on top */
    const run=backZ-frontZ,rise=topY-botY,len=Math.hypot(run,rise),ang=Math.atan2(rise,run);
    for(const s of [-1,1]){const x=s*(L/2+END_T/2),w=box(END_T,END_UP+.3,len,M.conc.userData.tileM);w.rotateX(-ang);
      w.translate(x,botY+rise/2+END_UP/2-.15,frontZ+run/2);conc.push(w);
      const fw=box(END_T,botY-y0+END_UP,.3,M.conc.userData.tileM);fw.translate(x,y0+(botY-y0+END_UP)/2,frontZ+.15);conc.push(fw);/* the wall's foot down to the field side */
      const hr=cyl(HAND_R,HAND_R,len,10,.5);hr.rotateX(Math.PI/2-ang);hr.translate(s*(L/2-.05),botY+rise/2+.9,frontZ+run/2);galv.push(hr);
      for(let k=0;k<=3;k++){const u=k/3,p=cyl(POST_R*.8,POST_R*.8,.9,6,.5);p.translate(s*(L/2-.05),botY+rise*u+.45,frontZ+run*u);galv.push(p)}}}
  for(const [arr,m] of [[steel,M.steel],[galv,M.galv],[conc,M.conc],[nose,M.nose]])if(arr.length){const me=new THREE.Mesh(mergeGeometries(arr.map(q=>q.index?q.toNonIndexed():q)),m);me.castShadow=me.receiveShadow=true;g.add(me)}
  rail.updateWorldMatrix(true,false);g.matrixAutoUpdate=false;g.matrix.copy(rail.matrixWorld);return g}

export function oldSeats(scene){const a=[];scene.traverse(o=>{if(o.name==='old:seats:chair'||o.name==='old:seats:rail')a.push(o)});return a}

/* old: the meshes oldSeats() found. Returns the group standing where they stood. */
/* empty seats fold up: heads = the crowd's head instances (sphere geometry, one per drawn person, translation = the seat's x/z) */
const findHeads=scene=>{let h=null;scene&&scene.traverse(o=>{if(!h&&o.isInstancedMesh&&o.geometry.type==='SphereGeometry'&&o.count>50)h=o});return h};
const key=(x,z)=>Math.round(x*20)+','+Math.round(z*20);
export function foldSplit(seatM,n,headM,hn){/* -> occupied flags per seat, or null when the heads do not land on these seats */
  const S=new Map();for(let i=0;i<n;i++)S.set(key(seatM[i*16+12],seatM[i*16+14]),i);
  const occ=new Uint8Array(n);let hit=0;for(let j=0;j<hn;j++){const i=S.get(key(headM[j*16+12],headM[j*16+14]));if(i!==undefined&&!occ[i]){occ[i]=1;hit++}}
  return hn>0&&hit>=hn*SEATS.MATCH_MIN?occ:null}
function folder(old,dn,up,scene){const n=old.count,src=old.instanceMatrix.array,cs=old.instanceColor&&old.instanceColor.array;let heads=null,last=-1,tried=-Infinity;
  const fill=occ=>{let a=0,b=0;for(let i=0;i<n;i++){const T=!occ||occ[i]?dn:up,k=T===dn?a++:b++;
      T.instanceMatrix.array.set(src.subarray(i*16,i*16+16),k*16);if(cs&&T.instanceColor)T.instanceColor.array.set(cs.subarray(i*3,i*3+3),k*3)}
    dn.count=a;up.count=b;for(const T of [dn,up]){T.instanceMatrix.needsUpdate=true;if(T.instanceColor)T.instanceColor.needsUpdate=true}};
  dn.onBeforeRender=()=>{const now=performance.now();if(!heads&&now-tried<SEATS.RECHECK_MS)return;
    if(!heads){tried=now;const h=findHeads(scene);if(!h)return;const occ=foldSplit(src,n,h.instanceMatrix.array,h.count);if(!occ)return;heads=h;last=h.count;fill(occ);return}
    if(heads.count!==last){last=heads.count;fill(foldSplit(src,n,heads.instanceMatrix.array,heads.count))}};
  fill(null)}

export function buildSeats({old=[],colors={},scene=null}={}){const g=new THREE.Group();g.name='seats';
  const M={shell:mat('gloss',{color:SEATS.SHELL_C,rough:SEATS.SHELL_ROUGH}),frame:mat('paintedSteel',{color:SEATS.FRAME_C}),cap:mat('rubber',{color:SEATS.CAP_C}),
    steel:mat('paintedSteel'),galv:mat('galvSteel'),conc:mat('concrete',{color:0x5a5f6a}),nose:mat('paintedSteel',{color:0x6a6e74,rough:.9,metal:0}),tag:mat('paintedSteel',{color:0xd8d4c8,rough:.6,metal:.2}),
    pad:mat('vinylPad',colors.pad!==undefined?{color:colors.pad}:{})};
  for(const o of old){
    if(o.name==='old:seats:chair'&&o.isInstancedMesh){const dn=instanced(shellGeo(false),M.shell,o,true),up=instanced(shellGeo(true),M.shell,o,true);up.count=0;
      g.add(dn,up,instanced(frameGeo(),M.frame,o,false),instanced(capGeo(),M.cap,o,false),instanced(tagGeo(),M.tag,o,false));folder(o,dn,up,scene)}
    else if(o.name==='old:seats:rail'&&o.isMesh)g.add(standParts(o,M))}
  if(!g.children.length)throw new Error('seats: no old seats or rails found');
  g.userData.recolor=p=>{if(!p||p.pad===undefined)return;const m=mat('vinylPad',{color:p.pad});g.traverse(o=>{if(o.userData.pad)o.material=m})};
  return g}

export const PROPS=[{name:'seats',build:c=>buildSeats({old:oldSeats(c.scene),colors:c.park(),scene:c.scene}),old:c=>oldSeats(c.scene)}];
