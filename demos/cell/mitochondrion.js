/* =============================================================================
 *  cell/mitochondrion.js — one mitochondrion, cut open, membrane by membrane
 * =============================================================================
 *  The organelle when it is the SUBJECT rather than one of five things in a
 *  cut cell. The SAME PICTURE the cut cell's mitochondrion already draws — an
 *  outer membrane, and inside it one continuous inner membrane folded back
 *  and forth — with the resolution that distance was hiding: twice the folds,
 *  the sheet swept as a membrane with an edge rather than as a line, the
 *  electron transport chain on it, and protons making the round trip that
 *  respiration is paid in.
 *
 *      Mitochondrion.create(THREE, root, camera, opts)   the model
 *      Mitochondrion.mount(el, params)                   one box, one handle
 *
 *  LOAD cell/organelles.js FIRST. All the geometry is there, as
 *  `mitochondrionDetail`, beside the `mitochondrion` it is a finer version
 *  of and sharing its fold path: the cut cell swaps the same builder in when
 *  the camera flies to one of its five, and a student must arrive at the
 *  same object rather than at a second drawing of it. What is HERE is
 *  behaviour — the protons, the rotors, the picking, and the words.
 *
 *  WHAT THIS COMPONENT IS FOR is one claim, and it is a claim about topology:
 *  there is ONE space outside the inner membrane — the intermembrane space
 *  and the inside of every fold, joined at the crista junctions — and one
 *  space inside it, the matrix. Protons go out of the matrix at the complexes
 *  and come back through ATP synthase. Everything drawn is in service of
 *  that: the sheet is ONE ribbon of ONE membrane's thickness so nobody can
 *  read the folds as separate compartments, and a crista lumen is not drawn
 *  at all — it is the space a fold encloses, continuous with the
 *  intermembrane space through the junction.
 *
 *  THE MACHINES ARE MEMBRANE'S COLOURS, not this component's. The chain's
 *  blue, the synthase's gold, the porin's grey and the proton all come from
 *  palette.js's `respiration`, which membrane/membrane.js reads too — a
 *  student meets the same gold thing making ATP in both boxes, one rung
 *  apart, and neither file may type one.
 *
 *  IT IS NOT THE PHYSICS, AND REFUSES TO BE. There is no pH here, no
 *  proton-motive force, no fuel and no respiratory control: that is
 *  membrane/membrane.js with `context:'mitochondrion'`, one rung down, where
 *  the arithmetic is checked. What this owns is the ARCHITECTURE the
 *  arithmetic happens in, and the two are meant to be mounted together —
 *  the organelle for where, the membrane for how much. The one number they
 *  share is the rotor's stoichiometry, and it is read from
 *  chemiosmosis/electron-transport.js rather than typed, so the two boxes cannot
 *  disagree about how many protons an ATP costs.
 *
 *  THE PROTONS ARE COUNTED, NOT SIMULATED. Each drawn proton is one route
 *  through one machine, and `state()` reports the routes that completed.
 *  A drawn proton stands for a great many real ones; nothing here is a
 *  concentration and no page may print one off it.
 *
 *  THE CONTRACT (docs/AddingAComponent.md, docs/Components.md):
 *
 *      params   flow 0..1 (live, glides) · uncoupler (live) ·
 *               seed (rebuild)
 *      state()  the ledger, the counts, and the sizes that are real
 *      events   frame · hover · pick · turn (one full rotor revolution)
 *      parts    outer · porin · ims · inner · crista · junction · complex ·
 *               synthase · matrix · dna · ribosome · proton. LIBRARY is the
 *               teaching text. NOT ALL OF THEM ARE MESHES: `crista` and
 *               `junction` are places ON the inner membrane, and `ims` and
 *               `matrix` are spaces between things — they carry an anchor and
 *               a card, and no show chip, because hiding a fold would mean
 *               hiding the membrane it is part of.
 *
 *  GLIDES: `flow`. SNAPS: `uncoupler`, and every geometry parameter, which
 *  rebuilds — nothing tweens across a rebuild.
 *
 *  BUDGET, measured on the bench at the default ten folds: 0.06 ms a step,
 *  1 ms a frame, 126k triangles, 17 draw calls. The inner membrane is one
 *  swept mesh however many folds it has, which is why the call count
 *  barely moves with the fold count. A REBUILD IS 40 TO 60 ms, so `seed` is a
 *  button, never a slider.
 *
 *  SCALE. Lengths ALONG the organelle are honest: one scene unit is 100 nm,
 *  so the capsule is 1.9 by 0.7 µm and `state()` may be printed. The
 *  membranes and the machines are not, and SCALE.exag says by how much. A
 *  4 nm bilayer beside a 700 nm organelle is a fifth of a pixel.
 * ========================================================================== */
