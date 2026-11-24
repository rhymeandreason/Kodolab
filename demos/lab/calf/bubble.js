/* Bubble level: a fixed patch of astrocyte endfoot membrane, aquaporin-4 only, water crossing.
 * A world for Lab's zoom.js, built on the membrane component (membrane/membrane.js), not
 * drawn here. Blood is the upper compartment, the astrocyte the lower.
 *
 *   await loadMembrane();                  // once: the classic scripts, on the lab's three.js
 *   const bubble = createBubbleLevel(env);
 *
 * It follows the bench through st = { na, cellOsm?, ... } like brain.js: blood Na⁺ in mEq/L,
 * what the cell holds in mOsm.
 *
 * HOW WATER KNOWS WHICH WAY. The component has no pressure or potential for water. Its rule is
 * the headcount: the side with more FREE water sends, and every solute particle sits where a
 * water would have been, so more dissolved particles means fewer free waters. Osmolality is
 * therefore handed over as solute counts (units 'mM', 10 mOsm a particle) and the membrane does
 * the rest. Water equalises its headcount in a few crossings, which is a closed box finding
 * balance. A patch of membrane has the whole blood and the whole cell behind it, so update()
 * tops each side back up to its count (set({contents}) reconciles, a water that crossed stays
 * crossed) and the flow lasts as long as the imbalance does. The flow's size is the
 * component's, not the gap's: it is one-way and full rate until the counts meet.
 *
 * Na⁺ and Cl⁻ (blood) and K⁺ and the cell's anions have no pore here, so none can cross. */
import * as THREE from 'three';
import { loadClassic } from '../kit.js';
import { T, fmt, LIGHT } from '../lab.js';
import { plasmaOsm, CELL_OSM, HEALTHY_NA } from './model.js';

const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TXB = (T.levels && T.levels.bubble) || {};
/** A string from T.levels.bubble (text.js), with a bare fallback until it is written. */
const tx = (path, fallback) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), TXB) ?? fallback;

const MM = 10;                      // mOsm per drawn solute particle
const PER_SIDE = 70;                // water + solute particles on each side
const EXTENT = 64;                  // half-height of each compartment, world units
const SPREAD = 118;                 // ±x the particles scatter
const AQP_X = [-108, -36, 36, 108]; // the component keeps pores 72 apart
const PIN_EVERY = 0.25;            // s between top-ups
const PIN_AT = 1;                  // top up when a side's free water is this far from its count

const CLASSIC = [
  '../lib/palette.js', '../lib/tokens-from-palette.js', '../lib/molecules.js', '../lib/mol-small.js',
  '../lib/atomkit.js', '../lib/scene.js', '../kit/card-stage.js',
  '../membrane/parts.js', '../membrane/chemiosmosis.js', '../membrane/sheet.js', '../membrane/membrane.js',
];
let loading = null;
/** The classic scripts the membrane component stands on, once, in dependency order. */
export function loadMembrane() {
  return loading || (loading = loadClassic(CLASSIC));
}

