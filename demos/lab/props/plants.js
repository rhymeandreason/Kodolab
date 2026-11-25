/* A garden pea (Pisum sativum) on a bamboo cane, from a hooked shoot to dry pods. Its seed and pod
 * are peas.js, its flower flower.js; the pot it stands in is garden.js. From the Mendel lab.
 *
 *   const plant = makePeaPlant(mat, { seed: 3, sites: 4 });   // origin where the stem leaves the soil
 *   plant.group.position.copy(pot.anchors.soil);
 *   plant.setGrowth(g);  plant.sites[i].flower / .pod;  plant.sites[i].setManual(true);  plant.setPeas(lists)
 *
 * A slender, weak stem climbing the cane, zigzagging at the nodes. At each node a pair of big
 * leafy stipules clasps the stem, and a pinnate leaf leaves on alternate sides: 1 to 3 pairs of
 * oval leaflets, the rachis ending in branched, curling tendrils. The first two nodes carry
 * scale leaves. The flowers sit on peduncles in the upper axils; a site's group holds its
 * flower and its pod, which setGrowth drives unless setManual(true). A site's group shows once
 * its peduncle starts, manual or not.
 */
import * as THREE from 'three';
import { V3, clamp, lerp } from '../core/math.js';
import { seeded } from '../core/random.js';
import { mesh } from '../core/geometry.js';
import { makeCanvas, canvasTex } from '../core/canvas.js';
import { toLinear } from '../materials.js';
import { ss, lc, geoCache, matCache, texCache, curve, sheet, addMorphs, merge, tint, remapUV, live, paint } from './shapes.js';
import { makePeaPod } from './peas.js';
import { makePeaFlower } from './flower.js';

const UP = V3(0, 1, 0);
/** Tube along a curve whose radius shrinks to `end` × at the far end. */
function taperTube(c, segs, r, radial, end = 0.5) {
  const g = new THREE.TubeGeometry(c, segs, r, radial);
  const p = g.attributes.position, o = V3(), v = V3();
  for (let i = 0; i <= segs; i++) {
    c.getPointAt(i / segs, o);
    const f = lerp(1, end, i / segs);
    for (let j = 0; j <= radial; j++) {
      const k = i * (radial + 1) + j;
      v.fromBufferAttribute(p, k).sub(o).multiplyScalar(f).add(o);
      p.setXYZ(k, v.x, v.y, v.z);
    }
  }
  return g;
}
/** A rotation whose +y is Y and +z is as near Z as it can be. */
function frame(Y, Z, pos, s = 1) {
  const y = Y.clone().normalize(), z = Z.clone().addScaledVector(y, -Z.dot(y)).normalize();
  return new THREE.Matrix4().makeBasis(V3().crossVectors(y, z), y, z).scale(V3(s, s, s)).setPosition(pos);
}


