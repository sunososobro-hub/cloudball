/* What the player preview draws (#189). Pure: no DOM, no three.js, so node can check it (tests/preview.check.mjs).
 * One spec = everything the body depends on. It is built from the very same `choice` object that agent.js posts
 * (specOfChoice) or from a roster row of the free-agent list (specOfRow), so what the fan sees is what is saved.
 * Heights are drawn at creation: the preview of a choice shows the middle of the build's range. */
import { CREATE } from '../league/freeagents.js';

/* the game snaps body weights to quarter steps so geometry is cached (render/game.js qBody); the preview does the same */
const SNAP = 4;
export const snapBody = b => { const o = {}; for (const k in b || {}) { const v = Math.round(b[k] * SNAP) / SNAP; if (v) o[k] = v; } return o; };

const mid = ([a, b]) => Math.round((a + b) / 2 * 100) / 100;

/* #441 part 2: the 外觀 chips on agent.html, exactly the look numbers the live preview draws: head shape (render/players.js HEAD_SHAPES,
   same order) and hair colour (HAIR_TONES, same order). look.skin is not offered: on the normal tiers and in the preview every player has
   the same skin colour (the skin maps load on max only), so a skin chip would draw nothing. tests/preview.check.mjs holds the counts to
   players.js and the values inside CREATE.look. */
export const LOOK_CHIPS = {
  head: ['標準', '方臉', '長臉', '圓臉', '濃眉', '寬臉'],
  hair: ['黑', '深棕', '棕', '栗色', '灰'],
};
export const LOOK_LEGEND = { head: '臉型（不選＝依編號）', hair: '髮色（不選＝依編號）' };
/* #541: only the chips the fan picked go in; a missing key is derived from the id by render/players.js headOfPlayer (same id = same look). */
const lookOf = L => { const o = {}; for (const k of ['head', 'skin', 'hair']) if (L && Number.isInteger(L[k]) && L[k] >= 0) o[k] = L[k]; return o; };
/* a choice that is not saved yet has no id: the maker previews it under a draft id (the real id is made by the server) */
export const DRAFT_ID = 'draft';

export function specOfChoice(c, id = DRAFT_ID) {
  const bat = c.kind === 'bat', B = CREATE.builds[c.build] || CREATE.builds.normal;
  const body = c.body ? Object.fromEntries(Object.entries(c.body).map(([k, v]) => [k, v / 100])) : B.body;   /* #442: sliders (percent) or a preset */
  return { kind: c.kind, hand: bat ? c.bats : c.throws, body: snapBody(body), ht: c.body ? c.ht : mid(B.ht), id, look: lookOf(c.look), num: null };
}

/* a row of /api/freeagents or /api/player: { kind, player, ratings } */
export function specOfRow(row) {
  const p = row.player, bat = row.kind === 'bat';
  return { kind: row.kind, hand: bat ? p.hand : p.throws, body: snapBody(p.body), ht: p.ht, id: p.id, look: lookOf(p.look), num: p.num ?? null };
}

/* #441 part 3: the preview opens from the FRONT with a close-up of the head (face, hair colour and head shape read there); 轉身 flips
   to the back (number), 全身 / 特寫 switches the frame. Pure, so tests/preview.check.mjs can hold it. render/players.js: +z is the front and
   the camera stands on +z, so yaw 0 faces the viewer. */
export const PREVIEW_OPEN = { side: 'front', zoom: 'close' };
export const FRAME_CLOSE_H = 0.7, FRAME_CLOSE_W = 0.62, FRAME_FULL_H = 2.2, FRAME_FULL_W = 1.5, FULL_TARGET_Y = 0.98, HEAD_BELOW_TOP = 0.12;   /* metres; the head centre sits about 12 cm under the top of the body */
export const yawOfSide = side => (side === 'back' ? Math.PI : 0);
export const flipSide = side => (side === 'back' ? 'front' : 'back');
export const flipZoom = zoom => (zoom === 'full' ? 'close' : 'full');
export const frameOf = (zoom, ht) => (zoom === 'full' ? { h: FRAME_FULL_H, w: FRAME_FULL_W, y: FULL_TARGET_Y } : { h: FRAME_CLOSE_H, w: FRAME_CLOSE_W, y: ht - HEAD_BELOW_TOP });

/* two specs that draw the same body (used to skip needless work) */
export const sameSpec = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
