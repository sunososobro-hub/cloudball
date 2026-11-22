/* render/props/mound.js: the pitcher's mound and the two batter's boxes (#215 polish lane, round 1). Polish rounds edit only this file
 * (and add to render/pbr.js). Before this, both were paint on the field map in game.js (a dirt circle r 2.7 m round the rubber, two
 * chalk rectangles beside the plate): there is no old mesh to hide, so old() is [] and the painted map stays underneath.
 * Mound: a real raised dirt table, built on a 2.5 cm square grid so the rubber footprint is cut out exactly (the painted rubber, and the
 * rubber of the bases prop, show through it). Height stays low (MOUND.H) because every pose stands at y 0: a real 25 cm mound needs
 * the pitcher to stand on moundY(), which is lane A's call (trap in the PR). Shape: plateau round the rubber, long slope toward home,
 * a dug push-off trench at the front of the rubber, the stride landing pit 1.6 m in front, cleat digs, a ragged edge where the clay
 * meets the grass. Surface: vertex colour = packed red clay on the table and in the holes, drier and lighter on the skirt, a damp halo
 * round the landing area; relief from the shared `dirt` kind of pbr.js; normals from the real geometry.
 * Batter's boxes: chalk with thickness (3D strips 7.6 cm wide, broken where spikes rubbed it out, powder drawn as a soft decal round
 * each line), and one clay decal per box (alpha-faded edges, so it melts into the plate circle) holding the dug foot holes: albedo
 * darker in the holes, a normal map from the same height field, so the holes catch the tower light at grazing angles.
 * Everything is seeded (fixed LCG / hash): same park every load. Frame: world, home plate at the origin, pitcher toward -z. */
import * as THREE from 'three/webgpu';
import {mat} from '../pbr.js';

export const MOUND={C:[0,-18.4],R:2.74,/* the old painted circle: centre (x, z), radius 9 ft */H:.035,/* plateau height (kept low: poses stand at y 0) */
  EDGE_Y:.006,/* lift at the grass edge, above the field plane */GRID:.025,/* grid step (m): the rubber edges fall on grid lines */
  PLAT:[0,-18.55,.8],/* plateau centre (x, z) and radius */SLOPE_HOME:1.35,/* the slope toward home is this much longer than the back */
  RUBBER:[-.3,.3,-18.5,-18.35],/* x0, x1, z0, z1 of the painted rubber: cut out */RUBBER_DIP:.14,/* the table dips to EDGE_Y within this of the rubber */
  TRENCH:[.42,.22,.018],/* push-off trench in front of the rubber: half width, length toward home, depth */
  PIT:[.08,-16.8,.42,.022],/* landing pit: x, z, radius, depth */DIGS:70,DIG_R:.06,DIG_D:.008,/* cleat digs round the rubber and the pit */
  RAGGED:.035,/* edge radius wobble (share of R) */NOISE:.004,/* surface lumps (m) */
  CLAY:[.50,.29,.19],DRY:[.60,.37,.24],DAMP:.85,/* sRGB colours: packed clay, dry skirt (the field map's dirt is about .61/.42/.26); damp factor at the pit */
  DECAL_A:.45,/* clay decal opacity away from the holes */
  BOX:[[.6,1.5],[-1.5,-.6]],BOX_Z:[-.9,.9],/* the old chalk rectangles: x ranges, z range */CHALK_W:.076,CHALK_H:.006,CHALK_GAP:.22,/* share of line pieces rubbed out near the feet */
  DECAL_PAD:.35,DECAL_PX:256,/* clay decal: margin round each box (m), texture size */
  HOLES:[[-.95,-.28,.17,1],[-.98,.52,.2,1.3],[.95,-.28,.15,.6],[.98,.52,.17,.8]],/* foot holes: x, z, radius, depth weight (righties dig the x<0 box deeper) */
  HOLE_N:3,/* normal strength of the holes */
};

/* seeded helpers */
const lcg=s=>()=>(s=(Math.imul(s,1103515245)+12345)&0x7fffffff)/0x7fffffff;
function hash(x,y,k){let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
function vn(x,y,k){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  a=hash(xi,yi,k),b=hash(xi+1,yi,k),c=hash(xi,yi+1,k),e=hash(xi+1,yi+1,k);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
const sat=x=>x<0?0:x>1?1:x,smooth=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)};

/* the dig list: fixed, so moundY is a pure function */
const DIGS=(()=>{const R=lcg(2150),M=MOUND,a=[];for(let i=0;i<M.DIGS;i++){const pit=i%3===0,t=R()*6.283,d=Math.sqrt(R())*(pit?M.PIT[2]*1.6:.6);
  a.push([(pit?M.PIT[0]:0)+Math.cos(t)*d,(pit?M.PIT[1]:-18.25)+Math.sin(t)*d*(pit?1:.6),M.DIG_R*(.6+R()*.8)])}return a})();

