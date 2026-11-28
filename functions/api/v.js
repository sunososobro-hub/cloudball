/* POST /api/v: one anonymous viewing milestone from ui/stats.js (#89).
 * Stored in a Workers Analytics Engine dataset through the Pages binding VIEWS (free tier, no table to create).
 * We read nothing from the request except the small JSON body and the host name: no IP, no user agent, no cookie.
 * Always answers 204, even when the binding is missing, so a missing binding never shows up on the page.
 * Column layout (ui/stats-report.mjs reads the same positions):
 *   blob1 site (production | dev) · blob2 event · blob3 visit id · blob4 seed (hex)
 *   double1 n (inning number, speed, 1 = entered with sound, or for 'summary' the last inning reached by playing) · double2 seconds watched since enter · double3 seconds on page
 *   double4 game_end reached (summary) · double5 sound on (summary) · double6 top fast-forward speed (summary)
 * 'summary' (#805) is the one event a page sends when it is first hidden, replacing inning / game_end / sound_on / fast_forward / leave; old rows still read. */
const EVENTS = new Set(['view', 'enter', 'sound_on', 'inning', 'game_end', 'fast_forward', 'leave', 'summary']);
const MAIN = 'cloudball-3uy.pages.dev';
const num = (v, max) => (Number.isFinite(v) && v >= 0 && v <= max ? Math.round(v) : 0);

export async function onRequestPost({ request, env }) {
  try {
    if (!env.VIEWS) return new Response(null, { status: 204 });
    const raw = await request.text();
    if (raw.length > 400) return new Response(null, { status: 204 });
    const d = JSON.parse(raw);
    const id = String(d.id || ''), e = String(d.e || ''), s = String(d.s || '');
    if (!/^[0-9a-f]{12}$/.test(id) || !EVENTS.has(e) || !/^[0-9a-f]{0,8}$/.test(s)) return new Response(null, { status: 204 });
    const host = new URL(request.url).hostname;
    const site = host === MAIN || !host.endsWith('.' + MAIN) ? 'production' : 'dev';
    env.VIEWS.writeDataPoint({
      indexes: [id],
      blobs: [site, e, id, s],
      doubles: [num(Number(d.n), 99), num(Number(d.w), 86400), num(Number(d.p), 86400), num(Number(d.g), 1), num(Number(d.a), 1), num(Number(d.f), 99)],
    });
  } catch (err) { /* nothing to tell the visitor */ }
  return new Response(null, { status: 204 });
}
export const onRequest = () => new Response(null, { status: 405, headers: { Allow: 'POST' } });
