#!/usr/bin/env node
/* =============================================================================
 *  dev-server.js — static server + live reload, for development only
 * =============================================================================
 *  Run:  node tools/dev-server.js            (serves demos/ on :8817)
 *        node tools/dev-server.js 9000        (or any port)
 *
 *  Two jobs, both of which `python3 -m http.server` does badly:
 *
 *  1. LIVE RELOAD. Save a file, the browser reloads. A CSS-only change swaps the
 *     stylesheet in place instead of reloading, so the scene keeps its camera
 *     angle, its selected pair and its toggle states while you tune the paper
 *     texture — reloading the page to check a border colour means rebuilding
 *     every molecule and losing where you were.
 *
 *     AND ONLY THE PAGES THAT USE THE FILE RELOAD. With a dozen lessons open,
 *     a broadcast reload throws away eleven scenes to show you one change. So
 *     the server records what each page actually loaded — every subresource
 *     request carries a `Referer` naming the page that asked for it, which is
 *     the real dependency graph, not a parse of the script tags — and a save
 *     wakes only the pages whose set contains the changed file. Editing
 *     `kit/ribbon.js` reloads the two folding lessons and leaves
 *     `water-lab` alone; editing `kodo.css` swaps CSS everywhere, because
 *     every page loads it. A page the server has no record of (it
 *     restarted while the tab sat open) is reloaded — conservative is right
 *     when the alternative is a tab that silently stops updating.
 *
 *  2. NO CACHING. python's server sends Last-Modified and nothing else, so a
 *     browser will happily reuse a stale scene.js for the rest of the session.
 *     That has cost real debugging time on this project: a fix appears not to
 *     work, and the file on disk is already correct. Everything here is served
 *     `no-store`.
 *
 *  THE PUBLISHED FILES STAY STATIC. The reload client is injected into HTML
 *  *responses*, never written to disk — this repo deploys to GitHub Pages
 *  straight from the working tree, so anything committed is published. Serve
 *  with python (or open the file directly) and you get exactly what ships; the
 *  only difference is that you reload by hand.
 *
 *  Zero dependencies, by design: no package.json, no node_modules, nothing to
 *  install. Node's standard library is enough.
 *
 *  ONE EXCEPTION, AND IT IS LAZY. `/api/*` is handled by requiring the same
 *  handler Vercel runs, which does need the Anthropic SDK. That require happens
 *  on the first API request, not at startup, so serving lessons still works with
 *  no node_modules — you only need `npm i` to use the question box.
 * ========================================================================== */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');

// The repo root, not demos/ — because that is what GitHub Pages publishes, so
// this is the only root where a local URL is the URL that ships. The lesson
// index lives at the root and links to `demos/…`; serving demos/ instead made
// `/` mean two different pages locally and in production.
const ROOT  = path.resolve(__dirname, '../..');      // repo root
const DEMOS = path.resolve(__dirname, '..');         // demos/ — for the 404 list
const ASKED = process.argv[2] || process.env.PORT;   // explicit port, if any
const PORT  = Number(ASKED || 8817);

const TYPES = {
  '.html':'text/html; charset=utf-8',  '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8',    '.json':'application/json; charset=utf-8',
  '.svg':'image/svg+xml',              '.png':'image/png',
  '.jpg':'image/jpeg',  '.jpeg':'image/jpeg', '.gif':'image/gif',
  '.ico':'image/x-icon', '.woff2':'font/woff2', '.woff':'font/woff',
  '.md':'text/markdown; charset=utf-8', '.sdf':'text/plain; charset=utf-8',
  '.mp4':'video/mp4',
};

/* ---- .env.local ----------------------------------------------------------
 * Vercel injects environment variables for you; locally the key has to come
 * from somewhere, and it must not be a shell export you forget you set. Read
 * the same `.env.local` Vercel's own CLI uses. It is gitignored. Existing
 * environment values win, so `ANTHROPIC_API_KEY=… node …` still overrides. */
