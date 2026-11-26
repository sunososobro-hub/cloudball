/* #42: the second-base umpire inside turns to watch plays at first (render/u2watch.js). Plain Node, runs the module.
 * Checks: no turn without a play at first, before LEAD or after the envelope ends; fly calls and other bags are ignored; the weight
 * stays in 0..1 and peaks at 1 while U1 holds his call; from ST_U2_IN facing home, the full turn points him TURN of the way to 1B
 * and turns the short way; the yaw never jumps between frames .05 s apart; game.js wires it into poseStaff on the inside spot only. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {watchWeight,turnYaw,U2_WATCH} from '../render/u2watch.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=game.match(new RegExp('\\b'+k+'=([0-9.]+)'));return m?+m[1]:NaN};
const env={up:num('BC_UP'),hold:num('BC_HOLD'),down:num('BC_DOWN')};
if(!Object.values(env).every(Number.isFinite))bad.push('could not read BC_UP/BC_HOLD/BC_DOWN from game.js');
const inM=game.match(/ST_U2_IN=\[(-?[0-9.]+),(-?[0-9.]+)\]/),IN=inM?[+inM[1],+inM[2]]:null;if(!IN)bad.push('ST_U2_IN not found in game.js');
const B1=[27.432*Math.SQRT1_2,-27.432*Math.SQRT1_2];/* first base: 90 ft down the +x line, pitcher at -z */
const call={b:1,t:3,out:true},end=call.t+env.hold+env.down;
if(watchWeight([],1,3.5,env)!==0)bad.push('turns with no call');
if(watchWeight([call],1,call.t-U2_WATCH.LEAD-.01,env)!==0)bad.push('turns before LEAD');
if(watchWeight([call],1,end+.01,env)!==0)bad.push('still turned after the call ends');
if(watchWeight([{...call,at:[10,-60]}],1,3.5,env)!==0)bad.push('turns for a fly call');
if(watchWeight([{...call,b:2}],1,3.5,env)!==0)bad.push('turns for a play at second');
const peak=watchWeight([call],1,call.t+env.up+.1,env);if(Math.abs(peak-1)>1e-9)bad.push(`weight ${peak} while U1 holds, want 1`);
let prev=null,maxStep=0;
for(let u=call.t-1;u<=end+1;u+=.05){const w=watchWeight([call],1,u,env);if(w<0||w>1)bad.push(`weight ${w} at ${u.toFixed(2)}`);
  if(IN){const y=turnYaw(Math.atan2(-IN[0],-IN[1]),IN[0],IN[1],B1[0],B1[1],U2_WATCH.TURN*w);if(prev!==null)maxStep=Math.max(maxStep,Math.abs(y-prev));prev=y}}
if(maxStep>.25)bad.push(`yaw jumps ${maxStep.toFixed(3)} rad in .05 s`);
if(IN){const y0=Math.atan2(-IN[0],-IN[1]),y=turnYaw(y0,IN[0],IN[1],B1[0],B1[1],1),y1=Math.atan2(B1[0]-IN[0],B1[1]-IN[1]);
  if(Math.abs(Math.atan2(Math.sin(y-y1),Math.cos(y-y1)))>1e-9)bad.push('full turn does not face first base');
  if(Math.abs(y-y0)>Math.PI)bad.push('turns the long way round');
  const yk=turnYaw(y0,IN[0],IN[1],B1[0],B1[1],U2_WATCH.TURN);if(Math.abs(yk-y0)<.3)bad.push(`turn toward 1B only ${(yk-y0).toFixed(2)} rad`)}
if(!/u2Watch\(f,e,u\)/.test(game)||!/x===ST_U2_IN\[0\]&&z===ST_U2_IN\[1\]/.test(game))bad.push('game.js poseStaff does not call u2Watch on the inside spot');
if(!/import\(new URL\('u2watch\.js'/.test(game))bad.push('game.js does not load render/u2watch.js');
if(bad.length){console.error('u2watch.check FAILED\n'+bad.join('\n'));process.exit(1)}
console.log(`u2watch.check ok (turn ${(U2_WATCH.TURN).toFixed(2)} to 1B, max step ${maxStep.toFixed(3)} rad / .05 s)`);
