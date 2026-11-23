/* Glowing E. coli — bacterial transformation lab, rebuilt on the shared Lab library.
 * The original lives in /Ecoli and is untouched.
 *
 * The bench is rebuilt from scratch whenever the student jumps on the timeline
 * (rebuild()), and each step's click is one async action (anim/moveTo/wait).
 * The cell level (cell.js) follows the bench through S.micro, the stage the
 * cells have reached, which the actions set as they go. */
import * as THREE from 'three';
import {
  V3, Q, clamp, lerp, smooth, Ease,
  rand, newSession, anim, wait, moveTo,
  disposeTree, toast, mesh,
  createStage, createMaterials, createInteraction, createLesson, createFollowCam, createZoom, createIntro,
  makeBench, makeMicroTube, makeTubeRack, makeReagentBottle, makeIceBath, makeWaterBath,
  makeAgarPlate, makeBenchCard, makePipette, makeLoop, makeToolHolder, makeWasteBin, makeUvLamp,
} from '../lab.js';
import { createCell, captionFor } from './cell.js';

const $ = (s) => document.querySelector(s);

// =========================================================================
// Layout (units: cm, bench top at y = 0)
// =========================================================================
const POS = {
  bath: V3(-38, 0, 1), ice: V3(-21, 0, 1.5),
  cacl2: V3(-10, 0, -8), lb: V3(-4, 0, -9),
  rack: V3(0, 0, 1.5),
  pipHolder: V3(6.5, 0, 6.5), loopHolder: V3(9.5, 0, 6.5),
  vial: V3(14, 0, 1.5), starter: V3(21.5, 0, 1.5),
  waste: V3(10, 0, -9), lamp: V3(22, 1.25, -8.5),
};
const PLATE_Z = 14.5;
const PLATES = [
  { x: -15, title: 'LB / amp', sub: '− plasmid', src: 'minus', colonies: 0, desc: 'Ampicillin agar, cells without the plasmid.' },
  { x: -5, title: 'LB', sub: '− plasmid', src: 'minus', lawn: true, desc: 'Plain nutrient agar, cells without the plasmid.' },
  { x: 5, title: 'LB / amp', sub: '+ plasmid', src: 'plus', colonies: 42, desc: 'Ampicillin agar, transformed cells.' },
  { x: 15, title: 'LB / amp / ara', sub: '+ plasmid', src: 'plus', colonies: 46, glow: true, desc: 'Ampicillin + arabinose agar, transformed cells.' },
];
const PIP_SCALE = 0.6;                      // the 14 cm transfer pipette, at a bench-friendly size
const COL = { cacl2: '#cfe6ff', cells: '#efe5c9', lb: '#f1d58a', recovered: '#ecd38e' };
const hex = (c) => new THREE.Color(c).getHex();

const VIEWS = {
  overview: { t: V3(-8, 2, 5), p: V3(-8, 48, 72) },
  back: { t: V3(0, 4, -1), p: V3(0, 36, 38) },          // bottles, tubes, pipette and waste
  starter: { t: V3(13, 3, 0), p: V3(13, 28, 42) },      // starter plate, plasmid, tubes, loop
  ice: { t: V3(-11, 3, 1), p: V3(-10, 28, 42) },        // the rack and the ice bath
  bath: { t: V3(-29, 3, 2), p: V3(-28, 28, 42) },       // the ice bath and the water bath
  plates: { t: V3(0, 2, 8), p: V3(0, 42, 58) },
  uv: { t: V3(0, 4, 12), p: V3(0, 34, 50) },
  results: { t: V3(0, 1, 14), p: V3(0, 42, 50) },     // the four plates, above the wide complete card
};

// =========================================================================
// Stage, materials, zoom level
// =========================================================================
const stage = createStage({
  canvas: $('#scene'),
  views: VIEWS,
  controls: { minDistance: 8, maxDistance: 160 },
  insets: (w, h) => {
    // bottom: the instruction card, captions or timeline, whichever is higher (hidden ones don't count)
    const tops = ['.lab-card', '.lab-captions', '.lab-timeline'].map((q) => document.querySelector(q))
      .map((el) => el && el.getBoundingClientRect()).filter((r) => r && r.height).map((r) => r.top);
    const bottom = tops.length ? h - Math.min(...tops) : 0;
    if (w > 820) {
      const z = $('#zoomInsets').getBoundingClientRect();
      const panel = $('#stepsPanel').getBoundingClientRect(); // hidden in Watch mode
      return { left: panel.width ? panel.right + 20 : 0, right: w - z.left + 10, bottom };
    }
    return { top: 60, bottom };
  },
});
const { scene } = stage;
const mat = createMaterials(stage);

let root = null;   // everything on the bench
let B = null;      // props
let S = null;      // experiment state (recreated by rebuild())
let ara = true;    // cell view: with or without arabinose (a view choice; survives rebuilds)
let lesson, ix;

const cellState = { stage: 0, ara: true, uv: 0 };
const zoom = createZoom(stage, {
  levels: [{ key: 'cell', world: createCell(stage.env), name: 'Cell', meta: '≈ 5 µm', bg: '#eef1f8' }],
  getT: () => { cellState.stage = S ? S.micro : 0; cellState.ara = ara; cellState.uv = S ? S.uv : 0; return cellState; },
  getStep: () => 0,
  onChange: () => { lesson.render(); requestAnimationFrame(() => stage.resize()); },
});

