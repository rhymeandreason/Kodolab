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
 *  the complex's phase table, and the rule that neither door runs uphill — is
 *  membrane/chemiosmosis.js, free of THREE so check-chemiosmosis.js runs it in
 *  node; this file adds create/mount to that same global. The bilayer and
 *  everything that walks beside it is membrane/sheet.js. What is here is the
 *  machines and what they carry:
 *
 *      proteins: { complex | synthase | leak | translocase: {x} | null }
 *
 *  `complex` pumps protons out and pays with `fuel` ('NADH' | 'FADH2' |
 *  'light') at `fuelRate`, never with ATP; `synthase` lets them back down and
 *  turns a rotor, three protons a third-turn and one ATP with it, drawn
 *  leaving the F1 head unless `showATP:false`; `leak` is an uncoupler's hole;
 *  `translocase` swaps the ATP out for an ADP. `outerMembrane` lids the
 *  intermembrane space with a porin over it. `atpTo` walks each ATP to a world
 *  point in another sim, and `atpExit` sends it off an edge.
 *
 *  Events: `pumped` (protons thrown out so far), `atp` (made, in the matrix),
 *  `atpOut` (cleared the last door on stage), `atpDelivered` (reached atpTo).
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
    complexSeconds: 6.0,      // ONE FULL CYCLE, the empty half included; three real complexes are drawn as one
    showATP: true,            // the synthase releases a drawn ATP per third-turn
    showFuel: true,           // a carrier arrives at the complex and leaves spent
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

  function machine(eng) {
    const { THREE, P, HALF, BOW, rnd, travellers, kit, seat, root } = eng;
    const Parts = global.Parts;
    const pumpDir = eng.pumpDir;

    /* ---- the chemiosmotic machines ----
       A COMPLEX: the electron-transport chain, or the cytochrome b6f of a
       thylakoid. Three complexes in the real chain, drawn as ONE, because
       the lesson's claim is "something with energy to spend pumps protons",
       not the identity of the pumper. INDIGO: an organelle tints its bilayer
       with its own colour, and a mitochondrion's is orange, so a warm machine
       disappears into its lipids. It is a carrier, so it takes a snug site.
       SYNTHASE: the c-ring is why it has that many lobes, and the rotor is
       drawn on the face where F1 hangs. */
    const CPX_R = 16.0, CPX_LOBE = 0.14, CPX_HOLE = CPX_R * (1 + CPX_LOBE) + 0.5;
    const RESP = global.MolLib.PALETTE.respiration;
    const COMPLEX = Parts.transporter({ half:HALF, site:6.2, mouth:8.0, radius:CPX_R, lobes:3, lobeDepth:CPX_LOBE, color:RESP.complex });
    const SYN_R = 13.2, SYN_LOBE = 0.09, SYN_HOLE = SYN_R * (1 + SYN_LOBE) + 0.5;
    const SYNTH   = Parts.transporter({ half:HALF, site:6.0, mouth:8.2, radius:SYN_R, lobes:8, lobeDepth:SYN_LOBE, color:RESP.synthase });
    /* An UNCOUPLER's hole: dinitrophenol, or thermogenin in brown fat.
       Protons come back without touching the synthase, so the gradient
       collapses and no ATP is made. Grey: it is a hole, not a machine. */
    const LEAK_R = 11.0, LEAK_LOBE = 0.06, LEAK_HOLE = LEAK_R * (1 + LEAK_LOBE) + 0.5;
    const LEAK    = Parts.transporter({ half:HALF, site:6.0, mouth:7.6, radius:LEAK_R, lobes:0, color:RESP.leak });
    /* THE HOLE WINS, and that is what makes an uncoupler dangerous: it is
       always open, while the synthase has a rotor to wait for. Protons per
       one that still takes the synthase; a staging choice, declared here
       rather than emerging from a queue the sim does not model. */
    const LEAK_PREFERENCE = 3;
    /* THE ADP/ATP TRANSLOCASE, the answer to "how does the ATP get out". The
       F1 head hangs in the matrix, so the ATP is MADE in the matrix, and a
       charged nucleotide does not cross a bilayer. One ATP out for one ADP
       in, a strict swap. A monomer, no lobes, so it does not read as a small
       member of the respiratory chain.

       NOT DRAWN: that the swap is ELECTROGENIC (ATP⁴⁻ out for ADP³⁻ in), so
       the gradient pays again to export, about a quarter of the proton
       budget. The card says it; a charge count here would move mV on a stage
       where mvPerIon is a timing knob rather than a measurement. */
    const ANT_R = 10.0, ANT_LOBE = 0.08, ANT_HOLE = ANT_R * (1 + ANT_LOBE) + 0.5;
    const ANT = Parts.transporter({ half:HALF, site:5.4, mouth:7.0, radius:ANT_R, lobes:0, color:RESP.translocase });
    const ROTOR = buildRotor(SYNTH.height);
    SYNTH.group.add(ROTOR);
    root.add(COMPLEX.group, SYNTH.group, LEAK.group, ANT.group);

    /* ---- the outer membrane, and the porin in it ----
       A SECOND SHEET AND NO SECOND PHYSICS. The porin (VDAC) passes anything
       small, so the space between the membranes is continuous with the
       cytosol and the ATP is home once it is through. A wide barrel in the
       leak's grey, because it is a hole and does not choose.

       OUTER_GAP is drawn, not measured: a real intermembrane space is much
       narrower than this against the protein it holds. It is this wide so the
       protons pumped into it are visible SITTING there, tuned against the F1
       head, the tallest thing the space has to clear. */
    const OUTER_GAP = 82;
    /* SLIMMER AND SHORTER THAN A CARRIER: transporter's default `over` made
       the porin a silo two membranes proud of its own, and a hole does not
       need a body. */
    const POR_R = 6.6, POR_HOLE = 8.4;
    const PORIN = Parts.transporter({ half:HALF * 0.62, over:4.0, wall:2.2, site:4.9, mouth:5.4, radius:POR_R, lobes:0, color:RESP.porin });
    root.add(PORIN.group);
    let OUTER = null, porinX = null, antX = null, complexX = 0, synthX = null;
    const outerOn = () => !!P.outerMembrane && P.context === 'mitochondrion';
    /* Signed like everything else: the outer membrane is on the side the
       protons are pumped to, which is the side the ATP leaves by. */
    const outerY = () => pumpDir() * OUTER_GAP;
    const _out = new THREE.Vector3();
    function buildOuter(tint) {
      if (OUTER) { root.remove(OUTER.group); OUTER = null; }
      PORIN.group.visible = outerOn();
      if (!outerOn()) { porinX = null; return; }
      /* INBOARD of the door it feeds, and offset so the ATP's two crossings
         do not stack into one vertical line read as a single pore. */
      porinX = (antX != null ? antX : synthX != null ? synthX : 0) - 38;
      /* CONCENTRIC WITH THE INNER SHEET, a bigger radius by exactly the gap,
         so the intermembrane space is the same width all the way out. */
      OUTER = Parts.membrane({ half:HALF * 0.62, reach:P.reach, head:tint.head, tail:tint.tail,
        bowR:BOW ? BOW + OUTER_GAP : 0,
        exclude:(x, z) => Math.hypot(x - porinX, z) - POR_HOLE });
      OUTER.group.position.y = outerY();
      root.add(OUTER.group);
      /* The porin rides the OUTER sheet's arc; seat() is the inner one's. */
      _out.set(porinX, 0, 0);
      const th = OUTER.bend(_out);
      PORIN.group.position.set(_out.x, _out.y + outerY(), 0);
      PORIN.group.rotation.z = -th;
      PORIN.setGates(1, 1);
      OUTER.cut.enable(eng.cut);
    }

    /* The F1 head: a ring of three αβ pairs on a shaft. Three, because one
       ATP is made per third of a turn and a student can count the beats
       against the lobes. It TURNS, driven by a count rather than a clock. */
    function buildRotor(h) {
      const g = new THREE.Group();
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 9, 12), Parts.flat(RESP.stalk));
      shaft.userData.baseY = h + 4.5; g.add(shaft);
      for (let i = 0; i < 3; i++) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(6.2, 18, 12), Parts.flat(RESP.synthase));
        lobe.scale.set(1, 1.25, 1);
        const th = (i / 3) * Math.PI * 2;
        lobe.position.set(Math.cos(th) * 7.4, 0, Math.sin(th) * 7.4);
        lobe.userData.baseY = h + 12.5;
        g.add(lobe);
      }
      return g;
    }

    /* ---- the ATP that comes out, and the way out ----
       One molecule leaves the head per third-turn, on the SAME pass() that
       increments the count, so a student watches the beats instead of
       reading them.

       IT IS MADE IN THE MATRIX, where the F1 head hangs, so it takes a route:
       matrix → translocase → intermembrane space → porin → cytosol, with an
       ADP the other way through the translocase. With neither door on stage
       it simply wanders off, which is a page not teaching export.

       DRAWN AS ITS PHOSPHATES: real ATP at this scale is a smudge, and an
       adenosine body big enough to see makes the part the lesson never
       mentions the biggest feature. Beads in phosphorus orange read as three
       at any size, and three against two is what tells ATP from ADP.

       THE THIRD BOND IS A CONDENSATION, drawn in the `condense` slate a
       peptide or glycosidic bond is, and the bead snaps on oversize because
       the gradient spent on that bond is the whole lesson of the synthase. */
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
      /* Named in the badge's own dress — ink on a white pill. */
      const tag = kit.pill(n === 3 ? 'ATP' : 'ADP', 6.4);
      tag.position.set(0, R_BEAD + 5.2, 0);
      g.add(tag);
      g.userData = { newest: beads[n - 1], tag };
      return g;
    }
    /* The waypoints, in the sim's flat frame; seat() bends them onto the arc
       at draw time. `out` is the leg after which the molecule has left the
       mitochondrion — the page's cue. */
    const _atp = new THREE.Vector3();
    function atpRoute() {
      const d = pumpDir();
      const legs = [];
      if (antX != null) {
        legs.push({ x:antX, y:-d * (HALF + 15) });             // across the matrix to the door
        legs.push({ x:antX, y: d * (HALF + 15), swap:true });  // through it, ADP the other way
      }
      if (outerOn()) {
        legs.push({ x:porinX, y: d * (OUTER_GAP - HALF * 0.62 - 7) });
        legs.push({ x:porinX, y: d * (OUTER_GAP + HALF * 0.62 + 9), out:true });
      }
      const last = legs.length ? legs[legs.length - 1] : null;
      /* SOMEWHERE TO GO beats a direction to drift in. atpTo answers in WORLD
         coordinates because what it points at belongs to another sim;
         converted here, once, at release. */
      if (P.atpTo) {
        const w = P.atpTo();
        if (w) {
          _atp.copy(w); root.worldToLocal(_atp);
          /* AND UNBENT, because a leg is flat and seat() bends it at draw
             time. A world point arrives already on an arc — or on another
             membrane's — so bending it again walks the ATP somewhere else. */
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
      const d = pumpDir();
      const g = buildNucleotide(3);
      root.add(g);
      atpChips.push({ obj:g, t:0, phase:Math.random() * 6.28, fade:1,
                      x:(synthX || 0), y:-d * (SYNTH.height + 20), legs:atpRoute(), leg:0 });
    }
    /* The ADP that comes back: the SAME event seen from the other side, born
       where the ATP is leaving and walking the two legs in reverse. */
    function releaseADP(atX) {
      const d = pumpDir();
      const g = buildNucleotide(2);
      root.add(g);
      atpChips.push({ obj:g, t:0, phase:Math.random() * 6.28, fade:1,
                      x:atX, y:d * (HALF + 15),
                      legs:[{ x:atX, y:-d * (HALF + 15) },
                            { x:atX - 44, y:-d * (HALF + 34), fade:true }], leg:0 });
    }
    function tickATP(dt) {
      for (let i = atpChips.length - 1; i >= 0; i--) {
        const c = atpChips[i];
        c.t += dt;
        const o = c.obj, leg = c.legs[c.leg];
        /* WALKED, not integrated: the route is the claim, and a velocity that
           merely points at a door arrives beside it half the time. */
        const dx = leg.x - c.x, dy = leg.y - c.y, dist = Math.hypot(dx, dy);
        const move = ATP_SPEED * dt;
        if (dist <= move) {
          c.x = leg.x; c.y = leg.y;
          /* ARRIVING IS AN EVENT, BEING THERE IS NOT. Without the flag one ATP
             delivered itself every frame while it faded. */
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
        /* A ROW READ EDGE-ON IS ONE DOT: the token stays in the screen plane
           and only leans. */
        o.rotation.z = Math.sin(c.t * 1.1 + c.phase) * 0.16;
        const k = Math.min(1, c.t / ATP_SNAP);
        o.userData.newest.scale.setScalar(1 + 1.4 * (1 - k) * (1 - k));
        if (c.dying) {
          c.fade -= dt / ATP_FADE;
          o.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, c.fade); } });
          if (c.fade <= 0) { kit.forget(o.userData.tag); root.remove(o); atpChips.splice(i, 1); }
        }
      }
    }
    function clearATP() {
      for (const c of atpChips) { kit.forget(c.obj.userData.tag); root.remove(c.obj); }
      atpChips.length = 0;
    }

    /* ---- the fuel, arriving and leaving ----
       THE POINT IS THAT IT STAYS ON ONE SIDE. NADH hands its electrons to the
       chain in the matrix and never crosses this membrane: the carrier comes
       up out of the matrix, docks on the complex's matrix face, and goes back
       down the way it came.

       AND IT IS NOT CONSUMED. It docks as NADH and leaves as NAD⁺ — the same
       body and colour with only the name changed — and that NAD⁺ going back
       is what lets the Krebs cycle turn again.

       A DINUCLEOTIDE IS TWO NUCLEOTIDES, two lobes on a bond, and not ATP's
       row of three: the two tokens on this stage must not read alike.

       Timed off the complex's own cycle: it arrives as the machine opens to
       load, and the swap happens on `occlude`, whose caption is already
       "electrons from the fuel pass through". */
    const FUEL_SPEED = 34, FUEL_FADE = 0.9;
    let fuelChip = null, pulseFuel = null;
    function buildCarrier(name) {
      const g = new THREE.Group();
      for (const [x, r] of [[-3.1, 3.6], [3.1, 3.0]]) {
        const lobe = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), Parts.flat(RESP.carrier));
        lobe.position.x = x; g.add(lobe);
      }
      const link = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.0, 6.2, 8), Parts.flat(global.MolLib.PALETTE.bonds.covalent));
      link.rotation.z = Math.PI / 2; g.add(link);
      const tag = kit.pill(name, 6.4);
      tag.position.set(0, 8.0, 0);
      g.add(tag);
      g.userData.tag = tag;
      return g;
    }
    const fuelDock = () => ({ x: complexX - 15, y: -pumpDir() * (COMPLEX.height + 13) });
    function fuelArrive() {
      if (!P.showFuel || !COMPLEX.group.visible || fuelChip) return;
      /* WHICHEVER FUEL IS ACTUALLY DRIVING IT — a one-shot from feed() counts. */
      const f = pulseFuel || P.fuel;
      if (!CHEM.SPENT[f]) return;           // light: nothing arrives, and nothing should be drawn
      const d = pumpDir(), to = fuelDock();
      const g = buildCarrier(f === 'FADH2' ? 'FADH₂' : f);
      root.add(g);
      /* SHALLOW: on a stage that also holds an outer membrane and a cell
         surface, a carrier launched deep makes its journey off the frame. */
      fuelChip = { obj:g, fuel:f, x: complexX - 34, y: -d * (COMPLEX.height + 30), to, fade:1, spent:false };
      seat(g, fuelChip.x, fuelChip.y, 0);
    }
    /* The electrons have gone. Rename in place and send it back. */
    function fuelSpend() {
      if (!fuelChip || fuelChip.spent) return;
      const c = fuelChip, d = pumpDir();
      kit.forget(c.obj.userData.tag);
      c.obj.remove(c.obj.userData.tag);
      const tag = kit.pill(CHEM.SPENT[c.fuel] || 'spent', 6.4);
      tag.position.set(0, 8.0, 0);
      c.obj.add(tag); c.obj.userData.tag = tag;
      c.spent = true;
      c.to = { x: complexX - 40, y: -d * (COMPLEX.height + 34) };
    }
    function tickFuel(dt) {
      const c = fuelChip;
      if (!c) return;
      const dx = c.to.x - c.x, dy = c.to.y - c.y, dist = Math.hypot(dx, dy);
      const move = FUEL_SPEED * dt;
      if (dist > move) { c.x += dx / dist * move; c.y += dy / dist * move; }
      else { c.x = c.to.x; c.y = c.to.y; }
      seat(c.obj, c.x, c.y, 0);
      if (c.spent && dist <= move) {
        c.fade -= dt / FUEL_FADE;
        c.obj.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, c.fade); } });
        if (c.fade <= 0) clearFuel();
      }
    }
    function clearFuel() {
      if (!fuelChip) return;
      kit.forget(fuelChip.obj.userData.tag);
      root.remove(fuelChip.obj);
      fuelChip = null;
    }
    /* ONE CARRIER, ONE TURN — the complex's answer to the pump's spend(), and
       independent of the supply switch: turn the supply off, send one, and
       watch the machine turn once and stop. It winds the complex back to its
       loading beat and lets the cycle do the rest; a token on a timer of its
       own would be a second answer to "when is the fuel spent". */
    function feed(fuel) {
      if (!P.proteins.complex) return false;
      const f = fuel || P.fuel || (P.context === 'thylakoid' ? 'light' : 'NADH');
      if (!CHEM.FUELS[f]) { console.warn('Chemiosmosis: no fuel named ' + f + '; have ' + Object.keys(CHEM.FUELS).join(', ')); return false; }
      if (!CHEM.complexRate(f, 1, 0, P.oxygen)) return false;   // no O₂: the NADH docks and nothing takes its electrons
      pulseFuel = f;
      clearFuel();
      cpxT = CHEM.Complex.startOf('load-H');
      cpxPhase = '';        // so the cycle's own transition fires on the next step
      return true;
    }

    /* ---- oxygen, where the electrons end ----
       COMPLEX IV AT ITS REAL RATIO: O₂ + 4e⁻ + 4H⁺ → 2H₂O. A carrier brings
       two electrons, so ONE O₂ WAITS THROUGH TWO CARRIERS, takes two matrix
       protons on each carrier's `occlude` beat, and leaves as two waters. One
       water per O₂, or one O₂ per NADH, is wrong by a factor of two in exactly
       the place a student counts.

       THE PROTONS THAT JOIN IT ARE DRAWN, NOT DEBITED: the drawn pool is the
       gradient's whole budget, and emptying it here would stall the complex
       for a reason that is not biology. Only a fuel whose acceptor is O₂
       draws any of this (CHEM.ACCEPTOR), so a thylakoid shows none. */
    const O2_SPEED = 26, WATER_FADE = 1.2;
    const E_PER_O2 = 4, E_PER_CARRIER = 2;
    let o2 = null;
    const o2Riders = [], waters = [];
    const o2Dock = () => ({ x: complexX + 16, y: -pumpDir() * (COMPLEX.height + 12) });
    /* The pill goes on an UNSCALED wrapper: smallMolecule scales its group
       by K_(), and a tag inside it came out several times the NADH's. */
    function tagged(mol, name) {
      const g = new THREE.Group(), tag = kit.pill(name, 6.4);
      tag.position.set(0, 7.0, 0);
      g.add(mol, tag); g.userData.tag = tag;
      return g;
    }
    function dropToken(obj) {
      if (obj.userData.tag) kit.forget(obj.userData.tag);
      if (obj.userData.badge) kit.forget(obj.userData.badge);
      root.remove(obj);
    }
    const approach = (c, to, dt, speed) => {
      const dx = to.x - c.x, dy = to.y - c.y, dist = Math.hypot(dx, dy), move = speed * dt;
      if (dist > move) { c.x += dx / dist * move; c.y += dy / dist * move; }
      else { c.x = to.x; c.y = to.y; }
      seat(c.obj, c.x, c.y, 0);
      return dist <= move;
    };
    function o2Arrive() {
      if (!P.showFuel || o2 || P.oxygen === false || !COMPLEX.group.visible) return;
      if (CHEM.ACCEPTOR[pulseFuel || P.fuel] !== 'O2') return;
      const to = o2Dock();
      o2 = { obj: tagged(eng.smallMolecule('o2'), 'O₂'), x: to.x + 22, y: -pumpDir() * (COMPLEX.height + 34), to, electrons: 0 };
      root.add(o2.obj); seat(o2.obj, o2.x, o2.y, 0);
    }
    function o2Reduce() {
      if (!o2 || o2.electrons >= E_PER_O2) return;
      o2.electrons += E_PER_CARRIER;
      for (let i = 0; i < E_PER_CARRIER; i++) {
        const r = { obj: eng.chargedIon('H'), x: o2.to.x + (i ? 16 : -8), y: -pumpDir() * (COMPLEX.height + 38),
                    off: { x: (i ? 1 : -1) * 3.5, y: -pumpDir() * (o2.electrons === E_PER_O2 ? 4 : -1) } };
        root.add(r.obj); seat(r.obj, r.x, r.y, 0); o2Riders.push(r);
      }
    }
    function toWater() {
      const at = o2.to;
      dropToken(o2.obj); o2 = null;
      for (const r of o2Riders) dropToken(r.obj);
      o2Riders.length = 0;
      for (const s of [-1, 1]) {
        const w = { obj: tagged(eng.smallMolecule('water'), 'H₂O'), x: at.x + s * 5, y: at.y,
                    to: { x: at.x + s * 18, y: -pumpDir() * (COMPLEX.height + 42) }, fade: 1 };
        root.add(w.obj); seat(w.obj, w.x, w.y, 0); waters.push(w);
      }
    }
    function tickO2(dt) {
      /* Cut off before any electrons reached it, the O₂ was never there. One
         already holding electrons stays bound, as it does in complex IV. */
      if (o2 && P.oxygen === false && !o2.electrons) { dropToken(o2.obj); o2 = null; }
      if (o2) {
        approach(o2, o2.to, dt, O2_SPEED);
        let aboard = 0;
        for (const r of o2Riders) if (approach(r, { x: o2.x + r.off.x, y: o2.y + r.off.y }, dt, O2_SPEED * 1.3)) aboard++;
        if (o2.electrons >= E_PER_O2 && aboard === o2Riders.length) toWater();
      }
      for (let i = waters.length - 1; i >= 0; i--) {
        const w = waters[i];
        if (!approach(w, w.to, dt, O2_SPEED * 0.7)) continue;
        w.fade -= dt / WATER_FADE;
        w.obj.traverse(m => { if (m.material) { m.material.transparent = true; m.material.opacity = Math.max(0, w.fade); } });
        if (w.fade <= 0) { dropToken(w.obj); waters.splice(i, 1); }
      }
    }
    function clearO2() {
      if (o2) dropToken(o2.obj);
      o2 = null;
      for (const t of o2Riders.concat(waters)) dropToken(t.obj);
      o2Riders.length = 0; waters.length = 0;
    }

    /* ---- the proton circuit's doors ----
       `protonRef` is the count each side started with, so pH is read as a
       departure from where the page set it rather than from whatever half the
       current total happens to be. */
    let protonRef = null, complexTurns = 0, protonsLeaked = 0, protonsThroughSynthase = 0;
    /* A PROTON GOES ONE WAY THROUGH A DOOR: down the proton-motive force.
       chemiosmosis.js decides, off the headcount and the voltage together, so
       the synthase and the uncoupler obey the same rule and neither can run
       uphill. Off the headcount, not state(), which walks every traveller. */
    const protonDir = () => CHEM.synthaseDirection(eng.sideCount('H'), eng.mV, { ref: protonRef, dir: pumpDir() });
    const pmfNow = () => CHEM.protonState(eng.sideCount('H'), eng.mV, protonRef, pumpDir()).pmf;
    /* A PUMPING MEMBRANE WITH NO PROTONS IS A FROZEN ONE: the complex waits at
       its loading beat with the carrier drawn beside it and nothing says why.
       Generated apps mounted it that way, so an organelle with a complex gets
       a gradient's worth by default. Any `H` key, 0 included, is the page
       choosing. */
    const DEFAULT_PROTONS = 22, DEFAULT_WATER = 30;
    function withProtons(c) {
      if (P.context === 'plasma' || !CHEM.CONTEXTS[P.context] || !P.proteins.complex) return c;
      if (c && ((c.inside && 'H' in c.inside) || (c.outside && 'H' in c.outside))) return c;
      const side = s => Object.assign({ water: DEFAULT_WATER }, (c && c[s]) || {}, { H: DEFAULT_PROTONS });
      return { inside: side('inside'), outside: side('outside') };
    }

    /* ---- the complex: a carrier with one cargo and no ATP ----
       Driven exactly as the pump is, off a phase table in chemiosmosis.js, so
       the picture cannot disagree with the cycle, and the two beats where it
       comes back EMPTY are drawn rather than cut. It spends FUEL, so its rate
       is the page's slider and it stops when the fuel does; and it never
       comes back with a proton, or there is no gradient to build. */
    let cpxT = 0, cpxPhase = '', cpxStarved = false, warnedStarved = false, cpxState = null;
    const cpxCargo = [];
    const cpxGates = { top: NaN, bottom: NaN };
    /* A turn already begun finishes: the energy was spent at the occlusion,
       and a machine frozen mid-carry strands a proton inside the protein. */
    const CPX_COAST = 0.35;
    function setCpxGates(top, bottom) {
      if (top === cpxGates.top && bottom === cpxGates.bottom) return;
      COMPLEX.setGates(top, bottom); cpxGates.top = top; cpxGates.bottom = bottom;
    }
    /* ALL OR NOTHING, the pump's rule: a partly loaded machine turns with an
       empty seat, and the seat is where a student is counting. */
    function recruitProtons(n) {
      const from = -pumpDir();          // it loads at the mouth it is NOT filling
      const pool = travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === from)
        .sort((a, b) => ((a.x - complexX) ** 2 + a.y * a.y) - ((b.x - complexX) ** 2 + b.y * b.y));
      if (pool.length < n) return false;
      for (const t of pool.slice(0, n)) { t.aboard = true; cpxCargo.push(t); }
      return true;
    }
    function releaseProtons(to) {
      for (const t of cpxCargo) {
        t.aboard = false;
        t.y = to * COMPLEX.height * 1.15; t.x = complexX + rnd(-16, 16); t.z = rnd(-8, 8);
        t.obj.position.set(t.x, t.y, t.z);
        t.lane = null; t.bounded = true;
        eng.repick(t); t.vy = Math.abs(t.vy) * to;
        t.exitPt = { x:t.x, y:t.y, z:t.z };
      }
      cpxCargo.length = 0;
    }
    function runComplex(dt) {
      if (!P.proteins.complex) return null;
      const supply = CHEM.complexRate(P.fuel, P.fuelRate, pmfNow(), P.oxygen);
      /* A one-shot burns at its own full rate: `fuelRate` dims how fast they
         ARRIVE. Back-pressure from the pmf still applies. */
      const fuelled = supply > 0 ? supply : pulseFuel ? CHEM.complexRate(pulseFuel, 1, pmfNow(), P.oxygen) : 0;
      const rate = fuelled > 0 ? fuelled : cpxCargo.length ? CPX_COAST : 0;
      if (rate > 0) {
        const was = cpxT;
        cpxT = (cpxT + dt * rate / Math.max(0.1, P.complexSeconds)) % 1;
        /* SPENT AFTER ONE CYCLE: feed() starts the clock at load-H, which is
           0, so the wrap back past it is the turn ending. */
        if (pulseFuel && cpxT < was) pulseFuel = null;
      }
      let st = CHEM.Complex.at(cpxT);
      /* NOTHING TO CARRY, OR NOTHING TO PAY WITH: hold at the moment of
         binding rather than turning an empty machine. It loads only while
         something is paying, READ LIVE rather than from `fuelled`, which was
         measured before the step: the stale value let one feed() buy two
         turns. */
      const driving = () => supply > 0 || !!pulseFuel;
      if (st.phase === 'load-H' && !cpxCargo.length) {
        if (!driving() || !recruitProtons(CHEM.Complex.PROTONS_PER_CYCLE)) {
          cpxT = CHEM.Complex.startOf('load-H'); st = CHEM.Complex.at(cpxT);
          /* Busy protons are a pause; NO protons on the loading side is a page
             that forgot them, and it gets said once. */
          cpxStarved = driving() && !travellers.some(t => t.kind === 'H' && Math.sign(t.y) === -pumpDir());
          if (cpxStarved && !warnedStarved) {
            warnedStarved = true;
            console.warn('Chemiosmosis: the complex is fuelled but ' + CHEM.sideName(P.context, pumpDir() > 0 ? 'inside' : 'outside') + ' has no protons to load. Give contents an H count on that side.');
          }
        } else cpxStarved = false;
      }
      if (st.phase !== cpxPhase) {
        /* The carrier comes in as the machine opens to load and is spent on
           the beat this table calls "the fuel is spent". */
        if (st.phase === 'load-H') { fuelArrive(); o2Arrive(); }
        if (st.phase === 'occlude') { fuelSpend(); o2Reduce(); }
        /* The proton is set down at the START of the empty half, so the two
           beats that follow are visibly carrying nothing. */
        if (st.phase === 'shut-out') {
          const n = cpxCargo.length, d = pumpDir();
          complexTurns += n; eng.crossed.H += d * n; eng.chargeOut += d * n;
          eng.mV = eng.clampMV(P.mvPerIon * eng.chargeOut);
          releaseProtons(d); eng.emit('pumped', complexTurns);
        }
        cpxPhase = st.phase;
      }
      /* MIRRORED WHEN IT PUMPS DOWN: the table's `u` runs −1 at the loading
         mouth to +1 at the far one, so multiplying by the direction puts the
         loading mouth at the bottom in a mitochondrion and the top in a
         thylakoid, and the gates swap with it. */
      const d = pumpDir();
      setCpxGates(d > 0 ? st.gates.top : st.gates.bottom, d > 0 ? st.gates.bottom : st.gates.top);
      for (let i = 0; i < st.cargo.length; i++) {
        const t = cpxCargo[i];
        if (!t) continue;
        const ty = st.cargo[i].u * d * COMPLEX.height, tx = complexX + (i - (st.cargo.length - 1) / 2) * 5.5;
        t.x += (tx - t.x) * 0.18; t.z += (0 - t.z) * 0.18; t.y += (ty - t.y) * 0.18;
        t.obj.position.set(t.x, t.y, t.z);
      }
      return st;
    }

    const at = eng.at;
    return {
      keys: { complex:null, synthase:null, leak:null, translocase:null },
      parts: [COMPLEX, SYNTH, LEAK, ANT],
      /* Every machine setCut opens, and PORIN is one though it stands in the
         other sheet: a barrel left off is the one solid object in a cutaway. */
      cutParts: [PORIN],
      tOrder: [['complex', COMPLEX], ['synthase', SYNTH], ['leak', LEAK]],
      tFallback: COMPLEX,
      rules: ['H'],
      handles: { complex:COMPLEX, synthase:SYNTH, leak:LEAK },
      layout(pr, holes, PORES) {
        COMPLEX.group.visible = !!pr.complex;
        if (pr.complex) { complexX = pr.complex.x; COMPLEX.group.position.x = complexX;
          /* A carrier, like the pump: no kind, so nothing queues in it. Its
             protons are recruited, not admitted. */
          holes.push([complexX, CPX_HOLE]); PORES.push({ x:complexX, R:CPX_R, lumen:8.0, kind:null }); }
        SYNTH.group.visible = !!pr.synthase;
        synthX = pr.synthase ? pr.synthase.x : null;
        if (pr.synthase) { SYNTH.group.position.x = synthX; SYNTH.setGates(1, 1);
          holes.push([synthX, SYN_HOLE]); PORES.push({ x:synthX, R:SYN_R, lumen:8.2, kind:'H', door:'synthase' }); }
        LEAK.group.visible = !!pr.leak;
        if (pr.leak) { LEAK.group.position.x = pr.leak.x; LEAK.setGates(1, 1);
          holes.push([pr.leak.x, LEAK_HOLE]); PORES.push({ x:pr.leak.x, R:LEAK_R, lumen:7.6, kind:'H', door:'leak', weight:LEAK_PREFERENCE }); }
        ANT.group.visible = !!pr.translocase;
        antX = pr.translocase ? pr.translocase.x : null;
        if (pr.translocase) { ANT.group.position.x = antX; ANT.setGates(1, 1);
          /* A carrier with no kind: what it carries is not a traveller at all. */
          holes.push([antX, ANT_HOLE]); PORES.push({ x:antX, R:ANT_R, lumen:7.0, kind:null }); }
      },
      /* F1 HANGS WHERE THE ATP IS MADE, the side the protons come out on:
         the matrix, or the stroma. Positioned by sign, not a negative scale. */
      orient(d) { for (const child of ROTOR.children) child.position.y = -d * child.userData.baseY; },
      afterSheet: buildOuter,
      setCut(on) { if (OUTER) OUTER.cut.enable(on); },   // the lid is cut too, or the porin opens into a wall
      admits(t) { if (t.kind === 'H') return protonDir() === -pumpDir() && Math.sign(t.y) === pumpDir(); },
      /* ONE PROTON, ONE NOTCH. The rotor's angle and the ATP count both come
         out of the same pass(), so the picture cannot get ahead of the
         number. A proton down the uncoupler's hole turns nothing. */
      onConduct(t, dir) {
        if (t.kind !== 'H' || dir !== -pumpDir()) return;   // only one that came home counts
        if (synthX != null && t.lane === synthX) { protonsThroughSynthase++; if (ROT.pass(1)) { releaseATP(); eng.emit('atp', ROT.atp); } }
        else protonsLeaked++;
      },
      withContents: withProtons,
      /* Where pH is measured FROM. Protons are conserved, so this stays the
         zero of the scale however far the gradient runs. */
      contentsSet(c) {
        if (c && ((c.inside && c.inside.H) || (c.outside && c.outside.H)))
          protonRef = (((c.inside && c.inside.H) | 0) + ((c.outside && c.outside.H) | 0)) / 2;
      },
      pre(dt) { cpxState = runComplex(dt); },
      post(dt) {
        ROTOR.rotation.y += (ROT.angle - ROTOR.rotation.y) * Math.min(1, dt * 6);
        tickATP(dt); tickFuel(dt); tickO2(dt);
      },
      set(next) {
        if (next.outerMembrane != null && next.outerMembrane !== P.outerMembrane) {
          P.outerMembrane = !!next.outerMembrane; eng.relayout();   // the lid is built with the layout
        }
      },
      state(base) {
        const h = base.counts.H || { inside:0, outside:0 };
        const proton = CHEM.protonState(h, eng.mV, protonRef, pumpDir());
        return {
          outerMembrane: outerOn(),
          /* The third space, when there is one: above the outer membrane is
             neither half of this sim, and a caption that calls it "outside"
             has put the cytosol outside the cell. */
          sides: Object.assign(base.sides, { beyond: outerOn() ? 'the cytosol' : null }),
          pH: proton.pH, dpH: proton.dpH, pmf: proton.pmf,
          atpMade: ROT.atp, rotorTurns: ROT.protons / CHEM.PROTONS_PER_TURN,
          protonsThroughSynthase, protonsLeaked, complexTurns,
          fuel: P.fuel, oxygen: P.oxygen !== false, fuelRate: CHEM.complexRate(P.fuel, P.fuelRate, proton.pmf, P.oxygen), pmfStall: CHEM.PMF_STALL,
          complexPhase: cpxState ? cpxState.phase : null, complexLabel: cpxState ? cpxState.label : null,
          complexCaption: cpxState ? cpxState.caption : null, complexT: cpxT,
          complexStoichiometry: CHEM.Complex.PROTONS_PER_CYCLE, complexStarved: cpxStarved,
          stoichiometry: { protonsPerTurn: CHEM.PROTONS_PER_TURN, atpPerTurn: CHEM.ATP_PER_TURN, protonsPerATP: CHEM.PROTONS_PER_ATP },
        };
      },
      reset() {
        ROT.reset(); complexTurns = 0; protonsLeaked = 0; protonsThroughSynthase = 0;
        clearATP(); clearFuel(); clearO2(); pulseFuel = null;
        for (const t of cpxCargo) t.aboard = false;
        cpxCargo.length = 0; cpxT = 0; cpxPhase = ''; cpxState = null;
      },
      clear() { cpxCargo.length = 0; },
      lid: outerOn,
      /* THE CEILING ON THE COMPARTMENT BELOW IT, or the protons just pumped
         out drift straight through the outer sheet. */
      bandCap: () => outerOn() ? OUTER_GAP - 8 : Infinity,
      clearXs: () => outerOn() && porinX != null ? [porinX] : [],
      api: { feed },
      layers: {
        outer: { label: 'the outer membrane', get: () => outerOn(), set: v => eng.set({ outerMembrane: !!v }) },
      },
      anchors: {
        complex:  () => P.proteins.complex  ? at(complexX, COMPLEX.height * 0.98) : null,
        translocase: () => antX == null ? null : at(antX, ANT.height * 0.98),
        porin:    () => !outerOn() ? null : at(porinX, outerY() + pumpDir() * HALF * 0.9),
        cytosol:  () => !outerOn() ? null : at(eng.clearX(), outerY() + pumpDir() * 34),
        /* On the rotor, which moves with the context. */
        synthase: () => synthX == null ? null : at(synthX, -pumpDir() * SYNTH.height * 1.15),
        leak:     () => P.proteins.leak ? at(P.proteins.leak.x, LEAK.height * 0.98) : null,
        oxygen:   () => o2 ? o2.obj.position : null,
        H: () => eng.firstOf('H'),
      },
      library: {
        /* The name is the CONTEXT's: the machine that pumps is a different
           protein in a mitochondrion and a chloroplast, so applyContext()
           rewrites it, and this literal stands when a page set neither. */
        complex: { text: 'a proton-pumping complex', offset: [-44, -30],
          card: 'It carries protons one way only, and it pays with the fuel rather than with ATP. Turn the fuel off and it stops, which is the whole reason the gradient is a store and not a fixture.' },
        synthase: { text: 'ATP synthase', offset: [42, 30],
          card: 'A turbine, not a pump. Protons come back down the gradient through it and the rotor turns; every third of a turn makes one ATP. It cannot run uphill, so with no gradient it simply stops.' },
        oxygen: { text: 'oxygen', offset: [42, -34],
          card: 'The last stop for the electrons. Each O₂ takes four, two from each NADH, and four protons from the matrix, and leaves as two waters. With no oxygen the electrons have nowhere to go and the whole chain stops.' },
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
      applyContext(library) {
        if (P.context === 'mitochondrion') {
          library.outside.card = 'The intermembrane space. Every proton the complexes throw out lands here, so this side goes acidic and positive: that is where the energy from NADH now sits. This space and a chloroplast\'s thylakoid lumen are the same place by descent, both of them the OUTSIDE of the bacterium each organelle came from. That is why a photosynthesis diagram looks flipped against this one.';
          library.inside.card  = 'The matrix. The Krebs cycle runs here and hands its NADH to the complexes in this membrane. Protons leave from this side and come back through the synthase.';
          library.complex.text = 'electron transport chain';
          library.complex.card = 'Three complexes drawn as one. NADH hands them electrons, they pass them down to oxygen, which becomes water, and each drop pays for protons thrown out. It spends FUEL rather than ATP: turn the fuel off and it stops, which is the whole reason the gradient is a store and not a fixture.';
        } else if (P.context === 'thylakoid') {
          library.outside.card = 'The stroma, around the outside of the thylakoid disc. ATP is made here, and it is what the Calvin cycle spends to fix carbon. Protons leave from this side and come back through the synthase.';
          library.complex.text = 'the light-driven chain';
          library.complex.card = 'Photosystem II splits water and starts the electrons moving, cytochrome b6f is the one that pumps, and photosystem I lifts them again for NADPH. Drawn as one machine. Light is the fuel, so the dimmer is a rate knob and darkness stops it.';
          library.inside.card  = 'The lumen, the space enclosed by the disc. Light drives protons in here, so this is the acidic side: the energy from the photons is now a gradient across this membrane. It is the same space as a mitochondrion\'s intermembrane space, both of them the OUTSIDE of the bacterium each organelle came from. A thylakoid ended up with that space sealed inside it, which is why the two diagrams are mirrored for a real reason rather than by convention.';
        }
      },
      proteinKey: {
        complex:  { name: 'the complex that pumps H⁺', color: '#4d5fa6' },
        synthase: { name: 'ATP synthase', color: '#d9a13b' },
        leak:     { name: 'uncoupler (a hole for H⁺)', color: '#8e939b' },
        translocase: { name: 'ADP/ATP translocase', color: '#' + RESP.translocase.toString(16).padStart(6, '0') },
      },
      /* The translocase carries no traveller: what goes through it is the ATP. */
      carries: { complex:['H'], synthase:['H'], leak:['H'], translocase:[] },
    };
  }

  /* ---- the component ----
     A mount with no params is an inner mitochondrial membrane that runs: a
     complex, a synthase, NADH, and a gradient's worth of protons. A thylakoid
     defaults to light, because NADH in a chloroplast is a page that will not
     turn. */
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet) throw new Error('Chemiosmosis: load membrane/parts.js and membrane/sheet.js first');
    const context = opts.context || 'mitochondrion';
    const P = Object.assign({ componentName: 'Chemiosmosis' }, global.Sheet.DEFAULTS, MACHINE_DEFAULTS,
      { context, potential: 'nernst', fuel: context === 'thylakoid' ? 'light' : 'NADH' }, opts);
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    P.proteins = Object.assign({}, opts.proteins || { complex:{ x:-80 }, synthase:{ x:40 } });
    return global.Sheet.create(THREE, root, camera, P, [machine]);
  }
  function mount(el, params = {}) {
    return global.Sheet.mount(el, params, { name: 'Chemiosmosis', create, signals: SIGNALS, api: ['feed'] });
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
