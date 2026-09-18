/* =============================================================================
 *  api/_accounts.js — Google and email sign-in, sessions, invites
 * =============================================================================
 *  TWO WAYS IN, ONE PERSON. Google, and a code mailed to an address. The email
 *  is what joins them: `users_email_key` makes it unique, so a teacher who used
 *  Google in September and typed the same address in October lands on the ROW
 *  SHE ALREADY HAS, with her apps on it, instead of a second account. Both ways
 *  prove the address before they attach - Google by `email_verified`, a code by
 *  arriving - which is the whole licence for matching on it.
 *
 *  NEITHER WAY ADMITS ANYBODY. Signing in makes an account; `admitted_at` comes
 *  from redeeming an invite, and that is unchanged.
 *
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

/* A code is short because it is typed from a phone onto a laptop, and short is
   safe only with all three of these: ten minutes, five guesses, one live code
   per address. A million codes and five guesses is one chance in 200,000 per
   send, and the cooldown is what stops that being retried in bulk. */
const CODE_TTL_MIN   = 10;
const MAX_ATTEMPTS   = 5;
const COOLDOWN_S     = 60;
const MAX_SENDS_DAY  = 10;   // to one address
/* Under Resend's free 100 a day, which is a hard cap and not a bill: past it a
   sign-in silently does not arrive, so the endpoint must refuse before then.

   COUNTED IN SENDS, NOT ADDRESSES, and on Resend's own day. This read rows
   once, which is one per address, so thirty people asking four times each was
   120 emails at Resend and 30 here: the guard reported headroom while sign-in
   was already dead, and only on the morning it mattered. Resend's quota is a
   UTC CALENDAR day that resets at 00:00 UTC, not a rolling window, so both
   counters key to `utcDay` rather than `now() - '1 day'`. */
const MAX_EMAILS_DAY = 90;
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

/* The one spelling of an address, everywhere: the table, the index, the code's
   row and the cooldown. Anything else gives `Mary@` its own account. */
const normEmail = e => String(e || '').trim().toLowerCase();
const looksLikeEmail = e => /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/.test(e);

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

/* An account, read the way every caller wants it: the teacher row joined on, so
   sign-in answers without a second query. */
async function readUser(id) {
  const [u] = await log.sql()`
    SELECT u.id, u.email, u.name, u.picture, u.admitted_at, u.invite_label, u.disabled_at,
           u.google_sub, t.id AS teacher_id
    FROM users u LEFT JOIN teachers t ON t.user_id = u.id WHERE u.id = ${id}`;
  return u || null;
}

/* Google's word about a person, turned into the account. Returns {user} or
   {error}.

   THREE CASES, IN THIS ORDER, and the order is the point. A known `google_sub`
   is a returning user and wins even if the address on the token changed. Then a
   known ADDRESS with no Google on it is the account that signed in by code, and
   this is the link: the token's `email_verified` is what makes attaching safe.
   Only then is it somebody new.

   IT REFUSES RATHER THAN MERGES. Two rows, one address - a Google account whose
   address changed to one another row already holds - is two people's apps and
   two people's classes, and picking either is a wrong answer that looks fine.
   Nobody can reach it by accident, so it asks for a human instead. */
async function upsertUser(claims) {
  const db = log.sql();
  const sub = String(claims.sub);
  const email = normEmail(claims.email);
  const name = claims.name || null;
  const picture = claims.picture || null;

  const [mine] = await db`SELECT id, lower(email) AS email FROM users WHERE google_sub = ${sub}`;
  if (mine) {
    if (email && email !== mine.email) {
      const [other] = await db`SELECT id FROM users WHERE lower(email) = ${email} AND id <> ${mine.id}`;
      if (other) return { error: 'Another account already uses ' + email + '. Email mary@kodolab.org to merge them.' };
    }
    await db`UPDATE users SET email = COALESCE(${email || null}, email), name = ${name}, picture = ${picture}
             WHERE id = ${mine.id}`;
    return { user: await readUser(mine.id) };
  }

  if (email) {
    const [byEmail] = await db`SELECT id, google_sub FROM users WHERE lower(email) = ${email}`;
    if (byEmail) {
      if (byEmail.google_sub) return { error: 'That address is already linked to a different Google account.' };
      await db`UPDATE users SET google_sub = ${sub}, name = COALESCE(name, ${name}), picture = ${picture}
               WHERE id = ${byEmail.id} AND google_sub IS NULL`;
      return { user: await readUser(byEmail.id) };
    }
  }

  // Two first sign-ins for one person at once: one insert lands, the other
  // takes no row, and reading back finds the row that did.
  const [made] = await db`
    INSERT INTO users (id, google_sub, email, name, picture)
    VALUES (${mintId()}, ${sub}, ${email || null}, ${name}, ${picture})
    ON CONFLICT DO NOTHING RETURNING id`;
  if (made) return { user: await readUser(made.id) };
  const [raced] = await db`SELECT id FROM users WHERE google_sub = ${sub} OR lower(email) = ${email}`;
  return raced ? { user: await readUser(raced.id) } : { error: 'could not create the account' };
}

