/* Guard for the live player preview on agent.html (#189). The preview spec comes from the same choice object that is posted,
 * so every pick that changes the body must change the spec; the page must load three.js only through the import map, after paint. */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { CREATE, makePlayer, validateCreate } from '../league/freeagents.js';
import { specOfChoice, specOfRow, sameSpec, snapBody, LOOK_CHIPS, LOOK_LEGEND, KITS, FREE_KIT, withDress, kitPaint, PREVIEW_OPEN, yawOfSide, flipSide, flipZoom, frameOf } from '../ui/preview-spec.js';

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

/* #441 part 2: the 外觀 chips. Every shown value is legal, posts, previews differently from every other value of its row, and the
   saved row previews the same look; the rows match what render/players.js draws (loaded with three.js stubbed, as players_load does) */
const stub = () => { const f = function () {}; const p = new Proxy(f, { get: (t, k) => k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : p, apply: () => p, construct: () => p, set: () => true }); return p; };
globalThis.__THREE_STUB = stub();
const ROOT = process.cwd(), tmp = mkdtempSync(path.join(tmpdir(), 'pvlook-'));
let PL = null;
try {
  const src = readFileSync('render/players.js', 'utf8').replace(/^import \* as THREE from 'three\/webgpu';.*$/m, 'const THREE=globalThis.__THREE_STUB;')
    .replace(/from '\.\.\/league\/players\.js'/, `from '${pathToFileURL(path.join(ROOT, 'league/players.js')).href}'`);
  const file = path.join(tmp, 'players_stub.mjs'); writeFileSync(file, src); PL = await import(pathToFileURL(file).href);
} catch (e) { bad(`render/players.js did not load with three stubbed: ${e && e.message}`); } finally { rmSync(tmp, { recursive: true, force: true }); }
const DRAWN = PL && { head: PL.HEAD_SHAPES.length, hair: PL.HAIR_TONES.length };
if (Object.keys(LOOK_CHIPS).join() !== 'head,hair') bad(`look chips must be exactly head and hair (skin draws nothing off max): ${Object.keys(LOOK_CHIPS)}`);
for (const [k, labels] of Object.entries(LOOK_CHIPS)) {
  if (!LOOK_LEGEND[k]) bad(`look.${k}: no legend`);
  if (DRAWN && labels.length !== DRAWN[k]) bad(`look.${k}: ${labels.length} chips but render/players.js draws ${DRAWN[k]}`);
  if (new Set(labels).size !== labels.length) bad(`look.${k}: two chips share a label`);
  const specs = labels.map((_, v) => {
    const c = { ...base, look: { ...base.look, [k]: v } }, why = validateCreate(c);
    if (v < CREATE.look[k][0] || v > CREATE.look[k][1] || why.length) bad(`look.${k} ${v}: not a legal choice (${why.join('; ')})`);
    const made = makePlayer(7, c), row = specOfRow({ kind: c.kind, player: made.player, ratings: made.ratings }), a = specOfChoice(c);
    if (a[k] !== v || row[k] !== v) bad(`look.${k} ${v}: preview ${a[k]}, saved row ${row[k]}`);
    return a;
  });
  for (let i = 0; i < specs.length; i++) for (let j = i + 1; j < specs.length; j++) if (sameSpec(specs[i], specs[j])) bad(`look.${k} ${i} and ${j} give the same preview spec`);
}
if (PL) for (const v of LOOK_CHIPS.hair.keys()) if (PL.gearOf(PL.headOfPlayer({ id: 'X1', look: { head: 0, skin: 0, hair: v } })).hair !== v) bad(`hair chip ${v}: the game draws another hair colour`);

