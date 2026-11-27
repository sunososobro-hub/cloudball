/* render/lineup.js: who holds each lineup slot at each broadcast frame (#436 part 4). Pure, no three.js, no DOM.
 * The engine replaces a lineup man on a pinch hit or a pinch run (stream event `substitution`, role `pinch_hitter` /
 * `pinch_runner`, with `team`, `lineup` slot, `in` name, `pos`). Frames keep `bat: [team, slot]`, so a viewer that looks
 * the slot up in the roster's `bat` would draw the replaced man. lineupsByFrame applies every such event from its frame on.
 * Content only (rule 10): it reads the event stream, never changes it. A pitching change (role `pitcher`) is not a lineup move.
 *
 *   const L = lineupsByFrame(game.ev, game.stream, ROSTERS);
 *   L.batterOf(e)      -> the player object batting in frame e (k = 1: the man after him, on deck)
 *   L.playerOf(t, nm)  -> the roster object of a team-t player by name (lineup, bench or staff), or undefined */
export function lineupsByFrame(ev, stream, rosters) {
  const subs = new Map();
  for (const x of stream || []) {
    if (x.type !== 'substitution' || x.role === 'pitcher' || x.lineup === undefined) continue;
    if (!subs.has(x.f)) subs.set(x.f, []);
    subs.get(x.f).push(x);
  }
  const findIn = (t, name) => {
    const R = rosters[t] || {};
    return (R.bat || []).find(b => b.name === name) || (R.bench || []).find(b => b.name === name) || (R.pit || []).find(b => b.name === name);
  };
  let cur = [0, 1].map(t => ((rosters[t] || {}).bat || []).slice());
  const at = new Map();
  (ev || []).forEach((e, i) => {
    const s = subs.get(i);
    if (s) {
      cur = cur.map(l => l.slice());   /* copy on change: earlier frames keep their own lineup */
      for (const x of s) {
        const p = findIn(x.team, x.in) || { name: x.in };
        cur[x.team][x.lineup] = x.pos ? { ...p, pos: x.pos } : p;
      }
    }
    at.set(e, cur);
  });
  return {
    batterOf(e, k = 0) {
      if (!e || !e.bat) return undefined;
      const L = (at.get(e) || [])[e.bat[0]];
      return L && L.length ? L[(e.bat[1] + k) % L.length] : undefined;
    },
    lineupAt(e, t) { return (at.get(e) || [])[t]; },
    playerOf: findIn,
  };
}
