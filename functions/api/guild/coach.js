/* POST /api/guild/coach (#800 part 3): the 領隊 hands over the 總教練 seat. See functions/lib/guild.js. */
import { coach, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = coach;
export const onRequest = methodNotAllowed('POST');
