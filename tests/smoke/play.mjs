/* #472 browser smoke (CI job `full`, not per PR): serve the repo as static files, open play.html in headless Chromium,
 * press 開始, and fail when the page throws (pageerror / boot failed), the start button never wakes up, or the centre of
 * the frame is all black after the game started. Needs `playwright` (CI installs it; a global install works with NODE_PATH=$(npm root -g)).
 * Usage: node tests/smoke/play.mjs   (PORT=8123, SMOKE_URL=play.html?q=low; OFFLINE_THREE=<node_modules/three> serves the
 * three.js CDN files from a local copy and drops other outside requests, for a machine without that network) */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createRequire} from 'node:module';
const {chromium}=createRequire(import.meta.url)('playwright');   /* require: also finds a global install through NODE_PATH */
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const PORT=Number(process.env.PORT||8123),PAGE=process.env.SMOKE_URL||'play.html';
const READY_MS=90000;      /* the start button wakes after the park compiles; software GL on a CI runner is slow */
const PLAY_MS=8000;        /* how long the game runs before the frame is read */
const SHOT_MS=60000,SHOT_TRIES=3;   /* one screenshot wait, and how many tries */
const DARK=12;             /* a centre pixel with every channel <= this is black */
const BLACK_SHARE=0.98;    /* the centre counts as all black when at least this share of its pixels is black */
const TYPES={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.txt':'text/plain','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.glb':'model/gltf-binary','.bin':'application/octet-stream','.ktx2':'image/ktx2','.hdr':'application/octet-stream','.ogg':'audio/ogg','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://x').pathname).replace(/^\/+/,'')||'index.html';
  const file=path.resolve(ROOT,rel);
  if(!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return}
  try{const body=await readFile(file);res.writeHead(200,{'content-type':TYPES[path.extname(file).toLowerCase()]||'application/octet-stream'}).end(body)}
  catch(e){res.writeHead(404).end()}
});
await new Promise(r=>server.listen(PORT,'127.0.0.1',r));
const bad=[];
const ARGS=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'];
/* #534: the old headless shell never returned from page.screenshot on the CI runner (30 s timeout) while WebGL kept every frame busy;
 * the full Chromium in new headless mode composites with software GL, so try it first and fall back to the default build. */
const browser=await chromium.launch({channel:'chromium',args:ARGS}).catch(()=>chromium.launch({args:ARGS}));
try{
  const page=await browser.newPage({viewport:{width:960,height:540}});
  const local=process.env.OFFLINE_THREE;
  if(local)await page.route(u=>!u.href.startsWith(`http://127.0.0.1:${PORT}/`),async r=>{
    const m=/^https:\/\/cdn\.jsdelivr\.net\/npm\/three@[^/]+\/(.+)$/.exec(r.request().url());
    if(!m)return r.abort();
    let f=path.join(local,m[1]);try{await readFile(f)}catch(e){f=f.replace(/\.min\.js$/,'.js')}
    try{await r.fulfill({body:await readFile(f),contentType:'text/javascript',headers:{'access-control-allow-origin':'*'}})}catch(e){r.abort()}});
  page.on('pageerror',e=>bad.push(`pageerror: ${e.message}`));
  page.on('console',m=>{if(m.type()==='error'&&/boot failed/.test(m.text()))bad.push(`console: ${m.text()}`)});
  await page.goto(`http://127.0.0.1:${PORT}/${PAGE}`,{waitUntil:'load',timeout:60000});
  try{await page.waitForFunction(()=>{const b=document.getElementById('enter');return b&&!b.disabled},null,{timeout:READY_MS})}
  catch(e){bad.push(`the start button (#enter) did not wake up within ${READY_MS/1000} s`)}
  if(await page.evaluate(()=>window.BOOT&&window.BOOT.failed))bad.push('BOOT.failed is set (the page shows 載入失敗)');
  if(!bad.length){
    await page.click('#enter');
    await page.waitForTimeout(PLAY_MS);
    if(await page.evaluate(()=>{const i=document.getElementById('intro');return !!i&&!i.hidden}))bad.push('the entry card is still up after 開始');
    const vp=page.viewportSize(),w=Math.round(vp.width/3),h=Math.round(vp.height/3);
    let shot;   /* #534: a software-GL frame can take long; retry, and let each try wait for it */
    for(let k=1;;k++){try{shot=await page.screenshot({clip:{x:w,y:h,width:w,height:h},timeout:SHOT_MS});break}
      catch(e){if(k>=SHOT_TRIES){bad.push(`page.screenshot failed ${k} times: ${e.message.split('\n')[0]}`);break}console.log(`screenshot try ${k} failed, retrying`)}}
    if(shot){
    const share=await page.evaluate(async b64=>{const im=new Image();im.src='data:image/png;base64,'+b64;await im.decode();
      const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data;let k=0;for(let i=0;i<d.length;i+=4)if(d[i]<=12&&d[i+1]<=12&&d[i+2]<=12)k++;return k/(d.length/4)},shot.toString('base64'));
    console.log(`centre of the frame: ${(share*100).toFixed(1)}% black pixels`);
    if(share>=BLACK_SHARE)bad.push(`the centre of the frame is all black (${(share*100).toFixed(1)}% of pixels <= ${DARK})`);
    }
  }
}finally{await browser.close();server.close()}
if(bad.length){console.error('FAIL play smoke:\n - '+bad.join('\n - '));process.exit(1)}
console.log(`play smoke ok: ${PAGE} boots, starts a game and draws a picture`);
