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
 * Everything is seeded (fixed LCG): same park every load. Drawn on `max` only, like every prop.
 * Round 2 (board: flat paint, no turf pile or seam, no pine-tar stick or standing weight, rosin bag a squashed sphere):
 *   - #267 MRT trap: the halo, paint and dirt overlays (and the new rosin dust) are transparent quads; on max they wrote their flat
 *     normal, albedo and velocity over the whole disc into the scene pass's side targets. They now keep what lies under them (`keepBehind`).
 *   - paint: the ring and emblem have a film thickness (a normal map from the mask: a lit and a shadowed lip at every paint edge) and
 *     a worn ring edge (chips bitten out of both edges, heaviest on the side the batter steps over toward the plate).
 *   - turf: pile drawn here (fine fibre noise, combed one way: an albedo, a normal and a roughness image, tiled in metres) instead of the
 *     pebbled `rubber` look, and a roll seam across the mat (a dark line with a lifted lip in the dirt decal and a groove in the normal map).
 *   - small parts: a pine-tar stick (tar-blackened tip, paper label), a bat-weight sleeve standing on its end, the rosin bag as a cloth
 *     pillow gathered and tied at the neck, with a puff of white rosin dust on the ground round it. */
import * as THREE from 'three/webgpu';
import {mat} from '../pbr.js';

/* #267 trap (same as backstop.js): a transparent overlay keeps the normal, diffuse and velocity under it on max (game.js MRT_KEEP blends
   those targets like the material; alpha 0 there = keep). Only while the renderer has an MRT: a material MRT alone drops the colour output. */
const KEEP=['normal','diffuse','velocity'];let KEEP_MRT=null;
function keepBehind(m){let Rn=null;const setup=m.setup;
  m.setup=function(b){Rn=b.renderer;return setup.call(this,b)};
  Object.defineProperty(m,'mrtNode',{get:()=>Rn&&Rn.getMRT&&Rn.getMRT()?(KEEP_MRT||(KEEP_MRT=THREE.TSL.mrt(Object.fromEntries(KEEP.map(n=>[n,THREE.TSL.vec4(0)]))))):null,set(){}});
  return m}

export const DECK={X:11.3,Z:1.2,/* circle centre (|x|, z): 37 ft to the side of the plate, a little behind its point (rule 2.01 diagram) */
  R:.762,/* mat radius (5 ft circle) */H:.018,/* mat thickness */EDGE:.03,/* width of the rounded rubber edge */
  RING:[.6,.7],/* trim-colour ring band: inner, outer radius */EMBLEM_R:.42,/* emblem radius */
  TURF:0x2b5232,/* mat colour (a little darker and bluer than the mowed grass, so it reads as a mat) */
  DIRT_A:.85,/* opacity of the tracked dirt at its densest */HALO_R:1.3,HALO_A:.22,/* worn grass halo round the mat: radius, opacity */
  TEX_PX:512,/* emblem mask and dirt decal size */LIFT:.0025,/* decal lift above the surface under it */
  RNG:2153,
  /* round 2 */
  PAINT_N:2.2,/* paint film normal strength (edge lip) */CHIPS:340,/* chips bitten out of the ring edges */
  PILE_PX:256,PILE_M:.25,/* turf pile image size, tile in metres */PILE_N:1.6,/* pile normal strength */PILE_COMB:.35,/* how much the pile lies one way */
  SEAM:.18,/* roll seam: offset from the centre along z (m), across the mat in x */
  TAR:[.32,.022],/* pine-tar stick: length, radius */SLEEVE:[.19,.034,.028],/* bat-weight sleeve: height, foot radius, top radius */
  ROSIN:[.11,.035,.08],/* rosin bag half sizes x, y, z */DUST_R:.32,DUST_A:.55,/* rosin dust puff on the ground: radius, opacity */
};
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
  /* round 2: worn ring edges, chips bitten out of both edges (more toward -y = toward the plate side the batter steps over), a few nicks inside */
  {const Rc=lcg(DECK.RNG+11);g.fillStyle='#000';for(let i=0;i<DECK.CHIPS;i++){const a=Rc()*6.283,w=.55+.45*Math.max(0,-Math.sin(a)),e=Rc()<.5?0:1;
    if(Rc()>w)continue;const r=DECK.RING[e]*k+(e?-1:1)*(Rc()*.012)*k,s=(.002+Rc()*Rc()*Rc()*.012)*k;
    g.beginPath();g.ellipse(C+Math.cos(a)*r,C+Math.sin(a)*r,s*(1+Rc()),s,a+Rc(),0,7);g.fill()}
    for(let i=0;i<60;i++){const a=Rc()*6.283,r=(DECK.RING[0]+Rc()*(DECK.RING[1]-DECK.RING[0]))*k,s=(.002+Rc()*.005)*k;g.fillRect(C+Math.cos(a)*r,C+Math.sin(a)*r,s,s*.6)}
    g.fillStyle='#fff'}
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
  MASK_C=c;return MASK=tex(c,false)}
