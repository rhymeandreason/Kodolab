/* Micropipetting: an adjustable micropipette (P10 · P20 · P200 · P1000), a box of disposable
 * tips, a single stand and a linear rack the pipettes hang on by their finger hooks. */
import * as THREE from 'three';
import { V3, clamp } from '../core/math.js';
import { makeCanvas, canvasTex, roundRect } from '../core/canvas.js';
import { mesh, lathe, rbox, roundedRectShape } from '../core/geometry.js';
import { toLinear } from '../materials.js';

/* Per size: max volume (µL), the tip it takes (length, rim radius, point radius, tint), the
 * button colour, and how the counter reads. Tip tints are the standard ones: 200 µL tips
 * yellow, 1000 µL blue, small ones clear. */
const SIZES = {
  P10: { max: 10, min: 0.5, tip: { L: 3.4, R: 0.28, p: 0.04, tint: '#eef2f4' }, color: '#ef7d7d', digits: (v) => [v * 10, 3, 1] },
  P20: { max: 20, min: 2, tip: { L: 4.2, R: 0.36, p: 0.05, tint: '#f6efc8' }, color: '#f5c542', digits: (v) => [v * 10, 3, 1] },
  P200: { max: 200, min: 20, tip: { L: 5.1, R: 0.42, p: 0.06, tint: '#f7dc5a' }, color: '#79c69a', digits: (v) => [v, 3, 0] },
  P1000: { max: 1000, min: 100, tip: { L: 7.6, R: 0.6, p: 0.09, tint: '#7cb8e8' }, color: '#4fb3d9', digits: (v) => [v, 4, 0] },
};
export const PIPETTE_SIZES = Object.keys(SIZES);

/* The body, from the reference photo (side view, 24 cm without a tip). Origin of these numbers
 * is the bottom of the body; +z is the side with the counter, -x the finger hook, +x the
 * ejector. */
const BODY_H = 12.4, BODY_D = 2.3, NOSE = 9.2, HOOK_SEAT = V3(-2.2, 11.1, 0);
const TRAVEL = 1.1, EJECT = 0.55;

/** Outer and inner profiles of a tip, point at y = 0. */
function tipProfiles({ L, R, p }) {
  const out = [[0, 0], [p, 0], [p + 0.04, 0.14 * L], [0.5 * R, 0.57 * L], [0.83 * R, 0.93 * L], [R, 0.94 * L], [R, L], [R - 0.06, L]];
  const inn = [[p * 0.4, 0.05], [p + 0.01, 0.14 * L], [0.5 * R - 0.04, 0.57 * L], [0.83 * R - 0.06, 0.93 * L], [R - 0.1, L]];
  return { out, inn };
}
const radiusAt = (prof, y) => {
  for (let i = 1; i < prof.length; i++) {
    const [r0, y0] = prof[i - 1], [r1, y1] = prof[i];
    if (y <= y1) return r0 + (r1 - r0) * clamp((y - y0) / Math.max(1e-6, y1 - y0));
  }
  return prof[prof.length - 1][0];
};
/** Height a volume (µL = mm³) fills a tip to, from its inner profile. */
function fillHeight(inn, ul) {
  let v = 0, want = ul / 1000;          // cm³
  for (let i = 1; i < inn.length; i++) {
    const [r0, y0] = inn[i - 1], [r1, y1] = inn[i];
    const seg = Math.PI * (y1 - y0) / 3 * (r0 * r0 + r0 * r1 + r1 * r1);
    if (v + seg >= want) {
      let lo = y0, hi = y1;              // bisect inside the frustum
      for (let k = 0; k < 24; k++) {
        const m = (lo + hi) / 2, rm = r0 + (r1 - r0) * (m - y0) / (y1 - y0);
        const vm = Math.PI * (m - y0) / 3 * (r0 * r0 + r0 * rm + rm * rm);
        if (v + vm < want) lo = m; else hi = m;
      }
      return (lo + hi) / 2;
    }
    v += seg;
  }
  return inn[inn.length - 1][1];
}

