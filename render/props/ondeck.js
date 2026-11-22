/* render/props/ondeck.js: the two on-deck circles (#215 polish lane, round 1). Polish rounds edit only this file (#237: index.js, game.js,
 * pbr.js and render/HANDOFF.md are read-only; new materials live here; round notes in this header and on the #215 board).
 * Before this there was no on-deck circle at all (the batter walks in from BAT_FROM in game.js, painted grass under him): old() is [].
 * Round 1, one circle per side, both in the home club's colours (the home club paints both, as in a real park):
 *   - shape: a 5 ft (1.52 m) synthetic-turf mat, DECK.H thick, with a rounded black rubber edge (lathe profile, so the rim catches the
 *     tower light at grazing angles and the mat throws a contact shadow on the grass instead of lying painted in it).
 *   - surface: turf mat on the pbr.js `rubber` kind with the `grain` relief (pebbled, matte), a ring band in the park trim colour and a
 *     made-up club emblem in the middle (crossed bats over a stitched ball: no real name or mark, rule 18), drawn once as an alpha mask
 *     so a park change only recolours it (`recolor`), never redraws it.
 *   - wear: infield dirt tracked onto the mat where the next batter stands and swings (two cleat patches, a swing arc of scuffs, the
 *     paint rubbed thin under the dirt), and a worn, dirt-dusted halo on the grass round the mat (a soft decal: the field map stays).
 *     The field map paints foul ground round home as dirt out to the 29 m arc, so both circles lie on dirt: the halo reads as dust there.
 *   - small parts: a rubber bat donut and a pine-tar rag lying on the mat, a rosin bag at the edge; the road side has a second donut.
 * Frame: world, home plate at the origin, pitcher toward -z, +x = first base. dugout(0) (road) is on +x, dugout(1) (home) on -x, so
 * the road circle is at +DECK.X and the home one at -DECK.X. `deckAt(team)` is exported for #42 (the on-deck batter waits here): the
 * circle centre, in the frame above. game.js BAT_FROM [-7, 2.6] is NOT this point; moving the batter is #42's job (lane A), not this file's.
 * Everything is seeded (fixed LCG): same park every load. Drawn on `max` only, like every prop. */
import * as THREE from 'three/webgpu';
import {mat} from '../pbr.js';

export const DECK={X:11.3,Z:1.2,/* circle centre (|x|, z): 37 ft to the side of the plate, a little behind its point (rule 2.01 diagram) */
  R:.762,/* mat radius (5 ft circle) */H:.018,/* mat thickness */EDGE:.03,/* width of the rounded rubber edge */
  RING:[.6,.7],/* trim-colour ring band: inner, outer radius */EMBLEM_R:.42,/* emblem radius */
  TURF:0x2b5232,/* mat colour (a little darker and bluer than the mowed grass, so it reads as a mat) */
  DIRT_A:.85,/* opacity of the tracked dirt at its densest */HALO_R:1.3,HALO_A:.22,/* worn grass halo round the mat: radius, opacity */
  TEX_PX:512,/* emblem mask and dirt decal size */LIFT:.0025,/* decal lift above the surface under it */
  RNG:2153};
export const deckAt=team=>[(team===0?1:-1)*DECK.X,DECK.Z];

const lcg=s=>()=>(s=(Math.imul(s,1103515245)+12345)&0x7fffffff)/0x7fffffff;
const canvas=px=>{const c=document.createElement('canvas');c.width=c.height=px;return c};
const tex=(c,srgb)=>{const t=new THREE.CanvasTexture(c);t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t};

