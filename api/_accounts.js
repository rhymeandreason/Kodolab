/* =============================================================================
 *  api/_accounts.js — Google sign-in, sessions, invites
 * =============================================================================
 *  THE GOOGLE ID TOKEN IS CHECKED HERE, WITH NO LIBRARY. It is a JWT signed
 *  RS256 by a key in Google's published JWKS; Node verifies that with a JWK
 *  directly. What is checked is the whole of what makes it Google's word about
 *  THIS site: the signature, `iss`, `aud` equal to our client id, `exp`, and a
 *  verified email. Skip `aud` and any site's Google token signs in here.
 *
 *  A SESSION IS A COOKIE, NOT A HEADER, because Google sign-in is a login and a
 *  login should not be readable by page script. HttpOnly, SameSite=Lax, and
 *  Secure everywhere but loopback: Safari will not store a Secure cookie from
 *  http://localhost. Lax is also what keeps a stored app out of it — the
 *  sandboxed frame is an opaque origin, so its requests are cross-site.
 *
 *  `_schema.sql` says what the rows mean.
 * ========================================================================== */
'use strict';

const crypto = require('crypto');
const log    = require('./_log.js');

const COOKIE = 'kl_session';
const SESSION_DAYS = 30;
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

const hash   = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const mintId = () => crypto.randomBytes(8).toString('base64url');

/* Served to every browser, so only something shaped like a client id is: the
   console's client SECRET sits beside it and is easily pasted in its place. */
function clientId() {
  const id = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) ? id : null;
}

/* ---- the token ---------------------------------------------------------- */

let jwks = { keys: [], until: 0 };
async function googleKeys(force) {
  if (!force && jwks.until > Date.now() && jwks.keys.length) return jwks.keys;
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('could not fetch Google keys');
  const age = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwks = { keys: (await r.json()).keys || [], until: Date.now() + (age ? +age[1] : 3600) * 1000 };
  return jwks.keys;
}

async function verifyGoogle(credential) {
  const aud = clientId();
  if (!aud) throw new Error('GOOGLE_CLIENT_ID is not set');
  const parts = String(credential || '').split('.');
  if (parts.length !== 3) throw new Error('not a token');
  let head, body;
  try { head = JSON.parse(Buffer.from(parts[0], 'base64url')); body = JSON.parse(Buffer.from(parts[1], 'base64url')); }
  catch { throw new Error('not a token'); }
  if (head.alg !== 'RS256') throw new Error('unexpected algorithm');
  // A kid we have not seen is a key Google rotated in since the cache filled.
  let jwk = (await googleKeys()).find(k => k.kid === head.kid);
  if (!jwk) jwk = (await googleKeys(true)).find(k => k.kid === head.kid);
  if (!jwk) throw new Error('unknown signing key');
  const ok = crypto.verify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }), Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  if (!ISSUERS.includes(body.iss)) throw new Error('wrong issuer');
  if (body.aud !== aud) throw new Error('token is for another site');
  if (!(body.exp * 1000 > Date.now())) throw new Error('token expired');
  if (!body.sub || body.email_verified === false) throw new Error('email not verified');
  return body;
}

/* ---- users and sessions -------------------------------------------------- */

async function upsertUser(claims) {
  const db = log.sql();
  // The teacher row comes back in the same statement, so sign-in can answer without reading again.
  const [u] = await db`
    WITH u AS (
      INSERT INTO users (id, google_sub, email, name, picture)
      VALUES (${mintId()}, ${claims.sub}, ${claims.email || null}, ${claims.name || null}, ${claims.picture || null})
      ON CONFLICT (google_sub) DO UPDATE SET email = EXCLUDED.email, name = EXCLUDED.name, picture = EXCLUDED.picture
      RETURNING id, email, name, picture, admitted_at, disabled_at)
    SELECT u.*, t.id AS teacher_id FROM u LEFT JOIN teachers t ON t.user_id = u.id`;
  return u;
}

async function startSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await log.sql()`INSERT INTO sessions (token_hash, user_id, expires_at)
                  VALUES (${hash(token)}, ${userId}, now() + ${SESSION_DAYS + ' days'}::interval)`;
  return token;
}

function readCookie(req) {
  const raw = (req && req.headers && req.headers.cookie) || '';
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([^;]+)').exec(raw);
  return m ? decodeURIComponent(m[1]) : null;
}

function cookie(token, { secure }) {
  const attrs = ['Path=/', 'HttpOnly', 'SameSite=Lax', secure ? 'Secure' : null].filter(Boolean).join('; ');
  return token ? `${COOKIE}=${token}; Max-Age=${SESSION_DAYS * 86400}; ${attrs}`
               : `${COOKIE}=; Max-Age=0; ${attrs}`;
}

