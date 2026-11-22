/* render/props/wall.js: outfield wall pads and fence top (#215 round 1). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * Replaces the old field face of the wall (one flat open cylinder, `old:wall`) and the flat yellow band on top (`old:wall:top`).
 * The back face seen from the outfield stands (old mesh behind r WALL_R) stays as it is.
 * Shape: WALL_PADS separate vinyl pads (one per pad column of the ad image), each a real pillow: rounded on all four edges, crowned
 * across, sagging a little at the bottom, its own small thickness and tone; a dark backing shows in the seams between pads.
 * Surface: the league/team boards are the same canvas game.js draws (`drawAds`, recoloured per park), so the boards still change with the
 * home park; vinyl creases and side stitches come from the `vinyl` relief; vertex colour bakes seam occlusion and warning-track dirt.
 * Fence top: a painted steel cap (front lip over the pad tops, flat top, back lip) swept along the arc, with a bolt at every pad,
 * in the home team's trim colour (same colour input as #203's PARKS.trim; it keeps the old glow so it reads at night).
 * Frame: world, same arc as the old cylinder (centre on home plate side axis, theta from WALL_TH0 over WALL_TH, x=r sin, z=r cos). */
import * as THREE from 'three/webgpu';
import {mat,reliefMaps} from '../pbr.js';

export const WALL={R:110,H:3,TH0:Math.PI*.75,TH:Math.PI/2,PADS:120,/* = boards 6 x pads per board 5 x ad repeats 4 in game.js */
  T:.085,/* foam thickness at the crown (m) */EDGE:.07,/* edge roll (m) */GAP:.014,/* seam between pads (m) */SAG:.12,/* extra bulge at the bottom */
  TOP:2.9,/* pad top (m), under the cap lip */DIRT_H:.5,/* warning-track dirt climbs this high */SEAM_AO:.34,TONE:.05,THICK_VAR:.1,
  CAP_LIP:.17,CAP_BACK:.1,CAP_GLOW:.35,BOLT_R:.012,AD_GLOW:.22};
