/* =============================================================================
 *  tools/codes-api.js — every access code, from the dev server only
 * =============================================================================
 *  Behind /api/codes in tools/dev-server.js and nowhere else: it is not one of
 *  the Vercel functions in api/, and the dev server answers it only to
 *  loopback (api/_local.js). tools/codes.html is the page on it.
 *
 *    GET                          → { teachers, invites, users }
 *    POST {action, ...}           teacher.new {name} · teacher.reissue {id}
 *                                 invite.teacher {note} · invite.member {label, max}
 *                                 invite.revoke {code} · invite.restore {code}
 *                                 user.disable {id} · user.enable {id}
 *                                 user.delete {id}   the account, its sessions and its apps;
 *                                                    a linked teacher row stays, unlinked
 *                                 seat.revoke {id} · seat.unrevoke {id}
 *
 *  A teacher code is stored hashed and comes back in the reply once, the way
 *  `db.js teacher new` prints it once. Seat codes are stored plain (the
 *  schema says why) and are listed.
 * ========================================================================== */
'use strict';

const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const log    = require(path.join(ROOT, 'api/_log.js'));
const access = require(path.join(ROOT, 'api/_access.js'));

async function list() {
  const sql = log.sql();
  const teachers = await sql`
    SELECT t.id, t.name, t.email, t.created_at, t.code_hash IS NOT NULL AS has_code,
           u.email AS user_email
    FROM teachers t LEFT JOIN users u ON u.id = t.user_id ORDER BY t.created_at`;
  const classes = await sql`SELECT id, teacher_id, name FROM classes ORDER BY created_at`;
  const seats = await sql`
    SELECT s.id, s.class_id, s.label, s.code, s.revoked_at,
           (SELECT count(*) FROM apps a WHERE a.owner_id = 'seat:' || s.id)::int AS apps
    FROM seats s ORDER BY s.created_at`;
  for (const t of teachers) {
    t.classes = classes.filter(c => c.teacher_id === t.id).map(c => ({ ...c, seats: seats.filter(s => s.class_id === c.id) }));
  }
  const invites = await sql`SELECT code, kind, label, uses, max_uses, note, revoked_at, created_at FROM invites ORDER BY created_at DESC`;
  const users = await sql`
    SELECT u.id, u.email, u.name, u.invite_label, u.admitted_at, u.disabled_at, u.created_at, t.id AS teacher_id,
           (SELECT count(*) FROM apps a WHERE a.owner_id = 'user:' || u.id)::int AS apps
    FROM users u LEFT JOIN teachers t ON t.user_id = u.id ORDER BY u.created_at DESC`;
  return { teachers, invites, users };
}

async function act(body) {
  const sql = log.sql();
  const a = String(body.action || '');
  if (a === 'teacher.new') {
    const name = String(body.name || '').trim();
    if (!name) throw new Error('a teacher needs a name');
    const id = access.mintId(), code = access.mintTeacherCode();
    await sql`INSERT INTO teachers (id, name, code_hash) VALUES (${id}, ${name}, ${access.hash(code)})`;
    return { code, id };
  }
  if (a === 'teacher.reissue') {
    const code = access.mintTeacherCode();
    const [t] = await sql`UPDATE teachers SET code_hash = ${access.hash(code)} WHERE id = ${String(body.id || '')} RETURNING id`;
    if (!t) throw new Error('no such teacher');
    return { code, id: t.id };
  }
  if (a === 'invite.teacher' || a === 'invite.member') {
    const teacher = a === 'invite.teacher';
    const label = teacher ? 'teachers' : String(body.label || '').trim();
    if (!label) throw new Error('a member invite needs a label');
    const max = teacher ? 1 : (body.max ? Number(body.max) : null);
    const code = access.mintSeatCode();
    await sql`INSERT INTO invites (code, kind, label, max_uses, note)
              VALUES (${code}, ${teacher ? 'teacher' : 'member'}, ${label}, ${max}, ${String(body.note || '').trim() || null})`;
    return { code };
  }
  if (a === 'invite.revoke' || a === 'invite.restore') {
    const [r] = await sql`UPDATE invites SET revoked_at = ${a === 'invite.revoke' ? new Date().toISOString() : null}
                          WHERE code = ${String(body.code || '').toLowerCase()} RETURNING code`;
    if (!r) throw new Error('no such invite');
    return { ok: true };
  }
  if (a === 'user.disable' || a === 'user.enable') {
    const rows = await sql`UPDATE users SET disabled_at = ${a === 'user.disable' ? new Date().toISOString() : null}
                           WHERE id = ${String(body.id || '')} RETURNING id`;
    if (!rows.length) throw new Error('no such account');
    if (a === 'user.disable') await sql`DELETE FROM sessions WHERE user_id = ${rows[0].id}`;
    return { ok: true };
  }
  if (a === 'user.delete') {
    const id = String(body.id || '');
    const [u] = await sql`SELECT id FROM users WHERE id = ${id}`;
    if (!u) throw new Error('no such account');
    // Versions cascade from apps; sessions cascade from the user; the teacher
    // row's user_id is set null by its own constraint.
    await sql`DELETE FROM apps WHERE owner_id = ${'user:' + id}`;
    await sql`DELETE FROM users WHERE id = ${id}`;
    return { ok: true };
  }
  if (a === 'seat.revoke' || a === 'seat.unrevoke') {
    const rows = await sql`UPDATE seats SET revoked_at = ${a === 'seat.revoke' ? new Date().toISOString() : null}
                           WHERE id = ${String(body.id || '')} RETURNING id`;
    if (!rows.length) throw new Error('no such seat');
    return { ok: true };
  }
  throw new Error('unknown action ' + a);
}

/* The dev server's handler: loopback only, GET lists, POST acts. */
function handler(req, res, json, local) {
  if (!local(req)) return json(403, { error: 'codes are managed from this machine only' });
  if (!log.enabled()) return json(503, { error: 'no DATABASE_URL in .env.local' });
  if (req.method === 'GET') return list().then(d => json(200, d)).catch(e => json(500, { error: e.message }));
  if (req.method !== 'POST') return json(405, { error: 'GET or POST only' });
  let raw = '';
  req.on('data', d => { raw += d; if (raw.length > 1e5) req.destroy(); });
  req.on('end', () => {
    let body;
    try { body = JSON.parse(raw); } catch { return json(400, { error: 'body is not JSON' }); }
    act(body).then(r => json(200, r)).catch(e => json(400, { error: e.message }));
  });
}

module.exports = { handler, list, act };
