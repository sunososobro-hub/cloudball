/* #612 part 10: base-state spots of the line umpires (render/umpspot.js). Plain Node, runs the module.
 * Checks: nobody on = both deep; runner on first = U1 near, U3 deep; runner on third = U3 near; no walk when the base state does not
 * change; a change ends the event at the next event's spot (no jump at the event boundary), starts after the last runner arrives,
 * finishes inside the event, never faster than 1.5 x V between frames .05 s apart; NEAR is closer to the bag than POST and in foul
 * ground; END sends him back deep; game.js wires it into poseStaff and cpEvents. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {UMP_SPOT, spotOf, nearOf, spotPlan, spotAt, spotEnd} from '../render/umpspot.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const B1=[27.432*Math.SQRT1_2,-27.432*Math.SQRT1_2],B3=[-B1[0],B1[1]],d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const ev=(b,more={})=>({k:'P',t:0,d:12,s0:{b},...more});
const opt={ARRIVE:.5,BRK_ON_AT:17.5,BRK_OFF_AT:1};

if(nearOf(ev([0,0,0]),0)||nearOf(ev([0,0,0]),2))bad.push('nobody on: a line umpire is near');
if(!nearOf(ev(['a',0,0]),0)||nearOf(ev(['a',0,0]),2))bad.push('runner on first: U1 near only');
if(nearOf(ev([0,0,'c']),0)||!nearOf(ev([0,0,'c']),2))bad.push('runner on third: U3 near only');
if(nearOf(ev([0,'b',0]),0)||nearOf(ev([0,'b',0]),2))bad.push('runner on second only: line umpires stay deep');
for(const k of [0,2]){const B=k?B3:B1,N=spotOf(k,true),P=spotOf(k,false);
  if(!(d(N,B)<d(P,B)))bad.push(`U${k+1}: NEAR not closer to the bag than POST`);
  if(!(d(N,B)>=3))bad.push(`U${k+1}: NEAR on top of the bag (runner / first baseman)`);
  const foul=k?N[1]>N[0]:N[1]>-N[0];/* foul ground: beyond the line toward the stands */
  if(!foul)bad.push(`U${k+1}: NEAR is in fair ground`)}
if(UMP_SPOT.POST[0]!==32||UMP_SPOT.POST[1]!==1.2)bad.push('POST differs from game.js ST_UMP_POST [32,1.2]');
if(!/ST_UMP_POST=\[32,1\.2\]/.test(game))bad.push('game.js ST_UMP_POST changed: keep umpspot POST in step');

/* no change -> no walk */
{const L=[ev(['a',0,0]),ev(['a',0,0])],q=spotPlan(L,0,0,opt);if(!q||q.pl)bad.push('same base state: he walks');if(spotEnd(q)!==0)bad.push('spotEnd not 0 without a walk')}
/* runner reaches first on a single (arrives at 3.1 s), next pitch has him on: U1 walks up at the end of the event */
{const e0=ev([0,0,0],{r:'inplay',moves:[[0,1,'x',{arriveT:3.1}]]}),L=[e0,ev(['x',0,0])];
  for(const k of [0,2]){const q=spotPlan(L,0,k,opt),s0=spotAt(q,k,0),s1=spotAt(q,k,e0.d),nx=spotAt(spotPlan(L,1,k,opt),k,0);
    if(d([s0.x,s0.z],spotOf(k,false))>1e-9)bad.push(`U${k+1}: not deep at the start`);
    if(d([s1.x,s1.z],[nx.x,nx.z])>1e-9)bad.push(`U${k+1}: jumps at the event boundary`);
    if(k===0){if(!q.pl)bad.push('U1 does not walk up');else{
      if(!(q.pl.go>=3.1+UMP_SPOT.SETTLE-1e-9))bad.push('U1 walks before the runner arrives');
      if(!(spotEnd(q)<=e0.d+1e-9))bad.push('U1 walk ends after the event');
      let prev=spotAt(q,0,0),max=0;for(let u=.05;u<=e0.d;u+=.05){const s=spotAt(q,0,u);max=Math.max(max,d([s.x,s.z],[prev.x,prev.z])/.05);
        if(s.moving&&Math.abs(Math.hypot(s.fx,s.fz)-1)>1e-6)bad.push('facing not a unit vector');prev=s}
      if(max>1.5*UMP_SPOT.V+.05)bad.push('U1 too fast: '+max.toFixed(2)+' m/s')}}
    else if(q.pl)bad.push('U3 walks although third stays empty')}}
/* runner on third scores: U3 walks back deep */
{const L=[ev([0,0,'c'],{r:'inplay',moves:[[3,4,'c',{arriveT:2}]]}),ev([0,0,0])],q=spotPlan(L,0,2,opt);
  if(!q||!q.pl)bad.push('U3 does not walk back when third empties');else{const s=spotAt(q,2,12);if(d([s.x,s.z],spotOf(2,false))>1e-9)bad.push('U3 not back deep at the end')}}
/* END: back deep; PRE: deep */
{const L=[ev(['a',0,0]),{k:'END',t:0,d:10,s0:{b:['a',0,0]}}],q=spotPlan(L,1,0,opt);if(q.a||q.b)bad.push('END: U1 not deep')}
/* half-inning break with the extra-inning runner on second only: line umpires stay */
{const L=[{k:'BRK',t:0,d:30,s0:{b:[0,0,0]}},ev([0,'z',0])];for(const k of [0,2])if(spotPlan(L,0,k,opt).pl)bad.push('BRK to runner on second: line umpire walks')}
/* short event: the walk is pulled forward so it still ends inside */
{const e0=ev([0,0,0],{d:4,r:'inplay',moves:[[0,1,'x',{arriveT:3.9}]]}),q=spotPlan([e0,ev(['x',0,0])],0,0,opt);if(!(spotEnd(q)<=4+1e-9))bad.push('short event: walk runs past its end')}

if(!/usM\.spotAt\(/.test(game)||!/usEnd\(ev,i\)/.test(game))bad.push('game.js does not wire umpspot.js into poseStaff / cpEvents');
if(bad.length){console.error('umpspot FAIL\n- '+bad.join('\n- '));process.exit(1)}
console.log('umpspot ok');
