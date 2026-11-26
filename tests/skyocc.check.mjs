/* #214 item 2 part 1: render/skyocc.js, per-vertex sky occlusion for the park's static parts. Plain Node, runs the real module.
 * Scenes: open ground (no occluder) = 1; a point under a wide roof slab = almost 0; the inner corner of a floor and a tall wall
 * = about half; a point beside a small post is barely touched; the same input twice gives the same bytes; occShade stays in
 * [MIN, 1]; a cell size change does not change the answer (the grid is only a speed-up). */
import {SKYOCC,rayDirs,buildGrid,skyVisibility,occShade} from '../render/skyocc.js';
const bad=[],near=(a,b,e)=>Math.abs(a-b)<=e;
/* Axis-aligned quad as two triangles (soup). c = centre, u / v = half-edge vectors. */
const quad=(c,u,v)=>{const p=(s,t)=>[0,1,2].map(k=>c[k]+s*u[k]+t*v[k]),A=p(-1,-1),B=p(1,-1),C=p(1,1),D=p(-1,1);return[...A,...B,...C,...A,...C,...D]};
const soup=(...q)=>new Float32Array(q.flat());
const vis=(G,p,n,o)=>skyVisibility(new Float32Array(p),new Float32Array(n),G,o)[0];

const D=rayDirs();let zsum=0;
for(let i=0;i<SKYOCC.RAYS;i++){const l=Math.hypot(D[i*3],D[i*3+1],D[i*3+2]);if(!near(l,1,1e-5))bad.push(`ray ${i} not unit (${l})`);if(D[i*3+2]<=0)bad.push(`ray ${i} below the hemisphere`);zsum+=D[i*3+2]}
if(!near(zsum/SKYOCC.RAYS,2/3,.02))bad.push(`mean cos ${(zsum/SKYOCC.RAYS).toFixed(3)}, cosine weighting wants 2/3`);

const empty=buildGrid(new Float32Array(0),null);
if(vis(empty,[0,0,0],[0,1,0])!==1)bad.push('open ground is not fully visible');

/* Roof: 30 x 30 m slab 3 m above the point, facing down. */
const roof=buildGrid(soup(quad([0,3,0],[15,0,0],[0,0,15])),null),vr=vis(roof,[0,0,0],[0,1,0]);
if(!(vr<.1))bad.push(`under a roof visibility ${vr.toFixed(3)}, want < .1`);

/* Corner: floor y = 0 plus a 50 m wall at z = -.5 m facing +z; a floor point at its foot sees about half the sky (cosine-weighted). */
const corner=buildGrid(soup(quad([0,0,0],[25,0,0],[0,0,25]),quad([0,25,-.5],[25,0,0],[0,25,0])),null),vc=vis(corner,[0,0,0],[0,1,0]);
if(!(vc>.35&&vc<.65))bad.push(`corner visibility ${vc.toFixed(3)}, want about .5`);
/* The floor's own triangles do not shade a floor point (bias off the surface). */
const floorOnly=buildGrid(soup(quad([0,0,0],[25,0,0],[0,0,25])),null);
if(vis(floorOnly,[3,0,3],[0,1,0])!==1)bad.push('a floor shades itself');
/* A thin 0.3 m post 3 m away barely matters. */
const post=buildGrid(soup(quad([3,2,0],[0,0,.15],[0,2,0])),null),vp=vis(post,[0,0,0],[0,1,0]);
if(!(vp>.9))bad.push(`beside a post visibility ${vp.toFixed(3)}, want > .9`);
/* Far occluders are ignored past FAR. */
const far=buildGrid(soup(quad([0,SKYOCC.FAR+5,0],[200,0,0],[0,0,200])),null);
if(vis(far,[0,0,0],[0,1,0])!==1)bad.push('a slab beyond FAR still shades');

/* Grid cell size is a speed-up only. */
const big=buildGrid(soup(quad([0,0,0],[25,0,0],[0,0,25]),quad([0,25,-.5],[25,0,0],[0,25,0])),null,50);
if(vis(big,[0,0,0],[0,1,0])!==vc)bad.push('cell size changes the corner result');

/* Determinism: a row of points along the corner, twice, byte for byte. */
const P=[],N=[];for(let i=0;i<20;i++){P.push(i*.5-5,0,i*.1);N.push(0,1,0)}
const a=skyVisibility(new Float32Array(P),new Float32Array(N),corner),b=skyVisibility(new Float32Array(P),new Float32Array(N),corner);
if(Buffer.compare(Buffer.from(a.buffer),Buffer.from(b.buffer)))bad.push('two runs differ');
for(let i=1;i<20;i++)if(a[i]+.08<a[i-1])bad.push(`visibility drops moving away from the wall at ${i}`);

for(const v of [-1,0,.3,1,2]){const s=occShade(v);if(!(s>=SKYOCC.MIN-1e-9&&s<=1+1e-9))bad.push(`occShade(${v}) = ${s} out of [MIN, 1]`)}
if(occShade(1)!==1||occShade(0)!==SKYOCC.MIN)bad.push('occShade ends are not 1 and MIN');

if(bad.length){console.error('skyocc.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log(`skyocc.check ok (roof ${vr.toFixed(2)}, corner ${vc.toFixed(2)}, post ${vp.toFixed(2)})`);
