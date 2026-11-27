/* Guard for #597: on a 390px phone every preview button (kit row, cap, turn, zoom) is the topmost element at its centre
 * (the canvas must not cover it), is >= 44px tall, and the canvas does not run under the button bar.
 * Layout only: the stage markup of agent.html + ui/agent.css + a stand-in canvas, no three.js. Skips when Playwright is not installed. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let chromium; try { ({ chromium } = createRequire(import.meta.url)('playwright')); } catch { console.log('stage_tap: playwright not installed, skipped'); process.exit(0); }
const html = readFileSync(path.join(ROOT, 'agent.html'), 'utf8'), css = readFileSync(path.join(ROOT, 'ui/agent.css'), 'utf8');
const stage = html.match(/<div id="stage"[\s\S]*?\n  <\/div>/)?.[0];
const problems = [], bad = m => problems.push(m);
if (!stage) { console.error('stage_tap: no #stage block in agent.html'); process.exit(1); }
const kits = ['自由球員', '雲一', '雲二', '雲三', '雲四'];
let browser;
try { browser = await chromium.launch(); } catch { console.log('stage_tap: no browser, skipped'); process.exit(0); }
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.setContent(`<!doctype html><meta name=viewport content="width=device-width"><style>:root{--line:#333;--muted:#999}body{margin:0;color:#eee}${css}</style><main>${stage}</main>`);
  await page.evaluate(kits => {
    const st = document.getElementById('stage'); st.hidden = false; st.classList.add('live');
    const kit = st.querySelector('.stage-kit');
    for (const k of [...kits, '脫帽']) { const b = document.createElement('button'); b.type = 'button'; b.textContent = k; kit.appendChild(b); }
    const c = document.createElement('canvas'); c.className = 'stage-canvas'; st.appendChild(c);   /* appended last, like host.appendChild(canvas) */
  }, kits);
  const r = await page.evaluate(() => {
    const st = document.getElementById('stage'), sr = st.getBoundingClientRect(), bar = st.querySelector('.stage-bar').getBoundingClientRect();
    const out = [...st.querySelectorAll('.stage-bar button')].map(b => { const q = b.getBoundingClientRect(), t = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2); return { t: b.textContent, h: q.height, hit: t === b }; });
    return { out, barTop: bar.top - sr.top, stageH: sr.height };
  });
  if (r.out.length !== 8) bad(`expected 8 buttons, found ${r.out.length}`);
  for (const b of r.out) { if (!b.hit) bad(`button ${b.t}: another element is on top at its centre`); if (b.h < 44) bad(`button ${b.t}: ${b.h}px tall, needs 44`); }
  if (r.barTop < r.stageH * 0.4) bad(`button bar starts at ${Math.round(r.barTop)}px of ${Math.round(r.stageH)}px: too little room for the figure`);
} finally { await browser.close(); }
if (problems.length) { console.error('stage_tap FAIL\n' + problems.join('\n')); process.exit(1); }
console.log('stage_tap ok');
