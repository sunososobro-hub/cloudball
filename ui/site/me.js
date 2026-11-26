/* 我的球員 tab (#335, split in #344): the visitor's own player, looked up by the id the browser remembers. Pure: `view(data, myId)`. */
import { esc, empty, teamName, pos, abilityText, TIER_LABEL } from './shared.js';
/* the create/edit entry (#341): the 我的球員 tab always links to the fan-agent page, whether or not a player exists yet */
export const AGENT_PAGE = 'agent.html';
const agentEntry = label => `<p class="agent-entry"><a href="${AGENT_PAGE}">${esc(label)}</a></p>`;
/* #435: 換球員 / 解約 (wired in site-page.js; the server does the release, functions/api/player/release.js) */
export const SWITCH_WARN = '舊球員會進自由市場；在別人簽走他之前，你可以把他取回。';
const switchBox = () => `<p class="switch"><button type="button" data-act="switch">換球員</button> <button type="button" data-act="release">解約</button></p><p class="switch-warn">${esc(SWITCH_WARN)}</p><p class="switch-msg" role="status" hidden></p>`;
export function view(d, id) {
  const p = id != null && id !== '' ? d.players[id] : null;
  if (!id) return empty('你還沒有自己的球員。') + agentEntry('建立你的球員');
  if (!p) return empty('找不到這位球員，他可能還沒登錄進名單。') + agentEntry('建立或查看你的球員');
  const where = p.tier === 3 || p.team == null ? TIER_LABEL[3] : `${esc(teamName(d, p.team))}　${esc(TIER_LABEL[p.tier] || '')}`;
  return `<section class="me"><h2>${esc(p.name)}</h2><dl><dt>位置</dt><dd>${pos(p)}</dd><dt>年齡</dt><dd>${esc(p.age)}</dd><dt>綜合</dt><dd class="num">${esc(p.overall)}</dd><dt>目前</dt><dd>${where}</dd><dt>能力</dt><dd>${abilityText(p) || '—'}</dd></dl>${switchBox()}${agentEntry('建立或管理你的球員')}</section>`;
}
