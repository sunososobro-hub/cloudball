/* render/ondeck_lite.js: the cheap on-deck circles for the tiers that do not draw render/props/ondeck.js (#392, phone / non-max).
 * Pure data, no three.js: game.js turns each part into one Lambert mesh named 'old:ondeck' (props/ondeck.js hides them while max is on).
 * Same spot and size as props/ondeck.js DECK (X 11.3, Z 1.2, R .762; road circle at +X, home at -X). 2 meshes per circle (mat disc, trim
 * ring), 4 in all: no PBR, no textures. The ring takes the park's trim colour (game.js applyPark recolours `kind: 'ring'` parts). */
/* X, Z, R, RING repeat props/ondeck.js DECK (that file imports three, so a plain Node check cannot load it; tests/ondeck_lite.check.mjs compares them). */
export const LITE={X:11.3,Z:1.2,R:.762,RING:[.6,.7],H:.018,RING_LIFT:.004,MAT:0x2b5232};

/* -> [{name, kind: 'mat'|'ring', x, y, z, r0, r1, h, color}] for the circle on side +1 (road, +x) or -1 (home, -x); y = centre height */
export function liteOnDeck(side){const {X,Z,R,RING,H,RING_LIFT,MAT}=LITE;
  return[{name:'mat',kind:'mat',x:side*X,y:H/2,z:Z,r0:R,r1:R,h:H,color:MAT},
    {name:'ring',kind:'ring',x:side*X,y:H+RING_LIFT,z:Z,r0:RING[0],r1:RING[1],h:0,color:0xffffff}]}
