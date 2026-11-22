/* render/props/wells.js: the two low camera wells (#215 polish lane, round 1). Polish rounds edit only this file (#237: index.js, game.js,
 * pbr.js and render/HANDOFF.md are read-only; new materials live here; round notes in this header and on the #215 board).
 * Before this there was no camera well at all: old() is [].
 * Round 1, one well per side, at the home-plate end of each dugout ("low first" and "low third" of a telecast), in the home club's colours:
 *   - shape: a field-level bay set into the foul-line stand front, between the end of the backstop corner and the dugout: concrete floor
 *     slab, a padded front wall the height of the dugout's, side walls, a back wall against the stand rail with a steel service door, a
 *     galvanised lean rail on both side walls. Not sunken (the field mesh has no hole to sink it into): the floor sits WELL.F up, like the
 *     dugout floor, and the lens looks over the wall.
 *   - surface: pbr.js kinds only (concrete `cast`, vinyl pad, painted and galvanised steel, rubber mat, gloss shell for the camera).
 *     Opaque parts only: no transparent overlay, so the #267 MRT trap (see render/HANDOFF.md) does not apply.
 *   - wear: a band of field dirt splashed on the bottom of the front pads, dust on the floor at the front, the rubber mat scuffed
 *     (separate opaque slabs, slightly darker; no decal).
 *   - small parts: a broadcast camera on a pedestal (three-leg spreader, column, fluid head, body, viewfinder with hood, long box lens
 *     with a square sun hood and dark front glass, two pan bars, a red tally lamp), aimed at home plate; an operator's stool, a cable
 *     coiled on the floor running up the back wall in conduit to a junction box, a small monitor on the side wall.
 * Local frame (as in dugout.js): x along the foul line, +x toward home plate on either side (the road side is mirrored), z away from
 * the field (front face of the front wall at z 0), y up. Placed by its line point: WELL.A metres from home along the line, WELL.P
 * metres off it (the dugout front line, 14.1 m in game.js; stands start 14.06 m along the line, the dugout at 15.63 m).
 * Everything is fixed geometry (no randomness). Drawn on `max` only, like every prop. */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const WELL={A:14.25,/* centre, metres from home along the foul line */P:14.1,/* front face, metres off the line (dugout front) */
  W:2.5,/* width along the line */D:1.62,/* depth, front face to the back of the back wall (stand rail front at ~15.75 m off the line) */
  F:.18,/* floor slab height */FRONT_H:.95,/* front wall height (same as the dugout's) */WALL_T:.2,CAP:.14,/* wall thickness, padded cap height */
  BACK_H:1.25,/* back wall height (stand rail top 1.1 m, a little over it) */RAIL_H:1.38,/* lean rail top on the side walls */
  SPLASH_H:.22,/* dirt band on the pad bottoms */LENS_Y:1.32,/* lens axis above ground: just over the cap */
  TALLY:1.6/* tally lamp glow */};

const R2=Math.SQRT1_2;
/* world point of the well's line point on a side: s +1 = road (+x, first base), -1 = home (-x, third base) */
export const wellAt=s=>[s*(WELL.A+WELL.P)*R2,(WELL.P-WELL.A)*R2];

