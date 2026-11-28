/* Guild -> engine roster (#809 part 3). Pure: no clock, no randomness, no engine, no network, no storage (rule 10). Never official (rule 24).
 *
 * The nightly export carries only public data per member: { player: { name, kind, ovr, pos } } (no ability split, no agent id). The rule:
 *   - the guild plays as its `base` team: the 一軍 roster it is given ({ bat, pit, bench }, league/site_roster.js shape);
 *   - each member with a player takes a seat of that roster, in export order; the NPC of the seat leaves, the bench is untouched;
 *   - a batter takes the lineup seat of his position (`pos`), else the last lineup seat still held by an NPC, and plays that seat's position;
 *     a second batter of one position takes the next free seat from the end;
 *   - a pitcher with `pos` SP takes the next free starter seat, any other pitcher the next free bullpen seat (then any free seat); he keeps that seat's role;
 *   - a member who finds no free seat sits out (his lines are empty);
 *   - his abilities: every ability is his overall (a flat profile; the export has no split), age AGE, pot POT, bats / throws R, a number from 90 up;
 *   - a name that is already on the roster gets `·<n>` (lines are keyed by name).
 * guildRoster(guild, base) -> { roster, names, agents }: the new roster, the member names that play (the ones whose lines count), and
 *   agents = { <roster name>: tactics } of the seated members whose player carries `tactics` (#795 part 4b: his frozen 經紀人 set, for simGame opts.agents). */
import { sitePlayer } from './site_roster.js';

export const MEMBER_AGE = 26, MEMBER_POT = 50, MEMBER_NUM_FROM = 90;
const clampOvr = n => Math.min(100, Math.max(1, Math.round(Number(n) || 1)));

export function guildRoster(guild, base) {
  const bat = base.bat.slice(), pit = base.pit.slice(), taken = new Set(), names = [], agents = {};
  const used = new Set([...base.bat, ...base.pit, ...(base.bench || [])].map(p => p.name));
  const free = (list, tag) => i => i >= 0 && i < list.length && !taken.has(tag + i);
  const lastFree = (list, tag) => { for (let i = list.length - 1; i >= 0; i--) if (!taken.has(tag + i)) return i; return -1; };
  const nSP = pit.filter(p => p.role === 'SP').length;
  const nameOf = (name, n) => { let nm = String(name), k = 1; while (used.has(nm)) nm = `${name}·${++k}`; used.add(nm); return nm; };
  (guild.members || []).forEach((m, n) => {
    const p = m && m.player;
    if (!p) return;
    const ovr = clampOvr(p.ovr), common = { age: MEMBER_AGE, num: MEMBER_NUM_FROM + n, hand: 'R' };
    if (p.kind === 'pit') {
      let i = -1;
      if (p.pos === 'SP') for (let k = 0; k < nSP && i < 0; k++) if (free(pit, 'p')(k)) i = k;
      if (i < 0) for (let k = nSP; k < pit.length && i < 0; k++) if (free(pit, 'p')(k)) i = k;
      if (i < 0) i = lastFree(pit, 'p');
      if (i < 0) return;
      taken.add('p' + i);
      const name = nameOf(p.name, n);
      pit[i] = sitePlayer(`${guild.id}:${n}`, { ...common, name, role: 'P', pos: pit[i].role, abilities: { stuff: ovr, ctrl: ovr, arm: ovr, pot: MEMBER_POT } });
      names.push(name);
      if (p.tactics) agents[name] = p.tactics;
    } else {
      let i = bat.findIndex((b, k) => b.pos === p.pos && !taken.has('b' + k));
      if (i < 0) i = lastFree(bat, 'b');
      if (i < 0) return;
      taken.add('b' + i);
      const name = nameOf(p.name, n);
      bat[i] = sitePlayer(`${guild.id}:${n}`, { ...common, name, role: 'B', pos: bat[i].pos, abilities: { con: ovr, pow: ovr, eye: ovr, spd: ovr, arm: ovr, pot: MEMBER_POT } });
      names.push(name);
      if (p.tactics) agents[name] = p.tactics;
    }
  });
  return { roster: { ...base, bat, pit }, names, agents };
}
