/* =============================================================================
 *  chemiosmosis/circuit.js — the proton circuit's plumbing
 * =============================================================================
 *  Something with energy to spend pumps protons across a membrane; ATP
 *  synthase lets them back down and makes ATP on the way. Two components draw
 *  that picture, ElectronTransport (a mitochondrion's inner membrane) and
 *  LightReactions (a thylakoid), and this file is what they share:
 *
 *      Circuit.kit(eng, spec)            the plumbing, built inside a component's machine
 *      Circuit.mount(el, params, spec)   one box, one handle, over Sheet.mount
 *      Circuit.DEFAULTS · Circuit.SIGNALS
 *
 *  SHARED HERE: the synthase (a c ring of `ring.c` rods, the stalk and the F1
 *  head, mirrored by the context), the rotor's ledger, the uncoupler's hole,
 *  every machine's six-phase cycle (`runner`), the chain's shape (a `donor`,
 *  a `hub` that runs the Q cycle, a `terminal`),
 *  the two shuttles and the electrons drawn walking between them, the
 *  carriers that dock and leave spent and the queue of ones fed by hand, the
 *  ATP that leaves the head and the route it takes, the proton doors and the
 *  default gradient. NOT HERE: which machines stand in the membrane, their
 *  names, what fuels them, what the electrons end on, how many rods the ring
 *  has, and every card. Nothing in this file names a complex. The arithmetic
 *  it runs on (pH, pmf, the rotor, the phase table) is membrane/chemiosmosis.js.
 *
 *  spec, at kit():
 *      name       for warnings
 *      ring       { c, protonsPerTurn, atpPerTurn }   rods drawn, and the rotor's ledger
 *      line       { keys, donors:{key: fuel}, rest, hub, end, stands, q:[ox, red], c, qColor, cColor }
 *                 the split chain in order: which keys take a fuel, where the
 *                 quinone rests, which pumps by the Q cycle, which ends the
 *                 pair, which one the `complex` anchor stands on when split
 *      table      { key: { takes, gives, pumps, ... } }   protons per pair, per machine
 *      carries    { shuttle: electrons per trip }
 *      shapes     { key: { R, lobes, lobe, color, over } }   a lathe per key, unless
 *      build      (key, H) => part | null      the component builds that one itself
 *      offsets    [x, ...]   where each key stands about `proteins.complex.x`, the chain's centre
 *      fuels      { name: { weight } }         what may drive the chain, and how hard
 *
 *  K.hooks, filled by the component once its own parts exist:
 *      token(key, fuel)   the carrier that docks: { label, spent, color, lobes, fuel,
 *                         shuttle, dock: () => {from, at, away}, y0, band }
 *      atpLegs()          legs the ATP walks before it leaves; a leg's `on` fires on arrival
 *      onATP()            after each ATP is made (an export cost)
 *      cSeat(key)         where the one-electron shuttle sits on a knob
 *      resetChain()       the component's own tokens, on every chain reset
 *
 *  The machine plugin a component returns is K.plugin(ext): the shared
 *  behaviour with ext's parts, keys, layout, orient, afterSheet, post, state,
 *  set, reset, cards, anchors, library, proteinKey and carries merged in.
 * ========================================================================== */
