/* Real-GPU shots mailbox (#444), PC part. Runs on the owner's Windows PC from Task Scheduler every 15 min:
 *   node <code>\tools\gpu_shots\shots.mjs            (code = a plain clone of cloudball on branch dev, no credentials)
 * One run:
 *   1. git fetch dev; the dev tip must be an owner merge with a green `test` check (REST, read only) -> else stop, one log line
 *   2. git fetch cloudball-shots (SSH deploy key); requests/<id>.json that requestRunnable() accepts run once each,
 *      results go to results/<id>/; nothing new and no capture due -> exit without starting a browser
 *   3. at most once an hour: gpu/<UTC run>/ (play.html ?q=max broadcast / tag / batter, agent.html front / back,
 *      baseball9.html) + gpu/latest/, keep the newest 7 runs, 20 MB cap a run
 *   4. commit + push to cloudball-shots main only
 * Chrome: path from the registry App Paths, headless, a FRESH empty temp profile (deleted after), only this repo served from
 * 127.0.0.1 plus the three.js build and web fonts (lib.mjs ALLOWED_PREFIXES); only page pixels are captured.
 * Every text that leaves the PC goes through scrub() (lib.mjs). No secret is read from or written to this repo.
 * Not run in CI (needs a real GPU); `node --check` and the pure part are (tests/gpu_shots.check.mjs).
 * Env (optional): GPU_SHOTS_HOME (default %LOCALAPPDATA%\cloudball-gpu), GPU_SHOTS_KEY (default ~\.ssh\cloudball_shots_ed25519),
 * CHROME (exe path when the registry has none). Flags: --force-capture (take the hourly frames now), --dry (no push). */
import { spawnSync, spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, statSync, appendFileSync, cpSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scrub, devTipOk, keepRuns, underCap, manifestProblems, requestRunnable, allowedUrl, safeFile, appPathFromReg, runStamp, captureDue, OWNER, SHOTS_REPO, KEEP_RUNS, RUN_CAP_BYTES } from './lib.mjs';

const CODE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOME = process.env.GPU_SHOTS_HOME || path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'cloudball-gpu');
const SHOTS = path.join(HOME, 'shots');
const LOG = path.join(HOME, 'log.txt');
const KEY = process.env.GPU_SHOTS_KEY || path.join(os.homedir(), '.ssh', 'cloudball_shots_ed25519');
const CODE_REPO = 'sunososobro-hub/cloudball';
const FORCE = process.argv.includes('--force-capture'), DRY = process.argv.includes('--dry');
const VIEW = { width: 1280, height: 720 };
const READY_MS = 180000, SETTLE_MS = 8000, STEP_MS = 1200;
/* the hourly capture: every act of lib.mjs ACTS on the top tier */
const HOURLY = [['play.html', 'broadcast'], ['play.html', 'tag'], ['play.html', 'batter'], ['agent.html', 'front'], ['agent.html', 'back'], ['baseball9.html', 'default']].map(([page, act]) => ({ page, act, tier: 'max' }));
const CTX = { user: os.userInfo().username, host: os.hostname(), extra: [os.homedir(), HOME] };
const clean = s => scrub(s, CTX);

mkdirSync(HOME, { recursive: true });
let logBuf = [];
function log(msg) {
  const line = `${new Date().toISOString()} ${clean(msg)}`;
  logBuf.push(line);
  try { appendFileSync(LOG, line + '\n'); } catch (e) { /* the log is best effort */ }
}
function git(cwd, args, env = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args[0]} failed: ${(r.stderr || '').trim().split('\n').pop()}`);
  return (r.stdout || '').trim();
}
/* only the deploy key, never the agent or other keys; known_hosts lives in the mailbox folder, not in ~/.ssh */
const SSH_ENV = { GIT_SSH_COMMAND: `ssh -i "${KEY}" -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile="${path.join(HOME, 'known_hosts')}"` };
const GIT_ID = ['-c', 'user.name=cloudball-gpu-pc', '-c', 'user.email=cloudball-gpu-pc@users.noreply.github.com'];
async function rest(p) {
  const r = await fetch(`https://api.github.com/${p}`, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'cloudball-gpu-shots' } });
  if (!r.ok) throw new Error(`GET ${p.split('?')[0]} -> ${r.status}`);
  return r.json();
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 1. code: the dev tip must be an owner merge with a green test ---------- */
async function updateCode() {
  git(CODE, ['fetch', '--quiet', 'origin', 'dev']);
  const sha = git(CODE, ['rev-parse', 'origin/dev']);
  const [commit, checks] = await Promise.all([rest(`repos/${CODE_REPO}/commits/${sha}`), rest(`repos/${CODE_REPO}/commits/${sha}/check-runs?per_page=100`)]);
  const v = devTipOk(commit, checks.check_runs);
  if (!v.ok) return { ok: false, why: v.why, sha };
  if (git(CODE, ['rev-parse', 'HEAD']) !== sha) git(CODE, ['checkout', '--quiet', '--detach', sha]);
  return { ok: true, sha };
}

