/* render/props/bullpens.js: the two bullpens (#215 polish lane, round 1). Polish rounds edit only this file (#237: index.js, game.js,
 * pbr.js and render/HANDOFF.md are read-only; new materials live here; round notes in this header and on the #215 board).
 * Before this there was no bullpen at all: old() is []. The outfield bleachers start right behind the 110 m wall (game.js OF_R), so
 * there is no room behind the fence; both pens lie in foul ground down the lines, as in many island parks: in the strip between the
 * foul line and the foul-line stand (its front is 16 m off the line), past the dugouts, from BP.S0 to BP.S1 metres out from home.
 * The home pen is on the home dugout's side (third base, -x), the road pen on first base (+x).
 * Round 1 (shape, surface, wear, small parts):
 *   - shape: one strip of clay per pen with two side-by-side lanes. Each lane is a regulation bullpen mound (10 in high table round the
 *     rubber, 1 in per ft slope toward the plate, rounded sides and back) and a home plate 60 ft 6 in away; the pitchers face the corner,
 *     so from the home camera they are seen from behind. The strip is one height field: its ragged outline is where the clay dips under
 *     the turf (no transparency, no decal, no depth fighting with the field plane), with a low lip just inside it.
 *   - surface: pbr.js `dirt` (cloned, vertex coloured): redder packed clay on each mound and round each plate, lighter dry dirt between.
 *   - wear: a dug push-off hole in front of each rubber, a landing pit where the stride foot comes down (right- and left-handed lanes),
 *     a darker worn path rubber -> landing pit, a kneeling scuff behind each plate, scattered dark cleat marks.
 *   - small parts: rubber and plate slabs proud of the clay, a slatted bench with backrest against the stand front (steel frame in the
 *     park's pad colour), a water cooler and cups, a bucket of balls, a rosin bag behind each rubber, the bullpen phone on the stand rail.
 * Frame: world, home plate at the origin, pitcher toward -z, +x = first base. Local frame of one pen: +x = out along its foul line,
 * +z = away from fair ground (toward the stand); the -x pen mirrors z (zs) instead of using a negative scale.
 * Everything is seeded (fixed hash): same park every load. Drawn on `max` only, like every prop.
 * Still gives it away after round 1: see the #215 board. */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const BP={
  S0:62.6,S1:86,/* clay strip along the line (m from home); the foul-line stand runs from 14 to 86 m */D0:8.2,D1:14.8,/* across: m off the line */
  STAND_D:15.75,/* front face of the foul-line stand's rail (game.js stand: 16 m off the line, rail at local z -.1, .25 deep) */
  LANES:[9.9,12.9],/* lane centre lines, m off the line */RUBBER_S:65.5,PLATE_D:18.44,/* rubber front edge -> plate point */
  MOUND_H:.254,TABLE:[-.6,.25,.75],/* table: back, front (from the rubber front), half width */SLOPE:.0833,/* 1 in per ft */
  SIDE_FALL:.9,BACK_FALL:1.2,/* metres the mound takes to reach the strip level at its sides and back */
  BASE_H:.016,LIP:.01,EDGE_JIT:.28,SINK:-.035,/* strip level, lip height, outline wander, how far the outside dips under the turf */
  CELL:.1,/* height field cell (m) */HOLE:[.045,.06],/* push-off hole and landing pit depth */
  CLAY:0x7a4c32,DRY:0xa07e5c,WET:0x5e3e2a,/* vertex colours: packed mound clay, dry strip dirt, watered/worn */
  BENCH:[57.8,62.2],/* bench along the stand front, m from home */
};

/* seeded hash noise (same family as pbr.js) */
function hash(x,y,k){let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
function vn(x,y,k){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  a=hash(xi,yi,k),b=hash(xi+1,yi,k),c=hash(xi,yi+1,k),e=hash(xi+1,yi+1,k);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
const sat=x=>x<0?0:x>1?1:x,smooth=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)},g2=(x,y,sx,sy)=>Math.exp(-(x*x)/(2*sx*sx)-(y*y)/(2*sy*sy));

/* one lane's mound + plate area: height above the strip level and a 0..1 'clay' weight, at (dx from the rubber front, dz from the lane line).
   hand: +1 = right-hander (stride foot lands a little toward -z of the lane line), -1 = left-hander */
