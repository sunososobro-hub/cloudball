/* GET /api/player/agentset: this agent's player's 經紀人 set; POST: save it (#795 part 4). See functions/lib/agentset_store.js. */
import { getSet, saveSet } from '../../lib/agentset_store.js';
import { methodNotAllowed } from '../../lib/agents.js';
export const onRequestGet = getSet;
export const onRequestPost = saveSet;
export const onRequest = methodNotAllowed('GET, POST');
