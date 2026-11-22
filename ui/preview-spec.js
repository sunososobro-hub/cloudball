/* What the player preview draws (#189). Pure: no DOM, no three.js, so node can check it (tests/preview.check.mjs).
 * One spec = everything the body depends on. It is built from the very same `choice` object that agent.js posts
 * (specOfChoice) or from a roster row of the free-agent list (specOfRow), so what the fan sees is what is saved.
 * Heights are drawn at creation: the preview of a choice shows the middle of the build's range. */
import { CREATE } from '../league/freeagents.js';

/* the game snaps body weights to quarter steps so geometry is cached (render/game.js qBody); the preview does the same */
const SNAP = 4;
export const snapBody = b => { const o = {}; for (const k in b || {}) { const v = Math.round(b[k] * SNAP) / SNAP; if (v) o[k] = v; } return o; };

const mid = ([a, b]) => Math.round((a + b) / 2 * 100) / 100;

export function specOfChoice(c) {
  const bat = c.kind === 'bat', B = CREATE.builds[c.build] || CREATE.builds.normal;
  return { kind: c.kind, hand: bat ? c.bats : c.throws, body: snapBody(B.body), ht: mid(B.ht), head: c.look ? c.look.head : 0, num: null };
}

/* a row of /api/freeagents or /api/player: { kind, player, ratings } */
export function specOfRow(row) {
  const p = row.player, bat = row.kind === 'bat';
  return { kind: row.kind, hand: bat ? p.hand : p.throws, body: snapBody(p.body), ht: p.ht, head: p.look ? p.look.head : 0, num: p.num ?? null };
}

/* two specs that draw the same body (used to skip needless work) */
export const sameSpec = (a, b) => !!a && !!b && JSON.stringify(a) === JSON.stringify(b);
