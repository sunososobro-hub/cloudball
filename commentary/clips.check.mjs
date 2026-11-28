/* Name-free clip bank checks (#603 part 1), plain Node: node commentary/clips.check.mjs
 *   - the browser-safe clip id equals tools/line-id.mjs (node:crypto)
 *   - validateBank (v2) rejects name slots and {desc}, accepts closed-set slots
 *   - a v2 draft: text = the spoken words, clips = ids of its parts, same seed + stream = same clip ids,
 *     the stream is untouched (rule 10), a prefix drafts to the prefix of the full draft (rule 15),
 *     every drafted clip id is in the bank's clip list (bankClips), a missing clip never changes a pick
 *   - the real bank (lines.json) is still valid in whatever version it is */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { simGame, TEAMS } from '../engine/index.js';
import { draftFromBank, validateBank } from './player.js';
import { bankClips } from './clips.js';
import { lineId as nodeLineId } from './tools/line-id.mjs';
import { lineId, EMOTION_TONE } from './clip-id.js';

const DIR = path.dirname(fileURLToPath(import.meta.url)), SEEDS = Number(process.env.SEEDS || 50);
const problems = [], bad = m => { if (problems.length < 30) problems.push(m); };

for (const text of ['', '三振！', '好'.repeat(300)]) for (const speaker of ['pbp', 'color', 'fan'])
  for (const emotion of Object.keys(EMOTION_TONE)) if (lineId({ speaker, text, emotion }, 'owls') !== nodeLineId({ speaker, text, emotion }, 'owls')) bad(`clip id differs from tools/line-id.mjs for ${speaker}/${emotion}/${text.length}`);

/* a small v2 bank that uses every voiced slot the booth can fill now ({bases} has its own check below) */
const bank = {
  version: 2, rules: { minGapSec: 0, noRepeatWindow: 3, fanChance: 1, fanGapSec: 0, fanNoRepeatWindow: 3, fanOwnShare: 0, fanMaxUses: 50 },
  guests: Object.fromEntries(TEAMS.map(t => [t.id, { name: 'x', nick: 'y', cast: 'fan' }])),
  triggers: {
    game_start: { priority: 2, silence: 0, exchanges: [{ call: ['各位球迷晚安，今晚', '{team}', '對', '{fieldTeam}', '。'], response: '大家晚安。' }] },
    batter_up: { silence: 0, exchanges: [{ call: '{half}{inning}局，{outs}人出局，{count}。', response: '看他怎麼配球。' }, { call: '下一位打者上場。' }] },
    strikeout: { silence: 0, exchanges: [{ call: '三振！', response: '{pitchType}，漂亮。', alt: ['那球是{pitchType}。'] }] },
    groundout: { silence: 0, exchanges: [{ call: '滾地球給{pos}，出局。' }] },
    run_scores: { silence: 0, exchanges: [{ call: '得{n:runs}分，{team}領先或追平。' }, { call: '{leadTeam}{n:margin}分領先。', response: '比賽還沒完。' }] },
    half_end: { silence: 0, exchanges: [{ call: '這半局{n:halfRuns}分。' }] },
  },
  fan: [{ on: ['strikeout', 'groundout', 'half_end'], side: 'any', lines: [['pbp', '來了。'], ['fan', '加油，{team}！']] }],
};
for (const e of validateBank(bank)) bad(`fixture bank: ${e}`);
const forbidden = ['{batter}', '{pitcher}', '{runner}', '{manager}', '{pitchingCoach}', '{homeManager}', '{managerName}', '{plateUmp}', '{plateUmpLine}', '{desc}', '{guest}', '{pitchCount}', '{n:pitchCount}', '{bases:x}', '{n:batter}'];
for (const f of forbidden) {
  const b = { version: 2, triggers: { strikeout: { exchanges: [{ call: `好球${f}。` }] } } };
  if (!validateBank(b).length) bad(`v2 validateBank accepted ${f}`);
}
if (validateBank({ version: 2, triggers: { strikeout: { exchanges: [{ call: '三振', response: '好', alt: ['{inning}局'] }] } } }).length === 0) bad('alt wording with other slots than its response was accepted');

