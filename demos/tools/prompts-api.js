/* =============================================================================
 *  tools/prompts-api.js — every request the builder was asked, newest first
 * =============================================================================
 *  Behind /api/prompts in tools/dev-server.js and nowhere else, answered only
 *  to loopback, like codes-api.js. tools/prompts.html is the page on it.
 *
 *    GET ?q=&cohort=&kind=&failed=1&before=<version id>
 *      → { apps: [{ app_id, title, cohort, owner_id, is_local, last, prompts }], cohorts, more }
 *
 *  Paged by app, newest prompt first; an app's prompts run oldest first. The
 *  filters pick prompts, so an app carries only the ones that matched, and
 *  `before` is the previous page's last `last`.
 *
 *  Only 'build' and 'edit' versions carry a request. A prompt refused before
 *  the model ran (gate, cap, length) or one whose model call threw was never
 *  stored, so it is not here.
 * ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const log  = require(path.join(ROOT, 'api/_log.js'));

const PAGE = 40;   // apps

async function list(query) {
  const sql = log.sql();
  const q      = String(query.q || '').trim() || null;
  const cohort = String(query.cohort || '') || null;
  const kind   = ['build', 'edit'].includes(query.kind) ? query.kind : null;
  const failed = query.failed === '1';
  const before = /^\d+$/.test(query.before || '') ? query.before : null;
  const page = await sql`
    SELECT a.id AS app_id, a.title, a.cohort, a.owner_id, a.is_local, max(v.id) AS last
    FROM app_versions v JOIN apps a ON a.id = v.app_id
    WHERE v.kind IN ('build', 'edit') AND v.request IS NOT NULL
      AND (${q}::text IS NULL OR v.request ILIKE '%' || ${q} || '%')
      AND (${cohort}::text IS NULL OR a.cohort = ${cohort})
      AND (${kind}::text IS NULL OR v.kind = ${kind})
      AND (${failed} = false OR v.error IS NOT NULL)
    GROUP BY a.id
    HAVING (${before}::bigint IS NULL OR max(v.id) < ${before}::bigint)
    ORDER BY last DESC LIMIT ${PAGE + 1}`;
  const apps = page.slice(0, PAGE);
  const prompts = apps.length ? await sql`
    SELECT v.id, v.app_id, v.n, v.kind, v.request, v.summary, v.error, v.model, v.usage, v.ms, v.created_at
    FROM app_versions v
    WHERE v.app_id = ANY(${apps.map(a => a.app_id)})
      AND v.kind IN ('build', 'edit') AND v.request IS NOT NULL
      AND (${q}::text IS NULL OR v.request ILIKE '%' || ${q} || '%')
      AND (${kind}::text IS NULL OR v.kind = ${kind})
      AND (${failed} = false OR v.error IS NOT NULL)
    ORDER BY v.n` : [];
  for (const a of apps) a.prompts = prompts.filter(p => p.app_id === a.app_id);
  const cohorts = await sql`
    SELECT a.cohort, count(*)::int AS n FROM app_versions v JOIN apps a ON a.id = v.app_id
    WHERE v.kind IN ('build', 'edit') AND v.request IS NOT NULL
    GROUP BY a.cohort ORDER BY n DESC`;
  return { apps, more: page.length > PAGE, cohorts };
}

function handler(req, res, json, local) {
  if (!local(req)) return json(403, { error: 'prompts are read from this machine only' });
  if (!log.enabled()) return json(503, { error: 'no DATABASE_URL in .env.local' });
  if (req.method !== 'GET') return json(405, { error: 'GET only' });
  const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
  list(query).then(d => json(200, d)).catch(e => json(500, { error: e.message }));
}

module.exports = { handler, list };
