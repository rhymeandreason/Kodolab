/* Juniper herself, under the procedure list: her pose and her blood Na⁺, from whatever the bench
 * and the drip say now. Seizing cycles the art the way the intro card does (trembling rest, a
 * rigid tonic arch, then paddling), faster when she is getting worse.
 *
 *   const patient = createPatient();
 *   patient.set({ pose: 'seizing' | 'worse' | 'sternal' | 'standing', na })   // cheap: repaints on change
 *   patient.el */
import { T, fmt } from '../lab.js';

const P = T.patient;
const src = (f) => new URL(`art/calf-${f}.webp`, import.meta.url).href;
const FRAMES = ['rest-1', 'rest-2', 'tonic', 'clonic-1', 'clonic-2', 'clonic-3', 'sternal', 'standing'];
const REST = 3200, TONIC = 1600, CLONIC = 5200;

/** A seizing frame at t ms; `fast` shortens the rest between seizures. */
function seizeFrame(t, fast) {
  const rest = fast ? REST / 3 : REST, total = rest + TONIC + CLONIC;
  t %= total;
  if (t < rest) return Math.floor(t / 170) % 2 ? 'rest-2' : 'rest-1';
  if (t < rest + TONIC) return 'tonic';
  return 'clonic-' + (Math.floor((t - rest - TONIC) / 190) % 3 + 1);
}

export function createPatient() {
  FRAMES.forEach((f) => { new Image().src = src(f); });
  const el = document.createElement('aside');
  el.className = 'panel patient';
  el.innerHTML = `
    <div class="calf-art"><div class="crop"><img alt=""></div></div>
    <div class="pt-row"><b class="pt-pose"></b><span class="pt-na"></span></div>`;
  document.getElementById('app').appendChild(el);
  const img = el.querySelector('img'), poseEl = el.querySelector('.pt-pose'), naEl = el.querySelector('.pt-na');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let pose = '', na = null, shown = '';
  const t0 = performance.now();

  function frame() {
    const f = pose === 'sternal' || pose === 'standing' ? pose : still ? 'rest-1' : seizeFrame(performance.now() - t0, pose === 'worse');
    if (f !== shown) { shown = f; img.src = src(f); }
  }
  setInterval(() => { if (!el.hidden && (pose === 'seizing' || pose === 'worse')) frame(); }, 40);

  return {
    el,
    set(st) {
      if (st.pose !== pose) {
        pose = st.pose;
        poseEl.textContent = P.poses[pose];
        img.alt = P.alt[pose === 'worse' ? 'seizing' : pose];
        el.dataset.pose = pose;
        frame();
      }
      const n = Math.round(st.na);
      if (n !== na) { na = n; naEl.innerHTML = fmt(P.na, { na: n }); }
    },
  };
}
