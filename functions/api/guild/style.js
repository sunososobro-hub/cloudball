/* POST /api/guild/style (#800 part 8): the 領隊 sets the guild name and colour. See functions/lib/guild.js. */
import { style, methodNotAllowed } from '../../lib/guild.js';
export const onRequestPost = style;
export const onRequest = methodNotAllowed('POST');
