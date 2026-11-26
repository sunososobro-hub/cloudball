/* POST /api/player/release: this agent lets his player go (#435). See functions/lib/agents.js. */
import { release, methodNotAllowed } from '../../lib/agents.js';
export const onRequestPost = release;
export const onRequest = methodNotAllowed('POST');