function loadEnv() {
  try {
    for (const line of fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
      if (line.trim().startsWith('#')) continue;
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
      if (m) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
    return true;
  } catch { return false; }   // no .env.local: the API route says so when it is called
}
// Re-read per API request, not once at startup, so pasting a key into
// .env.local takes effect on the next question with no restart.
loadEnv();

/* ---- the pretty URLs ------------------------------------------------------
 * Production serves `/water`, not `/demos/water-lab.html`, and the index links
 * the short form. Without this the index's own links 404 locally, which is the
 * one thing a local server exists to catch.
 *
 * The map is READ FROM vercel.json rather than copied into a table here, so the
 * two cannot drift: add a rewrite for the next lesson and this picks it up on
 * restart. Literal sources and `:param` sources (`/app/:id`) are both taken;
 * the regex forms are all `redirects`, which stay a deployment concern (locally
 * you want /demos/water-lab.html to serve the page, not bounce to /water).
 * A rewrite's query (`?id=:id`) is dropped, as the browser never sees it
 * deployed either: a page under a pattern rewrite reads its parameter from
 * the path, which is what build/apps-client.js does.
 *
 * Rewriting is invisible to the browser, which is what production does too: the
 * URL bar still says /water, so `location.pathname` — the key the reload client
 * reports — is /water, and the deps bookkeeping keys on the requested path, not
 * on the file that answered it. */
function loadRewrites() {
  const map = new Map();
  const patterns = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
    for (const r of cfg.rewrites || []) {
      if (/[(*?[\\]/.test(r.source)) continue;      // a regex, not a path
      const dest = r.destination.split('?')[0];
      if (r.source.includes(':')) {
        const re = new RegExp('^' + r.source.replace(/:[A-Za-z_]+/g, '[^/]+') + '$');
        patterns.push({ re, dest });
      } else map.set(r.source, dest);
    }
  } catch (e) {
    console.warn('vercel.json would not parse — serving without pretty URLs:', e.message);
  }
  return { get: url => map.get(url) || (patterns.find(p => p.re.test(url)) || {}).dest };
}
// Re-read when vercel.json changes, so a new route answers without a restart.
let rewrites = loadRewrites(), rewritesMtime = 0;
const REWRITES = { get(url) {
  const m = fs.statSync(path.join(ROOT, 'vercel.json')).mtimeMs;
  if (m !== rewritesMtime) { rewritesMtime = m; rewrites = loadRewrites(); }
  return rewrites.get(url);
} };

/* ---- the reload client, injected into HTML responses only ---------------- */
// EventSource rather than a WebSocket: it is one line of client code, it
// reconnects on its own when this server restarts, and it needs no dependency.
//
// A HIDDEN TAB CLOSES ITS STREAM, and that is not a nicety. A browser allows
// six simultaneous connections per host over HTTP/1.1, and an open EventSource
// holds one for as long as the tab lives. Six background tabs on localhost
// therefore starve the origin: the next page load hangs forever with no error
// and no log line, and restarting the server only helps until those tabs
// reconnect. So the stream lives only while the tab is visible, and on
// reopening it asks what it missed with `since`.
const CLIENT = `
<script>
(() => {
  let es = null, since = Date.now();
  const handle = data => {
    if (data === 'css') {
      // Re-point every stylesheet at a fresh URL. The page keeps its state —
      // camera, selection, toggles — which is the whole reason to special-case
      // CSS instead of reloading.
      for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
        const u = new URL(link.href, location.href);
        u.searchParams.set('_', Date.now());
        link.href = u.href;
      }
      console.info('[dev] css reloaded');
    } else if (window.__noLiveReload) {
      // A page that edits the repo would reload itself on its own save, which
      // is at best a flash and at worst a lost form. It opts out by name.
      console.info('[dev] change ignored — this page opted out of live reload');
    } else {
      location.reload();
    }
  };
  const open = () => {
    if (es) return;
    // The page names itself on connect, so the server can decide whether a given
    // change is any of this page's business.
    es = new EventSource('/__dev/reload?page=' + encodeURIComponent(location.pathname)
                         + '&since=' + since);
    es.onmessage = e => { since = Date.now(); handle(e.data); };
  };
  const close = () => { if (es) { es.close(); es = null; since = Date.now(); } };
  document.addEventListener('visibilitychange', () => document.hidden ? close() : open());
  if (!document.hidden) open();
})();
</script>
`;

/* ---- who loaded what ------------------------------------------------------ */
// page URL path → the set of URL paths that page requested. Built from the
// Referer header on each request, so it is what the browser actually fetched:
// dynamic imports, fetch()ed .bin files and PDB text all land in it, and a
// script tag that is present but commented out does not.
const deps = new Map();

// fs.watch reports paths relative to ROOT with the platform separator; URLs are
// '/'-separated and absolute. One canonical form: a leading-slash URL path.
const urlOf = file => '/' + file.split(path.sep).join('/');

function record(pagePath, urlPath) {
  let set = deps.get(pagePath);
  if (!set) deps.set(pagePath, set = new Set());
  set.add(urlPath);
}

/* ---- watch ---------------------------------------------------------------- */
const clients = new Set();          // { res, page }
let timer = null, changed = new Set();

// What changed lately, so a tab whose stream was closed while it was hidden can
// ask for the changes it slept through instead of coming back silently stale.
const recent = [];                  // { t, file }, oldest first
const RECENT_MS = 15 * 60 * 1000;
function kindOf(files) { return files.every(f => f.endsWith('.css')) ? 'css' : 'reload'; }

function notify(file) {
  recent.push({ t: Date.now(), file: urlOf(file) });
  while (recent.length && recent[0].t < Date.now() - RECENT_MS) recent.shift();
  changed.add(urlOf(file));
  clearTimeout(timer);
  // Debounced: editors write a file in several syscalls, and a save that touched
  // three files should be one reload, not three.
  timer = setTimeout(() => {
    const batch = changed; changed = new Set();
    let woke = 0;
    for (const c of clients) {
      const set = deps.get(c.page);
      // No record of this page — the server restarted under an open tab, and its
      // EventSource reconnected without re-requesting anything. Reload it rather
      // than let it go quietly stale.
      const hits = set ? [...batch].filter(f => set.has(f)) : [...batch];
      if (!hits.length) continue;
      const kind = kindOf(hits);
      c.res.write(`data: ${kind}\n\n`);
      console.log(`  → ${kind}: ${c.page}`);
      woke++;
    }
    if (!woke) console.log(`  → no page uses ${[...batch].join(', ')}`);
  }, 60);
}

const IGNORE = /(^|[\\/])(\.git|node_modules|\.DS_Store|__pycache__)([\\/]|$)/;
try {
  fs.watch(ROOT, { recursive: true }, (_evt, file) => {
    if (!file || IGNORE.test(file)) return;
    if (path.basename(file).startsWith('.')) return;   // editor swap files
    console.log(`changed: ${file}`);
    notify(file);
  });
} catch (e) {
  console.warn('watch failed — serving without live reload:', e.message);
}


/* ---- the door map's content -----------------------------------------------
 * The same contract as the question bank above and the same reasons: local
 * only, mtime-guarded, and absent from the deployed site by construction
 * because `api/` does not hold it. Its own handler rather than a parameter on
 * that one: the GET payloads differ (this hands over the concepts a question can
 * name, and the crossing counts the CMS ranks by), and folding them together
 * would mean one function that answers two shapes.
 */
function editable(req, res, json, which) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: which + ' is editable from this machine only' });
  }

  let io;
  try { io = require('./mapcontent-io.js'); }
  catch (e) { console.error(e); return json(500, { error: 'mapcontent-io.js would not load' }); }

  if (req.method === 'GET') {
    try {
      const { rows, concepts, doors, views, mtimeMs } = io.read();
      return json(200, { writable: true, mtimeMs, rows, concepts, doors,
                         views: Object.keys(views),
                         crossings: io.crossings(rows, concepts) });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });

  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 5e5) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(400, { error: 'body is not JSON' }); }
    // Either half, or both. Whichever is absent is left as the file has it, so
    // the CMS's two screens can save independently.
    if (!Array.isArray(body.rows) && !Array.isArray(body.concepts)) {
      return json(400, { error: 'body needs { rows } or { concepts }' });
    }

    try {
      const saved = io.write({ rows: body.rows, concepts: body.concepts, since: body.mtimeMs });
      console.log(`  mapcontent.js ← ${body.concepts ? saved.concepts + ' concepts' : ''}`
        + `${body.concepts && body.rows ? ' and ' : ''}`
        + `${body.rows ? saved.rows + ' questions' : ''} from the map CMS`);
      return json(200, { ok: true, ...saved });
    } catch (e) {
      if (e.code === 'STALE')   return json(409, { error: e.message });
      if (e.code === 'INVALID') return json(422, { error: e.message, problems: e.problems });
      console.error(e);
      return json(500, { error: e.message });
    }
  });
}

