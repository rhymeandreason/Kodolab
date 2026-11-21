/* =============================================================================
 *  api/_compose.js — a lesson COMPOSED as JSON, for a model too small to code
 * =============================================================================
 *  The builder's second route, beside `_builder.js`'s write-the-page one. The
 *  model never writes code: it picks components, then fills in a lesson
 *  object that `demos/kit/compose.js` turns into a step-through page.
 *
 *  TWO CALLS, BOTH SMALL. Gemma's quota on a Tier 1 key is 16k input tokens a
 *  minute and the whole reference is 29k, so the reference is never sent:
 *    1. PICK: a one-line catalog (heading + "Good for") in, 1-2 names out.
 *    2. COMPOSE: docs/Compose.md, Components.md's Scale and Copy, and the
 *       picked components' sections in; the lesson out.
 *  An edit is the same two calls with the current lesson in the context and
 *  the whole lesson back. A lesson is 1.5-5k tokens, so pairs would save
 *  little and cost a second way to fail.
 *
 *  WHAT THE PAGE IS decides the route of an edit, not the model asked: a
 *  composed page is edited as JSON by any model, and a written page cannot be
 *  edited by a compose-only one.
 *
 *  `check` is the semantic check gen-app does not have: every component,
 *  param, anchor and state field the JSON names is looked up in its own
 *  section. An unknown component or scene is a problem and gets one retry;
 *  an unknown param or anchor is a warning, because the runtime ignores it
 *  and the page still works.
 * ========================================================================== */
'use strict';

const fs   = require('fs');
const path = require('path');

const DOCS = path.join(__dirname, '..', 'demos', 'docs');
const SKIP = new Set(['Scene', 'Graph', 'Quiz']);   // no JSON shape for these yet

const MAX_PICK = 8000;      // output; Gemma's thinking counts against it
const MAX_LESSON = 30000;

/* Read per call, like the reference in _builder.js: the dev server drops the
 * require cache, and an edit to a section reaches the next build. */
