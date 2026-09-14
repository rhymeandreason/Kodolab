#!/usr/bin/env node
/* =====================================================================
 *  gen-app.js — one generated app, from the component reference alone
 *
 *  Run, from the repo root or demos/:
 *    node demos/tools/gen-app.js "a teacher's request" <path to write> [--model gemini-3.7-flash]
 *    node demos/tools/gen-app.js --edit <existing page> "the change" <path to write> [--whole]
 *
 *  The eval for docs/Components.md, and the same code the deployed builder
 *  runs: api/_builder.js holds the prompts, the edit applier and the source
 *  checks, and this script is the transport that writes a file instead of a
 *  row. A page that fails here is a gap in the reference, not in the model,
 *  because the model is handed nothing else.
 *
 *  --edit is the second turn. The model replies with find/replace pairs
 *  against the page, applied here; a find that does not land once falls back
 *  to one whole-file call, and the printed line says which route it took.
 *  --whole skips the pairs and asks for the file, which is the old behaviour,
 *  kept so the two formats can be measured against each other.
 *
 *  The page carries a `<!-- requests -->` comment listing what shaped it, so
 *  an edit chain can be replayed from the file alone.
 *
 *  Prints one JSON line: model served, time, tokens, and for an edit the
 *  route. That line is the cost model; keep it. `written` is the cache write
 *  this process paid, which is every run: the cache map is module state and
 *  dies with the process.
 *
 *  With DATABASE_URL set the run is also stored as a version under cohort
 *  `gen-app`, so `db.js builds` and tools/prompts.html sum the eval's spend
 *  beside the students'. --no-log skips that. Never fails the run.
 *
 *  Key: GEMINI_API_KEY (or ANTHROPIC_API_KEY with --provider anthropic) from
 *  .env.local at the repo root, the same file the tutor reads. Never printed.
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
const flag = (name, takes) => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  return takes ? args.splice(i, 2)[1] : (args.splice(i, 1), true);
};
const model    = flag('--model', true);
const provider = flag('--provider', true);
const EDIT     = flag('--edit', true);
const WHOLE    = flag('--whole', false);
const NOLOG    = flag('--no-log', false);
const [request, out] = args;
if (!request || !out) {
  console.error('usage: gen-app.js [--edit <page>] "request" <path to write> [--model m] [--provider gemini|anthropic] [--whole] [--no-log]');
  process.exit(2);
}
// The provider reads its model from the environment when required, so the
// override has to be in place before api/_builder.js loads it.
if (model) process.env[(provider || process.env.AI_PROVIDER || 'gemini') === 'anthropic' ? 'ANTHROPIC_MODEL' : 'GEMINI_MODEL'] = model;

const builder = require(path.join(ROOT, 'api/_builder.js'));

async function record(r, page) {
  try {
    const apps = require(path.join(ROOT, 'api/_apps.js'));
    if (!apps.enabled()) return;
    await apps.create({ cohort: 'gen-app', isLocal: true, title: request.slice(0, 80), version: {
      kind: EDIT ? 'edit' : 'build', html: page, request, summary: r.summary,
      provider: r.provider, model: r.model, usage: r.usage, ms: r.ms,
      error: page ? null : ((r.problems || []).join('; ') || 'no page came back'),
    } });
  } catch (e) { console.error('[gen-app] not logged:', e.message); }
}

(async () => {
  let r;
  if (EDIT) {
    const html = fs.readFileSync(EDIT, 'utf8');
    if (WHOLE) {
      // The measured baseline: the whole file back, no pairs.
      const p = require(path.join(ROOT, 'api/_providers/index.js')).pick(provider, true);
      const t0 = Date.now();
      const o = await p.ask({ system: builder.system(), schema: builder.WHOLE_SCHEMA, max: 16000, thinking: 'low',
        context: `Here is the page as it stands:\n\n${html}`,
        messages: [{ role: 'user', content: `The student now asks: ${request}\n\nChange the page to answer them, keeping everything they did not ask to change. Reply with the whole file.` }] });
      const { json } = o;
      const { html: page, summary } = json;
      r = { html: builder.withHistory(page, builder.history(html).concat(request)),
            summary, mode: 'whole', problems: builder.validate(page),
            provider: p.id, model: o.served, usage: o.usage, ms: Date.now() - t0 };
    } else {
      r = await builder.edit({ html, request, provider, bench: true });
    }
  } else {
    r = await builder.draft({ request, provider, bench: true });
  }

  const { html: page } = r;
  if (page) fs.writeFileSync(out, page);
  const u = r.usage || {};
  console.log(JSON.stringify({
    model: r.model, ms: r.ms, mode: r.mode || 'draft',
    input: u.input || 0, cached: u.cached || 0, written: u.written || 0, output: u.output || 0,
    usd: u.cost_usd == null ? undefined : Number(u.cost_usd.toFixed(4)),
    edits: r.edits, fallback: r.fallback || undefined, retried: r.retried || undefined,
    problems: r.problems && r.problems.length ? r.problems : undefined,
    summary: r.summary, lines: page ? page.split('\n').length : 0, out: page ? out : null,
  }));
  if (!NOLOG) await record(r, page);
  if (!page) process.exit(1);
})().catch(e => { console.error(e.message || e); process.exit(1); });
