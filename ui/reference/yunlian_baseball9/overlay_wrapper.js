/* ================= 7xbs · 九宮格棒球 (#724 = #399 棒球部分；#762 併入大棒球場) =================
   so 哥 11/08: the 「九宮格棒球 3D」 prototype (docs/design/baseball_9grid/index.html, three.js r128 one-pager) goes into the game.
   #762 (so 哥 11/08): no separate batting cage — the game lives in the 港口運動公園 baseball field (7xzs SPK_BB, BIG_ON only).
     Nothing is built here any more (no cage / sign / bench / colliders / chunk / place name); the play action shows at the field's
     home plate (SPK_BB.hx/hz, BB9_REACH m), so there is exactly one baseball spot.
   Play: stand at home plate -> action 「打九宮格棒球」 -> a full-screen overlay (#bb9) runs the prototype unchanged in
     rules / AI / physics / 3D field (3 innings vs the computer); ✕ / 離開球場 closes it and the player is exactly where they stood
     (the player is never moved; busy holds the body while it is open). Reopening resumes the game in progress.
   THREE: the game's own global THREE (r128, shell.html) is used — no second download. The overlay has its own canvas / WebGL context,
     created on the first visit only (bb9_game builds the DOM + scene once, the loop runs only while the overlay is open), and while it is
     open the main scene is not rendered (wrappers on renderer.render and YL.farLayer.render, installed on the first visit; pass-through when closed).
   Score: local only (save.bb9: games / wins / losses / draws / bestRuns / last), no backend, no analytics event.
   No lights, no shared rnd() (the prototype's own Math.random only drives the ball game). Strings are local (zh, like 7xg's night games).
   Own names bb9_ / BB9_. Dev / tests: YL.bb9 (open / close / status / game / home). Test: tests/baseball9.js */

const BB9_VER=2;
const BB9_REACH=3;                               // m from the field's home plate: the play action shows
const BB9_DPR_MAX=2, BB9_HALF_WAIT_S=1.3;        // overlay pixel ratio cap; s between half-innings (the prototype's setTimeout 1300)
const BB9_Z=60;                                  // overlay z-index (7xg night games use 48)
const BB9_TXT={play:'打九宮格棒球',mark:'九宮格棒球（本壘）'};
const bb9={on:false,warned:{},game:null,el:null,wrapped:false,opens:0};

function bb9_warn(k,e){if(bb9.warned[k])return;bb9.warned[k]=1;try{console.warn('[7xbs_baseball9] '+k,e||'');}catch(_){}}
function bb9_try(f){try{return f();}catch(e){bb9_warn('try',e);return null;}}
// the field's home plate (7xzs loads after this file: read at call time, through YL.sportsPark)
function bb9_home(){const P=typeof YL!=='undefined'&&YL.sportsPark;if(!P||!P.on||!P.bb)return null;return{x:P.bb.hx,z:P.bb.hz};}
function bb9_site(){return typeof BIG_ON!=='undefined'&&!!BIG_ON&&!!bb9_home();}   // the 港口運動公園 pad exists only on the big island (7xzs spk_on)

/* ---------- local record (save.bb9) ---------- */
function bb9_rec(){const s=(typeof save!=='undefined'&&save)?(save.bb9||(save.bb9={})):{};
  for(const k of['games','wins','losses','draws','bestRuns'])if(typeof s[k]!=='number')s[k]=0;return s;}
function bb9_record(me,cpu,st){const s=bb9_rec();s.games++;if(me>cpu)s.wins++;else if(me<cpu)s.losses++;else s.draws++;
  s.bestRuns=Math.max(s.bestRuns,me|0);s.last={me:me|0,cpu:cpu|0,h:st?st.h|0:0,hr:st?st.hr|0:0,d:bb9_try(()=>typeof ec_day==='function'?ec_day():'')||''};
  bb9_try(()=>persist());}

/* ---------- action: step up to the field's home plate ---------- */
function bb9_near(x,z){const h=bb9_site()&&bb9_home();return!!h&&Math.hypot(x-h.x,z-h.z)<BB9_REACH;}
YL.actionProviders.push((x,z,list)=>{if(list.length>=MAX_ACTIONS||!bb9_near(x,z))return null;return{k:'bb9_play',label:BB9_TXT.play};});
YL.glyph.bb9_play='球';
YL.handlers.bb9_play=()=>bb9_open();
if(YL.mapMarks)YL.mapMarks.push(()=>{const h=bb9_site()&&bb9_home();return h?[{id:'mk:bb9',name:BB9_TXT.mark,x:h.x,z:h.z}]:[];});

/* ---------- overlay: open / close ---------- */
// while open the main scene is not drawn (the overlay covers it): one pass-through wrapper on the main renderer, installed on the first visit
// (90_main draws through YL.farLayer.render when 7c4 is there, which calls the raw renderer itself: both entry points are wrapped)
function bb9_wrapMain(){if(bb9.wrapped)return;bb9.wrapped=true;
  bb9_try(()=>{if(typeof renderer!=='undefined'&&renderer&&typeof renderer.render==='function'){const raw=renderer.render;
    renderer.render=function(s,c){if(bb9.on)return;return raw.apply(this,arguments);};}});
  bb9_try(()=>{const F=YL.farLayer;if(F&&typeof F.render==='function'){const raw=F.render;F.render=function(r,s,c){if(bb9.on)return;return raw.apply(this,arguments);};}});}
function bb9_ui(){if(bb9.el)return bb9.el;
  const st=document.createElement('style');st.textContent=BB9_CSS;(document.head||document.body).appendChild(st);
  const el=document.createElement('div');el.id='bb9';el.hidden=true;el.innerHTML=BB9_HTML;document.body.appendChild(el);bb9.el=el;
  addEventListener('keydown',e=>{if(bb9.on&&e.code==='Escape')bb9_close();});return el;}
function bb9_open(){if(bb9.on||!bb9_site())return false;if(typeof busy!=='undefined'&&busy)return false;
  if(typeof THREE==='undefined'){bb9_warn('no THREE');return false;}
  try{bb9_ui();if(!bb9.game)bb9.game=bb9_game();}catch(e){bb9_warn('open',e);return false;}
  bb9_wrapMain();bb9.on=true;bb9.opens++;busy=true;bb9.el.hidden=false;bb9.game.start();return true;}
function bb9_close(){if(!bb9.on)return false;bb9.on=false;if(bb9.game)bb9.game.stop();if(bb9.el)bb9.el.hidden=true;busy=false;
  bb9_try(()=>{if(typeof cv!=='undefined'&&cv&&cv.focus)cv.focus();});return true;}

// #763: a trailing runner may not pass the runner ahead (limit = base index the lead runner holds, 4 = home); home takes any number of runners.
// The old check capped the lead runner at third when limit was 4 (home), so a bases-loaded hit never scored.
function bb9_clampTo(to,limit){return limit<4&&to>=limit?limit-1:Math.min(to,4);}
YL.bb9={clampTo:bb9_clampTo,open:bb9_open,close:bb9_close,game:()=>bb9.game,home:bb9_home,reach:BB9_REACH,near:bb9_near,
  rec:bb9_rec,ver:BB9_VER,status:()=>({on:bb9.on,opens:bb9.opens,site:bb9_site(),wrapped:bb9.wrapped,
    phase:bb9.game?bb9.game.S().phase:null,score:bb9.game?bb9.game.S().score.slice():null,rec:Object.assign({},bb9_rec())})};

