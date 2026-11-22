/* render/props/flags.js: the flags (#215 polish lane, round 1). Polish rounds edit only this file (#237: index.js, game.js, pbr.js and
 * render/HANDOFF.md are read-only; new materials live here; round notes in this header and on the #215 board).
 * Old: none (the park never had a flag), so old() is [] and nothing is hidden. Drawn on `max` only, like every polished prop.
 * Where: on top of the outfield bleachers' back wall (game.js OF_R 111.5, 10 rows, base 2.4: wall top 12.9 m, wall centre 9.5 m behind the
 * stand's front line), found from the stand groups themselves (`userData.stand`, base > 0, no roof), so a park that moves them carries them.
 *   - two tall CF poles just outside the batter's eye (it spans +-7.5 deg): the league flag at -FL.CF deg (third-base side) and the home
 *     team's flag at +FL.CF deg; their tops clear the eye's top (19.5 m), so from behind home they stand against the sky over the eye.
 *   - a row of four team pennant poles along the right-field wall (FL.ROW deg), one per team in TEAMS order (league/teams.js colours).
 *   The left field has none: the scoreboard (-28 deg, r 128, +-6 deg) stands right behind that wall.
 * Round 1:
 *   - shape: tapered galvanised poles on a base flange with gussets and anchor nuts, a clamp collar, a revolving truck with a gilt ball
 *     finial, a halyard running down the pole to a cleat, snap hooks at the flag's corners; cloth is a 24 x 14 grid that flies from the hoist.
 *   - surface: team flags = team colour field with a color2 hoist band and the owner's team mark (assets/logos/<id>_128.webp, CC BY 4.0
 *     owner art, already in the repo; the short name in Chinese until it loads, or if it never does); league flag = deep blue with a ball
 *     and four team-colour stripes at the fly end (no new name or mark: that is the owner's call). Matte cloth (rough .85, metal 0: well
 *     over the SSR mask), opaque, double-sided (no transparency, so the #267 MRT trap does not apply).
 *   - wear: the fly half is sun-faded and a little soiled, the fly edge is darker and uneven (fraying); poles have grime at the foot.
 *   - motion: one wind for the whole park (FL.WIND_YAW), every flag flies the same way; the cloth is a travelling wave that grows toward the
 *     fly end, with a little sag. Ambient only: it moves with the wall clock (performance.now), reads nothing from the game and changes
 *     nothing in it; the vertices are updated on the CPU at most FL.HZ times a second and only while the group is shown.
 * Still gives it away (round 2 ideas): the cloth has no real cloth simulation (no folds wrapping round the pole when the wind drops), the
 * wind never changes with the park's sky or the game, no woven fabric normal close up, poles are bare tubes (no seams, no lightning rod).
 * Frame: stand-local as in game.js stand(): +z = up the rows (away from home), x along the stand, y up. World: home plate at the origin. */
import * as THREE from 'three/webgpu';
import {mat,cyl} from '../pbr.js';
import {TEAMS} from '../../league/teams.js';

export const FL={WALL_TOP:12.9,/* back wall top of the outfield bleachers (base 2.4 + front 1 + 10 rows x .55 + back wall 4) */WALL_Z:9.5,/* its centre line */
  OF_R:111.5,OF_BASE:2.4,/* fallback ring when the stand groups are not in the scene (the viewer of a scene without the park) */
  CF:10,ROW:[16,23,30,37],/* pole angles, degrees from CF, + toward first base */
  CF_H:13,ROW_H:8,/* pole height over the wall top: CF tops at 25.9 m (eye top 19.5), row tops at 20.9 m */
  R0:.11,R1:.055,/* pole radius at the foot and the top */
  CF_W:3.6,CF_FH:2.4,ROW_W:2.4,ROW_FH:1.5,/* flag size (fly x hoist), m */
  NX:24,NY:14,/* cloth grid */
  WIND_YAW:-.6,/* the direction the flags fly, radians about +y from world +x (here: toward left field and a little toward home) */
  AMP:.16,/* wave amplitude at the fly end, as a share of the flag's length */K:2.2,/* waves per flag length */W:5.2,/* rad/s */SAG:.07,HZ:30,
  TEX_W:256,TEX_H:160,LOGO:'../../assets/logos/',LOGO_PX:128};

/* home team by park trim (game.js PARKS, copied: recolor() hands us {pad, trim} only) */
const TRIM_TEAM={0x5fd8c9:'pheasants',0xd58cf0:'owls',0xffa463:'macaques',0x7fb0ff:'muntjacs'};

