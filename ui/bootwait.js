/* Entry screen that never wakes (#668): name what the page is still waiting for instead of 「球場準備中…」 forever.
 * Classic script (play.html loads it in <head>, before window.BOOT); also `require`-able from Node (tests/bootwait.check.mjs).
 *   pending(t)                       first boot stage not yet ended in BOOT.t (k or k+'!'), as [key, label]; null when all ended.
 *                                    An optional stage (farm, ledger) counts only once its start mark (farm0, ledger0) exists.
 *   stallText(stage)                 one plain line for the entry card
 *   deadline(p, ms, what, setT, clrT) p, or a rejection `what: no answer in N s` after ms (timers injectable for tests)
 *   arm(B, doc, setT, reload)        after STALL_MS, if the entry button has not woken and boot did not fail: show the line + 重試
 *   show(doc, text, reload)          the line + 重試 under the entry buttons (#bootStall); hide(doc) removes it
 * Only the time-out shows; nothing stops a slow load that is still going: when it ends the buttons wake as usual. */
(function (root) {
  const STALL_MS = 20000;      /* issue #668: a stage still open 20 s after the page opened gets a named reason */
  const OPTIONAL_MS = 15000;   /* ?f= / ?g= replay loads (engine from jsDelivr): given up after this, the frozen game plays instead */
  const ORDER = [
    ['three', '3D 引擎（three.js，jsDelivr）'], ['tsl', '3D 引擎（three.js，jsDelivr）'], ['fx', '畫面特效（jsDelivr）'],
    ['engine', '比賽引擎'], ['opening', '比賽紀錄'], ['comm', '播報'], ['bank', '播報台詞'], ['hl', '精華'],
    ['players', '球員模型'], ['bodies', '球員動作素材'], ['gpu', '顯示卡（WebGPU / WebGL）'],
    ['farm', '二軍重播（引擎從 jsDelivr 下載）'], ['ledger', '比賽重播（引擎從 jsDelivr 下載）'],
    ['game', '球場程式'], ['button', '球場編譯（手機較慢時會久一點）']];
  const OPTIONAL = new Set(['farm', 'ledger']);
  const ended = (t, k) => (k in t) || ((k + '!') in t);
  function pending(t) {
    t = t || {};
    for (const s of ORDER) {
      if (OPTIONAL.has(s[0]) && !((s[0] + '0') in t)) continue;
      if (!ended(t, s[0])) return s;
    }
    return null;
  }
  const stallText = s => s ? `還在等：${s[1]}。網路慢可以再等等，或按重試` : '';
  function deadline(p, ms, what, setT, clrT) {
    setT = setT || setTimeout; clrT = clrT || clearTimeout;
    let h;
    const late = new Promise((_, no) => { h = setT(() => no(new Error(`${what}: no answer in ${Math.round(ms / 1000)} s`)), ms); });
    return Promise.race([Promise.resolve(p), late]).finally(() => clrT(h));
  }
  function show(doc, text, reload) {
    const p = doc.getElementById('bootStall');
    if (!p) return false;
    p.firstElementChild.textContent = text;
    const b = p.lastElementChild;
    if (b && !b.onclick) b.onclick = reload;
    p.hidden = false;
    return true;
  }
  function hide(doc) { const p = doc.getElementById('bootStall'); if (p) p.hidden = true; }
  function arm(B, doc, setT, reload) {
    (setT || setTimeout)(() => {
      if (!B || B.failed || ('button' in B.t)) return;
      const s = pending(B.t);
      if (!s) return;
      B.t['stall'] = s[0];   /* the 🐞 report's boot= field names the stage */
      show(doc, stallText(s), reload);
    }, STALL_MS);
  }
  const api = { STALL_MS, OPTIONAL_MS, ORDER, pending, stallText, deadline, arm, show, hide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BOOTWAIT = api;
})(typeof window !== 'undefined' ? window : globalThis);
