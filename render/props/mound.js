/* render/props/mound.js: the pitcher's mound and the two batter's boxes (#215 polish lane, round 1). Polish rounds edit only this file
 * (and add to render/pbr.js). Before this, both were paint on the field map of game.js (a dirt circle, a white rubber, two chalk
 * rectangles): flat from every camera. This prop adds them as relief meshes laid on the field:
 *   - mound: a clay dome on the painted circle, flat table around the rubber, long slope toward home, short fall-off behind; the
 *     pitcher's push-off hole in front of the rubber, the landing hole at the end of his stride and the worn path between them are
 *     dug back down to the field plane, ringed with kicked-out loose clay; packed clay is redder and darker than the infield dirt.
 *   - batter's boxes: a clay pad per box, the back-foot hole and front-foot scuff dug in where the batters stand, real chalk on top
 *     (a raised strip with a powder fringe, broken and rubbed out where the feet go) instead of the painted lines, plus the stub of
 *     the foul line from the box to the edge of the pad, fading into the painted line.
 * Why the shape is low (MOUND.H, not a real 25 cm): every figure in game.js stands at y 0. The pitcher's feet, the walk back and the
 * rubber footprint are all dug back to y 0, so nobody floats or sinks, and the dome only rises where nobody steps.
 * The rubber itself belongs to the bases prop. Today the painted rubber of the field map rides on the table (MOUND.SLOT off); a 3D
 * rubber at y 0 needs MOUND.SLOT on (footprint dug to y 0) or its top lifted to MOUND.H. Round 1 is a half: BOX.ON is off (see there).
 * Colour: the meshes wear the field's own material (the polished one if mounted, else game.js's), with UVs that hit the same field map,
 * so they take the park light, the grass/dirt scans and the rake exactly like the ground around them and the rim cannot show a seam.
 * The box pads read their colour from bare dirt behind the plate (BOX_SRC) so the painted lines under them disappear.
 * World frame as game.js: home plate at 0, field toward -z, pitcher's spot (engine FIELD_SPOTS.P) at z -18.4, righty batter at x -.9. */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

export const MOUND={
  C:[0,-18.4],RIM:2.75,/* centre and radius of the painted mound circle (game.js fieldTex: r 2.7) */
  H:.075,LIFT:.003,/* table height above the field (see the header), lift of the whole mesh so the rim does not fight the ground */
  TABLE_BACK:.75,TABLE_FRONT:.3,/* flat table radius behind/beside the rubber and in front of it, metres */
  RUBBER:[0,-18.425,.33,.095],/* the rubber's footprint: centre x, z, half width, half depth (painted rubber .6 x .15 m at z -18.5..-18.35) */
  SLOT:false,/* dig the footprint to y 0 for a 3D rubber at y 0. Off: with no 3D rubber yet the slot walls hid the painted one from the
     broadcast camera; the painted rubber rides on the table instead (same UVs). Turn on when bases.js draws a rubber (or lift that rubber by H). */
  PUSH:[0,-18.18,.3,.2],LAND:[0,-17.45,.38,.32],/* push-off and landing holes: x, z, half axes (stride dz .85 m, game.js PK.dz) */
  PATH_W:.24,PATH_K:.65,/* worn path between the holes: half width, how much of the height it takes out */
  LOOSE:.012,LOOSE_W:.18,/* kicked-out loose clay ring round the holes: height, width */
  LUMP:.004,/* clay lumps */
  STEP:.025,/* grid step, metres */
  CLAY:[1.06,.82,.72],HOLE:.62,PACK_ROUGH:.9,/* packed clay tint, dug-hole darkening, roughness factor of the packed table */
};
export const BOX={
  ON:false,/* round 1 half: the pads hid the painted lines but the chalk strips did not draw in the headless shot (likely the opacity
     node: the select() is now plain arithmetic, untested). Off until a shot shows the chalk; then turn on. */
  X:[.6,1.5],Z:[-.9,.9],/* the right-hand box (x > 0) as painted; the left one is its mirror */
  PAD:.25,H:.012,/* clay pad margin round the lines, pad height */
  FEET:[[.95,.55,.22,.16,1],[.95,-.33,.2,.14,.55]],/* back-foot hole and front-foot scuff: |x|, z, half axes, depth share */
  BOX_SRC:[0,2.35],/* bare dirt behind the plate the pads take their colour from (no paint there) */
  LINE_W:.08,FRINGE:.035,LINE_T:.004,/* chalk: core width (3 in), powder fringe each side, crown height */
  RUB:[[.95,.55,.45],[.95,-.33,.35],[.62,.2,.35]],/* rubbed-out chalk: |x|, z, radius (feet and the inner line by the plate) */
  FOUL_TO:1.45,/* the foul-line stub runs from the box front line to this |x| (painted line beyond) */
};

