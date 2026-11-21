/* Anonymous viewing counts (#89). Watches the page from outside (DOM only, no hook in render/game.js)
 * and posts milestones to the same-origin /api/v with navigator.sendBeacon. Fire and forget:
 * nothing awaits it, nothing reads the answer, any failure is swallowed, and the game never depends on it.
 * No cookie, no localStorage, no IP, no user agent: the only identifier is a random id made for this page load. */
(() => {
  try {
    const host = location.hostname;
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host)) return;
    const arr = new Uint8Array(6); crypto.getRandomValues(arr);
    const id = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    const t0 = performance.now(); let tEnter = 0, entered = false, seed = '';
    const sent = new Set();
    const post = body => {
      try {
        const data = JSON.stringify(body);
        if (!(navigator.sendBeacon && navigator.sendBeacon('/api/v', data))) fetch('/api/v', { method: 'POST', body: data, keepalive: true }).catch(() => {});
      } catch (e) {}
    };
    const send = (e, n = 0, once = e + ':' + n) => {
      if (once && sent.has(once)) return; if (once) sent.add(once);
      post({ id, e, n, s: seed });
    };
    const $ = x => document.getElementById(x);
    const seedNow = () => { const m = /#([0-9a-f]+)\s*$/.exec(($('seedTag') || {}).textContent || ''); seed = m ? m[1] : seed; return seed; };
    const studio = () => document.body.classList.contains('studio');
    /* the inning shown in the scorebug: "▲3" / "▼9" or "終" at the end.
     * Only innings reached by playing count (#117): a jump on the player bar (event 'cloudball:seek' from render/game.js) lands
     * wherever it lands and that inning is not sent; a drag is ignored while the handle is held; "game_end" only when the last
     * inning was reached by playing. prev = last inning seen (0 before the first, null right after a jump), live = the position
     * now was reached by playing. */
    let prev = 0, live = true, dragging = false, shown = '', jumpTimer = 0;
    const inningOf = () => { const m = /(\d+)/.exec(($('bin') || {}).textContent || ''); return m ? +m[1] : null; };
    const look = () => {
      if (!entered || studio() || dragging) return;
      const was = shown; shown = seedNow();
      if (was && shown !== was) { prev = 0; live = true; }   /* a new game (random game in the dev tools) starts the count over */
      const t = ($('bin') || {}).textContent || '';
      if (t === '終') { if (live && prev) send('game_end', 0, 'game_end:' + seed); return; }
      const n = inningOf(); if (n === null) return;
      if (prev === null) { live = false; prev = n; return; }  /* the inning a jump landed in */
      if (n === prev + 1) { live = true; send('inning', n, 'inning:' + seed + ':' + n); }
      else if (n !== prev) live = false;                      /* any other change is a jump or a restart, not playing */
      prev = n;
    };
    addEventListener('cloudball:seek', ev => {
      dragging = !!(ev.detail && ev.detail.drag); prev = null; clearTimeout(jumpTimer);
      /* a jump inside the same inning changes nothing in the scorebug; learn the landing inning shortly after instead */
      jumpTimer = setTimeout(() => { if (prev === null && !dragging) { const n = inningOf(); if (n !== null) { prev = n; live = false; } } }, 600);
    });
    const watch = (el, opt, fn) => { if (el) new MutationObserver(fn).observe(el, opt); };

    document.addEventListener('click', ev => {
      const b = ev.target.closest && ev.target.closest('#enter,#enterMute'); if (!b || entered) return;
      entered = true; tEnter = performance.now(); seedNow();
      send('enter', b.id === 'enter' ? 1 : 0, 'enter');
      setTimeout(look, 0);
    }, true);
    watch($('snd'), { attributes: true, attributeFilter: ['aria-pressed'] }, () => { if (entered && $('snd').getAttribute('aria-pressed') === 'true') send('sound_on', 0, 'sound_on'); });
    watch($('bin'), { childList: true, characterData: true, subtree: true }, look);
    watch($('spd'), { childList: true, characterData: true, subtree: true }, () => { const n = parseInt($('spd').textContent, 10); if (entered && n > 1) send('fast_forward', n); });

    const leave = () => {
      const now = performance.now();
      post({ id, e: 'leave', n: 0, s: seed, w: entered ? Math.round((now - tEnter) / 1000) : 0, p: Math.round((now - t0) / 1000) });
    };
    /* pagehide is the real exit; hidden covers mobile browsers that skip it. The report keeps the largest value per id. */
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
    send('view', 0, 'view');
  } catch (e) {}
})();
