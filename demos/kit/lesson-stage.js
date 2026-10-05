/* =============================================================================
 *  kit/lesson-stage.js — stage chrome for a lesson past one scene per step
 * =============================================================================
 *  LessonStage.attach(shell, { toggle, boxes }) after LessonShell.create, and
 *  everything lands on shell.ctx. Chrome is css/lesson-shell.css.
 *
 *  A/B SPLIT. ctx.split(on, { left, right }) hides the panel and halves the
 *  stage. A label's text after " · " is the small line under it. Then:
 *      caption(text)        the pill at the foot, which holds Next
 *      side(side, text)     a half's own words, under its label
 *      sideNote(side, [..]) cards stacked where a half's scene was
 *      bar(on)              no caption box; Next joins the scrubber
 *  Back and the step count sit bottom-left. `stage.say` is the caption's
 *  column, for a page's own key under the words.
 *
 *  SWITCH. `toggle: [{ value, label }, ..]` puts one choice on the stage,
 *  centred in the free room. ctx.toggle(on) shows it; ctx.variant is the
 *  choice and survives steps; ctx.onToggle(v) is the step's listener, which
 *  the step clears on exit. ctx.setVariant(v) presses it from code.
 *
 *  SCRUBBER. ctx.scrub({ max, value, step, label, playing, onScrub, onPlay,
 *  onStep }) or ctx.scrub(null). It reports; the step decides what a drag or
 *  a press does. Prev/next show only when onStep is given. A drag in progress
 *  is not written back to.
 *
 *  UNDER. ctx.under(html): the sentence that names what the reader is looking
 *  at, under the scene rather than in the panel.
 *
 *  BOXES, BUILT WHEN A STEP ASKS AND DESTROYED WHEN NONE DOES. `boxes:
 *  { name: { side: 'full'|'left'|'right', fade, mount: el => api } }`, then
 *  ctx.use({ show, keep }) returns the live apis. A browser drops its OLDEST
 *  WebGL context silently past a small cap (kit/card-stage.js), so a step
 *  says which scenes it shows plus which to keep warm, and the rest give
 *  their context back. Separate from shell.scene's pool because these sit
 *  side by side and fade over each other, and a split's two boxes are a
 *  different layout from the shell's equal columns. ctx.fade(name, on) for a
 *  box declared `fade`; it starts out, and takes no drag while out.
 *
 *  Exposes window.LessonStage.
 * ========================================================================== */
