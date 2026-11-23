/* The lesson: numbered procedure list, instruction card, and a timeline you can step back and
 * forth on (from Strawberry), for hands-on labs.
 *
 *   const lesson = createLesson({
 *     steps, phases, rebuild,        // rebuild(): put the bench back to its starting state
 *                                    // phases: [{ title, desc?, steps: [ids] }] = the numbered list;
 *                                    // the card's chip numbers by phase too ("Step 3b of 6")
 *     panel: document.getElementById('stepsPanel'),
 *     onEnter: (step, i) => stage.focus(step.view),
 *   });
 *   ix = createInteraction(stage, { targets: lesson.targets, busy: lesson.isBusy,
 *                                   onClick: lesson.click, status: lesson.status,
 *                                   markerStyle: 'circle' });
 *   stage.onFrame((dt) => lesson.update(dt));
 *   lesson.start();
 *
 * A step:
 *   { id, title, short?,                 // short = timeline label (defaults to title)
 *     targets: ['jar'],                  // keys a click may use
 *     activeTargets?: () => [...],       // subset to highlight right now (default: targets)
 *     action?: 'add a scoop',            // label status line: "Click to add a scoop"
 *     hint, detail?, why?, view?,        // card text; hint, detail and why may be functions.
 *                                        // why shows once the step's object is clicked; the
 *                                        // hint (click line) hides while a click animates
 *     run: async (key) => {...},         // animate one click
 *     clock?: () => '3:24' | null,       // text for the card's top-right clock (a time-lapse); null hides it
 *     isDone?: () => bool,               // multi-click steps (default: done after one click)
 *     progress?: () => 0..1,             // timeline fill while in progress
 *     watch?: { duration, get(), set(t), rate?() }   // a timed step you can scrub
 *     caption?: 'Pour in the buffer' | () => ... // Watch mode's caption (default: title). A
 *                                        // function is re-read every frame, so it can follow the
 *                                        // animation (see cues()). It may return { text, note }:
 *                                        // a note is a short, essential aside ("Don't mix!")
 *   }
 *
 * Two modes (toggle in the top bar, or ?mode=watch in the URL):
 *   - Hands-on ('do'): the student clicks the bench objects; no timeline.
 *   - Watch ('watch'): a timeline with a Play button that runs the whole
 *     experiment by itself, clicking each step's objects in turn. Pause
 *     freezes mid-animation; the track scrubs and jumps between steps.
 *     Like a video: the card and procedure list hide, and the step's caption
 *     shows in large text above the timeline.
 *
 * Going back or jumping ahead rebuilds the bench and replays, instantly, the
 * clicks the student made in earlier steps; steps they skipped are completed
 * automatically. Randomness is reseeded per click (core/random.js), so a
 * rebuilt bench matches what they saw. Rules for step code:
 *   - animate only with anim()/moveTo()/wait() from core/tween.js
 *   - draw randomness only from rand()/gauss() in core/random.js
 *   - keep all bench state inside what rebuild() recreates
 */
import { clamp } from './core/math.js';
import { clearTweens, setInstant, setPaused } from './core/tween.js';
import { reseed } from './core/random.js';
import { toast, setToastMuted, ensureEl, stripTags, uiRoot } from './ui.js';

/** A caption that follows a clock: cues(() => S.t, [[0, 'Pull off the leaves'], [0.42, 'Into the bag']])
 * shows the last cue whose time has been reached (the first one before that). A cue's
 * text may be a string or { text, note }. */
export function cues(getT, list) {
  return () => {
    const t = getT();
    let v = list[0][1];
    for (const [at, c] of list) if (t >= at - 1e-6) v = c;
    return v;
  };
}

