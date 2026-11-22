/* render/pbr.js: the shared material library for polished props (#215, ladder #205 stage 3).
 * Every texture is drawn here at load from our own seeded noise (rule 16: code-generated, nothing downloaded, no Math.random).
 * One relief = one tileable height field h(u,v) in 0..1. From it come three images:
 *   albedo multiplier (darker in the hollows: cheap baked occlusion), normal map (slope of h), roughness (h plus fine noise).
 * A material kind names colour, roughness, metalness and its default relief. Everything is cached by key, so two props with the same
 * kind, relief and colour share one material and one set of textures.
 * Polish rounds may ADD a kind or a relief here; never change an existing one (other props use it).
 * UVs are in metres: use box()/cyl() below (or scale your own UVs) so one texture tile = TILE_M[relief] metres everywhere. */
import * as THREE from 'three/webgpu';

export const PBR_PX=256;/* texture size of every relief (tileable, RepeatWrapping) */
const OCC=.55;/* how much darker the deepest hollow gets in the albedo */

/* ---------- seeded noise (same hash family as game.js hashG) ---------- */
function hash(x,y,k){let h=Math.imul(x*73856093^y*19349663^k*83492791,2654435761);h^=h>>>15;h=Math.imul(h,2246822519);h^=h>>>13;return(h>>>0)/4294967296}
/* tileable value noise, period p cells */
function vn(x,y,k,p){const xi=Math.floor(x),yi=Math.floor(y),fx=x-xi,fy=y-yi,sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy),
  H=(a,b)=>hash(((a%p)+p)%p,((b%p)+p)%p,k),a=H(xi,yi),b=H(xi+1,yi),c=H(xi,yi+1),e=H(xi+1,yi+1);return a+(b-a)*sx+(c-a)*sy+(a-b-c+e)*sx*sy}
function fbm(u,v,k,p,oct=4){let s=0,a=.5,n=0;for(let o=0;o<oct;o++){s+=vn(u*p,v*p,k+o,p)*a;n+=a;a*=.5;p*=2}return s/n}
/* tileable cellular noise (distance to the nearest feature point), period p cells: dimples, pebbles */
function cell(u,v,k,p){const x=u*p,y=v*p,xi=Math.floor(x),yi=Math.floor(y);let d=9;
  for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++){const cx=xi+i,cy=yi+j,wx=((cx%p)+p)%p,wy=((cy%p)+p)%p,px=cx+hash(wx,wy,k),py=cy+hash(wx,wy,k+1);d=Math.min(d,Math.hypot(px-x,py-y))}
  return Math.min(1,d)}
const sat=x=>x<0?0:x>1?1:x,smooth=(a,b,x)=>{const t=sat((x-a)/(b-a));return t*t*(3-2*t)};

