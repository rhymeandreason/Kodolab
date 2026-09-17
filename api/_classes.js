/* =============================================================================
 *  api/_classes.js — a class code, and what it admits to
 * =============================================================================
 *  A class code is the class-level twin of a seat code: same alphabet, same
 *  shape ('abcd-efgh'), one per class, shared by every student in it. It rides
 *  in `X-Class-Code` (from lib/site.js's `ss.class`) and admits a browser to a
 *  LESSON and its tutor, filed under the cohort 'class:<id>'.
 *
 *  IT NEVER ADMITS TO THE BUILDER. _access.js resolves testing links through
 *  keys.linkCohort, not keys.cohort, so a class code reaching /api/build is
 *  nobody. That is the whole reason this is not folded into a seat: a seat is
 *  one student's ownership of apps, and a class code owns nothing.
 *
 *  The alphabet and the normaliser are copied from _access.js rather than
 *  required from it: _keys.js requires this file, _access.js requires _keys.js,
 *  and a require back would be a cycle.
 * ========================================================================== */
'use strict';

const crypto = require('crypto');
const log    = require('./_log.js');

const HEADER   = 'x-class-code';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0 o 1 i l: read off a board

function mint() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length] + (i === 3 ? '-' : '');
  return s;
}

/* Forgiving about what a student typed or pasted: case, spaces, a missing hyphen. */
function norm(code) {
  const c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : null;
}

/* {id, name, teacher_id} or null. Null too when there is no database: a
 * checkout without one has no classes to be in. */
async function byCode(code) {
  const c = norm(code);
  if (!c || !log.enabled()) return null;
  const [row] = await log.sql()`SELECT id, name, teacher_id FROM classes WHERE code = ${c}`;
  return row || null;
}

function header(req) {
  const h = (req && req.headers && req.headers[HEADER]) || '';
  return String(Array.isArray(h) ? h[0] : h).trim();
}

/* The cohort label a request's class code names, or null. */
async function cohort(req) {
  const k = await byCode(header(req));
  return k ? 'class:' + k.id : null;
}

/* A class's code, minted on first ask for a class that predates the column.
 * A collision in 8e11 is a unique violation; try again rather than share. */
async function ensureCode(classId) {
  const db = log.sql();
  const [k] = await db`SELECT code FROM classes WHERE id = ${classId}`;
  if (!k) return null;
  if (k.code) return k.code;
  return reissue(classId);
}
async function reissue(classId) {
  const db = log.sql();
  for (let i = 0; ; i++) {
    const code = mint();
    try { await db`UPDATE classes SET code = ${code} WHERE id = ${classId}`; return code; }
    catch (err) { if (i >= 3 || !/unique|duplicate/i.test(String(err && err.message))) throw err; }
  }
}

module.exports = { byCode, cohort, ensureCode, reissue, norm, mint, HEADER };
