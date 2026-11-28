/* render/skyocc_stands.js: #214 item 2 part 2. Bakes render/skyocc.js into the old stands (seat rows and back walls) on `max` only,
 * so the rows under a roof and at the foot of a back wall sit in shade worked out ahead of time. No three.js import (game.js passes
 * THREE / TSL in), so the pure core `bakeShade` runs in Node (tests/skyocc_stands.check.mjs).
 * Receivers: meshes named old:seats and old:seats:back. Occluders: old:roof and old:seats:back (the stand's own roof and wall, and
 * the other stands'). Result: a `color` attribute per receiver mesh (grey = occShade) that a clone of the stand material multiplies in.
 * Static parts only; the fans are not touched. Same input = same bytes. A failure leaves the old look. `?off=skyocc` = none. */
import {buildGrid,skyVisibility,occShade} from './skyocc.js';
export const SKYSTAND={RECEIVERS:['old:seats','old:seats:back'],OCCLUDERS:['old:roof','old:seats:back']};

/* receivers: [{pos,nor}] world-space Float32Array xyz; occluders: [{pos,idx|null}] world-space. Returns one Float32Array (rgb, grey) per receiver. */
export function bakeShade(receivers,occluders,o={}){
  const parts=[];for(const m of occluders){const t=m.idx?expand(m.pos,m.idx):m.pos;parts.push(t)}
  const n=parts.reduce((s,p)=>s+p.length,0),soup=new Float32Array(n);let at=0;for(const p of parts){soup.set(p,at);at+=p.length}
  const G=buildGrid(soup,null,o.cell);
  return receivers.map(r=>{const v=skyVisibility(r.pos,r.nor,G,o),c=new Float32Array(v.length*3);
    for(let i=0;i<v.length;i++){const s=occShade(v[i],o.min,o.gamma);c[i*3]=c[i*3+1]=c[i*3+2]=s}return c})}

function expand(pos,idx){const o=new Float32Array(idx.length*3);for(let i=0;i<idx.length;i++){o[i*3]=pos[idx[i]*3];o[i*3+1]=pos[idx[i]*3+1];o[i*3+2]=pos[idx[i]*3+2]}return o}

/* World-space copy of a mesh's positions and normals (THREE objects, so this part lives behind the injected THREE). */
function world(THREE,mesh){mesh.updateWorldMatrix(true,false);const g=mesh.geometry,p=g.attributes.position,nm=g.attributes.normal,
    pos=new Float32Array(p.count*3),nor=new Float32Array(p.count*3),v=new THREE.Vector3(),nmat=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  for(let i=0;i<p.count;i++){v.fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld);pos[i*3]=v.x;pos[i*3+1]=v.y;pos[i*3+2]=v.z;
    if(nm){v.fromBufferAttribute(nm,i).applyMatrix3(nmat).normalize();nor[i*3]=v.x;nor[i*3+1]=v.y;nor[i*3+2]=v.z}else nor[i*3+1]=1}
  return{pos,nor,idx:g.index?g.index.array:null}}

/* Once per park build: bake, then `apply(true)` swaps the receivers to the shaded material, `apply(false)` restores them. */
export function mountSkyOcc({THREE,TSL,scene,standMat}){
  const rec=[],occ=[];scene.traverse(o=>{if(!o.isMesh||!o.geometry||o.isInstancedMesh)return;
    if(SKYSTAND.RECEIVERS.includes(o.name)&&o.material===standMat)rec.push(o);if(SKYSTAND.OCCLUDERS.includes(o.name))occ.push(o)});
  if(!rec.length||!occ.length)return{apply(){},n:0};
  const R=rec.map(m=>world(THREE,m)),colors=bakeShade(R,occ.map(m=>world(THREE,m)));
  const shaded=standMat.clone();shaded.colorNode=standMat.colorNode.mul(TSL.vertexColor());
  rec.forEach((m,i)=>m.geometry.setAttribute('color',new THREE.BufferAttribute(colors[i],3)));
  let on=false;return{n:rec.length,apply(w){if(w===on)return;on=w;for(const m of rec)m.material=w?shaded:standMat}}}
