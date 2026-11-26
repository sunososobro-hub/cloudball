/* #211 item 5: frameWindow gives avg / worst / p95 once per window and restarts. Runs the module, no source grep except the wiring line. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {frameWindow} from '../render/frametime.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const w=frameWindow(100);let out=null;
for(let i=0;i<99;i++)if(w.push(10)!==null)bad.push('window closed early');
out=w.push(60);
if(!out)bad.push('no result at frame 100');
else{if(out.worst!==60)bad.push('worst '+out.worst);if(out.avg!==10.5)bad.push('avg '+out.avg);if(out.p95!==10)bad.push('p95 '+out.p95)}
for(let i=0;i<99;i++)w.push(16.7);
const o2=w.push(16.7);if(!o2||o2.avg!==16.7||o2.worst!==16.7)bad.push('second window did not restart: '+JSON.stringify(o2));
const w2=frameWindow(4);w2.push(1);w2.reset();w2.push(1);w2.push(1);w2.push(1);if(w2.push(1)===null)bad.push('reset: 4 frames after reset should close')
else{}
const g=readFileSync(path.join(ROOT,'render/game.js'),'utf8');if(!/frameWindow/.test(g)||!/B\.t\.ftw/.test(g))bad.push('game.js does not feed the 🐞 boot= field');
if(bad.length){console.error('frametime.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('frametime.check ok');
