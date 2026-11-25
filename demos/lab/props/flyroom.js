/* The fly room, for Drosophila genetics: a culture vial that runs the life cycle, bench-scale
 * flies, the CO₂ fly pad and blowgun, a stereo microscope and the morgue. 1 unit = 1 cm.
 *
 *   const v = makeFlyVial(mat, { label: 'A', sub: 'red ♀ × white ♂', seed: 1 });
 *   v.setPlug(k)                  // 0 in, 1 pulled and lifted clear
 *   v.setLife({ day, eyes })      // eggs, larvae, wanderers, pupae, empty cases; eyes: one 'red'|'white' per offspring
 *   v.setAdults([{ sex, eye, id }])
 *   v.setAsleep(k)                // knocked-out flies lie on whichever wall is down in world space
 *   v.update(time)                // every frame: flies crawl and hop, larvae squirm. A pure function of time
 *   anchors: mouth (rim centre), top (top of the seated plug), floor (food surface), center (mid air space)
 *
 *   const s = makeFlySwarm(mat, 200);   s.set(i, pos, quat, { sex, eye, pose }); s.commit();   // set(i, null) hides i
 *   pose 'side' (default): with quat identity the fly lies on its side on a +y surface; 'stand' stands on it.
 *
 * Flies are drawn in instanced batches (body per sex and pose, eyes coloured per instance, wings), the
 * same mini look in the vial, the swarm and the morgue. Body along +x (head +x), dorsal +y, origin
 * under the thorax at the feet. Female 2.5 mm, male 2.0 mm.
 */
import * as THREE from 'three';
import { V3, clamp, lerp, smooth } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh, lathe, rbox, wrapLabel, roundedRectShape } from '../core/geometry.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { tapeLabel } from '../core/labels.js';
import { makeLiquid } from '../core/liquid.js';
import { LIGHT, DECAY } from '../core/three-compat.js';
import { toLinear } from '../materials.js';
import { ss, lc, geoCache, matCache, texCache, live, paint, sheet, merge, tint, curve } from './shapes.js';

export const FLY_COLORS = {
  eyeRed: '#a8231c', eyeWhite: '#efe9dc', body: '#c9a36a', band: '#3b2a1a', wing: '#e8eef2', vein: '#7a6a55',
  food: '#8a5a2b', yeast: '#e9dcc0', pupaTan: '#c79a55', pupaDark: '#5a3a1c', larva: '#f3efe6',
};
const C = FLY_COLORS;
const MALE_K = 0.8;   // the body is built at female size (2.5 mm); a male is drawn at 0.8 of it