/* ---- the clip shelf -------------------------------------------------------
 * GET  → the rows on disk, the mtime a save has to match, and any files in
 *        clips/ that no row names.
 * POST → { action: 'ingest' | 'save' | 'delete' }.
 *
 * Ingest reaches the network and shells out to ffmpeg, which is why it is one
 * endpoint and not three: everything it does is unavailable to the deployed
 * site by construction, the same way the two editors above are.
 *
 * The written mp4 and poster DO deploy — unlike the pages that write them,
 * a clip is what a student sees.
 */
function clips(req, res, json) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: 'the clip shelf is editable from this machine only' });
  }

  let io;
  try { io = require('./clips-io.js'); }
  catch (e) { console.error(e); return json(500, { error: 'clips-io.js would not load' }); }

  const fail = e => {
    if (e.code === 'STALE')   return json(409, { error: e.message });
    if (e.code === 'INVALID') return json(422, { error: e.message, problems: e.problems });
    console.error(e);
    return json(500, { error: e.message });
  };

  if (req.method === 'GET') {
    try {
      const { rows, mtimeMs, orphans } = io.read();
      return json(200, { writable: true, mtimeMs, rows, orphans });
    } catch (e) { return fail(e); }
  }
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });

  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 5e5) req.destroy(); });
  req.on('end', async () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(400, { error: 'body is not JSON' }); }

    try {
      if (body.action === 'ingest') {
        const row = await io.ingest(body);
        console.log(`  clips/${row.slug}.mp4 ← ${row.giphyId || 'a local file'}`
          + ` (${row.w}x${row.h}, ${row.seconds}s, ${Math.round(row.bytes / 1024)} KB)`);
        return json(200, { ok: true, row });
      }
      if (body.action === 'delete') {
        if (!body.slug) return json(400, { error: 'delete needs { slug }' });
        io.remove(body.slug);
        console.log(`  clips/${body.slug}.* removed`);
        return json(200, { ok: true });
      }
      if (Array.isArray(body.rows)) {
        const saved = io.write(body.rows, { since: body.mtimeMs });
        console.log(`  clips.js \u2190 ${saved.rows} clip(s) from the shelf`);
        return json(200, { ok: true, ...saved });
      }
      return json(400, { error: "body needs { rows } or { action: 'ingest' | 'delete' }" });
    } catch (e) { return fail(e); }
  });
}