// =========================================================================
// The bench — rebuilt from scratch whenever the student jumps on the timeline
// =========================================================================
function place(prop, pos, rotY = 0) {
  prop.group.position.copy(pos);
  if (rotY) prop.group.rotation.y = rotY;
  root.add(prop.group);
  return prop;
}

function rebuild() {
  if (root) { scene.remove(root); disposeTree(root); }
  ix.clear();
  root = new THREE.Group();
  scene.add(root);

  place(makeBench(mat), V3());
  const rack = place(makeTubeRack(mat, { block: true, holes: 2, spacing: 4, holeR: 1.05, color: hex('#c3cdf4') }), POS.rack);
  const plus = place(makeMicroTube(mat, { color: hex('#6366f1'), label: '+' }), POS.rack.clone().add(rack.holes[0]));
  const minus = place(makeMicroTube(mat, { color: hex('#94a3b8'), label: '−' }), POS.rack.clone().add(rack.holes[1]));
  const cacl2 = place(makeReagentBottle(mat, { title: 'CaCl₂', line: 'TRANSFORMATION', note: '0.05 M · ice-cold', color: '#0ea5e9', liquidColor: hex('#d6ecff') }), POS.cacl2, 0.2);
  const lb = place(makeReagentBottle(mat, { title: 'LB', line: 'NUTRIENT BROTH', note: 'sterile', color: '#f59e0b', liquidColor: hex('#f1d58a') }), POS.lb, -0.15);
  lb.liquid.setFraction(0.7);
  const ice = place(makeIceBath(mat, { cubes: 9, seed: 5 }), POS.ice);
  const bath = place(makeWaterBath(mat), POS.bath);
  const vialHolder = place(makeToolHolder(mat, { color: hex('#bfe8cc') }), POS.vial);
  const vial = place(makeMicroTube(mat, { color: hex('#22c55e'), liquidColor: hex('#e6f7ea') }), POS.vial.clone().add(V3(0, 0.2, 0)));
  vial.liquid.setLevel(0.9);
  const starter = place(makeAgarPlate(mat, { streak: true, seed: 2, agar: '#eac77a' }), POS.starter);
  const plates = PLATES.map((P, i) => {
    const p = place(makeAgarPlate(mat, { colonies: P.colonies, lawn: P.lawn, glow: P.glow, seed: 10 + i, agar: i === 3 ? '#eccb80' : '#ebc97e' }), V3(P.x, 0, PLATE_Z));
    place(makeBenchCard(mat, { title: P.title, sub: P.sub, subColor: P.src === 'plus' ? '#4f46e5' : '#64748b' }), V3(P.x, 0, PLATE_Z + 6.2));
    return p;
  });
  place(makeToolHolder(mat), POS.pipHolder);
  place(makeToolHolder(mat), POS.loopHolder);
  const pip = makePipette(mat, { fluid: mat.make.liquid(hex(COL.cacl2), 0.85) });
  pip.group.scale.setScalar(PIP_SCALE);
  place(pip, POS.pipHolder.clone().add(V3(0, 0.3, 0)));
  const loop = place(makeLoop(mat), POS.loopHolder.clone().add(V3(0, 0.3, 0)));
  const waste = place(makeWasteBin(mat), POS.waste, 0.3);
  const lamp = place(makeUvLamp(mat), POS.lamp);
  lamp.group.quaternion.copy(Q(-Math.PI / 2, 0, 0));
  const uvFill = new THREE.HemisphereLight(0x5b3fd6, 0x120a2a, 0);
  root.add(uvFill);

  B = { rack, plus, minus, cacl2, lb, ice, bath, vial, starter, plates, pip, loop, waste, lamp, uvFill };
  S = {
    micro: 0,          // what the cell level shows (cell.js)
    uv: 0, day: 0, sunA: 0, // lights: UV on, the overnight day/night shift, the sun's angle
    clock: null,       // the card's timer text while a timed step runs
    cap: null,         // Watch mode caption override while an action runs
    used: 0,           // used pipettes and loops in the waste bin
    envMats: null,     // materials whose reflections dim under UV (collected on first use)
  };

  // targets
  ix.register('cacl2', cacl2.group, { name: 'CaCl₂ transformation solution', short: 'CaCl₂', desc: 'Ice-cold calcium chloride helps DNA stick to the cell surface.', anchor: V3(0, 11, 0) });
  ix.register('lb', lb.group, { name: 'LB nutrient broth', short: 'LB broth', desc: 'Food for the cells while they recover.', anchor: V3(0, 11, 0) });
  ix.register('starter', starter.group, { name: 'E. coli starter plate', short: 'Starter plate', desc: 'Colonies of ordinary, non-glowing E. coli.', anchor: V3(0, 1.2, 0) });
  ix.register('plasmid', vial.group, { name: 'GFP plasmid', short: 'Plasmid', desc: 'A ring of DNA carrying the GFP, bla and araC genes.', anchor: V3(0, 5.6, 0), ringAround: vialHolder.group });
  ix.addGroup('plasmid', vialHolder.group);
  ix.register('ice', ice.group, { name: 'Ice bath', short: 'Ice bath', desc: 'Keeps the tubes at 0 °C.', anchor: V3(0, 4.2, 0) });
  ix.register('bath', bath.group, { name: 'Water bath · 42 °C', short: 'Water bath', desc: 'Used for the 50-second heat shock.', anchor: V3(0, 6, 0) });
  ix.register('plates', plates[0].group, { name: 'Agar plates', short: 'Agar plates', desc: PLATES.map((P) => `${P.title} (${P.sub})`).join(' · '), anchor: V3(0, 1.2, 0) });
  plates.slice(1).forEach((p) => ix.addGroup('plates', p.group));
  ix.register('uv', lamp.group, { name: 'UV lamp', short: 'UV lamp', desc: 'Ultraviolet light makes GFP fluoresce.', anchor: V3(0, 0, 1.8) });
  // things to hover for their name and what they do
  ix.register('tubes', plus.group, { name: 'Microcentrifuge tubes', desc: '+ plasmid (indigo cap) gets the GFP plasmid. − plasmid (grey cap) is the control: same cells, no plasmid.' });
  ix.addGroup('tubes', minus.group);
  ix.register('pipette', pip.group, { name: 'Sterile transfer pipette', desc: 'Disposable: a fresh one whenever it could carry cells somewhere they shouldn’t go.' });
  ix.register('loop', loop.group, { name: 'Sterile inoculation loop', desc: 'Disposable: a fresh loop for every transfer, so nothing gets cross-contaminated.' });
  ix.register('waste', waste.group, { name: 'Biohazard waste', desc: 'Used loops and pipettes go here and are autoclaved later.' });
  ix.register('rack', rack.group, { name: 'Tube rack', desc: 'Holds the two tubes upright.' });

  applyLights();
}

