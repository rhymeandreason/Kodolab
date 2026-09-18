#!/usr/bin/env node
/* =============================================================================
 *  check-auth.js — the sign-in rules, asserted
 * =============================================================================
 *  `node api/check-auth.js`
 *
 *  THE FAILURE THIS EXISTS TO CATCH IS SILENT. A teacher signs in with Google
 *  in September and types the same address in October; if the email stops being
 *  unique, or `upsertUser` stops preferring the row that already holds it, she
 *  gets a SECOND account and her apps stay on the first. Both sign-ins work.
 *  Both look right. Nothing says anything until she asks where her apps went.
 *
 *  IT NEVER SENDS MAIL. `RESEND_API_KEY` is dropped from the environment for
 *  the run, so `_mail.js` takes its console path; the checker asserts the
 *  sender's shape and never its delivery.
 *
 *  THE DATABASE HALF NEEDS A DATABASE and is skipped without one, the way
 *  check-ask.js skips its `links` half. It writes, which no other checker does,
 *  so it writes ONLY to an address at `.invalid` - reserved by RFC 2606 and
 *  therefore an address no account can ever legitimately hold. That is what
 *  makes deleting its rows at both ends safe: a row there is a previous run's,
 *  never a person's.
 * ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '..');
delete process.env.RESEND_API_KEY;    // before _mail.js is first required

const accounts = require(path.join(ROOT, 'api/_accounts.js'));
const mail     = require(path.join(ROOT, 'api/_mail.js'));
const log      = require(path.join(ROOT, 'api/_log.js'));

const E = 'check-auth@example.invalid';

let fail = 0;
const bad = m => { console.log(`  FAIL  ${m}`); fail++; };
const ok  = m => console.log(`  ok    ${m}`);
const is  = (cond, m) => cond ? ok(m) : bad(m);

/* ---- the sender, offline ------------------------------------------------- */
async function sender() {
  console.log('\nsender\n');
  is(mail.enabled() === false, 'no key means no sender');

  process.env.RESEND_API_KEY = 'sk_a_signing_secret_pasted_by_mistake';
  is(mail.enabled() === false, 'a secret that is not a Resend key is refused');
  process.env.RESEND_API_KEY = 're_0123456789abcdef';
  is(mail.enabled() === true, 'a key shaped like Resend\'s is accepted');
  delete process.env.RESEND_API_KEY;

  // The address, not the display name: pinning the name here would make this
  // a second place to change it when the product is renamed.
  is(/<no-reply@mail\.kodolab\.org>$/.test(mail.FROM), 'sending is from a subdomain, never the apex iCloud mailbox');

  // The console path is a working sign-in on a dev machine, so it must not throw.
  const out = await mail.send({ to: E, subject: 'check', text: 'check' });
  is(out.ok === true && out.console === true, 'with no key the message goes to the console, and says so');

  /* A 429 IS TWO DIFFERENT THINGS, and the page tells the person what to do
     next from `kind` alone. Stubbed rather than provoked: reaching Resend's
     real daily quota to test this would spend the day's sign-ins. */
  process.env.RESEND_API_KEY = 're_0123456789abcdef';
  const realFetch = global.fetch;
  const answer = (status, body) => { global.fetch = async () => ({ ok: false, status, json: async () => body }); };
  try {
    answer(429, { name: 'daily_quota_exceeded', message: 'You have reached your daily email quota' });
    const quota = await mail.send({ to: E, subject: 'x', text: 'x' });
    is(quota.kind === 'daily_quota_exceeded', 'a spent daily quota is named, so the page can say it lasts until tomorrow');

    answer(429, { name: 'rate_limit_exceeded', message: 'Too many requests' });
    const fast = await mail.send({ to: E, subject: 'x', text: 'x' });
    is(fast.kind === 'rate_limit_exceeded', 'the per-second limit is a different name, and retrying it works');

    global.fetch = async () => { throw new Error('socket hung up'); };
    const gone = await mail.send({ to: E, subject: 'x', text: 'x' });
    is(!!gone.error && gone.kind === null, 'a failure Resend never named carries no kind');
  } finally { global.fetch = realFetch; delete process.env.RESEND_API_KEY; }
}

/* ---- what a bad address does, offline ----------------------------------- */
async function shape() {
  console.log('\naddresses\n');
  // `looksLikeEmail` is checked before anything reads the database, which is
  // what lets this run in a checkout with no DATABASE_URL.
  for (const s of ['', 'nonsense', 'no@tld', 'two@@at.com', 'trailing@dot.']) {
    const r = await accounts.codeSend(s);
    is(!!r.error && !r.code, `refused before any query: ${JSON.stringify(s)}`);
  }
}

/* ---- the cap counts what Resend counts ---------------------------------- */
/* The bug this replaces: the cross-address cap read one row per ADDRESS while
   Resend meters every EMAIL, so thirty people asking four times each was 120
   sends and 30 against the guard. Asserted by putting a row with a `sends`
   count above 1 in front of it and checking the total, not the row count. */
