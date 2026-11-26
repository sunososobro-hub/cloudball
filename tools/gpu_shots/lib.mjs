/* Real-GPU shots mailbox (#444), pure part: no file system, no network, no browser.
 * The PC script (later part) feeds it REST answers and file lists; tests/gpu_shots.check.mjs runs it on fixtures.
 *   scrub(text, ctx)         remove user name, computer name, local paths, IPs, tokens and keys from log / manifest text
 *   leaks(text, ctx)         what scrub() would remove (empty list = clean)
 *   devTipOk(commit, checks) the dev tip was merged by the owner account and its `test` check is green
 *   keepRuns(names, keep)    run folders (gpu/<UTC timestamp>/) to delete, keeping the newest `keep`
 *   underCap(files, cap)     total bytes of one run stay under the cap
 *   manifestProblems(m)      shape of gpu/<run>/manifest.json
 *   requestProblems(req)     strict schema of requests/<id>.json (data, never a command)
 *   requestRunnable(...)     owner-authored on main, no foreign open PR on requests/, not done, not older than 24 h */

export const OWNER = 'sunososobro-hub';
export const SHOTS_REPO = 'sunososobro-hub/cloudball-shots';
export const KEEP_RUNS = 7;
export const RUN_CAP_BYTES = 20 * 1024 * 1024;
export const REQUEST_MAX_AGE_MS = 24 * 60 * 60 * 1000;
export const MAX_SHOTS_PER_REQUEST = 12;
/* whitelists: pages of this repo, camera acts (render/tools/studio_shot.py), quality tiers */
export const PAGES = ['play.html', 'agent.html', 'baseball9.html'];
export const ACTS = { 'play.html': ['broadcast', 'tag', 'batter'], 'agent.html': ['front', 'back'], 'baseball9.html': ['default'] };
export const TIERS = ['max', 'high', 'low'];
export const JOBS = ['shots', 'probe', 'ping'];
const ID_RE = /^[a-z0-9][a-z0-9-]{2,39}$/;
const RUN_RE = /^\d{8}T\d{6}Z$/;