// =========================================================================
// Lights: UV and the overnight day/night shift, posed from S every frame
// =========================================================================
const SUN0 = stage.lights.sun.position.clone();
const LIGHT0 = { hemi: stage.lights.hemi.intensity, sun: stage.lights.sun.intensity, fill: stage.lights.fill.intensity };
// The overnight time-lapse keeps hard studio contrast: the sweeping shadows are the clock.
// It eases in from the bench's softer light as the sun starts to move, and back out.
const LIGHT_TL = { hemi: 0.42, sun: 0.95, fill: 0.25 };
const SUN_WARM = new THREE.Color(0xffd7a3), SUN_WHITE = stage.lights.sun.color.clone();
function applyLights() {
  const u = S ? S.uv : 0, d = S ? S.day : 0, a = S ? S.sunA : 0;
  const { hemi, sun, fill } = stage.lights;
  const w = Math.min(1, 4 * Math.sin(a / 2)), base = (k) => LIGHT0[k] + (LIGHT_TL[k] - LIGHT0[k]) * w;
  hemi.intensity = base('hemi') * (1 - 0.43 * d) * (1 - u);
  sun.intensity = base('sun') * (1 - 0.5 * d) * (1 - u);
  fill.intensity = base('fill') * (1 - u);
  sun.position.set(SUN0.x * Math.cos(a) + 90 * Math.sin(a), SUN0.y * (0.85 + 0.15 * Math.cos(a)), SUN0.z * Math.cos(a));
  sun.color.copy(SUN_WHITE).lerp(SUN_WARM, Math.sin(Math.min(Math.PI, a / 2)) * (a > 0 ? 1 : 0));
  if (!B) return;
  B.uvFill.intensity = 0.2 * u;
  B.lamp.setOn(u);
  B.plates.forEach((p) => p.setGlow(u));
  $('#uvBg').style.opacity = String(u);
  document.body.classList.toggle('uv', u > 0.5);
  if (u > 0 && !S.envMats) {
    S.envMats = [];
    root.traverse((o) => { if (!o.material) return; (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { if (m.envMapIntensity !== undefined && !S.envMats.some((e) => e.m === m)) S.envMats.push({ m, v: m.envMapIntensity }); }); });
  }
  if (S.envMats) S.envMats.forEach((e) => { e.m.envMapIntensity = e.v * (1 - 0.92 * u); });
}

// =========================================================================
// Hand tools: pipette and loop
// =========================================================================
const tubeTop = (t) => t.group.position.y + t.h;
const pipRest = () => POS.pipHolder.clone().add(V3(0, 0.3, 0));
const loopRest = () => POS.loopHolder.clone().add(V3(0, 0.3, 0));
const PIP_FLUID = 3.2;   // cm of stem a full draw fills (pipette space)

