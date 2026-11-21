/* Codec of a recorded game (league/preseason/opening.json). Pure: no imports, no clock, no DOM.
 * A simGame() result holds a few `Infinity` numbers (move times that never arrive) that JSON would turn into null,
 * which the renderer reads differently. They are written as the string INF_TAG and revived on load.
 * Used by league/tools/record.mjs, tests/opening.check.mjs and the page (index.html). */
export const RECORDING_FORMAT = 1;
export const INF_TAG = '__Infinity__';

/* The game as one JSON string; the hash of a recording is taken over exactly this text. */
export function encodeGame(game) {
  return JSON.stringify(game, (k, v) => {
    if (v === Infinity) return INF_TAG;
    if (typeof v === 'number' && !Number.isFinite(v)) throw new Error(`cannot record ${v} at "${k}"`);
    return v;
  });
}

export const decodeGame = text => JSON.parse(text, (k, v) => (v === INF_TAG ? Infinity : v));

/* Parse a whole opening.json; returns null for anything that is not a recording this page understands. */
export function parseRecording(text) {
  const rec = decodeGame(text);
  if (!rec || rec.format !== RECORDING_FORMAT || !rec.game || !Array.isArray(rec.game.ev) || !Array.isArray(rec.game.stream)) return null;
  return rec;
}
