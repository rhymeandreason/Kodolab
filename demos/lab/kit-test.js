/* Spike: cell-division/ (classic, written on r128) as a zoom level of a lab on the lab's three.
 * The world adapter here moves into the onion root lab once it exists. */
import * as THREE from 'three';
import { V3, LIGHT, createStage, createMaterials, createZoom, chromeInsets, bindChrome, makeBench, makeDish } from './lab.js';
import { loadClassic } from './kit.js';

await loadClassic(['../lib/palette.js', '../cell-division/core.js', '../cell-division/materials.js',
                   '../cell-division/objects.js', '../cell-division/scenarios.js']);
const CD = globalThis.CD;

/* A zoom.js world around CD.World. No scene.environment: the original draws without one, and
   three-compat would hand it to every standard material as a reflection. */
function createDivisionWorld() {
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.75 * LIGHT));
  const key = new THREE.DirectionalLight(0xffffff, 1.2 * LIGHT);
  key.position.set(4, 6, 8);
  const fill = new THREE.DirectionalLight(0x88aaff, 0.45 * LIGHT);
  fill.position.set(-6, -2, -4);
  scene.add(key, fill);
  if (!CD.mat) CD.initShared();
  const defs = { mitosis: CD.buildMitosis(), meiosis: CD.buildMeiosis() };
  const opts = { membrane: true, spindle: true };
  let def = defs.mitosis, world = new CD.World(scene, def);
  const dir = V3(0.22, 0.3, 1).normalize();
  return {
    scene, fov: 32, minDist: 6, maxDist: 60,
    views: [{ pos: dir.clone().multiplyScalar(18), target: V3(0, 0, 0) }],
    labels: [], interactives: [],
    get def() { return def; },
    setMode(m) { world.dispose(); def = defs[m]; world = new CD.World(scene, def); },
    update(t, time) { world.update(t, time, opts); },
  };
}

const stage = createStage({
  canvas: document.getElementById('scene'),
  views: { bench: { t: V3(0, 2, 0), p: V3(0, 30, 44) } },
  insets: (w, h) => chromeInsets(w, h),
});
const mat = createMaterials(stage);
stage.scene.add(makeBench(mat).group);
stage.scene.add(makeDish(mat).group);

const cell = createDivisionWorld();
const S = { t: 0 };
const zoom = createZoom(stage, {
  levels: [{ key: 'cell', world: cell, name: 'Cell', meta: 'onion root tip', bg: '#eef0f7' }],
  getT: () => S.t,
  getStep: () => 0,
});
stage.onFrame((dt) => zoom.update(dt));

const $t = document.getElementById('t'), $phase = document.getElementById('phase'), $mode = document.getElementById('mode');
let mode = 'mitosis';
function readout() {
  const d = cell.def, p = d.phases.find((x) => S.t >= x.start && S.t < x.end) || d.phases[d.phases.length - 1];
  $phase.textContent = `${p.name || p.label || ''} · ${S.t.toFixed(1)} / ${d.total.toFixed(1)} s`;
}
$t.max = cell.def.total;
$t.addEventListener('input', () => { S.t = +$t.value; readout(); });
$mode.addEventListener('click', () => {
  mode = mode === 'mitosis' ? 'meiosis' : 'mitosis';
  cell.setMode(mode);
  $mode.textContent = mode === 'mitosis' ? 'Meiosis' : 'Mitosis';
  $t.max = cell.def.total; S.t = 0; $t.value = 0; readout();
});
readout();

bindChrome({ stage, expose: { stage, zoom, cell, S } });
stage.start();
requestAnimationFrame(() => zoom.go('cell'));   // go() before the first frame is dropped