/** Squeeze the bulb and let it go. */
function squeeze(k, dur = 0.3) {
  return anim(dur, (e, t) => B.pip.setSqueeze(Math.sin(Math.PI * t) * k), Ease.linear);
}
/** Draw liquid up from a surface at (x, z): tip down to surfY, squeeze, release. */
async function pipDraw(x, z, surfY, topY, color) {
  const g = B.pip.group;
  await moveTo(g, { pos: V3(x, topY + 1.5, z), dur: 0.7, arc: 3 });
  await moveTo(g, { pos: V3(x, surfY - 0.5, z), dur: 0.35 });
  B.pip.fluid.material.color.set(color);
  await Promise.all([squeeze(1, 0.4), anim(0.4, (e) => B.pip.setFluid(PIP_FLUID * e))]);
  await moveTo(g, { pos: V3(x, topY + 1.5, z), dur: 0.35 });
}
/** A drop falls from the tip at atY onto toY; onLand runs as it lands. */
async function pipDispense(x, z, atY, toY, onLand) {
  const g = B.pip.group;
  await moveTo(g, { pos: V3(x, atY + 1.2, z), dur: 0.7, arc: 3 });
  await moveTo(g, { pos: V3(x, atY, z), dur: 0.3 });
  const d = mesh(new THREE.SphereGeometry(0.22, 14, 10), mat.make.physical({ color: B.pip.fluid.material.color.clone(), transparent: true, opacity: 0.85, roughness: 0.05, clearcoat: 1 }), { cast: false });
  d.position.set(x, atY - 0.1, z);
  root.add(d);
  squeeze(1, 0.3);
  anim(0.3, (e) => B.pip.setFluid(PIP_FLUID * (1 - e)));
  await anim(0.3, (e) => { d.position.y = lerp(atY - 0.1, toY, e); }, Ease.in);
  root.remove(d); d.geometry.dispose(); d.material.dispose();
  if (onLand) onLand();
  await moveTo(g, { pos: V3(x, atY + 1.2, z), dur: 0.3 });
}
/** Leave a used tool lying in the waste bin (a new copy), and bring a fresh one up from its holder. */
function binCopy(makeCopy) {
  const c = makeCopy();
  const w = POS.waste;
  c.group.position.set(w.x + rand(-1, 1), 1.2, w.z + rand(-1, 1));
  c.group.rotation.set(rand(-0.35, 0.35), rand(0, 6.28), rand(-0.35, 0.35));
  root.add(c.group);
  S.used++;
}
async function discardPipette() {
  const g = B.pip.group, w = POS.waste;
  await moveTo(g, { pos: V3(w.x, 12, w.z), dur: 0.7, arc: 2 });
  await moveTo(g, { pos: V3(w.x, 1.2, w.z), dur: 0.35, ease: Ease.in });
  binCopy(() => { const p = makePipette(mat); p.group.scale.setScalar(PIP_SCALE); return p; });
  B.pip.setFluid(0);
  g.position.copy(pipRest()).add(V3(0, -9, 0));
  await moveTo(g, { pos: pipRest(), dur: 0.55, ease: Ease.out });
}
async function discardLoop() {
  const g = B.loop.group, w = POS.waste;
  g.rotation.y = 0;
  await moveTo(g, { pos: V3(w.x, 11, w.z), dur: 0.7, arc: 2 });
  await moveTo(g, { pos: V3(w.x, 1.2, w.z), dur: 0.35, ease: Ease.in });
  binCopy(() => makeLoop(mat));
  B.loop.setBlob(0); B.loop.setFilm(0);
  g.position.copy(loopRest()).add(V3(0, -8, 0));
  await moveTo(g, { pos: loopRest(), dur: 0.55, ease: Ease.out });
}
function twirl(dur = 0.7) {
  const g = B.loop.group, c = g.position.clone(), a = g.rotation.y;
  return anim(dur, (e, k) => {
    g.rotation.y = a + k * Math.PI * 4;
    const w = Math.sin(k * Math.PI) * 0.18;
    g.position.x = c.x + Math.sin(k * Math.PI * 4) * w;
    g.position.z = c.z + (Math.cos(k * Math.PI * 4) - 1) * w;
  }, Ease.linear);
}
async function loopIntoTube(tube) {
  const g = B.loop.group, p = tube.group.position;
  await moveTo(g, { pos: V3(p.x, tubeTop(tube) + 1.2, p.z), dur: 0.65, arc: 3 });
  await moveTo(g, { pos: V3(p.x, p.y + 1.8, p.z), dur: 0.35 });
  await twirl(0.7);
  await moveTo(g, { pos: V3(p.x, tubeTop(tube) + 1.2, p.z), dur: 0.3 });
}
const cap = (tube, open, dur = 0.35) => { const a = tube.capOpen; return anim(dur, (e) => tube.setCap(lerp(a, open ? 1 : 0, e))); };
/** Unscrew a bottle's cap and set it on the bench beside it (cap is in bottle space). */
function bottleCap(b, open) {
  return moveTo(b.cap, { pos: open ? V3(2.8, 0.5, 1.4) : V3(0, 9.9, 0), dur: 0.55, arc: 2 });
}
const level = (tube, cm, dur = 0.45) => { const a = tube.liquid.level; return anim(dur, (e) => tube.liquid.setLevel(lerp(a, cm, e))); };
function tint(tube, color, dur = 0.6) {
  const c0 = new THREE.Color(tube.liquid.mesh.material.color), c1 = new THREE.Color(color);
  const c = new THREE.Color();
  return anim(dur, (e) => tube.liquid.setColor(c.copy(c0).lerp(c1, e)));
}
/** Lift a tube straight up, carry it level, then lower it straight down (clears container walls). */
function carry(tube, to, dur = 1.4, clear = 7) {
  const o = tube.group, a = o.position.clone(), b = to.clone(), top = Math.max(a.y, b.y) + clear;
  return anim(dur, (e, k) => {
    const h = smooth(clamp((k - 0.25) / 0.5));
    o.position.x = lerp(a.x, b.x, h); o.position.z = lerp(a.z, b.z, h);
    o.position.y = k < 0.5 ? lerp(a.y, top, smooth(clamp(k / 0.3))) : lerp(top, b.y, smooth(clamp((k - 0.7) / 0.3)));
  }, Ease.linear);
}
const SLOTS = {
  rack: () => B.rack.holes.map((h) => POS.rack.clone().add(h)),
  ice: () => [POS.ice.clone().add(V3(-1.45, 0.6, 0)), POS.ice.clone().add(V3(1.45, 0.6, 0))],
  bath: () => [POS.bath.clone().add(V3(-2.3, 1.6, -0.3)), POS.bath.clone().add(V3(2.3, 1.6, -0.3))],
};
const both = (slot, dur) => { const s = SLOTS[slot](); return Promise.all([carry(B.plus, s[0], dur), carry(B.minus, s[1], dur)]); };

