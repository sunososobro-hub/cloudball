/* render/props/towers.js: the six light towers (#215 round 1). Polish rounds edit only this file (#237: round notes here and on the #215 board).
 * Replaces the old masts (`old:towers`: 8-sided cylinders r .8 -> .5, 46 m tall) and the old lamp banks (`old:towers:lamp`: one flat
 * 9 x 4 m glowing box at the top). The light itself (spots, beams, glow sprites, aureole, bugs, motes) stays game.js's: nothing here lights.
 * Shape: concrete footing with base plate, anchor nuts and gussets; a 16-sided tapered tube mast in four sections joined by bolted flange
 * collars; a caged ladder up the back with rest platforms; a cable conduit and a service cabinet at the foot; at the top a headframe of
 * galvanised crossarms (TOW.ROWS rows of TOW.COLS floodlights, each a deep housing with a lens and a top visor, every fixture aimed a
 * little differently), ballast boxes behind each row, and a grated catwalk with a handrail under the frame.
 * Surface: the mast keeps the old mast's painted blue-grey; vertex colour bakes footing dirt and grime runs below each collar.
 * The lenses use the old lamp mesh's own material (game.js's lampMat), so every park sky still sets how bright they burn.
 * Draw calls: all six towers share one merged mesh per material plus three instanced meshes for the fixtures.
 * Round 2 (#215): the headframe stands upright on the mast's front (only the fixtures tilt down, each aimed on its own), so the mast no
 * longer runs up through the middle of the bank; the mast stands TOW.BACK behind the frame, joined by two V yokes, and runs up behind it
 * to a cap. Mast and collars are a lighter, matte blue-grey (round 1 read black and glossy); housings mid grey; visors are galvanised,
 * deeper and wider so they read as hoods. The headframe galvanising rusts (vertex colour: runs under each arm, bloom at every joint),
 * every fixture has a sagging cable back to its ballast box and a fat cable bundle drops from the frame into a junction box on the mast.
 * The ladder's rungs, cage hoops and cage bars (sub-pixel from the stands: they shimmered) sit in a THREE.LOD per tower and drop out
 * beyond TOW.LOD_FAR; the stiles stay. A side walk joins the ladder to the catwalk.
 * Round notes (what still gives it away): see the #215 board. */
import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mat} from '../pbr.js';

export const TOW={SPOTS:[[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]],/* same as game.js */H:46,AIM:[0,0,-45],/* old lamp lookAt */
  R0:.8,R1:.5,SECT:4,SEG:16,COLLAR_R:.07,COLLAR_H:.16,BOLTS:12,
  FOOT_R:1.5,FOOT_H:.55,BASE:1.9,BASE_T:.06,GUSSETS:8,
  LAD_W:.42,LAD_OFF:.22,LAD_Y0:2.6,RUNG:.3,CAGE_Y0:3.2,CAGE_GAP:1.1,CAGE_R:.38,REST:[16,31],
  W:9.4,FH:4.6,ROWS:5,COLS:8,ARM:.09,FIX_R:.27,FIX_L:.42,LENS_IN:.03,VISOR:.85,SPREAD:.12,/* rad of aim spread across the bank */
  WALK_D:1.1,WALK_Y:-.5,/* catwalk depth, height below the frame's lowest arm */RAIL_H:1.05,
  DIRT_H:1.4,GRIME_L:2.2,GRIME:.3,
  BACK:1.4,/* mast axis this far behind the frame (local -z) */TOP_K:.42,/* mast top = H + FH x TOP_K */YOKE:[-1.3,1.2],/* yoke heights from the frame centre */
  LOD_FAR:75,/* m from the tower's middle: beyond this the ladder rungs and cage drop out */
  RUST:[.62,.4,.27],RUST_L:.55,/* rust tint and run length under a headframe arm */CABLE_R:.014,CABLE_SAG:.14,BUNDLE_R:.06};

