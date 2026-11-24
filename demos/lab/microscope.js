/* The microscope view (from OnionRoot): a full-window view over the bench with a round eyepiece,
 * the objectives, focus and light, and a side panel on either side that the lab fills. The view
 * owns the optics: the field of each objective, panning the slide, blur away from focus,
 * brightness from the light, the scale bar and the hints. The lab owns the specimen, drawn into
 * view.scene in µm, and whatever it lets the student do with it.
 *
 *   const view = createMicroscopeView({
 *     title: 'Light microscope', left: panelEl, right: panelEl,   // either side may be null
 *     bounds: { x0, x1, y0, y1 },              // where the slide can be moved to (µm)
 *     hints: { start: 'Drag to move the slide' },
 *     onPoint(e) {},                           // e = { kind: 'move'|'click'|'leave', x, y, inside, objective }
 *     onFrame(dt, now, v) {},                  // v = { field, x, y, objective }, every frame while open
 *     onKey(key, event) { return handled; },   // before the view's own keys (1–4, arrows, Escape)
 *     onObjective(i) {}, onClose() {},
 *   });
 *   view.scene  view.open({ x, y, objective, focus })  view.close()  view.setSub(html)
 *   view.setZone(text)  view.flashHint(text)  view.setCursor('pick'|null)  view.setBackground(hex)
 *   view.objective  view.field  view.isOpen  view.root  view.debug.frame(now)
 * Colours are hex as given: the renderer outputs linear, as the 2D original did.
 * Styles: lab.css's "Microscope view". Words: UI.scope in strings.js. */
import * as THREE from 'three';
import { clamp } from './core/math.js';
import { linearOut } from './core/three-compat.js';
import { UI, fmt } from './text.js';

/** A compound microscope's four objectives under a 10× eyepiece. field: the width of the view
 *  in µm. focus and dof: where it is sharp on the focus knob, and how forgiving it is. */
export const OBJECTIVES = [
  { mag: 4, field: 4500, ring: '#d94040', focus: 0.46, dof: 0.7 },
  { mag: 10, field: 1800, ring: '#f2c230', focus: 0.5, dof: 1.1 },
  { mag: 40, field: 450, ring: '#3b78d8', focus: 0.545, dof: 2.0 },
  { mag: 100, field: 180, ring: '#e6e8ec', focus: 0.565, dof: 3.0 },
];