/** A timer on the card: counts `total` seconds of lab time over `real` seconds. */
function fmt(sec, mode) {
  if (mode === 'h') return `${Math.floor(sec / 3600)} h ${String(Math.floor(sec % 3600 / 60)).padStart(2, '0')} m`;
  if (mode === 's') return `${Math.ceil(sec)} s`;
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
}
async function timer(label, total, real, mode, each) {
  await anim(real, (e, k) => {
    S.clock = `${label} · ${mode === 'h' ? fmt(total * k, mode) : fmt(total * (1 - k), mode)}`;
    if (each) each(k);
  }, Ease.linear);
  await wait(0.35);
  S.clock = null;
}

// =========================================================================
// Actions (one per click)
// =========================================================================
async function actCacl2() {
  const b = B.cacl2, bp = b.group.position;
  await bottleCap(b, true);
  for (const tube of [B.plus, B.minus]) {
    await pipDraw(bp.x, bp.z, b.liquid.surfaceY(), 10, COL.cacl2);
    const oc = cap(tube, true);
    const tp = tube.group.position;
    await pipDispense(tp.x, tp.z, tubeTop(tube) - 0.4, tp.y + Math.max(0.5, tube.liquid.level + 0.2), () => {
      tube.liquid.setColor(hex(COL.cacl2)); level(tube, 2.3);
      if (tube === B.plus) S.micro = 1;
    });
    await oc; cap(tube, false);
  }
  await Promise.all([discardPipette(), bottleCap(b, false)]);
}

async function actCells() {
  const st = B.starter, sp = st.group.position, lg = B.loop;
  await anim(0.55, (e) => st.setLid(e));
  for (const tube of [B.plus, B.minus]) {
    const sx = sp.x + rand(-1.5, 0.5), sz = sp.z + rand(-1.75, -1);
    S.cap = 'Pick up a colony with a sterile loop';
    await moveTo(lg.group, { pos: V3(sx, 3, sz), dur: 0.75, arc: 3 });
    await moveTo(lg.group, { pos: V3(sx, 0.55, sz), dur: 0.25 });
    await Promise.all([anim(0.35, (e) => lg.setBlob(0.9 * e)), anim(0.35, (e, k) => { lg.group.position.x = sx + Math.sin(k * Math.PI) * 0.6; })]);
    await moveTo(lg.group, { pos: V3(sx, 3, sz), dur: 0.25 });
    S.cap = 'Swirl it into the tube until the liquid looks cloudy';
    await cap(tube, true, 0.3);
    const done = loopIntoTube(tube);
    await wait(1.15);
    anim(0.5, (e) => lg.setBlob(0.9 * (1 - e)));
    tint(tube, COL.cells, 0.8);
    await done;
    cap(tube, false, 0.3);
    if (tube === B.plus) { S.micro = 2; S.cap = 'A fresh loop for each tube'; await discardLoop(); }
  }
  await Promise.all([discardLoop(), anim(0.55, (e) => st.setLid(1 - e))]);
  S.cap = null;
}

async function actPlasmid() {
  const v = B.vial, vp = v.group.position, lg = B.loop;
  await cap(v, true);
  await moveTo(lg.group, { pos: V3(vp.x, tubeTop(v) + 1.2, vp.z), dur: 0.7, arc: 3 });
  await moveTo(lg.group, { pos: V3(vp.x, vp.y + 0.8, vp.z), dur: 0.35 });
  await anim(0.35, (e) => lg.setFilm(e));
  await moveTo(lg.group, { pos: V3(vp.x, tubeTop(v) + 1.2, vp.z), dur: 0.3 });
  cap(v, false);
  await cap(B.plus, true, 0.3);
  const done = loopIntoTube(B.plus);
  await wait(1.0);
  S.micro = 3;
  anim(0.4, (e) => lg.setFilm(1 - e));
  await done;
  cap(B.plus, false, 0.3);
  await discardLoop();
}

async function actIce() {
  await both('ice', 1.4);
  S.micro = 4;
  await timer('0 °C', 600, 3.2, 'mm');
}

async function actHeat() {
  S.cap = 'Into the 42 °C water bath';
  await both('bath', 1.6);
  S.micro = 5;
  B.bath.setActive(true);
  S.cap = { text: 'Heat shock for exactly 50 seconds', note: 'Then straight back onto ice' };
  await timer('42 °C', 50, 3.4, 's', (k) => B.bath.setActive(true, Math.floor(k * 14) % 2 === 1));
  B.bath.setActive(false);
  S.cap = 'Straight back onto ice';
  await both('ice', 1.6);
  await timer('Back on ice · 0 °C', 120, 1.4, 'mm');
  S.cap = null;
}

