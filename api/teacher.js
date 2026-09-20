/* =============================================================================
 *  api/teacher.js — the teacher dashboard's data
 * =============================================================================
 *  A teacher is a signed-in account with a teacher row, or the pilot's
 *  `X-Teacher-Code`. A seat code is never read here.
 *
 *  GET  /api/teacher                  → the teacher, their classes, their own apps
 *  GET  /api/teacher?class=ID         → the roster with counts, the class's prompts, its lesson
 *                                       code, and `sessions`: one row per browser that opened a
 *                                       lesson on that code, with time, progress, quiz, survey,
 *                                       and the tutor questions it asked (api/event.js, _classes.js)
 *  GET  /api/teacher?seat=ID          → one student's apps
 *  GET  /api/teacher?app=ID           → an app's every version, without pages
 *  GET  /api/teacher?app=ID&n=3       → one version's page
 *  POST {action, ...}
 *       class   {name}                → a new class
 *       rename  {class, name}
 *       classcode {class}            → a new lesson code; the old link stops admitting, the rows stay
 *       seats   {class, labels[]}     → one seat per label, each with a fresh code
 *       label   {seat, label}
 *       reissue {seat}                → a new code; the old one stops admitting, the work stays
 *       revoke  {seat} · unrevoke {seat}
 *
 *  EVERYTHING IS SCOPED THROUGH THE TEACHER'S OWN ROWS. A seat, an app or a
 *  class id from another teacher answers 404, the same as one that does not
 *  exist, so an id is never evidence that something is there.
 *
 *  Read only on student work: a teacher sees every prompt and page but cannot
 *  save over a student's app. Remixing it from the viewer is the way to change it.
 * ========================================================================== */
'use strict';

const access  = require('./_access.js');
const apps    = require('./_apps.js');
const log     = require('./_log.js');
const codes   = require('./_classes.js');   // not `classes`: the GET below binds that name to the rows

