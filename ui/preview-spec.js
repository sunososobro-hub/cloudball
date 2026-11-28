/* What the player preview draws (#189). Pure: no DOM, no three.js, so node can check it (tests/preview.check.mjs).
 * One spec = everything the body depends on. It is built from the very same `choice` object that agent.js posts
 * (specOfChoice) or from a roster row of the free-agent list (specOfRow), so what the fan sees is what is saved.
 * Heights are drawn at creation: the preview of a choice shows the middle of the build's range. */
import { CREATE } from '../league/freeagents.js';
import { TEAMS } from '../league/teams.js';

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
export const LOOK_LEGEND = { head: '臉型', hair: '髮色' };
const lookOf = L => ({ head: L && Number.isInteger(L.head) ? L.head : 0, hair: L && Number.isInteger(L.hair) ? L.hair : 0 });

export function specOfChoice(c) {
  const bat = c.kind === 'bat', B = CREATE.builds[c.build] || CREATE.builds.normal;
  const body = c.body ? Object.fromEntries(Object.entries(c.body).map(([k, v]) => [k, v / 100])) : B.body;   /* #442: sliders (percent) or a preset */
  return { kind: c.kind, hand: bat ? c.bats : c.throws, body: snapBody(body), ht: c.body ? c.ht : mid(B.ht), ...lookOf(c.look), id: null, num: null };
}

/* a row of /api/freeagents or /api/player: { kind, player, ratings } */
export function specOfRow(row) {
  const p = row.player, bat = row.kind === 'bat';
  return { kind: row.kind, hand: bat ? p.hand : p.throws, body: snapBody(p.body), ht: p.ht, ...lookOf(p.look), id: p.id ?? null, num: p.num ?? null };
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

/* #595 part 1: kit buttons (the four teams + free agent) and the cap toggle. The colours are not a table here: a team kit is the game's ROAD kit
   from render/players.js (kitInk + KIT_ROAD_PANTS, socks and cap in the team colour, as setKit does), the free-agent kit is the old neutral grey.
   `kit` and `cap` ride in the spec, so a different kit or cap is a different preview. */
export const FREE_KIT = { jersey: 0x7d8794, pants: 0xe6e6e6, sock: 0x7d8794, cap: 0x7d8794 };
export const KITS = [{ id: 'free', label: '自由球員' }, ...TEAMS.map(t => ({ id: t.id, label: t.short }))];
/* #595 part 2: pose buttons. Only poses render/ really has: 站姿 (the #439 standing hold the preview always drew) and 打擊姿勢 (the stance keyframe S of
   `BK` in render/game.js poseBatter: shoulders yaw, lean, head turned to the pitcher, stride and back leg; hands and bat stay at the #439 hold, which
   is the game's S hand position within a few cm). A fielding ready stance is NOT in render/ (fielders stand until a ball is hit; crouch() is only the
   catcher, tags and low catches), so it is not offered here (#595 comment, never invented). BAT_STANCE copies BK[k][0]; tests/preview.check.mjs holds them equal. */
export const POSES = [{ id: 'stand', label: '站姿' }, { id: 'bat', label: '打擊姿勢' }];
export const BAT_STANCE = { yaw: -.15, lean: .12, head: 1.1, back: -.2, stride: .2, hipsK: .6 };   /* radians; hips yaw = yaw * hipsK as in poseBatter */
export const DEFAULT_DRESS = { kit: 'free', cap: true, pose: 'stand' };
export const withDress = (spec, d) => ({ ...spec, kit: KITS.some(k => k.id === (d && d.kit)) ? d.kit : DEFAULT_DRESS.kit, cap: !d || d.cap !== false, pose: POSES.some(q => q.id === (d && d.pose)) ? d.pose : DEFAULT_DRESS.pose });
/* PL = render/players.js (kitInk, KIT_ROAD_PANTS); returns hex colours for jersey, pants, sock, cap */
export function kitPaint(id, PL) {
  const t = TEAMS.find(x => x.id === id); if (!t) return { ...FREE_KIT };
  const ink = PL.kitInk(t, false);
  return { jersey: ink.jersey, pants: PL.KIT_ROAD_PANTS, sock: t.color, cap: t.color };
}
