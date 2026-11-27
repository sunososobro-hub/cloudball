/* render/umpspot.js (#612 part 10): base-state spots for the line umpires (4-man mechanics). With nobody on, U1 and U3 stand deep on
 * their line (POST, s metres from home along the line, d metres into foul ground). With a runner on first, U1 moves up to NEAR, a step
 * behind the bag in foul ground, to see a pickoff and the first baseman's tag; with a runner on third, U3 does the same at third. They
 * never jump: an event whose base state for that umpire differs from the next event's ends with a walk (V m/s) from one spot to the
 * other, starting SETTLE s after the last runner of the play arrives (on a half-inning break: at BRK_OFF_AT going back to the post, at
 * BRK_ON_AT moving up), and finishing inside the event when it fits (game.js cpEvents keeps it on screen). END ends empty.
 * Plain math, no three.js; game.js loads it with import() and keeps them at POST until it is in. Pure function of (events, index, time),
 * so a seek lands where playing would; base state is the engine's (rule 12), nothing here touches an outcome (rule 10).
 * tests/umpspot.check.mjs runs it. */
export const UMP_SPOT={POST:[32,1.2],NEAR:[30.4,2.6],V:3,SETTLE:.3};

const hyp=Math.hypot,sat01=t=>Math.max(0,Math.min(1,t)),ease=t=>t*t*(3-2*t);
/* [s, d] on a base line -> world [x, z] (home at 0,0, pitcher at -z); side +1 = first-base line (U1), -1 = third (U3) */
export const lineXZ=(side,[s,d])=>[side*(s+d)*Math.SQRT1_2,(d-s)*Math.SQRT1_2];
/* k = crew index: 0 = U1, 2 = U3. Moves up with a runner on his own base (s0.b[0] first, s0.b[2] third) */
export function nearOf(e,k){return !!(e&&e.k!=='PRE'&&e.k!=='END'&&e.s0&&Array.isArray(e.s0.b)&&e.s0.b[k===0?0:2])}
export function spotOf(k,near){return lineXZ(k===0?1:-1,near?UMP_SPOT.NEAR:UMP_SPOT.POST)}

/* {a, b, pl}: a = near at the event start, b = near at the next event's start; pl = {go, t, from, to} when he walks, else null.
 * opt = {ARRIVE, BRK_ON_AT, BRK_OFF_AT}: the pitch arrival (s into a P event) and the half-inning break times of game.js. */
export function spotPlan(ev,i,k,opt={}){const e=ev&&ev[i];if(!e)return null;
  const a=nearOf(e,k),b=e.k==='END'?false:i+1<ev.length?nearOf(ev[i+1],k):a;if(a===b)return{a,b,pl:null};
  const from=spotOf(k,a),to=spotOf(k,b),t=hyp(to[0]-from[0],to[1]-from[1])/UMP_SPOT.V;
  let go=e.k!=='BRK'?0:b?(opt.BRK_ON_AT||0):(opt.BRK_OFF_AT||0);
  for(const m of e.moves||[])if(m&&m[3]&&Number.isFinite(m[3].arriveT))go=Math.max(go,m[3].arriveT+UMP_SPOT.SETTLE);
  if(e.k==='P'&&e.r==='inplay'&&Number.isFinite(opt.ARRIVE))go=Math.max(go,opt.ARRIVE+UMP_SPOT.SETTLE);
  if(Number.isFinite(e.d))go=Math.max(0,Math.min(go,e.d-t));
  return{a,b,pl:{go,t,from,to}}}

/* where he is at event time u: {x, z, fx, fz, moving}; fx, fz = unit walking direction (0, 0 when standing: caller faces him home) */
export function spotAt(q,k,u){if(!q)return{...xz(spotOf(k,false)),fx:0,fz:0,moving:false};if(!q.pl)return{...xz(spotOf(k,q.a)),fx:0,fz:0,moving:false};
  const {go,t,from,to}=q.pl,r=sat01((u-go)/t),w=ease(r),L=hyp(to[0]-from[0],to[1]-from[1])||1,moving=r>0&&r<1;
  return{x:from[0]+(to[0]-from[0])*w,z:from[1]+(to[1]-from[1])*w,fx:moving?(to[0]-from[0])/L:0,fz:moving?(to[1]-from[1])/L:0,moving}}
const xz=([x,z])=>({x,z});
/* end of his walk in this event (s), 0 when he stands: cpEvents keeps the frame until here */
export function spotEnd(q){return q&&q.pl?q.pl.go+q.pl.t:0}
