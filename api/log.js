/* =============================================================================
 *  api/log.js — read the tutor's log
 * =============================================================================
 *  GET /api/log?limit=&offset=&lesson=&cohort=&aimed=none  → {stats, turns}
 *  GET /api/log?classes=1     → every teacher's classes, for /beta (build/beta.html)
 *  GET /api/log?class=ID      → that class as api/teacher.js answers its teacher
 *
 *  A LOCAL TOOL. `.vercelignore` keeps this out of production, and this answers
 *  only to a request from the machine it runs on, so the two would both have to
 *  fail before anyone reached a student's question.
 *
 *  There is no token, on purpose. The log lives in Neon, so `.env.local` points
 *  at the same database production writes to and the dev server shows real data
 *  with nothing public in the path. A secret exists to be leaked; not needing
 *  one is better than guarding one.
 * ========================================================================== */
'use strict';

const log = require('./_log.js');
const { local } = require('./_local.js');

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'GET only' });
  }

  const q = req.query || {};
  if (!local(req)) return res.status(403).json({ error: 'the log reads only from localhost' });

  if (!log.enabled()) return res.status(503).json({ error: 'DATABASE_URL is not set: nothing is logged' });

  /* Every class, as its teacher sees it: build/beta.html paints these the way
     /teach's Lessons tab does. */
  if (q.classes || q.class) {
    const db = log.sql();
    const teacher = require('./teacher.js');
    try {
      if (q.class) {
        const [klass] = await db`SELECT c.id, c.name, c.code, c.created_at, t.name AS teacher FROM classes c JOIN teachers t ON t.id = c.teacher_id WHERE c.id = ${String(q.class)}`;
        if (!klass) return res.status(404).json({ error: 'no such class' });
        const [sessions, questions] = await Promise.all([teacher.sessionsOf(db, klass.id), teacher.questionsOf(db, klass.id)]);
        return res.status(200).json({ class: klass, seats: [], feed: [], sessions, questions });
      }
      const classes = await db`
        SELECT c.id, c.name, c.code, c.created_at, t.name AS teacher,
               (SELECT count(*) FROM class_sessions s WHERE s.class_id = c.id)::int AS sessions
        FROM classes c JOIN teachers t ON t.id = c.teacher_id ORDER BY t.name, c.created_at`;
      return res.status(200).json({ teacher: { name: 'every teacher' }, classes, apps: [] });
    } catch (err) {
      console.error('[log] classes failed:', err.message);
      return res.status(502).json({ error: err.message });
    }
  }

  try {
    /* The searches are settled separately and allowed to fail on their own: a
     * checkout whose database predates the `finds` table still has a working
     * tutor log, and a viewer that 502s over a section the reader did not come
     * for is worse than one that says that section is empty. */
    const [stats, turns, searches] = await Promise.all([
      log.stats(),
      log.recent({ limit: q.limit, offset: q.offset, lesson: q.lesson || null,
                   aimed: q.aimed || null, model: q.model || null,
                   cohort: q.cohort || null }),
      /* `?local=1` shows the rows written from the machine serving this, which
         are hidden by default. Only a local reader can see this page at all —
         _local.js gates the whole endpoint — so the flag decides what a
         developer is looking at, never what a student can reach. */
      Promise.all([log.findStats({ local: q.local === '1' }),
                   log.finds({ limit: q.finds, local: q.local === '1' })])
        .then(([fstats, rows]) => ({ stats: fstats, rows }))
        .catch(err => ({ error: err.message })),
    ]);
    return res.status(200).json({ stats, turns, searches });
  } catch (err) {
    // Said out loud, unlike on the write path: a viewer showing an empty list
    // because the database is unreachable is a viewer that lies.
    console.error('[log] read failed:', err.message);
    return res.status(502).json({ error: err.message });
  }
};


