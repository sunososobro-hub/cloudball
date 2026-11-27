/* render/skyocc.js: sky occlusion worked out ahead of time for the park's static parts (#214 item 2, per-vertex fallback the
 * manager allowed when no bake ships). Pure data, no three.js, no DOM: game.js (next part) hands it the positions and normals of
 * a static mesh plus the triangles that can shade it (stands, roof, dugouts, walls), and multiplies the result into vertex colours
 * on `max` only. Same input = same output (fixed ray set, no Math.random), so a park looks the same on every load.
 *
 * Method: for each vertex, SKYOCC.RAYS cosine-weighted directions over the normal's hemisphere (a fixed Fibonacci set, rotated
 * into the normal's frame) are cast against the occluder triangles (Moller-Trumbore) through a uniform grid; visibility = share
 * of rays that leave unblocked within SKYOCC.FAR metres. Rays start SKYOCC.BIAS off the surface so a face does not shade itself. */
export const SKYOCC={RAYS:48,FAR:40,BIAS:.02,CELL:4,MIN:.35,GAMMA:1};

const GOLD=Math.PI*(3-Math.sqrt(5)),EPS=1e-9;

/* Fixed cosine-weighted directions around +z: [x,y,z] * n. z = sqrt(1 - u) gives the cosine law over the hemisphere. */
export function rayDirs(n=SKYOCC.RAYS){const d=new Float32Array(n*3);
  for(let i=0;i<n;i++){const u=(i+.5)/n,r=Math.sqrt(u),a=i*GOLD;d[i*3]=r*Math.cos(a);d[i*3+1]=r*Math.sin(a);d[i*3+2]=Math.sqrt(1-u)}
  return d}

/* Uniform grid over the occluder triangles: cell -> triangle list. pos = Float32Array xyz, idx = triangle indices (or null = soup). */
export function buildGrid(pos,idx,cell=SKYOCC.CELL){
  const nt=idx?idx.length/3:pos.length/9,vi=idx?(t,k)=>idx[t*3+k]:(t,k)=>t*3+k,lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.length;i+=3)for(let a=0;a<3;a++){lo[a]=Math.min(lo[a],pos[i+a]);hi[a]=Math.max(hi[a],pos[i+a])}
  if(!nt)return{nt:0,cells:new Map(),lo,cell,dim:[0,0,0],tri:new Float32Array(0)};
  const dim=lo.map((l,a)=>Math.max(1,Math.ceil((hi[a]-l)/cell+1e-6))),cells=new Map(),tri=new Float32Array(nt*9);
  for(let t=0;t<nt;t++){const b0=[Infinity,Infinity,Infinity],b1=[-Infinity,-Infinity,-Infinity];
    for(let k=0;k<3;k++){const v=vi(t,k);for(let a=0;a<3;a++){const p=pos[v*3+a];tri[t*9+k*3+a]=p;b0[a]=Math.min(b0[a],p);b1[a]=Math.max(b1[a],p)}}
    const c0=b0.map((b,a)=>Math.min(dim[a]-1,Math.floor((b-lo[a])/cell))),c1=b1.map((b,a)=>Math.min(dim[a]-1,Math.floor((b-lo[a])/cell)));
    for(let x=c0[0];x<=c1[0];x++)for(let y=c0[1];y<=c1[1];y++)for(let z=c0[2];z<=c1[2];z++){const k=(x*dim[1]+y)*dim[2]+z;let l=cells.get(k);if(!l)cells.set(k,l=[]);l.push(t)}}
  return{nt,cells,lo,cell,dim,tri}}

function hitTri(T,t,o,d,far){const b=t*9,ax=T[b],ay=T[b+1],az=T[b+2],e1x=T[b+3]-ax,e1y=T[b+4]-ay,e1z=T[b+5]-az,e2x=T[b+6]-ax,e2y=T[b+7]-ay,e2z=T[b+8]-az;
  const px=d[1]*e2z-d[2]*e2y,py=d[2]*e2x-d[0]*e2z,pz=d[0]*e2y-d[1]*e2x,det=e1x*px+e1y*py+e1z*pz;if(Math.abs(det)<EPS)return false;
  const inv=1/det,sx=o[0]-ax,sy=o[1]-ay,sz=o[2]-az,u=(sx*px+sy*py+sz*pz)*inv;if(u<0||u>1)return false;
  const qx=sy*e1z-sz*e1y,qy=sz*e1x-sx*e1z,qz=sx*e1y-sy*e1x,v=(d[0]*qx+d[1]*qy+d[2]*qz)*inv;if(v<0||u+v>1)return false;
  const s=(e2x*qx+e2y*qy+e2z*qz)*inv;return s>EPS&&s<far}

