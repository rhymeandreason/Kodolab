/* =============================================================================
 *  bloodcell/bloodcell.js — one red cell, discocyte to sickle, cut open
 * =============================================================================
 *  Classic script after scene.js + kit/card-stage.js (+ lib/annotate.js for
 *  the notes). Exposes window.BloodCell on the component contract.
 *
 *      const C = BloodCell.mount(el, { viewOffset });
 *      C.set({ sickle: 1, cut: 1 });     // glides; {snap:true} for a slider
 *      C.state(); C.note('rim'); C.show('membrane', false); C.destroy();
 *
 *  PARAMS: sickle 0..1 · tonicity -1..1 · spill 0..1 · cut 0..1 · cutTurn
 *  turns · membrane µm · hb · hbCount · seed · autoRotate. The first four
 *  glide through the mount's tweens; `membrane` and `seed` rebuild and snap.
 *  state() is those plus facts() — discR, sphereR, area, volume, restVolume,
 *  swellRatio, crenateFraction — every one measured off the profile so a page
 *  prints rather than types. `volume` is the cell as it stands, so it tracks
 *  tonicity; `restVolume` is the disc's, and `area` cannot move. Event: frame.
 *
 *  ANCHORS for note(): rim · dimple · cutFace · haemoglobin · horn · spicule.
 *  The last three answer null on a cell that has no such part, so a callout
 *  waits instead of pointing at water. LAYERS for show(): membrane · hb.
 *
 *  ONE SURFACE, BUILT ONCE, MOVED EVERY FRAME. Every behaviour here —
 *  sickling, the creases, the cut — is a deformation or a re-index of a grid
 *  allocated at mount: (K+1)x J vertices for the outer membrane and the same
 *  again for the inner face. Nothing calls new BufferGeometry after that.
 *  Rebuilding is what would make a morph cost more than the morph.
 *
 *  THE PARAMETRIC GRID. A cross-section of a red cell through its axis is one
 *  open curve from the top dimple, out around the rim, to the bottom dimple.
 *  Revolve it and the grid is a sphere's: k is the polar step along that
 *  profile (poles at k=0 and k=K), j the spoke. That gives three things a
 *  radius-keyed height field would not: an even sampling of the rim, where all
 *  the curvature is; poles that are single points, so no seam at the dimple;
 *  and a CUT that is just a range of spokes withheld from the index buffer.
 *
 *  THE CUT SHOWS MEMBRANE THICKNESS, so the cell is a shell and not a bag: the
 *  inner surface is the profile offset inward in profile space (2D, exact)
 *  rather than along a 3D normal, and the boundary of the removed wedge is
 *  bridged by a ribbon between the two. The `membrane` default is ~0.16 µm —
 *  twenty times the real bilayer, which at true scale is a quarter of one
 *  pixel. Deliberate exaggeration; the geometry is otherwise measured.
 *
 *  THE WARP IS THE WHOLE MODEL. `warp()` maps a point of the resting disc to
 *  its sickled position, and EVERYTHING passes through it: both membrane
 *  surfaces, the cut ribbon, and every haemoglobin bead. That is what keeps
 *  the contents inside the cell for free — no clamping, no collision — and it
 *  is why the fibres follow the crescent without knowing about it.
 *
 *  `tonicity` IS ONE AXIS WITH THE SAME ARGUMENT AT BOTH ENDS, and that
 *  argument is that the membrane's AREA is fixed. In pure water the cell fills
 *  to the sphere that area can enclose — the most water it can hold — and then
 *  lyses (`spill`). In brine the water leaves, and the area that is now
 *  surplus buckles out as spicules: a crenated cell. The numbers behind both
 *  are measured off the profile and returned by `state()`, never quoted. See
 *  `swellPoint` and `spicules`.
 *
 *  Shape sources: Evans & Fung's profile for the discocyte (7.8 µm across,
 *  2.4 µm at the rim, 0.8 in the dimple). The sickle is a caricature of the
 *  deoxygenated cell, not a measured one: HbS polymer bundles the cell into a
 *  boat with drawn-out horns, and the beads become those bundles. It is drawn
 *  from `seed`, and no two seeds give the same cell — see `makeShape`.
 *
 *  A ZOOM INTO THE SHELL IS A HANDOFF TO Membrane, not a camera move, and it
 *  skips the organelle rung deliberately: a red cell has no organelles to
 *  stop at. SCALE.down says so.
 *
 *  BUDGET: ~6 ms a frame while SICKLING (19k vertices warped, their normals,
 *  2000 instanced beads, the cut ribbon, and the render), 2 ms on the tonicity
 *  axis, and a render alone once either settles — nothing recomputes unless a
 *  parameter moved. The difference between the two is the trigonometry the
 *  sickle's irregularity costs; crenation's spikes are baked onto the grid.
 * ========================================================================== */
