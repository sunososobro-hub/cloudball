/* The synthesis id of one script line, shared by make-sheet.mjs (writes the sheet) and
 * wire-audio.mjs (finds the recorded file of a line), so both always agree. The rule lives in
 * ../clip-id.js (browser-safe, also used by the viewer's draft, #603):
 *   role  pbp / color as is; fan -> the guest's fixed voice in voices.json (fan_<guest team id>)
 *   tone  from the line's `emotion` (EMOTION_TONE); every speaker keeps its fixed persona
 *   id    <role>-<10 hex of sha1(role, tone, text)>: same words, same file; new words, new file. */
export { EMOTION_TONE, DEFAULT_EMOTION, roleOf, lineId } from '../clip-id.js';
