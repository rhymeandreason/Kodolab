/* =============================================================================
 *  api/feedback.js — a note from a reader
 * =============================================================================
 *  POST /api/feedback  {kind, body, email?, page, visitorId?, website?}
 *                      → {ok: true} · {error}
 *
 *  lib/feedback.js is the form. Not a beacon: the reader is waiting to see
 *  that it went, so the answer is real and a failure says what to do instead.
 *
 *  A ROW, THEN A MAIL. The row is the record and build/beta.html's Feedback tab
 *  reads it; the mail is the nudge. Resend's free 100 a day is the same quota
 *  sign-in codes spend, and `_accounts.js` keeps 90 of them, so feedback mails
 *  at most MAIL_DAY and every note past that waits in the table. Reply-To is
 *  the reader's address when they gave one, so answering is one click.
 *
 *  SAVED IF EITHER HALF WORKED. No database (a local checkout) still mails, to
 *  the console without a key; a failed mail still has the row. Only both
 *  failing is an error, and it names the address to write to by hand.
 *
 *  `website` is a field the form hides. A person never fills it; a form-spam
 *  bot fills everything, and is told it worked.
 *
 *  The visitor cap is friction, as in `_limit.js`: the id is the browser's own.
 *  The day cap is what stops a script filling the table.
 * ========================================================================== */
'use strict';

const log      = require('./_log.js');
const mail     = require('./_mail.js');
const accounts = require('./_accounts.js');

const KINDS = { wrong: 'Something is wrong', wish: 'Wishlist', love: 'Love' };
const MAX_BODY   = 4000;
const MAX_EMAIL  = 200;
const MAX_PAGE   = 200;
const VISITOR_HOUR = 8;
const ALL_DAY      = 300;
const MAIL_DAY     = 10;
const TO = 'mary@kodolab.org';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]{2,}$/;

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'POST only' });
  }

  const b = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  if (b.website) return res.status(200).json({ ok: true });

  const kind = KINDS[b.kind] ? b.kind : null;
  const body = String(b.body || '').trim().slice(0, MAX_BODY);
  if (!kind || !body) return res.status(400).json({ error: 'Write a few words first.' });
  let email = String(b.email || '').trim().slice(0, MAX_EMAIL);
  if (email && !EMAIL.test(email)) return res.status(400).json({ error: 'That email does not look right. Leave it blank if you like.' });
  email = email || null;
  const page = String(b.page || '').slice(0, MAX_PAGE) || '/';
  const visitor = UUID.test(String(b.visitorId || '')) ? b.visitorId : null;

  const db = log.sql();
  let id = null, mailOk = false;

  if (db) {
    try {
      const [n] = await db`
        SELECT count(*) FILTER (WHERE visitor_id = ${visitor} AND created_at > now() - interval '1 hour')::int AS mine,
               count(*) FILTER (WHERE created_at > now() - interval '1 day')::int AS day
        FROM feedback WHERE created_at > now() - interval '1 day'`;
      if ((visitor && n.mine >= VISITOR_HOUR) || n.day >= ALL_DAY)
        return res.status(429).json({ error: 'That is a lot of notes at once. Try again later, or email ' + TO + '.' });
      const user = await accounts.userFrom(req).catch(() => null);
      [{ id }] = await db`
        INSERT INTO feedback (kind, body, email, page, user_id, visitor_id)
        VALUES (${kind}, ${body}, ${email || (user && user.email) || null}, ${page}, ${user ? user.id : null}, ${visitor})
        RETURNING id`;
      if (!email && user) email = user.email;
    } catch (err) {
      console.error('[feedback] store failed:', err.message);
    }
  }

  let mailable = true;
  if (db && id) {
    try {
      const [m] = await db`SELECT count(*)::int AS n FROM feedback WHERE mailed AND created_at >= ${utcDay()}`;
      mailable = m.n < MAIL_DAY;
    } catch (err) { mailable = false; }
  }
  if (mailable) {
    const first = body.split('\n')[0].slice(0, 60);
    const sent = await mail.send({
      to: TO,
      replyTo: email || undefined,
      subject: `[${KINDS[kind]}] ${first}${first.length < body.length ? '…' : ''}`,
      text: `${body}\n\n--\nPage: https://kodolab.org${page}\nFrom: ${email || 'no address given'}${id ? '\nRow: feedback #' + id : ''}\n`,
    });
    mailOk = !!sent.ok;
    if (!mailOk) console.error('[feedback] mail failed:', sent.error);
    if (mailOk && db && id) await db`UPDATE feedback SET mailed = true WHERE id = ${id}`.catch(() => {});
  }

  if (!id && !mailOk) return res.status(503).json({ error: 'It did not go through. Email ' + TO + ' instead?' });
  return res.status(200).json({ ok: true });
};

/* Resend's quota resets at 00:00 UTC; see `_accounts.js`'s utcDay. */
function utcDay() {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function safeParse(s) { try { return JSON.parse(s); } catch (e) { return {}; } }
