/* =============================================================
 *  reaction/reaction.js — WHAT A STEP DOES TO A MOLECULE
 * =============================================================
 *
 * Extracted from `glycolysis-lab.html`, which had eight animation verbs
 * (`in out ox move lose split open iso`) as a hand-written if/else chain in
 * the page, twice: once for the whole-step route and once for the per-lane
 * one. The two had already drifted — step 6's hydride was shed on one route
 * and not the other, which is a hydrogen that flies to NAD⁺ while a copy of
 * itself stays on the aldehyde. The comment admitting it ("SHED HERE TOO.
 * This route never did") is why this file exists.
 *
 * THE STRUCTURAL CLAIM, and the reason the duplication is now impossible:
 * **every verb except `split` is a per-lane body.** A reaction happens to a
 * molecule; the lanes are how many molecules it is happening to. So there is
 * one body per verb, `lane(c)`, and the whole-step route is "run it on each
 * lane". `split` is the exception because it is the one event that is ABOUT
 * the lane count — one molecule becomes two — so it owns the whole stage and
 * its own completion.
 *
 * WHAT THIS OWNS
 *   · the verb table, and `verb()` so a lesson can add one
 *   · the transfers a reaction is made of: a group flying between molecules,
 *     a free molecule arriving out of solution, a proton hopping, a fragment
 *     assembling out of what left and drifting off frame
 *   · spec geometry: where an atom of a built OR not-yet-built molecule is in
 *     world space, and which atoms a phosphoryl transfer moves
 *   · the ± badge, and the name that rides a molecule that never lands
 *
 * WHAT IT DOES NOT OWN, and must not (Modules.md): lanes, carriers, the
 * tray, the ledger, `done`/`busy`, or any lesson's arithmetic. Those reach it
 * through `host`, and every one of them is a question about the STAGE, never
 * about the chemistry. If a verb needs a new host entry to know what reacted,
 * the verb is wrong.
 *
 * TIMINGS ARE THE MODULE'S, overridable per page via `host.timing`. They are
 * not arbitrary: each is a reading decision argued at its definition below,
 * and glycolysis's values are the ones they were tuned to.
 *
 * Loads after `kit/leaving.js`, `kit/motion.js`, `kit/molgraph.js`, `fx.js`
 * and `atomkit.js`. Checked by `reaction/check-reaction.js`.
 */