export function createMicroscopeView({
  title = '', left = null, right = null, bounds = { x0: -1000, x1: 1000, y0: -1000, y1: 1000 }, hints = {},
  objectives = OBJECTIVES, onPoint = () => {}, onFrame = () => {}, onKey = () => false, onObjective = () => {}, onClose = () => {},
} = {}) {
  const W = UI.scope;
  let renderer, camera, canvas, eyeEl, root, inited = false, isOpen = false;
  const scene = new THREE.Scene();
  let field = objectives[0].field, fieldT = field, obj = 0, camX = 0, camY = 0;
  let focus = 0.25, light = 0.62, lastFilter = '', last = 0, raf = 0, flashUntil = 0;
  const $ = (q) => root.querySelector(q);

  /* ---------- DOM ---------- */
  function buildDom() {
    root = document.createElement('section');
    root.className = 'scope';
    root.hidden = true;
    root.innerHTML = `
      <header class="scope-top">
        <button class="btn scope-back" data-act="back"><i class="ph-bold ph-arrow-left"></i>${W.back}</button>
        <div class="scope-title"><b>${title}</b><span class="scope-sub"></span></div>
      </header>
      <div class="scope-grid">
        <main class="eye-col">
          <div class="eyepiece">
            <canvas></canvas>
            <div class="vignette"></div>
            <div class="eye-hint"></div>
            <div class="scalebar"><i></i><b></b></div>
          </div>
          <div class="panel scope-controls">
            <div class="objectives"></div>
            <div class="sliders">
              <label class="slider-row"><span>${W.focus}</span><input type="range" class="scope-focus" min="0" max="1000" value="250"><span class="kbd">${W.scroll}</span></label>
              <label class="slider-row"><span>${W.light}</span><input type="range" class="scope-light" min="0" max="1000" value="620"><span class="kbd scope-light-val"></span></label>
            </div>
          </div>
          <div class="scope-zone"></div>
        </main>
      </div>`;
    const grid = root.querySelector('.scope-grid'), eye = root.querySelector('.eye-col');
    if (left) { left.classList.add('panel'); grid.insertBefore(left, eye); }
    if (right) { right.classList.add('panel'); grid.appendChild(right); }
    grid.classList.toggle('no-left', !left);
    grid.classList.toggle('no-right', !right);
    (document.getElementById('app') || document.body).appendChild(root);
  }

  function buildUI() {
    const objEl = $('.objectives');
    objEl.innerHTML = objectives.map((o, i) => `<button data-i="${i}" style="--ring:${o.ring}"><b>${o.mag}×</b><small>${fmt(W.total, { n: o.mag * 10 })}</small></button>`).join('');
    objEl.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setObjective(+b.dataset.i); });
    const focusEl = $('.scope-focus'), lightEl = $('.scope-light');
    const setP = (el) => el.style.setProperty('--p', el.value / 10 + '%');
    focusEl.addEventListener('input', () => { focus = focusEl.value / 1000; setP(focusEl); });
    lightEl.addEventListener('input', () => { light = lightEl.value / 1000; setP(lightEl); $('.scope-light-val').textContent = Math.round(light * 100) + '%'; });
    setP(focusEl); setP(lightEl);
    $('.scope-light-val').textContent = Math.round(light * 100) + '%';
    root.addEventListener('click', (e) => { const a = e.target.closest('[data-act="back"]'); if (a) close(); });

    let drag = null;
    eyeEl.addEventListener('pointerdown', (e) => {
      eyeEl.setPointerCapture(e.pointerId);
      drag = { x: e.clientX, y: e.clientY, cx: camX, cy: camY, moved: 0 };
    });
    eyeEl.addEventListener('pointermove', (e) => {
      const rect = eyeEl.getBoundingClientRect();
      if (drag) {
        const k = field / rect.width;
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
        if (drag.moved > 3) {
          eyeEl.classList.add('dragging');
          camX = drag.cx - dx * k;
          camY = drag.cy + dy * k;
          clampCam();
        }
      }
      if (!(drag && drag.moved > 3)) onPoint({ kind: 'move', ...toWorld(e, rect), objective: obj, dragging: !!drag });
    });
    const endDrag = (e) => {
      if (!drag) return;
      const wasClick = drag.moved <= 3;
      drag = null;
      eyeEl.classList.remove('dragging');
      if (wasClick) onPoint({ kind: 'click', ...toWorld(e, eyeEl.getBoundingClientRect()), objective: obj });
    };
    eyeEl.addEventListener('pointerup', endDrag);
    eyeEl.addEventListener('pointercancel', () => { drag = null; eyeEl.classList.remove('dragging'); });
    eyeEl.addEventListener('pointerleave', () => { if (!drag) onPoint({ kind: 'leave', objective: obj }); });
    eyeEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      setFocus(focus - e.deltaY * 0.00025);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!isOpen || e.target.tagName === 'INPUT') return;
      const k = e.key.toLowerCase();
      if (onKey(k, e)) return;
      if (k >= '1' && k <= String(objectives.length)) setObjective(+k - 1);
      if (k === 'escape') close();
      const step = field * 0.08;
      if (k === 'arrowleft') camX -= step;
      if (k === 'arrowright') camX += step;
      if (k === 'arrowup') camY += step;
      if (k === 'arrowdown') camY -= step;
      if (k.startsWith('arrow')) { e.preventDefault(); clampCam(); }
      if (k === ' ') e.stopPropagation();
    }, true);

    new ResizeObserver(resize).observe(eyeEl);
  }

  function setFocus(f) {
    focus = clamp(f, 0, 1);
    const el = $('.scope-focus');
    el.value = focus * 1000;
    el.style.setProperty('--p', focus * 100 + '%');
  }
  function toWorld(e, rect) {
    const px = (e.clientX - rect.left) / rect.width, py = (e.clientY - rect.top) / rect.height;
    return { x: camX + (px - 0.5) * field, y: camY - (py - 0.5) * field, inside: Math.hypot(px - 0.5, py - 0.5) < 0.5 };
  }
  function clampCam() {
    const b = typeof bounds === 'function' ? bounds() : bounds;
    camX = clamp(camX, b.x0, b.x1);
    camY = clamp(camY, b.y0, b.y1);
  }
  function setObjective(i) {
    obj = i;
    fieldT = objectives[i].field;
    root.querySelectorAll('.objectives button').forEach((b, j) => b.classList.toggle('active', j === i));
    eyeEl.classList.remove('can-pick');
    onObjective(i);
  }
  function flashHint(msg) {
    $('.eye-hint').textContent = msg;
    flashUntil = performance.now() + 2800;
  }

  /* ---------- Loop ---------- */
  function frame(now) {
    if (!isOpen) return;
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    field += (fieldT - field) * Math.min(1, dt * 7);
    if (Math.abs(field - fieldT) < fieldT * 0.001) field = fieldT;
    camera.left = -field / 2; camera.right = field / 2; camera.top = field / 2; camera.bottom = -field / 2;
    camera.updateProjectionMatrix();
    camera.position.set(camX, camY, 100);
    const o = objectives[obj];
    const blur = Math.min(16, Math.abs(focus - o.focus) * 70 * o.dof);
    const bright = 0.5 + light * 0.8;
    const contrast = 1.28 - light * 0.38;
    const filter = `blur(${blur.toFixed(1)}px) brightness(${bright.toFixed(2)}) contrast(${contrast.toFixed(2)}) saturate(${(0.85 + (1 - light) * 0.4).toFixed(2)})`;
    if (filter !== lastFilter) { canvas.style.filter = filter; lastFilter = filter; }
    if (now > flashUntil) {
      const msg = blur > 2.5 ? W.hints.blurry : light < 0.18 ? W.hints.dark : light > 0.94 ? W.hints.bright : '';
      const eh = $('.eye-hint');
      if (msg !== eh.textContent) eh.textContent = msg;
    }
    const rect = eyeEl.getBoundingClientRect();
    const target = field * 0.22;
    const nice = [5, 10, 20, 50, 100, 200, 500, 1000].reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a));
    $('.scalebar i').style.width = ((nice / field) * rect.width).toFixed(1) + 'px';
    $('.scalebar b').textContent = nice >= 1000 ? nice / 1000 + ' mm' : nice + ' µm';
    onFrame(dt, now, { field, x: camX, y: camY, objective: obj, blur });
    renderer.render(scene, camera);
  }

  function resize() {
    if (!renderer) return;
    const r = eyeEl.getBoundingClientRect();
    if (r.width < 10) return;
    renderer.setSize(r.width, r.height, false);
  }

  function init() {
    buildDom();
    eyeEl = $('.eyepiece');
    canvas = eyeEl.querySelector('canvas');
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    linearOut(renderer);
    renderer.setClearColor('#f6f3ec');
    camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    buildUI();
    inited = true;
  }

  /** Open the view. x, y, objective and focus set where it starts; leave them out to keep
   *  where the student left it. */
  function open({ x, y, objective, focus: f, hint } = {}) {
    if (!inited) init();
    root.hidden = false;
    document.body.classList.add('scope-open');
    if (x != null) camX = x;
    if (y != null) camY = y;
    if (f != null) setFocus(f);
    if (objective != null) { setObjective(objective); field = fieldT; }
    else if (!root.querySelector('.objectives button.active')) { setObjective(0); field = fieldT; }
    clampCam();
    if (hint || hints.start) flashHint(hint || hints.start);
    isOpen = true;
    resize();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    cancelAnimationFrame(raf);
    root.hidden = true;
    document.body.classList.remove('scope-open');
    onClose();
  }

  if (left || right) init();   // the lab fills its panels before the first open

  return {
    scene, open, close, flashHint,
    get isOpen() { return isOpen; },
    get objective() { return obj; },
    get field() { return field; },
    get root() { if (!inited) init(); return root; },
    setObjective: (i) => { if (!inited) init(); setObjective(i); },
    setSub: (html) => { if (!inited) init(); $('.scope-sub').innerHTML = html; },
    setZone: (text) => { const z = $('.scope-zone'); if (z.textContent !== text) z.textContent = text; },
    setCursor: (kind) => eyeEl && eyeEl.classList.toggle('can-pick', kind === 'pick'),
    setBackground: (hex) => { if (!inited) init(); renderer.setClearColor(hex); eyeEl.style.background = hex; },
    look: (x, y) => { camX = x; camY = y; clampCam(); },
    debug: { frame: (now = performance.now()) => { if (isOpen) { cancelAnimationFrame(raf); frame(now); } } },
  };
}
