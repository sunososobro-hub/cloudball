/* 友誼賽 on a 390px phone profile (#751 part 5: "boot time and one finished game on a 390px phone profile reported").
 * Serves the repo as static files, opens friendly.html at 390x844 (touch, mobile) with the CPU slowed 4x (a rough mid phone; not a real
 * device), drops every outside request (fonts), and fails when
 *   - the picker does not show, the page throws, or the page scrolls sideways,
 *   - a tap target of the form (chips, buttons, seed box) is under 44px tall or another element covers its centre,
 *   - the 分享連結 is not a play.html?x=... link, or the arrangement it carries does not finish a game in the page's engine,
 *   - the same link played twice in the page gives a different game.
 * Prints boot ms (navigation to picker shown) and game ms (engine, one full game, in the page) for the PR body.
 * Skips when Playwright or a browser is not installed. Usage: node tests/friendly_phone.check.mjs */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.log('friendly_phone: playwright not installed, skipped'); process.exit(0); }
const PHONE = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 };
const CPU_SLOWDOWN = 4;    /* Chrome DevTools "mid-tier mobile" preset */
const TAP_PX = 44;         /* docs: every tap target >= 44px */
const READY_MS = 30000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  const rel = decodeURIComponent(new URL(req.url, 'http://x').pathname).replace(/^\/+/, '') || 'index.html', file = path.resolve(ROOT, rel);
  if (!file.startsWith(ROOT + path.sep)) { res.writeHead(403).end(); return; }
  try { res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream' }).end(await readFile(file)); } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}`;
const problems = [], bad = m => problems.push(m);
let browser;
try { browser = await chromium.launch(); } catch { server.close(); console.log('friendly_phone: no browser, skipped'); process.exit(0); }
try {
  const ctx = await browser.newContext(PHONE), page = await ctx.newPage();
  await ctx.route(u => !u.href.startsWith(ORIGIN + '/'), r => r.abort());
  page.on('pageerror', e => bad(`page error: ${e.message}`));
  await (await ctx.newCDPSession(page)).send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  const t0 = Date.now();
  await page.goto(`${ORIGIN}/friendly.html`);
  await page.waitForSelector('#form:not([hidden])', { timeout: READY_MS });
  const bootMs = Date.now() - t0;
  const lay = await page.evaluate(() => ({
    sx: document.documentElement.scrollWidth,
    taps: [...document.querySelectorAll('#form button, #form input')].filter(el => el.offsetParent).map(el => {
      el.scrollIntoView({ block: 'center' });
      const q = el.getBoundingClientRect(), top = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
      return { what: el.id || el.textContent.trim().slice(0, 12), h: q.height, hit: !!top && (top === el || el.contains(top)) };
    }),
    share: document.getElementById('share').value,
  }));
  if (lay.sx > PHONE.viewport.width) bad(`page is ${lay.sx}px wide on a ${PHONE.viewport.width}px phone (sideways scroll)`);
  if (lay.taps.length < 10) bad(`only ${lay.taps.length} tap targets in the form`);
  for (const t of lay.taps) { if (t.h < TAP_PX) bad(`${t.what}: ${t.h}px tall, needs ${TAP_PX}`); if (!t.hit) bad(`${t.what}: covered at its centre`); }
  const x = new URL(lay.share || 'about:blank').searchParams.get('x');
  if (!/^play\.html$/.test(new URL(lay.share || 'about:blank').pathname.split('/').pop() || '') || !x) bad(`share link is not play.html?x=...: ${lay.share}`);
  else {
    const g = await page.evaluate(async x => {
      const [engine, f] = await Promise.all([import('./engine/index.js'), import('./league/friendly.js')]);
      const t = performance.now(), one = f.friendlyOpening(x, engine), ms = performance.now() - t, two = f.friendlyOpening(x, engine);
      return { ms, status: one.status, reason: one.reason, inn: one.opening?.game.final.inn, sc: one.opening?.game.final.sc, same: JSON.stringify(one.opening?.game) === JSON.stringify(two.opening?.game) };
    }, x);
    if (g.status !== 'ok') bad(`share link arrangement ${x} does not play: ${g.reason}`);
    else {
      if (!(g.inn >= 9) || !Array.isArray(g.sc)) bad(`game of ${x} has no final score`);
      if (!g.same) bad(`same link ${x} played twice in the page gives another game`);
      console.log(`friendly_phone: 390x844, CPU ${CPU_SLOWDOWN}x slower: boot ${bootMs} ms, one game ${Math.round(g.ms)} ms (${g.inn} inn, ${g.sc.join('-')}), ${lay.taps.length} tap targets; headless, not a real device`);
    }
  }
} finally { await browser.close(); server.close(); }
if (problems.length) { console.error('friendly_phone FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('friendly_phone ok');
