/* =============================================================================
 *  chemiosmosis/circuit.js — the proton circuit, as a component
 * =============================================================================
 *  Something with energy to spend pumps protons across a membrane; ATP
 *  synthase lets them back down and makes ATP on the way. Respiration and
 *  photosynthesis are that picture with one parameter flipped.
 *
 *      Chemiosmosis.create(THREE, root, camera, opts)   the sim
 *      Chemiosmosis.mount(el, params)                   one box, one handle
 *
 *  The arithmetic — pH, the proton-motive force, the rotor's stoichiometry,
 *  the complex's phase table, the split chain's CHAIN table, and the rule that
 *  neither door runs uphill — is membrane/chemiosmosis.js, free of THREE so
 *  check-chemiosmosis.js runs it in node; this file adds create/mount to that
 *  same global. The bilayer and everything that walks beside it is
 *  membrane/sheet.js. What is here is the machines and what they carry:
 *
 *      proteins: { complex | I | II | III | IV | synthase | leak | translocase: {x} | null }
 *
 *  TWO LEVELS OF DETAIL, on two independent params:
 *
 *      chain  'lumped'  one complex stands for the chain, 2 H⁺ a turn
 *             'split'   complexes I, II, III and IV, ubiquinone moving in the
 *                       membrane from I or II to III, cytochrome c on the
 *                       outer face from III to IV. NADH docks at I and FADH₂'s
 *                       electrons enter at II, which pumps nothing. Each turn
 *                       pumps CHAIN[k].pumps. In a thylakoid: PSII, b6f and
 *                       PSI, plastoquinone in the membrane, plastocyanin in
 *                       the lumen; PSII splits water into lumen protons and
 *                       O₂, PSI makes NADPH in the stroma, both fire on light.
 *                       Off PHOTO_CHAIN. A plasma membrane stays lumped.
 *      span   'inner'          the inner membrane alone
 *             'mitochondrion'  plus the outer membrane with a porin, and a
 *                              translocase, so the ATP visibly gets out
 *             'cell'           plus a plasma membrane above the cytosol whose
 *                              Na⁺/K⁺ pump spends each ATP that arrives. mount()
 *                              only; it builds two sims in one box, and changing
 *                              to or from it rebuilds the box
 *
 *  A layout written for one chain works for the other: `complex:{x}` is
 *  spread into I–IV about that x, and I–IV collapse to one complex at their
 *  mean. `chain` and `span` changes snap; nothing tweens across a relayout.
 *
 *  Events: `pumped` (protons thrown out so far), `atp` (made, in the matrix),
 *  `atpOut` (cleared the last door on stage), `atpDelivered` (reached atpTo),
 *  and with span:'cell' `spent` (the pump turned on one) and `turn`/`turned`.
 *
 *  Membrane loads this machine too while old generated apps mount the circuit
 *  through it, so MACHINE_DEFAULTS are neutral (no fuel, plasma context) and
 *  the component's own defaults — an inner mitochondrial membrane that runs —
 *  are applied only by Chemiosmosis.create.
 * ========================================================================== */
