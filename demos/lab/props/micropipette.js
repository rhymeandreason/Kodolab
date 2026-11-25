/* Micropipetting: an adjustable micropipette, a box of disposable tips and a stand to hang the
 * pipette on. */
import * as THREE from 'three';
import { V3, clamp } from '../core/math.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { mesh, lathe, rbox } from '../core/geometry.js';
import { toLinear } from '../materials.js';

const TIP_L = 4.2;                // a 20 µL tip
const TIP_IN = [[0.02, 0.05], [0.06, 0.6], [0.14, 2.4], [0.24, 3.9], [0.26, TIP_L]];

/** A disposable tip, wide end up, origin at its point. */
function tipMesh(mat, opacity = 0.42) {
  const out = [[0, 0], [0.05, 0], [0.09, 0.6], [0.18, 2.4], [0.3, 3.9], [0.36, 3.95], [0.36, TIP_L], [0.3, TIP_L]];
  const m = mesh(lathe(out, 20), mat.make.plastic({ color: '#f6efc8', opacity }), { cast: false });
  m.renderOrder = 3;
  return m;
}

/** P20 micropipette, 23 cm with a tip on. Origin at the tip's point, plunger up. setPlunger(k)
 *  presses the button: 0.75 is the first stop (the set volume), 1 the second (blow-out).
 *  setTip(on) shows the tip; setFill(f, color) fills it to f of the set volume. volume sets the
 *  window's digits (µL). anchors.nose is where a tip seats. */
export function makeMicropipette(mat, { button = toLinear('#facc15'), volume = 10, body = toLinear('#eef1f5') } = {}) {
  const g = new THREE.Group();
  const tip = tipMesh(mat);
  g.add(tip);
  const fluidMat = mat.make.liquid(toLinear('#3b5bdb'), 0.85);
  let fluid = null;
  const grey = mat.make.solid(toLinear('#b7c0cb'), 0.35), bodyMat = mat.make.solid(body, 0.42);
  // nose cone the tip seats on, the ejector sleeve, the grip
  g.add(mesh(lathe([[0, 3.5], [0.2, 3.5], [0.24, 4.4], [0.42, 9.2], [0, 9.2]], 24), grey));
  g.add(mesh(lathe([[0, 8.7], [0.52, 8.7], [0.56, 10.6], [0, 10.6]], 24), mat.make.solid(toLinear('#cfd6de'), 0.4)));
  g.add(mesh(lathe([[0, 10.4], [0.82, 10.5], [1.05, 12], [1.12, 16.5], [1.02, 19.2], [0.75, 19.8], [0, 19.8]], 32), bodyMat));
  // finger hook on the back, ejector button beside the plunger
  const hook = mesh(new THREE.TorusGeometry(0.65, 0.22, 10, 20, Math.PI * 1.1), bodyMat);
  hook.position.set(0, 18.6, -1.25); hook.rotation.set(0, Math.PI / 2, Math.PI * 0.95);
  g.add(hook);
  const eject = mesh(new THREE.CylinderGeometry(0.28, 0.28, 2.2, 12), grey);
  eject.position.set(0.55, 20.6, 0.35);
  g.add(eject);
  // volume window
  const c = makeCanvas(256, 96), tex = canvasTex(c);
  const x = c.getContext('2d');
  x.fillStyle = '#f8fafc'; x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#0f172a'; x.font = `700 66px 'JetBrains Mono', ui-monospace, monospace`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(Math.round(volume * 10)).padStart(3, '0'), 128, 50);
  const win = mesh(new THREE.PlaneGeometry(1.15, 0.45), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), { cast: false });
  win.position.set(0, 14.2, 1.125); win.userData.noSketch = true;
  g.add(win);
  // plunger: a rod and the coloured button
  const plunger = new THREE.Group();
  const rod = mesh(new THREE.CylinderGeometry(0.22, 0.22, 2.4, 12), grey); rod.position.y = 20.8;
  const cap = mesh(lathe([[0, 21.9], [0.62, 21.9], [0.7, 22.4], [0.55, 22.75], [0, 22.8]], 24), mat.make.solid(button, 0.4));
  plunger.add(rod, cap);
  g.add(plunger);
  const api = {
    group: g, tip, tipLen: TIP_L, plunger, hasTip: true, fill: 0,
    anchors: { point: V3(0, 0, 0), nose: V3(0, 3.5, 0), top: V3(0, 22.8, 0), hook: V3(0, 18.6, -1.6) },
    setPlunger(k) { plunger.position.y = -1.0 * clamp(k); },
    setTip(on) { this.hasTip = on; tip.visible = on; if (fluid) fluid.visible = on && this.fill > 0.01; },
    /** f of the set volume, which fills the bottom ~1.6 cm of a 20 µL tip */
    setFill(f, color) {
      this.fill = f;
      if (color !== undefined) fluidMat.color.set(color);
      if (fluid) { g.remove(fluid); fluid.geometry.dispose(); fluid = null; }
      if (f < 0.01 || !this.hasTip) return;
      const top = 0.05 + 1.6 * clamp(f);
      const prof = TIP_IN.filter(([, y]) => y < top);
      const [r0, y0] = TIP_IN.find(([, y]) => y >= top) || TIP_IN[TIP_IN.length - 1];
      const [rp, yp] = prof[prof.length - 1];
      const rt = rp + (r0 - rp) * (top - yp) / Math.max(1e-6, y0 - yp);
      fluid = mesh(lathe([[0, 0.05], ...prof, [rt, top], [0, top]], 16), fluidMat, { cast: false });
      fluid.renderOrder = 1;
      g.add(fluid);
    },
  };
  return api;
}

/** Box of 96 tips, 12.5 × 8.6 cm, lid hinged open at the back. tips[i] is tip i's point in
 *  box space (row-major from the front left); setTaken(n) empties the first n holes. */
export function makeTipBox(mat, { rows = 8, cols = 12, color = toLinear('#3b82f6'), lid: showLid = true } = {}) {
  const g = new THREE.Group();
  const W = 12.5, D = 8.6, H = 5.2, P = 0.9;
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
  const tipGeo = (() => { const m = tipMesh(mat); return m.geometry; })();
  const tips = new THREE.InstancedMesh(tipGeo, mat.make.plastic({ color: '#f6efc8', opacity: 0.6 }), N);
  tips.renderOrder = 3; tips.frustumCulled = false;
  g.add(tips);
  const pts = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), one = V3(1, 1, 1), zero = V3(0, 0, 0);
  for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
    pts.push(V3((k - (cols - 1) / 2) * P, H + 0.05 - TIP_L + 0.35, ((rows - 1) / 2 - r) * P));
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

/** Stand a micropipette hangs on by its finger hook: a weighted base and a post with a clip.
 *  Put the pipette's anchors.hook at anchors.hang. */
export function makePipetteStand(mat, { color = toLinear('#d7dee8') } = {}) {
  const g = new THREE.Group();
  const m = mat.make.solid(color, 0.45);
  g.add(mesh(rbox(5, 0.9, 5, 0.6), m));
  const post = mesh(new THREE.CylinderGeometry(0.35, 0.35, 21, 14), m);
  post.position.set(0, 11, -1.8);
  g.add(post);
  const arm = mesh(rbox(1.4, 0.7, 2.2, 0.2), m);
  arm.position.set(0, 21, -1.2);
  g.add(arm);
  return { group: g, anchors: { hang: V3(0, 21.6, -0.1) } };
}
