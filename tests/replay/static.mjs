/* Static site check (plain Node): every local file the page, the modules and the stylesheets
 * refer to exists, every script parses, and the workflow folder holds only the two allowed files.
 * It also runs tests/names.check.mjs (league name rules) and tests/staff.check.mjs (league staff
 * rules) as child processes, so CI covers them.
 * Usage: node tests/replay/static.mjs */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const problems = [], seen = new Set(), queue = ['index.html', 'render/players_test.html'];
const isLocal = ref => ref && !/^(https?:|data:|blob:|#|three($|\/))/.test(ref);
const refsOf = (file, src) => {
  const out = [], dir = path.dirname(file), push = (ref, base = dir) => { if (isLocal(ref)) out.push(path.normalize(path.join(base, ref.split(/[?#]/)[0]))); };
  for (const m of src.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)|\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g)) push(m[1] || m[2] || m[3]);
  if (file.endsWith('.html')) {
    for (const m of src.matchAll(/\b(?:src|href)\s*=\s*['"]([^'"]+)['"]/g)) push(m[1]);
    for (const m of src.matchAll(/\bload\(\s*['"]([^'"]+)['"]\s*\)/g)) push(m[1], '.');
  }
  for (const m of src.matchAll(/new URL\(\s*['"]([^'"]+)['"]\s*,\s*here\s*\)/g)) push(m[1]);
  return out;
};
while (queue.length) {
  const file = queue.pop(); if (seen.has(file)) continue; seen.add(file);
  const abs = path.join(ROOT, file);
  if (!existsSync(abs)) { problems.push(`missing file: ${file}`); continue; }
  if (statSync(abs).isDirectory() || !/\.(html|js|mjs)$/.test(file)) continue;
  const src = readFileSync(abs, 'utf8');
  if (/\.m?js$/.test(file)) { try { execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' }); } catch (e) { problems.push(`syntax error in ${file}: ${String(e.stderr).split('\n').slice(0, 4).join(' ')}`); } }
  for (const ref of refsOf(file, src)) queue.push(ref);
}
/* files the scripts load by name at run time */
for (const f of ['assets/players.b64.txt', 'commentary/lines.json', 'commentary/scripts/index.json', 'league/preseason/opening.json', ...['grass', 'dirt', 'concrete', 'leather'].flatMap(n => ['c', 'n', 'orm'].map(s => `assets/tex/${n}_${s}.jpg`)), 'assets/tex/fabric_n.jpg', 'assets/tex/fabric_orm.jpg'])
  if (!existsSync(path.join(ROOT, f))) problems.push(`missing file: ${f}`);
for (const f of ['commentary/lines.json', 'commentary/scripts/index.json']) { try { JSON.parse(readFileSync(path.join(ROOT, f), 'utf8')); } catch (e) { problems.push(`${f} is not valid JSON`); } }
const wf = path.join(ROOT, '.github/workflows');
if (existsSync(wf)) for (const f of readdirSync(wf)) if (!['ci.yml', 'merge-gate.yml'].includes(f)) problems.push(`.github/workflows/${f} is not allowed (only ci.yml and merge-gate.yml)`);
const rules = readFileSync(path.join(ROOT, '.agent/rules.md'), 'utf8').split('\n').length - 1;
if (rules > 50) problems.push(`.agent/rules.md has ${rules} lines (cap is 50)`);
if (readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').trimEnd().split('\n').length !== 3) problems.push('CLAUDE.md must be exactly 3 lines');
for (const check of ['tests/names.check.mjs', 'tests/staff.check.mjs', 'tests/opening.check.mjs', 'tests/site.check.mjs']) {
  const res = spawnSync(process.execPath, [path.join(ROOT, check)], { encoding: 'utf8' });
  process.stdout.write(res.stdout || ''); process.stderr.write(res.stderr || '');
  if (res.status !== 0) problems.push(`${check} failed (exit ${res.status === null ? 'killed by ' + res.signal : res.status})`);
}

console.log(`${seen.size} files reachable from the page checked`);
if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: no missing files, all scripts parse.');
