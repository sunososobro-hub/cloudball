/* GET /api/player: this agent's player; POST /api/player: create him, once (#179). See functions/lib/agents.js. */
import { mine, create, methodNotAllowed } from '../lib/agents.js';
export const onRequestGet = mine;
export const onRequestPost = create;
export const onRequest = methodNotAllowed('GET, POST');
