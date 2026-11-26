/* Real-GPU shots mailbox, pure part (#444, plain Node). tools/gpu_shots/lib.mjs is run on fixture data, not read:
 *   - scrub() removes user name, computer name, Windows / UNC / home paths, file URLs, IPs, e-mails, tokens and private
 *     keys; leaks() on the scrubbed text is empty; page text and the local 127.0.0.1 server URL survive
 *   - devTipOk(): owner merge commit with a green `test` check passes; another author, a red / running / missing
 *     check or a non-merge tip stops
 *   - keepRuns() keeps the newest 7 run folders; underCap() holds the 20 MB cap
 *   - manifestProblems() accepts a full manifest and refuses unknown fields and bad frames
 *   - requestProblems() / requestRunnable(): the three jobs pass; unknown job, extra field, a path or a URL, a non-owner
 *     commit, a foreign open PR on requests/, a done id or a request older than 24 h are refused
 * static.mjs runs this file. The browser part needs a real GPU and is not run in CI. Usage: node tests/gpu_shots.check.mjs */
import { scrub, leaks, devTipOk, keepRuns, underCap, manifestProblems, requestProblems, requestRunnable, OWNER, KEEP_RUNS, RUN_CAP_BYTES } from '../tools/gpu_shots/lib.mjs';

const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };
const ctx = { user: 'alice', host: 'DESKTOP-7Q2K9ZB', extra: ['s3cr3t-value'] };

/* scrub */
const dirty = [
  'run by alice on DESKTOP-7Q2K9ZB',
  'chrome at C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'profile C:/Users/Alice/AppData/Local/Temp/gpu-shots-1',
  'share \\\\NAS\\pics\\x.png',
  'log /home/alice/.cache/x and /Users/al/x',
  'opened file:///C:/x/y.html',
  'lan 192.168.1.23 and fe80::1c2d:3e4f:5a6b',
  'mail alice@example.com',
  'token ghp_abcdefghijklmnopqrstuvwxyz0123 and github_pat_11ABCDEFG0123456789_abcdefghij',
  'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
  '-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAA\n-----END OPENSSH PRIVATE KEY-----',
  'value s3cr3t-value here',
];
for (const d of dirty) {
  if (!leaks(d, ctx).length) bad(`leaks() missed: ${d}`);
  const s = scrub(d, ctx);
  if (leaks(s, ctx).length) bad(`scrub() left ${leaks(s, ctx).join(',')} in: ${s}`);
  for (const w of ['alice', 'Alice', 'DESKTOP-7Q2K9ZB', '192.168', 'ghp_', 'PRIVATE KEY', 's3cr3t', 'example.com']) if (s.includes(w)) bad(`scrub() kept "${w}": ${s}`);
}
const clean = 'GET http://127.0.0.1:8123/play.html?q=max frame 3 took 16.7 ms; WebGPU nvidia ampere; BOOT.t three=120';
if (scrub(clean, ctx) !== clean) bad(`scrub() changed clean text: ${scrub(clean, ctx)}`);
if (leaks(clean, ctx).length) bad(`leaks() flagged clean text: ${leaks(clean, ctx)}`);
if (scrub('console error', { user: 'so' }) !== 'console error') bad('a short user name must only match a whole word');
const t0 = Date.now(); scrub('C:' + '\\a'.repeat(5000) + ' /home' + '/b'.repeat(5000), ctx);
if (Date.now() - t0 > 500) bad('scrub() is slow on long paths (backtracking)');

/* dev tip */
const SHA = 'a'.repeat(40);
const tip = (o = {}) => ({ sha: SHA, parents: [{}, {}], author: { login: OWNER }, committer: { login: 'web-flow' }, ...o });
const run = (o = {}) => ({ name: 'test', head_sha: SHA, status: 'completed', conclusion: 'success', started_at: '2026-11-26T05:00:00Z', ...o });
if (!devTipOk(tip(), [run()]).ok) bad('owner merge with green test must pass');
if (!devTipOk(tip({ committer: { login: OWNER } }), [run()]).ok) bad('owner as committer must pass');
for (const [why, c, r] of [
  ['other author', tip({ author: { login: 'mallory' } }), [run()]],
  ['no author', tip({ author: null }), [run()]],
  ['other committer', tip({ committer: { login: 'mallory' } }), [run()]],
  ['not a merge', tip({ parents: [{}] }), [run()]],
  ['red test', tip(), [run({ conclusion: 'failure' })]],
  ['running test', tip(), [run({ status: 'in_progress', conclusion: null })]],
  ['no test', tip(), [run({ name: 'gate' })]],
  ['test on other sha', tip(), [run({ head_sha: 'b'.repeat(40) })]],
  ['newer rerun red', tip(), [run(), run({ conclusion: 'failure', started_at: '2026-11-26T06:00:00Z' })]],
  ['no tip', null, []],
]) { const v = devTipOk(c, r); if (v.ok || !v.why) bad(`devTipOk must stop on ${why}`); }