/** Integer hash to [0, 1): the crawl is a function of time, so every random choice is one. */
function hash(a, b, c = 0) {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const idNum = (id, i) => (typeof id === 'number' ? id : String(id ?? i).split('').reduce((a, ch) => (Math.imul(a, 31) + ch.charCodeAt(0)) | 0, 7));

/** Ellipsoid with its poles on x, so its latitude rings run along the body (bands follow them). */
function ellipsoid(rx, ry, rz, ws = 14, hs = 10) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.rotateZ(Math.PI / 2); g.scale(rx, ry, rz);
  return g;
}
/** Vertex colours from fn(x, y, z) → THREE.Color. */
function paintVerts(g, fn) {
  const p = g.attributes.position, a = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const c = fn(p.getX(i), p.getY(i), p.getZ(i)); a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
/** A set of materials built once per material set, each marked shared. */
const kit = (mat, key, make) => matCache(mat, key, () => { const o = make(); Object.values(o).forEach((m) => { m.userData.shared = true; }); return Object.assign(o, { userData: {} }); });
const tube = (pts, r, seg = 10, rad = 4) => new THREE.TubeGeometry(curve(pts), seg, r, rad, false);

/* ------------------------------------------------------------------ the mini fly */

function flyBody(male, sleep) {
  return geoCache(`fly:body:${male ? 'm' : 'f'}${sleep ? 's' : ''}`, () => {
    const tan = lc(C.body), band = lc(C.band), legC = lc(C.body).multiplyScalar(0.6), tmp = new THREE.Color();
    const thorax = ellipsoid(0.048, 0.043, 0.04, 16, 12); thorax.translate(0.02, 0.07, 0);
    paintVerts(thorax, (x, y) => tmp.copy(tan).multiplyScalar(y > 0.09 ? 0.74 : 0.86));
    const scut = ellipsoid(0.02, 0.012, 0.024, 10, 6); scut.translate(-0.022, 0.102, 0); tint(scut, '#9c7b4b');
    const head = ellipsoid(0.026, 0.034, 0.042, 14, 10); head.translate(0.088, 0.072, 0);
    paintVerts(head, () => tmp.copy(tan).multiplyScalar(1.02));
    // abdomen: tapered behind, tergite bands on the back and sides only
    const L = male ? 0.06 : 0.085, cx = -0.028 - L, ry = male ? 0.042 : 0.04;
    const ab = ellipsoid(L, ry, ry * 1.05, 20, 18);
    const p = ab.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), back = clamp(-x / L);
      const k = 1 - (male ? 0.18 : 0.45) * back * back;
      p.setY(i, p.getY(i) * k - (male ? 0.004 : 0.012) * back * back); p.setZ(i, p.getZ(i) * k);
    }
    ab.translate(cx, 0.062, 0);
    paintVerts(ab, (x, y) => {
      const u = (x - (cx - L)) / (2 * L), dorsal = y - 0.062 > -0.55 * ry;
      if (!dorsal) return tmp.copy(tan).multiplyScalar(1.05);
      if (male && u < 0.42) return band;
      const seg = (1 - u) * (male ? 4.2 : 6.2);
      return (seg % 1) > (male ? 0.55 : 0.6) && u > 0.1 ? band : tan;
    });
    ab.computeVertexNormals();
    const parts = [thorax, scut, head, ab];
    // antennae: two small knobs on the face
    for (const s of [1, -1]) { const a = ellipsoid(0.008, 0.012, 0.007, 6, 5); a.translate(0.112, 0.082, s * 0.012); tint(a, '#b08a55'); parts.push(a); }
    // legs: front, middle, hind; standing on y = 0, or curled under a knocked-out fly
    const bx = [0.045, 0.02, -0.004];
    const STAND = [
      [[0.078, 0.072, 0.052], [0.1, 0.035, 0.07], [0.112, 0.002, 0.078]],
      [[0.024, 0.078, 0.075], [0.018, 0.04, 0.1], [0.012, 0.002, 0.115]],
      [[-0.035, 0.078, 0.065], [-0.07, 0.04, 0.085], [-0.095, 0.002, 0.095]],
    ];
    const CURL = [
      [[0.07, 0.03, 0.04], [0.085, 0.045, 0.03], [0.07, 0.05, 0.022]],
      [[0.03, 0.025, 0.05], [0.04, 0.04, 0.035], [0.025, 0.048, 0.025]],
      [[-0.02, 0.025, 0.045], [-0.03, 0.04, 0.032], [-0.015, 0.05, 0.024]],
    ];
    for (let i = 0; i < 3; i++) for (const s of [1, -1]) {
      const pts = [V3(bx[i], 0.045, s * 0.018), ...(sleep ? CURL : STAND)[i].map(([x, y, z]) => V3(x, y, s * z))];
      parts.push(paintVerts(tube(pts, 0.0045, 10, 4), () => legC));
    }
    return merge(parts);
  });
}
function flyEyes() {
  return geoCache('fly:eyes', () => merge([1, -1].map((s) => {
    const e = ellipsoid(0.021, 0.03, 0.018, 14, 10);
    e.rotateY(s * 0.25); e.translate(0.093, 0.076, s * 0.03);
    return e;
  })));
}
const WING_L = 0.19, WING_W = 0.078;
const WING_OUT = [[0, 0.006], [0.03, 0.001], [0.11, 0.003], [0.165, 0.014], [0.19, 0.038], [0.183, 0.06], [0.15, 0.076], [0.09, 0.073], [0.04, 0.052], [0.014, 0.028], [0, 0.014]];
function wingTex() {
  return texCache('fly:wing', () => {
    const W = 256, H = 112, c = makeCanvas(W, H), x = c.getContext('2d');
    const P = (u, v) => [u / WING_L * W, v / WING_W * H];
    x.fillStyle = 'rgba(232,238,242,0.2)'; x.fillRect(0, 0, W, H);
    x.lineCap = 'round';
    x.strokeStyle = 'rgba(122,106,85,0.45)'; x.lineWidth = 3;   // the fringed margin
    x.beginPath(); WING_OUT.forEach(([u, v], i) => (i ? x.lineTo(...P(u, v)) : x.moveTo(...P(u, v)))); x.closePath(); x.stroke();
    x.strokeStyle = 'rgba(122,106,85,0.95)'; x.lineWidth = 3.2;
    const vein = (pts) => { x.beginPath(); x.moveTo(...P(...pts[0])); for (let i = 1; i < pts.length - 1; i++) { const [a, b] = P(...pts[i]), [c2, d] = P(...pts[i + 1]); x.quadraticCurveTo(a, b, (a + c2) / 2, (b + d) / 2); } x.lineTo(...P(...pts[pts.length - 1])); x.stroke(); };
    vein([[0.0, 0.006], [0.06, 0.002], [0.13, 0.006], [0.175, 0.02]]);                      // costa
    vein([[0.012, 0.01], [0.06, 0.008], [0.12, 0.008]]);                                     // L2
    vein([[0.014, 0.014], [0.08, 0.018], [0.14, 0.026], [0.188, 0.036]]);                    // L3
    vein([[0.016, 0.02], [0.08, 0.034], [0.135, 0.05], [0.172, 0.062]]);                     // L4
    vein([[0.018, 0.026], [0.07, 0.048], [0.11, 0.066], [0.125, 0.074]]);                    // L5
    x.lineWidth = 2.6;
    vein([[0.082, 0.019], [0.08, 0.034]]);    // anterior cross vein
    vein([[0.104, 0.043], [0.098, 0.06]]);    // posterior cross vein
    return canvasTex(c);
  });
}
function flyWings(spread) {
  return geoCache(`fly:wings:${spread ? 1 : 0}`, () => {
    const sh = new THREE.Shape();
    sh.moveTo(...WING_OUT[0]);
    sh.splineThru(WING_OUT.slice(1).map(([u, v]) => new THREE.Vector2(u, v)));
    sh.closePath();
    const parts = [1, -1].map((s) => {
      const w = new THREE.ShapeGeometry(sh, 16);
      const p = w.attributes.position, uv = w.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        const u = p.getX(i), v = p.getY(i);
        uv.setXY(i, u / WING_L, 1 - v / WING_W);
        p.setXYZ(i, -u, 0, s * (0.012 - v));   // root at the origin, back along -x, costa on the outside
      }
      w.rotateZ(spread ? 0.22 : 0.07);        // tip down onto the abdomen
      w.rotateY(s * (spread ? -0.32 : -0.1)); // tips apart
      w.translate(0.012, 0.106 + (s > 0 ? 0.002 : 0), s * 0.016);
      w.computeVertexNormals();
      return w;
    });
    return merge(parts);
  });
}
function flyMats(mat) {
  return kit(mat, 'fly:mats', () => ({
    body: mat.make.physical({ vertexColors: true, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.4 }),
    eye: mat.make.physical({ color: 0xffffff, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
    wing: mat.make.physical({ map: wingTex(), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 0.35, iridescence: 0.45, iridescenceIOR: 1.35, iridescenceThicknessRange: [220, 420] }),
  }));
}

// A fly on its side: rolled onto its right flank, resting on the surface it would stand on.
const SIDE_Q = new THREE.Quaternion().setFromAxisAngle(V3(1, 0, 0), Math.PI / 2);
const SIDE_T = V3(0, 0.046, -0.068);
const EYE = { red: lc(C.eyeRed), white: lc(C.eyeWhite) };

/** Instanced flies. add(pos, quat, sex, eye, sleep) per frame between begin() and end(). */
function flyBatch(mat, max) {
  const K = flyMats(mat), g = new THREE.Group();
  const mk = (geo, m, order = 0) => {
    const x = new THREE.InstancedMesh(geo, m, max);
    x.count = 0; x.frustumCulled = false; x.castShadow = false; x.receiveShadow = true; x.renderOrder = order;
    x.userData.noSketch = true;   // the outline would ink a 2 mm fly into a black dot
    g.add(x); return x;
  };
  const bodies = [mk(flyBody(false, false), K.body), mk(flyBody(false, true), K.body), mk(flyBody(true, false), K.body), mk(flyBody(true, true), K.body)];
  const eyes = mk(flyEyes(), K.eye);
  const wings = [mk(flyWings(false), K.wing, 2), mk(flyWings(true), K.wing, 2)];
  eyes.setColorAt(0, EYE.red);
  const m4 = new THREE.Matrix4(), sc = V3(), n = [0, 0, 0, 0], wn = [0, 0];
  let ne = 0;
  return {
    group: g, max, wings,
    begin() { n.fill(0); wn.fill(0); ne = 0; },
    add(pos, quat, sex, eye, sleep) {
      if (ne >= max) return;
      const k = sex === 'm' ? MALE_K : 1, b = (sex === 'm' ? 2 : 0) + (sleep ? 1 : 0), w = sleep ? 1 : 0;
      m4.compose(pos, quat, sc.set(k, k, k));
      bodies[b].setMatrixAt(n[b]++, m4);
      wings[w].setMatrixAt(wn[w]++, m4);
      eyes.setMatrixAt(ne, m4); eyes.setColorAt(ne, eye === 'white' ? EYE.white : EYE.red); ne++;
    },
    end() {
      bodies.forEach((x, i) => { x.count = n[i]; x.instanceMatrix.needsUpdate = true; });
      wings.forEach((x, i) => { x.count = wn[i]; x.instanceMatrix.needsUpdate = true; });
      eyes.count = ne; eyes.instanceMatrix.needsUpdate = true; eyes.instanceColor.needsUpdate = true;
    },
  };
}
const _sideV = V3();
/** Turn a standing pose (feet at pos, dorsal along quat's +y) into the fly lying on its side there. */
function toSide(pos, quat, sex) {
  const k = sex === 'm' ? MALE_K : 1;
  pos.add(_sideV.copy(SIDE_T).multiplyScalar(k).applyQuaternion(quat));
  quat.multiply(SIDE_Q);
}

/** Bench-scale flies: set(i, pos, quat, { sex, eye, pose }) then commit(). pos/quat in the group's
 *  space. pose 'side' (default) lies the fly on its flank, legs curled, wings a little spread. */
export function makeFlySwarm(mat, max = 200) {
  const batch = flyBatch(mat, max);
  const flies = [];
  const P = V3(), Qt = new THREE.Quaternion();
  const out = {
    group: batch.group, max, count: 0,
    set(i, pos, quat, { sex = 'f', eye = 'red', pose = 'side' } = {}) {
      if (i >= max) return;
      if (!pos) { flies[i] = null; return; }   // set(i, null) hides fly i
      flies[i] = { pos: pos.clone(), quat: (quat || Qt.identity()).clone(), sex, eye, side: pose !== 'stand' };
      if (i >= out.count) out.count = i + 1;
    },
    commit() {
      batch.begin();
      for (let i = 0; i < out.count; i++) {
        const f = flies[i];
        if (!f) continue;
        P.copy(f.pos); Qt.copy(f.quat);
        if (f.side) toSide(P, Qt, f.sex);
        batch.add(P, Qt, f.sex, f.eye, f.side);
      }
      batch.end();
    },
  };
  return out;
}

/* ------------------------------------------------------------------ eggs, larvae, pupae */

function eggGeo() {
  return geoCache('fly:egg', () => {
    const e = ellipsoid(0.5, 0.19, 0.19, 12, 8);
    const fil = [1, -1].map((s) => { const f = new THREE.CylinderGeometry(0.012, 0.025, 0.4, 5); f.rotateZ(-1.1); f.translate(0.5, 0.2, s * 0.07); return f; });
    return merge([e, ...fil].map((q) => tint(q, '#f8f5ee')));
  });
}
function larvaGeo() {
  return geoCache('fly:larva', () => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const u = i / 40, y = u - 0.5;   // posterior (y −0.5) to the mouth (+0.5)
      const env = Math.sqrt(Math.max(0, 1 - Math.pow(Math.max(0, 0.08 - u) / 0.08, 2))) * (u > 0.62 ? Math.cos((u - 0.62) / 0.38 * Math.PI / 2 * 0.92) : 1);
      const rib = 1 + 0.06 * Math.cos(u * Math.PI * 2 * 11) * ss(0.05, 0.15, u) * (1 - ss(0.85, 0.95, u));
      pts.push([0.12 * env * rib + (i === 0 || i === 40 ? 0 : 0.0005), y]);
    }
    pts[0][0] = 0; pts[40][0] = 0;
    const g = lathe(pts, 10);
    g.rotateZ(-Math.PI / 2);   // anterior along +x
    const body = lc(C.larva), gut = lc('#d9c7a2'), hook = lc('#1d140d'), spir = lc('#8a6a40'), tmp = new THREE.Color();
    paintVerts(g, (x, y) => {
      if (x > 0.455) return hook;
      if (x < -0.47) return spir;
      return tmp.copy(body).lerp(gut, 0.45 * Math.exp(-((y + 0.02) ** 2) / 0.004) * ss(-0.3, 0, x) * (1 - ss(0.2, 0.4, x)));   // gut showing through the back
    });
    return g;
  });
}
function pupaProfile(cut) {
  const P = [[0, -0.5], [0.07, -0.49], [0.12, -0.45], [0.155, -0.37], [0.17, -0.22], [0.172, 0.05], [0.165, 0.22], [0.14, 0.36], [0.1, 0.45], [0.05, 0.49], [0, 0.5]];
  const out = [];
  for (let i = 0; i < P.length - 1; i++) for (let k = 0; k < 4; k++) {
    const t = k / 4, r = lerp(P[i][0], P[i + 1][0], t), y = lerp(P[i][1], P[i + 1][1], t);
    if (cut && y > 0.3) break;
    out.push([r * (1 + 0.035 * Math.cos(y * Math.PI * 2 * 9) * ss(-0.42, -0.3, y) * (1 - ss(0.2, 0.32, y))), y]);
  }
  if (!cut) out.push([0, 0.5]);
  return out;
}
function pupaGeo(cut) {
  return geoCache(`fly:pupa:${cut ? 1 : 0}`, () => {
    const g = lathe(pupaProfile(cut), 14);
    g.rotateZ(-Math.PI / 2); g.scale(1, 0.78, 1);
    if (cut) return tint(g, '#ffffff');
    const horns = [1, -1].map((s) => { const h = new THREE.CylinderGeometry(0.008, 0.022, 0.13, 5); h.rotateZ(-0.9); h.translate(0.47, 0.09, s * 0.05); return tint(h, '#7a5a3a'); });
    const spir = [1, -1].map((s) => { const h = new THREE.CylinderGeometry(0.012, 0.02, 0.06, 5); h.rotateZ(Math.PI / 2 - 0.3); h.translate(-0.51, 0.03, s * 0.03); return tint(h, '#7a5a3a'); });
    return merge([tint(g, '#ffffff'), ...horns, ...spir]);
  });
}
function pupaEyesGeo() {
  return geoCache('fly:pupaEyes', () => merge([1, -1].map((s) => { const e = ellipsoid(0.07, 0.05, 0.035, 10, 8); e.translate(0.3, 0.05, s * 0.125); return e; })));
}
function yeastGeo() { return geoCache('fly:yeast', () => new THREE.IcosahedronGeometry(1, 0)); }

