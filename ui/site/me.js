/* 我的球員 tab (#335, split in #344): the visitor's own player, looked up by the id the browser remembers. Pure: `view(data, myId)`. */
import { esc, empty, teamName, pos, abilityText, TIER_LABEL } from './shared.js';
import { trainShell, callupText } from './train.js';
import { minorsDays } from '../../league/minors_report.js';
import { farmGameOn, farmUrl } from '../../league/farm.js';
import { TEAMS } from '../../league/teams.js';
import { seasonAt, nightDate } from '../../league/season_site.js';
import { trialUrl } from '../../league/trial_games.js';
import { seasonLine, lineText, pitchLine, pitchText, batLog, pitLog, batGameText, pitGameText } from '../../league/player_stats.js';
/* #586: 二軍 daily text report; `d.day` (a whole number, from the data) is today, else REPORT_DAY. Text only.
 * #600 part 3: report day N (1-based) is 二軍 night N - 1 of league/site/farm_games.json (`d.farm`); a day whose team played a
 * recorded game links to its 3D replay (play.html?f=<id>), a day without a record stays plain text. */
export const REPORT_DAY = 30, REPLAY_LABEL = '看重播';
const replayOf = (d, p, day) => { const g = farmGameOn(d.farm, TEAMS.findIndex(t => t.id === p.team), day - 1); return g ? ` <a class="farm-replay" href="${esc(farmUrl(g.id))}">${REPLAY_LABEL}</a>` : ''; };
const reportBox = (d, id, p) => { if (p.tier !== 2) return ''; const day = Number.isInteger(d.day) && d.day >= 1 ? d.day : REPORT_DAY;
  return `<section class="minors-report"><h3>二軍日報（最近 7 天）</h3><ul>${minorsDays(id, p, day).map(l => `<li>第 ${l.day} 天　${esc(l.text)}${replayOf(d, p, l.day)}</li>`).join('')}</ul></section>`; };
/* #804 part 1: the 試跑 season line of a batter, summed from league/site/player_stats.json (the engine's box lines of the recorded scheduled games;
 * the page only adds rows, rule 10) over the nights already before today. Practice and friendly games are never in that file. Part 2: pitchers get BF / RA9 / K9 / BB9 from the `pitchers` rows. */
export const STAT_NONE = '本季還沒有出賽紀錄。';
const statBox = (d, id, p) => { if (!d.trial || !d.stats || !d.today) return ''; const s = seasonAt(d.trial, d.today); if (!s || s.state === 'before') return '';
  const pit = p.role === 'P', l = pit ? pitchLine(d.stats, id, s.season, s.day) : seasonLine(d.stats, id, s.season, s.day); return `<section class="season-line"><h3>試跑 第 ${esc(s.season)} 季成績</h3><p>${l ? esc(pit ? pitchText(l) : lineText(l)) : STAT_NONE}</p></section>`; };
/* #804 part 3: game log, the last 10 nights of the season with his line, the opponent and the replay (一軍: play.html?t=<night>-<slot>; 二軍: ?f=<id>, only
 * when that record holds him on a roster). Rows come from the same file as the season line; a night without a record stays plain text. */
