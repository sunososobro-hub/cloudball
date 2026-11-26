# Compact showing check (#126): headless, no screenshots. Loads the page, enters the frozen game, waits for the compact clock, then
#  1. poses every cut [at, to) of the compact timeline at STEP s and checks nothing on the field moves inside it (every figure, bone and the ball);
#  2. checks no booth line is said, or due, inside a cut;
#  3. lets the real loop run into a few cuts and checks it comes out at their end;
#  4. prints the length before and after, and the longest still stretches that are left (and what keeps them).
# THREE_DIR=.../node_modules/three/ python3 compact_probe.py REPO [STEP]
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1];STEP=float(sys.argv[2]) if len(sys.argv)>2 else .05
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=';window.__X={poseScene,animate,FIELDER_KEYS,fielders,runners,ump,batter,ball,scene,cpEvents,makeBooth,findIdx,get cpClock(){return cpClock},get T(){return replayT},setT(t){replayT=t},get game(){return game}};'
JS="""async (STEP)=>{const X=window.__X,g=X.game,ev=g.ev,C=await import('/render/compact.js'),clock=X.cpClock;
 const roots=[...X.FIELDER_KEYS.map(k=>X.fielders[k].g),...X.runners.map(r=>r.g),X.batter.g,X.ump.g,X.ball];
 const objs=[];for(const r of roots)r.traverse(o=>objs.push(o));
 const vis=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true};
 const sig=()=>{X.scene.updateMatrixWorld(true);const s=new Float32Array(objs.length*17);let n=0;for(const o of objs){const v=vis(o);s[n++]=v?1:0;const m=o.matrixWorld.elements;for(let j=0;j<16;j++)s[n++]=v?m[j]:0}return s};
 const pose=T=>{const i=X.findIdx(T),e=ev[i];X.poseScene(e,T-e.t,STEP,i);for(const k of X.FIELDER_KEYS){const f=X.fielders[k];if(!f.noAnim)X.animate(f,STEP)}X.runners.forEach(r=>{if(!r.noAnim)X.animate(r,STEP)});if(!X.ump.noAnim)X.animate(X.ump,STEP);return sig()};
 const moved=[],edges=[],EDGE_TOL=.01;/* an event boundary inside a cut may carry the same small step it has in real time (< 1 cm) */
 for(const c of clock.cuts){let p=null,worst=0,wt=0;pose(c.at-STEP);for(let T=c.at;T<c.to-1e-6;T=Math.min(T+STEP,c.to-1e-3)){const s=pose(T),cross=X.findIdx(T)!==X.findIdx(T-STEP);let w=0;if(p)for(let j=0;j<s.length;j++){const d=Math.abs(s[j]-p[j]);if(d>w)w=d}
   if(cross&&w>1e-3)edges.push({T:+T.toFixed(2),step:+w.toFixed(4),into:ev[X.findIdx(T)].k});if(cross&&w>EDGE_TOL)moved.push({at:+c.at.toFixed(2),to:+c.to.toFixed(2),worst:+w.toFixed(4),T:+T.toFixed(2),ev:'edge '+ev[X.findIdx(T)].k});if(!cross&&w>worst){worst=w;wt=T}p=s;if(T>=c.to-1e-3)break}
   if(worst>1e-3)moved.push({at:+c.at.toFixed(2),to:+c.to.toFixed(2),worst:+worst.toFixed(4),T:+wt.toFixed(2),ev:ev[X.findIdx(wt)].k+'/'+(ev[X.findIdx(wt)].r||'')})}
 const sc=await window.COMMENTARY.loadScript(g.seed),lines=X.makeBooth(sc).lines,bad=[];
 for(const l of lines){const s=l.time,e=l.end!=null?l.end:s+C.CP_LINE_EST;for(const c of clock.cuts)if(s<c.to&&e>c.at)bad.push({line:l.text.slice(0,16),s:+s.toFixed(2),e:+e.toFixed(2),cut:[+c.at.toFixed(2),+c.to.toFixed(2)]})}
 /* still stretches left: each stretch minus its cuts, in view seconds; what holds it */
 const busy=lines.map(l=>[l.time,l.end!=null?l.end:l.time+C.CP_LINE_EST]);
 const left=C.stillStretches(X.cpEvents(g)).map(st=>{const v=clock.toView(st.b)-clock.toView(st.a),talk=busy.filter(([s,e])=>s<st.b&&e>st.a).length,i=X.findIdx(st.a),e=ev[i];
   return{view:+v.toFixed(1),real:+(st.b-st.a).toFixed(1),kind:st.kind,lines:talk,at:+st.a.toFixed(1),inn:e.s0?`${e.s0.inn}${e.s0.half?'下':'上'}`:'',desc:e.desc||e.k}}).sort((a,b)=>b.view-a.view);
 /* longest view time between two pitch releases (what the viewer waits for the next pitch) */
 const rel=ev.filter(e=>e.k==='P').map(e=>e.t+1.6),waits=[];for(let i=1;i<rel.length;i++){const w=clock.toView(rel[i])-clock.toView(rel[i-1]);waits.push({w:+w.toFixed(1),real:+(rel[i]-rel[i-1]).toFixed(1),from:ev[X.findIdx(rel[i-1])].desc,between:ev.slice(X.findIdx(rel[i-1])+1,X.findIdx(rel[i])).map(e=>e.k).join(',')})}
 waits.sort((a,b)=>b.w-a.w);
 return{real:g.dur,view:clock.dur,edges,cuts:clock.cuts.length,removed:clock.removed,moved,bad:bad.slice(0,10),nbad:bad.length,left:left.slice(0,5),waits:waits.slice(0,5)}}"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':320,'height':200})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type in('error','warning') and errs.append(m.text))
    async def route(r):
      u=r.request.url
      if 'cdn.jsdelivr.net/npm/three@0.186.1/' in u:
        path=TH+u.split('three@0.186.1/')[1].split('?')[0].replace('.min.js','.js')
        return await (r.fulfill(path=path,content_type='application/javascript') if os.path.exists(path) else r.fulfill(status=404))
      if u.startswith('http://local/'):
        path=REPO+'/'+u[len('http://local/'):].split('?')[0]
        if not os.path.exists(path): return await r.fulfill(status=404)
        if path.endswith('render/game.js'):
          s=open(path,encoding='utf-8').read().rstrip();assert s.endswith('}');s=s[:-1]+HOOK+'}'
          return await r.fulfill(body=s,content_type='application/javascript')
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script("try{localStorage.setItem('zu_gl','1');localStorage.setItem('zu_tier','3@'+Date.now());localStorage.removeItem('zu_realTime')}catch(e){}")
    await pg.goto('http://local/play.html'); await pg.wait_for_function("()=>!document.getElementById('enter').disabled",timeout=900000,polling=1000)
    await pg.evaluate("()=>document.getElementById('enterMute').click()")
    await pg.wait_for_function("()=>window.__X&&window.__X.cpClock",timeout=120000,polling=500)
    r=await pg.evaluate(JS,STEP);print(json.dumps(r,ensure_ascii=False,indent=1))
    for k in (0,40,150):  # the page's own loop: put the clock just before a cut, let it play two frames
      c=await pg.evaluate(f"()=>{{const c=window.__X.cpClock.cuts[{k}];window.__X.setT(c.at-.05);return c}}")
      await pg.wait_for_function(f"()=>window.__X.T>{c['at']}",timeout=120000,polling=100)
      t=await pg.evaluate("()=>window.__X.T");print('loop: cut',k,[round(c['at'],2),round(c['to'],2)],'clock now',round(t,2),'OK' if t>=c['to'] else 'NOT SKIPPED')
    print('errs',[x for x in errs if 'Failed to load' not in x][:5])
    await b.close()
asyncio.run(main())