/* mast radius at height y */
const mastTop=()=>TOW.H+TOW.FH*TOW.TOP_K,rad=y=>TOW.R0+(TOW.R1-TOW.R0)*Math.min(1,y/mastTop());
/* every merged piece carries uv + colour; white unless painted */
function prep(g,col){g=g.index?g.toNonIndexed():g;if(!g.attributes.uv)g.setAttribute('uv',new THREE.BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(!g.attributes.color){const c=new Float32Array(g.attributes.position.count*3).fill(1);g.setAttribute('color',new THREE.BufferAttribute(c,3))}
  for(const k of Object.keys(g.attributes))if(!['position','normal','uv','color'].includes(k))g.deleteAttribute(k);
  if(col){const p=g.attributes.position,c=g.attributes.color;for(let i=0;i<p.count;i++){const k=col(p.getX(i),p.getY(i),p.getZ(i));c.setXYZ(i,k[0],k[1],k[2])}}
  return g}
/* uv in metres on a cylinder */
function cylM(rt,rb,h,seg,tile,open=false,hs=1){const g=new THREE.CylinderGeometry(rt,rb,h,seg,hs,open),uv=g.attributes.uv,c=Math.PI*(rt+rb);
  for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*c/tile,uv.getY(j)*h/tile);return g}
function boxM(w,h,d,tile){const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,F=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++)for(let i=0;i<4;i++){const j=f*4+i;uv.setXY(j,uv.getX(j)*F[f][0]/tile,uv.getY(j)*F[f][1]/tile)}return g}
/* a straight tube from a to b (Vector3s) */
function tube(a,b,r,seg=8,tile=1){const d=b.clone().sub(a),L=d.length(),g=cylM(r,r,L,seg,tile,true);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize()));g.translate((a.x+b.x)/2,(a.y+b.y)/2,(a.z+b.z)/2);return g}
const V=(x,y,z)=>new THREE.Vector3(x,y,z);

/* sagging cable from a to b (Vector3s), radius r */
function cable(a,b,r,sag,seg=6){const m=a.clone().lerp(b,.5);m.y-=sag;const c=new THREE.QuadraticBezierCurve3(a,m,b);return new THREE.TubeGeometry(c,seg,r,5,false)}
/* headframe rust (head-local coords, before the head matrix): runs under each arm row, a bloom at every arm/post joint */
function rustCol(arms,posts){const {RUST,RUST_L}=TOW;return (x,y,z)=>{let r=0;
  for(const ay of arms){const d=ay-y;if(d>0&&d<RUST_L)r=Math.max(r,(1-d/RUST_L)**1.4*Math.max(0,Math.sin(x*11.3+ay*7))**6)}
  for(const px of posts)for(const ay of arms){const q=Math.hypot(x-px,y-ay);if(q<.35)r=Math.max(r,(1-q/.35)*.8)}
  r=Math.min(1,r*.85);return [1+(RUST[0]-1)*r,1+(RUST[1]-1)*r,1+(RUST[2]-1)*r]}}

/* one tower in its own frame: origin at the old mast foot, +y up, local +z faces the field; `head` = the frame centre (a Matrix4: upright, no tilt).
   P.fine = the parts that drop out from far (LOD) */
