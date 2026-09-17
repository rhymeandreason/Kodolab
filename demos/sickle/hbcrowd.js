/* =============================================================================
 *  sickle/hbcrowd.js — a crowd of haemoglobins, and what HbS does that HbA does not
 * =============================================================================
 *  Classic script after lib/scene.js, kit/surface.js, kit/card-stage.js and
 *  sickle/sickle-fibre.js. Exposes window.HbCrowd on the component contract.
 *
 *      const A = HbCrowd.mount(elL, { variant: 'HbA' });               // tumble
 *      const S = HbCrowd.mount(elR, { variant: 'HbS', stick: true });  // assemble
 *      S.intro(3.2);        // one molecule, then the crowd, as the camera widens
 *      S.play();            // switch the attraction on and let go
 *
 *  ONE QUESTION: why does the mutant molecule make a fibre and the normal one
 *  not. sickle-fibre.js draws the fibre as a finished object; this draws the
 *  MOMENT it forms, and it is a SIMULATION, not an animation. Nothing here
 *  knows how long assembly should take, which molecule goes next, or where the
 *  strand will end up. Two runs are not the same run.
 *
 *  ---- THE ONLY RULE ------------------------------------------------------------
 *
 *  Every molecule carries the same sticky patch and the same pocket for it, and
 *  every molecule attracts every other through them. When a pair drifts close
 *  enough, and lands near enough to the angle the crystal measured, it SNAPS to
 *  exactly that angle and the two become one body. That is the whole model.
 *  Chains, ends, growth from the middle, joins between chains that formed apart
 *  — none of it is coded. It falls out.
 *
 *  ONE BOND, NOT TWO. The double strand looks like two operations, a lateral
 *  pair and an axial repeat. It is one: `pair` applied twice IS the axial
 *  repeat, to half an ångström and 1.26° (the 2₁ screw the crystal is built
 *  on). So a molecule has exactly two sites, `pair` and its inverse, an
 *  assembly is a run of consecutive powers of it, and what a page calls
 *  repeat i is power 2i. check-fibre.js asserts the identity, because this
 *  whole component is built on it.
 *
 *  ---- WHY IT WAITS -------------------------------------------------------------
 *
 *  A bond can also BREAK, and how likely that is falls off sharply with how big
 *  the body holding it has got: a dimer is gone in a moment, a hexamer usually
 *  survives, past ten it effectively never lets go. So small aggregates form
 *  and die, over and over, until one gets over the hump — and then it only
 *  grows. That is nucleation, it is the reason deoxygenated HbS sits liquid for
 *  seconds before a fibre appears, and it is the reason a red cell usually
 *  clears the capillary before it stiffens.
 *
 *  IT IS ALSO WHY THE DELAY IS DIFFERENT EVERY TIME. Nothing schedules it.
 *  A page that needs to say something when assembly starts should listen for
 *  `nucleate`, not set a timer.
 *
 *  HbA RUNS THE SAME PHYSICS WITH THE ATTRACTION AT ZERO. That is the claim the
 *  lesson makes about the mutation, so it is the only difference in the code.
 *
 *  ---- MEASURED AND NOT --------------------------------------------------------
 *
 *    MEASURED   the tetramer (an SES over a deposited structure), and the bond:
 *               SickleFibre's `pair`, read from sickle/data/fibre.json, the
 *               same operation that component builds the whole fibre from. A
 *               snapped contact is the crystal's, exactly, not a spring at rest.
 *    NOT        the rates. Real haemoglobin at 5 mM reorients in nanoseconds
 *               and the real delay is seconds to minutes; this is a crowd at a
 *               walking pace so a reader can follow one molecule. The walk is
 *               Brownian in SHAPE — a persistent random walk with no net
 *               current — and state() reports no speed, because none of these
 *               numbers is one.
 *    NOT        the twist. These strands are straight. The 14-strand fibre's
 *               pitch is an EM result, not this crystal's, and a lesson about
 *               the first contact has no business showing it.
 *
 *  ---- PARAMS ------------------------------------------------------------------
 *
 *    variant  'HbA' | 'HbS'   which surface, and which colour the β6 mark takes
 *    n        a CAP on the crowd (rebuild, snaps). The room is sized to the
 *             frame and filled at a fixed density, so leaving this alone is
 *             normal; lowering it thins the crowd out for a bench
 *    grow     the chain length the FRAME is built to hold — it sets how much
 *             of the room the camera shows, and so how big a molecule looks.
 *             It is not an endpoint: `done` is when most of the crowd has
 *             bonded to something, and the simulation does not stop there
 *    stick    whether the attraction is on at all. play() turns it on
 *    opacity  0..1, the crowd's own fade — tweens through set()
 *    reveal   0..1, how much of the crowd is drawn, from the middle outward.
 *             The hidden ones are still simulated, so they arrive already
 *             jostling rather than in rows. `intro()` drives both
 *    drift    rms speed of a lone molecule's walk, scene units per second
 *    base     path prefix to demos/ from the page ('' at the top level)
 *
 *  `markOf(variant)` and `skinOf()` are what this crowd paints, exported so a
 *  page arriving from one molecule can land on the same two colours.
 *
 *  THE β6 MARK IS THE ONLY COLOUR THAT CHANGES BETWEEN VARIANTS. HbS paints it
 *  the fibre's patch orange (SickleFibre.COLOURS.patch); HbA paints it the
 *  site's charge blue, read from the `--cold` token so the caption that calls
 *  glutamate charged and the spot it names cannot drift. Both β chains carry
 *  the mark on both variants: in the crystal only one of the two is ever in a
 *  contact, but a free molecule has not chosen yet.
 *
 *  Anchors for note(): patch · chain. Events: nucleate · bond · done · load.
 * ========================================================================== */
