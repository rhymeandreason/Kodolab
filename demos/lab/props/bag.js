/* Two soft bags: a zip-top bag (Strawberry) and an IV fluid bag (Calf).
 *
 * Zip-top bag lying flat, with a liquid inside and foam on top. From the
 * Strawberry lab.
 *
 *   const bag = makeZipBag(mat, { liquidColor: 0xc8284a });
 *   bag.setPuff(1.8);          // how full the bag looks: height scale of the pillow (0.35 flat … 3)
 *   bag.liquid.setFraction(0.6); // liquid amount, 0..1 of the puffed height (core/liquid.js)
 *   bag.liquid.setPour(k);     // while you tilt it to pour from anchors.spout
 *   bag.setFoam(0.8);          // bubbles on the liquid, 0..1
 *
 * Origin: centre of the bag's underside. It lies in the xz plane, w along x,
 * d along z; the zip and the opening are on the -z edge (anchors.spout).
 */
import * as THREE from 'three';
import { V3 } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh, roundedRectShape } from '../core/geometry.js';
import { makeLiquid } from '../core/liquid.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';

function pillow(W, D, sx = 40, sz = 44) {
  const g = new THREE.BoxGeometry(W, 1, D, sx, 2, sz);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setY(i, 0.02 + (y + 0.5) * pillowH(x, z, W, D)); // lifted off the surface below, or the underside z-fights with it
  }
  g.computeVertexNormals();
  return g;
}
/** Height of a unit pillow at (x, z): 1 in the middle, 0 at the seams. */
export const pillowH = (x, z, W, D) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs((2 * x) / W), 5))) * Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs((2 * z) / D), 5)));

