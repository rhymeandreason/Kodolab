#!/usr/bin/env node
/* =====================================================================
 *  gen-json.js — one composed lesson, the builder's compose route as a file
 *
 *    node demos/tools/gen-json.js "a teacher's request" <path to write> [--model gemma-4-26b-a4b-it]
 *    node demos/tools/gen-json.js --edit <existing page> "the change" <path to write> [--model m]
 *
 *  The eval for docs/Compose.md, on the same calls api/build.js makes:
 *  api/_compose.js does the work, and any model may be asked to compose
 *  here, so Flash and Gemma can be compared on one route. Prints one JSON
 *  line: model, ms, tokens, the components picked, and `warn`: every param,
 *  anchor or state field the lesson names that its section does not, which
 *  the page will silently not do.
 * ===================================================================== */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const env = path.join(ROOT, '.env.local');
if (fs.existsSync(env)) for (const line of fs.readFileSync(env, 'utf8').split('\n')) {
  const m = /^\s*([A-Z_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const args = process.argv.slice(2);
const flag = name => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const model = flag('--model') || 'gemma-4-26b-a4b-it';
const EDIT = flag('--edit');
const [request, out] = args;
if (!request || !out) { console.error('usage: gen-json.js [--edit <page>] "request" <path> [--model m]'); process.exit(2); }

const builder = require(path.join(ROOT, 'api/_builder.js'));
const compose = require(path.join(ROOT, 'api/_compose.js'));
const p = require(path.join(ROOT, 'api/_providers/index.js')).pick(null, true);

const sum = (a, b) => (a ? { input: a.input + b.input, output: a.output + b.output, cached: a.cached + b.cached } : b);

(async () => {
  const t0 = Date.now();
  const before = EDIT ? fs.readFileSync(path.resolve(EDIT), 'utf8') : null;
  const current = before ? compose.lessonOf(before) : null;
  if (EDIT && !current) throw new Error(`${EDIT} is not a composed lesson`);
  const r = await compose.turn({ p, model, request, current, priced: (_, u) => u, sum });
  const ok = r.lesson && !r.problems.length;
  const past = before ? builder.history(before) : [];
  if (ok) fs.writeFileSync(path.resolve(out), builder.withHistory(compose.page(r.lesson), past.concat(request)));
  const u = r.usage || {};
  console.log(JSON.stringify({ model: r.served, mode: EDIT ? 'edit' : 'draft', ms: Date.now() - t0, uses: r.uses,
    in: (u.input || 0) + (u.cached || 0), out: u.output || 0, steps: ok ? r.lesson.steps.length : 0,
    retried: r.retried, problems: r.problems, warn: r.warn, wrote: ok ? out : null }));
})().catch(e => { console.error(String(e.message || e).slice(0, 400)); process.exit(1); });
