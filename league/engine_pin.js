/* The engine commit 友誼賽 share links pin (#751 part 2). Pure data. A pinned commit never goes stale for correctness: that commit's
 * engine plays the same game byte for byte for ever (rule 11), jsDelivr serves it. Refresh after an engine change (the starter lists
 * the picker offers come from the page's rosters, so a pin older than a roster change can disagree): `node league/tools/engine_pin.mjs --write`.
 * The commit is the last one that touched engine/ (pushed), not HEAD, so this file's own commit never has to be its own pin. */
export const ENGINE_PIN = { commit: '381ea24f9d64911dd05291a8c0acdcdc13bc7019', version: '0.4.41' };