let MASK_C=null,PAINT_NM=null;
/* round 2: the paint film's normal map, from the mask's slope (paint = raised): a lip at every edge catches or loses the light */
function paintNormal(){if(PAINT_NM)return PAINT_NM;emblemMask();const N=DECK.TEX_PX,src=MASK_C.getContext('2d').getImageData(0,0,N,N).data,
  h=(x,y)=>src[(Math.min(N-1,Math.max(0,y))*N+Math.min(N-1,Math.max(0,x)))*4+1]/255,c=canvas(N),g=c.getContext('2d'),im=g.createImageData(N,N),d=im.data;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=(y*N+x)*4,dx=(h(x+1,y)-h(x-1,y))*DECK.PAINT_N,dy=(h(x,y+1)-h(x,y-1))*DECK.PAINT_N,l=Math.hypot(dx,dy,1);
    d[i]=(.5-dx/l/2)*255;d[i+1]=(.5+dy/l/2)*255;d[i+2]=(.5+.5/l)*255;d[i+3]=255}
  g.putImageData(im,0,0);return PAINT_NM=tex(c,false)}

/* round 2: synthetic turf pile, drawn here (pbr.js has no pile relief and polish rounds do not add to the shared file's look):
   fibre tufts in rows, each a short streak combed toward +u, with tip lightening; albedo multiplier, normal and roughness, tileable */
let PILE=null;
function pileMaps(){if(PILE)return PILE;const N=DECK.PILE_PX,R=lcg(DECK.RNG+23),H=new Float32Array(N*N);
  for(let i=0;i<N*N;i++)H[i]=.35+.1*R();
  for(let t=0;t<N*N/5;t++){const x0=R()*N,y0=R()*N,len=2+R()*5,a=DECK.PILE_COMB*(R()-.2),hgt=.45+.55*R();
    for(let s=0;s<len;s++){const x=Math.round(x0+Math.cos(a)*s),y=Math.round(y0+Math.sin(a)*s),j=((y%N+N)%N)*N+((x%N+N)%N);H[j]=Math.max(H[j],hgt*(.6+.4*s/len))}}
  const at=(x,y)=>H[((y+N)%N)*N+((x+N)%N)],mk=(fill,srgb)=>{const c=canvas(N),g=c.getContext('2d'),im=g.createImageData(N,N);fill(im.data);g.putImageData(im,0,0);
    const t=tex(c,srgb);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t};
  const map=mk(d=>{for(let i=0;i<N*N;i++){const k=.55+.45*H[i];d[i*4]=d[i*4+1]=d[i*4+2]=k*255;d[i*4+3]=255}},true);
  const nm=mk(d=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,dx=(at(x+1,y)-at(x-1,y))*DECK.PILE_N,dy=(at(x,y+1)-at(x,y-1))*DECK.PILE_N,l=Math.hypot(dx,dy,1);
    d[i*4]=(.5-dx/l/2)*255;d[i*4+1]=(.5+dy/l/2)*255;d[i*4+2]=(.5+.5/l)*255;d[i*4+3]=255}});
  const rm=mk(d=>{for(let i=0;i<N*N;i++){d[i*4]=d[i*4+1]=d[i*4+2]=(.8+.2*(1-H[i]))*255;d[i*4+3]=255}});
  return PILE={map,nm,rm}}

