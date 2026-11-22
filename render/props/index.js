/* render/props/index.js: the list of polished props (#215). One file per object in this folder, one entry per object here.
 * game.js calls mountProps() once, after the park is built, and never needs editing for a polish round again.
 * Entry: {name, build(ctx) -> Group standing where the old object stood, old(ctx) -> the old meshes it replaces ([] if there were none)}.
 * Swap rule: on the tiers PROPS_ON allows, the new group is drawn and the old meshes are hidden; on every other tier the reverse.
 * A build that throws leaves the old meshes as they are (the park never loses an object). */
import {buildDugout} from './dugout.js';

/* Which quality tiers draw the polished props. Today tier 0 (the owner's desktop, 11/22 09:39).
   #211 (`max` tier): when it lands, change this one line to the max tier's test, e.g. t=>t===TIER_MAX_ID; nothing else moves. */
export const PROPS_ON=t=>t===0;

export const PROPS=[
  /* the home team's dugout: dugout(1) in game.js is where the home side leaves the field. Never existed before: nothing to hide. */
  {name:'homeDugout',build:c=>{const [x,z]=c.dugout(1);return buildDugout({x,z,colors:c.park()})},old:()=>[]},
];

/* ctx from game.js: {scene, tier: () => current quality tier, dugout: team -> [x, z], park: () => {pad, trim} of the home park} */
export function mountProps(ctx){const live=[];
  for(const P of PROPS){try{const g=P.build(ctx),old=P.old(ctx)||[];ctx.scene.add(g);live.push({g,old})}catch(e){console.warn(`prop ${P.name} off, old one kept`,e)}}
  let pk,on;
  const tick=()=>{const t=PROPS_ON(ctx.tier()),p=ctx.park();
    if(t!==on){on=t;for(const L of live){L.g.visible=t;for(const m of L.old)m.visible=!t}}
    if(p!==pk){pk=p;for(const L of live)if(L.g.userData.recolor)L.g.userData.recolor(p)}
    requestAnimationFrame(tick)};
  tick();return live}
