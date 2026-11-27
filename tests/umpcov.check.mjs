/* #612 part 9: the plate umpire covers third while U3 is out (render/umpcov.js). Plain Node, runs the module.
 * Checks: no runner / no U3 trip / no room = no cover; weight is 0 outside the trip, 1 at the hold, never steps between frames .05 s apart
 * (speed of the blended spot <= UMP_COV.V); cover ends inside U3's trip; game.js wires it into placeUmp. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {outPlan} from '../render/umpout.js';
import {covPlan, covAt, UMP_COV} from '../render/umpcov.js';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),bad=[];
const game=readFileSync(path.join(ROOT,'render/game.js'),'utf8');
const num=k=>{const m=game.match(new RegExp('\\b'+k+'=([0-9.]+)'));return m?+m[1]:NaN};
const HOLD=num('BC_HOLD')+num('BC_DOWN');if(!Number.isFinite(HOLD))bad.push('could not read BC_HOLD/BC_DOWN from game.js');
const P3=[-(32+1.2)*Math.SQRT1_2,(1.2-32)*Math.SQRT1_2];
const out=outPlan({b:3,t:6,out:true,at:[-40,-70]},P3,HOLD,20);
if(!out)bad.push('setup: U3 does not go out');
else{
  if(covPlan(out,P3,false))bad.push('cover with nobody on base');
  if(covPlan(null,P3,true))bad.push('cover without a U3 trip');
  if(covPlan({...out,end:out.back+.1},P3,true))bad.push('cover although there is no time to walk back');
  const pl=covPlan(out,P3,true);
  if(!pl)bad.push('runner on + U3 out: no cover');
  else{
    if(!(pl.end<=out.end+1e-9))bad.push('cover ends after U3 is back');
    if(covAt(pl,0).w!==0||covAt(pl,pl.end+1).w!==0)bad.push('weight not 0 before / after');
    if(covAt(pl,pl.back-.01).w<.999)bad.push('not fully at the cover spot before U3 turns back');
    let prev=covAt(pl,0),max=0;
    for(let u=.05;u<=pl.end+1;u+=.05){const q=covAt(pl,u);max=Math.max(max,Math.abs(q.w-prev.w)*Math.hypot(pl.to[0],pl.to[1])/.05);
      if(q.w>0&&Math.abs(Math.hypot(q.fx,q.fz)-1)>1e-6)bad.push('facing not a unit vector at '+u.toFixed(2));prev=q}
    if(max>2*UMP_COV.V)bad.push('he jumps: '+max.toFixed(2)+' m/s');
    if(!(pl.to[0]<0&&pl.to[1]<0))bad.push('cover spot is not on the third-base side');
  }
}
if(!/ucM\.covAt\(/.test(game)||!/ucM\.covPlan\(/.test(game))bad.push('game.js does not wire umpcov.js into placeUmp');
if(bad.length){console.error('umpcov FAIL\n- '+bad.join('\n- '));process.exit(1)}
console.log('umpcov ok');
