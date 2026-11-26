# Half-inning break jump check (#42): headless. For every BRK, poses the frame just before and after its start and end and
# lists fielders that jump (> 5 cm, or pop in/out); also per-STEP jumps faster than a sprint inside the break.
# THREE_DIR=.../node_modules/three/ python3 brk_probe.py REPO [STEP]   (harness from compact_probe.py)
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1];STEP=float(sys.argv[2]) if len(sys.argv)>2 else .05
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=';window.__X={poseScene,animate,FIELDER_KEYS,fielders,runners,ump,batter,ball,scene,cpEvents,makeBooth,findIdx,get cpClock(){return cpClock},get T(){return replayT},setT(t){replayT=t},get game(){return game}};'
JS="""async (STEP)=>{const X=window.__X,g=X.game,ev=g.ev,K=X.FIELDER_KEYS;
 const pose=T=>{const i=X.findIdx(T),e=ev[i];X.poseScene(e,T-e.t,STEP,i);const o={};for(const k of K){const f=X.fielders[k];o[k]=[f.g.position.x,f.g.position.z,f.g.visible]}return o};
 const out=[];for(let i=1;i<ev.length;i++){const e=ev[i];if(e.k!=='BRK')continue;
  const ends=[[e.t,'into'],[e.t+e.d,'out']];
  for(const [T,w] of ends){const a=pose(T-.001),b=pose(T+.001);for(const k of K){const d=Math.hypot(a[k][0]-b[k][0],a[k][1]-b[k][1]);if((a[k][2]&&b[k][2]&&d>.05)||(a[k][2]!==b[k][2]))out.push({i,w,k,d:+d.toFixed(2),va:a[k][2],vb:b[k][2],a:a[k].slice(0,2).map(x=>+x.toFixed(1)),b:b[k].slice(0,2).map(x=>+x.toFixed(1)),prev:ev[i-1].k+'/'+(ev[i-1].r||''),next:(ev[i+1]||{}).k})}}
  let p=pose(e.t+.001);for(let T=e.t+STEP;T<e.t+e.d;T+=STEP){const q=pose(T);for(const k of K){const d=Math.hypot(q[k][0]-p[k][0],q[k][1]-p[k][1]);if(q[k][2]&&p[k][2]&&d>8*STEP)out.push({i,w:'mid',k,u:+(T-e.t).toFixed(2),d:+d.toFixed(2)})}p=q}}
 return{nbrk:ev.filter(e=>e.k==='BRK').length,n:out.length,out:out.slice(0,60)}}"""
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
    print('errs',[x for x in errs if 'Failed to load' not in x][:5])
    await b.close()
asyncio.run(main())
