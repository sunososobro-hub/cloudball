/* Voices for the booth (browser only). A line plays its pre-rendered audio file when it has
 * one; otherwise, or if the file fails to load, it is read by the browser's own
 * speechSynthesis. Nothing here calls a paid service. */
const CAST = { pbp: { rate: 1.15, pitch: 1.15 }, color: { rate: 0.95, pitch: 0.55 } };
const MAX_QUEUE = 4;
const LANG = 'zh-TW';

/* make on-screen copy speakable (game content rules for the zh-TW voices) */
const speakable = t => t.replace(/(\d+)\s*km\/h/gi, '時速$1公里').replace(/AVG/gi, '打擊率').replace(/\bNP\b/g, '球數').replace(/\b1B\b/g, '一壘安打').replace(/\b2B\b/g, '二壘安打')
  .replace(/\b3B\b/g, '三壘安打').replace(/\bHR\b/g, '全壘打').replace(/\bRBI\b/g, '打點').replace(/[A-Za-z]+/g, '').replace(/(\d)\s*：\s*(\d)/g, '$1比$2').replace(/：/g, '，').replace(/（|）/g, '，').replace(/\s{2,}/g, ' ');

export function createVoice({ audioBase = 'commentary/' } = {}) {
  const SS = typeof window !== 'undefined' ? window.speechSynthesis : null;
  let voices = { pbp: null, color: null }, queue = [], busy = false, current = null, generation = 0;

  /* prefer Taiwan Mandarin, avoid Cantonese; give the two speakers different voices when possible */
  function pickVoices() {
    if (!SS) return;
    const norm = l => (l || '').replace('_', '-').toLowerCase(), ok = v => /^(zh|cmn)/i.test(v.lang) && !/hk|yue|mo/i.test(v.lang);
    const rank = v => { const l = norm(v.lang); return l.includes('tw') || l.includes('hant') ? 0 : l.includes('cn') || l.includes('hans') ? 1 : 2; };
    const zh = SS.getVoices().filter(ok).sort((a, b) => rank(a) - rank(b)), male = zh.find(v => /zhiwei|male|男|yunyang|yunxi/i.test(v.name));
    const a = zh[0] || null, b = male && male !== a ? male : (zh.find(v => v !== a && rank(v) === rank(a)) || zh.find(v => v !== a) || a);
    voices = { pbp: a, color: b };
  }
  if (SS) { pickVoices(); if (SS.addEventListener) SS.addEventListener('voiceschanged', pickVoices); }

  function speakText(job, done) {
    if (!SS) return done();
    const u = new SpeechSynthesisUtterance(speakable(job.text)), v = voices[job.speaker], same = voices.pbp === voices.color || !v, cast = CAST[job.speaker] || CAST.pbp;
    u.lang = LANG; if (v) u.voice = v; u.rate = cast.rate; u.pitch = same ? cast.pitch : 1;
    u.onend = u.onerror = done; current = { stop: () => SS.cancel() }; SS.speak(u);
  }
  function playAudio(job, done) {
    const a = new Audio(audioBase + job.audio); let settled = false;
    const finish = fallback => { if (settled) return; settled = true; fallback ? speakText(job, done) : done(); };
    a.onended = () => finish(false); a.onerror = () => finish(true);
    current = { stop: () => { settled = true; a.pause(); } };
    a.play().catch(() => finish(true));
  }
  function next() {
    if (busy || !queue.length) return;
    busy = true; const job = queue.shift(), gen = generation;
    const done = () => { if (gen !== generation) return; busy = false; current = null; next(); };
    if (!speakable(job.text).trim() && !job.audio) return done();
    job.audio ? playAudio(job, done) : speakText(job, done);
  }
  return {
    get available() { return !!SS; },
    hasMandarin: () => { pickVoices(); return !!voices.pbp; },
    /* speaker: 'pbp' | 'color'. urgent: drop whatever is queued and say this now. */
    say(speaker, text, { urgent = false, audio = null } = {}) {
      if (urgent) this.stop(); else if (queue.length >= MAX_QUEUE) return;
      queue.push({ speaker, text, audio }); next();
    },
    stop() { generation++; queue = []; busy = false; if (current) current.stop(); current = null; if (SS) SS.cancel(); },
  };
}
