/* #732 part 2: catcher's interference reach (render/cireach.js). Plain Node, runs the module and the engine.
 * Checks: only a `ci` pitch reaches; the mitt is fully forward at the swing (ARRIVE) and back to rest before the pitch after;
 * toward the batter's side (right-handed -x, left-handed +x); never jumps between frames .05 s apart; seeds 1-GAMES: every
 * `catcher_interference` plate appearance has a swing frame, so the bat has something to meet; game.js wires it in.
 * static.mjs runs this file. Usage: node tests/cireach.check.mjs */
import {readFileSync} from 'node:fs';
import {fileURLToPath, pathToFileURL} from 'node:url';
import path from 'node:path';
import {ciReach, CI_REACH} from '../render/cireach.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[],T={ARRIVE:2.05};
const ci={k:'P',r:'ci',swing:true};
if(ciReach({k:'P',r:'cstr'},T.ARRIVE,T,false).w!==0)bad.push('reach on a non-ci pitch');
if(ciReach(null,1,T,false).w!==0)bad.push('reach without an event');
if(ciReach(ci,0,T,false).w!==0||ciReach(ci,T.ARRIVE+CI_REACH.HOLD+CI_REACH.OUT+.01,T,false).w!==0)bad.push('weight not 0 before / after');
const at=ciReach(ci,T.ARRIVE,T,false);
if(at.w<.999||Math.abs(at.dz+CI_REACH.FWD)>1e-9)bad.push('mitt not fully forward at the swing');
if(!(at.dx<0))bad.push('right-handed batter: mitt not toward -x');
if(!(ciReach(ci,T.ARRIVE,T,true).dx>0))bad.push('left-handed batter: mitt not toward +x');
let prev=ciReach(ci,0,T,false),max=0;
for(let u=.05;u<=4;u+=.05){const q=ciReach(ci,u,T,false);max=Math.max(max,Math.abs(q.dz-prev.dz)/.05,Math.abs(q.dx-prev.dx)/.05);prev=q}
if(max>4)bad.push('mitt jumps: '+max.toFixed(2)+' m/s');
const K=await import(pathToFileURL(path.join(ROOT,'engine/index.js'))),GAMES=1500;let n=0;
for(let s=1;s<=GAMES;s++){const S=K.simGame(s,{},{teams:[s%4,(s+1)%4]}).stream;
  for(const end of S.filter(x=>x.type==='pa_end'&&x.result==='catcher_interference')){n++;if(!S.some(x=>x.f===end.f&&x.type==='swing'))bad.push(`seed ${s} frame ${end.f}: no swing`)}}
if(!n)bad.push('no catcher_interference in seeds 1-'+GAMES);
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
if(!/cireach\.js/.test(game)||!/ciReach\(/.test(game))bad.push('game.js does not load / call cireach.js');
if(bad.length){console.error('cireach.check FAIL\n  '+bad.join('\n  '));process.exit(1)}
console.log(`cireach.check ok (${n} ci in ${GAMES} games, max mitt speed ${max.toFixed(2)} m/s)`);
