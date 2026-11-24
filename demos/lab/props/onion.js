/* An onion bulb that has sprouted roots over water (from OnionRoot). Origin at the centre of
 * the basal plate, where the roots leave the bulb; the roots hang below y = 0, so the bulb
 * sits on a beaker's rim with its roots in the water.
 *
 *   const onion = makeOnion(mat);
 *   onion.tip               // the last ~5 mm of one root, a Group of its own: cut it free with
 *                           // scene.attach(onion.tip)
 *   onion.anchors.cut       // where the scalpel cuts (local)
 *   onion.setTip(color, k)  // tint the tip toward a colour: the acid clears it, the stain darkens it
 */
import * as THREE from 'three';
import { V2, V3 } from '../core/math.js';
import { mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { seeded } from '../core/random.js';
import { toLinear } from '../materials.js';

const S = 6.2;   // the original was drawn at 1 unit = 16 cm of bulb; this is its scale in cm

function skinTexture(seed) {
  const c = makeCanvas(512, 512), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  [[0, '#5a3314'], [0.18, '#94551f'], [0.55, '#bd7934'], [0.9, '#a8692c'], [1, '#7d4d22']].forEach(([k, col]) => grd.addColorStop(k, col));
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const R = seeded(seed);
  for (let i = 0; i < 160; i++) {
    const x = R() * 512;
    g.strokeStyle = R() < 0.7 ? `rgba(110,62,24,${0.12 + R() * 0.25})` : `rgba(255,232,190,${0.1 + R() * 0.2})`;
    g.lineWidth = 0.8 + R() * 2.4;
    g.beginPath(); g.moveTo(x, 0);
    for (let y = 0; y <= 512; y += 32) g.lineTo(x + Math.sin(y * 0.01 + i) * 6, y);
    g.stroke();
  }
  const t = canvasTex(c);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function makeOnion(mat, { seed = 11, roots: N = 19 } = {}) {
  const g = new THREE.Group();
  const prof = new THREE.SplineCurve([[0, 0], [0.17, 0], [0.32, 0.04], [0.45, 0.14], [0.53, 0.3], [0.555, 0.46], [0.52, 0.63], [0.44, 0.79],
    [0.3, 0.93], [0.16, 1.04], [0.08, 1.13], [0.045, 1.25], [0.02, 1.33], [0, 1.35]].map(([x, y]) => V2(x * S, y * S))).getPoints(60);
  prof[0].x = 0; prof[prof.length - 1].x = 0;
  const bulb = mesh(new THREE.LatheGeometry(prof, 72), mat.make.physical({ map: skinTexture(3), roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.5 }));
  g.add(bulb);
  const plate = mesh(new THREE.CylinderGeometry(0.16 * S, 0.2 * S, 0.05 * S, 32), mat.make.solid(toLinear('#a98458'), 0.8));
  g.add(plate);
  const tuft = mesh(new THREE.ConeGeometry(0.03 * S, 0.18 * S, 12), mat.make.solid(toLinear('#8a5a2e'), 0.9));
  tuft.position.set(0.01 * S, 1.42 * S, 0); tuft.rotation.z = -0.12;
  g.add(tuft);

  const rootMat = mat.make.solid(toLinear('#f3ecd6'), 0.42);
  const capMat = mat.make.solid(toLinear('#eee0b4'), 0.42);
  const R = seeded(seed);
  let tip = null, cut = null, tipSide = null, tipEnd = null;
  for (let i = 0; i < N; i++) {
    let a = (i / N) * Math.PI * 2 + R() * 0.25, rr = 0.04 + R() * 0.11, len = 0.56 + R() * 0.22;
    if (i === 0) { a = Math.PI / 2 - 0.05; rr = 0.12; len = 0.74; }   // the root we cut faces the viewer
    const sx = Math.cos(a) * rr, sz = Math.sin(a) * rr, out = 0.1 + R() * 0.14;
    const pts = [];
    for (let k = 0; k <= 7; k++) {
      const t = k / 7, spread = out * t * (1.25 - t * 0.45);
      pts.push(V3(sx + Math.cos(a) * spread + Math.sin(t * 5 + i) * 0.014 * t, -0.02 - len * t,
        sz + Math.sin(a) * spread + Math.cos(t * 4 + i * 1.7) * 0.014 * t).multiplyScalar(S));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const radius = (0.0155 + R() * 0.004) * S;
    if (i === 0) {
      const U = 0.88;
      const sub = new THREE.CatmullRomCurve3(Array.from({ length: 14 }, (_, k) => curve.getPointAt((k / 13) * U)));
      g.add(mesh(new THREE.TubeGeometry(sub, 48, radius, 10), rootMat));
      const pA = curve.getPointAt(U), pB = curve.getPointAt(1);
      const stub = mesh(new THREE.SphereGeometry(radius, 12, 8), rootMat);
      stub.position.copy(pA); g.add(stub);
      const L = pA.distanceTo(pB);
      tipSide = mat.make.solid(toLinear('#f3ecd6'), 0.42, { transparent: true });
      tipEnd = mat.make.solid(toLinear('#eee0b4'), 0.42, { transparent: true });
      tip = new THREE.Group();
      tip.add(mesh(new THREE.CylinderGeometry(radius, radius * 0.95, L, 12), tipSide));
      const end = mesh(new THREE.SphereGeometry(radius * 0.95, 14, 10), tipEnd);
      end.position.y = -L / 2; end.scale.y = 1.4;
      tip.add(end);
      tip.position.copy(pA).add(pB).multiplyScalar(0.5);
      tip.quaternion.setFromUnitVectors(V3(0, 1, 0), pA.clone().sub(pB).normalize());
      tip.userData.length = L + radius * 0.95 * 1.4;
      g.add(tip);
      cut = pA.clone();
    } else {
      g.add(mesh(new THREE.TubeGeometry(curve, 40, radius, 8), rootMat));
      const cap = mesh(new THREE.SphereGeometry(radius, 10, 8), capMat);
      cap.position.copy(curve.getPointAt(1)); cap.scale.y = 1.3;
      g.add(cap);
    }
  }
  const side0 = tipSide.color.clone(), end0 = tipEnd.color.clone();
  const tmp = new THREE.Color();
  return {
    group: g, bulb, tip,
    anchors: { cut, top: V3(0, 1.35 * S, 0), floor: V3(0, 0, 0) },
    radius: 0.555 * S,
    /** Tint the tip: k of the way from its own colour to `color` (the end, the meristem, goes
     *  all the way; the side, older cells, three quarters). opacity eases toward `alpha`. */
    setTip(color, k, alpha = 1) {
      tmp.set(color);
      tipSide.color.copy(side0).lerp(tmp, k * 0.75);
      tipEnd.color.copy(end0).lerp(tmp, k);
      tipSide.opacity = tipEnd.opacity = 1 - (1 - alpha) * k;
    },
    /** Make the current tint the tip's own colour, so the next setTip starts from here. */
    holdTip() { side0.copy(tipSide.color); end0.copy(tipEnd.color); },
  };
}
