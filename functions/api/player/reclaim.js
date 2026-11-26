/* POST /api/player/reclaim {id}: the former agent takes his released player back (#435). See functions/lib/agents.js. */
import { reclaim, methodNotAllowed } from '../../lib/agents.js';
export const onRequestPost = reclaim;
export const onRequest = methodNotAllowed('POST');
