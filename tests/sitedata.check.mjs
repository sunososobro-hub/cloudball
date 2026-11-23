/* Text-first data site (#335): every view of ui/site-data.js renders with fixtures, with an empty list, and (when published) with the real
 * league/site/*.json files; data text is escaped and unsafe links are dropped; site.html loads the page script and nothing remote but fonts.
 * Usage: node tests/sitedata.check.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { DATA_FILES, TABS, combine, render, myPlayerView, safeUrl, seasonLabel } from '../ui/site-data.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const ab = { con: 70, pow: 60, eye: 50, spd: 40, arm: 30 };
const players = {
  a1: { name: '<b>王大明</b>', age: 24, role: 'B', pos: 'SS', overall: 71, abilities: ab, team: 'pheasants', tier: 1 },
  a2: { name: '李二軍', age: 20, role: 'P', pos: 'SP', overall: 55, abilities: { stuff: 60, ctrl: 50, arm: 40 }, team: 'pheasants', tier: 2 },
  a3: { name: '陳自由', age: 30, role: 'B', pos: 'CF', overall: 64, abilities: ab, team: null, tier: 3 },
};
const teamList = [{ id: 'pheasants', name: '台北房貸帝雉', city: '台北', logo: 'javascript:alert(1)', record: { w: 3, l: 1 }, roster: ['a1', 'gone'] }, { id: 'owls', name: '新竹爆肝貓頭鷹', record: { w: 1, l: 3 }, roster: [] }];
const games = [{ id: 'g1', date: '2026-11-21', home: 'pheasants', away: 'owls', score: [5, 2], replay: 'index.html?game=g1' }, { id: 'g2', date: '2026-11-22', home: 'owls', away: 'pheasants', score: [1, 0], replay: 'javascript:alert(1)' }];
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
const t = render('teams', full), m = render('minors', full), f = render('fa', full), g = render('games', full);
if (!t.includes('&lt;b&gt;王大明') || t.includes('李二軍') || t.includes('gone')) bad('teams tab: shows tier 1 roster ids that exist, nothing else');
if (!m.includes('李二軍') || m.includes('陳自由')) bad('minors tab must list tier 2 only');
if (!f.includes('陳自由') || f.includes('李二軍')) bad('free agents tab must list tier 3 only');
if (g.indexOf('2026-11-22') > g.indexOf('2026-11-21') || !g.includes('index.html?game=g1') || g.includes('javascript:')) bad('games tab: newest first, safe link only');
if (!/還沒有自己的球員/.test(myPlayerView(full, '')) || !/找不到/.test(myPlayerView(full, 'zzz')) || !myPlayerView(full, 'a2').includes('二軍')) bad('my player tab: empty state, unknown id, tier shown');
if (seasonLabel(full) !== '第 0 季' || seasonLabel(plain) !== '') bad('season label comes from teams.json season only');
if (safeUrl('data:text/html,x') || safeUrl('JavaScript:x') || !safeUrl('https://a.b/c') || !safeUrl('replay/1.json')) bad('safeUrl');

/* the real files, when the league window has published them */
const real = {}; let any = false;
for (const [k, f] of Object.entries(DATA_FILES)) if (existsSync(path.join(ROOT, f))) { real[k] = JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')); any = true; }
if (any) { const d = combine(real); for (const [tab] of TABS) { const h = render(tab, d, Object.keys(d.players)[0]); if (/undefined|NaN|\[object/.test(h)) bad(`real data/${tab}: bad output`); } }

const html = readFileSync(path.join(ROOT, 'site.html'), 'utf8'), page = readFileSync(path.join(ROOT, 'ui/site-page.js'), 'utf8');
if (!/ui\/site-page\.js/.test(html)) bad('site.html must load ui/site-page.js');
if (/https?:\/\/(?!fonts\.|github\.com\/sunososobro)/.test(html + page)) bad('the data site makes no network call besides its own data files');
console.log(problems.length ? problems.map(p => 'FAIL ' + p).join('\n') : `OK site data (${any ? 'real files + ' : ''}fixtures, empty lists, ${TABS.length} tabs)`);
process.exit(problems.length ? 1 : 0);
