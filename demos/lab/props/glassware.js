/* Glassware and clear plasticware: beaker, plastic cup, petri dish, test tube, a
 * funnel with a coffee filter, and a 1.5 mL microcentrifuge tube.
 *
 * Every container with a liquid has `liquid` (core/liquid.js): setVolume(mL),
 * setLevel(cm), setFraction(f), setPour(k), surfaceY() and so on, the same on all of them.
 *
 *   const b = makeBeaker(mat, { cap: 250, label: 'Water', sub: 'control' });
 *   b.liquid.setVolume(150);
 *   b.anchors.spout           // pouring lip, local space (+x side of the rim)
 *
 *   const tube = makeTestTube(mat);
 *   const filtrate = tube.addLayer(0xef7593, 0.85);   // each layer is a liquid
 *   const alcohol  = tube.addLayer(0xc9e3fb, 0.42);
 *   filtrate.setRange(0, 0.42);  alcohol.setRange(0.42, 0.72);   // fractions of the inner height
 *
 * Origins: centre of the base, except the test tube and the microcentrifuge tube
 * (lowest point of the bottom) and the funnel (the tip of its stem, so it sits in a tube's mouth).
 */
import * as THREE from 'three';
import { V2, V3, worldOf, clamp } from '../core/math.js';
import { FONT } from '../core/canvas.js';
import { tapeLabel } from '../core/labels.js';
import { mesh, wrapLabel, lathe } from '../core/geometry.js';
import { makeLiquid } from '../core/liquid.js';
import { toLinear } from '../materials.js';

/** A ring of mat.glassEdge: the denser lip or foot of a vessel, at radius r and height y. */
function edgeRing(mat, r, y, tube) {
  const m = mesh(new THREE.TorusGeometry(r, tube, 8, 64), mat.glassEdge, { cast: false });
  m.rotation.x = Math.PI / 2; m.position.y = y; m.renderOrder = 4;
  return m;
}

