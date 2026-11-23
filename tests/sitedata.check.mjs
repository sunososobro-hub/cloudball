/* Text-first data site (#335): every view of ui/site-data.js renders with fixtures, with an empty list, and (when published) with the real
 * league/site/*.json files; data text is escaped and unsafe links are dropped; index.html loads the page script and nothing remote but fonts.
 * Usage: node tests/sitedata.check.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA_FILES, TABS, combine, render, myPlayerView, replayLink, safeUrl, seasonLabel } from '../ui/site-data.js';

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
if (cards(t0) !== 2 || /<table/.test(t0) || /class="team"/.test(t0)) bad('teams tab: first load is the cards only, no team open');
if (!t0.includes('href="#teams/pheasants"') || !t0.includes('href="#teams/owls"') || !t0.includes('aria-expanded="false"')) bad('teams tab: each card links to its own roster');
if (cards(t) !== 2 || !/<table/.test(t) || !t.includes('href="#teams"') || !t.includes('aria-expanded="true"') || t.includes('href="#teams/pheasants"')) bad('teams tab: the open card shows the roster and links back to #teams');
if (/<table/.test(render('teams', full, '', 'nope'))) bad('teams tab: an unknown team id opens nothing');
{ const cd = combine({ teams: { season: '0', teams: [{ id: 'x', name: '甲隊', record: { w: 2, l: 1 }, roster: ['p', 'q', 'r', 'z'] }] },
    players: { p: { name: '投一', num: 18, role: 'P', overall: 80, team: 'x', tier: 1 }, q: { name: '投二', role: 'P', overall: 70, team: 'x', tier: 1 }, r: { name: '打一', num: 7, role: 'B', overall: 60, team: 'x', tier: 1 } }, games: [] });
  const h = render('teams', cd);
  if (!/王牌<\/dt><dd>投一 <span class="no">#18/.test(h) || !/主砲<\/dt><dd>打一 <span class="no">#7/.test(h) || !/戰力<\/dt><dd class="num">70\.0</.test(h)) bad('teams card: ace = best pitcher, top bat = best batter, strength = mean overall of the 一軍');
  if (!/王牌<\/dt><dd>—/.test(render('teams', combine({ teams: [{ id: 'e', name: '空隊', roster: [] }], players: {} }))) || /NaN/.test(render('teams', combine({ teams: [{ id: 'e', name: '空隊', roster: [] }], players: {} })))) bad('teams card: a team with no 一軍 shows dashes, not NaN'); }
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