/* #595 part 1: four team kits + free agent, and a cap toggle. Colours are the game's road kit from render/players.js (no table here); every kit and
   the cap state give a different preview spec, and every kit paints jersey, pants, socks and cap */
{
  const ids = KITS.map(k => k.id), teamIds = ids.filter(i => i !== 'free');
  if (ids[0] !== 'free' || teamIds.length !== 4) bad(`kit buttons must be free agent + 4 teams, got ${ids}`);
  if (new Set(KITS.map(k => k.label)).size !== KITS.length) bad('two kit buttons share a label');
  const b0 = specOfChoice(base), ds = KITS.map(k => withDress(b0, { kit: k.id, cap: true }));
  for (let i = 0; i < ds.length; i++) for (let j = i + 1; j < ds.length; j++) if (sameSpec(ds[i], ds[j])) bad(`kits ${ids[i]} and ${ids[j]} give the same preview spec`);
  if (sameSpec(withDress(b0, { kit: 'free', cap: true }), withDress(b0, { kit: 'free', cap: false }))) bad('cap on/off gives the same preview spec');
  if (withDress(b0, {}).kit !== 'free' || withDress(b0, { kit: 'nope' }).kit !== 'free' || withDress(b0, {}).cap !== true) bad('default dress must be the free-agent kit with the cap on');
  if (JSON.stringify(withDress(b0, { kit: 'free', cap: true }).body) !== JSON.stringify(b0.body)) bad('dress must not change the body');
  if (PL) {
    const pa = KITS.map(k => kitPaint(k.id, PL));
    if (JSON.stringify(pa[0]) !== JSON.stringify(FREE_KIT)) bad('the free-agent kit must be the neutral grey');
    for (let i = 0; i < pa.length; i++) for (let j = i + 1; j < pa.length; j++) for (const part of ['jersey', 'sock', 'cap']) if (pa[i][part] === pa[j][part]) bad(`kits ${ids[i]} and ${ids[j]} share the ${part} colour`);
    for (const [i, p] of pa.entries()) for (const part of ['jersey', 'pants', 'sock', 'cap']) if (!Number.isInteger(p[part]) || p[part] < 0 || p[part] > 0xffffff) bad(`kit ${ids[i]}: ${part} is not a colour`);
    for (const p of pa.slice(1)) if (p.pants === FREE_KIT.pants) bad('a team kit must change the pants too');
  }
}

/* #441 part 3: opens from the front with a close-up of the head; the turn button flips front/back; the head frame follows the height */
if (PREVIEW_OPEN.side !== 'front' || PREVIEW_OPEN.zoom !== 'close' || yawOfSide(PREVIEW_OPEN.side) !== 0) bad('the preview must open from the front (yaw 0) with a head close-up');
if (flipSide('front') !== 'back' || flipSide(flipSide('front')) !== 'front' || yawOfSide('back') !== Math.PI) bad('turn button: front -> back -> front, back is half a turn');
if (flipZoom('close') !== 'full' || flipZoom('full') !== 'close') bad('zoom button must switch between close-up and full body');
const cl = frameOf('close', 1.8), fu = frameOf('full', 1.8);
if (!(cl.h < fu.h / 2) || !(cl.y > 1.5 && cl.y < 1.8)) bad(`close-up frame is not on the head: ${JSON.stringify(cl)}`);
if (frameOf('close', 1.92).y <= frameOf('close', 1.72).y) bad('the head close-up must follow the height');
if (frameOf('full', 1.72).y !== frameOf('full', 1.92).y) bad('the full-body frame must not depend on the height');

/* page: import map before the module script, no render/ change needed, preview module loads three after first paint */
const html = readFileSync('agent.html', 'utf8'), js = readFileSync('ui/agent-preview.js', 'utf8');
if (!(html.indexOf('type="importmap"') > 0 && html.indexOf('type="importmap"') < html.indexOf('type="module"'))) bad('agent.html: the import map must come before the module script');
if (/^import .*three/m.test(js)) bad('ui/agent-preview.js must import three.js dynamically (after first paint), not at load');
if (!/requestIdleCallback/.test(js)) bad('ui/agent-preview.js must start loading when the browser is idle');
if (/requestAnimationFrame|TURN\b/.test(js)) bad('the preview must not turn by itself any more (front view stays still)');
for (const id of ['stage', 'stageCap']) if (!html.includes(`id="${id}"`)) bad(`agent.html lost #${id}`);
for (const c of ['stage-turn', 'stage-zoom']) if (!html.includes(`class="${c}"`) || !js.includes(c)) bad(`agent.html / agent-preview.js lost the ${c} button`);

if (problems.length) { console.error(`FAILED: ${problems.length} problem(s)`); for (const p of problems) console.error('  ' + p); process.exit(1); }
console.log(`OK: preview spec follows build, side, head and height for ${Object.keys(CREATE.builds).length} builds; look chips ${LOOK_CHIPS.head.length} heads, ${LOOK_CHIPS.hair.length} hair colours; page loads three after first paint.`);
