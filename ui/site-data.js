/* Text-first data site (#335, split by tab in #344). Pure view functions: data files in, HTML strings out. No DOM, no network, no game maths (rule 10):
 * everything shown is read from league/site/{teams,players,games}.json (contract: issue #336). Publishing = replacing those files.
 * This file is only the tab list, the data file names and the dispatch; each tab is one file, `ui/site/<tab>.js` exporting `view(data, myId)`
 * (helpers shared by all tabs are in `ui/site/shared.js`). Adding a tab = one new file + one line in TABS and one in VIEWS below.
 * tests/sitedata.check.mjs renders every view with fixtures, with the real files when present, and with empty lists. */
import { view as home } from './site/home.js';
import { view as teams } from './site/teams.js';
import { view as games } from './site/games.js';
import { view as me } from './site/me.js';
import { view as minors } from './site/minors.js';
import { view as fa } from './site/fa.js';
export * from './site/shared.js';
export { replayLink, GAME_PAGE } from './site/games.js';
export { AGENT_PAGE } from './site/me.js';
export { home as homeView, teams as teamsView, games as gamesView, me as myPlayerView, minors as minorsView, fa as freeAgentsView };

export const DATA_FILES = { teams: 'league/site/teams.json', players: 'league/site/players.json', games: 'league/site/games.json', farm: 'league/site/farm_games.json' };
export const TABS = [['home', '首頁'], ['teams', '球團'], ['games', '比賽影片'], ['me', '我的球員'], ['minors', '二軍'], ['fa', '自由市場']];
export const VIEWS = { home, teams, games, me, minors, fa };
/* `args` are the hash segments after the tab. 球團: #teams/<team id>/<filter>/<player id>; 二軍 and 自由市場: #<tab>/<filter>/<player id> (#353); other tabs ignore them */
export function render(tab, d, myId, ...args) { return (VIEWS[tab] || home)(d, myId, ...args); }