/* seeded wobble (fixed hash: same flags every load) */
const hs=(i,k)=>{let h=Math.imul(i*374761393^k*668265263,2654435761);h^=h>>>13;h=Math.imul(h,1274126177);return((h^h>>>16)>>>0)/4294967296};
const hex=c=>'#'+c.toString(16).padStart(6,'0');

/* the cloth texture: drawn once, redrawn when the logo arrives or the home team changes */
function flagTex(){const c=document.createElement('canvas');c.width=FL.TEX_W;c.height=FL.TEX_H;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t}
const LOGOS={};
function logoOf(id,done){if(LOGOS[id]){if(LOGOS[id].complete&&LOGOS[id].naturalWidth)done(LOGOS[id]);else LOGOS[id].addEventListener('load',()=>done(LOGOS[id]),{once:true});return}
  const im=new Image();LOGOS[id]=im;im.addEventListener('load',()=>done(im),{once:true});im.src=new URL(`${FL.LOGO}${id}_${FL.LOGO_PX}.webp`,import.meta.url).href}
/* wear common to every flag: fly half faded, soiled, ragged darker fly edge */
function wear(g,W,H,seed){const f=g.createLinearGradient(0,0,W,0);f.addColorStop(0,'rgba(255,250,235,0)');f.addColorStop(.55,'rgba(255,250,235,.05)');f.addColorStop(1,'rgba(255,248,230,.17)');
  g.fillStyle=f;g.fillRect(0,0,W,H);const s=g.createLinearGradient(0,H,0,0);s.addColorStop(0,'rgba(40,32,20,.16)');s.addColorStop(.4,'rgba(40,32,20,0)');g.fillStyle=s;g.fillRect(0,0,W,H);
  g.fillStyle='rgba(20,16,10,.35)';for(let y=0;y<H;y+=4){const d=3+hs(seed,y)*9;g.fillRect(W-d,y,d,4)}
  g.fillStyle='rgba(0,0,0,.18)';g.fillRect(0,0,5,H)}/* the hoist hem */
function drawTeam(tex,T){const c=tex.image,g=c.getContext('2d'),W=c.width,H=c.height,band=W*.18;
  const paint=im=>{g.fillStyle=T.css||hex(T.color);g.fillRect(0,0,W,H);g.fillStyle=hex(T.color2??0xffffff);g.fillRect(0,0,band,H);
    g.fillStyle='rgba(255,255,255,.85)';g.fillRect(band,H*.08,W-band,H*.03);g.fillRect(band,H*.89,W-band,H*.03);
    const cx=band+(W-band)/2,cy=H/2,sz=H*.64;
    if(im)g.drawImage(im,cx-sz/2,cy-sz/2,sz,sz);
    else{g.fillStyle='#fff';g.font=`700 ${Math.round(H*.3)}px "Noto Sans TC",sans-serif`;g.textAlign='center';g.textBaseline='middle';g.fillText(T.short||'',cx,cy)}
    wear(g,W,H,T.color);tex.needsUpdate=true};
  paint(null);if(T.id)logoOf(T.id,paint)}
function drawLeague(tex){const c=tex.image,g=c.getContext('2d'),W=c.width,H=c.height;g.fillStyle='#13285a';g.fillRect(0,0,W,H);
  const sw=W*.07;TEAMS.forEach((T,i)=>{g.fillStyle=T.css||hex(T.color);g.fillRect(W-sw*(TEAMS.length-i),0,sw,H)});
  const cx=W*.4,cy=H/2,r=H*.27;g.fillStyle='#f3f1ea';g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.fill();
  /* two seams: arcs of circles centred outside the ball, each bulging toward the centre */
  g.save();g.beginPath();g.arc(cx,cy,r,0,Math.PI*2);g.clip();g.strokeStyle='#c8322c';g.lineWidth=H*.025;
  g.beginPath();g.arc(cx-r*1.45,cy,r*1.05,-1,1);g.stroke();g.beginPath();g.arc(cx+r*1.45,cy,r*1.05,Math.PI-1,Math.PI+1);g.stroke();g.restore()
  wear(g,W,H,7);tex.needsUpdate=true}

