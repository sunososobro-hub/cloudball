/* Voices for the booth (browser only). A line plays its pre-rendered audio file when it has
 * one. Never two voices in one game (#96): in a game with recorded voice (setRecorded(true)) a
 * line without a file stays silent, and a file that fails to load is skipped, never read by the
 * browser. The browser's own speechSynthesis is only for games with no recorded audio at all.
 * Nothing here calls a paid service. */
/* fan / fan_f: the fan guest in the third seat (a man / a woman), see personas/ */
const CAST = { pbp: { rate: 1.15, pitch: 1.15 }, color: { rate: 0.95, pitch: 0.55 }, fan: { rate: 1.1, pitch: 0.85 }, fan_f: { rate: 1.1, pitch: 1.35 } };
const MAX_QUEUE = 4;
const LANG = 'zh-TW';
const BOOTH_GAIN = 0.9;     /* volume of the recorded booth (clips are normalised to -16 LUFS by tools/synth.mjs) */
export const CROWD_DUCK = 0.4;   /* the crowd bed is multiplied by this while somebody in the booth talks */

/* make on-screen copy speakable (game content rules for the zh-TW voices) */
const speakable = t => t.replace(/(\d+)\s*km\/h/gi, '時速$1公里').replace(/AVG/gi, '打擊率').replace(/\bNP\b/g, '球數').replace(/\b1B\b/g, '一壘安打').replace(/\b2B\b/g, '二壘安打')
  .replace(/\b3B\b/g, '三壘安打').replace(/\bHR\b/g, '全壘打').replace(/\bRBI\b/g, '打點').replace(/[A-Za-z]+/g, '').replace(/(\d)\s*：\s*(\d)/g, '$1比$2').replace(/：/g, '，').replace(/（|）/g, '，').replace(/\s{2,}/g, ' ');

/* onTalk(true / false): somebody starts / stops talking, so the viewer can duck the crowd by CROWD_DUCK */
export function createVoice({ audioBase = 'commentary/', onTalk = null } = {}) {
  const SS = typeof window !== 'undefined' ? window.speechSynthesis : null, HAS_AUDIO = typeof Audio !== 'undefined';
  let voices = { pbp: null, color: null, fan: null, fan_f: null }, queue = [], busy = false, current = null, generation = 0, recorded = false, talking = false;
  const setTalking = on => { if (on === talking) return; talking = on; if (onTalk) onTalk(on); };

  /* prefer Taiwan Mandarin, avoid Cantonese; give the speakers different voices when possible */
  function pickVoices() {
    if (!SS) return;
    const norm = l => (l || '').replace('_', '-').toLowerCase(), ok = v => /^(zh|cmn)/i.test(v.lang) && !/hk|yue|mo/i.test(v.lang);
    const rank = v => { const l = norm(v.lang); return l.includes('tw') || l.includes('hant') ? 0 : l.includes('cn') || l.includes('hans') ? 1 : 2; };
    const zh = SS.getVoices().filter(ok).sort((a, b) => rank(a) - rank(b)), male = zh.find(v => /zhiwei|male|男|yunyang|yunxi/i.test(v.name));
    const a = zh[0] || null, b = male && male !== a ? male : (zh.find(v => v !== a && rank(v) === rank(a)) || zh.find(v => v !== a) || a);
    const third = zh.find(v => v !== a && v !== b) || a, female = zh.find(v => v !== a && v !== b && /female|女|hanhan|yating|hsiaochen|hsiaoyu|meijia/i.test(v.name));
    voices = { pbp: a, color: b, fan: third, fan_f: female || third };
  }
  if (SS) { pickVoices(); if (SS.addEventListener) SS.addEventListener('voiceschanged', pickVoices); }

  function speakText(job, done) {
    if (!SS) return done();
    const key = CAST[job.cast] ? job.cast : job.speaker, v = voices[key] || voices.pbp, cast = CAST[key] || CAST.pbp;
    const u = new SpeechSynthesisUtterance(speakable(job.text)), same = !v || Object.entries(voices).some(([k, o]) => k !== key && o === v);
    u.lang = LANG; if (v) u.voice = v; u.rate = cast.rate; u.pitch = same ? cast.pitch : 1;
    u.onend = u.onerror = done; current = { stop: () => SS.cancel() }; SS.speak(u);
  }
  function playAudio(job, done) {
    const a = new Audio(audioBase + job.audio); let settled = false;
    const finish = () => { if (settled) return; settled = true; done(); };   /* a failed file is skipped: no browser voice in its place */
    a.volume = BOOTH_GAIN; a.onended = a.onerror = finish;
    current = { stop: () => { settled = true; a.pause(); } };
    a.play().catch(finish);
  }
  function next() {
    if (busy || !queue.length) return;
    busy = true; const job = queue.shift(), gen = generation;
    const done = () => { if (gen !== generation) return; busy = false; current = null; if (!queue.length) setTalking(false); next(); };
    if (job.audio ? !HAS_AUDIO : recorded || !speakable(job.text).trim()) return done();
    setTalking(true);
    job.audio ? playAudio(job, done) : speakText(job, done);
  }
  return {
    get available() { return !!SS || HAS_AUDIO; },
    get talking() { return talking; },
    /* true for a game with recorded voice: lines without a file stay silent (never the browser voice) */
    setRecorded(on) { recorded = !!on; },
    hasMandarin: () => { pickVoices(); return !!voices.pbp; },
    /* speaker: 'pbp' | 'color' | 'fan'. urgent: drop whatever is queued and say this now.
     * cast: voice for the fan guest ('fan' or 'fan_f'). aside: part of a fan moment; a new
     * play-by-play call drops queued asides, so the guest never holds up a live call. */
    say(speaker, text, { urgent = false, audio = null, cast = null, aside = speaker === 'fan' } = {}) {
      if (urgent) this.stop();
      else if (speaker === 'pbp' && !aside) queue = queue.filter(j => !j.aside);
      if (queue.length >= MAX_QUEUE) return;
      queue.push({ speaker, text, audio, cast, aside }); next();
    },
    stop() { generation++; queue = []; busy = false; if (current) current.stop(); current = null; if (SS) SS.cancel(); setTalking(false); },
  };
}
