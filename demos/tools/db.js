#!/usr/bin/env node
/* =============================================================================
 *  tools/db.js — the tutor's log, from the terminal
 * =============================================================================
 *    node demos/tools/db.js init     apply api/_schema.sql (idempotent)
 *    node demos/tools/db.js recent   the last 20 exchanges, screen beside aim
 *    node demos/tools/db.js aim      where the tutor pointed, by target
 *    node demos/tools/db.js cost     turns, tokens and dollars per day
 *    node demos/tools/db.js apps     the builder's apps, newest first
 *    node demos/tools/db.js cards [--force]
 *                                    fill the shelf card's words from each app's
 *                                    own source, where no capture has set them
 *    node demos/tools/db.js scenes   mark the stills that are the scene alone,
 *                                    which is what the shelf will draw
 *    node demos/tools/db.js builds   the builder's tokens and dollars per cohort per day
 *    node demos/tools/db.js teacher new <name>
 *                                    a teacher and their dashboard code, printed once
 *    node demos/tools/db.js teacher list
 *    node demos/tools/db.js teacher reissue <id>
 *                                    a new code; the old one stops working
 *    node demos/tools/db.js invite teacher [note]
 *                                    a single-use code that makes a signed-in account a teacher
 *    node demos/tools/db.js invite member <label> [max-uses]
 *                                    a reusable code that admits accounts to the builder under <label>
 *    node demos/tools/db.js invite list | invite revoke <code>
 *    node demos/tools/db.js user list | user disable <email> | user enable <email>
 *    node demos/tools/db.js link new <label> [note]
 *                                    a testing link: admits to /build and the tutor with no account
 *    node demos/tools/db.js link list | link revoke <id> | link restore <id>
 *    node demos/tools/db.js link import
 *                                    copy TUTOR_KEYS into the table, secrets unchanged, so the
 *                                    env var can go. Reads the shell's TUTOR_KEYS before .env.local's
 *    node demos/tools/db.js seed <page> [title]
 *                                    store a page as an app; prints the view and edit links.
 *                                    The eval pages under tests/ go in this way.
 *
 *  Reads `.env.local` the way the dev server does, so it needs no key of its
 *  own. Next to the dev server because that is where the repo keeps the things
 *  you run rather than the things that ship.
 * ========================================================================== */
'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

for (const line of read(path.join(ROOT, '.env.local')).split('\n')) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
function read(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }

const log = require(path.join(ROOT, 'api/_log.js'));

/* Width and height out of a JPEG's first frame header. Node reads no images,
   and the one question here is the size, so the markers are walked directly. */
