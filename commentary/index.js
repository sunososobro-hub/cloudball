/* Entry point for the viewer. Loads the fallback bank and, when one exists, the script that
 * was written for a game after it was simulated. Static files only. */
export { createBooth, draftFromBank, validateScript, validateBank, planRecorded, isRecorded, SPEAKERS } from './player.js';
export { createVoice, CROWD_DUCK } from './voice.js';
export { tensionTrack, tensionOf, emotionFor, EMOTIONS, TENSION_MAX } from './tension.js';

const here = new URL('./', import.meta.url);
let scriptIndex = null;

export async function loadBank() {
  return (await fetch(new URL('lines.json', here))).json();
}

/* The per-game script for a seed, or null. scripts/index.json lists what exists, so a game
 * without a script costs no failed request. */
export async function loadScript(seed) {
  try {
    if (!scriptIndex) scriptIndex = (await (await fetch(new URL('scripts/index.json', here))).json()).scripts || {};
    const file = scriptIndex[String(seed >>> 0)];
    return file ? await (await fetch(new URL('scripts/' + file, here))).json() : null;
  } catch (err) { return null; }
}
