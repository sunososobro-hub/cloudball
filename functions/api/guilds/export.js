/* GET /api/guilds/export (#809 part 2): all guilds, public data, keyset paged. See functions/lib/guild.js. */
import { exportPage, methodNotAllowed } from '../../lib/guild.js';
export const onRequestGet = exportPage;
export const onRequest = methodNotAllowed('GET');
