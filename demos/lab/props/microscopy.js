/* Microscopy: a glass slide, a coverslip, a square of filter paper and a compound light
 * microscope (all from OnionRoot). Origins at the centre of the base.
 *
 *   const slide = makeSlide(mat, { label: ['Allium', 'root tip'] });
 *   slide.setDrop(k, color)     // a drop of stain on the slide, 0..1 of its size
 *   slide.setSmear(k, color)    // tissue squashed out under the coverslip, 0..1
 *   slide.anchors.top           // centre of the top face, where a specimen goes
 *
 *   const scope = makeMicroscope(mat);
 *   scope.setLamp(0..1)         // the lamp under the stage, and the beam up through it
 *   scope.nose.rotation.y       // the revolving nosepiece; 4× is in place at 0
 *   scope.anchors.stage         // the centre of the stage, where a slide is clipped
 *   scope.anchors.eye           // the eyepoint above the binocular head; anchors.eyeAxis points out of it
 */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { mesh, rbox } from '../core/geometry.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { toLinear } from '../materials.js';

/** A box of w × h × d centred on its origin, with rounded edges. */
function cbox(w, h, d, r) { const g = rbox(w, h, d, r); g.translate(0, -h / 2, 0); return g; }

function softDot() {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/* ------------------------------------------------------------------ slide */

/** Glass microscope slide, 76 × 26 × 1 mm, with a frosted label end (-x). */
export function makeSlide(mat, { label = ['Allium cepa', 'root tip squash'] } = {}) {
  const g = new THREE.Group();
  const T = 0.1;
  const glass = mesh(new THREE.BoxGeometry(7.6, T, 2.6), mat.make.glass({ color: '#e4f2fb', opacity: 0.4 }), { cast: false });
  glass.position.y = T / 2; glass.renderOrder = 3;
  const c = makeCanvas(256, 352), x = c.getContext('2d');
  x.fillStyle = '#f6f6f3'; x.fillRect(0, 0, 256, 352);
  x.textAlign = 'center'; x.fillStyle = '#3a4352';
  x.font = `italic 600 40px ${FONT}`; label[0].split(' ').forEach((w, i) => x.fillText(w, 128, 110 + i * 48));
  x.font = `500 28px ${FONT}`; x.fillStyle = '#7b8596';
  (label[1] || '').split(' ').forEach((w, i) => x.fillText(w, 128, 230 + i * 36));
  const frost = mesh(new THREE.BoxGeometry(1.9, T + 0.006, 2.6), mat.make.standard({ map: canvasTex(c), roughness: 0.95 }), { cast: false });
  frost.position.set(-2.85, T / 2, 0);
  g.add(glass, frost);

  const smear = new THREE.Mesh(new THREE.CircleGeometry(0.6, 40), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, depthWrite: false }));
  smear.rotation.x = -Math.PI / 2; smear.position.y = T + 0.008; smear.renderOrder = 4; smear.visible = false;
  const drop = mesh(new THREE.SphereGeometry(0.32, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    mat.make.physical({ roughness: 0.04, transparent: true, opacity: 0.55, clearcoat: 1, depthWrite: false }), { cast: false });
  drop.position.y = T; drop.renderOrder = 4; drop.visible = false;
  g.add(smear, drop);
  return {
    group: g, smear, drop,
    anchors: { top: V3(0, T, 0), floor: V3(0, T, 0) },
    thickness: T,
    /** k: 0 (none) … 1 (a full drop); flat: 0 (domed) … 1 (spread thin under a coverslip). */
    setDrop(k, color, flat = 0) {
      drop.visible = k > 0.01;
      if (color !== undefined) drop.material.color.set(color);
      drop.scale.set(k * (1 + 1.6 * flat), 0.5 * k * (1 - 0.85 * flat), k * (1 + 1.6 * flat));
    },
    setSmear(k, color) {
      smear.visible = k > 0.01;
      if (color !== undefined) smear.material.color.set(color);
      smear.scale.setScalar(0.15 + k * 0.85);
      smear.material.opacity = 0.35 + 0.5 * k;
    },
  };
}

