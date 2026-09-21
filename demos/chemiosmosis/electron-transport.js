/* =============================================================================
 *  chemiosmosis/electron-transport.js — the respiratory chain, as a component
 * =============================================================================
 *  A mitochondrion's inner membrane: NADH and FADH₂ hand their electrons to
 *  the chain, the chain pumps protons into the intermembrane space, ATP
 *  synthase spends the gradient, oxygen takes the electrons at the end, and
 *  the ATP made in the matrix has doors to get out by.
 *
 *      ElectronTransport.create(THREE, root, camera, opts)   the sim
 *      ElectronTransport.mount(el, params)                   one box, one handle
 *
 *  The plumbing is chemiosmosis/circuit.js, a Circuit.kit built inside
 *  `machine`; the arithmetic it runs on is membrane/chemiosmosis.js. What is
 *  here is respiration's own physics, and the top of the file holds it with
 *  no THREE so chemiosmosis/check-electron-transport.js can run it in node:
 *
 *      RING                 a mammal's c8 ring, drawn as 9 H⁺ per 3 ATP
 *      CHAIN                complexes I–IV: protons pumped per pair, 4 / 0 / 4 / 2
 *      FUELS                NADH and FADH₂, what each becomes, how hard it drives
 *      PROTONS_PER_EXPORT   the translocase's charge on every ATP
 *      protonsPer(fuel) · atpPer(fuel)   walked off the table, never typed
 *
 *      proteins: { I | II | III | IV | synthase | leak | translocase: {x} | null }
 *                 or complex: {x}, the chain's centre, spread into I–IV
 *
 *  THE WHOLE CHAIN, ALWAYS: complexes I, II, III and IV, ubiquinone moving
 *  in the membrane from I or II to III, cytochrome c on the outer face from
 *  III to IV. NADH docks at I and FADH₂'s electrons enter at II, which
 *  pumps nothing. How far out is the one dial:
 *
 *      span   'inner'          the inner membrane alone
 *             'mitochondrion'  plus the outer membrane with a porin, and a
 *                              translocase, so the ATP visibly gets out
 *             'cell'           plus a plasma membrane above the cytosol whose
 *                              Na⁺/K⁺ pump spends each ATP that arrives. mount()
 *                              only; it builds two sims in one box, and changing
 *                              to or from it rebuilds the box
 *
 *  A `span` change snaps; nothing tweens across a relayout.
 *
 *  Events: `pumped` (protons thrown out so far), `atp` (made, in the matrix),
 *  `atpOut` (cleared the last door on stage), `atpDelivered` (reached atpTo),
 *  `o2Left` (a stocked O₂ set off), and with span:'cell' `spent` (the pump
 *  turned on one) and `turn`/`turned`.
 * ========================================================================== */
