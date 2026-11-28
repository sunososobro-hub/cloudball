/* POST /api/guild/lineup (#800 part 3): the 總教練 saves the lineup. See functions/lib/guild.js. */
import { lineup, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = lineup;
export const onRequest = methodNotAllowed('POST');
