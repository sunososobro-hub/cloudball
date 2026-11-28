/* Anonymous viewing counts (#89). Watches the page from outside (DOM only, no hook in render/game.js)
 * and posts at most two small events (#805) to the same-origin /api/v with navigator.sendBeacon. Fire and forget:
 * nothing awaits it, nothing reads the answer, any failure is swallowed, and the game never depends on it.
 * No cookie, no localStorage, no IP, no user agent: the only identifier is a random id made for this page load. */
(() => {
  try {
    /* #805: Functions requests are the first free-tier limit (100,000 a day), so a page sends at most BEACONS_PER_PAGE posts:
     * 'enter' (or 'view' when the visitor leaves before entering) and one 'summary' on the first hide. Friendly / practice
     * games (play.html?x=, #751) send nothing: PRACTICE_SAMPLE is the share of them that report (0 = none). */
    const BEACONS_PER_PAGE = 2, PRACTICE_SAMPLE = 0;
    if (/[?&]x=/.test(location.search) && !(PRACTICE_SAMPLE > 0 && Math.random() < PRACTICE_SAMPLE)) return;
    const host = location.hostname;
    if (!/^https?:$/.test(location.protocol) || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(host)) return;
    const arr = new Uint8Array(6); crypto.getRandomValues(arr);
    const id = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
    const t0 = performance.now(); let tEnter = 0, entered = false, seed = '';
    const sent = new Set();
    let posts = 0, left = false, maxInning = 0, gameEnd = 0, soundOn = 0, topSpeed = 0;
    const post = body => {
      try {
        if (posts >= BEACONS_PER_PAGE) return; posts++;
        const data = JSON.stringify(body);
        if (!(navigator.sendBeacon && navigator.sendBeacon('/api/v', data))) fetch('/api/v', { method: 'POST', body: data, keepalive: true }).catch(() => {});
      } catch (e) {}
    };
    const send = (e, n = 0, once = e + ':' + n) => {
      if (once && sent.has(once)) return; if (once) sent.add(once);
      if (e === 'enter') post({ id, e, n, s: seed });          /* the rest is folded into the one summary */
      else if (e === 'inning') maxInning = Math.max(maxInning, n);
      else if (e === 'game_end') gameEnd = 1;
      else if (e === 'sound_on') soundOn = 1;
      else if (e === 'fast_forward') topSpeed = Math.max(topSpeed, n);
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
      if (left) return; left = true;                          /* only the first hide reports; later hides send nothing */
      const now = performance.now(), w = entered ? Math.round((now - tEnter) / 1000) : 0, p = Math.round((now - t0) / 1000);
      if (!entered) post({ id, e: 'view', n: 0, s: seed, w, p });
      else post({ id, e: 'summary', n: maxInning, s: seed, w, p, g: gameEnd, a: soundOn, f: topSpeed });
    };
    /* pagehide is the real exit; hidden covers mobile browsers that skip it. */
    addEventListener('pagehide', leave);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') leave(); });
  } catch (e) {}
})();
