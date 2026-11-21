#!/usr/bin/env node
/* =====================================================================
 *  gen-json.js — a lesson COMPOSED as JSON from components, no code written
 *
 *    node demos/tools/gen-json.js "a teacher's request" <path to write> [--model gemma-4-26b-a4b-it]
 *
 *  The small-model path beside gen-app.js. Two calls, each small enough for
 *  a model with a 16k-token-per-minute quota:
 *    1. PICK: a one-line catalog of components (heading + "Good for") in,
 *       one or two names out.
 *    2. COMPOSE: docs/Compose.md, Components.md's Scale and Copy, and only
 *       the picked components' sections in; the lesson JSON out.
 *  The page is the app.js tag, the JSON and kit/compose.js. No Scene, Graph
 *  or Quiz: the JSON has no shape for them yet.
 *
 *  Prints one JSON line: model, ms and tokens per call, and `warn`, every
 *  param, anchor or state field the JSON names that its section does not.
 *  A warning is a thing the page will silently not do.
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
const mi = args.indexOf('--model');
const model = mi >= 0 ? args.splice(mi, 2)[1] : 'gemini-3.8-flash';
const [request, out] = args;
if (!request || !out) { console.error('usage: gen-json.js "request" <path> [--model m]'); process.exit(2); }

const p = require(path.join(ROOT, 'api/_providers/index.js')).pick();
const ref = fs.readFileSync(path.join(ROOT, 'demos/docs/Components.md'), 'utf8');
const compose = fs.readFileSync(path.join(ROOT, 'demos/docs/Compose.md'), 'utf8').replace(/^<!--.*?-->\s*/s, '');

