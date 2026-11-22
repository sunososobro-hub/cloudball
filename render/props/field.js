/* render/props/field.js: turf and infield dirt (#215 polish lane, round 1). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * The field is one plane in game.js ('old:field': field-map canvas + CC0 grass/dirt scans). This prop does not redraw the map: it
 * clones that material and changes how it answers light, which is what flat turf lacked:
 *   - mowing stripes from blade direction: each 6 m band of the fair outfield (the bands of the field map) has its blades combed
 *     toward or away from home. The band looks light when the blades lean away from the eye and dark when they lean toward it, so the
 *     stripes come from the view direction (they swap ends from the centre-field camera) instead of two paints. The painted contrast
 *     of the map is evened out first (STRIPE_EVEN), then the sheen and a blade-lean tilt of the normal put it back.
 *   - infield grass gets the same comb in a checkerboard (two passes at 45 degrees), as clubs mow it.
 *   - dirt: watered (darker, a little less rough, patchy) and raked: shallow concentric grooves around home plate with a hand wobble,
 *     drawn as a normal tilt plus a darker groove floor, so the rake lines catch the tower light at grazing angles.
 * Everything is a function of world position: same park every load, nothing random, no texture download (default download unchanged).
 * Swap: build() returns a new mesh standing where the old plane stood; props/index.js hides the old plane while it is drawn. */
import * as THREE from 'three/webgpu';
import * as TSL from 'three/tsl';

export const FIELD={
  BAND_M:6,BAND_Z0:-150,/* the field map's mowing bands: 6 m along z from z -150 (game.js fieldTex) */
  WEDGE_R:106,DIRT_C:[0,-18.4],DIRT_R:29,/* fair outfield grass = inside the 106 m arc and the foul lines, outside the infield dirt circle */
  STRIPE_EVEN:.19,/* half the painted light/dark luminance step of the map bands (linear), removed so the stripes come from light */
  SHEEN:.17,/* how much brighter (darker) a band looks when its blades lean straight away from (toward) the eye */
  LEAN:.22,/* horizontal tilt of the grass normal toward the comb direction */
  CHECK_M:4.5,/* infield grass checkerboard square, metres */
  WET:.8,WET_PATCH:.12,WET_ROUGH:.93,/* watered dirt: colour factor, patchiness, roughness factor */
  RAKE_M:.11,RAKE_WOBBLE:.25,RAKE_NEAR:5,RAKE_FAR:14,RAKE_TILT:.32,RAKE_AO:.14,/* rake: groove spacing, hand wobble (grooves), normal tilt, groove floor darkening */
};

