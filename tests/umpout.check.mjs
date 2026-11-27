/* #612 part 8: line umpires work the outfield (render/umpout.js). Plain Node, runs the module.
 * Checks: a deep fly on his side sends him out, a shallow one, the other side, a missing catch spot or no room before the event ends sends nobody;
 * he never moves more than UMP_OUT.V_OUT m/s between frames .05 s apart and never jumps (post -> out -> post, ends exactly at the post);
 * he stands at the trip's far point at the call time; the trip stays inside the event; game.js wires it into poseStaff and cpEvents. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {outPlan, outAt, UMP_OUT} from '../render/umpout.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=game.match(new RegExp('\\b'+k+'=([0-9.]+)'));return m?+m[1]:NaN};
const HOLD=num('BC_HOLD')+num('BC_DOWN');if(!Number.isFinite(HOLD))bad.push('could not read BC_HOLD/BC_DOWN from game.js');
const lineXZ=(side,[s,d])=>[side*(s+d)*Math.SQRT1_2,(d-s)*Math.SQRT1_2];
const P1=lineXZ(1,[32,1.2]),P3=lineXZ(-1,[32,1.2]);
const rf={b:1,t:4,out:true,at:[40,-70]},lf={b:3,t:4,out:true,at:[-40,-70]};
const pl=outPlan(rf,P1,HOLD,12);
if(!pl)bad.push('deep fly to right: U1 does not go out');
if(outPlan(lf,P1,HOLD,12))bad.push('U1 goes out on a fly to left');
if(!outPlan(lf,P3,HOLD,12))bad.push('deep fly to left: U3 does not go out');
if(outPlan({...rf,at:[20,-30]},P1,HOLD,12))bad.push('goes out on a shallow fly');
if(outPlan({b:1,t:4,out:true},P1,HOLD,12))bad.push('goes out with no catch spot');
if(outPlan(rf,P1,HOLD,5))bad.push('goes out although he cannot be back inside the event');
if(outPlan({...rf,t:.3},P1,HOLD,12))bad.push('goes out although the catch is at once');
if(pl){
  if(!(pl.D>=UMP_OUT.MIN&&pl.D<=UMP_OUT.MAX))bad.push('trip length '+pl.D+' outside MIN..MAX');
  if(!(pl.end<=12))bad.push('trip ends after the event');
  const a0=outAt(pl,0),aE=outAt(pl,pl.end+1);
  if(a0.active||aE.active||Math.hypot(a0.x-P1[0],a0.z-P1[1])>1e-9||Math.hypot(aE.x-P1[0],aE.z-P1[1])>1e-9)bad.push('not at his post before / after the trip');
  const c=outAt(pl,rf.t);if(!c.active||Math.hypot(c.x-pl.to[0],c.z-pl.to[1])>1e-6)bad.push('not at the far point at the call time');
  const d0=Math.hypot(pl.to[0]-P1[0],pl.to[1]-P1[1]),dAt=Math.hypot(pl.to[0]-pl.at[0],pl.to[1]-pl.at[1]),dPost=Math.hypot(P1[0]-pl.at[0],P1[1]-pl.at[1]);
  if(!(dAt<dPost))bad.push('the far point is not closer to the catch spot than his post');
  let prev=outAt(pl,0),maxV=0;
  for(let u=.05;u<=pl.end+1;u+=.05){const q=outAt(pl,u);maxV=Math.max(maxV,Math.hypot(q.x-prev.x,q.z-prev.z)/.05);
    if(q.active&&!(Math.abs(Math.hypot(q.fx,q.fz)-1)<1e-6))bad.push('facing is not a unit vector at '+u.toFixed(2));prev=q}
  if(maxV>UMP_OUT.V_OUT+1e-6)bad.push('he jumps: '+maxV.toFixed(2)+' m/s');
  void d0;
}
if(!/uoM\.outAt\(/.test(game)||!/uoEnd\(e\)/.test(game))bad.push('game.js does not wire umpout.js into poseStaff / cpEvents');
if(bad.length){console.error('umpout FAIL\n- '+bad.join('\n- '));process.exit(1)}
console.log('umpout ok');