(function (global) {
'use strict';

/* ---- TIMINGS ---------------------------------------------------------
 * Milliseconds, because every beat a lesson writes is in ms. kit/motion.js
 * takes seconds; the conversion happens once, in `later`.
 */
const T0 = {
  // A phosphoryl passed between two molecules an enzyme is holding.
  FLY: 620,
  // The halves parting after a cleavage. Longer than a flight: two whole
  // molecules moving, not a group arriving.
  SPLIT: 840,
  // A PROTON GOING SOMEWHERE, not a flare. fx.js's 0.5 s default is too quick
  // to track over a bond length, so an intramolecular hop read as a gold
  // sparkle rather than as an H that moved.
  HOP: 900,
  // The beat that makes an isomerisation readable: the proton has landed and
  // the C=O has moved, and nothing else happens for a moment, so the finished
  // chemistry is seen BEFORE the molecule starts turning.
  ISO_HOLD: 300,
  ISO_TURN: 780,
  // A ring straightening out. Slower than every other beat on purpose — a
  // whole molecule changing shape, not one group arriving. Too fast reads as
  // "the picture changed".
  UNFURL: 1150,
  // A departure that has to outlast a flight and clear the frame.
  H_LEAVE_MS: 3000,
  // Two phases of a dehydration: loose atoms converging into real geometry,
  // then the assembled molecule leaving.
  WATER_FORM: 420,
  WATER_DRIFT: 1100,
  // THE CYTOSOL IS SLOWER THAN A HANDOFF. A phosphate off ATP is PASSED — one
  // enzyme holds both molecules. A free one out of solution is handed over by
  // nothing, so it takes longer and travels further.
  DRIFT: Math.round(620 * 1.6),
  // …AND IT STARTS AFTER THE THING IT REPLACES HAS GONE. An oxidation is two
  // events in opposite directions, and they used to be told apart by SPEED
  // alone. Staggering the START says it better, and in the right causal order:
  // the hydride leaves, and THEN the gap it left gets filled.
  OX_GAP: 260,
  // How long a ± badge holds before it fades.
  BADGE_HOLD: 1400,
  BADGE_FADE: 500,
  // TWO MOLECULES CLOSING ON EACH OTHER. Longer than `SPLIT`, which is the
  // same motion outward: parting only has to become legible, and meeting has
  // to arrive somewhere exact before a bond can be drawn between them.
  JOIN: 900,
  // COENZYME A CROSSING THE FRAME. Slower than a phosphoryl's `FLY` and than
  // free Pi's `DRIFT`, because it is neither a group nor a small molecule —
  // seventy atoms, and the size is the fact the flight is carrying.
  HANDLE: 1050,
  // A plain swap, for a verb that names no animation.
  PLAIN: 280,
};

/* ---- COLOURS AND SIZES (SCIENCE.md §5) ------------------------------- */
// The steel every moving hydrogen wears — leaving or landing, proton or
// hydride. One particle, one colour.
const H_LEAVE = 0x8fb6d8;
// A bond coming apart, the repo's violet (water-lab's NaCl dissociation).
const CLEAVE = 0x9a3fe0;
// AN ELECTRON ON ITS OWN, which no atom colour can stand for: it is not a
// hydrogen (steel) and not a bond (violet). A clear blue, so a hydride (an
// electron pair riding a proton) and a bare electron read as different
// particles crossing the same gap.
const ELECTRON = 0x2f6fd6;
// BIGGER THAN THE BUILDER DRAWS IT — a deviation worth naming. atomkit's
// default 0.62 world units reads fine where the frame holds three atoms; a
// pathway frame holds a whole sugar, so it lands 11 px against a 34 px
// phosphorus: the circle visible, the sign inside not. 1.9 ≈ two-thirds of its
// atom.
const BADGE_SCALE = 1.9;
// NDC. A little past 1 so a reagent ENTERS rather than appears.
const TOP_EDGE = 1.08;
// A DEPARTURE NEEDS MORE ROOM THAN AN ARRIVAL. 1.08 puts an atom's CENTRE just
// past the edge, which is plenty for something entering — you see it the
// moment it matters. Leaving, that same point still shows half a sphere on the
// rim, so the fragment reads as parked rather than gone.
const EXIT_EDGE = 1.3;
// Fallback world Y for a reagent when no carrier tile is on screen. Never used
// as a frame edge — see `offstage`, which solves that off the camera.
const OFFSCREEN = 8.5;
// Real H–O–H. The O–H length comes from SkelLib, so an assembled water is the
// size a water is next to a three-carbon acid — not MolLib's `water`, whose
// O–H is exaggerated for the solvation engine (MolecularGeometry.md §1).
const HOH = 104.5 * Math.PI / 180;
// The arc a flying group takes. Fixed, so it simply arrives: no tumble, no
// snap, no scale pulse to jolt against the product's own geometry.
const ARC = 2.6;

/* ---- the name that rides a molecule which never lands ---------------- */
// Client pixels of clearance above the projected point. The element is
// translate(-50%,-100%), so its BOTTOM edge lands there. Measured against the
// thing it must clear — a phosphate is P plus four oxygens, so its projected
// radius is the floor, not the gap you want on top of it.
const LABEL_LIFT = 72;
// HOW LONG THE NAME STAYS UP, as a fraction of the flight. THIS IS THE KNOB.
// The clamp is the point: the rule is "gone before it docks", and a rule a
// tuning knob can silently break is not a rule. Wind HOLD up to 1 and the name
// simply stays as long as it can, which is what you meant anyway.
// LABEL_FADE MIRRORS THE CSS `.flyplate` transition — change one, change both.
const LABEL_HOLD = 1.0, LABEL_FADE = 150, LABEL_GAP = 70;

function create(host) {
  const THREE = host.three || global.THREE;
  const { root, camera, canvas } = host;
  const MO = host.motion, FX = host.fx, GO = host.leaving,
        KIT = host.kit, Stage = host.stage, PAL = host.palette,
        MolGraph = host.molgraph, MolLib = host.molLib, SkelLib = host.skelLib;
  const TAG = host.tag || 'run';
  const T = Object.assign({}, T0, host.timing || {});
  // The one derived timing: an oxidation lands when the SLOWER, LATER arrival
  // does, not when the hydride does.
  T.OX = T.OX_GAP + T.DRIFT;

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const specOf = key => host.specOf(key);
  const lanesNow = () => host.lanes();
  /* WHICH BLOCK ON A SPEC NAMES THE ATOMS A STEP POINTS AT. Every verb here
   * asks a spec "where is your hydride / your cleaved bond / your carbon
   * chain", and the answer lives in a per-domain block: `spec.gly` for the
   * glycolysis set, `spec.krebs` for the cycle's. The module has no business
   * knowing which — and it cannot pick by page either, because a step can span
   * two domains (pyruvate carries `gly`, the acetyl-CoA it becomes carries
   * `krebs`). So the page hands over the lookup and reads whichever block a
   * given spec has. */
  const meta = host.meta || (spec => spec.gly);

  /* TIMERS, NOT FRAMES, ADVANCE A LESSON. rAF stops in a backgrounded tab, so
   * the wall clock owns state changes and rAF only pixels — finishing a
   * transition inside a rAF callback leaves a lesson stuck `busy`. That rule
   * is kit/motion.js's; a `call` beat is a COMMIT, on both clocks, fired once
   * by whichever wins. */
  const later = (fn, ms) => MO.after((ms || 0) / 1000, fn, TAG);

  /* =============================================================
   *  SPEC GEOMETRY — where an atom is, built or not
   * ============================================================= */
  /* `view` HAS TO BE APPLIED, which is the whole reason this is a function.
   * scene.js bakes `spec.view` into the atom MESHES, not the group rotation,
   * so a spec's raw `pos` is NOT where its atom ends up — eight world units
   * apart for glucose-6-phosphate. Rotate the same way, same Euler order. */
  const specLocal = (spec, idx) => {
    const a = spec.atoms[idx];
    const v = V(a.pos[0], a.pos[1], a.pos[2]);
    return spec.view
      ? v.applyEuler(new THREE.Euler(spec.view[0] || 0, spec.view[1] || 0,
                                     spec.view[2] || 0, 'ZYX'))
      : v;
  };
  /* The lane offset goes on AFTER (it is the group's position; rotation is
   * inside the group) and on BOTH axes — dropping the y half aims at the
   * spec's height instead of the drawn height. */
  const specWorld = (spec, idx, x, y) => {
    const v = specLocal(spec, idx);
    v.x += x; v.y += (y || 0);
    return root.localToWorld(v);
  };
  // Where an atom of a not-yet-built species WILL be, so a reagent can fly
  // there before the molecule carrying it exists.
  const siteWorld = (key, which, x) =>
    specWorld(specOf(key), meta(specOf(key))[which], x, host.laneBase(key));

  // Both kit/molgraph.js's, under this module's names — the distinction is
  // chemistry, not layout.
  const neighbors = (spec, i) => MolGraph.neighbors(spec, i);
  /* `terminalO` is derived, never listed: the O's on a P that hang off it and
   * nothing else. A BRIDGING O has a second heavy neighbour (C6 on a sugar, Pβ
   * on ATP) and stays behind. "Not bonded to a carbon" is not enough; that
   * keeps ATP's α–β–γ bridge and flies four oxygens. */
  const terminalO = (spec, p) => MolGraph.terminal(spec, p, 'O');
  /* …and its complement: the O carrying the group, where the bond forms or
   * breaks. MARK THE JUNCTION, not the phosphorus — a ring on P sits a bond-
   * length off what changed, and P is the biggest sphere in frame, so it reads
   * as decorating the atom rather than pointing at the event. */
  const bridgeO = (spec, p) => MolGraph.bridging(spec, p, 'O')[0];
  // WHERE THE EFFECT GOES: middle of the P–O bond that forms or breaks. Falls
  // back to the P if a spec has no bridge — a free phosphate, not a junction.
  function junctionWorld(spec, p, x, y) {
    const bo = bridgeO(spec, p);
    const pp = specWorld(spec, p, x, y);
    return bo == null ? pp : pp.add(specWorld(spec, bo, x, y)).multiplyScalar(0.5);
  }
  /* THE PROTON A PHOSPHATE DISPLACES. Glucose C₆O₆H₁₂ → G6P C₆O₉H₁₁P: C6's
   * oxygen keeps its place and becomes the bridge, its hydroxyl H leaves.
   * Derived by SITE, never by index: product's bridging O → the substrate's
   * oxygen at the same coordinates → its hydrogen. Both specs come off the
   * same Skel scaffold, so shared atoms share coordinates exactly; if that
   * stops holding this returns null and the step loses a beat rather than
   * hopping the wrong atom. */
  function leavingH(sub, pro, p) {
    const bo = bridgeO(pro, p); if (bo == null) return null;
    const q = pro.atoms[bo].pos;
    const hit = sub.atoms.map((a, i) => [i, a]).filter(([, a]) => a.el === 'O' &&
      Math.hypot(a.pos[0] - q[0], a.pos[1] - q[1], a.pos[2] - q[2]) < 0.35);
    if (hit.length !== 1) return null;
    const hs = neighbors(sub, hit[0][0]).filter(i => sub.atoms[i].el === 'H');
    return hs.length === 1 ? hs[0] : null;
  }

  const anchorWorld = (l, which) => {
    const idx = meta(specOf(l.key))[which];
    return idx == null ? l.g.getWorldPosition(new THREE.Vector3())
                       : l.g.userData.atomWorld(idx);
  };

  /* =============================================================
   *  WHAT LEAVES, ARRIVES, AND MOVES
   * ============================================================= */
  /* The meshes, the flight, the sweep on cancel and the camera arithmetic for
   * getting off stage are kit/leaving.js's. This keeps the chemistry: which
   * atoms go, what colour the event is, where to. */
  const shedAtoms = (l, idx) => GO.shed(l.g, idx);
  /* shedAtoms backwards, for ONE atom — the same event running forwards, and
   * kit/leaving.js owns the bond rule (a stick only when BOTH ends are drawn,
   * so revealing atoms in any order is safe). A page with `optH` off does not
   * draw the H that a hop moves, so the hop would start from a bare carbon;
   * revealing exactly the one that moves is the lesson saying "this is about
   * to go", and it is off the molecule again a beat later. */
  const showAtom = (l, i) => { if (i != null) GO.unshed(l.g, [i]); };
  /* THE MOLECULE LOSES IT AS IT LEAVES. A lane does not become the product
   * until the flight ends, so without this the phosphate sits there the whole
   * trip while a copy of itself sails off. The set hidden is the set that
   * flies, so the two cannot describe different groups. The bridging O stays:
   * on 1,3-BPG it is the carbonyl O that becomes 3-PGA's carboxylate. */
  const shedPhosphoryl = (l, p) => shedAtoms(l, [p, ...terminalO(specOf(l.key), p)]);
  // WHICH atoms are the phosphoryl is chemistry, so it is here; building the
  // meshes for them is not, so that is the module's. Centred on the P, because
  // the P is the point every caller aims.
  const phosphorylGroup = (spec, p) => GO.fragment(spec, [p, ...terminalO(spec, p)], {center: p});

  // IT LEAVES ACROSS THE SCREEN, NOT UP IT. World Y is partly INTO the shot at
  // a typical phi, so a proton taking it recedes and shrinks — the reading
  // fx.js's `away` profile exists to avoid. Screen-right is the camera's X
  // axis: same on screen at every orbit angle, perpendicular to depth. Read
  // off the camera, never typed, so a zoom ease cannot leave it parked.
  const screenRight = dist => GO.acrossScreen(dist);
  const acrossFrame = () => screenRight(camera.right - camera.left);
  // WHERE THE SOLVENT STARTS, and where a departure ends: a SCREEN edge, not a
  // world height. A fixed world Y stops INSIDE the shot under an orbiting
  // camera, so a reagent popped into existence just above its target and a
  // departing water floated to the top of its own molecule and sat there.
  const offstage = (to, edge) => GO.offstage(to, edge == null ? TOP_EDGE : edge);

  /* A PROTON THAT STAYS ON THE MOLECULE. Three things make it a journey and
   * none of them is "brighter": slow enough to follow, an arc proportional to
   * the trip (fx.js's default now, so nothing is passed), and the one steel
   * every moving H wears. AND IT CARRIES ITS SIGN — `+` for a proton, `−` for
   * a hydride. Same particle to look at, opposite charge, and that contrast is
   * the whole reason one of them reduces a carrier and the others do not.
   *
   * `onArrive` IS HOW THE H GETS THERE. The glow is a courier, not the atom:
   * it fades at the target and the molecule is left as it was, so a hop with
   * no arrival reads as the hydrogen having been destroyed. Every
   * intramolecular hop passes one, and it reveals a REAL mesh at the real
   * place — an H the spec grew, not a glow parked near an oxygen. */
  const badgeFor = sign => KIT.charge(sign, '#' + H_LEAVE.toString(16), 'H', BADGE_SCALE);
  const hop = (from, to, sign, onArrive) =>
    FX.protonHop(from, to, onArrive || null,
      {color: H_LEAVE, dur: T.HOP / 1000, carry: badgeFor(sign || '+')});
  /* A PROTON THAT GOES TO SOLUTION. Fired in `away` mode: snaps off the bond
   * immediately, then drifts out fading. Slower than whatever it pairs with on
   * purpose — a departure that keeps pace with an arrival reads as a swap, and
   * here something is just lost. */
  const protonAway = from => FX.protonHop(from, from.clone().add(acrossFrame()),
    null, {color: H_LEAVE, dur: T.H_LEAVE_MS / 1000, away: true, carry: badgeFor('+')});

  /* A phosphoryl arcing between two molecules — a reaction lesson's signature
   * beat: what one gives up and the other receives are visibly ONE object.
   * `spec`/`p` name the phosphate it copies, so it is BUILT IN THE GEOMETRY OF
   * THE END IT LANDS ON: the flight ends on the frame substrate is swapped for
   * product, and any difference from the product's own phosphate is a jolt. */
  function flyPhosphate(from, to, spec, p, dur) {
    // REMOVED ON THE BEAT THE PRODUCT APPEARS: launch's removal and the swap
    // share a delay and fire in registration order, this one first — so there
    // is never a frame with two phosphates in one place.
    const src = spec || host.donorSpec();
    const idx = spec ? p : meta(host.donorSpec()).gamma[0];
    return GO.launch(phosphorylGroup(src, idx),
                     {from, to, dur: dur || T.FLY, arc: ARC});
  }

  /* ---- naming a molecule that is only ever in the air ------------------
   * Lanes name their molecules with a plate each (kit/lanes.js); this names
   * one that never lands on a lane. It reads its NAME AND FORMULA OFF THE SPEC
   * so the label cannot disagree with the thing it points at.
   *
   * IT GOES BEFORE THE DOCK. The label's job is "this is what is arriving",
   * and that question is over once the group is bonded — by then the lesson is
   * the bond, and a name still riding the atoms competes with the ring marking
   * it. So it fades on a beat of its own, well short of the landing. */
  const flyLabels = [];
  const holdFor = dur => Math.max(0, Math.round(
    Math.min(dur * LABEL_HOLD, dur - LABEL_FADE - LABEL_GAP)));
  function labelFlyer(g, spec, hold) {
    if (!host.flyersEl) return null;
    const el = document.createElement('div');
    el.className = 'flyplate';
    // `short` where a spec has one, its full name where it does not: the
    // small molecules in mol-small.js (water, CO₂) carry no abbreviation
    // because they need none, and a label reading "undefined" is worse than a
    // long one.
    el.innerHTML = `<div class="fn">${spec.short || spec.name}</div>`
                 + `<div class="ff">${spec.formula}</div>`;
    host.flyersEl.appendChild(el);
    const rec = {el, g};
    flyLabels.push(rec);
    later(() => { el.style.opacity = '1'; }, 16);   // next frame, so the transition has a 0 to leave
    later(() => { el.style.opacity = '0'; }, hold);
    later(() => dropFlyer(rec), hold + LABEL_FADE + 10);
    return rec;
  }
  function dropFlyer(rec) {
    const i = flyLabels.indexOf(rec);
    if (i >= 0) flyLabels.splice(i, 1);
    rec.el.remove();
  }
  const clearFlyers = () => { while (flyLabels.length) dropFlyer(flyLabels[0]); };
  /* Projected in `afterFrame` like every other DOM anchored to the scene. */
  function drawFlyers() {
    if (!flyLabels.length) return;
    const v = new THREE.Vector3();
    flyLabels.forEach(({el, g}) => {
      g.getWorldPosition(v).project(camera);
      el.style.left = ((v.x * 0.5 + 0.5) * canvas.clientWidth) + 'px';
      el.style.top  = ((-v.y * 0.5 + 0.5) * canvas.clientHeight - LABEL_LIFT) + 'px';
    });
  }

  /* A WHOLE MOLECULE ARRIVING OUT OF SOLUTION, not a group transferred. The
   * difference is chemical and worth drawing: a transferred PO₃⁻ comes off a
   * molecule the lesson is already showing, and free inorganic phosphate does
   * not — it is HPO₄²⁻, four oxygens AND A PROTON, and that proton is the H⁺
   * of the overall equation. Flying a bare PO₃ borrowed from ATP makes it
   * unaccountable: it has to come from somewhere, and nothing on screen has
   * one. `onLand` fires as `launch` drops the group, so the arriving molecule
   * stops being drawn on exactly the frame the product's own takes its place. */
  function flyFree(spec, from, to, dur, onLand) {
    const all = spec.atoms.map((_, i) => i);
    // centred on the heavy atom, like every other flight target — FOUND, not
    // index 0 by luck, so a regenerated spec cannot centre it on an oxygen
    const c = spec.atoms.findIndex(a => a.el !== 'H');
    const g = GO.launch(GO.fragment(spec, all, {center: c < 0 ? 0 : c}),
                        {from, to, dur, arc: ARC, onDone: onLand});
    labelFlyer(g, spec, holdFor(dur));
    return g;
  }

  /* ---- the charge badge -----------------------------------------------
   * AN EVENT, NOT A LABEL. In a pathway every molecule past the first step is
   * an anion, so badges that stayed would be up the whole lesson. So it
   * appears on the beat the charge is ACQUIRED and goes.
   *
   * Text is passed, not derived: it is the GROUP's charge, not the molecule's
   * — a phosphate monoester is 2− on a 2− sugar and a 4− one alike. The
   * molecule's own number is `spec.charge`, checked by check-molecules.js. */
  const hexOf = el => '#' + new THREE.Color(PAL.atoms[el]).getHexString();
  function badge(laneIdx, atomIdx, text) {
    const l = lanesNow()[laneIdx]; if (!l) return;
    const spec = specOf(l.key); if (!spec.atoms[atomIdx]) return;
    // FROM THE MESH, not the spec: the molecule is already built, so `view`
    // and the rest of scene.js are already in its position (see specLocal).
    const m = l.g.userData.atomMeshes[atomIdx]; if (!m) return;
    // A WRAPPER AT THE ATOM: atomkit parks the badge off its atom's shoulder
    // and rewrites that offset every frame (faceCamera), so its position isn't
    // ours to set. Parent it where the atom stands.
    const at = new THREE.Group();
    at.position.copy(m.position);
    const b = KIT.charge(text, hexOf(spec.atoms[atomIdx].el),
                         spec.atoms[atomIdx].el, BADGE_SCALE);
    at.add(b); l.g.add(at);
    // The FADE is pixels (render loop); the REMOVAL is a commit, never the
    // fade's last frame — a hidden tab runs no rAF, so a badge that left only
    // while you watched would still be there when you came back.
    MO.seq([{at: T.BADGE_HOLD / 1000, dur: T.BADGE_FADE / 1000, ease: 'linear',
             onUpdate: t => { b.material.opacity = 1 - t; }},
            {at: (T.BADGE_HOLD + T.BADGE_FADE + 40) / 1000,
             call: () => { l.g.remove(at); KIT.forget(b); }}], {tag: TAG});
  }

  /* ---- A FRAGMENT ASSEMBLED OUT OF WHAT LEFT --------------------------
   * Built from the atoms that ACTUALLY LEFT rather than spawned as a stock
   * molecule beside the lane. A dehydration (or a decarboxylation) is the case
   * where the product you are watching is made of pieces of the thing in front
   * of you, and one that appears from nowhere throws that away.
   *
   * TWO PHASES, because the atoms are not a molecule until they are:
   *   FORM   loose spheres, no bonds, converging into real geometry. Bonds are
   *          drawn only at the end — a bond stretching from an O to an H still
   *          parked on a carbon is a bond that does not exist yet.
   *   DRIFT  the assembled molecule leaves, out of the frame.
   *
   * AND IT TRAVELS THE WHOLE VECTOR, not its world-Y part: the camera orbits
   * at an elevation, so world +Y is partly INTO the shot and drifting "up"
   * stops short of the edge. Same reason `screenRight` exists.
   */
  function expel(l, parts, opts) {
    const o = opts || {};
    const g = new THREE.Group();
    parts.forEach(p => g.add(Stage.atom(PAL.atoms[p.el], PAL.radii[p.el], p.at, p.el)));
    GO.hold(g);
    const meshes = g.children;
    if (o.gather && o.gather.length)
      GO.gather(o.gather.map((to, i) => ({mesh: meshes[i + 1], to})), {dur: T.WATER_FORM});
    later(() => {
      if (o.bonds) GO.link(g, o.bonds);
      const climb = offstage(parts[0].at, EXIT_EDGE).sub(parts[0].at);
      MO.seq([{dur: T.WATER_DRIFT / 1000, ease: 'inQuad',
               onUpdate: e => { g.position.copy(climb).multiplyScalar(e); }}], {tag: TAG});
    }, T.WATER_FORM);
    later(() => GO.drop(g), T.WATER_FORM + T.WATER_DRIFT);
    return g;
  }

  /* THE WATER A DEHYDRATION MAKES — `expel` with the geometry of a water.
   * The first H keeps the direction it already had off the O (it was an O–H
   * and stays one, so only its length is corrected); the second swings round
   * to the true angle IN THE PLANE THE THREE ATOMS ALREADY SHARE, so the fold
   * happens in the plane the eye is watching rather than through the screen. */
  function waterAway(l) {
    const spec = specOf(l.key), mol = meta(spec), u = l.g.userData;
    const oI = mol.oh3, h2I = mol.loseH;
    if (oI == null || h2I == null) return;
    const h1I = neighbors(spec, oI).find(i => spec.atoms[i].el === 'H');
    if (h1I == null) return;
    const pO = u.atomWorld(oI).clone(), pH1 = u.atomWorld(h1I).clone(),
          pH2 = u.atomWorld(h2I).clone();
    // BOTH BONDS THAT BREAK, each in its own colour: the C–O in oxygen red,
    // the C–H in hydrogen steel. Two rings because two bonds go — one ring
    // would say a dehydration is a single event at a single place.
    FX.spawnRing(pO.clone().lerp(u.atomWorld(mol.cN[2]), 0.5), PAL.atoms.O);
    FX.spawnRing(pH2.clone().lerp(u.atomWorld(mol.cN[1]), 0.5), H_LEAVE);
    shedAtoms(l, [oI, h1I, h2I]);          // they left; they should look left
    const OHW = SkelLib.GL.OH * MolLib.SCALE;
    const d1 = pH1.clone().sub(pO).normalize();
    const t1 = pO.clone().add(d1.clone().multiplyScalar(OHW));
    let nrm = new THREE.Vector3().crossVectors(d1, pH2.clone().sub(pO));
    // Degenerate only if the departing H is dead in line with the O–H; pick
    // any perpendicular rather than divide by zero and send the atom to NaN.
    if (nrm.lengthSq() < 1e-6) nrm.set(0, 0, 1); else nrm.normalize();
    const t2 = pO.clone().add(d1.clone().applyAxisAngle(nrm, HOH).multiplyScalar(OHW));
    return expel(l, [{el: 'O', at: pO}, {el: 'H', at: pH1}, {el: 'H', at: pH2}],
                 {gather: [t1, t2], bonds: [[pO, t1], [pO, t2]]});
  }

  /* =============================================================
   *  THE VERBS
   * =============================================================
   * Each is `{dur, lane(c)}` — or `{dur, whole(c)}` for the one event that is
   * about the lane count itself. `c` is the step's context for ONE lane:
   *
   *   c.step  the step record        c.j        this lane's index
   *   c.lane  the lane (g, key)      c.spec     its substrate spec
   *   c.keys  the product species    c.n        how many lanes after this step
   *   c.key   this lane's product    c.product  that spec
   *   c.x     this lane's world x    c.carrier(ref) world point of the tile
   *                                              this lane's carrier stands on
   */
  const verbs = {};
  const verb = (name, def) => { verbs[name] = def; return def; };

  /* A GROUP ARRIVES from a carrier onto the site it is ABOUT to occupy. */
  verb('in', {dur: () => T.FLY, lane(c) {
    const tp = siteWorld(c.key, c.step.anchor, c.x);
    // off the carrier giving it up; top of frame if the tray is not on screen
    const from = c.carrier(tp) || V(c.x, OFFSCREEN, 0);
    const pIdx = meta(c.product)[c.step.anchor];
    // built as the product's OWN phosphate, so the frame it lands on is the
    // frame the product replaces it and nothing moves
    flyPhosphate(from, tp, c.product, pIdx);
    // the ring marks the BOND that forms, not the atom that arrived
    later(() => FX.spawnRing(junctionWorld(c.product, pIdx, c.x, host.laneBase(c.key)),
                             PAL.atoms.P), T.FLY);
    /* AND THE HYDROXYL PROTON LEAVES FIRST. The oxygen the group lands on is
     * the substrate's own and is holding an H. IT LEFT; IT SHOULD LOOK LEFT —
     * without the shed the H sits on the hydroxyl for the whole flight while a
     * copy of itself drifts off frame: two hydrogens where the chemistry has
     * one, and the departure reading as something emitted rather than lost.
     * Its height comes from the SUBSTRATE's own lift, not the product's. */
    const hIdx = leavingH(c.spec, c.product, pIdx);
    if (hIdx != null) {
      const h0 = specWorld(c.spec, hIdx, c.x, host.laneBase(c.lane.key));
      // h0 comes from the spec, not the mesh, so shedding first costs nothing
      shedAtoms(c.lane, [hIdx]);
      protonAway(h0);                 // …carrying the charge the molecule lost
    }
    /* THE CHARGE THE MOLECULE JUST ACQUIRED. On the group, because that
     * carries it: a phosphate monoester is 2− at cytosolic pH whichever sugar
     * it is on. AFTER the swap, not on it — the lane still holds the substrate
     * until the step lands, and the substrate has no phosphate to sit on. */
    later(() => badge(c.j, pIdx, '2−'), T.FLY + 40);
  }});

  /* A GROUP LEAVES toward a carrier — the `in` trip run backwards, which is
   * the point of a coupled pair. The registered end is the TAKEOFF: it is a
   * copy of the group the molecule is losing, so it leaves from exactly where
   * that one stands. */
  verb('out', {dur: () => T.FLY, lane(c) {
    const p = meta(c.spec)[c.step.anchor];
    const src = anchorWorld(c.lane, c.step.anchor);
    // on the bond that breaks, not on the P that leaves along it
    FX.spawnRing(junctionWorld(c.spec, p, c.lane.g.position.x, c.lane.g.position.y),
                 PAL.atoms.P);
    flyPhosphate(src, c.carrier(src) || V(c.lane.g.position.x, -OFFSCREEN, 0), c.spec, p);
    shedPhosphoryl(c.lane, p);        // it left; it should look left
    /* …AND THE BOND IT MAKES AT THE OTHER END, on the beat it lands.
     *
     * BOTH ENDS OF A TRANSFER ARE EVENTS. Every other verb marks the bond it
     * makes as well as the one it breaks — `in` rings the ester forming on the
     * sugar, `move` rings the new site, `ox` rings the carrier atom that gained
     * the hydride. This one rang only the departure, so the half of the step
     * the LEDGER is about — an ADP becoming an ATP — happened with nothing
     * pointing at it: a group left a sugar, crossed the frame, and the tile it
     * arrived at just quietly said a different name. That is the one beat
     * steps 7 and 10 exist for (substrate-level phosphorylation, 2 ATP each).
     *
     * WHICH bond is the page's, through `carrierBond` — ATP's is not FAD's or
     * CoA's, and the module has no business knowing. It answers null when
     * nothing is on screen (kit/carriers.js's rule), so a tray scrolled away
     * costs the ring rather than putting one at the origin. */
    later(() => { const at = c.carrierBond(); if (at) FX.spawnRing(at, PAL.atoms.P); },
          T.FLY);
  }});

  /* AN OXIDATION — two things in opposite directions, which is the whole
   * lesson: the hydride leaves toward the carrier, and a free phosphate drifts
   * DOWN out of solution to fill the gap. Different directions and speeds, so
   * it cannot read as one swap. */
  verb('ox', {dur: () => T.OX, lane(c) {
    /* THE HYDRIDE THIS MOLECULE GIVES UP, under whichever name its domain
     * block uses: `aldehydeH` on G3P, because there the atom IS the aldehyde's
     * hydrogen and the step is named for it; `hydride` on malate, where it is
     * the carbinol's and only drawn at all because C2 is a stereocentre. Same
     * particle, same flight, two files that named it for what it is. */
    const mol = meta(c.spec);
    const hIdx = mol.hydride != null ? mol.hydride : mol.aldehydeH;
    // CLONED, AND READ BEFORE THE SHED: the ring and the phosphate's landing
    // both use it after the atom is gone.
    const hPos = (hIdx != null ? c.lane.g.userData.atomWorld(hIdx)
                               : anchorWorld(c.lane, c.step.anchor)).clone();
    // A HYDRIDE, so '−' where every other moving H carries '+'.
    if (hIdx != null) shedAtoms(c.lane, [hIdx]);
    const seat = c.carrier(hPos) || V(c.lane.g.position.x, OFFSCREEN, 0);
    /* THE CARRIER GAINS IT ON ARRIVAL, NOT WHEN THE STEP LANDS. NAD⁺ used to
     * hold its empty state through the whole flight and turn over a third of a
     * second later with the glow already faded — so the one thing the step is
     * about, C4 going from one H to two, happened while nothing pointed at it.
     *
     * …AND RING THE ATOM THAT CHANGED. The flight target IS that atom, so this
     * lands exactly on it. Without the ring the student is asked to spot one
     * added sphere among ten white hydrogens on a 73-atom molecule — and the
     * added one is the pro-R H, which points away from the camera and sits
     * under the ring. It has to be that one: GAPDH is an A-side dehydrogenase.
     * The page cannot move the H somewhere easier to see, so it points at it. */
    hop(hPos, seat, '−', () => {
      host.onCarrierTaken(c.j); host.popCarrier(c.j); FX.spawnRing(seat, H_LEAVE);
    });
    /* AND THE FREE PHOSPHATE THAT FILLS THE GAP — only where the product has
     * one more phosphate than the substrate did. GAPDH's oxidation is really
     * two events, and the incoming Pᵢ is the half students misread as having
     * cost an ATP; malate dehydrogenase's is only the hydride, and a phosphate
     * drifting onto oxaloacetate would invent an atom the cycle never touches.
     * DERIVED FROM THE TWO SPECS, so no step has to declare it and no lesson
     * can forget to. */
    const gains = (meta(c.product).phosphates || 0) > (mol.phosphates || 0);
    if (!gains || !host.freeSpec) return;
    later(() => flyFree(host.freeSpec(), offstage(hPos), hPos, T.DRIFT, () => {
      FX.spawnRing(hPos, PAL.atoms.P);
      // …and the arriving molecule's own proton leaves as the ester forms.
      // That is the H⁺ of the overall equation, and it goes HERE: the hydride
      // step is proton-neutral over the cycle, and the product carries none.
      protonAway(hPos);
    }), T.OX_GAP);
  }});

  /* ---- A REDUCTION: `ox` WITH THE ARROW TURNED ROUND -------------------
   * A hydride crosses from NADH to a carbonyl carbon, and the carrier is
   * discharged rather than charged. `hydrate` is drawn as `lose`'s mirror for
   * exactly this reason, and the same argument applies harder here: a student
   * who has watched GAPDH take a hydride onto NAD⁺ should recognise this as
   * that event running backwards, because that recognition IS what fermentation
   * is for.
   *
   * THE DONOR STANDS ON THE STAGE, NOT IN THE TRAY, and that is the difference
   * that made this a verb instead of a flag on `ox`. Everywhere else a carrier
   * is SPENT and the tray is where spent things go. Here the carrier is the
   * point of the reaction — the whole pathway exists to get NAD⁺ back — so it
   * walks on as a molecule, hands the hydride over in the frame, and stays
   * there afterwards wearing one fewer hydrogen. How a page gets it there is
   * the page's business: fermentation-lab.html stands it in a lane from the
   * first frame rather than walking it on, because a lane count that changes
   * mid-step breaks the per-lane mapping from lane to product.
   *
   * WHICH HYDROGEN, AND IT IS NOT EITHER OF THEM. `nic.h` is C4's pair, and
   * the LAST is the one GAPDH put there (mol-pathways.js says so where it
   * names them). Handing back the other would be chemically indistinguishable
   * and pedagogically backwards: the atom that leaves should be the atom the
   * student watched arrive.
   */
  verb('red', {dur: () => T.OX, lane(c) {
    const mol = meta(c.spec);
    /* THE LANE THAT RUNS THIS IS THE DONOR, the one with a hydride to give —
     * and a lane with none is not in this reaction, which is `decarb`'s rule
     * and what excuses the substrate standing beside it.
     *
     * THE DONOR, NOT THE ACCEPTOR, because the click has to land where the bond
     * breaks. Every hotspot in this repo marks a bond coming apart: `ox` points
     * at the C–H a dehydrogenase takes, `out` at the phosphate that leaves. Run
     * from the acceptor, this verb would have a lesson tell the student to click
     * a carbonyl while the atom departs from the molecule next to it. It also
     * puts the gesture where the teaching is: taking the hydride OFF the carrier
     * is what fermentation is for. */
    if (mol.hydride == null) return;
    /* …and the acceptor is the nearest lane with a carbon whose oxidation state
     * this changes, found by asking specs rather than by index — `join` finds
     * coenzyme A the same way. NEAREST, because a page may stand more than one
     * pair on the stage and the hydride crosses to the molecule beside it. */
    // WHERE IT LANDS: a carbonyl carbon (`oxC`) on an acid, or the atom a
    // carrier names as `accept` — FMN's N5, which is not a carbon at all.
    const site = m => m.oxC != null ? m.oxC : m.accept;
    const ls = lanesNow().filter(l => site(meta(specOf(l.key))) != null);
    if (!ls.length) return;
    const x = c.lane.g.position.x;
    const acc = ls.reduce((a, b) =>
      Math.abs(b.g.position.x - x) < Math.abs(a.g.position.x - x) ? b : a);
    const from = atomOn(c.lane, mol.hydride);
    const to = atomOn(acc, site(meta(specOf(acc.key))));
    shedAtoms(c.lane, [mol.hydride]);
    /* RING BOTH ENDS, which `ox` argues for at length: the carrier turning over
     * is half the step, and on a page about regenerating one it is the half the
     * lesson is about. The departure ring fires on C4, so the student sees
     * which molecule paid. */
    FX.spawnRing(from, H_LEAVE);
    // A HYDRIDE, so '−', the same badge every other hydride in this file wears.
    hop(from, to, '−', () => FX.spawnRing(to, H_LEAVE));
  }});

  /* ---- A GROUP THAT MOVES ONE ATOM OVER ON THE SAME MOLECULE ----------
   * IT LEAVES BEFORE IT ARRIVES. Run with the substrate untouched, the
   * molecule wears its old phosphate AND a second one crosses the gap — two
   * phosphates, on the step whose entire claim is that there is only one and
   * it merely moved.
   *
   * WHAT STAYS BEHIND IS THE BRIDGING OXYGEN, which is not a detail: a
   * phosphoryl transfer breaks the P–O bond, not the C–O one, so the carbon
   * keeps its oxygen and becomes a hydroxyl. `shedPhosphoryl` handles it.
   */
  verb('move', {dur: () => T.FLY, lane(c) {
    const mol = meta(c.spec), u = c.lane.g.userData;
    const src = anchorWorld(c.lane, c.step.anchor);
    const dst = siteWorld(c.key, c.step.dest, c.x);
    flyPhosphate(src, dst, c.product, meta(c.product)[c.step.dest]);
    shedPhosphoryl(c.lane, mol[c.step.anchor]);
    /* THE TWO PROTONS THAT TRADE PLACES WITH IT. A mutase moves a phosphate,
     * so one hydroxyl becomes an ester and one ester becomes a hydroxyl — the
     * destination's proton goes to solution because an oxygen holding one
     * cannot attack the phosphorus, and the origin's oxygen takes a different
     * one back as the phosphate leaves. NET ZERO; both specs are the same
     * formula at the same charge.
     *
     * ONLY THE DEPARTURE IS ANIMATED, and the arrival just appears. The two
     * are not equally worth a flight: one thing visibly stops being on the
     * molecule, the other lands on a site that came free in the same instant,
     * and a second travelling particle competes with the one group moving.
     *
     * WATCH THE BADGE, THOUGH. A departing '+' elsewhere pairs with a 2− on
     * the phosphate and says the molecule went more negative. Nothing of the
     * sort happens here — the charge is unchanged — so the '+' is carried by
     * the arriving hydroxyl appearing on the same beat, and by nothing else.
     * If that stops reading as a trade, drop the badge rather than adding a
     * second flight: the ledger and the formula both say no charge moved. */
    if (mol.oh2H != null) {
      // IT GOES AS THE PHOSPHATE COMES, not before: the deprotonation is what
      // makes the oxygen able to take it, so they are one beat.
      const from = u.atomWorld(mol.oh2H).clone();
      shedAtoms(c.lane, [mol.oh2H]);
      protonAway(from);
    }
    if (mol.oh3H != null) showAtom(c.lane, mol.oh3H);
    // the ring marks the bond that FORMS, at the site it forms on
    later(() => FX.spawnRing(
      junctionWorld(c.product, meta(c.product)[c.step.dest], c.x, host.laneBase(c.key)),
      PAL.atoms.P), T.FLY);
  }});

  /* A DEHYDRATION. Nothing is handed over, so there is no carrier leg — the
   * whole event is the water coming off this lane's own molecule. The lane
   * becomes the product when the water has SEPARATED rather than when it has
   * finished leaving: the C=C should close behind it while it is still on
   * screen, so you see what its departure left. */
  verb('lose', {dur: () => T.WATER_FORM + 260, lane(c) { waterAway(c.lane); }});

  /* ---- A RING OPENS AND THE CHAIN UNFURLS -----------------------------
   * FOUR BEATS, ACTUALLY IN ORDER, because the two protons are the chemistry
   * and each needs the frame to itself: the hemiacetal comes apart, the
   * anomeric –OH gives its proton to the ring oxygen, the chain rotates out
   * flat, and then — on the open chain — the α-proton moves and THAT is the
   * isomerisation itself.
   */
  verb('open', {
    dur: () => T.HOP + T.UNFURL + 120 + T.HOP + 180,   // land, then swap
    lane(c) {
      const mol = meta(c.spec), o = mol.open, u = c.lane.g.userData;
      if (!o) return;
      const mid = u.atomWorld(o[0]).clone().add(u.atomWorld(o[1])).multiplyScalar(.5);
      FX.spawnRing(mid, PAL.atoms.O);
      // …and the H that moves at the END of the step comes on screen NOW, so
      // when it goes the student has already seen where it was sitting.
      if (mol.c2H != null) showAtom(c.lane, mol.c2H);
      // the bond goes FIRST — the atoms are about to move as though it had
      u.bondMeshes.forEach(bm => { const [i, j] = bm.userData.pair;
        if ((i === o[0] && j === o[1]) || (i === o[1] && j === o[0])) bm.visible = false; });
      if (mol.anomeric) {
        // POSITIONS FIRST, THEN SHED. Reading atomWorld off an atom already
        // shed gives you where it isn't.
        const from = u.atomWorld(mol.anomeric.h).clone(), to = u.atomWorld(o[1]).clone();
        shedAtoms(c.lane, [mol.anomeric.h]);
        // …AND IT ARRIVES. The ring O keeps this proton — it leaves the ring
        // as a hydroxyl — so `openH` comes on where the geometry says an O–H
        // goes.
        hop(from, to, '+', () => showAtom(c.lane, mol.openH));
      }
      /* …then the unfurl, AFTER THE HOP, NOT UNDER IT. Run at t=0 with the
       * others, the proton crossed a ring that was unfurling out from under
       * it, so its target had moved by the time it arrived and the only beat
       * the eye caught was the unfurl. Eased, on the render loop, cancelled
       * with the step if the student restarts mid-turn. */
      const plan = unfurlPlan(c.lane, c.key);
      if (plan) later(() => MO.seq([{dur: T.UNFURL / 1000, ease: 'inOutQuad',
        onUpdate: e => unfurlApply(c.lane, plan, e)}], {tag: TAG}), T.HOP);

      /* WHAT IS LEFT AT THE SWAP IS THE REACTION, so it gets marked. The
       * backbones superimpose by now, so the only change is what the enzyme
       * did — the carbonyl moves one carbon in, and this hop is the half of
       * that mechanism the eye can follow.
       *
       * THE α-CARBON'S H → THE CARBONYL'S OXYGEN, not its carbon. This is the
       * ENOLISATION, the first half of the cis-enediol: the base takes the
       * α-proton, the charge delocalises onto the carbonyl oxygen, and that
       * oxygen is what gets protonated. Aimed at the carbon it drew the SECOND
       * half's destination with the FIRST half's proton, landing on an atom
       * the product draws no H on — so the hydrogen simply ceased to exist.
       *
       * THE OXYGEN IT LANDS ON IS THE ONE THAT JUST GAVE A PROTON UP, so
       * `anomeric.h` comes back on: same site, same geometry, a proton
       * returned to where the first hop took one from. That is what an
       * enediol is.
       *
       * ON THE SUBSTRATE, BEFORE THE SWAP — fired on the product afterwards,
       * the α-carbon is a bare ketone carbon and the proton has nowhere to
       * come from. Here the H has been on screen since the top of the step and
       * is shed as the hop starts: the thing that moves is the thing that was
       * there. */
      later(() => {
        if (mol.c2H == null || !mol.anomeric) return;
        const from = u.atomWorld(mol.c2H).clone(), to = u.atomWorld(mol.anomeric.o).clone();
        FX.spawnRing(from, H_LEAVE);
        shedAtoms(c.lane, [mol.c2H]);
        hop(from, to, '+', () => showAtom(c.lane, mol.anomeric.h));
      }, T.HOP + T.UNFURL + 120);
    }});

  /* ---- AN ISOMERISATION, IN THREE BEATS -------------------------------
   * Because it is three things, and run as one they read as "a spark, and
   * then a different molecule".
   *
   *   1. THE HYDROGEN LEAVES ONE CARBON AND LANDS ON THE NEXT. SHED from the
   *      mesh as the hop starts, so the atom visibly goes and the glowing
   *      proton is the only H in the air; it arrives on a carbon the product
   *      draws one on. Hop without shed leaves the white H sitting where it
   *      was while a second one flies off it, and the honest question is where
   *      the extra came from.
   *   2. THE C=O SLIDES OUT to the carbon the H left. Ringed where it forms.
   *   3. THE MOLECULE TURNS OVER. This is not chemistry and must not look like
   *      it — no ring, no glow, slow and eased. But it cannot be skipped: a
   *      ketose and its aldose are drawn from opposite ends of the parent, so
   *      swapping one for the other teleports the phosphate the whole length
   *      of the molecule and says the phosphate moved. It does not — the
   *      NUMBERING flips, C1 of a ketose being C3 of the aldose. A proper
   *      rotation, so it cannot mint an enantiomer: the new stereocentre is
   *      made by beat 1, not by this.
   *
   * AND IT CHANGES MOLECULES HALFWAY THROUGH THE TURN. The swap has to happen
   * somewhere and every choice shows a seam: the carbons superimpose exactly
   * under the flip but the phosphate does not — the two specs grow it into
   * different rotamers about a free rotor, which means nothing chemically.
   * Swapping at either END of the turn shows that as the phosphate twitching,
   * on the one step whose point is that the phosphate does not move. At the
   * halfway point the molecule is EDGE-ON — foreshortened to a line, so a
   * rotamer's worth of depth is the least visible it will ever be, and the eye
   * is tracking a turn besides. One continuous turn, two molecules, and the
   * product arrives already facing the way its lane mate does.
   *
   * ONE LANE RUNS. A lane already holding the product has no `movingH`, so
   * this skips it — exactly as the hotspot skips it. Nothing enters and
   * nothing leaves: no carrier, no flight, and the ledger stays still.
   */
  verb('iso', {
    dur: () => T.HOP + T.ISO_HOLD + T.ISO_TURN,
    lane(c) {
      const mol = meta(c.spec), u = c.lane.g.userData;
      if (mol.movingH == null) return;
      const from = u.atomWorld(mol.movingH).clone(), to = u.atomWorld(mol.cN[1]).clone();
      // the C–H that breaks, in hydrogen steel — fx.js's default gold would
      // read as the carbonyl that is about to form beside it
      FX.spawnRing(from, H_LEAVE);
      shedAtoms(c.lane, [mol.movingH]);
      // A PROTON, so '+': the same cis-enediol a ring-opening isomerase runs,
      // a base taking the H off one carbon and putting it back on the next
      // with the electrons left behind in the molecule.
      hop(from, to);
      // …and the C=O that forms where it left, as the proton lands. Positions
      // are read BEFORE the turn starts, so they are the geometry on screen.
      const c3 = u.atomWorld(mol.cN[2]).clone();
      later(() => FX.spawnRing(c3, PAL.atoms.O), T.HOP);
      // EVERY BEAT BELOW HANGS OFF WHEN THE PROTON LANDS, which is HOP — not a
      // flight time, which only ever stood in for it while the hop ran at
      // fx.js's 0.5 s default and would start the turn with it still in air.
      const HALF = T.ISO_TURN / 2;
      later(() => MO.seq([{dur: HALF / 1000, ease: 'inQuad',
        onUpdate: e => { c.lane.g.rotation.x = e * Math.PI / 2; }}], {tag: TAG}),
        T.HOP + T.ISO_HOLD);
      later(() => {
        host.swapLane(c.j, c.key);
        const g2 = lanesNow()[c.j].g;
        g2.rotation.x = -Math.PI / 2;
        MO.seq([{dur: HALF / 1000, ease: 'outQuad',
          onUpdate: e => { g2.rotation.x = (e - 1) * Math.PI / 2; }}], {tag: TAG});
      }, T.HOP + T.ISO_HOLD + HALF);
    }});

  /* ---- THE ONE VERB THAT IS ABOUT THE LANE COUNT ----------------------
   * A cleavage: flash at the bond, then the halves part into lanes. Both spawn
   * at the centre and are eased outward by the render loop, so the carbons
   * visibly become two molecules rather than cutting to a new layout.
   *
   * `whole`, not `lane`, and it owns its own completion — everything else here
   * is "what happens to a molecule", and this is "how many molecules there
   * are". It also returns lanes to the page already correct, so the caller
   * must not respawn them.
   */
  verb('split', {
    dur: () => T.SPLIT,
    whole(c) {
      const l = lanesNow()[0], cl = meta(c.spec).cleave;
      const mid = l.g.userData.atomWorld(cl[0]).add(l.g.userData.atomWorld(cl[1]))
                   .multiplyScalar(.5);
      FX.spawnRing(mid, CLEAVE);
      const fromY = l.g.position.y;    // both halves start where the whole was
      // x=0 so they part from the centre; the module eases them out to `tx`
      host.spawnLanes(c.keys, (o, j) => {
        o.g.position.set(0, fromY, 0);
        o.g.userData.tx = host.laneOrigin(o.key, j, c.n);
      });
      // The parting is a render-loop ease, so in a hidden tab it never ran;
      // land them on their marks here so the halves can't come back stacked.
      later(() => { host.settleLanes(); c.land(); }, T.SPLIT);
    }});

  /* =====================================================================
   *  THE CITRIC-ACID CYCLE'S FIVE
   * =====================================================================
   * Everything above is glycolysis's vocabulary — phosphoryl transfers, a
   * cleavage, a dehydration, an isomerisation. The cycle needs none of those
   * twice and five it has no word for: carbon leaves as CO₂, two molecules
   * become one, a thioester is made and spent, water adds across a double
   * bond, and a flavin takes two hydrogens instead of one hydride.
   *
   * THE HANDLE IS A WHOLE MOLECULE, which is what separates these from the
   * verbs above. A phosphoryl is four atoms and flies as a fragment; coenzyme
   * A is seventy and arrives and leaves intact, so it is flown as a spec by
   * `handleFly` and named in the air like any other free molecule. That size
   * is the lesson (mol-krebs.js's header): acetyl-CoA delivers two carbons on
   * a carrier twenty times their mass.
   */

  // O=C=O, measured. Not in SkelLib's table: `CdO` is 1.23 Å, the carbonyl and
  // carboxylate length, and CO₂'s cumulated double bonds are shorter than
  // either. Scaled here because `expel` works in world space.
  const CO2_CO = 1.16;
  // A thioester's bond, in sulfur's own colour — the one bond these five steps
  // make and break, and the reason a two-carbon fragment is worth carrying.
  const THIO = () => PAL.atoms.S;

  /* THE CARBON THAT LEAVES, AS A MOLECULE. The carboxylate named by the spec's
   * `decarb` plus its two oxygens, taken off the substrate and reassembled
   * linear — `expel`'s contract, and the reason the CO₂ you exhale is visibly
   * made of the acid that was on stage rather than spawned beside it.
   *
   * THE ANGLE OPENS, and that is not decoration: a carboxylate's O–C–O is
   * about 124° and CO₂'s is 180°, so the group straightening as it leaves is
   * the sp² carbon becoming sp. Both oxygens keep their own side of the
   * carbon and the plane they already shared, so the opening happens in the
   * plane the eye is watching.
   */
  function carbonAway(l, cIdx) {
    const spec = specOf(l.key), u = l.g.userData;
    const oIdx = terminalO(spec, cIdx);
    if (cIdx == null || oIdx.length !== 2) return null;
    // The C–C bond that breaks — kit/molgraph.js's, so the ring the student
    // clicks and the ring this fires are derived once and cannot point at
    // different bonds.
    const lb = MolGraph.leavingBond(spec, cIdx);
    const stem = lb && lb[1];
    const pC = u.atomWorld(cIdx).clone();
    const pO = oIdx.map(i => u.atomWorld(i).clone());
    if (stem != null) FX.spawnRing(pC.clone().lerp(u.atomWorld(stem), 0.5), CLEAVE);
    shedAtoms(l, [cIdx, ...oIdx]);
    const d = CO2_CO * MolLib.SCALE;
    let ax = pO[0].clone().sub(pO[1]);
    if (ax.lengthSq() < 1e-6) ax.set(1, 0, 0);
    ax.normalize();
    const t = [pC.clone().addScaledVector(ax, d), pC.clone().addScaledVector(ax, -d)];
    return expel(l, [{el: 'C', at: pC}, {el: 'O', at: pO[0]}, {el: 'O', at: pO[1]}],
                 {gather: t, bonds: [[pC, t[0]], [pC, t[1]]]});
  }

  /* COENZYME A, ARRIVING OR LEAVING WHOLE. `host.handleSpec()` is the page's,
   * for the same reason `donorSpec` is: which molecule the acyl group rides is
   * the lesson's bookkeeping, and this module only ever asks for one.
   *
   * IT COMES FROM AND GOES TO THE SOLVENT EDGE, not a tray tile. CoA is not a
   * carrier the ledger counts — nothing is spent when it binds — so a tile
   * would put it in the same column as NAD⁺ and imply it is consumed. It is
   * borrowed and given back, which is what entering and leaving frame says.
   */
  /* THE SEAT IS A WORLD POINT, NOT AN ATOM INDEX, and that is the whole of a
   * bug this signature used to invite. A departing CoA leaves from a sulfur the
   * molecule on stage HAS, so its index reads off that molecule's meshes. An
   * arriving one lands on a sulfur the molecule on stage DOES NOT HAVE YET —
   * the lane still holds pyruvate until the step lands — so the index belongs
   * to the product and means nothing on the substrate. Index 48 against
   * pyruvate's six atoms is undefined, which fell through to the lane's origin:
   * seventy atoms of coenzyme A docking at a point in the middle of a
   * three-carbon acid, and the sulfur-yellow ring marking the new C–S bond
   * fired there too. It looked near enough to be invisible.
   * So the caller resolves the point — off the meshes when the atom exists, off
   * the PRODUCT'S SPEC when it does not (`siteWorld`, which is what `in` uses
   * for exactly this reason) — and this only flies to it. */
  function handleFly(seat, dir) {
    const spec = host.handleSpec && host.handleSpec();
    if (!spec || !seat) return null;
    /* WHERE IT COMES FROM AND GOES BACK TO IS THE PAGE'S, exactly as a carrier
     * tile is: whether this lesson gives coenzyme A somewhere to stand is a
     * question about the stage, and the module has no business assuming. A page
     * that answers puts the flight on a tile the student can see it leave; a
     * page that does not gets the solvent edge, which is the honest fallback
     * for a molecule that is simply somewhere in the matrix. */
    const home = (host.handlePoint && host.handlePoint(seat))
              || offstage(seat, dir === 'on' ? TOP_EDGE : EXIT_EDGE);
    // the C–S bond, on the beat it forms or breaks
    const ring = () => FX.spawnRing(seat, THIO());
    /* THE TILE EMPTIES AND FILLS AT WHICHEVER END YOU CAN SEE IT HAPPEN — the
     * rule `ox` argues for carriers. Arriving on the molecule, CoA has left the
     * tray the moment the flight STARTS; leaving the molecule, it is back only
     * when the flight LANDS. Either way the tile changes on the frame the
     * student is looking at the change. */
    const moved = () => { if (host.onHandleMoved) host.onHandleMoved(dir); };
    if (dir === 'on') { moved(); return flyFree(spec, home, seat, T.HANDLE, ring); }
    ring();
    const all = spec.atoms.map((_, i) => i);
    const cIdx = spec.atoms.findIndex(a => a.el !== 'H');
    const g = GO.launch(GO.fragment(spec, all, {center: cIdx < 0 ? 0 : cIdx}),
                        {from: seat, to: home, dur: T.HANDLE, arc: ARC, onDone: moved});
    labelFlyer(g, spec, holdFor(T.HANDLE));
    return g;
  }

  /* WHERE A LANE'S OWN THIOESTER SULFUR IS. Only valid while the molecule on
   * stage is the thioester — which is the case at both departures and at
   * neither arrival. Falls back to the group's origin so a spec without one
   * costs the flight its precision rather than sending it to NaN. */
  /* AN ACID PARKED BESIDE A SULFUR, not on top of it, and not level with it.
   * The lane moves as a whole, so aiming its CENTRE at the thiol buries the
   * small molecule inside the handle, and moving it in x alone leaves it under
   * the handle's body while the sulfur is up at the tail — which is the join
   * happening somewhere other than where the ring says it did.
   *
   * SO IT PARKS ON THE SULFUR'S FAR SIDE, along the line out from the handle's
   * own centre: past the thiol is the one direction with no coenzyme A in it,
   * and it is also the side the acyl group really sits on. Its own half-size,
   * off the mesh, is the clearance. */
  const _dockBox = new THREE.Box3();
  const _dockV = new THREE.Vector3();
  function dockPoint(l, seat, held) {
    _dockBox.setFromObject(l.g);
    const r = Math.max(_dockBox.max.x - _dockBox.min.x,
                       _dockBox.max.y - _dockBox.min.y,
                       _dockBox.max.z - _dockBox.min.z) * 0.5;
    const out = _dockV.copy(seat).sub(held.g.getWorldPosition(new THREE.Vector3()));
    if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
    out.normalize().multiplyScalar(r * 0.9);
    // IN THREE AXES. The thiol is tens of units deep on a molecule this long,
    // so a dock solved in the lane plane parks the acid in FRONT of the sulfur:
    // right from the opening camera, wrong the moment the student orbits.
    return {x: seat.x + out.x, y: seat.y + out.y, z: seat.z + out.z};
  }

  /* ---- AN ACYL GROUP CHANGING MOLECULES -------------------------------
   * Spending a thioester is a TRANSFER, and it should look like one: the acyl
   * group leaves the sulfur and lands on the other molecule, both of which stay
   * where they are. Flying the coenzyme A off instead draws the leaving group
   * as the event and leaves the student to work out where two carbons went.
   *
   * WHAT TRAVELS is read off the spec: the acyl carbons, plus everything hanging
   * on them that is not the sulfur — the carbonyl oxygen, and any hydrogens the
   * lane happens to be drawing. WHERE IT LANDS is the acid's own `keto`, the
   * carbon it is attacked at.
   */
  function acylPiece(held) {
    const spec = specOf(held.key), m = meta(spec);
    const carbons = m.acyl || [];
    const set = new Set(carbons);
    carbons.forEach(i => neighbors(spec, i).forEach(j => {
      if (j !== m.thiol && !carbons.includes(j)) set.add(j);
    }));
    const idx = [...set].filter(i => held.g.userData.atomMeshes[i]);
    const from = atomOn(held, m.hot);
    // Built from the meshes' OWN world positions, not the spec's, so the group
    // in the air is the shape that was standing there a frame ago.
    const g = new THREE.Group();
    const rel = i => atomOn(held, i).sub(from);
    idx.forEach(i => { const el = spec.atoms[i].el;
      g.add(Stage.atom(PAL.atoms[el], PAL.radii[el], rel(i), el)); });
    GO.link(g, (spec.bonds || []).filter(b => set.has(b[0]) && set.has(b[1]))
                                 .map(b => [rel(b[0]), rel(b[1])]));
    shedAtoms(held, idx);
    return {g, from};
  }
  function acylFly(held, acid, dur, after) {
    const {g, from} = acylPiece(held);
    const to = atomOn(acid, meta(specOf(acid.key)).keto);
    GO.launch(g, {from, to, dur, arc: ARC, onDone: () => {
      FX.spawnRing(to, PAL.atoms.C); if (after) after();
    }});
  }

  /* One atom of a molecule ON STAGE, in world space — `siteWorld` above answers
   * the same question off a SPEC, for a molecule that is not standing there yet.
   * Falls back to the lane's own origin, which is what an unknown index means. */
  function atomOn(l, i) {
    const u = l.g.userData;
    return (i != null && u.atomMeshes[i]) ? u.atomWorld(i).clone()
                                          : l.g.getWorldPosition(new THREE.Vector3());
  }
  const thiolWorld = l => atomOn(l, meta(specOf(l.key)).thiol);

  /* THE HYDRIDE A DEHYDROGENASE TAKES, toward the carrier standing opposite.
   * Shared by `decarb` and `ox`: same particle, same steel, same '−', and the
   * carrier turns over on ARRIVAL rather than when the step lands — the rule
   * `ox` argues at length above, and the reason it is one function now.
   * Answers where it left from, which the callers use to aim what comes next.
   */
  function hydrideAway(c, hIdx) {
    const at = (hIdx != null ? c.lane.g.userData.atomWorld(hIdx)
                             : anchorWorld(c.lane, c.step.anchor)).clone();
    if (hIdx != null) shedAtoms(c.lane, [hIdx]);
    const seat = c.carrier(at) || V(c.lane.g.position.x, OFFSCREEN, 0);
    hop(at, seat, '−', () => {
      host.onCarrierTaken(c.j); host.popCarrier(c.j); FX.spawnRing(seat, H_LEAVE);
    });
    return at;
  }

  /* ---- AN OXIDATIVE DECARBOXYLATION -----------------------------------
   * The cycle's signature step, and it happens twice: a carboxylate leaves as
   * CO₂ and a hydride leaves for NAD⁺. TWO DEPARTURES IN DIFFERENT
   * DIRECTIONS, which is the whole reading — the carbon goes out of the frame
   * and is gone from the cell's accounting, the electrons go to a carrier and
   * are the only thing this step was for.
   *
   * THE HYDRIDE FIRST, THE CARBON AFTER (`OX_GAP`), in causal order: the
   * alcohol is oxidised to a ketone, and only then can the β-carboxylate go.
   * Run together they read as one molecule falling apart.
   *
   * A THIOESTER FORMING ON THE WAY OUT IS `join`'S, NOT THIS ONE'S. The bridge
   * reaction and step 4 do this same chemistry and then hand what is left to
   * coenzyme A — but CoA is a whole molecule standing on the stage, so those
   * steps are two molecules becoming one and belong to the verb that owns the
   * lane count. This one is the decarboxylation alone, which is step 3: a
   * carbon and a hydride leave and nothing arrives.
   */
  verb('decarb', {
    dur: () => T.OX_GAP + T.WATER_FORM + T.WATER_DRIFT,
    lane(c) {
      const mol = meta(c.spec);
      /* A LANE WITH NO CARBOXYLATE TO LOSE IS NOT IN THIS REACTION, and it has
       * to say so before anything fires. The bridge reaction runs with
       * oxaloacetate already standing on the stage waiting for the acetyl-CoA
       * it will be joined to, and without this guard that spectator hands a
       * second hydride to NAD⁺ — one carrier, two arrivals, one of them from a
       * molecule nothing is happening to. Same rule `iso` uses: a lane the
       * step does not name is a lane the step skips. */
      if (mol.decarb == null) return;
      // The hydride only when the step banks one: the couple is what says so,
      // and a decarboxylation with no carrier must not mint an NADH.
      if (c.step.couple) hydrideAway(c, mol.hydride);
      later(() => {
        carbonAway(c.lane, mol.decarb);
        // …and the thioester, once the carbon has gone: CoA attacks what the
        // decarboxylation left, so it cannot arrive before there is a site.
        // …off the PRODUCT's spec: the lane still holds the substrate, which has
        // no sulfur at all, so this is where acetyl-CoA's WILL be.
        if (c.step.coa === 'on')
          later(() => handleFly(siteWorld(c.key, 'thiol', c.x), 'on'), T.WATER_FORM);
      }, T.OX_GAP);
    }});

  /* ---- THE SECOND VERB ABOUT THE LANE COUNT ---------------------------
   * `split` run backwards: two molecules become one. The module's structural
   * claim is unchanged — a reaction happens to a molecule, and only the COUNT
   * is a stage fact — so this is `whole` for exactly the reason that one is,
   * and reaction/check-reaction.js asserts the pair rather than the singleton.
   *
   * THEY MEET IN THE MIDDLE AND THE BOND IS RUNG THERE. Both lanes ease to
   * x=0 on the render loop, the ring fires where the new C–C forms, and only
   * then does the product replace them — so the citrate is assembled out of
   * two things that visibly arrived rather than cut to.
   *
   * THE HANDLE LEAVES AS THE BOND FORMS. Citrate synthase's acetyl group is
   * transferred, not released: CoA is the leaving group of the same event, so
   * it goes on the same beat and from the lane that brought it — found by
   * asking which substrate's spec calls itself a carrier, never by index.
   */
  verb('join', {
    // A carbon leaving first costs the step the two beats that takes. `co2` is
    // the lesson's own ledger field, so no step declares its timing twice.
    dur: st => (st && st.co2 ? T.OX_GAP + T.WATER_FORM : 0) + T.JOIN + T.PLAIN,
    whole(c) {
      const ls = lanesNow();
      const mid = ls.reduce((v, l) => v.add(l.g.getWorldPosition(new THREE.Vector3())),
                            new THREE.Vector3()).multiplyScalar(1 / Math.max(1, ls.length));
      /* ---- THE CARBON GOES BEFORE THE JOIN, where there is one ----------
       * An α-keto acid dehydrogenase complex sheds CO₂ and hands what is left
       * to coenzyme A, and those are one enzyme's two half-reactions in that
       * order: there is no acetyl group to give away until the carboxylate has
       * gone. So the acid empties first and the molecules close afterwards,
       * and the student watches a three-carbon molecule become a two-carbon
       * one before anything joins it.
       * WHICH LANE, off its own spec: the one that names a carboxylate to
       * lose. Citrate synthase has none and skips all of this. */
      const acid = ls.find(l => meta(specOf(l.key)).decarb != null);
      const gap = acid ? T.OX_GAP + T.WATER_FORM : 0;
      if (acid) {
        const ac = Object.assign({}, c, {lane: acid});
        if (c.step.couple) hydrideAway(ac, meta(specOf(acid.key)).hydride);
        later(() => carbonAway(acid, meta(specOf(acid.key)).decarb), T.OX_GAP);
      }
      /* ---- AND THE HANDLE LEAVES ONLY IF THE PRODUCT IS NOT ONE -----------
       * Both kinds of join have a molecule on stage whose metadata calls
       * itself a carrier, and they mean opposite things. At citrate synthase
       * it is acetyl-CoA, and the CoA is the leaving group: the product is a
       * plain acid, so the handle goes back to the pool. At the bridge it is
       * free coenzyme A arriving, and the product IS the thioester — so
       * nothing leaves, and flying it away here would delete the molecule the
       * step just made. The product answers which case this is. */
      const releases = !meta(c.product).carrier;
      const held = ls.find(l => meta(specOf(l.key)).carrier);
      /* ---- WHERE THEY CLOSE, AND IT IS NOT ALWAYS THE MIDDLE --------------
       * A thioester forming has a place the acyl group has to REACH: coenzyme
       * A's sulfur, at one end of a 23-atom handle. Closing on the midpoint
       * leaves the two carbons in the centre of the frame and the new bond off
       * at the tail, which is a join the student cannot find. So the acid
       * travels to the thiol and the handle holds still. A join that RELEASES
       * the handle (citrate synthase) keeps the midpoint: there the product is
       * the acid, and nothing has to arrive anywhere in particular. */
      const other = held ? ls.find(l => l !== held) : null;
      if (releases && held && other) {
        // The acyl group crosses; both molecules hold their ground, so the lanes
        // are spawned on their own marks rather than closed onto one.
        later(() => acylFly(held, other, T.JOIN), gap);
        later(() => {
          /* EACH PRODUCT KEEPS ITS PRECURSOR'S LANE. The lane a molecule stands
           * in is the only thing telling the student which one it is: the acid
           * that was attacked is now the bigger acid, and the handle that let go
           * is standing where it was. Spawning on the default marks swaps them
           * over, and two carbons appear to have gone the other way. */
          const x = [other.g.position.x, held.g.position.x];
          host.spawnLanes(c.keys, (o, j) => { o.g.position.x = x[Math.min(j, 1)]; });
          host.settleLanes(); c.land();
        }, gap + T.JOIN + T.PLAIN);
        return;
      }
      /* ---- FORMING ONE: THEY CLOSE, AND NOT ON THE MIDDLE ------------------
       * The acyl group has a place to REACH — coenzyme A's sulfur, at one end of
       * a 23-atom handle. Closing on the midpoint leaves the two carbons in the
       * centre of the frame and the new bond off at the tail, which is a join
       * the student cannot find. So the acid travels to the thiol and the handle
       * holds still. With no handle on stage at all there is nothing to aim at,
       * and the midpoint is the honest answer. */
      const docking = held ? other : null;
      const site = () => thiolWorld(held);
      // …then they close. Eased by the render loop, so they visibly travel
      // rather than cutting to a new layout.
      later(() => {
        if (docking) { const to = dockPoint(docking, site(), held);
                       const u = docking.g.userData;
                       u.tx = to.x; u.ty = to.y; u.tz = to.z; }
        else ls.forEach(l => { l.g.userData.tx = 0; });
      }, gap);
      later(() => FX.spawnRing(docking ? site() : mid, THIO()), gap + T.JOIN);
      later(() => {
        /* THE PRODUCT TAKES THE HANDLE'S PLACE, all three axes of it. The lanes
         * carry their outgoing heights onto the incoming ones, and the acid that
         * just docked is up at the sulfur — so taking that height drops the
         * thioester in from the top of the frame, arriving from nowhere. It
         * should simply be standing where the handle was: the swap IS the
         * moment the docking finished. */
        if (docking) {
          const p = held.g.position;
          host.spawnLanes(c.keys, o => { o.g.position.copy(p); o.g.userData.tx = 0; });
        } else {
          host.spawnLanes(c.keys, o => { o.g.position.set(0, o.g.position.y, 0); });
          host.settleLanes();
        }
        c.land();
      }, gap + T.JOIN + T.PLAIN);
    }});

  /* ---- SPENDING A THIOESTER -------------------------------------------
   * CoA comes off and the bond's energy is banked. Two events, and the order
   * is the claim: the C–S breaks, and the phosphoryl that reaches the carrier
   * is paid for by that break. Run the other way round it looks like a kinase
   * step that happens to shed a cofactor.
   *
   * THE PHOSPHATE IS FREE, NOT THE MOLECULE'S. Succinyl-CoA has no phosphate
   * to give — the Pᵢ comes out of solution, is handed to the nucleotide, and
   * only the thioester's energy makes that possible. So the leg is `flyFree`
   * from the solvent edge to the carrier tile, never `flyPhosphate` off the
   * substrate, which would draw a phosphate the substrate never had.
   */
  verb('thioester', {
    dur: () => T.HANDLE + T.DRIFT + T.FLY + T.PLAIN,
    /* WHOLE, BECAUSE IT CHANGES THE LANE COUNT — `split`'s reason. One molecule
     * ends the step as two, and a per-lane body cannot spawn a lane that has no
     * substrate standing in it.
     *
     * THE ORDER IS THE CLAIM. The acyl group comes off the sulfur and WAITS
     * there while the phosphate reaches ADP: what pays for the ATP is the bond
     * that just broke, and a piece already settled into its new lane before the
     * phosphate moves says the two things merely happened near each other. Only
     * then does it cross to its own lane and become the acid.
     */
    whole(c) {
      const l = lanesNow()[0];
      if (!l) return c.land();
      const seat = thiolWorld(l);
      FX.spawnRing(seat, THIO());
      const {g, from} = acylPiece(l);
      GO.hold(g); g.position.copy(from);
      // A short pull straight off the sulfur, along the line out from the
      // handle: far enough to read as detached, near enough to still be its.
      const wait = from.clone().sub(l.g.getWorldPosition(V(0, 0, 0)))
                       .normalize().multiplyScalar(3.2).add(from);
      const leg = (a, b, ms, ease) => MO.seq([{dur: ms / 1000, ease,
        onUpdate: e => { g.position.lerpVectors(a, b, e); }}], {tag: TAG});
      leg(from, wait, T.HANDLE, 'outQuad');

      const free = host.freeSpec && host.freeSpec();
      if (c.step.couple && free) later(() => {
        const to = c.carrier(seat) || V(l.g.position.x, -OFFSCREEN, 0);
        flyFree(free, offstage(seat), to, T.DRIFT, () => {
          const at = c.carrierBond(); FX.spawnRing(at || to, PAL.atoms.P);
          host.onCarrierTaken(c.j); host.popCarrier(c.j);
        });
      }, T.HANDLE);

      // …and then it takes the lane the acid will stand in.
      const home = V(host.laneOrigin(c.keys[0], 0, c.keys.length),
                     host.laneBase(c.keys[0]), 0);
      later(() => leg(wait, home, T.FLY, 'inOutQuad'), T.HANDLE + T.DRIFT);
      later(() => {
        GO.drop(g);
        // The acid is already standing on that mark; the handle stays where the
        // thioester stood and eases out to the lane it now has to itself.
        const was = l.g.position.x;
        host.spawnLanes(c.keys, (o, j, n) => {
          /* ON ITS OWN BASELINE, both of them. The lanes carry the outgoing
           * height onto the incoming ones, and a thioester sits lower than the
           * acid it becomes — so the acid rises into place from below, arriving
           * from somewhere the piece never was. */
          o.g.position.y = host.laneBase(o.key);
          if (j === 0) return;                       // the acid is already there
          o.g.position.x = was;
          o.g.userData.tx = host.laneOrigin(o.key, j, n);
        });
        c.land();
      }, T.HANDLE + T.DRIFT + T.FLY);
    }});

  /* ---- WATER ADDING ACROSS A DOUBLE BOND ------------------------------
   * `lose` run backwards, and drawn as its mirror on purpose: the same two
   * pieces, the same C–O and C–H rings, the same molecule — arriving instead
   * of leaving. A student who has watched enolase should recognise fumarase
   * as the same event with the arrow turned round, which is exactly what
   * being near equilibrium means.
   *
   * IT ARRIVES AS A WATER AND LANDS AS TWO PIECES. The molecule flies in
   * whole, because that is what is in the matrix; the –OH and the –H then
   * appear on the two carbons the alkene used to join. `ene` names those two
   * and the product's own `oh` names where the hydroxyl goes, so nothing here
   * is typed against a coordinate.
   */
  verb('hydrate', {
    dur: () => T.DRIFT + T.HOP,
    lane(c) {
      const water = host.waterSpec && host.waterSpec();
      const ene = meta(c.spec).ene;
      if (!water || !ene) return;
      const u = c.lane.g.userData;
      const mid = u.atomWorld(ene[0]).clone().add(u.atomWorld(ene[1])).multiplyScalar(0.5);
      flyFree(water, offstage(mid), mid, T.DRIFT, () => {
        // the C=C going to a single bond is what the water paid for, so the
        // ring goes on the bond, not on either carbon
        FX.spawnRing(mid, PAL.atoms.O);
        // …and the hydroxyl's own site on the product, a beat later, so the
        // two halves of the addition are two events
        const oh = meta(c.product).oh;
        if (oh != null)
          later(() => FX.spawnRing(siteWorld(c.key, 'oh', c.x), PAL.atoms.O), T.HOP);
      });
    }});

  /* ---- A FLAVIN TAKING TWO HYDROGENS ----------------------------------
   * NOT `ox`, and the difference is the point of FAD being here at all. A
   * dehydrogenase handing NAD⁺ a hydride moves ONE particle; succinate
   * dehydrogenase removes one hydrogen from each of two adjacent carbons and
   * the alkene closes between them. Two hops, staggered so they are two, and
   * the C=C rung where it forms once both have gone — which is why this
   * oxidation makes a weaker carrier's worth of electrons and the lesson can
   * say so without asserting a number.
   *
   * THE ELIMINATION IS ANTI, and the spec is built trans because of it
   * (mol-krebs.js). Nothing here can show the stereochemistry — the two H's
   * leave toward the same tile — so the fact lives in the product's geometry
   * and the step's prose, not in a motion that would only imply it.
   */
  verb('dehydro', {
    dur: () => T.HOP + T.OX_GAP + T.HOP,
    lane(c) {
      /* THE HYDROGENS THEMSELVES where the spec draws them, and the carbons they
       * sat on where it does not. `dehydroH` names the anti pair succinate
       * dehydrogenase takes — one off each carbon, opposite faces — so what
       * leaves the screen is what leaves the molecule. */
      const m = meta(c.spec);
      const cs = m.dehydroC;
      if (!cs || cs.length !== 2) return;
      const u = c.lane.g.userData;
      const hs = (m.dehydroH || []).filter(i => u.atomMeshes[i]);
      const ene = meta(c.product).ene;
      const src = hs.length === 2 ? hs : cs;
      src.forEach((ci, k) => later(() => {
        const at = u.atomWorld(ci).clone();
        /* it left, so it should look left — and on a spec that drew no C–H
         * (@undrawn) there is nothing to remove and the glow starts at the
         * carbon (tools/check-pages.js). */
        if (hs.length === 2) shedAtoms(c.lane, [ci]);
        const seat = c.carrier(at) || V(c.lane.g.position.x, OFFSCREEN, 0);
        // the FIRST arrival turns the flavin over; the second lands on a
        // carrier already holding one, so it must not pop the tile twice
        hop(at, seat, '−', () => {
          FX.spawnRing(seat, H_LEAVE);
          if (k === 0) { host.onCarrierTaken(c.j); host.popCarrier(c.j); }
        });
      }, k * T.OX_GAP));
      later(() => {
        if (!ene) return;
        // MIDPOINT OF THE BOND THAT FORMS, off the PRODUCT's own alkene pair —
        // `siteWorld` takes one atom and this is two, so the two ends are
        // placed and averaged here rather than given a helper of their own.
        const y = host.laneBase(c.key);
        FX.spawnRing(specWorld(c.product, ene[0], c.x, y)
                       .add(specWorld(c.product, ene[1], c.x, y)).multiplyScalar(0.5),
                     PAL.atoms.C);
      }, T.HOP + T.OX_GAP);
    }});

  /* ---- A HYDROXYL THAT MOVES ONE CARBON OVER --------------------------
   * `move` for a hydroxyl instead of a phosphoryl, and the same reading: what
   * leaves is what arrives, so the molecule is not quietly swapped for one
   * with an –OH somewhere else. Aconitase is the whole reason the cycle has a
   * step that changes nothing you can count — citrate's hydroxyl is on a
   * TERTIARY carbon and cannot be oxidised to a ketone, isocitrate's is on a
   * secondary one and can, so this step exists to make the next one possible.
   *
   * DRAWN AS ONE GROUP CROSSING, which is a stated simplification. Aconitase
   * really eliminates water to cis-aconitate and adds it back on the far face,
   * so the oxygen that lands is not the oxygen that left. Before and after are
   * identical either way, and "the hydroxyl moved" is the fact the next step
   * needs — the same trade `move` makes for the mutase, argued the same way.
   */
  verb('shift', {
    dur: () => T.FLY,
    lane(c) {
      const oI = meta(c.spec).oh, dst = meta(c.product).oh;
      if (oI == null || dst == null) return;
      const u = c.lane.g.userData;
      const hI = neighbors(c.spec, oI).find(i => c.spec.atoms[i].el === 'H');
      const from = u.atomWorld(oI).clone();
      const to = siteWorld(c.key, 'oh', c.x);
      // the C–O that breaks, ringed at the junction it breaks from
      const stem = neighbors(c.spec, oI).find(i => c.spec.atoms[i].el === 'C');
      if (stem != null) FX.spawnRing(from.clone().lerp(u.atomWorld(stem), 0.5), PAL.atoms.O);
      const idx = hI == null ? [oI] : [oI, hI];
      const g = GO.launch(GO.fragment(c.spec, idx, {center: oI}),
                          {from, to, dur: T.FLY, arc: ARC});
      shedAtoms(c.lane, idx);
      // …and the bond it makes at the other end, on the beat it lands
      later(() => FX.spawnRing(to, PAL.atoms.O), T.FLY);
      return g;
    }});

  /* =============================================================
   *  UNFURLING A RING INTO ITS OPEN CHAIN
   * ============================================================= */
  const AX = new THREE.Vector3(), Q = new THREE.Quaternion(), PV = new THREE.Vector3();
  /* DELIBERATELY NOT MolGraph.torsion, which is the plane-normal form and
   * returns the OTHER sign. That one is right for stereochemistry (a mirrored
   * spec must flip it, which kit/check-kit.js asserts); this one is right for
   * driving a chain to anti. Swapping them silently folds the molecule
   * eclipsed while every printed dihedral still reads 180°. */
  function dihedralOf(p0, p1, p2, p3) {
    const b1 = p2.clone().sub(p1).normalize();
    const b0 = p0.clone().sub(p1), b2 = p3.clone().sub(p2);
    const v = b0.clone().addScaledVector(b1, -b0.dot(b1));   // components across b1
    const w = b2.clone().addScaledVector(b1, -b2.dot(b1));
    return Math.atan2(b1.clone().cross(v).dot(w), v.dot(w));
  }
  /* THE PLAN, solved once at the top of the step: each backbone dihedral to
   * anti, THE SHORT WAY ROUND, plus where the chain comes to rest.
   *
   * A dihedral needs four atoms, so the FIRST bond has no backbone atom to
   * measure from and its reference is the ring oxygen. Without it the first
   * carbon keeps its pucker and the chain arrives bent at the end the reaction
   * is about.
   *
   * WHERE IT COMES TO REST: the unfurled chain and the product are the same
   * shape at different angles, so the molecule turns onto the product's axis
   * as it opens and the swap then changes only what the reaction changed. A
   * WHOLE FRAME, not just the axis — matching the two ends alone leaves the
   * chain free to ROLL, landing the middle atoms on the wrong side. The second
   * axis is a mid-chain offset, so the zigzag plane gets matched too. */
  function unfurlPlan(l, productKey) {
    const spec = specOf(l.key), mol = meta(spec), u = l.g.userData;
    const cN = mol.cN; if (!cN || !mol.open) return null;
    const br = mol.open;
    // Everything past the bond, found through the GRAPH, not chain order. Two
    // cuts: the bond being turned, and the ring bond already broken.
    const beyond = (from, thru) =>
      MolGraph.component(spec, thru, [[from, thru], br]).filter(i => i !== from);
    const base = u.atomMeshes.map(m => m ? m.position.clone() : null);
    // The double bonds' groups carry buildMolecule's centring offset while
    // their sticks keep build coordinates; unfurlApply addresses those sticks in
    // the molecule's frame, so the transform is flattened first.
    Stage.flattenBonds(l.g);
    const turns = [];
    for (let i = 0; i < cN.length - 2; i++) {
      const prev = i > 0 ? cN[i - 1] : (mol.anomeric && mol.anomeric.o);
      const a = cN[i], b = cN[i + 1], next = cN[i + 2];
      if (prev == null || !base[prev]) continue;
      const d0 = dihedralOf(base[prev], base[a], base[b], base[next]);
      // ±π are the same conformation, so take whichever is nearer
      turns.push({a, b, delta: (d0 >= 0 ? Math.PI : -Math.PI) - d0, set: beyond(a, b)});
    }
    const plan = {base, turns};
    const pos1 = unfurlPos(plan, 1);
    const f = specOf(productKey), fc = meta(f).cN;
    if (!fc) return plan;
    const fp = i => new THREE.Vector3().fromArray(f.atoms[fc[i]].pos);
    const frame = (p0, pN, pMid) => {
      const ax = pN.clone().sub(p0).normalize();
      const v = pMid.clone().sub(p0);
      v.addScaledVector(ax, -v.dot(ax));
      if (v.lengthSq() < 1e-6) return null;      // a straight line has no plane
      v.normalize();
      return new THREE.Matrix4().makeBasis(ax, v, ax.clone().cross(v));
    };
    const A = frame(pos1[cN[0]], pos1[cN[cN.length - 1]], pos1[cN[2]]);
    const B = frame(fp(0), fp(fc.length - 1), fp(2));
    plan.qEnd = A && B
      ? new THREE.Quaternion().setFromRotationMatrix(B.multiply(A.invert()))
      : new THREE.Quaternion();
    // THE LABEL CLIMBS WITH IT. A chain is taller than its ring, so a name
    // pinned at the ring's height ends up written across the molecule.
    plan.topY0 = l.topY;
    plan.topY1 = host.plateY([productKey]);
    return plan;
  }
  // Conformation at t, from the starting coordinates every time — each turn
  // leaves the others' dihedrals alone, so this cannot drift.
  function unfurlPos(plan, t) {
    const pos = plan.base.map(p => p ? p.clone() : null);
    plan.turns.forEach(tn => {
      AX.subVectors(pos[tn.b], pos[tn.a]).normalize();
      Q.setFromAxisAngle(AX, tn.delta * t);
      PV.copy(pos[tn.a]);
      tn.set.forEach(i => { const p = pos[i]; if (p) p.sub(PV).applyQuaternion(Q).add(PV); });
    });
    return pos;
  }
  function unfurlApply(l, plan, t) {
    const u = l.g.userData;
    const pos = unfurlPos(plan, t);
    // KEEP IT CENTRED ON ITS OWN BOX, as Stage.buildMolecule does. Unfurling
    // about fixed coordinates walks the molecule out of frame and snaps back
    // on the swap. Middle of the extent, not mean of the atoms, so one long
    // arm cannot drag it off centre.
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    pos.forEach(p => { if (!p) return;
      for (let k = 0; k < 3; k++) { const v = p.getComponent(k);
        lo[k] = Math.min(lo[k], v); hi[k] = Math.max(hi[k], v); } });
    const mid = new THREE.Vector3(...lo.map((v, k) => (v + hi[k]) / 2));
    pos.forEach(p => { if (p) p.sub(mid); });
    // the turn onto the product's axis, and the label's climb, ride the same t
    if (plan.qEnd) l.g.quaternion.identity().slerp(plan.qEnd, t);
    if (plan.topY1 != null) l.topY = plan.topY0 + (plan.topY1 - plan.topY0) * t;
    pos.forEach((p, i) => { const m = u.atomMeshes[i]; if (m && p) m.position.copy(p); });
    u.bondMeshes.forEach(bm => {
      const [i, j] = bm.userData.pair;
      if (!pos[i] || !pos[j]) return;
      // A DOUBLE BOND IS TWO STICKS IN A PLANE, and the plane turns with the
      // conformation — so it is recomputed each frame from the neighbour
      // scene.js drew it against. Skipping it leaves the pair parked where the
      // ring was: G6P's P=O, floating beside the chain it belongs to.
      const k = bm.userData.perpRef;
      Stage.placeBond(bm, pos[i], pos[j],
        k != null && pos[k] ? Stage.doublePerp(pos[i], pos[j], pos[k]) : null);
    });
  }

  /* =============================================================
   *  THE ELECTRON TRANSPORT CHAIN — a charge moves and no atom does
   * =============================================================
   * Every verb above moves ATOMS. The chain's two new events are about an
   * electron on its own: it leaves a reduced carrier for an oxidised one, and
   * at the end four of them and four protons turn O₂ into two waters. The
   * courier is fx.js's proton hop wearing an e⁻ badge in the electron's own
   * colour, so a hydride (proton plus two electrons) and a bare electron are
   * visibly different particles.
   */
  const eBadge = () => KIT.charge('e⁻', '#' + ELECTRON.toString(16).padStart(6, '0'), 'H', BADGE_SCALE);
  const eHop = (from, to, onArrive) =>
    FX.protonHop(from, to, onArrive || null, {color: ELECTRON, dur: T.HOP / 1000, carry: eBadge()});
  /* AN ELECTRON LEAVING FOR SOMEWHERE THE STAGE DOES NOT SHOW: complex III's
   * second electron goes round the Q cycle to a second cytochrome c, and the
   * stage holds one. It crosses the frame and fades rather than landing on a
   * molecule it would be lying about. */
  const eAway = from => FX.protonHop(from, from.clone().add(acrossFrame()), null,
    {color: ELECTRON, dur: T.H_LEAVE_MS / 1000, away: true, carry: eBadge()});

  /* ---- A REDUCED CARRIER HANDING ONE ELECTRON TO THE NEXT ---------------
   * Ubiquinol at complex III: two electrons and two protons leave it. One
   * electron reaches the cytochrome on stage (the carrier seat), the other
   * leaves the frame for the Q cycle, and the two hydroxyl protons go to the
   * intermembrane side — up and out, the way a departing proton always goes
   * here. `redox` names the hydrogens, `eFrom` the ring atom the charge is
   * drawn leaving from; both are the spec's.
   */
  verb('electron', {
    dur: () => T.HOP + T.OX_GAP + T.HOP,
    lane(c) {
      const m = meta(c.spec), u = c.lane.g.userData;
      if (m.eFrom == null) return;
      const from = u.atomWorld(m.eFrom).clone();
      const seat = c.carrier(from) || V(c.lane.g.position.x, OFFSCREEN, 0);
      FX.spawnRing(from, ELECTRON);
      eHop(from, seat, () => {
        host.onCarrierTaken(c.j); host.popCarrier(c.j); FX.spawnRing(seat, ELECTRON);
      });
      // the protons: shed, and away — they are what the gradient is made of
      (m.redox || []).forEach(h => {
        if (!u.atomMeshes[h]) return;
        const at = u.atomWorld(h).clone();
        shedAtoms(c.lane, [h]);
        protonAway(at);
      });
      later(() => eAway(u.atomWorld(m.eFrom).clone()), T.OX_GAP);
    }});

  /* ---- OXYGEN TAKING ELECTRONS AND BECOMING WATER ---------------------
   * Complex IV. The cytochrome on stage gives up its electron to the O₂
   * beside it; then the O=O breaks, and each oxygen collects two protons out
   * of the matrix and leaves as a water. Four electrons and four protons are
   * what two waters cost, and the stage shows one cytochrome deliver one:
   * the count is the step's `state()` to print, not something the picture
   * can multiply.
   *
   * The waters are assembled the way a dehydration's is (expel): loose atoms
   * converging into real H–O–H geometry, bonds drawn only once they have
   * arrived, then the molecule drifts off frame.
   */
  verb('reduce', {
    dur: () => T.HOP + T.OX_GAP + T.WATER_FORM + T.WATER_DRIFT,
    lane(c) {
      const m = meta(c.spec), u = c.lane.g.userData;
      if (m.fe == null) return;
      const from = u.atomWorld(m.fe).clone();
      const seat = c.carrier(from) || V(c.lane.g.position.x, OFFSCREEN, 0);
      FX.spawnRing(from, ELECTRON);
      eHop(from, seat, () => {
        host.onCarrierTaken(c.j); FX.spawnRing(seat, ELECTRON);
        // the O=O comes apart: the partner lane's own atoms, asked of the host
        const o2 = host.oxygenLane && host.oxygenLane();
        if (!o2) return;
        const os = o2.g.userData.atomMeshes.map((mm, i) => mm ? i : -1).filter(i => i >= 0);
        const pO = os.map(i => o2.g.userData.atomWorld(i).clone());
        if (pO.length === 2) FX.spawnRing(pO[0].clone().lerp(pO[1], 0.5), CLEAVE);
        later(() => {
          GO.shed(o2.g, os);
          const OHW = SkelLib.GL.OH * MolLib.SCALE;
          pO.forEach((p, k) => {
            // two protons arrive from solution, one from each side of the
            // frame edge above the oxygen, and fold to the real angle
            const d1 = screenRight(1).normalize().multiplyScalar(k ? -1 : 1);
            const nrm = V(0, 0, 1);
            const t1 = p.clone().add(d1.clone().multiplyScalar(OHW));
            const t2 = p.clone().add(d1.clone().applyAxisAngle(nrm, HOH).multiplyScalar(OHW));
            const h1 = offstage(t1), h2 = offstage(t2, 1.2);
            expel(c.lane, [{el: 'O', at: p}, {el: 'H', at: h1}, {el: 'H', at: h2}],
                  {gather: [t1, t2], bonds: [[p, t1], [p, t2]]});
          });
        }, T.OX_GAP);
      });
    }});

  /* =============================================================
   *  DISPATCH
   * ============================================================= */
  const defOf = st => (st && verbs[st.fx]) || null;
  // A verb that names no animation is a plain swap, and takes a beat to read.
  const durOf = st => { const d = defOf(st); return d ? d.dur(st) : T.PLAIN; };
  const isWhole = st => { const d = defOf(st); return !!(d && d.whole); };

  // The per-lane context. `keys` is the step's resulting species, so a lane's
  // product is `keys[j]` and the lane count after the step is `keys.length`.
  function ctx(st, j, keys) {
    const lane = lanesNow()[j];
    const key = keys[Math.min(j, keys.length - 1)];
    const n = keys.length;
    const x = host.laneOrigin(key, j, n);
    return {
      step: st, j, lane, key, n, keys,
      spec: lane ? specOf(lane.key) : null,
      product: specOf(key),
      x,
      carrier: ref => host.carrierPoint(st, ref, j),
      // …and where its reacting bond is, for the mark on the arriving end.
      carrierBond: () => host.carrierBond ? host.carrierBond(st, j) : null,
    };
  }

  /* ONE LANE OF A STEP. The same body the whole-step route runs, so the two
   * cannot drift into telling different stories — which is the defect that
   * created this module. */
  function lane(st, j, keys) {
    const d = defOf(st);
    if (!d || !d.lane) return;
    const c = ctx(st, j, keys);
    if (c.lane) d.lane(c);
  }
  /* EVERY LANE. `land` is the caller's completion — NOT the lesson's `done`,
   * which is a step counter this module must never touch. It is invoked by
   * `split` itself (it changes the lane count, so the page must not respawn
   * behind it) and by the caller otherwise, after `durOf`. */
  function all(st, keys, land) {
    const d = defOf(st);
    if (d && d.whole) {
      const c = ctx(st, 0, keys);
      c.land = land;
      d.whole(c);
      return true;                                 // it owns its completion
    }
    lanesNow().forEach((_, j) => lane(st, j, keys));
    return false;
  }

  return {
    verbs, verb, durOf, isWhole, lane, all, timing: T,
    // primitives, for a lesson writing a verb of its own
    later, hop, protonAway, flyPhosphate, flyFree, expel, badge,
    shedAtoms, showAtom, shedPhosphoryl, phosphorylGroup,
    specLocal, specWorld, siteWorld, junctionWorld, anchorWorld,
    terminalO, bridgeO, neighbors, leavingH,
    offstage, screenRight, acrossFrame,
    unfurlPlan, unfurlApply,
    // the DOM riding meshes in the air — a lesson's afterFrame and its cancel
    drawFlyers, clearFlyers,
    colors: {H_LEAVE, CLEAVE},
    BADGE_SCALE, OFFSCREEN, TOP_EDGE, EXIT_EDGE,
  };
}

/* =============================================================================
 *  stageHost — the half of `host` that is not a decision
 * =============================================================================
 *  `create` takes a host that answers two KINDS of question, and only one of
 *  them is a lesson's to answer:
 *
 *    "where does lane 2 sit", "swap this lane", "settle them"   → the stage
 *    "which carrier does this step couple to", "what does a
 *     phosphoryl come from", "which bond does the ring go on"   → the chemistry
 *
 *  Both pathway pages had spelled out the first kind by hand, identically, as
 *  seven one-line forwards into kit/lanes.js and kit/carriers.js — and a page
 *  writing an adapter twice is the module asking its question at the wrong
 *  altitude, not the page being repetitive. This answers the stage half from the
 *  two kit instances a pathway lesson already has, and a page spreads it and
 *  overrides only what is chemistry:
 *
 *      const RX = Reaction.create({ …wiring…,
 *        ...Reaction.stageHost({lanes:LANES, carriers:CAR, onLanes}),
 *        carrierPoint, carrierBond, donorSpec, freeSpec, … });
 *
 *  `onLanes` is the one hook, and it exists because changing the lane LIST is a
 *  stage event with a lesson consequence: both pages re-solve their camera fit
 *  on it, and each solves a different one. This fires it and says nothing about
 *  what it should do.
 *
 *  WHAT THIS MUST NEVER GROW: an answer that depends on which step is running,
 *  what has already run, or what a molecule IS. Those are the second kind, and
 *  `reaction/check-reaction.js` fails this object for naming any of them.
 * ========================================================================== */
function stageHost(o){
  // RESOLVED WHEN ASKED, not when built. Both pathway pages construct their
  // carrier column AFTER Reaction.create — the tray is chrome and the reaction
  // module is wiring — so capturing it here is a dead reference in one page and
  // a temporal-dead-zone throw in the other. A thunk is accepted for the same
  // reason a lesson may want to rebuild either instance later.
  const at=x=>typeof x==='function'?x():x;
  const L=()=>at(o.lanes), C=()=>at(o.carriers), changed=o.onLanes||function(){};
  return {
    // READ THROUGH, never cached. kit/lanes.js owns the list and rebuilds it on
    // a render or a swap, so a caller holding its own array is holding removed
    // groups for as long as it forgets to re-point.
    lanes:()=>L().lanes,
    laneOrigin:(key,i,n)=>L().origin(key,i,n),
    laneBase:key=>L().base(key),
    plateY:keys=>L().plateY(keys),
    settleLanes:()=>L().settle(),
    swapLane:(j,key)=>{ L().swapOne(j,key); changed(); },
    // The shared baseline is re-solved over the INCOMING contents — the module
    // is mid-step and one lane may already hold the product, so a plate line
    // taken from the old set puts the two names at different heights.
    spawnLanes:(keys,each)=>{ const l=L(); l.render(keys, l.plateY(keys), each); changed(); },
    popCarrier:j=>C().pop(j),
  };
}

global.Reaction = {create, stageHost, TIMING: T0, H_LEAVE, CLEAVE, BADGE_SCALE};

})(typeof window !== 'undefined' ? window : globalThis);
