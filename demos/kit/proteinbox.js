/* =============================================================================
 *  kit/proteinbox.js — Proteinbox: a card that shows a deposited protein
 * =============================================================================
 *  kit/molbox.js draws a molecule built from a spec. This draws one measured in
 *  a lab: real angstroms, from files a baker wrote, in a scene of its own —
 *  which is what lets it BE angstroms, since one scale family per SCENE
 *  (MolecularGeometry.md 1.5) and the cards beside it are the small-molecule
 *  family.
 *
 *  IT DRAWS DNA AND RNA TOO, through kit/nucleic.js, on any chain the bake
 *  marks `kind:'na'` — a backbone ribbon per strand and one rung per base
 *  pair. A protein and a duplex in one bake share one box, one scale and one
 *  centre; `proteins/zif268/` is the worked example. Load kit/nucleic.js
 *  alongside kit/ribbon.js when a page has any, and the box says so if it is
 *  missing rather than drawing half a structure.
 *
 *  Four things it can show, and only the first is free:
 *
 *    ribbon   12 KB trace, tools/bake-trace.js       drawn on create
 *    surface  ~360 KB SES, tools/bake-card-surface.js  fetched on the click
 *    skin     the SAME surface, translucent, OVER the ribbon    `skin:true`
 *    fold     ~830 KB trajectory, HbFold + FoldPlay    fetched on the click
 *
 *  SKIN IS NOT A FOURTH FILE, it is the surface drawn the other way, and the
 *  difference between the two is a claim rather than a look. `surface` REPLACES
 *  the ribbon: the molecule is its outside, and what is under the skin is not
 *  the question. `skin` covers a ribbon that is still there, which is what a
 *  page asks for when the question is WHERE ON the fold something is — a
 *  binding site, a mutated residue, a patch of exposed grease. Opt in with
 *  `skin:true`; a gallery card asking for `surface` still means what it always
 *  did, and does not grow a third button.
 *
 *  ON THE SKIN, two ways to say something, and they are not interchangeable:
 *
 *    box.paintSkin((chain, num, name) => colour)   per-residue, one array
 *    box.patch('b6', {chains:'B,D', num:6}, {colour, opacity})
 *    box.setSkin(opacity, seconds, {colour})
 *                                    fade the skin — 1 is the outside alone,
 *                                    null is back to reading the ribbon
 *                                    through, in this box's own colour
 *
 *  A paint recolours the skin in place — no rebuild, no refetch, and NOTHING
 *  MOVES, which is the point: a lesson claiming a substitution leaves the fold
 *  alone should be unable to move it while saying so. A patch is its own mesh
 *  over the same buffers, and it exists because one mesh has one opacity: a
 *  skin wants to be faint enough to see the ribbon through and a residue-sized
 *  marker wants to be solid, and per-vertex alpha only ever multiplies the
 *  material's. kit/surface.js carries the rest of that argument, and the rule
 *  that a triangle needs all three vertices on a residue to belong to it.
 *  Both may be called before the surface has loaded; they are remembered and
 *  applied when it lands.
 *
 *  SWITCHING STRUCTURES IS A SWAP, NOT A REBUILD. `setData(t, {keep:true})`
 *  and `setSurface(url)` replace the ribbon and the skin in place, each
 *  holding the old one up until the new one is ready — one WebGL context, one
 *  camera, the reader's turn kept. Destroying and re-creating a box to change
 *  molecule is what a flicker is, and on an A/B whose claim is that NOTHING
 *  MOVED, a flicker is the page contradicting itself.
 *
 *  THE GATES ARE THE DESIGN. A card is a thumbnail until a reader decides
 *  otherwise, and neither of the big two is ever something the box DOES to
 *  someone who scrolled past it: the bytes are asked for on the click, the
 *  ribbon stays up until they land, and the loop runs only while the fold is
 *  showing. The page adds the third gate — whether the controls are reachable
 *  at this zoom at all — because only the page knows how big its card is on
 *  screen. The door map does that with `.near`.
 *
 *  ONE DECODED SURFACE ACROSS EVERY BOX, for the same reason kit/card-stage.js
 *  rations contexts: 360 KB of quantised mesh becomes several MB of GPU
 *  buffers, and the LRU rations contexts, not what a page hangs off one. A box
 *  that loses its surface falls back to the ribbon it never removed.
 *
 *  WHAT IT DOES NOT OWN. Anything about the page around it: no lesson button,
 *  no modal, no `.near`. It owns the molecule and the two questions a reader
 *  can ask of it.
 *
 *  NO `cache:'force-cache'` ON ANY OF THESE FETCHES. It reads as the right
 *  thing to ask for — the files never change — but the dev server sends
 *  `no-store` so a reload never serves a stale page, and WebKit fails a
 *  force-cache request for a no-store resource outright rather than falling
 *  back to the network. Safari-only, and it presents as a box that never draws.
 *  Ordinary caching already does the job: these are static files with real
 *  cache headers in production, and the second box asking for one gets it from
 *  the memory cache anyway.
 *
 *  Every library is read by its BARE name, not off `global`: kit/ribbon.js
 *  publishes `const RibbonLib` at script top level, which is script scope and
 *  never a property of window — `global.RibbonLib` is undefined, and only at
 *  the moment a card tries to draw.
 *
 *  Needs, in load order: THREE, lib/scene.js, kit/ribbon.js,
 *  kit/card-stage.js. And only for the option that uses it —
 *  kit/surface.js for `surface`, hemoglobin/hbfold.js +
 *  hemoglobin/foldplay.js for `fold`.
 *
 *    const box = Proteinbox.create({
 *      mount, trace:'…/2HHB.trace.json',       // or data: a parsed one
 *      chains:'B',                             // default: every chain in the file
 *      surface:'…/2HHB.card.surf.bin',         // omit and there is no toggle
 *      fold:'…/2HHB-B.fold.bin',               // omit and there is no play button
 *    });
 *
 *  OR, by name, and then the registry answers all four:
 *
 *      Proteinbox.create({ mount, protein:'hemoglobin', base:'../' });
 *      Proteinbox.create({ mount, protein:'hemoglobin', variant:'2HBS' });
 *
 *  proteins/proteins.js names every artefact by ROLE — trace, card, fold —
 *  and check-proteins.js fails a role that is not on disk, so a caller
 *  rebuilding those names from a stem is standing a convention where a fact
 *  already is. An explicit path still wins, because hemoglobin-lab and the door
 *  map's VIEWS name files the registry has no role for.
 *
 *  `data:` is `trace:` already parsed — same object, no fetch — for a page
 *  whose coordinates arrive as something the box does not read. It does not
 *  read PDB and should not learn to: parsing decides which altloc, which
 *  chain, and whether secondary structure is read or detected, and a page
 *  that owns a protein already owns those. What is shared is the box.
 *
 *  `view:` is a 3x3 basis saying which way the structure should face, applied
 *  to the chain group so the camera stays the reader's.
 *
 *  TWO KINDS OF BASIS AND THEY LIVE IN DIFFERENT PLACES, which is the whole of
 *  the precedence `setData` applies — this option, then create's, then the
 *  bake's:
 *
 *    CHOSEN   a human turned the molecule and picked. Taste, not measurement,
 *             so it lives in proteins/proteins.js as `view:{by:'human',basis}`
 *             and is read at draw time. `protein:` picks it up here; a caller
 *             passing `data:` asks `ProteinLib.viewOf(p)` for it. Re-aiming a
 *             protein is then an edit and a reload, not a re-bake.
 *
 *    SOLVED   FoldLib.viewBasis worked it out from the shape. That IS a
 *             measurement, so it is baked beside the extents it came with, and
 *             it is the fallback whenever nobody has chosen. See viewBasis for
 *             why a globular domain gets none.
 *
 *  A protein whose registry entry holds a chosen basis bakes NO view at all,
 *  so a page that forgets to pass one opens in the deposited frame — visibly
 *  wrong rather than subtly, and the panel's `frame` row says why.
 *
 *  `afterFrame:` runs after every render, for a page drawing over the scene —
 *  an annotate.js layer's `step()`. Orbit moves the camera without advancing
 *  anything, so a label reprojected anywhere else shears off its atom on a
 *  drag.
 *
 *  `colors:` overrides the ss palette — one number for a flat colour, or
 *  {C,H,E} for some of it, or `{byChain:{A:…,B:…}}` where what has to be told
 *  apart is which strand rather than what it is folded into. Omit it and every
 *  protein in the repo is drawn the same way, which is the default for a
 *  reason.
 *
 *  Returns kit/card-stage.js's box, so a pool's acquire / snapshot / destroy
 *  work on it unchanged, plus `drop()` (back to ribbon, release the surface),
 *  `setData(t)` (draw a different structure in the same box, keeping the
 *  camera; `setData(t, {sub})` also moves the mesh density, for a bench with
 *  a samples-per-residue slider — recreating the box to change it costs a
 *  WebGL context per drag and throws away the reader's camera), `setPocket(p)`, `focus(f)`, `setGhost(o)` and `rep` for a caller that wants to know what is
 *  showing.
 *
 *  `focus({at:[x,y,z], radius, view, ghost}, ms)` leans the camera in on a few
 *  angstroms of the structure — a binding site — keeping the angle the reader
 *  turned to, and `focus(null, ms)` gives the whole protein back. A pocket is
 *  10 A across inside a 40 A protein, so a lesson about binding that never
 *  leans in is asking a reader to see a 0.3 A move from across the room.
 *  `view` is a basis for the close-up alone, since the angle that shows a
 *  protein is rarely the angle that shows one site in it; `ghost` fades the
 *  ribbon with the move; `ms` tweens all four together, which is what says
 *  the close-up is the same molecule.
 *
 *  `setGhost(opacity)` does the fade on its own, for a page that wants it
 *  without a move. It fades the ribbon and leaves setPocket's atoms solid,
 *  which is what makes a focused view readable: the container stays visible
 *  as a container. It survives setData, because a page that walked the meshes
 *  itself would lose the fade on the next switch and not be able to tell.
 *
 *  `setPocket({atoms, bonds}, {ball})` draws the few atoms that belong INSIDE
 *  the ribbon — a heme, what is bound to its iron, the side chain a bench is about
 *  — ball-and-stick, in the structure's frame, at the proportions BALL /
 *  FE_BALL / STICK below. It returns `{group, materials}` so a lesson can fade
 *  or tint them, and it clears with the ribbon on every setData. What is IN
 *  the pocket is the baker's decision, never the box's, for the same reason
 *  the box does not parse PDB. `ball` scales the whole group, for the one case
 *  the proportions below cannot cover on their own: a metal with nothing drawn
 *  around it to be sized against.
 * ============================================================================= */
