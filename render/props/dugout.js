/* render/props/dugout.js: both dugouts (#215: home round 0, the proof object; road round 1). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Field-level dugout set into the front of the foul-line stand: raised concrete floor with steps in the opening, low front wall with a
 * padded rail cap and a galvanised lean rail, back wall with a pad band, wooden bench, bat rack, helmet shelf, corrugated roof underside
 * with lamp strips, roof fascia in the home team's trim colour (same colour inputs as #203's PARKS: pad, trim).
 * Local frame: x along the foul line, +x toward home plate on either side (the road side is built mirrored, so its bat rack is at the
 * plate end too), z away from the field (front face at z 0, the point where players leave the field), y up.
 * Road dugout (round 1): the same shell plus what a visiting bench carries in: a water cooler on a stand with a cup tube, a stack of
 * equipment bags and a ball bucket at the steps, towels on the rail. Home output is unchanged.
 * Round 0 sizes: everything fits between the line point game.js uses as the dugout (14.1 m off the line) and the stand front (15.9 m). */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const DUG={L:14,D:1.7,H:2.25,F:.3,FRONT_H:.95,OPEN:2,WALL_T:.22,ROOF_T:.2,BENCH_H:.45,BENCH_D:.42,RAIL_H:1.25,POST_GAP:2.3,LAMPS:4,LAMP_GLOW:1};
/* road extras: cooler (radius, height, stand height), bags (count), towels (count) */
export const ROAD={COOL_R:.2,COOL_H:.48,STAND_H:.55,BAGS:4,TOWELS:3};

/* o: {x, z: the dugout point game.js uses, colors: {pad (css), trim (int)}, name (default 'homeDugout'), road (adds the visitors' gear)}
   -> THREE.Group standing there. Local x is mirrored on the +x (first-base) side so +x always points at home plate. */