/* ---------- reliefs: name -> h(u,v) in 0..1 (1 = proud surface, 0 = deepest hollow), tile size in metres, normal strength ---------- */
export const RELIEFS={
  plain:   {m:1,   n:.6, h:(u,v)=>.85+.15*fbm(u,v,1,8)},
  hammered:{m:.5,  n:1.4,h:(u,v)=>.35+.65*smooth(0,.75,cell(u,v,11,9))},/* hammered/peened steel: overlapping shallow dimples */
  cast:    {m:2,   n:1.1,h:(u,v)=>{/* cast concrete: broad unevenness, pores, form-board seam lines every half tile */
    const pores=cell(u,v,21,48)<.13?.35:0,seam=Math.min(Math.abs(((v*2)%1)-.5)*2,1)>.985?.5:0;return sat(.55+.35*fbm(u,v,22,6)-pores-seam)}},
  stitched:{m:.6,  n:2.2,h:(u,v)=>{/* vinyl padding: pillowed quilt panels with stitch lines and fine pebble grain */
    const a=Math.min(u%.5,.5-u%.5)/.5,b=Math.min(v,1-v),e=Math.sin(Math.min(1,a/.12)*Math.PI/2)*Math.sin(Math.min(1,b/.12)*Math.PI/2),
      st=(Math.abs(a-.06)<.01||Math.abs(b-.06)<.01)&&((u*80|0)%2===0||(v*80|0)%2===0)?.25:0;return sat(.15+.8*e-st+.05*cell(u,v,31,64))}},
  lattice: {m:.15, n:1.6,h:(u,v)=>{/* welded wire lattice (helmet shelf back): raised bars with weld beads at crossings */
    const bx=Math.abs(((u*2)%1)-.5)*2,by=Math.abs(((v*2)%1)-.5)*2,bar=Math.max(smooth(.75,.9,bx),smooth(.75,.9,by));return sat(.2+.7*bar+(bx>.85&&by>.85?.1:0))}},
  woven:   {m:.08, n:1.2,h:(u,v)=>{/* woven net / mesh: over-under strands */
    const s=(Math.floor(u*4)+Math.floor(v*4))%2,a=Math.sin((u*4%1)*Math.PI),b=Math.sin((v*4%1)*Math.PI);return sat(.2+.7*(s?a*.7+b*.3:b*.7+a*.3))}},
  turned:  {m:1.2, n:.9, h:(u,v)=>{/* wood: long grain along u, a few knots, slat gaps every quarter of v */
    const w=v+.04*fbm(u,v,41,4),g=.5+.5*Math.sin(w*90+8*fbm(u,v,42,3)),knot=cell(u,v,43,3)<.06?.3:0,gap=((v*4)%1)<.04?.6:0;return sat(.55+.3*g-knot-gap)}},
  grain:   {m:.12, n:1.8,h:(u,v)=>.3+.7*smooth(0,.6,cell(u,v,51,24))},/* leather pebble grain */
  ribbed:  {m:.2,  n:2.4,h:(u,v)=>{/* corrugated steel deck (roof underside): ribs along u */const r=Math.abs(((v*1)%1)-.5)*2;return sat(.15+.85*smooth(.35,.65,r))+.04*fbm(u,v,61,8)}},
  rubber:  {m:.3,  n:1.3,h:(u,v)=>{/* rubber floor mat: raised round studs */const d=Math.hypot(((u*6)%1)-.5,((v*6)%1)-.5);return sat(.3+.6*(1-smooth(.22,.3,d))+.08*fbm(u,v,71,16))}},
  dirt:    {m:.8,  n:.8, h:(u,v)=>sat(.4+.5*fbm(u,v,81,10)-(cell(u,v,82,30)<.08?.3:0))},/* chalked dirt: lumps and tiny pits */
};

/* ---------- material kinds ---------- */
export const KINDS={
  paintedSteel: {color:0x2c3340,rough:.55,metal:.35,relief:'hammered',rv:.18},
  galvSteel:    {color:0xa9b0b6,rough:.42,metal:.9, relief:'plain',   rv:.3},
  vinylPad:     {color:0x1d4d2a,rough:.62,metal:0,  relief:'stitched',rv:.15},
  concrete:     {color:0x8c8a84,rough:.92,metal:0,  relief:'cast',    rv:.1},
  wood:         {color:0x9a6a3c,rough:.6, metal:0,  relief:'turned',  rv:.2},
  leather:      {color:0x5a3a22,rough:.5, metal:0,  relief:'grain',   rv:.2},
  rubber:       {color:0x1a1b1e,rough:.85,metal:0,  relief:'rubber',  rv:.1},
  dirt:         {color:0x8a6a4a,rough:.98,metal:0,  relief:'dirt',    rv:.05},
  gloss:        {color:0x223355,rough:.22,metal:.05,relief:'plain',   rv:.08},/* gloss shell plastic: helmets, coolers */
};

