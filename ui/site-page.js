/* Text-first data site (#335): tabs in the URL hash, data fetched from league/site/*.json, drawn by ui/site-data.js.
 * A missing or broken file is an empty list (the views have empty states), never an error screen. */
import { DATA_FILES, MY_PLAYER_KEY, TABS, combine, mergeCreated, render, seasonLabel } from './site-data.js';
const $ = id => document.getElementById(id);
const get = async url => { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
let myId = ''; try { myId = localStorage.getItem(MY_PLAYER_KEY) || ''; } catch (e) { /* storage blocked: no player yet */ }
const parts = () => location.hash.slice(1).split('/').map(decodeURIComponent);
const tabOf = () => { const h = parts()[0]; return TABS.some(t => t[0] === h) ? h : TABS[0][0]; };
let data = combine({});
function draw() {
  const tab = tabOf();
  $('tabs').innerHTML = TABS.map(([k, label]) => `<a role="tab" href="#${k}" aria-selected="${k === tab}">${label}</a>`).join('');
  $('view').innerHTML = render(tab, data, myId, ...parts().slice(1));
  $('season').innerHTML = seasonLabel(data);
}
addEventListener('hashchange', draw);
draw();
/* created players (#399): the D1 list, a few pages at most; no answer (closed, offline, no API on this host) = no rows, no error screen */
const FA_PAGES = 5;
async function created() { const rows = []; for (let pg = 0; pg < FA_PAGES; pg++) { const r = await get(`/api/freeagents?sort=new&page=${pg}`); if (!r || !r.ok || !Array.isArray(r.players)) break; rows.push(...r.players); if (!r.more) break; } return rows; }
Promise.all([...Object.values(DATA_FILES).map(get), created()]).then(([teams, players, games, rows]) => { data = mergeCreated(combine({ teams, players, games }), rows); draw(); });
