# #236: boot on the WebGPU backend (Chrome's SwiftShader Vulkan adapter, so it runs headless) and fail on any pipeline the GPU refuses.
# The picture itself is not judged here (swiftshader WebGPU frames are not the owner's GPU); what it catches is the validation error a real GPU
# also raises ("Async render pipeline creation failed ... targets[1]") and the button time (boot=).
# THREE_DIR=.../node_modules/three/ [ENTER=1 AFTER=15000] [WAIT=90000] python3 gpu_probe.py REPO '?q=0'      (npm i three@0.186.1)
# Exit code 1 when a pipeline failed or the button never woke. ENTER=1 prints renderer.info after entering (not judged, see below).
import sys,os,asyncio,mimetypes
from playwright.async_api import async_playwright
REPO=sys.argv[1];Q=sys.argv[2] if len(sys.argv)>2 else '';BASE='http://localhost/'  # localhost = the dev site (ui/site.js)
TH=os.environ['THREE_DIR'];WAIT=int(os.environ.get('WAIT','90000'));AFTER=int(os.environ.get('AFTER','15000'))
ARGS=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--use-webgpu-adapter=swiftshader','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
NOISE=('Instance dropped','Device Lost','external Instance','willReadFrequently')  # swiftshader teardown and canvas hints
async def main():
  bad=0
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=ARGS)
    pg=await b.new_page(viewport={'width':960,'height':540});logs=[]
    pg.on('console',lambda m:logs.append(m.type+': '+m.text[:300]));pg.on('pageerror',lambda e:logs.append('pageerror: '+str(e)[:300]))
    async def route(r):
      u=r.request.url
      if 'cdn.jsdelivr.net/npm/three@0.186.1/' in u:
        path=TH+u.split('three@0.186.1/')[1].split('?')[0].replace('.min.js','.js')
        return await (r.fulfill(path=path,content_type='application/javascript',headers={'access-control-allow-origin':'*'}) if os.path.exists(path) else r.fulfill(status=404))
      if u.startswith(BASE):
        path=REPO+'/'+u[len(BASE):].split('?')[0]
        if not os.path.exists(path): return await r.fulfill(status=404)
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script("try{localStorage.removeItem('zu_gl');localStorage.removeItem('zu_tier')}catch(e){}")
    await pg.goto(BASE+'play.html'+Q,wait_until='commit')
    print('adapter',await pg.evaluate("navigator.gpu?navigator.gpu.requestAdapter().then(a=>a?(a.info?a.info.vendor+'/'+a.info.architecture:'yes'):'none'):'no navigator.gpu'"))
    try: await pg.wait_for_function("()=>{const e=document.getElementById('enter');return e&&!e.disabled}",timeout=WAIT)
    except Exception: print('FAIL: the enter button never woke');bad=1
    print('backend',await pg.evaluate("window.RENDERER&&RENDERER.backend&&RENDERER.backend.isWebGPUBackend?'webgpu':'webgl'"))
    print('boot=',await pg.evaluate("window.BOOT&&BOOT.str?BOOT.str():'-'"))
    if os.environ.get('ENTER') and not bad:
      await pg.click('#enter');await pg.wait_for_timeout(AFTER)
      if os.environ.get('SHOT'): await pg.screenshot(path=os.environ['SHOT'],timeout=90000)
      # info resets at every render() call (post passes included): sum one second of frames instead of reading the last pass
      info=await pg.evaluate("new Promise(res=>{const I=RENDERER.info;I.autoReset=false;I.reset();setTimeout(()=>{const r={calls:I.render.calls,triangles:I.render.triangles,frames:I.render.frames};I.autoReset=true;res(r)},1000)})")
      print('after entering',info)
      # not judged: swiftshader WebGPU draws a black canvas and counts 0 triangles even on a good commit (07cc935); a real GPU must show > 0
    seen={}
    for l in logs:
      if any(n in l for n in NOISE): continue
      seen[l[:200]]=seen.get(l[:200],0)+1
    for k,n in seen.items(): print(n,'x',k)
    fails=sum(n for k,n in seen.items() if 'pipeline creation failed' in k)
    if fails: print('FAIL:',fails,'pipeline creation errors');bad=1
    await b.close()
  print('OK' if not bad else 'FAILED');sys.exit(bad)
asyncio.run(main())