(function (global) {
  'use strict';

  const MAX = 240;                    // molecules the instanced mesh can hold
  const RUN = 48;                     // longest run of bond powers a chain may reach
  const DEFAULTS = { variant: 'HbS', n: MAX, grow: 22, stick: false, drift: 22, base: '',
                     opacity: 1, reveal: 1 };

  /* ---- THE ROOM ------------------------------------------------------------
     A molecule must not cross the frame to reach a chain. So the room is sized
     to the FRAME, runs well past every edge of it — the crowd has no visible
     boundary, because cytoplasm has none — and is then filled at a fixed area
     fraction. `n` is a cap on the result, not a target.

     OVER IS NOT JUST MARGIN. The crowd off screen is what feeds the chains on
     it, and how fast anything nucleates is how often two molecules meet, which
     is the crowd's size. Shrinking the room to the frame makes the wait long
     and wildly variable without changing what a reader can see.

     It is a SLAB one molecule deep. Real cytoplasm is crowded in all three,
     and in all three you would see nothing: the chain would form behind a wall
     of haemoglobin. A monolayer is the compromise every textbook diagram of
     this makes silently, and the slab's walls are also what keeps a growing
     chain in the plane the reader is looking at. */
  const R_MOL = 37;                   // the tetramer's radius, near enough
  const PACK = 0.34;                  // of the slab's area the crowd covers
  const OVER = 2.0;                   // how far the room runs past the frame
  const SLAB = 30;                    // half-depth: about one molecule
  const ASPECT = 1.45;

  /* ---- THE WALK ------------------------------------------------------------
     Ornstein-Uhlenbeck: velocity dragged toward zero over TAU and kicked at
     random, so a body holds a heading for about its own length and then loses
     it. Kicks scale as 1/sqrt(mass), so a chain of ten wanders a third as fast
     as a monomer and turns much less — which is why a chain, once it exists,
     stays put and the crowd comes to it. A plain per-frame jitter is the other
     wrong answer: white noise, reads as a bad frame rate, frame-rate dependent
     besides. */
  const TAU = 0.55, RTAU = 0.9;
  /* Speed limits, and they are not a safety net — they are the overdamped
     water this all happens in. Without them the alignment torque wins its
     argument with the excluded volume by brute force: a molecule spun hard
     enough sweeps its subunits straight through a neighbour, because a
     positional force cannot answer a rotation inside one frame. Per body, so
     a long chain is held far stiller than a monomer, which is also true. */
  const V_MAX = 130, OM_MAX = 2.6;
  const STIFF = 24;                   // excluded volume, per angstrom of overlap
  const JUMP = 16;                    // the furthest a snap may move any one molecule

  /* ---- THE BOND ------------------------------------------------------------
     REACH is how far the patch pulls, and it is generous on purpose: the real
     interaction is contact-range, and a contact-range attraction in a crowd
     this slow would essentially never fire. What it must not do is reach past
     the neighbours, or molecules would fly to a chain across the room, so it
     is held under two diameters. SNAP_D / SNAP_C are how close a pair must
     come to the crystal's own pose before it is taken as made.

     A BIG BODY IS A BETTER TARGET, by GRIP per molecule it holds. Not a
     fudge to make the lesson finish: an end held rigid by ten neighbours does
     not wander off while a monomer is lining up on it, and the alignment two
     free molecules must both pay for, a monomer joining a chain pays once.
     It is why polymerisation is slow to start and then quick — the same
     asymmetry the breaking rate has, from the same cause. */
  const REACH = 150, PULL = 58, TWIST = 13, GRIP = 0.22;
  /* ---- HOW BIG A MOLECULE IS TO ANOTHER MOLECULE ---------------------------
     Not one sphere. A tetramer is four subunits and its own bond proves that:
     at the contact the crystal measured, the two β subunits sit 33 Å apart,
     closer than any single sphere that would also stop two molecules sliding
     through each other. So the excluded volume is FOUR spheres on the four
     subunit centroids, read off the surface bake at load, and SUB_R is what
     covers the skin without swallowing it.

     And it relaxes, but only for the one pair that is lining up on the bond,
     and only as they line up. That is what a binding interface IS: proteins
     interdigitate where they are complementary and nowhere else, so a pair in
     the right pose may come to the crystal's distance while the same pair
     turned any other way cannot. It is the lock and the key, and without it
     the attraction has to fight the repulsion through a wall it can never
     open — nothing assembles at all.

     WHAT RELAXES IS THE DISTANCE, NOT THE FORCE. Softening the force instead
     is what let a hard pull drag a pair clean through each other: a weak wall
     is still a wall you can be pushed past. So the wall stays as stiff as it
     ever was and only its floor moves, from two subunit radii down to the
     closest the crystal's own contact puts two subunits — which means an
     aligned pair can reach the bond and nothing, aligned or not, can go one
     ångström past it. */
  const SUB_R = 21;
  const SNAP_D = 26, SNAP_C = 0.86;   // ångströms, and cos of the angle error
  /* How readily a terminal bond lets go, per second, against the size of the
     body that holds it. A dimer is gone in well under a second; by eight the
     rate is a thousandth of that and the chain is committed. This curve IS the
     nucleation barrier, and the delay the page waits through is its shadow. */
  const KOFF = 0.5, KFALL = 0.85, NCAP = 12;
  const NUC = 6;                      // past here a body has effectively stopped coming apart
  /* WHEN THE BEAT IS OVER, and it is not "one chain reached a length". A
     sickling cell grows many fibres at once and no single one is the story;
     what a reader watches happen is the crowd turning into chains. So `done`
     is the fraction of the crowd that is bonded to something, which is also
     the only endpoint that arrives reliably — waiting on one body to reach a
     size can wait for ever while the molecules it needed join its neighbours. */
  const DONE_F = 0.68;
  const REBIND_S = 0.6;               // a molecule that let go does not re-bind at once

  const SURF = {
    HbA: 'hemoglobin/data/2HHB.card.surf.bin',
    HbS: 'sickle/data/2HBS-T1.surf.bin',
  };

  const tokenHex = (name, fallback) => {
    try {
      const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
      const m = /^#([0-9a-f]{6})$/i.exec(v);
      return m ? parseInt(m[1], 16) : fallback;
    } catch (e) { return fallback; }
  };
  /* The β6 mark's colour per variant, exported so a page marking the same
     residue on a Proteinbox paints it the same. */
  const markOf = v => (v === 'HbS'
    ? global.SickleFibre.COLOURS.patch
    : tokenHex('--cold', 0x2f6fb5));
  /* And the rest of the molecule, exported for the same reason: a page handing
     off to this crowd from one protein has to arrive at the colour the crowd
     is, or the cut shows however well the shapes match. */
  const skinOf = () => global.SickleFibre.COLOURS.skin;

  function create(THREE, root, camera, opts) {
    const F = global.SickleFibre;
    if (!F) throw new Error('hbcrowd.js: load sickle/sickle-fibre.js first');
    const P = Object.assign({}, DEFAULTS, opts);
    P.n = Math.max(2, Math.min(MAX, Math.round(P.n)));
    P.grow = Math.max(2, Math.min(RUN, Math.round(P.grow)));
    const listeners = {};
    const emit = (ev, a) => CardStage.fire(listeners[ev], [a], 'HbCrowd ' + ev);
    const tw = global.CardStage ? global.CardStage.tweens() : null;

    let D = null, S = null, mesh = null;
    let molR = 32, axial = 63;
    /* How far apart two molecules have to be before their subunits cannot
       possibly touch: a cheap reject before the sixteen sphere tests. And
       `contact`, the closest two subunits come in the crystal's own bond —
       the floor no pair may pass, read off the bond and the bake rather than
       chosen. */
    let excl = 92, contact = 33;
    let mols = [], cls = [];
    let running = false, done = false, nucleated = false, T = 0;
    let rng = seeded(11);
    const ROOM = { x: 0, y: 0, z: 0 };
    let R_FREE = 135, nWant = 0;

    /* Powers of the bond, -RUN..RUN, indexed by power + RUN. BUILT ONCE FROM
       THE MEASURED OPERATION AND NEVER FROM A PREVIOUS POWER'S RESULT: a chain
       of forty multiplications accumulates enough error to open the contact it
       is supposed to hold. */
    /* Identities until the file lands: create() spawns a crowd before load(),
       and a pose has to be computable for it. */
    let BOND = null, BONDI = null;
    let POW = Array.from({ length: 2 * RUN + 1 }, () => new THREE.Matrix4());

    function seeded(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }
    const gauss = () => (rng() + rng() + rng() - 1.5) * 2;

    function sizeRoom() {
      R_FREE = ((P.grow / 2 - 1) / 2) * axial + R_MOL * 1.6;
      ROOM.y = R_FREE * OVER;
      ROOM.x = ROOM.y * ASPECT;
      ROOM.z = SLAB;
      nWant = Math.min(MAX, P.n,
        Math.round(4 * ROOM.x * ROOM.y * PACK / (Math.PI * R_MOL * R_MOL)));
    }

    function buildBond() {
      BOND = new THREE.Matrix4().set(...F.Mat.fromRT(D.pair.R, D.pair.t));
      BONDI = BOND.clone().invert();
      POW = [];
      for (let k = -RUN; k <= RUN; k++) {
        const m = new THREE.Matrix4();
        const one = k < 0 ? BONDI : BOND;
        for (let i = 0; i < Math.abs(k); i++) m.multiply(one);
        POW.push(m);
      }
    }
    const powOf = k => POW[k + RUN];

    /* ---- bodies ------------------------------------------------------------
       A cluster is a rigid body holding a RUN OF CONSECUTIVE BOND POWERS. Its
       pose is the pose of power 0, and a member at power k sits at pose·BOND^k,
       recomputed from that every frame — so a hundred joins later the contacts
       are still the crystal's and not a hundred roundings of it. */

    const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
    const _m2 = new THREE.Matrix4(), _q2 = new THREE.Quaternion(), _v2 = new THREE.Vector3();
    const _s = new THREE.Vector3(1, 1, 1);
    const offV = new THREE.Vector3(), offM = new THREE.Matrix4();

    function newCluster(m, k) {
      const c = {
        pos: new THREE.Vector3(), q: new THREE.Quaternion(),
        vel: new THREE.Vector3(), om: new THREE.Vector3(),
        f: new THREE.Vector3(), t: new THREE.Vector3(),
        mem: [m], lo: k, hi: k, mat: new THREE.Matrix4(), n: 1,
      };
      m.cl = c; m.k = k;
      return c;
    }
    const massOf = c => c.n;
    const inertiaOf = c => c.n * (molR * molR) * (1 + c.n * c.n * 0.08);

    function clusterMat(c) { return c.mat.compose(c.pos, c.q, _s); }
    /* World matrix of one member, into `out`. */
    function poseOf(m, out) { return out.multiplyMatrices(m.cl.mat, powOf(m.k)); }

    function refreshPoses() {
      for (const c of cls) {
        clusterMat(c);
        for (const m of c.mem) {
          poseOf(m, _m);
          m.pos.setFromMatrixPosition(_m);
          for (let i = 0; i < m.sub.length; i++) m.sub[i].copy(SUB[i]).applyMatrix4(_m);
        }
      }
    }

    /* ---- spawn -------------------------------------------------------------- */

    function spawn() {
      /* A FRESH SEED EVERY TIME. Replay is not meant to reproduce the last
         run: the delay before anything holds is the reader's evidence that
         nothing here is on rails, and it only reads that way if it differs. */
      rng = seeded(Math.floor(Math.random() * 4294967295));
      sizeRoom();
      mols = []; cls = [];
      const N = nWant;
      /* A jittered grid, so nothing starts inside anything. It is a lattice,
         and warm() walks it apart before the first frame is drawn. */
      const cols = Math.ceil(Math.sqrt(N * ROOM.x / ROOM.y)), rows = Math.ceil(N / cols);
      const jx = ROOM.x / cols * 0.55, jy = ROOM.y / rows * 0.55;
      for (let i = 0; i < N; i++) {
        const cx = (i % cols + 0.5) / cols * 2 - 1, cy = (Math.floor(i / cols) + 0.5) / rows * 2 - 1;
        const axis = new THREE.Vector3(rng() - .5, rng() - .5, rng() - .5).normalize();
        const m = { id: i, pos: new THREE.Vector3(), sub: SUB.map(() => new THREE.Vector3()),
                    cl: null, k: 0, ph: rng() * 6.283, free: 0 };
        mols.push(m);
        const c = newCluster(m, 0);
        c.pos.set(cx * ROOM.x + (rng() - .5) * jx,
                  cy * ROOM.y + (rng() - .5) * jy,
                  (rng() - .5) * ROOM.z);
        c.q.setFromAxisAngle(axis, rng() * 6.283);
        c.vel.set(gauss(), gauss(), gauss() * 0.45).multiplyScalar(P.drift / Math.sqrt(3));
        cls.push(c);
      }
      refreshPoses();
    }

    /* THE CROWD IS ORDERED FROM THE MIDDLE OUTWARD, and `reveal` then draws a
       prefix of it. So a page can open on one molecule and let the rest arrive
       as the camera pulls back, which is the only way to show that the whole
       argument is a small difference multiplied by a large number: state the
       difference on one, then widen until the reader can count. */
    function order() {
      mols.sort((a, b) => a.pos.lengthSq() - b.pos.lengthSq());
      for (let i = 0; i < mols.length; i++) mols[i].id = i;
    }

    /* A lattice is never seen: walking the crowd forward a couple of seconds
       before the first frame costs one hitch at entry and buys a crowd that
       was never in rows. Attraction is off here whatever `stick` says — this
       is the room settling, not the beat starting. */
    function warm() {
      const was = running; running = false;
      for (let i = 0; i < 90; i++) step(1 / 30);
      running = was;
      order();
    }

    /* ---- forces ------------------------------------------------------------- */

    /* Force at a point on a body: straight to the centre of mass, and the
       moment about it. Without the moment a chain could not turn to meet
       anything, and would never flatten into the slab. */
    function push(c, at, f) {
      c.f.add(f);
      _v2.subVectors(at, c.pos).cross(f);
      c.t.add(_v2);
    }

    const _f = new THREE.Vector3(), _fn = new THREE.Vector3(), _d = new THREE.Vector3();
    function walls(c) {
      for (const m of c.mem) {
        for (const ax of ['x', 'y', 'z']) {
          const over = Math.abs(m.pos[ax]) - ROOM[ax];
          if (over <= 0) continue;
          _f.set(0, 0, 0);
          _f[ax] = -Math.sign(m.pos[ax]) * (25 + over * 6) * massOf(c) / c.n;
          push(c, m.pos, _f);
        }
      }
    }

    /* Excluded volume, subunit against subunit, between molecules of DIFFERENT
       bodies only: two molecules of one chain are at the crystal's spacing and
       overlap there by design, which is what a contact is. `open` is how far
       this particular pair has already got toward the bonded pose, and it is
       the only thing that lets them close the last of the distance. */
    function crowding(a, b, open) {
      if (!a.sub.length || a.pos.distanceToSquared(b.pos) > excl * excl) return;
      const min = SUB_R * 2 + (contact - SUB_R * 2) * open, min2 = min * min;
      for (const p of a.sub) for (const q of b.sub) {
        _d.subVectors(p, q);
        const d2 = _d.lengthSq();
        if (d2 <= 0 || d2 >= min2) continue;
        const d = Math.sqrt(d2);
        _f.copy(_d).multiplyScalar((min - d) * STIFF / d);
        push(a.cl, p, _f);
        push(b.cl, q, _fn.copy(_f).negate());
      }
    }

    /* ---- the attraction, and the snap ----------------------------------------
       `a` is the top end of its body, `b` the bottom end of another. If b were
       bonded to a it would sit at pose(a)·BOND, so that is the pose the patch
       pulls b toward — a force on the offset between them and a torque on the
       angle. Nothing is scheduled and nothing is chosen: every eligible pair in
       reach pulls, every frame, and whichever gets there first is the one that
       bonds. */
    const _ta = new THREE.Matrix4(), _tp = new THREE.Vector3(), _tq = new THREE.Quaternion();
    const _bp = new THREE.Vector3(), _bq = new THREE.Quaternion(), _e = new THREE.Quaternion();
    /* Returns 0..1: how far this ordered pair has got toward the bonded pose,
       which is also how far the steric wall between them is allowed to open. */
    function attract(a, b) {
      if (a.cl === b.cl || T < a.free || T < b.free) return 0;
      if (a.k !== a.cl.hi || b.k !== b.cl.lo) return 0;
      if (a.cl.n + b.cl.n > RUN) return 0;
      _ta.multiplyMatrices(poseOf(a, _m), BOND);
      _ta.decompose(_tp, _tq, _v2);
      poseOf(b, _m2).decompose(_bp, _bq, _v2);
      const dist = _tp.distanceTo(_bp);
      if (dist > REACH) return 0;
      const cos = Math.abs(_tq.dot(_bq));

      if (dist < SNAP_D && cos > SNAP_C) { join(a, b); return 1; }

      /* Falls off to nothing at REACH, so a molecule at the edge of range is
         nudged and one at contact is hauled in; and it is stronger the bigger
         the two bodies already are. */
      const w = (1 - dist / REACH)
        * (1 + GRIP * Math.min(a.cl.n + b.cl.n - 2, 12));
      _f.subVectors(_tp, _bp).multiplyScalar(PULL * w / Math.max(dist, 1));
      push(b.cl, _bp, _f);
      push(a.cl, a.pos, _fn.copy(_f).negate());

      /* The angle, as the rotation that takes b's pose onto the bond's. Its
         vector part IS the world axis, scaled by the sine of the half angle —
         turning it by b's own orientation first is the mistake that leaves
         the torque pointing somewhere no molecule needs to go, and the crowd
         then never lines anything up. The sign flip picks the shorter way
         round of the two the quaternions offer, which is the one a molecule
         would actually turn. */
      _e.copy(_bq).invert().premultiply(_tq);
      if (_e.w < 0) { _e.x = -_e.x; _e.y = -_e.y; _e.z = -_e.z; _e.w = -_e.w; }
      /* The turn is NOT boosted by how big the bodies are the way the pull is.
         A pull that scales is a bigger target; a torque that scales is a
         molecule flung round its own axis. */
      _v2.set(_e.x, _e.y, _e.z).multiplyScalar(TWIST * (1 - dist / REACH) * molR * molR);
      b.cl.t.add(_v2);
      a.cl.t.sub(_v2);

      /* The wall opens on BOTH counts or neither: a pair at the right distance
         in the wrong orientation is two molecules about to collide. And it
         opens FULLY once they are merely close and merely lined up, rather
         than only at the exact pose — a floor that is only reached in the
         limit is a floor that is never reached, and the pair stands off at
         arm's length for ever, which is what a crowd that will not assemble
         looks like. */
      const smooth = u => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
      return smooth((cos - 0.55) / 0.15) * smooth((REACH * 0.7 - dist) / (REACH * 0.2));
    }

    /* Two bodies become one. b's body is moved bodily onto the pose the bond
       demands — the crystal's, to the last decimal — and re-indexed into a's
       run of powers. Momentum is carried across so a join does not inject a
       kick the crowd did not have. */
    const _jm = new THREE.Matrix4(), _jp = new THREE.Vector3(), _jq = new THREE.Quaternion();
    const _ap = new THREE.Vector3(), _aq = new THREE.Quaternion(), _dp = new THREE.Vector3();
    function join(a, b) {
      const A = a.cl, B = b.cl;
      /* B's powers slide by this to land in A's run, and b's own becomes
         a.k + 1 — the seat the bond puts it in. */
      const shift = (a.k + 1) - b.k;
      if (Math.min(A.lo, B.lo + shift) < -RUN + 2) return;
      if (Math.max(A.hi, B.hi + shift) > RUN - 2) return;

      /* ONE BODY HAS ONE POSE, AND IT IS A'S. Everything B holds is expressed
         in A's run of powers from here on, so the merged pose must be the one
         A's own members are already sitting at. Deriving it from where B has
         to end up instead shifts every molecule ALREADY IN THE CHAIN by
         `shift` powers of the bond — the chain teleports, whole, and it is the
         other molecule that looked stationary.

         BOTH MEET, in inverse proportion to size, the way two bodies do. A
         monomer joining a chain of ten does almost all of the moving; two
         chains of five split it. Only A's pose is stored: once it is placed,
         B follows from the powers exactly, so the contact is still the
         crystal's to the last decimal. */
      const fA = B.n / (A.n + B.n);
      _jm.multiplyMatrices(poseOf(b, _m), BONDI).multiply(powOf(-a.k));
      _jm.decompose(_jp, _jq, _v2);
      _ap.lerpVectors(A.pos, _jp, fA);
      _aq.copy(A.q).slerp(_jq, fA);
      _jm.compose(_ap, _aq, _s);

      /* AND NOBODY TRAVELS FAR. A snap is a discontinuity, and the contacting
         molecules being close is no promise the rest are: a chain is a lever,
         and a couple of degrees at the joint is a hundred ångströms at the far
         end. So the test is the largest jump any molecule would make, and a
         join that would fling one is simply not made — the pair stays in reach
         and keeps lining up. Tighter than about a molecule's radius and the
         crowd stops assembling: every bond is a small discontinuity, and
         forbidding those forbids the bond. */
      if (leap(A, _jm, 0) > JUMP || leap(B, _jm, shift) > JUMP) return;
      if (B.n > 1 && !clear(A, B, _jm, shift)) return;

      const mA = A.n, mB = B.n;
      A.vel.multiplyScalar(mA).addScaledVector(B.vel, mB).multiplyScalar(1 / (mA + mB));
      A.om.multiplyScalar(mA).addScaledVector(B.om, mB).multiplyScalar(1 / (mA + mB));
      if (subject === B) subject = A;
      for (const m of B.mem) { m.k += shift; m.cl = A; A.mem.push(m); }
      A.lo = Math.min(A.lo, B.lo + shift);
      A.hi = Math.max(A.hi, B.hi + shift);
      A.n = A.mem.length;
      A.pos.copy(_ap); A.q.copy(_aq);
      cls.splice(cls.indexOf(B), 1);
      rebase(A);
      clusterMat(A);
      for (const m of A.mem) {
        poseOf(m, _m);
        m.pos.setFromMatrixPosition(_m);
        for (let i = 0; i < m.sub.length; i++) m.sub[i].copy(SUB[i]).applyMatrix4(_m);
      }
      emit('bond', biggest());
      if (!nucleated && A.n >= NUC) { nucleated = true; emit('nucleate', state()); }
      if (!done && bondedCount() >= mols.length * DONE_F) { done = true; emit('done', state()); }
    }

    /* The furthest any of a body's molecules would move, if the merged body
       took pose `at` and its powers slid by `shift`. */
    function leap(c, at, shift) {
      let far = 0;
      for (const m of c.mem) {
        _dp.setFromMatrixPosition(_cm.multiplyMatrices(at, powOf(m.k + shift)));
        far = Math.max(far, _dp.distanceTo(m.pos));
      }
      return far;
    }

    /* WOULD B FIT THERE. A join moves a whole body at once, and a chain of
       eight swung onto a new end lands wherever the arithmetic puts it —
       through anything standing in the way, because the two are one body by
       then and a body does not collide with itself. The molecules that made
       the bond are always clear; the far end of a long chain is not, and that
       is where two chains ended up inside each other. So the destination is
       tested before it is taken, and a join that would not fit simply does not
       happen this frame. The pair is still in reach and will try again. */
    const _cp = new THREE.Vector3(), _cq = new THREE.Vector3(), _cm = new THREE.Matrix4();
    function clear(A, B, at, shift) {
      /* Below the crystal's own contact, or this refuses the arrangement the
         crystal is made of. */
      const min = contact * 0.8, min2 = min * min;
      for (const m of B.mem) {
        _cm.multiplyMatrices(at, powOf(m.k + shift));
        _cp.setFromMatrixPosition(_cm);
        for (const o of neighbours(_cp, _near2)) {
          if (o.cl === A || o.cl === B) continue;
          if (_cp.distanceToSquared(o.pos) > excl * excl) continue;
          for (const sv of SUB) {
            _cq.copy(sv).applyMatrix4(_cm);
            for (const q of o.sub) if (_cq.distanceToSquared(q) < min2) return false;
          }
        }
      }
      return true;
    }

    /* Keep a body's powers centred on zero, so a chain that grew off one end
       for long enough cannot walk off the end of the table. Pure bookkeeping:
       every member's world pose is unchanged. */
    function rebase(c) {
      const sh = -((c.lo + c.hi) >> 1);
      if (!sh) return;
      clusterMat(c);
      _m2.multiplyMatrices(c.mat, powOf(-sh));
      _m2.decompose(c.pos, c.q, _v2);
      for (const m of c.mem) m.k += sh;
      c.lo += sh; c.hi += sh;
    }

    /* ---- and what comes apart ------------------------------------------------
       Only a terminal bond, because only a terminal bond is exposed, and only
       at a rate that collapses as the body grows. Everything the page calls
       nucleation is this one number. */
    function shed(dt) {
      for (let i = cls.length - 1; i >= 0; i--) {
        const c = cls[i];
        if (c.n < 2) continue;
        const koff = KOFF * Math.exp(-KFALL * Math.min(c.n - 2, NCAP));
        for (let e = 0; e < 2; e++) {
          if (c.n < 2 || rng() > koff * dt) continue;
          const end = e ? c.lo : c.hi;      // read fresh: the first may have gone
          const m = c.mem.find(x => x.k === end);
          if (!m) continue;
          poseOf(m, _m).decompose(_tp, _tq, _v2);
          c.mem.splice(c.mem.indexOf(m), 1);
          c.n = c.mem.length;
          c.lo = Math.min(...c.mem.map(x => x.k));
          c.hi = Math.max(...c.mem.map(x => x.k));
          const nc = newCluster(m, 0);
          nc.pos.copy(_tp); nc.q.copy(_tq);
          nc.vel.copy(c.vel);
          m.free = T + REBIND_S;
          cls.push(nc);
        }
      }
    }

    /* ---- the frame ---------------------------------------------------------- */

    /* One hash grid over molecule centres, walked once. Everything short-range
       comes out of the same neighbour list: excluded volume, and every pair of
       ends close enough for the patch to matter. */
    const GRID = new Map();
    const key = (x, y, z) => (x * 73856093 ^ y * 19349663 ^ z * 83492791);
    function bucket() {
      GRID.clear();
      const c = REACH;
      for (const m of mols) {
        const k = key(Math.floor(m.pos.x / c), Math.floor(m.pos.y / c), Math.floor(m.pos.z / c));
        const a = GRID.get(k);
        if (a) a.push(m); else GRID.set(k, [m]);
      }
    }
    /* TWO BUFFERS, NOT ONE. The pair loop is iterating one neighbour list when
       a join asks for another, and a single shared array would be emptied
       under the loop that is walking it. */
    const _near = [], _near2 = [];
    function neighbours(at, out = _near) {
      out.length = 0;
      const c = REACH;
      const p = at.pos || at;
      const gx = Math.floor(p.x / c), gy = Math.floor(p.y / c), gz = Math.floor(p.z / c);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (let k = -1; k <= 1; k++) {
        const a = GRID.get(key(gx + i, gy + j, gz + k));
        if (a) for (const o of a) out.push(o);
      }
      return out;
    }

    const _kick = new THREE.Vector3();
    function step(dt) {
      if (tw) tw.update(dt);
      T += dt;
      for (const c of cls) { c.f.set(0, 0, 0); c.t.set(0, 0, 0); walls(c); }

      bucket();
      for (const a of mols) {
        for (const b of neighbours(a)) {
          /* Each unordered pair is met twice, once from each side. For the
             attraction those are DIFFERENT TESTS — a's top against b's bottom
             is not b's top against a's bottom — and both are wanted; for the
             steric wall the second visit is the same wall seen again, so it is
             applied once, by whichever of the two is met first. */
          if (b.id <= a.id || a.cl === b.cl) continue;
          let open = 0;
          if (running) {
            open = attract(a, b);
            if (a.cl === b.cl) continue;      // that one joined them
            open = Math.max(open, attract(b, a));
            if (a.cl === b.cl) continue;
          }
          crowding(a, b, open);
        }
      }
      if (running) shed(dt);

      /* Integrate each body: forces, then the walk on top, then move. The
         kicks scale with size, which is the whole reason a chain sits still
         while the crowd churns around it. */
      const kv = P.drift / Math.sqrt(3) / Math.sqrt(TAU / 2);
      for (const c of cls) {
        const mass = massOf(c), inr = inertiaOf(c), scale = 1 / Math.sqrt(c.n);
        c.vel.addScaledVector(c.f, dt / mass);
        c.vel.multiplyScalar(Math.max(0, 1 - dt / TAU));
        const kick = kv * scale * Math.sqrt(dt);
        _kick.set(gauss() * kick, gauss() * kick, gauss() * kick * 0.45);
        c.vel.add(_kick);

        c.om.addScaledVector(c.t, dt / inr);
        c.om.multiplyScalar(Math.max(0, 1 - dt / RTAU));
        const rk = 0.9 * scale / c.n * Math.sqrt(dt);
        c.om.x += gauss() * rk; c.om.y += gauss() * rk; c.om.z += gauss() * rk;

        if (c.vel.lengthSq() > (V_MAX * scale) ** 2) c.vel.setLength(V_MAX * scale);
        if (c.om.lengthSq() > (OM_MAX * scale) ** 2) c.om.setLength(OM_MAX * scale);

        c.pos.addScaledVector(c.vel, dt);
        const w = c.om.length();
        if (w > 1e-7) {
          _q.setFromAxisAngle(_v2.copy(c.om).multiplyScalar(1 / w), w * dt);
          c.q.premultiply(_q).normalize();
        }
      }
      refreshPoses();
      upload();
    }

    /* ---- draw --------------------------------------------------------------- */

    /* ONE INSTANCE PER MOLECULE, IN THE ORDER THE CROWD WAS SPAWNED, which
       never changes. Walking the bodies instead would reorder every instance
       the moment two of them merged — harmless to look at, and quietly fatal
       to anything comparing frames. */
    function upload() {
      if (!mesh) return;
      const shown = Math.max(1, Math.round(P.reveal * mols.length));
      for (let i = 0; i < shown; i++) {
        const m = mols[i];
        poseOf(m, _m);
        /* A lone molecule breathes; a bonded one is held, and the wobble is
           what says which is which without a colour or a label. */
        if (m.cl.n === 1) {
          _q2.setFromAxisAngle(_v2.set(0.6, 0.5, 0.6).normalize(), 0.02 * Math.sin(T * 2.1 + m.ph));
          _m2.compose(_v.set(0, 0, 0), _q2, _s);
          _m.multiply(_m2);
        }
        mesh.setMatrixAt(i, _m.multiply(offM));
      }
      mesh.count = shown;
      mesh.instanceMatrix.needsUpdate = true;
      /* depthWrite stays on through the fade: these are solid bodies arriving,
         not glass, and turning it off lets a molecule's own far side show
         through its near one. */
      mesh.material.transparent = P.opacity < 1;
      mesh.material.opacity = P.opacity;
    }

    /* ---- the surface -------------------------------------------------------- */

    function paint() {
      if (!S) return;
      const betaSix = new Set(['B:6', 'D:6']);
      const mark = new THREE.Color(markOf(P.variant));
      const skin = new THREE.Color(F.COLOURS.skin);
      const col = global.SurfLib.colors(S, (chain, num) =>
        betaSix.has(chain + ':' + num) ? [mark.r, mark.g, mark.b] : null,
        [skin.r, skin.g, skin.b]);
      S.geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    }

    function install(surf) {
      if (mesh) { root.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); }
      S = surf;
      /* The HbA card bake is centred on its trace; only the HbS bake shares the
         fibre's frame, and only the HbS bake needs to (the bond is in it). */
      S.geo.computeBoundingSphere();
      molR = S.geo.boundingSphere.radius;
      subOf(S);
      if (P.variant === 'HbS') offV.set(0, 0, 0); else offV.copy(S.geo.boundingSphere.center).negate();
      offM.makeTranslation(offV.x, offV.y, offV.z);
      paint();
      const mat = global.Stage.bondMat(0xffffff);
      mat.vertexColors = true;
      mat.transparent = P.opacity < 1;
      mat.opacity = P.opacity;
      mesh = new THREE.InstancedMesh(S.geo, mat, MAX);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      root.add(mesh);
      upload();
    }

    /* The four subunit centroids, in the body's own frame, averaged over the
       surface's own vertices — so the shape the physics uses is the shape on
       screen and not a guess about it. */
    let SUB = [];
    function subOf(surf) {
      const pos = surf.geo.attributes.position;
      const acc = new Map();
      for (let v = 0; v < surf.nVert; v++) {
        const ch = global.SurfLib.chainOf(surf, v);
        let a = acc.get(ch);
        if (!a) acc.set(ch, a = [0, 0, 0, 0]);
        a[0] += pos.getX(v); a[1] += pos.getY(v); a[2] += pos.getZ(v); a[3]++;
      }
      SUB = [];
      for (const a of acc.values()) SUB.push(new THREE.Vector3(a[0] / a[3], a[1] / a[3], a[2] / a[3]).add(offV));
      for (const m of mols) m.sub = SUB.map(() => new THREE.Vector3());
    }

    /* ---- drive -------------------------------------------------------------- */

    /* THE SUBJECT IS ONE BODY AND IT STAYS THE SUBJECT. There are half a dozen
       chains growing at once, they overtake each other constantly, and a camera
       that framed whichever was biggest this frame would hop between them —
       which is most of what read as jitter. So it is chosen once, kept while it
       lives, followed into whatever absorbs it, and given up only for something
       half again its size. */
    let subject = null;
    function subjectCl() {
      if (subject && cls.indexOf(subject) < 0) subject = null;   // it was absorbed
      let best = null;
      for (const c of cls) if (!best || c.n > best.n) best = c;
      if (!best) return null;
      if (!subject || best.n > subject.n * 1.5) subject = best;
      return subject;
    }
    const biggestCl = () => cls.reduce((a, c) => (c.n > a.n ? c : a), cls[0] || { n: 0 });
    const biggest = () => biggestCl().n;
    const bondedCount = () => cls.reduce((k, c) => k + (c.n > 1 ? c.n : 0), 0);

    function play() {
      if (!P.stick || !D) return api;
      running = true;
      return api;
    }
    function reset() {
      running = false; done = false; nucleated = false; T = 0; subject = null;
      if (tw) tw.cancel();
      /* A reset shows the crowd. A page that wants the way in asks for it
         after, and intro() takes both of these back to nothing. */
      P.opacity = 1; P.reveal = 1;
      spawn(); warm(); upload();
      emit('bond', 1);
      return api;
    }

    /* ---- what the camera should hold ------------------------------------------
       The biggest body once there is one worth looking at, the middle of the
       room before that — and a radius that is the FINISHED chain's from the
       first frame, so the view does not move while the thing that should be
       moving is the assembly. */
    function focus() {
      const out = { centre: new THREE.Vector3(), radius: R_FREE };
      const c = subjectCl();
      if (!c || c.n < 3) return out;
      for (const m of c.mem) out.centre.add(m.pos);
      out.centre.multiplyScalar(1 / c.n);
      let r = 0;
      for (const m of c.mem) r = Math.max(r, out.centre.distanceTo(m.pos));
      out.radius = Math.max(r + molR * 1.2, R_FREE);
      return out;
    }

    /* ---- set / state -------------------------------------------------------- */

    function set(nextP, o) {
      if (!nextP) return api;
      const snap = (o && o.snap) || !tw;
      const secs = (o && o.seconds) || 1;
      for (const key of ['opacity', 'reveal']) {
        if (nextP[key] === undefined) continue;
        const to = Math.max(0, Math.min(1, nextP[key]));
        if (snap) { P[key] = to; upload(); }
        else tw.to(P[key], to, secs, v => { P[key] = v; upload(); }, { key, ease: 'smooth' });
      }
      if (nextP.drift !== undefined) P.drift = nextP.drift;
      if (nextP.stick !== undefined) { P.stick = !!nextP.stick; if (!P.stick) running = false; }
      if (nextP.grow !== undefined) P.grow = Math.max(2, Math.min(RUN, Math.round(nextP.grow)));
      if (nextP.n !== undefined && Math.round(nextP.n) !== P.n) {
        P.n = Math.max(2, Math.min(MAX, Math.round(nextP.n)));
        reset();
      }
      if (nextP.variant && nextP.variant !== P.variant && SURF[nextP.variant]) {
        P.variant = nextP.variant;
        reset();
        loadSurface();
      }
      return api;
    }

    function state() {
      const big = biggest();
      /* Two molecules to a repeat: powers of the bond alternate between the
         two sides of the double strand, so a body of `big` spans big/2 of the
         axial repeat the crystal measured. */
      const repeats = Math.ceil(big / 2);
      const bonded = bondedCount();
      let bodies = 0;
      for (const c of cls) if (c.n > 1) bodies++;
      return {
        variant: P.variant, n: mols.length, grow: P.grow,
        biggest: big, bonded, bodies, free: mols.length - bonded,
        stick: P.stick, running, done, nucleated,
        phase: !running ? (done ? 'done' : 'idle') : nucleated ? 'growing' : 'lag',
        repeats, lengthA: axial * repeats, lengthNm: axial * repeats / 10,
        measured: { source: 'fibre.json (2HBS)', axialA: axial, bond: 'pair' },
      };
    }

    /* ---- anchors ------------------------------------------------------------- */

    const _a = new THREE.Vector3();
    const anchors = {
      patch: () => {
        const c = biggestCl();
        const m = (c && c.n > 1 ? c.mem[0] : mols[0]);
        if (!m || !D) return null;
        const mk = D.marks.find(x => x.donates) || D.marks[0];
        return _a.fromArray(mk.beta6).applyMatrix4(poseOf(m, _m));
      },
      chain: () => (biggest() > 2 ? focus().centre : null),
    };
    const library = {
      patch: { text: 'β6', card: P.variant === 'HbS'
        ? 'The greasy spot. One valine where normal hemoglobin has a charged glutamate.'
        : 'A charged glutamate. It sits happily in water, and nothing sticks to it.' },
      chain: { text: 'the chain', card: 'Every molecule holds the next by the same contact. Straight here; in the cell, seven of these twist into a fibre.' },
    };

    /* ---- load ---------------------------------------------------------------- */

    function loadSurface() {
      return fetch(P.base + SURF[P.variant]).then(r => {
        if (!r.ok) throw new Error(SURF[P.variant] + ' — HTTP ' + r.status);
        return r.arrayBuffer();
      }).then(buf => { install(global.SurfLib.decode(THREE, buf)); emit('load', state()); });
    }
    function load() {
      return fetch(P.base + 'sickle/data/fibre.json').then(r => {
        if (!r.ok) throw new Error('sickle/data/fibre.json — HTTP ' + r.status);
        return r.json();
      }).then(json => {
        D = json;
        axial = F.axialLenOf(D);
        buildBond();
      excl = 2 * (20.5 + SUB_R);   // farthest subunit out, twice over
        /* The frame, and so the room and the crowd in it, is the bond's own
           business — and the bond arrives with the file. */
        sizeRoom(); spawn(); warm();
        return loadSurface();
      }).then(() => api);
    }

    spawn();

    const api = {
      step, state, set, play, reset, focus, load, anchors, library, params: P,
      /* The molecule `reveal` shows first, so a page opening on one can put
         the camera on that one rather than near it. */
      first: () => (mols[0] ? mols[0].pos : null),
      get molR() { return molR; },
      on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn);
        return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); }; },
      dispose() { if (mesh) { root.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose(); } },
    };
    return api;
  }

  /* ---- mount ------------------------------------------------------------------- */

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('hbcrowd.js: load kit/card-stage.js first');
    if (!global.SurfLib) throw new Error('hbcrowd.js: load kit/surface.js first');
    let sim = null, nb = null;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'HbCrowd ' + ev);

    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0.3, phi: 1.35, r: 520 },
      stage: Object.assign({ rMin: 90, rMax: 8000 }, params.stage || {}),
      step: dt => { if (sim) { sim.step(dt); camTw.update(dt); emit('frame', api.state(), dt); } },
      afterFrame: () => { if (nb) nb.step(); },
      onResize: () => frame(0, true),
      viewOffset: params.viewOffset,
    });
    box.camera.far = 40000;
    box.camera.updateProjectionMatrix();

    sim = create(THREE, box.root, box.camera, params);
    const camTw = global.CardStage.tweens();

    /* Fit the focus sphere in the room the panel leaves — sickle-fibre.js's
       rule, and the same arithmetic.

       IT ONLY EVER PULLS BACK, and mostly it does not move at all: the radius
       is the finished chain's from the first frame, and `held` is the widest
       it has had to be. An assembly that wanders is followed, not chased. A
       RESIZE CLEARS THE HOLD — the pane changing shape is not the chain
       growing, and a hold latched to the box's first, pre-layout size is how
       two halves of a split end up at different zooms. */
    const tgtFrom = new THREE.Vector3(), tgtTo = new THREE.Vector3();
    let held = 0;
    /* What camera distance holds a sphere of `radius` in the room the panel
       leaves. Shared by the fit and by the intro, so the close-up the intro
       opens on is framed by the same arithmetic as everything after it. */
    function fitR(radius) {
      const cam = box.camera;
      const half = THREE.MathUtils.degToRad(cam.fov) / 2;
      const W = box.canvas.clientWidth || 1, H = box.canvas.clientHeight || 1;
      const fn = params.viewOffset || el.viewOffset;
      const off = fn ? fn(W, H) : null;
      const fx = off ? Math.max(0.25, (W - Math.abs(off.x || 0) * 2) / W) : 1;
      const fy = off ? Math.max(0.25, (H - Math.abs(off.y || 0) * 2) / H) : 1;
      const av = Math.atan(Math.tan(half) * fy);
      const ah = Math.atan(Math.tan(half) * Math.max(cam.aspect, 0.1) * fx);
      const fit = a => radius / Math.max(Math.sin(a), 0.05);
      return Math.max(fit(av), fit(ah)) * 1.08;
    }

    function frame(dur = 0.9, relax) {
      /* CardStage.create lays out once, synchronously, before `sim` exists. */
      if (!sim) return;
      const f = sim.focus();
      const cam = box.camera;
      let r = fitR(f.radius);
      if (relax) held = 0;
      if (r < held * 1.06) {
        /* A body this size drifts a few ångströms a second and never stops.
           Following that is jitter, not tracking: below a molecule's own width
           the camera should simply not move. */
        if (box.cam.target.distanceTo(f.centre) < sim.molR * 1.6) return;
        r = box.cam.r;
      }
      held = Math.max(held, r);
      tgtFrom.copy(box.cam.target); tgtTo.copy(f.centre);
      const r0 = box.cam.r;
      camTw.to(0, 1, dur, u => {
        box.cam.r = r0 + (r - r0) * u;
        box.cam.target.lerpVectors(tgtFrom, tgtTo, u);
        box.applyCam();
        if (!box.running) box.draw();
      }, { key: 'fit', ease: 'smooth' });
    }
    /* Bonds land in bursts once a chain gets going, and refitting on each one
       is a camera being dragged. One move at a time, slow, and never more than
       one in flight: the deadband in frame() throws most of these away. */
    let last = -9;
    sim.on('bond', n => {
      if (n < 3 || performance.now() / 1000 - last < 2.2) return;
      last = performance.now() / 1000;
      frame(2.6);
    });
    /* ---- the way in ---------------------------------------------------------
       The beat before this one ends on ONE molecule as a bare opaque skin,
       filling the frame. So this one opens on exactly that — one molecule, the
       same size, no fade — and widens until the crowd it was always in is
       visible. Crossing on a shape that does not change is the whole point;
       fading in here as well would put a dissolve between two identical
       frames. The molecules are already there and already moving the whole
       time; what changes is how much of the room the camera admits to.

       The argument the lesson is making is arithmetic: one patch is nothing,
       and a hundred thousand of them is a cell that cannot get through a
       capillary. A cut from a close-up to a wide shot asserts that. Widening
       through it lets the reader watch it happen. */
    /* IT WAITS FOR THE FILES. A step that swaps scenes mounts this one and
       drives it in the same breath, and load() is two fetches away: it
       respawns the crowd when it lands, and the fit that follows it would
       snap the camera to the wide shot the intro is supposed to travel to.
       So the ask is queued, and what actually runs, runs after. */
    let pending = 0;
    function intro(seconds = 3.2) {
      pending = seconds;
      ready.then(() => { const sec = pending; pending = 0; if (sec) begin(sec); });
      return api;
    }
    function begin(seconds) {
      camTw.cancel();
      sim.set({ reveal: 0 }, { snap: true });
      const one = sim.first();
      if (one) box.cam.target.copy(one); else box.cam.target.set(0, 0, 0);
      box.cam.r = fitR(sim.molR * 1.75);
      box.applyCam();
      held = 0;
      sim.set({ reveal: 1 }, { seconds });
      frame(seconds, true);
    }

    /* Pull back by a factor, for a page that wants room before it hands off. */
    function zoom(factor, dur = 2) {
      const r0 = box.cam.r, r1 = Math.min(r0 * factor, 7800);
      camTw.to(r0, r1, dur, v => { box.cam.r = v; box.applyCam(); if (!box.running) box.draw(); },
        { key: 'fit', ease: 'smooth' });
    }

    const ready = sim.load().then(() => {
      nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, library: sim.library }) : null;
      frame(0, true);
      box.draw();
      return api;
    }).catch(e => { console.warn('HbCrowd: ' + e.message); return api; });

    const api = {
      sim, box, ready,
      /* play and reset queue behind the files too, for the same reason: a
         step that calls play() before the bond has loaded gets silence, and
         the beat never starts. */
      set(next, o) { sim.set(next, o); return api; },
      state: () => sim.state(),
      play() { ready.then(() => sim.play()); return api; },
      reset() { ready.then(() => { sim.reset(); if (!pending) frame(0.6, true); }); return api; },
      zoom(f, dur) { zoom(f, dur); return api; },
      intro(seconds) { return intro(seconds); },
      on(ev, fn) {
        if (ev === 'frame') { (listeners.frame || (listeners.frame = [])).push(fn);
          return () => { const i = listeners.frame.indexOf(fn); if (i >= 0) listeners.frame.splice(i, 1); }; }
        return sim.on(ev, fn);
      },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n),
      clearNotes: () => nb && nb.clear(), anchors: () => (nb ? nb.list() : []),
      start: box.start, stop: box.stop, pump: box.pump, draw: box.draw,
      destroy() { if (nb) nb.clear(); sim.dispose(); box.destroy(); },
    };
    return api;
  }

  global.HbCrowd = { create, mount, markOf, skinOf, DEFAULTS, MAX, RUN, SURF };
  /* Scale (kit/scale.js). One scene unit is one ångström: the
     tetramer is a lab's and the bond between any two is the crystal's, so a
     page may print an assembly's length off state(). The motion is
     choreography, not a diffusion rate, and state() reports no speed for that
     reason. Bulk, because the subject is many molecules at once; what they
     build is the same rung, so SickleFibre may take over the same scene. */
  global.HbCrowd.SCALE = {
    rung: 'macromolecule', form: 'bulk', unit: 1e-10,
    sceneUnits: [], exag: {}, down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
