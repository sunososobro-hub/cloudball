/* render/props/batterseye.js: the batter's eye (#215 polish lane, rounds 1-2). Polish rounds edit only this file (#237: index.js, game.js,
 * pbr.js and render/HANDOFF.md are read-only; new materials live here; round notes in this header and on the #215 board).
 * Old: none (the park never had one), so old() is [] and the fans stay exactly as they are (owner: leave the fans; #215: no fans' geometry).
 * Where: a real batter's eye is a dark, matte, unlit wall straight behind the pitcher as the batter sees him. Our CF bleachers run right
 * behind the fence (game.js OF_R 111.5, 10 rows, back wall top at 12.9 m, back face at r 121.5), so the screen stands BEHIND the CF
 * bleachers, centred on the CF line, and rises well over their back wall: from the plate and from the broadcast camera behind home it is the
 * dark block that fills the sky over the CF seats (the bright, busy sky there is what it replaces). The high CF camera (game.js SEATS,
 * z -112, y 16) stands in front of it and looks at home, so it never sees it. The scoreboard (-28 deg, r 128) is well clear of its edge.
 * Round 1:
 *   - shape: one curved screen on the arc EYE.R, EYE.HALF deg each side of CF, EYE.TOP high, built of upright sheets EYE.SHEET wide with
 *     a back skin, end closures and a coping along the top; behind it a steel frame (columns, girts, X-braces in every other bay, footings).
 *   - surface: standing-seam sheets on the pbr.js `ribbed` relief turned upright, painted a near-black green and kept fully matte (rough
 *     ~.95, metal ~0: well over the SSR mask, a batter's eye exists to give no glare; it must never light up on `max`).
 *   - wear: each sheet a slightly different paint (a few newer, darker replacements), sun-faded toward the top, grime at the foot,
 *     a dark band under the coping, and thin rust runs from the coping and the girt fixing lines (opaque strips: no transparency, so the
 *     #267 MRT trap does not apply).
 *   - small parts: a caged ladder up the back at the third-base end, a grated catwalk with a handrail along the back under the coping,
 *     a service door at the foot of each end.
 * Round 2 (round 1's list: flat sheets, plain coping):
 *   - surface: the front sheets drop the pbr.js `ribbed` deck relief (corrugation .8 m apart that striped the wall black at 125 m) for
 *     their own standing-seam maps built here (seamMaps: one tile = one sheet, seam on every joint, trough at its foot, two pencil ribs,
 *     faint roll marks), still matte (mean roughness ~.95).
 *   - shape: oil-canning. Each sheet has a middle column and a row half way between girts; the pan in every bay dishes in (away from home)
 *     by up to EYE.OIL, seeded per sheet and bay; vertex normals per sheet, so each sheet takes the light its own way.
 *   - coping: sun-faded cap plate washed to the back, front fascia with a hemmed drip standing proud of the sheets, back lip, a lap cover
 *     strip at every 2 m joint.
 *   - wear and small parts: pale wash streaks from under the coping (what still reads on the dark wall from behind home), two painted
 *     fasteners per sheet on every girt line (where the rust runs start).
 * Still gives it away (round 3 ideas): the batter's sightline to the release point (~2.8 m at the fence) still lands on the front CF rows,
 * as a real one needs those seats closed (the owner's call, not this file's); oil-canning only shows in grazing light (not proven headless);
 * no CF camera platform or tunnel in front (camera wells are their own slot); no lightning rod or aircraft lamp on top; the back skin is
 * still the plain ribbed deck.
 * Frame: world, home plate at the origin, CF toward -z; a point at angle t (radians, + toward first base / +x) and radius r is
 * (sin t * r, y, -cos t * r), like game.js's bleachers. Everything is seeded (fixed LCG): same park every load. Drawn on `max` only. */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const EYE={R:122.6,/* front face radius (CF bleachers' back face is at 121.5) */HALF:7.5,/* half width, degrees each side of CF */
  TOP:19.5,/* top of the sheets, m (bleachers' back wall top is 12.9: ~6.6 m shows over it) */SHEET:1.0,/* sheet width along the arc */
  ROWS:[0,2,6,11,16,19.5],/* vertex rows of the sheets (colour gradient steps), m; fixing lines (girts) are the inner ones */
  SKIN:.16,/* front sheet to back skin */COLOR:0x1e3428,/* paint: dark green, deep enough to read black-green at 130 m but not a hole in the night */ROUGH:.95,RIB_K:4,/* back skin ribs .8 m apart */
  /* round 2: the front sheets get their own standing-seam texture, one tile = one sheet across (seams exactly on the sheet joints) and
     SEAM_TILE m up: a 3 cm standing seam with a shadow trough at its foot, two pencil ribs in the pan, faint roll marks */
  SEAM_TILE:2.5,SEAM_PX:256,SEAM_W:.015,SEAM_FOOT:.035,PENCIL:.018,
  OIL:.05,/* oil-canning: the pan between two girts bows up to this far (m), its own way per sheet and bay; seams and girt lines stay put */
  STREAKS:34,STREAK_W:[.03,.08],STREAK_L:[.6,3.2],STREAK:0x56605a,/* pale wash streaks from the coping (bird lime, chalky run-off) */
  FIX_OFF:.27,FIX_R:.009,/* exposed fasteners: two per sheet at every girt line, this far each side of the sheet's middle */
  LAP:.12,CAP_TILT:.07,/* coping: lap cover strip width at every 2 m joint, cap plate wash to the back (rad) */
  VAR:.07,NEW:.06,NEW_K:.8,/* per-sheet paint spread, share of replacement sheets and their tone */FADE:.22,/* lighter at the top by this much */
  GRIME_H:2.2,GRIME_K:.62,/* grime at the foot: height and darkest tone */CAP_BAND:.7,CAP_K:.75,/* dark band under the coping */
  COPE_H:.28,COPE_D:.42,/* coping */COL_GAP:4,COL_W:.3,COL_BACK:1.1,/* columns: spacing along the arc, size, distance behind the skin */
  GIRT:[2,6,11,16],GIRT_H:.2,BRACE_W:.12,FOOT:[.9,.5,.9],/* girt heights, girt depth, brace size, footing w,h,d */
  RUNS:70,RUN_W:[.03,.08],RUN_L:[.4,2.4],RUN_OFF:.012,RUST:0x4e3424,/* rust runs: count, width, length, lift off the sheet, colour */
  WALK_Y:17.6,WALK_W:.8,RAIL_H:1.05,/* catwalk height (top of grating), width, handrail */
  LADDER_W:.5,CAGE_R:.38,DOOR:[1,2.1],RNG:2154};