/* The account for an address whose code just arrived. No Google on it, and none
   needed: the code proved the address, which is the same proof `email_verified`
   gives. A row already there is hers, whether she made it with Google or not. */
async function emailUser(email) {
  const db = log.sql();
  const e = normEmail(email);
  // NO CONFLICT TARGET, AND THAT IS THE LINK. A Google account already on this
  // address trips `users_email_key`; an untargeted DO NOTHING swallows it and
  // the read below finds her row. Narrowed to `ON CONFLICT (id)`, the email
  // index would throw instead, and Google-then-code becomes a failed sign-in.
  const [made] = await db`
    INSERT INTO users (id, email) VALUES (${mintId()}, ${e})
    ON CONFLICT DO NOTHING RETURNING id`;
  if (made) return await readUser(made.id);
  const [found] = await db`SELECT id FROM users WHERE lower(email) = ${e}`;
  return found ? await readUser(found.id) : null;
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

/* The signed-in person, or null. Carries the teacher row when there is one.
   `disabled: true` also returns a turned-off account, with `disabled_at` set,
   for `_access.js` to refuse by name; every other caller treats it as nobody. */
async function userFrom(req, { disabled = false } = {}) {
  const token = readCookie(req);
  if (!token || !log.enabled()) return null;
  const [u] = await log.sql()`
    SELECT u.id, u.email, u.name, u.picture, u.admitted_at, u.invite_label, u.disabled_at, t.id AS teacher_id, t.name AS teacher_name
    FROM sessions s JOIN users u ON u.id = s.user_id
    LEFT JOIN teachers t ON t.user_id = u.id
    WHERE s.token_hash = ${hash(token)} AND s.expires_at > now() AND (${disabled} OR u.disabled_at IS NULL)`;
  return u || null;
}

async function endSession(req) {
  const token = readCookie(req);
  if (token && log.enabled()) await log.sql()`DELETE FROM sessions WHERE token_hash = ${hash(token)}`;
}

function describeUser(u) {
  return u ? { name: u.name || u.email, email: u.email, picture: u.picture || null, admitted: !!u.admitted_at, teacher: !!u.teacher_id } : null;
}

/* ---- email codes --------------------------------------------------------- */

/* Midnight UTC today, as a Date the driver sends as a parameter. Computed here
   rather than written as `date_trunc(...)` inside the statement because a
   tagged template makes every ${} a parameter, and a parameter cannot become
   SQL - which is the property worth keeping. This is the boundary Resend's
   quota resets on, and every counter below keys to it. */
function utcDay() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/* A six-digit code, uniform. `randomInt` over the whole range and then padded,
   never `Math.random`, and never a digit at a time: both make some codes likelier. */
const mintCode = () => String(crypto.randomInt(0, 1e6)).padStart(6, '0');

/* Mint a code for an address, or say why not. Returns {code, email} for the
   caller to mail, or {error} in words a person can act on.

   THE ROW IS THE RATE LIMIT. One row per address, so the upsert's own WHERE is
   the cooldown and the per-address daily cap, checked in the statement that
   would replace the code rather than in a read before it: two taps on Send at
   once cannot both pass. Storing the code hashed means a database dump is not a
   pile of live sign-ins.

   THE DAILY CAP ACROSS ADDRESSES IS A READ, and so is racy by a few. That is
   the right trade: it guards Resend's 100-a-day, and overshooting by three
   costs nothing while refusing a real teacher costs her the lesson. */
async function codeSend(email) {
  const db = log.sql();
  const e = normEmail(email);
  if (!looksLikeEmail(e)) return { error: 'That does not look like an email address.' };
  const day = utcDay();

  // Every send counts, this address's included: Resend meters them all.
  const [{ n }] = await db`SELECT coalesce(sum(sends), 0)::int AS n FROM login_codes WHERE sent_at >= ${day}`;
  if (n >= MAX_EMAILS_DAY) return { error: 'Too many sign-ins today. Try again after midnight UTC, or email mary@kodolab.org.' };

  const code = mintCode();
  const [row] = await db`
    INSERT INTO login_codes (email, code_hash, expires_at)
    VALUES (${e}, ${hash(code)}, now() + ${CODE_TTL_MIN + ' minutes'}::interval)
    ON CONFLICT (email) DO UPDATE
      SET code_hash  = EXCLUDED.code_hash,
          expires_at = EXCLUDED.expires_at,
          attempts   = 0,
          sends      = CASE WHEN login_codes.sent_at >= ${day} THEN login_codes.sends + 1 ELSE 1 END,
          sent_at    = now()
      WHERE login_codes.sent_at < now() - ${COOLDOWN_S + ' seconds'}::interval
        AND (login_codes.sent_at < ${day} OR login_codes.sends < ${MAX_SENDS_DAY})
    RETURNING email`;
  if (row) return { code, email: e, minutes: CODE_TTL_MIN };

  // The upsert declined. Which guard it was is a read, and only now.
  const [live] = await db`SELECT sends, sent_at >= ${day} AS today FROM login_codes WHERE email = ${e}`;
  if (live && live.today && live.sends >= MAX_SENDS_DAY)
    return { error: 'Too many codes sent to that address today. Try again after midnight UTC.' };
  return { error: 'A code was just sent. Wait a minute, then ask again.' };
}

/* Check a typed code. Returns {ok} or {error}.

   THE ATTEMPT IS COUNTED BY THE STATEMENT THAT FETCHES THE HASH, so a wrong
   guess costs a try even if this function never finishes, and five guesses is
   five however they are made. Comparing with `timingSafeEqual` on the hashes,
   which are one length, so the compare cannot leak how much of a code is right.

   SPENDING IT IS CONDITIONAL ON THE HASH IT MATCHED, which is what makes a code
   single use: two requests holding the same right code both reach the clear,
   and only the one that finds the hash still there takes the row. */
async function codeVerify(email, code) {
  const db = log.sql();
  const e = normEmail(email);
  const typed = String(code || '').replace(/\D/g, '');
  if (typed.length !== 6) return { error: 'A code is six digits.' };

  const [row] = await db`
    UPDATE login_codes SET attempts = attempts + 1
    WHERE email = ${e} AND code_hash IS NOT NULL AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
    RETURNING code_hash, attempts`;
  if (!row) return { error: 'That code has expired or been used. Ask for a new one.' };

  const want = Buffer.from(row.code_hash, 'utf8');
  const got  = Buffer.from(hash(typed), 'utf8');
  if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
    const left = MAX_ATTEMPTS - row.attempts;
    return { error: left > 0 ? `That code is not right. ${left} ${left === 1 ? 'try' : 'tries'} left.`
                             : 'Too many wrong tries. Ask for a new code.' };
  }
  const [spent] = await db`UPDATE login_codes SET code_hash = NULL
                           WHERE email = ${e} AND code_hash = ${row.code_hash} RETURNING email`;
  if (!spent) return { error: 'That code has already been used. Ask for a new one.' };
  return { ok: true, email: e };
}