/* pad grid: denser where the pillow rolls (fractions of width / height) */
const SU=[0,.012,.03,.055,.09,.16,.3,.5,.7,.84,.91,.945,.97,.988,1],SV=[0,.006,.016,.03,.06,.12,.25,.4,.55,.7,.82,.9,.94,.97,.984,.994,1];
function hash(i,k){let h=Math.imul(i*73856093^k*19349663,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
const roll=(d,E)=>d>=E?1:Math.sin(Math.max(0,d)/E*Math.PI/2)**.7;

/* one geometry for all pads: positions, ad-image uv (same u/v as the old cylinder, so the ad texture's own repeat still applies), colour */
function padGeometry(){const {R,TH0,TH,PADS,T,EDGE,GAP,SAG,TOP,DIRT_H,SEAM_AO,TONE,THICK_VAR}=WALL,nu=SU.length,nv=SV.length,per=nu*nv;
  const pos=new Float32Array(PADS*per*3),uv=new Float32Array(PADS*per*2),col=new Float32Array(PADS*per*3),idx=[],dT=TH/PADS,gT=GAP/2/R,W=dT*R-GAP;
  for(let p=0;p<PADS;p++){const th=hash(p,1),tone=1-TONE*hash(p,2),lean=(hash(p,3)-.5)*.012,a0=TH0+p*dT+gT,a1=TH0+(p+1)*dT-gT,b=p*per;
    for(let j=0;j<nv;j++)for(let i=0;i<nu;i++){const s=SU[i],t=SV[j],y=t*TOP,a=a0+(a1-a0)*s,
      f=roll(Math.min(s,1-s)*W,EDGE)*roll(Math.min(y,TOP-y),EDGE),crown=.85+.15*Math.sin(Math.PI*s),
      r=R-T*(1+THICK_VAR*(th-.5))*crown*f*(1+SAG*(1-t)**2)-lean*t*f,k=b+j*nu+i;
      pos.set([r*Math.sin(a),y,r*Math.cos(a)],k*3);uv.set([(a-TH0)/TH,y/WALL.H],k*2);
      const dirt=Math.max(0,1-y/DIRT_H)**1.6*(.55+.45*hash(p,4)),ao=1-SEAM_AO*(1-f)**1.5,c=ao*tone;
      col.set([c*(1-dirt*.18),c*(1-dirt*.26),c*(1-dirt*.36)],k*3)}
    for(let j=0;j<nv-1;j++)for(let i=0;i<nu-1;i++){const A=b+j*nu+i,B=A+1,C=A+nu,D=C+1;idx.push(A,C,B,B,C,D)}}/* wound to face the field */
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  g.setAttribute('color',new THREE.BufferAttribute(col,3));g.setIndex(idx);g.computeVertexNormals();return g}

/* the cap profile (radius offset from R, height), swept along the arc; uv in metres for the paint relief */
function capGeometry(tileM){const {R,H,T,CAP_LIP,CAP_BACK,TH0,TH}=WALL,f=R-T-.035,
  P=[[f,H-CAP_LIP],[f,H-.03],[f+.008,H-.008],[f+.03,H],[R+.05,H+.012],[R+.09,H],[R+.1,H-.02],[R+.1,H-CAP_BACK]].map(([x,y])=>new THREE.Vector2(x,y));
  const g=new THREE.LatheGeometry(P,PADS_SEG(),TH0,TH),uv=g.attributes.uv,L=R*TH;let plen=0;for(let i=1;i<P.length;i++)plen+=P[i].distanceTo(P[i-1]);
  for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*L/tileM,uv.getY(j)*plen/tileM);uv.needsUpdate=true;return g}
const PADS_SEG=()=>WALL.PADS*3;

/* o: {colors: {pad, trim} of the home park, old: the old field-face mesh (its material carries the ad canvas)} -> THREE.Group */
export function buildWall(o){const {R,H,TH0,TH,PADS,T,TOP,CAP_GLOW,BOLT_R,AD_GLOW}=WALL;
  const om=o.old&&o.old.material;if(!om||!om.map)throw new Error('wall: old wall material not found');
  const g=new THREE.Group();g.name='prop:wall';
  const V=reliefMaps('vinyl'),nm=V.nm.clone(),rm=V.rm.clone();nm.repeat.set(PADS,1);rm.repeat.set(PADS,1);nm.needsUpdate=rm.needsUpdate=true;
  const padM=new THREE.MeshStandardMaterial({map:om.map,emissive:0xffffff,emissiveMap:om.map,emissiveIntensity:AD_GLOW,vertexColors:true,
    normalMap:nm,normalScale:new THREE.Vector2(.8,.8),roughness:.62,roughnessMap:rm,metalness:0});
  const pads=new THREE.Mesh(padGeometry(),padM);pads.castShadow=pads.receiveShadow=true;g.add(pads);
  /* backing in the seams: painted plywood, nearly black */
  const back=new THREE.Mesh(new THREE.CylinderGeometry(R-.002,R-.002,TOP,PADS_SEG(),1,true,TH0,TH),mat('paintedSteel',{relief:'plain',color:0x0d0f10,rough:.9}).clone());
  back.material.side=THREE.BackSide;back.position.y=TOP/2;back.receiveShadow=true;g.add(back);
  /* fence top cap and its bolts, in the trim colour */
  const capM=mat('paintedSteel',{relief:'hammered',rough:.45}).clone();capM.emissiveIntensity=CAP_GLOW;
  const cap=new THREE.Mesh(capGeometry(capM.userData.tileM||1),capM);cap.castShadow=cap.receiveShadow=true;g.add(cap);
  const boltM=mat('galvSteel').clone(),bolts=new THREE.InstancedMesh(new THREE.CylinderGeometry(BOLT_R,BOLT_R,.01,8),boltM,PADS),d=new THREE.Object3D();
  for(let p=0;p<PADS;p++){const a=TH0+(p+.5)*TH/PADS,r=R-T-.04;d.position.set(r*Math.sin(a),H-.08,r*Math.cos(a));d.lookAt(0,H-.08,0);d.rotateX(Math.PI/2);d.updateMatrix();bolts.setMatrixAt(p,d.matrix)}
  g.add(bolts);
  /* colours from the home park: the pads come with the ad canvas (game.js redraws it); the cap takes the trim */
  g.userData.recolor=P=>{if(!P)return;const c=new THREE.Color(P.trim);capM.color.copy(c);capM.emissive.copy(c);capM.emissiveIntensity=CAP_GLOW};
  g.userData.recolor(o.colors);return g}

/* slot descriptor (#237): replaces the field face of the old wall and its flat top band (old:wall, old:wall:top) */
export const PROPS=[{name:'wall',build:c=>buildWall({colors:c.park(),old:c.scene.getObjectByName('old:wall')}),old:c=>c.old('wall')}];