export function makeZipBag(mat, { w = 12, d = 14, liquidColor = 0xc8284a, foamCount = 30, seed = 3 } = {}) {
  const g = new THREE.Group();
  // milky polythene: face-on it still reads (clear glass would vanish from above)
  const shell = mesh(pillow(w, d), mat.make.physical({
    color: 0xdbe7f5, roughness: 0.22, transparent: true, opacity: 0.34, clearcoat: 1, clearcoatRoughness: 0.15,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3,
  }), { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  const sealShape = roundedRectShape(w + 0.9, d + 0.9, 0.6);
  sealShape.holes.push(roundedRectShape(w - 0.3, d - 0.3, 0.3));
  const sealGeo = new THREE.ShapeGeometry(sealShape, 6);
  sealGeo.rotateX(-Math.PI / 2);
  const seal = mesh(sealGeo, mat.make.standard({ color: 0xe9eff7, transparent: true, opacity: 0.85, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
  seal.position.y = 0.03; seal.renderOrder = 3;
  g.add(seal);
  const zipA = mesh(new THREE.BoxGeometry(w - 0.2, 0.16, 0.22), mat.make.standard({ color: 0x3d7cf2, roughness: 0.4 }));
  zipA.position.set(0, 0.1, -d / 2 - 0.05);
  const zipB = mesh(new THREE.BoxGeometry(w - 0.2, 0.16, 0.22), mat.make.standard({ color: 0x2a5bc4, roughness: 0.4 }));
  zipB.position.set(0, 0.1, -d / 2 + 0.22);
  const zipTab = mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), mat.white);
  zipTab.position.set(w / 2 - 1.2, 0.18, -d / 2 + 0.08);
  g.add(zipA, zipB, zipTab);

  // contents: a smaller pillow, clipped at the liquid surface. Its height (max) follows the puff.
  const lw = w * 0.9, ld = d * 0.86;
  const spout = V3(0, 0.3, -d / 2 + 0.2);
  const liquid = makeLiquid(mat, g, {
    geometry: pillow(lw, ld, 30, 34), floor: 0.02, max: 0.5 * 0.86 * 0.95,
    lip: spout, head: 6.5, color: liquidColor, opacity: 0.82, matOpts: { roughness: 0.1, clearcoat: 0.7 },
  });
  liquid.mesh.position.y = 0.04;

  const R = seeded(seed);
  const foam = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    mat.make.physical({ color: 0xffffff, roughness: 0.15, transparent: true, opacity: 0.85, clearcoat: 1 }), foamCount);
  foam.frustumCulled = false; foam.renderOrder = 2; foam.visible = false; foam.userData.noHL = true;
  const foamData = Array.from({ length: foamCount }, () => ({ x: (R() - 0.5) * 7, z: (R() - 0.5) * 8, s: 0.12 + R() * 0.22 }));
  g.add(foam);

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), s = V3();
  const api = {
    group: g, shell, liquid, foam, w, d, puff: 0.5,
    anchors: { spout, floor: V3(0, 1.85, 0.5), center: V3(0, 0.5, 0) },
    /** T = pillow height scale; bulge = sideways squash (0 = none) while squeezing. */
    setPuff(T, bulge = 0) {
      this.puff = T;
      shell.scale.set(1 + bulge, T, 1 + bulge);
      liquid.mesh.scale.set(1, T * 0.86, 1);
      const f = liquid.fraction;
      liquid.max = T * 0.86 * 0.95;
      liquid.setFraction(f);
    },
    setFoam(a) {
      foam.visible = a > 0.01;
      if (!foam.visible) return;
      foamData.forEach((f, i) => {
        const hy = Math.min(liquid.fraction, 1) * this.puff * 0.86 * pillowH(f.x, f.z, lw, ld) + 0.05;
        m4.compose(p.set(f.x, hy, f.z), q, s.setScalar(Math.max(0.0001, f.s * a)));
        foam.setMatrixAt(i, m4);
      });
      foam.instanceMatrix.needsUpdate = true;
    },
  };
  api.setPuff(0.5);
  return api;
}

/* IV fluid bag lying flat, printed face up: a colour band, the fluid's name and its volume.
 *
 *   const bag = makeIVBag(mat, { name: '3% NaCl', sub: '500 mL', band: '#dc2626' });
 *
 * Origin: centre of the underside. Long axis along z: the ports at +z (toward the student),
 * the hanger tab with its hole at -z. anchors.port is the tip of the giving-set port.
 */
export function makeIVBag(mat, { w = 9, d = 15, name = '0.9% NaCl', sub = '1000 mL', band = '#2563eb', puff = 1.1 } = {}) {
  const g = new THREE.Group();
  const shell = mesh(pillow(w, d), mat.make.physical({
    color: 0xeef4fb, roughness: 0.18, transparent: true, opacity: 0.4, clearcoat: 1, clearcoatRoughness: 0.12,
    side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.3,
  }), { cast: false });
  shell.scale.y = puff; shell.renderOrder = 3;
  const fluid = mesh(pillow(w * 0.88, d * 0.86, 24, 30), mat.make.physical({ color: 0xd6ebfa, roughness: 0.08, transparent: true, opacity: 0.55, clearcoat: 0.6 }), { cast: false });
  fluid.scale.y = puff * 0.82; fluid.position.y = 0.03; fluid.renderOrder = 2;
  g.add(shell, fluid);

  // the welded rim, wider at the hanger end where the hole is punched
  const rim = roundedRectShape(w + 0.7, d + 2.4, 0.5);
  rim.holes.push(roundedRectShape(w - 0.2, d - 0.2, 0.35));
  const hole = new THREE.Path(); hole.absellipse(0, d / 2 + 0.75, 0.9, 0.42, 0, Math.PI * 2, true);
  rim.holes.push(hole);
  const rimGeo = new THREE.ShapeGeometry(rim, 6); rimGeo.rotateX(-Math.PI / 2); rimGeo.translate(0, 0, -0.6);
  const seal = mesh(rimGeo, mat.make.standard({ color: 0xe8eef6, transparent: true, opacity: 0.9, roughness: 0.4, side: THREE.DoubleSide, depthWrite: false }), { cast: false });
  seal.position.y = 0.03; seal.renderOrder = 3;
  g.add(seal);

  // the label, printed on the face: it rides the top of the pillow
  const c = makeCanvas(360, 520), x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 360, 520);
  x.fillStyle = band; x.fillRect(0, 0, 360, 92);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#ffffff'; x.font = `800 46px ${FONT}`; x.fillText('IV', 180, 48);
  x.fillStyle = '#0f172a'; x.font = `800 ${name.length > 8 ? 56 : 66}px ${FONT}`; x.fillText(name, 180, 200);
  x.font = `600 40px ${FONT}`; x.fillStyle = '#475569'; x.fillText(sub, 180, 280);
  x.fillStyle = 'rgba(15,23,42,.18)'; for (let i = 0; i < 6; i++) x.fillRect(60, 350 + i * 22, 240 - (i % 3) * 50, 7);
  const lw = w * 0.62, ld = d * 0.6, labelGeo = new THREE.PlaneGeometry(lw, ld, 12, 16);
  labelGeo.rotateX(-Math.PI / 2);
  const lp = labelGeo.attributes.position;
  for (let i = 0; i < lp.count; i++) lp.setY(i, 0.04 + puff * pillowH(lp.getX(i), lp.getZ(i), w, d));
  labelGeo.computeVertexNormals();
  const label = mesh(labelGeo, mat.make.standard({ map: canvasTex(c), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 }), { cast: false });
  label.renderOrder = 4;
  g.add(label);

  // two ports at +z: the giving-set port (twist-off cap) and the injection port
  const tubeMat = mat.make.standard({ color: 0xf1f5f9, roughness: 0.35 });
  const port = (px, len, capColor) => {
    const t = mesh(new THREE.CylinderGeometry(0.32, 0.32, len, 14), tubeMat);
    t.rotation.x = Math.PI / 2; t.position.set(px, 0.36, d / 2 + len / 2 - 0.2);
    const cap = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 14), mat.make.standard({ color: capColor, roughness: 0.45 }));
    cap.rotation.x = Math.PI / 2; cap.position.set(px, 0.36, d / 2 + len - 0.1);
    g.add(t, cap);
  };
  port(-1.1, 2.2, 0x2563eb); port(1.1, 1.6, 0xf8fafc);
  return { group: g, shell, label, w, d, anchors: { port: V3(-1.1, 0.36, d / 2 + 2.4), center: V3(0, puff * 0.5, 0) } };
}
