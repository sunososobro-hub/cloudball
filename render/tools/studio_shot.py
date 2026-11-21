# Headless Chrome contact sheet of one action-studio clip, for render checks (~25-90 s per frame on swiftshader).
# THREE_DIR=.../node_modules/three/ OUT=/tmp python3 studio_shot.py REPO ACT CLIP '1.2,2.05' 'back=-0.9,1.2,7/-0.9,1,0/30' TAG
import sys,os,asyncio,mimetypes
from playwright.async_api import async_playwright
from PIL import Image,ImageDraw
OUT=os.environ.get('OUT','/tmp')
REPO,act,clip,times,cams,tag=sys.argv[1],sys.argv[2],int(sys.argv[3]),[float(x) for x in sys.argv[4].split(',')],sys.argv[5],sys.argv[6]
CAMS=[]
for c in cams.split(';'):
  n,v=c.split('=');p,t,f=v.split('/');CAMS.append((n,[float(x) for x in p.split(',')],[float(x) for x in t.split(',')],float(f)))
TH=os.environ.get('THREE_DIR','node_modules/three/')  # npm i three@0.186.1 (the CDN is blocked in sessions)
async def main():
  async with async_playwright() as p:
    b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg=await b.new_page(viewport={'width':800,'height':560})
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
          s=open(path,encoding='utf-8').read().replace('placeCamera(dt);','placeCamera(dt);if(window.__cam){const C=window.__cam;rig.rotation.set(0,0,0);rig.position.set(...C.p);camera.position.set(0,0,0);rig.updateMatrixWorld(true);camera.fov=C.f;camera.lookAt(...C.t);camera.updateProjectionMatrix()}',1)
          return await r.fulfill(body=s,content_type='application/javascript')
        return await r.fulfill(path=path,content_type=mimetypes.guess_type(path)[0] or 'application/octet-stream')
      return await r.abort()
    await pg.route('**/*',route)
    await pg.add_init_script("try{localStorage.setItem('zu_gl','1');localStorage.setItem('zu_tier','0')}catch(e){}")
    await pg.goto('http://local/index.html'); await pg.wait_for_timeout(6000)
    await pg.evaluate("()=>{const b=[...document.querySelectorAll('#intro button')];b.length&&b[b.length-1].click()}"); await pg.wait_for_timeout(1000)
    await pg.evaluate("()=>document.getElementById('studioBtn').click()"); await pg.wait_for_timeout(1000)
    await pg.evaluate(f"()=>{{const s=document.getElementById('stAct');s.value='{act}';s.dispatchEvent(new Event('change'))}}"); await pg.wait_for_timeout(1000)
    for i in range(clip): await pg.evaluate("()=>document.getElementById('stNext').click()"); await pg.wait_for_timeout(500)
    scr="()=>{const s=document.getElementById('stScrub');s.value=1000;s.dispatchEvent(new Event('input'))}"
    await pg.evaluate(scr); await pg.wait_for_timeout(400)
    dur=float((await pg.evaluate("()=>document.getElementById('stT').textContent"))[:-1])
    desc=await pg.evaluate("()=>document.getElementById('who')?.innerText||''")
    await pg.add_style_tag(content='body>*:not(canvas){visibility:hidden !important}#cv,canvas{visibility:visible !important}')
    rows=[]
    for (n,P,T,F) in CAMS:
      await pg.evaluate(f"()=>{{window.__cam={{p:{P},t:{T},f:{F}}}}}")
      row=[]
      for t in times:
        await pg.evaluate(f"()=>{{const s=document.getElementById('stScrub');s.value={round(1000*t/dur)};s.dispatchEvent(new Event('input'))}}")
        await pg.wait_for_timeout(900)
        f=OUT+f'/{tag}_{n}_{t:.2f}.png';await pg.screenshot(path=f,timeout=180000)
        im=Image.open(f).resize((400,280));ImageDraw.Draw(im).text((6,6),f'{n} {t:.2f}s',fill=(255,255,0));row.append(im)
      rows.append(row)
    W=Image.new('RGB',(400*len(times),280*len(rows)))
    for j,row in enumerate(rows):
      for i,im in enumerate(row): W.paste(im,(400*i,280*j))
    W.save(OUT+f'/{tag}.png')
    print('dur',dur,'|',desc.replace('\n',' ')[:120],'| errs',errs[:3])
    await b.close()
asyncio.run(main())
