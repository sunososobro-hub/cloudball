/* #541: every player of a team reads as a different man: (head shape, skin map, hair colour, tone step) never repeats inside a team. Same loader as look_map.check.mjs. */
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
const {headOf,headOfPlayer,gearOf,toneStepOf,TONE_STEPS,HEAD_SHAPES,HAIR_TONES}=M, HS=HEAD_SHAPES.length, SK=3;
const {ROSTERS}=await import(pathToFileURL(path.join(ROOT,'league/players.js')).href);
/* #541: per team, no two players share all of (head shape, skin map, hair colour, tone step); the tone step is stable and uses every step across the league */
const look=p=>{const h=headOfPlayer(p);return [h%HS,Math.floor(h/HS)%SK,gearOf(h).hair,toneStepOf(h)]};
let n=0,dup=0;const steps=new Set(),per=[];
for(const R of ROSTERS){const rows=[...(R.bat||[]),...(R.pit||[])].filter(p=>p&&p.id!=null),seen=new Map();
  for(const p of rows){n++;const l=look(p),k=l.join();steps.add(l[3]);
    if(JSON.stringify(look(p))!==JSON.stringify(l))bad.push(p.id+': look not stable');
    if(seen.has(k)){dup++;bad.push(`${R.id||R.name||'team'}: ${p.id} and ${seen.get(k)} share (head,skin,hair,tone) ${k}`)}else seen.set(k,p.id)}
  per.push(seen.size)}
/* #541 part 2: build is already per player from data (body mix + ht in league/players.js, drawn by dress() in render/game.js); pin it: every player has both, and a team shows at least MIN_BUILDS distinct (body, ht) pairs */
const MIN_BUILDS=12;
for(const R of ROSTERS){const rows=[...(R.bat||[]),...(R.pit||[])].filter(p=>p&&p.id!=null),b=new Set();
  for(const p of rows){if(!p.body||!p.ht)bad.push(p.id+': no body or ht');b.add(JSON.stringify(p.body)+'|'+p.ht)}
  if(b.size<MIN_BUILDS)bad.push(`${R.id||R.name||'team'}: only ${b.size} distinct builds (need ${MIN_BUILDS})`)}
if(steps.size!==TONE_STEPS.length)bad.push(`tone steps used ${steps.size} of ${TONE_STEPS.length}`);
for(let i=0;i<50;i++)if(toneStepOf(i*7919)!==toneStepOf(i*7919))bad.push('toneStepOf not pure');
if(bad.length){console.error('FAIL look_unique:\n - '+[...new Set(bad)].slice(0,15).join('\n - '));process.exit(1)}
console.log(`look_unique ok: ${n} players in ${ROSTERS.length} teams, no two of a team share head, skin, hair and tone; ${steps.size} tone steps used`);
