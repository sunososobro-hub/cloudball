/* POST /api/agent: register this browser's key (#179). See functions/lib/agents.js. */
import { register, methodNotAllowed } from '../lib/agents.js';
export const onRequestPost = register;
export const onRequest = methodNotAllowed('POST');
