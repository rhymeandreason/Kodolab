/* What the four slides showed, and what the student makes of it: two questions, then a button
 * that takes them to her brain. The table's numbers are model.js's. Its state is the student's
 * answers, not bench state, so a timeline rebuild leaves it alone.
 *
 *   const conclude = createConclude({ onChange, onNext });
 *   conclude.open() · close() · reset() · solved() · tries() · isOpen · el */
import { T, fmt } from '../lab.js';
import { TUBES } from './model.js';

const C = T.conclude;
const seen = (t) => (t.lysed > 0.5 ? C.seen.burst : fmt(Math.abs(t.volume - 1) < 0.03 ? C.seen.normal : t.volume > 1 ? C.seen.swollen : C.seen.shrunken, { pct: Math.round(Math.abs(t.volume - 1) * 100) }));

export function createConclude({ onChange = () => {}, onNext = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'panel calf-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="panel-head">
      <span class="panel-title"><i class="ph ph-drop"></i><span>${C.title}</span></span>
    </div>
    <div class="cp-body">
      <table class="cp-table"><thead><tr>${C.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>
        ${TUBES.map((t) => `<tr class="${t.key === 'plasma' ? 'flag' : ''}"><th>${T.tubes[t.key].label}</th><td>${seen(t)}</td></tr>`).join('')}
      </tbody></table>
      ${C.questions.map((q, i) => `
        <div class="cp-ask" data-q="${i}">
          <p class="cp-q">${q.text}</p>
          <div class="cp-pick long">${q.options.map((o, j) => `<button data-o="${j}">${o.text}</button>`).join('')}</div>
          <p class="cp-note cp-feedback"></p>
        </div>`).join('')}
      <button type="button" class="rx-give cp-next"><i class="ph-fill ph-arrow-right"></i>${C.next}</button>
    </div>`;
  document.getElementById('app').appendChild(el);
  const asks = [...el.querySelectorAll('.cp-ask')], next = el.querySelector('.cp-next');
  let picks = C.questions.map(() => -1), tries = 0;
  const right = (i) => picks[i] >= 0 && !!C.questions[i].options[picks[i]].right;
  const solved = () => picks.every((_, i) => right(i));

  function paint() {
    asks.forEach((box, i) => {
      box.hidden = i > 0 && !right(i - 1);   // one question at a time
      const o = C.questions[i].options[picks[i]];
      box.querySelectorAll('button').forEach((b, j) => {
        b.classList.toggle('right', j === picks[i] && right(i));
        b.classList.toggle('wrong', j === picks[i] && !right(i));
      });
      box.querySelector('.cp-feedback').innerHTML = o ? o.feedback : '';
    });
    next.hidden = !solved();
  }
  asks.forEach((box, i) => box.querySelector('.cp-pick').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || right(i)) return;
    picks[i] = Number(b.dataset.o); tries++;
    paint(); onChange();
  }));
  next.addEventListener('click', () => onNext());
  paint();

  return {
    el,
    get isOpen() { return !el.hidden; },
    open() { el.hidden = false; onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    reset() { picks = C.questions.map(() => -1); tries = 0; paint(); el.hidden = true; },
    solved, tries: () => tries,
  };
}
