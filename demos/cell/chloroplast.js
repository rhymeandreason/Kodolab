/* =============================================================================
 *  cell/chloroplast.js — one chloroplast, cut open, membrane by membrane
 * =============================================================================
 *  The organelle when it is the SUBJECT rather than one of five in a cut
 *  leaf cell: the envelope's two membranes, and inside them the thylakoid
 *  system at the resolution distance was hiding. Grana as stacks of sacs,
 *  lamellae joining them, the light reactions' machines on the membrane,
 *  and protons making the round trip that the light is paid in.
 *
 *      Chloroplast.create(THREE, root, camera, opts)   the model
 *      Chloroplast.mount(el, params)                   one box, one handle
 *
 *  LOAD cell/organelles.js FIRST. The geometry is there, as
 *  `chloroplastDetail`, beside the `chloroplast` the cut leaf cell draws.
 *  What is HERE is behaviour — the protons, the rotors, the oxygen, the
 *  picking, and the words.
 *
 *  WHAT THIS COMPONENT IS FOR is two claims about where things are.
 *  THE THYLAKOID IS ONE MEMBRANE ENCLOSING ONE SPACE: every granum is joined
 *  to the next by lamellae, so a proton pumped into any disc is in the same
 *  lumen as every other and drives every synthase in the organelle. And
 *  THE MACHINES SORT BY WHERE THEY FIT: photosystem II in the appressed
 *  faces between stacked discs; photosystem I and ATP synthase only where
 *  the membrane is open to the stroma, because both hang a bulk into it
 *  that has no room between two discs. The geometry enforces the second;
 *  the proton routes are built on the first.
 *
 *  THE GRADIENT IS BUILT TWICE, and both are drawn. Cytochrome b6f pumps
 *  protons from the stroma into the lumen, the way a mitochondrion's chain
 *  does. Photosystem II ALSO fills the lumen, without pumping: it splits
 *  water inside the sac and the protons stay there, while on the stroma
 *  side a proton is taken up each time NADP⁺ becomes NADPH. Drawn as one
 *  proton leaving the stroma at PSI and appearing in the lumen at PSII,
 *  because that is the net of it, and the pool is a fixed budget rather
 *  than a concentration. Every fourth proton from water releases one O₂,
 *  which is the only thing that leaves the organelle on stage.
 *
 *  THE MACHINES ARE THE LIBRARY'S COLOURS, not this component's. The pump
 *  is palette.js's `respiration.complex` because it is the machine
 *  membrane/membrane.js draws in a thylakoid, the synthase is the same gold
 *  as in the mitochondrion, and the two photosystems are `photosynthesis`'s
 *  own. Neither file types one.
 *
 *  IT IS NOT THE PHYSICS, AND REFUSES TO BE. No pH, no proton-motive force,
 *  no light spectrum, no Calvin cycle: the gradient's arithmetic is
 *  membrane/membrane.js with `context:'thylakoid'`, one rung down, and what
 *  the ATP and NADPH are spent on is a pathway lesson. What this owns is
 *  the ARCHITECTURE. The one number shared with the membrane is the
 *  rotor's stoichiometry, read from membrane/chemiosmosis.js, so the two
 *  boxes cannot disagree about what an ATP costs.
 *
 *  THE PROTONS ARE COUNTED, NOT SIMULATED. A drawn proton stands for a
 *  great many; nothing here is a concentration and no page may print one.
 *
 *  THE CONTRACT (docs/AddingAComponent.md, docs/Components.md):
 *
 *      params   light 0..1 (live, glides) · uncoupler (live)
 *      state()  the ledger, the counts, and the sizes that are real
 *      events   frame · hover · pick · turn (one rotor revolution) ·
 *               oxygen (an O₂ released)
 *      parts    outer · inner · ims · stroma · granum · thylakoid · lamella ·
 *               lumen · psii · b6f · psi · synthase · starch · dna ·
 *               ribosome · proton · oxygen. LIBRARY is the teaching text. NOT ALL ARE
 *               MESHES: `ims`, `stroma` and `lumen` are spaces and
 *               `thylakoid` is one disc of a granum — they carry an anchor
 *               and a card and no show chip.
 *
 *  GLIDES: `light`. SNAPS: `uncoupler`, and every geometry parameter, which
 *  rebuilds — nothing tweens across a rebuild.
 *
 *  SCALE. One scene unit is 100 nm, the mitochondrion's unit, so the lens
 *  is 5 by 2.4 by 1.6 µm and `state()` may be printed. ONE MODEL: the
 *  grana are an authored layout, not a seed's. Membranes, the lumen, the
 *  stacking gap and the machines are not, and SCALE.exag says by how much.
 * ========================================================================== */
