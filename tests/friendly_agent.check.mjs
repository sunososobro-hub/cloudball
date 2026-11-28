/* 友誼賽 link with the own player's 經紀人 set (#795 part 8, league/friendly_agent.js, the 試試看 link). Fails when
 *   - a set does not round-trip through `t=` digits (bat and pit), or a malformed / over-pool / wrong-length `t` parses;
 *   - a neutral set (or no own player, or a set of the other kind) adds `t=` to a link or reaches the engine;
 *   - a game with a non-neutral `t` is not the same byte for byte on a second play, or is the same as the game without it
 *     (the engine must read it), or a neutral set changes the game;
 *   - the 試試看 link of the 經紀人 box does not carry the draft, or the pinned engine (league/engine_pin.js) predates opts.agents;
 *   - league/friendly_agent.js uses a clock, randomness, the network, storage or the ledger.
 * Usage: node tests/friendly_agent.check.mjs */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as engine from '../engine/index.js';
import * as A from '../league/agentset.js';
import { agentParam, parseAgent, ownKind, friendlyAgents, withAgent } from '../league/friendly_agent.js';
import { friendlyShare, friendlyOpening, friendlyParam, parseOwn } from '../league/friendly.js';
import { ownRosters } from '../league/friendly_own.js';
import { ENGINE_PIN } from '../league/engine_pin.js';
import { tryLink } from '../ui/agentset-box.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bad = [], fail = m => bad.push(m);

/* a batter who swings early everywhere and never steals; a pitcher who lives on the edges and never picks off (both within the pool) */
const batSet = A.freezeSet({ v: 1, kind: 'bat', rows: { normal: { swing_early: 4, steal: 0, bunt: 2 } } });
const pitSet = A.freezeSet({ v: 1, kind: 'pit', rows: { normal: { fastball: 2, edges: 4, pickoff: 0 } } });
for (const set of [batSet, pitSet, A.defaultSet('bat'), A.freezeSet({ v: 1, kind: 'bat', rows: { two_outs: { bunt: 0 }, late_close: { steal: 3 } } })]) {
  if (A.validateSet(set).length) { fail(`test set invalid: ${A.validateSet(set)}`); continue; }
  const t = agentParam(set), back = parseAgent(t, set.kind);
  if (t.length !== A.SITUATIONS[set.kind].length * A.FREQS[set.kind].length) fail(`${t}: wrong length`);
  if (JSON.stringify(back) !== JSON.stringify(A.freezeSet(set))) fail(`${set.kind} ${t}: does not round-trip`);
}
for (const t of ['', '4'.repeat(12), '2'.repeat(11), '2'.repeat(13), '22222222222x', '5' + '1'.repeat(11), '-1' + '2'.repeat(10), null, undefined, 222222222222])
  if (parseAgent(t, 'bat')) fail(`bad t ${JSON.stringify(t)} parses`);
if (parseAgent('2'.repeat(12), 'two')) fail('unknown kind parses');

const batter = parseOwn('0.3.60.55.50.40.45.R.24.17.試打者'), pitcher = parseOwn('1.2.60.55.50.R.26.41.試投手');
if (!batter || !pitcher) fail('test own players do not parse');
if (ownKind(batter) !== 'bat' || ownKind(pitcher) !== 'pit') fail('ownKind');
if (friendlyAgents(batter, A.defaultSet('bat')) || friendlyAgents(null, batSet) || friendlyAgents(batter, pitSet) || friendlyAgents(pitcher, batSet)) fail('neutral / no own / other kind reaches opts.agents');
const fa = friendlyAgents(batter, batSet);
if (!fa || JSON.stringify(Object.keys(fa)) !== JSON.stringify([batter.name])) fail('opts.agents is not keyed by the own player name');

const play = (a, own, set) => {
  const x = friendlyParam(a), r = friendlyOpening(x, engine, own ? ownRosters(own, a, engine.ROSTERS) : undefined, friendlyAgents(own, set));
  if (r.status !== 'ok') { fail(`${x}: ${r.status} ${r.reason}`); return ''; }
  return JSON.stringify(r.opening.game.stream);
};
for (const [own, set, a0] of [[batter, batSet, { away: 0, home: 1, sp: [0, 0] }], [pitcher, pitSet, { away: 2, home: 3, sp: [0, 2] }]]) {
  let differ = 0;
  for (let seed = 1; seed <= 6; seed++) {
    const a = { ...a0, seed, own }, plain = play(a, own, null), withSet = play(a, own, set);
    if (withSet !== play(a, own, set)) fail(`${own.name} seed ${seed}: two plays with t differ`);
    if (play(a, own, A.defaultSet(set.kind)) !== plain) fail(`${own.name} seed ${seed}: a neutral set changes the game`);
    if (withSet !== plain) differ++;
  }
  if (!differ) fail(`${own.name}: the set never changes a game in 6 seeds (the engine does not read it)`);
  const a = { ...a0, seed: 9, own }, link = friendlyShare(a, ENGINE_PIN.commit);
  const tl = withAgent(link, own, set), q = new URLSearchParams(tl.split('?')[1]);
  if (!tl.startsWith(link) || JSON.stringify(parseAgent(q.get('t'), ownKind(parseOwn(q.get('o'))))) !== JSON.stringify(set)) fail(`${own.name}: share link does not carry the set`);
  if (withAgent(link, own, A.defaultSet(set.kind)) !== link || withAgent(link, undefined, set) !== link) fail('a neutral set or no own player adds t=');
}

if (tryLink(batSet) !== `friendly.html?t=${agentParam(batSet)}`) fail(`試試看 link ${tryLink(batSet)}`);
const [M, m] = ENGINE_PIN.version.split('.').slice(1).map(Number);
if (M < 4 || (M === 4 && m < 37)) fail(`engine pin ${ENGINE_PIN.version} predates opts.agents (refresh: node league/tools/engine_pin.mjs --write)`);
const src = readFileSync(path.join(ROOT, 'league/friendly_agent.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
if (/Math\.random|Date\b|fetch\(|XMLHttpRequest|ledger|localStorage|document\./.test(src)) fail('league/friendly_agent.js uses a clock, randomness, the network, storage, the DOM or the ledger');
const play_html = readFileSync(path.join(ROOT, 'play.html'), 'utf8');
if (!/q\.get\('t'\)/.test(play_html) || !play_html.includes('friendlyAgents(own,ag)')) fail('play.html does not read t=');

if (bad.length) { console.error(bad.join('\n')); process.exit(1); }
console.log('friendly_agent.check: ok (t= round-trips, neutral is plain, the set changes games byte-stably)');
