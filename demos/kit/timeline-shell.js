/* =============================================================================
 *  kit/timeline-shell.js — a lesson that is one continuous animation
 * =============================================================================
 *  A step-through paces an argument the student clicks through; this plays a
 *  process the student watches, and the steps are stretches of one clock.
 *  Mitosis is the case: nobody should have to press Next to get from
 *  metaphase to anaphase, but everybody should be able to stop on it.
 *
 *      const shell = TimelineShell.create({
 *        brand: 'Cell Division',
 *        tracks: [{ id: 'mitosis', label: 'Mitosis', steps: [{ title, body, short, dur }, ...] },
 *                 { id: 'meiosis', label: 'Meiosis', steps: [...] }],   // two or more draws a switch
 *        onTime(t, ctx) {},              // every frame the clock moves, and on every seek
 *        onTrack(track, ctx) {},         // after a switch, before its first step enters
 *        onStep(step, i, ctx) {},        // as LessonShell's
 *        onLayout() {},                  // the chrome moved: reframe the scene into freeRect()
 *      });
 *      const scene = X.mount(shell.stage, { room: shell.freeRect });
 *      shell.goTo(0);
 *
 *  IT IS kit/lesson-shell.js, with a dock. The panel, ctx, ui, the wordmark,
 *  the dots and Back/Next are the base's, so `ctx.q` means what it means in a
 *  step-through and a step is the same object with a `dur` on it. What
 *  differs is the layout: the panel sits on the RIGHT and shorter, so the dock
 *  and the switch centre on the page, and the dock replaces the dots. Adds:
 *    - a clock: `t` in seconds, played at the dock's speed, stopping at the end
 *    - the dock, centred at the foot: play/pause, one bar per step sized by
 *      its `dur` and scrubbable, and the speed
 *    - the switch, centred at the top, when there is more than one track
 *  The clock drives the steps: crossing a step's start calls the base's
 *  goTo. And the steps drive the clock: Back, Next, a dot or an arrow key
 *  pauses and seeks `t` to that step's end, its result. Space plays and pauses. Back/Next show
 *  only while paused, and the panel is as tall as its words.
 *
 *  `freeRect()` is the room in viewport px ({ l, r, t, b }) between the
 *  panel, the top bar and the dock. A scene frames into it, not into the
 *  window: the base's `viewOffset` assumes a panel on the left.
 *
 *  `shell.time` is { t, playing, track, seek(t), play(on), setTrack(id) }.
 * ========================================================================== */
