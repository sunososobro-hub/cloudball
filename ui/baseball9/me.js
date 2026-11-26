/* 九宮格棒球: the fan's own player (#563 part 4). Read-only GET of the public /api/freeagents pages (the same ones index.html reads)
 * to find his row; the practice result is never sent (screen.js keeps it in localStorage). No answer, a bad answer or no row -> null. */
import { meSpecOf } from './field3d.js';

export const FA_PAGES = 5;
export async function findMe(id, get = globalThis.fetch) {
  if (id == null || id === '' || typeof get !== 'function') return null;
  for (let pg = 0; pg < FA_PAGES; pg++) {
    let r = null; try { const res = await get(`/api/freeagents?sort=new&page=${pg}`, { cache: 'no-store' }); r = res && res.ok ? await res.json() : null; } catch (e) { r = null; }
    if (!r || !Array.isArray(r.players)) return null;
    const s = meSpecOf(r.players, id); if (s) return s; if (!r.more) return null;
  }
  return null;
}