const lcg=s=>()=>(s=(Math.imul(s,1103515245)+12345)&0x7fffffff)/0x7fffffff;
const D2R=Math.PI/180,at=(t,r,y)=>new THREE.Vector3(Math.sin(t)*r,y,-Math.cos(t)*r);
const M4=(p,ry,rx=0,rz=0,s=[1,1,1])=>new THREE.Matrix4().compose(p,new THREE.Quaternion().setFromEuler(new THREE.Euler(rx,ry,rz,'YXZ')),new THREE.Vector3(...s));
function inst(geo,m,mats,shadow=false){const im=new THREE.InstancedMesh(geo,m,mats.length);mats.forEach((x,i)=>im.setMatrixAt(i,x));im.instanceMatrix.needsUpdate=true;
  im.castShadow=shadow;im.receiveShadow=true;im.computeBoundingSphere();return im}
/* yaw that turns a part's +z toward home at angle t (its local -z points away from the field, into CF) */
const yawAt=t=>-t;

/* curved sheet wall on radius r: one quad strip per sheet (own vertex colours), rows at EYE.ROWS; UVs in metres, turned so the ribs
   of the `ribbed` relief run upright (u = height, v = arc length). back = true: the skin facing away from the field. */
function sheetWall(r,tile,colourOf,back,bow=null){const T0=-EYE.HALF*D2R,T1=EYE.HALF*D2R,len=(T1-T0)*r,n=Math.round(len/EYE.SHEET),P=[],U=[],C=[],I=[];
  /* round 2: three columns per sheet (seam, middle, seam) and a row half way between girts, so a sheet can bow (oil-canning) in each bay */
  const rows=[];EYE.ROWS.forEach((y,j)=>{if(j)rows.push({y:(EYE.ROWS[j-1]+y)/2,mid:true});rows.push({y,mid:false})});
  const tv=typeof tile==='number'?tile:tile.v,tu=typeof tile==='number'?tile:tile.u;
  for(let s=0;s<n;s++){const a0=T0+(T1-T0)*s/n,a1=T0+(T1-T0)*(s+1)/n,base=P.length/3;
    rows.forEach((w,j)=>[a0,(a0+a1)/2,a1].forEach((a,k)=>{const off=bow&&w.mid?bow(s,j)*(k===1?1:.25):0,p=at(a,r-off,w.y);P.push(p.x,p.y,p.z);
      U.push(w.y/tu,(a-T0)*r/tv);const c=colourOf(s,w.y);C.push(c.r,c.g,c.b)}));
    for(let j=0;j<rows.length-1;j++)for(let k=0;k<2;k++){const A=base+j*3+k,B=A+1,Cc=A+3,D=A+4;/* A bottom-left as seen from home: (A,B,C),(B,D,C) face home */
      if(back)I.push(A,Cc,B,B,Cc,D);else I.push(A,B,Cc,B,D,Cc)}}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));g.setAttribute('color',new THREE.Float32BufferAttribute(C,3));g.setIndex(I);
  g.computeVertexNormals();/* per sheet (no vertex is shared across a seam), so each sheet catches the light a little its own way */
  g.computeBoundingSphere();return{g,n,sheetW:len/n}}

