/* =============================================================================
 *  cell/organelles.js — the organelles both cells are built from
 * =============================================================================
 *  Every organelle either cell is built from, and the geometry primitives
 *  that make them. A host calls the ones its cell has.
 *
 *  THE FOUR IN BOTH CELLS — nucleus, mitochondrion, Golgi, rough ER — are
 *  ONE geometry, not two that resemble each other. They are homologous:
 *  same origin, same job, same ultrastructure, and a student who meets a
 *  mitochondrion in an animal cell has to meet the same object in a plant.
 *  Only arrangement differs, and arrangement is the host's. A plant Golgi is
 *  many scattered stacks and an animal Golgi one perinuclear ribbon —
 *  because the geometry is identical, that difference is what the eye lands
 *  on, which is the whole reason not to redraw it.
 *
 *  THE PLASTIDS AND THE VACUOLE are plant-only and live here anyway, so all
 *  organelle geometry is in one file and a comparison page can call both
 *  sets. A plastid is built by the SAME shell code as the mitochondrion:
 *  both are endosymbionts, two membranes with a folded internal membrane,
 *  and that kinship is said in the construction rather than in the colour.
 *
 *      CellOrganelles.kit(THREE, { seed })   one seeded stream, four builders
 *
 *  A KIT, NOT FREE FUNCTIONS, because every builder draws from one seeded
 *  random stream in call order. Two kits with the same seed give the same
 *  cell; the same kit called in a different order gives a different one.
 *  That is why a host builds in a fixed order and why adding a call in the
 *  middle reshuffles everything after it.
 *
 *  EACH BUILDER RETURNS A BARE GROUP at the origin, unrotated and
 *  unregistered. Where an organelle sits, what it is called, and whether it
 *  is pickable are the host's business — that is the whole line between this
 *  file and the two cells, and it is what lets a plant cell put a solver
 *  between the builder and the scene.
 *
 *  ORGANELLE COLOURS COME FROM palette.js, never from here or from a host.
 *  One organelle, one colour, wherever it is drawn.
 *
 *  THE SHELL BUILDER is the one idea worth keeping. buildShell takes any
 *  parametric surface S(u,w), keeps w up to a per-u cut, offsets an inner
 *  wall along the finite-difference normal and closes the two with a
 *  rounded lip, so a cut organelle has real membrane thickness instead of
 *  a clipped single surface. It is why these read as cut objects rather
 *  than as silhouettes, and why a lesson can fly inside one. Outer, lip and
 *  inner are vertex colours, which is why the materials carry no `color`.
 *
 *  COLOURS ARE TYPED AS sRGB AND CONVERTED. r128 has no colour management:
 *  a hex string lands in the material as linear, and with sRGBEncoding on
 *  the renderer it draws paler than typed. Every colour goes through col().
 * ========================================================================== */
