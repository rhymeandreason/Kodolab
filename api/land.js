/* =============================================================================
 *  api/land.js — where a question actually landed
 * =============================================================================
 *  POST /api/land  {q, tier, target, visitorId}  → 204, always
 *
 *  THE SERVER USED TO BE UNABLE TO KNOW THIS, AND THAT WAS FINE. api/find.js
 *  returns a vector and the PAGE ranks it, so the outcome never came back —
 *  and when that was written a find WAS the search, so re-scoring the text
 *  offline reproduced the answer exactly. `_schema.sql` still explains the
 *  trade; this endpoint is what changed under it.
 *
 *  The bar now walks six tiers, and `/api/find` is reached only by the last
 *  two. A reader who typed `rubisco` and landed on a card by NAME, or restored
 *  a graft they had built last week, or was offered a new question, never
 *  embedded anything — so those arrivals are invisible to the log, and they
 *  are most of them. Re-scoring cannot recover a tier it was never part of.
 *  What is worth knowing is exactly what is now underivable: which tier is
 *  carrying the map, and which questions fall through to a guess.
 *
 *  A BEACON, SO THE READER PAYS NOTHING. `navigator.sendBeacon` is
 *  fire-and-forget: it does not block the arrival, it survives the page being
 *  closed a moment later, and it cannot fail in a way the reader sees. This
 *  answers 204 and never a body, because nothing is waiting for one.
 *
 *  IT UPDATES BEFORE IT INSERTS. A semantic arrival already wrote a row from
 *  api/find.js, and writing a second would put one question in the log twice —
 *  which is the exact complaint this whole line of work started from. So the
 *  landing is folded into that row when it exists, and only an arrival that
 *  called no endpoint at all gets a row of its own, tagged `land`.
 *
 *  A `land` ROW IS NOT SPEND, and the rate limiter skips it. The cap in
 *  _finds.js counts rows to ration API calls; a landing made none, and
 *  counting it would throttle a reader for using the offline half of the bar.
 * ========================================================================== */
'use strict';

const keys = require('./_keys.js');
const log = require('./_log.js');
const { local } = require('./_local.js');

const MAXLEN = 400;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuidOrNull = v => (UUID.test(String(v || '')) ? v : null);

/* The tiers Enter walks, in order. A closed set because it is a dimension the
 * log groups by: a typo'd name would read as a tier nobody can find. */
const TIERS = ['named', 'question', 'mine', 'keyword', 'semantic', 'offer', 'miss'];

/* How long after the search a landing may still belong to it. Long enough for
 * a reader to read the guess before the beacon fires, short enough that asking
 * the same thing twice in a session does not fold into one row. */
const WINDOW = '10 minutes';

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return res.status(200).json({ ok: true });
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'POST only' });
  }

  /* Answered before anything is written, and answered the same way whatever
     happens below: a beacon has nobody to tell. */
  res.status(204).end();

  try {
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const q = String(body.q || '').trim().slice(0, MAXLEN);
    const tier = TIERS.includes(body.tier) ? body.tier : null;
    if (!q || !tier) return;

    const db = log.sql();
    if (!db) return;

    const visitor = uuidOrNull(body.visitorId);
    const landing = {
      tier,
      target: body.target ? String(body.target).slice(0, 80) : null,
      member: body.member ? String(body.member).slice(0, 80) : null,
      z: typeof body.z === 'number' && isFinite(body.z) ? +body.z.toFixed(2) : null,
    };
    const payload = JSON.stringify(landing);

    /* `answer IS NULL` is what keeps this off an extend row: that one already
       holds the cards it generated, and a landing must not overwrite them. */
    const hit = await db`
      UPDATE finds SET answer = ${payload}::jsonb
      WHERE id = (
        SELECT id FROM finds
        WHERE q = ${q}
          AND visitor_id IS NOT DISTINCT FROM ${visitor}
          AND kind = 'find'
          AND answer IS NULL
          AND created_at > now() - interval '${db.unsafe(WINDOW)}'
        ORDER BY id DESC LIMIT 1)
      RETURNING id`;
    if (hit.length) return;

    /* nothing to fold into: an arrival that spent no API call at all */
    await db`
      INSERT INTO finds (visitor_id, cohort, q, kind, answer, is_local)
      VALUES (${visitor}, ${(await keys.cohort(req)) || null}, ${q}, 'land', ${payload}::jsonb,
              ${local(req)})`;
  } catch (err) {
    console.error('[land] ' + ((err && err.message) || err));
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
