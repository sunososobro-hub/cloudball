/* Temperament check (#379 part 1). Runs league/temper.js and the create path; fails when
 *   - a factory player has no temperament from TEMPERS, or the same id reads two different ones,
 *   - the factory league is missing a temperament or one share is off TEMPER_SHARE by more than SHARE_TOL points,
 *   - TEMPER_SHARE does not add to 100 or does not match TEMPERS,
 *   - a create choice with a valid `temper` is refused, an invalid one accepted, or makePlayer does not store it,
 *   - choosing a temperament changes any other field of the made player or his ratings (no effect on ability, no draw),
 *   - an engine file other than engine/sim/game.js imports league/temper.js (#379 part 3: only the grudge record reads it).
 * static.mjs runs this file. Usage: node tests/temper.check.mjs */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { TEMPERS, TEMPER_SHARE, temperOf, temperOfId, idHash } from '../league/temper.js';
import { ROSTERS } from '../league/players.js';
import { validateCreate, makePlayer } from '../league/freeagents.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHARE_TOL = 15, ID_SAMPLES = 20000, ID_TOL = 1.5;
const problems = [], bad = m => problems.push(m);

if (TEMPER_SHARE.length !== TEMPERS.length) bad('TEMPER_SHARE length differs from TEMPERS');
if (TEMPER_SHARE.reduce((s, x) => s + x, 0) !== 100) bad('TEMPER_SHARE does not add to 100');
if (idHash('abc') !== idHash('abc') || idHash('abc') === idHash('abd')) bad('idHash is not a stable hash');

/* factory players */
const all = ROSTERS.flatMap(t => [...t.bat, ...t.pit, ...(t.bench || [])]);
const count = Object.fromEntries(TEMPERS.map(t => [t, 0]));
for (const p of all) {
  const t = temperOf(p);
  if (!TEMPERS.includes(t)) { bad(`${p.id} has no temperament (${t})`); continue; }
  if (temperOf({ ...p }) !== t || temperOfId(p.id) !== t) bad(`${p.id} reads two temperaments`);
  count[t]++;
}
TEMPERS.forEach((t, i) => {
  const pct = 100 * count[t] / all.length;
  if (!count[t]) bad(`no factory player is ${t}`);
  if (Math.abs(pct - TEMPER_SHARE[i]) > SHARE_TOL) bad(`${t} is ${pct.toFixed(1)}% of the factory players, TEMPER_SHARE says ${TEMPER_SHARE[i]}`);
});
/* the bucket follows TEMPER_SHARE on many ids */
const big = Object.fromEntries(TEMPERS.map(t => [t, 0]));
for (let i = 0; i < ID_SAMPLES; i++) big[temperOfId(`fa-${i.toString(36)}`)]++;
TEMPERS.forEach((t, i) => { const pct = 100 * big[t] / ID_SAMPLES; if (Math.abs(pct - TEMPER_SHARE[i]) > ID_TOL) bad(`${t} is ${pct.toFixed(2)}% of ${ID_SAMPLES} ids, TEMPER_SHARE says ${TEMPER_SHARE[i]}`); });
/* a stored temperament wins, an invalid stored one falls back */
if (temperOf({ id: 'x', temper: '溫和' }) !== '溫和') bad('a stored temperament is not used');
if (temperOf({ id: 'x', temper: 'angry' }) !== temperOfId('x')) bad('an invalid stored temperament does not fall back to the id default');

/* create path */
const look = { head: 3, skin: 2, hair: 5 };
const BAT = { kind: 'bat', pos: 'SS', bats: 'L', build: 'slim', look, points: { con: 70, pow: 40, eye: 65, spd: 70, arm: 60 }, nameDraw: 0 };
const PIT = { kind: 'pit', role: 'SP', throws: 'R', build: 'power', look, points: { stuff: 66, ctrl: 62, arm: 55 } };
for (const base of [BAT, PIT]) {
  for (const t of TEMPERS) {
    const c = { ...base, temper: t }, w = validateCreate(c);
    if (w.length) { bad(`${base.kind} with temper ${t} refused: ${w.join('; ')}`); continue; }
    for (const seed of [1, 77, 4242]) {
      const a = makePlayer(seed, base), b = makePlayer(seed, c);
      if (b.player.temper !== t || temperOf(b.player) !== t) bad(`${base.kind} seed ${seed}: chosen ${t} not stored`);
      const { temper, ...rest } = b.player;
      if (JSON.stringify(rest) !== JSON.stringify(a.player)) bad(`${base.kind} seed ${seed}: choosing ${t} changed other fields`);
      if (JSON.stringify(b.ratings) !== JSON.stringify(a.ratings)) bad(`${base.kind} seed ${seed}: choosing ${t} changed ratings`);
    }
  }
  for (const t of ['angry', '', 1, null]) if (!validateCreate({ ...base, temper: t }).length) bad(`${base.kind} with temper ${JSON.stringify(t)} accepted`);
  if ('temper' in makePlayer(5, base).player) bad(`${base.kind}: temper stored although none was chosen`);
}

/* only the game sim imports it (#379 part 3, the grudge record) */
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
for (const f of walk(path.join(ROOT, 'engine')).filter(f => f.endsWith('.js'))) if (path.relative(ROOT, f).split(path.sep).join('/') !== 'engine/sim/game.js' && /temper\.js/.test(readFileSync(f, 'utf8'))) bad(`${path.relative(ROOT, f)} imports league/temper.js`);

if (problems.length) { console.error('temper.check FAIL\n- ' + problems.join('\n- ')); process.exit(1); }
console.log(`temper.check ok: ${all.length} factory players ${TEMPERS.map(t => `${t} ${count[t]}`).join(', ')}; chosen tempers stored, nothing else moves`);