async function actRecover() {
  const b = B.lb, bp = b.group.position;
  await Promise.all([both('rack', 1.4), bottleCap(b, true)]);
  for (const tube of [B.plus, B.minus]) {
    await pipDraw(bp.x, bp.z, b.liquid.surfaceY(), 10, COL.lb);
    const oc = cap(tube, true);
    const tp = tube.group.position;
    await pipDispense(tp.x, tp.z, tubeTop(tube) - 0.4, tp.y + tube.liquid.level, () => {
      level(tube, 4.0, 0.5); tint(tube, COL.recovered, 0.7);
      if (tube === B.plus) S.micro = 6;
    });
    await oc; cap(tube, false);
    if (tube === B.plus) await discardPipette();   // a fresh pipette for each tube
  }
  await Promise.all([discardPipette(), bottleCap(b, false)]);
  S.cap = 'Let the cells recover for 10 minutes';
  await timer('Room temp', 600, 2.6, 'mm');
  S.cap = null;
}

async function actPlate() {
  const plates = B.plates, lg = B.loop;
  S.cap = 'Lift the lids';
  await Promise.all(plates.map((p, i) => wait(i * 0.08).then(() => anim(0.55, (e) => p.setLid(e)))));
  for (let i = 0; i < 4; i++) {
    const tube = PLATES[i].src === 'plus' ? B.plus : B.minus, p = plates[i], tp = tube.group.position, pp = p.group.position;
    S.cap = `Pipette 100 µL of the ${PLATES[i].sub} cells onto the ${PLATES[i].title} plate`;
    await cap(tube, true, 0.3);
    await pipDraw(tp.x, tp.z, tube.liquid.surfaceY(), tubeTop(tube), COL.recovered);
    level(tube, tube.liquid.level - 0.4, 0.3);
    cap(tube, false, 0.3);
    await pipDispense(pp.x, pp.z, 2.5, p.anchors.floor.y, () => anim(0.3, (e) => p.setWet(0.2 + 0.5 * e, 0.75), Ease.out));
    if (i === 1 || i === 3) await discardPipette();   // one pipette per tube
  }
  for (let i = 0; i < 4; i++) {
    const p = plates[i], c = p.group.position;
    S.cap = 'Spread it with a fresh sterile loop';
    await moveTo(lg.group, { pos: V3(c.x, 2.3, c.z), dur: 0.55, arc: 2.5 });
    await moveTo(lg.group, { pos: V3(c.x, 0.55, c.z), dur: 0.2 });
    await anim(1.1, (e, k) => {
      const a = k * Math.PI * 7, r = 3.1 * Math.sqrt(k);
      lg.group.position.x = c.x + Math.cos(a) * r; lg.group.position.z = c.z + Math.sin(a) * r;
      p.setWet(0.7 * (1 + 4.2 * k), 0.75 * (1 - k * 0.85));
    }, Ease.linear);
    await moveTo(lg.group, { pos: V3(lg.group.position.x, 2.3, lg.group.position.z), dur: 0.2 });
    await discardLoop();
  }
  S.cap = 'Put the lids back on';
  await Promise.all(plates.map((p, i) => wait(i * 0.08).then(() => anim(0.55, (e) => p.setLid(1 - e)))));
  S.cap = null;
}

async function actIncubate() {
  S.micro = 7;
  B.plates.forEach((p) => anim(0.8, (e) => p.setWet(3.6, 0.11 * (1 - e))));
  await timer('37 °C', 24 * 3600, 5, 'h', (k) => {
    S.sunA = k * Math.PI * 2;
    S.day = Math.sin(k * Math.PI) ** 2 * 0.9;
    const g = Ease.inOut(clamp(k * 1.1));
    B.plates.forEach((p) => p.setGrowth(g));
  });
  S.sunA = 0; S.day = 0;
}

async function actUv() {
  const g = B.lamp.group;
  const p0 = g.position.clone(), q0 = g.quaternion.clone(), p1 = V3(0, 15.5, PLATE_Z + 1.5), top = 18;
  await anim(1.4, (e) => {
    g.position.x = lerp(p0.x, p1.x, e); g.position.z = lerp(p0.z, p1.z, e);
    const u = 1 - e; g.position.y = u * u * p0.y + 2 * u * e * top + e * e * p1.y;
    g.quaternion.copy(q0).slerp(new THREE.Quaternion(), e);
  });
  S.micro = 8;
  await anim(1.6, (e) => { S.uv = e; });
}

/** After the lab: lights on / UV again. */
async function toggleUv() {
  if (!S || lesson.step < STEPS.length) return;
  const a = S.uv, b = a > 0.5 ? 0 : 1;
  await anim(1, (e) => { S.uv = lerp(a, b, e); });
  lesson.render();
}