/** A disposable tip, wide end up, origin at its point. */
function tipMesh(mat, tip = SIZES.P20.tip, opacity = 0.42) {
  const m = mesh(lathe(tipProfiles(tip).out, 24), mat.make.plastic({ color: tip.tint, opacity }), { cast: false });
  m.renderOrder = 3;
  return m;
}

/** Extrude a shape drawn in the x-y plane to depth d along z, centred, with rounded edges. */
function slab(shape, d, bevel) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, d - 2 * bevel), bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 16,
  });
  g.translate(0, 0, -(d - 2 * bevel) / 2);
  g.computeVertexNormals();
  return g;
}
const rectShape = (x0, y0, x1, y1, r) => {
  const c = new THREE.Vector2((x0 + x1) / 2, (y0 + y1) / 2);
  return new THREE.Shape(roundedRectShape(x1 - x0, y1 - y0, r).getPoints(8).map((p) => p.add(c)));
};

/** Text printed up the side of the body, reading bottom to top. */
function sideText(text, w, h, { color = '#7b8794', weight = 600 } = {}) {
  const c = makeCanvas(512, Math.round(512 * w / h)), x = c.getContext('2d');
  x.fillStyle = color; x.font = `${weight} ${Math.round(c.height * 0.72)}px Inter, system-ui, sans-serif`;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2);
  const m = mesh(new THREE.PlaneGeometry(h, w), new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, toneMapped: false, depthWrite: false }), { cast: false });
  m.rotation.z = Math.PI / 2; m.userData.noSketch = true;
  return m;
}

/** Micropipette. Origin at the tip's point, plunger up; 24 cm without a tip. size picks
 *  P10 · P20 · P200 · P1000 (button colour, counter, tip); volume is the set volume in µL.
 *  setPlunger(k): 0.75 is the first stop (the set volume), 1 the second (blow-out).
 *  setEject(k) presses the ejector, which slides the sleeve down onto the tip's rim.
 *  setTip(on) shows the tip; setFill(f, color) fills it with f of the set volume, to the height
 *  that volume reaches in this tip. anchors.hook is where a bar sits under the finger hook. */