/* deterministic value noise for the vertex lumps (no Math.random) */
const hash=(x,y,k)=>{let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296};
const vn=(x,y,k)=>{const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  a=hash(xi,yi,k),b=hash(xi+1,yi,k),c=hash(xi,yi+1,k),e=hash(xi+1,yi+1,k);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy};
const sat=x=>x<0?0:x>1?1:x,sm=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)};
/* 0 at the centre of an ellipse, 1 on its edge */
const ell=(x,z,e)=>Math.hypot((x-e[0])/e[2],(z-e[1])/e[3]);
/* field-map UV of a world point (game.js: plane 260 x 190 centred at z -55, map z -150 at v 1, z 40 at v 0) */
const fieldUV=(x,z)=>[(x+130)/260,(40-z)/190];

/* grid mesh over [x0,x1] x [z0,z1]: f(x,z) -> {y, wear, clay} or null (dropped); src(x,z) -> [x,z] the colour is read from */
function grid(x0,x1,z0,z1,step,f,src){const nx=Math.round((x1-x0)/step)+1,nz=Math.round((z1-z0)/step)+1,pos=[],uv=[],wear=[],clay=[],id=new Int32Array(nx*nz).fill(-1),idx=[];
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const x=x0+(x1-x0)*i/(nx-1),z=z0+(z1-z0)*j/(nz-1),p=f(x,z);if(!p)continue;
    id[j*nx+i]=pos.length/3;pos.push(x,p.y,z);uv.push(...fieldUV(...src(x,z)));wear.push(p.wear);clay.push(p.clay)}
  for(let j=0;j<nz-1;j++)for(let i=0;i<nx-1;i++){const a=id[j*nx+i],b=id[j*nx+i+1],c=id[(j+1)*nx+i],d=id[(j+1)*nx+i+1];
    if(a<0||b<0||c<0||d<0)continue;idx.push(a,c,b,b,c,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setAttribute('wear',new THREE.Float32BufferAttribute(wear,1));g.setAttribute('clay',new THREE.Float32BufferAttribute(clay,1));
  g.setIndex(idx);g.computeVertexNormals();return g}

/* mound height at a world point: {y, wear (0..1 dug), clay (1 on the mound)} or null outside the rim */
function moundAt(x,z){const M=MOUND,dx=x-M.C[0],dz=z-M.C[1],r=Math.hypot(dx,dz);if(r>M.RIM+M.STEP)return null;
  const front=sat(dz/Math.max(r,1e-6))*sm(0,.2,r),r0=M.TABLE_BACK+(M.TABLE_FRONT-M.TABLE_BACK)*front,t=sat((r-r0)/(M.RIM-r0));
  /* front: an even slope (rounded off at both ends); back and sides: a shoulder that falls off quicker */
  const fall=front*(t*t*(3-2*t)*.35+t*.65)+(1-front)*sm(0,1,t)**.8;let h=M.H*(1-fall);
  h+=M.LUMP*(vn(x*9,z*9,5)-.5)*sm(M.RIM,M.RIM-.3,r);
  /* dig: rubber slot, push-off hole, landing hole, worn path between them */
  const R=M.RUBBER,slot=!M.SLOT?0:sm(1.25,1,Math.max(Math.abs(x-R[0])/R[2],Math.abs(z-R[1])/R[3]));
  const push=sm(1,.45,ell(x,z,M.PUSH)),land=sm(1,.4,ell(x,z,M.LAND)),
    along=sat((z-M.PUSH[1])/(M.LAND[1]-M.PUSH[1])),path=sm(M.PATH_W,M.PATH_W*.4,Math.abs(x))*(along>0&&along<1?1:0)*M.PATH_K;
  const dig=Math.max(slot,push,land,path);
  /* loose clay kicked out round the holes (not into the slot), uneven */
  const ring=e=>{const d=ell(x,z,e);return sm(.9,1.1,d)*sm(1+M.LOOSE_W/e[2]*2.2,1.1,d)};
  const loose=Math.max(ring(M.PUSH),ring(M.LAND))*(1-slot)*M.LOOSE*(.5+vn(x*14,z*14,6));
  h=h*(1-dig)+loose*(1-dig);
  return{y:M.LIFT+Math.max(0,h)*sm(M.RIM,M.RIM-.08,r),wear:Math.max(push,land,path*.8)*(1-slot),clay:sm(M.RIM,M.RIM-.35,r)}}

/* box pad height (right box, x > 0; the left one calls it with -x): {y, wear, clay} */
function padAt(x,z){const B=BOX,ax=Math.abs(x),e=Math.max(B.X[0]-ax,ax-B.X[1],B.Z[0]-z,z-B.Z[1]);/* < 0 inside the box */
  let h=B.H*sm(B.PAD,0,e);let wear=0;
  for(const [fx,fz,a,b,k] of B.FEET){const d=sm(1,.35,ell(ax,z,[fx,fz,a,b]));wear=Math.max(wear,d*k);h*=1-d*k}
  h+=.002*(vn(x*12,z*12,8)-.5)*sm(B.PAD,0,e);
  return{y:MOUND.LIFT*sm(B.PAD,B.PAD*.6,e)+Math.max(0,h),wear,clay:.35*sm(B.PAD,0,e)}}

/* the material the field wears (polished one first), cloned with dig darkening, clay tint and a polygon offset over the ground */
function fieldMat(scene,name){const src=scene.getObjectByName('prop:field')||scene.getObjectByName('old:field');if(!src)throw new Error('old:field not found');
  const {attribute,mix,vec3,float}=TSL,m=src.material.clone();m.name=name;
  const wear=attribute('wear','float'),clay=attribute('clay','float'),M=MOUND;
  m.colorNode=src.material.colorNode.mul(mix(vec3(1),vec3(...M.CLAY),clay)).mul(mix(float(1),float(M.HOLE),wear));
  m.roughnessNode=src.material.roughnessNode.mul(mix(float(1),float(M.PACK_ROUGH),clay.mul(float(1).sub(wear))));
  m.polygonOffset=true;m.polygonOffsetFactor=-1;m.polygonOffsetUnits=-2;m.needsUpdate=true;return m}

/* chalk: a crowned strip with a powder fringe; opacity drops where feet rubbed it out. pts = [x0,z0,x1,z1], y(x,z) = ground height */
function chalkStrip(x0,z0,x1,z1,y,fade){const B=BOX,L=Math.hypot(x1-x0,z1-z0),n=Math.max(2,Math.ceil(L/.02)),ux=(x1-x0)/L,uz=(z1-z0)/L,px=-uz,pz=ux;
  const across=[-B.LINE_W/2-B.FRINGE,-B.LINE_W/2,0,B.LINE_W/2,B.LINE_W/2+B.FRINGE],crown=[0,.6,1,.6,0],pos=[],uv=[],idx=[];
  for(let i=0;i<=n;i++){const s=i/n;for(let k=0;k<5;k++){const x=x0+(x1-x0)*s+px*across[k],z=z0+(z1-z0)*s+pz*across[k];
    pos.push(x,y(x,z)+B.LINE_T*crown[k]+.001,z);uv.push(k/4,fade?s:-1)}}
  for(let i=0;i<n;i++)for(let k=0;k<4;k++){const a=i*5+k,b=a+1,c=a+5,d=a+6;idx.push(a,c,b,b,c,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
  g.setIndex(idx);g.computeVertexNormals();return g}
let CHALK=null;
function chalkMat(){if(CHALK)return CHALK;const {uv,positionWorld,abs,float,min,max,step,smoothstep,mx_fractal_noise_float:fn,vec3,length,vec2}=TSL,B=BOX;
  const m=new THREE.MeshStandardNodeMaterial({roughness:1,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-4});
  const w=positionWorld.xz,a=abs(uv().x.sub(.5)).mul(2),core=B.LINE_W/(B.LINE_W+2*B.FRINGE);
  const grain=fn(vec3(w.mul(60),1),3,2,.5),clump=fn(vec3(w.mul(7),2),2,2,.5);
  /* powder: full in the core, thinning grain out into the fringe */
  let op=float(1).sub(smoothstep(float(core),float(1),a.sub(grain.mul(.25)))).mul(float(.9).add(clump.mul(.2)));
  /* rubbed out by feet: mirror x so both boxes share one rule */
  const ax=vec2(abs(w.x),w.y);let rub=float(1);for(const [x,z,r] of B.RUB)rub=min(rub,smoothstep(float(r*.35),float(r),length(ax.sub(vec2(x,z))).add(clump.mul(.25))));
  op=op.mul(rub.mul(.85).add(.15));
  /* foul-line stub: fades out over its last third (uv.y >= 0 only there) */
  op=op.mul(float(1).sub(step(float(1e-4),uv().y).mul(smoothstep(float(.66),float(1),uv().y))));
  m.colorNode=vec3(.93,.92,.88).mul(float(.9).add(grain.mul(.12)));m.opacityNode=op;return CHALK=m}

/* ctx: {scene} -> Group with the mound and both boxes. Throws if the field plane is not there (props/index.js then keeps the paint). */
export function buildMound(ctx){const M=MOUND,B=BOX,g=new THREE.Group();g.name='prop:mound';
  const mm=fieldMat(ctx.scene,'prop:mound'),R=M.RIM+M.STEP;
  const mound=new THREE.Mesh(grid(M.C[0]-R,M.C[0]+R,M.C[1]-R,M.C[1]+R,M.STEP,moundAt,(x,z)=>[x,z]),mm);
  mound.name='prop:mound:clay';mound.receiveShadow=true;mound.castShadow=true;g.add(mound);
  if(!B.ON)return g;
  const bm=fieldMat(ctx.scene,'prop:boxes'),cm=chalkMat();
  for(const s of [-1,1]){const fx=x=>s*x;/* world x of a right-box x */
    const src=(x,z)=>{const lx=Math.abs(x)-(B.X[0]+B.X[1])/2;return[s*z,B.BOX_SRC[1]+s*lx]};
    const pad=new THREE.Mesh(grid(Math.min(fx(B.X[0]-B.PAD),fx(B.X[1]+B.PAD)),Math.max(fx(B.X[0]-B.PAD),fx(B.X[1]+B.PAD)),B.Z[0]-B.PAD,B.Z[1]+B.PAD,.02,
      (x,z)=>padAt(s*x,z),src),bm);pad.name='prop:box:'+s;pad.receiveShadow=true;g.add(pad);
    const y=(x,z)=>padAt(s*x,z).y,[a,b]=B.X.map(fx),[c,d]=B.Z;
    for(const [x0,z0,x1,z1] of [[a,c,b,c],[b,c,b,d],[b,d,a,d],[a,d,a,c]]){const l=new THREE.Mesh(chalkStrip(x0,z0,x1,z1,y,false),cm);l.renderOrder=3;g.add(l)}
    /* foul line from where it meets the box front line out past the pad edge, fading into the painted line */
    const f0=-B.Z[0],l=new THREE.Mesh(chalkStrip(s*f0,-f0,s*B.FOUL_TO,-B.FOUL_TO,(x,z)=>Math.max(y(x,z),M.LIFT),true),cm);l.renderOrder=3;g.add(l)}
  return g}
