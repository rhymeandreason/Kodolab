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
    return s;
  }
  const params = list => Object.fromEntries((list || []).map(p => [p.name, val(p.value)]));

  const esc = s => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
    .replace(/&lt;(\/?)(strong|em)&gt;/g, '<$1$2>')
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
  const steps = (spec.steps || []).map(st => {
    const ctls = st.controls || [];
    let unsub = null;
    return {
      eyebrow: st.eyebrow, title: st.title, body: body(st), nextLabel: st.nextLabel,
      ...(two && st.scene ? { scene: st.scene } : {}),
      describe: () => { const c = comps[st.scene] || Object.values(comps)[0]; return fill(st.describe, c && c.state()); },
      onEnter(ctx) {
        const c = comps[st.scene] || Object.values(comps)[0];
        c.notes(false);
        if (st.set && st.set.length) c.set(params(st.set));
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
            node.onclick = () => c.set(params(k.set));
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
    const p = { ...params(s.params), viewOffset: shell.viewOffset };
    comps[s.id] = two ? shell.scene(s.id, e => C.mount(e, p)) : C.mount(shell.stage, p);
  }
  shell.goTo(0);
})();
