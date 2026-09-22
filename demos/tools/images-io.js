/* =====================================================================
 *  images-io.js — fetch an image, downscale it, and rewrite
 *  demos/nodegraph/images.js. The one place that knows the file's shape.
 *
 *  Same contract as clips-io.js: local only, mtime-guarded, header prose
 *  spliced around, written to a temp file and renamed. The dev server's
 *  /api/images is the only caller, and the clipper extension is the only
 *  caller of that.
 *
 *  ffmpeg does the downscale, because clips-io.js already made it a
 *  dependency of curating media here and a second image library would buy
 *  nothing. PNG stays PNG so a diagram keeps its transparency; everything
 *  else lands as JPEG.
 *
 *  The WORDS come off the page, not the wire: title, credit and licence are
 *  scraped as a suggestion by the extension and confirmed by a human before
 *  a row is ever saved. No image header states its licence, and a guess
 *  committed as fact is worse than a blank field.
 * ===================================================================== */
'use strict';

const fs = require('fs');
const os = require('os');
const vm = require('vm');
const path = require('path');
const { execFile } = require('child_process');

const FILE = path.resolve(__dirname, '../nodegraph/images.js');
const DIR  = path.resolve(__dirname, '../nodegraph/images');

const OPEN  = '  const IMAGES = [';
const CLOSE = '\n  ];';

/* These deploy. A card thumb is a few hundred pixels and the largest an
   image ever gets is a modal, so 1024 is generous and keeps a figure well
   under a couple of hundred KB. The original URL stays in the row, so a
   bigger copy is always one refetch away. */
const MAX_W = 1024;
const JPEG_Q = 3;

const EXTS = ['.jpg', '.png'];

/* ---- reading ---------------------------------------------------------- */

// Run rather than parse: the same thing the browser does with the file.
function parse(src) {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'images.js' });
  if (!sandbox.Images || !Array.isArray(sandbox.Images.IMAGES)) {
    throw new Error('images.js ran but exposed no Images.IMAGES');
  }
  return sandbox.Images.IMAGES;
}

function read() {
  const src = fs.readFileSync(FILE, 'utf8');
  const { mtimeMs } = fs.statSync(FILE);
  const rows = parse(src);
  return { src, mtimeMs, rows, orphans: orphans(rows) };
}

/* Files in images/ that no row names. An ingest writes its file before the
   human decides to keep the row, so an abandoned clip leaves one behind. */
function orphans(rows) {
  if (!fs.existsSync(DIR)) return [];
  const named = new Set(rows.map(r => r.slug + '.' + (r.ext || 'jpg')));
  return fs.readdirSync(DIR).filter(f => !f.startsWith('.') && !named.has(f));
}

/* ---- the wire --------------------------------------------------------- */

/* Wikimedia serves a 403 to a bare fetch, and it is the single biggest
   source this will ever pull from, so every request identifies itself. */
const UA = 'Kodolab-clipper/1.0 (educational curation; local only)';

const TYPES = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/jpg': 'jpg',
  'image/webp': 'jpg', 'image/gif': 'jpg', 'image/avif': 'jpg',
};

async function download(url, dir) {
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': UA } });
  } catch (e) {
    const err = new Error('could not reach ' + url + ': ' + e.message);
    err.code = 'INVALID';
    throw err;
  }
  if (!res.ok) {
    const e = new Error(new URL(url).hostname + ' answered ' + res.status);
    e.code = 'INVALID';
    throw e;
  }
  const type = String(res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const kind = TYPES[type];
  if (!kind) {
    const e = new Error(type
      ? 'that URL serves ' + type + ', which is not an image ffmpeg reads'
      : 'that URL served no content type');
    e.code = 'INVALID';
    throw e;
  }
  const raw = path.join(dir, 'raw.' + kind);
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()));
  return { raw, kind };
}

/* ---- ffmpeg ----------------------------------------------------------- */

const run = (bin, args) => new Promise((resolve, reject) => {
  execFile(bin, args, { maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
    if (err) {
      const e = new Error(bin + ' failed: ' + String(stderr || err.message).trim().split('\n').pop());
      e.code = 'INVALID';
      return reject(e);
    }
    resolve(stdout);
  });
});

async function probe(file) {
  const out = await run('ffprobe', ['-v', 'error',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=width,height',
    '-of', 'json', file]);
  const s = (JSON.parse(out).streams || [])[0] || {};
  return { w: s.width || 0, h: s.height || 0 };
}

/* Always re-encoded, never copied: it is what strips a stray colour profile,
   an animated GIF's later frames, and whatever EXIF the source carried. */
async function downscale(src, out, ext, maxWidth) {
  const w = Math.max(64, Math.min(2048, maxWidth || MAX_W));
  const args = ['-y', '-i', src,
    '-vf', `scale='min(${w},iw)':-2:flags=lanczos`,
    '-frames:v', '1'];
  if (ext === 'png') args.push('-c:v', 'png');
  else args.push('-q:v', String(JPEG_Q), '-pix_fmt', 'yuvj420p');
  args.push(out);
  await run('ffmpeg', args);
}

/* ---- ingest -----------------------------------------------------------
   Writes the file and hands back a row. Does NOT touch images.js: the
   clipper previews the result at card size first, and only a save commits
   it. */