(function (global) {
  'use strict';
  const CHEM = global.Chemiosmosis;
  if (!CHEM) throw new Error('circuit.js: load membrane/chemiosmosis.js first');

  const MACHINE_DEFAULTS = {
    fuel: null,               // 'NADH' | 'FADH2' | 'light' | null — null lets the gradient run down
    fuelRate: 1,              // 0..1, a supply dial or a light dimmer
    oxygen: true,             // false: the respiratory chain has no final electron acceptor and stops
    /* A STOCK OF O₂ that runs down: that many wait in the intermembrane space,
       each one used is gone, and at zero the chain stops as with no oxygen.
       6 is one glucose's worth. null draws one whenever it is needed. */
    o2Stock: null,
    complexSeconds: 6.0,      // ONE FULL CYCLE, the empty half included
    chain: 'lumped',          // 'lumped' | 'split'
    showATP: true,            // the synthase releases a drawn ATP per third-turn
    showFuel: true,           // a carrier arrives at the complex and leaves spent
    /* 'intro' drops what an intro course never names: FADH₂ docks at complex
       II instead of succinate, and the cards say what each part does without
       its chemistry. A simplification: that FAD is bound in the enzyme. */
    names: 'full',            // 'full' | 'intro'
    /* THE OUTER MEMBRANE IS A BACKDROP, not a second sim: a sheet with a
       porin in it, so the intermembrane space is a space with a lid. Nothing
       crosses it but the ATP. Mitochondrion only — a thylakoid's second
       membrane is the chloroplast envelope, which is not this picture. */
    outerMembrane: false,
    atpExit: null,            // 'left' | 'right': it leaves that way, toward the box that spends it
    /* WHERE THE ATP IS GOING, as a function returning a WORLD point — the
       pump in another sim sharing this scene. Takes precedence over atpExit;
       'atpDelivered' fires on arrival, the moment something may spend it. */
    atpTo: null,
  };
  const SPLIT = ['I', 'II', 'III', 'IV'];
  const PHOTO = ['PSII', 'b6f', 'PSI'];
  const ALL = SPLIT.concat(PHOTO);
  const ROW = k => CHEM.CHAIN[k] || CHEM.PHOTO_CHAIN[k];
  /* Where each split row stands about a lumped complex's x, and how close it
     may pack. Tuned against the default camera, which a split chain pulls back. */
  const SPLIT_OFFSETS = { mitochondrion: [-75, -25, 25, 75], thylakoid: [-60, 0, 60] }, SPLIT_GAP = 50;

  function machine(eng) {
    const { THREE, P, HALF, BOW, rnd, travellers, kit, seat, root } = eng;
    const Parts = global.Parts;
    const pumpDir = eng.pumpDir;
    const RESP = global.MolLib.PALETTE.respiration;
    const PHO = global.MolLib.PALETTE.photosynthesis;
    /* ONE SHAPE, TWO LINES. `rest` is where the quinone waits, `hub` the
       pump that trades it for the one-electron shuttle, `end` where that
       shuttle unloads. */
    const LINES = {
      mitochondrion: { keys: SPLIT, donors: { I: 'NADH', II: 'FADH2' }, rest: 'II', hub: 'III', end: 'IV',
                       q: ['Q', 'QH₂'], c: 'cyt c', qColor: RESP.quinone, cColor: RESP.cytc },
      thylakoid:     { keys: PHOTO, donors: { PSII: 'light' }, rest: 'PSII', hub: 'b6f', end: 'PSI',
                       q: ['PQ', 'PQH₂'], c: 'PC', qColor: PHO.plastoquinone, cColor: PHO.plastocyanin },
    };
    const line = () => LINES[P.context] || LINES.mitochondrion;
    const photo = () => split() && P.context === 'thylakoid';
    let warnedSplit = false;
    const split = () => {
      if (P.chain !== 'split') return false;
      if (LINES[P.context]) return true;
      if (!warnedSplit) { warnedSplit = true; console.warn(`Chemiosmosis: chain:'split' needs a mitochondrion or a thylakoid; ${P.context} stays lumped`); }
      return false;
    };

    /* ---- the machines ----
       A COMPLEX: the electron-transport chain, or the cytochrome b6f of a
       thylakoid, drawn as ONE when the lesson's claim is "something with
       energy to spend pumps protons". INDIGO: a mitochondrion's lipid is
       orange, and a warm machine disappears into it. A carrier, so a snug
       site. */
    const holeOf = (R, lobe) => R * (1 + lobe) + 0.5;
    const CPX_R = 16.0, CPX_LOBE = 0.14;
    const COMPLEX = Parts.transporter({ half:HALF, site:6.2, mouth:8.0, radius:CPX_R, lobes:3, lobeDepth:CPX_LOBE, color:RESP.complex });
    /* THE SPLIT CHAIN. One blue for I, III and IV and a paler one for II,
       palette.js's rule. The shapes are a schematic whose one job is to be
       told apart: I is the biggest and has the long arm hanging into the
       matrix where NADH docks; II, III and IV are built from their structures, below. */
    const SPEC = {
      I:   { R: 16.5, lobes: 3, lobe: 0.12, color: RESP.complex },
      II:  { R: 9.0,  lobes: 2, lobe: 0.10, color: RESP.complexII },
      III: { R: 11.5, lobes: 2, lobe: 0.05, color: RESP.complex },
      IV:  { R: 16.0, lobes: 0, lobe: 0,    color: RESP.complex },
      /* PSII and b6f are dimers. PSII's oxygen-evolving complex hangs into
         the lumen, where the water is split; PSI's stromal ridge is where
         ferredoxin docks and NADP⁺ is reduced. */
      PSII: { R: 15.5, lobes: 2, lobe: 0.14, color: PHO.psii },
      b6f:  { R: 14.0, lobes: 2, lobe: 0.12, color: PHO.b6f },
      PSI:  { R: 15.0, lobes: 3, lobe: 0.10, color: PHO.psi },
    };
    const CX = {};
    /* COMPLEX II IS NOT A PUMP, so it is not drawn on the pump's lathe: no
       lumen, no mouths, no gates. Succinate dehydrogenase (PDB 1ZOY) is
       mostly a soluble head in the matrix, the flavoprotein SdhA, where
       succinate meets the bound FAD, on the iron-sulfur SdhB, drawn as one. The small
       anchor, SdhC and SdhD, does span the bilayer, but as a solid bundle
       of six helices with the ubiquinone site near the matrix face and no
       path for a proton. */
    /* A solid rod through the bilayer: a lathe capsule with no lumen, widened
       in x so one reads as two bundles side by side. */
    function solidPart(color, r, h, sx) {
      const prof = [];
      for (let i = 0; i <= 8; i++) { const a = -Math.PI / 2 + (i / 8) * Math.PI / 2; prof.push(new THREE.Vector2(r * Math.cos(a) + 1e-3, -h + r + r * Math.sin(a))); }
      for (let i = 0; i <= 8; i++) { const a = (i / 8) * Math.PI / 2; prof.push(new THREE.Vector2(r * Math.cos(a) + 1e-3, h - r + r * Math.sin(a))); }
      const geo = new THREE.LatheGeometry(prof, 40);
      const mesh = new THREE.Mesh(geo, Parts.flat(color));
      mesh.scale.set(sx, 1, 1);
      const group = new THREE.Group(); group.add(mesh);
      return { group, mesh, geometry: geo, height: h, setGates() {}, get gates() { return { top: 0, bottom: 0 }; },
               site: new THREE.Vector3(), dispose() { geo.dispose(); mesh.material.dispose(); } };
    }
    const succinateDH = () => solidPart(SPEC.II.color, 6.8, HALF + 1.5, 1.35);   // SdhC beside SdhD
    /* COMPLEX III (bc₁, PDB 1BGY) IS AN OBLIGATE DIMER with no proton channel:
       it moves protons by the Q cycle, at quinone sites inside the membrane.
       A pear: a dimer's width through the bilayer, swelling below into the
       core proteins, most of its mass, hanging further into the matrix than
       the membrane is thick. On the other face, cytochrome c₁ and the Rieske
       iron-sulfur head make a low knob where cytochrome c docks.
       COMPLEX IV (PDB 1OCC) WORKS AS A MONOMER and IS a pump, so it keeps the
       lathe and its gates, but squat and wide: mostly buried, with
       subunit II's Cu_A domain as a knob on the outer
       face, cytochrome c's dock. */
    const III_DROP = 34;   // how far the core hangs below the membrane's centre, past HALF
    function bc1() {
      const top = HALF + 2, bottom = -(HALF + III_DROP), rTop = 8.5, rMax = 17, N = 40;
      const prof = [new THREE.Vector2(1e-3, bottom)];
      for (let i = 1; i < N; i++) {
        const y = bottom + (top - bottom) * i / N, u = i / N;
        /* the belly peaks below the matrix face; both ends round off */
        const belly = Math.exp(-(((y + HALF + 15) / 14) ** 2));
        const r = (rTop + (rMax - rTop) * belly) * Math.pow(Math.sin(Math.PI * u), 0.35);
        prof.push(new THREE.Vector2(Math.max(r, 1e-3), y));
      }
      prof.push(new THREE.Vector2(1e-3, top));
      const geo = new THREE.LatheGeometry(prof, 40);
      const mesh = new THREE.Mesh(geo, Parts.flat(SPEC.III.color));
      mesh.scale.set(1.3, 1, 1);      // two monomers side by side
      const group = new THREE.Group(); group.add(mesh);
      return { group, mesh, geometry: geo, height: top, setGates() {}, get gates() { return { top: 0, bottom: 0 }; },
               site: new THREE.Vector3(), dispose() { geo.dispose(); mesh.material.dispose(); } };
    }
    const OVER = { IV: 5 };
    for (const k of ALL) CX[k] = k === 'II' ? succinateDH() : k === 'III' ? bc1() : Parts.transporter({ over: OVER[k] != null ? OVER[k] : 14, half:HALF, site:6.2, mouth:8.0, radius:SPEC[k].R, lobes:SPEC[k].lobes, lobeDepth:SPEC[k].lobe, color:SPEC[k].color });
    const OEC = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(PHO.psii));
    OEC.scale.set(1.3, 0.8, 1); OEC.userData.baseY = CX.PSII.height + 3;
    CX.PSII.group.add(OEC);
    const RIDGE_PSI = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(PHO.psi));
    RIDGE_PSI.scale.set(1.2, 0.8, 1); RIDGE_PSI.userData.baseY = CX.PSI.height + 3;
    CX.PSI.group.add(RIDGE_PSI);
    CX.PSII.setGates(0, 0); CX.PSI.setGates(0, 0); CX.b6f.setGates(0, 0);   // b6f runs the Q cycle: no channel opens
    const ARM_I = new THREE.Mesh(new THREE.SphereGeometry(6.5, 18, 12), Parts.flat(RESP.complex));
    ARM_I.scale.set(1, 2.1, 1); ARM_I.position.x = -5; ARM_I.userData.baseY = CX.I.height + 12;
    CX.I.group.add(ARM_I);
    /* one head for SdhA and SdhB together */
    const II_HEAD_R = 9, II_HEAD_Y = HALF + 1.5 + II_HEAD_R - 1;
    const HEAD_II = new THREE.Group();
    const SDH = new THREE.Mesh(new THREE.SphereGeometry(II_HEAD_R, 20, 14), Parts.flat(RESP.complexII));
    SDH.userData.baseY = II_HEAD_Y;
    HEAD_II.add(SDH);
    CX.II.group.add(HEAD_II);
    /* userData.side: +1 on the pumped-into face, −1 on the loading face */
    const knob = (color, r, x, baseY, side, sy = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), Parts.flat(color));
      m.scale.set(1, sy, 1); m.position.x = x; m.userData.baseY = baseY; m.userData.side = side;
      return m;
    };
    const III_C1 = HALF + 3;
    const KNOBS = {
      III: [knob(RESP.complex, 6, -5, III_C1, 1, 0.8), knob(RESP.complex, 4.5, 7, III_C1 - 1, 1, 0.8)],
      IV:  [knob(RESP.complex, 6.5, -4, CX.IV.height + 2, 1, 0.85)],
    };
    for (const k in KNOBS) CX[k].group.add(...KNOBS[k]);
    /* where cytochrome c sits: on c₁ at III, on Cu_A at IV */
    const C_HALF = 3.4 * 0.8;   // the oblong cyt c token's half-height
    const cSeat = key => key === 'III' ? III_C1 + 6 * 0.8 + C_HALF - 0.5 : key === 'IV' ? CX.IV.height + 2 + 6.5 * 0.85 + C_HALF - 0.5 : H_() + 7;

    /* ATP SYNTHASE HAS NO TUBE THROUGH IT (bovine, PDB 6ZPO). In the membrane
       is Fo: a ring of eight c subunits that turns, with lipid in its middle,
       and beside it the stator subunit a. A proton comes in through a
       half-channel in a, rides a c subunit most of a turn, and leaves by a's
       other half-channel, so the path is AT THE a/c INTERFACE, not down an
       axis. The ring drives the narrow central stalk up into F1, the αβ
       head in the matrix, which the peripheral stalk holds still from a.
       Proportions follow the structure: ring about half the head's width,
       stalk a head's radius long. */
    const RING_R = 7.5, C_R = 2.4, A_X = RING_R + C_R + 4.2, LANE_DX = RING_R + C_R + 0.6;
    const STALK_L = 15, F1_R = 19, F1_H = 15;
    const F1_BASE = HALF + 1 + STALK_L;               // the head's flat underside, from the membrane's centre
    /* the membrane is cleared from the ring's far edge to a's */
    const SYN_MID = (A_X + 4.2 - RING_R - C_R) / 2, SYN_HALFW = (A_X + 4.2 + RING_R + C_R) / 2 + 1, SYN_LOBE = 0;
    function buildSynthase() {
      const aGeo = new THREE.CylinderGeometry(4.2, 4.2, 2 * HALF + 3, 16);
      const mesh = new THREE.Mesh(aGeo, Parts.flat(RESP.stalk));
      mesh.position.x = A_X; mesh.scale.set(1, 1, 1.5);
      const group = new THREE.Group(); group.add(mesh);
      /* height is the reach a proton is captured at, as a transporter's is */
      return { group, mesh, geometry: aGeo, height: HALF + 14, setGates() {}, get gates() { return { top: 1, bottom: 1 }; },
               site: new THREE.Vector3(), dispose() { aGeo.dispose(); mesh.material.dispose(); } };
    }
    const SYNTH = buildSynthase();
    /* An UNCOUPLER's hole: dinitrophenol, or thermogenin in brown fat.
       Protons come back without touching the synthase, so the gradient
       collapses and no ATP is made. Grey: it is a hole, not a machine. */
    const LEAK_R = 11.0, LEAK_LOBE = 0.06;
    const LEAK    = Parts.transporter({ half:HALF, site:6.0, mouth:7.6, radius:LEAK_R, lobes:0, color:RESP.leak });
    /* THE HOLE WINS, and that is what makes an uncoupler dangerous: it is
       always open, while the synthase has a rotor to wait for. Protons per
       one that still takes the synthase; a staging choice, declared here. */
    const LEAK_PREFERENCE = 3;
    /* THE ADP/ATP TRANSLOCASE, the answer to "how does the ATP get out". The
       F1 head hangs in the matrix, so the ATP is MADE in the matrix, and a
       charged nucleotide does not cross a bilayer. One ATP out for one ADP
       in. A monomer, so it does not read as a member of the chain.
       NOT DRAWN: that the swap is ELECTROGENIC (ATP⁴⁻ out for ADP³⁻ in); the
       card says it, and a charge count here would move mV on a stage where
       mvPerIon is a timing knob rather than a measurement. */
    const ANT_R = 10.0, ANT_LOBE = 0.08;
    const ANT = Parts.transporter({ half:HALF, site:5.4, mouth:7.0, radius:ANT_R, lobes:0, color:RESP.translocase });
    const ROTOR = buildRotor(), HEAD = buildHead();
    SYNTH.group.add(ROTOR, HEAD);
    root.add(COMPLEX.group, SYNTH.group, LEAK.group, ANT.group, ...ALL.map(k => CX[k].group));
    const H_ = () => COMPLEX.height;

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
    let OUTER = null, porinX = null, antX = null, complexX = 0, synthX = null;
    const xs = Object.fromEntries(ALL.map(k => [k, 0]));
    const outerOn = () => !!P.outerMembrane && P.context === 'mitochondrion';
    const outerY = () => pumpDir() * OUTER_GAP;
    const _out = new THREE.Vector3();
    function buildOuter(tint) {
      if (OUTER) { root.remove(OUTER.group); OUTER = null; }
      PORIN.group.visible = outerOn();
      if (!outerOn()) { porinX = null; return; }
      /* INBOARD of the door it feeds, and offset so the ATP's two crossings
         do not stack into one vertical line read as a single pore. */
      porinX = (antX != null ? antX : synthX != null ? synthX : 0) - 38;
      /* CONCENTRIC WITH THE INNER SHEET, so the space is one width all along. */
      OUTER = Parts.membrane({ half:HALF * 0.62, reach:P.reach, head:tint.head, tail:tint.tail,
        bowR:BOW ? BOW + OUTER_GAP : 0,
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

    /* The ROTOR turns: the c ring in the membrane and the central stalk
       above it, with an off-axis foot so the turning reads. The STATOR does
       not: F1, the peripheral stalk and its cap. F1's three αβ pairs are why
       a third of a turn is one ATP. Children are
       placed by baseY and a side, so orient() can mirror them by sign. */
    function buildRotor() {
      const g = new THREE.Group();
      const stalkMat = Parts.flat(RESP.stalk), gold = Parts.flat(RESP.synthase);
      for (let i = 0; i < 8; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(C_R, C_R, 2 * HALF + 2, 12), gold);
        const th = (i / 8) * Math.PI * 2;
        c.position.set(Math.cos(th) * RING_R, 0, Math.sin(th) * RING_R);
        c.userData.baseY = 0; g.add(c);
      }
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, STALK_L + 6, 12), stalkMat);
      shaft.userData.baseY = HALF + 1 + (STALK_L + 6) / 2; g.add(shaft);
      const foot = new THREE.Mesh(new THREE.BoxGeometry(8, 2.4, 3), stalkMat);
      foot.position.x = 3.5; foot.userData.baseY = HALF + 2.5; g.add(foot);
      return g;
    }
    /* F1 as a dome: a lathe profile, flat underneath and rounding over the
       top, so it reads as a dome rather than a squashed ball. */
    function buildHead() {
      const g = new THREE.Group();
      const R = F1_R, H = F1_H, pts = [new THREE.Vector2(0, 0), new THREE.Vector2(R * 0.55, 0)];
      pts.push(new THREE.Vector2(R * 0.93, 0.6), new THREE.Vector2(R, 2.4));
      for (let i = 1; i <= 12; i++) {
        const t = (i / 12) * Math.PI / 2;
        pts.push(new THREE.Vector2(R * Math.cos(t), 2.4 + (H - 2.4) * Math.sin(t)));
      }
      const dome = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), Parts.flat(RESP.synthase));
      dome.userData.baseY = F1_BASE; dome.userData.dome = true;
      const stalkMat = Parts.flat(RESP.stalk);
      const b = new THREE.Mesh(new THREE.BufferGeometry(), stalkMat); b.userData.stalk = true;
      const cap = new THREE.Mesh(new THREE.SphereGeometry(3.4, 14, 10), stalkMat);
      cap.position.x = F1_R * 0.45; cap.userData.baseY = F1_BASE + F1_H + 1.5;
      g.add(dome, b, cap);
      return g;
    }
    /* THE PERIPHERAL STALK BOWS around the head: out of a, up past F1's rim,
       and over onto the OSCP cap on top. Rebuilt per side, since mirroring a
       mesh by a negative scale would turn its lighting inside out. */
    let stalkSide = 0;
    function bendStalk(d) {
      const b = HEAD.children.find(c => c.userData.stalk);
      if (!b || stalkSide === d) return;
      stalkSide = d;
      const s = -d, V = THREE.Vector3;
      const curve = new THREE.CatmullRomCurve3([
        new V(A_X, s * (HALF + 1), 0),
        new V(A_X + 5, s * (HALF + 8), 0),
        new V(F1_R + 3, s * (F1_BASE + 2), 0),
        new V(F1_R + 1, s * (F1_BASE + F1_H * 0.6), 0),
        new V(F1_R * 0.75, s * (F1_BASE + F1_H + 1), 0),
        new V(F1_R * 0.45, s * (F1_BASE + F1_H + 1.5), 0),
      ]);
      b.geometry.dispose();
      b.geometry = new THREE.TubeGeometry(curve, 40, 1.3, 10, false);
    }

    /* ---- small tokens: a sphere or two with a name on a pill ---- */
    function relabel(obj, name, y) {
      if (obj.userData.tag) { kit.forget(obj.userData.tag); obj.remove(obj.userData.tag); }
      const tag = kit.pill(name, 6.4);
      tag.position.set(0, y, 0);
      obj.add(tag); obj.userData.tag = tag;
    }
    function buildToken(name, color, lobes) {
      const g = new THREE.Group();
      if (lobes === 2) {
        for (const [x, r] of [[-3.1, 3.6], [3.1, 3.0]]) {
          const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), Parts.flat(color));
          lobe.position.x = x; g.add(lobe);
        }
        const link = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6.2, 8), Parts.flat(global.MolLib.PALETTE.bonds.covalent));
        link.rotation.z = Math.PI / 2; g.add(link);
      } else {
        g.add(new THREE.Mesh(new THREE.SphereGeometry(3.4, 16, 12), Parts.flat(color)));
      }
      relabel(g, name, 8.0);
      return g;
    }
    function dropToken(obj) {
      obj.traverse(o => { if (o.userData && (o.userData.tag || o.userData.badge)) {
        if (o.userData.tag) kit.forget(o.userData.tag);
        if (o.userData.badge) kit.forget(o.userData.badge);
      } });
      root.remove(obj);
    }
    const fade = (obj, a) => obj.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, a); } });
    const approach = (c, to, dt, speed) => {
      const dx = to.x - c.x, dy = to.y - c.y, dz = (to.z || 0) - (c.z || 0), dist = Math.hypot(dx, dy, dz), move = speed * dt;
      if (dist > move) { c.x += dx / dist * move; c.y += dy / dist * move; c.z = (c.z || 0) + dz / dist * move; }
      else { c.x = to.x; c.y = to.y; c.z = to.z || 0; }
      seat(c.obj, c.x, c.y, c.z);
      return dist <= move;
    };

    /* ---- the ATP that comes out, and the way out ----
       One molecule leaves the head per third-turn, on the SAME pass() that
       increments the count. IT IS MADE IN THE MATRIX, so it takes a route:
       matrix → translocase → intermembrane space → porin → cytosol, with an
       ADP the other way. DRAWN AS ITS PHOSPHATES: three beads against two is
       what tells ATP from ADP at this scale, and the third bond is the
       `condense` slate because it is a condensation. */
    const ROT = CHEM.rotor();
    const ATP_MAX = 8, ATP_SNAP = 0.35, ATP_SPEED = 52, ATP_FADE = 0.8;
    const atpChips = [];
    const R_BEAD = 2.2, BEAD_GAP = 5.0;
    function buildNucleotide(n) {
      const g = new THREE.Group();
      const PAL = global.MolLib.PALETTE;
      const x = i => (i - (n - 1) / 2) * BEAD_GAP;
      const beads = [];
      for (let i = 0; i < n; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(R_BEAD, 16, 12), Parts.flat(PAL.atoms.P));
        b.position.x = x(i); g.add(b); beads.push(b);
      }
      for (let i = 0; i < n - 1; i++) {
        const link = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, BEAD_GAP, 8),
          Parts.flat(i === n - 2 && n === 3 ? PAL.bonds.condense : PAL.bonds.covalent));
        link.rotation.z = Math.PI / 2; link.position.x = x(i) + BEAD_GAP / 2;
        g.add(link);
      }
      const tag = kit.pill(n === 3 ? 'ATP' : 'ADP', 6.4);
      tag.position.set(0, R_BEAD + 5.2, 0);
      g.add(tag);
      g.userData = { newest: beads[n - 1], tag };
      return g;
    }
    const _atp = new THREE.Vector3();
    function atpRoute() {
      const d = pumpDir();
      const legs = [];
      if (antX != null) {
        legs.push({ x:antX, y:-d * (HALF + 15) });
        legs.push({ x:antX, y: d * (HALF + 15), swap:true });
      }
      if (outerOn()) {
        legs.push({ x:porinX, y: d * (OUTER_GAP - HALF * 0.62 - 7) });
        legs.push({ x:porinX, y: d * (OUTER_GAP + HALF * 0.62 + 9), out:true });
      }
      const last = legs.length ? legs[legs.length - 1] : null;
      /* atpTo answers in WORLD coordinates because what it points at belongs
         to another sim; converted once at release, AND UNBENT, because a leg
         is flat and seat() bends it at draw time. */
      if (P.atpTo) {
        const w = P.atpTo();
        if (w) {
          _atp.copy(w); root.worldToLocal(_atp);
          if (BOW) {
            const th = Math.atan2(_atp.x, _atp.y + BOW), rad = Math.hypot(_atp.x, _atp.y + BOW);
            _atp.set(th * BOW, rad - BOW, 0);
          }
          legs.push({ x:_atp.x, y:_atp.y, fade:true, land:true, out:!legs.some(l => l.out) });
          return legs;
        }
      }
      const away = P.atpExit === 'left' ? -1 : P.atpExit === 'right' ? 1 : 0;
      legs.push({ x:(last ? last.x : (synthX || 0)) + (away || 1) * 90,
                  y:(last ? last.y : -d * (HALF + 26)) + (last ? d * 22 : -d * 14),
                  fade:true, out:!legs.some(l => l.out) });
      return legs;
    }
    function releaseATP() {
      if (!P.showATP || !SYNTH.group.visible || atpChips.length >= ATP_MAX) return;
      const g = buildNucleotide(3);
      root.add(g);
      atpChips.push({ obj:g, t:0, phase:Math.random() * 6.28, fade:1,
                      x:(synthX || 0) - F1_R * 0.8, y:-pumpDir() * (F1_BASE + 4), legs:atpRoute(), leg:0 });
    }
    /* EXPORT IS PAID IN PROTONS, charged when the ATP is made rather than
       when a drawn one reaches the door, because ATP_MAX caps the drawn ones
       and every ATP made has to leave. A pumped-side proton comes home at the
       translocase, which turns no rotor. No translocase on stage, no charge. */
    function exportCost() {
      if (antX == null) return;
      const d = pumpDir();
      for (let i = 0; i < CHEM.PROTONS_PER_EXPORT; i++) {
        const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === d);
        if (!pool.length) return;
        const t = pool.reduce((a, b) => (Math.abs(a.x - antX) < Math.abs(b.x - antX) ? a : b));
        t.x = antX + rnd(-10, 10); t.y = -d * (HALF + 12); t.z = rnd(-8, 8);
        t.obj.position.set(t.x, t.y, t.z);
        t.bounded = true; eng.repick(t); t.vy = Math.abs(t.vy) * -d;
        protonsForExport++; eng.crossed.H -= d; eng.chargeOut -= d;
        eng.mV = eng.clampMV(P.mvPerIon * eng.chargeOut);
      }
    }
    function releaseADP(atX) {
      const d = pumpDir();
      const g = buildNucleotide(2);
      root.add(g);
      atpChips.push({ obj:g, t:0, phase:Math.random() * 6.28, fade:1, x:atX, y:d * (HALF + 15),
                      legs:[{ x:atX, y:-d * (HALF + 15) }, { x:atX - 44, y:-d * (HALF + 34), fade:true }], leg:0 });
    }
    function tickATP(dt) {
      for (let i = atpChips.length - 1; i >= 0; i--) {
        const c = atpChips[i];
        c.t += dt;
        const o = c.obj, leg = c.legs[c.leg];
        /* WALKED, not integrated: the route is the claim. */
        const dx = leg.x - c.x, dy = leg.y - c.y, dist = Math.hypot(dx, dy);
        const move = ATP_SPEED * dt;
        if (dist <= move) {
          c.x = leg.x; c.y = leg.y;
          /* ARRIVING IS AN EVENT, BEING THERE IS NOT. */
          if (!c.done) {
            c.done = true;
            if (leg.swap && antX != null) releaseADP(antX);
            if (leg.out && !c.left) { c.left = true; eng.emit('atpOut', ROT.atp); }
            if (leg.land) eng.emit('atpDelivered', ROT.atp);
            if (leg.fade) c.dying = true;
          }
          if (c.leg < c.legs.length - 1) { c.leg++; c.done = false; }
        } else { c.x += dx / dist * move; c.y += dy / dist * move; }
        seat(o, c.x, c.y, 0);
        o.rotation.z = Math.sin(c.t * 1.1 + c.phase) * 0.16;
        const k = Math.min(1, c.t / ATP_SNAP);
        o.userData.newest.scale.setScalar(1 + 1.4 * (1 - k) * (1 - k));
        if (c.dying) {
          c.fade -= dt / ATP_FADE;
          fade(o, c.fade);
          if (c.fade <= 0) { kit.forget(o.userData.tag); root.remove(o); atpChips.splice(i, 1); }
        }
      }
    }
    function clearATP() {
      for (const c of atpChips) { kit.forget(c.obj.userData.tag); root.remove(c.obj); }
      atpChips.length = 0;
    }

    /* ---- the fuel, arriving and leaving ----
       THE POINT IS THAT IT STAYS ON ONE SIDE: the carrier comes up out of the
       matrix, docks on the machine's matrix face, and goes back down. AND IT
       IS NOT CONSUMED: NADH docks and NAD⁺ leaves, the same body and colour.
       A dinucleotide is two lobes, not ATP's row of three.

       AT COMPLEX II THE TOKEN IS SUCCINATE. The FAD there is bound inside the
       enzyme and never leaves it: what arrives from the Krebs cycle is
       succinate, and what leaves is fumarate. The lumped complex keeps the
       FADH₂ token, because there is no complex II on stage to hold its FAD.

       Timed off the machine's own cycle: it arrives as the machine opens to
       load and is spent on `occlude`. */
    const FUEL_SPEED = 60, FUEL_FADE = 0.9;
    const LEAVE_X = 420;   // past the frame's edge at the default camera
    const leaving = [];
    const chips = {};
    const pulse = { complex: null, I: null, II: null, PSII: null };
    /* A flash is one PSII turn, and PSI owes it one turn later, whenever its
       plastocyanins arrive: a count, so two quick flashes are two turns. */
    const credit = { PSI: 0 };
    /* THE GLYCEROL-PHOSPHATE SHUTTLE: cytosolic NADH cannot enter the matrix,
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
    function dockOf(key, shuttle) {
      if (shuttle) return shuttleDock();
      const d = pumpDir(), H = H_();
      /* NADH binds at the tip of complex I's matrix arm: the arm (ARM_I) is a
         2.1-stretched sphere of 6.5 centred H + 12 down and tilted 0.45 rad,
         so its far end is about 1 right and H + 24 down; the token's half
         height past that, less a little so it touches. */
      if (key === 'I') { const x = xs.I; return { from:{ x:x - 20, y:-d * (H + 52) }, at:{ x:x + 1, y:-d * (H + 27) }, away:{ x:x - 30, y:-d * (H + 54) } }; }
      if (key === 'PSI') { const x = xs.PSI; return { from:{ x:x + 36, y:-d * (H + 46) }, at:{ x:x + 12, y:-d * (H + 20) }, away:{ x:x + 42, y:-d * (H + 50) } }; }
      /* II's substrate meets the FAD in the head: the token (half width 6.7) against its side */
      if (key === 'II') { const x = xs.II, y = II_HEAD_Y, ax = II_HEAD_R + 6.7 - 1; return { from:{ x:x - ax - 10, y:-d * (y + 24) }, at:{ x:x - ax, y:-d * y }, away:{ x:x - ax - 24, y:-d * (y + 26) } }; }
      const x = complexX;
      return { from:{ x:x - 34, y:-d * (H + 30) }, at:{ x:x - 15, y:-d * (H + 13) }, away:{ x:x - 40, y:-d * (H + 34) } };
    }
    /* AT PSI THE CARRIER IS THE ACCEPTOR, not the fuel: NADP⁺ arrives empty
       and leaves as NADPH, the reverse of NADH at complex I. */
    function fuelArrive(key, f) {
      const nadp = key === 'PSI';
      if (!P.showFuel || chips[key]) return;
      if (!nadp && (!f || !CHEM.SPENT[f])) return;   // light: nothing arrives, and nothing should be drawn
      /* A carrier fed by hand is already on stage, waiting: it is the one that docks. */
      const w = waiting[key] && waiting[key][0] && waiting[key][0].boarding ? waiting[key].shift() : null;
      const shuttle = !!(w && w.shuttle);
      const dock = dockOf(key, shuttle);
      const succ = key === 'II' && P.names !== 'intro' && !shuttle;
      const g = w ? w.obj : fuelToken(key, f);
      if (!w) root.add(g);
      const from = w || dock.from;
      chips[key] = { obj:g, shuttle, spentName: succ ? 'fumarate' : nadp ? 'NADPH' : CHEM.SPENT[f], x:from.x, y:from.y, z:from.z || 0, to:dock.at, fade:1, spent:false };
      seat(g, chips[key].x, chips[key].y, chips[key].z);
    }
    function fuelToken(key, f, shuttle) {
      if (shuttle) return buildToken(f, RESP.carrier, 2);
      if (key === 'II' && P.names !== 'intro') return buildToken('succinate', RESP.carrier, 1);
      if (key === 'PSI') return buildToken('NADP⁺', PHO.carrier, 2);
      return buildToken(f === 'FADH2' ? 'FADH₂' : f, RESP.carrier, 2);
    }

    /* ---- carriers fed by hand, waiting their turn ----
       feed() puts the carrier on stage AT ONCE, rising out of the deep matrix
       and hanging below its complex, so a click is always answered by a
       molecule. The complex takes them one per turn, oldest first; a full
       queue refuses the feed, and `state().waiting` says so before a page
       offers the button. Thylakoid light has no token and never waits. */
    const WAIT_MAX = 3, WAIT_SPEED = 45, WAIT_DEPTH = 90;
    const waiting = {};
    function waitSpot(key, i, shuttle) {
      const d = pumpDir(), from = dockOf(key, shuttle).from, s = shuttle ? -1 : 1;
      return { x: from.x - 6 + i * 14 * (i % 2 ? 1 : -1), y: from.y - s * d * (8 + i * 16), z: 0 };
    }
    function enqueue(key, f, shuttle) {
      const q = waiting[key] || (waiting[key] = []);
      if (q.length >= WAIT_MAX) return false;
      const d = pumpDir(), spot = waitSpot(key, q.length, shuttle);
      const g = fuelToken(key, f, shuttle);
      root.add(g);
      /* a shuttled NADH starts in the cytosol, above the outer membrane */
      const y0 = shuttle ? d * (outerOn() ? OUTER_GAP + 30 : H_() + 50) : -d * (H_() + WAIT_DEPTH);
      const w = { obj:g, f, shuttle: !!shuttle, x: spot.x + rnd(-30, 30), y: y0, z: rnd(-10, 10), t: rnd(0, 6), boarding: false };
      seat(g, w.x, w.y, w.z);
      q.push(w);
      return true;
    }
    function tickWaiting(dt) {
      for (const key of Object.keys(waiting)) {
        const q = waiting[key];
        q.forEach((w, i) => {
          w.t += dt;
          const spot = waitSpot(key, i, w.shuttle);
          approach(w, { x: spot.x + Math.sin(w.t * 0.9) * 3, y: spot.y + Math.cos(w.t * 1.3) * 2, z: 0 }, dt, WAIT_SPEED);
        });
        /* The next one boards when the machine is free and the last carrier has gone. */
        const r = key === 'complex' ? lumped : RUN[key];
        if (q.length && !q[0].boarding && !pulse[key] && !r.busy && !chips[key]) {
          q[0].boarding = true;
          pulse[key] = q[0].f; r.kick();
        }
      }
    }
    function clearWaiting() {
      for (const key of Object.keys(waiting)) { for (const w of waiting[key]) dropToken(w.obj); waiting[key].length = 0; }
    }
    function fuelSpend(key) {
      const c = chips[key];
      if (!c || c.spent) return;
      relabel(c.obj, c.spentName, 8.0);
      c.spent = true;
      c.to = dockOf(key, c.shuttle).away;
    }
    function tickFuel(dt) {
      for (const key of Object.keys(chips)) {
        const c = chips[key];
        const there = approach(c, c.to, dt, FUEL_SPEED);
        if (there && !c.spent) c.docked = true;
        if (c.spent && there) { leaving.push(c); delete chips[key]; }
      }
      /* A SPENT CARRIER IS A FREE MOLECULE: NAD⁺ wanders back into the matrix
         to be reduced again, so it drifts off the side of the frame instead
         of vanishing beside the complex. Out of `chips`, so the next carrier
         need not wait for it. Kept in the band between the membrane and the
         drawn floor of the compartment. */
      const d = pumpDir(), H = H_(), floor = Math.min(P.bounds && P.bounds.down != null ? P.bounds.down : P.extent, P.extent) - 10;
      for (let i = leaving.length - 1; i >= 0; i--) {
        const c = leaving[i];
        if (!c.vx) { c.vx = (c.x < 0 ? -1 : 1) * rnd(10, 16); c.vy = rnd(-6, 6); }
        c.vy = Math.max(-14, Math.min(14, c.vy + rnd(-40, 40) * dt));
        c.x += c.vx * dt; c.y += c.vy * dt;
        /* a shuttled NAD⁺ stays on the outer side it came from */
        const s = c.shuttle ? -1 : 1, depth = -s * d * c.y;
        const lo = c.shuttle ? HALF + 12 : H + 14, hi = c.shuttle ? (outerOn() ? OUTER_GAP - 12 : H + 60) : floor;
        if (depth < lo) { c.y = -s * d * lo; c.vy = -s * d * Math.abs(c.vy); }
        if (depth > hi) { c.y = -s * d * hi; c.vy = s * d * Math.abs(c.vy); }
        seat(c.obj, c.x, c.y, 0);
        if (Math.abs(c.x) > LEAVE_X) { c.fade -= dt / FUEL_FADE; fade(c.obj, c.fade); }
        if (c.fade <= 0) { dropToken(c.obj); leaving.splice(i, 1); }
      }
    }
    function clearFuel(key) {
      for (const k of key ? [key] : Object.keys(chips)) {
        if (!chips[k]) continue;
        dropToken(chips[k].obj);
        delete chips[k];
      }
      if (!key) { for (const c of leaving) dropToken(c.obj); leaving.length = 0; }
    }

    /* ---- oxygen, where the electrons end ----
       COMPLEX IV AT ITS REAL RATIO: O₂ + 4e⁻ + 4H⁺ → 2H₂O. A turn brings two
       electrons, so ONE O₂ STAYS BOUND THROUGH TWO TURNS.
       EVERYTHING RESPECTS THE GATES. O₂ is nonpolar and reaches the heme a₃ /
       Cu_B site through a hydrophobic channel from the bilayer, so it comes
       down from the cytosol into the membrane beside IV and slides in sideways, never through a
       proton door. The two substrate H⁺ of a turn enter from the matrix
       while the matrix side is open (load-H), alongside the pumped ones.
       Water forms in the site when the fourth electron lands and leaves to
       the matrix only once that side reopens (open-in).
       THE PROTONS THAT JOIN IT ARE DRAWN, NOT DEBITED: the drawn pool is the
       gradient's whole budget, and emptying it here would stall the chain
       for a reason that is not biology. */
    const O2_SPEED = 40, WATER_FADE = 1.2, WATER_MAX = 24, SNAP = 9;
    const E_PER_O2 = 4, E_PER_TURN = 2;
    let o2 = null;
    const o2Riders = [], waters = [];
    const o2X = () => split() ? xs.IV : complexX;
    const ivH = () => split() ? CX.IV.height : H_();
    const ivR = () => split() ? SPEC.IV.R : CPX_R;
    const o2Site = () => ({ x: o2X() + 3, y: -pumpDir() * HALF * 0.35, z: 0 });
    /* The pill goes on an UNSCALED wrapper: smallMolecule scales its group by
       K_(), and a tag inside it came out several times the NADH's. */
    function tagged(mol, name) {
      const g = new THREE.Group(), tag = kit.pill(name, 6.4);
      tag.position.set(0, 7.0, 0);
      g.add(mol, tag); g.userData.tag = tag;
      return g;
    }
    const untag = obj => { const tag = obj.userData.tag; if (tag) { kit.forget(tag); obj.remove(tag); obj.userData.tag = null; } };
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
      const supplied = stocked() && P.fuel && CHEM.SPENT[P.fuel] && P.fuelRate > 0 && P.oxygen !== false;
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
    function o2Spawn(fuel) {
      if (!P.showFuel || P.oxygen === false || o2) return;
      if (CHEM.ACCEPTOR[fuel] !== 'O2') return;
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
    function o2Arrive(fuel) {
      if (!P.showFuel || !o2Ok()) return;
      if (CHEM.ACCEPTOR[fuel] !== 'O2') return;
      o2Spawn(fuel);
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
    function follow(c, dt, speed) {
      if (!c.path || !c.path.length) return true;
      if (approach(c, c.path[0], dt, speed)) c.path.shift();
      return !c.path.length;
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

    /* ---- the shuttles of the split chain ----
       UBIQUINONE MOVES INSIDE THE MEMBRANE. It is oily, so it is drawn at the
       height of the tails, just in front of the cut face where it cannot pass
       through a protein on its way. It picks up a pair of electrons at I or
       II and becomes ubiquinol, walks to III, hands them over and walks back
       as ubiquinone. Two of them, so one can be on its way while the other
       waits.

       CYTOCHROME C STAYS ON THE OUTER FACE, in the intermembrane space. It
       takes ONE electron, so complex III loads two per ubiquinol; each walks
       to IV, gives its electron up, and walks home. Neither shuttle is
       consumed, which is the same fact as NAD⁺ going back.

       They are also how the chain backs up. With no O₂, IV cannot take the
       cytochromes' electrons, so they wait loaded at IV; III then has no
       empty cytochrome to load and holds its ubiquinol; I has no ubiquinone
       left and stops, however much NADH is waiting. */
    const Q_Z = 6, Q_SPEED = 40, C_SPEED = 36;
    const qTokens = [], cTokens = [];
    let shuttleCtx = null;
    /* AT REST IN THE LIPID, between the last donor and the hub, where no protein stands. */
    const qHome = i => { const L = line(); return { x: (xs[L.rest] + xs[L.hub]) / 2 + (i ? 5 : -5), y: 0, z: i ? -Q_Z : Q_Z }; };
    /* A quinone site is inside the membrane part of the complex, so it docks
       at the protein's edge on the side it came from, not at its axis. Each
       quinone has its own slot, the second one body-width further out, so
       one waiting behind another is two objects rather than one stacked. */
    const qDock = (key, fromX, i) => {
      const s = Math.sign(fromX - xs[key]) || -1;
      return { x: xs[key] + s * (SPEC[key].R - 3 + (i ? 11 : 0)), y: 0, z: Q_Z, key };
    };
    /* IT GOES AROUND A PROTEIN, NOT THROUGH ONE. Passing a complex it is not
       docking at, it first steps back behind it, crosses, and comes forward
       again; x waits while z clears. Real ubiquinone wanders a shared pool at
       random; this one walks to where it is going so a student can follow one
       pair of electrons, with a wobble in the tails so it does not read as a
       conveyor. */
    function qMove(q, dt) {
      const to = q.to, dx = to.x - q.x;
      const nx = q.x + Math.sign(dx) * Math.min(Math.abs(dx), Q_SPEED * dt);
      let zWant = to.z, blocked = false;
      for (const k of line().keys) {
        if (!CX[k].group.visible || k === to.key) continue;
        const clearR = SPEC[k].R * (1 + SPEC[k].lobe) + 5;
        if (Math.abs(nx - xs[k]) < clearR || Math.abs(q.x - xs[k]) < clearR) { zWant = -(clearR + 2); blocked = true; }
      }
      q.z += (zWant - q.z) * Math.min(1, dt * 6);
      if (!blocked || Math.abs(q.z - zWant) < 2) q.x = nx;
      q.t = (q.t || 0) + dt;
      q.y = Math.sin(q.t * 2.3 + q.i * 2) * 3;
      seat(q.obj, q.x, q.y, q.z);
      return Math.abs(to.x - q.x) < 0.5 && Math.abs(to.z - q.z) < 1.5;
    }
    const cHome = i => ({ x: xs[line().hub] - 4 + (i ? 5 : -5), y: pumpDir() * cSeat(line().hub), z: 0 });
    const cDock = i => ({ x: xs[line().end] - 4 + (i ? 5 : -5), y: pumpDir() * cSeat(line().end), z: 0 });
    /* Electrons the hub's shuttle takes a trip: 2 per pair over this. */
    const cCarries = () => CHEM.CARRIES[ROW(line().hub).gives];
    function ePill(on, tok) {
      if (tok.e) { kit.forget(tok.e); tok.obj.remove(tok.e); tok.e = null; }
      if (!on) return;
      tok.e = kit.pill('e⁻', 5.2);
      tok.e.position.set(0, -6.5 * pumpDir() * -1, 0);
      tok.obj.add(tok.e);
    }
    /* ---- electrons, drawn ----
       THE CHAIN IS A PATH FOR ELECTRONS, so they are drawn walking it: off
       the carrier, through the complex, onto the shuttle, and on. A pair
       leaves NADH or FADH₂ and rides ubiquinone; III splits it onto two
       cytochromes c, one each; IV collects them for O₂. The shuttle waits for
       its electrons before it leaves, so the picture cannot run ahead of them.
       DRAWN OVER THE PROTEIN (no depth test): the route runs through
       cofactors inside it, and a hidden electron is a missing step. The
       route inside a complex is schematic, entry face to exit site. */
    const E_SPEED = 55, E_R = 1.9;
    const eTokens = [];
    /* The minus is drawn, not typed, for atomkit's charge() reason: a glyph
       sits on the math axis, not the dot's centre. One texture for all. */
    let eMinusMat = null;
    function eMinus() {
      if (eMinusMat) return eMinusMat;
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d');
      x.strokeStyle = kit.labelInk('H'); x.lineWidth = 12; x.lineCap = 'round';
      x.beginPath(); x.moveTo(16, 32); x.lineTo(48, 32); x.stroke();
      eMinusMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, depthWrite: false, transparent: true });
      return eMinusMat;
    }
    function makeE() {
      const m = new THREE.Mesh(new THREE.SphereGeometry(E_R, 12, 8),
        new THREE.MeshBasicMaterial({ color: RESP.electron, depthTest: false, depthWrite: false, transparent: true }));
      m.renderOrder = 30;
      const halo = new THREE.Mesh(new THREE.SphereGeometry(E_R * 1.9, 12, 8),
        new THREE.MeshBasicMaterial({ color: RESP.electron, depthTest: false, depthWrite: false, transparent: true, opacity: 0.25 }));
      halo.renderOrder = 29;
      const g = new THREE.Group(); g.add(halo, m, new THREE.Sprite(eMinus()));
      g.children[2].scale.set(E_R * 1.5, E_R * 1.5, 1); g.children[2].renderOrder = 31;
      return g;
    }
    const posOf = t => ({ x: t.x, y: t.y, z: t.z || 0 });
    /* send(n, from, via, onto, done): n electrons from a point along `via`
       to ride token `onto` (or stop at its last point), then done(). */
    function sendE(n, from, via, onto, done) {
      let left = n;
      for (let i = 0; i < n; i++) {
        const e = { obj: makeE(), x: from.x, y: from.y, z: from.z || 0, path: via.map(p => Object.assign({}, p)), onto, i, n,
                    done: () => { if (--left === 0 && done) done(); } };
        e.x += (i - (n - 1) / 2) * 3;
        root.add(e.obj); seat(e.obj, e.x, e.y, e.z); eTokens.push(e);
      }
    }
    /* Electrons riding `tok` leave it along `via` for `onto`. */
    function handOff(tok, via, onto, done) {
      const es = eTokens.filter(e => e.ride === tok);
      if (!es.length) { if (done) done(); return; }
      let left = es.length;
      es.forEach((e, i) => {
        e.ride = null; e.path = via.map(p => Object.assign({}, p)); e.onto = Array.isArray(onto) ? onto[i] : onto;
        e.done = () => { if (--left === 0 && done) done(); };
      });
    }
    function tickE(dt) {
      for (let i = eTokens.length - 1; i >= 0; i--) {
        const e = eTokens[i];
        if (e.ride) {
          const r = e.ride, off = (e.i - (e.n - 1) / 2) * 3.4;
          e.x = r.x + off; e.y = r.y - pumpDir() * 5; e.z = (r.z || 0) + 2;
          seat(e.obj, e.x, e.y, e.z);
          continue;
        }
        const target = e.path.length ? e.path[0] : e.onto ? posOf(e.onto) : null;
        if (target && !approach(e, target, dt, E_SPEED)) continue;
        if (e.path.length) { e.path.shift(); continue; }
        const done = e.done; e.done = null;
        if (e.onto && e.onto.obj) e.ride = e.onto;
        else { dropToken(e.obj); eTokens.splice(i, 1); }
        if (done) done();
      }
    }
    function clearE() { for (const e of eTokens) dropToken(e.obj); eTokens.length = 0; }
    /* waypoints inside a complex: its face on side s (+1 pumped-into, -1 loading), and mid-membrane */
    const faceOf = (key, s, dx = 0) => ({ x: xs[key] + dx, y: s * pumpDir() * CX[key].height * 0.75, z: 0 });
    const midOf = (key, dx = 0) => ({ x: xs[key] + dx, y: 0, z: 0 });

    /* ---- the Q cycle's protons ----
       A QUINONE TAKES TWO H⁺ WITH ITS TWO ELECTRONS: reduced at I, II or
       PSII, it picks them up from the loading side and carries them as
       ubiquinol (plastoquinol). At the hub they are let go on the far side,
       with more the hub takes in at its Qi site, and no channel through it.
       A real turn runs two quinols through Qo and one back through Qi; this
       draws the net. The drawn totals match the table: I 4 + quinone 2 +
       III 2 + IV 2 = 10 for NADH. */
    const Q_H = 2;
    function protonateQ(q) {
      const from = -pumpDir();
      const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === from)
        .sort((a, b) => ((a.x - q.x) ** 2 + a.y * a.y) - ((b.x - q.x) ** 2 + b.y * b.y)).slice(0, Q_H);
      q.h = pool;
      for (const t of pool) t.aboard = true;
    }
    function freeQH(q) { for (const t of q.h || []) t.aboard = false; q.h = []; }
    function tickQH(q) {
      const k = 0.15;
      (q.h || []).forEach((t, i) => {
        const tx = q.x + (i ? 3.2 : -3.2), ty = q.y + pumpDir() * 4.5, tz = (q.z || 0) + 2;
        t.x += (tx - t.x) * k; t.y += (ty - t.y) * k; t.z += (tz - t.z) * k;
        t.obj.position.set(t.x, t.y, t.z);
      });
    }
    function buildShuttles() {
      if (qTokens.length && shuttleCtx === P.context) return;
      dropShuttles();
      shuttleCtx = P.context;
      const L = line();
      for (let i = 0; i < 2; i++) {
        const q = { obj: buildToken(L.q[0], L.qColor, 1), i, state: 'free', charged: false };
        Object.assign(q, qHome(i)); q.to = qHome(i);
        root.add(q.obj); seat(q.obj, q.x, q.y, q.z); qTokens.push(q);
        const c = { obj: buildToken(L.c, L.cColor, 1), i, state: 'home', e: null };
        c.obj.children[0].scale.set(1.4, 0.8, 1);   // oblong, so it does not read as an O₂
        Object.assign(c, cHome(i)); c.to = cHome(i);
        root.add(c.obj); seat(c.obj, c.x, c.y, 0); cTokens.push(c);
      }
    }
    function dropShuttles() {
      for (const q of qTokens) freeQH(q);
      for (const t of qTokens.concat(cTokens)) { ePill(false, t); dropToken(t.obj); }
      qTokens.length = 0; cTokens.length = 0;
    }
    function homeShuttles() {
      for (const q of qTokens) freeQH(q);
      for (const q of qTokens) { if (q.state !== 'free') relabel(q.obj, line().q[0], 8.0); q.state = 'free'; q.charged = false; q.to = qHome(q.i); }
      for (const c of cTokens) { ePill(false, c); c.state = 'home'; c.to = cHome(c.i); }
      clearE();
    }
    function tickShuttles(dt) {
      for (const q of qTokens) {
        const there = qMove(q, dt);
        tickQH(q);
        if (q.state === 'toDonor' && there && q.charged) {
          relabel(q.obj, line().q[1], 8.0);
          q.state = 'toHub'; q.to = qDock(line().hub, q.x, q.i);
        } else if (q.state === 'toHub' && there) q.state = 'atHub';
      }
      for (const c of cTokens) {
        const there = approach(c, c.to, dt, C_SPEED);
        if (c.state === 'toEnd' && there) c.state = 'atEnd';
        else if (c.state === 'returning' && there) c.state = 'home';
      }
    }

    /* ---- the proton circuit's doors ----
       `protonRef` is the count each side started with, so pH is read as a
       departure from where the page set it. */
    let protonRef = null, pumpedTotal = 0, protonsLeaked = 0, protonsThroughSynthase = 0, protonsForExport = 0;
    /* A PROTON GOES ONE WAY THROUGH A DOOR: down the proton-motive force.
       Off the headcount, not state(), which walks every traveller. */
    const protonDir = () => CHEM.synthaseDirection(eng.sideCount('H'), eng.mV, { ref: protonRef, dir: pumpDir() });
    const pmfNow = () => CHEM.protonState(eng.sideCount('H'), eng.mV, protonRef, pumpDir()).pmf;
    const backPressure = () => Math.max(0, 1 - pmfNow() / CHEM.PMF_STALL);
    /* A PUMPING MEMBRANE WITH NO PROTONS IS A FROZEN ONE. Generated apps
       mounted it that way, so a chain gets a gradient's worth by default; a
       split chain pumps ten a NADH and gets more. Any `H` key, 0 included, is
       the page choosing. */
    const DEFAULT_PROTONS = 22, SPLIT_PROTONS = 30, DEFAULT_WATER = 30;
    const hasChain = pr => pr && (pr.complex || ALL.some(k => pr[k]));
    function withProtons(c) {
      if (P.context === 'plasma' || !CHEM.CONTEXTS[P.context] || !hasChain(P.proteins)) return c;
      if (c && ((c.inside && 'H' in c.inside) || (c.outside && 'H' in c.outside))) return c;
      const n = P.chain === 'split' ? SPLIT_PROTONS : DEFAULT_PROTONS;
      const side = s => Object.assign({ water: DEFAULT_WATER }, (c && c[s]) || {}, { H: n });
      return { inside: side('inside'), outside: side('outside') };
    }

    /* ---- one machine's cycle ----
       Driven exactly as the pump is, off chemiosmosis.js's phase table, so
       the picture cannot disagree with the cycle, and the two beats where it
       comes back EMPTY are drawn rather than cut. A runner is one complex:
       `rate` is what pays (0 when nothing does), `ready` is whether its
       electrons are there to take, `load` claims them, and the phase changes
       are where the tokens are handed on. */
    /* A turn already begun finishes: the energy was spent at the occlusion,
       and a machine frozen mid-carry strands a proton inside the protein. */
    const CPX_COAST = 0.35;
    const period = () => Math.max(0.1, P.complexSeconds) * (split() ? 0.7 : 1);
    function runner(o) {
      const r = { key: o.key, t: 0, phase: '', cargo: [], busy: false, starved: false, warned: false, st: null, turns: 0,
                  gates: { top: NaN, bottom: NaN } };
      /* ALL OR NOTHING, the pump's rule: a partly loaded machine turns with an
         empty seat, and the seat is where a student is counting. */
      function recruit(n) {
        if (!n) return true;
        const from = -pumpDir(), x = o.x();
        const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === from)
          .sort((a, b) => ((a.x - x) ** 2 + a.y * a.y) - ((b.x - x) ** 2 + b.y * b.y));
        if (pool.length < n) return false;
        for (const t of pool.slice(0, n)) { t.aboard = true; r.cargo.push(t); }
        return true;
      }
      function release(to) {
        const x = o.x(), H = o.part.height;
        for (const t of r.cargo) {
          t.aboard = false;
          t.y = to * H * 1.15; t.x = x + rnd(-16, 16); t.z = rnd(-8, 8);
          t.obj.position.set(t.x, t.y, t.z);
          t.lane = null; t.bounded = true;
          eng.repick(t); t.vy = Math.abs(t.vy) * to;
          /* NO exitPt: that holds a traveller off every funnel until it is
             ESCAPE_R away, and under the outer membrane's lid a pumped proton
             almost never gets that far, so the synthase starved beside a full
             gradient. The complex is not a pore; nothing can recapture it. */
        }
        r.cargo.length = 0;
      }
      r.kick = () => { r.t = CHEM.Complex.startOf('load-H'); r.phase = ''; };
      r.reset = () => { for (const t of r.cargo) t.aboard = false; r.cargo.length = 0; r.busy = false; r.t = 0; r.phase = ''; r.st = null; r.turns = 0; };
      r.run = dt => {
        if (!o.part.group.visible) { r.st = null; return null; }
        const n = o.n;
        const paying = o.rate();
        /* A LOADED MACHINE WAITS FOR ITS CARRIER TO DOCK: a hand-fed one can
           still be rising from deep in the matrix, and spending it on
           `occlude` before it arrives draws a fuel that never touched it. */
        const rate = r.busy && chips[o.key] && !chips[o.key].spent && !chips[o.key].docked ? 0
          : paying > 0 ? paying : r.busy ? CPX_COAST : 0;
        if (rate > 0) {
          const was = r.t;
          r.t = (r.t + dt * rate / period()) % 1;
          if (r.t < was && o.onWrap) o.onWrap();
        }
        let st = CHEM.Complex.at(r.t, n);
        /* NOTHING TO PAY WITH, NOTHING TO TAKE, OR NOTHING TO CARRY: hold at
           the moment of binding rather than turning an empty machine. READ
           LIVE, not from `paying`, which was measured before the step: a
           stale value let one feed() buy two turns. */
        if (st.phase === 'load-H' && !r.busy) {
          const live = o.rate() > 0, ready = o.ready();
          if (!live || !ready || !recruit(n)) {
            r.t = CHEM.Complex.startOf('load-H'); st = CHEM.Complex.at(r.t, n);
            /* Busy protons are a pause; NO protons on the loading side is a
               page that forgot them, and it gets said once. */
            r.starved = live && ready && n > 0 && !travellers.some(t => t.kind === 'H' && Math.sign(t.y) === -pumpDir());
            if (r.starved && !r.warned) {
              r.warned = true;
              console.warn('Chemiosmosis: the complex is fuelled but ' + CHEM.sideName(P.context, pumpDir() > 0 ? 'inside' : 'outside') + ' has no protons to load. Give contents an H count on that side.');
            }
          } else {
            /* The carrier arrives when a turn is paid for, not when the
               machine idles at binding, or an unfed chain parks its NADH. */
            r.busy = true; r.starved = false; if (o.load) o.load(); if (o.onLoad) o.onLoad();
          }
        }
        if (st.phase !== r.phase) {
          if (st.phase === 'occlude' && o.onOcclude) o.onOcclude();
          if (o.onPhase) o.onPhase(st.phase);
          /* The proton is set down at the START of the empty half, so the two
             beats that follow are visibly carrying nothing. */
          if (st.phase === 'shut-out' && r.busy) {
            const m = r.cargo.length, d = pumpDir();
            r.busy = false; r.turns++;
            if (m) {
              pumpedTotal += m; eng.crossed.H += d * m; eng.chargeOut += d * m;
              eng.mV = eng.clampMV(P.mvPerIon * eng.chargeOut);
              release(d); eng.emit('pumped', pumpedTotal);
            }
          }
          r.phase = st.phase;
        }
        /* MIRRORED WHEN IT PUMPS DOWN: `u` runs −1 at the loading mouth to +1
           at the far one, so the direction puts the loading mouth at the
           bottom in a mitochondrion and the top in a thylakoid. A machine
           with no path through keeps both gates shut. */
        const d = pumpDir();
        const gated = n && !o.place;
        const top = gated ? (d > 0 ? st.gates.top : st.gates.bottom) : 0, bottom = gated ? (d > 0 ? st.gates.bottom : st.gates.top) : 0;
        if (top !== r.gates.top || bottom !== r.gates.bottom) { o.part.setGates(top, bottom); r.gates.top = top; r.gates.bottom = bottom; }
        const x = o.x(), gap = r.cargo.length > 2 ? 4.0 : 5.5;
        if (o.place) { o.place(r.cargo, st, x); r.st = st; return st; }
        for (let i = 0; i < st.cargo.length; i++) {
          const t = r.cargo[i];
          if (!t) continue;
          const ty = st.cargo[i].u * d * o.part.height, tx = x + (i - (st.cargo.length - 1) / 2) * gap;
          t.x += (tx - t.x) * 0.18; t.z += (0 - t.z) * 0.18; t.y += (ty - t.y) * 0.18;
          t.obj.position.set(t.x, t.y, t.z);
        }
        r.st = st;
        return st;
      };
      return r;
    }
    /* What is paying a donor: a one-shot from feed() at its own full rate,
       else the supply if it is this donor's fuel. */
    /* II and PSII pump nothing, so the gradient does not push back on them.
       A photosystem stalls the honest way instead: the quinones are all
       full and b6f, which does feel the lumen's pH, is not taking them. */
    const donorRate = (key, fuel, oxygenGate) => {
      const f = pulse[key] || (P.fuel === fuel ? fuel : null);
      if (!f) return 0;
      return CHEM.complexRate(f, pulse[key] ? 1 : P.fuelRate, ROW(key).pumps ? pmfNow() : 0, oxygenGate ? o2Ok() : true);
    };
    const lightRate = () => P.fuel === 'light' ? CHEM.complexRate('light', P.fuelRate, 0) : 0;

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
    const photons = [], psiiWater = [], psiiO2 = [], riders = [];
    const lightLedger = { photons: 0, waterSplit: 0, o2Released: 0, nadphMade: 0, protonsFromWater: 0, protonsToNADPH: 0 };
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
    const reMV = () => { eng.mV = eng.clampMV(P.mvPerIon * eng.chargeOut); };
    function splitWater() {
      for (const w of psiiWater.splice(0)) dropToken(w.obj);
      const at = oecAt(), d = pumpDir(), n = CHEM.PHOTO_CHAIN.PSII.fromWater;
      let made = 0;
      for (let i = 0; i < n; i++)
        made += eng.scatter('H', 1, d, { x: at.x + (i - (n - 1) / 2) * 7, y: at.y, z: rnd(-4, 4) }).length;
      if (made) {
        lightLedger.protonsFromWater += made;
        if (protonRef != null) protonRef += made / 2;
        eng.chargeOut += d * made; reMV();
      }
      lightLedger.waterSplit++;
      if (lightLedger.waterSplit % (CHEM.E_PER_O2 / CHEM.CARRIES.H2O) === 0) {
        lightLedger.o2Released++;
        const o = { obj: tagged(eng.smallMolecule('o2'), 'O₂'), x: at.x, y: at.y, to: { x: at.x + 34, y: d * (H_() + 44) }, fade: 1 };
        root.add(o.obj); seat(o.obj, o.x, o.y, 0); psiiO2.push(o);
        eng.emit('oxygen', lightLedger.o2Released);
      }
    }
    function reduceNADP() {
      fuelSpend('PSI');
      lightLedger.nadphMade++;
      eng.emit('nadph', lightLedger.nadphMade);
      const s = -pumpDir(), sideKey = s > 0 ? 'outside' : 'inside';
      const start = (P.contents && P.contents[sideKey] && P.contents[sideKey].H) | 0;
      const bound = CHEM.PHOTO_CHAIN.PSI.fromStroma;
      const want = bound + (eng.sideCount('H')[sideKey] > start ? 1 : 0);
      const x = xs.PSI;
      const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === s)
        .sort((a, b) => ((a.x - x) ** 2 + a.y * a.y) - ((b.x - x) ** 2 + b.y * b.y)).slice(0, want);
      pool.forEach((t, i) => {
        if (i < bound) lightLedger.protonsToNADPH++;
        if (chips.PSI && i < bound) {
          const r = { obj: eng.chargedIon('H'), x: t.x, y: t.y, z: t.z, chip: chips.PSI };
          root.add(r.obj); seat(r.obj, r.x, r.y, r.z); riders.push(r);
        }
        eng.remove(t);
        if (protonRef != null) protonRef -= 0.5;
        eng.chargeOut -= s;
      });
      if (pool.length) reMV();
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
    }
    const lumped = runner({
      key: 'complex', part: COMPLEX, n: CHEM.Complex.PROTONS_PER_CYCLE, x: () => complexX,
      rate: () => {
        const supply = CHEM.complexRate(P.fuel, P.fuelRate, pmfNow(), o2Ok());
        return supply > 0 ? supply : pulse.complex ? CHEM.complexRate(pulse.complex, 1, pmfNow(), o2Ok()) : 0;
      },
      ready: () => true,
      onLoad: () => { const f = pulse.complex || P.fuel; fuelArrive('complex', f); o2Arrive(f); },
      onOcclude: () => { fuelSpend('complex'); o2Reduce(); },
      onPhase: o2Phase,
      /* SPENT AFTER ONE CYCLE: feed() starts the clock at load-H, which is 0,
         so the wrap back past it is the turn ending. */
      onWrap: () => { pulse.complex = null; },
    });
    function donor(key, fuel, more = {}) {
      const r = runner({
        key, part: CX[key], n: ROW(key).pumps, x: () => xs[key],
        rate: () => donorRate(key, fuel, false),
        ready: () => qTokens.some(q => q.state === 'free'),
        load: () => {
          const q = qTokens.filter(q => q.state === 'free').sort((a, b) => Math.abs(a.x - xs[key]) - Math.abs(b.x - xs[key]))[0];
          q.state = 'toDonor'; q.charged = false; q.to = qDock(key, q.x, q.i); r.q = q;
        },
        onLoad: () => { fuelArrive(key, pulse[key] || fuel); if (more.onLoad) more.onLoad(); },
        onOcclude: () => {
          const q = r.q; r.q = null;
          if (q) {
            const chip = chips[key], d = pumpDir();
            const from = chip ? posOf(chip) : key === 'PSII' ? oecAt() : faceOf(key, -1);
            const via = chip && chip.shuttle ? [{ x: xs.II - 6, y: d * HALF * 0.5 }]
                      : key === 'II' ? [{ x: xs.II, y: -d * II_HEAD_Y }, { x: xs.II, y: -d * HALF * 0.5 }]
                      : key === 'I' ? [{ x: xs.I - 5, y: -d * (CX.I.height + 10) }, faceOf('I', -1), midOf('I')]
                      : [midOf(key)];
            sendE(E_PER_TURN, from, via, q, () => { q.charged = true; protonateQ(q); });
          }
          fuelSpend(key); if (more.onOcclude) more.onOcclude();
        },
        onWrap: () => { pulse[key] = null; },
      });
      return r;
    }
    /* THE HUB: III, or b6f. Takes a reduced quinone, pumps, and loads the
       one-electron shuttles, two per pair. */
    function hub(key) {
      /* Qi takes protons from the loading side, Qo lets all of them go on the
         far side, both inside the membrane; no gate opens. */
      const H = () => CX[key].height, QI = { dx: 6, y: -0.45 }, QO = { dx: -6, y: 0.45 };
      const r = runner({
        key, part: CX[key], n: ROW(key).pumps - Q_H, x: () => xs[key],
        place(cargo, st, x) {
          const d = pumpDir(), k = 0.16, out = st.phase === 'release-H';
          const toQo = st.phase === 'turn-out' || out;
          cargo.forEach((t, i) => {
            const qi = i < ROW(key).pumps - Q_H && !toQo;
            const s = qi ? QI : QO, spread = (i - (cargo.length - 1) / 2) * 3.2;
            const tx = x + s.dx + spread, ty = out ? d * (H() + 4) : d * s.y * HALF;
            t.x += (tx - t.x) * k; t.y += (ty - t.y) * k; t.z += (0 - t.z) * k;
            t.obj.position.set(t.x, t.y, t.z);
          });
        },
        rate: backPressure,
        ready: () => qTokens.some(q => q.state === 'atHub') && cTokens.filter(c => c.state === 'home').length >= E_PER_TURN / cCarries(),
        load: () => {
          const q = qTokens.find(q => q.state === 'atHub'); q.state = 'inHub'; r.q = q;
          r.cargo.push(...(q.h || [])); q.h = [];
          r.c = cTokens.filter(c => c.state === 'home').slice(0, E_PER_TURN / cCarries());
          for (const c of r.c) c.state = 'held';
        },
        onOcclude: () => {
          const q = r.q;
          const cs = r.c || []; r.c = null;
          const go = () => { for (const c of cs) if (c.state === 'held') { c.state = 'toEnd'; c.to = cDock(c.i); } };
          const via = [midOf(key), faceOf(key, 1)];
          if (q) {
            handOff(q, via, cs.length === 1 ? cs[0] : cs, go);
            relabel(q.obj, line().q[0], 8.0); q.state = 'free'; q.charged = false; q.to = qHome(q.i); r.q = null;
          } else go();
        },
      });
      return r;
    }
    /* THE END: IV hands the pair to O₂, PSI to NADP⁺. */
    function terminal(key, more) {
      return runner({
        key, part: CX[key], n: ROW(key).pumps, x: () => xs[key],
        rate: more.rate,
        ready: () => more.ready() && cTokens.filter(c => c.state === 'atEnd').length * cCarries() >= E_PER_TURN,
        load: () => {
          const end = line().end, site = end === 'IV' ? o2Site() : chips.PSI ? posOf(chips.PSI) : faceOf(end, -1);
          for (const c of cTokens.filter(c => c.state === 'atEnd').slice(0, E_PER_TURN / cCarries())) {
            handOff(c, [faceOf(end, 1, -3), midOf(end)], site);
            ePill(false, c); c.state = 'returning'; c.to = cHome(c.i);
          }
        },
        onLoad: more.onLoad, onOcclude: more.onOcclude, onWrap: more.onWrap, onPhase: more.onPhase,
      });
    }
    const RUN = {
      I: donor('I', 'NADH'),
      II: donor('II', 'FADH2'),
      III: hub('III'),
      IV: terminal('IV', { rate: backPressure, ready: () => o2Ok(),
        onLoad: () => o2Arrive('NADH'), onOcclude: () => o2Reduce(), onPhase: o2Phase }),
      PSII: donor('PSII', 'light', { onLoad: () => { flash('PSII'); waterArrive(); }, onOcclude: () => { flash('PSII'); splitWater(); } }),
      b6f: hub('b6f'),
      PSI: terminal('PSI', {
        rate: () => credit.PSI > 0 ? 1 : lightRate(),
        ready: () => true,
        onLoad: () => { flash('PSI'); fuelArrive('PSI'); },
        onOcclude: () => { flash('PSI'); reduceNADP(); },
        onWrap: () => { if (credit.PSI > 0) credit.PSI--; },
      }),
    };
    const runners = () => split() ? line().keys.map(k => RUN[k]) : [lumped];
    const leadRunner = () => !split() ? lumped : photo() ? RUN.PSII : (P.fuel === 'FADH2' || pulse.II ? RUN.II : RUN.I);
    function resetChain() {
      lumped.reset(); for (const k of ALL) RUN[k].reset();
      pulse.complex = pulse.I = pulse.II = pulse.PSII = null; credit.PSI = 0;
      clearFuel(); clearWaiting(); clearO2(); clearLight(); clearE();
      if (qTokens.length) homeShuttles();
    }

    /* ONE CARRIER, ONE TURN — the chain's answer to the pump's spend(), and
       independent of the supply switch: turn the supply off, send one, and
       watch it go through once. In a split chain the one NADH turns I, and
       the ubiquinol it makes turns III, and III's cytochromes turn IV. */
    /* opts.shuttle: an NADH made in the cytosol, which enters at ubiquinone by
       the glycerol-phosphate shuttle and so is worth what FADH₂ is. */
    function feed(fuel, opts = {}) {
      if (!hasChain(P.proteins)) return false;
      const f = fuel || P.fuel || (P.context === 'thylakoid' ? 'light' : 'NADH');
      if (!CHEM.FUELS[f]) { console.warn('Chemiosmosis: no fuel named ' + f + '; have ' + Object.keys(CHEM.FUELS).join(', ')); return false; }
      o2Spawn(f);
      if (split()) {
        const shuttle = !!opts.shuttle && f === 'NADH' && P.context === 'mitochondrion';
        const donors = line().donors, key = shuttle ? 'II' : Object.keys(donors).find(k => donors[k] === f);
        if (!key) { console.warn(`Chemiosmosis: a split chain in a ${P.context} takes ${Object.values(donors).join(' or ')}, not ${f}`); return false; }
        if (P.showFuel && CHEM.SPENT[f]) return enqueue(key, f, shuttle);
        pulse[key] = shuttle ? 'FADH2' : f; clearFuel(key); RUN[key].kick();
        if (key === 'PSII') credit.PSI++;
        return true;
      }
      if (!CHEM.complexRate(f, 1, 0, o2Ok())) return false;   // no O₂: the NADH docks and nothing takes its electrons
      if (P.showFuel && CHEM.SPENT[f]) return enqueue('complex', f);
      pulse.complex = f; clearFuel('complex'); lumped.kick();
      return true;
    }

    const at = eng.at;
    let LIB = null;
    /* Called on every context change, before the relayout: runners and shuttles
       from the other line would carry its half-finished turn across. */
    let cardsCtx = null;
    function writeCards(library) {
      LIB = library;
      if (cardsCtx !== null && cardsCtx !== P.context) resetChain();
      cardsCtx = P.context;
      if (P.context === 'mitochondrion') {
        library.outside.card = 'The intermembrane space. Every proton the complexes throw out lands here, so this side goes acidic and positive: that is where the energy from NADH now sits. This space and a chloroplast\'s thylakoid lumen are the same place by descent, both of them the OUTSIDE of the bacterium each organelle came from. That is why a photosynthesis diagram looks flipped against this one.';
        library.inside.card  = 'The matrix. The Krebs cycle runs here and hands its NADH to the complexes in this membrane. Protons leave from this side and come back through the synthase.';
        library.complex.text = split() ? 'complex I' : 'electron transport chain';
        library.complex.card = split() ? library['complex.I'].card
          : 'The whole chain drawn as one machine. NADH hands it electrons, they pass down to oxygen, which becomes water, and each drop pays for protons thrown out. It spends FUEL rather than ATP: turn the fuel off and it stops, which is the whole reason the gradient is a store and not a fixture.';
        library.oxygen.card = O2_CARD.mitochondrion;
      } else if (P.context === 'thylakoid') {
        library.outside.card = 'The stroma, around the outside of the thylakoid disc. ATP and NADPH are made here, and the Calvin cycle spends both to fix carbon. Protons leave from this side and come back through the synthase.';
        library.complex.text = split() ? 'cytochrome b6f' : 'the light-driven chain';
        library.complex.card = split() ? library.b6f.card
          : 'Photosystem II splits water and starts the electrons moving, cytochrome b6f is the one that pumps, and photosystem I lifts them again for NADPH. Drawn as one machine. Light is the fuel, so the dimmer is a rate knob and darkness stops it.';
        const PC = CHEM.PHOTO_CHAIN;
        library.inside.card  = 'The lumen, the space enclosed by the disc. Light drives protons in here, so this is the acidic side: the energy from the photons is now a gradient across this membrane.'
          + (split() ? ` ${CHEM.chainProtons('light')} arrive per pair of electrons: ${PC.PSII.fromWater} from water at PSII, ${PC.b6f.pumps} pumped by b6f.` : '')
          + ' It is the same space as a mitochondrion\'s intermembrane space, both of them the OUTSIDE of the bacterium each organelle came from, which is why the two diagrams are mirrored.';
        library.oxygen.card = O2_CARD.thylakoid;
      }
      if (P.names === 'intro' && P.context === 'mitochondrion') {
        for (const k in INTRO_CARDS) library[k].card = INTRO_CARDS[k];
        if (split()) library.complex.card = INTRO_CARDS['complex.I'];
      }
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
    const O2_CARD = {
      mitochondrion: 'The last stop for the electrons. Each O₂ takes four, and four protons from the matrix, and leaves as two waters. With no oxygen the electrons have nowhere to go and the whole chain stops.',
      thylakoid: 'Waste. PSII pulls electrons out of water, and what is left of two waters is one O₂, which leaves the chloroplast. Every breath you take was split out of water this way.',
    };
    const C = CHEM.CHAIN;
    return {
      keys: Object.assign({ complex:null, synthase:null, leak:null, translocase:null }, Object.fromEntries(ALL.map(k => [k, null]))),
      parts: [COMPLEX, ...ALL.map(k => CX[k]), SYNTH, LEAK, ANT],
      /* PORIN stands in the other sheet, and a barrel setCut leaves shut is
         the one solid object in a cutaway. */
      cutParts: [PORIN],
      tOrder: [['complex', COMPLEX], ['I', CX.I], ['III', CX.III], ['IV', CX.IV], ['II', CX.II], ['b6f', CX.b6f], ['PSII', CX.PSII], ['PSI', CX.PSI], ['synthase', SYNTH], ['leak', LEAK]],
      tFallback: COMPLEX,
      rules: ['H'],
      handles: Object.assign({ complex:COMPLEX, synthase:SYNTH, leak:LEAK }, CX),
      poreGap: () => split() ? SPLIT_GAP : Infinity,
      /* One complex into a row and back, and one row into the other when the
         context flips, so a layout written for any chain runs on the rest. */
      expand(given) {
        const on = ALL.filter(k => given[k]);
        const mean = on.length ? Math.round(on.reduce((s, k) => s + (given[k].x || 0), 0) / on.length) : null;
        if (split()) {
          const keys = line().keys;
          if (!keys.some(k => given[k])) {
            const x = given.complex ? given.complex.x || 0 : mean;
            if (x != null) keys.forEach((k, i) => { given[k] = { x: x + SPLIT_OFFSETS[P.context][i] }; });
          }
          given.complex = null;
          for (const k of ALL) if (!keys.includes(k)) given[k] = null;
        } else {
          if (mean != null && !given.complex) given.complex = { x: mean };
          for (const k of ALL) given[k] = null;
        }
      },
      layout(pr, holes, PORES) {
        COMPLEX.group.visible = !!pr.complex;
        if (pr.complex) { complexX = pr.complex.x; COMPLEX.group.position.x = complexX;
          /* A carrier, like the pump: no kind, so nothing queues in it. */
          holes.push([complexX, holeOf(CPX_R, CPX_LOBE)]); PORES.push({ x:complexX, R:CPX_R, lumen:8.0, kind:null }); }
        for (const k of ALL) {
          const M = CX[k];
          M.group.visible = !!pr[k];
          if (!pr[k]) continue;
          xs[k] = pr[k].x; M.group.position.x = xs[k];
          holes.push([xs[k], holeOf(SPEC[k].R, SPEC[k].lobe)]); PORES.push({ x:xs[k], R:SPEC[k].R, lumen:8.0, kind:null });
        }
        SYNTH.group.visible = !!pr.synthase;
        synthX = pr.synthase ? pr.synthase.x : null;
        if (pr.synthase) { SYNTH.group.position.x = synthX;
          /* the door is the a/c interface, beside the ring's axis */
          holes.push([synthX + SYN_MID, holeOf(SYN_HALFW, SYN_LOBE)]); PORES.push({ x:synthX + LANE_DX, R:C_R + 2, lumen:4, kind:'H', door:'synthase', capture:22, pull:1.8 }); }
        LEAK.group.visible = !!pr.leak;
        if (pr.leak) { LEAK.group.position.x = pr.leak.x; LEAK.setGates(1, 1);
          holes.push([pr.leak.x, holeOf(LEAK_R, LEAK_LOBE)]); PORES.push({ x:pr.leak.x, R:LEAK_R, lumen:7.6, kind:'H', door:'leak', weight:LEAK_PREFERENCE }); }
        ANT.group.visible = !!pr.translocase;
        antX = pr.translocase ? pr.translocase.x : null;
        if (pr.translocase) { ANT.group.position.x = antX; ANT.setGates(1, 1);
          holes.push([antX, holeOf(ANT_R, ANT_LOBE)]); PORES.push({ x:antX, R:ANT_R, lumen:7.0, kind:null }); }
      },
      /* F1 HANGS WHERE THE ATP IS MADE, and complex I's arm and complex II's
         head hang into the matrix: all positioned by sign, not a negative
         scale, which would turn the lighting inside out. */
      orient(d) {
        for (const child of ROTOR.children) child.position.y = -d * child.userData.baseY;
        for (const child of HEAD.children) {
          if (child.userData.stalk) continue;
          child.position.y = -d * child.userData.baseY;
          if (child.userData.dome) child.rotation.x = d > 0 ? Math.PI : 0;
        }
        bendStalk(d);
        ARM_I.position.y = -d * ARM_I.userData.baseY; ARM_I.rotation.z = 0.45 * d;
        for (const m of HEAD_II.children) m.position.y = -d * m.userData.baseY;
        CX.III.mesh.rotation.x = d > 0 ? 0 : Math.PI;   // the pear's belly on the loading side
        for (const k in KNOBS) for (const m of KNOBS[k]) m.position.y = m.userData.side * d * m.userData.baseY;
        OEC.position.y = d * OEC.userData.baseY;               // the lumen face
        RIDGE_PSI.position.y = -d * RIDGE_PSI.userData.baseY;  // the stroma face
      },
      afterSheet(tint) {
        buildOuter(tint);
        if (split()) { buildShuttles(); homeShuttles(); for (const t of qTokens.concat(cTokens)) { Object.assign(t, t.to); seat(t.obj, t.x, t.y, t.z || 0); } }
        else dropShuttles();
      },
      setCut(on) { if (OUTER) OUTER.cut.enable(on); },
      admits(t) { if (t.kind === 'H') return protonDir() === -pumpDir() && Math.sign(t.y) === pumpDir(); },
      /* ONE PROTON, ONE NOTCH: the rotor's angle and the ATP count come out
         of the same pass(). A proton down the uncoupler's hole turns nothing. */
      onConduct(t, dir) {
        if (t.kind !== 'H' || dir !== -pumpDir()) return;
        if (synthX != null && t.lane === synthX + LANE_DX) { protonsThroughSynthase++; if (ROT.pass(1)) { releaseATP(); exportCost(); eng.emit('atp', ROT.atp); } }
        else protonsLeaked++;
      },
      withContents: withProtons,
      /* Where pH is measured FROM. Protons are conserved, so this stays the
         zero of the scale however far the gradient runs. */
      contentsSet(c) {
        if (c && ((c.inside && c.inside.H) || (c.outside && c.outside.H)))
          protonRef = (((c.inside && c.inside.H) | 0) + ((c.outside && c.outside.H) | 0)) / 2;
      },
      pre(dt) { for (const r of runners()) r.run(dt); },
      post(dt) {
        ROTOR.rotation.y += (ROT.angle - ROTOR.rotation.y) * Math.min(1, dt * 6);
        tickATP(dt); tickFuel(dt); tickWaiting(dt); tickO2(dt); tickLight(dt);
        if (qTokens.length) tickShuttles(dt);
        tickE(dt);
      },
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
        if (next.chain != null && next.chain !== P.chain) {
          resetChain();
          P.chain = next.chain;
          if (LIB) writeCards(LIB);
          relay = true;
        }
        if (relay) eng.relayout();
      },
      state(base) {
        const h = base.counts.H || { inside:0, outside:0 };
        const proton = CHEM.protonState(h, eng.mV, protonRef, pumpDir());
        const lead = leadRunner(), st = lead.st;
        const sp = split(), ph = photo();
        const loaded = cTokens.filter(c => c.state === 'toEnd' || c.state === 'atEnd').length;
        return {
          chain: sp ? 'split' : 'lumped',
          span: P.span || (outerOn() ? 'mitochondrion' : 'inner'),
          outerMembrane: outerOn(),
          /* The third space, when there is one: above the outer membrane is
             neither half of this sim, and a caption that calls it "outside"
             has put the cytosol outside the cell. */
          sides: Object.assign(base.sides, { beyond: outerOn() ? 'the cytosol' : null }),
          pH: proton.pH, dpH: proton.dpH, pmf: proton.pmf,
          atpMade: ROT.atp, rotorTurns: ROT.protons / CHEM.PROTONS_PER_TURN,
          protonsThroughSynthase, protonsLeaked, protonsForExport, complexTurns: pumpedTotal,
          fuel: P.fuel, oxygen: P.oxygen !== false, o2Left: stocked() ? o2Waiting.length + (o2 ? 1 : 0) : null, fuelRate: CHEM.complexRate(P.fuel, P.fuelRate, proton.pmf, P.oxygen), pmfStall: CHEM.PMF_STALL,
          complexPhase: st ? st.phase : null, complexLabel: st ? st.label : null,
          complexCaption: st ? st.caption : null, complexT: lead.t,
          complexStoichiometry: sp ? null : CHEM.Complex.PROTONS_PER_CYCLE,
          complexStarved: runners().some(r => r.starved),
          /* Carriers fed and not yet docked, per complex, and how many may wait. */
          waiting: Object.assign({ max: WAIT_MAX }, Object.fromEntries(Object.keys(waiting).map(k => [k, waiting[k].length]))),
          /* THE SPLIT CHAIN'S LEDGER, per complex, and what a fuel is worth
             walked off CHAIN rather than typed. */
          complexes: sp ? Object.fromEntries(line().keys.map(k => [k, {
            turns: RUN[k].turns, pumpsPerTurn: ROW(k).pumps, pumped: RUN[k].turns * ROW(k).pumps,
            label: RUN[k].st ? RUN[k].st.label : null, phase: RUN[k].st ? RUN[k].st.phase : null,
          }])) : null,
          protonsPerFuel: !sp ? null : ph ? { light: CHEM.chainProtons('light') } : { NADH: CHEM.chainProtons('NADH'), FADH2: CHEM.chainProtons('FADH2') },
          shuttles: !sp ? null : (reduced => ph ? { plastoquinol: reduced, plastocyaninLoaded: loaded } : { ubiquinol: reduced, cytcLoaded: loaded })(
            qTokens.filter(q => q.state === 'toHub' || q.state === 'atHub' || (q.state === 'toDonor' && q.charged)).length),
          /* The light reactions' own ledger, split thylakoid only: every count
             is an event that happened, and the ratios are PHOTO_CHAIN's. */
          light: ph ? Object.assign({}, lightLedger, {
            photonsPerPair: CHEM.chainPhotons('light'),
            protonsPerO2: CHEM.chainProtons('light') * CHEM.E_PER_O2 / 2,
          }) : null,
          stoichiometry: { protonsPerTurn: CHEM.PROTONS_PER_TURN, atpPerTurn: CHEM.ATP_PER_TURN, protonsPerATP: CHEM.PROTONS_PER_ATP, protonsPerExport: antX == null ? 0 : CHEM.PROTONS_PER_EXPORT },
        };
      },
      reset() {
        ROT.reset(); pumpedTotal = 0; protonsLeaked = 0; protonsThroughSynthase = 0; protonsForExport = 0;
        for (const k in lightLedger) lightLedger[k] = 0;
        clearATP(); resetChain(); o2Stockpile(P.o2Stock);
      },
      clear() { lumped.cargo.length = 0; for (const k of ALL) RUN[k].cargo.length = 0; },
      lid: outerOn,
      /* THE CEILING ON THE COMPARTMENT BELOW IT, or the protons just pumped
         out drift straight through the outer sheet. */
      bandCap: () => outerOn() ? OUTER_GAP - 8 : Infinity,
      clearXs: () => outerOn() && porinX != null ? [porinX] : [],
      api: { feed, get outer() { return OUTER; }, doors: { translocase: ANT, porin: PORIN } },
      layers: {
        outer: { label: 'the outer membrane', get: () => outerOn(), set: v => eng.set({ outerMembrane: !!v }) },
      },
      anchors: {
        complex:  () => { const k = !split() ? 'complex' : photo() ? 'b6f' : 'I', x = k === 'complex' ? complexX : xs[k];
                          return P.proteins[k] ? at(x, H_() * 0.98) : null; },
        'complex.I':   () => split() && P.proteins.I ? at(xs.I, H_() * 0.98) : null,
        'complex.II':  () => split() && P.proteins.II ? at(xs.II, -pumpDir() * II_HEAD_Y) : null,
        'complex.III': () => split() && P.proteins.III ? at(xs.III, H_() * 0.98) : null,
        'complex.IV':  () => split() && P.proteins.IV ? at(xs.IV, H_() * 0.98) : null,
        quinone:  () => !photo() && qTokens.length ? qTokens[0].obj.position : null,
        cytc:     () => !photo() && cTokens.length ? cTokens[0].obj.position : null,
        psii:     () => photo() && P.proteins.PSII ? at(xs.PSII, H_() * 0.98) : null,
        b6f:      () => photo() && P.proteins.b6f ? at(xs.b6f, H_() * 0.98) : null,
        psi:      () => photo() && P.proteins.PSI ? at(xs.PSI, H_() * 0.98) : null,
        plastoquinone: () => photo() && qTokens.length ? qTokens[0].obj.position : null,
        plastocyanin:  () => photo() && cTokens.length ? cTokens[0].obj.position : null,
        nadph:    () => chips.PSI ? chips.PSI.obj.position : null,
        'water.split': () => photo() && P.proteins.PSII ? at(oecAt().x, oecAt().y) : null,
        translocase: () => antX == null ? null : at(antX, ANT.height * 0.98),
        porin:    () => !outerOn() ? null : at(porinX, outerY() + pumpDir() * HALF * 0.9),
        cytosol:  () => !outerOn() ? null : at(eng.clearX(), outerY() + pumpDir() * 34),
        synthase: () => synthX == null ? null : at(synthX, -pumpDir() * (F1_BASE + F1_H * 0.5)),
        leak:     () => P.proteins.leak ? at(P.proteins.leak.x, LEAK.height * 0.98) : null,
        oxygen:   () => o2 ? o2.obj.position : psiiO2.length ? psiiO2[0].obj.position : null,
        H: () => eng.firstOf('H'),
      },
      library: {
        complex: { text: 'a proton-pumping complex', offset: [-44, -30],
          card: 'It carries protons one way only, and it pays with the fuel rather than with ATP. Turn the fuel off and it stops, which is the whole reason the gradient is a store and not a fixture.' },
        'complex.I': { text: 'complex I', offset: [-44, -30],
          card: `NADH docks on the long arm in the matrix and hands over two electrons. They pass to ubiquinone in the membrane, and that drop pays for ${C.I.pumps} protons thrown out.` },
        'complex.II': { text: 'complex II (pumps nothing)', offset: [-40, 30],
          card: `It is also a Krebs cycle enzyme: succinate gives two electrons to the FAD bound inside it, and they go on to ubiquinone. It pumps ${C.II.pumps} protons, so electrons that enter here skip complex I's ${C.I.pumps}. That is why FADH₂ is worth ${CHEM.chainProtons('FADH2')} protons and NADH ${CHEM.chainProtons('NADH')}.` },
        'complex.III': { text: 'complex III', offset: [-10, -40],
          card: `Takes the pair from ubiquinol and hands them to cytochrome c one at a time, so it loads two cytochromes a turn. ${C.III.pumps} protons end up outside per pair with no channel through the protein: some ride in on ubiquinol with its electrons, the rest are taken from the matrix. The loop is called the Q cycle.` },
        'complex.IV': { text: 'complex IV', offset: [40, -34],
          card: `Collects electrons from cytochrome c and gives them to oxygen: four electrons and four matrix protons make one O₂ into two waters. It pumps ${C.IV.pumps} more per pair. Cyanide stops it here, and everything upstream backs up.` },
        quinone: { text: 'ubiquinone', offset: [-40, 26],
          card: 'A small oily molecule that moves inside the membrane. It picks up two electrons at complex I or II, becomes ubiquinol, delivers them to complex III and goes back for more.' },
        cytc: { text: 'cytochrome c', offset: [36, -30],
          card: 'A small protein on the outer face of the inner membrane. It carries one electron at a time from complex III to complex IV, and comes back empty.' },
        psii: { text: 'photosystem II', offset: [-44, -30],
          card: `Light knocks an electron loose, and PSII refills the hole from water, on its lumen face. Each water gives ${CHEM.CARRIES.H2O} electrons and ${CHEM.PHOTO_CHAIN.PSII.fromWater} protons, which stay in the lumen, and every two waters leave one O₂. It pumps nothing: its protons come out of water, not across the membrane. The electrons go on to plastoquinone.` },
        b6f: { text: 'cytochrome b6f', offset: [-10, -40],
          card: `The one pump in the chain, and a close relative of the mitochondrion's complex III. It takes the pair from plastoquinol and hands them to plastocyanin one at a time; ${CHEM.PHOTO_CHAIN.b6f.pumps} protons end up in the lumen per pair, by the same Q cycle: some ride in on plastoquinol, the rest are taken from the stroma, and no channel opens. As the lumen turns acidic it slows, so the chain cannot outrun the synthase.` },
        psi: { text: 'photosystem I', offset: [40, -34],
          card: `A second photon lifts each electron again, higher than PSII could, high enough to reduce NADP⁺. On its stroma face, ferredoxin and the enzyme FNR (not drawn) make NADPH from NADP⁺, two electrons and one proton from the stroma. PSI pumps nothing either.` },
        plastoquinone: { text: 'plastoquinone', offset: [-40, 26],
          card: 'A small oily molecule that moves inside the membrane. It picks up two electrons at PSII, becomes plastoquinol, delivers them to b6f and goes back for more. It does the job ubiquinone does in a mitochondrion.' },
        plastocyanin: { text: 'plastocyanin', offset: [36, 30],
          card: 'A small copper protein in the lumen. It carries one electron at a time from b6f to PSI, so b6f loads two per pair, and it comes back empty.' },
        nadph: { text: 'NADPH', offset: [40, -26],
          card: 'The other product of the light reactions, made in the stroma beside the ATP. The Calvin cycle spends both to turn CO₂ into sugar, and the NADP⁺ comes back to be filled again.' },
        'water.split': { text: 'water is split here', offset: [-44, 26],
          card: 'The oxygen-evolving complex, a cluster of manganese on PSII\'s lumen face. It strips electrons from water one at a time and keeps the protons in the lumen. Nothing else in biology can pull electrons off water.' },
        synthase: { text: 'ATP synthase', offset: [42, 30],
          card: 'A turbine, not a pump. Protons come back down the gradient through it and the rotor turns; every third of a turn makes one ATP. It cannot run uphill, so with no gradient it simply stops.' },
        oxygen: { text: 'oxygen', offset: [42, -34],
          card: 'The last stop for the electrons. Each O₂ takes four, and four protons from the matrix, and leaves as two waters. With no oxygen the electrons have nowhere to go and the whole chain stops.' },
        leak: { text: 'an uncoupler', offset: [42, -30],
          card: 'A hole for protons. They come home without passing the synthase, so the gradient collapses and no ATP is made. The fuel still burns, and all of it comes out as heat.' },
        translocase: { text: 'ADP/ATP translocase', offset: [-44, 30],
          card: 'ATP is made in the matrix and a charged nucleotide cannot cross a bilayer, so this carries it: one ATP out for one ADP in, a strict swap. It trades a −4 for a −3, so the membrane voltage drives it — the gradient pays once to make the ATP and again to get it out, about a quarter of the whole proton budget.' },
        porin: { text: 'porin', offset: [42, -30],
          card: 'A hole in the outer membrane, wide and unselective. Anything this small passes, which is why the space between the two membranes is nearly the same solution as the cytosol, and why the ATP is home once it is through.' },
        cytosol: { text: 'the cytosol', offset: [-38, -26],
          card: 'Outside the mitochondrion altogether. This is where the ATP is spent: on pumps at the cell surface, on the enzymes that build things, on everything the cell does that costs.' },
        H:  { text: 'H⁺', card: 'A bare proton. It cannot cross the oil on its own, so every one of them goes through a protein, and which protein decides whether the energy becomes ATP.' },
      },
      applyContext: writeCards,
      proteinKey: {
        complex:  { name: 'the complex that pumps H⁺', color: '#4d5fa6' },
        I:        { name: 'complex I', color: hex(RESP.complex) },
        II:       { name: 'complex II (pumps nothing)', color: hex(RESP.complexII) },
        III:      { name: 'complex III', color: hex(RESP.complex) },
        IV:       { name: 'complex IV', color: hex(RESP.complex) },
        PSII:     { name: 'photosystem II', color: hex(PHO.psii) },
        b6f:      { name: 'cytochrome b6f (pumps H⁺)', color: hex(PHO.b6f) },
        PSI:      { name: 'photosystem I', color: hex(PHO.psi) },
        synthase: { name: 'ATP synthase', color: '#d9a13b' },
        leak:     { name: 'uncoupler (a hole for H⁺)', color: '#8e939b' },
        translocase: { name: 'ADP/ATP translocase', color: hex(RESP.translocase) },
      },
      carries: { complex:['H'], I:['H'], II:[], III:['H'], IV:['H'], PSII:[], b6f:['H'], PSI:[], synthase:['H'], leak:['H'], translocase:[] },
    };
  }
  const hex = n => '#' + n.toString(16).padStart(6, '0');

  /* ---- the sim ----
     A create with no params is an inner mitochondrial membrane that runs: a
     complex, a synthase, NADH, and a gradient's worth of protons. A thylakoid
     defaults to light, because NADH in a chloroplast is a page that will not
     turn. A span past the inner membrane brings the outer one and a
     translocase, or the ATP has no visible way out. */
  function defaultProteins(chain, span) {
    const wide = span && span !== 'inner';
    if (chain === 'split') return wide ? { complex:{ x:-85 }, synthase:{ x:55 }, translocase:{ x:115 } } : { complex:{ x:-60 }, synthase:{ x:80 } };
    return wide ? { complex:{ x:-72 }, synthase:{ x:0 }, translocase:{ x:72 } } : { complex:{ x:-80 }, synthase:{ x:40 } };
  }
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet) throw new Error('Chemiosmosis: load membrane/parts.js and membrane/sheet.js first');
    const context = opts.context || 'mitochondrion';
    const span = opts.span === 'cell' ? 'mitochondrion' : (opts.span || 'inner');
    const P = Object.assign({ componentName: 'Chemiosmosis' }, global.Sheet.DEFAULTS, MACHINE_DEFAULTS,
      { context, potential: 'nernst', fuel: context === 'thylakoid' ? 'light' : 'NADH', outerMembrane: span !== 'inner' },
      opts, { span });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    P.proteins = Object.assign({}, opts.proteins || defaultProteins(P.chain, span));
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
  let bandCss = false;
  function stackMount(el, params) {
    if (!global.Membrane) throw new Error("Chemiosmosis: span:'cell' needs membrane/pump.js and membrane/membrane.js");
    const { INNER_Y, PLASMA_Y, OUTER_GAP } = STACK;
    const OUTER_Y = INNER_Y + OUTER_GAP, CYTOSOL = PLASMA_Y - OUTER_Y;
    let mito = null, cell = null, nb = null, last = null;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'Chemiosmosis ' + ev);
    /* CardStage draws ONE FRAME AT CREATE, so afterFrame runs before either
       sim exists: checked rather than assumed. */
    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0, phi: Math.PI / 2 - 0.09, r: params.chain === 'split' ? 500 : 412 },
      stage: Object.assign({ orbit: 'pan', rMin: 120, rMax: 900 }, params.stage || {}),
      step: dt => { if (!mito) return; const k = dt * (mito.params().timeScale || 1); last = mito.step(k); cell.step(k); },
      afterFrame: () => { fillWidth(); if (nb) { nb.step(); placeLabels(); } },
      viewOffset: params.viewOffset,
    });
    /* THE SHEETS NEVER END ON SCREEN: a membrane stopping short of the frame
       reads as a raft, not a cell. Zoom out stops where the narrower sheet's
       ends reach the canvas edges, and a pan stops at them too. A bowed
       sheet's ends are BOW·sin(reach/BOW) across, not its arc length. */
    function sheetHalfWidth(sim) {
      const q = sim.params(), span = 150, bow = q.curve > 0 ? (span * span + q.curve * q.curve) / (2 * q.curve) : 0;
      return bow ? bow * Math.sin(Math.min(Math.PI / 2, q.reach / bow)) : q.reach;
    }
    function fillWidth() {
      if (!mito || !cell || params.fillWidth === false) return;
      const W = box.canvas.clientWidth, H = box.canvas.clientHeight;
      if (!W || !H) return;
      const edge = Math.min(sheetHalfWidth(mito), sheetHalfWidth(cell)) - 4;
      const perR = Math.tan(box.camera.fov * Math.PI / 360) * W / H;   // visible half-width per unit of distance
      box.stage.setZoomLimits(NaN, edge / perR);
      const room = Math.max(0, edge - box.cam.r * perR), t = box.cam.target;
      if (Math.abs(t.x) > room) { t.x = Math.sign(t.x) * room; box.applyCam(); }
    }
    box.renderer.localClippingEnabled = true;
    const gMito = new THREE.Group(); gMito.position.y = INNER_Y; box.root.add(gMito);
    const gCell = new THREE.Group(); gCell.position.y = PLASMA_Y; box.root.add(gCell);
    const _w = new THREE.Vector3();
    const worldOf = (sim, group, name) => () => {
      const p = sim.anchors[name] && sim.anchors[name]();
      return p ? group.localToWorld(_w.copy(p)) : null;
    };
    /* The plasma membrane is built first so the mitochondrion can aim its
       ATP at the pump standing in it: 'pump.atp', the nucleotide site on the
       cytosolic face, not 'pump', which is the outside of the cell. */
    cell = global.Membrane.create(THREE, gCell, box.camera, {
      proteins: { pump: { x: -36 }, K: { x: 36 } }, contents: params.cellContents || CELL_CONTENTS,
      potential: 'nernst', pumpAuto: false, extent: 240, bounds: { up: 78, down: CYTOSOL - 8 },
    });
    const mitoOpts = Object.assign({}, params, { span: 'mitochondrion', extent: 240, bounds: { down: 95 },
      curve: params.curve != null ? params.curve : 12, atpTo: worldOf(cell, gCell, 'pump.atp') });
    delete mitoOpts.cam; delete mitoOpts.stage; delete mitoOpts.viewOffset;
    mito = create(THREE, gMito, box.camera, mitoOpts);
    if (params.cut !== false) { mito.set({ cut: true }); cell.set({ cut: true }); }
    let spent = 0;
    mito.on('atpDelivered', n => { if (cell.spend()) { spent++; emit('spent', spent); } });
    cell.on('turn', n => emit('turn', n));
    cell.on('turned', n => emit('turned', n));

    /* THE BANDS ARE NAMED DOWN THE RIGHT AND THE SHEETS DOWN THE LEFT, so a
       compartment's name never sits next to a membrane's and is read as one
       label. Placed by projecting their own world y. */
    if (!bandCss) {
      bandCss = true;
      const st = document.createElement('style');
      st.textContent = `
.chem-band { position:absolute; z-index:3; pointer-events:none;
  font-family:var(--font-display, inherit); font-size:var(--cap-sm, 11px);
  font-weight:var(--cap-weight, 600); letter-spacing:var(--cap-track, .12em);
  text-transform:uppercase; white-space:nowrap;
  text-shadow:0 1px 10px rgba(255,255,255,.85); transform:translateY(-50%); }
.chem-band  { right:18px; opacity:.55; }
.chem-tip { position:absolute; z-index:4; pointer-events:none; padding:4px 9px; border-radius:6px;
  background:rgba(255,255,255,.94); box-shadow:0 2px 10px rgba(0,0,0,.12); color:#1f2430;
  font:600 12px/1.3 var(--font-ui, system-ui, sans-serif); white-space:nowrap; transform:translate(12px, -130%); }`;
      document.head.appendChild(st);
    }
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const LABELS = params.sideLabels === false ? [] : [
      { cls:'chem-band', y: () => PLASMA_Y + 46, text: () => cell.state().sides.outside },
      { cls:'chem-band', y: () => (PLASMA_Y + OUTER_Y) / 2, text: () => cell.state().sides.inside },
      { cls:'chem-band', y: () => (OUTER_Y + INNER_Y) / 2, text: () => mito.state().sides.outside },
      { cls:'chem-band', y: () => INNER_Y - 78, text: () => mito.state().sides.inside },
    ];
    for (const L of LABELS) { L.el = document.createElement('div'); L.el.className = L.cls; el.appendChild(L.el); }
    /* THE SHEETS AND PROTEINS ARE NAMED ON HOVER, not down the edge: names on
       the left crowd the chain. The first thing under the pointer decides, so
       a protein standing in a sheet is not called the membrane. */
    const tip = document.createElement('div');
    tip.className = 'chem-tip'; tip.hidden = true; el.appendChild(tip);
    const ray = new THREE.Raycaster(), _p = new THREE.Vector2();
    const PROTEIN_NAME = { complex: 'Electron transport chain', I: 'Complex I', II: 'Complex II', III: 'Complex III', IV: 'Complex IV',
      PSII: 'Photosystem II', b6f: 'Cytochrome b6f', PSI: 'Photosystem I', synthase: 'ATP synthase', leak: 'Uncoupler',
      translocase: 'ADP/ATP translocase', porin: 'Porin', pump: 'Na⁺/K⁺ pump', K: 'K⁺ channel', CL: 'Cl⁻ channel' };
    const sheets = () => [
      ...Object.entries(Object.assign({}, cell.proteins, mito.proteins, mito.doors))
        .filter(([k, part]) => PROTEIN_NAME[k] && part && part.group).map(([k, part]) => [part.group, PROTEIN_NAME[k]]),
      [cell.membrane && cell.membrane.group, 'Plasma membrane'],
      [mito.outer && mito.outer.group, 'Outer membrane'],
      [mito.membrane && mito.membrane.group, 'Inner membrane'],
    ].filter(s => s[0] && s[0].visible);
    const within = (o, g) => { for (; o; o = o.parent) if (o === g) return true; return false; };
    function hover(ev) {
      const r = box.canvas.getBoundingClientRect();
      _p.set((ev.clientX - r.left) / r.width * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(_p, box.camera);
      const hit = ray.intersectObject(box.root, true).find(h => h.object.visible);
      const s = hit && sheets().find(([g]) => within(hit.object, g));
      tip.hidden = !s;
      if (!s) return;
      tip.textContent = s[1];
      tip.style.left = (ev.clientX - el.getBoundingClientRect().left) + 'px';
      tip.style.top = (ev.clientY - el.getBoundingClientRect().top) + 'px';
    }
    box.canvas.addEventListener('pointermove', hover);
    box.canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
    const _l = new THREE.Vector3();
    function placeLabels() {
      const h = box.canvas.clientHeight;
      /* Sized to the box, not the page: 11px down the edge of a card-sized box is a headline. */
      const fs = Math.max(7, Math.min(11, box.canvas.clientWidth / 45)) + 'px';
      for (const L of LABELS) {
        if (L.el.style.fontSize !== fs) L.el.style.fontSize = fs;
        _l.set(0, L.y(), 0).project(box.camera);
        L.el.style.top = ((-_l.y * .5 + .5) * h) + 'px';
        const t = L.text();
        if (L.el.textContent !== t) L.el.textContent = t;
      }
    }

    /* ONE NOTEBOOK FOR BOTH, every anchor lifted into world space. The bands
       are already named, so the cell's `inside` is not offered twice: the
       mitochondrion's `cytosol` is that space, and the cell's `outside` is
       `cell.outside`. */
    const anchors = {}, library = {};
    for (const k of Object.keys(mito.anchors)) { anchors[k] = worldOf(mito, gMito, k); library[k] = mito.library[k]; }
    for (const k of ['pump', 'pump.atp', 'pump.head', 'channel.K', 'NA', 'K']) { anchors[k] = worldOf(cell, gCell, k); library[k] = cell.library[k]; }
    anchors['cell.outside'] = worldOf(cell, gCell, 'outside'); library['cell.outside'] = cell.library.outside;
    nb = global.Notebook ? global.Notebook.create({ box, anchors, library }) : null;
    placeLabels();

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
      reset() { spent = 0; mito.reset(); cell.reset(); cell.set({ contents: params.cellContents || CELL_CONTENTS }); },
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { if (nb) nb.clear(); for (const L of LABELS) L.el.remove(); tip.remove(); box.destroy(); },
    };
    return handle;
  }

  /* ---- the box ----
     Changing `span` to or from 'cell' rebuilds the box, since that is two
     sims rather than one: listeners are carried across, the running state
     too, and the counts start again. Every other change is a set(). */
  function mount(el, params = {}) {
    const P0 = Object.assign({}, params);
    const subs = [];
    let cur = null;
    const camFor = p => p.cam || { theta: 0, phi: Math.PI / 2 - 0.10, r: p.chain === 'split' ? 380 : 300 };
    function build() {
      cur = P0.span === 'cell' ? stackMount(el, P0)
        : global.Sheet.mount(el, Object.assign({}, P0, { cam: camFor(P0) }), { name: 'Chemiosmosis', create, signals: SIGNALS, api: ['feed'] });
      for (const s of subs) s.off = cur.on(s.ev, s.fn);
    }
    build();
    const handle = {
      get sim() { return cur.sim; }, get box() { return cur.box; }, get cell() { return cur.cell || null; },
      note: (n, o) => cur.note(n, o), notes: n => cur.notes(n), clearNotes: () => cur.clearNotes(),
      anchors: () => cur.anchors(), at: n => cur.at(n), layers: () => cur.layers(), palette: () => cur.palette(),
      show: (n, on) => { cur.show(n, on); return handle; },
      set(next) {
        const was = P0.span === 'cell' ? 'cell' : 'other', chainWas = P0.chain;
        Object.assign(P0, next);
        const now = P0.span === 'cell' ? 'cell' : 'other';
        if (next.span != null && was !== now) {
          const running = cur.box.running;
          cur.destroy(); build();
          if (running) cur.start();
        } else {
          cur.set(next);
          if (next.chain != null && next.chain !== chainWas && !params.cam) {
            const r = P0.span === 'cell' ? (P0.chain === 'split' ? 500 : 412) : camFor(P0).r;
            cur.box.flyTo({ r });
          }
        }
        return handle;
      },
      state: () => cur.state(), signals: () => SIGNALS,
      on(ev, fn) {
        const s = { ev, fn, off: cur.on(ev, fn) };
        subs.push(s);
        return () => { if (s.off) s.off(); const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
      },
      feed: (f, o) => cur.feed(f, o), spend: () => cur.spend ? cur.spend() : false,
      add: (k, o) => cur.add(k, o), scatter: (k, n, s, o) => cur.scatter(k, n, s, o), clear: () => cur.clear(), reset: () => cur.reset(),
      start: () => cur.start(), stop: () => cur.stop(), pump: dt => cur.pump(dt),
      destroy: () => { if (cur.clearNotes) cur.clearNotes(); cur.destroy(); },
    };
    return handle;
  }

  /* dpH and pmf are chemiosmosis.js's arithmetic, and their ranges are what
     that file can produce, not what a chloroplast does. */
  const total = c => c ? (c.inside || 0) + (c.outside || 0) : 0;
  const sides = c => ({ inside: (c && c.inside) || 0, outside: (c && c.outside) || 0 });
  const SIGNALS = {
    protons: { label: 'H⁺', unit: 'protons', split: true, pick: s => sides(s.counts.H), domain: s => [0, total(s.counts.H)] },
    voltage: { label: 'Membrane voltage', unit: 'mV', pick: s => s.mV, domain: () => [-200, 200] },
    dpH:     { label: 'pH difference across the membrane', unit: 'pH', pick: s => s.dpH, domain: () => [0, 1.6] },
    pmf:     { label: 'Proton-motive force', unit: 'mV', pick: s => s.pmf, domain: () => [0, 250] },
    atp:     { label: 'ATP made', unit: 'molecules', cumulative: true, pick: s => s.atpMade, domain: () => [0, 10] },
  };

  Object.assign(CHEM, { machine, create, mount, MACHINE_DEFAULTS, SIGNALS });
  /* Scale (kit/scale.js): the same angstrom sheet as Membrane, crossing
     things drawn exag times oversize against it. */
  CHEM.SCALE = {
    rung: 'membrane', form: 'bulk',
    unit: 1e-10 / (global.MolLib && global.MolLib.SCALE || 1.9),
    exag: { crossing: 5.0 },
    down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
