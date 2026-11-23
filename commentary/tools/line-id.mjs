/* The synthesis id of one script line, shared by make-sheet.mjs (writes the sheet) and
 * wire-audio.mjs (finds the recorded file of a line), so both always agree.
 *   role  pbp / color as is; fan -> the guest's fixed voice in voices.json (fan_<guest team id>)
 *   tone  from the line's `emotion` (EMOTION_TONE below); every speaker keeps its fixed persona
 *   id    <role>-<10 hex of sha1(role, tone, text)>: same words, same file; new words, new file. */
import { createHash } from 'node:crypto';

export const EMOTION_TONE = {
  calm: '平穩清楚，正常播報',
  excited: '興奮，音量拉高、語速加快',
  tense: '緊張，聲音壓低、一字一字講',
  thrilled: '非常激動，大聲、尾音拉長',
  disappointed: '失望，語氣往下沉、慢一點',
  amused: '覺得好笑，帶點調侃',
};
export const DEFAULT_EMOTION = 'calm';
const ID_HEX = 10;

export const roleOf = (speaker, guest) => (speaker === 'fan' ? `fan_${guest}` : speaker);
export function lineId(line, guest) {
  const role = roleOf(line.speaker, guest), tone = EMOTION_TONE[line.emotion || DEFAULT_EMOTION];
  return `${role}-${createHash('sha1').update(JSON.stringify([role, tone, line.text])).digest('hex').slice(0, ID_HEX)}`;
}
