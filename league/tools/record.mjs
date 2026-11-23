/* Records the frozen pre-season game: the full simGame() result of the default pairing with no fan decisions,
 * stored as its event stream so the viewer plays it instead of re-simulating (any engine change moves every stream).
 *
 *   node league/tools/record.mjs <seed>            print what would be recorded (no file is written)
 *   node league/tools/record.mjs <seed> --write    write league/preseason/opening.json (first recording only)
 *   node league/tools/record.mjs <seed> --write --remaster   replace an existing recording: a deliberate act,
 *                                                   state it in the PR title and update FROZEN in tests/opening.check.mjs
 *
 * Tool only: it imports the engine, which the league data files themselves never do.
 * The record also keeps the umpire crew of crewFor(seed) and both teams' coaching staff as they were on the day. */
import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, ENGINE_VERSION } from '../../engine/index.js';
import { TEAMS } from '../teams.js';
import { staffOf, umpire, crewFor } from '../staff.js';
import { RECORDING_FORMAT, encodeGame, decodeGame } from '../recording.js';

export const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../preseason/opening.json');
export const sha256 = text => createHash('sha256').update(text).digest('hex');

export function buildRecording(seed) {
  const game = simGame(seed, {});
  const text = encodeGame(game);
  const back = decodeGame(text);
  /* The loader must hand the renderer the same numbers it would get from a live simulation. */
  const same = (a, b) => a === b || (a && b && typeof a === 'object' && typeof b === 'object'
    && [...new Set([...Object.keys(a), ...Object.keys(b)])].every(k => same(a[k], b[k])));
  if (!same(game, back)) throw new Error('recording does not decode to the simulated game');
  const crew = crewFor(seed);
  const teamIds = game.teams.map(i => TEAMS[i].id);
  return {
    head: {
      format: RECORDING_FORMAT,
      note: 'Frozen pre-season game. Never edit by hand: tools/record.mjs writes it, tests/opening.check.mjs guards it.',
      seed, engine: ENGINE_VERSION, decisions: {}, teams: teamIds,
      hash: `sha256:${sha256(text)}`,
      crew: Object.fromEntries(Object.entries(crew).map(([pos, id]) => [pos, umpire(id)])),
      staff: Object.fromEntries(teamIds.map(id => [id, staffOf(id)])),
    },
    gameText: text,
  };
}

export const serialize = ({ head, gameText }) =>
  '{\n' + Object.entries(head).map(([k, v]) => `"${k}":${JSON.stringify(v)},\n`).join('') + `"game":${gameText}\n}\n`;

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [seedArg, ...flags] = process.argv.slice(2);
  const seed = Number(seedArg);
  if (!Number.isInteger(seed) || seed < 0) { console.error('usage: node league/tools/record.mjs <seed> [--write [--remaster]]'); process.exit(2); }
  const rec = buildRecording(seed), out = serialize(rec);
  console.log(`seed ${seed}, engine ${ENGINE_VERSION}, ${rec.head.hash}, ${(out.length / 1024).toFixed(0)} KB, crew ${Object.values(rec.head.crew).map(u => u.id).join(' ')}`);
  if (!flags.includes('--write')) process.exit(0);
  if (existsSync(OUT) && !flags.includes('--remaster')) { console.error('opening.json already exists: re-recording is a remaster, pass --remaster on purpose'); process.exit(1); }
  writeFileSync(OUT, out);
  console.log(`wrote ${path.relative(process.cwd(), OUT)}`);
}
