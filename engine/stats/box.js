/* Statistics rebuilt from the event stream alone. Nothing here trusts the simulation's own
 * running totals, which is what makes it useful as a cross-check. */

const HITS = { single: 1, infield_single: 1, bunt_single: 1, double: 2, triple: 3, home_run: 4 };
const NOT_AT_BAT = new Set(['walk', 'intentional_walk', 'hit_by_pitch', 'sac_bunt', 'sac_fly']);
const blank = () => ({ pa: 0, ab: 0, h: 0, d: 0, t: 0, hr: 0, tb: 0, bb: 0, ibb: 0, hbp: 0, k: 0, sf: 0, sh: 0, rbi: 0, gidp: 0, roe: 0 });
/* Team-only counts: steals, and what happened to every pitch the team's batters saw. */
const blankTeam = () => ({ ...blank(), sb: 0, cs: 0, sb3: 0, cs3: 0, wp: 0, pb: 0, bk: 0, po: 0, pof: 0, seen: 0, zone: 0, zoneSwing: 0, chaseSwing: 0, zoneWhiff: 0, chaseWhiff: 0, first: 0, firstSwing: 0, inPlay: 0 });

/* One game's box score: runs by team and inning, outs, and batting lines per team and player. */
export function boxFromStream(stream) {
  const box = { score: [0, 0], line: [[], []], outs: [0, 0], pitches: [0, 0], team: [blankTeam(), blankTeam()], players: [{}, {}], innings: 0, ended: false };
  let inning = 1, inZone = false, first = false, wpFrame = -1;   /* the pitch the next swing or call belongs to */
  for (const x of stream) {
    if (x.type === 'half_start') { inning = x.inning; box.innings = Math.max(box.innings, inning); box.line[x.team][inning - 1] = box.line[x.team][inning - 1] || 0; }
    else if (x.type === 'pitch') { box.pitches[1 - x.team]++; inZone = x.inZone; first = x.count[0] + x.count[1] === 0; const T = box.team[x.team]; T.seen++; if (inZone) T.zone++; if (first) T.first++; }
    else if (x.type === 'swing') { const T = box.team[x.team]; T[inZone ? 'zoneSwing' : 'chaseSwing']++; if (first) T.firstSwing++; }
    else if (x.type === 'contact') box.team[x.team].inPlay++;
    else if (x.type === 'call') { if (x.call === 'swinging_strike') box.team[x.team][inZone ? 'zoneWhiff' : 'chaseWhiff']++; }
    else if (x.type === 'runner_advance') { if (x.how === 'steal') { box.team[x.team].sb++; if (x.to === 3) box.team[x.team].sb3++; } if ((x.how === 'wild_pitch' || x.how === 'passed_ball' || x.how === 'balk') && x.f !== wpFrame) { wpFrame = x.f; box.team[x.team][x.how === 'wild_pitch' ? 'wp' : x.how === 'balk' ? 'bk' : 'pb']++; } }
    else if (x.type === 'pickoff') { if (x.safe) box.team[x.team].pof++; }
    else if (x.type === 'run_scored') { box.score[x.team]++; box.line[x.team][inning - 1] = (box.line[x.team][inning - 1] || 0) + 1; }
    else if (x.type === 'out') { box.outs[x.team]++; if (x.steal) { box.team[x.team].cs++; if (x.base === 3) box.team[x.team].cs3++; } if (x.pickoff) box.team[x.team].po++; }
    else if (x.type === 'pa_end') {
      const T = box.team[x.team], P = box.players[x.team][x.batter] || (box.players[x.team][x.batter] = blank());
      for (const s of [T, P]) {
        s.pa++; s.rbi += x.rbi || 0;
        if (!NOT_AT_BAT.has(x.result)) s.ab++;
        if (HITS[x.result]) { s.h++; s.tb += HITS[x.result]; if (x.result === 'double') s.d++; if (x.result === 'triple') s.t++; if (x.result === 'home_run') s.hr++; }
        if (x.result === 'walk' || x.result === 'intentional_walk') s.bb++;
        if (x.result === 'intentional_walk') s.ibb++;
        if (x.result === 'hit_by_pitch') s.hbp++;
        if (x.result === 'strikeout') s.k++;
        if (x.result === 'sac_fly') s.sf++;
        if (x.result === 'sac_bunt') s.sh++;
        if (x.result === 'double_play') s.gidp++;
        if (x.result === 'error') s.roe++;
      }
    } else if (x.type === 'game_end') box.ended = true;
  }
  return box;
}

/* League-wide rates over many box scores, for tuning the engine against real baseball. */
export function aggregate(boxes) {
  const T = blankTeam(); let runs = 0, innings = 0, pitches = 0;
  for (const b of boxes) {
    runs += b.score[0] + b.score[1]; innings += b.innings; pitches += b.pitches[0] + b.pitches[1];
    for (const side of b.team) for (const k in T) T[k] += side[k];
  }
  const n = boxes.length || 1, per = x => x / n, rate = (a, b) => b ? a / b : 0;
  const obpDen = T.ab + T.bb + T.hbp + T.sf;
  return {
    games: boxes.length, runsPerGame: per(runs), inningsPerGame: per(innings), pitchesPerGame: per(pitches), paPerGame: per(T.pa),
    kPct: rate(T.k, T.pa), bbPct: rate(T.bb, T.pa), hbpPct: rate(T.hbp, T.pa),
    avg: rate(T.h, T.ab), obp: rate(T.h + T.bb + T.hbp, obpDen), slg: rate(T.tb, T.ab),
    hrPerGame: per(T.hr), doublesPerGame: per(T.d), triplesPerGame: per(T.t), gidpPerGame: per(T.gidp),
    babip: rate(T.h - T.hr, T.ab - T.k - T.hr + T.sf),
    hitsPerGame: per(T.h), ibbPerGame: per(T.ibb), sfPerGame: per(T.sf), shPerGame: per(T.sh), roePerGame: per(T.roe),
    sbPerGame: per(T.sb), wpPerGame: per(T.wp), pbPerGame: per(T.pb), bkPerGame: per(T.bk), poPerGame: per(T.po), pickoffThrowsPerGame: per(T.po + T.pof), csPerGame: per(T.cs), sbPct: rate(T.sb, T.sb + T.cs), sb3PerGame: per(T.sb3), cs3PerGame: per(T.cs3),
    pitchesPerPa: rate(pitches, T.pa), zonePct: rate(T.zone, T.seen),
    swingPct: rate(T.zoneSwing + T.chaseSwing, T.seen), zoneSwingPct: rate(T.zoneSwing, T.zone), chasePct: rate(T.chaseSwing, T.seen - T.zone),
    firstPitchSwingPct: rate(T.firstSwing, T.first), inPlayPct: rate(T.inPlay, T.seen),
    whiffPct: rate(T.zoneWhiff + T.chaseWhiff, T.zoneSwing + T.chaseSwing),
    zoneContactPct: 1 - rate(T.zoneWhiff, T.zoneSwing), chaseContactPct: 1 - rate(T.chaseWhiff, T.chaseSwing),
  };
}