const MAX_SEATS = 80;
const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!log.enabled()) return res.status(503).json({ error: 'no database configured' });

  let who = null;
  try { who = await access.resolve(req, { seatFirst: false }); }
  catch (err) { console.error('[teacher] ' + ((err && err.message) || err)); return res.status(500).json({ error: 'the database failed' }); }
  if (!who || who.kind !== 'teacher') return res.status(401).json({ error: 'Sign in as a teacher.', who: access.describe(who) });
  const tid = who.teacher.id;
  const db = log.sql();
  const q = req.query || {};

  try {
    if (req.method === 'GET') {
      if (q.app) {
        const app = await appOf(db, tid, who.owner, String(q.app));
        if (!app) return res.status(404).json({ error: 'no such app' });
        if (q.n) {
          const v = await apps.version(app.id, Number(q.n));
          return v ? res.status(200).json(v) : res.status(404).json({ error: 'no such version' });
        }
        return res.status(200).json({ app, versions: await apps.versions(app.id) });
      }

      if (q.seat) {
        const [seat] = await db`
          SELECT s.id, s.label, s.revoked_at, c.id AS class_id, c.name AS class_name
          FROM seats s JOIN classes c ON c.id = s.class_id
          WHERE s.id = ${String(q.seat)} AND c.teacher_id = ${tid}`;
        if (!seat) return res.status(404).json({ error: 'no such student' });
        const list = await db`
          SELECT a.id, a.title, a.parent_id, a.created_at, a.thumb_meta,
                 max(v.created_at) AS edited, max(v.n)::int AS versions,
                 count(*) FILTER (WHERE v.kind IN ('build', 'edit'))::int AS turns
          FROM apps a JOIN app_versions v ON v.app_id = a.id
          WHERE a.owner_id = ${'seat:' + seat.id}
          GROUP BY a.id ORDER BY edited DESC`;
        return res.status(200).json({ seat, apps: list });
      }

      if (q.class) {
        const klass = await classOf(db, tid, String(q.class));
        if (!klass) return res.status(404).json({ error: 'no such class' });
        const seats = await db`
          SELECT s.id, s.label, s.code, s.revoked_at, s.created_at,
                 count(DISTINCT a.id)::int AS apps,
                 count(v.id) FILTER (WHERE v.kind IN ('build', 'edit'))::int AS turns,
                 max(v.created_at) AS last
          FROM seats s
          LEFT JOIN apps a ON a.owner_id = 'seat:' || s.id
          LEFT JOIN app_versions v ON v.app_id = a.id
          WHERE s.class_id = ${klass.id}
          GROUP BY s.id ORDER BY s.created_at, s.label`;
        const feed = await db`
          SELECT v.app_id, v.n, v.kind, v.request, v.summary, v.error, v.created_at,
                 a.title, s.id AS seat_id, s.label
          FROM app_versions v
          JOIN apps a  ON a.id = v.app_id
          JOIN seats s ON a.owner_id = 'seat:' || s.id
          WHERE s.class_id = ${klass.id} AND v.kind IN ('build', 'edit')
          ORDER BY v.created_at DESC LIMIT 150`;
        klass.code = await codes.ensureCode(klass.id);
        const [sessions, questions] = await Promise.all([sessionsOf(db, klass.id), questionsOf(db, klass.id)]);
        return res.status(200).json({ class: klass, seats, feed, sessions, questions });
      }

      const classes = await db`
        SELECT c.id, c.name, c.created_at,
               (SELECT count(*) FROM seats s WHERE s.class_id = c.id AND s.revoked_at IS NULL)::int AS seats
        FROM classes c WHERE c.teacher_id = ${tid} ORDER BY c.created_at`;
      return res.status(200).json({ teacher: who.teacher, classes, apps: await apps.owned(who.owner) });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'GET or POST only' });
    }

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const action = String(body.action || '');

    if (action === 'class') {
      const name = str(body.name, 80);
      if (!name) return res.status(400).json({ error: 'name the class' });
      const id = access.mintId();
      await db`INSERT INTO classes (id, teacher_id, name) VALUES (${id}, ${tid}, ${name})`;
      return res.status(200).json({ id, name, code: await codes.ensureCode(id) });
    }

    if (action === 'rename') {
      const klass = await classOf(db, tid, String(body.class || ''));
      const name = str(body.name, 80);
      if (!klass) return res.status(404).json({ error: 'no such class' });
      if (!name) return res.status(400).json({ error: 'name the class' });
      await db`UPDATE classes SET name = ${name} WHERE id = ${klass.id}`;
      return res.status(200).json({ id: klass.id, name });
    }

    if (action === 'classcode') {
      const klass = await classOf(db, tid, String(body.class || ''));
      if (!klass) return res.status(404).json({ error: 'no such class' });
      return res.status(200).json({ id: klass.id, code: await codes.reissue(klass.id) });
    }

    if (action === 'seats') {
      const klass = await classOf(db, tid, String(body.class || ''));
      if (!klass) return res.status(404).json({ error: 'no such class' });
      const labels = (Array.isArray(body.labels) ? body.labels : []).map(l => str(l, 60)).filter(Boolean);
      if (!labels.length) return res.status(400).json({ error: 'add at least one student' });
      const [{ n }] = await db`SELECT count(*)::int AS n FROM seats WHERE class_id = ${klass.id}`;
      if (n + labels.length > MAX_SEATS) return res.status(400).json({ error: `a class holds up to ${MAX_SEATS} students` });
      const made = [];
      for (const label of labels) made.push(await insertSeat(db, klass.id, label));
      return res.status(200).json({ seats: made });
    }

    if (['label', 'reissue', 'revoke', 'unrevoke'].includes(action)) {
      const [seat] = await db`
        SELECT s.id FROM seats s JOIN classes c ON c.id = s.class_id
        WHERE s.id = ${String(body.seat || '')} AND c.teacher_id = ${tid}`;
      if (!seat) return res.status(404).json({ error: 'no such student' });
      if (action === 'label') {
        const label = str(body.label, 60);
        if (!label) return res.status(400).json({ error: 'a student needs a label' });
        await db`UPDATE seats SET label = ${label} WHERE id = ${seat.id}`;
        return res.status(200).json({ id: seat.id, label });
      }
      if (action === 'reissue') {
        const code = await withFreshCode(c => db`UPDATE seats SET code = ${c}, revoked_at = NULL WHERE id = ${seat.id}`);
        return res.status(200).json({ id: seat.id, code });
      }
      await db`UPDATE seats SET revoked_at = ${action === 'revoke' ? new Date().toISOString() : null} WHERE id = ${seat.id}`;
      return res.status(200).json({ id: seat.id, revoked: action === 'revoke' });
    }

    return res.status(400).json({ error: 'action must be class, rename, classcode, seats, label, reissue, revoke or unrevoke' });
  } catch (err) {
    console.error('[teacher] ' + ((err && err.message) || err));
    return res.status(500).json({ error: 'the dashboard failed: ' + ((err && err.message) || 'unknown error') });
  }
};