/* s: +1 road side, -1 home side; P: home park {pad, trim}; name: prop name */
export function buildWell(s,P,name){const {W,D,F,FRONT_H,WALL_T,CAP,BACK_H,RAIL_H,SPLASH_H,LENS_Y}=WELL;
  const g=new THREE.Group();g.name='prop:'+name;const [wx,wz]=wellAt(s);g.position.set(wx,0,wz);g.rotation.y=s*Math.PI/4;
  const hand=-s;/* local +x points at home: mirrored on the road side (as dugout.js) */
  const add=(geo,m,x,y,z,ry=0,par=g)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(par===g?hand*x:x,y,z);ms.rotation.y=par===g?hand*ry:ry;ms.castShadow=ms.receiveShadow=true;par.add(ms);return ms};
  const T=m=>m.userData.tileM,conc=mat('concrete'),steel=mat('paintedSteel'),galv=mat('galvSteel'),rub=mat('rubber'),
    dirt=mat('dirt'),dust=mat('dirt',{color:0x9a8266}),scuff=mat('rubber',{color:0x2a2724,rough:.95});
  const pad=mat('vinylPad',{relief:'vinyl'}).clone(),padCap=mat('vinylPad').clone(),trim=mat('paintedSteel',{relief:'plain',rough:.4}).clone(),
    splash=mat('vinylPad',{relief:'vinyl'}).clone();
  const IN=W-2*WALL_T,ID=D-WALL_T-.12;/* inside width and depth */
  /* floor slab, rubber mat, dust at the front, scuffs on the mat where the operator stands */
  add(box(W,F,D,T(conc)),conc,0,F/2,D/2);
  add(box(IN-.2,.012,ID-.3,T(rub)),rub,0,F+.006,WALL_T+.15+(ID-.3)/2);
  add(box(IN,.006,.22,T(dust)),dust,0,F+.003,WALL_T+.11);
  add(box(.5,.004,.4,T(scuff)),scuff,-.25,F+.014,WALL_T+.95);
  /* front wall: concrete core, vinyl pads on the field face (two pads), padded cap in pad colour, trim flashing under the cap,
     field dirt splashed on the pad bottoms */
  add(box(W,FRONT_H,WALL_T-.06,T(conc)),conc,0,FRONT_H/2,.06+(WALL_T-.06)/2);
  for(const k of [-1,1]){add(box(W/2-.01,FRONT_H-.02,.06,T(pad)),pad,k*W/4,FRONT_H/2,.03);
    add(box(W/2-.008,SPLASH_H,.062,T(splash)),splash,k*W/4,SPLASH_H/2+.001,.03)}
  add(box(W+.06,CAP,WALL_T+.1,T(padCap)),padCap,0,FRONT_H+CAP/2,WALL_T/2);
  add(box(W+.07,.04,.012,T(trim)),trim,0,FRONT_H-.03,-.004);
  /* side walls: full depth, stepping up from the front wall height to the back wall height; lean rail on top */
  for(const k of [-1,1]){const x=k*(W/2-WALL_T/2);
    add(box(WALL_T,FRONT_H,D,T(conc)),conc,x,FRONT_H/2,D/2);
    add(box(WALL_T,BACK_H-FRONT_H,D*.55,T(conc)),conc,x,FRONT_H+(BACK_H-FRONT_H)/2,D-D*.55/2);
    add(box(WALL_T+.04,CAP,D*.45,T(padCap)),padCap,x,FRONT_H+CAP/2,D*.45/2);
    for(const z of [.12,D*.5,D-.12]){const y0=z<D*.45?FRONT_H+CAP:BACK_H;add(cyl(.022,.022,RAIL_H-y0,8,T(galv)),galv,x,(y0+RAIL_H)/2,z)}
    const p=add(cyl(.028,.028,D-.2,10,T(galv)),galv,x,RAIL_H,D/2);p.rotation.x=Math.PI/2}
  /* back wall with a steel service door to the stand, its frame and handle */
  add(box(W,BACK_H,.12,T(conc)),conc,0,BACK_H/2,D-.06);
  add(box(.8,BACK_H-F-.08,.03,T(steel)),steel,.45,F+(BACK_H-F-.08)/2,D-.135);
  add(box(.88,.05,.04,T(galv)),galv,.45,BACK_H-.06,D-.14);
  add(box(.03,.12,.04,T(galv)),galv,.45+.32,F+.55,D-.16);
  /* junction box and conduit on the back wall, the camera cable coiled on the floor and running to it */
  const cab=mat('rubber',{color:0x101114,rough:.6});
  add(box(.32,.38,.12,T(galv)),galv,-.6,F+.62,D-.18);
  add(cyl(.02,.02,.42,8,T(galv)),galv,-.6,F+.21,D-.14);
  for(let i=0;i<3;i++){const c=add(new THREE.TorusGeometry(.17-.018*i,.012,6,28),cab,-.55+.02*i,F+.025+.024*i,D-.42);c.rotation.x=Math.PI/2}
  /* operator's stool: round seat on three legs, behind the camera */
  const st=new THREE.Group();st.position.set(hand*-.15,0,WALL_T+1.0);g.add(st);
  add(cyl(.17,.17,.05,16,T(rub)),rub,0,F+.62,0,0,st);
  for(let i=0;i<3;i++){const a=i*2.094,l=add(cyl(.014,.014,.64,6,T(galv)),galv,Math.cos(a)*.12,F+.31,Math.sin(a)*.12,0,st);l.rotation.set(-Math.sin(a)*.18,0,Math.cos(a)*.18)}
  /* small field monitor on a bracket on the home-plate side wall */
  const scr=new THREE.MeshStandardMaterial({color:0x0b0e12,roughness:.25,metalness:0,emissive:0x2a4a66,emissiveIntensity:.35});
  add(box(.06,.22,.3,T(steel)),steel,W/2-WALL_T-.04,BACK_H-.05,D-.55);
  add(box(.008,.18,.26,T(steel)),scr,W/2-WALL_T-.075,BACK_H-.05,D-.55);
  /* the camera, aimed at home plate: home is at local (+A along, -P across) from the line point */
  buildCamera(g,add,hand);
  /* colours from the home park (pad = vinyl, trim = flashing); called again when the park changes */
  g.userData.recolor=Q=>{if(!Q)return;pad.color.set(Q.pad);padCap.color.set(Q.pad);trim.color.set(Q.trim);
    splash.color.set(Q.pad).lerp(new THREE.Color(0x8a6a4a),.55)};
  g.userData.recolor(P);return g}

