/* =============================================================================
 *  sickle/sickle-fibre.js — the HbS fibre: one contact, a double strand, a rope
 * =============================================================================
 *  Classic script after lib/scene.js, kit/tube.js, kit/surface.js and
 *  kit/card-stage.js. Exposes window.SickleFibre.
 *
 *      const F = SickleFibre.mount(el, { base:'sickle/', preset:'contact' });
 *      F.set({ preset:'fibre' });   F.state();   F.destroy();
 *
 *  ONE ASSEMBLY, THREE SIZES OF THE SAME OBJECT. `preset` is how many copies
 *  are drawn and nothing else — the geometry and every transform are identical
 *  across all three, so the fibre is visibly the same thing as the contact seen
 *  further away, and a lesson stepping from one to the next is not switching
 *  models mid-argument.
 *
 *      contact   1 repeat,  1 double strand   the beta6 -> pocket pair
 *      strand    n repeats, 1 double strand   the same contact, repeating
 *      fibre     n repeats, 7 double strands  the rope
 *
 *  ---- MEASURED AND MODELLED, AND WHICH IS WHICH -----------------------------
 *
 *  Everything here comes from one of two places, and `state()` reports them in
 *  separate blocks so a page cannot print one as the other.
 *
 *    MEASURED, from hemoglobin/data/2HBS.pdb via sickle/tools/bake-fibre.js
 *      · the tetramer itself
 *      · the LATERAL operation: the rigid motion putting the second tetramer of
 *        the asymmetric unit beside the first (rmsd 0.32 A over 574 Ca, so the
 *        two really are the same molecule twice)
 *      · the AXIAL repeat: the crystallographic a translation, 63.344 A
 *      · both beta6 -> Phe85/Leu88 contacts that justify calling those the
 *        strand-forming operations at all
 *
 *    MODELLED, from the electron-microscopy literature and NOT checkable here
 *      · that seven double strands make a fibre
 *      · the core/sheath radii they sit at
 *      · the helical pitch of the whole assembly
 *
 *  The modelled three are PARAMETERS, deliberately. A number a page can move
 *  says "someone chose this" in a way a constant does not, and none of them can
 *  be verified against anything in this repository. If a fibre EM
 *  reconstruction is ever committed here they should become measurements and
 *  this paragraph should shrink.
 *
 *  WHAT IS DELIBERATELY MISSING: the strands are not all equivalent in the real
 *  structure — inner core and outer sheath differ in their contacts, and the
 *  outer strands are thought to be less regular. Drawing all seven double
 *  strands as copies of one measured double strand is a simplification, and a
 *  visible one at high repeat counts, where the sheath looks more crystalline
 *  than the real fibre is.
 *
 *  ---- PARAMS ---------------------------------------------------------------
 *
 *    preset    'contact' | 'strand' | 'fibre'   sets repeats and strands
 *    repeats   1..30   copies along one strand          REBUILDS, so it snaps
 *    strands   1..7    double strands                   REBUILDS, so it snaps
 *    rep       'tube' | 'surface'                       snaps
 *    colour    'strand' | 'chain'                       snaps
 *    marks     true | false   the contact sites          snaps
 *    core      A   radius of the two core strands       glides
 *    sheath    A   radius of the sheath ring            glides
 *    pitch     A   helical pitch of the whole fibre     glides
 *    skinColour  the skin's own colour where no mark claims it
 *    base      path prefix to sickle/ from the page
 *
 *  The three that glide are placements: every instance is re-seated, nothing is
 *  rebuilt. The rest change how many instances exist or what geometry they
 *  carry, and nothing can tween across that.
 *
 *  ---- WHAT IT REFUSES TO OWN ------------------------------------------------
 *
 *  Any claim about the cell. A fibre is `macromolecule` rung and a red cell is
 *  `cell`; they may not share a camera, so "the fibre deforms the cell" is a
 *  handoff to bloodcell/ and never a camera move. It is not a `down` either —
 *  that is for zooming IN, and this one goes out.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = {
    preset: 'fibre', repeats: 12, strands: 7,
    rep: 'tube', colour: 'strand', marks: true,
    core: 34, sheath: 82, pitch: 3000, skinColour: null,
    base: '',
  };

  /* Caps, enforced at set() with one warning. The instance buffers are
     allocated once for the largest crowd these allow. */
  const MAX_REPEATS = 30, MAX_STRANDS = 7;
  const MAX_INST = MAX_REPEATS * MAX_STRANDS * 2;

  const PRESETS = {
    contact: { repeats: 1, strands: 1 },
    strand:  { strands: 1 },
    fibre:   {},
  };

  /* One shade per double strand, so the seven can be told apart where they wind
     past each other. At fibre scale a single colour is one undifferentiated
     rope, and the twist — the thing the assembly exists to show — is invisible
     without it. */
  const STRAND_HUE = [0.00, 0.045, 0.09, 0.955, 0.02, 0.07, 0.975];

  /* TWO COLOUR MODES, and they use different machinery because they colour
     different things.

     BY STRAND is per-INSTANCE: every part of one tetramer takes one shade, and
     the shade says which double strand it belongs to. That is what makes the
     twist legible.

     BY CHAIN is per-PART: the four subunits take two colours between them and
     every tetramer is painted identically. This is the textbook picture, and
     what it shows is that a haemoglobin is FOUR subunits of TWO kinds.

     The trade is real: by chain, every molecule looks the same, so at fibre
     scale the strands merge into one mass. A small per-strand LIGHTNESS
     modulation is kept underneath to hold them apart — it rides the instance
     colour, so it never touches the hue carrying the chain identity. */
  const ALPHA_COLOR = 0x2f6fb5, BETA_COLOR = 0xd9a520;
  const STRAND_VALUE = 0.13;               // +-13% lightness, enough to separate

  /* Coarse on purpose. A fibre at 12 repeats is 168 tetramers; there is no
     reason to spend 61 triangles a residue on a molecule 30 px across. */
  const TUBE = { sides: 6, segPerRes: 1, caps: true };

  /* BOTH ENDS OF THIS CONTACT ARE GREASY, and the marks have to say so.

     The first version drew the pocket in this repo's polar blue, which is the
     colour meaning "happy in water" everywhere else here — on a site made of
     PHENYLALANINE 85 and LEUCINE 88, two of the most hydrophobic residues there
     are. It contradicted the mechanism in the one channel carrying chemistry:
     the patch and the pocket stick together BECAUSE both are greasy and water
     will not have either of them.

     So hue is not available to tell them apart, and they are separated by value
     and size instead — the patch a bright dot, the pocket a bigger, darker one,
     both unmistakably in the nonpolar family. */
  const PATCH_COLOR = 0xd4671f;            // beta6 — the greasy patch
  const POCKET_COLOR = 0x6e3208;           // Phe85/Leu88 — greasy too, and deeper
  const PATCH_R = 3.6, POCKET_R = 5.2;     // angstroms; the pocket is two residues

  /* HALF OF THESE SITES DO NOTHING, and the marks used to hide that.

     Every tetramer has two beta chains, so drawing a patch and a pocket on each
     gives four dots. The crystal only ever uses two: a full lattice scan (both
     P2(1) operations across +-1 cell in all directions, in bake-fibre.js) finds
     exactly two beta6 -> Phe85/Leu88 contacts, and chain D donates while chain B
     receives. Chain B's beta6 and chain D's pocket are never in contact.

     Four equal dots implied all four were working, which quietly contradicts the
     reason this assembly is a STRAND: one way in and one way out per molecule
     gives a line, two of each would branch. So the idle pair is drawn small and
     washed out — present, because a spare site is a real feature, but visibly
     not in play.

     Which is which comes from the bake's per-chain `donates` / `receives`
     flags, so it is measured rather than a pair of chain letters typed here.

     CAVEAT this cannot resolve: "idle" is true of the CRYSTAL. Whether the
     fibre uses that spare beta6 in contacts BETWEEN double strands is exactly
     the part 2HBS does not contain. */
  const IDLE_SCALE = 0.55, IDLE_LIGHT = 0.55;
  /* THE SKIN'S OWN COLOUR, when nothing else is claiming it. A warm gold: a
     protein surface has to read as a material rather than as a highlight, and
     the near-neutral stone it replaced went grey against the paper the moment
     several molecules overlapped — which is most of what beat 3 is.

     IT MUST LOSE TO BOTH MARKS. The patch is a bright orange and the pocket a
     deep brown, and a skin in the beta chain's own amber (0xd9a520) put all
     three in one family and buried the very thing they mark. This is lighter
     and duller than that on purpose: same warmth, no competition. `skinColour`
     overrides it for a page that needs another. */
  const SURF_PLAIN = 0xe0cd97;

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  /* ---------------------------------------------------------------------
   *  THE ASSEMBLY ARITHMETIC, WITH NO THREE IN IT
   * ---------------------------------------------------------------------
   *  Where a tetramer goes, and what the modelled twist costs the measured
   *  contact. Both are numbers this component PRINTS, so both need a checker,
   *  and a checker cannot load THREE — this repo has no copy of it in Node.
   *
   *  ONE CODE PATH, NOT TWO. `place()` is what the renderer uploads and what
   *  `strain()` measures; a checker holding its own copy of either would agree
   *  with itself forever and with the screen never. Row-major 16-arrays, which
   *  is what the bake stores and what THREE.Matrix4.set() takes, so the only
   *  conversion is a spread.
   */
  const Mat = {
    I: () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1],
    mul(a, b) {
      const o = new Array(16);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let v = 0;
        for (let k = 0; k < 4; k++) v += a[r * 4 + k] * b[k * 4 + c];
        o[r * 4 + c] = v;
      }
      return o;
    },
    transl: (x, y, z) => [1,0,0,x, 0,1,0,y, 0,0,1,z, 0,0,0,1],
    rotY: a => { const c = Math.cos(a), s = Math.sin(a);
      return [c,0,s,0, 0,1,0,0, -s,0,c,0, 0,0,0,1]; },
    fromRT: (R, t) => [R[0][0],R[0][1],R[0][2],t[0],
                       R[1][0],R[1][1],R[1][2],t[1],
                       R[2][0],R[2][1],R[2][2],t[2],
                       0,0,0,1],
    /* The rotation taking `from` onto `to`, both unit. Rodrigues rather than a
       quaternion, because there is no quaternion type here and this is used
       once: the crystal's a axis onto +Y, so the fibre stands up. A pure change
       of viewing frame — it turns the whole assembly and changes no relative
       geometry. */
    align(from, to) {
      const n = v => { const L = Math.hypot(v[0], v[1], v[2]); return [v[0]/L, v[1]/L, v[2]/L]; };
      const a = n(from), b = n(to);
      const v = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const c = a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
      if (c < -0.999999) return [1,0,0,0, 0,-1,0,0, 0,0,-1,0, 0,0,0,1];
      const k = 1 / (1 + c);
      return [ v[0]*v[0]*k + c,     v[0]*v[1]*k - v[2], v[0]*v[2]*k + v[1], 0,
               v[1]*v[0]*k + v[2],  v[1]*v[1]*k + c,    v[1]*v[2]*k - v[0], 0,
               v[2]*v[0]*k - v[1],  v[2]*v[1]*k + v[0], v[2]*v[2]*k + c,    0,
               0, 0, 0, 1 ];
    },
    apply: (m, p) => [
      m[0]*p[0] + m[1]*p[1] + m[2]*p[2] + m[3],
      m[4]*p[0] + m[5]*p[1] + m[6]*p[2] + m[7],
      m[8]*p[0] + m[9]*p[1] + m[10]*p[2] + m[11],
    ],
    dist: (a, b) => Math.hypot(a[0]-b[0], a[1]-b[1], a[2]-b[2]),
  };

  const axialLenOf = D => Math.hypot(D.axial[0], D.axial[1], D.axial[2]);

  /* The first two double strands in the core, the rest around the sheath.
     MODELLED — see the header. */
  function seatsFor(strands, core, sheath) {
    const seats = [];
    for (let s = 0; s < strands; s++) {
      const inCore = strands > 2 && s < 2;
      const ring = inCore ? 2 : Math.max(1, strands - 2);
      const idx = inCore ? s : s - 2;
      seats.push({ rad: inCore ? core : sheath,
                   ang: 2 * Math.PI * idx / ring + (inCore ? Math.PI / 2 : 0),
                   s });
    }
    return seats;
  }

  /* WHERE TETRAMER i OF A STRAND SEATED AT (rad, ang) GOES.

     Along the strand first, in the crystal's own frame. Then stand it up, seat
     it in the fibre, and twist by how far up the fibre it has got. ORDER
     MATTERS: the twist is applied about the fibre axis AFTER the strand is
     placed off-axis, which is what makes the strand wind rather than spin in
     place. */
  function place(D, seat, i, pitch, upright) {
    const a = axialLenOf(D);
    return Mat.mul(Mat.mul(Mat.mul(
      Mat.rotY(2 * Math.PI * (i * a) / pitch),
      Mat.transl(seat.rad * Math.cos(seat.ang), 0, seat.rad * Math.sin(seat.ang))),
      upright),
      Mat.transl(D.axial[0] * i, D.axial[1] * i, D.axial[2] * i));
  }

  const uprightOf = D => Mat.align(D.axial, [0, 1, 0]);

  /* HOW MUCH THE MODELLED TWIST DEFORMS THE MEASURED CONTACT.

     Placing tetramer i at rotY(i*dtheta) . translate(i*a) is a SCREW, and the
     useful property of a screw is that the relation between any two consecutive
     bodies is the same rigid motion — so the twist does not progressively tear
     the strand apart; it applies one uniform strain to every contact along it.
     check-fibre.js asserts exactly that, because it is the sentence that makes
     ONE strain number meaningful for a whole strand.

     But the strain is real, and it grows with radius and with twist rate. At the
     commonly-cited 3000 A pitch it stretches the sheath's beta6-to-pocket link
     by about 3.6 A, on a contact whose deposited side-chain distance is 4.1. A
     real fibre absorbs that by deforming its molecules; rigid copies of a
     crystal strand cannot, so the number is reported rather than hidden. Above
     about 2 A it is fair to say the picture has stopped being a model of
     anything.

     Measured against a straight strand rather than against the crystal, so it
     reports what the TWIST cost and not what the bake already carried. */
  function strainOf(D, rad, pitch) {
    const upright = uprightOf(D), pair = Mat.fromRT(D.pair.R, D.pair.t);
    const seat = { rad, ang: 0 };
    const mD = D.marks.find(m => m.chain === 'D') || D.marks[0];
    const mB = D.marks.find(m => m.chain === 'B') || D.marks[0];
    const link = p => Mat.dist(
      Mat.apply(place(D, seat, 1, p, upright), mD.beta6),
      Mat.apply(Mat.mul(place(D, seat, 0, p, upright), pair), mB.pocket));
    return link(pitch) - link(1e12);
  }

  /* The rigid motion between consecutive tetramers of one strand, as the
     numbers a screw claim is made of: check-fibre.js compares it across links.
     inverse(A)·B for two rigid motions, without a general inverse. */
  function linkOf(D, rad, pitch, i) {
    const upright = uprightOf(D), seat = { rad, ang: 0 };
    const A = place(D, seat, i, pitch, upright), B = place(D, seat, i + 1, pitch, upright);
    const inv = m => {
      const R = [[m[0],m[4],m[8]], [m[1],m[5],m[9]], [m[2],m[6],m[10]]];   // transpose
      const t = [m[3], m[7], m[11]];
      return [R[0][0],R[0][1],R[0][2], -(R[0][0]*t[0]+R[0][1]*t[1]+R[0][2]*t[2]),
              R[1][0],R[1][1],R[1][2], -(R[1][0]*t[0]+R[1][1]*t[1]+R[1][2]*t[2]),
              R[2][0],R[2][1],R[2][2], -(R[2][0]*t[0]+R[2][1]*t[1]+R[2][2]*t[2]),
              0,0,0,1];
    };
    return Mat.mul(inv(A), B);
  }


  function create(THREE, root, camera, opts) {
    const P = Object.assign({}, DEFAULTS, opts);
    const listeners = {};
    const emit = (ev, a, b) => CardStage.fire(listeners[ev], [a, b], 'SickleFibre ' + ev);

    const tint = new THREE.Color();
    const dummy4 = new THREE.Matrix4();
    const M = new THREE.Matrix4(), tmp = new THREE.Matrix4();

    let D = null;                          // the bake
    let S = null;                          // the decoded surface, once fetched
    let tubeBodies = [], surfBodies = [], bodies = [];
    let markMesh = null, pocketMesh = null, idlePatch = null, idlePocket = null;
    let axialLen = 0, drawn = 0, capWarned = false;
    let molR = 0;                          // tetramer radius, measured off the bake
    const bounds = new THREE.Box3();
    const placedAt = [];    // instance centres, for the bounding sphere
    const ALPHA_CHAINS = new Set();
    const hidden = { marks: false, idle: false };
    let last = null;

    const tw = global.CardStage ? global.CardStage.tweens() : null;

    const strandColour = (i, partner) =>
      tint.setHSL(STRAND_HUE[i % STRAND_HUE.length], 0.62, partner ? 0.58 : 0.40);
    const strandValue = (i, partner) => {
      const v = 1 + STRAND_VALUE * ((i % 4) / 1.5 - 1) + (partner ? STRAND_VALUE / 2 : 0);
      return tint.setRGB(v, v, v);
    };

    /* ---- build --------------------------------------------------------- */

    /* THE SURFACE, as one instanced mesh. A tube is 12 parts because it is 12
       separate pieces of geometry; the SES is ONE closed mesh over the whole
       tetramer, so the whole representation is a single InstancedMesh and a
       single draw call however many molecules are on screen. It is not cheap in
       triangles — 49,976 per copy at the baked 1.1 A grid against 1,782 for the
       tube here, a 28x ratio, and the reason `rep` is a choice rather than a
       default: at 7 double strands x 30 repeats it is 21M triangles.

       VERTEX COLOURS do the work the tube's separate meshes did. The bake tags
       every vertex with the residue under it, so chain identity and the two
       contact sites are painted straight onto the skin — better than the tube's
       dots for the marks, because a dot sits at a Ca that is BENEATH the
       surface and would be swallowed by it. On the skin the patch and the
       pocket are drawn where they actually are: on the outside. */
    function buildSurface() {
      S.geo.setAttribute('color', new THREE.BufferAttribute(
        new Float32Array(S.nVert * 3), 3));
      const mat = global.Stage.bondMat(0xffffff);
      mat.vertexColors = true;
      const m = new THREE.InstancedMesh(S.geo, mat, MAX_INST);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      m.userData.kind = 'surface';
      root.add(m);
      surfBodies = [m];
    }

    /* Base colour by chain or plain, then the four contact sites over the top —
       engaged bright, idle washed, matching the tube's dots exactly so
       switching representation does not change what is being claimed. */
    function paintSurface(byChain, showMarks) {
      const attr = S.geo.getAttribute('color'), col = attr.array;
      const mark = new THREE.Color();
      const wash = c => c.lerp(new THREE.Color(0xf3ece2), IDLE_LIGHT);
      const site = new Map();              // "chain:num" -> THREE.Color
      for (const mk of D.marks) {
        site.set(mk.chain + ':6', mk.donates
          ? new THREE.Color(PATCH_COLOR) : wash(new THREE.Color(PATCH_COLOR)));
        for (const n of [85, 88])
          site.set(mk.chain + ':' + n, mk.receives
            ? new THREE.Color(POCKET_COLOR) : wash(new THREE.Color(POCKET_COLOR)));
      }
      for (let v = 0; v < S.nVert; v++) {
        const r = S.head.residues[S.res[v]];
        const key = r[0] + ':' + r[1];
        if (showMarks && site.has(key)) mark.copy(site.get(key));
        else if (byChain) mark.set(ALPHA_CHAINS.has(r[0]) ? ALPHA_COLOR : BETA_COLOR);
        else mark.set(P.skinColour == null ? SURF_PLAIN : P.skinColour);
        col[v * 3] = mark.r; col[v * 3 + 1] = mark.g; col[v * 3 + 2] = mark.b;
      }
      attr.needsUpdate = true;
    }

    function buildBodies(chains) {
      const parts = [];
      for (const c of chains)
        for (const p of global.TubeLib.chain(THREE, c.CA, c.ss, TUBE))
          parts.push(Object.assign(p, { kind: c.kind }));

      tubeBodies = parts.map(p => {
        p.geo.computeBoundingSphere();
        const m = new THREE.InstancedMesh(p.geo, global.Stage.bondMat(0xffffff), MAX_INST);
        m.userData.kind = p.kind;          // which subunit this part belongs to
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;           // instances range far from the origin
        root.add(m);
        return m;
      });
      bodies = tubeBodies;

      /* The two ends of the contact, as dots, placed by the SAME transforms as
         the bodies so a mark cannot drift off the molecule it belongs to. Four
         meshes and not two: working and idle differ in geometry as well as
         colour, and an InstancedMesh carries one geometry. */
      const wash = hex => new THREE.Color(hex).lerp(new THREE.Color(0xf3ece2), IDLE_LIGHT);
      const dotMesh = (r, colour, rough) => {
        const m = new THREE.InstancedMesh(new THREE.SphereGeometry(r, 10, 8),
          new THREE.MeshStandardMaterial({ color: colour, roughness: rough }), MAX_INST * 2);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        root.add(m);
        return m;
      };
      markMesh   = dotMesh(PATCH_R, PATCH_COLOR, .5);
      pocketMesh = dotMesh(POCKET_R, POCKET_COLOR, .75);
      idlePatch  = dotMesh(PATCH_R * IDLE_SCALE, wash(PATCH_COLOR), .8);
      idlePocket = dotMesh(POCKET_R * IDLE_SCALE, wash(POCKET_COLOR), .8);
    }

    /* ---- assembly ------------------------------------------------------ */

    function rebuild() {
      if (!D) return;
      const repeats = P.repeats, strands = P.strands;
      const useSES = P.rep === 'surface' && surfBodies.length;
      const byChain = P.colour === 'chain';
      const showMarks = P.marks && !hidden.marks;

      /* Both representations exist once loaded; switching flips visibility
         rather than rebuilding, so the choice costs nothing. */
      bodies = useSES ? surfBodies : tubeBodies;
      for (const m of tubeBodies) m.visible = !useSES;
      for (const m of surfBodies) m.visible = useSES;

      /* The material carries the chain colour; the instance colour carries the
         strand. In strand mode the material is white so the instance shade
         shows through; in chain mode the instance colour is a near-white value
         so it only modulates. They multiply, so exactly one is ever coloured. */
      if (useSES) paintSurface(byChain, showMarks);
      else for (const mesh of bodies)
        mesh.material.color.set(byChain
          ? (mesh.userData.kind === 'alpha' ? ALPHA_COLOR : BETA_COLOR)
          : 0xffffff);

      const upright = uprightOf(D);
      const pair = Mat.fromRT(D.pair.R, D.pair.t);
      const seats = seatsFor(strands, P.core, P.sheath);

      let n = 0;
      bounds.makeEmpty();
      placedAt.length = 0;
      const at = new THREE.Vector3();
      const put = (m4, colourIdx, partner) => {
        at.setFromMatrixPosition(m4);
        bounds.expandByPoint(at);
        placedAt.push(at.clone());
        /* The surface gets the SAME per-instance shade as the tube: its vertex
           colours carry chain and site, the instance colour multiplies over
           them. Fully opaque either way — a translucent skin reads as glass at
           this scale and hides the molecule behind it. */
        /* MARKS WIN ON THE SKIN. The instance colour MULTIPLIES the vertex
           colours, so a saturated strand hue over a painted patch is a red
           patch on a red molecule — which is the one thing the contact view
           exists to show, invisible. On the SES with marks on, the instance
           carries the near-white value instead and the painted sites read;
           strand identity is what is given up, and at the two-molecule scale
           where the marks matter there is no strand to identify. */
        ((byChain || (useSES && showMarks)) ? strandValue : strandColour)(colourIdx, partner);
        for (const mesh of bodies) { mesh.setMatrixAt(n, m4); mesh.setColorAt(n, tint); }
        n++;
      };

      /* THE PLACEMENT IS Mat's, not THREE's — one code path, and it is the one
         check-fibre.js runs. THREE only carries the result to the GPU. */
      for (const seat of seats) {
        for (let i = 0; i < repeats; i++) {
          const m = place(D, seat, i, P.pitch, upright);
          M.set(...m);
          put(M, seat.s, false);
          // The partner tetramer: the measured lateral operation, in the
          // crystal frame, before everything else.
          tmp.set(...Mat.mul(m, pair));
          put(tmp, seat.s, true);
        }
      }

      for (const mesh of bodies) {
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      }
      drawn = n;

      /* Marks ride the same transforms: read each body's matrix back and hang
         the dots off it rather than recomputing the composition, so a mark
         cannot drift away from the molecule it labels whatever the seating
         maths does. */
      if (showMarks && !useSES) {
        const off = new THREE.Matrix4();
        const cnt = { mark: 0, pocket: 0, idleP: 0, idleK: 0 };
        for (let inst = 0; inst < n; inst++) {
          bodies[0].getMatrixAt(inst, tmp);
          for (const mk of D.marks) {
            off.makeTranslation(mk.beta6[0], mk.beta6[1], mk.beta6[2]);
            (mk.donates ? markMesh : idlePatch)
              .setMatrixAt(mk.donates ? cnt.mark++ : cnt.idleP++, dummy4.copy(tmp).multiply(off));
            off.makeTranslation(mk.pocket[0], mk.pocket[1], mk.pocket[2]);
            (mk.receives ? pocketMesh : idlePocket)
              .setMatrixAt(mk.receives ? cnt.pocket++ : cnt.idleK++, dummy4.copy(tmp).multiply(off));
          }
        }
        markMesh.count = cnt.mark; pocketMesh.count = cnt.pocket;
        idlePatch.count = cnt.idleP; idlePocket.count = cnt.idleK;
        for (const m of [markMesh, pocketMesh, idlePatch, idlePocket])
          m.instanceMatrix.needsUpdate = true;
      }
      /* The dots are BENEATH the SES: they sit at Ca positions and the skin is
         a couple of angstroms outside those. In surface mode the sites are
         painted onto the skin instead, so the dots would be invisible clutter —
         and on the two occasions they poked through, worse than invisible. */
      for (const m of [markMesh, pocketMesh, idlePatch, idlePocket])
        if (m) m.visible = showMarks && !useSES;
      if (idlePatch) idlePatch.visible = idlePatch.visible && !hidden.idle;
      if (idlePocket) idlePocket.visible = idlePocket.visible && !hidden.idle;

      last = null;
      emit('build', state());
    }



    /* ---- state --------------------------------------------------------- */

    /* EVERY NUMBER A PAGE COULD PRINT, and measured and modelled kept apart, so
       a caption cannot borrow the authority of one for the other. */
    function state() {
      if (last) return last;
      if (!D) return null;
      const rad = P.strands > 2 ? P.sheath : P.core;
      const tris = (P.rep === 'surface' && S) ? S.nTri
        : D.chains.reduce((s, c) => s + global.TubeLib.triangles(c.CA.length, TUBE), 0);
      last = {
        preset: P.preset, rep: P.rep, colour: P.colour, marks: P.marks,
        tetramers: drawn,
        strands: P.strands, repeats: P.repeats,
        drawCalls: bodies.length + (P.marks && P.rep !== 'surface' ? 4 : 0),
        triangles: tris * drawn,
        lengthA: axialLen * P.repeats,
        lengthNm: axialLen * P.repeats / 10,
        measured: {
          source: '2HBS',
          axialA: axialLen,
          lateralRmsd: D.pair.rmsd,
          contactLateralA: D.contacts.lateral.d,
          contactAxialA: D.contacts.axial.d,
        },
        modelled: {
          doubleStrands: P.strands, strandsTotal: P.strands * 2,
          coreA: P.core, sheathA: P.sheath, pitchA: P.pitch,
          degPerRepeat: 360 * axialLen / P.pitch,
          strainA: strainOf(D, rad, P.pitch),
        },
      };
      /* The one number that invalidates the picture rather than describing it.
         A page showing a fibre this strained is drawing something no molecule
         could hold together. */
      last.modelled.overStrained = last.modelled.strainA > 2;
      return last;
    }

    /* ---- layers, palette, anchors -------------------------------------- */

    const LAYERS = [
      { name: 'marks', label: 'contact sites' },
      { name: 'idle',  label: 'the spare sites' },
    ];
    const layersOf = () => LAYERS.map(l => ({ ...l, on: !hidden[l.name] }));
    function show(name, on) {
      if (!(name in hidden)) return;
      hidden[name] = !on;
      rebuild();
    }
    const palette = () => ([
      { name: 'patch',  colour: PATCH_COLOR,  label: 'beta6 valine — the greasy patch' },
      { name: 'pocket', colour: POCKET_COLOR, label: 'Phe85 / Leu88 — the pocket it fits' },
      { name: 'alpha',  colour: ALPHA_COLOR,  label: 'alpha subunit' },
      { name: 'beta',   colour: BETA_COLOR,   label: 'beta subunit' },
    ]);

    /* Anchors are FUNCTIONS returning a live world point, because the assembly
       is re-seated whenever a modelled parameter moves and a baked vector would
       be left behind. Null before the bake lands. */
    const markWorld = (which) => () => {
      if (!D || !bodies.length || !drawn) return null;
      const mk = D.marks.find(m => (which === 'patch' ? m.donates : m.receives)) || D.marks[0];
      bodies[0].getMatrixAt(0, tmp);
      const p = new THREE.Vector3().fromArray(which === 'patch' ? mk.beta6 : mk.pocket);
      return p.applyMatrix4(tmp).applyMatrix4(root.matrixWorld);
    };
    const anchors = {
      patch: markWorld('patch'),
      pocket: markWorld('pocket'),
      fibre: () => drawn ? new THREE.Vector3(0, axialLen * P.repeats / 2, 0)
                             .applyMatrix4(root.matrixWorld) : null,
    };
    const library = {
      patch: { text: 'β6 valine',
        card: 'The one residue the mutation changed. On the surface it is a small greasy '
            + 'knob where hemoglobin A carries a charged one.' },
      pocket: { text: 'Phe85 / Leu88',
        card: 'A greasy dent on a NEIGHBOURING molecule. It is there in normal hemoglobin '
            + 'too — what is missing there is anything to put in it.' },
      fibre: { text: 'the fibre',
        card: 'Seven double strands wound together. Every contact along it is the same '
            + 'patch-into-pocket pair, repeated.' },
    };

    /* ---- set ----------------------------------------------------------- */

    function set(next, o) {
      if (!next) return api;
      const snap = (o && o.snap) || !tw;
      let needs = false;
      if (next.preset && PRESETS[next.preset]) {
        Object.assign(P, { repeats: DEFAULTS.repeats, strands: DEFAULTS.strands },
                      PRESETS[next.preset], { preset: next.preset });
        needs = true;
      }
      for (const k of ['repeats', 'strands', 'rep', 'colour', 'marks']) {
        if (next[k] === undefined) continue;
        let v = next[k];
        if (k === 'repeats' || k === 'strands') {
          const hi = k === 'repeats' ? MAX_REPEATS : MAX_STRANDS;
          if (v > hi && !capWarned) {
            capWarned = true;
            console.warn(`SickleFibre: ${k} capped at ${hi} — the instance buffers `
              + `are allocated for ${MAX_INST} tetramers.`);
          }
          v = clamp(Math.round(v), 1, hi);
        }
        if (P[k] !== v) { P[k] = v; needs = true; }
      }
      /* The three modelled placements glide: nothing is rebuilt, every instance
         is re-seated, so a tween across them is honest. A slider the student is
         dragging passes {snap:true} and tracks the thumb. */
      for (const k of ['core', 'sheath', 'pitch']) {
        if (next[k] === undefined || next[k] === P[k]) continue;
        if (snap) { P[k] = next[k]; needs = true; }
        else tw.to(P[k], next[k], 0.5, v => { P[k] = v; rebuild(); }, { key: k, ease: 'smooth' });
      }
      if (needs) rebuild();
      return api;
    }

    /* ---- load ---------------------------------------------------------- */

    /* THE SURFACE IS OPTIONAL. It is 603 KB against fibre.json's 13, and the
       assembly is fully usable without it — so a missing surface refuses the
       `surface` rep rather than stopping the component. */
    function load() {
      return Promise.all([
        fetch(P.base + 'data/fibre.json').then(r => {
          if (!r.ok) throw new Error('sickle/data/fibre.json — HTTP ' + r.status
            + ' (run: node sickle/tools/bake-fibre.js)');
          return r.json();
        }),
        fetch(P.base + 'data/2HBS-T1.surf.bin')
          .then(r => r.ok ? r.arrayBuffer() : null).catch(() => null),
      ]).then(([json, surfBuf]) => {
        D = json;
        axialLen = Math.hypot(D.axial[0], D.axial[1], D.axial[2]);
        for (const c of D.chains) if (c.kind === 'alpha') ALPHA_CHAINS.add(c.id);
        molR = 0;
        for (const c of D.chains) for (const p of c.CA)
          molR = Math.max(molR, Math.hypot(p[0], p[1], p[2]));
        buildBodies(D.chains);
        if (surfBuf && global.SurfLib) {
          S = global.SurfLib.decode(THREE, surfBuf);
          /* Both representations are centred on fibre.json's `centre`, but that
             is an assumption until something checks it — so compare the mesh's
             own bounding sphere against what a centred tetramer should look
             like and SAY so, rather than letting a misregistered skin pass as a
             modelling choice. */
          const bs = S.geo.boundingSphere;
          if (bs.center.length() > 12 || bs.radius > 60)
            console.warn('SickleFibre: surface looks off-centre (|c| '
              + bs.center.length().toFixed(1) + ' A, r ' + bs.radius.toFixed(1)
              + ' A) — re-run bake-fibre-surface.js after bake-fibre.js, they share a centre');
          buildSurface();
        } else if (P.rep === 'surface') {
          P.rep = 'tube';
        }
        rebuild();
        emit('load', state());
        return api;
      });
    }

    /* THE EXTENT IS MEASURED OFF THE INSTANCES ACTUALLY PLACED, not derived
       from the strand model. Deriving it assumed the assembly is a vertical
       rope, which is true of the fibre and false of the thing the whole lesson
       turns on: two tetramers side by side, where the lateral operation puts
       most of the width off the axis and the model predicted none of it. The
       `contact` preset opened with half of itself out of frame.

       Centres from the instance matrices, plus one tetramer radius, so it is
       right for any preset and any seating the modelled parameters produce. */
    const extent = () => {
      if (bounds.isEmpty()) return { radius: 60, halfH: 60, halfW: 60, centre: new THREE.Vector3() };
      const size = bounds.getSize(new THREE.Vector3());
      const mid = bounds.getCenter(new THREE.Vector3());
      /* A RADIUS, because the reader can orbit. Half-extents describe the
         assembly in the pose it happens to be in; a bounding sphere describes
         it in every pose, which is what a camera distance has to survive. */
      let radius = 0;
      for (const p of placedAt) radius = Math.max(radius, p.distanceTo(mid));
      return {
        radius: radius + molR,
        halfH: size.y / 2 + molR,
        halfW: Math.max(size.x, size.z) / 2 + molR,
        /* ALL THREE AXES, because this is what the camera ORBITS about and not
           only what it is aimed at. Forcing x and z to zero targets the fibre
           axis, which is right for a rope and wrong for the two molecules the
           lesson turns on: the lateral partner sits off that axis, so the pair
           span it rather than surround it, and a drag swung them around a point
           beside themselves. */
        centre: bounds.getCenter(new THREE.Vector3()),
      };
    };

    const api = {
      step(dt) { if (tw) tw.update(dt); return state(); },
      state, set, extent, load,
      layersOf, show, palette, anchors, library,
      hasSurface: () => !!S,
      params: P,
      on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn);
        return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); }; },
    };
    return api;
  }

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('sickle-fibre.js: load kit/card-stage.js first');
    if (!global.TubeLib) throw new Error('sickle-fibre.js: load kit/tube.js first');
    /* kit/tube.js reads RibbonLib by BARE NAME — it is a script-scope const, so
       `global.RibbonLib` is undefined and the only way to ask is typeof. Missed
       once, and it presented as a component that loaded its bake, reported its
       measured numbers correctly, and drew nothing. */
    if (typeof RibbonLib === 'undefined')
      throw new Error('sickle-fibre.js: load kit/ribbon.js before kit/tube.js');
    let fib = null, nb = null;

    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0.7, phi: 1.25, r: 900 },
      stage: Object.assign({ rMin: 40, rMax: 12000 }, params.stage || {}),
      step: dt => { if (fib) fib.step(dt); },
      afterFrame: () => { if (nb) nb.step(); },
      /* The panel a lesson puts over this changes the aspect the fit was
         solved at, and so does the window. */
      onResize: () => { if (fib) frame(); },
      viewOffset: params.viewOffset,
    });
    /* A fibre at 30 repeats is 1900 A tall and the camera stands well back;
       Stage's default far plane clips it. */
    box.camera.far = 40000;
    box.camera.updateProjectionMatrix();

    fib = create(THREE, box.root, box.camera, params);

    /* SOLVED FROM THE REAL FRUSTUM, not from a tuned multiplier. The old bench
       used `max(halfH*1.9, halfW*4.2)`, which is right at the aspect it was
       tuned at and cropped the fibre everywhere else — at 12 repeats it cut
       380 A of a 760 A assembly off the top and bottom. A distance that has to
       hold across three presets, five sliders and a lesson panel taking half
       the width cannot be a constant. */
    /* FIT THE BOUNDING SPHERE, not the bounding box. Fitting the box put its
       CENTRE at the camera distance, so the near face sat at r minus the
       object's own depth and blew up in perspective — a four-repeat fibre came
       out at 1.8 of NDC when the fit said it was inside 1.0. A sphere has no
       near face to get wrong and no pose to be wrong in, which matters here
       because the reader can orbit whatever the step chose. */
    const frame = () => {
      const e = fib.extent();
      const cam = box.camera;
      const half = THREE.MathUtils.degToRad(cam.fov) / 2;
      /* THE PANEL TAKES ROOM THE FRUSTUM DOES NOT KNOW ABOUT. `viewOffset`
         SHIFTS the projection so the scene sits beside the glass; it does not
         narrow it, so the canvas is still W wide while the room a reader can
         see is W minus the panel. Fitting to the full width put a 7-strand
         fibre half under the panel and half off the right edge. The offset is
         half the hidden extent, so twice it is what to take off. */
      const W = box.canvas.clientWidth || 1, H = box.canvas.clientHeight || 1;
      const fn = params.viewOffset || el.viewOffset;
      const off = fn ? fn(W, H) : null;
      const fx = off ? Math.max(0.25, (W - Math.abs(off.x || 0) * 2) / W) : 1;
      const fy = off ? Math.max(0.25, (H - Math.abs(off.y || 0) * 2) / H) : 1;
      // The half-angles the panel actually leaves, vertical and horizontal.
      const av = Math.atan(Math.tan(half) * fy);
      const ah = Math.atan(Math.tan(half) * Math.max(cam.aspect, 0.1) * fx);
      const fit = a => e.radius / Math.max(Math.sin(a), 0.05);
      box.cam.target.copy(e.centre);
      box.cam.r = Math.max(fit(av), fit(ah), 220) * 1.06;   // a little air
      box.applyCam();
    };
    fib.on('build', frame);

    const ready = fib.load().then(() => {
      nb = global.Notebook ? global.Notebook.create(
        { box, anchors: fib.anchors, library: fib.library }) : null;
      frame();
      box.draw();
      return api;
    }).catch(e => { console.warn('SickleFibre: ' + e.message); return api; });

    const api = {
      sim: fib, box, ready,
      set(next, o) { fib.set(next, o); return this; },
      state: () => fib.state(),
      on: fib.on,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n),
      clearNotes: () => nb && nb.clear(), anchors: () => nb ? nb.list() : [],
      layers: fib.layersOf, palette: fib.palette,
      show(n, on) { fib.show(n, on); if (!box.running) box.draw(); return this; },
      start: box.start, stop: box.stop, pump: box.pump, draw: box.draw,
      destroy() { box.destroy(); },
    };
    return api;
  }

  global.SickleFibre = { create, mount, DEFAULTS, PRESETS, TUBE,
                         Mat, seatsFor, place, uprightOf, strainOf, linkOf, axialLenOf,
                         /* Read by sickle/hbcrowd.js, so the patch is one orange
                            on every page that draws it. */
                         COLOURS: { patch: PATCH_COLOR, pocket: POCKET_COLOR, skin: SURF_PLAIN } };
  /* Scale (kit/scale.js). One scene unit is one angstrom: the
     tetramer and both strand-forming operations are a crystal's, so a page may
     print a length off this. The three MODELLED numbers are parameters and
     `state()` reports them in their own block — they are not exaggerations of
     something measured, they are a shape nothing here can check.

     `down` IS EMPTY, and the interesting handoff is why. A fibre is
     macromolecule rung and a red cell is cell rung, so they may not share a
     camera and the lesson steps from one to the other — but that step is a
     zoom OUT, and `down` is for zooming in. What the fibre does to the cell
     is bloodcell/'s to draw, and nothing here reaches for it. */
  global.SickleFibre.SCALE = {
    rung: 'macromolecule', form: 'single', unit: 1e-10,
    sceneUnits: [], exag: {}, down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);

/* The arithmetic half is Node-loadable so sickle/tools/check-fibre.js runs THIS
   rather than a copy of it. `mount` and `create` need THREE and a DOM and are
   never reached from there. */
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.SickleFibre;
