/* render/batterseye_lite.js: the cheap batter's eye for the tiers that do not draw render/props/batterseye.js (#150 part 6, phone / non-max).
 * Pure data, no three.js: game.js turns it into ONE open curved screen (CylinderGeometry slice, Lambert, double sided) named 'old:batterseye';
 * props/batterseye.js hides it while max is on. Same arc as the polished one (R, HALF, TOP repeat its EYE; that file imports three, so a plain
 * Node check cannot load it: tests/batterseye_lite.check.mjs compares them). One mesh, one draw call, no texture, no PBR, no shadow. */
export const LITE={R:122.6,HALF:7.5,TOP:19.5,COLOR:0x1e3428};

/* -> {r, top, thetaStart, thetaLength, color}: three's CylinderGeometry puts angle 0 on +z and grows toward +x, so CF (-z) is theta PI */
export function liteEye(){const {R,HALF,TOP,COLOR}=LITE,len=2*HALF*Math.PI/180;
  return{r:R,top:TOP,thetaStart:Math.PI-len/2,thetaLength:len,color:COLOR}}
