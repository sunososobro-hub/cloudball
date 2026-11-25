/* render/dugout_lite.js: the cheap dugout for the tiers that do not draw render/props/dugout.js (#313, phone / non-max).
 * Pure data, no three.js: game.js turns each part into one unlit-cheap box mesh named 'old:dugout' (props/index.js hides them while max is on,
 * so max keeps the polished dugout alone). Same footprint as props/dugout.js DUG (L 14, D 1.7, H 2.25, roof L+.3 by D+.35) in the same local
 * frame: x along the foul line, z away from the field (front face at z 0), y up; the group stands at the point game.js calls dugout(t) and turns
 * sign(x)*45 degrees like the polished one. 4 meshes per dugout: back wall, two side walls, roof. No textures, no PBR. */
/* L, D, H repeat props/dugout.js DUG (that file imports three, so a plain Node check cannot load it; tests/dugout_lite.check.mjs compares them). */
export const LITE={L:14,D:1.7,H:2.25,WALL_T:.22,BACK_T:.12,ROOF_T:.2,ROOF_OVER_X:.3,ROOF_OVER_Z:.35,WALL:0x9a9890,ROOF:0x4c5462,FLOOR:0x77746c};

/* -> {rotY, parts: [{name, w, h, d, x, y, z, color}]} (box centres in the local frame; x, z = the dugout point) */
export function liteDugout(x,z){const {L,D,H,WALL_T,BACK_T,ROOF_T,ROOF_OVER_X,ROOF_OVER_Z}=LITE;
  const P=(name,w,h,d,px,py,pz,color)=>({name,w,h,d,x:px,y:py,z:pz,color});
  return{x,z,rotY:Math.sign(x||-1)*Math.PI/4,parts:[
    P('back',L,H,BACK_T,0,H/2,D-BACK_T/2,LITE.WALL),
    P('side-',WALL_T,H,D,-(L/2-WALL_T/2),H/2,D/2,LITE.WALL),
    P('side+',WALL_T,H,D,L/2-WALL_T/2,H/2,D/2,LITE.WALL),
    P('roof',L+ROOF_OVER_X,ROOF_T,D+ROOF_OVER_Z,0,H+ROOF_T/2,D/2-ROOF_OVER_Z/2,LITE.ROOF)]}}
