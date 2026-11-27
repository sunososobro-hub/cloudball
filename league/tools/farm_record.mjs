/* Writes 二軍 game records (#600 part 1) into league/site/farm_games.json.
 *
 *   node league/tools/farm_record.mjs <seed> [--day N] [--teams a,b] [--commit <sha>] [--write]
 *
 * Prints the record and its size; with --write it appends it as the next `f-<n>` (nothing is overwritten).
 * `--commit` defaults to the git HEAD of the checkout: the record replays with the engine of that commit, so it must be
 * a commit the CDN serves (pushed) and the engine files must match it. Tool only: it imports the engine. */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { simGame, boxFromStream, ENGINE_VERSION } from '../../engine/index.js';
import { farmRecord, recordBytes } from '../farm.js';

export const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../site/farm_games.json');
export const serialize = list => '[\n' + list.map(r => '  ' + JSON.stringify(r)).join(',\n') + '\n]\n';

export function build({ seed, day = 0, teams = [0, 1], commit, id }) {
  const g = simGame(seed, {}, { teams });
  const b = boxFromStream(g.stream);
  return farmRecord({ id, day, seed, commit, version: ENGINE_VERSION, teams, score: b.score, line: b.line });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), seed = Number(args[0]);
  const opt = n => { const i = args.indexOf(n); return i < 0 ? undefined : args[i + 1]; };
  if (!Number.isInteger(seed) || seed < 0) { console.error('usage: node league/tools/farm_record.mjs <seed> [--day N] [--teams a,b] [--commit sha] [--write]'); process.exit(2); }
  const list = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : [];
  const next = list.reduce((m, r) => Math.max(m, Number(String(r.id).slice(2)) || 0), 0) + 1;
  const commit = opt('--commit') || execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const teams = opt('--teams') ? opt('--teams').split(',').map(Number) : [0, 1];
  const rec = build({ seed, day: Number(opt('--day') || 0), teams, commit, id: `f-${next}` });
  console.log(JSON.stringify(rec), `\n${recordBytes(rec)} bytes`);
  if (args.includes('--write')) { list.push(rec); writeFileSync(OUT, serialize(list)); console.log(`wrote ${rec.id} to ${path.relative(process.cwd(), OUT)}`); }
}