/* the emblem and ring as one white-on-black mask (read as alphaMap: G channel), drawn once and shared by both circles */
let MASK=null;
function emblemMask(){if(MASK)return MASK;const N=DECK.TEX_PX,c=canvas(N),g=c.getContext('2d'),k=N/(2*DECK.R),C=N/2;
  g.fillStyle='#000';g.fillRect(0,0,N,N);g.fillStyle=g.strokeStyle='#fff';
  /* ring band */
  g.beginPath();g.arc(C,C,DECK.RING[1]*k,0,2*Math.PI);g.moveTo(C+DECK.RING[0]*k,C);g.arc(C,C,DECK.RING[0]*k,0,2*Math.PI);g.fill('evenodd');
  /* crossed bats, barrels up (toward centre field from the broadcast camera): long and slim, a thin handle swelling into the barrel,
     a small knob; round 1 tried short fat bats with a big ball and they read as crossbones, so the proportions are a real bat's */
  const bat=a=>{g.save();g.translate(C,C);g.rotate(a);const L=DECK.EMBLEM_R*2.3*k,h=.011*k,w=.03*k,x0=-L/2,x1=L/2;
    g.beginPath();g.moveTo(x0,-h);g.lineTo(x0+L*.38,-h);g.bezierCurveTo(x0+L*.55,-h,x0+L*.62,-w,x0+L*.75,-w);g.lineTo(x1-w,-w);g.arc(x1-w,0,w,-Math.PI/2,Math.PI/2);
    g.lineTo(x0+L*.75,w);g.bezierCurveTo(x0+L*.62,w,x0+L*.55,h,x0+L*.38,h);g.lineTo(x0,h);g.closePath();g.fill();
    g.beginPath();g.ellipse(x0,0,.008*k,.019*k,0,0,2*Math.PI);g.fill();g.restore()};
  bat(-Math.PI*.75);bat(-Math.PI*.25);
  /* the ball where they cross: a disc with its two seams painted out (clipped to the ball), stitches as short ticks across each seam */
  const br=DECK.EMBLEM_R*.27*k,by=C+.02*k;g.beginPath();g.arc(C,by,br,0,2*Math.PI);g.fill();
  g.save();g.beginPath();g.arc(C,by,br*.97,0,2*Math.PI);g.clip();g.strokeStyle=g.fillStyle='#000';g.lineWidth=.008*k;/* black = no paint (the mask is read as alphaMap) */
  for(const s of [-1,1]){const a0=s>0?Math.PI:0,cx=C+s*br*1.55;g.beginPath();g.arc(cx,by,br*1.05,a0-.7,a0+.7);g.stroke();
    for(let i=-3;i<=3;i++){const a=a0+i*.2;g.save();g.translate(cx+Math.cos(a)*br*1.05,by+Math.sin(a)*br*1.05);g.rotate(a+(i%2?.5:-.5));g.fillRect(-.014*k,-.003*k,.028*k,.006*k);g.restore()}}
  g.restore();
  /* paint rubbed thin where the batter stands: dark speckles thin the paint (the dirt decal covers the same spots) */
  const R=lcg(DECK.RNG+7);for(let i=0;i<900;i++){const a=R()*6.283,d=Math.sqrt(R())*.34,x=C+Math.cos(a)*d*k+.08*k,y=C+Math.sin(a)*d*k*.7,s=(1+R()*3)*N/512;
    g.fillStyle=`rgba(0,0,0,${.3+R()*.5})`;g.fillRect(x,y,s,s)}
  return MASK=tex(c,false)}

/* tracked dirt on the mat (inner) and the worn grass halo round it (outer), one RGBA decal each, shared by both circles */
let DIRT=null;
function dirtDecals(){if(DIRT)return DIRT;const N=DECK.TEX_PX,R=lcg(DECK.RNG);
  const draw=(rad,fn)=>{const c=canvas(N),g=c.getContext('2d'),k=N/(2*rad);fn(g,k,N/2);return tex(c,true)};
  const dab=(g,x,y,s,a,col)=>{g.fillStyle=`rgba(${col},${a})`;g.beginPath();g.ellipse(x,y,s,s*(.4+R()*.6),R()*3.14,0,7);g.fill()};
  const mud='96,78,62',dust='132,116,96';
  /* mat: two cleat patches where the feet go (the batter faces home: feet along x), a swing arc of scuffs, a dust film over it all */
  const mat_=draw(DECK.R,(g,k,C)=>{for(let i=0;i<260;i++)dab(g,C+(R()-.5)*1.3*k,C+(R()-.5)*1.3*k,(.004+R()*.01)*k,.12*R()*DECK.DIRT_A,dust);
    for(const fx of [-.22,.24])for(let i=0;i<220;i++){const a=R()*6.283,d=Math.sqrt(R())*.13;dab(g,C+(fx+Math.cos(a)*d*1.3)*k,C+(.06+Math.sin(a)*d)*k,(.004+R()*.011)*k,(.2+.5*R())*DECK.DIRT_A,i%4?mud:dust)}
    for(let i=0;i<140;i++){const a=-2.4+R()*1.9,d=.45+R()*.12;dab(g,C+Math.cos(a)*d*k,C+Math.sin(a)*d*k,(.004+R()*.012)*k,(.15+.4*R())*DECK.DIRT_A,mud)}
    /* a tracked line from the dugout side of the rim to the feet: where he walks on */
    for(let i=0;i<90;i++){const t=R(),x=lerp(.7,.1,t)+(R()-.5)*.12,y=lerp(-.35,.05,t)+(R()-.5)*.1;dab(g,C+x*k,C+y*k,(.008+R()*.014)*k,(.2+.4*R())*DECK.DIRT_A,mud)}});
  /* grass halo: soft dusty ring from DECK.R to HALO_R, densest just outside the rubber edge, a footpath toward home and the dugout */
  const halo=draw(DECK.HALO_R,(g,k,C)=>{const gr=g.createRadialGradient(C,C,DECK.R*k,C,C,DECK.HALO_R*k);gr.addColorStop(0,`rgba(${dust},${DECK.HALO_A})`);
    gr.addColorStop(.35,`rgba(${dust},${DECK.HALO_A*.45})`);gr.addColorStop(1,`rgba(${dust},0)`);g.fillStyle=gr;g.beginPath();g.arc(C,C,DECK.HALO_R*k,0,7);g.fill();
    for(let i=0;i<500;i++){const a=R()*6.283,d=DECK.R+Math.pow(R(),2)*(DECK.HALO_R-DECK.R);dab(g,C+Math.cos(a)*d*k,C+Math.sin(a)*d*k,(.004+R()*.01)*k,(.1+.3*R())*DECK.HALO_A,R()<.5?mud:dust)}
    g.globalCompositeOperation='destination-out';g.fillStyle='#000';g.beginPath();g.arc(C,C,(DECK.R-.01)*k,0,7);g.fill()});
  return DIRT={mat:mat_,halo}}