function docs() {
  const ref = fs.readFileSync(path.join(DOCS, 'Components.md'), 'utf8');
  const compose = fs.readFileSync(path.join(DOCS, 'Compose.md'), 'utf8').replace(/^<!--.*?-->\s*/s, '');
  const sections = {};
  for (const part of ref.split(/^(?=## )/m)) {
    const h = /^## (.+)/.exec(part);
    if (h) sections[h[1].split(' — ')[0].trim()] = part.trim();
  }
  const names = Object.keys(sections).filter(n => /^[A-Z][A-Za-z]+$/.test(n)
    && sections[n].split('\n')[0].includes(' — ') && !SKIP.has(n));
  return { sections, names, compose };
}

function catalog({ sections, names }) {
  return names.map(n => {
    const s = sections[n];
    const good = (/^Good for:(.*)$/m.exec(s) || [, ''])[1].trim();
    return `- ${s.split('\n')[0].slice(3)}. ${good}`;
  }).join('\n');
}

/* What a section says a component has, read from its own prose. */
function facts(s) {
  const js = (/```js\n([\s\S]*?)```/.exec(s) || [, ''])[1];
  const ticks = re => { const l = (re.exec(s) || [''])[0]; return new Set([...l.matchAll(/`(\w+)`/g)].map(m => m[1])); };
  const params = new Set([...js.matchAll(/^\s*(\w+):/gm)].map(m => m[1]));
  /* `proteins: { complex:{...}, leak:null }` on one line: its keys are params too, dotted. */
  for (const m of js.matchAll(/^\s*(\w+):\s*\{([^\n]*)\}/gm))
    for (const k of m[2].matchAll(/(\w+)\s*:/g)) params.add(`${m[1]}.${k[1]}`);
  return {
    params,
    anchors: ticks(/^(Anchors for `note\(\)`|One list of parts serves).*$/m),
    // state() fields hide in tables and prose, so any backticked name counts.
    state: new Set([...s.matchAll(/`(?:state\(\)\.)?\.?(\w+)/g)].map(m => m[1])),
  };
}

const str = v => ({ type: 'string', ...(v ? { enum: v } : {}) });
const NV = { type: 'array', items: { type: 'object', properties: { name: str(), value: str() }, required: ['name', 'value'], additionalProperties: false } };

const pickSchema = names => ({
  type: 'object',
  properties: { reason: str(), uses: { type: 'array', items: str(names) } },
  required: ['reason', 'uses'], additionalProperties: false,
});

const LESSON = {
  type: 'object',
  properties: {
    title: str(), brand: str(), summary: str(),
    scenes: { type: 'array', items: { type: 'object', properties: { id: str(), component: str(), params: NV }, required: ['id', 'component', 'params'], additionalProperties: false } },
    steps: { type: 'array', items: { type: 'object', properties: {
      scene: str(), eyebrow: str(), title: str(), lead: str(),
      body: { type: 'array', items: str() }, callout: str(), describe: str(),
      set: NV,
      notes: { type: 'array', items: { type: 'object', properties: { anchor: str(), text: str(), card: str() }, required: ['anchor'], additionalProperties: false } },
      legend: { type: 'boolean' },
      controls: { type: 'array', items: { type: 'object', properties: {
        type: str(['slider', 'button', 'readout']), label: str(), param: str(), key: str(),
        min: { type: 'number' }, max: { type: 'number' }, step: { type: 'number' },
        unit: str(), digits: { type: 'integer' }, set: NV,
      }, required: ['type', 'label'], additionalProperties: false } },
      nextLabel: str(),
    }, required: ['scene', 'eyebrow', 'title', 'lead', 'describe'], additionalProperties: false } },
  },
  required: ['title', 'brand', 'summary', 'scenes', 'steps'], additionalProperties: false,
};

const PRE = 'You compose science lessons for college Bio 101 students from a component library. Reply only in the JSON shape asked for.';
const SCALE = 'Scale: what rung each component sits at';

/* {problems, warn}: problems fail the turn, warnings ride along. `strict`
 * makes an unknown PARAM a problem, so the first attempt is sent back once
 * with it quoted: a param is the lesson doing something, and one the
 * component lacks is a control that does nothing. Anchors and state fields
 * stay warnings, since a missing label or a blank readout costs less than a
 * retry. */
function check(lesson, d, strict) {
  const problems = [], warn = [];
  const param = msg => (strict ? problems : warn).push(msg + ', which the section does not list as a param');
  const byId = {};
  const scenes = Array.isArray(lesson.scenes) ? lesson.scenes : [];
  const steps = Array.isArray(lesson.steps) ? lesson.steps : [];
  if (!scenes.length) problems.push('no scenes: the lesson mounts nothing');
  if (scenes.length > 2) problems.push(`${scenes.length} scenes; a lesson has one or two`);
  if (!steps.length) problems.push('no steps');
  for (const sc of scenes) {
    if (!d.names.includes(sc.component)) { problems.push(`scene ${sc.id}: ${sc.component} is not a component`); continue; }
    byId[sc.id] = sc.component;
    const f = facts(d.sections[sc.component]);
    for (const q of sc.params || []) if (!f.params.has(q.name)) param(`${sc.component} param ${q.name}`);
  }
  for (const [i, st] of steps.entries()) {
    if (scenes.length > 1 && !byId[st.scene]) problems.push(`step ${i + 1} shows scene "${st.scene}", which no scene has as its id`);
    const n = byId[st.scene] || Object.values(byId)[0];
    if (!n) continue;
    const f = facts(d.sections[n]);
    for (const q of st.set || []) if (!f.params.has(q.name)) param(`step ${i + 1} sets ${n} ${q.name}`);
    for (const x of st.notes || []) if (f.anchors.size && !f.anchors.has(x.anchor)) warn.push(`step ${i + 1} ${n} anchor ${x.anchor}`);
    for (const m of String(st.describe || '').matchAll(/\{(\w+)\}/g)) if (!f.state.has(m[1]) && !f.params.has(m[1])) warn.push(`step ${i + 1} ${n} state ${m[1]}`);
    for (const c of st.controls || []) {
      if (c.type === 'slider' && !f.params.has(c.param)) param(`step ${i + 1} slider drives ${n} ${c.param}`);
      if (c.type === 'readout' && !f.state.has(c.key) && !f.params.has(c.key)) warn.push(`step ${i + 1} ${n} readout ${c.key}`);
      if (c.type === 'button') for (const q of c.set || []) if (!f.params.has(q.name)) param(`step ${i + 1} button sets ${n} ${q.name}`);
    }
  }
  return { problems, warn };
}

/* The page: the loader tag, the lesson, the runtime. One folder below demos/. */
function page(lesson) {
  const uses = [...new Set((lesson.scenes || []).map(s => s.component))];
  const json = JSON.stringify(lesson, null, 1).replace(/<\//g, '<\\/');
  const title = String(lesson.title || '').replace(/[<&]/g, c => (c === '<' ? '&lt;' : '&amp;'));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body>
<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
<script src="../kit/app.js" data-shell="steps" data-use="${uses.join(',')}"></script>
<script type="application/json" id="lesson">
${json}
</script>
<script src="../kit/compose.js"></script>
</body>
</html>
`;
}

const LESSON_RE = /<script type="application\/json" id="lesson">\n?([\s\S]*?)\n?<\/script>/;
const isComposed = html => LESSON_RE.test(String(html || '')) && /kit\/compose\.js/.test(String(html || ''));
function lessonOf(html) {
  const m = LESSON_RE.exec(String(html || ''));
  return m ? JSON.parse(m[1].replace(/<\\\//g, '</')) : null;
}

/* One call, with the transport's one blip retried: a long think can drop the
 * connection, which says nothing about the request. */
async function call(p, model, args) {
  const go = () => p.ask({ thinking: 'low', model, ...args });
  return go().catch(e => { if (!/fetch failed/.test(String(e && e.message))) throw e; return go(); });
}

/* PICK then COMPOSE. `current` is the lesson being edited, or null for a
 * draft; `extra` is what the turn adds to the request (errors, selection). */
async function turn({ p, model, request, current, extra, priced, sum }) {
  const d = docs();
  let usage = null, served = null;
  const now = current ? [...new Set((current.scenes || []).map(s => s.component))] : [];

  const pickSys = [PRE, '# Components\n\n' + catalog(d), d.sections[SCALE]].join('\n\n');
  const pickAsk = current
    ? `The lesson now uses: ${now.join(', ')}.\n\nThe student asks: ${request}\n\nWhich one or two components should the lesson use after this change? Keep the current ones unless the request needs a different subject.`
    : `Request from a teacher: ${request}\n\nPick the one or two components this lesson mounts. Two only when the lesson changes scale or compares two things.`;
  const a = await call(p, model, { system: pickSys, messages: [{ role: 'user', content: pickAsk }], schema: pickSchema(d.names), max: MAX_PICK });
  usage = sum(usage, priced(p, a.usage, model)); served = a.served;
  const picked = [...new Set(a.json.uses || [])].filter(n => d.names.includes(n)).slice(0, 2);
  /* An edit keeps every section the lesson already stands on: a pick that
     drops one would leave the model editing steps it has no reference for
     (Gemma, asked to add a brine step, picked Membrane over PlantCell and
     then kept the PlantCell steps anyway). A swap needs old and new both. */
  let uses = [...new Set([...now, ...picked])].slice(0, 3);
  if (!uses.length) uses = [d.names[0]];

  const sys = [PRE, d.compose, d.sections[SCALE], d.sections['Copy'], ...uses.map(n => d.sections[n])].join('\n\n');
  const context = current ? `Here is the lesson as it stands:\n\n${JSON.stringify(current)}${extra || ''}` : '';
  const ask = current
    ? `The student asks: ${request}\n\nComponents to use: ${uses.join(', ')}. Reply with the whole lesson, changed to answer them and keeping everything they did not ask to change.`
    : `Request from a teacher: ${request}\n\nComponents to use: ${uses.join(', ')}. Write the lesson.`;

  let lesson = null, problems = [], warn = [], retried = false;
  for (let i = 0; i < 2; i++) {
    const msg = i === 0 ? ask : `${ask}\n\nA previous attempt had these problems:\n${problems.map(x => '- ' + x).join('\n')}\n\nWrite it again without them.`;
    let b;
    try {
      b = await call(p, model, { system: sys, context, messages: [{ role: 'user', content: msg }], schema: LESSON, max: MAX_LESSON });
    } catch (e) {
      /* A reply that is not JSON at all: cut off at the cap, or a loose model
         talking. Worth the same one retry a broken page gets. */
      if (!(e instanceof SyntaxError)) throw e;
      problems = ['the reply was not valid JSON: ' + e.message];
      retried = true; continue;
    }
    usage = sum(usage, priced(p, b.usage, model)); served = b.served;
    lesson = b.json;
    ({ problems, warn } = check(lesson, d, i === 0));
    if (!problems.length) break;
    retried = true;
  }
  return { lesson, uses, problems, warn, retried, usage, served };
}

module.exports = { turn, page, isComposed, lessonOf, check, docs, catalog, facts, LESSON };
