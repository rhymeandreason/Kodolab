/* =============================================================================
 *  cell/animalcell.js — an animal cell cut open, with its organelles, as one box
 * =============================================================================
 *  The textbook cut cell: a bowl of cytoplasm, cut on a wavy line, with a
 *  nucleus, mitochondria, ER, Golgi, centrioles and vesicles standing in it.
 *  r128 and kit/card-stage.js, no build step.
 *
 *      AnimalCell.create(THREE, root, camera, opts)   the model: root is yours
 *      AnimalCell.mount(el, params)                   one box, one handle
 *
 *  LOAD cell/organelles.js FIRST. The four organelles a plant cell has too
 *  — nucleus, mitochondrion, Golgi, rough ER — are built there and are the
 *  same objects in both cells, because they are the same organelles. What
 *  is left here is what only an animal cell has (the bowl, the centrosome,
 *  the lysosomes) and, mostly, WHERE EVERYTHING SITS. That split is the
 *  file: arrangement is this cell's, geometry is shared.
 *
 *  ONE SEEDED STREAM, IN CALL ORDER. The kit's random is consumed by the
 *  builders and by this file's placement in the order they are called, so
 *  inserting a call in the middle reshuffles every organelle after it. A
 *  changed layout from an unrelated edit means a call moved.
 *
 *  mount adds hover (an organelle brightens) and click (the camera flies to
 *  it; double-click flies home). flyTo/home are in Stage's
 *  own theta/phi/r. The camera never moves on its own — see mount.
 *
 *  THE COMPONENT CONTRACT (docs/AddingAComponent.md, docs/Components.md):
 *
 *      params   motion 0..3 (default 1, live) · flows { glucose, o2, co2 } each 0..1 (live)
 *               seed, tilt (rebuild only) · clickToFly (default true)
 *      state()  motion · flows · hovered · counts (per organelle) · shown
 *      events   frame · hover · pick
 *      parts    membrane · nucleus · er · golgi · mitochondrion ·
 *               centrosome · vesicle · ribosome · transporter. One list serves three
 *               jobs: anchors for note(), names for show(), and the
 *               targets lookAt() flies to. LIBRARY carries a label and a
 *               two-sentence card for each, which is the teaching text —
 *               a generated page has none of its own.
 *
 *  NOTHING GLIDES. Every other parameter is geometry, and geometry
 *  rebuilds; `motion` scales time in step, so a page can stop the cell
 *  dead without it springing back to the seed layout.
 *
 *  PROP TIER, AND NOT A SCALE. Nothing here is measured and the scene unit
 *  is not a micrometre: organelle sizes are a diagram's, chosen so every
 *  one reads from the home view. A page must not put a number beside it.
 *
 * ========================================================================== */