export function makeBeaker(mat, { r = 3.6, h = 9.6, level = 5.3, cap = 250, label, sub, color = '#0891b2', liquidColor = 0x5aa9e6 } = {}) {
  const g = new THREE.Group();
  const t = 0.14;
  const pts = [
    V2(0.001, 0), V2(r - 0.35, 0), V2(r - 0.06, 0.08), V2(r, 0.35), V2(r, h), V2(r + 0.12, h + 0.06),
    V2(r + 0.14, h + 0.16), V2(r + 0.02, h + 0.2), V2(r - t, h), V2(r - t, t + 0.3), V2(r - t - 0.3, t), V2(0.001, t),
  ];
  const shell = mesh(new THREE.LatheGeometry(pts, 64), mat.wideGlass, { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  g.add(edgeRing(mat, r + 0.06, h + 0.12, 0.08), edgeRing(mat, r - 0.04, 0.22, 0.09));
  const area = Math.PI * (r - t) * (r - t);
  // graduations
  g.add(wrapLabel({
    rTop: r + 0.012, rBot: r + 0.012, y0: 0, y1: h, arc: 1.5, center: -0.35, w: 256, h: 512, order: 4,
    draw: (c, w, hh) => {
      c.clearRect(0, 0, w, hh);
      c.strokeStyle = 'rgba(70,92,115,0.8)'; c.fillStyle = 'rgba(70,92,115,0.85)';
      c.lineWidth = 3; c.font = `600 22px ${FONT}`; c.textBaseline = 'middle';
      const step = cap >= 200 ? 25 : 10;
      for (let mL = step * 2; mL <= cap; mL += step) {
        const y = t + mL / area; const cy = (1 - y / h) * hh;
        const major = mL % (step * 2) === 0;
        c.beginPath(); c.moveTo(60, cy); c.lineTo(major ? 130 : 100, cy); c.stroke();
        if (major) c.fillText(String(mL), 140, cy);
      }
      c.font = `600 20px ${FONT}`;
      c.fillText(`${cap} mL`, 60, (1 - (h - 0.8) / h) * hh);
    },
  }));
  if (label) {
    g.add(wrapLabel({
      rTop: r + 0.02, rBot: r + 0.02, y0: h * 0.3, y1: h * 0.3 + Math.min(2.4, h * 0.3), arc: 1.25, center: 0.55, order: 6,
      draw: (c, w, hh) => tapeLabel(c, w, hh, label, sub, color),
    }));
  }
  const liquid = makeLiquid(mat, g, { wall: [[r - t, t], [r - t, h]], lip: V3(r + 0.12, h + 0.16, 0), color: liquidColor });
  liquid.setLevel(level);
  return {
    group: g, r, h, t, liquid,
    anchors: { spout: V3(r + 0.12, h + 0.16, 0), top: V3(0, h, 0), floor: V3(0, t, 0) },
  };
}

export function makeCup(mat, { label, sub, color = '#94a3b8', liquidColor = 0x5aa9e6 } = {}) {
  const g = new THREE.Group();
  const rb = 2.9, rt = 3.9, h = 9.5, w = 0.07, base = 0.28;
  const pts = [
    V2(0.001, 0), V2(rb - 0.2, 0), V2(rb - 0.02, 0.08), V2(rb + 0.02, 0.5), V2(rb + 0.08, 0.55), V2(rt, h),
    V2(rt - w, h), V2(rb - w + 0.08, 0.6), V2(rb - w - 0.1, base), V2(0.001, base),
  ];
  const shell = mesh(new THREE.LatheGeometry(pts, 64), mat.widePlastic, { cast: false });
  shell.renderOrder = 3;
  g.add(shell);
  g.add(edgeRing(mat, rt, h, 0.1), edgeRing(mat, rb + 0.03, 0.5, 0.06));
  const rAt = (y) => rb + (rt - rb) * (y / h);
  if (label) {
    const ly0 = 6.3, ly1 = 8.0;
    g.add(wrapLabel({
      rTop: rAt(ly1) + 0.03, rBot: rAt(ly0) + 0.03, y0: ly0, y1: ly1, arc: 1.3, center: 0, order: 6,
      draw: (c, ww, hh) => tapeLabel(c, ww, hh, label, sub, color),
    }));
  }
  const rWall = (y) => rb - w - 0.02 + (rt - rb) * (y / h);
  const liquid = makeLiquid(mat, g, { wall: [[rWall(base), base], [rWall(h), h]], inset: 0.03, color: liquidColor });
  return {
    group: g, h, rb, rt, base, rAt, liquid,
    anchors: { top: V3(0, h, 0), floor: V3(0, base, 0) },
  };
}

/** Glass petri dish (base only), r = outer radius (5 cm: a 10 cm dish). */
export function makeDish(mat, { r = 5 } = {}) {
  const g = new THREE.Group();
  const m = mesh(new THREE.LatheGeometry([V2(0.001, 0), V2(r - 0.1, 0), V2(r, 0.06), V2(r, 1.1), V2(r - 0.13, 1.1), V2(r - 0.13, 0.12), V2(0.001, 0.12)], 64), mat.wideGlass, { cast: false });
  m.renderOrder = 3;
  g.add(m, edgeRing(mat, r - 0.06, 1.1, 0.055), edgeRing(mat, r - 0.05, 0.05, 0.05));
  return { group: g, anchors: { floor: V3(0, 0.12, 0) }, radius: r - 0.1 };
}

export function makeTestTube(mat, { r = 1.3, h = 13 } = {}) {
  const g = new THREE.Group();
  const outer = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; outer.push([r * Math.sin(a), r - r * Math.cos(a)]); }
  outer.push([r, h], [r + 0.15, h + 0.06], [r + 0.1, h + 0.16], [r - 0.06, h]);
  const glass = mesh(lathe(outer, 48), mat.glass, { cast: false });
  glass.renderOrder = 3;
  g.add(glass, edgeRing(mat, r + 0.04, h + 0.08, 0.08));
  const ri = r - 0.15, in0 = r - ri, inH = h - 0.2 - in0;
  const inner = [[0, in0]];
  for (let i = 1; i <= 10; i++) { const a = (i / 10) * Math.PI / 2; inner.push([ri * Math.sin(a), r - ri * Math.cos(a)]); }
  inner.push([ri, h - 0.2]);
  const api = {
    group: g, glass, r, h,
    anchors: { top: V3(0, h, 0), floor: V3(0, in0, 0) },
    /** World y of a fraction (0..1) of the inner height. */
    levelY(f) { return worldOf(g, V3(0, in0 + f * inH, 0)).y; },
    /** A liquid layer; set it with setRange(f0, f1). Layers stack: give each its own range. */
    addLayer(color, opacity = 0.8) {
      return makeLiquid(mat, g, { wall: inner, inset: 0, segments: 40, color, opacity, matOpts: { roughness: 0.1, clearcoat: 0.7 } });
    },
  };
  return api;
}

export function makeFunnel(mat, { filter = true, filterColor = toLinear('#cfa978'), glassOpts = {}, liquidColor = 0xd23a5a } = {}) {
  const g = new THREE.Group();
  const glass = mesh(lathe([[0.42, 0], [0.48, 3], [3.2, 6.8], [3.42, 7.0], [3.3, 7.06]], 56),
    mat.make.wideGlass({ color: '#6aaee6', opacity: 0.55, edge: 0.8, ...glassOpts }), { cast: false }); // blue-tinted; glassOpts override
  glass.renderOrder = 3;
  g.add(glass);
  let paper = null;
  if (filter) {
    const fg = lathe([[0.26, 3.25], [0.42, 3.4], [3.0, 7.15], [3.1, 7.7]], 96);
    const p = fg.attributes.position;
    for (let i = 0; i < p.count; i++) { // pleats
      const x = p.getX(i), z = p.getZ(i), y = p.getY(i);
      const k = 1 + 0.06 * Math.sin(Math.atan2(z, x) * 16) * clamp((y - 3.3) / 2);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    fg.computeVertexNormals();
    paper = mesh(fg, mat.make.standard({ color: filterColor, roughness: 0.95, side: THREE.DoubleSide }), { receive: false });
    g.add(paper);
  }
  // liquid in the cone, inside the filter paper; liquid.setFraction(f) fills 0..1 of the cone
  const liquid = makeLiquid(mat, g, { wall: [[0.38, 3.4], [2.85, 7.05]], inset: 0, color: liquidColor, opacity: 0.85, matOpts: { roughness: 0.1, clearcoat: 0.7 } });
  return {
    group: g, glass, paper, liquid,
    anchors: { stem: V3(0, 0, 0), cone: V3(0, 3.4, 0), top: V3(0, 7.06, 0) },
  };
}

/** 1.5 mL microcentrifuge tube (from Ecoli), 5.2 cm tall, with a hinged snap cap.
 *  Origin at the tip. setCap(0..1) opens the cap (1 = flipped back on its hinge).
 *  label: a short word printed on a strip of tape ('+', '−'); color: the cap and tape tab. */
export function makeMicroTube(mat, { color = toLinear('#6366f1'), label, liquidColor = 0xcfe6ff } = {}) {
  const K = 5;
  const g = new THREE.Group();
  const OUT = [[0, 0], [0.05, 0.02], [0.12, 0.15], [0.17, 0.38], [0.185, 0.42], [0.195, 1.0], [0.225, 1.0], [0.225, 1.035], [0.19, 1.035], [0.18, 1.0]];
  const IN = [[0, 0.035], [0.04, 0.05], [0.105, 0.165], [0.152, 0.385], [0.165, 0.425], [0.174, 1.0]];
  const body = mesh(lathe(OUT.map(([r, y]) => [r * K, y * K]), 40), mat.make.plastic({ color: '#e3ecf6', opacity: 0.3 }), { cast: false });
  body.renderOrder = 3;
  g.add(body);
  const liquid = makeLiquid(mat, g, { wall: IN.map(([r, y]) => [r * K, y * K]), inset: 0, segments: 28, color: liquidColor, opacity: 0.6, matOpts: { roughness: 0.2, clearcoat: 0.5 } });
  const capMat = mat.make.solid(color, 0.35);
  const pivot = new THREE.Group();
  pivot.position.set(0, 1.035 * K, -1.175);
  const cap = mesh(new THREE.CylinderGeometry(1.175, 1.175, 0.35, 32), capMat); cap.position.set(0, 0.175, 1.175);
  const plug = mesh(new THREE.CylinderGeometry(0.83, 0.83, 0.45, 24), capMat); plug.position.set(0, -0.15, 1.175);
  const tab = mesh(new THREE.BoxGeometry(0.75, 0.15, 0.6), capMat); tab.position.set(0, 0.1, 2.5);
  const hinge = mesh(new THREE.BoxGeometry(0.6, 0.15, 0.3), capMat); hinge.position.set(0, 0, -0.05);
  pivot.add(cap, plug, tab, hinge);
  g.add(pivot);
  if (label) {
    g.add(wrapLabel({
      rTop: 0.99, rBot: 0.99, y0: 2.6, y1: 4.1, arc: 2.0, center: 0, w: 256, h: 192, order: 6,
      draw: (c, w, h) => tapeLabel(c, w, h, label, null, '#' + new THREE.Color(color).convertLinearToSRGB().getHexString()),
    }));
  }
  return {
    group: g, liquid, capPivot: pivot, h: 1.035 * K,
    anchors: { top: V3(0, 1.0 * K, 0), floor: V3(0, 0.035 * K, 0) },
    capOpen: 0,
    /** 0 closed … 1 open (flipped back on its hinge). */
    setCap(k) { this.capOpen = k; pivot.rotation.x = -1.95 * k; },
  };
}

/** Watch glass (from OnionRoot): a shallow spherical cap, r = rim radius (4.5: a 9 cm glass),
 *  sag = depth at the centre. Origin at the lowest point. liquid.setLevel(cm) fills it from
 *  the centre out, and liquid.setColor() changes what is in it. */
export function makeWatchGlass(mat, { r = 4.5, sag = 1.1, liquidColor = 0xdcecff } = {}) {
  const R = (r * r + sag * sag) / (2 * sag), th = Math.asin(r / R), t = 0.1;
  const cap = (rad, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = (i / n) * th; return [rad * Math.sin(a), R - rad * Math.cos(a)]; });
  const g = new THREE.Group();
  const outer = cap(R), inner = cap(R - t).reverse();
  const shell = mesh(lathe([...outer, ...inner], 64), mat.wideGlass, { cast: false });
  shell.renderOrder = 3;
  const rimY = R - R * Math.cos(th);
  g.add(shell, edgeRing(mat, r - 0.03, rimY, 0.05));
  const liquid = makeLiquid(mat, g, { wall: cap(R - t - 0.02), inset: 0, color: liquidColor, opacity: 0.42, matOpts: { roughness: 0.05 } });
  liquid.setLevel(0);
  return { group: g, liquid, r, anchors: { floor: V3(0, t, 0), top: V3(0, rimY, 0) } };
}
