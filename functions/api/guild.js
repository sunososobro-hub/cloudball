/* GET /api/guild: this agent's guild; POST /api/guild: found one, once (#800). See functions/lib/guild.js. */
import { mine, create, methodNotAllowed } from '../lib/guild.js';
export const onRequestGet = mine;
export const onRequestPost = create;
export const onRequest = methodNotAllowed('GET, POST');
