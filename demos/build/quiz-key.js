/* =============================================================================
 *  build/quiz-key.js — the teacher's answer-key dialog, in the builder
 * =============================================================================
 *  A quiz in the app posts its questions (quiz/quiz.js, `app-quiz-list` on
 *  every paint, `app-quiz-open` from its bar); this lays them out with each
 *  key in view, and a tick per question. Save turns the ticks that changed
 *  into text edits, `Quiz.approval` writing or removing the hash, all in one
 *  version. Nothing here can make a question pass that the frame did not
 *  send with its hash, and the hash is the frame's own reading of the page.
 *
 *      const key = QuizKey.create({ dialog, source: () => html,
 *                                   save: (edits, summary) => …, ask: text => … });
 *      key.take(message);       // every app-quiz-list / app-quiz-open
 *
 *  `ask` is the way out for a key that is wrong: the fix is a model turn,
 *  pointed at the question, not a field to type over.
 * ========================================================================== */
const QuizKey = (() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function create({ dialog, source, save, ask }) {
    const lists = new Map();         // quiz id -> its questions, latest first
    let ticks = new Map();           // hash -> wanted state, only where it differs
    const all = () => [...lists.values()].flat();

    function row(q, k) {
      const on = ticks.has(q.hash) ? ticks.get(q.hash) : q.passed;
      const key = q.kind === 'find'
        ? `<p class="qk-find"><i class="ph-bold ph-cursor-click"></i><span>Answered by clicking <strong>${esc(q.part)}</strong> on the model</span></p>`
        : '<ul class="qk-choices">' + q.choices.map((c, i) => i === q.answer
            ? `<li class="right"><i class="ph-bold ph-check"></i>${esc(c)}</li>` : `<li>${esc(c)}</li>`).join('') + '</ul>';
      return `<li class="qk-row${on ? ' on' : ''}">`
        + `<span class="qk-n">${k + 1}</span>`
        + `<div class="qk-body"><p class="qk-q">${esc(q.q)}</p>${key}`
        + (q.why ? `<p class="qk-why"><span>Then it says</span>${esc(q.why)}</p>` : '')
        + `<button type="button" class="btn btn--text qk-ask" data-k="${k}"><i class="ph-bold ph-chat-circle-text"></i>Ask for a fix</button></div>`
        + `<label class="qk-tick"><input type="checkbox" data-h="${esc(q.hash)}"${on ? ' checked' : ''}><span>${on ? 'Correct' : 'Mark correct'}</span></label>`
        + '</li>';
    }

    function paint() {
      const qs = all();
      const on = qs.filter(q => (ticks.has(q.hash) ? ticks.get(q.hash) : q.passed)).length;
      dialog.innerHTML = `<header class="qk-head"><div><h2>Check the answer key</h2>`
        + `<p>Students see a question only once you mark it correct. If the app changes a question later, it comes back here unchecked.</p></div>`
        + `<span class="qk-tally"><strong>${on}</strong> of ${qs.length}</span></header>`
        + `<ol class="qk-list">${qs.map(row).join('')}</ol>`
        + `<footer class="qk-foot"><button type="button" class="btn btn--text qk-all"${on === qs.length ? ' disabled' : ''}>Mark all correct</button><span class="spacer"></span>`
        + `<button type="button" class="btn btn--ink qk-cancel">Cancel</button>`
        + `<button type="button" class="btn btn--fill qk-save"${ticks.size ? '' : ' disabled'}>Save${ticks.size ? ` ${ticks.size} change${ticks.size === 1 ? '' : 's'}` : ''}</button></footer>`;
    }

    /* A tick repaints only what it changes: rebuilding the list would throw
       the teacher back to the top of it. */
    function refresh() {
      const qs = all(), wanted = q => (ticks.has(q.hash) ? ticks.get(q.hash) : q.passed);
      const on = qs.filter(wanted).length;
      dialog.querySelectorAll('input[data-h]').forEach(b => {
        const q = qs.find(x => x.hash === b.dataset.h), w = q && wanted(q);
        b.checked = !!w; b.closest('.qk-row').classList.toggle('on', !!w);
        b.nextElementSibling.textContent = w ? 'Correct' : 'Mark correct';
      });
      dialog.querySelector('.qk-tally strong').textContent = on;
      dialog.querySelector('.qk-all').disabled = on === qs.length;
      const sv = dialog.querySelector('.qk-save');
      sv.disabled = !ticks.size;
      sv.textContent = 'Save' + (ticks.size ? ` ${ticks.size} change${ticks.size === 1 ? '' : 's'}` : '');
    }

    function tick(hash, want) {
      const q = all().find(x => x.hash === hash);
      if (!q) return;
      if (want === q.passed) ticks.delete(hash); else ticks.set(hash, want);
    }

    dialog.addEventListener('change', e => { const b = e.target.closest('input[data-h]'); if (b) { tick(b.dataset.h, b.checked); refresh(); } });
    dialog.addEventListener('click', e => {
      if (e.target === dialog) return dialog.close();               // the backdrop
      const t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('qk-cancel')) return dialog.close();
      if (t.classList.contains('qk-all')) { all().forEach(q => tick(q.hash, true)); return refresh(); }
      if (t.classList.contains('qk-ask')) { const q = all()[+t.dataset.k]; dialog.close(); return ask(`In the quiz, the question "${q.q}": `); }
      if (t.classList.contains('qk-save')) return commit(t);
    });
    dialog.addEventListener('close', () => { ticks = new Map(); });

    async function commit(btn) {
      const src = source(), edits = [];
      let up = 0, down = 0;
      for (const [hash, want] of ticks) {
        const q = all().find(x => x.hash === hash);
        const pair = q && Quiz.approval(src, q.q, want ? hash : null);
        if (!pair) { btn.textContent = 'A question could not be found in the page once'; return; }
        edits.push(pair); want ? up++ : down++;
      }
      btn.disabled = true; btn.textContent = 'Saving…';
      const said = [up && `${up} checked`, down && `${down} unchecked`].filter(Boolean).join(', ');
      try { await save(edits, `quiz key: ${said}`); dialog.close(); }
      catch (err) { btn.disabled = false; btn.textContent = 'Save failed, try again'; }
    }

    return {
      take(msg) {
        if (!msg || !Array.isArray(msg.questions)) return;
        lists.set(String(msg.id || 'quiz'), msg.questions);
        if (msg.type === 'app-quiz-open') { ticks = new Map(); paint(); if (!dialog.open) dialog.showModal(); }
        else if (dialog.open) paint();
      },
      reset() { lists.clear(); },
    };
  }
  return { create };
})();
