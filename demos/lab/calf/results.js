/* The analyzer's results, read the way a vet reads a panel: each value against the calf range,
 * plasma osmolality worked out from them, then one question. Every number is model.js's. Its
 * state is the student's answer, not bench state, so a timeline rebuild leaves it alone.
 *
 *   const results = createResults({ onChange });
 *   results.open() · close() · reset() · solved() · isOpen · el */
import { T, fmt } from '../lab.js';
import { JUNIPER, REF, osmolality, CELL_OSM } from './model.js';

const R = T.results, A = T.analytes;
export const ROWS = ['na', 'k', 'cl', 'glucose', 'bun', 'pcv'];
export const flagOf = (k) => (JUNIPER[k] < REF[k][0] ? 'L' : JUNIPER[k] > REF[k][1] ? 'H' : '');

export function createResults({ onChange = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'panel calf-panel';
  el.hidden = true;
  const rows = ROWS.map((k) => {
    const f = flagOf(k);
    return `<tr class="${f ? 'flag' : ''}"><th>${A[k].full}</th><td>${JUNIPER[k]} <i>${A[k].unit}</i>${f ? ` <b>${f === 'L' ? R.low : R.high}</b>` : ''}</td><td>${REF[k][0]}–${REF[k][1]}</td></tr>`;
  }).join('');
  el.innerHTML = `
    <div class="panel-head">
      <span class="panel-title"><i class="ph ph-flask"></i><span>${R.title}</span></span>
      <button class="cp-close" aria-label="${R.close}"><i class="ph ph-x"></i></button>
    </div>
    <div class="cp-body">
      <table class="cp-table"><thead><tr>${R.cols.map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
      <p class="cp-note">${fmt(R.osm, { osm: Math.round(osmolality(JUNIPER)), healthy: Math.round(CELL_OSM) })}</p>
      <p class="cp-q">${R.question}</p>
      <div class="cp-pick">${R.options.map((o) => `<button data-k="${o.key}">${o.text}</button>`).join('')}</div>
      <p class="cp-note cp-feedback"></p>
    </div>`;
  document.getElementById('app').appendChild(el);
  const fb = el.querySelector('.cp-feedback');
  let answer = null;

  function paint() {
    el.querySelectorAll('.cp-pick button').forEach((b) => {
      b.classList.toggle('right', answer === b.dataset.k && b.dataset.k === 'na');
      b.classList.toggle('wrong', answer === b.dataset.k && b.dataset.k !== 'na');
    });
    const o = R.options.find((x) => x.key === answer);
    fb.innerHTML = o ? o.feedback : '';
  }
  el.querySelector('.cp-pick').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    answer = b.dataset.k; paint(); onChange();
  });
  el.querySelector('.cp-close').addEventListener('click', () => api.close());

  const api = {
    el,
    get isOpen() { return !el.hidden; },
    open() { el.hidden = false; onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    reset() { answer = null; paint(); el.hidden = true; },
    solved: () => answer === 'na',
  };
  return api;
}