/* tracked dirt on the mat (inner) and the worn grass halo round it (outer), one RGBA decal each, shared by both circles */
let DIRT=null;
function dirtDecals(){if(DIRT)return DIRT;const N=DECK.TEX_PX,R=lcg(DECK.RNG);
  const draw=(rad,fn)=>{const c=canvas(N),g=c.getContext('2d'),k=N/(2*rad);fn(g,k,N/2);return tex(c,true)};
  const dab=(g,x,y,s,a,col)=>{g.fillStyle=`rgba(${col},${a})`;g.beginPath();g.ellipse(x,y,s,s*(.4+R()*.6),R()*3.14,0,7);g.fill()};
  const mud='96,78,62',dust='132,116,96';
  /* mat: two cleat patches where the feet go (the batter faces home: feet along x), a swing arc of scuffs, a dust film over it all */
  const mat_=draw(DECK.R,(g,k,C)=>{
    /* round 2: the roll seam across the mat (canvas y = world +z): a dark gap with a lifted, lighter lip on one side, a little wavy */
    for(let x=0;x<2*C;x+=2){const y=C+DECK.SEAM*k+Math.sin(x*.05)*.6+(R()-.5)*.8;g.fillStyle='rgba(18,26,18,.55)';g.fillRect(x,y-1,2,2.2);
      g.fillStyle='rgba(150,170,140,.16)';g.fillRect(x,y+1.4,2,1.6)}
    for(let i=0;i<260;i++)dab(g,C+(R()-.5)*1.3*k,C+(R()-.5)*1.3*k,(.004+R()*.01)*k,.12*R()*DECK.DIRT_A,dust);
    for(const fx of [-.22,.24])for(let i=0;i<220;i++){const a=R()*6.283,d=Math.sqrt(R())*.13;dab(g,C+(fx+Math.cos(a)*d*1.3)*k,C+(.06+Math.sin(a)*d)*k,(.004+R()*.011)*k,(.2+.5*R())*DECK.DIRT_A,i%4?mud:dust)}
    for(let i=0;i<140;i++){const a=-2.4+R()*1.9,d=.45+R()*.12;dab(g,C+Math.cos(a)*d*k,C+Math.sin(a)*d*k,(.004+R()*.012)*k,(.15+.4*R())*DECK.DIRT_A,mud)}
    /* a tracked line from the dugout side of the rim to the feet: where he walks on */
    for(let i=0;i<90;i++){const t=R(),x=lerp(.7,.1,t)+(R()-.5)*.12,y=lerp(-.35,.05,t)+(R()-.5)*.1;dab(g,C+x*k,C+y*k,(.008+R()*.014)*k,(.2+.4*R())*DECK.DIRT_A,mud)}});
  /* grass halo: soft dusty ring from DECK.R to HALO_R, densest just outside the rubber edge, a footpath toward home and the dugout */
  const halo=draw(DECK.HALO_R,(g,k,C)=>{const gr=g.createRadialGradient(C,C,DECK.R*k,C,C,DECK.HALO_R*k);gr.addColorStop(0,`rgba(${dust},${DECK.HALO_A})`);
    gr.addColorStop(.35,`rgba(${dust},${DECK.HALO_A*.45})`);gr.addColorStop(1,`rgba(${dust},0)`);g.fillStyle=gr;g.beginPath();g.arc(C,C,DECK.HALO_R*k,0,7);g.fill();
    for(let i=0;i<500;i++){const a=R()*6.283,d=DECK.R+Math.pow(R(),2)*(DECK.HALO_R-DECK.R);dab(g,C+Math.cos(a)*d*k,C+Math.sin(a)*d*k,(.004+R()*.01)*k,(.1+.3*R())*DECK.HALO_A,R()<.5?mud:dust)}
    g.globalCompositeOperation='destination-out';g.fillStyle='#000';g.beginPath();g.arc(C,C,(DECK.R-.01)*k,0,7);g.fill()});
  /* round 2: rosin dust round the bag: white puffs, densest under it, a smear where it is dropped and picked up */
  const dust_=draw(DECK.DUST_R,(g,k,C)=>{const gr=g.createRadialGradient(C,C,0,C,C,DECK.DUST_R*k*.8);gr.addColorStop(0,'rgba(240,238,230,.55)');gr.addColorStop(1,'rgba(240,238,230,0)');
    g.fillStyle=gr;g.fillRect(0,0,2*C,2*C);
    for(let i=0;i<400;i++){const a=R()*6.283,d=Math.pow(R(),1.6)*DECK.DUST_R*.95;dab(g,C+Math.cos(a)*d*k*1.15,C+Math.sin(a)*d*k,(.002+R()*.006)*k,.15+.5*R()*(1-d/DECK.DUST_R),'244,242,236')}});
  return DIRT={mat:mat_,halo,dust:dust_}}
