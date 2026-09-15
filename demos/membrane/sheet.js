/* =============================================================================
 *  membrane/sheet.js — a bilayer, what walks either side of it, and the doors
 * =============================================================================
 *  The engine two components stand on. Membrane is this sheet plus channels
 *  and the Na⁺/K⁺ pump; Chemiosmosis is this sheet plus the proton circuit.
 *  What they share is everything a molecule meets on its way across: the
 *  lipid with one hole per protein, the random walk, the funnel into a pore,
 *  the single-file hop, hydration shells, the membrane voltage, and the
 *  headcount a page prints. Neither component's physics lives here.
 *
 *      Sheet.create(THREE, root, camera, P, machines)   the sim
 *      Sheet.mount(el, params, spec)                    one box, one handle
 *
 *  A MACHINE is a factory `eng => plugin`. The engine calls, in frame order:
 *
 *      layout(pr, holes, pores)   place its proteins at pr[key].x (flat),
 *                                 push [x, holeRadius] and pore records
 *      orient(dir)                turn a head to the side it works on
 *      afterSheet(tint)           anything built against the new sheet
 *      pre(dt)                    before travellers move (a pump's cycle)
 *      post(dt)                   after they move (a rotor, a token)
 *      onConduct(t, dir)          one traveller out of a pore, before mV
 *      admits(t)                  true/false for a kind it rules, else undefined
 *      withContents(c)            default contents it cannot run without
 *      state(base) · reset() · clear() · set(next) · setCut(on)
 *      applyContext(library) · lid() · bandCap() · clearXs()
 *
 *  and reads: keys (protein name → null), parts (in-sheet Parts), cutParts,
 *  tOrder ([key, part] for the reference height), rules (kinds whose drive is
 *  not an E from the table), anchors, library, layers, proteinKey, carries,
 *  api (methods the handle carries). All optional.
 *
 *  A POROUS LAYER IS A LIST OF PORES, and `weight` on one is how often a
 *  traveller of that kind picks it over another of the same kind. That is
 *  the whole of an uncoupler's advantage, and it is declared by the machine
 *  that owns the hole, not decided here.
 *
 *  +y is outside and −y inside in every context; `context` renames the halves
 *  and tints the lipid (membrane/chemiosmosis.js owns the names), and a
 *  machine reads pumpDir() for anything with a direction in it.
 * ========================================================================== */
