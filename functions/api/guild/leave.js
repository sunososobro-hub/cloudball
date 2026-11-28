/* POST /api/guild/leave (#800 part 2). See functions/lib/guild.js. */
import { leave, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = leave;
export const onRequest = methodNotAllowed('POST');
