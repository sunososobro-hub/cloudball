/* #559: hair styles under the cap: a set of >= 4 code-generated styles, every player gets one from his id-derived head index, stable, and a team shows several. Same loader as look_unique.check.mjs. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const stub=()=>{const f=function(){};const p=new Proxy(f,{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:p,apply:()=>p,construct:()=>p,set:()=>true});return p};
globalThis.__THREE_STUB=stub();
const src=readFileSync(path.join(ROOT,'render/players.js'),'utf8')
  .replace(/^import \* as THREE from 'three\/webgpu';.*$/m,'const THREE=globalThis.__THREE_STUB;')
  .replace(/from '\.\.\/league\/players\.js'/,`from '${pathToFileURL(path.join(ROOT,'league/players.js')).href}'`);
const dir=mkdtempSync(path.join(tmpdir(),'hairstyle-')),file=path.join(dir,'players_stub.mjs');
let M; try{writeFileSync(file,src);M=await import(pathToFileURL(file).href)}finally{rmSync(dir,{recursive:true,force:true})}
const {hairParts,headOf,headOfPlayer,gearOf,hairStyleOf,HAIR_STYLES,HAIR_TONES,HEAD_SHAPES}=M, HS=HEAD_SHAPES.length;
const {ROSTERS}=await import(pathToFileURL(path.join(ROOT,'league/players.js')).href);
if(HAIR_STYLES.length<4)bad.push('only '+HAIR_STYLES.length+' hair styles (need >= 4)');
const share=HAIR_STYLES.reduce((n,s)=>n+s.share,0);if(Math.abs(share-1)>1e-9)bad.push('style shares sum to '+share);
const names=new Set(HAIR_STYLES.map(s=>s.name));if(names.size!==HAIR_STYLES.length)bad.push('style names repeat');
const used=new Set();let n=0;
for(const R of ROSTERS){const rows=[...(R.bat||[]),...(R.pit||[])].filter(p=>p&&p.id!=null),per=new Set();
  for(const p of rows){n++;const h=headOfPlayer(p),st=hairStyleOf(h);
    if(!Number.isInteger(st)||st<0||st>=HAIR_STYLES.length)bad.push(p.id+': no hair style ('+st+')');
    if(hairStyleOf(headOfPlayer(p))!==st)bad.push(p.id+': style not stable');
    per.add(st);used.add(st)}
  if(per.size<4)bad.push(`${R.id||R.name||'team'}: only ${per.size} styles on the roster (need >= 4)`)}
if(used.size!==HAIR_STYLES.length)bad.push(`styles used ${used.size} of ${HAIR_STYLES.length}`);
/* the new digit leaves the old ones alone: head shape, skin, gear and hair colour still decode in range */
for(let i=0;i<300;i++){const h=headOf('p'+i),g=gearOf(h);if(g.hair<0||g.hair>=HAIR_TONES.length||g.leg<0||g.leg>2)bad.push('p'+i+': gear digit out of range');if(h<0||h>2**31)bad.push('p'+i+': head index overflow')}
/* a created player's look.hair (colour) must not change his style */
const q={id:'x1'},q2={id:'x1',look:{hair:2}};if(hairStyleOf(headOfPlayer(q))!==hairStyleOf(headOfPlayer(q2)))bad.push('look.hair changed the style');
/* Part 3: parts sit on the head in neck-local coordinates (model - J.neck), like the cap. A synthetic head: neck at y 1.5, eyes 1.62, box 0.15 x 0.2. */
{const A={J:{neck:[0,1.5,.01],eyeL:[.03,1.62,.1]},head:{x0:-.075,x1:.075,z0:-.09,z1:.11,top:1.73}};
 for(let st=0;st<HAIR_STYLES.length;st++){const P=hairParts(A,st),S=HAIR_STYLES[st];
  if(!S.depth&&!S.side){if(P.length)bad.push(S.name+': bald draws '+P.length+' parts');continue}
  if(!P.length)bad.push(S.name+': no parts');
  for(const q of P){const [x,y,z]=q.p;if(Math.abs(x)>.12||y<.0||y>.2||z<-.2||z>.12)bad.push(`${S.name}: part at ${q.p.map(v=>v.toFixed(3))} is off the head (neck-local)`)}}}
if(process.argv.includes('--table')){const R=ROSTERS[0];for(const p of (R.bat||[]).slice(0,9))console.log(p.id,p.name,HAIR_STYLES[hairStyleOf(headOfPlayer(p))].name)}
if(bad.length){console.error('FAIL hair_style:\n - '+[...new Set(bad)].slice(0,15).join('\n - '));process.exit(1)}
console.log(`hair_style ok: ${HAIR_STYLES.length} styles, ${n} players each with one, every team shows >= 4`);
