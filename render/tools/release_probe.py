# Release point check (#643): headless, no screenshots. Loads play.html (seed 704 by default), enters the game, then for the slowest
# and the fastest thrown pitch (no balk, pickoff or intentional walk) poses the scene at its release time and prints
#   gap  = distance from the ball to the pitcher's throwing hand at the release frame (acceptance: <= .05 m),
#   jump = how far the ball moves over the frame before release (one 60 fps frame), to show it parts from the hand smoothly.
# THREE_DIR=.../node_modules/three/ python3 release_probe.py REPO
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1]
TH=os.environ.get('THREE_DIR','node_modules/three/')
GAP_MAX=.05  # m, issue #643 acceptance
FRAME=1/60
HOOK=';window.__X={poseScene,animate,FIELDER_KEYS,fielders,ball,scene,findIdx,pitchRel,RELEASE,get clip(){return pitchClip},get game(){return game}};'
JS="""async (FRAME)=>{const X=window.__X,g=X.game,ev=g.ev;
 const P=ev.map((e,i)=>[e,i]).filter(([e])=>e.k==='P'&&e.kmh&&!e.bk&&!e.po&&e.r!=='ibb');
 P.sort((a,b)=>a[0].kmh-b[0].kmh);const pick=[P[0],P[P.length-1]];
 const at=(e,i,u)=>{X.poseScene(e,u,FRAME,i);X.scene.updateMatrixWorld(true);const h=X.fielders.P.handWorld(1);return{b:X.ball.position.toArray(),h:[h.x,h.y,h.z]}};
 /* the mocap clip is fetched on the first posed pitch: pose one, wait for it */
 at(pick[0][0],pick[0][1],0);for(let k=0;k<200&&!X.clip;k++)await new Promise(r=>setTimeout(r,100));
 const d=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
 return{seed:g.seed,n:P.length,mocap:!!X.fielders.P.setMocap,clip:!!X.clip,rows:pick.map(([e,i])=>{at(e,i,0);/* poseScene places the pitcher first, then caches pitchRel */const pr=X.pitchRel(e),a=at(e,i,pr),p=at(e,i,pr-FRAME),n=at(e,i,pr+FRAME);
  return{kmh:e.kmh,pt:e.pt,t:+e.t.toFixed(2),release:+pr.toFixed(3),old:X.RELEASE,gap:+d(a.b,a.h).toFixed(4),gapBefore:+d(p.b,p.h).toFixed(4),jump:+d(a.b,p.b).toFixed(4),next:+d(n.b,a.b).toFixed(4)}})}}"""
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':320,'height':200})
    errs=[];pg.on('pageerror',lambda e:errs.append(str(e)))
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
    await pg.add_init_script("try{localStorage.setItem('zu_gl','1');localStorage.setItem('zu_tier','3@'+Date.now());localStorage.setItem('zu_realTime','1')}catch(e){}")
    await pg.goto('http://local/play.html'); await pg.wait_for_function("()=>!document.getElementById('enter').disabled",timeout=900000,polling=1000)
    await pg.evaluate("()=>document.getElementById('enterMute').click()")
    await pg.wait_for_function("()=>window.__X&&window.__X.game",timeout=120000,polling=500)
    await pg.wait_for_timeout(3000)  # the mocap clip loads after entry
    r=await pg.evaluate(JS,FRAME);print(json.dumps(r,ensure_ascii=False,indent=1))
    bad=[x for x in r['rows'] if x['gap']>GAP_MAX]
    print('release gap', 'OK' if not bad else 'TOO FAR', 'max', max(x['gap'] for x in r['rows']), '<=', GAP_MAX)
    print('errs',errs[:5])
    sys.exit(1 if bad or errs else 0)
asyncio.run(main())
