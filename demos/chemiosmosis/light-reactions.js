/* =============================================================================
 *  chemiosmosis/light-reactions.js — photosynthesis's light reactions, as a component
 * =============================================================================
 *  A thylakoid membrane: light lifts electrons out of water at photosystem
 *  II, cytochrome b6f pumps protons into the lumen as they pass, photosystem
 *  I lifts them again onto NADP⁺, and ATP synthase spends the gradient into
 *  the stroma. The oxygen is the waste.
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
 *      protonsPerPair() · photonsPerPair() · protonsPerO2() · protonsPerNADPH(f)
 *      atpPerNADPH(f) · photonsPerNADPH(f) · cyclicToBalance()
 *                       walked off the table, never typed
 *
 *      proteins: { complex | PSII | b6f | PSI | synthase | leak: {x} | null }
 *
 *      chain  'lumped'  one complex stands for the chain, 2 H⁺ a turn
 *             'split'   PSII, b6f and PSI, plastoquinone in the membrane,
 *                       plastocyanin in the lumen; PSII splits water into
 *                       lumen protons and O₂, PSI makes NADPH in the stroma,
 *                       both fire on light
 *
 *  `fuel` is 'light' or null, and `fuelRate` is the dimmer. Light has no
 *  token: nothing arrives at PSII and nothing leaves it, which is correct
 *  rather than missing. `feed('light')` is one flash: PSII turns once, and
 *  PSI owes one turn whenever its plastocyanins arrive. `cyclic` is the
 *  share of PSI's turns that send their electrons back to plastoquinone
 *  instead of on to NADP⁺, the reason the ATP balances against the NADPH.
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
       PSI   PC → NADP⁺    pumps 0   ferredoxin and FNR drawn as PSI's stromal
                                     face: NADP⁺ + 2e⁻ + H⁺ → NADPH, the H⁺
                                     taken from the stroma

     `photons` is one per electron at each photosystem. 6 H⁺ into the lumen
     a pair, so 12 per O₂; the checker asserts both off this table. Cyclic
     flow around PSI is `cyclic`, below. */
  const CHAIN = {
    PSII: { takes: 'H2O', gives: 'PQ',    pumps: 0, fromWater: 2, photons: 2 },
    b6f:  { takes: 'PQ',  gives: 'PC',    pumps: 4 },
    PSI:  { takes: 'PC',  gives: 'NADP+', pumps: 0, photons: 2, fromStroma: 1 },
  };
  const CARRIES = { H2O: 2, PQ: 2, PC: 1 };
  const START = 'H2O', ACCEPTOR = 'NADP+';
  const path = () => CHEM.chainPath(CHAIN, START, ACCEPTOR);
  /* Protons that END UP in the lumen per pair: pumped, plus water's, released there by chemistry. */
  const protonsPerPair = () => path().reduce((s, k) => s + CHAIN[k].pumps + (CHAIN[k].fromWater || 0), 0);
  const photonsPerPair = () => path().reduce((s, k) => s + (CHAIN[k].photons || 0), 0);
  const protonsPerO2 = () => protonsPerPair() * CHEM.E_PER_O2 / CARRIES.H2O;
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
    /* PSII and b6f are dimers. PSII's oxygen-evolving complex hangs into the
       lumen, where the water is split; PSI's stromal ridge is where
       ferredoxin docks and NADP⁺ is reduced. */
    const SPEC = {
      PSII: { R: 15.5, lobes: 2, lobe: 0.14, color: PHO.psii },
      b6f:  { R: 14.0, lobes: 2, lobe: 0.12, color: PHO.b6f },
      PSI:  { R: 15.0, lobes: 3, lobe: 0.10, color: PHO.psi },
    };
    const { THREE, P, HALF, rnd, travellers, seat, root } = eng;
    const pumpDir = eng.pumpDir;
    const Parts = global.Parts;
    const K = global.Circuit.kit(eng, {
      name: 'LightReactions', context: 'thylakoid', ring: RING, line: Object.assign({ qColor: PHO.plastoquinone, cColor: PHO.plastocyanin }, LINE),
      table: CHAIN, carries: CARRIES, shapes: SPEC, offsets: OFFSETS, fuels: FUELS,
    });
    const { CX } = K.parts;
    const { tagged, dropToken, fade, approach, posOf, faceOf, hex } = K.shapes;
    const xs = K.geom.xs, H_ = K.geom.H_;
    const { chips } = K;
    const split = K.split;

    const OEC = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(PHO.psii));
    OEC.scale.set(1.3, 0.8, 1); OEC.userData.baseY = CX.PSII.height + 3;
    CX.PSII.group.add(OEC);
    const RIDGE_PSI = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(PHO.psi));
    RIDGE_PSI.scale.set(1.2, 0.8, 1); RIDGE_PSI.userData.baseY = CX.PSI.height + 3;
    CX.PSI.group.add(RIDGE_PSI);
    CX.PSII.setGates(0, 0); CX.PSI.setGates(0, 0); CX.b6f.setGates(0, 0);   // b6f runs the Q cycle: no channel opens

    /* AT PSI THE CARRIER IS THE ACCEPTOR, not the fuel: NADP⁺ arrives empty
       and leaves as NADPH, the reverse of NADH at complex I. Light has no
       token at all. */
    const NADP = { label: 'NADP⁺', spent: 'NADPH', color: PHO.carrier, lobes: 2, fuel: null,
      dock: () => { const d = pumpDir(), H = H_(), x = xs.PSI;
        return { from:{ x:x + 36, y:-d * (H + 46) }, at:{ x:x + 12, y:-d * (H + 20) }, away:{ x:x + 42, y:-d * (H + 50) } }; } };
    K.hooks.token = () => null;

    /* ---- light, water and NADP⁺: what the photosystems add ----
       A PHOTON IS A FLASH ON THE STROMA FACE: a streak down onto the
       photosystem and a glow as it is absorbed. One per electron, so a turn
       (a pair) fires two, at load and at occlude.

       ONE WATER A TURN at PSII's lumen face: a turn is two electrons and a
       water gives two. On `occlude` it is gone, and its protons are set down
       in the lumen as REAL protons that count toward the gradient, which is
       why PSII builds it without pumping. Every second water releases an O₂
       into the lumen, which fades: it leaves the chloroplast off stage.

       AT PSI, NADP⁺ + 2e⁻ + H⁺ → NADPH, the H⁺ taken from the stroma: the
       nearest free one rides to the carrier and is gone.
       THE STROMA IS A BIG TANK. The Calvin cycle and the stroma's buffers take
       up the water's other proton off stage, so while the stroma holds more
       than the page gave it, PSI takes a second the same way. Staging,
       declared: without it the water's protons pile up with nowhere to go. */
    const PHOTON_LEN = 44, PHOTON_LIFE = 0.55, PHOTON_FALL = 0.22;
    const O2_SPEED = 40, WATER_FADE = 1.2;
    const photons = [], psiiWater = [], psiiO2 = [], riders = [];
    const lightLedger = { photons: 0, waterSplit: 0, o2Released: 0, nadphMade: 0, protonsFromWater: 0, protonsToNADPH: 0, cyclicTurns: 0 };
    /* A flash is one PSII turn, and PSI owes it one turn later, whenever its
       plastocyanins arrive: a count, so two quick flashes are two turns. */
    const credit = { PSI: 0 };
    function flash(key) {
      if (!CX[key].group.visible) return;
      lightLedger.photons++;
      const g = new THREE.Group();
      const ray = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.8, PHOTON_LEN, 8), Parts.flat(PHO.photon));
      const glow = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), Parts.flat(PHO.photon));
      glow.visible = false;
      g.add(ray, glow); root.add(g);
      photons.push({ obj: g, ray, glow, t: 0, x: xs[key] + rnd(-7, 7) });
    }
    const oecAt = () => ({ x: xs.PSII + 3, y: pumpDir() * (CX.PSII.height + 12) });
    function waterArrive() {
      if (!P.showFuel || psiiWater.length) return;
      const to = oecAt();
      const w = { obj: tagged(eng.smallMolecule('water'), 'H₂O'), x: to.x - 30, y: pumpDir() * (H_() + 40), to };
      root.add(w.obj); seat(w.obj, w.x, w.y, 0); psiiWater.push(w);
    }
    function splitWater() {
      for (const w of psiiWater.splice(0)) dropToken(w.obj);
      const at = oecAt(), d = pumpDir(), n = CHAIN.PSII.fromWater;
      let made = 0;
      for (let i = 0; i < n; i++)
        made += eng.scatter('H', 1, d, { x: at.x + (i - (n - 1) / 2) * 7, y: at.y, z: rnd(-4, 4) }).length;
      if (made) {
        lightLedger.protonsFromWater += made;
        if (K.doors.protonRef != null) K.doors.protonRef += made / 2;
        eng.chargeOut += d * made; K.doors.reMV();
      }
      lightLedger.waterSplit++;
      if (lightLedger.waterSplit % (CHEM.E_PER_O2 / CARRIES.H2O) === 0) {
        lightLedger.o2Released++;
        const o = { obj: tagged(eng.smallMolecule('o2'), 'O₂'), x: at.x, y: at.y, to: { x: at.x + 34, y: d * (H_() + 44) }, fade: 1 };
        root.add(o.obj); seat(o.obj, o.x, o.y, 0); psiiO2.push(o);
        eng.emit('oxygen', lightLedger.o2Released);
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
      const pool = K.doors.protonPool(s, xs.PSI, want);
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
    function tickLight(dt) {
      const s = -pumpDir();
      for (let i = photons.length - 1; i >= 0; i--) {
        const p = photons[i]; p.t += dt;
        const arrive = Math.min(1, p.t / PHOTON_FALL);
        p.ray.visible = arrive < 1;
        p.ray.position.y = s * (PHOTON_LEN / 2 + 70 * (1 - arrive));
        if (arrive >= 1) {
          const k = (p.t - PHOTON_FALL) / (PHOTON_LIFE - PHOTON_FALL);
          p.glow.visible = true; p.glow.scale.setScalar(0.5 + k * 0.8); fade(p.glow, 1 - k);
        }
        seat(p.obj, p.x, s * (H_() + 2), 0);
        if (p.t >= PHOTON_LIFE) { root.remove(p.obj); photons.splice(i, 1); }
      }
      for (const w of psiiWater) approach(w, w.to, dt, O2_SPEED);
      for (let i = psiiO2.length - 1; i >= 0; i--) {
        const o = psiiO2[i];
        if (!approach(o, o.to, dt, O2_SPEED * 0.7)) continue;
        o.fade -= dt / WATER_FADE; fade(o.obj, o.fade);
        if (o.fade <= 0) { dropToken(o.obj); psiiO2.splice(i, 1); }
      }
      for (let i = riders.length - 1; i >= 0; i--) {
        const r = riders[i];
        if (!approach(r, { x: r.chip.x, y: r.chip.y }, dt, O2_SPEED * 1.6) && chips.PSI === r.chip) continue;
        dropToken(r.obj); riders.splice(i, 1);
      }
    }
    function clearLight() {
      for (const t of photons) root.remove(t.obj);
      for (const t of psiiWater.concat(psiiO2, riders)) dropToken(t.obj);
      photons.length = psiiWater.length = psiiO2.length = riders.length = 0;
      credit.PSI = 0; cyclicDue = 0; cycNow = false; cycQ = null; held = null;
    }
    K.hooks.resetChain = clearLight;
    const lightRate = () => P.fuel === 'light' ? K.fuelRate('light', P.fuelRate, null) : 0;

    /* ---- cyclic electron flow, drawn ----
       Every PSI turn adds the share to a debt; once the debt reaches one, a
       cyclic turn is owed. PSI then reserves the next plastoquinone to come
       free (PSII runs first every tick and would take it otherwise) and the
       first turn it holds one goes round again. NEVER WAIT FOR ONE: both
       quinones can be reduced and waiting on b6f, which is waiting on the
       plastocyanins PSI is holding, and a PSI that held out for a quinone
       would lock the whole chain; the electrons go to NADP⁺ instead and the
       debt stands. A cyclic turn takes the plastocyanins' electrons to the
       stroma-side ridge where ferredoxin sits (not drawn) and on `occlude`
       sends them back into the membrane onto the reserved quinone, charged
       with two stroma protons; b6f then pumps for them again. No NADP⁺
       arrives and no NADPH leaves. */
    let cyclicDue = 0, cycNow = false, cycQ = null, held = null;
    const share = () => Math.max(0, Math.min(1, P.cyclic || 0));
    const owed = () => share() > 0 && cyclicDue >= 1;
    const ridgeAt = () => ({ x: xs.PSI, y: -pumpDir() * RIDGE_PSI.userData.baseY, z: 0 });
    /* Polled while PSI idles at binding: hold a quinone while a turn is owed, let it go when not. */
    function cyclicWatch() {
      if (owed() && !held) held = K.shuttles.reserveQ('PSI');
      if (!owed() && held) { K.shuttles.releaseQ(held); held = null; }
      return true;
    }
    function cyclicDecide() {
      cycNow = false;
      if (!held || !owed()) return;
      const q = held; held = null;
      cyclicDue -= 1; cycNow = true;
      q.reservedFor = null; q.state = 'toDonor'; q.charged = false; q.to = K.shuttles.qDock('PSI', q.x, q.i); cycQ = q;
    }
    /* The debt grows as a turn ends, so the share is counted against turns taken. */
    const cyclicOwe = () => { cyclicDue = Math.min(1, cyclicDue + share()); };
    function cycleBack() {
      const q = cycQ; cycQ = null;
      lightLedger.cyclicTurns++;
      if (q) K.electrons.sendE(K.electrons.E_PER_TURN, ridgeAt(), [{ x: xs.PSI - 8, y: -pumpDir() * (CX.PSI.height + 2), z: 0 }, K.shapes.midOf('PSI', -6)], q,
        () => { q.charged = true; K.shuttles.protonateQ(q); });
      eng.emit('cyclic', lightLedger.cyclicTurns);
    }

    /* ---- the three machines ---- */
    const RUN = {
      PSII: K.donor('PSII', 'light', { eFrom: () => oecAt(), onLoad: () => { flash('PSII'); waterArrive(); }, onOcclude: () => { flash('PSII'); splitWater(); } }),
      b6f: K.hub('b6f'),
      PSI: K.terminal('PSI', {
        rate: () => credit.PSI > 0 ? 1 : lightRate(),
        ready: cyclicWatch,
        load: cyclicDecide,
        site: () => cycNow ? ridgeAt() : chips.PSI ? posOf(chips.PSI) : faceOf('PSI', -1),
        onLoad: () => { flash('PSI'); if (!cycNow) K.carrierArrive('PSI', NADP); },
        onOcclude: () => { flash('PSI'); if (cycNow) cycleBack(); else reduceNADP(); cyclicOwe(); },
        onWrap: () => { if (credit.PSI > 0) credit.PSI--; },
      }),
    };

    /* One flash: PSII turns once and PSI owes a turn. The light has no
       token, so nothing waits and nothing is drawn arriving. */
    function feed(fuel) {
      if (!K.hasChain(P.proteins)) return false;
      const f = fuel || P.fuel || 'light';
      if (!FUELS[f]) { console.warn('LightReactions: no fuel named ' + f + '; have ' + Object.keys(FUELS).join(', ')); return false; }
      if (split()) { const ok = K.feedSplit('PSII', f, null); if (ok) credit.PSI++; return ok; }
      return K.feedLumped(f, null);
    }

    /* ---- the words ---- */
    function cards(library) {
      library.outside.card = 'The stroma, around the outside of the thylakoid disc. ATP and NADPH are made here, and the Calvin cycle spends both to fix carbon. Protons leave from this side and come back through the synthase.';
      library.complex.text = split() ? 'cytochrome b6f' : 'the light-driven chain';
      library.complex.card = split() ? library.b6f.card
        : 'Photosystem II splits water and starts the electrons moving, cytochrome b6f is the one that pumps, and photosystem I lifts them again for NADPH. Drawn as one machine. Light is the fuel, so the dimmer is a rate knob and darkness stops it.';
      library.inside.card  = 'The lumen, the space enclosed by the disc. Light drives protons in here, so this is the acidic side: the energy from the photons is now a gradient across this membrane.'
        + (split() ? ` ${protonsPerPair()} arrive per pair of electrons: ${CHAIN.PSII.fromWater} from water at PSII, ${CHAIN.b6f.pumps} pumped by b6f.` : '')
        + ' It is the same space as a mitochondrion\'s intermembrane space, both of them the OUTSIDE of the bacterium each organelle came from, which is why the two diagrams are mirrored.';
    }

    return K.plugin({
      runners: RUN, feed, cards,
      /* The oxygen-evolving complex on the lumen face, the ridge on the stroma face: placed by sign. */
      orient(d) {
        OEC.position.y = d * OEC.userData.baseY;
        RIDGE_PSI.position.y = -d * RIDGE_PSI.userData.baseY;
      },
      post: tickLight,
      state(base, s) {
        const sh = K.shuttles.counts(), sp = s.chain === 'split';
        return {
          protonsPerFuel: sp ? { light: protonsPerPair() } : null,
          shuttles: sp ? { plastoquinol: sh.reduced, plastocyaninLoaded: sh.loaded } : null,
          /* The light reactions' own ledger, split only: every count is an
             event that happened, and the ratios are the table's. `measured`
             ATP per NADPH is this run's, off the rotor against the ledger;
             it settles toward `expected` over a long run and is null before
             the first NADPH. */
          light: sp ? Object.assign({}, lightLedger, {
            photonsPerPair: photonsPerPair(), protonsPerO2: protonsPerO2(),
            cyclic: P.cyclic || 0, cyclicToBalance: cyclicToBalance(),
            atpPerNADPH: { linear: atpPerNADPH(0), expected: atpPerNADPH(P.cyclic || 0), calvin: CALVIN.atp / CALVIN.nadph,
                           measured: lightLedger.nadphMade ? +(s.atpMade / lightLedger.nadphMade).toFixed(2) : null },
          }) : null,
        };
      },
      reset() { for (const k in lightLedger) lightLedger[k] = 0; },
      anchors: {
        psii:     () => split() && P.proteins.PSII ? K.at(xs.PSII, H_() * 0.98) : null,
        b6f:      () => split() && P.proteins.b6f ? K.at(xs.b6f, H_() * 0.98) : null,
        psi:      () => split() && P.proteins.PSI ? K.at(xs.PSI, H_() * 0.98) : null,
        plastoquinone: () => K.shuttles.qTokens.length ? K.shuttles.qTokens[0].obj.position : null,
        plastocyanin:  () => K.shuttles.cTokens.length ? K.shuttles.cTokens[0].obj.position : null,
        nadph:    () => chips.PSI ? chips.PSI.obj.position : null,
        'water.split': () => split() && P.proteins.PSII ? K.at(oecAt().x, oecAt().y) : null,
        oxygen:   () => psiiO2.length ? psiiO2[0].obj.position : null,
      },
      library: {
        psii: { text: 'photosystem II', offset: [-44, -30],
          card: `Light knocks an electron loose, and PSII refills the hole from water, on its lumen face. Each water gives ${CARRIES.H2O} electrons and ${CHAIN.PSII.fromWater} protons, which stay in the lumen, and every two waters leave one O₂. It pumps nothing: its protons come out of water, not across the membrane. The electrons go on to plastoquinone.` },
        b6f: { text: 'cytochrome b6f', offset: [-10, -40],
          card: `The one pump in the chain, and a close relative of the mitochondrion's complex III. It takes the pair from plastoquinol and hands them to plastocyanin one at a time; ${CHAIN.b6f.pumps} protons end up in the lumen per pair, by the same Q cycle: some ride in on plastoquinol, the rest are taken from the stroma, and no channel opens. As the lumen turns acidic it slows, so the chain cannot outrun the synthase.` },
        psi: { text: 'photosystem I', offset: [40, -34],
          card: `A second photon lifts each electron again, higher than PSII could, high enough to reduce NADP⁺. On its stroma face, ferredoxin and the enzyme FNR (not drawn) make NADPH from NADP⁺, two electrons and one proton from the stroma. PSI pumps nothing either. Some turns send the electrons back to plastoquinone instead, so b6f pumps for them twice: that cyclic flow is how the chloroplast makes the extra ATP the Calvin cycle needs beyond ${atpPerNADPH(0).toFixed(1)} per NADPH.` },
        plastoquinone: { text: 'plastoquinone', offset: [-40, 26],
          card: 'A small oily molecule that moves inside the membrane. It picks up two electrons at PSII, becomes plastoquinol, delivers them to b6f and goes back for more. It does the job ubiquinone does in a mitochondrion.' },
        plastocyanin: { text: 'plastocyanin', offset: [36, 30],
          card: 'A small copper protein in the lumen. It carries one electron at a time from b6f to PSI, so b6f loads two per pair, and it comes back empty.' },
        nadph: { text: 'NADPH', offset: [40, -26],
          card: 'The other product of the light reactions, made in the stroma beside the ATP. The Calvin cycle spends both to turn CO₂ into sugar, and the NADP⁺ comes back to be filled again.' },
        'water.split': { text: 'water is split here', offset: [-44, 26],
          card: 'The oxygen-evolving complex, a cluster of manganese on PSII\'s lumen face. It strips electrons from water one at a time and keeps the protons in the lumen. Nothing else in biology can pull electrons off water.' },
        oxygen: { text: 'oxygen', offset: [42, -34],
          card: 'Waste. PSII pulls electrons out of water, and what is left of two waters is one O₂, which leaves the chloroplast. Every breath you take was split out of water this way.' },
      },
      proteinKey: {
        PSII:     { name: 'photosystem II', color: hex(PHO.psii) },
        b6f:      { name: 'cytochrome b6f (pumps H⁺)', color: hex(PHO.b6f) },
        PSI:      { name: 'photosystem I', color: hex(PHO.psi) },
      },
      carries: { PSII:[], b6f:['H'], PSI:[] },
    });
  }

  /* ---- the sim ----
     A create with no params is a thylakoid in the light: a complex, a
     synthase, and a gradient's worth of protons. Light is the fuel, because
     NADH in a chloroplast is a page that will not turn. */
  function defaultProteins(chain) {
    return chain === 'split' ? { complex:{ x:-60 }, synthase:{ x:80 } } : { complex:{ x:-80 }, synthase:{ x:40 } };
  }
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet || !global.Circuit) throw new Error('LightReactions: load membrane/parts.js, membrane/sheet.js and chemiosmosis/circuit.js first');
    const P = Object.assign({ componentName: 'LightReactions' }, global.Sheet.DEFAULTS, global.Circuit.DEFAULTS, DEFAULTS,
      { potential: 'nernst', fuel: 'light' }, opts, { context: 'thylakoid' });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    P.proteins = Object.assign({}, opts.proteins || defaultProteins(P.chain));
    return global.Sheet.create(THREE, root, camera, P, [machine]);
  }
  const SIGNALS = Object.assign({}, global.Circuit ? global.Circuit.SIGNALS : {});
  function mount(el, params = {}) {
    return global.Circuit.mount(el, params, { name: 'LightReactions', context: 'thylakoid', other: 'ElectronTransport', create, signals: SIGNALS, api: ['feed'] });
  }

  global.LightReactions = { create, mount, machine, DEFAULTS, SIGNALS,
    RING, CALVIN, FUELS, CHAIN, CARRIES, chainPath: path, protonsPerPair, photonsPerPair, protonsPerO2,
    protonsPerNADPH, atpPerNADPH, photonsPerNADPH, cyclicToBalance };
  if (global.Circuit) global.LightReactions.SCALE = global.Circuit.SCALE();
  if (typeof module !== 'undefined' && module.exports) module.exports = global.LightReactions;
})(typeof globalThis !== 'undefined' ? globalThis : this);
