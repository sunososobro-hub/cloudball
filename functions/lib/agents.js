/* Fan agents and created free agents, first version of #167 (slice 2, #179). Shared by the routes in functions/api/
 * (agent.js, agent/draw.js, player.js, freeagents.js); this file exports no onRequest, so it is not a route itself.
 * Storage: the D1 binding DB (Preview environment only). No binding, or a production host name: every call answers
 * 503 {"ok":false,"why":"closed"} and the page says 「還沒開放」. Tables are created here when missing.
 * Account: the browser makes a random 32-byte key (64 hex characters) and sends it as `Authorization: Bearer <key>`.
 * The server keeps only SHA-256(key). No password, no e-mail, no cookie.
 * Who counts: the owner's word in #179. Game outcomes are never touched here (rule 10): a created player is a row. */
import { validateCreate, makePlayer, drawName, CREATE, PLACES, DEFAULT_PLACE, isPlace } from '../../league/freeagents.js';
import { releaseInactive, canClaim, FREE_TIER } from '../../league/inactive.js';
import { growTo, viewOf, checkpointOf, CKPT_EVERY } from '../../league/growth.js';

export const DRAW_CAP = 20;               /* name draws 0 .. DRAW_CAP (the first one plus this many redraws) */
export const AGENTS_PER_DAY = 300;        /* new agents per UTC day, in total */
export const AGENTS_PER_ADDRESS_PER_DAY = 3;  /* new agents per UTC day from one address */
export const PAGE_SIZE = 20;
export const MAX_PAGE = 0;                /* #806: the list has no page numbers any more (OFFSET reads every skipped row); `page` must be 0, later pages use `after` */
export const SYSTEM_PER_KIND = 10;        /* 系統 fillers kept per kind until real fans take their places (#437) */
export const SYSTEM_SEED = 437000;        /* filler i of a kind uses seed SYSTEM_SEED + i (+ 500 for pitchers) */
const BODY_MAX = 1000;                    /* characters of a request body */
const PAGES_HOST = 'cloudball-3uy.pages.dev';

/* The same host rule as ui/site.js (tests/agent.check.mjs keeps the two equal): dev = localhost and every subdomain
 * of the Pages project; anything else, the bare Pages host included, is production. */
export const isDev = hostname => {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  return h === '' || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.slice(-(PAGES_HOST.length + 1)) === '.' + PAGES_HOST;
};

export const json = (status, body, headers) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
});
export const fail = (status, why, more) => json(status, { ok: false, why, ...more });
export const methodNotAllowed = allow => () => new Response(null, { status: 405, headers: { Allow: allow } });

const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
export const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];
const randomSalt = () => hex(crypto.getRandomValues(new Uint8Array(16)));
const DAY_MS = 86400000;
const today = () => new Date().toISOString().slice(0, 10);
const KEY = /^Bearer ([0-9a-f]{64})$/;

/* #806: one sort column per ability key (-1 = he has none, a batter has no stuff), kept in step with ovr: written on create and on every growth
 * write-back, so an ability sort reads the grown numbers the list shows (the stored `ratings` stay the creation ones) and each sort has its own index. */
