/* cell-division/objects.js: scene objects driven by keyframe tracks. */
(function (CD) {
  'use strict';

  const V3 = THREE.Vector3;
  const TAU = CD.TAU;
  const N = CD.N_PTS;
  const M = CD.N_RAD;
  const UP = new V3(0, 1, 0);

  const PLANE_MARGIN = 0.14; // just over a chromatid's radius

  const tmp = new V3();
  const tmp2 = new V3();
  const tmp3 = new V3();

  function sampleAll(tracks, t, st) {
    for (let i = 0; i < tracks.length; i++) tracks[i].sample(t, st);
    return st;
  }

  // Project v onto the plane perpendicular to unit U and store it (normalized) in target.
  // If v is (nearly) parallel to U the previous target is kept, re-orthogonalized.
  function orthoInto(target, v, U) {
    tmp2.copy(v).addScaledVector(U, -v.dot(U));
    if (tmp2.lengthSq() > 1e-6) {
      target.copy(tmp2).normalize();
    } else {
      target.addScaledVector(U, -target.dot(U));
      if (target.lengthSq() < 1e-8) CD.anyPerp(U, target);
      target.normalize();
    }
  }

  // ================================================================ Chromatid
  class Chromatid {
    constructor(def, parent) {
      this.def = def;
      this.st = {};
      this.mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.48,
        metalness: 0,
        emissive: new THREE.Color(0xffffff),
        emissiveIntensity: 0,
      });
      this.tube = new CD.Tube(N, M, this.mat);
      this.mesh = this.tube.mesh;
      parent.add(this.mesh);

      this.kin = new THREE.Mesh(CD.geo.kin, CD.mat.kin);
      parent.add(this.kin);

      this.pts = [];
      this.rod = [];
      for (let i = 0; i < N; i++) {
        this.pts.push(new V3());
        this.rod.push(new V3());
      }
      this.radii = new Float32Array(N);
      this.cond = new Float32Array(N);
      // Per-sample offsets so condensation ripples along the fibre instead of scaling uniformly.
      this.w = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        this.w[i] = 0.5 + 0.5 * Math.sin(i * 0.23 + def.seed) * Math.cos(i * 0.061 + def.seed * 0.7);
      }

      this.U = new V3(0, 1, 0);
      this.F = new V3(1, 0, 0);
      this.S = new V3(0, 0, 1);
      this.C = new V3();
      this.kinPos = new V3();
      this.ic = Math.round(def.cf * (N - 1));

      this.base = new THREE.Color(def.color).convertSRGBToLinear();
      this.alt = def.xo ? new THREE.Color(def.xo.color).convertSRGBToLinear() : null;
      // G-band style darker stripes, shared by homologs.
      this.band = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        let dark = 0;
        for (const b of def.bands) {
          const x = Math.abs(t - b.c) / b.w;
          if (x < 1) dark = Math.max(dark, b.d * (1 - x * x) * (1 - x * x));
        }
        this.band[i] = 1 - dark;
      }
      this.lastX = -1;
      this.paint(0);
    }

    paint(x) {
      const col = new THREE.Color();
      const xf = this.def.xo ? this.def.xo.xf : 0;
      for (let i = 0; i < N; i++) {
        const t = i / (N - 1);
        col.copy(this.base);
        if (this.alt && x > 0) col.lerp(this.alt, CD.smoothstep(xf - 0.012, xf + 0.012, t) * x);
        col.multiplyScalar(this.band[i]);
        this.tube.setRingColor(i, col);
      }
      this.tube.colorAttr.needsUpdate = true;
      this.lastX = x;
    }

    // Trailing arms may not reach back past the division plane (through st.P, facing F),
    // otherwise they swing into the partner moving to the opposite pole. Drag is scaled
    // down until the deepest point of the rod stays clear of the plane.
    computeRod() {
      const st = this.st;
      let drag = st.drag;
      if (drag < 0.001 || !st.P) {
        this.integrateRod(drag);
        return;
      }
      const clear = Math.max(0, tmp3.subVectors(this.C, st.P).dot(this.F) - PLANE_MARGIN);
      let depth = this.integrateRod(drag);
      for (let k = 0; k < 4 && depth > clear + 1e-3; k++) {
        drag = clear > 0 ? drag * (clear / depth) : 0;
        depth = this.integrateRod(drag);
      }
    }

    // Condensed shape: arms integrated outward from the centromere, bending toward
    // the sister-splay direction S and trailing away from the pole-facing direction F.
    // Returns how far the rod reaches behind the centromere along -F.
    integrateRod(drag) {
      const d = this.def;
      const L = d.len;
      const cf = d.cf;
      const st = this.st;
      const U = this.U;
      const F = this.F;
      const S = this.S;
      const C = this.C;
      const rod = this.rod;
      const splay = st.splay;
      const dir = tmp;
      let depth = 0;

      const step = (sAbs, sgn) => {
        const a = drag * Math.min(sAbs * 1.9, 1.2);
        const b = splay * Math.min(sAbs * 2.6, 1);
        dir.copy(U).multiplyScalar(sgn).addScaledVector(F, -Math.tan(a)).addScaledVector(S, Math.tan(b)).normalize();
      };

      const iHi = Math.ceil(cf * (N - 1));
      let px = C.x;
      let py = C.y;
      let pz = C.z;
      let prev = 0;
      for (let i = iHi; i < N; i++) {
        const s = (i / (N - 1) - cf) * L;
        step((prev + s) * 0.5, 1);
        const ds = s - prev;
        px += dir.x * ds;
        py += dir.y * ds;
        pz += dir.z * ds;
        rod[i].set(px, py, pz);
        depth = Math.max(depth, (C.x - px) * F.x + (C.y - py) * F.y + (C.z - pz) * F.z);
        prev = s;
      }
      px = C.x;
      py = C.y;
      pz = C.z;
      prev = 0;
      for (let i = iHi - 1; i >= 0; i--) {
        const s = (i / (N - 1) - cf) * L;
        step(-(prev + s) * 0.5, -1);
        const ds = prev - s;
        px += dir.x * ds;
        py += dir.y * ds;
        pz += dir.z * ds;
        rod[i].set(px, py, pz);
        depth = Math.max(depth, (C.x - px) * F.x + (C.y - py) * F.y + (C.z - pz) * F.z);
        prev = s;
      }
      return depth;
    }

    update(t, x) {
      const st = sampleAll(this.def.tracks, t, this.st);
      const d = this.def;

      if (st.U.lengthSq() > 1e-6) this.U.copy(st.U).normalize();
      orthoInto(this.F, st.F, this.U);
      orthoInto(this.S, st.S, this.U);

      this.C.copy(st.C);
      if (st.jit > 0.001) {
        CD.jitter(t, d.seed, tmp);
        this.C.addScaledVector(tmp, st.jit * 0.05);
      }
      this.computeRod();

      const c = st.c;
      const K = st.K;
      const ks = st.ks;
      const coil = d.coil;
      const pts = this.pts;
      const rod = this.rod;
      const cond = this.cond;
      for (let i = 0; i < N; i++) {
        let ci = CD.clamp(c * 1.3 - 0.3 * this.w[i], 0, 1);
        ci = ci * ci * (3 - 2 * ci);
        cond[i] = ci;
        const cp = coil[i];
        pts[i].set(K.x + cp.x * ks, K.y + cp.y * ks, K.z + cp.z * ks).lerp(rod[i], ci);
      }

      const total = this.tube.measure(pts);
      const cum = this.tube.cum;
      const radii = this.radii;
      for (let i = 0; i < N; i++) {
        const ci = cond[i];
        const sArm = (i / (N - 1) - d.cf) * d.len;
        let r = 0.028 + (0.118 - 0.028) * ci * ci;
        r *= 1 - 0.42 * ci * Math.exp(-(sArm * sArm) / 0.0036); // centromere constriction
        const e = Math.min(cum[i], total - cum[i]);
        if (e < r) {
          const q = 1 - e / r;
          r *= Math.sqrt(Math.max(0, 1 - q * q)); // rounded telomere caps
        }
        radii[i] = r;
      }
      this.tube.update(pts, radii);

      const kv = CD.smoothstep(0.6, 0.95, c);
      this.kin.visible = kv > 0.01;
      this.kinPos.copy(pts[this.ic]).addScaledVector(this.F, 0.07);
      this.kin.position.copy(this.kinPos);
      this.kin.scale.setScalar(0.046 * kv);

      this.mat.emissiveIntensity = (1 - c) * 0.14;
      if (d.xo && Math.abs(x - this.lastX) > 0.002) this.paint(x);
    }
  }

  // ================================================================ Cell (membrane)
  // Two hemispheres morph from one sphere (optionally elongated) into two daughter
  // spheres; the equator of each hemisphere becomes the cleavage furrow.
  const shapeP = { R: 1, e: 0, s: 0, r: 1, gap: 0, time: 0, wob: 0.012 };

  function evalShape(nx, ny, nz, sgn, p, out) {
    const h = ny * sgn;
    const Rp = p.R / Math.sqrt(1 + p.e);
    const s = p.s;
    const r = p.r;
    const radial = Rp * (1 - s) + 2 * r * h * s;
    const y = sgn * (p.R * (1 + p.e) * h * (1 - s) + (r + p.gap + r * (2 * h * h - 1)) * s);
    const w =
      1 +
      p.wob *
        (Math.sin(nx * 3.1 + p.time * 0.9) +
          Math.sin(ny * 2.7 + p.time * 0.7 + 1.3) +
          Math.sin(nz * 2.3 + p.time * 0.8 + 2.1)) /
        3;
    out.x = nx * radial * w;
    out.y = y * w;
    out.z = nz * radial * w;
  }

  class Cell {
    constructor(def, parent) {
      this.def = def;
      this.st = {};
      this.r = def.R * Math.pow(0.5, 1 / 3);
      this.shown = true;

      this.group = new THREE.Group();
      this.group.quaternion.setFromUnitVectors(UP, def.axis.clone().normalize());
      parent.add(this.group);


      this.hemis = [1, -1].map((sgn) => {
        const g = new THREE.SphereGeometry(1, 80, 30, 0, TAU, sgn > 0 ? 0 : Math.PI / 2, Math.PI / 2);
        const base = g.attributes.position.array.slice();
        g.attributes.position.setUsage(THREE.DynamicDrawUsage);
        g.attributes.normal.setUsage(THREE.DynamicDrawUsage);
        const mesh = new THREE.Mesh(g, CD.mat.membrane);
        mesh.renderOrder = 4;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        return { sgn, g, base, mesh };
      });

      this.ringMat = new THREE.MeshStandardMaterial({
        color: CD.lin(CD.COLORS.ring),
        emissive: CD.lin(CD.COLORS.ring),
        emissiveIntensity: 0.25,
        roughness: 0.5,
        transparent: true,
        opacity: 0,
      });
      this.ring = new THREE.Mesh(CD.geo.ring, this.ringMat);
      this.ring.renderOrder = 3;
      this.group.add(this.ring);
    }

    deform(h, p) {
      const pos = h.g.attributes.position.array;
      const nor = h.g.attributes.normal.array;
      const base = h.base;
      const sgn = h.sgn;
      const P = { x: 0, y: 0, z: 0 };
      const A = { x: 0, y: 0, z: 0 };
      const Mm = { x: 0, y: 0, z: 0 };
      const eps = 1e-3;
      for (let i = 0; i < base.length; i += 3) {
        const nx = base[i];
        const ny = base[i + 1];
        const nz = base[i + 2];
        evalShape(nx, ny, nz, sgn, p, P);
        pos[i] = P.x;
        pos[i + 1] = P.y;
        pos[i + 2] = P.z;

        const rho2 = nx * nx + nz * nz;
        if (rho2 < 1e-10) {
          nor[i] = 0;
          nor[i + 1] = sgn;
          nor[i + 2] = 0;
          continue;
        }
        const inv = 1 / Math.sqrt(rho2);
        const hh = ny * sgn;
        // azimuthal and meridional (toward the pole) tangent directions
        evalShape(nx + eps * nz * inv, ny, nz - eps * nx * inv, sgn, p, A);
        evalShape(nx - eps * nx * hh * inv, ny + eps * (sgn - ny * hh) * inv, nz - eps * nz * hh * inv, sgn, p, Mm);
        const ax = A.x - P.x;
        const ay = A.y - P.y;
        const az = A.z - P.z;
        const mx = Mm.x - P.x;
        const my = Mm.y - P.y;
        const mz = Mm.z - P.z;
        let cx = (ay * mz - az * my) * sgn;
        let cy = (az * mx - ax * mz) * sgn;
        let cz = (ax * my - ay * mx) * sgn;
        const l = Math.sqrt(cx * cx + cy * cy + cz * cz) || 1;
        nor[i] = cx / l;
        nor[i + 1] = cy / l;
        nor[i + 2] = cz / l;
      }
      h.g.attributes.position.needsUpdate = true;
      h.g.attributes.normal.needsUpdate = true;
    }

    update(t, time, shown) {
      const st = sampleAll(this.def.tracks, t, this.st);
      const vis = st.vis > 0.5 && shown;
      this.group.visible = vis;
      if (!vis) return;

      this.group.position.copy(st.center);
      this.group.updateMatrixWorld();

      const R = this.def.R;
      const p = shapeP;
      p.R = R;
      p.e = st.e;
      p.s = CD.clamp(st.s, 0, 1);
      p.r = this.r;
      p.gap = st.gap;
      p.time = time;
      for (const h of this.hemis) this.deform(h, p);

      const waist = (R / Math.sqrt(1 + st.e)) * (1 - p.s) * 0.985;
      this.ring.scale.set(Math.max(waist, 0.001), 1, Math.max(waist, 0.001));
      const ro = CD.smoothstep(0.01, 0.12, p.s) * (1 - CD.smoothstep(0.82, 0.97, p.s));
      this.ringMat.opacity = ro * 0.9;
      this.ring.visible = ro > 0.01;
    }
  }


  // ================================================================ PlantCell
  // A meristem cell in a wall: the wall cannot pinch, so the cell never rounds
  // up or furrows. A preprophase band of cortical microtubules marks the
  // division plane before prophase; in telophase the phragmoplast steers Golgi
  // vesicles to that plane, where they fuse into a cell plate that grows
  // outward until it meets the parent wall where the band was.
  //
  // The cell is a superellipsoid, |x/hx|^n + |y/hy|^n + |z/hz|^n = 1: flat faces
  // with round edges, and an analytic normal. Tracks: ppb (0..1), ppbW (band
  // width), phrag (phragmoplast 0..1), s (plate radius as a fraction of the
  // cell's cross-section, which bodies() reads as the cells' separation), m
  // (plate maturing into wall).
  const SE_N = 6;
  const MEM_IN = 0.14; // the membrane, just inside the wall
  const PPB_IN = 0.24; // the band, just inside the membrane

  function seScale(dx, dy, dz, hx, hy, hz) {
    const q = Math.pow(Math.abs(dx / hx), SE_N) + Math.pow(Math.abs(dy / hy), SE_N) + Math.pow(Math.abs(dz / hz), SE_N);
    return Math.pow(q, -1 / SE_N);
  }
  // the cross-section at x = 0: radius of the contour in direction θ
  const seContour = (th, hy, hz) => seScale(0, Math.cos(th), Math.sin(th), 1, hy, hz);

  function seGeometry(hx, hy, hz) {
    const g = new THREE.SphereGeometry(1, 128, 96);
    const pos = g.attributes.position.array;
    const nor = g.attributes.normal.array;
    for (let i = 0; i < pos.length; i += 3) {
      const k = seScale(pos[i], pos[i + 1], pos[i + 2], hx, hy, hz);
      const x = pos[i] * k, y = pos[i + 1] * k, z = pos[i + 2] * k;
      pos[i] = x; pos[i + 1] = y; pos[i + 2] = z;
      const gx = Math.sign(x) * Math.pow(Math.abs(x / hx), SE_N - 1) / hx;
      const gy = Math.sign(y) * Math.pow(Math.abs(y / hy), SE_N - 1) / hy;
      const gz = Math.sign(z) * Math.pow(Math.abs(z / hz), SE_N - 1) / hz;
      const l = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      nor[i] = gx / l; nor[i + 1] = gy / l; nor[i + 2] = gz / l;
    }
    return g;
  }

  class PlantCell {
    constructor(def, parent) {
      this.def = def;
      this.st = {};
      const { hx, hy, hz } = def;
      this.r = hx / 2; // each daughter's centre sits half the mother's length out
      this.hy = hy - MEM_IN;
      this.hz = hz - MEM_IN;

      this.group = new THREE.Group();
      parent.add(this.group);
      this.shell = new THREE.Group();
      this.group.add(this.shell);

      this.wallMat = CD.makeMembraneMaterial({
        tint: CD.COLORS.wallRim, rim: CD.COLORS.wall, deep: CD.COLORS.lamella, opacity: 0.9,
      });
      const wall = new THREE.Mesh(seGeometry(hx, hy, hz), this.wallMat);
      wall.renderOrder = 5;
      const mem = new THREE.Mesh(seGeometry(hx - MEM_IN, this.hy, this.hz), CD.mat.membrane);
      mem.renderOrder = 4;
      this.shell.add(wall, mem);

      // ---- cell plate: a disc on the division plane, the cross-section's shape
      const SEG = 160;
      const pp = [0, 0, 0];
      for (let j = 0; j <= SEG; j++) {
        const th = (j / SEG) * TAU;
        const r = seContour(th, this.hy, this.hz);
        pp.push(0, Math.cos(th) * r, Math.sin(th) * r);
      }
      const pi = [];
      for (let j = 1; j <= SEG; j++) pi.push(0, j, j + 1);
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      pg.setIndex(pi);
      pg.computeVertexNormals();
      this.plateMat = new THREE.MeshStandardMaterial({
        color: CD.lin(CD.COLORS.vesicle), roughness: 0.6, transparent: true, opacity: 0.85,
        side: THREE.DoubleSide, depthWrite: false,
      });
      this.plate = new THREE.Mesh(pg, this.plateMat);
      this.plate.renderOrder = 3;
      this.group.add(this.plate);
      this.cVes = CD.lin(CD.COLORS.vesicle);
      this.cWall = CD.lin(CD.COLORS.lamella);

      // ---- preprophase band: loops of cortical microtubules round the equator
      const LOOPS = 14, LSEG = 120, bp = [];
      const rnd = CD.rng(31);
      for (let l = 0; l < LOOPS; l++) {
        const x = l / (LOOPS - 1) - 0.5;
        const ph = rnd() * TAU;
        const inset = PPB_IN + rnd() * 0.06;
        for (let j = 0; j < LSEG; j++) {
          for (const jj of [j, j + 1]) {
            const th = (jj / LSEG) * TAU + ph;
            const r = seContour(th, hy - inset, hz - inset);
            bp.push(x + 0.04 * Math.sin(th * 5 + ph), Math.cos(th) * r, Math.sin(th) * r);
          }
        }
      }
      const bg = new THREE.BufferGeometry();
      bg.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
      this.ppbMat = new THREE.LineBasicMaterial({
        color: CD.lin(CD.COLORS.microtubule), transparent: true, opacity: 0, depthWrite: false,
      });
      this.ppb = new THREE.LineSegments(bg, this.ppbMat);
      this.ppb.renderOrder = 1;
      this.group.add(this.ppb);

      // ---- phragmoplast: two opposed sets of short microtubules, plus ends at the plane
      this.fib = Array.from({ length: 300 }, () => ({
        th: rnd() * TAU, u: rnd(), len: 0.35 + rnd() * 0.5, side: rnd() < 0.5 ? 1 : -1,
      }));
      this.phArr = new Float32Array(this.fib.length * 6);
      const fg = new THREE.BufferGeometry();
      this.phAttr = new THREE.BufferAttribute(this.phArr, 3).setUsage(THREE.DynamicDrawUsage);
      fg.setAttribute('position', this.phAttr);
      this.phrag = new THREE.LineSegments(fg, CD.mat.fiberLine);
      this.phrag.frustumCulled = false;
      this.phrag.renderOrder = 1;
      this.group.add(this.phrag);

      // ---- Golgi vesicles carried along the phragmoplast to the plate's edge
      this.ves = Array.from({ length: 140 }, () => ({
        th: rnd() * TAU, ph: rnd(), side: rnd() < 0.5 ? 1 : -1, j: rnd(), rate: 0.3 + rnd() * 0.15,
      }));
      this.vesMat = new THREE.MeshStandardMaterial({ color: CD.lin(CD.COLORS.vesicle), roughness: 0.4 });
      this.vesMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), this.vesMat, this.ves.length);
      this.vesMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.vesMesh.frustumCulled = false;
      this.group.add(this.vesMesh);
      this.dummy = new THREE.Object3D();
    }

    // radius of the plate's growing edge in direction θ
    edge(th, s) {
      return s * seContour(th, this.hy, this.hz);
    }

    update(t, time, shown, spindle) {
      const st = sampleAll(this.def.tracks, t, this.st);
      this.group.position.copy(st.center);
      this.shell.visible = shown;
      const s = CD.clamp(st.s, 0, 1);

      this.plate.visible = s > 0.002;
      this.plate.scale.set(1, s, s);
      this.plateMat.color.copy(this.cVes).lerp(this.cWall, st.m);

      this.ppb.visible = spindle && st.ppb > 0.01;
      this.ppb.scale.x = st.ppbW;
      this.ppbMat.opacity = st.ppb * 0.85;

      // the array starts as a solid drum between the nuclei and becomes a ring
      // that rides the plate's edge outward, ahead of it
      const ph = st.phrag;
      const live = spindle && ph > 0.01;
      this.phrag.visible = live;
      if (live) {
        const a = this.phArr;
        this.fib.forEach((f, i) => {
          const rc = seContour(f.th, this.hy, this.hz);
          const r0 = Math.max(0, s * rc - 0.2);
          const r = Math.min(rc - 0.08, CD.lerp(r0, Math.max(0.9, s * rc + 0.5), f.u));
          const y = Math.cos(f.th) * r, z = Math.sin(f.th) * r;
          const o = i * 6;
          a[o] = f.side * 0.03; a[o + 1] = y; a[o + 2] = z;
          a[o + 3] = f.side * f.len * ph; a[o + 4] = y; a[o + 5] = z;
        });
        this.phAttr.needsUpdate = true;
      }

      // timeline time, not wall time, so a scrubbed frame is the same frame
      const vOn = live ? ph * (1 - CD.smoothstep(0.85, 1, s)) : 0;
      this.vesMesh.visible = vOn > 0.01;
      if (this.vesMesh.visible) {
        const d = this.dummy;
        this.ves.forEach((v, i) => {
          const u = (t * v.rate + v.ph) % 1;
          const r = Math.min(seContour(v.th, this.hy, this.hz) - 0.1, this.edge(v.th, s) + 0.08 + v.j * 0.45);
          d.position.set(v.side * 0.85 * (1 - CD.ease.out(u)), Math.cos(v.th) * r, Math.sin(v.th) * r);
          d.scale.setScalar(0.055 * vOn * (1 - CD.smoothstep(0.82, 1, u)) + 1e-4);
          d.updateMatrix();
          this.vesMesh.setMatrixAt(i, d.matrix);
        });
        this.vesMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  // ================================================================ Nucleus
  class Nucleus {
    constructor(def, parent) {
      this.def = def;
      this.st = {};
      this.group = new THREE.Group();
      parent.add(this.group);

      this.mat = CD.makeNucleusMaterial();
      this.shell = new THREE.Mesh(CD.geo.nucleus, this.mat);
      this.shell.renderOrder = 2;
      this.group.add(this.shell);

      this.nMat = new THREE.MeshStandardMaterial({
        color: CD.lin(CD.COLORS.nucleolus),
        roughness: 0.48,
        transparent: true,
        opacity: 1,
      });
      this.nucleolus = new THREE.Group();
      [
        [0, 0, 0, 0.2],
        [0.13, 0.07, 0.05, 0.14],
        [-0.08, 0.1, -0.07, 0.12],
      ].forEach(([x, y, z, r]) => {
        const m = new THREE.Mesh(CD.geo.nucleolus, this.nMat);
        m.position.set(x, y, z);
        m.scale.setScalar(r);
        this.nucleolus.add(m);
      });
      const o = def.nucleolusAt || new V3(0.3, 0.25, 0.15);
      this.nucleolusAt = o.clone();
      this.group.add(this.nucleolus);
    }

    update(t, time) {
      const st = sampleAll(this.def.tracks, t, this.st);
      const d = st.dissolve;
      const shellVis = d < 0.995;
      const nuVis = st.nucleolus > 0.01;
      this.group.visible = shellVis || nuVis;
      if (!this.group.visible) return;
      this.group.position.copy(st.center);
      this.shell.visible = shellVis;
      this.shell.scale.setScalar(st.radius * (1 + 0.07 * d));
      this.mat.uniforms.uDissolve.value = d;

      this.nucleolus.visible = nuVis;
      this.nucleolus.position.copy(this.nucleolusAt).multiplyScalar(st.radius);
      this.nucleolus.scale.setScalar(st.radius * (0.55 + 0.45 * st.nucleolus));
      this.nucleolus.rotation.y = time * 0.15;
      this.nMat.opacity = st.nucleolus;
    }
  }

  // ================================================================ Centrosome
  class Centrosome {
    constructor(def, parent) {
      this.def = def;
      this.st = {};
      this.pos = new V3();
      this.group = new THREE.Group();
      parent.add(this.group);
      // A plant spindle pole is a place the microtubules converge, not an organelle.
      if (def.acentric) return;

      const pair = new THREE.Group();
      const a = new THREE.Mesh(CD.geo.centriole, CD.mat.centriole);
      const b = new THREE.Mesh(CD.geo.centriole, CD.mat.centriole);
      b.rotation.z = Math.PI / 2;
      b.position.set(0.08, 0.09, 0);
      pair.add(a, b);
      this.pair = pair;
      this.group.add(pair);

      this.halo = new THREE.Sprite(CD.mat.halo);
      this.halo.scale.setScalar(0.95);
      this.halo.renderOrder = 5;
      this.group.add(this.halo);
    }

    update(t, time) {
      const st = sampleAll(this.def.tracks, t, this.st);
      this.pos.copy(st.p);
      this.shown = st.show > 0.01;
      this.group.visible = this.shown;
      this.group.position.copy(st.p);
      this.group.scale.setScalar(Math.max(st.show, 0.001));
      if (this.pair) this.pair.rotation.set(0.5, time * 0.35 + this.def.seed, 0.2);
    }
  }

  // ================================================================ Microtubule lines (asters + polar fibres)
  class Fibers {
    constructor(parent, def) {
      this.max = 1600;
      this.arr = new Float32Array(this.max * 6);
      const g = new THREE.BufferGeometry();
      this.attr = new THREE.BufferAttribute(this.arr, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', this.attr);
      this.geometry = g;
      this.lines = new THREE.LineSegments(g, CD.mat.fiberLine);
      this.lines.frustumCulled = false;
      this.lines.renderOrder = 1;
      parent.add(this.lines);

      const rnd = CD.rng(99);
      this.asters = def.centrosomes.map(() =>
        Array.from({ length: 26 }, () => ({ d: CD.randUnit(rnd), l: 0.32 + rnd() * 0.38, ph: rnd() * TAU }))
      );
      this.polar = def.spindles.map(() =>
        Array.from({ length: 36 }, (_, i) => ({
          psi: ((i % 18) / 18) * TAU + rnd() * 0.3,
          rho: 0.3 + rnd() * 0.7,
          umax: 0.5 + rnd() * 0.14,
        }))
      );
      this.count = 0;
      this.e1 = new V3();
      this.e2 = new V3();
      this.dir = new V3();
    }

    seg(ax, ay, az, bx, by, bz) {
      if (this.count >= this.max) return;
      const o = this.count * 6;
      const a = this.arr;
      a[o] = ax;
      a[o + 1] = ay;
      a[o + 2] = az;
      a[o + 3] = bx;
      a[o + 4] = by;
      a[o + 5] = bz;
      this.count++;
    }

    update(world, time) {
      this.count = 0;

      world.centrosomes.forEach((c, ci) => {
        const st = c.st;
        if (!c.shown || st.aster < 0.01) return;
        const s = st.show;
        const p = c.pos;
        for (const r of this.asters[ci]) {
          const l0 = 0.1 * s;
          const l1 = (0.1 + st.aster * r.l * (0.9 + 0.1 * Math.sin(time * 1.3 + r.ph))) * s;
          this.seg(p.x + r.d.x * l0, p.y + r.d.y * l0, p.z + r.d.z * l0, p.x + r.d.x * l1, p.y + r.d.y * l1, p.z + r.d.z * l1);
        }
      });

      world.spindles.forEach((sp, si) => {
        const grow = sp.st.grow;
        if (grow < 0.01) return;
        const A = world.centrosomes[sp.def.a].pos;
        const B = world.centrosomes[sp.def.b].pos;
        const dir = this.dir.subVectors(B, A);
        const D = dir.length();
        if (D < 1e-3) return;
        dir.multiplyScalar(1 / D);
        const e1 = this.e1.crossVectors(dir, Math.abs(dir.z) < 0.9 ? tmp.set(0, 0, 1) : tmp.set(1, 0, 0)).normalize();
        const e2 = this.e2.crossVectors(dir, e1);
        const width = Math.min(1.05, D * 0.2);
        // 0 converges every fibre on the pole (an aster); more spreads them into a flat, wide pole
        const broad = sp.def.broad || 0;
        const fibres = this.polar[si];
        const steps = 10;
        for (let f = 0; f < fibres.length; f++) {
          const fb = fibres[f];
          const from = f < fibres.length / 2 ? A : B;
          const sd = f < fibres.length / 2 ? 1 : -1;
          const cx = Math.cos(fb.psi) * fb.rho * width;
          const cy = Math.sin(fb.psi) * fb.rho * width;
          const umax = fb.umax * grow;
          let px = from.x + (e1.x * cx + e2.x * cy) * broad;
          let py = from.y + (e1.y * cx + e2.y * cy) * broad;
          let pz = from.z + (e1.z * cx + e2.z * cy) * broad;
          for (let k = 1; k <= steps; k++) {
            const u = (k / steps) * umax;
            const along = u * D * sd;
            const bulge = broad + (1 - broad) * Math.sin(Math.PI * u);
            const qx = from.x + dir.x * along + (e1.x * cx + e2.x * cy) * bulge;
            const qy = from.y + dir.y * along + (e1.y * cx + e2.y * cy) * bulge;
            const qz = from.z + dir.z * along + (e1.z * cx + e2.z * cy) * bulge;
            this.seg(px, py, pz, qx, qy, qz);
            px = qx;
            py = qy;
            pz = qz;
          }
        }
      });

      this.geometry.setDrawRange(0, this.count * 2);
      this.attr.needsUpdate = true;
    }
  }

  // ================================================================ Kinetochore fibres
  class KFibers {
    constructor(parent, count) {
      this.count = count * 2;
      this.mesh = new THREE.InstancedMesh(CD.geo.cyl, CD.mat.kfiber, this.count);
      this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.mesh.frustumCulled = false;
      parent.add(this.mesh);
      this.dummy = new THREE.Object3D();
      this.end = new V3();
      this.off = new V3();
      this.dir = new V3();
      this.pole = new V3();
    }

    place(i, a, b, r) {
      const d = this.dummy;
      this.dir.subVectors(b, a);
      const len = this.dir.length();
      if (len < 1e-4) {
        d.scale.set(0, 0, 0);
      } else {
        d.position.addVectors(a, b).multiplyScalar(0.5);
        d.quaternion.setFromUnitVectors(UP, this.dir.multiplyScalar(1 / len));
        d.scale.set(r, len, r);
      }
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }

    update(world) {
      const zero = this.dummy;
      world.chromatids.forEach((c, i) => {
        const st = c.st;
        const cen = world.centrosomes[st.ci];
        if (!cen || !cen.shown || st.att < 0.01) {
          zero.position.set(0, 0, 0);
          zero.scale.set(0, 0, 0);
          zero.updateMatrix();
          this.mesh.setMatrixAt(i * 2, zero.matrix);
          this.mesh.setMatrixAt(i * 2 + 1, zero.matrix);
          return;
        }
        let pole = cen.pos;
        const broad = world.def.broad || 0;
        if (broad && world.centrosomes.length === 2) {
          // a fibre leaves the wide pole level with its kinetochore, not from one point
          const ax = this.dir.subVectors(pole, world.centrosomes[1 - st.ci].pos).normalize();
          tmp.subVectors(c.kinPos, pole);
          tmp.addScaledVector(ax, -tmp.dot(ax));
          pole = this.pole.copy(cen.pos).addScaledVector(tmp, broad);
        }
        this.end.lerpVectors(pole, c.kinPos, st.att);
        CD.anyPerp(tmp.subVectors(c.kinPos, pole).normalize(), this.off).multiplyScalar(0.024 * st.att);
        tmp.copy(this.end).add(this.off);
        this.place(i * 2, pole, tmp, 0.0085);
        tmp.copy(this.end).sub(this.off);
        this.place(i * 2 + 1, pole, tmp, 0.0085);
      });
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ================================================================ Chiasma flash (crossing over)
  class Chiasma {
    constructor(def, parent, world) {
      this.def = def;
      this.st = {};
      this.mat = new THREE.SpriteMaterial({
        map: CD.tex.glow,
        color: CD.lin(CD.COLORS.chiasma),
        transparent: true,
        depthWrite: false,
        depthTest: false,
        opacity: 0,
      });
      this.sprite = new THREE.Sprite(this.mat);
      this.sprite.renderOrder = 10;
      parent.add(this.sprite);
      this.ia = world.chromatids.findIndex((c) => c.def.pair === def.pair && c.def.parent === 0 && c.def.sister === 1);
      this.ib = world.chromatids.findIndex((c) => c.def.pair === def.pair && c.def.parent === 1 && c.def.sister === 1);
      this.idx = Math.round(def.xf * (N - 1));
    }

    sample(t) {
      sampleAll(this.def.tracks, t, this.st);
    }

    place(world) {
      const b = CD.bell(this.st.x);
      this.sprite.visible = b > 0.01;
      if (!this.sprite.visible) return;
      const pa = world.chromatids[this.ia].pts[this.idx];
      const pb = world.chromatids[this.ib].pts[this.idx];
      this.sprite.position.addVectors(pa, pb).multiplyScalar(0.5);
      this.sprite.scale.setScalar(0.3 + 0.55 * b);
      this.mat.opacity = b * 0.95;
    }
  }

  // ================================================================ World
  class World {
    constructor(scene, def) {
      this.def = def;
      this.group = new THREE.Group();
      scene.add(this.group);

      this.chromatids = def.chromatids.map((d) => new Chromatid(d, this.group));
      this.cells = def.cells.map((d) => (d.plant ? new PlantCell(d, this.group) : new Cell(d, this.group)));
      this.nuclei = def.nuclei.map((d) => new Nucleus(d, this.group));
      this.centrosomes = def.centrosomes.map((d) => new Centrosome(d, this.group));
      this.spindles = def.spindles.map((d) => ({ def: d, st: {} }));
      this.fibers = new Fibers(this.group, def);
      this.kfibers = new KFibers(this.group, this.chromatids.length);
      this.chiasmata = def.chiasmata.map((d) => new Chiasma(d, this.group, this));
    }

    update(t, time, opts) {
      for (const c of this.centrosomes) c.update(t, time);
      for (const s of this.spindles) sampleAll(s.def.tracks, t, s.st);
      for (const x of this.chiasmata) x.sample(t);
      for (const c of this.chromatids) {
        const xo = c.def.xo;
        c.update(t, xo ? this.chiasmata[xo.chiasma].st.x : 0);
      }
      for (const x of this.chiasmata) x.place(this);
      for (const c of this.cells) c.update(t, time, opts.membrane, opts.spindle);
      for (const n of this.nuclei) n.update(t, time);

      this.fibers.lines.visible = opts.spindle;
      this.kfibers.mesh.visible = opts.spindle;
      if (opts.spindle) {
        this.fibers.update(this, time);
        this.kfibers.update(this);
      }
    }

    dispose() {
      this.group.parent.remove(this.group);
      const shared = new Set(Object.values(CD.geo).concat(Object.values(CD.mat)));
      this.group.traverse((o) => {
        if (o.geometry && !shared.has(o.geometry)) o.geometry.dispose();
        if (o.material && !shared.has(o.material)) o.material.dispose();
      });
    }
  }

  CD.World = World;
})(window.CD);
