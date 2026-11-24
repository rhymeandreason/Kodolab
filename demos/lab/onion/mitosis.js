/* The microscope view's 3D model: cell-division/'s plant mitosis track, playing in the panel
 * beside the eyepiece, on the lab's own three.js (lab/kit.js). The track names seven phases;
 * the panel shows the five a student names in a squash (stains.js's STAGE_OF_PHASE).
 *
 *   const m = createMitosis(panelEl, stages);   // stages: [{ name, key, desc, color }], five
 *   m.start(); m.stop();                        // while the microscope view is open
 *   m.frame(dt, now);                           // from the view's own loop
 *   m.show(stage);                              // jump to the start of a stage (0..4)
 *
 * The scripts load in the background, so the panel may draw nothing for its first frames.
 * No scene.environment: the original draws without one, and three-compat would hand it to
 * every standard material as a reflection.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { V3, LIGHT, srgbOut } from '../lab.js';
import { loadClassic } from '../kit.js';
import { STAGE_OF_PHASE } from './stains.js';

const ready = loadClassic(['../lib/palette.js', '../cell-division/core.js', '../cell-division/materials.js',
  '../cell-division/objects.js', '../cell-division/scenarios.js']).then(() => globalThis.CD);

export function createMitosis(panel, stages) {
  const view = panel.querySelector('.model-view');
  const canvas = document.createElement('canvas');
  view.appendChild(canvas);
  const playBtn = panel.querySelector('.model-play'), scrub = panel.querySelector('.model-scrub');
  const chips = panel.querySelector('.stage-chips'), title = panel.querySelector('.model-stage'), desc = panel.querySelector('.model-desc');
  chips.innerHTML = stages.map((s, i) => `<button data-i="${i}" style="--c:${s.color}" title="${s.name}">${s.key}</button>`).join('');

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  srgbOut(renderer);
  renderer.toneMapping = THREE.NoToneMapping;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
  scene.add(camera, new THREE.AmbientLight(0xffffff, 0.75 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 1.2 * LIGHT);
  key.position.set(4, 6, 8);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.45 * LIGHT);
  fill.position.set(-6, -2, -4);
  camera.add(key, key.target, fill, fill.target);   // highlights stay put as the reader orbits
  const HOME = V3(0.22, 0.3, 1).normalize();
  const controls = new OrbitControls(camera, canvas);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, rotateSpeed: 0.7, zoomSpeed: 0.8 });

  let CD = null, def = null, world = null, starts = [];
  let t = 0, playing = true, running = false, shown = -1;
  const opts = { membrane: true, spindle: true };

  function stageAt(time) {
    const p = def.phases.find((x) => time >= x.start && time < x.end) || def.phases[def.phases.length - 1];
    return STAGE_OF_PHASE[p.name] ?? 0;
  }
  function frameCell() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h || !def) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const d = Math.max(def.extent.h, def.extent.w / camera.aspect) / tanV * 1.08;
    camera.position.copy(HOME).multiplyScalar(d);
    controls.minDistance = d * 0.45; controls.maxDistance = d * 2;
  }
  new ResizeObserver(frameCell).observe(view);

  function render() {
    const s = stageAt(t);
    if (s !== shown) {
      shown = s;
      chips.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === s));
      title.textContent = stages[s].name;
      title.style.setProperty('--sc', stages[s].color);
      desc.innerHTML = stages[s].desc;
    }
    scrub.value = Math.round((t / def.total) * 1000);
  }
  function setPlaying(on) {
    playing = on;
    playBtn.querySelector('i').className = on ? 'ph-fill ph-pause' : 'ph-fill ph-play';
  }

  ready.then((cd) => {
    CD = cd;
    if (!CD.mat) CD.initShared();
    def = CD.buildMitosis({ plant: true });
    world = new CD.World(scene, def);
    // the first phase of each stage, in order
    starts = stages.map((_, i) => (def.phases.find((p) => STAGE_OF_PHASE[p.name] === i) || def.phases[0]).start);
    frameCell();
    render();
  }).catch((e) => console.error(e));

  playBtn.addEventListener('click', () => setPlaying(!playing));
  scrub.addEventListener('input', () => { if (!def) return; setPlaying(false); t = (scrub.value / 1000) * def.total; render(); });
  chips.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) api.show(+b.dataset.i); });

  const api = {
    start() { running = true; frameCell(); },
    stop() { running = false; },
    show(stage) {
      if (!def) return;
      setPlaying(false);
      t = starts[stage] + 0.05;   // just inside the phase, past its boundary
      render();
    },
    frame(dt, now) {
      if (!running || !world) return;
      if (playing) { t = (t + dt) % def.total; render(); }
      world.update(t, now / 1000, opts);
      controls.update();
      renderer.render(scene, camera);
    },
  };
  return api;
}