const slugify = s => String(s || '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

async function ingest(opts = {}) {
  const bad = m => { const e = new Error(m); e.code = 'INVALID'; throw e; };

  if (!opts.url && !opts.file) bad('needs a url or a file');
  const slug = slugify(opts.slug || opts.title);
  if (!slug) bad('needs a title or a slug to name the file after');
  if (!opts.replace && read().rows.some(r => r.slug === slug)) {
    bad('slug already taken: ' + slug);
  }

  fs.mkdirSync(DIR, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'image-'));
  try {
    let raw, kind;
    if (opts.file) {
      raw = path.resolve(opts.file);
      if (!fs.existsSync(raw)) bad('no such file: ' + opts.file);
      kind = path.extname(raw).toLowerCase() === '.png' ? 'png' : 'jpg';
    } else {
      ({ raw, kind } = await download(opts.url, tmp));
    }

    const ext = kind === 'png' ? 'png' : 'jpg';
    const out = path.join(DIR, slug + '.' + ext);
    await downscale(raw, out, ext, opts.maxWidth);

    /* A row the human has not confirmed yet. Everything the extension
       scraped arrives as a suggestion and is echoed back unchanged. */
    return {
      id: 'i:' + slug,
      slug,
      ext,
      src: opts.url || '',
      page: opts.page || '',
      title: opts.title || '',
      caption: opts.caption || '',
      credit: opts.credit || '',
      license: opts.license || '',
      /* How the image meets the card's 4:3 thumb: `cover` crops to fill,
         `contain` letterboxes. A micrograph crops happily; a labelled
         diagram loses its labels, so that one is `contain`. */
      fit: opts.fit === 'contain' ? 'contain' : 'cover',
      ...(await probe(out)),
      bytes: fs.statSync(out).size,
      fetched: new Date().toISOString().slice(0, 10),
    };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function remove(slug) {
  for (const ext of EXTS) {
    const f = path.join(DIR, slugify(slug) + ext);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
}

/* ---- validating ------------------------------------------------------- */

function validate(rows) {
  const out = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const at = p => out.push({ row: i, slug: r.slug, problem: p });
    if (!r.slug || slugify(r.slug) !== r.slug) return at('slug is missing or not filename-safe');
    if (r.id !== 'i:' + r.slug) at('id must be i: + slug');
    if (seen.has(r.slug)) at('duplicate slug'); else seen.add(r.slug);
    if (!r.title) at('needs a title');
    if (!['jpg', 'png'].includes(r.ext)) at('ext is not jpg or png');
    else if (!fs.existsSync(path.join(DIR, r.slug + '.' + r.ext))) {
      at('missing file: ' + r.slug + '.' + r.ext);
    }
    if (r.page && !/^https?:\/\//.test(r.page)) at('page is not a URL');
    if (!(r.w > 0 && r.h > 0)) at('has no dimensions');
    if (r.fit && !['cover', 'contain'].includes(r.fit)) at('fit is not cover or contain');
  });
  return out;
}

/* ---- writing ---------------------------------------------------------- */

const quote = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";

const KEYS = ['id', 'slug', 'ext', 'src', 'page', 'title', 'caption', 'credit',
              'license', 'fit', 'w', 'h', 'bytes', 'fetched'];

function serialise(rows) {
  return rows.map(r => {
    const lead = r.caption ? `    /* ${r.caption.replace(/\*\//g, '* /')} */\n` : '';
    // Wrapped rather than one long line: a generated file still gets read,
    // and a 300-column row is a diff nobody can see a change in.
    const parts = KEYS.filter(k => r[k] !== '' && r[k] != null)
      .map(k => k + ': ' + (typeof r[k] === 'number' ? r[k] : quote(r[k])) + ',');
    const lines = [];
    for (const p of parts) {
      if (lines.length && (lines[lines.length - 1] + ' ' + p).length <= 78) {
        lines[lines.length - 1] += ' ' + p;
      } else lines.push('      ' + p);
    }
    return lead + '    {\n' + lines.join('\n') + '\n    },';
  }).join('\n');
}

function splice(src, rows) {
  const open = src.indexOf(OPEN);
  if (open < 0) throw new Error('images.js has no IMAGES array to replace');
  const from = open + OPEN.length;
  const close = src.indexOf(CLOSE, from);
  if (close < 0) throw new Error('the IMAGES array is not closed as expected');
  return src.slice(0, from) + '\n' + serialise(rows) + src.slice(close);
}

function write(rows, { since } = {}) {
  const current = read();
  if (since != null && Math.abs(current.mtimeMs - since) > 1) {
    const e = new Error('images.js changed on disk since it was loaded');
    e.code = 'STALE';
    throw e;
  }
  const problems = validate(rows);
  if (problems.length) {
    const e = new Error(problems.length + ' row(s) would not pass the checker');
    e.code = 'INVALID';
    e.problems = problems;
    throw e;
  }
  const next = splice(current.src, rows);
  parse(next);                      // it must still run before it is kept
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, next);
  fs.renameSync(tmp, FILE);
  return { mtimeMs: fs.statSync(FILE).mtimeMs, rows: rows.length };
}

module.exports = { read, ingest, remove, validate, write, slugify };
