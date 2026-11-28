/* Guard for the viewing beacons (ui/stats.js, functions/api/v.js, _routes.json, #805). Loads the real ui/stats.js against a fake page.
 * Fails when
 *   - a fully watched game with several tab hides and page hides sends more than 2 posts, or the posts are not enter + summary;
 *   - the summary lacks the last inning, game end, sound, top speed or the seconds, or a later hide sends anything;
 *   - a visitor who leaves before entering sends anything but one 'view';
 *   - a friendly / practice page (play.html?x=...) sends a post;
 *   - functions/api/v.js does not accept 'summary' (with the new columns) or still accepts rows as before;
 *   - _routes.json is missing, or a route file under functions/ is not covered by its "include".
 * Usage: node tests/stats.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const src = readFileSync(path.join(ROOT, 'ui/stats.js'), 'utf8');

function page(search) {
  const posts = [], els = {}, listeners = {}, observers = {};
  const el = id => els[id] || (els[id] = { id, textContent: '', attrs: {}, getAttribute(k) { return this.attrs[k]; } });
  for (const id of ['seedTag', 'bin', 'snd', 'spd', 'enter', 'enterMute']) el(id);
  el('seedTag').textContent = 'seed #1a2b3c4d'; el('bin').textContent = '▲1'; el('spd').textContent = '1x';
  let now = 0;
  const doc = {
    getElementById: id => els[id] || null, visibilityState: 'visible', body: { classList: { contains: () => false } },
    addEventListener: (t, f) => (listeners['d:' + t] ||= []).push(f),
  };
  const ctx = {
    location: { hostname: 'cloudball.example', protocol: 'https:', search }, crypto: { getRandomValues: a => { a.fill(171); return a; } },
    performance: { now: () => now }, document: doc, navigator: { sendBeacon: (u, d) => { posts.push(JSON.parse(d)); return true; } },
    fetch: (u, o) => { posts.push(JSON.parse(o.body)); return Promise.resolve(); },
    MutationObserver: class { constructor(fn) { this.fn = fn; } observe(el) { (observers[el.id] ||= []).push(this.fn); } },
    addEventListener: (t, f) => (listeners['w:' + t] ||= []).push(f), setTimeout: f => { f(); return 1; }, clearTimeout() {},
    Math, JSON, Set, Array, Uint8Array, Number, String, parseInt, RegExp,
  };
  vm.runInNewContext(src, ctx);
  const fire = (k, ev = {}) => (listeners[k] || []).forEach(f => f(ev));
  return {
    posts, tick: s => { now += s * 1000; },
    enter() { fire('d:click', { target: { closest: () => ({ id: 'enter' }) } }); },
    set(id, v, extra) { els[id].textContent = v; if (extra) Object.assign(els[id].attrs, extra); (observers[id] || []).forEach(f => f()); },
    hide() { doc.visibilityState = 'hidden'; fire('d:visibilitychange'); fire('w:pagehide'); },
  };
}

/* a full game with several hides */
{
  const p = page('');
  p.tick(5); p.enter(); p.tick(10);
  p.set('snd', '', { 'aria-pressed': 'true' }); p.set('spd', '4x'); p.set('spd', '8x'); p.set('spd', '2x');
  for (let i = 1; i <= 9; i++) { p.set('bin', '▲' + i); p.tick(20); p.hide(); p.set('bin', '▼' + i); }
  p.set('bin', '終'); p.hide(); p.hide();
  if (p.posts.length > 2) bad(`a full game sent ${p.posts.length} posts (max 2): ${p.posts.map(x => x.e).join(',')}`);
  const [a, b] = p.posts;
  if (!a || a.e !== 'enter') bad('first post is not enter');
  if (!b || b.e !== 'summary') bad('second post is not summary');
  else {
    if (b.n !== 1) bad(`summary inning ${b.n}, want 1: the first hide came after inning 1 and later hides send nothing`);
  }
}
/* summary content: hide only at the end */
{
  const p = page('');
  p.tick(5); p.enter(); p.tick(10);
  p.set('snd', '', { 'aria-pressed': 'true' }); p.set('spd', '4x'); p.set('spd', '2x');
  for (let i = 1; i <= 9; i++) { p.set('bin', '▲' + i); p.tick(10); }
  p.set('bin', '終'); p.tick(7); p.hide(); p.hide(); p.hide();
  const s = p.posts.find(x => x.e === 'summary');
  if (p.posts.length !== 2) bad(`end-of-game hide sent ${p.posts.length} posts, want 2`);
  else if (!(s.n === 9 && s.g === 1 && s.a === 1 && s.f === 4 && s.w === 107 && s.p === 112)) bad('summary fields wrong: ' + JSON.stringify(s));
}
/* leaves before entering */
{
  const p = page(''); p.tick(3); p.hide(); p.hide();
  if (p.posts.length !== 1 || p.posts[0].e !== 'view') bad('leaving before enter must send exactly one view: ' + JSON.stringify(p.posts));
}
/* load alone sends nothing; friendly / practice sends nothing */
{ const p = page(''); if (p.posts.length) bad('page load alone posted'); }
{
  const p = page('?x=1-2-3-4-5&e=abcdef1'); p.tick(5); p.enter(); p.set('bin', '▲1'); p.set('bin', '▲2'); p.hide();
  if (p.posts.length) bad(`a friendly game sent ${p.posts.length} posts`);
}

