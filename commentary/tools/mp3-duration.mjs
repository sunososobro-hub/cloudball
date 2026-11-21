/* Length of an mp3 file in seconds, in plain Node (no ffprobe needed, so CI and any machine can run
 * it). Counts the MPEG audio frames (works for constant and variable bitrate) and skips the LAME
 * "Xing"/"Info" header frame, which carries no audio. Layer III only (what synth.mjs writes). */
import { readFileSync } from 'node:fs';

const ID3_HEADER = 10, ID3_FOOTER = 10;
const BITRATE = {   /* kbit/s by bitrate index, Layer III */
  1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],   /* MPEG-1 */
  2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],      /* MPEG-2 and 2.5 */
};
const RATE = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };   /* by version bits */
const SAMPLES = { 1: 1152, 2: 576 };

export function mp3Duration(file) {
  const b = readFileSync(file);
  let i = 0, seconds = 0, frames = 0;
  if (b.length >= ID3_HEADER && b.toString('latin1', 0, 3) === 'ID3') {
    const size = ((b[6] & 0x7f) << 21) | ((b[7] & 0x7f) << 14) | ((b[8] & 0x7f) << 7) | (b[9] & 0x7f);
    i = ID3_HEADER + size + (b[5] & 0x10 ? ID3_FOOTER : 0);
  }
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff || (b[i + 1] & 0xe0) !== 0xe0) { i++; continue; }
    const ver = (b[i + 1] >> 3) & 3, layer = (b[i + 1] >> 1) & 3, br = b[i + 2] >> 4, sr = (b[i + 2] >> 2) & 3, pad = (b[i + 2] >> 1) & 1;
    if (ver === 1 || layer !== 1 || br === 0 || br === 15 || sr === 3) { i++; continue; }   /* reserved, not Layer III, free format */
    const v = ver === 3 ? 1 : 2, rate = RATE[ver][sr], kbps = BITRATE[v][br];
    const len = Math.floor((SAMPLES[v] / 8) * kbps * 1000 / rate) + pad;
    if (i + len > b.length) break;
    const tag = b.toString('latin1', i + 4, Math.min(i + len, i + 40));
    if (!(frames === 0 && (tag.includes('Xing') || tag.includes('Info')))) seconds += SAMPLES[v] / rate;
    frames++; i += len;
  }
  return seconds;
}
