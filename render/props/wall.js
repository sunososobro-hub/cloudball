/* render/props/wall.js: outfield wall pads and fence top (#215 round 1). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Replaces the old field face of the wall (one flat open cylinder, `old:wall`) and the flat yellow band on top (`old:wall:top`).
 * The back face seen from the outfield stands (old mesh behind r WALL_R) stays as it is.
 * Shape: WALL_PADS separate vinyl pads (one per pad column of the ad image), each a real pillow: rounded on all four edges, crowned
 * across, sagging a little at the bottom, its own small thickness and tone; a dark backing shows in the seams between pads.
 * Surface: the league/team boards are the same canvas game.js draws (`drawAds`, recoloured per park), so the boards still change with the
 * home park; vinyl creases and side stitches come from the `vinyl` relief; vertex colour bakes seam occlusion and warning-track dirt.
 * Fence top: a painted steel cap (front lip over the pad tops, flat top, back lip) swept along the arc, with a bolt at every pad,
 * in the home team's trim colour (same colour input as #203's PARKS.trim; it keeps the old glow so it reads at night).
 * Round 2: the cap is deeper and stands proud of the pads (it read as a hairline from the broadcast distance); the ad glow is the lit
 * albedo (vertex colour included) instead of the raw ad image, so the seam shadows and track dirt stay dark at night; distance markers
 * (the real wall distance from the plate, painted white on the pads) in both corners, both alleys and CF; ball marks and cleat scrapes
 * clustered where balls and fielders hit (alleys, CF), each a small patch that follows the pad surface (alpha-tested, opaque: no #267 MRT
 * trap); padded end plates close the pad and cap profile at both foul-line ends.
 * Frame: world, same arc as the old cylinder (centre on home plate side axis, theta from WALL_TH0 over WALL_TH, x=r sin, z=r cos). */
import * as THREE from 'three/webgpu';
import {mat,reliefMaps} from '../pbr.js';
import * as TSL from 'three/tsl';

export const WALL={R:110,H:3,TH0:Math.PI*.75,TH:Math.PI/2,PADS:120,/* = boards 6 x pads per board 5 x ad repeats 4 in game.js */
  T:.085,/* foam thickness at the crown (m) */EDGE:.07,/* edge roll (m) */GAP:.014,/* seam between pads (m) */SAG:.12,/* extra bulge at the bottom */
  TOP:2.9,/* pad top (m), under the cap lip */DIRT_H:.5,/* warning-track dirt climbs this high */SEAM_AO:.34,TONE:.05,THICK_VAR:.1,
  CAP_LIP:.24,/* front lip depth (round 1 .17) */CAP_BACK:.16,CAP_OUT:.055,/* lip stands this far in front of the pad crown */CAP_RISE:.03,
  CAP_GLOW:.35,BOLT_R:.014,AD_GLOW:.22,
  MARKS:900,/* ball marks + cleat scrapes */SCRAPE:.22,/* share of scrapes */MARK_EPS:.004,/* decal lift off the pad (m) */
  DIST_U:[1,6,12,18,23].map(k=>k/24),/* on board joins (24 ad boards), between the ad names */DIST_W:2.9,DIST_H:1.2,DIST_Y:1.5,DIST_EPS:.008,DIST_N:96,/* columns: dense enough to follow the 7 cm edge roll into each seam */END_T:.03};