/* ---- the node graph's images ----------------------------------------------
 * GET  → the rows in nodegraph/images.js, the mtime a save has to match, and
 *        files in images/ that no row names.
 * POST → { action: 'ingest' | 'save' | 'delete' }.
 *
 * Same shape as /api/clips, and local-only for the same reason. The caller is
 * the clipper extension rather than a page in this repo, which changes nothing
 * here: an extension fetching from its service worker sends no Origin this
 * cares about, and the socket is still the only thing consulted.
 *
 * The written jpg/png DOES deploy — unlike the extension that writes it, an
 * image is what a student sees.
 */
function images(req, res, json) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: 'the image registry is editable from this machine only' });
  }

  let io;
  try { io = require('./images-io.js'); }
  catch (e) { console.error(e); return json(500, { error: 'images-io.js would not load' }); }

  const fail = e => {
    if (e.code === 'STALE')   return json(409, { error: e.message });
    if (e.code === 'INVALID') return json(422, { error: e.message, problems: e.problems });
    console.error(e);
    return json(500, { error: e.message });
  };

  if (req.method === 'OPTIONS') {
    // The clipper is an extension, so its preflight has nowhere else to go.
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (req.method === 'GET') {
    try {
      const { rows, mtimeMs, orphans } = io.read();
      return json(200, { writable: true, mtimeMs, rows, orphans });
    } catch (e) { return fail(e); }
  }
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });

  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 5e5) req.destroy(); });
  req.on('end', async () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(400, { error: 'body is not JSON' }); }

    try {
      if (body.action === 'ingest') {
        const row = await io.ingest(body);
        console.log(`  images/${row.slug}.${row.ext} \u2190 ${row.src || 'a local file'}`
          + ` (${row.w}x${row.h}, ${Math.round(row.bytes / 1024)} KB)`);
        return json(200, { ok: true, row });
      }
      if (body.action === 'delete') {
        if (!body.slug) return json(400, { error: 'delete needs { slug }' });
        io.remove(body.slug);
        console.log(`  images/${body.slug}.* removed`);
        return json(200, { ok: true });
      }
      if (Array.isArray(body.rows)) {
        const saved = io.write(body.rows, { since: body.mtimeMs });
        console.log(`  images.js \u2190 ${saved.rows} image(s) from the clipper`);
        return json(200, { ok: true, ...saved });
      }
      return json(400, { error: "body needs { rows } or { action: 'ingest' | 'delete' }" });
    } catch (e) { return fail(e); }
  });
}

/* ---- the gallery's still frames -------------------------------------------
 * POST → { key, webp } where webp is a data: URL, written to
 * proteins/stills/<key>.webp. Local-only, like every other writer here.
 *
 * WEBP, and the reason is both halves at once. PNG keeps the alpha and costs
 * 6.5 MB across the gallery, which is a worse first frame than the empty
 * rectangle this replaces; JPEG is affordable but has no alpha, so the still
 * would carry a baked-in paper colour and stop being usable the day a card
 * sits on anything else. WebP is a fifth of the PNG and keeps the transparency.
 * Safari has decoded it since 14; ENCODING is the capture bench's problem, and
 * it says so if the browser it runs in cannot.
 *
 * The stills DO deploy: they are the gallery's first frame, and the reason a
 * card that has not got a WebGL context yet shows the protein rather than an
 * empty rectangle. Three benches post here: `proteins/tools/stills.html` for
 * the protein gallery, `tools/component-stills.html` for the component shelf,
 * `tools/molecule-stills.html` for library.html's molecule grid, and `set`
 * says which. The directory is chosen from that whitelist rather
 * than taken from the body, so a key can never write outside one of them.
 */