/* Does the ray o + s d (|d| = 1) hit any occluder before `far`? 3D-DDA through the grid; each triangle tested once per ray. */
export function blocked(G,o,d,far=SKYOCC.FAR,seen=new Set()){
  if(!G.nt)return false;const {lo,cell,dim,cells,tri}=G,c=[0,0,0],step=[0,0,0],tMax=[0,0,0],tD=[0,0,0];let t0=0;
  /* Clip the ray to the grid box first: a vertex outside it (open ground) may still look into the stands. */
  let tin=0,tout=far;for(let a=0;a<3;a++){const b0=lo[a],b1=lo[a]+dim[a]*cell;
    if(Math.abs(d[a])<EPS){if(o[a]<b0||o[a]>b1)return false;continue}
    let s0=(b0-o[a])/d[a],s1=(b1-o[a])/d[a];if(s0>s1)[s0,s1]=[s1,s0];tin=Math.max(tin,s0);tout=Math.min(tout,s1)}
  if(tin>tout)return false;t0=tin;seen.clear();
  for(let a=0;a<3;a++){const p=o[a]+d[a]*t0;c[a]=Math.min(dim[a]-1,Math.max(0,Math.floor((p-lo[a])/cell)));
    if(d[a]>EPS){step[a]=1;tMax[a]=(lo[a]+(c[a]+1)*cell-o[a])/d[a];tD[a]=cell/d[a]}
    else if(d[a]<-EPS){step[a]=-1;tMax[a]=(lo[a]+c[a]*cell-o[a])/d[a];tD[a]=-cell/d[a]}
    else{step[a]=0;tMax[a]=Infinity;tD[a]=Infinity}}
  for(;;){const l=cells.get((c[0]*dim[1]+c[1])*dim[2]+c[2]);
    if(l)for(const t of l){if(seen.has(t))continue;seen.add(t);if(hitTri(tri,t,o,d,far))return true}
    const a=tMax[0]<tMax[1]?(tMax[0]<tMax[2]?0:2):(tMax[1]<tMax[2]?1:2);if(tMax[a]>tout)return false;
    c[a]+=step[a];if(c[a]<0||c[a]>=dim[a])return false;tMax[a]+=tD[a]}}

/* Per-vertex sky visibility in [0, 1] (1 = open sky over the whole hemisphere). pos / nor: Float32Array xyz of the receiving mesh,
 * world space; G: buildGrid of the occluders (the receiver may be among them). */
export function skyVisibility(pos,nor,G,o={}){const n=pos.length/3,R=o.rays??SKYOCC.RAYS,far=o.far??SKYOCC.FAR,bias=o.bias??SKYOCC.BIAS,
    D=rayDirs(R),out=new Float32Array(n),org=[0,0,0],dir=[0,0,0],seen=new Set();
  for(let i=0;i<n;i++){let nx=nor[i*3],ny=nor[i*3+1],nz=nor[i*3+2];const l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    /* Tangent frame (Duff et al. 2017, branchless ONB) */
    const sg=nz>=0?1:-1,a=-1/(sg+nz),b=nx*ny*a,tx=1+sg*nx*nx*a,ty=sg*b,tz=-sg*nx,bx=b,by=sg+ny*ny*a,bz=-ny;
    for(let k=0;k<3;k++)org[k]=pos[i*3+k]+[nx,ny,nz][k]*bias;let free=0;
    for(let r=0;r<R;r++){const x=D[r*3],y=D[r*3+1],z=D[r*3+2];dir[0]=tx*x+bx*y+nx*z;dir[1]=ty*x+by*y+ny*z;dir[2]=tz*x+bz*y+nz*z;
      if(!blocked(G,org,dir,far,seen))free++}
    out[i]=free/R}
  return out}

/* Visibility -> vertex colour multiplier: never darker than SKYOCC.MIN (bounce light still reaches the deepest corner). */
export const occShade=(v,min=SKYOCC.MIN,g=SKYOCC.GAMMA)=>min+(1-min)*Math.pow(Math.min(1,Math.max(0,v)),g);
