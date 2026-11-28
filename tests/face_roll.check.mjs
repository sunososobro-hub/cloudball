/* #585: every face is dice-rolled from the id alone: pure, spread, no user input, and within one team no two faces share a roll. Same loader as look_unique.check.mjs. */
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
const dir=mkdtempSync(path.join(tmpdir(),'faceroll-')),file=path.join(dir,'players_stub.mjs');
let M; try{writeFileSync(file,src);M=await import(pathToFileURL(file).href)}finally{rmSync(dir,{recursive:true,force:true})}
const {headOf,headOfPlayer,faceRollOf,faceParamsOf,FACE_ROLL_AMP,FACE_ROLLS,HEAD_SHAPES,gearOf,toneStepOf}=M,HS=HEAD_SHAPES.length,SK=3;
const {ROSTERS}=await import(pathToFileURL(path.join(ROOT,'league/players.js')).href);
const keys=Object.keys(FACE_ROLL_AMP);
let n=0;const seenRolls=new Set(),sums={},mins={},maxs={};keys.forEach(k=>{sums[k]=0;mins[k]=9;maxs[k]=-9});
for(const R of ROSTERS){const rows=[...(R.bat||[]),...(R.pit||[])].filter(p=>p&&p.id!=null),seen=new Map();
  for(const p of rows){n++;const h=headOfPlayer(p),r=faceRollOf(h);
    if(faceRollOf(headOfPlayer(p))!==r)bad.push(p.id+': roll not stable');
    /* the roll reads the id-derived head index only: a roster row with a `look` of chips is a created player whose chips already come from the head index */
    if(faceRollOf(headOf(p.id))!==faceRollOf(headOfPlayer({id:p.id})))bad.push(p.id+': roll depends on more than the id');
    if(!(r>=0&&r<FACE_ROLLS))bad.push(p.id+': roll out of range');
    if(seen.has(r))bad.push(`${R.id||R.name||'team'}: ${p.id} and ${seen.get(r)} share face roll ${r}`);else seen.set(r,p.id);
    seenRolls.add(r);const P=faceParamsOf(r);
    for(const k of keys){if(Math.abs(P[k])>FACE_ROLL_AMP[k]+1e-12)bad.push(p.id+': '+k+' beyond its amplitude');sums[k]+=P[k];mins[k]=Math.min(mins[k],P[k]);maxs[k]=Math.max(maxs[k],P[k])}}}
if(seenRolls.size<n*.95)bad.push(`only ${seenRolls.size} distinct rolls for ${n} players`);
for(const k of keys){if(maxs[k]-mins[k]<FACE_ROLL_AMP[k]*1.2)bad.push(k+' barely varies across the league ('+(maxs[k]-mins[k]).toFixed(4)+')');if(Math.abs(sums[k]/n)>FACE_ROLL_AMP[k]*.2)bad.push(k+' rolls are biased')}
const z=faceParamsOf(0);for(const k of keys)if(z[k]!==0)bad.push('roll 0 must change nothing ('+k+')');
if(process.argv.includes('--table')){const R=ROSTERS[0];for(const p of (R.bat||[]).slice(0,9)){const h=headOfPlayer(p),P=faceParamsOf(faceRollOf(h));console.log([p.id,'shape '+h%HS,'skin '+Math.floor(h/HS)%SK,'hair '+gearOf(h).hair,'tone '+toneStepOf(h),'roll '+faceRollOf(h),...keys.map(k=>k+' '+P[k].toFixed(3))].join(' | '))}}
if(bad.length){console.error('FAIL face_roll:\n - '+[...new Set(bad)].slice(0,15).join('\n - '));process.exit(1)}
console.log('face_roll ok: '+n+' players, '+seenRolls.size+' rolls');