// =========================================================================
// Steps
// =========================================================================
const STEPS = [
  {
    id: 'cacl2', title: 'Add transformation solution', short: 'CaCl₂', targets: ['cacl2'], view: 'back',
    caption: { text: 'Pipette ice-cold calcium chloride into both tubes', note: '250 µL each' },
    action: 'add CaCl₂ to both tubes',
    hint: 'Click the <b>CaCl₂</b> bottle',
    detail: 'Pipette 250 µL of ice-cold calcium chloride (CaCl₂) into both tubes.',
    why: 'Calcium ions cancel out negative charges on the DNA and the cell membrane, so the two can touch.',
    run: actCacl2,
  },
  {
    id: 'cells', title: 'Add E. coli', short: 'Cells', targets: ['starter'], view: 'starter',
    caption: () => S.cap || 'Add E. coli to both tubes',
    action: 'add cells to both tubes',
    hint: 'Click the <b>starter plate</b>',
    detail: 'Use a sterile loop to pick up a colony from the starter plate and swirl it into a tube until the liquid looks cloudy. Use a fresh loop for each tube, and throw each used loop in the waste.',
    why: 'Each colony is millions of identical cells, grown from one.',
    run: actCells,
  },
  {
    id: 'plasmid', title: 'Add the GFP plasmid', short: 'Plasmid', targets: ['plasmid'], view: 'starter',
    caption: { text: 'Add the GFP plasmid to the + tube only', note: 'The − tube is the control' },
    action: 'add the plasmid',
    hint: 'Click the <b>GFP plasmid</b> vial',
    detail: 'Dip a fresh sterile loop into the plasmid solution and swirl it into the <b>+ plasmid</b> tube only.',
    why: 'The − tube is your control: the same cells, treated the same way, without the plasmid.',
    run: actPlasmid,
  },
  {
    id: 'ice', title: 'Incubate on ice', short: 'Ice', targets: ['ice'], view: 'ice',
    caption: 'Leave both tubes on ice for 10 minutes',
    action: 'put the tubes on ice',
    hint: 'Click the <b>ice bath</b>',
    detail: 'Leave both tubes on ice for 10 minutes.',
    why: 'The cold stiffens the membrane and lets plasmids settle onto the cells.',
    run: actIce,
    clock: () => S.clock,
  },
  {
    id: 'heat', title: 'Heat shock', short: 'Heat shock', targets: ['bath'], view: 'bath',
    caption: () => S.cap || 'Heat shock',
    action: 'heat-shock the tubes',
    hint: 'Click the <b>water bath</b>',
    detail: 'Move the tubes into the 42 °C water bath for exactly 50 seconds, then straight back onto ice.',
    why: 'The sudden change in temperature opens temporary pores in the membrane, and plasmids slip in.',
    run: actHeat,
    clock: () => S.clock,
  },
  {
    id: 'recover', title: 'Recover in LB broth', short: 'Recover', targets: ['lb'], view: 'back',
    caption: () => S.cap || { text: 'Add LB nutrient broth to both tubes', note: 'A fresh pipette for each tube' },
    action: 'add LB broth',
    hint: 'Click the <b>LB broth</b>',
    detail: 'Using a fresh pipette for each tube, add 250 µL of LB nutrient broth and let the cells rest for 10 minutes.',
    why: 'The cells repair their membranes and start using the ampicillin-resistance gene.',
    run: actRecover,
    clock: () => S.clock,
  },
  {
    id: 'plate', title: 'Spread on plates', short: 'Plates', targets: ['plates'], view: 'plates',
    caption: () => S.cap || 'Spread the cells on agar plates',
    action: 'spread the cells',
    hint: 'Click the <b>agar plates</b>',
    detail: 'Pipette 100 µL onto each agar plate (one fresh pipette per tube) and spread it with a fresh sterile loop for each plate. The − tube goes on LB/amp and LB; the + tube on LB/amp and LB/amp/ara.',
    why: 'Each plate tests one thing: whether the cells can grow on ampicillin, and whether arabinose switches GFP on.',
    run: actPlate,
  },
  {
    id: 'incubate', title: 'Incubate overnight', short: 'Incubate', targets: ['plates'], view: 'plates',
    caption: 'Keep the plates at 37 °C for 24 hours',
    action: 'incubate them',
    hint: 'Click the <b>agar plates</b> to incubate them',
    detail: 'Keep the plates at 37 °C for 24 hours.',
    why: 'A colony only grows where the cells can survive the conditions on that plate.',
    run: actIncubate,
    clock: () => S.clock,
  },
  {
    id: 'uv', title: 'Shine UV light', short: 'UV', targets: ['uv'], view: 'uv',
    caption: 'Turn off the lights and shine the UV lamp on the plates',
    action: 'shine it on the plates',
    hint: 'Click the <b>UV lamp</b>',
    detail: 'Turn off the room lights and hold the UV lamp over the plates. Which colonies glow?',
    run: actUv,
  },
];
// The card's "why" follows the level in the main view; bench clicks only work at the Lab level.
STEPS.forEach((s) => {
  const why = s.why, hint = s.hint;
  s.why = () => (zoom.scale === 'lab' ? why : `<b>Cell level:</b> ${captionFor(cellState)}`);
  s.hint = () => (zoom.scale === 'lab' ? hint : `Click the <b>Lab</b> circle to go back to the bench and ${s.action}`);
});
const PHASES = [
  { title: 'Prepare the tubes', desc: 'CaCl₂, cells and the plasmid', steps: ['cacl2', 'cells', 'plasmid'] },
  { title: 'Heat shock', desc: 'Ice, 42 °C, ice', steps: ['ice', 'heat'] },
  { title: 'Recover', desc: 'Fresh broth, 10 minutes', steps: ['recover'] },
  { title: 'Plate and grow', desc: 'Spread and incubate overnight', steps: ['plate', 'incubate'] },
  { title: 'Look under UV', desc: 'Which colonies glow?', steps: ['uv'] },
];