/* retention and cap */
const names = Array.from({ length: 10 }, (_, i) => `202611${String(10 + i)}T051500Z`).reverse().concat(['latest', 'README.md']);
const del = keepRuns(names);
if (del.length !== 10 - KEEP_RUNS || del.some(n => n > '20261112T051500Z') || del.includes('latest')) bad(`keepRuns wrong: ${del}`);
if (keepRuns(names.slice(0, 3)).length) bad('keepRuns must keep everything under 7 runs');
if (!underCap([{ bytes: RUN_CAP_BYTES }]).ok || underCap([{ bytes: RUN_CAP_BYTES }, { bytes: 1 }]).ok) bad('underCap must hold 20 MB');

/* manifest */
const man = { run: '20261126T051500Z', commit: SHA, tier: 'max', adapter: { vendor: 'nvidia', architecture: 'ampere' },
  frames: [{ file: 'play-broadcast.png', page: 'play.html', act: 'broadcast', ms: 16.6 }, { file: 'agent-back.png', page: 'agent.html', act: 'back', ms: 9 }],
  console_errors: [], boot: { three: 120, first_frame: 840 } };
if (manifestProblems(man).length) bad(`good manifest refused: ${manifestProblems(man)}`);
for (const [why, m] of [['extra field', { ...man, user: 'x' }], ['short sha', { ...man, commit: 'abc' }], ['bad tier', { ...man, tier: 'ultra' }],
  ['no adapter', { ...man, adapter: {} }], ['frame path', { ...man, frames: [{ ...man.frames[0], file: '../x.png' }] }],
  ['frame act', { ...man, frames: [{ ...man.frames[0], act: 'front' }] }], ['boot text', { ...man, boot: { three: 'slow' } }]])
  if (!manifestProblems(m).length) bad(`manifest with ${why} must be refused`);

/* requests */
const NOW = Date.parse('2026-11-26T06:00:00Z'), created = '2026-11-26T05:50:00Z';
const good = [
  { id: 'r-430-runners', job: 'shots', created, shots: [{ page: 'play.html', act: 'tag', tier: 'max' }, { page: 'agent.html', act: 'front', tier: 'max' }] },
  { id: 'probe-236', job: 'probe', created, tier: 'max' },
  { id: 'ping-1', job: 'ping', created },
];
for (const r of good) if (requestProblems(r).length) bad(`good ${r.job} request refused: ${requestProblems(r)}`);
const shots0 = good[0];
for (const [why, r] of [
  ['unknown job', { id: 'x-1', job: 'shell', created }],
  ['extra field', { ...good[2], cmd: 'rm -rf /' }],
  ['path in id', { ...good[2], id: '../etc' }],
  ['url page', { ...shots0, shots: [{ page: 'https://evil.example/x.html', act: 'tag', tier: 'max' }] }],
  ['path page', { ...shots0, shots: [{ page: '../../secret.html', act: 'tag', tier: 'max' }] }],
  ['unknown act', { ...shots0, shots: [{ page: 'play.html', act: 'front', tier: 'max' }] }],
  ['extra shot field', { ...shots0, shots: [{ page: 'play.html', act: 'tag', tier: 'max', url: 'http://x' }] }],
  ['empty shots', { ...shots0, shots: [] }],
  ['bad created', { ...good[2], created: 'yesterday' }],
  ['not an object', 'ping'],
]) if (!requestProblems(r).length) bad(`request with ${why} must be refused`);
const ownerCommit = { author: { login: OWNER } };
if (!requestRunnable(good[0], ownerCommit, [], [], NOW).ok) bad('owner request must run');
if (!requestRunnable(good[0], ownerCommit, [{ number: 5, user: { login: OWNER }, files: ['requests/x.json'] }], [], NOW).ok) bad('an owner PR on requests/ must not block');
for (const [why, args] of [
  ['non-owner commit', [good[0], { author: { login: 'mallory' } }, [], []]],
  ['no commit', [good[0], null, [], []]],
  ['foreign open PR', [good[0], ownerCommit, [{ number: 9, user: { login: 'mallory' }, files: ['requests/evil.json'] }], []]],
  ['done', [good[0], ownerCommit, [], ['r-430-runners']]],
  ['older than 24 h', [{ ...good[2], created: '2026-11-25T05:00:00Z' }, ownerCommit, [], []]],
  ['bad schema', [{ ...good[2], job: 'exec' }, ownerCommit, [], []]],
]) { const v = requestRunnable(...args, NOW); if (v.ok || !v.why) bad(`requestRunnable must refuse ${why}`); }

if (problems.length) { console.log('gpu_shots check FAILED:\n  ' + problems.join('\n  ')); process.exit(1); }
console.log(`gpu_shots check passed (${dirty.length} leak cases, dev-tip gate, retention, manifest, request schema)`);
