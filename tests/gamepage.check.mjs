/* Share-link function functions/g/[id].js (#591). Fails when
 *   - a crawler-visible tag or the card carries the final score,
 *   - the og tags miss the teams, or the page body is not served (script/base added, play.html otherwise intact),
 *   - a bad id is not a 404, or the code reads rec.result / uses the clock or Math.random.
 * Usage: node tests/gamepage.check.mjs */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { onRequestGet, cardFile } from '../functions/g/[id].js';
import { TEAMS } from '../league/teams.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const play = readFileSync(path.join(root, 'play.html'), 'utf8');
const rec = { seed: 7, engine: { commit: 'abcdef1' }, teams: [0, 3], date: '2026-11-28', result: { score: [13, 29], line_score: [[1], [2]] } };
const asked = [];
globalThis.fetch = async u => { asked.push(String(u)); return /\/games\/1\/5\.json$/.test(String(u)) ? new Response(JSON.stringify(rec)) : new Response('', { status: 404 }); };
const env = { ASSETS: { fetch: async u => new Response(play, { headers: { 'content-type': 'text/html' } }) } };
const get = (id, q = '') => onRequestGet({ request: new Request(`https://x.test/g/${id}${q}`, { headers: { 'user-agent': 'facebookexternalhit/1.1' } }), env, params: { id } });

const res = await get('1-5');
const html = await res.text();
assert.equal(res.status, 200);
assert.match(html, /og:title" content="台北房貸帝雉 對 台東宿醉山羌"/);
assert.match(html, /og:description" content="2026-11-28 帝雉 @ 山羌/);
assert.match(html, /og:image" content="https:\/\/x\.test\/assets\/og\/pheasants-muntjacs\.png"/);
assert.match(html, /og:image:type" content="image\/png"/);
const tags = [...html.matchAll(/<meta[^>]*>/g)].map(x => x[0]).join('\n');
assert.ok(!/13|29/.test(tags.replace(/1200|630|2026|11-28|1-5/g, '')), 'no score in tags');
assert.ok(html.includes('<base href="/">') && html.includes("replaceState(null,'','/play.html?g=1-5')"), 'page keeps working under /g/');
assert.ok(html.includes(play.replace(/<head[^>]*>/i, '').slice(200, 600)), 'play.html body is served');

const card = await get('1-5', '?card=1');
assert.equal(card.headers.get('content-type'), 'image/svg+xml');
const svg = await card.text();
assert.match(svg, /帝雉/); assert.ok(!/13|29/.test(svg.replace(/1200|630|2026|11-28/g, '')), 'no score in card');

const unknown = await (await get('1-6')).text();
assert.match(unknown, /og:title/, 'unknown game still gets the page and generic tags');
assert.equal(cardFile(null), 'generic.png');

/* #591 part 2: every PNG card the tags can name exists, is a 1200x630 PNG, and no other file sits in assets/og/ */
const names = [cardFile(null)];
for (const away of TEAMS) for (const home of TEAMS) if (away !== home) names.push(cardFile({ away, home }));
const ogDir = path.join(root, 'assets/og');
assert.deepEqual(readdirSync(ogDir).sort(), [...names].sort(), 'assets/og/ holds exactly the matchup cards (run node tools/og_cards.mjs)');
for (const n of names) {
  const b = readFileSync(path.join(ogDir, n));
  assert.ok(b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${n}: not a PNG`);
  assert.deepEqual([b.readUInt32BE(16), b.readUInt32BE(20)], [1200, 630], `${n}: not 1200x630`);
  assert.ok(b.length < 120000, `${n}: ${b.length} bytes, too big for a share card`);
}
assert.equal((await get('x-y')).status, 404);
assert.ok(asked.every(u => u.startsWith('https://raw.githubusercontent.com/sunososobro-hub/cloudball-league/')), 'only the ledger host');

const src = readFileSync(path.join(root, 'functions/g/[id].js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(!/\.result|Math\.random|Date/.test(src), 'no result, clock or Math.random');
console.log('gamepage.check: ok');
