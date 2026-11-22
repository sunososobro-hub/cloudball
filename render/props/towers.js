/* render/props/towers.js: the six light towers (#215 round 1). Polish rounds edit only this file.
 * Replaces the old masts (`old:tower:mast`: 8-sided cylinders r .8 -> .5, 46 m tall) and the old lamp banks (`old:tower:lamp`: one flat
 * 9 x 4 m glowing box at the top). The light itself (spots, beams, glow sprites, aureole, bugs, motes) stays game.js's: nothing here lights.
 * Shape: concrete footing with base plate, anchor nuts and gussets; a 16-sided tapered tube mast in four sections joined by bolted flange
 * collars; a caged ladder up the back with rest platforms; a cable conduit and a service cabinet at the foot; at the top a headframe of
 * galvanised crossarms (TOW.ROWS rows of TOW.COLS floodlights, each a deep housing with a lens and a top visor, every fixture aimed a
 * little differently), ballast boxes behind each row, and a grated catwalk with a handrail under the frame.
 * Surface: the mast keeps the old mast's painted blue-grey; vertex colour bakes footing dirt and grime runs below each collar.
 * The lenses use the old lamp mesh's own material (game.js's lampMat), so every park sky still sets how bright they burn.
 * Draw calls: all six towers share one merged mesh per material plus three instanced meshes for the fixtures.
 * Round notes (what still gives it away): see the #215 board. */
import * as THREE from 'three/webgpu';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {mat} from '../pbr.js';

export const TOW={SPOTS:[[-62,10],[62,10],[-100,-70],[100,-70],[-55,-135],[55,-135]],/* same as game.js */H:46,AIM:[0,0,-45],/* old lamp lookAt */
  R0:.8,R1:.5,SECT:4,SEG:16,COLLAR_R:.07,COLLAR_H:.16,BOLTS:12,
  FOOT_R:1.5,FOOT_H:.55,BASE:1.9,BASE_T:.06,GUSSETS:8,
  LAD_W:.42,LAD_OFF:.22,LAD_Y0:2.6,RUNG:.3,CAGE_Y0:3.2,CAGE_GAP:1.1,CAGE_R:.38,REST:[16,31],
  W:9.4,FH:4.6,ROWS:5,COLS:8,ARM:.09,FIX_R:.27,FIX_L:.42,LENS_IN:.03,VISOR:.5,SPREAD:.12,/* rad of aim spread across the bank */
  WALK_D:1.1,WALK_Y:-.5,/* catwalk depth, height below the frame's lowest arm */RAIL_H:1.05,
  DIRT_H:1.4,GRIME_L:2.2,GRIME:.3};

/* mast radius at height y */
const rad=y=>TOW.R0+(TOW.R1-TOW.R0)*y/TOW.H;
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

