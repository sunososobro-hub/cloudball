/* Static site check (plain Node): every local file the page, the modules and the stylesheets
 * refer to exists, every script parses, and the workflow folder holds only the two allowed files.
 * It also runs tests/names.check.mjs (league name rules), tests/staff.check.mjs (league staff
 * rules), tests/bios.check.mjs (player bio rules), tests/ratings.check.mjs (1 to 100 display
 * ratings), tests/freeagents.check.mjs (created free agents) and tests/leaguesite.check.mjs (site data, #336) and tests/training.check.mjs (training model, #369) and tests/defence.check.mjs (fielder def, #378) and tests/pitchmix.check.mjs (pitch list, #378), tests/players_load.check.mjs and tests/render_load.check.mjs (render modules load, #293) as child processes, so CI covers them.
 * Usage: node tests/replay/static.mjs */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const problems = [], seen = new Set(), queue = ['index.html', 'play.html', 'render/players_test.html', 'guide.html', 'agent.html', 'baseball9.html'];
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
/* #162: in every page the import map comes before the first modulepreload, preload and module script (a module linked
 * before the map exists fails on its bare "three/..." imports and stays failed for the real import) */
for (const f of ['play.html', 'render/players_test.html']) {
  const src = readFileSync(path.join(ROOT, f), 'utf8'), at = re => { const m = src.search(re); return m < 0 ? Infinity : m; };
  const map = at(/<script\s+type=["']importmap["']/), first = Math.min(at(/<link[^>]*rel=["'](?:modulepreload|preload)["']/), at(/<script\s+type=["']module["']/));
  if (first < Infinity && !(map < first)) problems.push(`${f}: the import map must come before every modulepreload, preload and module script`);
}
/* #366 (from #364): play.html adds its modulepreloads from an inline script that runs after the import map; a static
 * <link rel="modulepreload"> is fetched by Firefox's preload scanner before the map exists, and the map is then dropped */
{
  const src = readFileSync(path.join(ROOT, 'play.html'), 'utf8').replace(/<!--[\s\S]*?-->/g, m => ' '.repeat(m.length)), at = re => { const m = src.search(re); return m < 0 ? Infinity : m; };
  if (at(/<link[^>]*rel=["']modulepreload["']/) < Infinity) problems.push('play.html: a static <link rel="modulepreload"> is not allowed (add it to the injector script list, #364)');
  const inj = at(/<script(?![^>]*\b(?:src|type)=)[^>]*>[^<]*modulepreload/), map = at(/<script\s+type=["']importmap["']/);
  if (inj === Infinity) problems.push('play.html: the modulepreload injector script is missing (#364)');
  else if (!(map < inj)) problems.push('play.html: the modulepreload injector script must come after the import map (#364)');
}
const wf = path.join(ROOT, '.github/workflows');
if (existsSync(wf)) for (const f of readdirSync(wf)) if (!['ci.yml', 'merge-gate.yml'].includes(f)) problems.push(`.github/workflows/${f} is not allowed (only ci.yml and merge-gate.yml)`);
const rules = readFileSync(path.join(ROOT, '.agent/rules.md'), 'utf8').split('\n').length - 1;
if (rules > 50) problems.push(`.agent/rules.md has ${rules} lines (cap is 50)`);
if (readFileSync(path.join(ROOT, 'CLAUDE.md'), 'utf8').trimEnd().split('\n').length !== 3) problems.push('CLAUDE.md must be exactly 3 lines');
for (const check of ['tests/names.check.mjs', 'tests/dugout_lite.check.mjs', 'tests/ondeck_lite.check.mjs', 'tests/staff.check.mjs', 'tests/bios.check.mjs', 'tests/ratings.check.mjs', 'tests/freeagents.check.mjs', 'tests/opening.check.mjs', 'tests/site.check.mjs', 'tests/agent.check.mjs', 'tests/agentpage.check.mjs', 'tests/leaguesite.check.mjs', 'tests/training.check.mjs', 'tests/defence.check.mjs', 'tests/baseball9.check.mjs', 'tests/barcurve.check.mjs', 'tests/roof_rule.check.mjs', 'tests/compact_cover.check.mjs', 'tests/pitchmix.check.mjs', 'tests/landhint.check.mjs', 'tests/players_load.check.mjs', 'tests/render_load.check.mjs', 'tests/grade.check.mjs']) {
  const res = spawnSync(process.execPath, [path.join(ROOT, check)], { encoding: 'utf8' });
  process.stdout.write(res.stdout || ''); process.stderr.write(res.stderr || '');
  if (res.status !== 0) problems.push(`${check} failed (exit ${res.status === null ? 'killed by ' + res.signal : res.status})`);
}

console.log(`${seen.size} files reachable from the page checked`);
if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: no missing files, all scripts parse.');
