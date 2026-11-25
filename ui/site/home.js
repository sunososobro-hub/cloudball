/* 首頁 tab (#358): the league front page. Pure: data in, HTML string out. Real data only; a block with no data is left out, nothing is invented.
 * Order: latest game (hero) + join card, 戰績, four team cards, latest game videos. Records and strength are display summaries of the published files (rule 10). */
import { esc, safeUrl, empty, teamOf, teamName, teamCss, tierOneRows, meanOverall, bestOf, logoImg } from './shared.js';
import { replayLink } from './games.js';
import { AGENT_PAGE } from './me.js';

const finished = g => g && Array.isArray(g.score) && g.score.length === 2;
const newestFirst = games => games.filter(finished).map((g, i) => [g, i]).sort((a, b) => String(b[0].date).localeCompare(String(a[0].date)) || b[1] - a[1]).map(x => x[0]);
const recText = t => (t && t.record ? `${esc(t.record.w)} 勝 ${esc(t.record.l)} 敗` : '');
const strengthOf = (d, t) => { const m = meanOverall(tierOneRows(d, t)); return m == null ? null : m.toFixed(1); };

/* ranks by wins; teams with the same wins share a rank and the next rank skips (1, 1, 3) */
export function standings(d) {
  const rows = d.teams.map(t => ({ t, w: Number(t.record && t.record.w) || 0, l: Number(t.record && t.record.l) || 0 })).sort((a, b) => b.w - a.w || a.l - b.l);
  rows.forEach((r, i) => { r.rank = i > 0 && rows[i - 1].w === r.w ? rows[i - 1].rank : i + 1; });
  return rows;
}

function hero(d, g) {
  const [h, a] = g.score, home = teamOf(d, g.home), away = teamOf(d, g.away), link = replayLink(g.replay), hl = safeUrl(g.highlight);
  const side = (id, t, score) => `<div class="sd">${logoImg(id, 128, 'lg', teamName(d, id), true)}<b class="tn">${esc(teamName(d, id))}</b><span class="rc">${recText(t) || '&nbsp;'}</span><b class="sc num">${esc(score)}</b></div>`;
  const buttons = (link ? `<a class="btn" href="${esc(link)}">看重播</a>` : '') + (hl ? `<a class="btn ghost" href="${esc(hl)}">看重點影片</a>` : '');
  return `<section class="hero" aria-label="最新一場"><p class="eyebrow">最新一場${g.date ? `・${esc(g.date)}` : ''}</p><div class="vs">${side(g.away, away, a)}<span class="at">對</span>${side(g.home, home, h)}</div>${buttons ? `<p class="acts">${buttons}</p>` : ''}</section>`;
}
const joinCard = () => `<section class="join" aria-label="加入聯盟"><h2>捏一個你的球員，看他上場</h2><p>每人一位球員：你決定名字和能力，比賽怎麼打由引擎決定。</p><p class="acts"><a class="btn" href="${esc(AGENT_PAGE)}">建立我的球員</a></p></section>`;

function table(d) {
  const rows = standings(d).map(({ t, w, l, rank }) => `<tr><td class="num rk">${rank}</td><td><a class="tl" href="#teams/${encodeURIComponent(t.id)}">${logoImg(t.id, 128, 'lg', t.name)}${esc(t.name)}</a></td><td class="num">${w}</td><td class="num">${l}</td><td class="num">${esc(strengthOf(d, t) ?? '—')}</td></tr>`).join('');
  return `<section aria-label="戰績"><h2 class="sec">戰績</h2><div class="tblscroll"><table class="dt st"><thead><tr><th>名次</th><th>球團</th><th>勝</th><th>敗</th><th>戰力</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
}

const person = (rows, role) => { const p = bestOf(rows, role); return p ? `${esc(p.name)}${p.overall != null ? ` <b class="num">${esc(p.overall)}</b>` : ''}` : '—'; };
function teamCards(d) {
  const cards = d.teams.map(t => {
    const rows = tierOneRows(d, t);
    return `<a class="hc" href="#teams/${encodeURIComponent(t.id)}"><span class="blk" style="--tc:${teamCss(t.id)}">${logoImg(t.id, 512, 'lg', t.name)}<b>${esc(t.name)}</b></span><dl><div><dt>王牌</dt><dd>${person(rows, 'P')}</dd></div><div><dt>主砲</dt><dd>${person(rows, 'B')}</dd></div></dl></a>`;
  }).join('');
  return `<section aria-label="四個球團"><h2 class="sec">四個球團</h2><div class="hcards">${cards}</div></section>`;
}

function videos(d, list) {
  const items = list.slice(0, 3).map(g => {
    const link = replayLink(g.replay), [h, a] = g.score, cs = id => teamCss(id);
    const inner = `<span class="thumb" style="--a:${cs(g.away)};--h:${cs(g.home)}"><b class="num">${esc(a)} : ${esc(h)}</b></span><span class="vt"><b>${esc(teamName(d, g.away))} 對 ${esc(teamName(d, g.home))}</b><small class="num">${esc(g.date || '')}</small></span>`;
    return link ? `<a class="vid" href="${esc(link)}">${inner}</a>` : `<div class="vid">${inner}</div>`;
  }).join('');
  return `<section aria-label="比賽影片"><h2 class="sec">比賽影片<a class="more" href="#games">全部影片</a></h2><div class="vids">${items}</div></section>`;
}

export function view(d) {
  const list = newestFirst(d.games), top = [];
  if (list.length) top.push(hero(d, list[0]));
  top.push(joinCard());
  const blocks = [`<div class="top2">${top.join('')}</div>`];
  if (d.teams.length) blocks.push(table(d), teamCards(d));
  if (list.length) blocks.push(videos(d, list));
  if (!d.teams.length && !list.length) blocks.push(empty('聯盟資料還沒發布。'));
  return `<div class="home">${blocks.join('')}</div>`;
}
