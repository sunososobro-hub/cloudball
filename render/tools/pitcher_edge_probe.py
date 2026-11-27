# Pitcher boundary check (#687): headless, no screenshots. For every P frame followed by a VOTE / CHG / VIS frame of the same game, poses the
# pitcher (every bone matrix) at STEP s from one step before the boundary to .5 s after, and lists boundaries where any matrix moves more than
# .01 per step. n = boundaries scanned, bad = over the limit, sample = the bad ones.
# THREE_DIR=.../node_modules/three/ python3 pitcher_edge_probe.py REPO [STEP] [SEEDS]
# SEEDS: 'a,b,c' or 'a-b' (inclusive): scan those simulated games (regen, no decisions) instead of the frozen opening game; MODE=replay (default) | opening | practice.
import sys,os,asyncio,mimetypes,json
from playwright.async_api import async_playwright
REPO=sys.argv[1];STEP=float(sys.argv[2]) if len(sys.argv)>2 else .05
def seedlist(a):
  out=[]
  for x in a.split(','):
    if '-' in x[1:]: lo,hi=x.split('-',1);out+=range(int(lo),int(hi)+1)
    elif x: out.append(int(x))
  return out
SEEDS=seedlist(sys.argv[3]) if len(sys.argv)>3 else []
MODE=os.environ.get('MODE','replay')
TH=os.environ.get('THREE_DIR','node_modules/three/')
HOOK=';window.__X={poseScene,animate,FIELDER_KEYS,fielders,runners,ump,batter,ball,scene,cpEvents,makeBooth,findIdx,get cpClock(){return cpClock},get T(){return replayT},setT(t){replayT=t},setSeed(s,m){seedCur=s;decisions={};mode=m;regen();if(m==="opening")cpLoad(game);lastIdx=-1},get game(){return game}};'
JS="""async ([STEP,SEED,MODE])=>{const X=window.__X;if(SEED!==null)X.setSeed(SEED,MODE);const g=X.game,ev=g.ev;
 const objs=[];X.fielders.P.g.traverse(o=>objs.push(o));
 const vis=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true};
 const sig=()=>{X.scene.updateMatrixWorld(true);const s=new Float32Array(objs.length*17);let n=0;for(const o of objs){const v=vis(o);s[n++]=v?1:0;const m=o.matrixWorld.elements;for(let j=0;j<16;j++)s[n++]=v?m[j]:0}return s};
 const pose=T=>{const i=X.findIdx(T),e=ev[i];X.poseScene(e,T-e.t,STEP,i);for(const k of X.FIELDER_KEYS){const f=X.fielders[k];if(!f.noAnim)X.animate(f,STEP)}return sig()};
 let wo='';const diff=(a,b)=>{let w=0,wi=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d>w){w=d;wi=i}}const o=objs[Math.floor(wi/17)];wo=o?(o.name||o.type):'';return w};
 const out=[];
 for(let i=0;i<ev.length-1;i++){const e=ev[i],nx=ev[i+1];if(e.k!=='P'||!['VOTE','CHG','VIS'].includes(nx.k))continue;
  let p=pose(nx.t-STEP),worst=0,wT=0,wObj='';
  for(let T=nx.t;T<nx.t+.5;T+=STEP){const s=pose(T);const w=diff(p,s);if(w>worst){worst=w;wT=T-nx.t;wObj=wo}p=s}
  out.push({seed:SEED,desc:e.desc,i,t:+nx.t.toFixed(2),prev:(e.r||'')+(e.k2||''),next:nx.k,worst:+worst.toFixed(3),at:+wT.toFixed(2),obj:wObj})}
 const bad=out.filter(o=>o.worst>.01);
 return{n:out.length,bad:bad.length,sample:out.filter(o=>o.worst>.01),byNext:out.reduce((m,o)=>(m[o.next]=(m[o.next]||0)+1,m),{})}}"""
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
    if not SEEDS: r=await pg.evaluate(JS,[STEP,None,None]);print(json.dumps(r,ensure_ascii=False,indent=1))
    else:
      tot={'seeds':len(SEEDS),'n':0,'bad':0,'byNext':{},'sample':[]}
      for sd in SEEDS:
        r=await pg.evaluate(JS,[STEP,sd,MODE]);tot['n']+=r['n'];tot['bad']+=r['bad'];tot['sample']+=r['sample']
        for k,v in r['byNext'].items(): tot['byNext'][k]=tot['byNext'].get(k,0)+v
        print('seed',sd,'n',r['n'],'bad',r['bad'],flush=True)
      print(json.dumps(tot,ensure_ascii=False,indent=1))
    print('errs',[x for x in errs if 'Failed to load' not in x][:5])
    await b.close()
asyncio.run(main())
