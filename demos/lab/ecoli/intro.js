/* The intro card's art: a spinning 3D plasmid (a small loop of double-stranded DNA)
 * with its four regions labelled. Ported from the original lab (/Ecoli/index.html);
 * it has its own small renderer and stops when the intro closes.
 *
 *   const art = createPlasmidArt(boxEl, canvasEl);   // .plab[data-r] elements in boxEl are the labels
 *   art.stop();
 */
import * as THREE from 'three';
import { linearOut, LIGHT } from '../core/three-compat.js';

export function createPlasmidArt(box, cv) {
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: true });
  r.setPixelRatio(Math.min(devicePixelRatio, 2));
  r.setClearColor(0, 0);
  linearOut(r);
  const sc = new THREE.Scene(), cam = new THREE.PerspectiveCamera(30, 1, 0.1, 50);
  cam.position.set(0, 0, 8.6);
  sc.add(new THREE.HemisphereLight('#ffffff', '#cbd5e1', 0.75 * LIGHT));
  const dl = new THREE.DirectionalLight('#ffffff', 0.65 * LIGHT); dl.position.set(2, 4, 5); sc.add(dl);
  const R = 1.6, HR = 0.2, TURNS = 30;
  const REG = [{ k: 'gfp', a: 0.02, b: 0.25, c: '#22c55e' }, { k: 'bla', a: 0.36, b: 0.54, c: '#f59e0b' }, { k: 'ara', a: 0.65, b: 0.77, c: '#8b5cf6' }, { k: 'ori', a: 0.86, b: 0.93, c: '#64748b' }];
  const BASE = new THREE.Color('#a8b4c6');
  const colAt = (t) => { for (const g of REG) if (t >= g.a && t <= g.b) return new THREE.Color(g.c); return BASE.clone(); };
  const frame = (t) => { const th = t * Math.PI * 2; return { c: V3(Math.cos(th) * R, Math.sin(th) * R, 0), n: V3(Math.cos(th), Math.sin(th), 0) }; };
  class Strand extends THREE.Curve {
    constructor(ph) { super(); this.ph = ph; }
    getPoint(t, o = new THREE.Vector3()) { const f = frame(t), a = t * TURNS * Math.PI * 2 + this.ph; return o.copy(f.c).addScaledVector(f.n, Math.cos(a) * HR).add(V3(0, 0, Math.sin(a) * HR)); }
  }
  const g = new THREE.Group(); sc.add(g);
  const SEG = 1400, RAD = 8;
  [0, 2.3].forEach((ph) => {
    const geo = new THREE.TubeGeometry(new Strand(ph), SEG, 0.042, RAD, true), n = geo.attributes.position.count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = colAt(Math.floor(i / (RAD + 1)) / SEG); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.05 })));
  });
  // base-pair rungs
  const NB = TURNS * 10, rung = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.026, 0.026, 1, 6), new THREE.MeshStandardMaterial({ roughness: 0.5 }), NB);
  const s1 = new Strand(0), s2 = new Strand(2.3), up = V3(0, 1, 0), q = new THREE.Quaternion(), d = new THREE.Object3D();
  for (let i = 0; i < NB; i++) {
    const t = (i + 0.5) / NB, a = s1.getPoint(t), b = s2.getPoint(t), dir = b.clone().sub(a), len = dir.length();
    d.position.copy(a).add(b).multiplyScalar(0.5); d.quaternion.copy(q.setFromUnitVectors(up, dir.normalize())); d.scale.set(1, len * 0.92, 1); d.updateMatrix();
    rung.setMatrixAt(i, d.matrix);
    rung.setColorAt(i, colAt(t).lerp(new THREE.Color('#ffffff'), 0.45));
  }
  g.add(rung);
  const labs = [...box.querySelectorAll('.plab')].map((el) => { const R0 = REG.find((x) => x.k === el.dataset.r); return { el, t: (R0.a + R0.b) / 2 }; });
  let w = 0, h = 0, run = true;
  const t0 = performance.now();
  function size() { w = box.clientWidth; h = box.clientHeight; if (!w || !h) return; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
  const ro = new ResizeObserver(size); ro.observe(box); size();
  const v = V3();
  (function loop() {
    if (!run) return;
    const T = (performance.now() - t0) / 1000;
    g.rotation.set(-0.72 + Math.sin(T * 0.5) * 0.08, Math.sin(T * 0.35) * 0.18, -T * 0.22);
    g.updateMatrixWorld();
    labs.forEach((L) => {
      const f = frame(L.t); v.copy(f.c).addScaledVector(f.n, 0.55).applyMatrix4(g.matrixWorld);
      const z = v.z; v.project(cam);
      const hw = L.el.offsetWidth / 2 + 2;
      L.el.style.left = Math.min(w - hw, Math.max(hw, (v.x + 1) / 2 * w)) + 'px';
      L.el.style.top = ((1 - v.y) / 2 * h) + 'px';
      L.el.style.opacity = z < -0.4 ? 0.45 : 1; L.el.style.zIndex = z < -0.4 ? 0 : 2;
    });
    r.render(sc, cam);
    requestAnimationFrame(loop);
  })();
  return { stop() { if (!run) return; run = false; ro.disconnect(); setTimeout(() => { r.dispose(); r.forceContextLoss(); }, 600); } };
}
