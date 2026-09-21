/* =============================================================================
 *  respiration/etc-by-hand.js — one glucose's carriers, sent into the chain by hand
 * =============================================================================
 *      const hand = EtcByHand.create(chemi, { protons, onDone });
 *      somewhere.appendChild(hand.el);
 *      hand.start();      // shows the controls and starts counting
 *      hand.reset();      // an empty chain, no gradient, nothing sent
 *
 *  `chemi` is a mounted ElectronTransport. `protons` is the `contents` a reset
 *  restores; equal on both sides, so the gradient starts at zero. `onDone`
 *  runs once per load, the first time the chain has made a glucose's worth.
 *
 *  The supply is off, so nothing moves until the student sends a carrier. A
 *  button comes back when the sim says the beat is over, read off state(),
 *  never on a timer that could drift from it.
 *
 *  Used by respiration-lab.html and etc-sim.html. The styles are
 *  respiration/etc-by-hand.css.
 * ========================================================================== */
(function (global) {
'use strict';

/* One glucose's carriers: 2 NADH from the link step and 6 from Krebs at complex I;
   then glycolysis's 2 NADH last, which reach ubiquinone by the glycerol-phosphate
   shuttle (feed's `shuttle`, a turn of II); 2 FADH₂ from Krebs. */
const GLUCOSE = { NADH: 10, FADH2: 2 }, SHUTTLED = 2;
const NAME = { NADH: 'NADH', FADH2: 'FADH₂' };

function create(chemi, opts = {}) {
  const protons = opts.protons;
  const el = document.createElement('div');
  el.className = 'etc';
  el.hidden = true;
  el.innerHTML = '<div class="tally"><span><b data-k="NADH">0</b> NADH used</span><span><b data-k="FADH2">0</b> FADH₂ used</span><span><b data-k="ATP">0</b> ATP made</span></div>'
    + '<div class="etc-btns"><button class="cta" type="button" data-fuel="NADH"></button><button class="cta" type="button" data-fuel="FADH2"></button><p class="etc-done" hidden>Completed!</p></div>'
    + '<p class="etc-note">* The last two NADH are from glycolysis, made in the cytosol.</p>';

  /* Carriers put on stage. Each click is one molecule the student sees rise
     out of the matrix; the component queues it at its complex, and refuses
     one when the queue is full, which is when the button goes grey. */
  const sent = { NADH: 0, FADH2: 0 };
  const shuttleNext = () => sent.NADH >= GLUCOSE.NADH - SHUTTLED;
  const doorOf = f => f === 'FADH2' || shuttleNext() ? 'II' : 'I';

  /* Counted from start(). A complex's turns reset whenever the chain is
     reset, so the tally adds deltas and treats a drop as a fresh start. One
     turn of I is one NADH; a turn of II is a Krebs FADH₂ or a shuttled
     glycolysis NADH*, told apart only for display. */
  const tally = { I: 0, II: 0, ATP: 0 };
  let seen = null, completed = false, timer = 0;
  function count() {
    const st = chemi.state();
    const now = { I: st.complexes ? st.complexes.I.turns : null, II: st.complexes ? st.complexes.II.turns : null, ATP: st.atpMade };
    if (seen) for (const k in tally) {
      if (now[k] == null) continue;
      const was = seen[k] == null || now[k] < seen[k] ? now[k] : seen[k];
      tally[k] += now[k] - was;
    }
    seen = now;
    /* II's turns beyond the FADH₂ sent were shuttled NADH* */
    const star = Math.min(Math.max(0, sent.NADH - (GLUCOSE.NADH - SHUTTLED)), Math.max(0, tally.II - sent.FADH2));
    const shown = { NADH: tally.I + star, FADH2: tally.II - star, ATP: tally.ATP };
    for (const b of el.querySelectorAll('.tally b')) if (b.textContent !== String(shown[b.dataset.k])) b.textContent = shown[b.dataset.k];
    buttons(st, shown);
  }
  /* A glucose's ATP, read off the chain: protons from the carriers, over what one ATP costs to make and export. */
  function glucoseATP(st) {
    const pf = st.protonsPerFuel, so = st.stoichiometry;
    if (!pf || !so) return null;
    const n = (GLUCOSE.NADH - SHUTTLED) * pf.NADH + (SHUTTLED + GLUCOSE.FADH2) * pf.FADH2;
    return Math.floor(n / (so.protonsPerATP + so.protonsPerExport));
  }
  function buttons(st = chemi.state(), shown) {
    const w = st.waiting || {};
    const goal = glucoseATP(st);
    const done = !!shown && goal != null && shown.ATP >= goal && sent.NADH >= GLUCOSE.NADH && sent.FADH2 >= GLUCOSE.FADH2;
    const doneEl = el.querySelector('.etc-done');
    if (doneEl.hidden === done) doneEl.hidden = !done;
    if (done && !completed) { completed = true; if (opts.onDone) opts.onDone(); }
    const note = el.querySelector('.etc-note');
    if (note.hidden !== done) note.hidden = done;
    for (const b of el.querySelectorAll('button[data-fuel]')) {
      const f = b.dataset.fuel, left = GLUCOSE[f] - sent[f];
      /* Written only on change: Safari drops a click whose button was rewritten between press and release, and count() runs every 250 ms. */
      const star = f === 'NADH' && shuttleNext() ? '*' : '';
      const text = `Send ${NAME[f]}${star} (${left} left)`, off = left <= 0 || (w[doorOf(f)] || 0) >= w.max;
      if (b.textContent !== text) b.textContent = text;
      if (b.disabled !== off) b.disabled = off;
      if (b.hidden !== done) b.hidden = done;
    }
  }
  el.addEventListener('click', ev => {
    const b = ev.target.closest('button[data-fuel]');
    if (!b || b.disabled) return;
    const f = b.dataset.fuel;
    chemi.set({ fuel: null });
    if (!chemi.feed(f, { shuttle: f === 'NADH' && shuttleNext() })) return;
    sent[f]++;
    buttons();
  });

  function reset() {
    chemi.set({ fuel: null }); chemi.reset();
    if (protons) chemi.set({ contents: protons });
    for (const k in tally) tally[k] = 0;
    for (const k in sent) sent[k] = 0;
    seen = null;
    if (timer) count();
  }
  function start() {
    el.hidden = false;
    count();
    if (!timer) timer = setInterval(count, 250);
  }
  return { el, start, reset };
}

global.EtcByHand = { create };
})(window);
