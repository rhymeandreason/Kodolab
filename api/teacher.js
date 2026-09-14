/* =============================================================================
 *  api/teacher.js — the teacher dashboard's data
 * =============================================================================
 *  A teacher is a signed-in account with a teacher row, or the pilot's
 *  `X-Teacher-Code`. A seat code is never read here.
 *
 *  GET  /api/teacher                  → the teacher, their classes, their own apps
 *  GET  /api/teacher?class=ID         → the roster with counts, and the class's prompts, newest first
 *  GET  /api/teacher?seat=ID          → one student's apps
 *  GET  /api/teacher?app=ID           → an app's every version, without pages
 *  GET  /api/teacher?app=ID&n=3       → one version's page
 *  POST {action, ...}
 *       class   {name}                → a new class
 *       rename  {class, name}
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

const access = require('./_access.js');
const apps   = require('./_apps.js');
const log    = require('./_log.js');

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
        return res.status(200).json({ class: klass, seats, feed });
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
      return res.status(200).json({ id, name });
    }

    if (action === 'rename') {
      const klass = await classOf(db, tid, String(body.class || ''));
      const name = str(body.name, 80);
      if (!klass) return res.status(404).json({ error: 'no such class' });
      if (!name) return res.status(400).json({ error: 'name the class' });
      await db`UPDATE classes SET name = ${name} WHERE id = ${klass.id}`;
      return res.status(200).json({ id: klass.id, name });
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

    return res.status(400).json({ error: 'action must be class, rename, seats, label, reissue, revoke or unrevoke' });
  } catch (err) {
    console.error('[teacher] ' + ((err && err.message) || err));
    return res.status(500).json({ error: 'the dashboard failed: ' + ((err && err.message) || 'unknown error') });
  }
};

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