(function (global) {
  'use strict';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const ELEMENT_OF = { NA:'Na', K:'K', CL:'Cl', MG:'Mg', H:'H' };
  const OCTA = [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];

  const DEFAULTS = {
    half: 15.3,               // OPM's half-thickness, from the bake
    reach: 340,               // the sheet runs off both edges: visible ends are a raft
    exag: 5.0,                // one exaggeration for everything that crosses (see sizes)
    extent: 90,               // half-height of each compartment, in world units
    spread: null,             // ±x scatter; default reach * 0.55
    proteins: {},
    context: 'plasma',        // 'plasma' | 'mitochondrion' | 'thylakoid'
    mvFloor: null,            // how negative the inside may get; null takes it from the context
    /* WHICH HALF IS WHICH, on the stage, always. A compartment with no name on
       it is one the reader has to be told about in prose, and prose is where
       it goes wrong: a generated photosynthesis page called the lumen "inner"
       because the screen never said otherwise. mount() draws these. */
    sideLabels: true,
    potential: 'off',
    E: { K:-90, CL:-75, NA:60 },   // mV, the Nernst potentials of the gradients drawn
    mvPerIon: -2.5,           // stage timing, not a measurement (see netPush)
    /* HOW FAR THE TWO COMPARTMENTS RUN from this membrane, in world units:
       {up, down}, either omitted for "as far as the frame". A scene stacking
       several membranes gives each sim its own slice. A machine's lid is a
       cap of its own and the tighter wins. */
    bounds: null,
    timeScale: 1,             // sim seconds per real second
    shells: false,
    lipidMotion: true,
    /* THE SHEET IS BOWED, and it is the only thing on stage that says which
       side is which before a label does. `curve` is the sagitta in A at
       |x| = CURVE_SPAN. −y is the ENCLOSED compartment in every context — the
       cytoplasm, the matrix, the lumen — so the convex face is +y every time.
       A new context has to put its enclosed side at −y like the rest. What a
       context flips is the proton direction, not the curve. */
    curve: 9,
    /* THE BUDGET. Ion spacing is quadratic in the crowd; refused at add(), not
       clamped later, so the count a page reads is the count it has. */
    maxTravellers: 220,
    maxIons: 110,
    /* What is dissolved on each side, declaratively. set() reconciles by
       CURRENT side, so a water that crossed stays crossed. */
    contents: null,
    /* CONCENTRATION IN UNITS. units:'mM' turns millimolar into one drawn
       particle per `mMPerParticle`, water filling each side to
       `particlesPerSide`. Real water is 55 M; drawn to scale the salt would
       be one ion in a screen of water. */
    units: 'count',
    mMPerParticle: 20,
    particlesPerSide: 78,
  };

  function create(THREE, root, camera, P, factories) {
    if (!global.Parts || !global.Chemiosmosis) throw new Error('sheet.js: load membrane/parts.js and membrane/chemiosmosis.js first');
    const CHEM = global.Chemiosmosis;
    const HALF = P.half, MEM_REACH = P.reach;
    const CURVE_SPAN = 150;
    const BOW = P.curve > 0 ? (CURVE_SPAN * CURVE_SPAN + P.curve * P.curve) / (2 * P.curve) : 0;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, (P.componentName || 'Sheet') + ' ' + ev);

    /* THE PHYSICS STAYS FLAT. Every rule below is written on a straight
       membrane at y = 0, so the arc is a placement applied to the object and
       never to t.y: the sim thinks flat, the stage is curved, and the two
       agree because the mapping preserves the distance to the midsurface. */
    const _bend = new THREE.Vector3();
    let MEM = null;
    function seat(obj, x, y, z) {
      _bend.set(x, y, z || 0);
      const th = MEM ? MEM.bend(_bend) : 0;
      obj.position.copy(_bend);
      return th;
    }
    const SPREAD = () => P.spread == null ? MEM_REACH * 0.55 : P.spread;

    /* ---- sizes ----
       molecules.js builds at MolLib.SCALE (~1.9x angstroms) while parts.js
       works raw; dividing puts them in one frame. Then everything crossing is
       enlarged by EXAG, one multiplier for molecules, ions and badges
       together, so only the comparison against the MEMBRANE is exaggerated. */
    const SCALE = global.MolLib.SCALE || 1.9;
    const K_ = () => P.exag / SCALE;
    function ionRadius(kind) {
      const el = ELEMENT_OF[kind] || kind;
      const r = global.MolLib.PALETTE.radii[el];
      if (r == null) throw new Error('sheet.js: no palette radius for ' + el);
      return r * K_();
    }
    const kit = global.AtomKit.create(THREE);
    const pumpDir = () => CHEM.pumpDir(P.context);

    /* ---- what travels ---- */
    function chargedIon(kind) {
      const g = new THREE.Group();
      g.add(global.Parts.ion(kind, { radius: ionRadius(kind) }));
      const el = ELEMENT_OF[kind] || kind, k = K_();
      /* The badge is drawn at TWICE the matched size: at whole-membrane zoom
         the sign is all that separates K⁺ from Na⁺ from Cl⁻. */
      const b = kit.charge(kind === 'CL' ? '−' : '+', global.Parts.ionBadge(kind), el, k * 2);
      b.userData.base.multiplyScalar(k); b.userData.lift *= k;
      b.position.copy(b.userData.base);
      g.add(b); g.userData.badge = b;
      return g;
    }
    /* The impermeant anions: protein side chains, phosphates and nucleic
       acids that cannot leave, the reason the inside is negative at all. */
    function makeAnion() {
      const g = new THREE.Group();
      const r = ionRadius('CL') * 1.15;
      g.add(new THREE.Mesh(new THREE.SphereGeometry(r, 20, 14), global.Parts.flat(0x8f7fae)));
      const b = kit.charge('−', '#8f7fae', 'Cl', K_() * 2);
      b.userData.base.multiplyScalar(K_() * 1.6); b.userData.lift *= K_() * 1.6;
      b.position.copy(b.userData.base);
      g.add(b);
      return g;
    }
    function smallMolecule(name) {
      const spec = global.MolLib.MOLECULES[name];
      if (!spec) throw new Error('sheet.js: no spec named ' + name);
      const g = global.Stage.buildMolecule(spec, { center:true });
      g.scale.setScalar(K_());
      return g;
    }

    const travellers = [];
    let PORES = [], T = null, cut = false;
    let mV = 0, chargeOut = 0;
    const crossed = { K:0, CL:0, NA:0, water:0, H:0 };

    /* The engine handle a machine is built with. Getters, because MEM, T and
       the voltage are replaced as the sim runs. */
    const eng = {
      THREE, root, camera, P, CHEM, HALF, BOW, kit, emit, seat, rnd,
      K_, ionRadius, chargedIon, smallMolecule, travellers, crossed, pumpDir,
      get MEM() { return MEM; }, get T() { return T; }, get PORES() { return PORES; },
      get cut() { return cut; },
      get mV() { return mV; }, set mV(v) { mV = v; },
      get chargeOut() { return chargeOut; }, set chargeOut(v) { chargeOut = v; },
      clampMV: v => clampMV(v),
      add: (k, o) => add(k, o), scatter: (k, n, s, o) => scatter(k, n, s, o), remove: t => remove(t),
      repick: t => repick(t), sideCount: k => sideCount(k), poreX: k => poreX(k),
      bandTop: () => bandTop(), bandBottom: () => bandBottom(), farY: s => farY(s),
      relayout: () => layout(P.proteins), setCut: on => setCut(on),
      at: (x, y) => at(x, y), clearX: () => clearX(), state: () => state(), set: n => set(n),
    };
    const machines = factories.map(f => f(eng));
    const each = (name, ...a) => { for (const m of machines) if (m[name]) m[name](...a); };
    const PROTEIN_KEYS = Object.assign({}, ...machines.map(m => m.keys || {}));

    /* ---- the sheet with its holes ----
       Two machines closer than this share lipid and read as one lump. The
       layout keeps the order a page chose and spreads what is too close,
       symmetrically about where the crowd was. */
    const PORE_GAP = 72;
    function spaced(pr) {
      const on = Object.keys(pr).filter(k => pr[k]).map(k => ({ k, x: pr[k].x || 0 })).sort((a, b) => a.x - b.x);
      /* A machine may ask for a tighter row: four complexes of a split chain
         at the plasma membrane's spacing run off the frame. */
      const gap = Math.min(PORE_GAP, ...machines.map(m => m.poreGap ? m.poreGap() : PORE_GAP));
      for (let i = 1; i < on.length; i++) if (on[i].x - on[i - 1].x < gap) on[i].x = on[i - 1].x + gap;
      const mean0 = on.length ? on.reduce((s, o) => s + (pr[o.k].x || 0), 0) / on.length : 0;
      const mean1 = on.length ? on.reduce((s, o) => s + o.x, 0) / on.length : 0;
      const out = {};
      for (const o of on) out[o.k] = Object.assign({}, pr[o.k], { x: Math.round(o.x - mean1 + mean0) });
      return Object.assign({}, PROTEIN_KEYS, out);
    }
    let warnedKeys = false;
    function layout(proteins) {
      const given = Object.assign({}, PROTEIN_KEYS, proteins);
      each('expand', given);      // a machine may rewrite its own keys: one complex into four
      for (const k of Object.keys(given)) if (!(k in PROTEIN_KEYS)) {
        if (given[k] && !warnedKeys) { warnedKeys = true; console.warn(`${P.componentName || 'sheet.js'}: no protein named ${k}; have ${Object.keys(PROTEIN_KEYS).join(', ')}`); }
        delete given[k];
      }
      P.proteins = spaced(given);
      const pr = P.proteins;
      const holes = [];
      PORES = [];
      each('layout', pr, holes, PORES);
      each('orient', pumpDir());
      T = null;
      for (const m of machines) for (const [k, part] of (m.tOrder || [])) if (!T && pr[k]) T = part;
      if (!T) T = machines.map(m => m.tFallback).find(Boolean);
      if (MEM) root.remove(MEM.group);
      /* The bilayer is TINTED BY THE ORGANELLE it is standing in, out of
         palette.js, so the sheet a student meets after zooming into a cut
         cell is the colour that cell's organelle was. */
      const ctx = CHEM.CONTEXTS[P.context] || CHEM.CONTEXTS.plasma;
      const tint = global.MolLib.PALETTE.organelles[ctx.organelle] || global.MolLib.PALETTE.organelles.plasma;
      /* `exclude` is a signed distance, so holes union as the MINIMUM. */
      MEM = global.Parts.membrane({ half:HALF, reach:MEM_REACH, head:tint.head, tail:tint.tail, bowR:BOW,
        exclude: holes.length ? (x, z) => holes.reduce((m, h) => Math.min(m, Math.hypot(x - h[0], z) - h[1]), Infinity) : undefined });
      root.add(MEM.group);
      /* AFTER the sheet, because the arc belongs to it: a protein sits where
         the lipid it displaced would have, and turns with the surface. */
      for (const m of machines) for (const part of (m.parts || [])) {
        if (!part.group.visible) continue;
        part.group.rotation.z = -seat(part.group, part.group.position.x, 0, 0);
      }
      each('afterSheet', tint);
      setCut(cut);
      /* A pore named by kind is re-resolved against the new layout. */
      for (const t of travellers) if (t.conductsKind) t.conducts = poreX(t.conductsKind);
    }
    /* WEIGHTED, so a hole that is always open can be picked more often than a
       door that has to wait. Picked once per traveller. */
    function poreX(kind) {
      const doors = [];
      for (const q of PORES) if (q.kind === kind) for (let i = 0; i < (q.weight || 1); i++) doors.push(q);
      return doors.length ? doors[(Math.random() * doors.length) | 0].x : null;
    }
    /* Only with a protein in it: an uncut shape seals the ions inside the lumen. */
    function setCut(on) {
      cut = on;
      MEM.cut.enable(on && PORES.length > 0);
      each('setCut', on);
      for (const m of machines) for (const Q of (m.parts || []).concat(m.cutParts || [])) {
        Q.mesh.material.clippingPlanes = on ? [MEM.cut.plane] : [];
        Q.mesh.material.side = on ? THREE.DoubleSide : THREE.FrontSide;
        Q.mesh.material.needsUpdate = true;
      }
    }
    const lidded = () => machines.some(m => m.lid && m.lid());
    const bandTop = () => Math.min(...machines.map(m => m.bandCap ? m.bandCap() : Infinity),
                                   P.bounds && P.bounds.up != null ? P.bounds.up : Infinity, P.extent);
    const bandBottom = () => Math.min(P.bounds && P.bounds.down != null ? P.bounds.down : Infinity, P.extent);

    /* ---- hydration shells ----
       SIX waters in an octahedron, water-lab's facts: a cation's waters point
       O at the ion; an anion's point one O–H at it, so its shell sits a
       hydrogen further out. Rigid, parented to the ion. Not travellers, so
       the osmosis tally counts FREE water only. */
    const rO_ = () => global.MolLib.PALETTE.radii.O * K_();
    const shellDist = kind => (ionRadius(kind) + rO_()) * (kind === 'CL' ? 1.32 : 1.02);
    const bulkRadius = t => t.kind === 'A' ? ionRadius('CL') * 1.15
      : P.shells && t.obj.userData.shell && t.obj.userData.shell.length
      ? shellDist(t.kind) + rO_()
      : (ELEMENT_OF[t.kind] ? ionRadius(t.kind) : 3);
    const _wq = new THREE.Quaternion(), _wa = new THREE.Vector3(), _wb = new THREE.Vector3();
    function hydrate(group, kind) {
      const spec = global.MolLib.MOLECULES.water;
      const h1 = new THREE.Vector3(...spec.atoms[1].pos).normalize();
      const h2 = new THREE.Vector3(...spec.atoms[2].pos).normalize();
      const bis = h1.clone().add(h2).normalize();
      const d = shellDist(kind);
      const shell = [], badge = group.userData.badge;
      /* The charge badge stays on the ion, over the shell: screening is not
         cancelling. Enlarged ONCE, or growShell compounds it every lap. */
      if (badge && !badge.userData.enlarged) {
        badge.userData.enlarged = true; badge.material.depthTest = false;
        badge.position.copy(badge.userData.base); badge.scale.multiplyScalar(1.6);
      }
      for (const v of OCTA) {
        const w = global.Stage.buildMolecule(spec, { center:false });
        w.scale.setScalar(K_());
        const dir = _wa.set(v[0], v[1], v[2]).normalize();
        _wq.setFromUnitVectors(kind === 'CL' ? h1 : bis, _wb.copy(dir).multiplyScalar(kind === 'CL' ? -1 : 1));
        w.quaternion.copy(_wq);
        w.position.copy(dir).multiplyScalar(d);
        w.userData.seat = w.position.clone();
        w.visible = P.shells;
        group.add(w); shell.push(w);
      }
      group.userData.shell = shell;
      return group;
    }
    /* THE CHANNEL'S ACTUAL MECHANISM: a K⁺ filter's carbonyls sit where a
       water's O does in K⁺'s shell, so K⁺ trades water for filter. Na⁺'s
       tighter shell cannot be matched, so it keeps its coat and does not fit.
       Schematic — no carbonyl ring is drawn. Prop tier. */
    const shedding = [];
    const SHED_N = { K:6, CL:4 };          // most, not all: CLC strips chloride only partly
    function shedShell(t) {
      const shell = t.obj.userData.shell;
      if (!shell || !shell.length) return;
      const n = SHED_N[t.kind] != null ? SHED_N[t.kind] : shell.length;
      const going = shell.slice(0, n), staying = shell.slice(n);
      for (const w of going) {
        w.getWorldPosition(_wa); root.add(w); w.position.copy(_wa);
        const dir = _wb.copy(_wa).sub(t.obj.position).normalize();
        shedding.push({ obj:w, vx:dir.x * 9, vy:dir.y * 9 - 4, vz:dir.z * 9, life:1 });
      }
      t.obj.userData.shell = staying; t.shellOff = true;
    }
    function growShell(t) {
      for (const w of t.obj.userData.shell || []) t.obj.remove(w);
      hydrate(t.obj, t.kind);
      for (const w of t.obj.userData.shell) w.scale.setScalar(0.001);
      t.shellGrow = 0; t.shellOff = false;
    }
    function setShells(on) {
      P.shells = on;
      for (const t of travellers) { const s = t.obj.userData.shell; if (s) for (const w of s) w.visible = on; }
      /* Waters mid-flight are dropped, not hidden, or they pop back somewhere surprising. */
      if (!on) { for (const f of shedding) root.remove(f.obj); shedding.length = 0; }
    }
    function tickShells(dt) {
      for (let i = shedding.length - 1; i >= 0; i--) {
        const f = shedding[i];
        f.obj.position.x += f.vx * dt; f.obj.position.y += f.vy * dt; f.obj.position.z += f.vz * dt;
        f.life -= dt / 0.9;
        const k = Math.max(0, f.life);
        f.obj.scale.setScalar(K_() * k * k);
        if (f.life <= 0) { root.remove(f.obj); shedding.splice(i, 1); }
      }
      for (const t of travellers) {
        if (t.shellGrow == null || t.shellGrow >= 1) continue;
        t.shellGrow = Math.min(1, t.shellGrow + dt / 0.7);
        const k = t.shellGrow * t.shellGrow * (3 - 2 * t.shellGrow);
        for (const w of t.obj.userData.shell) w.scale.setScalar(K_() * k);
      }
    }
    const LAUNCH_GROW = 0.22;
    function tickBirth(dt) {
      for (const t of travellers) {
        if (t.born == null || t.born >= 1) continue;
        t.born = Math.min(1, t.born + dt / LAUNCH_GROW);
        const k = t.born * t.born * (3 - 2 * t.born);
        t.obj.scale.setScalar(t.bornScale * k);
      }
    }

    /* ---- travellers ----
       One pool. Each carries where it is going and how fast and NOTHING
       else: a traveller does not know what scene it is in. */
    let nextId = 1;
    const WALK_SPEED = [14, 24], ION_SPEED = [8, 16], DRIFT_SPEED = [12, 18];
    const WATER_CORE = 1.0;
    const ION_GAP = 2 * global.Parts.ION.K.r * global.Parts.ION.exaggeration + 2.6;
    const CHANNEL_KEEPOUT = 26;
    let warnedBudget = false;
    function add(kind, opts = {}) {
      const ion = !!ELEMENT_OF[kind] || kind === 'A';
      const nIons = ion ? travellers.reduce((n, t) => n + (ELEMENT_OF[t.kind] || t.kind === 'A' ? 1 : 0), 0) : 0;
      if (travellers.length >= P.maxTravellers || (ion && nIons >= P.maxIons)) {
        if (!warnedBudget) { warnedBudget = true; console.warn(`${P.componentName || 'sheet.js'}: budget is ${P.maxTravellers} travellers and ${P.maxIons} ions; add() refused`); }
        return null;
      }
      const o = Object.assign({ x:0, z:0, y:0, vy:0, blocked:false }, opts);
      if (typeof o.conducts === 'string') { o.conductsKind = o.conducts; o.conducts = poreX(o.conducts); }
      const obj = kind === 'A' ? makeAnion()
        : (kind === 'NA' || kind === 'K' || kind === 'CL' || kind === 'H') ? chargedIon(kind) : smallMolecule(kind);
      if (o.shell) hydrate(obj, kind);
      obj.position.set(o.x, o.y, o.z);
      root.add(obj);
      const t = Object.assign({ kind, obj, id: nextId++ }, o);
      if (t.blocked) t.bounded = true;    // cannot cross, so must not leave and come back either
      t.spin = { x:rnd(-.9,.9), y:rnd(-.9,.9), z:rnd(-.9,.9) };
      t.flipEvery = rnd(0.55, 1.15); t.since = Math.random() * t.flipEvery;
      if (t.walk) repick(t);
      if (t.born != null) { t.bornScale = obj.scale.x; obj.scale.setScalar(0.001); }
      travellers.push(t);
      applyVis();
      return t;
    }
    /* The lid counts: a compartment with a lid over it is only as tall as
       that sheet, or things are scattered past it at birth. */
    const farY = (side) => (side > 0 ? bandTop() : bandBottom()) * 0.94;
    const inCompartment = side => side * rnd(HALF + 4, farY(side));
    /* Ions default to ion speed, water to walking; blocked unless the bilayer
       lets it through (a gas, or water). An ion with a pore of its kind on
       stage uses it. The anions sit deep in the cytosol, heavy and slow,
       because protein and phosphate are the bulk of the interior and not a
       layer lining the membrane. Anything can be overridden. */
    function scatter(kind, n, side, opts = {}) {
      const ion = !!ELEMENT_OF[kind] || kind === 'A';
      const out = [];
      for (let i = 0; i < n; i++) {
        const s = side === 0 ? (i % 2 ? 1 : -1) : side;
        const far = farY(s);
        const def = {
          x: opts.clear === false ? rnd(-SPREAD(), SPREAD()) : rndClear(SPREAD() * (opts.span || 1)),
          z: rnd(-11, 11), y: inCompartment(s),
          walk:true, bounded:true,
          speed: ion ? ION_SPEED : WALK_SPEED,
          blocked: ion, coreSpeed: kind === 'water' ? WATER_CORE : undefined,
          keepout: kind === 'water' ? CHANNEL_KEEPOUT : undefined,
          /* The proton stays BARE. It is really H₃O⁺ and a shell would be
             honest, but it is drawn as the smallest thing on stage and six
             waters round it would make it the biggest. */
          shell: ion && kind !== 'A' && kind !== 'H' && P.shells,
          conducts: kind !== 'A' && poreX(kind) != null ? kind : undefined,
        };
        if (kind === 'A') Object.assign(def, { speed:[2, 5], y: s * far * (0.42 + Math.random() * 0.5),
                                               yband: s < 0 ? [-far, -far * 0.38] : [far * 0.38, far] });
        const t = add(kind, Object.assign(def, opts));
        if (!t) break;
        out.push(t);
      }
      return out;
    }
    /* mM → counts, water filling the side. A water figure given in mM is
       ignored: the headcount is the model's, not the page's. */
    function toCounts(side) {
      if (!side) return side;
      const out = {};
      let solute = 0;
      for (const k in side) if (k !== 'water') { out[k] = Math.max(0, Math.round(side[k] / P.mMPerParticle)); solute += out[k]; }
      out.water = Math.max(0, P.particlesPerSide - solute);
      return out;
    }
    const withDefaults = c => machines.reduce((acc, m) => m.withContents ? m.withContents(acc) : acc, c);
    /* Reconcile the stage to `contents`, by current side. Removal takes the
       nearest to the membrane first, so what a student watched cross is the
       last thing to vanish. */
    function setContents(c) {
      if (P.units === 'mM' && c) c = { inside: toCounts(c.inside), outside: toCounts(c.outside) };
      c = withDefaults(c);
      P.contents = c;
      each('contentsSet', c);
      for (const [sideName, side] of [['inside', -1], ['outside', 1]]) {
        const want = (c && c[sideName]) || {};
        const kinds = new Set([...Object.keys(want),
          ...travellers.filter(t => Math.sign(t.y) === side).map(t => t.kind)]);
        for (const kind of kinds) {
          const n = want[kind] | 0;
          const have = travellers.filter(t => t.kind === kind && !t.aboard && Math.sign(t.y) === side)
            .sort((a, b) => Math.abs(b.y) - Math.abs(a.y));
          if (have.length > n) for (const t of have.slice(n)) remove(t);
          else if (have.length < n) scatter(kind, n - have.length, side);
        }
      }
    }
    function remove(t) {
      const i = travellers.indexOf(t);
      if (i < 0) return;
      root.remove(t.obj); travellers.splice(i, 1);
    }
    function clear() {
      for (const t of travellers) root.remove(t.obj);
      travellers.length = 0;
      for (const f of shedding) root.remove(f.obj);
      shedding.length = 0;
      each('clear');
    }
    function rndClear(span) {
      for (let i = 0; i < 24; i++) {
        const x = rnd(-span, span);
        if (PORES.every(Q => Math.abs(x - Q.x) >= CHANNEL_KEEPOUT)) return x;
      }
      const edge = PORES.reduce((m, Q) => Math.max(m, Math.abs(Q.x)), 0) + CHANNEL_KEEPOUT;
      const x = rnd(Math.min(edge, span * 0.9), span);
      return Math.random() < .5 ? -x : x;
    }
    function repick(t) {
      const sp = t.speed || WALK_SPEED, v = rnd(sp[0], sp[1]);
      const cz = rnd(-1, 1), sr = Math.sqrt(1 - cz * cz), ph = rnd(0, Math.PI * 2);
      t.vy = v * cz; t.vx = v * sr * Math.cos(ph); t.vz = v * sr * Math.sin(ph);
    }

    /* ---- getting INTO a pore ----
       Nothing queues in solution: an ion is an ordinary walker until it
       wanders within reach of its own pore's mouth. THE MOUTH PULLS, or blind
       diffusion never finds a target a few Ångström across; a vestibule lined
       with acidic residues IS an electrostatic well, only the strength is
       staged. `seeks` is attracted to the nearest channel, `conducts` admitted
       by one. */
    const SEEK_PULL = 0.7, FUNNEL_R = 170, FUNNEL_PULL = 16, ESCAPE_R = 78, CAPTURE_R = 13;
    const _fv = new THREE.Vector3();
    const nearestChannel = t => {
      let best = null;
      for (const Q of PORES) if (Q.kind && (best == null || Math.abs(t.x - Q.x) < Math.abs(t.x - best))) best = Q.x;
      return best;
    };
    function funnel(t, dt) {
      if (t.exitPt) {
        if (Math.hypot(t.x - t.exitPt.x, t.y - t.exitPt.y, t.z - t.exitPt.z) < ESCAPE_R) return;
        t.exitPt = null;
      }
      if (!mayEnter(t)) return;
      const target = t.conducts != null ? t.conducts : t.seeks ? nearestChannel(t) : null;
      if (t.lane == null && target != null) {
        const side = Math.sign(t.y) || 1;
        _fv.set(target - t.x, side * T.height * 0.85 - t.y, -t.z);
        const d = _fv.length();
        if (d > 0.001 && d < FUNNEL_R) {
          _fv.multiplyScalar(1 / d);
          /* Water is drawn to its pore gently: an aquaporin's vestibule is
             not an electrostatic well, and pulled like an ion every water
             on stage queues at one door. */
          const k = FUNNEL_PULL * (t.seeks ? SEEK_PULL : t.kind === 'water' ? 0.35 : 1) * (1 - d / FUNNEL_R) * dt;
          t.vx += _fv.x * k; t.vy += _fv.y * k; t.vz += _fv.z * k;
          const sp = (t.speed || WALK_SPEED)[1], v = Math.hypot(t.vx, t.vy, t.vz);
          if (v > sp) { const s = sp / v; t.vx *= s; t.vy *= s; t.vz *= s; }
        }
      }
    }
    /* ONLY THE CROWDED SIDE MAY SEND with the potential off: this model
       suppresses the return rate, so without the rule one side ends up with
       everything. Net flow halts at equality on its own. */
    function sideCount(kind) {
      let inside = 0, outside = 0;
      for (const t of travellers) { if (t.kind !== kind) continue; if (t.y >= 0) outside++; else inside++; }
      return { inside, outside };
    }
    function crowdedSide(kind) {
      const c = sideCount(kind);
      if (Math.abs(c.outside - c.inside) <= 1) return 0;
      return c.outside > c.inside ? 1 : -1;
    }
    const potentialOn = () => P.potential !== 'off';
    const ruled = new Set([].concat(...machines.map(m => m.rules || [])));
    function mayEnter(t) {
      if (t.seeks) return true;
      if (t.kind === 'water') return Math.sign(t.y) === crowdedSide('water');   // osmosis: the crowded side sends, always
      for (const m of machines) if (m.admits) { const r = m.admits(t); if (r !== undefined) return r; }
      return potentialOn() || Math.sign(t.y) === crowdedSide(t.kind);
    }
    function refuseAt(t, lane) {
      const away = Math.sign(t.y) || 1, sp = (t.speed || WALK_SPEED)[1];
      t.exitPt = { x:t.x, y:t.y, z:t.z };
      t.vy = Math.abs(t.vy) * away + away * sp;
      t.vx = (t.x >= lane ? 1 : -1) * sp * 0.5;
    }
    function tryCapture(t) {
      if (t.lane != null) return false;
      if (t.conducts == null) {
        if (!t.seeks || t.exitPt) return false;
        const lane = nearestChannel(t);
        if (lane == null) return false;
        const ay = Math.abs(t.y);
        if (Math.abs(t.x - lane) > CAPTURE_R || Math.abs(t.z) > CAPTURE_R) return false;
        if (ay > T.height * 0.99 || ay < T.height * 0.7) return false;
        refuseAt(t, lane);
        return false;
      }
      if (t.exitPt) return false;
      const lane = t.conducts;
      if (Math.abs(t.x - lane) > CAPTURE_R || Math.abs(t.z) > CAPTURE_R) return false;
      const ay = Math.abs(t.y);
      if (ay > T.height * 0.99 || ay < T.height * 0.7) return false;
      if (!mayEnter(t)) return false;
      /* A pore takes one file, going one way. */
      const want = -Math.sign(t.y);
      const inLane = travellers.filter(o => o.lane === lane);
      if (inLane.some(o => Math.sign(o.vy) !== want)) return false;
      const gap = Math.max(ION_GAP, bulkRadius(t) * 2 + 1.2);
      if (inLane.some(o => Math.abs(o.y - t.y) < gap)) return false;
      t.lane = lane; t.x = lane; t.z = 0;
      t.vy = -Math.sign(t.y) * 11;
      t.obj.position.set(t.x, t.y, t.z);
      return true;
    }

    /* ---- the membrane potential ----
       The leak builds the thing that stops it. REAL: E_K, E_Cl. NOT REAL:
       mV per ion — a membrane needs millions of ions for 100 mV, so
       mvPerIon lands the effect in the seconds a student is watching. */
    function nernst(kind) {
      const c = sideCount(kind), z = kind === 'CL' ? -1 : 1;
      return (61 / z) * Math.log10((c.outside + 0.5) / (c.inside + 0.5));
    }
    const equilibriumOf = kind => P.potential === 'nernst' ? nernst(kind) : (P.E[kind] != null ? P.E[kind] : P.E.K);
    /* Signed, never clamped: negative means the voltage has overshot this
       ion's equilibrium and drives it back — the Goldman result, emerging.
       Positive means the CATION LEAVES (Cl⁻ flips it where it is used).
       Normalised by |E|, not −E: K⁺'s equilibrium is negative and Na⁺'s is
       positive. A kind a machine rules (H, down the pmf) has no E here. */
    const drive = kind => { if (!potentialOn() || kind === 'water' || ruled.has(kind)) return 0;
      const E = equilibriumOf(kind); return (mV - E) / Math.max(1, Math.abs(E)); };
    function netPush() {
      let nK = 0, nCl = 0;
      for (const t of travellers) { if (t.conducts == null) continue; if (t.kind === 'K') nK++; else if (t.kind === 'CL') nCl++; }
      const n = nK + nCl;
      return n ? (drive('K') * nK + drive('CL') * nCl) / n : 0;
    }
    /* How negative the inside is allowed to get. The plasma membrane's floor
       is its own ion equilibria; an organelle's is the inner membrane's
       measured Δψ, which is far past any of them. */
    const floorMV = () => P.mvFloor != null ? P.mvFloor
      : P.context !== 'plasma' ? CHEM.DPSI_FLOOR : Math.min(P.E.K, P.E.CL);
    /* mV is the inside relative to the outside, so filling the top drives it
       negative and filling the bottom drives it positive. The clamp turns
       with that, or a thylakoid's voltage sits pinned at zero. */
    const clampMV = v => { const f = floorMV();
      return pumpDir() > 0 ? Math.min(0, Math.max(f, v)) : Math.max(0, Math.min(-f, v)); };

    /* ---- conduction is a HOP, not a conveyor: knock-on, dwell then hop ---- */
    const HOP = { wait:[0.10, 0.30], move:0.10, crowd:0.06 };
    function tickQueue(t, dt) {
      if (Math.abs(t.y) > T.height) {
        if (t.inPore) {
          const q = t.kind === 'water' ? 0 : (t.kind === 'CL' ? -1 : 1) * Math.sign(t.y);
          chargeOut += q; crossed[t.kind] = (crossed[t.kind] || 0) + Math.sign(t.y);
          each('onConduct', t, Math.sign(t.y));
          if (q) mV = clampMV(P.mvPerIon * chargeOut);
          emit('conduct', t, Math.sign(t.y));
        }
        t.inPore = false; t.hop = null; t.lane = null;
        t.bounded = true;                 // it stays where it lands: a gradient runs out
        if (t.walk) {
          repick(t);
          const sp = (t.speed || WALK_SPEED)[1], away = Math.sign(t.y) || 1;
          t.vy = Math.abs(t.vy) * away + away * sp;
          t.exitPt = { x:t.x, y:t.y, z:t.z };
        }
        return false;
      }
      t.inPore = true;
      const push = drive(t.kind);
      if (!t.hop) t.hop = { wait: rnd(HOP.wait[0], HOP.wait[1]), t:0, moving:false };
      const h = t.hop;
      h.t += dt;
      if (!h.moving) {
        if (h.t < h.wait) { t.obj.position.y = t.y; return true; }
        const gap = Math.max(ION_GAP, bulkRadius(t) * 2 + 1.2);
        if (queueAhead(t) < gap) { t.obj.position.y = t.y; return true; }
        h.moving = true; h.t = 0;
        /* A RULED KIND'S DIRECTION WAS DECIDED AT THE DOOR and is not
           re-rolled every hop. A proton left in the coin-flip branch took
           drive 0, went either way with equal odds, and half came back out
           the side they entered: a rotor turning on traffic that never
           crossed. */
        if (!potentialOn() || t.kind === 'water' || ruled.has(t.kind)) h.dir = Math.sign(t.vy);
        else {
          /* p(forward) = ½ + ½·push: net flux proportional to driving force. */
          const pref = (t.kind === 'CL' ? -1 : 1) * (push >= 0 ? 1 : -1);
          const p = 0.5 + 0.5 * Math.min(1, Math.abs(push));
          h.dir = Math.random() < p ? pref : -pref;
        }
      }
      const step = Math.max(ION_GAP, bulkRadius(t) * 2 + 1.2);
      t.y += (h.dir || Math.sign(t.vy)) * (step / HOP.move) * dt;
      if (h.t >= HOP.move) {
        h.moving = false; h.t = 0;
        const behind = queueBehind(t);
        h.wait = behind < step * 1.8 ? rnd(HOP.crowd * 0.6, HOP.crowd * 1.4) : rnd(HOP.wait[0], HOP.wait[1]);
      }
      t.obj.position.y = t.y;
      return true;
    }
    function queueAhead(t) {
      let best = Infinity;
      for (const o of travellers) { if (o === t || o.lane !== t.lane) continue;
        const d = (o.y - t.y) * Math.sign(t.vy); if (d > 0 && d < best) best = d; }
      return best;
    }
    function queueBehind(t) {
      let best = Infinity;
      for (const o of travellers) { if (o === t || o.lane !== t.lane) continue;
        const d = (t.y - o.y) * Math.sign(t.vy); if (d > 0 && d < best) best = d; }
      return best;
    }

    function lateral(t, dt) {
      const x0 = t.band ? t.band[0] : -SPREAD(), x1 = t.band ? t.band[1] : SPREAD();
      t.x += t.vx * dt; t.z += t.vz * dt;
      if (t.x > x1) { t.x = x1; t.vx = -t.vx; }
      if (t.x < x0) { t.x = x0; t.vx = -t.vx; }
      /* Kept out of every pore but its own: a water with an aquaporin to
         use is steered to it by the funnel and must not be shoved off. */
      /* ONLY BESIDE THE SHEET, AND NEVER WIDER THAN HALF THE GAP. Applied at
         every height with a fixed width, two pores closer than twice the
         keepout left no legal x between them, and every water in that
         stretch was shoved onto one line: a column of water the height of
         the frame. Eased out rather than moved, so a water arriving at the
         membrane over a pore drifts aside instead of jumping. */
      const others = t.conducts == null ? PORES : PORES.filter(Q => Q.x !== t.conducts);
      if (t.keepout && others.length && Math.abs(t.y) < T.height + 10) {
        let near = others[0].x;
        for (const Q of others) if (Math.abs(t.x - Q.x) < Math.abs(t.x - near)) near = Q.x;
        const s = Math.sign(t.x - near || 1);
        let room = Infinity;
        for (const Q of PORES) if (Q.x !== near && Math.sign(Q.x - near) === s) room = Math.min(room, Math.abs(Q.x - near));
        const k = Math.min(t.keepout, room / 2), d = Math.abs(t.x - near);
        if (d < k) {
          t.x += s * Math.min(k - d, 40 * dt);
          if (Math.sign(t.vx) !== s) t.vx = -t.vx;
        }
      }
      if (t.z >  11) { t.z =  11; t.vz = -t.vz; }
      if (t.z < -11) { t.z = -11; t.vz = -t.vz; }
      t.obj.position.x = t.x; t.obj.position.z = t.z;
    }
    function tumble(t, dt) {
      t.obj.rotation.x += dt * t.spin.x; t.obj.rotation.y += dt * t.spin.y; t.obj.rotation.z += dt * t.spin.z;
    }

    /* ---- the proteins are solid: an annulus, open down the middle ----
       The barrel is domed, parts.js's own profile copied because the page
       cannot ask the mesh. */
    function poreRadiusAt(Q, y) {
      const H = T.height, u = Math.abs(y) / H, cap = 0.30;
      let sc = 1;
      if (u > 1 - cap) { const k = (u - (1 - cap)) / cap; sc = Math.sqrt(Math.max(0, 1 - k * k)); }
      const waist = 1 - 0.07 * Math.exp(-((y / (HALF * 0.8)) ** 2));
      return Q.R * sc * waist;
    }
    function keepOutOfPores(t) {
      if (t.lane != null || t.aboard) return;
      const rad = bulkRadius(t);
      if (Math.abs(t.y) >= T.height + rad) return;
      for (const Q of PORES) {
        const dx = t.x - Q.x, dz = t.z, r = Math.hypot(dx, dz);
        const wall = poreRadiusAt(Q, t.y) + rad;
        if (r >= wall) continue;
        if (r <= Q.lumen + rad && t.conducts === Q.x && Math.abs(t.y) > T.height * 0.6) continue;
        const push = r > 0.001 ? wall / r : 1;
        t.x = Q.x + dx * push; t.z = dz * push;
        if (r <= 0.001) t.x = Q.x + wall;
        t.obj.position.x = t.x; t.obj.position.z = t.z;
        t.vx = Math.abs(t.vx) * Math.sign(t.x - Q.x || 1);
      }
    }
    const atMouth = t => t.conducts != null && Math.hypot(t.x - t.conducts, t.z) < CAPTURE_R * 2 && Math.abs(t.y) < T.height * 1.4;
    /* Hydrated ions do not interpenetrate: a spacing rule, not a force.
       BUCKETED, because all pairs is quadratic in the crowd. The cell is the
       widest thing that can collide, a hydrated chloride, so only the 27
       neighbouring cells can hold a partner. Rebuilt per pass: a push moves
       an ion, and the second pass must see where it went. */
    const CELL = 2 * (shellDist('CL') + rO_()) + 1;
    const _grid = new Map();
    const _key = (x, y, z) => ((x + 512) << 20) ^ ((y + 512) << 10) ^ (z + 512);
    function keepClear(list) {
      for (let pass = 0; pass < 2; pass++) {
        _grid.clear();
        for (const t of list) {
          const k = _key(Math.floor(t.obj.position.x / CELL), Math.floor(t.y / CELL), Math.floor(t.obj.position.z / CELL));
          const b = _grid.get(k); if (b) b.push(t); else _grid.set(k, [t]);
        }
        for (const a of list) {
          if (atMouth(a)) continue;
          const cx = Math.floor(a.obj.position.x / CELL), cy = Math.floor(a.y / CELL), cz = Math.floor(a.obj.position.z / CELL);
          for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
            const bucket = _grid.get(_key(cx + dx, cy + dy, cz + dz));
            if (!bucket) continue;
            for (const b of bucket) {
              if (b === a || b.id <= a.id) continue;      // each pair once
              if (atMouth(b)) continue;
              pushApart(a, b);
            }
          }
        }
      }
    }
    function pushApart(a, b) {
      const min = bulkRadius(a) + bulkRadius(b);
      let dx = b.obj.position.x - a.obj.position.x, dy = b.y - a.y, dz = b.obj.position.z - a.obj.position.z;
      const d2 = dx*dx + dy*dy + dz*dz;
      if (d2 >= min * min || d2 < 1e-6) return;
      /* A QUEUED ION IS NOT SHOVED OFF ITS LANE — sideways is the wall. The
         free partner takes the whole correction, two free ions split it,
         and two queued ones are left to the file's waiting rule. */
      const aFree = a.lane == null, bFree = b.lane == null;
      if (!aFree && !bFree) return;
      const share = (aFree && bFree) ? 0.5 : 1;
      const d = Math.sqrt(d2), push = (min - d) * share / d;
      dx *= push; dy *= push; dz *= push;
      if (aFree) { a.x -= dx; a.y -= dy; a.z -= dz; a.obj.position.set(a.x, a.y, a.z); }
      if (bFree) { b.x += dx; b.y += dy; b.z += dz; b.obj.position.set(b.x, b.y, b.z); }
    }

    /* Where a traveller is allowed to be. The bilayer's interior is oily: a
       charged or strongly polar thing does not enter it. */
    function advance(t, dt) {
      if (t.conducts != null || t.seeks) { funnel(t, dt); tryCapture(t); }
      if (t.lane != null && tickQueue(t, dt)) return;
      const inCore = Math.abs(t.y) < HALF;
      if (t.blocked) {
        const edge = HALF + 2.4;
        if ((t.vy < 0 && t.y <= edge && t.y > 0) || (t.vy > 0 && t.y >= -edge && t.y < 0)) {
          t.vy = -t.vy;
          if (t.walkOnBounce) {
            t.walkOnBounce = false; t.walk = true; t.since = 0;
            repick(t); t.vy = Math.abs(t.vy) * Math.sign(t.y);
          }
        }
      }
      if (t.walk && !inCore) {
        t.since = (t.since || 0) + dt;
        if (t.since > t.flipEvery) { t.since = 0; t.flipEvery = rnd(0.55, 1.15); repick(t); }
      }
      if (t.walk) lateral(t, dt);
      t.y += t.vy * dt * (inCore && !t.blocked ? t.coreSpeed || 1 : 1);
      if (t.bounded) {
        const lo = t.yband ? t.yband[0] : -bandBottom(), hi = t.yband ? t.yband[1] : bandTop();
        if (t.y > hi) { t.y = hi; t.vy = -Math.abs(t.vy); }
        if (t.y < lo) { t.y = lo; t.vy =  Math.abs(t.vy); }
        t.obj.position.y = t.y; tumble(t, dt);
        return;
      }
      if (t.slowFrom != null && Math.sign(t.y) !== t.slowFrom) {
        t.slowFrom = null; t.vy = Math.sign(t.vy) * rnd(DRIFT_SPEED[0], DRIFT_SPEED[1]);
      }
      if (t.exits && Math.abs(t.y) > P.extent) { t.gone = true; return; }
      if (t.y >  P.extent) t.y = -P.extent;
      if (t.y < -P.extent) t.y =  P.extent;
      t.obj.position.y = t.y; tumble(t, dt);
    }

    /* ---- one frame, in one order ----
       machines' pre → advance → keepClear → keepOutOfPores → shells →
       machines' post → arc → sweep. Wall exclusion runs after keepClear
       because whatever moves a traveller last decides where it is. */
    let crossings = { up:0, down:0 }, netRecent = 0;
    const NET_HALFLIFE = 30;
    let elapsed = 0;
    function step(dt) {
      kit.faceCamera(camera);
      if (P.lipidMotion) MEM.tick(dt);
      tickBirth(dt);
      each('pre', dt);
      for (const t of travellers) {
        if (t.aboard) continue;
        const was = t.y;
        advance(t, dt);
        if (!t.blocked) {
          if (was > 0 && t.y <= 0) { crossings.down++; netRecent -= 1; emit('cross', t, -1); }
          if (was < 0 && t.y >= 0) { crossings.up++;   netRecent += 1; emit('cross', t,  1); }
        }
      }
      netRecent *= Math.pow(0.5, dt / NET_HALFLIFE);
      keepClear(travellers.filter(t => (ELEMENT_OF[t.kind] || t.kind === 'A') && !t.aboard));
      for (const t of travellers) keepOutOfPores(t);
      if (P.shells && PORES.length) {
        const mouth = T.height * 0.9;
        for (const t of travellers) {
          if (t.lane == null && !t.shellOff) continue;
          if (!t.shellOff && Math.abs(t.y) < mouth) shedShell(t);
          else if (t.shellOff && Math.abs(t.y) > mouth) growShell(t);
        }
      }
      each('post', dt);
      tickShells(dt);
      /* LAST, and after everything that moved a traveller: the arc is the
         final word on where a thing is drawn. */
      if (BOW) for (const t of travellers) seat(t.obj, t.x, t.y, t.z);
      for (let i = travellers.length - 1; i >= 0; i--)
        if (travellers[i].gone) { root.remove(travellers[i].obj); travellers.splice(i, 1); }
      elapsed += dt;
      const s = state();
      emit('frame', s, dt);
      return s;
    }

    function state() {
      const counts = {};
      for (const t of travellers) {
        const c = counts[t.kind] || (counts[t.kind] = { inside:0, outside:0 });
        if (t.y >= 0) c.outside++; else c.inside++;
      }
      /* THE VERDICT A PAGE PRINTS, off the HEADCOUNT, not the traffic. At
         eighty molecules the observed crossings are noise for the first half
         minute; `crossings` and `netRecent` stay for a page that wants them. */
      const concentration = {};
      for (const k in counts) if (k !== 'water') concentration[k] = { inside: counts[k].inside * P.mMPerParticle, outside: counts[k].outside * P.mMPerParticle };
      const w = counts.water || { inside: 0, outside: 0 };
      const nW = w.inside + w.outside;
      const diff = w.inside - w.outside;
      const net = Math.abs(diff) <= Math.max(2, 0.08 * nW) ? 'balanced' : diff > 0 ? 'leaving' : 'entering';
      let s = { t:elapsed, counts, concentration, mMPerParticle: P.mMPerParticle, mV, chargeOut, crossed:Object.assign({}, crossed), layers: layers(),
        context: P.context,
        /* `pumpedInto` saves a page working out which half that is from the
           direction — the one thing about a context a caption most wants and
           most easily gets backwards. */
        sides: { beyond: null,
                 inside: CHEM.sideName(P.context, 'inside'), outside: CHEM.sideName(P.context, 'outside'),
                 pumpedInto: CHEM.sideName(P.context, pumpDir() > 0 ? 'outside' : 'inside') },
        crossings:Object.assign({}, crossings), netRecent, net, netPush:netPush(),
        equilibrium: { K:equilibriumOf('K'), CL:equilibriumOf('CL') } };
      for (const m of machines) if (m.state) Object.assign(s, m.state(s));
      return s;
    }
    function reset() {
      mV = 0; chargeOut = 0; for (const k in crossed) crossed[k] = 0;
      crossings = { up:0, down:0 }; netRecent = 0;
      each('reset');
      for (const t of travellers) t.aboard = false;
    }
    const OWN = { proteins:1, shells:1, cut:1, contents:1 };
    function set(next) {
      if (next.context != null && next.context !== P.context) {
        if (!CHEM.CONTEXTS[next.context]) console.warn(`${P.componentName || 'sheet.js'}: no context named ${next.context}; have ${Object.keys(CHEM.CONTEXTS).join(', ')}`);
        else { P.context = next.context; applyContext(); layout(P.proteins); }   // the lipid colour is baked into the sheet
      }
      for (const m of machines) if (m.set) m.set(next);
      if (next.proteins) layout(next.proteins);
      if (next.shells != null) setShells(next.shells);
      if (next.cut != null) setCut(next.cut);
      for (const k of Object.keys(next)) if (!(k in OWN) && k !== 'context') P[k] = next[k];   // units before contents, so a set carrying both reads right
      if (next.E) P.E = Object.assign({}, DEFAULTS.E, next.E);
      if (next.contents !== undefined) setContents(next.contents);
    }
    function on(ev, fn) {
      (listeners[ev] || (listeners[ev] = [])).push(fn);
      return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
    }

    /* ---- what can be shown or hidden, by name ----
       Hiding is visibility only: a hidden water still crosses and still
       counts, so a readout stays true with the crowd out of the way. */
    const eachOf = (kinds, fn) => { for (const t of travellers) if (kinds.includes(t.kind)) fn(t); };
    const vis = { water: true, ions: true, badges: true };
    function applyVis() {
      eachOf(['water', 'o2', 'co2'], t => { t.obj.visible = vis.water; });
      eachOf(['NA', 'K', 'CL', 'A'], t => { t.obj.visible = vis.ions; if (t.obj.userData.badge) t.obj.userData.badge.visible = vis.badges; });
    }
    const LAYERS = Object.assign({
      water:    { label: 'water',            get: () => vis.water,  set: v => { vis.water = v; applyVis(); } },
      ions:     { label: 'ions',             get: () => vis.ions,   set: v => { vis.ions = v; applyVis(); } },
      badges:   { label: 'charge signs',     get: () => vis.badges, set: v => { vis.badges = v; applyVis(); } },
      shells:   { label: 'hydration shells', get: () => P.shells,   set: v => setShells(v) },
      cut:      { label: 'proteins cut open',get: () => cut,        set: v => setCut(v) },
      membrane: { label: 'the bilayer',      get: () => MEM.group.visible, set: v => { MEM.group.visible = v; } },
    }, ...machines.map(m => m.layers || {}));
    const layers = () => Object.keys(LAYERS).map(k => ({ name: k, label: LAYERS[k].label, on: !!LAYERS[k].get() }));
    function show(name, on = true) {
      const L = LAYERS[name];
      if (!L) { console.warn(`${P.componentName || 'sheet.js'}: no layer named ${name}; have ${Object.keys(LAYERS).join(', ')}`); return; }
      L.set(!!on);
    }
    /* What the colours mean, for a legend a page did not have to write.
       ONLY WHAT IS ON STAGE. A generated photosynthesis page printed four
       channels beside a thylakoid holding none of them because it believed a
       fixed list. Travellers come off the current headcount, proteins off
       the current layout. */
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    const TRAVELLER_KEY = {
      water: () => ({ name: 'water', color: hex(global.MolLib.PALETTE.atoms.O) }),
      o2:    () => ({ name: 'O₂', color: hex(global.MolLib.PALETTE.atoms.O) }),
      co2:   () => ({ name: 'CO₂', color: hex(global.MolLib.PALETTE.atoms.C) }),
      NA:    () => ({ name: 'Na⁺', color: hex(global.Parts.ION.NA.color) }),
      K:     () => ({ name: 'K⁺',  color: hex(global.Parts.ION.K.color) }),
      CL:    () => ({ name: 'Cl⁻', color: hex(global.Parts.ION.CL.color) }),
      H:     () => ({ name: 'H⁺',  color: hex(global.Parts.ION.H.color) }),
      A:     () => ({ name: 'anion that cannot leave', color: '#8f7fae' }),
    };
    function palette() {
      const out = [], seen = new Set();
      const take = kind => {
        if (seen.has(kind) || !TRAVELLER_KEY[kind]) return;
        seen.add(kind); out.push(TRAVELLER_KEY[kind]());
      };
      for (const t of travellers) take(t.kind);
      for (const side of ['inside', 'outside'])
        if (P.contents && P.contents[side]) for (const k of Object.keys(P.contents[side])) take(k);
      /* WHAT A MACHINE CARRIES is knowable from the layout alone, and card-stage
         builds its legend at mount, before a page has set its contents. */
      for (const m of machines) for (const k of Object.keys(m.proteinKey || {})) if (P.proteins[k]) for (const kind of (m.carries || {})[k] || []) take(kind);
      for (const m of machines) for (const k of Object.keys(m.proteinKey || {})) if (P.proteins[k]) out.push(m.proteinKey[k]);
      return out;
    }

    /* ---- the parts a page can point at, by name (Notebook, in lib/annotate.js) ---- */
    const _a = new THREE.Vector3();
    /* The x furthest from every machine on stage: where a label can point at
       the solution itself. BETWEEN two machines, never outside them all —
       the widest gap is the open membrane past the last one, off the side of
       the frame. Ties go to the gap nearest the middle. */
    function clearX() {
      const xs = PORES.map(p => p.x).concat(...machines.map(m => m.clearXs ? m.clearXs() : []));
      if (!xs.length) return -SPREAD() * 0.06;
      xs.sort((a, b) => a - b);
      if (xs.length === 1) return xs[0] - 58;
      let best = null, bd = -1;
      for (let i = 1; i < xs.length; i++) {
        const mid = (xs[i - 1] + xs[i]) / 2, d = (xs[i] - xs[i - 1]) / 2;
        if (d > bd + 1e-6 || (Math.abs(d - bd) < 1e-6 && Math.abs(mid) < Math.abs(best))) { bd = d; best = mid; }
      }
      return best;
    }
    /* A callout points at a place on the stage, so it rides the arc too. */
    const at = (x, y) => { _a.set(x, y, 0); if (MEM) MEM.bend(_a); return _a; };
    eng.firstOf = kind => { const t = travellers.find(t => t.kind === kind && !t.aboard); return t ? t.obj.getWorldPosition(_a) : null; };
    const anchors = Object.assign({
      heads:   () => at(150, HALF),        // right of the proteins: a shell's panel covers the left
      tails:   () => at(150, 0),
      /* A COMPARTMENT'S CALLOUT MUST NOT LAND ON A MACHINE: mid-band
         vertically, and horizontally in the widest gap the layout leaves. */
      outside: () => at(clearX(), lidded() ? (HALF + bandTop()) / 2 : farY(1) * 0.34),
      inside:  () => at(clearX(), -farY(-1) * 0.34),
      water: () => eng.firstOf('water'),
    }, ...machines.map(m => m.anchors || {}));
    const library = Object.assign({
      heads: { text: 'hydrophilic heads', offset: [34, -30],
        card: 'The head carries charge and sits happily in water, so it turns outward on both faces. That is why a bilayer assembles itself and then holds together.' },
      tails: { text: 'hydrophobic tails', offset: [34, 26],
        card: 'The tails are hydrocarbon and will not mix with water, so they hide in the middle. Everything crossing this membrane has to get through that oil.' },
      outside: { text: 'outside the cell', offset: [-38, -26],
        card: 'Every solute particle sits where a water would have been, so fewer of the molecules here are water. More solute, less free water.' },
      inside:  { text: 'the cytosol', offset: [-38, 26],
        card: 'Mostly water, potassium, and the big anions that never leave. What is dissolved here is what the pump spends ATP to keep.' },
      water: { text: 'water', card: 'Small and uncharged enough to slip through the oil, slowly, in both directions. The net flow is a headcount, not a pull.' },
    }, ...machines.map(m => m.library || {}));
    /* The two compartments are named by the CONTEXT, so a card cannot say
       "the cytosol" about a matrix. Rewritten in place: the notebook holds
       this object. */
    function applyContext() {
      library.inside.text = CHEM.sideName(P.context, 'inside');
      library.outside.text = CHEM.sideName(P.context, 'outside');
      each('applyContext', library);
    }

    applyContext();
    layout(P.proteins);
    setShells(P.shells);
    if (withDefaults(P.contents)) setContents(P.contents);

    const out = { step, state, reset, set, on, anchors, library, layers, show, palette,
      add, scatter, remove, clear, travellers,
      params: () => P, pores: () => PORES.slice(),
      get height() { return T.height; },
      half: HALF, SPEED: { WALK:WALK_SPEED, ION:ION_SPEED }, KEEPOUT: CHANNEL_KEEPOUT,
      proteins: Object.assign({}, ...machines.map(m => m.handles || {})),
      get membrane() { return MEM; } };
    for (const m of machines) Object.assign(out, m.api || {});
    return out;
  }

  /* ---- which half is which ----
     Two labels down the stage's RIGHT edge, one mid-compartment, named the
     way the context does. Right because a lesson shell's step card covers
     the left; mid-compartment because the shell keeps its own chrome in the
     corners. DOM, not a mesh: they name a half of the screen rather than a
     thing in the scene, so they must not move with the camera. */
  let sideCss = false;
  function sideLabels(el, sim) {
    if (!sideCss) {
      sideCss = true;
      const st = document.createElement('style');
      st.textContent = `
.mem-side { position:absolute; right:16px; z-index:3; pointer-events:none;
  font-family:var(--font-display, inherit); font-size:var(--cap-sm, 11px);
  font-weight:var(--cap-weight, 600); letter-spacing:var(--cap-track, .12em);
  text-transform:uppercase; opacity:.6; white-space:nowrap;
  text-shadow:0 1px 10px rgba(255,255,255,.85); }
.mem-side.out { top:24%; }
.mem-side.in  { bottom:24%; }
/* Above a lid, when there is one: a third space, not the top of this one. */
.mem-side.beyond { top:7%; }`;
      document.head.appendChild(st);
    }
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const mk = cls => { const d = document.createElement('div'); d.className = 'mem-side ' + cls; el.appendChild(d); return d; };
    const out = mk('out'), inn = mk('in'), bey = mk('beyond');
    const paint = () => {
      const s = sim.state();
      if (out.textContent !== s.sides.outside) out.textContent = s.sides.outside;
      if (inn.textContent !== s.sides.inside) inn.textContent = s.sides.inside;
      bey.textContent = s.sides.beyond || '';
      bey.style.display = s.sides.beyond ? '' : 'none';
      out.style.top = s.sides.beyond ? '37%' : '';
    };
    paint();
    return { paint, destroy() { out.remove(); inn.remove(); bey.remove(); } };
  }

  /* ---- one box ----
     The compartments' extent is solved off the camera, so a molecule never
     blinks into existence in view. Adds no physics: `m.sim` and `m.box` are
     the layers under it. `spec` is { name, create, signals }. */
  function mount(el, params, spec) {
    if (!global.CardStage) throw new Error(spec.name + ': load kit/card-stage.js first');
    let sim = null, nb = null, last = null;
    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta:0, phi:Math.PI / 2 - 0.10, r:300 },
      stage: Object.assign({ orbit:false, rMin:50, rMax:600 }, params.stage || {}),
      step: dt => { if (sim) last = sim.step(dt * (sim.params().timeScale || 1)); },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
      onResize: () => { if (sim) sim.set({ extent: extentOf() }); },
    });
    box.renderer.localClippingEnabled = true;
    const extentOf = () => {
      const cam = box.camera;
      const halfH = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2) * box.cam.r;
      /* A VIEW OFFSET SLIDES THE FRAME OFF THE SCENE'S CENTRE, so the
         compartment grows by what it slid or its far edge walks into shot. */
      const fn = params.viewOffset || el.viewOffset;
      const off = fn ? fn(box.canvas.clientWidth, box.canvas.clientHeight) : null;
      const slide = off && off.y && box.canvas.clientHeight
        ? Math.abs(off.y) / box.canvas.clientHeight * 2 * halfH : 0;
      return halfH + slide + 26;
    };
    sim = spec.create(THREE, box.root, box.camera, Object.assign({ extent: extentOf() }, params));
    const sides = params.sideLabels === false ? null : sideLabels(el, sim);
    if (params.cut != null) sim.set({ cut: params.cut }); else sim.set({ cut: true });
    nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, library: sim.library }) : null;
    const handle = {
      sim, box,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      layers: sim.layers, show: (n, on) => { sim.show(n, on); if (!box.running) box.draw(); return handle; }, palette: sim.palette,
      set(next) { sim.set(next); if (sides) sides.paint(); return handle; },
      state: () => last || sim.state(),
      /* graph.js resolves a signal by name off the thing it is following. */
      signals: () => spec.signals,
      on: sim.on, add: sim.add, scatter: sim.scatter, clear: sim.clear, reset: sim.reset,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { if (sides) sides.destroy(); box.destroy(); },
    };
    for (const k of spec.api || []) if (sim[k]) handle[k] = sim[k];
    return handle;
  }

  const total = c => c ? (c.inside || 0) + (c.outside || 0) : 0;
  const sides = c => ({ inside: (c && c.inside) || 0, outside: (c && c.outside) || 0 });

  global.Sheet = { create, mount, DEFAULTS, total, sides };
})(typeof globalThis !== 'undefined' ? globalThis : this);
