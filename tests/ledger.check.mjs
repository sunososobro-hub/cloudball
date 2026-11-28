/* Ledger reader (league/ledger.js, #589). Fails when
 *   - a 3-record fixture does not give 3 records in id order, or takes more than 4 requests (N+1),
 *   - a record without engine.commit or seed is accepted, or is rejected without a named reason,
 *   - league/ledger.js uses Math.random or Date.
 * Usage: node tests/ledger.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';
import { listGames, ledgerUrl, rejectReason } from '../league/ledger.js';

const rec = n => ({ seed: 100 + n, engine: { commit: 'abc' + n }, decisions: [] });
const make = store => {
  const calls = [];
  return { calls, fetchJson: async url => { calls.push(url); return store[url] ?? null; } };
};

const store = { [ledgerUrl(2026, 1)]: rec(1), [ledgerUrl(2026, 2)]: rec(2), [ledgerUrl(2026, 3)]: rec(3) };
const a = make(store);
const out = await listGames(a.fetchJson, 2026);
assert.deepEqual(out.games.map(g => g.id), [1, 2, 3], 'ids in order');
assert.equal(out.games[1].record.seed, 102);
assert.equal(out.rejected.length, 0);
assert.equal(a.calls.length, 4, 'N+1 requests');
assert.equal(a.calls[3], ledgerUrl(2026, 4), 'stops at the first 404');

const empty = make({});
assert.deepEqual(await listGames(empty.fetchJson, 2026), { games: [], rejected: [] });
assert.equal(empty.calls.length, 1);

const noCommit = { seed: 5, engine: {} }, noSeed = { engine: { commit: 'x' } };
assert.match(rejectReason(noCommit), /engine\.commit/);
assert.match(rejectReason(noSeed), /seed/);
assert.ok(rejectReason(null));
assert.equal(rejectReason(rec(1)), null);
const b = make({ [ledgerUrl(2026, 1)]: rec(1), [ledgerUrl(2026, 2)]: noCommit, [ledgerUrl(2026, 3)]: noSeed, [ledgerUrl(2026, 4)]: rec(4) });
const o2 = await listGames(b.fetchJson, 2026);
assert.deepEqual(o2.games.map(g => g.id), [1, 4]);
assert.deepEqual(o2.rejected.map(r => r.id), [2, 3]);
assert.ok(o2.rejected.every(r => r.reason));

const src = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../league/ledger.js'), 'utf8');
assert.ok(!/Math\.random|Date/.test(src.replace(/\/\*[\s\S]*?\*\//, '')), 'no clock or Math.random');
console.log('ledger.check: ok');
