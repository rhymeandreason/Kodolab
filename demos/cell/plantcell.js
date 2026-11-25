/* =============================================================================
 *  cell/plantcell.js — a plant cell cut open, in four tissues and three states
 * =============================================================================
 *  A hexagonal cell in a wall, cut on a tilted plane, with the organelles
 *  standing on the cut face. Global three.js and kit/card-stage.js, no build step.
 *
 *      PlantCell.create(THREE, root, camera, opts)   the model: root is yours
 *      PlantCell.mount(el, params)                   one box, one handle
 *
 *  LOAD cell/organelles.js FIRST. The nucleus, mitochondrion, Golgi, rough
 *  ER, plastids and vacuole are built there, and the first four are the same
 *  objects cell/animalcell.js builds, because they are the same organelles.
 *  What is here is what only a plant cell has: the wall, the plasmodesmata,
 *  the hexagonal protoplast, and the solver that packs everything into
 *  whatever room the vacuole leaves.
 *
 *  ONE UNIT SYSTEM WITH THE ANIMAL CELL. The apothem is `A` scene units and
 *  the animal cell's radius is 10, so the two can stand in one frame and an
 *  organelle from the kit is the right size in both without a fudge factor.
 *  A plant cell being the larger of the two is real. PROP TIER AND NOT A
 *  SCALE all the same: nothing here is measured, and a page must not print a
 *  number off it.
 *
 *  THE STATE AXIS IS ONE NUMBER, `t` in [0,2]: 0 turgid, 1 flaccid, 2
 *  plasmolysed. Everything that moves is a function of it — wall bulge,
 *  protoplast shrink, how round and how wrinkled it goes, and how much room
 *  the vacuole takes. It is one axis and not three states because the
 *  interesting part is between them, and a slider has to be able to stop
 *  there.
 *
 *  THE SOLVER IS THE LESSON, NOT DECORATION. Organelles are pushed by the
 *  vacuole rather than placed around it: as it swells they are squeezed into
 *  a thin layer against the membrane, and as the protoplast pulls off the
 *  wall they follow it in. Seeded targets say roughly where a thing belongs;
 *  the solve says where it ends up. So the same cell in two states is not
 *  two layouts, it is one layout under two pressures.
 *
 *  THE WALL AND THE PROTOPLAST ARE MORPHABLE GRIDS (PanelGeometry), rebuilt
 *  in place every frame `t` changes rather than regenerated. That is what
 *  makes plasmolysis a continuous motion instead of a cut between two meshes.
 *
 *  THE COMPONENT CONTRACT (docs/AddingAComponent.md, docs/Components.md):
 *
 *      params   tissue leaf|root|potato|cactus (rebuild) · t 0..2, or
 *               state by name · stream 0..3 · now:true to snap
 *      state()  tissue · t · state (nearest named point) · stream ·
 *               hovered · counts · shown
 *      events   frame · t · tissue · hover · pick
 *      parts    wall · membrane · plasmodesma · nucleus · vacuole ·
 *               chloroplast · amyloplast · mitochondrion · golgi · er ·
 *               ribosome · vesicle. One list serves anchors for note(),
 *               names for show(), and lookAt()'s targets, and LIBRARY
 *               carries the label and card for each.
 *
 *  WHAT EXISTS DEPENDS ON THE TISSUE, so a part this tissue did not build
 *  answers null rather than throwing, and its chip does not appear. A step
 *  may name `chloroplast` and simply not show it on a root cell.
 *
 *  ONLY `t` GLIDES. The tissue rebuilds and nothing can glide across a
 *  rebuild; the old layer shrinks away while the new one grows instead.
 * ========================================================================== */
