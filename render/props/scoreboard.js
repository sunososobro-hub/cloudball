/* render/props/scoreboard.js: the outfield scoreboard (#215 polish lane, round 1). Polish rounds edit only this file (and add to render/pbr.js).
 * game.js keeps drawing the score into its own face plane (canvas texture, untouched and always on). This prop replaces only the old
 * housing and leg (`old:scoreboard`): a deep steel cabinet with a bezel in the home trim colour, a sun hood and a cornice, an LED pixel
 * screen laid over the face, a grated catwalk with a rail under it, two lattice steel columns on concrete footings, cross beam and ladder.
 * Placement comes from the old meshes themselves (the box behind the face and the leg under it), so it stands exactly where they stood.
 * Local frame of the cabinet: origin at the face centre, +z toward home plate (the face's own facing), x along the face, y up the face. */
import * as THREE from 'three/webgpu';
import {mat,box,cyl} from '../pbr.js';

export const SB={W:26,H:10,BACK_Z:.35,/* face size and how far game.js set the old box behind it */
  CAB_D:1.8,CAB_M:.8,/* cabinet depth and margin around the face */BEZ_W:.42,BEZ_D:.26,HOOD_D:1.3,HOOD_TILT:.22,
  COL_X:8,COL_W:1.3,COL_BRACE:1.6,PIPE_R:.1,FOOT:2.4,FOOT_H:.6,
  WALK_Y:.55,WALK_D:1.1,RAIL_H:1.05,POST_GAP:2.6,
  LED_PITCH:.1,LED_PX:16,LED_EDGE:.65};/* LED pitch in metres, size of the one-LED tile, darkness of the gap between LEDs */

/* one LED: alpha 0 on the diode, rising to LED_EDGE in the gap. Mip levels average it out, so from home plate it is only a slight dimming */
function ledTex(px,edge){const c=document.createElement('canvas');c.width=c.height=px;const g=c.getContext('2d'),im=g.createImageData(px,px),d=im.data;
  for(let y=0;y<px;y++)for(let x=0;x<px;x++){const r=Math.hypot((x+.5)/px-.5,(y+.5)/px-.5)*2,a=Math.min(1,Math.max(0,(r-.55)/.35))*edge;const i=(y*px+x)*4;d[i]=d[i+1]=d[i+2]=a*255;d[i+3]=255}/* alphaMap reads the green channel */
  g.putImageData(im,0,0);const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t}

