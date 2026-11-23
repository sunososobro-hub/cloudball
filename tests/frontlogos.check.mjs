/* Front page team logos and the loading screen behind 看重播 (#361):
 * - the 首頁 shows each team's mark (assets/logos/<id>_128.webp small, _512.webp on the team card) as a plain <img> with the team name as alt and a width and height;
 *   a file in assets/logos/ exists for each of the four teams; an id that is not a plain name draws no image;
 * - the 看重播 link on the front page goes to the game page, and that page still holds the 「球場準備中」 loading element (the progress bar) in its own HTML,
 *   so a later change to the front page cannot drop the loading screen before the game starts.
 * Usage: node tests/frontlogos.check.mjs */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { combine, render, replayLink } from '../ui/site-data.js';
import { logoImg } from '../ui/site/shared.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [], bad = m => problems.push(m);
const IDS = ['pheasants', 'owls', 'macaques', 'muntjacs'];

for (const id of IDS) for (const px of [128, 512]) if (!existsSync(path.join(ROOT, `assets/logos/${id}_${px}.webp`))) bad(`assets/logos/${id}_${px}.webp is missing`);

const teams = IDS.map((id, i) => ({ id, name: `隊${i}`, record: { w: 4 - i, l: i }, roster: [] }));
const d = combine({ teams: { season: '0', teams }, players: {}, games: [{ id: 'g', date: '2026-11-22', home: 'owls', away: 'pheasants', score: [2, 1], replay: 'league/preseason/opening.json' }] });
const html = render('home', d);
const imgs = [...html.matchAll(/<img [^>]*>/g)].map(m => m[0]);
for (const id of IDS) {
  const mine = imgs.filter(t => t.includes(`assets/logos/${id}_`));
  if (!mine.some(t => t.includes(`${id}_512.webp`))) bad(`${id}: no big mark on the team card`);
  if (mine.filter(t => t.includes(`${id}_128.webp`)).length < 1) bad(`${id}: no small mark in the standings`);
}
for (const t of imgs) {
  if (!/ alt="[^"]+"/.test(t) || !/ width="\d+"/.test(t) || !/ height="\d+"/.test(t)) bad(`logo without alt, width or height: ${t}`);
  if (/_512\.webp/.test(t) && !/loading="lazy"/.test(t)) bad(`the big team-card mark must load lazily: ${t}`);
}
if (imgs.length !== 4 * 2 + 2) bad(`${imgs.length} logos on the front page, expected 10 (4 cards, 4 standings rows, 2 in the latest-game card)`);
if (logoImg('../evil"', 128, 'lg', 'x') !== '' || logoImg(undefined, 128, 'lg', 'x') !== '') bad('an id that is not a plain name must draw no image');
if (/<img/.test(render('home', combine({ teams: { teams: [{ id: 'a b', name: 'A', record: { w: 0, l: 0 } }] } })))) bad('a team id with a space drew an image');

const link = replayLink('league/preseason/opening.json');
if (!html.includes(`href="${link}">看重播<`)) bad('the front page 看重播 button no longer goes to the replay target');
const target = path.join(ROOT, link);
if (!existsSync(target)) bad(`the replay target ${link} does not exist`);
else {
  const page = readFileSync(target, 'utf8');
  if (!/<div id="warmBar"[^>]*role="progressbar"[^>]*>[\s\S]*?球場準備中/.test(page)) bad(`${link} lost the 球場準備中 loading bar (#warmBar)`);
  if (!/#warmBar\{[^}]*opacity:0/.test(page) || !/animation:wbIn/.test(page)) bad(`${link}: the loading bar is no longer shown by its own CSS`);
}
if (problems.length) { console.error('frontlogos.check FAILED\n - ' + problems.join('\n - ')); process.exit(1); }
console.log('frontlogos.check OK: 10 logos on the front page, 看重播 lands on the page that holds 球場準備中');
