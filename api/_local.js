/* =============================================================================
 *  api/_local.js — is this request coming from the machine serving it
 * =============================================================================
 *  The one question every endpoint asks before handing out something that is
 *  not for the public: the log's contents, the bench's ability to rewrite the
 *  tutor's prompt and pick a provider, a cookie without Secure. "I am the
 *  developer" means "I am on this machine".
 *
 *  TWO CHECKS, BOTH REQUIRED. The peer address, and that this is not a Vercel
 *  function. The address alone is not enough: Vercel's Node runtime hands a
 *  request to the function over a loopback socket, so on a deployed function
 *  `req.socket.remoteAddress` is 127.0.0.1 for every visitor on earth. That
 *  shipped once, and production issued cookies without Secure and let a keyed
 *  caller set the prompt. `VERCEL=1` is set by the platform on every
 *  deployment, not by anyone's settings, so it cannot be forgotten or copied
 *  the way an opt-in flag can.
 *
 *  A forwarding header is whatever the client wrote, so it is not consulted -
 *  trusting one here would hand the bench to anyone willing to type
 *  `X-Forwarded-For: 127.0.0.1`.
 * ========================================================================== */
'use strict';

function local(req) {
  if (process.env.VERCEL) return false;
  const a = (req && req.socket && req.socket.remoteAddress) || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
}

module.exports = { local };