const ABILS = ['con', 'pow', 'eye', 'spd', 'arm', 'stuff', 'ctrl', 'pot'];
const ACOL_DDL = ABILS.map(k => `a_${k} INTEGER NOT NULL DEFAULT -1`).join(', ');
const ACOL_SET = ABILS.map((k, i) => `a_${k} = ?${i + 4}`).join(', ');
const abilsOf = ratings => ABILS.map(k => Number.isFinite(ratings && ratings[k]) ? Math.round(ratings[k]) : -1);
const SORT_INDEXES = [
  'CREATE INDEX IF NOT EXISTS players_ovr2 ON players (ovr DESC, created_at DESC, pid DESC)',
  'CREATE INDEX IF NOT EXISTS players_new2 ON players (created_at DESC, pid DESC)',
  ...ABILS.map(k => `CREATE INDEX IF NOT EXISTS players_a_${k} ON players (a_${k} DESC, ovr DESC, created_at DESC, pid DESC)`),
];
const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS agents (id TEXT PRIMARY KEY, seed INTEGER NOT NULL, created_at INTEGER NOT NULL)',
  `CREATE TABLE IF NOT EXISTS players (agent_id TEXT PRIMARY KEY, pid TEXT NOT NULL, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL,
     ovr INTEGER NOT NULL, player TEXT NOT NULL, ratings TEXT NOT NULL, created_at INTEGER NOT NULL, ${ACOL_DDL})`,
  'CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  /* #435: a released player keeps his row (name, ratings, history); players.agent_id becomes 'free:<pid>' (never a 64-hex agent id)
   and this table remembers the former agent, who alone may take him back while nobody else has */
  'CREATE TABLE IF NOT EXISTS releases (pid TEXT PRIMARY KEY, former TEXT NOT NULL, released_at INTEGER NOT NULL)',
  /* #628 part 2: the last UTC day (whole days since 1970) each agent made a keyed call; day only, no time, no address. The daily sweep reads it. */
  'CREATE TABLE IF NOT EXISTS agent_seen (agent_id TEXT PRIMARY KEY, day INTEGER NOT NULL)',
  /* abuse counters: the day only, never next to an agent; both tables lose every row of an older day on the next sign-up */
  'CREATE TABLE IF NOT EXISTS reg_salt (day TEXT PRIMARY KEY, salt TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS reg_seen (day TEXT NOT NULL, h TEXT NOT NULL)',
  'CREATE INDEX IF NOT EXISTS reg_seen_day ON reg_seen (day, h)',
  /* #800 part 1: a guild (functions/lib/guild.js). leader / coach are agent ids; one guild per fan = guild_members.agent_id is the key */
  `CREATE TABLE IF NOT EXISTS guilds (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, base TEXT NOT NULL, leader TEXT NOT NULL UNIQUE,
     coach TEXT NOT NULL, created_at INTEGER NOT NULL)`,
  'CREATE TABLE IF NOT EXISTS guild_members (agent_id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, joined_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS guild_members_guild ON guild_members (guild_id)',
  /* #800 part 2: the fan's own move counter (caps.js kind 'move'); it outlives the member row, which a leave deletes. One row per fan, made on his first move */
  'CREATE TABLE IF NOT EXISTS guild_fans (agent_id TEXT PRIMARY KEY, moved_day INTEGER NOT NULL DEFAULT 0, moves_today INTEGER NOT NULL DEFAULT 0)',
  /* #808: the fan's own save counter (caps.js kind 'save'), one row per fan, made on his first counted save.
   #795 part 4: `agentset` = his player's 經紀人 set in that same row ({"pid","set"} JSON, functions/lib/agentset_store.js), so a save is one row write */
  'CREATE TABLE IF NOT EXISTS guild_saves (agent_id TEXT PRIMARY KEY, saved_day INTEGER NOT NULL DEFAULT 0, saves_today INTEGER NOT NULL DEFAULT 0, agentset TEXT)',
  /* #800 part 3: the 總教練's saved lineup, one row per guild (guild.js): order = JSON of the nine batting-slot numbers in batting order, sp = rotation slot */
  'CREATE TABLE IF NOT EXISTS guild_lineups (guild_id TEXT PRIMARY KEY, batting TEXT NOT NULL, sp INTEGER NOT NULL, saved_at INTEGER NOT NULL)',
];
/* #437: a 系統 filler is a players row whose agent_id is 'sys:<pid>' (no agent holds it) and whose player JSON has system:true.
 * Even spread of the budget, positions / roles in turn, so nobody is a star; made once, marked in `meta`. */