/* functions/api/v.js accepts summary and keeps the old columns */
{
  const { onRequestPost } = await import(path.join(ROOT, 'functions/api/v.js'));
  const pts = [];
  const req = body => ({ text: async () => JSON.stringify(body), url: 'https://x.example/api/v' });
  await onRequestPost({ request: req({ id: 'abababababab', e: 'summary', n: 9, s: '1a2b3c4d', w: 97, p: 102, g: 1, a: 1, f: 4 }), env: { VIEWS: { writeDataPoint: d => pts.push(d) } } });
  await onRequestPost({ request: req({ id: 'abababababab', e: 'inning', n: 3, s: '' }), env: { VIEWS: { writeDataPoint: d => pts.push(d) } } });
  if (pts.length !== 2) bad('v.js dropped a summary or an old event');
  else if (JSON.stringify(pts[0].doubles) !== '[9,97,102,1,1,4]' || pts[0].blobs[1] !== 'summary') bad('v.js summary columns wrong: ' + JSON.stringify(pts[0]));
}

/* _routes.json covers every route under functions/ */
{
  let routes; try { routes = JSON.parse(readFileSync(path.join(ROOT, '_routes.json'), 'utf8')); } catch (e) { bad('_routes.json missing or not JSON'); }
  if (routes) {
    if (routes.version !== 1 || !Array.isArray(routes.include) || !routes.include.length) bad('_routes.json needs version 1 and a non-empty include');
    const inc = routes.include || [];
    const covered = r => inc.some(i => i === r || (i.endsWith('/*') && r.startsWith(i.slice(0, -1))));
    const walk = (d, rel = '') => readdirSync(d).flatMap(n => statSync(path.join(d, n)).isDirectory() ? walk(path.join(d, n), rel + '/' + n) : [rel + '/' + n]);
    for (const f of walk(path.join(ROOT, 'functions'))) {
      if (f.startsWith('/lib/')) continue;
      const route = '/' + f.slice(1).replace(/\.js$/, '').replace(/\[[^\]]+\]/g, 'x');
      if (!covered(route)) bad(`functions${f} (route ${route}) is not covered by _routes.json include`);
    }
    for (const i of inc) if (!/^\/(api|g)\//.test(i)) bad(`_routes.json include "${i}" is not a function route: static files must not invoke Functions`);
  }
}

if (problems.length) { console.error('stats check FAILED:\n- ' + problems.join('\n- ')); process.exit(1); }
console.log('stats check ok: full game <= 2 posts (enter + summary), friendly 0, _routes.json covers functions/');
