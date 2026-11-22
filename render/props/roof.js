/* render/props/roof.js: roofs and fascia of the three infield stands (#215 polish lane, round 1). Polish rounds edit only this file
 * (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Old: ctx.old('roof') = roof slabs (old:roof, the ribs are its children) and fascia lamp bars (old:roof:fascia).
 * Round 1: per stand, a corrugated steel deck on tapered I-girders (one per old rib, 6 m apart) and purlins, a deep fascia with end returns,
 * a row of lamp housings (the old cream glow, so the roof line still reads at night), a trim-colour stripe (follows the park), downlights
 * under the deck, a back gutter with downpipes, and back columns with knee braces standing on the back wall, closed by ribbed cladding
 * (the old slab floated 4-5 m over the back wall with nothing under it).
 * Placement comes from the stand group itself (`userData.stand` = {px, pz, rotY, len, rows, side, roof, base}): the new roof plane is the
 * old slab's plane (same size, same tilt), so the silhouette from the broadcast camera does not move.
 * Still gives it away (round 2): no shadow cast (the old roof cast none either; turning it on darkens the upper rows), clean paint with no
 * rust runs or bird dirt, no cable trays / speakers under the deck, cladding is one ribbed sheet with no louvres or doors.
 * Stand-local frame: +z = up the rows (away from the field), x along the stand, y up. Roof frame R = the old slab's frame (tilt ROOF_TILT). */
import * as THREE from 'three/webgpu';
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

/* tapered web: trapezoid in the (z, y) plane, depth dFront at z=-D/2, dBack at z=+D/2, top edge at y=0, extruded thickness t along x */
function webGeo(D,dF,dB,t){const s=new THREE.Shape();s.moveTo(-D/2,0);s.lineTo(D/2,0);s.lineTo(D/2,-dB);s.lineTo(-D/2,-dF);s.closePath();
  const g=new THREE.ExtrudeGeometry(s,{depth:t,bevelEnabled:false});g.translate(0,0,-t/2);g.rotateY(-Math.PI/2);return g}/* UVs of ExtrudeGeometry are in shape units = metres */

function inst(geo,m,mats){const n=mats.length,im=new THREE.InstancedMesh(geo,m,n);for(let i=0;i<n;i++)im.setMatrixAt(i,mats[i]);im.instanceMatrix.needsUpdate=true;
  im.computeBoundingSphere&&im.computeBoundingSphere();return im}
const M4=(x,y,z,rx=0,ry=0,rz=0)=>new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz)),new THREE.Vector3(1,1,1));

