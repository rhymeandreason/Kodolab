/* =============================================================================
 *  api/_keys.js — which cohort is asking, if the tutor is gated at all
 * =============================================================================
 *  A TESTING LINK is a cohort label and a secret. Two places hold them: the
 *  `links` table, minted in tools/codes.html or `db.js link new`, and the older
 *  `TUTOR_KEYS=bio101-fall:<secret>,openday:<secret>` env var, still honoured
 *  so a deploy keeps working until `db.js link import` has copied it over. A
 *  link names a COHORT and never a person: the label is what the log records
 *  and what a rate limit attaches to, so a link that escapes is revoked on its
 *  own without cutting anyone else off.
 *
 *  THE GATE EXISTS WHEN EITHER SOURCE HAS ONE. With no env pair and no `links`
 *  row, every request is answered, which is what a fresh checkout gets. A
 *  revoked row still counts, so revoking every link locks the gate rather than
 *  opening it. Only deleting the rows opens it, and nothing in the tools does.
 *  If the database cannot be asked, the gate is on: fail closed.
 *
 *  This is a bearer token and nothing more. Everyone it is forwarded to has it.
 *  It protects SPEND, never anything private, and the provider's prepaid cap
 *  stays the real backstop. Leakage is expected; rotation is routine.
 * ========================================================================== */
'use strict';

const crypto = require('crypto');
const log    = require('./_log.js');

/* Parsed per call, not once at module load: the dev server re-reads .env.local
 * per request, so caching here would mean a pasted key needs a restart. */
function pairs() {
  const raw = process.env.TUTOR_KEYS || '';
  const out = [];
  for (const entry of raw.split(',')) {
    const at = entry.indexOf(':');
    if (at < 1) continue;                       // no label, or no colon: not a pair
    const label  = entry.slice(0, at).trim();
    const secret = entry.slice(at + 1).trim();
    if (label && secret) out.push({ label, secret });
  }
  return out;
}

/* Whether any link row exists. Held for a minute when true: it only ever turns
 * true once, and every ungated request would otherwise pay a query for it. */
let rowsSeen = 0;
async function anyRows() {
  if (!log.enabled()) return false;
  if (Date.now() - rowsSeen < 60e3) return true;
  try {
    const [r] = await log.sql()`SELECT EXISTS (SELECT 1 FROM links) AS any`;
    if (r.any) rowsSeen = Date.now();
    return r.any;
  } catch (err) {
    console.error('[keys] ' + ((err && err.message) || err));
    return true;
  }
}

/* Whether the gate exists. A malformed TUTOR_KEYS that yields no usable pair
 * counts as OFF rather than as "nobody may ask": a typo in an env var should
 * not look identical to a deliberate lockout. */
async function enabled() { return pairs().length > 0 || anyRows(); }

/* The cohort a secret names, or null. The env compare is constant time so a
 * wrong key cannot be walked to a right one a character at a time; the table
 * is looked up by the secret's hash, which leaks nothing an attacker can use. */
async function labelFor(secret) {
  const s = String(secret || '');
  if (!s) return null;
  let found = null;
  for (const p of pairs()) if (same(s, p.secret)) found = p.label;
  if (found || !log.enabled()) return found;
  try {
    // `last_used_at` moves at most every ten minutes, so a busy class is not a write per question.
    const [r] = await log.sql()`
      WITH hit AS (SELECT id, label, last_used_at FROM links WHERE secret_hash = ${hash(s)} AND revoked_at IS NULL),
      touch AS (UPDATE links SET last_used_at = now()
                WHERE id IN (SELECT id FROM hit WHERE last_used_at IS NULL OR last_used_at < now() - interval '10 minutes'))
      SELECT label FROM hit`;
    return r ? r.label : null;
  } catch (err) {
    console.error('[keys] ' + ((err && err.message) || err));
    return null;
  }
}

function same(a, b) {
  const A = Buffer.from(a), B = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length. Hash first: both sides become 32 bytes whatever went in.
  return crypto.timingSafeEqual(sha(A), sha(B));
}
function sha(buf) { return crypto.createHash('sha256').update(buf).digest(); }
const hash = s => crypto.createHash('sha256').update(String(s)).digest('hex');

/* ---- minting, for tools/codes-api.js and tools/db.js ----------------------- */

const LABEL = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;

/* A new link, or the env's own secret when importing. The secret is returned
 * once and stored hashed; a lost one is replaced, never looked up. Returns
 * {id, label, secret}, or null when that secret is already a row. */
async function mint({ label, note = null, secret = null }) {
  label = String(label || '').trim();
  if (!LABEL.test(label)) throw new Error('a link needs a label: letters, digits, . _ -, up to 40, e.g. bio101-fall');
  const s  = secret || crypto.randomBytes(18).toString('base64url');
  const id = crypto.randomBytes(8).toString('base64url');
  const [r] = await log.sql()`
    INSERT INTO links (id, label, secret_hash, note) VALUES (${id}, ${label}, ${hash(s)}, ${note || null})
    ON CONFLICT (secret_hash) DO NOTHING RETURNING id`;
  rowsSeen = Date.now();
  return r ? { id, label, secret: s } : null;
}

/* The header the browser sends. Not a query string: `?k=` lands in access logs,
 * browser history and screenshots, and a header lands in none of them. The page
 * strips it from the address bar after the first load. */
const HEADER = 'x-tutor-key';

/* The transport's half - the only part that touches a request object, for the
 * same reason `_local.js` is shaped this way: `handleAsk` receives a label. */
function cohort(req) {
  const h = (req && req.headers && req.headers[HEADER]) || '';
  return labelFor(Array.isArray(h) ? h[0] : h);
}

module.exports = { enabled, labelFor, cohort, mint, pairs, HEADER };
