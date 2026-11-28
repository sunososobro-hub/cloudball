/* Phone landscape hint (#299): what to show, as a pure function so tests/landhint.check.mjs can run it.
 * Classic script (play.html loads it before ui/layout.js); also `require`-able from Node.
 *   env = { coarse, portrait, ios, intro, dismissed }  ->  { line, chip, button, text }
 * Desktop (not coarse) or landscape: nothing. Entry screen (intro): a one-line `line`, never dismissed.
 * Playing: a small `chip` that stays hidden only once dismissed (the caller forgets that when the screen turns landscape).
 * iPhone Safari cannot lock orientation, so there the text only asks to rotate and there is no button. */
(function (root) {
  const TEXT_LOCK = '橫著看更好，電腦也可以', TEXT_ROTATE = '請把手機轉橫';
  function decide(env) {
    const none = { line: false, chip: false, button: false, text: '' };
    if (!env || !env.coarse || !env.portrait) return none;
    const text = env.ios ? TEXT_ROTATE : TEXT_LOCK, button = !env.ios;
    if (env.intro) return { line: true, chip: false, button, text };
    return { line: false, chip: !env.dismissed, button, text };
  }
  const api = { decide, TEXT_LOCK, TEXT_ROTATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LANDHINT = api;
})(typeof window !== 'undefined' ? window : globalThis);
