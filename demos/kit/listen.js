/* =============================================================================
 *  kit/listen.js — a lesson, narrated
 * =============================================================================
 *  The voice behind kit/lesson-shell.js's Listen button: the lesson read
 *  aloud as chapters, one per step, the way an audiobook reads, with the
 *  scene toured and its live events spoken. Browser speech (speechSynthesis),
 *  not recordings, because a simulation's narration has to say numbers that
 *  only exist at run time: "60°C", "about 3 hydrogen bonds each".
 *
 *      const L = Listen.create({ onLine, onState });
 *      L.chapter([ 'A sentence.', { say, el, then }, { pause: 600 },
 *                  { run: fn }, { wait: 'Press Space to go on.' } ]);
 *      L.comment('A hydrogen bond just broke.');   // only while a chapter waits
 *      L.comment('8 water molecules.', { force:true })   // a reply to the student: no gap
 *      L.pause() · L.resume() · L.toggle() · L.back() · L.go() · L.stop()
 *      L.rate = 1.2;   L.state   // 'off' | 'speaking' | 'paused' | 'waiting' | 'done'
 *
 *  A beat is a string, or `{ say, el, then }` (`el` is the panel element being
 *  read, which the shell highlights; `then` runs as the line starts), `{ pause }`
 *  in ms, `{ run }` for a side effect, or `{ wait }`, which holds the chapter
 *  until `go()` and speaks its prompt. `say` may be a function, read when the
 *  beat is reached, so a number is the sim's at that moment.
 *
 *  ONE UTTERANCE PER SENTENCE. Chrome drops a long utterance about fifteen
 *  seconds in, and "back one sentence" needs sentences to go back to. Pause
 *  cancels and re-speaks the sentence on resume, because speechSynthesis.pause
 *  is unreliable across browsers and a half-sentence resume is worse anyway.
 *
 *  `comment()` speaks only while a chapter is waiting on the student, and no
 *  more than once per `commentGap` ms: commentary over the narration is two
 *  voices at once, and a liquid produces an event every frame.
 *
 *  `speakable()` rewrites what speech engines misread: δ−, H₂O, °C, Na⁺.
 * ========================================================================== */
