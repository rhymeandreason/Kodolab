/* =============================================================================
 *  membrane/parts.js — the membrane and its machines, built from numbers.
 * =============================================================================
 *  WHY THIS EXISTS, GIVEN THAT WE HAVE THE REAL SURFACE. membrane/clip.js and
 *  proteins/napump/ hold the real structures, whose surface would be an honest
 *  pump, cut open, in a measured bilayer. That work settled what is TRUE, and
 *  it stays in the lesson as the aside that says "this is what the cartoon
 *  stands in for". But it cannot carry the lesson, for one hard reason and one
 *  soft one:
 *
 *    HARD  · a baked mesh cannot deform. The whole subject here is a protein
 *            CHANGING SHAPE — that is what a pump is. A surface that can only
 *            cross-fade between two frozen states can show the endpoints and
 *            never the mechanism.
 *    SOFT  · 160k triangles of real protein read as a lump. A student who has
 *            never seen a molecular surface cannot tell the binding site from
 *            any other dimple, and every textbook they have ever opened drew
 *            this as a smooth shape with a hole in it.
 *
 *  So the lesson's machines are procedural: a few numbers, a profile curve, and
 *  a revolution. Animating them is moving the numbers.
 *
 * -----------------------------------------------------------------------------
 *  THE ONE IDEA: A TRANSPORTER IS A PROFILE WITH TWO GATES
 * -----------------------------------------------------------------------------
 *  Look at any textbook carrier — BioRender's, StudySmarter's, anyone's. It is
 *  a two-dimensional silhouette with a funnel cut into it. That is a LATHE: a
 *  profile in the (r, y) half-plane, spun about the membrane normal.
 *
 *  Two functions define everything:
 *
 *    Ro(y)   the outside. A rounded barrel spanning the bilayer.
 *    Ri(y)   the cavity. Zero where the protein is solid on its axis.
 *
 *  and the contour is simply: up the outside, back down the inside, closed.
 *  Where Ri is zero the contour touches the axis and the protein is solid
 *  there; where Ri is positive there is a lumen.
 *
 *  Ri is built from three pieces that are MAXED together, not added:
 *
 *    pocket(y)     a bulge at mid-membrane. Always present. This is the
 *                  binding site, and it is why an occluded transporter still
 *                  has somewhere for the ion to be.
 *    throatUp(y)   a funnel widening from the site to the outer mouth.
 *    throatDown(y) the same, downward.
 *
 *  Each throat is scaled by its GATE, 0..1. And that is the entire mechanism:
 *
 *    gates (1, 0)  outward-open   — mouth up, sealed below
 *    gates (0, 0)  OCCLUDED       — sealed both ends, ion in a closed pocket
 *    gates (0, 1)  inward-open    — mouth down, sealed above
 *    gates (1, 1)  a CHANNEL      — open through, which is exactly why a
 *                                   channel is not a pump: it cannot do this
 *                                   one thing, refuse to be open at both ends.
 *
 *  That last line is the lesson. The difference between the leak and the pump
 *  is a constraint on two numbers, and a student can break it by hand and watch
 *  the gradient collapse. Nothing about that is available from a baked surface.
 *
 * -----------------------------------------------------------------------------
 *  WHAT IS EXAGGERATED, DECLARED HERE AS SCIENCE.md REQUIRES
 * -----------------------------------------------------------------------------
 *   · IONS ARE DRAWN OVERSIZE. Na+ is 1.02 A against a pump ~150 A tall. At
 *     true scale the thing the student is following is a third of a pixel.
 *     `ION.exaggeration` is the factor and it is ONE number, applied to every
 *     ion equally, so the RELATIVE sizes stay true — K+ still reads bigger than
 *     Na+, which the lesson needs, because the pump's two site types tell them
 *     apart by size. Exaggerated, not falsified.
 *   · THE PROTEIN'S SHAPE IS INVENTED. Ro and Ri are not measured from 7E1Z.
 *     The bilayer thickness IS measured (OPM's own remark, carried by
 *     proteins/napump/tools/prep.js) and the
 *     protein's height and width are set to the real one's, so the proportions
 *     are right even though the silhouette is not. A student who later sees the
 *     SES aside should recognise the same object, not a different one.
 *   · A LATHE IS ROTATIONALLY SYMMETRIC AND NO PROTEIN IS. This is the honest
 *     cost of the whole approach. It buys a cavity that is guaranteed closed,
 *     which is what clip.js's parity capping needs, and a shape that morphs by
 *     construction. `lobes` breaks the symmetry cosmetically without touching
 *     the cavity, so it never lies about the lumen.
 *
 * -----------------------------------------------------------------------------
 *  WHAT THIS OWNS vs WHAT THE PAGE OWNS
 * -----------------------------------------------------------------------------
 *    page  ·  which machines exist, where they sit, what the gates DO over
 *             time, what anything is called, when a step has run
 *    this  ·  the geometry, the materials, and setGates() being continuous so
 *             a page can drive it from any easing curve it likes
 *
 *  Loaded after scene.js (it honours Stage.toon). Exposes window.Parts, and
 *  window.Pump: the sodium pump's cycle, at the bottom of this file.
 * ========================================================================== */
