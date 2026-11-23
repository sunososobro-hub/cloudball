/* Text-first data site (#335): every view of ui/site-data.js renders with fixtures, with an empty list, and (when published) with the real
 * league/site/*.json files; data text is escaped and unsafe links are dropped; index.html loads the page script and nothing remote but fonts.
 * Usage: node tests/sitedata.check.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA_FILES, TABS, FILTERS, combine, render, myPlayerView, replayLink, safeUrl, seasonLabel } from '../ui/site-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const ab = { con: 70, pow: 60, eye: 50, spd: 40, arm: 30 };
const players = {
  a1: { name: '<b>王大明</b>', age: 24, role: 'B', pos: 'SS', overall: 71, abilities: ab, team: 'pheasants', tier: 1 },
  a2: { name: '李二軍', age: 20, role: 'P', pos: 'SP', overall: 55, abilities: { stuff: 60, ctrl: 50, arm: 40 }, team: 'pheasants', tier: 2 },
  a3: { name: '陳自由', age: 30, role: 'B', pos: 'CF', overall: 64, abilities: ab, team: null, tier: 3 },
};
const teamList = [{ id: 'pheasants', name: '台北房貸帝雉', city: '台北', logo: 'javascript:alert(1)', record: { w: 3, l: 1 }, roster: ['a1', 'gone'] }, { id: 'owls', name: '新竹爆肝貓頭鷹', record: { w: 1, l: 3 }, roster: [] }];
const games = [{ id: 'g1', date: '2026-11-21', home: 'pheasants', away: 'owls', score: [5, 2], replay: 'league/preseason/opening.json' }, { id: 'g2', date: '2026-11-22', home: 'owls', away: 'pheasants', score: [1, 0], replay: 'javascript:alert(1)' }];
const full = combine({ teams: { season: '0', teams: teamList }, players, games });
const plain = combine({ teams: teamList, players, games });
const none = combine({ teams: { season: '0', teams: [] }, players: {}, games: [] });
const noTier = combine({ teams: { season: '0', teams: teamList }, players: { a1: players.a1 }, games: [] });
const missing = combine({});

if (TABS.map(t => t[0]).join() !== 'teams,games,me,minors,fa') bad('tabs must be teams, games, me, minors, fa');
for (const [name, d] of [['fixtures', full], ['array form', plain], ['empty', none], ['no tier 2/3', noTier], ['missing files', missing]])
  for (const [tab] of TABS) {
    let html; try { html = render(tab, d, tab === 'me' ? 'a1' : ''); } catch (e) { bad(`${name}/${tab} threw: ${e.message}`); continue; }
    if (!html || /undefined|NaN|\[object/.test(html)) bad(`${name}/${tab}: bad output ${String(html).slice(0, 80)}`);
    if (/<b>王大明|javascript:/.test(html)) bad(`${name}/${tab}: unescaped data or unsafe link`);
    if (name === 'empty' && tab !== 'me' && !/class="empty"/.test(html)) bad(`empty/${tab}: needs an empty state`);
  }
const t = render('teams', full, '', 'pheasants'), m = render('minors', full), f = render('fa', full), g = render('games', full);
if (!t.includes('&lt;b&gt;王大明') || t.includes('李二軍') || t.includes('gone')) bad('teams tab: shows tier 1 roster ids that exist, nothing else');
if (!m.includes('李二軍') || m.includes('陳自由')) bad('minors tab must list tier 2 only');
if (!f.includes('陳自由') || f.includes('李二軍')) bad('free agents tab must list tier 3 only');
if (g.indexOf('2026-11-22') > g.indexOf('2026-11-21') || !g.includes('href="play.html"') || g.includes('opening.json') || g.includes('javascript:')) bad('games tab: newest first, safe link only');
if (!/還沒有自己的球員/.test(myPlayerView(full, '')) || !/找不到/.test(myPlayerView(full, 'zzz')) || !myPlayerView(full, 'a2').includes('二軍')) bad('my player tab: empty state, unknown id, tier shown');
for (const [what, html] of [['no player', myPlayerView(full, '')], ['unknown id', myPlayerView(full, 'zzz')], ['player', myPlayerView(full, 'a1')]])
  if (!html.includes('<a href="agent.html">')) bad(`my player tab (${what}) must link to agent.html (#341)`);
const ag = readFileSync(path.join(ROOT, 'ui/agent.js'), 'utf8');
if (/Object\.entries\(LOOK\)|外觀：/.test(ag)) bad('agent.js: the look chips (head, skin, hair) stay hidden until #151 (#341)');
if (seasonLabel(full) !== '熱身賽' || seasonLabel(plain) !== '' || seasonLabel(combine({ teams: { season: '1', teams: [] } })) !== '第 1 季') bad('season label comes from teams.json season only: 0 reads 熱身賽 (#343), later seasons 第 N 季');
/* 球團 tab (#343): one card per team on first load, no roster open; a card opens its roster, the open card links back to close it */
const t0 = render('teams', full), cards = h => (h.match(/class="tc"/g) || []).length;
if (cards(t0) !== 2 || /class="pc/.test(t0) || /class="team"/.test(t0)) bad('teams tab: first load is the cards only, no team open');
if (!t0.includes('href="#teams/pheasants"') || !t0.includes('href="#teams/owls"') || !t0.includes('aria-expanded="false"')) bad('teams tab: each card links to its own roster');
if (cards(t) !== 2 || !/class="pc/.test(t) || !t.includes('href="#teams"') || !t.includes('aria-expanded="true"') || t.includes('href="#teams/pheasants"')) bad('teams tab: the open card shows the roster and links back to #teams');
if (/class="pc/.test(render('teams', full, '', 'nope'))) bad('teams tab: an unknown team id opens nothing');
{ const cd = combine({ teams: { season: '0', teams: [{ id: 'x', name: '甲隊', record: { w: 2, l: 1 }, roster: ['p', 'q', 'r', 'z'] }] },
    players: { p: { name: '投一', num: 18, role: 'P', overall: 80, team: 'x', tier: 1 }, q: { name: '投二', role: 'P', overall: 70, team: 'x', tier: 1 }, r: { name: '打一', num: 7, role: 'B', overall: 60, team: 'x', tier: 1 } }, games: [] });
  const h = render('teams', cd);
  if (!/王牌<\/dt><dd>投一 <span class="no">#18/.test(h) || !/主砲<\/dt><dd>打一 <span class="no">#7/.test(h) || !/戰力<\/dt><dd class="num">70\.0</.test(h)) bad('teams card: ace = best pitcher, top bat = best batter, strength = mean overall of the 一軍');
  if (!/王牌<\/dt><dd>—/.test(render('teams', combine({ teams: [{ id: 'e', name: '空隊', roster: [] }], players: {} }))) || /NaN/.test(render('teams', combine({ teams: [{ id: 'e', name: '空隊', roster: [] }], players: {} })))) bad('teams card: a team with no 一軍 shows dashes, not NaN'); }
/* roster cards (#353): filter row, groups, big number = overall, hash links, one builder for 球團 / 二軍 / 自由市場 */
{ const mk = (name, role, pos, overall, num, extra = {}) => [name, { name, num, role, pos, overall, age: 25, hand: 'R', abilities: role === 'P' ? { stuff: 61, ctrl: 52 } : { con: 70, pow: 60 }, team: 'x', tier: 1, ...extra }];
  const list = [mk('rp高', 'P', 'RP', 90, 1), mk('sp低', 'P', 'SP', 50, 2), mk('sp高', 'P', 'SP', 70, 3), mk('cc', 'B', 'C', 60, 4), mk('ss', 'B', 'SS', 80, 5), mk('1b', 'B', '1B', 85, 6), mk('cf', 'B', 'CF', 65, 7), mk('lf', 'B', 'LF', 75, 8), mk('dh', 'B', 'DH', 99, 9)];
  const build = filterIds => combine({ teams: { season: '0', teams: [{ id: 'x', name: '甲隊', roster: filterIds }] }, players: Object.fromEntries(list.filter(([n]) => filterIds.includes(n))) });
  const all = list.map(([n]) => n), d = build(all);
  const at = (h, s) => h.indexOf(s, h.indexOf('<section class="team"')), heads = h => [...h.matchAll(/<section class="grp" aria-label="([^"]+)"/g)].map(m => m[1]);
  const hAll = render('teams', d, '', 'x'), row = hAll.match(/<nav class="flt"[^>]*>(.*?)<\/nav>/)?.[1] || '';
  if ((row.match(/<a /g) || []).length !== 5 || FILTERS.map(f => f[1]).join() !== '全部,投手,捕手,內野手,外野手' || ['全部', '投手', '捕手', '內野手', '外野手'].some(x => !row.includes('>' + x + '<')) || row.includes('教練')) bad('roster: the filter row is exactly 全部, 投手, 捕手, 內野手, 外野手');
  if (!row.includes('href="#teams/x/p"') || !row.includes('href="#teams/x/of"')) bad('roster: a filter is a link that keeps the open team in the hash');
  if (heads(hAll).join() !== '投手,捕手,內野手,外野手,其他') bad(`roster: 全部 groups 投手, 捕手, 內野手, 外野手, then the rest (got ${heads(hAll)})`);
  if (!(at(hAll, 'sp高') < at(hAll, 'sp低') && at(hAll, 'sp低') < at(hAll, 'rp高'))) bad('roster: in 全部 the pitchers are SP first (by overall), then RP');
  if (!(at(hAll, '>1b<') < at(hAll, '>ss<') && at(hAll, '>lf<') < at(hAll, '>cf<'))) bad('roster: inside a group, overall high to low');
  const only = f => render('teams', d, '', 'x', f);
  const pl = only('p'), nm = h => [...h.matchAll(/<b class="nm">([^<]+)<\/b>/g)].map(m => m[1]).join();
  if (nm(pl) !== 'rp高,sp高,sp低' || /class="grp"/.test(pl)) bad(`roster: a filter shows only its group, overall high to low (got ${nm(pl)})`);
  if (nm(only('c')) !== 'cc' || nm(only('if')) !== '1b,ss' || nm(only('of')) !== 'lf,cf') bad('roster: 捕手, 內野手 and 外野手 filters show only their positions');
  if (nm(only('nope')) !== nm(hAll)) bad('roster: an unknown filter reads as 全部');
  const c1 = hAll.match(/data-id="ss"[\s\S]*?<\/a>/)[0];
  if (!/<b class="ov num">80<\/b>/.test(c1) || !/<span class="no">#5<\/span>/.test(c1) || /class="ov num">5</.test(c1)) bad('roster: the big number is 評價 (overall), the jersey number is the small one in the corner');
  if (!c1.includes('SS') || !c1.includes('右打') || !c1.includes('25 歲') || /<img/.test(hAll)) bad('roster: card shows position, bats/throws and age, and no photo');
  if (!/data-id="sp高"[\s\S]*?右投/.test(hAll)) bad('roster: a pitcher card says 投, a batter card 打');
  if (/class="ab"/.test(hAll) || !hAll.includes('href="#teams/x/all/ss"')) bad('roster: nothing is open by default; a card is a link that opens it');
  const op = render('teams', d, '', 'x', 'all', 'ss');
  if ((op.match(/class="ab"/g) || []).length !== 1 || !/data-id="ss"[\s\S]*?class="ab"[\s\S]*?打擊[\s\S]*?長打/.test(op) || /球威/.test(op.slice(op.indexOf('data-id="ss"'), op.indexOf('data-id="1b"') > op.indexOf('data-id="ss"') ? op.indexOf('data-id="1b"') : undefined).split('class="ab"')[1] || '')) bad('roster: the open card shows its own ability keys (batter keys for a batter)');
  if (!op.includes('href="#teams/x/all"') || op.includes('href="#teams/x/all/ss"')) bad('roster: the open card links back to the list (tap again closes)');
  if (!/球威[\s\S]*?控球/.test(render('teams', d, '', 'x', 'p', 'sp高')) || (render('teams', d, '', 'x', 'p', 'cc').match(/class="ab"/g) || []).length) bad('roster: a pitcher opens pitcher keys; a card hidden by the filter stays closed');
  const dCatch = build(all.filter(n => n !== 'cc'));
  if (heads(render('teams', dCatch, '', 'x')).includes('捕手') || nm(render('teams', dCatch, '', 'x', 'c')) !== '') bad('roster: a roster with no catcher shows no 捕手 heading');
  if (!/class="empty"/.test(render('teams', dCatch, '', 'x', 'c'))) bad('roster: an empty filter says so');
  const fa = render('fa', combine({ teams: [], players: Object.fromEntries(list.slice(0, 5).map(([n, p]) => [n, { ...p, tier: 3, team: null }])) }), '', 'p');
  if (!fa.includes('class="flt"') || !fa.includes('href="#fa/p"') || nm(fa) !== 'rp高,sp高,sp低' || !/data-id="sp高"[\s\S]*href="#fa\/p\/sp%E9%AB%98"/.test(fa) || /<table/.test(fa)) bad('自由市場 uses the same cards, filter and hash (#fa/<filter>/<id>)');
  const mi = render('minors', combine({ teams: [{ id: 'x', name: '甲隊', roster: [] }], players: Object.fromEntries(list.map(([n, p]) => [n, { ...p, tier: 2 }])) }), '', 'if');
  if (!mi.includes('href="#minors/p"') || nm(mi) !== '1b,ss' || /<table/.test(mi)) bad('二軍 uses the same cards, filter and hash (#minors/<filter>/<id>)');
  for (const h of [hAll, op, fa, mi]) if (/\sstyle="--tc:(?!#[0-9a-f]{6}")/i.test(h)) bad('roster: the tile colour is a plain hex colour, never data text');
}
const css = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
if (!/ui\/site\/teams\.css/.test(css)) bad('index.html must load ui/site/teams.css');
if (safeUrl('data:text/html,x') || safeUrl('JavaScript:x') || !safeUrl('https://a.b/c') || !safeUrl('replay/1.json')) bad('safeUrl');

/* the real files, when the league window has published them */
const real = {}; let any = false;
for (const [k, f] of Object.entries(DATA_FILES)) if (existsSync(path.join(ROOT, f))) { real[k] = JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')); any = true; }
if (any) { const d = combine(real); for (const [tab] of TABS) { const h = render(tab, d, Object.keys(d.players)[0]); if (/undefined|NaN|\[object/.test(h)) bad(`real data/${tab}: bad output`); } }

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8'), page = readFileSync(path.join(ROOT, 'ui/site-page.js'), 'utf8');
if (!/ui\/site-page\.js/.test(html)) bad('index.html must load ui/site-page.js');
if (!/href="play\.html"/.test(html) || !existsSync(path.join(ROOT, 'play.html'))) bad('the data site must link to the game (play.html)');
if (replayLink('https://x.y/v.mp4') !== 'https://x.y/v.mp4' || replayLink('a/b.json?x=1') !== 'play.html') bad('replayLink');
if (/https?:\/\/(?!fonts\.|github\.com\/sunososobro)/.test(html + page)) bad('the data site makes no network call besides its own data files');
console.log(problems.length ? problems.map(p => 'FAIL ' + p).join('\n') : `OK site data (${any ? 'real files + ' : ''}fixtures, empty lists, ${TABS.length} tabs)`);
process.exit(problems.length ? 1 : 0);
