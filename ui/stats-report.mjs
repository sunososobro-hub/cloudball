#!/usr/bin/env node
/* Prints the anonymous viewing table (#89): visits, entered, sound on, median seconds watched, viewers per inning.
 *   CF_ACCOUNT_ID=... CF_API_TOKEN=... node ui/stats-report.mjs [days=7]
 * The token only needs the "Account Analytics: Read" permission. Reads three queries from the free Analytics Engine SQL API.
 * Columns are the ones functions/api/v.js writes. Plain Node 18+, no dependencies. */
const { CF_ACCOUNT_ID: acct, CF_API_TOKEN: token } = process.env;
const days = Math.max(1, Math.min(90, parseInt(process.argv[2], 10) || 7));
const DATASET = 'cloudball_views';
if (!acct || !token) { console.error('Set CF_ACCOUNT_ID and CF_API_TOKEN first (see the PR body for where to find them).'); process.exit(1); }

const sql = async q => {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${acct}/analytics_engine/sql`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: q + ' FORMAT JSON' });
  const t = await r.text(); if (!r.ok) throw new Error(`SQL API ${r.status}: ${t.slice(0, 300)}`);
  return JSON.parse(t).data || [];
};
const since = `timestamp > NOW() - INTERVAL '${days}' DAY`;
const [counts, leaves, innings, sums, visits] = await Promise.all([
  sql(`SELECT blob1 AS site, blob2 AS ev, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} GROUP BY site, ev`),
  sql(`SELECT blob1 AS site, blob3 AS id, max(double2) AS w FROM ${DATASET} WHERE ${since} AND blob2 IN ('leave', 'summary') GROUP BY site, id LIMIT 100000`),
  sql(`SELECT blob1 AS site, double1 AS inn, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} AND blob2 = 'inning' GROUP BY site, inn ORDER BY inn LIMIT 1000`),
  /* #805: the one 'summary' row per visit that entered: last inning reached by playing, game end, sound, top speed */
  sql(`SELECT blob1 AS site, double1 AS inn, double4 AS ge, double5 AS snd, double6 AS spd, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} AND blob2 = 'summary' GROUP BY site, inn, ge, snd, spd LIMIT 100000`),
  /* a visit is a page load: old clients sent 'view' at load, new ones send 'view' only when they leave before entering, else 'enter' */
  sql(`SELECT blob1 AS site, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} AND blob2 IN ('view', 'enter') GROUP BY site`),
]);
const median = a => { if (!a.length) return 0; a.sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const sites = [...new Set([...counts, ...innings, ...sums].map(r => r.site))].sort();
if (!sites.length) console.log(`No data in the last ${days} day(s). A binding added in the dashboard only takes effect after a redeploy.`);
for (const site of sites) {
  const c = ev => Number(counts.find(r => r.site === site && r.ev === ev)?.n || 0);
  const sm = f => sums.filter(r => r.site === site).reduce((a, r) => a + (f(r) ? Number(r.n) : 0), 0);   /* summary visits matching f */
  const watched = leaves.filter(r => r.site === site && Number(r.w) > 0).map(r => Number(r.w));
  console.log(`\n== ${site}, last ${days} day(s) ==`);
  const rows = [['visits', Number(visits.find(r => r.site === site)?.n || 0)], ['pressed enter', c('enter')], ['sound on', c('sound_on') + sm(r => +r.snd)], ['fast-forwarded', c('fast_forward') + sm(r => +r.spd > 1)], ['reached game end', c('game_end') + sm(r => +r.ge)], ['median seconds watched (after enter)', Math.round(median(watched))]];
  for (const [k, v] of rows) console.log(k.padEnd(40), String(v).padStart(7));
  /* old rows: one per inning reached; new summary rows: the last inning reached counts for every inning up to it */
  const byInn = new Map(innings.filter(r => r.site === site).map(r => [+r.inn, Number(r.n)]));
  for (const r of sums.filter(r => r.site === site)) for (let i = 1; i <= +r.inn; i++) byInn.set(i, (byInn.get(i) || 0) + Number(r.n));
  const inn = [...byInn].sort((a, b) => a[0] - b[0]).map(([inn, n]) => ({ inn, n }));
  if (inn.length) { console.log('\ninning'.padEnd(41), 'viewers'.padStart(7)); for (const r of inn) console.log(`  ${r.inn}`.padEnd(40), String(r.n).padStart(7)); }
}