/* Components.md cut at its `## ` headings. */
const sections = {};
for (const part of ref.split(/^(?=## )/m)) {
  const h = /^## (.+)/.exec(part);
  if (h) sections[h[1].split(' — ')[0].trim()] = part.trim();
}
const SKIP = new Set(['Scene', 'Graph', 'Quiz']);
const names = Object.keys(sections).filter(n => /^[A-Z][A-Za-z]+$/.test(n) && sections[n].split('\n')[0].includes(' — ') && !SKIP.has(n));

const catalog = names.map(n => {
  const s = sections[n];
  const good = (/^Good for:(.*)$/m.exec(s) || [, ''])[1].trim();
  return `- ${s.split('\n')[0].slice(3)}. ${good}`;
}).join('\n');

/* What a section says a component has, read from its own prose. */
function facts(n) {
  const s = sections[n];
  const js = (/```js\n([\s\S]*?)```/.exec(s) || [, ''])[1];
  const params = new Set([...js.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
  const ticks = re => { const l = (re.exec(s) || [''])[0]; return new Set([...l.matchAll(/`(\w+)`/g)].map(m => m[1])); };
  return {
    params,
    anchors: ticks(/^(Anchors for `note\(\)`|One list of parts serves).*$/m),
    // state() fields hide in tables and prose, so any backticked name in the section counts.
    state: new Set([...s.matchAll(/`(?:state\(\)\.)?\.?(\w+)/g)].map(m => m[1])),
  };
}

const s = v => ({ type: 'string', ...(v ? { enum: v } : {}) });
const NV = { type: 'array', items: { type: 'object', properties: { name: s(), value: s() }, required: ['name', 'value'] } };

const PICK = {
  type: 'object',
  properties: { reason: s(), uses: { type: 'array', items: s(names) } },
  required: ['reason', 'uses'],
};

const LESSON = {
  type: 'object',
  properties: {
    title: s(), brand: s(), summary: s(),
    scenes: { type: 'array', items: { type: 'object', properties: { id: s(), component: s(), params: NV }, required: ['id', 'component', 'params'] } },
    steps: { type: 'array', items: { type: 'object', properties: {
      scene: s(), eyebrow: s(), title: s(), lead: s(),
      body: { type: 'array', items: s() }, callout: s(), describe: s(),
      set: NV,
      notes: { type: 'array', items: { type: 'object', properties: { anchor: s(), text: s(), card: s() }, required: ['anchor'] } },
      legend: { type: 'boolean' },
      controls: { type: 'array', items: { type: 'object', properties: {
        type: s(['slider', 'button', 'readout']), label: s(), param: s(), key: s(),
        min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
        unit: s(), digits: { type: 'integer' }, set: NV,
      }, required: ['type', 'label'] } },
      nextLabel: s(),
    }, required: ['scene', 'eyebrow', 'title', 'lead', 'describe'] } },
  },
  required: ['title', 'brand', 'summary', 'scenes', 'steps'],
};

const PRE = 'You compose science lessons for college Bio 101 students from a component library. Reply only in the JSON shape asked for.';

async function call(system, content, schema, max) {
  const t0 = Date.now();
  const go = () => p.ask({ system, messages: [{ role: 'user', content }], schema, max, thinking: 'low', model });
  // A long think can drop the connection ("fetch failed"); that is the transport, so once more.
  const o = await go().catch(e => { if (!/fetch failed/.test(e.message)) throw e; return go(); });
  return { ...o, ms: Date.now() - t0 };
}

function check(lesson, used) {
  const warn = [];
  const F = Object.fromEntries(used.map(n => [n, facts(n)]));
  const byId = {};
  for (const sc of lesson.scenes || []) {
    if (!F[sc.component]) { warn.push(`scene ${sc.id}: ${sc.component} was not picked`); continue; }
    byId[sc.id] = sc.component;
    for (const q of sc.params || []) if (!F[sc.component].params.has(q.name)) warn.push(`${sc.component} param ${q.name}`);
  }
  for (const [i, st] of (lesson.steps || []).entries()) {
    const n = byId[st.scene] || Object.values(byId)[0];
    const f = F[n]; if (!f) continue;
    for (const q of st.set || []) if (!f.params.has(q.name)) warn.push(`step ${i + 1} ${n} param ${q.name}`);
    for (const x of st.notes || []) if (f.anchors.size && !f.anchors.has(x.anchor)) warn.push(`step ${i + 1} ${n} anchor ${x.anchor}`);
    for (const m of String(st.describe || '').matchAll(/\{(\w+)\}/g)) if (!f.state.has(m[1]) && !f.params.has(m[1])) warn.push(`step ${i + 1} ${n} state ${m[1]}`);
    for (const c of st.controls || []) {
      if (c.type === 'slider' && !f.params.has(c.param)) warn.push(`step ${i + 1} ${n} slider ${c.param}`);
      if (c.type === 'readout' && !f.state.has(c.key) && !f.params.has(c.key)) warn.push(`step ${i + 1} ${n} readout ${c.key}`);
      if (c.type === 'button') for (const q of c.set || []) if (!f.params.has(q.name)) warn.push(`step ${i + 1} ${n} button param ${q.name}`);
    }
  }
  return warn;
}

(async () => {
  const pickSys = [PRE, '# Components\n\n' + catalog, sections['Scale: what rung each component sits at']].join('\n\n');
  const a = await call(pickSys, `Request: ${request}\n\nPick the one or two components this lesson mounts. Two only when the lesson changes scale or compares two things.`, PICK, 8000);
  const used = [...new Set(a.json.uses)].filter(n => names.includes(n)).slice(0, 2);

  const compSys = [PRE, compose, sections['Scale: what rung each component sits at'], sections['Copy'], ...used.map(n => sections[n])].join('\n\n');
  const b = await call(compSys, `Request: ${request}\n\nComponents to use: ${used.join(', ')}. Write the lesson.`, LESSON, 30000);
  const lesson = b.json;
  const warn = check(lesson, used);

  const json = JSON.stringify(lesson, null, 1).replace(/<\//g, '<\\/');
  const page = `<!doctype html>
<!-- requests
1. ${request.replace(/--/g, '-')}
-->
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${String(lesson.title || '').replace(/</g, '&lt;')}</title></head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="../kit/app.js" data-shell="steps" data-use="${used.join(',')}"></script>
<script type="application/json" id="lesson">
${json}
</script>
<script src="../kit/compose.js"></script>
</body></html>
`;
  fs.writeFileSync(path.resolve(out), page);
  const tok = o => ({ in: o.usage.input + o.usage.cached, out: o.usage.output });
  console.log(JSON.stringify({ model: b.served, uses: used, pick: { ms: a.ms, ...tok(a) }, compose: { ms: b.ms, ...tok(b) },
    steps: (lesson.steps || []).length, warn, out }));
})().catch(e => { console.error(String(e.message || e).slice(0, 400)); process.exit(1); });