/* One row per browser that opened a lesson on the class code. Each column is
 * the roll-up the dashboard shows, read from the events the browser sent:
 * `active_s` sums the heartbeats, so it is time the tab was VISIBLE and not
 * time it was open; quiz and survey are the latest submission.
 *
 * PROGRESS IS PER PAGE, and `completed` is the pages that finished. One
 * furthest step across every lesson a student opened is not a fact about any
 * of them: the dashboard shows one lesson at a time and reads its own key out
 * of the map. Each entry is {phase, i, n} as lib/track.js's `step` sent it,
 * so the step's name and the lesson's length both come from the lesson. `questions` joins the tutor's threads on
 * the same visitor id under this class's cohort, which is the join the two
 * anonymous logs were built to allow only here, for the class's own teacher. */
async function sessionsOf(db, cid) {
  return db`
    SELECT s.visitor_id, s.name, s.first_seen, s.last_seen,
      coalesce((SELECT sum((e.payload->>'s')::int) FROM events e
                WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id AND e.kind = 'beat'), 0)::int AS active_s,
      (SELECT jsonb_object_agg(p.page, jsonb_build_object('phase', p.phase, 'i', p.i, 'n', p.n)) FROM (
         SELECT e.page,
           (array_agg(e.payload->>'phase' ORDER BY (e.payload->>'i')::int DESC NULLS LAST, e.id DESC))[1] AS phase,
           max((e.payload->>'i')::int) AS i,
           max((e.payload->>'n')::int) AS n
         FROM events e
         WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id AND e.kind = 'phase'
         GROUP BY e.page) p) AS progress,
      (SELECT array_agg(DISTINCT e.page) FROM events e
       WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id AND e.kind = 'complete') AS completed,
      (SELECT e.payload FROM events e
       WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id AND e.kind = 'quiz' ORDER BY e.id DESC LIMIT 1) AS quiz,
      (SELECT e.payload FROM events e
       WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id AND e.kind = 'survey' ORDER BY e.id DESC LIMIT 1) AS survey,
      (SELECT array_agg(DISTINCT e.page) FROM events e
       WHERE e.class_id = s.class_id AND e.visitor_id = s.visitor_id) AS pages,
      (SELECT count(*) FROM messages m JOIN threads t ON t.id = m.thread_id
       WHERE t.cohort = 'class:' || s.class_id AND t.visitor_id = s.visitor_id AND m.role = 'user')::int AS questions
    FROM class_sessions s
    WHERE s.class_id = ${cid}
    ORDER BY s.last_seen DESC`;
}

/* The class's tutor questions, newest first, each with the answer it got and
 * the nickname of the browser that asked, if one was typed. */
async function questionsOf(db, cid) {
  return db`
    SELECT m.id, m.text AS q, m.step, m.created_at, t.lesson, t.visitor_id, s.name,
           (SELECT a.text FROM messages a WHERE a.reply_to = m.id LIMIT 1) AS answer
    FROM messages m
    JOIN threads t ON t.id = m.thread_id
    LEFT JOIN class_sessions s ON s.class_id = ${cid} AND s.visitor_id = t.visitor_id
    WHERE t.cohort = ${'class:' + cid} AND m.role = 'user'
    ORDER BY m.created_at DESC LIMIT 200`;
}

async function classOf(db, tid, id) {
  const [row] = await db`SELECT id, name, created_at FROM classes WHERE id = ${id} AND teacher_id = ${tid}`;
  return row || null;
}

/* An app the teacher may read: their own, or one a seat in their classes owns. */
async function appOf(db, tid, owner, id) {
  if (!apps.validId(id)) return null;
  const [row] = await db`
    SELECT a.id, a.title, a.owner_id, a.parent_id, a.created_at, s.id AS seat_id, s.label
    FROM apps a
    LEFT JOIN seats s   ON a.owner_id = 'seat:' || s.id
    LEFT JOIN classes c ON c.id = s.class_id
    WHERE a.id = ${id} AND (a.owner_id = ${owner} OR c.teacher_id = ${tid})`;
  return row || null;
}

async function insertSeat(db, classId, label) {
  const id = access.mintId();
  const code = await withFreshCode(c => db`INSERT INTO seats (id, class_id, label, code) VALUES (${id}, ${classId}, ${label}, ${c})`);
  return { id, label, code };
}

/* A collision in 8e11 is a unique-violation, not a silent duplicate; try again. */
async function withFreshCode(write) {
  for (let i = 0; ; i++) {
    const code = access.mintSeatCode();
    try { await write(code); return code; }
    catch (err) { if (i >= 3 || !/unique|duplicate/i.test(String(err && err.message))) throw err; }
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }

// For api/log.js's localhost view of every class: the same roll-ups a teacher reads.
module.exports.sessionsOf = sessionsOf;
module.exports.questionsOf = questionsOf;
