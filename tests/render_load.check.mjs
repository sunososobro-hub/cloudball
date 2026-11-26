/* #293 (per-PR layer): every DOM-free render/*.js module must load without throwing (#290 / #292: a module that throws at load
 * passed every other check and blanked the page). Plain Node: each module is imported for real, no stub. Modules that need three.js
 * or the DOM at load are not listed here (render/players.js is covered by tests/players_load.check.mjs with a stubbed three import).
 * A module on the list that gains a 'three' import or a bare DOM use fails the check, so the list cannot go stale silently. */
import {readFileSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const MODULES=['compact','highlights','barcurve','dugout_lite','ondeck_lite','visit','lead','batdrop','batboy','skyocc','skyocc_stands','lineup'];
for(const m of MODULES){
  const file=path.join(ROOT,'render',m+'.js');
  let src;
  try{src=readFileSync(file,'utf8')}catch(e){bad.push(`render/${m}.js is listed but missing`);continue}
  if(/^import[^;\n]*from\s*['"]three/m.test(src))bad.push(`render/${m}.js imports three.js: move it out of MODULES in tests/render_load.check.mjs`);
  try{
    const ns=await import(pathToFileURL(file).href);
    if(!ns||!Object.keys(ns).length)bad.push(`render/${m}.js loads but exports nothing`);
  }catch(e){bad.push(`render/${m}.js throws at load: ${e&&e.name}: ${e&&e.message}`)}
}
if(bad.length){console.error('FAIL render_load:\n - '+bad.join('\n - '));process.exit(1)}
console.log(`render_load ok: ${MODULES.length} render modules load`);