(function (global) {
  'use strict';

  const R0 = 3.91;      // µm — disc radius
  const AMP = 1.945;    // µm — scales the profile to a 2.4 µm rim, 0.8 µm dimple

  const CRENATE = 0.6;  // how much water a crenated cell has left
  const SPIKE = 0.62;   // µm a full-grown spicule stands out

  const K = 72;         // profile samples, pole to pole
  const J = 96;         // spokes; also the cut's angular resolution (3.75°)

  const DEFAULTS = {
    sickle: 0,          // 0 discocyte · 1 sickled
    /* THE SOLUTION THE CELL IS SITTING IN, not a property of the cell:
       -1 pure water · 0 plasma · +1 brine. Water crosses toward the saltier
       side, so the cell swells to the left and shrivels to the right. */
    tonicity: 0,
    spill: 0,           // lysis: the haemoglobin leaves and a ghost is left
    cut: 0,             // whole (0) or halved (1); between is the opening, not a state
    /* WHICH HALF IS REMOVED, in turns, and 0 is the one the sickle needs: it
       takes the near side away and cuts the cell along its length, so the
       opening runs tip to tip and the fibres are seen end-on to end-on. A
       crosswise cut of a crescent shows a sliver and hides the polymer, which
       is the whole reason the cell has that shape. On the disc the same plane
       is the classic cross-section through both dimples. */
    cutTurn: 0,
    membrane: 0.1,      // thick enough to see, and no more than that (see header)
    hb: true,           // the haemoglobin inside
    hbCount: 2000,
    autoRotate: false,
    seed: 7,
  };

  /* Poses for lookAt: the dimple is the one part the default camera sees
     edge-on, so pointing at it turns the cell face-up. */
  const VIEWS = {
    dimple: { theta: 0.35, phi: 0.30, r: 15 },
  };

  const COL = {
    outer: 0xb42d1b, outerSickle: 0xcf3419,
    inner: 0x7d1c10,
    edge: 0xe08268,                 // the cut face: lighter, so thickness reads
    hb: 0xc9c469, hbFibre: 0xd6d074,
    ghost: 0xe8b4a6,
  };

  /* ---- the resting profile ---------------------------------------------- */

  const g = r => 0.207 + 2.003 * r * r - 1.123 * r * r * r * r;

  /* Outer profile in (r, y), plus the same curve offset inward by t. Offsetting
     in profile space and then revolving is exact for a surface of revolution;
     offsetting the 3D vertices along their normals is not, and pinches in the
     dimple where the curvature is highest. Poles are forced onto the axis:
     the finite-difference normal there is a few nanometres off vertical, which
     is enough to open a hole in the inner surface at the dimple. */
  function profile(t) {
    const pr = new Float64Array(K + 1), py = new Float64Array(K + 1);
    const ir = new Float64Array(K + 1), iy = new Float64Array(K + 1);
    for (let k = 0; k <= K; k++) {
      const f = Math.PI * k / K, rho = Math.sin(f);
      pr[k] = R0 * rho;
      py[k] = AMP * Math.cos(f) * g(rho);
    }
    for (let k = 0; k <= K; k++) {
      let nr, ny;
      if (k === 0) { nr = 0; ny = 1; }
      else if (k === K) { nr = 0; ny = -1; }
      else {
        const dr = pr[k + 1] - pr[k - 1], dy = py[k + 1] - py[k - 1];
        const L = Math.hypot(dr, dy) || 1;
        nr = -dy / L; ny = dr / L;             // outward: tangent turned +90°
      }
      ir[k] = Math.max(0, pr[k] - t * nr);
      iy[k] = py[k] - t * ny;
    }
    /* THE AREA IS THE THING THAT CANNOT CHANGE, so it is measured here rather
       than typed: a lipid bilayer stretches a few percent and then tears, and
       every osmotic story about this cell follows from that. `sphereR` is the
       sphere that this much membrane can enclose, and `swellRatio` how much
       more water it holds than the disc — the swelling limit, read off the
       geometry instead of quoted. */
    let area = 0, vol = 0;
    for (let k = 0; k < K; k++) {
      const dr = pr[k + 1] - pr[k], dy = py[k + 1] - py[k];
      area += Math.PI * (pr[k] + pr[k + 1]) * Math.hypot(dr, dy);
      if (k < (K >> 1)) vol += Math.PI * (pr[k] + pr[k + 1]) * dr * (py[k] + py[k + 1]);
    }
    const sphereR = Math.sqrt(area / (4 * Math.PI));
    const swellRatio = (4 / 3 * Math.PI * sphereR ** 3) / vol;
    return { pr, py, ir, iy, area, vol, sphereR, swellRatio };
  }

  /* Half-height of the OUTER surface at radius r: the ceiling a point sits
     under, which is what says where it goes when the cell rounds out. */
  function topY(prof, r) {
    const { pr, py } = prof, h = K >> 1;
    if (r >= pr[h]) return 0;
    let k = 0;
    while (k < h && pr[k + 1] < r) k++;
    const span = pr[k + 1] - pr[k];
    const u = span > 1e-9 ? (r - pr[k]) / span : 0;
    return Math.max(0, py[k] + (py[k + 1] - py[k]) * u);
  }
  function topTable(prof) {
    const N = 192, t = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) t[i] = topY(prof, R0 * i / N);
    return t;
  }

  /* Half-height of the lumen at radius r, for placing beads inside it. */
  function lumenY(prof, r) {
    const { ir, iy } = prof;
    const h = K >> 1;                          // k=0..h is the top half, ir rising
    if (r >= ir[h]) return 0;
    let k = 0;
    while (k < h && ir[k + 1] < r) k++;
    const span = ir[k + 1] - ir[k];
    const u = span > 1e-9 ? (r - ir[k]) / span : 0;
    return Math.max(0, iy[k] + (iy[k + 1] - iy[k]) * u);
  }

  /* A table of that half-height, because every bead asks for it every frame. */
  function lumenTable(prof) {
    const N = 192, t = new Float32Array(N + 1);
    for (let i = 0; i <= N; i++) t[i] = lumenY(prof, R0 * i / N);
    return t;
  }
  function tableAt(tab, r) {
    const N = tab.length - 1, u = r / R0 * N;
    if (u <= 0) return tab[0];
    if (u >= N) return 0;
    const i = u | 0;
    return tab[i] + (tab[i + 1] - tab[i]) * (u - i);
  }

  /* PURE WATER, AND WHY THE CELL STOPS AT A SPHERE. Water follows its own
     gradient into the cytoplasm and the cell fills. It cannot answer by
     stretching — the membrane gives a few percent and tears — so the shape it
     ends at is the one that holds the most volume for a FIXED area, which is
     the sphere, and the biconcave disc's dimples are exactly the slack that
     makes the journey possible. That sphere is NARROWER across than the disc
     and about half again as much water; both numbers come off `profile`.
     Past it there is nowhere left to go, and the cell lyses.

     A point of the cell is carried by the height it sits at as a fraction of
     the surface above it: that fraction is preserved, so the surface lands on
     the sphere, the middle stays the middle, and the contents spread through
     the new volume without any of them being tested against the membrane. */
  /* AND SALT IS THE SAME ARGUMENT RUN BACKWARDS. Water leaves, the volume
     falls, and the area STILL cannot change — so now there is too much
     membrane for the shape, and the surplus buckles out as spicules. That is
     what a crenated cell (an echinocyte) is: not a shrunken disc, a disc
     wearing its own leftover skin. The same lerp does both, at a smaller
     target radius, and the spikes below are where the leftover goes. */
  function swellPoint(x, y, z, s, Rt, tab, o) {
    if (s <= 0.0005) { o[0] = x; o[1] = y; o[2] = z; return o; }
    const rr = Math.hypot(x, z);
    const h0 = tableAt(tab, rr);
    let u = h0 > 1e-4 ? y / h0 : 0;
    if (u > 1) u = 1; else if (u < -1) u = -1;
    const rho = Math.min(1, rr / R0);
    const tr = Rt * rho, th = Rt * Math.sqrt(Math.max(0, 1 - rho * rho));
    const nr = rr + (tr - rr) * s;
    o[0] = rr > 1e-6 ? x * (nr / rr) : x;
    o[1] = y + (u * th - y) * s;
    o[2] = rr > 1e-6 ? z * (nr / rr) : z;
    return o;
  }

  /* The spicules, baked onto the grid once: a value per (k, j), so crenating
     costs an array read and not two dozen dot products a vertex.

     THEY ARE EVENLY SPACED BECAUSE THE PHYSICS IS, and only that far. Buckling
     picks a wavelength — set by how stiff the membrane is against how much of
     it is surplus — so the spikes really do come out roughly one spacing
     apart, and a random scatter would look wrong in the other direction. What
     a real echinocyte does NOT have is one spike shape repeated: the seats are
     nudged off the lattice, and every spike gets its own width, height and
     bluntness, some of them knobs and some of them thorns. The two smooth
     harmonics under all of it are what keeps the body from being a sphere with
     decoration on it. */
  function spicules(seed) {
    const R = rng(seed ^ 0x5bd1), N = 14 + ((R() * 14) | 0);
    const sp = new Float64Array(N * 6), GA = Math.PI * (3 - Math.sqrt(5)), turn = R() * 6.283;
    const jit = 0.42 / Math.sqrt(N);           // a fraction of the spacing, never more
    for (let i = 0; i < N; i++) {
      const yy = 1 - (2 * i + 1) / N, rr = Math.sqrt(Math.max(0, 1 - yy * yy)), th = GA * i + turn;
      let dx = rr * Math.cos(th) + (R() * 2 - 1) * jit;
      let dy = yy + (R() * 2 - 1) * jit;
      let dz = rr * Math.sin(th) + (R() * 2 - 1) * jit;
      const L = Math.hypot(dx, dy, dz) || 1;
      sp[i * 6] = dx / L; sp[i * 6 + 1] = dy / L; sp[i * 6 + 2] = dz / L;
      sp[i * 6 + 3] = 0.45 + R() * 0.85;                 // height
      sp[i * 6 + 4] = Math.cos(0.17 + R() * 0.26);       // width
      sp[i * 6 + 5] = 1.3 + R() * 1.9;                   // 1.3 a knob, 3 a thorn
    }
    const h = [0.30 + R() * 0.22, 2 + ((R() * 3) | 0), 1 + ((R() * 3) | 0), R() * 6.283,
               0.18 + R() * 0.16, 3 + ((R() * 4) | 0), 2 + ((R() * 3) | 0), R() * 6.283];
    const field = new Float32Array((K + 1) * J);
    let min = 0;
    for (let k = 0; k <= K; k++) {
      const f = Math.PI * k / K, si = Math.sin(f), co = Math.cos(f);
      for (let j = 0; j < J; j++) {
        const t = 2 * Math.PI * j / J;
        const dx = si * Math.cos(t), dy = co, dz = si * Math.sin(t);
        let v = h[0] * Math.sin(h[1] * t + h[2] * f + h[3]) + h[4] * Math.sin(h[5] * t + h[6] * f + h[7]);
        for (let i = 0; i < N * 6; i += 6) {
          const d = dx * sp[i] + dy * sp[i + 1] + dz * sp[i + 2];
          if (d <= sp[i + 4]) continue;
          v += sp[i + 3] * Math.pow((d - sp[i + 4]) / (1 - sp[i + 4]), sp[i + 5]);
        }
        const w = Math.max(-0.5, v);            // a dent, never an inversion
        field[k * J + j] = w;
        if (w < min) min = w;
      }
    }
    /* The DEEPEST dent, because the contents have to clear it: a bead is
       placed against the smooth target and the buckling can push the membrane
       inside that. Whoever pulls the target in is who reads this. */
    field.min = min;
    return field;
  }

  /* ---- the deformation --------------------------------------------------- */

  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; }

  /* THE SHAPE OF ONE PARTICULAR CELL. A sickled cell is not a lens with two
     matching points: the two ends are different lengths and different
     thicknesses, one of them hooks, the outline is uneven down its sides, and
     the folds are wherever the polymer happened to bundle. All of that is
     drawn once per seed and then held fixed, so a cell keeps its own face
     across a morph and `seed` is what asks for another one.

     Every coefficient is a smooth field, never a per-vertex jitter: the same
     numbers deform the outer surface, the inner surface and the haemoglobin,
     and noise applied per vertex would tear the three apart. */
  function makeShape(seed) {
    const R = rng(seed), pick = (lo, hi) => lo + R() * (hi - lo);
    const cr = new Float64Array(16);
    for (let i = 0; i < 4; i++) {
      cr[i * 4] = pick(0.05, 0.14);          // amplitude, µm
      cr[i * 4 + 1] = pick(-2.6, 2.6);       // across the width
      cr[i * 4 + 2] = pick(-1.4, 1.4);       // along the length
      cr[i * 4 + 3] = R() * 6.283;
    }
    /* THE RIM'S OWN POINTS. A sickled cell is not a lens with a spike at each
       end: the polymer pushes the rim out wherever a bundle reaches it, so the
       edge carries several points of different sizes and the two ends are only
       the largest of them. Each is a narrow bump on the rim angle, pushed out
       and lifted; the compact support is what makes it a POINT rather than one
       more term in a smooth outline. */
    const NS = 3 + ((R() * 4) | 0);          // 3-6 of them
    const sp = new Float64Array(NS * 4);
    for (let i = 0; i < NS; i++) {
      sp[i * 4] = R() * 6.283;               // where on the rim
      sp[i * 4 + 1] = pick(0.22, 0.44);      // half-width, radians
      sp[i * 4 + 2] = pick(0.30, 0.85);      // how far out, µm
      sp[i * 4 + 3] = pick(-0.45, 0.45);     // and how far up
    }
    return {
      taper: [pick(0.34, 0.52), pick(0.34, 0.52)],
      pull:  [pick(0.20, 0.42), pick(0.20, 0.42)],
      thin:  [pick(0.65, 0.88), pick(0.65, 0.88)],
      hook:  [pick(-0.7, 0.7), pick(-0.7, 0.7)],
      wA1: pick(0.06, 0.15), wF1: pick(0.30, 0.60), wP1: R() * 6.283,
      wA2: pick(0.03, 0.09), wF2: pick(0.9, 1.5), wP2: R() * 6.283,
      swayA: pick(-0.55, 0.55), swayF: pick(0.25, 0.55), swayP: R() * 6.283,
      kap: pick(0.095, 0.135),
      cr, sp,
    };
  }

  /* Resting disc (XZ plane, y the thickness axis) to sickled cell, under one
     cell's own coefficients. Order matters: everything that shapes the flat
     sheet happens first, and the bend that makes the boat happens last, on the
     arc-length coordinate x. The trough and the folds are added to y ALONE and
     identically to both surfaces, so they bend the sheet without thinning it. */
  function warp(x, y, z, m, S, o) {
    if (m <= 0.0005) { o[0] = x; o[1] = y; o[2] = z; o[3] = 1; return o; }
    const bx = x, bz = z;

    const sx = 1 + 0.34 * m;
    x *= sx;
    const a = Math.min(1, Math.abs(x) / (R0 * sx));
    const e = x >= 0 ? 0 : 1;                  // which end: they are not alike

    // Narrower, and uneven down its length rather than a clean ellipse.
    const wob = 1 + m * (S.wA1 * Math.sin(S.wF1 * bx + S.wP1)
                       + S.wA2 * Math.sin(S.wF2 * bx + S.wP2));
    z *= (1 - 0.34 * m) * wob;
    let ysc = 1 - 0.22 * m;                    // how much this place has thinned
    y *= ysc;

    // The horns. The taper is held to the outer third — a squeeze that reaches
    // the middle draws a lens — and each end gets its own length, thinness and
    // sideways hook.
    const tip = smooth(S.taper[e], 1.0, a);
    x += m * S.pull[e] * R0 * tip * Math.sign(x);
    ysc *= 1 - m * S.thin[e] * tip;
    y *= 1 - m * S.thin[e] * tip;
    z = z * (1 - m * 0.70 * tip) + m * S.hook[e] * tip;

    // The long axis is not a straight line in plan either.
    z += m * S.swayA * Math.sin(S.swayF * bx + S.swayP);

    // The rim's points, on the RESTING angle so each one keeps its spoke.
    const rho = Math.hypot(bx, bz) / R0;
    const rim = smooth(0.58, 1.0, rho);
    if (rim > 0) {
      const th = Math.atan2(bz, bx), sp = S.sp;
      let out = 0, up = 0;
      for (let i = 0; i < sp.length; i += 4) {
        let d = th - sp[i];
        if (d > Math.PI) d -= 6.28318; else if (d < -Math.PI) d += 6.28318;
        const u = d / sp[i + 1];
        if (u <= -1 || u >= 1) continue;
        const b = (1 - u * u) * (1 - u * u);   // compact, so the point stays a point
        out += b * sp[i + 2]; up += b * sp[i + 3];
      }
      if (out || up) {
        const k = m * rim;
        x += k * out * Math.cos(th);
        z += k * out * Math.sin(th);
        y += k * up;
      }
    }

    // The trough across the width, and the folds the polymer leaves.
    const env = 1 - a * a, cr = S.cr;
    let d = 0.075 * z * z;
    for (let i = 0; i < 16; i += 4) d += env * cr[i] * Math.sin(cr[i + 1] * bz + cr[i + 2] * bx + cr[i + 3]);
    y += m * d;

    // The boat: the long axis bends OUT of the disc's plane, lifting both
    // tips, and the trough above runs along the keel. Bending it within the
    // plane instead draws a banana in plan view, which is the same curvature
    // read as a different cell.
    const kap = m * S.kap;                     // ~70-100° of arc at m=1
    if (kap > 1e-6) {
      const Rb = 1 / kap, ang = x * kap, rr = Rb - y;
      x = rr * Math.sin(ang);
      y = Rb - rr * Math.cos(ang);
    }
    o[0] = x; o[1] = y; o[2] = z; o[3] = ysc; return o;
  }

  /* ---- haemoglobin ------------------------------------------------------- */

  /* Two resting layouts for the same beads, in DISC space: a free cloud, and
     the bundles HbS forms when it polymerises. The morph lerps between them and
     the warp carries the result into the crescent, so a fibre curves with the
     cell without being told the cell curved. */
  function beads(n, prof, seed) {
    const R = rng(seed);
    const free = new Float32Array(n * 3), fib = new Float32Array(n * 3);
    const rad = new Float32Array(n), lag = new Float32Array(n);
    const esc = new Float32Array(n * 4);       // where each one goes when the cell lets go

    for (let i = 0; i < n; i++) {
      let r, y;
      /* The margin is RADIAL, and it is the one the vertical clamp cannot
         give: at the rim the membrane's normal points outward, so a bead with
         room above it can still have none in front of it — and the spikes
         stretch that gap further. Kept a third of a micron short of the inner
         rim. */
      do { r = R0 * 0.87 * Math.sqrt(R()); y = lumenY(prof, r); } while (y < 0.05);
      const th = R() * Math.PI * 2;
      free[i * 3] = r * Math.cos(th);
      free[i * 3 + 1] = (R() * 2 - 1) * (y - 0.03);
      free[i * 3 + 2] = r * Math.sin(th);
      rad[i] = 0.048 + R() * 0.026;
      lag[i] = R() * 0.35;
      esc[i * 4] = 0.5 + R() * 2.2;            // how far out
      esc[i * 4 + 1] = R() * 2 - 1;            // and off which way, so it is a
      esc[i * 4 + 2] = R() * 2 - 1;            // cloud rather than a starburst
      esc[i * 4 + 3] = R() * 2 - 1;
    }

    const F = 16, per = Math.ceil(n / F);
    for (let f = 0; f < F; f++) {
      const z0 = (R() * 2 - 1) * R0 * 0.66;
      const yf = (R() * 2 - 1) * 0.72;
      const ph = R() * 6.28, wob = 0.06 + R() * 0.10;
      for (let q = 0; q < per; q++) {
        const i = f * per + q; if (i >= n) break;
        const s = per > 1 ? (q / (per - 1)) * 2 - 1 : 0;
        const z = z0 + wob * Math.sin(3.2 * s + ph);
        const xm = Math.sqrt(Math.max(0, (R0 * 0.87) ** 2 - z * z));
        const x = s * xm;
        fib[i * 3] = x;
        fib[i * 3 + 1] = yf * lumenY(prof, Math.hypot(x, z));
        fib[i * 3 + 2] = z;
      }
    }
    return { free, fib, rad, lag, esc };
  }

  /* ---- the cell ---------------------------------------------------------- */

  function create(THREE, root, params) {
    const P = Object.assign({}, DEFAULTS, params);
    const NV = (K + 1) * J;

    const geoOut = new THREE.BufferGeometry();
    const geoIn = new THREE.BufferGeometry();
    const posOut = new Float32Array(NV * 3), norOut = new Float32Array(NV * 3);
    const posIn = new Float32Array(NV * 3), norIn = new Float32Array(NV * 3);
    geoOut.setAttribute('position', new THREE.BufferAttribute(posOut, 3));
    geoOut.setAttribute('normal', new THREE.BufferAttribute(norOut, 3));
    geoIn.setAttribute('position', new THREE.BufferAttribute(posIn, 3));
    geoIn.setAttribute('normal', new THREE.BufferAttribute(norIn, 3));
    const idxOut = new Uint32Array(K * J * 6), idxIn = new Uint32Array(K * J * 6);
    geoOut.setIndex(new THREE.BufferAttribute(idxOut, 1));
    geoIn.setIndex(new THREE.BufferAttribute(idxIn, 1));

    // The cut face: a ribbon between the two surfaces, all the way round the
    // boundary of the removed wedge. The loop runs down one spoke and back up
    // the other; the two meet AT the poles, so it closes.
    const LP = 2 * (K + 1);
    const geoEdge = new THREE.BufferGeometry();
    const posEdge = new Float32Array(LP * 2 * 3);
    geoEdge.setAttribute('position', new THREE.BufferAttribute(posEdge, 3));
    const idxEdge = new Uint32Array(LP * 6);
    for (let l = 0; l < LP; l++) {
      const m = (l + 1) % LP, o = l * 6;
      idxEdge[o] = l; idxEdge[o + 1] = LP + l; idxEdge[o + 2] = m;
      idxEdge[o + 3] = m; idxEdge[o + 4] = LP + l; idxEdge[o + 5] = LP + m;
    }
    geoEdge.setIndex(new THREE.BufferAttribute(idxEdge, 1));

    const matOut = new THREE.MeshPhysicalMaterial({
      color: COL.outer, roughness: 0.46, metalness: 0.0,
      clearcoat: 0.5, clearcoatRoughness: 0.36,
    });
    const matIn = new THREE.MeshStandardMaterial({ color: COL.inner, roughness: 0.85, metalness: 0 });
    const matEdge = new THREE.MeshStandardMaterial({ color: COL.edge, roughness: 0.6, side: THREE.DoubleSide });

    const meshOut = new THREE.Mesh(geoOut, matOut);
    const meshIn = new THREE.Mesh(geoIn, matIn);
    const meshEdge = new THREE.Mesh(geoEdge, matEdge);
    meshOut.frustumCulled = false; meshIn.frustumCulled = false; meshEdge.frustumCulled = false;

    const grp = new THREE.Group();
    grp.add(meshOut, meshIn, meshEdge);
    root.add(grp);

    const hbGeo = new THREE.IcosahedronGeometry(1, 0);
    const hbMat = new THREE.MeshStandardMaterial({ color: COL.hb, roughness: 0.5, metalness: 0, flatShading: true });
    const hb = new THREE.InstancedMesh(hbGeo, hbMat, P.hbCount);
    hb.frustumCulled = false;
    hb.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    grp.add(hb);

    const cosT = new Float32Array(J), sinT = new Float32Array(J);
    for (let j = 0; j < J; j++) { const t = 2 * Math.PI * j / J; cosT[j] = Math.cos(t); sinT[j] = Math.sin(t); }

    let prof = profile(P.membrane);
    let lut = lumenTable(prof), top = topTable(prof);
    let shape = makeShape(P.seed);
    /* The sphere the membrane can just enclose, sampled on the same k so a
       swell is a lerp between two arrays and not a second parametrisation. */
    const sO = new Float64Array((K + 1) * 2), sI = new Float64Array((K + 1) * 2);
    const cO = new Float64Array((K + 1) * 2), cI = new Float64Array((K + 1) * 2);
    let spic = spicules(P.seed);

    /* THE WATER THE CELL IS HOLDING RIGHT NOW, off the same lerp apply()
       draws: the resting volume cannot answer "what did the solution do to
       it", and a page printing a number beside a tonicity control needs the
       one on screen. Area is not measured here on purpose — it is fixed, which
       is the premise both ends follow from, so `area` stays the profile's.
       Computed on demand rather than cached from a frame, so state() is right
       before the first one, and the spikes are left out: a spicule is surplus
       membrane buckling inward-of-nothing, it moves no water. */
    function volumeNow() {
      const t = P.tonicity, w = Math.abs(t), tO = t <= 0 ? sO : cO, { pr, py } = prof;
      if (!w) return prof.vol;
      let vol = 0, r0 = pr[0] + (tO[0] - pr[0]) * w, y0 = py[0] + (tO[1] - py[0]) * w;
      for (let k = 0; k < (K >> 1); k++) {
        const r1 = pr[k + 1] + (tO[(k + 1) * 2] - pr[k + 1]) * w;
        const y1 = py[k + 1] + (tO[(k + 1) * 2 + 1] - py[k + 1]) * w;
        vol += Math.PI * (r0 + r1) * (r1 - r0) * (y0 + y1);
        r0 = r1; y0 = y1;
      }
      return vol;
    }

    function sphere() {
      /* Two targets on the same axis: the sphere this much membrane can just
         enclose, and the smaller one left when 40% of the water has gone. */
      const Ro = prof.sphereR, Rc = Math.cbrt(3 * CRENATE * prof.vol / (4 * Math.PI));
      prof.crenR = Rc;
      for (let k = 0; k <= K; k++) {
        const f = Math.PI * k / K, si = Math.sin(f), co = Math.cos(f);
        sO[k * 2] = Ro * si; sO[k * 2 + 1] = Ro * co;
        sI[k * 2] = (Ro - P.membrane) * si; sI[k * 2 + 1] = (Ro - P.membrane) * co;
        cO[k * 2] = Rc * si; cO[k * 2 + 1] = Rc * co;
        cI[k * 2] = (Rc - P.membrane) * si; cI[k * 2 + 1] = (Rc - P.membrane) * co;
      }
    }
    sphere();
    let bd = beads(P.hbCount, prof, P.seed);
    const dummy = new THREE.Object3D();
    const o3 = [0, 0, 0, 1];
    let dirty = true;

    /* -- the index buffer, rewritten only when the wedge moves -- */
    let cutA = 0, cutN = 0;
    function reindex() {
      cutN = Math.round(Math.min(1, Math.max(0, P.cut)) * J * 0.5);
      cutA = ((Math.round(P.cutTurn * J) % J) + J) % J;
      let n = 0;
      for (let j = 0; j < J; j++) {
        if (((j - cutA + J) % J) < cutN) continue;        // withheld: the wedge
        const j2 = (j + 1) % J;
        for (let k = 0; k < K; k++) {
          const a = k * J + j, b = k * J + j2, c = (k + 1) * J + j, d = (k + 1) * J + j2;
          // Outward winding: (k,j) → (k,j+1) → (k+1,j).
          idxOut[n] = a; idxOut[n + 1] = b; idxOut[n + 2] = c;
          idxOut[n + 3] = b; idxOut[n + 4] = d; idxOut[n + 5] = c;
          idxIn[n] = a; idxIn[n + 1] = c; idxIn[n + 2] = b;     // reversed: faces the lumen
          idxIn[n + 3] = b; idxIn[n + 4] = c; idxIn[n + 5] = d;
          n += 6;
        }
      }
      geoOut.setDrawRange(0, n); geoIn.setDrawRange(0, n);
      geoOut.index.needsUpdate = true; geoIn.index.needsUpdate = true;
      meshIn.visible = meshEdge.visible = cutN > 0 && vis.membrane;
      dirty = true;
    }

    /* -- every vertex, every bead, through one warp -- */
    function apply() {
      const m = P.sickle, t = P.tonicity, w = Math.abs(t);
      const tO = t <= 0 ? sO : cO, tI = t <= 0 ? sI : cI;
      const spike = Math.max(0, t) * SPIKE;
      const { pr, py, ir, iy } = prof;
      /* The lerped profile's own normal, which is the direction a spicule
         stands in and the ONLY direction it may: pushed along anything else it
         would thin the membrane, and the membrane is the thing that cannot
         change. Both surfaces take the same push, so the shell keeps its
         thickness and only its shape buckles. */
      for (let k = 0; k <= K; k++) {
        const rO = pr[k] + (tO[k * 2] - pr[k]) * w, yO = py[k] + (tO[k * 2 + 1] - py[k]) * w;
        const rI = ir[k] + (tI[k * 2] - ir[k]) * w, yI = iy[k] + (tI[k * 2 + 1] - iy[k]) * w;
        let nr = 0, ny = k === 0 ? 1 : -1;
        if (k > 0 && k < K) {
          const ka = k - 1, kb = k + 1;
          const dr = (pr[kb] + (tO[kb * 2] - pr[kb]) * w) - (pr[ka] + (tO[ka * 2] - pr[ka]) * w);
          const dy = (py[kb] + (tO[kb * 2 + 1] - py[kb]) * w) - (py[ka] + (tO[ka * 2 + 1] - py[ka]) * w);
          const L = Math.hypot(dr, dy) || 1;
          nr = -dy / L; ny = dr / L;
        }
        for (let j = 0; j < J; j++) {
          const o = (k * J + j) * 3, c = cosT[j], s = sinT[j];
          const p = spike ? spike * spic[k * J + j] : 0;
          const dr = p * nr, dy = p * ny;
          warp((rO + dr) * c, yO + dy, (rO + dr) * s, m, shape, o3);
          posOut[o] = o3[0]; posOut[o + 1] = o3[1]; posOut[o + 2] = o3[2];
          warp((rI + dr) * c, yI + dy, (rI + dr) * s, m, shape, o3);
          posIn[o] = o3[0]; posIn[o + 1] = o3[1]; posIn[o + 2] = o3[2];
        }
      }
      gridNormals(posOut, norOut, 1);
      gridNormals(posIn, norIn, -1);
      geoOut.attributes.position.needsUpdate = geoOut.attributes.normal.needsUpdate = true;
      geoIn.attributes.position.needsUpdate = geoIn.attributes.normal.needsUpdate = true;

      if (cutN > 0) edge();
      if (hb.visible) instances(m);
    }

    /* Normals from the grid itself: one cross product per vertex, against
       three.js's face-accumulate over 41k triangles. `sign` flips them for the
       inner surface, which has to be lit from inside the lumen. The poles have
       no j-neighbours to difference, so they take the next ring's. */
    function gridNormals(pos, nor, sign) {
      for (let k = 0; k <= K; k++) {
        if (k === 0 || k === K) continue;
        for (let j = 0; j < J; j++) {
          const o = (k * J + j) * 3;
          const a = ((k - 1) * J + j) * 3, b = ((k + 1) * J + j) * 3;
          const c = (k * J + (j + J - 1) % J) * 3, d = (k * J + (j + 1) % J) * 3;
          const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
          const vx = pos[d] - pos[c], vy = pos[d + 1] - pos[c + 1], vz = pos[d + 2] - pos[c + 2];
          let nx = vy * uz - vz * uy, ny = vz * ux - vx * uz, nz = vx * uy - vy * ux;
          const L = Math.hypot(nx, ny, nz) || 1;
          nor[o] = sign * nx / L; nor[o + 1] = sign * ny / L; nor[o + 2] = sign * nz / L;
        }
      }
      for (let j = 0; j < J; j++) {
        const p0 = j * 3, p1 = (J + j) * 3, q0 = (K * J + j) * 3, q1 = ((K - 1) * J + j) * 3;
        nor[p0] = nor[p1]; nor[p0 + 1] = nor[p1 + 1]; nor[p0 + 2] = nor[p1 + 2];
        nor[q0] = nor[q1]; nor[q0 + 1] = nor[q1 + 1]; nor[q0 + 2] = nor[q1 + 2];
      }
    }

    function edge() {
      const jB = (cutA + cutN) % J;
      for (let l = 0; l < LP; l++) {
        const top = l <= K;
        const k = top ? l : (2 * K + 1 - l);
        const j = top ? jB : cutA;
        const src = (k * J + j) * 3, o = l * 3;
        posEdge[o] = posOut[src]; posEdge[o + 1] = posOut[src + 1]; posEdge[o + 2] = posOut[src + 2];
        const p = (LP + l) * 3;
        posEdge[p] = posIn[src]; posEdge[p + 1] = posIn[src + 1]; posEdge[p + 2] = posIn[src + 2];
      }
      geoEdge.attributes.position.needsUpdate = true;
      geoEdge.computeVertexNormals();          // 292 vertices; cheaper than caring
    }

    function instances(m) {
      const n = P.hbCount, TAU = Math.PI * 2, t = P.tonicity, sp = P.spill;
      const w = Math.abs(t);
      // The beads take the smooth target and never the spikes: a spicule only
      // pushes the membrane outward, so what was inside stays inside.
      const Rt = (t <= 0 ? prof.sphereR : prof.crenR + spic.min * SPIKE) - P.membrane;
      for (let i = 0; i < n; i++) {
        const o = i * 3;
        // Each bead starts moving at its own moment, so the cloud gathers into
        // fibres in a wave rather than as one rigid slide.
        const u = smooth(bd.lag[i], bd.lag[i] + 0.65, m);
        let x = bd.free[o] + (bd.fib[o] - bd.free[o]) * u;
        let y = bd.free[o + 1] + (bd.fib[o + 1] - bd.free[o + 1]) * u;
        let z = bd.free[o + 2] + (bd.fib[o + 2] - bd.free[o + 2]) * u;

        /* BOTH ENDS OF THAT LERP ARE INSIDE THE CELL AND THE PATH BETWEEN THEM
           IS NOT: the lumen is a quarter of a micron deep over the dimple and
           four times that at the rim, so a bead crossing the middle surfaces
           straight through the membrane. Held under the ceiling at whatever
           radius it has reached, and fitted to the room there. */
        const room = tableAt(lut, Math.hypot(x, z));
        const rad = Math.min(bd.rad[i], room * 0.8);
        const cap = room - rad;
        if (cap <= 0) y = 0; else if (y > cap) y = cap; else if (y < -cap) y = -cap;

        // Hidden with the half it sits in, tested on the RESTING angle so the
        // test matches the spokes the index buffer withheld. Once it is outside
        // the cell, the cut is not its business.
        let hide = false;
        if (cutN > 0 && sp < 0.15) {
          let th = Math.atan2(z, x); if (th < 0) th += TAU;
          const j = Math.floor(th / TAU * J) % J;
          hide = ((j - cutA + J) % J) < cutN;
        }
        /* And smaller out where the rim's own points stretch the sheet
           sideways, which no vertical measure sees. Scaled by the sickling,
           because a cell that has not sickled has no points to stretch it. */
        const edge = 1 - 0.75 * m * smooth(0.58, 1.0, Math.hypot(x, z) / R0);

        swellPoint(x, y, z, w, Rt, top, o3);
        x = o3[0]; y = o3[1]; z = o3[2];

        /* Lysis: the membrane has torn and the haemoglobin is in the plasma.
           It leaves along its own line, not the surface's normal — the cell
           does not push it out, it stops holding it in. */
        if (sp > 0.0005) {
          const e = bd.esc, k2 = smooth(bd.lag[i], bd.lag[i] + 0.7, sp) * e[i * 4];
          x += (x + e[i * 4 + 1] * 1.2) * k2;
          y += (y + e[i * 4 + 2] * 1.2) * k2;
          z += (z + e[i * 4 + 3] * 1.2) * k2;
        }

        /* AND THE WARP THINS THE CELL UNDER IT. A bead fitted to the resting
           lumen still breaks the surface at a horn, where the sheet is squeezed
           to a fifth of its thickness — the bead is a sphere and does not
           squeeze with it. o3[3] is that local thinning, so the granules get
           smaller toward the points and vanish inside the sharpest of them. */
        warp(x, y, z, m, shape, o3);
        dummy.position.set(o3[0], o3[1], o3[2]);
        dummy.scale.setScalar(hide ? 0 : rad * o3[3] * edge);
        dummy.updateMatrix();
        hb.setMatrixAt(i, dummy.matrix);
      }
      hb.instanceMatrix.needsUpdate = true;
      hbMat.color.setHex(COL.hb).lerp(cSickleHb, m);
    }

    const cSickle = new THREE.Color(COL.outerSickle), cSickleHb = new THREE.Color(COL.hbFibre);
    const cGhost = new THREE.Color(COL.ghost);
    /* A GHOST IS WHAT IS LEFT, and it is the whole point of the lysis step:
       the membrane does not vanish, it stays as an empty pale bag. Opacity is
       the only place this component draws anything transparent, so the flag
       goes on with the spill and off again with it. */
    function paint() {
      const sp = P.spill;
      matOut.color.setHex(COL.outer).lerp(cSickle, P.sickle).lerp(cGhost, sp);
      matOut.transparent = sp > 0.001;
      matOut.opacity = 1 - 0.62 * sp;
      matIn.opacity = matOut.opacity; matIn.transparent = matOut.transparent;
      matEdge.opacity = matOut.opacity; matEdge.transparent = matOut.transparent;
    }


    /* ---- what a page can point at, and what may be hidden ------------------
       Anchors are functions because everything moves: the grid is rewritten
       every frame a morph runs, and a baked point drifts off the surface
       inside one tween. A part this shape does not HAVE — a dimple on a
       swollen sphere, a horn on a disc — answers null, so a note waits
       instead of pointing at empty water. */
    const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _m4 = new THREE.Matrix4();
    const wrapJ = j => ((j % J) + J) % J;
    const vert = (buf, k, j, out) => {
      const o = (k * J + wrapJ(j)) * 3;
      return grp.localToWorld(out.set(buf[o], buf[o + 1], buf[o + 2]));
    };
    const cutAway = j => cutN > 0 && ((wrapJ(j) - cutA + J) % J) < cutN;
    // The middle of the half still standing, so a rim note never lands in the
    // wedge that was taken away.
    const openSpoke = () => cutA + cutN + ((J - cutN) >> 1);
    const showSpoke = j => (cutAway(j) ? j + (J >> 1) : j);

    /* The tallest spicule, found when the field is built rather than scanned
       per frame: the note goes on the biggest spike, which is the one a reader
       is looking at. */
    let spikeIdx = 0;
    function findSpike() {
      let best = -Infinity;
      for (let i = 0; i < spic.length; i++) if (spic[i] > best) { best = spic[i]; spikeIdx = i; }
    }
    findSpike();

    const KC = Math.round(K * 0.32);

    const anchors = {
      rim:     () => vert(posOut, K >> 1, openSpoke(), _a),
      dimple:  () => (P.sickle > 0.4 || Math.abs(P.tonicity) > 0.4 ? null : vert(posOut, 0, openSpoke(), _a)),
      /* Partway up the cut, not out at its rim: the rim of a sickled cell is
         a horn, and a label out there leaves the frame. */
      cutFace: () => (cutN <= 0 ? null
                      : vert(posOut, KC, cutA, _a).lerp(vert(posIn, KC, cutA, _c), 0.5)),
      haemoglobin: () => {
        if (!P.hb || P.spill > 0.85) return null;
        hb.getMatrixAt(0, _m4);
        return grp.localToWorld(_a.setFromMatrixPosition(_m4));
      },
      horn:    () => (P.sickle < 0.35 ? null : vert(posOut, K >> 1, showSpoke(0), _a)),
      spicule: () => (P.tonicity < 0.35 ? null
                      : vert(posOut, (spikeIdx / J) | 0, showSpoke(spikeIdx % J), _a)),
    };

    /* A note fades as its part turns away, and only the two FLAT parts want
       that. A rim, a horn and a spicule sit on a convex silhouette: their
       outward normal reads as facing away through half of an orbit in which
       the student can plainly see them, and fading those is worse than never
       fading them. The cut face looks along the bisector of the wedge that
       was removed; the dimple looks up. */
    /* Its own vectors: an anchor and its facing are read in the same tick,
       and sharing scratch between them hands annotate a corrupted point. */
    const _d = new THREE.Vector3(), _o = new THREE.Vector3();
    const dirOf = (x, y, z) => grp.localToWorld(_d.set(x, y, z)).sub(grp.getWorldPosition(_o)).normalize();
    const facings = {
      cutFace: () => { const t = 2 * Math.PI * (cutA + cutN / 2) / J; return dirOf(Math.cos(t), 0, Math.sin(t)); },
      dimple:  () => dirOf(0, 1, 0),
    };

    /* Two sentences each, in a tutor's voice. Sizes are prose about the real
       cell, never a measurement of this render. */
    const library = {
      rim: { text: 'the rim', card: 'The thick edge of the disc, about 2.4 µm deep, where nearly all the curvature is. A red cell is a disc rather than a ball because that shape carries the most surface for the least volume, which is what lets oxygen in and out fast.' },
      dimple: { text: 'the dimple', card: 'The disc is pinched to about 0.8 µm in the middle: the biconcave face. The slack it leaves is what lets an 8 µm cell fold through a 3 µm capillary without tearing.' },
      // Leftward: the cut plane is at the far side of the frame, and the default label offset walks it off the edge.
      cutFace: { text: 'the membrane, cut', offset: [-38, -26], card: 'The cell is a shell, not a bag, and the cut shows its thickness. Drawn about twenty times too thick: a real bilayer is 5 nm, which at this magnification is a fraction of a pixel.' },
      haemoglobin: { text: 'hemoglobin', card: 'Around 270 million copies fill the cell, a third of its weight, and each carries four oxygens. There is no nucleus and there are no mitochondria in here; the space went to cargo.' },
      horn: { text: 'a sickled point', card: 'Deoxygenated HbS polymerises into stiff fibres that push the membrane out into points. A cell this shape is rigid, jams in small vessels, and is destroyed early.' },
      spicule: { text: 'a spicule', card: 'Water has left, so the volume fell while the membrane area could not. The surplus membrane buckles outward into spikes: a crenated cell, or echinocyte.' },
    };

    /* Layers, by visibility: hiding the membrane leaves the haemoglobin
       standing in the shape of the cell it was filling, which is the picture
       for "what is inside". */
    const vis = { membrane: true, hb: true };
    const LAYER_LABEL = { membrane: 'membrane', hb: 'hemoglobin' };
    function show(name, on) {
      if (!(name in vis)) return;
      vis[name] = !!on;
      if (name === 'hb') P.hb = vis.hb;
      hb.visible = vis.hb;
      meshOut.visible = vis.membrane;
      meshIn.visible = meshEdge.visible = vis.membrane && cutN > 0;
      dirty = true;
    }
    const layersOf = () => Object.keys(vis).map(k => ({ name: k, label: LAYER_LABEL[k], on: vis[k] }));
    const hex = c => '#' + c.getHexString();
    const palette = () => [
      { name: 'membrane', color: hex(matOut.color) },
      { name: 'cut face', color: hex(matEdge.color) },
      { name: 'hemoglobin', color: hex(hbMat.color) },
    ];

    reindex(); apply(); paint();

    return {
      group: grp, anchors, facings, library, layersOf, show, palette,
      set(next) {
        let re = false, rebuild = false;
        for (const k in next) {
          if (P[k] === next[k]) continue;
          if (k === 'cut' || k === 'cutTurn') re = true;
          if (k === 'membrane') rebuild = true;
          if (k === 'seed') rebuild = true;
          P[k] = next[k];
        }
        if (rebuild) { prof = profile(P.membrane); lut = lumenTable(prof); top = topTable(prof); shape = makeShape(P.seed); spic = spicules(P.seed); bd = beads(P.hbCount, prof, P.seed); sphere(); findSpike(); }
        vis.hb = !!P.hb; hb.visible = vis.hb;
        if (re) reindex();
        dirty = true;
      },
      step(dt) {
        if (P.autoRotate) { grp.rotation.y += dt * 0.35; }
        if (!dirty) return;
        dirty = false;
        apply(); paint();
      },
      touch() { dirty = true; },
      params: P,
      /* Measured off the profile, never typed: a page printing "half as much
         again" reads it from here. */
      facts() { return { discR: R0, sphereR: prof.sphereR, crenR: prof.crenR, area: prof.area, volume: volumeNow(), restVolume: prof.vol, swellRatio: prof.swellRatio, crenateFraction: CRENATE }; },
      dispose() {
        root.remove(grp);
        geoOut.dispose(); geoIn.dispose(); geoEdge.dispose(); hbGeo.dispose();
        matOut.dispose(); matIn.dispose(); matEdge.dispose(); hbMat.dispose();
      },
    };
  }

  /* ---- mount ------------------------------------------------------------- */

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('bloodcell.js: load kit/card-stage.js first');
    let cell = null, nb = null;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'BloodCell ' + ev);

    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0.35, phi: 0.95, r: 16 },   // square onto the cut face
      stage: Object.assign({ rMin: 7, rMax: 48, phiMin: 0.12, phiMax: 3.02 }, params.stage || {}),
      step: dt => { if (cell) { cell.step(dt); tw.update(dt); if (nb) nb.step(); emit('frame', api.state(), dt); } },
      viewOffset: params.viewOffset,
    });

    /* NO SHADOW MAPS ANYWHERE. A cast shadow on a form this smooth is a hard
       black crescent, and softening one costs a fill that flattens the dimple
       — the one feature the discocyte is here to show. Form comes from the
       normals. Stage's ambient is dropped and a hemisphere takes over, because
       an ambient this high leaves the cut face the same value as the outside.
       Key and rim ride the camera, Stage's own rule: orbiting then reads as
       turning the cell under a fixed lamp. */
    box.scene.traverse(o => {
      if (o.isAmbientLight) o.intensity = 0.26;
      else if (o.isDirectionalLight) o.intensity *= 0.55;
    });
    box.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a1414, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e8, 0.70); key.position.set(-4, 5, 6);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.5); rim.position.set(3, 2, -7);
    const under = new THREE.DirectionalLight(0xffd9c8, 0.28); under.position.set(2, -6, 2);
    box.camera.add(key, key.target, rim, rim.target, under, under.target);

    cell = create(THREE, box.root, params);
    const tw = global.CardStage.tweens();
    nb = global.Notebook
      ? global.Notebook.create({ box, anchors: cell.anchors, facings: cell.facings, library: cell.library })
      : null;

    const api = {
      set(next, opts = {}) {
        const glide = opts.snap ? 0 : (opts.seconds === undefined ? 0.9 : opts.seconds);
        let done = opts.onDone || null;        // fires once, on the first key that glides
        for (const k of ['sickle', 'tonicity', 'spill', 'cut']) {
          if (next[k] === undefined) continue;
          const from = cell.params[k], to = next[k];
          if (glide > 0 && from !== to) {
            tw.to(from, to, glide, v => { cell.set({ [k]: v }); }, { key: k, ease: 'smooth', onDone: done });
            done = null;
          } else { tw.cancel(k); cell.set({ [k]: to }); }
          delete next[k];
        }
        if (done) done();
        cell.set(next);
        return api;
      },
      state() { return Object.assign({}, cell.params, cell.facts(), { layersShown: cell.layersOf() }); },
      on(ev, fn) {
        const l = listeners[ev] || (listeners[ev] = []);
        l.push(fn);
        return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); };
      },
      /* The camera half of an anchor. Only the dimple needs one: it is on the
         face the default camera sees edge-on, and every other part is already
         in frame, so a chip that moved the camera each time would be seasick. */
      views: () => VIEWS,
      lookAt(name, dur) { if (VIEWS[name]) box.flyTo(VIEWS[name], dur); return api; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => (nb ? nb.list() : []),
      layers: cell.layersOf, palette: cell.palette,
      show(name, on) { cell.show(name, on); if (!box.running) box.draw(); return api; },
      sim: cell, box,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { if (nb) nb.clear(); cell.dispose(); box.destroy(); },
    };
    box.pump();
    return api;
  }

  /* COL and the disc profile are shared with bloodcell/bloodflow.js, so a
     crowd of cells and the one cell a page cuts open are the same red and the
     same shape rather than two opinions about a red cell. */
  global.BloodCell = { mount, create, DEFAULTS, R0, AMP, COL, profileY: g };

  /* Scale (kit/scale.js). MEASURED, unlike the cell diagrams:
     the profile is Evans & Fung's and a scene unit is a micrometre, so a page
     may print a length off state(). The one exaggeration is the membrane, and
     it is a parameter rather than a constant — 0.1 µm drawn against 5 nm real.
     Zooming into that shell is a handoff to Membrane, not a camera move. */
  global.BloodCell.SCALE = {
    rung: 'cell', form: 'single', unit: 1e-6,
    exag: { membrane: DEFAULTS.membrane / 0.005 },
    down: { membrane: 'Membrane' },
  };
})(window);