(function (global) {
  'use strict';

  const SPEEDS = [0.5, 1, 1.5, 2];
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ICON_PLAY = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a.8.8 0 0 0 1.22.68l10.4-6.5a.8.8 0 0 0 0-1.36L9.22 4.82A.8.8 0 0 0 8 5.5z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2"/><rect x="13.5" y="5" width="4" height="14" rx="1.2"/></svg>';

  function lay(steps) {
    let t = 0;
    for (const s of steps) { s.start = t; t += s.dur || 1; s.end = t; }
    return t;
  }

  function create(opts = {}) {
    const tracks = opts.tracks || [{ id: 'main', label: '', steps: opts.steps || [] }];
    let track = tracks[0];
    let total = lay(track.steps);
    let t = 0, playing = opts.autoplay !== false, speed = 1;
    let scrubbing = false, fromClock = false, raf = 0, prev = 0;
    let fresh = true, started = false;   // no step entered on this track yet; the page has begun
    let from = -1;                       // the step entered last, so 0 after the last one is "Start over"

    const shell = global.LessonShell.create({
      brand: opts.brand, section: opts.section, host: opts.host, ctx: opts.ctx,
      steps: track.steps,
      onStep(step, i, ctx) {
        /* A step chosen by hand (Back, Next, a dot, an arrow) lands on its
           RESULT, the last frame before the next one starts, and holds there:
           clicking through is how a student studies, and the end of anaphase
           is the picture of anaphase. The first step of a fresh track and
           "Start over" are the exceptions: they start at 0 and play. */
        if (!fromClock) {
          const restart = fresh || (i === 0 && from === track.steps.length - 1);
          t = restart ? step.start : step.end - 1e-3;
          tell();
          play(restart && (opts.autoplay !== false || !fresh || started));
          if (fresh) started = true;
          fresh = false;
        }
        from = i;
        paintSteps(i);
        if (opts.onStep) opts.onStep(step, i, ctx);
        if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame); }
      },
    });
    const ctx = shell.ctx;
    shell.el.classList.add('lshell-timed');

    // ---- the dock
    const dock = document.createElement('div');
    dock.className = 'lshell-dock';
    dock.innerHTML = `
      <button class="lshell-play" type="button"></button>
      <div class="lshell-timeline" role="slider" aria-label="Timeline" tabindex="-1"></div>
      <button class="lshell-speed" type="button" aria-label="Playback speed"></button>`;
    shell.el.appendChild(dock);
    const playBtn = dock.querySelector('.lshell-play');
    const bar = dock.querySelector('.lshell-timeline');
    const speedBtn = dock.querySelector('.lshell-speed');
    let segs = [], fills = [];

    function drawTimeline() {
      bar.innerHTML = '';
      track.steps.forEach((s) => {
        const e = document.createElement('div');
        e.className = 'lshell-seg';
        e.style.flex = `${s.dur || 1} 1 0`;
        e.innerHTML = '<div class="lshell-bar"><i></i></div><div class="lshell-lbl"></div>';
        e.lastChild.textContent = s.short || s.title;
        bar.appendChild(e);
      });
      segs = [...bar.children];
      fills = segs.map((s) => s.querySelector('i'));
    }
    function paintSteps(i) {
      segs.forEach((s, k) => { s.classList.toggle('is-current', k === i); s.classList.toggle('is-done', k < i); });
    }
    function paintFills() {
      track.steps.forEach((s, k) => { fills[k].style.transform = `scaleX(${clamp((t - s.start) / (s.end - s.start), 0, 1)})`; });
      bar.setAttribute('aria-valuenow', t.toFixed(1));
      bar.setAttribute('aria-valuemax', total.toFixed(1));
    }
    function paintPlay() {
      playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
      playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      shell.el.classList.toggle('is-playing', playing);
      speedBtn.textContent = speed + '×';
    }

    // ---- the clock
    const stepAt = (x) => { const st = track.steps; for (let i = st.length - 1; i >= 0; i--) if (x >= st[i].start) return i; return 0; };
    function tell() { if (opts.onTime) opts.onTime(t, ctx); paintFills(); }
    function sync() {
      tell();
      const i = stepAt(Math.min(t, total - 1e-6));
      if (i !== shell.current) { fromClock = true; shell.goTo(i); fromClock = false; }
    }
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min((now - prev) / 1000, 0.05);
      prev = now;
      if (!playing || scrubbing) return;
      t = Math.min(total, t + dt * speed);
      if (t >= total) { playing = false; paintPlay(); }
      sync();
    }
    function seek(x) { t = clamp(x, 0, total); sync(); }
    function play(on) {
      if (on && t >= total) { t = 0; sync(); }
      playing = !!on;
      paintPlay();
    }

    playBtn.addEventListener('click', () => { playBtn.blur(); play(!playing); });
    speedBtn.addEventListener('click', () => {
      speedBtn.blur();
      speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
      paintPlay();
    });
    const seekX = (x) => {
      for (let i = 0; i < segs.length; i++) {
        const r = segs[i].getBoundingClientRect();
        if (x <= r.right + 2 || i === segs.length - 1) {
          const s = track.steps[i];
          seek(s.start + clamp((x - r.left) / r.width, 0, 1) * (s.end - s.start));
          return;
        }
      }
    };
    bar.addEventListener('pointerdown', (e) => { scrubbing = true; bar.setPointerCapture(e.pointerId); bar.classList.add('is-scrubbing'); seekX(e.clientX); });
    bar.addEventListener('pointermove', (e) => { if (scrubbing) seekX(e.clientX); });
    const endScrub = () => { scrubbing = false; bar.classList.remove('is-scrubbing'); };
    bar.addEventListener('pointerup', endScrub);
    bar.addEventListener('pointercancel', endScrub);
    global.addEventListener('keydown', (e) => {
      if (e.code !== 'Space' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.matches && e.target.matches('input, textarea, select, button')) return;
      e.preventDefault();
      play(!playing);
    });

    // ---- the switch
    let sw = null;
    if (tracks.length > 1) {
      sw = document.createElement('div');
      sw.className = 'lshell-tracks';
      sw.setAttribute('role', 'tablist');
      sw.innerHTML = tracks.map((tr) => `<button type="button" role="tab" data-id="${tr.id}"></button>`).join('');
      [...sw.children].forEach((b, k) => { b.textContent = tracks[k].label; });
      shell.el.appendChild(sw);
      sw.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (b) { b.blur(); setTrack(b.dataset.id); }
      });
    }
    function paintSwitch() {
      if (!sw) return;
      for (const b of sw.children) {
        const on = b.dataset.id === track.id;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on);
      }
    }
    function setTrack(id) {
      const next = tracks.find((tr) => tr.id === id);
      if (!next || next === track) return;
      track = next;
      total = lay(track.steps);
      shell.setSteps(track.steps);
      drawTimeline();
      paintSwitch();
      t = 0;
      fresh = true;
      if (opts.onTrack) opts.onTrack(track, ctx);
      shell.goTo(0);
    }

    // ---- placement: centred on the page, the panel on the right above the dock
    const TOP = 60;   // the base's top bar
    const DOCK_MAX = 1060;
    function place() {
      const W = global.innerWidth, H = global.innerHeight;
      const r = shell.panelRect();
      if (shell.narrow()) {
        dock.style.left = '12px';
        dock.style.width = (W - 24) + 'px';
        dock.style.bottom = Math.round(H - r.top + 10) + 'px';
      } else {
        const w = Math.min(DOCK_MAX, W - 48);
        dock.style.left = Math.round((W - w) / 2) + 'px';
        dock.style.width = w + 'px';
        dock.style.bottom = '24px';
      }
      if (sw) sw.style.left = Math.round(W / 2) + 'px';
      if (opts.onLayout) opts.onLayout();
    }
    function freeRect() {
      const W = global.innerWidth;
      const r = shell.panelRect();
      const d = dock.getBoundingClientRect();
      const top = sw ? sw.getBoundingClientRect().bottom + 8 : TOP;
      return { l: 0, r: shell.narrow() ? W : r.left, t: top, b: d.top - 8 };
    }
    new ResizeObserver(place).observe(shell.panel);
    global.addEventListener('resize', place);

    drawTimeline();
    paintSwitch();
    paintPlay();
    place();

    return Object.assign(shell, {
      freeRect,
      time: {
        get t() { return t; },
        get playing() { return playing; },
        get track() { return track; },
        seek, play, setTrack,
      },
    });
  }

  global.TimelineShell = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
