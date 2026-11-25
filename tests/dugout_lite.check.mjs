/* #313: the cheap dugout of the non-max tiers. Plain Node: render/dugout_lite.js is pure data, game.js builds one 'old:dugout' mesh per part.
 * Checks: 4 parts per dugout, same footprint as the polished props/dugout.js (DUG read from its source), both sides, roof on top, no part outside the footprint. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {liteDugout,LITE} from '../render/dugout_lite.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const src=readFileSync(path.join(ROOT,'render/props/dugout.js'),'utf8'),game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=src.match(new RegExp('export const DUG=\\{[^}]*\\b'+k+':([0-9.]+)'));return m?+m[1]:NaN};
for(const k of ['L','D','H'])if(num(k)!==LITE[k])bad.push(`LITE.${k}=${LITE[k]} but props/dugout.js DUG.${k}=${num(k)}`);
for(const x of [-26,26]){const d=liteDugout(x,-6),n=d.parts.length;
  if(n!==4)bad.push(`x=${x}: ${n} parts, want 4`);
  if(d.rotY!==Math.sign(x)*Math.PI/4)bad.push(`x=${x}: rotY ${d.rotY}`);
  const roof=d.parts.find(p=>p.name==='roof');if(!roof||Math.abs(roof.y-(LITE.H+LITE.ROOF_T/2))>1e-9)bad.push(`x=${x}: roof not on top of the walls`);
  for(const p of d.parts){if(!(p.w>0&&p.h>0&&p.d>0))bad.push(`x=${x} ${p.name}: empty box`);
    if(p.name!=='roof'&&(Math.abs(p.x)+p.w/2>LITE.L/2+1e-9||p.z-p.d/2<-1e-9||p.z+p.d/2>LITE.D+1e-9))bad.push(`x=${x} ${p.name}: outside the dugout footprint`)}}
if(!/old:dugout/.test(game)||!/liteDugout/.test(game))bad.push('game.js does not build the lite dugouts');
if(!/old:\s*c=>c\.old\('dugout'\)/.test(readFileSync(path.join(ROOT,'render/props/dugout.js'),'utf8')))bad.push('props/dugout.js does not hide old:dugout on max');
if(bad.length){console.error('dugout_lite.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('dugout_lite.check ok (2 dugouts x 4 parts)');
