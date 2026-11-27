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
const {headOf,headOfPlayer,gearOf,toneStepOf,TONE_STEPS,HEAD_SHAPES,HAIR_TONES,lookIsDefault,PLAIN_MAP_K}=M, HS=HEAD_SHAPES.length, SK=3;
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
/* #541 part 2: the whole look incl. his build (body blend weights as game.js qBody rounds them, height in cm) is unique per team, and each team shows real build spread */
const qBody=b=>{const o={};for(const k in b||{}){const v=Math.round(b[k]*4)/4;if(v)o[k]=v}return JSON.stringify(o)};
const full=p=>look(p).join()+'|'+qBody(p.body)+'|'+Math.round((p.ht||0)*100);
const HT_SPREAD_MIN=.08;   /* m: tallest minus shortest of a team, a floor from today's data (1.74-1.93 m), not a target */
for(const R of ROSTERS){const rows=[...(R.bat||[]),...(R.pit||[])].filter(p=>p&&p.id!=null),ks=new Set(rows.map(full));
  if(ks.size!==rows.length)bad.push(`${R.id||R.name||'team'}: ${rows.length-ks.size} players share the whole look incl. build`);
  const hs=rows.map(p=>p.ht||0),sp=Math.max(...hs)-Math.min(...hs);if(!(sp>=HT_SPREAD_MIN))bad.push(`${R.id||R.name||'team'}: height spread ${sp.toFixed(2)} m < ${HT_SPREAD_MIN}`)}
/* #541 part 4: a created player who tapped no chip (look {0,0,0}) gets the look hashed from his id, never one shared face; a tapped chip still wins */
const created=n=>({id:'fa-'+(1000+n*7919).toString(36),look:{head:0,skin:0,hair:0}});
const six=[...Array(6)].map((_,i)=>created(i)),sixLooks=six.map(look);
if(new Set(sixLooks.map(l=>l.join())).size!==6)bad.push('6 created players with no chip tapped are not all different: '+sixLooks.map(l=>l.join('/')).join(' '));
for(const p of six)if(headOfPlayer(p)!==headOf(p.id))bad.push(p.id+': default look is not the id-derived head index');
if(!lookIsDefault({head:0,skin:0,hair:0})||lookIsDefault({head:0,skin:0,hair:1})||lookIsDefault({head:2,skin:0,hair:0}))bad.push('lookIsDefault wrong');
const picked={id:six[0].id,look:{head:3,skin:0,hair:4}},ph=headOfPlayer(picked);
if(ph%HS!==3||gearOf(ph).hair!==4)bad.push('a tapped chip must still set head and hair');
const heads=new Set(),hairs=new Set(),maps=new Set();for(let i=0;i<300;i++){const h=headOfPlayer(created(i));heads.add(h%HS);hairs.add(gearOf(h).hair);maps.add(Math.floor(h/HS)%SK)}
if(heads.size!==HS||hairs.size!==HAIR_TONES.length||maps.size!==SK)bad.push(`300 created ids use ${heads.size}/${HS} heads, ${hairs.size}/${HAIR_TONES.length} hairs, ${maps.size}/${SK} skin maps`);
if(!(PLAIN_MAP_K.dark<PLAIN_MAP_K.old&&PLAIN_MAP_K.old<=PLAIN_MAP_K.light))bad.push('plain skin factors must run dark < old <= light');
if(process.argv.includes('--table')){const R=ROSTERS[0];for(const p of (R.bat||[]).slice(0,9)){const h=headOfPlayer(p);console.log([p.id,p.name,'head '+h%HS,'skin '+Math.floor(h/HS)%SK,'hair '+gearOf(h).hair,'tone '+toneStepOf(h),'build '+qBody(p.body),'ht '+p.ht].join(' | '))}}
if(bad.length){console.error('FAIL look_unique:\n - '+[...new Set(bad)].slice(0,15).join('\n - '));process.exit(1)}
console.log(`look_unique ok: ${n} players in ${ROSTERS.length} teams, no two of a team share head, skin, hair and tone; ${steps.size} tone steps used`);