(function (global) {
  'use strict';
  const CHEM = global.Chemiosmosis;
  if (!CHEM) throw new Error('electron-transport.js: load membrane/chemiosmosis.js first');

  /* ---- the arithmetic, free of THREE ----
     STOICHIOMETRY. Mammalian F1Fo has a c8 ring: 8 H⁺ per 3 ATP, so ~2.7 H⁺
     per ATP. Drawn as 9 per 3, because a third of a turn has to be a whole
     number of protons for a student to see the ratio at all, and with the
     export cost below that is the textbook's 2.5 ATP per NADH. Declared, not
     hidden; a page may print it. */
  const RING = { c: 8, protonsPerTurn: 9, atpPerTurn: 3 };
  /* GETTING THE ATP OUT COSTS ONE MORE. The translocase's ATP⁴⁻-for-ADP³⁻
     swap spends the membrane voltage, and phosphate comes back in with a
     proton: about one proton per ATP exported. With it, NADH's 10 buy about
     2.5 ATP and FADH₂'s 6 about 1.5; without it, 3.3 and 2. */
  const PROTONS_PER_EXPORT = 1;
  /* WHAT THE FUEL BECOMES once the chain has taken its electrons. A carrier
     is not consumed: it hands over and goes back for more, and the returning
     NAD⁺ is what lets the Krebs cycle keep turning. `weight` scales the turn
     rate, never the stoichiometry. */
  const FUELS = {
    NADH:  { weight: 1,   label: 'NADH',  spent: 'NAD⁺' },
    FADH2: { weight: 0.6, label: 'FADH₂', spent: 'FAD' },
  };
  /* THE CHAIN, SPLIT: `pumps` is protons moved matrix → intermembrane space
     per PAIR of electrons through that complex, the textbook's 4 / 0 / 4 / 2.
     Each complex turns once per pair, so a turn pumps exactly `pumps`.

       I    NADH → Q        pumps 4
       II   FADH₂ → Q       pumps 0   succinate dehydrogenase; its FAD is bound
       III  QH₂ → cyt c     pumps 4   net of the Q cycle: 2 ride in on QH₂, 2 from the matrix at Qi
       IV   cyt c → O₂      pumps 2   plus 2 matrix H⁺ per pair into water,
                                      which is chemistry and not pumping

     A fuel's worth is the sum along its path, and that sum is the whole of
     why FADH₂ buys less ATP than NADH: it enters past complex I. Walked off
     this table rather than typed; the checker asserts 10 and 6.
     `carries` is electrons per shuttle trip: Q takes the pair, cytochrome c
     takes one, so complex III sends two cytochromes for every ubiquinol. */
  const CHAIN = {
    I:   { takes: 'NADH',  gives: 'Q',    pumps: 4 },
    II:  { takes: 'FADH2', gives: 'Q',    pumps: 0 },
    III: { takes: 'Q',     gives: 'cytc', pumps: 4 },
    IV:  { takes: 'cytc',  gives: 'O2',   pumps: 2 },
  };
  const CARRIES = { NADH: 2, FADH2: 2, Q: 2, cytc: 1 };
  const ACCEPTOR = 'O2';
  const path = fuel => CHEM.chainPath(CHAIN, fuel, ACCEPTOR);
  /* Protons that end up in the intermembrane space per pair, and the ATP
     they buy once each one has paid its way out. */
  const protonsPer = fuel => path(fuel).reduce((s, k) => s + CHAIN[k].pumps, 0);
  const atpPer = fuel => protonsPer(fuel) / (RING.protonsPerTurn / RING.atpPerTurn + PROTONS_PER_EXPORT);

  const DEFAULTS = {
    oxygen: true,             // false: the chain has no final electron acceptor and stops
    /* A STOCK OF O₂ that runs down: that many wait in the intermembrane space,
       each one used is gone, and at zero the chain stops as with no oxygen.
       6 is one glucose's worth. null draws one whenever it is needed. */
    o2Stock: null,
    /* 'intro' drops what an intro course never names: FADH₂ docks at complex
       II instead of succinate, and the cards say what each part does without
       its chemistry. A simplification: that FAD is bound in the enzyme. */
    names: 'full',            // 'full' | 'intro'
    /* THE OUTER MEMBRANE IS A BACKDROP, not a second sim: a sheet with a
       porin in it, so the intermembrane space is a space with a lid. Nothing
       crosses it but the ATP. */
    outerMembrane: false,
  };
  const LINE = { keys: ['I', 'II', 'III', 'IV'], donors: { I: 'NADH', II: 'FADH2' }, rest: 'II', hub: 'III', end: 'IV', stands: 'I',
                 q: ['Q', 'QH₂'], c: 'cyt c' };
  /* Where each complex stands about the chain's centre. Tuned against the default camera. */
  const OFFSETS = [-75, -25, 25, 75];
  /* One blue for I, III and IV and a paler one for II, palette.js's rule.
     The shapes are a schematic whose one job is to be told apart: I is the
     biggest and has the long arm hanging into the matrix where NADH docks;
     II, III and IV are built from their structures, in `build`. */
  const III_DROP = 34;   // how far bc1's core hangs below the membrane's centre, past HALF

  function machine(eng) {
    const RESP = global.MolLib.PALETTE.respiration;
    const SPEC = {
      I:   { R: 16.5, lobes: 3, lobe: 0.12, color: RESP.complex },
      II:  { R: 9.0,  lobes: 2, lobe: 0.10, color: RESP.complexII },
      III: { R: 11.5, lobes: 2, lobe: 0.05, color: RESP.complex },
      IV:  { R: 16.0, lobes: 0, lobe: 0,    color: RESP.complex, over: 5 },
    };
    const { THREE, P, HALF, rnd, travellers, seat, root } = eng;
    const pumpDir = eng.pumpDir;
    const Parts = global.Parts;
    const K = global.Circuit.kit(eng, {
      name: 'ElectronTransport', context: 'mitochondrion', ring: RING, line: Object.assign({ qColor: RESP.quinone, cColor: RESP.cytc }, LINE),
      table: CHAIN, carries: CARRIES, shapes: SPEC, offsets: OFFSETS, fuels: FUELS,
      /* COMPLEX II IS NOT A PUMP, so it is not drawn on the pump's lathe.
         Succinate dehydrogenase (PDB 1ZOY) is mostly a soluble head in the
         matrix, the flavoprotein SdhA, where succinate meets the bound FAD,
         on the iron-sulfur SdhB, drawn as one below. The small anchor, SdhC
         and SdhD, does span the bilayer, but as a solid bundle of six helices
         with the ubiquinone site near the matrix face and no path for a proton.
         COMPLEX III (bc₁, PDB 1BGY) IS AN OBLIGATE DIMER with no proton
         channel: it moves protons by the Q cycle, at quinone sites inside the
         membrane. A pear: a dimer's width through the bilayer, swelling below
         into the core proteins, most of its mass, hanging further into the
         matrix than the membrane is thick.
         COMPLEX IV (PDB 1OCC) WORKS AS A MONOMER and IS a pump, so it keeps
         the lathe and its gates, but squat and wide: mostly buried. */
      build: (key, H) => key === 'II' ? H.solidPart(SPEC.II.color, 6.8, HALF + 1.5, 1.35)   // SdhC beside SdhD
        : key === 'III' ? H.lathePart(SPEC.III.color, { top: HALF + 2, bottom: -(HALF + III_DROP), rTop: 8.5, rMax: 17, sx: 1.3,
            /* the belly peaks below the matrix face; both ends round off */
            belly: y => Math.exp(-(((y + HALF + 15) / 14) ** 2)) })
        : null,
    });
    const { CX } = K.parts;
    const { knob, tagged, untag, dropToken, relabel, fade, approach, follow, posOf, faceOf, midOf, hex, buildToken } = K.shapes;
    const xs = K.geom.xs, H_ = K.geom.H_;
    const { chips, pulse, waiting } = K;

    /* ---- what hangs off the complexes ----
       Complex I's arm in the matrix, where NADH docks; one head for SdhA and
       SdhB together; on III, cytochrome c₁ and the Rieske head make a low
       knob where cytochrome c docks, and on IV subunit II's Cu_A domain. */
    const ARM_I = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(RESP.complex));
    ARM_I.scale.set(1, 2.1, 1); ARM_I.position.x = -5; ARM_I.userData.baseY = CX.I.height + 12;
    CX.I.group.add(ARM_I);
    const II_HEAD_R = 9, II_HEAD_Y = HALF + 1.5 + II_HEAD_R - 1;
    const HEAD_II = new THREE.Group();
    const SDH = new THREE.Mesh(new THREE.SphereGeometry(II_HEAD_R, 20, 14), Parts.flat(RESP.complexII));
    SDH.userData.baseY = II_HEAD_Y;
    HEAD_II.add(SDH);
    CX.II.group.add(HEAD_II);
    const III_C1 = HALF + 3;
    const KNOBS = {
      III: [knob(RESP.complex, 6, -5, III_C1, 1, 0.8), knob(RESP.complex, 4.5, 7, III_C1 - 1, 1, 0.8)],
      IV:  [knob(RESP.complex, 6.5, -4, CX.IV.height + 2, 1, 0.85)],
    };
    for (const k in KNOBS) CX[k].group.add(...KNOBS[k]);
    /* where cytochrome c sits: on c₁ at III, on Cu_A at IV */
    const C_HALF = 3.4 * 0.8;   // the oblong cyt c token's half-height
    K.hooks.cSeat = key => key === 'III' ? III_C1 + 6 * 0.8 + C_HALF - 0.5 : key === 'IV' ? CX.IV.height + 2 + 6.5 * 0.85 + C_HALF - 0.5 : H_() + 7;

    /* THE ADP/ATP TRANSLOCASE, the answer to "how does the ATP get out". The
       F1 head hangs in the matrix, so the ATP is MADE in the matrix, and a
       charged nucleotide does not cross a bilayer. One ATP out for one ADP
       in. A monomer, so it does not read as a member of the chain.
       NOT DRAWN: that the swap is ELECTROGENIC (ATP⁴⁻ out for ADP³⁻ in); the
       card says it, and a charge count here would move mV on a stage where
       mvPerIon is a timing knob rather than a measurement. */
    const holeOf = (R, lobe) => R * (1 + lobe) + 0.5;
    const ANT_R = 10.0, ANT_LOBE = 0.08;
    const ANT = Parts.transporter({ half:HALF, site:5.4, mouth:7.0, radius:ANT_R, lobes:0, color:RESP.translocase });
    root.add(ANT.group);
    let antX = null;

    /* ---- the outer membrane, and the porin in it ----
       A SECOND SHEET AND NO SECOND PHYSICS. The porin passes anything small,
       so the space between the membranes is continuous with the cytosol and
       the ATP is home once it is through. OUTER_GAP is drawn, not measured:
       wide enough that the protons pumped into it are visibly SITTING there,
       tuned against the F1 head, and tall enough that a band's name sits
       clear of both sheets' names. */
    const OUTER_GAP = STACK.OUTER_GAP;
    const POR_R = 6.6, POR_HOLE = 8.4;
    const PORIN = Parts.transporter({ half:HALF * 0.62, over:4.0, wall:2.2, site:4.9, mouth:5.4, radius:POR_R, lobes:0, color:RESP.porin });
    root.add(PORIN.group);
    let OUTER = null, porinX = null;
    const outerOn = () => !!P.outerMembrane && P.context === 'mitochondrion';
    const outerY = () => pumpDir() * OUTER_GAP;
    const _out = new THREE.Vector3();
    function buildOuter(tint) {
      if (OUTER) { root.remove(OUTER.group); OUTER = null; }
      PORIN.group.visible = outerOn();
      if (!outerOn()) { porinX = null; return; }
      /* INBOARD of the door it feeds, and offset so the ATP's two crossings
         do not stack into one vertical line read as a single pore. */
      const synthX = K.geom.synthX();
      porinX = (antX != null ? antX : synthX != null ? synthX : 0) - 38;
      /* CONCENTRIC WITH THE INNER SHEET, so the space is one width all along. */
      OUTER = Parts.membrane({ half:HALF * 0.62, reach:P.reach, head:tint.head, tail:tint.tail,
        bowR:eng.BOW ? eng.BOW + OUTER_GAP : 0,
        exclude:(x, z) => Math.hypot(x - porinX, z) - POR_HOLE });
      OUTER.group.position.y = outerY();
      root.add(OUTER.group);
      _out.set(porinX, 0, 0);
      const th = OUTER.bend(_out);
      PORIN.group.position.set(_out.x, _out.y + outerY(), 0);
      PORIN.group.rotation.z = -th;
      PORIN.setGates(1, 1);
      OUTER.cut.enable(eng.cut);
    }

    /* ---- the ATP's way out ----
       matrix → translocase → intermembrane space → porin → cytosol, with an
       ADP the other way at the swap. EXPORT IS PAID IN PROTONS, charged when
       the ATP is made rather than when a drawn one reaches the door, because
       the drawn ones are capped and every ATP made has to leave. A
       pumped-side proton comes home at the translocase, which turns no
       rotor. No translocase on stage, no charge. */
    let protonsForExport = 0;
    K.hooks.atpLegs = () => {
      const d = pumpDir(), legs = [];
      if (antX != null) {
        legs.push({ x:antX, y:-d * (HALF + 15) });
        legs.push({ x:antX, y: d * (HALF + 15), on: () => releaseADP(antX) });
      }
      if (outerOn()) {
        legs.push({ x:porinX, y: d * (OUTER_GAP - HALF * 0.62 - 7) });
        legs.push({ x:porinX, y: d * (OUTER_GAP + HALF * 0.62 + 9), out:true });
      }
      return legs;
    };
    K.hooks.onATP = function exportCost() {
      if (antX == null) return;
      const d = pumpDir();
      for (let i = 0; i < PROTONS_PER_EXPORT; i++) {
        const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === d);
        if (!pool.length) return;
        const t = pool.reduce((a, b) => (Math.abs(a.x - antX) < Math.abs(b.x - antX) ? a : b));
        t.x = antX + rnd(-10, 10); t.y = -d * (HALF + 12); t.z = rnd(-8, 8);
        t.obj.position.set(t.x, t.y, t.z);
        t.bounded = true; eng.repick(t); t.vy = Math.abs(t.vy) * -d;
        protonsForExport++; eng.crossed.H -= d; eng.chargeOut -= d;
        K.doors.reMV();
      }
    };
    function releaseADP(atX) {
      const d = pumpDir();
      K.atp.launchNucleotide(2, atX, d * (HALF + 15), [{ x:atX, y:-d * (HALF + 15) }, { x:atX - 44, y:-d * (HALF + 34), fade:true }]);
    }

    /* ---- the carriers ----
       AT COMPLEX II THE TOKEN IS SUCCINATE. The FAD there is bound inside the
       enzyme and never leaves it: what arrives from the Krebs cycle is
       succinate, and what leaves is fumarate.
       THE GLYCEROL-PHOSPHATE SHUTTLE: cytosolic NADH cannot enter the matrix,
       so it comes down through the outer membrane into the intermembrane
       space, and its electrons reach ubiquinone at the OUTER face, past
       complex I. Drawn docking on the outer face at complex II's place: the
       shuttle's own enzymes (cytosolic and mitochondrial glycerol-3-phosphate
       dehydrogenase) are not drawn, and the pair lands on Q as FADH₂'s does. */
    function shuttleDock() {
      /* sits on the cap of II's anchor (HALF + 1.5), the token's half height (3.6) above it, less a little so it touches */
      const d = pumpDir(), x = xs.II, y = HALF + 1.5 + 3.1;
      return { from:{ x:x - 14, y:d * (y + 26) }, at:{ x, y:d * y }, away:{ x:x - 34, y:d * (y + 28) } };
    }
    function dockOf(key) {
      const d = pumpDir(), H = H_();
      /* NADH binds at the tip of complex I's matrix arm: the arm (ARM_I) is a
         2.1-stretched sphere of 6.5 centred H + 12 down and tilted 0.45 rad,
         so its far end is about 1 right and H + 24 down; the token's half
         height past that, less a little so it touches. */
      if (key === 'I') { const x = xs.I; return { from:{ x:x - 20, y:-d * (H + 52) }, at:{ x:x + 1, y:-d * (H + 27) }, away:{ x:x - 30, y:-d * (H + 54) } }; }
      /* II's substrate meets the FAD in the head: the token (half width 6.7) against its side */
      const x = xs.II, y = II_HEAD_Y, ax = II_HEAD_R + 6.7 - 1;
      return { from:{ x:x - ax - 10, y:-d * (y + 24) }, at:{ x:x - ax, y:-d * y }, away:{ x:x - ax - 24, y:-d * (y + 26) } };
    }
    function tokenFor(key, f, opts = {}) {
      if (!f || !FUELS[f]) return null;
      if (opts.shuttle) return { label: FUELS[f].label, spent: FUELS[f].spent, color: RESP.carrier, lobes: 2, fuel: 'FADH2', shuttle: true,
        dock: shuttleDock,
        /* a shuttled NADH starts in the cytosol, above the outer membrane, and its NAD⁺ stays on that side */
        y0: () => pumpDir() * (outerOn() ? OUTER_GAP + 30 : H_() + 50),
        band: () => ({ lo: HALF + 12, hi: outerOn() ? OUTER_GAP - 12 : H_() + 60 }) };
      const succ = key === 'II' && P.names !== 'intro';
      return { label: succ ? 'succinate' : FUELS[f].label, spent: succ ? 'fumarate' : FUELS[f].spent, color: RESP.carrier, lobes: succ ? 1 : 2, fuel: f,
               dock: () => dockOf(key) };
    }
    K.hooks.token = (key, f) => tokenFor(key, f);

    /* ---- oxygen, where the electrons end ----
       COMPLEX IV AT ITS REAL RATIO: O₂ + 4e⁻ + 4H⁺ → 2H₂O. A turn brings two
       electrons, so ONE O₂ STAYS BOUND THROUGH TWO TURNS.
       EVERYTHING RESPECTS THE GATES. O₂ is nonpolar and reaches the heme a₃ /
       Cu_B site through a hydrophobic channel from the bilayer, so it comes
       down from the cytosol into the membrane beside IV and slides in
       sideways, never through a proton door. The two substrate H⁺ of a turn
       enter from the matrix while the matrix side is open (load-H),
       alongside the pumped ones. Water forms in the site when the fourth
       electron lands and leaves to the matrix only once that side reopens
       (open-in).
       THE PROTONS THAT JOIN IT ARE DRAWN, NOT DEBITED: the drawn pool is the
       gradient's whole budget, and emptying it here would stall the chain
       for a reason that is not biology. */
    const O2_SPEED = 40, WATER_FADE = 1.2, WATER_MAX = 24, SNAP = 9;
    const E_PER_O2 = CHEM.E_PER_O2, E_PER_TURN = K.electrons.E_PER_TURN;
    let o2 = null;
    const o2Riders = [], waters = [];
    const o2X = () => xs.IV;
    const ivH = () => CX.IV.height;
    const ivR = () => SPEC.IV.R;
    const o2Site = () => ({ x: o2X() + 3, y: -pumpDir() * HALF * 0.35, z: 0 });
    /* O₂ is always around, so it sets off when a carrier is sent, not when
       IV is ready: by the time electrons reach IV it is in the membrane. */
    const o2Waiting = [];
    let o2Stocked = false;   // laid out on the first tick, once IV has a position
    const stocked = () => P.o2Stock != null;
    /* Electrons can reach IV: oxygen on, and, with a stock, one left to take them. */
    const o2Ok = () => P.oxygen !== false && (!stocked() || !!o2 || o2Waiting.length > 0);
    function o2Stockpile(n) {
      o2Stocked = true;
      for (const w of o2Waiting) dropToken(w.obj);
      o2Waiting.length = 0;
      if (n == null || !P.showFuel || P.context !== 'mitochondrion') return;
      const d = pumpDir(), lo = ivH() + 10, hi = outerOn() ? OUTER_GAP - 10 : ivH() + 50;
      for (let i = 0; i < n; i++) {
        const w = { obj: eng.smallMolecule('o2'), x: o2X() + rnd(-90, 90), y: d * rnd(lo, hi), vx: rnd(-6, 6), vy: rnd(-4, 4), lo, hi };
        root.add(w.obj); seat(w.obj, w.x, w.y, 0); o2Waiting.push(w);
      }
    }
    /* WHILE A SUPPLY RUNS, BREATHING REFILLS IT: a used O₂ is replaced by one
       drifting in from the cytosol. A one-shot feed() does not refill, so a
       page counting a glucose's worth sees the stock run down. */
    const O2_REFILL_S = 1.5;
    let refillT = 0;
    function tickO2Waiting(dt) {
      const d = pumpDir(), x0 = o2X();
      const supplied = stocked() && P.fuel && FUELS[P.fuel] && P.fuelRate > 0 && P.oxygen !== false;
      if (supplied && o2Waiting.length + (o2 ? 1 : 0) < P.o2Stock && P.showFuel && P.context === 'mitochondrion') {
        refillT += dt;
        if (refillT >= O2_REFILL_S) {
          refillT = 0;
          const lo = ivH() + 10, hi = outerOn() ? OUTER_GAP - 10 : ivH() + 50;
          const w = { obj: eng.smallMolecule('o2'), x: x0 + rnd(-90, 90), y: d * (hi + 26), vx: rnd(-6, 6), vy: -d * 6, lo, hi, entering: true };
          root.add(w.obj); seat(w.obj, w.x, w.y, 0); o2Waiting.push(w);
        }
      } else refillT = 0;
      for (const w of o2Waiting) {
        if (w.entering) {
          w.y -= d * 14 * dt; seat(w.obj, w.x, w.y, 0);
          if (d * w.y <= w.hi) w.entering = false;
          continue;
        }
        w.vx = Math.max(-8, Math.min(8, w.vx + rnd(-20, 20) * dt + (x0 - w.x) * 0.02 * dt));
        w.vy = Math.max(-6, Math.min(6, w.vy + rnd(-20, 20) * dt));
        w.x += w.vx * dt; w.y += w.vy * dt;
        const h = d * w.y;
        if (h < w.lo) { w.y = d * w.lo; w.vy = d * Math.abs(w.vy); }
        if (h > w.hi) { w.y = d * w.hi; w.vy = -d * Math.abs(w.vy); }
        seat(w.obj, w.x, w.y, 0);
      }
    }
    function o2Spawn() {
      if (!P.showFuel || P.oxygen === false || o2) return;
      const d = pumpDir(), side = o2X() + ivR() + 12;
      if (stocked()) {
        if (!o2Waiting.length) return;
        o2Waiting.sort((a, b) => Math.abs(a.x - side) - Math.abs(b.x - side));
        const w = o2Waiting.shift();
        const obj = new THREE.Group(); w.obj.position.set(0, 0, 0); w.obj.rotation.set(0, 0, 0); obj.add(w.obj);   // seat() placed it in world units
        root.add(obj); relabel(obj, 'O₂', 7.0);
        o2 = { obj, x: w.x, y: w.y, path: [{ x: side, y: d * (ivH() + 8) }, { x: side, y: -d * (HALF * 0.35) }, o2Site()], electrons: 0, bound: false };
        seat(obj, o2.x, o2.y, 0); eng.emit('o2Left', o2Waiting.length);
        return;
      }
      /* From the cytosol, where it arrives from the blood: across the outer
         membrane (lipid, freely) and the intermembrane space, into the
         inner bilayer beside IV, then sideways into the site. */
      const top = outerOn() ? OUTER_GAP + 16 : ivH() + 30;
      const path = [{ x: side, y: d * (ivH() + 8) }, { x: side, y: -d * (HALF * 0.35) }, o2Site()];
      o2 = { obj: tagged(eng.smallMolecule('o2'), 'O₂'), x: side + 10, y: d * top, path, electrons: 0, bound: false };
      root.add(o2.obj); seat(o2.obj, o2.x, o2.y, 0);
    }
    function o2Arrive() {
      if (!P.showFuel || !o2Ok()) return;
      o2Spawn();
      const d = pumpDir(), x = o2X();
      /* this turn's two substrate protons, at the open matrix mouth */
      for (let i = 0; i < E_PER_TURN; i++) {
        const r = { obj: eng.chargedIon('H'), x: x - 4 + i * 8, y: -d * (ivH() * 1.15 + 10), z: 0, i: o2Riders.length };
        root.add(r.obj); seat(r.obj, r.x, r.y, 0); o2Riders.push(r);
      }
    }
    function o2Reduce() {
      if (!o2 || o2.electrons >= E_PER_O2) return;
      o2.electrons += E_PER_TURN;
    }
    function toWater() {
      const at = o2Site();
      dropToken(o2.obj); o2 = null;
      for (const r of o2Riders) dropToken(r.obj);
      o2Riders.length = 0;
      for (const s of [-1, 1]) {
        const w = { obj: tagged(eng.smallMolecule('water'), 'H₂O'), x: at.x + s * 4, y: at.y, held: true, fade: 1 };
        untag(w.obj); root.add(w.obj); seat(w.obj, w.x, w.y, 0); waters.push(w);
      }
    }
    /* Called on IV's phase changes: waters wait in the site for the matrix side. */
    function o2Phase(phase) {
      if (phase !== 'open-in') return;
      const d = pumpDir();
      for (const w of waters) if (w.held) {
        w.held = false;
        relabel(w.obj, 'H₂O', 7.0);
        w.path = [{ x: o2X() + (w.x - o2X()) * 0.5, y: -d * (ivH() * 1.15 + 4) }, { x: w.x + Math.sign(w.x - o2X()) * 14, y: -d * (ivH() + 40) }];
      }
    }
    function tickO2(dt) {
      /* Cut off before any electrons reached it, the O₂ was never there. One
         already holding electrons stays bound, as it does in complex IV. */
      if (!o2Stocked) { o2Stocked = true; o2Stockpile(P.o2Stock); }
      tickO2Waiting(dt);
      if (o2 && P.oxygen === false && !o2.electrons) { dropToken(o2.obj); o2 = null; for (const r of o2Riders) dropToken(r.obj); o2Riders.length = 0; }
      const site = o2Site(), k = 1 - Math.exp(-dt * SNAP);
      if (o2) {
        if (follow(o2, dt, O2_SPEED) && !o2.bound) { o2.bound = true; untag(o2.obj); }
        if (o2.bound) { o2.x = site.x; o2.y = site.y; seat(o2.obj, o2.x, o2.y, 0); }
      }
      /* substrate H⁺ ease into the site like the pumped cargo does, so they
         are inside before the matrix gate finishes closing */
      for (const r of o2Riders) {
        const tx = site.x + (r.i % 2 ? 5 : -5), ty = site.y + pumpDir() * (r.i < 2 ? 3 : -3);
        r.x += (tx - r.x) * k; r.y += (ty - r.y) * k;
        seat(r.obj, r.x, r.y, 0);
      }
      if (o2 && o2.bound && o2.electrons >= E_PER_O2) toWater();
      for (let i = waters.length - 1; i >= 0; i--) {
        const w = waters[i];
        if (w.held) continue;
        if (!follow(w, dt, O2_SPEED * 0.7)) continue;
        /* THE WATER STAYS, as the result of the chain: it settles into the
           matrix and wanders there, and only its label fades. Past
           WATER_MAX the oldest one goes, so a long run does not flood. */
        const tag = w.obj.userData.tag;
        if (tag) {
          w.fade -= dt / WATER_FADE;
          tag.material.opacity = Math.max(0, w.fade);
          if (w.fade <= 0) untag(w.obj);
        }
        if (!w.vx) { w.vx = rnd(-5, 5); w.vy = rnd(-3, 3); }
        const dd = pumpDir(), floor = Math.min(P.bounds && P.bounds.down != null ? P.bounds.down : P.extent, P.extent) - 8;
        w.vx = Math.max(-6, Math.min(6, w.vx + rnd(-16, 16) * dt));
        w.vy = Math.max(-4, Math.min(4, w.vy + rnd(-16, 16) * dt));
        w.x += w.vx * dt; w.y += w.vy * dt;
        const depth = -dd * w.y, top = ivH() + 24;
        if (depth < top) { w.y = -dd * top; w.vy = -dd * Math.abs(w.vy); }
        if (depth > floor) { w.y = -dd * floor; w.vy = dd * Math.abs(w.vy); }
        seat(w.obj, w.x, w.y, 0);
        if (w.gone != null) { w.gone -= dt / WATER_FADE; fade(w.obj, w.gone); if (w.gone <= 0) { dropToken(w.obj); waters.splice(i, 1); } }
      }
      const settled = waters.filter(w => !w.held && w.gone == null);
      for (let i = 0; i < settled.length - WATER_MAX; i++) settled[i].gone = 1;
    }
    function clearO2() {
      if (o2) dropToken(o2.obj);
      o2 = null;
      for (const t of o2Riders.concat(waters)) dropToken(t.obj);
      o2Riders.length = 0; waters.length = 0;
    }
    K.hooks.resetChain = clearO2;

    /* ---- the four machines ---- */
    const d_ = pumpDir;
    const RUN = {
      I: K.donor('I', 'NADH', {
        eVia: () => [{ x: xs.I - 5, y: -d_() * (CX.I.height + 10) }, faceOf('I', -1), midOf('I')],
      }),
      II: K.donor('II', 'FADH2', {
        eVia: chip => chip && chip.shuttle ? [{ x: xs.II - 6, y: d_() * HALF * 0.5 }]
                                           : [{ x: xs.II, y: -d_() * II_HEAD_Y }, { x: xs.II, y: -d_() * HALF * 0.5 }],
      }),
      III: K.hub('III'),
      IV: K.terminal('IV', { rate: K.doors.backPressure, ready: () => o2Ok(), site: o2Site,
        onLoad: () => o2Arrive(), onOcclude: () => o2Reduce(), onPhase: o2Phase }),
    };

    /* ONE CARRIER, ONE TURN, independent of the supply switch: turn the
       supply off, send one, and watch it go through once: the one NADH turns
       I, the ubiquinol it makes turns III, and III's cytochromes turn IV.
       opts.shuttle: an NADH made in the cytosol, which enters at ubiquinone
       by the glycerol-phosphate shuttle and so is worth what FADH₂ is. */
    function feed(fuel, opts = {}) {
      if (!K.hasChain(P.proteins)) return false;
      const f = fuel || P.fuel || 'NADH';
      if (!FUELS[f]) { console.warn('ElectronTransport: no fuel named ' + f + '; have ' + Object.keys(FUELS).join(', ')); return false; }
      o2Spawn();
      const shuttle = !!opts.shuttle && f === 'NADH';
      const key = shuttle ? 'II' : Object.keys(LINE.donors).find(k => LINE.donors[k] === f);
      return K.feedAt(key, shuttle ? 'FADH2' : f, tokenFor(key, f, { shuttle }));
    }

    /* ---- the words ---- */
    const C = CHAIN;
    function cards(library) {
      library.outside.card = 'The intermembrane space. Every proton the complexes throw out lands here, so this side goes acidic and positive: that is where the energy from NADH now sits. This space and a chloroplast\'s thylakoid lumen are the same place by descent, both of them the OUTSIDE of the bacterium each organelle came from. That is why a photosynthesis diagram looks flipped against this one.';
      library.inside.card  = 'The matrix. The Krebs cycle runs here and hands its NADH to the complexes in this membrane. Protons leave from this side and come back through the synthase.';
      if (P.names === 'intro') for (const k in INTRO_CARDS) library[k].card = INTRO_CARDS[k];
    }
    const INTRO_CARDS = {
      'complex.I': 'NADH drops off two electrons here. Passing them on pays for pumping protons out.',
      'complex.II': 'FADH₂ drops off its electrons here. This complex pumps no protons, so FADH₂ builds less gradient than NADH.',
      'complex.III': 'Takes the electrons off ubiquinol and passes them to cytochrome c. The protons ubiquinol carried, and more from the matrix, are let out on the other side.',
      'complex.IV': 'Hands the electrons to oxygen, which becomes water. It pumps protons too. Block it and the whole chain stops.',
      quinone: 'A small carrier that moves electrons through the membrane.',
      cytc: 'A small carrier that moves electrons along the membrane surface to the last complex.',
      oxygen: 'The final electron acceptor. With no oxygen, electrons have nowhere to go and the chain stops.',
      synthase: 'A turbine. Protons flow back through it and it spins, making ATP.',
    };

    return K.plugin({
      runners: RUN, feed, cards,
      keys: { translocase: null },
      parts: [ANT],
      /* PORIN stands in the other sheet, and a barrel setCut leaves shut is
         the one solid object in a cutaway. */
      cutParts: [PORIN],
      tOrder: ['I', 'III', 'IV', 'II'],
      layout(pr, holes, PORES) {
        ANT.group.visible = !!pr.translocase;
        antX = pr.translocase ? pr.translocase.x : null;
        if (pr.translocase) { ANT.group.position.x = antX; ANT.setGates(1, 1);
          holes.push([antX, holeOf(ANT_R, ANT_LOBE)]); PORES.push({ x:antX, R:ANT_R, lumen:7.0, kind:null }); }
      },
      /* Complex I's arm and complex II's head hang into the matrix, the
         pear's belly on the loading side: positioned by sign. */
      orient(d) {
        ARM_I.position.y = -d * ARM_I.userData.baseY; ARM_I.rotation.z = 0.45 * d;
        for (const m of HEAD_II.children) m.position.y = -d * m.userData.baseY;
        CX.III.mesh.rotation.x = d > 0 ? 0 : Math.PI;
        for (const k in KNOBS) for (const m of KNOBS[k]) m.position.y = m.userData.side * d * m.userData.baseY;
      },
      afterSheet: buildOuter,
      setCut(on) { if (OUTER) OUTER.cut.enable(on); },
      post: tickO2,
      set(next) {
        let relay = false;
        if ('o2Stock' in next) { P.o2Stock = next.o2Stock; o2Stockpile(P.o2Stock); }
        if (next.span != null && next.span !== P.span) {
          P.span = next.span;
          if (next.outerMembrane == null) next.outerMembrane = P.span !== 'inner';
          if (P.span !== 'inner' && !P.proteins.translocase) {
            const right = Math.max(...Object.keys(P.proteins).filter(k => P.proteins[k]).map(k => P.proteins[k].x), 0);
            P.proteins = Object.assign({}, P.proteins, { translocase: { x: right + 60 } });
          }
          relay = true;
        }
        if (next.outerMembrane != null && !!next.outerMembrane !== !!P.outerMembrane) { P.outerMembrane = !!next.outerMembrane; relay = true; }
        return relay;
      },
      state(base, s) {
        const sh = K.shuttles.counts();
        return {
          span: P.span || (outerOn() ? 'mitochondrion' : 'inner'),
          outerMembrane: outerOn(),
          /* The third space, when there is one: above the outer membrane is
             neither half of this sim, and a caption that calls it "outside"
             has put the cytosol outside the cell. */
          sides: Object.assign(base.sides, { beyond: outerOn() ? 'the cytosol' : null }),
          protonsForExport,
          fuelRate: o2Ok() ? s.fuelRate : 0,
          oxygen: P.oxygen !== false, o2Left: stocked() ? o2Waiting.length + (o2 ? 1 : 0) : null,
          protonsPerFuel: { NADH: protonsPer('NADH'), FADH2: protonsPer('FADH2') },
          shuttles: { ubiquinol: sh.reduced, cytcLoaded: sh.loaded },
          stoichiometry: Object.assign(s.stoichiometry, { protonsPerExport: antX == null ? 0 : PROTONS_PER_EXPORT }),
        };
      },
      reset() { protonsForExport = 0; o2Stockpile(P.o2Stock); },
      lid: outerOn,
      /* THE CEILING ON THE COMPARTMENT BELOW IT, or the protons just pumped
         out drift straight through the outer sheet. */
      bandCap: () => outerOn() ? OUTER_GAP - 8 : Infinity,
      clearXs: () => outerOn() && porinX != null ? [porinX] : [],
      api: { get outer() { return OUTER; }, doors: { translocase: ANT, porin: PORIN } },
      layers: {
        outer: { label: 'the outer membrane', get: () => outerOn(), set: v => eng.set({ outerMembrane: !!v }) },
      },
      anchors: {
        'complex.I':   () => P.proteins.I ? K.at(xs.I, H_() * 0.98) : null,
        'complex.II':  () => P.proteins.II ? K.at(xs.II, -pumpDir() * II_HEAD_Y) : null,
        'complex.III': () => P.proteins.III ? K.at(xs.III, H_() * 0.98) : null,
        'complex.IV':  () => P.proteins.IV ? K.at(xs.IV, H_() * 0.98) : null,
        quinone:  () => K.shuttles.qTokens.length ? K.shuttles.qTokens[0].obj.position : null,
        cytc:     () => K.shuttles.cTokens.length ? K.shuttles.cTokens[0].obj.position : null,
        translocase: () => antX == null ? null : K.at(antX, ANT.height * 0.98),
        porin:    () => !outerOn() ? null : K.at(porinX, outerY() + pumpDir() * HALF * 0.9),
        cytosol:  () => !outerOn() ? null : K.at(eng.clearX(), outerY() + pumpDir() * 34),
        oxygen:   () => o2 ? o2.obj.position : null,
      },
      library: {
        'complex.I': { text: 'complex I', offset: [-44, -30],
          card: `NADH docks on the long arm in the matrix and hands over two electrons. They pass to ubiquinone in the membrane, and that drop pays for ${C.I.pumps} protons thrown out.` },
        'complex.II': { text: 'complex II (pumps nothing)', offset: [-40, 30],
          card: `It is also a Krebs cycle enzyme: succinate gives two electrons to the FAD bound inside it, and they go on to ubiquinone. It pumps ${C.II.pumps} protons, so electrons that enter here skip complex I's ${C.I.pumps}. That is why FADH₂ is worth ${protonsPer('FADH2')} protons and NADH ${protonsPer('NADH')}.` },
        'complex.III': { text: 'complex III', offset: [-10, -40],
          card: `Takes the pair from ubiquinol and hands them to cytochrome c one at a time, so it loads two cytochromes a turn. ${C.III.pumps} protons end up outside per pair with no channel through the protein: some ride in on ubiquinol with its electrons, the rest are taken from the matrix. The loop is called the Q cycle.` },
        'complex.IV': { text: 'complex IV', offset: [40, -34],
          card: `Collects electrons from cytochrome c and gives them to oxygen: four electrons and four matrix protons make one O₂ into two waters. It pumps ${C.IV.pumps} more per pair. Cyanide stops it here, and everything upstream backs up.` },
        quinone: { text: 'ubiquinone', offset: [-40, 26],
          card: 'A small oily molecule that moves inside the membrane. It picks up two electrons at complex I or II, becomes ubiquinol, delivers them to complex III and goes back for more.' },
        cytc: { text: 'cytochrome c', offset: [36, -30],
          card: 'A small protein on the outer face of the inner membrane. It carries one electron at a time from complex III to complex IV, and comes back empty.' },
        oxygen: { text: 'oxygen', offset: [42, -34],
          card: 'The last stop for the electrons. Each O₂ takes four, and four protons from the matrix, and leaves as two waters. With no oxygen the electrons have nowhere to go and the whole chain stops.' },
        translocase: { text: 'ADP/ATP translocase', offset: [-44, 30],
          card: 'ATP is made in the matrix and a charged nucleotide cannot cross a bilayer, so this carries it: one ATP out for one ADP in, a strict swap. It trades a −4 for a −3, so the membrane voltage drives it: the gradient pays once to make the ATP and again to get it out, about a quarter of the whole proton budget.' },
        porin: { text: 'porin', offset: [42, -30],
          card: 'A hole in the outer membrane, wide and unselective. Anything this small passes, which is why the space between the two membranes is nearly the same solution as the cytosol, and why the ATP is home once it is through.' },
        cytosol: { text: 'the cytosol', offset: [-38, -26],
          card: 'Outside the mitochondrion altogether. This is where the ATP is spent: on pumps at the cell surface, on the enzymes that build things, on everything the cell does that costs.' },
      },
      proteinKey: {
        I:        { name: 'complex I', color: hex(RESP.complex) },
        II:       { name: 'complex II (pumps nothing)', color: hex(RESP.complexII) },
        III:      { name: 'complex III', color: hex(RESP.complex) },
        IV:       { name: 'complex IV', color: hex(RESP.complex) },
        translocase: { name: 'ADP/ATP translocase', color: hex(RESP.translocase) },
      },
      carries: { I:['H'], II:[], III:['H'], IV:['H'], translocase:[] },
    });
  }

  /* ---- the sim ----
     A create with no params is an inner mitochondrial membrane that runs: the
     chain, a synthase, NADH, and a gradient's worth of protons. A span past
     the inner membrane brings the outer one and a translocase, or the ATP
     has no visible way out. */
  function defaultProteins(span) {
    const wide = span && span !== 'inner';
    return wide ? { complex:{ x:-85 }, synthase:{ x:55 }, translocase:{ x:115 } } : { complex:{ x:-60 }, synthase:{ x:80 } };
  }
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet || !global.Circuit) throw new Error('ElectronTransport: load membrane/parts.js, membrane/sheet.js and chemiosmosis/circuit.js first');
    const span = opts.span === 'cell' ? 'mitochondrion' : (opts.span || 'inner');
    const P = Object.assign({ componentName: 'ElectronTransport' }, global.Sheet.DEFAULTS, global.Circuit.DEFAULTS, DEFAULTS,
      { potential: 'nernst', fuel: 'NADH', outerMembrane: span !== 'inner' },
      opts, { context: 'mitochondrion', span });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    delete P.chain;
    P.proteins = Object.assign({}, opts.proteins || defaultProteins(span));
    return global.Sheet.create(THREE, root, camera, P, [machine]);
  }

  /* ---- span:'cell', two sims in one box ----
     ONE SCENE, TWO SIMS, and the y of each membrane is the only thing that
     says how they are arranged. Each sim is built into a group of its own and
     goes on believing its membrane is at y = 0; `bounds` keeps them out of
     each other. Top to bottom: outside the cell · PLASMA MEMBRANE · cytosol ·
     OUTER MEMBRANE · intermembrane space · INNER MEMBRANE · matrix.

     THE HEIGHTS ARE COMPRESSED. A real intermembrane space is about 20 nm and
     a mitochondrion sits microns below the cell surface, so this cytosol is
     perhaps a hundred times too thin. Which side is which, and which way each
     machine carries, is to scale with itself. */
  const STACK = { INNER_Y: -85, PLASMA_Y: 150, OUTER_GAP: 115 };
  const CELL_CONTENTS = { inside: { water: 18, NA: 9, K: 12, A: 5 }, outside: { water: 16, NA: 14, K: 4, CL: 8 } };
  /* The pump and its two leaks run on Na⁺ and K⁺ on both sides, so a page
     that leaves one unnamed gets the default: an ATP is only ever spent on a
     pump with ions to carry. */
  function cellContentsOf(c) {
    if (!c) return CELL_CONTENTS;
    const side = s => { const o = Object.assign({}, c[s] || {});
      for (const k of ['NA', 'K']) if (!(k in o)) o[k] = CELL_CONTENTS[s][k];
      return o; };
    return { inside: side('inside'), outside: side('outside') };
  }
  function stackMount(el, params) {
    if (!global.Membrane) throw new Error("ElectronTransport: span:'cell' needs membrane/parts.js and membrane/membrane.js");
    const { INNER_Y, PLASMA_Y, OUTER_GAP } = STACK;
    const OUTER_Y = INNER_Y + OUTER_GAP, CYTOSOL = PLASMA_Y - OUTER_Y;
    let mito = null, cell = null, nb = null, last = null, vw = null, spent = 0;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'ElectronTransport ' + ev);
    /* CardStage draws ONE FRAME AT CREATE, so afterFrame runs before either
       sim exists: checked rather than assumed. */
    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0, phi: Math.PI / 2 - 0.09, r: 500 },
      stage: Object.assign({ orbit: 'pan', rMin: 120, rMax: 900 }, params.stage || {}),
      step: dt => { if (!mito) return; const k = dt * (mito.params().timeScale || 1); last = mito.step(k); cell.step(k); },
      afterFrame: () => { if (vw) vw.frame(); if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    box.renderer.localClippingEnabled = true;
    const gMito = new THREE.Group(); gMito.position.y = INNER_Y; box.root.add(gMito);
    const gCell = new THREE.Group(); gCell.position.y = PLASMA_Y; box.root.add(gCell);
    const _w = new THREE.Vector3();
    const worldOf = (sim, group, name) => () => {
      const p = sim.anchors[name] && sim.anchors[name]();
      return p ? group.localToWorld(_w.copy(p)) : null;
    };
    /* The plasma membrane is built first so the mitochondrion can aim its
       ATP at the pump standing in it: 'pump.approach', just off the nucleotide site on the
       cytosolic face, not 'pump', which is the outside of the cell. */
    cell = global.Membrane.create(THREE, gCell, box.camera, {
      proteins: { pump: { x: -36 }, K: { x: 36 }, NA: { x: 108 } }, contents: cellContentsOf(params.cellContents),
      potential: 'nernst', pumpAuto: false, extent: 240, bounds: { up: 78, down: CYTOSOL - 8 },
    });
    const mitoOpts = Object.assign({}, params, { span: 'mitochondrion', extent: 240, bounds: { down: 95 },
      curve: params.curve != null ? params.curve : 12, atpTo: worldOf(cell, gCell, 'pump.approach'),
      atpReady: () => cell.canSpend(),
      atpLand: () => { if (!cell.spend({ handed: true })) return false; spent++; emit('spent', spent); return true; } });
    delete mitoOpts.cam; delete mitoOpts.stage; delete mitoOpts.viewOffset;
    mito = create(THREE, gMito, box.camera, mitoOpts);
    if (params.cut !== false) { mito.set({ cut: true }); cell.set({ cut: true }); }
    cell.on('turn', n => emit('turn', n));
    cell.on('turned', n => emit('turned', n));

    /* One view over both sheets (Sheet.view): drag pans, hover names, the
       four bands down the right, and neither sheet ever ends on screen. */
    const PROTEIN_NAME = { complex: 'Electron transport chain', I: 'Complex I', II: 'Complex II', III: 'Complex III', IV: 'Complex IV',
      synthase: 'ATP synthase', leak: 'Uncoupler',
      translocase: 'ADP/ATP translocase', porin: 'Porin', pump: 'Na⁺/K⁺ pump', K: 'K⁺ channel', CL: 'Cl⁻ channel' };
    vw = global.Sheet.view(el, box, {
      sheets: () => [
        ...Object.entries(Object.assign({}, cell.proteins, mito.proteins, mito.doors))
          .filter(([k, part]) => PROTEIN_NAME[k] && part && part.group).map(([k, part]) => [part.group, PROTEIN_NAME[k]]),
        [cell.membrane && cell.membrane.group, 'Plasma membrane'],
        [mito.outer && mito.outer.group, 'Outer membrane'],
        [mito.membrane && mito.membrane.group, 'Inner membrane'],
      ],
      bands: params.sideLabels === false ? [] : [
        { y: () => PLASMA_Y + 46, text: () => cell.state().sides.outside },
        { y: () => (PLASMA_Y + OUTER_Y) / 2, text: () => cell.state().sides.inside },
        { y: () => (OUTER_Y + INNER_Y) / 2, text: () => mito.state().sides.outside },
        { y: () => INNER_Y - 78, text: () => mito.state().sides.inside },
      ],
      halfWidth: () => params.fillWidth === false ? Infinity : Math.min(global.Sheet.halfWidth(mito.params()), global.Sheet.halfWidth(cell.params())),
    });

    /* ONE NOTEBOOK FOR BOTH, every anchor lifted into world space. The bands
       are already named, so the cell's `inside` is not offered twice: the
       mitochondrion's `cytosol` is that space, and the cell's `outside` is
       `cell.outside`. */
    const anchors = {}, library = {};
    for (const k of Object.keys(mito.anchors)) { anchors[k] = worldOf(mito, gMito, k); library[k] = mito.library[k]; }
    for (const k of ['pump', 'pump.atp', 'pump.head', 'channel.K', 'channel.NA', 'NA', 'K']) { anchors[k] = worldOf(cell, gCell, k); library[k] = cell.library[k]; }
    anchors['cell.outside'] = worldOf(cell, gCell, 'outside'); library['cell.outside'] = cell.library.outside;
    nb = global.Notebook ? global.Notebook.create({ box, anchors, library }) : null;
    vw.frame();

    const SHARED = ['water', 'ions', 'badges', 'cut', 'membrane'];
    const handle = {
      sim: mito, cell, box,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      /* An anchor's world point, or null when that part is off stage: what a page pins its own chrome to. */
      at: n => anchors[n] ? anchors[n]() : null,
      layers: mito.layers,
      show: (n, on) => { mito.show(n, on); if (SHARED.includes(n)) cell.show(n, on); if (!box.running) box.draw(); return handle; },
      palette: () => { const seen = new Set(); return mito.palette().concat(cell.palette()).filter(p => !seen.has(p.name) && seen.add(p.name)); },
      set(next) { const n = Object.assign({}, next); delete n.span; mito.set(n); return handle; },
      state: () => Object.assign({}, last || mito.state(), { span: 'cell', spentOnPump: spent,
        cell: (s => ({ atpSpent: s.atpSpent, pumpRunning: s.pumpRunning, mV: s.mV, counts: s.counts, sides: s.sides }))(cell.state()) }),
      signals: () => SIGNALS,
      on(ev, fn) {
        if (ev === 'spent' || ev === 'turn' || ev === 'turned') {
          (listeners[ev] || (listeners[ev] = [])).push(fn);
          return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
        }
        return mito.on(ev, fn);
      },
      feed: mito.feed, spend: cell.spend,
      add: mito.add, scatter: mito.scatter, clear: mito.clear,
      reset() { spent = 0; mito.reset(); cell.reset(); cell.set({ contents: cellContentsOf(params.cellContents) }); },
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { if (nb) nb.clear(); vw.destroy(); box.destroy(); },
    };
    return handle;
  }

  /* ---- the box ----
     Changing `span` to or from 'cell' rebuilds the box, since that is two
     sims rather than one: listeners are carried across, the running state
     too, and the counts start again. Every other change is a set(). */
  const SIGNALS = Object.assign({}, global.Circuit ? global.Circuit.SIGNALS : {});
  function mount(el, params = {}) {
    return global.Circuit.mount(el, params, {
      name: 'ElectronTransport', context: 'mitochondrion', other: 'LightReactions', create, signals: SIGNALS, api: ['feed'],
      build: (el, P0) => P0.span === 'cell' ? stackMount(el, P0) : null,
      rebuilds: (P0, next) => next.span != null && (P0.span === 'cell') !== (next.span === 'cell'),
    });
  }

  global.ElectronTransport = { create, mount, machine, DEFAULTS, SIGNALS, STACK,
    RING, PROTONS_PER_EXPORT, FUELS, CHAIN, CARRIES, ACCEPTOR, chainPath: path, protonsPer, atpPer };
  if (global.Circuit) global.ElectronTransport.SCALE = global.Circuit.SCALE();
  if (typeof module !== 'undefined' && module.exports) module.exports = global.ElectronTransport;
})(typeof globalThis !== 'undefined' ? globalThis : this);
