/* =============================================================================
 *  api/event.js — what a class's browsers report from a lesson
 * =============================================================================
 *  GET  /api/event?class=CODE            → {name}   the class, for the join chip
 *  POST /api/event  {class, visitorId, page, name?, events:[{kind, payload}]}
 *                                        → 204, always
 *
 *  A BEACON, like /api/land: answered before it writes, never a body, because
 *  lib/track.js sends it with `sendBeacon` from a page that may be closing.
 *  A refused batch is dropped silently for the same reason; the student is
 *  never shown a tracking error.
 *
 *  The class code is the whole credential, and it is a bearer token shared by
 *  a room: it protects a row count, not anything private. What it cannot do is
 *  build (keys.linkCohort, not this), and what it cannot read is anything.
 *
 *  KINDS ARE A CLOSED SET, because the dashboard groups on them:
 *    view      the page opened                    {ref}
 *    phase     a stage reached                    {phase, i}   i orders them
 *    beat      seconds the tab was visible        {s}          summed for time on task
 *    complete  the lesson's own "done" fired      {}
 *    quiz      the quiz submitted                 {score, total, answers}
 *    survey    the survey submitted               {answers}
 *    name      the student typed a nickname       {name}       also written to class_sessions
 *
 *  Sizes are capped and nothing else is limited: a class code can be spammed
 *  into rows, and a row costs nothing a model turn costs. The `events` index by
 *  class is what makes an inflated class cheap to inspect and delete.
 * ========================================================================== */
'use strict';

const log     = require('./_log.js');
const classes = require('./_classes.js');

const KINDS   = ['view', 'phase', 'beat', 'complete', 'quiz', 'survey', 'name'];
const MAX_EVENTS  = 40;
const MAX_PAYLOAD = 4000;   // chars of JSON per event: a survey's free text fits, a transcript does not
const MAX_NAME    = 40;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const k = await classes.byCode((req.query || {}).class).catch(() => null);
    if (!k) return res.status(404).json({ error: 'no such class' });
    return res.status(200).json({ name: k.name });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'GET or POST only' });
  }

  res.status(204).end();

  try {
    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const db = log.sql();
    if (!db) return;
    const k = await classes.byCode(body.class);
    const visitor = UUID.test(String(body.visitorId || '')) ? body.visitorId : null;
    if (!k || !visitor) return;

    const page = String(body.page || '').slice(0, 80) || '/';
    const name = body.name == null ? undefined : String(body.name).replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
    const evs = (Array.isArray(body.events) ? body.events : []).slice(0, MAX_EVENTS)
      .filter(e => e && KINDS.includes(e.kind))
      .map(e => {
        let payload = e.payload && typeof e.payload === 'object' ? e.payload : {};
        if (JSON.stringify(payload).length > MAX_PAYLOAD) payload = { truncated: true };
        return { kind: e.kind, payload };
      });

    /* The roster row first, so a batch that is only a name still lands. `name`
       moves only when sent: an empty string clears it, undefined leaves it. */
    if (name === undefined) {
      await db`
        INSERT INTO class_sessions (class_id, visitor_id) VALUES (${k.id}, ${visitor}::uuid)
        ON CONFLICT (class_id, visitor_id) DO UPDATE SET last_seen = now()`;
    } else {
      await db`
        INSERT INTO class_sessions (class_id, visitor_id, name) VALUES (${k.id}, ${visitor}::uuid, ${name || null})
        ON CONFLICT (class_id, visitor_id) DO UPDATE SET last_seen = now(), name = EXCLUDED.name`;
    }
    if (!evs.length) return;
    await db`
      INSERT INTO events (class_id, visitor_id, page, kind, payload)
      SELECT ${k.id}, ${visitor}::uuid, ${page}, e->>'kind', e->'payload'
      FROM jsonb_array_elements(${JSON.stringify(evs)}::jsonb) AS e`;
  } catch (err) {
    console.error('[event] ' + ((err && err.message) || err));
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
