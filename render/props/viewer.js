/* render/props/viewer.js: the place to look at one polished prop (#215, owner 11/22 09:54 「我可以去哪裡看模型」).
 * `?prop=<object>` (a name from PROPS in index.js): game.js imports this module only when the switch is in the URL, so the
 * default download does not grow. Once the park is warm (window.READY) it takes the renderer's loop over and draws that one object
 * alone on a neutral floor under the current park's light (hemisphere, key and fill copied from the park, the `max` sky light too),
 * drag to orbit, wheel or pinch to zoom, a list to switch objects, and a toggle old / new. The game does not run behind it.
 * Nothing here changes a prop: it calls the same build() and old() that mountProps calls. */
import * as THREE from 'three/webgpu';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {PROPS} from './index.js';

export const VIEW={FIELD:[0,-20],FOV:35,FLOOR_R:6,FLOOR_C:0x8a8d92,BG:0x5c6066,DIST:1.6,MIN_R:.4,READY_WAIT_MS:20000,SHADOW_PX:2048};
/* FIELD: a point on the infield (x, z), the side every prop shows to the cameras; FLOOR_R / DIST: floor radius and start distance in object radii; READY_WAIT_MS: a warm-up that never ends must not keep the viewer away */

/* world copy of an old mesh (or group) from the park: same geometry and materials, drawn where it stood */
function copyOld(o){o.updateWorldMatrix(true,true);const c=o.clone(true);o.matrixWorld.decompose(c.position,c.quaternion,c.scale);c.visible=true;
  c.traverse(m=>{m.visible=true});return c}

