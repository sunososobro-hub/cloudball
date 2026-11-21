# #133: cold-visit waterfall and entry bar timeline. Every request waits LAT ms (local) or CDN ms (jsdelivr), so serial loads show up.
# THREE_DIR=.../node_modules/three/ [LAT=120 CDN=250 W=1280 H=720] [SHOT=out.png SW=900] python3 boot_probe.py REPO
from playwright.async_api import async_playwright
REPO=sys.argv[1];TH=os.environ['THREE_DIR'];LAT=int(os.environ.get('LAT','120'));CDN=int(os.environ.get('CDN','250'));W=int(os.environ.get('W','1280'));H=int(os.environ.get('H','720'));SHOT=os.environ.get('SHOT')
INIT="""window.__s=[];(function f(){const b=document.getElementById('warmBar'),e=document.getElementById('enter');__s.push([Math.round(performance.now()),b?getComputedStyle(b).opacity+'/'+(b.hidden?'H':'')+(b.getAttribute('aria-valuenow')||''):'-',e?(e.disabled?0:1):-1]);requestAnimationFrame(f)})();try{localStorage.setItem('zu_gl','1')}catch(e){}"""
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
      if u.startswith('http://local/'):
        await asyncio.sleep(LAT/1000);path=REPO+'/'+u[len('http://local/'):].split('?')[0]
        if not os.path.exists(path): return await r.fulfill(status=404)
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script(INIT)
    await pg.goto('http://local/index.html',wait_until='commit')
    if SHOT:
      await pg.wait_for_timeout(int(os.environ.get('SW','1000')));await pg.screenshot(path=SHOT,timeout=90000);print('shot');return
    await pg.wait_for_function("()=>{const e=document.getElementById('enter');return e&&!e.disabled}",timeout=240000)
    s=await pg.evaluate("__s");res=await pg.evaluate("performance.getEntriesByType('resource').map(e=>[e.name.replace(/^.*(three@0.186.1|local)\\//,''),Math.round(e.startTime),Math.round(e.responseEnd)])")
    nav=await pg.evaluate("Math.round(performance.getEntriesByType('navigation')[0].responseEnd)")
    vis=next((t for t,o,_ in s if o.split('/')[0] not in ('0','-')),None)
    chg=[];last=None
    for t,o,e in s:
      if o!=last: chg.append((t,o,e));last=o
    print(json.dumps({'html_end':nav,'bar_first_visible':vis,'enter_ready':next((t for t,o,e in s if e==1),None),'first_paint_sample':s[0] if s else None,'bar_changes':chg[:40]}))
    res.sort(key=lambda r:r[1])
    for r in res[:40]: print(r)
    await b.close()
asyncio.run(main())