(function (global) {
  'use strict';

  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ONE SCENE UNIT IS 100 NM, and R is the organelle's half-width. Everything
     the builder draws is a multiple of R, so these four numbers are the whole
     of what this component claims about size — and the three membrane
     thicknesses are passed IN rather than left to the builder, because they
     are what SCALE.exag is measured against. */
  const R = 3.5;                       // half-width: the capsule is 0.7 µm across
  const UNIT = 1e-7;                   // metres per scene unit
  const NM = u => u * UNIT * 1e9;
  const TH = 0.044 * R;                // one membrane, drawn — outer and inner alike
  const IMS = 0.07 * R;                // the intermembrane space, drawn
  const LUM = 0.057 * R;               // the space a fold encloses, drawn
  /* Measured thicknesses, for the exaggeration factors below. A bilayer is
     ~4 nm (OPM); the intermembrane space and a crista lumen are ~20 nm and a
     crista junction ~25 nm across in tomography. */
  const TRUE_NM = { membrane: 4, ims: 20, lumen: 20 };

  const DEFAULTS = {
    seed: 4231,         // rebuild
    flow: 0.6,          // 0..1 how hard the chain is running; glides
    uncoupler: false,   // protons home without a synthase, and no ATP is made
    protons: 160,       // how many are drawn; a budget, not a concentration
    detail: 1,          // tessellation
  };

  /* Poses for the parts the home view cannot show close enough to name.
     Only these fly; every other chip labels where the part already is, which
     is the rule in AddingAComponent.md and the reason a note chip is not a
     ride. */
  const VIEWS = {
    crista:   { theta: 0.55, phi: 1.00, r: 15 },
    junction: { theta: 1.10, phi: 1.12, r: 12 },
    synthase: { theta: 0.30, phi: 1.22, r: 11 },
    complex:  { theta: -0.45, phi: 1.08, r: 12 },
    proton:   { theta: 0.40, phi: 0.98, r: 13 },
    porin:    { theta: 2.10, phi: 1.45, r: 20 },
  };

  const ORDER = ['outer', 'porin', 'ims', 'inner', 'crista', 'junction',
                 'complex', 'synthase', 'matrix', 'dna', 'ribosome', 'proton'];

  /* The component's own teaching text: a label and two sentences per part, in
     a tutor's voice, so a generated page answers "what is that?" with a
     callout on the thing instead of a paragraph of its own invention. Real
     sizes belong here as prose about the real organelle. */
  const LIBRARY = {
    outer:    { text: 'outer membrane', offset: [46, -26], card: 'The outer membrane, and it leaks. Porins hold it open to anything under about 5 kDa, so the space just inside it is chemically almost the cytosol — which is why no gradient can stand across this one.' },
    porin:    { text: 'porins', offset: [46, 24], card: 'Barrels that sit permanently open, studded all over the outer membrane. They are the reason that membrane is a sieve, and the reason the inner one has to do all the work.' },
    ims:      { text: 'intermembrane space', offset: [-48, -28], card: 'The space between the two membranes, and the pale core running down the inside of every fold, because those are one space joined at the crista junctions. Protons pumped out of the matrix collect here, and this is the tank chemiosmosis draws on.' },
    inner:    { text: 'inner membrane', offset: [-48, 26], card: 'Almost nothing crosses this one without a protein, which is what lets a proton gradient stand across it. Follow it: the sheet running along the wall and every crista folded off it are one surface, and every complex and every ATP synthase sits in it.' },
    crista:   { text: 'crista', offset: [44, -22], card: 'A fold of the inner membrane, pushed deep into the matrix and doubling back on itself. Folding is how a mitochondrion fits several times its own surface area of respiring membrane inside itself, and a cell that respires hard grows more of them.' },
    junction: { text: 'crista junction', offset: [-46, -22], card: 'The waist where a fold leaves the wall, about 25 nm across and held open by proteins. Narrow on purpose: it keeps the protons a crista pumps inside that crista, so the force is strongest right where the synthases are.' },
    complex:  { text: 'the electron transport chain', offset: [44, 22], card: 'Complexes I, III and IV pass electrons down the chain and push protons out of the matrix as they go. Complex II — the pale one — feeds electrons in from FADH₂ but pumps nothing, which is exactly why FADH₂ is worth less ATP than NADH.' },
    synthase: { text: 'ATP synthase', offset: [46, -20], card: 'Protons fall back out of the crista lumen through this, and the rotor turns. The head hanging in the matrix makes one ATP per third of a turn, so the gradient is the thing that is actually spent.' },
    matrix:   { text: 'the matrix', offset: [-46, 22], card: 'The enclosed space inside the inner membrane, where pyruvate is oxidised and the Krebs cycle runs. Everything the chain burns is made in here, and every proton the chain pumps is pumped out of here.' },
    dna:      { text: 'mitochondrial DNA', offset: [-44, -20], card: 'A small circle of the organelle’s own DNA, bacterial in shape and inherited only from your mother. It is the plainest evidence that this organelle was once a free-living cell.' },
    ribosome: { text: 'mitochondrial ribosomes', offset: [46, 26], card: 'Ribosomes of the bacterial kind, not this cell’s. They build a handful of the chain’s own subunits here, inside the organelle, from the genome beside them.' },
    proton:   { text: 'protons', offset: [-46, 24], card: 'Complexes push them out of the matrix and ATP synthase lets them back in. The whole payoff of respiration is in that round trip, which is why an uncoupler — a hole that skips the synthase — burns fuel and makes only heat.' },
  };

  /* ---- the model ----------------------------------------------------- */

  function create(THREE, root, camera, opts = {}) {
    if (!global.CellOrganelles) throw new Error('cell/mitochondrion.js: load cell/organelles.js first');
    const P = Object.assign({}, DEFAULTS, opts);
    if (!global.CardStage) throw new Error('cell/mitochondrion.js: load kit/card-stage.js first');
    const V3 = THREE.Vector3;
    const ET = global.ElectronTransport;
    /* The rotor's stoichiometry is chemiosmosis/electron-transport.js's RING,
       so this box and an ElectronTransport mounted beside it cannot disagree
       about what an ATP costs. Absent (a page that loaded neither), the
       mammalian c8 ring as that file draws it, and the fallback is the thing
       that is wrong if they drift. */
    const PPT = ET ? ET.RING.protonsPerTurn : 9;
    const APT = ET ? ET.RING.atpPerTurn : 3;

    const listeners = {};
    const on = (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn);
      return () => { listeners[ev] = listeners[ev].filter(f => f !== fn); }; };
    const emit = (ev, ...args) => global.CardStage.fire(listeners[ev], args, ev);

    const model = new THREE.Group();
    root.add(model);
    const tw = global.CardStage.tweens();

    let K = null, group = null, D = null, protonMesh = null, protons = [], rand = null;
    let hovered = null, selected = null;
    const shown = {};
    let pumped = 0, through = 0, leaked = 0, rotorAngle = 0, turnsSeen = 0;

    const rr = (a, b) => a + (b - a) * rand();
    const pickOne = arr => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];

    function build() {
      if (group) { model.remove(group); dispose(group); }
      K = global.CellOrganelles.kit(THREE, { seed: P.seed });
      rand = K.rand;
      group = K.mitochondrionDetail({
        r: R, L: 1.7 * R, membrane: TH, ims: IMS, lumen: LUM,
        cristae: 10, open: 1, detail: P.detail,
      });
      model.add(group);
      D = group.userData.detail;

      for (const name in D.groups) D.groups[name].userData.part = name;

      /* The protons. An InstancedMesh because there are dozens and they are
         the one thing on stage that moves every frame. */
      const RESP = (global.MolPalette || global.MolLib.PALETTE).respiration;
      /* Matte, and barely lit from inside. A sphere this small under a
         studio key is mostly highlight, and a highlit bead reads as white
         rather than as the pale steel every other H⁺ in the library is. */
      const pm = K.mat({ color: RESP.proton, roughness: 0.8, clearcoat: 0.1,
                         emissive: RESP.proton, emissiveIntensity: 0.14 });
      protonMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.016 * R, 8, 6), pm, P.protons);
      protonMesh.userData.part = 'proton';
      group.add(protonMesh);

      protons = [];
      for (let i = 0; i < P.protons; i++) {
        /* Start with most of them already outside: a mitochondrion at rest is
           not a mitochondrion with a flat gradient, and starting them evenly
           would say the gradient is something the page builds from zero. */
        const inLumen = rand() < 0.62;
        protons.push({
          mode: inLumen ? 'lumen' : 'matrix',
          pos: (inLumen ? pickOne(D.pockets.lumen) : pickOne(D.pockets.matrix)).clone(),
          vel: new THREE.Vector3(), anchor: null, curve: null,
          path: null, t: 0, dur: 0, wait: rr(0, 2.5), done: null,
        });
        protons[protons.length - 1].anchor = protons[protons.length - 1].pos.clone();
      }
      pumped = through = leaked = 0; rotorAngle = 0; turnsSeen = 0;
      for (const n in shown) if (shown[n] === false) applyShow(n, false);
      writeProtons();
    }

    function dispose(g) {
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }

    /* ---- the round trip -------------------------------------------------
       A free proton does not travel to a machine. It diffuses, and at 100 nm
       a nanosecond carries it anywhere in its compartment, so no path toward
       a pump is visible and none is drawn. What is drawn is a slowed random
       wander held inside the compartment, and the one directed step there
       is: a machine NEAR the proton takes it up and releases it on the other
       side. The route through the machine is what carries the claim, out of
       the matrix only at a complex and back in only at a synthase, and the
       ledger is the routes that finished rather than a number the module
       asserts.

       THE WANDER IS TETHERED to a pocket point, and a tether moves only to a
       pocket close by. A crista lumen is thinner than one step of a free
       walk, so a free walk leaves it through the membrane.

       COMPLEX II IS NOT A DOOR. It is on the crista and it is in the legend,
       and a proton never uses it: that is the whole reason FADH₂ yields less
       than NADH, and it has to be true of the picture, not just of a caption. */
    const PUMPS = () => D.sites.complex.filter(s => s.kind !== 'II');
    const REACH = 0.2 * R;

    const nearest = (list, at, key) => {
      let best = list[0], bd = Infinity;
      for (const it of list) { const d = (key ? key(it) : it).distanceToSquared(at); if (d < bd) { bd = d; best = it; } }
      return best;
    };
    const nearby = (list, at, reach) => {
      const out = list.filter(q => q.distanceTo(at) < reach);
      return out.length ? pickOne(out) : nearest(list, at);
    };

    function route(p) {
      const speed = 0.35 + 2.4 * P.flow;
      if (p.mode === 'matrix') {
        const s = nearest(PUMPS(), p.anchor, q => q.p);
        p.path = [p.pos.clone(),
                  s.p.clone().addScaledVector(s.out, 0.08 * R),
                  s.p.clone().addScaledVector(s.out, 0.01 * R),
                  s.lumen.clone()];
        p.dur = (0.9 + rr(0, 0.5)) / speed;
        p.done = () => { p.mode = 'lumen'; p.anchor = nearby(D.pockets.lumen, s.lumen, REACH).clone(); pumped++; };
      } else if (P.uncoupler && rand() < 0.8) {
        /* An uncoupler is a hole, not a machine: straight back across the
           inner membrane, no rotor, no ATP, and the fuel all comes out as
           heat. Drawn as the short cut it is. */
        const to = nearest(D.pockets.matrix, p.pos);
        p.path = [p.pos.clone(), to.clone()];
        p.dur = (0.7 + rr(0, 0.4)) / speed;
        p.done = () => { p.mode = 'matrix'; p.anchor = to.clone(); leaked++; };
      } else {
        const s = nearest(D.sites.synthase, p.anchor, q => q.lumen);
        const out = s.p.clone().addScaledVector(s.out, 0.30 * R);
        p.path = [p.pos.clone(), s.lumen.clone(),
                  s.p.clone().addScaledVector(s.out, 0.02 * R), out];
        p.dur = (1.0 + rr(0, 0.6)) / speed;
        p.done = () => { p.mode = 'matrix'; p.anchor = nearby(D.pockets.matrix, out, REACH).clone(); through++; };
      }
      p.curve = new THREE.CatmullRomCurve3(p.path, false, 'centripetal');
      p.t = 0;
    }

    /* Ornstein-Uhlenbeck: velocity is kicked at random and damped, so the
       wander is smooth, and pulled toward the tether, so it stays put. */
    function wander(p, dt) {
      const k = Math.min(dt, 0.05), kick = 0.5 * R * Math.sqrt(k);
      p.vel.x += (rand() - 0.5) * kick - p.vel.x * 3 * k + (p.anchor.x - p.pos.x) * 4 * k;
      p.vel.y += (rand() - 0.5) * kick - p.vel.y * 3 * k + (p.anchor.y - p.pos.y) * 4 * k;
      p.vel.z += (rand() - 0.5) * kick - p.vel.z * 3 * k + (p.anchor.z - p.pos.z) * 4 * k;
      p.pos.addScaledVector(p.vel, k);
    }

    function stepProtons(dt) {
      for (const p of protons) {
        if (p.path) {
          p.t += dt;
          const u = clamp(p.t / p.dur, 0, 1);
          p.curve.getPoint(u * u * (3 - 2 * u), p.pos);
          if (u >= 1) { p.path = null; p.done(); p.vel.set(0, 0, 0); p.wait = 0.4 + rand() * 1.8; }
        } else {
          if (rand() < dt * 0.25)
            p.anchor = nearby(p.mode === 'lumen' ? D.pockets.lumen : D.pockets.matrix, p.anchor, REACH).clone();
          wander(p, dt);
          p.wait -= dt * (0.35 + 2 * P.flow);
          if (p.wait <= 0 && P.flow > 0.005) route(p);
        }
      }
      writeProtons();
    }

    const _m4 = new THREE.Matrix4();
    function writeProtons() {
      if (!protonMesh) return;
      protons.forEach((p, i) => { _m4.makeTranslation(p.pos.x, p.pos.y, p.pos.z); protonMesh.setMatrixAt(i, _m4); });
      protonMesh.instanceMatrix.needsUpdate = true;
    }

    /* ---- picking ------------------------------------------------------- */
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(-2, -2);
    function partAt() {
      if (ndc.x < -1.5) return null;
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObject(group, true);
      for (const h of hits) {
        let o = h.object;
        while (o && !o.userData.part) o = o.parent;
        if (o && o.visible && shown[o.userData.part] !== false) return o.userData.part;
      }
      return null;
    }
    /* NOTHING LIGHTENS UNDER THE POINTER, and nothing lightens when it is
       picked. The cut cell brightens a whole organelle on hover because an
       organelle there is one small object against a crowd of others; a part
       here is most of the screen, and raising its emissive washes a membrane
       out rather than picking it out — worse on the inner membrane, which is
       vertex-coloured, so lifting emissive off `material.color` lifts it off
       white. Hover and pick are reported instead: the cursor turns, `hover`
       and `pick` fire, and a page answers with a note on the thing, which is
       the callout the component carries words for.

       If a part ever does need marking on the model itself, mark it with
       geometry — a ring, an arrow, a note leader — not by turning the part
       into a lamp. */

    /* NOT EVERY PART IS A MESH. `ims`, `matrix`, `crista` and `junction` are
       places on or between things that ARE meshes — a fold and the waist
       where it leaves the wall are both the inner membrane, and hiding them
       would mean hiding it. They carry an anchor and a card and no chip. */
    function applyShow(name, on) {
      if (name === 'proton') { if (protonMesh) protonMesh.visible = on; return; }
      const g = D.groups[name];
      if (g) g.visible = on;
    }

    /* ---- step ----------------------------------------------------------- */
    let last = null;
    function step(dt) {
      tw.update(dt);
      stepProtons(dt);
      /* The rotor turns because protons went through it, not because time
         passed: PPT protons is one revolution, so the beat a student counts
         is the ledger. Chased rather than snapped, or a proton arriving would
         jump the ring a notch. */
      const want = (through / PPT) * 2 * PI;
      rotorAngle += (want - rotorAngle) * Math.min(1, dt * 4);
      if (group.userData.rotors)
        K.spinRotors(group.userData.rotors.mesh, group.userData.rotors.list, rotorAngle);
      const turns = Math.floor(through / PPT);
      if (turns > turnsSeen) { turnsSeen = turns; emit('turn', turns); }
      const h = partAt();
      if (h !== hovered) { hovered = h; emit('hover', h); }
      last = state();
      emit('frame', last, dt);
      return last;
    }

    function state() {
      const d = D.dims;
      let lumen = 0;
      for (const p of protons) if (p.mode === 'lumen') lumen++;
      return {
        flow: P.flow, uncoupler: !!P.uncoupler,
        cristae: d.cristae, junctions: d.junctions, complexes: d.complexes,
        synthases: d.synthases, porins: d.porins,
        protons: { lumen, matrix: protons.length - lumen, total: protons.length },
        pumped, throughSynthase: through, leaked,
        rotorTurns: through / PPT, atpMade: Math.floor((through / PPT) * APT),
        stoichiometry: { protonsPerTurn: PPT, atpPerTurn: APT, protonsPerATP: PPT / APT },
        /* Real, because the capsule is drawn to a unit: 1 scene unit is
           100 nm. The thicknesses are drawn and SCALE.exag says by how much;
           they are here so a page prints the drawing rather than guessing. */
        lengthNm: NM(2 * (1.7 * R + R)), widthNm: NM(2 * R),
        cristaSpacingNm: NM(d.pitch),
        membraneNm: NM(d.th), imsNm: NM(d.gapIM - d.th), lumenNm: NM(d.lumenT),
        hovered, selected, shown: Object.assign({}, shown),
      };
    }

    function set(next = {}, o = {}) {
      let rebuild = false;
      for (const k of ['seed', 'protons', 'detail'])
        if (next[k] !== undefined && next[k] !== P[k]) { P[k] = next[k]; rebuild = true; }
      if (next.uncoupler !== undefined) P.uncoupler = !!next.uncoupler;
      if (next.flow !== undefined) {
        const to = clamp(next.flow, 0, 1);
        tw.to(P.flow, to, o.snap ? 0 : 0.7, v => { P.flow = v; }, { key: 'flow' });
      }
      if (rebuild) build();
      return api;
    }

    /* Anchors are functions, not points: the model turns and they turn with
       it. `ims` and `matrix` are spaces rather than meshes, so each is
       anchored on a sampled point inside itself. */
    const w = v => (v ? model.localToWorld(v.clone()) : null);
    const pick = (arr, f) => (arr && arr.length ? arr[Math.floor(arr.length * f)] : null);
    const anchors = {
      outer:    () => w(new V3(-1.1 * R, -0.72 * R, 0.34 * R)),
      porin:    () => w(new V3(0.9 * R, -0.80 * R, 0.30 * R)),
      ims:      () => w(D.pockets.ims[3]),
      /* `inner` points at a wall-hugging run and `crista` at a fold tip, on
         purpose: they are two places on ONE ribbon, and a reader who turns
         both chips on at once should see two labels on the same sheet. */
      inner:    () => w(pick(D.path, 0.02)),
      crista:   () => w(pick(D.tips, 0.5)),
      junction: () => w(pick(D.necks, 0.5)),
      complex:  () => { const s = D.sites.complex.find(x => x.kind === 'I'); return s ? w(s.p) : null; },
      synthase: () => w(pick(D.sites.synthase, 0.5) && pick(D.sites.synthase, 0.5).p),
      matrix:   () => w(D.pockets.matrix[0]),
      dna:      () => { const m = D.groups.dna.children[0];
                        if (!m) return null;
                        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
                        return w(m.geometry.boundingSphere.center); },
      ribosome: () => w(D.pockets.matrix[7]),
      proton:   () => { const p = protons.find(x => x.mode === 'lumen'); return p ? w(p.pos) : null; },
    };
    /* Only the parts on the OUTSIDE can turn away from the reader; everything
       else is in the cut, which the default camera is aimed into. */
    const faceOut = a => () => { const p = anchors[a](); return p ? p.clone().sub(model.getWorldPosition(new V3())).normalize() : null; };
    const facings = { outer: faceOut('outer'), porin: faceOut('porin') };

    const hex = v => '#' + (typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16)).toString(16).padStart(6, '0');
    const ORGP = (global.MolPalette || global.MolLib.PALETTE).organelles.mitochondrion;
    const RESPP = (global.MolPalette || global.MolLib.PALETTE).respiration;
    const palette = () => [
      { name: 'membranes', color: hex(ORGP.outer) },
      { name: 'intermembrane space and crista lumen', color: hex(ORGP.lumen) },
      { name: 'the electron transport chain', color: hex(RESPP.complex) },
      { name: 'complex II (pumps nothing)', color: hex(RESPP.complexII) },
      { name: 'ATP synthase', color: hex(RESPP.synthase) },
      { name: 'porins', color: hex(RESPP.porin) },
      { name: 'protons', color: hex(RESPP.proton) },
      { name: 'mitochondrial DNA', color: hex(ORGP.dna) },
    ];
    const layersOf = () => ORDER.filter(n => n === 'proton' || D.groups[n])
      .map(n => ({ name: n, label: LIBRARY[n].text, on: shown[n] !== false }));
    const show = (n, on) => { shown[n] = !!on; applyShow(n, !!on); return api; };
    const select = n => { selected = n; emit('pick', n); return api; };

    const api = {
      step, state, set, on, anchors, facings, library: LIBRARY, layersOf, show, palette, select,
      point: (x, y) => { ndc.set(x, y); },
      pick: () => partAt(),
      model, params: () => P, ORDER,
      get selected() { return selected; },
    };
    build();
    return api;
  }

  /* ---- the box -------------------------------------------------------- */

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('cell/mitochondrion.js: load kit/card-stage.js first');
    let mito = null, last = null, nb = null;
    const box = global.CardStage.create({
      mount: el,
      /* Above and to the side, looking down into the cut: the cristae, the
         machines and the protons are all inside it, and a view from the
         equator shows an orange capsule. */
      cam: params.cam || { theta: 0.62, phi: 0.92, r: 26 },
      stage: Object.assign({ phiMax: 2.6, rMin: 6, rMax: 70 }, params.stage || {}),
      step: dt => { if (mito) last = mito.step(dt); },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    /* Stage's studio lights ride the camera, so orbiting reads as turning the
       organelle under a fixed lamp. Kept, warmed off the blue fill (which
       reads as cold grey on an orange subject), and given one low camera
       light so the inside of the bowl is modelled rather than a dark well —
       the whole subject is in there. No shadow maps: between cristae packed
       this closely a cast shadow lands as soot. */
    box.renderer.toneMapping = THREE.NoToneMapping;
    box.scene.traverse(o => {
      if (o.isAmbientLight) o.intensity = 0.46;
      else if (o.isDirectionalLight) { o.color.set(o.intensity > 0.6 ? 0xfff4e8 : 0xf0e4dc); o.intensity *= 0.85; }
    });
    /* TWO EXTRA LIGHTS, BOTH ON THE CAMERA, and the ambient nearly doubled.
       Almost every surface worth seeing here is a crista face, and a crista
       face is edge-on to the view: with one key light they all fall to
       ambient and the inside of the organelle reads as a dark well. These
       two rake it from either side, which is what models a plate. */
    for (const [x, y, z, i] of [[-4, 4, 3, 0.30], [4, -2, 3, 0.24]]) {
      const l = new THREE.DirectionalLight(0xffffff, i);
      l.position.set(x, y, z);
      box.camera.add(l, l.target);
    }

    mito = create(THREE, box.root, box.camera, params);

    const cv = box.canvas;
    const onMove = e => { const b = cv.getBoundingClientRect();
      mito.point(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); };
    const onLeave = () => mito.point(-2, -2);
    /* A drag is not a click: an orbit that ends over the background fires
       `click` like any other, and would throw the selection away. */
    let downAt = null;
    const onDown = e => { downAt = [e.clientX, e.clientY]; };
    const onClick = e => {
      const moved = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4) return;
      const hit = mito.pick();
      // Emptiness clears; clicking the part you already have keeps it.
      mito.select(hit || null);
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('click', onClick);
    mito.on('hover', n => { cv.style.cursor = n ? 'pointer' : ''; });
    box.pump();
    nb = global.Notebook ? global.Notebook.create({ box, anchors: mito.anchors, facings: mito.facings, library: mito.library }) : null;

    return {
      sim: mito, box,
      views: () => VIEWS,
      lookAt(name, dur) { if (VIEWS[name]) box.flyTo(VIEWS[name], dur); else box.flyTo({ theta: 0.62, phi: 0.92, r: 26 }, dur); return this; },
      home(dur) { box.flyTo({ theta: 0.62, phi: 0.92, r: 26 }, dur); return this; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      layers: mito.layersOf, show: (n, on) => { mito.show(n, on); if (!box.running) box.draw(); return this; }, palette: mito.palette,
      set(next, opts) { mito.set(next, opts); if (!box.running) box.draw(); return this; },
      state: () => last || mito.state(),
      on: mito.on,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() {
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerleave', onLeave);
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('click', onClick);
        box.destroy();
      },
    };
  }

  global.Mitochondrion = { create, mount, DEFAULTS, VIEWS, ORDER, LIBRARY, R, UNIT };
  /* Scale (kit/scale.js). MEASURED ALONG, DRAWN ACROSS: one scene unit is
     100 nm, so the capsule's 1.9 by 0.7 µm is real and a page may print it.
     Everything thin is exaggerated, because at true thickness a bilayer beside
     this organelle is a fifth of a pixel — the three membrane factors are
     computed from the numbers the builder was handed, so they cannot drift
     from what is drawn. The machines are icons and their factors are typed.
     `down` is where a zoom hands off: the physics of the gradient is
     ElectronTransport's, one rung down. */
  global.Mitochondrion.SCALE = {
    rung: 'organelle', form: 'single', unit: UNIT, sceneUnits: [],
    exag: {
      membrane: +(NM(TH) / TRUE_NM.membrane).toFixed(1),
      ims: +(NM(IMS) / TRUE_NM.ims).toFixed(1),
      lumen: +(NM(LUM) / TRUE_NM.lumen).toFixed(1),
      junction: 1.4, complex: 3.5, synthase: 2.8, porin: 8, ribosome: 2, dna: 4,
    },
    down: { inner: 'ElectronTransport', crista: 'ElectronTransport', synthase: 'ElectronTransport', complex: 'ElectronTransport' },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