/* round 2: standing-seam sheet maps, built here (slot rule: pbr.js is read-only). Same three images and conventions as pbr.js reliefMaps:
   albedo multiplier darker in the hollows, normal map from the slope, roughness image RM .6..1 and its mean. u = height, v = across one sheet. */
const hsh=(x,y,k)=>{let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296};
function vnz(x,y,k,px,py){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  H=(a,b)=>hsh(((a%px)+px)%px,((b%py)+py)%py,k),a=H(xi,yi),b=H(xi+1,yi),c=H(xi,yi+1),e=H(xi+1,yi+1);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
const sat=x=>x<0?0:x>1?1:x,sm=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)};
let SEAM=null;
function seamMaps(){if(SEAM)return SEAM;const N=EYE.SEAM_PX,W=EYE.SHEET,H=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=(x+.5)/N,v=(y+.5)/N,d=Math.min(v,1-v)*W,/* metres to the nearest seam */
    seam=d<EYE.SEAM_W?1:.18+.27*sm(EYE.SEAM_W,EYE.SEAM_FOOT,d),/* seam top, then a trough at its foot rising to the pan */
    pencil=.2*(1-sm(0,EYE.PENCIL,Math.abs(d-W/3))),roll=.04*(vnz(u*3,v*24,5,3,24)-.5)+.03*(vnz(u*40,v*40,6,40,40)-.5);
    H[y*N+x]=sat(seam+(d<EYE.SEAM_W?0:pencil+roll))}
  const cv=fill=>{const c=document.createElement('canvas');c.width=c.height=N;const g=c.getContext('2d'),im=g.createImageData(N,N);fill(im.data);g.putImageData(im,0,0);
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t},A=(x,y)=>H[((y+N)%N)*N+((x+N)%N)];
  const ao=cv(d=>{for(let i=0;i<N*N;i++){const k=1-.5*(1-H[i])**1.5;d[i*4]=d[i*4+1]=d[i*4+2]=k*255;d[i*4+3]=255}});ao.colorSpace=THREE.SRGBColorSpace;
  const nm=cv(d=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,dx=(A(x+1,y)-A(x-1,y))*1.6*N/64,dy=(A(x,y+1)-A(x,y-1))*1.6*N/64,l=Math.hypot(dx,dy,1);
    d[i*4]=(.5-dx/l/2)*255;d[i*4+1]=(.5+dy/l/2)*255;d[i*4+2]=(.5+.5/l)*255;d[i*4+3]=255}});
  let sum=0;const rm=cv(d=>{for(let i=0;i<N*N;i++){const k=.6+.4*sat(.55+(.45-H[i])*.6);sum+=k;d[i*4]=d[i*4+1]=d[i*4+2]=k*255;d[i*4+3]=255}});
  return SEAM={ao,nm,rm,rmMean:sum/(N*N)}}

