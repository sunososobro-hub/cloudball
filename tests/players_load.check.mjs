/* #292: render/players.js must load without throwing (a load-time throw leaves window.PL null and, before the guard, blanked every frame).
 * Plain Node, no three.js installed: the 'three/webgpu' import is replaced by a stub that answers every property and call, so only the
 * module's own load-time code runs (a const read before its declaration is a ReferenceError there, exactly as in the browser).
 * Also checks the render/game.js guards: headIx and kitOf must not touch PL when it is null. */
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const stub=()=>{const f=function(){};const p=new Proxy(f,{get:(t,k)=>k===Symbol.toPrimitive?()=>0:k==='then'?undefined:p,apply:()=>p,construct:()=>p,set:()=>true});return p};
globalThis.__THREE_STUB=stub();
let src=readFileSync(path.join(ROOT,'render/players.js'),'utf8');
const n0=src.length;
src=src.replace(/^import \* as THREE from 'three\/webgpu';.*$/m,'const THREE=globalThis.__THREE_STUB;')
  .replace(/from '\.\.\/league\/players\.js'/,`from '${pathToFileURL(path.join(ROOT,'league/players.js')).href}'`);
if(src.length===n0||!src.includes('__THREE_STUB'))bad.push('could not stub the three import of render/players.js (import line changed?)');
const dir=mkdtempSync(path.join(tmpdir(),'plload-')),file=path.join(dir,'players_stub.mjs');
try{writeFileSync(file,src);await import(pathToFileURL(file).href)}
catch(e){bad.push(`render/players.js throws at load: ${e&&e.name}: ${e&&e.message}`)}
finally{rmSync(dir,{recursive:true,force:true})}
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
if(!/const headIx=\w+=>OFF\.has\('faces'\)\|\|!window\.PL\?0:PL\.headOf\w*\(\w+\)/.test(game))bad.push('game.js headIx is not guarded on window.PL');
if(!/kitOf=m=>window\.PL&&PL\.makeKit&&/.test(game))bad.push('game.js kitOf is not guarded on window.PL');
if(bad.length){console.error('FAIL players_load:\n - '+bad.join('\n - '));process.exit(1)}
console.log('players_load ok: render/players.js loads; game.js guards PL');