function stills(req, res, json) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: 'stills are written from this machine only' });
  }
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 2e7) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(400, { error: 'body is not JSON' }); }

    // The key becomes a filename, so it is checked rather than trusted. Case
    // is kept: a molecule still is named by its MolLib key (dATP, alphaGlucose)
    // so the page can derive the path from the registry alone.
    if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(body.key || '')) {
      return json(400, { error: 'key must be letters, digits and dashes' });
    }
    const m = /^data:image\/webp;base64,(.+)$/.exec(body.webp || '');
    if (!m) return json(400, { error: 'webp must be a data:image/webp;base64 URL' });

    const SETS = { proteins: 'proteins/stills', components: 'media/components',
                   molecules: 'media/molecules' };
    const into = SETS[body.set || 'proteins'];
    if (!into) return json(400, { error: `set must be one of ${Object.keys(SETS).join(', ')}` });

    const dir = path.join(DEMOS, into);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${body.key}.webp`);
    const buf = Buffer.from(m[1], 'base64');
    fs.writeFileSync(file, buf);
    console.log(`  ${into}/${body.key}.webp \u2190 ${Math.round(buf.length / 1024)} KB`);
    return json(200, { ok: true, bytes: buf.length });
  });
}

/* ---- a screenshot of the caller's window ----------------------------------
 * POST { x, y, w, h } in screen points → image/png of that rectangle, from
 * macOS `screencapture`. For lessons.html's embed sheet, whose own capture
 * would ask permission on every click. The rectangle is the browser window;
 * the page finds what it wants inside it. macOS asks once for Screen Recording
 * for whatever runs this server, and until it is granted the capture comes
 * back with the desktop and no windows.
 */
function screenshot(req, res, json) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: 'screenshots are taken on this machine only' });
  }
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  if (process.platform !== 'darwin') return json(501, { error: 'screencapture is macOS only' });
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 1e4) req.destroy(); });
  req.on('end', () => {
    let r;
    try { r = JSON.parse(raw); } catch { return json(400, { error: 'body is not JSON' }); }
    const n = ['x', 'y', 'w', 'h'].map(k => Math.round(Number(r[k])));
    if (n.some(v => !Number.isFinite(v)) || n[2] <= 0 || n[3] <= 0) return json(400, { error: 'x, y, w, h must be numbers' });
    const file = path.join(require('os').tmpdir(), `kodo-shot-${process.pid}-${Date.now()}.png`);
    require('child_process').execFile('screencapture', ['-x', '-t', 'png', '-R', n.join(','), file], err => {
      if (err) return json(500, { error: 'screencapture failed: ' + err.message });
      let buf;
      try { buf = fs.readFileSync(file); fs.unlinkSync(file); }
      catch (e) { return json(500, { error: 'no capture written' }); }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
}

/* ---- the question bank ----------------------------------------------------
 * GET  → the rows on disk, and the mtime a save has to match.
 * POST → validate and rewrite demos/questions.js.
 *
 * questions-cms.html probes the GET to decide whether it can save at all; on
 * Vercel there is no endpoint, the probe fails, and the page falls back to
 * handing over the file text for a paste.
 */
function questions(req, res, json) {
  if (!require(path.join(ROOT, 'api/_local.js')).local(req)) {
    return json(403, { error: 'the question bank is editable from this machine only' });
  }

  let io;
  try { io = require('./questions-io.js'); }
  catch (e) { console.error(e); return json(500, { error: 'questions-io.js would not load' }); }

  if (req.method === 'GET') {
    try {
      const { rows, concepts, mtimeMs } = io.read();
      return json(200, { writable: true, mtimeMs, rows, concepts });
    } catch (e) {
      return json(500, { error: e.message });
    }
  }
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });

  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 5e5) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); }
    catch { return json(400, { error: 'body is not JSON' }); }
    if (!Array.isArray(body.rows)) return json(400, { error: 'body needs { rows }' });

    try {
      const saved = io.write(body.rows, { since: body.mtimeMs });
      console.log(`  questions.js ← ${saved.rows} rows from the CMS`);
      return json(200, { ok: true, ...saved });
    } catch (e) {
      if (e.code === 'STALE')   return json(409, { error: e.message });
      if (e.code === 'INVALID') return json(422, { error: e.message, problems: e.problems });
      console.error(e);
      return json(500, { error: e.message });
    }
  });
}

/* ---- serve ---------------------------------------------------------------- */
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url === '/__dev/reload') {
    const q = new URL(req.url, 'http://localhost');
    let page = q.searchParams.get('page') || '/';
    if (page.endsWith('/')) page += 'index.html';   // same key the serve path uses
    res.writeHead(200, { 'Content-Type':'text/event-stream',
                         'Cache-Control':'no-store', 'Connection':'keep-alive' });
    res.write(':ok\n\n');
    const client = { res, page };
    clients.add(client);
    req.on('close', () => clients.delete(client));

    // The tab was hidden and let its stream go. Anything it depends on that
    // changed in the meantime is delivered now, as one event.
    const since = Number(q.searchParams.get('since')) || 0;
    if (since) {
      const missed = recent.filter(r => r.t > since).map(r => r.file);
      const set = deps.get(page);
      const hits = set ? missed.filter(f => set.has(f)) : missed;
      if (hits.length) {
        res.write(`data: ${kindOf(hits)}\n\n`);
        console.log(`  → ${kindOf(hits)}: ${page} (missed while hidden)`);
      }
    }
    return;
  }

  if (url.startsWith('/api/')) return api(url, req, res);

  // The path that actually answers, which is the requested one unless vercel.json
  // maps it. Only file resolution follows the rewrite; everything the reload
  // client keys on stays the URL the browser asked for.
  const served = REWRITES.get(url) || url;

  // Attribute this request to the page that made it. An HTML response is its own
  // page and starts a fresh set — a reload should forget what the *previous*
  // version of the page loaded, or a removed script tag keeps waking it forever.
  if (/\.html?$/.test(served) || url.endsWith('/')) {
    const self = url.endsWith('/') ? url + 'index.html' : url;
    // Seeded with the file that answered as well as the page's own key: under a
    // rewrite those differ, and a save to demos/water-lab.html arrives as that
    // path while the open tab calls itself /water.
    deps.set(self, new Set([self, served]));
  } else if (req.headers.referer) {
    try {
      const from = new URL(req.headers.referer).pathname;
      record(from.endsWith('/') ? from + 'index.html' : from, url);
    } catch { /* unparseable referer — nothing to attribute */ }
  }

  // Resolve inside ROOT only — a dev server still should not serve the whole
  // disk to anything that can reach this port.
  const target = path.join(ROOT, served === '/' ? 'index.html' : served);
  if (!target.startsWith(ROOT)) { res.writeHead(403).end('forbidden'); return; }

  fs.stat(target, (err, st) => {
    if (err) return listOrMiss(url, res);
    if (st.isDirectory()) {
      const idx = path.join(target, 'index.html');
      return fs.existsSync(idx) ? send(idx, res, req) : listing(target, url, res);
    }
    send(target, res, req);
  });
});

/* ---- listen, and cope with a port already in use --------------------------
 * Something else holding the port is the normal case, not an exception: another
 * editor window, a python http.server from last week, a second copy of this.
 * Crashing with an unhandled 'error' event and a stack trace tells you almost
 * nothing, so:
 *   · no port asked for  → quietly try the next few and say which one won;
 *   · port asked for     → that was a deliberate choice, so say plainly what is
 *                          holding it and how to look, and stop.
 */
const MAX_TRIES = 10;
let tries = 0;

server.on('error', err => {
  if (err.code !== 'EADDRINUSE') throw err;
  const port = PORT + tries;
  if (ASKED) {
    console.error(`\n  Port ${port} is already in use.\n`);
    console.error(`  Something else is serving on it — another copy of this server,`);
    console.error(`  or a python http.server. To see what:\n`);
    console.error(`      lsof -nP -iTCP:${port} -sTCP:LISTEN\n`);
    console.error(`  Then stop it, or pick another port:\n`);
    console.error(`      node tools/dev-server.js ${port + 1}\n`);
    process.exit(1);
  }
  if (++tries > MAX_TRIES) {
    console.error(`\n  Ports ${PORT}–${PORT + MAX_TRIES} are all in use. `
      + `Pass one explicitly:\n\n      node tools/dev-server.js 9000\n`);
    process.exit(1);
  }
  console.log(`  port ${port} busy, trying ${PORT + tries}…`);
  server.listen(PORT + tries);
});

server.on('listening', () => {
  const port = server.address().port;
  console.log(`\n  dev server → http://localhost:${port}/`);
  console.log(`  serving     ${ROOT}`);
  console.log(`  live reload on; only pages that loaded the changed file react`);
  console.log(`  CSS swaps in place, everything else reloads`);
  console.log(`  (published files are untouched — the client is injected per response)\n`);
});

