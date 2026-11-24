/* The four wet mounts under the microscope, in lab's microscope view (../microscope.js owns the
 * optics). A panel lists every slide the student made; picking one puts it on the stage. Each
 * slide's cells are posed from model.js's cell volume for its tube:
 *   v ≈ 1     biconcave discs, pale in the middle, 7.8 µm across
 *   v > 1     swelling at constant membrane area rounds a cell up: thicker, the pale centre fades,
 *             narrower across (a sphere of a red cell's area is ~85% of the disc's width)
 *   v < 0.8   crenated: shrunken, with spikes (echinocytes)
 *   lysed     ghosts: pale empty membranes, on a pink background of free hemoglobin
 * A slide counts as seen once it has been looked at with 40× or more, where single cells show.
 * The student's progress is the panel's, not bench state.
 *
 *   const slides = createSlides({ onChange });
 *   slides.open(key?) · close() · reset() · seen() · isOpen */
import * as THREE from 'three';
import { T, fmt, seeded, createMicroscopeView } from '../lab.js';
import { TUBES } from './model.js';

const E = T.eyepiece;
const DISC = 7.8;        // µm across a resting red cell
const SPHERE_W = 0.85;   // width of a sphere with a red cell's membrane area, over the disc's
const HALF = 900;        // µm: the mount covers ±HALF of the slide
const CELLS = 5200;      // a drop diluted in 5 mL, spread thin: ~25 cells in a 100× field
const SEE_FROM = 2;      // objective index: 40×

/** One cell's look for a volume, drawn into a 128 px texture (bright-field: lit from below). */
function cellTexture(v, ghost) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), R = 64;
  if (ghost) {
    x.beginPath(); x.arc(R, R, R - 4, 0, Math.PI * 2);
    x.fillStyle = 'rgba(214, 120, 110, 0.14)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(150, 70, 66, 0.45)'; x.stroke();
  } else {
    const round = Math.min(1, Math.max(0, (v - 1) / 0.5));   // 0 a disc … 1 a sphere at lysis
    const shrink = Math.min(1, Math.max(0, (1 - v) / 0.4));  // 0 normal … 1 fully crenated
    const rad = R - 6 - (shrink > 0.3 ? 10 : 0);
    x.beginPath();
    if (shrink > 0.3) {
      const n = 13, amp = 10 * shrink;
      for (let i = 0; i <= n * 10; i++) {
        const a = (i / (n * 10)) * Math.PI * 2, rr = rad + amp * Math.max(0, Math.cos(a * n)) ** 3;
        i ? x.lineTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr) : x.moveTo(R + Math.cos(a) * rr, R + Math.sin(a) * rr);
      }
    } else x.arc(R, R, rad, 0, Math.PI * 2);
    const pale = (1 - round) * (1 - shrink), dark = round * 0.3 + shrink * 0.2;
    const rim = `rgb(${200 - 60 * dark | 0}, ${72 - 30 * dark | 0}, ${62 - 22 * dark | 0})`;
    const mid = `rgb(${200 + 40 * pale - 60 * dark | 0}, ${72 + 120 * pale - 30 * dark | 0}, ${62 + 110 * pale - 22 * dark | 0})`;
    const g = x.createRadialGradient(R, R, 0, R, R, rad);
    g.addColorStop(0, mid); g.addColorStop(0.32, mid); g.addColorStop(0.62, rim); g.addColorStop(1, rim);
    x.fillStyle = g; x.fill();
    x.lineWidth = 3; x.strokeStyle = 'rgba(110, 35, 30, 0.5)'; x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}
/** µm across a cell of volume v, as the texture draws it (crenated cells are drawn smaller). */
const cellWidth = (v) => DISC * (1 - (1 - SPHERE_W) * Math.min(1, Math.max(0, (v - 1) / 0.5)));

