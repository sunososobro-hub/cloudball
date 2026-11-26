/* #303: the bunt mocap clip's time warp and weight (render/bunt_clip.js), run on the timings game.js uses, and the clip file holds the frames. */
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {buntClipTime, buntClipW, BUNT_CLIP_URL, BUNT_CLIP_FPS, BUNT_SQ_FRAMES, BUNT_HOLD_FRAMES, BUNT_CLIP_OUT, BUNT_CLIP_T0} from '../render/bunt_clip.js';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), bad = [];
const ok = (c, m) => { if (!c) bad.push(m) };
const near = (a, b) => Math.abs(a - b) < 1e-9;
/* the batter's own square-around window in game.js: BUNT_SQUARE_LEAD 1.05, BUNT_SQUARE_DUR .45; ARRIVE from the engine */
const {ARRIVE} = await import('../engine/index.js');
const LEAD = 1.05, DUR = .45, a = ARRIVE - LEAD, b = a + DUR, f = BUNT_CLIP_FPS;
ok(typeof ARRIVE === 'number' && ARRIVE > LEAD, `ARRIVE from the engine (${ARRIVE}) must come after the square-around lead`);
ok(near(buntClipTime(a - 1, ARRIVE, LEAD, DUR), BUNT_SQ_FRAMES[0] / f), 'before the square the clip waits on frame 52');
ok(near(buntClipTime(a, ARRIVE, LEAD, DUR), BUNT_SQ_FRAMES[0] / f), 'square starts on frame 52');
ok(near(buntClipTime(b, ARRIVE, LEAD, DUR), BUNT_SQ_FRAMES[1] / f), 'square ends on frame 64');
ok(near(buntClipTime(ARRIVE, ARRIVE, LEAD, DUR), BUNT_HOLD_FRAMES[1] / f), 'contact (ARRIVE) is frame 80, the end of the hold');
ok(near(buntClipTime(ARRIVE + 2, ARRIVE, LEAD, DUR), BUNT_HOLD_FRAMES[1] / f), 'after contact the clip stays on frame 80');
let prev = -1, mono = true;
for (let u = a - .5; u <= ARRIVE + 1; u += .01) { const t = buntClipTime(u, ARRIVE, LEAD, DUR); if (t < prev - 1e-12) mono = false; prev = t }
ok(mono, 'clip time never runs backwards');
ok(buntClipW(false, ARRIVE, ARRIVE, LEAD, DUR) === 0, 'not a bunt: weight 0');
ok(buntClipW(true, a, ARRIVE, LEAD, DUR) === 0, 'weight 0 when the square starts');
ok(near(buntClipW(true, b, ARRIVE, LEAD, DUR), 1), 'full weight when squared');
ok(near(buntClipW(true, ARRIVE, ARRIVE, LEAD, DUR), 1), 'full weight at contact');
ok(buntClipW(true, ARRIVE + BUNT_CLIP_OUT[1], ARRIVE, LEAD, DUR) === 0, 'clip handed back to the run by ARRIVE + out');
ok(near(BUNT_CLIP_T0, BUNT_SQ_FRAMES[0] / f), 'root travel measured from frame 52');
const clip = JSON.parse(readFileSync(path.join(ROOT, BUNT_CLIP_URL), 'utf8'));
ok(clip.format === 'cloudball-mocap/1', `clip format ${clip.format}`);
ok(clip.fps === f, `clip fps ${clip.fps}, warp assumes ${f}`);
ok(clip.frames > BUNT_HOLD_FRAMES[1], `clip has ${clip.frames} frames, the hold needs frame ${BUNT_HOLD_FRAMES[1]}`);
if (bad.length) { console.error('bunt_clip.check FAILED\n - ' + bad.join('\n - ')); process.exit(1) }
console.log('bunt_clip.check ok');
