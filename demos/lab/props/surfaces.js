/* Surfaces and set dressing: the lab bench (speckled worktop, top surface at y = 0,
 * cabinet below), a silicone work mat to use instead of the bench (not on top of it),
 * a paper towel you can lay on either, a shallow tray, a waste bin (from the
 * BloodType lab) and a printed bench card (from Ecoli). Origins at the centre of the base. */
import * as THREE from 'three';
import { rand } from '../core/random.js';
import { makeCanvas, canvasTex, FONT } from '../core/canvas.js';
import { mesh, roundedRectShape, rbox } from '../core/geometry.js';
import { toLinear } from '../materials.js';
import { V2, V3 } from '../core/math.js';

function speckleTexture(base, dots, n, rep) {
  const c = makeCanvas(512, 512); const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < n; i++) {
    g.fillStyle = dots[i % dots.length];
    g.globalAlpha = rand(0.12, 0.4);
    g.beginPath(); g.arc(rand(0, 512), rand(0, 512), rand(0.4, 1.5), 0, 7); g.fill();
  }
  const t = canvasTex(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep[0], rep[1]);
  return t;
}

export function makeBench(mat, { w = 152, d = 76, color = '#8b9eb4' } = {}) {
  const g = new THREE.Group();
  const top = mesh(new THREE.BoxGeometry(w, 3, d), mat.make.standard({
    map: speckleTexture(color, ['#71849a', '#a2b3c6', '#d6dfe9', '#64778c'], 2600, [5, 2.5]), roughness: 0.55,
  }), { cast: false });
  top.position.y = -1.5;
  g.add(top);
  const cab = mesh(new THREE.BoxGeometry(w - 6, 42, d - 6), mat.make.standard({ color: 0xd3dae1, roughness: 0.7 }), { cast: false });
  cab.position.set(0, -24, -1);
  g.add(cab);
  const doorW = (w - 6) / 5;
  const seamMat = mat.make.standard({ color: 0xc9d0d8 });
  for (let i = -2; i <= 2; i++) {
    const seam = mesh(new THREE.BoxGeometry(0.25, 40, 0.2), seamMat, { cast: false });
    seam.position.set(i * doorW, -24, d / 2 - 3.95);
    g.add(seam);
    if (i < 2) {
      const handle = mesh(new THREE.BoxGeometry(7, 0.6, 0.8), mat.steel, { cast: false });
      handle.position.set(i * doorW + doorW / 2, -6.5, d / 2 - 3.6);
      g.add(handle);
    }
  }
  return { group: g, anchors: {}, size: { w, d } };
}

/** Silicone work mat: an alternative work surface to makeBench (top at y = 0). */
export function makeWorkMat(mat, { w = 34, d = 26, color = 0xc6d8cc } = {}) {
  const geo = new THREE.ShapeGeometry(roundedRectShape(w, d, 2));
  geo.rotateX(-Math.PI / 2);
  const m = mesh(geo, mat.make.standard({ color, roughness: 0.92 }), { cast: false });
  m.position.y = 0.015;
  const g = new THREE.Group(); g.add(m);
  return { group: g, anchors: {} };
}

export function makePaperTowel(mat, { w = 17, d = 14 } = {}) {
  const c = makeCanvas(256, 256); const x = c.getContext('2d');
  x.fillStyle = '#fbfbf8'; x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(160,160,150,0.18)';
  for (let y = 8; y < 256; y += 16) for (let px = (y / 16) % 2 ? 8 : 0; px < 256; px += 16) { x.beginPath(); x.arc(px, y, 2.2, 0, 7); x.fill(); }
  const t = canvasTex(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 3);
  const m = mesh(new THREE.BoxGeometry(w, 0.06, d), mat.make.standard({ map: t, roughness: 1 }), { cast: false });
  m.position.y = 0.03;
  const g = new THREE.Group(); g.add(m);
  return { group: g, anchors: {} };
}

/** Shallow sky-blue plastic tray. */
export function makeTray(mat, { w = 17, d = 10.5, h = 1.1, color = toLinear('#8fc3ea') } = {}) {
  const th = 0.25;
  const m = mat.make.solid(color, 0.55);
  const g = new THREE.Group();
  g.add(mesh(rbox(w, 0.18, d, 0.8), m, { cast: false }));
  [[0, d / 2 - th / 2, w, th], [0, -d / 2 + th / 2, w, th], [w / 2 - th / 2, 0, th, d], [-w / 2 + th / 2, 0, th, d]].forEach(([x, z, ww, dd]) => {
    const wall = mesh(new THREE.BoxGeometry(ww, h, dd), m, { cast: false });
    wall.position.set(x, h / 2, z);
    g.add(wall);
  });
  return { group: g, anchors: { floor: V3(0, 0.18, 0) } };
}