/* ---------- pea plant ---------- */
const STEM_R = 0.17;
const GREEN = { leaf: '#6a9560', light: '#a9c896', vein: '#b9d3a4', rachis: '#9dbd80', stem: '#a3bf86' };
/** Atlas: leaflet (u 0..0.5), stipule (u 0.5..1, v 0.5..1), plain green for rachis and tendrils. */
function leafTex() {
  return texCache('leaf', () => {
    const S = 512, c = makeCanvas(S, S), g = c.getContext('2d');
    const R = seeded(33);
    g.fillStyle = GREEN.leaf; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 1600; i++) {
      g.fillStyle = R() < 0.5 ? `rgba(240,255,240,${0.03 + R() * 0.04})` : `rgba(20,50,20,${0.03 + R() * 0.05})`;
      g.beginPath(); g.ellipse(R() * S, R() * S, 2 + R() * 8, 2 + R() * 6, R() * 3, 0, 7); g.fill();
    }
    g.lineCap = 'round';
    // leaflet: midrib, looping secondary veins, a pale margin
    for (let k = 0; k < 10; k++) {
      const y0 = 490 - k * 47;
      for (const s of [-1, 1]) {
        g.strokeStyle = `rgba(190,215,170,${0.55 - k * 0.03})`; g.lineWidth = 2.2;
        g.beginPath(); g.moveTo(128, y0); g.quadraticCurveTo(128 + s * 55, y0 - 14, 128 + s * 112, y0 - 80); g.stroke();
      }
    }
    for (let y = S; y > 6; y -= 4) { g.strokeStyle = GREEN.vein; g.lineWidth = lerp(1.4, 6, y / S); g.beginPath(); g.moveTo(128, y); g.lineTo(128, y - 5); g.stroke(); }
    g.fillStyle = 'rgba(200,225,190,0.35)'; g.fillRect(0, 0, 4, S); g.fillRect(252, 0, 4, S);
    // stipule: veins fanning from where it joins the stem, whitish flecks near its base
    g.save(); g.beginPath(); g.rect(256, 0, 256, 256); g.clip();
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(225,238,225,${0.15 + R() * 0.25})`; g.beginPath(); g.ellipse(300 + R() * 180, 130 + R() * 120, 2 + R() * 9, 1.5 + R() * 4, R() * 3, 0, 7); g.fill(); }
    for (let k = 0; k < 14; k++) {
      const a = -Math.PI / 2 + (k - 6.5) * 0.2;
      g.strokeStyle = 'rgba(185,212,165,0.5)'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(384, 200); g.quadraticCurveTo(384 + Math.cos(a) * 60, 200 + Math.sin(a) * 90, 384 + Math.cos(a) * 140, 200 + Math.sin(a) * 210); g.stroke();
    }
    g.restore();
    g.fillStyle = GREEN.rachis; g.fillRect(256, 256, 256, 256);
    return canvasTex(c);
  });
}
const UV_LEAFLET = (u, v) => [u * 0.5, v];
const UV_STIPULE = (u, v) => [0.505 + u * 0.49, 0.505 + v * 0.49];
const UV_PLAIN = (u, v) => [0.55 + u * 0.4, 0.05 + v * 0.4];

/** Leaflet: base at the origin, length +y, upper face +z, folded along the midrib by `fold`. */
const leaflet = (fold, droop) => remapUV(sheet(8, 12, (u, t, out) => {
  const s = u * 2 - 1, hw = 0.88 * Math.pow(Math.sin(Math.PI * Math.pow(Math.max(t, 0.001), 0.82)), 0.72) + 0.012, x = s * hw;
  out.set(x * Math.cos(fold), 2.9 * t, Math.abs(x) * Math.sin(fold) - droop * t * t);
}), UV_LEAFLET);
/** Stipule: joined to the stem at the origin, length +y, face +z. Semi-cordate: the broad half (+x,
 *  or -x mirrored) with a round toothed lobe that runs below the joint and clasps the stem. */
const stipule = (cup, mirror) => remapUV(sheet(8, 13, (u, v, out) => {
  const s = (u * 2 - 1) * (mirror ? -1 : 1), t = -0.32 + 1.32 * v, L = 2.6;
  let wo = 1.2 * Math.sqrt(Math.max(0, 1 - ((t - 0.34) / 0.66) ** 2));
  wo *= 1 + 0.07 * Math.max(0, Math.sin(t * 58)) * (1 - ss(0.1, 0.45, t));
  const wi = 0.32 * Math.sqrt(Math.max(0, 1 - ((t - 0.5) / 0.5) ** 2));
  const x = s > 0 ? s * wo : s * wi;
  out.set(x, L * t, cup * x * x - 0.25 * Math.max(0, t) ** 2 - 0.5 * Math.max(0, -t) * Math.abs(x));
}, mirror), UV_STIPULE);

/** One leaf in the node's frame (stem along +y, the leaf out along +x): stipules, rachis, leaflet
 *  pairs, tendrils. Morph 0 is the leaf still folded in the bud. pairs 0 is a scale leaf. */
function leafGeometry(pairs, variant) {
  return geoCache(`leaf${pairs}:${variant}`, () => {
    const R = seeded(101 + variant * 13 + pairs * 7);
    const build = (young) => {
      const parts = [];
      for (const k of [1, -1]) {
        const th = 1.25, base = V3(STEM_R * Math.cos(th), 0.05, k * STEM_R * Math.sin(th));
        const Y = young ? V3(0.12, 1, k * 0.25) : V3(Math.cos(0.95), pairs ? 0.62 : 1.2, k * Math.sin(0.95));
        const Z = young ? V3(0.2, 0, k) : V3(-0.15, 1, 0);
        const geo = stipule(young ? 0.55 : 0.12, k < 0);
        parts.push(geo.applyMatrix4(frame(Y, Z, base, young ? 0.55 : 1)));
      }
      if (!pairs) return parts;
      const Lr = 1.3 + pairs * 1.45 + 0.6;
      const rc = curve(young
        ? [[0.1, 0.1, 0], [Lr * 0.1, Lr * 0.3, 0], [Lr * 0.15, Lr * 0.55, 0], [Lr * 0.17, Lr * 0.75, 0]]
        : [[0.1, 0.1, 0], [Lr * 0.32, Lr * 0.2, 0], [Lr * 0.66, Lr * 0.23, 0], [Lr, Lr * 0.12, 0]]);
      parts.push(remapUV(taperTube(rc, 24, 0.055, 5, 0.55), UV_PLAIN));
      const side = (t) => V3().crossVectors(rc.getTangentAt(t), UP).normalize();
      for (let p = 0; p < pairs; p++) for (const sgn of [1, -1]) {
        const a = clamp((1.3 + p * 1.45) / Lr + sgn * 0.025), P = rc.getPointAt(a), T = rc.getTangentAt(a), S = side(a).multiplyScalar(sgn);
        const sz = 1 - 0.1 * p + (R() - 0.5) * 0.08;
        if (young) parts.push(leaflet(1.3, 0).applyMatrix4(frame(T.clone().add(V3(0, 0.6, 0)).addScaledVector(S, 0.15), S.clone().negate(), P, sz * 0.6)));
        else parts.push(leaflet(0.22, 0.28).applyMatrix4(frame(S.clone().addScaledVector(T, 0.5).add(V3(0, -0.12, 0)), UP, P.addScaledVector(S, 0.03), sz)));
      }
      // tendrils: a lateral pair where the next leaflets would be, a second pair on bigger leaves, and the end
      const ends = [[1, 0]];
      const at = (1.3 + pairs * 1.45) / Lr;
      ends.push([at, 1], [at, -1]);
      if (pairs >= 2) ends.push([(at + 1) / 2, 1], [(at + 1) / 2, -1]);
      ends.forEach(([a, sgn]) => {
        const P = rc.getPointAt(Math.min(a, 1)), T = rc.getTangentAt(Math.min(a, 1)), S = side(Math.min(a, 1)).multiplyScalar(sgn || 1);
        const len = (2.4 + R() * 1.1) * (sgn ? 0.85 : 1), turns = 1.4 + R() * 0.8, cr = 0.18 + R() * 0.08;
        const d = young ? T.clone().add(V3(0, 0.8, 0)).addScaledVector(S, sgn * 0.2).normalize()
          : T.clone().addScaledVector(S, sgn * 0.9).add(V3(0, 0.3 + R() * 0.3, 0)).normalize();
        const L = young ? len * 0.3 : len, coil = young ? 0.06 : cr, tw = young ? 0.6 : turns;
        const bend = V3().crossVectors(d, S).normalize();   // the straight part arcs a little, then coils
        const ax = V3().crossVectors(d, bend).normalize();
        const pts = [];
        for (let i = 0; i <= 13; i++) { const t = i / 13; pts.push(P.clone().addScaledVector(d, L * 0.72 * t).addScaledVector(bend, -0.25 * L * 0.25 * t * t)); }
        const c0 = pts[13].clone(), dir = d.clone().addScaledVector(bend, -0.12).normalize();
        for (let i = 1; i <= 16; i++) {
          const t = i / 16, ang = t * tw * Math.PI * 2, rr = coil * (1 - 0.45 * t);
          pts.push(c0.clone().addScaledVector(dir, rr * Math.sin(ang) + L * 0.05 * t).addScaledVector(bend, rr * (1 - Math.cos(ang))).addScaledVector(ax, 0.06 * t * L * 0.3));
        }
        parts.push(remapUV(taperTube(curve(pts), 30, 0.024, 3, 0.45), UV_PLAIN));
      });
      return parts;
    };
    return addMorphs(merge(build(false)), [merge(build(true))]);
  });
}
function stemTex() {
  return texCache('stem', () => {
    const c = makeCanvas(64, 256), g = c.getContext('2d'), R = seeded(8);
    g.fillStyle = GREEN.stem; g.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 26; i++) { g.fillStyle = R() < 0.5 ? 'rgba(235,250,225,0.22)' : 'rgba(60,95,50,0.16)'; g.fillRect(R() * 64, 0, 1 + R() * 2.5, 256); }
    const t = canvasTex(c);
    t.wrapS = THREE.RepeatWrapping;
    return t;
  });
}
const INTERNODE = geoCache('internode', () => { const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true); g.translate(0, 0.5, 0); return g; });

/** Bamboo cane with nodes, base at the origin. */
function caneGeometry(len) {
  return geoCache('cane' + len, () => {
    const parts = [tint(new THREE.CylinderGeometry(0.26, 0.3, len, 10, 1), '#ffffff').translate(0, len / 2, 0)];
    for (let y = 4.5; y < len - 1; y += 10.5) {
      const ring = new THREE.TorusGeometry(0.29, 0.05, 5, 14);
      ring.rotateX(Math.PI / 2); ring.translate(0, y, 0);
      parts.push(tint(ring, '#c9b48a'));
    }
    return merge(parts);
  });
}
/** Twine loop round the cane (centre S, radius rs) and the stem (centre P, radius rp), with a knot. */
function tieGeometry(S, rs, P, rp) {
  const u = V3(P.x - S.x, 0, P.z - S.z).normalize(), v = V3(-u.z, 0, u.x), pts = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI / 2 + (i / 8) * Math.PI; pts.push(S.clone().addScaledVector(u, Math.cos(a) * rs).addScaledVector(v, Math.sin(a) * rs).add(V3(0, 0.05 * Math.sin(i), 0))); }
  for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI; pts.push(P.clone().addScaledVector(u, Math.cos(a) * rp).addScaledVector(v, Math.sin(a) * rp).add(V3(0, 0.04 * Math.cos(i), 0))); }
  const loop = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 48, 0.04, 5, true);
  const k = S.clone().addScaledVector(v, rs);                 // knot on the cane, two loose ends
  const knot = new THREE.SphereGeometry(0.08, 8, 6).translate(k.x, k.y, k.z);
  const ends = [-1, 1].map((sg) => new THREE.TubeGeometry(curve([k, k.clone().addScaledVector(v, 0.35).add(V3(0, sg * 0.1, 0)), k.clone().addScaledVector(v, 0.7).add(V3(0.1 * sg, -0.25 + sg * 0.15, 0))]), 6, 0.035, 4));
  return merge([loop, knot, ...ends]);
}

/** A garden pea on a cane; see the file header. height: stem length above the soil at full growth.
 *  sites: flowering nodes, bottom to top. peas: one list per site's pod. */
export function makePeaPlant(mat, { seed = 1, height = 32, sites: nSites = 4, growth = 1, peas = null, stake = true } = {}) {
  const R = seeded(seed);
  const N = nSites + 6;
  const g = new THREE.Group();
  const leafMat = live(mat.make.physical({ color: 0xffffff, map: leafTex(), bumpMap: leafTex(), bumpScale: 1.2, roughness: 0.6, sheen: 0.4, sheenRoughness: 0.5, sheenColor: lc('#b9d2c4'), side: THREE.DoubleSide }));
  const stemMat = live(mat.make.physical({ color: 0xffffff, map: stemTex(), roughness: 0.5, sheen: 0.5, sheenColor: lc('#d6e6da') }));

  // full-grown stem: short internodes low down, leaning to the cane, zigzag at the nodes
  const rel = [...Array(N)].map((_, i) => 0.45 + 0.55 * ss(0, 4, i) + 0.14 * (R() - 0.5));
  const sum = rel.reduce((a, b) => a + b, 0), len = rel.map((x) => (x * height) / sum);
  const cane = V3(-1.75, 0, -1.25), toCane = cane.clone().normalize(), dCane = cane.length();
  const side = (j) => (j % 2 ? 1 : -1);
  const full = [V3()];
  let y = 0;
  for (let i = 0; i < N; i++) {
    y += len[i];
    const lean = (dCane - 0.72) * ss(0, height * 0.38, y), zig = -side(i + 1) * 0.2 * ss(2, 8, y);
    full.push(V3(toCane.x * lean + zig, y, toCane.z * lean));
  }
  const nodes = [g], internodes = [], leaves = [];
  for (let i = 0; i < N; i++) {
    const d = full[i + 1].clone().sub(full[i]);
    const im = mesh(INTERNODE, stemMat);
    im.quaternion.setFromUnitVectors(UP, d.clone().normalize());
    nodes[i].add(im);
    const node = new THREE.Group();
    nodes[i].add(node);
    nodes.push(node);
    internodes.push({ im, d, r: lerp(0.21, 0.13, i / N) });
    // the leaf at the top of this internode
    const j = i + 1, apex = j === N;
    const pairs = j <= 2 ? 0 : j <= 4 ? 1 : j <= 6 ? 2 : 2 + (R() < 0.5 ? 1 : 0);
    const leaf = mesh(leafGeometry(pairs, Math.floor(R() * 3)), leafMat);
    leaf.rotation.y = (side(j) > 0 ? 0 : Math.PI) + (R() - 0.5) * 1.1;
    leaf.rotation.z = (R() - 0.3) * 0.25;
    leaf.rotation.x = (R() - 0.5) * 1.2;
    node.add(leaf);
    leaves.push({ leaf, apex, size: (pairs ? lerp(0.8, 1.15, ss(3, 7, j)) : 0.3) * (apex ? 0.6 : 1) });
  }
  const top = nodes[N];
  // the shoot breaks the soil as a hook (the epicotyl), then straightens
  const hookM = mesh(geoCache('hook', () => taperTube(curve([[0, -0.3, 0], [0, 0.2, 0], [0.12, 0.42, 0], [0.32, 0.4, 0], [0.4, 0.18, 0]]), 16, 0.13, 6, 0.7)), stemMat);
  nodes[1].add(hookM);

  // growth timing: internode i lengthens over [a, a + W]
  const W = 0.16, start = (i) => 0.035 + ((0.6 - 0.035 - W) * i) / (N - 1);

  // flowering sites in the upper axils, each on a peduncle toward the viewer
  const sites = [];
  for (let k = 0; k < nSites; k++) {
    const j = N - nSites + k - 0, node = nodes[j], sgn = side(j);
    const az = (sgn > 0 ? 0 : Math.PI) + sgn * -0.75, el = 0.7 + (R() - 0.5) * 0.2, L = 3.2 * (height / 32);
    const dir = V3(Math.cos(az) * Math.cos(el), Math.sin(el), -Math.sin(az) * Math.cos(el));
    const end = dir.clone().multiplyScalar(L).add(V3(0, -0.3, 0));
    const ped = mesh(new THREE.TubeGeometry(curve([dir.clone().multiplyScalar(STEM_R), dir.clone().multiplyScalar(L * 0.5).add(V3(0, 0.25, 0)), end]), 12, 0.045, 5), stemMat);
    node.add(ped);
    const site = new THREE.Group();
    site.rotation.y = Math.atan2(dir.x, dir.z);
    node.add(site);
    const flower = makePeaFlower(mat, { seed: seed * 31 + k });
    const pod = makePeaPod(mat, { seed: seed * 17 + k, peas: (peas && peas[k]) || [...Array(5 + Math.floor(R() * 3))].map(() => 'Y') });
    site.add(flower.group, pod.group);
    const s = {
      group: site, flower, pod, ped, end, manual: false, t0: 0.6 + k * 0.012,
      setManual(on) { s.manual = !!on; },
    };
    sites.push(s);
  }

  // the cane and two ties, where the stem passes it
  let ties = [];
  if (stake) {
    const caneLen = height + 13;
    const c = mesh(caneGeometry(caneLen), matCache(mat, 'cane', () => mat.make.physical({ color: toLinear('#d2b878'), vertexColors: true, roughness: 0.45, clearcoat: 0.4, clearcoatRoughness: 0.4 })));
    c.position.set(cane.x, -7, cane.z);
    g.add(c);
    const twine = matCache(mat, 'twine', () => mat.make.standard({ color: toLinear('#b39a6c'), roughness: 0.95 }));
    ties = [Math.round(N * 0.38), Math.round(N * 0.72)].map((i) => {
      const P = full[i].clone().lerp(full[i + 1], 0.5), S = V3(cane.x, P.y, cane.z);
      const m = mesh(tieGeometry(S, 0.34, P, internodes[i].r + 0.05), twine);
      g.add(m);
      return { m, at: start(i) + W };
    });
  }

  const anchors = { base: V3(), top: V3() };
  const st = { g: growth };
  let lastSen = -1;
  function setGrowth(v) {
    const gr = (st.g = clamp(v));
    const hook = 2.3 * (1 - ss(0.09, 0.14, gr));
    for (let i = 0; i < N; i++) {
      const e = ss(start(i), start(i) + W, gr), { im, d, r } = internodes[i];
      const rr = r * (0.55 + 0.45 * e);
      im.visible = e > 0.001;
      im.scale.set(rr, d.length() * e + (e > 0 ? 0.06 : 0), rr);
      nodes[i + 1].position.copy(d).multiplyScalar(e);
      const lf = leaves[i], le = ss(start(i) + 0.03, start(i) + 0.03 + W * 1.3, gr);
      lf.leaf.visible = e > 0.001;
      lf.leaf.scale.setScalar(lf.size * lerp(0.18, 1, le));
      lf.leaf.morphTargetInfluences[0] = lf.apex ? 1 - 0.3 * le : 1 - le;
    }
    hookM.visible = hook > 0.3 && gr > 0.02;
    hookM.scale.setScalar(lerp(0.5, 1, ss(0.02, 0.07, gr)));
    if (hookM.visible) leaves[0].leaf.visible = false;
    sites.forEach((s) => {
      const k = ss(s.t0 - 0.03, s.t0 + 0.05, gr);
      s.ped.visible = s.group.visible = k > 0.001;
      s.ped.scale.setScalar(lerp(0.15, 1, k));
      s.group.position.copy(s.end).multiplyScalar(lerp(0.15, 1, k));
      if (s.manual) return;
      const o = s.t0;
      s.flower.setOpen(0.5 * ss(o, o + 0.08, gr) + 0.5 * ss(o + 0.1, o + 0.17, gr));
      s.flower.setShed(ss(o + 0.07, o + 0.1, gr));
      s.flower.setPollen(ss(o + 0.07, o + 0.1, gr));
      s.flower.setKeelOpen(0); s.flower.setAnthers(1);
      s.flower.setWither(ss(o + 0.19, o + 0.25, gr));
      s.flower.group.visible = gr < o + 0.26;
      s.pod.setGrowth(ss(o + 0.23, 0.95, gr));
      s.pod.setDry(ss(0.95, 1, gr));
      s.pod.setOpen(0);
    });
    ties.forEach((t) => { t.m.visible = gr >= t.at; });
    const sen = 0.6 * ss(0.94, 1, gr);
    if (sen !== lastSen) {
      lastSen = sen;
      paint(g, leafMat, (m) => m.color.setRGB(1, 1, 1).lerp(lc('#e6d27e'), sen));
      paint(g, stemMat, (m) => m.color.setRGB(1, 1, 1).lerp(lc('#e8d898'), sen));
    }
    g.updateMatrixWorld(true);
    anchors.top.copy(g.worldToLocal(top.getWorldPosition(V3())));
  }
  setGrowth(growth);
  return {
    group: g, anchors, sites, setGrowth,
    setPeas(lists) { sites.forEach((s, k) => { if (lists && lists[k]) s.pod.setPeas(lists[k]); }); },
  };
}