export function buildBattersEye(){const R=lcg(EYE.RNG),g=new THREE.Group();g.name='prop:batterseye';
  const T0=-EYE.HALF*D2R,T1=EYE.HALF*D2R,rf=EYE.R,rb=EYE.R+EYE.SKIN,rc=rb+EYE.COL_BACK;
  /* materials: matte sheet paint (vertex colours carry the wear), back skin, frame steel, galvanised trim, concrete, rust */
  const SM=seamMaps(),sheet=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:EYE.ROUGH/SM.rmMean,/* mean stays ~.95: matte, never in SSR */
    metalness:.02,map:SM.ao,normalMap:SM.nm,roughnessMap:SM.rm});
  const skin=mat('paintedSteel',{relief:'ribbed',color:0x3b4440,rough:.8,metal:.2}),steel=mat('paintedSteel',{relief:'plain',color:0x2e3532,rough:.75,metal:.3}),
    cope=mat('paintedSteel',{relief:'plain',color:0x1d2420,rough:.85,metal:.1}),galv=mat('galvSteel',{rough:.6}),conc=mat('concrete'),
    grate=mat('galvSteel',{relief:'lattice',rough:.65}),door=mat('paintedSteel',{relief:'hammered',color:0x26302b,rough:.8,metal:.15}),
    rust=new THREE.MeshStandardMaterial({color:EYE.RUST,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  const tile=m=>m.userData.tileM||1;
  /* per-sheet paint: spread, replacements, fade up, grime down, dark band under the coping */
  const tone=[];const base=new THREE.Color(EYE.COLOR);
  const colourOf=(s,y)=>{if(tone[s]===undefined)tone[s]=R()<EYE.NEW?EYE.NEW_K:1-EYE.VAR/2+EYE.VAR*R();
    const f=1+EYE.FADE*Math.max(0,(y-EYE.GRIME_H)/(EYE.TOP-EYE.GRIME_H)),gr=y<EYE.GRIME_H?EYE.GRIME_K+(1-EYE.GRIME_K)*y/EYE.GRIME_H:1,
      cap=y>EYE.TOP-EYE.CAP_BAND?EYE.CAP_K:1;return base.clone().multiplyScalar(tone[s]*f*gr*cap)};
  const len=(T1-T0)*rf,sheetW=len/Math.round(len/EYE.SHEET),bows={};
  const bow=(s,j)=>bows[s+':'+j]??=-EYE.OIL*(.2+.8*R());/* seeded once per sheet and bay; always dished in (away from home), so the runs and
    fasteners just proud of the flat sheet stay in front of it */
  const front=sheetWall(rf,{u:EYE.SEAM_TILE,v:sheetW},colourOf,false,bow),fm=new THREE.Mesh(front.g,sheet);fm.receiveShadow=true;g.add(fm);
  const bk=sheetWall(rb,tile(skin)*EYE.RIB_K,()=>new THREE.Color(1,1,1),true),bm=new THREE.Mesh(bk.g,skin);bm.receiveShadow=true;g.add(bm);
  const add=(geo,m,p,ry,rx=0)=>{const o=new THREE.Mesh(geo,m);o.position.copy(p);o.rotation.set(rx,ry,0,'YXZ');o.receiveShadow=true;g.add(o);return o};
  /* end closures and the coping (short straight pieces along the arc) */
  for(const t of [T0,T1])add(box(.3,EYE.TOP,EYE.SKIN+.1,tile(cope)),cope,at(t,(rf+rb)/2,EYE.TOP/2),yawAt(t));
  const nc=Math.ceil((T1-T0)*rf/2),CP=[];for(let i=0;i<nc;i++){const t=T0+(T1-T0)*(i+.5)/nc;CP.push(M4(at(t,(rf+rb)/2,EYE.TOP+EYE.COPE_H/2-.04),yawAt(t)))}
  const segL=(T1-T0)*rf/nc+.04;g.add(inst(box(segL,EYE.COPE_H,EYE.COPE_D,tile(cope)),cope,CP));
  g.add(inst(box(segL,.04,EYE.COPE_D+.08,tile(galv)),galv,CP.map(m=>m.clone().multiply(new THREE.Matrix4().makeTranslation(0,-EYE.COPE_H/2-.02,0)))));/* drip edge */
  /* round 2 coping: a sun-faded cap plate washed to the back, a front fascia with a hemmed drip that stands proud of the sheets, a lap cover
     strip at every joint (the 2 m pieces read as pieces), and a short back lip */
  const capM=mat('paintedSteel',{relief:'plain',color:0x34403a,rough:.85,metal:.1}),T=(x,y,z)=>new THREE.Matrix4().makeTranslation(x,y,z);
  g.add(inst(box(segL,.025,EYE.COPE_D+.12,tile(capM)),capM,CP.map(m=>m.clone().multiply(T(0,EYE.COPE_H/2+.02,0)).multiply(new THREE.Matrix4().makeRotationX(-EYE.CAP_TILT)))));
  g.add(inst(box(segL,EYE.COPE_H+.1,.025,tile(cope)),cope,CP.map(m=>m.clone().multiply(T(0,-.03,EYE.COPE_D/2+.04)))));/* fascia, field side (+z local) */
  g.add(inst(box(segL,.03,.05,tile(cope)),cope,CP.map(m=>m.clone().multiply(T(0,-EYE.COPE_H/2-.08,EYE.COPE_D/2+.06)))));/* its hem */
  g.add(inst(box(segL,.12,.02,tile(cope)),cope,CP.map(m=>m.clone().multiply(T(0,EYE.COPE_H/2-.06,-EYE.COPE_D/2-.03)))));/* back lip */
  const LP=[];for(let i=0;i<=nc;i++){const t=T0+(T1-T0)*i/nc;LP.push(M4(at(t,(rf+rb)/2,EYE.TOP+EYE.COPE_H/2-.04),yawAt(t)))}
  g.add(inst(box(EYE.LAP,EYE.COPE_H+.16,EYE.COPE_D+.13,tile(capM)),capM,LP.map(m=>m.clone().multiply(T(0,-.01,.01)))));
  /* exposed fasteners: two per sheet at every girt line, the rust runs start at these */
  const FX=[],nS=Math.round(len/EYE.SHEET);for(let s=0;s<nS;s++){const tm=T0+(T1-T0)*(s+.5)/nS;for(const h of EYE.GIRT)for(const sx of [-1,1])
    FX.push(M4(at(tm+sx*EYE.FIX_OFF/rf,rf-.006,h),yawAt(tm)).multiply(new THREE.Matrix4().makeRotationX(Math.PI/2)))}
  const fixM=mat('paintedSteel',{relief:'plain',color:0x2a3a30,rough:.6,metal:.3});/* painted to match: they glint, they do not dot the wall white */
  g.add(inst(cyl(EYE.FIX_R,EYE.FIX_R,.012,6,tile(fixM)),fixM,FX));
  /* rust runs: from the coping and from the girt fixing lines, thin tapered strips just proud of the sheet */
  const run=new THREE.BufferGeometry();run.setAttribute('position',new THREE.Float32BufferAttribute([.5,0,0,-.5,0,0,0,-1,0],3));run.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));run.setAttribute('uv',new THREE.Float32BufferAttribute([1,1,0,1,.5,0],2));
  const RU=[],rows=[EYE.TOP-.02,...EYE.GIRT.filter(h=>h>EYE.GRIME_H)];
  for(let i=0;i<EYE.RUNS;i++){const t=T0+(T1-T0)*(.02+.96*R()),y=rows[i%rows.length]-.03,w=EYE.RUN_W[0]+R()*(EYE.RUN_W[1]-EYE.RUN_W[0]),
    l=(EYE.RUN_L[0]+R()*(EYE.RUN_L[1]-EYE.RUN_L[0]))*(y>EYE.TOP-1?1.3:.7);RU.push(M4(at(t,rf-EYE.RUN_OFF,y),yawAt(t),0,0,[w,l,1]))}
  g.add(inst(run,rust,RU));
  /* round 2: pale wash streaks from under the coping, the marks that still read on a dark wall from behind home */
  const streak=new THREE.MeshStandardMaterial({color:EYE.STREAK,roughness:.95,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),SK=[];
  for(let i=0;i<EYE.STREAKS;i++){const t=T0+(T1-T0)*(.03+.94*R()),w=EYE.STREAK_W[0]+R()*(EYE.STREAK_W[1]-EYE.STREAK_W[0]),l=EYE.STREAK_L[0]+R()*(EYE.STREAK_L[1]-EYE.STREAK_L[0]);
    SK.push(M4(at(t,rf-EYE.RUN_OFF-.002,EYE.TOP-.1),yawAt(t),0,0,[w,l,1]))}
  g.add(inst(run,streak,SK));
  /* frame behind: columns every COL_GAP, footings, girts (straight pieces between columns), X-braces in every other bay */
  const ncol=Math.round((T1-T0)*rc/EYE.COL_GAP),ta=[];for(let i=0;i<=ncol;i++)ta.push(T0+(T1-T0)*i/ncol);
  g.add(inst(box(EYE.COL_W,EYE.TOP,EYE.COL_W,tile(steel)),steel,ta.map(t=>M4(at(t,rc,EYE.TOP/2),yawAt(t)))));
  g.add(inst(box(...EYE.FOOT,tile(conc)),conc,ta.map(t=>M4(at(t,rc,EYE.FOOT[1]/2-.1),yawAt(t)))));
  const bay=(T1-T0)/ncol,bayL=2*Math.sin(bay/2)*(rb+.12),GI=[],XB=[],arm=EYE.COL_BACK-.05;
  for(let i=0;i<ncol;i++){const t=T0+bay*(i+.5);for(const h of EYE.GIRT)GI.push(M4(at(t,rb+.12,h),yawAt(t)));
    if(i%2===0)for(let j=0;j<EYE.GIRT.length-1;j++){const h0=EYE.GIRT[j],h1=EYE.GIRT[j+1],L=Math.hypot(bayL,h1-h0),a=Math.atan2(h1-h0,bayL);
      for(const sg of [-1,1])XB.push(M4(at(t,rc,(h0+h1)/2),yawAt(t),0,sg*a,[1,1,1]).multiply(new THREE.Matrix4().makeScale(L,1,1)))}}
  g.add(inst(box(bayL,EYE.GIRT_H,.1,tile(steel)),steel,GI));
  g.add(inst(box(1,EYE.BRACE_W,EYE.BRACE_W,1),steel,XB));
  /* arms from each column to the girts (the sheets hang on the girts, the girts on these) */
  const AR=[];for(const t of ta)for(const h of EYE.GIRT)AR.push(M4(at(t,rb+.12+arm/2,h),yawAt(t)));
  g.add(inst(box(.12,.12,arm,tile(steel)),steel,AR));
  /* catwalk along the back under the coping: grating on brackets off the columns, handrail with posts and a mid rail */
  const nw=Math.ceil((T1-T0)*rc/2),wl=(T1-T0)*rc/nw+.03,rw=rc+EYE.WALK_W/2-.1,WK=[],RL=[],RM=[],PO=[];
  for(let i=0;i<nw;i++){const t=T0+(T1-T0)*(i+.5)/nw;WK.push(M4(at(t,rw,EYE.WALK_Y-.03),yawAt(t)));
    RL.push(M4(at(t,rw+EYE.WALK_W/2,EYE.WALK_Y+EYE.RAIL_H),yawAt(t)));RM.push(M4(at(t,rw+EYE.WALK_W/2,EYE.WALK_Y+EYE.RAIL_H/2),yawAt(t)))}
  for(const t of ta)PO.push(M4(at(t,rw+EYE.WALK_W/2,EYE.WALK_Y+EYE.RAIL_H/2),yawAt(t)));
  g.add(inst(box(wl,.06,EYE.WALK_W,tile(grate)),grate,WK));g.add(inst(cyl(.025,.025,wl,8,tile(galv)),galv,RL.map(m=>m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)))));
  g.add(inst(cyl(.018,.018,wl,8,tile(galv)),galv,RM.map(m=>m.clone().multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)))));
  g.add(inst(cyl(.025,.025,EYE.RAIL_H,8,tile(galv)),galv,PO));
  /* caged ladder up the back at the third-base end (t just inside T0), from the ground to the catwalk */
  {const t=T0+bay*.5,rl=rc+.35,LH=EYE.WALK_Y+EYE.RAIL_H,R2=[],RG=[],HO=[],ST=[];
    for(const sx of [-1,1])R2.push(M4(at(t,rl,LH/2),yawAt(t)).multiply(new THREE.Matrix4().makeTranslation(sx*EYE.LADDER_W/2,0,0)));
    for(let y=.3;y<LH;y+=.3)RG.push(M4(at(t,rl,y),yawAt(t)).multiply(new THREE.Matrix4().makeRotationZ(Math.PI/2)));
    for(let y=2.4;y<LH;y+=.9)HO.push(M4(at(t,rl+EYE.CAGE_R*.6,y),yawAt(t)).multiply(new THREE.Matrix4().makeRotationX(-Math.PI/2)));
    for(let k=0;k<5;k++){const a=Math.PI*(k/4);ST.push(M4(at(t,rl+EYE.CAGE_R*.6,(2.4+LH)/2),yawAt(t)).multiply(new THREE.Matrix4().makeTranslation(Math.cos(a)*EYE.CAGE_R,0,-Math.sin(a)*EYE.CAGE_R)))}
    g.add(inst(cyl(.025,.025,LH,8,tile(galv)),galv,R2));g.add(inst(cyl(.014,.014,EYE.LADDER_W,6,tile(galv)),galv,RG));
    g.add(inst(new THREE.TorusGeometry(EYE.CAGE_R,.014,6,20,Math.PI),galv,HO));g.add(inst(cyl(.012,.012,LH-2.4,6,tile(galv)),galv,ST))}
  /* service doors in the back skin at the foot of each end, with a frame and a concrete pad */
  for(const t of [T0+bay*1.5,T1-bay*1.5]){const p=at(t,rb+.03,EYE.DOOR[1]/2);add(box(EYE.DOOR[0],EYE.DOOR[1],.05,tile(door)),door,p,yawAt(t));
    add(box(EYE.DOOR[0]+.16,EYE.DOOR[1]+.08,.03,tile(galv)),galv,at(t,rb+.01,EYE.DOOR[1]/2+.04),yawAt(t));
    add(box(EYE.DOOR[0]+.8,.12,1.2,tile(conc)),conc,at(t,rb+.6,.02),yawAt(t))}
  return g}

/* slot descriptor (#237): the park never had a batter's eye, nothing to hide. ?prop=batterseye in the viewer. */
export const PROPS=[{name:'batterseye',build:()=>buildBattersEye(),old:()=>[]}];