function buildCamera(g,add,hand){const {D,F,WALL_T,LENS_Y,A,P,TALLY}=WELL,T=m=>m.userData.tileM;
  const cx=.2,cz=WALL_T+.55;/* pedestal foot, local (before mirroring): a little to the plate side, close behind the front wall */
  const ped=new THREE.Group();ped.position.set(hand*cx,F,cz);g.add(ped);
  const black=mat('paintedSteel',{relief:'plain',color:0x15171b,rough:.5}),galv=mat('galvSteel'),shell=mat('gloss',{color:0xd9dbdc,rough:.3}),
    body=mat('gloss',{color:0x2b2e33,rough:.4}),glass=new THREE.MeshStandardMaterial({color:0x05070a,roughness:.05,metalness:.2}),
    tally=new THREE.MeshStandardMaterial({color:0x330000,emissive:0xff2010,emissiveIntensity:TALLY,roughness:.4});
  /* three-leg spreader with castors, column with a crank collar */
  for(let i=0;i<3;i++){const a=i*2.094+.5,l=add(box(.42,.035,.05,T(black)),black,Math.cos(a)*.2,.04,Math.sin(a)*.2,-a,ped);
    add(cyl(.035,.035,.03,10,T(black)),black,Math.cos(a)*.4,.015,Math.sin(a)*.4,0,ped);l.castShadow=true}
  const colH=LENS_Y-F-.22;add(cyl(.05,.06,colH,14,T(galv)),galv,0,colH/2+.05,0,0,ped);
  add(cyl(.075,.075,.08,14,T(black)),black,0,colH*.55,0,0,ped);
  /* the head turns to the plate: yaw so its -z (lens) points from the pedestal to home, in the mirrored local frame */
  const head=new THREE.Group();head.position.set(0,colH+.05,0);ped.add(head);
  const dx=hand*(A-cx),dz=-P-cz;head.rotation.y=Math.atan2(-dx,-dz);head.rotation.x=-.01;
  add(box(.2,.08,.2,T(black)),black,0,.04,0,0,head);/* fluid head */
  const by=.08+.14;add(box(.24,.28,.38,T(body)),body,0,by,.02,0,head);/* body */
  add(box(.2,.05,.3,T(black)),black,0,by+.165,.02,0,head);/* handle rail on top */
  add(box(.03,.03,.03,T(black)),tally,.05,by+.2,-.1,0,head);/* tally lamp: on air */
  /* long box lens: housing, barrel, square sun hood, dark front glass */
  const lz=-.17-.27;add(box(.2,.22,.54,T(shell)),shell,0,by-.01,lz,0,head);
  const bar=add(cyl(.085,.085,.16,20,T(shell)),shell,0,by-.01,lz-.33,0,head);bar.rotation.x=Math.PI/2;
  for(const [w,h,x,y] of [[.26,.012,0,.12],[.26,.012,0,-.12],[.012,.24,.13,0],[.012,.24,-.13,0]]){const p=add(box(w,h,.14,T(black)),black,x,by-.01+y,lz-.47,0,head);p.castShadow=false}
  const gl=add(new THREE.CircleGeometry(.075,20),glass,0,by-.01,lz-.411,0,head);gl.rotation.y=Math.PI;
  /* viewfinder at the back top, with its hood toward the operator */
  add(box(.16,.12,.14,T(black)),black,-.05,by+.24,.18,0,head);
  add(box(.14,.1,.06,T(black)),black,-.05,by+.24,.28,0,head);
  /* two pan bars sweeping back and down */
  for(const k of [-1,1]){const p=add(cyl(.014,.014,.6,8,T(galv)),galv,k*.12,.02,.36,0,head);p.rotation.x=Math.PI/2+.45;
    add(cyl(.02,.02,.1,8,T(black)),black,k*.12,-.11,.63,0,head).rotation.x=Math.PI/2+.45}
  /* camera cable from the body down the column */
  add(cyl(.012,.012,colH,6,T(black)),mat('rubber',{color:0x101114,rough:.6}),.07,colH/2+.05,.05,0,ped)}

/* slot descriptors (#237): neither well existed before, nothing to hide. ?prop=homeWell / ?prop=roadWell in the viewer.
   dugout(1) is the home side (-x, third base), dugout(0) the road side (+x, first base), as in ondeck.js. */
export const PROPS=[
  {name:'homeWell',build:c=>buildWell(-1,c.park(),'homeWell'),old:()=>[]},
  {name:'roadWell',build:c=>buildWell(1,c.park(),'roadWell'),old:()=>[]},
];