function towerParts(M,head){const {H,SECT,SEG,COLLAR_R,COLLAR_H,BOLTS,FOOT_R,FOOT_H,BASE,BASE_T,GUSSETS,LAD_W,LAD_OFF,LAD_Y0,RUNG,CAGE_Y0,CAGE_GAP,CAGE_R,REST,
    W,FH,ROWS,COLS,ARM,WALK_D,WALK_Y,RAIL_H,DIRT_H,GRIME_L,GRIME,BACK,YOKE,CABLE_R,CABLE_SAG,BUNDLE_R,FIX_L,SPREAD}=TOW;
  const P={mast:[],paint:[],galv:[],rust:[],conc:[],grate:[],box:[],cable:[],fine:[]},T=m=>M[m].userData.tileM||1,MT=mastTop(),hy=new THREE.Vector3().setFromMatrixPosition(head).y;
  const collarY=[...Array(SECT-1)].map((_,k)=>(k+1)*MT/SECT);
  const mastCol=(x,y,z)=>{z+=BACK;const a=Math.atan2(x,z),dirt=Math.max(0,1-(y-FOOT_H)/DIRT_H)**1.6*(.8+.2*Math.sin(a*5)),
    g=collarY.reduce((m,yc)=>Math.max(m,yc>y&&yc-y<GRIME_L?(1-(yc-y)/GRIME_L)**1.5*Math.max(0,Math.sin(a*9+yc))**3:0),0);
    return [(1-GRIME*g*.75)*(1-dirt*.32),(1-GRIME*g)*(1-dirt*.4),(1-GRIME*g*1.2)*(1-dirt*.5)]};/* grime runs lean rust-brown */
  /* every mast-side part is built round the axis, then moved BACK behind the frame */
  const S={mast:[],paint:[],galv:[],conc:[],grate:[],box:[],fine:[]};
  S.conc.push(prep(cylM(FOOT_R,FOOT_R+.08,FOOT_H,24,T('conc')).translate(0,FOOT_H/2-.05,0)));
  S.paint.push(prep(boxM(BASE,BASE_T,BASE,T('paint')).translate(0,FOOT_H+BASE_T/2-.05,0)));
  for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8,r=BASE*.42;S.galv.push(prep(new THREE.CylinderGeometry(.045,.045,.07,6).translate(Math.sin(a)*r,FOOT_H+BASE_T,Math.cos(a)*r)),
    prep(new THREE.CylinderGeometry(.02,.02,.14,6).translate(Math.sin(a)*r,FOOT_H+BASE_T+.04,Math.cos(a)*r)))}
  for(let i=0;i<GUSSETS;i++){const a=i*Math.PI*2/GUSSETS,g=boxM(.025,.7,.42,T('paint'));g.translate(0,0,TOW.R0+.2);g.rotateY(a);g.translate(0,FOOT_H+BASE_T+.32,0);S.paint.push(prep(g))}
  for(let k=0;k<SECT;k++){const y0=k*MT/SECT+(k?0:FOOT_H),y1=(k+1)*MT/SECT,h=y1-y0,g=cylM(rad(y1),rad(y0),h,SEG,T('mast'),true,Math.round(h*2));g.translate(0,y0+h/2,0);S.mast.push(g)}
  for(const y of collarY){const r=rad(y)+COLLAR_R;S.paint.push(prep(cylM(r,r,COLLAR_H,SEG,T('paint')).translate(0,y,0)));
    for(let b=0;b<BOLTS;b++){const a=(b+.5)*Math.PI*2/BOLTS;for(const d of [-1,1])S.galv.push(prep(new THREE.CylinderGeometry(.022,.022,.05,6).translate(Math.sin(a)*(r-.03),y+d*(COLLAR_H/2+.02),Math.cos(a)*(r-.03))))}}
  S.paint.push(prep(cylM(rad(MT)+.06,rad(MT)+.09,.22,SEG,T('paint')).translate(0,MT+.05,0)));/* top cap */
  S.paint.push(prep(new THREE.ConeGeometry(rad(MT)+.06,.25,SEG).translate(0,MT+.28,0)));
  /* ladder up the back (local -z), caged; stiles always drawn, rungs and cage only near (fine) */
  const walkY=hy-FH/2+WALK_Y,lz=y=>-(rad(y)+LAD_OFF),LT=walkY+RAIL_H;
  for(const s of [-1,1])S.galv.push(prep(tube(V(s*LAD_W/2,LAD_Y0,lz(LAD_Y0)),V(s*LAD_W/2,LT,lz(LT)),.022)));
  for(let y=LAD_Y0+.2;y<walkY;y+=RUNG)S.fine.push(prep(tube(V(-LAD_W/2,y,lz(y)),V(LAD_W/2,y,lz(y)),.014,6)));
  const hoop=new THREE.TorusGeometry(CAGE_R,.016,5,14,Math.PI*1.25);hoop.rotateX(Math.PI/2);hoop.rotateY(Math.PI*.375-Math.PI/2);
  for(let y=CAGE_Y0;y<walkY-.2;y+=CAGE_GAP){const g=hoop.clone();g.translate(0,y,lz(y)-CAGE_R*.55);S.fine.push(prep(g))}
  for(const a of [-.9,-.3,.3,.9])S.fine.push(prep(tube(V(Math.sin(a)*CAGE_R,CAGE_Y0,lz(CAGE_Y0)-CAGE_R*.55-Math.cos(a)*CAGE_R),V(Math.sin(a)*CAGE_R,walkY-.2,lz(walkY-.2)-CAGE_R*.55-Math.cos(a)*CAGE_R),.012,5)));
  for(const y of REST){const r=rad(y);S.grate.push(prep(boxM(1.3,.05,1.1,T('grate')).translate(0,y,-(r+.55))));
    for(const s of [-1,1])S.fine.push(prep(tube(V(s*.65,y,-(r+.05)),V(s*.65,y+RAIL_H,-(r+.05)),.02)),prep(tube(V(s*.65,y+RAIL_H,-(r+.05)),V(s*.65,y+RAIL_H,-(r+1.1)),.02)))}
  /* top landing behind the mast at catwalk height, and a side walk forward to the catwalk */
  const rw=rad(walkY);S.grate.push(prep(boxM(1.6,.05,1.1,T('grate')).translate(0,walkY,-(rw+.55))));
  S.grate.push(prep(boxM(.7,.05,BACK+rw+.6,T('grate')).translate(rw+.4,walkY,(BACK-rw-1.1)/2+.2)));
  for(const z of [-(rw+1.1),BACK-.2]){S.galv.push(prep(tube(V(rw+.75,walkY,z),V(rw+.75,walkY+RAIL_H,z),.025,6)))}
  S.galv.push(prep(tube(V(rw+.75,walkY+RAIL_H,-(rw+1.1)),V(rw+.75,walkY+RAIL_H,BACK-.2),.025,6)));
  /* conduit up the side, cabinet at the foot, junction box on the mast under the frame */
  S.paint.push(prep(tube(V(rad(1)+.06,FOOT_H,0),V(rad(walkY-1)+.06,walkY-1,0),.04,6)));
  S.box.push(prep(boxM(.8,1.3,.4,T('box')).translate(TOW.R0+.75,FOOT_H+.7,.2)));
  const jy=walkY-1.3;S.box.push(prep(boxM(.6,.8,.3,T('box')).translate(0,jy,rad(jy)+.12)));
  for(const k in S)for(const g of S[k]){g.translate(0,0,-BACK);P[k].push(k==='mast'?prep(g,mastCol):g)}
  /* headframe (head-local: upright, centre of the old lamp box, faces +z) */
  const hp=[],hr=[],hb=[],hg=[],hc=[];
  const arms=[...Array(ROWS)].map((_,r)=>-FH/2+FH*r/(ROWS-1)),posts=[-W/2,-W/6,W/6,W/2];
  for(const y of arms)hr.push(tube(V(-W/2,y,-.25),V(W/2,y,-.25),ARM,8));
  for(const x of posts)hr.push(tube(V(x,-FH/2-.2,-.25),V(x,FH/2+.2,-.25),ARM*1.1,8));
  for(let i=0;i<3;i++){const x0=-W/2+i*W/3,x1=x0+W/3;hr.push(tube(V(x0,-FH/2,-.32),V(x1,FH/2,-.32),ARM*.6,6),tube(V(x1,-FH/2,-.32),V(x0,FH/2,-.32),ARM*.6,6))}
  /* V yokes: frame back to the mast front */
  for(const y of YOKE){const mz=-BACK+rad(hy+y)*.8;for(const x of [-W/6,W/6])hp.push(tube(V(x,y,-.3),V(0,y,mz),ARM*1.5,8));hp.push(tube(V(-W/6,y,-.3),V(W/6,y,-.3),ARM*1.5,8))}
  for(const y of arms)for(let c=0;c<4;c++)hb.push(boxM(.55,.38,.32,T('box')).translate(-W/2+W*(c+.5)/4,y,-.62));/* ballast boxes behind the row */
  const wy=-FH/2+WALK_Y;hg.push(boxM(W+.4,.05,WALK_D,T('grate')).translate(0,wy,-.1));
  for(const z of [WALK_D/2-.1,-WALK_D/2-.1])hp.push(tube(V(-W/2-.2,wy+RAIL_H,z),V(W/2+.2,wy+RAIL_H,z),.025,6)),P.fine.push(tube(V(-W/2-.2,wy+RAIL_H/2,z),V(W/2+.2,wy+RAIL_H/2,z),.018,6).applyMatrix4(head));
  for(let i=0;i<=6;i++){const x=-W/2-.2+(W+.4)*i/6;for(const z of [WALK_D/2-.1,-WALK_D/2-.1])hp.push(tube(V(x,wy,z),V(x,wy+RAIL_H,z),.025,6))}
  /* cables: each fixture back to its row's ballast box; a bundle from the frame down to the junction box */
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const u=(c+.5)/COLS-.5,v=r/(ROWS-1)-.5,bx=-W/2+W*(Math.floor(c/2)+.5)/4,y=arms[r];
    hc.push(cable(V(bx+(c%2?.12:-.12),y-.19,-.66),V(u*W*.94,v*FH-.08,-FIX_L*.8),CABLE_R,CABLE_SAG*(.7+.6*Math.abs(Math.sin(r*3.1+c))),5))}
  hc.push(cable(V(-.3,-FH/2-.05,-.5),V(0,jy-hy+.4,-BACK+rad(jy)+.25),BUNDLE_R,.5,10),cable(V(.3,-FH/2-.05,-.5),V(.1,jy-hy+.4,-BACK+rad(jy)+.25),BUNDLE_R*.8,.35,10));
  for(const y of arms)hc.push(tube(V(-W/2+.3,y-.21,-.72),V(W/2-.3,y-.21,-.72),.025,5));/* tray run under each ballast row */
  const rc=rustCol(arms,posts);
  for(const g of hp)P.galv.push(prep(g.applyMatrix4(head)));for(const g of hr)P.rust.push(prep(g,rc).applyMatrix4(head));
  for(const g of hb)P.box.push(prep(g.applyMatrix4(head)));for(const g of hg)P.grate.push(prep(g.applyMatrix4(head)));for(const g of hc)P.cable.push(prep(g.applyMatrix4(head)));
  P.fine=P.fine.map(g=>g.attributes.color?g:prep(g));
  return P}