export function buildDugout(o){const {L,D,H,F,FRONT_H,OPEN,WALL_T,ROOF_T,BENCH_H,BENCH_D,RAIL_H,POST_GAP,LAMPS,LAMP_GLOW}=DUG;
  const g=new THREE.Group();g.name='prop:'+(o.name||'homeDugout');g.position.set(o.x,0,o.z);g.rotation.y=Math.sign(o.x||-1)*Math.PI/4;
  const hand=(o.x||-1)<0?1:-1;
  const add=(geo,m,x,y,z,ry=0)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(hand*x,y,z);ms.rotation.y=hand*ry;ms.castShadow=ms.receiveShadow=true;g.add(ms);return ms};
  const conc=mat('concrete'),steel=mat('paintedSteel'),galv=mat('galvSteel'),wood=mat('wood'),deck=mat('paintedSteel',{relief:'ribbed',color:0x3a4252}),
    mat_=mat('rubber'),T=m=>m.userData.tileM;
  const pad=mat('vinylPad').clone(),trim=mat('paintedSteel',{relief:'plain',rough:.4}).clone(),shell=mat('gloss').clone();
  const lamp=new THREE.MeshStandardMaterial({color:0xfff6e0,emissive:0xfff3d6,emissiveIntensity:LAMP_GLOW,roughness:.4});
  /* floor slab, rubber mat along the bench, steps in the opening */
  add(box(L,F,D-WALL_T,T(conc)),conc,0,F/2,WALL_T+(D-WALL_T)/2);
  add(box(L-1,.012,.9,T(mat_)),mat_,0,F+.006,D-.12-BENCH_D-.5);
  add(box(OPEN,F/2,.38,T(conc)),conc,0,F/4,-.19);add(box(OPEN,F,WALL_T,T(conc)),conc,0,F/2,WALL_T/2);
  /* front wall in two pieces either side of the opening, padded cap on top */
  const fw=(L-OPEN)/2;for(const s of [-1,1]){const cx=s*(OPEN/2+fw/2);
    add(box(fw,FRONT_H,WALL_T,T(conc)),conc,cx,FRONT_H/2,WALL_T/2);add(box(fw+.04,.14,WALL_T+.1,T(pad)),pad,cx,FRONT_H+.07,WALL_T/2)}
  /* back wall, pad band behind the bench, side walls */
  add(box(L,H,.12,T(conc)),conc,0,H/2,D-.06);add(box(L-.4,.75,.06,T(pad)),pad,0,F+BENCH_H+.45,D-.15);
  for(const s of [-1,1])add(box(WALL_T,H,D,T(conc)),conc,s*(L/2-WALL_T/2),H/2,D/2);
  /* roof: corrugated steel underside, concrete top, fascia in the team trim colour, lamp strips under the front edge */
  add(box(L+.3,ROOF_T,D+.35,T(deck)),deck,0,H+ROOF_T/2,D/2-.17);
  add(box(L+.3,.06,D+.35,T(conc)),conc,0,H+ROOF_T+.03,D/2-.17);/* roof top: concrete, the ribs only show from below */
  add(box(L+.34,.34,.06,T(trim)),trim,0,H+.07,-.37);
  for(let i=0;i<LAMPS;i++)add(new THREE.BoxGeometry(1.2,.04,.08),lamp,-L/2+L*(i+.5)/LAMPS,H-.03,.35);
  /* galvanised lean rail on the front wall: posts and a top pipe on each side of the opening */
  for(const s of [-1,1]){const x0=s*OPEN/2,x1=s*(L/2-WALL_T),n=Math.max(1,Math.round(Math.abs(x1-x0)/POST_GAP));
    for(let i=0;i<=n;i++)add(cyl(.025,.025,RAIL_H-FRONT_H,8,T(galv)),galv,x0+(x1-x0)*i/n,FRONT_H+(RAIL_H-FRONT_H)/2,WALL_T/2);
    const p=add(cyl(.03,.03,Math.abs(x1-x0),10,T(galv)),galv,(x0+x1)/2,RAIL_H,WALL_T/2);p.rotation.z=Math.PI/2}
  /* bench: three wooden slats on steel legs along the back wall */
  const bz=D-.12-BENCH_D/2;for(let i=0;i<3;i++)add(box(L-1.2,.04,BENCH_D/3-.015,T(wood)),wood,0,F+BENCH_H,bz-BENCH_D/3+i*BENCH_D/3);
  for(let x=-(L-1.4)/2;x<=(L-1.4)/2+1e-6;x+=(L-1.4)/5)add(box(.05,BENCH_H-.02,BENCH_D-.06,T(steel)),steel,x,F+(BENCH_H-.02)/2,bz);
  /* bat rack at the home-plate end: a wooden rack with slots and bats standing in it */
  const rx=L/2-WALL_T-.75;add(box(1.2,.9,.28,T(wood)),wood,rx,F+.45,D-.12-.14);add(box(1.2,.04,.3,T(wood)),wood,rx,F+.92,D-.12-.38);
  const bat=mat('wood',{color:0xc8a070,rough:.35});
  for(let i=0;i<7;i++){const b=add(cyl(.033,.012,.84,10,T(bat)),bat,rx-.5+i*.165,F+.42+.12,D-.12-.38);b.rotation.x=-.18+.03*(i%3)}
  /* helmet shelf at the other end: steel cubbies, a helmet in each */
  const hx=-(L/2-WALL_T-.8),HZ=D-.12-.17;add(box(1.4,1.1,.34,T(steel)),steel,hx,F+BENCH_H+.85,HZ);
  const hg=new THREE.SphereGeometry(.13,16,10,0,Math.PI*2,0,Math.PI*.55),brim=new THREE.BoxGeometry(.17,.015,.08);
  for(let r=0;r<2;r++)for(let c=0;c<4;c++){const x=hx-.525+c*.35,y=F+BENCH_H+.45+r*.5;add(box(.32,.02,.32,T(steel)),steel,x,y,HZ-.02);
    add(hg,shell,x,y+.01,HZ-.06);add(brim,shell,x,y+.02,HZ-.2)}
  if(o.road)roadGear(add,shell);
  /* colours from the home park (pad = vinyl, trim = fascia and helmets); called again when the park changes */
  g.userData.recolor=P=>{if(!P)return;pad.color.set(P.pad);const c=new THREE.Color(P.trim);trim.color.copy(c);shell.color.copy(c).multiplyScalar(.6)};
  g.userData.recolor(o.colors);return g}

