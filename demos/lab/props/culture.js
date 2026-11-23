/* Microbiology culture ware (from Ecoli): an agar plate with a lid, and what grows on it:
 * colonies, a streak, a lawn, and colonies that glow green under UV light (GFP).
 *
 *   const p = makeAgarPlate(mat, { colonies: 42, seed: 3, glow: true });
 *   p.setLid(1);        // 0 closed … 1 lifted and tilted back
 *   p.setGrowth(0.6);   // colonies or lawn grow in, 0 … 1
 *   p.setGlow(1);       // UV fluorescence (only with glow: true)
 *   p.setWet(r, a);     // a drop of culture spread on the agar: radius cm, opacity
 *
 * Origin at the centre of the base; anchors.floor is the agar surface. 8 cm across.
 * The colony pattern is fixed by `seed` (core/random.js seeded()), so it is the
 * same on every rebuild. */
import * as THREE from 'three';
import { V3, clamp, smooth } from '../core/math.js';
import { lathe, mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { seeded } from '../core/random.js';
import { toLinear } from '../materials.js';

const R = 4;            // outer radius, cm
const AGAR_Y = 0.46;    // agar surface
const COL_GEO = new THREE.SphereGeometry(1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
COL_GEO.userData.shared = true;
const _d = new THREE.Object3D();

let glowTex = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = makeCanvas(128, 128); const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,.12)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowTex = canvasTex(c);
  return glowTex;
}

/** Colonies scattered over the agar, at least minD apart. */
function scatter(rnd, n, rMax, minD) {
  const pts = [];
  for (let tries = 0; pts.length < n && tries < n * 80; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * rMax, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pts.every((p) => (p.x - x) ** 2 + (p.z - z) ** 2 > minD * minD)) pts.push({ x, z, r: 0.13 + rnd() * 0.17, d: rnd() });
  }
  return pts;
}
/** Colonies along a four-line streak (a streak plate), fully grown. */
function streakPts(rnd) {
  const pts = [];
  const lines = [[[-2.5, -1.75], [2.25, -2.25]], [[2.25, -2.25], [-1.75, 0.25]], [[-1.75, 0.25], [2.5, 0.75]], [[2.5, 0.75], [-0.5, 2.5]]];
  lines.forEach(([a, b], li) => {
    const n = li < 2 ? 28 : 14;
    for (let i = 0; i < n; i++) {
      const k = i / n;
      pts.push({ x: a[0] + (b[0] - a[0]) * k + (rnd() - 0.5) * 0.5, z: a[1] + (b[1] - a[1]) * k + (rnd() - 0.5) * 0.5, r: 0.11 + rnd() * (li < 2 ? 0.09 : 0.165), d: 0 });
    }
  });
  return pts;
}

/** colonies: number of separate colonies; streak: a streaked starter plate instead;
 *  lawn: a solid film of growth; glow: colonies fluoresce green under UV (setGlow).
 *  agar: colour of the agar (picked hex). */
