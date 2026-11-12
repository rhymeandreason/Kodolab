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
 *        title: 'The Mass of a Tree',      // optional: what the narration opens with

 *        section: { label: 'library', href: '/library' },   // optional, beside the mark
 *        hint:  'Drag to orbit · Scroll to zoom',
 *        steps: [{ eyebrow, title, body, nextLabel, camera,
 *                  short,             // a word or two for the dots' hover outline; else eyebrow
 *                  onEnter(ctx), onExit(ctx),
 *                  onLeave(ctx, to) -> seconds to hold before the swap,
 *                  describe,          // what the scene shows, for a screen reader;
 *                                     // a string or a function of ctx
 *                  listen(ctx, read), // the step's narrated chapter, when the page
 *                                     // loads kit/listen.js: beats, `read` being the
 *                                     // panel's own text as beats; else read + describe
 *                  hidden }, ...],      // true or a function: the step drops out
 *                                       // of the walk; shell.refresh() re-reads it
 *        ctx:   {},                       // handed to every step; the shell adds `ui` and `goTo`
 *        onStep: (step, i) => {},         // after the panel is filled, before onEnter
 *      });
 *      Component.mount(shell.stage, ...)  // one component: it goes in shell.stage
 *      shell.goTo(0);
 *      shell.setSteps(list)               // a second track through the same scene; then goTo
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
 *  A SCREEN READER GETS THE SCENE AS TEXT (WCAG 1.1.1). Every canvas in the
 *  stage is labelled an image and described by the step's `describe`;
 *  `shell.describe(text)` rewrites it when the scene changes under the step,
 *  and `shell.announce(text)` speaks a change once, through a polite live
 *  region. Announce events (a phase change, a count), never a value that
 *  repaints every frame: a live region on a readout reads it sixty times a
 *  second. The shell also turns on Stage's `keys`, so a canvas takes focus
 *  and turns on the arrow keys; Left and Right change step everywhere else.
 *  The stage is a region named "3D model", after the panel in reading order;
 *  a page's own controls for the scene go in a region of their own
 *  (water-lab's "Model controls") so the rotor lists both.
 *
 *  `ctx.after(sec, fn)` is a timeout that dies when the step does.
 *  kit/lesson-stage.js adds an A/B split, a switch, a scrubber and boxes a
 *  step builds and destroys, for a lesson past one scene per step.
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

  const svg = d => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">${d}</svg>`;
  const ICON = {
    play: svg('<path d="M5 2.8v10.4a.8.8 0 0 0 1.2.7l8-5.2a.8.8 0 0 0 0-1.4l-8-5.2A.8.8 0 0 0 5 2.8z" fill="currentColor"/>'),
    pause: svg('<rect x="3.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/><rect x="9.5" y="2.5" width="3" height="11" rx="1" fill="currentColor"/>'),
    back: svg('<path d="M8.5 3.5 4 8l4.5 4.5M4.5 8H13" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'),
    stop: svg('<rect x="3.5" y="3.5" width="9" height="9" rx="1.5" fill="currentColor"/>'),
    speaker: svg('<path d="M2.5 6v4h2.6L8.5 13V3L5.1 6z" fill="currentColor"/><path d="M10.6 5.6a3.4 3.4 0 0 1 0 4.8M12.4 3.8a6 6 0 0 1 0 8.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>'),
  };
  const RATES = [1, 1.25, 1.5, 0.85];

  function create(opts = {}) {
    /* `authored` is the page's list; `steps` is what a student walks, the
       authored list less any step whose `hidden` says so. */
    let authored = opts.steps || [];
    const isHidden = s => (typeof s.hidden === 'function' ? !!s.hidden() : !!s.hidden);
    /* Hiding never empties a lesson: a page of nothing but hidden steps is a
       blank panel with Back and Next, so then nothing is hidden, and the step
       says for itself why it has nothing to show. */
    const walkable = list => { const v = list.filter(s => !isHidden(s)); return v.length ? v : list; };
    let steps = walkable(authored);
    const host = opts.host || document.body;
    document.body.classList.add('lshell-page');

    const el = document.createElement('div');
    el.className = 'lshell';
    /* DOM ORDER IS READING ORDER, and a screen reader walks it: the header,
       then the step, then the model it is about. Everything is position:
       fixed, so the order changes nothing on screen; the stage still paints
       under the panel and the bar, which carry z-indexes and it does not.
       The outline repeats the dots for a pointer, so it is hidden from a
       screen reader and out of the tab order. The description is hidden
       too: the canvas reads it through aria-describedby, which reaches a
       hidden element, so it is heard once, on the model. */
    el.innerHTML = `
      <a class="lshell-skip" href="#lshell-main">Skip to the lesson</a>
      <header class="lshell-topbar">
        <div class="lshell-brand"><a class="mark" href="/"><img src="/kodolab-wordmark.svg" alt="kodolab"></a><a class="lshell-section" hidden></a><span class="lshell-crumb"></span></div>
        <div class="lshell-steps">
          <nav class="lshell-progress" aria-label="Lesson progress"></nav>
          <ol class="lshell-outline" aria-hidden="true"></ol>
        </div>
      </header>
      <main class="lshell-panel" id="lshell-main" tabindex="-1">
        <button class="lshell-ibtn lshell-speak" type="button" aria-label="Listen to this lesson" aria-pressed="false" title="Listen" hidden>${ICON.speaker}</button>
        <div class="lshell-scroll">
          <p class="eyebrow"></p>
          <h1 class="title" tabindex="-1"></h1>
          <div class="body"></div>
          <div class="controls"></div>
        </div>
        <div class="lshell-listen" hidden>
          <div class="lshell-listen-bar">
            <button class="lshell-ibtn" type="button" data-act="toggle" aria-label="Pause narration">${ICON.pause}</button>
            <button class="lshell-ibtn" type="button" data-act="back" aria-label="Back one sentence">${ICON.back}</button>
            <button class="lshell-ibtn lshell-rate" type="button" data-act="rate" aria-label="Narration speed">1×</button>
            <button class="btn primary lshell-continue" type="button" data-act="go" hidden>Continue</button>
            <button class="lshell-ibtn" type="button" data-act="stop" aria-label="Stop listening">${ICON.stop}</button>
          </div>
          <p class="lshell-caption" aria-hidden="true"></p>
        </div>
        <nav class="lshell-nav">
          <button class="btn ghost" type="button">Back</button>
          <span class="lshell-count" aria-hidden="true"></span><span class="lshell-sr lshell-count-sr"></span>
          <button class="btn primary" type="button">Next</button>
        </nav>
      </main>
      <div class="lshell-stage" role="region" aria-label="3D model"></div>
      <p id="lshell-desc" hidden></p>
      <p class="lshell-sr" role="status" aria-live="polite"></p>
      <p class="lshell-keytip" aria-hidden="true" hidden>Arrow keys turn the model · Esc to leave it</p>
      <div class="lshell-hint"></div>`;
    host.appendChild(el);
    const $ = sel => el.querySelector(sel);
    const els = {
      stage: $('.lshell-stage'), brand: $('.lshell-brand'), progress: $('.lshell-progress'), outline: $('.lshell-outline'),
      panel: $('.lshell-panel'), scroll: $('.lshell-scroll'),
      eyebrow: $('.eyebrow'), title: $('.title'), body: $('.body'), controls: $('.controls'),
      back: $('.lshell-nav .ghost'), next: $('.lshell-nav .primary'), count: $('.lshell-count'),
      hint: $('.lshell-hint'),
      skip: $('.lshell-skip'), desc: $('#lshell-desc'), live: $('.lshell-sr[role="status"]'), countSr: $('.lshell-count-sr'),
    };
    /* A plain href="#lshell-main" resolves against a featured page's
       <base href="/demos/"> and leaves the lesson. */
    els.skip.addEventListener('click', e => { e.preventDefault(); els.panel.focus(); });
    /* WHILE THE MODEL HOLDS THE ARROWS, SAY SO. They stop changing step there,
       and nothing on screen said how to get them back. Keyboard focus only:
       a click leaves the arrows on the steps (lib/scene.js). The canvas's own
       label carries the same words for a screen reader. */
    const keytip = el.querySelector('.lshell-keytip');
    els.stage.addEventListener('focusin', e => {
      if (e.target.tagName === 'CANVAS' && e.target.matches(':focus-visible')) keytip.hidden = false;
    });
    els.stage.addEventListener('focusout', () => { keytip.hidden = true; });
    /* Stage reads its defaults at create, so every box mounted after this
       takes focus and turns on the arrow keys. */
    if (global.Stage) global.Stage.defaults = Object.assign({}, global.Stage.defaults, { keys: true });
    function labelCanvases() {
      const name = (opts.brand ? opts.brand + ': ' : '') + '3D model';
      for (const c of els.stage.querySelectorAll('canvas')) {
        c.setAttribute('role', 'img');
        c.setAttribute('aria-label', c.tabIndex >= 0 ? name + '. Arrow keys turn it, plus and minus zoom, Escape leaves it.' : name);
        c.setAttribute('aria-describedby', 'lshell-desc');
      }
    }
    let announceT = 0;
    function announce(text) {
      if (listener && listener.state !== 'off') return;     // the narrator is speaking; a second voice talks over it
      clearTimeout(announceT);
      els.live.textContent = '';
      announceT = setTimeout(() => {
        els.live.textContent = text || '';                   // after a beat, so a repeat of the same words still reads
        /* Emptied once spoken, or a screen reader walking the page later
           lands on a stale "Step 2 of 5". */
        announceT = setTimeout(() => { els.live.textContent = ''; }, 5000);
      }, 60);
    }
    function describe(text) { els.desc.textContent = text || ''; }

    /* ---- Listen: the lesson as an audiobook (kit/listen.js) ------------
       Offered only when the page loads the narrator and the browser can
       speak. Each step is a chapter: its title and body as they stand in the
       panel, then the page's own beats from `step.listen(ctx, read)` (or the
       step's `describe`), then a wait that turns the page. The first chapter
       opens with the lesson's title and its parts. While it plays, the shell's
       announcements stay quiet: the narrator is already saying it. */
    let listener = null, introduced = false, reading = null;
    const lis = {
      root: el.querySelector('.lshell-listen'), go: el.querySelector('.lshell-speak'),
      bar: el.querySelector('.lshell-listen-bar'), caption: el.querySelector('.lshell-caption'),
      toggle: el.querySelector('[data-act="toggle"]'), cont: el.querySelector('[data-act="go"]'),
      rate: el.querySelector('[data-act="rate"]'),
    };
    if (global.Listen && global.speechSynthesis) {
      listener = global.Listen.create({
        onLine(text, at) {
          if (reading) reading.classList.remove('is-reading');
          reading = at || null;
          if (reading) reading.classList.add('is-reading');
          lis.caption.textContent = at ? '' : text;
        },
        onState(s) {
          /* The speaker in the panel's corner is the switch; the player under
             the text exists only while it is on. */
          const on = s !== 'off';
          lis.root.hidden = !on;
          lis.go.classList.toggle('is-on', on);
          lis.go.setAttribute('aria-pressed', String(on));
          /* At a wait the same button turns the page: the narrator has just
             said "press Space", and focus is on this button. */
          const paused = s === 'paused', waiting = s === 'waiting';
          lis.toggle.innerHTML = paused || waiting ? ICON.play : ICON.pause;
          lis.toggle.setAttribute('aria-label', waiting ? 'Continue' : paused ? 'Resume narration' : 'Pause narration');
          lis.cont.hidden = s !== 'waiting';
        },
      });
      lis.go.hidden = false;
      global.addEventListener('pagehide', () => listener.stop());
      lis.go.addEventListener('click', () => {
        if (listener.state === 'off') { startListening(); lis.toggle.focus(); }
        else listener.stop();
      });
      lis.bar.addEventListener('click', e => {
        const act = e.target.closest('[data-act]'); if (!act) return;
        const a = act.dataset.act;
        if (a === 'toggle') { if (listener.state === 'waiting') listener.go(); else listener.toggle(); }
        else if (a === 'back') listener.back();
        else if (a === 'go') listener.go();
        else if (a === 'stop') { listener.stop(); lis.go.focus(); }   // the player is gone; the speaker is where it began
        else if (a === 'rate') {
          listener.rate = RATES[(RATES.indexOf(listener.rate) + 1) % RATES.length];
          lis.rate.textContent = listener.rate + '×';
        }
      });
    }
    const joinNames = a => a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ', and ' + a[a.length - 1];
    function chapterFor(i) {
      const step = steps[i];
      const read = [{ say: step.title || '', el: els.title }];
      for (const p of els.body.querySelectorAll('p, li')) if (p.textContent.trim()) read.push({ say: p.textContent, el: p });
      const own = step.listen ? step.listen(ctx, read) : null;
      const desc = typeof step.describe === 'function' ? step.describe(ctx) : step.describe;
      const beats = own || read.concat(desc ? [{ pause: 400 }, { say: desc }] : []);
      if (i < steps.length - 1) beats.push({ pause: 300 }, { wait: 'Press Space for the next step.' }, { run: () => goTo(i + 1) });
      else beats.push({ pause: 300 }, { say: 'That is the end of the lesson.' });
      return beats;
    }
    function introBeats() {
      const title = opts.title || document.title.split(/ [—–|·] /)[0];
      const parts = steps.map(s => s.short || s.eyebrow || s.title);
      return [{ say: title + '.' }, { say: `A Kodolab lesson in ${parts.length} parts: ${joinNames(parts)}.` }, { pause: 700 }];
    }
    function startListening() {
      if (!listener) return;
      const beats = chapterFor(current);
      listener.chapter(introduced ? beats : introBeats().concat(beats));
      introduced = true;
    }
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
    els.hint.hidden = true;                      // opts.hint is accepted and not shown

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
    /* Timers a step sets die with the step, as its subscriptions should. */
    let timers = [];
    ctx.after = (sec, fn) => { timers.push(setTimeout(fn, sec * 1000)); };
    ctx.clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

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
    function drawProgress() {
      els.progress.innerHTML = els.outline.innerHTML = '';
      steps.forEach((s, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        /* The short name, not the title: the title is a sentence, and the
           header reads every dot each time a screen reader passes it. */
        b.setAttribute('aria-label', `Step ${i + 1} of ${steps.length}: ${s.short || s.eyebrow || s.title}`);
        b.addEventListener('click', () => goTo(i));
        els.progress.appendChild(b);
        const li = document.createElement('li');
        li.innerHTML = `<button type="button" tabindex="-1"><span>${i + 1}</span></button>`;
        li.firstChild.append(s.short || s.eyebrow || s.title);
        li.firstChild.addEventListener('click', () => goTo(i));
        els.outline.appendChild(li);
      });
    }
    drawProgress();
    /* A NEW LIST OF STEPS ON THE SAME SHELL, for a page with two tracks through
       one scene (mitosis and meiosis). The current step exits, the dots are
       redrawn, and nothing is shown until the page calls goTo: the page knows
       which step the new list starts on. */
    function setSteps(list) {
      if (current >= 0 && steps[current].onExit) steps[current].onExit(ctx);
      ctx.clearTimers();
      authored = list;
      steps = walkable(list);
      current = -1;
      drawProgress();
    }
    /* A STEP CAN DROP OUT OR COME BACK while the page runs: a quiz nobody has
       checked is no step at all for a student, and the builder turning review
       on brings it back. `refresh()` re-reads every `hidden` and keeps the
       student on the step they are on; if that one went, they land on the
       nearest step before it. */
    function refresh() {
      const at = steps[current];
      const next = walkable(authored);
      if (next.length === steps.length && next.every((s, k) => s === steps[k])) return;
      steps = next;
      drawProgress();
      if (current < 0) return;
      let i = steps.indexOf(at);
      if (i >= 0) {
        current = i; paintNav(i);
        document.dispatchEvent(new CustomEvent('lessonshell:step', { detail: { i, n: steps.length } }));
        return;
      }
      i = Math.max(0, authored.slice(0, authored.indexOf(at)).filter(s => steps.includes(s)).length - 1);
      if (at && at.onExit) at.onExit(ctx);
      current = -1;
      if (steps.length) swap(i);
      else document.dispatchEvent(new CustomEvent('lessonshell:step', { detail: { i: -1, n: 0 } }));
    }

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

    function paintNav(i) {
      const step = steps[i], last = i === steps.length - 1;
      ui.setNext(last ? 'Start over' : (step.nextLabel || 'Next'), !last || steps.length > 1);
      els.back.disabled = i === 0;
      els.count.textContent = `${i + 1} / ${steps.length}`;
      els.countSr.textContent = `Step ${i + 1} of ${steps.length}`;
      [...els.progress.children, ...els.outline.children].forEach((b, k) => {
        k %= steps.length;
        b.classList.toggle('is-current', k === i);
        b.classList.toggle('is-done', k < i);
      });
      [...els.progress.children].forEach((b, k) => {
        if (k === i) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      });
    }

    let swapped = false;
    function swap(i) {
      if (current >= 0 && steps[current].onExit) steps[current].onExit(ctx);
      ctx.clearTimers();
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
      paintNav(i);
      /* Before onStep and onEnter: a step flies the camera of the component
         it is about to show, and sets params on one that has to be running. */
      if (scenes.size) apply(step.scene ? [].concat(step.scene) : (shown || []));
      if (opts.onStep) opts.onStep(step, i, ctx);
      if (step.onEnter) step.onEnter(ctx);
      labelCanvases();
      describe(typeof step.describe === 'function' ? step.describe(ctx) : step.describe);
      /* Not on the step a page opens on: there focus goes to the title, so a
         screen reader starts on the lesson instead of the wordmark, the menu
         and five dots. Not inside someone else's frame (LabXchange embeds by
         iframe), where focusing on load would pull it from the host page. */
      if (listener && listener.state !== 'off') listener.chapter(chapterFor(i));   // the narration follows the step
      if (swapped) announce(`Step ${i + 1} of ${steps.length}. ${step.title || ''}`);
      else if (window.top === window && !document.activeElement.closest('input, textarea, select, [contenteditable]')) {
        els.title.focus({ preventScroll: true });
      }
      swapped = true;
      document.dispatchEvent(new CustomEvent('lessonshell:step', { detail: { i, n: steps.length } }));
      /* Guarded: lib/track.js loads only for a browser holding a class code. */
      if (window.Track) Track.step(i, steps.length, step.title);
    }
    els.next.addEventListener('click', () => goTo(current === steps.length - 1 ? 0 : current + 1));
    els.back.addEventListener('click', () => goTo(current - 1));
    const onKey = e => {
      /* A VERTICAL slider moves on Up and Down, so Left and Right stay Back
         and Next on it. Safari's Tab skips buttons by default and lands on
         one, and the arrows went on changing the temperature. */
      const t = e.target;
      /* While narrating: Space pauses, resumes, or turns the page at a wait;
         Escape stops. Not on a control, where Space presses it. */
      if (listener && listener.state !== 'off' && !t.closest('button, a, input:not([type="range"]), textarea, select, canvas, [contenteditable]')) {
        if (e.key === ' ') {
          e.preventDefault();
          if (listener.state === 'waiting') listener.go(); else listener.toggle();
          return;
        }
        if (e.key === 'Escape') { listener.stop(); return; }
      }
      const vertical = t.matches('input[type="range"]') && getComputedStyle(t).writingMode.startsWith('vertical');
      if (t.matches('input, textarea, select') && !(vertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'))) return;
      if (vertical) e.preventDefault();
      if (e.key === 'ArrowRight') { if (!els.next.classList.contains('is-hidden')) goTo(current + 1); }   // goTo ignores past-the-end, so the arrow never restarts
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
      el, stage: els.stage, panel: els.panel, ui, ctx,
      get steps() { return steps; }, setSteps, refresh,
      /* The panel query, on the shell as well as on `ctx.ui`. A page's own
         `on('frame')` is wired at module scope, where there is no ctx and the
         shell is the only handle in reach, and reaching for `shell.q` there is
         what a generated page did: it threw inside the render loop every frame
         and the scene never drew, a blank stage with the source checks passing.
         One name for one thing beats a rule in the reference about which
         object it hangs off. */
      q: sel => ui.q(sel), qa: sel => ui.qa(sel),
      goTo, get current() { return current; },
      describe, announce,
      /* The narrator, or null: a page speaks live events with
         `shell.listen && shell.listen.comment(text)`. */
      get listen() { return listener; },
      get listening() { return !!listener && listener.state !== 'off'; },
      /* `scene(name, mount)` registers and returns the component;
         `showScene(name | [names])` puts one on stage outside the step order,
         for a control that switches scale where a step would be too much. */
      scene, showScene: n => apply([].concat(n)),
      scenes: () => [...scenes.keys()],
      panelRect: () => els.panel.getBoundingClientRect(),
      narrow: () => window.innerWidth <= 760,
      /* The free room's centre x and the bottom a control floating in it
         clears: beside the panel on a laptop, above it when it docks. */
      room() {
        const r = els.panel.getBoundingClientRect();
        return window.innerWidth <= 760 ? { x: window.innerWidth / 2, bottom: r.height }
          : { x: (r.right + window.innerWidth) / 2, bottom: 0 };
      },
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
        if (listener) listener.stop();
        window.removeEventListener('keydown', onKey); el.remove(); document.body.classList.remove('lshell-page');
        if (global.LessonShell.current === shellApi) global.LessonShell.current = null;
      },
    };
    global.LessonShell.current = shellApi;
    return shellApi;
  }

  global.LessonShell = { create, current: null };
})(typeof globalThis !== 'undefined' ? globalThis : this);