(function (global) {
  'use strict';

  const clean = t => (t ? String(t).replace(/\s+/g, ' ').trim() : '');
  const mk = (cls, tag = 'div') => { const e = document.createElement(tag); e.className = cls; return e; };

  function attach(shell, opts = {}) {
    const ctx = shell.ctx, stage = shell.stage, root = shell.el;

    /* ---- split chrome ---------------------------------------------------- */
    const divider = mk('lshell-divider lshell-split-only');
    const label = { left: mk('lshell-label left lshell-split-only'), right: mk('lshell-label right lshell-split-only') };
    stage.append(divider, label.left, label.right);

    const sides = {}, notes = {};
    for (const s of ['left', 'right']) {
      sides[s] = mk('lshell-side ' + s, 'p'); sides[s].hidden = true;
      notes[s] = mk('lshell-note ' + s); notes[s].hidden = true;
      stage.insertBefore(sides[s], divider); stage.insertBefore(notes[s], divider);
    }

    const cap = mk('lshell-cap lshell-split-only');
    cap.innerHTML = `<div class="lshell-say"><p></p></div><nav><button class="btn primary" type="button">Next</button></nav>`;
    root.appendChild(cap);
    const capText = cap.querySelector('p'), capNav = cap.querySelector('nav');
    const next = capNav.querySelector('button');
    const foot = mk('lshell-foot lshell-split-only');
    foot.innerHTML = `<button class="btn ghost" type="button">Back</button><span class="lshell-count"></span>`;
    root.appendChild(foot);
    const back = foot.querySelector('button'), count = foot.querySelector('span');
    back.onclick = () => shell.goTo(shell.current - 1);
    next.onclick = () => shell.goTo(shell.current + 1);

    const put = (el, text) => { const t = clean(text); if (el.textContent !== t) el.textContent = t; el.hidden = !t; };
    /* Written every frame by a scrubbed step, so only a change touches the
       DOM, and cards already up stay put so only a new one fades in. */
    const putNotes = (el, texts) => {
      const list = (texts || []).map(clean);
      el.hidden = !list.length;
      if ([...el.children].map(c => c.textContent).join('\n') === list.join('\n')) return;
      while (el.children.length > list.length || [...el.children].some((c, i) => c.textContent !== list[i])) el.lastElementChild.remove();
      for (let i = el.children.length; i < list.length; i++) { const d = mk(''); d.textContent = list[i]; el.appendChild(d); }
    };
    const head = (el, t = '') => {
      const [name, ...rest] = t.split(' · ');
      el.textContent = name;
      if (rest.length) { const sm = document.createElement('small'); sm.textContent = rest.join(' · '); el.appendChild(sm); }
    };

    ctx.split = (on, labels = {}) => {
      document.body.classList.toggle('lshell-split', !!on);
      head(label.left, labels.left); head(label.right, labels.right);
      for (const s of ['left', 'right']) { put(sides[s], null); putNotes(notes[s], []); }
      ctx.bar(false);
      if (!on) capText.textContent = '';
      /* The panel's room changed under every live box. */
      for (const b of Object.values(live)) { const l = b.api.box || b.api; if (l.layout) l.layout(); }
      place();
    };
    ctx.caption = text => { const t = clean(text); if (capText.textContent !== t) capText.textContent = t; };
    ctx.side = (side, text) => put(sides[side], text);
    ctx.sideNote = (side, texts) => putNotes(notes[side], texts == null ? [] : [].concat(texts));
    ctx.bar = on => {
      document.body.classList.toggle('lshell-bar', !!on);
      (on ? controls : capNav).appendChild(next);
      place();
    };

    /* ---- switch ---------------------------------------------------------- */
    const toggle = mk('lshell-toggle'); toggle.hidden = true;
    if (opts.toggle) {
      for (const o of opts.toggle) {
        const b = document.createElement('button');
        b.type = 'button'; b.dataset.v = o.value; b.textContent = o.label;
        b.onclick = () => setVariant(o.value);
        toggle.appendChild(b);
      }
      root.appendChild(toggle);
    }
    function setVariant(v) {
      ctx.variant = v;
      for (const b of toggle.children) b.classList.toggle('is-on', b.dataset.v === String(v));
      if (ctx.onToggle) ctx.onToggle(v);
    }
    ctx.onToggle = null;
    if (opts.toggle) setVariant(ctx.variant != null ? ctx.variant : opts.toggle[0].value);
    ctx.setVariant = setVariant;
    ctx.toggle = on => { toggle.hidden = !on; place(); };

    /* ---- scrubber -------------------------------------------------------- */
    const controls = mk('lshell-controls'); controls.hidden = true;
    const scrub = mk('lshell-scrub');
    scrub.innerHTML = `<button type="button" data-k="prev" aria-label="Back one">‹</button>
      <button type="button" data-k="play" aria-label="Play"></button>
      <button type="button" data-k="next" aria-label="Forward one">›</button>
      <input type="range" min="0" aria-label="Scrub"><span></span>`;
    const q = s => scrub.querySelector(s);
    const sPlay = q('[data-k=play]'), sIn = q('input'), sAt = q('span'), sPrev = q('[data-k=prev]'), sNext = q('[data-k=next]');
    let on = {};
    sIn.oninput = () => on.onScrub && on.onScrub(+sIn.value);
    /* A drag, not focus: the input keeps focus after release, and a focus test
       left the thumb parked there while playback ran on. */
    let dragging = false;
    sIn.addEventListener('pointerdown', () => { dragging = true; });
    window.addEventListener('pointerup', () => { dragging = false; });
    sPlay.onclick = () => on.onPlay && on.onPlay();
    sPrev.onclick = () => on.onStep && on.onStep(-1);
    sNext.onclick = () => on.onStep && on.onStep(1);
    controls.append(scrub);
    root.appendChild(controls);
    ctx.scrub = o => {
      const was = controls.hidden;
      controls.hidden = !o;
      if (!o) { place(); return; }
      on = o;
      sIn.max = o.max;
      sIn.step = o.step || 1;
      if (!dragging) sIn.value = o.value;
      sIn.style.setProperty('--p', (o.max ? sIn.value / o.max * 100 : 0) + '%');
      sAt.textContent = o.label || '';
      sPlay.textContent = o.playing ? '❚❚' : '▶';
      sPlay.setAttribute('aria-label', o.playing ? 'Pause' : 'Play');
      sPrev.hidden = sNext.hidden = !o.onStep;
      sPrev.disabled = o.value <= 0;
      sNext.disabled = o.value >= o.max;
      if (was) place();
    };

    /* ---- under ----------------------------------------------------------- */
    const under = mk('lshell-under'); under.hidden = true;
    root.appendChild(under);
    ctx.under = html => { under.hidden = !html; under.innerHTML = html || ''; place(); };

    /* ---- placement: everything floating in the free room, stacked ---------
       In a split the caption's height changes with its text, so the scrubber
       rides on its top; otherwise the room is the shell's. */
    function place() {
      const split = document.body.classList.contains('lshell-split');
      const room = shell.room(), narrow = shell.narrow();
      const x = split ? window.innerWidth / 2 : room.x;
      let b = split ? window.innerHeight - cap.getBoundingClientRect().top + 12
        : narrow ? room.bottom + 14 : 28;
      toggle.style.left = x + 'px'; toggle.style.bottom = b + 'px';
      if (!split && !narrow) b = 60;   // clear of the shell's hint
      controls.style.left = x + 'px'; controls.style.bottom = b + 'px';
      if (!controls.hidden) b += 56;
      under.style.left = x + 'px'; under.style.bottom = b + 'px';
    }
    new ResizeObserver(place).observe(cap);
    window.addEventListener('resize', place);

    /* ---- boxes ----------------------------------------------------------- */
    const BOXES = opts.boxes || {};
    const live = {};
    function host(spec) {
      const side = spec.side || 'full';
      const d = mk('lshell-box' + (side === 'full' ? '' : ' lshell-half ' + side));
      if (spec.fade) { d.classList.add('lshell-fade'); d.style.opacity = 0; d.style.pointerEvents = 'none'; }
      /* The panel's room, the function every component's mount takes. In a
         split there is no panel, and the shell's function says so on its own. */
      d.viewOffset = stage.viewOffset;
      d.keepOut = stage.keepOut;
      stage.insertBefore(d, divider);
      return d;
    }
    ctx.use = ({ show = [], keep = [] }) => {
      const want = new Set([...show, ...keep]);
      for (const k of Object.keys(live)) {
        if (want.has(k)) continue;
        live[k].api.destroy();
        live[k].host.remove();
        delete live[k];
      }
      for (const k of want) {
        if (live[k]) continue;
        if (!BOXES[k]) throw new Error(`kit/lesson-stage.js: no box '${k}'; declare it in attach(shell, { boxes })`);
        const h = host(BOXES[k]);
        live[k] = { api: BOXES[k].mount(h), host: h };
      }
      const out = {};
      for (const k of Object.keys(live)) {
        const vis = show.includes(k), { api, host: h } = live[k];
        h.style.display = vis ? '' : 'none';
        /* Only a scene on stage runs a loop; a kept one holds its context and
           costs nothing per frame. */
        if (vis) { api.start(); const l = api.box || api; if (l.layout) l.layout(); }
        else api.stop();
        out[k] = api;
      }
      return out;
    };
    ctx.fade = (name, vis) => {
      const b = live[name];
      if (!b) return;
      b.host.style.opacity = vis ? 1 : 0;
      b.host.style.pointerEvents = vis ? '' : 'none';
    };

    /* ---- per step -------------------------------------------------------- */
    document.addEventListener('lessonshell:step', e => {
      const { i, n } = e.detail;
      next.hidden = i >= n - 1;
      back.disabled = i === 0;
      count.textContent = `${i + 1} / ${n}`;
      place();
    });
    const api = { say: cap.querySelector('.lshell-say'), place, setVariant };
    shell.stageUi = api;
    return api;
  }

  global.LessonStage = { attach };
})(typeof globalThis !== 'undefined' ? globalThis : this);