/* outfield back-wall frame at a world angle (deg from CF, + toward first base): the matching stand group, or the default ring */
function wallAt(deg,scene){const t=deg*Math.PI/180,st=[];scene&&scene.traverse(o=>{const S=o.userData&&o.userData.stand;if(o.name==='stand'&&S&&S.base>0&&!S.roof)st.push(S)});
  let S=null,best=1e9;for(const s of st){const a=Math.atan2(s.px,-s.pz),d=Math.abs(a-t);if(d<best){best=d;S=s}}
  if(!S||best>Math.PI/12)S={px:Math.sin(t)*FL.OF_R,pz:-Math.cos(t)*FL.OF_R,rotY:Math.atan2(Math.sin(t),-Math.cos(t)),rows:10,base:FL.OF_BASE};
  const a=Math.atan2(S.px,-S.pz),zc=S.rows?S.rows*.9+.5:FL.WALL_Z,top=S.rows?S.base+1+S.rows*.55+4:FL.WALL_TOP,
    o=new THREE.Object3D();o.position.set(S.px,0,S.pz);o.rotation.y=S.rotY;o.updateMatrix();
  /* where the ray from home at angle t crosses the wall line z = zc of that stand; the sign of x follows the stand's own frame */
  const r0=Math.hypot(S.px,S.pz)+zc,x=r0*Math.tan(t-a),p=new THREE.Vector3(x,top,zc).applyMatrix4(o.matrix),q=new THREE.Vector3(-x,top,zc).applyMatrix4(o.matrix);
  const pick=Math.abs(Math.atan2(p.x,-p.z)-t)<=Math.abs(Math.atan2(q.x,-q.z)-t)?p:q;return pick}

/* one pole at world point P (top of the wall), its flag; M = shared materials; returns {g, cloth} */
function buildPole(P,H,fw,fh,tex,M,seed){const {R0,R1,NX,NY}=FL,g=new THREE.Group();g.name='prop:flagpole';g.position.copy(P);
  const add=(geo,m,x,y,z,cast=true,par=g)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.castShadow=cast;ms.receiveShadow=true;par.add(ms);return ms},T=m=>m.userData.tileM||1;
  /* base: flange plate, four gussets, anchor nuts, clamp collar */
  add(cyl(.26,.26,.03,20,T(M.galv)),M.galv,0,.015,0);
  for(let k=0;k<4;k++){const a=k*Math.PI/2+Math.PI/4,gs=add(new THREE.BoxGeometry(.012,.22,.12),M.galv,Math.sin(a)*(R0+.06),.14,Math.cos(a)*(R0+.06));gs.rotation.y=a;
    add(new THREE.CylinderGeometry(.022,.022,.03,6),M.dark,Math.sin(a+.4)*.2,.045,Math.cos(a+.4)*.2,false)}
  add(cyl(R0+.025,R0+.025,.14,20,T(M.galv)),M.galv,0,.32,0);
  /* tapered pole with grime at the foot (vertex colour) */
  const pg=new THREE.CylinderGeometry(R1,R0,H,16,8,true),pp=pg.attributes.position,col=new Float32Array(pp.count*3);
  for(let i=0;i<pp.count;i++){const y=pp.getY(i)+H/2,k=1-.32*Math.max(0,1-y/1.6)**1.6;col.set([k,k*.98,k*.95],i*3)}
  pg.setAttribute('color',new THREE.BufferAttribute(col,3));pg.translate(0,H/2,0);add(pg,M.pole,0,0,0);
  /* truck and gilt ball */
  add(cyl(R1+.03,R1+.03,.09,16,T(M.galv)),M.galv,0,H+.045,0);add(new THREE.SphereGeometry(R1*2.2,18,12),M.gold,0,H+.09+R1*2,0);
  /* the flag hangs on the side the wind blows to: a sub-group turned to the wind (+x = downwind) */
  const fly=new THREE.Group();fly.rotation.y=FL.WIND_YAW;g.add(fly);const ytop=H-.25,hx=R1+.04;
  /* halyard: two lines from the truck down to a cleat on the pole's downwind side, the front line through the snap hooks */
  const cleatY=1.25,lineG=(y0,y1,x)=>{const l=add(cyl(.006,.006,y1-y0,5,1),M.rope,x,(y0+y1)/2,0,false,fly);return l};
  lineG(cleatY,H+.03,hx);lineG(cleatY,H+.03,R1+.015);
  add(new THREE.BoxGeometry(.03,.16,.03),M.dark,R0*.95+.015,cleatY,0,false,fly);
  for(const y of [ytop,ytop-fh])add(new THREE.SphereGeometry(.022,8,6),M.galv,hx,y,0,false,fly);/* snap hooks */
  /* cloth: hoist edge at local x = hx, fly toward +x, top at ytop */
  const cg=new THREE.PlaneGeometry(fw,fh,NX,NY);cg.translate(fw/2+hx,ytop-fh/2,0);
  const base=Float32Array.from(cg.attributes.position.array);
  const cloth=add(cg,M.cloth(tex),0,0,0,true,fly);cloth.frustumCulled=false;
  return {g,cloth:{mesh:cloth,base,fw,fh,hx,ytop,ph:hs(seed,3)*6.28,sp:.85+.3*hs(seed,5)}}}

