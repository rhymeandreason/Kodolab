/* =============================================================================
 *  api/_mail.js — send one transactional email, through Resend
 * =============================================================================
 *  SENDING IS FROM A SUBDOMAIN, `mail.kodolab.org`, AND NEVER THE APEX. The
 *  apex is an iCloud mailbox: its MX is Apple's, and its SPF is the one record
 *  a domain is allowed to have. A sender added there would mean editing that
 *  record, and a second `v=spf1` TXT beside it is a permerror that breaks all
 *  mail including the inbound kind. The subdomain carries its own SPF and DKIM,
 *  so Apple's records are never touched, a bounce storm here cannot reach the
 *  personal inbox, and changing provider is a DNS edit under `mail` alone.
 *
 *  `Reply-To` is the apex address, because nobody should reply into a void.
 *
 *  FAILS CLOSED, unlike `_limit.js`, and the difference is what the failure
 *  costs. A limit that cannot be counted should not take a lesson away from a
 *  class mid-session, so that one allows the turn. A login code that was never
 *  delivered is an account nobody can get into, and reporting it as sent means
 *  the person waits for mail that will never arrive, then doubts the address
 *  they typed. The caller must surface what `send` returns.
 *
 *  NO RETRY. Resend answers with the id of a queued message, so a timeout is
 *  ambiguous: the send may well have happened. Retrying mails a second code and
 *  invalidates the first, which reads to the person as a code that stopped
 *  working while they were typing it. One attempt, and an error they can act on
 *  by asking again.
 *
 *  WITH NO KEY THE MESSAGE GOES TO THE CONSOLE, which is what a local checkout
 *  gets, the way no DATABASE_URL means no logging. A code printed by the dev
 *  server is a working sign-in on a laptop with no secrets in it. This is why
 *  `local(req)` has to gate it: on a deployment, a console send is a sign-in
 *  nobody receives and the person is told it worked.
 * ========================================================================== */
'use strict';

const FROM     = 'Kodo Lab <no-reply@mail.kodolab.org>';
const REPLY_TO = 'mary@kodolab.org';
const TIMEOUT_MS = 10e3;   // a serverless function should not hang on a hop

/* Only something shaped like a Resend key is. Their dashboard shows other
   secrets, and a webhook signing secret pasted in its place would otherwise
   fail as a 401 on the first real sign-in rather than here. */
function key() {
  const k = String(process.env.RESEND_API_KEY || '').trim();
  return /^re_[\w-]{10,}$/.test(k) ? k : null;
}

function enabled() { return !!key(); }

/* {ok: true} or {error}. `error` is for the log, never for the person: it
   carries the provider's words, which name the address and the account. */
async function send({ to, subject, text, html }) {
  const k = key();
  if (!k) {
    console.log(`[mail] no RESEND_API_KEY, so nothing was sent.\n  to: ${to}\n  ${subject}\n\n${text}\n`);
    return { ok: true, console: true };
  }
  let r;
  try {
    r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + k, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [to], reply_to: REPLY_TO, subject, text, ...(html ? { html } : {}) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    // Includes the timeout, which does not mean the mail was not sent.
    return { error: 'could not reach the mail provider: ' + ((err && err.message) || err) };
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) return { error: `resend ${r.status}: ${body.message || body.name || 'no reason given'}` };
  return { ok: true, id: body.id || null };
}

module.exports = { send, enabled, FROM };
