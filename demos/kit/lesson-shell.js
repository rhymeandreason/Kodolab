/* =============================================================================
 *  kit/lesson-shell.js — the step-through shell a generated app runs in
 * =============================================================================
 *  A full-window scene with a glass panel over it: eyebrow, title, body,
 *  a controls slot the step fills, Back and Next, progress dots in the top
 *  bar, arrow keys. The tree prototype's UI, made the one shell every
 *  user-generated app takes so they all read as one product.
 *
 *      const shell = LessonShell.create({
 *        brand: 'The Mass of a Tree',
 *        section: { label: 'library', href: '/library' },   // optional, beside the mark
 *        hint:  'Drag to orbit · Scroll to zoom',
 *        steps: [{ eyebrow, title, body, nextLabel, camera,
 *                  onEnter(ctx), onExit(ctx),
 *                  onLeave(ctx, to) -> seconds to hold before the swap }, ...],
 *        ctx:   {},                       // handed to every step; the shell adds `ui` and `goTo`
 *        onStep: (step, i) => {},         // after the panel is filled, before onEnter
 *      });
 *      Component.mount(shell.stage, ...)  // one component: it goes in shell.stage
 *      shell.goTo(0);
 *
 *  MORE THAN ONE COMPONENT IS MORE THAN ONE BOX, and the shell hands them out:
 *
 *      const cell = shell.scene('cell', el => PlantCell.mount(el, { viewOffset: shell.viewOffset }));
 *      const m    = shell.scene('membrane', el => Membrane.mount(el, { viewOffset: shell.viewOffset }));
 *      steps: [{ ..., scene: 'cell' }, { ..., scene: 'membrane' }]
 *
 *  Each `scene()` makes its own full-bleed layer inside the stage, mounts into
 *  it, and returns a handle that behaves as the component does — `set`,
 *  `state`, `on`, `note` and the rest — for as long as the page holds it. Only
 *  a few scenes stay live (`sceneLimit`, 4): a WebGL context is rationed and
 *  the pool destroys the least recently shown, so the handle is what the page
 *  keeps and the instance under it is the shell's to rebuild. The stage is ONE element, so two mounts on
 *  `shell.stage` put two canvases in one block flow: the first fills the
 *  window, the second sits below it off screen still rendering, and the first
 *  one's overlays (side labels, the annotation layer) draw over whichever
 *  canvas is on top. It renders, so nobody sees it as a fault. A second canvas
 *  landing directly in the stage therefore throws, naming this call.
 *
 *  A step names the scene it shows in `scene`; the shell shows it, hides the
 *  rest and stops them, before onStep and onEnter run. A step that names none
 *  keeps whatever the last one resolved, and the first swap falls back to the
 *  first scene registered, so a page can name the scene only on the steps that
 *  change it. `scene` may be an array: several visible at once split the stage
 *  into equal columns, which is there for a template with a layout, not for
 *  the step-through, whose panel covers a column's worth of the window.
 *
 *  It owns the DOM and the step index and nothing about the scene: the
 *  camera flight a step names in `camera` is the page's to fly, in onStep,
 *  because the shell does not know which component is behind the glass.
 *  `shell.viewOffset` is the function every component's mount takes to
 *  centre its scene in the room the panel leaves. The stage also carries
 *  `keepOut`, the panel's rect, which lib/annotate.js reads on its own so a
 *  callout behind the glass typesets to the free side.
 *
 *  ctx.ui, for steps — each is on ctx directly as well, so ctx.q === ctx.ui.q:
 *      controls(html)  fill the slot · q(sel) / qa(sel) inside it · show(el) /
 *      hide(el) · setNext(label, visible) · range(input, onChange) paints the
 *      track, fires once with the current value, and RETURNS sync(v) for
 *      writing that slider from code · showPanel(component,
 *      {only:['notes','layers','legend']}) appends the component's own chips
 *
 *  Controls a step's `controls(html)` can use, all styled by the sheet:
 *  `.btn` (.primary / .secondary / .ghost) · `.switch` · `.slider` · `.chips`
 *  with `.chip.is-on` for independent toggles · `.segmented` with `.is-on` for
 *  ONE choice among several · `.choices` · `.stats`.
 *
 *  Chrome is css/lesson-shell.css; `body.lshell-page` is set here. A step's
 *  `body` may be a function of ctx, for copy that depends on what the
 *  student did earlier.
 *
 *  THE PAGE IS ASKABLE FROM OUTSIDE, which the builder's outline needs and no
 *  lesson does: `LessonShell.current` is the live shell, and every swap fires
 *  `lessonshell:step` on the document with `{ i, n }`. A generated app is read
 *  through a sandboxed frame whose only handle on it is postMessage, so the
 *  alternative to a registration here is the builder parsing the `steps: [...]`
 *  array literal out of the source and being wrong about it. A page must not
 *  read `current` to find itself: `ctx` and the shell it holds are what a step
 *  is handed, and two shells on one document leave only the second registered.
 * ========================================================================== */