/* one stand's roof; S = userData.stand of the old stand group; M = shared materials */
function buildOne(S,M){const W=S.len+ST.OVER,D=S.rows*ST.ROW_D+ST.ROOF_D0,top=S.base+ST.FRONT_H+S.rows*ST.ROW_RISE,
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
  const fz=-D/2+RF.FASCIA_D/2-.1,fy=RF.DECK_TOP+RF.FASCIA_UP-RF.FASCIA_H/2;
  add(R,box(W+.1,RF.FASCIA_H,RF.FASCIA_D,T(M.fascia)),M.fascia,0,fy,fz);
  add(R,box(W+.3,.06,RF.FASCIA_D+.12,T(M.galv)),M.galv,0,RF.DECK_TOP+RF.FASCIA_UP+.03,fz);
  add(R,box(W+.2,.05,RF.FASCIA_D+.06,T(M.galv)),M.galv,0,fy-RF.FASCIA_H/2-.025,fz-.02);
  for(const sx of [-1,1])add(R,box(.12,RF.FASCIA_H*.75,D,T(M.fascia)),M.fascia,sx*(W/2+.04),RF.DECK_TOP+RF.FASCIA_UP-RF.FASCIA_H*.375,0);
  /* trim stripe along the bottom of the fascia face (park colour) */
  const fFront=fz-RF.FASCIA_D/2;add(R,box(W+.1,RF.STRIPE_H,.02,T(M.trim)),M.trim,0,fy-RF.FASCIA_H/2+RF.STRIPE_H/2+.06,fFront-.01);
  /* lamp housings on the fascia face, a lit lens in each (the old lamp row's pitch and glow) */
  const nl=Math.round(W/RF.LAMP_M),H=[],Ln=[];for(let i=0;i<nl;i++){const x=-W/2+W*(i+.5)/nl;H.push(M4(x,fy+.12,fFront-RF.LAMP_D/2,-.25));Ln.push(M4(x,fy+.07,fFront-RF.LAMP_D-.01,-.25,Math.PI))}
  R.add(inst(box(RF.LAMP_W,RF.LAMP_H,RF.LAMP_D,T(M.dark)),M.dark,H));
  R.add(inst(new THREE.PlaneGeometry(RF.LAMP_W*.84,RF.LAMP_H*.7),M.lamp,Ln));
  /* back: gutter on the high edge, columns on the back wall with knee braces to the girders, ribbed cladding closing the gap, downpipes */
  const [gbY,gbZ]=toG(RF.DECK_TOP,D/2);add(g,box(W,RF.GUTTER_H,RF.GUTTER_W,T(M.galv)),M.galv,0,gbY-RF.GUTTER_H/2,gbZ+RF.GUTTER_W/2);
  const wallTop=top+ST.BACK_WALL,wallZ=S.rows*ST.ROW_D+.5,[cbY]=toG(gy-RF.GD_BACK,D/2-.3),ch=cbY-wallTop;
  if(ch>.2){const C=[],B=[],kd=RF.GD_FRONT+(D-RF.BRACE)/D*(RF.GD_BACK-RF.GD_FRONT),[kY,kZ]=toG(gy-kd,D/2-RF.BRACE),aY=wallTop+ch*.45,kl=Math.hypot(kZ-wallZ,kY-aY),ka=Math.atan2(kZ-wallZ,kY-aY);
    for(const x of gx){C.push(M4(x,wallTop+ch/2,wallZ));B.push(M4(x,(aY+kY)/2,(wallZ+kZ)/2,ka))}
    g.add(inst(box(RF.COL_W,ch,RF.COL_W,T(M.steel)),M.steel,C));g.add(inst(box(.14,kl,.14,T(M.steel)),M.steel,B));
    const cz=wallZ+.5+RF.CLAD_T/2,cy=(wallTop+gbY)/2,chh=gbY-wallTop;/* cladding built tall-thin then turned so its ribs run upright */
    add(g,box(chh,W,RF.CLAD_T,T(M.clad)*RF.CLAD_K),M.clad,0,cy,cz,0,0,Math.PI/2)}
  const DP=[];for(let i=0;i<gx.length-2;i+=2)DP.push(M4(gx[i]+.5,gbY/2,wallZ+.5+RF.CLAD_T+.12));
  if(DP.length)g.add(inst(cyl(RF.PIPE_R,RF.PIPE_R,gbY,10,T(M.galv)),M.galv,DP));
  g.traverse(o=>{if(o.isMesh)o.receiveShadow=true});return g}

/* old: the old:roof meshes (their parent is the stand group with userData.stand); colors: {pad, trim} of the home park */
export function buildRoofs(o){const slabs=o.old.filter(m=>m.name==='old:roof');if(!slabs.length)throw new Error('old:roof not found');
  const M={deck:mat('paintedSteel',{relief:'ribbed',color:0x9aa1ad,rough:.6}),steel:mat('paintedSteel',{relief:'plain',color:0x3a4256,rough:.72}),dark:mat('paintedSteel',{color:0x1e232c,rough:.65}),
    fascia:mat('paintedSteel',{color:0x2a3040,rough:.5}),galv:mat('galvSteel'),clad:mat('paintedSteel',{relief:'ribbed',color:0x4a5264,rough:.6}),
    lamp:mat('paintedSteel',{relief:'plain',color:0xfff3d6,rough:.3,metal:0,emissive:0xfff3d6,emissiveIntensity:RF.LAMP_GLOW}),
    down:mat('paintedSteel',{relief:'plain',color:0xfff6e6,rough:.3,metal:0,emissive:0xfff6e6,emissiveIntensity:RF.DOWN_GLOW}),
    trim:mat('paintedSteel',{relief:'plain',rough:.38}).clone()};
  const g=new THREE.Group();g.name='prop:roofs';
  for(const sl of slabs){const S=sl.parent&&sl.parent.userData.stand;if(S&&S.roof)g.add(buildOne(S,M))}
  if(!g.children.length)throw new Error('no roofed stand found');
  g.userData.recolor=P=>{if(P)M.trim.color.set(P.trim)};g.userData.recolor(o.colors);return g}

export const PROPS=[{name:'roof',build:c=>buildRoofs({old:c.old('roof'),colors:c.park()}),old:c=>c.old('roof')}];
