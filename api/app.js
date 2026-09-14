/* =============================================================================
 *  api/app.js — a stored app: read it, fork it, roll it back
 * =============================================================================
 *  GET  /api/app?id=X                 → the latest page, for anyone with the id
 *  GET  /api/app?id=X&versions=1      → the history, token required
 *  GET  /api/app?id=X&n=3             → one version's page, token required
 *  POST /api/app {action, id, token?, ...}
 *       restore {n}                   → a new version copying an old one
 *       remix   {visitorId}           → a new app whose parent is this one, with its own token
 *       rotate                        → a fresh token; the old link stops working
 *       remove                        → the app and every version of it, gone
 *       title   {title}
 *       thumb   {thumb, meta}          → the scene as a JPEG data URL and the words on
 *                                       the card in front of it, for the shelf; token required
 *       text    {edits}                → the student's own text edits, applied as a version
 *  GET  /api/app?ids=a,b,c            → title, thumb, thumb_meta and last-edited, for the shelf
 *  GET  /api/app?mine=1               → the same, for every app the class or teacher code owns
 *
 *  An owner (`_access.js`: a seat or a teacher code) may do whatever the token
 *  may, on the apps it owns. The token still works alone.
 *
 *  Nothing here calls a model, so nothing here is rate limited. Reading is
 *  open: an id is unguessable and a view link is meant to be shared. A REMIX
 *  NEEDS THE ACCESS KEY, the same one the builder wants, because a copy that
 *  cannot be edited is a dead end and the beta is closed; the viewer shows a
 *  waitlist notice instead of making one.
 *  The token travels in the `X-App-Token` header or the body, never a query
 *  string, for the reason `_keys.js` gives.
 *
 *  NOTHING HERE TAKES HTML FROM A CALLER. Every page in the store was written
 *  by a model from the reference; a version is only ever a copy of one. A
 *  `save` that accepted a page was here and was never wired to anything, so it
 *  went: it was the one path by which bytes nobody generated could reach an
 *  app id other people open by link. Direct manipulation is `text`, and it is
 *  the patch that comment asked for: find/replace pairs from the WYSIWYG mode,
 *  applied by `_builder.js` under the same exactly-once rule the model's edits
 *  meet, then syntax-checked before they are stored. The caller says which
 *  passage changes and to what, never what the file becomes.
 *  The one image here is the thumb, and it is the SCENE ONLY: a data URL under
 *  80 KB on the app row, token-gated, read back only by a browser that holds
 *  the id. The panel over it travels beside it as text in `thumb_meta`, so the
 *  shelf redraws the card in its own DOM instead of showing a rasterised one.
 * ========================================================================== */
'use strict';

const apps    = require('./_apps.js');
const builder = require('./_builder.js');
const keys    = require('./_keys.js');
const access  = require('./_access.js');
const { local } = require('./_local.js');