/* move one flag's cloth to time t (s) */
function wave(C,t){const {AMP,K,W,SAG}=FL,p=C.mesh.geometry.attributes.position,a=p.array,b=C.base,L=C.fw;
  for(let i=0;i<a.length;i+=3){const u=Math.max(0,(b[i]-C.hx)/L),/* the hoist edge can come out a hair under 0: a negative u**1.15 is NaN */v=(C.ytop-b[i+1])/C.fh,ph=K*u*6.283-W*C.sp*t+C.ph+v*.9,amp=AMP*L*u**1.15;
    a[i+2]=amp*(Math.sin(ph)+.3*Math.sin(2.3*ph+1.7+v*2.1));
    a[i]=b[i]-amp*.35*(1+Math.cos(ph))*u;/* billows pull the fly in a little */
    a[i+1]=b[i+1]-SAG*L*u*u*(.6+.4*Math.sin(ph*.5))}
  p.needsUpdate=true;C.mesh.geometry.computeVertexNormals()}

/* ctx -> THREE.Group with every pole and flag; recolor(p) swaps the home flag when the park changes */
export function buildFlags(ctx){const g=new THREE.Group();g.name='prop:flags';
  const galv=mat('galvSteel',{relief:'plain',rough:.45,metal:.85}),pole=galv.clone();pole.vertexColors=true;
  const M={galv,pole,dark:mat('rubber',{relief:'plain',color:0x1a1c20,rough:.6}),gold:mat('gloss',{relief:'plain',color:0xc9a23a,rough:.42,metal:.85}),
    rope:new THREE.MeshStandardMaterial({color:0xd8d4c8,roughness:.9,metalness:0}),
    cloth:tex=>new THREE.MeshStandardMaterial({map:tex,roughness:.85,metalness:0,side:THREE.DoubleSide})};
  const scene=ctx&&ctx.scene,cloths=[];let homeTex=null;
  const put=(deg,H,fw,fh,tex,seed)=>{const P=wallAt(deg,scene),r=buildPole(P,H,fw,fh,tex,M,seed);g.add(r.g);cloths.push(r.cloth)};
  const lg=flagTex();drawLeague(lg);put(-FL.CF,FL.CF_H,FL.CF_W,FL.CF_FH,lg,1);
  homeTex=flagTex();put(FL.CF,FL.CF_H,FL.CF_W,FL.CF_FH,homeTex,2);
  FL.ROW.forEach((d,i)=>{const T=TEAMS[i%TEAMS.length],tx=flagTex();drawTeam(tx,T);put(d,FL.ROW_H,FL.ROW_W,FL.ROW_FH,tx,10+i)});
  let homeId;g.userData.recolor=p=>{const id=p&&TRIM_TEAM[p.trim],T=TEAMS.find(x=>x.id===id);if(id===homeId)return;homeId=id;if(T)drawTeam(homeTex,T);else drawLeague(homeTex)};
  g.userData.recolor(ctx&&ctx.park&&ctx.park());
  for(const C of cloths)wave(C,0);
  /* ambient wind: only while shown, at most FL.HZ updates a second; stops for good once the group has been taken out of its scene */
  let last=-1,had=false;const tick=now=>{if(g.parent)had=true;else if(had)return;
    let vis=!!g.parent;for(let o=g;o&&vis;o=o.parent)vis=o.visible;
    if(vis&&now-last>=1000/FL.HZ){last=now;const t=now/1000;for(const C of cloths)wave(C,t)}requestAnimationFrame(tick)};
  requestAnimationFrame(tick);return g}

/* slot descriptor (#237): there was never a flag, nothing to hide. ?prop=flags in the viewer. */
export const PROPS=[{name:'flags',build:c=>buildFlags(c),old:()=>[]}];
