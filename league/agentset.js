/* #795 part 1: 經紀人 settings (agent set), pure data. No RNG draw, no Math.random / Date, no engine import.
 * A fan plays ONE player and that player's agent. The agent set is a small table, situations x frequencies, for that
 * player's own at-bats (kind 'bat') or pitching (kind 'pit'); team-level choices are out of scope (owner, #795).
 * - Each cell is a frequency LEVEL 0..LEVEL_MAX; LEVEL_NEUTRAL means "the engine's own decision, as today".
 *   The engine (part 2) maps a level to a multiplier on its own probability with named constants; at LEVEL_NEUTRAL
 *   the multiplier is 1 and no extra RNG draw happens, so a default set reproduces today's games byte for byte.
 * - Rows: 'normal' is the default row; every other row inherits each cell of the 'normal' row unless the set gives it.
 * - Price: one points pool per kind (AGENT_POOL). The cost is the sum of the levels of the RESOLVED grid (all
 *   SITUATIONS x FREQS, after inheritance), so more frequency in one place costs another, and raising the 'normal'
 *   row costs once per row that inherits it. The all-neutral grid spends exactly the pool.
 * Stored shape (v1): { v: 1, kind: 'bat' | 'pit', rows: { <situation>: { <freq>: level } } } (rows and cells optional).
 * Frozen into a game at its lock (part 4) with freezeSet: the canonical form, cells equal to what they inherit dropped. */
export const AGENT_SET_VERSION = 1;
export const KINDS = ['bat', 'pit'];
export const NORMAL = 'normal';
/* situation rows per kind; situationOf says which one applies to a pitch */
export const SITUATIONS = {
  bat: [NORMAL, 'runners_on', 'two_outs', 'late_close'],
  pit: [NORMAL, 'runners_on', 'risp', 'late_close'],
};
/* frequencies per kind (owner list, #795 2026-11-28 15:43):
 * bat: swing early, steal, bunt; pit: fastball share, pitch to the edges (walks for strikeouts), pickoff */
export const FREQS = {
  bat: ['swing_early', 'steal', 'bunt'],
  pit: ['fastball', 'edges', 'pickoff'],
};
/* display labels (game content, Chinese allowed: rule 21) */
export const LABELS = {
  normal: '一般', runners_on: '壘上有人', two_outs: '兩出局', late_close: '後段緊咬', risp: '得點圈有人',
  swing_early: '早打', steal: '盜壘', bunt: '觸擊', fastball: '直球比例', edges: '攻邊角', pickoff: '牽制',
};
export const LEVEL_MIN = 0;
export const LEVEL_MAX = 4;
export const LEVEL_NEUTRAL = 2;
/* points pool per kind = the all-neutral grid (4 situations x 3 frequencies x LEVEL_NEUTRAL) */
export const AGENT_POOL = {
  bat: SITUATIONS.bat.length * FREQS.bat.length * LEVEL_NEUTRAL,
  pit: SITUATIONS.pit.length * FREQS.pit.length * LEVEL_NEUTRAL,
};
/* situation buckets for the engine (part 2): late = this inning or later, close = |run margin| <= CLOSE_MARGIN for a
 * batter; for a pitcher the save situation: his side ahead by 1..SAVE_LEAD (or tied) */
export const LATE_INNING = 8;
export const CLOSE_MARGIN = 1;
export const SAVE_LEAD = 3;

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const isLevel = x => Number.isInteger(x) && x >= LEVEL_MIN && x <= LEVEL_MAX;

export const defaultSet = kind => ({ v: AGENT_SET_VERSION, kind, rows: {} });