export function makeMicropipette(mat, { size = 'P20', volume, color, body = toLinear('#eef1f3') } = {}) {
  const S = SIZES[size] || SIZES.P20;
  const T = S.tip, { inn: TIP_IN } = tipProfiles(T);
  const accent = mat.make.solid(color ?? toLinear(S.color), 0.42);
  const bodyMat = mat.make.solid(body, 0.5);
  const dark = mat.make.solid(toLinear('#2a2f36'), 0.45);
  const grey = mat.make.solid(toLinear('#d9dee4'), 0.35);

  const pen = size === 'P1000' ? 1.0 : 0.7;      // how far the nose sits inside the tip
  const N0 = T.L - pen, yB = N0 + NOSE, yT = yB + BODY_H;
  const g = new THREE.Group();

  const tip = tipMesh(mat, T);
  g.add(tip);
  const fluidMat = mat.make.liquid(toLinear('#3b5bdb'), 0.85);
  let fluid = null;

  // body: the main block, the finger hook at the back, the ejector housing at the front
  const b = new THREE.Group(); b.position.y = yB; g.add(b);
  const bev = 0.35;
  b.add(mesh(slab(rectShape(-1.3 + bev, bev, 1.2 - bev, BODY_H - bev, 0.35), BODY_D, bev), bodyMat));
  const hook = new THREE.Shape();
  hook.moveTo(-0.6, BODY_H - 0.2);
  hook.lineTo(-1.4, BODY_H - 0.15);
  hook.quadraticCurveTo(-2.95, BODY_H - 0.1, -3.5, 10.85);
  hook.quadraticCurveTo(-3.55, 10.55, -3.2, 10.7);
  hook.quadraticCurveTo(-2.4, 11.75, -0.6, 11.25);
  hook.closePath();
  b.add(mesh(slab(hook, 1.3, 0.16), bodyMat));
  b.add(mesh(slab(rectShape(1.0, 0.25, 1.85, 10.2, 0.25), 1.5, 0.12), bodyMat));
  // collar under the body, with the lug the ejector rod runs down
  b.add(mesh(lathe([[0, -1.75], [0.62, -1.75], [0.78, -1.2], [0.98, -0.45], [1.0, 0.1], [0, 0.1]], 40), accent));
  const lug = mesh(rbox(1.0, 1.4, 1.0, 0.3), accent); lug.position.set(1.25, -1.15, 0); b.add(lug);

  // counter window and print on the +z side
  const face = BODY_D / 2 + 0.005;
  const frame = mesh(rbox(0.85, 0.02, 2.5, 0.12), dark, { cast: false });
  frame.rotation.x = Math.PI / 2; frame.position.set(0.1, 4.5, face - 0.017); b.add(frame);
  const wc = makeCanvas(128, 384), wtex = canvasTex(wc);
  const win = mesh(new THREE.PlaneGeometry(0.6, 2.2), new THREE.MeshBasicMaterial({ map: wtex, toneMapped: false }), { cast: false });
  win.position.set(0.1, 4.5, face + 0.006); win.userData.noSketch = true; b.add(win);
  const paint = (v) => {
    const x = wc.getContext('2d'), [n, len, dec] = S.digits(v);
    const s = String(Math.round(n)).padStart(len, '0').slice(-len);
    x.fillStyle = '#1d232b'; x.fillRect(0, 0, 128, 384);
    const cell = 384 / len;
    for (let i = 0; i < len; i++) {
      x.save(); x.translate(64, 384 - cell * (i + 0.5)); x.rotate(-Math.PI / 2);
      const grad = x.createLinearGradient(0, -52, 0, 52);
      grad.addColorStop(0, '#9aa3ad'); grad.addColorStop(0.5, '#f4f6f8'); grad.addColorStop(1, '#9aa3ad');
      x.fillStyle = grad; roundRect(x, -cell / 2 + 4, -50, cell - 8, 100, 8); x.fill();
      x.fillStyle = dec && i === len - 1 ? '#d63b3b' : '#111827';
      x.font = `700 ${Math.round(Math.min(cell, 100) * 0.78)}px 'JetBrains Mono', ui-monospace, monospace`;
      x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(s[i], 0, 4);
      x.restore();
    }
    wtex.needsUpdate = true;
  };
  const name = sideText(size, 0.7, 2.0, { color: '#5b6672', weight: 700 }); name.position.set(-0.1, 9.0, face); b.add(name);
  const range = sideText(`${S.min}–${S.max} µL`, 0.55, 3.0, { color: '#7b8794' }); range.position.set(-0.05, 1.9, face); b.add(range);

  // the nose the tip seats on, and the sleeve that pushes it off
  b.add(mesh(lathe([[0, N0 - yB], [radiusAt(TIP_IN, N0) - 0.004, N0 - yB], [T.R - 0.1, T.L - yB], [T.R - 0.09, T.L + 0.6 - yB], [0, T.L + 0.6 - yB]], 32), dark));
  const ejector = new THREE.Group(); b.add(ejector);
  const sTop = Math.max(0.5, T.R + 0.04);
  ejector.add(mesh(lathe([[T.R - 0.12, T.L + 0.1 - yB], [T.R - 0.02, T.L + 0.1 - yB], [T.R + 0.0, T.L + 0.5 - yB], [sTop, -1.9], [0.6, -1.6], [T.R - 0.12, -1.6]], 40), accent));
  const stem = mesh(rbox(0.4, 1.0, 0.7, 0.12), grey); stem.position.set(1.42, 10.15, 0); ejector.add(stem);
  const tab = mesh(rbox(1.55, 0.7, 1.3, 0.28), accent); tab.position.set(1.85, 11.05, 0); ejector.add(tab);

  // plunger: a rod into the body and a hexagonal button
  const plunger = new THREE.Group();
  const rod = mesh(new THREE.CylinderGeometry(0.42, 0.42, 2.6, 24), grey); rod.position.y = yT + 0.1;
  const hex = new THREE.Shape();
  for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + Math.PI / 6, r = 0.8; hex[i ? 'lineTo' : 'moveTo'](r * Math.cos(a), r * Math.sin(a)); }
  const knobGeo = new THREE.ExtrudeGeometry(hex, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.16, bevelSegments: 4 });
  knobGeo.rotateX(-Math.PI / 2); knobGeo.computeVertexNormals();
  const knob = mesh(knobGeo, accent); knob.position.y = yT + 1.4 + 0.2;
  plunger.add(rod, knob);
  g.add(plunger);

  const api = {
    group: g, tip, tipLen: T.L, plunger, hasTip: true, fill: 0, size, max: S.max, volume: 0,
    anchors: { point: V3(0, 0, 0), nose: V3(0, N0, 0), top: V3(0, yT + 2.35, 0), hook: HOOK_SEAT.clone().setY(yB + HOOK_SEAT.y) },
    setVolume(v) { this.volume = clamp(v, S.min, S.max); paint(this.volume); if (this.fill) this.setFill(this.fill); },
    setPlunger(k) { plunger.position.y = -TRAVEL * clamp(k); },
    setEject(k) { ejector.position.y = -EJECT * clamp(k); },
    setTip(on) { this.hasTip = on; tip.visible = on; if (fluid) fluid.visible = on && this.fill > 0.01; },
    setFill(f, c) {
      this.fill = f;
      if (c !== undefined) fluidMat.color.set(c);
      if (fluid) { g.remove(fluid); fluid.geometry.dispose(); fluid = null; }
      if (f < 0.01 || !this.hasTip) return;
      const top = fillHeight(TIP_IN, f * this.volume);
      const prof = TIP_IN.filter(([, y]) => y < top);
      fluid = mesh(lathe([[0, TIP_IN[0][1]], ...prof, [radiusAt(TIP_IN, top), top], [0, top]], 20), fluidMat, { cast: false });
      fluid.renderOrder = 1;
      g.add(fluid);
    },
  };
  api.setVolume(volume ?? S.max / 2);
  return api;
}

