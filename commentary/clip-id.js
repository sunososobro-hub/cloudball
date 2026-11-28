/* Clip id, browser-safe (no node:crypto): <role>-<10 hex of sha1(JSON [role, tone, text])>. tools/line-id.mjs re-exports it,
 * so the sheet, the wiring and the viewer's draft all agree (commentary/clips.check.mjs compares it with node:crypto). */
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

/* SHA-1 of a string (UTF-8) as hex */
export function sha1Hex(str) {
  const b = [...new TextEncoder().encode(str)], l = b.length;
  b.push(0x80); while (b.length % 64 !== 56) b.push(0);
  const hi = Math.floor(l / 0x20000000), lo = (l << 3) >>> 0;
  b.push((hi >>> 24) & 255, (hi >>> 16) & 255, (hi >>> 8) & 255, hi & 255, (lo >>> 24) & 255, (lo >>> 16) & 255, (lo >>> 8) & 255, lo & 255);
  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const rol = (x, n) => ((x << n) | (x >>> (32 - n))) >>> 0, w = new Array(80);
  for (let o = 0; o < b.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = ((b[o + 4 * i] << 24) | (b[o + 4 * i + 1] << 16) | (b[o + 4 * i + 2] << 8) | b[o + 4 * i + 3]) >>> 0;
    for (let i = 16; i < 80; i++) w[i] = rol(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0, bb = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      const [f, k] = i < 20 ? [(bb & c) | (~bb & d), 0x5a827999] : i < 40 ? [bb ^ c ^ d, 0x6ed9eba1] : i < 60 ? [(bb & c) | (bb & d) | (c & d), 0x8f1bbcdc] : [bb ^ c ^ d, 0xca62c1d6];
      const t = (rol(a, 5) + f + e + k + w[i]) >>> 0; e = d; d = c; c = rol(bb, 30); bb = a; a = t;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + bb) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }
  return [h0, h1, h2, h3, h4].map(x => x.toString(16).padStart(8, '0')).join('');
}
export const roleOf = (speaker, guest) => (speaker === 'fan' ? `fan_${guest}` : speaker);
export function lineId(line, guest) {
  const role = roleOf(line.speaker, guest), tone = EMOTION_TONE[line.emotion || DEFAULT_EMOTION];
  return `${role}-${sha1Hex(JSON.stringify([role, tone, line.text])).slice(0, ID_HEX)}`;
}