export function createLesson({
  steps,
  phases,
  rebuild,
  panel = null,
  onEnter = () => {},
  onComplete = () => {},
  completeHint = '<b>Lab complete</b>', // the complete card's text (string or function)
  completeWhy = null,              // optional blue note on the complete card (string or function)
  completeCaption = 'Lab complete', // Watch mode's last caption (string, { text, note } or function)
  introCaption = 'Press <b>Play</b> to watch the experiment',
  mode = new URLSearchParams(location.search).get('mode') === 'watch' ? 'watch' : 'do',
  autoDwell = 1.1,                 // Watch mode: seconds to read the hint before each auto-click
}) {
  const N = steps.length;
  const numberByPhase = !!phases;
  phases = phases || [{ title: 'Procedure', icon: 'ph-list-checks', steps: steps.map((s) => s.id) }];
  const indexOf = (id) => steps.findIndex((s) => s.id === id);
  const phaseIdx = phases.map((p) => p.steps.map(indexOf));
  /** The chip's label: "Step 3b of 6" (by phase, a/b/c within a phase), else "Step 4 of 8". */
  function stepLabel(i) {
    if (numberByPhase) {
      const p = phaseIdx.findIndex((ids) => ids.includes(i));
      if (p >= 0) {
        const j = phaseIdx[p].indexOf(i);
        return `Step ${p + 1}${phaseIdx[p].length > 1 ? 'abcdefgh'[j] : ''} of ${phases.length}`;
      }
    }
    return `Step ${i + 1} of ${N}`;
  }

  const S = { step: 0, busy: false, replaying: false, playing: false, scrubbing: false, mode, auto: false, log: steps.map(() => []) };
  let token = 0;
  let dwell = 0;
  const watching = () => S.mode === 'watch';

  const text = (v) => (typeof v === 'function' ? v() : v);
  const clickable = (i) => (steps[i] && steps[i].targets) || [];
  const active = (i) => { const s = steps[i]; if (!s) return []; return s.activeTargets ? s.activeTargets() : clickable(i); };
  function isDone(i) {
    const s = steps[i];
    if (s.watch) return s.watch.get() >= s.watch.duration - 1e-6;
    if (s.isDone) return s.isDone();
    return S.log[i].length > 0;
  }
  function progressOf(i) {
    if (i < S.step) return 1;
    if (i > S.step) return 0;
    const s = steps[i];
    if (s.watch) return clamp(s.watch.get() / s.watch.duration);
    if (s.progress) return clamp(s.progress());
    return isDone(i) ? 1 : 0;
  }

  /* ------------------------------------------------------------- clicks */
  async function runClick(i, key) {
    reseed('step', i, S.log[i].length);
    S.log[i].push(key);
    await steps[i].run(key);
  }

  async function click(key) {
    if (S.busy || S.replaying) return;
    const i = S.step; const s = steps[i];
    if (!s) return;
    if (!key || !clickable(i).includes(key)) {
      if (key && clickable(i).length) {
        toast(`Not yet — ${stripTags(text(s.hint))}`, { icon: 'ph-hand-pointing', warn: true });
        C.action.classList.remove('shake'); void C.action.offsetWidth; C.action.classList.add('shake');
      }
      return;
    }
    S.busy = true;
    render();
    const my = token;
    try { await runClick(i, key); } catch (err) { console.error(err); }
    if (my !== token) return; // the student jumped away mid-animation
    S.busy = false;
    if (isDone(i)) enter(i + 1); else render();
  }

  /* ------------------------------------------------- jumping and replay */
  async function complete(i) {
    const s = steps[i];
    if (s.watch) { s.watch.set(s.watch.duration); return; }
    for (let guard = 0; !isDone(i) && guard < 50; guard++) {
      const key = active(i)[0] ?? clickable(i)[0];
      if (key === undefined) break;
      await runClick(i, key);
    }
  }

  /** Go to the start of step k (or `frac` of the way into a timed step). */
  async function jumpTo(k, frac = 0) {
    k = clamp(Math.round(k), 0, N);
    const my = ++token;
    clearTweens();
    S.busy = false; S.playing = false;
    setPaused(false);
    S.replaying = true;
    setInstant(true); setToastMuted(true);
    try {
      reseed('build');
      rebuild();
      for (let i = 0; i < k; i++) {
        S.step = i;
        for (const key of S.log[i].splice(0)) await runClick(i, key);
        await complete(i);
      }
      for (let i = k; i < N; i++) S.log[i].length = 0;
    } catch (err) {
      console.error(err);
    } finally {
      setInstant(false); setToastMuted(watching()); // captions replace toasts in Watch mode
      S.replaying = false;
    }
    if (my !== token) return;
    enter(k, frac);
  }

  function enter(i, frac = 0) {
    S.step = i;
    S.busy = false;
    dwell = 0;
    if (i >= N) S.auto = false;
    const s = steps[i];
    if (s && s.watch) {
      if (frac) s.watch.set(frac * s.watch.duration);
      S.playing = watching() ? S.auto : true;
    }
    onEnter(s, i);
    render();
    if (i >= N) onComplete();
  }

  /* ---------------------------------------------------- timed (watch) steps */
  /** Watch mode: play / pause the whole run. */
  function setAuto(on) {
    if (on && S.step >= N) { S.auto = true; jumpTo(0); return; } // play again from the top
    S.auto = !!on && watching();
    dwell = 0;
    setPaused(S.busy && !S.auto); // freeze (or unfreeze) a click animation mid-way
    const s = steps[S.step];
    if (s && s.watch) S.playing = S.auto;
    render();
  }

  function setMode(m) {
    m = m === 'watch' ? 'watch' : 'do';
    if (m === S.mode) return;
    S.mode = m;
    S.auto = false;
    setPaused(false);
    const s = steps[S.step];
    if (s && s.watch) S.playing = m === 'do';
    applyMode();
    render();
  }

  // what Watch mode is about to click or is clicking (for the follow camera)
  let clickN = 0, actingKey = null;
  const nextKey = () => active(S.step)[0] ?? clickable(S.step)[0];
  function acting() {
    if (!S.auto || S.replaying) return null;
    const s = steps[S.step];
    if (!s || s.watch) return null;
    const key = S.busy ? actingKey : nextKey();
    if (key === undefined || key === null) return null;
    return { key, id: `${S.step}:${clickN}` };
  }

  function autoTick(dt) {
    if (!S.auto || S.busy || S.replaying) return;
    const s = steps[S.step];
    if (!s) { S.auto = false; return; }
    if (s.watch) return;
    dwell += dt;
    if (dwell < autoDwell) return;
    dwell = 0;
    const key = nextKey();
    if (key !== undefined) { clickN++; actingKey = key; click(key); }
    else enter(S.step + 1);
  }

  function update(dt) {
    autoTick(dt);
    const s = steps[S.step];
    if (s && s.watch && S.playing && !S.replaying && !S.scrubbing) {
      const t = Math.min(s.watch.duration, s.watch.get() + dt * (s.watch.rate ? s.watch.rate() : 1));
      s.watch.set(t);
      if (t >= s.watch.duration) { S.playing = false; enter(S.step + 1); return; }
    }
    renderTimeline();
    renderClock();
    renderCaption();
  }

  /* the card's clock: re-read every frame, written only when it changes */
  let clockShown = null;
  function renderClock() {
    const s = steps[S.step];
    const v = (s && s.clock && s.clock()) || null;
    if (v === clockShown) return;
    clockShown = v;
    C.clock.hidden = !v;
    if (v) C.clockText.textContent = v;
    capClock.hidden = !v;
    if (v) capClock.lastChild.textContent = v;
  }

  /* Watch mode's caption: re-read every frame, written only when it changes */
  let capShown = null;
  function renderCaption() {
    if (!watching()) { capShown = null; return; }
    const s = steps[S.step];
    const fresh = S.step === 0 && !S.auto && !S.busy && !S.log[0].length && !(s && s.watch && s.watch.get() > 1e-6);
    let v = fresh ? introCaption : s ? (s.caption !== undefined ? text(s.caption) : s.title) : text(completeCaption);
    if (!v) v = { text: '' };
    if (typeof v === 'string') v = { text: v };
    const key = `${v.text}|${v.note || ''}`;
    if (key === capShown) return;
    const swap = capShown !== null && !S.replaying;
    capShown = key;
    capText.innerHTML = v.text || '';
    capNote.innerHTML = v.note || '';
    capNote.hidden = !v.note;
    capBox.hidden = !v.text;
    if (swap) { capBox.classList.remove('swap'); void capBox.offsetWidth; capBox.classList.add('swap'); }
  }

  /* ---------------------------------------------------------------- DOM */
  /* Instruction card, bottom centre (from OnionRoot): step chip, title, detail,
   * why (once clicked), and the click action (until clicked). */
  const card = ensureEl('lab-card', 'panel lab-card', 'section');
  card.innerHTML = `
    <div class="card-head"><span class="chip"></span><span class="card-clock" hidden title="Time-lapse"><i class="ph-bold ph-timer"></i><span></span></span></div>
    <button class="card-fold" type="button" aria-expanded="true" aria-label="Collapse" hidden><i class="ph-bold ph-caret-down"></i></button>
    <h2></h2>
    <div class="card-body"><div>
      <p class="card-text"></p>
      <p class="why"><i class="ph-fill ph-lightbulb"></i><span></span></p>
      <div class="card-action"><i></i><span></span></div>
    </div></div>`;
  const C = {
    chip: card.querySelector('.chip'), title: card.querySelector('h2'), text: card.querySelector('.card-text'),
    why: card.querySelector('.why'), whyText: card.querySelector('.why span'),
    clock: card.querySelector('.card-clock'), clockText: card.querySelector('.card-clock span'),
    action: card.querySelector('.card-action'), actionIcon: card.querySelector('.card-action i'), actionText: card.querySelector('.card-action span'),
    fold: card.querySelector('.card-fold'),
  };
  let cardStep = -1;
  /* The complete card folds to its title, so the student can see the bench behind a tall
   * results card. The card's height is in the sim's insets(), so re-centre once it settles. */
  function setFolded(on) {
    card.classList.toggle('folded', on);
    C.fold.setAttribute('aria-expanded', String(!on));
    C.fold.setAttribute('aria-label', on ? 'Expand' : 'Collapse');
  }
  function toggleFold() {
    if (!card.classList.contains('complete')) return;
    setFolded(!card.classList.contains('folded'));
    const body = card.querySelector('.card-body');
    const done = (e) => {
      if (e && e.target !== body) return;
      body.removeEventListener('transitionend', done);
      window.dispatchEvent(new Event('resize'));
    };
    body.addEventListener('transitionend', done);
    setTimeout(done, 450); // reduced motion has no transition to end
  }
  C.fold.addEventListener('click', toggleFold);
  C.title.addEventListener('click', toggleFold);
  /* Watch mode's captions, above the timeline (the card and list hide, like a video) */
  const caps = ensureEl('lab-captions', 'lab-captions');
  caps.setAttribute('aria-live', 'polite');
  caps.innerHTML = `<div class="cap-box" hidden><span class="cap-clock" hidden><i class="ph-bold ph-timer"></i><span></span></span><span class="cap-text"></span><span class="cap-note" hidden></span></div>`;
  const capBox = caps.firstChild, capText = caps.querySelector('.cap-text'), capNote = caps.querySelector('.cap-note');
  const capClock = caps.querySelector('.cap-clock');
  const tl = ensureEl('lab-timeline', 'lab-timeline', 'footer');
  tl.innerHTML = `
    <button class="tl-btn tl-play" data-act="play" title="Play" aria-label="Play"><i class="ph-fill ph-play"></i><span>Play</span></button>
    <button class="tl-btn" data-act="prev" title="Previous step" aria-label="Previous step"><i class="ph-bold ph-caret-left"></i></button>
    <button class="tl-btn" data-act="next" title="Next step" aria-label="Next step"><i class="ph-bold ph-caret-right"></i></button>
    <div class="tl-track"></div>
    <button class="tl-btn" data-act="replay" title="Restart this step" aria-label="Restart this step"><i class="ph-bold ph-arrow-counter-clockwise"></i></button>`;
  const track = tl.querySelector('.tl-track');
  const segs = [];
  phases.forEach((ph, p) => {
    const g = document.createElement('div');
    g.className = 'tl-phase';
    const row = document.createElement('div');
    row.className = 'tl-segs';
    let weight = 0;
    phaseIdx[p].forEach((i) => {
      const s = steps[i];
      const el = document.createElement('div');
      el.className = 'tl-seg' + (s.watch ? ' watch' : '');
      el.style.flex = s.watch ? 3 : 1;
      weight += s.watch ? 3 : 1;
      el.title = `${i + 1}. ${s.short || s.title}`;
      el.dataset.i = i;
      el.innerHTML = '<div class="tl-fill"></div>';
      row.appendChild(el);
      segs[i] = { el, fill: el.firstChild };
    });
    g.style.flex = Math.max(weight, 3.2); // room for the phase label even when it has one step
    // numbered like the procedure list; a check once the phase is done
    g.innerHTML = `<div class="tl-label"><b class="tl-num"><em>${p + 1}</em><i class="ph-bold ph-check"></i></b><span>${ph.title}</span></div>`;
    g.prepend(row);
    track.appendChild(g);
  });

  /* Mode toggle: in the sim's top-bar actions if it has them, else top centre. */
  const modeEl = document.createElement('div');
  modeEl.className = 'lab-mode';
  modeEl.setAttribute('role', 'radiogroup');
  modeEl.setAttribute('aria-label', 'Mode');
  modeEl.innerHTML = `
    <button data-mode="do" role="radio" title="Do the experiment yourself"><i class="ph ph-hand-pointing"></i><span>Hands-on</span></button>
    <button data-mode="watch" role="radio" title="Watch the whole experiment play"><i class="ph ph-play-circle"></i><span>Watch</span></button>`;
  const actions = document.querySelector('.top-actions');
  if (actions) actions.prepend(modeEl); else { modeEl.classList.add('floating'); uiRoot().appendChild(modeEl); }
  modeEl.addEventListener('click', (e) => { const b = e.target.closest('[data-mode]'); if (b) setMode(b.dataset.mode); });
  function applyMode() {
    uiRoot().classList.toggle('lab-watch', watching());
    uiRoot().classList.toggle('lab-do', !watching());
    if (!S.replaying) setToastMuted(watching());
    modeEl.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === S.mode)));
    window.dispatchEvent(new Event('resize')); // the timeline came or went: re-centre the 3D view
  }
  applyMode();
  window.addEventListener('keydown', (e) => {
    if (e.key !== ' ' || !watching() || e.target.closest('input, textarea, button')) return;
    e.preventDefault(); setAuto(!S.auto);
  });

  function segAt(clientX, clientY) {
    let best = null, bd = Infinity;
    segs.forEach((s, i) => {
      const r = s.el.getBoundingClientRect();
      const d = clientX < r.left ? r.left - clientX : clientX > r.right ? clientX - r.right : 0;
      if (d < bd) { bd = d; best = { i, frac: clamp((clientX - r.left) / r.width, 0, 0.999) }; }
    });
    return best;
  }
  function scrubTo(frac) {
    const s = steps[S.step];
    s.watch.set(frac * s.watch.duration);
  }
  track.addEventListener('pointerdown', (e) => {
    const hit = segAt(e.clientX, e.clientY);
    if (!hit || S.replaying) return;
    if (hit.i === S.step && steps[hit.i].watch) {
      S.scrubbing = true; S.playing = false; S.auto = false;
      track.setPointerCapture(e.pointerId);
      scrubTo(hit.frac);
    } else {
      jumpTo(hit.i, steps[hit.i].watch ? hit.frac : 0);
    }
  });
  track.addEventListener('pointermove', (e) => {
    if (!S.scrubbing) return;
    const r = segs[S.step].el.getBoundingClientRect();
    scrubTo(clamp((e.clientX - r.left) / r.width, 0, 0.999));
  });
  const endScrub = () => { S.scrubbing = false; };
  track.addEventListener('pointerup', endScrub);
  track.addEventListener('pointercancel', endScrub);

  tl.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || S.replaying) return;
    const act = b.dataset.act;
    if (act === 'prev') jumpTo(Math.max(0, S.step - 1));
    else if (act === 'next') { if (S.step < N) jumpTo(S.step + 1); }
    else if (act === 'replay') jumpTo(Math.min(S.step, N - 1));
    else if (act === 'play') { setAuto(!S.auto); return; }
    render();
  });

  function renderTimeline() {
    segs.forEach((s, i) => {
      s.fill.style.transform = `scaleX(${progressOf(i)})`;
      s.el.classList.toggle('active', i === S.step);
      s.el.classList.toggle('done', i < S.step);
    });
    phaseIdx.forEach((idx, p) => {
      const g = track.children[p];
      g.classList.toggle('active', idx.includes(S.step));
      g.classList.toggle('done', S.step > idx[idx.length - 1]);
    });
    const s = steps[S.step];
    const play = tl.querySelector('.tl-play');
    const label = S.auto ? 'Pause' : S.step >= N ? 'Play again' : 'Play';
    if (play.dataset.state !== label) {
      play.dataset.state = label;
      play.title = label; play.setAttribute('aria-label', label);
      play.querySelector('i').className = S.auto ? 'ph-fill ph-pause' : S.step >= N ? 'ph-bold ph-arrow-clockwise' : 'ph-fill ph-play';
      play.querySelector('span').textContent = label;
    }
    tl.querySelector('[data-act=prev]').disabled = S.step === 0;
    tl.querySelector('[data-act=next]').disabled = S.step >= N;
  }

  function renderCard() {
    const s = steps[S.step];
    // fade the card when the step changes (not on every progress update)
    const entering = cardStep !== S.step;
    if (entering && cardStep !== -1 && !S.replaying) {
      // the complete card arrives with its own entrance; a step just cross-fades
      const cls = s ? 'swap' : 'arrive';
      card.classList.remove('swap', 'arrive'); void card.offsetWidth; card.classList.add(cls);
    }
    cardStep = S.step;
    card.classList.toggle('complete', !s); // a sim can style its complete card (e.g. wider for results)
    C.fold.hidden = !!s;
    if (entering) setFolded(false);
    if (!s) {
      C.chip.textContent = 'Complete';
      C.title.textContent = 'Lab complete';
      C.text.innerHTML = text(completeHint); C.text.hidden = false;
      const cw = text(completeWhy);
      C.whyText.innerHTML = cw || ''; C.why.hidden = !cw;
      C.action.hidden = true;
      return;
    }
    C.chip.textContent = stepLabel(S.step);
    C.title.innerHTML = s.title;
    const detail = text(s.detail), why = text(s.why);
    // started: the student has clicked (or the timed step is running). The why is the
    // payoff, so it waits for the click; the click line goes once it has done its job,
    // and comes back only if the step needs another click (e.g. squish 1/3).
    const started = S.busy || S.log[S.step].length > 0 || (s.watch && s.watch.get() > 1e-6);
    C.text.innerHTML = detail || ''; C.text.hidden = !detail;
    C.whyText.innerHTML = why || ''; C.why.hidden = !why || !started;
    // the action line: only for timed steps (the "Click the…" line is gone; the wrong-click
    // toast still says what to click)
    const show = !!s.watch;
    C.action.hidden = !show;
    if (show) {
      C.actionText.innerHTML = text(s.hint);
      C.actionIcon.className = s.watch ? 'ph-fill ph-eye' : 'ph-fill ph-hand-tap';
      C.action.classList.toggle('busy', S.busy);
    }
  }

  function renderPanel() {
    if (!panel) return;
    if (!panel.querySelector('.lab-steps')) {
      panel.innerHTML = `
        <div class="panel-label">Procedure</div>
        <ol class="lab-steps"></ol>`;
      panel.addEventListener('click', (e) => {
        const el = e.target.closest('[data-jump]');
        if (el && !S.replaying && Number(el.dataset.jump) !== S.step) jumpTo(Number(el.dataset.jump));
      });
    }
    const list = panel.querySelector('.lab-steps');
    list.innerHTML = '';
    phases.forEach((ph, p) => {
      const idxs = phaseIdx[p];
      const first = idxs[0], last = idxs[idxs.length - 1];
      const state = S.step > last ? 'done' : S.step >= first ? 'active' : 'todo';
      const desc = ph.desc || idxs.map((i) => steps[i].short || steps[i].title).join(' · ');
      const li = document.createElement('li');
      li.className = state;
      li.dataset.jump = first;
      // the active phase gets a row of pips, one per step, so 16 steps still read as 4
      const pips = state === 'active' && idxs.length > 1
        ? `<span class="pips">${idxs.map((i) => `<i class="${i < S.step ? 'done' : i === S.step ? 'now' : ''}"></i>`).join('')}</span>` : '';
      li.innerHTML = `<span class="num">${state === 'done' ? '<i class="ph-bold ph-check"></i>' : p + 1}</span>
        <div><b>${ph.title}</b><small>${desc}</small>${pips}</div>`;
      list.appendChild(li);
    });
  }

  function render() { renderPanel(); renderCard(); renderTimeline(); renderCaption(); }

  /* ------------------------------------------------- label status line */
  function status(key, isTarget) {
    if (S.busy || S.replaying) return null;
    if (watching()) return null;
    const s = steps[S.step];
    if (isTarget) return { text: `Click to ${(s && s.action) || 'use'}`, kind: 'ok' };
    if (s && clickable(S.step).includes(key)) return { text: 'Already done for this step', kind: 'warn' };
    // (objects used in an earlier or later step get no status line: just their name and description)
    return null;
  }

  return {
    get step() { return S.step; },
    get log() { return S.log; },
    get mode() { return S.mode; },
    get autoplaying() { return S.auto; },
    isBusy: () => S.busy || S.replaying,
    isReplaying: () => S.replaying,
    targets: () => (S.busy || S.replaying || watching() ? [] : active(S.step)),
    click: (key) => (watching() ? undefined : click(key)), // Watch mode drives the clicks itself
    jumpTo, update, status, render, setMode,
    acting,
    play: () => setAuto(true),
    pause: () => setAuto(false),
    start() { return jumpTo(0); },
    /** Forget the student's clicks and start over (call newSession() first for new randomness). */
    restart() { S.log.forEach((l) => { l.length = 0; }); return jumpTo(0); },
  };
}