/** Glass coverslip, 22 × 22 mm. */
export function makeCoverslip(mat) {
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(2.2, 0.025, 2.2), mat.make.glass({ color: '#f2f9ff', opacity: 0.32 }), { cast: false });
  m.position.y = 0.0125; m.renderOrder = 5;
  g.add(m);
  return { group: g, anchors: { top: V3(0, 0.025, 0) } };
}

/** A square of filter paper, 3 cm. setSpot(k, color) shows stain it has soaked up. */
export function makeFilterPaper(mat, { size = 3 } = {}) {
  const g = new THREE.Group();
  const m = mesh(new THREE.BoxGeometry(size, 0.02, size), mat.paper);
  m.position.y = 0.01;
  const spot = new THREE.Mesh(new THREE.CircleGeometry(0.9, 40), new THREE.MeshBasicMaterial({ map: softDot(), transparent: true, opacity: 0, depthWrite: false }));
  spot.rotation.x = -Math.PI / 2; spot.position.y = 0.022;
  g.add(m, spot);
  return {
    group: g, spot,
    anchors: { top: V3(0, 0.02, 0) },
    setSpot(k, color) {
      if (color !== undefined) spot.material.color.set(color);
      spot.material.opacity = Math.min(0.55, k * 0.6);
      spot.scale.setScalar(0.5 + k * 0.7);
    },
  };
}

/* ------------------------------------------------------------- microscope */

/** Compound light microscope, 36 cm tall: lamp in the base, a mechanical stage with clips,
 *  a revolving nosepiece of four objectives (4×, 10×, 40×, 100× oil) and a binocular head.
 *  Faces +z. Drawn in a 1/22 scale inner group, which is the original's unit. */
