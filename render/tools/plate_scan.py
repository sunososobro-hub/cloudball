# Numeric scan of overlaps at the plate (#128 items 3-5): poses every P event (poseScene + staffGiveWay) at STEP s with the draw loop
# stopped (renderer.setAnimationLoop(null): no SwiftShader frame, 31 seeds in ~50 s). Reports, per event and pair, the closest approach
# under THRESH m of the root positions within 6 m of the plate: C catcher, U plate umpire, B batter, OD next batter walking up, R runners.
# THREE_DIR=.../three/ python3 plate_scan.py REPO 'seed,seed' [STEP=.1] [THRESH=.5]
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO,seeds=sys.argv[1],[int(x) for x in sys.argv[2].split(',')]
STEP=float(sys.argv[3]) if len(sys.argv)>3 else .1
TH_=float(sys.argv[4]) if len(sys.argv)>4 else .5
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=(';window.__X={poseScene,staffGiveWay,fielders,runners,batter,ump,stop(){renderer.setAnimationLoop(null)},'
      'setSeed(s){seedCur=s;decisions={};mode="replay";regen()},get game(){return game},get odNext(){return odNext},get odDeck(){return odDeck}};')
SCAN=r"""([seeds,STEP,TH])=>{const X=window.__X;X.stop();const out=[];const t0=performance.now();
for(const sd of seeds){X.setSeed(sd);const ev=X.game.ev;const best={};
 for(let i=0;i<ev.length;i++){const e=ev[i];if(e.k!=='P')continue;const d=e.d||(ev[i+1]?ev[i+1].t-e.t:6);
  for(let u=0;u<=d+1e-6;u+=STEP){X.poseScene(e,u,STEP,i);X.staffGiveWay();
   const L=[['C',X.fielders.C],['U',X.ump],['B',X.batter],['OD',X.odNext],...X.runners.map((r,j)=>['R'+j,r])].filter(([n,f])=>f&&f.g.visible&&(!f.g.parent||f.g.parent.visible!==false));
   const P=L.map(([n,f])=>[n,f.g.position.x,f.g.position.z]).filter(p=>Math.hypot(p[1],p[2])<6);
   for(let a=0;a<P.length;a++)for(let b=a+1;b<P.length;b++){const A=P[a],B=P[b];const na=A[0][0]==='R'?'R':A[0],nb=B[0][0]==='R'?'R':B[0];
    const key=[na,nb].sort().join('-');if(key==='R-R'||key==='B-OD')continue;const dd=Math.hypot(A[1]-B[1],A[2]-B[2]);
    if(dd<TH){const k=sd+':'+i+':'+key;if(!best[k]||dd<best[k].d)best[k]={seed:sd,i,t:+(e.t+u).toFixed(1),u:+u.toFixed(2),r:e.r,key,d:+dd.toFixed(2),a:[+A[1].toFixed(2),+A[2].toFixed(2)],b:[+B[1].toFixed(2),+B[2].toFixed(2)]}}}}}
 out.push(...Object.values(best))}
return JSON.stringify({ms:Math.round(performance.now()-t0),hits:out})}"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':160,'height':100})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)));pg.on('console',lambda m:m.type=='error' and errs.append(m.text))
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
    await pg.add_init_script("try{localStorage.setItem('zu_gl','1');localStorage.setItem('zu_tier','3')}catch(e){}")
    await pg.goto('http://local/index.html'); await pg.wait_for_function("()=>!!window.__X",timeout=600000,polling=500)
    await pg.evaluate("()=>window.__X.stop()")
    r=json.loads(await pg.evaluate(SCAN,[seeds,STEP,TH_]))
    print('ms',r['ms'],'hits',len(r['hits']))
    from collections import Counter
    print(Counter(h['key'] for h in r['hits']))
    for h in sorted(r['hits'],key=lambda h:(h['key'],h['d'])): print(json.dumps(h,ensure_ascii=False))
    print('errs',[x for x in errs if 'Failed to load' not in x][:3])
    await b.close()
asyncio.run(main())
