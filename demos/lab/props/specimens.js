/* Produce: a strawberry and its calyx (the green leaves on top). From the
 * Strawberry lab.
 *
 *   const s = makeStrawberry(mat, { seed: 5, calyx: true });
 *   s.anchors.top            // where the calyx sits (local space)
 *   const c = makeCalyx(mat, { seed: 6 });    // a loose calyx, origin at its attach point
 *
 * Origin: the strawberry's TIP (it stands on its point), axis +y, 4 cm long.
 * Lay it on its side with Q(0, 0, Math.PI / 2) and lift it by its radius.
 *
 * Colours are converted from sRGB so the berry reads as a true deep red on
 * r128 (raw hex would come out pink). Content colour, not theme.
 *
 * Also the precipitated DNA: a cloud of white strands that appears at the boundary of
 * two layers, then winds up on a skewer into a glossy glob.
 *
 *   const dna = makeDnaPrecipitate(mat);
 *   dna.set(appear, wind, time)   // appear 0..1 (strands form), wind 0..1 (spooled), time = s (slow spin)
 *
 * Its origin is the centre of the clump (about 2 cm tall, 2 cm wide). When wound it
 * stretches up along +y, so parent it to the skewer's tip to spool it.
 */
import * as THREE from 'three';
import { V3, clamp, lerp } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';

const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const STRAWBERRY_H = 4.0;
const BH = STRAWBERRY_H, BR = 2.2;
const CALYX_Y = BH * 0.99;
const prof = (t) => Math.pow(t * 0.96 + 0.04, 0.62) * Math.sqrt(Math.max(0, 1 - Math.pow(t, 7)));
const bump = (a, t, p) => 1 + 0.045 * Math.sin(a * 3 + p[0] + t * 4) + 0.03 * Math.sin(a * 5 + p[1] - t * 7);
function berrySurf(t, a, p, out) {
  const r = prof(t) * BR * bump(a, t, p);
  return out.set(Math.cos(a) * r, t * BH, Math.sin(a) * r * 0.94);
}

function berryGeometry(p) {
  const N = 44, SEG = 56, pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    pts.push(new THREE.Vector2(Math.max(prof(t) * BR, 0.0005), t * BH));
  }
  const g = new THREE.LatheGeometry(pts, SEG);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const red = lin('#c4102c'), deep = lin('#8a0a20'), pale = lin('#f0cfa0'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const t = y / BH, a = Math.atan2(z, x), r = Math.hypot(x, z) * bump(a, t, p);
    pos.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r * 0.94);
    c.copy(red).lerp(deep, clamp(1 - t / 0.35) * 0.45);
    const top = clamp((t - 0.84) / 0.16);
    c.lerp(pale, top * top * 0.8);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  // weld the lathe seam normals
  const nrm = g.attributes.normal, stride = N + 1, n = V3();
  for (let j = 0; j <= N; j++) {
    const a = j, b = SEG * stride + j;
    n.set(nrm.getX(a) + nrm.getX(b), nrm.getY(a) + nrm.getY(b), nrm.getZ(a) + nrm.getZ(b)).normalize();
    nrm.setXYZ(a, n.x, n.y, n.z); nrm.setXYZ(b, n.x, n.y, n.z);
  }
  return g;
}

const SEED_GEO = new THREE.SphereGeometry(1, 8, 6);
const LEAF_BASE = (() => { const g = new THREE.SphereGeometry(1, 16, 10); g.scale(0.4, 0.045, 0.78); g.translate(0, 0, 0.62); return g; })();
SEED_GEO.userData.shared = true;

/** Highest point of the berry surface at horizontal distance d from the axis, relative to the calyx. */
const shoulderY = (() => {
  const tab = [];
  let rPrev = -1;
  for (let i = 0; i <= 240; i++) {
    const t = 1 - (i / 240) * 0.5;
    const r = prof(t) * BR * 1.08;
    if (r <= rPrev) break;
    tab.push([r, t * BH]);
    rPrev = r;
  }
  const last = tab[tab.length - 1];
  return (d) => {
    if (d >= last[0]) return last[1] - (d - last[0]) - CALYX_Y; // past the widest point, flare gently
    for (let i = 1; i < tab.length; i++) {
      if (tab[i][0] >= d) {
        const k = (d - tab[i - 1][0]) / (tab[i][0] - tab[i - 1][0]);
        return lerp(tab[i - 1][1], tab[i][1], k) - CALYX_Y;
      }
    }
    return last[1] - CALYX_Y;
  };
})();

