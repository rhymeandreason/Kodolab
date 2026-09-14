/* =============================================================================
 *  api/_apps.js — the apps table, and how many builds a link has left
 * =============================================================================
 *  Everything that touches `apps` and `app_versions` is here, so the two
 *  endpoints (`build.js` writes turns, `app.js` reads and saves) cannot drift
 *  into two ideas of what a version is. `_schema.sql` says what the rows mean.
 *
 *  THE EDIT TOKEN IS A BEARER SECRET, hashed at rest the way `_keys.js` hashes
 *  a cohort key and compared the same way. It protects one row. It is minted
 *  once, handed to whoever created or remixed the app, and never readable back
 *  out of the database: a leaked dump gives away nothing anyone can save with.
 *
 *  THE LIMIT IS ITS OWN, not `_limit.js`'s. A build costs many times what a
 *  question does and is counted in a different table, so it gets its own
 *  constants and its own one-round-trip query. The shape is the tutor's: the
 *  cohort cap is the protection, the visitor cap is friction, and it FAILS OPEN
 *  for the same reason — the provider's prepaid cap is the ceiling that always
 *  holds, and a slow database must not take the builder away from a tester
 *  mid-thought.
 *
 *  UNLIKE THE TUTOR, THIS DOES NOT NO-OP WITHOUT A COHORT. The tutor's limiter
 *  returns null when there is no cohort because an ungated deployment is a
 *  local one. A builder without a database cannot store anything at all, so
 *  `enabled()` is the gate the endpoints check first, and with a database the
 *  visitor cap applies whether or not a key was presented.
 * ========================================================================== */
'use strict';

const crypto = require('crypto');
const log = require('./_log.js');

const LIMITS = {
  visitorHour: 60,     // one tester iterating hard for an hour is maybe 20
  cohortHour:  200,    // a leaked link runs into this
  cohortDay:   600,
  /* A class is one room building at once: 30 students at ~10 turns a period. */
  classHour:   450,
  classDay:    1500,
  /* One invited account. Teachers and class codes are not held to this. */
  accountDay:  60,
};

const BUDGET_MS = 1500;
const ID_RE = /^[A-Za-z0-9_-]{8,24}$/;
const UUID  = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidOrNull = v => (UUID.test(String(v || '')) ? v : null);
const validId    = v => ID_RE.test(String(v || ''));

/* base64url, so an id is safe in a path and a token is safe in a query string
 * for the one trip it makes there. */
const mintId    = () => crypto.randomBytes(8).toString('base64url');
const mintToken = () => crypto.randomBytes(24).toString('base64url');
const hash      = s  => crypto.createHash('sha256').update(String(s)).digest('hex');