/* o: {old: [old meshes named old:scoreboard: the box behind the face first, then the leg], colors: {pad, trim}} -> THREE.Group */
export function buildScoreboard(o){const S=SB,[back]=o.old;if(!back)throw new Error('old:scoreboard not found');
  const g=new THREE.Group();g.name='prop:scoreboard';
  const cab=new THREE.Group();cab.quaternion.copy(back.quaternion);cab.position.copy(back.position);cab.translateZ(S.BACK_Z);g.add(cab);
  const add=(par,geo,m,x,y,z,rx=0,ry=0,rz=0)=>{const ms=new THREE.Mesh(geo,m);ms.position.set(x,y,z);ms.rotation.set(rx,ry,rz);ms.castShadow=ms.receiveShadow=true;par.add(ms);return ms};
  const steel=mat('paintedSteel',{color:0x343c4e}),dark=mat('paintedSteel',{color:0x1c2028,rough:.7}),galv=mat('galvSteel'),conc=mat('concrete'),
    grate=mat('galvSteel',{relief:'lattice',rough:.55}),deck=mat('paintedSteel',{relief:'ribbed',color:0x2e3546}),T=m=>m.userData.tileM;
  const trim=mat('paintedSteel',{relief:'plain',rough:.38}).clone();
  /* cabinet: housing behind the face, ribbed service panel on the back, cornice cap */
  const CW=S.W+2*S.CAB_M,CH=S.H+2*S.CAB_M,cz=-.05-S.CAB_D/2;
  add(cab,box(CW,CH,S.CAB_D,T(steel)),steel,0,0,cz);
  add(cab,box(CW-1,CH-1,.05,T(deck)),deck,0,0,cz-S.CAB_D/2-.025);
  add(cab,box(CW+.5,.35,S.CAB_D+.6,T(dark)),dark,0,CH/2+.17,cz+.15);
  /* bezel in the trim colour: four bars framing the face, standing proud of it */
  const bz=S.BEZ_D/2-.04,bw=S.BEZ_W;
  add(cab,box(S.W+2*bw,bw,S.BEZ_D,T(trim)),trim,0,S.H/2+bw/2,bz);add(cab,box(S.W+2*bw,bw,S.BEZ_D,T(trim)),trim,0,-S.H/2-bw/2,bz);
  for(const s of [-1,1])add(cab,box(bw,S.H,S.BEZ_D,T(trim)),trim,s*(S.W/2+bw/2),0,bz);
  /* sun hood over the face: a sloped steel lip with its brackets */
  add(cab,box(CW,.1,S.HOOD_D,T(steel)),steel,0,CH/2-.25,S.HOOD_D/2-.1,S.HOOD_TILT);
  for(let i=0;i<=6;i++)add(cab,box(.08,.5,S.HOOD_D*.9,T(dark)),dark,-CW/2+.2+(CW-.4)*i/6,CH/2-.45,S.HOOD_D*.45-.1,S.HOOD_TILT);
  /* LED screen over the face: a pixel grid in front of the canvas game.js draws (that plane stays as it is) */
  const led=ledTex(S.LED_PX,S.LED_EDGE);led.repeat.set(S.W/S.LED_PITCH,S.H/S.LED_PITCH);
  const ledM=new THREE.MeshBasicMaterial({color:0x000000,alphaMap:led,transparent:true,depthWrite:false,toneMapped:false});
  const scr=new THREE.Mesh(new THREE.PlaneGeometry(S.W,S.H),ledM);scr.position.z=.012;cab.add(scr);
  /* catwalk under the face: grated deck on brackets, posts and two rails */
  const wy=-CH/2-S.WALK_Y,wz=S.WALK_D/2;
  add(cab,box(CW,.06,S.WALK_D,T(grate)),grate,0,wy,wz);
  for(let i=0;i<=8;i++){const x=-CW/2+.3+(CW-.6)*i/8;add(cab,box(.08,.08,S.WALK_D+.2,T(dark)),dark,x,wy-.07,wz-.1);
    add(cab,box(.06,S.WALK_Y+.1,.06,T(dark)),dark,x,wy+S.WALK_Y/2,-.03)}
  const n=Math.round(CW/S.POST_GAP);for(let i=0;i<=n;i++)add(cab,cyl(.025,.025,S.RAIL_H,8,T(galv)),galv,-CW/2+CW*i/n,wy+S.RAIL_H/2,S.WALK_D-.04);
  for(const h of [S.RAIL_H,S.RAIL_H*.5])add(cab,cyl(.03,.03,CW,10,T(galv)),galv,0,wy+h,S.WALK_D-.04,0,0,Math.PI/2);
  /* columns: world-vertical lattice towers on footings under the cabinet's centre line, a cross beam, a ladder on one column */
  g.updateMatrixWorld(true);const fwd=new THREE.Vector3(0,0,1).applyQuaternion(cab.quaternion);fwd.y=0;fwd.normalize();
  const base=new THREE.Vector3(0,-CH/2,cz).applyMatrix4(cab.matrixWorld),top=base.y-.1;
  const legs=new THREE.Group();legs.position.set(base.x,0,base.z);legs.rotation.y=Math.atan2(fwd.x,fwd.z);g.add(legs);
  const W=S.COL_W,h0=S.FOOT_H,ch=top-h0;
  for(const s of [-1,1]){const x0=s*S.COL_X;add(legs,box(S.FOOT,S.FOOT_H,S.FOOT,T(conc)),conc,x0,S.FOOT_H/2,0);
    for(const a of [-1,1])for(const b of [-1,1])add(legs,cyl(S.PIPE_R,S.PIPE_R,ch,10,T(steel)),steel,x0+a*W/2,h0+ch/2,b*W/2);
    const nb=Math.floor(ch/S.COL_BRACE),dg=Math.hypot(W,S.COL_BRACE),ang=Math.atan2(W,S.COL_BRACE);
    for(let k=0;k<=nb;k++){const y=h0+Math.min(ch-.05,k*S.COL_BRACE);
      for(const b of [-1,1]){add(legs,box(W,.07,.07,T(steel)),steel,x0,y,b*W/2);add(legs,box(.07,.07,W,T(steel)),steel,x0+b*W/2,y,0)}
      if(k<nb)for(const b of [-1,1]){const yc=y+S.COL_BRACE/2;add(legs,box(.05,dg,.05,T(steel)),steel,x0,yc,b*W/2,0,0,(k%2?1:-1)*ang);
        add(legs,box(.05,dg,.05,T(steel)),steel,x0+b*W/2,yc,0,(k%2?-1:1)*ang,0,0)}}}
  add(legs,box(2*S.COL_X+W+1,.7,.9,T(steel)),steel,0,top-.35,0);
  const lx=-S.COL_X-W/2-.45,lz=W/2+.1;for(const d of [-.22,.22])add(legs,cyl(.025,.025,top,8,T(galv)),galv,lx+d,top/2,lz);
  for(let y=.4;y<top;y+=.3)add(legs,cyl(.015,.015,.44,6,T(galv)),galv,lx,y,lz,0,0,Math.PI/2);
  g.userData.recolor=P=>{if(P)trim.color.set(P.trim)};g.userData.recolor(o.colors);
  return g}