/* distance from (x, z) to the rubber rectangle (0 inside) */
const rubberD=(x,z)=>{const [x0,x1,z0,z1]=MOUND.RUBBER;return Math.hypot(Math.max(x0-x,0,x-x1),Math.max(z0-z,0,z-z1))};
/* edge radius at angle a (ragged) */
const edgeR=a=>MOUND.R*(1+MOUND.RAGGED*(vn(Math.cos(a)*3+5,Math.sin(a)*3+5,7)-.5)*2+MOUND.RAGGED*.4*(vn(a*9,1,8)-.5));

/* surface height of the mound at world (x, z), y in metres (EDGE_Y at the edge, 0 outside): for anything that stands on it */
export function moundY(x,z){const M=MOUND,[cx,cz]=M.C,dx=x-cx,dz=z-cz,r=Math.hypot(dx,dz),re=edgeR(Math.atan2(dz,dx));if(r>re)return 0;
  const [px,pz,pr]=M.PLAT,dp=Math.hypot(x-px,(z-pz)/(z>pz?M.SLOPE_HOME:1));
  let h=M.H*(1-smooth(pr,re*(z>pz?1:.95),dp+ (z>pz?0:.15)));
  h*=smooth(0,M.RUBBER_DIP,rubberD(x,z));/* the rubber sits in its dip */
  const [tw,tl,td]=M.TRENCH,tz=z-M.RUBBER[3];if(tz>0&&tz<tl&&Math.abs(x)<tw)h-=td*Math.sin(Math.PI*tz/tl)*smooth(tw,tw*.6,Math.abs(x));
  const [qx,qz,qr,qd]=M.PIT,dq=Math.hypot(x-qx,(z-qz)*.8);if(dq<qr)h-=qd*(1-(dq/qr)**2);
  for(const [gx,gz,gr] of DIGS){const d=Math.hypot(x-gx,z-gz);if(d<gr)h-=M.DIG_D*(1-(d/gr)**2)}
  h+=M.NOISE*(vn(x*6,z*6,3)-.5)+M.NOISE*.5*(vn(x*22,z*22,4)-.5);
  return M.EDGE_Y+Math.max(h,0)}

/* how worked the clay is at (x, z), 0..1: the table, the trench, the pit and the digs are packed red clay, the skirt is dry */
function clayAt(x,z){const M=MOUND,[px,pz,pr]=M.PLAT,dp=Math.hypot(x-px,(z-pz)/(z>pz?M.SLOPE_HOME:1)),[qx,qz,qr]=M.PIT;
  const pit=1-smooth(qr*.8,qr*2.2,Math.hypot(x-qx,z-qz)),table=1-smooth(pr*.7,pr*1.5,dp),
    path=Math.abs(x-qx*(z-M.PLAT[1])/(qz-M.PLAT[1]))<.35&&z>M.PLAT[1]&&z<qz?.7:0;
  return sat(Math.max(pit,table,path*(1-smooth(.2,.35,Math.abs(x))))+.25*(vn(x*3,z*3,9)-.5))}

function moundGeo(){const M=MOUND,[cx,cz]=M.C,S=M.GRID,N=Math.ceil(M.R*(1+M.RAGGED*1.5)/S),W=2*N+1,pos=[],col=[],uv=[],idx=[],at=new Int32Array(W*W).fill(-1);
  const inside=(x,z)=>Math.hypot(x-cx,z-cz)<=edgeR(Math.atan2(z-cz,x-cx));
  const [x0,x1,z0,z1]=M.RUBBER,inRubber=(x,z)=>x>x0&&x<x1&&z>z0&&z<z1,tile=mat('dirt').userData.tileM||1;
  const lin=a=>a.map(v=>new THREE.Color().setRGB(v,v,v,THREE.SRGBColorSpace).r),CL=lin(M.CLAY),DR=lin(M.DRY);
  const vid=(i,j)=>{const q=j*W+i;if(at[q]>=0)return at[q];let x=cx+(i-N)*S,z=cz+(j-N)*S;
    {const a=Math.atan2(z-cz,x-cx),re=edgeR(a)-.001;if(Math.hypot(x-cx,z-cz)>re){x=cx+Math.cos(a)*re;z=cz+Math.sin(a)*re}}/* outline vertices slide onto the edge: no grid stairs */
    const y=moundY(x,z)||M.EDGE_Y;
    const c=clayAt(x,z),dry=DR,cl=CL,d=sat(1-Math.hypot(x-M.PIT[0],z-M.PIT[1])/1.4),damp=1-(1-M.DAMP)*d,
      depth=sat((M.EDGE_Y+M.H*.5-y)/.02)*.15,k=(1-depth)*damp*(.92+.16*vn(x*9,z*9,11));
    pos.push(x,y,z);col.push((dry[0]+(cl[0]-dry[0])*c)*k,(dry[1]+(cl[1]-dry[1])*c)*k,(dry[2]+(cl[2]-dry[2])*c)*k);uv.push(x/tile,z/tile);return at[q]=pos.length/3-1};
  for(let j=0;j<W-1;j++)for(let i=0;i<W-1;i++){const x=cx+(i-N+.5)*S,z=cz+(j-N+.5)*S;if(!inside(x,z)||inRubber(x,z))continue;
    const a=vid(i,j),b=vid(i+1,j),c=vid(i,j+1),d=vid(i+1,j+1);idx.push(a,c,b,b,c,d)}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(col,3));
  g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();return g}

