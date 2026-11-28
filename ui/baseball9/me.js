/* 九宮格棒球: the fan's own player (#563 part 4). Read-only GET of the public /api/freeagents pages (the same ones index.html reads)
 * to find his row; the practice result is never sent (screen.js keeps it in localStorage). No answer, a bad answer or no row -> null. */
import { meSpecOf } from './field3d.js';

export const FA_PAGES = 5;
export async function findMe(id, get = globalThis.fetch) {
  if (id == null || id === '' || typeof get !== 'function') return null;
  let after = '';
  for (let pg = 0; pg < FA_PAGES; pg++) {
    let r = null; try { const res = await get(`/api/freeagents?sort=new${after}`, { cache: 'no-store' }); r = res && res.ok ? await res.json() : null; } catch (e) { r = null; }
    if (!r || !Array.isArray(r.players)) return null;
    const s = meSpecOf(r.players, id); if (s) return s; if (!r.more || !r.next) return null; after = `&after=${encodeURIComponent(r.next)}`;
  }
  return null;
}

/* #563 part 6: one lookup per page for both screens (practice and 三局比賽). */
export const PLAYER = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('player');
let meP = null;
export const loadMe = (id = PLAYER, get) => id == null || id === '' ? Promise.resolve(null) : (meP && meP.id === id ? meP.p : (meP = { id, p: findMe(id, get) }).p);
