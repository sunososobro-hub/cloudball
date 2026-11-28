/* Print or write league/engine_pin.js: the last commit that touched engine/ (must be pushed: jsDelivr serves it) and ENGINE_VERSION.
 *   node league/tools/engine_pin.mjs [--write]      Tool only: it imports the engine and runs git. */
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION } from '../../engine/constants.js';

const file = fileURLToPath(new URL('../engine_pin.js', import.meta.url));
const commit = execSync('git log -1 --format=%H -- engine', { encoding: 'utf8' }).trim();
const text = `/* The engine commit 友誼賽 share links pin (#751 part 2). Pure data. A pinned commit never goes stale for correctness: that commit's
 * engine plays the same game byte for byte for ever (rule 11), jsDelivr serves it. Refresh after an engine change (the starter lists
 * the picker offers come from the page's rosters, so a pin older than a roster change can disagree): \`node league/tools/engine_pin.mjs --write\`.
 * The commit is the last one that touched engine/ (pushed), not HEAD, so this file's own commit never has to be its own pin. */
export const ENGINE_PIN = { commit: '${commit}', version: '${ENGINE_VERSION}' };
`;
if (process.argv.includes('--write')) { writeFileSync(file, text); console.log('wrote', file); } else process.stdout.write(text);