export const systemChoice = (kind, i) => {
  const keys = CREATE.keys[kind], per = Math.round(CREATE.budget[kind] / keys.length), look = { head: 0, skin: 0, hair: 0 };
  const points = Object.fromEntries(keys.map(k => [k, per])); points[keys[0]] += CREATE.budget[kind] - per * keys.length;
  return kind === 'bat' ? { kind, pos: CREATE.positions[i % CREATE.positions.length], bats: 'R', build: 'normal', look, points }
    : { kind, role: CREATE.roles[i % CREATE.roles.length], throws: 'R', build: 'normal', look, points };
};
const seedSystem = async db => {
  if (await db.prepare("SELECT 1 AS x FROM meta WHERE k = 'system_seeded'").first()) return;
  const steps = [], now = Date.now();
  for (const kind of CREATE.kinds) for (let i = 0; i < SYSTEM_PER_KIND; i++) {
    const { player, ratings } = makePlayer(SYSTEM_SEED + (kind === 'pit' ? 500 : 0) + i, { ...systemChoice(kind, i), nameDraw: 0 });
    steps.push(db.prepare(`INSERT OR IGNORE INTO players (agent_id, pid, name, kind, ovr, player, ratings, created_at, ${ABILS.map(k => `a_${k}`)}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ${ABILS.map((k, i) => `?${i + 9}`)})`)
      .bind('sys:' + player.id, player.id, player.name, kind, ratings.ovr, JSON.stringify({ ...player, system: true }), JSON.stringify(ratings), now - i, ...abilsOf(ratings)));
  }
  steps.push(db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('system_seeded', '1')"));
  await db.batch(steps);
};
const ready = new WeakMap();
/* #806 migration, once per database (meta 'abil_cols'): a table made before has no a_* columns: add them, fill them from the stored ratings, then index */
const migrateAbils = async db => {
  if (!(await db.prepare("SELECT 1 AS x FROM meta WHERE k = 'abil_cols'").first())) {
    const have = new Set(((await db.prepare("SELECT name FROM pragma_table_info('players')").all()).results || []).map(r => r.name));
    const add = ABILS.filter(k => !have.has(`a_${k}`));
    if (add.length) await db.batch(add.map(k => db.prepare(`ALTER TABLE players ADD COLUMN a_${k} INTEGER NOT NULL DEFAULT -1`)));
    await db.prepare(`UPDATE players SET ${ABILS.map(k => `a_${k} = COALESCE(CAST(json_extract(ratings, '$.${k}') AS INTEGER), -1)`).join(', ')}`).run();
    await db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('abil_cols', '1')").run();
  }
  await db.batch(SORT_INDEXES.map(x => db.prepare(x)));
};
/* #795 part 4 migration: a guild_saves table made before has no agentset column */
const migrateSaves = async db => {
  const have = new Set(((await db.prepare("SELECT name FROM pragma_table_info('guild_saves')").all()).results || []).map(r => r.name));
  if (!have.has('agentset')) await db.prepare('ALTER TABLE guild_saves ADD COLUMN agentset TEXT').run();
};
const ensure = db => { if (!ready.has(db)) ready.set(db, db.batch(SCHEMA.map(s => db.prepare(s))).then(() => migrateAbils(db)).then(() => migrateSaves(db)).then(() => seedSystem(db)).catch(e => { ready.delete(db); throw e; })); return ready.get(db); };

/* every handler: closed unless the binding exists on a dev host; one small catch so nothing ever breaks the page */
export const guarded = (handler, { needKey = false } = {}) => async ctx => {
  try {
    const { request, env } = ctx;
    if (!env || !env.DB || !isDev(new URL(request.url).hostname)) return fail(503, 'closed');
    const db = env.DB;
    await ensure(db);
    let agent = null;
    if (needKey) {
      const m = KEY.exec(request.headers.get('authorization') || '');
      if (!m) return fail(401, 'key');
      agent = await db.prepare('SELECT id, seed FROM agents WHERE id = ?1').bind(await sha256(m[1])).first();
      if (!agent) return fail(401, 'unknown');
      await db.prepare('INSERT INTO agent_seen (agent_id, day) VALUES (?1, ?2) ON CONFLICT(agent_id) DO UPDATE SET day = excluded.day WHERE agent_seen.day < excluded.day').bind(agent.id, Math.floor(Date.now() / DAY_MS)).run();
      /* #807: one bounded chunk of the daily sweep per keyed call, never inside a public GET; a failure never reaches the caller */
      const sweep = sweepInactive(db, Date.now()).catch(() => {});
      if (ctx.waitUntil) ctx.waitUntil(sweep); else await sweep;
    }
    return await handler({ ...ctx, db, agent });
  } catch (e) { return fail(500, 'error'); }
};

export const readBody = async request => {
  const raw = await request.text();
  if (raw.length > BODY_MAX) return null;
  try { const v = JSON.parse(raw); return v && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch (e) { return null; }
};

/* POST /api/agent: register the key of this browser (or find it again). No body needed. */
export const register = guarded(async ({ request, db }) => {
  const m = KEY.exec(request.headers.get('authorization') || '');
  if (!m) return fail(400, 'key');
  const id = await sha256(m[1]);
  if (await db.prepare('SELECT 1 AS x FROM agents WHERE id = ?1').bind(id).first()) return json(200, { ok: true, new: false });
  /* the first time the site looks at an address: a salted hash of it, kept for one day in reg_seen, no agent next to it */
  const day = today();
  await db.batch([db.prepare('DELETE FROM reg_seen WHERE day < ?1').bind(day), db.prepare('DELETE FROM reg_salt WHERE day < ?1').bind(day),
    db.prepare('INSERT OR IGNORE INTO reg_salt (day, salt) VALUES (?1, ?2)').bind(day, randomSalt())]);
  const { salt } = await db.prepare('SELECT salt FROM reg_salt WHERE day = ?1').bind(day).first();
  const h = await sha256(`${salt}:${request.headers.get('CF-Connecting-IP') || 'no-address'}`);
  const slot = await db.prepare(`INSERT INTO reg_seen (day, h) SELECT ?1, ?2
    WHERE (SELECT COUNT(*) FROM reg_seen WHERE day = ?1) < ?3 AND (SELECT COUNT(*) FROM reg_seen WHERE day = ?1 AND h = ?2) < ?4`)
    .bind(day, h, AGENTS_PER_DAY, AGENTS_PER_ADDRESS_PER_DAY).run();
  if (!slot.meta.changes) return fail(429, 'limit');
  await db.prepare('INSERT OR IGNORE INTO agents (id, seed, created_at) VALUES (?1, ?2, ?3)').bind(id, randomSeed(), Date.now()).run();
  return json(201, { ok: true, new: true });
});

/* GET /api/agent/draw?n=0..DRAW_CAP: the n-th name drawn for this agent's seed; `taken` when another created player has it */
export const draw = guarded(async ({ request, db, agent }) => {
  const raw = new URL(request.url).searchParams.get('n') ?? '0';
  const n = /^\d{1,3}$/.test(raw) ? Number(raw) : -1;
  if (n < 0 || n > DRAW_CAP) return fail(400, 'cap', { cap: DRAW_CAP });
  const name = drawName(agent.seed >>> 0, n);
  const taken = !!(await db.prepare('SELECT 1 AS x FROM players WHERE name = ?1').bind(name).first());
  return json(200, { ok: true, n, cap: DRAW_CAP, name, taken });
}, { needKey: true });

/* sort keys of the free-agent list: overall, newest, and the ability keys of league/ratings.js (display numbers) */
const SORTS = new Set(['ovr', 'new', 'con', 'pow', 'eye', 'spd', 'arm', 'stuff', 'ctrl', 'pot']);
const FREE = pid => 'free:' + pid;        /* players.agent_id of a released player nobody has picked up */
/* #564: a created player grows lazily. `ratings` in the row stay his creation ratings (the replay base); each read advances them by
 * one training day per whole day since created_at (league/growth.js, seeded from his id and the day, so the same day is the same numbers).
 * player.ckpt = { day, abil } is a checkpoint written back at most every CKPT_EVERY days; it never leaves the server. 系統 fillers do not grow. */
const grow = (r, now) => {
  const player = JSON.parse(r.player), ratings = JSON.parse(r.ratings);
  if (player.system || !player.train) return { player, ratings, save: null };
  const ckpt = player.ckpt || null, s = growTo(player, ratings, Math.max(0, Math.floor((now - r.created_at) / DAY_MS)), ckpt);
  const view = viewOf(player, ratings, s), { ckpt: hidden, ...shown } = view.player;
  /* write back: the day count moved CKPT_EVERY past the stored checkpoint; ovr (the sort column) follows */
  const save = s.day - (ckpt ? ckpt.day : 0) >= CKPT_EVERY ? { pid: r.pid, player: JSON.stringify({ ...player, ckpt: checkpointOf(s) }), ovr: view.ratings.ovr, abils: abilsOf(view.ratings), was: ckpt ? ckpt.day : null } : null;
  return { player: shown, ratings: view.ratings, save };
};
/* #807: only the reader that still sees the checkpoint day it grew from writes (`was` = that day, null = none yet); a concurrent reader finds it moved and writes nothing */
const saveStep = (db, x) => db.prepare(`UPDATE players SET player = ?2, ovr = ?3, ${ACOL_SET} WHERE pid = ?1 AND json_extract(player, '$.ckpt.day') IS ?${ABILS.length + 4}`).bind(x.pid, x.player, x.ovr, ...x.abils, x.was);
const publicRow = (r, now = Date.now(), saves = []) => {
  const g = grow(r, now); if (g.save) saves.push(g.save);
  return { id: r.pid, name: r.name, kind: r.kind, ovr: g.ratings.ovr, player: g.player, ratings: g.ratings, created: r.created_at, free: !!r.free };
};

/* #628 part 2 / #807: the daily sweep of inactive fans. Every fan player whose agent made no keyed call for INACTIVE_DAYS (no row in agent_seen:
 * his created day) is released by league/inactive.js releaseInactive, the same way as `release` below (row stays, agent_id -> free:<pid>,
 * `releases` note, new agent seed). 系統 and already free players are never touched; an empty store is a no-op.
 * It never runs inside a public GET (#807): the keyed calls (`guarded` with needKey) run one chunk each, so a 10 ms request never scans every player.
 * State in `meta`: inactive_swept = last UTC day fully done; inactive_cursor = '<last rowid>:<claim counter>'; inactive_budget = '<day>:<released so far>'.
 * A chunk reads at most SWEEP_ROWS_PER_CALL rows by rowid (indexed), claims itself with an atomic UPDATE of the cursor (`changes` decides who sweeps),
 * releases at most RELEASES_PER_DAY players a day (the rest wait: the day is closed and tomorrow starts again from the first row) and a failed
 * chunk gives its cursor back, so the next call continues there and never starts over. Returns the pids released by this call. */
export const SWEEP_ROWS_PER_CALL = 200;
export const RELEASES_PER_DAY = 50;
export const sweepInactive = async (db, now = Date.now()) => {
  const day = Math.floor(now / DAY_MS), d = String(day);
  const meta = Object.fromEntries((await db.prepare("SELECT k, v FROM meta WHERE k IN ('inactive_swept', 'inactive_cursor', 'inactive_budget')").all()).results.map(r => [r.k, r.v]));
  if (meta.inactive_swept === d) return [];
  if (meta.inactive_cursor === undefined) await db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('inactive_cursor', '0:0')").run();
  const cursor = meta.inactive_cursor ?? '0:0', [rid0, seq] = cursor.split(':').map(Number);
  const [bDay, bUsed] = String(meta.inactive_budget || '').split(':'), used = bDay === d ? Number(bUsed) || 0 : 0;
  const rows = (await db.prepare("SELECT p.rowid AS rid, p.agent_id AS agent, p.pid, p.created_at, s.day AS seen FROM players p LEFT JOIN agent_seen s ON s.agent_id = p.agent_id WHERE p.rowid > ?1 ORDER BY p.rowid LIMIT ?2")
    .bind(rid0, SWEEP_ROWS_PER_CALL).all()).results;
  const players = {}, lastSeen = {};
  for (const r of rows) {
    if (r.agent.startsWith('sys:') || r.agent.startsWith('free:')) continue;
    players[r.pid] = { owner: r.agent, created: Math.floor(r.created_at / DAY_MS) }; if (r.seen != null) lastSeen[r.agent] = r.seen;
  }
  const due = releaseInactive(players, { today: day, lastSeen }).released, take = due.slice(0, Math.max(0, RELEASES_PER_DAY - used));
  const closed = take.length < due.length || rows.length < SWEEP_ROWS_PER_CALL;      /* budget spent, or the last chunk of the table */
  const next = `${closed ? 0 : rows[rows.length - 1].rid}:${seq + 1}`;
  const claim = await db.prepare("UPDATE meta SET v = ?2 WHERE k = 'inactive_cursor' AND v = ?1").bind(cursor, next).run();
  if (!claim.meta.changes) return [];                                                 /* another call took this chunk */
  const steps = [];
  for (const pid of take) {
    const agent = players[pid].owner;
    steps.push(db.prepare('UPDATE players SET agent_id = ?2 WHERE pid = ?1 AND agent_id = ?3').bind(pid, FREE(pid), agent),
      db.prepare('INSERT OR REPLACE INTO releases (pid, former, released_at) VALUES (?1, ?2, ?3)').bind(pid, agent, now),
      db.prepare('UPDATE agents SET seed = ?2 WHERE id = ?1').bind(agent, randomSeed()));
  }
  steps.push(db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('inactive_budget', ?1)").bind(`${d}:${used + take.length}`));
  if (closed) steps.push(db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('inactive_swept', ?1)").bind(d));
  try { await db.batch(steps); }
  catch (e) { await db.prepare("UPDATE meta SET v = ?1 WHERE k = 'inactive_cursor' AND v = ?2").bind(cursor, next).run().catch(() => {}); throw e; }
  return take;
};

/* GET /api/player: the player of this agent, or null */
export const mine = guarded(async ({ db, agent }) => {
  const r = await db.prepare('SELECT pid, name, kind, ovr, player, ratings, created_at FROM players WHERE agent_id = ?1').bind(agent.id).first();
  const saves = [], row = r ? publicRow(r, Date.now(), saves) : null;
  if (saves.length) await db.batch(saves.map(x => saveStep(db, x)));
  return json(200, { ok: true, player: row, cap: DRAW_CAP });
}, { needKey: true });

/* POST /api/player: create the one player of this agent. The body is the choice of league/freeagents.js (kind, position or
 * role, hand, build, look, points, nameDraw); the server judges it with validateCreate and draws everything else from the seed it made. */
export const create = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request);
  if (!body) return fail(400, 'invalid', { reasons: ['no choice given'] });
  /* #438: `place` is the start place, not part of the player choice of league/freeagents.js; left out = DEFAULT_PLACE */
  const { place = DEFAULT_PLACE, ...choice } = body;
  const reasons = validateCreate(choice);
  if (!isPlace(place)) reasons.push(`place must be one of ${PLACES.join(', ')}`);
  if (choice.nameDraw > DRAW_CAP) reasons.push(`nameDraw must be at most ${DRAW_CAP}`);
  if (reasons.length) return fail(400, 'invalid', { reasons });
  if (await db.prepare('SELECT 1 AS x FROM players WHERE agent_id = ?1').bind(agent.id).first()) return fail(409, 'already');
  const made = makePlayer(agent.seed >>> 0, choice), ratings = made.ratings, player = { ...made.player, place };
  try {
    await db.prepare(`INSERT INTO players (agent_id, pid, name, kind, ovr, player, ratings, created_at, ${ABILS.map(k => `a_${k}`)}) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ${ABILS.map((k, i) => `?${i + 9}`)})`)
      .bind(agent.id, player.id, player.name, choice.kind, ratings.ovr, JSON.stringify(player), JSON.stringify(ratings), Date.now(), ...abilsOf(ratings)).run();
  } catch (e) {
    /* a unique key said no: this agent already has his player (a second tap at the same time), or the name is taken */
    return fail(409, (await db.prepare('SELECT 1 AS x FROM players WHERE agent_id = ?1').bind(agent.id).first()) ? 'already' : 'name');
  }
  /* #437: a real fan takes the place of the oldest 系統 filler of the same kind (none left: nothing to drop) */
  await db.prepare("DELETE FROM players WHERE pid = (SELECT pid FROM players WHERE agent_id LIKE 'sys:%' AND kind = ?1 ORDER BY created_at, pid LIMIT 1)").bind(choice.kind).run();
  return json(201, { ok: true, player: { id: player.id, name: player.name, kind: choice.kind, ovr: ratings.ovr, player, ratings, created: Date.now() } });
}, { needKey: true });

/* GET /api/freeagents?sort=ovr|new|<one ability key>&after=<cursor>: everyone's created players, public, no key. Never shows an agent id.
 * #806 keyset paging: the answer carries `next` when more rows follow; `after=<next>` reads the page after it. Every sort walks its own index
 * (ovr / created_at / one a_<key> column, all DESC with the pid last), so a call reads PAGE_SIZE + 1 rows whatever the page. The cursor holds the
 * sort columns of the last row joined by "~"; `page` is kept for old callers and must be 0. */
const CURSOR_PID = /^[A-Za-z0-9_-]{1,64}$/;
export const list = guarded(async ({ request, db }) => {
  const q = new URL(request.url).searchParams, rawPage = q.get('page') ?? '0';
  const page = /^\d{1,3}$/.test(rawPage) ? Number(rawPage) : -1, sort = SORTS.has(q.get('sort')) ? q.get('sort') : 'ovr';
  if (page < 0 || page > MAX_PAGE) return fail(400, 'page');
  /* the sort column comes from the SORTS allow-list, never from the request text; a player without the ability holds -1 and sorts last */
  const cols = sort === 'ovr' ? ['ovr', 'created_at', 'pid'] : sort === 'new' ? ['created_at', 'pid'] : [`a_${sort}`, 'ovr', 'created_at', 'pid'];
  const raw = q.get('after'), parts = raw == null ? null : raw.split('~');
  if (parts && (parts.length !== cols.length || !parts.slice(0, -1).every(x => /^-?\d{1,16}$/.test(x)) || !CURSOR_PID.test(parts[parts.length - 1]))) return fail(400, 'after');
  const where = parts ? `WHERE (${cols.join(', ')}) < (${cols.map((c, i) => `?${i + 2}`).join(', ')})` : '';
  const args = parts ? parts.map((x, i) => i < parts.length - 1 ? Number(x) : x) : [];
  const saves = [], now = Date.now();
  const rows = (await db.prepare(`SELECT pid, name, kind, ovr, player, ratings, created_at, (agent_id LIKE 'free:%') AS free, ${cols.filter(c => c !== 'pid').join(', ')} FROM players ${where} ORDER BY ${cols.map(c => c + ' DESC').join(', ')} LIMIT ?1`)
    .bind(PAGE_SIZE + 1, ...args).all()).results;
  const shown = rows.slice(0, PAGE_SIZE), players = shown.map(r => publicRow(r, now, saves));
  if (saves.length) await db.batch(saves.map(x => saveStep(db, x)));
  const more = rows.length > PAGE_SIZE, last = shown[shown.length - 1];
  return json(200, { ok: true, page, sort, more, ...(more ? { next: cols.map(c => last[c]).join('~') } : {}), players }, { 'cache-control': 'public, max-age=10' });
});

/* POST /api/player/release: this agent lets his player go (解約). The row stays (records are append-only); he loses his agent,
 * shows in the free list (free:true) and the former agent may take him back until another agent has him. */
export const release = guarded(async ({ db, agent }) => {
  const r = await db.prepare('SELECT pid FROM players WHERE agent_id = ?1').bind(agent.id).first();
  if (!r) return fail(404, 'none');
  /* the update is the gate: two rapid taps, the second finds no player of this agent */
  const done = await db.prepare('UPDATE players SET agent_id = ?2 WHERE agent_id = ?1').bind(agent.id, FREE(r.pid)).run();
  if (!done.meta.changes) return fail(404, 'none');
  /* a new seed for the next player: his id, names and luck must not repeat the released one (nothing is copied over) */
  await db.batch([db.prepare('INSERT OR REPLACE INTO releases (pid, former, released_at) VALUES (?1, ?2, ?3)').bind(r.pid, agent.id, Date.now()),
    db.prepare('UPDATE agents SET seed = ?2 WHERE id = ?1').bind(agent.id, randomSeed())]);
  return json(200, { ok: true, released: r.pid });
}, { needKey: true });

/* POST /api/player/reclaim {id}: the former agent takes his released player back while nobody else has him; once RECLAIM_DAYS have
 * passed since the release (#628, league/inactive.js canClaim) any agent may. One player at a time: the player he controls now is
 * released by the same rule first. */
export const reclaim = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request), pid = body && typeof body.id === 'string' && body.id.length <= 64 ? body.id : null;
  if (!pid) return fail(400, 'invalid', { reasons: ['id must be a player id'] });
  const rel = await db.prepare('SELECT former, released_at FROM releases WHERE pid = ?1').bind(pid).first();
  if (!rel || !canClaim({ tier: FREE_TIER, former: rel.former, releasedOn: Math.floor(rel.released_at / DAY_MS) }, agent.id, Math.floor(Date.now() / DAY_MS))) return fail(403, 'notyours');
  const cur = await db.prepare('SELECT pid FROM players WHERE agent_id = ?1').bind(agent.id).first();
  if (!(await db.prepare('SELECT 1 AS x FROM players WHERE pid = ?1 AND agent_id = ?2').bind(pid, FREE(pid)).first())) return fail(409, 'taken');
  /* one batch: release the current player (if any), take the old one back, drop the release note */
  const steps = [];
  if (cur) steps.push(db.prepare('UPDATE players SET agent_id = ?2 WHERE agent_id = ?1').bind(agent.id, FREE(cur.pid)),
    db.prepare('INSERT OR REPLACE INTO releases (pid, former, released_at) VALUES (?1, ?2, ?3)').bind(cur.pid, agent.id, Date.now()),
    db.prepare('UPDATE agents SET seed = ?2 WHERE id = ?1').bind(agent.id, randomSeed()));
  steps.push(db.prepare('UPDATE players SET agent_id = ?1 WHERE pid = ?2 AND agent_id = ?3').bind(agent.id, pid, FREE(pid)),
    db.prepare('DELETE FROM releases WHERE pid = ?1').bind(pid));
  await db.batch(steps);
  return json(200, { ok: true, reclaimed: pid, released: cur ? cur.pid : null });
}, { needKey: true });

/* POST /api/player/place {place}: #438, this agent moves his player between 二軍 and 自由市場 (either way, any time). Only
 * player.place changes: ratings, ovr, records and the growth checkpoint stay as they are (rule 10). */
export const place = guarded(async ({ request, db, agent }) => {
  const body = await readBody(request), to = body ? body.place : undefined;
  if (!isPlace(to)) return fail(400, 'invalid', { reasons: [`place must be one of ${PLACES.join(', ')}`] });
  const done = await db.prepare("UPDATE players SET player = json_set(player, '$.place', ?2) WHERE agent_id = ?1").bind(agent.id, to).run();
  if (!done.meta.changes) return fail(404, 'none');
  return json(200, { ok: true, place: to });
}, { needKey: true });
