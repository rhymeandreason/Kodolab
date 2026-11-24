/* The prescription: a fluid, a volume and a prediction, then six hours on the drip. Every run
 * is kept with its prediction and model.js's outcome, so the student can compare. Only a run
 * that is 'safe' solves it. State is the student's, not bench state: a rebuild leaves it alone.
 *
 *   const rx = createRx({ onChange, onGive });
 *   rx.open(fluid?) · close() · reset() · isOpen · el
 *   rx.pending        the run submitted and not yet played, or null
 *   rx.choice()       what the drip plays: pending, else the last safe run, else SAFE_RX
 *   rx.played()       the drip finished: file pending under the runs; true if it was safe
 *   rx.solved() · rx.runs() */
import { T, fmt } from '../lab.js';
import { FLUIDS, VOLUMES, JUNIPER, SAFE_RX, SAFE_24H, RX_HOURS, RATE, rxNa, outcome } from './model.js';

const R = T.rx;
const PREDICT = ['worse', 'barely', 'safe', 'over'];
export const fluidName = (k) => R.fluids[k].name;
export const volText = (v) => fmt(R.vol, { ml: Math.round(v * 1000) });

/** The sentence for a run's outcome, its numbers from the model. */
export function outcomeText(rx) {
  const to = rxNa(rx, RX_HOURS), d = to - JUNIPER.na;
  return fmt(R.outcomes[outcome(rx)], { to: to.toFixed(0), d: d.toFixed(0), limit: SAFE_24H, h: Math.round(rx.vol * 1000 / RATE) });
}

export function createRx({ onChange = () => {}, onGive = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'panel calf-panel rx-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-syringe"></i><span>${R.title}</span></span></div>
    <div class="cp-body">
      <div class="rx-last" aria-live="polite"></div>
      <p class="cp-note">${R.lead}</p>
      <div class="rx-label">${R.fluid}</div>
      <div class="rx-fluids">${FLUIDS.map((f) => `<button type="button" data-f="${f.key}"><i style="background:${R.fluids[f.key].band}"></i><span><b>${R.fluids[f.key].name}</b><small>${fmt(R.fluids[f.key].desc, { na: f.na })}</small></span></button>`).join('')}</div>
      <div class="rx-label">${R.volume}</div>
      <div class="rx-seg">${VOLUMES.map((v) => `<button type="button" data-v="${v}">${volText(v)}</button>`).join('')}</div>
      <p class="cp-q">${R.predictQ}</p>
      <div class="cp-pick rx-predict">${PREDICT.map((p) => `<button type="button" data-p="${p}">${R.predict[p]}</button>`).join('')}</div>
      <button type="button" class="rx-give"><i class="ph-fill ph-play"></i>${R.give}</button>
      <p class="cp-note rx-need"></p>
      <div class="rx-runs"></div>
    </div>`;
  document.getElementById('app').appendChild(el);
  const $ = (s) => el.querySelector(s);
  let fluid = null, vol = VOLUMES[0], predict = null, runs = [], pending = null, solved = false;

  function paint() {
    el.querySelectorAll('.rx-fluids button').forEach((b) => b.classList.toggle('on', b.dataset.f === fluid));
    el.querySelectorAll('.rx-seg button').forEach((b) => b.classList.toggle('on', Number(b.dataset.v) === vol));
    el.querySelectorAll('.rx-predict button').forEach((b) => b.classList.toggle('on', b.dataset.p === predict));
    $('.rx-give').disabled = !fluid;
    const last = runs[runs.length - 1];
    $('.rx-last').innerHTML = last ? `<p class="rx-out ${last.out}">${outcomeText(last)}${last.out !== 'safe' ? ` ${R.retry}` : ''}</p>` : '';
    $('.rx-runs').innerHTML = runs.length ? `<div class="rx-label">${R.tried}</div>` + runs.map((r) => {
      const ok = r.predict === r.out;
      return `<div class="rx-run ${r.out}"><b>${fmt(R.row, { fluid: fluidName(r.fluid), vol: volText(r.vol) })}</b>`
        + `<span>${fmt(R.move, { from: JUNIPER.na, to: rxNa(r, RX_HOURS).toFixed(0) })}</span>`
        + `<small class="${ok ? 'ok' : ''}"><i class="ph-bold ${ok ? 'ph-check' : 'ph-x'}"></i>${fmt(R.predicted, { p: R.predict[r.predict] })}</small></div>`;
    }).reverse().join('') : '';
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.f) fluid = b.dataset.f;
    else if (b.dataset.v) vol = Number(b.dataset.v);
    else if (b.dataset.p) predict = b.dataset.p;
    else if (b.classList.contains('rx-give')) {
      if (!predict) { $('.rx-need').textContent = R.need; return; }
      pending = { fluid, vol, predict };
      predict = null;
      $('.rx-need').textContent = '';
      paint();
      return onGive(pending);
    }
    $('.rx-need').textContent = '';
    paint(); onChange();
  });

  paint();
  const api = {
    el,
    get isOpen() { return !el.hidden; },
    get pending() { return pending; },
    open(f) { if (f) { fluid = f; paint(); } if (!el.hidden) return; el.hidden = false; onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    choice() { return pending || [...runs].reverse().find((r) => r.out === 'safe') || SAFE_RX; },
    played() {
      if (!pending) return true;
      const r = { ...pending, out: outcome(pending) };
      runs.push(r); pending = null;
      if (r.out === 'safe') solved = true;
      paint();
      return r.out === 'safe';
    },
    solved: () => solved,
    runs: () => runs,
    reset() { fluid = null; vol = VOLUMES[0]; predict = null; runs = []; pending = null; solved = false; $('.rx-need').textContent = ''; paint(); el.hidden = true; },
  };
  return api;
}
