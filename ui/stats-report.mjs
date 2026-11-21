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
const [counts, leaves, innings] = await Promise.all([
  sql(`SELECT blob1 AS site, blob2 AS ev, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} GROUP BY site, ev`),
  sql(`SELECT blob1 AS site, blob3 AS id, max(double2) AS w FROM ${DATASET} WHERE ${since} AND blob2 = 'leave' GROUP BY site, id LIMIT 100000`),
  sql(`SELECT blob1 AS site, double1 AS inn, count(DISTINCT blob3) AS n FROM ${DATASET} WHERE ${since} AND blob2 = 'inning' GROUP BY site, inn ORDER BY inn LIMIT 1000`),
]);
const median = a => { if (!a.length) return 0; a.sort((x, y) => x - y); const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const sites = [...new Set([...counts, ...innings].map(r => r.site))].sort();
if (!sites.length) console.log(`No data in the last ${days} day(s). A binding added in the dashboard only takes effect after a redeploy.`);
for (const site of sites) {
  const c = ev => Number(counts.find(r => r.site === site && r.ev === ev)?.n || 0);
  const watched = leaves.filter(r => r.site === site && Number(r.w) > 0).map(r => Number(r.w));
  console.log(`\n== ${site}, last ${days} day(s) ==`);
  const rows = [['visits', c('view')], ['pressed enter', c('enter')], ['sound on', c('sound_on')], ['fast-forwarded', c('fast_forward')], ['reached game end', c('game_end')], ['median seconds watched (after enter)', Math.round(median(watched))]];
  for (const [k, v] of rows) console.log(k.padEnd(40), String(v).padStart(7));
  const inn = innings.filter(r => r.site === site);
  if (inn.length) { console.log('\ninning'.padEnd(41), 'viewers'.padStart(7)); for (const r of inn) console.log(`  ${r.inn}`.padEnd(40), String(r.n).padStart(7)); }
}
