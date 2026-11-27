/* Guard for the entry screen that never wakes (#668, ui/bootwait.js + the ?f= / ?g= loads in play.html). Fails when
 *   - pending() does not name the first open boot stage, or counts the optional farm / ledger stage before it started;
 *   - deadline() does not reject a load that never answers, or rejects / keeps its timer for one that answers;
 *   - the 二軍 replay with the engine CDN blocked (import throws, or never answers) is not `unavailable` / given up within
 *     OPTIONAL_MS, so play.html could not fall back to the frozen game;
 *   - arm() does not put a named line + 重試 on the entry card after STALL_MS, or does so once the button woke or boot failed;
 *   - STALL_MS is over 20 s (issue #668) or the replay give-up comes after the stall line.
 * Usage: node tests/bootwait.check.mjs */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { farmOpening } from '../league/farm.js';
const W = createRequire(import.meta.url)('../ui/bootwait.js');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);

/* stage order */
const all = Object.fromEntries(W.ORDER.map(s => [s[0], 1]));
if (W.pending(all) !== null) bad('pending: every stage ended but still reports one');
const noGpu = { ...all }; delete noGpu.gpu; delete noGpu.game; delete noGpu.button;
if ((W.pending(noGpu) || [])[0] !== 'gpu') bad(`pending: want gpu, got ${W.pending(noGpu)}`);
const failedGpu = { ...noGpu, 'gpu!': 1 };
if ((W.pending(failedGpu) || [])[0] !== 'game') bad('pending: a failed stage (gpu!) must count as ended');
const noFarm = { ...all }; delete noFarm.farm; delete noFarm.ledger;
if (W.pending(noFarm) !== null) bad('pending: farm counted although it never started (no farm0)');
if ((W.pending({ ...noFarm, farm0: 1 }) || [])[0] !== 'farm') bad('pending: farm started (farm0) and open but not named');
if (!W.stallText(['gpu', 'x']).includes('x') || !W.stallText(['gpu', 'x']).includes('重試')) bad('stallText: must name the stage and 重試');

/* deadline with fake timers */
const timers = [];
const setT = (f, ms) => { timers.push({ f, ms, live: true }); return timers.length - 1; }, clrT = h => { if (timers[h]) timers[h].live = false; };
const never = new Promise(() => {});
let why = null;
const p1 = W.deadline(never, 5000, 'farm replay', setT, clrT).catch(e => { why = e.message; });
timers[0].f(); await p1;
if (!why || !/farm replay: no answer in 5 s/.test(why)) bad(`deadline: never-answering load gave ${why}`);
const v = await W.deadline(Promise.resolve(7), 5000, 'x', setT, clrT);
if (v !== 7) bad('deadline: answering load lost its value');
if (timers[1].live) bad('deadline: timer kept after the load answered');

/* 二軍 replay with the engine CDN blocked */
const list = JSON.parse(readFileSync(path.join(ROOT, 'league/site/farm_games.json'), 'utf8'));
const fid = list[0].id;
const thrown = await farmOpening(list, fid, async () => { throw new TypeError('Failed to fetch dynamically imported module'); });
if (thrown.status !== 'unavailable' || thrown.opening !== null) bad(`blocked CDN (import throws): status ${thrown.status}, want unavailable and no opening`);
const SHORT = 50, t0 = Date.now();
let gaveUp = false;
try { await W.deadline(farmOpening(list, fid, () => never), SHORT, 'farm replay'); } catch (e) { gaveUp = /no answer/.test(e.message); }
if (!gaveUp) bad('blocked CDN (never answers): the farm load was not given up');
if (Date.now() - t0 > SHORT + 1000) bad(`blocked CDN (never answers): gave up after ${Date.now() - t0} ms, want about ${SHORT}`);

/* arm(): the entry card line */
const el = () => ({ hidden: true, textContent: '', onclick: null });
const span = el(), btn = el(), stall = { hidden: true, firstElementChild: span, lastElementChild: btn };
const doc = { getElementById: id => id === 'bootStall' ? stall : null };
const run = (t, failed) => { stall.hidden = true; span.textContent = ''; const q = []; const B = { t, failed }; W.arm(B, doc, (f, ms) => q.push([f, ms]), () => {}); if (q.length !== 1 || q[0][1] !== W.STALL_MS) bad('arm: one timer of STALL_MS expected'); q[0][0](); return B; };
const B1 = run({ three: 1, tsl: 1, fx: 1, engine: 1 });
if (stall.hidden || !span.textContent.includes('比賽紀錄')) bad(`arm: stall after engine must name 比賽紀錄, got "${span.textContent}" hidden=${stall.hidden}`);
if (B1.t.stall !== 'opening') bad('arm: BOOT.t.stall must name the stage for the 🐞 report');
if (typeof btn.onclick !== 'function') bad('arm: 重試 has no action');
run({ ...all });
if (!stall.hidden) bad('arm: shown although the entry button woke');
run({ three: 1 }, true);
if (!stall.hidden) bad('arm: shown over a boot failure (fail() owns that line)');
W.hide(doc);

if (W.STALL_MS > 20000) bad(`STALL_MS ${W.STALL_MS} > 20000 (#668)`);
if (!(W.OPTIONAL_MS < W.STALL_MS)) bad('OPTIONAL_MS must end before the stall line shows');

if (problems.length) { console.error('bootwait: FAIL\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`bootwait: ok (stall line at ${W.STALL_MS / 1000} s, replay give-up at ${W.OPTIONAL_MS / 1000} s, farm ${fid} blocked -> ${thrown.status})`);
