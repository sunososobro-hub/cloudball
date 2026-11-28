/* #612 part 4: the bullpens' people (plain Node, render/pen.js is run). Checks: pen spots map onto the pen strip of props/bullpens.js (BP) in world space;
 * over real engine games every VOTE kind P opens a warm-up window VOTE_WINDOW s early; a `stay` ends in a walk back to the bench, a `change` keeps throwing until the CHG
 * frame and walks to the gate by CW_SIGNAL (no jump); positions never jump; the arms loop stays finite; game.js builds the pen figures. static.mjs runs this file.
 * Usage: node tests/pen.check.mjs */
import { readFileSync } from 'node:fs';
import { simGame, VOTE_WINDOW } from '../engine/index.js';
import * as P from '../render/pen.js';
import { CW_SIGNAL } from '../render/chgwalk.js';
const bad = [], B = m => { if (bad.length < 30) bad.push(m); };
const bp = readFileSync(new URL('../render/props/bullpens.js', import.meta.url), 'utf8');
const num = re => Number(bp.match(re)[1]);
if (P.PEN_RUBBER_S !== num(/RUBBER_S:([\d.]+)/) || P.PEN_PLATE_D !== num(/PLATE_D:([\d.]+)/)) B('rubber / plate distance drifted from props/bullpens.js');
if (P.PEN_LANE_D !== num(/LANES:\[([\d.]+)/)) B('lane 0 drifted from props/bullpens.js');
if (P.PEN_WARM_LEAD !== VOTE_WINDOW) B('PEN_WARM_LEAD != VOTE_WINDOW');
/* world frame: both pens lie in foul ground, 45 degrees off the plate line, on the right side */
for (const side of [1, -1]) {
  const [x, z] = P.penWorld(side, 70, 12), [x0, z0] = P.penWorld(side, 60, 12);
  if (Math.sign(x) !== side) B(`side ${side}: pen on the wrong side (${x})`);
  if (!(z < z0)) B(`side ${side}: pen does not run out toward -z`);
  const th = Math.atan2(Math.abs(x - x0), Math.abs(z - z0)); if (Math.abs(th - Math.PI / 4) > .2) B('pen line is not near 45 degrees');
  const rub = P.penWorld(side, P.PEN_RUBBER_S, P.PEN_LANE_D), pl = P.penWorld(side, P.PEN_RUBBER_S + P.PEN_PLATE_D, P.PEN_LANE_D);
  if (Math.abs(Math.hypot(rub[0] - pl[0], rub[1] - pl[1]) - P.PEN_PLATE_D) > 1e-9) B('rubber-plate distance wrong in world space');
}
let votes = 0, changes = 0, stays = 0;
for (let seed = 1; seed <= 30; seed++) {
  const ev = simGame(seed, {}, {}).ev, ws = P.windows(ev);
  for (const v of ev.filter(e => e.k === 'VOTE' && e.kind === 'P')) {
    votes++;
    const w = ws.find(x => x.team === v.team && Math.abs(x.start - (v.t - VOTE_WINDOW)) < 1e-9);
    if (!w) { B(`seed ${seed}: no warm-up window for vote ${v.id}`); continue; }
    const t = v.team, who = w.who, mid = (w.start + P.PEN_WALK + w.throwEnd) / 2;
    if (P.warmAt(ev, t, who, w.start - .5) !== null) B('warm before the window');
    if (P.warmAt(ev, t, 1 - who, mid) !== null) B('the other reliever warms too');
    const st = P.warmAt(ev, t, who, mid); if (!st || st.k !== 'throw') B('not throwing mid-window');
    if (w.change) { changes++; if (Math.abs(w.end - w.chgT - CW_SIGNAL) > 1e-9) B('change window does not end at the gate'); if (!P.warmAt(ev, t, who, w.end).over) B('not at the gate at the end'); }
    else { stays++; const b = P.warmAt(ev, t, who, w.throwEnd + P.PEN_WALK * .5); if (!b || b.k !== 'back') B('stay: no walk back'); }
    let prev = null; for (let T = w.start - 1; T <= (w.change ? w.end : w.end + 1); T += .05) {
      const s = P.warmAt(ev, t, who, T), r = P.relieverAt(who, s), cur = r.p;
      if (cur.some(x => !Number.isFinite(x)) || r.face.some(x => !Number.isFinite(x))) B('non finite spot');
      if (prev && Math.hypot(cur[0] - prev[0], cur[1] - prev[1]) > .5) { B(`seed ${seed}: reliever jumps ${Math.hypot(cur[0] - prev[0], cur[1] - prev[1]).toFixed(2)} m at ${T.toFixed(2)}`); break; }
      prev = cur;
    }
  }
}
if (!votes || !changes || !stays) B(`the check saw nothing (votes ${votes}, change ${changes}, stay ${stays})`);
let last = null; for (let tt = 0; tt < 2 * P.PEN_THROW_PERIOD; tt += .02) {
  const h = P.throwHands(tt), v = [...h.r, ...h.l]; if (v.some(x => !Number.isFinite(x))) B('bad throw hands');
  if (last && Math.hypot(...v.map((x, i) => x - last[i])) > .15) B('throw arms jump at ' + tt.toFixed(2)); last = v;
}
if (JSON.stringify(P.throwHands(1.1)) !== JSON.stringify(P.throwHands(1.1 + P.PEN_THROW_PERIOD))) B('throw loop is not periodic');
if (!/pen\.js/.test(readFileSync(new URL('../render/game.js', import.meta.url), 'utf8'))) B('game.js does not load pen.js');
if (bad.length) { console.error('pen.check FAILED\n' + bad.join('\n')); process.exit(1) }
console.log(`pen.check ok (${votes} pitching votes: ${changes} change, ${stays} stay)`);
