# #133: cold-visit waterfall and entry bar timeline. Every request waits LAT ms (local) or CDN ms (jsdelivr), so serial loads show up.
# RAF_MS=1000 delays every requestAnimationFrame (a throttled tab, #162: the buttons must still wake when the compile ends).
# THREE_DIR=.../node_modules/three/ [OFF=shadows,faces (#162 switches)] [RAF_MS=1000] [LAT=120 CDN=250 W=1280 H=720] [SHOT=out.png SW=900] python3 boot_probe.py REPO
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1];BASE='http://localhost/'  # localhost = the dev site (ui/site.js), so ?off= switches apply
TH=os.environ['THREE_DIR'];LAT=int(os.environ.get('LAT','120'));CDN=int(os.environ.get('CDN','250'));W=int(os.environ.get('W','1280'));H=int(os.environ.get('H','720'));SHOT=os.environ.get('SHOT')
INIT="""window.__s=[];(function f(){const b=document.getElementById('warmBar'),e=document.getElementById('enter');__s.push([Math.round(performance.now()),b?getComputedStyle(b).opacity+'/'+(b.hidden?'H':'')+(b.getAttribute('aria-valuenow')||''):'-',e?(e.disabled?0:1):-1]);requestAnimationFrame(f)})();try{localStorage.setItem('zu_gl','1')}catch(e){}"""
RAF_MS=int(os.environ.get('RAF_MS','0'))
if RAF_MS: INIT="const __raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=f=>setTimeout(()=>__raf(f),%d);"%RAF_MS+INIT
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':W,'height':H},device_scale_factor=2 if SHOT else 1)
    pg.on('pageerror',lambda e:print('ERR',e))
    async def route(r):
      u=r.request.url
      if 'cdn.jsdelivr.net/npm/three@0.186.1/' in u:
        await asyncio.sleep(CDN/1000);path=TH+u.split('three@0.186.1/')[1].split('?')[0].replace('.min.js','.js')
        return await (r.fulfill(path=path,content_type='application/javascript',headers={'access-control-allow-origin':'*'}) if os.path.exists(path) else r.fulfill(status=404))
      if u.startswith(BASE):
        await asyncio.sleep(LAT/1000);path=REPO+'/'+u[len(BASE):].split('?')[0]
        if not os.path.exists(path): return await r.fulfill(status=404)
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script(INIT)
    await pg.goto(BASE+'play.html'+(('?off='+os.environ['OFF']) if os.environ.get('OFF') else ''),wait_until='commit')
    if SHOT:
      await pg.wait_for_timeout(int(os.environ.get('SW','1000')));await pg.screenshot(path=SHOT,timeout=90000);print('shot');return
    await pg.wait_for_function("()=>{const e=document.getElementById('enter');return e&&!e.disabled}",timeout=240000)
    s=await pg.evaluate("__s");res=await pg.evaluate("performance.getEntriesByType('resource').map(e=>[e.name.replace(/^.*(three@0.186.1|localhost)\\//,''),Math.round(e.startTime),Math.round(e.responseEnd)])")
    nav=await pg.evaluate("Math.round(performance.getEntriesByType('navigation')[0].responseEnd)")
    vis=next((t for t,o,_ in s if o.split('/')[0] not in ('0','-')),None)
    chg=[];last=None
    for t,o,e in s:
      if o!=last: chg.append((t,o,e));last=o
    print('boot=',await pg.evaluate("window.BOOT&&BOOT.str?BOOT.str():'-'"))
    print(json.dumps({'boot_to_button_ms':next((t for t,o,e in s if e==1),None),'html_end':nav,'bar_first_visible':vis,'enter_ready':next((t for t,o,e in s if e==1),None),'first_paint_sample':s[0] if s else None,'bar_changes':chg[:40]}))
    res.sort(key=lambda r:r[1])
    for r in res[:40]: print(r)
    await b.close()
asyncio.run(main())
