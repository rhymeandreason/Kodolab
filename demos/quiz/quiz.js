/* =============================================================================
 *  quiz/quiz.js — a check at the end of a lesson, answered on the scene
 * =============================================================================
 *  Not a scene. It draws in the panel, like Graph, on the same contract. A
 *  page writes the step and never the mount:
 *
 *      steps: [ ..., Quiz.step({ scene: () => L, questions: [...] }) ]
 *
 *  The step is `hidden` while no question is checked, so a student never
 *  meets a quiz with nothing in it. Underneath, the step mounts:
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
 *  THE ANSWER KEY IS THE TEACHER'S, NOT THE MODEL'S. A model drafts the
 *  questions and cannot yet be trusted with a right answer, so a question
 *  reaches a student only once a teacher has passed it. Passing writes
 *  `approved: '<hash>'` into the question's own object literal, through the
 *  builder's text edit; the hash covers q, choices, answer, find and why. A
 *  question edited after it was passed hashes differently and is a draft
 *  again, so a model rewriting the page cannot carry an approval onto a key
 *  nobody read, and copying the field does nothing.
 *
 *  THE KEY IS CHECKED IN THE BUILDER, NOT HERE. When the builder answers the
 *  frame's `app-quiz-hello`, the panel keeps showing what a student sees and
 *  adds one bar: how many questions wait, and a button that posts the whole
 *  list (`app-quiz-open`) for build.html's dialog to lay out. The app stays
 *  the app; the teacher's tool is the builder's chrome. `?quiz=review` is the
 *  other door, for a bench or an eval with no builder: drafts become playable,
 *  tagged as drafts. Anywhere else a draft does not exist.
 *
 *  The score is reported once per attempt as the `quiz` event `/teach`
 *  already renders (docs/api.md, "Class codes"): straight to `Track` on a
 *  hand-built lesson, or posted to the parent from a sandboxed app, where
 *  build/app.html relays it.
 *
 *  `Quiz.approval(source, q, hash)` is the builder's half: the {find, replace}
 *  pair that writes the hash, or with a null hash takes it out.
 *  Node-loadable, no DOM at load.
 * ========================================================================== */