/* list of problems (English), empty when the set is valid and within the pool */
export function validateSet(set) {
  const w = [];
  if (!isObj(set)) return ['agent set is not an object'];
  if (set.v !== AGENT_SET_VERSION) w.push(`version ${JSON.stringify(set.v)} is not ${AGENT_SET_VERSION}`);
  if (!KINDS.includes(set.kind)) return [...w, `kind ${JSON.stringify(set.kind)} is not bat or pit`];
  for (const k of Object.keys(set)) if (!['v', 'kind', 'rows'].includes(k)) w.push(`unknown field ${k}`);
  const rows = set.rows === undefined ? {} : set.rows;
  if (!isObj(rows)) return [...w, 'rows is not an object'];
  const sits = SITUATIONS[set.kind], freqs = FREQS[set.kind];
  for (const [s, row] of Object.entries(rows)) {
    if (!sits.includes(s)) { w.push(`unknown ${set.kind} situation ${s}`); continue; }
    if (!isObj(row)) { w.push(`row ${s} is not an object`); continue; }
    for (const [f, lv] of Object.entries(row)) {
      if (!freqs.includes(f)) w.push(`unknown ${set.kind} frequency ${f} in ${s}`);
      else if (!isLevel(lv)) w.push(`${s}.${f} = ${JSON.stringify(lv)} is not an integer ${LEVEL_MIN}..${LEVEL_MAX}`);
    }
  }
  if (w.length) return w;
  const used = pointsUsed(set), pool = AGENT_POOL[set.kind];
  if (used > pool) w.push(`uses ${used} agent points, the pool is ${pool}`);
  return w;
}

/* the full grid after inheritance: { <situation>: { <freq>: level } }; assumes the set passed validateSet
 * (a missing or invalid set resolves to the all-neutral grid of `kind`) */
export function resolveSet(set, kind = set && set.kind) {
  const k = KINDS.includes(kind) ? kind : 'bat';
  const rows = set && isObj(set.rows) && set.kind === k ? set.rows : {};
  const normal = {};
  for (const f of FREQS[k]) normal[f] = isLevel(rows[NORMAL] && rows[NORMAL][f]) ? rows[NORMAL][f] : LEVEL_NEUTRAL;
  const grid = {};
  for (const s of SITUATIONS[k]) {
    grid[s] = {};
    for (const f of FREQS[k]) grid[s][f] = s !== NORMAL && isLevel(rows[s] && rows[s][f]) ? rows[s][f] : normal[f];
  }
  return grid;
}

export const levelOf = (set, situation, freq) => {
  const g = resolveSet(set);
  return g[situation] && g[situation][freq] !== undefined ? g[situation][freq] : LEVEL_NEUTRAL;
};

export function pointsUsed(set) {
  const g = resolveSet(set);
  let n = 0;
  for (const s of Object.keys(g)) for (const f of Object.keys(g[s])) n += g[s][f];
  return n;
}
export const pointsLeft = set => AGENT_POOL[set.kind] - pointsUsed(set);

/* true when every resolved cell is LEVEL_NEUTRAL: the engine must play exactly today's game */
export function isNeutral(set) {
  const g = resolveSet(set);
  return Object.values(g).every(row => Object.values(row).every(lv => lv === LEVEL_NEUTRAL));
}

/* canonical form for storage and the game lock: same resolved grid -> same JSON string.
 * 'normal' keeps only cells off LEVEL_NEUTRAL; other rows keep only cells off what they inherit; empty rows dropped. */
export function freezeSet(set) {
  const g = resolveSet(set), k = set.kind, rows = {};
  for (const s of SITUATIONS[k]) {
    const row = {};
    for (const f of FREQS[k]) {
      const base = s === NORMAL ? LEVEL_NEUTRAL : g[NORMAL][f];
      if (g[s][f] !== base) row[f] = g[s][f];
    }
    if (Object.keys(row).length) rows[s] = row;
  }
  return { v: AGENT_SET_VERSION, kind: k, rows };
}

/* which situation row applies. st: { inning, outs, bases: [first, second, third] truthy when occupied,
 * margin: runs of the player's side minus the other side }. Priority: late_close, then two_outs (bat) / risp (pit),
 * then runners_on, else normal. */
export function situationOf(kind, st) {
  const bases = (st && st.bases) || [], margin = (st && st.margin) || 0, inning = (st && st.inning) || 1;
  const late = inning >= LATE_INNING;
  if (kind === 'pit') {
    if (late && margin >= 0 && margin <= SAVE_LEAD) return 'late_close';
    if (bases[1] || bases[2]) return 'risp';
    if (bases[0]) return 'runners_on';
    return NORMAL;
  }
  if (late && Math.abs(margin) <= CLOSE_MARGIN) return 'late_close';
  if ((st && st.outs) === 2) return 'two_outs';
  if (bases[0] || bases[1] || bases[2]) return 'runners_on';
  return NORMAL;
}
