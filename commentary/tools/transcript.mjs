/* Does a clip say the script line and nothing more? (#99)
 *
 * The voice model returns a transcript of what it said. Both texts are reduced to the words only:
 *   - Unicode NFKC (full-width digits and letters become plain ones), lower case;
 *   - every punctuation mark, symbol and space is dropped (「，」 「。」 「——」 「।」 newlines ...);
 *   - numbers are written the same way: every run of Chinese numerals becomes Arabic digits,
 *     as a count when it has a unit (五十九 -> 59, 一百零五 -> 105) and digit by digit when it has
 *     none (五九 -> 59, 一比零 -> 1比0); 兩 counts as 二.
 * So a plain reading difference (「59」 read 「五十九」) passes, an added or missing word does not. */

const DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const UNIT = { 十: 10, 百: 100, 千: 1000 };
const TEN_THOUSAND = 1e4;
const NUMERALS = /[零〇一二兩三四五六七八九十百千萬]+/g;

function toArabic(run) {
  if (!/[十百千萬]/.test(run)) return [...run].map(c => DIGIT[c]).join('');
  let total = 0, section = 0, num = 0;
  for (const c of run) {
    if (c in DIGIT) num = DIGIT[c];
    else if (c in UNIT) { section += (num || 1) * UNIT[c]; num = 0; }
    else { total += (section + num || 1) * TEN_THOUSAND; section = 0; num = 0; }
  }
  return String(total + section + num);
}

export function words(s) {
  return String(s ?? '').normalize('NFKC').toLowerCase()
    .replace(/[\p{P}\p{S}\p{Z}\s]/gu, '')
    .replace(NUMERALS, toArabic);
}

export const sameWords = (transcript, text) => words(transcript) === words(text);
