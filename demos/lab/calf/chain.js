/* Explain it to Dana: the cause-and-effect chain, built from cards. Five true links in order and
 * two red herrings from her story. Click a card into the next empty place, click a placed card to
 * take it back. Check locks the correct leading run green and shows each locked card's evidence,
 * read from model.js, so a card says what the student measured, not what the text claims. The
 * first wrong place gets a hint pointing back to the evidence that belongs there.
 * State is the student's answer, not bench state: a rebuild leaves it alone.
 *
 *   const chain = createChain({ onChange });
 *   chain.open() · close() · reset() · solved() · tries() · isOpen · el */
import { T, fmt } from '../lab.js';
import { JUNIPER, HEALTHY_NA, plasmaOsm, TUBES, astroVolume } from './model.js';

const C = T.chain;
const ORDER = ['loss', 'water', 'swell', 'skull', 'seize'];
const HERRINGS = ['blanket', 'gate'];
const POOL = ['swell', 'gate', 'loss', 'seize', 'blanket', 'skull', 'water'];   // shuffled once, fixed
const pct = (v) => Math.round((v - 1) * 100);
const SLOTS = {
  na: JUNIPER.na,
  osm: Math.round(plasmaOsm(JUNIPER.na)),
  healthy: Math.round(plasmaOsm(HEALTHY_NA)),
  rbc: pct(TUBES.find((t) => t.key === 'plasma').volume),
  astro: pct(astroVolume(JUNIPER.na)),
};

export function createChain({ onChange = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'panel calf-panel chain-panel';
  el.hidden = true;
  el.innerHTML = `
    <div class="panel-head"><span class="panel-title"><i class="ph ph-link"></i><span>${C.title}</span></span></div>
    <div class="cp-body">
      <p class="cp-note">${C.lead}</p>
      <ol class="ch-slots"></ol>
      <div class="ch-pool"></div>
      <p class="cp-note ch-feedback" aria-live="polite"></p>
      <div class="ch-actions"><button class="ch-clear" type="button">${C.clear}</button><button class="ch-check" type="button">${C.check}</button></div>
    </div>`;
  document.getElementById('app').appendChild(el);
  const $ = (s) => el.querySelector(s);
  let placed = [], locked = 0, bad = -1, feedback = '', done = false, tries = 0;

  const cardHTML = (k, cls = '') => {
    const ev = locked > 0 && placed.indexOf(k) > -1 && placed.indexOf(k) < locked && C.cards[k].ev;
    return `<button type="button" class="ch-card ${cls}" data-k="${k}"><span>${C.cards[k].text}</span>${ev ? `<small>${fmt(ev, SLOTS)}</small>` : ''}</button>`;
  };
  function paint() {
    $('.ch-slots').innerHTML = ORDER.map((_, i) => {
      const k = placed[i];
      if (!k) return `<li class="ch-slot empty"><span>${fmt(C.slot, { n: i + 1 })}</span></li>`;
      return `<li class="ch-slot">${cardHTML(k, i < locked ? 'ok' : i === bad ? 'bad' : '')}</li>`;
    }).join('');
    $('.ch-pool').innerHTML = POOL.filter((k) => !placed.includes(k)).map((k) => cardHTML(k)).join('');
    $('.ch-feedback').innerHTML = feedback;
    $('.ch-check').disabled = done;
    $('.ch-clear').disabled = done || placed.length === locked;
    el.classList.toggle('solved', done);
  }
  el.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || done) return;
    if (b.classList.contains('ch-check')) return check();
    if (b.classList.contains('ch-clear')) { placed = placed.slice(0, locked); bad = -1; feedback = ''; paint(); return; }
    const k = b.dataset.k; if (!k) return;
    const at = placed.indexOf(k);
    if (at >= locked) placed.splice(at, 1);
    else if (at < 0 && placed.length < ORDER.length) placed.push(k);
    bad = -1;
    paint();
  });
  function check() {
    if (placed.length < ORDER.length) { feedback = C.full; paint(); return; }
    tries++;
    let i = 0;
    while (i < ORDER.length && placed[i] === ORDER[i]) i++;
    locked = i;
    bad = i < ORDER.length ? i : -1;
    if (bad < 0) { done = true; feedback = C.solved; }
    else feedback = fmt(C.hints[HERRINGS.includes(placed[i]) ? placed[i] : ORDER[i]], SLOTS);
    paint(); onChange();
  }

  paint();
  const api = {
    el,
    get isOpen() { return !el.hidden; },
    open() { if (!el.hidden) return; el.hidden = false; onChange(); },
    close() { if (el.hidden) return; el.hidden = true; onChange(); },
    reset() { placed = []; locked = 0; bad = -1; feedback = ''; done = false; tries = 0; paint(); el.hidden = true; },
    solved: () => done,
    tries: () => tries,
  };
  return api;
}
