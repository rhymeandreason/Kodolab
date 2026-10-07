/* =============================================================================
 *  quiz/quiz.js — a check at the end of a lesson, answered on the scene
 * =============================================================================
 *  Not a scene. It draws in the panel, like Graph, on the same contract. A
 *  page writes the step and never the mount:
 *
 *      steps: [ ..., Quiz.step({ scene: () => L, questions: [...] }) ]
 *
 *  The step is `hidden` while every question is switched off, so a student
 *  never meets a quiz with nothing in it. Underneath, the step mounts:
 *
 *      Quiz.mount(el, {
 *        id: 'check',              // keeps answers across Back/Next; default 'quiz'
 *        scene: L,                 // the component a `find` question is answered on
 *        questions: [
 *          { q: 'Where does CO2 get in?', choices: ['Stoma', 'Cuticle', 'Xylem'], answer: 0, why: '…' },
 *          { q: 'Click the pore CO2 enters through.', find: 'stoma', why: '…' },
 *        ],
 *      })  →  set · state · on('answer' | 'done') · destroy
 *
 *  A `find` question is answered by clicking the part on the 3D model. The
 *  click is read against the component's own named parts (lib/annotate.js's
 *  Notebook, which every component mounts): each anchor is projected to the
 *  canvas and the nearest within reach is what the student clicked. Right or
 *  wrong, the part they hit gets its library note, so a wrong click still
 *  teaches what that thing was.
 *
 *  EVERY QUESTION IS ON UNTIL THE TEACHER TURNS IT OFF. The builder is where
 *  they do it: when it answers the frame's `app-quiz-hello`, the quiz adds
 *  one bar over what a student sees, and its button posts the whole list
 *  (`app-quiz-open`) for build.html's dialog to lay out. Turning one off
 *  writes `active: false` into the question's own object literal, through the
 *  builder's text edit. `?quiz=review` plays the inactive ones too, for a
 *  bench or an eval with no builder.
 *
 *  The score is reported once per attempt as the `quiz` event `/teach`
 *  already renders (docs/api.md, "Class codes"): straight to `Track` on a
 *  hand-built lesson, or posted to the parent from a sandboxed app, where
 *  build/app.html relays it.
 *
 *  `Quiz.activation(source, q, on)` is the builder's half: the {find, replace}
 *  pair that writes or removes `active: false`.
 *  Node-loadable, no DOM at load.
 * ========================================================================== */