// =========================================================================
// The results (the complete card)
// =========================================================================
// The complete card: the four plates in bench order (hint), then the efficiency (why)
const RESULTS = [
  { dish: '', title: 'LB / amp', sub: '− plasmid', out: 'No growth', text: 'Without the plasmid, ampicillin kills the cells.' },
  { dish: 'lawn', title: 'LB', sub: '− plasmid', out: 'A lawn', text: 'No antibiotic, so every cell grows: they were alive.' },
  { dish: 'col', title: 'LB / amp', sub: '+ plasmid', out: 'Colonies', text: '<b>bla</b> protects them. No arabinose, so no glow.' },
  { dish: 'glow', title: 'LB / amp / ara', sub: '+ plasmid', out: 'Glowing colonies', text: 'Arabinose switches GFP on through <b>araC</b>.' },
];
function results() {
  if (zoom.scale !== 'lab') return `<b>Cell level:</b> ${captionFor(cellState)}`;
  const n = B ? B.plates[3].colonies : 46;
  const dna = 0.8 * 100 / 510, eff = Math.round(n / dna);
  return `<b>Transformation efficiency:</b> ${n} glowing colonies ÷ ${dna.toFixed(2)} µg of plasmid ≈ <b>${eff.toLocaleString('en-US')} transformants per µg</b>.`;
}
const completeHint = () => {
  const uv = S && S.uv > 0.5;
  const head = `<span class="res-head"><b>Only the arabinose plate glows.</b><button class="uv-toggle" data-act="uv"><i class="ph ${uv ? 'ph-sun' : 'ph-lightbulb-filament'}"></i>${uv ? 'Lights on' : 'UV light'}</button></span>`;
  if (zoom.scale !== 'lab') return head;
  return head + `<span class="results">${RESULTS.map((r) => `<span class="res${r.dish === 'glow' ? ' hit' : ''}">`
    + `<span class="dish ${r.dish}"></span><span class="res-plate">${r.title}<em class="${r.sub[0] === '+' ? 'plus' : ''}">${r.sub}</em></span>`
    + `<span class="res-out">${r.out}</span><span class="res-text">${r.text}</span></span>`).join('')}</span>`;
};

// =========================================================================
// Wire it together
// =========================================================================
let firstEnter = true;
lesson = createLesson({
  steps: STEPS,
  phases: PHASES,
  rebuild,
  panel: $('#stepsPanel'),
  completeHint,
  completeWhy: results,
  completeCaption: { text: 'Only the arabinose plate glows', note: 'Its cells took up the plasmid, and arabinose switched GFP on' },
  onEnter: (step) => {
    requestAnimationFrame(() => stage.resize()); // the card's new height changes the free area
    zoom.onStep();
    if (!step) { stage.focus(VIEWS.results, 1.4); toast('Only the arabinose plate glows', { icon: 'ph-sparkle' }); return; }
    if (firstEnter) { firstEnter = false; intro.started.then(() => stage.focus(step.view, 2.2)); return; } // the opening move, after Start
    stage.focus(step.view);
  },
});
const benchActive = () => zoom.scale === 'lab' && !zoom.transitioning;
ix = createInteraction(stage, {
  targets: () => (benchActive() ? lesson.targets() : []),
  busy: lesson.isBusy,
  onClick: (k) => {
    if (!benchActive()) return undefined;
    if (k === 'uv' && lesson.step >= STEPS.length) return toggleUv();
    return lesson.click(k);
  },
  status: lesson.status,
  markerStyle: new URLSearchParams(location.search).get('marker') || 'circle',
  enabled: benchActive,
});
// Watch mode's camera: one default zoom that pans along the bench (rules in follow.js)
const follow = createFollowCam(stage, ix, {
  acting: lesson.acting,
  watching: () => lesson.mode === 'watch',
  rig: { t: V3(-4, 3, 5), p: V3(-3, 32, 50) },
  special: [],
});

function restart() {
  newSession();
  firstEnter = false;
  lesson.restart();
}

let shownAra = null;
stage.onFrame((dt, now) => {
  lesson.update(dt);
  follow.update(dt);
  applyLights();
  if (B) B.bath.update(now / 1000);
  zoom.update(dt);
  ix.update();
  // + / − arabinose: in the cell view once the plates are under UV
  const showAra = zoom.scale === 'cell' && !zoom.transitioning && S && S.micro >= 8;
  if (showAra !== shownAra) { shownAra = showAra; $('#araSeg').hidden = !showAra; }
});

document.querySelectorAll('#araSeg button').forEach((b) => b.addEventListener('click', () => {
  ara = b.dataset.ara === '1';
  document.querySelectorAll('#araSeg button').forEach((x) => x.classList.toggle('on', x === b));
  lesson.render();
}));
document.addEventListener('click', (e) => { if (e.target.closest('[data-act="uv"]')) toggleUv(); });
$('#btnView').addEventListener('click', () => { if (zoom.scale === 'lab') stage.focus(stage.lastView); else zoom.onStep(); });
$('#btnRestart').addEventListener('click', restart);
$('#btnInfo').addEventListener('click', () => { $('#infoModal').hidden = false; });
$('#btnCloseInfo').addEventListener('click', () => { $('#infoModal').hidden = true; });
$('#infoModal').addEventListener('click', (e) => { if (e.target.id === 'infoModal') $('#infoModal').hidden = true; });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') $('#infoModal').hidden = true; });

// the intro card (its plasmid is started early by intro-art.js)
const intro = createIntro(stage);
const closeIntro = intro.close;

// debug / testing hook
window.LAB = { get S() { return S; }, get B() { return B; }, lesson, ix, stage, follow, zoom, STEPS, closeIntro };

stage.focus(VIEWS.overview, 0);
lesson.start();
stage.start();
