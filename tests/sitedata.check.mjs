/* Text-first data site (#335): every view of ui/site-data.js renders with fixtures, with an empty list, and (when published) with the real
 * league/site/*.json files; data text is escaped and unsafe links are dropped; index.html loads the page script and nothing remote but fonts.
 * Usage: node tests/sitedata.check.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { temperOf } from '../league/temper.js';
import { DATA_FILES, TABS, FILTERS, combine, mergeCreated, render, myPlayerView, replayLink, safeUrl, seasonLabel } from '../ui/site-data.js';

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

if (TABS.map(t => t[0]).join() !== 'home,teams,games,me,minors,fa') bad('tabs must be home, teams, games, me, minors, fa');
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
/* created players (#399): API rows merge into the published data as tier-3 free agents; the owner's id resolves in 我的球員 */
{ const rows = [{ id: 'fa-1', kind: 'bat', player: { id: 'fa-1', name: '新打者', num: 9, pos: 'SS', hand: 'R', age: 21 }, ratings: { ovr: 55, con: 60, pow: 50, eye: 50, spd: 50, arm: 50, pot: 77 } },
    { id: 'fa-2', kind: 'pit', player: { id: 'fa-2', name: '新投手', num: 11, role: 'CL', throws: 'L', age: 22 }, ratings: { ovr: 48, stuff: 60, ctrl: 50, arm: 50, pot: 70 } }, { id: 'a3', kind: 'bat', player: { name: '蓋掉', pos: 'C' }, ratings: { ovr: 1 } }, null, { id: 'x' }];
  const d = mergeCreated(full, rows), fa = render('fa', d), mine = myPlayerView(d, 'fa-1');
  if (!fa.includes('新打者') || !fa.includes('新投手') || !fa.includes('陳自由') || fa.includes('蓋掉')) bad('#399: free agents tab lists created players next to the published ones, never replacing a published id');
  if (!mine.includes('新打者') || mine.includes('找不到') || mine.includes('77') || !mine.includes('自由市場')) bad('#399: 我的球員 finds the created player by id, tier 3, no pot');
  if (Object.keys(d.players).length !== 5 || Object.keys(full.players).length !== 3) bad('#399: merge adds the 2 good rows only and does not change its input');
  { const t = mergeCreated(full, [{ ...rows[0], player: { ...rows[0].player, temper: '溫和' } }, { ...rows[1], player: { ...rows[1].player, temper: 'angry' } }]).players;
    if (t['fa-1'].temper !== '溫和' || 'temper' in t['fa-2'] || 'temper' in d.players['fa-1']) bad('#379: a created player keeps a valid chosen temperament only'); }
  if (render('fa', mergeCreated(missing, rows)).includes('目前沒有人') || !/目前沒有人/.test(render('fa', mergeCreated(missing, null)))) bad('#399: no API rows = the old empty state; rows alone fill an empty site'); }
