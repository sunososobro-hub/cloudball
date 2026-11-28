/* POST /api/guild/join (#800 part 2). See functions/lib/guild.js. */
import { join, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = join;
export const onRequest = methodNotAllowed('POST');