(function (global) {
  'use strict';

  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = t => t * t * (3 - 2 * t);
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  /* ---- morphable panel grid ------------------------------------------
     A set of parametric patches sharing one buffer. `update()` re-evaluates
     every vertex from the patch functions, so the wall and the protoplast
     deform continuously instead of being rebuilt. */
  function PanelGeometry(THREE) {
    const panels = [];
    let count = 0, geometry = null;
    const api = {
      add(nu, nv, fn, o = {}) {
        panels.push({ nu, nv, fn, flip: !!o.flip, normal: o.normal || null, mi: o.mi || 0, uv: o.uv || null, off: count });
        count += (nu + 1) * (nv + 1);
        return api;
      },
      build() {
        const g = new THREE.BufferGeometry(), idx = [];
        for (const p of panels) {
          const s = idx.length;
          for (let j = 0; j < p.nv; j++) for (let i = 0; i < p.nu; i++) {
            const a = p.off + j * (p.nu + 1) + i, b = a + 1, c = a + p.nu + 1, d = c + 1;
            if (p.flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
          }
          p.gs = s; p.gc = idx.length - s;
        }
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
        g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(count * 2), 2));
        g.setIndex(idx);
        for (const p of panels) g.addGroup(p.gs, p.gc, p.mi);
        geometry = g;
        api.update();
        return g;
      },
      update() {
        const g = geometry, pos = g.attributes.position.array, uv = g.attributes.uv.array;
        const v = new THREE.Vector3(), w = new THREE.Vector2();
        for (const p of panels) {
          let k = p.off * 3, q = p.off * 2;
          for (let j = 0; j <= p.nv; j++) for (let i = 0; i <= p.nu; i++) {
            const uu = i / p.nu, vv = j / p.nv;
            p.fn(uu, vv, v);
            pos[k++] = v.x; pos[k++] = v.y; pos[k++] = v.z;
            if (p.uv) { p.uv(uu, vv, v, w); uv[q++] = w.x; uv[q++] = w.y; }
            else { uv[q++] = uu; uv[q++] = vv; }
          }
        }
        g.attributes.position.needsUpdate = true;
        g.attributes.uv.needsUpdate = true;
        g.computeVertexNormals();
        // A cut face's normal is the CUT PLANE's, not the mesh's: the seam
        // between the wall's faces would otherwise shade as a crease.
        const nor = g.attributes.normal.array;
        for (const p of panels) {
          if (!p.normal) continue;
          let k = p.off * 3;
          for (let j = 0; j <= p.nv; j++) for (let i = 0; i <= p.nu; i++) { p.normal(i / p.nu, j / p.nv, v); nor[k++] = v.x; nor[k++] = v.y; nor[k++] = v.z; }
        }
        g.attributes.normal.needsUpdate = true;
        g.computeBoundingSphere();
      },
      get geometry() { return geometry; },
    };
    return api;
  }

  /* ---- tissues -------------------------------------------------------
     Coordinates are fractions of the apothem; `create` multiplies by A. What
     differs between tissues is what a student can check against a photo: a
     leaf cell is full of chloroplasts, a root cell has none and stores
     starch instead, a potato cell is mostly starch, a cactus cell has a
     thick wall and a vacuole that is most of the cell.

     HOW MANY OF EACH IS A CLAIM, and the one a reader takes from a picture
     is the ORDER, not the number. This is a section, so what governs is not
     how many the cell has but how many a plane through it catches, which
     goes as count times width: a mesophyll cell has tens of chloroplasts
     but they are five microns across, and hundreds of mitochondria a fifth
     of that, so a section shows roughly as many of one as the other.
     Dictyosomes are mitochondrion-sized and there are far fewer of them, so
     they should be the scarcest of the three by a good margin. Counts here
     are stylised, but that ranking is not free to drift. */
  const TISSUES = {
    leaf: {
      ex: 1, wall: 0.07,
      nucleus: { x: -0.36, z: -0.16, s: 0.9 },
      vacuole: { x: 0.45, z: 0.25, s: 1.0 },
      organelles: [
        ['chloroplast', 0.02, 0.74, 0.15, 1.0], ['chloroplast', 0.62, 0.66, -0.55, 1.0],
        ['chloroplast', -0.5, 0.62, 0.65, 0.95], ['chloroplast', 0.9, -0.28, 1.15, 1.0],
        ['chloroplast', -0.22, -0.8, 0.3, 0.95],
        ['mitochondrion', 0.6, -0.52, 0.35, 1.0], ['mitochondrion', -0.6, 0.36, -0.4, 0.95],
        ['mitochondrion', -0.72, 0.10, 0.40, 0.95], ['mitochondrion', 0.78, 0.42, -0.80, 0.9],
        ['mitochondrion', 0.10, 0.95, 0.60, 0.95],
        ['dictyosome', 0.30, -0.62, 1.05, 1.0], ['dictyosome', -0.30, -0.32, 2.10, 0.9],
        ['vesicle', 0.3, 0.02, 0, 1], ['vesicle', 0.7, 0.02, 0, 1],
      ],
    },
    root: {
      ex: 1.5, wall: 0.07,
      nucleus: { x: -0.35, z: -0.1, s: 0.95 },
      vacuole: { x: 0.42, z: 0.15, s: 1.3 },
      organelles: [
        ['amyloplast', -0.75, 0.32, 0.4, 0.85], ['amyloplast', 0.05, 0.72, -0.3, 0.8], ['amyloplast', -0.7, -0.42, 0.9, 0.8],
        ['mitochondrion', -0.5, 0.58, 0.9, 0.95], ['mitochondrion', 0.2, -0.72, 0.3, 0.95],
        ['mitochondrion', -0.8, -0.05, -0.6, 0.95], ['mitochondrion', 0.66, -0.45, 0.9, 0.95],
        ['mitochondrion', 0.45, 0.7, 0.2, 0.9],
        ['dictyosome', 0.05, -0.42, 1.10, 1.0], ['dictyosome', -0.88, 0.45, 0.30, 0.9],
        ['vesicle', -0.6, 0.15, 0, 1], ['vesicle', 0.7, 0.5, 0, 1], ['vesicle', -0.3, -0.75, 0, 0.8],
      ],
    },
    potato: {
      ex: 1.1, wall: 0.06,
      nucleus: { x: -0.38, z: -0.28, s: 0.8 },
      vacuole: { x: 0.34, z: 0.28, s: 1.0 },
      organelles: [
        ['amyloplast2', 0.45, -0.7, -0.2, 1.25], ['amyloplast2', -0.6, 0.55, 0.7, 1.2], ['amyloplast2', 0.85, -0.3, 1.1, 1.15],
        ['amyloplast', 0.15, 0.8, 0.3, 1.05], ['amyloplast', -0.05, -0.15, 0.8, 1.0], ['amyloplast', -0.25, 0.8, 0.2, 0.95],
        ['mitochondrion', -0.8, 0.05, -0.5, 0.9], ['mitochondrion', 0.5, -0.15, 0.4, 0.9],
        ['mitochondrion', 0.70, 0.55, -0.40, 0.9],
        ['dictyosome', -0.05, -0.60, 0.90, 1.0], ['dictyosome', -0.80, -0.20, 1.60, 0.9],
        ['vesicle', 0.5, 0.6, 0, 1], ['vesicle', -0.55, 0.05, 0, 0.8],
      ],
    },
    cactus: {
      ex: 0.95, wall: 0.17,
      nucleus: { x: -0.38, z: -0.28, s: 0.7 },
      vacuole: { x: 0.33, z: 0.24, s: 1.25 },
      organelles: [
        ['chloroplast', -0.15, 0.72, 0.2, 0.75], ['chloroplast', 0.6, -0.62, -0.5, 0.75],
        ['chloroplast', -0.72, 0.35, 0.8, 0.7], ['chloroplast', 0.15, -0.78, 0.9, 0.7],
        ['mitochondrion', -0.35, -0.72, 0.9, 0.8], ['mitochondrion', -0.55, 0.62, 0.4, 0.8],
        ['mitochondrion', 0.68, 0.50, -0.70, 0.8],
        ['dictyosome', 0.10, -0.62, 1.10, 0.9], ['dictyosome', -0.62, -0.12, 0.50, 0.85],
        ['vesicle', -0.7, 0.05, 0, 0.8], ['vesicle', -0.4, 0.25, 0, 0.8],
      ],
    },
  };

  /* A lap of the cell in about ninety seconds. Real cyclosis runs a few
     microns a second round a cell tens of microns across, which is roughly
     that, and it is the right speed for something a reader should notice
     only once they stop and watch. */
  const STREAM = 0.07;

  const STATES = { turgid: 0, flaccid: 1, plasmolysis: 2 };
  const DEFAULTS = { seed: 1234, tissue: 'leaf', t: 0, A: 11, tilt: 0, stream: 1, detail: 0.5 };

  /* Every moving quantity as a function of the state axis. Two segments:
     0→1 the cell goes limp (it loses pressure, the wall stops bulging, the
     protoplast rounds slightly); 1→2 it plasmolyses (water leaves the
     vacuole, the protoplast pulls off the wall and wrinkles). */
  function stateParams(t) {
    const a = smooth(clamp(t, 0, 1)), b = smooth(clamp(t - 1, 0, 1));
    return {
      bulge: lerp(0.05, 0, a),
      shrink: t < 1 ? lerp(1, 0.965, a) : lerp(0.965, 0.6, b),
      round: t < 1 ? lerp(0, 0.12, a) : lerp(0.12, 0.9, b),
      wrinkle: t < 1 ? lerp(0, 0.006, a) : lerp(0.006, 0.045, b),
      vac: t < 1 ? lerp(1, 0.86, a) : lerp(0.86, 0.42, b),
      org: t < 1 ? 1 : lerp(1, 0.6, b),
      /* Cyclosis STOPS when a cell plasmolyses: the streaming is actin and
         myosin anchored to the cortex, and it fails as the protoplast pulls
         off the wall and loses turgor. So this is not decoration that keeps
         running through the lesson, it is a thing that dies with the cell. */
      stream: t < 1 ? 1 : lerp(1, 0, b),
    };
  }

  /* ---- the model ------------------------------------------------------ */

  function create(THREE, root, camera, opts = {}) {
    const O = Object.assign({}, DEFAULTS, opts);
    if (!global.CellOrganelles) throw new Error('cell/plantcell.js: load cell/organelles.js first');
    const K = global.CellOrganelles.kit(THREE, { seed: O.seed });
    const { rand, rr, col, mat, noise, ORG } = K;
    const TIS = global.MolLib.PALETTE.plantTissue;
    const V3 = THREE.Vector3;
    const A = O.A;

    const organelles = [];
    /* `owned` is the layer currently being built, if any. A tissue switch
       throws its layer away, and anything registered by that layer has to
       leave `organelles` with it — otherwise every switch adds another
       cell's worth of dead objects for the raycaster to test on every
       pointer move, and their materials are never freed. */
    let owned = null;
    const register = (obj, name) => {
      obj.userData.organelle = name;
      organelles.push(obj);
      if (owned) owned.push(obj);
      return obj;
    };
    function retire(L) {
      for (const o of L.userData.owned || []) {
        const i = organelles.indexOf(o);
        if (i >= 0) organelles.splice(i, 1);
        // geometry is cached and shared between plastids; materials are not
        o.traverse(x => { if (x.isMesh && x.material) x.material.dispose(); });
      }
    }

    const cell = new THREE.Group();
    cell.rotation.x = O.tilt;
    root.add(cell);

    /* cell shape: a hexagonal prism cut on a plane tilted toward the reader.
       hexR is the hexagon's radius at an angle; `round` blends it to a
       circle, which is what a protoplast does as it pulls away. */
    const CUT = { cb: 0.95 * A, sx: 0.12, sz: -0.32 }, PROTO_DROP = 0.07 * A;
    const topY = (x, z) => CUT.cb + CUT.sx * x + CUT.sz * z;
    const planeN = new V3(-CUT.sx, 1, -CUT.sz).normalize();
    /* GRID SIZE IS A PER-FRAME COST, not a load-time one: the wall and the
       protoplast are re-evaluated every frame the state moves, so these
       numbers are a frame budget as much as a look. At 44 x 10 the rebuild
       took most of a 60fps frame on its own. Measured: the solver is 0.1ms,
       the rebuild is everything else. */
    const SEG = 30, M = 7, KSEG = 14;
    const hexR = (th, a) => { const s = PI / 3, phi = ((th % s) + s) % s - s / 2; return a / Math.cos(phi); };
    const bulgeF = th => { const s = PI / 3, e = (((th % s) + s) % s - s / 2) / (s / 2); return 1 - e * e; };

    // C: the tissue's shape, tweened between tissues. P: the state.
    const C = { A, ex: 1, wall: 0.07 * A };
    let P = stateParams(O.t), St = { t: O.t };

    /* THE OUTER FACE IS ROUGH, the inner one is not, and that is the right
       way round: a wall's outside is layers of cellulose laid down against
       whatever is out there, while its inside is pressed flat against the
       membrane. So the wall's thickness varies, which is what a wall does.
       Same fbm displacement the plastid envelopes use, sampled on the ring
       (cos, sin) rather than on the angle, or it would seam at th = 0. It
       depends on position only, never on state, so the texture stays put
       while the cell swells and shrinks instead of swimming over it. */
    const ROUGH = 0.023;
    /* MEMOISED, because the wall is rebuilt on every frame the state moves
       and four octaves of simplex across eight thousand vertices is most of
       a frame's budget on its own. The grid asks for the same (th, v) pairs
       every rebuild, so after the first one this is all hits. Safe only
       because the grain does not depend on state — if it ever does, this
       cache is the thing that will quietly keep the old texture. */
    const grainCache = new Map();
    function wallGrain(th, v) {
      const key = Math.round(th * 1e5) * 1e6 + Math.round(v * 1e5);
      let g = grainCache.get(key);
      if (g === undefined) {
        g = 1 + ROUGH * noise.fbm(Math.cos(th) * 2.4, v * 2.6 + 3.1, Math.sin(th) * 2.4, 3)
              + ROUGH * 0.45 * noise.noise3(Math.cos(th) * 7, v * 5, Math.sin(th) * 7);
        grainCache.set(key, g);
      }
      return g;
    }
    const wallR = (th, v, inner) => hexR(th, inner ? C.A : C.A + C.wall)
      * (1 + P.bulge * bulgeF(th) * (0.35 + 0.65 * Math.sin(PI * v)))
      * (inner ? 1 : wallGrain(th, v));
    function protoR(th, v) {
      const a = C.A - 0.012 * A;
      const hex = hexR(th, a) * (1 + P.bulge * bulgeF(th) * (0.35 + 0.65 * Math.sin(PI * v)));
      let r = lerp(hex, a * 1.02, P.round) * P.shrink;
      r *= 1 + P.wrinkle * (Math.sin(th * 7 + 1.3) * Math.sin(v * 5.1 + 0.4) + 0.6 * Math.sin(th * 13 + v * 3) + 0.5 * Math.sin(th * 4 - v * 2));
      return r;
    }

    /* ---- wall: outer face, inner face, cut rim, middle lamella ---- */
    const wallPG = PanelGeometry(THREE);
    /* The wall's three faces and the cytosol are the tissue's, not the house
       palette's — see palette.js's `plantTissue` for why those two are the
       ones allowed to vary. Colours are held on the materials and glided on
       a tissue switch, so a leaf becoming a root is one motion rather than a
       cut. The lamella does not vary and is set once. */
    const wallMats = [
      mat({ color: TIS.leaf.wall, roughness: 0.72, clearcoat: 0.1 }),
      mat({ color: TIS.leaf.wallRim, roughness: 0.7, clearcoat: 0.1 }),
      mat({ color: TIS.leaf.wallRim, roughness: 0.66, clearcoat: 0.15 }),
      mat({ color: ORG.wall.lamella, roughness: 0.75, clearcoat: 0 }),
    ];
    for (let k = 0; k < 6; k++) {
      const th0 = k * PI / 3, dth = PI / 3;
      wallPG.add(SEG, M, (u, v, o) => { const th = th0 + u * dth, r = wallR(th, v, false), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th); o.set(x, lerp(0, topY(x, z), v), z); }, { mi: 0 });
      wallPG.add(SEG, M, (u, v, o) => { const th = th0 + u * dth, r = wallR(th, v, true), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th); o.set(x, lerp(0, topY(x, z), v), z); }, { flip: true, mi: 1 });
      wallPG.add(SEG, 1, (u, v, o) => { const th = th0 + u * dth, r = lerp(wallR(th, 1, true), wallR(th, 1, false), v), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th); o.set(x, topY(x, z), z); }, { flip: true, mi: 2, normal: (u, v, o) => o.copy(planeN) });
      wallPG.add(SEG, 1, (u, v, o) => { const th = th0 + u * dth, r = lerp(wallR(th, 0, true), wallR(th, 0, false), v); o.set(r * Math.cos(th) * C.ex, 0, r * Math.sin(th)); }, { mi: 2, normal: (u, v, o) => o.set(0, -1, 0) });
      // middle lamella: the pectin line this cell shares with its neighbour
      wallPG.add(SEG, 1, (u, v, o) => {
        const th = th0 + u * dth, ri = wallR(th, 1, true), ro = wallR(th, 1, false);
        const r = lerp(ri, ro, 0.5) + (v - 0.5) * 0.012 * A, x = r * Math.cos(th) * C.ex, z = r * Math.sin(th);
        o.set(x, topY(x, z) + 0.003 * A, z);
      }, { flip: true, mi: 3, normal: (u, v, o) => o.copy(planeN) });
    }
    const wallMesh = new THREE.Mesh(wallPG.build(), wallMats);
    cell.add(register(wallMesh, 'wall'));

    /* ---- plasmodesmata: channels straight through the wall ----
       Lined by plasma membrane continuous into the next cell, so a solute
       can cross without ever leaving a cytoplasm. */
    const PD_N = 42, pdSeeds = [];
    for (let i = 0; i < PD_N; i++) pdSeeds.push({ th: (Math.floor(rand() * 6) + 0.15 + rand() * 0.7) * PI / 3, v: 0.12 + rand() * 0.75 });
    const pdMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8), mat({ color: ORG.plasmodesma.outer, roughness: 0.5 }), PD_N);
    cell.add(register(pdMesh, 'plasmodesma'));
    function updatePlasmodesmata() {
      const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new V3(0, 1, 0);
      const a = new V3(), b = new V3(), d = new V3(), sc = new V3();
      for (let i = 0; i < PD_N; i++) {
        const { th, v } = pdSeeds[i];
        const ri = wallR(th, v, true) - 0.02 * A, ro = wallR(th, v, false) + 0.015 * A;
        a.set(ri * Math.cos(th) * C.ex, 0, ri * Math.sin(th)); a.y = lerp(0, topY(a.x, a.z), v);
        b.set(ro * Math.cos(th) * C.ex, 0, ro * Math.sin(th)); b.y = lerp(0, topY(b.x, b.z), v);
        if (a.y > topY(a.x, a.z) - 0.03 * A) { m4.makeScale(0, 0, 0); pdMesh.setMatrixAt(i, m4); continue; }
        d.subVectors(b, a);
        const len = d.length();
        q.setFromUnitVectors(up, d.normalize());
        m4.compose(a.clone().add(b).multiplyScalar(0.5), q, sc.set(0.011 * A, len, 0.011 * A));
        pdMesh.setMatrixAt(i, m4);
      }
      pdMesh.instanceMatrix.needsUpdate = true;
    }

    /* ---- protoplast: membrane sides, and the cytoplasm as the cut face ---- */
    const protoPG = PanelGeometry(THREE);
    /* The membrane is the tissue's green, not the house salmon — see
       palette.js's `plantTissue` for why that exception is made here and
       nowhere else. */
    /* 2 and 3 are the cut lip, painted as a bilayer: a head band at each
       face with the paler, warmer tail core between. The animal cell gets
       the same two bands out of buildShell's vertex colours; this membrane
       is panels, so the bands are their own strips. */
    const protoMats = [
      mat({ color: TIS.leaf.membrane, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      mat({ color: TIS.leaf.cytosol, roughness: 0.4, clearcoat: 0.35 }),
      mat({ color: TIS.leaf.head, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25 }),
      mat({ color: TIS.leaf.tail, roughness: 0.5, clearcoat: 0.4 }),
    ];
    const pTop = (x, z) => topY(x, z) - PROTO_DROP;
    const RIMW = 0.02 * A;
    // How far the cytoplasm is scooped below the cut. Deep enough that the
    // nucleus sits under the rim without its far side pushing through the
    // floor — which is what a shallow bowl does under plasmolysis, when the
    // protoplast narrows and the same depth becomes a much steeper dish.
    const BOWL = 0.52 * A;
    /* The bowl's surface under a point on the cut plane, in cutFrame's own
       coordinates (y = 0 is the plane). An organelle far out is near the rim
       and therefore shallow, which is what keeps it from pushing through the
       bowl wall without the solver having to know about depth at all. */
    function bowlY(x, z) {
      const ux = x / C.ex, uz = z, th = Math.atan2(uz, ux), rad = Math.hypot(ux, uz);
      const rim = protoR(th, 1) - RIMW;
      return -BOWL * Math.cos(Math.asin(clamp(rad / (rim || 1e-4), 0, 1)));
    }
    for (let k = 0; k < 6; k++) {
      const th0 = k * PI / 3, dth = PI / 3;
      protoPG.add(SEG, M, (u, v, o) => { const th = th0 + u * dth, r = protoR(th, v), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th); o.set(x, lerp(0, pTop(x, z), v), z); }, { mi: 0 });
      /* The lip, in three bands across its width: head (outer leaflet),
         tail, head (inner leaflet). a0/a1 are the fractions of RIMW. */
      for (const [a0, a1, mi] of [[0, 0.22, 2], [0.22, 0.78, 3], [0.78, 1, 2]])
        protoPG.add(SEG, 1, (u, v, o) => {
          const th = th0 + u * dth, f = a0 + v * (a1 - a0);
          const r = protoR(th, 1) - RIMW * (1 - f), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th);
          o.set(x, pTop(x, z), z);
        }, { flip: true, mi, normal: (u, v, o) => o.copy(planeN) });
      /* THE CYTOPLASM IS A BOWL, NOT A LID. A flat cut face turns every
         organelle into an object resting on a plate, and since each one
         carries its own local cut, they read as separately hollowed shells
         set down on it rather than as things the same knife went through.
         Scooping the cytoplasm out gives them somewhere to BE — at many
         depths and angles, which is what makes the animal cell read — and
         the reader looks into an open cell instead of down at a section.
         Radius follows sin, depth cos, so the bowl meets the membrane rim
         tangentially and there is no crease where the two join. */
      protoPG.add(SEG, KSEG, (u, v, o) => {
        const th = th0 + u * dth, a = lerp(0.02, PI / 2, v);
        const r = (protoR(th, 1) - RIMW) * Math.sin(a);
        const x = r * Math.cos(th) * C.ex, z = r * Math.sin(th);
        o.set(x, pTop(x, z) - BOWL * Math.cos(a), z);
      }, { flip: true, mi: 1 });
      protoPG.add(SEG, 1, (u, v, o) => { const th = th0 + u * dth, r = protoR(th, 0) * v; o.set(r * Math.cos(th) * C.ex, 0, r * Math.sin(th)); }, { mi: 0, normal: (u, v, o) => o.set(0, -1, 0) });
    }
    const protoMesh = new THREE.Mesh(protoPG.build(), protoMats);
    cell.add(register(protoMesh, 'membrane'));

    /* ---- Hechtian strands ----
       Threads of membrane still stuck to the wall after the protoplast has
       pulled away, anchored at plasmodesmata because that is what holds
       them. They exist only under plasmolysis, so they fade in with t>1 and
       are the visible evidence that the cell did not simply shrink. */
    const HS_N = 14;
    const hsMat = mat({ color: ORG.plasmodesma.hechtian, roughness: 0.5, transparent: true, opacity: 0 });
    const hsGroup = new THREE.Group();
    cell.add(hsGroup);
    const hsItems = [], footGeo = new THREE.SphereGeometry(1, 10, 8);
    function strandGeometry() {
      const R = 6, N = 14, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * (R + 1) * 3), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array((N + 1) * (R + 1) * 3), 3));
      const idx = [];
      for (let j = 0; j < N; j++) for (let i = 0; i < R; i++) { const a = j * (R + 1) + i, b = a + 1, c = a + R + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
      g.setIndex(idx); g.userData = { R, N };
      return g;
    }
    function fillStrand(g, curve, r0, r1) {
      const { R, N } = g.userData, pos = g.attributes.position.array, nor = g.attributes.normal.array;
      const p = new V3(), t = new V3(), n = new V3(), b = new V3(), up = new V3(0, 1, 0);
      let k = 0;
      for (let j = 0; j <= N; j++) {
        const u = j / N;
        curve.getPoint(u, p); curve.getTangent(u, t);
        n.crossVectors(up, t); if (n.lengthSq() < 1e-6) n.set(1, 0, 0);
        n.normalize(); b.crossVectors(t, n);
        const rad = lerp(r0, r1, smooth(u));
        for (let i = 0; i <= R; i++) {
          const ang = i / R * PI * 2, cx = Math.cos(ang), sy = Math.sin(ang);
          pos[k] = p.x + (n.x * cx + b.x * sy) * rad; pos[k + 1] = p.y + (n.y * cx + b.y * sy) * rad; pos[k + 2] = p.z + (n.z * cx + b.z * sy) * rad;
          nor[k] = n.x * cx + b.x * sy; nor[k + 1] = n.y * cx + b.y * sy; nor[k + 2] = n.z * cx + b.z * sy;
          k += 3;
        }
      }
      g.attributes.position.needsUpdate = true; g.attributes.normal.needsUpdate = true;
      g.computeBoundingSphere();
    }
    {
      // anchors clustered on a few faces, as they are in a real plasmolysed cell
      const pool = pdSeeds.filter(sd => sd.v > 0.5 && sd.v < 0.9);
      const faces = [0, 2, 4].map(f => f + Math.floor(rand() * 2));
      const chosen = pool.filter(sd => faces.includes(Math.floor(sd.th / (PI / 3)))).slice(0, HS_N - 3);
      while (chosen.length < HS_N && pool.length) { const c = pool[Math.floor(rand() * pool.length)]; if (!chosen.includes(c)) chosen.push(c); }
      for (const sd of chosen) {
        const mesh = new THREE.Mesh(strandGeometry(), hsMat), foot = new THREE.Mesh(footGeo, hsMat);
        hsGroup.add(mesh, foot);
        hsItems.push({ sd, mesh, foot, w: rr(0.6, 1.5), sag: rr(0.02, 0.07), side: rr(-0.04, 0.04), curve: new THREE.QuadraticBezierCurve3(new V3(), new V3(), new V3()) });
      }
    }
    function updateStrands() {
      const k = clamp(St.t - 1, 0, 1);
      hsMat.opacity = smooth(k);
      hsGroup.visible = k > 0.02;
      if (!hsGroup.visible) return;
      const a = new V3(), b = new V3(), m = new V3(), tang = new V3();
      for (const it of hsItems) {
        const { th, v } = it.sd;
        const rw = wallR(th, v, true) - 0.004 * A, rp = protoR(th, v) - 0.01 * A;
        a.set(rw * Math.cos(th) * C.ex, 0, rw * Math.sin(th)); a.y = lerp(0, topY(a.x, a.z), v);
        b.set(rp * Math.cos(th) * C.ex, 0, rp * Math.sin(th)); b.y = lerp(0, pTop(b.x, b.z), v);
        const len = a.distanceTo(b);
        if (len < 0.02 * A) { it.mesh.visible = it.foot.visible = false; continue; }
        it.mesh.visible = it.foot.visible = true;
        m.addVectors(a, b).multiplyScalar(0.5);
        tang.set(-Math.sin(th), 0, Math.cos(th));
        m.y -= it.sag * len * 3;
        m.addScaledVector(tang, it.side * len);
        it.curve.v0.copy(a); it.curve.v1.copy(m); it.curve.v2.copy(b);
        fillStrand(it.mesh.geometry, it.curve, 0.0095 * A * it.w, 0.0035 * A * it.w);
        it.foot.position.copy(a);
        it.foot.scale.setScalar(0.016 * A * it.w);
      }
    }

    /* ---- free ribosomes ----
       ONE GEOMETRY AND ONE MATERIAL, shared with the ER's studs below, so
       the two read as the same particle and the ER reads as rough. Unlike
       the animal cell they cannot be one instanced mesh: the studs ride the
       ER, which rides the nucleus, while these sit in a cytosol that
       reshapes with every change of state. Two meshes, one particle.

       EXAGGERATED, and the SCALE block at the foot of this file declares by
       how much. A ribosome is ~25 nm against a nucleus at several microns;
       drawn true to that it is sub-pixel and the cytoplasm looks empty. */
    const RIBO_N = 1500;
    const riboGeo = new THREE.SphereGeometry(0.06 * A / 10, 6, 5);
    const riboMat = new THREE.MeshStandardMaterial({ color: col(ORG.er.ribosome), roughness: 0.6 });
    const riboSeeds = [];
    for (let i = 0; i < RIBO_N; i++)
      riboSeeds.push({ th: rand() * 2 * PI, u: Math.sqrt(rand()), v: rand(), s: rr(0.6, 1.4) });
    const riboMesh = new THREE.InstancedMesh(riboGeo, riboMat, RIBO_N);

    /* Seeds are stored as a bearing and two fractions, not as points, so the
       speckle follows the protoplast when it shrinks and wrinkles instead of
       being left behind outside it. Recomputed only when the shape changes. */
    function placeRibosomes() {
      const m = new THREE.Matrix4(), items = layer ? layer.userData.items : [];
      let n = 0;
      for (const r of riboSeeds) {
        // rim once, and the bowl depth straight off `u` — bowlY would work
        // back from (x,z) to this same fraction through an atan2, a hypot
        // and a second protoR, and this runs 1500 times.
        /* The cytosol streams too, and it is the cytosol that does the
           streaming — the organelles are passengers. So the seeds carry the
           same angle the organelles do. Rotating the whole mesh instead
           would be one transform and free, but the field is elongated by
           C.ex in the root cell and spinning an ellipse sweeps it out
           through the wall. */
        const th = r.th + spin;
        const rim = protoR(th, 1) - RIMW, rad = rim * r.u;
        const x = rad * Math.cos(th) * C.ex, z = rad * Math.sin(th);
        /* A ribosome is in the CYTOSOL, so every organelle leaves a hole.
           Keeping only the free space is also what stops the speckle reading
           as spots ON the organelles: against this cell's pale cytoplasm the
           dots carry far more contrast than they do against the animal
           cell's dark red, so where they are not is as visible as where they
           are. Many seeds are rejected, which is why there are more of them
           than instances drawn. */
        let blocked = false;
        for (const b of items) {
          const dx = x - b.x, dz = z - b.z, d = Math.hypot(dx, dz) || 1e-4;
          if (d < radiusToward(b, dx / d, dz / d) * 0.95) { blocked = true; break; }
        }
        if (blocked) continue;
        const y = -BOWL * Math.sqrt(1 - r.u * r.u) * (0.08 + 0.92 * r.v);
        m.makeScale(r.s, r.s, r.s);
        m.setPosition(x, y, z);
        riboMesh.setMatrixAt(n++, m);
      }
      riboMesh.count = n;
      riboMesh.instanceMatrix.needsUpdate = true;
    }

    /* The cut frame: its local XZ plane IS the protoplast's cut face and its
       local +Y the plane normal, so an organelle standing on the cut sits at
       y=0 here and needs no per-organelle tilt. */
    const cutFrame = new THREE.Group();
    cutFrame.position.set(0, CUT.cb - PROTO_DROP, 0);
    cutFrame.quaternion.setFromUnitVectors(new V3(0, 1, 0), planeN);
    cell.add(cutFrame);
    cutFrame.add(register(riboMesh, 'ribosome'));

    /* ---- the organelle layer ----
       Footprint radii on the cut plane, in scene units. These are what the
       solver pushes; they are deliberately a little larger than the drawn
       organelle so nothing ends up touching. */
    /* Footprint radii on the cut plane, in scene units — what the solver
       pushes. A LITTLE larger than the drawn organelle so nothing ends up
       touching, and no more than that: these are circles packed into a
       hexagon, so their areas have to fit inside it with room to move. Pad
       them generously and the sum exceeds the cell, the solve cannot
       succeed, and organelles settle overlapping no matter how stiff the
       repulsion is. Check the sum against 2*sqrt(3)*A^2 before adding one. */
    const DETAIL = O.detail === undefined ? 0.5 : O.detail;
    /* layoutStep writes scale on the item's own group every frame, so a
       build-time size has to sit one level down. */
    const wrap = (g, s) => { g.scale.setScalar(s); const w = new THREE.Group(); w.add(g); return w; };
    const FOOT = { nucleus: 3.4, chloroplast: 2.6, mitochondrion: 1.8, dictyosome: 2.0, amyloplast: 2.4, amyloplast2: 3.0, vesicle: 0.7, vacuole: 5.6 };
    const BUILD = {
      nucleus: s => K.nucleus({ R: 3.0 * s, thickness: 0.2, chromatin: 3, pores: 55 }),
      /* ONE SIZE, VARIED BY TRANSFORM. Passing the per-instance size into
         the builder gave every chloroplast its own geometry, and five of
         them was most of a tissue switch. They do not need to differ:
         built once and scaled in a wrapper, the cache hands out the same
         shape and the reader cannot tell.
         `detail` at half, because a leaf cell holds five of these and the
         reader is looking at a whole cell. A bench that zooms one builds
         it at 1. */
      chloroplast: s => wrap(K.chloroplast({ a: 2.3, b: 1.05, c: 1.5, grana: 6, detail: DETAIL }), s),
      /* DRAWN ABOUT TWICE ITS SIZE relative to the chloroplast, and that is
         on purpose. A chloroplast is around 5um long and a mitochondrion 1
         to 2, so the honest length ratio is near 2.5 against the 1.5 here
         — but at 2.5 the mitochondria are too small in a whole-cell view to
         make out as anything, and an illustration that cannot be read has
         not gained accuracy. The factor is declared in SCALE at the foot of
         this file rather than left for someone to measure off the picture. */
      mitochondrion: s => wrap(K.mitochondrion({ r: 0.55, L: 0.95 }), s),
      /* The kit stacks a Golgi's cisternae along +y. On the cut plane +y
         points at the reader, so an unrotated stack is seen end-on and reads
         as a lump. Tip it onto its side inside a wrapper, so the layer's own
         rotation.y still spins it in the plane of the cut. */
      /* A DICTYOSOME is one Golgi stack, and a plant cell has many of them
         scattered through the cytoplasm where an animal cell has a single
         ribbon beside the nucleus. Same organelle, same builder, same
         colour — only the number and the placement differ, which is exactly
         why that difference is the thing you notice. Registered as `golgi`,
         because that is what it is; `dictyosome` is the word for one of
         them, not for a different organelle.
         Tipped most of the way onto its edge, not all of it: flat on the cut
         plane only the top cisterna shows, and fully on edge the stack hides
         behind its own outermost disc. */
      dictyosome: s => {
        const g = K.golgi({ cisternae: 5, vesicles: 4, spacing: 0.46 });
        g.rotation.set(0, 0, -1.15);
        g.position.y = 0.4 * s;
        const w = new THREE.Group();
        w.add(g);
        w.scale.setScalar(0.55 * s);
        return w;
      },
      amyloplast: s => wrap(K.amyloplast({ a: 2.0, b: 1.35, c: 1.55, grains: 1, detail: DETAIL }), s),
      amyloplast2: s => wrap(K.amyloplast({ a: 2.6, b: 1.35, c: 1.55, grains: 2, detail: DETAIL }), s),
      vesicle: s => {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.42 * s, 20, 14), mat({ color: ORG.golgi.vesicle, roughness: 0.35, clearcoat: 0.7 }));
        return new THREE.Group().add(m);
      },
    };

    // What a built type is CALLED to the reader, where the two differ.
    const NAME = { amyloplast2: 'amyloplast', dictyosome: 'golgi' };

    let layer = null, parts = null;
    function buildLayer(T) {
      const L = new THREE.Group();
      L.userData.items = [];
      L.userData.owned = owned = [];
      const add = (g, type, x, z, rot, foot, weight, shape) => {
        L.add(g);
        /* A small tilt off the cut plane. Everything lying perfectly flat is
           seen straight down its own opening, which for a cut organelle is
           the one angle that shows least of it. The nucleus and vacuole are
           big enough to read flat and stay level. */
        const tilt = (type === 'nucleus' || type === 'vacuole') ? 0 : rr(0.18, 0.42);
        g.rotation.set(tilt * Math.cos(rot * 2.3), rot, tilt * Math.sin(rot * 2.3));
        /* Rest it on the floor rather than guessing a lift per type: measure
           the group once, tilt and all, and remember how far its lowest
           point is below its origin. Scale is applied later, and the lift
           scales with it. */
        g.updateMatrixWorld(true);
        const lift = -new THREE.Box3().setFromObject(g).min.y;
        L.userData.items.push({ g, type, tx: x * A, tz: z * A, x: x * A, z: z * A, vx: 0, vz: 0, rot, tilt, lift,
          r: foot, rx: (shape && shape.rx) || 1, rz: (shape && shape.rz) || 1, w: weight, seed: L.userData.items.length });
        return g;
      };
      // the nucleus is pinned: everything else arranges around it
      const nuc = add(register(BUILD.nucleus(T.nucleus.s), 'nucleus'), 'nucleus', T.nucleus.x, T.nucleus.z, 0, FOOT.nucleus * T.nucleus.s, 0);
      /* HELD, like the nucleus, and it has to be. It used to give a little
         (weight 0.35), which read well while everything only jostled — but
         streaming pushes one way, and a spring cannot hold against a
         sustained push: the vacuole drifted to the far wall and jammed
         there. It is the thing the cytoplasm streams around, so it does not
         get carried by it. Being immovable also strengthens the squeeze,
         since a pinned body pushes 1.6x in `solve`. */
      const vac = add(register(K.vacuole({ R: 4.2 * T.vacuole.s }), 'vacuole'), 'vacuole', T.vacuole.x, T.vacuole.z, 0.35, FOOT.vacuole * T.vacuole.s, 0, { rx: 1.25, rz: 0.98 });
      const er = K.roughER({
        Rn: 3.0 * T.nucleus.s, center: new V3(0, 0, 0), y0: 0.6,
        arcs: [{ a0: -0.3 * PI, a1: 0.62 * PI, count: 3 }, { a0: 0.86 * PI, a1: 1.3 * PI, count: 2 }],
      });
      /* The ER rides the nucleus: it wraps that envelope, so it is parented
         to it rather than solved for separately — which means the solver
         cannot see it, and its arcs reach well past the nucleus's own
         footprint. So AIM ITS GAP AT THE VACUOLE. The arcs leave a wide
         opening centred on 1.5*PI; a group rotation of theta maps an angle
         a to a - theta, so this puts that opening on the bearing from the
         nucleus to the vacuole, which is the only direction with something
         big enough to foul. */
      const toVac = Math.atan2(T.vacuole.z - T.nucleus.z, T.vacuole.x - T.nucleus.x);
      er.group.rotation.y = 1.5 * PI - toVac;
      // the studs, in the ER's own space, sharing the free speckle's particle
      const studs = new THREE.InstancedMesh(riboGeo, riboMat, er.ribosomes.length);
      const m4 = new THREE.Matrix4();
      er.ribosomes.forEach((q, i) => { m4.makeScale(1.15, 1.15, 1.15); m4.setPosition(q.x, q.y, q.z); studs.setMatrixAt(i, m4); });
      er.group.add(studs);
      nuc.add(register(er.group, 'er'));
      for (const [type, x, z, rot, s] of T.organelles) {
        const g = register(BUILD[type](s), NAME[type] || type);
        add(g, type, x, z, rot, FOOT[type] * s, 1);
      }
      L.userData.vac = vac;
      owned = null;
      return L;
    }

    /* One solve on the cut plane: a soft spring to the seeded target, hard
       repulsion between footprints, and a wall that pushes back. The vacuole
       has a low weight rather than none, so it gives a little and shoves a
       lot — which is the asymmetry that makes the squeeze read. */
    /* An item's footprint radius in a given direction. Most organelles are
       round enough on the cut plane for one number, but the vacuole is a
       1.25:0.98 ellipse and a single radius either over-claims across it or
       lets things into it along it — which is the whole cell's worst overlap
       either way, because it is the biggest thing in the cell. Exact ellipse
       radius, in the item's own frame. */
    function radiusToward(it, dx, dz) {
      if (!it.rz || it.rz === it.rx) return it.r;
      const c = Math.cos(-it.rot), sn = Math.sin(-it.rot);
      const ux = (dx * c - dz * sn) / it.rx, uz = (dx * sn + dz * c) / it.rz;
      return (it.r / it.rx) / Math.hypot(ux, uz);
    }

    function solve(items, dt) {
      /* CONSTANTS ARE SCALE-FREE, so none of them is divided by A. Every
         force here is a stiffness times a distance — the spring times a
         displacement, the repulsion times an overlap — and all three
         distances scale with the cell. Dividing the repulsion by A to
         "convert it to world units" makes it lose to the spring by a factor
         of A, and organelles settle overlapping instead of touching. */
      const a = (C.A - 0.04 * A) * P.shrink, KS = 14, KR = 260, KB = 400, DAMP = 6;
      for (const it of items) {
        if (it.w === 0) { it.x = it.tx; it.z = it.tz; it.vx = it.vz = 0; continue; }
        it.fx = (it.tx - it.x) * KS; it.fz = (it.tz - it.z) * KS;
      }
      for (const A1 of items) {
        if (A1.w === 0) continue;
        for (const B of items) {
          if (A1 === B) continue;
          const dx = A1.x - B.x, dz = A1.z - B.z, d = Math.hypot(dx, dz) || 1e-4;
          const ov = radiusToward(A1, dx / d, dz / d) + radiusToward(B, -dx / d, -dz / d) + 0.01 - d;
          if (ov <= 0) continue;
          const f = KR * ov * (B.w === 0 ? 1.6 : 1);
          A1.fx += dx / d * f; A1.fz += dz / d * f;
        }
        const ux = A1.x / C.ex, uz = A1.z, th = Math.atan2(uz, ux), rad = Math.hypot(ux, uz) || 1e-4;
        const lim = lerp(hexR(th, a), a * 1.02, P.round) - radiusToward(A1, ux / rad, uz / rad);
        if (rad > lim) { const f = (rad - lim) * KB; A1.fx -= ux / rad * f; A1.fz -= uz / rad * f; }
      }
      for (const it of items) {
        if (it.w === 0) continue;
        it.vx = (it.vx + it.fx * it.w * dt) * Math.max(0, 1 - DAMP * dt);
        it.vz = (it.vz + it.fz * it.w * dt) * Math.max(0, 1 - DAMP * dt);
        it.x += it.vx * dt; it.z += it.vz * dt;
        // hard wall: project back inside and kill the outward velocity, or a
        // fast squeeze pushes an organelle through the membrane for a frame
        const ux = it.x / C.ex, uz = it.z, th = Math.atan2(uz, ux), rad = Math.hypot(ux, uz) || 1e-4;
        const lim = lerp(hexR(th, a), a * 1.02, P.round) - radiusToward(it, ux / rad, uz / rad);
        if (rad > lim) {
          const k = lim / rad;
          it.x = ux * k * C.ex; it.z = uz * k;
          const vn = (it.vx * ux + it.vz * uz) / rad;
          if (vn > 0) { it.vx -= vn * ux / rad; it.vz -= vn * uz / rad; }
        }
      }
    }

    function layoutStep(L, grow, dt, time) {
      const items = L.userData.items;
      for (const it of items) {
        const held = it.type === 'vacuole' || it.type === 'nucleus';
        /* CYTOPLASMIC STREAMING. The seed target itself orbits the cell, so
           the spring, the repulsion and the wall all keep working and the
           whole ensemble circulates rather than each organelle wandering on
           its own. That is what cyclosis looks like down a microscope, and
           it is the reason a leaf cell's chloroplasts are never twice in the
           same place. The vacuole and the nucleus are held: the nucleus is
           tethered to the cortex and the vacuole is what everything else is
           streaming around. */
        if (!held) it.seedA += STREAM * P.stream * stream * dt;
        /* The held pair still DRIFT, just less, and they do not orbit. A
           nucleus is slung in a cytoplasmic strand rather than bolted to
           anything: it is not carried round with the flow, but a nucleus
           pinned to a fixed point reads as glued while everything streams
           past it. The vacuole is the same case and even less mobile. */
        const ph = it.seed * 7.1;
        const dr = held ? (it.type === 'nucleus' ? 0.009 : 0.005) * A * P.stream : 0.025 * A;
        const base = it.type === 'vacuole' ? P.vac : P.org;
        const R0 = it.seedR * P.shrink;
        it.tx = Math.cos(it.seedA) * R0 * C.ex + dr * Math.sin(time * 0.23 + ph);
        it.tz = Math.sin(it.seedA) * R0 + dr * Math.cos(time * 0.19 + ph * 1.3);
        it.r = it.foot * base;
      }
      const sub = 3, h = Math.min(dt, 0.05) / sub;
      for (let k = 0; k < sub; k++) solve(items, h);
      for (const it of items) {
        const base = it.type === 'vacuole' ? P.vac : P.org, s = base * grow;
        /* SIT IT IN THE BOWL. Both surfaces curve, so neither the floor at
           the organelle's centre nor the highest floor under its footprint
           is right on its own: the first lets a wide organelle push its far
           side through the cytoplasm, the second lifts the whole thing until
           it floats, because it demands full clearance at the rim where the
           organelle has already curved away to nothing.
           So compare the two shapes. Treat the underside as a dome of height
           `lift` over the footprint, and require the centre to clear the
           floor by however much of that dome is left at each sample. At the
           middle that is the full lift; at the rim it is zero. */
        const R = it.r * s, H = it.lift * s;
        let y = bowlY(it.x, it.z) + H;
        for (const f of [0.6, 1]) {
          const clear = H * Math.sqrt(Math.max(0, 1 - f * f));
          for (let k = 0; k < 6; k++) {
            const ang = k * PI / 3 + f;
            y = Math.max(y, bowlY(it.x + Math.cos(ang) * R * f, it.z + Math.sin(ang) * R * f) + clear);
          }
        }
        it.g.position.set(it.x, y, it.z);
        it.g.scale.setScalar(s);
        if (it.type === 'nucleus') {
          // the ER is parented to it, so this is what makes the ER sway
          const k = P.stream;
          it.g.rotation.set(0.03 * k * Math.sin(time * 0.13 + it.seed),
                            it.rot + 0.05 * k * Math.sin(time * 0.09 + 1.4),
                            0.03 * k * Math.cos(time * 0.11 + it.seed));
        } else if (it.type !== 'vacuole') {
          // carried round by the flow, so it keeps its bearing to the stream
          const base = it.rot + (it.seedA - it.seedA0);
          const y = base + (it.vx * Math.cos(base) - it.vz * Math.sin(base)) * 0.4 / A
                    + 0.04 * Math.sin(time * 0.3 + it.seed);
          it.g.rotation.set(it.tilt * Math.cos(y * 2.3), y, it.tilt * Math.sin(y * 2.3));
        }
      }
    }

    /* ---- tissue switching ---- */
    let tissue = null, dying = [], born = 0, tint = null;
    // 0 stops the streaming, 1 is life speed; a page may want it slower to talk over
    let stream = O.stream === undefined ? 1 : O.stream;
    function applyTint() {
      for (let i = 0; i < tint.m.length; i++)
        if (tint.m[i]) tint.m[i].color.copy(tint.from[i]).lerp(tint.to[i], tint.k);
    }
    function setTissue(name, instant) {
      const T = TISSUES[name];
      if (!T) return;
      tissue = name;
      C.ex = T.ex; C.wall = T.wall * A;
      const P4 = TIS[name];
      const want = [col(P4.wall), col(P4.wallRim).multiplyScalar(0.95), col(P4.wallRim),
                    col(P4.membrane), col(P4.cytosol), col(P4.head), col(P4.tail)];
      const have = [wallMats[0], wallMats[1], wallMats[2], protoMats[0], protoMats[1], protoMats[2], protoMats[3]];
      tint = { k: instant ? 1 : 0, from: have.map(m => m && m.color.clone()), to: want, m: have };
      if (instant) applyTint();
      if (layer) { layer.userData.t0 = 0; dying.push(layer); }
      layer = buildLayer(T);
      for (const it of layer.userData.items) {
        it.seedR = Math.hypot(it.tx, it.tz);
        it.seedA = Math.atan2(it.tz, it.tx);
        it.seedA0 = it.seedA;
        it.foot = it.r;
      }
      cutFrame.add(layer);
      // A rebuilt layer arrives visible whatever the page had hidden.
      if (parts) parts.reapply();
      born = 0;
      if (instant) born = 1e9;
      dirty = true;
    }

    /* ---- hover and pick ---- */
    const raycaster = new THREE.Raycaster();
    const rootOf = o => { while (o && !o.userData.organelle) o = o.parent; return o; };
    let hovered = null;
    const setHighlight = (org, on) => org.traverse(o => {
      if (!o.isMesh || !o.material || !o.material.emissive) return;
      const m = o.material;
      if (!m.userData.baseEmissive) { m.userData.baseEmissive = m.emissive.clone(); m.userData.baseIntensity = m.emissiveIntensity; }
      if (on) { m.emissive.set(0xffffff); m.emissiveIntensity = 0.13; }
      else { m.emissive.copy(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; }
    });
    function pick(ndc) {
      if (!ndc) return null;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(organelles, true);
      return hits.length ? rootOf(hits[0].object) : null;
    }
    function hover(ndc) {
      const r = pick(ndc);
      if (r === hovered) return hovered;
      if (hovered) setHighlight(hovered, false);
      hovered = r;
      if (hovered) setHighlight(hovered, true);
      return hovered;
    }

    /* ---- the frame ----
       The wall and protoplast are rebuilt only when the state axis or the
       tissue actually moved; the organelle solve runs every frame, because
       the drift never settles. */
    let dirty = true, clock = 0, lastRibo = -1, spin = 0;
    function step(dt) {
      clock += dt;
      P = stateParams(St.t);
      spin += STREAM * P.stream * stream * dt;
      if (dirty) { wallPG.update(); protoPG.update(); updatePlasmodesmata(); updateStrands(); dirty = false; }
      /* The speckle is 1500 seeds tested against every organelle, so it is
         the most expensive thing here and the least urgent: dots settling a
         tenth of a second behind are invisible, where a wall that lags is
         not. So it runs on its own clock rather than with the shape. */
      if (clock - lastRibo > 0.12) { placeRibosomes(); lastRibo = clock; }
      if (tint && tint.k < 1) { tint.k = Math.min(tint.k + dt / 0.9, 1); applyTint(); }
      born = Math.min(born + dt, 1e9);
      const grow = easeInOut(clamp(born / 0.7, 0, 1));
      if (layer) layoutStep(layer, grow, dt, clock);
      for (let i = dying.length - 1; i >= 0; i--) {
        const L = dying[i];
        L.userData.t0 += dt;
        const k = clamp(L.userData.t0 / 0.45, 0, 1);
        layoutStep(L, 1 - easeInOut(k), dt, clock);
        if (k >= 1) { cutFrame.remove(L); retire(L); dying.splice(i, 1); }
      }
    }
    function setT(t) { const v = clamp(t, 0, 2); if (v !== St.t) { St.t = v; dirty = true; } }
    function setStream(v) { stream = clamp(v, 0, 3); }
    function bounds(org) {
      root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(org).getBoundingSphere(new THREE.Sphere());
    }

    /* ---- what a page can point at, hide, and read ----
       LIBRARY is the component's own teaching text: one label and a
       two-sentence card per part, so a generated page answers "what is that?"
       with a callout on the organelle. Real sizes go in as PROSE — the render
       is prop tier and nothing may print a length off it.

       WHAT IS ON STAGE DEPENDS ON THE TISSUE. A root cell has no chloroplast
       and a leaf cell no amyloplast, so an anchor returns null rather than a
       point, and layers() lists only what this tissue actually built. */
    const LIBRARY = {
      wall:         { text: 'cell wall', offset: [46, -26], card: 'Cellulose laid down outside the membrane, shared with the neighbouring cell along a pectin seam. It is what stops a turgid cell bursting, and what gives a plant its shape without a skeleton.' },
      membrane:     { text: 'plasma membrane', offset: [44, -24], card: 'The living boundary, just inside the wall: a bilayer whose two leaflets you can see on the cut edge. The wall is a sieve that lets almost anything through; this is the layer that actually chooses.' },
      plasmodesma:  { text: 'plasmodesma', offset: [48, 24], card: 'A channel through the wall lined with membrane continuous into the next cell, so cytoplasm is shared. Plant cells are wired together in a way animal cells are not.' },
      nucleus:      { text: 'nucleus', offset: [-46, -28], card: 'The DNA, behind a double envelope pierced by pores, with the nucleolus bright inside it. Pushed to one side here, because the vacuole has taken the middle.' },
      vacuole:      { text: 'central vacuole', offset: [40, -30], card: 'One huge bag of water and dissolved salts, often most of the cell\u2019s volume. Filling it presses the cytoplasm against the wall, and that pressure is what holds a leaf up.' },
      chloroplast:  { text: 'chloroplast', offset: [-48, 26], card: 'Stacks of thylakoid membrane in a green soup, where light is turned into sugar. Two membranes and its own DNA, because it was once a free-living cyanobacterium.' },
      amyloplast:   { text: 'amyloplast', offset: [-48, 26], card: 'The same plastid with starch grains in it instead of thylakoids, which is how a root or a tuber stores the sugar a leaf made. Leave a potato on a windowsill and these turn green.' },
      mitochondrion:{ text: 'mitochondrion', offset: [44, -22], card: 'Two membranes, the inner folded into cristae, spending sugar to make ATP. A plant cell has them too: photosynthesis does not replace respiration, it feeds it.' },
      golgi:        { text: 'dictyosome', offset: [-46, 24], card: 'One Golgi stack. A plant cell keeps dozens scattered through the cytoplasm rather than one ribbon by the nucleus, because most of what they package is wall material heading outward.' },
      er:           { text: 'rough ER', offset: [-48, -22], card: 'Membrane sheets continuous with the nuclear envelope, studded with ribosomes that push their proteins straight into it.' },
      ribosome:     { text: 'ribosomes', offset: [46, 26], card: 'The dots through the cytoplasm, each reading mRNA and building the protein it codes for. They are also what makes the ER look rough.' },
      vesicle:      { text: 'vesicles', offset: [46, 22], card: 'Membrane bubbles carrying cargo between the Golgi, the membrane and the vacuole. Much of the traffic in a plant cell is wall material on its way out.' },
    };
    const hex = v => '#' + (typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16)).toString(16).padStart(6, '0');
    /* The legend reads the LIVE tissue colours, not leaf's: the wall and the
       membrane are tinted per tissue, so a fixed legend would name a green
       the cactus cell does not have. */
    const palette = () => {
      const P4 = TIS[tissue];
      return [['cell wall', P4.wall], ['plasma membrane', P4.membrane], ['cytoplasm', P4.cytosol],
        ['nucleus', ORG.nucleus.outer], ['vacuole', ORG.vacuole.outer], ['chloroplast', ORG.chloroplast.outer],
        ['amyloplast', ORG.amyloplast.starch], ['mitochondrion', ORG.mitochondrion.outer], ['Golgi', ORG.golgi.outer]]
        .map(([name, c]) => ({ name, color: hex(c) }));
    };

    parts = K.partsOf(organelles, LIBRARY);
    const anchors = Object.assign({}, parts.anchors);
    /* Two the generic centroid gets wrong. The wall is a ring, so its centre
       is the middle of the cell; the ribosomes are one instanced mesh over
       the whole cytoplasm, same problem. Both are pointed at on the +x side,
       where there is room for a label. */
    const _a = new V3();
    anchors.wall = () => (wallMesh.visible ? cell.localToWorld(_a.set(A * 0.98 * C.ex, topY(A * 0.98 * C.ex, 0) * 0.5, 0)) : null);
    /* The membrane is a bowl, so its centre is the cytoplasm. Point at its
       cut rim, a third of the way round from the wall's own anchor: both on
       the same bearing and a page that points at the two together stacks one
       label on the other. */
    anchors.membrane = () => {
      if (!protoMesh.visible) return null;
      const th = 1.25, r = protoR(th, 1), x = r * Math.cos(th) * C.ex, z = r * Math.sin(th);
      return cell.localToWorld(_a.set(x, pTop(x, z), z));
    };
    anchors.ribosome = () => (riboMesh.visible ? cutFrame.localToWorld(_a.set(A * 0.30 * C.ex, 0.2, A * 0.42)) : null);
    /* ONE plasmodesma, not the centroid of 42. The instanced mesh spans the
       whole ring, so its bounding sphere is the cell; this walks the seeds
       for the one nearest the front-left bearing that was not skipped for
       poking through the cut, and returns its midpoint in the wall. */
    anchors.plasmodesma = () => {
      if (!pdMesh.visible) return null;
      let best = null, bestD = Infinity;
      for (const { th, v } of pdSeeds) {
        const ri = wallR(th, v, true) - 0.02 * A, ro = wallR(th, v, false) + 0.015 * A;
        const r = (ri + ro) / 2, x = r * Math.cos(th) * C.ex, z = r * Math.sin(th);
        const y = lerp(0, topY(x, z), v);
        if (y > topY(x, z) - 0.03 * A) continue;
        const d = Math.abs(Math.atan2(Math.sin(th - 1.3), Math.cos(th - 1.3)));
        if (d < bestD) { bestD = d; best = [x, y, z]; }
      }
      return best ? cell.localToWorld(_a.set(best[0], best[1], best[2])) : null;
    };
    /* The cut plane faces the reader, so a note fades as it is turned away.
       One facing for every part: they are all on or under that plane. */
    const _f = new V3(), _q = new THREE.Quaternion();
    const faceUp = () => _f.set(0, 1, 0).applyQuaternion(cell.getWorldQuaternion(_q));
    const facings = {};
    for (const n of Object.keys(LIBRARY)) facings[n] = faceUp;

    setTissue(O.tissue, true);
    setT(O.t);
    return {
      group: cell, cutFrame, organelles, step, pick, hover, bounds, setTissue, setT, setStream,
      anchors, facings, library: LIBRARY, palette, layers: parts.layers,
      show: (n, v) => parts.show(n, v), reapplyShown: parts.reapply,
      counts: () => Object.fromEntries(parts.order().map(n => [n, parts.of(n).length])),
      get stream() { return stream; },
      get t() { return St.t; }, get tissue() { return tissue; }, get hovered() { return hovered; },
    };
  }

  /* ---- one box -------------------------------------------------------- */

  const HOME = { pos: [-14.2, 52, 39.1], target: [0, 7.5, 0] };

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('cell/plantcell.js: load kit/card-stage.js first');
    const THREE = global.THREE, V3 = THREE.Vector3;
    const orbitOf = (pos, target) => {
      const v = new V3().fromArray(pos).sub(new V3().fromArray(target)), r = v.length();
      return { r, phi: Math.acos(clamp(v.y / r, -1, 1)), theta: Math.atan2(v.x, v.z) };
    };
    const home = { pos: params.pos || HOME.pos, target: params.target || HOME.target };
    /* NO IDLE TURNTABLE. The cell has its own motion now — the cytoplasm
       streams — and a scene that also rotates on its own fights it: the
       reader cannot tell which of the two they are watching, and a slow
       drift they did not ask for makes a still organelle look like it is
       moving. The camera moves when the reader moves it, or on a flight. */
    let sim = null, nb = null, lastHover = null;
    const listeners = {};
    const emit = (name, v) => { CardStage.fire(listeners[name], [v], 'PlantCell ' + name); };
    const box = global.CardStage.create({
      mount: el,
      cam: orbitOf(home.pos, home.target),
      stage: Object.assign({ phiMin: 0.15, phiMax: 1.5, rMin: 8, rMax: 90 }, params.stage || {}),
      step: dt => {
        if (!sim) return;
        flyStep(dt); tweenStep(dt); sim.step(dt); sim.hover(ndc);
        const h = sim.hovered && sim.hovered.userData.organelle || null;
        if (h !== lastHover) { lastHover = h; emit('hover', h); }
        emit('frame', stateOf(), dt);
      },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    box.cam.target.fromArray(home.target);
    // Same soft, shadowless rig as the animal cell, so the two read as lit by
    // one studio. See cell/animalcell.js for why there is no shadow map.
    box.renderer.outputColorSpace = THREE.SRGBColorSpace;
    for (const o of box.camera.children) if (o.isLight) o.intensity *= 0.25;
    for (const o of box.scene.children) if (o.isAmbientLight) o.intensity = Math.PI * 0.22;
    box.scene.add(new THREE.HemisphereLight(0xf4f8ff,0xe8cbb8, Math.PI * 0.55));
    const key = new THREE.DirectionalLight(0xfff4ea, Math.PI * 0.55);
    key.position.set(14, 26, 16);
    box.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xdbe6ff, Math.PI * 0.25);
    fill.position.set(-14, 8, -10);
    box.scene.add(fill, fill.target);
    const rim = new THREE.DirectionalLight(0xffffff, Math.PI * 0.2);
    rim.position.set(-2, -6, -18);
    box.scene.add(rim, rim.target);
    /* AN ENVIRONMENT, FOR THE VACUOLE. Four analytic lights give a clearcoat
       surface highlights but nothing to reflect, so the vacuole comes out
       milky instead of watery — glass reads as glass by what is in it. This
       is a gradient standing in for the room: pale sky above, a dark ground
       below. THE LOWER HALF HAS TO BE DARK. A curved translucent surface
       reflects mostly downward, so a bright floor comes back as white across
       the whole vacuole and the water loses its colour — which is the one
       thing it is there to have. Cheap: one 256x128 canvas, prefiltered once
       at mount and thrown away. */
    {
      const c = document.createElement('canvas');
      c.width = 256; c.height = 128;
      const g2 = c.getContext('2d'), grad = g2.createLinearGradient(0, 0, 0, 128);
      grad.addColorStop(0, '#eef4fb'); grad.addColorStop(0.45, '#b9c8d6');
      grad.addColorStop(0.55, '#8d9a92'); grad.addColorStop(1, '#4f6b5c');
      g2.fillStyle = grad; g2.fillRect(0, 0, 256, 128);
      // one soft window, so a curved surface gets a highlight that moves
      const hl = g2.createRadialGradient(70, 34, 0, 70, 34, 46);
      hl.addColorStop(0, 'rgba(255,255,255,.6)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g2.fillStyle = hl; g2.fillRect(24, -12, 92, 92);
      const tex = new THREE.CanvasTexture(c);
      tex.mapping = THREE.EquirectangularReflectionMapping;
      tex.colorSpace = THREE.SRGBColorSpace;
      const pm = new THREE.PMREMGenerator(box.renderer);
      box.scene.environment = pm.fromEquirectangular(tex).texture;
      pm.dispose(); tex.dispose();
    }

    /* camera flights, in Stage's turntable terms (as animalcell.js) */
    const fly = { active: false, t: 0, dur: 1.4, a: null, b: null, t0: new V3(), t1: new V3() };
    function flyTo(pos, target, dur = 1.4) {
      const c = box.cam;
      fly.a = { theta: c.theta, phi: c.phi, r: c.r }; fly.t0.copy(c.target);
      fly.b = orbitOf(pos, target); fly.t1.fromArray(target);
      let d = fly.b.theta - fly.a.theta;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      fly.b.theta = fly.a.theta + d;
      fly.t = 0; fly.dur = dur; fly.active = true;
    }
    function flyStep(dt) {
      if (!fly.active) return;
      fly.t += dt / fly.dur;
      const k = easeInOut(Math.min(fly.t, 1)), c = box.cam;
      c.theta = lerp(fly.a.theta, fly.b.theta, k);
      c.phi = lerp(fly.a.phi, fly.b.phi, k);
      c.r = lerp(fly.a.r, fly.b.r, k);
      c.target.lerpVectors(fly.t0, fly.t1, k);
      if (fly.t >= 1) fly.active = false;
    }
    const goHome = () => flyTo(home.pos, home.target);
    /* HOW CLOSE, for the parts whose mesh is not one object. A bounding
       sphere is the right size for a nucleus and useless for the wall, the
       membrane, the plasmodesmata or the ribosome sheet: each wraps the
       whole cell, so 2.6 radii away is further out than home. These say how
       big ONE of the thing is, and the anchor says where to look. */
    const ZOOM_R = { wall: 2.4, membrane: 2.0, plasmodesma: 1.8, ribosome: 1.2 };
    function focusOn(org, name) {
      const n = name || (org && org.userData.organelle);
      const at = ZOOM_R[n] && sim.anchors[n] && sim.anchors[n]();
      const centre = at ? at.clone() : sim.bounds(org).center;
      const radius = ZOOM_R[n] || sim.bounds(org).radius;
      const dist = Math.max(radius * 2.6, 5);
      const dir = box.camera.position.clone().sub(centre).normalize();
      flyTo(centre.clone().addScaledVector(dir, dist).toArray(), centre.toArray());
    }

    /* the state axis, glided: set({t}) animates, set({t, now:true}) jumps */
    const tw = { active: false, from: 0, to: 0, k: 0, dur: 1 };
    function tweenStep(dt) {
      if (!tw.active) return;
      tw.k = Math.min(tw.k + dt / tw.dur, 1);
      sim.setT(lerp(tw.from, tw.to, easeInOut(tw.k)));
      emit('t', sim.t);
      if (tw.k >= 1) tw.active = false;
    }

    /* pointer: hover lights, a still click on an organelle flies, a drag is Stage's; background does nothing */
    let ndc = null, down = null;
    const canvas = box.canvas;
    const toNdc = e => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    canvas.addEventListener('pointermove', e => { ndc = toNdc(e); canvas.style.cursor = sim && sim.pick(ndc) ? 'pointer' : 'grab'; });
    canvas.addEventListener('pointerleave', () => { ndc = null; });
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; fly.active = false; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const hit = sim.pick(toNdc(e));
      if (hit) { focusOn(hit, hit.userData.organelle); emit('pick', hit.userData.organelle); }
    });
    canvas.addEventListener('dblclick', goHome);

    sim = create(THREE, box.root, box.camera, params);
    /* three r163+ scales a reflection by the material's envMapIntensity only when the map is the
       material's own, so hand each one the scene's. */
    box.scene.traverse(o => {
      for (const m of [].concat(o.material || [])) if (m.isMeshStandardMaterial && !m.envMap) m.envMap = box.scene.environment;
    });
    box.pump();

    /* The component contract: set / state / on / destroy. `state` is a
       plain object a page can read every frame without allocating opinions
       about the model. Declared as a function so `step` can call it on the
       pump that happens before `api` exists.

       `state` names the nearest of the three named points on the t axis, so
       a page can print a word without deciding where flaccid ends. */
    function stateOf() {
      let name = null, best = Infinity;
      for (const k in STATES) { const d = Math.abs(STATES[k] - sim.t); if (d < best) { best = d; name = k; } }
      return { tissue: sim.tissue, t: sim.t, state: name, stream: sim.stream,
        hovered: sim.hovered && sim.hovered.userData.organelle || null,
        counts: sim.counts(), shown: sim.layers() };
    }
    function set(p = {}) {
      if (p.tissue !== undefined && p.tissue !== sim.tissue) { sim.setTissue(p.tissue, !!p.now); emit('tissue', sim.tissue); }
      if (p.stream !== undefined) sim.setStream(p.stream);
      if (p.state !== undefined) p.t = STATES[p.state];
      if (p.t !== undefined && p.t !== null) {
        if (p.now) { tw.active = false; sim.setT(p.t); emit('t', sim.t); }
        else { tw.from = sim.t; tw.to = clamp(p.t, 0, 2); tw.k = 0; tw.dur = p.dur || 1.6 * Math.max(0.35, Math.abs(tw.to - tw.from)); tw.active = true; }
      }
      return api;
    }
    nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, facings: sim.facings, library: sim.library }) : null;

    const api = {
      sim, box, set, flyTo, home: goHome, focusOn,
      /* No fixed pose per part: an organelle is a small thing somewhere on a
         cut plane, so "where is it?" is the same flight a click on it makes.
         A part this tissue did not build does not move the camera. */
      lookAt(name) { const o = sim.organelles.find(x => x.userData.organelle === name && x.parent); if (o) focusOn(o, name); return api; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => (nb ? nb.list() : []),
      layers: () => sim.layers(), palette: () => sim.palette(),
      show(n, on) { sim.show(n, on); if (!box.running) box.draw(); return api; },
      state: stateOf,
      on: (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return () => { listeners[name] = (listeners[name] || []).filter(f => f !== fn); }; },
      start: box.start, stop: box.stop, pump: box.pump, destroy: box.destroy,
    };
    return api;
  }

  global.PlantCell = { create, mount, DEFAULTS, HOME, TISSUES, STATES, stateParams };
  /* Scale (kit/scale.js). PROP TIER AND NOT A SCALE, like the
     animal cell: unit is null, so nothing may print a length off this render.
     The apothem is 11 against the animal cell's radius of 10 because a plant
     cell IS the larger of the two, but that ratio is the only measured thing
     here and it is a ratio, not a size.
     `exag` names the two things drawn out of proportion to the rest on
     purpose: a ribosome would be sub-pixel at its own size, and a
     mitochondrion beside a chloroplast would be too small to read as an
     organelle at all. Everything else is in proportion to its neighbours. */
  global.PlantCell.SCALE = { rung: 'cell', form: 'single', unit: null, exag: { ribosome: 30, mitochondrion: 2 }, down: {} };
})(typeof globalThis !== 'undefined' ? globalThis : this);
