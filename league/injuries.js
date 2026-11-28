/* #379 part 11: the league's injured list between scheduled games. Pure: no DOM, network, clock or randomness (rules 10, 11).
 * The engine decides every injury and its length (simGame opts.injury, #379 part 10, `injuries` out); this file only keeps
 * who is out until which day and builds tonight's roster without him. It never edits a result.
 *
 *   recordInjuries(list, injuries, day)  a new list with the game's injuries added: { team, name, back } where `back` is the
 *                                       first league day he plays again (he misses `days` whole game days after `day`).
 *                                       A player already on the list keeps the later `back`.
 *   outOn(list, team, day)              names of `team` (TEAMS index) still out on `day`, sorted.
 *   healthyRoster(roster, out)          the engine roster { bat, pit, bench } without the `out` names: an injured lineup
 *                                       batter's seat goes to the healthy bench man of his position, else the first healthy
 *                                       bench man (he takes the seat's `pos`); none left -> the injured man plays. Injured
 *                                       pitchers leave `pit` (bullpen) unless that would leave no pitcher.
 *   pickHealthyStarter(rot, teamId, pit, day, out)  index into the FULL `pit` (rotation memory is keyed by it): the healthy rotation man
 *                                       with the most rest (= season.pickStarter when one has MIN_REST_DAYS; short of
 *                                       that, the most rested healthy one pitches early); all injured -> pickStarter.
 *   healthyGame(rosters, teams, sp, out)  tonight's engine { rosters, starters } for a logged game: each team in `out`
 *                                       ({ <TEAMS index>: names }) plays healthyRoster, `sp` (index into the FULL pit) is
 *                                       moved to the healthy pit; no `out` = the inputs as they are. Used by the season run
 *                                       and by every replay of a logged game (trial_games.js), so both build the same game.
 * Data format (list): [{ team: <TEAMS index>, name, back }], plain JSON. */
import { rotationOf, restDays, pickStarter } from './season.js';

export function recordInjuries(list, injuries, day) {
  if (!injuries || !injuries.length) return list;
  const next = list.map(x => ({ ...x }));
  for (const j of injuries) {
    const back = day + j.days + 1, have = next.find(x => x.team === j.team && x.name === j.name);
    if (have) have.back = Math.max(have.back, back); else next.push({ team: j.team, name: j.name, back });
  }
  return next;
}

export const outOn = (list, team, day) => list.filter(x => x.team === team && x.back > day).map(x => x.name).sort();

export function healthyRoster(roster, out) {
  if (!out || !out.length) return roster;
  const hurt = new Set(out);
  let bench = (roster.bench || []).filter(p => !hurt.has(p.name));
  const bat = roster.bat.map(p => {
    if (!hurt.has(p.name) || !bench.length) return p;
    const sub = bench.find(b => b.pos === p.pos) || bench[0];
    bench = bench.filter(b => b !== sub);
    return sub.pos === p.pos ? sub : { ...sub, pos: p.pos };
  });
  const pit = roster.pit.filter(p => !hurt.has(p.name));
  return { ...roster, bat, bench, pit: pit.length ? pit : roster.pit };
}

export function pickHealthyStarter(rot, teamId, pit, day, out) {
  if (!out || !out.length) return pickStarter(rot, teamId, pit, day);
  const hurt = new Set(out), ok = rotationOf(pit).filter(i => !hurt.has(pit[i].name));
  if (!ok.length) return pickStarter(rot, teamId, pit, day);
  let best = ok[0], bestRest = restDays(rot, teamId, best, day);
  for (const i of ok.slice(1)) { const r = restDays(rot, teamId, i, day); if (r > bestRest) { best = i; bestRest = r; } }
  return best;
}

export function healthyGame(rosters, teams, sp, out) {
  if (!out) return { rosters, starters: sp };
  const rs = rosters.slice(), starters = sp.slice();
  teams.forEach((t, k) => {
    if (!out[t]) return;
    const full = rosters[t], h = healthyRoster(full, out[t].filter(n => n !== full.pit[sp[k]].name));   /* an all-injured rotation: tonight's starter pitches */
    rs[t] = h; starters[k] = h.pit.indexOf(full.pit[sp[k]]);
  });
  return { rosters: rs, starters };
}