/* ------------------------------------------------------------------ food textures */

function foodTex(kind) {
  return texCache('fly:food:' + kind, () => {
    const W = 512, H = kind === 'side' ? 192 : 512, c = makeCanvas(W, H), x = c.getContext('2d'), R = seeded(kind === 'side' ? 31 : 32);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {   // cornmeal grains, molasses, air pockets
      const r = R();
      x.fillStyle = r < 0.45 ? `rgba(255,214,140,${0.12 + R() * 0.25})` : r < 0.85 ? `rgba(60,30,10,${0.08 + R() * 0.2})` : `rgba(255,240,200,${0.2 + R() * 0.3})`;
      x.beginPath(); x.ellipse(R() * W, R() * H, 0.8 + R() * 2.6, 0.8 + R() * 2, R() * 3, 0, 7); x.fill();
    }
    const t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}
/** Tunnels larvae leave against the wall: a transparent overlay faded in as they churn the food. */
function tunnelTex() {
  return texCache('fly:tunnels', () => {
    const W = 512, H = 192, c = makeCanvas(W, H), x = c.getContext('2d'), R = seeded(44);
    x.clearRect(0, 0, W, H); x.lineCap = 'round';
    for (let i = 0; i < 46; i++) {
      let px = R() * W, py = R() * H, a = R() * 6.28;
      x.strokeStyle = R() < 0.75 ? `rgba(55,30,12,${0.3 + R() * 0.3})` : `rgba(215,180,125,${0.2 + R() * 0.2})`;
      x.lineWidth = 2 + R() * 3;
      x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 14; k++) { a += (R() - 0.5) * 1.2; px += Math.cos(a) * 9; py += Math.sin(a) * 9; x.lineTo(px, py); }
      x.stroke();
    }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
function fiberTex() {
  return texCache('fly:fiber', () => {
    const W = 256, H = 256, c = makeCanvas(W, H), x = c.getContext('2d'), R = seeded(9);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      x.strokeStyle = R() < 0.5 ? `rgba(120,100,70,${0.04 + R() * 0.08})` : `rgba(255,255,255,${0.15 + R() * 0.25})`;
      x.lineWidth = 0.6 + R() * 1.2;
      const px = R() * W, py = R() * H, a = Math.PI / 2 + (R() - 0.5) * 0.9, l = 4 + R() * 16;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    const t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/* ------------------------------------------------------------------ vial */

/** Narrow Drosophila vial, 25 × 95 mm polystyrene, 2.2 cm of cornmeal-molasses food under a
 *  sprinkle of live yeast, a cellulose-acetate plug. Origin at the centre of the base. */
export function makeFlyVial(mat, { label, sub, seed = 1, labelColor = '#7c3aed', labelAt = 0, max = 160, maxAdults = 160 } = {}) {
  const R = 1.25, H = 9.5, T = 0.09, RI = R - T, BOT = 0.17;
  const RF = RI - 0.04, FY = BOT + 2.2;                 // food radius and surface
  const PLUG_IN = 1.7, PLUG_B = H - PLUG_IN, PLUG_TOP = H + 1.05;
  const YLO = FY + 0.3, YHI = PLUG_B - 0.25;            // where flies and pupae can be on the wall
  const g = new THREE.Group();

  const plastic = matCache(mat, 'fly:vialPS', () => mat.make.plastic({ color: '#e6eef6', opacity: 0.22, edge: 0.55 }));
  const shell = mesh(lathe([
    [0.001, 0.015], [R - 0.14, 0.015], [R - 0.03, 0.05], [R, 0.17], [R, H - 0.04], [R - 0.02, H], [RI + 0.02, H], [RI, H - 0.04], [RI, BOT + 0.07], [RI - 0.07, BOT], [0.001, BOT],
  ], 56), plastic, { cast: false });
  shell.renderOrder = 3;
  const lip = mesh(new THREE.TorusGeometry(R - 0.045, 0.045, 6, 56), mat.glassEdge, { cast: false });
  lip.rotation.x = Math.PI / 2; lip.position.y = H - 0.03; lip.renderOrder = 4;
  const foot = mesh(new THREE.TorusGeometry(R - 0.07, 0.05, 6, 56), mat.glassEdge, { cast: false });
  foot.rotation.x = Math.PI / 2; foot.position.y = 0.08; foot.renderOrder = 4;
  g.add(shell, lip, foot);

  // food: the side, a top surface that larvae churn (a morph), wet tunnels against the wall
  const sideMat = matCache(mat, 'fly:foodSide', () => mat.make.standard({ color: lc(C.food), map: foodTex('side'), bumpMap: foodTex('side'), bumpScale: 1.5, roughness: 0.85 }));
  const side = mesh(new THREE.CylinderGeometry(RF, RF, FY + 0.05 - BOT - 0.005, 48, 1, true), sideMat, { cast: false });
  side.position.y = (FY + 0.05 + BOT + 0.005) / 2;
  const under = mesh(new THREE.CircleGeometry(RF, 48), sideMat, { cast: false });
  under.rotation.x = Math.PI / 2; under.position.y = BOT + 0.005;
  const tunnelMat = live(mat.make.standard({ map: tunnelTex(), transparent: true, opacity: 0, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  const tunnels = mesh(new THREE.CylinderGeometry(RF + 0.003, RF + 0.003, FY - BOT - 0.1, 48, 1, true), tunnelMat, { cast: false, receive: false });
  tunnels.position.y = (FY + BOT) / 2; tunnels.renderOrder = 1;
  const R0 = seeded(seed * 131 + 7);
  const dimples = [...Array(26)].map(() => { const a = R0() * 6.283, d = Math.sqrt(R0()) * RF * 0.9; return [Math.cos(a) * d, Math.sin(a) * d, 0.03 + R0() * 0.05, 0.08 + R0() * 0.1]; });
  const ridge = (x, z) => 0.012 * Math.sin(x * 9 + z * 4) * Math.cos(z * 11 - x * 3) + 0.008 * Math.sin(x * 23 - z * 17);
  const hFresh = (x, z, b) => FY + 0.045 * ss(0.8, 1, b) + 0.004 * Math.sin(x * 14) * Math.cos(z * 12);
  const hChurn = (x, z, b) => {
    let y = FY - 0.05 + 2.2 * ridge(x, z) + 0.07 * ss(0.85, 1, b);
    dimples.forEach(([cx, cz, d, w]) => { y -= d * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (w * w)); });
    return y;
  };
  const top = (() => {
    const make = (h) => sheet(56, 14, (a, b, o) => { const an = a * Math.PI * 2, x = Math.cos(an) * b * RF, z = Math.sin(an) * b * RF; o.set(x, h(x, z, b), z); });
    const base = make(hFresh);
    const uv = base.attributes.uv, p = base.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2.4 * RF), 0.5 + p.getZ(i) / (2.4 * RF));
    const churn = make(hChurn);
    base.morphAttributes.position = [churn.attributes.position];
    base.morphAttributes.normal = [churn.attributes.normal];
    return base;
  })();
  const topMat = live(mat.make.physical({ color: lc(C.food), map: foodTex('top'), bumpMap: foodTex('top'), bumpScale: 1.2, roughness: 0.82, clearcoat: 0, clearcoatRoughness: 0.35 }));
  const surface = mesh(top, topMat, { cast: false });
  surface.morphTargetInfluences = [0];
  const food = new THREE.Group();
  food.add(side, under, tunnels, surface);
  g.add(food);
  const surfY = (x, z, k) => { const b = clamp(Math.hypot(x, z) / RF); return lerp(hFresh(x, z, b), hChurn(x, z, b), k); };

  // instanced life
  const inst = (geo, m, n, order = 0) => { const x = new THREE.InstancedMesh(geo, m, n); x.count = 0; x.frustumCulled = false; x.castShadow = false; x.renderOrder = order; x.userData.noSketch = true; g.add(x); return x; };
  const lifeMats = kit(mat, 'fly:lifeMats', () => ({
    egg: mat.make.physical({ vertexColors: true, roughness: 0.3, clearcoat: 0.6 }),
    larva: mat.make.physical({ vertexColors: true, roughness: 0.28, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
    pupa: mat.make.physical({ vertexColors: true, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    pEye: mat.make.physical({ color: 0xffffff, roughness: 0.45, clearcoat: 0.4 }),
    case: mat.make.physical({ vertexColors: true, color: lc('#d2b072'), roughness: 0.45, transparent: true, opacity: 0.78, side: THREE.DoubleSide, depthWrite: false }),
    yeast: mat.make.standard({ color: lc(C.yeast), roughness: 0.9, flatShading: true }),
  }));
  const eggs = inst(eggGeo(), lifeMats.egg, max);
  const larvae = inst(larvaGeo(), lifeMats.larva, max);
  const pupae = inst(pupaGeo(false), lifeMats.pupa, max);
  const pEyes = inst(pupaEyesGeo(), lifeMats.pEye, max);
  const cases = inst(pupaGeo(true), lifeMats.case, max, 2);
  const yeast = inst(yeastGeo(), lifeMats.yeast, 80);
  pupae.setColorAt(0, new THREE.Color()); pEyes.setColorAt(0, new THREE.Color());
  const flies = flyBatch(mat, maxAdults);
  g.add(flies.group);

  // plug
  const plugG = new THREE.Group();
  const plugMat = matCache(mat, 'fly:plug', () => mat.make.standard({ color: lc('#ddd0b0'), map: fiberTex(), bumpMap: fiberTex(), bumpScale: 1.2, roughness: 0.97 }));
  const RP = RI - 0.04, RPT = RI + 0.03;
  plugG.add(mesh(lathe([[0.001, PLUG_B], [RP - 0.08, PLUG_B], [RP, PLUG_B + 0.08], [RP, H - 0.02], [RPT - 0.02, H + 0.05], [RPT, H + 0.15], [RPT, PLUG_TOP - 0.16], [RPT - 0.06, PLUG_TOP - 0.04], [RPT - 0.2, PLUG_TOP], [0.001, PLUG_TOP - 0.02]], 40), plugMat));
  g.add(plugG);

  if (label) {
    g.add(wrapLabel({ rTop: R + 0.012, rBot: R + 0.012, y0: 6.1, y1: 7.5, arc: 1.55, center: labelAt, order: 6,
      draw: (c, w, hh) => tapeLabel(c, w, hh, label, sub, labelColor) }));
  }

  // yeast grains, fixed per seed
  const grains = [...Array(80)].map(() => { const a = R0() * 6.283, d = Math.sqrt(R0()) * RF * 0.93; return { x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.016 + R0() * 0.02, q: new THREE.Quaternion().setFromEuler(new THREE.Euler(R0() * 3, R0() * 3, R0() * 3)) }; });

  // one plan per offspring: egg site, larval habit, the wall spot it pupates on, its timetable
  const plan = [...Array(max)].map((_, i) => {
    const r = seeded(seed * 7919 + i * 104729 + 1);
    const ea = r() * 6.283, ed = Math.sqrt(r()) * RF * 0.85;
    const tl = r() * 0.45, th = 0.9 + tl * 0.35 + r() * 0.1;
    const wall = r() < 0.45, la = r() * 6.283;
    const tw = 4.4 + r() * 0.6;
    const pa = r() * 6.283, py = YLO + 0.2 + (YHI - YLO - 0.5) * Math.pow(r(), 1.25);
    return {
      ex: Math.cos(ea) * ed, ez: Math.sin(ea) * ed, eyaw: r() * 6.283, tl, th,
      wall, la, ly: BOT + 0.3 + r() * (FY - BOT - 0.55), lpsi: (r() - 0.5) * 3, ld: 0.6 + r() * 0.35, lr: Math.sqrt(r()) * RF * 0.8, lyaw: r() * 6.283,
      tw, tp: tw + 0.5 + r() * 0.15, pa, py, ppsi: (r() - 0.5) * 1.1, start: pa + (r() - 0.5) * 0.8,
      te: 9.5 + 2 * Math.pow(r(), 0.8), ph: r() * 6.283, size: 0.92 + r() * 0.16,
    };
  });

  const st = { day: 0, eyes: [], n: 60, adults: [], asleep: 0, time: 0, plug: 0 };
  const M = new THREE.Matrix4(), P = V3(), Qt = new THREE.Quaternion(), S = V3(), X = V3(), Y = V3(), Z = V3(), basis = new THREE.Matrix4();
  const UP = V3(0, 1, 0), DOWN = V3(0, -1, 0), col = new THREE.Color(), cTan = lc(C.pupaTan), cDark = lc(C.pupaDark), cPre = lc('#ece3cf');
  /** Orientation whose +x is `x` and +y is `y` (y need not be exactly normal to x). */
  const frame = (q, x, y) => { X.copy(x).normalize(); Y.copy(y).addScaledVector(X, -y.dot(X)).normalize(); Z.crossVectors(X, Y); basis.makeBasis(X, Y, Z); return q.setFromRotationMatrix(basis); };
  const wallN = (a, out) => out.set(-Math.cos(a), 0, -Math.sin(a));
  const wallT = (a, out) => out.set(-Math.sin(a), 0, Math.cos(a));
  const vN = V3(), vT = V3(), vH = V3();
  /** Pose on the inner wall at angle a, height y, heading psi (0 = up), lifted h off it. */
  const onWall = (a, y, psi, r, q) => {
    wallN(a, vN); wallT(a, vT);
    P.set(Math.cos(a) * r, y, Math.sin(a) * r);
    vH.copy(UP).multiplyScalar(Math.cos(psi)).addScaledVector(vT, Math.sin(psi));
    frame(q, vH, vN);
  };

  function layoutLife(time = st.time) {
    const d = st.day, n = Math.min(st.n, max), churn = ss(1.6, 4.2, d) * (1 - 0.3 * ss(8, 12, d));
    surface.morphTargetInfluences[0] = churn;
    paint(g, topMat, (m) => { m.color.copy(lc(C.food)).multiplyScalar(1 - 0.28 * churn); m.roughness = lerp(0.82, 0.4, churn); m.clearcoat = 0.5 * churn; });
    paint(g, tunnelMat, (m) => { m.opacity = 0.9 * ss(2.2, 4.5, d); });
    // yeast: eaten and buried as the larvae work
    const ny = Math.round(80 * (1 - ss(1.2, 3.4, d)));
    for (let i = 0; i < ny; i++) {
      const gr = grains[i];
      P.set(gr.x, surfY(gr.x, gr.z, churn) + gr.s * 0.4, gr.z);
      S.set(gr.s, gr.s * 0.7, gr.s);
      yeast.setMatrixAt(i, M.compose(P, gr.q, S));
    }
    yeast.count = ny; yeast.instanceMatrix.needsUpdate = true;
    let ne = 0, nl = 0, np = 0, nc = 0;
    for (let i = 0; i < n; i++) {
      const p = plan[i], eye = st.eyes[i] === 'white' ? EYE.white : EYE.red;
      if (d >= p.tl && d < p.th) {   // egg, half sunk in the food
        P.set(p.ex, surfY(p.ex, p.ez, churn) + 0.004, p.ez);
        Qt.setFromAxisAngle(UP, p.eyaw); S.setScalar(0.052);
        eggs.setMatrixAt(ne++, M.compose(P, Qt, S));
      } else if (d >= p.th && d < p.tw) {   // feeding larva: tail up at the surface breathing, or tunnelling at the wall
        const grow = Math.pow(clamp((d - p.th) / (4.5 - p.th)), 1.2), L = (0.07 + 0.37 * grow) * p.size;
        const wig = Math.sin(time * 2.2 + p.ph) * 0.25;
        if (p.wall && d > p.th + 1.2) {
          onWall(p.la + wig * 0.05, p.ly, p.lpsi + wig, RF - 0.014, Qt);
        } else {
          const a = p.lyaw + wig * 0.4, x = Math.cos(p.ph) * p.lr, z = Math.sin(p.ph) * p.lr;
          vH.set(Math.cos(a) * 0.8, -0.75 * p.ld, Math.sin(a) * 0.8).normalize();
          frame(Qt, vH, UP);
          P.set(x, surfY(x, z, churn), z).addScaledVector(vH, L * 0.3);
        }
        S.set(L * (1 + 0.05 * Math.sin(time * 5 + p.ph)), L, L);
        larvae.setMatrixAt(nl++, M.compose(P, Qt, S));
      } else if (d >= p.tw && d < p.tp) {   // wandering larva, climbing to its spot
        const s = smooth(clamp((d - p.tw) / (p.tp - p.tw - 0.08)));
        const L = 0.44 * p.size * (1 - 0.2 * ss(0.85, 1, s));
        const a = lerp(p.start, p.pa, s), y = lerp(FY + 0.15, p.py, s), wig = Math.sin(time * 3 + p.ph) * 0.2 * (1 - s);
        onWall(a, y, lerp(0, p.ppsi, s) + wig, RI - L * 0.12, Qt);
        S.set(L, L, L);
        larvae.setMatrixAt(nl++, M.compose(P, Qt, S));
      } else if (d >= p.tp) {   // pupa where it stopped; the case once the adult is out
        const L = 0.31 * p.size;
        onWall(p.pa, p.py, p.ppsi, RI - L * 0.17 * 0.78 - 0.004, Qt);
        S.setScalar(L);
        M.compose(P, Qt, S);
        if (d < p.te) {
          const age = d - p.tp;
          col.copy(cPre).lerp(cTan, ss(0, 0.5, age)).lerp(cDark, clamp((d - p.tp - 0.5) / (9 - p.tp - 0.5)));
          pupae.setMatrixAt(np, M); pupae.setColorAt(np, col);
          pEyes.setMatrixAt(np, M); pEyes.setColorAt(np, col.lerp(eye, ss(8, 8.8, d) * 0.9)); np++;
        } else cases.setMatrixAt(nc++, M);
      }
    }
    eggs.count = ne; larvae.count = nl; pupae.count = np; pEyes.count = np; cases.count = nc;
    [eggs, larvae, pupae, pEyes, cases].forEach((x) => { x.instanceMatrix.needsUpdate = true; if (x.instanceColor) x.instanceColor.needsUpdate = true; });
  }

  // adults: a home on the wall or the food, then waypoints from a hash of (fly, segment)
  const adults = [];
  const qA = new THREE.Quaternion(), qR = new THREE.Quaternion(), pA = V3(), pR = V3(), down = V3(), qW = new THREE.Quaternion(), sP = V3();
  function wayWall(a, k, out) {
    out.u = a.u0 + (hash(a.h, k, 1) - 0.5) * 2.4;
    out.y = clamp(a.y0 + (hash(a.h, k, 2) - 0.5) * 3, YLO, YHI);
    return out;
  }
  function wayFloor(a, k, out) {
    const ang = a.u0 + (hash(a.h, k, 1) - 0.5) * 2.2, r = (RF - 0.25) * Math.sqrt(hash(a.h, k, 2));
    out.u = Math.cos(ang) * r; out.y = Math.sin(ang) * r;
    return out;
  }
  const w0 = {}, w1 = {}, wPrev = {};
  /** Awake pose at time t into pA, qA. */
  function crawl(a, t) {
    const way = a.floor ? wayFloor : wayWall;
    const tt = t / a.D + a.ofs, k = Math.floor(tt), f = tt - k;
    way(a, k, w0); way(a, k + 1, w1); way(a, k - 1, wPrev);
    const du = w1.u - w0.u, dy = w1.y - w0.y, dist = Math.hypot(du, dy);
    const hop = hash(a.h, k, 3) < 0.14;
    const fw = Math.min(0.8, (hop ? 0.3 : dist / 0.3) / a.D);
    const s = f < fw ? smooth(f / fw) : 1;
    const head = Math.atan2(du, dy), headPrev = Math.atan2(w0.u - wPrev.u, w0.y - wPrev.y);
    let dh = head - headPrev; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    const psi = headPrev + dh * ss(0, Math.max(0.05, fw * 0.3), f);
    const u = lerp(w0.u, w1.u, s), y = lerp(w0.y, w1.y, s);
    const lift = hop && f < fw ? 0.35 * Math.sin(Math.PI * f / fw) : 0;
    if (a.floor) {
      vH.set(Math.sin(psi), 0, Math.cos(psi));
      frame(qA, vH, UP);
      pA.set(u, surfY(u, y, ss(1.6, 4.2, st.day) * (1 - 0.3 * ss(8, 12, st.day))) + 0.002 + lift, y);
    } else {
      const ang = u / RI;
      onWall(ang, y, psi, RI - 0.002 - lift, qA);
      pA.copy(P);
    }
  }
  /** Knocked-out pose into pR, qR: on the wall (or end) that faces world down. */
  function rest(a, dl) {
    const ax = Math.hypot(dl.x, dl.z);
    if (ax < 0.35) {   // near upright (or upside down): on the food, or on the plug
      const flip = dl.y > 0, r = (RF - 0.15) * Math.sqrt(a.rr), ang = a.ra * 6.283;
      const x = Math.cos(ang) * r, z = Math.sin(ang) * r;
      pR.set(x, flip ? PLUG_B : surfY(x, z, ss(1.6, 4.2, st.day)) + 0.002, z);
      vH.set(Math.cos(a.ryaw), 0, Math.sin(a.ryaw));
      frame(qR, vH, flip ? DOWN : UP);
    } else {
      const ang = Math.atan2(dl.z, dl.x) + (a.ra - 0.5) * 0.9;
      let y = lerp(YLO - 0.1, YHI, a.rr);
      if (Math.abs(dl.y) > 0.05) y = lerp(y, dl.y < 0 ? YLO - 0.1 : YHI, clamp(Math.abs(dl.y) * 1.3) * 0.8);
      onWall(ang, y, a.ryaw, RI - 0.002, qR);
      pR.copy(P);
    }
    toSide(pR, qR, a.sex);
  }
  function layoutFlies(time = st.time) {
    g.updateWorldMatrix(true, false);
    g.getWorldQuaternion(qW);
    down.set(0, -1, 0).applyQuaternion(qW.invert());
    flies.begin();
    for (const a of adults) {
      const e = ss(a.delay, a.delay + 0.4, st.asleep);
      if (e < 1) crawl(a, time);
      if (e > 0) rest(a, down);
      if (e <= 0) { sP.copy(pA); Qt.copy(qA); } else if (e >= 1) { sP.copy(pR); Qt.copy(qR); } else {
        sP.copy(pA).lerp(pR, e); Qt.copy(qA).slerp(qR, e);
      }
      flies.add(sP, Qt, a.sex, a.eye, e > 0.5);
    }
    flies.end();
  }

  const out = {
    group: g, R, H, RI, foodY: FY,
    anchors: { mouth: V3(0, H, 0), top: V3(0, PLUG_TOP, 0), floor: V3(0, FY, 0), center: V3(0, (FY + PLUG_B) / 2, 0) },
    plug: plugG, flies: flies.group,
    /** 0 seated, 1 pulled out and lifted clear of the rim. */
    setPlug(k) { st.plug = clamp(k); plugG.position.y = 3.2 * smooth(st.plug); },
    /** day since the parents went in; eyes: one 'red' | 'white' per offspring (count = eyes.length). */
    setLife({ day = st.day, eyes } = {}) {
      st.day = day;
      if (eyes) { st.eyes = eyes; st.n = eyes.length; }
      layoutLife();
      if (adults.some((a) => a.floor)) layoutFlies();
    },
    setAdults(list = []) {
      adults.length = 0;
      list.slice(0, maxAdults).forEach((f, i) => {
        const h = idNum(f.id, i) ^ (seed * 977), r = seeded(h >>> 0);
        const floor = r() < 0.18;
        adults.push({
          sex: f.sex === 'm' ? 'm' : 'f', eye: f.eye === 'white' ? 'white' : 'red', h, floor,
          u0: floor ? r() * 6.283 : r() * 6.283 * RI, y0: lerp(YLO + 0.5, YHI - 0.5, r()),
          D: 3 + r() * 4, ofs: r() * 10, delay: r() * 0.55, rr: r(), ra: r(), ryaw: r() * 6.283,
        });
      });
      layoutFlies();
    },
    /** 0 awake on the walls, 1 knocked out on whichever wall faces down in world space. */
    setAsleep(k) { st.asleep = clamp(k); layoutFlies(); },
    update(time) { st.time = time; layoutFlies(time); if (st.day > 1 && st.day < 5.6) layoutLife(time); },
  };
  out.setPlug(0);
  out.setLife({ day: 0, eyes: Array(60).fill('red') });
  return out;
}

/* ------------------------------------------------------------------ CO₂ pad */

function poreTex() {
  return texCache('fly:pores', () => {
    const S = 512, c = makeCanvas(S, S), x = c.getContext('2d'), R = seeded(17);
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) { x.fillStyle = `rgba(140,150,160,${0.05 + R() * 0.16})`; x.beginPath(); x.arc(R() * S, R() * S, 0.5 + R() * 1.3, 0, 7); x.fill(); }
    const t = canvasTex(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}
function hazeTex() {
  return texCache('fly:haze', () => {
    const S = 256, c = makeCanvas(S, S), x = c.getContext('2d'), R = seeded(5);
    x.clearRect(0, 0, S, S); x.filter = 'blur(6px)';
    for (let i = 0; i < 40; i++) { x.strokeStyle = `rgba(255,255,255,${0.2 + R() * 0.4})`; x.lineWidth = 4 + R() * 10; x.beginPath(); const y = R() * S; x.moveTo(0, y); x.bezierCurveTo(S * 0.3, y + (R() - 0.5) * 60, S * 0.7, y + (R() - 0.5) * 60, S, y); x.stroke(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  });
}

/** CO₂ fly pad: a porous polyethylene plate in a grey frame, 9.6 × 7.1 cm, with a hose barb at the
 *  back (−z). anchors.top is the centre of the pad's surface. setGas(k) shows a faint shimmer. */
export function makeFlyPad(mat) {
  const g = new THREE.Group();
  const W = 9.6, D = 7.1, FH = 1.0, PW = 9.0, PD = 6.5;
  const frameM = matCache(mat, 'fly:padFrame', () => mat.make.physical({ color: toLinear('#7b858e'), roughness: 0.5, clearcoat: 0.2 }));
  const sh = roundedRectShape(W, D, 0.55);
  sh.holes.push(roundedRectShape(PW + 0.16, PD + 0.16, 0.34));
  const fg = new THREE.ExtrudeGeometry(sh, { depth: FH - 0.12, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2, curveSegments: 10 });
  fg.rotateX(-Math.PI / 2); fg.translate(0, 0.075, 0);
  g.add(mesh(fg, frameM));
  const floorG = new THREE.ExtrudeGeometry(roundedRectShape(PW + 0.1, PD + 0.1, 0.3), { depth: 0.3, bevelEnabled: false });
  floorG.rotateX(-Math.PI / 2); floorG.translate(0, 0.015, 0);
  g.add(mesh(floorG, frameM));
  const TOP = FH - 0.06;
  const padM = matCache(mat, 'fly:padPE', () => mat.make.standard({ color: toLinear('#f6f7f5'), map: poreTex(), bumpMap: poreTex(), bumpScale: 0.8, roughness: 0.96 }));
  const pg = new THREE.ExtrudeGeometry(roundedRectShape(PW - 0.04, PD - 0.04, 0.28), { depth: TOP - 0.36, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 8 });
  pg.rotateX(-Math.PI / 2); pg.translate(0, 0.335, 0);
  const uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / 4, uv.getY(i) / 4);
  g.add(mesh(pg, padM, { cast: false }));
  // hose barb out of the back
  const barbM = matCache(mat, 'fly:barb', () => mat.make.standard({ color: toLinear('#c9ced3'), roughness: 0.35, metalness: 0.6 }));
  const barb = new THREE.Group();
  barb.add(mesh(lathe([[0.001, 0], [0.32, 0], [0.32, 0.35], [0.2, 0.4], [0.2, 0.55], [0.26, 0.72], [0.17, 0.75], [0.17, 0.9], [0.24, 1.08], [0.15, 1.1], [0.12, 1.4], [0.001, 1.4]], 20), barbM));
  barb.rotation.x = -Math.PI / 2; barb.position.set(0, 0.5, -D / 2 - 0.02);
  g.add(barb);
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(PW - 0.3, PD - 0.3), new THREE.MeshBasicMaterial({ map: hazeTex(), color: 0xe6f2ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  haze.rotation.x = -Math.PI / 2; haze.position.y = TOP + 0.12; haze.renderOrder = 5;
  haze.userData.noSketch = true; haze.userData.noHL = true; haze.visible = false;
  haze.onBeforeRender = () => { const t = performance.now() / 1000; haze.material.map.offset.set(t * 0.04, Math.sin(t * 0.7) * 0.03); };
  g.add(haze);
  return {
    group: g, w: W, d: D,
    anchors: { top: V3(0, TOP, 0), barb: V3(0, 0.5, -D / 2 - 1.42) },
    /** 0 off, 1 flowing. */
    setGas(k) { haze.visible = k > 0.01; haze.material.opacity = 0.06 * clamp(k); },
  };
}

/* ------------------------------------------------------------------ CO₂ blowgun */

/** CO₂ blowgun: a pistol grip with a trigger, the hose at the butt, a long blunt 18 G needle. Origin
 *  at the needle tip; the needle points +x, the grip hangs toward −y. setTrigger(0..1) squeezes it. */
export function makeCO2Gun(mat) {
  const g = new THREE.Group();
  const body = matCache(mat, 'fly:gunBody', () => mat.make.physical({ color: toLinear('#3d4650'), roughness: 0.45, clearcoat: 0.3 }));
  const accent = matCache(mat, 'fly:gunAccent', () => mat.make.standard({ color: toLinear('#4f7b9e'), roughness: 0.5 }));
  const rubber = matCache(mat, 'fly:gunGrip', () => mat.make.standard({ color: toLinear('#262c33'), roughness: 0.85 }));
  const hub = matCache(mat, 'fly:hub', () => mat.make.physical({ color: toLinear('#e9799a'), roughness: 0.3, transparent: true, opacity: 0.85, clearcoat: 0.8 }));
  const along = (geo) => { geo.rotateZ(-Math.PI / 2); return geo; };   // a lathe on +y laid along +x
  // needle, hub, brass nozzle
  g.add(mesh(along(lathe([[0.001, -6], [0.06, -6], [0.06, -0.02], [0.05, 0], [0.001, 0]], 12)), mat.steel));
  const hubM = mesh(along(lathe([[0.001, -7.1], [0.42, -7.1], [0.42, -6.8], [0.3, -6.7], [0.22, -6.2], [0.12, -5.8], [0.07, -5.6], [0.001, -5.6]], 20)), hub);
  g.add(hubM);
  g.add(mesh(along(lathe([[0.001, -8.6], [0.55, -8.6], [0.6, -8.4], [0.6, -8.0], [0.45, -7.9], [0.38, -7.1], [0.001, -7.1]], 24)), mat.chrome));
  // barrel, round with a domed back, and a slate collar behind the nozzle
  g.add(mesh(along(lathe([[0.001, -15.95], [0.5, -15.9], [0.82, -15.65], [0.95, -15.2], [0.95, -9.6], [0.82, -9.05], [0.62, -8.75], [0.6, -8.6], [0.001, -8.6]], 32)), body));
  g.add(mesh(along(lathe([[0.001, -9.2], [0.9, -9.2], [0.92, -9.0], [0.92, -8.85], [0.001, -8.85]], 32)), accent));
  // grip, raked back, with a finger groove and a palm swell
  const gp = [[-15.2, -0.3], [-12.6, -0.3], [-12.75, -1.6], [-12.95, -2.6], [-13.2, -3.35], [-13.15, -4.3], [-13.4, -5.2], [-13.55, -6.2], [-13.7, -7.3], [-14.0, -7.95], [-15.2, -8.05], [-15.7, -7.4], [-15.85, -5.0], [-15.7, -2.6], [-15.45, -1.0]];
  const gs = new THREE.Shape(); gs.moveTo(...gp[0]);
  gs.splineThru(gp.slice(1).map(([x, y]) => new THREE.Vector2(x, y))); gs.closePath();
  const gg = new THREE.ExtrudeGeometry(gs, { depth: 1.6, bevelEnabled: true, bevelSize: 0.35, bevelThickness: 0.35, bevelSegments: 4, curveSegments: 40 });
  gg.translate(0, 0, -0.8);
  g.add(mesh(gg, body));
  for (const s of [1, -1]) {   // grip panels
    const q = new THREE.Shape(); q.moveTo(-15.2, -1.6); q.lineTo(-13.45, -1.6); q.quadraticCurveTo(-13.7, -4.5, -14.0, -6.9); q.lineTo(-15.35, -6.9); q.quadraticCurveTo(-15.5, -4.2, -15.2, -1.6);
    const pan = new THREE.ExtrudeGeometry(q, { depth: 0.08, bevelEnabled: true, bevelSize: 0.1, bevelThickness: 0.05, bevelSegments: 2, curveSegments: 16 });
    pan.translate(0, 0, s > 0 ? 1.08 : -1.16);
    g.add(mesh(pan, rubber));
  }
  // trigger guard and trigger
  g.add(mesh(new THREE.TubeGeometry(curve([[-11.3, -0.7, 0], [-10.8, -1.6, 0], [-10.95, -2.6, 0], [-11.9, -3.05, 0], [-13.05, -2.95, 0]]), 24, 0.15, 8), body));
  const trig = new THREE.Group();
  trig.position.set(-12.2, -0.75, 0);
  const ts = new THREE.Shape(); ts.moveTo(-0.2, 0); ts.quadraticCurveTo(0.6, -0.9, 0.42, -1.9); ts.lineTo(0.08, -1.9); ts.quadraticCurveTo(0.1, -0.9, -0.5, 0); ts.closePath();
  const tg = new THREE.ExtrudeGeometry(ts, { depth: 0.44, bevelEnabled: true, bevelSize: 0.07, bevelThickness: 0.07, bevelSegments: 2 });
  tg.translate(0, 0, -0.22);
  trig.add(mesh(tg, accent));
  g.add(trig);
  // hose barb and a stub of hose from the butt
  const barb = mesh(lathe([[0.001, 0], [0.32, 0], [0.32, 0.4], [0.2, 0.45], [0.26, 0.7], [0.17, 0.72], [0.24, 1.0], [0.14, 1.02], [0.12, 1.3], [0.001, 1.3]], 16), mat.chrome);
  barb.rotation.z = Math.PI + 0.12; barb.position.set(-14.6, -8.3, 0);
  g.add(barb);
  const hose = matCache(mat, 'fly:hose', () => mat.make.physical({ color: toLinear('#dfe7ea'), roughness: 0.3, transparent: true, opacity: 0.8, clearcoat: 0.6, depthWrite: false }));
  const hm = mesh(new THREE.TubeGeometry(curve([[-14.7, -8.9, 0], [-14.8, -10.4, 0], [-15.55, -11.7, 0.6], [-17.4, -12.1, 1.3], [-19.6, -11.9, 1.7]]), 32, 0.32, 12), hose, { cast: false });
  hm.renderOrder = 3;
  g.add(hm);
  return {
    group: g,
    anchors: { tip: V3(0, 0, 0), grip: V3(-14.5, -4.2, 0) },
    /** 0 released, 1 squeezed. */
    setTrigger(k) { trig.rotation.z = -0.3 * clamp(k); trig.position.x = -12.2 - 0.2 * clamp(k); },
  };
}

/* ------------------------------------------------------------------ stereo microscope */

/** Stereo (dissecting) microscope, about 38 cm to the eyepieces, in the compound microscope's
 *  colours: teal base with a white stage plate, chrome pillar, a focus block, a pale zoom body with
 *  knobs both sides, two eyepieces at 45°, and an LED ring light round the objective. Faces +z.
 *  anchors.stage is where the pad sits (10 cm of working distance above it); anchors.eyepiece the
 *  eyepoint, with anchors.eyeAxis pointing out of it. setLight(k) lights the ring. */
export function makeStereoScope(mat) {
  const g = new THREE.Group();
  const std = (hex, roughness, o = {}) => mat.make.standard(Object.assign({ color: toLinear(hex), roughness }, o));
  const SM = kit(mat, 'fly:scopeMats', () => ({
    body: std('#82bdb3', 0.62),
    slate: std('#4f7b9e', 0.5),
    slateFacet: std('#4f7b9e', 0.5, { flatShading: true }),
    slateDark: std('#3a5d7a', 0.55),
    head: std('#d9dfe5', 0.5),
    panel: std('#e6eaee', 0.4, { metalness: 0.1 }),
    knurl: std('#d0d4da', 0.28, { metalness: 0.9, flatShading: true }),
    black: std('#16191e', 0.55),
    rubber: std('#22262c', 0.8),
    plate: std('#f4f5f3', 0.6),
    lens: mat.make.physical({ color: toLinear('#16202e'), roughness: 0.04, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.02 }),
  }));
  const put = (geo, m, parent, pos, o) => { const x = mesh(geo, m, o); if (pos) x.position.set(...pos); parent.add(x); return x; };
  const turn = (pts, m, parent, seg = 40) => put(lathe(pts[0][1] > pts[pts.length - 1][1] ? pts.slice().reverse() : pts, seg), m, parent);
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
  const knob = (r, h, seg, m, parent, y0 = 0) => { const c = Math.min(h * 0.25, r * 0.15); return turn([[0, y0], [r - c, y0], [r, y0 + c], [r, y0 + h - c], [r - c, y0 + h], [0, y0 + h]], m, parent, seg); };
  const sideAxis = (pos, sx, parent = g) => { const a = new THREE.Group(); a.position.set(...pos); a.rotation.z = -sx * Math.PI / 2; parent.add(a); return a; };
  /** Side profile [z, y] extruded across x, chamfered; the bevel grows it outward. */
  function side(pts, width, m, bevel = 0.3, parent = g) {
    const sh = new THREE.Shape(); sh.moveTo(...pts[0]); pts.slice(1).forEach((p) => sh.lineTo(...p)); sh.closePath();
    const depth = width - bevel * 2;
    const geo = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1 });
    geo.translate(0, 0, -depth / 2); geo.rotateY(-Math.PI / 2); geo.computeVertexNormals();
    return put(geo, m, parent);
  }
  function bandTex(text) {
    return texCache('fly:band:' + text, () => {
      const c = makeCanvas(512, 64), x = c.getContext('2d');
      x.fillStyle = '#e9ebee'; x.fillRect(0, 0, 512, 64);
      x.fillStyle = '#2a2e35'; x.font = `600 34px ${FONT}`; x.textBaseline = 'middle'; x.textAlign = 'center';
      text.split(' ').forEach((w, i, a) => x.fillText(w, (i + 0.5) * 512 / a.length, 34));
      return canvasTex(c);
    });
  }

  const AX = 2.5, BASE_TOP = 4.3, PIL_Z = -8.8;
  // base: slate plinth, chamfered teal housing, pale front panel with switch and dimmer
  put(rbox(19, 0.8, 25, 0.35), SM.slateDark, g, [0, 0.015, 0]);
  side([[-12, 0.6], [12, 0.6], [12, 2.4], [10.2, BASE_TOP - 0.3], [-12, BASE_TOP - 0.3]], 18.4, SM.body, 0.3);
  side([[11.9, 0.9], [12.34, 0.9], [12.34, 2.3], [11.9, 2.3]], 7, SM.panel, 0.05);
  put(new THREE.BoxGeometry(1.1, 0.7, 0.3), SM.slateDark, g, [-2, 1.7, 12.35]);
  put(new THREE.BoxGeometry(0.6, 0.35, 0.2), SM.black, g, [-2, 1.82, 12.5]).rotation.x = -0.25;
  knob(0.9, 0.5, 14, SM.slateFacet, sideAxis([9.5, 2.1, 3], 1));
  // stage plate, recessed in a steel ring; two stage clips swung out to the sides
  put(new THREE.CylinderGeometry(5.0, 5.0, 0.12, 64), SM.plate, g, [0, BASE_TOP - 0.03, AX]);
  put(new THREE.TorusGeometry(5.05, 0.08, 8, 64), mat.chrome, g, [0, BASE_TOP, AX]).rotation.x = Math.PI / 2;
  for (const s of [1, -1]) {
    const clip = new THREE.Group(); clip.position.set(s * 7.2, BASE_TOP, AX - 2); clip.rotation.y = s * 0.5; g.add(clip);
    put(new THREE.CylinderGeometry(0.35, 0.4, 0.5, 16), mat.chrome, clip, [0, 0.25, 0]);
    put(new THREE.BoxGeometry(0.6, 0.06, 3.2), mat.steel, clip, [0, 0.45, 1.4]).rotation.x = 0.05;
  }
  // pillar
  turn([[0, BASE_TOP - 0.1], [2.1, BASE_TOP - 0.1], [2.1, BASE_TOP + 0.5], [1.7, BASE_TOP + 0.9], [0, BASE_TOP + 0.9]], SM.slate, g).position.z = PIL_Z;
  put(new THREE.CylinderGeometry(1.35, 1.35, 30 - BASE_TOP, 40), mat.chrome, g, [0, (30 + BASE_TOP) / 2, PIL_Z]);
  turn([[0, 30], [1.45, 30], [1.45, 30.5], [1.2, 30.8], [0, 30.8]], SM.slateDark, g).position.z = PIL_Z;
  // focus block on the pillar; its arm ends in the ring the zoom body sits in
  const RY0 = 16.2, RY1 = 18.2, HB = RY1 + 0.05, HT = 25.2;
  side([[PIL_Z - 2.2, RY0 - 0.8], [PIL_Z + 2.4, RY0 - 0.8], [AX - 4.0, RY0], [AX - 4.0, RY1], [PIL_Z + 1.6, RY1 + 2.4], [PIL_Z - 2.2, RY1 + 2.4]], 5.2, SM.body, 0.3);
  turn([[3.15, RY0], [4.3, RY0], [4.45, RY0 + 0.15], [4.45, RY1 - 0.15], [4.3, RY1], [3.15, RY1]], SM.body, g, 56).position.z = AX;
  const FKY = (RY0 + RY1) / 2 + 0.6;
  for (const sx of [1, -1]) {
    const kn = sideAxis([sx * 2.6, FKY, PIL_Z + 0.4], sx);
    turn([[0, 0], [1.0, 0], [1.0, 0.5], [0, 0.5]], SM.slateDark, kn, 24);
    knob(2.1, 0.9, 18, SM.slateFacet, kn, 0.4);
    knurl(2.12, 0.4, 36, 0.05, SM.knurl, kn, 0.85);
    put(new THREE.CylinderGeometry(0.7, 0.7, 0.08, 20), SM.head, kn, [0, 1.36, 0]);
  }
  const lock = new THREE.Group(); lock.position.set(0, FKY + 1.2, PIL_Z - 2.5); lock.rotation.x = -Math.PI / 2; g.add(lock);
  put(new THREE.CylinderGeometry(0.2, 0.2, 0.7, 10), mat.chrome, lock, [0, 0.35, 0]);
  knob(0.65, 0.5, 10, SM.slateFacet, lock, 0.7);
  // zoom body on the ring, zoom knobs both sides with their magnification band
  put(rbox(8.6, HT - HB, 8.2, 1.5), SM.head, g, [0, HB, AX]);
  for (const sx of [1, -1]) {
    const kn = sideAxis([sx * 4.3, 21.6, AX], sx);
    turn([[0, 0], [1.3, 0], [1.3, 0.3], [0, 0.3]], SM.slateDark, kn, 24);
    put(new THREE.CylinderGeometry(2.35, 2.35, 0.7, 48, 1, true), mat.make.standard({ map: bandTex('0.7 1 2 3 4.5'), roughness: 0.4 }), kn, [0, 0.65, 0]);
    knurl(2.4, 0.9, 40, 0.05, SM.knurl, kn, 1.45);
    knob(2.1, 0.35, 20, SM.slateFacet, kn, 1.9);
  }
  // objective barrel down through the ring, then the LED ring light
  const LENS_Y = HB - 4.0;
  turn([[2.6, HB + 0.05], [3.1, HB + 0.05], [3.1, HB - 3.6], [2.9, HB - 3.9], [1.4, LENS_Y], [1.4, LENS_Y + 0.1], [0, LENS_Y + 0.1]], SM.slate, g).position.z = AX;
  put(new THREE.SphereGeometry(1.6, 28, 6, 0, Math.PI * 2, Math.PI * 0.82, Math.PI * 0.18), SM.lens, g, [0, LENS_Y + 1.5, AX], { cast: false });
  const RL0 = LENS_Y - 1.2;
  turn([[3.2, LENS_Y + 0.6], [4.6, LENS_Y + 0.6], [4.9, LENS_Y + 0.3], [4.9, RL0 + 0.2], [4.7, RL0], [3.4, RL0], [3.2, RL0 + 0.15]], SM.black, g, 56).position.z = AX;
  const ledMat = live(mat.make.standard({ color: toLinear('#d9dde2'), emissive: new THREE.Color(0xfff4dc), emissiveIntensity: 0, roughness: 0.2 }));
  const leds = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 10, 6), ledMat, 18);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; leds.setMatrixAt(i, new THREE.Matrix4().makeTranslation(Math.cos(a) * 4.05, RL0 - 0.02, AX + Math.sin(a) * 4.05)); }
  g.add(leds);
  const cord = new THREE.CatmullRomCurve3([V3(4.5, LENS_Y - 0.4, AX - 2.6), V3(5.0, LENS_Y - 1.2, AX - 5.5), V3(3.4, LENS_Y - 2.6, PIL_Z + 1.2), V3(2.0, 9.5, PIL_Z - 0.9), V3(2.2, 6, PIL_Z - 1.6), V3(2.8, BASE_TOP + 0.2, PIL_Z - 2.8)]);
  put(new THREE.TubeGeometry(cord, 48, 0.16, 8), SM.black, g);
  // binocular head: a wedge on the body whose top is square to the eyepieces, which rise at 45° toward the user
  const TILT = Math.PI / 4, EYE_LEN = 7.5, PIV = V3(0, HT + 1.8, AX + 1.6);
  const eyeAxis = V3(0, Math.cos(TILT), Math.sin(TILT));
  const qz = AX + 1.6 + 0.6 * eyeAxis.z, qy = HT + 1.8 + 0.6 * eyeAxis.y, ex = Math.cos(TILT) * 2.3, ey = Math.sin(TILT) * 2.3;
  side([[AX - 3.4, HT - 0.4], [AX + 3.3, HT - 0.4], [qz + ex, qy - ey], [qz - ex, qy + ey], [AX - 2.2, HT + 3.1], [AX - 3.4, HT + 1.6]], 6.4, SM.head, 0.3);
  for (const sx of [1, -1]) {
    const ep = new THREE.Group();
    ep.position.set(PIV.x + sx * 1.85, PIV.y, PIV.z);
    ep.rotation.set(TILT, 0, -sx * 0.06);
    g.add(ep);
    put(new THREE.CylinderGeometry(1.15, 1.35, 2.2, 32), SM.head, ep, [0, 0.6, 0]);
    put(new THREE.CylinderGeometry(1.05, 1.05, EYE_LEN - 3.2, 32), SM.slate, ep, [0, (EYE_LEN - 3.2) / 2 + 1.6, 0]);
    knurl(1.18, 0.6, 30, 0.06, SM.knurl, ep, EYE_LEN - 2.4);
    turn([[1.0, EYE_LEN - 2.1], [1.35, EYE_LEN - 2.0], [1.55, EYE_LEN - 0.6], [1.6, EYE_LEN], [1.3, EYE_LEN], [1.2, EYE_LEN - 0.5], [0.95, EYE_LEN - 0.6]], SM.rubber, ep, 32);
    put(new THREE.CircleGeometry(0.95, 28), SM.lens, ep, [0, EYE_LEN - 0.58, 0], { cast: false }).rotation.x = -Math.PI / 2;
  }
  // light: a soft cone to the stage, and a spot that lights the pad
  const coneMat = new THREE.MeshBasicMaterial({ color: 0xfff6e2, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cone = put(new THREE.CylinderGeometry(4.0, 5.6, RL0 - BASE_TOP - 0.2, 48, 1, true), coneMat, g, [0, (RL0 + BASE_TOP + 0.2) / 2, AX], { cast: false, receive: false });
  cone.userData.noSketch = true; cone.userData.noHL = true; cone.visible = false;
  const spot = new THREE.SpotLight(0xfff4e0, 0, 20, 0.5, 0.7, DECAY);
  spot.position.set(0, RL0, AX); spot.target.position.set(0, BASE_TOP, AX);
  g.add(spot, spot.target);
  const eyeTop = V3(0, PIV.y, PIV.z).addScaledVector(eyeAxis, EYE_LEN);
  return {
    group: g,
    anchors: { stage: V3(0, BASE_TOP + 0.035, AX), lens: V3(0, RL0, AX), eyepiece: eyeTop, eyeAxis, top: V3(0, eyeTop.y, 0) },
    /** 0 off, 1 the ring light full. */
    setLight(k) {
      k = clamp(k);
      paint(g, ledMat, (m) => { m.emissiveIntensity = 2.2 * k; });
      cone.visible = k > 0.01; coneMat.opacity = 0.035 * k;
      spot.intensity = 1.4 * LIGHT * k;
    },
  };
}

/* ------------------------------------------------------------------ morgue */

/** Squat glass jar of mineral oil with a tape label: where sorted flies go. Origin at the centre of
 *  the base. liquid is the oil; setDead(n) sinks n flies to the bottom. */
export function makeMorgue(mat, { label = 'Morgue', sub, color = '#475569', seed = 3 } = {}) {
  const g = new THREE.Group();
  const R = 3.1, H = 6.2, t = 0.18, BOT = 0.3;
  const shell = mesh(lathe([
    [0.001, 0.015], [R - 0.35, 0.015], [R - 0.06, 0.1], [R, 0.4], [R, H - 1.2], [R - 0.2, H - 0.75], [R - 0.55, H - 0.6], [R - 0.55, H - 0.06], [R - 0.6, H], [R - 0.55 - t, H], [R - 0.55 - t, H - 0.6], [R - t - 0.2, H - 0.85], [R - t, H - 1.25], [R - t, BOT + 0.25], [R - t - 0.25, BOT], [0.001, BOT],
  ], 64), mat.wideGlass, { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  for (let i = 0; i < 2; i++) {   // screw thread
    const th = mesh(new THREE.TorusGeometry(R - 0.535, 0.035, 6, 64), mat.glassEdge, { cast: false });
    th.rotation.x = Math.PI / 2; th.position.y = H - 0.42 + i * 0.22; th.renderOrder = 4;
    g.add(th);
  }
  const lipR = mesh(new THREE.TorusGeometry(R - 0.64, 0.06, 6, 64), mat.glassEdge, { cast: false });
  lipR.rotation.x = Math.PI / 2; lipR.position.y = H - 0.03; lipR.renderOrder = 4;
  g.add(lipR);
  g.add(wrapLabel({ rTop: R + 0.012, rBot: R + 0.012, y0: 1.6, y1: 3.4, arc: 1.7, center: 0, order: 6,
    draw: (c, w, hh) => tapeLabel(c, w, hh, label, sub, color) }));
  const liquid = makeLiquid(mat, g, { wall: [[R - t, BOT], [R - t, H - 1.25], [R - t - 0.2, H - 0.85], [R - 0.55 - t, H - 0.6], [R - 0.55 - t, H]], inset: 0.04, color: toLinear('#e6d18a'), opacity: 0.12, matOpts: { roughness: 0.03, envMapIntensity: 0.5 } });
  liquid.setLevel(3.9);
  const swarm = makeFlySwarm(mat, 60);
  g.add(swarm.group);
  const r = seeded(seed), spots = [...Array(60)].map(() => { const a = r() * 6.283, d = Math.sqrt(r()) * (R - t - 0.5); return { p: V3(Math.cos(a) * d, BOT + 0.004, Math.sin(a) * d), q: new THREE.Quaternion().setFromAxisAngle(V3(0, 1, 0), r() * 6.283), sex: r() < 0.5 ? 'f' : 'm', eye: r() < 0.25 ? 'white' : 'red' }; });
  return {
    group: g, liquid, anchors: { top: V3(0, H, 0), floor: V3(0, BOT, 0) },
    setDead(n) {
      swarm.count = 0;
      spots.slice(0, Math.max(0, Math.round(n))).forEach((s, i) => swarm.set(i, s.p, s.q, { sex: s.sex, eye: s.eye }));
      swarm.commit();
    },
  };
}