function lane(dx,dz,hand){const [tb,tf,tw]=BP.TABLE,H=BP.MOUND_H;
  const front=dx<=tf?1:sat(1-(dx-tf)*BP.SLOPE/H),back=dx>=tb?1:smooth(tb-BP.BACK_FALL,tb,dx),w=tw+.22*Math.max(0,dx-tf),side=1-smooth(w,w+BP.SIDE_FALL,Math.abs(dz));
  let h=H*front*back*side;
  /* push-off hole (in front of the rubber, under the pivot foot) and the landing pit, both dug out and rimmed */
  h-=BP.HOLE[0]*g2(dx-.22,dz+hand*.12,.13,.11);h+=.008*g2(dx-.4,dz+hand*.12,.08,.16);
  const lx=1.55,lz=-hand*.12;h-=BP.HOLE[1]*g2(dx-lx,dz-lz,.22,.13);h+=.01*g2(dx-lx-.28,dz-lz,.07,.18);
  /* catcher's kneeling scuff behind the plate */
  const px=dx-BP.PLATE_D-.75;h-=.012*g2(px,dz,.35,.4);
  const clay=Math.max(sat(front*back*side*1.6),g2(dx-BP.PLATE_D-.3,dz,1.1,1));
  const worn=Math.max(g2(dx-.8,dz-lz*.5,.75,.25),g2(dx-BP.PLATE_D-.6,dz,.6,.5));
  return {h,clay,worn}}

/* height field of the whole strip (local frame), with vertex colours and UVs in metres */
function stripGeo(tileM){const W=BP.S1-BP.S0,D=BP.D1-BP.D0,nx=Math.round(W/BP.CELL),nz=Math.round(D/BP.CELL),g=new THREE.PlaneGeometry(W,D,nx,nz);
  g.rotateX(-Math.PI/2);g.translate(BP.S0+W/2,0,BP.D0+D/2);
  const p=g.attributes.position,uv=g.attributes.uv,C=new Float32Array(p.count*3),cl=new THREE.Color(BP.CLAY),dr=new THREE.Color(BP.DRY),we=new THREE.Color(BP.WET),c=new THREE.Color();
  for(let i=0;i<p.count;i++){const s=p.getX(i),d=p.getZ(i);
    const jit=BP.EDGE_JIT*(vn(s*.9,d*.9,3)*.7+vn(s*3.1,d*3.1,4)*.3),e=Math.min(s-BP.S0,BP.S1-s,d-BP.D0,BP.D1-d)-jit;/* m inside the ragged outline */
    let y=BP.SINK+(BP.BASE_H-BP.SINK)*smooth(-.12,.04,e)+BP.LIP*g2(e-.12,0,.07,1),clay=0,worn=0;
    for(let k=0;k<2;k++){const L=lane(s-BP.RUBBER_S,d-BP.LANES[k],k?-1:1);y+=L.h*smooth(0,.4,e);clay=Math.max(clay,L.clay);worn=Math.max(worn,L.worn)}
    /* cleat marks and fine lumps: small dark dents scattered over the clay */
    const ck=hash(Math.floor(s*9),Math.floor(d*9),7);if(ck<.06*(.3+clay))y-=.006;
    y+=.004*(vn(s*6,d*6,5)-.5);p.setY(i,y);
    c.copy(dr).lerp(cl,clay*.9).lerp(we,worn*.55+.15*vn(s*.7,d*.7,6));c.multiplyScalar(.9+.2*vn(s*2.3,d*2.3,8)-(ck<.06*(.3+clay)?.15:0));C.set([c.r,c.g,c.b],i*3);
    uv.setXY(i,s/tileM,d/tileM)}
  g.setAttribute('color',new THREE.BufferAttribute(C,3));g.computeVertexNormals();return g}
/* the strip's height at (s, d), for parts that sit on it */
const groundAt=(s,d)=>{let y=BP.BASE_H;for(let k=0;k<2;k++)y+=lane(s-BP.RUBBER_S,d-BP.LANES[k],k?-1:1).h;return y};

/* home plate: 17 in across, the point toward the catcher (+x in the pen frame), 2 cm proud */
function plateGeo(){const a=.2159,b=.2159,sh=new THREE.Shape();sh.moveTo(-b,-a);sh.lineTo(0,-a);sh.lineTo(.2159,0);sh.lineTo(0,a);sh.lineTo(-b,a);sh.closePath();
  const g=new THREE.ExtrudeGeometry(sh,{depth:.02,bevelEnabled:true,bevelThickness:.004,bevelSize:.004,bevelSegments:1});g.rotateX(-Math.PI/2);return g}

