/* render/props/index.js: the slots of the polished props (#215, slot rule #237). Polish rounds never edit this file.
 * One slot per object file of the #215 board, listed once, up front: the objects on dev, those in open PRs and those still planned.
 * Each object file exports `PROPS`, an array of descriptors (one file may hold several, like the two dugouts):
 *   {name, build(ctx) -> Group standing where the old object stood, old(ctx) -> the old meshes it replaces ([] if there were none)}.
 * A stub file exports `PROPS=[]`: the old meshes stay. To polish an object, edit only its own file; its round notes go in that file's
 * header comment and on the #215 board (not in render/HANDOFF.md). New materials live in the object's file (render/pbr.js is read-only
 * for polish rounds). A new object not listed below = a new slot here, which is a separate single-window job (open an issue).
 * Swap rule: on the tiers PROPS_ON allows, the new group is drawn and the old meshes are hidden; on every other tier the reverse.
 * A file that fails to load, or a build that throws, leaves the old meshes as they are (the park never loses an object). */

/* Polished props are drawn on the `max` tier only (manager 11/22 10:30, #211): game.js imports this file only once max is on,
   and max can still go off later (the tier button, a drop below tier 0), so the swap follows it. Takes the ctx below. */
export const PROPS_ON=c=>!!(c.max&&c.max());

/* Literal imports, so tests/replay/static.mjs sees a missing slot file. Order = mount order (and the viewer's list). */
export const SLOTS=[
  ['field',()=>import('./field.js')],          /* turf and infield dirt (old:field) */
  ['dugout',()=>import('./dugout.js')],        /* homeDugout, roadDugout (never existed: nothing to hide) */
  ['wall',()=>import('./wall.js')],            /* outfield wall pads and fence top (old:wall, old:wall:top) */
  ['foulpoles',()=>import('./foulpoles.js')],  /* both foul poles (old:foulpole:-1, old:foulpole:1) */
  ['backstop',()=>import('./backstop.js')],    /* net, posts, top cable (old:backstop) */
  ['scoreboard',()=>import('./scoreboard.js')],/* housing and leg (old:scoreboard); the score face stays game.js's */
  ['bases',()=>import('./bases.js')],          /* bases, plate and rubber (painted on the field map: nothing to hide) */
  ['mound',()=>import('./mound.js')],          /* mound and batter's boxes (painted on the field map: nothing to hide) */
  ['towers',()=>import('./towers.js')],        /* light towers: old:towers (masts), old:towers:lamp (lamp heads); light, beams, glow stay game.js's */
  ['seats',()=>import('./seats.js')],          /* seats, rails and aisles: old:seats (seat rows), old:seats:back, old:seats:rail */
  ['roof',()=>import('./roof.js')],            /* roof and fascia: old:roof (roof slab, ribs inside it), old:roof:fascia */
  ['bullpens',()=>import('./bullpens.js')],    /* never existed */
  ['wells',()=>import('./wells.js')],          /* camera wells: never existed */
  ['flags',()=>import('./flags.js')],          /* never existed */
  ['ondeck',()=>import('./ondeck.js')],        /* on-deck circles: old:ondeck = the cheap circles of render/ondeck_lite.js (#392) */
  ['batterseye',()=>import('./batterseye.js')],/* batter's eye: old:batterseye = the cheap screen of render/batterseye_lite.js (#150 part 6) */
];

/* every mesh game.js named old:<name> or old:<name>:<part> (one object can be several meshes), in the order game.js made them.
   game.js also gives each stand group name 'stand' and userData.stand = {px, pz, rotY, len, rows, side, roof, base}. */
export const oldOf=(scene,n)=>{const a=[],p='old:'+n;scene.traverse(o=>{if(o.name===p||o.name.startsWith(p+':'))a.push(o)});return a};

/* ctx from game.js: {scene, tier: () => current quality tier, max: () => true while the `max` tier is on, dugout: team -> [x, z],
   park: () => {pad, trim} of the home park}; withCtx adds old(name) = oldOf(scene, name). */
export const withCtx=ctx=>ctx.old?ctx:Object.assign(ctx,{old:n=>oldOf(ctx.scene,n)});

/* every descriptor of every slot, in slot order; a slot whose file does not load is skipped (with a warning) */
let all=null;
export function loadProps(){return all||(all=Promise.allSettled(SLOTS.map(([,f])=>f())).then(R=>R.flatMap((r,i)=>{
  if(r.status==='fulfilled')return Array.isArray(r.value.PROPS)?r.value.PROPS:[];
  console.warn(`prop slot ${SLOTS[i][0]} off, old meshes kept`,r.reason);return[]})))}

export async function mountProps(ctx){withCtx(ctx);const live=[];
  for(const P of await loadProps()){try{const g=P.build(ctx),old=P.old(ctx)||[];ctx.scene.add(g);live.push({g,old})}catch(e){console.warn(`prop ${P.name} off, old one kept`,e)}}
  let pk,on;
  const tick=()=>{const t=PROPS_ON(ctx),p=ctx.park();
    if(t!==on){on=t;for(const L of live){L.g.visible=t;for(const m of L.old)m.visible=!t}}
    if(p!==pk){pk=p;for(const L of live)if(L.g.userData.recolor)L.g.userData.recolor(p)}
    requestAnimationFrame(tick)};
  tick();return live}