/** A sepal bent to hug the shoulder, with a small gap that grows toward the tip. */
function leafGeometry(scale, lift) {
  const g = LEAF_BASE.clone();
  g.scale(scale, scale, scale);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const d = Math.hypot(x, z);
    p.setY(i, p.getY(i) + shoulderY(d) + 0.07 + lift * d);
  }
  g.computeVertexNormals();
  return g;
}

/** The calyx: nine sepals, a stem and a cap. Origin at the point where it sits on the berry.
 *  minY = how far its drooping tips hang below the origin (to rest it on a bench). */
export function makeCalyx(mat, { seed = 6 } = {}) {
  const r = seeded(seed);
  const g = new THREE.Group();
  const leafMat = mat.make.standard({ color: lin('#3c9a4a'), roughness: 0.7, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const piv = new THREE.Group();
    piv.rotation.y = (i / 9) * Math.PI * 2 + r() * 0.3;
    piv.add(mesh(leafGeometry(0.8 + r() * 0.35, 0.03 + r() * 0.05), leafMat));
    g.add(piv);
  }
  const stem = mesh(new THREE.CylinderGeometry(0.1, 0.15, 1.3, 8), mat.make.standard({ color: lin('#4e8f3a'), roughness: 0.6 }));
  stem.position.y = 0.6; stem.rotation.z = 0.2;
  const cap = mesh(new THREE.SphereGeometry(0.38, 12, 8), leafMat);
  cap.scale.y = 0.4;
  g.add(stem, cap);
  return { group: g, anchors: { stem: V3(0, 1.25, 0) }, minY: shoulderY(1.15 * 1.4) + 0.07 };
}

export function makeStrawberry(mat, { seed = 5, calyx = false } = {}) {
  const r = seeded(seed);
  const p = [r() * 6, r() * 6];
  const g = new THREE.Group();
  const body = mesh(berryGeometry(p), mat.make.physical({
    color: 0xffffff, vertexColors: true, roughness: 0.66, clearcoat: 0.08, clearcoatRoughness: 0.7, envMapIntensity: 0.45,
  }));
  g.add(body);
  const count = 150;
  const seeds = new THREE.InstancedMesh(SEED_GEO, mat.make.standard({ color: lin('#e8bf45'), roughness: 0.6 }), count);
  seeds.castShadow = true;
  const d = new THREE.Object3D(), v = V3(), n = V3(), a1 = V3(), a2 = V3(), b1 = V3(), b2 = V3();
  for (let i = 0; i < count; i++) {
    const t = 0.07 + 0.82 * Math.pow((i + 0.5) / count, 0.8);
    const a = i * 2.399963 + r() * 0.15;
    berrySurf(t, a, p, v);
    berrySurf(t + 0.01, a, p, a1); berrySurf(t - 0.01, a, p, a2);
    berrySurf(t, a + 0.02, p, b1); berrySurf(t, a - 0.02, p, b2);
    n.crossVectors(b1.sub(b2), a1.sub(a2)).normalize();
    if (n.x * v.x + n.z * v.z < 0) n.negate();
    d.position.copy(v).addScaledVector(n, -0.025);
    d.lookAt(v.x + n.x, v.y + n.y, v.z + n.z);
    d.scale.set(0.05, 0.08, 0.035);
    d.updateMatrix();
    seeds.setMatrixAt(i, d.matrix);
  }
  g.add(seeds);
  let cx = null;
  if (calyx) {
    cx = makeCalyx(mat, { seed: seed + 1 });
    cx.group.position.y = CALYX_Y;
    g.add(cx.group);
  }
  return { group: g, body, calyx: cx, height: BH, radius: BR, anchors: { tip: V3(0, 0, 0), top: V3(0, CALYX_Y, 0), center: V3(0, BH / 2, 0) } };
}

/** Strawberry seeds, for pulp: the shared seed geometry and a material. */
export const strawberrySeed = { geometry: SEED_GEO, color: lin('#e8bf45') };

function dotTexture() { // one per prop: disposeTree() frees it with the prop
  const c = makeCanvas(64, 64); const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return canvasTex(c);
}

export function makeDnaPrecipitate(mat, { strands: count = 18, seed = 1234 } = {}) {
  const R = seeded(seed);
  const dir = (out = V3()) => { const u = R() * 2 - 1, a = R() * Math.PI * 2, s = Math.sqrt(1 - u * u); return out.set(s * Math.cos(a), u, s * Math.sin(a)); };
  const g = new THREE.Group();
  const strandMat = mat.make.standard({
    color: 0xeef0f8, emissive: 0xffffff, emissiveIntensity: 0.08, roughness: 0.5,
    transparent: true, opacity: 0, morphTargets: true, depthWrite: false,
  });
  const strands = [];
  for (let k = 0; k < count; k++) {
    const a = [], b = [];
    const p = V3((R() - 0.5) * 1.2, -0.6 + R() * 1.2, (R() - 0.5) * 1.2), d = dir();
    const ph0 = R() * Math.PI * 2, rr = 0.2 + R() * 0.24, turns = 3 + R() * 2.5;
    for (let i = 0; i < 26; i++) {
      d.add(dir().multiplyScalar(0.9)).normalize();
      p.addScaledVector(d, 0.2);
      const rad = Math.hypot(p.x, p.z);
      if (rad > 0.95) { p.x *= 0.95 / rad; p.z *= 0.95 / rad; d.x *= -1; d.z *= -1; }
      p.y = clamp(p.y, -0.75, 1.3);
      a.push(p.clone());
      const s = i / 25, th = ph0 + s * turns * Math.PI * 2;
      b.push(V3(Math.cos(th) * rr, -0.3 + s * 1.7, Math.sin(th) * rr)); // wound on the skewer
    }
    const gA = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(a), 64, 0.05, 5);
    const gB = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(b), 64, 0.06, 5);
    gA.morphAttributes.position = [gB.attributes.position];
    const m = new THREE.Mesh(gA, strandMat);
    m.updateMorphTargets();
    m.frustumCulled = false; m.renderOrder = 2; m.userData.noHL = true; // set() drives this material
    strands.push(m);
    g.add(m);
  }
  const globGeo = new THREE.SphereGeometry(0.55, 28, 20);
  const p = globGeo.attributes.position, t = V3();
  for (let i = 0; i < p.count; i++) {
    t.fromBufferAttribute(p, i);
    t.multiplyScalar(1 + 0.18 * Math.sin(t.x * 7 + t.y * 3) * Math.cos(t.z * 6 - t.y * 4));
    p.setXYZ(i, t.x, t.y, t.z);
  }
  globGeo.computeVertexNormals();
  const glob = new THREE.Mesh(globGeo, mat.make.physical({ color: 0xf6f7ff, roughness: 0.25, clearcoat: 1, transparent: true, opacity: 0, depthWrite: false }));
  glob.scale.set(1, 1.55, 1); glob.position.y = 0.55; glob.renderOrder = 2; glob.userData.noHL = true;
  g.add(glob);
  const cloudPos = [];
  for (let i = 0; i < 260; i++) {
    const a = R() * Math.PI * 2, rr = Math.sqrt(R());
    cloudPos.push(Math.cos(a) * rr, -0.7 + Math.pow(R(), 1.6) * 1.9, Math.sin(a) * rr);
  }
  const cloudGeo = new THREE.BufferGeometry();
  cloudGeo.setAttribute('position', new THREE.Float32BufferAttribute(cloudPos, 3));
  const cloudMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, map: dotTexture(), transparent: true, opacity: 0, depthWrite: false });
  const cloud = new THREE.Points(cloudGeo, cloudMat);
  cloud.renderOrder = 2;
  g.add(cloud);
  return {
    group: g, strands, glob, cloud,
    anchors: { top: V3(0, 1.6, 0) },
    set(appear, wind, time = 0) {
      g.visible = appear > 0.001;
      g.scale.set(1, 0.45 + 0.55 * appear, 1);
      strandMat.opacity = 0.92 * appear;
      strands.forEach((s, i) => { s.morphTargetInfluences[0] = clamp(wind * 1.2 - (i % 4) * 0.05); });
      glob.material.opacity = 0.55 * clamp((wind - 0.35) / 0.55);
      cloudMat.opacity = 0.55 * appear * (1 - wind);
      cloud.scale.set(1 - 0.75 * wind, 1, 1 - 0.75 * wind);
      cloud.rotation.y = time * 0.15;
    },
  };
}


