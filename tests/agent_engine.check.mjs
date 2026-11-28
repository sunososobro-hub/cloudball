/* 經紀人 agent sets in the engine (#795 part 2, batter frequencies): simGame opts.agents = { <player name>: set } feeds
 * league/agentset.js levels into the batter's own decisions (engine/constants.js AGENT_*). Fails when
 *   - a game with no agents differs from the same game with an all-neutral set for every batter (byte for byte),
 *   - two runs of a seed with the same agent sets differ (rule 11),
 *   - a middle entry of an AGENT_* table is not exactly 1, or a table does not have one entry per level,
 *   - steal: level 0 everywhere still has a steal attempt; level 4 does not try clearly more than neutral,
 *     or its success rate is not lower than neutral's (more steals = more attempts AND more caught stealing),
 *   - bunt: level 0 everywhere still has a sacrifice-bunt attempt; level 4 does not bunt more than neutral,
 *   - swing early: level 4 does not swing more on the first two pitches than neutral, level 0 not less,
 *     or the swing rate after two pitches moves (the setting is early-count only),
 *   - a situation row is ignored: steal 0 in 'normal' + 4 in 'runners_on' must steal; + 4 only in 'two_outs' must not.
 * Prints the rates. static.mjs runs this file. Usage: node tests/agent_engine.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const A = await import(pathToFileURL(path.join(ROOT, 'league/agentset.js')));
const GAMES = 400;
const problems = [], bad = s => problems.push(s);
const J = JSON.stringify;

const names = [...new Set(ROSTERS.flatMap(r => [...r.bat, ...(r.bench || [])].map(b => b.name)))];
const setAll = rows => Object.fromEntries(names.map(n => [n, { v: A.AGENT_SET_VERSION, kind: 'bat', rows }]));
const lv = (freq, level) => setAll({ [A.NORMAL]: { [freq]: level } });
const opts = (s, agents) => ({ teams: [s % 4, (s + 1) % 4], agents });

for (const name of ['AGENT_SWING_EARLY_MULT', 'AGENT_STEAL_TRY_MULT', 'AGENT_STEAL_OK_MULT', 'AGENT_BUNT_MULT']) {
  const t = K[name];
  if (!Array.isArray(t) || t.length !== A.LEVEL_MAX - A.LEVEL_MIN + 1) bad(`${name} needs one entry per level`);
  else if (t[A.LEVEL_NEUTRAL] !== 1) bad(`${name}[LEVEL_NEUTRAL] is ${t[A.LEVEL_NEUTRAL]}, must be exactly 1`);
}

/* per pitch: was it a swing, and how many pitches of the PA came before it */
const count = games => {
  let sbTry = 0, sbOk = 0, bunts = 0, earlyP = 0, earlyS = 0, lateP = 0, lateS = 0;
  for (const g of games) for (const e of g.ev) {
    if (e.k !== 'P' || !e.c0 || ['bk', 'po', 'pof', 'ibb', 'hbp'].includes(e.r)) continue;
    if (e.sbGo) { sbTry++; if (!(e.outs || []).length) sbOk++; }
    if (e.bunt || (e.play && e.play.bunt)) bunts++;
    if (e.bunt) continue;
    const early = e.c0[0] + e.c0[1] < K.AGENT_EARLY_PITCHES;
    if (early) { earlyP++; if (e.swing) earlyS++; } else { lateP++; if (e.swing) lateS++; }
  }
  return { sbTry, sbOk, sbRate: sbOk / Math.max(1, sbTry), bunts, early: earlyS / earlyP, late: lateS / lateP };
};
const run = agents => { const out = []; for (let s = 1; s <= GAMES; s++) out.push(simGame(s, {}, opts(s, agents))); return out; };

