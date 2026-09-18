/* =============================================================================
 *  chemiosmosis/light-reactions.js — photosynthesis's light reactions, as a component
 * =============================================================================
 *  A thylakoid membrane: light lifts electrons out of water at photosystem
 *  II, cytochrome b6f pumps protons into the lumen as they pass, photosystem
 *  I lifts them again and ferredoxin carries them to FNR, where NADP⁺ becomes
 *  NADPH, and ATP synthase spends the gradient into the stroma. The oxygen is
 *  the waste.
 *
 *      LightReactions.create(THREE, root, camera, opts)   the sim
 *      LightReactions.mount(el, params)                   one box, one handle
 *
 *  The plumbing is chemiosmosis/circuit.js, a Circuit.kit built inside
 *  `machine`; the arithmetic it runs on is membrane/chemiosmosis.js. What is
 *  here is the light reactions' own physics, and the top of the file holds
 *  it with no THREE so chemiosmosis/check-light-reactions.js can run it in
 *  node:
 *
 *      RING             the chloroplast synthase's c14 ring: 14 H⁺ per 3 ATP
 *      CHAIN            PSII, b6f, PSI: protons per pair, photons per pair, water's protons
 *      CALVIN           what the Calvin cycle spends, 3 ATP per 2 NADPH
 *      protonsPerPair() · photonsPerPair() · protonsPerO2() · photonsPerO2()
 *      protonsPerNADPH(f) · atpPerNADPH(f) · photonsPerNADPH(f) · cyclicToBalance()
 *                       walked off the table, never typed
 *
 *      proteins: { PSII | b6f | PSI | synthase | leak: {x} | null }
 *                 or complex: {x}, the chain's centre, spread into the three
 *
 *  THE WHOLE CHAIN, ALWAYS: PSII, b6f and PSI, plastoquinone in the
 *  membrane, plastocyanin in the lumen, ferredoxin and FNR in the stroma;
 *  PSII splits water into lumen protons and O₂, FNR makes NADPH, both fire
 *  on light.
 *
 *  WHAT A PHOTON DOES, drawn: it lands on the antenna (the green
 *  light-harvesting lobes flanking each photosystem's core), the excitation hops to the reaction
 *  centre, an electron is ejected, and something refills the hole: water at
 *  PSII, plastocyanin at PSI. That is the light reactions in one sentence,
 *  and every other beat follows from it.
 *
 *  WATER IS SPLIT FOUR ELECTRONS AT A TIME. The oxygen-evolving complex on
 *  PSII's lumen face stores one oxidizing equivalent per photon (the Kok
 *  cycle's S states) and at four takes them from two bound waters at once:
 *  one O₂, four H⁺ into the lumen. So the O₂ comes out in bursts, every two
 *  turns, and it leaves: nonpolar, it crosses the bilayer and drifts off
 *  through the stroma.
 *
 *  `fuel` is 'light' or null, and `fuelRate` is the dimmer. Light has no
 *  token: nothing arrives at PSII and nothing leaves it, which is correct
 *  rather than missing. `feed('light')` is one flash: PSII turns once, and
 *  PSI owes one turn whenever its plastocyanins arrive. `cyclic` is the
 *  share of PSI's turns whose ferredoxin carries the electrons back to
 *  plastoquinone instead of to FNR, the reason the ATP balances against the
 *  NADPH; `feed('light', { cyclic: true })` is one flash whose pair goes
 *  round once before it reaches NADP⁺.
 *
 *  THE THYLAKOID PUMPS DOWN. The lumen is the enclosed compartment, so it is
 *  the bottom half of the screen, and every direction in the kit is read off
 *  membrane/chemiosmosis.js's pumpDir for this context; nothing here is a
 *  mitochondrion with its labels swapped.
 *
 *  Events: `pumped`, `atp`, `atpOut`, `oxygen` (n O₂ released), `nadph` (n made),
 *  `cyclic` (n turns gone round again).
 * ========================================================================== */
