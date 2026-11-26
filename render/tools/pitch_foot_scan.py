# Planted-foot scan of the skinned pitcher in game.js (#274, #281): poses every P event (poseScene) at STEP s with the draw loop stopped,
# reads the pitcher's ankle bones (ftL / ftR) in world space, and reports per foot the worst horizontal travel while it is planted, with
# the same rule as players.js plantedDrift (ankle within PLANT_Y hip heights of the lowest ankle of the pitch, slower than PLANT_V).
# `glide` = the same without the speed rule: worst horizontal travel of an ankle that stays on the floor (a dragged foot, not a step).
# Window: u in [U0, U1] (default 2.0 to PM_BACK[0] 3.4 = around the PM_OUT hand-off from the clip to the keyframes; the walk back after
# PM_BACK is a separate solved step). Pitches with a ball in play are skipped unless ALL=1 (the fielding blend is #274 item 2).
# THREE_DIR=.../three/ python3 pitch_foot_scan.py REPO 'seed,seed' [STEP=1/30] [MAXP=40 pitches per seed] [U0 U1]
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO,seeds=sys.argv[1],[int(x) for x in sys.argv[2].split(',')]
STEP=float(sys.argv[3]) if len(sys.argv)>3 else 1/30
MAXP=int(sys.argv[4]) if len(sys.argv)>4 else 40
U0=float(sys.argv[5]) if len(sys.argv)>5 else 2.0
U1=float(sys.argv[6]) if len(sys.argv)>6 else 3.4
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=(';window.__X={poseScene,fielders,pitchPose,get pitchClip(){return pitchClip},PM_OUT,PM_BACK,'
      'stop(){renderer.setAnimationLoop(null)},'
      'setSeed(s){seedCur=s;decisions={};mode="replay";regen()},get game(){return game}};')
SCAN=r"""async ([seeds,STEP,MAXP,U0,U1,ALL,TRACE])=>{const X=window.__X;X.stop();const t0=performance.now();
X.pitchPose(0);for(let i=0;i<200&&!X.pitchClip;i++)await new Promise(r=>setTimeout(r,100));if(!X.pitchClip)return JSON.stringify({err:'no pitch clip'});
const PLANT_Y=.08,PLANT_V=.3,V=()=>new X.fielders.P.g.position.constructor(),v=V(),out=[],worst={L:0,R:0,gL:0,gR:0},seen={pitches:0,skipped:0,planted:0};let trace=null;
for(const sd of seeds){X.setSeed(sd);const ev=X.game.ev;let n=0;
 for(let i=0;i<ev.length&&n<MAXP;i++){const e=ev[i];if(e.k!=='P'||e.bk||e.po)continue;if(!ALL&&e.r==='inplay'){seen.skipped++;continue}n++;seen.pitches++;
  const P=X.fielders.P,nm={};P.g.traverse(o=>{if(o.name==='ftL'||o.name==='ftR')nm[o.name]=o});if(!nm.ftL)return JSON.stringify({err:'pitcher has no rig bones'});
  const F=[];for(let u=0;u<=U1+1e-6;u+=STEP){X.poseScene(e,u,STEP,i);P.g.updateMatrixWorld(true);F.push({u,L:nm.ftL.getWorldPosition(v).toArray(),R:nm.ftR.getWorldPosition(v).toArray()})}
  if(TRACE&&!trace)trace=F.filter(f=>f.u>=U0-.2).map(f=>[+f.u.toFixed(2),...f.L.map(x=>+x.toFixed(3)),...f.R.map(x=>+x.toFixed(3))]);
  const floor=Math.min(...F.map(f=>Math.min(f.L[1],f.R[1]))),k=P.k||1,py=PLANT_Y*.95*k,pv=PLANT_V*.95*k;
  for(const s of ['L','R']){let anc=null,best=0,at=0,ga=null,gl=0,gat=0;
   for(let j=1;j<F.length;j++){const a=F[j-1][s],b=F[j][s],sp=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2])/STEP;
    if(F[j].u<U0){anc=null;ga=null;continue}
    if(b[1]-floor<py){if(!ga)ga=b;const g=Math.hypot(b[0]-ga[0],b[2]-ga[2]);if(g>gl){gl=g;gat=F[j].u}}else ga=null;
    if(b[1]-floor<py&&sp<pv){if(!anc)anc=b;seen.planted++;const d=Math.hypot(b[0]-anc[0],b[2]-anc[2]);if(d>best){best=d;at=F[j].u}}else anc=null}
   if(best>worst[s])worst[s]=best;if(gl>worst['g'+s])worst['g'+s]=gl;out.push({seed:sd,i,foot:s,cm:+(best*100).toFixed(1),u:+at.toFixed(2),glide:+(gl*100).toFixed(1),gu:+gat.toFixed(2),throws:P.throws})}}}
return JSON.stringify({ms:Math.round(performance.now()-t0),out,worst:Object.fromEntries(Object.entries(worst).map(([k,x])=>[k,+(x*100).toFixed(1)])),seen,trace})}"""
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
    await pg.goto('http://local/play.html'); await pg.wait_for_function("()=>!!window.__X",timeout=600000,polling=500)
    await pg.evaluate("()=>window.__X.stop()")
    r=json.loads(await pg.evaluate(SCAN,[seeds,STEP,MAXP,U0,U1,os.environ.get('ALL')=='1',os.environ.get('TRACE')=='1']))
    if 'err' in r: print('err',r['err']); await b.close(); return
    print('ms',r['ms'],'worst cm',r['worst'],r['seen'])
    for h in sorted(r['out'],key=lambda h:-max(h['cm'],h['glide']))[:12]: print(json.dumps(h))
    for row in r.get('trace') or []: print('trace u Lx Ly Lz Rx Ry Rz',row)
    print('errs',[x for x in errs if 'Failed to load' not in x][:3])
    await b.close()
asyncio.run(main())
