/* The detailed fruit fly, Drosophila melanogaster, drawn to be sexed at 40×.
 *
 *   const fly = makeFly(mat, { sex: 'f'|'m', eye: 'red'|'white', seed, detail: 1 })
 *     origin under the thorax, body along +x (head +x), dorsal +y, 1 unit = 1 cm
 *   fly.group  fly.length (0.25 female, 0.20 male)  fly.sex  fly.eye
 *   fly.setPose(k)     0 standing, wings folded; 1 anesthetized on its side, legs curled, wings apart
 *   fly.setTwitch(t)   a sleeping fly's leg twitches, from a clock in seconds
 *   fly.setEye(eye)
 *
 * Built in mm inside a scaled group, then sized so head to abdomen tip is exactly `length`.
 * Every fly of a sex shares its body geometry and materials (geoCache, matCache); only the legs
 * are a fly's own, rewritten in place when the pose or a twitch changes them. detail 0.5 halves
 * the segment counts, for a crowd. The seed picks which side it falls on and how its legs curl.
 *
 * Exaggerated so they read at 40×: bristles ~1.5× real thickness, sex comb teeth ~2× real length. */
import * as THREE from 'three';
import { V3, clamp, lerp, smooth } from '../core/math.js';
import { seeded } from '../core/random.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { toLinear } from '../materials.js';
import { geoCache, matCache, texCache, sheet, merge, tint, remapUV, weld, lc } from './shapes.js';

export const FLY_COLORS = {
  red: '#a8231c', white: '#efe9dc', body: '#c9a36a', band: '#3b2a1a', wing: '#e8eef2', vein: '#7a6a55',
};
const D2R = Math.PI / 180;

/* s scales head and thorax; the abdomen carries the rest of the size difference. */
const SPEC = {
  f: { s: 1, abLen: 1.34, abR: 0.43, segs: 7, length: 0.25, wing: 2.05 },
  m: { s: 0.9, abLen: 0.9, abR: 0.38, segs: 6, length: 0.2, wing: 1.72 },
};

/* ---------- textures ---------- */

/** Grey chitin detail, hue from vertex colours: microchaetae in rows, faint dorsal stripes.
 *  u runs round the body (dorsal midline at 0.5), v along it (front at the top). */