const clips = bankClips(bank);
let said = 0, clipsSeen = new Set(), withClips = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = simGame(seed, {}), before = JSON.stringify(g.stream), teams = g.teams.map(i => TEAMS[i]), describe = x => g.ev[x.f].desc;
  const draft = () => draftFromBank(g.stream, bank, { seed, teams, describe }), a = draft(), b = draft();
  if (JSON.stringify(g.stream) !== before) bad(`seed ${seed}: drafting changed the stream`);
  if (JSON.stringify(a.map(l => l.clips)) !== JSON.stringify(b.map(l => l.clips))) bad(`seed ${seed}: clip ids are not deterministic`);
  for (const l of a) {
    said++;
    if (!l.clips || !l.clips.length) { bad(`seed ${seed}: line without clips: ${l.text}`); continue; }
    withClips++;
    for (const id of l.clips) { clipsSeen.add(id); if (!clips.has(id)) bad(`seed ${seed}: clip ${id} of "${l.text}" is not in the bank's clip list`); }
    if (l.clips.map(id => clips.get(id) && clips.get(id).text).join('') !== l.text) bad(`seed ${seed}: text "${l.text}" is not the spoken words of its clips`);
    if (/\{[\w:]+\}/.test(l.text)) bad(`seed ${seed}: unfilled slot in "${l.text}"`);
  }
  for (const cut of [Math.floor(g.stream.length / 3), Math.floor(g.stream.length * 0.8)]) {
    const part = draftFromBank(g.stream.slice(0, cut + 1), bank, { seed, teams, describe }).map(l => l.clips.join(','));
    if (part.join('|') !== a.filter(l => l.at <= cut).map(l => l.clips.join(',')).join('|')) bad(`seed ${seed}: clips before event ${cut} depend on later events`);
  }
}
/* {bases} (#603): the spoken state on every first pitch equals the engine's own bases before that frame, and all 8 states turn up */
const baseBank = { version: 2, rules: { ...bank.rules, noRepeatWindow: 1 }, guests: bank.guests, triggers: { batter_up: { silence: 0, exchanges: [{ call: '{bases}。' }, { call: '{bases}。' }] } }, fan: [] };   /* two copies: an exchange is not picked again right after itself */
for (const e of validateBank(baseBank)) bad(`bases bank: ${e}`);
const NAME = ['壘上無人', '一壘有人', '二壘有人', '三壘有人', '一二壘有人', '一三壘有人', '二三壘有人', '滿壘'], seenState = new Set();
let baseLines = 0;
for (let seed = 1; seed <= SEEDS; seed++) {
  const g = simGame(seed, {}), teams = g.teams.map(i => TEAMS[i]);
  for (const l of draftFromBank(g.stream, baseBank, { seed, teams, describe: x => g.ev[x.f].desc })) {
    const b = g.ev[g.stream[l.at].f].s0.b.map(Boolean), want = NAME[[0, 1, 2, 4, 3, 5, 6, 7][(b[0] ? 1 : 0) | (b[1] ? 2 : 0) | (b[2] ? 4 : 0)]];
    baseLines++; seenState.add(want);
    if (l.text !== `${want}。`) bad(`seed ${seed} event ${l.at}: said "${l.text}", engine bases ${b.map(Number)} = ${want}`);
  }
}
if (seenState.size < 8) bad(`only ${seenState.size} of 8 base states were spoken over ${SEEDS} seeds`);
console.log(`bases: ${baseLines} lines, ${seenState.size} of 8 states`);
/* picks never depend on audio: draftFromBank takes only the bank, the seed and the stream; a missing clip is the player's silence */
const names = JSON.stringify(bank).match(/\{(batter|pitcher|runner|desc)\}/);
if (names) bad('fixture uses a name slot');
console.log(`clips: ${SEEDS} seeds, ${said} lines (${withClips} with clips), ${clipsSeen.size} distinct clip ids drafted of ${clips.size} in the fixture bank`);

const real = JSON.parse(readFileSync(path.join(DIR, 'lines.json'), 'utf8'));
for (const e of validateBank(real)) bad(`lines.json (v${real.version}): ${e}`);
if (problems.length) { console.error(`\nFAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log('OK: clip ids match line-id.mjs, v2 validator rejects names and {desc}, drafts carry clips, are deterministic and causal, every clip is listed.');
