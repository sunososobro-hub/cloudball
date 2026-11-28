/* POST /api/player/place: move this agent's player between 二軍 and 自由市場 (#438). See functions/lib/agents.js. */
import { place, methodNotAllowed } from '../../lib/agents.js';
export const onRequestPost = place;
export const onRequest = methodNotAllowed('POST');
