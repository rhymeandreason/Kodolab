/* =============================================================================
 *  api/auth.js — sign in with Google, redeem an invite, sign out
 * =============================================================================
 *  GET  /api/auth                      → {clientId, user}
 *  POST {action: 'google', credential} → verifies the ID token, sets the session cookie
 *  POST {action: 'redeem', code}       → a member invite, a teacher invite, or the pilot's teacher code
 *  POST {action: 'claim', apps}        → [{id, token}] this browser can edit and nobody owns → this account's
 *  POST {action: 'logout'}
 *
 *  `_accounts.js` is the checking; this is the transport.
 * ========================================================================== */
'use strict';

const accounts = require('./_accounts.js');
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

    const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
    const action = String(body.action || '');

    if (action === 'google') {
      let claims;
      try { claims = await accounts.verifyGoogle(body.credential); }
      catch (err) { return res.status(401).json({ error: 'Google sign-in failed: ' + err.message }); }
      const u = await accounts.upsertUser(claims);
      if (u.disabled_at) return res.status(403).json({ error: 'This account has been turned off.' });
      res.setHeader('Set-Cookie', accounts.cookie(await accounts.startSession(u.id), { secure }));
      return res.status(200).json({ user: accounts.describeUser(u) });
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

    return res.status(400).json({ error: 'action must be google, redeem, claim or logout' });
  } catch (err) {
    console.error('[auth] ' + ((err && err.message) || err));
    return res.status(500).json({ error: 'sign-in failed: ' + ((err && err.message) || 'unknown error') });
  }
};

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
