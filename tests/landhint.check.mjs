/* Guard for the phone landscape hint (#299, ui/landhint.js). Fails when
 *   - desktop (not a coarse pointer) or a landscape phone gets any hint;
 *   - a portrait Android phone lacks the entry line with the 橫向 button, or the in-game chip, or the chip stays after dismissing;
 *   - an iPhone gets a button (it cannot lock orientation) or a text other than 「請把手機轉橫」;
 *   - the entry line can be dismissed away (it must show on every visit) or line and chip show together.
 * Usage: node tests/landhint.check.mjs */
import { createRequire } from 'node:module';
const { decide, TEXT_LOCK, TEXT_ROTATE } = createRequire(import.meta.url)('../ui/landhint.js');
const problems = [], bad = m => problems.push(m);
const phone = o => ({ coarse: true, portrait: true, ios: false, intro: false, dismissed: false, ...o });
const same = (name, got, want) => { for (const k in want) if (got[k] !== want[k]) bad(`${name}: ${k} is ${got[k]}, want ${want[k]}`) };

same('desktop intro', decide(phone({ coarse: false, intro: true })), { line: false, chip: false, button: false });
same('desktop playing', decide(phone({ coarse: false })), { line: false, chip: false, button: false });
same('landscape intro', decide(phone({ portrait: false, intro: true })), { line: false, chip: false });
same('landscape playing', decide(phone({ portrait: false })), { line: false, chip: false });
same('android intro', decide(phone({ intro: true })), { line: true, chip: false, button: true, text: TEXT_LOCK });
same('android playing', decide(phone()), { line: false, chip: true, button: true, text: TEXT_LOCK });
same('android dismissed', decide(phone({ dismissed: true })), { chip: false });
same('android intro ignores dismissed', decide(phone({ intro: true, dismissed: true })), { line: true });
same('iphone intro', decide(phone({ ios: true, intro: true })), { line: true, button: false, text: TEXT_ROTATE });
same('iphone playing', decide(phone({ ios: true })), { chip: true, button: false, text: TEXT_ROTATE });
if (TEXT_ROTATE !== '請把手機轉橫') bad('iphone text changed');
if (decide(undefined).line) bad('no env must show nothing');

if (problems.length) { console.error('landhint FAIL\n' + problems.map(p => ' - ' + p).join('\n')); process.exit(1) }
console.log('landhint ok (11 cases)');