/* ctx from game.js: {name, renderer, scene, tier, max, dugout, park} (the mountProps ctx plus the name asked for and the renderer) */
export async function startViewer(ctx){
  await Promise.race([window.READY||Promise.resolve(),new Promise(ok=>setTimeout(ok,VIEW.READY_WAIT_MS))]);
  const R=ctx.renderer,cv=R.domElement,vs=new THREE.Scene();vs.background=new THREE.Color(VIEW.BG);
  vs.environment=ctx.scene.environment||null;
  if('environmentIntensity' in ctx.scene)vs.environmentIntensity=ctx.scene.environmentIntensity;
  const cam=new THREE.PerspectiveCamera(VIEW.FOV,innerWidth/innerHeight,.02,500);
  /* the park's lights, aimed at the origin with a shadow box fitted to the object */
  const lights=[];ctx.scene.traverse(o=>{if(o.isHemisphereLight||o.isAmbientLight)lights.push(o.clone());
    else if(o.isDirectionalLight){const L=o.clone();L.userData.dir=o.position.clone().sub(o.target.position).normalize();lights.push(L)}});
  for(const L of lights){vs.add(L);if(L.isDirectionalLight){vs.add(L.target);L.target.position.set(0,0,0);
    if(L.castShadow){L.shadow=L.shadow.clone();L.shadow.mapSize.set(VIEW.SHADOW_PX,VIEW.SHADOW_PX)}}}
  const floor=new THREE.Mesh(new THREE.CircleGeometry(1,96),new THREE.MeshStandardMaterial({color:VIEW.FLOOR_C,roughness:.92}));
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;vs.add(floor);
  const ctl=new OrbitControls(cam,cv);ctl.enableDamping=true;ctl.maxPolarAngle=Math.PI*.495;

  /* the UI: on top of the page, the game's own screens hidden behind the canvas */
  for(const el of [...document.body.children])if(el.tagName!=='SCRIPT')el.style.display='none';/* poster, buttons, #stage */
  document.body.appendChild(cv);cv.style.cssText+=';display:block;position:fixed;inset:0;width:100vw;height:100vh;z-index:9000;touch-action:none';
  const ui=document.createElement('div');ui.id='propView';
  ui.style.cssText='position:fixed;left:12px;top:12px;z-index:9001;display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:calc(100vw - 24px);'+
    'font:14px/1.3 system-ui,sans-serif;color:#fff;background:rgba(20,22,26,.72);padding:8px 10px;border-radius:10px';
  ui.innerHTML='<b>看模型</b><select id="pvSel"></select><button id="pvNew">新的</button><button id="pvOld">舊的</button><button id="pvHome">回到正面</button><span id="pvNote"></span>';
  document.body.appendChild(ui);const $=id=>ui.querySelector('#'+id);
  for(const P of PROPS){const op=document.createElement('option');op.value=op.textContent=P.name;$('pvSel').appendChild(op)}
  for(const b of ui.querySelectorAll('button'))b.style.cssText='font:inherit;padding:4px 10px;border-radius:7px;border:1px solid #fff4;background:#fff1;color:#fff;cursor:pointer';

  let cur=null,showOld=false;
  const mark=()=>{$('pvNew').style.background=showOld?'#fff1':'#3d7bd9';$('pvOld').style.background=showOld?'#3d7bd9':'#fff1'};
  function frame(){/* fit the floor, the shadow box and the camera to what is drawn now */
    const bb=new THREE.Box3();for(const o of [cur.g,cur.old])if(o)bb.expandByObject(o);/* both, so old / new keeps the camera still */
    if(bb.isEmpty())bb.setFromCenterAndSize(new THREE.Vector3(),new THREE.Vector3(1,1,1));
    const r=Math.max(VIEW.MIN_R,bb.getBoundingSphere(new THREE.Sphere()).radius);
    floor.scale.setScalar(r*VIEW.FLOOR_R);
    for(const L of lights)if(L.isDirectionalLight){L.position.copy(L.userData.dir).multiplyScalar(r*4);const c=L.shadow&&L.shadow.camera;
      if(c&&c.isOrthographicCamera){c.left=c.bottom=-r*1.2;c.right=c.top=r*1.2;c.near=r*.5;c.far=r*8;c.updateProjectionMatrix()}}
    ctl.target.set(0,bb.getCenter(new THREE.Vector3()).y,0);ctl.minDistance=r*.15;ctl.maxDistance=r*VIEW.FLOOR_R;return r}
  function home(){/* from the field side, a little to the right and above, as the park's cameras see it */const r=frame(),d=r*VIEW.DIST*1.8,a=cur.face+Math.PI/7;
    cam.position.set(Math.sin(a)*d,r*.7,Math.cos(a)*d).add(ctl.target);ctl.update()}
  function show(){if(!cur)return;cur.g.visible=!showOld;if(cur.old)cur.old.visible=showOld;mark();
    $('pvNote').textContent=showOld&&!cur.oldN?'舊的：沒有（這個物件以前不存在）':cur.err?'新的做不出來，看主控台':'';frame()}
  function pick(name){
    if(cur){vs.remove(cur.root)}
    const P=PROPS.find(p=>p.name===name)||PROPS[0];if(!P){$('pvNote').textContent='還沒有物件';return}
    $('pvSel').value=P.name;
    const root=new THREE.Group(),c={root,g:new THREE.Group(),old:new THREE.Group(),oldN:0,err:null};
    try{c.g=P.build(ctx)}catch(e){c.err=e;console.warn(`prop ${P.name}: build failed`,e)}
    try{for(const m of P.old(ctx)||[]){c.old.add(copyOld(m));c.oldN++}}catch(e){console.warn(`prop ${P.name}: old() failed`,e)}
    root.add(c.g,c.old);vs.add(root);
    /* stand it on the floor at the origin: the object keeps its park rotation, the viewer moves only the pair */
    const bb=new THREE.Box3().expandByObject(c.g.children.length?c.g:c.old),ctr=bb.isEmpty()?new THREE.Vector3():bb.getCenter(new THREE.Vector3());
    c.face=Math.atan2(VIEW.FIELD[0]-ctr.x,VIEW.FIELD[1]-ctr.z);
    root.position.set(-ctr.x,bb.isEmpty()?0:-bb.min.y,-ctr.z);root.updateMatrixWorld(true);
    if(c.g.userData.recolor)c.g.userData.recolor(ctx.park());
    cur=c;show();home();
    try{const u=new URL(location.href);u.searchParams.set('prop',P.name);history.replaceState(null,'',u)}catch(e){}}
  $('pvSel').onchange=e=>pick(e.target.value);
  $('pvNew').onclick=()=>{showOld=false;show()};$('pvOld').onclick=()=>{showOld=true;show()};$('pvHome').onclick=home;
  addEventListener('resize',()=>{cam.aspect=innerWidth/innerHeight;cam.updateProjectionMatrix()});
  pick(ctx.name);window.PROP_VIEW={pick,old:v=>{showOld=!!v;show()},cam,ctl,home};/* headless shots drive it from here */
  R.setAnimationLoop(()=>{ctl.update();R.render(vs,cam)});
  return window.PROP_VIEW}