(function (global) {
  'use strict';

  const SUB = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9' };
  const WORDS = [
    [/δ\s?[−-]/g, 'partial negative'], [/δ\s?\+/g, 'partial positive'],
    [/H₂O/g, 'H 2 O'], [/CO₂/g, 'C O 2'], [/NaCl/g, 'sodium chloride'],
    [/Na⁺/g, 'sodium ion'], [/Cl⁻/g, 'chloride ion'], [/O–H/g, 'O H'],
    [/(-?\d+(?:\.\d+)?)\s?°C/g, '$1 degrees Celsius'], [/(\d+(?:\.\d+)?)°/g, '$1 degrees'],
    [/H-bonds/g, 'hydrogen bonds'], [/H-bond/g, 'hydrogen bond'], [/ & /g, ' and '],
    [/ · /g, '. '],
  ];
  function speakable(text) {
    let t = String(text || '').replace(/<[^>]+>/g, '');
    for (const [re, to] of WORDS) t = t.replace(re, to);
    return t.replace(/[₀-₉]/g, c => SUB[c]).replace(/\s+/g, ' ').trim();
  }
  function sentences(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    if (!t) return [];
    /* A sentence ends at . ! or ? followed by a space or the end, so 104.5°
       and "e.g." mid-word stay whole. */
    return (t.match(/(?:[^.!?]|[.!?]+(?=[^\s.!?]))+(?:[.!?]+["”’)]*)?(?=\s|$)\s*/g) || [t]).map(s => s.trim()).filter(Boolean);
  }

  /* The best voice the device offers in the page's language: a local one,
     and among those the enhanced or premium voices macOS and iOS ship. */
  function pickVoice() {
    const all = global.speechSynthesis ? speechSynthesis.getVoices() : [];
    const lang = (document.documentElement.lang || 'en').toLowerCase();
    const mine = all.filter(v => v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
    const score = v => (v.localService ? 4 : 0) + (/premium|enhanced|natural/i.test(v.name) ? 8 : 0)
      + (/^(Samantha|Ava|Allison|Susan|Karen|Daniel|Google US English)/.test(v.name) ? 2 : 0)
      + (v.lang.toLowerCase() === lang || v.lang.toLowerCase() === 'en-us' ? 1 : 0);
    return mine.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function create(opts = {}) {
    const synth = global.speechSynthesis;
    const onLine = opts.onLine || (() => {});
    const onState = opts.onState || (() => {});
    const commentGap = opts.commentGap || 6000;
    let voice = null;
    if (synth) {
      voice = pickVoice();
      synth.addEventListener && synth.addEventListener('voiceschanged', () => { voice = pickVoice(); });
    }

    let lines = [];        // the chapter flattened: one entry per sentence, pause, run or wait
    let at = 0, token = 0, state = 'off', lastComment = -1e9, waitRelease = null, utter = null, commenting = false;

    function set(s) { state = s; onState(s); }
    function flatten(beats) {
      const out = [];
      for (const b of beats || []) {
        if (b == null) continue;
        if (typeof b === 'string' || typeof b === 'function') { out.push({ say: b }); continue; }
        if (b.say != null && typeof b.say !== 'function') {
          sentences(b.say).forEach((s, k) => out.push({ say: s, el: b.el, then: k === 0 ? b.then : null }));
        } else out.push(b);
      }
      return out;
    }
    function speak(text, my) {
      return new Promise(done => {
        if (!synth || !text) { done(); return; }
        const u = new SpeechSynthesisUtterance(speakable(text));
        if (voice) u.voice = voice;
        u.rate = api.rate;
        let started = false, finished = false;
        const t0 = performance.now();
        const finish = () => { if (finished) return; finished = true; clearInterval(guard); done(); };
        u.onstart = () => { started = true; };
        u.onend = u.onerror = finish;
        utter = u;
        synth.speak(u);
        /* Safari sometimes never fires onend for a cancelled utterance, and an
           engine with no voice never starts one. */
        const guard = setInterval(() => {
          const late = performance.now() - t0 > 4000 + 120 * text.length / api.rate;   // generous for the longest sentence
          if (my !== token || (!started && performance.now() - t0 > 4000) || late) finish();
        }, 250);
      });
    }

    async function run(my) {
      while (my === token && at < lines.length) {
        if (state === 'paused') return;
        const b = lines[at];
        if (b.pause) { await new Promise(r => setTimeout(r, b.pause)); }
        else if (b.run) { b.run(); }
        else if (b.wait != null) {
          set('waiting');
          onLine(b.wait, null);
          if (b.wait) await speak(b.wait, my);
          if (my !== token) return;
          await new Promise(r => { waitRelease = r; });
          waitRelease = null;
          if (my !== token) return;
          set('speaking');
        } else {
          const text = typeof b.say === 'function' ? b.say() : b.say;
          if (b.then) b.then();
          for (const s of typeof b.say === 'function' ? sentences(text) : [text]) {
            onLine(s, b.el || null);
            await speak(s, my);
            if (my !== token || state === 'paused') return;
          }
        }
        if (my !== token || state === 'paused') return;
        at++;
      }
      if (my === token) { onLine('', null); set('done'); }
    }

    const api = {
      rate: opts.rate || 1,
      get state() { return state; },
      get supported() { return !!synth; },
      chapter(beats) {
        token++;
        if (synth) synth.cancel();
        if (waitRelease) waitRelease();
        lines = flatten(beats); at = 0;
        set('speaking');
        run(token);
      },
      /* `force` skips the gap, for the answer to something the student just
         did (a button press); it still never talks over the narration. */
      comment(text, o = {}) {
        if (state !== 'waiting' && state !== 'done') return false;
        const now = performance.now();
        /* Its own flag, not synth.speaking: Chromium leaves that true after a
           cancelled line, and every comment after it was dropped. */
        if (!o.force && (now - lastComment < commentGap || commenting)) return false;
        if (o.force && synth) synth.cancel();
        lastComment = now; commenting = true;
        onLine(text, null);
        speak(text, token).then(() => { commenting = false; });
        return true;
      },
      pause() {
        if (state !== 'speaking') return;
        token++; set('paused');
        if (synth) synth.cancel();
      },
      resume() {
        if (state !== 'paused') return;
        set('speaking');
        run(++token);
      },
      toggle() { if (state === 'paused') api.resume(); else if (state === 'speaking') api.pause(); },
      /* Back one sentence: to the start of the line before the one in play. */
      back() {
        let k = Math.max(0, at - 1);
        while (k > 0 && !(lines[k].say != null)) k--;
        token++; if (synth) synth.cancel(); if (waitRelease) waitRelease();
        at = k; set('speaking'); run(token);
      },
      go() { if (waitRelease) waitRelease(); },
      stop() {
        token++; lines = []; at = 0;
        if (synth) synth.cancel();
        if (waitRelease) waitRelease();
        onLine('', null);
        set('off');
      },
    };
    return api;
  }

  global.Listen = { create, speakable, sentences };
})(typeof globalThis !== 'undefined' ? globalThis : this);