/** symbol: 'biohazard' or null. color/inside/rim: body, interior and rim colours. */
export function makeWasteBin(mat, { label = 'BIOHAZARD', symbol = 'biohazard', color = 0xad150d, inside = 0x5a120d, rim: rimColor = 0x9e170f, ink = '#1c0d0b' } = {}) {
  const g = new THREE.Group();
  const H = 6.5;
  const body = mesh(new THREE.LatheGeometry([[0, 0], [3.0, 0], [3.15, 0.2], [3.6, 6.4], [3.6, H]].map((p) => V2(p[0], p[1])), 56),
    mat.make.standard({ color, roughness: 0.62, envMapIntensity: 0.2 }));
  g.add(body);
  const insideMat = mat.make.standard({ color: inside, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.2 });
  g.add(mesh(new THREE.LatheGeometry([[0, 0.6], [2.95, 0.6], [3.42, 6.45]].map((p) => V2(p[0], p[1])), 56), insideMat, { cast: false }));
  const floor = mesh(new THREE.CircleGeometry(3.0, 40), insideMat, { cast: false });
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.62;
  g.add(floor);
  const rim = mesh(new THREE.TorusGeometry(3.55, 0.22, 16, 64), mat.make.standard({ color: rimColor, roughness: 0.5, envMapIntensity: 0.25 }));
  rim.rotation.x = Math.PI / 2; rim.position.y = H;
  g.add(rim);

  const c = makeCanvas(640, 320); const x = c.getContext('2d');
  x.fillStyle = ink; x.textAlign = 'center'; x.textBaseline = 'middle';
  if (symbol === 'biohazard') {
    drawBiohazard(x, 320, 128, 92, ink);
    x.font = `800 46px ${FONT}`; x.fillText(label, 320, 270);
  } else {
    x.font = `800 ${label.length > 6 ? 72 : 92}px ${FONT}`; x.fillText(label, 320, 160);
  }
  const lab = mesh(new THREE.CylinderGeometry(3.52, 3.3, 3.4, 56, 1, true, -Math.PI * 0.35, Math.PI * 0.7),
    mat.make.standard({ map: canvasTex(c), transparent: true, roughness: 0.5, alphaTest: 0.05 }), { cast: false });
  lab.position.y = 3.6;
  g.add(lab);
  return { group: g, h: H, anchors: { top: V3(0, H, 0), floor: V3(0, 0.62, 0) }, radius: 3.8 };
}

function drawBiohazard(c, cx, cy, R, color) {
  const off = makeCanvas(Math.ceil(R * 2.6), Math.ceil(R * 2.6));
  const o = off.getContext('2d');
  const m = off.width / 2;
  o.translate(m, m);
  o.fillStyle = color; o.strokeStyle = color;
  const angs = [0, 1, 2].map((i) => -Math.PI / 2 + (i * Math.PI * 2) / 3);
  angs.forEach((a) => { o.beginPath(); o.arc(Math.cos(a) * R * 0.5, Math.sin(a) * R * 0.5, R * 0.56, 0, Math.PI * 2); o.fill(); });
  o.lineWidth = R * 0.13;
  o.beginPath(); o.arc(0, 0, R * 0.52, 0, Math.PI * 2); o.stroke();
  o.globalCompositeOperation = 'destination-out';
  angs.forEach((a) => { o.beginPath(); o.arc(Math.cos(a) * R * 0.66, Math.sin(a) * R * 0.66, R * 0.4, 0, Math.PI * 2); o.fill(); });
  o.beginPath(); o.arc(0, 0, R * 0.16, 0, Math.PI * 2); o.fill();
  angs.forEach((a) => { o.save(); o.rotate(a); o.fillRect(0, -R * 0.035, R * 0.36, R * 0.07); o.restore(); });
  c.drawImage(off, cx - m, cy - m);
}

/** A printed card lying on the bench, naming what stands behind it (from Ecoli's plate
 *  cards). title, sub: two lines of text; subColor: the second line's colour. 7 × 2 cm. */
export function makeBenchCard(mat, { title, sub, subColor = '#64748b', w = 7.1, d = 2 } = {}) {
  const c = makeCanvas(640, 180); const x = c.getContext('2d');
  const r = 28;
  x.beginPath(); x.moveTo(4 + r, 4); x.arcTo(636, 4, 636, 176, r); x.arcTo(636, 176, 4, 176, r); x.arcTo(4, 176, 4, 4, r); x.arcTo(4, 4, 636, 4, r); x.closePath();
  x.fillStyle = '#ffffff'; x.fill(); x.lineWidth = 3; x.strokeStyle = 'rgba(15,23,42,.1)'; x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#0f172a'; x.font = `800 ${sub ? 54 : 64}px ${FONT}`; x.fillText(title, 320, sub ? 70 : 92);
  if (sub) { x.font = `600 38px ${FONT}`; x.fillStyle = subColor; x.fillText(sub, 320, 128); }
  const card = mesh(new THREE.PlaneGeometry(w, d), mat.make.standard({ map: canvasTex(c), transparent: true, roughness: 0.8 }), { cast: false });
  card.rotation.x = -Math.PI / 2; card.position.y = 0.03;
  const g = new THREE.Group(); g.add(card);
  return { group: g, anchors: {} };
}
