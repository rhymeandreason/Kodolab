/* The microscope view: a drop from each tube at 400×, drawn from model.js's cell volume.
 *   v ≈ 1     biconcave discs, pale in the middle
 *   v > 1     swelling at constant membrane area rounds a cell up: narrower across, thicker,
 *             darker, the pale centre gone (a sphere of a red cell's area is ~85% of its width)
 *   v < 0.8   crenated: shrunken, with spikes (echinocytes)
 *   lysed     ghosts: pale empty membranes on a pink background of free hemoglobin
 * The student's progress (slides seen) is the panel's, not bench state.
 *
 *   const eye = createEyepiece({ onChange });
 *   eye.open() · close() · reset() · seen() · isOpen */
import { T, fmt, seeded } from '../lab.js';
import { TUBES } from './model.js';

const E = T.eyepiece;
const SPHERE_W = 0.85;   // width of a sphere with a red cell's membrane area, over the disc's

export function createEyepiece({ onChange = () => {} } = {}) {
  const el = document.createElement('section');
  el.className = 'eyepiece';
  el.hidden = true;
  el.innerHTML = `
    <div class="ep-head"><h2>${E.title}</h2><button class="btn ep-close">${E.close}</button></div>
    <div class="ep-tabs">${TUBES.map((t) => `<button data-k="${t.key}">${T.tubes[t.key].label}</button>`).join('')}</div>
    <canvas class="ep-view" width="900" height="900"></canvas>
    <p class="ep-cap"></p>
    <p class="ep-seen"></p>`;
  document.getElementById('app').appendChild(el);
  const cv = el.querySelector('.ep-view'), cap = el.querySelector('.ep-cap'), seenEl = el.querySelector('.ep-seen');
  const seen = new Set();
  let cur = 'iso';

  // one field of cells, the same positions on every slide so only the cells differ
  const rnd = seeded(7), cells = [];
  for (let tries = 0; cells.length < 70 && tries < 3000; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 0.92, x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (cells.some((c) => (c.x - x) ** 2 + (c.y - y) ** 2 < 0.021)) continue;
    cells.push({ x, y, s: 0.92 + rnd() * 0.16, ph: rnd() * 6.28, burst: rnd() });
  }

  function draw(tube) {
    const x = cv.getContext('2d'), W = cv.width, R = W / 2, r0 = W * 0.042;
    x.clearRect(0, 0, W, W);
    x.save();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.clip();
    const lys = tube.lysed;
    const bg = x.createRadialGradient(R, R, R * 0.2, R, R, R);
    bg.addColorStop(0, lys > 0.5 ? '#f6dcd6' : '#f5f0e6'); bg.addColorStop(1, lys > 0.5 ? '#d9b3ab' : '#d8d0c0');
    x.fillStyle = bg; x.fillRect(0, 0, W, W);
    const v = tube.volume;
    for (const c of cells) {
      const cx = R + c.x * R, cy = R + c.y * R;
      if (c.burst < lys) {                       // a ghost
        x.beginPath(); x.arc(cx, cy, r0 * SPHERE_W * c.s, 0, Math.PI * 2);
        x.fillStyle = 'rgba(214, 120, 110, 0.12)'; x.fill();
        x.strokeStyle = 'rgba(160, 80, 75, 0.35)'; x.lineWidth = 1.5; x.stroke();
        continue;
      }
      const round = Math.min(1, Math.max(0, (v - 1) / 0.5));   // 0 a disc … 1 a sphere at lysis
      const shrink = Math.min(1, Math.max(0, (1 - v) / 0.4));  // 0 normal … 1 fully crenated
      const rad = r0 * c.s * (1 - (1 - SPHERE_W) * round) * (1 - 0.12 * shrink);
      x.beginPath();
      if (shrink > 0.3) {                         // spikes
        const n = 13, amp = rad * 0.16 * shrink;
        for (let i = 0; i <= n * 8; i++) {
          const a = (i / (n * 8)) * Math.PI * 2 + c.ph, rr = rad + amp * Math.max(0, Math.cos(a * n - c.ph)) ** 3;
          i ? x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr) : x.moveTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
        }
      } else x.arc(cx, cy, rad, 0, Math.PI * 2);
      const pale = (1 - round) * (1 - shrink);      // the biconcave dip: thin middle, pale
      const dark = round * 0.3 + shrink * 0.2;
      const rim = `rgb(${200 - 60 * dark | 0}, ${72 - 30 * dark | 0}, ${62 - 22 * dark | 0})`;
      const mid = `rgb(${200 + 40 * pale - 60 * dark | 0}, ${72 + 120 * pale - 30 * dark | 0}, ${62 + 110 * pale - 22 * dark | 0})`;
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad);
      g.addColorStop(0, mid); g.addColorStop(0.32, mid); g.addColorStop(0.62, rim); g.addColorStop(1, rim);
      x.fillStyle = g; x.fill();
      x.strokeStyle = 'rgba(110, 35, 30, 0.45)'; x.lineWidth = 1.5; x.stroke();
    }
    x.restore();
    x.beginPath(); x.arc(R, R, R - 2, 0, Math.PI * 2); x.strokeStyle = '#1b1f24'; x.lineWidth = 4; x.stroke();
  }

  function show(key) {
    cur = key; seen.add(key);
    const tube = TUBES.find((t) => t.key === key);
    draw(tube);
    const pct = Math.round(Math.abs(tube.volume - 1) * 100);
    cap.innerHTML = fmt(E.shape[key], { pct });
    seenEl.textContent = fmt(E.seen, { n: seen.size });
    el.querySelectorAll('.ep-tabs button').forEach((b) => { b.classList.toggle('on', b.dataset.k === key); b.classList.toggle('seen', seen.has(b.dataset.k)); });
    onChange();
  }
  el.querySelector('.ep-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.k); });
  el.querySelector('.ep-close').addEventListener('click', () => api.close());

  const api = {
    get isOpen() { return !el.hidden; },
    open() { el.hidden = false; document.body.classList.add('scope-open'); show(cur); },
    close() { if (el.hidden) return; el.hidden = true; document.body.classList.remove('scope-open'); onChange(); },
    reset() { seen.clear(); cur = 'iso'; api.close(); },
    seen: () => seen.size,
  };
  return api;
}