function sameHash(token, stored) {
  if (!token || !stored) return false;
  const a = Buffer.from(hash(token)), b = Buffer.from(String(stored));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function enabled() { return log.enabled(); }

/* ---- the limit --------------------------------------------------------- */

async function counts(cohort, visitor, account) {
  const db = log.sql();
  const [row] = await db`
    SELECT
      count(*) FILTER (WHERE a.owner_id = ${account})::int                  AS account_day,
      count(*) FILTER (WHERE a.cohort = ${cohort}
                         AND v.created_at > now() - interval '1 hour')::int AS cohort_hour,
      count(*) FILTER (WHERE a.cohort = ${cohort})::int                     AS cohort_day,
      count(*) FILTER (WHERE a.visitor_id = ${visitor}::uuid
                         AND v.created_at > now() - interval '1 hour')::int AS visitor_hour
    FROM   app_versions v
    JOIN   apps a ON a.id = v.app_id
    WHERE  v.kind IN ('build', 'edit')
      AND  v.created_at > now() - interval '1 day'
      AND  (a.cohort = ${cohort} OR a.visitor_id = ${visitor}::uuid OR a.owner_id = ${account})`;
  return row;
}

/* Null to allow the turn, or {status, body} to refuse it. */
/* `account` is an invited account's owner id, the only kind with a cap of its own. */
async function exceeded({ cohort, visitorId, account }) {
  if (!enabled()) return null;
  const visitor = uuidOrNull(visitorId);
  let row;
  try {
    row = await Promise.race([
      counts(cohort || null, visitor, account || null),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timed out')), BUDGET_MS)),
    ]);
  } catch (err) {
    console.error('[apps] count failed, allowing the build:', (err && err.message) || err);
    return null;
  }
  if (!row) return null;
  const refuse = m => ({ status: 429, body: { error: m } });
  const klass = /^class:/.test(cohort || '');
  const day = klass ? LIMITS.classDay : LIMITS.cohortDay, hour = klass ? LIMITS.classHour : LIMITS.cohortHour;
  const who = klass ? 'Your class' : 'This link';
  if (cohort && row.cohort_day  >= day)  return refuse(`${who} has used its builds for today. They come back tomorrow.`);
  if (cohort && row.cohort_hour >= hour) return refuse(`${who} has built a lot in the last hour. Try again shortly.`);
  if (account && row.account_day >= LIMITS.accountDay) return refuse(`You have used your ${LIMITS.accountDay} builds for today. They come back tomorrow.`);
  if (visitor && row.visitor_hour >= LIMITS.visitorHour) return refuse('You have built a lot in the last hour. Try again shortly.');
  return null;
}

/* ---- rows -------------------------------------------------------------- */

/* A new app with its first version. Returns the token exactly once. */
async function create({ cohort, ownerId, visitorId, parentId, title, isLocal, version }) {
  const db = log.sql();
  const id = mintId(), token = mintToken();
  await db`INSERT INTO apps (id, cohort, owner_id, visitor_id, parent_id, token_hash, title, is_local)
           VALUES (${id}, ${cohort || null}, ${ownerId || null}, ${uuidOrNull(visitorId)},
                   ${validId(parentId) ? parentId : null}, ${hash(token)},
                   ${title || null}, ${isLocal == null ? null : !!isLocal})`;
  const v = await addVersion(id, version);
  return { id, token, version: v };
}

/* The next version of an app. `n` is counted from the rows, in the insert,
 * so two saves racing get consecutive numbers or one of them fails on the
 * unique constraint rather than both landing on the same n. */
async function addVersion(appId, { kind, html, request, summary, errors, provider, model, usage, ms, error }) {
  const db = log.sql();
  const [row] = await db`
    INSERT INTO app_versions (app_id, n, kind, html, request, summary, errors,
                              provider, model, usage, ms, error)
    VALUES (${appId},
            (SELECT coalesce(max(n), 0) + 1 FROM app_versions WHERE app_id = ${appId}),
            ${kind}, ${html}, ${request || null}, ${summary || null},
            ${errors ? JSON.stringify(errors) : null},
            ${provider || null}, ${model || null}, ${usage ? JSON.stringify(usage) : null},
            ${Number.isFinite(ms) ? ms : null}, ${error || null})
    RETURNING n, created_at`;
  /* The card's words, so an app has some before anyone opens it: a capture from
     the running page is better and replaces these, which is why this only ever
     fills a card that has none. Never allowed to fail a save — the version is
     the record, and a shelf card is decoration. */
  try {
    const m = require('./_thumbmeta.js').fromSource(html);
    if (m) await db`UPDATE apps SET thumb_meta = ${JSON.stringify(m)}
                    WHERE id = ${appId} AND thumb_meta IS NULL`;
  } catch (e) { console.error('[apps] thumb_meta: ' + ((e && e.message) || e)); }
  return row;
}

/* The app and its latest page. Null when there is no such app. */
async function read(id) {
  if (!validId(id)) return null;
  const db = log.sql();
  const [app] = await db`SELECT id, cohort, owner_id, parent_id, title, created_at FROM apps WHERE id = ${id}`;
  if (!app) return null;
  const [v] = await db`SELECT n, kind, html, request, summary, created_at
                       FROM app_versions WHERE app_id = ${id} ORDER BY n DESC LIMIT 1`;
  return { ...app, version: v || null };
}

/* Every version, without the pages: what the history panel lists. */
async function versions(id) {
  const db = log.sql();
  return db`SELECT n, kind, request, summary, model, usage, ms, error, created_at
            FROM app_versions WHERE app_id = ${id} ORDER BY n ASC`;
}

async function version(id, n) {
  const db = log.sql();
  const [v] = await db`SELECT n, kind, html, request, summary, created_at
                       FROM app_versions WHERE app_id = ${id} AND n = ${n | 0}`;
  return v || null;
}

/* The requests that shaped the app, oldest first. What the page's own history
 * comment is rebuilt from after every turn. */
async function requests(id) {
  const db = log.sql();
  const rows = await db`SELECT request FROM app_versions
                        WHERE app_id = ${id} AND request IS NOT NULL AND error IS NULL
                        ORDER BY n ASC`;
  return rows.map(r => r.request);
}

/* Whether this token, or this owner, may save this app. The owner is a seat or
 * a teacher from `_access.js`, and is how a class code edits its own work from
 * a machine that never held the token. */
async function mayEdit(id, token, owner) {
  if (!validId(id) || !(token || owner)) return false;
  const db = log.sql();
  const [row] = await db`SELECT token_hash, owner_id FROM apps WHERE id = ${id}`;
  if (!row) return false;
  return (!!owner && row.owner_id === owner) || (!!token && sameHash(token, row.token_hash));
}

/* An app nobody owns becomes this owner's. False when someone already does. */
async function adopt(id, owner) {
  const rows = await log.sql()`UPDATE apps SET owner_id = ${owner} WHERE id = ${id} AND owner_id IS NULL RETURNING id`;
  return rows.length > 0;
}

async function rotate(id) {
  const db = log.sql();
  const token = mintToken();
  await db`UPDATE apps SET token_hash = ${hash(token)} WHERE id = ${id}`;
  return token;
}

/* Gone means gone. `app_versions` cascades and any child remix has its
 * parent_id nulled, so a delete takes the page and its history and leaves the
 * copies other people made standing. The usage rows go with it: a deleted app
 * stops counting toward the spend the admin page totals. */
async function remove(id) {
  const db = log.sql();
  await db`DELETE FROM apps WHERE id = ${id}`;
}

async function setTitle(id, title) {
  const db = log.sql();
  await db`UPDATE apps SET title = ${String(title || '').slice(0, 120) || null} WHERE id = ${id}`;
}

/* The still and the words go together or the card is drawn half from this
   version and half from the last one.

   WORDLESS IS NOT PICTURELESS. A page whose panel is empty when the shot is
   taken (one that never reached its first step, say) still posts a good scene,
   and writing null over the row for it left an image no shelf would ever draw:
   `scene` is the claim that decides that, and it belongs to the capture, not
   to the words. So the words are replaced only when there are some, and the
   claim is recorded either way. */
async function setThumb(id, thumb, meta) {
  const db = log.sql();
  const words = meta && meta.title ? JSON.stringify(meta) : null;
  await db`UPDATE apps
              SET thumb = ${thumb || null},
                  thumb_meta = CASE WHEN ${thumb || null}::text IS NULL THEN NULL
                    ELSE COALESCE(${words}::jsonb, COALESCE(thumb_meta, '{}'::jsonb))
                         || jsonb_build_object('scene', ${!!(meta && meta.scene)}::boolean) END
            WHERE id = ${id}`;
}

/* The words alone, without disturbing the still beside them: the source
   extractor sets these, and a later capture from the running page replaces
   them. `_thumbmeta.js` says why the two are not equals.

   IT MERGES, IT DOES NOT REPLACE. `scene` is a claim about the picture, which
   only the capture that took it can make, and a plain write of the words
   erased it: a shelf full of good scene stills went back to blank paper
   because a `cards --force` pass ran over them afterwards. Only the six
   fields this owns are overwritten; whatever else the row carries survives. */
async function setCard(id, meta) {
  const db = log.sql();
  await db`UPDATE apps
              SET thumb_meta = ${JSON.stringify(meta)}::jsonb
                             || (COALESCE(thumb_meta, '{}'::jsonb)
                                 - 'brand' - 'eyebrow' - 'title' - 'body' - 'steps' - 'nav')
            WHERE id = ${id}`;
}

/* Every stored still whose row does not say whether it is the scene, so the
   size of the image itself can answer. `_schema.sql` says why the flag decides
   what the shelf draws. */
async function thumbsWithoutSceneFlag() {
  const db = log.sql();
  return db`SELECT id, title, thumb FROM apps
             WHERE thumb IS NOT NULL AND (thumb_meta->'scene') IS NULL
             ORDER BY created_at DESC`;
}

async function markScene(id) {
  const db = log.sql();
  await db`UPDATE apps SET thumb_meta = COALESCE(thumb_meta, '{}'::jsonb) || '{"scene":true}'::jsonb
            WHERE id = ${id}`;
}

/* Each app's newest stored source, for the apps whose card has no words yet.
   The join is DISTINCT ON rather than a max() subquery because a version is
   wanted whole and only the newest one. */
async function sourcesNeedingCards(force) {
  const db = log.sql();
  return force
    ? db`SELECT DISTINCT ON (v.app_id) v.app_id AS id, a.title, v.html AS src
           FROM app_versions v JOIN apps a ON a.id = v.app_id
          ORDER BY v.app_id, v.created_at DESC`
    : db`SELECT DISTINCT ON (v.app_id) v.app_id AS id, a.title, v.html AS src
           FROM app_versions v JOIN apps a ON a.id = v.app_id
          WHERE a.thumb_meta IS NULL
          ORDER BY v.app_id, v.created_at DESC`;
}

/* The shelf: title, thumb and last-edited for a handful of ids the browser
   already holds. No token check, since it is the same as reading each app in
   turn. `edited` is the newest version's time, not the app row's created_at, so
   a card that was edited from another browser still reads as recent. */
async function shelf(ids) {
  const db = log.sql();
  const list = ids.filter(validId).slice(0, 24);
  if (!list.length) return [];
  return db`SELECT a.id, a.title, a.thumb, a.thumb_meta,
                   COALESCE((SELECT max(v.created_at) FROM app_versions v WHERE v.app_id = a.id),
                            a.created_at) AS edited
            FROM apps a WHERE a.id = ANY(${list})`;
}

/* An owner's apps, newest edit first: the shelf for a class code, whatever
   browser it is typed into. Same fields as `shelf`. */
async function owned(owner, limit = 48) {
  if (!owner) return [];
  const db = log.sql();
  return db`SELECT a.id, a.title, a.thumb, a.thumb_meta,
                   COALESCE((SELECT max(v.created_at) FROM app_versions v WHERE v.app_id = a.id),
                            a.created_at) AS edited
            FROM apps a WHERE a.owner_id = ${owner}
            ORDER BY edited DESC LIMIT ${limit}`;
}

/* The list an owner sees: not exposed publicly, used by tools/db.js. */
async function recent({ limit = 50, cohort = null } = {}) {
  const db = log.sql();
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200);
  return db`SELECT a.id, a.cohort, a.title, a.parent_id, a.created_at,
                   (SELECT max(n) FROM app_versions v WHERE v.app_id = a.id) AS versions,
                   (SELECT count(*) FROM app_versions v WHERE v.app_id = a.id AND v.kind IN ('build','edit'))::int AS turns
            FROM apps a
            WHERE (${cohort}::text IS NULL OR a.cohort = ${cohort})
            ORDER BY a.created_at DESC LIMIT ${n}`;
}

/* Tokens and dollars per cohort per day: what tunes LIMITS from evidence. */
async function usage() {
  const db = log.sql();
  return db`SELECT date_trunc('day', v.created_at)::date AS day, a.cohort,
                   count(*)::int AS turns,
                   sum((v.usage->>'input')::bigint)::bigint  AS input,
                   sum((v.usage->>'cached')::bigint)::bigint AS cached,
                   sum((v.usage->>'output')::bigint)::bigint AS output,
                   round(sum((v.usage->>'cost_usd')::numeric), 4) AS usd
            FROM app_versions v JOIN apps a ON a.id = v.app_id
            WHERE v.kind IN ('build', 'edit')
            GROUP BY 1, 2 ORDER BY 1 DESC, 2`;
}

module.exports = { LIMITS, enabled, exceeded, validId, setThumb, setCard, sourcesNeedingCards,
                   thumbsWithoutSceneFlag, markScene, shelf, owned,
                   create, addVersion, read, versions, version, requests,
                   mayEdit, adopt, rotate, setTitle, remove, recent, usage };