/* ---------- spinach leaf and leaf disks (Photosynthesis) ---------- */
const LEAF_W = 7, LEAF_H = 11, LCW = 512, LCH = 800;
function leafPath() {
  const p = new Path2D();
  p.moveTo(256, 652);
  p.bezierCurveTo(146, 646, 34, 566, 46, 420);
  p.bezierCurveTo(58, 250, 160, 92, 256, 26);
  p.bezierCurveTo(352, 92, 454, 250, 466, 420);
  p.bezierCurveTo(478, 566, 366, 646, 256, 652);
  p.closePath();
  return p;
}
function petiolePath() {
  const p = new Path2D();
  p.moveTo(244, 648); p.quadraticCurveTo(247, 720, 249, 796); p.lineTo(263, 796); p.quadraticCurveTo(265, 720, 268, 648);
  p.closePath();
  return p;
}
const leafDisp = (x, y) => { const nx = x / (LEAF_W / 2); return 0.14 * nx * nx + 0.05 * Math.sin(y * 1.7 + x * 0.9); };
function halfWidthAt(y) {
  const s = clamp((652 - y) / 626, 0, 1);
  return 214 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.72)), 0.85);
}
/** Spinach leaf lying flat (+y up), 7 × 11 cm, with 20 punch spots.
 *  spots[i].local = a spot in the leaf mesh's space; punchHole(spot) cuts it out.
 *  seed sets the texture details and spot positions. From the Photosynthesis lab. */
