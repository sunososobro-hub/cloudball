/* #214 item 2 part 2: render/skyocc_stands.js core (bakeShade), plain Node, real module. A stand-like scene: seat rows in front of a
 * back wall, a roof slab over the rows. Rows under the roof are darker than the same rows without it; a row at the foot of the back
 * wall is darker than a row at the front; every shade stays in [MIN, 1]; two runs match byte for byte. */
import {bakeShade,SKYSTAND} from '../render/skyocc_stands.js';
import {SKYOCC} from '../render/skyocc.js';
const bad=[];
const quad=(c,u,v)=>{const p=(s,t)=>[0,1,2].map(k=>c[k]+s*u[k]+t*v[k]),A=p(-1,-1),B=p(1,-1),C=p(1,1),D=p(-1,1);return[...A,...B,...C,...A,...C,...D]};
const soup=(...q)=>({pos:new Float32Array(q.flat()),idx:null});
const wall=soup(quad([0,5,10],[10,0,0],[0,5,0]));          /* back wall at z = 10, 10 m high, faces -z */
const roof=soup(quad([0,9,5],[10,0,0],[0,0,6]));           /* roof slab y = 9 over z -1 .. 11 */
const row=z=>({pos:new Float32Array([0,2,z]),nor:new Float32Array([0,1,0])});
const rows=[row(0),row(4),row(9.5)];
const open=bakeShade(rows,[wall]).map(c=>c[0]),roofed=bakeShade(rows,[wall,roof]).map(c=>c[0]);
for(let i=0;i<rows.length;i++)if(!(roofed[i]<open[i]-.05))bad.push(`row ${i}: roof does not darken it (${roofed[i].toFixed(2)} vs ${open[i].toFixed(2)})`);
if(!(open[2]<open[0]-.05))bad.push(`row at the back wall (${open[2].toFixed(2)}) is not darker than the front row (${open[0].toFixed(2)})`);
for(const c of [...open,...roofed])if(!(c>=SKYOCC.MIN-1e-6&&c<=1+1e-6))bad.push(`shade ${c} out of [MIN, 1]`);
const a=bakeShade(rows,[wall,roof]),b=bakeShade(rows,[wall,roof]);
if(a.some((c,i)=>Buffer.compare(Buffer.from(c.buffer),Buffer.from(b[i].buffer))))bad.push('two runs differ');
if(a[0].length!==3||a[0][0]!==a[0][1]||a[0][1]!==a[0][2])bad.push('colour is not grey rgb per vertex');
/* indexed occluders give the same answer as the soup */
const idx={pos:new Float32Array([-10,0,10, 10,0,10, 10,10,10, -10,10,10]),idx:new Uint16Array([0,1,2,0,2,3])},sw=bakeShade(rows,[idx]).map(c=>c[0]),sw2=bakeShade(rows,[wall]).map(c=>c[0]);
if(sw.some((v,i)=>Math.abs(v-sw2[i])>1e-6))bad.push('indexed wall differs from the same wall as a soup');
if(bakeShade(rows,[]).some(c=>c[0]!==1))bad.push('no occluder must leave full light');
if(!SKYSTAND.RECEIVERS.includes('old:seats')||!SKYSTAND.OCCLUDERS.includes('old:roof'))bad.push('SKYSTAND names changed');
if(bad.length){console.error('skyocc_stands.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log(`skyocc_stands.check ok (front ${open[0].toFixed(2)}, back ${open[2].toFixed(2)}, roofed ${roofed[0].toFixed(2)})`);