export function makeMicroscope(mat) {
  const K = 22;
  const g = new THREE.Group();
  const u = new THREE.Group();
  u.scale.setScalar(K);
  g.add(u);
  const dark = mat.make.solid(toLinear('#2a2e35'), 0.45, { metalness: 0.15 });
  const SM = {
    white: mat.make.physical({ color: toLinear('#f4f4f2'), roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.3 }),
    knurlDark: mat.make.standard({ color: toLinear('#2a2e35'), roughness: 0.55, metalness: 0.2, flatShading: true }),
    knurlSteel: mat.make.standard({ color: toLinear('#d0d4da'), metalness: 0.9, roughness: 0.28, flatShading: true }),
    barrel: mat.make.standard({ color: toLinear('#aab0b9'), metalness: 0.95, roughness: 0.3 }),
    lensGlass: mat.make.physical({ color: toLinear('#16202e'), roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
    black: mat.make.solid(toLinear('#121418'), 0.6),
  };
  const put = (geo, m, parent, pos, o) => { const x = mesh(geo, m, o); if (pos) x.position.set(pos[0], pos[1], pos[2]); parent.add(x); return x; };
  /** Cylinder with its rim pushed in and out into grip ridges. Axis +Y. */
  function knurl(r, h, ridges, depth, m, parent, y = 0) {
    const geo = new THREE.CylinderGeometry(r, r, h, ridges * 4, 1).toNonIndexed();
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rr = Math.hypot(x, z);
      if (rr < r * 0.5) continue;
      const j = ((Math.round((Math.atan2(x, z) / (Math.PI * 2)) * ridges * 4) % 4) + 4) % 4;
      const k = j < 2 ? 1 : 1 - depth;
      p.setX(i, (x / rr) * r * k); p.setZ(i, (z / rr) * r * k);
    }
    geo.computeVertexNormals();
    return put(geo, m, parent, [0, y, 0]);
  }
  /** Turned part from [radius, y] points spun around +Y. */
  function turn(pts, m, parent, seg = 32) {
    if (pts[0][1] > pts[pts.length - 1][1]) pts = pts.slice().reverse();   // faces point outward only when y runs upward
    return put(new THREE.LatheGeometry(pts.map(([r, y]) => V2(r, y)), seg), m, parent);
  }
  function bandTex(text) {
    const c = makeCanvas(512, 48), x = c.getContext('2d');
    x.fillStyle = '#e9ebee'; x.fillRect(0, 0, 512, 48);
    x.fillStyle = '#2a2e35'; x.font = `600 30px ${FONT}`; x.textBaseline = 'middle';
    const n = text.length > 11 ? 2 : 3;   // long labels wrap the barrel twice so they don't overlap
    for (let i = 0; i < n; i++) x.fillText(text, 12 + (i * 512) / n, 25);
    return canvasTex(c);
  }
  /** Side profile as [z, y] points, extruded across x and centred. */
  function side(pts, width, m, bevel = 0.02, curves) {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) {
      const q = curves && curves[i];
      if (q) sh.quadraticCurveTo(q[0], q[1], pts[i][0], pts[i][1]); else sh.lineTo(pts[i][0], pts[i][1]);
    }
    const depth = width - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 12 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2);
    return put(geo, m, u);
  }

  // base: plinth, housing with a chamfered front, brightness wheel and power switch
  put(cbox(0.8, 0.05, 1.0, 0.02), mat.rubber, u, [0, 0.025, 0.02]);
  side([[-0.48, 0.05], [0.5, 0.05], [0.5, 0.1], [0.38, 0.19], [-0.48, 0.19]], 0.78, SM.white, 0.015);
  const wheel = new THREE.Group();
  wheel.position.set(0.37, 0.12, 0.22); wheel.rotation.z = -Math.PI / 2; u.add(wheel);
  knurl(0.05, 0.03, 30, 0.08, SM.knurlDark, wheel, 0.02);
  put(new THREE.BoxGeometry(0.012, 0.035, 0.05), mat.make.solid(toLinear('#2fbf5a'), 0.4), u, [0.396, 0.115, -0.25]);
  // pillar, leaning forward at the top into the arm, and the head on it
  side([[-0.46, 0.19], [-0.18, 0.19], [-0.18, 1.0], [0.02, 1.35], [0.02, 1.42], [-0.36, 1.42], [-0.46, 1.32]], 0.22, SM.white, 0.02, { 6: [-0.46, 1.42] });
  put(new THREE.BoxGeometry(0.14, 0.34, 0.03), dark, u, [0, 0.53, -0.17]);   // focus rack the stage rides on
  side([[-0.22, 1.38], [0.2, 1.38], [0.22, 1.4], [0.22, 1.47], [0.045, 1.645], [-0.14, 1.645], [-0.22, 1.56]], 0.3, SM.white, 0.025, { 6: [-0.22, 1.645] });
  // stage, its aperture, clips and the coaxial focus knobs either side
  put(cbox(0.62, 0.035, 0.52, 0.012), dark, u, [0, 0.72, 0.14]);
  put(new THREE.CylinderGeometry(0.04, 0.04, 0.037, 24), new THREE.MeshBasicMaterial({ color: 0x0d0f12 }), u, [0, 0.72, 0.14], { cast: false });
  put(new THREE.BoxGeometry(0.2, 0.07, 0.26), dark, u, [0, 0.685, -0.08]);
  for (const sx of [1, -1]) {
    put(new THREE.BoxGeometry(0.035, 0.007, 0.17), mat.steel, u, [sx * 0.17, 0.742, 0.17]).rotation.y = sx * 0.12;
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 16), mat.steel, u, [sx * 0.17, 0.746, 0.095]);
    const kn = new THREE.Group();
    kn.position.set(0, 0.5, -0.33); kn.rotation.z = -sx * Math.PI / 2; u.add(kn);
    turn([[0, 0.095], [0.034, 0.095], [0.034, 0.112], [0.03, 0.116], [0, 0.116]], mat.steel, kn);
    turn([[0, 0.114], [0.072, 0.114], [0.08, 0.118], [0.08, 0.152], [0.072, 0.157], [0, 0.157]], dark, kn, 48);
    knurl(0.085, 0.03, 64, 0.03, SM.knurlDark, kn, 0.135);
    turn([[0, 0.156], [0.058, 0.156], [0.058, 0.159], [0.054, 0.162], [0, 0.162]], mat.steel, kn, 48);
    const sc = makeCanvas(512, 32), x = sc.getContext('2d');
    x.fillStyle = '#1d2026'; x.fillRect(0, 0, 512, 32); x.fillStyle = '#f2f2f2';
    for (let i = 0; i < 50; i++) x.fillRect((i * 512) / 50, 0, 2, i % 5 ? 14 : 26);
    put(new THREE.CylinderGeometry(0.053, 0.053, 0.011, 48, 1, true), mat.make.standard({ map: canvasTex(sc), roughness: 0.5 }), kn, [0, 0.1675, 0]);
    knurl(0.05, 0.026, 32, 0.06, SM.knurlSteel, kn, 0.186);
    turn([[0, 0.199], [0.046, 0.199], [0.046, 0.202], [0.04, 0.206], [0, 0.207]], mat.chrome, kn, 40);
    put(new THREE.CylinderGeometry(0.012, 0.012, 0.004, 20), dark, kn, [0, 0.207, 0]);
  }
  // mechanical stage rail and the X/Y knobs under its right side
  put(new THREE.BoxGeometry(0.5, 0.02, 0.03), mat.steel, u, [0, 0.748, -0.07]);
  const xy = new THREE.Group();
  xy.position.set(0.27, 0.7, 0.28); u.add(xy);
  put(new THREE.CylinderGeometry(0.008, 0.008, 0.16, 12), mat.steel, xy, [0, -0.08, 0]);
  knurl(0.034, 0.03, 22, 0.07, SM.knurlDark, xy, -0.07);
  knurl(0.026, 0.03, 18, 0.07, SM.knurlDark, xy, -0.13);
  put(new THREE.CylinderGeometry(0.02, 0.02, 0.006, 20), mat.chrome, xy, [0, -0.148, 0]);
  // condenser with its iris lever, and the lamp under it
  put(new THREE.CylinderGeometry(0.065, 0.055, 0.1, 28), dark, u, [0, 0.64, 0.14]);
  put(new THREE.TorusGeometry(0.063, 0.006, 8, 36), mat.steel, u, [0, 0.665, 0.14]).rotation.x = Math.PI / 2;
  put(new THREE.CylinderGeometry(0.005, 0.005, 0.09, 8), mat.steel, u, [0.09, 0.61, 0.2]).rotation.set(Math.PI / 2, 0, -1.0);
  put(new THREE.SphereGeometry(0.011, 14, 10), dark, u, [0.125, 0.61, 0.225]);
  const lampMat = mat.make.standard({ color: toLinear('#5a5f68'), emissive: new THREE.Color(0), roughness: 0.3 });
  turn([[0.07, 0.24], [0.08, 0.243], [0.09, 0.236], [0.092, 0.19], [0.07, 0.19]], dark, u, 40).position.z = 0.14;
  put(new THREE.CylinderGeometry(0.072, 0.072, 0.012, 32), lampMat, u, [0, 0.236, 0.14], { cast: false });
  put(new THREE.TorusGeometry(0.081, 0.006, 10, 40), mat.chrome, u, [0, 0.243, 0.14]).rotation.x = Math.PI / 2;
  const beam = put(new THREE.CylinderGeometry(0.045, 0.07, 0.345, 32, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    u, [0, 0.4175, 0.14], { cast: false, receive: false });
  beam.userData.noSketch = true;
  // The nosepiece is tilted: its axis leans back and the objectives sit on a matching cone,
  // so the one in use points straight down at the slide and the others fan out forward.
  const TILT = 0.3;
  const noseTilt = new THREE.Group();
  noseTilt.position.set(0, 1.356, 0.204); noseTilt.rotation.x = -TILT; u.add(noseTilt);
  const nose = new THREE.Group();
  noseTilt.add(nose);
  turn([[0, 0.05], [0.07, 0.045], [0.11, 0.03], [0.12, 0.02], [0.12, -0.012], [0.135, -0.018], [0.135, -0.025], [0, -0.025]], mat.steel, nose, 48);
  knurl(0.137, 0.014, 60, 0.04, SM.knurlSteel, nose, -0.005);
  put(new THREE.SphereGeometry(0.009, 12, 8), mat.chrome, nose, [0, 0.03, -0.112]);
  const OBJ = [
    { len: 0.12, ring: '#d94040', label: '4× / 0.10', tipR: 0.017, lensR: 0.012 },
    { len: 0.15, ring: '#f2c230', label: '10× / 0.25', tipR: 0.015, lensR: 0.009 },
    { len: 0.19, ring: '#3b78d8', label: '40× / 0.65', tipR: 0.012, lensR: 0.0055 },
    { len: 0.21, ring: '#f4f4f4', label: '100× / 1.25 OIL', tipR: 0.011, lensR: 0.0035, oil: true },
  ];
  OBJ.forEach((o, i) => {
    const L = o.len, arm = new THREE.Group();
    arm.rotation.y = Math.PI + (i * Math.PI) / 2; nose.add(arm);
    const ob = new THREE.Group();
    ob.position.set(0, -0.025, 0.075); ob.rotation.x = -TILT; arm.add(ob);
    const step = -L * 0.62;
    turn([[0, 0], [0.021, 0], [0.021, -0.008], [0.029, -0.01], [0.031, -0.014], [0.031, step + 0.006], [0.028, step], [0.024, step - 0.004],
      [o.tipR + 0.004, step - 0.01], [o.tipR + 0.004, -L + 0.022], [o.tipR, -L + 0.018], [o.tipR, -L + 0.006], [o.lensR + 0.003, -L], [0, -L]], SM.barrel, ob, 36);
    knurl(0.032, 0.014, 28, 0.06, SM.knurlSteel, ob, -0.02);
    put(new THREE.CylinderGeometry(0.0318, 0.0318, 0.008, 32), mat.make.solid(toLinear(o.ring), 0.35, { metalness: 0.1 }), ob, [0, -0.034, 0]);
    put(new THREE.CylinderGeometry(0.0316, 0.0316, 0.016, 40, 1, true), mat.make.standard({ map: bandTex(o.label), roughness: 0.4, metalness: 0.3 }), ob, [0, -0.05, 0]);
    if (o.oil) put(new THREE.CylinderGeometry(o.tipR + 0.0045, o.tipR + 0.0045, 0.005, 24), SM.black, ob, [0, step - 0.016, 0]);
    put(new THREE.TorusGeometry(o.lensR + 0.0012, 0.0012, 6, 24), SM.black, ob, [0, -L - 0.0002, 0]).rotation.x = Math.PI / 2;
    put(new THREE.SphereGeometry(o.lensR, 20, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), SM.lensGlass, ob, [0, -L + o.lensR * 0.78, 0], { cast: false });
  });
  // binocular head: pivot and two eyepieces (tube, collar, diopter ring on the left, rubber cup, ocular)
  const eyeG = new THREE.Group();
  eyeG.position.set(0, 1.57, 0.12); eyeG.rotation.x = 0.75; u.add(eyeG);
  put(cbox(0.22, 0.08, 0.14, 0.03), dark, eyeG, [0, 0.02, 0]);
  put(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24), mat.chrome, eyeG, [0, 0.07, 0]);
  for (const sx of [1, -1]) {
    const ep = new THREE.Group();
    ep.position.set(sx * 0.055, 0, 0); eyeG.add(ep);
    put(new THREE.CylinderGeometry(0.03, 0.036, 0.22, 28), dark, ep, [0, 0.13, 0]);
    turn([[0.03, 0.235], [0.033, 0.238], [0.033, 0.258], [0.03, 0.262], [0.026, 0.262]], mat.chrome, ep, 32);
    if (sx < 0) knurl(0.035, 0.016, 26, 0.06, SM.knurlDark, ep, 0.25);
    turn([[0.022, 0.27], [0.026, 0.262], [0.034, 0.264], [0.038, 0.28], [0.039, 0.318], [0.036, 0.326], [0.03, 0.326], [0.028, 0.32], [0.026, 0.29], [0.022, 0.282]], mat.rubber, ep, 32);
    put(new THREE.SphereGeometry(0.03, 24, 6, 0, Math.PI * 2, 0, Math.PI * 0.22), SM.lensGlass, ep, [0, 0.256, 0], { cast: false });
    put(new THREE.CircleGeometry(0.022, 24), SM.black, ep, [0, 0.27, 0], { cast: false }).rotation.x = -Math.PI / 2;
  }
  const eyeAxis = V3(0, 1, 0).applyAxisAngle(V3(1, 0, 0), 0.75);
  return {
    group: g, nose, K,
    anchors: {
      stage: V3(0, 0.7375, 0.14).multiplyScalar(K),
      eye: V3(0, 1.57, 0.12).multiplyScalar(K).addScaledVector(eyeAxis, 0.33 * K),
      eyeAxis,
      top: V3(0, 1.645 * K, 0),
    },
    setLamp(k) {
      lampMat.emissive.setRGB(1.6 * k, 1.45 * k, 1.1 * k);
      beam.material.opacity = 0.32 * k;
    },
  };
}