server.listen(PORT);

/* ---- /api/* --------------------------------------------------------------
 * Stands in for Vercel's function runtime, badly but honestly: it reads the body,
 * calls the very handler that ships, and sends back the JSON. Requiring the
 * handler is deliberately deferred and deliberately uncached, so editing
 * `api/_tutor.js` takes effect on the next request with no restart. */
/* ---- who may talk to a local endpoint ---------------------------------------
 * `api/_local.js` answers "is the peer this machine", and a browser on this
 * machine is. So every page open in that browser could reach these endpoints
 * too: a cross-site form post lands (JSON is parsed whatever the content type)
 * and DNS rebinding reads the replies, since the browser cannot tell a page's
 * own origin from a stranger's. Two headers the browser writes and a page
 * cannot forge settle it. Host must name loopback, and a request that carries
 * an Origin must have come from loopback or from the clipper extension. No
 * Origin means curl or a same-origin GET, which is what the check is for.
 */
const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
function fromThisOrigin(req) {
  const h = String(req.headers.host || '');
  if (!LOOPBACK_HOST.test(h)) return false;
  const o = req.headers.origin;
  if (!o) return true;
  if (/^chrome-extension:\/\//.test(o)) return true;
  try { return LOOPBACK_HOST.test(new URL(o).host); } catch { return false; }
}

function api(url, req, res) {
  const json = (status, body) => {
    res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8',
                            'Cache-Control':'no-store' });
    res.end(JSON.stringify(body));
  };
  if (!fromThisOrigin(req)) return json(403, { error: 'the dev server answers its own origin only' });
  // `url` arrives with the query already stripped, so anything reading a
  // parameter has to go back to `req.url` for it.
  // The question bank's editor. It exists ONLY here: `api/` holds the Vercel
  // functions, and this one is deliberately not among them, so the deployed
  // site has no way to write the repo — absent by construction, not by a flag.
  // `api/_local.js` is still asked, because "the dev server" is not the claim
  // as "the machine running it" the day this port is forwarded somewhere.
  if (url === '/api/questions') return questions(req, res, json);
  // Every access code, for tools/codes.html. Local only, and not deployed.
  if (url === '/api/codes') {
    delete require.cache[require.resolve('./codes-api.js')];
    return require('./codes-api.js').handler(req, res, json, require(path.join(ROOT, 'api/_local.js')).local);
  }
  // Every builder prompt, for tools/prompts.html. Local only, and not deployed.
  if (url === '/api/prompts') {
    delete require.cache[require.resolve('./prompts-api.js')];
    return require('./prompts-api.js').handler(req, res, json, require(path.join(ROOT, 'api/_local.js')).local);
  }
  if (url === '/api/mapcontent') return editable(req, res, json, 'mapcontent');
  if (url === '/api/clips') return clips(req, res, json);
  if (url === '/api/images') return images(req, res, json);
  if (url === '/api/stills') return stills(req, res, json);
  if (url === '/api/screenshot') return screenshot(req, res, json);

  if (url !== '/api/ask' && url !== '/api/log' && url !== '/api/find' &&
      url !== '/api/extend' && url !== '/api/land' &&
      url !== '/api/app' && url !== '/api/build' && url !== '/api/teacher' && url !== '/api/auth' &&
      url !== '/api/event')
    return json(404, { error: 'no such endpoint' });

  // Env and handler are both re-read per request, so pasting a key into
  // .env.local or editing a provider takes effect on the next question with no
  // restart. That matters most while you are switching providers.
  loadEnv();
  let tutor;
  try {
    for (const k of Object.keys(require.cache)) {
      if (k.startsWith(path.join(ROOT, 'api'))) delete require.cache[k];
    }
    tutor = require(path.join(ROOT, 'api/_tutor.js'));
  } catch (e) {
    console.error(e);
    return json(500, { error: 'the API handler would not load. Run `npm i` in the repo root.' });
  }

  // Everything but /api/ask is a plain Vercel handler, so it gets the shim
  // rather than a second copy of the routing. `remoteAddress` has to survive it:
  // api/log.js decides who may read the log from exactly that.
  if (url === '/api/log') {
    const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    let handler;
    try { handler = require(path.join(ROOT, 'api/log.js')); }
    catch (e) { console.error(e); return json(500, { error: 'the log endpoint would not load' }); }
    const shim = { setHeader: () => {}, status: c => ({ json: b => json(c, b) }) };
    return Promise.resolve(handler({ method: req.method, query, socket: req.socket }, shim))
      .catch(e => json(500, { error: e.message }));
  }

  /* Also plain Vercel handlers, but POST ones, so they need the body read
     before the shim can hand it over. Their own gates live inside them.
     /api/extend is the node graph reaching past itself: same shape as find,
     and it is here rather than folded into the tutor because it writes no
     turn and answers a map, not a lesson. */
  /* /api/app and /api/build are the builder: a page is a few hundred lines,
     so their body cap is the tutor's times five, and /api/app reads its id
     from the query, which the other three never do. */
  if (url === '/api/find' || url === '/api/extend' || url === '/api/land' ||
      url === '/api/app' || url === '/api/build' || url === '/api/teacher' || url === '/api/auth' ||
      url === '/api/event') {
    const file = 'api' + url.slice(4) + '.js';
    const query = Object.fromEntries(new URL(req.url, 'http://x').searchParams);
    const cap = url === '/api/app' || url === '/api/build' ? 5e5 : 1e5;
    let handler;
    try { handler = require(path.join(ROOT, file)); }
    catch (e) { console.error(e); return json(500, { error: 'the ' + url + ' endpoint would not load' }); }
    /* `.end()` as well as `.json()`: /api/land answers 204 with no body, and it
       answers BEFORE it writes — a beacon has nobody waiting for a reply, so a
       shim that only knew how to send JSON would hang it. */
    /* Headers a handler sets are kept for its reply: /api/auth's Set-Cookie is
       the session, and a shim that dropped it would sign nobody in. */
    const extra = {};
    const shim = {
      setHeader: (k, v) => { extra[k] = v; },
      status: c => ({
        json: b => { for (const [k, v] of Object.entries(extra)) if (k !== 'Cache-Control') res.setHeader(k, v); json(c, b); },
        end: () => { res.writeHead(c, extra); res.end(); },
      }),
    };
    const run = body => Promise.resolve(
      handler({ method: req.method, headers: req.headers, query, body, socket: req.socket }, shim)
    ).catch(e => console.error('[' + url + '] ' + e.message));
    if (req.method !== 'POST') return run(null);
    let raw = '';
    req.on('data', d => { raw += d; if (raw.length > cap) req.destroy(); });
    return req.on('end', () => run(raw));
  }

  // The bench is a localhost affordance, and here every request is localhost by
  // definition. Computed the same way the Vercel function computes it rather
  // than hardcoded true, so the two transports cannot drift.
  const bench = require(path.join(ROOT, 'api/_local.js')).local(req);

  // The same gate the deployment applies, against the same links table when
  // .env.local has a DATABASE_URL. The body is not read until a listener
  // attaches, so resolving the gate first loses none of it.
  (async () => {
    const who  = await require(path.join(ROOT, 'api/_keys.js')).cohort(req);
    const gate = await tutor.denied(who);
    if (gate) return json(gate.status, gate.body);

    if (req.method === 'GET')  return json(200, tutor.config(bench, who));
    if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });

    let raw = '';
    req.on('data', d => { raw += d; if (raw.length > 1e5) req.destroy(); });
    req.on('end', async () => {
      let payload = {};
      try { payload = JSON.parse(raw || '{}'); } catch { /* handled as a missing question */ }
      const out = await tutor.handleAsk(payload, { bench, cohort: who });
      console.log(`  api /api/ask → ${out.status}`);
      json(out.status, out.body);
    });
  })().catch(e => json(500, { error: e.message }));
}

