/* cell-division/scenarios.js: the choreography for mitosis and meiosis.
   Everything is a pure function of timeline time, so scrubbing works in both directions. */
(function (CD) {
  'use strict';

  const V3 = THREE.Vector3;
  const TAU = CD.TAU;
  const v = (x, y, z) => new V3(x, y, z);
  const X = v(1, 0, 0);
  const Y = v(0, 1, 0);
  const O = v(0, 0, 0);

  const CELL_R = 3.2;
  const NUC_R = 1.7;
  const R1 = CELL_R * Math.pow(0.5, 1 / 3); // daughter radius (volume halves)
  const G = 0.1; // half-distance between sister chromatids

  // Three homologous pairs (2n = 6): long, medium, short.
  const PAIRS = [
    { len: 1.55, cf: 0.4 },
    { len: 1.2, cf: 0.33 },
    { len: 0.85, cf: 0.45 },
  ];

  function timeline(phases) {
    let t = 0;
    for (const p of phases) {
      p.start = t;
      t += p.dur;
      p.end = t;
    }
    return { total: t, T: (i, f) => phases[i].start + phases[i].dur * f };
  }

  function track(obj) {
    const t = new CD.Track();
    obj.tracks.push(t);
    return t;
  }

  function makeBands(rnd) {
    const bands = [];
    const n = 4 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) bands.push({ c: 0.08 + rnd() * 0.84, w: 0.015 + rnd() * 0.03, d: 0.1 + rnd() * 0.12 });
    return bands;
  }

  function baseChromosomes(rnd) {
    const out = [];
    const bandSets = PAIRS.map(() => makeBands(rnd));
    PAIRS.forEach((pp, p) => {
      [0, 1].forEach((parent) => {
        out.push({
          k: out.length,
          pair: p,
          parent,
          len: pp.len,
          cf: pp.cf,
          color: parent === 0 ? CD.COLORS.maternal : CD.COLORS.paternal,
          bands: bandSets[p],
          seed: rnd() * 100,
        });
      });
    });
    return out;
  }

  function newChromatid(ch, sister, coil) {
    return {
      pair: ch.pair,
      parent: ch.parent,
      sister,
      len: ch.len,
      cf: ch.cf,
      color: ch.color,
      bands: ch.bands,
      seed: ch.seed,
      coil,
      xo: null,
      tracks: [],
    };
  }

  // Dense linear keys along an arc in the xy plane (around `center`), eased overall.
  function arcKeys(tr, t0, t1, center, a0, a1, r0, r1, z0, z1) {
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const e = CD.ease.inOut(u);
      const a = CD.lerp(a0, a1, e);
      const r = CD.lerp(r0, r1, e);
      tr.key(CD.lerp(t0, t1, u), { p: v(center.x + Math.cos(a) * r, center.y + Math.sin(a) * r, CD.lerp(z0, z1, e)) }, 'linear');
    }
  }

  // ================================================================ collision screening
  // A coarse model of each condensed chromatid (same arm integration as the renderer, fewer
  // samples) used while building a choreography to reject layouts or paths where chromatids
  // of different chromosomes would pass through each other.
  const MIN_GAP = 0.26; // centre-line clearance when placing resting chromosomes
  const PATH_GAP = 0.24; // while moving: two chromatid radii (0.236) must never overlap
  const ARM_STEPS = 4;
  const _U = new V3();
  const _F = new V3();
  const _S = new V3();
  const _d = new V3();
  const _j = new V3();

  function orthoUnit(out, v, U) {
    out.copy(v).addScaledVector(U, -v.dot(U));
    if (out.lengthSq() < 1e-6) CD.anyPerp(U, out);
    return out.normalize();
  }

  // Polyline (tip → centromere → tip) for a sampled pose; returns [points, boundCentre, boundRadius].
  function rodPolyline(ch, st, t) {
    _U.copy(st.U).normalize();
    orthoUnit(_F, st.F, _U);
    orthoUnit(_S, st.S, _U);
    const C = st.C.clone();
    if (st.jit > 0.001) C.addScaledVector(CD.jitter(t, ch.seed, _j), st.jit * 0.05);
    const pts = [C];
    for (const sgn of [1, -1]) {
      const armLen = (sgn > 0 ? 1 - ch.cf : ch.cf) * ch.len;
      const ds = armLen / ARM_STEPS;
      const p = C.clone();
      for (let k = 0; k < ARM_STEPS; k++) {
        const s = (k + 0.5) * ds;
        const a = st.drag * Math.min(s * 1.9, 1.2);
        const b = st.splay * Math.min(s * 2.6, 1);
        _d.copy(_U).multiplyScalar(sgn).addScaledVector(_F, -Math.tan(a)).addScaledVector(_S, Math.tan(b)).normalize();
        p.addScaledVector(_d, ds);
        if (sgn > 0) pts.push(p.clone());
        else pts.unshift(p.clone());
      }
    }
    const centre = pts[0].clone().add(pts[pts.length - 1]).multiplyScalar(0.5);
    let r = 0;
    for (const p of pts) r = Math.max(r, p.distanceTo(centre));
    return [pts, centre, r];
  }

  function segSegDist(p1, q1, p2, q2) {
    const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
    const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
    const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z;
    const e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s = 0;
    let t = 0;
    if (a > 1e-9 || e > 1e-9) {
      if (a <= 1e-9) {
        t = CD.clamp(f / e, 0, 1);
      } else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e <= 1e-9) {
          s = CD.clamp(-c / a, 0, 1);
        } else {
          const b = d1x * d2x + d1y * d2y + d1z * d2z;
          const den = a * e - b * b;
          s = den > 1e-12 ? CD.clamp((b * f - c * e) / den, 0, 1) : 0;
          t = (b * s + f) / e;
          if (t < 0) {
            t = 0;
            s = CD.clamp(-c / a, 0, 1);
          } else if (t > 1) {
            t = 1;
            s = CD.clamp((b - c) / a, 0, 1);
          }
        }
      }
    }
    const x = rx + d1x * s - d2x * t;
    const y = ry + d1y * s - d2y * t;
    const z = rz + d1z * s - d2z * t;
    return Math.sqrt(x * x + y * y + z * z);
  }

  function rodsClash(A, B, gap) {
    if (A[1].distanceTo(B[1]) > A[2] + B[2] + gap) return false;
    const a = A[0];
    const b = B[0];
    for (let i = 0; i < a.length - 1; i++) {
      for (let j = 0; j < b.length - 1; j++) {
        if (segSegDist(a[i], a[i + 1], b[j], b[j + 1]) < gap) return true;
      }
    }
    return false;
  }

  // Half-condensed strand: coil blended into the rod exactly as the renderer does it, sampled
  // every few points, with its (thinner) radius. Returns [points, centre, bound, radii].
  const SPINE_STRIDE = 4;
  function spinePolyline(ch, st, t) {
    const N = CD.N_PTS;
    _U.copy(st.U).normalize();
    orthoUnit(_F, st.F, _U);
    orthoUnit(_S, st.S, _U);
    const C = st.C.clone();
    if (st.jit > 0.001) C.addScaledVector(CD.jitter(t, ch.seed, _j), st.jit * 0.05);
    const rod = new Array(N);
    const ds = ch.len / (N - 1);
    const iHi = Math.ceil(ch.cf * (N - 1));
    for (const sgn of [1, -1]) {
      const p = C.clone();
      let prev = 0;
      for (let i = sgn > 0 ? iHi : iHi - 1; sgn > 0 ? i < N : i >= 0; i += sgn) {
        const s = (i / (N - 1) - ch.cf) * ch.len;
        const m = Math.abs(prev + s) * 0.5;
        const a = st.drag * Math.min(m * 1.9, 1.2);
        const b = st.splay * Math.min(m * 2.6, 1);
        _d.copy(_U).multiplyScalar(sgn).addScaledVector(_F, -Math.tan(a)).addScaledVector(_S, Math.tan(b)).normalize();
        p.addScaledVector(_d, Math.abs(s - prev));
        rod[i] = p.clone();
        prev = s;
      }
    }
    const pts = [];
    const radii = [];
    for (let i = 0; i < N; i += SPINE_STRIDE) {
      const w = 0.5 + 0.5 * Math.sin(i * 0.23 + ch.seed) * Math.cos(i * 0.061 + ch.seed * 0.7);
      let ci = CD.clamp(st.c * 1.3 - 0.3 * w, 0, 1);
      ci = ci * ci * (3 - 2 * ci);
      const k = ch.coil[i];
      pts.push(v(st.K.x + k.x * st.ks, st.K.y + k.y * st.ks, st.K.z + k.z * st.ks).lerp(rod[i], ci));
      radii.push(0.028 + 0.09 * ci * ci);
    }
    const centre = new V3();
    for (const p of pts) centre.add(p);
    centre.multiplyScalar(1 / pts.length);
    let r = 0;
    for (const p of pts) r = Math.max(r, p.distanceTo(centre));
    return [pts, centre, r, radii];
  }

  function spinesClash(A, B, air) {
    if (A[1].distanceTo(B[1]) > A[2] + B[2] + 0.24 + air) return false;
    const a = A[0];
    const b = B[0];
    for (let i = 0; i < a.length - 1; i++) {
      const ra = Math.max(A[3][i], A[3][i + 1]);
      for (let j = 0; j < b.length - 1; j++) {
        const rb = Math.max(B[3][j], B[3][j + 1]);
        if (segSegDist(a[i], a[i + 1], b[j], b[j + 1]) < ra + rb + air) return true;
      }
    }
    return false;
  }

  // Plays the tracks through [t0, t1]; returns the number of clashing samples (0 = clean).
  // Sisters (same pair and parent) may touch; strands still unwinding (c < 0.85) are skipped.
  function countClashes(chromatids, t0, t1, dt, gap, limit) {
    const states = chromatids.map(() => ({}));
    let hits = 0;
    for (let t = t0; t <= t1 + 1e-6; t += dt) {
      // fully condensed → coarse rod; partly condensed → blended strand; barely condensed → skip
      const rods = chromatids.map((ch, i) => {
        const st = states[i];
        for (const tr of ch.tracks) tr.sample(t, st);
        if (st.c >= 0.97) return { rod: rodPolyline(ch, st, t) };
        if (st.c >= 0.3) return { spine: spinePolyline(ch, st, t) };
        return null;
      });
      for (let a = 0; a < rods.length; a++) {
        if (!rods[a]) continue;
        for (let b = a + 1; b < rods.length; b++) {
          if (!rods[b]) continue;
          const ca = chromatids[a];
          const cb = chromatids[b];
          if (ca.pair === cb.pair && ca.parent === cb.parent) continue;
          const A = rods[a];
          const B = rods[b];
          const clash =
            A.rod && B.rod
              ? rodsClash(A.rod, B.rod, gap)
              : spinesClash(A.spine || spinePolyline(ca, states[a], t), B.spine || spinePolyline(cb, states[b], t), gap - 0.236);
          if (clash && ++hits > limit) return hits;
        }
      }
    }
    return hits;
  }

  // Static rods for a condensed pose (used to place chromosomes one by one).
  function poseRods(ch, C, U, S, F, splay, g) {
    return [1, -1].map((sg) => {
      const Ss = S.clone().multiplyScalar(sg);
      return rodPolyline(ch, { C: C.clone().addScaledVector(Ss, g), U, S: Ss, F: F || Ss, splay, drag: 0, jit: 0 }, 0);
    });
  }

  function fitsInside(rods, centre, radius) {
    return rods.every((r) => r[0].every((p) => p.distanceTo(centre) <= radius));
  }

  // Tries seeded attempts until `build(rnd, limit)` yields a clean choreography, keeping the best.
  // The search is deterministic, so `known` records the attempt that wins for the current code
  // ({ attempt, hits }); it is tried first and accepted if it still scores that well, which keeps
  // page load fast. If an edit changes the choreography, the full search runs again and the
  // console says which attempt to record.
  function screened(label, attempts, build, known) {
    const run = (a, limit) => {
      const res = build(CD.rng(7919 * (a + 1)), limit);
      if (res) res.attempt = a;
      return res;
    };
    let best = null;
    if (known) {
      const res = run(known.attempt, known.hits);
      if (res && res.hits <= known.hits) best = res;
    }
    if (!best) {
      for (let a = 0; a < attempts; a++) {
        const res = run(a, best ? best.hits : Infinity);
        if (!res) continue;
        if (!best || res.hits < best.hits) best = res;
        if (res.hits === 0) break;
      }
      if (best) console.info(`${label}: best layout is attempt ${best.attempt} (${best.hits} near-miss samples) — record it as known`);
    }
    return best;
  }

  // ================================================================ MITOSIS
  CD.buildMitosis = function () {
    const rnd = CD.rng(20240917);
    const phases = [
      {
        name: 'Interphase',
        short: 'Interphase',
        dur: 4,
        desc: 'This cell is in G2: its DNA has already been copied, so each chromosome is two identical sister chromatids, still unwound as chromatin. Two centrosomes sit beside the nucleus.',
      },
      {
        name: 'Prophase',
        short: 'Prophase',
        dur: 5,
        desc: 'Chromatin coils into compact chromosomes, and you can see the two sister chromatids joined at the centromere. The nucleolus fades, and the centrosomes move apart, growing microtubules as they go.',
      },
      {
        name: 'Prometaphase',
        short: 'Prometaphase',
        dur: 4.5,
        desc: 'The nuclear envelope breaks into fragments. Microtubules from each pole search the cytoplasm and catch chromosomes by their kinetochores, the protein plates on each centromere.',
      },
      {
        name: 'Metaphase',
        short: 'Metaphase',
        dur: 4,
        desc: 'Chromosomes line up on the metaphase plate, each with its two kinetochores facing opposite poles. A checkpoint holds the cell here until every chromosome is attached to both.',
      },
      {
        name: 'Anaphase',
        short: 'Anaphase',
        dur: 4,
        desc: 'Cohesin, the protein holding sisters together, is cut, and each chromatid becomes a chromosome of its own. Kinetochore microtubules shorten and drag them to opposite poles. Watch the chromosome count.',
      },
      {
        name: 'Telophase',
        short: 'Telophase',
        dur: 4.5,
        desc: 'Each set reaches its pole and starts to unwind. A nuclear envelope forms around each set, and a ring of actin and myosin gathers under the membrane at the equator.',
      },
      {
        name: 'Cytokinesis',
        short: 'Cytokinesis',
        dur: 4.5,
        desc: 'The ring tightens like a drawstring and pinches the cell in two. Each daughter has exactly the parent\'s chromosomes, so the two cells are genetically identical.',
      },
    ];
    const { total, T } = timeline(phases);
    const def = {
      id: 'mitosis',
      label: 'Mitosis',
      phases,
      total,
      extent: { w: 5.9, h: 3.8 },
      chromatids: [],
      cells: [],
      nuclei: [],
      centrosomes: [],
      spindles: [],
      chiasmata: [],
    };

    const GAP = 0.3;
    const DN0 = 2.25; // daughter nucleus as it forms
    const DN1 = R1 + GAP; // daughter cell centre after separation
    const POLE_RING = 0.85; // how much of the metaphase-plate radius the pole cluster keeps
    const chrs = baseChromosomes(rnd);
    const ringOrder = [0, 3, 4, 1, 5, 2];
    // Fixed per-chromosome data: metaphase slot, chromatin coils, daughter territory.
    const info = chrs.map((ch) => {
      const ri = ringOrder.indexOf(ch.k);
      const phi = Math.PI / 2 + (ri * Math.PI) / 3 + (rnd() - 0.5) * 0.22;
      const rd = v(0, Math.sin(phi), Math.cos(phi));
      const terrD = CD.randInBall(rnd, 0.42);
      const coilBase = CD.makeCoil(rnd, CD.N_PTS, 0.68);
      const coils = [CD.sisterCoil(coilBase, rnd), CD.sisterCoil(coilBase, rnd)];
      return { ch, ri, rd, plate: rd.clone().multiplyScalar(0.82), terrD, coils };
    });

    const buildChromatids = (poses) => {
      const out = [];
      info.forEach(({ ch, ri, rd, plate, terrD, coils }, idx) => {
        const { C: pro, U: U0, S: S0 } = poses[idx];
        // chromatin unwinds around the middle of the rod it condenses into
        const terr = pro.clone().addScaledVector(U0, (0.5 - ch.cf) * ch.len);

        for (let j = 0; j < 2; j++) {
          const sg = j === 0 ? 1 : -1;
          const c = newChromatid(ch, j, coils[j]);
          const Ss = S0.clone().multiplyScalar(sg);
          const Xs = X.clone().multiplyScalar(sg);
          // pole rosette: centromeres stay well off the spindle axis so inward arms don't meet
          const pole = (x) => v(x, plate.y * POLE_RING, plate.z * POLE_RING);
          const dn0 = pole(sg * DN0).addScaledVector(terrD, 0.3);
          const dn1 = pole(sg * DN1).addScaledVector(terrD, 0.3);

          track(c)
            .key(0, { C: pro.clone().addScaledVector(Ss, G), U: U0, S: Ss, F: Ss, P: O })
            .key(T(2, 0.4 + 0.05 * ri), {})
            .key(T(3, 0.25), { C: plate.clone().addScaledVector(Xs, G), U: rd, S: Xs, F: Xs })
            .key(T(4, 0.03), {})
            .key(T(4, 0.92), { C: pole(sg * 2.1) })
            .key(T(5, 0.3), {})
            .key(T(5, 0.8), { C: pole(sg * DN0) })
            .key(T(6, 0.55), {})
            .key(T(6, 1), { C: pole(sg * DN1) });

          track(c)
            .key(0, { splay: 0.34, drag: 0 })
            .key(T(3, 0.1), {})
            .key(T(3, 0.4), { splay: 0.28 })
            .key(T(4, 0.03), {})
            .key(T(4, 0.3), { splay: 0.02, drag: 1 }, 'out')
            .key(T(5, 0.25), {})
            .key(T(5, 0.8), { drag: 0.75, splay: 0.05 });

          track(c)
            .key(0, { c: 0, K: terr.clone().addScaledVector(Ss, G * 1.3), ks: 1 })
            .key(T(1, 0.05), {})
            // the coil pulls in as it condenses (in + out = the usual inOut curve for c)
            .key(T(1, 0.5), { c: 0.5, ks: 0.3 }, 'in')
            .key(T(1, 0.95), { c: 1, ks: 0.12 }, 'out')
            .key(T(5, 0.2), { K: dn0, ks: 0.15 })
            .key(T(5, 0.35), {})
            // ...and only spreads out again as it unwinds
            .key(T(6, 0.5), { c: 0, ks: 0.62 }, 'inOut')
            .key(T(6, 0.55), {})
            .key(T(6, 1), { K: dn1 });

          track(c)
            .key(0, { att: 0, ci: j, jit: 0 })
            .key(T(2, 0.28 + 0.06 * ri), {})
            .key(T(2, 0.62 + 0.06 * ri), { att: 1, jit: 1 })
            .key(T(3, 0.9), {})
            .key(T(4, 0.06), { jit: 0 })
            .key(T(5, 0.1), {})
            .key(T(5, 0.6), { att: 0 });

          out.push(c);
        }
      });
      return out;
    };

    // Prophase layout: chromosomes placed one at a time, each leaning toward its plate slot
    // so congression paths stay roughly parallel; the whole prophase→metaphase motion is then
    // screened for chromatids passing through each other.
    const layout = screened('mitosis', 200, (r, limit) => {
      const placed = [];
      const poses = [];
      for (const inf of info) {
        let pose = null;
        for (let tries = 0; tries < 80 && !pose; tries++) {
          const dir = inf.rd.clone().applyAxisAngle(X, (r() - 0.5) * 1.2);
          const C = dir.multiplyScalar(0.3 + r() * 0.55).add(v((r() - 0.5) * 1.2, 0, 0));
          const U = CD.alignTo(inf.rd.clone().add(CD.randUnit(r).multiplyScalar(0.9)).normalize(), inf.rd);
          const S = CD.alignTo(CD.randPerp(U, r), X);
          const rods = poseRods(inf.ch, C, U, S, null, 0.34, G);
          if (!fitsInside(rods, O, NUC_R - 0.2)) continue;
          if (placed.some((pr) => rods.some((a) => pr.some((b) => rodsClash(a, b, MIN_GAP))))) continue;
          placed.push(rods);
          pose = { C, U, S };
        }
        if (!pose) return null;
        poses.push(pose);
      }
      const chromatids = buildChromatids(poses);
      return { chromatids, hits: countClashes(chromatids, T(1, 0.15), T(3, 0.45), 0.05, PATH_GAP, limit) };
    }, { attempt: 72, hits: 1 });
    def.chromatids.push(...layout.chromatids);

    // cell
    const cell = { R: CELL_R, axis: X.clone(), tracks: [] };
    track(cell).key(0, { center: O, vis: 1 });
    track(cell).key(0, { e: 0 }).key(T(4, 0.1), {}).key(T(5, 0.3), { e: 0.3 });
    track(cell).key(0, { s: 0 }).key(T(5, 0.35), {}).key(T(6, 0.7), { s: 1 }, 'inOut');
    track(cell).key(0, { gap: 0 }).key(T(6, 0.7), {}).key(T(6, 1), { gap: GAP });
    def.cells.push(cell);

    // nuclei
    const n0 = { tracks: [] };
    track(n0).key(0, { center: O, radius: NUC_R });
    track(n0)
      .key(0, { dissolve: 0, nucleolus: 1 })
      .key(T(1, 0.2), {})
      .key(T(1, 0.75), { nucleolus: 0 })
      .key(T(2, 0), {})
      .key(T(2, 0.45), { dissolve: 1 });
    def.nuclei.push(n0);
    [1, -1].forEach((sg) => {
      const n = { tracks: [], nucleolusAt: v(sg * 0.25, 0.3, 0.1) };
      track(n)
        .key(0, { center: v(sg * DN0, 0, 0), radius: 1.35 })
        .key(T(6, 0.55), {})
        .key(T(6, 1), { center: v(sg * DN1, 0, 0) });
      track(n)
        .key(0, { dissolve: 1, nucleolus: 0 })
        .key(T(5, 0.3), {})
        .key(T(5, 1), { dissolve: 0 })
        .key(T(6, 0.3), {})
        .key(T(6, 0.85), { nucleolus: 1 });
      def.nuclei.push(n);
    });

    // centrosomes: 0 → +x pole, 1 → −x pole
    [0, 1].forEach((i) => {
      const sg = i === 0 ? 1 : -1;
      const c = { tracks: [], seed: i * 1.7 };
      const a0 = Math.PI / 2 - sg * 0.09;
      const a1 = sg > 0 ? 0 : Math.PI;
      const tp = track(c);
      tp.key(0, { p: v(Math.cos(a0) * 2.05, Math.sin(a0) * 2.05, 0.35), show: 1 });
      tp.key(T(1, 0.15), {});
      arcKeys(tp, T(1, 0.15), T(2, 0.35), O, a0, a1, 2.05, 2.5, 0.35, 0);
      tp.key(T(4, 0.02), {})
        .key(T(4, 0.95), { p: v(sg * 3.0, 0, 0) })
        .key(T(5, 0.15), {})
        .key(T(5, 0.85), { p: v(sg * 2.35, 1.5, 0.3) })
        .key(T(6, 0.55), {})
        .key(T(6, 1), { p: v(sg * (DN1 + 0.1), 1.5, 0.3) });
      track(c)
        .key(0, { aster: 0.3 })
        .key(T(1, 0.1), {})
        .key(T(1, 0.8), { aster: 1 })
        .key(T(5, 0.3), {})
        .key(T(6, 0.3), { aster: 0.3 });
      def.centrosomes.push(c);
    });

    const sp = { a: 0, b: 1, tracks: [] };
    track(sp)
      .key(0, { grow: 0 })
      .key(T(1, 0.5), {})
      .key(T(2, 0.6), { grow: 1 })
      .key(T(5, 0.1), {})
      .key(T(5, 0.8), { grow: 0 });
    def.spindles.push(sp);

    return def;
  };

  // ================================================================ MEIOSIS
  CD.buildMeiosis = function () {
    const rnd = CD.rng(8675309);
    const phases = [
      {
        name: 'Interphase',
        short: 'Interphase',
        dur: 4,
        desc: 'The DNA has been copied, so every chromosome is two sister chromatids. Each chromosome also has a partner, its homolog: one copy came from the mother, one from the father.',
      },
      {
        name: 'Prophase I',
        short: 'Prophase I',
        dur: 8.5,
        desc: 'Chromosomes condense, and each homolog zips alongside its partner (synapsis). Non-sister chromatids trade matching segments, called crossing over, so one chromatid can carry both parents\' alleles. Look for the stripe of the other colour.',
      },
      {
        name: 'Metaphase I',
        short: 'Metaphase I',
        dur: 4.5,
        desc: 'Homologous pairs, not single chromosomes, line up on the plate. Which parent\'s copy faces which pole is random for every pair: independent assortment.',
      },
      {
        name: 'Anaphase I',
        short: 'Anaphase I',
        dur: 4,
        desc: 'The two homologs of each pair are pulled to opposite poles. Sister chromatids stay joined at their centromeres, which is the key difference from mitosis.',
      },
      {
        name: 'Telophase I & Cytokinesis',
        short: 'Telophase I',
        dur: 5.5,
        desc: 'The cell divides. Each daughter has one chromosome from every pair, so it is haploid, but each chromosome is still two sister chromatids.',
      },
      {
        name: 'Prophase II',
        short: 'Prophase II',
        dur: 4.5,
        desc: 'The DNA is not copied again. Each cell breaks down its envelope and builds a new spindle, at right angles to the first.',
      },
      {
        name: 'Metaphase II',
        short: 'Metaphase II',
        dur: 4,
        desc: 'Chromosomes line up one by one on each cell\'s plate, sister kinetochores facing opposite poles, as in mitosis.',
      },
      {
        name: 'Anaphase II',
        short: 'Anaphase II',
        dur: 4,
        desc: 'Sister chromatids finally separate and move to opposite poles. This division is mitosis, in a haploid cell.',
      },
      {
        name: 'Telophase II & Cytokinesis',
        short: 'Telophase II',
        dur: 5.5,
        desc: 'Nuclei re-form and both cells divide, giving four haploid cells. No two are alike: crossing over and independent assortment shuffled what each one got.',
      },
    ];
    const { total, T } = timeline(phases);
    const def = {
      id: 'meiosis',
      label: 'Meiosis',
      phases,
      total,
      extent: { w: 5.5, h: 5.15 },
      chromatids: [],
      cells: [],
      nuclei: [],
      centrosomes: [],
      spindles: [],
      chiasmata: [],
    };

    const chrs = baseChromosomes(rnd);
    const sideM = [1, -1, 1]; // which pole each maternal homolog travels to (independent assortment)
    const XF = [0.74, 0.7, 0.76]; // crossover point along each pair
    const HS_SYN = 0.13;
    const HS_MI = 0.2;
    const GAP1 = 0.3;
    const BX = R1 + GAP1; // cell centres after meiosis I
    const R2 = R1 * Math.pow(0.5, 1 / 3);
    const GAP2 = 0.25;
    const BY = R2 + GAP2; // offsets of the four final cells
    const DNI0 = 2.3;

    const pairSites = [v(-0.45, 0.42, 0.15), v(0.42, 0.05, -0.25), v(-0.15, -0.55, 0.3)];
    // Metaphase I: tetrads stacked along the plate, arms roughly parallel to it.
    const plateMI = [
      { y: 1.1, z: 0.22, tilt: 0.32 },
      { y: -0.36, z: -0.3, tilt: -0.38 },
      { y: -1.44, z: 0.32, tilt: 0.28 },
    ].map((o) => {
      const rd = v(0, 1, o.tilt).normalize();
      return { rd, pos: v(0, o.y, o.z), S: new V3().crossVectors(rd, X).normalize() };
    });

    // Fixed per-chromosome data: destination cell, slot in that cell, chromatin coils.
    const perCell = { 1: 0, '-1': 0 };
    const info = chrs.map((ch) => {
      const p = ch.pair;
      const side = ch.parent === 0 ? sideM[p] : -sideM[p];
      const q = perCell[side]++;
      const coilBase = CD.makeCoil(rnd, CD.N_PTS, 0.68);
      const coils = [CD.sisterCoil(coilBase, rnd), CD.sisterCoil(coilBase, rnd)];
      const terr3 = CD.randInBall(rnd, 0.28);
      return { ch, p, side, q, coils, terr3 };
    });

    const buildChromatids = (frames, early) => {
      const out = [];
      info.forEach(({ ch, p, side, q, coils, terr3 }, idx) => {
        const f = frames[p];
        const pl = plateMI[p];
        const { C: C0, U: U0, S: S0 } = early[idx];
        // chromatin unwinds around the middle of the rod it condenses into
        const terr = C0.clone().addScaledVector(U0, (0.5 - ch.cf) * ch.len);
        const Bc = v(side * BX, 0, 0);
        const qI = v(0, pl.pos.y * 0.8, pl.pos.z * 1.3);
        const dnI0 = v(side * DNI0, 0, 0).add(qI);
        const dnI1 = Bc.clone().add(qI);
        // plate slots chosen so each chromosome moves the way it already leans (no crossing paths)
        const phi2 = [Math.PI / 6, 1.5 * Math.PI, (5 * Math.PI) / 6][q];
        const ring2 = v(Math.cos(phi2), 0, Math.sin(phi2));
        const Fh = f.H.clone().multiplyScalar(side);
        const Xside = X.clone().multiplyScalar(side);

        for (let j = 0; j < 2; j++) {
          const sg = j === 0 ? 1 : -1;
          const c = newChromatid(ch, j, coils[j]);
          if (j === 1) c.xo = { xf: XF[p], color: ch.parent === 0 ? CD.COLORS.paternal : CD.COLORS.maternal, chiasma: p };

          const Ss0 = S0.clone().multiplyScalar(sg);
          const Sb = f.S.clone().multiplyScalar(sg);
          const Sp = f.plS.clone().multiplyScalar(sg);
          // In meiosis II each sister heads to the pole on the side it already faces.
          const ysg = Sp.y >= 0 ? 1 : -1;
          const Ys = Y.clone().multiplyScalar(ysg);
          const poleII = (y) => Bc.clone().addScaledVector(Ys, y).addScaledVector(ring2, 0.65);
          const nII0 = poleII(1.7).addScaledVector(terr3, 0.3);
          const nII1 = poleII(BY).addScaledVector(terr3, 0.3);
          const Smid = Sp.clone().add(Ys).normalize();
          const Umid = pl.rd.clone().add(ring2).normalize();

          track(c)
            .key(0, { C: C0.clone().addScaledVector(Ss0, G), U: U0, S: Ss0, F: Ss0, P: O })
            .key(T(1, 0.3), {})
            .key(T(1, 0.6), { C: f.site.clone().addScaledVector(Fh, HS_SYN).addScaledVector(Sb, G), U: f.U, S: Sb, F: Fh })
            .key(T(1, 0.88), {})
            .key(T(2, 0.4), { C: pl.pos.clone().addScaledVector(Xside, HS_MI).addScaledVector(Sp, G), U: pl.rd, S: Sp, F: Xside })
            .key(T(3, 0.04), {})
            .key(T(3, 0.92), { C: v(side * 2.1, pl.pos.y, pl.pos.z * 1.3).addScaledVector(Sp, G) })
            .key(T(4, 0.15), {})
            .key(T(4, 0.55), { C: dnI0.clone().addScaledVector(Sp, G) })
            .key(T(4, 0.6), {})
            .key(T(4, 0.95), { C: dnI1.clone().addScaledVector(Sp, G) })
            .key(T(5, 0.35), {})
            .key(T(5, 0.95), { C: Bc.clone().addScaledVector(ring2, 0.78).addScaledVector(Sp, G) })
            .key(T(6, 0.15), { C: Bc.clone().addScaledVector(ring2, 0.78).addScaledVector(Smid, G), U: Umid, S: Smid, F: Ys, P: Bc })
            .key(T(6, 0.4), { C: Bc.clone().addScaledVector(ring2, 0.78).addScaledVector(Ys, G), U: ring2, S: Ys })
            .key(T(7, 0.04), {})
            .key(T(7, 0.92), { C: poleII(1.55) })
            .key(T(8, 0.2), {})
            .key(T(8, 0.55), { C: poleII(1.7) })
            .key(T(8, 0.6), {})
            .key(T(8, 0.95), { C: poleII(BY) });

          track(c)
            .key(0, { splay: 0.3, drag: 0 })
            .key(T(1, 0.3), {})
            .key(T(1, 0.6), { splay: 0.06 })
            .key(T(2, 0.05), {})
            .key(T(2, 0.45), { splay: 0.2 })
            .key(T(3, 0.04), {})
            .key(T(3, 0.3), { drag: 1 }, 'out')
            .key(T(3, 0.95), {})
            .key(T(4, 0.55), { drag: 0.7, splay: 0.12 })
            .key(T(5, 0.35), {})
            .key(T(6, 0.4), { drag: 0, splay: 0.3 })
            .key(T(7, 0.03), {})
            .key(T(7, 0.3), { splay: 0.02, drag: 1 }, 'out')
            .key(T(7, 0.95), {})
            .key(T(8, 0.5), { drag: 0.75, splay: 0.05 });

          track(c)
            .key(0, { c: 0, K: terr.clone().addScaledVector(Ss0, G * 1.3), ks: 1 })
            .key(T(1, 0.03), {})
            .key(T(1, 0.4), { c: 1, ks: 0.12 }, 'inOut')
            .key(T(3, 0.9), { K: dnI0, ks: 0.6 })
            .key(T(4, 0.2), {})
            .key(T(4, 0.55), { c: 0.8 })
            .key(T(4, 0.6), {})
            .key(T(4, 0.95), { K: dnI1 })
            .key(T(5, 0.05), {})
            .key(T(5, 0.45), { c: 1 })
            .key(T(8, 0.1), { K: nII0, ks: 0.45 })
            .key(T(8, 0.2), {})
            .key(T(8, 0.68), { c: 0 }, 'inOut')
            .key(T(8, 0.72), {})
            .key(T(8, 1), { K: nII1 });

          const ciI = side > 0 ? 0 : 1;
          const ciII = side > 0 ? (ysg > 0 ? 0 : 2) : ysg > 0 ? 1 : 3;
          track(c)
            .key(0, { att: 0, ci: ciI, jit: 0 })
            .key(T(1, 0.86 + 0.03 * p), {})
            .key(T(2, 0.2 + 0.05 * p), { att: 1, jit: 1 })
            .key(T(2, 0.9), {})
            .key(T(3, 0.06), { jit: 0 })
            .key(T(3, 0.95), {})
            .key(T(4, 0.4), { att: 0 })
            .key(T(5, 0.5 + 0.05 * q), { ci: ciII })
            .key(T(6, 0.25 + 0.06 * q), { att: 1, jit: 1 })
            .key(T(6, 0.9), {})
            .key(T(7, 0.06), { jit: 0 })
            .key(T(7, 0.95), {})
            .key(T(8, 0.4), { att: 0 });

          out.push(c);
        }
      });
      return out;
    };

    // Prophase I layout: each tetrad's orientation and meeting point, and where each homolog
    // condenses before pairing (a short way out from its partner), are screened so chromosomes
    // stay clear of each other from condensation through synapsis to the metaphase plate.
    const layout = screened('meiosis', 300, (r, limit) => {
      const frames = PAIRS.map((_, p) => {
        const pl = plateMI[p];
        const U = CD.alignTo(pl.rd.clone().add(CD.randUnit(r).multiplyScalar(0.8)).normalize(), pl.rd);
        const H = CD.alignTo(CD.randPerp(U, r), X);
        const S = new V3().crossVectors(U, H).normalize();
        const plS = CD.alignTo(pl.S.clone(), S);
        const site = pairSites[p].clone().add(CD.randInBall(r, 0.15));
        return { U, H, S, plS, site };
      });

      const tetrads = frames.map((f, p) =>
        info
          .filter((i) => i.p === p)
          .flatMap((i) => {
            const Fh = f.H.clone().multiplyScalar(i.side);
            return poseRods(i.ch, f.site.clone().addScaledVector(Fh, HS_SYN), f.U, f.S, Fh, 0.06, G);
          })
      );
      if (!tetrads.every((rods) => fitsInside(rods, O, NUC_R - 0.2))) return null;
      for (let a = 0; a < tetrads.length; a++) {
        for (let b = a + 1; b < tetrads.length; b++) {
          if (tetrads[a].some((x) => tetrads[b].some((y) => rodsClash(x, y, MIN_GAP)))) return null;
        }
      }

      const placed = [];
      const early = [];
      for (const inf of info) {
        const f = frames[inf.p];
        let pose = null;
        for (let tries = 0; tries < 80 && !pose; tries++) {
          const C = f.site
            .clone()
            .addScaledVector(f.H, inf.side * (0.45 + r() * 0.2))
            .add(CD.randInBall(r, 0.12));
          const U = CD.alignTo(f.U.clone().add(CD.randUnit(r).multiplyScalar(0.5)).normalize(), f.U);
          const S = CD.alignTo(CD.randPerp(U, r), f.S);
          const rods = poseRods(inf.ch, C, U, S, null, 0.3, G);
          if (!fitsInside(rods, O, NUC_R - 0.2)) continue;
          if (placed.some((pr) => rods.some((a) => pr.some((b) => rodsClash(a, b, MIN_GAP))))) continue;
          placed.push(rods);
          pose = { C, U, S };
        }
        if (!pose) return null;
        early.push(pose);
      }

      const chromatids = buildChromatids(frames, early);
      return { chromatids, hits: countClashes(chromatids, T(1, 0.05), T(2, 0.5), 0.05, PATH_GAP, limit) };
    }, { attempt: 111, hits: 4 });
    def.chromatids.push(...layout.chromatids);

    PAIRS.forEach((_, p) => {
      const x = { pair: p, xf: XF[p], tracks: [] };
      track(x).key(0, { x: 0 }).key(T(1, 0.62), {}).key(T(1, 0.8), { x: 1 });
      def.chiasmata.push(x);
    });

    // cells: A divides along x, then B± each divide along y
    const A = { R: CELL_R, axis: X.clone(), tracks: [] };
    track(A).key(0, { center: O, vis: 1 }).key(T(4, 0.95), { vis: 0 });
    track(A).key(0, { e: 0 }).key(T(3, 0.1), {}).key(T(4, 0.15), { e: 0.28 });
    track(A).key(0, { s: 0 }).key(T(3, 0.75), {}).key(T(4, 0.65), { s: 1 }, 'inOut');
    track(A).key(0, { gap: 0 }).key(T(4, 0.65), {}).key(T(4, 0.95), { gap: GAP1 });
    def.cells.push(A);
    [1, -1].forEach((side) => {
      const B = { R: R1, axis: Y.clone(), tracks: [] };
      track(B).key(0, { center: v(side * BX, 0, 0), vis: 0 }).key(T(4, 0.95), { vis: 1 });
      track(B).key(0, { e: 0 }).key(T(7, 0.1), {}).key(T(8, 0.15), { e: 0.25 });
      track(B).key(0, { s: 0 }).key(T(7, 0.72), {}).key(T(8, 0.62), { s: 1 }, 'inOut');
      track(B).key(0, { gap: 0 }).key(T(8, 0.62), {}).key(T(8, 0.95), { gap: GAP2 });
      def.cells.push(B);
    });

    // nuclei
    const n0 = { tracks: [] };
    track(n0).key(0, { center: O, radius: NUC_R });
    track(n0)
      .key(0, { dissolve: 0, nucleolus: 1 })
      .key(T(1, 0.15), {})
      .key(T(1, 0.55), { nucleolus: 0 })
      .key(T(1, 0.76), {})
      .key(T(1, 0.97), { dissolve: 1 });
    def.nuclei.push(n0);
    [1, -1].forEach((side) => {
      const n = { tracks: [] };
      track(n)
        .key(0, { center: v(side * DNI0, 0, 0), radius: 1.55 })
        .key(T(4, 0.6), {})
        .key(T(4, 0.95), { center: v(side * BX, 0, 0) });
      track(n)
        .key(0, { dissolve: 1, nucleolus: 0 })
        .key(T(4, 0.2), {})
        .key(T(4, 0.7), { dissolve: 0 })
        .key(T(5, 0.08), {})
        .key(T(5, 0.5), { dissolve: 1 });
      def.nuclei.push(n);
      [1, -1].forEach((sg) => {
        const m = { tracks: [], nucleolusAt: v(side * 0.25, sg * 0.25, 0.15) };
        track(m)
          .key(0, { center: v(side * BX, sg * 1.7, 0), radius: 1.15 })
          .key(T(8, 0.58), {})
          .key(T(8, 0.95), { center: v(side * BX, sg * BY, 0) });
        track(m)
          .key(0, { dissolve: 1, nucleolus: 0 })
          .key(T(8, 0.22), {})
          .key(T(8, 0.72), { dissolve: 0 })
          .key(T(8, 1), { nucleolus: 1 });
        def.nuclei.push(m);
      });
    });

    // centrosomes: 0/1 = original pair (+x / −x, later top of each cell), 2/3 = duplicates (bottom)
    for (let i = 0; i < 4; i++) {
      const side = i % 2 === 0 ? 1 : -1;
      const top = i < 2;
      const ys = top ? 1 : -1;
      const Bc = v(side * BX, 0, 0);
      const z0 = top ? 0.25 : -0.25;
      const inter = Bc.clone().add(v(side * 1.8, 0.3, z0));
      const c = { tracks: [], seed: i * 1.3 };
      const tp = track(c);
      if (top) {
        const a0 = Math.PI / 2 - side * 0.09;
        const a1 = side > 0 ? 0 : Math.PI;
        tp.key(0, { p: v(Math.cos(a0) * 2.05, Math.sin(a0) * 2.05, 0.35), show: 1 });
        tp.key(T(1, 0.12), {});
        arcKeys(tp, T(1, 0.12), T(1, 0.85), O, a0, a1, 2.05, 2.5, 0.35, 0);
        tp.key(T(3, 0.02), {})
          .key(T(3, 0.95), { p: v(side * 3.0, 0, 0) })
          .key(T(4, 0.3), {})
          .key(T(4, 0.95), { p: inter });
      } else {
        tp.key(0, { p: inter, show: 0 }).key(T(4, 0.85), {}).key(T(4, 1), { show: 1 });
      }
      const aStart = Math.atan2(0.3, side * 1.8);
      const aEnd = top ? Math.PI / 2 : side > 0 ? -Math.PI / 2 : 1.5 * Math.PI;
      tp.key(T(5, 0.1), {});
      arcKeys(tp, T(5, 0.1), T(5, 0.9), Bc, aStart, aEnd, Math.hypot(1.8, 0.3), 1.9, z0, 0);
      const nucOff = v(side * 1.0, ys * 0.85, 0.3);
      tp.key(T(7, 0.02), {})
        .key(T(7, 0.95), { p: Bc.clone().addScaledVector(Y, ys * 2.25) })
        .key(T(8, 0.15), {})
        .key(T(8, 0.6), { p: v(side * BX, ys * 1.7, 0).add(nucOff) })
        .key(T(8, 0.95), { p: v(side * BX, ys * BY, 0).add(nucOff) });

      const ta = track(c);
      if (top) {
        ta.key(0, { aster: 0.3 })
          .key(T(1, 0.1), {})
          .key(T(1, 0.8), { aster: 1 })
          .key(T(4, 0.2), {})
          .key(T(4, 0.8), { aster: 0.3 });
      } else {
        ta.key(0, { aster: 0.3 });
      }
      ta.key(T(5, 0.1), {})
        .key(T(5, 0.8), { aster: 1 })
        .key(T(8, 0.2), {})
        .key(T(8, 0.9), { aster: 0.3 });
      def.centrosomes.push(c);
    }

    const s1 = { a: 0, b: 1, tracks: [] };
    track(s1)
      .key(0, { grow: 0 })
      .key(T(1, 0.55), {})
      .key(T(2, 0.3), { grow: 1 })
      .key(T(3, 0.95), {})
      .key(T(4, 0.5), { grow: 0 });
    def.spindles.push(s1);
    [
      [0, 2],
      [1, 3],
    ].forEach(([a, b]) => {
      const s = { a, b, tracks: [] };
      track(s)
        .key(0, { grow: 0 })
        .key(T(5, 0.45), {})
        .key(T(6, 0.4), { grow: 1 })
        .key(T(7, 0.95), {})
        .key(T(8, 0.5), { grow: 0 });
      def.spindles.push(s);
    });

    return def;
  };
})(window.CD);
