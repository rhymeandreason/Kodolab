/* =============================================================================
 *  sickle/population.js — a village over generations, and the sickle allele in it
 * =============================================================================
 *  Classic script after lib/scene.js and kit/card-stage.js. Exposes
 *  window.Population on the component contract. sickle-lab's for now, and not
 *  in kit/app.js's USES: it becomes a component when a second lesson (drift,
 *  Hardy-Weinberg) wants it.
 *
 *      const P = Population.mount(el, { malaria: 1 });
 *      P.reset(); P.set({ speed: 3 }); P.state().q; P.on('generation', s => ...);
 *
 *  ONE GENE, TWO ALLELES, ONE GENERATION AT A TIME. Every figure is one adult,
 *  and its two halves are its two copies of the β-globin gene: A (normal) or
 *  S (sickle). A generation: some die young, the survivors pair at random,
 *  each child takes one allele from each parent at random, and the children
 *  replace them. That is Wright-Fisher with viability selection, the textbook
 *  model, and the drift a village of a few hundred adds is real, not noise to
 *  be smoothed away.
 *
 *  WHO DIES. Relative to a carrier, whose fitness is 1:
 *      AA   1 - malaria * S_MALARIA     malaria, which carriers survive
 *      SS   1 - S_SICKLE                sickle cell disease, untreated
 *  Only the EXCESS deaths are drawn. Everyone dies of other things too, at
 *  the same rate, and drawing those would bury the difference. The two costs
 *  are illustrative, in the range of the classic East African estimates
 *  (Allison, 1950s), and not a measurement of any one place.
 *
 *  THE EQUILIBRIUM IS COMPUTED, never typed: with both costs acting, S
 *  settles where q = s / (s + t), the frequency at which the S alleles lost
 *  in SS children balance the A alleles lost in AA children. state().
 *  equilibrium is that; state().q is what this village reached, which drift
 *  keeps near it and not on it.
 *
 *  PARAMS: n adults (60..400, rebuilds) · start, S frequency at generation 0
 *  (rebuilds) · malaria 0..1 · speed (1 is a generation per GEN seconds) ·
 *  gens (holds after this many) · seed (rebuilds) · colours {A, S} (hex).
 *  state(): generation, n, q, carriers, counts {AA, AS, SS}, died {malaria,
 *  sickle}, history (q per generation), equilibrium, fitness {AA, AS, SS}.
 *  Events: frame, generation (a new one is standing), done.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = { n: 200, start: 0.05, malaria: 0, speed: 1, gens: 60, seed: 5,
                     colours: { A: 0x2f6fb5, S: 0xd9822b } };
  const S_MALARIA = 0.12;      // extra deaths among AA where malaria is common
  const S_SICKLE = 0.8;        // SS who die before having children, untreated
  const N_MAX = 400;
  const GEN = 1.8;             // s a generation takes at speed 1
  const SPACING = 1.15;        // between figures

  const rng = seed => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* A figure: a body lathed in two halves (x < 0 and x > 0), one per allele,
     and a head. The halves face the default camera side by side. */
  function bodyHalf(THREE, phiStart) {
    const pts = [[0.001, 0], [0.3, 0], [0.31, 0.05], [0.26, 0.2], [0.2, 0.52], [0.22, 0.64], [0.16, 0.72], [0.001, 0.76]]
      .map(([r, y]) => new THREE.Vector2(r, y));
    return new THREE.LatheGeometry(pts, 14, phiStart, Math.PI);
  }

  /* Hex lattice points, nearest the centre first, jittered so it is a crowd
     and not a parade. */
  function layout(n, R) {
    const pts = [], h = SPACING * Math.sqrt(3) / 2, span = Math.ceil(Math.sqrt(n)) + 3;
    for (let r = -span; r <= span; r++) for (let c = -span; c <= span; c++) {
      const x = (c + (r & 1) * 0.5) * SPACING, z = r * h;
      pts.push([x + (R() - 0.5) * 0.3, z + (R() - 0.5) * 0.3, R() * 0.6 - 0.3, R() * 6.283]);
    }
    pts.sort((a, b) => Math.hypot(a[0], a[1]) - Math.hypot(b[0], b[1]));
    return pts.slice(0, n);
  }

  /* THE GENETICS, free of THREE so sickle/tools/check-population.js runs
     the same code the page does. `lag` and `tip` are the render's draws,
     kept on the same stream so a seed is one whole village. */
  function village(P) {
    const R = rng(P.seed);
    const n = Math.max(60, Math.min(N_MAX, P.n | 0));
    if (P.n > N_MAX) console.warn(`Population: n capped at ${N_MAX}`);
    const spots = layout(n, R);
    let a1 = new Uint8Array(n), a2 = new Uint8Array(n);
    const doom = new Uint8Array(n), lag = new Float32Array(n), tip = new Float32Array(n);
    let died = { malaria: 0, sickle: 0 };
    const cost = () => ({ s: Math.min(1, Math.max(0, P.malaria)) * S_MALARIA, t: S_SICKLE });
    const qOf = () => { let k = 0; for (let i = 0; i < n; i++) k += a1[i] + a2[i]; return k / (2 * n); };

    /* Who among this generation dies young, drawn once when it is born. */
    function judge() {
      const { s, t } = cost();
      died = { malaria: 0, sickle: 0 };
      for (let i = 0; i < n; i++) {
        const k = a1[i] + a2[i];
        doom[i] = 0;
        if (k === 0 && R() < s) { doom[i] = 1; died.malaria++; }
        else if (k === 2 && R() < t) { doom[i] = 2; died.sickle++; }
        lag[i] = R() * 0.08;
        tip[i] = R() * 6.283;
      }
    }

    /* Generation 0 at Hardy-Weinberg proportions for `start`. A carrier is
       always A left, S right, so the halves read the same way across a crowd. */
    for (let i = 0; i < n; i++) {
      const x = R() < P.start ? 1 : 0, y = R() < P.start ? 1 : 0;
      a1[i] = Math.min(x, y); a2[i] = Math.max(x, y);
    }
    const V = { n, spots, doom, lag, tip, gen: 0, history: [qOf()],
                get a1() { return a1; }, get a2() { return a2; } };
    judge();

    /* The survivors pair at random and each child takes one allele from each
       parent at random. Everyone is replaced: generations do not overlap. */
    V.next = () => {
      const live = [];
      for (let i = 0; i < n; i++) if (!doom[i]) live.push(i);
      if (live.length < 2) for (let i = 0; i < n; i++) live.push(i);
      const b1 = new Uint8Array(n), b2 = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        const p = live[(R() * live.length) | 0];
        let q = live[(R() * live.length) | 0];
        while (q === p) q = live[(R() * live.length) | 0];
        const x = R() < 0.5 ? a1[p] : a2[p], y = R() < 0.5 ? a1[q] : a2[q];
        b1[i] = Math.min(x, y); b2[i] = Math.max(x, y);
      }
      a1 = b1; a2 = b2;
      V.gen++;
      V.history.push(qOf());
      judge();
    };

    V.state = () => {
      const { s, t } = cost(), c = { AA: 0, AS: 0, SS: 0 };
      for (let i = 0; i < n; i++) c[['AA', 'AS', 'SS'][a1[i] + a2[i]]]++;
      return {
        generation: V.gen, n, q: qOf(), carriers: c.AS / n, counts: c,
        died: Object.assign({}, died), history: V.history.slice(),
        equilibrium: s > 0 ? s / (s + t) : 0,
        fitness: { AA: 1 - s, AS: 1, SS: 1 - t },
      };
    };
    return V;
  }

  function create(THREE, root, params) {
    const P = Object.assign({}, DEFAULTS, params);
    P.colours = Object.assign({}, DEFAULTS.colours, params.colours || {});
    const listeners = {};
    const emit = (ev, ...a) => (global.CardStage ? CardStage.fire(listeners[ev], a, 'Population ' + ev)
                                                 : (listeners[ev] || []).forEach(f => f(...a)));

    const grp = new THREE.Group();
    root.add(grp);
    const matL = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0 });
    const matH = new THREE.MeshStandardMaterial({ color: 0xf1ebe1, roughness: 0.7, metalness: 0 });
    const geoL = bodyHalf(THREE, Math.PI), geoR = bodyHalf(THREE, 0);
    const geoH = new THREE.SphereGeometry(0.17, 14, 10);
    geoH.translate(0, 0.92, 0);
    const halfL = new THREE.InstancedMesh(geoL, matL, N_MAX);
    const halfR = new THREE.InstancedMesh(geoR, matL, N_MAX);
    const head = new THREE.InstancedMesh(geoH, matH, N_MAX);
    for (const m of [halfL, halfR, head]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.setColorAt(0, new THREE.Color());      // allocates instanceColor
      grp.add(m);
    }
    const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 72),
      new THREE.MeshStandardMaterial({ color: 0xddd5c6, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    grp.add(ground);

    let V, u = 0, done = false;
    const cA = new THREE.Color(), cS = new THREE.Color(), cGrey = new THREE.Color(0xb3ada3);
    const cHead = new THREE.Color(0xf1ebe1);

    function build() {
      V = village(P);
      let far = 0;
      for (const p of V.spots) far = Math.max(far, Math.hypot(p[0], p[1]));
      ground.scale.setScalar(far + 1.4);
      halfL.count = halfR.count = head.count = V.n;
      /* Generation 0 stands from the start, so a paused village is a village. */
      u = 0.3; done = false;
      draw();
    }

    const dummy = new THREE.Object3D(), _c = new THREE.Color();
    const _yaw = new THREE.Quaternion(), _tilt = new THREE.Quaternion(), _ax = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
    /* One generation's life on u in [0,1): born, stand, the doomed fall,
       stand, and the generation gives way to its children. */
    function draw() {
      cA.setHex(P.colours.A); cS.setHex(P.colours.S);
      const { n, spots, a1, a2, doom, lag, tip } = V;
      for (let i = 0; i < n; i++) {
        const [x, z, yaw] = spots[i];
        const born = smooth(lag[i], lag[i] + 0.2, u);
        const leave = done ? 0 : smooth(0.86 + lag[i], 0.98 + lag[i] * 0.2, u);
        const fall = doom[i] ? smooth(0.42 + lag[i], 0.62 + lag[i], u) : 0;
        dummy.position.set(x, 0, z);
        _yaw.setFromAxisAngle(_Y, yaw);
        _ax.set(Math.cos(tip[i]), 0, Math.sin(tip[i]));
        _tilt.setFromAxisAngle(_ax, fall * Math.PI * 0.47);
        dummy.quaternion.copy(_tilt).multiply(_yaw);
        dummy.scale.setScalar(Math.max(0.0001, born * (1 - leave)));
        dummy.updateMatrix();
        halfL.setMatrixAt(i, dummy.matrix); halfR.setMatrixAt(i, dummy.matrix); head.setMatrixAt(i, dummy.matrix);
        const grey = fall * 0.8;
        halfL.setColorAt(i, _c.copy(a1[i] ? cS : cA).lerp(cGrey, grey));
        halfR.setColorAt(i, _c.copy(a2[i] ? cS : cA).lerp(cGrey, grey));
        head.setColorAt(i, _c.copy(cHead).lerp(cGrey, grey));
      }
      for (const m of [halfL, halfR, head]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    }

    const state = () => Object.assign(V.state(), { malaria: P.malaria, speed: P.speed, done });

    build();

    return {
      group: grp, params: P, state,
      step(dt) {
        if (done) return;
        u += (dt || 0) * P.speed / GEN;
        if (u >= 1) {
          if (V.gen + 1 >= P.gens) { u = 0.99; done = true; draw(); emit('done', state()); return; }
          V.next();
          u -= 1;
          emit('generation', state());
        }
        draw();
      },
      set(next) {
        let rebuild = false;
        for (const k in next) {
          if (k === 'colours') { P.colours = Object.assign({}, P.colours, next.colours); continue; }
          if (P[k] === next[k]) continue;
          if (k === 'n' || k === 'start' || k === 'seed') rebuild = true;
          P[k] = next[k];
        }
        if (rebuild) build(); else draw();
      },
      reset() { build(); emit('generation', state()); },
      on(ev, fn) {
        const l = listeners[ev] || (listeners[ev] = []);
        l.push(fn);
        return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
      },
      dispose() {
        root.remove(grp);
        for (const x of [geoL, geoR, geoH, ground.geometry, ground.material, matL, matH]) x.dispose();
      },
    };
  }

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('population.js: load kit/card-stage.js first');
    let sim = null;
    const frames = [];
    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0, phi: 0.78, r: 34 },
      stage: Object.assign({ rMin: 10, rMax: 60, phiMin: 0.2, phiMax: 1.45 }, params.stage || {}),
      step: dt => { if (sim) { sim.step(dt); CardStage.fire(frames, [sim.state(), dt], 'Population frame'); } },
      viewOffset: params.viewOffset,
    });
    box.scene.add(new THREE.HemisphereLight(0xfff8ee, 0x8a8070, 0.35));
    sim = create(THREE, box.root, params);
    const api = {
      sim, box,
      set(next) { sim.set(next); if (!box.running) box.draw(); return api; },
      state: () => sim.state(),
      reset() { sim.reset(); if (!box.running) box.draw(); return api; },
      on(ev, fn) {
        if (ev !== 'frame') return sim.on(ev, fn);
        frames.push(fn);
        return () => { const i = frames.indexOf(fn); if (i >= 0) frames.splice(i, 1); };
      },
      start: box.start, stop: box.stop, pump: box.pump, draw: box.draw,
      destroy() { sim.dispose(); box.destroy(); },
    };
    box.pump();
    return api;
  }

  global.Population = { create, mount, village, DEFAULTS, S_MALARIA, S_SICKLE, N_MAX };
  /* Scale (kit/scale.js). A figure is a person and nothing about the
     render is measured: the spacing is a diagram's. */
  global.Population.SCALE = { rung: 'population', form: 'bulk', unit: null, sceneUnits: [], exag: {}, down: {} };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Population;
})(typeof globalThis !== 'undefined' ? globalThis : this);
