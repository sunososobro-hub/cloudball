/* merge-gate workflow check (plain Node, #472). Runs the github-script body of .github/workflows/merge-gate.yml
 * against fake PRs and fails unless it publishes the expected "merge-gate" status:
 *   - green for an owner PR touching nothing protected, or only engine/ while PRESEASON;
 *   - red for .agent/, .github/ or tests/replay/run.mjs without an owner `Opus review: PASS <head sha>`,
 *     green with one (a PASS for another sha or by someone else does not count);
 *   - red for an outside PR (fork head or other author), a linked issue with needs-owner / status:frozen,
 *     an open `needs owner` / `blocking` comment; green once a later owner PASS resolved it.
 * static.mjs runs this file. Usage: node tests/merge_gate.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const yml = readFileSync(path.join(ROOT, '.github/workflows/merge-gate.yml'), 'utf8').split('\n');
const start = yml.findIndex(l => /^\s*script: \|\s*$/.test(l));
if (start < 0) { console.error('merge-gate check: no `script: |` block'); process.exit(1); }
const body = [];
const indent = yml[start + 1].match(/^\s*/)[0];
for (const l of yml.slice(start + 1)) { if (l.trim() && !l.startsWith(indent)) break; body.push(l.slice(indent.length)); }
const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
const gate = new AsyncFunction('github', 'context', 'core', body.join('\n'));

const OWNER = 'sunososobro-hub', REPO = 'cloudball', SHA = 'a'.repeat(40), OLD = 'b'.repeat(40);
const own = { login: OWNER }, other = { login: 'someone' };
async function run({ files = ['ui/x.js'], body = 'Closes #1', comments = [], issues = {}, head = `${OWNER}/${REPO}`, author = OWNER }) {
  let status = null;
  const github = {
    rest: {
      pulls: {
        get: async () => ({ data: { head: { sha: SHA, repo: head ? { full_name: head } : null }, user: { login: author }, body } }),
        listFiles: 'files',
      },
      issues: {
        listComments: 'comments',
        get: async ({ issue_number }) => { if (!issues[issue_number]) throw new Error('404'); return { data: { labels: issues[issue_number].map(name => ({ name })) } }; },
      },
      repos: { createCommitStatus: async s => { status = s; } },
    },
    paginate: async which => which === 'files' ? files.map(filename => ({ filename })) : comments,
  };
  const context = { repo: { owner: OWNER, repo: REPO }, eventName: 'pull_request', payload: { pull_request: { number: 9 } } };
  const core = { info() {}, warning() {}, setFailed() {} };
  await gate(github, context, core);
  return status;
}

const c = (user, text) => ({ user, body: text });
const cases = [
  ['plain owner PR', {}, 'success'],
  ['engine/ only, pre-season', { files: ['engine/game.js'] }, 'success'],
  ['.agent/ without PASS', { files: ['.agent/rules.md'] }, 'failure'],
  ['.github/ without PASS', { files: ['.github/workflows/ci.yml'] }, 'failure'],
  ['run.mjs without PASS', { files: ['tests/replay/run.mjs'] }, 'failure'],
  ['engine/ + .agent/ without PASS', { files: ['engine/game.js', '.agent/rules.md'] }, 'failure'],
  ['.agent/ with owner PASS', { files: ['.agent/rules.md'], comments: [c(own, `Opus review: PASS ${SHA}`)] }, 'success'],
  ['.agent/ with PASS for old sha', { files: ['.agent/rules.md'], comments: [c(own, `Opus review: PASS ${OLD}`)] }, 'failure'],
  ['.agent/ with PASS by someone else', { files: ['.agent/rules.md'], comments: [c(other, `Opus review: PASS ${SHA}`)] }, 'failure'],
  ['fork head', { head: 'someone/cloudball' }, 'failure'],
  ['deleted head repo', { head: null }, 'failure'],
  ['other author', { author: 'someone' }, 'failure'],
  ['linked issue needs-owner', { body: 'Refs #5', issues: { 5: ['needs-owner'] } }, 'failure'],
  ['linked issue frozen', { body: 'closes #6', issues: { 6: ['status:frozen', 'P2'] } }, 'failure'],
  ['linked issue fine', { body: 'Closes #7', issues: { 7: ['status:review'] } }, 'success'],
  ['open needs owner comment', { comments: [c(other, 'needs owner: which name?')] }, 'failure'],
  ['open blocking comment', { comments: [c(own, 'Blocking: breaks replay')] }, 'failure'],
  ['blocking resolved by later owner PASS', { comments: [c(other, 'blocking: x'), c(own, `Opus review: PASS ${SHA}`)] }, 'success'],
  ['PASS before blocking does not resolve it', { comments: [c(own, `Opus review: PASS ${SHA}`), c(other, 'blocking: x')] }, 'failure'],
  ['word inside a sentence is not a stop', { comments: [c(other, 'This is not blocking anything.')] }, 'success'],
];
const problems = [];
for (const [name, input, want] of cases) {
  const s = await run(input);
  if (!s || s.context !== 'merge-gate' || s.sha !== SHA) problems.push(`${name}: no merge-gate status on the head`);
  else if (s.state !== want) problems.push(`${name}: ${s.state}, want ${want} (${s.description})`);
}
if (problems.length) { console.error(`merge-gate check: ${problems.length} problem(s)\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`merge-gate check: ${cases.length} cases ok`);