/* side: +1 = road pen (+x, first base), -1 = home pen (-x, third base); P: the home park {pad, trim} */
export function buildBullpen(side,P,name){const zs=side>0?1:-1,g=new THREE.Group();g.name='prop:'+name;g.rotation.y=side>0?Math.PI/4:3*Math.PI/4;
  const add=(geo,m,x,y,z,ry=0,shadow=true)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z*zs);ms.rotation.y=ry*zs;ms.castShadow=shadow;ms.receiveShadow=true;g.add(ms);return ms};
  /* clay strip: the pbr.js dirt relief, vertex coloured (a clone, so the shared cached dirt material stays as it is) */
  const dirt=mat('dirt',{color:0xffffff,rough:.95}).clone();dirt.vertexColors=true;
  const sg=stripGeo(dirt.userData.tileM||.8);if(zs<0){const p=sg.attributes.position;for(let i=0;i<p.count;i++)p.setZ(i,-p.getZ(i));sg.index.array.reverse();sg.computeVertexNormals()}
  add(sg,dirt,0,0,0,0,false);
  /* rubbers and plates, dirtied white rubber; a rosin bag lying on the back of each mound */
  const white=mat('rubber',{relief:'plain',color:0xe4e0d6,rough:.8}),cloth=mat('vinylPad',{relief:'woven',color:0xe6e2d6,rough:.98});
  for(const [k,d] of BP.LANES.entries()){const r=BP.RUBBER_S;
    add(box(.15,.05,.61,.5),white,r-.075,groundAt(r-.075,d)-.02,d);
    const px=r+BP.PLATE_D;add(plateGeo(),white,px-.05,groundAt(px,d)-.012,d);
    const b=add(new THREE.SphereGeometry(.055,14,10),cloth,r-.9,groundAt(r-.9,d+(k?-.45:.45))+.012,d+(k?-.45:.45));b.scale.set(1,.42,.85)}
  /* bench against the stand front: wooden slats on a steel frame in the park pad colour, a backrest, a cooler and a ball bucket */
  const steel=mat('paintedSteel',{color:0x2c3340}).clone(),wood=mat('wood',{color:0x8a6038}),cooler=mat('gloss',{color:0xd8641e,rough:.35}),
    galv=mat('galvSteel'),ball=new THREE.MeshStandardMaterial({color:0xeeeae0,roughness:.7});
  const [b0,b1]=BP.BENCH,bl=b1-b0,bc=(b0+b1)/2,bz=BP.STAND_D-.32;
  for(let i=0;i<3;i++)add(box(bl,.035,.1,1.2),wood,bc,.44,bz-.12+i*.115);/* seat slats */
  for(let i=0;i<2;i++){const s=add(box(bl,.1,.03,1.2),wood,bc,.62+i*.17,bz+.2)}/* backrest slats */
  for(let i=0;i<4;i++){const x=b0+.2+i*(bl-.4)/3;add(box(.05,.42,.05),steel,x,.21,bz-.12);add(box(.05,.84,.05),steel,x,.42,bz+.22);add(box(.05,.04,.42),steel,x,.4,bz+.04)}
  add(box(bl-.3,.04,.04),steel,bc,.12,bz+.05);/* foot rail */
  add(cyl(.17,.17,.42,16),cooler,b0-.45,.21,bz);add(cyl(.18,.18,.06,16),mat('gloss',{color:0xf2f0e8,rough:.4}),b0-.45,.45,bz);/* cooler, white lid */
  add(cyl(.035,.03,.12,10),mat('gloss',{color:0xf4f4f0,rough:.5}),b0-.2,.5,bz-.05);/* a paper cup on the bench end */
  add(cyl(.17,.14,.36,14,1,true),galv,b1+.5,.18,bz-.05);/* bucket (open), balls heaped in it */
  for(let i=0;i<9;i++){const a=i*2.4,r=i?.09:0;add(new THREE.SphereGeometry(.037,10,8),ball,b1+.5+Math.cos(a)*r,.33+(i%3)*.03,bz-.05+Math.sin(a)*r)}
  /* bullpen phone: a painted steel box on the stand rail, by the bench, with the handset hung on its side */
  add(box(.24,.32,.12,.5),steel,b1+1.3,.75,BP.STAND_D-.06);add(box(.05,.2,.06,.5),mat('gloss',{color:0x1a1a1c,rough:.5}),b1+1.45,.75,BP.STAND_D-.12);
  /* the frame and phone in the home park's pad colour, darkened like old paint; called again on a park change */
  g.userData.recolor=Q=>{if(!Q)return;steel.color.set(Q.pad).multiplyScalar(.7)};
  g.userData.recolor(P);return g}

/* slot descriptors (#237): neither pen existed before, nothing to hide. ?prop=homeBullpen / ?prop=roadBullpen in the viewer. */
export const PROPS=[
  {name:'homeBullpen',build:c=>buildBullpen(-1,c.park(),'homeBullpen'),old:()=>[]},
  {name:'roadBullpen',build:c=>buildBullpen(1,c.park(),'roadBullpen'),old:()=>[]},
];