/* the visitors' gear (road dugout round 1): shapes first; colours stay neutral so nothing reads as a team the park does not know */
function roadGear(add,shell){const {L,D,F,OPEN,WALL_T,FRONT_H,BENCH_D}=DUG,{COOL_R,COOL_H,STAND_H,BAGS,TOWELS}=ROAD,T=m=>m.userData.tileM;
  const steel=mat('paintedSteel'),galv=mat('galvSteel'),cool=mat('gloss',{color:0xd8641e,rough:.3}),lid=mat('gloss',{color:0xe9e6df,rough:.35}),
    bag=mat('leather',{color:0x22252b,rough:.7}),cloth=mat('vinylPad',{relief:'woven',color:0xe8e4da,rough:.95}),bucket=mat('rubber',{color:0x2a2d33});
  /* water cooler on a steel stand against the front wall, on the outfield side of the steps: tapered body, white lid, tap */
  const cx=-(OPEN/2+.75),cz=WALL_T+COOL_R+.08,top=F+STAND_H;
  add(box(.5,.03,.5,T(steel)),steel,cx,top-.015,cz);
  for(const [a,b] of [[-1,-1],[1,-1],[-1,1],[1,1]])add(cyl(.015,.015,STAND_H-.03,6,T(galv)),galv,cx+a*.22,F+(STAND_H-.03)/2,cz+b*.22);
  add(cyl(COOL_R,COOL_R*.92,COOL_H,20,T(cool)),cool,cx,top+COOL_H/2,cz);
  add(cyl(COOL_R*1.03,COOL_R*1.03,.07,20,T(lid)),lid,cx,top+COOL_H+.035,cz);
  add(cyl(COOL_R*.3,COOL_R*.3,.03,10,T(lid)),lid,cx,top+COOL_H+.085,cz);
  const tap=add(cyl(.018,.018,.07,8,T(lid)),lid,cx,top+.07,cz+COOL_R+.03);tap.rotation.x=Math.PI/2;
  /* cup tube on the wall beside it, a few paper cups in the bin underneath */
  add(cyl(.045,.045,.45,10,T(lid)),lid,cx-.42,F+FRONT_H-.3,WALL_T+.05);
  add(cyl(.12,.1,.28,12,T(bucket)),bucket,cx-.42,F+.14,WALL_T+.16);
  /* equipment bags stacked on the floor on the plate side of the steps, a ball bucket in front of them */
  for(let i=0;i<BAGS;i++){const lw=.95-.1*(i%2),x=OPEN/2+.65+(i%2)*.12,y=F+.13+Math.floor(i/2)*.25,z=WALL_T+.32+(i>1?.02:0)+(i%2)*.36;
    add(box(lw,.26,.34,T(bag)),bag,x,y,z,(i%2?.06:-.04));add(cyl(.02,.02,lw*.8,6,T(steel)),steel,x,y+.135,z).rotation.z=Math.PI/2}
  add(cyl(.16,.14,.36,14,T(bucket)),bucket,OPEN/2+1.55,F+.18,WALL_T+.3);
  const ball=new THREE.SphereGeometry(.037,8,6);for(let i=0;i<9;i++)add(ball,lid,OPEN/2+1.55+.1*Math.cos(i*2.4)*(i%3)/2,F+.37+.02*(i%2),WALL_T+.3+.1*Math.sin(i*2.4)*(i%3)/2);
  /* towels hung over the lean rail: a folded flat panel each side of the pipe */
  for(let i=0;i<TOWELS;i++){const x=OPEN/2+2.4+i*1.5;for(const s of [-1,1]){const t=add(box(.38,.42,.012,T(cloth)),cloth,x,DUG.RAIL_H-.2,WALL_T/2+s*.035);t.rotation.x=s*.08}}
  /* the bench end nearest the plate gets a second helmet on the bench, a visitor's spare */
  const hg=new THREE.SphereGeometry(.13,16,10,0,Math.PI*2,0,Math.PI*.55);add(hg,shell,L/2-2.2,F+DUG.BENCH_H+.03,D-.12-BENCH_D/2)}

/* slot descriptors (#237): dugout(1) in game.js is where the home side leaves the field, dugout(0) the road side (first base):
   same shell mirrored, plus the visitors' gear. Neither existed before: nothing to hide. */
export const PROPS=[
  {name:'homeDugout',build:c=>{const [x,z]=c.dugout(1);return buildDugout({x,z,colors:c.park()})},old:()=>[]},
  {name:'roadDugout',build:c=>{const [x,z]=c.dugout(0);return buildDugout({x,z,colors:c.park(),name:'roadDugout',road:true})},old:()=>[]},
];