const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const PATTERNS = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g],
  ['token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{20,})\b/g],
  ['bearer', /\b(?:Bearer|token)\s+[A-Za-z0-9._~+/=-]{16,}/gi],
  ['windows path', /\b[A-Za-z]:[\\/][^\s"'<>|*?]*/g],
  ['unc path', /\\\\[^\s"'<>|]+/g],
  ['unix home path', /(?:\/home|\/Users|\/root)\b[^\s"'<>]*/g],
  ['file url', /file:\/\/\/?[^\s"'<>]+/gi],
  ['ipv4', /\b(?!127\.0\.0\.1\b)(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}\b/g],
  ['ipv6', /\b(?:[0-9a-f]{1,4}:){4,7}[0-9a-f]{1,4}\b|\bfe80::[0-9a-f:]+/gi],
  ['email', /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g],
];
/* ctx: { user, host, extra: [...] } from os.userInfo() / os.hostname(); short or empty values are ignored */
const ctxPatterns = ctx => [['user', ctx?.user], ['host', ctx?.host], ...(ctx?.extra || []).map(v => ['secret', v])]
  .filter(([, v]) => typeof v === 'string' && v.trim().length >= 2)
  .map(([k, v]) => [k, new RegExp(`(?<![A-Za-z0-9])${esc(v.trim())}(?![A-Za-z0-9])`, 'gi')]);

export function leaks(text, ctx = {}) {
  const s = String(text), out = [];
  for (const [kind, re] of [...ctxPatterns(ctx), ...PATTERNS]) { re.lastIndex = 0; if (re.test(s)) out.push(kind); }
  return out;
}
export function scrub(text, ctx = {}) {
  let s = String(text);
  for (const [kind, re] of [...PATTERNS, ...ctxPatterns(ctx)]) s = s.replace(re, `<${kind}>`);
  return s;
}

/* commit: GET repos/{R}/commits/{sha}; checks: GET repos/{R}/commits/{sha}/check-runs (the .check_runs array) */
export function devTipOk(commit, checks) {
  if (!commit || !commit.sha) return { ok: false, why: 'no dev tip' };
  if ((commit.parents || []).length < 2) return { ok: false, why: 'dev tip is not a merge commit' };
  const author = commit.author?.login, committer = commit.committer?.login;
  if (author !== OWNER) return { ok: false, why: `dev tip merged by ${author || 'unknown'}, not the owner` };
  if (committer !== OWNER && committer !== 'web-flow') return { ok: false, why: `dev tip committed by ${committer || 'unknown'}` };
  const runs = (checks || []).filter(c => c.name === 'test' && c.head_sha === commit.sha);
  if (!runs.length) return { ok: false, why: 'no test check on the dev tip' };
  const last = runs.reduce((a, b) => (String(a.started_at) > String(b.started_at) ? a : b));
  if (last.status !== 'completed' || last.conclusion !== 'success') return { ok: false, why: `test check is ${last.conclusion || last.status}` };
  return { ok: true, why: '' };
}

export function keepRuns(names, keep = KEEP_RUNS) {
  const runs = names.filter(n => RUN_RE.test(n)).sort();
  return runs.slice(0, Math.max(0, runs.length - keep));
}
export function underCap(files, cap = RUN_CAP_BYTES) {
  const total = files.reduce((t, f) => t + (Number(f.bytes) || 0), 0);
  return { ok: total <= cap, total };
}

const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
const extra = (o, allowed) => Object.keys(o).filter(k => !allowed.includes(k));
export function manifestProblems(m) {
  const p = [];
  if (!isObj(m)) return ['manifest is not an object'];
  for (const k of extra(m, ['run', 'commit', 'tier', 'adapter', 'frames', 'console_errors', 'boot', 'job', 'request'])) p.push(`unknown field ${k}`);
  if (!RUN_RE.test(m.run || '')) p.push('run must be a UTC timestamp like 20261126T051500Z');
  if (!/^[0-9a-f]{40}$/.test(m.commit || '')) p.push('commit must be a full sha');
  if (!TIERS.includes(m.tier)) p.push('tier not in the whitelist');
  if (!isObj(m.adapter) || typeof m.adapter.vendor !== 'string' || typeof m.adapter.architecture !== 'string') p.push('adapter needs vendor and architecture');
  if (!Array.isArray(m.frames)) p.push('frames must be a list');
  else for (const f of m.frames) {
    if (!isObj(f) || !/^[a-z0-9_-]+\.png$/.test(f.file || '') || !PAGES.includes(f.page) || !(ACTS[f.page] || []).includes(f.act) || !(Number(f.ms) >= 0)) { p.push(`bad frame ${JSON.stringify(f)}`); break; }
  }
  if (!Array.isArray(m.console_errors) || m.console_errors.some(e => typeof e !== 'string')) p.push('console_errors must be a list of strings');
  if (m.boot !== undefined && (!isObj(m.boot) || Object.values(m.boot).some(v => typeof v !== 'number'))) p.push('boot must map names to numbers (BOOT.t)');
  return p;
}

export function requestProblems(req) {
  const p = [];
  if (!isObj(req)) return ['request is not an object'];
  if (!JOBS.includes(req.job)) return [`unknown job ${JSON.stringify(req.job)}`];
  const allowed = { shots: ['id', 'job', 'created', 'shots'], probe: ['id', 'job', 'created', 'tier'], ping: ['id', 'job', 'created'] }[req.job];
  for (const k of extra(req, allowed)) p.push(`unknown field ${k}`);
  if (!ID_RE.test(req.id || '')) p.push('id must be 3-40 of a-z 0-9 -');
  if (typeof req.created !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d(:\d\d)?Z$/.test(req.created)) p.push('created must be an ISO UTC time');
  if (req.job === 'probe' && req.tier !== undefined && !TIERS.includes(req.tier)) p.push('tier not in the whitelist');
  if (req.job === 'shots') {
    if (!Array.isArray(req.shots) || !req.shots.length || req.shots.length > MAX_SHOTS_PER_REQUEST) p.push(`shots must be a list of 1-${MAX_SHOTS_PER_REQUEST}`);
    else for (const s of req.shots) {
      if (!isObj(s) || extra(s, ['page', 'act', 'tier']).length || !PAGES.includes(s.page) || !(ACTS[s.page] || []).includes(s.act) || !TIERS.includes(s.tier)) { p.push(`bad shot ${JSON.stringify(s)}`); break; }
    }
  }
  return p;
}

/* commit: last commit touching requests/<id>.json on cloudball-shots main (GET .../commits?path=...&sha=main, [0]);
 * pulls: GET .../pulls?state=open, each with .files (names) filled in; done: ids that have results/<id>/ */
export function requestRunnable(req, commit, pulls, done, now = Date.now()) {
  const bad = requestProblems(req);
  if (bad.length) return { ok: false, why: bad[0] };
  if (done.includes(req.id)) return { ok: false, why: 'already done' };
  if (commit?.author?.login !== OWNER) return { ok: false, why: 'request not authored by the owner account' };
  const foreign = (pulls || []).filter(pr => pr.user?.login !== OWNER && (pr.files || []).some(f => f.startsWith('requests/')));
  if (foreign.length) return { ok: false, why: `open pull request #${foreign[0].number} from someone else touches requests/` };
  const t = Date.parse(req.created);
  if (!(now - t <= REQUEST_MAX_AGE_MS) || t > now + 5 * 60 * 1000) return { ok: false, why: 'request older than 24 h or in the future' };
  return { ok: true, why: '' };
}