export const LOG_TITLE = '最近 10 場（試跑）';
const REPLAY_NOTE = '看重播';
const logRow = (d, id, p, s, { day, row }) => {
  const ix = TEAMS.findIndex(t => t.id === p.team), mine = ix >= 0 ? TEAMS[ix] : null;
  let vs = '', href = '';
  if (p.tier === 2) { const r = farmGameOn(d.farm, ix, day), has = r && r.opts && Array.isArray(r.opts.rosters) && r.opts.rosters.some(x => x && [...(x.bat || []), ...(x.bench || []), ...(x.pit || [])].some(q => q.id === id));
    if (has) { vs = TEAMS[r.teams.find(t => t !== ix)]; href = farmUrl(r.id); } }
  else if (mine) { const n = d.trial.nights.find(x => x.day === day), k = n ? n.games.findIndex(g => g.home === mine.id || g.away === mine.id) : -1;
    if (k >= 0) { const g = n.games[k]; vs = TEAMS.find(t => t.id === (g.home === mine.id ? g.away : g.home)); href = trialUrl(day, k); } }
  const text = p.role === 'P' ? pitGameText(row) : batGameText(row);
  return `<li>${esc(nightDate(d.trial.start, day))}　${vs ? `對 ${esc(vs.name || teamName(d, vs.id))}　` : ''}${esc(text)}${href ? ` <a class="farm-replay" href="${esc(href)}">${REPLAY_NOTE}</a>` : ''}</li>`;
};
const logBox = (d, id, p) => { if (!d.trial || !d.stats || !d.today) return ''; const s = seasonAt(d.trial, d.today); if (!s || s.state === 'before') return '';
  const rows = (p.role === 'P' ? pitLog : batLog)(d.stats, id, s.season, s.day); return rows.length ? `<section class="game-log"><h3>${LOG_TITLE}</h3><ul>${rows.map(r => logRow(d, id, p, s, r)).join('')}</ul></section>` : ''; };
/* #438: a created player's place (二軍 / 自由市場) and one button to move him to the other (wired in site-page.js; POST /api/player/place) */
export const PLACE_TEXT = { second: ['二軍', '明天開始出賽，每場都有成績單。'], free: ['自由市場', '等球隊來挑。'] };
const placeBox = p => { if (p.team != null || p.system === true || !PLACE_TEXT[p.place]) return ''; const to = p.place === 'second' ? 'free' : 'second';
  return `<p class="place-now">目前在${esc(PLACE_TEXT[p.place][0])}：${esc(PLACE_TEXT[p.place][1])} <button type="button" data-place="${to}">改去${esc(PLACE_TEXT[to][0])}：${esc(PLACE_TEXT[to][1])}</button></p><p class="place-msg" role="status" hidden></p>`; };
/* the create/edit entry (#341): the 我的球員 tab always links to the fan-agent page, whether or not a player exists yet */
export const AGENT_PAGE = 'agent.html';
const agentEntry = label => `<p class="agent-entry"><a href="${AGENT_PAGE}">${esc(label)}</a></p>`;
/* #435: 換球員 / 解約 (wired in site-page.js; the server does the release, functions/api/player/release.js) */
export const SWITCH_WARN = '舊球員會進自由市場；在別人簽走他之前，你可以把他取回。';
const switchBox = () => `<p class="switch"><button type="button" data-act="switch">換球員</button> <button type="button" data-act="release">解約</button></p><p class="switch-warn">${esc(SWITCH_WARN)}</p><p class="switch-msg" role="status" hidden></p>`;
/* `sub` = the hash segment after the tab: #me/train is the 訓練 screen (#429), drawn by train.js `mountTrain` */
export function view(d, id, sub) {
  const p = id != null && id !== '' ? d.players[id] : null;
  if (!id) return empty('你還沒有自己的球員。') + agentEntry('建立你的球員');
  if (!p) return empty('找不到這位球員，他可能還沒登錄進名單。') + agentEntry('建立或查看你的球員');
  if (sub === 'train') return trainShell;
  const where = p.team == null ? TIER_LABEL[p.tier === 2 ? 2 : 3] : p.tier === 3 ? TIER_LABEL[3] : `${esc(teamName(d, p.team))}　${esc(TIER_LABEL[p.tier] || '')}`;
  const trainEntry = '<p class="agent-entry"><a href="#me/train">訓練</a></p>';
  return `<section class="me"><h2>${esc(p.name)}</h2><dl><dt>位置</dt><dd>${pos(p)}</dd><dt>年齡</dt><dd>${esc(p.age)}</dd><dt>綜合</dt><dd class="num">${esc(p.overall)}</dd><dt>目前</dt><dd>${where}</dd><dt>狀態</dt><dd class="callup">${esc(callupText(d.players, id))}</dd><dt>能力</dt><dd>${abilityText(p) || '—'}</dd></dl>${placeBox(p)}${trainEntry}${statBox(d, id, p)}${logBox(d, id, p)}${reportBox(d, id, p)}${switchBox()}${agentEntry('建立或管理你的球員')}</section>`;
}