(function (global) {
  'use strict';

  const REACH = 56;            // px from a part's anchor that still counts as clicking it
  const DRAG = 5;              // px of pointer travel that makes a click an orbit

  const kindOf = q => (q.find ? 'find' : 'choice');

  /* A question the component cannot hold is dropped with one warning: a
     key pointing past its choices, or at a part the scene does not have,
     would mark every student wrong. */
  function valid(q, scene) {
    if (!q || typeof q.q !== 'string' || !q.q.trim()) return 'no q';
    if (q.find) {
      if (!scene) return 'find needs a scene';
      const nb = scene.box && scene.box.notebook;
      if (nb && !nb.list().some(a => a.name === q.find)) return `no part named ${q.find}; have ${nb.list().map(a => a.name).join(', ')}`;
      return null;
    }
    if (!Array.isArray(q.choices) || q.choices.length < 2) return 'needs two or more choices';
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= q.choices.length) return 'answer is not an index into choices';
    return null;
  }

  /* ---- review: who is looking. 'builder' | 'link' | null ---- */
  let review = /[?&]quiz=review\b/.test((global.location && global.location.search) || '') ? 'link' : null;
  const live = new Set();
  if (global.addEventListener) {
    global.addEventListener('message', e => {
      if (!e.data || e.data.type !== 'app-quiz-review') return;
      review = e.data.on ? 'builder' : null;
      live.forEach(r => r());
      if (global.LessonShell && global.LessonShell.current) global.LessonShell.current.refresh();
    });
    if (global.parent && global.parent !== global) try { global.parent.postMessage({ type: 'app-quiz-hello' }, '*'); } catch (_) {}
  }

  function report(payload) {
    if (global.Track) { try { global.Track.event('quiz', payload); } catch (_) {} return; }
    if (global.parent && global.parent !== global) try { global.parent.postMessage(Object.assign({ type: 'app-quiz' }, payload), '*'); } catch (_) {}
  }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const kept = new Map();       // id -> { i, answers, done }: survives a remount on Back/Next

  function mount(el, params = {}) {
    let P = Object.assign({ id: 'quiz', questions: [], scene: null }, params);
    let all = [], shown = [], off = null;
    const subs = { answer: [], done: [], frame: [] };
    const emit = (ev, ...a) => (subs[ev] || []).forEach(fn => { try { fn(...a); } catch (e) { console.error(e); } });

    const root = document.createElement('div');
    root.className = 'quiz';
    el.appendChild(root);

    function load() {
      all = [];
      for (const q of P.questions || []) {
        const why = valid(q, sceneOf(q));
        if (why) { console.warn(`Quiz: dropped "${q && q.q}": ${why}`); continue; }
        all.push(Object.assign({}, q, { kind: kindOf(q), on: q.active !== false }));
      }
      shown = review === 'link' ? all : all.filter(q => q.on);
      if (!kept.has(P.id) || kept.get(P.id).n !== shown.length) kept.set(P.id, { n: shown.length, i: 0, answers: [], done: false });
    }
    const S = () => kept.get(P.id);
    /* A scene may be a function, so a step written before the mount can name
       the component the page mounts after it. */
    const sceneOf = q => { const sc = q.scene || P.scene; return typeof sc === 'function' ? sc() : sc; };
    const partName = q => ((sceneOf(q).anchors() || []).find(x => x.name === q.find) || {}).text || q.find;

    /* ---- find: the click on the model ---- */
    function partAt(scene, x, y) {
      const box = scene && scene.box, nb = box && box.notebook;
      if (!nb) return null;
      const r = box.canvas.getBoundingClientRect();
      let best = null, bd = REACH;
      for (const a of nb.list()) {
        if (!a.present) continue;
        const p = nb.point(a.name);
        if (!p) continue;
        /* A part on the far side is not what the student clicked: they see
           the near surface over it. */
        const f = nb.facing && nb.facing(a.name);
        if (f && f.dot(box.camera.getWorldPosition(p.clone()).sub(p)) < 0) continue;
        p.project(box.camera);
        if (p.z > 1) continue;
        const d = Math.hypot(r.left + (p.x + 1) / 2 * r.width - x, r.top + (1 - p.y) / 2 * r.height - y);
        if (d < bd) { bd = d; best = a; }
      }
      return best;
    }
    function listen(q) {
      unlisten();
      const scene = sceneOf(q);
      let at = null;
      const onDown = e => { if (scene.box && e.target === scene.box.canvas) at = [e.clientX, e.clientY]; };
      const onUp = e => {
        if (!at || !scene.box || e.target !== scene.box.canvas) return;
        const moved = Math.hypot(e.clientX - at[0], e.clientY - at[1]); at = null;
        if (moved > DRAG) return;
        const hit = partAt(scene, e.clientX, e.clientY);
        if (!hit) { const m = root.querySelector('.quiz-miss'); if (m) m.hidden = false; return; }
        answer(hit.name === q.find, hit.name, hit.text || hit.name);
        scene.clearNotes && scene.clearNotes();
        scene.note && scene.note(hit.name);
        if (hit.name !== q.find && scene.note) scene.note(q.find);
      };
      document.addEventListener('pointerdown', onDown, true);
      document.addEventListener('pointerup', onUp, true);
      off = () => { document.removeEventListener('pointerdown', onDown, true); document.removeEventListener('pointerup', onUp, true); };
      if (scene.box) scene.box.canvas.style.cursor = 'crosshair';
    }
    function unlisten() {
      if (off) off(); off = null;
      for (const q of all) { const sc = sceneOf(q); if (sc && sc.box) sc.box.canvas.style.cursor = ''; }
    }

    function answer(correct, value, label) {
      const s = S(), q = shown[s.i];
      if (s.answers[s.i]) return;
      s.answers[s.i] = { q: q.q, answer: label, value, correct };
      unlisten();
      emit('answer', { i: s.i, correct, answer: label });
      if (s.answers.filter(Boolean).length === shown.length) {
        s.done = true;
        const payload = { score: s.answers.filter(a => a.correct).length, total: shown.length,
          answers: s.answers.map(a => ({ q: a.q, answer: a.answer, correct: a.correct })) };
        report(payload);
        emit('done', payload);
      }
      paint();
    }

    /* ---- where it draws ----
       Two layouts, chosen per question. A click-the-part question lives in
       the panel beside the model it is answered on. A multiple-choice
       question needs no model, so it and the score take the window as one
       centred card, with the scene and panel hidden. A quiz with only choices
       never shows a scene at all, which is also what a quiz-only app is. */
    const shellEl = el.closest && el.closest('.lshell');
    let host = null;
    function place(mode) {
      if (!shellEl) return root.parentNode !== el && el.appendChild(root);
      if (mode === 'card') {
        if (!host) {
          host = document.createElement('div');
          host.className = 'quiz-cardhost';
          host.innerHTML = '<div class="quiz-card"></div>';
          shellEl.appendChild(host);
          /* Arriving on a card is not a change of layout: no fade. */
          if (!shellEl.classList.contains('is-quiz-card')) { shellEl.classList.add('quiz-snap'); setTimeout(() => shellEl.classList.remove('quiz-snap'), 60); }
        }
        if (root.parentNode !== host.firstChild) host.firstChild.appendChild(root);
        host.scrollTop = 0;
      } else if (root.parentNode !== el) el.appendChild(root);
      shellEl.classList.toggle('is-quiz-card', mode === 'card');
    }

    /* ---- painting ---- */
    const dots = () => '<div class="quiz-dots">' + shown.map((_, k) => {
      const a = S().answers[k];
      return `<i class="${a ? (a.correct ? 'right' : 'wrong') : ''}${k === S().i ? ' now' : ''}"></i>`;
    }).join('') + '</div>';
    const LETTERS = 'ABCDEFGH';
    const canBack = () => !!(P.back && (!P.canBack || P.canBack()));
    const backBtn = () => (canBack() ? '<button type="button" class="quiz-back">&larr; Back to the lesson</button>' : '');
    const verdict = (q, a, cls = '') => {
      const right = q.kind === 'find' ? partName(q) : q.choices[q.answer];
      return `<p class="${cls} quiz-verdict ${a.correct ? 'right' : 'wrong'}"><strong>${a.correct ? 'Right.' : 'Not quite.'}</strong> `
        + (a.correct ? '' : q.kind === 'find' ? `That was the ${esc(a.answer)}; this is the ${esc(right)}. ` : '')
        + esc(q.why || '') + '</p>';
    };

    function paintChoice(q, a) {
      const s = S();
      /* Short answers sit two by two; any long one puts them in a column. */
      const wide = q.choices.some(c => String(c).length > 32);
      let h = `<div class="quiz-top"><span class="quiz-eyebrow">${esc(P.title || 'Quick check')}</span>${dots()}<span class="quiz-n">${s.i + 1} of ${shown.length}</span></div>`
        + (q.on ? '' : '<span class="quiz-tag">Inactive</span>')
        + `<h2 class="quiz-q">${esc(q.q)}</h2>`
        + `<div class="quiz-choices${wide ? ' wide' : ''}">` + q.choices.map((c, k) => {
          const cls = !a ? '' : k === q.answer ? ' right' : k === a.value ? ' wrong' : ' dim';
          return `<button type="button" class="quiz-choice${cls}" data-k="${k}"${a ? ' disabled' : ''}><span class="quiz-key">${LETTERS[k]}</span><span>${esc(c)}</span></button>`;
        }).join('') + '</div>';
      h += a ? `<div class="quiz-after">${verdict(q, a)}<button type="button" class="btn primary quiz-go">${s.i + 1 < shown.length ? 'Next question' : 'See your score'}</button></div>`
             : '<p class="quiz-keys">Press A to ' + LETTERS[q.choices.length - 1] + ' to answer.</p>';
      return h + `<div class="quiz-foot">${backBtn()}</div>`;
    }

    function paintFind(q, a) {
      const s = S();
      let h = `<div class="quiz-head">${dots()}<span class="quiz-n">${s.i + 1} of ${shown.length}</span></div>`
        + (q.on ? '' : '<span class="quiz-tag">Inactive</span>')
        + `<p class="quiz-q">${esc(q.q)}</p>`;
      if (!a) h += '<p class="quiz-hint">Click it on the model. Drag to turn it first if you need to.</p>'
        + '<p class="quiz-hint quiz-miss" hidden>Nothing there. Click right on the part.</p>';
      else h += verdict(q, a, 'callout')
        + `<button type="button" class="btn primary quiz-go">${s.i + 1 < shown.length ? 'Next question' : 'See your score'}</button>`;
      return h;
    }

    function paintQuestion() {
      const s = S(), q = shown[s.i], a = s.answers[s.i];
      const scene = q.kind === 'find' ? sceneOf(q) : null;
      place(q.kind === 'find' ? 'panel' : 'card');
      root.className = 'quiz ' + (q.kind === 'find' ? 'is-panel' : 'is-card');
      root.innerHTML = q.kind === 'find' ? paintFind(q, a) : paintChoice(q, a);
      root.querySelectorAll('.quiz-choice[data-k]').forEach(b => b.onclick = () => pick(+b.dataset.k));
      const go = root.querySelector('.quiz-go');
      if (go) { go.onclick = () => { if (s.done) s.scored = true; else s.i++; if (scene && scene.clearNotes) scene.clearNotes(); paint(); }; if (q.kind !== 'find') go.focus({ preventScroll: true }); }
      if (q.kind === 'find' && !a) listen(q);
    }
    function pick(k) {
      const q = shown[S().i];
      if (!q || q.kind !== 'choice' || S().answers[S().i] || k < 0 || k >= q.choices.length) return;
      answer(k === q.answer, k, q.choices[k]);
    }
    /* A to D, or 1 to 4, while a choice is on screen. */
    const onKey = e => {
      if (!root.classList.contains('is-card') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target.matches && e.target.matches('input, textarea, select')) return;
      const k = /^[1-8]$/.test(e.key) ? +e.key - 1 : LETTERS.indexOf(e.key.toUpperCase());
      if (k >= 0 && e.key.length === 1) { pick(k); e.preventDefault(); }
    };
    document.addEventListener('keydown', onKey);

    function paintScore() {
      const s = S(), score = s.answers.filter(a => a.correct).length;
      place('card');
      root.className = 'quiz is-card';
      root.innerHTML = `<div class="quiz-top"><span class="quiz-eyebrow">${esc(P.title || 'Quick check')}</span></div>`
        + `<p class="quiz-score">${score}<small> of ${shown.length}</small></p>`
        + '<ol class="quiz-review">' + shown.map((q, k) => {
          const a = s.answers[k];
          return `<li class="${a.correct ? 'right' : 'wrong'}"><span class="quiz-q-sm">${esc(q.q)}</span>`
            + `<span class="quiz-a">${a.correct ? '' : '<s>' + esc(a.answer) + '</s> '}`
            + esc(q.kind === 'find' ? partName(q) : q.choices[q.answer]) + '</span></li>';
        }).join('') + '</ol>'
        + `<div class="quiz-foot">${backBtn()}<button type="button" class="btn primary quiz-again">Try again</button></div>`;
      root.querySelector('.quiz-again').onclick = () => { kept.set(P.id, { n: shown.length, i: 0, answers: [], done: false }); paint(); };
    }

    /* What the builder's dialog lays out: plain data, since it crosses the
       frame by postMessage. */
    const sheet = () => ({ type: 'app-quiz-list', id: P.id, questions: all.map(q => ({
      q: q.q, kind: q.kind, choices: q.choices || null, answer: q.answer == null ? null : q.answer,
      part: q.kind === 'find' ? partName(q) : null, why: q.why || '', on: q.on })) });
    const post = m => { try { global.parent.postMessage(m, '*'); } catch (_) {} };

    /* The teacher's bar, over what a student sees. */
    function bar() {
      if (review !== 'builder' || !all.length) return '';
      const off = all.length - shown.length;
      return `<div class="quiz-bar"><span><strong>${shown.length} of ${all.length}</strong> question${all.length === 1 ? '' : 's'} active${off ? `; ${off} hidden from students` : ''}.</span>`
        + '<button type="button" class="quiz-open">Edit questions</button></div>';
    }

    function paint() {
      unlisten();
      if (review === 'builder') post(sheet());
      if (!shown.length) {
        place('card'); root.className = 'quiz is-card';
        root.innerHTML = bar() + `<p class="quiz-hint">${review === 'builder' ? 'Every question is off, so students do not see this quiz.' : 'There are no questions in this quiz yet.'}</p>`;
      }
      else if (S().scored) paintScore();
      else { if (S().i >= shown.length) S().i = 0; paintQuestion(); }
      if (shown.length && bar()) root.insertAdjacentHTML('afterbegin', bar());
      const o = root.querySelector('.quiz-open');
      if (o) o.onclick = () => post(Object.assign(sheet(), { type: 'app-quiz-open' }));
      const bk = root.querySelector('.quiz-back');
      if (bk) bk.onclick = () => P.back();
    }

    const rerender = () => { load(); paint(); };
    live.add(rerender);
    load();
    paint();

    const api = {
      set(next) { P = Object.assign(P, next); load(); paint(); return api; },
      state() {
        const s = S();
        return { n: shown.length, drafts: all.length - shown.length, i: s.i, done: s.done,
          answered: s.answers.filter(Boolean).length, score: s.answers.filter(a => a && a.correct).length };
      },
      on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; },
      start() {}, stop() {}, pump() {},
      destroy() {
        unlisten(); live.delete(rerender); document.removeEventListener('keydown', onKey);
        root.remove(); if (host) host.remove();
        if (shellEl) shellEl.classList.remove('is-quiz-card', 'quiz-snap');
      },
    };
    return api;
  }

  /* ---- the step: what a page writes ----
     A whole step, so the page cannot forget the part that matters: with every
     question off there is nothing to take, and the step is not in the lesson
     at all. Review brings it back. */
  const activeOf = qs => (qs || []).filter(q => q && q.active !== false);
  function step(o = {}) {
    let quiz = null;
    const me = {
      eyebrow: o.eyebrow || 'Check yourself', title: o.title || 'Quick check', body: o.body || '',
      short: 'Quiz',
      hidden: () => !review && !activeOf(o.questions).length,
      onEnter(ctx) {
        ctx.ui.controls('<div class="quiz-host"></div>');
        const at = () => (global.LessonShell && global.LessonShell.current ? global.LessonShell.current.steps.indexOf(me) : -1);
        quiz = mount(ctx.ui.q('.quiz-host'), Object.assign({ title: me.title, back: () => ctx.goTo(at() - 1), canBack: () => at() > 0 }, o));
        if (o.onMount) o.onMount(quiz);
      },
      onExit() { if (quiz) quiz.destroy(); quiz = null; },
    };
    return me;
  }

  /* ---- the builder's half: switch a question in its own literal ----
     Finds the question's text as a string literal exactly once, walks out to
     the object literal holding it, and returns that literal with any old
     `active` set: removed when on, `active: false` when off. A scanner, not a parser: it knows strings, template
     literals and comments, which is all a generated page's data uses. */
  function activation(src, q, on) {
    const lits = [];
    for (const quote of ["'", '"', '`']) {
      const body = q.replace(/\\/g, '\\\\').split(quote).join('\\' + quote);
      for (const b of new Set([body, q])) {
        const needle = quote + b + quote;
        for (let i = src.indexOf(needle); i >= 0; i = src.indexOf(needle, i + 1)) lits.push(i);
      }
    }
    const at = [...new Set(lits)];
    if (at.length !== 1) return null;
    const opens = [], spans = [];
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
      if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i + 2); if (i < 0) break; i++; continue; }
      if (c === "'" || c === '"' || c === '`') {
        for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
        continue;
      }
      if (c === '{') opens.push(i);
      else if (c === '}') { const o = opens.pop(); if (o != null && o < at[0] && i > at[0]) spans.push([o, i + 1]); }
    }
    if (!spans.length) return null;
    const [a, b] = spans[0];            // the innermost: closed first
    const find = src.slice(a, b);
    const bare = find.replace(/\s*active\s*:\s*(true|false)\s*,?/, '');
    const replace = on ? bare : '{ active: false,' + (/^\{\s/.test(bare) ? '' : ' ') + bare.slice(1);
    return { find, replace };
  }

  /* A quiz is copy, not a picture of anything: no rung, no size. */
  const Quiz = { mount, step, activation,
    SCALE: { rung: null, form: null, unit: null, exag: {}, down: {}, sceneUnits: [] } };
  global.Quiz = Quiz;
  if (typeof module === 'object' && module.exports) module.exports = Quiz;
})(typeof window !== 'undefined' ? window : globalThis);
