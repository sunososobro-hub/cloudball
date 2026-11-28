/* The engine commit 友誼賽 share links pin (#751 part 2). Pure data. A pinned commit never goes stale for correctness: that commit's
 * engine plays the same game byte for byte for ever (rule 11), jsDelivr serves it. Refresh after an engine change (the starter lists
 * the picker offers come from the page's rosters, so a pin older than a roster change can disagree): `node league/tools/engine_pin.mjs --write`.
 * The commit is the last one that touched engine/ (pushed), not HEAD, so this file's own commit never has to be its own pin. */
export const ENGINE_PIN = { commit: '843c7911f47082ea0aa0c28782d9136f5bd9ea47', version: '0.4.32' };
