/* render/props/dugout.js: the home dugout (#215 round 0, the proof object). Polish rounds edit only this file (and add to render/pbr.js).
 * Field-level dugout set into the front of the foul-line stand: raised concrete floor with steps in the opening, low front wall with a
 * padded rail cap and a galvanised lean rail, back wall with a pad band, wooden bench, bat rack, helmet shelf, corrugated roof underside
 * with lamp strips, roof fascia in the home team's trim colour (same colour inputs as #203's PARKS: pad, trim).
 * Local frame: x along the foul line, z away from the field (front face at z 0, the point where players leave the field), y up.
 * Round 0 sizes: everything fits between the line point game.js uses as the dugout (14.1 m off the line) and the stand front (15.9 m). */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const DUG={L:14,D:1.7,H:2.25,F:.3,FRONT_H:.95,OPEN:2,WALL_T:.22,ROOF_T:.2,BENCH_H:.45,BENCH_D:.42,RAIL_H:1.25,POST_GAP:2.3,LAMPS:4,LAMP_GLOW:1};

/* o: {x, z: the dugout point game.js uses, colors: {pad (css), trim (int)}} -> THREE.Group standing there */
export function buildDugout(o){const {L,D,H,F,FRONT_H,OPEN,WALL_T,ROOF_T,BENCH_H,BENCH_D,RAIL_H,POST_GAP,LAMPS,LAMP_GLOW}=DUG;
  const g=new THREE.Group();g.name='prop:homeDugout';g.position.set(o.x,0,o.z);g.rotation.y=Math.sign(o.x||-1)*Math.PI/4;
  const add=(geo,m,x,y,z,ry=0)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.rotation.y=ry;ms.castShadow=ms.receiveShadow=true;g.add(ms);return ms};
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
  /* colours from the home park (pad = vinyl, trim = fascia and helmets); called again when the park changes */
  g.userData.recolor=P=>{if(!P)return;pad.color.set(P.pad);const c=new THREE.Color(P.trim);trim.color.copy(c);shell.color.copy(c).multiplyScalar(.6)};
  g.userData.recolor(o.colors);return g}
