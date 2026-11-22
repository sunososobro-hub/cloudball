/* GET /api/agent/draw?n=0: the n-th name drawn for this agent (#179). See functions/lib/agents.js. */
import { draw, methodNotAllowed } from '../../lib/agents.js';
export const onRequestGet = draw;
export const onRequest = methodNotAllowed('GET');