export function createSlides({ onChange = () => {} } = {}) {
  const seen = new Set();
  let cur = TUBES[0].key, built = '', opened = false;

  // the same scatter on every slide, so only the cells differ
  const rnd = seeded(7), spots = [];
  for (let i = 0; i < CELLS; i++) spots.push({ x: (rnd() * 2 - 1) * HALF, y: (rnd() * 2 - 1) * HALF, s: 0.92 + rnd() * 0.16, r: rnd() * 6.28, burst: rnd() });

  const panel = document.createElement('aside');
  panel.className = 'slide-panel';
  panel.innerHTML = `
    <div class="panel-label">${E.slides}</div>
    <div class="slide-list">${TUBES.map((t) => `<button data-k="${t.key}"><i></i><span><b>${T.tubes[t.key].label}</b><small>${fmt(T.tubes[t.key].desc, { osm: Math.round(t.osm) })}</small></span><em class="ph-bold ph-check"></em></button>`).join('')}</div>
    <p class="slide-obs"></p>
    <p class="slide-seen"></p>`;
  panel.querySelector('.slide-list').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) show(b.dataset.k); });

  const view = createMicroscopeView({
    title: E.title, right: panel,
    bounds: { x0: -HALF + 60, x1: HALF - 60, y0: -HALF + 60, y1: HALF - 60 },
    hints: { start: E.hints.start },
    onFrame: (dt, now, v) => { if (v.objective >= SEE_FROM && v.blur < 2.5) mark(); },
    onObjective: () => paint(),
    onClose: () => onChange(),
  });
  const discGeo = new THREE.PlaneGeometry(1, 1);
  const meshes = [];

  function build(key) {
    if (built === key) return;
    built = key;
    meshes.forEach((m) => { view.scene.remove(m); m.material.map.dispose(); m.material.dispose(); });
    meshes.length = 0;
    const tube = TUBES.find((t) => t.key === key), v = tube.volume;
    const whole = spots.filter((s) => s.burst >= tube.lysed), ghosts = spots.filter((s) => s.burst < tube.lysed);
    const add = (list, tex, w) => {
      if (!list.length) return;
      const m = new THREE.InstancedMesh(discGeo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false }), list.length);
      const d = new THREE.Object3D();
      list.forEach((s, i) => { d.position.set(s.x, s.y, 0); d.rotation.z = s.r; d.scale.setScalar(w * s.s * 1.1); d.updateMatrix(); m.setMatrixAt(i, d.matrix); });
      m.frustumCulled = false;
      view.scene.add(m); meshes.push(m);
    };
    add(whole, cellTexture(v, false), isFinite(v) ? cellWidth(v) : DISC);
    add(ghosts, cellTexture(1, true), DISC * SPHERE_W);
    view.setBackground(tube.lysed > 0.5 ? '#f3d6cf' : '#f6f3ec');
  }

  function mark() {
    if (seen.has(cur)) return;
    seen.add(cur);
    paint();
    onChange();
  }
  function paint() {
    panel.querySelectorAll('.slide-list button').forEach((b) => {
      b.classList.toggle('on', b.dataset.k === cur);
      b.classList.toggle('seen', seen.has(b.dataset.k));
    });
    const tube = TUBES.find((t) => t.key === cur);
    panel.querySelector('.slide-obs').innerHTML = seen.has(cur)
      ? fmt(E.shape[cur], { pct: Math.round(Math.abs(tube.volume - 1) * 100) })
      : view.objective < SEE_FROM ? E.hints.mag : E.hints.look;
    panel.querySelector('.slide-seen').textContent = fmt(E.seen, { n: seen.size });
  }
  function show(key) {
    cur = key;
    build(key);
    view.setSub(T.tubes[key].label);
    paint();
  }

  return {
    open(key) { show(key || cur); view.open(opened ? {} : { x: 0, y: 0, objective: 0, focus: 0.3 }); opened = true; paint(); },
    close: () => view.close(),
    reset() { seen.clear(); cur = TUBES[0].key; opened = false; view.close(); paint(); },
    seen: () => seen.size,
    get isOpen() { return view.isOpen; },
    get current() { return cur; },
    show, view,
  };
}
