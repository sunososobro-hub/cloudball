/* #441 part 1: created players take head shape, skin map and hair colour from look; gear and facial hair stay hashed; factory rows unchanged.
 * Plain Node: render/players.js loads with the three.js import stubbed (same loader as players_load.check.mjs). */
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
const dir=mkdtempSync(path.join(tmpdir(),'lookmap-')),file=path.join(dir,'players_stub.mjs');
let M; try{writeFileSync(file,src);M=await import(pathToFileURL(file).href)}finally{rmSync(dir,{recursive:true,force:true})}
const {headOf,headOfPlayer,gearOf,HEAD_SHAPES,HAIR_TONES}=M, HS=HEAD_SHAPES.length, SK=3, FL=15;
const shapeOf=h=>h%HS, mapOf=h=>Math.floor(h/HS)%SK, faceOf=h=>Math.floor(h/(HS*SK))%FL;
let n=0;
for(let i=0;i<200;i++){
  const id='p'+i, h=headOf(id);
  if(headOfPlayer({id})!==h)bad.push(`${id}: a factory row (no look) changed`);
  if(headOfPlayer({id,look:{}})!==h)bad.push(`${id}: an empty look changed the head index`);
  if(headOfPlayer({id,look:{head:0,skin:0,hair:0}})!==h)bad.push(`${id}: an untouched look {0,0,0} must keep his id-derived head index (#541)`);
  for(const [head,skin,hair] of [[0,1,0],[HS-1,1,HAIR_TONES.length-1],[3,2,2],[HS+2,SK+1,HAIR_TONES.length+1]]){
    const g=headOfPlayer({id,look:{head,skin,hair}}), a=gearOf(h), b=gearOf(g); n++;
    if(shapeOf(g)!==head%HS)bad.push(`${id}: shape ${shapeOf(g)} for look.head ${head}`);
    if(mapOf(g)!==skin%SK)bad.push(`${id}: skin map ${mapOf(g)} for look.skin ${skin}`);
    if(b.hair!==hair%HAIR_TONES.length)bad.push(`${id}: hair ${b.hair} for look.hair ${hair}`);
    if(faceOf(g)!==faceOf(h))bad.push(`${id}: facial hair changed`);
    for(const k of ['wrist','elbow','eye','glove','leg'])if(a[k]!==b[k])bad.push(`${id}: gear ${k} changed by look`);
  }
}
/* two different values of each option give different head indexes */
for(const [k,max] of [['head',HS],['skin',SK],['hair',HAIR_TONES.length]]){
  const seen=new Set();for(let v=0;v<max;v++)seen.add(headOfPlayer({id:'x',look:{head:1,skin:1,hair:1,[k]:v}}));
  if(seen.size!==max)bad.push(`look.${k}: ${max} values give ${seen.size} head indexes`);
}
if(bad.length){console.error('FAIL look_map:\n - '+[...new Set(bad)].slice(0,15).join('\n - '));process.exit(1)}
console.log(`look_map ok: ${n} created looks map to shape, skin map and hair; gear, facial hair and factory rows unchanged`);
