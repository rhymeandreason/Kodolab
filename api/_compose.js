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
const { select } = require('./_select.js');
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

function catalog({ sections, names }, only) {
  return names.filter(n => !only || only.includes(n)).map(n => {
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

/* Every {name, value} list a lesson holds, with the component it drives. */
function paramLists(lesson) {
  const byId = {}; const out = [];
  for (const sc of lesson.scenes || []) { byId[sc.id] = sc.component; out.push([sc.component, sc.params]); }
  const first = (lesson.scenes || [])[0];
  for (const st of lesson.steps || []) {
    const n = byId[st.scene] || (first && first.component);
    out.push([n, st.set]);
    for (const c of st.controls || []) if (c.type === 'button') out.push([n, c.set]);
  }
  return out.filter(([n, l]) => n && Array.isArray(l));
}

/* A short name for the one dotted param it can only mean: `leak` is
 * `proteins.leak`. Both models reached for the short one, and the section's
 * example nests it where a name-and-string cannot see. In place. */
function normalize(lesson, d) {
  const F = {};
  const fix = (n, name) => {
    const f = F[n] || (F[n] = facts(d.sections[n] || ''));
    if (f.params.has(name)) return name;
    const hits = [...f.params].filter(k => k.endsWith('.' + name));
    return hits.length === 1 ? hits[0] : name;
  };
  for (const [n, list] of paramLists(lesson)) for (const q of list) q.name = fix(n, q.name);
  const first = (lesson.scenes || [])[0];
  const byId = Object.fromEntries((lesson.scenes || []).map(sc => [sc.id, sc.component]));
  for (const st of lesson.steps || []) for (const c of st.controls || [])
    if (c.type === 'slider' && c.param) c.param = fix(byId[st.scene] || (first && first.component), c.param);
  return lesson;
}

/* {problems, warn}: problems fail the turn, warnings ride along. `strict`
 * makes an unknown PARAM a problem, so the first attempt is sent back once
 * with it quoted: a param is the lesson doing something, and one the
 * component lacks is a control that does nothing. Anchors and state fields
 * stay warnings, since a missing label or a blank readout costs less than a
 * retry. */
function check(lesson, d, strict) {
  const problems = [], warn = [];
  const param = msg => (strict ? problems : warn).push(msg + ', which the section does not list as a param');
  /* A dotted param is a member of an object (`proteins.leak`), and its value
     is that member: a position, or null to take it away. `true` places
     nothing, and the page renders as if the step never asked. */
  for (const [n, list] of paramLists(lesson)) for (const q of list)
    if (q.name.includes('.') && !/^\s*(null|\{[\s\S]*\})\s*$/.test(String(q.value)))
      problems.push(`${n} ${q.name} is "${q.value}": it takes an object like {"x":0}, or "null" to remove it`);
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

/* ---- edit ops ----------------------------------------------------------
 * An edit is a list of verbs on the lesson, not the lesson rewritten. A
 * whole-lesson edit cost Gemma 132 s and 6k tokens to add one slider, and
 * let Flash change a readout nobody asked about; an op touches only what it
 * names and is checked on its own. Steps are numbered from 1, as the panel
 * numbers them, and the lesson the model reads carries that number as `n`.
 *
 * The verbs are the editor's too: a button in the Outline or the text mode
 * can send the same op with no model behind it. Keep the list short; a
 * request the ops keep failing on falls back to the whole lesson, and a
 * pattern in those fallbacks is what earns a new verb. */
const VERBS = ['addStep', 'removeStep', 'moveStep', 'setText', 'setBody', 'set', 'addNote', 'removeNote',
               'addControl', 'removeControl', 'legend', 'addScene', 'swapComponent', 'retitle'];
const FIELDS = ['eyebrow', 'title', 'lead', 'callout', 'describe', 'nextLabel'];
const STEP = LESSON.properties.steps.items;
const CONTROL = STEP.properties.controls.items;

const OPS = {
  type: 'object',
  properties: {
    summary: str(),
    ops: { type: 'array', items: { type: 'object', properties: {
      op: str(VERBS),
      step: { type: 'integer' }, after: { type: 'integer' }, to: { type: 'integer' }, index: { type: 'integer' },
      field: str(FIELDS), text: str(), paragraphs: { type: 'array', items: str() },
      anchor: str(), card: str(), params: NV, on: { type: 'boolean' },
      control: CONTROL, add: STEP,
      scene: str(), component: str(),
    }, required: ['op'], additionalProperties: false } },
  },
  required: ['summary', 'ops'], additionalProperties: false,
};

/* Applies ops in order to a copy. {lesson} or {failed: [messages]}: every
 * failure is reported, so the retry can quote them all. */
function applyOps(lesson, ops, d) {
  const L = JSON.parse(JSON.stringify(lesson));
  L.steps = L.steps || []; L.scenes = L.scenes || [];
  const failed = [];
  /* STEP NUMBERS ARE THE LESSON AS SHOWN, for every op in the list. A model
     writes "add after 2, then move 4 to 5" against the numbering it read, not
     against a list that the first op has already renumbered (Gemma, asked for
     a brine step, added it and then moved three steps by their old numbers).
     So a number names a step object fixed before any op runs. `to` is the one
     position, and it means the final order. */
  const shown = L.steps.slice();
  const n0 = shown.length;
  const at = (o, k) => {
    const i = o[k];
    if (!Number.isInteger(i) || i < 1 || i > n0) { failed.push(`${o.op}: ${k} ${i} is not a step (1-${n0})`); return null; }
    const st = shown[i - 1];
    if (!L.steps.includes(st)) { failed.push(`${o.op}: step ${i} was removed earlier in this list`); return null; }
    return st;
  };
  const indexOf = st => L.steps.indexOf(st);
  const merge = (list, add) => {
    const out = (list || []).filter(q => !(add || []).some(a => a.name === q.name));
    return out.concat(add || []);
  };
  (Array.isArray(ops) ? ops : []).forEach(o => {
    let st;
    switch (o.op) {
      case 'addStep': {
        if (!o.add || !o.add.title) { failed.push('addStep: needs `add`, the whole step'); break; }
        const step = { ...o.add }; delete step.n;
        if (o.after == null || o.after === n0) { L.steps.push(step); break; }
        if (o.after === 0) { L.steps.unshift(step); break; }
        const prev = at(o, 'after');
        if (!prev) break;
        /* After the shown step, and after anything added after it before this. */
        let i = indexOf(prev) + 1;
        while (i < L.steps.length && !shown.includes(L.steps[i])) i++;
        L.steps.splice(i, 0, step); break;
      }
      case 'removeStep': if ((st = at(o, 'step'))) L.steps.splice(indexOf(st), 1); break;
      case 'moveStep': {
        if (!(st = at(o, 'step'))) break;
        if (!Number.isInteger(o.to) || o.to < 1 || o.to > L.steps.length) { failed.push(`moveStep: to ${o.to} is not 1-${L.steps.length}`); break; }
        L.steps.splice(indexOf(st), 1); L.steps.splice(o.to - 1, 0, st); break;
      }
      case 'setText':
        if (!(st = at(o, 'step'))) break;
        if (!FIELDS.includes(o.field)) { failed.push(`setText: field ${o.field} is not one of ${FIELDS.join(', ')}`); break; }
        if (o.text) st[o.field] = o.text; else delete st[o.field];
        break;
      case 'setBody': if ((st = at(o, 'step'))) st.body = Array.isArray(o.paragraphs) ? o.paragraphs : []; break;
      case 'set':
        if (!(st = at(o, 'step'))) break;
        if (!Array.isArray(o.params) || !o.params.length) { failed.push('set: needs `params`'); break; }
        st.set = merge(st.set, o.params); break;
      case 'addNote':
        if (!(st = at(o, 'step'))) break;
        if (!o.anchor) { failed.push('addNote: needs `anchor`'); break; }
        st.notes = (st.notes || []).filter(x => x.anchor !== o.anchor)
          .concat([{ anchor: o.anchor, ...(o.text ? { text: o.text } : {}), ...(o.card ? { card: o.card } : {}) }]);
        break;
      case 'removeNote':
        if (!(st = at(o, 'step'))) break;
        if (!(st.notes || []).some(x => x.anchor === o.anchor)) { failed.push(`removeNote: step ${o.step} has no note on ${o.anchor}`); break; }
        st.notes = st.notes.filter(x => x.anchor !== o.anchor); break;
      case 'addControl':
        if (!(st = at(o, 'step'))) break;
        if (!o.control || !o.control.type) { failed.push('addControl: needs `control`'); break; }
        st.controls = (st.controls || []).concat([o.control]); break;
      case 'removeControl': {
        if (!(st = at(o, 'step'))) break;
        const n = (st.controls || []).length;
        if (!Number.isInteger(o.index) || o.index < 1 || o.index > n) { failed.push(`removeControl: index ${o.index} is not a control on step ${o.step} (1-${n})`); break; }
        st.controls.splice(o.index - 1, 1); break;
      }
      case 'legend': if ((st = at(o, 'step'))) st.legend = o.on !== false; break;
      case 'addScene':
        if (L.scenes.length >= 2) { failed.push('addScene: a lesson has two scenes at most; swapComponent replaces one'); break; }
        if (!d.names.includes(o.component)) { failed.push(`addScene: ${o.component} is not a component`); break; }
        if (!o.scene || L.scenes.some(x => x.id === o.scene)) { failed.push(`addScene: needs a new scene id, not "${o.scene}"`); break; }
        /* A lesson that had one scene named its steps' scene loosely; with two
           every step must name one, so the old ones get the first id. */
        L.steps.forEach(x => { if (!L.scenes.some(c => c.id === x.scene)) x.scene = L.scenes[0] && L.scenes[0].id; });
        L.scenes.push({ id: o.scene, component: o.component, params: o.params || [] }); break;
      case 'swapComponent': {
        const sc = L.scenes.find(x => x.id === o.scene) || (L.scenes.length === 1 && !o.scene ? L.scenes[0] : null);
        if (!sc) { failed.push(`swapComponent: no scene "${o.scene}"`); break; }
        if (!d.names.includes(o.component)) { failed.push(`swapComponent: ${o.component} is not a component`); break; }
        sc.component = o.component; sc.params = o.params || [];
        /* The old component's params, notes and controls mean nothing to the
           new one; the ops that follow in the same list put new ones back. */
        L.steps.filter(x => x.scene === sc.id || L.scenes.length === 1).forEach(x => { delete x.set; delete x.notes; delete x.controls; });
        break;
      }
      case 'retitle':
        if (!o.text) { failed.push('retitle: needs `text`'); break; }
        L.title = o.text; L.brand = o.text; break;
      default: failed.push(`${o.op} is not a verb: ${VERBS.join(', ')}`);
    }
  });
  return failed.length ? { failed } : { lesson: L };
}

/* The lesson as the model reads it for an edit: steps numbered as the panel numbers them. */
const numbered = lesson => ({ ...lesson, steps: (lesson.steps || []).map((s, i) => ({ n: i + 1, ...s })) });

/* PICK then COMPOSE. `current` is the lesson being edited, or null for a
 * draft; `extra` is what the turn adds to the request (errors, selection).
 * An edit tries ops first, twice, then the whole lesson once. */
async function turn({ p, model, request, current, extra, priced, sum }) {
  const d = docs();
  let usage = null, served = null;
  const now = current ? [...new Set((current.scenes || []).map(s => s.component))] : [];

  /* The selector ranks first (api/_select.js). Confident on a draft, its pick
     stands and the PICK call is skipped; confident on an edit that brings in
     nothing new, the same. Otherwise the model chooses, from the shortlist
     plus what the lesson already uses rather than from all of them. A selector
     that cannot run (no vectors, the embedder down) leaves the old route. */
  let sel = null;
  try { sel = await select(request); } catch (e) { console.warn('[compose] selector off:', e.message); }
  let picked;
  if (sel && sel.confident && sel.uses.length && (!current || sel.uses.every(n => now.includes(n)))) {
    picked = sel.uses;
  } else {
    const offer = sel ? [...new Set([...now, ...sel.shortlist])] : d.names;
    const pickSys = [PRE, '# Components\n\n' + catalog(d, offer), d.sections[SCALE]].join('\n\n');
    const pickAsk = current
      ? `The lesson now uses: ${now.join(', ')}.\n\nThe student asks: ${request}\n\nWhich one or two components should the lesson use after this change? Keep the current ones unless the request needs a different subject.`
      : `Request from a teacher: ${request}\n\nPick the one or two components this lesson mounts. Two only when the lesson changes scale or compares two things.`;
    const a = await call(p, model, { system: pickSys, messages: [{ role: 'user', content: pickAsk }], schema: pickSchema(offer), max: MAX_PICK });
    usage = sum(usage, priced(p, a.usage, model)); served = a.served;
    picked = [...new Set(a.json.uses || [])].filter(n => d.names.includes(n)).slice(0, 2);
  }
  /* An edit keeps every section the lesson already stands on: a pick that
     drops one would leave the model editing steps it has no reference for
     (Gemma, asked to add a brine step, picked Membrane over PlantCell and
     then kept the PlantCell steps anyway). A swap needs old and new both. */
  let uses = [...new Set([...now, ...picked])].slice(0, 3);
  if (!uses.length) uses = [d.names[0]];

  const sys = [PRE, d.compose, d.sections[SCALE], d.sections['Copy'], ...uses.map(n => d.sections[n])].join('\n\n');
  const context = current ? `Here is the lesson as it stands:\n\n${JSON.stringify(numbered(current))}${extra || ''}` : '';
  const ask = current
    ? `The student asks: ${request}\n\nComponents available: ${uses.join(', ')}. Reply with the whole lesson, changed to answer them and keeping everything they did not ask to change.`
    : `Request from a teacher: ${request}\n\nComponents to use: ${uses.join(', ')}. Write the lesson.`;

  let lesson = null, problems = [], warn = [], retried = false, mode = current ? 'ops' : 'draft', ops = null, fallback = null;
  const again = (msg, why) => `${msg}\n\nA previous attempt had these problems:\n${why.map(x => '- ' + x).join('\n')}\n\nTry again without them.`;

  if (current) {
    const opsAsk = `The student asks: ${request}\n\nComponents available: ${uses.join(', ')}. Reply with the edit ops that answer them, as few as the change needs. Change nothing they did not ask for.`;
    let why = [];
    for (let i = 0; i < 2; i++) {
      let b;
      try {
        b = await call(p, model, { system: sys, context, messages: [{ role: 'user', content: i ? again(opsAsk, why) : opsAsk }], schema: OPS, max: MAX_LESSON });
      } catch (e) {
        if (!(e instanceof SyntaxError)) throw e;
        why = ['the reply was not valid JSON: ' + e.message]; retried = true; continue;
      }
      usage = sum(usage, priced(p, b.usage, model)); served = b.served;
      ops = b.json.ops || [];
      const r = applyOps(current, ops, d);
      if (r.failed) { why = r.failed; retried = true; continue; }
      normalize(r.lesson, d);
      /* Judged on what the edit brought in: a problem the lesson already had
         is not this request's to fix, and refusing every edit over it would
         leave the student unable to change anything at all. */
      const had = new Set(check(normalize(JSON.parse(JSON.stringify(current)), d), d, true).problems);
      ({ problems, warn } = check(r.lesson, d, i === 0));
      warn = warn.concat(problems.filter(x => had.has(x)));
      problems = problems.filter(x => !had.has(x));
      if (!problems.length) { r.lesson.summary = b.json.summary || current.summary; return { lesson: r.lesson, uses, problems, warn, retried, usage, served, mode, ops, selected: sel && { uses: sel.uses, confident: sel.confident, skipped: picked === sel.uses } }; }
      why = problems; retried = true;
    }
    mode = 'whole'; fallback = why.join('; ');
  }

  for (let i = 0; i < 2; i++) {
    const msg = i === 0 ? ask : again(ask, problems);
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
    (lesson.steps || []).forEach(s => delete s.n);
    normalize(lesson, d);
    ({ problems, warn } = check(lesson, d, !current && i === 0));
    if (!problems.length) break;
    retried = true;
    if (current) break;   // the fallback gets one attempt; a second failure is a finding
  }
  return { lesson, uses, problems, warn, retried, usage, served, mode, ops, fallback, selected: sel && { uses: sel.uses, confident: sel.confident, skipped: picked === sel.uses } };
}

module.exports = { turn, page, isComposed, lessonOf, check, docs, catalog, facts, applyOps, numbered, normalize, LESSON, OPS, VERBS };