(function (global) {
  'use strict';

  function create(opts = {}) {
    const steps = opts.steps || [];
    const host = opts.host || document.body;
    document.body.classList.add('lshell-page');

    const el = document.createElement('div');
    el.className = 'lshell';
    el.innerHTML = `
      <div class="lshell-stage"></div>
      <header class="lshell-topbar">
        <div class="lshell-brand"><a class="mark" href="/"><img src="/kodolab-wordmark.svg" alt="kodolab"></a><a class="lshell-section" hidden></a><span class="lshell-crumb"></span></div>
        <nav class="lshell-progress" aria-label="Lesson progress"></nav>
      </header>
      <aside class="lshell-panel">
        <div class="lshell-scroll">
          <p class="eyebrow"></p>
          <h1 class="title"></h1>
          <div class="body"></div>
          <div class="controls"></div>
        </div>
        <nav class="lshell-nav">
          <button class="btn ghost" type="button">Back</button>
          <span class="lshell-count"></span>
          <button class="btn primary" type="button">Next</button>
        </nav>
      </aside>
      <div class="lshell-hint"></div>`;
    host.appendChild(el);
    const $ = sel => el.querySelector(sel);
    const els = {
      stage: $('.lshell-stage'), brand: $('.lshell-brand'), progress: $('.lshell-progress'),
      panel: $('.lshell-panel'), scroll: $('.lshell-scroll'),
      eyebrow: $('.eyebrow'), title: $('.title'), body: $('.body'), controls: $('.controls'),
      back: $('.lshell-nav .ghost'), next: $('.lshell-nav .primary'), count: $('.lshell-count'),
      hint: $('.lshell-hint'),
    };
    /* WHICH OF THE PANEL'S NUMBERS THE PAGE REPAINTS, said once, here, beside
       the classes the sheet styles. A readout's first value is written into
       the page's source like any other words, so nothing downstream can tell
       it from copy by looking: the builder's text mode offered `90 µm³` as
       something to edit, the sim overwrote it a frame later and a wrong
       number stayed in the file. The mark is what it reads instead. A page
       with a readout of its own shape writes `data-live` on it. */
    const LIVE = '.stat-value, .value, .legend-pct, .pile-pct';
    const markLive = root => {
      for (const e of root.querySelectorAll(LIVE)) e.setAttribute('data-live', '');
    };
    els.count.setAttribute('data-live', '');

    /* The wordmark is the shell's, the words beside it the page's. In someone
       else's frame (the builder's viewer) the mark goes home in that frame, so
       it stops being a link there. */
    els.brand.querySelector('.lshell-crumb').textContent = opts.brand || '';
    /* `section: { label, href }` is the shelf a page sits on, a link between
       the mark and its name: a bench's is the library. */
    const section = els.brand.querySelector('.lshell-section');
    if (opts.section) {
      section.textContent = opts.section.label;
      section.href = opts.section.href;
      section.hidden = false;
    }
    if (window.top !== window) for (const a of els.brand.querySelectorAll('a')) a.removeAttribute('href');
    /* `chrome: 'none'` takes the Back/Next row and the progress dots away, for
       a shell with nowhere to go: a sandbox, a bench. Everything else is
       unchanged, so a one-step lesson and a sandbox differ by this word. */
    if (opts.chrome === 'none') el.classList.add('lshell-bare');
    /* On the stage element too, so CardStage finds it without being told —
       and the panel's rect with it, so lib/annotate.js keeps its labels out
       from under the glass without any component knowing there is a panel. */
    const wireStage = e => {
      e.viewOffset = () => shellApi.viewOffset();
      e.keepOut = () => els.panel.getBoundingClientRect();
    };
    wireStage(els.stage);
    els.hint.textContent = opts.hint || '';
    els.hint.hidden = !opts.hint;

    const ui = {
      controls(html) { els.controls.innerHTML = html; markLive(els.controls); },
      /* THE WHOLE PANEL, controls first. A step writes markup in two places —
         `controls(html)` and its own `body` — and a box put in the body was
         invisible to this, so a mount guarded by `if (el)` skipped in silence
         and the page came up with the panel it asked for and nothing in it.
         Controls keep priority, so a step that puts the same id in both still
         finds the control it built. */
      q(sel) { return els.controls.querySelector(sel) || els.body.querySelector(sel); },
      qa(sel) { return [...els.controls.querySelectorAll(sel),
                        ...els.body.querySelectorAll(sel)]; },
      show(e) { if (!e) return; e.classList.remove('is-hidden'); e.classList.add('rise'); },
      hide(e) { if (e) e.classList.add('is-hidden'); },
      setNext(label, visible = true) { els.next.textContent = label; els.next.classList.toggle('is-hidden', !visible); },
      /* The component's own "point at / show / legend" chips, appended to
         the controls slot. kit/card-stage.js draws it; this only places it. */
      showPanel(c, opts) {
        const p = global.CardStage.showPanel(els.controls, c, opts);
        markLive(els.controls);
        return p;
      },
      /* Returns `sync(v)`: write a value into the slider FROM CODE and repaint
         its fill. The fill is a custom property this paints on 'input', and
         setting `.value` fires no event — so a slider driven by a tween or a
         step otherwise slides its thumb and leaves the green where it was.
         onChange is deliberately NOT called: the value came from the thing
         onChange would have told. */
      range(input, onChange) {
        const paint = () => input.style.setProperty('--p', `${((input.value - input.min) / (input.max - input.min)) * 100}%`);
        input.addEventListener('input', () => { paint(); onChange(+input.value); });
        paint();
        onChange(+input.value);
        return v => { if (v !== undefined) input.value = v; paint(); };
      },
    };
    /* ui's methods sit on ctx as well as on ctx.ui. A step reaching for
       `ctx.q('#btn')` is the commonest thing written against this shell, and
       the alternative to answering it is a page that renders and then throws
       on the first click. The page's own ctx keys win: this only fills gaps. */
    const ctx = opts.ctx || {};
    for (const k of Object.keys(ui)) if (!(k in ctx)) ctx[k] = ui[k].bind(ui);
    Object.assign(ctx, { ui, goTo: i => goTo(i) });

    /* ---- scenes: one box per component, shown per step --------------- */
    /* A SCENE IS A WEBGL CONTEXT, AND THEY ARE RATIONED. A browser keeps 8 to
       16 and silently drops the oldest past that: the symptom is a canvas
       going blank with no error, on the scene the student saw first. A page
       asking for six scenes is not obviously past a cap nobody states, so the
       shell holds a few live and destroys the rest — kit/card-stage.js's pool,
       keyed by scene name, least recently SHOWN evicted.

       Which is why `scene()` returns a handle and not the component. A pooled
       component is destroyed and rebuilt under the page, and a page holding
       the instance would be calling set() on a corpse — card-stage.js's header
       says it found exactly that. The handle forwards to whatever instance is
       live, mounts one if there is none, and carries across the two things a
       rebuild would otherwise lose: every `on()` the page subscribed, and the
       params it had `set()`. Nothing is built until something asks for it, so
       registering ten scenes costs nothing until the steps that show them.
       So a step written against `cell` keeps working
       whether or not that scene has been rebuilt since, and no page says
       anything about pooling. */
    const scenes = new Map();          // name -> { el, make, c, params, subs, handle }
    let shown = null;                  // the names currently on stage
    let boxes = null;                  // the pool, made on the first scene

    function build(s) {
      const c = s.make(s.el);
      s.c = c;
      if (Object.keys(s.params).length && c.set) c.set(s.params);
      if (c.on) for (const sub of s.subs) sub.off = c.on(sub.ev, sub.fn);
      return c;
    }

    /* The live instance, mounted if the pool dropped it. Mounting into a
       hidden layer is safe because the layer keeps its size — the reason the
       CSS hides with `visibility` and not `display`. */
    function ensure(name) {
      const s = scenes.get(name);
      if (!boxes) return s.c || build(s);
      return boxes.acquire(name, () => build(s));
    }

    /* Everything the page holds goes through here, so the instance underneath
       may be replaced at any time. `set` and `on` are remembered as well as
       forwarded; a component returning itself for chaining is handed back as
       the handle, or the page would be holding the instance again. */
    function handle(name) {
      const s = scenes.get(name);
      return new Proxy({}, {
        get(_, k) {
          if (k === 'sceneName') return name;
          const c = ensure(name);
          const v = c[k];
          if (typeof v !== 'function') return v;
          if (k === 'set') return (p, o) => { Object.assign(s.params, p); return wrap(v.call(c, p, o), c, s); };
          if (k === 'on') return (ev, fn) => {
            const sub = { ev, fn, off: null };
            sub.off = v.call(c, ev, fn);
            s.subs.push(sub);
            return () => { const i = s.subs.indexOf(sub); if (i >= 0) s.subs.splice(i, 1); return sub.off && sub.off(); };
          };
          if (k === 'destroy') return () => {
            if (boxes) boxes.release(name); else if (s.c) s.c.destroy();
            scenes.delete(name); s.el.remove();
          };
          return (...a) => wrap(v.apply(c, a), c, s);
        },
        set(_, k, v) { ensure(name)[k] = v; return true; },
        has(_, k) { return k in ensure(name); },
      });
    }
    const wrap = (out, c, s) => (out === c ? s.handle : out);

    function scene(name, mount) {
      if (scenes.has(name)) return scenes.get(name).handle;
      if (typeof mount !== 'function') {
        throw new Error(`kit/lesson-shell.js: shell.scene('${name}', el => X.mount(el, { viewOffset: shell.viewOffset })) `
          + `takes the mount as a function, so the shell owns the box and can show, stop and rebuild it.`);
      }
      const el = document.createElement('div');
      el.className = 'lshell-scene';
      wireStage(el);
      els.stage.appendChild(el);
      const s = { el, make: mount, c: null, params: {}, subs: [], handle: null };
      scenes.set(name, s);
      s.handle = handle(name);
      /* The pool is made on the first scene, not at create: a hand-built page
         on this shell may not have loaded card-stage.js at all, and one that
         never asks for a scene should not need it. Without it nothing is ever
         evicted, which is the old behaviour and correct for one or two. */
      if (!boxes && global.CardStage && global.CardStage.pool) {
        boxes = global.CardStage.pool({
          limit: opts.sceneLimit || 4,
          onEvict: key => { const e = scenes.get(key); if (e) { e.c = null; for (const sub of e.subs) sub.off = null; } },
        });
      }
      /* NOT MOUNTED HERE. A page registers every scene it has in a row, and
         building them all would open a context per scene only to evict most
         of them before the first step draws. Whatever asks for the scene
         first mounts it — a step showing it, or the page touching its handle
         — and a layer is full size whether or not it is hidden, so a scene
         built late still lays out against a real canvas. */
      if (shown) apply(shown);
      return s.handle;
    }

    /* Hidden with `visibility`, not `display`: a component keeps its size, its
       last frame and its camera, so coming back to a step is instant and there
       is no zero-size resize on the way out. What stops it costing anything is
       the stop() below, not the CSS. */
    function apply(names) {
      shown = names.filter(n => scenes.has(n));
      if (!shown.length && scenes.size) shown = [scenes.keys().next().value];
      els.stage.classList.toggle('is-split', shown.length > 1);
      for (const [name, s] of scenes) {
        s.el.classList.toggle('is-off', shown.indexOf(name) < 0);
      }
      /* Shown first, and through the pool, so showing a scene is what makes it
         the most recently used one and the eviction order is the order the
         student actually visited. A scene that is off is left alone unless it
         is live: touching it here would rebuild what was just dropped. */
      for (const name of shown) { const c = ensure(name); if (c.start) c.start(); }
      for (const [name, s] of scenes) if (shown.indexOf(name) < 0 && s.c && s.c.stop) s.c.stop();
    }

    /* THE FAILURE THIS EXISTS FOR, made loud. Nothing legitimately puts two
       canvases straight into the stage, and a page that does renders and is
       wrong. Thrown from the observer so it is an uncaught error the builder's
       relay carries back into the next edit, without stopping the page. */
    new MutationObserver(() => {
      const direct = [...els.stage.children].filter(n => n.tagName === 'CANVAS');
      if (direct.length > 1 || (direct.length && scenes.size)) {
        throw new Error('kit/lesson-shell.js: more than one component was mounted into shell.stage, so the '
          + 'canvases stack and all but the first are off screen. Give each its own box: '
          + "const c = shell.scene('cell', el => PlantCell.mount(el, { viewOffset: shell.viewOffset })), "
          + "and name the one a step shows with `scene: 'cell'`.");
      }
    }).observe(els.stage, { childList: true });

    let current = -1;
    steps.forEach((s, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('aria-label', `Step ${i + 1}: ${s.title}`);
      b.addEventListener('click', () => goTo(i));
      els.progress.appendChild(b);
    });

    /* A STEP MAY HOLD THE DOOR. `onLeave(ctx, to)` returns seconds, and the
       shell waits that long before swapping — for a step whose last gesture
       has to finish on screen before the next one starts from it, which is
       otherwise impossible: onExit runs and the scene is gone in the same
       frame. Everything is locked out while it runs, including the keys and
       the progress dots, so a second press cannot land mid-transition. Returns
       nothing and the shell behaves exactly as it always did. */
    let holding = false;
    function goTo(i) {
      if (holding) return;
      if (i < 0 || i >= steps.length || i === current) return;
      const hold = current >= 0 && steps[current].onLeave ? steps[current].onLeave(ctx, i) : 0;
      if (hold > 0) {
        holding = true;
        els.next.disabled = els.back.disabled = true;
        setTimeout(() => {
          holding = false;
          els.next.disabled = false;
          swap(i);
        }, hold * 1000);
        return;
      }
      swap(i);
    }

    function swap(i) {
      if (current >= 0 && steps[current].onExit) steps[current].onExit(ctx);
      current = i;
      const step = steps[i];
      els.scroll.classList.remove('swap');
      void els.scroll.offsetWidth;               // restart the entrance animation
      els.scroll.classList.add('swap');
      els.scroll.scrollTop = 0;
      els.eyebrow.textContent = step.eyebrow || '';
      els.title.textContent = step.title || '';
      els.body.innerHTML = typeof step.body === 'function' ? step.body(ctx) : (step.body || '');
      els.controls.innerHTML = '';
      ui.setNext(step.nextLabel || 'Next', i < steps.length - 1);
      els.back.disabled = i === 0;
      els.count.textContent = `${i + 1} / ${steps.length}`;
      [...els.progress.children].forEach((b, k) => {
        b.classList.toggle('is-current', k === i);
        b.classList.toggle('is-done', k < i);
      });
      /* Before onStep and onEnter: a step flies the camera of the component
         it is about to show, and sets params on one that has to be running. */
      if (scenes.size) apply(step.scene ? [].concat(step.scene) : (shown || []));
      if (opts.onStep) opts.onStep(step, i, ctx);
      if (step.onEnter) step.onEnter(ctx);
      document.dispatchEvent(new CustomEvent('lessonshell:step', { detail: { i, n: steps.length } }));
      /* Guarded: lib/track.js loads only for a browser holding a class code. */
      if (window.Track) Track.step(i, steps.length, step.title);
    }
    els.next.addEventListener('click', () => goTo(current + 1));
    els.back.addEventListener('click', () => goTo(current - 1));
    const onKey = e => {
      if (e.target.matches('input, textarea, select')) return;
      if (e.key === 'ArrowRight') { if (!els.next.classList.contains('is-hidden')) goTo(current + 1); }
      if (e.key === 'ArrowLeft') goTo(current - 1);
    };
    window.addEventListener('keydown', onKey);
    els.stage.addEventListener('pointerdown', () => els.hint.classList.add('is-faded'));

    /* A stat is written straight into the DOM by whatever drives the step, so
       a raw division lands as 0.4444444444444444 and blows its grid cell open.
       Clamp what the panel shows to 3 decimals; the value the code holds is
       untouched. Rewriting the text re-enters this, but the second pass finds
       nothing to change and stops. */
    const clampDigits = t => t.replace(/\d+\.\d{4,}/g, m => String(Math.round(+m * 1000) / 1000));
    const trimStats = () => {
      for (const n of els.panel.querySelectorAll('.stat-value, .value, .stat-sub')) {
        const t = clampDigits(n.textContent);
        if (t !== n.textContent) n.textContent = t;
      }
    };
    new MutationObserver(trimStats).observe(els.panel, { subtree: true, childList: true, characterData: true });

    const shellApi = {
      el, stage: els.stage, panel: els.panel, ui, ctx, steps,
      /* The panel query, on the shell as well as on `ctx.ui`. A page's own
         `on('frame')` is wired at module scope, where there is no ctx and the
         shell is the only handle in reach, and reaching for `shell.q` there is
         what a generated page did: it threw inside the render loop every frame
         and the scene never drew, a blank stage with the source checks passing.
         One name for one thing beats a rule in the reference about which
         object it hangs off. */
      q: sel => ui.q(sel), qa: sel => ui.qa(sel),
      goTo, get current() { return current; },
      /* `scene(name, mount)` registers and returns the component;
         `showScene(name | [names])` puts one on stage outside the step order,
         for a control that switches scale where a step would be too much. */
      scene, showScene: n => apply([].concat(n)),
      scenes: () => [...scenes.keys()],
      panelRect: () => els.panel.getBoundingClientRect(),
      narrow: () => window.innerWidth <= 760,
      /* Hand this to any component's mount as `viewOffset`: half the panel's
         width on a laptop, half its height when it docks to the bottom. */
      viewOffset() {
        const r = els.panel.getBoundingClientRect();
        return window.innerWidth <= 760 ? { x: 0, y: Math.round(r.height / 2) } : { x: -Math.round(r.right / 2), y: 0 };
      },
      theme(name, on) { document.body.classList.toggle(name, !!on); },
      destroy() {
        if (boxes) boxes.clear();
        else for (const s of scenes.values()) if (s.c && s.c.destroy) s.c.destroy();
        scenes.clear();
        window.removeEventListener('keydown', onKey); el.remove(); document.body.classList.remove('lshell-page');
        if (global.LessonShell.current === shellApi) global.LessonShell.current = null;
      },
    };
    global.LessonShell.current = shellApi;
    return shellApi;
  }

  global.LessonShell = { create, current: null };
})(typeof globalThis !== 'undefined' ? globalThis : this);