(function (global) {
  'use strict';

  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ONE SCENE UNIT IS 100 NM. The three half-axes and the four thicknesses
     are the whole of what this component claims about size, and the
     thicknesses are passed IN to the builder because they are what
     SCALE.exag is measured against. */
  const A = 25, B = 8, C = 12;         // half-axes: 5 µm long, 1.6 thick (the bowl's depth), 2.4 wide
  const UNIT = 1e-7;                   // metres per scene unit
  const NM = u => u * UNIT * 1e9;
  const TH = 0.14;                     // one membrane, drawn — envelope and thylakoid alike
  const LUM = 0.26;                    // the lumen inside a thylakoid, drawn
  const GAP = 0.16;                    // the stroma gap between two stacked discs, drawn
  const IMS = 0.25;                    // between the two envelope membranes, drawn
  /* Measured: a bilayer ~4 nm; a thylakoid lumen ~10 nm and the stromal
     gap in a stack ~3.5 nm (cryo-ET of spinach grana); the envelope gap
     10 to 20 nm. */
  const TRUE_NM = { membrane: 4, lumen: 10, gap: 3.5, ims: 15 };
  /* WATER SPLITTING: 2 H₂O → O₂ + 4 H⁺ + 4 e⁻, and two electrons make one
     NADPH. So one O₂ per four protons from water, and two NADPH per O₂. */
  const H_PER_O2 = 4, H_PER_NADPH = 2;

  const DEFAULTS = {
    light: 0.6,         // 0..1 how bright; 0 is dark and everything stops. Glides
    uncoupler: false,   // protons home without a synthase, and no ATP is made
    protons: 90,        // how many are drawn; a budget, not a concentration
    detail: 1,          // tessellation
  };

  /* Poses for the parts the home view cannot show close enough to name. */
  const VIEWS = {
    granum:    { theta: 0.55, phi: 1.00, r: 24 },
    thylakoid: { theta: 0.90, phi: 1.15, r: 14 },
    lamella:   { theta: 0.35, phi: 1.05, r: 18 },
    psii:      { theta: 0.80, phi: 1.20, r: 11 },
    b6f:       { theta: 0.40, phi: 1.15, r: 12 },
    psi:       { theta: -0.30, phi: 1.10, r: 12 },
    synthase:  { theta: 0.30, phi: 1.22, r: 11 },
    proton:    { theta: 0.45, phi: 1.00, r: 16 },
    oxygen:    { theta: 0.60, phi: 0.95, r: 22 },
  };

  const ORDER = ['outer', 'inner', 'ims', 'stroma', 'granum', 'thylakoid', 'lamella', 'lumen',
                 'psii', 'b6f', 'psi', 'synthase', 'starch', 'dna', 'ribosome', 'proton', 'oxygen'];
  const PLACES = ['ims', 'stroma', 'thylakoid', 'lumen'];   // an anchor and a card, no chip

  /* The component's own teaching text: a label and two sentences per part,
     in a tutor's voice. Real sizes belong here as prose about the real
     organelle. */
  const LIBRARY = {
    outer:     { text: 'outer envelope', offset: [46, -26], card: 'The outer of the two envelope membranes, and it leaks: channels hold it open to anything small. The double envelope is the leftover of a cyanobacterium and the vesicle that swallowed it, the same two membranes a mitochondrion has.' },
    inner:     { text: 'inner envelope', offset: [-48, 26], card: 'The inner envelope is the selective one, deciding what reaches the stroma. It carries no photosynthetic machinery at all: every photosystem and every ATP synthase is on the thylakoid, further in.' },
    ims:       { text: 'envelope space', offset: [-48, -28], card: 'The gap between the two envelope membranes, a few nanometres of near-cytosol. No gradient stands across it, because the outer membrane is a sieve.' },
    stroma:    { text: 'the stroma', offset: [-46, 22], card: 'The fluid the thylakoids sit in, and where the ATP and NADPH they make are spent fixing carbon in the Calvin cycle. Protons leave from here and come back through the synthase, so this is the alkaline side.' },
    granum:    { text: 'granum', offset: [44, -22], card: 'A stack of flattened thylakoid sacs, ten to a few dozen high and about half a micron across. Stacking packs far more light-catching membrane into the organelle than a single sheet could, and a shade leaf grows taller stacks.' },
    thylakoid: { text: 'thylakoid', offset: [46, 24], card: 'One sac of the stack: a single membrane folded flat around a thin lumen. Light drives protons into that lumen, so the sac is a tiny charged battery, and the membrane is where all of photosynthesis\'s light reactions happen.' },
    lamella:   { text: 'stroma lamella', offset: [44, 22], card: 'A sheet of the same membrane running from one granum to the next, so the whole thylakoid system is one continuous membrane around one lumen. That is why a gradient built in any stack drives ATP synthase everywhere in the organelle.' },
    lumen:     { text: 'thylakoid lumen', offset: [-46, -22], card: 'The space inside every sac, joined stack to stack through the lamellae. Protons collect in here from water splitting and from cytochrome b6f, and it drops to about pH 5 in full sun: this is the tank the synthase draws on.' },
    psii:      { text: 'photosystem II', offset: [-46, 24], card: 'The machine that splits water, tucked in the faces where one disc presses on the next. Its water-splitting bulk hangs into the lumen, so the protons from water land inside the sac, and the oxygen you breathe is its waste.' },
    b6f:       { text: 'cytochrome b6f', offset: [44, -20], card: 'The pump of the chain, drawn in the same indigo as the mitochondrion\'s. It takes electrons from PSII, hands them on toward PSI, and pushes protons from the stroma into the lumen as they pass.' },
    psi:       { text: 'photosystem I', offset: [46, -24], card: 'Lifts the electron a second time and hands it to NADP⁺ on the stroma side, taking a stroma proton with it to make NADPH. Only ever where the membrane is open to the stroma, because that stromal ridge has no room between stacked discs.' },
    synthase:  { text: 'ATP synthase', offset: [46, -20], card: 'Protons fall out of the lumen through this, and the rotor turns; the head hanging in the stroma makes one ATP per third of a turn. Its ring has fourteen subunits where a mitochondrion\'s has eight, so each ATP costs a chloroplast more protons.' },
    starch:    { text: 'starch grain', offset: [-44, 26], card: 'Where the day\'s sugar is parked: glucose the Calvin cycle made, polymerised into a grain right here in the stroma. It is broken down again at night and shipped out of the leaf as sucrose.' },
    dna:       { text: 'chloroplast DNA', offset: [-44, -20], card: 'Circles of the organelle\'s own genome, in many copies, bacterial in shape and inherited from one parent. The plainest evidence that a chloroplast was once a free-living cyanobacterium.' },
    ribosome:  { text: 'plastid ribosomes', offset: [46, 26], card: 'Ribosomes of the bacterial kind, not the cell\'s own. They build the core subunits of both photosystems and of Rubisco here, from the genome beside them.' },
    proton:    { text: 'protons', offset: [-46, 24], card: 'Into the lumen at b6f and from water at PSII; out of it only through ATP synthase. The whole payoff of the light reactions is in that round trip, which is why an uncoupler leaves the light making nothing but heat.' },
    oxygen:    { text: 'oxygen', offset: [44, 22], card: 'One O₂ for every two waters split, leaving the lumen and drifting out of the organelle. It is a by-product: photosynthesis keeps the hydrogens and throws the oxygen away.' },
  };

  /* ---- the model ----------------------------------------------------- */

  function create(THREE, root, camera, opts = {}) {
    if (!global.CellOrganelles) throw new Error('cell/chloroplast.js: load cell/organelles.js first');
    if (!global.CardStage) throw new Error('cell/chloroplast.js: load kit/card-stage.js first');
    const P = Object.assign({}, DEFAULTS, opts);
    const V3 = THREE.Vector3;
    const CHEM = global.Chemiosmosis;
    /* The rotor's stoichiometry is membrane/chemiosmosis.js's, so this box
       and a Membrane mounted beside it cannot disagree about what an ATP
       costs. The fallback is the thing that is wrong if they drift. */
    const PPT = CHEM ? CHEM.PROTONS_PER_TURN : 9;
    const APT = CHEM ? CHEM.ATP_PER_TURN : 3;

    const listeners = {};
    const on = (ev, fn) => { (listeners[ev] || (listeners[ev] = [])).push(fn);
      return () => { listeners[ev] = listeners[ev].filter(f => f !== fn); }; };
    const emit = (ev, ...args) => global.CardStage.fire(listeners[ev], args, ev);

    const model = new THREE.Group();
    root.add(model);
    const tw = global.CardStage.tweens();

    let K = null, group = null, D = null, protonMesh = null, protons = [], rand = null;
    let o2Mesh = null, o2 = [];
    let hovered = null, selected = null;
    const shown = {};
    let pumped = 0, fromWater = 0, through = 0, leaked = 0, rotorAngle = 0, turnsSeen = 0, o2Seen = 0;
    const PHO = (global.MolPalette || global.MolLib.PALETTE).photosynthesis;

    const rr = (a, b) => a + (b - a) * rand();
    const pickOne = arr => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
    const O2_POOL = 8;

    function build() {
      if (group) { model.remove(group); dispose(group); }
      K = global.CellOrganelles.kit(THREE, { seed: 2718 });   // one model: the jitter is fixed
      rand = K.rand;
      group = K.chloroplastDetail({ a: A, b: B, c: C, membrane: TH, lumen: LUM, gap: GAP, ims: IMS, open: 1, detail: P.detail });
      model.add(group);
      D = group.userData.detail;
      for (const name in D.groups) D.groups[name].userData.part = name;

      /* The protons: an InstancedMesh, the one thing on stage that moves
         every frame. Matte and barely lit from inside, so a bead this small
         reads as the library's pale steel H⁺ and not as a white highlight. */
      const pm = K.mat({ color: PHO.proton, roughness: 0.8, clearcoat: 0.1, emissive: PHO.proton, emissiveIntensity: 0.14 });
      protonMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.17, 8, 6), pm, P.protons);
      protonMesh.userData.part = 'proton';
      group.add(protonMesh);
      protons = [];
      for (let i = 0; i < P.protons; i++) {
        /* Most start in the lumen: a chloroplast in the light is not one
           with a flat gradient. */
        const inLumen = rand() < 0.6;
        protons.push({
          mode: inLumen ? 'lumen' : 'stroma',
          pos: (inLumen ? pickOne(D.pockets.lumen) : pickOne(D.pockets.stroma)).clone(),
          path: null, jump: -1, t: 0, dur: 0, wait: rr(0, 2.5), done: null,
        });
      }
      /* The oxygen: a pool of dumbbells, two spheres an instance each,
         scaled to nothing while unused. */
      const om = K.mat({ color: PHO.oxygen, roughness: 0.5, clearcoat: 0.3 });
      o2Mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 8, 6), om, O2_POOL * 2);
      o2Mesh.userData.part = 'oxygen';
      group.add(o2Mesh);
      o2 = [];
      for (let i = 0; i < O2_POOL; i++) o2.push({ on: false, pos: new V3(), path: null, t: 0, dur: 0 });
      pumped = fromWater = through = leaked = 0; rotorAngle = 0; turnsSeen = 0; o2Seen = 0;
      for (const n in shown) if (shown[n] === false) applyShow(n, false);
      writeProtons(); writeO2();
    }

    function dispose(g) {
      g.traverse(o => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
      });
    }

    /* ---- the round trip -------------------------------------------------
       A proton's life is: sit somewhere, pick a machine, travel to it, go
       through, sit on the other side. The route carries the claim — into
       the lumen at b6f or at PSII, out of it only at a synthase — so it is
       a path with waypoints rather than a force, and the ledger is the
       routes that finished.

       THE WATER ROUTE IS A JUMP. On the stroma side the proton walks to a
       PSI and is taken up making NADPH; the same instance reappears on the
       lumen side of a PSII, where water splitting released one. One
       segment of the path is instant, and `jump` says which. */
    const lumenNear = s => {
      const G = s.granum >= 0 ? D.grana[s.granum] : null;
      return (G && G.lumen.length ? pickOne(G.lumen) : pickOne(D.pockets.lumen)).clone();
    };
    function route(p) {
      const speed = 0.3 + 2.4 * P.light;
      p.jump = -1;
      if (p.mode === 'stroma') {
        if (rand() < 0.66 && D.sites.b6f.length) {
          const s = pickOne(D.sites.b6f);
          p.path = [p.pos.clone(), s.p.clone().addScaledVector(s.out, 0.9), s.p.clone().addScaledVector(s.out, 0.1), s.lumen.clone(), lumenNear(s)];
          p.dur = (1.5 + rr(0, 1.1)) / speed;
          p.done = () => { p.mode = 'lumen'; pumped++; };
        } else {
          const a = pickOne(D.sites.psi), s = pickOne(D.sites.psii);
          p.path = [p.pos.clone(), a.p.clone().addScaledVector(a.out, 0.9), a.p.clone().addScaledVector(a.out, 0.3),
                    s.lumen.clone(), lumenNear(s)];
          p.jump = 2;
          p.dur = (1.6 + rr(0, 1.0)) / speed;
          p.done = () => { p.mode = 'lumen'; fromWater++; if (fromWater % H_PER_O2 === 0) releaseO2(s); };
        }
      } else if (P.uncoupler && rand() < 0.8) {
        /* An uncoupler is a hole, not a machine: straight out of the sac
           into the stroma, no rotor, no ATP, the light all comes out as
           heat. */
        p.path = [p.pos.clone(), pickOne(D.pockets.stroma).clone()];
        p.dur = (0.9 + rr(0, 0.6)) / speed;
        p.done = () => { p.mode = 'stroma'; leaked++; };
      } else {
        const s = pickOne(D.sites.synthase);
        p.path = [p.pos.clone(), s.lumen.clone(), s.p.clone().addScaledVector(s.out, 0.1),
                  s.p.clone().addScaledVector(s.out, 0.9), pickOne(D.pockets.stroma).clone()];
        p.dur = (1.6 + rr(0, 1.2)) / speed;
        p.done = () => { p.mode = 'stroma'; through++; };
      }
      p.t = 0;
    }

    function stepProtons(dt) {
      for (const p of protons) {
        if (p.path) {
          p.t += dt;
          const u = clamp(p.t / p.dur, 0, 1);
          const n = p.path.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f));
          if (i === p.jump) p.pos.copy(p.path[i + 1]);
          else p.pos.copy(p.path[i]).lerp(p.path[i + 1], f - i);
          if (u >= 1) { p.path = null; p.done(); p.wait = 0.2 + rand() * 1.4; }
        } else {
          // A jitter, not a walk: it must not drift out of its compartment.
          p.pos.x += (rand() - 0.5) * 0.4 * dt * 8;
          p.pos.y += (rand() - 0.5) * 0.4 * dt * 8;
          p.pos.z += (rand() - 0.5) * 0.4 * dt * 8;
          p.wait -= dt * (0.35 + 2 * P.light);
          if (p.wait <= 0 && P.light > 0.005) route(p);
        }
      }
      writeProtons();
    }

    /* An O₂ leaves the sac where the water was split and drifts up out of
       the cut, which is the only exit on stage. */
    function releaseO2(site) {
      const o = o2.find(x => !x.on);
      if (!o) return;
      o.on = true;
      const start = site.lumen.clone();
      o.path = [start, start.clone().add(new V3(rr(-1, 1), 1.5, rr(-1, 1))), start.clone().add(new V3(rr(-3, 3), 6, rr(-3, 3)))];
      o.pos.copy(start); o.t = 0; o.dur = 4.5;
      o2Seen++;
      emit('oxygen', o2Seen);
    }
    function stepO2(dt) {
      for (const o of o2) {
        if (!o.on) continue;
        o.t += dt;
        const u = clamp(o.t / o.dur, 0, 1);
        const n = o.path.length - 1, f = u * n, i = Math.min(n - 1, Math.floor(f));
        o.pos.copy(o.path[i]).lerp(o.path[i + 1], f - i);
        if (u >= 1) o.on = false;
      }
      writeO2();
    }

    const _m4 = new THREE.Matrix4(), _s = new THREE.Vector3(), _q = new THREE.Quaternion();
    function writeProtons() {
      if (!protonMesh) return;
      protons.forEach((p, i) => { _m4.makeTranslation(p.pos.x, p.pos.y, p.pos.z); protonMesh.setMatrixAt(i, _m4); });
      protonMesh.instanceMatrix.needsUpdate = true;
    }
    function writeO2() {
      if (!o2Mesh) return;
      o2.forEach((o, i) => {
        const k = o.on ? 1 - 0.6 * clamp(o.t / o.dur - 0.6, 0, 1) / 0.4 : 0;   // fades as it clears the cut
        _s.setScalar(k);
        for (const [j, dx] of [[0, -0.13], [1, 0.13]]) {
          _m4.compose(new V3(o.pos.x + dx, o.pos.y, o.pos.z), _q, _s);
          o2Mesh.setMatrixAt(i * 2 + j, _m4);
        }
      });
      o2Mesh.instanceMatrix.needsUpdate = true;
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
    /* Nothing lightens under the pointer, for cell/mitochondrion.js's
       reason: a part here is most of the screen, and raising its emissive
       washes a membrane out. Hover and pick are reported; a page answers
       with a note. */

    /* The spaces and the single disc are places, not meshes: they carry an
       anchor and a card and no chip. */
    function applyShow(name, on) {
      if (name === 'proton') { if (protonMesh) protonMesh.visible = on; return; }
      if (name === 'oxygen') { if (o2Mesh) o2Mesh.visible = on; return; }
      const g = D.groups[name];
      if (g) g.visible = on;
    }

    /* ---- step ----------------------------------------------------------- */
    let last = null;
    function step(dt) {
      tw.update(dt);
      stepProtons(dt);
      stepO2(dt);
      /* PSII glows with the light: the one thing on stage that says how
         bright it is, since the photons themselves are not drawn. */
      const pm = group.userData.psiiMaterial;
      if (pm) { pm.emissive.copy(pm.color); pm.emissiveIntensity = 0.55 * P.light; }
      /* The rotor turns because protons went through it, not because time
         passed: PPT protons is one revolution. Chased rather than snapped. */
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
      /* The ledger is grouped AND flat: a page reads `state().atpMade` the
         way it reads the mitochondrion's, and `state().ledger.atpMade` the
         way the doc's phrase "the ledger" reads to a model. The first
         generated page reached for the second. */
      const ledger = { pumped, fromWater, throughSynthase: through, leaked,
                       rotorTurns: through / PPT, atpMade: LEDGER.atp(through, PPT, APT),
                       nadphMade: LEDGER.nadph(fromWater), o2Released: LEDGER.o2(fromWater) };
      return Object.assign({
        light: P.light, uncoupler: !!P.uncoupler,
        grana: d.grana, thylakoids: d.thylakoids, lamellae: d.lamellae,
        psii: d.psii, b6f: d.b6f, psi: d.psi, synthases: d.synthases,
        thylakoidsPerGranum: d.grana ? +(d.thylakoids / d.grana).toFixed(1) : 0,
        protons: { lumen, stroma: protons.length - lumen, total: protons.length },
        ledger,
        stoichiometry: { protonsPerTurn: PPT, atpPerTurn: APT, protonsPerATP: PPT / APT,
                         protonsPerO2: H_PER_O2, protonsPerNADPH: H_PER_NADPH },
        /* Real, because the lens is drawn to a unit: 1 scene unit is 100 nm.
           The thicknesses are drawn and SCALE.exag says by how much. */
        lengthNm: NM(2 * A), widthNm: NM(2 * C), thicknessNm: NM(2 * B),
        granumNm: NM(2 * d.granumRad),
        membraneNm: NM(d.th), lumenNm: NM(d.lumenT), gapNm: NM(d.gapT), envelopeGapNm: NM(d.gapE),
        hovered, selected, shown: Object.assign({}, shown),
      }, ledger);
    }

    function set(next = {}, o = {}) {
      let rebuild = false;
      for (const k of ['protons', 'detail'])
        if (next[k] !== undefined && next[k] !== P[k]) { P[k] = next[k]; rebuild = true; }
      if (next.uncoupler !== undefined) P.uncoupler = !!next.uncoupler;
      if (next.light !== undefined) {
        const to = clamp(next.light, 0, 1);
        tw.to(P.light, to, o.snap ? 0 : 0.7, v => { P.light = v; }, { key: 'light' });
      }
      if (rebuild) build();
      return api;
    }

    /* Anchors are functions, not points: the model turns and they turn with
       it. A space is anchored on a sampled point inside itself. */
    const w = v => (v ? model.localToWorld(v.clone()) : null);
    const pick = (arr, f) => (arr && arr.length ? arr[Math.floor(arr.length * f)] : null);
    const onLens = (ax, by, cz, dx, dy, dz) => { const d = new V3(dx, dy, dz).normalize(); return new V3(d.x * ax, d.y * by, d.z * cz); };
    const bigGranum = () => D.grana.reduce((m, G) => (G.n > m.n ? G : m), D.grana[0]);
    const anchors = {
      outer:     () => w(onLens(A, B, C, -0.8, -0.5, 0.45)),
      inner:     () => w(onLens(A - TH - IMS, B - TH - IMS, C - TH - IMS, 0.35, -0.08, 0.95)),
      ims:       () => w(D.pockets.ims[3]),
      stroma:    () => w(D.pockets.stroma[0]),
      granum:    () => { const G = pick(D.grana, 0.5); return G ? w(G.centre.clone().addScaledVector(G.up, G.rad * 0.85)) : null; },
      thylakoid: () => { const G = bigGranum(); return G ? w(G.discs[0].clone().addScaledVector(G.up, G.rad * 0.7)) : null; },
      lamella:   () => { const L = D.lamellae[0]; return L ? w(L.curve.getPoint(0.5)) : null; },
      lumen:     () => { const G = bigGranum(); return G && G.lumen.length ? w(G.lumen[0]) : null; },
      psii:      () => { const s = pick(D.sites.psii, 0.5); return s ? w(s.p) : null; },
      b6f:       () => { const s = pick(D.sites.b6f, 0.5); return s ? w(s.p) : null; },
      psi:       () => { const s = pick(D.sites.psi, 0.5); return s ? w(s.p) : null; },
      synthase:  () => { const s = pick(D.sites.synthase, 0.5); return s ? w(s.p) : null; },
      dna:       () => { const m = D.groups.dna.children[0];
                         if (!m) return null;
                         if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
                         return w(m.geometry.boundingSphere.center); },
      starch:    () => w(group.userData.starch[0]),
      ribosome:  () => w(D.pockets.stroma[7]),
      proton:    () => { const p = protons.find(x => x.mode === 'lumen'); return p ? w(p.pos) : null; },
      oxygen:    () => { const o = o2.find(x => x.on); return o ? w(o.pos) : null; },
    };
    /* Only the envelope's outside can turn away from the reader; everything
       else is in the cut the default camera is aimed into. */
    const faceOut = a => () => { const p = anchors[a](); return p ? p.clone().sub(model.getWorldPosition(new V3())).normalize() : null; };
    const facings = { outer: faceOut('outer') };

    const hex = v => '#' + (typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16)).toString(16).padStart(6, '0');
    const ORGP = (global.MolPalette || global.MolLib.PALETTE).organelles.chloroplast;
    const palette = () => [
      { name: 'envelope membranes', color: hex(ORGP.outer) },
      { name: 'the stroma', color: hex(ORGP.stroma) },
      { name: 'thylakoids, stacked', color: hex(ORGP.thylakoid) },
      { name: 'stroma lamellae', color: hex(ORGP.lamella) },
      { name: 'photosystem II', color: hex(PHO.psii) },
      { name: 'cytochrome b6f (the pump)', color: hex(PHO.b6f) },
      { name: 'photosystem I', color: hex(PHO.psi) },
      { name: 'ATP synthase', color: hex(PHO.synthase) },
      { name: 'protons', color: hex(PHO.proton) },
      { name: 'oxygen', color: hex(PHO.oxygen) },
      { name: 'starch', color: hex((global.MolPalette || global.MolLib.PALETTE).organelles.amyloplast.starch) },
      { name: 'chloroplast DNA', color: hex(ORGP.dna) },
    ];
    const layersOf = () => ORDER.filter(n => n === 'proton' || n === 'oxygen' || D.groups[n])
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

  /* The ledger's arithmetic, on its own so check-chloroplast.js can run it
     without three.js. */
  const LEDGER = {
    atp: (through, ppt, apt) => Math.floor((through / ppt) * apt),
    o2: fromWater => Math.floor(fromWater / H_PER_O2),
    nadph: fromWater => Math.floor(fromWater / H_PER_NADPH),
  };

  /* ---- the box -------------------------------------------------------- */

  const HOME = { theta: 0.5, phi: 0.95, r: 60 };

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('cell/chloroplast.js: load kit/card-stage.js first');
    let chl = null, last = null, nb = null;
    const box = global.CardStage.create({
      mount: el,
      /* Above and to the side, looking down into the cut: the stacks, the
         machines and the protons are all inside it. */
      cam: params.cam || HOME,
      stage: Object.assign({ phiMax: 2.6, rMin: 8, rMax: 170 }, params.stage || {}),
      step: dt => { if (chl) last = chl.step(dt); },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    /* Stage's studio lights ride the camera. The blue fill is warmed off:
       it reads as cold grey on green. Two low camera lights rake the
       inside of the bowl from either side, because every disc is seen
       edge-on and would otherwise fall to ambient. No shadow maps. */
    box.renderer.toneMapping = THREE.NoToneMapping;
    box.scene.traverse(o => {
      if (o.isAmbientLight) o.intensity = 0.48;
      else if (o.isDirectionalLight) { o.color.set(o.intensity > 0.6 ? 0xfff6e6 : 0xf3ecd8); o.intensity *= 0.85; }
    });
    for (const [x, y, z, i] of [[-4, 4, 3, 0.30], [4, -2, 3, 0.24]]) {
      const l = new THREE.DirectionalLight(0xffffff, i);
      l.position.set(x, y, z);
      box.camera.add(l, l.target);
    }

    chl = create(THREE, box.root, box.camera, params);

    const cv = box.canvas;
    const onMove = e => { const b = cv.getBoundingClientRect();
      chl.point(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); };
    const onLeave = () => chl.point(-2, -2);
    // A drag is not a click: an orbit ending over the background must not clear the selection.
    let downAt = null;
    const onDown = e => { downAt = [e.clientX, e.clientY]; };
    const onClick = e => {
      const moved = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4) return;
      const hit = chl.pick();
      chl.select(hit || null);
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('click', onClick);
    chl.on('hover', n => { cv.style.cursor = n ? 'pointer' : ''; });
    box.pump();
    nb = global.Notebook ? global.Notebook.create({ box, anchors: chl.anchors, facings: chl.facings, library: chl.library }) : null;

    return {
      sim: chl, box,
      views: () => VIEWS,
      lookAt(name, dur) { box.flyTo(VIEWS[name] || HOME, dur); return this; },
      home(dur) { box.flyTo(HOME, dur); return this; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      layers: chl.layersOf, show: (n, on) => { chl.show(n, on); if (!box.running) box.draw(); return this; }, palette: chl.palette,
      set(next, opts) { chl.set(next, opts); if (!box.running) box.draw(); return this; },
      state: () => last || chl.state(),
      on: chl.on,
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

  global.Chloroplast = { create, mount, DEFAULTS, VIEWS, ORDER, PLACES, LIBRARY, LEDGER, A, B, C, UNIT, H_PER_O2, H_PER_NADPH };
  /* Scale (kit/scale.js). MEASURED ALONG, DRAWN THICK: one scene unit is
     100 nm, so the lens's 5 by 2.4 µm is real and a page may print it. The
     four thin things are exaggerated, and their factors are computed from
     the numbers the builder was handed so they cannot drift from what is
     drawn. The machines are icons and their factors are typed. `down` is
     where a zoom hands off: the gradient's physics is Membrane's, one rung
     down, with context:'thylakoid'. */
  global.Chloroplast.SCALE = {
    rung: 'organelle', form: 'single', unit: UNIT, sceneUnits: [],
    exag: {
      membrane: +(NM(TH) / TRUE_NM.membrane).toFixed(1),
      lumen: +(NM(LUM) / TRUE_NM.lumen).toFixed(1),
      gap: +(NM(GAP) / TRUE_NM.gap).toFixed(1),
      ims: +(NM(IMS) / TRUE_NM.ims).toFixed(1),
      psii: 3, psi: 3, b6f: 3.5, synthase: 2.8, ribosome: 1.2, dna: 4, proton: 300, starch: 1,
    },
    down: { thylakoid: 'Membrane', granum: 'Membrane', lamella: 'Membrane', synthase: 'Membrane', b6f: 'Membrane', psii: 'Membrane', psi: 'Membrane' },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