/* Safari will not play a <video> from a server that answers its opening
 * `Range: bytes=0-1` probe with a 200 and the whole file — it gives up and
 * draws a black box with a play glyph, which looks exactly like a missing
 * file. Chrome tolerates the 200, so this is invisible until someone opens
 * Safari, which is the browser this repo is tested in. Ranges are honoured for
 * every type rather than just mp4: the rule is the transport's, not video's. */
function send(file, res, req) {
  const ext = path.extname(file).toLowerCase();
  const type = TYPES[ext] || 'application/octet-stream';
  const range = req && req.headers && req.headers.range;

  // HTML gets the reload client spliced in, so its length is not the file's
  // and it is never served as a range.
  if (range && ext !== '.html') {
    let size;
    try { size = fs.statSync(file).size; } catch (e) { res.writeHead(500).end(String(e)); return; }
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (m) {
      let start = m[1] === '' ? null : parseInt(m[1], 10);
      let end   = m[2] === '' ? null : parseInt(m[2], 10);
      // `bytes=-500` is the LAST 500 bytes, not the first 500.
      if (start === null) { start = Math.max(0, size - (end || 0)); end = size - 1; }
      if (end === null || end >= size) end = size - 1;
      if (start > end || start >= size) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` }).end();
        return;
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Range': `bytes ${start}-${end}/${size}`,
        'Content-Length': end - start + 1,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-store, must-revalidate',
      });
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }

  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(500).end(String(err)); return; }
    // A generated app runs in a sandboxed iframe on an opaque origin, so a
    // component that fetches a bake (Proteinbox) is making a cross-origin
    // request for a public file. vercel.json sends the same header deployed.
    const headers = { 'Content-Type': type,
                      'Accept-Ranges': ext === '.html' ? 'none' : 'bytes',
                      'Access-Control-Allow-Origin': '*',
                      'Cache-Control': 'no-store, must-revalidate' };
    if (ext === '.html') {
      let html = buf.toString('utf8');
      html = html.includes('</body>')
        ? html.replace('</body>', CLIENT + '</body>')
        : html + CLIENT;
      buf = Buffer.from(html, 'utf8');
    }
    res.writeHead(200, headers);
    res.end(buf);
  });
}

function listOrMiss(url, res) {
  res.writeHead(404, { 'Content-Type':'text/html; charset=utf-8',
                       'Cache-Control':'no-store' });
  res.end(`<pre>404 — no such file: ${url}\n\n`
    + fs.readdirSync(DEMOS).filter(f => f.endsWith('.html'))
        .map(f => `<a href="/demos/${f}">/demos/${f}</a>`).join('\n')
    + `</pre>${CLIENT}`);
}

function listing(dir, url, res) {
  const items = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
  res.writeHead(200, { 'Content-Type':'text/html; charset=utf-8',
                       'Cache-Control':'no-store' });
  res.end(`<pre>${url}\n\n`
    + items.map(f => `<a href="${path.posix.join(url, f)}">${f}</a>`).join('\n')
    + `</pre>${CLIENT}`);
}
