/* Guard for the live player preview on agent.html (#189). The preview spec comes from the same choice object that is posted,
 * so every pick that changes the body must change the spec; the page must load three.js only through the import map, after paint. */
import { readFileSync } from 'node:fs';
import { CREATE, makePlayer } from '../league/freeagents.js';
import { specOfChoice, specOfRow, sameSpec, snapBody } from '../ui/preview-spec.js';

const problems = [], bad = m => problems.push(m);
/* points come from CREATE, so a change of the budget or the ability list never breaks this guard */
const even = kind => Object.fromEntries(CREATE.keys[kind].map(k => [k, CREATE.budget[kind] / CREATE.keys[kind].length]));
const base = { kind: 'bat', pos: 'SS', bats: 'R', build: 'normal', look: { head: 0, skin: 0, hair: 0 }, points: even('bat'), nameDraw: 0 };

/* every build and head, and handedness, draws a different body */
const specs = Object.keys(CREATE.builds).map(b => specOfChoice({ ...base, build: b }));
for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) if (sameSpec(specs[i], specs[j])) bad(`builds ${i} and ${j} give the same preview spec`);
if (sameSpec(specOfChoice(base), specOfChoice({ ...base, bats: 'L' }))) bad('left and right batting side give the same preview spec');
if (sameSpec(specOfChoice(base), specOfChoice({ ...base, look: { ...base.look, head: 3 } }))) bad('look.head does not change the preview spec');
const pit = { kind: 'pit', role: 'SP', throws: 'L', build: 'slim', look: { head: 1, skin: 0, hair: 0 }, points: even('pit'), nameDraw: 0 };
if (specOfChoice(pit).hand !== 'L' || specOfChoice(pit).kind !== 'pit') bad('a left-handed pitcher must preview as a left-handed pitcher');

/* a created player previews with the body the game will build from his row (same snap as render/game.js qBody, height drawn inside the build range) */
for (const c of [base, ...Object.keys(CREATE.builds).map(b => ({ ...base, build: b })), pit]) {
  const made = makePlayer(7, c), row = { kind: c.kind, player: made.player, ratings: made.ratings }, a = specOfChoice(c), b = specOfRow(row);
  if (JSON.stringify(a.body) !== JSON.stringify(b.body)) bad(`${c.build}: the choice preview body differs from the saved player's body`);
  const [lo, hi] = CREATE.builds[c.build].ht; if (a.ht < lo || a.ht > hi) bad(`${c.build}: preview height ${a.ht} is outside the build range`);
  if (a.hand !== b.hand || a.head !== b.head) bad(`${c.build}: hand or head differs between the choice and the saved row`);
}
if (JSON.stringify(snapBody({ slim: .6, power: .7 })) !== JSON.stringify({ slim: .5, power: .75 })) bad('snapBody must snap to quarter steps like render/game.js');

/* #442: sliders draw their own body and height, and the saved row agrees */
const sl = { ...base, build: undefined, body: { slim: 25, power: 50, heavy: 0 }, ht: 1.9 }; delete sl.build;
const slm = makePlayer(7, sl), slSpec = specOfChoice(sl), slRow = specOfRow({ kind: 'bat', player: slm.player, ratings: slm.ratings });
if (slSpec.ht !== 1.9 || JSON.stringify(slSpec.body) !== JSON.stringify({ slim: .25, power: .5 }) || JSON.stringify(slSpec.body) !== JSON.stringify(slRow.body) || slRow.ht !== 1.9) bad('slider choice: preview and saved row differ');
if (sameSpec(slSpec, specOfChoice({ ...sl, body: { slim: 0, power: 25, heavy: 50 } }))) bad('two body mixes give the same preview spec');
if (sameSpec(slSpec, specOfChoice({ ...sl, ht: 1.75 }))) bad('height does not change the preview spec');

/* page: import map before the module script, no render/ change needed, preview module loads three after first paint */
const html = readFileSync('agent.html', 'utf8'), js = readFileSync('ui/agent-preview.js', 'utf8');
if (!(html.indexOf('type="importmap"') > 0 && html.indexOf('type="importmap"') < html.indexOf('type="module"'))) bad('agent.html: the import map must come before the module script');
if (/^import .*three/m.test(js)) bad('ui/agent-preview.js must import three.js dynamically (after first paint), not at load');
if (!/requestIdleCallback/.test(js)) bad('ui/agent-preview.js must start loading when the browser is idle');
for (const id of ['stage', 'stageCap']) if (!html.includes(`id="${id}"`)) bad(`agent.html lost #${id}`);

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: preview spec follows build, side, head and height for ${Object.keys(CREATE.builds).length} builds; page loads three after first paint.`);
