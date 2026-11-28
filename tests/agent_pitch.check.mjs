/* 經紀人 agent sets in the engine (#795 part 2b, pitcher frequencies): simGame opts.agents = { <pitcher name>: set of kind 'pit' }
 * feeds league/agentset.js levels into the pitcher's own decisions (engine/constants.js AGENT_FASTBALL_* / AGENT_EDGE_* / AGENT_PICKOFF_*).
 * Fails when
 *   - a game with no agents differs from the same game with an all-neutral 'pit' set for every pitcher (byte for byte),
 *   - two runs of a seed with the same pitcher sets differ (rule 11),
 *   - a middle entry of a pitcher AGENT_* table is not exactly 1, or a table does not have one entry per level,
 *   - fastball 4: the 直球 share is not higher than neutral, or walks are not fewer AND strikeouts not fewer (the trade-off);
 *     fastball 0: the 直球 share is not lower,
 *   - edges 4: walks are not more AND strikeouts not more than neutral (walks for strikeouts),
 *   - pickoff 0: any pickoff or throw-over; pickoff 4: not more throw-overs, not fewer steal tries, not more balks,
 *   - a situation row is ignored: pickoff 0 in 'normal' + 4 in 'runners_on' must still throw over.
 * Prints the rates. static.mjs runs this file. Usage: node tests/agent_pitch.check.mjs */
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { simGame, ROSTERS } = await import(pathToFileURL(path.join(ROOT, 'engine/index.js')));
const K = await import(pathToFileURL(path.join(ROOT, 'engine/constants.js')));
const A = await import(pathToFileURL(path.join(ROOT, 'league/agentset.js')));
const GAMES = 400;
const problems = [], bad = s => problems.push(s);
const J = JSON.stringify;

const names = [...new Set(ROSTERS.flatMap(r => r.pit.map(p => p.name)))];
const setAll = rows => Object.fromEntries(names.map(n => [n, { v: A.AGENT_SET_VERSION, kind: 'pit', rows }]));
const lv = (freq, level) => setAll({ [A.NORMAL]: { [freq]: level } });
const opts = (s, agents) => ({ teams: [s % 4, (s + 1) % 4], agents });

for (const name of ['AGENT_FASTBALL_SHARE_MULT', 'AGENT_FASTBALL_ZONE_MULT', 'AGENT_FASTBALL_CONTACT_MULT', 'AGENT_EDGE_ZONE_MULT',
  'AGENT_EDGE_CONTACT_MULT', 'AGENT_PICKOFF_MULT', 'AGENT_PICKOFF_HOLD_MULT', 'AGENT_PICKOFF_BALK_MULT']) {
  const t = K[name];
  if (!Array.isArray(t) || t.length !== A.LEVEL_MAX - A.LEVEL_MIN + 1) bad(`${name} needs one entry per level`);
  else if (t[A.LEVEL_NEUTRAL] !== 1) bad(`${name}[LEVEL_NEUTRAL] is ${t[A.LEVEL_NEUTRAL]}, must be exactly 1`);
}

const FB = K.PITCH_TYPES[0][0];
const count = games => {
  let pitches = 0, fb = 0, bb = 0, so = 0, po = 0, sbTry = 0, bk = 0;
  for (const g of games) {
    for (const e of g.ev) {
      if (e.k !== 'P') continue;
      if (e.r === 'po' || e.r === 'pof') po++;
      else if (e.r === 'bk') bk++;
      else if (e.r !== 'ibb') { pitches++; if (e.pt === FB) fb++; }
      if (e.sbGo) sbTry++;
    }
    for (const x of g.stream) if (x.type === 'pa_end') { if (x.result === 'walk') bb++; else if (x.result === 'strikeout') so++; }
  }
  return { fb: fb / pitches, bb, so, po, sbTry, bk };
};
const run = agents => { const out = []; for (let s = 1; s <= GAMES; s++) out.push(simGame(s, {}, opts(s, agents))); return out; };