/* one batter's box: clay decal (albedo + alpha + normal from a hole height field) and the chalk rectangle as broken 3D strips */
function decalMaps(bx){const M=MOUND,P=M.DECAL_PAD,[xa,xb]=bx,[za,zb]=M.BOX_Z,w=xb-xa+2*P,h=zb-za+2*P,N=M.DECAL_PX,Ny=Math.round(N*h/w),H=new Float32Array(N*Ny);
  const holes=M.HOLES.filter(([x])=>x>xa-P&&x<xb+P);
  for(let j=0;j<Ny;j++)for(let i=0;i<N;i++){const x=xa-P+(i+.5)/N*w,z=za-P+(j+.5)/Ny*h;let v=1;
    for(const [hx,hz,hr,hd] of holes){const d=Math.hypot((x-hx)*1.25,z-hz)/(hr*(1+.25*(vn(x*14,z*14,13)-.5)));if(d<1.25)v-=hd*.5*(d<1?1-d*d*.6:.4*(1.25-d)/.25)}
    H[j*N+i]=v+.04*(vn(x*30,z*30,14)-.5)}
  const cv=(f)=>{const c=document.createElement('canvas');c.width=N;c.height=Ny;const g=c.getContext('2d'),im=g.createImageData(N,Ny);
    for(let j=0;j<Ny;j++)for(let i=0;i<N;i++){const p=f(i,j),k=(j*N+i)*4;im.data[k]=p[0]*255;im.data[k+1]=p[1]*255;im.data[k+2]=p[2]*255;im.data[k+3]=255}g.putImageData(im,0,0);
    const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t};
  const at=(i,j)=>H[Math.min(Ny-1,Math.max(0,j))*N+Math.min(N-1,Math.max(0,i))];
  const alb=cv((i,j)=>{const d=sat(1-at(i,j)),k=(1-.5*d)*(.92+.16*vn(i/6,j/6,15)),c=MOUND.CLAY;return[c[0]*k,c[1]*k,c[2]*k]});alb.colorSpace=THREE.SRGBColorSpace;
  /* alpha: solid over the box, fading out across the margin (so the decal melts into the painted plate circle) */
  const alpha=cv((i,j)=>{const x=(i+.5)/N*w,z=(j+.5)/Ny*h,e=Math.min(x,w-x,z,h-z),a=smooth(0,P*.9,e+.12*(vn(i/10,j/10,16)-.5))*Math.min(1,M.DECAL_A*(.7+.6*vn(i/14,j/14,18))+sat(1-at(i,j))*2.5);return[a,a,a]});/* patchy clay, solid in and round the holes */
  const nm=cv((i,j)=>{const dx=(at(i+1,j)-at(i-1,j))*M.HOLE_N,dy=(at(i,j+1)-at(i,j-1))*M.HOLE_N,l=Math.hypot(dx,dy,1);return[.5-dx/l/2,.5+dy/l/2,.5+.5/l]});
  return {alb,alpha,nm,w,h,cx:(xa+xb)/2,cz:(za+zb)/2}}