(function (global) {
  'use strict';

  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---- seeded random + simplex noise --------------------------------- */

  function seededRandom(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function makeNoise(seed) {
    const grad3 = [1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1];
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    const rnd = seededRandom(seed || 1);
    for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const perm = new Uint8Array(512), pm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; pm12[i] = perm[i] % 12; }
    const F3 = 1 / 3, G3 = 1 / 6;
    function noise3(xin, yin, zin) {
      const s = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const xs = [x0, x0 - i1 + G3, x0 - i2 + 2 * G3, x0 - 1 + 3 * G3];
      const ys = [y0, y0 - j1 + G3, y0 - j2 + 2 * G3, y0 - 1 + 3 * G3];
      const zs = [z0, z0 - k1 + G3, z0 - k2 + 2 * G3, z0 - 1 + 3 * G3];
      const ii = i & 255, jj = j & 255, kk = k & 255;
      const gi = [
        pm12[ii + perm[jj + perm[kk]]] * 3,
        pm12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3,
        pm12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3,
        pm12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3,
      ];
      let n = 0;
      for (let c = 0; c < 4; c++) {
        let t0 = 0.6 - xs[c] * xs[c] - ys[c] * ys[c] - zs[c] * zs[c];
        if (t0 > 0) { t0 *= t0; n += t0 * t0 * (grad3[gi[c]] * xs[c] + grad3[gi[c] + 1] * ys[c] + grad3[gi[c] + 2] * zs[c]); }
      }
      return 32 * n;
    }
    function fbm(x, y, z, oct = 3) {
      let a = 0.5, f = 1, sum = 0, norm = 0;
      for (let o = 0; o < oct; o++) { sum += a * noise3(x * f, y * f, z * f); norm += a; a *= 0.5; f *= 2.03; }
      return sum / norm;
    }
    return { noise3, fbm };
  }

  /* ---- geometry ------------------------------------------------------ */

  function surfaceNormal(THREE, S, center, u, w, eps = 1e-3) {
    const su = S(u + eps, w).sub(S(u - eps, w));
    const sw = S(u, w + eps).sub(S(u, w - eps));
    const n = new THREE.Vector3().crossVectors(su, sw);
    const radial = S(u, w).sub(center);
    if (n.lengthSq() < 1e-10) n.copy(radial);       // a pole: no tangent frame
    if (n.dot(radial) < 0) n.negate();
    return n.normalize();
  }

  // Hollow shell around S(u,w), cut at w = wRange(u)[1] (and [0] if rimStart),
  // closed by a rounded lip of the given thickness. See the header.
  function buildShell(THREE, o) {
    const { S, uRange, wRange, uSeg, uPeriodic, thickness, colors } = o;
    const center = o.center || new THREE.Vector3();
    const rimStart = !!o.rimStart, segs = o.segs || { outer: 40, rim: 8, inner: 40 };
    const cOuter = colors.outer, cInner = colors.inner, cRim = colors.rim;
    /* A BILAYER ON THE CUT LIP. Given head/tail, the lip is painted as two
       head bands with a paler tail core between, and the faces run into the
       head colour at the cut so the outer band is continuous around the
       edge. Without them cHead is the rim and the lip is flat, which is
       every organelle whose thickness is an envelope rather than one
       membrane. */
    const cHead = colors.head || cRim, cTail = colors.tail || null;
    const tPeriodic = rimStart;

    const rows = [];
    const push = (kind, n, end) => { for (let i = 0; i < n + (end ? 1 : 0); i++) rows.push({ kind, s: i / n }); };
    push('outer', segs.outer, false);
    push('rimEnd', segs.rim, false);
    push('inner', segs.inner, !tPeriodic);
    if (rimStart) push('rimStart', segs.rim, false);

    const cols = uPeriodic ? uSeg : uSeg + 1, nRows = rows.length;
    const pos = new Float32Array(cols * nRows * 3), col = new Float32Array(cols * nRows * 3);
    const c = new THREE.Color(), eps = 1e-3;
    for (let r = 0; r < nRows; r++) {
      const { kind, s } = rows[r];
      for (let i = 0; i < cols; i++) {
        const u = uRange[0] + (i / uSeg) * (uRange[1] - uRange[0]);
        const [ws, we] = wRange(u);
        let P;
        if (kind === 'outer') {
          P = S(u, ws + s * (we - ws));
          c.copy(cOuter);
          if (s > 0.85) c.lerp(cHead, (s - 0.85) / 0.15);
          if (rimStart && s < 0.15) c.lerp(cHead, 1 - s / 0.15);
        } else if (kind === 'inner') {
          const w = we - s * (we - ws);
          P = S(u, w).addScaledVector(surfaceNormal(THREE, S, center, u, w, eps), -thickness);
          c.copy(cInner);
          if (s < 0.15) c.lerp(cHead, 1 - s / 0.15);
          if (rimStart && s > 0.85) c.lerp(cHead, (s - 0.85) / 0.15);
        } else {
          const w = kind === 'rimEnd' ? we : ws;
          const O = S(u, w), N = surfaceNormal(THREE, S, center, u, w, eps);
          const I = O.clone().addScaledVector(N, -thickness);
          const T = S(u, w + eps).sub(S(u, w - eps)).normalize();
          const bulge = thickness * 0.5 * Math.sin(PI * s);
          P = kind === 'rimEnd' ? O.lerp(I, s).addScaledVector(T, bulge) : I.lerp(O, s).addScaledVector(T, -bulge);
          if (cTail) { const t = kind === 'rimEnd' ? s : 1 - s, m = Math.min(t, 1 - t); c.copy(cHead).lerp(cTail, clamp((m - 0.13) / 0.15, 0, 1)); }
          else c.copy(cRim);
        }
        const k = (r * cols + i) * 3;
        pos[k] = P.x; pos[k + 1] = P.y; pos[k + 2] = P.z;
        col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b;
      }
    }
    const idx = [];
    const at = (i, r) => ((r % nRows) * cols) + (i % cols);
    for (let r = 0; r < (tPeriodic ? nRows : nRows - 1); r++)
      for (let i = 0; i < uSeg; i++) idx.push(at(i, r), at(i + 1, r), at(i, r + 1), at(i + 1, r), at(i + 1, r + 1), at(i, r + 1));
    // Outward winding on the outer surface, whichever way S happens to turn.
    {
      const r = Math.floor(segs.outer / 2), i = Math.floor(uSeg / 4);
      const a = new THREE.Vector3().fromArray(pos, at(i, r) * 3);
      const b = new THREE.Vector3().fromArray(pos, at(i + 1, r) * 3).sub(a);
      const d = new THREE.Vector3().fromArray(pos, at(i, r + 1) * 3).sub(a);
      if (b.cross(d).dot(a.sub(center)) < 0)
        for (let t = 0; t < idx.length; t += 3) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  // Closed rounded-rectangle profile; top edge gets its own colour so a cut
  // membrane reads as a pale lip on a coloured wall.
  function roundedRectProfile(THREE, w, h, r, colorSide, colorTop, cornerSeg = 4) {
    const pts = [];
    const corners = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, PI / 2], [-w / 2 + r, -h / 2 + r, PI], [w / 2 - r, -h / 2 + r, 3 * PI / 2]];
    for (const [cx, cy, a0] of corners)
      for (let i = 0; i <= cornerSeg; i++) {
        const a = a0 + (i / cornerSeg) * (PI / 2);
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        pts.push({ x, y, color: y >= h / 2 - r * 1.001 ? colorTop : colorSide });
      }
    return pts;
  }

  /* A MEMBRANE IN SECTION — ONE CONVENTION for every bilayer swept in this
     file, and the same one buildShell paints on a cut shell's lip: a single
     sheet `w` across, whose cut top carries two head bands over a paler tail
     core. Drawn as separate leaflets with something between them a reader
     counts three layers and asks what the middle one is; a bilayer is one
     membrane and has to read as one object with an edge.
     `side` is the underside, which is never the cut face.

     THE CORE TAKES MOST OF THE WIDTH, which is where this parts company
     with buildShell's numbers on purpose: a swept sheet is a few pixels
     across where a cut shell's lip is tens, so head bands at the lip's
     proportions leave the core as a hairline and the edge reads as one
     pale stroke rather than as a membrane with two faces. */
  function bilayerProfile(THREE, w, h, head, tail, side, o = {}) {
    const topSeg = o.topSeg || 12, cs = o.cornerSeg || 3;
    const headBand = o.head === undefined ? 0.05 : o.head, feather = o.feather === undefined ? 0.08 : o.feather;
    const rad = Math.min(w * 0.42, h * 0.2), pts = [];
    const band = t => { const m = Math.min(t, 1 - t); return head.clone().lerp(tail, clamp((m - headBand) / feather, 0, 1)); };
    const corner = (cx, cy, a0, c) => {
      for (let i = 0; i <= cs; i++) { const a = a0 + (i / cs) * (PI / 2); pts.push({ x: cx + Math.cos(a) * rad, y: cy + Math.sin(a) * rad, color: c }); }
    };
    corner(w / 2 - rad, h / 2 - rad, 0, band(0));
    for (let i = 1; i < topSeg; i++) {
      const t = i / topSeg;
      pts.push({ x: w / 2 - rad - t * (w - 2 * rad), y: h / 2, color: band(t) });
    }
    corner(-w / 2 + rad, h / 2 - rad, PI / 2, band(1));
    corner(-w / 2 + rad, -h / 2 + rad, PI, side);
    corner(w / 2 - rad, -h / 2 + rad, 3 * PI / 2, side);
    return pts;
  }

  // Sweep a closed profile along a polyline; x is side, y is up (kept against `up`).
  function sweepProfile(THREE, points, profile, opts = {}) {
    const up = opts.up || new THREE.Vector3(0, 1, 0), scales = opts.scales || null;
    const n = points.length, m = profile.length;
    const pos = [], col = [], idx = [], frames = [];
    const T = new THREE.Vector3(), side = new THREE.Vector3(), upv = new THREE.Vector3(), v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      T.subVectors(points[Math.min(i + 1, n - 1)], points[Math.max(i - 1, 0)]).normalize();
      side.crossVectors(T, up);
      if (side.lengthSq() < 1e-8) side.crossVectors(T, new THREE.Vector3(1, 0, 0));
      side.normalize();
      upv.crossVectors(side, T).normalize();
      frames.push([side.clone(), upv.clone()]);
      const [sx, sy] = scales ? scales[i] : [1, 1];
      for (const pr of profile) {
        v.copy(points[i]).addScaledVector(side, pr.x * sx).addScaledVector(upv, pr.y * sy);
        pos.push(v.x, v.y, v.z); col.push(pr.color.r, pr.color.g, pr.color.b);
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let j = 0; j < m; j++) {
        const a = i * m + j, b = i * m + (j + 1) % m, c = (i + 1) * m + (j + 1) % m, d = (i + 1) * m + j;
        idx.push(a, b, c, a, c, d);
      }
    for (const end of [0, n - 1]) {                    // caps: a fan on the end profile
      const base = pos.length / 3, [sx, sy] = scales ? scales[end] : [1, 1], [sd, uv] = frames[end];
      pos.push(points[end].x, points[end].y, points[end].z);
      col.push(profile[0].color.r, profile[0].color.g, profile[0].color.b);
      for (const pr of profile) {
        v.copy(points[end]).addScaledVector(sd, pr.x * sx).addScaledVector(uv, pr.y * sy);
        pos.push(v.x, v.y, v.z); col.push(pr.color.r, pr.color.g, pr.color.b);
      }
      for (let j = 0; j < m; j++) idx.push(base, base + 1 + j, base + 1 + (j + 1) % m);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function displace(geometry, fn) {
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) { const [x, y, z] = fn(p.getX(i), p.getY(i), p.getZ(i)); p.setXYZ(i, x, y, z); }
    p.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }
  /* ---- the kit ------------------------------------------------------- */

  const KIT_DEFAULTS = { seed: 1234 };

  function kit(THREE, opts = {}) {
    const P = Object.assign({}, KIT_DEFAULTS, opts);
    const noise = makeNoise(7);            // shape noise: fixed, so every cell has the same grain
    const rand = seededRandom(P.seed);
    const rr = (a, b) => a + (b - a) * rand();
    const V3 = THREE.Vector3;
    const col = hex => new THREE.Color(hex).convertSRGBToLinear();
    const ORG = global.MolLib.PALETTE.organelles;
    const shellOf = o => ({ outer: col(o.outer), inner: col(o.inner), rim: col(o.rim) });
    // Same shell, with the lip painted as a bilayer from the organelle's own
    // head/tail. For the one membrane that IS a single bilayer: the plasma.
    const bilayerOf = o => Object.assign(shellOf(o), { head: col(o.head), tail: col(o.tail) });
    /* envMapIntensity DEFAULTS LOW. A host that sets scene.environment (the
       plant cell does, for the vacuole) otherwise adds a whole extra bounce
       to every material at once and the cell goes white. The environment is
       there for the few surfaces that need something to reflect; everything
       else takes a fifteenth of it and is lit by the lamps. */
    const mat = o => {
      const m = new THREE.MeshPhysicalMaterial(Object.assign({ roughness: 0.5, clearcoat: 0.2, clearcoatRoughness: 0.4, envMapIntensity: 0.15 }, o));
      if (o.color) m.color = col(o.color);
      if (o.emissive) m.emissive = col(o.emissive);
      return m;
    };
    const dirUW = (u, w) => new V3(Math.sin(w) * Math.cos(u), -Math.cos(w), Math.sin(w) * Math.sin(u));

    /* nucleus: a cut sphere with nucleolus, chromatin and pore rings. The
       envelope is TWO membranes with a lumen between them, which is what the
       shell's thickness is; that lumen is continuous with the ER's, which is
       why roughER is handed this builder's R and hugs it. */
    function nucleus(o = {}) {
      const R = o.R || 3.6, th = o.thickness || 0.22;
      const g = new THREE.Group();
      const radius = d => R * (1 + 0.03 * noise.fbm(d.x * 2 + 7, d.y * 2, d.z * 2, 2));
      const S = (u, w) => { const d = dirUW(u, w); return d.multiplyScalar(radius(d)); };
      const cut = u => PI * 0.6 + 0.03 * Math.sin(3 * u + 0.5) + 0.02 * Math.sin(7 * u);

      const shell = new THREE.Mesh(buildShell(THREE, {
        S, uRange: [0, 2 * PI], wRange: u => [0, cut(u)], uSeg: 128, uPeriodic: true,
        thickness: th, segs: { outer: 48, rim: 8, inner: 48 },
        colors: shellOf(ORG.nucleus),
      }), mat({ vertexColors: true, roughness: 0.4, clearcoat: 0.5 }));
      g.add(shell);

      // Parts scale with the envelope. A nucleus built smaller than the
      // animal cell's 3.6 otherwise keeps full-size pores and reads as a
      // blackberry; k is 1 at 3.6, so that cell is untouched.
      const k = R / 3.6;
      const ng = displace(new THREE.SphereGeometry(1.05 * k, 48, 32), (x, y, z) => {
        const k = 1 + 0.06 * noise.fbm(x * 2.2 + 1, y * 2.2, z * 2.2, 2); return [x * k, y * k, z * k];
      });
      const nucleolus = new THREE.Mesh(ng, mat({ color: ORG.nucleus.nucleolus, emissive: '#ff8a12', emissiveIntensity: 0.45, roughness: 0.55, clearcoat: 0.2 }));
      nucleolus.position.set(0.35 * k, -0.75 * k, 0.25 * k);
      g.add(nucleolus);

      const chromMat = mat({ color: ORG.nucleus.chromatin, roughness: 0.6, clearcoat: 0 });
      for (let i = 0; i < (o.chromatin || 3); i++) {
        const pts = [];
        for (let j = 0; j < 5; j++) pts.push(new V3(rr(-1, 1), rr(-1, 0.3), rr(-1, 1)).normalize().multiplyScalar(rr(0.6, R - 0.6)));
        const t = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal', 0.6), 48, 0.05 * k, 6, false), chromMat);
        g.add(t);
      }
      const poreGeo = new THREE.TorusGeometry(0.2 * k, 0.07 * k, 8, 18);
      const poreMat = mat({ color: ORG.nucleus.pore, roughness: 0.55, clearcoat: 0 });
      for (let i = 0; i < (o.pores === undefined ? 60 : o.pores); i++) {
        const u = rr(0, 2 * PI), w = rr(0.12 * PI, cut(u) - 0.06 * PI);
        const p = S(u, w), n = surfaceNormal(THREE, S, new V3(), u, w);
        const pore = new THREE.Mesh(poreGeo, poreMat);
        pore.position.copy(p).addScaledVector(n, 0.03 * k);
        pore.lookAt(p.clone().add(n));
        g.add(pore);
      }
      g.userData.parts = { shell, nucleolus };
      g.userData.surface = { R, S, cut };
      return g;
    }

    /* mitochondrion: an outer membrane, and INSIDE IT ONE CONTINUOUS INNER
       MEMBRANE that folds back and forth — every crista is a fold of it,
       not a plate standing in the matrix. That is the whole architecture:
       one surface, one enclosed space, so the protons a crista pumps out
       land in the same intermembrane space everywhere and drive every ATP
       synthase in the organelle. Drawn as separate shelves it says the
       opposite, which is what this used to do.

       The folds alternate from the two long sides and interdigitate, so the
       matrix between them is a single connected space with lobes — the
       shape a micrograph shows and the reason the section looks like a
       squiggle rather than a comb. */
    function mitochondrion(o = {}) {
      const g = new THREE.Group();
      const r = o.r || 0.55, L = o.L || 0.95, th = o.thickness || 0.09;
      const q = o.detail === undefined ? 1 : o.detail;
      const cap = PI * r / 2, total = PI * r + 2 * L;
      const prof = u => {
        const s = u * total;
        if (s < cap) { const a = -PI / 2 + s / r; return [-L + r * Math.sin(a), r * Math.cos(a)]; }
        if (s < cap + 2 * L) return [-L + (s - cap), r];
        const a = (s - cap - 2 * L) / r; return [L + r * Math.sin(a), r * Math.cos(a)];
      };
      const S = (u, w) => {
        const [x, rho] = prof(u);
        const bump = 1 + 0.05 * noise.noise3(x * 2.5, Math.cos(w) * 1.5, Math.sin(w) * 1.5 + 4.2);
        return new V3(x, -rho * bump * Math.sin(w), rho * bump * Math.cos(w));
      };
      const shell = new THREE.Mesh(buildShell(THREE, {
        S, uRange: [0, 1], wRange: () => [0, PI], uSeg: Math.round(72 * q), uPeriodic: false, rimStart: true,
        thickness: th, segs: { outer: Math.round(40 * q), rim: Math.max(4, Math.round(7 * q)), inner: Math.round(40 * q) },
        colors: shellOf(ORG.mitochondrion),
      }), mat({ vertexColors: true, roughness: 0.42, clearcoat: 0.5 }));
      g.add(shell);

      /* The inner membrane's path, traced in the plane of the cut: along one
         long side, diving to the far side and back at each crista, round the
         end cap, then back along the other side with the folds offset half a
         pitch so the two combs mesh. */
      const gapIM = th + 0.045 * r;                   // the intermembrane space
      const ri = r - gapIM, Li = L - gapIM * 0.4;
      /* `cristae` is the TOTAL number of folds, alternating sides along the
         length, not a count per side — seven a side is fourteen folds and
         reads as corrugation.

         EACH FOLD IS A U, NOT A V. Its two walls run in parallel and the
         tip is a round arc, so what sits between two folds is a fat lobe of
         matrix with a narrow membrane finger between — which is the way
         round a micrograph shows it, the membrane being the thin thing. A
         spline through a single tip point pulls the walls together into a
         point instead, and the section reads as a saw.

         Depth past 1 carries the tip beyond the midline, and the sides
         alternate, so the folds interleave without meeting: two adjacent
         folds are on opposite sides and their x ranges do not overlap. */
      const nFold = o.cristae || 5;
      const pitch = 2 * Li / nFold;
      const folds = [];
      for (let k = 0; k < nFold; k++)
        folds.push({
          x: -Li + pitch * (k + 0.5) + rr(-0.06, 0.06) * pitch,
          dir: k % 2 ? -1 : 1,
          w: pitch * rr(0.19, 0.25),
          depth: rr(1.12, 1.5),
        });

      const comb = (dir, ascending) => {
        const out = [], mine = folds.filter(f => f.dir === dir);
        if (!ascending) mine.reverse();
        for (const f of mine) {
          const sgn = ascending ? 1 : -1, tip = dir * ri * (1 - f.depth), lip = dir * ri;
          out.push(new V3(f.x - sgn * f.w * 2.1, 0, lip));
          out.push(new V3(f.x - sgn * f.w * 1.45, 0, dir * ri * 0.86));   // ease off the wall
          out.push(new V3(f.x - sgn * f.w, 0, dir * ri * 0.42));
          out.push(new V3(f.x - sgn * f.w * 0.88, 0, tip * 0.66));
          out.push(new V3(f.x - sgn * f.w * 0.34, 0, tip));
          out.push(new V3(f.x + sgn * f.w * 0.34, 0, tip));
          out.push(new V3(f.x + sgn * f.w * 0.88, 0, tip * 0.66));
          out.push(new V3(f.x + sgn * f.w, 0, dir * ri * 0.42));
          out.push(new V3(f.x + sgn * f.w * 1.45, 0, dir * ri * 0.86));
          out.push(new V3(f.x + sgn * f.w * 2.1, 0, lip));
        }
        return out;
      };
      const ctrl = [];
      ctrl.push(new V3(-Li - ri * 0.5, 0, 0.62 * ri));
      ctrl.push(...comb(1, true));                          // out along +z
      ctrl.push(new V3(Li + ri * 0.5, 0, 0.62 * ri), new V3(Li + ri * 0.8, 0, 0), new V3(Li + ri * 0.5, 0, -0.62 * ri));
      ctrl.push(...comb(-1, false));                        // back along -z
      ctrl.push(new V3(-Li - ri * 0.5, 0, -0.62 * ri), new V3(-Li - ri * 0.8, 0, 0));

      const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
      const pathXZ = curve.getPoints(Math.round(260 * q)).map(p2 => [p2.x, p2.z]);

      // rho of the outer surface at x, so the wall can follow the floor
      const rhoAt = x => (Math.abs(x) <= L ? r : Math.sqrt(Math.max(0, r * r - (Math.abs(x) - L) * (Math.abs(x) - L))));
      const BASE = 0.5, pts = [], scales = [];
      for (const [x, z] of pathXZ) {
        const rho = Math.max(1e-3, rhoAt(x) - th - 0.02);
        const zz = clamp(z, -rho * 0.98, rho * 0.98);
        const floor = -Math.sqrt(Math.max(0.0001, rho * rho - zz * zz));
        const h = Math.max(0.06, -floor - 0.04);
        pts.push(new V3(x, floor + h / 2, zz));
        scales.push([1, h / BASE]);
      }
      const imProfile = roundedRectProfile(THREE, 0.085 * r, BASE, 0.028, col(ORG.mitochondrion.cristaSide), col(ORG.mitochondrion.cristaTop));
      g.add(new THREE.Mesh(sweepProfile(THREE, pts, imProfile, { scales }),
        mat({ vertexColors: true, roughness: 0.5, clearcoat: 0.3, side: THREE.DoubleSide })));

      /* The matrix, and in it the organelle's own circular DNA. A
         mitochondrion carrying its own genome is the plainest evidence it
         was once a free-living bacterium, so it is drawn rather than
         asserted in a caption. */
      const matMat = mat({ color: ORG.mitochondrion.matrix, roughness: 0.6, clearcoat: 0.1 });
      const dnaMat = mat({ color: ORG.mitochondrion.dna, roughness: 0.55, clearcoat: 0.1 });
      for (let i = 0; i < (o.dna === undefined ? 2 : o.dna); i++) {
        const cx = rr(-L * 0.6, L * 0.6), cz = rr(-0.18, 0.18) * ri;
        const cy = -Math.sqrt(Math.max(0.01, r * r - cz * cz)) * 0.45;
        const loop = [];
        for (let k = 0; k <= 24; k++) {
          const A = (k / 24) * 2 * PI, wob = 1 + 0.34 * Math.sin(A * 3 + i) + 0.2 * Math.sin(A * 5 + i * 2);
          loop.push(new V3(cx + Math.cos(A) * 0.17 * r * wob, cy + 0.05 * r * Math.sin(A * 2 + i), cz + Math.sin(A) * 0.17 * r * wob));
        }
        g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), Math.round(48 * q), 0.016 * r, 5, true), dnaMat));
      }
      // matrix ribosomes, which are a bacterium's, not this cell's
      const ribo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035 * r, 5, 4), matMat, 26);
      const m4 = new THREE.Matrix4();
      let n = 0;
      for (let tries = 0; n < 26 && tries < 400; tries++) {
        const x = rr(-L, L), z = rr(-0.55, 0.55) * ri;
        const rho = rhoAt(x) - th - 0.06;
        if (Math.abs(z) > rho) continue;
        const y = -Math.sqrt(Math.max(0.01, rho * rho - z * z)) * rr(0.25, 0.85);
        m4.makeTranslation(x, y, z);
        ribo.setMatrixAt(n++, m4);
      }
      ribo.count = n;
      g.add(ribo);

      g.userData.parts = { shell };
      return g;
    }

    /* Golgi: a stack of curved, ragged-edged discs with vesicles. A plant
       cell has many of these scattered and an animal cell one ribbon by the
       nucleus; that difference is the host's placement, not this geometry.
       `spacing` exists because a stack only reads AS a stack when the gap is
       big enough for the eye to separate the cisternae at the size it is
       drawn — under about a tenth of the disc's width they merge into one
       lump, and a Golgi that is a lump is indistinguishable from a vesicle. */
    function golgi(o = {}) {
      const g = new THREE.Group();
      const gm = mat({ color: ORG.golgi.outer, roughness: 0.45, clearcoat: 0.5 });
      const n = o.cisternae || 7, gap = o.spacing || 0.3;
      for (let i = 0; i < n; i++) {
        const rx = 1.15 + 0.7 * Math.sin(PI * i / (n - 1)) + rr(-0.08, 0.08), rz = rx * 0.78;
        const geo = displace(new THREE.SphereGeometry(1, 72, 24), (x, y, z) => {
          const ang = Math.atan2(z, x);
          const edge = 1 + 0.11 * noise.noise3(Math.cos(ang) * 2.2 + i * 3.7, Math.sin(ang) * 2.2, i * 0.9);
          const X = x * rx * edge, Z = z * rz * edge;
          return [X, y * 0.075 + 0.11 * (X * X + Z * Z), Z];
        });
        const m = new THREE.Mesh(geo, gm);
        m.position.y = i * gap;
        g.add(m);
      }
      const vm = mat({ color: ORG.golgi.vesicle, roughness: 0.4, clearcoat: 0.6 });
      for (let i = 0; i < (o.vesicles === undefined ? 8 : o.vesicles); i++) {
        const ang = rr(0, 2 * PI), rad = rr(1.9, 2.5);
        const v = new THREE.Mesh(new THREE.SphereGeometry(rr(0.1, 0.22), 16, 12), vm);
        v.position.set(Math.cos(ang) * rad, rr(-0.3, n * gap + 0.3), Math.sin(ang) * rad * 0.8);
        g.add(v);
      }
      return g;
    }

    /* rough ER: ribbons around the nucleus, ribosomes on their edges.
       BUILT IN THE HOST'S SPACE, not at the origin, because it is the one
       organelle whose shape is not its own: it wraps a particular nucleus at
       `center` and stops at whatever boundary `clamp` enforces — a plasma
       membrane in one cell, a wall in the other. `clamp` gets a point and
       returns it, moved inside if it has to be. Returns the group and the
       ribosome positions, which the host feeds to its own instanced mesh so
       the studs and the cytoplasm speckle stay one draw call. */
    function roughER(o = {}) {
      const Rn = o.Rn || 3.6, center = o.center || new V3(), y0base = o.y0 === undefined ? -3.3 : o.y0;
      const clampTo = o.clamp || (p => p);
      const arcs = o.arcs || [{ a0: -0.38 * PI, a1: 0.58 * PI, count: 4 }, { a0: 0.80 * PI, a1: 1.22 * PI, count: 3 }];
      const group = new THREE.Group(), ribosomes = [];
      const profile = roundedRectProfile(THREE, 0.18, 0.62, 0.07, col(ORG.er.side), col(ORG.er.top));
      const erMat = mat({ vertexColors: true, roughness: 0.45, clearcoat: 0.5, side: THREE.DoubleSide });
      for (const arc of arcs)
        for (let k = 0; k < arc.count; k++) {
          const rk = Rn + 0.75 + k * 0.6, y0 = y0base + 0.12 * k;
          const a0 = arc.a0 + rr(0, 0.12), a1 = arc.a1 - rr(0, 0.12), steps = Math.ceil((a1 - a0) / 0.035);
          const pts = [];
          for (let s = 0; s <= steps; s++) {
            const a = a0 + (a1 - a0) * s / steps;
            const rad = rk + 0.28 * Math.sin(a * 9 + k * 1.7) + 0.2 * noise.noise3(Math.cos(a) * 3, Math.sin(a) * 3, k * 2.1);
            const y = y0 + 0.28 * Math.sin(a * 4 + k * 0.9) + 0.15 * noise.noise3(a * 2, k, 5);
            pts.push(clampTo(new V3(center.x + Math.cos(a) * rad, y, center.z + Math.sin(a) * rad)));
          }
          group.add(new THREE.Mesh(sweepProfile(THREE, pts, profile), erMat));
          for (let s = 0; s < pts.length; s += 2) {
            const T = pts[Math.min(s + 1, pts.length - 1)].clone().sub(pts[Math.max(s - 1, 0)]).normalize();
            const side = new V3().crossVectors(T, new V3(0, 1, 0)).normalize();
            for (let c = 0, cnt = rand() < 0.6 ? 1 : 2; c < cnt; c++)
              ribosomes.push(pts[s].clone().addScaledVector(side, rand() > 0.5 ? 0.11 : -0.11).add(new V3(0, rr(-0.28, 0.33), 0)));
          }
        }
      return { group, ribosomes };
    }


    /* ---- plastids ------------------------------------------------------
       A plastid is the OTHER endosymbiont, and it is built by the same shell
       code as the mitochondrion on purpose: two membranes with a lumen
       between them, and a folded internal membrane doing the work. That
       kinship is drawn, not coloured — hue is spent on identity, so a
       chloroplast is green and a mitochondrion orange, and what says they
       are the same kind of thing is that they are the same construction.
       chloroplast and amyloplast run through the SAME builder for the same
       reason, and differ in their envelope colour and their contents:
       thylakoid stacks, or starch. They are one organelle in two states, and
       the shared construction is what says so. */

    function plastidShell(o, colors, k = 1, thk = 1) {
      const a = (o.a || 2.3) * k, b = (o.b || 1.05) * k, c = (o.c || 1.5) * k;
      const th = (o.thickness || 0.075) * thk;
      const q = o.detail === undefined ? 1 : o.detail;
      const radius = d => 1 + 0.035 * noise.fbm(d.x * 2.2 + 5, d.y * 2.2 + 2, d.z * 2.2, 2);
      const S = (u, w) => { const d = dirUW(u, w); const r = radius(d); return new V3(d.x * a * r, d.y * b * r, d.z * c * r); };
      const cut = u => PI * 0.58 + 0.03 * Math.sin(2 * u + 1.1) + 0.02 * Math.sin(5 * u);
      const mesh = new THREE.Mesh(buildShell(THREE, {
        S, uRange: [0, 2 * PI], wRange: u => [0, cut(u)], uSeg: Math.round(120 * q), uPeriodic: true,
        thickness: th, segs: { outer: Math.round(44 * q), rim: Math.max(4, Math.round(8 * q)), inner: Math.round(44 * q) },
        colors: shellOf(colors),
      }), mat(Object.assign({ vertexColors: true, roughness: 0.44, clearcoat: 0.45 }, o.material)));
      return { mesh, a, b, c, th };
    }

    /* A THYLAKOID IS A FLATTENED SAC, not a coin. Lathe a rounded-rim
       profile rather than using a cylinder: a stack of cylinders reads as a
       roll of coins the moment anyone zooms in, and these are meant to be
       zoomed into. */
    function thylakoidDisc(r, h, seg = 28) {
      const round = Math.min(h * 0.5, r * 0.3), pts = [];
      pts.push(new THREE.Vector2(0, h / 2));
      pts.push(new THREE.Vector2(r - round, h / 2));
      for (let i = 1; i <= 5; i++) { const A = (i / 5) * PI / 2; pts.push(new THREE.Vector2(r - round + Math.sin(A) * round, h / 2 - round + Math.cos(A) * round)); }
      for (let i = 0; i <= 5; i++) { const A = (i / 5) * PI / 2; pts.push(new THREE.Vector2(r - round + Math.cos(A) * round, -h / 2 + round - Math.sin(A) * round)); }
      pts.push(new THREE.Vector2(0, -h / 2));
      return new THREE.LatheGeometry(pts, seg);
    }

    /* GEOMETRY IS SHARED BETWEEN PLASTIDS, MATERIALS ARE NOT.
       A cell holds several chloroplasts and they do not need to differ:
       nothing legible is lost by giving them one shape and varying the
       transform, and building each from scratch cost most of a tissue
       switch. So the geometry is cut once per distinct parameter set and
       cached. Materials stay per-plastid because hover writes emissive on
       the material — share those and lighting one lights them all. */
    const plastidCache = new Map();
    function plastidGeometry(o, colors, tag) {
      const key = tag + '|' + [o.a, o.b, o.c, o.thickness, o.grana, o.detail].join(',');
      let G = plastidCache.get(key);
      if (G) return G;
      const q = o.detail === undefined ? 1 : o.detail;
      const env = plastidShell(o, colors);
      const inner = plastidShell(o, {
        outer: colors.envelopeInner || colors.outer, inner: colors.inner, rim: colors.rim,
      }, 0.88, 0.55);
      const a = env.a, b = env.b, c = env.c, th = env.th;
      const ai = inner.a - inner.th, bi = inner.b - inner.th, ci = inner.c - inner.th;

      /* Grana on a loose two-row lattice rather than a line, so the lamellae
         between them run in more than one direction, as they do. */
      const want = o.grana || 9, slots = [], discs = [];
      for (let i = 0; i < want; i++) {
        const row = i % 2 ? 1 : -1, t = Math.floor(i / 2) / Math.max(1, Math.ceil(want / 2) - 1);
        const x = (-0.62 + 1.24 * (isFinite(t) ? t : 0.5)) * ai + rr(-0.06, 0.06) * ai;
        const z = row * rr(0.18, 0.46) * ci;
        // the ellipsoid narrows toward the ends, so ask how much room is here
        const room = Math.min(ci * Math.sqrt(Math.max(0.04, 1 - (x / ai) * (x / ai))) - Math.abs(z), ai - Math.abs(x));
        /* A GRANUM IS ABOUT AS TALL AS IT IS WIDE — ten to a hundred
           thylakoids in a stack half a micron across. Drawn wider than tall
           it reads as a pancake and the stacking, which is the whole point
           of a granum, disappears. */
        const rad = Math.min((0.14 + rr(0, 0.04)) * a, room * 0.7);
        if (rad < 0.05 * a) continue;
        const n = 6 + Math.floor(rand() * 5);
        const gap = 0.075 * b, hDisc = 0.045 * b;
        const y = -0.16 * b + rr(-0.06, 0.06) * b;
        const st = new THREE.Object3D();
        st.position.set(x, y, z);
        st.rotation.set(rr(-0.18, 0.18), rand() * PI, rr(-0.18, 0.18));
        st.updateMatrix();
        for (let k = 0; k < n; k++) {
          const d = new THREE.Object3D();
          d.position.y = (k - (n - 1) / 2) * gap;
          // a granum's discs are not perfectly stacked coins
          d.scale.set(rad * (1 + rr(-0.05, 0.05)), hDisc, rad * (1 + rr(-0.05, 0.05)));
          d.rotation.y = rand() * PI;
          d.updateMatrix();
          discs.push(st.matrix.clone().multiply(d.matrix));
        }
        slots.push({ x, y, z, rad, half: (n - 1) / 2 * gap });
      }

      /* Stroma lamellae: flattened tubes from the rim of one granum to the
         rim of the next, so the stacks are one connected compartment. The
         thylakoid membrane is ONE surface enclosing ONE space through the
         whole plastid, which is why a proton gradient built anywhere in it
         drives ATP synthase everywhere in it. Separate piles of coins say
         the opposite. Each leaves and arrives on the side facing its
         partner and sags a little, which stops them reading as struts. */
      const tubes = [], lamR = 0.045 * a;
      for (let i = 0; i < slots.length; i++)
        for (let j = i + 1; j < slots.length; j++) {
          const A1 = slots[i], B1 = slots[j];
          const dx = B1.x - A1.x, dz = B1.z - A1.z, d = Math.hypot(dx, dz);
          if (d > (A1.rad + B1.rad) * 3.4 || d < 1e-3) continue;   // only near neighbours
          const ux = dx / d, uz = dz / d;
          const yA = A1.y + rr(-A1.half, A1.half), yB = B1.y + rr(-B1.half, B1.half);
          const p0 = new V3(A1.x + ux * A1.rad * 0.92, yA, A1.z + uz * A1.rad * 0.92);
          const p2 = new V3(B1.x - ux * B1.rad * 0.92, yB, B1.z - uz * B1.rad * 0.92);
          const p1 = p0.clone().add(p2).multiplyScalar(0.5);
          p1.y -= rr(0.01, 0.06) * b;
          p1.addScaledVector(new V3(-uz, 0, ux), rr(-0.12, 0.12) * d);
          const geo = new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(p0, p1, p2),
            Math.max(8, Math.round(20 * q)), lamR, Math.max(5, Math.round(8 * q)), false);
          geo.scale(1, 0.42, 1);            // a lamella is a sheet, not a pipe
          tubes.push(geo);
        }

      G = {
        envelope: env.mesh.geometry, inner: inner.mesh.geometry,
        disc: discs.length ? thylakoidDisc(1, 1, Math.max(10, Math.round(28 * q))) : null,
        discs, tubes, a, b, c, th,
      };
      plastidCache.set(key, G);
      return G;
    }

    function chloroplast(o = {}) {
      const G = plastidGeometry(o, ORG.chloroplast, 'chloro');
      const g = new THREE.Group();
      /* A TRANSLUCENT ENVELOPE, unlike every other cut shell here. The cut
         is normally how an organelle shows its inside, and that is enough
         when the inside is a wall's own folds — a mitochondrion's cristae
         read fine through its opening. A chloroplast's contents are a
         NETWORK spread through the volume, and a network only reads if you
         can walk round it. Opaque, the grana can be seen from one angle;
         glass, the connections between them survive an orbit.
         The grana are opaque, so they draw in the opaque pass and the shell
         blends over them afterwards. depthWrite off on the shells stops the
         two envelopes fighting each other for depth. */
      const glass = c => mat(Object.assign({ vertexColors: true, roughness: 0.25, clearcoat: 0.7,
        clearcoatRoughness: 0.2, transparent: true, opacity: c, depthWrite: false }));
      const envMat = glass(0.42);
      const shell = new THREE.Mesh(G.envelope, envMat);
      shell.renderOrder = 2;
      g.add(shell);
      /* The inner membrane, with the intermembrane space between the two.
         A plastid's envelope is two membranes and that is not decoration:
         it is the leftover of the cyanobacterium's own wall and the vesicle
         that engulfed it, the same double envelope a mitochondrion has. */
      const envelopeInner = new THREE.Mesh(G.inner, glass(0.34));
      envelopeInner.renderOrder = 1;
      g.add(envelopeInner);
      const thyMat = mat({ color: ORG.chloroplast.thylakoid, roughness: 0.45, clearcoat: 0.4 });
      const lamMat = mat({ color: ORG.chloroplast.lamella, roughness: 0.5, clearcoat: 0.25 });
      if (G.disc) {
        const inst = new THREE.InstancedMesh(G.disc, thyMat, G.discs.length);
        G.discs.forEach((m, i) => inst.setMatrixAt(i, m));
        g.add(inst);
      }
      for (const t of G.tubes) g.add(new THREE.Mesh(t, lamMat));
      g.userData.parts = { shell, envelopeInner };
      return g;
    }

    /* amyloplast: the same envelope, filled with starch grains instead.
       A grain grows in layers around an off-centre hilum, which is why it is
       drawn as rings around a point that is not the middle. */
    function amyloplast(o = {}) {
      const g = new THREE.Group();
      /* THE ENVELOPE IS GLASS HERE. An amyloplast is a thin double membrane
         round grains that fill it, so an opaque envelope in envelope colours
         hides the only thing worth seeing and the organelle reads as a white
         egg. Translucent, the grains and their rings show through and the
         membrane is the thin thing it is. depthWrite off and renderOrder 1,
         the same way the vacuole stacks. */
      const { mesh, a, b, c, th } = plastidShell(Object.assign({
        a: 2.0, b: 1.35, c: 1.55,
        material: { transparent: true, opacity: 0.42, depthWrite: false, roughness: 0.3, clearcoat: 0.55, envMapIntensity: 0.25 },
      }, o), ORG.amyloplast);
      mesh.renderOrder = 1;
      g.add(mesh);
      // Matte: a glossy grain blows out to white under the lamps, which is
      // the brightness the envelope was being blamed for.
      const grainMat = mat({ color: ORG.amyloplast.starch, roughness: 0.72, clearcoat: 0.12 });
      const ringMat = mat({ color: ORG.amyloplast.hilum, roughness: 0.55, clearcoat: 0.1 });
      const n = o.grains || 1;
      for (let i = 0; i < n; i++) {
        const x = n > 1 ? (i - (n - 1) / 2) * 0.9 * (a - th) : 0;
        const gr = new THREE.Group();
        const R0 = (n > 1 ? 0.52 : 0.78) * Math.min(a - th, c - th);
        const shape = (m, k) => {
          const e = new THREE.Mesh(displace(new THREE.SphereGeometry(1, 28, 20), (px, py, pz) => {
            const d = 1 + 0.05 * noise.noise3(px * 3 + i * 4.1, py * 3, pz * 3); return [px * d, py * d, pz * d];
          }), m);
          e.scale.set(R0 * k, R0 * k * 0.82, R0 * k * 0.9);
          return e;
        };
        gr.add(shape(grainMat, 1));
        // growth rings around an off-centre hilum
        const off = new V3(0.30 * R0, 0.20 * R0, 0.12 * R0);
        for (const k of [0.66, 0.40]) {
          const r = shape(k === 0.40 ? grainMat : ringMat, k);
          r.position.copy(off).multiplyScalar(1 - k);
          gr.add(r);
        }
        const hil = shape(ringMat, 0.17);
        hil.position.copy(off);
        gr.add(hil);
        gr.position.set(x, -0.1 * b, rr(-0.12, 0.12) * c);
        gr.rotation.y = rand() * PI;
        g.add(gr);
      }
      g.userData.parts = { shell: mesh };
      return g;
    }

    /* central vacuole: NOT CUT, and not solid.
       Every other organelle here is a cut shell, because a cut is how you
       show a membrane has two sides and an interior with something in it. A
       vacuole is the one where that reads wrong: it is mostly water, so a
       cut face fills it with an opaque disc and turns the largest thing in
       the cell into a plate. Drawn whole and translucent instead, it does
       what a vacuole actually does to the view — the cytoplasm and the
       organelles behind it stay visible through it, which is the reason a
       plant cell can hold something that big and still be a working cell.

       FOUR NESTED LAYERS, none of them writing depth, ordered outward:
       the far wall seen from inside, the sap, the water surface, and the
       tonoplast over the top. Depth writing off is what lets them stack
       without one erasing another; renderOrder is what keeps them in the
       right order once it is off. */
    function vacuole(o = {}) {
      const g = new THREE.Group();
      const R = o.R || 4.2, sx = o.sx === undefined ? 1.25 : o.sx, sy = o.sy === undefined ? 0.62 : o.sy, sz = o.sz === undefined ? 0.98 : o.sz;
      const geo = displace(new THREE.SphereGeometry(R, 64, 48), (x, y, z) => {
        const d = 1 + 0.06 * Math.sin(3 * x / R + 1.2) * Math.sin(2.3 * y / R + 0.4)
                    + 0.05 * Math.sin(2.1 * z / R + 2) * Math.cos(2.7 * x / R)
                    + 0.03 * Math.sin(5 * y / R + 1);
        return [x * d * sx, y * d * sy, z * d * sz];
      });
      const V = ORG.vacuole;
      const layer = (m, scale, order) => {
        const e = new THREE.Mesh(geo, m);
        e.scale.setScalar(scale);
        e.renderOrder = order;
        g.add(e);
        return e;
      };
      const glass = (hex, opacity, extra) => mat(Object.assign({
        color: hex, transparent: true, opacity, depthWrite: false,
      }, extra));
      // the inside of the far wall, so the vacuole has a back
      const back = layer(glass(V.inner, 0.35, { roughness: 0.15, side: THREE.BackSide, clearcoat: 0.4, envMapIntensity: 0.3 }), 1, 0);
      // the sap is what makes it cream if you let it: kept faint
      const sap = layer(glass(V.sap, 0.22, { roughness: 0.6, envMapIntensity: 0.1 }), 0.9, 1);
      // the one surface the environment is really for
      const water = layer(glass(V.outer, 0.55, { roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.08, reflectivity: 0.7, envMapIntensity: 0.45 }), 1, 2);
      const tono = layer(glass(V.rim, 0.22, { roughness: 0.2, envMapIntensity: 0.3 }), 1.03, 3);
      g.userData.parts = { back, sap, water, tono };
      return g;
    }

    /* =====================================================================
       mitochondrionDetail — the same organelle with its membranes resolved
       =====================================================================
       `mitochondrion()` above is the organelle as one object in a cut cell:
       a shell and a swept squiggle, right at the size five of them are drawn
       beside a nucleus. This is the same organelle when it is the SUBJECT —
       the level of detail cell/mitochondrion.js mounts on its own and the
       cut cell swaps in when the camera flies to one. Same colours, same
       proportions, same cut plane, so the swap is a part appearing rather
       than an object changing.

       WHAT THE DETAIL IS FOR is chemiosmosis, and that is one claim about
       topology: there is ONE enclosed space outside the inner membrane —
       the intermembrane space and the inside of every crista, joined
       through the crista junctions — and one enclosed space inside it, the
       matrix. Protons are pumped from the matrix into that first space and
       come back through ATP synthase. Everything built here exists to make
       that readable:

       · A CRISTA IS A FOLD, not a plate. The sheet dives in and comes back
         out, and what the fold encloses is the crista lumen — continuous
         with the intermembrane space through the junction, and the place
         the protons land. Drawn as a solid fin a student concludes the
         protons go into the matrix, and the lesson is lost.

       · ONE MEMBRANE IS ONE SHEET. It is swept at one membrane's thickness,
         the same the outer membrane is drawn at, and its cut edge carries
         the two bands buildShell paints on a cut shell's lip — in the inner
         membrane's own pale pinks, the ones the cut cell already paints its
         cristae with, so the two levels of detail are one object. Swept as
         wall-lumen-wall instead, each arm is its own sandwich and the
         section grows three pale layers a reader has to tell apart from
         what the fold itself encloses.

       · A CRISTA HANGS OFF NARROW JUNCTIONS and is otherwise free in the
         matrix. Real junctions are ~25 nm necks held by MICOS, which is
         what makes a crista lumen its own proton pocket rather than an open
         bay. THE SHAPE DOES NOT SAY THIS and should not be made to: drawing
         the neck at a believable width pinches the fold into a wasp waist
         and the cristae go blocky and regular. `bases` records where the
         junctions are so a callout can point at one, and the card says what
         they do.

       · THE OUTER MEMBRANE LEAKS AND THE INNER ONE DOES NOT. The porins
         drawn over the outer membrane are the reason the gradient lives
         across the inner one, and are worth a ring each.

       · ATP SYNTHASE SITS ON THE RIM, in dimer rows, and the complexes sit
         on the flat faces. That is measured, not decoration: the dimers'
         V-angle is what bends the rim, and a crista's shape is a
         consequence of where its machines are. Both face the MATRIX — F1
         hangs in the matrix, protons come at it out of the lumen.

       SCALE. Lengths along the organelle are honest to a capsule 2 by 0.7
       µm; the membranes and the machines are not, and cell/mitochondrion.js
       declares the factors. A bilayer at its true 4 nm beside a 700 nm
       organelle is a fifth of a pixel.

       Returns a group whose `userData.detail` carries the named subgroups,
       the machine sites, and pockets of points inside each compartment.
       The geometry is here; the protons moving through it, the rotors
       turning and everything a page can click are the component's. */
    /* Lobes on a ring about each machine's own axis, at one angle: `n` per
       machine, 3 unless the entry says otherwise. Called once at build so a
       build nobody steps is still drawn, and every frame by the component
       while the chain is running. */
    function spinRotors(mesh, list, angle) {
      const m4 = new THREE.Matrix4(), p = new V3(), one = new V3(1, 1, 1), q0 = new THREE.Quaternion();
      for (const rt of list) {
        const n = rt.n || 3;
        for (let j = 0; j < n; j++) {
          const a = angle + (j / n) * 2 * PI;
          p.copy(rt.centre).addScaledVector(rt.u, Math.cos(a) * rt.lobeR).addScaledVector(rt.v, Math.sin(a) * rt.lobeR);
          m4.compose(p, rt.q || q0, one);
          mesh.setMatrixAt(rt.i * n + j, m4);
        }
      }
      mesh.instanceMatrix.needsUpdate = true;
    }

    function mitochondrionDetail(o = {}) {
      const g = new THREE.Group();
      const r = o.r || 1;
      const L = o.L === undefined ? 1.7 * r : o.L;
      const q = o.detail === undefined ? 1 : o.detail;
      /* ONE THICKNESS FOR A MEMBRANE, inner and outer alike: a bilayer is
         one sheet, and two membranes drawn at different weights read as two
         different kinds of thing. */
      const th = o.membrane === undefined ? 0.034 * r : o.membrane;   // one membrane, drawn
      const lumenT = o.lumen === undefined ? 0.057 * r : o.lumen;     // the space a fold encloses
      const ribbonT = 2 * th + lumenT;                                 // a clearance: the sheet plus the space it folds around
      const WMAX = 0.33;                                               // a fold's half-width, as a fraction of the pitch
      /* `cristae` is the number of FOLDS, alternating sides along the
         length, not a count per side: ten is ten fingers meshing, five from
         each wall. The cap is below, and it is geometry rather than taste. */
      let nFold = clamp(Math.round(o.cristae === undefined ? 10 : o.cristae), 4, 18);
      /* `open` is how much of the near wall is taken away. 1 cuts the
         organelle in half on y = 0; below that the shell carries on past the
         equator and closes over the folds, which is the view that says it is
         a sealed bag. */
      const open = clamp(o.open === undefined ? 1 : o.open, 0.3, 1);
      const cutW = PI * (1 + 0.5 * (1 - open));

      /* A capsule of radius `rad` and cylinder half-length `len`, param u in
         [0,1] along the profile and w round it. The same grain as
         mitochondrion()'s, so the two levels of detail are the same object. */
      const capsuleS = (rad, len) => (u, w) => {
        const cp = PI * rad / 2, tot = PI * rad + 2 * len, s = u * tot;
        let x, rho;
        if (s < cp) { const a = -PI / 2 + s / rad; x = -len + rad * Math.sin(a); rho = rad * Math.cos(a); }
        else if (s < cp + 2 * len) { x = -len + (s - cp); rho = rad; }
        else { const a = (s - cp - 2 * len) / rad; x = len + rad * Math.sin(a); rho = rad * Math.cos(a); }
        const b = 1 + 0.035 * noise.noise3(x * 2.2 / r, Math.cos(w) * 1.4, Math.sin(w) * 1.4 + 4.2);
        return new V3(x, -rho * b * Math.sin(w), rho * b * Math.cos(w));
      };
      const outerS = capsuleS(r, L);

      /* ONE SURFACE FINISH FOR THE WHOLE INNER MEMBRANE — one material
         object, in fact, shared by both walls of the ribbon. It is one sheet,
         so nothing about how it is shaded may vary along it. The
         barely-there transparency is what lets the lumen and the protons in
         it read through a wall; raise it to 1 and the fold goes solid. */
      const MEM_FINISH = { roughness: 0.42, clearcoat: 0.5, transparent: true, opacity: 0.93 };
      const RESP = global.MolPalette ? global.MolPalette.respiration : global.MolLib.PALETTE.respiration;

      const sub = name => { const s = new THREE.Group(); s.userData.part = name; g.add(s); return s; };
      const gOuter = sub('outer'), gPorin = sub('porin'), gInner = sub('inner'),
            gComplex = sub('complex'), gSynthase = sub('synthase'),
            gDna = sub('dna'), gRibo = sub('ribosome');

      /* ---- the outer membrane ------------------------------------------ */
      const outerMesh = new THREE.Mesh(buildShell(THREE, {
        S: outerS, uRange: [0, 1], wRange: () => [0, cutW], uSeg: Math.round(96 * q), uPeriodic: false,
        rimStart: true, thickness: th,
        segs: { outer: Math.round(52 * q), rim: Math.max(4, Math.round(6 * q)), inner: Math.round(52 * q) },
        colors: shellOf(ORG.mitochondrion),
      }), mat(Object.assign({ vertexColors: true }, MEM_FINISH)));
      gOuter.add(outerMesh);

      /* Porins. A ring each, over the outer membrane only: the outer
         membrane is a sieve and the inner one is not, which is the whole
         reason a gradient can stand across the inner one. The same grey
         membrane/membrane.js gives its own porin and its uncoupler's hole,
         because all three are the same statement — an opening that does not
         choose — and a student meets the two pictures one after the other. */
      let nPorins = 0;
      {
        const nP = Math.round((o.porins === undefined ? 90 : o.porins) * q);
        const geo = new THREE.TorusGeometry(0.032 * r, 0.012 * r, 6, 12);
        const inst = new THREE.InstancedMesh(geo, mat({ color: RESP.porin, roughness: 0.5, clearcoat: 0.3 }), nP);
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), up = new V3(0, 0, 1), one = new V3(1, 1, 1);
        for (let i = 0; i < nP; i++) {
          const u = rr(0.02, 0.98), w = rr(0.06 * PI, cutW - 0.06 * PI);
          const p = outerS(u, w), n = surfaceNormal(THREE, outerS, new V3(), u, w);
          qt.setFromUnitVectors(up, n);
          m4.compose(p.clone().addScaledVector(n, 0.004 * r), qt, one);
          inst.setMatrixAt(i, m4);
        }
        gPorin.add(inst);
        nPorins = nP;
      }

      /* ---- the inner membrane: ONE RIBBON, FOLDED ------------------------
         The same path mitochondrion() traces, and for the same reason: every
         crista is a FOLD of one continuous sheet, so the sheet is drawn as
         one continuous thing — along a wall, diving to the far side and back
         at each fold, round the end cap, and home along the other wall with
         the folds offset half a pitch so the two combs mesh. Drawn as
         separate plates it says separate compartments, which is the
         misconception the whole organelle is here to kill.

         WHAT THIS LEVEL ADDS over mitochondrion() is resolution, not a
         different construction: more folds, a sheet with a thickness and a
         painted edge instead of a line, and folds whose two arms stand a
         lumen apart and pinch at the junction. The cut plane runs through
         the sheet, so looking down into the organelle a reader sees a
         membrane in section with its slot beside it, the way an electron
         micrograph shows it.

         EACH FOLD IS A U, NOT A V. Its two arms run parallel a crista
         lumen apart and the tip is a round arc, so what sits between two
         folds is a fat lobe of matrix with a narrow finger between. A
         spline through a single tip point pulls the arms into a point, the
         lumen closes, and the section reads as a saw. */
      const gapIM = th + (o.ims === undefined ? 0.07 * r : o.ims);
      const ri = r - gapIM, Li = L - gapIM * 0.4;
      /* HOW MANY FOLDS FIT IS ARITHMETIC, not a preference. A fold is a U
         2·w + th across, the next one comes off the opposite wall and
         interleaves, and w is WMAX of the pitch — so the pitch has to hold
         a fold plus a lobe of matrix beside it, and everything but th
         scales with the pitch itself. Asking for more folds than that packs
         membranes through each other; refused here with one warning rather
         than clamped somewhere later.

         THE CAP MUST NOT MOVE WHEN THE SHEET IS DRAWN THICKER. Written
         against the old wall-lumen-wall ribbon it did, and thickening the
         membrane by a hair silently dropped a crista.

         The cap lands near a real number, which is the point: at the
         default the pitch is about 115 nm, and cristae in a working
         mitochondrion sit roughly 100 nm apart. The organelle is full when
         it looks full. */
      const maxFold = Math.max(4, Math.floor(2 * Li * (1 - 2 * WMAX) / (th + 0.035 * r)));
      if (nFold > maxFold) {
        console.warn(`cell/organelles.js: ${nFold} cristae do not fit a mitochondrion this size; drawing ${maxFold}.`);
        nFold = maxFold;
      }
      const pitch = 2 * Li / nFold;
      const folds = [], bases = [];
      const wMin = ribbonT * 0.62, wMax = pitch * 0.5 - ribbonT * 0.62;
      for (let k = 0; k < nFold; k++)
        folds.push({
          x: -Li + pitch * (k + 0.5) + rr(-0.04, 0.04) * pitch,
          dir: k % 2 ? -1 : 1,
          w: clamp(pitch * rr(WMAX - 0.05, WMAX), wMin, Math.max(wMin, wMax)),
          depth: rr(1.08, 1.38),
        });
      const comb = (dir, ascending) => {
        const out = [], mine = folds.filter(f => f.dir === dir);
        if (!ascending) mine.reverse();
        for (const f of mine) {
          const sgn = ascending ? 1 : -1, tip = dir * ri * (1 - f.depth), lip = dir * ri;
          out.push(new V3(f.x - sgn * f.w * 2.1, 0, lip));
          out.push(new V3(f.x - sgn * f.w * 1.45, 0, dir * ri * 0.86));   // ease off the wall
          out.push(new V3(f.x - sgn * f.w, 0, dir * ri * 0.42));
          out.push(new V3(f.x - sgn * f.w * 0.88, 0, tip * 0.66));
          out.push(new V3(f.x - sgn * f.w * 0.34, 0, tip));
          out.push(new V3(f.x + sgn * f.w * 0.34, 0, tip));
          out.push(new V3(f.x + sgn * f.w * 0.88, 0, tip * 0.66));
          out.push(new V3(f.x + sgn * f.w, 0, dir * ri * 0.42));
          out.push(new V3(f.x + sgn * f.w * 1.45, 0, dir * ri * 0.86));
          out.push(new V3(f.x + sgn * f.w * 2.1, 0, lip));
          /* WHERE THE FOLD LEAVES THE WALL is the crista junction: in a real
             organelle a ~25 nm neck held open by MICOS, and the reason the
             protons a fold pumps stay in that fold rather than washing into
             the whole intermembrane space. Recorded here and drawn as a
             pinch in the lumen, which is the only place a section can show
             it. */
          bases.push([f.x - sgn * f.w * 1.45, dir * ri * 0.86, f.w]);
          bases.push([f.x + sgn * f.w * 1.45, dir * ri * 0.86, f.w]);
        }
        return out;
      };
      const ctrl = [];
      ctrl.push(new V3(-Li - ri * 0.5, 0, 0.62 * ri));
      ctrl.push(...comb(1, true));                          // out along +z
      ctrl.push(new V3(Li + ri * 0.5, 0, 0.62 * ri), new V3(Li + ri * 0.8, 0, 0), new V3(Li + ri * 0.5, 0, -0.62 * ri));
      ctrl.push(...comb(-1, false));                        // back along -z
      ctrl.push(new V3(-Li - ri * 0.5, 0, -0.62 * ri), new V3(-Li - ri * 0.8, 0, 0));

      const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal', 0.5);
      const pathXZ = curve.getPoints(Math.round(460 * q)).map(p2 => [p2.x, p2.z]);

      // rho of the outer surface at x, so the ribbon can stand on the floor
      const rhoAt = x => (Math.abs(x) <= L ? r : Math.sqrt(Math.max(0, r * r - (Math.abs(x) - L) * (Math.abs(x) - L))));
      const BASE = 0.5, pts = [], scales = [], hs = [];
      for (const [x, z] of pathXZ) {
        const rho = Math.max(1e-3, rhoAt(x) - gapIM);
        const zz = clamp(z, -rho * 0.98, rho * 0.98);
        const floor = -Math.sqrt(Math.max(0.0001, rho * rho - zz * zz));
        const h = Math.max(0.06, -floor - 0.035 * r);
        pts.push(new V3(x, floor + h / 2, zz));
        scales.push([1, h / BASE]);
        hs.push(h);
      }

      /* ONE SHEET, ONE SWEEP. The inner membrane is a single ribbon of one
         membrane's thickness, cut on the same plane as the shell and painted
         with the same bands the plasma membrane's lip carries. The crista
         lumen is not drawn at all: it is the space the fold encloses, open
         at the junction onto the intermembrane space, because that is what
         it is. */
      const memMat = mat(Object.assign({ vertexColors: true, side: THREE.DoubleSide }, MEM_FINISH));
      gInner.add(new THREE.Mesh(
        sweepProfile(THREE, pts,
          bilayerProfile(THREE, th, BASE, col(ORG.mitochondrion.cristaSide), col(ORG.mitochondrion.cristaTop), col(ORG.mitochondrion.cristaSide)),
          { scales }),
        memMat));

      /* ---- where the machines go ----------------------------------------
         Along the ribbon, and which FACE matters: a complex's peripheral arm
         and a synthase's F1 head belong in the MATRIX, and on the other face
         of the same sheet they are in the intermembrane space doing
         chemistry with nothing. Which face that is cannot be guessed from
         being near a wall — the outside of a fold's arc looks out on matrix
         and the inside looks into the crista lumen — so it is settled by
         asking which side of the closed path a point falls on.

         ATP SYNTHASE GOES WHERE THE MEMBRANE TURNS. Dimer rows sit on the
         high-curvature rim of a crista, and the V-angle between the two
         monomers is what bends it — the shape of a fold is a consequence of
         where its machines are. Read off the path's own curvature, so a fold
         the seed happens to make tighter gets its synthases in the right
         place without anything being told about it. */
      const sites = { complex: [], synthase: [] };
      const pockets = { lumen: [], matrix: [], ims: [] };
      const n = pts.length;
      const frames = [];
      {
        const UP = new V3(0, 1, 0);
        for (let i = 0; i < n; i++) {
          const T = new V3().subVectors(pts[(i + 1) % n], pts[(i - 1 + n) % n]).normalize();
          const side = new V3().crossVectors(T, UP);
          if (side.lengthSq() < 1e-8) side.set(1, 0, 0);
          side.normalize();
          frames.push([side, new V3().crossVectors(side, T).normalize(), T]);
        }
      }
      /* WHICH FACE OF THE SHEET LOOKS OUT ON MATRIX. The path is one closed
         loop that hugs the wall and dives inward at every fold, so the
         region it encloses IS the matrix and everything outside it — the
         intermembrane space and the inside of every fold — is the other
         compartment. A point-in-polygon test settles it per sample, which is
         the only thing that gets a fold right: the OUTSIDE of a U's arc
         faces matrix and the inside faces the slot, and no rule about being
         near a wall can tell those apart.

         IT IS THE WHOLE LESSON, not a detail. A complex's peripheral arm
         oxidises NADH in the matrix and a synthase's F1 head makes ATP
         there; drawn on the other face they are in the intermembrane space,
         doing chemistry with nothing. */
      const inMatrix = (x, z) => {
        let inside = false;
        for (let i = 0, j = n - 1; i < n; j = i++) {
          const zi = pts[i].z, zj = pts[j].z;
          if ((zi > z) !== (zj > z) && x < (pts[j].x - pts[i].x) * (z - zi) / (zj - zi) + pts[i].x) inside = !inside;
        }
        return inside;
      };
      const KINDS = ['I', 'III', 'IV', 'I', 'IV', 'III', 'II', 'IV', 'III', 'I'];
      {
        const stepI = Math.max(2, Math.round(5 / q));
        /* A TIP IS WHERE THE SYNTHASES GO, and which samples are tips is read
           off the folds themselves rather than off a curvature threshold: a
           fold's arc is long and gently curved for most of its length, so a
           threshold puts dimer rows down the whole finger. */
        const atTip = (x, z) => folds.some(f => {
          const tz = f.dir * ri * (1 - f.depth), dx = x - f.x, dz = z - tz;
          return dx * dx + dz * dz < (f.w * 1.05) * (f.w * 1.05);
        });
        let kc = 0;
        for (let i = 0; i < n; i += stepI) {
          const [side, upv] = frames[i], h = hs[i], P = pts[i];
          /* A WALL TOO SHORT TO HOLD ONE. The ribbon stands on the floor of
             a curved bowl, so where it runs close to the wall it is only a
             sliver high — a machine there straddles its rim instead of
             sitting in it. */
          if (h < 0.30 * r) continue;
          const yOff = (rr(0.32, 0.68) - 0.5) * h;
          const mid = P.clone().addScaledVector(upv, yOff);
          /* A machine sits ON a face of the sheet, half a membrane out, and
             it is the matrix face every time. What is across from it is the
             space it pumps into. */
          const at = s => mid.clone().addScaledVector(side, s * (th / 2));
          const probe = P.clone().addScaledVector(side, th);
          const s = inMatrix(probe.x, probe.z) ? 1 : -1;
          const out = side.clone().multiplyScalar(s);
          const lumen = mid.clone().addScaledVector(side, -s * (th / 2 + 0.045 * r));
          if (atTip(P.x, P.z)) sites.synthase.push({ p: at(s), out, lumen });
          else sites.complex.push({ p: at(s), out, kind: KINDS[kc++ % KINDS.length], spin: rr(0, 2 * PI), lumen });
        }
      }

      /* ---- the machines, as instances ------------------------------------
         Iconic rather than deposited: complex I is the L every diagram draws
         (a long arm in the membrane, a peripheral arm out in the matrix
         where NADH is oxidised), III and IV are blocks through the membrane,
         II sits on the matrix face alone because it does not span it and
         does not pump. Sized up against the membrane they sit in — the
         factors are in cell/mitochondrion.js's SCALE. */
      {
        const CX = {
          /* Complex I's membrane arm is its HYDROPHOBIC domain: it lies in
             the bilayer and does not come out the far side. So its
             cross-section is measured against `th` and not against r —
             sized against the organelle it pokes through a sheet one
             membrane thick and reads as a slab laid over the back face. */
          I:   { color: RESP.complex,   arm: [0.115 * r, th * 0.9, th * 0.9], out: 0.070 * r, outR: 0.020 * r },
          II:  { color: RESP.complexII, arm: null, out: 0.052 * r, outR: 0.024 * r },
          III: { color: RESP.complex,   arm: null, out: 0.034 * r, outR: 0.029 * r, span: true },
          IV:  { color: RESP.complex,   arm: null, out: 0.031 * r, outR: 0.026 * r, span: true },
        };
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), one = new V3(1, 1, 1), Y = new V3(0, 1, 0);
        const place = (inst, i, p, dir, extra) => {
          qt.setFromUnitVectors(Y, dir);
          m4.compose(p, qt, extra || one);
          inst.setMatrixAt(i, m4);
        };
        for (const k in CX) {
          const list = sites.complex.filter(s => s.kind === k), c = CX[k];
          if (!list.length) continue;
          const material = mat({ color: c.color, roughness: 0.42, clearcoat: 0.35 });
          const body = new THREE.InstancedMesh(
            new THREE.CylinderGeometry(c.outR, c.outR * 0.85, c.out * (c.span ? 2.6 : 1), 10), material, list.length);
          /* A complex that SPANS sits centred in the wall and pokes out both
             sides; one that does not stands on the matrix face. */
          list.forEach((s, i) => place(body, i,
            s.p.clone().addScaledVector(s.out, c.span ? -th / 2 : c.out * 0.5), s.out));
          gComplex.add(body);
          if (c.arm) {
            /* Complex I's membrane arm lies IN the wall, so it turns about
               the wall's own normal — which is s.out — by an angle of its
               own. A box left unrotated would stand across the membrane
               instead of lying along it. */
            const armMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(c.arm[1], c.arm[2], c.arm[0]), material, list.length);
            const q2 = new THREE.Quaternion();
            list.forEach((s, i) => {
              qt.setFromUnitVectors(Y, s.out);
              q2.setFromAxisAngle(s.out, s.spin);
              m4.compose(s.p.clone().addScaledVector(s.out, -th / 2), q2.multiply(qt), one);
              armMesh.setMatrixAt(i, m4);
            });
            gComplex.add(armMesh);
          }
        }
        /* ATP synthase: an Fo c-ring in the membrane, a central stalk, and
           an F1 head drawn as one mushroom cap. The ROTOR turns (c-ring and
           stalk) and the head is held still by the peripheral stalk. A ring of
           eight c subunits, a mammal's, so the turning is visible on a
           shape that is otherwise round. The component drives the ring. */
        const ns = sites.synthase.length;
        if (ns) {
          const C_RING = 8;
          const gold = mat({ color: RESP.synthase, roughness: 0.38, clearcoat: 0.45 });
          const stalkMat = mat({ color: RESP.stalk, roughness: 0.45, clearcoat: 0.3 });
          const hub = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.016 * r, 0.016 * r, 0.046 * r, 10), stalkMat, ns);
          const ring = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009 * r, 0.009 * r, 0.046 * r, 8), gold, ns * C_RING);
          const stalk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.009 * r, 0.009 * r, 0.044 * r, 6), stalkMat, ns);
          // A lathe dome: flat underneath, rounding over the top along the axis.
          const capPts = [new THREE.Vector2(0, 0), new THREE.Vector2(0.024 * r, 0), new THREE.Vector2(0.042 * r, 0.004 * r)];
          for (let k = 1; k <= 8; k++) {
            const t = (k / 8) * PI / 2;
            capPts.push(new THREE.Vector2(0.042 * r * Math.cos(t), 0.004 * r + 0.030 * r * Math.sin(t)));
          }
          const capGeo = new THREE.LatheGeometry(capPts, 20);
          const f1 = new THREE.InstancedMesh(capGeo, gold, ns);
          const rotors = [];
          sites.synthase.forEach((s, i) => {
            place(hub, i, s.p.clone(), s.out);
            place(stalk, i, s.p.clone().addScaledVector(s.out, 0.044 * r), s.out);
            // A frame on the axis, so lobes can be laid out around it.
            const u = new V3(0, 1, 0).cross(s.out);
            if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
            u.normalize();
            const v = s.out.clone().cross(u).normalize();
            place(f1, i, s.p.clone().addScaledVector(s.out, 0.066 * r), s.out);
            rotors.push({ i, n: C_RING, centre: s.p.clone(), u, v, lobeR: 0.025 * r, q: new THREE.Quaternion().setFromUnitVectors(Y, s.out) });
          });
          gSynthase.add(hub, ring, stalk, f1);
          spinRotors(ring, rotors, 0);
          g.userData.rotors = { mesh: ring, list: rotors };
        }
      }

      /* ---- the matrix ----------------------------------------------------
         In the lobes between the folds, which is where there is room: the
         organelle's own circular genome and its own ribosomes, both a
         bacterium's, and both the reason a mitochondrion is read as one that
         moved in. A point is kept only if it clears the ribbon, or a
         nucleoid grows straight through a membrane. */
      /* Every sixth sample is enough to reject on: the path never doubles
         back inside one stride, and testing all of them made placing fifty
         ribosomes the most expensive thing in the build. */
      const clearsRibbon = (x, z, m) => {
        for (let i = 0; i < n; i += 6) {
          const dx = pts[i].x - x, dz = pts[i].z - z;
          if (dx * dx + dz * dz < m * m) return false;
        }
        return true;
      };
      const matrixPt = (margin) => {
        const m = margin === undefined ? ribbonT * 1.6 : margin;
        for (let t = 0; t < 60; t++) {
          const x = rr(-L * 0.94, L * 0.94);
          const rho = Math.max(1e-3, rhoAt(x) - gapIM);
          const z = rr(-0.92, 0.92) * rho;
          if (!clearsRibbon(x, z, m)) continue;
          const floor = -Math.sqrt(Math.max(0.0001, rho * rho - z * z));
          return new V3(x, floor * rr(0.25, 0.9), z);
        }
        return new V3(rr(-L, L), -0.4 * r, 0);
      };
      {
        const dnaMat = mat({ color: ORG.mitochondrion.dna, roughness: 0.55, clearcoat: 0.1 });
        for (let i = 0; i < (o.dna === undefined ? 2 : o.dna); i++) {
          const c = matrixPt(ribbonT * 2.4 + 0.13 * r), loop = [];
          for (let k = 0; k <= 24; k++) {
            const A = (k / 24) * 2 * PI, wob = 1 + 0.34 * Math.sin(A * 3 + i) + 0.2 * Math.sin(A * 5 + i * 2);
            loop.push(new V3(c.x + Math.cos(A) * 0.11 * r * wob, c.y + 0.035 * r * Math.sin(A * 2 + i), c.z + Math.sin(A) * 0.11 * r * wob));
          }
          gDna.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), Math.round(44 * q), 0.012 * r, 5, true), dnaMat));
        }
        const nR = Math.round((o.ribosomes === undefined ? 44 : o.ribosomes) * q);
        const ribo = new THREE.InstancedMesh(new THREE.SphereGeometry(0.024 * r, 6, 5),
          mat({ color: ORG.mitochondrion.matrix, roughness: 0.6, clearcoat: 0.1 }), nR);
        const m4 = new THREE.Matrix4();
        for (let i = 0; i < nR; i++) { const p = matrixPt(); m4.makeTranslation(p.x, p.y, p.z); ribo.setMatrixAt(i, m4); }
        gRibo.add(ribo);
      }

      /* Points inside each compartment, for the protons that live there. */
      for (let i = 0; i < 70; i++) pockets.matrix.push(matrixPt());
      /* THE LUMEN IS THE SLOT BETWEEN A FOLD'S TWO ARMS — nothing is drawn
         there, so a point in it is found from the fold rather than from the
         sheet: down the fold's own midline, between the junction and the
         tip. A point taken on the path would be inside the membrane. */
      for (let i = 0; i < 70; i++) {
        const f = folds[Math.floor(rr(0, folds.length)) % folds.length];
        const t = rr(0.1, 0.95), tz = f.dir * ri * (1 - f.depth), z = f.dir * ri * 0.9 + (tz - f.dir * ri * 0.9) * t;
        const rho = Math.max(1e-3, rhoAt(f.x) - gapIM), zz = clamp(z, -rho * 0.98, rho * 0.98);
        const floor = -Math.sqrt(Math.max(0.0001, rho * rho - zz * zz)), h = Math.max(0.06, -floor - 0.035 * r);
        pockets.lumen.push(new V3(f.x, floor + h * rr(0.25, 0.85), zz));
      }
      for (let i = 0; i < 60; i++) {
        const u = rr(0.03, 0.97), w = rr(0.10 * PI, cutW - 0.10 * PI);
        const a = outerS(u, w), nn = surfaceNormal(THREE, outerS, new V3(), u, w);
        pockets.ims.push(a.addScaledVector(nn, -(th + (gapIM - th) * 0.5)));
      }

      /* The two places on the ribbon a caption wants to point at, resolved to
         real path points rather than to the ideal control points they were
         drawn from: the tip of a fold, and the waist where that fold leaves
         the wall. A name that cannot be pointed at is a chip that says
         nothing. */
      const nearestOnPath = (x, z) => {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < n; i++) {
          const dx = pts[i].x - x, dz = pts[i].z - z, d = dx * dx + dz * dz;
          if (d < bd) { bd = d; bi = i; }
        }
        return pts[bi].clone();
      };
      const tips = folds.map(f => nearestOnPath(f.x, f.dir * ri * (1 - f.depth)));
      const necks = bases.map(b => nearestOnPath(b[0], b[1]));

      g.userData.parts = { shell: outerMesh };
      g.userData.detail = {
        groups: { outer: gOuter, porin: gPorin, inner: gInner,
                  complex: gComplex, synthase: gSynthase, dna: gDna, ribosome: gRibo },
        sites, pockets, path: pts, frames, heights: hs, folds, tips, necks,
        dims: { r, L, th, lumenT, ribbonT, gapIM, cutW, pitch, porins: nPorins,
                cristae: nFold, junctions: necks.length,
                complexes: sites.complex.length, synthases: sites.synthase.length },
      };
      return g;
    }


    /* =====================================================================
       chloroplastDetail — the same plastid with its membranes resolved
       =====================================================================
       `chloroplast()` above is the organelle as one of several in a cut
       leaf cell: a glass envelope, grana as opaque stacks, lamellae between.
       This is the same organelle when it is the SUBJECT — what
       cell/chloroplast.js mounts on its own, one rung above the thylakoid
       membrane that membrane/membrane.js draws with context:'thylakoid'.
       Cut open like the detailed mitochondrion rather than drawn as glass:
       the reader is looking INTO it now, and a cut is how a bowl of stroma
       with stacks standing in it reads.

       WHAT THE DETAIL IS FOR is two claims about where things are:

       · THE THYLAKOID IS ONE MEMBRANE ENCLOSING ONE SPACE. Every granum is
         joined to its neighbours by stroma lamellae, so the lumen inside a
         disc in one stack is the lumen inside every other, and a proton
         gradient built anywhere in the system drives ATP synthase
         everywhere in it. Separate piles of coins say the opposite, so no
         granum is drawn without a lamella leaving it.

       · THE MACHINES SORT THEMSELVES BY WHERE THEY FIT. Photosystem II sits
         in the APPRESSED faces, where one disc presses against the next;
         photosystem I and ATP synthase sit only where the membrane is open
         to the stroma — the end discs of a stack, the rims, and the
         lamellae — because both carry a bulk that hangs into the stroma and
         there is no room for it between stacked discs. `APPRESSED` below
         is the list of what an appressed face may hold, and
         check-chloroplast.js reads it.

       CUT ON THE BROAD FACE, THE STACKS STANDING. The discs lie flat,
       parallel to the lens's two broad faces and stacked along its
       thickness, which is where they really are, so every granum is a
       column of coins standing on the floor of the bowl. From straight
       above only the top coin shows; the default camera is oblique so the
       stacking and the faces read together, the way every drawn
       chloroplast shows them. Builder frame: x the long axis, y the thin
       axis (the cut normal), z the width.

       SCALE. One scene unit is 100 nm, the same as the mitochondrion's,
       and the lens is honest to it: 5 µm long, 2.4 wide, 1.6 thick. A thylakoid
       membrane, the lumen, the gap between stacked discs and the envelope
       gap are exaggerated; cell/chloroplast.js declares the factors from the
       numbers handed in here.

       Returns a group whose `userData.detail` carries the named subgroups,
       the machine sites (each with its stroma-facing `out` and a `lumen`
       point behind the membrane), the grana, and pockets of points inside
       each compartment. The geometry is here; the protons moving through
       it, the rotors turning and everything a page can click are the
       component's. */
    const APPRESSED = ['psii', 'b6f'];
    function chloroplastDetail(o = {}) {
      const g = new THREE.Group();
      const a = o.a || 25, b = o.b || 8, c = o.c || 12;   // long axis · thickness (the bowl's depth) · width
      const q = o.detail === undefined ? 1 : o.detail;
      const th = o.membrane === undefined ? 0.10 : o.membrane;        // one membrane, drawn — envelope and thylakoid alike
      const lumenT = o.lumen === undefined ? 0.12 : o.lumen;           // the space inside a thylakoid
      const gapT = o.gap === undefined ? 0.10 : o.gap;                 // the stroma between two stacked discs
      const gapE = o.ims === undefined ? 0.25 : o.ims;                 // between the two envelope membranes
      const discT = 2 * th + lumenT, rep = discT + gapT;               // one disc, and the stack's repeat
      const open = clamp(o.open === undefined ? 1 : o.open, 0.3, 1);
      const cutW = (PI / 2) * (1 + 0.5 * (1 - open));
      const PHO = global.MolPalette ? global.MolPalette.photosynthesis : global.MolLib.PALETTE.photosynthesis;
      const CH = ORG.chloroplast;

      const sub = name => { const s = new THREE.Group(); s.userData.part = name; g.add(s); return s; };
      const gOuter = sub('outer'), gInner = sub('inner'), gGranum = sub('granum'), gLamella = sub('lamella'),
            gPsii = sub('psii'), gB6f = sub('b6f'), gPsi = sub('psi'), gSynthase = sub('synthase'),
            gDna = sub('dna'), gRibo = sub('ribosome');

      /* ---- the envelope: two membranes, a gap between ------------------
         The same grain as plastidShell's, so the two levels of detail are
         one object; w runs from the bottom pole to the cut. */
      const radius = d => 1 + 0.035 * noise.fbm(d.x * 2.2 + 5, d.y * 2.2 + 2, d.z * 2.2, 2);
      const lensS = (ax, by, cz) => (u, w) => { const d = dirUW(u, w); const r = radius(d); return new V3(d.x * ax * r, d.y * by * r, d.z * cz * r); };
      const MEM_FINISH = { roughness: 0.42, clearcoat: 0.5 };
      const shell = (S, colors) => new THREE.Mesh(buildShell(THREE, {
        S, uRange: [0, 2 * PI], wRange: () => [0, cutW], uSeg: Math.round(160 * q), uPeriodic: true,
        thickness: th, segs: { outer: Math.round(40 * q), rim: Math.max(4, Math.round(6 * q)), inner: Math.round(40 * q) },
        colors,
      }), mat(Object.assign({ vertexColors: true }, MEM_FINISH)));
      gOuter.add(shell(lensS(a, b, c), shellOf(CH)));
      /* The inner face of the inner envelope is the stroma: it is what the
         bowl is full of, and the grana stand against it. */
      const ai = a - th - gapE, bi = b - th - gapE, ci = c - th - gapE;
      gInner.add(shell(lensS(ai, bi, ci), { outer: col(CH.envelopeInner), inner: col(CH.stroma), rim: col(CH.rim) }));
      const aIn = ai - th, bIn = bi - th, cIn = ci - th;
      // depth of the stroma floor under (x, z), ignoring the shell's grain
      const floorAt = (x, z) => -bIn * Math.sqrt(Math.max(0, 1 - (x / aIn) ** 2 - (z / cIn) ** 2)) * 0.96;

      /* ---- the grana ------------------------------------------------------
         ONE LAYOUT, AUTHORED. There is no call for a different chloroplast
         each time, and a packing left to chance put stacks where a reader
         could not see them. Each entry is a granum standing on the floor of
         the bowl: x and z in the cut plane, a disc radius, a disc count.
         Stacks stand UP, their axis the lens's thin axis, so from an
         oblique view both the stacking and the disc faces read, which is
         how every drawn chloroplast shows them. LINKS says which stacks a
         lamella joins, and every stack is in it at least once. */
      const LAYOUT = [
        [-19.0,  0.0, 1.6, 5], [-14.0,  3.5, 2.0, 7], [-13.0, -3.5, 1.9, 6],
        [ -8.0,  0.5, 2.3, 9], [ -3.0,  4.5, 2.1, 8], [ -3.0, -4.5, 2.2, 8],
        [  2.0,  0.0, 2.4, 10], [  7.0,  4.5, 2.1, 8], [  7.0, -4.5, 2.0, 7],
        [ 12.0,  0.5, 2.3, 9], [ 16.5,  3.5, 1.9, 6], [ 16.5, -3.5, 1.9, 6],
        [ 20.5,  0.0, 1.5, 5],
      ];
      const LINKS = [[0, 1], [0, 2], [1, 3], [2, 3], [3, 4], [3, 5], [4, 6], [5, 6], [6, 7], [6, 8],
                     [7, 9], [8, 9], [9, 10], [9, 11], [10, 12], [11, 12], [1, 4], [8, 11]];
      const UP = new V3(0, 1, 0);
      const grana = [];
      for (const [x, z, rad0, n0] of LAYOUT) {
        const depth = -floorAt(x, z);
        // a stack must clear the cut by a little and the floor by a little
        const n = Math.max(3, Math.min(n0, Math.floor((depth - 0.6) / rep)));
        const rad = Math.min(rad0, depth * 0.45);
        const h = n * rep;
        const axis = new V3(rr(-0.05, 0.05), 1, rr(-0.05, 0.05)).normalize();
        const side = new V3(1, 0, 0).addScaledVector(axis, -axis.x).normalize();
        const up = new V3().crossVectors(axis, side).normalize();
        const centre = new V3(x, floorAt(x, z) + 0.3 + h / 2, z);
        const discs = [];
        for (let k = 0; k < n; k++) discs.push(centre.clone().addScaledVector(axis, (k - (n - 1) / 2) * rep));
        grana.push({ centre, axis, side, up, rad, n, h, foot: rad + 0.5, discs, lumen: [] });
      }

      /* Every disc is one instance of one lathed sac, stood on its side.
         Faintly transparent so a proton that has gone INTO one still reads. */
      /* Lit face of a disc: the granum colour, a lime the dark stroma floor
         shows the gaps against. Opaque; the stacking is what has to read. */
      const thyMat = mat(Object.assign({ color: CH.granum }, MEM_FINISH));
      const nDiscs = grana.reduce((s, G) => s + G.n, 0);
      {
        const inst = new THREE.InstancedMesh(thylakoidDisc(1, 1, Math.max(12, Math.round(30 * q))), thyMat, nDiscs);
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), sc = new V3();
        let i = 0;
        for (const G of grana) {
          qt.setFromUnitVectors(UP, G.axis);
          for (const d of G.discs) {
            sc.set(G.rad * rr(0.97, 1.03), discT, G.rad * rr(0.97, 1.03));
            m4.compose(d, qt, sc);
            inst.setMatrixAt(i++, m4);
          }
        }
        gGranum.add(inst);
      }

      /* ---- the lamellae: what makes it one membrane -----------------------
         A flattened tube from the rim of each granum to the rim of its
         nearest neighbours, sagging a little so it reads as a sheet and not
         a strut. A granum with no neighbour in reach is joined to the
         nearest one regardless: an island would say a separate lumen. */
      const lamMat = mat(Object.assign({ color: CH.lamella, transparent: true, opacity: 0.9 }, MEM_FINISH));
      const lamR = 0.6, LAM_FLAT = 0.16;
      const lamellae = [];
      const rimToward = (G, dir) => {
        const rp = dir.clone().addScaledVector(G.axis, -dir.dot(G.axis));
        if (rp.lengthSq() < 0.05) return G.centre.clone().addScaledVector(G.axis, Math.sign(dir.dot(G.axis)) * (G.h / 2 + 0.1));
        rp.normalize();
        return G.centre.clone().addScaledVector(rp, G.rad * 0.4).addScaledVector(G.axis, rr(-0.35, 0.2) * G.h);
      };
      {
        const linked = new Set();
        const join = (i, j) => {
          const key = i < j ? i + ':' + j : j + ':' + i;
          if (linked.has(key)) return;
          linked.add(key);
          const A = grana[i], B = grana[j];
          const dir = new V3().subVectors(B.centre, A.centre); dir.y = 0; dir.normalize();
          const p0 = rimToward(A, dir), p2 = rimToward(B, dir.clone().negate());
          // stay on the stack's side: within its height, and above the floor
          const onStack = (p, G) => clamp(p.y, Math.max(floorAt(p.x, p.z) + 0.4, G.centre.y - G.h / 2 + 0.2), Math.min(-0.5, G.centre.y + G.h / 2 - 0.2));
          p0.y = onStack(p0, A); p2.y = onStack(p2, B);
          const p1 = p0.clone().add(p2).multiplyScalar(0.5);
          p1.y -= rr(0.1, 0.5);
          p1.addScaledVector(new V3(-dir.z, 0, dir.x), rr(-0.15, 0.15) * p0.distanceTo(p2));
          const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
          const tSeg = Math.max(8, Math.round(24 * q)), rSeg = Math.max(6, Math.round(10 * q));
          const geo = new THREE.TubeGeometry(curve, tSeg, lamR, rSeg, false);
          // flatten each ring about its own centreline; a world-space scale pulls the sheet off the stacks
          const pos = geo.attributes.position, c = new V3();
          for (let t = 0; t <= tSeg; t++) {
            curve.getPointAt(t / tSeg, c);
            // flare at each end, wider and thinner, so the sheet fans into the disc it leaves
            const e = Math.max(0, 1 - Math.min(t / tSeg, 1 - t / tSeg) / 0.3) ** 2;
            const wide = 1 + 1.6 * e, flat = LAM_FLAT * (1 - 0.4 * e);
            for (let r = 0; r <= rSeg; r++) {
              const k = t * (rSeg + 1) + r;
              pos.setXYZ(k, c.x + (pos.getX(k) - c.x) * wide, c.y + (pos.getY(k) - c.y) * flat, c.z + (pos.getZ(k) - c.z) * wide);
            }
          }
          geo.computeVertexNormals();
          gLamella.add(new THREE.Mesh(geo, lamMat));
          lamellae.push({ curve, i, j });
        };
        for (let i = 0; i < grana.length; i++) {
          const near = grana.map((G, j) => ({ j, d: G.centre.distanceTo(grana[i].centre) }))
            .filter(x => x.j !== i).sort((p, q2) => p.d - q2.d);
          const reach = (grana[i].foot + 2) * 2.2;
          let made = 0;
          for (const x of near) { if (x.d > reach && made > 0) break; join(i, x.j); if (++made >= 2) break; }
        }
      }

      /* ---- where the machines go -----------------------------------------
         Each site is a point ON a membrane with `out` pointing into the
         stroma and `lumen` a point just behind it, inside the sac. An
         appressed face — the gap between two stacked discs — may hold only
         what APPRESSED lists. Everything open to the stroma may hold
         anything, and that is where every synthase and every PSI goes. */
      const sites = { psii: [], b6f: [], psi: [], synthase: [] };
      const put = (kind, p, out, lumen, G) => sites[kind].push({ p, out, lumen, spin: rr(0, 2 * PI), granum: G ? grana.indexOf(G) : -1 });
      const inPlane = (G, f, theta) => G.up.clone().multiplyScalar(Math.cos(theta) * f * G.rad).addScaledVector(G.side, Math.sin(theta) * f * G.rad);
      for (const G of grana) {
        /* Appressed faces: the gap between disc k-1 and disc k. The upper
           half of the disc is the half the reader can see from above. */
        for (let k = 1; k < G.n; k++) {
          const gapC = G.centre.clone().addScaledVector(G.axis, (k - 0.5 - (G.n - 1) / 2) * rep);
          const m = 1 + Math.floor(rand() * 2);
          for (let s = 0; s < m; s++) {
            const off = inPlane(G, rr(0.5, 0.9), rr(-1, 1) * PI);
            const which = rand() < 0.5 ? -1 : 1;             // which of the two discs it belongs to
            const p = gapC.clone().add(off);
            const out = G.axis.clone().multiplyScalar(-which);   // into the gap, away from its own disc
            const lumen = p.clone().addScaledVector(G.axis, which * (gapT / 2 + th + lumenT / 2));
            const kind = APPRESSED[rand() < 0.72 ? 0 : 1];
            put(kind, p, out, lumen, G);
          }
        }
        /* The two end faces, open to the stroma. */
        for (const e of [-1, 1]) {
          const face = G.centre.clone().addScaledVector(G.axis, e * (G.h / 2 - th / 2));
          const m = 2 + Math.floor(rand() * 2);
          for (let s = 0; s < m; s++) {
            const off = inPlane(G, rr(0.3, 0.85), rr(-1, 1) * PI);
            const p = face.clone().add(off), out = G.axis.clone().multiplyScalar(e);
            const lumen = p.clone().addScaledVector(G.axis, -e * (th + lumenT / 2));
            const kind = ['psi', 'synthase', 'b6f'][s % 3];
            put(kind, p, out, lumen, G);
          }
        }
        /* The margins: the rim of every disc. Synthase rows and PSI live
           here, where CF1 has stroma to hang into. */
        const mm = 3 + Math.floor(rand() * 3);
        for (let s = 0; s < mm; s++) {
          const k = Math.floor(rand() * G.n), theta = rr(-1, 1) * PI;
          const radial = inPlane(G, 1, theta).normalize();
          const p = G.discs[k].clone().addScaledVector(radial, G.rad);
          const lumen = G.discs[k].clone().addScaledVector(radial, G.rad - th - 0.15);
          put(rand() < 0.6 ? 'synthase' : 'psi', p, radial, lumen, G);
        }
      }
      /* Along each lamella, on its top face. */
      for (const L of lamellae) {
        const m = 2 + Math.floor(rand() * 3);
        for (let s = 0; s < m; s++) {
          const t = rr(0.15, 0.85);
          const at = L.curve.getPoint(t);
          const p = at.clone().addScaledVector(UP, lamR * LAM_FLAT);
          put(['psi', 'synthase', 'b6f', 'psi'][s % 4], p, UP.clone(), at.clone(), null);
        }
      }

      /* ---- the machines, as instances ------------------------------------
         Iconic. PSII carries its water-splitting bulk on the LUMEN side, PSI
         its ferredoxin-binding ridge on the STROMA side, so the two
         silhouettes say which way each faces. b6f is a block through the
         membrane. Each spans the sheet it sits in. */
      {
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), one = new V3(1, 1, 1), Y = new V3(0, 1, 0);
        const place = (inst, i, p, dir) => { qt.setFromUnitVectors(Y, dir); m4.compose(p, qt, one); inst.setMatrixAt(i, m4); };
        const body = (list, group, color, r, h, bump) => {
          if (!list.length) return null;
          const material = mat({ color, roughness: 0.42, clearcoat: 0.35 });
          const cyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(r, r * 0.9, h, 10), material, list.length);
          list.forEach((s, i) => place(cyl, i, s.p, s.out));
          group.add(cyl);
          if (bump) {
            const sph = new THREE.InstancedMesh(new THREE.SphereGeometry(bump.r, 10, 8), material, list.length);
            list.forEach((s, i) => place(sph, i, s.p.clone().addScaledVector(s.out, bump.at), s.out));
            group.add(sph);
          }
          return material;
        };
        const psiiMat = body(sites.psii, gPsii, PHO.psii, 0.20, 0.36, { r: 0.15, at: -0.24 });
        body(sites.b6f, gB6f, PHO.b6f, 0.15, 0.36, null);
        body(sites.psi, gPsi, PHO.psi, 0.19, 0.32, { r: 0.10, at: 0.22 });
        g.userData.psiiMaterial = psiiMat;
        /* ATP synthase: CFo in the membrane, a stalk, a CF1 head of three
           lobes — one ATP per third of a turn, so the beats can be counted.
           The head turns; the component drives it through spinRotors. */
        const ns = sites.synthase.length;
        if (ns) {
          const gold = mat({ color: PHO.synthase, roughness: 0.38, clearcoat: 0.45 });
          const stalkMat = mat({ color: PHO.stalk, roughness: 0.45, clearcoat: 0.3 });
          const fo = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.17, 0.17, 0.26, 10), gold, ns);
          const stalk = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 0.30, 6), stalkMat, ns);
          const f1 = new THREE.InstancedMesh(new THREE.SphereGeometry(0.14, 10, 8), gold, ns * 3);
          const rotors = [];
          sites.synthase.forEach((s, i) => {
            place(fo, i, s.p.clone(), s.out);
            place(stalk, i, s.p.clone().addScaledVector(s.out, 0.27), s.out);
            const u = new V3(0, 1, 0).cross(s.out);
            if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
            u.normalize();
            const v = s.out.clone().cross(u).normalize();
            rotors.push({ i, centre: s.p.clone().addScaledVector(s.out, 0.50), u, v, lobeR: 0.15 });
          });
          gSynthase.add(fo, stalk, f1);
          spinRotors(f1, rotors, 0);
          g.userData.rotors = { mesh: f1, list: rotors };
        }
      }

      /* THREE STARCH GRAINS, where the day's sugar is parked. The same layered
         grain the amyloplast draws, and the same starch colour, because it
         is the same substance. Authored into gaps between stacks: x, z, radius. */
      const gStarch = sub('starch');
      g.userData.starch = [];
      {
        const grainMat = mat({ color: ORG.amyloplast.starch, roughness: 0.72, clearcoat: 0.12 });
        for (const [sx, sz, R0] of [[-9, -5, 1.7], [10, 7.5, 1.3], [12, -6.5, 1.3]]) {
          const cy = floorAt(sx, sz) + R0 * 0.85;
          const geo = displace(new THREE.SphereGeometry(1, 28, 20), (px, py, pz) => {
            const d = 1 + 0.05 * noise.noise3(px * 3 + sx, py * 3, pz * 3 + sz); return [px * d, py * d, pz * d];
          });
          const grain = new THREE.Mesh(geo, grainMat);
          grain.scale.set(R0 * 1.25, R0 * 0.8, R0);
          grain.position.set(sx, cy, sz);
          gStarch.add(grain);
          g.userData.starch.push(grain.position.clone());
        }
      }

      /* ---- the stroma ------------------------------------------------------
         Its own genome, in several copies, and its own 70S ribosomes: a
         cyanobacterium's, and the reason a chloroplast is read as one that
         moved in. Placed where they clear the stacks. */
      const clearsGrana = (x, y, z, m) => grana.every(G => {
        const d = new V3(x, y, z).sub(G.centre);
        const along = Math.abs(d.dot(G.axis)), across = d.clone().addScaledVector(G.axis, -d.dot(G.axis)).length();
        return along > G.h / 2 + m || across > G.rad + m;
      });
      const stromaPt = (margin = 0.4) => {
        for (let t = 0; t < 80; t++) {
          const x = rr(-0.92, 0.92) * aIn, z = rr(-0.9, 0.9) * cIn;
          if ((x / aIn) ** 2 + (z / cIn) ** 2 > 0.9) continue;
          const fl = floorAt(x, z);
          const y = rr(fl * 0.88, -0.35);
          if (!clearsGrana(x, y, z, margin)) continue;
          if (g.userData.starch.some(c0 => c0.distanceTo(new V3(x, y, z)) < 2.4 + margin)) continue;
          return new V3(x, y, z);
        }
        return new V3(rr(-aIn, aIn) * 0.5, -0.6, 0);
      };
      {
        const dnaMat = mat({ color: CH.dna, roughness: 0.55, clearcoat: 0.1 });
        for (let i = 0; i < (o.dna === undefined ? 3 : o.dna); i++) {
          const cc = stromaPt(0.9), loop = [];
          for (let k = 0; k <= 24; k++) {
            const A = (k / 24) * 2 * PI, wob = 1 + 0.34 * Math.sin(A * 3 + i) + 0.2 * Math.sin(A * 5 + i * 2);
            loop.push(new V3(cc.x + Math.cos(A) * 0.55 * wob, cc.y + 0.18 * Math.sin(A * 2 + i), cc.z + Math.sin(A) * 0.55 * wob));
          }
          gDna.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(loop, true), Math.round(44 * q), 0.06, 5, true), dnaMat));
        }
        const nR = Math.round((o.ribosomes === undefined ? 70 : o.ribosomes) * q);
        /* A 70S ribosome is ~25 nm: drawn ~2.8× like the machines, so it is
           not the smallest thing on stage when it is bigger than a
           photosystem. Two unequal subunits. */
        const riboMat = mat({ color: CH.ribosome, roughness: 0.6, clearcoat: 0.1 });
        const big = new THREE.InstancedMesh(new THREE.SphereGeometry(0.3, 10, 8), riboMat, nR);
        const small = new THREE.InstancedMesh(new THREE.SphereGeometry(0.21, 8, 6), riboMat, nR);
        const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), off = new V3();
        for (let i = 0; i < nR; i++) {
          const p = stromaPt(0.7);
          qt.setFromEuler(new THREE.Euler(rr(0, 2 * PI), rr(0, 2 * PI), rr(0, 2 * PI)));
          m4.compose(p, qt, new V3(1, 0.8, 1)); big.setMatrixAt(i, m4);
          off.set(0, 0.3, 0).applyQuaternion(qt).add(p);
          m4.compose(off, qt, new V3(1, 0.75, 1)); small.setMatrixAt(i, m4);
        }
        gRibo.add(big, small);
      }

      /* Points inside each compartment, for the protons that live there. A
         lumen point is INSIDE a disc — in its plane, short of its rim — and
         is kept on the granum so a proton pumped into one stack collects in
         that stack. */
      const pockets = { stroma: [], lumen: [], ims: [] };
      for (let i = 0; i < 90; i++) pockets.stroma.push(stromaPt(0.3));
      for (const G of grana)
        for (let i = 0; i < 4 + G.n; i++) {
          const k = Math.floor(rand() * G.n);
          const p = G.discs[k].clone().add(inPlane(G, rr(0.1, 0.8), rr(-0.7, 0.7) * PI));
          G.lumen.push(p); pockets.lumen.push(p);
        }
      for (const L of lamellae) for (let i = 0; i < 3; i++) { const p = L.curve.getPoint(rr(0.1, 0.9)); pockets.lumen.push(p); }
      {
        const S = lensS(a, b, c);
        for (let i = 0; i < 40; i++) {
          const u = rr(0, 2 * PI), w = rr(0.12 * PI, cutW - 0.08 * PI);
          const p = S(u, w), nn = surfaceNormal(THREE, S, new V3(), u, w);
          pockets.ims.push(p.addScaledVector(nn, -(th + gapE / 2)));
        }
      }

      g.userData.parts = { shell: gOuter.children[0] };
      g.userData.detail = {
        groups: { outer: gOuter, inner: gInner, granum: gGranum, lamella: gLamella,
                  psii: gPsii, b6f: gB6f, psi: gPsi, synthase: gSynthase, starch: gStarch, dna: gDna, ribosome: gRibo },
        sites, pockets, grana, lamellae,
        dims: { a, b, c, th, lumenT, gapT, gapE, rep, cutW,
                grana: grana.length, thylakoids: nDiscs, lamellae: lamellae.length,
                psii: sites.psii.length, b6f: sites.b6f.length, psi: sites.psi.length, synthases: sites.synthase.length,
                granumRad: grana.length ? grana.reduce((s, G) => s + G.rad, 0) / grana.length : 0 },
      };
      return g;
    }

    /* ---- parts: anchors, layers and a palette off the registered list ----
       Both cells register every organelle they build under a reader's name,
       and both owe a component's four part-facing things off that one list.
       Live, not cached: the plant cell throws its whole layer away on a
       tissue switch, so a baked anchor would point at a retired organelle.
       `parent` is the test for whether one is still on stage.

       A name with several instances anchors on the FIRST. A callout saying
       "mitochondrion" wants one mitochondrion, not the centroid of five,
       which lands in the cytosol between them. */
    function partsOf(organelles, library = {}) {
      const _b = new THREE.Box3(), _s = new THREE.Sphere();
      const hidden = {};
      const order = () => {
        const seen = [];
        for (const g of organelles) { const n = g.userData.organelle; if (g.parent && !seen.includes(n)) seen.push(n); }
        return seen;
      };
      const of = n => organelles.filter(g => g.userData.organelle === n && g.parent);
      const first = n => of(n)[0] || null;
      const centre = g => { g.updateWorldMatrix(true, true); return _b.setFromObject(g).getBoundingSphere(_s).center; };
      const anchors = {};
      for (const n of Object.keys(library)) {
        anchors[n] = () => { const g = first(n); return g && g.visible ? centre(g) : null; };
      }
      const show = (n, on) => { hidden[n] = !on; for (const g of of(n)) g.visible = !!on; };
      // After a rebuild the new objects are visible whatever was hidden before.
      const reapply = () => { for (const n in hidden) if (hidden[n]) show(n, false); };
      const layers = () => order().map(n => ({ name: n, label: (library[n] && library[n].text) || n, on: !hidden[n] }));
      return { order, of, first, centre, anchors, show, reapply, layers, hidden };
    }

    return { rand, rr, noise, col, mat, shellOf, bilayerOf, dirUW, partsOf, ORG,
             nucleus, mitochondrion, mitochondrionDetail, spinRotors, golgi, roughER, chloroplast, chloroplastDetail, amyloplast, vacuole };
  }

  global.CellOrganelles = {
    kit, seededRandom, makeNoise, surfaceNormal, buildShell, roundedRectProfile, bilayerProfile, sweepProfile, displace,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
