/* Text-first data site (#335): tabs in the URL hash, data fetched from league/site/*.json, drawn by ui/site-data.js.
 * A missing or broken file is an empty list (the views have empty states), never an error screen. */
import { DATA_FILES, MY_PLAYER_KEY, TABS, combine, render, seasonLabel } from './site-data.js';
const $ = id => document.getElementById(id);
const get = async url => { try { const r = await fetch(url, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
let myId = ''; try { myId = localStorage.getItem(MY_PLAYER_KEY) || ''; } catch (e) { /* storage blocked: no player yet */ }
const tabOf = () => { const h = location.hash.slice(1); return TABS.some(t => t[0] === h) ? h : TABS[0][0]; };
let data = combine({});
function draw() {
  const tab = tabOf();
  $('tabs').innerHTML = TABS.map(([k, label]) => `<a role="tab" href="#${k}" aria-selected="${k === tab}">${label}</a>`).join('');
  $('view').innerHTML = render(tab, data, myId);
  $('season').innerHTML = seasonLabel(data);
}
addEventListener('hashchange', draw);
draw();
Promise.all(Object.values(DATA_FILES).map(get)).then(([teams, players, games]) => { data = combine({ teams, players, games }); draw(); });
