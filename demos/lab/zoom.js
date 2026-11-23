/* Zoom levels: the bench (Lab) plus deeper levels (a cell, molecules), from Strawberry.
 * Live circles show the levels you're not looking at; click one to zoom there
 * with the lens transition (from the original Strawberry lab). The bench is the
 * Lab stage; each other level is a "world" with its own scene, camera and orbit
 * controls. A sim poses every level from the same state, so they always show
 * the same moment.
 *
 *   const zoom = createZoom(stage, {
 *     levels: [{ key: 'cell', world: createCell(stage.env), name: 'Cell', meta: '≈ 100 µm', bg: '#e9f2ee' }],
 *     getT: () => S.t,          // passed to each world's update(t, time) and info(t)
 *     getStep: () => i,         // index into each world's views[] (its camera for this step)
 *     onChange: (scale) => {},  // after the main view switched level
 *   });
 *   zoom.scale            // 'lab' | a level key
 *   zoom.go('cell')       // zoom with the lens transition
 *   zoom.onStep()         // fly the level cameras to the current step's view
 *   stage.onFrame((dt) => zoom.update(dt));
 *
 * A world: { scene, views: [{ pos, target }], labels: [{ text, sub?, anchor(), show(t) }],
 *   interactives: [{ root, info(t) → { title, text }, priority? }], update(t, time),
 *   fov?, near?, far?, minDist?, maxDist? }.
 *
 * The page provides one `.zoom-inset` button per level you're not looking at
 * (levels.length of them, each with .zi-ring and .zi-cap > .zi-dir/.zi-name/.zi-meta),
 * #zoomLens and #zoomLabels; lab.css styles them. Backgrounds per level are the
 * sim's: .bg-<key> on .scale-bg and .zoom-lens. Keys 1, 2, 3 … switch levels.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, lerp, Ease } from './core/math.js';

export function createZoom(stage, { levels, getT, getStep, onChange = () => {}, lab = {} }) {
  const ORDER = ['lab', ...levels.map((l) => l.key)];
  const NAMES = { lab: lab.name || 'Lab' }, META = { lab: lab.meta || '≈ 10 cm' }, INSET_BG = { lab: lab.bg || '#eef2f6' };
  levels.forEach((l) => { NAMES[l.key] = l.name; META[l.key] = l.meta || ''; INSET_BG[l.key] = l.bg || '#eef2f6'; });
  const DEEP = ORDER.slice(1);
  const { renderer, canvas } = stage;
  const $ = (s) => document.querySelector(s);
  let active = 'lab';
  let transition = null;
  let time = 0;

  /* ---------- worlds ---------- */
  const worlds = { lab: { key: 'lab', scene: stage.scene, camera: stage.camera, controls: stage.controls, views: null } };
  levels.forEach((l) => { worlds[l.key] = Object.assign(l.world, { key: l.key }); });
  for (const k of ORDER) {
    const w = worlds[k];
    w.insetCam = new THREE.PerspectiveCamera(36, 1, k === 'lab' ? 0.5 : (w.near || 0.1), k === 'lab' ? 900 : (w.far || 500));
    w.bg = new THREE.Color(INSET_BG[k]);
    if (k === 'lab') continue;
    w.camera = new THREE.PerspectiveCamera(w.fov || 38, 1, w.near || 0.1, w.far || 500);
    w.controls = new OrbitControls(w.camera, canvas);
    Object.assign(w.controls, {
      enableDamping: true, dampingFactor: 0.08, minDistance: w.minDist, maxDistance: w.maxDist,
      enabled: false, rotateSpeed: 0.7, zoomSpeed: 0.9, panSpeed: 0.8, screenSpacePanning: true,
    });
    w.camera.position.copy(w.views[0].pos);
    w.controls.target.copy(w.views[0].target);
    w.controls.update();
    w.controls.addEventListener('start', () => { if (active === k) w.tween = null; });
    w.labelEls = [];
  }
  const viewFor = (w) => w.views[clamp(getStep(), 0, w.views.length - 1)];

  /* ---------- sizing: same free area as the bench (stage.insets) ---------- */
  function resize(W, H) {
    const i = stage.insets();
    for (const k of DEEP) {
      const cam = worlds[k].camera;
      cam.aspect = W / H;
      // widen the vertical FOV on narrow / portrait screens so the scene still fits
      const base = THREE.MathUtils.degToRad(worlds[k].fov || 38);
      const widen = Math.pow(Math.max(1, 1.3 / cam.aspect), 0.75);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(base / 2) * widen));
      cam.setViewOffset(W, H, ((i.right || 0) - (i.left || 0)) / 2, ((i.bottom || 0) - (i.top || 0)) / 2, W, H);
      cam.updateProjectionMatrix();
    }
    overlayCam.right = W; overlayCam.top = H; overlayCam.updateProjectionMatrix();
    const pr = renderer.getPixelRatio();
    insets.forEach((ins) => {
      const r = ins.el.getBoundingClientRect();
      const d = r.width - 6;
      ins.quad.position.set(r.left + r.width / 2, H - (r.top + r.height / 2), 0);
      ins.quad.scale.set(d, d, 1);
      const px = Math.max(64, Math.round(d * pr));
      if (px !== ins.size) { ins.rt.setSize(px, px); ins.size = px; }
      ins.quad.visible = r.width > 0;
    });
  }

  /* ---------- the circles: render-to-texture, drawn as discs over the canvas ---------- */
  const overlayScene = new THREE.Scene();
  const overlayCam = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1);
  function makeRT(size) {
    const opts = { format: THREE.RGBAFormat, encoding: THREE.sRGBEncoding };
    const rt = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget
      ? new THREE.WebGLMultisampleRenderTarget(size, size, opts)
      : new THREE.WebGLRenderTarget(size, size, opts);
    if (rt.samples !== undefined) rt.samples = 4;
    rt.texture.encoding = THREE.sRGBEncoding;
    return rt;
  }
  const insets = [...document.querySelectorAll('.zoom-inset')].map((el) => {
    const rt = makeRT(256);
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: rt.texture }, uFade: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D map; uniform float uFade; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; float a = 1.0 - smoothstep(0.975, 1.0, d); vec4 c = texture2D(map, vUv); gl_FragColor = vec4(c.rgb, a * uFade); }',
      transparent: true, depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
    overlayScene.add(quad);
    el.addEventListener('click', () => {
      const r = el.getBoundingClientRect();
      go(el.dataset.scale, { x: r.left + r.width / 2, y: r.top + r.height / 2 });
    });
    return { el, rt, quad, mat, size: 0 };
  });
  const others = () => ORDER.filter((k) => k !== active);
  function refreshInsets() {
    const ai = ORDER.indexOf(active);
    others().forEach((k, i) => {
      const el = insets[i].el;
      const dirIn = ORDER.indexOf(k) > ai;
      el.dataset.scale = k;
      el.querySelector('.zi-dir').textContent = dirIn ? 'Zoom in' : 'Zoom out';
      el.querySelector('.zi-name').textContent = NAMES[k];
      el.querySelector('.zi-meta').textContent = META[k];
      el.setAttribute('aria-label', `${dirIn ? 'Zoom in' : 'Zoom out'} to the ${NAMES[k].toLowerCase()} level`);
      el.title = `${NAMES[k]} level · ${META[k]}`;
    });
  }
  const Yaxis = new THREE.Vector3(0, 1, 0);
  function positionInsetCam(w) {
    let t, p;
    if (w.key === 'lab') { const v = stage.lastView; t = v.t; p = v.p; } else { const v = viewFor(w); t = v.target; p = v.pos; }
    const off = p.clone().sub(t).applyAxisAngle(Yaxis, Math.sin(time * 0.12 + ORDER.indexOf(w.key)) * 0.55);
    w.insetCam.position.copy(t).add(off.multiplyScalar(w.key === 'lab' ? 0.9 : 1.0));
    w.insetCam.lookAt(t);
  }

  /* ---------- cameras follow the step (cell, molecule) ---------- */
  function onStep() {
    for (const k of DEEP) {
      const w = worlds[k], v = viewFor(w);
      w.tween = { fp: w.camera.position.clone(), ft: w.controls.target.clone(), tp: v.pos.clone(), tt: v.target.clone(), t: 0, dur: 1.6 };
    }
  }
  function updateTween(w, dt) {
    const c = w.tween;
    if (!c || (transition && (transition.from === w.key || transition.to === w.key))) return;
    c.t += dt;
    const k = Ease.inOut(clamp(c.t / c.dur));
    w.controls.target.lerpVectors(c.ft, c.tt, k);
    w.camera.position.lerpVectors(c.fp, c.tp, k);
    if (k >= 1) w.tween = null;
  }

  /* ---------- the lens transition (from the original) ---------- */
  const lens = $('#zoomLens');
  function go(to, origin) {
    if (transition || to === active || !worlds[to]) return;
    const from = worlds[active];
    origin = origin || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    transition = {
      from: active, to, dirIn: ORDER.indexOf(to) > ORDER.indexOf(active), t: 0, origin, swapped: false,
      base: from.camera.position.clone().sub(from.controls.target),
    };
    from.controls.enabled = false;
    from.tween = null;
    hideTip();
    lens.className = 'zoom-lens bg-' + to;
    lens.style.opacity = '1';
    lens.style.clipPath = `circle(0px at ${origin.x}px ${origin.y}px)`;
    document.body.classList.add('zooming');
  }
  function updateTransition(dt) {
    const T = transition;
    if (!T) return;
    T.t += dt;
    const A = 0.6, B = 0.75;
    if (!T.swapped) {
      const k = clamp(T.t / A);
      const w = worlds[T.from];
      const f = T.dirIn ? lerp(1, 0.4, Ease.in(k)) : lerp(1, 1.9, Ease.in(k));
      w.camera.position.copy(w.controls.target).addScaledVector(T.base, f);
      const maxR = Math.hypot(window.innerWidth, window.innerHeight) * 1.05;
      const r = Ease.inOut(clamp((k - 0.15) / 0.85)) * maxR;
      lens.style.clipPath = `circle(${r.toFixed(1)}px at ${T.origin.x}px ${T.origin.y}px)`;
      if (k >= 1) {
        w.camera.position.copy(w.controls.target).add(T.base);
        T.swapped = true;
        active = T.to;
        const nw = worlds[active];
        if (active === 'lab') {
          T.base = nw.camera.position.clone().sub(nw.controls.target); // the bench camera stays where it was
        } else {
          const v = viewFor(nw);
          nw.controls.target.copy(v.target);
          T.base = v.pos.clone().sub(v.target);
        }
        document.body.dataset.scale = active;
        refreshInsets();
        lens.style.clipPath = 'none';
        onChange(active);
      }
    } else {
      const k = clamp((T.t - A) / B);
      const w = worlds[T.to];
      const f = T.dirIn ? lerp(2.6, 1, Ease.out(k)) : lerp(0.45, 1, Ease.out(k));
      w.camera.position.copy(w.controls.target).addScaledVector(T.base, f);
      lens.style.opacity = String(1 - Ease.out(k));
      if (k >= 1) {
        w.controls.enabled = true;
        w.controls.update();
        transition = null;
        lens.style.opacity = '0';
        document.body.classList.remove('zooming');
      }
    }
  }

  /* ---------- labels in the cell and molecule views (names only) ---------- */
  const labelLayer = $('#zoomLabels');
  for (const k of DEEP) {
    const w = worlds[k];
    w.labelEls = w.labels.map((L) => {
      const el = document.createElement('div');
      el.className = 'zoom-tag';
      el.innerHTML = `<div class="zt-inner"><div class="zt-pill"><b>${L.text}</b>${L.sub ? `<small>${L.sub}</small>` : ''}</div><div class="zt-stem"></div></div><div class="zt-dot"></div>`;
      labelLayer.appendChild(el);
      return el;
    });
  }
  const _v = new THREE.Vector3();
  function updateLabels(t) {
    const W = window.innerWidth, H = window.innerHeight;
    for (const k of DEEP) {
      const w = worlds[k];
      w.labels.forEach((L, i) => {
        const el = w.labelEls[i];
        if (k !== active || transition || !L.show(t)) { el.classList.remove('on'); return; }
        _v.copy(L.anchor()).project(w.camera);
        if (_v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1) { el.classList.remove('on'); return; }
        el.style.transform = `translate(${((_v.x * 0.5 + 0.5) * W).toFixed(1)}px, ${((-_v.y * 0.5 + 0.5) * H).toFixed(1)}px)`;
        el.classList.add('on');
      });
    }
  }

  /* ---------- hover info in the cell and molecule views ---------- */
  const tip = document.createElement('div');
  tip.className = 'lab-tooltip zoom-tip';
  document.getElementById('app').appendChild(tip);
  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2(-9, -9);
  let pointer = null, needPick = false;
  for (const k of DEEP) worlds[k].interactives.forEach((it) => { it.root.userData.interactive = it; });
  const shown = (o) => { while (o) { if (!o.visible) return false; o = o.parent; } return true; };
  const itemOf = (o) => { while (o) { if (o.userData.interactive) return o.userData.interactive; o = o.parent; } return null; };
  function pick() {
    const w = worlds[active];
    ray.setFromCamera(mouse, w.camera);
    const roots = w.interactives.filter((it) => shown(it.root)).map((it) => it.root);
    let best = null;
    for (const h of ray.intersectObjects(roots, true)) {
      if (!shown(h.object) || h.object.isPoints) continue;
      const it = itemOf(h.object);
      if (!it) continue;
      if (!best || (it.priority || 0) > (best.priority || 0)) best = it;
      if ((it.priority || 0) >= 2) break;
    }
    return best;
  }
  function hideTip() { tip.classList.remove('show'); }
  function showTip(it) {
    const info = it.info(getT());
    tip.innerHTML = `<div class="tt-name">${info.title}</div><div class="tt-desc">${info.text}</div>`;
    tip.classList.add('show');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = pointer.x + 16, y = pointer.y + 18;
    if (x + tw > window.innerWidth - 10) x = pointer.x - tw - 12;
    if (y + th > window.innerHeight - 10) y = pointer.y - th - 12;
    tip.style.transform = `translate(${x}px, ${y}px)`;
  }
  canvas.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    const r = canvas.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    needPick = e.buttons === 0 && e.pointerType !== 'touch';
    if (e.buttons) hideTip();
  });
  canvas.addEventListener('pointerleave', () => { mouse.set(-9, -9); hideTip(); });

  window.addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = ORDER[Number(e.key) - 1];
    if (k) go(k);
  });

  /* ---------- per frame ---------- */
  function update(dt) {
    time += dt;
    const t = getT();
    DEEP.forEach((k) => worlds[k].update(t, time));
    updateTransition(dt);
    for (const k of DEEP) {
      updateTween(worlds[k], dt);
      if (active === k && !transition) worlds[k].controls.update();
    }
    insets.forEach((ins) => { ins.mat.uniforms.uFade.value = transition ? 0 : lerp(ins.mat.uniforms.uFade.value, 1, 0.15); });
    updateLabels(t);
    if (active !== 'lab' && !transition && needPick && pointer) {
      needPick = false;
      const it = pick();
      if (it) showTip(it); else hideTip();
    } else if (active === 'lab' || transition) hideTip();
  }

  function render() {
    others().forEach((k, i) => {
      const w = worlds[k], ins = insets[i];
      positionInsetCam(w);
      const bg = w.scene.background;
      w.scene.background = w.bg;
      renderer.setRenderTarget(ins.rt);
      renderer.render(w.scene, w.insetCam);
      w.scene.background = bg;
    });
    renderer.setRenderTarget(null);
    const aw = worlds[active];
    renderer.render(aw.scene, aw.camera);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(overlayScene, overlayCam);
    renderer.autoClear = true;
  }

  stage.onResize(resize);
  stage.setRender(render);
  document.body.dataset.scale = active;
  refreshInsets();

  return {
    get scale() { return active; },
    get transitioning() { return !!transition; },
    go, onStep, update, worlds, names: NAMES, order: ORDER,
  };
}