export function createBubbleLevel(env) {
  const { Membrane } = globalThis;
  if (!Membrane) throw new Error('bubble.js: await loadMembrane() before createBubbleLevel()');
  const scene = new THREE.Scene();
  scene.environment = env;
  scene.add(new THREE.HemisphereLight('#ffffff', '#dfe6ec', 0.9 * LIGHT));
  const dir = new THREE.DirectionalLight('#ffffff', 0.8 * LIGHT); dir.position.set(60, 140, 200); scene.add(dir);
  const root = new THREE.Group();
  scene.add(root);

  /* the component turns its charge badges toward a camera; zoom.js makes the real one and hangs
     it on the world, so a stand-in follows it */
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 1000);
  let na = HEALTHY_NA, cellOsm = CELL_OSM;

  /* solute particles per side from osmolality; blood's split into Na⁺ and Cl⁻ (glucose and urea
     folded in), the cell's into K⁺ and the anions that cannot leave */
  function counts() {
    const nb = Math.round(plasmaOsm(na) / MM), nc = Math.round(cellOsm / MM);
    return { na: Math.ceil(nb / 2), cl: Math.floor(nb / 2), k: Math.ceil(nc / 2), a: Math.floor(nc / 2) };
  }
  function contents() {
    const c = counts();
    return { outside: { NA: c.na * MM, CL: c.cl * MM }, inside: { K: c.k * MM, A: c.a * MM } };
  }

  const sim = Membrane.create(THREE, root, cam, {
    proteins: { AQP: AQP_X.map((x) => ({ x })) }, units: 'mM', mMPerParticle: MM, particlesPerSide: PER_SIDE,
    extent: EXTENT, spread: SPREAD, contents: contents(),
  });
  sim.set({ cut: true });

  const tot = { in: 0, out: 0, pore: 0 };   // water crossings since the two sides last balanced
  sim.on('cross', (t, d) => { if (t.kind === 'water') tot[d < 0 ? 'in' : 'out']++; });
  sim.on('conduct', (t) => { if (t.kind === 'water') tot.pore++; });

  let last = null, pinned = -1e9;
  function pin(time) {
    const c = counts(), w = sim.state().counts.water || { inside: 0, outside: 0 };
    const wantOut = PER_SIDE - c.na - c.cl, wantIn = PER_SIDE - c.k - c.a;
    if (Math.abs(w.outside - wantOut) < PIN_AT && Math.abs(w.inside - wantIn) < PIN_AT) return;
    if (time - pinned < PIN_EVERY) return;
    pinned = time;
    sim.set({ contents: contents() });
  }

  function update(st, time) {
    const was = na + '|' + cellOsm;
    na = st.na;
    cellOsm = st.cellOsm || CELL_OSM;
    if (flow() === 0) { tot.in = 0; tot.out = 0; tot.pore = 0; }
    if (was !== na + '|' + cellOsm) sim.set({ contents: contents() });
    if (api.camera) { cam.position.copy(api.camera.position); cam.quaternion.copy(api.camera.quaternion); cam.updateMatrixWorld(true); }
    const dt = last == null ? 0 : Math.min(0.05, time - last);
    last = time;
    if (dt > 0) sim.step(dt);
    pin(time);
  }

  /* ---------- labels, hover info, cues ---------- */
  const pores = () => sim.pores().filter((p) => p.kind === 'water');
  const labels = [
    { key: 'blood', text: tx('labels.blood.text', 'Blood side'), sub: tx('labels.blood.sub'), anchor: () => V3(-SPREAD + 24, EXTENT * 0.8, 0), show: () => true },
    { key: 'cell', text: tx('labels.cell.text', 'Astrocyte'), sub: tx('labels.cell.sub'), anchor: () => V3(-SPREAD + 24, -EXTENT * 0.8, 0), show: () => true },
    { key: 'aqp', text: tx('labels.aqp.text', 'Aquaporin-4'), sub: tx('labels.aqp.sub'), anchor: () => V3(pores()[1].x, 22, 0), show: () => true },
    { key: 'bilayer', text: tx('labels.bilayer.text', 'Membrane'), sub: tx('labels.bilayer.sub'), anchor: () => V3(SPREAD - 30, 0, 0), show: () => true },
  ];
  const interactives = [
    ...root.children.filter((c) => c.name === 'aquaporin').map((g) => ({ root: g, priority: 2, info: () => tx('info.aqp', { title: 'Aquaporin-4', text: '' }) })),
    { root: sim.membrane.group, priority: 0, info: () => tx('info.bilayer', { title: 'Lipid bilayer', text: '' }) },
  ];
  /** +1 water is going into the cell, -1 out, 0 neither: the sign of blood's dilution. */
  const flow = () => { const d = cellOsm - plasmaOsm(na); return Math.abs(d) < 2 ? 0 : d > 0 ? 1 : -1; };
  function cue() {
    const f = flow();
    if (f === 0) return { text: tx('cues.even', 'Even'), mark: 'aqp' };
    return f > 0 ? { text: tx('cues.entering', 'Water enters') + ' · ' + fmt(tx('tally', '{in} in, {out} out'), tally()), mark: 'cell' }
      : { text: tx('cues.leaving', 'Water leaves') + ' · ' + fmt(tx('tally', '{in} in, {out} out'), tally()), mark: 'blood' };
  }
  const tally = () => {
    const w = sim.state().counts.water || { inside: 0, outside: 0 };
    return { in: tot.in, out: tot.out, cell: w.inside, total: w.inside + w.outside };
  };

  const api = {
    scene, labels, interactives, update, cue, tally, flow,
    sim,
    fov: 34, near: 1, far: 2000, minDist: 110, maxDist: 520,
    views: [{ pos: V3(0, 20, 300), target: V3(0, 0, 0) }],
  };
  return api;
}