/* ---------- local static server: this repo only, 127.0.0.1 only ---------- */
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml', glb: 'model/gltf-binary', bin: 'application/octet-stream', wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', webp: 'image/webp', txt: 'text/plain' };
function serve() {
  const srv = createServer((req, res) => {
    const rel = req.method === 'GET' ? safeFile(req.url) : null;
    const file = rel && path.join(CODE, ...rel.split('/'));
    if (!file || !existsSync(file) || !statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).slice(1).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(file));
  });
  return new Promise(ok => srv.listen(0, '127.0.0.1', () => ok({ srv, origin: `http://127.0.0.1:${srv.address().port}` })));
}

/* ---------- Chrome over the DevTools protocol (Node's built-in WebSocket, no packages) ---------- */
function findChrome() {
  if (process.env.CHROME && existsSync(process.env.CHROME)) return process.env.CHROME;
  for (const hive of ['HKLM', 'HKCU']) {
    const r = spawnSync('reg', ['query', `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\chrome.exe`, '/ve'], { encoding: 'utf8', windowsHide: true });
    const p = r.status === 0 ? appPathFromReg(r.stdout) : '';
    if (p && existsSync(p)) return p;
  }
  throw new Error('Chrome not found in App Paths (set CHROME)');
}
async function launch() {
  const profile = mkdtempSync(path.join(os.tmpdir(), 'cb-gpu-'));
  const args = ['--headless=new', `--user-data-dir=${profile}`, '--remote-debugging-port=0', '--no-first-run', '--no-default-browser-check',
    '--disable-extensions', '--disable-sync', '--disable-background-networking', '--enable-unsafe-webgpu', '--ignore-gpu-blocklist',
    `--window-size=${VIEW.width},${VIEW.height}`, 'about:blank'];
  const proc = spawn(findChrome(), args, { stdio: 'ignore', windowsHide: true });
  const portFile = path.join(profile, 'DevToolsActivePort');
  for (let i = 0; i < 100 && !existsSync(portFile); i++) await sleep(200);
  const [port, wsPath] = readFileSync(portFile, 'utf8').split('\n');
  const ws = new WebSocket(`ws://127.0.0.1:${port.trim()}${wsPath.trim()}`);
  await new Promise((ok, no) => { ws.onopen = ok; ws.onerror = () => no(new Error('DevTools socket failed')); });
  let id = 0; const wait = new Map(), handlers = [];
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && wait.has(m.id)) { const w = wait.get(m.id); wait.delete(m.id); m.error ? w.no(new Error(m.error.message)) : w.ok(m.result); }
    else if (m.method) for (const h of handlers) h(m);
  };
  const send = (method, params = {}, sessionId) => new Promise((ok, no) => { const i = ++id; wait.set(i, { ok, no }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
  const close = async () => {
    try { await send('Browser.close'); } catch (e) { /* already gone */ }
    try { ws.close(); } catch (e) { /* closed */ }
    for (let i = 0; i < 25 && proc.exitCode === null; i++) await sleep(200);
    if (proc.exitCode === null) proc.kill();
    await sleep(500);
    rmSync(profile, { recursive: true, force: true, maxRetries: 5 });
  };
  return { send, on: h => handlers.push(h), close };
}

/* one tab: local origin + allowed CDNs only, console errors collected, reduced motion (the agent preview stands still) */
async function openPage(B, origin, page, tier) {
  const { targetId } = await B.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await B.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => B.send(m, p, sessionId), errors = [];
  B.on(m => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Fetch.requestPaused') {
      const ok = allowedUrl(m.params.request.url, origin);
      S(ok ? 'Fetch.continueRequest' : 'Fetch.failRequest', ok ? { requestId: m.params.requestId } : { requestId: m.params.requestId, errorReason: 'BlockedByClient' }).catch(() => {});
      if (!ok) errors.push(`blocked ${m.params.request.url.split('?')[0]}`);
    } else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description ?? '').join(' '));
  });
  await S('Fetch.enable', { patterns: [{ urlPattern: '*' }] });
  await S('Runtime.enable');
  await S('Page.enable');
  await S('Emulation.setDeviceMetricsOverride', { ...VIEW, deviceScaleFactor: 1, mobile: false });
  await S('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  /* tiers: max = ?q=max (dev site); high = tier 0; low = the lowest auto tier (game.js TIER_MAX) */
  const tierInit = tier === 'low' ? `localStorage.setItem('zu_tier','3@'+Date.now())` : `localStorage.removeItem('zu_tier')`;
  await S('Page.addScriptToEvaluateOnNewDocument', { source: `try{localStorage.setItem('zu_gl','1');${tierInit}}catch(e){}` });
  const q = page === 'play.html' ? (tier === 'max' ? '?q=max' : '?q=0') : '';
  const t0 = Date.now();
  await S('Page.navigate', { url: `${origin}/${page}${q}` });
  const ev = async expr => (await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.value;
  return { S, ev, errors, t0, close: () => B.send('Target.closeTarget', { targetId }).catch(() => {}) };
}
async function until(P, expr, ms = READY_MS) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await P.ev(`(()=>{try{return !!(${expr})}catch(e){return false}})()`)) return true; await sleep(1000); }
  return false;
}
const ADAPTER = `navigator.gpu?navigator.gpu.requestAdapter().then(a=>a&&a.info?{vendor:String(a.info.vendor||''),architecture:String(a.info.architecture||'')}:{vendor:a?'unknown':'none',architecture:''}):{vendor:'no navigator.gpu',architecture:''}`;
const BOOT = `(()=>{const t=(window.BOOT&&BOOT.t)||{},o={};for(const k in t)if(typeof t[k]==='number')o[k]=t[k];return o})()`;