/* Rows from before today have nothing left to say: the code is spent or
   expired and both caps key to midnight UTC, so nothing counts them any more.
   Keyed to the same boundary rather than to a rolling day, or a sweep could
   take a row the day's total still needs. Called on send; nothing schedules it. */
async function codeSweep() {
  try { await log.sql()`DELETE FROM login_codes WHERE sent_at < ${utcDay()}`; }
  catch (err) { console.error('[accounts] sweep: ' + ((err && err.message) || err)); }
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
  if (!seen) {
    // Not an invite, and not a pilot code this account could take: say what it is, if it is anything.
    const [pilotCode] = await db`SELECT 1 AS one FROM teachers WHERE code_hash = ${hash(raw)}`;
    if (pilotCode) return { error: 'You are already a teacher, so this pilot teacher code cannot be added to your account.' };
    const [seat] = await db`SELECT 1 AS one FROM seats WHERE code = ${c}`;
    if (seat) return { error: 'That is a class code. Students type it in the Students box, with no Google sign-in.' };
    return { error: 'That invite code is not right.' };
  }
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

module.exports = { COOKIE, clientId, verifyGoogle, upsertUser, emailUser, readUser, startSession,
                   userFrom, endSession, cookie, describeUser, redeem, mintInviteCode,
                   codeSend, codeVerify, codeSweep, CODE_TTL_MIN };