/* one tower in its own frame: origin at the mast foot, +y up, the headframe faces local +z after `head` (a Matrix4 for the top) */
function towerParts(M,head){const {H,SECT,SEG,COLLAR_R,COLLAR_H,BOLTS,FOOT_R,FOOT_H,BASE,BASE_T,GUSSETS,LAD_W,LAD_OFF,LAD_Y0,RUNG,CAGE_Y0,CAGE_GAP,CAGE_R,REST,
    W,FH,ROWS,ARM,WALK_D,WALK_Y,RAIL_H,DIRT_H,GRIME_L,GRIME}=TOW;
  const P={mast:[],paint:[],galv:[],conc:[],grate:[],box:[]},T=m=>M[m].userData.tileM||1;
  const collarY=[...Array(SECT-1)].map((_,k)=>(k+1)*H/SECT);
  const mastCol=(x,y,z)=>{const a=Math.atan2(x,z),dirt=Math.max(0,1-(y-FOOT_H)/DIRT_H)**1.6*(.8+.2*Math.sin(a*5)),
    g=collarY.reduce((m,yc)=>Math.max(m,yc>y&&yc-y<GRIME_L?(1-(yc-y)/GRIME_L)**1.5*Math.max(0,Math.sin(a*9+yc))**3:0),0),k=1-GRIME*g;
    return [k*(1-dirt*.32),k*(1-dirt*.4),k*(1-dirt*.5)]};
  /* footing, base plate, nuts, gussets */
  P.conc.push(prep(cylM(FOOT_R,FOOT_R+.08,FOOT_H,24,T('conc')).translate(0,FOOT_H/2-.05,0)));
  P.paint.push(prep(boxM(BASE,BASE_T,BASE,T('paint')).translate(0,FOOT_H+BASE_T/2-.05,0)));
  for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8,r=BASE*.42;P.galv.push(prep(new THREE.CylinderGeometry(.045,.045,.07,6).translate(Math.sin(a)*r,FOOT_H+BASE_T,Math.cos(a)*r)),
    prep(new THREE.CylinderGeometry(.02,.02,.14,6).translate(Math.sin(a)*r,FOOT_H+BASE_T+.04,Math.cos(a)*r)))}
  for(let i=0;i<GUSSETS;i++){const a=i*Math.PI*2/GUSSETS,g=boxM(.025,.7,.42,T('paint'));g.translate(0,0,TOW.R0+.2);g.rotateY(a);g.translate(0,FOOT_H+BASE_T+.32,0);P.paint.push(prep(g))}
  /* mast sections, collars and bolts */
  for(let k=0;k<SECT;k++){const y0=k*H/SECT+(k?0:FOOT_H),y1=(k+1)*H/SECT,h=y1-y0,g=cylM(rad(y1),rad(y0),h,SEG,T('mast'),true,Math.round(h*2));g.translate(0,y0+h/2,0);P.mast.push(prep(g,mastCol))}
  for(const y of collarY){const r=rad(y)+COLLAR_R;P.paint.push(prep(cylM(r,r,COLLAR_H,SEG,T('paint')).translate(0,y,0)));
    for(let b=0;b<BOLTS;b++){const a=(b+.5)*Math.PI*2/BOLTS;for(const d of [-1,1])P.galv.push(prep(new THREE.CylinderGeometry(.022,.022,.05,6).translate(Math.sin(a)*(r-.03),y+d*(COLLAR_H/2+.02),Math.cos(a)*(r-.03))))}}
  P.paint.push(prep(cylM(rad(H)+.05,rad(H)+.05,.12,SEG,T('paint')).translate(0,H-2.6,0)));/* cap ring under the headframe */
  /* ladder up the back (local -z, away from the field), caged; two rest platforms */
  const lz=y=>-(rad(y)+LAD_OFF);
  for(const s of [-1,1])P.galv.push(prep(tube(V(s*LAD_W/2,LAD_Y0,lz(LAD_Y0)),V(s*LAD_W/2,H-2.4,lz(H-2.4)),.022)));
  for(let y=LAD_Y0+.2;y<H-2.6;y+=RUNG)P.galv.push(prep(tube(V(-LAD_W/2,y,lz(y)),V(LAD_W/2,y,lz(y)),.014,6)));
  const hoop=new THREE.TorusGeometry(CAGE_R,.016,5,14,Math.PI*1.25);hoop.rotateX(Math.PI/2);hoop.rotateY(Math.PI*.375-Math.PI/2);
  for(let y=CAGE_Y0;y<H-2.8;y+=CAGE_GAP){const g=hoop.clone();g.translate(0,y,lz(y)-CAGE_R*.55);P.galv.push(prep(g))}
  for(const a of [-.9,-.3,.3,.9])P.galv.push(prep(tube(V(Math.sin(a)*CAGE_R,CAGE_Y0,lz(CAGE_Y0)-CAGE_R*.55-Math.cos(a)*CAGE_R),V(Math.sin(a)*CAGE_R,H-2.8,lz(H-2.8)-CAGE_R*.55-Math.cos(a)*CAGE_R),.012,5)));
  for(const y of REST){const r=rad(y);P.grate.push(prep(boxM(1.3,.05,1.1,T('grate')).translate(0,y,-(r+.55))));
    for(const s of [-1,1])P.galv.push(prep(tube(V(s*.65,y,-(r+.05)),V(s*.65,y+RAIL_H,-(r+.05)),.02)),prep(tube(V(s*.65,y+RAIL_H,-(r+.05)),V(s*.65,y+RAIL_H,-(r+1.1)),.02)))}
  /* conduit up the side, cabinet at the foot */
  P.paint.push(prep(tube(V(rad(1)+.06,FOOT_H,0),V(rad(H-3)+.06,H-3,0),.04,6)));
  P.box.push(prep(boxM(.8,1.3,.4,T('box')).translate(TOW.R0+.75,FOOT_H+.7,.2)));
  /* headframe (local to `head`: centre of the old lamp box, faces +z) */
  const hp=[],hb=[],hg=[];
  const arms=[...Array(ROWS)].map((_,r)=>-FH/2+FH*r/(ROWS-1));
  for(const y of arms)hp.push(tube(V(-W/2,y,-.25),V(W/2,y,-.25),ARM,8));
  for(const x of [-W/2,-W/6,W/6,W/2])hp.push(tube(V(x,-FH/2-.2,-.25),V(x,FH/2+.2,-.25),ARM*1.1,8));
  for(let i=0;i<3;i++){const x0=-W/2+i*W/3,x1=x0+W/3;hp.push(tube(V(x0,-FH/2,-.32),V(x1,FH/2,-.32),ARM*.6,6),tube(V(x1,-FH/2,-.32),V(x0,FH/2,-.32),ARM*.6,6))}
  hp.push(tube(V(0,-FH/2-.2,-.25),V(0,-FH/2-2.4,-.25-.6),.32,12));/* mast head stub into the frame */
  for(const y of arms)for(let c=0;c<4;c++)hb.push(boxM(.55,.38,.32,T('box')).translate(-W/2+W*(c+.5)/4,y,-.62));/* ballast boxes behind the row */
  const wy=-FH/2+WALK_Y;hg.push(boxM(W+.4,.05,WALK_D,T('grate')).translate(0,wy,-.1));
  for(const z of [WALK_D/2-.1,-WALK_D/2-.1])hp.push(tube(V(-W/2-.2,wy+RAIL_H,z),V(W/2+.2,wy+RAIL_H,z),.025,6),tube(V(-W/2-.2,wy+RAIL_H/2,z),V(W/2+.2,wy+RAIL_H/2,z),.018,6));
  for(let i=0;i<=6;i++){const x=-W/2-.2+(W+.4)*i/6;for(const z of [WALK_D/2-.1,-WALK_D/2-.1])hp.push(tube(V(x,wy,z),V(x,wy+RAIL_H,z),.025,6))}
  for(const g of hp)P.galv.push(prep(g.applyMatrix4(head)));for(const g of hb)P.box.push(prep(g.applyMatrix4(head)));for(const g of hg)P.grate.push(prep(g.applyMatrix4(head)));
  return P}