export function makeLeaf(mat, { seed = 1 } = {}) {
  const R = seeded(seed);
  const rand = (a = 0, b = 1) => a + (b - a) * R();
  const blade = leafPath(), pet = petiolePath();
  const col = makeCanvas(LCW, LCH); const g = col.getContext('2d');
  const grd = g.createRadialGradient(256, 360, 30, 256, 380, 440);
  grd.addColorStop(0, '#4a9a3e'); grd.addColorStop(0.55, '#367f31'); grd.addColorStop(1, '#245f26');
  g.fillStyle = grd; g.fillRect(0, 0, LCW, LCH);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(255,255,210,${rand(0.02, 0.05)})` : `rgba(0,40,0,${rand(0.03, 0.07)})`;
    g.beginPath(); g.ellipse(rand(0, LCW), rand(0, LCH), rand(3, 14), rand(3, 10), rand(0, 3), 0, 7); g.fill();
  }
  g.save();
  g.clip(blade);
  g.lineCap = 'round';
  for (let k = 0; k < 8; k++) {
    const y0 = 612 - k * 68;
    const hw = halfWidthAt(y0 - 70);
    for (const side of [-1, 1]) {
      const ex = 256 + side * hw * 0.95, ey = y0 - 120 - k * 4;
      const cx = 256 + side * hw * 0.45, cy = y0 - 30;
      g.strokeStyle = 'rgba(176,218,140,0.55)';
      g.lineWidth = Math.max(1.5, 5 - k * 0.45);
      g.beginPath(); g.moveTo(256, y0); g.quadraticCurveTo(cx, cy, ex, ey); g.stroke();
      g.strokeStyle = 'rgba(160,205,130,0.28)';
      g.lineWidth = 1.4;
      for (let j = 1; j < 5; j++) {
        const tt = j / 5;
        const px = (1 - tt) * (1 - tt) * 256 + 2 * (1 - tt) * tt * cx + tt * tt * ex;
        const py = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * cy + tt * tt * ey;
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + side * 12, py + 18, px + side * rand(10, 26), py + rand(26, 44)); g.stroke();
        g.beginPath(); g.moveTo(px, py);
        g.quadraticCurveTo(px + side * 6, py - 16, px + side * rand(4, 18), py - rand(24, 40)); g.stroke();
      }
    }
  }
  g.strokeStyle = 'rgba(170,210,140,0.12)'; g.lineWidth = 1;
  for (let i = 0; i < 380; i++) {
    const x = rand(40, 470), y = rand(30, 650);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + rand(-14, 14), y + rand(-14, 14)); g.stroke();
  }
  g.strokeStyle = 'rgba(15,55,18,0.35)'; g.lineWidth = 26;
  g.filter = 'blur(7px)'; g.stroke(blade); g.filter = 'none';
  g.restore();
  g.lineCap = 'round';
  for (let y = 798; y > 36; y -= 3) {
    const w = y > 648 ? 13 : lerp(2.5, 11, (y - 36) / 612);
    g.strokeStyle = y > 648 ? '#7fb35e' : '#b9db9e';
    g.lineWidth = w;
    g.beginPath(); g.moveTo(256, y); g.lineTo(256, y - 4); g.stroke();
  }
  g.fillStyle = 'rgba(120,175,90,0.9)'; g.fill(pet);

  const al = makeCanvas(LCW, LCH); const a = al.getContext('2d');
  a.fillStyle = '#000'; a.fillRect(0, 0, LCW, LCH);
  a.fillStyle = '#fff'; a.fill(blade); a.fill(pet);

  const map = canvasTex(col);
  const alphaMap = new THREE.CanvasTexture(al);
  const m3 = mat.make.physical({
    map, alphaMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45,
    bumpMap: map, bumpScale: 0.012,
  });
  const geo = new THREE.PlaneGeometry(LEAF_W, LEAF_H, 28, 44);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, leafDisp(pos.getX(i), pos.getY(i)));
  geo.computeVertexNormals();
  const m = mesh(geo, m3);
  m.rotation.x = -Math.PI / 2;
  m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap, alphaTest: 0.5 });
  const grp = new THREE.Group();
  grp.add(m);

  // 20 punch spots: inside the blade, away from the midrib and the edge
  const spots = [];
  let tries = 0;
  const rr = 34;
  const probes = [[0, 0], [rr, 0], [-rr, 0], [0, rr], [0, -rr], [rr * 0.7, rr * 0.7], [-rr * 0.7, rr * 0.7], [rr * 0.7, -rr * 0.7], [-rr * 0.7, -rr * 0.7]];
  while (spots.length < 20 && tries < 8000) {
    tries++;
    const x = rand(50, 462), y = rand(70, 610);
    if (Math.abs(x - 256) < 40) continue;
    if (!probes.every(([dx, dy]) => a.isPointInPath(blade, x + dx, y + dy))) continue;
    if (spots.some((s) => Math.hypot(s.x - x, s.y - y) < 58)) continue;
    spots.push({ x, y });
  }
  spots.sort((p, q) => (p.x < 256) - (q.x < 256) || p.y - q.y);
  spots.forEach((s) => {
    const lx = (s.x / LCW - 0.5) * LEAF_W, ly = (0.5 - s.y / LCH) * LEAF_H;
    s.local = V3(lx, ly, leafDisp(lx, ly));
  });
  return {
    group: grp, mesh: m, spots,
    punchHole(s) {
      a.fillStyle = '#000';
      a.beginPath(); a.arc(s.x, s.y, 22, 0, Math.PI * 2); a.fill();
      alphaMap.needsUpdate = true;
    },
  };
}

const DISK_GEO = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 24); DISK_GEO.userData.shared = true;
const diskMats = new WeakMap(); // per material set, shared by every disk
/** A leaf disk punched from the leaf, 6 mm across. shade 0..2 picks one of three greens.
 *  setInfiltrated(true) darkens it, as when water replaces the air in the leaf. */
export function makeLeafDisk(mat, { shade = 0 } = {}) {
  if (!diskMats.has(mat)) {
    const sh = (m) => { m.userData.shared = true; return m; };
    diskMats.set(mat, {
      green: [0x2c6e28, 0x27632a, 0x347a2e].map((c) => sh(mat.make.solid(c, 0.5))),
      wet: sh(mat.make.solid(0x143f17, 0.3)),
    });
  }
  const M = diskMats.get(mat);
  const m = mesh(DISK_GEO, M.green[shade % 3]);
  return { group: m, mesh: m, setInfiltrated(on) { m.material = on ? M.wet : M.green[shade % 3]; } };
}