const TEX={},MAT={};
function canvasTex(px,fill,srgb){const c=document.createElement('canvas');c.width=c.height=px;const g=c.getContext('2d'),im=g.createImageData(px,px);fill(im.data);g.putImageData(im,0,0);
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t}
/* the three images of one relief, built once */
export function reliefMaps(name){if(TEX[name])return TEX[name];const R=RELIEFS[name]||RELIEFS.plain,N=PBR_PX,H=new Float32Array(N*N);
  for(let y=0;y<N;y++)for(let x=0;x<N;x++)H[y*N+x]=R.h((x+.5)/N,(y+.5)/N);
  const at=(x,y)=>H[((y+N)%N)*N+((x+N)%N)];
  const ao=canvasTex(N,d=>{for(let i=0;i<N*N;i++){const k=1-OCC*(1-H[i])**1.5;d[i*4]=d[i*4+1]=d[i*4+2]=k*255;d[i*4+3]=255}},true);
  const nm=canvasTex(N,d=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,dx=(at(x+1,y)-at(x-1,y))*R.n*N/64,dy=(at(x,y+1)-at(x,y-1))*R.n*N/64,l=Math.hypot(dx,dy,1);
    d[i*4]=(.5-dx/l/2)*255;d[i*4+1]=(.5+dy/l/2)*255;d[i*4+2]=(.5+.5/l)*255;d[i*4+3]=255}});
  /* roughness image: hollows hold dust (rougher), proud spots are worn smooth; G channel is what three.js reads */
  const rm=canvasTex(N,d=>{for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x,k=sat(.5+(.5-H[i])*.8+(vn(x/8,y/8,91,N/8)-.5)*.5);d[i*4]=d[i*4+1]=d[i*4+2]=k*255;d[i*4+3]=255}});
  return TEX[name]={ao,nm,rm,m:R.m}}

/* mat(kind, {color, relief, rough, metal, emissive, emissiveIntensity}) -> cached MeshStandardMaterial */
export function mat(kind,o={}){const K=KINDS[kind]||KINDS.paintedSteel,relief=o.relief||K.relief,color=o.color??K.color,
  key=[kind,relief,color,o.rough??'',o.metal??'',o.emissive??'',o.emissiveIntensity??''].join('|');if(MAT[key])return MAT[key];
  const T=reliefMaps(relief),m=new THREE.MeshStandardMaterial({color:new THREE.Color(color),roughness:Math.min(1,(o.rough??K.rough)+K.rv*.5),metalness:o.metal??K.metal,
    map:T.ao,normalMap:T.nm,roughnessMap:T.rm});
  if(o.emissive!==undefined){m.emissive=new THREE.Color(o.emissive);m.emissiveIntensity=o.emissiveIntensity??.3}
  m.userData.tileM=T.m;return MAT[key]=m}

/* ---------- geometry with UVs in metres (one texture tile = tileM metres) ---------- */
/* BoxGeometry face order: +x, -x, +y, -y, +z, -z; 4 vertices each. u/v run along the face's own width/height. */
export function box(w,h,d,tileM=1){const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,F=[[d,h],[d,h],[w,d],[w,d],[w,h],[w,h]];
  for(let f=0;f<6;f++)for(let i=0;i<4;i++){const j=f*4+i;uv.setXY(j,uv.getX(j)*F[f][0]/tileM,uv.getY(j)*F[f][1]/tileM)}uv.needsUpdate=true;return g}
/* cylinder along y with u around (circumference) and v along the height, in metres */
export function cyl(rt,rb,h,seg=12,tileM=1,open=false){const g=new THREE.CylinderGeometry(rt,rb,h,seg,1,open),uv=g.attributes.uv,c=Math.PI*(rt+rb);
  for(let j=0;j<uv.count;j++)uv.setXY(j,uv.getX(j)*c/tileM,uv.getY(j)*h/tileM);uv.needsUpdate=true;return g}
/* mesh helper: geometry sized for the material's own tile */
export function part(geoFn,m,...a){return new THREE.Mesh(geoFn(...a,m.userData.tileM||1),m)}
