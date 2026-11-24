/* Liquid effects: pour stream, surface ripple, falling powder, a drop, rising bubbles.
 * Each takes the parent to add itself to (usually the bench root). */
import * as THREE from 'three';
import { V3, lerp, Ease } from '../core/math.js';
import { anim } from '../core/tween.js';
import { rand, seeded } from '../core/random.js';
import { mesh } from '../core/geometry.js';

const GEO = {
  ripple: new THREE.RingGeometry(0.9, 1, 48),
  powder: new THREE.IcosahedronGeometry(0.07, 0),
  drop: new THREE.SphereGeometry(0.17, 14, 10),
};
Object.values(GEO).forEach((g) => { g.userData.shared = true; });

/** A pour stream. stream.set(fromWorld, toY, thickness) each frame, stream.hide() when done. */
export function makeStream(mat, parent, { color = 0x5aa9e6 } = {}) {
  const geo = new THREE.CylinderGeometry(0.17, 0.12, 1, 12, 1, true);
  geo.translate(0, -0.5, 0);
  const m = mesh(geo, mat.make.liquid(color, 0.6), { cast: false });
  m.visible = false; m.renderOrder = 2;
  parent.add(m);
  return {
    mesh: m,
    set(from, toY, r = 1) {
      m.visible = true;
      m.position.copy(from);
      m.scale.set(r * (1 + Math.sin(performance.now() * 0.03) * 0.08), Math.max(0.01, from.y - toY), r);
    },
    hide() { m.visible = false; },
  };
}

export function ripple(parent, pos, maxR = 2) {
  const m = new THREE.Mesh(GEO.ripple, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
  m.userData.noSketch = true;
  m.rotation.x = -Math.PI / 2; m.position.copy(pos); m.renderOrder = 6;
  parent.add(m);
  return anim(0.8, (e) => { m.scale.setScalar(0.15 + maxR * e); m.material.opacity = 0.8 * (1 - e); }, Ease.out).then(() => {
    parent.remove(m); m.material.dispose();
  });
}

/** Powder falling from `from` onto a liquid surface at height surfY. */
export function powderFall(mat, parent, from, surfY) {
  const N = 80;
  const im = new THREE.InstancedMesh(GEO.powder, mat.powder, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = V3(), p = V3();
  for (let i = 0; i < N; i++) { m4.compose(from, q, V3(0, 0, 0)); im.setMatrixAt(i, m4); }
  parent.add(im);
  const ps = Array.from({ length: N }, () => ({
    d: rand(0, 0.4), o: V3(rand(-0.3, 0.3), rand(-0.1, 0.1), rand(-0.3, 0.3)),
    v: V3(rand(-1.2, 1.2), rand(-2, 0.5), rand(-1.2, 1.2)), s: rand(0.6, 1.5),
  }));
  let splashed = false;
  return anim(1.2, (e, k) => {
    const t = k * 1.2;
    ps.forEach((pp, i) => {
      const tt = t - pp.d; let s = 0;
      if (tt > 0) {
        p.set(from.x + pp.o.x + pp.v.x * tt, from.y + pp.o.y + pp.v.y * tt - 0.5 * 80 * tt * tt, from.z + pp.o.z + pp.v.z * tt);
        s = p.y > surfY ? pp.s : 0;
        if (!splashed && p.y <= surfY) { splashed = true; ripple(parent, V3(from.x, surfY + 0.01, from.z), 2.2); }
      } else p.copy(from);
      sc.setScalar(s); m4.compose(p, q, sc); im.setMatrixAt(i, m4);
    });
    im.instanceMatrix.needsUpdate = true;
    if (k >= 1) parent.remove(im);
  }, Ease.linear);
}

/** One drop falling from a world point onto a surface, with a ripple. */
export async function drop(parent, material, from, surfY) {
  const d = new THREE.Mesh(GEO.drop, material);
  d.position.copy(from);
  parent.add(d);
  const y0 = d.position.y;
  await anim(0.38, (e) => { d.position.y = lerp(y0, surfY, e); d.scale.set(1, 1 + 0.5 * e, 1); }, Ease.in);
  parent.remove(d);
  ripple(parent, V3(from.x, surfY + 0.01, from.z), 2.2);
}

/** Bubbles rising through a liquid column (e.g. a test tube), as one instanced mesh.
 *  Pose them from time alone, so the timeline can scrub:
 *    const bub = makeBubbles(mat, root, { count: 16 });
 *    bub.set(amount, time, x, z, y0, y1);   // amount 0..1 scales them; 0 hides them
 *  radius: how far from the column's axis they rise; size, speed: [min, max]. */
export function makeBubbles(mat, parent, { count = 16, seed = 7, radius = 0.85, size = [0.05, 0.11], speed = [0.35, 0.65] } = {}) {
  const R = seeded(seed);
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8),
    mat.make.physical({ color: 0xffffff, transparent: true, opacity: 0.7, roughness: 0.05, clearcoat: 1 }), count);
  im.frustumCulled = false; im.renderOrder = 2;
  parent.add(im);
  const data = Array.from({ length: count }, () => ({ a: R() * Math.PI * 2, r: R() * radius, o: R(), s: lerp(size[0], size[1], R()), sp: lerp(speed[0], speed[1], R()) }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), sc = V3();
  return {
    mesh: im,
    set(amount, time, x, z, y0, y1) {
      im.visible = amount >= 0.01;
      if (!im.visible) return;
      data.forEach((b, i) => {
        const u = (time * b.sp * 0.4 + b.o) % 1;
        m4.compose(p.set(x + Math.cos(b.a) * b.r, lerp(y0, y1, u), z + Math.sin(b.a) * b.r), q, sc.setScalar(b.s * amount));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}

/** Steam rising off a warm surface, as one instanced mesh of soft puffs. Posed from time alone,
 *  so the timeline can scrub:
 *    const steam = makeSteam(mat, root);
 *    steam.set(amount, time, x, y, z);   // amount 0..1; 0 hides it. (x, y, z): the surface's centre
 *  radius: how wide a patch it rises from; rise: how high a puff climbs before it fades. */
export function makeSteam(mat, parent, { count = 18, seed = 5, radius = 2.5, rise = 7, color = 0xffffff } = {}) {
  const R = seeded(seed);
  const m = mat.make.standard({ color, roughness: 1, transparent: true, opacity: 0.2, depthWrite: false });
  const im = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), m, count);
  im.frustumCulled = false; im.renderOrder = 6; im.castShadow = im.receiveShadow = false;
  im.userData.noHL = true; im.raycast = () => {};
  parent.add(im);
  const data = Array.from({ length: count }, () => ({ a: R() * Math.PI * 2, r: Math.sqrt(R()) * radius, o: R(), sp: lerp(0.25, 0.45, R()), drift: lerp(-0.8, 0.8, R()) }));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = V3(), sc = V3();
  return {
    mesh: im,
    set(amount, time, x, y, z) {
      im.visible = amount >= 0.01;
      if (!im.visible) return;
      m.opacity = 0.2 * amount;
      data.forEach((b, i) => {
        const u = (time * b.sp + b.o) % 1;
        const s = (0.2 + 0.6 * u) * Math.sin(Math.PI * u) * amount;
        m4.compose(p.set(x + Math.cos(b.a) * b.r + b.drift * u, y + u * rise, z + Math.sin(b.a) * b.r), q, sc.setScalar(s));
        im.setMatrixAt(i, m4);
      });
      im.instanceMatrix.needsUpdate = true;
    },
  };
}