/** Box of 96 tips, 12.5 × 8.6 cm, lid hinged open at the back. tips[i] is tip i's point in
 *  box space (row-major from the front left); setTaken(n) empties the first n holes. */
export function makeTipBox(mat, { rows = 8, cols = 12, color = toLinear('#3b82f6'), lid: showLid = true } = {}) {
  const g = new THREE.Group();
  const W = 12.5, D = 8.6, H = 5.2, P = 0.9, TIP = SIZES.P20.tip;
  const shell = mesh(rbox(W, H - 0.3, D, 0.35), mat.make.plastic({ color: '#cfdcf0', opacity: 0.45 }), { cast: false });
  shell.renderOrder = 3; shell.position.y = 0.015;
  g.add(shell);
  const plate = mesh(new THREE.BoxGeometry(W - 0.3, 0.25, D - 0.3), mat.make.solid(color, 0.45));
  plate.position.y = H - 0.15;
  g.add(plate);
  const lid = new THREE.Group();
  lid.position.set(0, H, -D / 2);
  const lidTop = mesh(rbox(W + 0.2, 1.2, D + 0.2, 0.35), mat.make.plastic({ color: '#cfdcf0', opacity: 0.4 }), { cast: false });
  lidTop.position.set(0, 0, D / 2); lidTop.renderOrder = 3;
  lid.add(lidTop);
  lid.rotation.x = -1.9;
  if (showLid) g.add(lid);
  const N = rows * cols;
  const tips = new THREE.InstancedMesh(tipMesh(mat, TIP).geometry, mat.make.plastic({ color: TIP.tint, opacity: 0.6 }), N);
  tips.renderOrder = 3; tips.frustumCulled = false;
  g.add(tips);
  const pts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), zero = V3(0, 0, 0);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    pts.push(V3((k - (cols - 1) / 2) * P, H + 0.05 - TIP.L + 0.35, ((rows - 1) / 2 - r) * P));
  }
  const api = {
    group: g, tips: pts, taken: 0,
    anchors: { top: V3(0, H, 0) },
    setTaken(n) {
      this.taken = n;
      pts.forEach((p, i) => { m4.compose(p, q, i < n ? zero : one); tips.setMatrixAt(i, m4); });
      tips.instanceMatrix.needsUpdate = true;
    },
  };
  api.setTaken(0);
  return api;
}

