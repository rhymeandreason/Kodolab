/* enzyme-models.js: builds every 3D object in the enzyme scene: enzyme, amino-acid chain, molecules, energy diagram */
const EnzymeModels = (() => {
  const { col, clamp, smoothstep, noise3, rng, mergeVertices, easeInOutCubic, easeInOutSine, randomUnit, hash } = EnzymeLib;
  const V3 = THREE.Vector3;

  const COLORS = {
    enzymeA: '#5d6cf6',
    enzymeB: '#8f9bff',
    site: '#ffb23f',
    siteDeep: '#ff8a3d',
    allo: '#b98cff',
    subA: '#16c1a0',
    subB: '#ff7b6b',
    comp: '#394356',
    alloInh: '#9b5cff',
    uncat: '#d8dee9',
    uncatEdge: '#98a2b8',
    cat: '#8e9aff',
    catEdge: '#5a67f2',
  };

  /* ================= Enzyme ================= */
  // Geometry constants. P = active-site axis, Q = allosteric-site axis (enzyme-local).
  const E = { R: 2.3, A: 0.56, D: 0.95, QA: 0.32, QD: 0.32 };
  E.P = new V3(0.12, 0.28, 1).normalize();
  E.Q = new V3(-0.8, 0.58, 0.16).normalize();
  E.L = new V3(1, 0, 0).addScaledVector(E.P, -E.P.x).normalize();
  E.U = new V3().crossVectors(E.P, E.L);
  E.dock = E.P.clone().multiplyScalar(E.R - E.D + 0.42);
  E.qDock = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(E.L, E.U, E.P));
  E.QL = new V3(0, 1, 0).cross(E.Q).normalize();
  E.QU = new V3().crossVectors(E.Q, E.QL);
  E.alloDock = E.Q.clone().multiplyScalar(E.R - E.QD + 0.2);
  E.qAllo = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(E.QL, E.QU, E.Q));

  const tan = new V3();
  // Surface point for unit direction d. close = induced-fit clamp, pinch = allosteric distortion.
  function shapePoint(d, close, pinch, out) {
    const n1 = noise3(d.x * 1.25 + 3.1, d.y * 1.25 - 1.7, d.z * 1.25 + 0.4);
    const n2 = noise3(d.x * 3.1 - 4.2, d.y * 3.1 + 7.3, d.z * 3.1);
    const cosA = clamp(d.dot(E.P), -1, 1);
    const f = Math.acos(cosA) / E.A;
    // bumpy surface everywhere except in and around the pocket, which keeps a precise shape
    let r = E.R * (1 + (0.1 * n1 + 0.028 * n2) * smoothstep(0.9, 1.7, f));
    if (f < 1) r -= E.D * Math.pow(1 - f * f, 1.5) * (1 - 0.6 * pinch);          // the pocket: a concave bowl
    r += Math.exp(-Math.pow((f - 1.1) / 0.3, 2)) * (0.06 + 0.2 * close + 0.14 * pinch);  // its lips

    const b = Math.acos(clamp(d.dot(E.Q), -1, 1)) / E.QA;
    r -= E.QD * (1 - smoothstep(0.35, 1.0, b));                                // allosteric dimple

    out.copy(d).multiplyScalar(r);

    // lips slide toward the pocket axis when the enzyme clamps down
    tan.copy(E.P).addScaledVector(d, -cosA);
    const tl = tan.length();
    if (tl > 1e-5 && (close > 0 || pinch > 0)) {
      tan.divideScalar(tl);
      const g = Math.exp(-Math.pow((f - 1.0) / 0.4, 2));
      const hinge = 1 + 0.7 * d.dot(E.U); // upper lip moves more, like a hinged jaw
      out.addScaledVector(tan, g * (0.42 * close * hinge + 0.55 * pinch * (1.3 - 0.5 * d.dot(E.U))));
    }
    return out;
  }

  // An unfolded, lumpy version with no pocket
  function denatPoint(d, out) {
    const n1 = noise3(d.x * 1.1 + 11, d.y * 1.1 + 2, d.z * 1.1 - 6);
    const n2 = noise3(d.x * 2.6 - 3, d.y * 2.6 + 9, d.z * 2.6 + 1);
    const r = E.R * (0.98 + 0.32 * n1 + 0.1 * n2);
    return out.set(d.x * 1.16, d.y * 0.9, d.z * 1.02).multiplyScalar(r);
  }

  function buildEnzyme() {
    const geo = mergeVertices(new THREE.IcosahedronGeometry(1, 44));
    const n = geo.attributes.position.count;
    const base = new Float32Array(n * 3);
    const closed = new Float32Array(n * 3);
    const pinched = new Float32Array(n * 3);
    const denat = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);

    const cA = col(COLORS.enzymeA), cB = col(COLORS.enzymeB), cSite = col(COLORS.site),
      cDeep = col(COLORS.siteDeep), cAllo = col(COLORS.allo);
    const d = new V3(), o = new V3(), c = new THREE.Color();

    for (let i = 0; i < n; i++) {
      d.fromBufferAttribute(geo.attributes.position, i).normalize();
      shapePoint(d, 0, 0, o); o.toArray(base, i * 3);
      shapePoint(d, 1, 0, o); o.toArray(closed, i * 3);
      shapePoint(d, 0, 1, o); o.toArray(pinched, i * 3);
      denatPoint(d, o); o.toArray(denat, i * 3);

      const nc = noise3(d.x * 2.2 + 5, d.y * 2.2, d.z * 2.2) * 0.8 + 0.5;
      c.copy(cA).lerp(cB, clamp(nc));
      const f = Math.acos(clamp(d.dot(E.P), -1, 1)) / E.A;
      c.lerp(cSite, 1 - smoothstep(0.72, 0.95, f));
      c.lerp(cDeep, (1 - smoothstep(0.0, 0.62, f)) * 0.6);
      const b = Math.acos(clamp(d.dot(E.Q), -1, 1)) / E.QA;
      c.lerp(cAllo, (1 - smoothstep(0.7, 1.08, b)) * 0.85);
      // baked ambient occlusion: darken the inside of the pockets and the surface's valleys
      const n2 = noise3(d.x * 3.1 - 4.2, d.y * 3.1 + 7.3, d.z * 3.1);
      const ref = E.R * (1 + (0.1 * noise3(d.x * 1.25 + 3.1, d.y * 1.25 - 1.7, d.z * 1.25 + 0.4) + 0.028 * n2) * smoothstep(0.9, 1.7, f));
      const depth = ref - Math.hypot(base[i * 3], base[i * 3 + 1], base[i * 3 + 2]);
      c.multiplyScalar((1 - 0.5 * smoothstep(0.02, E.D, depth)) * (1 - 0.12 * smoothstep(0, -0.6, n2)));
      c.toArray(colors, i * 3);
    }

    const normalsFor = arr => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.setIndex(geo.index);
      g.computeVertexNormals();
      return g.attributes.normal;
    };

    geo.setAttribute('position', new THREE.BufferAttribute(base, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    geo.morphAttributes.position = [closed, pinched, denat].map(a => new THREE.BufferAttribute(a, 3));
    geo.morphAttributes.normal = [closed, pinched, denat].map(normalsFor);

    const mat = new THREE.MeshPhysicalMaterial({
      vertexColors: true,
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.3,
      envMapIntensity: 0.7,
      morphTargets: true,
      morphNormals: true,
    });
    return new THREE.Mesh(geo, mat);
  }

  /* ================= Amino-acid chain ================= */
  const AA_TYPES = [
    { key: 'hydrophobic', color: '#a7b1c6' },
    { key: 'polar', color: '#3cc98a' },
    { key: 'positive', color: '#4d86ff' },
    { key: 'negative', color: '#ff5f87' },
  ];

  function buildChain() {
    const N = 56, rand = rng(21);
    const types = [];
    for (let i = 0; i < N; i++) {
      const r = rand();
      types.push(r < 0.42 ? 0 : r < 0.72 ? 1 : r < 0.86 ? 2 : 3);
    }

    // Unfolded: a loose wavy strand
    const ext = [];
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1);
      ext.push(new V3(-5.2 + 10.4 * u, 0.5 * Math.sin(u * Math.PI * 3.2), 0.55 * Math.cos(u * Math.PI * 2.1)));
    }

    // Folded: greedy walk that packs hydrophobic residues into the core,
    // stays inside the enzyme surface and keeps clear of both pockets.
    const fold = [new V3(0.1, -0.2, -0.3)];
    const dir = new V3(), cand = new V3(), bestP = new V3(), bestD = new V3(), prevDir = new V3(1, 0, 0);
    for (let i = 1; i < N; i++) {
      const prev = fold[i - 1];
      const target = (types[i] === 0 ? 0.25 : 0.62) * E.R;
      let best = Infinity;
      for (let k = 0; k < 40; k++) {
        randomUnit(rand, dir);
        cand.copy(prev).addScaledVector(dir, 0.36);
        const len = cand.length();
        let s = Math.abs(len - target) * 1.4;
        const maxR = 0.72 * E.R;
        if (len > maxR) s += 20 * (len - maxR) + 5;
        const a = Math.acos(clamp(cand.dot(E.P) / Math.max(len, 1e-6), -1, 1));
        if (a < E.A * 1.15 && len > E.R - E.D - 0.28) s += 6;
        const q = Math.acos(clamp(cand.dot(E.Q) / Math.max(len, 1e-6), -1, 1));
        if (q < E.QA * 1.4 && len > E.R - E.QD - 0.3) s += 6;
        for (let j = 0; j < i - 1; j++) {
          const dd = cand.distanceTo(fold[j]);
          if (dd < 0.32) s += (0.32 - dd) * 30;
        }
        s -= 0.3 * dir.dot(prevDir);
        if (s < best) { best = s; bestP.copy(cand); bestD.copy(dir); }
      }
      fold.push(bestP.clone());
      prevDir.copy(bestD);
    }

    const group = new THREE.Group();
    const beadGeo = new THREE.SphereGeometry(0.14, 22, 16);
    const mats = AA_TYPES.map(t => new THREE.MeshPhysicalMaterial({
      color: col(t.color), roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.2,
    }));
    const beads = types.map(t => {
      const m = new THREE.Mesh(beadGeo, mats[t]);
      m.castShadow = true;
      group.add(m);
      return m;
    });
    const tubeMat = new THREE.MeshStandardMaterial({ color: col('#c5cbe0'), roughness: 0.45 });
    const tube = new THREE.Mesh(new THREE.BufferGeometry(), tubeMat);
    tube.castShadow = true;
    group.add(tube);

    const DUR = 1.6, SPREAD = 1.5;
    const delays = ext.map((_, i) => (Math.abs(i - (N - 1) / 2) / ((N - 1) / 2)) * SPREAD);
    const duration = SPREAD + DUR;
    const cur = ext.map(v => v.clone());
    let last = null;

    // Fold from the middle outwards; T is seconds since the fold began
    function setProgress(T) {
      const t = clamp(T, 0, duration + 0.01);
      if (t === last) return;
      last = t;
      for (let i = 0; i < N; i++) {
        const e = easeInOutCubic(clamp((t - delays[i]) / DUR));
        const lift = Math.sin(Math.PI * e);
        cur[i].lerpVectors(ext[i], fold[i], e);
        cur[i].y += lift * 0.7;
        cur[i].z += lift * 0.5 * Math.sin(i * 1.3);
        beads[i].position.copy(cur[i]);
      }
      tube.geometry.dispose();
      tube.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cur, false, 'centripetal'), N * 5, 0.05, 8, false);
    }
    setProgress(0);

    return { group, beads, setProgress, duration, delay: i => delays[i] };
  }

  /* ================= Small molecules ================= */
  let glowTex = null;
  function makeGlow(hex, opacity = 1) {
    if (!glowTex) {
      const c = document.createElement('canvas');
      c.width = c.height = 128;
      const g = c.getContext('2d');
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.3, 'rgba(255,255,255,0.55)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      glowTex = new THREE.CanvasTexture(c);
      glowTex.encoding = THREE.sRGBEncoding;
    }
    return new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, color: col(hex), transparent: true, opacity, depthWrite: false,
    }));
  }

  const molMat = hex => new THREE.MeshPhysicalMaterial({
    color: col(hex), roughness: 0.28, metalness: 0, clearcoat: 0.8, clearcoatRoughness: 0.18,
  });
  const MAT = { subA: molMat(COLORS.subA), subB: molMat(COLORS.subB), comp: molMat(COLORS.comp), allo: molMat(COLORS.alloInh) };
  const sphereCache = {};
  const sphere = r => sphereCache[r] || (sphereCache[r] = new THREE.SphereGeometry(r, 32, 24));
  const bondGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.34, 18);

  function ball(r, mat, x, y, z) {
    const m = new THREE.Mesh(sphere(r), mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
  }
  // One half of a substrate: a big atom with two small ones. sx = -1 (left) / +1 (right)
  function half(mat, sx) {
    const g = new THREE.Group();
    g.add(ball(0.22, mat, 0, 0, 0), ball(0.12, mat, 0.22 * sx, 0.13, 0.03 * sx), ball(0.12, mat, 0.19 * sx, -0.13, -0.06 * sx));
    g.position.x = 0.28 * sx;
    return g;
  }

  function makeSubstrate() {
    const g = new THREE.Group();
    const A = half(MAT.subA, -1), B = half(MAT.subB, 1);
    const bondMat = new THREE.MeshStandardMaterial({
      color: col('#fff6e6'), emissive: col(COLORS.site), emissiveIntensity: 0.15, roughness: 0.35,
    });
    const bond = new THREE.Mesh(bondGeo, bondMat);
    bond.rotation.z = Math.PI / 2;
    g.add(A, B, bond);
    g.userData = { A, B, bond, bondMat };
    return g;
  }

  // Same silhouette as the substrate, but one unbreakable piece
  function makeInhibitor() {
    const g = new THREE.Group();
    g.add(half(MAT.comp, -1), half(MAT.comp, 1));
    const link = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.36, 18), MAT.comp);
    link.rotation.z = Math.PI / 2;
    g.add(link, ball(0.13, MAT.comp, 0, 0.2, 0.04));
    return g;
  }

  function makeAllostericInhibitor() {
    const g = new THREE.Group();
    g.add(
      ball(0.2, MAT.allo, 0, -0.05, 0),
      ball(0.14, MAT.allo, 0.2, 0.1, 0.05),
      ball(0.14, MAT.allo, -0.18, 0.12, -0.04),
      ball(0.11, MAT.allo, 0.02, 0.06, 0.2)
    );
    return g;
  }

  /* ================= Energy diagram ================= */
  function buildEnergy() {
    const group = new THREE.Group();
    const H = { un: 3.0, cat: 1.3 };
    const Z = { un: -0.75, cat: 0.75 };
    const BOTTOM = -2.4, X0 = -4.6, X1 = 4.6, DEPTH = 0.6, BALL = 0.2, START = 0.9;
    const f = (x, h) => START - 1.4 * smoothstep(-2.4, 2.4, x) + h * Math.exp(-x * x / 1.15);

    function slab(h, z, hex, edgeHex) {
      const s = new THREE.Shape();
      s.moveTo(X0, BOTTOM);
      const n = 140;
      for (let i = 0; i <= n; i++) {
        const x = X0 + (X1 - X0) * i / n;
        s.lineTo(x, f(x, h));
      }
      s.lineTo(X1, BOTTOM);
      s.lineTo(X0, BOTTOM);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: DEPTH, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.04, bevelSegments: 3, curveSegments: 4,
      });
      geo.translate(0, 0, -DEPTH / 2);
      const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({
        color: col(hex), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.3,
      }));
      m.position.z = z;
      m.castShadow = m.receiveShadow = true;
      group.add(m);

      const pts = [];
      for (let i = 0; i <= n; i += 2) {
        const x = X0 + (X1 - X0) * i / n;
        pts.push(new V3(x, f(x, h) + 0.04, z + DEPTH / 2 + 0.04));
      }
      const edge = new THREE.Mesh(
        new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 220, 0.028, 8),
        new THREE.MeshStandardMaterial({ color: col(edgeHex), roughness: 0.4 })
      );
      group.add(edge);
    }
    slab(H.un, Z.un, COLORS.uncat, COLORS.uncatEdge);
    slab(H.cat, Z.cat, COLORS.cat, COLORS.catEdge);

    // Reference plane at the reactants' energy level
    const planeGeo = new THREE.PlaneGeometry(X1 - X0 + 0.8, 3.1);
    const plane = new THREE.Mesh(planeGeo, new THREE.MeshBasicMaterial({
      color: col('#5a67f2'), transparent: true, opacity: 0.07, depthWrite: false, side: THREE.DoubleSide,
    }));
    const outline = new THREE.LineSegments(new THREE.EdgesGeometry(planeGeo), new THREE.LineBasicMaterial({
      color: col('#5a67f2'), transparent: true, opacity: 0.35,
    }));
    for (const o of [plane, outline]) { o.rotation.x = -Math.PI / 2; o.position.y = START; group.add(o); }

    // Double-headed arrows marking each activation energy
    function arrow(z, y0, y1, hex) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: col(hex), roughness: 0.4 });
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, y1 - y0 - 0.2, 10), mat);
      shaft.position.y = (y0 + y1) / 2;
      const c1 = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.16, 18), mat);
      c1.position.y = y1 - 0.08;
      const c2 = c1.clone();
      c2.rotation.x = Math.PI;
      c2.position.y = y0 + 0.08;
      g.add(shaft, c1, c2);
      g.position.z = z;
      group.add(g);
    }
    arrow(Z.un + DEPTH / 2 + 0.22, START, f(0, H.un) + 0.04, '#6b7489');
    arrow(Z.cat + DEPTH / 2 + 0.25, START, f(0, H.cat) + 0.04, COLORS.catEdge);

    // Molecules rolling over the hills
    const ballGeo = new THREE.SphereGeometry(BALL, 32, 22);
    const cA = col(COLORS.subA), cB = col(COLORS.subB);
    const mkBall = () => {
      const m = new THREE.Mesh(ballGeo, molMat(COLORS.subA));
      m.castShadow = true;
      group.add(m);
      return m;
    };
    const cat = [0, 1, 2].map(k => ({ m: mkBall(), off: k / 3, last: k / 3 }));
    const un = [0, 1, 2].map(k => ({ m: mkBall(), base: -3.95 + k * 0.46, period: 2.3 + k * 0.55, off: k * 0.37 }));
    const GAP = 2 * BALL + 0.03; // balls in a lane queue up instead of passing through each other

    function place(m, x, h, z) {
      m.position.set(x, f(x, h) + 0.04 + BALL, z);
      m.rotation.z = -x / BALL;
    }

    let t = 0;
    const api = {
      group, count: 0, countUn: 0, onCross: null,
      points: {
        reactants: new V3(-3.7, f(-3.7, H.cat) + 0.7, Z.cat),
        products: new V3(3.7, f(3.7, H.cat) + 0.7, Z.cat),
        peakUn: new V3(0.1, f(0, H.un) + 0.3, Z.un),
        peakCat: new V3(0.1, f(0, H.cat) + 0.3, Z.cat),
      },
      update(dt) {
        if (!group.visible) return;
        t += dt;
        for (const b of cat) {
          const u = (t / 3.6 + b.off) % 1;
          if (u < b.last) { api.count++; api.onCross && api.onCross(api.count); }
          b.last = u;
          const x = X0 + 0.5 + (X1 - X0 - 1.0) * easeInOutSine(u);
          place(b.m, x, H.cat, Z.cat);
          b.m.material.color.copy(cA).lerp(cB, smoothstep(-0.3, 0.8, x));
          b.m.scale.setScalar(Math.max(0.001, smoothstep(0, 0.06, u) * (1 - smoothstep(0.94, 1, u))));
        }
        // Without the enzyme: every attempt falls short and rolls back
        // Front ball moves freely; each ball behind it is held back (or pushed back) so they never overlap.
        let limit = Infinity;
        for (let i = un.length - 1; i >= 0; i--) {
          const b = un[i];
          const ph = t / b.period + b.off;
          const k = Math.floor(ph);
          const amp = 0.9 + 1.7 * hash(k * 3.1 + b.base * 10);
          const x = Math.min(b.base + amp * Math.pow(Math.sin(Math.PI * (ph - k)), 2), limit);
          if (x > 0 && !b.over) api.countUn++;
          b.over = x > 0;
          place(b.m, x, H.un, Z.un);
          limit = x - GAP;
        }
      },
    };
    api.update(0.0001);
    return api;
  }

  return {
    E, COLORS, AA_TYPES,
    buildEnzyme, buildChain, makeGlow, makeSubstrate, makeInhibitor, makeAllostericInhibitor, buildEnergy,
  };
})();