/* #438: a created player placed in 二軍 sits in the 二軍 tab only, one placed in 自由市場 in the 自由市場 tab only; 我的球員 names the place and offers the move */
{ const mk = (id, name, place) => ({ id, kind: 'bat', player: { id, name, num: 5, pos: 'SS', hand: 'R', age: 21, ...(place ? { place } : {}) }, ratings: { ovr: 55, con: 60, pow: 50, eye: 50, spd: 50, arm: 50 } });
  const d = mergeCreated(full, [mk('pl-s', '二軍新人', 'second'), mk('pl-f', '市場新人', 'free'), mk('pl-o', '舊球員', null)]);
  const mi = render('minors', d), fa = render('fa', d), cnt = (h, n) => h.split(n).length - 1;
  if (cnt(mi, '二軍新人') !== 1 || mi.includes('市場新人') || mi.includes('舊球員')) bad('#438: 二軍 tab lists the 二軍-placed player once and nobody else');
  if (cnt(fa, '市場新人') !== 1 || cnt(fa, '舊球員') !== 1 || fa.includes('二軍新人')) bad('#438: 自由市場 tab lists free / unplaced players once, not the 二軍 one');
  const a = myPlayerView(d, 'pl-s'), b = myPlayerView(d, 'pl-f');
  if (!a.includes('目前在二軍') || !a.includes('data-place="free"') || !b.includes('目前在自由市場') || !b.includes('data-place="second"')) bad('#438: 我的球員 shows the place and a button to the other one');
  if (myPlayerView(d, 'a1').includes('data-place')) bad('#438: a published player gets no move button'); }
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
  /* #379: the open card (only it) shows the temperament: the stored one, else the id default from league/temper.js */
  { const tm = h => [...h.matchAll(/<p class="tmp">脾氣 <b>([^<]+)<\/b><\/p>/g)].map(m => m[1]);
    if (tm(hAll).length || tm(op).length !== 1 || tm(op)[0] !== temperOf({ id: 'ss' })) bad(`roster: only the open card shows 脾氣, the id default (got ${tm(op)})`);
    const dT = { ...d, players: { ...d.players, ss: { ...d.players.ss, temper: '火爆' } } }, dB = { ...d, players: { ...d.players, ss: { ...d.players.ss, temper: 'angry' } } };
    if (tm(render('teams', dT, '', 'x', 'all', 'ss'))[0] !== '火爆' || tm(render('teams', dB, '', 'x', 'all', 'ss'))[0] !== temperOf({ id: 'ss' })) bad('roster: a stored temperament is shown, an invalid one falls back to the id default'); }
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
/* 首頁 (#358): hero = newest finished game, 看重播 link, highlight button only when the data has one, standings share a rank on equal wins, blocks without data are left out */
{
  const h = render('home', full), tie = combine({ teams: { teams: [{ id: 'a', name: 'A隊', record: { w: 2, l: 0 } }, { id: 'b', name: 'B隊', record: { w: 1, l: 1 } }, { id: 'c', name: 'C隊', record: { w: 1, l: 1 } }, { id: 'd', name: 'D隊', record: { w: 0, l: 2 } }] } });
  const ranks = x => [...render('home', x).matchAll(/class="num rk">(\d+)</g)].map(m => m[1]).join();
  if (!h.includes('class="hero"') || !/最新一場・2026-11-22/.test(h) || !render('home', combine({ teams: { teams: teamList }, games: [games[0]] })).includes('href="play.html">看重播<') || h.includes('>看重播<') || h.includes('看重點影片') || !h.includes('href="agent.html"') || !h.includes('建立我的球員')) bad('home: hero shows the newest game, 看重播 (only with a safe link) and the join card; no highlight button without a highlight');
  if (!render('home', combine({ teams: { teams: teamList }, games: [{ ...games[0], highlight: 'https://x.y/h.mp4' }] })).includes('>看重點影片<')) bad('home: 看重點影片 appears when the game has a highlight');
  if (ranks(tie) !== '1,2,2,4') bad(`home: standings by wins, equal wins share a rank (got ${ranks(tie)})`);
  if ((h.match(/class="hc"/g) || []).length !== 2 || !h.includes('href="#teams/pheasants"') || !/class="vid"|class="vid" /.test(h) || !h.includes('href="#games"')) bad('home: team cards link to the team page, videos link to 比賽影片');
  const noGames = render('home', noTier), noTeams = render('home', combine({ games })), nothing = render('home', none);
  if (/class="hero"|class="vids"/.test(noGames) || !/aria-label="戰績"/.test(noGames)) bad('home: no games hides the hero and the videos');
  if (/aria-label="戰績"|class="hcards"/.test(noTeams) || !/class="hero"/.test(noTeams)) bad('home: no teams hides 戰績 and the team cards');
  if (!/class="empty"/.test(nothing) || !/class="join"/.test(nothing)) bad('home: no data at all says so and still shows the join card');
  if (render('home', combine({ teams: { teams: teamList }, games: [{ ...games[0], replay: 'javascript:alert(1)' }] })).includes('javascript:')) bad('home: unsafe replay link is dropped');
}
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