(function (global) {
  'use strict';

  const THREE = global.THREE;

  /* ---------------------------------------------------------------------
     Materials. Textbook-flat: saturated, matte, no specular hotspot. A
     highlight on these shapes reads as wet plastic and fights the flat
     colour that makes them legible. Follows Stage.toon so the whole page
     switches register together.
     --------------------------------------------------------------------- */
  function flat(color, opts) {
    const o = opts || {};
    const M = (global.Stage && global.Stage.toon)
      ? new THREE.MeshToonMaterial({ color })
      : new THREE.MeshStandardMaterial({ color, roughness: .95, metalness: 0 });
    if (o.transparent) { M.transparent = true; M.opacity = o.opacity != null ? o.opacity : .5; }
    if (o.side) M.side = o.side;
    return M;
  }

  /* There was an inverted-hull outline here and it is gone on purpose.
     A back-face shell scaled UNIFORMLY does not give a constant-width
     line on anything that is not a sphere: this transporter is 29.3 A
     tall and 14.5 A across, so the same 3.5% put twice as much ink on
     the caps as on the flanks and read as a shading artefact rather than
     a drawn edge. Doing it properly means offsetting along the vertex
     normal, and the shapes turned out to separate well enough on colour
     alone — cool protein against warm lipid — that the line was not
     earning a shader. If one is ever wanted back, offset along normals;
     do not scale. */

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };

  /* =====================================================================
     transporter(opts) — the lathe, and everything that moves.

       half        bilayer half-thickness. The protein spans it and stands
                   `over` beyond each leaflet.
       radius      outer radius at mid-membrane
       site        radius of the binding pocket
       mouth       radius of a fully open mouth
       wall        minimum material between lumen and outside. Load-bearing:
                   without it a wide mouth eats through the side wall and the
                   protein develops a hole in its flank.
       rings/segs  tessellation
       lobes       cosmetic symmetry-breaking, 0 = a clean solid of revolution
       taper       fractional widening toward +y (negative: toward −y); 0 = symmetric
       flare       [below, above]: fractional widening of each end once it is
                   clear of the lipid heads, so a protein with a big domain
                   on one face overhangs the membrane there; [0, 0] = none

     Returns { group, mesh, setGates, gates, dispose }.
     ===================================================================== */
  function transporter(opts) {
    const o = Object.assign({
      /* `site` is the radius of the lumen at its narrowest. It MUST clear
         the biggest ion actually drawn, and that is not the biggest ion:
         ions are exaggerated, so the constraint is a rendering one and it
         bit — K⁺ draws at 1.38 x 2.6 = 3.59 A and the site was 3.2, so the
         ion sat with its shoulders through the wall of the pocket holding
         it. 5.0 clears the widest drawn species, Cl⁻ at 4.71 — which the
         first fix forgot, and the constructor's warning caught. */
      half: 15.3, over: 14, radius: 14.5, site: 5.0, mouth: 7.6, wall: 3.0,
      rings: 96, segs: 56, lobes: 0, lobeDepth: .06, taper: 0, flare: [0, 0],
      /* Cool against the membrane's warm, which is the first illustration's
         scheme and the reason it reads at a glance: a protein the colour of
         its lipids is a protein you have to hunt for. */
      color: 0x4f9db5,
    }, opts);

    const H = o.half + o.over;                 // half-height of the protein

    /* The lumen has to fit what the page will put in it. Silent otherwise:
       an oversized ion does not error, it renders half-buried in the wall
       and reads as a rendering glitch rather than a geometry mistake. */
    const widest = Math.max(...Object.keys(ION)
      .filter(k => ION[k] && ION[k].r).map(k => ION[k].r)) * ION.exaggeration;
    if (o.site < widest)
      console.warn(`parts.transporter: site ${o.site} A is narrower than the widest ` +
                   `drawn species (${widest.toFixed(2)} A). Ions will clip through the lumen wall.`);
    const rings = o.rings, segs = o.segs;
    const nContour = rings * 2;                // outer up, inner back down

    let gTop = 1, gBot = 0;

    /* ---- the two profile functions ---- */

    /* THE LUMEN IS THE TRUTH; THE OUTSIDE GIVES WAY.

       This is the second version and the first one was wrong in a way that
       is worth keeping written down, because it looked plausible. It domed
       the outer surface to a POINT at each pole and then preserved wall
       thickness by shrinking the lumen to fit — Ri = min(Ri, Ro - wall).
       Near the pole Ro is heading for zero, so the lumen was squeezed shut
       right where it was supposed to open. Every state rendered with a lid
       on it. "Outward-open" was never open, and the cutaway showed a neat
       funnel running up to a sealed dome.

       So the clamp goes the other way. The throat is whatever the gates
       say, full stop, and the OUTER radius is pushed out to keep the wall:

           Ro = max(barrel, throat + wall)

       An open gate therefore FLARES the mouth into a rim, which is both
       correct — the lumen reaches the outside — and what every textbook
       carrier looks like. A shut gate leaves throat ~ 0, the max does
       nothing, and the barrel domes closed exactly as before. */

    /* The lumen, unclamped: pocket, plus whichever throats their gates
       have opened. Maxed, not summed, so a closing gate reveals the
       pocket underneath rather than subtracting from it. */
    function throat(y) {
      const pocket = o.site * Math.exp(-((y / (o.half * .42)) ** 2));

      /* A THROAT RAMPS FROM THE SITE, IT DOES NOT GROW FROM ZERO.

         It used to be `mouth * smooth(|y|/H)`, which starts at 0 on the
         mid-plane. Between the pocket (a Gaussian, already decaying) and
         the throat (still near zero) the lumen collapsed: measured necks
         of 2.2 and 2.45 A at y = +-10, against a K+ drawn at 3.59. Ions
         passed straight through the wall there, and it looked like a
         deliberate hourglass rather than two accidental pinch points.

         Ramping site -> mouth instead makes the lumen MONOTONIC from the
         site outward, so a path that is open is open all the way. */
      const ramp = u => o.site + (o.mouth - o.site) * smooth(u);
      const up   = y <= 0 ? 0 : ramp(y / H);
      const down = y >= 0 ? 0 : ramp(-y / H);
      return Math.max(pocket, gTop * up, gBot * down);
    }

    /* The barrel, before the lumen has any say: rounded shoulders so the
       ends are domed rather than cut flat, which would read as a cylinder
       someone sawed. */
    function barrel(y) {
      const u = Math.abs(y) / H, cap = 0.30;
      let s = 1;
      if (u > 1 - cap) {
        const t = (u - (1 - cap)) / cap;       // 0 at the shoulder, 1 at the pole
        s = Math.sqrt(Math.max(0, 1 - t * t));
      }
      /* Slight waist at the bilayer mid-plane: real transporters are
         narrowest where the lipid is thinnest, and it reads as "gripped
         by the membrane" rather than "pushed through a hole". */
      const waist = 1 - 0.07 * Math.exp(-((y / (o.half * .8)) ** 2));
      /* Starts past the head groups (headR 2.7 on the leaflet), so the
         membrane's hole still fits the part inside it. */
      const fl = o.flare[y < 0 ? 0 : 1];
      const flare = fl ? 1 + fl * smooth((Math.abs(y) - o.half - 3) / 8) : 1;
      return o.radius * s * waist * flare * (1 + o.taper * y / H);
    }

    const Ri = y => throat(y);
    /* The wall is only owed where there is a lumen to wall off. Added
       unconditionally it survives at a SHUT pole, where the throat is
       zero and the barrel is heading to a point: the end came out as a
       flat disc of radius `wall` instead of a dome. Fading the wall in
       with the throat keeps the closed end pointed, and does it smoothly
       so a gate opening does not pop. */
    const Ro = y => {
      const t = throat(y);
      return Math.max(barrel(y), t + o.wall * smooth(t / (o.site * .5)));
    };

    /* ---- geometry ----
       Built by hand rather than with LatheGeometry so setGates can rewrite
       positions in place. Rebuilding a lathe every frame of a transition
       allocates a new geometry per frame; this allocates none. */
    const geo = new THREE.BufferGeometry();
    const nVert = nContour * (segs + 1);
    const pos = new Float32Array(nVert * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));

    const idx = [];
    for (let i = 0; i < nContour; i++) {
      const i2 = (i + 1) % nContour;           // wrap: the contour is closed
      for (let j = 0; j < segs; j++) {
        const a = i * (segs + 1) + j, b = i2 * (segs + 1) + j;
        idx.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    geo.setIndex(idx);

    const mesh = new THREE.Mesh(geo, flat(o.color));
    const group = new THREE.Group();
    group.add(mesh);

    /* contourAt(i) -> [r, y]. The first `rings` points run up the outside
       from the bottom pole to the top; the next `rings` come back down the
       inside. Poles are included so the surface closes on the axis when a
       gate is shut. */
    function contourAt(i) {
      if (i < rings) {
        const y = -H + (2 * H) * (i / (rings - 1));
        return [Ro(y), y];
      }
      const k = i - rings;
      const y = H - (2 * H) * (k / (rings - 1));
      return [Ri(y), y];
    }

    function rebuild() {
      for (let i = 0; i < nContour; i++) {
        const [r, y] = contourAt(i);
        for (let j = 0; j <= segs; j++) {
          const th = (j / segs) * Math.PI * 2;
          /* Lobes ripple the RADIUS of the outer wall only. The inner wall
             is left perfectly round because the lumen is a claim about
             where the ion can be, and a rippled lumen would be a claim we
             have no basis for. */
          const lobe = (i < rings && o.lobes)
            ? 1 + o.lobeDepth * Math.cos(o.lobes * th) : 1;
          const v = (i * (segs + 1) + j) * 3;
          pos[v]     = r * lobe * Math.cos(th);
          pos[v + 1] = y;
          pos[v + 2] = r * lobe * Math.sin(th);
        }
      }
      geo.attributes.position.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    }

    /* setGates(top, bottom) — both in 0..1, continuous, no snapping. A page
       drives this from whatever easing it likes; the shape is defined at
       every intermediate value, which is what makes the occluded state a
       real position on the path rather than a third model. */
    function setGates(top, bottom) {
      gTop = clamp01(top); gBot = clamp01(bottom);
      rebuild();
    }
    setGates(gTop, gBot);

    return {
      group, mesh, setGates, geometry: geo, outerR: Ro,
      /* Half-height, so a caller working in Pump's normalised u (-1 at
         the inner mouth, +1 at the outer) can place an ion without knowing
         how this shape was built or hard-coding an angstrom. */
      height: H,
      get gates() { return { top: gTop, bottom: gBot }; },
      /* The page needs to know where the ion belongs. This is the pocket
         centre, in the transporter's own frame — mid-membrane, on axis. */
      site: new THREE.Vector3(0, 0, 0),
      dispose() { geo.dispose(); mesh.material.dispose(); },
    };
  }

  /* =====================================================================
     membrane(opts) — head groups and tails, the way the textbook draws it.

     `exclude(x, z, sign)` returns the distance from that column to the
     nearest protein in the leaflet at y = sign·half, so lipids can be left
     out where a machine stands, and a protein wider on one face than the
     other keeps lipid close on both. Passing nothing fills the whole patch.

     SHAPE IS THE DECISION THAT MAKES THIS READ. A full disc of lipids is
     what a membrane really is and it is unusable: the near half stands
     between the camera and the machine, and the lesson's subject spends
     the whole animation behind a picket fence of tails. Every textbook
     draws a CROSS-SECTION for exactly this reason.

       'slab'  a band `depth` deep in z — a cutaway with enough thickness
               to still be a solid object when the camera moves. Default,
               and what a lesson should use.
       'disc'  the honest full patch. Correct, and it will hide your
               protein. Kept because a page that wants to look down the
               membrane normal needs it.

     AND IT OWNS THE CUT PLANE, because it is the only thing that knows
     which way the slab runs. A page that picks its own normal picks the
     wrong one: cutting a slab along its LENGTH slices the bilayer in half
     lengthwise and leaves a stub beside the protein, which is what this
     page did until the geometry was looked at rather than assumed. The
     thin axis is the one to cut across, membrane() laid it out, so
     membrane() hands back the plane and everything else borrows it.
     ===================================================================== */
  function membrane(opts) {
    const o = Object.assign({
      /* `reach` is framing, not fact — a membrane has no edge. Wide enough
         to say "this continues past the frame" and no wider: at 78 the
         bilayer became the subject and the machine in it an ornament. */
      half: 15.3, reach: 46, pitch: 7.2, headR: 2.7, clear: 4.5, waviness: 0.95,
      /* LATERAL DRIFT, in A — how far a lipid wanders from its lattice
         seat. See the shader below. 0 pins the sheet. */
      drift: 2.4,
      shape: 'slab', depth: 13,
      /* ARC RADIUS, in A. 0 is a flat sheet. A membrane has no edge and no
         flat, and a straight bilayer leaves the reader nothing to tell the
         two compartments apart by: the arc is the affordance — the convex
         face is outside. The sheet is placed on a circle of this radius
         centred below the origin, so the midsurface passes through y=0 at
         x=0 and falls away symmetrically. Big: a radius near the patch
         width curls the sheet into a bowl and the machine in it lies on
         its side. See BEND. */
      bowR: 0,
      head: 0xe0705c, tail: 0xf0c98a, exclude: null,
    }, opts);

    const g = new THREE.Group();
    const cols = [];
    const zLimit = o.shape === 'slab' ? o.depth : o.reach;
    for (let x = -o.reach; x <= o.reach; x += o.pitch)
      for (let z = -zLimit; z <= zLimit; z += o.pitch) {
        if (o.shape !== 'slab' && Math.hypot(x, z) > o.reach) continue;
        const up = !o.exclude || o.exclude(x, z, 1) >= o.clear, down = !o.exclude || o.exclude(x, z, -1) >= o.clear;
        if (up || down) cols.push([x, z, up, down]);
      }

    const headGeo = new THREE.SphereGeometry(o.headR, 12, 9);
    const headMat = flat(o.head);

    /* UNDULATION — the whole sheet, not each lipid.

       Waving the tails while the heads sit on a perfectly straight line
       makes the bilayer read as a rigid rail with a fringe. But per-lipid
       jitter would be worse and it would be wrong: a membrane ripples in
       COLLECTIVE modes, so neighbours move together and the surface stays
       continuous. Random per-head motion would tear it visually.

       So displacement is a function of the instance's own x,z — a long
       standing wave in each direction — and it is applied identically to
       heads and to tails, which is what keeps a tail attached to its head
       instead of the two drifting apart. instanceMatrix[3].xyz is the
       instance translation, and these instances are translation-only, so
       adding the offset in object space lands correctly in world space.

       Amplitude is deliberately under a head radius: enough that the
       surface is alive, not so much that the thickness looks variable —
       the thickness is a measured number this page prints. */
    /* ---- LATERAL DRIFT: each lipid on its own slow circuit ----

       The undulation above is the sheet FLEXING, and it is not fluidity:
       every lipid keeps its seat, so a student watching closely sees a
       rippling solid. Lateral diffusion is the thing "fluid mosaic"
       actually names, and it has to be per-lipid and uncorrelated with the
       neighbours or it is just more sheet motion.

       PEDAGOGICAL, TWICE OVER, and both simplifications are forced.

       FIRST, THE SPEED. A real lipid diffuses ~1 um^2/s, which is a swap
       with a neighbour something like 10^7 times a second — drawn honestly
       the sheet is a blur and the student learns only that it moves. This
       is that motion slowed by orders of magnitude.

       SECOND, THE FIELD. The drift is a smooth flow — a long, slow swirl
       sampled at each lipid's seat — rather than an independent wander per
       lipid, and the difference is the whole reason this shipped at all.
       Independent wander is closer to the real physics and it is
       unusable: neighbours pull apart by up to twice the amplitude, and a
       7.2 A lattice of 5.4 A heads has only 1.8 A of slack, so the sheet
       opens VISIBLE HOLES — a bilayer with gaps in it, on the one step
       whose whole claim is that this barrier is continuous. That is a far
       worse lie than the one below.

       So neighbours move nearly together and the sheet stays packed, while
       lipids well apart move differently and visibly slide against each
       other. WHAT THIS DOES NOT SHOW: two adjacent lipids never actually
       trade places, because the field is periodic in time — relative
       motion oscillates instead of accumulating. The copy must therefore
       say lipids SLIDE, never that a lipid ends up somewhere else. A
       shader carries no state between frames, so anything that accumulates
       has to wrap, and a lipid teleporting across the patch is the third
       kind of wrong.

       Amplitude 2.4 A against the 7.2 A pitch, and the per-column phase
       step is 0.5 rad, so neighbours stay within ~1.2 A of each other —
       inside the slack, so nothing opens. It also keeps every lipid inside
       the clearance ring around a protein, so none drifts into a barrel.

       HASHED ON THE COLUMN, NEVER ON THE INSTANCE. A head and its two
       tails are three instances at three different x, so hashing the raw
       instance position gives each of them a different drift and the
       lipid comes apart in the first second. Recovering the column index
       from the lattice is what keeps a lipid one object. */
    const COL = `
      float cx = floor((iPos.x + ${o.reach.toFixed(4)} + ${(o.pitch * 0.5).toFixed(4)}) / ${o.pitch.toFixed(4)});
      float cz = floor((iPos.z + ${zLimit.toFixed(4)} + ${(o.pitch * 0.5).toFixed(4)}) / ${o.pitch.toFixed(4)});
    `;
    /* ---- BEND: the flat lattice wrapped onto an arc ----

       Both leaflets have to bend as ONE SURFACE or the bilayer changes
       thickness across the frame, which is the one number this page
       prints. So the arc is applied to the instance's RADIUS, not to its
       y: a head at +half and its tails at +half/2 sit at radii R+half and
       R+half/2 on the same ray, and the separation along that ray is
       exactly what it was on the flat lattice.

       And the lipid TURNS with the surface. Left upright it would shear
       against the arc and read as a sheared sheet rather than a curved
       one, so the vertex's own offset from its seat is rotated by the same
       angle before it is added back.

       The instances are translation-only, so subtracting iPos at the end
       cancels the translation three is about to re-apply and the vertex
       lands where this computed it. */
    const BEND = !o.bowR ? '' : `
      float bR = ${o.bowR.toFixed(3)};
      float th = iPos.x / bR;
      float rad = bR + iPos.y + transformed.y;
      float ct = cos(th), st = sin(th);
      transformed = vec3( st * rad + ct * transformed.x,
                         -bR + ct * rad - st * transformed.x,
                          iPos.z + transformed.z) - iPos;
    `;
    const WAVE = `
      vec3 iPos = instanceMatrix[3].xyz;
      float w = sin(iPos.x * 0.055 + uTime * 0.7) * 0.62
              + sin(iPos.z * 0.090 - uTime * 0.5) * 0.34
              + sin(iPos.x * 0.021 + iPos.z * 0.031 + uTime * 0.31) * 0.55;
      transformed.y += w;
      transformed.x += sin(iPos.z * 0.06 + uTime * 0.4) * 0.30;
      ${COL}
      transformed.x += (sin(cz * 0.50 + uTime * 0.34) * 0.62
                      + sin(cx * 0.31 - uTime * 0.23) * 0.38) * uDrift;
      transformed.z += (cos(cx * 0.44 - uTime * 0.28) * 0.62
                      + cos(cz * 0.27 + uTime * 0.19) * 0.38) * uDrift;
      ${BEND}
    `;
    /* customProgramCacheKey IS NOT OPTIONAL HERE, and leaving it out cost an
       hour. onBeforeCompile does not participate in three's program cache
       key: the head, tail, ion and protein materials are all
       MeshStandardMaterial with identical PARAMETERS (colour is a uniform,
       not a parameter), so three compiles one program for whichever is
       drawn first and hands the same one to the rest. If that first
       material had no onBeforeCompile, the lipid shaders never run — and
       nothing errors. The source was provably correct while the screen
       showed perfectly straight tails.

       A distinct key per modified material forces its own program. */
    let keyN = 0;
    const undulate = (mat, uniforms) => {
      const prev = mat.onBeforeCompile;
      const key = 'membrane-wave-' + (keyN++);
      mat.customProgramCacheKey = () => key;
      mat.onBeforeCompile = (sh) => {
        if (prev) prev(sh);
        sh.uniforms.uTime  = uniforms.uTime;
        sh.uniforms.uDrift = uniforms.uDrift;
        if (!/uniform float uTime/.test(sh.vertexShader))
          sh.vertexShader = sh.vertexShader.replace('#include <common>',
            '#include <common>\nuniform float uTime;');
        if (!/uniform float uDrift/.test(sh.vertexShader))
          sh.vertexShader = sh.vertexShader.replace('#include <common>',
            '#include <common>\nuniform float uDrift;');
        sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' + WAVE);
      };
    };
    /* Two tails per head — one tail reads as a lollipop, and the doubled
       tail is most of what makes a phospholipid recognisable.

       GENTLY WAVY, as every textbook draws them, and the distinction
       matters: a WAVE is the conformational freedom a saturated chain
       already has, while a KINK is a cis double bond and a different
       molecule. contrast-lab owns that pair (palmitic vs palmitoleic), so
       the amplitude here stays well under a kink — enough to stop the
       tails reading as a picket fence, not enough to claim unsaturation. */
    const tailLen = o.half - o.headR * .5;

    /* ONE straight geometry, bent in the VERTEX SHADER. Baking a curve into
       the geometry gives every tail the identical wave, and a few hundred
       identical waves in a row read as corrugated iron. Making N curved
       variants would work and costs N draw calls; bending in the shader
       costs none, because a per-instance phase is just another attribute on
       the same instanced draw.

       And it buys the thing a static membrane cannot say: the bilayer is
       FLUID. `uTime` makes the tails drift, which is most of the difference
       between "a wall built out of lipids" and "a liquid two molecules
       thick". Set speed 0 for a still picture. */
    const tailGeo = new THREE.CylinderGeometry(0.5, 0.42, tailLen, 6, 10);
    const tailMat = flat(o.tail);
    const phases = new Float32Array(cols.length * 2);
    for (let i = 0; i < phases.length; i++) phases[i] = Math.random() * Math.PI * 2;
    const phaseAttr = new THREE.InstancedBufferAttribute(phases, 1);

    const tailUniforms = { uTime: { value: 0 },
                           uDrift: { value: o.drift != null ? o.drift : 2.4 },
                           uAmp: { value: o.waviness != null ? o.waviness : 0.95 } };
    tailMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = tailUniforms.uTime;
      sh.uniforms.uAmp  = tailUniforms.uAmp;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>',
          '#include <common>\nattribute float aPhase;\nuniform float uTime;\nuniform float uAmp;')
        /* Amplitude scales with distance from the head end, so the tail is
           anchored where the glycerol backbone holds it and freest at the
           tip — which is what a real chain does, and it stops the wave
           looking like the whole lipid sliding sideways. */
        .replace('#include <begin_vertex>',
          '#include <begin_vertex>\n' +
          'float tU = position.y / ' + tailLen.toFixed(3) + ' + 0.5;\n' +
          'float bend = (sin(tU * 5.0 + aPhase + uTime) + 0.45 * sin(tU * 9.0 + aPhase * 2.1)) * uAmp * tU;\n' +
          'transformed.x += bend;\n' +
          'transformed.z += cos(tU * 3.6 + aPhase * 1.7 + uTime * 0.8) * uAmp * 0.7 * tU;');
    };

    undulate(headMat, tailUniforms);
    undulate(tailMat, tailUniforms);

    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), Sc = new THREE.Vector3(1,1,1);
    for (const sign of [1, -1]) {
      const mine = cols.filter(c => c[sign > 0 ? 2 : 3]);
      const heads = new THREE.InstancedMesh(headGeo, headMat, mine.length);
      const tails = new THREE.InstancedMesh(tailGeo, tailMat, mine.length * 2);
      tails.geometry.setAttribute('aPhase', phaseAttr);
      mine.forEach(([x, z], i) => {
        M.compose(new THREE.Vector3(x, sign * o.half, z), Q, Sc);
        heads.setMatrixAt(i, M);
        [-1, 1].forEach((k, t) => {
          M.compose(new THREE.Vector3(x + k * 0.95, sign * (o.half / 2), z), Q, Sc);
          tails.setMatrixAt(i * 2 + t, M);
        });
      });
      heads.instanceMatrix.needsUpdate = true;
      tails.instanceMatrix.needsUpdate = true;
      g.add(heads, tails);
    }
    g.userData.materials = [headMat, tailMat];

    /* ---- the cut ----
       Normal points at the camera side, so the half REMOVED is the near
       one and the viewer is left looking at the cut face. For a slab the
       thin axis is z. For a disc there is no thin axis and no right
       answer; z is returned so the API is uniform, and a disc being cut
       at all is already a page doing something unusual. */
    const normal = new THREE.Vector3(0, 0, -1);
    const plane = new THREE.Plane(normal.clone(), 0);
    let cutOn = false;

    function enable(on) {
      cutOn = !!on;
      g.userData.materials.forEach(m => {
        m.clippingPlanes = cutOn ? [plane] : [];
        m.needsUpdate = true;
      });
    }
    /* at(d): slide the cut along its own normal. d = 0 is the mid-plane,
       which is where a cross-section wants to be; positive moves the cut
       away from the camera. */
    function at(d) { plane.constant = d; }

    return {
      group: g, materials: g.userData.materials, columns: cols.length,
      half: o.half, shape: o.shape, bowR: o.bowR,
      /* THE ARC, for everything that is not a lipid. A protein in the sheet
         and an ion crossing it have to ride the same curve or they float
         off it, and re-deriving the mapping at each call site is how one of
         them ends up on a slightly different circle. Flat (x,y) in, the
         same point on the arc out, plus the surface angle there so a caller
         can turn a protein to match. Identity when bowR is 0. */
      bend(v) {
        if (!o.bowR) return 0;
        const th = v.x / o.bowR, rad = o.bowR + v.y;
        v.x = Math.sin(th) * rad;
        v.y = Math.cos(th) * rad - o.bowR;
        return th;
      },
      /* WHERE A LIPID ACTUALLY IS, for anything pointing AT one — a leader
         line from an inset, a highlight, a label. Searched out of `cols`
         rather than recomputed from pitch, because the lattice starts at
         -reach (not 0) and `exclude` carves seats out of it for the protein:
         a caller re-deriving it from the defaults would eventually point at
         a lipid that was removed to make the hole. Returns the HEAD, which
         is the end a student can see. `side` +1 top leaflet, -1 bottom. */
      seatNear(x, z, side) {
        let best = null, bd = Infinity;
        for (const [cx, cz] of cols) {
          const d = (cx - x) * (cx - x) + (cz - z) * (cz - z);
          if (d < bd) { bd = d; best = [cx, cz]; }
        }
        if (!best) return null;
        const v = new THREE.Vector3(best[0], (side < 0 ? -1 : 1) * o.half, best[1]);
        this.bend(v);
        return v;
      },
      cut: { plane, normal, enable, at, get on() { return cutOn; } },
      /* The drift is a knob a lesson can turn off — a step teaching the
         GEOMETRY of a bilayer wants a still one. */
      set drift(a) { tailUniforms.uDrift.value = a; },
      get drift() { return tailUniforms.uDrift.value; },
      /* Call from the render loop to let the bilayer move. Optional: a page
         that never calls it gets a still membrane whose tails are still all
         different, because the phase alone does that. */
      tick(dt) { tailUniforms.uTime.value += dt * (o.fluidity != null ? o.fluidity : 0.9); },
    };
  }

  /* =====================================================================
     ions — oversize, and the factor is one number for all of them.
     ===================================================================== */
  /* Read at draw time, not at load: parts.js is also required by the node
     checkers, where no palette is on the page. */
  const PAL = () => (global.MolPalette || (global.MolLib && global.MolLib.PALETTE));

  /* A hex int, scaled toward black. */
  const darken = (c, f) => (Math.round(((c >> 16) & 255) * f) << 16)
                         | (Math.round(((c >> 8) & 255) * f) << 8)
                         |  Math.round((c & 255) * f);

  const ION = {
    /* Shannon six-coordinate ionic radii, in A. These are the TRUE numbers
       and they are what `exaggeration` multiplies, so relative size — the
       fact that K+ is half again bigger than Na+ — survives intact. */
    NA: { r: 1.02, color: 0x7b5cf0, label: 'Na⁺' },
    K:  { r: 1.38, color: 0xf0a03c, label: 'K⁺' },
    CL: { r: 1.81, color: 0x63c26b, label: 'Cl⁻' },
    MG: { r: 0.72, color: 0x3cc98f, label: 'Mg²⁺' },
    /* A BARE PROTON HAS NO RADIUS worth quoting — it is a nucleus, ~1e-5 A,
       and in water it is really H₃O⁺. Drawn at 0.30 so it reads as the
       smallest thing on stage and still has a sphere to hang its sign on.
       Not a Shannon number, unlike the four above. */
    H:  { r: 0.30, get color() { return PAL().respiration.proton; },
          /* The SPHERE is hydrogen's pale steel and the SIGN is not. A charge
             badge is two thin strokes a few pixels wide at whole-membrane
             zoom, and the palette's steel disappears at that size. Darkened
             from the same colour rather than typed, so the two can never be
             two different greys. */
          get badge() { return darken(this.color, 0.45); }, label: 'H⁺' },
    /* Not an ion, and deliberately grey: water is the thing that moves
       when nothing is pushing it, and it should never be mistaken for
       cargo the pump is choosing. */
    HOH:{ r: 1.40, color: 0x9fb9c9, label: 'H₂O' },
    exaggeration: 2.6,
  };

  function ion(name, opts) {
    const o = Object.assign({ exaggeration: ION.exaggeration }, opts);
    const spec = ION[name];
    if (!spec) throw new Error(`parts.ion: no such species ${name}`);
    /* `radius` overrides the Shannon-times-exaggeration default. A page that
       also draws MOLECULES needs it: molecules.js sizes atoms from
       PALETTE.radii, which is a different convention, and an ion sized one
       way beside an O sized the other is a size comparison the page never
       meant to make. See membrane-lab's ionRadius(). */
    const r = o.radius != null ? o.radius : spec.r * o.exaggeration;
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 22, 16), flat(spec.color));
    m.userData = { species: name, trueRadius: spec.r, drawnRadius: r, label: spec.label };
    return m;
  }

  /* '#rrggbb' for the charge badge of an ion: the sphere's colour unless the
     spec says the sign needs its own. Every caller drawing a badge goes
     through here, so a sphere and its sign stay one decision. */
  function ionBadge(name) {
    const spec = ION[name];
    if (!spec) throw new Error(`parts.ionBadge: no such species ${name}`);
    const c = spec.badge != null ? spec.badge : spec.color;
    return '#' + c.toString(16).padStart(6, '0');
  }

  global.Parts = { transporter, membrane, ion, ION, ionBadge, flat };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.Parts;
})(typeof window !== 'undefined' ? window : globalThis);