function jpegSize(buf) {
  for (let i = 2; i + 9 < buf.length;) {
    if (buf[i] !== 0xFF) { i++; continue; }
    const m = buf[i + 1], len = buf.readUInt16BE(i + 2);
    if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  return null;
}

const CMDS = {
  async init() {
    await log.init();
    console.log('schema applied');
  },

  async recent() {
    const sql = log.sql();
    const rows = await sql`SELECT lesson, turn, question, answer, step, state,
                                  point_id, ms, error
                           FROM turns LIMIT 20`;
    if (!rows.length) return console.log('nothing logged yet');
    for (const r of rows) {
      console.log(`\n${r.lesson || '(no lesson)'} · turn ${r.turn}`
        + (r.step != null ? ` · step ${r.step}` : '')
        + ` · → ${r.point_id || 'none'}` + (r.ms ? ` · ${r.ms}ms` : ''));
      console.log(`  Q ${r.question}`);
      // On a failed turn `answer` IS the error the student was shown; printing
      // both would print it twice.
      console.log(r.error ? `  ! ${r.error}` : `  A ${(r.answer || '').slice(0, 160)}`);
      if (r.state) console.log(`  screen ${JSON.stringify(r.state)}`);
    }
  },

  async aim() {
    const sql = log.sql();
    const rows = await sql`SELECT lesson, coalesce(point_id, 'none') AS target, count(*)::int AS n
                           FROM (SELECT * FROM turns LIMIT 500) t
                           GROUP BY 1, 2 ORDER BY 1, 3 DESC`;
    if (!rows.length) return console.log('nothing logged yet');
    for (const r of rows) console.log(`${String(r.n).padStart(4)}  ${r.lesson || '-'}  ${r.target}`);
  },

  async cost() {
    const sql = log.sql();
    const rows = await sql`SELECT created_at::date AS day, count(*)::int AS turns,
                                  sum((usage->>'input')::int)  AS in_tok,
                                  sum((usage->>'output')::int) AS out_tok,
                                  sum((usage->>'cached')::int) AS cached_tok,
                                  round(sum((usage->>'cost_usd')::numeric), 4) AS usd
                           FROM turns WHERE usage IS NOT NULL
                           GROUP BY 1 ORDER BY 1 DESC`;
    if (!rows.length) return console.log('nothing logged yet');
    for (const r of rows) console.log(`${String(r.day).slice(0, 10)}  `
      + `${String(r.turns).padStart(4)} turns  in ${r.in_tok} (cached ${r.cached_tok})  `
      + `out ${r.out_tok}  $${r.usd}`);
  },

  async apps() {
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    const rows = await apps.recent({ limit: 50 });
    if (!rows.length) return console.log('no apps yet');
    for (const r of rows) console.log(`${r.id}  v${r.versions} (${r.turns} model turns)  `
      + `${r.cohort || '-'}  ${r.parent_id ? 'remix of ' + r.parent_id + '  ' : ''}${r.title || '(untitled)'}`);
  },

  /* Fills `thumb_meta` from each app's own stored source, for the cards that
     have never been captured. Only where it is null: a capture from the running
     page says more than the file does and must not be overwritten. `--force`
     re-reads every app, for when the extractor itself has changed. */
  async cards(...argv) {
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    const meta = require(path.join(ROOT, 'api/_thumbmeta.js'));
    const force = argv.includes('--force');
    const rows = await apps.sourcesNeedingCards(force);
    if (!rows.length) return console.log('every app already has its words');
    let filled = 0, none = 0;
    for (const r of rows) {
      const m = meta.fromSource(r.src);
      if (!m) { none++; console.log(`  --  ${r.id}  ${(r.title || '(untitled)').slice(0, 40)}  (no shell: nothing to draw)`); continue; }
      await apps.setCard(r.id, m);
      filled++;
      console.log(`  ok  ${r.id}  ${String(m.steps).padStart(2)} steps  ${m.title.slice(0, 44)}`);
    }
    console.log(`\n${filled} filled, ${none} without a first card, of ${rows.length}`);
  },

  /* Says which stored stills are the scene alone. The shelf draws the image
     only when the row claims that (`_schema.sql`), and rows lost the claim two
     ways: a `cards --force` pass used to overwrite it, and the source
     extractor never had it to give. The image's own size answers — the
     scene-only relay writes 640x400, the whole-page capture it replaced wrote
     480x300 — so this reads the JPEG rather than guessing from dates. */
  async scenes() {
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    const rows = await apps.thumbsWithoutSceneFlag();
    if (!rows.length) return console.log('every still already says what it is');
    let scene = 0, page = 0;
    for (const r of rows) {
      const d = jpegSize(Buffer.from((r.thumb || '').split(',')[1] || '', 'base64'));
      const is = d && d[0] === 640 && d[1] === 400;
      if (is) { await apps.markScene(r.id); scene++; }
      else page++;
      console.log(`  ${is ? 'ok ' : '-- '} ${r.id}  ${d ? d.join('x') : 'unreadable'}  ${(r.title || '(untitled)').slice(0, 40)}`);
    }
    console.log(`\n${scene} marked as the scene, ${page} left as whole-page captures to retake`);
  },

  async builds() {
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    const rows = await apps.usage();
    if (!rows.length) return console.log('no builds yet');
    for (const r of rows) console.log(`${String(r.day).slice(0, 10)}  ${(r.cohort || '-').padEnd(16)}`
      + `${String(r.turns).padStart(4)} turns  in ${r.input} (cached ${r.cached})  out ${r.output}  $${r.usd}`);
  },

  /* The pilot's door: a teacher is minted here, not signed up. The code is
     shown once and stored hashed, so a lost one is reissued, never looked up. */
  async teacher(sub, ...rest) {
    const access = require(path.join(ROOT, 'api/_access.js'));
    const sql = log.sql();
    const show = (id, name, code) => {
      console.log(`${id}  ${name}`);
      console.log(`  code       ${code}`);
      console.log(`  dashboard  <site>/teach   (local: http://localhost:8817/demos/build/teacher.html)`);
      console.log('  The code is shown once. Keep it; `teacher reissue` replaces it.');
    };
    if (sub === 'new') {
      const name = rest.join(' ').trim();
      if (!name) throw new Error('teacher new needs a name: node demos/tools/db.js teacher new "Ms. Rivera"');
      const id = access.mintId(), code = access.mintTeacherCode();
      await sql`INSERT INTO teachers (id, name, code_hash) VALUES (${id}, ${name}, ${access.hash(code)})`;
      return show(id, name, code);
    }
    if (sub === 'reissue') {
      const code = access.mintTeacherCode();
      const [t] = await sql`UPDATE teachers SET code_hash = ${access.hash(code)} WHERE id = ${rest[0] || ''} RETURNING id, name`;
      if (!t) throw new Error('no teacher with that id; `teacher list` shows them');
      return show(t.id, t.name, code);
    }
    if (sub === 'list') {
      const rows = await sql`SELECT t.id, t.name, t.created_at,
                                    (SELECT count(*) FROM classes c WHERE c.teacher_id = t.id)::int AS classes
                             FROM teachers t ORDER BY t.created_at`;
      if (!rows.length) return console.log('no teachers yet');
      for (const r of rows) console.log(`${r.id}  ${r.name}  ${r.classes} class${r.classes === 1 ? '' : 'es'}`);
      return;
    }
    throw new Error('teacher new <name> | teacher list | teacher reissue <id>');
  },

  async invite(sub, ...rest) {
    const access = require(path.join(ROOT, 'api/_access.js'));
    const sql = log.sql();
    const mint = async (kind, label, max, note) => {
      const code = access.mintSeatCode();
      await sql`INSERT INTO invites (code, kind, label, max_uses, note) VALUES (${code}, ${kind}, ${label}, ${max}, ${note || null})`;
      console.log(`${code}  ${kind}  ${label}${max ? `  up to ${max} uses` : '  unlimited uses'}`);
      console.log('  Redeemed after signing in with Google, on /build or /teach.');
    };
    if (sub === 'teacher') return mint('teacher', 'teachers', 1, rest.join(' '));
    if (sub === 'member') {
      const [label, max] = rest;
      if (!label) throw new Error('invite member needs a label: node demos/tools/db.js invite member bio101-fall [200]');
      return mint('member', label, max ? Number(max) : null, null);
    }
    if (sub === 'revoke') {
      const [r] = await sql`UPDATE invites SET revoked_at = now() WHERE code = ${String(rest[0] || '').toLowerCase()} RETURNING code`;
      return console.log(r ? `${r.code} revoked; accounts it admitted keep access` : 'no such invite');
    }
    if (sub === 'list') {
      const rows = await sql`SELECT code, kind, label, uses, max_uses, note, revoked_at FROM invites ORDER BY created_at`;
      if (!rows.length) return console.log('no invites yet');
      for (const r of rows) console.log(`${r.code}  ${r.kind.padEnd(7)}  ${r.label.padEnd(16)}  ${r.uses}${r.max_uses ? '/' + r.max_uses : ''} used`
        + `${r.revoked_at ? '  REVOKED' : ''}${r.note ? '  ' + r.note : ''}`);
      return;
    }
    throw new Error('invite teacher [note] | invite member <label> [max-uses] | invite list | invite revoke <code>');
  },

  async user(sub, email) {
    const sql = log.sql();
    if (sub === 'list') {
      const rows = await sql`SELECT u.email, u.name, u.invite_label, u.admitted_at, u.disabled_at, t.id AS teacher
                             FROM users u LEFT JOIN teachers t ON t.user_id = u.id ORDER BY u.created_at`;
      if (!rows.length) return console.log('no accounts yet');
      for (const r of rows) console.log(`${(r.email || '-').padEnd(32)} ${r.teacher ? 'teacher ' : r.admitted_at ? 'member  ' : 'pending '}`
        + `${(r.invite_label || '').padEnd(16)} ${r.name || ''}${r.disabled_at ? '  DISABLED' : ''}`);
      return;
    }
    if (sub === 'disable' || sub === 'enable') {
      const rows = await sql`UPDATE users SET disabled_at = ${sub === 'disable' ? new Date().toISOString() : null}
                             WHERE lower(email) = lower(${email || ''}) RETURNING id`;
      if (!rows.length) throw new Error('no account with that email');
      if (sub === 'disable') await sql`DELETE FROM sessions WHERE user_id = ${rows[0].id}`;
      return console.log(`${email} ${sub}d`);
    }
    throw new Error('user list | user disable <email> | user enable <email>');
  },

  async link(sub, ...rest) {
    const keys = require(path.join(ROOT, 'api/_keys.js'));
    const sql = log.sql();
    if (sub === 'new') {
      const r = await keys.mint({ label: rest[0], note: rest.slice(1).join(' ') });
      console.log(`${r.id}  ${r.label}`);
      console.log(`  https://kodolab.org/build?k=${r.secret}`);
      console.log('  The same ?k= on a lesson opens its tutor. Shown once; revoke and mint a new one if lost.');
      return;
    }
    if (sub === 'import') {
      const pairs = keys.pairs();
      if (!pairs.length) return console.log('no TUTOR_KEYS to import');
      for (const p of pairs) {
        const r = await keys.mint({ label: p.label, secret: p.secret, note: 'from TUTOR_KEYS' });
        console.log(`${r ? 'added  ' : 'already'}  ${p.label}`);
      }
      return console.log('Existing links keep working. TUTOR_KEYS can now be removed.');
    }
    if (sub === 'revoke' || sub === 'restore') {
      const [r] = await sql`UPDATE links SET revoked_at = ${sub === 'revoke' ? new Date().toISOString() : null}
                            WHERE id = ${rest[0] || ''} RETURNING label`;
      return console.log(r ? `${r.label} ${sub}d` : 'no such link; `link list` shows them');
    }
    if (sub === 'list') {
      const rows = await sql`SELECT id, label, note, last_used_at, revoked_at FROM links ORDER BY created_at`;
      if (!rows.length) return console.log('no links yet');
      for (const r of rows) console.log(`${r.id}  ${r.label.padEnd(16)}  ${r.last_used_at ? 'used ' + String(r.last_used_at.toISOString ? r.last_used_at.toISOString() : r.last_used_at).slice(0, 10) : 'never used'}`
        + `${r.revoked_at ? '  REVOKED' : ''}${r.note ? '  ' + r.note : ''}`);
      return;
    }
    throw new Error('link new <label> [note] | link list | link revoke <id> | link restore <id> | link import');
  },

  /* A page from disk becomes an app, so the render route and the builder can
   * be exercised on the eval pages without a model call. The first request in
   * the page's own history comment, or the title argument, names it. */
  async seed() {
    const file = process.argv[3], title = process.argv[4];
    if (!file) throw new Error('seed needs a page: node demos/tools/db.js seed tests/gen-rbc-test.html');
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    const builder = require(path.join(ROOT, 'api/_builder.js'));
    const html = fs.readFileSync(path.resolve(file), 'utf8');
    const problems = builder.validate(html);
    if (problems.length) throw new Error('the page would not pass validate():\n  ' + problems.join('\n  '));
    const past = builder.history(html);
    const name = title || (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || path.basename(file, '.html');
    const made = await apps.create({ cohort: 'seed', title: name.trim(), isLocal: true,
      version: { kind: 'seed', html, request: past[past.length - 1] || null, summary: `seeded from ${file}` } });
    console.log(`${made.id}  ${name}`);
    console.log(`  view  http://localhost:8817/app/${made.id}`);
    console.log(`  edit  http://localhost:8817/build?id=${made.id}&e=${made.token}`);
  },
};

(async () => {
  const cmd = process.argv[2];
  if (!CMDS[cmd]) {
    console.error('usage: node demos/tools/db.js ' + Object.keys(CMDS).join(' | '));
    process.exit(1);
  }
  if (!log.enabled()) {
    console.error('DATABASE_URL is not set in .env.local');
    process.exit(1);
  }
  try { await CMDS[cmd](...process.argv.slice(3)); }
  catch (err) { console.error(err.message); process.exit(1); }
})();
