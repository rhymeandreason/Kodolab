#!/usr/bin/env node
/* =====================================================================
 *  eval-select.js — the component selector against the gen set
 *
 *    node demos/tools/eval-select.js                 # embeddings only
 *    node demos/tools/eval-select.js --llm gemini-3.8-flash [--llm gemma-4-26b-a4b-it]
 *
 *  The labels are the gen set's own: each tests/gen-*.html request and the
 *  components its page mounted. A request is scored with ITS OWN past row
 *  left out, or it would find itself. Per request: the labels, the pick, and
 *  whether it was confident; then, per picker:
 *    exact   picked set == labelled set
 *    hit     the top pick is one of the labels
 *    recall  every label is in the shortlist (the most a model choosing from
 *            the shortlist could get right)
 *    sure    confident picks, and how many of those were exact
 *  A label is what one model built once, not ground truth: a miss is worth
 *  reading before it is worth tuning for.
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
const llms = []; for (let i = 0; i < args.length; i++) if (args[i] === '--llm') llms.push(args[i + 1]);

const sel = require(path.join(ROOT, 'api/_select.js'));
const compose = require(path.join(ROOT, 'api/_compose.js'));
const embed = require(path.join(ROOT, 'api/_embed.js')).pick();
const d = compose.docs();
const cases = sel.rows(d).filter(r => r.kind === 'past').map(r => ({ request: r.text, labels: r.comps }));

const same = (a, b) => a.length === b.length && a.every(x => b.includes(x));
const tally = () => ({ exact: 0, hit: 0, recall: 0, sure: 0, sureExact: 0, n: 0 });

(async () => {
  const file = sel.load(embed);
  const vs = await embed.embed(cases.map(c => c.request));
  const T = { embed: tally() };
  llms.forEach(m => (T[m] = tally()));
  const p = llms.length ? require(path.join(ROOT, 'api/_providers/index.js')).pick(null, true) : null;

  for (const [i, c] of cases.entries()) {
    const sc = sel.score(vs[i], file, new Set([c.request]));
    const r = sel.decide(sc);
    const t = T.embed; t.n++;
    if (same(r.uses, c.labels)) t.exact++;
    if (c.labels.includes(r.uses[0])) t.hit++;
    if (c.labels.every(x => r.shortlist.includes(x))) t.recall++;
    if (r.confident) { t.sure++; if (same(r.uses, c.labels)) t.sureExact++; }
    let line = `${same(r.uses, c.labels) ? 'ok  ' : 'MISS'} ${r.confident ? 'sure' : '    '} [${c.labels}] -> [${r.uses}] (${r.via}; ${sc.comps.slice(0, 3).map(x => x.name + ' ' + x.s.toFixed(3)).join(', ')}; pair ${sc.pairs[0] ? sc.pairs[0].comps + ' ' + sc.pairs[0].s.toFixed(3) : '-'})  "${c.request.slice(0, 70)}"`;
    for (const m of llms) {
      const pickSys = ['You compose science lessons for college Bio 101 students from a component library. Reply only in the JSON shape asked for.',
        '# Components\n\n' + compose.catalog(d), d.sections['Scale: what rung each component sits at']].join('\n\n');
      const o = await p.ask({ system: pickSys, model: m, thinking: 'low', max: 8000,
        messages: [{ role: 'user', content: `Request from a teacher: ${c.request}\n\nPick the one or two components this lesson mounts. Two only when the lesson changes scale or compares two things.` }],
        schema: { type: 'object', properties: { reason: { type: 'string' }, uses: { type: 'array', items: { type: 'string', enum: d.names } } }, required: ['reason', 'uses'] } });
      const u = [...new Set(o.json.uses || [])].slice(0, 2);
      const tm = T[m]; tm.n++;
      if (same(u, c.labels)) tm.exact++;
      if (c.labels.includes(u[0])) tm.hit++;
      line += `\n       ${m}: [${u}]${same(u, c.labels) ? '' : '  MISS'}`;
      if (/gemma/.test(m)) await new Promise(s => setTimeout(s, 9000));   // 16k tokens a minute
    }
    console.log(line);
  }
  console.log('');
  for (const [k, t] of Object.entries(T))
    console.log(`${k.padEnd(22)} exact ${t.exact}/${t.n}  hit ${t.hit}/${t.n}` + (k === 'embed' ? `  recall@5 ${t.recall}/${t.n}  sure ${t.sure} (exact ${t.sureExact})` : ''));
})().catch(e => { console.error(e.message); process.exit(1); });