const lerp=(a,b,t)=>a+(b-a)*t;

/* disc in the xz plane, UVs 0..1 across its diameter (for the decals) */
const disc=(r,seg=64)=>{const g=new THREE.CircleGeometry(r,seg);g.rotateX(-Math.PI/2);return g};
/* disc with UVs in metres (for a tiled pbr.js relief) */
const discM=(r,tileM,seg=64)=>{const g=disc(r,seg),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)-.5)*2*r/tileM,(uv.getY(i)-.5)*2*r/tileM);uv.needsUpdate=true;return g};

/* side: +1 = road (+x), -1 = home (-x); P: the home park {pad, trim} */
export function buildOnDeck(side,P,name){const {R,H,EDGE,LIFT}=DECK,g=new THREE.Group();g.name='prop:'+name;g.position.set(side*DECK.X,0,DECK.Z);
  const add=(geo,m,x=0,y=0,z=0,shadow=true)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.castShadow=shadow;ms.receiveShadow=true;g.add(ms);return ms};
  const Pm=pileMaps(),edge=mat('rubber',{color:0x16171a,rough:.8}),
    turf=new THREE.MeshStandardMaterial({color:DECK.TURF,map:Pm.map,normalMap:Pm.nm,roughnessMap:Pm.rm,roughness:1,metalness:0}),
    paint=keepBehind(new THREE.MeshStandardNodeMaterial({color:0xffffff,roughness:.75,metalness:0,alphaMap:emblemMask(),normalMap:paintNormal(),transparent:true,opacity:.9,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2})),
    D=dirtDecals(),decal=(map,a)=>keepBehind(new THREE.MeshStandardNodeMaterial({map,roughness:1,metalness:0,transparent:true,opacity:a,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}));
  /* the worn grass halo first (under everything), then the mat: turf top, rounded rubber edge (lathe: flat top, round shoulder, foot) */
  add(disc(DECK.HALO_R),decal(D.halo,1),0,LIFT,0,false).renderOrder=1;
  add(discM(R-EDGE,DECK.PILE_M),turf,0,H,0,false);
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
  /* round 2, rosin bag: a cloth pillow (sphere pushed toward a rounded box, flat underside, sagging), gathered into a neck at one end
     with a cord tie and a short frilled tail; white rosin dust on the ground round it */
  const [bx,by,bz]=DECK.ROSIN,bp=[side*(R+.14),0,-.36],rb=new THREE.SphereGeometry(1,28,18),p=rb.attributes.position,Rr=lcg(DECK.RNG+31);
  for(let i=0;i<p.count;i++){let x=p.getX(i),y=p.getY(i),z=p.getZ(i);const m=Math.max(Math.abs(x),Math.abs(y),Math.abs(z))||1,q=.55;
    x=x*(1-q)+x/m*q*.92;z=z*(1-q)+z/m*q*.92;y=Math.max(-.85,y);/* boxy pillow, flat where it rests */
    const neck=Math.max(0,x)**3;z*=1-.75*neck;y*=1-.6*neck;/* gathers toward +x */
    y+=.06*Math.sin(z*5+x*3)*(1-Math.abs(y));p.setXYZ(i,x*bx,(y+.85)*by,z*bz+(Rr()-.5)*.002)}
  rb.computeVertexNormals();const bag=add(rb,cloth,bp[0],0,bp[2]);bag.rotation.y=side>0?2.6:.5;
  const nx=bag.position.x+Math.cos(-bag.rotation.y)*bx*.98,nz=bag.position.z+Math.sin(-bag.rotation.y)*bx*.98;
  const cord=add(new THREE.TorusGeometry(.012,.004,6,14),mat('rubber',{color:0x7a5a3a,rough:.9}),nx,by*.75,nz);cord.rotation.y=bag.rotation.y+Math.PI/2;
  const tail=add(new THREE.ConeGeometry(.018,.035,8,1,true),cloth,nx+Math.cos(-bag.rotation.y)*.022,by*.75,nz+Math.sin(-bag.rotation.y)*.022);
  tail.rotation.z=Math.PI/2;tail.rotation.y=bag.rotation.y;
  add(disc(DECK.DUST_R),decal(D.dust,DECK.DUST_A),bp[0],LIFT*1.5,bp[2],false).renderOrder=1;
  /* pine-tar stick lying on the mat: a turned handle wrapped in a paper label, the tip blackened and glossy with tar */
  const [tl,tr]=DECK.TAR,stick=new THREE.Group();stick.position.set(side*.18,H+tr,-.42);stick.rotation.y=side*.9;g.add(stick);
  const sp=(geo,m,x)=>{const s=new THREE.Mesh(geo,m);s.rotation.z=Math.PI/2;s.position.x=x;s.castShadow=s.receiveShadow=true;stick.add(s);return s};
  sp(new THREE.CylinderGeometry(tr*.9,tr,tl*.55,14),mat('wood',{color:0x6b4a2c,rough:.7}),-tl*.2);
  sp(new THREE.CylinderGeometry(tr*1.03,tr*1.03,tl*.22,14),mat('vinylPad',{relief:'plain',color:0xd8cfb4,rough:.9}),-tl*.12);/* label */
  sp(new THREE.CylinderGeometry(tr*1.08,tr*.95,tl*.4,14),mat('gloss',{color:0x17100a,rough:.3}),tl*.28);/* tar end (rough .3: under the SSR mask only on a tiny part) */
  sp(new THREE.SphereGeometry(tr*1.08,12,8),mat('gloss',{color:0x17100a,rough:.3}),tl*.48);
  /* bat-weight sleeve standing on its end at the rim: tapered black rubber, a ribbed band, the bore dark on top */
  const [sh,sr0,sr1]=DECK.SLEEVE,sx=side*.6,sz=.38;
  add(new THREE.CylinderGeometry(sr1,sr0,sh,20),mat('rubber',{relief:'grain',color:0x1b1c20,rough:.6}),sx,H+sh/2,sz);
  add(new THREE.CylinderGeometry(sr0*1.04,sr0*1.06,.03,20),mat('rubber',{color:0x2a2b30,rough:.7}),sx,H+.04,sz);
  add(new THREE.CircleGeometry(sr1*.62,16).rotateX(-Math.PI/2),new THREE.MeshStandardMaterial({color:0x050505,roughness:1}),sx,H+sh+.001,sz,false);
  /* colours: ring and emblem in the home club's trim, a little worn toward white so it reads on the dark mat; called again on a park change */
  g.userData.recolor=Q=>{if(!Q)return;paint.color.set(Q.trim).lerp(new THREE.Color(0xffffff),.12)};
  g.userData.recolor(P);return g}

/* slot descriptors (#237): neither circle existed before, nothing to hide. ?prop=homeOnDeck / ?prop=roadOnDeck in the viewer. */
export const PROPS=[
  {name:'homeOnDeck',build:c=>buildOnDeck(-1,c.park(),'homeOnDeck'),old:()=>[]},
  {name:'roadOnDeck',build:c=>buildOnDeck(1,c.park(),'roadOnDeck'),old:()=>[]},
];
