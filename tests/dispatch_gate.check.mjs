/* dispatch_gate.sh (#582), fixture-driven: a fake `gh` answers from a JSON fixture, no network.
 * level 0 -> no output; 0 ready -> no output; 3 ready -> 3 FIRE lines; a green clean PR older than 60 min
 * -> reviewer FIRE; 3 rejections -> ALERT. Usage: node tests/dispatch_gate.check.mjs */
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = mkdtempSync(path.join(tmpdir(), 'dispatch-'));
const NOW = 1800000000;
const iso = s => new Date(s * 1000).toISOString().replace('.000Z', 'Z');
const triggers = path.join(dir, 'triggers.json');
writeFileSync(triggers, JSON.stringify({ A: 'trig_a', B: 'trig_b', C: 'trig_c', reviewer: 'trig_r' }));
const fake = path.join(dir, 'gh');
writeFileSync(fake, `#!/usr/bin/env node
const fx = JSON.parse(require('fs').readFileSync(process.env.FIXTURE, 'utf8'));
const a = process.argv.slice(2);
const url = a.find(x => /^(repos|search)\\//.test(x)).split('?')[0];
if (url === 'search/issues') {
  const q = a.filter((x, i) => a[i - 1] === '-f' && x.startsWith('q=')).join('');
  const opus = q.includes('label:model:opus') && !q.includes('-label:model:opus');
  console.log(JSON.stringify({ total_count: opus ? fx.opus : fx.sonnet }));
} else if (url in fx.routes) console.log(JSON.stringify(fx.routes[url]));
else { console.error('no fixture for ' + url); process.exit(1); }
`);
chmodSync(fake, 0o755);

const R = 'sunososobro-hub/cloudball';
const base = (level, sonnet, opus, extra = {}) => ({
  sonnet, opus,
  routes: {
    [`repos/${R}/issues/275`]: { body: `level: ${level}\nfocus:` },
    [`repos/${R}/pulls`]: [],
    ...extra,
  },
});
function run(name, fx, want) {
  const f = path.join(dir, name + '.json');
  writeFileSync(f, JSON.stringify(fx));
  const r = spawnSync('bash', [path.join(ROOT, 'scripts/dispatch_gate.sh')], {
    env: { ...process.env, GH: fake, FIXTURE: f, NOW: String(NOW), TRIGGERS: triggers }, encoding: 'utf8' });
  const got = r.stdout.trim().split('\n').filter(Boolean).sort();
  if (r.status !== 0 || JSON.stringify(got) !== JSON.stringify([...want].sort())) {
    console.error(`FAILED ${name}: want ${JSON.stringify(want)} got ${JSON.stringify(got)} exit ${r.status}\n${r.stderr}`);
    process.exit(1);
  }
}
run('level0', base(0, 5, 1), []);
run('none', base(2, 0, 0), []);
run('three', base(2, 3, 0), ['FIRE trig_a', 'FIRE trig_b', 'FIRE trig_c']);
run('one', base(2, 1, 0), ['FIRE trig_a']);
run('opus-first', base(2, 0, 1), ['FIRE trig_c']);
run('cap', base(3, 9, 2), ['FIRE trig_a', 'FIRE trig_b', 'FIRE trig_c']);

const pr = { number: 7, head: { sha: 'abc', ref: 'fix/9' } };
const pulls = { [`repos/${R}/pulls`]: [pr] };
const checks = t => ({ [`repos/${R}/commits/abc/check-runs`]: { check_runs: ['test', 'gate'].map(name => ({ name, conclusion: 'success', completed_at: iso(NOW - t) })) } });
const prRoutes = (t, state, comments = []) => ({ ...pulls, ...checks(t), [`repos/${R}/pulls/7`]: { mergeable_state: state },
  [`repos/${R}/issues/7/comments`]: comments, [`repos/${R}/issues/9/comments`]: [] });
run('pr-old', base(2, 0, 0, prRoutes(3601, 'clean')), ['FIRE trig_r']);
run('pr-young', base(2, 0, 0, prRoutes(3000, 'clean')), []);
run('pr-dirty', base(2, 0, 0, prRoutes(9000, 'dirty')), []);
const rej = ['Opus review: CHANGES abc\nfix', 'requeue: red test PR #7', 'Opus review: CHANGES abc\nagain'].map(body => ({ body }));
run('alert', base(2, 0, 0, prRoutes(100, 'blocked', rej)), ['ALERT 7']);
console.log('dispatch_gate checks passed');
