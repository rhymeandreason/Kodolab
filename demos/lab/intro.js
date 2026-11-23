/* The intro card every lab opens with (from Ecoli). page.js frames the page's .lab-intro into
 * it during parsing, so it shows at once while three.js and the bench load, and it stands in
 * for a loading screen:
 * the Start button waits ("Setting up the bench…") until the first frame has drawn.
 *
 *   createIntro(stage, {
 *     art: (box) => createPropArt(box, (mat) => makeStrawberry(mat, { calyx: true }).group),
 *   });
 *
 * The markup page.js builds (styles in lab.css):
 *   <div class="intro" id="intro"><div class="intro-card">
 *     <div class="intro-art"></div>
 *     <div>
 *       <div class="modal-kicker">…</div><h2>Make bacteria <em>glow</em></h2><p>…</p>
 *       <ul class="keys"><li><i style="--c:#22c55e"></i><span><b>GFP</b> makes …</span></li></ul>
 *       <button class="btn intro-start" id="startBtn">Start the experiment <i class="ph-bold ph-arrow-right"></i></button>
 *     </div>
 *   </div></div>
 *
 * intro.started resolves on Start: begin the opening camera move from the overview then, e.g.
 *   onEnter: (step) => { if (first) intro.started.then(() => stage.focus(step.view, 2)); … }
 *
 * art(box) draws into .intro-art and returns { stop } (called when the card closes).
 * To show the art sooner, start it from its own small module, loaded before main.js, so it
 * doesn't wait for the whole library and the bench (strawberry/intro-art.js):
 *   <script type="module" async src="intro-art.js"></script>
 *   // intro-art.js
 *   const box = document.querySelector('.intro-art');
 *   box.introArt = createPropArt(box, (mat) => makeStrawberry(mat).group);
 * createIntro then uses box.introArt instead of calling art().
 * Add ?intro=0 to the URL to skip the card (handy while working on a lab).
 */
import * as THREE from 'three';
import { studioEnv } from './core/stage.js';
import { createMaterials } from './materials.js';

export function createIntro(stage, { art = null, onStart = () => {} } = {}) {
  const el = document.getElementById('intro');
  if (!el) return { close() {}, get open() { return false; } };
  const btn = el.querySelector('.intro-start');
  const box = el.querySelector('.intro-art');
  const label = btn.innerHTML;
  let open = true, ready = false, begin;
  const started = new Promise((res) => { begin = res; });

  btn.disabled = true;
  btn.classList.add('wait');
  btn.innerHTML = '<span class="intro-spin"></span>Setting up the bench…';
  stage.onFirstFrame(() => setTimeout(() => {
    ready = true;
    btn.disabled = false;
    btn.classList.remove('wait');
    btn.innerHTML = label;
  }, 150));

  // the art may be started by the sim's small intro-art.js instead (see the header), before or after this
  if (art && box && !box.introArt) { try { box.introArt = art(box); } catch (e) { console.warn('intro art', e); } }
  const stopArt = () => { if (box && box.introArt && box.introArt.stop) box.introArt.stop(); };

  function close() {
    if (!open || !ready) return;
    open = false;
    el.classList.add('hide');
    stopArt();
    onStart();
    begin();
  }
  btn.addEventListener('click', close);
  window.addEventListener('keydown', (e) => { if (open && e.key === 'Enter') close(); });

  if (new URLSearchParams(location.search).get('intro') === '0') {
    el.classList.add('hide'); open = false;
    stopArt();
    stage.onFirstFrame(() => { onStart(); begin(); });
  }
  /** started: resolves when the student clicks Start (the lab's opening camera move waits for it). */
  return { close, started, get open() { return open; }, get ready() { return ready; } };
}

/** A lab prop turning slowly on its own small renderer: the default intro art.
 *  build(mat) returns a THREE.Object3D (a prop's .group). It is centred and sized to the box.
 *  tilt: radians the turntable leans toward the viewer; spin: radians per second. */
export function createPropArt(box, build, { tilt = 0.45, spin = 0.35, fill = 0.78 } = {}) {
  const cv = document.createElement('canvas');
  box.appendChild(cv);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.setClearColor(0, 0);
  r.outputEncoding = THREE.sRGBEncoding;
  r.toneMapping = THREE.ACESFilmicToneMapping;
  r.toneMappingExposure = 0.88;
  const sc = new THREE.Scene();
  // lit like the bench (core/stage.js): the same studio room, sky fill, sun and fill light
  sc.environment = studioEnv(r);
  sc.add(new THREE.HemisphereLight(0xffffff, 0xc4ccd4, 0.62));
  const sun = new THREE.DirectionalLight(0xfffaf2, 0.78); sun.position.set(-35, 90, 50); sc.add(sun);
  const fillL = new THREE.DirectionalLight(0xeaf2ff, 0.3); fillL.position.set(60, 40, 80); sc.add(fillL);

  const mat = createMaterials(null);
  const obj = build(mat);
  // centre it on the turntable and size the camera to it
  const bb = new THREE.Box3().setFromObject(obj), c = new THREE.Vector3(), s = new THREE.Vector3();
  bb.getCenter(c); bb.getSize(s);
  obj.position.sub(c);
  const spinner = new THREE.Group(); spinner.add(obj);
  const table = new THREE.Group(); table.add(spinner); table.rotation.x = tilt;
  sc.add(table);
  const rad = s.length() / 2;
  const cam = new THREE.PerspectiveCamera(30, 1, 0.01, 1000);
  const dist = rad / Math.sin(THREE.MathUtils.degToRad(30) / 2) * (1 / fill) * 0.62;
  cam.position.set(0, 0, dist); cam.near = dist / 100; cam.far = dist * 4; cam.updateProjectionMatrix();

  let w = 0, h = 0, run = true;
  function size() { w = box.clientWidth; h = box.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const ro = new ResizeObserver(size); ro.observe(box); size();
  const t0 = performance.now();
  (function loop() {
    if (!run) return;
    const T = (performance.now() - t0) / 1000;
    spinner.rotation.y = T * spin;
    table.rotation.x = tilt + Math.sin(T * 0.5) * 0.04;
    r.render(sc, cam);
    if (!box.classList.contains('drawn')) box.classList.add('drawn'); // fades the canvas in
    requestAnimationFrame(loop);
  })();
  return {
    stop() {
      if (!run) return; run = false; ro.disconnect();
      setTimeout(() => { r.dispose(); r.forceContextLoss(); }, 600);
    },
  };
}