/* pad grid: denser where the pillow rolls (fractions of width / height) */
const SU=[0,.012,.03,.055,.09,.16,.3,.5,.7,.84,.91,.945,.97,.988,1],SV=[0,.006,.016,.03,.06,.12,.25,.4,.55,.7,.82,.9,.94,.97,.984,.994,1];
function hash(i,k){let h=Math.imul(i*73856093^k*19349663,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
const roll=(d,E)=>d>=E?1:Math.sin(Math.max(0,d)/E*Math.PI/2)**.7;

/* one geometry for all pads: positions, ad-image uv (same u/v as the old cylinder, so the ad texture's own repeat still applies), colour */
/* pad surface radius for pad p at s (0..1 across the pad, in the direction of increasing angle) and height y; one source for pads and decals */
function padR(p,s,y){const {R,PADS,TH,T,EDGE,GAP,SAG,TOP,THICK_VAR}=WALL,W=TH/PADS*R-GAP,t=y/TOP,f=roll(Math.min(s,1-s)*W,EDGE)*roll(Math.min(y,TOP-y),EDGE),
  crown=.85+.15*Math.sin(Math.PI*s),lean=(hash(p,3)-.5)*.012;return{r:R-T*(1+THICK_VAR*(hash(p,1)-.5))*crown*f*(1+SAG*(1-t)**2)-lean*t*f,f}}
/* angle a -> pad index and s inside it (seams count as the nearest pad) */
function padAt(a){const {TH0,TH,PADS,GAP,R}=WALL,dT=TH/PADS,gT=GAP/2/R,p=Math.min(PADS-1,Math.max(0,Math.floor((a-TH0)/dT))),a0=TH0+p*dT+gT,a1=TH0+(p+1)*dT-gT;
  return{p,s:Math.min(1,Math.max(0,(a-a0)/(a1-a0)))}}

/* one geometry for all pads: positions, ad-image uv (same u/v as the old cylinder, so the ad texture's own repeat still applies), colour */
function padGeometry(){const {TH0,TH,PADS,GAP,TOP,DIRT_H,SEAM_AO,TONE,R}=WALL,nu=SU.length,nv=SV.length,per=nu*nv;
  const pos=new Float32Array(PADS*per*3),uv=new Float32Array(PADS*per*2),col=new Float32Array(PADS*per*3),idx=[],dT=TH/PADS,gT=GAP/2/R;
  for(let p=0;p<PADS;p++){const tone=1-TONE*hash(p,2),a0=TH0+p*dT+gT,a1=TH0+(p+1)*dT-gT,b=p*per;
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const s=SU[i],t=SV[j],y=t*TOP,a=a0+(a1-a0)*s,{r,f}=padR(p,s,y),k=b+j*nu+i;
      pos.set([r*Math.sin(a),y,r*Math.cos(a)],k*3);uv.set([(a-TH0)/TH,y/WALL.H],k*2);
      const dirt=Math.max(0,1-y/DIRT_H)**1.6*(.55+.45*hash(p,4)),ao=1-SEAM_AO*(1-f)**1.5,c=ao*tone;
      col.set([c*(1-dirt*.18),c*(1-dirt*.26),c*(1-dirt*.36)],k*3)}
    for(let j=0;j<nv-1;j++)for(let i=0;i<nu-1;i++){const A=b+j*nu+i,B=A+1,C=A+nu,D=C+1;idx.push(A,C,B,B,C,D)}}/* wound to face the field */
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}

/* decal patches that follow the pad surface: list of {a (centre angle), y, w, h (m), u0, u1 (atlas u range)}; n x m grid each, lifted eps;
   u runs left to right as seen from the plate (angle decreases), winding like the pads */
function decalGeometry(list,eps,n=4,m=3){const {R}=WALL,per=(n+1)*(m+1),pos=new Float32Array(list.length*per*3),uv=new Float32Array(list.length*per*2),idx=[];
  list.forEach((d,q)=>{const b=q*per;for(let j=0;j<=m;j++)for(let i=0;i<=n;i++){const s=i/n,t=j/m,a=d.a+(s-.5)*d.w/R,y=d.y+(t-.5)*d.h,P=padAt(a),r=padR(P.p,P.s,y).r-eps,k=b+j*(n+1)+i;
      pos.set([r*Math.sin(a),y,r*Math.cos(a)],k*3);uv.set([d.u1+(d.u0-d.u1)*s,t],k*2)}
    for(let j=0;j<m;j++)for(let i=0;i<n;i++){const A=b+j*(n+1)+i,B=A+1,C=A+n+1,D=C+1;idx.push(A,C,B,B,C,D)}});
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}

/* atlas of 4 marks (256 x 64): 3 ball marks (a scuffed ring of dirt and rubber, darker rim, ragged edge) and 1 cleat scrape (vertical
   streaks); rgb = mark colour, alpha = coverage with grain, so alphaTest gives a ragged edge */
function markAtlas(){const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d'),im=g.createImageData(256,64),D=im.data;
  for(let y=0;y<64;y++)for(let x=0;x<256;x++){const v=x>>6,u=(x&63)/63*2-1,w=y/63*2-1,n=hash(x*7+v,y*13+5),n2=hash((x>>2)+v*31,y>>2);let a,c0;
    if(v<3){/* ball mark: a dusty blotch of dirt and leather, ragged and grainy, thinning outwards */
      const rr=Math.hypot(u*(1+.15*v),w*(1-.1*v))+(n2-.5)*.3;a=rr<1?(1-rr**2)*(.35+.9*n2)*(.55+.6*n):0;c0=96+24*n2}
    else{/* cleat scrape: a few thin vertical streaks, darker rubber and dirt */
      const k=Math.abs(Math.sin(u*7+n2*1.5)),e=1-Math.abs(u);a=e>0?(k>.7?1:.15)*e**.4*(1-Math.abs(w)**4)*(.55+.6*n):0;c0=70}
    const o=(y*256+x)*4;D[o]=c0+8;D[o+1]=c0+2;D[o+2]=c0-10;D[o+3]=Math.min(255,a*255)}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t}

/* distance marker: white numerals with a dark keyline, alpha-tested */
function distTex(txt){const c=document.createElement('canvas');c.width=512;c.height=208;const g=c.getContext('2d');g.textAlign='center';g.textBaseline='middle';
  g.font='700 168px "Barlow Condensed","Arial Narrow",sans-serif';g.lineJoin='round';g.lineWidth=18;g.strokeStyle='#101418';g.strokeText(txt,256,112);g.fillStyle='#f4f4ef';g.fillText(txt,256,112);
  const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t}

/* ad glow = the lit albedo (ad image x vertex colour) times AD_GLOW, so baked seam occlusion and track dirt stay dark at night */
const glowFromAlbedo=(m,k)=>{m.emissiveNode=TSL.diffuseColor.rgb.mul(TSL.uniform(k));return m};

/* the cap profile (radius offset from R, height), swept along the arc; uv in metres for the paint relief */
const capProfile=()=>{const {R,H,T,CAP_LIP,CAP_BACK,CAP_OUT,CAP_RISE}=WALL,f=R-T-CAP_OUT,h=H+CAP_RISE;
  return[[f+.012,H-CAP_LIP],[f,H-CAP_LIP+.012],[f,h-.035],[f+.01,h-.01],[f+.035,h],[R+.07,h+.012],[R+.13,h],[R+.14,h-.02],[R+.14,H-CAP_BACK]]};
function capGeometry(tileM){const {R,TH0,TH}=WALL,
  P=capProfile().map(([x,y])=>new THREE.Vector2(x,y));
  const g=new THREE.LatheGeometry(P,PADS_SEG(),TH0,TH),uv=g.attributes.uv,L=R*TH;let plen=0;for(let i=1;i<P.length;i++)plen+=P[i].distanceTo(P[i-1]);
  for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*L/tileM,uv.getY(j)*plen/tileM);uv.needsUpdate=true;return g}
