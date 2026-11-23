/* 比賽影片 tab (#335, split in #344): the index of recorded games, newest first. Pure: data in, HTML string out. */
import { esc, safeUrl, empty, teamName } from './shared.js';
/* `replay` is a recording (a .json under league/), which a browser would show as raw text: the game page plays it, so the link goes there. Any other safe link (a page, a video) is used as written. */
export const GAME_PAGE = 'play.html';
export const replayLink = u => { const s = safeUrl(u); return /\.json([?#].*)?$/i.test(s) ? GAME_PAGE : s; };
export function view(d) {
  if (!d.games.length) return empty('還沒有比賽影片。');
  const rows = d.games.slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(g => {
    const [h, a] = Array.isArray(g.score) ? g.score : ['', ''], link = replayLink(g.replay);
    return `<tr><td class="num">${esc(g.date)}</td><td>${esc(teamName(d, g.away))} <b class="num">${esc(a)}</b> : <b class="num">${esc(h)}</b> ${esc(teamName(d, g.home))}</td><td>${link ? `<a href="${esc(link)}">看重播</a>` : '—'}</td></tr>`;
  }).join('');
  return `<div class="tblscroll"><table class="dt"><thead><tr><th>日期</th><th>客隊 : 主隊</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