(function (global) {
  'use strict';

  const REACH = 56;            // px from a part's anchor that still counts as clicking it
  const DRAG = 5;              // px of pointer travel that makes a click an orbit

  /* FNV-1a, 32 bit, base 36. Not security: a fingerprint of the words a
     teacher read, so changing them unpasses the question. */
  function hashOf(q) {
    const s = JSON.stringify([q.q, q.choices || null, q.answer == null ? null : q.answer, q.find || null, q.why || null]);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

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
        all.push(Object.assign({}, q, { kind: kindOf(q), hash: hashOf(q), passed: q.approved === hashOf(q) }));
      }
      shown = review === 'link' ? all : all.filter(q => q.passed);
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

    /* ---- painting ---- */
    const dots = () => '<div class="quiz-dots">' + shown.map((_, k) => {
      const a = S().answers[k];
      return `<i class="${a ? (a.correct ? 'right' : 'wrong') : ''}${k === S().i ? ' now' : ''}"></i>`;
    }).join('') + '</div>';

    function paintQuestion() {
      const s = S(), q = shown[s.i], a = s.answers[s.i];
      const scene = sceneOf(q);
      let h = `<div class="quiz-head">${dots()}<span class="quiz-n">${s.i + 1} of ${shown.length}</span></div>`
        + (q.passed ? '' : '<span class="quiz-tag">Draft</span>')
        + `<p class="quiz-q">${esc(q.q)}</p>`;
      if (q.kind === 'choice') {
        h += '<div class="choices quiz-choices">' + q.choices.map((c, k) => {
          const cls = !a ? '' : k === q.answer ? ' right' : k === a.value ? ' wrong' : ' dim';
          return `<button type="button" class="choice${cls}" data-k="${k}"${a ? ' disabled' : ''}>${esc(c)}</button>`;
        }).join('') + '</div>';
      } else if (!a) {
        h += '<p class="quiz-hint">Click it on the model. Drag to turn it first if you need to.</p>'
          + '<p class="quiz-hint quiz-miss" hidden>Nothing there. Click right on the part.</p>';
      }
      if (a) {
        const right = q.kind === 'find' ? partName(q) : q.choices[q.answer];
        h += `<p class="callout quiz-verdict ${a.correct ? 'right' : 'wrong'}"><strong>${a.correct ? 'Right.' : 'Not quite.'}</strong> `
          + (a.correct ? '' : q.kind === 'find' ? `That was the ${esc(a.answer)}; this is the ${esc(right)}. ` : '')
          + esc(q.why || '') + '</p>'
          + `<button type="button" class="btn primary quiz-go">${s.i + 1 < shown.length ? 'Next question' : 'See your score'}</button>`;
      }
      root.innerHTML = h;
      root.querySelectorAll('.choice[data-k]').forEach(b => b.onclick = () => answer(+b.dataset.k === q.answer, +b.dataset.k, q.choices[+b.dataset.k]));
      const go = root.querySelector('.quiz-go');
      if (go) go.onclick = () => { if (s.done) s.scored = true; else s.i++; if (scene && scene.clearNotes) scene.clearNotes(); paint(); };
      if (q.kind === 'find' && !a) listen(q);
    }

    function paintScore() {
      const s = S(), score = s.answers.filter(a => a.correct).length;
      root.innerHTML = `<p class="quiz-score">${score}<small> / ${shown.length}</small></p>`
        + '<ol class="quiz-review">' + shown.map((q, k) => {
          const a = s.answers[k];
          return `<li class="${a.correct ? 'right' : 'wrong'}"><span class="quiz-q-sm">${esc(q.q)}</span>`
            + `<span class="quiz-a">${a.correct ? '' : '<s>' + esc(a.answer) + '</s> '}`
            + esc(q.kind === 'find' ? partName(q) : q.choices[q.answer]) + '</span></li>';
        }).join('') + '</ol>'
        + '<button type="button" class="btn ghost quiz-again">Try again</button>';
      root.querySelector('.quiz-again').onclick = () => { kept.set(P.id, { n: shown.length, i: 0, answers: [], done: false }); paint(); };
    }

    /* What the builder's dialog lays out: plain data, since it crosses the
       frame by postMessage. */
    const sheet = () => ({ type: 'app-quiz-list', id: P.id, questions: all.map(q => ({
      q: q.q, kind: q.kind, choices: q.choices || null, answer: q.answer == null ? null : q.answer,
      part: q.kind === 'find' ? partName(q) : null, why: q.why || '', hash: q.hash, passed: q.passed })) });
    const post = m => { try { global.parent.postMessage(m, '*'); } catch (_) {} };

    /* The teacher's bar, over what a student sees. */
    function bar() {
      if (review !== 'builder' || !all.length) return '';
      const n = all.length - shown.length;
      return `<div class="quiz-bar${n ? '' : ' done'}"><span>${n ? `<strong>${n} of ${all.length}</strong> need${n === 1 ? 's' : ''} your check before students see ${n === 1 ? 'it' : 'them'}.` : `All ${all.length} checked.`}</span>`
        + `<button type="button" class="quiz-open">${n ? 'Check key' : 'Review'}</button></div>`;
    }

    function paint() {
      unlisten();
      if (review === 'builder') post(sheet());
      if (!shown.length) root.innerHTML = bar() + `<p class="quiz-hint">${review === 'builder' ? 'Nothing here for students until you check a question.' : 'Your teacher has not checked these questions yet.'}</p>`;
      else if (S().scored) paintScore();
      else { if (S().i >= shown.length) S().i = 0; paintQuestion(); }
      if (shown.length && bar()) root.insertAdjacentHTML('afterbegin', bar());
      const o = root.querySelector('.quiz-open');
      if (o) o.onclick = () => post(Object.assign(sheet(), { type: 'app-quiz-open' }));
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
      destroy() { unlisten(); live.delete(rerender); root.remove(); },
    };
    return api;
  }

  /* ---- the step: what a page writes ----
     A whole step, so the page cannot forget the part that matters: with no
     question checked there is nothing to take, and the step is not in the
     lesson at all. Review brings it back. */
  const passedOf = qs => (qs || []).filter(q => q && q.approved && q.approved === hashOf(q));
  function step(o = {}) {
    let quiz = null;
    return {
      eyebrow: o.eyebrow || 'Check yourself', title: o.title || 'Quick check', body: o.body || '',
      short: 'Quiz',
      hidden: () => !review && !passedOf(o.questions).length,
      onEnter(ctx) {
        ctx.ui.controls('<div class="quiz-host"></div>');
        quiz = mount(ctx.ui.q('.quiz-host'), o);
        if (o.onMount) o.onMount(quiz);
      },
      onExit() { if (quiz) quiz.destroy(); quiz = null; },
    };
  }

  /* ---- the builder's half: write the hash into the question's literal ----
     Finds the question's text as a string literal exactly once, walks out to
     the object literal holding it, and returns that literal with any old
     `approved` replaced. A scanner, not a parser: it knows strings, template
     literals and comments, which is all a generated page's data uses. */
  function approval(src, q, hash) {
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
    const bare = find.replace(/\s*approved\s*:\s*(['"`])[^'"`]*\1\s*,?/, '');
    const replace = hash == null ? bare : '{ approved: \'' + hash + '\',' + (/^\{\s/.test(bare) ? '' : ' ') + bare.slice(1);
    return { find, replace };
  }

  /* A quiz is copy, not a picture of anything: no rung, no size. */
  const Quiz = { mount, step, approval, hash: hashOf,
    SCALE: { rung: null, form: null, unit: null, exag: {}, down: {}, sceneUnits: [] } };
  global.Quiz = Quiz;
  if (typeof module === 'object' && module.exports) module.exports = Quiz;
})(typeof window !== 'undefined' ? window : globalThis);