(function (global) {
  'use strict';

  /* THE METALS A DEPOSITION BRINGS. They have colours in palette.js and
     deliberately no display radius, so they are sized here as a multiple of
     carbon and stay the biggest atom in a group at whatever scale it is drawn.
     A set rather than a test for 'Fe', because the second one to arrive would
     otherwise be a grey ball the size of a carbon. */
  const METAL = new Set(['Fe', 'Co', 'Mg', 'Zn', 'Mn', 'Ni', 'Cu', 'Ca']);

  /* Coil, helix, strand — kit/ribbon-test.html's, so a card and the bench
     that tunes the ribbon are never two opinions about the same helix. */
  /* The ss palette is lib/palette.js's, not this module's — a second consumer
     (proteins/zif268, a protein and a duplex in one scene) needed the same
     three colours, and a copy is how a caption and the band it names drift.
     Every page that loads this file loads palette.js before it. */
  const RIB = MolPalette.ss;

  /* Stands for "every nucleic chain, together" in the per-frame build queue.
     A string nobody can collide with, because the queue otherwise holds chain
     ids straight out of a PDB. */
  const NA_STEP = '\u0000na';
  const SES_COLOUR = 0xdfe4ee;

  /* THE SKIN: the same SES, over the ribbon instead of instead of it.
     0.28 is hemoglobin/surface-test.html's answer to the only question the
     bench existed to settle — how faint a skin has to be for the ribbon to
     stay legible through it. Read the trap list in that page's header before
     changing any of the four material flags `applySkin` sets. */
  const SKIN_OPACITY = 0.28;

  /* ---- BALL-AND-STICK, FOR THE FEW ATOMS THAT EARN IT ----

     A ribbon is what a protein is drawn as; these are the proportions for the
     handful of atoms drawn INSIDE one — a heme, what is bound to its iron, the
     one or two side chains a bench is about. 43 atoms is a shape you can read
     at 10 A across, which is exactly what 150 residues of the same treatment
     is not, and it is how every published figure draws a porphyrin.

     SMALLER BALLS AND FATTER STICKS THAN A CLOSE-UP, deliberately, and this is
     the part that is easy to get wrong from the outside. The subject is the
     group's SHAPE seen from across a 40 A protein, not its volume: BALL shrinks
     the house radii so a porphyrin reads as a ring rather than a clump of
     touching spheres, and STICK is more than twice the house ratio because at
     that distance the house width comes out about a pixel — a cobweb, not a
     bond. They are set independently, since one is set by how far away the bond
     is seen from and the other by how much volume the ring should have.

     FE_BALL is a MULTIPLE of the shrunk carbon, never an absolute, so the iron
     stays the biggest atom in the group at any size the rest is drawn at.

     Judge them at a whole-protein framing, never zoomed in. */
  const BALL = 0.72;         // × the house display radius
  const FE_BALL = 2.7;       // × the shrunk carbon, for a metal
  const STICK = 0.36;        // × the FULL carbon radius; the house ratio is 0.165
  const INSTANCE_ABOVE = 600; // atoms; see setPocket

  let sesOwner = null;              // the one box holding a decoded surface

  /* Checked rather than assumed: a library that is not there yet shows up as an
     empty box, which reads as a module with no stage — the wrong story, and one
     nobody can see is wrong. Bare `typeof` because classic scripts share one
     global lexical scope, which is where ribbon.js's `const RibbonLib` lives:
     it is never a property of window, so `global.RibbonLib` would say missing
     on a page that has it. */
  /* PDB writes elements in upper case ('FE'); PALETTE keys them the way the
     periodic table does ('Fe'). One spelling in, one lookup out — without this
     an iron silently falls through to the default grey, which reads as a
     rendering choice rather than as a missing key. */
  function norm(el) {
    if (!el) return 'C';
    return el.length > 1 ? el[0].toUpperCase() + el.slice(1).toLowerCase()
                         : el.toUpperCase();
  }

  function missing() {
    const gaps = [];
    if (typeof THREE === 'undefined') gaps.push('three.min.js');
    if (typeof Stage === 'undefined') gaps.push('lib/scene.js');
    if (typeof CardStage === 'undefined') gaps.push('kit/card-stage.js');
    /* Only setPocket reads it, but a box created without it fails at the
       click rather than at load, which is the harder failure to place. */
    if (typeof MolLib === 'undefined') gaps.push('lib/molecules.js');
    if (typeof RibbonLib === 'undefined') gaps.push('kit/ribbon.js');
    return gaps;
  }

  /* ---- a protein by NAME ---------------------------------------------
   *  `protein:'hemoglobin'` instead of four paths. proteins/proteins.js is the
   *  one place that knows which file plays which role for a structure — the
   *  `bake` block names them, and check-proteins.js fails a role that is not on
   *  disk — so a caller reconstructing `2HHB.card.surf.bin` from a stem is
   *  standing a convention where a fact already is.
   *
   *  `variant` picks which deposition; omitted, it is the registry's default.
   *  A caller still passing explicit paths wins: hemoglobin-lab and the door
   *  map's VIEWS name files the registry has no role for, and this must not
   *  take that away from them.
   *
   *  `base` is how far the calling page sits from the repo root, because the
   *  registry's paths are repo-relative and a page in tests/ is a directory
   *  down. It is the caller's fact about itself, not the registry's.
   */
  function fromRegistry(opts) {
    if (!opts.protein) return opts;
    const lib = (typeof ProteinLib !== 'undefined' && ProteinLib)
      || (typeof global !== 'undefined' && global.ProteinLib);
    if (!lib) {
      console.warn('Proteinbox: protein:' + opts.protein + ' needs proteins/proteins.js loaded before it');
      return opts;
    }
    const p = lib.PROTEINS.find(x => x.key === opts.protein);
    if (!p) { console.warn('Proteinbox: no protein `' + opts.protein + '` in the registry'); return opts; }
    const v = opts.variant
      ? p.variants.find(x => x.id === opts.variant)
      : (p.variants.find(x => x.default) || p.variants[0]);
    if (!v) { console.warn('Proteinbox: no variant `' + opts.variant + '` of ' + opts.protein); return opts; }

    const dir = (opts.base || '') + (p.dir || p.key) + '/data/';
    const at = f => (f ? dir + f : null);
    const bake = v.bake || {};
    /* THE TRACE ROLE, not `read.baked`. They are usually the same file and for
       sickle 2HBS they are not: its `baked` is the QUATERNARY json, because
       what that entry is deposited for is a contact between tetramers and the
       card that draws it wants chains, hemes and irons rather than a backbone.
       This box draws ribbons, so it asks for the ribbon's role by name and says
       so when there is none — the alternative is fetching a file of the wrong
       shape and rendering nothing, which reads as a broken box. */
    /* TWO CONVENTIONS, and the registry means both. A protein on its own
       pipeline carries a `bake` block naming every artefact by role, so that
       block is authoritative and a variant with no `trace` role in it has no
       ribbon to draw. A protein on the shared `trace` pipeline has no `bake`
       block at all, and `read.baked` IS its trace. Reading `read.baked`
       unconditionally would hand a ribbon drawer whichever file that pipeline
       happened to call its default — a surface, a quaternary json — and the
       box would fetch the wrong shape and render nothing, which reads as a
       broken box rather than as a missing role. */
    const ribbon = v.bake ? (bake.trace || null) : (v.read && v.read.baked) || null;
    if (!opts.trace && !opts.data && !ribbon) {
      console.warn('Proteinbox: ' + opts.protein + ' ' + v.id
        + ' has no `trace` role to draw — the registry bakes it for '
        + (Object.keys(bake).join(', ') || 'nothing') + '. Name a path if you meant one of those.');
    }
    return Object.assign({}, opts, {
      trace:   opts.trace   || at(ribbon),
      surface: opts.surface || at(bake.card),
      fold:    opts.fold    || at(bake.fold),
      chains:  opts.chains  || v.chains,
      /* THE ROTATION A HUMAN CHOSE, read here rather than baked. A caller
         passing `data:` instead of a key does the same with
         `ProteinLib.viewOf(p)`; the bake's own `view`, where it has one, is
         the solved fallback under both. */
      view:    opts.view    || (lib.viewOf ? lib.viewOf(p) : null),
    });
  }

  function create(rawOpts) {
    const gaps = missing();
    if (gaps.length) {
      console.warn('Proteinbox needs ' + gaps.join(', ') + ' loaded before it');
      return null;
    }
    const opts = fromRegistry(rawOpts);

    const mount = opts.mount;
    let radius = 0, player = null, surf = null, rep = 'ribbon', seeded = false;
    /* The decoded surface, kept because everything painted onto the skin is a
       lookup through its per-vertex `res`. Held beside the mesh rather than
       inside showSurface's closure so paintSkin/patch can be called before the
       bytes land — both record what was asked for and apply it on arrival. */
    let surfS = null, skinPaint = null, surfGen = 0, paintGen = 0;
    /* DECODED SURFACES, BY URL. An A/B between two structures asks for two
       meshes over and over, and fetching + decoding + re-uploading 60 000
       vertices on every press is a hitch no amount of ordering hides — which
       is exactly what hemoglobin/surface-test.html avoids by holding both
       meshes and toggling visibility. Holding the decoded `S` gets the same
       result through one code path: the geometry object is already on the GPU,
       so re-installing it uploads nothing.

       BOUNDED, because this is the memory `sesOwner` rations across boxes and
       an unbounded map inside one box would walk around it. Two is what an A/B
       needs; a page cycling more than that pays the fetch. */
    const decoded = new Map();
    const DECODED_MAX = 2;
    /* BUILT RIBBONS, BY STRUCTURE. Same argument as `decoded` one level up:
       a chain of haemoglobin is 27 ms of spline and tube, so a four-chain
       switch is 108 ms of geometry the box has already built once. An A/B
       rebuilds the same two structures forever.

       KEYED ON WHAT THE GEOMETRY DEPENDS ON and nothing else — the bake's own
       `source`, the chains drawn, and the mesh density. Colour is a material
       swap and the view is a quaternion on the group, so neither belongs in
       the key: cache on those and an A/B that also recolours would miss every
       time and be slower than no cache at all. */
    const builtRibbons = new Map();
    const RIBBONS_MAX = 2;
    const patches = new Map();
    /* THE PALETTE IN FORCE, held at box scope rather than inside setData.
       The chain loop builds one chain per frame, so a build is usually still
       running when anything else happens; if it closed over the materials it
       started with, a setColors mid-build would repaint the chains that exist
       and the loop would go on adding the rest in the OLD colours. Both write
       here and the loop reads it per mesh, so the last word wins whenever it
       was said. */
    let paint = { mats: null, byChain: null };
    /* HALF-EXTENTS ACROSS AND UP, beside the radius, and only the ribbon has
       them. A sphere is the right frame for a globular protein and the wrong
       one for a rod: one collagen molecule is 3016 Å by 55, and framed on its
       circumscribing radius the camera pulls back until the molecule is 1/60
       of the height — a hairline in the middle of an empty stage. scene.js's
       frame() already solves per axis; this is what lets it. Null falls back
       to the radius, which is what the surface and the fold still give. */
    let stillHX = 0, stillHY = 0;
    /* THE POINTS THEMSELVES, kept so the framing can be solved EXACTLY rather
       than from half-extents. A perspective frustum widens with depth, and
       `Stage.frame` solves the two on-screen axes at the content's middle
       plane — right for everything else it frames, which is flat (a row of
       molecules is a few ångströms deep), and wrong for a protein, which is as
       deep as it is wide. Whatever is nearest the camera is magnified past the
       edge: lysozyme overflowed by 19% under a rotation a human had chosen
       precisely so the cleft would face the reader, and myoglobin by 4% on
       its own.

       IT IS SOLVED HERE AND NOT THERE because the answer needs the POINTS.
       Standing back by the half-depth assumes the bounding corner is occupied
       and pulled lysozyme back 46%, leaving it at 60% of the stage — framing
       badly in the other direction. Treating the item as an ellipsoid closes
       the form and is tighter, and still cropped myoglobin, whose shape is not
       an ellipsoid. No summary of a point cloud answers this for every protein
       in the repo; the cloud does, it is a thousand points, and this module is
       the only caller that has one. So `Stage.frame`'s own solve stays the
       floor and the exact requirement is passed as `min`. */
    let stillPts = [], stillRaw = [];
    /* Bumped by every setData. The chain loop below yields to rAF between
       chains, so a switch that lands mid-build leaves the OLD loop running:
       it keeps adding meshes to a group the new call already cleared, and
       keeps widening the centre and radius with points nobody is drawing —
       a ten-rung stack framing a single chain. The loop checks the token it
       started with and stops when it is no longer the current one. */
    /* TWO BUILD TOKENS, NOT ONE. A build aborts when a newer one has started —
       and a preload is not newer, it is a different queue entirely. Sharing
       one counter made each cancel the other: the preload killed the ribbon
       the reader was waiting for, and the next display killed the preload,
       so both structures ended up half built. Preload tokens are negative, so
       a generation can never collide with a display's, which matters because
       `sweepOld` decides visibility by comparing them. */
    let generation = 0, preGeneration = 0;

    /* MESH DENSITY, WHICH A BENCH MAY CHANGE WITHOUT REBUILDING THE BOX.
       `opts.sub` is the page's standing answer; `setData(t, {sub})` overrides
       it for one structure. It is a variable rather than a read of `opts`
       because a bench with a samples-per-residue slider would otherwise have
       to destroy and recreate the box to move it — a WebGL context per drag,
       and the reader's camera thrown away each time. */
    let subNow = opts.sub == null ? 6 : opts.sub;
    let stillMid = null, stillR = 0, foldR = 0;

    /* WHERE THE CAMERA IS POINTED, when it is not pointed at the whole
       structure. `box.focus({at, radius})` frames a few angstroms of one — a
       binding site — and null returns to the ribbon's own framing. It is kept
       across setData ON PURPOSE: a page showing four states of one site
       switches the file and means to stay where it was looking, and re-aiming
       after every switch is how the camera jumps. */
    let focused = null;

    /* THE BASIS CURRENTLY ON THE CHAIN GROUP, which is not always the one the
       trace or the registry declared: a focused view can ask for its own — the
       site is not necessarily best seen from the angle the whole protein is.
       Null means the structure's own. */
    let viewNow = null;
    let viewDeclared = null;

    /* The one tween. Rotation, distance, centre and the ghost move together or
       the switch reads as three separate things happening to one picture. */
    let tween = null;

    /* AN ORTHO CAMERA DOES NOT ZOOM BY MOVING: its size is its frustum, so a
       cam.r written straight onto the camera does nothing and the protein is
       drawn against THREE's constructor frustum, top = 1 — a 33 A molecule in a
       2 A frame, which fills the box with one lobe of one helix. Stage.frame's
       ortho branch writes the frustum and leaves cam.r alone, so the answer is
       read back, or the first wheel event jumps the card. Same shape as
       molbox's fit() and the same reason; it re-runs from onResize because the
       aspect it solved against is gone the moment a card grows. */
    /* THE NEAREST FACE IS WHAT HAS TO FIT. For a point at (x,y,z) relative to
       the framed centre, a perspective camera at distance d shows it inside
       the frustum when |x| <= (d - z)·tan·aspect, so that point alone needs
       d >= z + |x|/(tan·aspect), and the same in y without the aspect. The
       answer is the largest of those over everything drawn — exact, with no
       assumption about the shape.

       IT IS SOLVED PER fit() AND NOT ONCE, because tan and aspect are the
       camera's and the aspect changes with the pane: a value cached at build
       time is right until a reader resizes, which is the kind of wrong that
       only appears on someone else's screen. The ribbon is wider than the
       trace it splines through, and the pad is what covers that.

       Returns 0 before there is anything to measure, which is what `min` was
       before this and leaves Stage.frame's own answer standing. */
    const needed = () => {
      /* A FOCUSED CAMERA IS DELIBERATELY TOO CLOSE. This solves the distance
         at which everything drawn is inside the frustum, which is the right
         answer for a whole protein and the exact opposite of what a pocket
         view asks for. */
      if (focused) return 0;
      if (rep !== 'ribbon' || !stillPts.length || !stillMid) return 0;
      if (box.camera.isOrthographicCamera) return 0;   // no widening with depth
      const tan = Math.tan(box.camera.fov * Math.PI / 360);
      const asp = box.camera.aspect;
      if (!tan || !asp || !isFinite(asp)) return 0;
      let need = 0;
      for (const p of stillPts) {
        const x = p.x - stillMid.x, y = p.y - stillMid.y, z = p.z - stillMid.z;
        const dx = z + Math.abs(x) / (tan * asp);
        const dy = z + Math.abs(y) / tan;
        if (dx > need) need = dx;
        if (dy > need) need = dy;
      }
      return need * (opts.pad || 1.12);
    };

    const fit = () => {
      if (!radius || !mount.clientWidth || !mount.clientHeight) return;
      box.stage.resize();
      /* NO HOUSE CLAMP ON THE SOLVE. Stage.frame's own min/max default to
         6-220 ångströms, which is the range a molecule stage lives in and
         has nothing to say about a protein whose radius was MEASURED off
         its own coordinates. One whole collagen molecule is 3016 Å end to
         end and frames at ~2500: clamped to 220 it opens showing a tenth of
         itself, off both edges, with nothing on screen saying so. The clamp
         that matters is the zoom one below, and it is set from the answer. */
      /* THE STILL HALF-WIDTHS ARE THE WHOLE STRUCTURE'S, so a focused camera
         has to ignore them: framing 11 A of a protein against the 40 A box it
         sits in solves for the box and leans in by nothing. */
      const hx = focused ? radius : (rep === 'ribbon' && stillHX ? stillHX : radius);
      const hy = focused ? radius : (rep === 'ribbon' && stillHY ? stillHY : radius);
      Stage.frame(box.camera, box.cam,
                         [{ x: 0, y: 0, rxz: hx, hy: hy }],
                         { pad: opts.pad || 1.12, min: needed(), max: Infinity });
      if (box.camera.isOrthographicCamera) box.cam.r = box.camera.top;
      /* THE ZOOM CLAMP FOLLOWS THE FRAMING, because scene.js's default is a
         fixed 5-60 and a protein's size is not: 1DFJ frames at 63 and every
         wheel event then clamped it to 60, so the box opened at a distance the
         reader could never get back to and read as stuck. Anchored to the
         distance just solved — a fifth of it is inside the molecule, three
         times it is the structure small in the frame — so a 124-residue
         monomer and a 580-residue complex both zoom the same amount. */
      if (box.stage.setZoomLimits)
        box.stage.setZoomLimits(box.cam.r * 0.2, box.cam.r * 3);
      /* THE FAR PLANE FOLLOWS TOO. scene.js builds the camera for a molecule
         stage and stops it at 1000, which is past anything in this repo until
         a structure is 3000 Å long: the camera then stands correctly at 4200
         and draws nothing at all, which reads as a bake that failed rather
         than as a frustum. Solved from the standing distance plus the widest
         the reader can zoom out to, which is the 3x above. */
      const far = Math.max(1000, box.cam.r * 6);
      if (box.camera.far < far) { box.camera.far = far; box.camera.updateProjectionMatrix(); }
      box.applyCam();
    };

    const box = CardStage.create({
      mount,
      viewOffset: opts.viewOffset,
      cam: { theta: 0.6, phi: 1.1, r: 40 },
      /* orbit:false by default — on a map, a drag on this canvas is a drag on
         the card, and a molecule that spins under the pointer leaves a reader
         who meant to move the card with no way back to the framing it was
         composed with. A page that wants the turn passes orbit:true. */
      stage: Object.assign({ ortho: true, orbit: opts.orbit === true },
                           opts.stage || {}),
      autoplay: false,                 // a still ribbon has nothing to run
      step: dt => { tickTween(dt); if (player && rep === 'fold') player.tick(dt); },
      /* PASSED STRAIGHT THROUGH, the same hook molbox draws its leader in.
         Anything drawn OVER the scene in CSS pixels — an annotate.js layer —
         has to reproject after the camera the frame was rendered with, and
         orbiting moves that camera without advancing anything, so a page
         cannot do it from `step`. */
      afterFrame: opts.afterFrame,
      onResize: fit,
      onDestroy: () => { if (sesOwner === box) sesOwner = null; },
    });
    /* True while chains are still queued, one per frame — see the "One chain
       per frame" note in setData below. A caller that needs the WHOLE
       structure before it acts (a thumbnail bake snapshotting the canvas)
       polls this instead of guessing how many frames a given entry needs.
       Set here, before `opts.data` can trigger the first setData call below,
       so that call's own flip to `true` is never clobbered by this default. */
    box.building = false;

    /* Two groups, never both visible. The trajectory is in FoldLib.orient()'s
       frame and the trace is in the crystal's, so they are not the same
       molecule in the same place; the box re-centres on whichever is showing,
       which is what makes drawing them from two frames legal. */
    const chainGroup = new THREE.Group();
    const foldGroup = new THREE.Group();
    /* THE SKIN TURNS WITH THE RIBBON OR IT IS NOT A SKIN. `view` puts a basis
       on the chain group, and the surface used to hang off box.root — which
       never showed, because ribbon and surface were mutually exclusive reps
       and nobody ever saw both at once. Draw them together and a structure
       with a declared view wears its own surface rotated off it. Its own group
       rather than parenting into chainGroup, because setData clears that one
       and the surface outlives a rebuild. `syncSkin` is the copy, and it is
       called from wherever that quaternion is written. */
    const skinGroup = new THREE.Group();
    /* Inside the chain group, not beside it: a pocket is measured in the same
       ångströms as the trace and has to wear the same presentation `view`, or
       a heme keeps the crystal's orientation while the protein turns. */
    const pocketGroup = new THREE.Group();
    chainGroup.add(pocketGroup);
    box.root.add(chainGroup, foldGroup, skinGroup);

    /* ---- the ribbon ----

       TWO WAYS IN, ONE SHAPE OF DATA. `trace:` fetches a bake-trace.js file;
       `data:` hands the same object over directly, already parsed. A page
       whose coordinates arrive as something else — a PDB it reads with its
       own module, a format nobody has written yet — parses it however it
       likes and calls setData().

       The box deliberately does NOT learn to read those formats. Parsing
       carries decisions this file has no business making (which altloc, which
       chain, whether secondary structure is read or detected), and every page
       that owns a protein already owns them. What is shared here is the box:
       the scene, the camera, the framing and the turn. */
    const palOf = v => v == null ? RIB
      : (typeof v === 'number' ? { C: v, H: v, E: v }
                               : Object.assign({}, RIB, v));
    const matsOf = pal => [pal.C, pal.H, pal.E].map(v => {
      const m = Stage.bondMat(v);
      m.side = THREE.DoubleSide;
      return m;
    });

    /* The materials one `colors` argument asks for: one set for the chains it
       does not name, and one per chain it does. Lifted out of setData so a
       recolour can build exactly what a rebuild would have. */
    function materialsFor(c) {
      const base = c && c.byChain ? Object.assign({}, c, { byChain: undefined }) : c;
      const p = {
        mats: matsOf(palOf(base)),
        byChain: c && c.byChain
          ? Object.fromEntries(Object.entries(c.byChain)
              .map(([id, v]) => [id, matsOf(palOf(v))])) : null,
      };
      /* A GHOST IS A PROPERTY OF THE BOX, NOT OF THE MESHES ON SCREEN, which
         is the whole reason it is applied here. setData clears the chain group
         and rebuilds a chain per frame, so anything a page did by walking the
         meshes is undone by the next switch — and undone invisibly, because
         the page's call succeeded against an empty group. */
      applyGhost(p);
      return p;
    }

    /* ---- setGhost(opacity) ----

       Fade the RIBBON, so what is drawn inside it can be seen. A pocket view
       puts the camera inside the protein, where an opaque ribbon is a wall
       across the picture; at 0.15 or so the helices still say what the site is
       buried in without hiding it. setPocket's atoms are never touched — they
       are the subject.

       Takes an opacity, or 0 / nothing for solid. Survives setData. */
    let ghost = 0;
    function applyGhost(p) {
      const on = ghost > 0;
      const all = (p.mats || []).concat(
        Object.values(p.byChain || {}).reduce((a, b) => a.concat(b), []));
      for (const m of all) {
        m.transparent = on;
        m.opacity = on ? ghost : 1;
        /* Off while ghosted, so the far wall of the pocket shows through the
           near one. A transparent mesh that still writes depth hides whatever
           is behind it and reads as a hole in the protein. */
        m.depthWrite = !on;
      }
    }
    box.setGhost = function setGhost(v) {
      ghost = v || 0;
      applyGhost(paint);
      box.draw();
    };

    /* ---- setColors(colors) ----

       REPAINT WHAT IS ALREADY DRAWN, without rebuilding it. The same argument
       setData takes, applied to the meshes that are on screen:

         box.setColors({ byChain: { A: 0x1f5f4f, B: 0x9aa0a6 } })

       WHY THIS IS NOT setData WITH THE SAME TRACE. Rebuilding 28 chains of
       ribbon is a spline and a tube per segment, and the box deliberately
       builds a chain per frame so the page does not stall — which means a
       structure the reader is already looking at visibly reassembles itself,
       chain by chain, to change nothing but its colour. It also throws away
       the pocket, the framing and anything a page had parented into the chain
       group. A palette is not a model, and swapping one should not cost a
       model's worth of work.

       Meshes are found by the `userData.chain` they were tagged with, and
       anywhere under the chain group — a page that has re-parented some of
       them (a subassembly it turns) still gets them all. */
    /* A CHAIN KEYED `<copy>.<chain>` FALLS BACK TO `<chain>`. A symmetry
       assembly too big for one-letter ids (a virus capsid, 240 chains) is
       baked with its copies keyed that way, and a colour for the asymmetric
       unit's chain is a colour for every copy of it. */
    function chainPaint(p, cid) {
      if (!p.byChain || cid == null) return undefined;
      const k = String(cid);
      return p.byChain[k] || (k.includes('.') ? p.byChain[k.slice(k.indexOf('.') + 1)] : undefined);
    }

    function setColors(colors) {
      paint = materialsFor(colors);
      chainGroup.traverse(m => {
        const cid = m.userData && m.userData.chain;
        if (cid === undefined || !m.isMesh) return;
        m.material = chainPaint(paint, cid) || paint.mats;
      });
      box.draw();
    }

    /* HIDE WHAT IS NOT THIS GENERATION, and dispose nothing. A mesh out of
       sight is one this box may show again in a frame's time; the only thing
       that frees a ribbon is eviction from `builtRibbons`.

       `keep:true` is what decides WHEN this runs, not whether: with it the old
       structure stays visible until the new one is whole, without it the swap
       happens before the first new chain lands. Either way the sweep is the
       same, which is why it is one function. */
    function sweepOld(mine) {
      for (const m of chainGroup.children) {
        const g = m.userData && m.userData.gen;
        if (g === undefined || g === mine) continue;   // the pocket, or a page's own
        m.visible = false;
      }
    }

    /* Keep a built structure, oldest out. Two is an A/B's working set; a page
       cycling more than that pays the build, which is what it paid before. */
    function remember(key, meshes, raw) {
      if (!meshes.length) return;
      builtRibbons.set(key, { meshes, raw: raw.map(v => v.clone()) });
      while (builtRibbons.size > RIBBONS_MAX) {
        const [k, old] = builtRibbons.entries().next().value;
        for (const m of old.meshes) { chainGroup.remove(m); m.geometry.dispose(); }
        builtRibbons.delete(k);
      }
    }

    function setData(t, o) {
      o = o || {};
      if (o.sub != null) subNow = o.sub;
      /* ---- `keep`: LEAVE THE OLD RIBBON UP UNTIL THE NEW ONE IS WHOLE ----

         Chains go in one per frame, so clearing first means the reader watches
         the molecule reassemble itself — which is fine on a card changing
         subject and wrong on an A/B, where the entire claim is that NOTHING
         MOVED. A gap or a reassembly in the middle of that claim is the page
         contradicting itself.

         So `keep:true` tags the incoming meshes with this generation and
         sweeps the previous ones only once the queue has drained. Both
         structures are drawn for those few frames, which is why it is opt-in:
         superposed structures a residue apart overlap invisibly, two unrelated
         proteins would flash as a double image. The caller knows which it has.

         The pocket is cleared either way and immediately — it is a handful of
         atoms drawn INSIDE the ribbon, so a stale heme is not hidden under the
         new molecule, it is inside it. */
      const mine = o.preload ? -(++preGeneration) : ++generation;
      /* A PRELOAD BUILDS AND SHOWS NOTHING. Everything below that touches what
         is currently on screen — the pocket, the palette, the view, the
         framing, the sweep — is skipped, so preloading the other half of an
         A/B cannot be seen or felt from the half being looked at. */
      const pre = !!o.preload;
      const keepOld = !pre && !!o.keep && chainGroup.children.length > 1;
      if (!keepOld && !pre) {
        /* Hide rather than clear: what is in here may be a cached structure
           this box will show again, and removing it is what would make the
           cache re-upload every buffer it just saved. Eviction is the one
           place a ribbon's geometry is disposed. */
        for (const m of chainGroup.children) if (m !== pocketGroup) m.visible = false;
      }
      /* The pocket belongs to the structure that was just replaced, so it goes
         with it — cleared and re-parented empty rather than left holding the
         previous molecule's heme inside the next one's ribbon. */
      if (!pre) {
        pocketGroup.clear();
        if (!chainGroup.children.includes(pocketGroup)) chainGroup.add(pocketGroup);
      }
      const ids = (o.chains || opts.chains)
        ? String(o.chains || opts.chains).split(',') : t.order.slice();

      /* Cache hit: everything below this is the build, and none of it has to
         run. The framing is re-solved from the points that were kept with the
         meshes, since a view may have changed under them. */
      const ribKey = (o.key || t.source || '?') + '|' + ids.join(',') + '|' + subNow;

      /* Colour. Default is the ss palette, which is the point of drawing every
         protein in the repo the same way. A page that colours by something
         else — a state, a mutation, a chain — passes `colors`, and one colour
         means all three. */
      const c = o.colors || opts.colors;
      /* ONE SET, OR ONE PER CHAIN. `byChain` is the case the ss palette cannot
         serve: where what a reader has to tell apart is WHICH STRAND, not what
         it is folded into. Collagen is why it exists — three chains wound
         around each other, no HELIX or SHEET records in any collagen file, so
         the default palette draws the braid as one green rope and the thing
         the structure is famous for is invisible. A chain the map does not
         name falls back to the palette beside it. */
      // A preload draws in the palette already in force; assigning here would
      // repaint the structure the reader is looking at.
      const mats = pre ? paint : (paint = materialsFor(c));

      /* THE PRESENTATION FRAME, applied to the GROUP and not to the camera.

         A deposited protein opens in a crystal or EM frame, which is nobody's
         decision about how it should be seen; `view` is the basis a bake
         solved for it, or a human picked. Same split scene.js makes for a
         molecule spec: the frame belongs to the structure, the camera belongs
         to the reader, and composing the two anywhere else is the Euler trap
         that made molecules cartwheel.

         WHICH LEAVES THE PAGE ONE OBLIGATION, also scene.js's: the group's
         rotation is an OFFSET and must be ZERO AT REST, or the declared view
         is one nobody ever sees while the file still claims it. */
      const view = o.view || opts.view || t.view;
      if (!pre) {
      viewDeclared = view || null;
      chainGroup.quaternion.identity();
      /* A FOCUS OUTLIVES A SWITCH, and so does the angle it asked for: a page
         showing four states of one site sets the framing once and means to
         stay there while the file underneath changes. */
      viewNow = focused && focused.view ? focused.view : (view || null);
      if (viewNow) {
        /* A VIEW BASIS IS RELATIVE TO A CANONICAL CAMERA, and saying "shortest
           axis into the screen" means nothing unless the screen is down that
           axis. The box's default camera stands off at an angle, which is
           right for a card with no declared view and wrong the moment there
           is one: the frame gets solved and then looked at obliquely, so a
           rung one molecule thick still reads as a tilted squiggle.

           FIRST DATA ONLY. After that the camera is the reader's, and a
           switch between structures must not snap away the turn they just
           made — the reason this box is re-fed rather than rebuilt. */
        if (!seeded) {
          box.cam.theta = 0;
          box.cam.phi = Math.PI / 2;
          if (box.cam.seed) box.cam.seed();
          seeded = true;
        }
        chainGroup.setRotationFromMatrix(new THREE.Matrix4().set(
          viewNow[0][0], viewNow[0][1], viewNow[0][2], 0,
          viewNow[1][0], viewNow[1][1], viewNow[1][2], 0,
          viewNow[2][0], viewNow[2][1], viewNow[2][2], 0,
          0, 0, 0, 1));
      }
      }

      const hitRib = builtRibbons.get(ribKey);
      if (hitRib && pre) return;                 // already built: nothing to do
      if (hitRib) {
        for (const m of hitRib.meshes) {
          m.visible = true;
          m.userData.gen = mine;
          m.material = chainPaint(paint, m.userData.chain) || paint.mats;
          if (m.parent !== chainGroup) chainGroup.add(m);
        }
        // Re-inserted so the map's order is use order, not first-build order.
        builtRibbons.delete(ribKey); builtRibbons.set(ribKey, hitRib);
        sweepOld(mine);
        solveStill(hitRib.raw.map(v => v.clone()));
        applyGhost(paint);
        box.draw();
        return;
      }

      const drawn = [];
      const madeMeshes = [];

      /* THE NUCLEIC CHAINS GO IN ONE STEP, NOT ONE PER FRAME, and the reason
         is that a rung is CROSS-CHAIN: a base pair joins two backbones, so
         there is no such thing as drawing one strand of a duplex on its own.
         `NucleicLib.build` takes the whole trace for that reason, so the queue
         carries a single sentinel standing for all of them. A duplex is ~2k
         triangles and the nucleosome's 292 nucleotides about 25k — one
         frame's work either way, which is what makes the sentinel affordable.

         Anything without `kind:'na'` is a protein: every bake written before
         2026-08-31 has no `kind` at all, and a Ca trace is the only thing
         `assemble` has ever produced. */
      const naIds = ids.filter(id => t.chains[id] && t.chains[id].kind === 'na');
      const queue = ids.filter(id => !(t.chains[id] && t.chains[id].kind === 'na'));
      if (naIds.length) queue.push(NA_STEP);
      if (!pre) box.building = true;

      /* One chain per frame. A tetramer is ~80k triangles and building all
         four in the frame the trace lands is a visible stall on a page that
         is usually animating something when it arrives. */
      const build = () => {
        const cid = queue.shift();
        if (cid === undefined || box.dead
            || mine !== (pre ? -preGeneration : generation)) return;
        if (cid === NA_STEP) drawNucleic(t, naIds, drawn, mine, madeMeshes);
        const ch = cid === NA_STEP ? null : t.chains[cid];
        if (ch) {
          for (const seg of runs(ch)) {
            if (seg.CA.length < 4) continue;   // RibbonLib needs a spline's worth
            const pts = seg.CA.map(p => new THREE.Vector3(p[0], p[1], p[2]));
            /* Centre and radius are solved in the frame the reader will see,
               so `drawn` carries the rotated points. Measuring the raw ones
               centres the box on where the molecule USED to be, which reads
               as a framing bug rather than as a missing rotation. */
            drawn.push(...pts.map(v => v.clone()));
            const mesh = new THREE.Mesh(
              RibbonLib.build(THREE, pts, seg.ss, { sub: subNow }),
              chainPaint(mats, cid) || mats.mats);
            /* WHICH CHAIN THIS MESH CAME FROM, and nothing more. A page that
               has to move PART of a structure — one subassembly of a machine,
               against the rest of it — cannot otherwise find its meshes: they
               go in one at a time across frames, several segments to a chain,
               and by the time a caller looks they are an anonymous pile. This
               records the fact; what a page does with it stays the page's, the
               same refusal this box makes about parsing. */
            mesh.userData.chain = cid;
            mesh.userData.gen = mine;
            mesh.visible = !pre;
            madeMeshes.push(mesh);
            chainGroup.add(mesh);
          }
          /* The trace is centred on every chain it HOLDS, so a box drawing
             one of four would sit off to the side. Re-centre on what is
             actually drawn, and re-solve after each — every chain changes
             both the centre and the radius. */
          if (drawn.length && !pre) solveStill(drawn);
          if (!pre) box.draw();
        }
        /* rAF NEVER FIRES IN A HIDDEN TAB, and a chain-per-frame build then
           stops partway: the box keeps whatever it had drawn, which on a
           ten-rung stack is a fibril missing most of itself. Anything that
           renders a page without showing it — an automated screenshot, a
           thumbnail capture, a background tab a reader left open — lands
           there. setTimeout is throttled in that state but it does run, so
           the build finishes either way. */
        if (cid === NA_STEP && drawn.length) {
          /* The nucleic step re-solves the framing the same way a chain does;
             it is outside the `if (ch)` above because there is no single chain
             to hang it off. */
          if (!pre) { solveStill(drawn); box.draw(); }
        }
        if (queue.length) {
          if (typeof document !== 'undefined' && document.hidden) setTimeout(build, 0);
          else requestAnimationFrame(build);
        } else {
          /* The queue has drained: the new structure is whole. Keep it, and
             put the old one out of sight. */
          remember(ribKey, madeMeshes, drawn);
          if (pre) { warmGeo(madeMeshes.map(m => m.geometry)); return; }
          box.building = false;
          sweepOld(mine);
          box.draw();
        }
      };
      build();
    }

    /* ---- THE NUCLEIC BRANCH ----------------------------------------------
     *
     *  DNA and RNA, drawn as kit/nucleic.js's ladder — a backbone ribbon per
     *  strand and one rung per base pair, split at its own hydrogen bonds with
     *  each half in its base's colour. Why a joined rung rather than the two
     *  facing stubs every published viewer draws: that module's header, and
     *  docs/rendering-modules.md.
     *
     *  IT IS THE SAME BOX AND THE SAME SCALE. Both polymers are real angstroms
     *  out of one deposition, which is what lets a protein and a duplex share
     *  a stage at all (MolecularGeometry.md 1.5) — and a mixed bake centres
     *  them on ONE vector solved over both, so nothing here has to reconcile
     *  two frames. `proteins/zif268/` is the worked example.
     *
     *  COLOUR IS THE PALETTE'S AND NOT AN ARGUMENT. `colors` is the ss palette
     *  for a ribbon and means nothing to a base; a page that wants to say
     *  something with the colour of a nucleotide is saying something this box
     *  has no opinion about, and can draw it itself. `byChain` IS honoured for
     *  the backbones, because "which strand" is the one thing a caller might
     *  legitimately need to override — collagen's reason, one polymer over.
     */
    function drawNucleic(t, ids, drawn, gen, made) {
      if (typeof NucleicLib === 'undefined') {
        console.warn('Proteinbox: this trace has nucleic chains and '
          + 'kit/nucleic.js is not loaded — load it after kit/ribbon.js');
        return;
      }
      const parts = NucleicLib.build(THREE, t, { chains: ids, sub: subNow });

      const q = chainGroup.quaternion;
      const keep = geo => {
        /* Same rule the ribbon follows: `drawn` carries the structure's OWN
           points, and solveStill turns them into the frame the reader sees.
           Keeping them raw is what lets a view change re-solve the framing
           without rebuilding the ribbon. */
        const a = geo.attributes.position.array;
        for (let i = 0; i < a.length; i += 3)
          drawn.push(new THREE.Vector3(a[i], a[i + 1], a[i + 2]));
      };

      parts.strands.forEach((sd, i) => {
        const over = chainPaint(paint, sd.id);
        const mesh = new THREE.Mesh(sd.geo, over ? over[0]
          : naMat('strand:' + i, MolPalette.strands[i % 2 ? 'b' : 'a']));
        mesh.userData.chain = sd.id;
        mesh.userData.gen = gen;
        made.push(mesh);
        chainGroup.add(mesh);
        keep(sd.geo);
      });
      for (const bag of [parts.rungs, parts.stubs])
        for (const b of Object.keys(bag)) {
          const m = new THREE.Mesh(bag[b], naMat('base:' + b,
            MolPalette.bases[b] === undefined ? MolPalette.bases.X
                                              : MolPalette.bases[b]));
          /* Tagged like a ribbon chain: `keep` sweeps by generation, and an
             untagged mesh is one it will never remove. */
          m.userData.gen = gen;
          made.push(m);
          chainGroup.add(m);
          keep(bag[b]);
        }
    }

    /* Cached per box, like `paint` — a rebuild reuses them, and a box that
       dies takes them with it. */
    const naMats = {};
    const naMat = (key, color) => (naMats[key] = naMats[key]
      || Object.assign(Stage.bondMat(color), { side: THREE.DoubleSide }));

    /* A chain is drawn as one ribbon per CONSECUTIVE RUN of residues. Without
       `nums` a trace cannot say where it breaks, so it is treated as
       contiguous — which is what every trace baked before bake-trace.js
       started writing them says, and the honest reading of a file that does
       not carry the information. */
    function runs(ch) {
      const n = ch.ss.length, ss = ch.ss;
      if (!ch.nums) return [{ CA: ch.CA, ss: ss.split('') }];
      const out = [];
      let from = 0;
      for (let i = 1; i <= n; i++) {
        if (i === n || ch.nums[i] !== ch.nums[i - 1] + 1) {
          out.push({ CA: ch.CA.slice(from, i), ss: ss.slice(from, i).split('') });
          from = i;
        }
      }
      return out;
    }

    if (opts.data) setData(opts.data);
    else if (opts.trace) {
      fetch(opts.trace)
        .then(r => r.json())
        .then(t => { if (!box.dead) { setData(t); if (opts.onData) opts.onData(t); } })
        /* Loud, not silent. A swallowed catch here is a box that shows its
           placeholder for ever and looks exactly like a module with no stage
           yet — the one failure this file can produce that nobody can see. */
        .catch(e => console.warn('Proteinbox: ' + opts.trace + ' — ' + e.message));
    }

    /* THE FRAMING, SOLVED IN THE FRAME THE READER SEES. The points arrive in
       the structure's own coordinates and are turned by whatever basis is on
       the chain group, so this is what a view change re-runs — measuring the
       raw ones centres the box on where the molecule USED to be, which reads
       as a framing bug rather than as a missing rotation. */
    function solveStill(raw) {
      if (raw) stillRaw = raw;
      if (!stillRaw.length) return;
      const q = chainGroup.quaternion;
      stillPts = stillRaw.map(v => v.clone().applyQuaternion(q));
      stillMid = stillPts.reduce((acc, p) => acc.add(p), new THREE.Vector3())
                         .multiplyScalar(1 / stillPts.length);
      stillR = stillHX = stillHY = 0;
      for (const p of stillPts) {
        stillR = Math.max(stillR, p.distanceTo(stillMid));
        stillHX = Math.max(stillHX, Math.abs(p.x - stillMid.x));
        stillHY = Math.max(stillHY, Math.abs(p.y - stillMid.y));
      }
      syncSkin();
      /* The surface too: it is the ribbon's molecule half an ångström out, and
         a box switched to it before its chains landed was otherwise left at
         the default distance, inside the protein. */
      if (rep === 'ribbon' || rep === 'skin' || rep === 'surface') reframeStill();
    }

    /* A BASIS ONTO THE CHAIN GROUP, and the framing re-solved after it. Null
       is the structure's own declared view, which is what focus(null) goes
       back to. */
    function applyView(basis) {
      viewNow = basis || null;
      chainGroup.quaternion.identity();
      if (viewNow) chainGroup.setRotationFromMatrix(new THREE.Matrix4().set(
        viewNow[0][0], viewNow[0][1], viewNow[0][2], 0,
        viewNow[1][0], viewNow[1][1], viewNow[1][2], 0,
        viewNow[2][0], viewNow[2][1], viewNow[2][2], 0,
        0, 0, 0, 1));
      solveStill();
    }

    function reframeStill() {
      if (!stillMid) return;
      /* THE FOCUS SURVIVES A REBUILD, which is the whole reason it is checked
         here rather than only in focus(): a chain goes in one frame at a time
         and re-solves the framing after each, so a focus applied once would be
         thrown away by the next chain to land. */
      if (focused) { aimAtFocus(); return; }
      box.root.position.copy(stillMid).negate();
      radius = stillR;
      fit();
    }

    function aimAtFocus() {
      /* The point arrives in the structure's own coordinates — a baker's, the
         same ones setPocket takes — and the reader sees the ROTATED frame, so
         it is turned by the chain group's quaternion the way the ribbon points
         are. Without that the camera lands where the site used to be, which
         reads as a framing bug rather than as a missing rotation. */
      const p = new THREE.Vector3(focused.at[0], focused.at[1], focused.at[2])
        .applyQuaternion(chainGroup.quaternion);
      box.root.position.copy(p).negate();
      radius = focused.radius;
      fit();
    }

    /* ---- focus(f, ms) ----

       `box.focus({ at:[x,y,z], radius, view, ghost }, ms)` puts the camera a
       few angstroms from one part of a structure; `box.focus(null, ms)` gives
       the whole thing back. `view` is an optional basis for the close-up,
       because the angle that shows a protein is rarely the angle that shows
       one site inside it, and `ghost` fades the ribbon along with the move.

       THE READER'S OWN TURN IS KEPT: the camera's theta and phi are never
       touched here. What moves is the centre, the distance, the structure's
       own basis and the ribbon's opacity.

       ms TWEENS ALL FOUR AT ONCE, and that is the point of doing it in the box
       rather than in a page. A camera that jumps has no way of saying that the
       close-up is the SAME molecule; one that leans in says it without a word
       of copy. Four separate animations would say it four times, slightly out
       of step. Omit ms and it snaps, which is right for a first draw.

       Nothing about which part is worth looking at is the box's business, the
       same refusal it makes about what is in the pocket: the page passes
       coordinates it already has. */
    const snap = () => ({
      pos: box.root.position.clone(),
      r: box.cam.r,
      q: chainGroup.quaternion.clone(),
      g: ghost,
    });

    function setState(st) {
      box.root.position.copy(st.pos);
      box.cam.r = st.r;
      chainGroup.quaternion.copy(st.q);
      if (st.g !== ghost) { ghost = st.g; applyGhost(paint); }
      box.applyCam();
    }

    box.focus = function focus(f, ms) {
      const from = snap();

      focused = f || null;
      applyView(focused && focused.view ? focused.view : viewDeclared);
      if (focused) aimAtFocus(); else reframeStill();
      if (focused && focused.ghost != null) ghost = focused.ghost;
      else if (!focused) ghost = 0;
      applyGhost(paint);

      const to = snap();
      /* rAF NEVER FIRES IN A HIDDEN TAB, and a tween there would rewind to
         where it started and never leave: the box would hold the PREVIOUS
         framing while everything else says it moved. Anything that renders a
         page without showing it — an automated check, a thumbnail capture, a
         tab left open behind another — lands there, so it takes the
         destination and skips the journey. Same trap the chain build answers
         with a setTimeout. */
      const hidden = typeof document !== 'undefined' && document.hidden;
      if (!ms || hidden || from.r === to.r && from.pos.equals(to.pos)
                 && from.q.equals(to.q) && from.g === to.g) { box.draw(); return; }

      /* Solved forward, then rewound: the destination has to be computed by
         the same fit() every other framing goes through, or a tween lands
         somewhere a resize would immediately correct. */
      setState(from);
      tween = { t: 0, ms, from, to };
      box.start();
    };

    /* SMOOTHSTEP, and the rotation SLERPS. Lerping a basis matrix takes the
       molecule through shapes it does not have; the quaternion path is the one
       turn a hand would make. The framing solved for the DESTINATION stands
       throughout, so a resize mid-tween lands on the target rather than on the
       frame being passed through — the alternative is re-solving every frame
       for a picture nobody is looking at yet. */
    function tickTween(dt) {
      if (!tween) return;
      tween.t += dt * 1000;
      const k = Math.min(1, tween.t / tween.ms);
      const e = k * k * (3 - 2 * k);
      const { from, to } = tween;
      box.root.position.lerpVectors(from.pos, to.pos, e);
      box.cam.r = from.r + (to.r - from.r) * e;
      chainGroup.quaternion.copy(from.q).slerp(to.q, e);
      const g = from.g + (to.g - from.g) * e;
      if (g !== ghost) { ghost = g; applyGhost(paint); }
      box.applyCam();
      if (k >= 1) {
        tween = null;
        solveStill();                    // the frame the reader now sees
        if (rep !== 'fold') box.stop();
      }
    }

    /* ---- the surface ---- */
    function dropSurface() {
      if (!surf) return;
      for (const P of patches.values()) {
        if (!P.mesh) continue;
        skinGroup.remove(P.mesh);
        /* Geometry left alone twice over: it shares position and normal with
           the skin, and the index is the memo's on the decoded surface.
           `releaseSurfaces` is the one place any of it is freed. */
        P.mesh.material.dispose();
        P.mesh = null;
      }
      skinGroup.remove(surf);
      /* The geometry belongs to the CACHE, not to the mesh — disposing it here
         is what would make a cached surface come back as an empty box on its
         second showing. `release` is the one place buffers actually go. */
      surf.material.dispose();
      surf = null; surfS = null;
      if (sesOwner === box) sesOwner = null;
    }

    /* THE BUFFERS, FOR REAL. `drop` is the LRU's eviction path — a box told to
       give its surface back has to give the memory back, not just the mesh. */
    function releaseSurfaces() {
      for (const S of decoded.values()) {
        S.geo.dispose();
        if (S.patches) for (const b of S.patches.values()) b.geo.dispose();
      }
      decoded.clear();
    }

    /* A DECLARATION, NOT A `const` ARROW, and the difference is a regression
       this shipped once. `solveStill` calls it, and a page passing `data:`
       instead of `trace:` runs setData SYNCHRONOUSLY inside create() — before
       a const on a later line exists. The throw landed inside the chain build,
       after the meshes went in and before the framing was solved, so every
       card in proteins/index.html drew its protein correctly at a radius
       nothing had set. A hoisted declaration cannot be reached too early. */
    function syncSkin() { skinGroup.quaternion.copy(chainGroup.quaternion); }

    /* TWO WAYS TO DRAW ONE MESH, and the flags are the whole difference
       between them. Opaque and alone, the surface IS the molecule. Over a
       ribbon it is a skin, and a closed transparent mesh containing an opaque
       one is the awkward case in a z-buffered renderer: with depthWrite on,
       the near wall writes depth and CULLS THE RIBBON BEHIND IT — everywhere,
       so the molecule reads as an empty shell. depthWrite off plus renderOrder
       1 lays the opaque geometry's depth down first and composites the skin
       over it. The cost is that the skin does not self-sort, so it is
       FrontSide: you see the near wall only, which is also the honest picture
       and what the reference figures do. hemoglobin/surface-test.html's header
       is the long version. */
    function applySkin() {
      if (!surf) return;
      const skin = rep === 'skin';
      const m = surf.material;
      m.transparent = skin;
      m.opacity = skin ? (opts.skinOpacity == null ? SKIN_OPACITY : opts.skinOpacity) : 1;
      m.depthWrite = !skin;
      m.needsUpdate = true;
      surf.renderOrder = skin ? 1 : 0;
    }

    /* ---- setSkin(opacity, seconds, {colour}) ----

       The skin's own opacity and colour, and optionally a fade to them. The
       default 0.28 is a skin you read the ribbon through; taken to 1 it is the
       molecule's outside and nothing else — which is what the same protein
       looks like in a crowd, so a lesson handing off from one molecule to many
       can close the gap on screen instead of cutting across it.

       COLOUR IS PART OF THE SAME GESTURE, and leaving it out is what makes the
       cut visible anyway: this module's skin is a cool grey and a component
       drawing the same protein by the hundred will have its own. Arriving at
       the destination's colour is the difference between a handoff and two
       pictures of one molecule that do not look like each other. Pass `null`
       as the opacity to go back to a readable skin AND to this box's own
       colour.

       It moves nothing and rebuilds nothing: two material properties, per
       frame. Only meaningful while the rep is `skin` — applySkin owns the
       rest, and a skin under paintSkin carries vertex colours, which are the
       page's statement and not this call's to overrule. */
    const SKIN_C0 = opts.surfaceColour == null ? SES_COLOUR : opts.surfaceColour;
    const _cf = new THREE.Color(), _ct = new THREE.Color(), _cn = new THREE.Color();
    let skinFade = 0;
    function skinColour(c) {
      opts.surfaceColour = c.getHex();
      if (surf && !skinPaint) surf.material.color.copy(c);
    }
    box.setSkin = function setSkin(to, seconds, o) {
      const home = to == null;                    // back to a skin you read through
      if (home) to = SKIN_OPACITY;
      const from = opts.skinOpacity == null ? SKIN_OPACITY : opts.skinOpacity;
      const want = (o && o.colour != null) ? o.colour : (home ? SKIN_C0 : null);
      _cf.set(opts.surfaceColour == null ? SES_COLOUR : opts.surfaceColour);
      if (want != null) _ct.set(want);
      if (skinFade) { cancelAnimationFrame(skinFade); skinFade = 0; }
      if (!seconds) {
        opts.skinOpacity = to;
        if (want != null) skinColour(_ct);
        applySkin(); box.draw();
        return box;
      }
      const t0 = performance.now();
      const tick = () => {
        const u = Math.min(1, (performance.now() - t0) / (seconds * 1000));
        const e = u * u * (3 - 2 * u);
        opts.skinOpacity = from + (to - from) * e;
        if (want != null) skinColour(_cn.copy(_cf).lerp(_ct, e));
        applySkin();
        box.draw();
        skinFade = u < 1 ? requestAnimationFrame(tick) : 0;
      };
      tick();
      return box;
    };

    /* ---- paintSkin(fn) ----

       fn(chain, num, name, i) -> a colour, or null for the material's own.
       One Float32Array written into the geometry that is already uploaded: no
       rebuild, nothing re-fetched, and NOTHING MOVES. That last part is the
       reason this exists rather than a second bake — a lesson claiming one
       substitution leaves the fold alone has to be unable to move it while
       saying so. Called before the bytes land, it is remembered and applied
       on arrival. */
    function paintSkin(fn) {
      if (fn !== skinPaint) paintGen++;
      skinPaint = fn || null;
      if (!surfS) return box;
      const mat = surf.material;
      if (!skinPaint) {
        surfS.geo.deleteAttribute('color');
        mat.vertexColors = false;
        mat.color.set(opts.surfaceColour || SES_COLOUR);
      } else {
        surfS.geo.setAttribute('color', new THREE.BufferAttribute(colorsFor(surfS), 3));
        mat.vertexColors = true;
        mat.color.set(0xffffff);
      }
      mat.needsUpdate = true;
      box.draw();
      return box;
    }

    /* ---- patch(name, pred, o) ----

       A residue-sized mark, as its OWN mesh over the skin: `o.colour` and
       `o.opacity` are independent of the skin's, which is the entire reason it
       is not a paint. See kit/surface.js for why, and for why a triangle needs
       all three of its vertices on the patch to count.

       `pred` may be a function, or a plain {chain, num} / {chains:'B,D',
       nums:[6]} — a page marking one residue should not have to write a
       closure. Passing a null `pred` removes the patch. */
    function predOf(p) {
      if (typeof p === 'function') return p;
      const chains = p.chains ? new Set(String(p.chains).split(',')) : null;
      const nums = p.nums ? new Set(p.nums.map(Number))
                 : p.num != null ? new Set([Number(p.num)]) : null;
      const names = p.names ? new Set(p.names) : null;
      return (ch, n, nm) => (!chains || chains.has(ch))
                         && (!nums || nums.has(Number(n)))
                         && (!names || names.has(nm));
    }

    /* THE COLOUR ARRAY, memoised the same way the cut is and for the same
       reason: it is 64 000 lookups and a 768 KB upload, and an A/B asks for
       the identical paint on the identical surface every time it comes back.
       Keyed on `paintGen`, which paintSkin bumps when the function changes —
       a page passing a fresh closure that computes the same thing pays for a
       recompute it did not need, which is the honest way round. */
    function colorsFor(S) {
      if (S.paint && S.paint.gen === paintGen) return S.paint.col;
      const c = new THREE.Color();
      const col = SurfLib.colors(S, (ch, n, nm, i) => {
        const v = skinPaint(ch, n, nm, i);
        if (v == null) return null;
        c.set(v);
        return [c.r, c.g, c.b];
      }, [1, 1, 1]);
      S.paint = { gen: paintGen, col };
      return col;
    }

    /* The cut, memoised on the surface it was cut from. Separate from
       buildPatch so a preload can pay it against a surface that is not the one
       showing — see warmSurface. */
    function cutPatch(P, S) {
      const memo = S.patches || (S.patches = new Map());
      const hit = memo.get(P.name);
      if (hit && hit.gen === P.gen) return hit;
      const built = Object.assign(SurfLib.patchGeo(THREE, S, P.pred), { gen: P.gen });
      memo.set(P.name, built);
      return built;
    }

    function buildPatch(P) {
      if (!surfS) return;

      /* THE CUT IS MEMOISED ON THE SURFACE IT WAS CUT FROM. Selecting a patch
         walks the whole index — 128 000 triangles at the lesson tier — and an
         A/B re-installs the same two surfaces over and over with the same
         patch on each. Measured at 35 ms per install before this, which is two
         dropped frames on the one press that is supposed to prove nothing
         moved. Keyed by name and by `gen`, which `patch()` bumps whenever the
         selector changes, so a re-selected patch is genuinely recut. */
      const built = cutPatch(P, surfS);
      P.tris = built.tris;
      P.residues = built.residues;
      /* AN EMPTY PATCH IS THE INTERESTING FAILURE and it is silent on screen:
         a buried residue, a mis-tagged one, or the wrong chain letters all
         draw exactly nothing and look like a mark that has not been reached
         yet. Warned, not thrown, because a page switching between structures
         will legitimately ask for a residue one of them does not have. */
      if (!P.tris) {
        console.warn(`Proteinbox: patch '${P.name}' matched no triangles`
          + ' — buried, mis-tagged, or the wrong chain?');
        return;
      }
      if (P.mesh) { P.mesh.geometry = built.geo; }
      else {
        P.mesh = new THREE.Mesh(built.geo, new THREE.MeshStandardMaterial({
          color: P.colour, roughness: 0.4, metalness: 0, side: THREE.FrontSide,
          transparent: P.opacity < 1, opacity: P.opacity, depthWrite: false,
        }));
        /* Over the skin, which is renderOrder 1. A patch at the same order
           sorts against it by distance and flickers through it as the model
           turns. */
        P.mesh.renderOrder = 2;
        skinGroup.add(P.mesh);
      }
      P.mesh.visible = P.visible;
    }

    function patch(name, pred, o) {
      if (pred == null) return unpatch(name);
      o = o || {};
      const prev = patches.get(name);
      const P = { name, pred: predOf(pred), mesh: null, tris: 0, residues: [],
                  gen: (prev ? prev.gen : 0) + 1,
                  colour: o.colour != null ? o.colour : (prev ? prev.colour : 0xd94f1e),
                  opacity: o.opacity != null ? o.opacity : (prev ? prev.opacity : 1),
                  visible: o.visible != null ? o.visible : (prev ? prev.visible : true) };
      /* The mesh and its material are carried over from the previous selector:
         same reason installSurface reuses them, and it keeps a re-selected
         patch from costing a shader compile. */
      P.mesh = prev ? prev.mesh : null;
      if (P.mesh) { P.mesh.material.color.set(P.colour); P.mesh.material.opacity = P.opacity;
                    P.mesh.material.transparent = P.opacity < 1; }
      patches.set(name, P);
      buildPatch(P);
      box.draw();
      return box;
    }

    /* Colour, opacity and visibility WITHOUT reselecting: a lesson fading a
       mark in must not rebuild its index every frame. */
    function setPatch(name, o) {
      const P = patches.get(name);
      if (!P) return box;
      if (o.colour != null) P.colour = o.colour;
      if (o.opacity != null) P.opacity = o.opacity;
      if (o.visible != null) P.visible = o.visible;
      if (P.mesh) {
        P.mesh.material.color.set(P.colour);
        P.mesh.material.opacity = P.opacity;
        P.mesh.material.transparent = P.opacity < 1;
        P.mesh.visible = P.visible;
      }
      box.draw();
      return box;
    }

    function unpatch(name) {
      const P = patches.get(name);
      if (P && P.mesh) { skinGroup.remove(P.mesh); P.mesh.geometry.dispose();
                         P.mesh.material.dispose(); }
      patches.delete(name);
      box.draw();
      return box;
    }

    /* INSTALLING A DECODED SURFACE, in one tick. Everything the old mesh
       carried is re-derived onto the new one — the paint, every patch, the
       skin flags — before the old one is let go, so nothing renders between
       the two. */
    function installSurface(S) {
      surfS = S;
      /* ONE MESH AND ONE MATERIAL FOR THE LIFE OF THE BOX, and the geometry is
         what changes. Building a fresh MeshStandardMaterial per switch costs a
         shader compile, and with the patch that was two of them — 16 ms, a
         dropped frame on exactly the press that is supposed to show nothing
         moving. Swapping `.geometry` under a material three.js has already
         compiled costs nothing, and the buffers are the cache's either way. */
      if (!surf) {
        surf = new THREE.Mesh(S.geo, new THREE.MeshStandardMaterial({
          color: opts.surfaceColour || SES_COLOUR,
          roughness: 0.45, metalness: 0.0, side: THREE.FrontSide,
        }));
        skinGroup.add(surf);
      } else {
        surf.geometry = S.geo;
      }
      sesOwner = box;
      syncSkin();
      applySkin();
      surf.visible = rep === 'surface' || rep === 'skin';
      /* Re-applied rather than carried: a colour attribute belongs to the
         geometry it was computed for, and the geometry just changed. */
      if (skinPaint) paintSkin(skinPaint);
      const onSurf = rep === 'skin' || rep === 'surface';
      for (const P of patches.values()) {
        buildPatch(P);
        if (P.mesh) P.mesh.visible = P.visible && onSurf;
      }
      box.draw();
    }

    function showSurface() {
      if (surf) { surf.visible = true; applySkin(); syncSkin(); box.draw(); return; }
      busy(true);
      fetchSurface(opts.surface)
        .then(S => {
          if (box.dead || !S) return;
          if (sesOwner && sesOwner !== box) sesOwner.drop();
          installSurface(S);
        })
        .catch(() => setRep('ribbon'))
        .then(() => busy(false));
    }

    /* ---- setSurface(url) ----

       THE SURFACE HALF OF setData, and it exists for the same reason: a page
       switching between two structures keeps one box, one context and the
       reader's viewpoint. Without it a variant switch is a destroy and a
       create, which is a new WebGL context, a re-fetch of everything, and a
       visible tear.

       THE OLD MESH STAYS UP UNTIL THE NEW ONE IS DECODED. A few hundred
       milliseconds of fetch with nothing on screen is the flicker, and there is
       no honest reason to show a gap: the pages that switch surfaces are
       comparing two structures fitted into one frame, so the mesh already up is
       an accurate stand-in for the one arriving. Dropping first would also be
       the one moment the page is claiming "nothing moved" while the molecule
       is missing.

       A surface a box is already showing is not re-fetched. */
    /* RETURNS A PROMISE, and it is the only thing here that does. Everything
       else about this box is fire-and-forget because it happens in the frame
       you asked for it; this crosses a network, and a page that prints
       anything ABOUT the surface — a residue count, which residue a patch
       landed on — has to know when the numbers are the new molecule's. Without
       it a panel reads back the surface that is on its way out, and looks
       exactly like a switch that did not take. */
    function setSurface(url) {
      if (!url || url === opts.surface) { opts.surface = url || opts.surface;
                                          return Promise.resolve(box); }
      opts.surface = url;
      if (!surf && rep !== 'skin' && rep !== 'surface') return Promise.resolve(box);
      /* ALREADY DECODED: the swap is synchronous, one frame, no fetch and no
         upload. This is the path an A/B takes after the first press each way,
         and it is what makes a variant toggle feel like a toggle. */
      if (decoded.has(url)) { installSurface(decoded.get(url)); ++surfGen;
                              return Promise.resolve(box); }
      busy(true);
      const mine = ++surfGen;
      return fetchSurface(url)
        .then(S => {
          /* A second switch while the first is in flight: only the last one
             asked for may install, or the box lands on whichever fetch
             happened to finish last. */
          if (box.dead || mine !== surfGen || !S) return box;
          if (sesOwner && sesOwner !== box) sesOwner.drop();
          installSurface(S);
          return box;
        })
        .catch(() => box)
        .then(b => { if (mine === surfGen) busy(false); return b; });
    }

    /* ---- preloadSurface(url) ----

       DECODE IT BEFORE IT IS ASKED FOR, and show nothing. An A/B knows both of
       its molecules at the start, and the first press of each direction is the
       only one that would ever be slow — so a lesson that preloads its second
       structure while the reader is still on the first has no slow press at
       all. Costs the bytes whether or not the reader ever presses, which is
       why it is a call and not a default: a gallery card must stay a
       thumbnail until someone asks it not to be. */
    function preloadSurface(url) {
      if (!url || decoded.has(url)) return Promise.resolve(box);
      return fetchSurface(url).then(S => { if (S) warmSurface(S); return box; })
                              .catch(() => box);
    }

    /* ---- warmSurface(S) ----
     *
     *  DECODED IS NOT THE SAME AS READY, and this is the whole of the
     *  first-press hitch. Fetching and decoding put 1.5 MB of vertices in
     *  ordinary memory; three uploads a BufferGeometry to the GPU lazily, on
     *  the first frame it is actually drawn. So a preload that stops at decode
     *  moves the network cost off the press and leaves the upload of 64 000
     *  vertices and 128 000 triangles exactly where it was — which is why the
     *  first swap each way stuttered and no later one did.
     *
     *  There is no API in r128 for "upload this and draw nothing":
     *  `renderer.compile` compiles programs, not attributes. What forces the
     *  upload is a draw call, so this issues one and makes it cost no pixels —
     *  the mesh is scaled to nothing and left unculled, so the buffers bind and
     *  the rasteriser has nothing to fill. It is on screen for one frame at a
     *  size below a pixel.
     *
     *  THE PATCH IS CUT HERE TOO, for the same reason: selecting one walks the
     *  whole index, and the point of a preload is that the press does no work.
     */
    function warmSurface(S) {
      if (box.dead || S.warm) return;
      S.warm = true;
      for (const P of patches.values()) cutPatch(P, S);
      if (skinPaint) S.geo.setAttribute('color', new THREE.BufferAttribute(colorsFor(S), 3));
      warmGeo([S.geo].concat([...(S.patches || new Map()).values()].map(b => b.geo)));
    }

    /* One draw call per geometry, costing no pixels. See warmSurface for why a
       draw is what forces the upload and why there is no API for it. */
    function warmGeo(geos) {
      if (box.dead || !geos.length) return;
      const mat = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
      const probes = geos.map(g => {
        const m = new THREE.Mesh(g, mat);
        m.scale.setScalar(1e-6);
        m.frustumCulled = false;
        box.root.add(m);
        return m;
      });
      box.draw();
      for (const m of probes) box.root.remove(m);
      mat.dispose();
    }

    /* ---- preloadData(t, o) ----

       THE RIBBON HALF OF preloadSurface, and the reason the first press still
       hitched after that one landed: a surface was ready and the other
       molecule's ribbon was not, so the press paid a chain of spline and tube
       before it could draw. This builds the structure into the cache and shows
       none of it — no reframing, no repaint, no view change, and the pocket
       and palette of whatever is on screen are left alone. */
    function preloadData(t, o) {
      setData(t, Object.assign({}, o, { preload: true }));
      return box;
    }

    function fetchSurface(url) {
      if (decoded.has(url)) return Promise.resolve(decoded.get(url));
      return fetch(url)
        .then(r => r.arrayBuffer())
        .then(buf => {
          if (box.dead) return null;
          const S = SurfLib.decode(THREE, buf);
          /* Oldest out. Map keeps insertion order, and the one on screen is
             never the oldest by the time a third arrives — a two-entry cache
             holding the current surface and the one before it is exactly an
             A/B's working set. */
          while (decoded.size >= DECODED_MAX) {
            const [k, old] = decoded.entries().next().value;
            if (old !== surfS) {
              old.geo.dispose();
              if (old.patches) for (const b of old.patches.values()) b.geo.dispose();
            }
            decoded.delete(k);
          }
          decoded.set(url, S);
          return S;
        });
    }

    /* ---- the fold ---- */
    function showFold() {
      if (player) { player.mesh.visible = true; reframeFold(); box.start(); return; }
      busy(true);
      fetch(opts.fold)
        .then(r => r.arrayBuffer())
        .then(buf => {
          if (box.dead) return;
          player = FoldPlay.create(THREE, HbFold.decode(buf), {
            /* Well under the lesson's sub 6: the ribbon is rebuilt as it plays
               and the cost of a rebuild is the triangle count. */
            sub: opts.foldSub == null ? 3 : opts.foldSub,
            speed: opts.foldSpeed == null ? 0.16 : opts.foldSpeed,
            material: Stage.bondMat(RIB.H),
          });
          foldGroup.add(player.mesh);
          reframeFold();
          box.start();
        })
        .catch(() => setRep('ribbon'))
        .then(() => busy(false));
    }

    function reframeFold() {
      if (!player) return;
      player.mesh.geometry.computeBoundingSphere();
      foldGroup.position.copy(player.mesh.geometry.boundingSphere.center).negate();
      /* Framed on the FINAL fold, not on this instant: a chain that starts
         extended and ends compact would otherwise zoom out through the whole
         animation, which reads as the camera folding rather than the protein. */
      if (!foldR) {
        const t = player.t;
        player.seek(1);
        player.mesh.geometry.computeBoundingSphere();
        foldR = player.mesh.geometry.boundingSphere.radius;
        player.seek(t);
      }
      radius = foldR;
      box.root.position.set(0, 0, 0);
      fit();
    }

    /* ---- the controls ----
       Two of them, because they are two kinds of thing. Ribbon and surface are
       REPRESENTATIONS — one molecule drawn two ways, which is what a segmented
       pair says. The fold is an EVENT: it starts, it runs, it ends, and a play
       button is what says that. In the same row of segments it would have
       claimed the fold was a third way of drawing the same still.
       Look is kit/proteinbox.css's; a page that wants them somewhere else
       restyles `.pbox-rep` and `.pbox-play` rather than rebuilding them. */
    const controls = [];
    const bar = document.createElement('div');
    bar.className = 'pbox-rep';
    const reps = ['ribbon'];
    /* `skin` is opt-in and `surface` is not. A gallery card asking for a
       surface means the opaque one it has always meant, and growing a third
       button under every card in the shelf is not a thing a page asked for. */
    if (opts.surface && opts.skin) reps.push('skin');
    if (opts.surface && opts.skinOnly !== true) reps.push('surface');
    const btns = reps.map(name => {
      const b = document.createElement('button');
      b.type = 'button'; b.dataset.rep = name; b.textContent = name;
      b.addEventListener('click', e => { e.stopPropagation(); setRep(name); });
      bar.appendChild(b);
      controls.push(b);
      return b;
    });
    if (reps.length > 1) mount.appendChild(bar);

    let play = null;
    if (opts.fold) {
      play = document.createElement('button');
      play.type = 'button';
      play.className = 'pbox-play';
      play.textContent = '▶';
      play.title = 'play the fold';
      play.addEventListener('click', e => {
        e.stopPropagation();
        setRep(rep === 'fold' ? 'ribbon' : 'fold');
      });
      mount.appendChild(play);
      controls.push(play);
    }

    // Disabled while bytes are in flight, so a second click cannot start a
    // second fetch of the same file.
    const busy = on => controls.forEach(b => { b.disabled = on; });

    function setRep(next) {
      rep = next;
      btns.forEach(b => b.classList.toggle('on', b.dataset.rep === rep));
      // The skin is the one rep that draws two things: the ribbon is what it
      // is a skin ON.
      chainGroup.visible = rep === 'ribbon' || rep === 'skin';
      if (surf) { surf.visible = rep === 'surface' || rep === 'skin'; applySkin(); }
      // A patch marks the surface, so it shows wherever the surface does.
      const onSurf = rep === 'skin' || rep === 'surface';
      for (const P of patches.values()) if (P.mesh) P.mesh.visible = P.visible && onSurf;
      if (player) player.mesh.visible = rep === 'fold';
      if (rep !== 'fold') box.stop();
      if (play) {
        play.textContent = rep === 'fold' ? '■' : '▶';
        play.title = rep === 'fold' ? 'stop' : 'play the fold';
        play.classList.toggle('on', rep === 'fold');
      }
      if (rep === 'ribbon') { reframeStill(); box.draw(); }
      // A skin is framed on the ribbon it covers: the surface is the same
      // molecule half an angstrom out, and reframing on it would nudge the
      // camera every time the button is pressed.
      else if (rep === 'skin') { reframeStill(); showSurface(); }
      else if (rep === 'surface') showSurface();
      else showFold();
      if (opts.onRep) opts.onRep(rep);
    }
    setRep('ribbon');

    box.drop = () => { setRep('ribbon'); dropSurface(); releaseSurfaces(); };
    box.setRep = setRep;
    /* The one call on this box that returns a promise — it crosses a network.
       See its own comment. */
    box.setSurface = setSurface;
    box.preloadSurface = preloadSurface;
    box.preloadData = preloadData;
    box.paintSkin = paintSkin;
    box.patch = patch;
    box.setPatch = setPatch;
    box.unpatch = unpatch;
    /* The decoded surface, for a page that wants to ask it something this box
       has no opinion about — which residues a chain has, where a patch's
       centre is. Null until the bytes land. */
    box.surface = () => surfS;
    box.patchInfo = name => { const P = patches.get(name);
      return P ? { tris: P.tris, residues: P.residues, colour: P.colour,
                   opacity: P.opacity, visible: P.visible } : null; };

    /* Replace what is drawn without replacing the box. A page that switches
       between structures keeps one WebGL context, one camera and one turn,
       which is the whole reason the box is shared: the reader's viewpoint
       survives the switch instead of snapping back on every click. */
    box.setData = setData;
    box.setColors = setColors;

    /* ---- setPocket(pocket) ----

       The few atoms drawn INSIDE the ribbon, ball-and-stick, in the
       structure's own frame:

         box.setPocket({ atoms:[{el, p:[x,y,z]}], bonds:[[i,j]] })

       exactly the shape a baker writes beside the trace. Coordinates go in as
       baked — centred with the trace by the same vector — because the box owns
       the centring and a group centred on itself lands at the origin with the
       protein somewhere else.

       WHAT IS IN THE POCKET IS NOT THE BOX'S BUSINESS, the same refusal it
       makes about parsing: which residues, which ligand names count, whether a
       cross-residue bond is kept. Those decide what the picture CLAIMS, and a
       page that owns a protein owns them. What is shared is how they are drawn.

       SPLIT STICKS, each half in its own atom's colour — the structure style
       every published figure uses, and the right one here for the reason
       Modules.md gives: these are deposited coordinates with no spec and often
       no hydrogens, so the bond does more of the work of saying what the atoms
       are.

       IT DOES NOT WIDEN THE FRAME. A pocket is inside the protein by
       definition, so the framing radius stays the ribbon's; letting 43 atoms
       vote on it would be a bug nobody could see.

       Returns `{group, materials, positionOf}` — one material per element
       plus one per bond colour — so a LESSON can fade the group in, tint it,
       or hide it without the box growing an opinion about timing.
       `positionOf(i)` is atom i's world position now, whichever way it was
       drawn. Call with no argument to clear.

       ABOVE INSTANCE_ABOVE ATOMS IT IS INSTANCED: one sphere mesh, one for
       metals and one stick mesh for the lot, same proportions, colours per instance. A
       photosystem's pigments are 20k atoms, and one mesh each is 20k draw
       calls. Below it every atom is its own mesh and `group.children[i]` is
       atom i, which callout pages lean on; above it there is no such mesh,
       `materials` is the three shared ones (white, so a tint multiplies every
       instance), and `positionOf` is the only way to an atom. */
    function setPocket(p, o) {
      pocketGroup.clear();
      if (!p || !p.atoms || !p.atoms.length) return { group: pocketGroup, materials: [] };

      /* `ball` SCALES THE WHOLE GROUP, and it exists for the case FE_BALL's
         reasoning does not cover: a metal with nothing drawn around it. The
         proportions below are relative — an iron is the biggest atom in a
         group because the porphyrin it sits in is drawn at the same scale — so
         a LONE metal has nothing to be biggest against and comes out at its
         honest size, which from across a 47 A complex is a couple of pixels.
         Zif268 is the case: three zincs and no group, and the bench's whole
         subject is where they sit. A caller that draws a group passes nothing.

         It is one number for the group rather than a per-atom radius, because
         how big an atom should look is the module's answer and how far away
         the reader is standing is the page's. */
      const ball = (o && o.ball) || 1;
      const R = MolLib.PALETTE.radii, C = R.C / MolLib.SCALE;
      const colourOf = el => MolLib.PALETTE.atoms[el] || 0x888888;
      /* `colour` on an atom overrides its element's: a caller tinting the
         carbons of one class (chlorophyll green) says so per atom, and the
         heteroatoms keep the palette's. */
      const tone = a => a.colour != null ? a.colour : colourOf(norm(a.el));
      const radiusOf = el => ball * (METAL.has(norm(el)) ? BALL * C * FE_BALL
                                                         : BALL * ((R[norm(el)] || R.C) / MolLib.SCALE));
      const positionOf = i => {
        const a = p.atoms[i];
        pocketGroup.updateWorldMatrix(true, false);
        return pocketGroup.localToWorld(new THREE.Vector3(a.p[0], a.p[1], a.p[2]));
      };
      if (p.atoms.length > INSTANCE_ABOVE) return instanced(p, tone, radiusOf, C * STICK, positionOf);
      const materials = [], byKey = {};
      const matFor = (el, hex) => byKey[el + hex] || (byKey[el + hex] = materials[materials.push(
        new THREE.MeshStandardMaterial({
          color: hex,
          /* A metal should look like one, and 'metal' is a set rather than
             iron: a heme's Fe and the Co sitting where a Mg belongs are the
             same kind of atom in a picture, and hardcoding one of them is how
             the second arrives looking like a large grey carbon. */
          roughness: METAL.has(el) ? .35 : .5, metalness: METAL.has(el) ? .35 : 0,
        })) - 1]);

      for (const a of p.atoms) {
        const el = norm(a.el);
        const r = ball * (METAL.has(el) ? BALL * C * FE_BALL
                                        : BALL * ((R[el] || R.C) / MolLib.SCALE));
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), matFor(el, tone(a)));
        m.position.set(a.p[0], a.p[1], a.p[2]);
        pocketGroup.add(m);
      }

      const A = new THREE.Vector3(), B = new THREE.Vector3();
      for (const [i, j] of p.bonds || []) {
        const a = p.atoms[i], b = p.atoms[j];
        if (!a || !b) continue;
        A.set(a.p[0], a.p[1], a.p[2]); B.set(b.p[0], b.p[1], b.p[2]);
        const g = Stage.bondSplit(A, B, tone(a), tone(b), C * STICK);
        g.traverse(o => { if (o.material && !materials.includes(o.material)) materials.push(o.material); });
        pocketGroup.add(g);
      }
      box.draw();
      return { group: pocketGroup, materials, positionOf };
    }

    function instanced(p, tone, radiusOf, stick, positionOf) {
      const bonds = (p.bonds || []).filter(([i, j]) => p.atoms[i] && p.atoms[j]);
      const ballMat = new THREE.MeshStandardMaterial({ roughness: .5 });
      /* The small path's metal finish, so a Mn cluster reads as metal here too. */
      const metalMat = new THREE.MeshStandardMaterial({ roughness: .35, metalness: .35 });
      const stickMat = new THREE.MeshStandardMaterial({ roughness: .5 });
      const isMetal = a => METAL.has(norm(a.el));
      const nMetal = p.atoms.filter(isMetal).length;
      const sph = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 10, 8), ballMat,
                                          Math.max(1, p.atoms.length - nMetal));
      const met = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 14, 10), metalMat, Math.max(1, nMetal));
      sph.count = p.atoms.length - nMetal;
      met.count = nMetal;
      const cyl = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), stickMat,
                                          Math.max(1, bonds.length * 2));
      cyl.count = bonds.length * 2;
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), S = new THREE.Vector3(),
            A = new THREE.Vector3(), B = new THREE.Vector3(), mid = new THREE.Vector3(),
            half = new THREE.Vector3(), dir = new THREE.Vector3(),
            Y = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
      let ia = 0, im = 0;
      for (const a of p.atoms) {
        const r = radiusOf(a.el);
        M.compose(A.fromArray(a.p), Q.identity(), S.set(r, r, r));
        const [mesh, n] = isMetal(a) ? [met, im++] : [sph, ia++];
        mesh.setMatrixAt(n, M);
        mesh.setColorAt(n, col.setHex(tone(a)));
      }
      let k = 0;
      for (const [i, j] of bonds) {
        const a = p.atoms[i], b = p.atoms[j];
        A.fromArray(a.p); B.fromArray(b.p);
        mid.addVectors(A, B).multiplyScalar(0.5);
        Q.setFromUnitVectors(Y, dir.subVectors(B, A).normalize());
        const len = A.distanceTo(B) / 2;
        /* SPLIT AT THE MIDPOINT, each half its own end's colour: Stage.bondSplit's rule. */
        for (const [end, at] of [[A, a], [B, b]]) {
          M.compose(half.addVectors(end, mid).multiplyScalar(0.5), Q, S.set(stick, len, stick));
          cyl.setMatrixAt(k, M);
          cyl.setColorAt(k++, col.setHex(tone(at)));
        }
      }
      pocketGroup.add(sph, met, cyl);
      box.draw();
      return { group: pocketGroup, materials: [ballMat, metalMat, stickMat], positionOf };
    }
    box.setPocket = setPocket;

    /* THE STRUCTURE'S OWN FRAME, for anything setPocket does not cover. It is
       the chain group and not `root`, because the presentation `view` is
       applied here — a ligand parented to root would keep the crystal's
       orientation while the protein turned, and land in the right place only
       for a trace that happened to earn no view. Cleared on every setData, so
       a caller re-adds after it. */
    box.group = chainGroup;

    /* ---- pickView() ----
     *
     *  THE BASIS THIS STRUCTURE WOULD NEED TO OPEN FACING THE WAY IT FACES
     *  RIGHT NOW, as a row-major 3x3 ready to paste into a registry. Every
     *  bench's "copy this view" button is this, and it lives here because the
     *  correct answer needs something no page can reach.
     *
     *  WHAT A PAGE GOT WRONG DOING IT ITSELF. The obvious version reads the
     *  camera and inverts it: the camera's orientation says where the reader
     *  is standing, a view basis says how the structure should be turned to be
     *  seen from there, and those are opposites. That is right only while the
     *  chain group is unrotated — which it is exactly until a structure earns
     *  a view, and then never again. A structure already wearing V and looked
     *  at from camera C SHOWS C⁻¹·V, so copying C⁻¹ back drops the V that was
     *  on screen at the time, and the paste opens somewhere nobody chose. The
     *  failure is silent: a rotation is still a rotation, the protein still
     *  looks like a protein, and only the person who picked the view can tell.
     *
     *  So: read the group's rotation as well as the camera's, and return the
     *  product. `setData` seeds the canonical camera (theta 0, phi pi/2, which
     *  is the identity orientation) on the first structure with a view, which
     *  is what makes the returned basis mean the same thing when it is read
     *  back in.
     */
    box.pickView = function pickView(dp) {
      const d = dp === undefined ? 4 : dp;
      const m = new THREE.Matrix4().makeRotationFromQuaternion(
        box.camera.quaternion.clone().invert());
      m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(chainGroup.quaternion));
      const e = m.elements, k = Math.pow(10, d), r = v => Math.round(v * k) / k;
      /* three.js stores column-major; a basis is rows, same as a bake. */
      return [[e[0], e[4], e[8]], [e[1], e[5], e[9]], [e[2], e[6], e[10]]]
        .map(row => row.map(r));
    };

    Object.defineProperty(box, 'rep', { get: () => rep });
    return box;
  }

  /* ---- one box, on the contract every component shares ----
     `create` is the card the door map and the shelf pool; this is the shape
     a generated page takes: name a protein, get set / state / on / destroy.
     A page one folder below demos/ passes nothing for `base`.

       const P = Proteinbox.mount(el, { protein:'hemoglobin', rep:'ribbon' });
       P.set({ rep:'surface' });            // 'ribbon' | 'surface' | 'fold', where the registry has them
       P.set({ protein:'myoglobin' });       // fetches the trace and redraws in the same box
       P.state().residues */
  function mount(el, params = {}) {
    const lib = (typeof ProteinLib !== 'undefined' && ProteinLib) || global.ProteinLib;
    if (!lib) throw new Error('proteinbox.js: mount needs proteins/proteins.js loaded first');
    const P = Object.assign({ base: '../', rep: 'ribbon', orbit: true }, params);
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'Proteinbox ' + ev);
    const entry = () => {
      const p = lib.PROTEINS.find(x => x.key === P.protein);
      const v = p && (P.variant ? p.variants.find(x => x.id === P.variant) : (p.variants.find(x => x.default) || p.variants[0]));
      return { p, v };
    };
    /* The trace's baked pocket (hemes, metals, a chromophore) draws by default:
       a heme is part of what hemoglobin IS. `pocket:false` hides it. */
    let pocketGroup = null;
    const drawPocket = t => {
      pocketGroup = box.setPocket((t && t.pocket) || null).group;
      pocketGroup.visible = P.pocket !== false;
      box.draw();
    };
    const box = create(Object.assign({ mount: el }, P, {
      onRep: r => { P.rep = r; emit('rep', r); },
      onData: drawPocket,
    }));
    if (!box) throw new Error('proteinbox.js: mount could not create a box; see the warning above');
    const has = () => { const o = fromRegistry(Object.assign({}, P)); return { surface: !!o.surface, fold: !!o.fold }; };
    function applyRep() {
      const h = has();
      const needsSurf = P.rep === 'surface' || P.rep === 'skin';
      const want = needsSurf && !h.surface ? 'ribbon'
                 : P.rep === 'fold' && !h.fold ? 'ribbon' : P.rep;
      if (want !== box.rep) box.setRep(want);
    }
    function state() {
      const { p, v } = entry();
      const r = (v && v.read) || {};
      return { protein: P.protein, variant: v ? v.id : null, name: p ? p.name : null, does: p ? p.does : null,
        blurb: p ? p.blurb : null, species: v ? v.species : null, purpose: v ? v.purpose : null,
        method: r.method || null, residues: r.residues || null, chains: v ? v.chains : null,
        rep: box.rep, pocket: P.pocket !== false, available: has() };
    }
    function set(next) {
      const swap = (next.protein && next.protein !== P.protein) || (next.variant && next.variant !== P.variant);
      Object.assign(P, next);
      if (swap) {
        const o = fromRegistry(Object.assign({}, P, { trace: null, surface: null, fold: null, view: null }));
        if (!o.trace) return this;
        fetch(o.trace).then(r => r.json()).then(t => {
          box.drop();
          box.setData(t, { view: o.view, chains: o.chains });
          drawPocket(t);
          if (next.colors) box.setColors(next.colors);
          applyRep();
          emit('load', state());
        });
        return this;
      }
      if (next.colors) box.setColors(next.colors);
      if (next.rep) applyRep();
      if ('pocket' in next && pocketGroup) { pocketGroup.visible = next.pocket !== false; box.draw(); }
      return this;
    }
    if (P.rep !== 'ribbon') applyRep();
    return {
      sim: box, box, set, state,
      on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn);
        return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); }; },
      start: box.start, stop: box.stop, pump: box.pump, draw: box.draw,
      destroy: () => box.destroy(),
    };
  }

  global.Proteinbox = { create, mount, RIB };
  /* Scale (kit/scale.js). One scene unit is one angstrom: the
     coordinates are a lab's, which is the whole reason this box is its own
     scene. Nothing is exaggerated, so a page may print a distance off it. */
  global.Proteinbox.SCALE = { rung: 'macromolecule', form: 'single', unit: 1e-10, exag: {}, down: {} };
})(this);