const MAX_TEXT_EDITS = 200;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!apps.enabled()) return res.status(503).json({ error: 'no database configured' });

  const query = req.query || {};
  const body  = req.method === 'POST'
    ? (typeof req.body === 'string' ? safeParse(req.body) : (req.body || {})) : {};
  const id    = String(query.id || body.id || '');
  const token = header(req, 'x-app-token') || body.token || null;
  let who = null;
  try { who = await access.resolve(req); }
  catch (err) { console.error('[app] access: ' + ((err && err.message) || err)); }
  const owner = access.admitted(who) ? who.owner : null;

  if (req.method === 'GET' && query.mine) {
    if (!owner) return res.status(401).json(access.refusal(who));
    try { return res.status(200).json({ apps: await apps.owned(owner) }); }
    catch (err) { console.error('[app] ' + ((err && err.message) || err)); return res.status(500).json({ error: 'the app store failed' }); }
  }

  if (req.method === 'GET' && query.ids) {
    try { return res.status(200).json({ apps: await apps.shelf(String(query.ids).split(',')) }); }
    catch (err) { console.error('[app] ' + ((err && err.message) || err)); return res.status(500).json({ error: 'the app store failed' }); }
  }
  if (!apps.validId(id)) return res.status(400).json({ error: 'id is required' });

  try {
    if (req.method === 'GET') {
      const app = await apps.read(id);
      if (!app || !app.version) return res.status(404).json({ error: 'no such app' });

      if (query.versions || query.n) {
        if (!(await apps.mayEdit(id, token, owner))) return res.status(403).json({ error: 'the history is the editor\'s' });
        if (query.n) {
          const v = await apps.version(id, Number(query.n));
          return v ? res.status(200).json(v) : res.status(404).json({ error: 'no such version' });
        }
        return res.status(200).json({ id, title: app.title, versions: await apps.versions(id) });
      }
      return res.status(200).json({
        id, title: app.title, parent: app.parent_id, created_at: app.created_at,
        n: app.version.n, kind: app.version.kind, summary: app.version.summary,
        html: app.version.html,
        mine: !!owner && app.owner_id === owner,
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'GET or POST only' });
    }

    const action = String(body.action || '');

    if (action === 'remix') {
      if (((await keys.enabled()) || who) && !access.admitted(who)) return res.status(401).json({ ...access.refusal(who), beta: true });
      const app = await apps.read(id);
      if (!app || !app.version) return res.status(404).json({ error: 'no such app' });
      const made = await apps.create({
        cohort: access.admitted(who) ? who.cohort : null, ownerId: owner,
        visitorId: body.visitorId, parentId: id, isLocal: local(req),
        title: String(body.title || app.title || '').slice(0, 120),
        version: { kind: 'remix', html: app.version.html, summary: `remixed from ${id}` },
      });
      return res.status(200).json({ id: made.id, token: made.token, n: made.version.n });
    }

    if (!(await apps.mayEdit(id, token, owner))) return res.status(403).json({ error: 'this link cannot edit that app' });

    if (action === 'restore') {
      const old = await apps.version(id, Number(body.n));
      if (!old) return res.status(404).json({ error: 'no such version' });
      const v = await apps.addVersion(id, { kind: 'restore', html: old.html, summary: `restored version ${old.n}` });
      return res.status(200).json({ id, n: v.n, html: old.html });
    }

    if (action === 'remove') {
      await apps.remove(id);
      return res.status(200).json({ id, removed: true });
    }

    if (action === 'rotate') {
      return res.status(200).json({ id, token: await apps.rotate(id) });
    }

    if (action === 'title') {
      await apps.setTitle(id, body.title);
      return res.status(200).json({ id, title: String(body.title || '').slice(0, 120) });
    }

    /* The text mode's save. One version for the session, however many
     * passages it touched, because a row per keystroke makes the history
     * useless for the one thing it is for. A find that no longer matches
     * exactly once means the page moved under the editor — another tab, or a
     * model turn — so the whole batch is refused and the browser reloads
     * rather than half of it landing. */
    if (action === 'text') {
      const edits = (Array.isArray(body.edits) ? body.edits : []).slice(0, MAX_TEXT_EDITS)
        .map(e => ({ find: String(e.find || ''), replace: String(e.replace || '').slice(0, 4000) }));
      if (!edits.length) return res.status(400).json({ error: 'no text edits to save' });
      const app = await apps.read(id);
      if (!app || !app.version) return res.status(404).json({ error: 'no such app' });

      const out = builder.apply(app.version.html, edits);
      if (out.failed) {
        return res.status(409).json({
          error: 'the page changed under the editor; reload and try again',
          failed: out.failed.map(f => `edit ${f.i + 1} found ${f.count} matches`),
        });
      }
      /* A quote that got past the editor's escaping is a page that parses
       * nowhere, and it would be stored before anyone ran it. */
      const problems = builder.syntax(out.html);
      if (problems.length) return res.status(400).json({ error: problems.join('; ') });

      /* The history line names the passage that changed, not the count: what
       * a student looks for when going back is the sentence they remember. */
      const first = edits[0].find.replace(/<[^>]*>/g, '').trim().replace(/\s+/g, ' ').slice(0, 60);
      const v = await apps.addVersion(id, {
        kind: 'text', html: out.html,
        summary: `“${first}”${edits.length > 1 ? ` and ${edits.length - 1} more` : ''}`,
      });
      return res.status(200).json({ id, n: v.n, html: out.html, edits: edits.length });
    }

    if (action === 'thumb') {
      const t = String(body.thumb || '');
      if (t && !(/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(t) && t.length <= 80000)) {
        return res.status(400).json({ error: 'thumb must be a JPEG data URL under 80 KB' });
      }
      /* The words are rebuilt here rather than stored as sent: the frame that
         posts them runs a page the model wrote, and the shelf puts them in its
         own DOM. Clamped to the fields the card has room for. */
      const m = body.meta && typeof body.meta === 'object' ? body.meta : null;
      const str = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
      const meta = m && {
        brand:   str(m.brand, 80),
        eyebrow: str(m.eyebrow, 60),
        title:   str(m.title, 120),
        body:    str(m.body, 320),
        steps:   Math.max(0, Math.min(24, Number(m.steps) || 0)),
        nav:     !!m.nav,
        /* The stored image is the SCENE, with no panel in it. Only a capture
           says so: the words can also be read out of the source, and that says
           nothing about what the picture beside them contains. Thumbs taken
           before the shelf drew its own panel are full pages with a rasterised
           one baked in, and drawing over those gave two panels. */
        scene:   true,
      };
      await apps.setThumb(id, t, meta);
      return res.status(200).json({ id, thumb: !!t });
    }

    return res.status(400).json({ error: 'action must be restore, remix, rotate, remove, title, thumb or text' });
  } catch (err) {
    console.error('[app] ' + ((err && err.message) || err));
    return res.status(500).json({ error: 'the app store failed' });
  }
};

function header(req, name) {
  const h = (req && req.headers && req.headers[name]) || '';
  return Array.isArray(h) ? h[0] : (h || null);
}
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
