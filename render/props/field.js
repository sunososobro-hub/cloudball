/* render/props/field.js: turf and infield dirt (#215 polish lane, rounds 1-2). Polish rounds edit only this file (#237: render/pbr.js is read-only, new materials live here; round notes in this header and on the #215 board).
 * The field is one plane in game.js ('old:field': field-map canvas + CC0 grass/dirt scans). This prop does not redraw the map: it
 * clones that material and changes how it answers light, which is what flat turf lacked.
 * Round 1:
 *   - mowing stripes from blade direction: each 6 m band of the fair outfield (the bands of the field map) has its blades combed
 *     toward or away from home. The band looks light when the blades lean away from the eye and dark when they lean toward it, so the
 *     stripes come from the view direction (they swap ends from the centre-field camera) instead of two paints. The painted contrast
 *     of the map is evened out first (STRIPE_EVEN), then the sheen and a blade-lean tilt of the normal put it back.
 *   - infield grass gets the same comb in a checkerboard (two passes at 45 degrees), as clubs mow it.
 *   - dirt: watered (darker, a little less rough, patchy) and raked: shallow concentric grooves around home plate with a hand wobble,
 *     drawn as a normal tilt plus a darker groove floor, so the rake lines catch the tower light at grazing angles.
 * Round 2 (the field map is found inside the old material's node graph and sampled again at moved points; if it is not found, round 1 only):
 *   - grass edge with a lip: the grass/dirt line is read from the map at a point moved by two noises (EDGE_JIT), so it is ragged (clumps
 *     and gaps, not a clean arc); on the dirt side a dark seam right under the turf (LIP_SHADOW within LIP_R1) and a ridge of dry,
 *     lighter dirt built up against it (LIP_R2) whose normal tilts away from the grass; on the grass side the turf edge rolls over
 *     (normal tilts toward the dirt), so the edge catches the tower light like a step.
 *   - chalk with thickness: the line edge is read at a fine-jittered point (powdery, not a ruled edge), the line is a raised strip
 *     (normal tilts outward at both edges, CHALK_TILT), grainy and fully matte, and chalk dust spills a few centimetres onto the dirt.
 *   - blades near the eye: SHELLS stacked alpha-tested layers (max only, like every prop) in a disc that follows the camera; each layer
 *     draws the cross-sections of one blade per BLADE_C cell, tapering to the tip and bent along the mowing comb (so a stripe's blades
 *     lean the same way the sheen says), only on grass. Blades shrink to nothing between BLADE_F0 and BLADE_F1 metres from the eye, so
 *     the broadcast shot (too far for blades) costs no shell pixels beyond the disc and there is no ring where they stop.
 * Everything is a function of world position: same park every load, nothing random, no texture download (default download unchanged).
 * Swap: build() returns a group standing where the old plane stood; props/index.js hides the old plane while it is drawn.
 * Still gives it away after round 2: see the #215 board. */
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
  /* round 2 */
  MAP:{X0:-130,Z0:-150,W:260,H:190,PX:3072},/* the field map's extent (game.js fieldTex): how it is found and sampled */
  EDGE_JIT:.13,EDGE_F1:1.3,EDGE_F2:6,/* ragged edge: displacement (m) and the two noise frequencies (1/m) */
  LIP_R1:.07,LIP_R2:.28,LIP_SHADOW:.34,LIP_DRY:.16,LIP_TILT:.55,TURF_TILT:.6,TURF_LIFT:.1,/* lip: seam width, ridge width, seam darkening, ridge lightening, tilts, turf edge brightening */
  CHALK_JIT:.014,CHALK_R:.035,CHALK_TILT:.5,CHALK_LIFT:1.25,CHALK_GRAIN:.12,DUST_R:.09,DUST:.3,/* chalk: edge jitter, gradient tap, tilt, brightness, grain, dust spill radius and strength */
  SHELLS:10,SHELL_H:.045,BLADE_C:.011,BLADE_R:.0042,BLADE_BEND:.012,BLADE_F0:2.5,BLADE_F1:11,BLADE_DISC:12,BLADE_SNAP:2,/* blades: layers, height, cell, root radius, bend, fade start/end (m from the eye), disc radius, disc snap step */
  BLADE_AO:.45,BLADE_TINT:.14,/* blades: darkening at the root, per-blade colour spread */
};

/* the field map texture inside the old colour graph (the 3072 px canvas), or null */
function findMap(node){let t=null;try{node.traverse(n=>{if(!t&&n.isTextureNode&&n.value&&n.value.image&&n.value.image.width===FIELD.MAP.PX)t=n.value})}catch(e){}return t}

