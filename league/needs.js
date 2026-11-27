/* Team needs board (#431): where the league is short, read from the real roster data (league/site/players.json).
 * Pure and display-only (rule 10): nothing here changes ROSTERS, a game or where a created player goes.
 * `players` = the object league/site/players.json holds ({ id: { team, tier, role, pos, overall, abilities } }).
 * Starters = 一軍 (tier 1). "Short" is relative to the league, never to a typed number. */
import { ratingsOf } from './ratings.js';

export const FIRST_TIER = 1;
export const BAT_POSITIONS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
export const PIT_ROLES = ['SP', 'MR', 'RP', 'CL'];
export const BAT_KEYS = ['con', 'pow', 'eye', 'spd'];
export const PIT_KEYS = ['stuff', 'ctrl', 'arm'];
export const TAG_MIN_TEAMS = 3;   /* an ability gets a tag when at least this many teams are below the league median */
export const WORD = { con: '安打', pow: '長打', eye: '選球', spd: '速度', stuff: '球威', ctrl: '控球', arm: '臂力' };
export const RBI_NOTE = '打點是比賽的結果，不是能力：想多打點，就練長打和安打。';

export const median = a => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = a => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : 0);

const starters = players => Object.values(players || {}).filter(p => p && p.team && p.tier === FIRST_TIER && p.abilities);
const isPit = p => p.role === 'P';

/* needsOf(players) -> {
 *   teams: [id],
 *   pos:  { C: { <team>: { count, best } }, ... }   batters by position, then pitchers by SP / MR / RP / CL (same shape)
 *   shortSlots: { C: n teams short, ... }           short = no starter, or best overall below the league median of the bests
 *   abilities: { con: { median, teams: { <team>: { avg, gap } }, short: n }, ... }   gap = median - team average (> 0 = short)
 * } */
export function needsOf(players) {
  const all = starters(players), teams = [...new Set(all.map(p => p.team))].sort();
  const pos = {}, shortSlots = {};
  for (const slot of [...BAT_POSITIONS, ...PIT_ROLES]) {
    const here = all.filter(p => p.pos === slot);
    pos[slot] = Object.fromEntries(teams.map(t => {
      const mine = here.filter(p => p.team === t);
      return [t, { count: mine.length, best: mine.length ? Math.max(...mine.map(p => p.overall)) : 0 }];
    }));
    const mid = median(teams.map(t => pos[slot][t].best));
    shortSlots[slot] = teams.filter(t => pos[slot][t].count === 0 || pos[slot][t].best < mid).length;
  }
  const abilities = {};
  for (const [pit, keys] of [[false, BAT_KEYS], [true, PIT_KEYS]]) {
    const group = all.filter(p => isPit(p) === pit);
    for (const k of keys) {
      const med = median(group.map(p => p.abilities[k]));
      const per = Object.fromEntries(teams.map(t => {
        const avg = mean(group.filter(p => p.team === t).map(p => p.abilities[k]));
        return [t, { avg, gap: med - avg }];
      }));
      abilities[k] = { median: med, teams: per, short: teams.filter(t => per[t].gap > 0).length };
    }
  }
  return { teams, pos, shortSlots, abilities };
}

/* the weakest starter at a position or role (lowest overall in the league), or null when nobody starts there */
export function weakestStarter(players, slot) {
  const here = starters(players).filter(p => p.pos === slot);
  if (!here.length) return null;
  return here.reduce((w, p) => (p.overall < w.overall ? p : w));
}

/* the overall his points read as: display points are his ratings (freeagents.check), so this is the number the roster will show */
export function overallOfPoints(kind, points) {
  const pit = kind === 'pit', keys = pit ? PIT_KEYS : [...BAT_KEYS, 'arm'], raw = pit ? { role: 'SP' } : {};
  for (const k of keys) raw[k] = ratingsOf.raw(pit, k, points[k]);
  return ratingsOf(raw).ovr;
}

/* the three lines the creation page shows (plain text, Traditional Chinese) */
export const slotLine = (needs, slot) => {
  const n = needs.shortSlots[slot] ?? 0;
  return n ? `${n} 隊在這個位置偏弱（一軍沒人，或最好的人低於聯盟中位數）。` : '這個位置各隊都不缺。';
};
export const abilityTag = (needs, key) => {
  const a = needs.abilities[key];
  return a && a.short >= TAG_MIN_TEAMS ? `${a.short} 隊的${WORD[key]}低於聯盟中位數` : '';
};
export function compareLine(players, choice) {
  const slot = choice.kind === 'bat' ? choice.pos : choice.role, w = weakestStarter(players, slot);
  if (!w) return `一軍沒有人守這個位置，你的球員會是第一個。`;
  const mine = overallOfPoints(choice.kind, choice.points), d = mine - w.overall;
  return `你現在的點數綜合 ${mine}；這個位置一軍最弱的先發是 ${w.name}（${w.overall}），${d >= 0 ? `你高 ${d}` : `你低 ${-d}`}。`;
}
