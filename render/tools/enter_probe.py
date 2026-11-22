# Measures the main thread around the click on 「進場」 (#125): long tasks, frame gaps, and a CPU profile of the busiest functions.
# THREE_DIR=.../node_modules/three/ [W=1280 H=720] [ACT=enter|tier] python3 enter_probe.py REPO [gl|gpu] [tier] [wait_s]
# ACT=quick: click the moment the button is enabled (an impatient or returning visitor). ACT=tier: enter, then time one automatic quality drop (setTier(+1)) the way the fps watchdog does it.
# Also counts the shader programs (WebGL2 linkProgram) and pipelines (WebGPU createRenderPipeline*) created after the click, and the files fetched after it (#133):
# in headless every frame costs seconds, so the count of compiles left for after the click is the number to read, not the milliseconds.
# Always printed (#162): boot_to_button_ms (page open -> enter awake) and click_to_first_frame_ms; put both in the PR body of any picture change.
# Headless swiftshader is not a real desktop or phone: read the numbers as relative (before/after), not absolute.
import sys,os,asyncio,mimetypes,json,collections
from playwright.async_api import async_playwright
REPO=sys.argv[1];MODE=(sys.argv[2] if len(sys.argv)>2 else 'gl');TIER=(sys.argv[3] if len(sys.argv)>3 else '0');WAIT=float(sys.argv[4]) if len(sys.argv)>4 else 8
TH=os.environ.get('THREE_DIR','node_modules/three/')
INIT="""
window.__lt=[];window.__fr=[];
try{new PerformanceObserver(l=>{for(const e of l.getEntries())__lt.push([e.startTime,e.duration])}).observe({type:'longtask',buffered:true})}catch(e){}
(function f(t){__fr.push(performance.now());requestAnimationFrame(f)})();
window.__lp=[];window.__rs=[];
{const P=self.WebGL2RenderingContext&&WebGL2RenderingContext.prototype;if(P){const o=P.linkProgram;P.linkProgram=function(p){__lp.push(performance.now());return o.call(this,p)}}
 const D=self.GPUDevice&&GPUDevice.prototype;if(D)for(const k of ['createRenderPipeline','createRenderPipelineAsync','createComputePipeline','createComputePipelineAsync']){const o=D[k];if(o)D[k]=function(...a){__lp.push(performance.now());return o.apply(this,a)}}}
window.__click=null;if(%s){const go=()=>{const b=document.getElementById('enter');if(b&&!b.disabled&&!__click){__click=performance.now();b.click();return true}};const mo=new MutationObserver(()=>{if(go())mo.disconnect()});document.addEventListener('DOMContentLoaded',()=>mo.observe(document.body,{attributes:true,subtree:true,attributeFilter:['disabled']}))}
try{localStorage.setItem('zu_gl','%s');localStorage.setItem('zu_tier','%s@'+Date.now())}catch(e){}
"""%('true' if os.environ.get('ACT')=='quick' else 'false','1' if MODE=='gl' else '0',TIER)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--use-webgpu-adapter=swiftshader','--enable-features=Vulkan'])
    pg=await b.new_page(viewport={'width':int(os.environ.get('W','1280')),'height':int(os.environ.get('H','720'))})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));logs=[];pg.on('console',lambda m:logs.append(m.text));pg.on('console',lambda m:print('console',m.type,m.text[:160]) if m.type in ('error','warning') else None)
    async def route(r):
      u=r.request.url
      if 'cdn.jsdelivr.net/npm/three@0.186.1/' in u:
        path=TH+u.split('three@0.186.1/')[1].split('?')[0].replace('.min.js','.js')
        return await (r.fulfill(path=path,content_type='application/javascript') if os.path.exists(path) else r.fulfill(status=404))
      if u.startswith('http://local/'):
        path=REPO+'/'+u[len('http://local/'):].split('?')[0]
        if not os.path.exists(path): return await r.fulfill(status=404)
        if path.endswith('render/game.js'):
          src=open(path,encoding='utf-8').read().replace('setTier(gfxTier);','setTier(gfxTier);window.__setTier=setTier;window.__tier=()=>gfxTier;',1)
          return await r.fulfill(body=src,content_type='application/javascript')
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script(INIT)
    await pg.goto('http://local/index.html')
    if os.environ.get('ACT')=='quick':
      await pg.wait_for_function("()=>__click&&__fr.filter(t=>t>__click).length>=5",timeout=600000,polling=500)
      c=await pg.evaluate("__click");lt=await pg.evaluate("__lt");fr=await pg.evaluate("__fr")
      after=[f for f in fr if f>c]
      print(json.dumps({'mode':MODE,'tier':TIER,'boot_to_button_ms':round(c),'click_at_ms':round(c),'click_to_first_frame_ms':round(after[0]-c),'longtasks_from_click':[(round(s-c),round(d)) for s,d in lt if s+d>c][:6],'frames_before_click':len([f for f in fr if f<c]),'longest_before_click':sorted([round(d) for s,d in lt if s<c])[-4:],'steady_frame_ms':sorted([round(b-a) for a,b in zip(after,after[1:])])[len(after)//2-1] if len(after)>2 else None}))
      await b.close();return
    await pg.wait_for_function("()=>!document.getElementById('enter').disabled&&/進場/.test(document.getElementById('enter').textContent)",timeout=600000)
    tReady=await pg.evaluate("performance.now()")
    await pg.wait_for_timeout(int(WAIT*1000))  # the visitor reads the poster
    cdp=await pg.context.new_cdp_session(pg)
    ACT=os.environ.get('ACT','enter');NF=int(os.environ.get('NF','30'))
    if ACT=='tier':
      await pg.evaluate("()=>document.getElementById('enter').click()")
      n0=await pg.evaluate("__fr.length");await pg.wait_for_function(f"()=>__fr.length>={n0+3}",timeout=600000)
    await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{'interval':500});await cdp.send('Profiler.start')
    if ACT=='tier':
      t0=await pg.evaluate("()=>{const t=performance.now();setTimeout(()=>{const a=performance.now();__setTier(__tier()+1);window.__tierMs=performance.now()-a},0);return t}")
    else:
      t0=await pg.evaluate("()=>{const t=performance.now();setTimeout(()=>document.getElementById('enter').click(),0);return t}")
      await pg.wait_for_function("()=>document.getElementById('intro').hidden",timeout=600000)
    await pg.wait_for_function(f"()=>__fr.filter(t=>t>{t0}).length>={NF}",timeout=600000)
    if ACT=='tier':print('setTier call ms',round(await pg.evaluate("window.__tierMs")),'tier now',await pg.evaluate("__tier()"))
    prof=(await cdp.send('Profiler.stop'))['profile']
    lt=await pg.evaluate("__lt");fr=await pg.evaluate("__fr")
    before=[d for s,d in lt if tReady<=s<t0];after=[(round(s-t0),round(d)) for s,d in lt if s>=t0-5]
    gaps=[];prev=None
    for t in fr:
      if t>=t0:
        if prev is not None:gaps.append(round(t-prev))
        prev=t
      elif t<t0:prev=t
    lp=await pg.evaluate("__lp");res=await pg.evaluate("performance.getEntriesByType('resource').map(r=>[r.startTime,r.responseEnd,r.name.split('/').slice(-2).join('/'),r.transferSize||r.encodedBodySize])")
    print('compiles before ready',len([x for x in lp if x<tReady]),'| while poster',len([x for x in lp if tReady<=x<t0]),'| after click',len([x for x in lp if x>=t0]),'at ms',[round(x-t0) for x in lp if x>=t0][:40])
    print('fetched after click',[(round(a-t0),round(b-a),n,z) for a,b,n,z in res if a>=t0][:40])
    f1=next((t for t in fr if t>t0),None)
    print('#162 boot_to_button_ms',round(tReady),'| click_to_first_frame_ms',round(f1-t0) if f1 else None,'| longest_gap_ms',max(gaps or [0]))
    print(json.dumps({'mode':MODE,'tier':TIER,'ready_at_ms':round(tReady),'longtasks_while_poster':[round(x) for x in before],'longtasks_after_click':after[:15],'max_after':max([d for _,d in after] or [0]),'frame_gaps_after_click':gaps[:30],'errs':errs[:3]}))
    # self time by function
    nodes={n['id']:n for n in prof['nodes']};self=collections.Counter()
    dts=prof['timeDeltas'];
    for sid,dt in zip(prof['samples'],dts):
      cf=nodes[sid]['callFrame'];self[(cf['functionName'] or '(anon)',cf['url'].split('/')[-1],cf['lineNumber'])]+=dt/1000
    # inclusive time
    parent={};[parent.__setitem__(c,n['id']) for n in prof['nodes'] for c in n.get('children',[])]
    inc=collections.Counter()
    for sid,dt in zip(prof['samples'],dts):
      seen=set();x=sid
      while x is not None:
        cf=nodes[x]['callFrame'];k=(cf['functionName'] or '(anon)',cf['url'].split('/')[-1],cf['lineNumber'])
        if k not in seen:inc[k]+=dt/1000;seen.add(k)
        x=parent.get(x)
    js=sum(v for k,v in self.items() if k[0] not in ('(program)','(idle)'))
    print('JS+GC ms in profile',round(js),'native/GPU wait ms',round(self[('(program)','',-1)]))
    first=[(round(s),round(d)) for s,d in lt if s<tReady]
    print('longtasks before ready (cold start)',first[-8:])
    print('SELF',[(k,round(v)) for k,v in self.most_common(18)])
    print('INCL',[(k,round(v)) for k,v in inc.most_common(40)])
    await b.close()
asyncio.run(main())
