/* =============================================================================
 *  api/auth.js — sign in with Google or an email code, redeem an invite, sign out
 * =============================================================================
 *  GET  /api/auth                      → {clientId, user}
 *  POST {action: 'google', credential} → verifies the ID token, sets the session cookie
 *  POST {action: 'code', email}        → mails a six-digit code
 *  POST {action: 'verify', email, code} → sets the session cookie
 *  POST {action: 'redeem', code}       → a member invite, a teacher invite, or the pilot's teacher code
 *  POST {action: 'claim', apps}        → [{id, token}] this browser can edit and nobody owns → this account's
 *  POST {action: 'logout'}
 *
 *  `_accounts.js` is the checking; this is the transport.
 * ========================================================================== */
'use strict';

const accounts = require('./_accounts.js');
const mail     = require('./_mail.js');
const apps     = require('./_apps.js');
const log      = require('./_log.js');
const { local } = require('./_local.js');

const MAX_CLAIM = 50;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!log.enabled()) return res.status(503).json({ error: 'no database configured' });
  const secure = !local(req);

  try {
    if (req.method === 'GET') {
      const u = await accounts.userFrom(req);
      return res.status(200).json({ clientId: accounts.clientId(), user: accounts.describeUser(u) });
    }
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'GET or POST only' });
    }
    // `google` needs no cookie, so SameSite does not guard it: a form on another
    // site could post a credential for the attacker's account and sign this
    // browser into it, and `claim` would then hand it the apps built here. A
    // browser writes Origin on every cross-site POST and a page cannot forge it.
    if (!sameOrigin(req)) return res.status(403).json({ error: 'sign-in must come from this site' });

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const action = String(body.action || '');

    if (action === 'google') {
      let claims;
      try { claims = await accounts.verifyGoogle(body.credential); }
      catch (err) { return res.status(401).json({ error: 'Google sign-in failed: ' + err.message }); }
      const got = await accounts.upsertUser(claims);
      if (got.error) return res.status(409).json({ error: got.error });
      return signIn(res, got.user, secure);
    }

    // Asking for a code is not a sign-in, so it is deliberately not told
    // whether the address has an account: it makes one on `verify` either way.
    if (action === 'code') {
      // With no key, `_mail.js` prints the code. That is a working sign-in on
      // the dev machine and a silent dead end anywhere else, so say so instead.
      if (!mail.enabled() && !local(req))
        return res.status(503).json({ error: 'Email sign-in is not configured. Use Google, or email mary@kodolab.org.' });
      const got = await accounts.codeSend(body.email);
      if (got.error) return res.status(429).json({ error: got.error });
      const sent = await mail.send({
        to: got.email,
        subject: `Your Kodo Lab sign-in code: ${got.code}`,
        text: `${got.code}\n\nType this to sign in. It lasts ${got.minutes} minutes.\n\n`
            + `If you did not ask for it, nothing has happened to your account and you can ignore this.\n`,
      });
      accounts.codeSweep();   // nothing waits on it
      if (sent.error) {
        // FAILS CLOSED: a code nobody received must not be reported as sent.
        console.error('[auth] mail: ' + sent.error);
        return res.status(502).json({ error: 'Could not send the email. Try again in a moment.' });
      }
      return res.status(200).json({ sent: true, console: !!sent.console });
    }

    if (action === 'verify') {
      const got = await accounts.codeVerify(body.email, body.code);
      if (got.error) return res.status(401).json({ error: got.error });
      const u = await accounts.emailUser(got.email);
      if (!u) return res.status(500).json({ error: 'could not open the account' });
      return signIn(res, u, secure);
    }

    if (action === 'logout') {
      await accounts.endSession(req);
      res.setHeader('Set-Cookie', accounts.cookie(null, { secure }));
      return res.status(200).json({ user: null });
    }

    const u = await accounts.userFrom(req);
    if (!u) return res.status(401).json({ error: 'Sign in first.' });

    if (action === 'redeem') {
      const out = await accounts.redeem(u, body.code);
      if (out.error) return res.status(400).json({ error: out.error });
      return res.status(200).json({ user: accounts.describeUser(await accounts.userFrom(req)), teacher: out.teacher });
    }

    if (action === 'claim') {
      if (!u.admitted_at) return res.status(403).json({ error: 'Redeem an invite first.' });
      const list = (Array.isArray(body.apps) ? body.apps : []).slice(0, MAX_CLAIM);
      return res.status(200).json({ claimed: await apps.adopt(list, 'user:' + u.id) });
    }

    return res.status(400).json({ error: 'action must be google, code, verify, redeem, claim or logout' });
  } catch (err) {
    console.error('[auth] ' + ((err && err.message) || err));
    return res.status(500).json({ error: 'sign-in failed: ' + ((err && err.message) || 'unknown error') });
  }
};

/* The last two steps of every way in, so one place decides that a turned-off
   account is refused after the proof and not before: the person is told the
   account is off, not that the code was wrong. */
async function signIn(res, u, secure) {
  if (u.disabled_at) return res.status(403).json({ error: 'This account has been turned off.' });
  res.setHeader('Set-Cookie', accounts.cookie(await accounts.startSession(u.id), { secure }));
  return res.status(200).json({ user: accounts.describeUser(u) });
}

/* No Origin is curl, or a same-origin request from an old browser; either is fine. */
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { return new URL(o).host === String(req.headers.host || ''); } catch { return false; }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