/* =============================================================================
 *  Pump — the Post-Albers cycle as a function of time.
 * =============================================================================
 *  No THREE, no DOM, no geometry: the pump's BEHAVIOUR. Given a time, what
 *  are the gates doing, where is each ion, and has the phosphate moved. The
 *  transporter above turns that into a shape and the page into a picture;
 *  neither decides anything about the mechanism.
 *
 * -----------------------------------------------------------------------------
 *  THE CYCLE, AND WHAT IS SIMPLIFIED
 * -----------------------------------------------------------------------------
 *  Eight phases, in a loop:
 *
 *    1 load-Na       inward-open. Three Na+ come in from the cytoplasm.
 *    2 occlude-Na    ATP's terminal phosphate moves ONTO the pump. Gates shut.
 *    3 open-out      outward-open, carrying the phosphate.
 *    4 release-Na    three Na+ leave, to the outside.
 *    5 load-K        two K+ come in from the outside.
 *    6 occlude-K     the phosphate leaves. Gates shut.
 *    7 open-in       inward-open again.
 *    8 release-K     two K+ leave, into the cytoplasm.
 *
 *  THE STOICHIOMETRY IS REAL: 3 Na+ out, 2 K+ in, 1 ATP. Three charges out
 *  against two in is why the pump is electrogenic and why the cell interior
 *  sits negative — a fact this lesson will want later and must not contradict
 *  now, so the counts are not roundable.
 *
 *  WHAT IS COMPRESSED. The real cycle distinguishes E1P from E2P and has ADP
 *  leave between them; here phosphorylation and the conformational change are
 *  one beat, because "the phosphate arrives and the pump turns inside out" is
 *  the causal story and the intermediate is not a Bio 101 fact. The 2022
 *  structures we baked (7E1Z, 7E20) are the two ENDS of this and there is no
 *  E2P among them, so nothing here is claiming structural support for the
 *  middle — see proteins/napump/tools/prep.js on the same gap.
 *
 *  WHAT IS NOT COMPRESSED, because it is the point:
 *
 *    · GATES NEVER BOTH OPEN. Every transition between an open state and its
 *      opposite passes through a shut one. This is enforced by the phase table
 *      having occlusion phases at all.
 *    · THE ION IS COMMITTED BEFORE THE PUMP TURNS. Loading finishes before
 *      occlusion starts, so the student never sees an ion drift in while the
 *      far side is open — which would be a leak, and would silently teach that
 *      the pump is a hole with a preference.
 *
 * -----------------------------------------------------------------------------
 *  COORDINATES
 * -----------------------------------------------------------------------------
 *  Ion position is `u`, normalised: -1 at the cytoplasmic mouth, 0 at the
 *  binding site, +1 at the outer mouth. The page multiplies by the
 *  transporter's half-height. Nothing here knows an angstrom, which is why
 *  changing the protein's size cannot break the choreography.
 *
 *  Exposes window.Pump.
 * ========================================================================== */
