# Event boundary jump check (#42): headless. Poses every event 1 ms before and after its start and lists fielders that jump > .3 m
# (both frames visible), by position, with the previous play. THREE_DIR=.../node_modules/three/ python3 edge_probe.py REPO
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1];STEP=float(sys.argv[2]) if len(sys.argv)>2 else .05
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=';window.__X={poseScene,animate,FIELDER_KEYS,fielders,runners,ump,batter,ball,scene,cpEvents,makeBooth,findIdx,get cpClock(){return cpClock},get T(){return replayT},setT(t){replayT=t},get game(){return game}};'
JS="""async (STEP)=>{const X=window.__X,g=X.game,ev=g.ev,K=X.FIELDER_KEYS;
 const pose=T=>{const i=X.findIdx(T),e=ev[i];X.poseScene(e,T-e.t,STEP,i);const o={};for(const k of K){const f=X.fielders[k];o[k]=[f.g.position.x,f.g.position.z,f.g.visible]}return o};
 const out=[];let n=0;for(let i=1;i<ev.length;i++){const e=ev[i];n++;const a=pose(e.t-.001),b=pose(e.t+.001);for(const k of K){const d=Math.hypot(a[k][0]-b[k][0],a[k][1]-b[k][1]);if(a[k][2]&&b[k][2]&&d>.3)out.push({i,k,d:+d.toFixed(2),prev:ev[i-1].k+'/'+(ev[i-1].r||'')+'/'+((ev[i-1].play||{}).fielder||''),cur:e.k})}}
 const byK={};out.forEach(o=>byK[o.k]=(byK[o.k]||0)+1);
 return{nev:n,n:out.length,byK,P:out.filter(o=>o.k==='P').slice(0,15),other:out.filter(o=>o.k!=='P').slice(0,8)}}"""
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
