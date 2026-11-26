/* render/keyfit.js: the tight key-shadow frustum of the max tier (#211 item 2, the part PR #217 left). Pure math, no three.js (a plain Node check
 * loads it: tests/keyfit.check.mjs). game.js asks fitKey() each frame on max with the camera it just placed; the answer is where the key light's
 * shadow box sits on the ground (centre F) and how wide it is (half, metres). The light keeps its direction (OFFSET from F), so lighting does
 * not change, only the shadow map's texels get smaller where the picture is. A pure function of the camera, and the camera is a pure function
 * of (event, time), so a jump to a moment equals playing to it. Wide shots keep the whole park (MAX_HALF = the default frustum). */
export const KEYFIT={OFFSET:[-45,85,73],MIN_HALF:14,MAX_HALF:75,STEP:2,PAD:1.25,FLAT:.4};
/* p = camera position, aim = the point the shot is aimed at (the batter, the ball, the middle of the field), fov = vertical degrees. A level
   view hits the ground far away, so the aim point, not the ground hit, says where the subject is. Returns {x,z,half}: the aim point dropped to
   the ground and the half width of the shadow box that covers the picture (footprint of the view there, padded, rounded up to STEP so it does
   not shimmer). */
export function fitKey(px,py,pz,ax,ay,az,fov,aspect){
  const K=KEYFIT,t=Math.max(Math.hypot(ax-px,ay-py,az-pz),1),slope=Math.max((py-ay)/t,K.FLAT),
    tv=Math.tan(fov*Math.PI/360),th=tv*Math.max(aspect,1),reach=t*Math.max(th,tv/slope)*K.PAD,
    half=Math.min(K.MAX_HALF,Math.max(K.MIN_HALF,Math.ceil(reach/K.STEP)*K.STEP));
  return {x:ax,z:az,half}}
/* Move the box centre (x, 0, z) to a whole shadow texel along the light's own right and up axes, or the shadow edges crawl while the camera
   pans. The moved point may lift off the ground a little (up has a y part): that is fine for a light target. Returns {x,y,z}. */
export function snapKey(x,z,half,mapSize){
  const [ox,oy,oz]=KEYFIT.OFFSET,L=Math.hypot(ox,oy,oz),lx=ox/L,ly=oy/L,lz=oz/L;
  let rx=lz,rz=-lx;const R=Math.hypot(rx,rz);rx/=R;rz/=R;/* right = world up x light */
  const ux=ly*rz,uy=lz*rx-lx*rz,uz=-ly*rx;/* up = light x right */
  const tx=2*half/mapSize,a=x*rx+z*rz,b=x*ux+z*uz,da=Math.round(a/tx)*tx-a,db=Math.round(b/tx)*tx-b;
  return {x:x+da*rx+db*ux,y:db*uy,z:z+da*rz+db*uz}}