/* fixture matrices of one tower (world): `frame` = upright frame centre facing the field; every fixture tilts down by `pitch` plus its own spread */
function fixtures(frame,pitch,out){const {ROWS,COLS,W,FH,SPREAD}=TOW,d=new THREE.Object3D(),m=new THREE.Matrix4();let k=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const u=(c+.5)/COLS-.5,v=r/(ROWS-1)-.5,h=Math.sin(r*7.1+c*3.3)*.5;
    d.position.set(u*W*.94,v*FH,0);d.rotation.set(pitch-v*SPREAD*.8+h*.05-.04,-u*SPREAD*1.6+h*.04,0,'YXZ');d.updateMatrix();out.push(m.multiplyMatrices(frame,d.matrix).clone());k++}
  return k}

/* o: {lampMat: the old lamp material} -> THREE.Group with all six towers */
export function buildTowers(o){const {SPOTS,H,AIM,FIX_R,FIX_L,LENS_IN,VISOR,LOD_FAR}=TOW;
  const g=new THREE.Group();g.name='prop:towers';
  const vc=m=>{m=m.clone();m.vertexColors=true;return m};
  const M={mast:vc(mat('paintedSteel',{color:0x9ba4ae,relief:'plain',rough:.74,metal:.1})),paint:mat('paintedSteel',{color:0x9ba4ae,relief:'hammered',rough:.72,metal:.1}),
    galv:mat('galvSteel'),rust:vc(mat('galvSteel',{rough:.6,metal:.7})),conc:mat('concrete'),
    grate:mat('galvSteel',{relief:'lattice',rough:.55}),box:mat('paintedSteel',{color:0x6a6f76,relief:'plain',rough:.6,metal:.3}),
    cable:mat('rubber'),house:mat('paintedSteel',{color:0x4c5259,relief:'hammered',rough:.58,metal:.35}),visor:mat('galvSteel',{rough:.55,metal:.8})};
  const lens=o.lampMat||new THREE.MeshBasicMaterial({color:new THREE.Color(5,4.8,4.4),toneMapped:false});
  const all={mast:[],paint:[],galv:[],rust:[],conc:[],grate:[],box:[],cable:[]},fx=[];
  for(const [x,z] of SPOTS){
    /* the ladder faces away from the field: local -z points away from the aim point */
    const yaw=Math.atan2(AIM[0]-x,AIM[2]-z),W=new THREE.Matrix4().makeTranslation(x,0,z).multiply(new THREE.Matrix4().makeRotationY(yaw));
    const P=towerParts(M,new THREE.Matrix4().makeTranslation(0,H,0));
    for(const k in all)for(const q of P[k])all[k].push(q.applyMatrix4(W));
    /* near-only parts of this tower: one LOD centred mid-mast */
    const lod=new THREE.LOD(),mid=new THREE.Vector3(x,H*.6,z),fm=new THREE.Mesh(mergeGeometries(P.fine.map(q=>q.applyMatrix4(W))),M.galv);
    fm.position.copy(mid).negate();fm.name='prop:towers:fine';lod.position.copy(mid);lod.addLevel(fm,0);lod.addLevel(new THREE.Object3D(),LOD_FAR);lod.name='prop:towers:lod';g.add(lod);
    fixtures(new THREE.Matrix4().makeTranslation(x,H,z).multiply(new THREE.Matrix4().makeRotationY(yaw)),Math.atan2(H-AIM[1],Math.hypot(AIM[0]-x,AIM[2]-z)),fx)}
  for(const k in all)if(all[k].length){const ms=new THREE.Mesh(mergeGeometries(all[k]),M[k]);ms.name='prop:towers:'+k;ms.receiveShadow=true;g.add(ms)}
  /* fixtures: housing (deep can, open at the front), lens disc set back in it, visor hood over the top */
  const houseG=new THREE.CylinderGeometry(FIX_R,FIX_R*.72,FIX_L,14,1,true);houseG.rotateX(Math.PI/2);houseG.translate(0,0,-FIX_L/2);
  const backG=new THREE.CircleGeometry(FIX_R*.72,14);backG.rotateY(Math.PI);backG.translate(0,0,-FIX_L);
  const yokeG=new THREE.TorusGeometry(FIX_R*1.06,.018,4,12,Math.PI);yokeG.rotateZ(Math.PI);yokeG.rotateY(Math.PI/2);yokeG.translate(0,0,-FIX_L*.45);/* trunnion under the can */
  const house=mergeGeometries([prep(houseG),prep(backG),prep(yokeG)]);
  const lensG=new THREE.CircleGeometry(FIX_R*.94,16);lensG.translate(0,0,-LENS_IN);
  const VL=FIX_R*VISOR*2.2,visG=new THREE.CylinderGeometry(FIX_R*1.06,FIX_R*1.1,VL,16,1,true,-Math.PI/2*1.3,Math.PI*1.3);visG.rotateX(Math.PI/2);visG.translate(0,0,VL/2-.03);
  const inst=(geo,m,name)=>{const im=new THREE.InstancedMesh(geo,m,fx.length);fx.forEach((x,i)=>im.setMatrixAt(i,x));im.name=name;im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();g.add(im);return im};
  const houseM=M.house.clone();houseM.side=THREE.DoubleSide;const visM=M.visor.clone();visM.side=THREE.DoubleSide;
  inst(house,houseM,'prop:towers:house');inst(lensG,lens,'prop:towers:lens');inst(visG,visM,'prop:towers:visor');
  return g}

/* slot descriptor (#237): masts (old:towers) and lamp heads (old:towers:lamp); the lenses take the old lamp heads' material */
export const PROPS=[{name:'towers',build:c=>{const L=c.old('towers').filter(o=>o.name==='old:towers:lamp');return buildTowers({lampMat:L[0]&&L[0].material})},old:c=>c.old('towers')}];
