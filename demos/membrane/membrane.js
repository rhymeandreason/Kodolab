/* =============================================================================
 *  membrane/membrane.js — a membrane, its channels and pump, and what crosses
 * =============================================================================
 *  membrane-lab.html grew this inline: a bilayer with holes for its proteins,
 *  ions and small molecules random-walking either side of it, a K⁺ and a Cl⁻
 *  channel that admit by hydration and by charge, a leak that builds the
 *  voltage that stops it, and a Na⁺/K⁺ pump whose cargo is the same ions the
 *  rest of the page walks around. What a lesson step used to decide by name is
 *  a parameter here:
 *
 *      potential   'off'     the pores conduct forever at full drive
 *                  'fixed'   E_K and E_Cl are constants; the leak spends the
 *                            gradient it started with (the channel step)
 *                  'nernst'  equilibria off the live counts, so a pump
 *                            rebuilding the gradient moves the target (rest)
 *      pumpAuto    the pump re-arms itself (rest) or waits for spend() (pump)
 *      shells      hydration shells drawn and shed at the filter
 *
 *      Membrane.create(THREE, root, camera, opts)   the sim: root is yours
 *      Membrane.mount(el, params)                   one box, one handle
 *
 *  The sheet, the travellers and every rule that moves them are
 *  membrane/sheet.js; this file is the machines that make it a plasma
 *  membrane. It refuses the lesson: no captions, no buttons, no step.
 *  'cross' (t, dir) is a molecule through the bilayer, 'conduct' (t, dir) one
 *  through a pore, 'turn' and 'turned' the pump starting and finishing. An
 *  ATP chip flying from a DOM button is the page's, which calls spend().
 *
 *  Proteins are a LAYOUT, not a step:
 *      proteins: { K | CL | NA | AQP | pump: {x} | null }
 *  K, CL and NA are channels for their ion; AQP is an aquaporin, a pore for
 *  water and nothing charged, single file, direction by headcount alone.
 *
 *  THE PROTON CIRCUIT IS NOT HERE. A mitochondrion's inner membrane is
 *  ElectronTransport and a thylakoid is LightReactions, both on the same
 *  sheet.js; a `context`, a `fuel` or a `complex` handed to this component
 *  gets a warning naming them and a plasma membrane.
 *
 *  WHAT IS EXAGGERATED is declared where it is set (sheet.js's exag,
 *  mvPerIon); the physics comments travel with the code they explain.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = {
    pumpAuto: false,
    pumpOn: true,
    turnSeconds: 11,
  };
  const CIRCUIT_KEYS = ['complex', 'synthase', 'leak', 'translocase'];

  /* ---- the machines of a plasma membrane ---- */
  function transport(eng) {
    const { THREE, P, HALF, rnd, travellers, CHEM } = eng;
    const rgb = global.Parts;

    /* A K⁺ channel is a TETRAMER and a CLC chloride channel a DIMER: the lobe
       count is the subunit count. The channel gets a wide pore and the pump a
       snug site — a channel conducts millions a second BECAUSE its pore does
       not grip. Radii feed the hole and the solid-wall test, so retuning a
       lobe cannot leave either behind. */
    const K_R = 14.5, K_LOBE = 0.11, CL_R = 15.6, CL_LOBE = 0.17;
    const K_HOLE = K_R * (1 + K_LOBE) + 0.5, CL_HOLE = CL_R * (1 + CL_LOBE) + 0.5;
    const CHANNEL = rgb.transporter({ half:HALF, site:7.2, mouth:8.8, radius:K_R, lobes:4, lobeDepth:K_LOBE });
    const CLCHAN  = rgb.transporter({ half:HALF, site:7.2, mouth:8.0, radius:CL_R, lobes:2, lobeDepth:CL_LOBE, color:0xb58a4f });
    /* A Na⁺ LEAK: the epithelial sodium channel is a TRIMER, and it is what
       lets sodium in down its gradient, which is the whole reason the pump
       has work to do. Violet, the sodium family's colour. */
    const NA_R = 13.5, NA_LOBE = 0.12, NA_HOLE = NA_R * (1 + NA_LOBE) + 0.5;
    const NACHAN  = rgb.transporter({ half:HALF, site:7.0, mouth:8.4, radius:NA_R, lobes:3, lobeDepth:NA_LOBE, color:0x9b6fd8 });
    /* An AQUAPORIN: a TETRAMER whose pore passes water in single file and
       nothing charged. Slimmer than the ion channels; teal, so it reads as a
       different kind of door. */
    const AQP_R = 12.0, AQP_LOBE = 0.10, AQP_HOLE = AQP_R * (1 + AQP_LOBE) + 0.5;
    const AQP     = rgb.transporter({ half:HALF, site:6.4, mouth:8.4, radius:AQP_R, lobes:4, lobeDepth:AQP_LOBE, color:0x3fa7a0 });
    const PUMP    = rgb.transporter({ half:HALF, color:0x4f9e78 });
    eng.root.add(CHANNEL.group, CLCHAN.group, NACHAN.group, AQP.group, PUMP.group);
    let pumpX = 0;

    /* ---- the pump's cytoplasmic headpiece ----
       A P-TYPE ATPase IS MOSTLY NOT IN THE MEMBRANE. Ten transmembrane
       helices carry the ions, and hanging off them on the cytoplasmic side is
       a headpiece about as tall again, in three domains:

         N  nucleotide-binding — the ATP lands HERE, and it is the lobe that
            reaches furthest out into the cytosol
         P  phosphorylation — the aspartate that takes the phosphate, at the
            foot of the head where it meets the membrane
         A  actuator — takes the phosphate off again, on the other flank

       Drawn because the ATP had nowhere to dock: a token arriving at a bare
       barrel reads as landing on the membrane rather than on the protein. N
       sits proud and off-axis on purpose — that asymmetry is what makes the
       head read as a headpiece and not a second barrel. The lobes and their
       sizes are a schematic; what is honest is the arrangement, the
       proportion to the membrane part, and which lobe the nucleotide goes to.

       CLEAR OF THE BARREL, which reaches PUMP.height, and SMALLER THAN F1,
       which is a fact: the synthase's head is about 10 nm across and this one
       about 7, and a reader comparing them on one stage is comparing the real
       proteins. Measure it against circuit.js's rotor lobes. */
    const HEAD_N = { x: 6.2,  y: 39.0, r: 4.8 };
    const HEAD_P = { x: 0.4,  y: 34.0, r: 4.2 };
    const HEAD_A = { x: -6.0, y: 36.5, r: 3.5 };
    function buildPumpHead() {
      const g = new THREE.Group();
      const mat = () => rgb.flat(0x4f9e78);
      /* The stalk is the helices continuing out of the bilayer, so it starts
         inside it rather than at its face. */
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.2, 22, 12), mat());
      stalk.userData.baseY = HALF + 9; g.add(stalk);
      for (const [key, L] of [['N', HEAD_N], ['P', HEAD_P], ['A', HEAD_A]]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(L.r, 18, 13), mat());
        lobe.scale.set(1, 0.92, 0.92);
        lobe.position.x = L.x;
        lobe.userData.baseY = L.y;
        lobe.userData.domain = key;
        g.add(lobe);
      }
      return g;
    }
    const PUMPHEAD = buildPumpHead();
    PUMP.group.add(PUMPHEAD);

    /* ---- the pump's cargo is REAL IONS ----
       A spend recruits travellers out of the solution, so setting them down
       on the far side changes the counts and moves the voltage. parts.js's Pump owns
       the choreography; this only decides WHICH ions ride. */
    let pumpT = 0, running = false, atpSpent = 0, lastPhase = '', phase = null;
    const lastGates = { top: NaN, bottom: NaN };
    const cargo = { NA:[], K:[] };
    const PUMP_LOAD = { NA:-1, K:1 };
    function recruit(kind, n) {
      const side = PUMP_LOAD[kind];
      const pool = travellers.filter(t => t.kind === kind && !t.aboard && Math.sign(t.y) === side)
        .sort((a, b) => ((a.x - pumpX) ** 2 + a.y * a.y) - ((b.x - pumpX) ** 2 + b.y * b.y));
      if (pool.length < n) return [];   // all or nothing, or aboard ions strand
      const took = pool.slice(0, n);
      for (const t of took) t.aboard = true;
      return took;
    }
    function seatRider(t, c, i, n) {
      const rr = n > 1 ? eng.ionRadius(t.kind) * 1.15 : 0, th = (i / n) * Math.PI * 2;
      const tx = pumpX + Math.cos(th) * rr, tz = Math.sin(th) * rr, ty = c.u * eng.T.height, k = 0.16;
      t.x += (tx - t.x) * k; t.z += (tz - t.z) * k; t.y += (ty - t.y) * k;
      t.obj.position.set(t.x, t.y, t.z);
    }
    function deliver(kind) {
      const to = -PUMP_LOAD[kind];
      for (const t of cargo[kind]) {
        t.aboard = false;
        t.y = to * eng.T.height * 1.15; t.x = pumpX + rnd(-18, 18); t.z = rnd(-8, 8);
        t.obj.position.set(t.x, t.y, t.z);
        eng.repick(t); t.vy = Math.abs(t.vy) * to;
      }
      cargo[kind].length = 0;
    }
    /* Paid up front: a real pump phosphorylates itself at the START. */
    function startTurn() { pumpT = 0; running = true; lastPhase = ''; atpSpent++; eng.emit('turn', atpSpent); }
    function finishCycle() { eng.chargeOut += 1; eng.mV = Math.max(-95, P.mvPerIon * eng.chargeOut); }
    /* One press buys one turn. False if a turn is under way or nothing to carry. */
    function spend() {
      if (!P.proteins.pump || running) return false;
      cargo.NA = recruit('NA', 3);
      if (!cargo.NA.length) return false;
      startTurn();
      return true;
    }
    function runPumpCycle(dt) {
      if (!P.proteins.pump) return null;
      if (running) {
        pumpT += dt / P.turnSeconds;
        if (pumpT >= 1) { pumpT = 0; running = false; deliver('K'); finishCycle(); lastPhase = ''; eng.emit('turned', atpSpent); }
      }
      const st = global.Pump.at(pumpT);
      /* setGates rebuilds the lathe, which costs a frame's worth of time on
         its own; an idle pump asks for the same gates every frame. */
      if (st.gates.top !== lastGates.top || st.gates.bottom !== lastGates.bottom) {
        PUMP.setGates(st.gates.top, st.gates.bottom);
        lastGates.top = st.gates.top; lastGates.bottom = st.gates.bottom;
      }
      if (running && st.phase !== lastPhase) {
        if (st.phase === 'load-k') { deliver('NA'); cargo.K = recruit('K', 2); }
        lastPhase = st.phase;
      }
      const used = { NA:0, K:0 };
      const seats = st.cargo.reduce((a, c) => (a[c.species] = (a[c.species] || 0) + 1, a), {});
      for (const c of st.cargo) {
        const i = used[c.species]++, t = cargo[c.species][i];
        if (!t) continue;
        seatRider(t, c, i, seats[c.species]);
      }
      return st;
    }

    const at = eng.at;
    const H_ = () => eng.T.height;
    return {
      keys: { K:null, CL:null, NA:null, AQP:null, pump:null },
      parts: [CHANNEL, CLCHAN, NACHAN, AQP, PUMP],
      tOrder: [['pump', PUMP], ['K', CHANNEL], ['CL', CLCHAN], ['NA', NACHAN], ['AQP', AQP]],
      tFallback: PUMP,
      handles: { K:CHANNEL, CL:CLCHAN, pump:PUMP },
      layout(pr, holes, PORES) {
        CHANNEL.group.visible = !!pr.K;
        if (pr.K) { CHANNEL.group.position.x = pr.K.x; CHANNEL.setGates(1, 1);
          holes.push([pr.K.x, K_HOLE]); PORES.push({ x:pr.K.x, R:K_R, lumen:8.8, kind:'K' }); }
        CLCHAN.group.visible = !!pr.CL;
        if (pr.CL) { CLCHAN.group.position.x = pr.CL.x; CLCHAN.setGates(1, 1);
          holes.push([pr.CL.x, CL_HOLE]); PORES.push({ x:pr.CL.x, R:CL_R, lumen:8.0, kind:'CL' }); }
        NACHAN.group.visible = !!pr.NA;
        if (pr.NA) { NACHAN.group.position.x = pr.NA.x; NACHAN.setGates(1, 1);
          holes.push([pr.NA.x, NA_HOLE]); PORES.push({ x:pr.NA.x, R:NA_R, lumen:8.4, kind:'NA' }); }
        AQP.group.visible = !!pr.AQP;
        if (pr.AQP) { AQP.group.position.x = pr.AQP.x; AQP.setGates(1, 1);
          holes.push([pr.AQP.x, AQP_HOLE]); PORES.push({ x:pr.AQP.x, R:AQP_R, lumen:8.4, kind:'water' }); }
        PUMP.group.visible = !!pr.pump;
        if (pr.pump) { pumpX = pr.pump.x; PUMP.group.position.x = pumpX;
          /* MOUTH rather than site — the site is narrowest and would seat an ion in the wall. */
          holes.push([pumpX, 15.0]); PORES.push({ x:pumpX, R:14.5, lumen:7.6, kind:null }); }
      },
      /* The head hangs on the CYTOSOLIC side, the side the pump's ATP and its
         Na⁺ both come from. Positioned by sign: a negative scale would turn
         the lighting inside out. */
      orient(d) { for (const child of PUMPHEAD.children) child.position.y = -d * child.userData.baseY; },
      pre(dt) {
        if (P.proteins.pump && P.pumpAuto && P.pumpOn && !running && cargo.NA.length === 0) {
          const got = recruit('NA', 3);
          if (got.length) { cargo.NA = got; startTurn(); }
        }
        const st = runPumpCycle(dt);
        phase = st ? st.phase : null;
      },
      state: () => ({ atpSpent, pumpRunning:running, pumpPhase:phase, pumpT }),
      reset() { pumpT = 0; running = false; atpSpent = 0; lastPhase = ''; cargo.NA.length = 0; cargo.K.length = 0; },
      clear() { cargo.NA.length = 0; cargo.K.length = 0; },
      api: { spend },
      anchors: {
        'channel.K':  () => { const x = eng.poreX('K');  return x == null ? null : at(x, H_() * 0.95); },
        'channel.CL': () => { const x = eng.poreX('CL'); return x == null ? null : at(x, H_() * 0.95); },
        'channel.NA': () => { const x = eng.poreX('NA'); return x == null ? null : at(x, H_() * 0.95); },
        aquaporin:    () => { const x = eng.poreX('water'); return x == null ? null : at(x, H_() * 0.95); },
        pump:    () => P.proteins.pump ? at(pumpX, H_() * 0.98) : null,
        /* WHERE AN ATP BINDS THE PUMP, which is not the same place as "the
           pump". The nucleotide site is on the cytoplasmic headpiece: an ATP
           reaches this protein from INSIDE the cell, the side the Na⁺ it
           carries starts on. Aim a delivery here and not at `pump`, the top
           of the barrel, which an ATP would have to cross the membrane to reach. */
        'pump.atp': () => P.proteins.pump ? at(pumpX + HEAD_N.x, -CHEM.pumpDir(P.context) * HEAD_N.y) : null,
        'pump.head': () => P.proteins.pump ? at(pumpX + HEAD_P.x, -CHEM.pumpDir(P.context) * HEAD_P.y) : null,
        NA: () => eng.firstOf('NA'), K: () => eng.firstOf('K'), CL: () => eng.firstOf('CL'), A: () => eng.firstOf('A'),
      },
      library: {
        'channel.K':  { text: 'K⁺ channel', offset: [-40, -30],
          card: 'A water-lined pore straight through, so a K⁺ crosses without ever touching the oil. It is open, it is free, and nothing about it is switched on.' },
        'channel.CL': { text: 'Cl⁻ channel', offset: [40, -30],
          card: 'Chloride is high outside, so it runs inward, the opposite way to the K⁺ beside it. Direction is set by the gradient, never by the protein.' },
        'channel.NA': { text: 'Na⁺ leak channel', offset: [40, -30],
          card: 'Sodium is high outside, so it leaks in whenever a door is open. This is the door, and every ion through it is one the pump has to throw back out.' },
        aquaporin: { text: 'aquaporin', offset: [40, -30],
          card: 'A pore for water and nothing charged, in single file. Water still crosses the lipid on its own, slowly; this is why some cells move it fast.' },
        'pump.atp': { text: 'where the ATP binds', offset: [-44, 30],
          card: 'The N domain, the lobe reaching furthest into the cytosol. An ATP reaches this pump from inside the cell — the same side the Na⁺ it carries starts on — and the pump phosphorylates itself from it before it turns, on the P domain at the foot of the head. That is why the ATP a cell makes is ATP this pump can spend.' },
        /* A CALLOUT NAMES; THE CARD ARGUES. */
        'pump.head': { text: 'the cytoplasmic head', offset: [-46, 26],
          card: 'Most of this protein is not in the membrane. Ten helices carry the ions across; the head hanging into the cytosol is three domains — one binds the ATP, one takes the phosphate, one takes it off again — and that cycle of getting phosphorylated and unphosphorylated IS the shape change that moves the cargo.' },
        pump: { text: 'Na⁺/K⁺ pump', offset: [42, -30],
          card: 'A carrier, not a pore: it binds its cargo and changes shape, so it is never open to both sides at once. One ATP buys one turn — 3 Na⁺ out and 2 K⁺ in, both uphill — and that standing cost is most of what a resting cell spends.' },
        NA: { text: 'Na⁺, with its water', offset: [34, -26],
          card: 'Smaller than K⁺, and it still cannot use the K⁺ filter: it holds its water too tightly to trade the shell for the pore.' },
        K:  { text: 'K⁺', card: 'High inside, so it leaks out through its channel, and the pump carries it back. That standing cost is what a cell at rest is.' },
        CL: { text: 'Cl⁻', card: 'High outside, so it runs inward through its own channel, undressing only partly to fit.' },
        A:  { text: 'anion that cannot leave', offset: [34, 26],
          card: 'Protein side chains, phosphates and nucleic acids. They are why the inside is negative, and why it holds so much K⁺ without being positive.' },
      },
      proteinKey: {
        K:    { name: 'K⁺ channel', color: '#5b9bd5' },
        CL:   { name: 'Cl⁻ channel', color: '#b58a4f' },
        NA:   { name: 'Na⁺ leak channel', color: '#9b6fd8' },
        AQP:  { name: 'aquaporin', color: '#3fa7a0' },
        pump: { name: 'Na⁺/K⁺ pump', color: '#4f9e78' },
      },
      carries: { K:['K'], CL:['CL'], NA:['NA'], AQP:['water'], pump:['NA','K'] },
    };
  }

  let warnedCircuit = false;
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet || !global.Pump) throw new Error('membrane.js: load membrane/parts.js, membrane/chemiosmosis.js and membrane/sheet.js first');
    const usesCircuit = (opts.context && opts.context !== 'plasma') || opts.fuel ||
      (opts.proteins && CIRCUIT_KEYS.some(k => opts.proteins[k]));
    if (usesCircuit && !warnedCircuit) {
      warnedCircuit = true;
      console.warn('Membrane: a proton circuit is ElectronTransport (a mitochondrion) or LightReactions (a thylakoid); mount one of those. This is a plasma membrane.');
    }
    const P = Object.assign({ componentName: 'Membrane' }, global.Sheet.DEFAULTS, DEFAULTS, opts, { context: 'plasma' });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    P.proteins = Object.assign({}, opts.proteins || {});
    for (const k of CIRCUIT_KEYS) delete P.proteins[k];
    return global.Sheet.create(THREE, root, camera, P, [transport]);
  }

  function mount(el, params = {}) {
    return global.Sheet.mount(el, params, { name: 'membrane.js', create, signals: SIGNALS, api: ['spend', 'feed'] });
  }

  /* ---- SIGNALS: what is worth plotting, and over what range -----------------
     A component knows what its own numbers MEAN and what range they live in;
     a page does not. Two generated apps each typed their own y-maximum for the
     water count and both clipped the moment the particle count changed.
     `pick` returns a number, or side → number when `split` is set, and the
     graph labels the series with the CONTEXT's own names. `domain` is a
     function of the first reading, evaluated once and then frozen. */
  const { total, sides } = global.Sheet || { total: () => 0, sides: () => ({}) };
  const SIGNALS = {
    water:     { label: 'Free water', unit: 'molecules', split: true, pick: s => sides(s.counts.water), domain: s => [0, total(s.counts.water)] },
    sodium:    { label: 'Na⁺', unit: 'ions', split: true, pick: s => sides(s.counts.NA), domain: s => [0, total(s.counts.NA)] },
    potassium: { label: 'K⁺', unit: 'ions', split: true, pick: s => sides(s.counts.K), domain: s => [0, total(s.counts.K)] },
    /* The membrane potential is exaggerated (mvPerIon), so the range is the
       sim's, not a physiology textbook's. Signed: a voltage plotted 0-up
       reads as a magnitude. */
    voltage:   { label: 'Membrane potential', unit: 'mV', pick: s => s.mV, domain: () => [-100, 40] },
  };

  global.Membrane = { create, mount, DEFAULTS, SIGNALS, transport };
  /* Scale (kit/scale.js). The sheet is angstroms at MolLib.SCALE display
     units each; everything CROSSING is enlarged by exag, so only the
     comparison against the membrane is exaggerated. */
  global.Membrane.SCALE = {
    rung: 'membrane', form: 'bulk',
    unit: 1e-10 / (global.MolLib && global.MolLib.SCALE || 1.9),
    exag: { crossing: global.Sheet ? global.Sheet.DEFAULTS.exag : 5 },
    down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
