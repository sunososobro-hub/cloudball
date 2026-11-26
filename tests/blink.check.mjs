/* #207 round 3: blink is a pure function of (time, phase): closed at the start of each period, open after BLINK.dur, same value on every call
 * (a jump equals playing there), phases spread the blinks, and game.js feeds the eye clock. Plain Node: three is stubbed like players_load.check.mjs. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const stub=()=>{const f=function(){};const p=new Proxy(f,{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:p,apply:()=>p,construct:()=>p,set:()=>true});return p};
globalThis.__THREE_STUB=stub();
let src=readFileSync(path.join(ROOT,'render/players.js'),'utf8');
src=src.replace(/^import \* as THREE from 'three\/webgpu';.*$/m,'const THREE=globalThis.__THREE_STUB;')
  .replace(/from '\.\.\/league\/players\.js'/,`from '${pathToFileURL(path.join(ROOT,'league/players.js')).href}'`);
const dir=mkdtempSync(path.join(tmpdir(),'blink-')),file=path.join(dir,'players_stub.mjs');
let M;
try{writeFileSync(file,src);M=await import(pathToFileURL(file).href)}
catch(e){bad.push(`render/players.js throws at load: ${e&&e.message}`)}
finally{rmSync(dir,{recursive:true,force:true})}
if(M){
  const {BLINK,blinkAmt}=M,P=BLINK.period,D=BLINK.dur;
  if(blinkAmt(0,0)!==0)bad.push('lids are not open at the start of the blink (triangle must start at 0)');
  if(Math.abs(blinkAmt(D/2,0)-1)>1e-9)bad.push(`blink peak is ${blinkAmt(D/2,0)}, want 1`);
  if(blinkAmt(D*1.01,0)!==0||blinkAmt(P/2,0)!==0)bad.push('eyes are not open between blinks');
  for(let t=0;t<30;t+=.013)for(let ph=0;ph<BLINK.phases;ph++){const a=blinkAmt(t,ph);if(!(a>=0&&a<=1))bad.push(`blinkAmt(${t},${ph})=${a} outside 0..1`);if(a!==blinkAmt(t,ph))bad.push('blinkAmt is not pure')}
  if(Math.abs(blinkAmt(1.234,3)-blinkAmt(1.234+P,3))>1e-9)bad.push('blink does not repeat every period');
  let closed=0;for(let t=0;t<P;t+=.01)closed+=blinkAmt(t,0)>.5?1:0;if(closed*.01>D)bad.push('lids stay closed longer than BLINK.dur');
  const seen=new Set();for(let ph=0;ph<BLINK.phases;ph++){let best=0,bt=0;for(let t=0;t<P;t+=.01){const a=blinkAmt(t,ph);if(a>best){best=a;bt=t}}seen.add(bt.toFixed(1))}
  if(seen.size<BLINK.phases-1)bad.push(`phases do not spread the blinks (${seen.size} distinct peaks of ${BLINK.phases})`);
  if(typeof M.setEyeClock!=='function')bad.push('setEyeClock is not exported');
}
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
if(!/gfxMax&&window\.PL&&PL\.setEyeClock\)PL\.setEyeClock\(curT\(\)\)/.test(game))bad.push('game.js does not feed PL.setEyeClock(curT()) on max');
if(bad.length){console.error('FAIL blink:\n - '+bad.join('\n - '));process.exit(1)}
console.log('blink ok: pure, periodic, phases spread; game.js feeds the eye clock');