/* ctx: {scene} -> THREE.Group, the polished field standing where 'old:field' stands. Throws if the old plane is not there. */
export function buildField(ctx){const old=ctx.scene.getObjectByName('old:field');if(!old)throw new Error('old:field not found');
  const F=FIELD,{positionWorld,positionLocal,cameraPosition,cameraViewMatrix,normalize,vec2,vec3,vec4,float,floor,fract,abs,length,sin,cos,max,min,mix,
    smoothstep,step,dot,mx_fractal_noise_float:fn,texture,attribute,mod,clamp}=TSL;
  const m=old.material.clone();m.name='prop:field';
  const base=old.material.colorNode,n0=old.material.normalNode,r0=old.material.roughnessNode;
  const w=positionWorld.xz,x=w.x,z=w.y,rr=length(w);
  const mapTex=findMap(base);
  /* the map at world point p (xz) -> its uv (game.js: canvas x from X0, canvas y from Z0 at the top, flipY) */
  const M=F.MAP,uvOf=p=>vec2(p.x.sub(M.X0).div(M.W),float(1).sub(p.y.sub(M.Z0).div(M.H)));
  const sampleAt=p=>texture(mapTex,uvOf(p));
  const gOf=s=>smoothstep(.005,.03,s.g.sub(s.r)),cOf=s=>smoothstep(.45,.75,min(s.r,min(s.g,s.b)));
  /* comb (round 1) for a given grass mask: lean direction, mown share, sheen and the undo of the painted step */
  const par=n=>fract(n.mul(.5)).mul(2);/* parity of a whole number, also below zero */
  function comb(grass){
    const inWedge=step(rr,F.WEDGE_R).mul(step(abs(x),z.negate())),inCircle=step(length(w.sub(vec2(...F.DIRT_C))),F.DIRT_R);
    const outfield=inWedge.mul(float(1).sub(inCircle)).mul(grass),infield=inCircle.mul(grass);
    const band=par(floor(z.sub(F.BAND_Z0).div(F.BAND_M))),sOut=float(1).sub(band.mul(2));/* +1 even (lean toward -z, away from home), -1 odd */
    const u=x.add(z).mul(Math.SQRT1_2),v=z.sub(x).mul(Math.SQRT1_2),chk=par(floor(u.div(F.CHECK_M)).add(floor(v.div(F.CHECK_M))));
    const leanIn=mix(vec2(-Math.SQRT1_2,-Math.SQRT1_2),vec2(Math.SQRT1_2,-Math.SQRT1_2),chk);
    const lean=mix(leanIn,vec2(0,sOut.negate()),outfield.div(max(outfield.add(infield),1e-4))),mown=max(outfield,infield);
    /* view direction on the ground plane: eye -> point. A band is lighter when its comb points the same way (you see blade sides) */
    const d=positionWorld.sub(cameraPosition),dh=d.xz.div(max(length(d),1e-3));
    const sheen=float(1).add(dot(lean,dh).mul(F.SHEEN).mul(mown));
    const even=float(1).add(sOut.mul(-F.STRIPE_EVEN)).mul(outfield).add(float(1).sub(outfield));
    return {lean,mown,sheen,even}}
  /* masks from the colour the old material already computes (linear): grass = clearly more green than red; chalk = all channels bright */
  const grass=smoothstep(.005,.03,base.g.sub(base.r)),chalk=smoothstep(.25,.45,min(base.r,min(base.g,base.b))),dirt=float(1).sub(grass).mul(float(1).sub(chalk));
  const {lean,mown,sheen,even}=comb(grass);
  /* dirt: watering patches and rake grooves (concentric around home plate, wobble by low noise) */
  const patch=fn(vec3(w.mul(.12),3),3,2,.5),wet=mix(float(1),float(F.WET).add(patch.mul(F.WET_PATCH)),dirt);
  /* grooves fade out with distance (RAKE_NEAR..RAKE_FAR m from the eye): 11 cm lines alias into rings from the broadcast camera */
  const near=float(1).sub(smoothstep(F.RAKE_NEAR,F.RAKE_FAR,length(positionWorld.sub(cameraPosition)))),dirtR=dirt.mul(near);
  const ph=rr.div(F.RAKE_M).add(fn(vec3(w.mul(.6),7),2,2,.5).mul(F.RAKE_WOBBLE*Math.PI*2)),rake=sin(ph),gro=cos(ph);
  const rakeAO=float(1).sub(rake.mul(.5).add(.5).oneMinus().mul(F.RAKE_AO).mul(dirtR));
  let col=base.rgb.mul(even).mul(sheen).mul(wet).mul(rakeAO);
  /* normal: the old view-space normal plus world-space tilts carried into view space */
  const radial=w.div(max(rr,1e-3));
  let tilt=vec3(lean.x.mul(F.LEAN).mul(mown),0,lean.y.mul(F.LEAN).mul(mown)).add(vec3(radial.x,0,radial.y).mul(gro.mul(F.RAKE_TILT).mul(dirtR)));
  let rough=r0.mul(mix(float(1),float(F.WET_ROUGH),dirt));
  if(mapTex){
    /* ---- round 2: ragged grass edge with a lip ---- */
    const jit=vec2(fn(vec3(w.mul(F.EDGE_F1),11),2,2,.5),fn(vec3(w.mul(F.EDGE_F1),23),2,2,.5)).mul(.65)
      .add(vec2(fn(vec3(w.mul(F.EDGE_F2),31),1,2,.5),fn(vec3(w.mul(F.EDGE_F2),37),1,2,.5)).mul(.35)).mul(F.EDGE_JIT);
    const sJ=sampleAt(w.add(jit)),gJ=gOf(sJ);
    const tap=(r,dx,dz)=>sampleAt(w.add(vec2(dx*r,dz*r)));
    const t1=[tap(F.LIP_R1,1,0),tap(F.LIP_R1,-1,0),tap(F.LIP_R1,0,1),tap(F.LIP_R1,0,-1)],t2=[tap(F.LIP_R2,1,0),tap(F.LIP_R2,-1,0),tap(F.LIP_R2,0,1),tap(F.LIP_R2,0,-1)];
    const g1=t1.map(gOf),g2=t2.map(gOf),mx4=a=>max(max(a[0],a[1]),max(a[2],a[3])),mn4=a=>min(min(a[0],a[1]),min(a[2],a[3]));
    const near1=mx4(g1),near2=mx4(g2),far1=float(1).sub(mn4(g1));
    const gradG=vec2(g2[0].sub(g2[1]),g2[2].sub(g2[3])),gDir=gradG.div(max(length(gradG),1e-3));/* points toward the grass */
    const notChalk=float(1).sub(chalk),dirtSide=float(1).sub(gJ).mul(notChalk);
    const seam=near1.mul(dirtSide),ridge=clamp(near2.sub(near1),0,1).mul(dirtSide),turf=gJ.mul(far1);
    /* colour where the moved edge disagrees with the painted one: grass clumps over the dirt use the map's grass, gaps show its dirt */
    const swap=abs(gJ.sub(grass)).mul(notChalk),swapCol=sJ.rgb.mul(mix(float(.78),float(1).mul(even).mul(sheen),gJ)).mul(mix(wet,float(1),gJ));
    col=mix(col,swapCol,swap);
    col=col.mul(float(1).sub(seam.mul(F.LIP_SHADOW).mul(fn(vec3(w.mul(3),59),2,2,.5).mul(.3).add(.9)))).mul(float(1).add(ridge.mul(F.LIP_DRY))).mul(float(1).add(turf.mul(F.TURF_LIFT)));
    tilt=tilt.add(vec3(gDir.x,0,gDir.y).mul(ridge.mul(-F.LIP_TILT).add(turf.mul(-F.TURF_TILT))));
    rough=rough.mul(float(1).add(ridge.mul(.08)));
    /* ---- chalk with thickness and powder ---- */
    const jc=vec2(fn(vec3(w.mul(40),41),2,2,.5),fn(vec3(w.mul(40),43),2,2,.5)).mul(F.CHALK_JIT),cJ=cOf(sampleAt(w.add(jc)));
    const tc=(dx,dz)=>cOf(tap(F.CHALK_R,dx,dz)),gradC=vec2(tc(1,0).sub(tc(-1,0)),tc(0,1).sub(tc(0,-1)));/* points into the line */
    const dust=max(mx4(t1.map(cOf)),0).mul(float(1).sub(cJ)).mul(fn(vec3(w.mul(25),47),2,2,.5).mul(.5).add(.5)).mul(F.DUST);
    const grain=float(1).sub(fn(vec3(w.mul(70),53),2,2,.5).mul(.5).add(.5).mul(F.CHALK_GRAIN)),chalkCol=vec3(.86,.85,.82).mul(grain).mul(F.CHALK_LIFT);
    const lineIn=max(cJ,chalk);
    col=mix(col,chalkCol,max(cJ.sub(chalk),0));/* line grows where the jittered edge says so */
    col=mix(col,col.mul(grain).mul(F.CHALK_LIFT),chalk);/* painted line: grain, a touch brighter */
    col=mix(col,chalkCol,dust.mul(float(1).sub(lineIn)));
    tilt=tilt.add(vec3(gradC.x,0,gradC.y).mul(-F.CHALK_TILT).mul(max(lineIn,dust.mul(2))));
    rough=mix(rough,float(1),max(lineIn,dust));
  }
  m.colorNode=col;
  m.normalNode=normalize(n0.add(cameraViewMatrix.mul(vec4(tilt,0)).xyz));
  m.roughnessNode=rough;
  m.needsUpdate=true;
  const plane=new THREE.Mesh(old.geometry,m);plane.name='prop:field:plane';plane.position.copy(old.position);plane.rotation.copy(old.rotation);plane.scale.copy(old.scale);
  plane.receiveShadow=true;plane.renderOrder=old.renderOrder;
  const g=new THREE.Group();g.name='prop:field';g.add(plane);
  if(mapTex)try{g.add(buildBlades(mapTex,{sampleAt,gOf,comb,TSL}))}catch(e){console.warn('field blades off',e)}
  return g}