/* ctx: {scene} -> THREE.Mesh, the polished field standing where 'old:field' stands. Throws if the old plane is not there. */
export function buildField(ctx){const old=ctx.scene.getObjectByName('old:field');if(!old)throw new Error('old:field not found');
  const F=FIELD,{positionWorld,cameraPosition,cameraViewMatrix,normalize,vec2,vec3,vec4,float,floor,fract,abs,length,sin,cos,max,min,mix,
    smoothstep,step,dot,mx_fractal_noise_float:fn}=TSL;
  const m=old.material.clone();m.name='prop:field';
  const base=old.material.colorNode,n0=old.material.normalNode,r0=old.material.roughnessNode;
  const w=positionWorld.xz,x=w.x,z=w.y;
  /* masks from the colour the old material already computes (linear): grass = clearly more green than red; chalk = all channels bright */
  const grass=smoothstep(.005,.03,base.g.sub(base.r)),chalk=smoothstep(.25,.45,min(base.r,min(base.g,base.b))),dirt=float(1).sub(grass).mul(float(1).sub(chalk));
  /* zones */
  const rr=length(w),inWedge=step(rr,F.WEDGE_R).mul(step(abs(x),z.negate())),inCircle=step(length(w.sub(vec2(...F.DIRT_C))),F.DIRT_R);
  const outfield=inWedge.mul(float(1).sub(inCircle)).mul(grass),infield=inCircle.mul(grass);
  /* comb direction per band: even bands (the map's light ones) lean toward -z, away from home; odd bands toward +z */
  const par=n=>fract(n.mul(.5)).mul(2);/* parity of a whole number, also below zero */
  const band=par(floor(z.sub(F.BAND_Z0).div(F.BAND_M))),sOut=float(1).sub(band.mul(2));/* +1 even, -1 odd */
  const leanOut=vec2(0,sOut.negate());
  /* infield checkerboard: squares on axes turned 45 degrees (along the base paths), comb alternates between the two diagonals */
  const u=x.add(z).mul(Math.SQRT1_2),v=z.sub(x).mul(Math.SQRT1_2),chk=par(floor(u.div(F.CHECK_M)).add(floor(v.div(F.CHECK_M))));
  const leanIn=mix(vec2(-Math.SQRT1_2,-Math.SQRT1_2),vec2(Math.SQRT1_2,-Math.SQRT1_2),chk);
  const lean=mix(leanIn,leanOut,outfield.div(max(outfield.add(infield),1e-4)));
  const mown=max(outfield,infield);
  /* view direction on the ground plane: eye -> point. A band is lighter when its comb points the same way (you see blade sides) */
  const d=positionWorld.sub(cameraPosition),dh=d.xz.div(max(length(d),1e-3));/* horizontal part, shorter when looking straight down */
  const sheen=float(1).add(dot(lean,dh).mul(F.SHEEN).mul(mown));
  const even=float(1).add(sOut.mul(-F.STRIPE_EVEN)).mul(outfield).add(float(1).sub(outfield));/* undo the painted step */
  /* dirt: watering patches and rake grooves (concentric around home plate, wobble by low noise) */
  const patch=fn(vec3(w.mul(.12),3),3,2,.5),wet=mix(float(1),float(F.WET).add(patch.mul(F.WET_PATCH)),dirt);
  /* grooves fade out with distance (RAKE_NEAR..RAKE_FAR m from the eye): 11 cm lines alias into rings from the broadcast camera */
  const near=float(1).sub(smoothstep(F.RAKE_NEAR,F.RAKE_FAR,length(positionWorld.sub(cameraPosition)))),dirtR=dirt.mul(near);
  const ph=rr.div(F.RAKE_M).add(fn(vec3(w.mul(.6),7),2,2,.5).mul(F.RAKE_WOBBLE*Math.PI*2)),rake=sin(ph),gro=cos(ph);
  const rakeAO=float(1).sub(rake.mul(.5).add(.5).oneMinus().mul(F.RAKE_AO).mul(dirtR));
  m.colorNode=base.rgb.mul(even).mul(sheen).mul(wet).mul(rakeAO);
  /* normal: the old view-space normal plus world-space tilts carried into view space */
  const radial=w.div(max(rr,1e-3)),tilt=vec3(lean.x.mul(F.LEAN).mul(mown),0,lean.y.mul(F.LEAN).mul(mown))
    .add(vec3(radial.x,0,radial.y).mul(gro.mul(F.RAKE_TILT).mul(dirtR)));
  m.normalNode=normalize(n0.add(cameraViewMatrix.mul(vec4(tilt,0)).xyz));
  m.roughnessNode=r0.mul(mix(float(1),float(F.WET_ROUGH),dirt));
  m.needsUpdate=true;
  const g=new THREE.Mesh(old.geometry,m);g.name='prop:field';g.position.copy(old.position);g.rotation.copy(old.rotation);g.scale.copy(old.scale);
  g.receiveShadow=true;g.renderOrder=old.renderOrder;return g}

/* slot descriptor (#237): the field plane of game.js, same map, new light response */
export const PROPS=[{name:'field',build:c=>buildField(c),old:c=>c.old('field')}];