function chalkGeo(R){const M=MOUND,parts=[],W=M.CHALK_W,piece=(x0,z0,x1,z1,worn)=>{const L=Math.hypot(x1-x0,z1-z0),n=Math.max(1,Math.round(L/.18));
  for(let k=0;k<n;k++){const t0=k/n,t1=(k+1)/n,mx=x0+(x1-x0)*(t0+t1)/2,mz=z0+(z1-z0)*(t0+t1)/2;
    const near=M.HOLES.some(([hx,hz,hr])=>Math.hypot(mx-hx,mz-hz)<hr+.35);if(worn&&near&&R()<M.CHALK_GAP*3)continue;if(R()<M.CHALK_GAP*.25)continue;
    const len=L/n*(.75+R()*.25),g=new THREE.BoxGeometry(len,M.CHALK_H*(.6+R()*.6),W*(.8+R()*.3));g.rotateY(-Math.atan2(z1-z0,x1-x0));g.translate(mx,M.CHALK_H/2,mz);parts.push(g)}};
  for(const [xa,xb] of M.BOX){const [za,zb]=M.BOX_Z;piece(xa,za,xb,za,0);piece(xa,zb,xb,zb,0);piece(xa,za,xa,zb,1);piece(xb,za,xb,zb,1)}
  return merge(parts)}
/* plain position/normal merge (BoxGeometry pieces) */
function merge(gs){const pos=[],nor=[],idx=[];let o=0;for(const g of gs){const p=g.attributes.position.array,n=g.attributes.normal.array;pos.push(...p);nor.push(...n);
  for(const i of g.index.array)idx.push(i+o);o+=p.length/3;g.dispose()}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(nor,3));g.setIndex(idx);return g}

/* chalk powder: a soft white veil round each line (alpha drawn per box) */
function powderTex(bx){const M=MOUND,P=M.DECAL_PAD,[xa,xb]=bx,[za,zb]=M.BOX_Z,w=xb-xa+2*P,h=zb-za+2*P,N=M.DECAL_PX,Ny=Math.round(N*h/w),c=document.createElement('canvas');
  c.width=N;c.height=Ny;const g=c.getContext('2d'),im=g.createImageData(N,Ny);
  for(let j=0;j<Ny;j++)for(let i=0;i<N;i++){const x=(i+.5)/N*w-P,z=(j+.5)/Ny*h-P,bw=xb-xa,bh=zb-za,
    d=Math.min(Math.abs(z)+(x<0||x>bw?Math.min(Math.abs(x),Math.abs(x-bw)):0),Math.abs(z-bh)+(x<0||x>bw?Math.min(Math.abs(x),Math.abs(x-bw)):0),
      Math.abs(x)+(z<0||z>bh?Math.min(Math.abs(z),Math.abs(z-bh)):0),Math.abs(x-bw)+(z<0||z>bh?Math.min(Math.abs(z),Math.abs(z-bh)):0)),
    a=sat(1-d/.09)**1.6*.55*(.5+vn(i/3,j/3,17)),k=(j*N+i)*4;im.data[k]=im.data[k+1]=im.data[k+2]=a*255;im.data[k+3]=255}
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.anisotropy=8;return t}

/* ctx: {} (nothing park-coloured here) -> THREE.Group of the mound and both boxes */
export function buildMound(){const M=MOUND,G=new THREE.Group();G.name='mound';
  const dm=mat('dirt',{color:0xffffff}).clone();dm.vertexColors=true;dm.roughnessMap=null;dm.roughness=.96;/* the relief's worn-smooth spots made the clay shine like wet paint */
  const mound=new THREE.Mesh(moundGeo(),dm);mound.receiveShadow=true;mound.name='mound:table';G.add(mound);
  for(const bx of M.BOX){const D=decalMaps(bx),pl=new THREE.PlaneGeometry(D.w,D.h).rotateX(-Math.PI/2);
    const m=new THREE.MeshStandardMaterial({map:D.alb,alphaMap:D.alpha,normalMap:D.nm,roughness:.96,metalness:0,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
    const d=new THREE.Mesh(pl,m);d.position.set(D.cx,.002,D.cz);d.receiveShadow=true;d.renderOrder=1;d.name='mound:box';G.add(d);
    const pw=new THREE.MeshStandardMaterial({color:0xf2efe6,alphaMap:powderTex(bx),roughness:1,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3});
    const p=new THREE.Mesh(pl.clone(),pw);p.position.set(D.cx,.003,D.cz);p.renderOrder=2;p.name='mound:powder';G.add(p)}
  const chalk=new THREE.Mesh(chalkGeo(lcg(2151)),new THREE.MeshStandardMaterial({color:0xf4f1ea,roughness:.98,metalness:0}));chalk.receiveShadow=true;chalk.name='mound:chalk';G.add(chalk);
  return G}

/* slot descriptor (render/props/index.js, slot rule #237): the mound and the boxes were paint on the field map, which stays underneath, so there are no old meshes to hide */
export const PROPS=[{name:'mound',build:()=>buildMound(),old:()=>[]}];
