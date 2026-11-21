/* =============================================================================
 *  kit/compose.js — a step-through lesson from a JSON spec, no code written
 * =============================================================================
 *  The page a model writes when it composes instead of coding. It is the
 *  app.js tag, this tag, and one <script type="application/json" id="lesson">:
 *
 *      { title, brand, summary,
 *        scenes: [{ id, component, params: [{name, value}] }],      // 1 or 2
 *        steps:  [{ scene, eyebrow, title, lead, body: [..], callout,
 *                   describe,               // "{volume}" reads state().volume
 *                   set: [{name, value}],   // glides, as set() does
 *                   notes: [{anchor, text, card}],
 *                   legend: bool,
 *                   controls: [{ type: 'slider'|'readout'|'button', ... }],
 *                   nextLabel }] }
 *
 *  Every value arrives as a string, because a free-form object is the one
 *  shape a structured-output schema cannot hold; `val` coerces it back.
 *
 *  Text may carry <strong> and <em> and nothing else: everything is escaped,
 *  then those four tags are let back in. Loaded after app.js, which has
 *  already document.written the shell and the components this runs on.
 * ========================================================================== */
(function () {
  'use strict';

  const el = document.getElementById('lesson');
  if (!el) return;
  const spec = JSON.parse(el.textContent);

  function val(v) {
    if (typeof v !== 'string') return v;
    const s = v.trim();
    if (s === 'true') return true;
    if (s === 'false') return false;
    if (s !== '' && !isNaN(+s)) return +s;
    if (s === 'null') return null;
    if (/^[{[]/.test(s)) { try { return JSON.parse(s); } catch (e) { /* a string after all */ } }
    return s;
  }
  /* `proteins.leak` is `{ proteins: { leak } }`: a param that is an object
     arrives one key at a time, since a name and a string is all a value is. */
  function params(list) {
    const out = {};
    for (const p of list || []) {
      const keys = String(p.name).split('.');
      let o = out;
      keys.slice(0, -1).forEach(k => { o = (o[k] = o[k] && typeof o[k] === 'object' ? o[k] : {}); });
      o[keys[keys.length - 1]] = val(p.value);
    }
    return out;
  }
  /* A member set alone would REPLACE its object: `{ proteins: { leak } }`
     takes complexes I-IV and the synthase off stage to put an uncoupler on.
     So a dotted name is merged into the component's live value first, read
     from `sim.params()` where the component exposes it. */
  function setOn(c, list, opts) {
    const p = params(list);
    const live = c.sim && typeof c.sim.params === 'function' ? c.sim.params() : null;
    for (const q of list || []) {
      const top = String(q.name).split('.')[0];
      if (top !== q.name && live && live[top] && typeof live[top] === 'object')
        p[top] = Object.assign({}, live[top], p[top]);
    }
    return c.set(p, opts);
  }
  const dotted = list => (list || []).filter(q => String(q.name).includes('.'));
  const plain  = list => (list || []).filter(q => !String(q.name).includes('.'));

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/&lt;(\/?)(strong|em)&gt;/g, '<$1$2>')
    .replace(/&lt;(\/?)b&gt;/g, '<$1strong>').replace(/&lt;(\/?)i&gt;/g, '<$1em>')
    // A small model writes markdown whatever it is told; it means the same two tags.
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(\S(?:.*?\S)?)\*/g, '<em>$1</em>');

  function fmt(x, digits) {
    if (typeof x !== 'number') return x == null ? '…' : String(x);
    if (digits != null) return x.toFixed(digits);
    const a = Math.abs(x);
    return a >= 100 ? String(Math.round(x)) : a >= 10 ? x.toFixed(1) : x.toFixed(2);
  }
  const fill = (tpl, s) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => fmt(s && s[k]));

  const body = st => [
    st.lead ? `<p class="lead"><strong>${esc(String(st.lead).replace(/\*\*/g, ''))}</strong></p>` : '',
    ...(st.body || []).map(p => `<p>${esc(p)}</p>`),
    st.callout ? `<p class="callout">${esc(st.callout)}</p>` : '',
  ].join('');

  function controlsHtml(list) {
    let html = '', stats = '', btns = '';
    list.forEach((c, i) => {
      if (c.type === 'slider') {
        html += `<div class="slider"><div class="slider-head"><span class="label">${esc(c.label)}</span>`
              + `<span class="value" id="cv${i}"></span></div>`
              + `<input type="range" id="c${i}" min="${+c.min || 0}" max="${c.max == null ? 1 : +c.max}" step="${+c.step || 0.01}"></div>`;
      } else if (c.type === 'readout') {
        stats += `<div class="stat"><div class="stat-label">${esc(c.label)}</div>`
               + `<div class="stat-value" id="c${i}">…</div>${c.unit ? `<div class="stat-sub">${esc(c.unit)}</div>` : ''}</div>`;
      } else if (c.type === 'button') {
        btns += `<button class="btn secondary" id="c${i}">${esc(c.label)}</button> `;
      }
    });
    if (btns) html += `<div class="choices">${btns}</div>`;
    if (stats) html += `<div class="stats">${stats}</div>`;
    return html;
  }

  const comps = {};
  const two = (spec.scenes || []).length > 1;
  const steps = (spec.steps || []).map((st, i) => {
    const ctls = st.controls || [];
    let unsub = null;
    /* "2 · Lysis" goes stale the moment a step is added above it; the number
       is the step's place, so it is read from the place. */
    const eyebrow = String(st.eyebrow || '').replace(/^\s*\d+\s*([·.:\-–]\s*)/, `${i + 1} · `);
    return {
      eyebrow, title: st.title, body: body(st), nextLabel: st.nextLabel,
      ...(two && st.scene ? { scene: st.scene } : {}),
      describe: () => { const c = comps[st.scene] || Object.values(comps)[0]; return fill(st.describe, c && c.state()); },
      onEnter(ctx) {
        const c = comps[st.scene] || Object.values(comps)[0];
        c.notes(false);
        if (st.set && st.set.length) setOn(c, st.set);
        /* A note's text is a label, and a sentence there collides with its
           neighbour's. A model writes sentences anyway, so a long one becomes
           the card, under the library's own label for that part. */
        const lib = name => ((c.anchors && c.anchors()) || []).find(a => a.name === name) || {};
        for (const n of st.notes || []) {
          if (!n.text) { c.note(n.anchor); continue; }
          const long = n.text.trim().split(/\s+/).length > 5;
          const text = long ? (lib(n.anchor).text || lib(n.anchor).label || n.anchor) : n.text;
          const card = long ? (n.card || n.text) : n.card;
          c.note(n.anchor, card ? { text, card } : { text });
        }
        ctx.ui.controls(controlsHtml(ctls));
        const reads = [];
        ctls.forEach((k, i) => {
          const node = ctx.ui.q('#c' + i);
          if (!node) return;
          if (k.type === 'slider') {
            const out = ctx.ui.q('#cv' + i);
            const now = (c.state() || {})[k.param];
            const start = st.set && st.set.find(p => p.name === k.param);
            node.value = start ? val(start.value) : (typeof now === 'number' ? now : node.min);
            let first = true;
            ctx.ui.range(node, v => {
              out.textContent = fmt(v, k.digits) + (k.unit ? ' ' + k.unit : '');
              if (first) { first = false; return; }      // range() fires once on setup
              c.set({ [k.param]: v }, { snap: true });
            });
          } else if (k.type === 'readout') {
            reads.push(s => { node.textContent = fmt(s[k.key], k.digits); });
          } else if (k.type === 'button') {
            node.onclick = () => setOn(c, k.set);
          }
        });
        if (reads.length) unsub = c.on('frame', s => { if (s) reads.forEach(f => f(s)); });
        if (st.legend) ctx.ui.showPanel(c, { only: ['legend'] });
      },
      onExit() { if (unsub) unsub(); unsub = null; },
    };
  });

  const shell = LessonShell.create({
    brand: spec.brand || spec.title,
    hint: 'Drag to orbit · Scroll to zoom',
    ctx: { state: {} },
    steps,
  });
  for (const s of spec.scenes || []) {
    const C = window[s.component];
    const p = { ...params(plain(s.params)), viewOffset: shell.viewOffset };
    comps[s.id] = two ? shell.scene(s.id, e => C.mount(e, p)) : C.mount(shell.stage, p);
    // Members go on after the mount, merged into the defaults it laid out.
    if (dotted(s.params).length) setOn(comps[s.id], dotted(s.params));
  }
  shell.goTo(0);
})();