/* ---------- the prototype (docs/design/baseball_9grid/index.html), DOM ids prefixed bb9-, CSS scoped under #bb9 ---------- */
const BB9_CSS="#bb9{--bg:#0b1d18; --panel:#10302a; --panel2:#174238; --line:rgba(220,255,240,.14); --fg:#f1fbf5; --muted:#9fc2b4; --amber:#ffb53d; --hot:#ff5b48; --cold:#4f9bff; --blue:#4f9bff; --red:#ff5b48; --ok:#5fe36a; --num:'Barlow Condensed','Arial Narrow',sans-serif; --body:'Noto Sans TC',system-ui,sans-serif; color-scheme:dark;}#bb9{position:fixed;inset:0;z-index:60;overflow:auto;-webkit-overflow-scrolling:touch;margin:0;background:var(--bg);color:var(--fg);font-family:var(--body);-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}#bb9 #bb9-app{max-width:520px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr);gap:7px;padding-block:6px 16px;padding-left:max(10px,env(safe-area-inset-left,0px));padding-right:max(10px,env(safe-area-inset-right,0px))}#bb9 #bb9-sb{display:flex;align-items:center;gap:10px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:700 14px/1 var(--num);letter-spacing:.04em}#bb9 #bb9-sb .tm{display:flex;align-items:center;gap:6px}#bb9 #bb9-sb .tm i{width:8px;height:8px;border-radius:50%;display:block}#bb9 #bb9-sb .rn{font:800 24px/1 var(--num);color:var(--amber);font-variant-numeric:tabular-nums}#bb9 #bb9-inn{margin-left:auto;color:var(--muted);font-size:15px}#bb9 #bb9-outs{display:flex;gap:4px;align-items:center;color:var(--muted)}#bb9 #bb9-outs b{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.15);display:block}#bb9 #bb9-outs b.on{background:var(--red)}#bb9 #bb9-view{position:relative;height:min(58vh,520px);min-height:330px;border-radius:10px;overflow:hidden;background:#0d1b2a;touch-action:none}#bb9 #bb9-cv{position:absolute;inset:0;width:100%;height:100%;display:block}#bb9 #bb9-zone{position:absolute;display:grid;grid-template-columns:.55fr 1fr 1fr 1fr .55fr;grid-template-rows:.55fr 1fr 1fr 1fr .55fr;gap:2px;pointer-events:none}#bb9 #bb9-zone .c{border-radius:4px;position:relative;pointer-events:auto;cursor:pointer;border:2px solid transparent;background:transparent;padding:0;font:700 10px/1 var(--body);color:#fff}#bb9 #bb9-zone .c.k{background:rgba(255,255,255,.14);box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}#bb9 #bb9-zone .c.k.hot{background:rgba(255,91,72,.42)}#bb9 #bb9-zone .c.k.cold{background:rgba(79,155,255,.4)}#bb9 #bb9-zone .c.o{border:1px dashed rgba(255,255,255,.25)}#bb9 #bb9-zone .c.dim{pointer-events:none;opacity:.25}#bb9 #bb9-zone .c.sel{background:rgba(255,181,61,.78)!important;border:3px solid #ffe2a6;box-shadow:0 0 12px rgba(255,181,61,.9);color:#2a1a00}#bb9 #bb9-zone .c.g{border:3px dashed #fff;background:rgba(255,255,255,.35)!important}#bb9 #bb9-zone .c.pitch::after{content:\"\";position:absolute;left:50%;top:50%;width:52%;max-width:26px;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;background:#fff;box-shadow:0 0 0 3px rgba(0,0,0,.4),0 0 14px #fff}#bb9 #bb9-zone .c span{position:absolute;left:4px;top:3px;opacity:.9}#bb9 #bb9-zone.off{display:none}#bb9 .hud{position:absolute;pointer-events:none;font:800 13px/1 var(--num);letter-spacing:.06em}#bb9 #bb9-cnt{left:8px;top:8px;background:rgba(6,16,12,.75);border-radius:8px;padding:7px 9px;display:flex;gap:9px;align-items:center}#bb9 #bb9-cnt .bso{display:grid;gap:5px}#bb9 #bb9-cnt .bso div{display:flex;gap:4px;align-items:center}#bb9 #bb9-cnt i{width:10px;height:10px;border-radius:50%;background:rgba(255,255,255,.18);display:block}#bb9 #bb9-cnt i.b{background:var(--ok)}#bb9 #bb9-cnt i.s{background:var(--amber)}#bb9 #bb9-cnt i.o.on{background:var(--red)}#bb9 #bb9-tag{right:8px;top:8px;background:rgba(6,16,12,.72);border-radius:6px;padding:6px 9px;font:900 13px/1.2 var(--body);text-align:right}#bb9 #bb9-tag small{display:block;font:700 11px/1.3 var(--body);color:var(--muted)}#bb9 #bb9-banner{left:0;right:0;top:40%;text-align:center;font:900 clamp(28px,8vw,44px)/1.1 var(--body);text-shadow:0 3px 14px rgba(0,0,0,.8);opacity:0;transition:opacity .2s;padding-inline:12px}#bb9 #bb9-zone .c .n{position:absolute;right:3px;bottom:3px;font:800 12px/1 var(--num);font-style:normal;background:rgba(10,20,16,.82);color:var(--amber);border-radius:9px;padding:2px 6px}#bb9 #bb9-zone .c.o .n{right:50%;bottom:50%;transform:translate(50%,50%)}#bb9 #bb9-zone .c.last{box-shadow:inset 0 0 0 3px #fff,0 0 10px rgba(255,255,255,.7)}#bb9 #bb9-zone .c.last::before{content:\"上一球\";position:absolute;left:50%;top:-14px;transform:translateX(-50%);font:700 10px/1 var(--body);color:#fff;text-shadow:0 1px 3px #000;white-space:nowrap}#bb9 #bb9-recent{left:8px;right:8px;bottom:8px;background:rgba(6,16,12,.72);border-radius:6px;padding:6px 9px;font:700 12px/1.4 var(--body);letter-spacing:.02em}#bb9 #bb9-recent:empty{display:none}#bb9 #bb9-recent b{color:var(--amber);margin-right:6px}#bb9 #bb9-coachHint{left:8px;right:8px;bottom:8px;text-align:center;background:rgba(6,16,12,.75);border-radius:6px;padding:7px;font:700 12px/1.4 var(--body);display:none}#bb9 #bb9-match{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:7px}#bb9 .pl{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:6px 9px;min-width:0}#bb9 .pl small{font-size:11px;color:var(--muted)}#bb9 .pl b{font-size:15px;margin-left:4px}#bb9 .pl div{font-size:11px;color:var(--amber);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#bb9 .pl.r{text-align:right}#bb9 #bb9-stam{height:5px;border-radius:3px;background:rgba(255,255,255,.12);margin-top:5px;overflow:hidden}#bb9 #bb9-stam b{display:block;height:100%;background:var(--ok)}#bb9 #bb9-timer{height:5px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}#bb9 #bb9-timer b{display:block;height:100%;background:var(--amber);transform-origin:left}#bb9 #bb9-ctl{display:grid;gap:6px}#bb9 .lab{font-size:11px;color:var(--muted);letter-spacing:.08em}#bb9 .chips{display:grid;gap:5px}#bb9 .chip{appearance:none;border:1px solid var(--line);background:var(--panel);color:var(--fg);border-radius:6px;padding:7px 2px;font:700 13px/1.15 var(--body);cursor:pointer;min-width:0}#bb9 .chip small{display:block;font-size:10px;color:var(--muted);font-weight:500;margin-top:2px}#bb9 .chip.on{background:var(--panel2);border-color:var(--amber);color:var(--amber)}#bb9 .chip:disabled{opacity:.35;cursor:default}#bb9 .chip:focus-visible,#bb9 .go:focus-visible{outline:3px solid var(--fg);outline-offset:1px}#bb9 .go{appearance:none;border:0;border-radius:8px;background:var(--amber);color:#2a1a00;font:900 18px/1 var(--body);letter-spacing:.1em;padding:13px;cursor:pointer;width:100%}#bb9 .go:disabled{opacity:.4;cursor:default}#bb9 .go.alt{background:var(--panel2);color:var(--fg);border:1px solid var(--line);font-size:14px;letter-spacing:.04em}#bb9 .row2{display:grid;grid-template-columns:1fr 1fr;gap:6px}#bb9 #bb9-hint{font-size:12px;color:var(--muted);line-height:1.5}#bb9 #bb9-read{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:8px 10px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center}#bb9 #bb9-mini{display:grid;grid-template-columns:repeat(5,13px);grid-template-rows:repeat(5,13px);gap:2px}#bb9 #bb9-mini i{border-radius:2px;display:block}#bb9 #bb9-readTxt{font-size:12px;color:var(--muted);line-height:1.55}#bb9 #bb9-readTxt b{color:var(--fg)}#bb9 #bb9-log{font-size:12px;color:var(--muted);line-height:1.5}#bb9 .ov{position:fixed;inset:0;z-index:20;display:grid;place-items:center;background:rgba(5,15,12,.86);padding:16px max(16px,env(safe-area-inset-right,0px)) 16px max(16px,env(safe-area-inset-left,0px));overflow:auto}#bb9 .box{max-width:440px;width:100%;background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:20px;display:grid;gap:12px}#bb9 .box h1{margin:0;font:900 32px/1.1 var(--body)}#bb9 .box h1 em{font-style:normal;color:var(--amber)}#bb9 .box p,#bb9 .box li{margin:0;color:var(--muted);font-size:13.5px;line-height:1.6}#bb9 .box ul{margin:0;padding-left:18px;display:grid;gap:4px}#bb9 .box b{color:var(--fg)}#bb9 .final{font:800 64px/1 var(--num);text-align:center;font-variant-numeric:tabular-nums}@media (prefers-reduced-motion:reduce){#bb9 #bb9-banner{transition:none}}#bb9[hidden]{display:none!important}#bb9 [hidden]{display:none!important}#bb9 #bb9-x{position:fixed;top:calc(8px + env(safe-area-inset-top,0px));right:10px;z-index:30;min-width:44px;min-height:44px;border:0;border-radius:22px;background:rgba(6,16,12,.75);color:var(--fg);font-size:20px;cursor:pointer}";
const BB9_HTML="<button id=\"bb9-x\" type=\"button\" aria-label=\"離開\">✕</button><div id=\"bb9-app\"><div id=\"bb9-sb\"><span class=\"tm\"><i style=\"background:var(--blue)\"></i>藍鯨（你）<span class=\"rn\" id=\"bb9-r0\">0</span></span><span class=\"tm\"><i style=\"background:var(--red)\"></i>紅隼<span class=\"rn\" id=\"bb9-r1\">0</span></span><span id=\"bb9-inn\">1 上</span></div><div id=\"bb9-view\"><canvas id=\"bb9-cv\" aria-label=\"3D 球場\"></canvas><div id=\"bb9-zone\"></div><div id=\"bb9-cnt\" class=\"hud\"><svg id=\"bb9-bases\" width=\"54\" height=\"40\" viewBox=\"0 0 46 34\" aria-label=\"壘包\"><rect id=\"bb9-b2\" x=\"17\" y=\"3\" width=\"12\" height=\"12\" transform=\"rotate(45 23 9)\"/><rect id=\"bb9-b3\" x=\"3\" y=\"17\" width=\"12\" height=\"12\" transform=\"rotate(45 9 23)\"/><rect id=\"bb9-b1\" x=\"31\" y=\"17\" width=\"12\" height=\"12\" transform=\"rotate(45 37 23)\"/></svg><div class=\"bso\"><div>B <i></i><i></i><i></i></div><div>S <i></i><i></i></div><div>O <i class=\"o\"></i><i class=\"o\"></i></div></div></div><div id=\"bb9-tag\" class=\"hud\"></div><div id=\"bb9-banner\" class=\"hud\"></div><div id=\"bb9-recent\" class=\"hud\"></div><div id=\"bb9-coachHint\" class=\"hud\">拖曳守備員到你要的位置（投手、捕手固定），或點下方快捷佈陣</div></div><div id=\"bb9-timer\"><b id=\"bb9-timerb\"></b></div><div id=\"bb9-match\"><div class=\"pl\"><small>打者</small><b id=\"bb9-batN\">—</b><div id=\"bb9-batT\"></div></div><div class=\"pl r\"><small>投手</small><b id=\"bb9-pitN\">—</b><div id=\"bb9-pitT\"></div><div id=\"bb9-stam\"><b id=\"bb9-stamb\"></b></div></div></div><div id=\"bb9-ctl\"></div><div id=\"bb9-hint\"></div><div id=\"bb9-read\"><div id=\"bb9-mini\"></div><div id=\"bb9-readTxt\"></div></div><div id=\"bb9-log\"></div></div><div id=\"bb9-menu\" class=\"ov\"><div class=\"box\"><h1>九宮格<em>棒球</em></h1><p>投打一樣是同時暗選九宮格，但球打出去之後，是不是安打由守備員站在哪決定。你攻的時候讀對方佈陣挑打法，守的時候當教練擺陣。</p><ul><li><b>投球</b>：點一格（外圍是壞球，紅熱藍冷），選球種。全力速球、曲球、變速球比較難打，但吃體力，體力見底全部變好打。</li><li><b>守備</b>：快捷佈陣一鍵全隊跑位，也能進「手動擺陣」直接拖人。每半局開始可以沿用或重擺。</li><li><b>打擊</b>：打法決定球往哪飛（拉打往左、推打往右），看對方空檔打。猜 1 格賭長打、3 格打安打、四格護航；壘上有人可盜壘。</li><li><b>規則</b>：打 3 局、每半局 3 出局，半局最多 6 分。平手延長一局，二壘有人開始。</li></ul><p id=\"bb9-rec\" style=\"text-align:center;color:var(--amber)\"></p><button class=\"go\" id=\"bb9-start\" type=\"button\">開賽</button><button class=\"go alt\" id=\"bb9-leave\" type=\"button\">離開球場</button></div></div><div id=\"bb9-end\" class=\"ov\" hidden><div class=\"box\"><p style=\"text-align:center;font-weight:700;color:var(--amber);letter-spacing:.2em\">比賽結束</p><div class=\"final\"><span style=\"color:var(--blue)\" id=\"bb9-f0\">0</span> : <span style=\"color:var(--red)\" id=\"bb9-f1\">0</span></div><p id=\"bb9-verdict\" style=\"text-align:center\"></p><button class=\"go\" id=\"bb9-again\" type=\"button\">再打一場</button><button class=\"go alt\" id=\"bb9-leave2\" type=\"button\">離開球場</button></div></div>";
// Changes from the prototype: ids / $ prefixed, own renderer guarded for headless tests, the half-inning pause runs on game time, the loop
// runs only while the overlay is open (start / stop), the ctl click handler is act(a, v), finish() writes save.bb9, the menu shows the record.
function bb9_game(){
  /* ================= rules, data, AI and play physics (no DOM) ================= */
  const INNINGS=3,OUTS=3,HALF_RUNS=6,PICK_T=15,STAMINA=100;
  const rand=(a,b)=>a+Math.random()*(b-a),clamp=(v,a,b)=>v<a?a:v>b?b:v;
  function pick(ws){let t=ws.reduce((a,b)=>a+b.w,0)*Math.random();for(const o of ws){t-=o.w;if(t<=0)return o;}return ws[ws.length-1];}
  const TYPES={
    hi:{n:'高球殺手',h:[1,1,1,0,0,0,-1,-1,-1]},lo:{n:'低球專家',h:[-1,-1,-1,0,0,0,1,1,1]},
    pull:{n:'內角拉打',h:[1,0,-1,1,0,-1,1,0,-1]},push:{n:'外角推打',h:[-1,0,1,-1,0,1,-1,0,1]},
    mid:{n:'中路重砲',h:[-1,0,-1,0,1,0,-1,0,-1]},diag:{n:'對角線',h:[1,0,-1,0,1,0,-1,0,1]}};
  const TEAMS=[
    {name:'藍鯨',pitcher:'穩穩企鵝',pk:'penguin',lineup:[
      {n:'快腿兔',t:'pull',con:.06,pow:0,spd:3,k:'rabbit'},{n:'小飛貓',t:'lo',con:.04,pow:1,spd:3,k:'cat'},
      {n:'大砲熊',t:'mid',con:-.03,pow:3,spd:1,k:'bear'},{n:'鐵牛',t:'hi',con:0,pow:2,spd:1,k:'ox'},
      {n:'左手狗',t:'push',con:.05,pow:1,spd:2,k:'dog'},{n:'二刀狐',t:'diag',con:.01,pow:1,spd:2,k:'fox'}]},
    {name:'紅隼',pitcher:'火球狐',pk:'fox',lineup:[
      {n:'跑跑鼠',t:'push',con:.06,pow:0,spd:3,k:'mouse'},{n:'阿肥貓',t:'pull',con:.03,pow:1,spd:2,k:'cat'},
      {n:'大炮豬',t:'mid',con:-.03,pow:3,spd:1,k:'pig'},{n:'鐵臂猴',t:'lo',con:0,pow:2,spd:2,k:'monkey'},
      {n:'兩光虎',t:'hi',con:-.01,pow:2,spd:1,k:'tiger'},{n:'一刀狗',t:'diag',con:.02,pow:1,spd:2,k:'dog'}]}];
  const APP={pull:'拉打',mid:'順打',push:'推打',bunt:'觸擊'};
  const MODE={one:'精準',row:'橫排',col:'直列',box:'四格',take:'不揮',bunt:'觸擊'};
  const PT={fb:{n:'直球',cost:1,q:0,miss:0,v:36},heat:{n:'全力速球',cost:4,q:-.15,miss:.08,v:42,whiff:.15},
    curve:{n:'曲球',cost:3,q:-.05,miss:.04,v:30,la:-9,chase:.2},change:{n:'變速球',cost:2,q:0,oneQ:-.28,miss:.02,v:28,la:10}};
  const inZ=(r,c)=>r>0&&r<4&&c>0&&c<4, sIdx=(r,c)=>(r-1)*3+(c-1);
  
  /* field geometry, metres: home (0,0), +z toward centre field, +x toward first base */
  const BASES=[[0,0],[19.4,19.4],[0,38.8],[-19.4,19.4],[0,0]];
  const fenceR=phi=>88+20*Math.cos(phi*2);
  const FNAME=['投手','捕手','一壘手','二壘手','游擊手','三壘手','左外野','中外野','右外野'];
  const FSPD=[4.6,4.2,5.2,5.4,5.4,5.2,5.8,6,5.8];
  const POS_N=[[0,18.4],[0,-1.3],[16,27],[9,37],[-9,37],[-16,27],[-30,76],[0,90],[30,76]];
  const PRESETS={
    N:{n:'正常',f:()=>POS_N.map(p=>p.slice())},
    L:{n:'拉打偏移',f:()=>POS_N.map((p,i)=>i<2?p.slice():i<6?[p[0]-(i===2?3:8),p[1]]:[p[0]-13,p[1]])},
    R:{n:'推打偏移',f:()=>POS_N.map((p,i)=>i<2?p.slice():i<6?[p[0]+(i===5?3:8),p[1]]:[p[0]+13,p[1]])},
    BUNT:{n:'防觸擊',f:()=>{const P=POS_N.map(p=>p.slice());P[2]=[11,12];P[5]=[-11,12];P[3]=[13,28];P[4]=[-5,33];return P;}},
    IN:{n:'內野前進',f:()=>{const P=POS_N.map(p=>p.slice());P[2]=[15,22];P[5]=[-15,22];P[3]=[8,28];P[4]=[-8,28];return P;}},
    DEEP:{n:'外野後退',f:()=>POS_N.map((p,i)=>i>=6?[p[0]*1.05,p[1]+7]:p.slice())},
  };
  const RS=s=>[0,8.6,9.4,10.6][s];
  
  let S;
  function fresh(){return{half:0,score:[0,0],outs:0,balls:0,strikes:0,bases:[null,null,null],halfRuns:0,ord:[0,0],
    pitchHist:[[],[]],guessHist:[[],[]],appHist:[[],[]],stamina:[STAMINA,STAMINA],pauses:[2,1],streak:0,extra:false,phase:'menu',pickT:PICK_T,
    app:'mid',aiApp:'mid',def:[PRESETS.N.f(),PRESETS.N.f()],defName:['正常','正常'],
    my:{cell:null,mode:'row',steal:false,hold:false,pt:'fb'},ai:null,log:[],line:[[0,0,0],[0,0,0]],
    stats:[{pa:0,ab:0,h:0,hr:0,bb:0,k:0,tb:0,sb:0,cs:0},{pa:0,ab:0,h:0,hr:0,bb:0,k:0,tb:0,sb:0,cs:0}]};}
  const batTeam=()=>S.half%2===0?0:1,pitTeam=()=>1-batTeam(),userBats=()=>batTeam()===0;
  function batter(){const t=TEAMS[batTeam()],b=t.lineup[S.ord[batTeam()]%t.lineup.length];return{name:b.n,type:TYPES[b.t],con:b.con,pow:b.pow,spd:b.spd,kind:b.k,tkey:b.t};}
  function stealer(){const b=S.bases;if(b[1]&&!b[2])return{from:1,r:b[1]};if(b[0]&&!b[1])return{from:0,r:b[0]};return null;}
  const curApp=()=>batTeam()===0?S.app:S.aiApp;
  function guessSet(mode,r,c){if(mode==='take'||mode==='bunt'||r==null)return[];const R=clamp(r,1,3)-1,C=clamp(c,1,3)-1;
    if(mode==='one')return[[R,C]];if(mode==='row')return[0,1,2].map(k=>[R,k]);if(mode==='col')return[0,1,2].map(k=>[k,C]);
    const r0=Math.min(R,1),c0=Math.min(C,1);return[[r0,c0],[r0,c0+1],[r0+1,c0],[r0+1,c0+1]];}
  
  /* ---------- AI ---------- */
  function aiApproach(){const b=batter(),on=S.bases[0]||S.bases[1];
    if(on&&S.outs===0&&b.pow<=1&&Math.random()<.3)return'bunt';if(!on&&b.spd===3&&Math.random()<.08)return'bunt';
    const w=b.tkey==='pull'?[.55,.3,.15]:b.tkey==='push'?[.15,.3,.55]:[.25,.5,.25];
    return pick([{a:'pull',w:w[0]},{a:'mid',w:w[1]},{a:'push',w:w[2]}]).a;}
  function aiDefense(){const h=S.appHist[0].slice(-6),c={pull:0,mid:0,push:0,bunt:0};for(const a of h)c[a]++;const b=batter(),on=S.bases[0]||S.bases[1];
    const k=pick([{s:'N',w:2.2},{s:'L',w:.3+c.pull*.45},{s:'R',w:.3+c.push*.45},{s:'BUNT',w:.1+c.bunt*.6+(on&&S.outs===0&&b.pow<=1?.5:0)},{s:'IN',w:S.bases[2]&&S.outs<2?.8:.05},{s:'DEEP',w:b.pow>=2?.6:.1}]).s;
    return k;}
  function aiPitch(){const h=batter().type.h;const g=Array(9).fill(0);for(const set of S.guessHist[0].slice(-12))for(const[r,c]of set)g[r*3+c]++;const gm=Math.max(1,...g);
    const opts=[];for(let r=0;r<5;r++)for(let c=0;c<5;c++){let w;
      if(inZ(r,c)){const i=sIdx(r,c);w=h[i]>0?.45:h[i]<0?1.7:1;if(r===2&&c===2)w*=.75;w/=1+1.3*g[i]/gm;if(S.balls===3)w*=r===2||c===2?1.6:1.2;}
      else{if((r===0||r===4)&&(c===0||c===4))w=.08;else w=.55;if(S.strikes===2)w*=2;if(S.balls===3)w*=.15;}
      opts.push({r,c,w});}
    const st=stealer(),sta=S.stamina[pitTeam()];const oneRate=S.guessHist[0].slice(-8).filter(s=>s.length===1).length;
    const types=[{p:'fb',w:2},{p:'heat',w:sta>30?(S.strikes===2?1.4:.5):0},{p:'curve',w:sta>20?(S.strikes===2?1.2:.6):0},{p:'change',w:sta>12?.5+oneRate*.3:0}];
    return Object.assign(pick(opts),{pt:pick(types).p,hold:!!(st&&st.r.spd>=2&&Math.random()<.55)});}
  function aiSwing(){const st=stealer();const steal=!!(st&&S.balls<3&&Math.random()<(st.r.spd===3?.3:st.r.spd===2?.1:.02));
    if(S.aiApp==='bunt')return{mode:Math.random()<.85?'bunt':'take',set:[],steal:false};
    const f=Array(25).fill(1);for(const p of S.pitchHist[0].slice(-14))f[p.r*5+p.c]+=2.2;const h=batter().type.h;
    const take=S.balls===3&&S.strikes<2?.5:S.balls+S.strikes===0?.2:S.strikes===2?.05:.1;if(Math.random()<take)return{mode:'take',set:[],steal};
    const modes=S.strikes===2?[['box',.55],['row',.18],['col',.18],['one',.09]]:[['one',.22],['row',.28],['col',.27],['box',.23]];
    const mode=pick(modes.map(m=>({m:m[0],w:m[1]}))).m;const opts=[];
    for(let r=1;r<4;r++)for(let c=1;c<4;c++){const set=guessSet(mode,r,c);let sc=0;for(const[R,C]of set)sc+=f[(R+1)*5+C+1]*(1+.25*h[R*3+C]);opts.push({set,w:Math.pow(sc,2.2)});}
    return{mode,set:pick(opts).set,steal};}
  
  /* ---------- one pitch: location, contact quality ---------- */
  const BASE_Q={one:1.1,row:.92,col:.92,box:.8},FOUL_ADJ=.46,WEAK_ADJ=.36;
  function resolve(p,sw,ptk,hold){const pt=PT[ptk],tired=S.stamina[pitTeam()]<25;
    let r=p.r,c=p.c,missed=false;
    if(inZ(r,c)){const corner=(r!==2)&&(c!==2),edge=!corner&&(r!==2||c!==2);const miss=(corner?.16:edge?.05:.0)+(hold?.06:0)+pt.miss+(tired?.08:0);
      if(Math.random()<miss){missed=true;if(corner){Math.random()<.5?r+=r<2?-1:1:c+=c<2?-1:1;}else if(r!==2)r+=r<2?-1:1;else if(c!==2)c+=c<2?-1:1;else r+=1;}}
    const pitch={r,c},zoneOk=inZ(r,c),b=batter(),out={pitch,missed,kind:'',q:0,pt:ptk};
    if(sw.mode==='take'){out.kind=zoneOk?'called':'ball';return out;}
    if(sw.mode==='bunt'){if(zoneOk){out.kind=Math.random()<(r===1?.65:.85)?(Math.random()<(r===1?.22:.05)?'popup':'bunt'):'foulBunt';}else out.kind=Math.random()<.5?'foulBunt':'whiff';return out;}
    const set=sw.set,covered=zoneOk&&set.some(([R,C])=>R===r-1&&C===c-1);
    const adj=set.some(([R,C])=>Math.max(Math.abs(R+1-r),Math.abs(C+1-c))===1);
    const app=curApp();
    if(covered){let q=BASE_Q[sw.mode]+b.type.h[sIdx(r,c)]*.3+b.con+rand(-.25,.25)+pt.q+(sw.mode==='one'&&pt.oneQ?pt.oneQ:0)+(tired?.12:0);
      if(app==='pull')q+=c===1?.1:c===3?-.08:0;if(app==='push')q+=c===3?.1:c===1?-.08:0;out.q=q;out.kind='contact';out.box=sw.mode==='box';return out;}
    if(zoneOk){const bx=sw.mode==='box'?.2:0,wh=pt.whiff||0;
      if(adj){const x=Math.random();if(x<FOUL_ADJ+bx-wh){out.kind='foul';return out;}if(x<FOUL_ADJ+bx-wh+WEAK_ADJ){out.kind='contact';out.q=rand(.45,.85)+b.con+pt.q*.5;return out;}}
      out.kind=S.strikes===2&&Math.random()<.55+bx-wh?'foul':'whiff';return out;}
    const ch=pt.chase||0;
    if(adj){const x=Math.random();if(x<.4+ch){out.kind='whiff';return out;}if(x<.68+ch*.5){out.kind='contact';out.q=rand(.3,.65);return out;}out.kind='ball';return out;}
    if(Math.random()<.85-ch){out.kind='ball';return out;}out.kind='whiff';return out;}
  
  /* ---------- batted ball physics ---------- */
  const G=9.8,KD=.0042,DT=1/30;
  function launch(q,app,ptk,bunt,pow){const pt=PT[ptk];let v,la;
    if(bunt){v=rand(5,8.5);la=rand(-14,-2);}
    else if(q>=1.08){v=rand(43,47)+pow*.8;la=rand(22,32);}
    else if(q>=.9){v=rand(39,45)+pow*.5;la=rand(10,24);}
    else if(q>=.72){v=rand(30,38);la=Math.random()<.5?rand(4,16):rand(16,26);}
    else if(q>=.5){if(Math.random()<.55){v=rand(24,33);la=rand(-6,8);}else{v=rand(26,33);la=rand(32,52);}}
    else{if(Math.random()<.6){v=rand(16,25);la=rand(-12,4);}else{v=rand(20,28);la=rand(55,70);}}
    if(!bunt)la+=pt.la||0;
    let spray=app==='pull'?rand(-40,-4):app==='push'?rand(4,40):rand(-30,30);if(bunt)spray=rand(-28,28);
    return{v,la,spray};}
  function flight(v,la,spray){const a=spray*Math.PI/180,e=la*Math.PI/180;let x=0,y=.9,z=.6,vx=v*Math.cos(e)*Math.sin(a),vz=v*Math.cos(e)*Math.cos(a),vy=v*Math.sin(e);
    const pts=[];let t=0,bounced=false,hr=false;
    for(let i=0;i<30*14;i++){pts.push({t,x,y,z,air:!bounced});
      const sp=Math.hypot(vx,vy,vz);if(y>0||vy>0){vx-=KD*sp*vx*DT;vz-=KD*sp*vz*DT;vy-=(G+KD*sp*vy)*DT;}
      x+=vx*DT;y+=vy*DT;z+=vz*DT;t+=DT;
      if(y<=0){y=0;bounced=true;if(Math.abs(vy)>2.5){vy=-vy*.35;vx*=.62;vz*=.62;}else{vy=0;const hs=Math.hypot(vx,vz),ns=Math.max(0,hs-6.5*DT);if(hs>0){vx*=ns/hs;vz*=ns/hs;}}}
      const d=Math.hypot(x,z),phi=Math.atan2(x,z),R=fenceR(phi);
      if(d>R){if(y>3&&!bounced){hr=true;pts.push({t,x,y,z,air:true});break;}const s=(R-.3)/d;x*=s;z*=s;vx*=-.25;vz*=-.25;bounced=true;}
      if(y===0&&vy===0&&Math.hypot(vx,vz)<.25){pts.push({t,x,y,z,air:false});break;}}
    return{pts,hr};}
  function fieldIt(pts,F){let best=null;
    for(let f=0;f<9;f++){const P=F[f],react=f===1?.2:.45,reach=f<=1?1:1.2,sp=FSPD[f];
      for(const p of pts){if(p.y>2.7||p.t<react)continue;const d=Math.hypot(p.x-P[0],p.z-P[1])-reach;if(d<=sp*(p.t-react)){if(!best||p.t<best.t)best={f,t:p.t,air:p.air,x:p.x,z:p.z};break;}}}
    return best;}
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const THR=27;
  
  /* play: returns script for the renderer and the new state */
  function play(q,ptk,bunt){const b=batter(),app=curApp(),F=S.def[pitTeam()];
    const L=launch(q,app,ptk,bunt,b.pow);const fl=flight(L.v,L.la,L.spray);
    const sc={ball:[],fielders:{},runners:[],throws:[],dur:0,txt:'',kind:''};const bases=S.bases.slice();
    const runners=[{from:-1,spd:b.spd,name:b.name,kind:b.kind,bat:true}];for(let i=0;i<3;i++)if(bases[i])runners.push({from:i,spd:bases[i].spd,name:bases[i].name,kind:bases[i].kind});
    let outs=0,runs=0,nb=[null,null,null];const res=r=>({spd:r.spd,name:r.name});
    const path=(r,to,outAt)=>{// running path from base r.from+1 to base 'to' (index in BASES)
      const st=r.bat?.45:Math.max(0,.15-lead),v=RS(r.spd);const pts=[{t:0,x:BASES[r.from+1][0],z:BASES[r.from+1][1]}];let t=st;pts.push({t,x:pts[0].x,z:pts[0].z});
      for(let k=r.from+1;k<to;k++){const A=BASES[k],B=BASES[k+1];t+=27.4/v+(k>r.from+1?.1:0);pts.push({t,x:B[0],z:B[1]});}
      if(outAt!=null){const last=pts[pts.length-1];last.t=Math.min(last.t,outAt+.15);const prev=pts[pts.length-2];const f=clamp((outAt-prev.t)/(last.t-prev.t+1e-6),0,1);}
      sc.runners.push({name:r.name,kind:r.kind,bat:!!r.bat,pts,out:outAt!=null,outT:outAt});return t;};
    const lead=S.outs===OUTS-1?1.1:.6;const arrive=(r,to)=>{const v=RS(r.spd);let t=r.bat?.45:.15-lead;for(let k=r.from+1;k<to;k++)t+=27.4/v+(k>r.from+1?.1:0);return t;};
    const fieldPath=(f,x,z,t)=>{const P=F[f];sc.fielders[f]=[{t:0,x:P[0],z:P[1]},{t:f===1?.15:.3,x:P[0],z:P[1]},{t,x,z}];};
    if(fl.hr){sc.ball=fl.pts;for(const r of runners){path(r,4);runs++;}sc.kind='HR';sc.txt='全壘打！！';sc.dur=Math.max(fl.pts[fl.pts.length-1].t+1.2,4);
      for(const f of[6,7,8])fieldPath(f,F[f][0]*.7+fl.pts[fl.pts.length-1].x*.3,F[f][1]*.7+fl.pts[fl.pts.length-1].z*.3,2.5);
      return finishPlay(sc,outs,runs,[null,null,null],'HR');}
    const fb=fieldIt(fl.pts,F);
    if(!fb){// ball died where nobody reached it: treat as reached by nearest outfielder late
      const last=fl.pts[fl.pts.length-1];let bf=6,bd=1e9;for(let f=2;f<9;f++){const d=dist(F[f],[last.x,last.z]);if(d<bd){bd=d;bf=f;}}
      Object.assign(fl,{});const t=.3+bd/FSPD[bf];return hitPlay(sc,fl.pts,{f:bf,t:Math.max(t,last.t),air:false,x:last.x,z:last.z},runners,bases,F,arrive,path,fieldPath);}
    if(fb.air){// caught
      sc.ball=fl.pts.filter(p=>p.t<=fb.t);fieldPath(fb.f,fb.x,fb.z,fb.t);outs=1;const depth=Math.hypot(fb.x,fb.z);
      sc.kind=fb.t<1.2&&depth<45?'line':'fly';sc.txt=depth<35?(L.la>45?'內野小飛球':'平飛球被沒收'):`${FNAME[fb.f]}接殺`;
      if(bunt){sc.txt='觸擊小飛球被接殺';sc.kind='bunt';}
      // tag-ups
      nb=bases.slice();
      if(bases[2]&&S.outs+1<OUTS&&depth>50){const tr=fb.t+.3+27.4/RS(bases[2].spd),tt=fb.t+.55+dist([fb.x,fb.z],BASES[0])/THR;
        if(tr<tt){runs++;nb[2]=null;path({from:2,spd:bases[2].spd,name:bases[2].name,kind:bases[2].kind},4);sc.txt+='・高飛犧牲打';sc.throws.push({t0:fb.t+.5,from:[fb.x,fb.z],to:BASES[0],dur:dist([fb.x,fb.z],BASES[0])/THR});}}
      if(bases[1]&&!nb[2]&&S.outs+1<OUTS&&depth>70&&bases[1].spd>=2&&Math.random()<.6){nb[2]=nb[1];nb[1]=null;}
      sc.runners.push({name:b.name,kind:b.kind,bat:true,pts:[{t:0,x:0,z:0},{t:.45,x:0,z:0},{t:fb.t+.2,x:BASES[1][0]*Math.min(1,(fb.t-.45)*RS(b.spd)/27.4),z:BASES[1][1]*Math.min(1,(fb.t-.45)*RS(b.spd)/27.4)}],out:true,outT:fb.t});
      sc.dur=Math.max(fb.t+1.6,3);return finishPlay(sc,outs,runs,nb,sc.kind);}
    return hitPlay(sc,fl.pts,fb,runners,bases,F,arrive,path,fieldPath,bunt);}
  function hitPlay(sc,pts,fb,runners,bases,F,arrive,path,fieldPath,bunt){
    let outs=0,runs=0;const nb=[null,null,null],P=[fb.x,fb.z],tc=fb.t;
    sc.ball=pts.filter(p=>p.t<=tc);fieldPath(fb.f,fb.x,fb.z,tc);const infield=Math.hypot(fb.x,fb.z)<44;
    const batR=runners[0],others=runners.slice(1).sort((a,b)=>b.from-a.from);const thr=(to,t0)=>t0+.45+dist(P,BASES[to])/THR;
    const forced=i=>{for(let k=0;k<=i;k++)if(!bases[k])return false;return true;};
    if(infield){const tb1=arrive(batR,1);
      // double play chance
      if(bases[0]&&S.outs<OUTS-1&&!bunt){const r1=runners.find(r=>r.from===0);const t2=thr(2,tc);if(t2<arrive(r1,2)){const t21=t2+.35+27.4*1.414/THR;
        if(t21<tb1){outs=2;path(r1,2,t2);path(batR,1,t21);sc.throws.push({t0:tc+.45,from:P,to:BASES[2],dur:t2-tc-.45},{t0:t2+.35,from:BASES[2],to:BASES[1],dur:27.4*1.414/THR});
          for(const r of others)if(r.from>0){if(forced(r.from)||r.from===2&&S.outs+2<OUTS){const to=r.from+2;if(to>=4){runs++;path(r,4);}else{nb[to-1]=r;path(r,to);}}else{nb[r.from]=r;}}
          sc.txt='雙殺！';sc.kind='ground';fieldPath(3,BASES[2][0]+.6,BASES[2][1]-.4,t2);sc.dur=t21+1.4;return finishPlay(sc,outs,S.outs+2>=OUTS?0:runs,nb.map(x=>x&&{spd:x.spd,name:x.name,kind:x.kind}),'ground');}}}
      const t1=fb.f===2?tc+dist(P,BASES[1])/7:thr(1,tc);
      if(fb.f!==2)fieldPath(2,BASES[1][0]-.6,BASES[1][1]-.4,Math.min(t1,2.5));
      sc.throws.push({t0:fb.f===2?t1:tc+.45,from:P,to:BASES[1],dur:fb.f===2?0:t1-tc-.45});
      if(t1<tb1-.05){outs=1;path(batR,1,t1);
        for(const r of others){if(forced(r.from)){const to=r.from+2;if(to>=4){runs++;path(r,4);}else{nb[to-1]=r;path(r,to);}}
          else if(r.from===2&&S.outs+1<OUTS&&fb.x>0&&Math.random()<.5){runs++;path(r,4);}else{nb[r.from]=r;path(r,r.from+1);}}
        sc.txt=bunt?(bases.some(x=>x)?'犧牲觸擊成功':'觸擊被刺殺'):'滾地球出局';sc.kind=bunt?'bunt':'ground';}
      else{nb[0]=batR;path(batR,1);for(const r of others){const to=r.from+2;if(to>=4){runs++;path(r,4);}else{nb[to-1]=r;path(r,to);}}
        sc.txt=bunt?'觸擊安打！':'內野安打！';sc.kind='1B';sc.hit=true;}
      sc.dur=Math.max(t1,tb1)+1.4;return finishPlay(sc,outs,runs,nb.map(x=>x&&{spd:x.spd,name:x.name,kind:x.kind}),sc.kind);}
    // outfield hit: each runner takes as many bases as he safely can (lead runner first)
    let limit=4,maxT=0;sc.hit=true;
    for(const r of others){let to=r.from+2;while(to<4&&to<limit-0&&arrive(r,to+1)+.35<thr(to+1,tc))to++;to=bb9_clampTo(to,limit);if(to>=4){runs++;const t=path(r,4);maxT=Math.max(maxT,t);limit=4;}else{nb[to-1]=r;const t=path(r,to);maxT=Math.max(maxT,t);limit=to;}}
    let bt=1;while(bt<3&&bt+1<limit&&arrive(batR,bt+1)+.35<thr(bt+1,tc))bt++;nb[bt-1]=batR;maxT=Math.max(maxT,path(batR,bt));
    const tgt=Math.min(bt+1,3);sc.throws.push({t0:tc+.45,from:P,to:BASES[tgt],dur:dist(P,BASES[tgt])/THR});
    sc.kind=['','1B','2B','3B'][bt];sc.txt=['','一壘安打','二壘安打！','三壘安打！'][bt];sc.dur=Math.max(maxT,tc+1)+1.2;
    return finishPlay(sc,0,runs,nb.map(x=>x&&{spd:x.spd,name:x.name,kind:x.kind}),sc.kind);}
  function finishPlay(sc,outs,runs,nb,kind){return{sc,outs,runs,nb,kind};}
  
  /* ---------- apply one pitch ---------- */
  function applyPitch(res,sw,hold){const b=batter(),st=S.stats[batTeam()],ln=S.line[batTeam()];
    const out={txt:'',paEnd:false,hit:false,play:null,steal:null};S.prevBases=S.bases.slice();
    const stealTry=sw.steal&&stealer(),k=res.kind;
    const strikeOut=()=>{S.outs++;out.paEnd=true;st.k++;st.pa++;st.ab++;};
    if(k==='contact'||k==='bunt'||k==='popup'){
      const q=k==='contact'?res.q:k==='popup'?.2:.4;const P=play(k==='popup'?.3:q,res.pt,k!=='contact');
      if(k==='popup'){P.outs=1;P.runs=0;P.nb=S.bases.slice();P.sc.txt='觸擊小飛球被接殺';}
      // box protection: a weak out becomes a foul instead
      if(res.box&&P.outs>0&&P.sc.kind!=='HR'&&q<.62&&Math.random()<.5){if(S.strikes<2)S.strikes++;out.txt='四格護航，打成界外';out.foulPlay=true;return finishPitch(out);}
      st.pa++;const sac=k==='bunt'&&P.outs===1&&S.bases.some(x=>x)&&P.sc.kind==='bunt';if(!sac)st.ab++;
      S.outs+=P.outs;S.bases=P.nb;out.play=P.sc;out.txt=P.sc.txt;out.paEnd=true;
      if(P.sc.hit||P.kind==='HR'){out.hit=true;st.h++;ln[1]++;const tb={HR:4,'3B':3,'2B':2,'1B':1}[P.kind]||1;st.tb+=tb;if(P.kind==='HR')st.hr++;}
      return finishPitch(out,P.runs);}
    if(k==='ball')S.balls++,out.txt=res.missed?'失投・壞球':'壞球';
    else if(k==='called')S.strikes++,out.txt='好球（站著看）';
    else if(k==='whiff')S.strikes++,out.txt=sw.mode==='bunt'?'觸擊沒碰到':'揮空！';
    else if(k==='foul'){if(S.strikes<2)S.strikes++;out.txt='界外球';}
    else if(k==='foulBunt')S.strikes++,out.txt='觸擊界外';
    if(stealTry&&k!=='foul'&&k!=='foulBunt'){const sr=stealTry,p=[0,.55,.72,.88][sr.r.spd]-(hold?.22:0)-(sr.from===1?.08:0);
      out.steal={from:sr.from,ok:Math.random()<p};
      if(out.steal.ok){S.bases[sr.from+1]=sr.r;S.bases[sr.from]=null;out.txt+=` · 盜${sr.from===0?'二':'三'}壘成功`;st.sb++;}
      else{S.bases[sr.from]=null;S.outs++;out.txt+=' · 盜壘失敗出局';st.cs++;}}
    let runs=0;
    if(S.balls>=4){const bat={spd:b.spd,name:b.name,kind:b.kind},bs=S.bases;if(bs[0]){if(bs[1]){if(bs[2])runs++;bs[2]=bs[1];}bs[1]=bs[0];}bs[0]=bat;out.txt='四壞保送';out.paEnd=true;st.bb++;st.pa++;}
    else if(S.strikes>=3){strikeOut();out.txt=k==='called'?'站著被三振':k==='foulBunt'?'觸擊界外，三振':'揮棒落空三振';}
    return finishPitch(out,runs);}
  function finishPitch(out,runs=0){
    if(runs){const room=HALF_RUNS-S.halfRuns,got=Math.min(runs,room);S.score[batTeam()]+=got;S.halfRuns+=got;S.line[batTeam()][0]+=0;out.txt+=got<runs?'（本半局達上限）':` · 得 ${got} 分`;out.runs=got;}
    S.streak=out.hit?S.streak+1:out.paEnd?0:S.streak;
    if(out.paEnd){S.ord[batTeam()]++;S.balls=0;S.strikes=0;}
    return out;}
  
  /* ================= 3D scene ================= */
  const $=id=>document.getElementById('bb9-'+id);
  const view=$('view'),cv=$('cv');
  const rend=new THREE.WebGLRenderer({canvas:cv,antialias:true});   // its own canvas / context, made on the first visit only (the main THREE is shared, not downloaded again)
  rend.setPixelRatio(Math.min((typeof devicePixelRatio!=='undefined'&&devicePixelRatio)||1,BB9_DPR_MAX));if(rend.shadowMap){rend.shadowMap.enabled=true;rend.shadowMap.type=THREE.PCFSoftShadowMap;}
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0d1b2a);scene.fog=new THREE.Fog(0x0d1b2a,150,280);
  const cam=new THREE.PerspectiveCamera(42,1,.1,600);
  function resize(){const w=view.clientWidth,h=view.clientHeight;if(!w||!h)return;rend.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();}
  addEventListener('resize',()=>{if(on)resize();});
  const V=(x,y,z)=>new THREE.Vector3(-x,y,z); // core (x,z) -> world, mirrored so first base sits on the right from home plate
  scene.add(new THREE.HemisphereLight(0xd6e6ff,0x2c4a2c,.85));
  const sun=new THREE.DirectionalLight(0xffffff,.85);sun.position.set(-30,70,-25);sun.target.position.set(0,0,45);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-80,right:80,top:80,bottom:-80,near:10,far:200});scene.add(sun,sun.target);
  const M={};const mat=(c,o={})=>{const k=c+JSON.stringify(o);return M[k]||(M[k]=new THREE.MeshStandardMaterial(Object.assign({color:c,roughness:.8},o)));};
  function mesh(geo,m,x,y,z,shadow=true){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.castShadow=shadow;o.receiveShadow=true;return o;}
  
  /* field */
  (function buildField(){
    const grass=mesh(new THREE.CircleGeometry(160,72),mat(0x3d9c4a),0,0,40,false);grass.rotation.x=-Math.PI/2;scene.add(grass);
    for(let i=0;i<9;i++){const s=mesh(new THREE.CircleGeometry(150-i*14,72,-Math.PI*.75,Math.PI*.5),mat(i%2?0x3d9c4a:0x46a853),0,.005+i*.001,0,false);s.rotation.x=-Math.PI/2;scene.add(s);}
    const dirt=mesh(new THREE.CircleGeometry(29,48,-Math.PI*.75,Math.PI*.5),mat(0xc28a57),0,.02,0,false);dirt.rotation.x=-Math.PI/2;scene.add(dirt);
    const ig=mesh(new THREE.PlaneGeometry(23.5,23.5),mat(0x46a853),0,.03,19.4,false);ig.rotation.x=-Math.PI/2;ig.rotation.z=Math.PI/4;scene.add(ig);
    const hc=mesh(new THREE.CircleGeometry(4,32),mat(0xc28a57),0,.035,0,false);hc.rotation.x=-Math.PI/2;scene.add(hc);
    scene.add(mesh(new THREE.CylinderGeometry(2.6,3,.25,24),mat(0xc28a57),0,.12,18.4));
    scene.add(mesh(new THREE.BoxGeometry(.6,.05,.15),mat(0xffffff),0,.26,18.4));
    for(let i=1;i<4;i++){const b=BASES[i];scene.add(mesh(new THREE.BoxGeometry(.55,.1,.55),mat(0xffffff),-b[0],.07,b[1]));}
    const hp=mesh(new THREE.CylinderGeometry(.33,.33,.04,5),mat(0xffffff),0,.05,.15,false);hp.rotation.y=Math.PI/2;scene.add(hp);
    for(const s of[-1,1]){const l=mesh(new THREE.BoxGeometry(.12,.02,118),mat(0xffffff),0,.04,0,false);l.position.set(-s*Math.sin(Math.PI/4)*59,.04,Math.cos(Math.PI/4)*59);l.rotation.y=-s*Math.PI/4;scene.add(l);}
    const crowd=(()=>{const c=document.createElement('canvas');c.width=256;c.height=64;const g=c.getContext('2d');g.fillStyle='#1a2236';g.fillRect(0,0,256,64);const cols=['#4f9bff','#ff5b48','#e8eaf0','#ffb53d','#9fd'];for(let i=0;i<700;i++){g.fillStyle=cols[i%5];g.globalAlpha=.55;g.fillRect(Math.random()*256,Math.random()*64,2,3);}const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;})();
    const step=3*Math.PI/180;for(let a=-Math.PI/4-step;a<Math.PI/4+step;a+=step){const r1=fenceR(a),r2=fenceR(a+step),p1=[Math.sin(a)*r1,Math.cos(a)*r1],p2=[Math.sin(a+step)*r2,Math.cos(a+step)*r2];
      const mx=(p1[0]+p2[0])/2,mz=(p1[1]+p2[1])/2,len=Math.hypot(p2[0]-p1[0],p2[1]-p1[1])+.1,ang=Math.atan2(-(p2[0]-p1[0]),p2[1]-p1[1]);
      const w=mesh(new THREE.BoxGeometry(.4,3,len),mat(0x1f5f3d),-mx,1.5,mz);w.rotation.y=ang;scene.add(w);
      const top=mesh(new THREE.BoxGeometry(.45,.15,len),mat(0xffc84a),-mx,3.05,mz,false);top.rotation.y=ang;scene.add(top);
      const tex=crowd.clone();tex.needsUpdate=true;tex.repeat.set(1,2);
      const grp=new THREE.Group();grp.position.set(-(Math.sin(a+step/2)*(r1+11)),6,Math.cos(a+step/2)*(r1+11));grp.rotation.y=ang;const sm=new THREE.Mesh(new THREE.BoxGeometry(16,.6,len+.2),new THREE.MeshStandardMaterial({map:tex,roughness:1}));sm.rotation.z=.5;grp.add(sm);scene.add(grp);}
    const bs=mesh(new THREE.BoxGeometry(30,7,.5),mat(0x1a2236),0,3.5,-9);scene.add(bs);
  })();
  
  /* characters */
  const AN={rabbit:{f:0xf2ede6,e:'long'},bear:{f:0xa6774f,e:'round'},cat:{f:0xf2b35e,e:'tri'},dog:{f:0xd8ae7c,e:'flop'},pig:{f:0xf6b5c1,e:'tri',sn:0xe98da0},
    ox:{f:0x8b6547,e:'horn',sn:0xd9b8a0},fox:{f:0xee8a3c,e:'tri',fc:0xfff3e6},mouse:{f:0xb9bdc7,e:'big'},monkey:{f:0x986a46,e:'side',fc:0xecc9a1},tiger:{f:0xf2a23e,e:'round'},penguin:{f:0x2b303b,e:'none',fc:0xf6f7fb,bk:0xffb43a}};
  const TC=t=>t===0?0x4f9bff:0xff5b48;
  function makeChar(kind,team){const A=AN[kind]||AN.cat,g=new THREE.Group(),fur=mat(A.f),tm=mat(TC(team)),white=mat(0xf3f3ee),blk=mat(0x1b1d22);
    const legs=[];for(const s of[-1,1]){const p=new THREE.Group();p.position.set(s*.13,.5,0);const l=mesh(new THREE.CylinderGeometry(.1,.09,.48,8),white,0,-.24,0);p.add(l);
      const shoe=mesh(new THREE.BoxGeometry(.16,.09,.24),blk,0,-.48,.04);p.add(shoe);g.add(p);legs.push(p);}
    g.add(mesh(new THREE.CylinderGeometry(.27,.33,.58,12),tm,0,.78,0));
    const arms=[];for(const s of[-1,1]){const p=new THREE.Group();p.position.set(s*.34,.98,0);p.add(mesh(new THREE.CylinderGeometry(.075,.07,.42,8),tm,0,-.2,0));const h=mesh(new THREE.SphereGeometry(.09,8,6),fur,0,-.43,0);p.add(h);g.add(p);arms.push(p);}
    const head=new THREE.Group();head.position.y=1.38;g.add(head);
    head.add(mesh(new THREE.SphereGeometry(.38,18,14),fur,0,0,0));
    if(A.e==='long')for(const s of[-1,1]){const e=mesh(new THREE.CylinderGeometry(.07,.09,.55,8),fur,s*.15,.5,-.03);e.rotation.z=-s*.15;head.add(e);}
    if(A.e==='round'||A.e==='big')for(const s of[-1,1])head.add(mesh(new THREE.SphereGeometry(A.e==='big'?.17:.12,10,8),fur,s*.28,.3,-.02));
    if(A.e==='tri')for(const s of[-1,1]){const e=mesh(new THREE.ConeGeometry(.12,.26,4),fur,s*.22,.38,0);e.rotation.z=-s*.25;head.add(e);}
    if(A.e==='flop')for(const s of[-1,1]){const e=mesh(new THREE.BoxGeometry(.1,.3,.16),fur,s*.38,-.02,0);e.rotation.z=s*.25;head.add(e);}
    if(A.e==='side')for(const s of[-1,1])head.add(mesh(new THREE.SphereGeometry(.11,8,6),fur,s*.4,0,0));
    if(A.e==='horn')for(const s of[-1,1]){const e=mesh(new THREE.ConeGeometry(.06,.3,6),mat(0xefe6d2),s*.3,.32,0);e.rotation.z=-s*.7;head.add(e);}
    if(A.fc)head.add(mesh(new THREE.SphereGeometry(.27,12,10),mat(A.fc),0,-.06,.16));
    for(const s of[-1,1])head.add(mesh(new THREE.SphereGeometry(.05,8,6),blk,s*.13,.02,.35));
    if(A.sn)head.add(mesh(new THREE.SphereGeometry(.12,10,8),mat(A.sn),0,-.1,.34));
    if(A.bk){const bk=mesh(new THREE.ConeGeometry(.06,.16,6),mat(A.bk),0,-.08,.4);bk.rotation.x=Math.PI/2;head.add(bk);}
    const cap=mesh(new THREE.SphereGeometry(.39,16,8,0,Math.PI*2,0,Math.PI/2.2),tm,0,.06,0);head.add(cap);
    const brim=mesh(new THREE.CylinderGeometry(.2,.22,.03,14),tm,0,.1,.36);brim.scale.set(1.3,1,1);head.add(brim);
    const shadow=new THREE.Mesh(new THREE.CircleGeometry(.4,16),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.25}));shadow.rotation.x=-Math.PI/2;shadow.position.y=.02;g.add(shadow);
    g.userData={legs,arms,head,phase:Math.random()*6,kind};scene.add(g);return g;}
  function animChar(ch,speed,dt){const u=ch.userData;u.phase+=speed*dt*1.6;const a=Math.min(1,speed/5)*.7*Math.sin(u.phase);u.legs[0].rotation.x=a;u.legs[1].rotation.x=-a;u.arms[0].rotation.x=-a*.8;u.arms[1].rotation.x=a*.8;}
  function placeChar(ch,x,z,faceX,faceZ){ch.position.set(-x,0,z);if(faceX!=null){const dx=-(faceX-x),dz=faceZ-z;if(Math.hypot(dx,dz)>.01)ch.rotation.y=Math.atan2(dx,dz);}}
  function dropChar(ch){if(ch)scene.remove(ch);}
  
  const ball=mesh(new THREE.SphereGeometry(.13,14,10),new THREE.MeshStandardMaterial({color:0xffffff,emissive:0x333333}),0,-5,0);scene.add(ball);
  const ballSh=new THREE.Mesh(new THREE.CircleGeometry(.16,12),new THREE.MeshBasicMaterial({color:0,transparent:true,opacity:.35}));ballSh.rotation.x=-Math.PI/2;scene.add(ballSh);
  const bat=new THREE.Group();bat.rotation.order='YXZ';bat.add(mesh(new THREE.CylinderGeometry(.055,.03,1.0,10),mat(0xc99a5e),0,.52,0));
  
  /* actors */
  let fielders=[],fielderTeam=-1,batterMesh=null,batterKey='',baseMeshes=[null,null,null],playMeshes=[];
  const FPOS=[];
  function defKinds(t){const T=TEAMS[t];return[T.pk,...Array.from({length:8},(_,i)=>T.lineup[i%T.lineup.length].k)];}
  function syncFielders(){const t=pitTeam();if(fielderTeam!==t){fielders.forEach(dropChar);const ks=defKinds(t);fielders=ks.map(k=>makeChar(k,t));fielderTeam=t;
      const D=S.def[t];fielders.forEach((f,i)=>{FPOS[i]=D[i].slice();placeChar(f,D[i][0],D[i][1],0,0);});fielders[1].scale.set(1,.7,1);}}
  function syncBatter(){const b=batter(),key=batTeam()+b.name;if(key!==batterKey){dropChar(batterMesh);batterMesh=makeChar(b.kind,batTeam());batterMesh.add(bat);bat.position.set(.12,.95,.28);batterKey=key;}
    placeChar(batterMesh,-.95,0,-.95,5);batterMesh.rotation.y=-Math.PI/2+.25;batterMesh.visible=true;}
  function syncBases(){for(let i=0;i<3;i++){const r=S.bases[i],cur=baseMeshes[i];
    if(!r){dropChar(cur);baseMeshes[i]=null;continue;}const key=batTeam()+r.name;if(!cur||cur.userData.key!==key){dropChar(cur);const m=makeChar(r.kind,batTeam());m.userData.key=key;baseMeshes[i]=m;}
    const B=BASES[i+1];placeChar(baseMeshes[i],B[0]*.97,B[1]-.6,BASES[i+2][0],BASES[i+2][1]);baseMeshes[i].visible=true;}}
  
  /* cameras */
  const camPos=new THREE.Vector3(0,2,-4),camLook=new THREE.Vector3(0,1,10);let camMode='bat';
  function camTarget(dt){let p,l,fov;
    if(camMode==='coach'){p=new THREE.Vector3(0,88,-12);l=new THREE.Vector3(0,0,44);fov=55;}
    else if(camMode==='play'){const bx=ball.position.x,bz=ball.position.z;const d=Math.hypot(bx,bz);p=new THREE.Vector3(bx*.35,13+d*.18,bz*.35-16-d*.05);l=new THREE.Vector3(bx*.85,0,bz*.85+4);fov=50;}
    else if(camMode==='pitch'){p=new THREE.Vector3(1.1,2.5,25.5);l=new THREE.Vector3(-.3,1.0,0);fov=14;}
    else{p=new THREE.Vector3(.15,1.75,-3.5);l=new THREE.Vector3(0,1.05,8);fov=42;}
    const k=camMode==='play'?Math.min(1,dt*3):Math.min(1,dt*4);camPos.lerp(p,k);camLook.lerp(l,k);cam.fov+=(fov-cam.fov)*k;cam.updateProjectionMatrix();cam.position.copy(camPos);cam.lookAt(camLook);}
  
  /* strike-zone overlay, positioned from the projected zone */
  const ZW=1.1,ZH=1.1,ZY=.32,RING=.55,cw=ZW/3,ch=ZH/3;
  function cellCore(r,c){const off=i=>i===0?-RING/2:i===4?3+RING/2:i-.5;const u=-ZW/2+off(c)*cw,v=ZY+ZH-off(r)*ch;return[u,v];}
  const zoneEl=$('zone'),zcells=[];
  for(let r=0;r<5;r++)for(let c=0;c<5;c++){const b=document.createElement('button');b.type='button';b.className='c '+(inZ(r,c)?'k':'o');b.addEventListener('click',()=>tapCell(r,c));zoneEl.appendChild(b);zcells.push(b);}
  function placeZone(){const w=view.clientWidth,h=view.clientHeight;const tl=V(-ZW/2-RING*cw,ZY+ZH+RING*ch,.3).project(cam),br=V(ZW/2+RING*cw,ZY-RING*ch,.3).project(cam);
    let x1=(tl.x+1)/2*w,x2=(br.x+1)/2*w,y1=(1-tl.y)/2*h,y2=(1-br.y)/2*h;let L=Math.min(x1,x2),R=Math.max(x1,x2),T=Math.min(y1,y2),B=Math.max(y1,y2);
    const cx=(L+R)/2,cy=(T+B)/2,min=Math.min(w*.62,250);let sw=R-L,sh=B-T;if(sw<min){const s=min/sw;sw*=s;sh*=s;}
    const lx=clamp(cx-sw/2,6,w-sw-6),ty=clamp(cy-sh/2,46,h-sh-6);Object.assign(zoneEl.style,{left:lx+'px',top:ty+'px',width:sw+'px',height:sh+'px'});
    // mirror columns when the camera looks back toward home
    zoneEl.style.transform=camMode==='pitch'?'scaleX(-1)':'';zcells.forEach(c=>c.style.transform=camMode==='pitch'?'scaleX(-1)':'');}
  
  /* ================= game flow ================= */
  const mini=$('mini'),minis=[];for(let i=0;i<25;i++){const e=document.createElement('i');mini.appendChild(e);minis.push(e);}
  S=fresh();S.shiftHist=[[],[]];S.prompt=false;
  let A=null; // current reveal animation
  function startGame(){S=fresh();S.shiftHist=[[],[]];$('menu').hidden=true;$('end').hidden=true;newHalf();}
  function inningLabel(){return `${Math.floor(S.half/2)+1} 局${S.half%2===0?'上':'下'}${S.extra?'（延長）':''}`;}
  function newHalf(){S.outs=0;S.balls=0;S.strikes=0;S.halfRuns=0;S.streak=0;S.bases=S.extra?[null,{spd:2,name:'代跑',kind:'dog'},null]:[null,null,null];
    if(S.half>0)S.stamina[pitTeam()]=Math.min(STAMINA,S.stamina[pitTeam()]+15);
    syncFielders();syncBases();logIt(`— ${inningLabel()}：${userBats()?'你打擊':'你投球'} —`);
    if(!userBats()){S.phase='prompt';camMode='coach';render();return;}newPA();}
  function newPA(){S.my.cell=null;S.my.steal=false;
    if(userBats()){const k=aiDefense();S.def[1]=PRESETS[k].f();S.defName[1]=PRESETS[k].n;S.shiftHist[1].push(k);}else{S.aiApp=aiApproach();}
    syncBatter();newPitch();}
  function newPitch(){S.phase='pick';S.pickT=PICK_T;S.my.cell=null;S.my.steal=false;S.my.hold=false;
    if(userBats()){S.my.mode=S.app==='bunt'?'bunt':(S.my.mode==='bunt'||S.my.mode==='take'?'row':S.my.mode);}
    S.ai=userBats()?aiPitch():aiSwing();
    if(!userBats()&&S.stamina[0]<PT[S.my.pt].cost)S.my.pt='fb';
    camMode=userBats()?'bat':'pitch';render();}
  function confirm(){if(S.phase!=='pick')return;let pitch,sw,hold,ptk;
    if(userBats()){const m=S.my.mode;if(m!=='take'&&m!=='bunt'&&!S.my.cell)return;pitch={r:S.ai.r,c:S.ai.c};hold=S.ai.hold;ptk=S.ai.pt;
      sw={mode:m,set:guessSet(m,S.my.cell&&S.my.cell[0],S.my.cell&&S.my.cell[1]),steal:S.my.steal&&!!stealer()};}
    else{if(!S.my.cell)return;pitch={r:S.my.cell[0],c:S.my.cell[1]};sw=S.ai;hold=S.my.hold&&!!stealer();ptk=S.my.pt;}
    reveal(pitch,sw,hold,ptk);}
  function timeout(){if(S.phase!=='pick')return;if(userBats()){S.my.mode='take';}else{S.my.cell=[2,2];S.my.pt='fb';}confirm();}
  function reveal(pitch,sw,hold,ptk){S.phase='reveal';S.rb=batter();const pt=pitTeam();S.stamina[pt]=Math.max(0,S.stamina[pt]-PT[ptk].cost);
    const res=resolve(pitch,sw,ptk,hold);S.pitchHist[pt].push(res.pitch);(S.ptHist||(S.ptHist=[[],[]]))[pt].push(ptk);(S.cHist||(S.cHist=[[],[]]))[pt].push({b:S.balls,s:S.strikes,zone:inZ(res.pitch.r,res.pitch.c),swing:sw.mode!=='take'});S.guessHist[batTeam()].push(sw.set);
    const o=applyPitch(res,sw,hold);S.lastPaEnd=o.paEnd;
    let line=`${S.rb.name}（${MODE[sw.mode]}${sw.steal?'＋盜壘':''}）vs ${PT[ptk].n} → ${o.txt}`;if(o.paEnd&&o.play)line+=`〔${APP[curApp()]} vs ${S.defName[pt]}〕`;logIt(line);
    if(o.paEnd&&batTeam()===0)S.appHist[0].push(S.app);
    A={t:0,pitch:res.pitch,ptk,swing:sw.mode!=='take',bunt:sw.mode==='bunt',play:o.play,steal:o.steal,txt:o.txt,col:o.hit?'var(--amber)':res.kind==='ball'?'#9ff2a5':'var(--fg)',shown:false,set:sw.set,prev:S.prevBases};
    A.dur=o.play?1.1+o.play.dur:o.steal?3.4:2.1;
    if(o.play){playMeshes=o.play.runners.map(r=>{if(r.bat)return batterMesh;const i=A.prev.findIndex(x=>x&&x.name===r.name);const m=i>=0?baseMeshes[i]:null;if(m){baseMeshes[i]=null;return m;}return makeChar(r.kind||'cat',batTeam());});}
    render();}
  function afterReveal(){const pe=S.lastPaEnd;A=null;camMode=userBats()?'bat':'pitch';if(pe&&batterMesh)batterMesh.visible=false;
    for(const m of playMeshes)if(m!==batterMesh&&!baseMeshes.includes(m))dropChar(m);playMeshes=[];syncBases();
    if((S.half>=5||S.extra)&&batTeam()===1&&S.score[1]>S.score[0])return finish();
    if(S.outs>=OUTS||S.halfRuns>=HALF_RUNS){flash(S.outs>=OUTS?'三出局，攻守交換':'本半局達 6 分上限，攻守交換',1.4,'var(--muted)');return endHalf();}
    if(S.lastPaEnd){S.my.cell=null;newPA();}else newPitch();}
  function endHalf(){const top=S.half%2===0;S.phase='wait';S.waitT=BB9_HALF_WAIT_S;   // game time (frame), not setTimeout: closing the overlay pauses it
    S.waitFn=()=>{
      if(top&&S.half===4&&S.score[1]>S.score[0])return finish();
      if(!top&&S.half>=5){if(S.score[0]===S.score[1]&&!S.extra){S.extra=true;S.half++;return newHalf();}return finish();}
      S.half++;newHalf();};}
  function finish(){S.phase='over';$('f0').textContent=S.score[0];$('f1').textContent=S.score[1];const st=S.stats[0];
    $('verdict').textContent=(S.score[0]>S.score[1]?'你贏了。':S.score[0]<S.score[1]?'電腦贏了，下一場換個佈陣。':'延長也打平，和局。')+`　你的打線：${st.h} 安 ${st.hr} 轟 ${st.bb} 保送 ${st.k} 三振 ${st.sb} 盜壘`;$('end').hidden=false;bb9_record(S.score[0],S.score[1],st);recLine();}
  
  /* ================= input ================= */
  function tapCell(r,c){if(S.phase!=='pick')return;
    if(userBats()){if(!inZ(r,c)||S.app==='bunt')return;if(S.my.mode==='take')S.my.mode='row';const same=S.my.cell&&S.my.cell[0]===r&&S.my.cell[1]===c;S.my.cell=[r,c];if(same)return confirm();}
    else{const same=S.my.cell&&S.my.cell[0]===r&&S.my.cell[1]===c;S.my.cell=[r,c];if(same)return confirm();}render();}
  function setPreset(k){S.def[0]=PRESETS[k].f();S.defName[0]=PRESETS[k].n;render();}
  $('ctl').addEventListener('click',e=>{const b=e.target&&e.target.closest&&e.target.closest('[data-a]');if(!b||b.disabled)return;act(b.dataset.a,b.dataset.v);});
  function act(a,v){
    if(a==='keep'){S.phase='x';newPA();return;}if(a==='redo'){S.coachFrom='prompt';S.phase='coach';camMode='coach';render();return;}
    if(a==='preset'){setPreset(v);return;}
    if(a==='coach'){S.coachFrom=S.phase;S.phase='coach';camMode='coach';render();return;}
    if(a==='done'){camMode=userBats()?'bat':'pitch';if(S.coachFrom==='prompt'){S.phase='x';newPA();}else{S.phase='pick';render();}return;}
    if(S.phase!=='pick')return;
    if(a==='app'){S.app=v;S.my.mode=v==='bunt'?'bunt':(S.my.mode==='bunt'?'row':S.my.mode);S.my.cell=v==='bunt'?null:S.my.cell;}
    if(a==='mode'){S.my.mode=v;if(v==='take'||v==='bunt')S.my.cell=null;}
    if(a==='steal')S.my.steal=!S.my.steal;if(a==='hold')S.my.hold=!S.my.hold;if(a==='pt')S.my.pt=v;
    if(a==='pause'&&S.pauses[0]>0){S.pauses[0]--;S.pitchHist[0]=[];S.ai=aiSwing();flash('暫停：你的投球紀錄清空',1.2,'var(--amber)');}
    if(a==='go')return confirm();render();}
  $('start').addEventListener('click',startGame);$('again').addEventListener('click',startGame);
  for(const k of['x','leave','leave2'])$(k).addEventListener('click',()=>bb9_close());
  // coach dragging on the 3D field
  const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);let drag=-1;
  function groundAt(e){const r=cv.getBoundingClientRect();const p=new THREE.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1);ray.setFromCamera(p,cam);const v=new THREE.Vector3();return ray.ray.intersectPlane(plane,v)?[-v.x,v.z]:null;}
  cv.addEventListener('pointerdown',e=>{if(S.phase!=='coach')return;const g=groundAt(e);if(!g)return;let bi=-1,bd=7;for(let i=2;i<9;i++){const d=dist(S.def[0][i],g);if(d<bd){bd=d;bi=i;}}drag=bi;if(bi>=0)cv.setPointerCapture(e.pointerId);});
  cv.addEventListener('pointermove',e=>{if(drag<0)return;const g=groundAt(e);if(!g)return;const d=Math.hypot(g[0],g[1]),phi=Math.atan2(g[0],g[1]);
    if(Math.abs(phi)>Math.PI/4+.05||d>fenceR(phi)-3||d<6)return;S.def[0][drag]=g;S.defName[0]='自訂';});
  addEventListener('pointerup',()=>{if(drag>=0){drag=-1;render();}});
  
  /* ================= render UI ================= */
  let flashT=0;function flash(t,d,col){const e=$('banner');e.textContent=t;e.style.color=col||'var(--fg)';e.style.opacity=1;flashT=d;}
  function logIt(t){S.log.unshift(t);S.log=S.log.slice(0,3);$('log').innerHTML=S.log.map(x=>`<div>${x}</div>`).join('');}
  const stars=(n,m)=>'★'.repeat(n)+'☆'.repeat(m-n);
  const chip=(a,v,label,sub,on,dis)=>`<button class="chip${on?' on':''}" data-a="${a}" data-v="${v}" type="button"${dis?' disabled':''}>${label}${sub?`<small>${sub}</small>`:''}</button>`;
  const grid=(n,html)=>`<div class="chips" style="grid-template-columns:repeat(${n},minmax(0,1fr))">${html}</div>`;
  function presetRow(){return grid(6,Object.keys(PRESETS).map(k=>chip('preset',k,PRESETS[k].n.replace('偏移',''),k==='L'||k==='R'?'偏移':'',S.defName[0]===PRESETS[k].n)).join(''));}
  function render(){
    $('r0').textContent=S.score[0];$('r1').textContent=S.score[1];$('inn').textContent=inningLabel();
    document.querySelectorAll('#bb9-cnt i.o').forEach((e,k)=>e.classList.toggle('on',k<S.outs));
    ['b1','b2','b3'].forEach((id,k)=>$(id).setAttribute('fill',S.bases[k]?'#ffb53d':'rgba(255,255,255,.15)'));
    document.querySelectorAll('#bb9-cnt i:not(.o)').forEach((e,k)=>{e.className=k<3?(k<S.balls?'b':''):(k-3<S.strikes?'s':'');});
    const b=A&&S.rb?S.rb:batter(),pt=pitTeam(),ub=userBats();
    $('batN').textContent=b.name;$('batT').textContent=`${b.type.n}・速${stars(b.spd,3)} 力${stars(b.pow,3)}`;
    $('pitN').textContent=TEAMS[pt].pitcher;$('pitT').textContent=`體力 ${Math.round(S.stamina[pt])}`;const sp=S.stamina[pt]/STAMINA;
    $('stamb').style.width=sp*100+'%';$('stamb').style.background=sp<.25?'var(--red)':sp<.5?'var(--amber)':'var(--ok)';
    $('tag').innerHTML=S.phase==='coach'?'教練模式':`${ub?'你在打擊':'你在投球'}<small>${ub?'對方佈陣：'+S.defName[1]:'我方佈陣：'+S.defName[0]}</small>`;
    $('coachHint').style.display=S.phase==='coach'?'block':'none';
    let html='',hint='';const st=stealer();
    if(S.phase==='prompt'){html=`<div class="lab">守備開始，上一次佈陣：${S.defName[0]}</div><div class="row2"><button class="go" data-a="keep" type="button">沿用佈陣</button><button class="go alt" data-a="redo" type="button">重新擺陣</button></div>`;hint='擺陣之後投球時也能隨時用快捷佈陣或手動調整。';}
    else if(S.phase==='coach'){html=`<div class="lab">快捷佈陣（全隊會跑過去）</div>${presetRow()}<button class="go" data-a="done" type="button">完成擺陣</button>`;hint='拉打偏移防拉打型、推打偏移防推打型；防觸擊把一三壘手往前；內野前進防三壘跑者回本壘；外野後退防長打。';}
    else if(ub){const bunt=S.app==='bunt';
      html=`<div class="lab">打法（球往哪邊飛）</div>`+grid(4,chip('app','pull','拉打','往左外野',S.app==='pull')+chip('app','mid','順打','中間',S.app==='mid')+chip('app','push','推打','往右外野',S.app==='push')+chip('app','bunt','觸擊','推進',S.app==='bunt'));
      const modes=bunt?['bunt','take']:['one','row','col','box','take'];const sub={one:'賭長打',row:'安打',col:'安打',box:'護航',take:'看球',bunt:'點下去'};
      html+=`<div class="lab">猜球</div>`+grid(modes.length+(st?1:0),modes.map(m=>chip('mode',m,MODE[m],sub[m],S.my.mode===m)).join('')+(st?chip('steal',1,S.my.steal?'盜壘中':'盜壘',`跑者速${st.r.spd}`,S.my.steal):''));
      const ready=S.phase==='pick'&&(S.my.mode==='take'||S.my.mode==='bunt'||!!S.my.cell);
      html+=`<button class="go" data-a="go" type="button"${ready?'':' disabled'}>${S.my.mode==='take'?'看這球':S.my.mode==='bunt'?'觸擊':'揮棒'}</button>`;
      hint=`對方現在是「${S.defName[1]}」：看哪邊有空檔再選打法。`+(bunt?'觸擊：好球帶內容易點到。':'點畫面的好球帶選格子，同格點兩下直接揮。');}
    else{html=`<div class="lab">球種（耗體力）</div>`+grid(4,Object.keys(PT).map(k=>chip('pt',k,PT[k].n.replace('全力',''),`體力 ${PT[k].cost}`,S.my.pt===k,S.stamina[0]<PT[k].cost)).join(''));
      html+=`<div class="lab">佈陣</div>`+presetRow();
      html+=grid(st?3:2,chip('coach',1,'手動擺陣','拖曳球員')+(st?chip('hold',1,S.my.hold?'注意中':'注意跑者','防盜易失投',S.my.hold):'')+chip('pause',1,`暫停（${S.pauses[0]}）`,'清空紀錄',false,S.pauses[0]<=0));
      const ready=S.phase==='pick'&&!!S.my.cell;html+=`<button class="go" data-a="go" type="button"${ready?'':' disabled'}>投球</button>`;
      hint='點畫面的好球帶選位置（外圍虛線是壞球），同格點兩下直接投。';}
    $('ctl').innerHTML=html;$('hint').textContent=hint;
    // zone cells
    const pick=S.phase==='pick',h=b.type.h;const set=ub&&pick&&S.my.cell?guessSet(S.my.mode,S.my.cell[0],S.my.cell[1]):[];
    zoneEl.classList.toggle('off',S.phase==='coach'||S.phase==='prompt'||(A&&A.t>1.15&&A.play));
    // opponent history drawn right on the zone: counts per cell + the last pitch
    const zc=Array(25).fill(0);let lastP=null;
    if(ub){for(const p of S.pitchHist[1])zc[p.r*5+p.c]++;lastP=S.pitchHist[1][S.pitchHist[1].length-1];}
    else for(const g of S.guessHist[1])for(const[R,C]of g)zc[(R+1)*5+C+1]++;
    const recent=ub?S.pitchHist[1].slice(-4).map((p,i,a)=>posName(p.r,p.c)+(S.ptHist?PT[S.ptHist[1][S.ptHist[1].length-a.length+i]].n.replace('全力','').slice(0,2):'')).join(' → '):'';
    const pct=(arr,f)=>arr.length<3?'—':Math.round(arr.filter(f).length/arr.length*100)+'%';const CH=(S.cHist||[[],[]]);
    if(ub){const h=CH[1],two=h.filter(x=>x.s===2),three=h.filter(x=>x.b===3),ahead=h.filter(x=>x.s>x.b);
      $('recent').innerHTML=`<div><b>好球率</b>${pct(h,x=>x.zone)}（${h.length}球）・領先球數時 ${pct(ahead,x=>x.zone)}・兩好球 ${pct(two,x=>x.zone)}・三壞 ${pct(three,x=>x.zone)}</div><div><b>最近</b>${recent||'還沒有紀錄'}</div>`;}
    else{const h=CH[0],sw=h.filter(x=>x.swing),out=h.filter(x=>!x.zone);
      $('recent').innerHTML=S.guessHist[1].length?`<div><b>電腦打者</b>出棒率 ${pct(h,x=>x.swing)}・追打壞球 ${pct(out,x=>x.swing)}</div><div style="color:var(--muted)">格子數字＝被猜次數；你的好球率 ${pct(h,x=>x.zone)}</div>`:'';}
    for(let r=0;r<5;r++)for(let c=0;c<5;c++){const e=zcells[r*5+c];e.className='c '+(inZ(r,c)?'k':'o');e.innerHTML='';
      if(inZ(r,c)){const v=h[sIdx(r,c)];if(v>0){e.classList.add('hot');e.innerHTML='<span>熱</span>';}if(v<0){e.classList.add('cold');e.innerHTML='<span>冷</span>';}}
      else if(ub)e.classList.add('dim');
      if(zc[r*5+c]&&S.phase!=='coach'){e.innerHTML+=`<i class="n">${zc[r*5+c]}</i>`;if(ub)e.classList.remove('dim');}
      if(ub&&lastP&&lastP.r===r&&lastP.c===c&&!(A&&A.t>1.0))e.classList.add('last');
      if(pick&&!ub&&S.my.cell&&S.my.cell[0]===r&&S.my.cell[1]===c)e.classList.add('sel');
      if(set.some(([R,C])=>R===r-1&&C===c-1))e.classList.add('sel');
      if(A&&A.t>1.0){if(A.set.some(([R,C])=>R===r-1&&C===c-1))e.classList.add('g');if(A.pitch.r===r&&A.pitch.c===c)e.classList.add('pitch');}}
    // read panel
    let cnt=Array(25).fill(0),txt='';
    if(ub){const hist=S.pitchHist[1];for(const p of hist)cnt[p.r*5+p.c]++;txt=`<b>電腦投手落點</b>（${hist.length} 球）・對方佈陣：${tally(S.shiftHist[1],k=>PRESETS[k].n)||'—'}`;}
    else{const hist=S.guessHist[1];for(const set of hist)for(const[R,C]of set)cnt[(R+1)*5+C+1]++;txt=`<b>電腦打者猜測習慣</b>（${hist.length} 球）・打法：${tally(S.appHist[1],k=>APP[k])||'—'}`;}
    const mx=Math.max(1,...cnt);minis.forEach((e,i)=>{const r=(i/5)|0,c=i%5;e.style.background=cnt[i]?`rgba(255,181,61,${.18+cnt[i]/mx*.8})`:(inZ(r,c)?'rgba(255,255,255,.1)':'rgba(255,255,255,.04)');});
    $('readTxt').innerHTML=txt;}
  function posName(r,c){if(!inZ(r,c))return'壞';return['高','中','低'][r-1]+['內','中','外'][c-1];}
  function tally(arr,nm){const c={};for(const a of arr)c[a]=(c[a]||0)+1;return Object.keys(c).map(k=>`${nm(k)}×${c[k]}`).join(' ');}
  // remember AI batter approach per PA for the read panel
  const _newPA=newPA;newPA=function(){_newPA();if(!userBats())S.appHist[1].push(S.aiApp);render();};
  
  /* ================= animation ================= */
  const interp=(pts,t)=>{if(!pts.length)return null;if(t<=pts[0].t)return pts[0];for(let i=1;i<pts.length;i++)if(t<=pts[i].t){const a=pts[i-1],b=pts[i],f=(t-a.t)/(b.t-a.t||1);return{x:a.x+(b.x-a.x)*f,y:(a.y||0)+((b.y||0)-(a.y||0))*f,z:a.z+(b.z-a.z)*f};}return pts[pts.length-1];};
  const RELEASE=[.35,1.9,17.6];
  function animate(dt){
    // idle fielders drift to their assigned spots
    const D=S.def[pitTeam()];const playF=A&&A.play&&A.t>1.1?A.play.fielders:{};
    fielders.forEach((f,i)=>{if(playF[i])return;const tgt=D[i];const p=FPOS[i]||(FPOS[i]=tgt.slice());const dx=tgt[0]-p[0],dz=tgt[1]-p[1],d=Math.hypot(dx,dz);let sp=0;
      if(d>.05){const m=Math.min(d,9*dt);p[0]+=dx/d*m;p[1]+=dz/d*m;sp=9;placeChar(f,p[0],p[1],tgt[0],tgt[1]);}else{placeChar(f,p[0],p[1],ball.position.x?-ball.position.x:0,ball.position.z||0);}
      animChar(f,sp,dt);});
    if(fielders[1])fielders[1].visible=camMode!=='bat';
    if(!A){ball.position.set(-RELEASE[0],-5,RELEASE[2]);ballSh.visible=false;bat.rotation.set(0,0,.5+Math.sin(performance.now()/260)*.06);if(batterMesh){const ar=batterMesh.userData.arms;ar[0].rotation.x=ar[1].rotation.x=-1.2;}return;}
    A.t+=dt;const t=A.t,pr=fielders[0];
    // pitcher windup
    const arm=t<.5?t/.5:Math.max(0,1-(t-.5)/.25);pr.userData.arms[1].rotation.x=-arm*2.6;
    // batter swing
    const sw=A.swing&&!A.bunt?clamp((t-.82)/.2,0,1):0,e=sw*sw*(3-2*sw);
    if(A.bunt){const k=Math.min(1,t/.5);bat.rotation.set(0,k*Math.PI/2,.5+k*(Math.PI/2-.5));}else bat.rotation.set(0,e*Math.PI*1.1,.5+Math.min(1,e*2)*(Math.PI/2-.5));
    if(batterMesh&&!(A.play&&t>1.1)){batterMesh.rotation.y=-Math.PI/2+.25+e*.7;const ar=batterMesh.userData.arms;ar[0].rotation.x=ar[1].rotation.x=-1.2+e*.4;}
    const[tu,tv]=cellCore(A.pitch.r,A.pitch.c);
    if(t<.5){ball.position.copy(V(RELEASE[0]+.3,1.6,RELEASE[2]+.2));}
    else if(t<1.05){const f=(t-.5)/.55;const x=RELEASE[0]+(tu-RELEASE[0])*f,y=RELEASE[1]+(tv-RELEASE[1])*f+Math.sin(f*Math.PI)*.35-(A.ptk==='curve'?f*f*.35:0),z=RELEASE[2]+(.3-RELEASE[2])*f;ball.position.copy(V(x,y,z));}
    else if(!A.play){ball.position.copy(V(tu,tv,-.6));
      if(A.steal){const st=A.steal,from=st.from,tt=t-1.05;const B=BASES[from+2],P=[0,-1];const thrT=dist(P,B)/27,f=clamp((tt-.25)/thrT,0,1);
        ball.position.copy(V(P[0]+(B[0]-P[0])*f,1.2+Math.sin(f*Math.PI)*1.5,P[1]+(B[1]-P[1])*f));
        const m=baseMeshes[from+1]||baseMeshes[from];const rt=clamp((t-.45)/(27.4/9.4),0,1);const a=BASES[from+1],bb=BASES[from+2];if(m){placeChar(m,a[0]+(bb[0]-a[0])*rt,a[1]+(bb[1]-a[1])*rt,bb[0],bb[1]);animChar(m,rt<1?9:0,dt);m.visible=!(rt>=1&&!st.ok&&Math.floor(t*6)%2);}}}
    else{const P=A.play,pt=t-1.05;if(t>1.1)camMode='play';
      const last=P.ball[P.ball.length-1];let bp=null;
      if(pt<=last.t)bp=interp(P.ball,pt);
      else{let th=null;for(const w of P.throws)if(pt>=w.t0&&pt<=w.t0+Math.max(w.dur,.01))th=w;
        if(th){const f=clamp((pt-th.t0)/Math.max(th.dur,.01),0,1);bp={x:th.from[0]+(th.to[0]-th.from[0])*f,y:1.4+Math.sin(f*Math.PI)*Math.min(4,th.dur*2),z:th.from[1]+(th.to[1]-th.from[1])*f};}
        else{let lastT=null;for(const w of P.throws)if(pt>w.t0+w.dur)lastT=w;bp=lastT?{x:lastT.to[0],y:1.2,z:lastT.to[1]}:{x:last.x,y:Math.max(last.y,1),z:last.z};}}
      ball.position.copy(V(bp.x,Math.max(.13,bp.y),bp.z));
      for(const k in P.fielders){const f=fielders[k],path=P.fielders[k],q=interp(path,pt),q2=interp(path,pt+.05);const p=FPOS[k];p[0]=q.x;p[1]=q.z;placeChar(f,q.x,q.z,bp.x,bp.z);animChar(f,Math.hypot(q2.x-q.x,q2.z-q.z)/.05,dt);}
      P.runners.forEach((r,i)=>{const m=playMeshes[i];if(!m)return;const q=interp(r.pts,pt),q2=interp(r.pts,pt+.05);if(!q)return;const sp=Math.hypot(q2.x-q.x,q2.z-q.z)/.05;
        placeChar(m,q.x,q.z,q2.x+(q2.x-q.x)*5,q2.z+(q2.z-q.z)*5+.001);animChar(m,sp,dt);m.visible=!(r.out&&pt>r.outT&&Math.floor(t*6)%2);});}
    ballSh.visible=ball.position.y>-1;ballSh.position.set(ball.position.x,.03,ball.position.z);
    const showAt=A.play?1.05+Math.min(A.play.dur-1,(A.play.ball[A.play.ball.length-1]||{t:0}).t+.4):1.15;
    if(!A.shown&&t>=showAt){A.shown=true;flash(A.txt,1.8,A.col);render();}
    if(t>=1.0&&t-dt<1.0)render();if(A.play&&t>=1.15&&t-dt<1.15)render();
    if(t>=A.dur)afterReveal();}
  
  function frame(dt){
    if(S.phase==='pick'){S.pickT-=dt;if(S.pickT<=0)timeout();}
    if(S.phase==='wait'&&S.waitFn){S.waitT-=dt;if(S.waitT<=0){const f=S.waitFn;S.waitFn=null;f();}}
    animate(dt);camTarget(dt);rend.render(scene,cam);placeZone();
    if(flashT>0){flashT-=dt;if(flashT<=0)$('banner').style.opacity=0;}
    $('timerb').style.transform=`scaleX(${S.phase==='pick'?clamp(S.pickT/PICK_T,0,1):0})`;}
  function recLine(){const r=bb9_rec();$('rec').textContent=r.games?`本機戰績 ${r.wins} 勝 ${r.losses} 敗 ${r.draws} 和・最多得 ${r.bestRuns} 分`:'';}
  let last=0,raf=0,on=false;
  function loop(now){raf=0;if(!on)return;const dt=Math.min(.05,Math.max(0,(now-last)/1000));last=now;
    try{frame(dt);}catch(e){bb9_warn('frame',e);}
    if(on)raf=requestAnimationFrame(loop);}
  function start(){if(on)return;on=true;resize();recLine();render();last=performance.now();if(!raf)raf=requestAnimationFrame(loop);}
  function stop(){on=false;if(raf&&typeof cancelAnimationFrame==='function')cancelAnimationFrame(raf);raf=0;}
  resize();syncFielders();syncBatter();render();
  return{start,stop,frame,startGame,act,tapCell,confirm,timeout,on:()=>on,S:()=>S,scene};
}
