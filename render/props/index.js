/* render/props/index.js: the list of polished props (#215). One file per object in this folder, one entry per object here.
 * game.js calls mountProps() once, after the park is built, and never needs editing for a polish round again.
 * Entry: {name, build(ctx) -> Group standing where the old object stood, old(ctx) -> the old meshes it replaces ([] if there were none)}.
 * Swap rule: on the tiers PROPS_ON allows, the new group is drawn and the old meshes are hidden; on every other tier the reverse.
 * A build that throws leaves the old meshes as they are (the park never loses an object). */
import {buildDugout} from './dugout.js';
import {buildField} from './field.js';
import {buildWall} from './wall.js';
import {buildFoulPoles} from './foulpoles.js';

/* Polished props are drawn on the `max` tier only (manager 11/22 10:30, #211): game.js imports this file only once max is on,
   and max can still go off later (the tier button, a drop below tier 0), so the swap follows it. Takes the ctx below. */
export const PROPS_ON=c=>!!(c.max&&c.max());

export const PROPS=[
  /* the home team's dugout: dugout(1) in game.js is where the home side leaves the field. Never existed before: nothing to hide. */
  /* turf and infield dirt: the field plane of game.js, same map, new light response (mowing stripes, watered and raked dirt) */
  {name:'field',build:c=>buildField(c),old:c=>[c.scene.getObjectByName('old:field')].filter(Boolean)},
  {name:'homeDugout',build:c=>{const [x,z]=c.dugout(1);return buildDugout({x,z,colors:c.park()})},old:()=>[]},
  /* outfield wall pads and fence top: replaces the field face of the old wall and its flat top band (game.js names them old:wall, old:wall:top) */
  {name:'wall',build:c=>buildWall({colors:c.park(),old:c.scene.getObjectByName('old:wall')}),old:c=>['old:wall','old:wall:top'].map(n=>c.scene.getObjectByName(n)).filter(Boolean)},
  /* both foul poles: the two plain cylinders at the ends of the fence arc in game.js */
  {name:'foulPoles',build:c=>buildFoulPoles({colors:c.park()}),old:c=>[-1,1].map(s=>c.scene.getObjectByName('old:foulpole:'+s)).filter(Boolean)},
];

/* ctx from game.js: {scene, tier: () => current quality tier, max: () => true while the `max` tier is on, dugout: team -> [x, z], park: () => {pad, trim} of the home park} */
export function mountProps(ctx){const live=[];
  for(const P of PROPS){try{const g=P.build(ctx),old=P.old(ctx)||[];ctx.scene.add(g);live.push({g,old})}catch(e){console.warn(`prop ${P.name} off, old one kept`,e)}}
  let pk,on;
  const tick=()=>{const t=PROPS_ON(ctx),p=ctx.park();
    if(t!==on){on=t;for(const L of live){L.g.visible=t;for(const m of L.old)m.visible=!t}}
    if(p!==pk){pk=p;for(const L of live)if(L.g.userData.recolor)L.g.userData.recolor(p)}
    requestAnimationFrame(tick)};
  tick();return live}