/* play.html: wait for the warm-up, enter; tag = action studio 本壘攻防 at 70 %; batter = 望遠鏡 close-up */
async function playAct(P, act) {
  if (!(await until(P, `!document.getElementById('enter').disabled`))) throw new Error('play.html never got ready');
  if (act === 'tag') {
    await P.ev(`(()=>{const b=[...document.querySelectorAll('#intro button')];b.length&&b[b.length-1].click()})()`); await sleep(STEP_MS);
    await P.ev(`document.getElementById('studioBtn').click()`); await sleep(STEP_MS);
    await P.ev(`(()=>{const s=document.getElementById('stAct');s.value='homeplay';s.dispatchEvent(new Event('change'))})()`); await sleep(STEP_MS * 3);
    await P.ev(`(()=>{const p=document.getElementById('stPlay');if(p&&p.textContent==='暫停')p.click();const s=document.getElementById('stScrub');s.value=700;s.dispatchEvent(new Event('input'))})()`);
    await sleep(STEP_MS * 2);
  } else {
    await P.ev(`document.getElementById('enter').click()`); await sleep(SETTLE_MS);
    if (act === 'batter') { await P.ev(`document.getElementById('zoom').click()`); await sleep(STEP_MS * 3); }
  }
  /* page pixels only: hide the overlays so the frame is the 3D view */
  await P.ev(`(()=>{const s=document.createElement('style');s.textContent='body>*:not(canvas){visibility:hidden !important}canvas{visibility:visible !important}';document.head.appendChild(s)})()`);
  await sleep(500);
}
/* agent.html: the preview stands at its front yaw (reduced motion); back = drag it half a turn (agent-preview.js 0.012 rad / px) */
async function agentAct(P, act) {
  if (!(await until(P, `[...document.querySelectorAll('canvas')].some(c=>c.width>0)`))) throw new Error('agent.html preview never drew');
  await sleep(SETTLE_MS / 2);
  if (act === 'back') {
    const r = await P.ev(`(()=>{const c=[...document.querySelectorAll('canvas')].sort((a,b)=>b.width*b.height-a.width*a.height)[0];c.scrollIntoView({block:'center'});const r=c.getBoundingClientRect();return {x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    const dx = Math.round(Math.PI / 0.012), mouse = (type, x) => P.S('Input.dispatchMouseEvent', { type, x, y: r.y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount: 1 });
    await mouse('mousePressed', r.x - dx / 2);
    for (let i = 1; i <= 10; i++) await mouse('mouseMoved', r.x - dx / 2 + dx * i / 10);
    await mouse('mouseReleased', r.x + dx / 2);
    await sleep(300);
  }
}
async function frame(B, origin, shot, dir, ix) {
  const P = await openPage(B, origin, shot.page, shot.tier);
  try {
    if (shot.page === 'play.html') await playAct(P, shot.act);
    else if (shot.page === 'agent.html') await agentAct(P, shot.act);
    else { await until(P, `document.readyState==='complete'`); await sleep(SETTLE_MS / 2); }
    const { data } = await P.S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = `${String(ix).padStart(2, '0')}_${shot.page.replace('.html', '')}_${shot.act}_${shot.tier}.png`.replace(/[^a-z0-9_.-]/g, '');
    writeFileSync(path.join(dir, file), Buffer.from(data, 'base64'));
    return { frame: { file, page: shot.page, act: shot.act, ms: Date.now() - P.t0 }, errors: P.errors, boot: shot.page === 'play.html' ? await P.ev(BOOT) : null };
  } finally { await P.close(); }
}
/* shots / probe / ping -> a manifest (lib.mjs manifestProblems shape) in dir */
async function runJob(job, dir, sha, run) {
  mkdirSync(dir, { recursive: true });
  const m = { run, commit: sha, tier: 'max', adapter: { vendor: '', architecture: '' }, frames: [], console_errors: [], job: job.job };
  if (job.id) m.request = job.id;
  if (job.job === 'ping') { m.adapter.vendor = 'not measured (ping)'; return finish(m, dir); }
  const { srv, origin } = await serve(), B = await launch();
  try {
    const P = await openPage(B, origin, 'play.html', job.tier || 'max');
    m.adapter = await P.ev(ADAPTER);
    if (job.job === 'probe') {
      m.tier = job.tier || 'max';
      await until(P, `!document.getElementById('enter').disabled`);
      m.boot = await P.ev(BOOT); m.console_errors.push(...P.errors);
    }
    await P.close();
    let i = 0;
    for (const shot of job.shots || []) {
      try {
        const r = await frame(B, origin, shot, dir, ++i);
        m.frames.push(r.frame); m.console_errors.push(...r.errors);
        if (r.boot && !m.boot) m.boot = r.boot;
        m.tier = shot.tier;
      } catch (e) { m.console_errors.push(`${shot.page} ${shot.act}: ${e.message}`); }
    }
  } finally { await B.close(); srv.close(); }
  return finish(m, dir);
}
function finish(m, dir) {
  m.console_errors = [...new Set(m.console_errors.map(e => clean(String(e)).slice(0, 300)))].slice(0, 50);
  const bad = manifestProblems(m);
  if (bad.length) log(`manifest problems: ${bad.join('; ')}`);
  writeFileSync(path.join(dir, 'manifest.json'), clean(JSON.stringify(m, null, 1)) + '\n');
  const files = readdirSync(dir).map(f => ({ name: f, bytes: statSync(path.join(dir, f)).size }));
  const cap = underCap(files, RUN_CAP_BYTES);
  if (!cap.ok) { rmSync(dir, { recursive: true, force: true }); throw new Error(`run over the ${RUN_CAP_BYTES} byte cap (${cap.total}), dropped`); }
  return m;
}

/* ---------- 2. mailbox ---------- */
function syncShots() {
  if (!existsSync(path.join(SHOTS, '.git'))) git(HOME, ['clone', '--quiet', `git@github.com:${SHOTS_REPO}.git`, 'shots'], SSH_ENV);
  else { git(SHOTS, ['fetch', '--quiet', 'origin', 'main'], SSH_ENV); git(SHOTS, ['checkout', '--quiet', '-B', 'main', 'origin/main']); }
}
const dirs = p => (existsSync(p) ? readdirSync(p).filter(n => statSync(path.join(p, n)).isDirectory()) : []);
async function pendingRequests() {
  const reqDir = path.join(SHOTS, 'requests');
  const names = existsSync(reqDir) ? readdirSync(reqDir).filter(n => /\.json$/.test(n)) : [];
  if (!names.length) return [];
  const done = dirs(path.join(SHOTS, 'results'));
  const fresh = names.filter(n => !done.includes(n.replace(/\.json$/, '')));
  if (!fresh.length) return [];
  const pulls = await rest(`repos/${SHOTS_REPO}/pulls?state=open&per_page=100`);
  for (const pr of pulls) pr.files = pr.user?.login === OWNER ? [] : (await rest(`repos/${SHOTS_REPO}/pulls/${pr.number}/files?per_page=100`)).map(f => f.filename);
  const out = [];
  for (const n of fresh) {
    let req;
    try { req = JSON.parse(readFileSync(path.join(reqDir, n), 'utf8')); } catch (e) { log(`request ${n}: not JSON, refused`); continue; }
    if (req && req.id !== n.replace(/\.json$/, '')) { log(`request ${n}: id does not match the file name, refused`); continue; }
    const [commit] = await rest(`repos/${SHOTS_REPO}/commits?path=${encodeURIComponent('requests/' + n)}&sha=main&per_page=1`);
    const v = requestRunnable(req, commit, pulls, done);
    if (v.ok) out.push(req); else log(`request ${n}: refused (${v.why})`);
  }
  return out;
}
function retain() {
  const gpu = path.join(SHOTS, 'gpu');
  for (const old of keepRuns(dirs(gpu), KEEP_RUNS)) { rmSync(path.join(gpu, old), { recursive: true, force: true }); log(`deleted old run ${old}`); }
}
function push(msg) {
  git(SHOTS, ['add', '-A']);
  if (!git(SHOTS, ['status', '--porcelain'])) return;
  git(SHOTS, [...GIT_ID, 'commit', '--quiet', '-m', clean(msg)]);
  if (DRY) { log('dry run: not pushed'); return; }
  git(SHOTS, ['push', '--quiet', 'origin', 'HEAD:main'], SSH_ENV);
}

/* ---------- main ---------- */
async function main() {
  const code = await updateCode();
  if (!code.ok) { log(`stop: ${code.why} (dev ${code.sha.slice(0, 7)})`); return; }
  syncShots();
  const reqs = await pendingRequests(), due = FORCE || captureDue(dirs(path.join(SHOTS, 'gpu')));
  if (!reqs.length && !due) return; /* nothing to do: no browser, no log line */
  logBuf = [];
  for (const req of reqs) {
    const dir = path.join(SHOTS, 'results', req.id);
    try { await runJob(req, dir, code.sha, runStamp()); log(`request ${req.id} (${req.job}) done`); }
    catch (e) { mkdirSync(dir, { recursive: true }); log(`request ${req.id} failed: ${e.message}`); }
    writeFileSync(path.join(dir, 'log.txt'), logBuf.join('\n') + '\n');
  }
  if (due) {
    const run = runStamp(), dir = path.join(SHOTS, 'gpu', run);
    try {
      const m = await runJob({ job: 'shots', shots: HOURLY }, dir, code.sha, run);
      const latest = path.join(SHOTS, 'gpu', 'latest');
      rmSync(latest, { recursive: true, force: true }); cpSync(dir, latest, { recursive: true });
      log(`run ${run}: ${m.frames.length} frames, adapter ${m.adapter.vendor}/${m.adapter.architecture}, ${m.console_errors.length} console errors`);
    } catch (e) { log(`run ${run} failed: ${e.message}`); }
    retain();
  }
  push(`gpu shots ${runStamp()} for ${code.sha.slice(0, 7)}`);
}
main().catch(e => { log(`error: ${e.message}`); process.exitCode = 1; });