export function makeAgarPlate(mat, { colonies = 0, streak = false, lawn = false, glow = false, seed = 1, agar = '#ebc97e' } = {}) {
  const rnd = seeded(seed);
  const g = new THREE.Group();
  const base = mesh(lathe([[0, 0], [R, 0], [R, 0.7], [R - 0.075, 0.7], [R - 0.075, 0.06], [0, 0.06]], 64), mat.make.wideGlass({ color: '#e3ebf4', opacity: 0.3 }), { cast: false });
  base.renderOrder = 3;
  const agarMesh = mesh(new THREE.CylinderGeometry(R - 0.085, R - 0.085, 0.4, 64),
    mat.make.physical({ color: toLinear(agar), roughness: 0.28, clearcoat: 0.7, clearcoatRoughness: 0.15, transparent: true, opacity: 0.95 }), { cast: false });
  agarMesh.position.y = 0.26;
  g.add(base, agarMesh);
  const lid = new THREE.Group();
  const lidM = mesh(lathe([[0, 0.875], [R + 0.175, 0.875], [R + 0.175, 0.35], [R + 0.09, 0.35], [R + 0.09, 0.8], [0, 0.8]], 64), mat.make.wideGlass({ color: '#eef4fa', opacity: 0.14 }), { cast: false });
  lidM.renderOrder = 4;
  lid.add(lidM);
  g.add(lid);

  // colonies (one instanced mesh)
  const colMat = mat.make.standard({ color: 0xfffaf0, roughness: 0.3, emissive: 0x000000 });
  const pts = streak ? streakPts(rnd) : scatter(rnd, colonies, 3.3, 0.5);
  let col = null;
  if (pts.length) {
    col = new THREE.InstancedMesh(COL_GEO, colMat, pts.length);
    col.frustumCulled = false; col.raycast = () => {};
    g.add(col);
  }
  // lawn: a speckled film over the agar
  let lawnMesh = null;
  if (lawn) {
    const c = makeCanvas(512, 512); const x = c.getContext('2d');
    x.save(); x.beginPath(); x.arc(256, 256, 246, 0, Math.PI * 2); x.clip();
    x.fillStyle = 'rgba(250,242,218,.55)'; x.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 5200; i++) {
      x.fillStyle = `rgba(255,${246 + rnd() * 9 | 0},${222 + rnd() * 20 | 0},${0.5 + rnd() * 0.5})`;
      x.beginPath(); x.arc(rnd() * 512, rnd() * 512, 1 + rnd() * 2.4, 0, Math.PI * 2); x.fill();
    }
    x.restore();
    lawnMesh = mesh(new THREE.CircleGeometry(R - 0.15, 64), mat.make.standard({ map: canvasTex(c), transparent: true, opacity: 0, roughness: 0.45, depthWrite: false }), { cast: false });
    lawnMesh.rotation.x = -Math.PI / 2; lawnMesh.position.y = AGAR_Y + 0.008; lawnMesh.renderOrder = 1;
    g.add(lawnMesh);
  }
  // GFP glow: additive sprites over each colony (unlit effect)
  let glowPts = null;
  if (glow && pts.length) {
    const pos = new Float32Array(pts.length * 3);
    pts.forEach((p, i) => { pos[i * 3] = p.x; pos[i * 3 + 1] = AGAR_Y + 0.1; pos[i * 3 + 2] = p.z; });
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    glowPts = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: 0x2bff62, size: 2.5, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glowPts.raycast = () => {}; glowPts.renderOrder = 8; glowPts.userData.noHL = true;
    g.add(glowPts);
  }
  // a drop of culture, spread with a loop (setWet)
  const wet = mesh(new THREE.CircleGeometry(1, 32), mat.make.physical({ color: toLinear('#efdc9f'), transparent: true, opacity: 0, roughness: 0.05, clearcoat: 1, depthWrite: false }), { cast: false, receive: false });
  wet.rotation.x = -Math.PI / 2; wet.position.y = AGAR_Y + 0.004; wet.visible = false; wet.renderOrder = 1;
  g.add(wet);

  const GFP = new THREE.Color(0x19ff5a), DARK = new THREE.Color(0x0b3a18), WHITE = new THREE.Color(0xfffaf0);
  const api = {
    group: g, lid, colonies: pts.length,
    anchors: { floor: V3(0, AGAR_Y, 0), top: V3(0, 0.875, 0) },
    growth: 0, glow: 0,
    /** 0 closed … 1 lid lifted 3 cm and tilted back. */
    setLid(k) { lid.position.set(0, 3.1 * k, -3.1 * k); lid.rotation.x = -0.55 * k; },
    setGrowth(v) {
      this.growth = v;
      if (col) {
        pts.forEach((p, i) => {
          const s = Math.max(1e-4, p.r * smooth(clamp(v * 1.4 - p.d * 0.4)));
          _d.position.set(p.x, AGAR_Y, p.z); _d.rotation.set(0, 0, 0); _d.scale.set(s, Math.max(1e-4, s * 0.55), s);
          _d.updateMatrix(); col.setMatrixAt(i, _d.matrix);
        });
        col.instanceMatrix.needsUpdate = true;
      }
      if (lawnMesh) lawnMesh.material.opacity = smooth(clamp(v * 1.1)) * 0.95;
      this.setGlow(this.glow);
    },
    /** UV fluorescence 0 … 1, scaled by how far the colonies have grown. */
    setGlow(u) {
      this.glow = u;
      if (!glow || !col) return;
      const k = u * this.growth;
      colMat.emissive.copy(GFP); colMat.emissiveIntensity = 0.75 * k;
      colMat.color.copy(WHITE).lerp(DARK, k);
      glowPts.material.opacity = 0.7 * u * smooth(clamp(this.growth));
    },
    setWet(r, a) { wet.visible = a > 0.005 && r > 0.01; wet.scale.setScalar(Math.max(0.01, r)); wet.material.opacity = a; },
  };
  api.setGrowth(streak ? 1 : 0);
  return api;
}