(function (global) {
  'use strict';

  const PI = Math.PI;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);


  /* ---- the model ----------------------------------------------------- */

  /* `detail` is which mitochondrion is drawn with its membranes resolved:
     'auto' raises the one a click flies to and drops it again on the way
     home, 'high' raises all five (five detailed organelles is a real cost),
     'low' never raises any. */
  const DEFAULTS = { seed: 1234, tilt: 0.32, motion: 1, detail: 'auto', flows: { glucose: 0, o2: 0, co2: 0 } };

  function create(THREE, root, camera, opts = {}) {
    const P = Object.assign({}, DEFAULTS, opts);
    P.flows = Object.assign({}, DEFAULTS.flows, opts.flows || {});
    if (!global.CellOrganelles) throw new Error('cell/animalcell.js: load cell/organelles.js first');
    /* The nucleus, mitochondrion, Golgi and ER are cell/organelles.js's, and
       the plant cell builds the same four from the same kit. What is left in
       this file is what only an animal cell has — the bowl, the centrosome,
       the lysosomes — and where everything sits. */
    const K = global.CellOrganelles.kit(THREE, { seed: P.seed });
    const { buildShell, displace } = global.CellOrganelles;
    const { rand, rr, noise, col, mat, bilayerOf, ORG } = K;
    const V3 = THREE.Vector3;
    const organelles = [], occupied = [];      // occupied: spheres the speckles avoid
    const register = (obj, name) => { obj.userData.organelle = name; organelles.push(obj); return obj; };
    const dirUW = (u, w) => new V3(Math.sin(w) * Math.cos(u), -Math.cos(w), Math.sin(w) * Math.sin(u));

    const cell = new THREE.Group();
    cell.rotation.x = P.tilt;                   // the opening leans toward the reader
    root.add(cell);

    /* cell body: a flattened, noise-deformed sphere cut on a wavy line */
    const R = 10, TH = 0.55, YS = 0.72;
    const cellRadius = d => R * (1 + 0.055 * noise.fbm(d.x * 1.4 + 3.1, d.y * 1.4 + 1.7, d.z * 1.4, 3)
      + 0.05 * noise.noise3(d.x * 0.6 + 9, d.y * 0.6, d.z * 0.6));
    const innerR = d => cellRadius(d) - TH;
    const cellS = (u, w) => { const d = dirUW(u, w); const p = d.clone().multiplyScalar(cellRadius(d)); p.y *= YS; return p; };
    let membraneMesh = null, riboMesh = null, riboSample = null;
    const cellCut = u => PI * 0.56 + 0.06 * Math.sin(2 * u + 1) + 0.035 * Math.sin(5 * u + 2.3)
      + 0.05 * noise.noise3(Math.cos(u) * 1.5, Math.sin(u) * 1.5, 2);
    {
      const g = buildShell(THREE, {
        S: cellS, uRange: [0, 2 * PI], wRange: u => [0, cellCut(u)], uSeg: 200, uPeriodic: true,
        thickness: TH, segs: { outer: 70, rim: 24, inner: 70 },
        // The lip is a bilayer: two head bands over a paler tail core. 24 rim
        // rows because the bands are a seventh of the lip each and 12 rows
        // draws them as one step.
        colors: bilayerOf(ORG.plasma),
      });
      const mesh = new THREE.Mesh(g, mat({ vertexColors: true, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.25, emissive: '#3a0008', emissiveIntensity: 0.3 }));
      /* Registered so it can be pointed at and hidden, `nopick` so it cannot
         be clicked: the bowl is behind every organelle in the cell, and a
         raycast that lands on it would take the click off whatever the
         reader was aiming at. */
      mesh.userData.nopick = true;
      membraneMesh = mesh;
      cell.add(register(mesh, 'membrane'));
    }
    const unsq = p => new V3(p.x, p.y / YS, p.z);
    const insideCell = (p, margin = 0) => { const q = unsq(p); return q.length() < innerR(q.clone().normalize()) - margin; };
    const clampToCell = (p, margin) => {
      const q = unsq(p), lim = innerR(q.clone().normalize()) - margin;
      if (q.length() > lim) { q.setLength(lim); p.set(q.x, q.y * YS, q.z); }
      return p;
    };
    const floorY = (x, z) => {
      let y = -(R - TH);
      for (let i = 0; i < 4; i++) { const ri = innerR(new V3(x, y, z).normalize()); y = -Math.sqrt(Math.max(0.01, ri * ri - x * x - z * z)); }
      return y * YS;
    };

    /* nucleus, from the kit; this file only says where it sits */
    const nucleus = K.nucleus({ R: 3.6, thickness: 0.22, chromatin: 3, pores: 60 });
    nucleus.position.set(1.6, -2.3, -1.4);
    nucleus.rotation.set(0.55, 0.25, 0);
    cell.add(register(nucleus, 'nucleus'));
    const Rn = nucleus.userData.surface.R, nucleolus = nucleus.userData.parts.nucleolus;
    const nucPos = nucleus.position.clone();

    /* mitochondria: the kit's, five of them, laid out on the floor of the bowl */
    const mitos = [];
    for (const t of [
      { x: -3.0, z: 4.6, ry: 0.35, rx: 0.25 }, { x: 2.4, z: 5.2, ry: -0.6, rx: 0.3 }, { x: 6.2, z: 2.4, ry: 1.25, rx: 0.2 },
      { x: -6.3, z: -3.6, ry: 0.95, rx: 0.15 }, { x: 6.8, z: -3.2, ry: -1.1, rx: 0.1 },
    ]) {
      /* Drawn about twice its size against this nucleus, deliberately: a
         mitochondrion is 1 to 2 microns long to a nucleus's six, and at
         that ratio it is too small here to read as anything. Declared in
         SCALE at the foot of the file. */
      const m = register(K.mitochondrion({ r: 0.55, L: 0.95, thickness: 0.09 }), 'mitochondrion');
      m.position.set(t.x, Math.max(floorY(t.x, t.z) + 0.8, -4.2 + rr(-0.6, 0.6)), t.z);
      m.rotation.set(t.rx, t.ry, 0);
      cell.add(m);
      mitos.push(m);
      occupied.push({ p: m.position.clone(), r: 1.6 });
    }

    /* ---- a mitochondrion, closer up -------------------------------------
       A mitochondrion in a cut cell is drawn as a shell and a folded ribbon,
       which is all that reads at the size five of them stand beside a
       nucleus. Flown to, it is most of the screen, and at that distance the
       ribbon is a lie a reader can now see: they can count the folds and
       they cannot tell an intermembrane space from a matrix.

       So the SAME organelle, in the same place, at the same size, swaps its
       insides for cell/organelles.js's `mitochondrionDetail` — two membranes,
       cristae as sacs, the chain on them. It is one group throughout, so
       every anchor, every layer and every body in the solver still points at
       the object it always did; only the children change. It is the same
       FOLD either way — one continuous inner membrane, traced along the same
       path — with more of them and the sheet swept as a wall, its lumen and
       a wall rather than as a single ribbon. What it is NOT is a different
       component: cell/mitochondrion.js is that, one rung down, and this is
       the same geometry seen from the cell.

       A KIT OF ITS OWN, seeded off this cell's. The cell's random stream is
       consumed in call order (see the header), so building detail on demand
       out of the same kit would reshuffle nothing now and everything on the
       next rebuild. */
    function mitoDetail(g, on) {
      if (!g || g.userData.organelle !== 'mitochondrion') return;
      if (!!g.userData.detailed === !!on) return;
      const lod = g.userData.lod || (g.userData.lod = { low: g.children.slice(), high: null });
      if (on && !lod.high) {
        const K2 = global.CellOrganelles.kit(THREE, { seed: P.seed + 977 });
        lod.high = K2.mitochondrionDetail({
          r: 0.55, L: 0.95, cristae: 8, porins: 45, ribosomes: 18, detail: 0.7,
        }).children.slice();
      }
      g.remove(...g.children.slice());
      for (const c of (on ? lod.high : lod.low)) g.add(c);
      g.userData.detailed = !!on;
    }
    const setDetail = mode => {
      P.detail = mode;
      // 'auto' is the mount's job: it raises the one the camera flew to.
      if (mode !== 'auto') for (const m of mitos) mitoDetail(m, mode === 'high');
    };

    /* Golgi: the kit's. One perinuclear ribbon, which is the animal
       arrangement; a plant cell scatters many of the same stack. */
    {
      const g = K.golgi({ cisternae: 7, vesicles: 8 });
      g.position.set(-6.2, -3.4, 0.6);
      g.rotation.set(0.15, 0.35, -1.45);
      cell.add(register(g, 'golgi'));
      occupied.push({ p: g.position.clone(), r: 2.6 });
    }

    /* rough ER: the kit's, wrapping this nucleus and stopped by this membrane */
    const er = K.roughER({
      Rn, center: nucPos, y0: -3.3,
      arcs: [{ a0: -0.38 * PI, a1: 0.58 * PI, count: 4 }, { a0: 0.80 * PI, a1: 1.22 * PI, count: 3 }],
      clamp: p => clampToCell(p, 0.7),
    });
    const riboPositions = er.ribosomes;
    cell.add(register(er.group, 'er'));

    /* centrosome: two centrioles of nine triplets, microtubules out */
    {
      const c = new THREE.Group();
      const cm = mat({ color: ORG.centrosome.outer, roughness: 0.5, clearcoat: 0.3 });
      const tube = new THREE.CylinderGeometry(0.035, 0.035, 0.85, 8);
      const centriole = () => {
        const g = new THREE.Group();
        for (let i = 0; i < 9; i++) for (let j = 0; j < 3; j++) {
          const m = new THREE.Mesh(tube, cm), a = (i / 9) * 2 * PI + j * 0.16, ra = 0.2 + j * 0.06;
          m.position.set(Math.cos(a) * ra, 0, Math.sin(a) * ra);
          g.add(m);
        }
        return g;
      };
      const c2 = centriole();
      c2.rotation.z = PI / 2;
      c2.position.set(0.45, -0.6, 0.1);
      c.add(centriole(), c2);
      const mtMat = mat({ color: ORG.centrosome.microtubule, roughness: 0.55, clearcoat: 0.1 });
      for (let i = 0; i < 6; i++) {
        const dir = new V3(rr(-1, 0.4), rr(-0.8, 0.2), rr(-0.3, 1)).normalize(), len = rr(1.6, 3.2);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len, 6), mtMat);
        m.position.copy(dir).multiplyScalar(len / 2 + 0.4);
        m.quaternion.setFromUnitVectors(new V3(0, 1, 0), dir);
        c.add(m);
      }
      c.position.set(-3.3, -2.2, -4.6);
      c.rotation.set(0.4, 0.3, 0.5);
      cell.add(register(c, 'centrosome'));
      occupied.push({ p: c.position.clone(), r: 1.6 });
    }

    /* vesicles, lysosomes, peroxisomes: spheres that keep out of everything */
    {
      const palette = [
        /* Vesicles are a MIXED BAG on purpose — they come off the Golgi, the
           ER and the membrane and are heading anywhere — so two of these
           borrow a parent's colour and the rest are peroxisome oranges and
           endosome blue, which nothing else on the page draws. */
        { c: '#f08a3c', e: '#ff5a00', ei: 0.25 }, { c: '#f5a25a' }, { c: ORG.lysosome.outer }, { c: '#6fa1dc' },
        { c: ORG.golgi.vesicle }, { c: '#f6c453', e: '#ff9a00', ei: 0.2 }, { c: ORG.lysosome.inner },
      ];
      const placed = [];
      for (let count = 0, tries = 0; count < 18 && tries < 4000; tries++) {
        const d = new V3(rr(-1, 1), rr(-1, -0.15), rr(-1, 1)).normalize();
        const p = d.multiplyScalar(innerR(d) * rr(0.35, 0.92)), rad = rr(0.22, 0.5);
        if (p.y > 0.4 || !insideCell(p, rad + 0.3)) continue;
        if (p.distanceTo(nucPos) < Rn + 0.9 + rad) continue;
        if (placed.some(q => q.distanceTo(p) < 1.4 + rad)) continue;
        if (occupied.some(o => o.p.distanceTo(p) < o.r + rad + 0.3)) continue;
        placed.push(p);
        const pal = palette[Math.floor(rand() * palette.length)], seedK = count;
        const geo = displace(new THREE.SphereGeometry(rad, 32, 24), (x, y, z) => {
          const k = 1 + 0.05 * noise.noise3(x * 4 + seedK, y * 4, z * 4); return [x * k, y * k, z * k];
        });
        const m = new THREE.Mesh(geo, mat({ color: pal.c, emissive: pal.e || '#000000', emissiveIntensity: pal.ei || 0, roughness: 0.35, clearcoat: 0.7 }));
        m.position.copy(p);
        cell.add(register(m, 'vesicle'));
        occupied.push({ p: p.clone(), r: rad + 0.1 });
        count++;
      }
    }

    /* free ribosomes: one instanced mesh for the cytoplasm speckle and the ER's studs */
    {
      const N = 1500;
      const inst = new THREE.InstancedMesh(new THREE.SphereGeometry(0.06, 6, 5),
        new THREE.MeshStandardMaterial({ color: col(ORG.er.ribosome), roughness: 0.6 }), N + riboPositions.length);
      const dummy = new THREE.Object3D();
      let i = 0;
      for (let tries = 0; i < N && tries < N * 10; tries++) {
        const d = new V3(rr(-1, 1), rr(-1, 1), rr(-1, 1)).normalize();
        const p = d.multiplyScalar(innerR(d) * Math.cbrt(rand()) * 0.97);
        if (p.y > 0.8 || !insideCell(p, 0.1)) continue;
        if (p.distanceTo(nucPos) < Rn + 0.25) continue;
        if (occupied.some(o => o.p.distanceTo(p) < o.r)) continue;
        if (!riboSample) riboSample = p.clone();      // one real dot, for the anchor
        dummy.position.copy(p); dummy.scale.setScalar(rr(0.6, 1.4)); dummy.updateMatrix();
        inst.setMatrixAt(i++, dummy.matrix);
      }
      for (const q of riboPositions) { dummy.position.copy(q); dummy.scale.setScalar(1.15); dummy.updateMatrix(); inst.setMatrixAt(i++, dummy.matrix); }
      inst.count = i;
      inst.userData.nopick = true;              // 1500 dots, none of them a target
      riboMesh = inst;
      cell.add(register(inst, 'ribosome'));
    }

    /* ---- traffic: glucose and O₂ in, CO₂ out ----
       CHOREOGRAPHY AT THE WRONG SCALE, AND THE ROUTES ARE THE CLAIM. A
       glucose is a nanometre and this cell is ten units across, so the
       molecules are drawn thousands of times too big; what must be true is
       where each one crosses and where it goes. Glucose is large and polar
       and enters only through a GLUT, down its gradient, then ends in the
       cytosol, where glycolysis happens. O₂ and CO₂ are small and nonpolar
       and cross the bilayer anywhere: O₂ ends in a mitochondrion, CO₂ starts
       in one. H₂O is left out; it is true and it teaches nothing here.

       ITS OWN RANDOM STREAM, so turning flows on moves no organelle (see
       the header on the kit's stream). Built after every organelle for the
       same reason. */
    const traffic = (() => {
      const PAL = global.MolPalette || (global.MolLib && global.MolLib.PALETTE);
      const rnd = global.CellOrganelles.seededRandom(P.seed ^ 0x5eed);
      const rg = (a, b) => a + (b - a) * rnd();
      const N = { glucose: 10, o2: 14, co2: 14 };
      // Drawn size of every molecule. The lesson zooms into the cytoplasm, so small still reads.
      const MOL = 0.4;
      const out = (d, k) => { const p = d.clone().multiplyScalar(cellRadius(d) + k); p.y *= YS; return p; };
      const inn = (d, k) => { const p = d.clone().multiplyScalar(innerR(d) - k); p.y *= YS; return p; };
      // Crossings stay below the cut, on the wall's side, so none enters over the rim.
      const wallDir = () => dirUW(rg(0, 2 * PI), rg(0.28 * PI, 0.5 * PI));
      const cytosol = () => {
        for (let i = 0; i < 40; i++) {
          const q = dirUW(rg(0, 2 * PI), rg(0.12 * PI, 0.5 * PI)).multiplyScalar(rg(3, 8));
          q.y *= YS;
          if (insideCell(q, 1) && q.distanceTo(nucPos) > Rn + 1.2 && q.y < -0.8) return q;
        }
        return new V3(-5, -4, 1);
      };

      /* the doors: four GLUTs through the wall, the first on the front rim so a note on it reads */
      const glutDirs = [PI / 2 + 0.55, PI / 2 - 0.75, -PI / 2 + 0.6, PI + 0.2].map(u => dirUW(u, 0.42 * PI));
      // a thick-walled tube: the rectangle (inner..outer radius, full length) turned once round
      const gh = (TH + 0.12) / 2;
      const glutGeo = new THREE.LatheGeometry([[0.15, -gh], [0.26, -gh], [0.26, gh], [0.15, gh], [0.15, -gh]].map(([r, y]) => new THREE.Vector2(r, y)), 18);
      glutGeo.computeVertexNormals();
      const glutMat = mat({ color: PAL.respiration.glut, roughness: 0.55, side: THREE.DoubleSide });
      const doors = glutDirs.map(d => {
        const m = new THREE.Mesh(glutGeo, glutMat);
        m.position.copy(d.clone().multiplyScalar(cellRadius(d) - TH / 2)).setY(m.position.y * YS);
        m.quaternion.setFromUnitVectors(new V3(0, 1, 0), unsq(m.position).normalize());
        m.userData.nopick = true;
        cell.add(register(m, 'transporter'));
        return m;
      });

      /* ONE SCALE FOR ALL THREE: A scene units per ångström. Glucose is the
         library's own spec, atom for atom, centred and taken from the
         library's display scale to this one; O₂ and CO₂ are placed from
         their real bond lengths. Every atom is the palette radius at A. */
      const A = 0.215;
      const G = global.MolLib.MOLECULES.glucose.atoms;
      const gc = G.reduce((acc, x) => acc.add(new V3().fromArray(x.pos)), new V3()).divideScalar(G.length);
      const GK = A / global.MolLib.SCALE;
      const glucoseAtoms = el => G.filter(x => x.el === el).map(x => new V3().fromArray(x.pos).sub(gc).multiplyScalar(GK).toArray());
      const ball = el => new THREE.SphereGeometry(PAL.radii[el] * A, 10, 8);
      const OO = 1.21 * A / 2, CO = 1.16 * A;     // O=O 1.21 Å, C=O 1.16 Å
      const species = {
        glucC: { kind: 'glucose', geo: ball('C'), color: PAL.atoms.C, atoms: glucoseAtoms('C') },
        glucO: { kind: 'glucose', geo: ball('O'), color: PAL.atoms.O, atoms: glucoseAtoms('O') },
        glucH: { kind: 'glucose', geo: ball('H'), color: PAL.atoms.H, atoms: glucoseAtoms('H') },
        o2: { kind: 'o2', geo: ball('O'), color: PAL.atoms.O, atoms: [[-OO, 0, 0], [OO, 0, 0]] },
        co2O: { kind: 'co2', geo: ball('O'), color: PAL.atoms.O, atoms: [[-CO, 0, 0], [CO, 0, 0]] },
        co2C: { kind: 'co2', geo: ball('C'), color: PAL.atoms.C, atoms: [[0, 0, 0]] },
      };
      const meshes = {};
      for (const [k, s] of Object.entries(species)) {
        const m = new THREE.InstancedMesh(s.geo, mat({ color: s.color, roughness: 0.4, clearcoat: 0.4 }), N[s.kind] * s.atoms.length);
        m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        m.frustumCulled = false;
        m.count = 0;
        cell.add(m);
        meshes[k] = m;
      }
      /* A soft yellow halo behind each glucose: charcoal-and-red atoms on a
         red cytoplasm disappear, and the fuel is the one molecule to follow. */
      const glow = (() => {
        const c = document.createElement('canvas'); c.width = c.height = 64;
        const g = c.getContext('2d'), grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        const rgb = new THREE.Color(PAL.respiration.glucose);
        const css = a => `rgba(${rgb.r * 255 | 0},${rgb.g * 255 | 0},${rgb.b * 255 | 0},${a})`;
        grad.addColorStop(0, css(1)); grad.addColorStop(0.4, css(0.6)); grad.addColorStop(1, css(0));
        g.fillStyle = grad; g.fillRect(0, 0, 64, 64);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N.glucose * 3), 3).setUsage(THREE.DynamicDrawUsage));
        const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 1.55, sizeAttenuation: true,
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        pts.frustumCulled = false;
        cell.add(pts);
        return pts;
      })();

      /* A trip is waypoints with durations; a waypoint may be a function, so
         a molecule heading for a mitochondrion follows it as it wanders. */
      const mitoAt = i => () => mitos[i].position;
      function trip(kind) {
        const mi = Math.floor(rnd() * mitos.length);
        if (kind === 'glucose') {
          const d = glutDirs[Math.floor(rnd() * glutDirs.length)];
          const far = out(d, rg(3, 6)).add(new V3(rg(-2, 2), rg(-1.5, 0), rg(-2, 2)));
          return { pts: [far, out(d, 0.35), inn(d, 0.35), cytosol()], dur: [rg(4, 6), 0.9, rg(4, 6)] };
        }
        if (kind === 'o2') {
          const d = wallDir();
          return { pts: [out(d, rg(3, 6)), out(d, 0.2), inn(d, 0.2), mitoAt(mi)], dur: [rg(3, 5), 0.5, rg(3, 5)] };
        }
        const d = wallDir();
        return { pts: [mitoAt(mi), inn(d, 0.2), out(d, 0.2), out(d, rg(3, 6))], dur: [rg(3, 5), 0.5, rg(3, 5)] };
      }
      const pool = {};
      for (const kind of Object.keys(N)) {
        pool[kind] = [];
        for (let i = 0; i < N[kind]; i++) {
          const tr = trip(kind), total = tr.dur.reduce((a, b) => a + b, 0);
          pool[kind].push(Object.assign(tr, { age: rnd() * total, ph: [rg(0, 9), rg(0, 9), rg(0, 9)], spin: new V3(rg(-1, 1), rg(-1, 1), rg(-1, 1)).normalize() }));
        }
      }

      const _p = new V3(), _a = new V3(), _b = new V3(), _j = new V3(), _q = new THREE.Quaternion(), _s = new V3(), _m = new THREE.Matrix4(), _o = new THREE.Matrix4();
      const at = w => (typeof w === 'function' ? w() : w);
      const smooth = k => k * k * (3 - 2 * k);
      function place(mol) {
        let a = mol.age, i = 0;
        while (i < mol.dur.length - 1 && a > mol.dur[i]) { a -= mol.dur[i]; i++; }
        const k = Math.min(a / mol.dur[i], 1);
        _a.copy(at(mol.pts[i])); _b.copy(at(mol.pts[i + 1]));
        _p.lerpVectors(_a, _b, i === 1 ? k : smooth(k));
        // Brownian-looking wander, zero at the ends of each leg so the crossing stays on the door.
        const env = Math.sin(PI * k) * (i === 1 ? 0 : 0.7);
        _j.set(Math.sin(t * 1.7 + mol.ph[0] + a), Math.sin(t * 1.3 + mol.ph[1] + 2 * a), Math.sin(t * 1.9 + mol.ph[2] - a));
        _p.addScaledVector(_j, env);
        const total = mol.dur.reduce((x, y) => x + y, 0);
        // grow in at the start of the trip and shrink out at its end: made, or used up
        return MOL * Math.min(1, mol.age / 0.6, (total - mol.age) / 0.8);
      }

      const KEYS = {};
      for (const [k, sp] of Object.entries(species)) (KEYS[sp.kind] = KEYS[sp.kind] || []).push(k);
      function step(dt) {
        let glowN = 0;
        const fill = {};
        for (const k of Object.keys(meshes)) fill[k] = 0;
        for (const kind of Object.keys(N)) {
          const live = Math.round(N[kind] * clamp(P.flows[kind] || 0, 0, 1));
          for (let i = 0; i < live; i++) {
            const mol = pool[kind][i];
            mol.age += dt * P.motion;
            if (mol.age >= mol.dur.reduce((a, b) => a + b, 0)) Object.assign(mol, trip(kind), { age: 0 });
            const sc = Math.max(0.001, place(mol));
            _q.setFromAxisAngle(mol.spin, t * 0.8 + mol.ph[0]);
            _s.setScalar(sc);
            _m.compose(_p, _q, _s);
            if (kind === 'glucose') { glow.geometry.attributes.position.setXYZ(i, _p.x, _p.y, _p.z); glowN = i + 1; }
            for (const key of KEYS[kind]) {
              for (const off of species[key].atoms) {
                _o.makeTranslation(off[0], off[1], off[2]).premultiply(_m);
                meshes[key].setMatrixAt(fill[key]++, _o);
              }
            }
          }
        }
        for (const k of Object.keys(meshes)) { meshes[k].count = fill[k]; meshes[k].instanceMatrix.needsUpdate = true; }
        glow.geometry.setDrawRange(0, glowN);
        glow.geometry.attributes.position.needsUpdate = true;
        const doorsOn = (P.flows.glucose || 0) > 0 && !parts.hidden.transporter;
        for (const m of doors) m.visible = doorsOn;
      }
      return { step };
    })();

    /* ---- hover, and the per-frame motion ---- */
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
    // ndc is {x,y} in clip space or null; returns the organelle root under it.
    function pick(ndc) {
      if (!ndc) return null;
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(organelles.filter(o => !o.userData.nopick), true);
      return hits.length ? rootOf(hits[0].object) : null;
    }
    function hover(ndc) {
      const r = pick(ndc);
      if (r === hovered) return hovered;
      if (hovered) setHighlight(hovered, false);
      hovered = r;
      if (hovered) setHighlight(hovered, true);
      emit('hover', hovered && hovered.userData.organelle || null);
      return hovered;
    }
    const MTOC = new V3(-3.3, -2.2, -4.6);        // the centrosome, from its placement above

    /* ---- ambient motion, with a solve ----
       NOT THE PLANT CELL'S MOTION. cell/plantcell.js circulates its whole
       cytoplasm, because cyclosis is actin and myosin hauling the cytosol
       round a central vacuole, and this cell has neither. What an animal
       cell's organelles do is jiggle in place and get carried along
       microtubules, which radiate from the centrosome — so this is a wander
       for everything and, for the vesicles, a run in and out along the line
       to the MTOC. Copying the orbit across would have looked the same and
       claimed something false.

       THE SOLVE IS WHAT MAKES THE MOTION VISIBLE. Without one the amplitude
       has to stay under a tenth of a unit or organelles pass through each
       other, and a tenth of a unit in a cell ten across is nothing to look
       at. With it they push apart, so the wander can be big enough to see.
       Same three terms as the plant cell's — a spring to a drifting seed,
       repulsion, a wall — but in THREE dimensions, because this cell is a
       bowl with organelles at many depths rather than a plane. That is also
       why it can be this loose: spheres in a volume pack far more easily
       than discs on a plane, and this cell is about a quarter full. */
    const BODY = { mitochondrion: 1.6, golgi: 2.2, centrosome: 1.4, vesicle: 0.6 };
    // What wanders. The nucleus is a fixed body below, the ER is anchored to
    // it, and the membrane and the ribosome sheet are not organelles that move.
    const MOBILE = ['mitochondrion', 'golgi', 'centrosome', 'vesicle'];
    const bodies = organelles
      .filter(o => MOBILE.includes(o.userData.organelle))
      .map(o => ({
        o, seed: o.position.clone(), p: o.position.clone(), v: new V3(), f: new V3(),
        r: BODY[o.userData.organelle] || 1.2, w: 1,
        run: o.userData.organelle === 'vesicle'
          ? o.position.clone().sub(MTOC).normalize().multiplyScalar(rr(1.4, 2.6)) : null,
        ph: [rr(0, 2 * PI), rr(0, 2 * PI), rr(0, 2 * PI)],
        sp: [rr(0.10, 0.18), rr(0.13, 0.22), rr(0.11, 0.20)],
        amp: rr(0.45, 0.85), runSp: rr(0.05, 0.10), runPh: rr(0, 2 * PI),
        spin: rr(-0.09, 0.09), spinBase: o.rotation.y,
      }));
    // The nucleus takes part as an immovable body: everything else has to
    // get out of its way, and it is far too big to be shoved by a vesicle.
    bodies.push({ o: null, p: nucPos.clone(), seed: nucPos.clone(), v: new V3(), f: new V3(), r: Rn + 0.4, w: 0, run: null });

    const target = new V3(), d3 = new V3();
    function solve(dt) {
      const KS = 14, KR = 260, DAMP = 6, CEIL = -0.4;
      for (const b of bodies) {
        if (b.w === 0) continue;
        target.copy(b.seed);
        target.x += Math.sin(t * b.sp[0] + b.ph[0]) * b.amp;
        target.y += Math.sin(t * b.sp[1] + b.ph[1]) * b.amp * 0.6;
        target.z += Math.sin(t * b.sp[2] + b.ph[2]) * b.amp;
        if (b.run) target.addScaledVector(b.run, Math.sin(t * b.runSp + b.runPh));
        b.f.subVectors(target, b.p).multiplyScalar(KS);
      }
      for (const A of bodies) {
        if (A.w === 0) continue;
        for (const B of bodies) {
          if (A === B) continue;
          d3.subVectors(A.p, B.p);
          const dist = d3.length() || 1e-4, ov = A.r + B.r - dist;
          if (ov <= 0) continue;
          A.f.addScaledVector(d3.divideScalar(dist), KR * ov * (B.w === 0 ? 1.6 : 1));
        }
      }
      const damp = Math.max(0, 1 - DAMP * dt);
      for (const b of bodies) {
        if (b.w === 0) continue;
        b.v.addScaledVector(b.f, b.w * dt).multiplyScalar(damp);
        b.p.addScaledVector(b.v, dt);
        // the shell, and the cut: nothing may rise above the opening
        clampToCell(b.p, b.r);
        if (b.p.y > CEIL - b.r * 0.5) { b.p.y = CEIL - b.r * 0.5; if (b.v.y > 0) b.v.y = 0; }
        b.o.position.copy(b.p);
        b.o.rotation.y = b.spinBase + b.spin * Math.sin(t * 0.07 + b.ph[0]);
      }
    }

    let t = 0;
    function step(dt) {
      /* `motion` scales TIME, not amplitude: at 0 the wander stops where it
         is instead of springing back to the seed layout, which is what
         scaling the offsets would do. */
      t += dt * P.motion;
      solve(dt);
      traffic.step(dt);
      nucleolus.material.emissiveIntensity = 0.4 + 0.12 * Math.sin(t * 1.3);
      emit('frame', state(), dt);
    }

    // World-space bounding sphere of an organelle, for a camera flight.
    function bounds(org) {
      root.updateMatrixWorld(true);
      return new THREE.Box3().setFromObject(org).getBoundingSphere(new THREE.Sphere());
    }

    /* ---- what a page can point at, hide, and read ----
       LIBRARY is the component's own teaching text: one label and a
       two-sentence card per part, in a tutor's voice, so a generated page
       answers "what is that?" with a callout on the organelle instead of a
       paragraph of its own invention. Real sizes belong here as PROSE — the
       render is prop tier and nothing may print a length off it. */
    const LIBRARY = {
      membrane:     { text: 'plasma membrane', offset: [44, -26], card: 'A double sheet of phospholipids with their oily tails facing each other, cut here so you can see it has two faces. It decides what gets in and out, which is the whole reason a cell can hold a chemistry different from its surroundings.' },
      nucleus:      { text: 'nucleus', offset: [-46, -28], card: 'The DNA lives here, wound on proteins, behind a double envelope pierced by pores. The bright ball inside is the nucleolus, where ribosomes are assembled.' },
      er:           { text: 'rough ER', offset: [-48, 24], card: 'Sheets of membrane continuous with the nuclear envelope, studded with ribosomes. Proteins made on those ribosomes are pushed into the sheet and folded there, on their way out of the cell.' },
      golgi:        { text: 'Golgi apparatus', offset: [-46, 26], card: 'A stack of flattened sacs that finishes proteins arriving from the ER and sorts them into vesicles. An animal cell keeps one ribbon of it beside the nucleus; a plant cell scatters dozens.' },
      mitochondrion:{ text: 'mitochondrion', offset: [44, -24], card: 'Two membranes, the inner one folded into cristae, where most of the cell\u2019s ATP is made. It carries its own small genome, which is the clue that it was once a free-living bacterium.' },
      centrosome:   { text: 'centrosome', offset: [-48, -24], card: 'Two centrioles at right angles, each a barrel of nine microtubule triplets. It is where the cell\u2019s microtubules radiate from, and it organises the spindle when the cell divides.' },
      vesicle:      { text: 'vesicles', offset: [46, 24], card: 'Small membrane bubbles ferrying cargo between the ER, the Golgi and the surface. The orange ones here stand for peroxisomes and lysosomes, which digest things the cell wants broken down.' },
      transporter:  { text: 'glucose transporter', offset: [46, -24], card: 'A protein door through the membrane. Glucose is too big and too polar to slip between the oily tails, so it enters only here, running down its concentration gradient. O\u2082 and CO\u2082 are small and nonpolar, and cross the membrane anywhere.' },
      ribosome:     { text: 'ribosomes', offset: [46, 26], card: 'The dots throughout the cytoplasm and over the ER. Each one reads a strand of mRNA and builds the protein it codes for, which is why a busy cell has millions.' },
    };
    /* The legend, off the same palette the meshes were built from, so it
       cannot name a colour the cell does not have. */
    const hex = v => '#' + (typeof v === 'number' ? v : parseInt(String(v).replace('#', ''), 16)).toString(16).padStart(6, '0');
    const LEGEND = [['plasma membrane', ORG.plasma.outer], ['nucleus', ORG.nucleus.outer], ['rough ER', ORG.er.side],
      ['Golgi', ORG.golgi.outer], ['mitochondrion', ORG.mitochondrion.outer], ['centrosome', ORG.centrosome.outer],
      ['lysosome', ORG.lysosome.outer], ['ribosome', ORG.er.ribosome]];
    const palette = () => LEGEND.map(([name, c]) => ({ name, color: hex(c) }));

    const parts = K.partsOf(organelles, LIBRARY);
    const anchors = Object.assign({}, parts.anchors);
    /* Two that the generic centroid gets wrong. The membrane is a bowl, so
       its centre is the cytoplasm; point at the rim instead. The ribosomes
       are one instanced mesh over the whole cell, so its centre is the
       middle of the cell; point at a dot that was actually placed.
       u = PI/2 is the rim nearest the camera at the home view. */
    const _a = new V3();
    anchors.membrane = () => (membraneMesh.visible ? cell.localToWorld(_a.copy(cellS(PI / 2, cellCut(PI / 2)))) : null);
    anchors.ribosome = () => (riboSample && riboMesh.visible ? cell.localToWorld(_a.copy(riboSample)) : null);
    /* Everything is in an open bowl the default camera looks into, so a note
       fades as the reader turns the cut away. One facing serves them all. */
    const _f = new V3(), _q = new THREE.Quaternion();
    const faceUp = () => _f.set(0, 1, 0).applyQuaternion(cell.getWorldQuaternion(_q));
    const facings = {};
    for (const n of Object.keys(LIBRARY)) facings[n] = faceUp;

    const listeners = {};
    const emit = (name, ...a) => { CardStage.fire(listeners[name], a, 'AnimalCell ' + name); };
    const on = (name, fn) => { (listeners[name] = listeners[name] || []).push(fn); return () => { listeners[name] = (listeners[name] || []).filter(f => f !== fn); }; };
    const state = () => ({
      motion: P.motion, detail: P.detail, flows: Object.assign({}, P.flows),
      detailed: mitos.filter(m => m.userData.detailed).length,
      hovered: hovered && hovered.userData.organelle || null,
      counts: Object.fromEntries(parts.order().map(n => [n, parts.of(n).length])),
      shown: parts.layers(),
    });
    /* Two live params. Everything else about this cell is its geometry,
       and geometry rebuilds, so there is nothing to glide: `motion` scales
       the wander straight through and a page that wants a still cell sets 0,
       and `flows` sets how many of each molecule are in transit. */
    function set(next = {}) {
      if (next.motion != null) P.motion = clamp(next.motion, 0, 3);
      if (next.detail != null) setDetail(next.detail);
      if (next.flows) Object.assign(P.flows, next.flows);
      return api;
    }

    const api = { group: cell, organelles, step, pick, hover, bounds, set, state, on, emit,
      anchors, facings, library: LIBRARY, palette, layers: parts.layers,
      mitochondria: mitos, mitoDetail,
      show: (n, v) => { parts.show(n, v); return api; },
      get hovered() { return hovered; } };
    return api;
  }

  /* ---- one box ------------------------------------------------------- */

  const HOME = { pos: [2, 13, 28], target: [0, -1.5, 0] };

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('cell/animalcell.js: load kit/card-stage.js first');
    const THREE = global.THREE, V3 = THREE.Vector3;
    const orbitOf = (pos, target) => {
      const v = new V3().fromArray(pos).sub(new V3().fromArray(target)), r = v.length();
      return { r, phi: Math.acos(clamp(v.y / r, -1, 1)), theta: Math.atan2(v.x, v.z) };
    };
    const home = { pos: params.pos || HOME.pos, target: params.target || HOME.target };
    /* NO IDLE TURNTABLE. The cell has its own motion, and a scene that also
       rotates on its own fights it: the reader cannot tell which of the two
       they are watching, and a drift they did not ask for makes a still
       organelle look like it is moving. Same call as cell/plantcell.js. */
    let sim = null, nb = null;
    const box = global.CardStage.create({
      mount: el,
      cam: orbitOf(home.pos, home.target),
      stage: Object.assign({ phiMin: 0.15, phiMax: 2.9, rMin: 3, rMax: 70 }, params.stage || {}),
      step: dt => { if (!sim) return; flyStep(dt); sim.step(dt); sim.hover(ndc); },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    box.cam.target.fromArray(home.target);
    // Soft, shadowless, and fixed. Stage's lights ride the camera, which on a
    // slowly turning cell slides the highlight across every organelle at once;
    // these are dimmed to a wrap and the modelling is done by world-fixed lights
    // instead. No shadow map: a cut bowl casts a hard bar across its own floor,
    // and darkening one organelle because another sits above it is a depth cue
    // that says nothing true about the cell.
    box.renderer.outputEncoding = THREE.sRGBEncoding;
    for (const o of box.camera.children) if (o.isLight) o.intensity *= 0.25;
    for (const o of box.scene.children) if (o.isAmbientLight) o.intensity = 0.22;
    // Sky above, warm bounce off the paper below: the ambient occlusion the
    // scene no longer gets from shadows, as a gradient over each sphere.
    // TOTAL INTENSITY IS THE THING TO WATCH with no shadows and four lights.
    // Over about 1.4 across the rig, small pale parts — a crista top, a
    // vesicle — clip to white and every organelle under a certain size stops
    // having a colour. Raise one light here and lower another.
    box.scene.add(new THREE.HemisphereLight(0xf4f8ff, 0xe8cbb8, 0.55));
    const key = new THREE.DirectionalLight(0xfff4ea, 0.55);
    key.position.set(14, 22, 16);
    box.scene.add(key, key.target);
    const fill = new THREE.DirectionalLight(0xdbe6ff, 0.25);
    fill.position.set(-14, 6, -10);
    box.scene.add(fill, fill.target);
    // Rim from behind and below, so an organelle's silhouette survives against
    // the one behind it now that nothing separates them by contact shadow.
    const rim = new THREE.DirectionalLight(0xffffff, 0.2);
    rim.position.set(-2, -8, -16);
    box.scene.add(rim, rim.target);

    /* camera flights, in Stage's turntable terms (as tree.js) */
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
    const goHome = () => {
      // Back to five organelles in a cell, which is the drawing that reads at
      // this distance. The detailed build is cached, so a second visit is free.
      if (sim && sim.state().detail === 'auto') for (const m of sim.mitochondria) sim.mitoDetail(m, false);
      flyTo(home.pos, home.target);
    };
    /* HOW CLOSE, for the parts whose mesh is not one object. A bounding
       sphere is the right size for a nucleus and useless for the ribosome
       sheet or the membrane bowl: both wrap the whole cell, so 2.6 radii
       away is further out than home. These say how big ONE of the thing is,
       and the anchor says where to look. Scene units. */
    const ZOOM_R = { membrane: 2.2, ribosome: 1.2 };
    function focusOn(org, name) {
      const n = name || (org && org.userData.organelle);
      /* THE FLIGHT IS WHAT RAISES THE DETAIL. A mitochondrion is the only
         organelle here whose insides are a different drawing close up, and
         'auto' means the reader never asks for it: they click one, they
         arrive, and it has membranes. */
      if (sim.state().detail === 'auto' && n === 'mitochondrion') sim.mitoDetail(org, true);
      const at = ZOOM_R[n] && sim.anchors[n] && sim.anchors[n]();
      const centre = at ? at.clone() : sim.bounds(org).center;
      const radius = ZOOM_R[n] || sim.bounds(org).radius;
      const dist = Math.max(radius * 2.6, 3.5);
      const dir = box.camera.position.clone().sub(centre).normalize();
      flyTo(centre.clone().addScaledVector(dir, dist).toArray(), centre.toArray());
    }
    // A slow turn that yields to the reader for five seconds after any touch.

    /* pointer: hover lights, a still click on an organelle flies, a drag is Stage's; background does nothing */
    let ndc = null, down = null;
    const canvas = box.canvas;
    const toNdc = e => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    /* clickToFly:false keeps hover and 'pick' and drops the flights, for a
       page whose camera is scripted: a click that flew would fight it. */
    const clickToFly = params.clickToFly !== false;
    canvas.addEventListener('pointermove', e => { ndc = toNdc(e); canvas.style.cursor = sim && clickToFly && sim.pick(ndc) ? 'pointer' : 'grab'; });
    canvas.addEventListener('pointerleave', () => { ndc = null; });
    canvas.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; fly.active = false; });
    canvas.addEventListener('pointerup', e => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
      const hit = sim.pick(toNdc(e));
      if (hit) { if (clickToFly) focusOn(hit); sim.emit('pick', hit.userData.organelle); }
    });
    canvas.addEventListener('dblclick', () => { if (clickToFly) goHome(); });

    sim = create(THREE, box.root, box.camera, params);
    box.pump();
    nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, facings: sim.facings, library: sim.library }) : null;

    const api = {
      sim, box, flyTo, home: goHome, focusOn,
      /* The camera half of an anchor. There is no fixed pose per part here
         the way a leaf has one: an organelle is a small thing somewhere in a
         bowl, so "where is it?" is answered by flying to the organelle
         itself, which is the same flight a click on it makes. */
      lookAt(name) { const o = sim.organelles.find(x => x.userData.organelle === name && x.parent); if (o) focusOn(o, name); return api; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => (nb ? nb.list() : []),
      layers: sim.layers, palette: sim.palette,
      show(n, on) { sim.show(n, on); if (!box.running) box.draw(); return api; },
      set(next, opts) { sim.set(next, opts); return api; },
      state: () => sim.state(),
      on: sim.on,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy: box.destroy,
    };
    return api;
  }

  global.AnimalCell = { create, mount, DEFAULTS, HOME };
  /* Scale (kit/scale.js). PROP TIER AND NOT A SCALE, as the
     header says: unit is null, so nothing may print a length off this render.
     How big a cell really is belongs on the library card as prose. Ribosomes
     cannot be drawn beside a nucleus at their own size; that factor is the
     declared exaggeration. */
  global.AnimalCell.SCALE = { rung: 'cell', form: 'single', unit: null, exag: { ribosome: 30, mitochondrion: 2 },
    /* Where a zoom hands off. `detail:'auto'` already resolves a
       mitochondrion's membranes in place; the component one rung down is
       where it becomes the subject. */
    down: { mitochondrion: 'Mitochondrion' } };
})(typeof globalThis !== 'undefined' ? globalThis : this);