async function caps() {
  console.log('\ncaps\n');
  const db = log.sql();
  const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));

  await db`INSERT INTO login_codes (email, code_hash, expires_at, sends, sent_at)
           VALUES (${E}, null, now(), 7, now())
           ON CONFLICT (email) DO UPDATE SET sends = 7, sent_at = now(), code_hash = null`;
  const [{ rows, total }] = await db`SELECT count(*)::int AS rows, coalesce(sum(sends), 0)::int AS total
                                     FROM login_codes WHERE sent_at >= ${day}`;
  is(total >= 7 && total > rows, 'the day is counted in sends, not in addresses');

  // The sweep keys to the same boundary, or it takes rows the total still needs.
  await accounts.codeSweep();
  const [{ n }] = await db`SELECT count(*)::int AS n FROM login_codes WHERE email = ${E}`;
  is(n === 1, 'the sweep leaves today\'s rows alone');
  await db`DELETE FROM login_codes WHERE email = ${E}`;
}

/* ---- the schema the linking rule rests on ------------------------------- */
async function schema() {
  console.log('\nschema\n');
  const db = log.sql();
  const [idx] = await db`SELECT 1 AS one FROM pg_indexes WHERE tablename = 'users' AND indexname = 'users_email_key'`;
  is(!!idx, 'users_email_key exists, so one address cannot become two accounts');

  const [sub] = await db`SELECT is_nullable FROM information_schema.columns
                         WHERE table_name = 'users' AND column_name = 'google_sub'`;
  is(sub && sub.is_nullable === 'YES', 'google_sub is nullable, so an account can exist without Google');

  const [ch] = await db`SELECT is_nullable FROM information_schema.columns
                        WHERE table_name = 'login_codes' AND column_name = 'code_hash'`;
  is(ch && ch.is_nullable === 'YES', 'login_codes.code_hash is nullable, which is how a code is spent');
}

/* ---- a code, end to end -------------------------------------------------- */
async function codes() {
  console.log('\ncodes\n');
  const first = await accounts.codeSend(E);
  if (first.error) return bad('could not send a code: ' + first.error);
  is(/^[0-9]{6}$/.test(first.code), 'a code is six digits');
  is(first.minutes === accounts.CODE_TTL_MIN, 'the page is told the TTL rather than holding its own copy');

  const again = await accounts.codeSend(E);
  is(!!again.error, 'a second send inside the cooldown is refused');

  const wrong = await accounts.codeVerify(E, first.code === '000000' ? '111111' : '000000');
  is(/tries left/.test(wrong.error || ''), 'a wrong code says how many tries are left');

  const cased = await accounts.codeVerify(E.toUpperCase(), '999999');
  is(/tries left/.test(cased.error || ''), 'a capitalised address is the same address, not a fresh five tries');

  const right = await accounts.codeVerify(E, first.code);
  is(right.ok === true && right.email === E, 'the right code passes');

  const reuse = await accounts.codeVerify(E, first.code);
  is(!!reuse.error, 'the same code twice is refused');
}

/* ---- THE ONE THAT MATTERS ------------------------------------------------ */
async function linking() {
  console.log('\nlinking\n');
  const db = log.sql();

  const byCode = await accounts.emailUser(E);
  is(byCode && byCode.google_sub === null, 'a code makes an account with no Google on it');

  const cased = await accounts.emailUser(E.toUpperCase());
  is(cased && cased.id === byCode.id, 'a capitalised address does not make a second account');

  // September then October: Google, on an address that already has an account.
  const g = await accounts.upsertUser({ sub: 'check-auth-sub-1', email: E.toUpperCase(), name: 'Check', email_verified: true });
  is(g.user && g.user.id === byCode.id, 'Google attaches to the row that already holds the address');
  is(g.user && g.user.google_sub === 'check-auth-sub-1', 'and the sub is written onto it');

  const [{ n }] = await db`SELECT count(*)::int AS n FROM users WHERE lower(email) = ${E}`;
  is(n === 1, 'still one row for the address');

  // Returning: the same sub again must not make anything.
  const back = await accounts.upsertUser({ sub: 'check-auth-sub-1', email: E, name: 'Check', email_verified: true });
  is(back.user && back.user.id === byCode.id, 'signing in again returns the same row');

  // A different Google account claiming a linked address is a merge nobody asked
  // for. It refuses, and the refusal is the assertion.
  const other = await accounts.upsertUser({ sub: 'check-auth-sub-2', email: E, name: 'Other', email_verified: true });
  is(!!other.error && !other.user, 'a second Google account on a linked address is refused, not merged');
}

/* ---- rows ---------------------------------------------------------------- */
async function wipe(label) {
  const db = log.sql();
  await db`DELETE FROM login_codes WHERE email = ${E}`;
  await db`DELETE FROM users WHERE lower(email) = ${E}`;
  if (label) {
    const [{ n }] = await db`SELECT count(*)::int AS n FROM users WHERE lower(email) = ${E}`;
    is(n === 0, 'the checker left nothing behind');
  }
}

(async () => {
  await sender();
  await shape();

  if (!log.enabled()) {
    console.log('\nno DATABASE_URL, so the schema, code and linking checks are skipped.\n');
  } else {
    await wipe();          // a previous run that died part way, never a person's row
    try {
      await schema();
      await caps();
      await codes();
      await linking();
    } finally {
      await wipe(true);
    }
  }

  console.log(fail ? `\n${fail} failed\n` : '\nall good\n');
  process.exit(fail ? 1 : 0);
})().catch(err => { console.error('\ncheck-auth crashed: ' + (err && err.stack || err)); process.exit(1); });