/* fixture matrices of one tower (world), for the instanced housings, lenses and visors */
function fixtures(world,out){const {ROWS,COLS,W,FH,SPREAD}=TOW,d=new THREE.Object3D(),m=new THREE.Matrix4();let k=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){const u=(c+.5)/COLS-.5,v=r/(ROWS-1)-.5,h=Math.sin(r*7.1+c*3.3)*.5;
    d.position.set(u*W*.94,v*FH,0);d.rotation.set(-v*SPREAD*.8+h*.05-.04,-u*SPREAD*1.6+h*.04,0,'YXZ');d.updateMatrix();out.push(m.multiplyMatrices(world,d.matrix).clone());k++}
  return k}

/* o: {old: {masts, lamps} (old meshes), lampMat: the old lamp material} -> THREE.Group with all six towers */
export function buildTowers(o){const {SPOTS,H,AIM,FIX_R,FIX_L,LENS_IN,VISOR}=TOW;
  const g=new THREE.Group();g.name='prop:towers';
  const mast=mat('paintedSteel',{color:0x3a4256,relief:'plain',rough:.62,metal:.3}).clone();mast.vertexColors=true;
  const M={mast,paint:mat('paintedSteel',{color:0x3a4256,relief:'hammered',rough:.6,metal:.3}),galv:mat('galvSteel'),conc:mat('concrete'),
    grate:mat('galvSteel',{relief:'lattice',rough:.55}),box:mat('paintedSteel',{color:0x5a5f66,relief:'plain',rough:.5,metal:.4}),
    house:mat('paintedSteel',{color:0x26292e,relief:'hammered',rough:.5,metal:.4})};
  const lens=o.lampMat||new THREE.MeshBasicMaterial({color:new THREE.Color(5,4.8,4.4),toneMapped:false});
  const all={mast:[],paint:[],galv:[],conc:[],grate:[],box:[]},fx=[];
  for(const [x,z] of SPOTS){const base=new THREE.Matrix4().makeTranslation(x,0,z);
    const hd=new THREE.Object3D();hd.position.set(x,H,z);hd.lookAt(...AIM);hd.updateMatrix();
    /* towerParts works in the foot frame; the head matrix goes into that frame (inverse of the foot translation) */
    const headLocal=new THREE.Matrix4().makeTranslation(-x,0,-z).multiply(hd.matrix);
    /* the ladder faces away from the field: turn the foot frame so local -z points away from home */
    const yaw=Math.atan2(-x,-z-45),rot=new THREE.Matrix4().makeRotationY(yaw),inv=rot.clone().invert();
    const P=towerParts(M,inv.clone().multiply(headLocal)),W=base.clone().multiply(rot);
    for(const k in P)for(const q of P[k])all[k].push(q.applyMatrix4(W));
    fixtures(hd.matrix,fx)}
  for(const k in all)if(all[k].length){const ms=new THREE.Mesh(mergeGeometries(all[k]),M[k]);ms.name='prop:towers:'+k;ms.receiveShadow=true;g.add(ms)}
  /* fixtures: housing (deep can, open at the front), lens disc set back in it, visor over the top half */
  const houseG=new THREE.CylinderGeometry(FIX_R,FIX_R*.72,FIX_L,14,1,true);houseG.rotateX(Math.PI/2);houseG.translate(0,0,-FIX_L/2);
  const backG=new THREE.CircleGeometry(FIX_R*.72,14);backG.rotateY(Math.PI);backG.translate(0,0,-FIX_L);
  const house=mergeGeometries([prep(houseG),prep(backG)]);
  const lensG=new THREE.CircleGeometry(FIX_R*.94,16);lensG.translate(0,0,-LENS_IN);
  const visG=new THREE.CylinderGeometry(FIX_R*1.04,FIX_R*1.04,FIX_R*VISOR*2.2,14,1,true,-Math.PI/2*1.15,Math.PI*1.15);visG.rotateX(Math.PI/2);visG.translate(0,0,FIX_R*VISOR*1.1-.02);
  const inst=(geo,m,name)=>{const im=new THREE.InstancedMesh(geo,m,fx.length);fx.forEach((x,i)=>im.setMatrixAt(i,x));im.name=name;im.instanceMatrix.needsUpdate=true;im.computeBoundingSphere();g.add(im);return im};
  const houseM=M.house.clone();houseM.side=THREE.DoubleSide;
  inst(house,houseM,'prop:towers:house');inst(lensG,lens,'prop:towers:lens');inst(visG,houseM,'prop:towers:visor');
  return g}
