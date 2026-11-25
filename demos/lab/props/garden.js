/* For growing and crossing plants: a pot of soil, a plant tag, a fine paintbrush and a glassine
 * pollination bag. From the Mendel lab.
 *
 *   const pot = makePot(mat, { label: 'yy', sub: 'green seeds' });   // anchors.soil: centre of the soil
 *   makePlantTag(mat, { title: 'F1 #1' })    // origin at the tip pushed into the soil
 *   makeBrush(mat)                           // origin under the bristle tip, lying flat, handle along -z
 *   makePollinationBag(mat)                  // origin at the mouth, body along +y
 */
import * as THREE from 'three';
import { V3, clamp, lerp } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh, lathe, wrapLabel } from '../core/geometry.js';
import { makeCanvas, canvasTex, FONT, roundRect } from '../core/canvas.js';
import { tapeLabel } from '../core/labels.js';
import { toLinear } from '../materials.js';
import { ss, geoCache, matCache, texCache, curve, sheet, weld, addMorphs, remapUV } from './shapes.js';

/* ---------- pot ---------- */
function terracottaTex() {
  return texCache('terracotta', () => {
    const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    const R = seeded(12);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = R() < 0.6 ? `rgba(90,40,20,${0.03 + R() * 0.06})` : `rgba(255,235,210,${0.04 + R() * 0.08})`;
      g.beginPath(); g.ellipse(R() * W, R() * H, 1 + R() * 6, 1 + R() * 3, R() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(60,25,10,${0.2 + R() * 0.3})`; g.fillRect(R() * W, R() * H, 1.4, 1.4); }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
function soilTex() {
  return texCache('soil', () => {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
    g.fillStyle = '#3a291d'; g.fillRect(0, 0, S, S);
    const R = seeded(21);
    for (let i = 0; i < 4000; i++) {
      g.fillStyle = R() < 0.55 ? `rgba(20,12,6,${0.2 + R() * 0.4})` : `rgba(110,80,55,${0.15 + R() * 0.3})`;
      g.beginPath(); g.ellipse(R() * S, R() * S, 1 + R() * 4, 1 + R() * 3, R() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 90; i++) {   // bark
      g.fillStyle = `rgba(${95 + R() * 30},${55 + R() * 20},${32 + R() * 12},0.8)`;
      g.beginPath(); g.ellipse(R() * S, R() * S, 2 + R() * 4, 1 + R() * 1.6, R() * 3, 0, 7); g.fill();
    }
    for (let i = 0; i < 110; i++) {  // perlite
      g.fillStyle = `rgba(225,222,212,${0.55 + R() * 0.35})`;
      g.beginPath(); g.ellipse(R() * S, R() * S, 1 + R() * 2, 0.8 + R() * 1.6, R() * 3, 0, 7); g.fill();
    }
    return canvasTex(c);
  });
}

/** Terracotta pot, 13 cm across and 11 tall by default, rolled rim, dark potting mix. Origin at the
 *  base centre. anchors.soil is the centre of the soil surface. color tints the clay (a dark
 *  nursery pot: '#2f3133'). A tape label goes on the front if label is given. */
export function makePot(mat, { r = 6.5, h = 11, color = '#b8643c', soil = true, label, sub, labelColor = '#7c3aed', seed = 1 } = {}) {
  const g = new THREE.Group();
  const rb = r * 0.74, rt = r * 0.93, wall = 0.42, lip = 1.7;
  const prof = [[0.001, 0.015], [rb - 0.25, 0.015], [rb, 0.25], [rt, h - lip], [r - 0.03, h - lip + 0.04], [r, h - lip + 0.25],
    [r, h - 0.18], [r - 0.1, h - 0.02], [r - 0.3, h], [r - wall - 0.06, h - 0.06], [r - wall - 0.1, h - 0.4], [rt - wall, h - lip], [rb - wall, 0.6], [0.001, 0.6]];
  const clay = matCache(mat, 'clay' + color, () => mat.make.standard({ color: toLinear(color), map: terracottaTex(), bumpMap: terracottaTex(), bumpScale: 0.6, roughness: 0.9 }));
  g.add(mesh(lathe(prof, 72), clay));
  const outerR = (y) => rb + ((rt - rb) * (y - 0.25)) / (h - lip - 0.25);
  const innerR = (y) => lerp(rt - wall, r - wall - 0.1, clamp((y - (h - lip)) / (lip - 0.4)));
  const sy = h - 1.45;
  if (soil) {
    const R = seeded(seed), rs = innerR(sy) - 0.03;
    const clods = [...Array(46)].map(() => { const a = R() * 6.283, d = Math.sqrt(R()) * rs; return [Math.cos(a) * d, Math.sin(a) * d, (R() - 0.4) * 0.22, 0.25 + R() * 0.5]; });
    const geo = sheet(72, 16, (a, b, out) => {
      const ang = a * Math.PI * 2, x = Math.cos(ang) * b * rs, z = Math.sin(ang) * b * rs;
      let y = 0.04 * Math.sin(x * 3.1 + z * 1.7) * Math.cos(z * 2.6 - x);
      clods.forEach(([cx, cz, hgt, w]) => { y += hgt * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (w * w)); });
      y *= ss(0.04, 0.3, b);                 // level where the plant goes in
      y += 0.18 * ss(0.85, 1, b);           // the mix rides up the wall
      out.set(x, sy + y, z);
    });
    remapUV(weld(geo), (u, v) => [0.5 + 0.5 * v * Math.cos(u * Math.PI * 2) * 0.9, 0.5 + 0.5 * v * Math.sin(u * Math.PI * 2) * 0.9]);
    const dirt = matCache(mat, 'soil', () => mat.make.standard({ color: 0xffffff, map: soilTex(), bumpMap: soilTex(), bumpScale: 3, roughness: 0.97 }));
    g.add(mesh(geo, dirt, { cast: false }));
  }
  if (label) {
    const y0 = h * 0.3, y1 = y0 + 2.5;
    g.add(wrapLabel({ rTop: outerR(y1) + 0.02, rBot: outerR(y0) + 0.02, y0, y1, arc: 1.15, draw: (c, w, hh) => tapeLabel(c, w, hh, label, sub, labelColor) }));
  }
  return { group: g, r, h, anchors: { soil: V3(0, sy, 0), top: V3(0, h, 0) } };
}


/* ---------- plant tag ---------- */
function fit(c, text, x, y, size, weight, maxW) {
  c.font = `${weight} ${size}px ${FONT}`;
  const w = c.measureText(text).width;
  if (w > maxW) c.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
  c.fillText(text, x, y);
}
/** White plastic plant stake with a printed title, 2.4 × 11 cm. Origin at the pointed tip. */
export function makePlantTag(mat, { title = '', sub = '', color = '#7c3aed', w = 2.4, h = 11 } = {}) {
  const s = new THREE.Shape();
  s.moveTo(0, 0); s.lineTo(w / 2, 1.6); s.lineTo(w / 2, h - 0.35); s.quadraticCurveTo(w / 2, h, w / 2 - 0.35, h);
  s.lineTo(-w / 2 + 0.35, h); s.quadraticCurveTo(-w / 2, h, -w / 2, h - 0.35); s.lineTo(-w / 2, 1.6); s.closePath();
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1 });
  geo.translate(0, 0, -0.04);
  const g = new THREE.Group();
  g.add(mesh(geo, matCache(mat, 'tagPlastic', () => mat.make.physical({ color: toLinear('#f4f4f1'), roughness: 0.4, clearcoat: 0.3 }))));
  const pw = w - 0.24, ph = 3.9, cw = 256, ch = Math.round((cw * ph) / pw);
  const c = makeCanvas(cw, ch), x = c.getContext('2d');
  x.clearRect(0, 0, cw, ch);
  x.fillStyle = color; roundRect(x, 6, 6, cw - 12, ch * 0.16, 14); x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = '#16202b'; fit(x, title, cw / 2, ch * (sub ? 0.45 : 0.55), ch * 0.2, 800, cw - 24);
  if (sub) { x.fillStyle = '#556373'; fit(x, sub, cw / 2, ch * 0.72, ch * 0.12, 600, cw - 24); }
  const print = mesh(new THREE.PlaneGeometry(pw, ph), mat.make.standard({ map: canvasTex(c), transparent: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2 }), { cast: false });
  print.position.set(0, h - 0.25 - ph / 2, 0.062);
  print.renderOrder = 5;
  print.userData.noSketch = true;
  g.add(print);
  return { group: g, anchors: { top: V3(0, h, 0) } };
}

/* ---------- fine paintbrush ---------- */
function bristleTex() {
  return texCache('bristle', () => {
    const c = makeCanvas(64, 128), g = c.getContext('2d'), R = seeded(3);
    g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 60; i++) { g.fillStyle = R() < 0.5 ? 'rgba(0,0,0,0.25)' : 'rgba(255,255,255,0.5)'; g.fillRect(R() * 64, 0, 1, 128); }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
/** Fine round artist's brush, 16 cm: wooden handle, nickel ferrule, dark pointed bristles. Origin
 *  under the bristle tip, lying flat, the handle along -z; anchors.tip is the point itself.
 *  setPollen(0..1) loads the tip with pollen. */
export function makeBrush(mat, { color = '#c8975f' } = {}) {
  const A = 0.29, g = new THREE.Group(), b = new THREE.Group();
  b.rotation.x = -Math.PI / 2;      // built along +y from the tip
  b.position.y = A;
  g.add(b);
  b.add(mesh(lathe([[0.001, 0], [0.025, 0.1], [0.07, 0.42], [0.105, 0.82], [0.118, 1.05], [0.112, 1.3], [0.001, 1.3]], 20),
    mat.make.physical({ color: toLinear('#3a2a20'), map: bristleTex(), roughness: 0.45, clearcoat: 0.3 })));
  b.add(mesh(lathe([[0.112, 1.2], [0.14, 1.3], [0.155, 1.7], [0.15, 2.45], [0.168, 2.55], [0.17, 2.85], [0.15, 2.85]], 24), mat.chrome));
  b.add(mesh(lathe([[0.001, 2.8], [0.17, 2.8], [0.22, 4], [0.27, 6.2], [0.24, 10], [0.15, 14.8], [0.12, 15.8], [0.06, 16], [0.001, 16]], 24),
    mat.make.physical({ color: toLinear(color), roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 })));
  const dust = texCache('dust', () => {
    const c = makeCanvas(64, 128), x = c.getContext('2d'), R = seeded(14);
    x.fillStyle = '#555'; x.fillRect(0, 0, 64, 128);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${0.5 + R() * 0.5})`; x.beginPath(); x.arc(R() * 64, R() * 128, 0.8 + R() * 1.4, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
  const pollenM = mat.make.standard({ color: toLinear('#f1c048'), alphaMap: dust, bumpMap: dust, bumpScale: 1, roughness: 0.95, transparent: true, opacity: 0, depthWrite: false });
  const load = mesh(lathe([[0.001, -0.01], [0.04, 0.08], [0.085, 0.36], [0.112, 0.62], [0.001, 0.66]], 16), pollenM, { cast: false });
  load.scale.set(1.12, 1, 1.12);
  b.add(load);
  const out = {
    group: g, anchors: { tip: V3(0, A, 0) },
    setPollen(p) { p = clamp(p); load.material.opacity = 0.95 * Math.sqrt(p); load.visible = p > 0.01; load.scale.y = lerp(0.5, 1, p); },
  };
  out.setPollen(0);
  return out;
}

/* ---------- glassine pollination bag ---------- */
function crinkleTex() {
  return texCache('crinkle', () => {
    const S = 256, c = makeCanvas(S, S), g = c.getContext('2d'), R = seeded(6);
    g.fillStyle = '#ececec'; g.fillRect(0, 0, S, S);
    g.filter = 'blur(1.2px)';
    for (let i = 0; i < 120; i++) {
      g.strokeStyle = R() < 0.5 ? `rgba(255,255,255,${0.2 + R() * 0.3})` : `rgba(170,170,170,${0.12 + R() * 0.18})`;
      g.lineWidth = 1 + R() * 2;
      const x = R() * S, y = R() * S, a = R() * 3, l = 10 + R() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
    return canvasTex(c);
  });
}
/** Small glassine bag, w × h cm: waxy, translucent off-white. Origin at the centre of the mouth,
 *  the body along +y to the sealed end. setOpen 0 flat, 1 opened out; setTie(0..1) gathers the
 *  mouth and twists a tie round it. */
export function makePollinationBag(mat, { w = 5, h = 8 } = {}) {
  const geo = geoCache(`bag${w}:${h}`, () => {
    const shape = (open, cinch) => sheet(40, 22, (a, t, out) => {
      const ang = a * Math.PI * 2, crk = 0.035 * Math.sin(ang * 7 + t * 19) * Math.sin(t * 31 + ang * 3) + 0.02 * Math.sin(ang * 13 - t * 11);
      let rx = (w / 2) * (open ? 0.86 : 1), rz = open ? (w / 2) * 0.72 * Math.sqrt(Math.max(0, 1 - t ** 5)) : 0.05 * (1 - t);
      if (cinch) { const f = lerp(0.07, 1, ss(0.02, 0.3, t)); rx *= f; rz = Math.max(rz * f, rx * 0.6 * (1 - ss(0.02, 0.3, t))); }
      out.set(Math.cos(ang) * (rx + crk * (open ? 1 : 0.4)), t * h, Math.sin(ang) * (rz + crk * (open ? 1 : 0.15)));
    });
    const base = weld(shape(false, false));
    return addMorphs(base, [weld(shape(true, false)), weld(shape(true, true))], true);
  });
  const g = new THREE.Group();
  const paper = mat.make.physical({ color: toLinear('#ede5cf'), map: crinkleTex(), bumpMap: crinkleTex(), bumpScale: 1.5, roughness: 0.35, clearcoat: 0.5, clearcoatRoughness: 0.3, transparent: true, opacity: 0.62, depthWrite: false, side: THREE.DoubleSide });
  const bag = mesh(geo, paper);
  bag.renderOrder = 3;
  g.add(bag);
  // the sealed end: a folded strip
  const seal = mesh(new THREE.BoxGeometry(w * 1.0, 0.5, 0.03), paper, { cast: false });
  seal.position.y = h - 0.25; seal.renderOrder = 3;
  g.add(seal);
  const tie = new THREE.Group();
  const tieM = matCache(mat, 'twistTie', () => mat.make.standard({ color: toLinear('#3e8a4c'), roughness: 0.6 }));
  const band = mesh(new THREE.TorusGeometry(1, 0.045, 5, 24), tieM);
  band.rotation.x = Math.PI / 2;
  tie.add(band);
  const tw = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16; tw.push(V3(1 + t * 1.3, 0.05 * Math.sin(t * 25), 0.05 * Math.cos(t * 25))); }
  const twisted = mesh(new THREE.TubeGeometry(curve(tw), 24, 0.04, 4), tieM);
  tie.add(twisted);
  tie.position.y = 0.45;
  g.add(tie);
  const st = { o: 0, t: 0 };
  function pose() {
    bag.morphTargetInfluences[0] = st.o;
    bag.morphTargetInfluences[1] = st.t;
    seal.scale.x = lerp(1, 0.86, st.o);
    tie.visible = st.t > 0.02;
    const r = lerp(Math.max(0.3, (w / 2) * 0.86 * lerp(0.1, 1, st.o) * 0.2 + 0.25), 0.32, st.t);
    band.scale.set(r, r, 1 + 4 * (1 - st.t));
    twisted.position.x = r - 1;
  }
  pose();
  return {
    group: g, anchors: { mouth: V3() },
    setOpen(v) { st.o = clamp(v); pose(); },
    setTie(v) { st.t = clamp(v); pose(); },
  };
}
