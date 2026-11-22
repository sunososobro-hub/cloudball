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
const scan = file => {
  const stack = [], found = {};
  for (const m of read(file).replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').matchAll(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g)) {
    const [, close, tag0, attrs] = m, tag = tag0.toLowerCase();
    if (close) { while (stack.length && stack.pop().tag !== tag); continue; }
    const id = (/\bid\s*=\s*"([^"]*)"/.exec(attrs) || [])[1], cls = ((/\bclass\s*=\s*"([^"]*)"/.exec(attrs) || [])[1] || '').split(/\s+/);
    const node = { tag, dev: cls.includes('dev-only') };
    if (id) found[id] = node.dev || stack.some(n => n.dev);
    if (!VOID.has(tag) && !/\/\s*$/.test(attrs)) stack.push(node);
  }
  return found;
};
/* The fan-agent pages (#179): the entry link on the guide page and the whole content of agent.html. Each page loads ui/site.js
 * in <head> and carries the CSS rule (inline in index.html, in a stylesheet for the others). The API answers closed on a production
 * host by itself (functions/lib/agents.js, checked by tests/agent.check.mjs). */
export const DEV_ONLY_PAGES = { 'index.html': DEV_ONLY_IDS, 'guide.html': ['agentLink'], 'agent.html': ['agentMain'] };
const HIDE_RULE = /html\[data-site="production"\]\s+\.dev-only\s*\{[^}]*display\s*:\s*none\s*!important/;
for (const [file, ids] of Object.entries(DEV_ONLY_PAGES)) {
  const found = scan(file), html = read(file);
  for (const id of ids) {
    if (!(id in found)) bad(`${file} has no element #${id} (update DEV_ONLY_PAGES if it was removed on purpose)`);
    else if (!found[id]) bad(`${file}: #${id} is a development tool but is not inside class "dev-only": it would show on production`);
  }
  const css = html + [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*href="(ui\/[^"]+)"/g)].map(m => read(m[1])).join('\n');
  if (!HIDE_RULE.test(css)) bad(`${file} lost the CSS rule that hides .dev-only on data-site="production"`);
  if (!/<script\s+src="ui\/site\.js"><\/script>/.test(html.split('</head>')[0])) bad(`ui/site.js must be loaded in <head> of ${file}`);
}

const game = read('render/game.js').split('\n');
game.forEach((l, i) => { if (l.includes('開發模式') && !/SITE/.test(l)) bad(`render/game.js:${i + 1} writes the dev status text without checking SITE.dev`); });

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: ${PRODUCTION_HOSTS.length} production and ${DEV_HOSTS.length} dev host names, ${Object.values(DEV_ONLY_PAGES).flat().length} development controls on ${Object.keys(DEV_ONLY_PAGES).length} pages hidden on production.`);
