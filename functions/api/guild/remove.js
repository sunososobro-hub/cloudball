/* POST /api/guild/remove (#800 part 2). See functions/lib/guild.js. */
import { remove, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = remove;
export const onRequest = methodNotAllowed('POST');