function chitinTex() {
  return texCache('fly-chitin', () => {
    const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'), R = seeded(31);
    g.fillStyle = '#e6e2dc'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(80,60,40,${0.04 + R() * 0.06})` : `rgba(255,250,240,${0.05 + R() * 0.08})`;
      g.beginPath(); g.ellipse(R() * W, R() * H, 1 + R() * 5, 1 + R() * 3, R() * 3, 0, 7); g.fill();
    }
    // dorsocentral stripes, darker, either side of the midline
    for (const x of [0.43, 0.57, 0.35, 0.65]) {
      const grd = g.createLinearGradient((x - 0.035) * W, 0, (x + 0.035) * W, 0);
      grd.addColorStop(0, 'rgba(70,45,25,0)'); grd.addColorStop(0.5, 'rgba(70,45,25,0.22)'); grd.addColorStop(1, 'rgba(70,45,25,0)');
      g.fillStyle = grd; g.fillRect((x - 0.035) * W, H * 0.15, 0.07 * W, H * 0.7);
    }
    // pleural sutures: the plates on the side of the thorax
    g.strokeStyle = 'rgba(70,45,25,0.35)'; g.lineWidth = 2;
    for (const side of [0.16, 0.84]) {
      const k = side < 0.5 ? 1 : -1;
      g.beginPath(); g.moveTo(side * W, H * 0.25); g.bezierCurveTo((side + k * 0.05) * W, H * 0.45, (side - k * 0.02) * W, H * 0.6, (side + k * 0.06) * W, H * 0.8); g.stroke();
      g.beginPath(); g.moveTo((side - k * 0.07) * W, H * 0.5); g.quadraticCurveTo(side * W, H * 0.48, (side + k * 0.08) * W, H * 0.56); g.stroke();
    }
    // microchaetae: short dark hairs in loose longitudinal rows, pointing back
    for (let row = 0; row < 22; row++) {
      const x0 = 0.2 + row * 0.6 / 21;
      for (let y = H * 0.12; y < H * 0.88; y += 4 + R() * 3) {
        const x = (x0 + (R() - 0.5) * 0.008) * W;
        g.strokeStyle = `rgba(30,20,12,${0.3 + R() * 0.25})`; g.lineWidth = 0.9;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5), y + 2); g.stroke();
      }
    }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}

/** The abdomen: u along it (x px, base at 0), v round it (y px), ventral midline at v = 0 and 1.
 *  Female: a separate dark band on the back of each tergite, ovipositor plates at the tip.
 *  Male: the last two tergites solid black, wrapping over the tip, and the genital arch. */
function abdomenTex(sex) {
  return texCache('fly-abdomen-' + sex, () => {
    const W = 512, H = 256, c = makeCanvas(W, H), g = c.getContext('2d'), R = seeded(sex === 'f' ? 41 : 43);
    const img = g.createImageData(W, H), d = img.data, n = SPEC[sex].segs;
    const tan = [200, 160, 96], pale = [222, 196, 140], band = [59, 42, 26], tip = sex === 'f' ? [150, 104, 60] : [70, 34, 18];
    const mix = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k)];
    for (let y = 0; y < H; y++) {
      const v = 1 - y / (H - 1), dors = -Math.cos(v * Math.PI * 2);   // 1 dorsal, -1 ventral
      for (let x = 0; x < W; x++) {
        const u = x / (W - 1);
        const su = clamp((u - 0.04) / 0.88) * n, k = Math.min(n - 1, Math.floor(su)), f = su - k;
        let col = mix(pale, tan, smooth(clamp((dors + 0.55) / 0.5)));
        const tergite = clamp((dors + 0.42) / 0.12);
        if (sex === 'm' && k >= n - 2 && u > 0.04) {
          col = mix(col, band, Math.max(tergite, clamp((dors + 0.75) / 0.2) * 0.9));
        } else if (u > 0.04 && u < 0.93) {
          const edge = 0.52 - 0.14 * dors - 0.06 * Math.exp(-Math.pow((dors - 1) * 9, 2));   // wider on the back, a notch on the midline
          const inBand = smooth(clamp((f - edge) / 0.07)) * (1 - smooth(clamp((f - 0.97) / 0.03)));
          col = mix(col, band, inBand * tergite * 0.94);
        }
        if (u > 0.93) col = mix(col, tip, smooth(clamp((u - 0.93) / 0.04)));
        // segment seams: a thin dark crease where each tergite overlaps the next
        const seam = Math.exp(-Math.pow((f - 0.99) / 0.025, 2)) + Math.exp(-Math.pow(f / 0.02, 2));
        col = mix(col, [60, 40, 25], seam * 0.35 * clamp(dors + 0.8));
        const nz = 1 + (R() - 0.5) * 0.06, i = (y * W + x) * 4;
        d[i] = col[0] * nz; d[i + 1] = col[1] * nz; d[i + 2] = col[2] * nz; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // hairs: a row of short bristles along each tergite's rear edge, and sparse ones on it
    for (let k = 0; k < n; k++) {
      const x0 = (0.04 + (k + 0.96) / n * 0.88) * W;
      for (let y = 0; y < H; y += 3 + R() * 3) {
        const dors = -Math.cos((1 - y / H) * Math.PI * 2);
        if (dors < -0.4) continue;
        g.strokeStyle = `rgba(25,15,8,${0.5 + R() * 0.4})`; g.lineWidth = 1;
        g.beginPath(); g.moveTo(x0 - 3 + R() * 2, y); g.lineTo(x0 + 3 + R() * 2, y + (R() - 0.5) * 2); g.stroke();
      }
    }
    for (let i = 0; i < 700; i++) {
      const x = R() * W * 0.92, y = R() * H;
      g.strokeStyle = `rgba(30,20,10,${0.25 + R() * 0.25})`; g.lineWidth = 0.8;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + 2.5, y + (R() - 0.5)); g.stroke();
    }
    return canvasTex(c);
  });
}

/** Compound eye facets: a hex lattice of domed ommatidia in the eye's disk uv, ~34 across. */
function eyeNormalTex() {
  return texCache('fly-eye-normal', () => {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data;
    hexLoop(S, 34, (i, dx, dy, r) => {
      const groove = smooth(clamp((r - 0.82) / 0.18));
      const k = 0.62 * (1 - groove * 0.4);
      let nx = dx * k, ny = dy * k;
      const nz = Math.sqrt(Math.max(0.05, 1 - nx * nx - ny * ny));
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (-ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    });
    g.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    t.anisotropy = 8;
    return t;
  });
}
function eyeColorTex(eye) {
  return texCache('fly-eye-' + eye, () => {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d'), img = g.createImageData(S, S), d = img.data, R = seeded(eye === 'red' ? 7 : 9);
    const base = new THREE.Color(FLY_COLORS[eye]);
    // the red is darkened from the hex: clearcoat and the domed facets add their own light back
    const lit = eye === 'red' ? [base.r * 205, base.g * 190, base.b * 190] : [226, 220, 206];
    const dark = eye === 'red' ? [55, 8, 6] : [170, 162, 146];
    const facet = new Map();
    hexLoop(S, 34, (i, dx, dy, r, id, px, py) => {
      if (!facet.has(id)) facet.set(id, 0.92 + R() * 0.14);
      const rim = smooth(clamp((Math.hypot(px - 0.5, py - 0.5) - 0.38) / 0.12));
      const k = clamp(facet.get(id) * (1 - smooth(clamp((r - 0.8) / 0.2)) * 0.45) * (1 - rim * 0.35));
      for (let j = 0; j < 3; j++) d[i + j] = lerp(dark[j], lit[j], k);
      d[i + 3] = 255;
    });
    g.putImageData(img, 0, 0);
    return canvasTex(c);
  });
}
/** Calls fn for every pixel with its offset from the nearest hex centre (in half-spacings). */
function hexLoop(S, across, fn) {
  const a = 1 / across, h = a * Math.sqrt(3) / 2;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const px = (x + 0.5) / S, py = (y + 0.5) / S, j0 = Math.round(py / h);
    let best = 9, bx = 0, by = 0, id = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) {
      const off = (j & 1) * a / 2, ii = Math.round((px - off) / a), cx = ii * a + off, cy = j * h;
      const dd = (px - cx) ** 2 + (py - cy) ** 2;
      if (dd < best) { best = dd; bx = px - cx; by = py - cy; id = j * 1000 + ii; }
    }
    fn((y * S + x) * 4, bx / (a / 2), by / (a / 2), Math.sqrt(best) / (a / 2), id, px, py);
  }
}

/** Wing membrane and veins, in wing space: x = s (0 hinge, 1 tip), y = (w + 0.3) / 0.6. */
function wingTex() {
  return texCache('fly-wing', () => {
    const W = 1024, H = 512, c = makeCanvas(W, H), g = c.getContext('2d'), R = seeded(51);
    const P = (s, w) => [s * W, (1 - (w + 0.3) / 0.6) * H];
    const path = (pts) => { g.beginPath(); pts.forEach(([s, w], i) => (i ? g.lineTo(...P(s, w)) : g.moveTo(...P(s, w)))); };
    const outline = [];
    for (let i = 0; i <= 60; i++) outline.push([i / 60, wingEdge(i / 60, 1)]);
    for (let i = 60; i >= 0; i--) outline.push([i / 60, wingEdge(i / 60, -1)]);
    g.save(); path(outline); g.closePath(); g.clip();
    g.fillStyle = 'rgba(226,234,240,0.3)'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(120,110,95,${0.05 + R() * 0.08})`; g.fillRect(R() * W, R() * H, 1, 1); }   // microtrichia
    g.restore();
    const vein = (pts, w, a = 0.9) => {
      g.strokeStyle = `rgba(104,88,66,${a})`; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath();
      const pp = pts.map(([s, w2]) => P(s, w2));
      g.moveTo(...pp[0]);
      for (let i = 1; i < pp.length - 1; i++) g.quadraticCurveTo(...pp[i], (pp[i][0] + pp[i + 1][0]) / 2, (pp[i][1] + pp[i + 1][1]) / 2);
      g.lineTo(...pp[pp.length - 1]); g.stroke();
    };
    const costa = []; for (let i = 0; i <= 30; i++) { const s = 0.02 + i / 30 * 0.94; costa.push([s, wingEdge(s, 1) - 0.004]); }
    vein(costa, 7);
    vein([[0.04, 0.05], [0.2, 0.12], [0.36, 0.15], [0.47, wingEdge(0.47, 1) - 0.01]], 5);                 // L1
    vein([[0.05, 0.03], [0.3, 0.075], [0.6, 0.12], [0.8, wingEdge(0.8, 1) - 0.006]], 4);                   // L2
    vein([[0.05, 0.015], [0.4, 0.02], [0.75, 0.04], [0.99, wingEdge(0.99, 1) * 0.3]], 4);                  // L3
    vein([[0.06, -0.005], [0.4, -0.04], [0.72, -0.07], [0.965, wingEdge(0.965, -1) + 0.006]], 4);          // L4
    vein([[0.07, -0.02], [0.3, -0.07], [0.55, -0.12], [0.73, wingEdge(0.73, -1) + 0.006]], 4);             // L5
    vein([[0.06, -0.04], [0.18, -0.09], [0.3, wingEdge(0.3, -1) + 0.02]], 3, 0.6);                         // L6
    vein([[0.43, 0.022], [0.43, -0.05]], 3.5);                                                               // anterior cross vein
    vein([[0.63, -0.075], [0.6, -0.135]], 3.5);                                                              // posterior cross vein
    // marginal fringe, longest on the trailing edge
    for (let i = 0; i <= 260; i++) {
      const s = 0.12 + i / 260 * 0.88, w = wingEdge(s, -1), [x, y] = P(s, w), L = 6 + (1 - s) * 6;
      g.strokeStyle = 'rgba(100,90,75,0.55)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x - L * 0.4, y + L); g.stroke();
    }
    const t = canvasTex(c);
    t.anisotropy = 8;
    return t;
  });
}
/** The wing's edge as a fraction of its length: anterior (side 1) or posterior (-1) at s. */
function wingEdge(s, side) {
  const s0 = 0.58, wMax = side > 0 ? 0.19 : 0.235;
  const w = s < s0 ? wMax * (0.18 + 0.82 * smooth(s / s0)) : wMax * Math.sqrt(Math.max(0, 1 - ((s - s0) / (1 - s0)) ** 2.2));
  return 0.02 + side * w;
}

