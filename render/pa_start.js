/* render/pa_start.js: where one player's turns start in a replayed game (#804 part 8, 看他的打席). Pure, no three.js, no DOM.
 * Content only (rule 10): it reads the recorded frames and the record's own rosters, never changes the game.
 * A batter's plate appearance starts at a pitch frame whose batter is him and whose previous pitch frame ended a PA (`pa`),
 * belonged to another lineup slot, or does not exist. Pinch hitters count (render/lineup.js follows the substitutions).
 * A pitcher's turn is the first pitch he throws in each half inning.
 *
 * `rosters` is the record's `opts.rosters` (indexed by team, null = engine default) and `teams` the record's two teams (away, home).
 *   paStarts(game, rosters, id, teams) -> [{ i, t }]  frame index and seek time (PA_LEAD_S before the pitch), in game order
 *   paJump(game, rosters, id, teams)   -> { i, t, n, note } for the first one, or null (bad id, not in the game) */
import { lineupsByFrame } from './lineup.js';

export const PA_LEAD_S = 1.5;            /* s of the batter walking up before the first pitch */
export const PA_ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
export const PA_PARAM = 'p';
export const paLink = (href, id) => `${href}${href.includes('?') ? '&' : '?'}${PA_PARAM}=${encodeURIComponent(id)}`;

const pitcherOf = (rosters, e) => { const R = rosters && rosters[e.pit[0]]; return R && Array.isArray(R.pit) ? R.pit[e.pit[1]] : undefined; };

const sides = (rosters, teams) => (Array.isArray(teams) && teams.length === 2 ? teams : [0, 1]).map(t => rosters[t] || null);

export function paStarts(game, all, id, teams) {
  if (!game || !Array.isArray(game.ev) || !Array.isArray(all) || !PA_ID_RE.test(String(id || ''))) return [];
  const rosters = sides(all, teams), L = lineupsByFrame(game.ev, game.stream, rosters), out = [];
  let prev = null;
  game.ev.forEach((e, i) => {
    if (e.k !== 'P' || !e.bat || !e.pit) return;
    const b = L.batterOf(e), p = pitcherOf(rosters, e), half = e.s0 ? `${e.s0.inn}-${e.s0.half}` : '';
    const newPa = !prev || prev.e.pa || prev.e.bat[0] !== e.bat[0] || prev.e.bat[1] !== e.bat[1];
    const newHalf = !prev || prev.half !== half || pitcherOf(rosters, prev.e) !== p;
    if ((b && b.id === id && newPa) || (p && p.id === id && newHalf)) out.push({ i, t: Math.max(0, e.t - PA_LEAD_S) });
    prev = { e, half };
  });
  return out;
}

export function paJump(game, all, id, teams) {
  const s = paStarts(game, all, id, teams);
  if (!s.length) return null;
  const pit = sides(all, teams).some(R => R && Array.isArray(R.pit) && R.pit.some(q => q && q.id === id));
  return { ...s[0], n: s.length, note: pit ? `從他上場投球開始（${s.length} 個半局）` : `從他的第 1 個打席開始（共 ${s.length} 個）` };
}
