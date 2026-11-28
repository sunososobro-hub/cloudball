/* Branch-name check of scripts/claim_branch.sh (#852). Runs the script with a base sha that does not exist, so no
 * branch is ever pushed: a refused name exits 2 before git is touched, an accepted name gets past the name check
 * and fails later (any exit other than 2).
 * Fails when
 *   - fix/N, fix/N-rK, feat/N, claim/N-<sha7> or the deploy stamp fix/N-s<12 digits> is refused;
 *   - a name outside those forms (dev, main, a stamp with 11 or 13 digits, a stamp on claim/, extra suffix) is accepted.
 * Usage: node tests/claim_branch.check.mjs */
import { spawnSync } from 'node:child_process';
const problems = [], bad = m => problems.push(m);
const BAD_BASE = '0000000000000000000000000000000000000000';
const exit = branch => spawnSync('bash', ['scripts/claim_branch.sh', branch, BAD_BASE, '817', 'check'], { encoding: 'utf8' }).status;
for (const b of ['fix/817', 'fix/817-r2', 'feat/12', 'claim/817-0a1b2c3', 'fix/817-s202611281200'])
  if (exit(b) === 2) bad(`${b} refused, should pass the name check`);
for (const b of ['dev', 'main', 'fix/817-s20261128120', 'fix/817-s2026112812000', 'fix/817-sabc', 'claim/817-s202611281200', 'feat/817-s202611281200', 'fix/817-s202611281200x', 'fix/x'])
  if (exit(b) !== 2) bad(`${b} accepted, should be refused (exit 2)`);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('claim_branch name check ok');