(function (global) {
  'use strict';

  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const smooth = t => { t = clamp01(t); return t * t * (3 - 2 * t); };
  const mix = (a, b, t) => a + (b - a) * t;

  /* Phase table. `w` is relative duration — the loop is normalised by their
     sum, so retiming one beat cannot silently shorten another. */
  const PHASES = [
    { id:'load-na',    w:1.4, label:'3 Na⁺ bind',
      caption:'The pump is open to the inside. Three sodium ions step in.' },
    { id:'occlude-na', w:1.0, label:'ATP → phosphate on the pump',
      caption:'ATP snaps off its end phosphate and sticks it on the pump. ' +
              'Both doors shut, so the sodium is locked in — it cannot slip back.' },
    { id:'open-out',   w:0.9, label:'turns outward',
      caption:'Holding that phosphate makes the pump change shape: it turns ' +
              'over and opens to the outside instead.' },
    { id:'release-na', w:1.1, label:'3 Na⁺ leave',
      caption:'In the new shape the grip is loose. The three sodiums drift out ' +
              'of the cell.' },
    { id:'load-k',     w:1.1, label:'2 K⁺ bind',
      caption:'That same pocket now fits potassium better. Two K⁺ step in from ' +
              'outside.' },
    { id:'occlude-k',  w:1.0, label:'phosphate leaves',
      caption:'The phosphate falls off. Both doors shut again, with the ' +
              'potassium locked in this time.' },
    { id:'open-in',    w:0.9, label:'turns inward',
      caption:'Without the phosphate the pump relaxes back to its first shape, ' +
              'facing inside again.' },
    { id:'release-k',  w:1.1, label:'2 K⁺ enter the cell',
      caption:'The two potassiums are let go inside the cell. That whole trip ' +
              'cost exactly one ATP.' },
  ];

  const TOTAL = PHASES.reduce((s, p) => s + p.w, 0);

  /* Cumulative bounds, so at() can locate a time without scanning. */
  const BOUNDS = (() => {
    const b = []; let acc = 0;
    for (const p of PHASES) { b.push([acc / TOTAL, (acc + p.w) / TOTAL, p]); acc += p.w; }
    return b;
  })();

  function locate(t) {
    const p = ((t % 1) + 1) % 1;
    for (const [lo, hi, ph] of BOUNDS)
      if (p >= lo && p < hi) return { phase: ph, k: (p - lo) / (hi - lo), p };
    const last = BOUNDS[BOUNDS.length - 1];
    return { phase: last[2], k: 1, p };
  }

  /* Gate values per phase. Written as explicit endpoints rather than derived,
     because the ONE invariant worth protecting is easier to read than to
     infer: no row here has both gates open, and no row interpolates between
     two open states. */
  function gatesOf(id, k) {
    switch (id) {
      case 'load-na':    return { top:0, bottom:1 };
      case 'occlude-na': return { top:0, bottom:1 - smooth(k) };
      case 'open-out':   return { top:smooth(k), bottom:0 };
      case 'release-na': return { top:1, bottom:0 };
      case 'load-k':     return { top:1, bottom:0 };
      case 'occlude-k':  return { top:1 - smooth(k), bottom:0 };
      case 'open-in':    return { top:0, bottom:smooth(k) };
      case 'release-k':  return { top:0, bottom:1 };
    }
    throw new Error('pump: unknown phase ' + id);
  }

  /* Where the ions are. Each returns a list of { species, u, alpha }.
     `alpha` is how present the ion is — ions fade in at a mouth rather than
     appearing, because an ion that pops into existence at the pump's lip
     reads as being MADE there. */
  function cargoOf(id, k) {
    const out = [];
    const NA = 3, K = 2;
    /* Ions are spread slightly around the site so three of them are three
       objects rather than one lump. Purely cosmetic, and the spread is in
       `u` so it stays proportional if the protein resizes. */
    const spread = i => (i - 1) * 0.06;

    const na = (u, a) => { for (let i = 0; i < NA; i++) out.push({ species:'NA', u:u + spread(i), alpha:a }); };
    const k2 = (u, a) => { for (let i = 0; i < K;  i++) out.push({ species:'K',  u:u + (i - .5) * 0.09, alpha:a }); };

    switch (id) {
      /* Loading: in from the mouth to the site, fading up over the first
         third so they arrive rather than materialise. */
      case 'load-na':    na(mix(-1, 0, smooth(k)), clamp01(k * 3)); break;
      case 'occlude-na': na(0, 1); break;
      case 'open-out':   na(0, 1); break;
      case 'release-na': na(mix(0, 1, smooth(k)), clamp01((1 - k) * 2.2)); break;
      case 'load-k':     k2(mix(1, 0, smooth(k)), clamp01(k * 3)); break;
      case 'occlude-k':  k2(0, 1); break;
      case 'open-in':    k2(0, 1); break;
      case 'release-k':  k2(mix(0, -1, smooth(k)), clamp01((1 - k) * 2.2)); break;
    }
    return out;
  }

  /* The phosphate. `transfer` runs 0→1 across occlude-na (ATP → pump) and
     1→0 across occlude-k (pump → Pi, released). `on` is whether the pump is
     carrying it, which is what makes the outward-facing half of the cycle
     the PHOSPHORYLATED half — the causal link the lesson is making. */
  function phosphoOf(id, k) {
    switch (id) {
      case 'load-na':    return { transfer:0, on:false, atp:'charged' };
      case 'occlude-na': return { transfer:smooth(k), on:smooth(k) > .5, atp:smooth(k) > .5 ? 'discharged' : 'charged' };
      case 'open-out':
      case 'release-na':
      case 'load-k':     return { transfer:1, on:true, atp:'discharged' };
      case 'occlude-k':  return { transfer:1 - smooth(k), on:smooth(k) < .5, atp:'discharged' };
      case 'open-in':
      case 'release-k':  return { transfer:0, on:false, atp:'discharged' };
    }
    throw new Error('pump: unknown phase ' + id);
  }

  /* at(t) — t counts CYCLES, not seconds. A page divides by whatever period
     it wants, which is also how a scrubber and an autoplay share one path. */
  function at(t) {
    const { phase, k, p } = locate(t);
    return {
      t: p, phase: phase.id, k, label: phase.label, caption: phase.caption,
      gates: gatesOf(phase.id, k),
      cargo: cargoOf(phase.id, k),
      phosphate: phosphoOf(phase.id, k),
      /* Whole ATP spent per completed cycle — the ledger the lesson closes
         on, and the number that connects this page to glycolysis. */
      atpPerCycle: 1, naPerCycle: 3, kPerCycle: 2,
    };
  }

  global.Pump = { at, PHASES, TOTAL };
})(typeof window !== 'undefined' ? window : globalThis);