const neutral = setAll({});
const base = run(undefined);
for (let s = 1; s <= GAMES; s++) {
  if (J(base[s - 1].stream) !== J(simGame(s, {}, opts(s, neutral)).stream)) { bad(`seed ${s}: all-neutral pitcher sets change the game`); break; }
}
const busy = setAll({ [A.NORMAL]: { fastball: 4, edges: 1, pickoff: 3 }, risp: { edges: 4 }, late_close: { pickoff: 0 } });
for (let s = 1; s <= 50; s++) if (J(simGame(s, {}, opts(s, busy)).stream) !== J(simGame(s, {}, opts(s, busy)).stream)) { bad(`seed ${s}: not deterministic with pitcher sets`); break; }

const B = count(base);
const r = {};
for (const [f, l] of [['fastball', 0], ['fastball', 4], ['edges', 0], ['edges', 4], ['pickoff', 0], ['pickoff', 4]]) r[`${f}${l}`] = count(run(lv(f, l)));

if (!(r.fastball4.fb > B.fb + 0.1)) bad(`fastball 4: 直球 share ${r.fastball4.fb.toFixed(3)} vs neutral ${B.fb.toFixed(3)}`);
if (!(r.fastball0.fb < B.fb - 0.1)) bad(`fastball 0: 直球 share ${r.fastball0.fb.toFixed(3)} vs neutral ${B.fb.toFixed(3)}`);
if (!(r.fastball4.bb < B.bb && r.fastball4.so < B.so)) bad(`fastball 4: BB ${r.fastball4.bb} / SO ${r.fastball4.so} vs neutral ${B.bb} / ${B.so}, want both fewer`);
if (!(r.edges4.bb > B.bb && r.edges4.so > B.so)) bad(`edges 4: BB ${r.edges4.bb} / SO ${r.edges4.so} vs neutral ${B.bb} / ${B.so}, want both more`);
if (!(r.edges0.bb < B.bb && r.edges0.so < B.so)) bad(`edges 0: BB ${r.edges0.bb} / SO ${r.edges0.so} vs neutral ${B.bb} / ${B.so}, want both fewer`);
if (r.pickoff0.po) bad(`pickoff 0: ${r.pickoff0.po} throw-overs, want none`);
if (!(r.pickoff4.po > B.po * 1.5)) bad(`pickoff 4: ${r.pickoff4.po} throw-overs vs neutral ${B.po}, want > 1.5x`);
if (!(r.pickoff4.sbTry < B.sbTry)) bad(`pickoff 4: ${r.pickoff4.sbTry} steal tries vs neutral ${B.sbTry}, want fewer`);
if (!(r.pickoff4.bk > B.bk)) bad(`pickoff 4: ${r.pickoff4.bk} balks vs neutral ${B.bk}, want more (the price)`);
const runnersOn = count(run(setAll({ [A.NORMAL]: { pickoff: 0 }, runners_on: { pickoff: 4 } })));
if (!(runnersOn.po > 0)) bad(`pickoff 0 normal / 4 runners_on: no throw-overs, the row is ignored`);

const f3 = x => x.toFixed(3);
console.log(`agent_pitch.check ${problems.length ? 'FAIL' : 'ok'}: ${GAMES} games; neutral = no agents byte for byte`);
console.log(`  直球 share: neutral ${f3(B.fb)}, 0: ${f3(r.fastball0.fb)}, 4: ${f3(r.fastball4.fb)}`);
console.log(`  BB / SO: neutral ${B.bb} / ${B.so}; fastball 0: ${r.fastball0.bb} / ${r.fastball0.so}, 4: ${r.fastball4.bb} / ${r.fastball4.so}; edges 0: ${r.edges0.bb} / ${r.edges0.so}, 4: ${r.edges4.bb} / ${r.edges4.so}`);
console.log(`  throw-overs / steal tries / balks: neutral ${B.po} / ${B.sbTry} / ${B.bk}; pickoff 0: ${r.pickoff0.po} / ${r.pickoff0.sbTry} / ${r.pickoff0.bk}, 4: ${r.pickoff4.po} / ${r.pickoff4.sbTry} / ${r.pickoff4.bk}; runners_on-only 4: ${runnersOn.po}`);
if (problems.length) { console.error('- ' + problems.join('\n- ')); process.exit(1); }