/* A hook hangs over a bar 1 cm thick, the body resting against the bar's face. */
const BAR_T = 1.0;

/** Stand for one micropipette: a weighted base and an upright whose top edge the finger hook
 *  hangs over, the pipette beside it with its counter facing +z. rest(pip) is where the
 *  pipette's origin goes, in stand space. */
export function makePipetteStand(mat, { color = toLinear('#cfe0ee'), height = 24.5 } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.5);
  const px = 1.2, bx = px + HOOK_SEAT.x;    // the pipette's axis, and the upright's centre
  g.add(mesh(rbox(7, 0.9, 6, 0.6), m));
  const up = new THREE.Shape([[-1.6, 0], [1.6, 0], [0.9, height - 0.18], [-0.9, height - 0.18]].map(([z, y]) => new THREE.Vector2(z, y)));
  const upright = mesh(slab(up, BAR_T, 0.18), m);
  upright.rotation.y = Math.PI / 2; upright.position.x = bx;
  g.add(upright);
  const hang = V3(bx, height, 0);
  return { group: g, ry: 0, anchors: { hang }, rest: (pip) => hang.clone().sub(pip.anchors.hook) };
}

/** Linear rack: two splayed legs and a bar the pipettes hang on by their hooks, counters
 *  facing -x as they would in the lab. rest(pip, i) is where pipette i's origin goes, in rack
 *  space, with rotation.y = ry. hang(pip, i) adds it to the rack there. */
export function makePipetteRack(mat, { slots = 3, spacing = 4.4, color = toLinear('#cfe0ee'), height = 25 } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.5);
  const W = slots * spacing + 1.2;
  const leg = new THREE.Shape([[-4.5, 0], [6.5, 0], [1.4, height + 0.6], [-1.2, height + 0.6]].map(([z, y]) => new THREE.Vector2(z, y)));
  [-1, 1].forEach((s) => {
    const l = mesh(slab(leg, 1.4, 0.3), m);
    l.rotation.y = -Math.PI / 2; l.position.x = s * (W / 2 + 0.7);
    g.add(l);
  });
  const bar = mesh(rbox(W + 0.4, 3.6, BAR_T, 0.3), m);
  bar.position.y = height - 3.6;
  g.add(bar);
  const ry = -Math.PI / 2;
  const hangs = Array.from({ length: slots }, (_, i) => V3((i - (slots - 1) / 2) * spacing, height, 0));
  const rest = (pip, i) => {
    const h = pip.anchors.hook;               // rotated by ry: (x, y, z) -> (-z, y, x)
    return hangs[i].clone().sub(V3(-h.z, h.y, h.x));
  };
  return {
    group: g, ry, anchors: { hang: hangs }, rest,
    hang(pip, i) { pip.group.position.copy(rest(pip, i)); pip.group.rotation.y = ry; g.add(pip.group); return pip; },
  };
}