/* ---------- geometry ---------- */

/** A unit sphere with its poles on ±x and its uv seam under the belly. */
function ball(seg, rings) {
  const g = new THREE.SphereGeometry(1, seg, rings);
  g.rotateZ(-Math.PI / 2); g.rotateX(Math.PI);
  return g;
}
const posMap = (g, fn) => {
  const p = g.attributes.position, v = V3();
  for (let i = 0; i < p.count; i++) { fn(v.fromBufferAttribute(p, i), i); p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals();
  return weld(g);
};

/** A tapered tube through pts (radii r per point), sides round. Normals radial. With colors. */
function strand(pts, r, sides, hex) {
  const n = pts.length, pos = [], nor = [], idx = [], t = V3(), e1 = V3(), e2 = V3(), up = V3(0, 1, 0), q = V3();
  for (let i = 0; i < n; i++) {
    t.subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
    e1.crossVectors(t, Math.abs(t.y) > 0.9 ? V3(1, 0, 0) : up).normalize();
    e2.crossVectors(t, e1);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      q.copy(e1).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
      pos.push(pts[i].x + q.x * r[i], pts[i].y + q.y * r[i], pts[i].z + q.z * r[i]);
      nor.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < n - 1; i++) for (let k = 0; k < sides; k++) {
    const a = i * sides + k, b = i * sides + (k + 1) % sides, c2 = a + sides, d = b + sides;
    idx.push(a, b, d, a, d, c2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return tint(g, hex);
}
/** A bristle: from p along d, curving toward bend, tapering to a point. */
function bristle(p, d, L, r0, bend = V3(0, 0, 0), hex = '#1c130c') {
  const pts = [], r = [], dd = d.clone().normalize();
  for (let i = 0; i <= 3; i++) {
    const k = i / 3;
    pts.push(p.clone().addScaledVector(dd, L * k).addScaledVector(bend, L * k * k));
    r.push(r0 * (1 - k * 0.88));
  }
  return strand(pts, r, 3, hex);
}
function blob(c, rad, hex, seg = 8) {
  const g = new THREE.SphereGeometry(1, seg, Math.max(4, seg * 0.6 | 0));
  g.scale(rad[0], rad[1], rad[2]); g.translate(c.x, c.y, c.z);
  g.deleteAttribute('uv');
  return tint(g, hex);
}

const HEAD = (s) => ({ c: [0.62 * s, 0.1 * s, 0], r: [0.22 * s, 0.34 * s, 0.37 * s] });

/** Head, thorax and scutellum, in the torso frame (thorax centre at the origin), mm. */
function chitinGeo(sex, det) {
  return geoCache(`fly-chitin-${sex}-${det}`, () => {
    const s = SPEC[sex].s, seg = Math.round(30 * det), rings = Math.round(22 * det);
    const thorax = posMap(ball(seg, rings), (v) => {
      if (v.y < 0) v.y *= 0.8;
      v.y += 0.08 * (1 - v.x * v.x);              // the humped mesonotum
      v.set(v.x * 0.56 * s, v.y * 0.42 * s, v.z * 0.4 * s);
    });
    tint(thorax, '#a07848');
    const scut = posMap(ball(Math.round(18 * det), Math.round(10 * det)), (v) => {
      if (v.y < 0) v.y *= 0.2;
      v.set((v.x * 0.2 - 0.42) * s, (v.y * 0.1 + 0.33) * s, v.z * 0.22 * s);
    });
    tint(scut, '#94683c');
    const H = HEAD(s);
    const head = posMap(ball(seg, rings), (v) => {
      if (v.x < 0) v.x *= 0.7;                     // flatter at the back
      v.set(v.x * H.r[0] + H.c[0], v.y * H.r[1] + H.c[1], v.z * H.r[2]);
    });
    const hc = head.attributes.position, col = new Float32Array(hc.count * 3), frons = lc('#c0682e'), cheek = lc('#b88a50'), tmp = new THREE.Color();
    for (let i = 0; i < hc.count; i++) {
      const fx = clamp((hc.getX(i) / s - 0.66) / 0.15), fz = 1 - clamp(Math.abs(hc.getZ(i) / s) / 0.2);
      tmp.copy(cheek).lerp(frons, fx * fz);
      col.set([tmp.r, tmp.g, tmp.b], i * 3);
    }
    head.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return merge([thorax, scut, head]);
  });
}

/** Both compound eyes: ellipsoid caps on the sides of the head, uv a disk for the facet maps. */
function eyesGeo(sex, det) {
  return geoCache(`fly-eyes-${sex}-${det}`, () => {
    const s = SPEC[sex].s, nu = Math.round(12 * det), nv = Math.round(28 * det);
    const H = HEAD(s);
    const cap = (side) => {
      const C = [0.63 * s, 0.1 * s, side * 0.13 * s], Rr = [0.27 * s, 0.38 * s, 0.3 * s], kx = 1.1, ky = 1.45;
      const g = sheet(nu, nv, (u, v, p) => {
        const rho = Math.max(u, 0.002), ph = v * Math.PI * 2;
        const dx = rho * Math.cos(ph) * kx, dy = rho * Math.sin(ph) * ky, n = Math.hypot(dx, dy, 1);
        const x = C[0] + (Rr[0] * dx) / n, y = C[1] + (Rr[1] * dy) / n, z = Math.abs(C[2] + (side * Rr[2]) / n);
        // the rim melts into the head's surface, so eye and head meet without a seam
        const zh = H.r[2] * Math.sqrt(Math.max(0, 1 - ((x - H.c[0]) / H.r[0]) ** 2 - ((y - H.c[1]) / H.r[1]) ** 2)) - 0.004;
        p.set(x, y, side * lerp(z, Math.min(z, zh), smooth(clamp((rho - 0.72) / 0.28))));
      }, side < 0);
      remapUV(g, (u, v) => [0.5 + 0.5 * u * Math.cos(v * Math.PI * 2), 0.5 + 0.5 * u * Math.sin(v * Math.PI * 2)]);
      return g;
    };
    return merge([cap(1), cap(-1)]);
  });
}

function abdomenShape(sex) {
  const { s, abLen, abR } = SPEC[sex], x0 = -0.3 * s, n = SPEC[sex].segs;
  const prof = sex === 'f'
    ? (u) => (u < 0.36 ? 0.5 + 0.5 * smooth(u / 0.36) : 1 - 0.95 * Math.pow((u - 0.36) / 0.64, 1.7))
    : (u) => (u < 0.4 ? 0.52 + 0.48 * smooth(u / 0.4) : Math.sqrt(Math.max(0, 1 - Math.pow((u - 0.4) / 0.6, 2.2))));
  return {
    x: (u) => x0 - u * abLen,
    y: (u) => -0.08 * s - (sex === 'f' ? 0.1 : 0.16) * u * u,
    r: (u) => {
      const su = clamp((u - 0.04) / 0.88) * n, f = su - Math.floor(su);
      const ripple = u > 0.04 && u < 0.92 ? 1 + 0.035 * f - 0.02 : 1;
      return abR * prof(u) * ripple;
    },
  };
}
function abdomenGeo(sex, det) {
  return geoCache(`fly-abdomen-${sex}-${det}`, () => {
    const A = abdomenShape(sex), nu = Math.round(60 * det), nv = Math.round(28 * det);
    return sheet(nu, nv, (u, v, p) => {
      const th = v * Math.PI * 2, r = Math.max(A.r(u), 0.002);
      p.set(A.x(u), A.y(u) - Math.cos(th) * r * 0.97, Math.sin(th) * r);
    }, true);
  });
}

/** Bristles, antennae with aristae, ocelli, proboscis, halteres and the genitalia, merged. */
function detailGeo(sex, det) {
  return geoCache(`fly-detail-${sex}-${det}`, () => {
    const s = SPEC[sex].s, parts = [], back = V3(-1, 0, 0);
    const T = { r: [0.56 * s, 0.42 * s, 0.4 * s] };
    const onThorax = (a, phi, side) => {
      const f = Math.sqrt(1 - a * a), p = V3(a * T.r[0], Math.cos(phi * D2R) * T.r[1] * f + 0.08 * s * (1 - a * a), side * Math.sin(phi * D2R) * T.r[2] * f);
      const n = V3(p.x / T.r[0] ** 2, p.y / T.r[1] ** 2, p.z / T.r[2] ** 2).normalize();
      return { p: p.addScaledVector(n, -0.01), n };
    };
    const thoracic = [
      [0.62, 62, 0.15], [0.55, 76, 0.12], [0.36, 82, 0.2], [0.06, 84, 0.17], [0.16, 55, 0.2], [-0.26, 58, 0.24],
      [-0.56, 60, 0.22], [-0.06, 18, 0.27], [-0.46, 20, 0.33], [0.1, 116, 0.15], [-0.22, 120, 0.17],
    ];
    for (const side of [1, -1]) {
      for (const [a, phi, L] of thoracic) {
        const { p, n } = onThorax(a, phi, side);
        parts.push(bristle(p, n.clone().multiplyScalar(0.55).add(back), L * s, 0.012 * s, V3(0, -0.12, 0)));
      }
      // scutellars: lateral pair spreading, apical pair crossing behind
      parts.push(bristle(V3(-0.36 * s, 0.4 * s, side * 0.16 * s), V3(-1, 0.25, side * 0.55), 0.27 * s, 0.012 * s, V3(0, -0.1, 0)));
      parts.push(bristle(V3(-0.56 * s, 0.37 * s, side * 0.06 * s), V3(-1, 0.32, -side * 0.18), 0.37 * s, 0.013 * s, V3(0, -0.15, 0)));
      // head: three orbitals along the eye's inner margin, inner and outer verticals, postverticals crossing
      for (let k = 0; k < 3; k++) {
        const x = (0.74 - k * 0.08) * s;
        parts.push(bristle(V3(x, 0.4 * s, side * 0.15 * s), V3(k === 1 ? 0.6 : -0.7, 0.8, side * 0.2), (0.12 + k * 0.02) * s, 0.008 * s, V3(0, -0.05, 0)));
      }
      parts.push(bristle(V3(0.5 * s, 0.42 * s, side * 0.2 * s), V3(-0.8, 0.7, side * 0.5), 0.2 * s, 0.01 * s, V3(0, -0.1, 0)));
      parts.push(bristle(V3(0.48 * s, 0.38 * s, side * 0.3 * s), V3(-0.5, 0.6, side * 0.9), 0.17 * s, 0.009 * s, V3(0, -0.08, 0)));
      parts.push(bristle(V3(0.47 * s, 0.4 * s, side * 0.05 * s), V3(-0.9, 0.5, -side * 0.35), 0.14 * s, 0.008 * s));
      parts.push(bristle(V3(0.6 * s, 0.44 * s, side * 0.04 * s), V3(0.7, 0.5, side * 0.5), 0.13 * s, 0.008 * s));   // ocellar
      // vibrissa under the face
      parts.push(bristle(V3(0.78 * s, -0.12 * s, side * 0.13 * s), V3(0.7, -0.2, side * 0.3), 0.12 * s, 0.008 * s, V3(0, 0.08, 0)));
      // antenna: scape, pedicel, the oval third segment, and the plumed arista
      const az = side * 0.08 * s;
      parts.push(blob(V3(0.82 * s, 0.17 * s, az), [0.035 * s, 0.035 * s, 0.035 * s], '#b98a52', 6));
      parts.push(blob(V3(0.86 * s, 0.13 * s, az * 1.15), [0.05 * s, 0.05 * s, 0.045 * s], '#a8743f', 8));
      parts.push(blob(V3(0.89 * s, 0.02 * s, az * 1.35), [0.06 * s, 0.11 * s, 0.045 * s], '#c4904f', 10));
      const a0 = V3(0.91 * s, 0.08 * s, az * 1.6), ad = V3(0.62, 0.5, side * 0.6).normalize(), aL = 0.3 * s;
      parts.push(bristle(a0, ad, aL, 0.006 * s, V3(0, 0.04, 0), '#3a2a1c'));
      for (let k = 1; k <= 9; k++) {
        const t = 0.25 + k * 0.075, p = a0.clone().addScaledVector(ad, aL * t), up = k % 3 !== 0;
        const bd = ad.clone().multiplyScalar(0.8).add(V3(0, up ? 0.8 : -0.8, 0)).normalize();
        parts.push(bristle(p, bd, (0.05 + (1 - t) * 0.06) * s, 0.003 * s, V3(0, 0, 0), '#3a2a1c'));
      }
      // haltere: a pale stalk and knob behind the wing
      const h0 = V3(-0.3 * s, 0.1 * s, side * 0.3 * s), hd = V3(-0.75, 0.2, side * 0.62).normalize();
      parts.push(strand([h0, h0.clone().addScaledVector(hd, 0.12 * s)], [0.016 * s, 0.011 * s], 5, '#d2b47c'));
      parts.push(blob(h0.clone().addScaledVector(hd, 0.15 * s), [0.045 * s, 0.04 * s, 0.04 * s], '#dcc08a', 8));
    }
    // ocelli: three lenses in a dark triangle on the vertex
    parts.push(blob(V3(0.54 * s, 0.43 * s, 0), [0.08 * s, 0.025 * s, 0.07 * s], '#3a2414', 8));
    for (const [x, z] of [[0.6, 0], [0.5, 0.045], [0.5, -0.045]]) parts.push(blob(V3(x * s, 0.45 * s, z * s), [0.022 * s, 0.016 * s, 0.022 * s], '#d8a24a', 6));
    // proboscis folded under the head, the labellum at its end
    parts.push(blob(V3(0.62 * s, -0.24 * s, 0), [0.11 * s, 0.07 * s, 0.1 * s], '#c9a06a', 10));
    parts.push(blob(V3(0.7 * s, -0.3 * s, 0), [0.07 * s, 0.05 * s, 0.09 * s], '#b8905c', 10));
    // genitalia at the abdomen tip
    const A = abdomenShape(sex), xt = A.x(1), yt = A.y(1);
    if (sex === 'f') {
      for (const side of [1, -1]) parts.push(blob(V3(xt - 0.03, yt - 0.02, side * 0.025), [0.09, 0.03, 0.022], '#8a5a30', 8));
      for (let k = 0; k < 8; k++) parts.push(bristle(V3(xt - 0.05 - k * 0.012, yt - 0.04, (k % 2 ? 1 : -1) * 0.03), V3(-0.3, -1, 0), 0.03, 0.004, V3(0, 0, 0), '#2a1a0e'));
    } else {
      const c = V3(xt + 0.12, yt - 0.13, 0);
      const arch = new THREE.TorusGeometry(0.075, 0.03, 6, 14, Math.PI * 1.3);
      arch.rotateY(Math.PI / 2); arch.rotateX(-0.3); arch.translate(c.x, c.y, c.z); arch.deleteAttribute('uv');
      parts.push(tint(arch, '#3a1a0c'));
      parts.push(blob(c.clone().add(V3(-0.02, -0.02, 0)), [0.05, 0.05, 0.06], '#5a2a12', 8));
      for (let k = 0; k < 6; k++) parts.push(bristle(c.clone().add(V3(0, -0.05, (k - 2.5) * 0.02)), V3(0.3, -1, 0), 0.04, 0.004, V3(0, 0, 0), '#1a0e06'));
    }
    return merge(parts);
  });
}

/** One wing in its pivot's frame: hinge at the origin, length along -x, anterior edge +z. */
function wingGeo(sex, det) {
  return geoCache(`fly-wing-${sex}-${det}`, () => {
    const L = SPEC[sex].wing;
    const g = sheet(Math.round(24 * det), Math.round(8 * det), (u, v, p) => {
      const a = wingEdge(u, 1), b = wingEdge(u, -1), w = b + (a - b) * v;
      p.set(-u * L, 0.025 * L * Math.sin(Math.PI * v) * Math.sin(Math.PI * Math.min(1, u * 1.2)), w * L);
    });
    remapUV(g, (u, v) => {
      const a = wingEdge(u, 1), b = wingEdge(u, -1), w = b + (a - b) * v;
      return [u, (w + 0.3) / 0.6];
    });
    return g;
  });
}

/* ---------- legs ---------- */

/* [len, radius] per segment: coxa, trochanter, femur, tibia, five tarsomeres, claw. Angles are
 * pitch in the leg's vertical plane, degrees above horizontal-outward; yaw turns that plane
 * forward. stand's tibia is re-solved so every foot meets the ground. */
const LEGS = [
  { base: [0.3, -0.28, 0.1], yaw: [52, 40],
    seg: [[0.2, 0.055], [0.06, 0.042], [0.48, 0.042], [0.42, 0.032], [0.16, 0.026], [0.08, 0.022], [0.065, 0.021], [0.05, 0.02], [0.07, 0.02], [0.035, 0.013]],
    stand: [-70, -40, 30, -60, -25, -12, -6, -3, -2, -40], curl: [-84, -75, -48, -188, -226, -250, -268, -282, -292, -320] },
  { base: [0.02, -0.34, 0.13], yaw: [-4, -14],
    seg: [[0.14, 0.05], [0.06, 0.04], [0.52, 0.04], [0.5, 0.03], [0.24, 0.023], [0.1, 0.021], [0.075, 0.02], [0.055, 0.02], [0.07, 0.02], [0.035, 0.013]],
    stand: [-75, -40, 32, -65, -28, -12, -6, -3, -2, -40], curl: [-86, -75, -55, -192, -228, -252, -270, -284, -294, -320] },
  { base: [-0.2, -0.32, 0.14], yaw: [-55, -52],
    seg: [[0.14, 0.05], [0.06, 0.04], [0.56, 0.042], [0.54, 0.031], [0.22, 0.023], [0.1, 0.021], [0.075, 0.02], [0.055, 0.02], [0.07, 0.02], [0.035, 0.013]],
    stand: [-70, -40, 35, -68, -30, -12, -6, -3, -2, -40], curl: [-86, -75, -60, -195, -230, -254, -272, -286, -296, -320] },
];
const LEG_COL = ['#c09358', '#bb8c52', '#c4985c', '#b88c52', '#a47640', '#9c703c', '#966a38', '#8e6434', '#82592e', '#140c06'];

function makeLegs(sex, det, rnd) {
  const s = SPEC[sex].s, sides = det >= 1 ? 6 : 4, nSeg = 10, comb = sex === 'm' ? 10 : 0;
  const legs = [];
  for (const side of [1, -1]) LEGS.forEach((L, pair) => {
    const jit = L.curl.map(() => (rnd() - 0.5) * 16);
    legs.push({ L, pair, side, jit, yawJ: (rnd() - 0.5) * 16, phase: rnd() * 100, rate: 0.6 + rnd() * 0.9, stand: L.stand.slice() });
  });
  const perLeg = nSeg * 2 * sides, combV = comb * 4;
  const vCount = legs.length * perLeg + 2 * combV;
  const pos = new Float32Array(vCount * 3), nor = new Float32Array(vCount * 3), col = new Float32Array(vCount * 3), idx = [];
  let v = 0;
  legs.forEach((lg) => {
    lg.v0 = v;
    for (let k = 0; k < nSeg; k++) {
      const c = lc(LEG_COL[k]), cd = c.clone().multiplyScalar(k >= 2 && k <= 4 ? 0.72 : 0.9);   // darker toward each joint
      for (let j = 0; j < 2 * sides; j++) { const cc = j < sides ? c : cd; col.set([cc.r, cc.g, cc.b], (v + j) * 3); }
      for (let j = 0; j < sides; j++) {
        const a = v + j, b = v + (j + 1) % sides, c2 = a + sides, d = b + sides;
        idx.push(a, b, d, a, d, c2);
      }
      v += 2 * sides;
    }
    if (comb && lg.pair === 0) {
      lg.c0 = v;
      const c = lc('#050302');
      for (let t = 0; t < comb; t++) {
        for (let j = 0; j < 4; j++) col.set([c.r, c.g, c.b], (v + j) * 3);
        idx.push(v, v + 1, v + 3, v + 1, v + 2, v + 3, v + 2, v, v + 3);
        v += 4;
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);

  const up = V3(0, 1, 0), h = V3(), n = V3(), dir = V3(), e2 = V3(), p = V3(), q = V3(), a0 = V3(), a1 = V3();
  /** Joint points of a leg for pose k and twitch tw, written to out (array of V3). */
  function chain(lg, k, tw, out) {
    const L = lg.L, yaw = lerp(L.yaw[0], L.yaw[1] + lg.yawJ, k) * D2R;
    h.set(Math.sin(yaw), 0, lg.side * Math.cos(yaw));
    p.set(L.base[0] * s, L.base[1] * s, lg.side * L.base[2] * s);
    out[0].copy(p);
    for (let i = 0; i < nSeg; i++) {
      let ang = lerp(lg.stand[i], L.curl[i] + (i > 1 ? lg.jit[i] : 0), k);
      if (tw) ang += tw * [0, 0, 14, -22, 18, 14, 10, 8, 6, 0][i];
      ang *= D2R;
      dir.copy(h).multiplyScalar(Math.cos(ang)).addScaledVector(up, Math.sin(ang));
      p.addScaledVector(dir, L.seg[i][0] * s);
      out[i + 1].copy(p);
    }
    return out;
  }
  const pts = [...Array(nSeg + 1)].map(() => V3());
  // solve each standing tibia angle so the last tarsus meets y = -H
  const H = 0.8 * s;
  legs.forEach((lg) => {
    let lo = -85, hi = -30;
    for (let it = 0; it < 24; it++) {
      lg.stand[3] = (lo + hi) / 2;
      chain(lg, 0, 0, pts);
      if (pts[nSeg - 1].y < -H) hi = lg.stand[3]; else lo = lg.stand[3];   // a steeper tibia reaches lower
    }
  });

  function write(lg, k, tw) {
    chain(lg, k, tw, pts);
    const L = lg.L;
    const yaw = lerp(L.yaw[0], L.yaw[1] + lg.yawJ, k) * D2R;
    h.set(Math.sin(yaw), 0, lg.side * Math.cos(yaw));
    n.crossVectors(h, up).normalize();
    let vi = lg.v0;
    for (let i = 0; i < nSeg; i++) {
      dir.subVectors(pts[i + 1], pts[i]);
      const len = dir.length(); dir.divideScalar(len || 1);
      e2.crossVectors(dir, n);
      const r0 = L.seg[i][1] * s * 0.82, r1 = (i < nSeg - 1 ? L.seg[i + 1][1] : L.seg[i][1] * 0.2) * s * 0.82;
      a0.copy(pts[i]).addScaledVector(dir, -r0 * 0.5);
      a1.copy(pts[i + 1]).addScaledVector(dir, i < nSeg - 1 ? r1 * 0.4 : 0);
      for (let ring = 0; ring < 2; ring++) {
        const c = ring ? a1 : a0, r = ring ? (i === nSeg - 1 ? 0.001 : r1 * 1.05) : r0;
        for (let j = 0; j < sides; j++) {
          const a = (j / sides) * Math.PI * 2;
          q.copy(n).multiplyScalar(Math.cos(a)).addScaledVector(e2, Math.sin(a));
          pos[vi * 3] = c.x + q.x * r; pos[vi * 3 + 1] = c.y + q.y * r; pos[vi * 3 + 2] = c.z + q.z * r;
          nor[vi * 3] = q.x; nor[vi * 3 + 1] = q.y; nor[vi * 3 + 2] = q.z;
          vi++;
        }
      }
    }
    if (lg.c0 != null) {
      // the sex comb: a row of thick black teeth across the first tarsomere, on its front face
      const i = 4;
      dir.subVectors(pts[i + 1], pts[i]).normalize();
      e2.crossVectors(dir, n);
      const face = q.copy(n).multiplyScalar(-0.35).addScaledVector(e2, -0.94).normalize().clone();
      const r = L.seg[i][1] * s;
      let ci = lg.c0;
      for (let t = 0; t < comb; t++) {
        const along = lerp(0.2, 0.92, t / (comb - 1));
        const base = a0.copy(pts[i]).lerp(pts[i + 1], along).addScaledVector(face, r * 0.8);
        const tipP = base.clone().addScaledVector(face, 0.045 * s).addScaledVector(dir, 0.012 * s);
        const w = 0.009 * s;
        const corners = [base.clone().addScaledVector(dir, -w), base.clone().addScaledVector(n, w), base.clone().addScaledVector(dir, w).addScaledVector(n, -w), tipP];
        corners.forEach((cpt, j) => {
          pos.set([cpt.x, cpt.y, cpt.z], (ci + j) * 3);
          nor.set([face.x, face.y, face.z], (ci + j) * 3);
        });
        ci += 4;
      }
    }
  }
  return {
    geometry: g, legs, H,
    update(k, twitch) {
      legs.forEach((lg, i) => write(lg, k, twitch ? twitch[i] : 0));
      g.attributes.position.needsUpdate = true;
      g.attributes.normal.needsUpdate = true;
      g.computeBoundingSphere();
    },
  };
}

/* ---------- materials ---------- */

const chitinMat = (mat) => matCache(mat, 'fly-chitin', () => mat.make.physical({
  map: chitinTex(), vertexColors: true, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.4, sheenColor: new THREE.Color(toLinear('#d8c8a8')), sheenRoughness: 0.6,
}));
const abdomenMat = (mat, sex) => matCache(mat, 'fly-abdomen-' + sex, () => mat.make.physical({
  map: abdomenTex(sex), roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.35,
}));
const eyeMat = (mat, eye) => matCache(mat, 'fly-eye-' + eye, () => mat.make.physical(Object.assign({
  map: eyeColorTex(eye), normalMap: eyeNormalTex(), normalScale: new THREE.Vector2(0.9, 0.9),
  roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12,
}, eye === 'white'
  ? { color: new THREE.Color(0.86, 0.86, 0.86), sheen: 0.5, sheenColor: new THREE.Color(toLinear('#f4e6e0')), iridescence: 0.35, iridescenceIOR: 1.4, iridescenceThicknessRange: [200, 500] }
  : {})));
const detailMat = (mat) => matCache(mat, 'fly-detail', () => mat.make.standard({ vertexColors: true, roughness: 0.42 }));
const legMat = (mat) => matCache(mat, 'fly-legs', () => mat.make.physical({ vertexColors: true, roughness: 0.5, clearcoat: 0.15, clearcoatRoughness: 0.5 }));
const wingMat = (mat) => matCache(mat, 'fly-wing', () => {
  const m = mat.make.physical({
    map: wingTex(), transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.18, metalness: 0,
    iridescence: 1, iridescenceIOR: 1.45, iridescenceThicknessRange: [280, 720], clearcoat: 0.6, clearcoatRoughness: 0.1,
  });
  m.userData.noSketch = true;
  return m;
});

/* ---------- the fly ---------- */

export function makeFly(mat, { sex = 'f', eye = 'red', seed = 1, detail = 1 } = {}) {
  const spec = SPEC[sex] || SPEC.f, det = detail >= 1 ? 1 : 0.5, s = spec.s;
  const rnd = seeded((seed * 2654435761) >>> 0 || 1);
  const group = new THREE.Group(), b = new THREE.Group(), body = new THREE.Group();
  group.add(b); b.add(body);
  const add = (geo, m, cast = true) => {
    const o = new THREE.Mesh(geo, m);
    o.castShadow = cast; o.receiveShadow = true;
    body.add(o);
    return o;
  };
  add(chitinGeo(sex, det), chitinMat(mat));
  add(abdomenGeo(sex, det), abdomenMat(mat, sex));
  const eyes = add(eyesGeo(sex, det), eyeMat(mat, eye));
  add(detailGeo(sex, det), detailMat(mat));
  const legs = makeLegs(sex, det, rnd);
  const legMesh = add(legs.geometry, legMat(mat));
  legMesh.frustumCulled = false;

  // wings: the right one lies over the left at rest
  const wings = [1, -1].map((side) => {
    const pivot = new THREE.Group();
    pivot.position.set(-0.16 * s, 0.34 * s + (side > 0 ? 0.012 : 0), side * 0.28 * s);
    const w = new THREE.Mesh(wingGeo(sex, det), wingMat(mat));
    w.renderOrder = 3;
    w.castShadow = false;
    pivot.add(w);
    if (side < 0) pivot.scale.z = -1;
    body.add(pivot);
    return { pivot, side };
  });

  // size: head front to abdomen tip is exactly the spec's length
  const ext = abdomenShape(sex).x(1), front = (0.62 + 0.22) * s;
  const k = (spec.length * 10) / (front - ext);
  b.scale.setScalar(0.1 * k);

  const side = rnd() < 0.5 ? 1 : -1, tilt = (rnd() - 0.5) * 0.3;
  const qa = new THREE.Quaternion(), qb = new THREE.Quaternion(), eu = new THREE.Euler();
  // the left pivot is mirrored in z, so its rotations mirror too: x and y angles flip sign
  const restQ = (w) => qa.setFromEuler(eu.set(0, -0.15 * w.side, -0.02, 'YXZ'));
  const lieQ = (w) => {
    const down = w.side === side;   // the wing on the side it fell on lies nearer flat
    return qb.setFromEuler(eu.set((down ? -1.45 : -1.25) * w.side, (down ? 0.12 : 0.42) * w.side, 0.08, 'YXZ'));
  };

  // lying height: lowest body point, for the roll it falls into
  const bodyGeos = [chitinGeo(sex, det), abdomenGeo(sex, det), eyesGeo(sex, det)];
  const roll = side * Math.PI / 2 + tilt, cr = Math.cos(roll), sr = Math.sin(roll);
  let lowY = 0;
  bodyGeos.forEach((g) => {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) lowY = Math.min(lowY, p.getY(i) * cr - p.getZ(i) * sr);
  });
  const Hlie = -lowY + 0.01;

  let pose = 0, twitchOn = false;
  const tw = new Array(12).fill(0);
  const out = {
    group, sex, eye, length: spec.length, side,
    setPose(kk) {
      pose = clamp(kk);
      const e = smooth(pose);
      body.rotation.x = roll * e;
      body.position.y = lerp(legs.H, Hlie, e);
      wings.forEach((w) => w.pivot.quaternion.copy(restQ(w)).slerp(lieQ(w), e));
      legs.update(pose, twitchOn ? tw : null);
    },
    setTwitch(t) {
      let any = false;
      legs.legs.forEach((lg, i) => {
        const x = Math.sin(t * lg.rate + lg.phase) * Math.sin(t * lg.rate * 2.7 + lg.phase * 1.3);
        const v = Math.pow(Math.max(0, x), 10) * pose;
        if (Math.abs(v - tw[i]) > 0.004) any = true;
        tw[i] = v;
      });
      const on = tw.some((v) => v > 0.004);
      if (any || on !== twitchOn) { twitchOn = on; legs.update(pose, on ? tw : null); }
    },
    setEye(e2) { if (e2 !== out.eye) { out.eye = e2; eyes.material = eyeMat(mat, e2); } },
  };
  out.setPose(0);
  return out;
}
