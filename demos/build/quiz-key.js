/* =============================================================================
 *  build/quiz-key.js — the teacher's quiz dialog, in the builder
 * =============================================================================
 *  A quiz in the app posts its questions (quiz/quiz.js, `app-quiz-list` on
 *  every paint, `app-quiz-open` from its bar); this lays them out with each
 *  answer in view and an Active switch per question. Every question starts
 *  active. Save turns the switches that changed into text edits,
 *  `Quiz.activation` writing or removing `active: false`, all in one version.
 *
 *      const key = QuizKey.create({ dialog, source: () => html,
 *                                   save: (edits, summary) => …, ask: text => … });
 *      key.take(message);       // every app-quiz-list / app-quiz-open
 *
 *  `ask` is the way out for an answer that is wrong: the fix is a model turn,
 *  pointed at the question, not a field to type over.
 * ========================================================================== */
const QuizKey = (() => {
  'use strict';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function create({ dialog, source, save, ask }) {
    const lists = new Map();         // quiz id -> its questions, latest first
    let flips = new Map();           // index into all() -> wanted state, only where it differs
    const all = () => [...lists.values()].flat();
    const wanted = (q, k) => (flips.has(k) ? flips.get(k) : q.on);
    const label = on => (on ? 'Active' : 'Inactive');

    function row(q, k) {
      const on = wanted(q, k);
      const key = q.kind === 'find'
        ? `<p class="qk-find"><i class="ph-bold ph-cursor-click"></i><span>Answered by clicking <strong>${esc(q.part)}</strong> on the model</span></p>`
        : '<ul class="qk-choices">' + q.choices.map((c, i) => i === q.answer
            ? `<li class="right"><i class="ph-bold ph-check"></i>${esc(c)}</li>` : `<li>${esc(c)}</li>`).join('') + '</ul>';
      return `<li class="qk-row${on ? ' on' : ''}">`
        + `<span class="qk-n">${k + 1}</span>`
        + `<div class="qk-body"><p class="qk-q">${esc(q.q)}</p>${key}`
        + (q.why ? `<p class="qk-why"><span>Then it says</span>${esc(q.why)}</p>` : '')
        + `<button type="button" class="btn btn--text qk-ask" data-k="${k}"><i class="ph-bold ph-chat-circle-text"></i>Ask for a fix</button></div>`
        + `<label class="qk-tick"><input type="checkbox" data-k="${k}"${on ? ' checked' : ''}><span>${label(on)}</span></label>`
        + '</li>';
    }

    function paint() {
      const qs = all();
      const on = qs.filter(wanted).length;
      dialog.innerHTML = `<header class="qk-head"><div><h2>Quiz questions</h2>`
        + `<p>Students see every active question. Switch one off to hide it from them.</p></div>`
        + `<span class="qk-tally"><strong>${on}</strong> of ${qs.length} active</span></header>`
        + `<ol class="qk-list">${qs.map(row).join('')}</ol>`
        + `<footer class="qk-foot"><button type="button" class="btn btn--text qk-all"${on === qs.length ? ' disabled' : ''}>Make all active</button><span class="spacer"></span>`
        + `<button type="button" class="btn btn--ink qk-cancel">Cancel</button>`
        + `<button type="button" class="btn btn--fill qk-save" disabled>Save</button></footer>`;
    }

    /* A switch repaints only what it changes: rebuilding the list would throw
       the teacher back to the top of it. */
    function refresh() {
      const qs = all();
      dialog.querySelectorAll('input[data-k]').forEach(b => {
        const w = wanted(qs[+b.dataset.k], +b.dataset.k);
        b.checked = w; b.closest('.qk-row').classList.toggle('on', w);
        b.nextElementSibling.textContent = label(w);
      });
      const on = qs.filter(wanted).length;
      dialog.querySelector('.qk-tally strong').textContent = on;
      dialog.querySelector('.qk-all').disabled = on === qs.length;
      const sv = dialog.querySelector('.qk-save');
      sv.disabled = !flips.size;
      sv.textContent = 'Save' + (flips.size ? ` ${flips.size} change${flips.size === 1 ? '' : 's'}` : '');
    }

    function flip(k, want) {
      const q = all()[k];
      if (!q) return;
      if (want === q.on) flips.delete(k); else flips.set(k, want);
    }

    dialog.addEventListener('change', e => { const b = e.target.closest('input[data-k]'); if (b) { flip(+b.dataset.k, b.checked); refresh(); } });
    dialog.addEventListener('click', e => {
      if (e.target === dialog) return dialog.close();               // the backdrop
      const t = e.target.closest('button'); if (!t) return;
      if (t.classList.contains('qk-cancel')) return dialog.close();
      if (t.classList.contains('qk-all')) { all().forEach((q, k) => flip(k, true)); return refresh(); }
      if (t.classList.contains('qk-ask')) { const q = all()[+t.dataset.k]; dialog.close(); return ask(`In the quiz, the question "${q.q}": `); }
      if (t.classList.contains('qk-save')) return commit(t);
    });
    dialog.addEventListener('close', () => { flips = new Map(); });

    async function commit(btn) {
      const src = source(), qs = all(), edits = [];
      let up = 0, down = 0;
      for (const [k, want] of flips) {
        const pair = Quiz.activation(src, qs[k].q, want);
        if (!pair) { btn.textContent = 'A question could not be found in the page once'; return; }
        edits.push(pair); want ? up++ : down++;
      }
      btn.disabled = true; btn.textContent = 'Saving…';
      const said = [up && `${up} made active`, down && `${down} made inactive`].filter(Boolean).join(', ');
      try { await save(edits, `quiz: ${said}`); dialog.close(); }
      catch (err) { btn.disabled = false; btn.textContent = 'Save failed, try again'; }
    }

    return {
      take(msg) {
        if (!msg || !Array.isArray(msg.questions)) return;
        lists.set(String(msg.id || 'quiz'), msg.questions);
        if (msg.type === 'app-quiz-open') { flips = new Map(); paint(); if (!dialog.open) dialog.showModal(); }
        else if (dialog.open) paint();
      },
      reset() { lists.clear(); },
    };
  }
  return { create };
})();