(function (global) {
  'use strict';
  const CHEM = global.Chemiosmosis;
  if (!CHEM) throw new Error('light-reactions.js: load membrane/chemiosmosis.js first');

  /* ---- the arithmetic, free of THREE ----
     THE RING. A chloroplast's synthase turns on a c14 ring (spinach, PDB
     6FKF), so a full turn takes 14 protons for its 3 ATP, about 4.7 each,
     against a mitochondrion's 8 for 3. Drawn true: fourteen rods, and the
     rotor pays out an ATP on the 5th, 10th and 14th proton of a turn. That
     is why the light reactions make about a third less ATP per proton than
     a page remembering respiration expects, and why cyclic flow exists. */
  const RING = { c: 14, protonsPerTurn: 14, atpPerTurn: 3 };
  const FUELS = { light: { weight: 1 } };
  /* THE LIGHT REACTIONS, SPLIT: the respiratory chain's shape, with water at
     the start. Per PAIR of electrons, linear flow:

       PSII  H₂O → PQ      pumps 0   one H₂O gives 2 e⁻ and 2 H⁺ INTO THE
                                     LUMEN, and ½ O₂. `fromWater` is those
                                     protons: released, not pumped
       b6f   PQH₂ → PC     pumps 4   net of the Q cycle: 2 ride in on PQH₂, 2 from the stroma
       PSI   PC → NADP⁺    pumps 0   by way of ferredoxin, one electron at a
                                     time, to FNR: NADP⁺ + 2e⁻ + H⁺ → NADPH,
                                     the H⁺ taken from the stroma. FNR is not
                                     a row: it stands in the stroma, pumps
                                     nothing and turns on no photon

     `photons` is one per electron at each photosystem. 6 H⁺ into the lumen
     a pair, so 12 per O₂; the checker asserts both off this table. Cyclic
     flow around PSI is `cyclic`, below. */
  const CHAIN = {
    PSII: { takes: 'H2O', gives: 'PQ',    pumps: 0, fromWater: 2, photons: 2 },
    b6f:  { takes: 'PQ',  gives: 'PC',    pumps: 4 },
    PSI:  { takes: 'PC',  gives: 'NADP+', pumps: 0, photons: 2, fromStroma: 1 },
  };
  const CARRIES = { H2O: 2, PQ: 2, PC: 1, Fd: 1 };
  const START = 'H2O', ACCEPTOR = 'NADP+';
  const path = () => CHEM.chainPath(CHAIN, START, ACCEPTOR);
  /* Protons that END UP in the lumen per pair: pumped, plus water's, released there by chemistry. */
  const protonsPerPair = () => path().reduce((s, k) => s + CHAIN[k].pumps + (CHAIN[k].fromWater || 0), 0);
  const photonsPerPair = () => path().reduce((s, k) => s + (CHAIN[k].photons || 0), 0);
  const pairsPerO2 = () => CHEM.E_PER_O2 / CARRIES.H2O;
  const protonsPerO2 = () => protonsPerPair() * pairsPerO2();
  const photonsPerO2 = () => photonsPerPair() * pairsPerO2();
  /* CYCLIC ELECTRON FLOW. Linear flow makes one NADPH per pair and buys
     protonsPerPair() / (H⁺ per ATP) ATP with it, which on a c14 ring is
     about 1.3; the Calvin cycle spends CALVIN.atp per CALVIN.nadph, 1.5. The
     chloroplast makes up the difference by sending some of PSI's electrons
     back to plastoquinone through ferredoxin instead of on to NADP⁺: b6f
     pumps for them a second time and no NADPH is made. `f` is the share of
     PSI's turns that go round again, so per NADPH there are 1/(1−f) turns
     and f/(1−f) of them cyclic, each worth b6f's pumps and PSI's photons. */
  const CALVIN = { atp: 3, nadph: 2 };
  const perATP = () => RING.protonsPerTurn / RING.atpPerTurn;
  const cyclicProtons = () => CHAIN.b6f.pumps;
  const protonsPerNADPH = (f = 0) => protonsPerPair() + cyclicProtons() * f / (1 - f);
  const atpPerNADPH = (f = 0) => protonsPerNADPH(f) / perATP();
  const photonsPerNADPH = (f = 0) => photonsPerPair() + CHAIN.PSI.photons * f / (1 - f);
  /* The share that lands ATP per NADPH on the Calvin cycle's, solved off the table. */
  function cyclicToBalance() {
    const want = CALVIN.atp / CALVIN.nadph * perATP();
    const r = Math.max(0, (want - protonsPerPair()) / cyclicProtons());
    return r / (1 + r);
  }

  const DEFAULTS = {
    /* 0..1: the share of PSI's turns that go round again. 0 is linear flow
       alone; cyclicToBalance() is what the Calvin cycle needs. */
    cyclic: 0,
  };
  const LINE = { keys: ['PSII', 'b6f', 'PSI'], donors: { PSII: 'light' }, rest: 'PSII', hub: 'b6f', end: 'PSI', stands: 'b6f',
                 q: ['PQ', 'PQH₂'], c: 'PC' };
  const OFFSETS = [-60, 0, 60];

  function machine(eng) {
    const PHO = global.MolLib.PALETTE.photosynthesis;
    /* NONE OF THE THREE IS A PUMP WITH A CHANNEL, so none is on the pump's
       lathe. PSII (PDB 3WU2) is a dimer, mostly in the membrane, with the
       oxygen-evolving complex and its extrinsic cap on the lumen face and a
       flat stroma face. PSI (plant PSI-LHCI, PDB 4XK8) is a monomer with the
       stromal ridge (PsaC, D, E) where ferredoxin docks. Cytochrome b6f (PDB
       1VF5) is bc₁'s relative: an obligate dimer with no channel, moving
       protons by the Q cycle at sites inside the membrane, but its bulk is
       on the LUMEN side, cytochrome f's large domain and the Rieske head,
       drawn as the knobs where plastocyanin docks. `R` is each one's reach
       along the membrane, antenna lobes included, and `lobe` widens the hole
       in the lipid to clear them. */
    const SPEC = {
      PSII: { R: 15.5, sx: 1.4, lobes: 2, lobe: 0.25, color: PHO.antenna },
      b6f:  { R: 14.0, lobes: 0, lobe: 0.12, color: PHO.b6f },
      PSI:  { R: 15.0, sx: 1.3, lobes: 3, lobe: 0.25, color: PHO.antenna },
    };
    const { THREE, P, HALF, rnd, seat, root } = eng;
    const pumpDir = eng.pumpDir;
    const Parts = global.Parts;
    function photosystem(key) {
      const part = Parts.transporter({ half: HALF, over: 3, site: 5.0, mouth: 5.0, radius: SPEC[key].R / SPEC[key].sx,
        taper: -pumpDir() * 0.35, lobes: SPEC[key].lobes, lobeDepth: SPEC[key].lobe, color: PHO.antenna });
      part.setGates(0, 0); part.setGates = () => {};
      part.mesh.scale.x = SPEC[key].sx;
      return part;
    }
    const K = global.Circuit.kit(eng, {
      name: 'LightReactions', context: 'thylakoid', ring: RING, line: Object.assign({ qColor: PHO.plastoquinone, cColor: PHO.plastocyanin }, LINE),
      table: CHAIN, carries: CARRIES, shapes: SPEC, offsets: OFFSETS, fuels: FUELS,
      /* THE PHOTOSYSTEMS ARE THE CHANNEL'S LATHE, SHUT: antenna and core in
         one green body, flared toward the stroma as in the textbook drawing,
         with no lumen through it. */
      build: (key, H) => key !== 'b6f' ? photosystem(key)
        : H.lathePart(PHO.b6f, { top: HALF + 3, bottom: -(HALF + 9), rTop: 9.5, rMax: 13, sx: 1.3,
            /* the dimer swells toward the lumen face, where cytochrome f stands */
            belly: y => Math.exp(-(((y + HALF) / 9) ** 2)) }),
    });
    const { CX } = K.parts;
    const { knob, tagged, dropToken, relabel, fade, approach, follow, posOf, midOf, hex, buildToken } = K.shapes;
    const xs = K.geom.xs, H_ = K.geom.H_;
    const { chips } = K;

    /* ---- what hangs off the machines ----
       THE ANTENNA BELT sits behind the core in this view: the membrane is
       seen edge-on, so the light-harvesting complexes that flank a
       photosystem along the membrane's plane stand at −z, where the photon
       lands. The oxygen-evolving complex on PSII's lumen face, PSI's stroma
       ridge, b6f's two lumen knobs, and FNR, an enzyme standing on the
       stroma face beside PSI, where NADP⁺ docks: all placed by sign in
       orient(), never by a negative scale. */
    /* THE PIGMENTS: chlorophyll dots on the photosystem's flanks, a few
       dozen standing in for hundreds, seated on the lathe's own outer radius
       so they sit on the surface at every height. The caps stay clear. */
    const chlGeo = new THREE.SphereGeometry(0.7, 10, 8);
    function pigments(key) {
      const part = CX[key], chl = Parts.flat(PHO.chlorophyll), N = 70;
      for (let i = 0; i < N; i++) {
        const y = (1 - 2 * (i + 0.5) / N) * (HALF + 2), t = i * 2.39996;
        const r = part.outerR(y) * (1 + SPEC[key].lobe * Math.cos(SPEC[key].lobes * t)) * 0.98;
        const d = new THREE.Mesh(chlGeo, chl);
        d.position.set(r * Math.cos(t) * SPEC[key].sx, y, r * Math.sin(t));
        part.group.add(d);
      }
    }
    pigments('PSII'); pigments('PSI');
    const OEC_G = new THREE.Group();
    const OEC = new THREE.Mesh(new THREE.SphereGeometry(5.5, 18, 12), Parts.flat(PHO.photosystemCap));
    OEC.scale.set(1.3, 0.8, 1); OEC_G.add(OEC); OEC_G.userData.baseY = CX.PSII.height + 3;
    CX.PSII.group.add(OEC_G);
    const RIDGE_PSI = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(PHO.photosystemCap));
    RIDGE_PSI.scale.set(1.2, 0.8, 1); RIDGE_PSI.userData.baseY = CX.PSI.height + 3;
    CX.PSI.group.add(RIDGE_PSI);
    const B6F_F = HALF + 5;
    const KNOBS = [knob(PHO.b6f, 5.5, -5, B6F_F, 1, 0.8), knob(PHO.b6f, 4.2, 6, B6F_F - 1, 1, 0.8)];   // cytochrome f, the Rieske head
    CX.b6f.group.add(...KNOBS);
    const FNR_DX = 26, FNR_R = 5.5;
    const FNR = new THREE.Mesh(new THREE.SphereGeometry(FNR_R, 18, 12), Parts.flat(PHO.fnr));
    FNR.scale.set(1.15, 0.8, 1); FNR.position.x = FNR_DX; FNR.userData.baseY = CX.PSI.height + 1.5;
    CX.PSI.group.add(FNR);
    /* where plastocyanin sits: on cytochrome f at b6f, against PSI's lumen face */
    const C_HALF = 3.4 * 0.8;
    K.hooks.cSeat = key => key === 'b6f' ? B6F_F + 5.5 * 0.8 + C_HALF - 0.5 : CX.PSI.height + C_HALF + 0.5;
    const ridgeAt = () => ({ x: xs.PSI, y: -pumpDir() * (RIDGE_PSI.userData.baseY + 2), z: 0 });
    const fnrAt = () => ({ x: xs.PSI + FNR_DX, y: -pumpDir() * FNR.userData.baseY, z: 0 });
    const oecAt = () => ({ x: xs.PSII + 2, y: pumpDir() * (OEC_G.userData.baseY + 2), z: 0 });

    /* AT FNR THE CARRIER IS THE ACCEPTOR, not the fuel: NADP⁺ arrives empty
       from the stroma, docks against FNR, and leaves as NADPH. Light has no
       token at all. */
    const NADP = { label: 'NADP⁺', spent: 'NADPH', color: PHO.carrier, lobes: 2, fuel: null,
      dock: () => { const d = pumpDir(), f = fnrAt(), ax = f.x + FNR_R * 1.15 + 6.7 - 1;
        return { from:{ x:ax + 24, y:-d * (H_() + 46) }, at:{ x:ax, y:f.y }, away:{ x:ax + 30, y:-d * (H_() + 50) } }; } };
    K.hooks.token = () => null;

    /* ---- light ----
       A PHOTON LANDS ON THE ANTENNA: a streak down onto an antenna lobe, then
       the excitation as a glow hopping from the lobe into the core and bursting at the reaction centre, which is when `then`
       fires and the electron is ejected. One photon per electron, so a turn
       fires two: at load, and at occlude. Drawn over the protein, because the
       reaction centre is inside it and a hidden burst is a missing step. */
    const PHOTON_LEN = 44, PH_FALL = 0.22, PH_HOP = 0.32, PH_BURST = 0.28;
    const photons = [];
    const glowMat = () => new THREE.MeshBasicMaterial({ color: PHO.photon, transparent: true, depthTest: false, depthWrite: false });
    function absorb(key, then) {
      if (!CX[key].group.visible) { if (then) then(); return; }
      lightLedger.photons++;
      const R = SPEC[key].R;
      const g = new THREE.Group();
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, PHOTON_LEN, 8), Parts.flat(PHO.photon));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(4.5, 16, 12), glowMat());
      glow.renderOrder = 32; glow.visible = false;
      g.add(ray, glow); root.add(g);
      photons.push({ obj: g, ray, glow, t: 0, key, x: xs[key] + rnd(-R * 0.6, R * 0.6), z: R * 0.6, then, fired: false });
    }
    function tickPhotons(dt) {
      const s = -pumpDir();
      for (let i = photons.length - 1; i >= 0; i--) {
        const p = photons[i]; p.t += dt;
        const rc = midOf(p.key);
        if (p.t < PH_FALL) {
          const k = p.t / PH_FALL;
          p.ray.position.y = s * (PHOTON_LEN / 2 + 70 * (1 - k));
          seat(p.obj, p.x, s * (HALF + 2), p.z);
        } else if (p.t < PH_FALL + PH_HOP) {
          const k = (p.t - PH_FALL) / PH_HOP;
          p.ray.visible = false; p.glow.visible = true; p.glow.scale.setScalar(0.7);
          seat(p.obj, p.x + (rc.x - p.x) * k, s * (HALF + 1) * (1 - k), p.z * (1 - k));
        } else {
          const k = (p.t - PH_FALL - PH_HOP) / PH_BURST;
          if (!p.fired) { p.fired = true; if (p.then) p.then(); }
          p.glow.scale.setScalar(0.8 + k * 1.2); p.glow.material.opacity = 1 - k;
          seat(p.obj, rc.x, 0, 0);
          if (k >= 1) { root.remove(p.obj); p.glow.material.dispose(); photons.splice(i, 1); }
        }
      }
    }

    /* ---- water, and the oxygen-evolving complex ----
       Two waters bind at the OEC and wait. Each electron ejected from P680
       is refilled from the OEC, which stores the oxidizing equivalent (the
       S state, on the pill); at four it takes the four electrons from both
       waters at once: one O₂, and four H⁺ set down in the lumen as REAL
       protons that count toward the gradient, which is why PSII builds it
       without pumping. The O₂ is nonpolar: it slides out under PSII, across
       the bilayer, and up through the stroma out of the chloroplast.
       THE STROMA IS A BIG TANK. The Calvin cycle and the stroma's buffers
       take up the water's other protons off stage, so while the stroma holds
       more than the page gave it, FNR takes a second the same way. Staging,
       declared: without it the water's protons pile up with nowhere to go. */
    const O2_SPEED = 40, O2_FADE = 1.2, OEC_STATES = CHEM.E_PER_O2, WATERS_BOUND = OEC_STATES / CARRIES.H2O;
    const psiiWater = [], psiiO2 = [], riders = [];
    const lightLedger = { photons: 0, waterSplit: 0, o2Released: 0, nadphMade: 0, protonsFromWater: 0, protonsToNADPH: 0, cyclicTurns: 0 };
    let oecS = 0;
    const SUB = '₀₁₂₃₄';
    function oecLabel() {
      relabel(OEC_G, 'S' + SUB[oecS], pumpDir() * 9);
      const k = 1 + 0.07 * oecS;
      OEC.scale.set(1.3 * k, 0.8 * k, k);
    }
    function waterArrive() {
      if (!P.showFuel || psiiWater.length >= WATERS_BOUND) return;
      const at = oecAt(), i = psiiWater.length;
      const w = { obj: tagged(eng.smallMolecule('water'), 'H₂O'), x: at.x - 30 - i * 10, y: pumpDir() * (H_() + 40 + i * 8),
                  to: { x: at.x + (i ? 7 : -7), y: at.y + pumpDir() * 5, z: 0 } };
      root.add(w.obj); seat(w.obj, w.x, w.y, 0); psiiWater.push(w);
    }
    /* One electron pulled from water into P680's hole: an oxidizing equivalent stored. */
    function refillFromWater() {
      K.electrons.sendE(1, oecAt(), [midOf('PSII')], null);
      oecS++;
      if (oecS >= OEC_STATES) oecRelease(); else oecLabel();
    }
    function oecRelease() {
      for (const w of psiiWater.splice(0)) dropToken(w.obj);
      const at = oecAt(), d = pumpDir(), n = OEC_STATES;
      let made = 0;
      for (let i = 0; i < n; i++)
        made += eng.scatter('H', 1, d, { x: at.x + (i - (n - 1) / 2) * 7, y: at.y + d * 4, z: rnd(-4, 4) }).length;
      if (made) {
        lightLedger.protonsFromWater += made;
        if (K.doors.protonRef != null) K.doors.protonRef += made / 2;
        eng.chargeOut += d * made; K.doors.reMV();
      }
      lightLedger.waterSplit += WATERS_BOUND;
      lightLedger.o2Released++;
      oecS = 0; oecLabel();
      /* out from under PSII, across the lipid beside it, and off through the stroma */
      const x = xs.PSII + SPEC.PSII.R + 9;
      const top = Math.min(P.bounds && P.bounds.up != null ? P.bounds.up : P.extent, P.extent) - 8;
      const o = { obj: tagged(eng.smallMolecule('o2'), 'O₂'), x: at.x, y: at.y, fade: 1,
                  path: [{ x, y: at.y }, { x: x + 2, y: -d * (HALF + 8) }, { x: x + 14, y: -d * (H_() + 70) }, { x: x + 26, y: -d * top }] };
      root.add(o.obj); seat(o.obj, o.x, o.y, 0); psiiO2.push(o);
      eng.emit('oxygen', lightLedger.o2Released);
    }
    function tickWater(dt) {
      for (const w of psiiWater) approach(w, w.to, dt, O2_SPEED);
      for (let i = psiiO2.length - 1; i >= 0; i--) {
        const o = psiiO2[i];
        const leaving = o.path.length <= 1;
        if (!follow(o, dt, O2_SPEED * (leaving ? 1.1 : 0.8))) { if (leaving) { o.fade -= dt / (O2_FADE * 2.5); fade(o.obj, o.fade); } continue; }
        o.fade -= dt / O2_FADE; fade(o.obj, o.fade);
        if (o.fade <= 0) { dropToken(o.obj); psiiO2.splice(i, 1); }
      }
      for (let i = riders.length - 1; i >= 0; i--) {
        const r = riders[i];
        if (!approach(r, { x: r.chip.x, y: r.chip.y }, dt, O2_SPEED * 1.6) && chips.PSI === r.chip) continue;
        dropToken(r.obj); riders.splice(i, 1);
      }
    }

    /* ---- PSII: two photons, two electrons, one plastoquinone ----
       The kit's donor claims a quinone at load and hands it `charge` at
       occlude. Each photon ejects one electron from P680 onto the waiting
       quinone and pulls one out of water behind it; the quinone is charged
       once both ride it, which is what lets it leave for b6f. */
    let psiiTurn = null;
    function ejectII() {
      const T = psiiTurn;
      if (!T || !T.q) return;
      K.electrons.sendE(1, midOf('PSII'), [], T.q, () => { T.landed++; if (T.landed >= K.electrons.E_PER_TURN && T.charge) T.charge(); });
      refillFromWater();
    }

    /* ---- PSI, ferredoxin and FNR ----
       Plastocyanin's electrons go into P700 and stop; each photon ejects
       one out to the stromal ridge, where a ferredoxin takes it. A linear
       turn's ferredoxins walk to FNR and unload onto the NADP⁺ docked
       there; the second one to arrive makes the NADPH. A cyclic turn's carry
       theirs back to the plastoquinone PSI reserved at its membrane edge,
       and b6f pumps for them again. Neither ferredoxin is consumed. */
    const FD_SPEED = 45;
    const fdTokens = [];
    const fdHome = i => ({ x: xs.PSI - 7 + i * 14, y: -pumpDir() * (RIDGE_PSI.userData.baseY + 6.5 * 0.8 + 3.2), z: 0 });
    const fdAtFNR = i => ({ x: xs.PSI + FNR_DX - 4 + i * 8, y: -pumpDir() * (FNR.userData.baseY + FNR_R * 0.8 + 3.2), z: 0 });
    const fdAtQ = q => ({ x: q.x, y: -pumpDir() * (HALF + 8), z: 0 });
    function buildFd() {
      if (fdTokens.length) return;
      for (let i = 0; i < 2; i++) {
        const f = { obj: buildToken('Fd', PHO.ferredoxin, 1), i, state: 'home', to: null, onArrive: null };
        f.obj.children[0].scale.set(1.15, 0.8, 1);
        Object.assign(f, fdHome(i)); f.to = fdHome(i);
        root.add(f.obj); seat(f.obj, f.x, f.y, 0); fdTokens.push(f);
      }
    }
    function dropFd() { for (const f of fdTokens) dropToken(f.obj); fdTokens.length = 0; }
    function homeFd() { for (const f of fdTokens) { f.state = 'home'; f.onArrive = null; f.to = fdHome(f.i); } }
    let fnrLanded = 0;
    function electronAtFNR() {
      fnrLanded++;
      if (fnrLanded < K.electrons.E_PER_TURN) return;
      fnrLanded = 0;
      reduceNADP();
    }
    /* One electron out of P700 to the ridge, onto a ferredoxin, and off to where it goes. */
    function ejectI() {
      const fd = fdTokens.find(f => f.state === 'home') || null;
      const cyc = cycNow ? cycQ : null;
      if (!fd) {
        /* both ferredoxins away: the electron takes the trip alone */
        if (cyc) K.electrons.sendE(1, midOf('PSI'), [ridgeAt(), fdAtQ(cyc)], cyc, () => cycLanded(cyc));
        else K.electrons.sendE(1, midOf('PSI'), [ridgeAt(), fnrAt()], null, electronAtFNR);
        return;
      }
      fd.state = 'held';
      K.electrons.sendE(1, midOf('PSI'), [ridgeAt()], fd, () => {
        if (cyc) { fd.state = 'toQ'; fd.q = cyc; fd.to = fdAtQ(cyc); fd.onArrive = () => K.electrons.handOff(fd, [{ x: cyc.x, y: cyc.y, z: cyc.z }], cyc, () => cycLanded(cyc)); }
        else { fd.state = 'toFNR'; fd.to = fdAtFNR(fd.i); fd.onArrive = () => K.electrons.handOff(fd, [fnrAt()], chips.PSI ? posOf(chips.PSI) : fnrAt(), electronAtFNR); }
      });
    }
    function tickFd(dt) {
      for (const f of fdTokens) {
        if (f.state === 'held') f.to = fdHome(f.i);
        if (f.state === 'toQ' && f.q) f.to = fdAtQ(f.q);
        if (!approach(f, f.to, dt, FD_SPEED)) continue;
        if (f.state === 'toFNR' || f.state === 'toQ') { const go = f.onArrive; f.onArrive = null; f.q = null; if (go) go(); f.state = 'returning'; f.to = fdHome(f.i); }
        else if (f.state === 'returning') f.state = 'home';
      }
    }
    function reduceNADP() {
      K.fuelSpend('PSI');
      lightLedger.nadphMade++;
      eng.emit('nadph', lightLedger.nadphMade);
      const s = -pumpDir(), sideKey = s > 0 ? 'outside' : 'inside';
      const start = (P.contents && P.contents[sideKey] && P.contents[sideKey].H) | 0;
      const bound = CHAIN.PSI.fromStroma;
      const want = bound + (eng.sideCount('H')[sideKey] > start ? 1 : 0);
      const pool = K.doors.protonPool(s, xs.PSI + FNR_DX, want);
      pool.forEach((t, i) => {
        if (i < bound) lightLedger.protonsToNADPH++;
        if (chips.PSI && i < bound) {
          const r = { obj: eng.chargedIon('H'), x: t.x, y: t.y, z: t.z, chip: chips.PSI };
          root.add(r.obj); seat(r.obj, r.x, r.y, r.z); riders.push(r);
        }
        eng.remove(t);
        if (K.doors.protonRef != null) K.doors.protonRef -= 0.5;
        eng.chargeOut -= s;
      });
      if (pool.length) K.doors.reMV();
    }

    /* ---- cyclic electron flow ----
       Every PSI turn adds the share to a debt; once the debt reaches one, a
       cyclic turn is owed. PSI then reserves the next plastoquinone to come
       free (PSII runs first every tick and would take it otherwise) and the
       first turn it holds one goes round again: its ferredoxins carry the
       electrons back to that quinone instead of to FNR. NEVER WAIT FOR ONE:
       both quinones can be reduced and waiting on b6f, which is waiting on
       the plastocyanins PSI is holding, and a PSI that held out for a
       quinone would lock the whole chain; the electrons go to NADP⁺ instead
       and the debt stands. No NADP⁺ arrives and no NADPH leaves. */
    /* A flash is one PSII turn, and PSI owes it one turn later, whenever its
       plastocyanins arrive: a count, so two quick flashes are two turns. */
    const credit = { PSI: 0 };
    let cyclicDue = 0, cycNow = false, cycQ = null, held = null, cycLandedN = 0;
    const share = () => Math.max(0, Math.min(1, P.cyclic || 0));
    const owed = () => cyclicDue >= 1;
    function cyclicWatch() {
      if (owed() && !held) held = K.shuttles.reserveQ('PSI');
      if (!owed() && held) { K.shuttles.releaseQ(held); held = null; }
      return true;
    }
    function cyclicDecide() {
      cycNow = false;
      if (!held || !owed()) return;
      const q = held; held = null;
      cyclicDue -= 1; cycNow = true; cycLandedN = 0;
      q.reservedFor = null; q.state = 'toDonor'; q.charged = false; q.to = K.shuttles.qDock('PSI', q.x, q.i); cycQ = q;
      lightLedger.cyclicTurns++;
      eng.emit('cyclic', lightLedger.cyclicTurns);
    }
    function cycLanded(q) {
      cycLandedN++;
      if (cycLandedN < K.electrons.E_PER_TURN) return;
      q.charged = true; K.shuttles.protonateQ(q);
      if (cycQ === q) cycQ = null;
    }
    const cyclicOwe = () => { cyclicDue = Math.min(1, cyclicDue + share()); };
    const lightRate = () => P.fuel === 'light' ? K.fuelRate('light', P.fuelRate, null) : 0;

    function clearLight() {
      for (const t of photons) { root.remove(t.obj); t.glow.material.dispose(); }
      for (const t of psiiWater.concat(psiiO2, riders)) dropToken(t.obj);
      photons.length = psiiWater.length = psiiO2.length = riders.length = 0;
      credit.PSI = 0; cyclicDue = 0; cycNow = false; cycQ = null; held = null; cycLandedN = 0;
      psiiTurn = null; fnrLanded = 0; oecS = 0; oecLabel();
      homeFd();
    }
    K.hooks.resetChain = clearLight;

    /* ---- the three machines ---- */
    const RUN = {
      PSII: K.donor('PSII', 'light', {
        onLoad: q => { psiiTurn = { q, landed: 0, charge: null }; absorb('PSII', ejectII); waterArrive(); },
        eject: (q, charge) => { if (psiiTurn && psiiTurn.q === q) psiiTurn.charge = charge; else psiiTurn = { q, landed: 0, charge }; absorb('PSII', ejectII); },
      }),
      b6f: K.hub('b6f'),
      PSI: K.terminal('PSI', {
        rate: () => credit.PSI > 0 ? 1 : lightRate(),
        ready: cyclicWatch,
        load: cyclicDecide,
        site: () => midOf('PSI'),
        onLoad: () => { if (!cycNow) K.carrierArrive('PSI', NADP); absorb('PSI', ejectI); },
        onOcclude: () => { absorb('PSI', ejectI); cyclicOwe(); },
        onWrap: () => { if (credit.PSI > 0) credit.PSI--; },
      }),
    };

    /* One flash: PSII turns once and PSI owes a turn. The light has no
       token, so nothing waits and nothing is drawn arriving. With
       opts.cyclic the pair goes round once first: PSI is owed two turns,
       the first of them cyclic, so one flash costs six photons and buys
       b6f's protons twice for its one NADPH. */
    function feed(fuel, opts = {}) {
      if (!K.hasChain(P.proteins)) return false;
      const f = fuel || P.fuel || 'light';
      if (!FUELS[f]) { console.warn('LightReactions: no fuel named ' + f + '; have ' + Object.keys(FUELS).join(', ')); return false; }
      const ok = K.feedAt('PSII', f, null);
      if (ok) { credit.PSI++; if (opts.cyclic) { credit.PSI++; cyclicDue = 1; } }
      return ok;
    }

    /* ---- the words ---- */
    function cards(library) {
      library.outside.card = 'The stroma, around the outside of the thylakoid disc. ATP and NADPH are made here, and the Calvin cycle spends both to fix carbon. Protons leave from this side and come back through the synthase.';
      library.inside.card  = 'The lumen, the space enclosed by the disc. Light drives protons in here, so this is the acidic side: the energy from the photons is now a gradient across this membrane.'
        + ` ${protonsPerPair()} arrive per pair of electrons: ${CHAIN.PSII.fromWater} from water at PSII, ${CHAIN.b6f.pumps} pumped by b6f.`
        + ' It is the same space as a mitochondrion\'s intermembrane space, both of them the OUTSIDE of the bacterium each organelle came from, which is why the two diagrams are mirrored.';
    }

    return K.plugin({
      runners: RUN, feed, cards,
      /* The oxygen-evolving complex and b6f's knobs on the lumen face, the
         ridge and FNR on the stroma face: placed by sign. */
      orient(d) {
        OEC_G.position.y = d * OEC_G.userData.baseY;
        RIDGE_PSI.position.y = -d * RIDGE_PSI.userData.baseY;
        FNR.position.y = -d * FNR.userData.baseY;
        for (const m of KNOBS) m.position.y = m.userData.side * d * m.userData.baseY;
        oecLabel();
      },
      afterSheet() {
        buildFd(); homeFd();
        for (const f of fdTokens) { Object.assign(f, f.to); seat(f.obj, f.x, f.y, 0); }
      },
      post(dt) { tickPhotons(dt); tickWater(dt); if (fdTokens.length) tickFd(dt); },
      state(base, s) {
        const sh = K.shuttles.counts();
        return {
          protonsPerFuel: { light: protonsPerPair() },
          shuttles: { plastoquinol: sh.reduced, plastocyaninLoaded: sh.loaded,
                      ferredoxinLoaded: fdTokens.filter(f => f.state === 'toFNR' || f.state === 'toQ').length },
          /* The light reactions' own ledger: every count is an event that
             happened, and the ratios are the table's. `measured` ATP per
             NADPH is this run's, off the rotor against the ledger; it
             settles toward `expected` over a long run and is null before the
             first NADPH. */
          light: Object.assign({}, lightLedger, {
            photonsPerPair: photonsPerPair(), protonsPerO2: protonsPerO2(), photonsPerO2: photonsPerO2(),
            oec: { stored: oecS, of: OEC_STATES, watersBound: psiiWater.length },
            cyclic: P.cyclic || 0, cyclicToBalance: cyclicToBalance(),
            atpPerNADPH: { linear: atpPerNADPH(0), expected: atpPerNADPH(P.cyclic || 0), calvin: CALVIN.atp / CALVIN.nadph,
                           measured: lightLedger.nadphMade ? +(s.atpMade / lightLedger.nadphMade).toFixed(2) : null },
          }),
        };
      },
      reset() { for (const k in lightLedger) lightLedger[k] = 0; },
      anchors: {
        psii:     () => P.proteins.PSII ? K.at(xs.PSII, H_() * 0.98) : null,
        b6f:      () => P.proteins.b6f ? K.at(xs.b6f, H_() * 0.98) : null,
        psi:      () => P.proteins.PSI ? K.at(xs.PSI, H_() * 0.98) : null,
        antenna:  () => P.proteins.PSII ? K.at(xs.PSII - 6, -pumpDir() * (HALF + 8)) : null,
        plastoquinone: () => K.shuttles.qTokens.length ? K.shuttles.qTokens[0].obj.position : null,
        plastocyanin:  () => K.shuttles.cTokens.length ? K.shuttles.cTokens[0].obj.position : null,
        ferredoxin: () => fdTokens.length ? fdTokens[0].obj.position : null,
        fnr:      () => P.proteins.PSI ? K.at(xs.PSI + FNR_DX, -pumpDir() * (FNR.userData.baseY + 3)) : null,
        nadph:    () => chips.PSI ? chips.PSI.obj.position : null,
        'water.split': () => P.proteins.PSII ? K.at(oecAt().x, oecAt().y) : null,
        oxygen:   () => psiiO2.length ? psiiO2[0].obj.position : null,
      },
      library: {
        psii: { text: 'photosystem II', offset: [-44, -30],
          card: `A photon lands on the antenna and its energy hops in to the reaction centre, P680, which throws an electron out to plastoquinone. The hole is refilled from water on the lumen face: ${OEC_STATES} such electrons make one O₂ from two waters and leave ${OEC_STATES} protons in the lumen. It pumps nothing; its protons come out of water, not across the membrane.` },
        antenna: { text: 'the antenna', offset: [-40, -34],
          card: 'Light-harvesting complexes, hundreds of chlorophylls around each photosystem. Whichever one a photon hits, the excitation hops from pigment to pigment into the reaction centre in a few trillionths of a second. The reaction centre is the only place an electron actually leaves.' },
        b6f: { text: 'cytochrome b6f', offset: [-10, -40],
          card: `The one pump in the chain, and a close relative of the mitochondrion's complex III. It takes the pair from plastoquinol and hands them to plastocyanin one at a time on its lumen face, at cytochrome f; ${CHAIN.b6f.pumps} protons end up in the lumen per pair, by the same Q cycle: some ride in on plastoquinol, the rest are taken from the stroma, and no channel opens. As the lumen turns acidic it slows, so the chain cannot outrun the synthase.` },
        psi: { text: 'photosystem I', offset: [40, -34],
          card: `Plastocyanin refills P700 from the lumen side, and a second photon lifts each electron again, higher than PSII could, out to the ridge on the stroma face where ferredoxin takes it. PSI pumps nothing either. Some turns send the electrons back to plastoquinone instead of to FNR, so b6f pumps for them twice: that cyclic flow is how the chloroplast makes the extra ATP the Calvin cycle needs beyond ${atpPerNADPH(0).toFixed(1)} per NADPH.` },
        plastoquinone: { text: 'plastoquinone', offset: [-40, 26],
          card: 'A small oily molecule that moves inside the membrane. It picks up two electrons at PSII, becomes plastoquinol, delivers them to b6f and goes back for more. It does the job ubiquinone does in a mitochondrion.' },
        plastocyanin: { text: 'plastocyanin', offset: [36, 30],
          card: 'A small copper protein in the lumen. It carries one electron at a time from cytochrome f on b6f to PSI, so b6f loads two per pair, and it comes back empty.' },
        ferredoxin: { text: 'ferredoxin', offset: [36, -30],
          card: 'A small iron-sulfur protein in the stroma, one electron at a time, the way cytochrome c and plastocyanin work on the other side. It takes each electron off PSI\'s ridge to FNR, or, in cyclic flow, back to plastoquinone.' },
        fnr: { text: 'FNR', offset: [40, -26],
          card: 'Ferredoxin-NADP⁺ reductase, the enzyme on the stroma face where NADPH is actually made: two ferredoxins arrive one after the other, and NADP⁺ takes both electrons and a proton from the stroma. Not on PSI itself, though it works beside it.' },
        nadph: { text: 'NADPH', offset: [40, -26],
          card: 'The other product of the light reactions, made at FNR in the stroma beside the ATP. The Calvin cycle spends both to turn CO₂ into sugar, and the NADP⁺ comes back to be filled again.' },
        'water.split': { text: 'water is split here', offset: [-44, 26],
          card: `The oxygen-evolving complex, a cluster of four manganese and a calcium on PSII's lumen face. It gives up one electron per photon and stores the debt (the S states, S₀ to S₃), then at the fourth takes all four back from two bound waters at once: one O₂, and ${OEC_STATES} protons kept in the lumen. Nothing else in biology can pull electrons off water.` },
        oxygen: { text: 'oxygen', offset: [42, -34],
          card: 'Waste. What is left of two waters once PSII has had their four electrons is one O₂, and being nonpolar it slips across the membrane and out of the chloroplast. Every breath you take was split out of water this way, four photons at a time.' },
      },
      proteinKey: {
        PSII:     { name: 'photosystem II', color: hex(PHO.antenna) },
        b6f:      { name: 'cytochrome b6f (pumps H⁺)', color: hex(PHO.b6f) },
        PSI:      { name: 'photosystem I', color: hex(PHO.antenna) },
      },
      carries: { PSII:[], b6f:['H'], PSI:[] },
    });
  }

  /* ---- the sim ----
     A create with no params is a thylakoid in the light: the chain, a
     synthase, and a gradient's worth of protons. Light is the fuel, because
     NADH in a chloroplast is a page that will not turn. */
  const defaultProteins = () => ({ complex:{ x:-60 }, synthase:{ x:80 } });
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet || !global.Circuit) throw new Error('LightReactions: load membrane/parts.js, membrane/sheet.js and chemiosmosis/circuit.js first');
    const P = Object.assign({ componentName: 'LightReactions' }, global.Sheet.DEFAULTS, global.Circuit.DEFAULTS, DEFAULTS,
      { potential: 'nernst', fuel: 'light' }, opts, { context: 'thylakoid' });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    delete P.chain;
    P.proteins = Object.assign({}, opts.proteins || defaultProteins());
    return global.Sheet.create(THREE, root, camera, P, [machine]);
  }
  const SIGNALS = Object.assign({}, global.Circuit ? global.Circuit.SIGNALS : {});
  function mount(el, params = {}) {
    return global.Circuit.mount(el, params, { name: 'LightReactions', context: 'thylakoid', other: 'ElectronTransport', create, signals: SIGNALS, api: ['feed'],
      names: { PSII: 'Photosystem II', b6f: 'Cytochrome b6f', PSI: 'Photosystem I', synthase: 'ATP synthase', leak: 'Uncoupler', membrane: 'Thylakoid membrane' } });
  }

  global.LightReactions = { create, mount, machine, DEFAULTS, SIGNALS,
    RING, CALVIN, FUELS, CHAIN, CARRIES, chainPath: path, protonsPerPair, photonsPerPair, protonsPerO2, photonsPerO2,
    protonsPerNADPH, atpPerNADPH, photonsPerNADPH, cyclicToBalance };
  if (global.Circuit) global.LightReactions.SCALE = global.Circuit.SCALE();
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LightReactions;
})(typeof globalThis !== 'undefined' ? globalThis : this);
