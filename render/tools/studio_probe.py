# Numeric probe of one action-studio clip: evaluates a JS expression at each time, no screenshots (fast).
# THREE_DIR=.../node_modules/three/ python3 studio_probe.py REPO ACT CLIP '1.2,2.05' 'JS expression'
# The expression sees X = {batter,bat,ball,fielders,runners,BR,game,studio} plus V(obj3d) -> [x,y,z] world position.
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO,act,clip,times,expr=sys.argv[1],sys.argv[2],int(sys.argv[3]),[float(x) for x in sys.argv[4].split(',')],sys.argv[5]
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=';window.__X={batter,bat,ball,fielders,runners,BR,studioClips,ROSTERS,get game(){return game},get studio(){return studio}};'
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':320,'height':200})
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
    await pg.add_init_script("try{localStorage.setItem('zu_gl','1');localStorage.setItem('zu_tier','0')}catch(e){}")
    await pg.goto('http://local/index.html'); await pg.wait_for_timeout(6000)
    if not await pg.evaluate("()=>!!window.__X"): print('page failed:',[x for x in errs if 'Failed to load resource' not in x][:5]); return await b.close()
    await pg.evaluate("()=>{const b=[...document.querySelectorAll('#intro button')];b.length&&b[b.length-1].click()}"); await pg.wait_for_timeout(800)
    await pg.evaluate("()=>document.getElementById('studioBtn').click()"); await pg.wait_for_timeout(800)
    await pg.evaluate(f"()=>{{const s=document.getElementById('stAct');s.value='{act}';s.dispatchEvent(new Event('change'))}}"); await pg.wait_for_timeout(800)
    for i in range(clip): await pg.evaluate("()=>document.getElementById('stNext').click()"); await pg.wait_for_timeout(300)
    for t in times:
      await pg.evaluate(f"()=>{{const s=document.getElementById('stScrub'),S=window.__X.studio;s.value={1000}*{t}/(S.t1-S.t0);s.dispatchEvent(new Event('input'))}}")
      await pg.wait_for_timeout(350)
      r=await pg.evaluate("(E)=>{const X=window.__X,V=o=>{o.updateWorldMatrix(true,false);const v=o.getWorldPosition(new o.position.constructor());return[+v.x.toFixed(3),+v.y.toFixed(3),+v.z.toFixed(3)]};return JSON.stringify(eval(E))}",expr)
      print(f'{t:.2f}',r)
    print('errs',errs[:3])
    await b.close()
asyncio.run(main())
