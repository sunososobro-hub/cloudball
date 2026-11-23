/* GET /api/freeagents: the public list of created players (#179). See functions/lib/agents.js. */
import { list, methodNotAllowed } from '../lib/agents.js';
export const onRequestGet = list;
export const onRequest = methodNotAllowed('GET');
