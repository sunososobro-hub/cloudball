/* 練習賽 with a guild lineup (#800 part 7, #810). Pure: no clock, no randomness, no DOM, no network, no storage, no engine import (rules 10, 11).
 * Never official (rule 24): nothing here reads or writes the ledger, standings, line shards or any player's stats.
 *
 * The guild plays as its `base` team (league/guild_roster.js: each member takes a seat of that team's 一軍) against an NPC team. The members are
 * frozen into the share link, so a friend needs no account and no server row, and the same link plays the same game (rule 11):
 *   play.html?x=<away>-<home>-<awaySP>-<homeSP>-<seed>&e=<engine commit>&m=<side>~<member>~<member>...
 *   side    which side the guild is: 0 away, 1 home (the base team index is that side's team of `x`)
 *   member  <kind>.<pos>.<ovr>.<name>   kind b|p, pos 1B..DH or SP|RP, ovr 1..100 (display), name 1..12 plain characters
 *
 *   MEMBERS_MAX                       members one link may carry
 *   memberParam(list) / parseMembers(s)   text <-> { side, members: [{ player: { name, kind, ovr, pos } }] } (null when it does not fit)
 *   guildProblem(g)                   named reason why a guild side is not playable, or null
 *   guildRosters(g, a, base)          `base` (the engine's ROSTERS) with the guild's side swapped for guildRoster(...); other teams are the same objects
 *   guildShare(a, g, commit, base)    the 友誼賽 share link (league/friendly.js) + `m=`
 *   practiceMembers(view)             the members of a guild page view ({ player } rows) as link members: only his own players, pitchers other than SP are RP, at most MEMBERS_MAX
 *   practiceLink({ members, base, opp, sp, seed, commit, page })   the link of a guild's practice game: the guild is the HOME side on team index `base`, `opp` is the NPC team, `sp` the guild's starter place 0..4; { link } or { problem }
 *   guildPlay(x, m, base)             for play.html: { status: 'none' (no m) | 'invalid' | 'ok', reason, rosters, team } (rosters = guildRosters; team = the side's team index to patch into the viewer's ENGINE.ROSTERS)
 *   guildOpening(s, m, engine, base)  friendlyOpening with the guild's rosters: { status, reason, opening, names } (names = members who found a seat) */
import { friendlyShare, friendlyProblem, parseFriendly, friendlyOpening } from './friendly.js';
import { guildRoster } from './guild_roster.js';

export const MEMBERS_MAX = 9;
const NAME_RE = /^[^.~\u0000-\u001f<>&"'\\]{1,12}$/u;
const POS_BAT = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'], POS_PIT = ['SP', 'RP'];

export function guildProblem(g) {
  if (!g || typeof g !== 'object') return 'no guild';
  if (g.side !== 0 && g.side !== 1) return 'guild side is not 0 or 1';
  if (!Array.isArray(g.members) || g.members.length < 1 || g.members.length > MEMBERS_MAX) return `guild has not 1..${MEMBERS_MAX} members`;
  for (const m of g.members) {
    const p = m && m.player;
    if (!p) return 'member has no player';
    if (p.kind !== 'bat' && p.kind !== 'pit') return 'member kind is not bat or pit';
    if (!(p.kind === 'pit' ? POS_PIT : POS_BAT).includes(p.pos)) return `member position ${p.pos} does not fit his kind`;
    if (!Number.isInteger(p.ovr) || p.ovr < 1 || p.ovr > 100) return 'member overall is not 1..100';
    if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) return 'member name is not 1..12 plain characters';
  }
  return null;
}

export function memberParam(g) {
  const why = guildProblem(g);
  if (why) throw new Error(why);
  return [g.side, ...g.members.map(m => `${m.player.kind === 'pit' ? 'p' : 'b'}.${m.player.pos}.${m.player.ovr}.${m.player.name}`)].join('~');
}

export function parseMembers(s) {
  if (typeof s !== 'string') return null;
  const f = s.split('~');
  if (!/^[01]$/.test(f[0]) || f.length < 2 || f.length > MEMBERS_MAX + 1) return null;
  const members = [];
  for (const t of f.slice(1)) {
    const m = /^([bp])\.([A-Z0-9]{2,2})\.([0-9]{1,3})\.(.+)$/u.exec(t);
    if (!m) return null;
    members.push({ player: { name: m[4], kind: m[1] === 'p' ? 'pit' : 'bat', pos: m[2], ovr: Number(m[3]) } });
  }
  const g = { side: Number(f[0]), members };
  return guildProblem(g) ? null : g;
}

export function practiceMembers(view) {
  const out = [];
  for (const m of (view && view.members) || []) {
    const p = m && m.player;
    if (!p || out.length >= MEMBERS_MAX) continue;
    const pos = p.kind === 'pit' ? (p.pos === 'SP' ? 'SP' : 'RP') : p.pos;
    const one = { player: { name: p.name, kind: p.kind, pos, ovr: p.ovr } };
    if (!guildProblem({ side: 1, members: [one] })) out.push(one);
  }
  return out;
}

export function practiceLink({ members, base, opp, sp = 0, seed, commit, page = 'play.html' }) {
  const a = { away: opp, home: base, sp: [0, sp], seed }, g = { side: 1, members };
  const why = friendlyProblem(a) || guildProblem(g);
  if (why) return { problem: why };
  return { link: guildShare(a, g, commit, page) };
}

export const guildTeam = (g, a) => (g.side === 0 ? a.away : a.home);

export function guildRosters(g, a, base) {
  const t = guildTeam(g, a);
  if (!base[t]) throw new Error(`no team ${t}`);
  const { roster, names } = guildRoster({ id: `practice-${t}`, members: g.members }, base[t]);
  const out = base.map((r, i) => (i === t ? roster : r));
  out.names = names;
  return out;
}

export function guildShare(a, g, commit, base = 'play.html') {
  if (a.own) throw new Error('a guild game carries no single own player');
  return `${friendlyShare(a, commit, base)}&m=${encodeURIComponent(memberParam(g))}`;
}

export function guildOpening(s, m, engine, base) {
  const a = parseFriendly(s), g = parseMembers(m);
  if (!a) return { status: 'invalid', reason: 'x is not <away>-<home>-<awaySP>-<homeSP>-<seed>', opening: null, names: [] };
  const why = friendlyProblem(a) || (g ? null : 'm is not <side>~<member>...');
  if (why) return { status: 'invalid', reason: why, opening: null, names: [] };
  let rosters;
  try { rosters = guildRosters(g, a, base); } catch (e) { return { status: 'invalid', reason: (e && e.message) || String(e), opening: null, names: [] }; }
  const r = friendlyOpening(s, engine, rosters);
  return { status: r.status, reason: r.reason, opening: r.opening, names: rosters.names };
}

export function guildPlay(x, m, base) {
  if (m === null || m === undefined || m === '') return { status: 'none', reason: null, rosters: undefined, team: -1 };
  const a = parseFriendly(x), g = parseMembers(m);
  const bad = r => ({ status: 'invalid', reason: r, rosters: undefined, team: -1 });
  if (!a) return bad('x is not <away>-<home>-<awaySP>-<homeSP>-<seed>');
  if (a.own) return bad('a guild game carries no single own player');
  const why = friendlyProblem(a) || (g ? null : 'm is not <side>~<member>...');
  if (why) return bad(why);
  try { return { status: 'ok', reason: null, rosters: guildRosters(g, a, base), team: guildTeam(g, a) }; } catch (e) { return bad((e && e.message) || String(e)); }
}
