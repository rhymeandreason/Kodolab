/* =============================================================================
 *  api/_access.js — who is asking
 * =============================================================================
 *  One answer for every endpoint that builds or owns, so `build.js`, `app.js`
 *  and `teacher.js` cannot hold three ideas of who a request is.
 *
 *    { kind: 'seat',    owner: 'seat:<id>',    cohort: 'class:<id>', seat, klass }
 *    { kind: 'teacher', owner: 'user:<id>' | 'teacher:<id>', cohort: 'teacher:<id>', teacher, user? }
 *    { kind: 'user',    owner: 'user:<id>',    cohort: 'invite:<label>' | '<key label>', user }
 *    { kind: 'key',     owner: null,           cohort: '<key label>' }
 *    { kind: 'pending', user }   signed in, no invite yet: not admitted
 *    { kind: 'invalid' | 'revoked' }   a code was sent and refused
 *    null
 *
 *  THE ORDER IS A SEAT, THEN THE SIGNED-IN ACCOUNT, THEN THE PILOT'S TEACHER
 *  CODE, THEN A TESTING LINK. A teacher who opens a student's code on /build is
 *  asking to be that student; the dashboard asks with `seatFirst: false`. A
 *  signed-in account with no invite that also holds a testing link builds on
 *  the link, and its apps are still the account's.
 *
 *  A seat code is 8 characters from 31, about 8e11: a class of 40 is one hit in
 *  2e10 guesses, which is why there is no guess counter. A teacher code is 32
 *  random bytes. Both ride in headers, never a query string (`_keys.js`).
 * ========================================================================== */
'use strict';

const crypto   = require('crypto');
const keys     = require('./_keys.js');
const log      = require('./_log.js');

const SEAT_HEADER    = 'x-seat-code';
const TEACHER_HEADER = 'x-teacher-code';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';   // no 0 o 1 i l: read off paper

const mintId = () => crypto.randomBytes(8).toString('base64url');
const hash   = s => crypto.createHash('sha256').update(String(s)).digest('hex');

function mintSeatCode() {
  const b = crypto.randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += ALPHABET[b[i] % ALPHABET.length] + (i === 3 ? '-' : '');
  return s;
}
const mintTeacherCode = () => crypto.randomBytes(32).toString('base64url');

/* Forgiving about what a student types: case, spaces, a missing hyphen. */
function normSeat(code) {
  const c = String(code || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : null;
}

function header(req, name) {
  const h = (req && req.headers && req.headers[name]) || '';
  return String(Array.isArray(h) ? h[0] : h).trim();
}

async function seatByCode(code) {
  const c = normSeat(code);
  if (!c || !log.enabled()) return null;
  const [row] = await log.sql()`
    SELECT s.id, s.label, s.revoked_at, c.id AS class_id, c.name AS class_name, c.teacher_id
    FROM seats s JOIN classes c ON c.id = s.class_id WHERE s.code = ${c}`;
  return row || null;
}

async function teacherByCode(code) {
  if (!code || !log.enabled()) return null;
  const [row] = await log.sql()`SELECT id, name FROM teachers WHERE code_hash = ${hash(code)}`;
  return row || null;
}

async function resolve(req, { seatFirst = true } = {}) {
  let refused = null;

  const seatCode = header(req, SEAT_HEADER);
  if (seatFirst && seatCode) {
    const s = await seatByCode(seatCode);
    if (s && !s.revoked_at) {
      return { kind: 'seat', owner: 'seat:' + s.id, cohort: 'class:' + s.class_id,
               seat: { id: s.id, label: s.label }, klass: { id: s.class_id, name: s.class_name, teacherId: s.teacher_id } };
    }
    refused = { kind: s ? 'revoked' : 'invalid' };
  }

  const u = await require('./_accounts.js').userFrom(req);
  const label = keys.cohort(req);
  const teacherCode = header(req, TEACHER_HEADER);
  const byCode = async () => {
    const t = await teacherByCode(teacherCode);
    if (t) return { kind: 'teacher', owner: 'teacher:' + t.id, cohort: 'teacher:' + t.id, teacher: t };
    refused = refused || { kind: 'invalid' };
    return null;
  };
  if (u && u.teacher_id) {
    return { kind: 'teacher', owner: 'user:' + u.id, cohort: 'teacher:' + u.teacher_id,
             teacher: { id: u.teacher_id, name: u.teacher_name }, user: u };
  }
  // The dashboard: a pilot code is the teacher even when a plain account is signed in too.
  if (!seatFirst && teacherCode) { const t = await byCode(); if (t) return t; }
  if (u && u.admitted_at) return { kind: 'user', owner: 'user:' + u.id, cohort: 'invite:' + (u.invite_label || 'open'), user: u };
  if (u && seatFirst && label) return { kind: 'user', owner: 'user:' + u.id, cohort: label, user: u };

  if (seatFirst && teacherCode) { const t = await byCode(); if (t) return t; }

  // The dashboard has no use for a testing link: a signed-in non-teacher is told to redeem an invite.
  if (u && !seatFirst) return { kind: 'pending', user: u };
  if (label) return { kind: 'key', owner: null, cohort: label };
  if (u) return { kind: 'pending', user: u };
  return refused;
}

const admitted = who => !!who && ['seat', 'teacher', 'user', 'key'].includes(who.kind);

/* The 401 body for a request that is not admitted, worded for what it sent. */
function refusal(who) {
  if (who && who.kind === 'revoked') return { error: 'This class code has been turned off. Ask your teacher for a new one.', code: 'revoked' };
  if (who && who.kind === 'invalid') return { error: 'That code is not right. Check it against your card.', code: 'invalid' };
  if (who && who.kind === 'pending') return { error: 'Enter your invite code to start building.', code: 'invite', who: describe(who) };
  return { error: 'the builder is open to invited testers; ask for an access link' };
}

/* What a page may show about who it is. `account` says there is a Google
   session to sign out of. */
function describe(who) {
  if (!who) return null;
  const account = !!who.user;
  if (who.kind === 'seat') return { kind: 'seat', label: who.seat.label, className: who.klass.name };
  if (who.kind === 'teacher') return { kind: 'teacher', name: who.teacher.name, account };
  if (who.kind === 'user' || who.kind === 'pending') return { kind: who.kind, name: who.user.name || who.user.email, account };
  if (who.kind === 'key') return { kind: 'key', cohort: who.cohort };
  return null;
}

module.exports = { resolve, admitted, refusal, describe, mintId, mintSeatCode, mintTeacherCode, hash, normSeat,
                   SEAT_HEADER, TEACHER_HEADER };
