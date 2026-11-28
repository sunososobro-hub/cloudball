/* Raster share cards for /g/<season>-<id> (#591 part 2). Crawlers such as Facebook ignore an SVG og:image, so every ordered
 * matchup (away-home) gets a PNG of the same card the function draws at ?card=1, without the date (the date is in
 * og:description). Teams and colours only: the card never sees a game record, so it cannot carry a score.
 * Code-generated (MIT): cardSvg() from functions/g/[id].js, rasterised by headless Chromium (Playwright, dev only).
 * Run after a team name or colour changes: node tools/og_cards.mjs  -> assets/og/<away id>-<home id>.png + generic.png */
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync } from 'node:fs';
import { TEAMS } from '../league/teams.js';
import { cardSvg, cardFile } from '../functions/g/[id].js';

const { chromium } = createRequire(import.meta.url)('playwright');
const OUT = new URL('../assets/og/', import.meta.url);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const shoot = async (m, file) => {
  await page.setContent(`<html><body style="margin:0">${cardSvg(m)}</body></html>`);
  writeFileSync(new URL(file, OUT), await page.screenshot({ clip: { x: 0, y: 0, width: 1200, height: 630 } }));
};
for (const away of TEAMS) for (const home of TEAMS) if (away !== home) await shoot({ away, home, date: '' }, cardFile({ away, home }));
await shoot(null, cardFile(null));
await browser.close();
console.log(`og_cards: ${TEAMS.length * (TEAMS.length - 1) + 1} cards in assets/og/`);
