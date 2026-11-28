/* Estimated US$ of a synthesis run (#604). Estimates only: the real cost is what `synth.mjs` prints after a run.
 * Same prices and speech rate as tools/converse.mjs --dry-run (gpt-audio prices per token). */
import { words } from './transcript.mjs';

export const PRICE = { textIn: 2.5e-6, textOut: 10e-6, audioOut: 64e-6 };
export const AUDIO_TOKENS_OUT_PER_SEC = 20;
export const SPEECH_CPS = 4.5;     /* characters per second of speech (player.js SPEECH_CPS) */
export const PROMPT_TOKENS = 450;  /* persona + instructions + line, text tokens per request */

/* rows [{ text }] -> { rows, chars, seconds, cost } for one try per row */
export function estimate(rows) {
  let chars = 0, cost = 0, seconds = 0;
  for (const r of rows) {
    const n = words(r.text).length, sec = n / SPEECH_CPS;
    chars += n; seconds += sec;
    cost += PROMPT_TOKENS * PRICE.textIn + sec * AUDIO_TOKENS_OUT_PER_SEC * PRICE.audioOut + n * PRICE.textOut;
  }
  return { rows: rows.length, chars, seconds, cost };
}
