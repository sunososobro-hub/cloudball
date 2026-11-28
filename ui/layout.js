/* Layout editor, scorebug placement, 「看歷史」 toggle and phone landscape (#4): moved out of render/game.js, behaviour unchanged.
 * Classic script (play.html loads it before render/game.js). window.UILAYOUT({$, clamp, note}) wires the DOM once and returns
 * { bugPlace, applyLayout, editing }: game.js calls bugPlace() when the player bar or the scorebug changes size, applyLayout() once
 * at start, and editing() to ignore the settings button while the layout editor is open. */
window.UILAYOUT=function({$,clamp,note}){
/* the scorebug sits above the player bar (#47) while that is shown; bottom is in the bug's own zoomed pixels */
function bugPlace(){const bar=document.querySelector('.bar'),bug=$('bug');if(!bar||!bug)return;const pl=$('player'),z=parseFloat(getComputedStyle(bug).zoom)||1;
  const bh=pl&&!pl.hidden?Math.round((pl.offsetHeight+parseFloat(getComputedStyle(pl).bottom)+8)/z):20;if(!L.bug)bug.style.bottom=bh+'px';const top=bh+bug.offsetHeight+8;if(!L.feed)$('feed').style.bottom=top+'px';$('vote').style.bottom=top+'px'}
addEventListener('resize',bugPlace);
/* ---------- Layout editor: every UI element can be dragged and scaled; saved in this browser ---------- */
const LAYOUT_KEY='zu_layout',EDIT_ELS=[['bug','A1','比分面板'],['feed','A2','戰況列'],['who','A3','左上狀態'],['gear','A4','設定鈕'],['tag','A5','版本標'],['report','A6','回報鈕']];
const L={};let editing=false,selId='bug',ed=null;
try{const v=JSON.parse(localStorage.getItem(LAYOUT_KEY)||'{}');for(const k in v){const o=v[k];if(EDIT_ELS.some(x=>x[0]===k)&&o&&isFinite(o.x)&&isFinite(o.y)&&isFinite(o.s))L[k]={x:o.x,y:o.y,s:clamp(o.s,.5,2)}}}catch(e){}
const layoutSave=()=>{try{localStorage.setItem(LAYOUT_KEY,JSON.stringify(L))}catch(e){}};
function applyEl(id){const el=$(id),o=L[id];
  if(!o){el.style.left=el.style.top=el.style.right=el.style.bottom=el.style.transform=el.style.transformOrigin='';return}
  el.style.left=o.x+'px';el.style.top=o.y+'px';el.style.right='auto';el.style.bottom='auto';el.style.transformOrigin='top left';el.style.transform=o.s===1?'':`scale(${o.s})`}
function applyLayout(){for(const [id] of EDIT_ELS)applyEl(id);bugPlace()}
function pinEl(id){if(!L[id]){const r=$(id).getBoundingClientRect();L[id]={x:Math.round(r.left),y:Math.round(r.top),s:1}}}
const lbls=document.createElement('div');lbls.id='lbls';document.body.appendChild(lbls);
function drawLabels(){if(!editing){lbls.innerHTML='';return}
  lbls.innerHTML=EDIT_ELS.map(([id,c,n])=>{const r=$(id).getBoundingClientRect(),s=id===selId?' sel':'';return `<div class="bx${s}" style="left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px"></div><div class="lb${s}" style="left:${r.left}px;top:${Math.max(0,r.top-22)}px">${c} ${n}</div>`}).join('');
  const o=EDIT_ELS.find(x=>x[0]===selId);$('edTxt').textContent=`${o[1]} ${o[2]}・縮放 ${Math.round((L[selId]?L[selId].s:1)*100)}%`}
setInterval(drawLabels,150);
function scaleSel(d,id){id=id||selId;pinEl(id);L[id].s=Math.round(clamp(L[id].s+d,.5,2)*100)/100;applyEl(id);bugPlace();layoutSave();drawLabels()}
function setEditing(on){editing=on;document.body.classList.toggle('edit',on);$('edbar').hidden=!on;if(on){$('bar').classList.add('collapsed');$('gear').textContent='⚙ 設定'}drawLabels()}
for(const [id] of EDIT_ELS){const el=$(id);
  el.addEventListener('pointerdown',e=>{if(!editing)return;e.preventDefault();e.stopImmediatePropagation();selId=id;pinEl(id);applyEl(id);const r=el.getBoundingClientRect();ed={id,dx:e.clientX-r.left,dy:e.clientY-r.top,w:r.width,h:r.height};try{el.setPointerCapture(e.pointerId)}catch(err){}drawLabels()},true);
  el.addEventListener('pointermove',e=>{if(!ed||ed.id!==id)return;L[id].x=Math.round(clamp(e.clientX-ed.dx,0,Math.max(0,innerWidth-ed.w)));L[id].y=Math.round(clamp(e.clientY-ed.dy,0,Math.max(0,innerHeight-ed.h)));applyEl(id);bugPlace();drawLabels()});
  const end=()=>{if(ed&&ed.id===id){ed=null;layoutSave()}};el.addEventListener('pointerup',end);el.addEventListener('pointercancel',end);
  el.addEventListener('wheel',e=>{if(!editing)return;e.preventDefault();scaleSel(e.deltaY<0?.1:-.1,id)},{passive:false});
  el.addEventListener('click',e=>{if(editing){e.preventDefault();e.stopImmediatePropagation()}},true)}
let histOn=false;try{histOn=localStorage.getItem('zu_hist')==='1'}catch(e){}
const histApply=()=>{document.body.classList.toggle('hist',histOn);$('hist').setAttribute('aria-pressed',histOn)};histApply();
$('hist').onclick=()=>{histOn=!histOn;histApply();try{localStorage.setItem('zu_hist',histOn?'1':'0')}catch(e){}};
/* #629: scoreboard 顯示/隱藏, kept in this browser (default shown); hidden -> a 44px corner tag with the score brings it back */
let bugOn=true;try{bugOn=localStorage.getItem('zu_bug')!=='0'}catch(e){}
const bugTagText=()=>{const t=[0,1].map(i=>{const e=$('bt'+i),n=e&&e.querySelector('.tn'),c=e&&e.querySelector('.sc');return n&&c?n.textContent+' '+c.textContent:null});return t[0]&&t[1]?t.join(' : '):'記分板'};
const bugApply=()=>{document.body.classList.toggle('nobug',!bugOn);$('sbToggle').setAttribute('aria-pressed',bugOn);$('sbToggle').textContent='記分板：'+(bugOn?'顯示':'隱藏');$('bugTag').hidden=bugOn;if(!bugOn)$('bugTag').textContent=bugTagText()};
const bugSet=v=>{bugOn=v;bugApply();try{localStorage.setItem('zu_bug',v?'1':'0')}catch(e){}};
$('sbToggle').onclick=()=>bugSet(!bugOn);$('bugTag').onclick=()=>bugSet(true);
new MutationObserver(()=>{if(!bugOn)$('bugTag').textContent=bugTagText()}).observe($('bug'),{childList:true,subtree:true});bugApply();
$('editUI').onclick=()=>setEditing(true);$('edDone').onclick=()=>setEditing(false);
$('edMinus').onclick=()=>scaleSel(-.1);$('edPlus').onclick=()=>scaleSel(.1);
$('edOne').onclick=()=>{delete L[selId];applyEl(selId);bugPlace();layoutSave();drawLabels()};
$('edAll').onclick=()=>{for(const k in L)delete L[k];applyLayout();layoutSave();drawLabels()};
/* Phone landscape: fullscreen + orientation lock (works on Android Chrome; iPhone Safari cannot lock orientation, so tell the user to rotate) */
async function goLandscape(){const d=document,inFs=d.fullscreenElement||d.webkitFullscreenElement;
  if(inFs){try{screen.orientation&&screen.orientation.unlock&&screen.orientation.unlock()}catch(e){}(d.exitFullscreen||d.webkitExitFullscreen).call(d);$('land').textContent='⛶ 橫向';return}
  let ok=false;try{const el=d.documentElement;await (el.requestFullscreen||el.webkitRequestFullscreen).call(el);await screen.orientation.lock('landscape');ok=true;$('land').textContent='⤢ 離開'}catch(e){}
  if(!ok)note('這台不能自動轉：關掉螢幕旋轉鎖定，把手機轉橫就好')}
$('land').onclick=goLandscape;
/* #299: hint on the entry screen (one line + 橫向) and a dismissible chip while playing; shown on every visit, gone in landscape or on desktop */
{const mq=matchMedia('(pointer:coarse) and (orientation:portrait)'),LH=window.LANDHINT,line=$('landLine'),chip=$('landChip');let dismissed=false;
 const ios=/iP(hone|ad|od)/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 const inFs=()=>document.fullscreenElement||document.webkitFullscreenElement;
 const show=()=>{if(!LH||!line||!chip)return;if(!mq.matches)dismissed=false;const h=LH.decide({coarse:matchMedia('(pointer:coarse)').matches,portrait:matchMedia('(orientation:portrait)').matches,ios,intro:!$('intro').hidden,dismissed});
  line.hidden=!h.line;chip.hidden=!h.chip;line.firstChild.textContent=chip.firstChild.textContent=h.text;$('landGo').hidden=$('landChipGo').hidden=!h.button};
 $('landGo').onclick=$('landChipGo').onclick=goLandscape;$('landX').onclick=()=>{dismissed=true;show()};
 /* a tap that enters the game also asks for landscape fullscreen (only a tap may; Android Chrome) */
 for(const id of ['enter','enterHl','enterMute'])$(id).addEventListener('click',()=>{if(!ios&&mq.matches&&!inFs())goLandscape()});
 addEventListener('resize',show);addEventListener('orientationchange',show);mq.addEventListener&&mq.addEventListener('change',show);
 new MutationObserver(show).observe($('intro'),{attributes:true,attributeFilter:['hidden']});show()}
return {bugPlace,applyLayout,editing:()=>editing}};