/* neutral = no agents, byte for byte; determinism */
const neutral = setAll({});
const base = run(undefined);
for (let s = 1; s <= GAMES; s++) {
  if (J(base[s - 1].stream) !== J(simGame(s, {}, opts(s, neutral)).stream)) { bad(`seed ${s}: all-neutral agent sets change the game`); break; }
}
const busy = setAll({ [A.NORMAL]: { steal: 4, swing_early: 0, bunt: 3 }, two_outs: { steal: 0 } });
for (let s = 1; s <= 50; s++) if (J(simGame(s, {}, opts(s, busy)).stream) !== J(simGame(s, {}, opts(s, busy)).stream)) { bad(`seed ${s}: not deterministic with agent sets`); break; }

const B = count(base);
const r = {};
for (const [f, l] of [['steal', 0], ['steal', 4], ['bunt', 0], ['bunt', 4], ['swing_early', 0], ['swing_early', 4]]) r[`${f}${l}`] = count(run(lv(f, l)));

if (r.steal0.sbTry) bad(`steal 0: ${r.steal0.sbTry} steal attempts, want none`);
if (!(r.steal4.sbTry > B.sbTry * 1.3)) bad(`steal 4: ${r.steal4.sbTry} attempts vs neutral ${B.sbTry}, want > 1.3x`);
if (!(r.steal4.sbRate < B.sbRate)) bad(`steal 4: success ${r.steal4.sbRate.toFixed(3)} not below neutral ${B.sbRate.toFixed(3)}`);
if (r.bunt0.bunts) bad(`bunt 0: ${r.bunt0.bunts} bunt pitches, want none`);
if (!(r.bunt4.bunts > B.bunts)) bad(`bunt 4: ${r.bunt4.bunts} bunt pitches vs neutral ${B.bunts}`);
if (!(r.swing_early4.early > B.early + 0.02)) bad(`swing_early 4: early swing ${r.swing_early4.early.toFixed(3)} vs neutral ${B.early.toFixed(3)}`);
if (!(r.swing_early0.early < B.early - 0.02)) bad(`swing_early 0: early swing ${r.swing_early0.early.toFixed(3)} vs neutral ${B.early.toFixed(3)}`);
for (const k of ['swing_early0', 'swing_early4']) if (Math.abs(r[k].late - B.late) > 0.02) bad(`${k}: swing rate after two pitches moved ${B.late.toFixed(3)} -> ${r[k].late.toFixed(3)}`);

/* a 'two_outs' row overrides 'normal': steal 4 in normal but 0 with two outs = fewer attempts than 4 everywhere
 * (steals happen with 0 or 1 out only, stealBase, so test the inverse: steal 0 normal, 4 with two outs = none) */
const twoOnly = count(run(setAll({ [A.NORMAL]: { steal: 0 }, two_outs: { steal: 4 } })));
if (twoOnly.sbTry) bad(`steal 0 normal / 4 two_outs: ${twoOnly.sbTry} attempts, want none (no steals with two outs)`);
const runnersOn = count(run(setAll({ [A.NORMAL]: { steal: 0 }, runners_on: { steal: 4 } })));
if (!(runnersOn.sbTry > B.sbTry)) bad(`steal 0 normal / 4 runners_on: ${runnersOn.sbTry} attempts vs neutral ${B.sbTry}, the row is ignored`);

const f3 = x => x.toFixed(3);
console.log(`agent_engine.check ${problems.length ? 'FAIL' : 'ok'}: ${GAMES} games; neutral = no agents byte for byte`);
console.log(`  steal attempts / success: neutral ${B.sbTry} ${f3(B.sbRate)}, 0: ${r.steal0.sbTry}, 4: ${r.steal4.sbTry} ${f3(r.steal4.sbRate)}, runners_on-only 4: ${runnersOn.sbTry}`);
console.log(`  bunt pitches: neutral ${B.bunts}, 0: ${r.bunt0.bunts}, 4: ${r.bunt4.bunts}`);
console.log(`  swing on first ${K.AGENT_EARLY_PITCHES} pitches: neutral ${f3(B.early)}, 0: ${f3(r.swing_early0.early)}, 4: ${f3(r.swing_early4.early)}; after: ${f3(B.late)} / ${f3(r.swing_early0.late)} / ${f3(r.swing_early4.late)}`);
if (problems.length) { console.error('- ' + problems.join('\n- ')); process.exit(1); }