const lerp=(a,b,t)=>a+(b-a)*t;

/* disc in the xz plane, UVs 0..1 across its diameter (for the decals) */
const disc=(r,seg=64)=>{const g=new THREE.CircleGeometry(r,seg);g.rotateX(-Math.PI/2);return g};
/* disc with UVs in metres (for a tiled pbr.js relief) */
const discM=(r,tileM,seg=64)=>{const g=disc(r,seg),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-.5)*2*r/tileM,(uv.getY(i)-.5)*2*r/tileM);uv.needsUpdate=true;return g};

/* side: +1 = road (+x), -1 = home (-x); P: the home park {pad, trim} */
export function buildOnDeck(side,P,name){const {R,H,EDGE,LIFT}=DECK,g=new THREE.Group();g.name='prop:'+name;g.position.set(side*DECK.X,0,DECK.Z);
  const add=(geo,m,x=0,y=0,z=0,shadow=true)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.castShadow=shadow;ms.receiveShadow=true;g.add(ms);return ms};
  const turf=mat('rubber',{relief:'grain',color:DECK.TURF,rough:.9}),edge=mat('rubber',{color:0x16171a,rough:.8}),
    paint=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.75,metalness:0,alphaMap:emblemMask(),transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),
    D=dirtDecals(),decal=(map,a)=>new THREE.MeshStandardMaterial({map,roughness:1,metalness:0,transparent:true,opacity:a,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  /* the worn grass halo first (under everything), then the mat: turf top, rounded rubber edge (lathe: flat top, round shoulder, foot) */
  add(disc(DECK.HALO_R),decal(D.halo,1),0,LIFT,0,false).renderOrder=1;
  add(discM(R-EDGE,turf.userData.tileM),turf,0,H,0,false);
  const prof=[];for(let i=0;i<=8;i++){const a=i/8*Math.PI/2;prof.push(new THREE.Vector2(R-EDGE+EDGE*Math.sin(a)*.9,H*(.35+.65*Math.cos(a))))}prof.unshift(new THREE.Vector2(R-EDGE,H));
  prof.push(new THREE.Vector2(R,0));add(new THREE.LatheGeometry(prof,64),edge);
  add(new THREE.CylinderGeometry(R-EDGE,R-EDGE,H,64,1,true),edge,0,H/2,0,false);/* closes the edge's inner wall under the turf, for low cameras */
  /* paint (ring + emblem) and the tracked dirt on top of the turf */
  const pt=add(disc(R-EDGE),paint,0,H+LIFT,0,false);pt.renderOrder=2;
  add(disc(R-EDGE),decal(D.mat,1),0,H+2*LIFT,0,false).renderOrder=3;
  /* small parts. Donut: a rubber bat weight ring lying flat; rag: a folded pine-tar rag, stained; rosin bag: a squashed cloth pouch */
  const rub=mat('rubber',{color:0x1b1c20,rough:.6}),rag=mat('leather',{relief:'grain',color:0x3e2c1c,rough:.95}),cloth=mat('vinylPad',{relief:'woven',color:0xe6e2d6,rough:.98});
  const donut=(x,z,a)=>{const d=add(new THREE.TorusGeometry(.05,.022,10,24),rub,x,H+.022,z);d.rotation.x=Math.PI/2;d.rotation.z=a;d.scale.z=.85;return d};
  /* side * x: the parts lie on the dugout side of the circle (away from the plate), mirrored per side */
  donut(side*.42,-.28,.3);if(side>0)donut(side*.5,-.12,1.1);
  const r=add(new THREE.BoxGeometry(.2,.01,.13),rag,side*.38,H+.006,.3);r.rotation.y=side*.5;
  const b=add(new THREE.SphereGeometry(.055,14,10),cloth,side*(R+.12),.025,-.35);b.scale.set(1,.42,.85);
  const tie=add(new THREE.CylinderGeometry(.012,.02,.03,8),cloth,side*(R+.12),.05,-.35);tie.rotation.z=.3;
  /* colours: ring and emblem in the home club's trim, a little worn toward white so it reads on the dark mat; called again on a park change */
  g.userData.recolor=Q=>{if(!Q)return;paint.color.set(Q.trim).lerp(new THREE.Color(0xffffff),.12)};
  g.userData.recolor(P);return g}

/* slot descriptors (#237): neither circle existed before, nothing to hide. ?prop=homeOnDeck / ?prop=roadOnDeck in the viewer. */
export const PROPS=[
  {name:'homeOnDeck',build:c=>buildOnDeck(-1,c.park(),'homeOnDeck'),old:()=>[]},
  {name:'roadOnDeck',build:c=>buildOnDeck(1,c.park(),'roadOnDeck'),old:()=>[]},
];
