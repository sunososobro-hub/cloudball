/* #211: the tight key-shadow frustum of max (render/keyfit.js, plain Node). Checks: a long lens on the batter gets the smallest box, a wide
 * shot keeps the whole park, the box grows with the field of view and with distance, never leaves [MIN_HALF, MAX_HALF], is a whole number of
 * STEPs, the same camera gives the same answer (pure), snapping moves the centre by less than one texel onto the texel grid, and game.js
 * only fits while max is on and restores the default box off max. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {fitKey,snapKey,KEYFIT} from '../render/keyfit.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[],K=KEYFIT;
const shot=(p,t,fov)=>fitKey(...p,...t,fov,16/9);
const tight=shot([0,2,28],[0,1.3,0],2.4),broad=shot([0,12,40],[0,0,-30],40),wide=shot([0,30,80],[0,0,-40],70),mid=shot([0,2,28],[0,1.3,0],12);
if(tight.half!==K.MIN_HALF)bad.push(`tight shot half ${tight.half}, want the minimum ${K.MIN_HALF}`);
if(wide.half!==K.MAX_HALF)bad.push(`wide shot half ${wide.half}, want the whole park ${K.MAX_HALF}`);
if(!(mid.half>=tight.half&&broad.half>=mid.half&&wide.half>=broad.half))bad.push(`box does not grow with the view: ${tight.half} ${mid.half} ${broad.half} ${wide.half}`);
if(Math.abs(tight.x)>.5||Math.abs(tight.z)>.5)bad.push(`tight shot centre ${tight.x},${tight.z}, want the batter (0,0)`);
for(const s of [tight,broad,wide,mid]){if(s.half<K.MIN_HALF||s.half>K.MAX_HALF||(s.half%K.STEP&&s.half!==K.MAX_HALF))bad.push(`half ${s.half} outside [${K.MIN_HALF},${K.MAX_HALF}] or not a multiple of ${K.STEP}`)}
const a=fitKey(1,5,30,0,1,-40,20,1.7),b=fitKey(1,5,30,0,1,-40,20,1.7);if(JSON.stringify(a)!==JSON.stringify(b))bad.push('fitKey is not a pure function of the camera');
const level=fitKey(0,3,0,0,3,-60,30,1.7),same=fitKey(0,3,0,0,3,0,30,1.7);if(!isFinite(level.x+level.z+same.half)||level.half>K.MAX_HALF||same.half<K.MIN_HALF)bad.push('a level view or an aim at the camera gave a bad box');
for(const [x,z] of [[3.3,-7.1],[-12.9,40.2],[0,0]]){const half=14,map=4096,tx=2*half/map,s=snapKey(x,z,half,map),
  [ox,oy,oz]=K.OFFSET,L=Math.hypot(ox,oy,oz),lx=ox/L,lz=oz/L;let rx=lz,rz=-lx;const R=Math.hypot(rx,rz);rx/=R;rz/=R;
  const q=(s.x*rx+s.z*rz)/tx;if(Math.abs(q-Math.round(q))>1e-6)bad.push(`snap ${x},${z}: right axis not on the texel grid (${q})`);
  if(Math.hypot(s.x-x,s.z-z)>tx*1.5||Math.abs(s.y)>tx)bad.push(`snap ${x},${z} moved the centre by more than a texel`)}
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
if(!/function updateKeyFit\(/.test(game)||!/updateKeyFit\(\)/.test(game))bad.push('game.js does not call updateKeyFit');
if(!/function updateKeyFit\(\)\{if\(!gfxMax/.test(game))bad.push('updateKeyFit must do nothing (and restore the default box) unless gfxMax');
if(bad.length){console.error('keyfit.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log('keyfit.check ok (tight '+tight.half+' m, broadcast '+broad.half+' m, wide '+wide.half+' m)');