/* The signed-in person, or null. Carries the teacher row when there is one. */
async function userFrom(req) {
  const token = readCookie(req);
  if (!token || !log.enabled()) return null;
  const [u] = await log.sql()`
    SELECT u.id, u.email, u.name, u.picture, u.admitted_at, u.invite_label, t.id AS teacher_id, t.name AS teacher_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN teachers t ON t.user_id = u.id
    WHERE s.token_hash = ${hash(token)} AND s.expires_at > now() AND u.disabled_at IS NULL`;
  return u || null;
}

async function endSession(req) {
  const token = readCookie(req);
  if (token && log.enabled()) await log.sql()`DELETE FROM sessions WHERE token_hash = ${hash(token)}`;
}

function describeUser(u) {
  return u ? { name: u.name || u.email, email: u.email, picture: u.picture || null, admitted: !!u.admitted_at, teacher: !!u.teacher_id } : null;
}

/* ---- invites -------------------------------------------------------------- */

const normCode = c => String(c || '').trim().toLowerCase().replace(/\s+/g, '');

/* One code, whichever kind it is, and ONE STATEMENT for each kind. The neon
   driver gives every statement its own transaction, so the use is counted in
   the same statement that makes the teacher row and admits the account: a
   redeem that fails part way undoes whole, and a single-use teacher invite is
   never spent on nobody. The same statement checks a use is left, so two
   people pressing Enter at once cannot both take the last one.

   A use is only counted when it changes something. A member invite admits an
   account that is not yet admitted; a teacher invite, or the pilot's code,
   makes a teacher of an account that is not one. The check reads the tables,
   not `user`, which may be a request old. Returns {ok, teacher} or {error}. */
async function redeem(user, code) {
  const db = log.sql();
  const raw = String(code || '').trim();
  const c = normCode(raw).replace(/^([a-z0-9]{4})([a-z0-9]{4})$/, '$1-$2');

  const inv = await once(db`
    WITH inv AS (
      UPDATE invites SET uses = uses + 1
      WHERE code = ${c} AND revoked_at IS NULL AND (max_uses IS NULL OR uses < max_uses)
        AND CASE kind WHEN 'teacher' THEN NOT EXISTS (SELECT 1 FROM teachers WHERE user_id = ${user.id})
                      ELSE NOT EXISTS (SELECT 1 FROM users WHERE id = ${user.id} AND admitted_at IS NOT NULL) END
      RETURNING kind, label),
    t AS (
      INSERT INTO teachers (id, name, user_id)
      SELECT ${mintId()}::text, ${user.name || user.email || 'Teacher'}::text, ${user.id}::text FROM inv WHERE kind = 'teacher'
      RETURNING id),
    u AS (
      UPDATE users SET admitted_at = COALESCE(users.admitted_at, now()),
                       invite_label = COALESCE(users.invite_label, CASE WHEN inv.kind = 'teacher' THEN 'teachers' ELSE inv.label END)
      FROM inv WHERE users.id = ${user.id}
      RETURNING users.id)
    SELECT kind FROM inv`);
  if (inv.error) return inv;
  if (inv.row) return { ok: true, teacher: inv.row.kind === 'teacher' };

  // The pilot's long teacher code: the account becomes that teacher and takes its apps.
  const pilot = await once(db`
    WITH t AS (
      UPDATE teachers SET user_id = ${user.id}, code_hash = NULL
      WHERE code_hash = ${hash(raw)} AND user_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM teachers WHERE user_id = ${user.id})
      RETURNING id),
    a AS (
      UPDATE apps SET owner_id = ${'user:' + user.id} FROM t WHERE apps.owner_id = 'teacher:' || t.id
      RETURNING apps.id),
    u AS (
      UPDATE users SET admitted_at = COALESCE(users.admitted_at, now()),
                       invite_label = COALESCE(users.invite_label, 'teachers')
      FROM t WHERE users.id = ${user.id}
      RETURNING users.id)
    SELECT id FROM t`);
  if (pilot.error) return pilot;
  if (pilot.row) return { ok: true, teacher: true };

  const [seen] = await db`SELECT kind, revoked_at, uses, max_uses FROM invites WHERE code = ${c}`;
  if (!seen) return { error: 'That invite code is not right.' };
  if (seen.revoked_at) return { error: 'That invite has been turned off.' };
  if (seen.max_uses != null && seen.uses >= seen.max_uses) return { error: 'That invite has already been used.' };
  return { error: seen.kind === 'teacher' ? 'You are already a teacher.' : 'You can already build. This is not a teacher invite.' };
}

/* The first row of a redeem statement. Two teacher codes redeemed by one
   account at the same moment both pass the NOT EXISTS; the second insert
   meets the first's row, and its statement undoes without counting a use. */
async function once(query) {
  try { return { row: (await query)[0] || null }; }
  catch (err) {
    if (/teachers_user_id_key/.test(String(err && err.message))) return { error: 'You are already a teacher.' };
    throw err;
  }
}

function mintInviteCode() {
  return require('./_access.js').mintSeatCode();
}

module.exports = { COOKIE, clientId, verifyGoogle, upsertUser, startSession, userFrom, endSession,
                   cookie, describeUser, redeem, mintInviteCode };