/* blades near the eye: SHELLS layers of a disc that follows the camera (snapped, so nothing swims: the blades live in world space) */
function buildBlades(mapTex,{sampleAt,gOf,comb,TSL}){const F=FIELD,{positionWorld,positionLocal,cameraPosition,vec2,vec3,float,floor,fract,length,sin,dot,max,min,mix,
    smoothstep,attribute,mod,clamp,step}=TSL;
  const geos=[];for(let i=0;i<F.SHELLS;i++){const p=new THREE.CircleGeometry(F.BLADE_DISC,48);p.rotateX(-Math.PI/2);const t=(i+1)/F.SHELLS;p.translate(0,t*F.SHELL_H,0);
    p.setAttribute('layer',new THREE.BufferAttribute(new Float32Array(p.attributes.position.count).fill(t),1));geos.push(p)}
  const geo=mergeSimple(geos);
  const m=new THREE.MeshStandardNodeMaterial({roughness:.8,metalness:0,alphaTest:.5,side:THREE.DoubleSide});m.name='prop:field:blades';
  const snap=v=>floor(v.div(F.BLADE_SNAP)).mul(F.BLADE_SNAP);
  m.positionNode=positionLocal.add(vec3(snap(cameraPosition.x),0,snap(cameraPosition.z)));
  const t=attribute('layer','float'),w=positionWorld.xz,s=sampleAt(w),grass=gOf(s),{lean,sheen,even}=comb(grass);
  /* the blade's root: this point moved back along the comb by the bend at this height (blades bend more toward the tip) */
  const root=w.sub(lean.mul(t.mul(t).mul(F.BLADE_BEND))),q=root.div(F.BLADE_C),cell=floor(q),f=fract(q);
  const h2=c=>fract(sin(dot(mod(c,289),vec2(127.1,311.7))).mul(43758.5453));
  const hA=h2(cell),hB=h2(cell.add(vec2(17.3,5.1))),hC=h2(cell.add(vec2(3.7,29.9)));
  const ctr=vec2(hA,hB).mul(.6).add(.2),d=length(f.sub(ctr)).mul(F.BLADE_C);
  const tall=hC.mul(.45).add(.55),dist=length(positionWorld.sub(cameraPosition));
  const r=clamp(float(1).sub(t.div(tall)),0,1).mul(F.BLADE_R).mul(float(1).sub(smoothstep(F.BLADE_F0,F.BLADE_F1,dist)));
  m.opacityNode=step(d,r).mul(step(.5,grass));
  const tint=vec3(float(1).add(hA.sub(.5).mul(F.BLADE_TINT*1.4)),float(1).add(hB.sub(.5).mul(F.BLADE_TINT)),float(1).add(hC.sub(.5).mul(F.BLADE_TINT*.6)));
  m.colorNode=s.rgb.mul(even).mul(sheen).mul(tint).mul(mix(float(1-F.BLADE_AO),float(1.08),t));
  const mesh=new THREE.Mesh(geo,m);mesh.name='prop:field:blades';mesh.frustumCulled=false;mesh.receiveShadow=true;mesh.castShadow=false;return mesh}

/* merge same-layout geometries (position, normal, uv, layer), indexed */
function mergeSimple(gs){const out=new THREE.BufferGeometry(),names=Object.keys(gs[0].attributes),idx=[];let off=0;
  for(const n of names){const sz=gs[0].attributes[n].itemSize,arr=new Float32Array(gs.reduce((s,g)=>s+g.attributes[n].count*sz,0));let o=0;for(const g of gs){arr.set(g.attributes[n].array,o);o+=g.attributes[n].array.length}out.setAttribute(n,new THREE.BufferAttribute(arr,sz))}
  for(const g of gs){for(const i of g.index.array)idx.push(i+off);off+=g.attributes.position.count}out.setIndex(idx);return out}

/* slot descriptor (#237): the field plane of game.js, same map, new light response */
export const PROPS=[{name:'field',build:c=>buildField(c),old:c=>c.old('field')}];
