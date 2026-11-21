/* Production shows no development tools (owner direction, #47). Checks:
 * - ui/site.js (run in a sandbox for sample host names) says dev for localhost, a file, and every subdomain of the Pages
 *   project, and production for the bare Pages host and any other host;
 * - every development control in index.html sits inside an element with class "dev-only", and index.html has the CSS
 *   rule that hides it on data-site="production" (so none of them is reachable with the production host name);
 * - render/game.js only writes the dev status text when SITE.dev says so.
 * Usage: node tests/site.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(path.join(ROOT, f), 'utf8');
const problems = [], bad = m => problems.push(m);

/* Elements a visitor must never reach on production: speed button, new random game, action studio (button and panel),
 * seed tag, bug report, live/replay toggle. Add an id here when a new development tool appears. */
export const DEV_ONLY_IDS = ['practice', 'studioBtn', 'studio', 'spd', 'seedTag', 'report', 'mode'];
export const PRODUCTION_HOSTS = ['cloudball-3uy.pages.dev', 'example.com', 'cloudball.example', 'evilcloudball-3uy.pages.dev', 'cloudball-3uy.pages.dev.example.com'];
export const DEV_HOSTS = ['dev.cloudball-3uy.pages.dev', 'a1b2c3.cloudball-3uy.pages.dev', 'localhost', '127.0.0.1', '[::1]', ''];

const siteJs = read('ui/site.js');
const siteOf = hostname => {
  const ctx = { location: { hostname }, document: { documentElement: { dataset: {} } } };
  ctx.globalThis = ctx; vm.runInNewContext(siteJs, ctx);
  return { dev: ctx.SITE && ctx.SITE.dev, mark: ctx.document.documentElement.dataset.site };
};
for (const h of PRODUCTION_HOSTS) { const r = siteOf(h); if (r.dev !== false || r.mark !== 'production') bad(`host "${h}" must be production, got ${JSON.stringify(r)}`); }
for (const h of DEV_HOSTS) { const r = siteOf(h); if (r.dev !== true || r.mark !== 'dev') bad(`host "${h}" must be dev, got ${JSON.stringify(r)}`); }

/* A tiny tag scanner (no dependencies): for each id, is the element or an ancestor marked dev-only? */
const VOID = new Set(['br', 'img', 'input', 'meta', 'link', 'hr', 'source']);
const stack = [], found = {};
for (const m of read('index.html').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
  const [, close, tag0, attrs] = m, tag = tag0.toLowerCase();
  if (close) { while (stack.length && stack.pop().tag !== tag); continue; }
  const id = (/\bid\s*=\s*"([^"]*)"/.exec(attrs) || [])[1], cls = ((/\bclass\s*=\s*"([^"]*)"/.exec(attrs) || [])[1] || '').split(/\s+/);
  const node = { tag, dev: cls.includes('dev-only') };
  if (id) found[id] = node.dev || stack.some(n => n.dev);
  if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(node);
}
for (const id of DEV_ONLY_IDS) {
  if (!(id in found)) bad(`index.html has no element #${id} (update DEV_ONLY_IDS if it was removed on purpose)`);
  else if (!found[id]) bad(`#${id} is a development tool but is not inside class "dev-only": it would show on production`);
}
if (!/html\[data-site="production"\]\s+\.dev-only\s*\{[^}]*display\s*:\s*none\s*!important/.test(read('index.html'))) bad('index.html lost the CSS rule that hides .dev-only on data-site="production"');
if (!/<script\s+src="ui\/site\.js"><\/script>/.test(read('index.html').split('</head>')[0])) bad('ui/site.js must be loaded in <head> of index.html');

const game = read('render/game.js').split('\n');
game.forEach((l, i) => { if (l.includes('開發模式') && !/SITE/.test(l)) bad(`render/game.js:${i + 1} writes the dev status text without checking SITE.dev`); });

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: ${PRODUCTION_HOSTS.length} production and ${DEV_HOSTS.length} dev host names, ${DEV_ONLY_IDS.length} development controls hidden on production.`);
