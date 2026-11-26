/* #150 part 6: the cheap batter's eye of the non-max tiers. Plain Node: render/batterseye_lite.js is pure data, game.js builds one 'old:batterseye' mesh.
 * Checks: same arc as props/batterseye.js EYE (read from its source), centred on CF (-z), one mesh in game.js, props/batterseye.js hides it on max,
 * and the screen stands behind the CF fans' cleared block. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {liteEye,LITE} from '../render/batterseye_lite.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const src=readFileSync(path.join(ROOT,'render/props/batterseye.js'),'utf8'),game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=src.match(new RegExp('export const EYE=\\{[\\s\\S]*?\\b'+k+':([0-9.]+)'));return m?+m[1]:NaN};
for(const k of ['R','HALF','TOP'])if(num(k)!==LITE[k])bad.push(`LITE.${k}=${LITE[k]} but props/batterseye.js EYE.${k}=${num(k)}`);
const e=liteEye(),mid=e.thetaStart+e.thetaLength/2;
if(Math.abs(mid-Math.PI)>1e-9)bad.push(`screen centre theta ${mid}, want PI (centre field is -z)`);
if(Math.abs(e.thetaLength-2*LITE.HALF*Math.PI/180)>1e-9)bad.push('screen width is not 2 x HALF degrees');
const EYE_CLEAR=+(game.match(/const EYE_CLEAR_DEG=([0-9.]+)/)||[])[1];
if(!(EYE_CLEAR<=LITE.HALF))bad.push(`cleared fan block ${EYE_CLEAR} deg is wider than the screen ${LITE.HALF}`);
if((game.match(/\.name='old:batterseye'/g)||[]).length!==1||!/liteEye/.test(game))bad.push('game.js must build exactly one old:batterseye mesh from liteEye');
if(!/old:\s*c=>c\.old\('batterseye'\)/.test(src))bad.push('props/batterseye.js does not hide old:batterseye on max');
if(bad.length){console.error('batterseye_lite.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('batterseye_lite.check ok (1 screen, same arc as the max eye)');
