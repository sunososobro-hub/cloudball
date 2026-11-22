/* Guards of the frozen pre-season game (league/preseason/opening.json, recorded by league/tools/record.mjs).
 * - the file matches its own hash and its own header (seed, engine, crew, both coaching staffs);
 * - the file matches FROZEN below: re-recording is a deliberate remaster that edits this pin in the same PR
 *   (state "remaster" in the PR title), never a side effect of regenerating;
 * - while the engine still carries the recorded ENGINE_VERSION, simulating the seed again against the frozen rosters of that day
 *   (league/preseason/rosters-opening.js, so a redraw of league/players.js (#169) does not touch the recording) gives the same game;
 * - the codec round-trips (Infinity survives) and the loader refuses a different format.
 * Usage: node tests/opening.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, ENGINE_VERSION } from '../engine/index.js';
import { TEAMS } from '../league/teams.js';
import { OPENING_ROSTERS } from '../league/preseason/rosters-opening.js';
import { staffOf, crewFor } from '../league/staff.js';
import { RECORDING_FORMAT, INF_TAG, encodeGame, decodeGame, parseRecording } from '../league/recording.js';
import { sha256 } from '../league/tools/record.mjs';

/* The pin. Change it only when the owner asked for a remaster of the first game. */
export const FROZEN = { seed: 704, engine: '0.4.1', hash: 'sha256:5f58e731a60992d2b00d791003b0fbfa331181ed3a91ccacf9062689aa2c3a34' };

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const text = readFileSync(path.join(ROOT, 'league/preseason/opening.json'), 'utf8');
let rec = null;
try { rec = parseRecording(text); } catch (e) { bad(`opening.json is not valid JSON: ${e.message}`); }
if (!rec) bad('opening.json is not a recording this page understands (format, game.ev, game.stream)');
else {
  const g = rec.game;
  if (rec.format !== RECORDING_FORMAT) bad(`format ${rec.format}, expected ${RECORDING_FORMAT}`);
  if (rec.hash !== `sha256:${sha256(encodeGame(g))}`) bad('opening.json does not match its own hash: it was edited by hand or re-encoded');
  if (rec.hash !== FROZEN.hash || rec.seed !== FROZEN.seed || rec.engine !== FROZEN.engine)
    bad(`opening.json (seed ${rec.seed}, engine ${rec.engine}, ${rec.hash}) differs from FROZEN in tests/opening.check.mjs: a re-recording is a remaster, update the pin on purpose`);
  if (g.seed !== rec.seed || g.engine !== rec.engine) bad('header seed/engine differ from the game inside');
  if (JSON.stringify(rec.decisions) !== '{}') bad('the frozen game is recorded with no fan decisions');
  if (JSON.stringify(g.teams.map(i => TEAMS[i].id)) !== JSON.stringify(rec.teams)) bad('header teams differ from the game');
  /* The crew and staffs are a snapshot of the day: they must at least be real people from the league files. */
  const pos = ['plate', 'first', 'second', 'third'];
  if (JSON.stringify(Object.keys(rec.crew)) !== JSON.stringify(pos)) bad('crew must hold plate, first, second, third');
  const ids = crewFor(rec.seed);
  for (const p of pos) if (!rec.crew[p] || rec.crew[p].id !== ids[p]) bad(`crew ${p} is not crewFor(${rec.seed}).${p}`);
  for (const id of rec.teams) { const s = rec.staff[id]; if (!Array.isArray(s) || s.length !== staffOf(id).length || s.some(x => x.team !== id)) bad(`staff of ${id} is missing or wrong`); }
  /* Same engine version as recorded: the seed still simulates to the very same game. A different version is fine (the recording is the point). */
  if (ENGINE_VERSION === rec.engine) {
    if (encodeGame(simGame(rec.seed, {}, { rosters: OPENING_ROSTERS })) !== encodeGame(g)) bad(`engine ${ENGINE_VERSION} no longer reproduces seed ${rec.seed}: the engine changed behaviour without a version bump`);
  } else console.log(`note: engine is ${ENGINE_VERSION}, recording is ${rec.engine} (frozen on purpose)`);
}
const inf = decodeGame(encodeGame({ a: [1, { ts: Infinity }] }));
if (inf.a[1].ts !== Infinity) bad('codec lost an Infinity');
if (encodeGame({ x: Infinity }).indexOf(INF_TAG) < 0) bad('codec does not tag Infinity');
try { encodeGame({ x: NaN }); bad('codec accepted NaN'); } catch (e) { /* expected */ }
if (parseRecording(JSON.stringify({ format: RECORDING_FORMAT + 1, game: { ev: [], stream: [] } })) !== null) bad('loader accepted another format');

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: frozen game seed ${rec.seed}, engine ${rec.engine}, ${rec.game.ev.length} frames, hash matches the pin.`);
