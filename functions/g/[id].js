/* GET /g/<season>-<id> (#591): the share link of one official game.
 * Same page as play.html?g=<season>-<id>, with per-game link-preview tags added: og:title / og:description (teams and
 * date, NEVER the score) and og:image = a static PNG matchup card (assets/og/, made by tools/og_cards.mjs; crawlers such
 * as Facebook skip SVG images). The same card as SVG stays at ?card=1 (team colours and names only, no score).
 * Read-only: the record comes from the ledger file the page itself reads (league/ledger.js, rule 24); no paid API, no
 * other host (rule 17). A record the ledger does not have still gets the page (it shows its own "not found" note). */
import { TEAMS } from '../../league/teams.js';
import { ledgerUrl } from '../../league/ledger.js';
import { gameParam } from '../../league/gameplay.js';

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/* -> { away, home, date } from a ledger record; nothing here reads rec.result. */
export function matchup(rec) {
  const t = rec && Array.isArray(rec.teams) && rec.teams.length === 2 ? rec.teams : [0, 1];
  const away = TEAMS[t[0]], home = TEAMS[t[1]];
  if (!away || !home) return null;
  const date = rec && typeof rec.date === 'string' && DATE_RE.test(rec.date) ? rec.date : '';
  return { away, home, date };
}

export function previewTags(m, pageUrl, imageUrl) {
  const title = m ? `${m.away.name} 對 ${m.home.name}` : '雲端職棒：重播';
  const desc = m ? `${m.date ? m.date + ' ' : ''}${m.away.short} @ ${m.home.short}。點開用 3D 重播這場比賽，結果不先劇透。` : '點開用 3D 重播這場比賽。';
  return [
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(pageUrl)}">`,
    `<meta property="og:image" content="${esc(imageUrl)}">`,
    `<meta property="og:image:type" content="image/png">`,
    `<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(imageUrl)}">`,
  ].join('\n');
}

/* PNG card for a matchup: assets/og/<away id>-<home id>.png, generic.png without one (tools/og_cards.mjs writes them). */
export function cardFile(m) {
  return m ? `${m.away.id}-${m.home.id}.png` : 'generic.png';
}

export function cardSvg(m) {
  const a = m ? m.away : { short: '雲端職棒', css: '#2a3350' }, h = m ? m.home : { short: '', css: '#2a3350' };
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
<rect width="1200" height="630" fill="#101522"/><rect width="600" height="630" fill="${esc(a.css)}" opacity=".85"/><rect x="600" width="600" height="630" fill="${esc(h.css)}" opacity=".85"/>
<g font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#fff"><text x="300" y="330" font-size="96">${esc(a.short)}</text><text x="900" y="330" font-size="96">${esc(h.short)}</text>
<text x="600" y="350" font-size="64" fill="#101522" stroke="#fff" stroke-width="10" paint-order="stroke">VS</text>
<text x="600" y="560" font-size="40">雲端職棒 · 重播</text>${m && m.date ? `<text x="600" y="90" font-size="40">${esc(m.date)}</text>` : ''}</g></svg>`;
}

async function loadRecord(p) {
  try {
    const r = await fetch(ledgerUrl(p.season, p.id));
    return r.ok ? await r.json() : null;
  } catch (e) { return null; }
}

export async function onRequestGet({ request, env, params }) {
  const url = new URL(request.url);
  const p = gameParam(String(params.id || ''));
  if (!p) return new Response('not found', { status: 404 });
  const param = `${p.season}-${p.id}`, m = matchup(await loadRecord(p));
  if (url.searchParams.has('card')) {
    return new Response(cardSvg(m), { headers: { 'content-type': 'image/svg+xml', 'cache-control': 'public, max-age=86400' } });
  }
  const page = await env.ASSETS.fetch(new URL(`/play.html?g=${param}`, url));
  if (!page.ok) return page;
  const tags = previewTags(m, `${url.origin}/g/${param}`, `${url.origin}/assets/og/${cardFile(m)}`);
  /* The page lives at /g/<id>: root-relative base and an address that carries ?g= keep its relative files and its own
   * URL reader working. replaceState runs first in <head>, before any relative file is requested. */
  const head = `<base href="/">\n<script>history.replaceState(null,'','/play.html?g=${param}')</script>\n${tags}\n`;
  const html = (await page.text()).replace(/<head[^>]*>/i, h => h + '\n' + head);
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
}