(function (global) {
  'use strict';
  const CHEM = global.Chemiosmosis;
  if (!CHEM) throw new Error('circuit.js: load membrane/chemiosmosis.js first');

  const DEFAULTS = {
    fuel: null,               // what drives the chain; the component says which names it takes
    fuelRate: 1,              // 0..1, a supply dial or a light dimmer
    complexSeconds: 4.2,      // ONE FULL CYCLE of a machine, the empty half included
    showATP: true,            // the synthase releases a drawn ATP per third-turn
    showFuel: true,           // a carrier arrives at the complex and leaves spent
    atpExit: null,            // 'left' | 'right': it leaves that way, toward the box that spends it
    /* WHERE THE ATP IS GOING, as a function returning a WORLD point — the
       pump in another sim sharing this scene. Takes precedence over atpExit;
       'atpDelivered' fires on arrival, the moment something may spend it. */
    atpTo: null,
  };
  /* How close the chain may pack. Tuned against the default camera. */
  const CHAIN_GAP = 50;

  function kit(eng, spec) {
    const { THREE, P, HALF, BOW, rnd, travellers, kit, seat, root } = eng;
    const Parts = global.Parts;
    const pumpDir = eng.pumpDir;
    const RESP = global.MolLib.PALETTE.respiration;
    const line = spec.line, ALL = line.keys, ring = spec.ring;
    const ROW = k => spec.table[k];
    const hooks = {};
    let RUN = {};

    /* ---- the machines ----
       Each key of the line is a machine the component builds (`spec.build`)
       or a lathe from `spec.shapes`. INDIGO for a pump: a mitochondrion's
       lipid is orange, and a warm machine disappears into it. */
    const holeOf = (R, lobe) => R * (1 + lobe) + 0.5;
    /* THE REFERENCE HEIGHT: a transporter's reach past the bilayer, the
       height every dock, wait spot and float band is measured from, so a
       carrier sits the same distance off any machine. */
    const H_ = () => HALF + 14;
    const SPEC = spec.shapes;
    /* A solid rod through the bilayer: a lathe capsule with no lumen, widened
       in x so one reads as two bundles side by side. For a machine that is
       not a pump: no lumen, no mouths, no gates. */
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
    /* A lathe from a radius profile r(y) between bottom and top, for a solid
       dimer with no channel: `belly` says where it swells. */
    function lathePart(color, { top, bottom, rTop, rMax, belly, sx = 1 }) {
      const N = 40, prof = [new THREE.Vector2(1e-3, bottom)];
      for (let i = 1; i < N; i++) {
        const y = bottom + (top - bottom) * i / N, u = i / N;
        const r = (rTop + (rMax - rTop) * belly(y)) * Math.pow(Math.sin(Math.PI * u), 0.35);
        prof.push(new THREE.Vector2(Math.max(r, 1e-3), y));
      }
      prof.push(new THREE.Vector2(1e-3, top));
      const geo = new THREE.LatheGeometry(prof, 40);
      const mesh = new THREE.Mesh(geo, Parts.flat(color));
      mesh.scale.set(sx, 1, 1);
      const group = new THREE.Group(); group.add(mesh);
      return { group, mesh, geometry: geo, height: top, setGates() {}, get gates() { return { top: 0, bottom: 0 }; },
               site: new THREE.Vector3(), dispose() { geo.dispose(); mesh.material.dispose(); } };
    }
    /* userData.side: +1 on the pumped-into face, −1 on the loading face */
    const knob = (color, r, x, baseY, side, sy = 1) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), Parts.flat(color));
      m.scale.set(1, sy, 1); m.position.x = x; m.userData.baseY = baseY; m.userData.side = side;
      return m;
    };
    const CX = {};
    for (const k of ALL) CX[k] = (spec.build && spec.build(k, { solidPart, lathePart, knob, HALF })) ||
      Parts.transporter({ over: SPEC[k].over != null ? SPEC[k].over : 14, half:HALF, site:6.2, mouth:8.0, radius:SPEC[k].R, lobes:SPEC[k].lobes, lobeDepth:SPEC[k].lobe, color:SPEC[k].color });

    /* ATP SYNTHASE HAS NO TUBE THROUGH IT (bovine, PDB 6ZPO). In the membrane
       is Fo: a ring of c subunits that turns, with lipid in its middle, and
       beside it the stator subunit a. A proton comes in through a
       half-channel in a, rides a c subunit most of a turn, and leaves by a's
       other half-channel, so the path is AT THE a/c INTERFACE, not down an
       axis. The ring drives the narrow central stalk up into F1, the αβ
       head in the matrix, which the peripheral stalk holds still from a.
       Proportions follow the structure: a c8 ring about half the head's
       width, stalk a head's radius long. THE RING GROWS WITH ITS COUNT: a c
       subunit is one size, so a ring of fourteen is a wider ring of the same
       rods, not the same ring with thinner ones. */
    const C_R = 2.4, RING_R = 7.5 * ring.c / 8, A_X = RING_R + C_R + 4.2, LANE_DX = RING_R + C_R + 0.6;
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
    const ROTOR = buildRotor(), HEAD = buildHead();
    SYNTH.group.add(ROTOR, HEAD);
    root.add(SYNTH.group, LEAK.group, ...ALL.map(k => CX[k].group));
    const xs = Object.fromEntries(ALL.map(k => [k, 0]));
    let synthX = null;

    /* The ROTOR turns: the c ring in the membrane and the central stalk
       above it, with an off-axis foot so the turning reads. The STATOR does
       not: F1, the peripheral stalk and its cap. F1's three αβ pairs are why
       a third of a turn is one ATP. Children are placed by baseY and a
       side, so orient() can mirror them by sign. */
    function buildRotor() {
      const g = new THREE.Group();
      const stalkMat = Parts.flat(RESP.stalk), gold = Parts.flat(RESP.synthase);
      for (let i = 0; i < ring.c; i++) {
        const c = new THREE.Mesh(new THREE.CylinderGeometry(C_R, C_R, 2 * HALF + 2, 12), gold);
        const th = (i / ring.c) * Math.PI * 2;
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
    function follow(c, dt, speed) {
      if (!c.path || !c.path.length) return true;
      if (approach(c, c.path[0], dt, speed)) c.path.shift();
      return !c.path.length;
    }
    /* The pill goes on an UNSCALED wrapper: smallMolecule scales its group by
       K_(), and a tag inside it came out several times the NADH's. */
    function tagged(mol, name) {
      const g = new THREE.Group(), tag = kit.pill(name, 6.4);
      tag.position.set(0, 7.0, 0);
      g.add(mol, tag); g.userData.tag = tag;
      return g;
    }
    const untag = obj => { const tag = obj.userData.tag; if (tag) { kit.forget(tag); obj.remove(tag); obj.userData.tag = null; } };
    const posOf = t => ({ x: t.x, y: t.y, z: t.z || 0 });
    /* waypoints inside a complex: its face on side s (+1 pumped-into, -1 loading), and mid-membrane */
    const faceOf = (key, s, dx = 0) => ({ x: xs[key] + dx, y: s * pumpDir() * CX[key].height * 0.75, z: 0 });
    const midOf = (key, dx = 0) => ({ x: xs[key] + dx, y: 0, z: 0 });
    /* The nearest free protons on one side of the membrane, by distance from x. */
    const protonPool = (side, x, n) => travellers.filter(t => t.kind === 'H' && !t.aboard && t.lane == null && Math.sign(t.y) === side)
      .sort((a, b) => ((a.x - x) ** 2 + a.y * a.y) - ((b.x - x) ** 2 + b.y * b.y)).slice(0, n);

    /* ---- the ATP that comes out, and the way out ----
       One molecule leaves the head per third-turn, on the SAME pass() that
       increments the count. The route it walks is the component's, through
       hooks.atpLegs: a mitochondrion's ATP has doors to get out by, a
       thylakoid's is spent where it is made. DRAWN AS ITS PHOSPHATES: three
       beads against two is what tells ATP from ADP at this scale, and the
       third bond is the `condense` slate because it is a condensation. */
    const ROT = CHEM.rotor(ring);
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
      const legs = hooks.atpLegs ? hooks.atpLegs().slice() : [];
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
    /* A nucleotide of n phosphates set walking from (x, y) along legs: the ADP going the other way at a swap. */
    function launchNucleotide(n, x, y, legs) {
      const g = buildNucleotide(n);
      root.add(g);
      atpChips.push({ obj:g, t:0, phase:Math.random() * 6.28, fade:1, x, y, legs, leg:0 });
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
            if (leg.on) leg.on();
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

    /* ---- the carriers, arriving and leaving ----
       THE POINT IS THAT IT STAYS ON ONE SIDE: the carrier comes up out of the
       compartment it lives in, docks on the machine's face there, and goes
       back down. AND IT IS NOT CONSUMED: it docks under one name and leaves
       under its spent one, the same body and colour. What the carrier IS
       (its label, its spent form, where it docks) is the component's, as a
       token from hooks.token; this file only moves it. Timed off the
       machine's own cycle: it arrives as the machine opens to load and is
       spent on `occlude`. */
    const FUEL_SPEED = 60, FUEL_FADE = 0.9;
    const LEAVE_X = 420;   // past the frame's edge at the default camera
    const leaving = [];
    const chips = {};
    const pulse = {};
    const makeCarrier = tok => buildToken(tok.label, tok.color, tok.lobes == null ? 2 : tok.lobes);
    function carrierArrive(key, token) {
      if (!P.showFuel || chips[key]) return;
      /* A carrier fed by hand is already on stage, waiting: it is the one that docks. */
      const w = waiting[key] && waiting[key][0] && waiting[key][0].boarding ? waiting[key].shift() : null;
      const tok = w ? w.token : token;
      if (!tok) return;   // light: nothing arrives, and nothing should be drawn
      const dock = tok.dock();
      const g = w ? w.obj : makeCarrier(tok);
      if (!w) root.add(g);
      const from = w || dock.from;
      chips[key] = { obj:g, token:tok, shuttle:!!tok.shuttle, spentName:tok.spent, x:from.x, y:from.y, z:from.z || 0, to:dock.at, fade:1, spent:false };
      seat(g, chips[key].x, chips[key].y, chips[key].z);
    }

    /* ---- carriers fed by hand, waiting their turn ----
       feed() puts the carrier on stage AT ONCE, rising out of the deep
       compartment and hanging below its complex, so a click is always
       answered by a molecule. The complex takes them one per turn, oldest
       first; a full queue refuses the feed, and `state().waiting` says so
       before a page offers the button. A fuel with no token never waits. */
    const WAIT_MAX = 3, WAIT_SPEED = 45, WAIT_DEPTH = 90;
    const waiting = {};
    function waitSpot(key, i, tok) {
      const d = pumpDir(), from = tok.dock().from, s = tok.shuttle ? -1 : 1;
      return { x: from.x - 6 + i * 14 * (i % 2 ? 1 : -1), y: from.y - s * d * (8 + i * 16), z: 0 };
    }
    function enqueue(key, tok) {
      const q = waiting[key] || (waiting[key] = []);
      if (q.length >= WAIT_MAX) return false;
      const d = pumpDir(), spot = waitSpot(key, q.length, tok);
      const g = makeCarrier(tok);
      root.add(g);
      const y0 = tok.y0 ? tok.y0() : -d * (H_() + WAIT_DEPTH);
      const w = { obj:g, token:tok, f:tok.fuel, boarding:false, x: spot.x + rnd(-30, 30), y: y0, z: rnd(-10, 10), t: rnd(0, 6) };
      seat(g, w.x, w.y, w.z);
      q.push(w);
      return true;
    }
    function tickWaiting(dt) {
      for (const key of Object.keys(waiting)) {
        const q = waiting[key];
        q.forEach((w, i) => {
          w.t += dt;
          const spot = waitSpot(key, i, w.token);
          approach(w, { x: spot.x + Math.sin(w.t * 0.9) * 3, y: spot.y + Math.cos(w.t * 1.3) * 2, z: 0 }, dt, WAIT_SPEED);
        });
        /* The next one boards when the machine is free and the last carrier has gone. */
        const r = RUN[key];
        if (r && q.length && !q[0].boarding && !pulse[key] && !r.busy && !chips[key]) {
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
      c.to = c.token.dock().away;
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
         drawn floor of the compartment, or the band its token names. */
      const d = pumpDir(), H = H_(), floor = Math.min(P.bounds && P.bounds.down != null ? P.bounds.down : P.extent, P.extent) - 10;
      for (let i = leaving.length - 1; i >= 0; i--) {
        const c = leaving[i];
        if (!c.vx) { c.vx = (c.x < 0 ? -1 : 1) * rnd(10, 16); c.vy = rnd(-6, 6); }
        c.vy = Math.max(-14, Math.min(14, c.vy + rnd(-40, 40) * dt));
        c.x += c.vx * dt; c.y += c.vy * dt;
        const s = c.shuttle ? -1 : 1, depth = -s * d * c.y;
        const band = c.token.band ? c.token.band() : { lo: H + 14, hi: floor };
        if (depth < band.lo) { c.y = -s * d * band.lo; c.vy = -s * d * Math.abs(c.vy); }
        if (depth > band.hi) { c.y = -s * d * band.hi; c.vy = s * d * Math.abs(c.vy); }
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

    /* ---- the shuttles of the split chain ----
       THE QUINONE MOVES INSIDE THE MEMBRANE. It is oily, so it is drawn at
       the height of the tails, just in front of the cut face where it cannot
       pass through a protein on its way. It picks up a pair of electrons at
       a donor, walks to the hub, hands them over and walks back. Two of
       them, so one can be on its way while the other waits.

       THE ONE-ELECTRON SHUTTLE STAYS ON THE PUMPED-INTO FACE. It takes ONE
       electron, so the hub loads two per quinol; each walks to the end,
       gives its electron up, and walks home. Neither shuttle is consumed,
       which is the same fact as a carrier going back.

       They are also how the chain backs up. With nothing to take the last
       electrons, the shuttles wait loaded at the end; the hub then has no
       empty one to load and holds its quinol; the donor has no quinone left
       and stops, however much fuel is waiting. */
    const Q_Z = 6, Q_SPEED = 40, C_SPEED = 36;
    const qTokens = [], cTokens = [];
    let shuttleCtx = null;
    /* A FREE QUINONE MAY BE SPOKEN FOR. A machine that fires less often than
       the donors (a cyclic turn at PSI) never finds one free, because the
       donors run first every tick; it reserves the next one to come free and
       the donors pass it by. Reserving never waits on anyone, so it cannot
       lock the chain. */
    const freeQ = key => qTokens.filter(q => q.state === 'free' && (!q.reservedFor || q.reservedFor === key));
    function reserveQ(key) {
      const have = qTokens.find(q => q.reservedFor === key && q.state === 'free');
      if (have) return have;
      const q = freeQ(key)[0];
      if (q) q.reservedFor = key;
      return q || null;
    }
    const releaseQ = q => { if (q) q.reservedFor = null; };
    /* AT REST IN THE LIPID, between the last donor and the hub, where no protein stands. */
    const qHome = i => ({ x: (xs[line.rest] + xs[line.hub]) / 2 + (i ? 5 : -5), y: 0, z: i ? -Q_Z : Q_Z });
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
       again; x waits while z clears. A real quinone wanders a shared pool at
       random; this one walks to where it is going so a student can follow one
       pair of electrons, with a wobble in the tails so it does not read as a
       conveyor. */
    function qMove(q, dt) {
      const to = q.to, dx = to.x - q.x;
      const nx = q.x + Math.sign(dx) * Math.min(Math.abs(dx), Q_SPEED * dt);
      let zWant = to.z, blocked = false;
      for (const k of ALL) {
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
    const cSeat = key => hooks.cSeat ? hooks.cSeat(key) : H_() + 7;
    const cHome = i => ({ x: xs[line.hub] - 4 + (i ? 5 : -5), y: pumpDir() * cSeat(line.hub), z: 0 });
    const cDock = i => ({ x: xs[line.end] - 4 + (i ? 5 : -5), y: pumpDir() * cSeat(line.end), z: 0 });
    /* Electrons the hub's shuttle takes a trip: 2 per pair over this. */
    const cCarries = () => spec.carries[ROW(line.hub).gives];
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
       leaves the donor and rides the quinone; the hub splits it onto two
       one-electron shuttles; the end collects them. The shuttle waits for
       its electrons before it leaves, so the picture cannot run ahead of
       them. DRAWN OVER THE PROTEIN (no depth test): the route runs through
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

    /* ---- the Q cycle's protons ----
       A QUINONE TAKES TWO H⁺ WITH ITS TWO ELECTRONS: reduced at a donor, it
       picks them up from the loading side and carries them as the quinol.
       At the hub they are let go on the far side, with more the hub takes in
       at its Qi site, and no channel through it. A real turn runs two
       quinols through Qo and one back through Qi; this draws the net, and
       the drawn totals match the component's table. */
    const Q_H = 2, E_PER_TURN = 2;
    function protonateQ(q) {
      const pool = protonPool(-pumpDir(), q.x, Q_H);
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
      for (let i = 0; i < 2; i++) {
        const q = { obj: buildToken(line.q[0], line.qColor, 1), i, state: 'free', charged: false, reservedFor: null };
        Object.assign(q, qHome(i)); q.to = qHome(i);
        root.add(q.obj); seat(q.obj, q.x, q.y, q.z); qTokens.push(q);
        const c = { obj: buildToken(line.c, line.cColor, 1), i, state: 'home', e: null };
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
      for (const q of qTokens) { if (q.state !== 'free') relabel(q.obj, line.q[0], 8.0); q.state = 'free'; q.charged = false; q.reservedFor = null; q.to = qHome(q.i); }
      for (const c of cTokens) { ePill(false, c); c.state = 'home'; c.to = cHome(c.i); }
      clearE();
    }
    function tickShuttles(dt) {
      for (const q of qTokens) {
        const there = qMove(q, dt);
        tickQH(q);
        if (q.state === 'toDonor' && there && q.charged) {
          relabel(q.obj, line.q[1], 8.0);
          q.state = 'toHub'; q.to = qDock(line.hub, q.x, q.i);
        } else if (q.state === 'toHub' && there) q.state = 'atHub';
      }
      for (const c of cTokens) {
        const there = approach(c, c.to, dt, C_SPEED);
        if (c.state === 'toEnd' && there) c.state = 'atEnd';
        else if (c.state === 'returning' && there) c.state = 'home';
      }
    }
    const shuttleCounts = () => ({
      reduced: qTokens.filter(q => q.state === 'toHub' || q.state === 'atHub' || (q.state === 'toDonor' && q.charged)).length,
      loaded: cTokens.filter(c => c.state === 'toEnd' || c.state === 'atEnd').length,
    });

    /* ---- the proton circuit's doors ----
       `protonRef` is the count each side started with, so pH is read as a
       departure from where the page set it. */
    let protonRef = null, pumpedTotal = 0, protonsLeaked = 0, protonsThroughSynthase = 0;
    /* A PROTON GOES ONE WAY THROUGH A DOOR: down the proton-motive force.
       Off the headcount, not state(), which walks every traveller. */
    const protonDir = () => CHEM.synthaseDirection(eng.sideCount('H'), eng.mV, { ref: protonRef, dir: pumpDir() });
    const pmfNow = () => CHEM.protonState(eng.sideCount('H'), eng.mV, protonRef, pumpDir()).pmf;
    const backPressure = () => Math.max(0, 1 - pmfNow() / CHEM.PMF_STALL);
    const reMV = () => { eng.mV = eng.clampMV(P.mvPerIon * eng.chargeOut); };
    /* A PUMPING MEMBRANE WITH NO PROTONS IS A FROZEN ONE. Generated apps
       mounted it that way, so a chain gets a gradient's worth by default.
       Any `H` key, 0 included, is the page choosing. */
    const DEFAULT_PROTONS = 30, DEFAULT_WATER = 30;
    const hasChain = pr => pr && (pr.complex || ALL.some(k => pr[k]));
    function withProtons(c) {
      if (!CHEM.CONTEXTS[P.context] || !hasChain(P.proteins)) return c;
      if (c && ((c.inside && 'H' in c.inside) || (c.outside && 'H' in c.outside))) return c;
      const side = s => Object.assign({ water: DEFAULT_WATER }, (c && c[s]) || {}, { H: DEFAULT_PROTONS });
      return { inside: side('inside'), outside: side('outside') };
    }
    /* What a fuel pays at a rate, against the force already built. */
    const fuelRate = (f, r, pmf) => f && spec.fuels[f] ? CHEM.rate(spec.fuels[f].weight, r, pmf) : 0;

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
    const period = () => Math.max(0.1, P.complexSeconds);
    function runner(o) {
      const r = { key: o.key, t: 0, phase: '', cargo: [], busy: false, starved: false, warned: false, st: null, turns: 0,
                  gates: { top: NaN, bottom: NaN } };
      /* ALL OR NOTHING, the pump's rule: a partly loaded machine turns with an
         empty seat, and the seat is where a student is counting. */
      function recruit(n) {
        if (!n) return true;
        const pool = protonPool(-pumpDir(), o.x(), Infinity);
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
              console.warn(`${spec.name}: the complex is fuelled but ` + CHEM.sideName(P.context, pumpDir() > 0 ? 'inside' : 'outside') + ' has no protons to load. Give contents an H count on that side.');
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
       else the supply if it is this donor's fuel. A donor that pumps nothing
       does not feel the gradient; the chain stalls the honest way instead,
       with every quinone full and the hub, which does feel it, not taking them. */
    const donorRate = (key, fuel) => {
      const f = pulse[key] || (P.fuel === fuel ? fuel : null);
      if (!f) return 0;
      return fuelRate(f, pulse[key] ? 1 : P.fuelRate, ROW(key).pumps ? pmfNow() : null);
    };
    /* A DONOR takes a fuel and loads a quinone. `more.eFrom(chip)` and
       `more.eVia(chip)` are where its electrons start and the way through
       it; a donor that ejects its electrons one photon at a time gives
       `more.eject(q, charge)` instead and calls `charge` once both ride
       the quinone. `more.onLoad(q)` sees the quinone the turn claimed. */
    function donor(key, fuel, more = {}) {
      const r = runner({
        key, part: CX[key], n: ROW(key).pumps, x: () => xs[key],
        rate: () => donorRate(key, fuel),
        ready: () => freeQ(key).length > 0,
        load: () => {
          const q = freeQ(key).sort((a, b) => Math.abs(a.x - xs[key]) - Math.abs(b.x - xs[key]))[0];
          q.reservedFor = null; q.state = 'toDonor'; q.charged = false; q.to = qDock(key, q.x, q.i); r.q = q;
        },
        onLoad: () => { carrierArrive(key, hooks.token && hooks.token(key, pulse[key] || fuel)); if (more.onLoad) more.onLoad(r.q); },
        onOcclude: () => {
          const q = r.q; r.q = null;
          if (q) {
            const charge = () => { q.charged = true; protonateQ(q); };
            if (more.eject) more.eject(q, charge);
            else {
              const chip = chips[key];
              const from = more.eFrom ? more.eFrom(chip) : chip ? posOf(chip) : faceOf(key, -1);
              const via = more.eVia ? more.eVia(chip) : [midOf(key)];
              sendE(E_PER_TURN, from, via, q, charge);
            }
          }
          fuelSpend(key); if (more.onOcclude) more.onOcclude();
        },
        onWrap: () => { pulse[key] = null; },
      });
      return r;
    }
    /* THE HUB: complex III, or b6f. Takes a reduced quinone, pumps, and loads
       the one-electron shuttles, two per pair. */
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
            relabel(q.obj, line.q[0], 8.0); q.state = 'free'; q.charged = false; q.to = qHome(q.i); r.q = null;
          } else go();
        },
      });
      return r;
    }
    /* THE END: what takes the pair off the one-electron shuttles. `more.site()`
       is where the electrons go, `more.ready()` whether anything is there to take them. */
    function terminal(key, more) {
      return runner({
        key, part: CX[key], n: ROW(key).pumps, x: () => xs[key],
        rate: more.rate,
        ready: () => more.ready() && cTokens.filter(c => c.state === 'atEnd').length * cCarries() >= E_PER_TURN,
        load: () => {
          /* The component's load first: it may decide where this turn's electrons are going. */
          if (more.load) more.load();
          const site = more.site ? more.site() : faceOf(key, -1);
          for (const c of cTokens.filter(c => c.state === 'atEnd').slice(0, E_PER_TURN / cCarries())) {
            handOff(c, [faceOf(key, 1, -3), midOf(key)], site);
            ePill(false, c); c.state = 'returning'; c.to = cHome(c.i);
          }
        },
        onLoad: more.onLoad, onOcclude: more.onOcclude, onWrap: more.onWrap, onPhase: more.onPhase,
      });
    }
    const runners = () => ALL.map(k => RUN[k]);
    /* The runner a page's caption follows: the donor a one-shot is on, else the supply's, else the first. */
    const leadRunner = () => {
      const dk = Object.keys(line.donors);
      const k = dk.find(k => pulse[k]) || dk.find(k => line.donors[k] === P.fuel) || dk[0];
      return RUN[k];
    };
    function resetChain() {
      for (const k of ALL) RUN[k].reset();
      for (const k of Object.keys(pulse)) pulse[k] = null;
      clearFuel(); clearWaiting(); clearE();
      if (hooks.resetChain) hooks.resetChain();
      if (qTokens.length) homeShuttles();
    }
    /* ONE CARRIER, ONE TURN, the chain's answer to the pump's spend(), at
       the donor named. A token queues a drawn carrier; none is a bare pulse
       (light). */
    function feedAt(key, f, token) {
      if (token && P.showFuel) return enqueue(key, token);
      pulse[key] = f; clearFuel(key); RUN[key].kick();
      return true;
    }

    const at = eng.at;
    let LIB = null, cardsCtx = null, ext = null;
    /* Called on every context change, before the relayout: runners and
       shuttles from the other line would carry a half-finished turn across. */
    function applyContext(library) {
      LIB = library;
      if (cardsCtx !== null && cardsCtx !== P.context) resetChain();
      cardsCtx = P.context;
      if (ext && ext.cards) ext.cards(library);
    }
    const hex = n => '#' + n.toString(16).padStart(6, '0');

    function baseState(base) {
      const h = base.counts.H || { inside:0, outside:0 };
      const proton = CHEM.protonState(h, eng.mV, protonRef, pumpDir());
      const lead = leadRunner(), st = lead.st;
      return {
        pH: proton.pH, dpH: proton.dpH, pmf: proton.pmf,
        atpMade: ROT.atp, rotorTurns: ROT.protons / ring.protonsPerTurn,
        protonsThroughSynthase, protonsLeaked, complexTurns: pumpedTotal,
        fuel: P.fuel, fuelRate: fuelRate(P.fuel, P.fuelRate, proton.pmf), pmfStall: CHEM.PMF_STALL,
        complexPhase: st ? st.phase : null, complexLabel: st ? st.label : null,
        complexCaption: st ? st.caption : null, complexT: lead.t,
        complexStarved: runners().some(r => r.starved),
        /* Carriers fed and not yet docked, per complex, and how many may wait. */
        waiting: Object.assign({ max: WAIT_MAX }, Object.fromEntries(Object.keys(waiting).map(k => [k, waiting[k].length]))),
        /* THE CHAIN'S LEDGER, per machine, walked off the table rather than typed. */
        complexes: Object.fromEntries(ALL.map(k => [k, {
          turns: RUN[k].turns, pumpsPerTurn: ROW(k).pumps, pumped: RUN[k].turns * ROW(k).pumps,
          label: RUN[k].st ? RUN[k].st.label : null, phase: RUN[k].st ? RUN[k].st.phase : null,
        }])),
        stoichiometry: { protonsPerTurn: ring.protonsPerTurn, atpPerTurn: ring.atpPerTurn, protonsPerATP: ring.protonsPerTurn / ring.atpPerTurn,
                         ringSubunits: ring.c, protonsPerExport: 0 },
      };
    }

    /* ---- the machine plugin, for sheet.js ---- */
    function plugin(e) {
      ext = e;
      RUN = e.runners;
      const keys = Object.assign({ synthase:null, leak:null }, Object.fromEntries(ALL.map(k => [k, null])), e.keys || {});
      const anchorsOf = () => {
        /* `complex` stands on the machine the line names, so a page written for "the complex" still points at one. */
        const stands = () => P.proteins[line.stands] ? at(xs[line.stands], H_() * 0.98) : null;
        return Object.assign({
          complex: stands,
          synthase: () => synthX == null ? null : at(synthX, -pumpDir() * (F1_BASE + F1_H * 0.5)),
          leak:     () => P.proteins.leak ? at(P.proteins.leak.x, LEAK.height * 0.98) : null,
          H: () => eng.firstOf('H'),
        }, e.anchors || {});
      };
      return {
        keys,
        parts: [...ALL.map(k => CX[k]), SYNTH, LEAK, ...(e.parts || [])],
        cutParts: e.cutParts || [],
        tOrder: [...(e.tOrder || ALL).map(k => [k, CX[k]]), ['synthase', SYNTH], ['leak', LEAK]],
        tFallback: CX[line.stands],
        rules: ['H'],
        handles: Object.assign({ synthase:SYNTH, leak:LEAK }, CX, e.handles || {}),
        poreGap: () => CHAIN_GAP,
        /* `complex:{x}` is the chain's centre: the machines are spread about
           it by spec.offsets, so a page places the chain with one number. */
        expand(given) {
          if (!ALL.some(k => given[k]) && given.complex) {
            const x = given.complex.x || 0;
            ALL.forEach((k, i) => { given[k] = { x: x + spec.offsets[i] }; });
          }
          delete given.complex;
        },
        layout(pr, holes, PORES) {
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
          if (e.layout) e.layout(pr, holes, PORES);
        },
        /* F1 HANGS WHERE THE ATP IS MADE, positioned by sign, not a negative
           scale, which would turn the lighting inside out. */
        orient(d) {
          for (const child of ROTOR.children) child.position.y = -d * child.userData.baseY;
          for (const child of HEAD.children) {
            if (child.userData.stalk) continue;
            child.position.y = -d * child.userData.baseY;
            if (child.userData.dome) child.rotation.x = d > 0 ? Math.PI : 0;
          }
          bendStalk(d);
          if (e.orient) e.orient(d);
        },
        afterSheet(tint) {
          if (e.afterSheet) e.afterSheet(tint);
          buildShuttles(); homeShuttles();
          for (const t of qTokens.concat(cTokens)) { Object.assign(t, t.to); seat(t.obj, t.x, t.y, t.z || 0); }
        },
        setCut(on) { if (e.setCut) e.setCut(on); },
        admits(t) { if (t.kind === 'H') return protonDir() === -pumpDir() && Math.sign(t.y) === pumpDir(); },
        /* ONE PROTON, ONE NOTCH: the rotor's angle and the ATP count come out
           of the same pass(). A proton down the uncoupler's hole turns nothing. */
        onConduct(t, dir) {
          if (t.kind !== 'H' || dir !== -pumpDir()) return;
          if (synthX != null && t.lane === synthX + LANE_DX) { protonsThroughSynthase++; if (ROT.pass(1)) { releaseATP(); if (hooks.onATP) hooks.onATP(); eng.emit('atp', ROT.atp); } }
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
          tickATP(dt); tickFuel(dt); tickWaiting(dt);
          if (e.post) e.post(dt);
          if (qTokens.length) tickShuttles(dt);
          tickE(dt);
        },
        set(next) {
          if (e.set && e.set(next)) eng.relayout();
        },
        state(base) { const s = baseState(base); return e.state ? Object.assign(s, e.state(base, s)) : s; },
        reset() {
          ROT.reset(); pumpedTotal = 0; protonsLeaked = 0; protonsThroughSynthase = 0;
          clearATP(); resetChain();
          if (e.reset) e.reset();
        },
        clear() { for (const k of ALL) RUN[k].cargo.length = 0; },
        lid: e.lid || (() => false),
        bandCap: e.bandCap || (() => Infinity),
        clearXs: e.clearXs || (() => []),
        api: Object.assign({ feed: e.feed }, e.api || {}),
        layers: e.layers || {},
        anchors: anchorsOf(),
        library: Object.assign({
          synthase: { text: 'ATP synthase', offset: [42, 30],
            card: 'A turbine, not a pump. Protons come back down the gradient through it and the rotor turns; every third of a turn makes one ATP. It cannot run uphill, so with no gradient it simply stops.' },
          leak: { text: 'an uncoupler', offset: [42, -30],
            card: 'A hole for protons. They come home without passing the synthase, so the gradient collapses and no ATP is made. The fuel still burns, and all of it comes out as heat.' },
          H:  { text: 'H⁺', card: 'A bare proton. It cannot cross the oil on its own, so every one of them goes through a protein, and which protein decides whether the energy becomes ATP.' },
        }, e.library || {}),
        applyContext,
        proteinKey: Object.assign({
          synthase: { name: 'ATP synthase', color: hex(RESP.synthase) },
          leak:     { name: 'uncoupler (a hole for H⁺)', color: hex(RESP.leak) },
        }, e.proteinKey || {}),
        carries: Object.assign({ synthase:['H'], leak:['H'] }, e.carries || {}),
      };
    }

    return {
      hooks, P, CHEM, RESP, HALF, line, ALL, ROW, hasChain, plugin,
      shapes: { solidPart, lathePart, knob, tagged, untag, buildToken, relabel, dropToken, fade, approach, follow, posOf, faceOf, midOf, hex },
      parts: { SYNTH, LEAK, CX, ROTOR, HEAD },
      geom: { F1_BASE, F1_H, F1_R, RING_R, LANE_DX, H_, xs, synthX: () => synthX },
      chips, pulse, waiting, leaving, carrierArrive, fuelSpend, clearFuel,
      atp: { ROT, launchNucleotide, chips: atpChips },
      electrons: { sendE, handOff, clearE, E_PER_TURN },
      shuttles: { qTokens, cTokens, qDock, qHome, cHome, cDock, protonateQ, ePill, counts: shuttleCounts, freeQ, reserveQ, releaseQ },
      doors: { pmfNow, backPressure, reMV, protonPool, get protonRef() { return protonRef; }, set protonRef(v) { protonRef = v; } },
      runner, donor, hub, terminal, runners, leadRunner, resetChain, feedAt, fuelRate,
      at, emit: eng.emit,
    };
  }

  /* ---- one box ----
     spec is { name, create, signals, api, build(P0), rebuilds(P0, next) }.
     `build` returns a handle for a layout Sheet.mount cannot draw (a stack
     of sims) or null; `rebuilds` says when a set() has to tear the box down
     for one, carrying listeners and the running state across. The context
     is the component's, not a parameter: one that arrives is dropped with a
     warning naming the component that draws it; so is `chain`, which the
     old component had and no page needs. */
  function mount(el, params, spec) {
    const P0 = Object.assign({}, params);
    const subs = [];
    let cur = null;
    const camFor = p => p.cam || { theta: 0, phi: Math.PI / 2 - 0.10, r: 380 };
    function build() {
      cur = (spec.build && spec.build(el, P0)) ||
        global.Sheet.mount(el, Object.assign({}, P0, { cam: camFor(P0) }), { name: spec.name, create: spec.create, signals: spec.signals, api: spec.api || ['feed'] });
      for (const s of subs) s.off = cur.on(s.ev, s.fn);
    }
    const dropContext = next => {
      if (next.context != null && next.context !== spec.context) console.warn(`${spec.name}: draws a ${spec.context}; context:'${next.context}' is ${spec.other || 'another component'}`);
      delete next.context;
      delete next.chain;   // the whole chain is always drawn
    };
    dropContext(P0);
    build();
    const handle = {
      get sim() { return cur.sim; }, get box() { return cur.box; }, get cell() { return cur.cell || null; },
      note: (n, o) => cur.note(n, o), notes: n => cur.notes(n), clearNotes: () => cur.clearNotes(),
      anchors: () => cur.anchors(), at: n => cur.at(n), layers: () => cur.layers(), palette: () => cur.palette(),
      show: (n, on) => { cur.show(n, on); return handle; },
      set(next) {
        next = Object.assign({}, next);
        dropContext(next);
        const rebuild = spec.rebuilds ? spec.rebuilds(P0, next) : false;
        Object.assign(P0, next);
        if (rebuild) {
          const running = cur.box.running;
          cur.destroy(); build();
          if (running) cur.start();
        } else cur.set(next);
        return handle;
      },
      state: () => cur.state(), signals: () => spec.signals,
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
     that file can produce, not what an organelle does. */
  const total = c => c ? (c.inside || 0) + (c.outside || 0) : 0;
  const sides = c => ({ inside: (c && c.inside) || 0, outside: (c && c.outside) || 0 });
  const SIGNALS = {
    protons: { label: 'H⁺', unit: 'protons', split: true, pick: s => sides(s.counts.H), domain: s => [0, total(s.counts.H)] },
    voltage: { label: 'Membrane voltage', unit: 'mV', pick: s => s.mV, domain: () => [-200, 200] },
    dpH:     { label: 'pH difference across the membrane', unit: 'pH', pick: s => s.dpH, domain: () => [0, 1.6] },
    pmf:     { label: 'Proton-motive force', unit: 'mV', pick: s => s.pmf, domain: () => [0, 250] },
    atp:     { label: 'ATP made', unit: 'molecules', cumulative: true, pick: s => s.atpMade, domain: () => [0, 10] },
  };
  /* Scale (kit/scale.js) for both components: the same angstrom sheet as
     Membrane, crossing things drawn exag times oversize against it. */
  const SCALE = () => ({
    rung: 'membrane', form: 'bulk',
    unit: 1e-10 / (global.MolLib && global.MolLib.SCALE || 1.9),
    exag: { crossing: 5.0 },
    down: {},
  });

  global.Circuit = { kit, mount, DEFAULTS, SIGNALS, SCALE };

})(typeof globalThis !== 'undefined' ? globalThis : this);