const PADS_SEG=()=>WALL.PADS*3;

/* o: {colors: {pad, trim} of the home park, old: the old field-face mesh (its material carries the ad canvas)} -> THREE.Group */
export function buildWall(o){const {R,H,TH0,TH,PADS,T,TOP,CAP_GLOW,BOLT_R,AD_GLOW,CAP_OUT,CAP_LIP}=WALL;
  const om=o.old&&o.old.material;if(!om||!om.map)throw new Error('wall: old wall material not found');
  const g=new THREE.Group();g.name='prop:wall';
  const V=reliefMaps('vinyl'),nm=V.nm.clone(),rm=V.rm.clone();nm.repeat.set(PADS,1);rm.repeat.set(PADS,1);nm.needsUpdate=rm.needsUpdate=true;
  const padM=glowFromAlbedo(new THREE.MeshStandardNodeMaterial({map:om.map,vertexColors:true,
    normalMap:nm,normalScale:new THREE.Vector2(.8,.8),roughness:.62,roughnessMap:rm,metalness:0}),AD_GLOW);
  const pads=new THREE.Mesh(padGeometry(),padM);pads.castShadow=pads.receiveShadow=true;g.add(pads);
  /* backing in the seams: painted plywood, nearly black */
  const back=new THREE.Mesh(new THREE.CylinderGeometry(R-.002,R-.002,TOP,PADS_SEG(),1,true,TH0,TH),mat('paintedSteel',{relief:'plain',color:0x0d0f10,rough:.9}).clone());
  back.material.side=THREE.BackSide;back.position.y=TOP/2;back.receiveShadow=true;g.add(back);
  /* fence top cap and its bolts, in the trim colour */
  const capM=mat('paintedSteel',{relief:'hammered',rough:.45}).clone();capM.emissiveIntensity=CAP_GLOW;
  const cap=new THREE.Mesh(capGeometry(capM.userData.tileM||1),capM);cap.castShadow=cap.receiveShadow=true;g.add(cap);
  const boltM=mat('galvSteel').clone(),bolts=new THREE.InstancedMesh(new THREE.CylinderGeometry(BOLT_R,BOLT_R,.01,8),boltM,PADS),d=new THREE.Object3D();
  for(let p=0;p<PADS;p++){const a=TH0+(p+.5)*TH/PADS,r=R-T-CAP_OUT-.003,y=H-CAP_LIP*.45;d.position.set(r*Math.sin(a),y,r*Math.cos(a));d.lookAt(0,y,0);d.rotateX(Math.PI/2);d.updateMatrix();bolts.setMatrixAt(p,d.matrix)}
  g.add(bolts);
  /* ball marks and cleat scrapes: clustered in the alleys and CF (where balls and fielders hit), ball marks high, scrapes low */
  {const {MARKS,SCRAPE,MARK_EPS}=WALL,L=[],wU=u=>.25+Math.exp(-(((u-.25)/.08)**2))+Math.exp(-(((u-.75)/.08)**2))+.8*Math.exp(-(((u-.5)/.11)**2));
   for(let i=0,k=0;L.length<MARKS&&k<MARKS*20;k++){const u=hash(k,11);if(hash(k,12)*2.3>wU(u))continue;
     const p=Math.min(PADS-1,Math.floor(u*PADS)),s=.14+.72*hash(k,13),dT=TH/PADS,a=TH0+(p+s)*dT,sc=hash(k,14)<SCRAPE,v=sc?3:Math.floor(hash(k,15)*3),
       sz=sc?.05+.04*hash(k,16):.1+.1*hash(k,16),y=sc?.08+.6*hash(k,17)**1.5:.55+2.15*Math.sqrt(hash(k,17));
     L.push({a,y:Math.min(y,TOP-.12),w:sz,h:sc?sz*(4+5*hash(k,18)):sz,u0:v/4,u1:(v+1)/4});i++}
   const mm=glowFromAlbedo(new THREE.MeshStandardNodeMaterial({map:markAtlas(),alphaTest:.5,roughness:.85,metalness:0,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-2}),AD_GLOW);
   const marks=new THREE.Mesh(decalGeometry(L,MARK_EPS,2,2),mm);marks.receiveShadow=true;marks.name='prop:wall:marks';g.add(marks)}
  /* distance markers: the real distance from the plate (origin) to the pad face, in metres */
  {const {DIST_U,DIST_W,DIST_H,DIST_Y,DIST_EPS,DIST_N}=WALL,txt=String(Math.round(R-T))+'M',dm=glowFromAlbedo(new THREE.MeshStandardNodeMaterial({map:distTex(txt),alphaTest:.5,
     roughness:.5,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4}),.3);
   const dist=new THREE.Mesh(decalGeometry(DIST_U.map(u=>({a:TH0+u*TH,y:DIST_Y,w:DIST_W,h:DIST_H,u0:0,u1:1})),DIST_EPS,DIST_N,4),dm);dist.receiveShadow=true;dist.name='prop:wall:dist';g.add(dist)}
  /* end plates: close the pad and cap profile at both foul-line ends (padded, pad colour) */
  const endM=mat('vinylPad',{relief:'plain'}).clone(),{END_T}=WALL,P=capProfile(),r0=Math.min(...P.map(q=>q[0])),r1=Math.max(...P.map(q=>q[0])),h1=Math.max(...P.map(q=>q[1]));
  for(const e of [0,1]){const a=TH0+e*TH,m=new THREE.Mesh(new THREE.BoxGeometry(END_T,h1,r1-r0),endM),r=(r0+r1)/2,sg=e?1:-1;
    m.position.set(r*Math.sin(a)+sg*END_T/2*Math.cos(a),h1/2,r*Math.cos(a)-sg*END_T/2*Math.sin(a));m.rotation.y=a;m.castShadow=m.receiveShadow=true;m.name='prop:wall:end';g.add(m)}
  /* colours from the home park: the pads come with the ad canvas (game.js redraws it); the cap takes the trim */
  g.userData.recolor=P=>{if(!P)return;const c=new THREE.Color(P.trim);capM.color.copy(c);capM.emissive.copy(c);capM.emissiveIntensity=CAP_GLOW;if(P.pad)endM.color.set(P.pad)};
  g.userData.recolor(o.colors);return g}

/* slot descriptor (#237): replaces the field face of the old wall and its flat top band (old:wall, old:wall:top) */
export const PROPS=[{name:'wall',build:c=>buildWall({colors:c.park(),old:c.scene.getObjectByName('old:wall')}),old:c=>c.old('wall')}];
