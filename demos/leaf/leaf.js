/* =============================================================================
 *  leaf/leaf.js — a leaf in cross-section, built from a seed
 * =============================================================================
 *  Five tissue layers on a block: lower epidermis with stomata, spongy
 *  mesophyll with a vascular bundle through it, palisade mesophyll, upper
 *  epidermis, cuticle. Every cell is placed by a seeded generator, so the
 *  same seed is the same leaf and "regenerate" is a new seed.
 *
 *  This is the cell-and-tissue scale of the component library, and the first
 *  that is not a molecule: nothing here is measured, the proportions are a
 *  textbook diagram's, and it says so. Prop tier.
 *
 *      Leaf.create(THREE, root, camera, opts)     the model: root is yours
 *      Leaf.mount(el, params)                     one box, one handle
 *
 *  Params, all live through set(next, {snap}). explode, aperture and the
 *  isolate fade GLIDE; a caller following a drag passes {snap:true} so the
 *  value tracks the thumb. Anything that rebuilds geometry snaps regardless.
 *
 *  Params:
 *      explode     0..1, the layers lifted apart
 *      seed        integer; changing it rebuilds
 *      isolate     a layer name to keep opaque while the rest fade, or null
 *      autoRotate  the block turns slowly
 *      aperture    0..1, the stomata shut to open. Turgid guard cells bow
 *                  apart; drained, they meet and the pore closes.
 *      flows       {co2, o2, vapour, sap} each 0..1, drawn as real molecules.
 *                  The three that pass a pore are MULTIPLIED BY `aperture`,
 *                  so shutting the stomata stops the gas exchange and leaves
 *                  the sap running. That trade is the lesson.
 *      layers      heights in scene units: {cuticle, upperEpi, palisade,
 *                  spongy, lowerEpi}; changing one rebuilds
 *      width, depth   the block, x and z
 *
 *  Layer names, bottom to top: lowerEpi · spongy · bundle · palisade ·
 *  upperEpi. The bundle explodes with the spongy layer it runs through.
 *
 *  state(): {explode, seed, isolate, aperture, flows, hovered, layers:[{name, y, height}]}
 *  Events: 'hover' (name | null) · 'select' (name | null) · 'frame' (state)
 *
 *  The capsule and rounded box come from lib/geo.js, not from three, so
 *  load it first.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = {
    explode: 0, seed: 1337, isolate: null, autoRotate: false, aperture: 1,
    flows: { co2: 0, o2: 0, vapour: 0, sap: 0 },
    layers: { cuticle: 0.12, upperEpi: 0.7, palisade: 2.4, spongy: 2.6, lowerEpi: 0.7 },
    width: 14, depth: 7,
  };
  const ORDER = ['lowerEpi', 'bundle', 'spongy', 'palisade', 'upperEpi'];

  /* A pose per part that cannot be seen from the default camera. The stomata
     are on the UNDERSIDE, so pointing at one from above puts a label on a
     surface the student is looking at the back of; the answer to "where is
     it?" has to include turning the leaf over. Only the parts that need one
     are listed: a part already in frame should not move the camera, and a
     component that flies on every chip is seasick. */
  const VIEWS = {
    stoma:    { theta: 0.65, phi: 2.45, r: 28 },
    lowerEpi: { theta: 0.65, phi: 2.30, r: 28 },
  };

  const capsule = (T, ...a) => global.Geo.capsule(T, ...a);
  const roundedBox = (T, ...a) => global.Geo.roundedBox(T, ...a);

  /* ---- the leaf's colours ----
     ONE table, read by both the materials and palette(), so the legend cannot
     name a colour the model does not have.

     They are saturated on purpose. Three's lights are not physical units and
     the studio fill this scene inherits is bright, so a colour picked to look
     right as a hex swatch renders a stop paler and a stop greyer than it reads
     here; the epidermis in particular went grey. Judge these on screen, never
     in the file. The epidermis is a LIVING layer, not a wall: pale green, not
     the bone colour a cell wall would be. */
  const C = {
    epiWall:      0xc2dda2,     // the wall between epidermal cells, a shade greener
    epiCell:      0xd6e9bd,     // pale mint: an epidermal cell is nearly clear
    cuticle:      0x7ab469,     // the waxy sheet, the one saturated green on top
    palisade:     0x9cc264,     // pale, like the reference: these are not gold
    palisadeBand: 0x6e9c46,
    spongy:       0xb9d07e,     // a shade yellower than palisade, and rounder
    spongyDark:   0x9cb865,
    chloro:       0x37701f,     // the dots inside a cell, dark enough to count
    sheath:       0xf0dd77,     // yellow, and the vein reads outward from it:
    sheathInner:  0xdcc55a,
    xylem:        0x6fa3ca,     // water blue, the site's own convention
    phloem:       0xdc6f66,     // sugar red
    guard:        0x6ea84f,     // green against the paler epidermis it sits in
  };

  /* Named for the legend. Two materials that are one thing to a student (the
     epidermis wall and its cell) get one entry. */
  const LEGEND = [
    ['epidermis', 'epiCell'], ['cuticle', 'cuticle'], ['palisade cell', 'palisade'],
    ['spongy cell', 'spongy'], ['chloroplast', 'chloro'], ['bundle sheath', 'sheath'],
    ['xylem', 'xylem'], ['phloem', 'phloem'], ['guard cell', 'guard'],
  ];


  /* ---- the traffic ----
     A leaf's job is traffic, so the flows are the point of the model and the
     tissues are the setting. Four of them: CO2 in, O2 out, water vapour out
     (all three through the stomata), and sap along the vein.

     THEY ARE DRAWN AS MOLECULES, WITH THEIR ATOMS. A coloured dot needs a key;
     linear O=C=O and a bent water do not, and a student who has met them in a
     molecule lesson meets the same shapes here. It also makes the exchange
     legible as chemistry rather than as two colours of traffic.

     THE SIZE IS A LIE, AND A DECLARED ONE. An epidermal cell
     is drawn 0.85 units and is really about 30 um, so a unit is roughly 35 um
     here; a CO2 molecule is about 0.33 nm across and is drawn 0.5 units, or
     about 18 um. That is some 53,000x, which is in SCALE.exag so a page reads
     it rather than guessing. The size was chosen by looking: below this a
     molecule is a speck at the default framing and the shape — the whole
     reason for drawing atoms at all — is lost. These are pictograms with the
     right shape, not molecules to scale, and `unit` stays null so nothing can
     print a size off any of it.

     Atom colours come from palette.js, never typed (CLAUDE.md), so a CO2 here
     and a CO2 in a molecule lesson are the same red and the same grey. */
  const MOL_SCALE = 0.12;           // molecule units -> leaf units; see above
  const MOL_EXAG = 53000;

  /* Real geometry, in the same stylised units every molecule spec uses: bond
     lengths in angstroms, display radii from the palette. */
  const SPECIES = {
    co2: [['C', 0, 0, 0], ['O', 1.16, 0, 0], ['O', -1.16, 0, 0]],
    o2:  [['O', 0.60, 0, 0], ['O', -0.60, 0, 0]],
    /* Bent, 104.5 degrees, which is the whole reason water behaves as it does
       and the one thing a student should be able to see at a glance. */
    h2o: (() => { const a = (104.5 / 2) * Math.PI / 180, d = 0.96;
      return [['O', 0, 0, 0],
              ['H', Math.sin(a) * d, Math.cos(a) * d, 0],
              ['H', -Math.sin(a) * d, Math.cos(a) * d, 0]]; })(),
  };

  /* One merged geometry per species, with a colour per vertex so all three
     species share one material and one draw call each. Geo.merge carries
     position/normal/uv only, so the colours are written here from the same
     part list it was given. */
  function moleculeGeometry(THREE, atoms) {
    const P = global.MolPalette;
    /* NON-INDEXED FIRST, and count from that. Geo.merge un-indexes what it is
       handed, which multiplies a sphere's vertex count by three; counting the
       indexed geometry instead left most of the colour array at zero, and an
       unwritten vertex colour is BLACK. It rendered as soot over every
       molecule and looked like a lighting fault. */
    const parts = atoms.map(([el, x, y, z]) => {
      const g = new THREE.SphereGeometry((P.radii[el] || 0.8) * MOL_SCALE, 8, 6).toNonIndexed();
      g.translate(x * MOL_SCALE, y * MOL_SCALE, z * MOL_SCALE);
      return g;
    });
    const counts = parts.map(g => g.attributes.position.count);
    const geo = global.Geo.merge(THREE, parts);
    const col = new Float32Array(geo.attributes.position.count * 3);
    const c = new THREE.Color();
    let o = 0;
    atoms.forEach(([el], i) => {
      c.setHex(P.atoms[el]);
      for (let v = 0; v < counts[i]; v++) { col[o++] = c.r; col[o++] = c.g; col[o++] = c.b; }
    });
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return geo;
  }

  /* A stream of molecules along per-particle curves. Tree has the same idea
     with anonymous dots (tree/tree.js's ParticleFlow); this one carries a
     shape and a gate. Kept here rather than shared until a third caller wants
     it — two implementations is a duplicate, one abstraction over two callers
     is a guess.

     `gate` is what makes the stomata mean something: a flow through a pore is
     multiplied by the aperture, so closing the stomata stops the gas exchange
     and leaves the sap running. That is the trade the lesson is about. */
  class MoleculeFlow {
    constructor(THREE, { geo, count = 26, speed = [0.10, 0.22], makePath, gate = null }) {
      this.count = count; this.speed = speed; this.makePath = makePath; this.gate = gate;
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
      this.mesh = new THREE.InstancedMesh(geo, mat, count);
      this.mesh.frustumCulled = false; this.mesh.visible = false;
      this.particles = Array.from({ length: count }, () => ({
        t: Math.random(), speed: speed[0] + Math.random() * (speed[1] - speed[0]),
        rank: Math.random(), curve: null,
        spin: [Math.random() * 6.28, Math.random() * 6.28, (Math.random() - 0.5) * 1.6] }));
      this.intensity = 0; this.level = 0;
      this._d = new THREE.Object3D(); this._v = new THREE.Vector3();
    }
    setIntensity(v) { this.intensity = v < 0 ? 0 : v > 1 ? 1 : v; }
    update(dt) {
      const want = this.intensity * (this.gate ? this.gate() : 1);
      if (this.level < 0.002 && want < 0.002) { this.mesh.visible = false; return; }
      this.level += (want - this.level) * Math.min(1, dt * 2.5);
      if (want === 0 && this.level < 0.002) this.level = 0;
      this.mesh.visible = true;
      const d = this._d, v = this._v;
      for (let i = 0; i < this.count; i++) {
        const p = this.particles[i];
        if (!p.curve) p.curve = this.makePath();
        p.t += dt * p.speed;
        if (p.t >= 1) { p.t -= 1; p.curve = this.makePath(); }
        /* Ranked, so turning a flow down thins the stream instead of shrinking
           every molecule in it: a half-open stoma passes fewer molecules, not
           smaller ones. */
        const vis = this.level * 1.12 - p.rank > 0 ? 1 : 0;
        p.curve.getPoint(p.t, v);
        d.position.copy(v);
        d.rotation.set(p.spin[0] + p.t * p.spin[2] * 6, p.spin[1] + p.t * p.spin[2] * 4, 0);
        d.scale.setScalar(vis ? 1 : 1e-4);
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  function create(THREE, root, camera, opts = {}) {
    const P = Object.assign({}, DEFAULTS, opts);
    P.layers = Object.assign({}, DEFAULTS.layers, opts.layers || {});
    P.flows = Object.assign({}, DEFAULTS.flows, opts.flows || {});
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'Leaf ' + ev);

    let seed = P.seed >>> 0;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    const rrange = (a, b) => a + (b - a) * rand();

    /* One material set PER LAYER, so isolating the upper epidermis cannot dim
       the lower one through a shared material.

       Clearcoat is nearly off. It lays a white specular sheen over everything
       it touches, and on thirteen materials at once that sheen IS the washed
       out look; the wet-cell highlight is worth about a tenth of what it was. */
    function mats() {
      const mat = (color, o = {}) => new THREE.MeshPhysicalMaterial(Object.assign(
        { color, roughness: 0.62, metalness: 0, clearcoat: 0.06, clearcoatRoughness: 0.6 }, o));
      return {
        epiWall: mat(C.epiWall, { roughness: 0.55 }),
        epiCell: mat(C.epiCell, { roughness: 0.5, clearcoat: 0.12 }),
        cuticle: mat(C.cuticle, { transparent: true, opacity: 0.34, roughness: 0.08, clearcoat: 0.55, clearcoatRoughness: 0.1 }),
        palisade: mat(C.palisade, { roughness: 0.55 }),
        palisadeBand: mat(C.palisadeBand, { roughness: 0.65 }),
        spongy: mat(C.spongy, { roughness: 0.7 }),
        spongyDark: mat(C.spongyDark, { roughness: 0.72 }),
        chloro: mat(C.chloro, { roughness: 0.62 }),
        sheath: mat(C.sheath, { roughness: 0.45, clearcoat: 0.15 }),
        sheathInner: mat(C.sheathInner, { roughness: 0.55 }),
        xylem: mat(C.xylem, { roughness: 0.4, clearcoat: 0.15 }),
        phloem: mat(C.phloem, { roughness: 0.5 }),
        guard: mat(C.guard, { roughness: 0.45, clearcoat: 0.15 }),
      };
    }
    /* Flags only. The mount enables no shadow map (see its lighting note), so
       these do nothing today; they are set at build so a page that does turn
       one on gets every mesh right without walking the tree. */
    const shadow = m => { m.castShadow = true; m.receiveShadow = true; return m; };

    const block = new THREE.Group();
    root.add(block);
    const layers = {};
    /* The guard-cell pairs, kept so aperture is a move rather than a rebuild:
       a leaf that regenerates its cells every time a stoma breathes reads as
       a glitch, and rebuilding a few hundred capsules per frame would stutter. */
    const stomata = [];

    /* The params that glide, and how long each takes. A value a STEP sets is a
       move the student is meant to watch; a value they are DRAGGING has to
       track the thumb, so set({...}, {snap:true}) is the slider's path.
       Anything that rebuilds geometry — seed, layer heights, width, depth —
       cannot be tweened across and is not in here. */
    const tw = global.CardStage.tweens();
    const GLIDE = { aperture: 0.8, explode: 0.9, dim: 0.35 };
    let dim = 0;                  // 0..1, how far the un-isolated layers have faded
    let Y = {}, W = P.width, D = P.depth, bundle = null;

    function layer(name, baseY) {
      const g = new THREE.Group();
      g.userData.name = name; g.userData.baseY = baseY; g.userData.M = mats();
      layers[name] = g; block.add(g);
      return g;
    }

    function buildEpidermis(g, y, h, top) {
      const M = g.userData.M;
      const cellW = 0.85, cellD = 0.85;
      const nx = Math.round(W / cellW), nz = Math.round(D / cellD);
      const wall = roundedBox(THREE, cellW * 0.96, h, cellD * 0.96, 3, 0.16);
      const inner = roundedBox(THREE, cellW * 0.7, h * 0.62, cellD * 0.7, 3, 0.14);
      const wallMesh = new THREE.InstancedMesh(wall, M.epiWall, nx * nz);
      const innerMesh = new THREE.InstancedMesh(inner, M.epiCell, nx * nz);
      const dummy = new THREE.Object3D();
      let i = 0;
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const x = -W / 2 + (ix + 0.5) * cellW + rrange(-0.04, 0.04);
        const z = -D / 2 + (iz + 0.5) * cellD + rrange(-0.04, 0.04);
        const wave = Math.sin(x * 0.55) * 0.12 * (top ? 1 : 0.6);
        dummy.position.set(x, y + h / 2 + wave, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, rrange(0.92, 1.06), 1);
        dummy.updateMatrix();
        wallMesh.setMatrixAt(i, dummy.matrix);
        innerMesh.setMatrixAt(i, dummy.matrix);
        i++;
      }
      g.add(shadow(wallMesh), shadow(innerMesh));
      if (top) {
        const cut = new THREE.Mesh(roundedBox(THREE, W + 0.2, P.layers.cuticle, D + 0.2, 2, 0.05), M.cuticle);
        cut.position.set(0, y + h + P.layers.cuticle / 2 + 0.06, 0);
        cut.userData.layer = 'cuticle';
        g.add(cut);
      } else {
        /* Stomata: two guard cells joined at their ends, the pore the lens
           their bowed inner faces leave. Real density is a few hundred per
           mm²; this is enough to read as a pattern.

           SCATTERED, NOT OVERLAPPING. Placed by rejection against the ones
           already down: unchecked, two stomata land on top of each other and
           read as one four-celled thing that is not any structure a leaf has.
           A capped try count, so a crowded seed thins out rather than hangs. */
        const count = Math.round(W * D * 0.14);
        const placed = [];
        const guardGeo = guardGeometry();      // one shape, shared; see applyAperture
        for (let s = 0; s < count; s++) {
          let x = 0, z = 0, ok = false;
          for (let t = 0; t < 30 && !ok; t++) {
            x = rrange(-W / 2 + 0.7, W / 2 - 0.7);
            z = rrange(-D / 2 + 0.7, D / 2 - 0.7);
            ok = placed.every(p => (p[0] - x) ** 2 + (p[1] - z) ** 2 > STOMA_PITCH * STOMA_PITCH);
          }
          if (!ok) continue;
          placed.push([x, z]);
          const st = new THREE.Group();
          st.position.set(x, y - 0.02, z);
          st.rotation.y = rrange(0, Math.PI);
          for (const side of [-1, 1]) {
            const gm = shadow(new THREE.Mesh(guardGeo, M.guard));
            gm.rotation.y = side < 0 ? Math.PI : 0;      // the mirror, without a negative scale
            gm.userData.side = side;
            st.add(gm);
          }
          stomata.push(st);
          g.add(st);
        }
      }
    }

    function buildPalisade(g, y, h) {
      const M = g.userData.M;
      const r = 0.28, sx = 0.66, sz = 0.66;
      const nx = Math.floor(W / sx), nz = Math.floor(D / sz);
      const geo = capsule(THREE, r, h - 2 * r, 4, 12);
      const bandGeo = new THREE.TorusGeometry(r * 0.98, 0.045, 6, 18);
      const mesh = new THREE.InstancedMesh(geo, M.palisade, nx * nz);
      const per = 5;
      const bands = new THREE.InstancedMesh(bandGeo, M.palisadeBand, nx * nz * per);
      const dummy = new THREE.Object3D();
      let i = 0, b = 0;
      for (let ix = 0; ix < nx; ix++) for (let iz = 0; iz < nz; iz++) {
        const x = -W / 2 + (ix + 0.5) * sx + (iz % 2 ? sx * 0.25 : 0) + rrange(-0.05, 0.05);
        const z = -D / 2 + (iz + 0.5) * sz + rrange(-0.05, 0.05);
        if (x > W / 2 - r) continue;
        const hh = h * rrange(0.9, 1.0), tilt = rrange(-0.05, 0.05);
        dummy.position.set(x, y + h / 2, z);
        dummy.rotation.set(tilt, 0, rrange(-0.05, 0.05));
        dummy.scale.set(rrange(0.9, 1.05), hh / h, rrange(0.9, 1.05));
        dummy.updateMatrix();
        mesh.setMatrixAt(i++, dummy.matrix);
        for (let k = 0; k < per; k++) {
          const t = (k + 0.5) / per + rrange(-0.05, 0.05);
          dummy.position.set(x, y + r + (hh - 2 * r) * t, z);
          dummy.rotation.set(Math.PI / 2 + tilt, 0, 0);
          dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          bands.setMatrixAt(b++, dummy.matrix);
        }
      }
      mesh.count = i; bands.count = b;
      bands.userData.layer = 'chloroplasts';
      g.add(shadow(mesh), shadow(bands));
    }

    function buildSpongy(g, y, h) {
      const M = g.userData.M;
      const cellGeo = new THREE.SphereGeometry(1, 14, 10);
      const chloroGeo = new THREE.SphereGeometry(0.075, 6, 5);
      const placed = [];
      for (let a = 0; a < 9000; a++) {
        const rx = rrange(0.3, 0.6), ry = rrange(0.24, 0.42), rz = rrange(0.3, 0.6);
        const x = rrange(-W / 2 + rx, W / 2 - rx), z = rrange(-D / 2 + rz, D / 2 - rz);
        const yy = rrange(y + ry * 0.9, y + h - ry * 0.9);
        if (Math.hypot(x - bundle.x, yy - bundle.y) < bundle.r + Math.max(rx, ry) * 0.9) continue;
        let ok = true;
        for (const p of placed) {
          const ddx = p.x - x, ddy = p.y - yy, ddz = p.z - z;
          const minD = (p.r + Math.max(rx, rz)) * 0.62;
          if (ddx * ddx + ddy * ddy + ddz * ddz < minD * minD) { ok = false; break; }
        }
        if (ok) placed.push({ x, y: yy, z, r: Math.max(rx, rz), rx, ry, rz });
      }
      const cells = new THREE.InstancedMesh(cellGeo, M.spongy, placed.length);
      const dark = new THREE.InstancedMesh(cellGeo, M.spongyDark, placed.length);
      const chloro = new THREE.InstancedMesh(chloroGeo, M.chloro, placed.length * 8);
      const dummy = new THREE.Object3D();
      let ci = 0, di = 0, ch = 0;
      for (const p of placed) {
        dummy.position.set(p.x, p.y, p.z);
        dummy.rotation.set(rrange(0, 3), rrange(0, 3), rrange(0, 3));
        dummy.scale.set(p.rx, p.ry, p.rz);
        dummy.updateMatrix();
        if (rand() < 0.35) dark.setMatrixAt(di++, dummy.matrix); else cells.setMatrixAt(ci++, dummy.matrix);
        for (let k = 0; k < 8; k++) {
          const th = rrange(0, Math.PI * 2), ph = Math.acos(rrange(-1, 1));
          dummy.position.set(p.x + p.rx * 0.95 * Math.sin(ph) * Math.cos(th),
                             p.y + p.ry * 0.95 * Math.cos(ph),
                             p.z + p.rz * 0.95 * Math.sin(ph) * Math.sin(th));
          dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
          dummy.updateMatrix();
          chloro.setMatrixAt(ch++, dummy.matrix);
        }
      }
      cells.count = ci; dark.count = di; chloro.count = ch;
      chloro.userData.layer = 'chloroplasts';
      g.add(shadow(cells), shadow(dark), shadow(chloro));
    }

    function buildBundle(g) {
      const M = g.userData.M;
      const len = D + 0.3;
      const sheath = shadow(new THREE.Mesh(new THREE.CylinderGeometry(bundle.r, bundle.r, len, 40, 1), M.sheath));
      sheath.rotation.x = Math.PI / 2; sheath.position.set(bundle.x, bundle.y, 0);
      g.add(sheath);
      const bumpGeo = new THREE.SphereGeometry(0.16, 8, 6);
      const n = 26, rows = Math.round(len / 0.32);
      const bumps = new THREE.InstancedMesh(bumpGeo, M.sheathInner, n * rows);
      const dummy = new THREE.Object3D();
      let bi = 0;
      for (let rw = 0; rw < rows; rw++) for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI * 2 + (rw % 2) * (Math.PI / n);
        dummy.position.set(bundle.x + Math.cos(a) * bundle.r, bundle.y + Math.sin(a) * bundle.r, -len / 2 + (rw + 0.5) * 0.32);
        dummy.scale.set(1, 1, 1.2); dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        bumps.setMatrixAt(bi++, dummy.matrix);
      }
      g.add(shadow(bumps));
      const core = new THREE.Mesh(new THREE.CylinderGeometry(bundle.r * 0.8, bundle.r * 0.8, len + 0.02, 40, 1), M.sheathInner);
      core.rotation.x = Math.PI / 2; core.position.set(bundle.x, bundle.y, 0);
      g.add(core);
      /* Xylem above, phloem below, as in a leaf vein: xylem faces the upper
         side. Hex-packed tubes, the xylem's wider. */
      const tubeGeo = new THREE.CylinderGeometry(1, 1, len + 0.06, 10, 1);
      const xy = [], ph = [], rr = bundle.r * 0.8, step = 0.19;
      for (let j = -8; j <= 8; j++) for (let i = -8; i <= 8; i++) {
        const px = (i + (j % 2 ? 0.5 : 0)) * step, py = j * step * 0.87, d = Math.hypot(px, py);
        if (py > 0.1) { if (d < rr - 0.12) xy.push([px, py, step * 0.5 * rrange(0.85, 1)]); }
        else if (py < -0.05) { if (d < rr - 0.12) ph.push([px, py, step * 0.36 * rrange(0.8, 1)]); }
      }
      const xylem = new THREE.InstancedMesh(tubeGeo, M.xylem, xy.length);
      const phloem = new THREE.InstancedMesh(tubeGeo, M.phloem, ph.length);
      const fill = (mesh, arr) => arr.forEach(([px, py, r], idx) => {
        dummy.position.set(bundle.x + px, bundle.y + py, 0);
        dummy.rotation.set(Math.PI / 2, 0, 0); dummy.scale.set(r, 1, r);
        dummy.updateMatrix();
        mesh.setMatrixAt(idx, dummy.matrix);
      });
      fill(xylem, xy); fill(phloem, ph);
      g.add(shadow(xylem), shadow(phloem));
    }

    function dispose(g) {
      g.traverse(o => { if (o.isMesh) { o.geometry.dispose(); } });
      for (const k in g.userData.M) g.userData.M[k].dispose();
    }

    function build() {
      for (const k in layers) { block.remove(layers[k]); dispose(layers[k]); delete layers[k]; }
      stomata.length = 0;                     // rebuilt with the lower epidermis
      seed = P.seed >>> 0;
      W = P.width; D = P.depth;
      const H = P.layers;
      Y = { lowerEpi: 0 };
      Y.spongy = Y.lowerEpi + H.lowerEpi;
      Y.palisade = Y.spongy + H.spongy;
      Y.upperEpi = Y.palisade + H.palisade;
      Y.cuticle = Y.upperEpi + H.upperEpi;
      bundle = { x: 2.2, y: Y.spongy + H.spongy * 0.5, r: Math.min(1.15, H.spongy * 0.44) };
      buildEpidermis(layer('upperEpi', Y.upperEpi), Y.upperEpi, H.upperEpi, true);
      buildPalisade(layer('palisade', Y.palisade), Y.palisade, H.palisade);
      buildSpongy(layer('spongy', Y.spongy), Y.spongy, H.spongy);
      buildBundle(layer('bundle', Y.spongy));
      buildEpidermis(layer('lowerEpi', Y.lowerEpi), Y.lowerEpi, H.lowerEpi, false);
      applyExplode(); applyIsolate(); applyHighlight(); applyAperture();
      if (typeof applyVis === 'function') applyVis();
    }

    function applyExplode() {
      ORDER.forEach((n, i) => {
        const g = layers[n]; if (!g) return;
        g.position.y = P.explode * (n === 'bundle' ? 2 : i) * 1.6;
      });
    }
    /* Isolating DESATURATES the rest; it does not fade them. A transparent
       layer stops being a solid thing the isolated one sits inside — the block
       reads as floating parts, and the cells behind show through the cells in
       front. Colour is the channel carrying "this is the one you asked for",
       so colour is what is taken away: the tissue stays, in grey, and the
       isolated layer is the only thing left that is a colour.

       `dim` is how far that has run, so it is a drain rather than a slam. */
    const _c = new THREE.Color();
    function applyIsolate() {
      for (const n in layers) {
        const out = !!P.isolate && n !== P.isolate ? dim : 0;
        const M = layers[n].userData.M;
        for (const k in M) {
          const mm = M[k];
          if (!mm.userData.base) mm.userData.base = mm.color.clone();
          const b = mm.userData.base;
          /* Toward the colour's own luminance, so a dark chloroplast greys
             dark and a pale epidermis greys pale: the layer keeps its form. */
          const l = 0.299 * b.r + 0.587 * b.g + 0.114 * b.b;
          _c.setRGB(l, l, l).multiplyScalar(0.94);
          mm.color.copy(b).lerp(_c, out * 0.88);
        }
      }
    }
    let hovered = null;
    /* Hover lifts a layer by a fraction of ITS OWN colour, not by a fixed
       emissive. A flat one is a fixed amount of light added to whatever is
       there: on the dark chloroplasts it is a nudge and on the pale epidermis
       it is a blowout, and with no tone mapping to roll it off the pale cells
       simply clip to white. A fraction keeps the hue too, so a hovered green
       cell glows green rather than going grey. */
    const HOVER = 0.07;
    function applyHighlight() {
      for (const n in layers) {
        const M = layers[n].userData.M;
        for (const k in M) {
          const mm = M[k];
          if (n === hovered) mm.emissive.copy(mm.userData.base || mm.color).multiplyScalar(HOVER);
          else mm.emissive.setHex(0x000000);
        }
      }
    }

    /* Height of the whole block, for a caller framing it. */
    const height = () => Y.cuticle + P.layers.cuticle + P.explode * 4 * 1.6;

    /* ---- pointing ---- */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2(-2, -2);
    function layerOf(obj) { let o = obj; while (o && !o.userData.name) o = o.parent; return o ? o.userData.name : null; }
    function point(ndcX, ndcY) { pointer.set(ndcX, ndcY); }
    function pick() {
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(block.children, true);
      const name = hits.length ? layerOf(hits[0].object) : null;
      if (name !== hovered) { hovered = name; applyHighlight(); emit('hover', hovered); }
      return hovered;
    }
    /* CLICKING THE SELECTED LAYER AGAIN KEEPS IT. A click on the thing you are
       already looking at reads as "yes, this one", not as undo, and on a block
       of small cells it is easy to click the same layer twice without meaning
       anything by it. Clearing is what the BACKGROUND is for — `select(null)`,
       which the mount sends when a click hits nothing. */
    function select(next = hovered) {
      if (next === P.isolate) return next;
      set({ isolate: next || null });
      emit('select', next || null);
      return next || null;
    }

    /* ---- the flows ----
       Paths are built per particle and rebuilt each lap, so they follow the
       block as it explodes rather than being baked at build time — the same
       rule the anchors follow, for the same reason.

       Every gas path runs through a STOMA, chosen from the ones on stage, so
       the traffic and the pore the student just opened are the same place. */
    const _fp = new THREE.Vector3();
    const stomaWorld = () => {
      if (!stomata.length) return _fp.set(0, 0, 0).clone();
      return stomata[(Math.random() * stomata.length) | 0].getWorldPosition(new THREE.Vector3());
    };
    /* A point loose in the spongy layer's air spaces, which is where the
       exchange actually happens: gas reaches a cell through the gaps, not
       through the tissue. */
    const spongyWorld = () => {
      const g = layers.spongy;
      const y = (Y.spongy || 0) + P.layers.spongy * (0.25 + Math.random() * 0.6);
      const v = new THREE.Vector3(rrange(-W / 2 + 1, W / 2 - 1), y, rrange(-D / 2 + 1, D / 2 - 1));
      return g ? g.localToWorld(v) : block.localToWorld(v);
    };
    const outsideBelow = p => new THREE.Vector3(p.x + rrange(-1.6, 1.6), p.y - rrange(2.2, 5), p.z + rrange(-1.6, 1.6));
    const curve = pts => new THREE.CatmullRomCurve3(pts);

    const PATHS = {
      co2:    () => { const s0 = stomaWorld(); return curve([outsideBelow(s0), s0.clone(), spongyWorld()]); },
      o2:     () => { const s0 = stomaWorld(); return curve([spongyWorld(), s0.clone(), outsideBelow(s0)]); },
      vapour: () => { const s0 = stomaWorld(); return curve([spongyWorld(), s0.clone(), outsideBelow(s0)]); },
      /* THE TRANSPIRATION STREAM, which is one journey and not two. Water
         arrives along the vein, LEAVES IT into the air spaces, and evaporates
         there; the vapour flow picks up from the same place and carries it out
         of a stoma. So a sap particle runs down the xylem and then turns off
         into the spongy layer rather than out of the block: it is inside a
         leaf, and the cut faces are where the sample ends, not where the water
         goes. It travels one way, from the petiole end.

         It is the one flow with no pore to pass, which is why it keeps running
         when the stomata shut — and why the water then has nowhere to go. */
      sap:    () => { const g = layers.bundle, y = bundle.y, r = bundle.r * 0.45;
        const a = Math.random() * Math.PI * 2;
        const at = x => { const v = new THREE.Vector3(x, y + Math.cos(a) * r, Math.sin(a) * r);
          return g ? g.localToWorld(v) : block.localToWorld(v); };
        const leaveAt = rrange(-W * 0.15, W * 0.42);
        return curve([at(-W / 2 + 0.4), at(leaveAt - 1.5), at(leaveAt), spongyWorld()]); },
    };
    const FLOW_LABEL = { co2: 'CO₂ in', o2: 'O₂ out', vapour: 'water vapour out', sap: 'sap in the vein' };
    const flows = {};
    /* The three that pass a pore are gated by the aperture; sap is not. */
    const gate = () => Math.max(0, Math.min(1, P.aperture));
    for (const [k, sp] of [['co2', 'co2'], ['o2', 'o2'], ['vapour', 'h2o'], ['sap', 'h2o']]) {
      flows[k] = new MoleculeFlow(THREE, {
        geo: moleculeGeometry(THREE, SPECIES[sp]),
        count: k === 'sap' ? 34 : 26,
        makePath: PATHS[k],
        gate: k === 'sap' ? null : gate,
      });
      root.add(flows[k].mesh);
    }
    const setFlows = f => { for (const k in f) if (flows[k]) { P.flows[k] = f[k]; flows[k].setIntensity(f[k]); } };

    /* ---- the guard cells ----
       A pair joined at both ends, bowing apart in the middle: the pore is the
       lens between their concave faces, not a gap between two sliding rods.
       That is what opening IS, so the aperture is the arc and the ends never
       move. A torus segment is exactly a curved sausage, and holding the arc
       LENGTH fixed while the angle grows bends one cell rather than growing
       it — R = L / arc. Turgid cells are fatter too, so the tube thickens.

       ONE geometry serves every stoma — a couple of hundred vertices built once
       and shared by every mesh, so a glide costs one small buffer per frame
       rather than one per cell. */
    const STOMA_LEN = 0.72, STOMA_PITCH = 1.15;
    function guardGeometry() {
      const a = Math.max(0, Math.min(1, P.aperture));
      const arc = 0.5 + 1.7 * a;
      const R = STOMA_LEN / arc;
      const g = new THREE.TorusGeometry(R, 0.095 + 0.04 * a, 7, 22, arc);
      g.rotateZ(-arc / 2);                 // symmetric about +X: chord on Y, bulge in +X
      g.translate(-R * Math.cos(arc / 2), 0, 0);   // the joined ends at the origin
      g.rotateX(-Math.PI / 2);             // flat in the epidermis
      return g;
    }
    function applyAperture() {
      if (!stomata.length) return;
      const geo = guardGeometry();
      const old = stomata[0].children[0].geometry;
      for (const st of stomata) for (const gm of st.children) gm.geometry = geo;
      if (old !== geo) old.dispose();          // once: every mesh shared it
    }

    function step(dt) {
      tw.update(dt);
      for (const k in flows) flows[k].update(dt);
      if (P.autoRotate) block.rotation.y += dt * 0.25;
      pick();
      const s = state();
      emit('frame', s, dt);
      return s;
    }
    function state() {
      return { explode: P.explode, seed: P.seed, isolate: P.isolate, aperture: P.aperture, hovered, layersShown: layersOf(),
        /* Off the flows, not the params: a step may drive one directly. */
        flows: Object.fromEntries(Object.keys(flows).map(k => [k, flows[k].intensity])),
        layers: ORDER.map(n => ({ name: n, y: (Y[n === 'bundle' ? 'spongy' : n] || 0) + (layers[n] ? layers[n].position.y : 0),
                                  height: n === 'bundle' ? bundle.r * 2 : P.layers[n] })) };
    }
    function set(next, opts = {}) {
      const rebuild = next.seed != null && next.seed !== P.seed
        || next.layers || next.width != null || next.depth != null;
      /* A rebuild throws the geometry away, so nothing can glide across one:
         a leaf dissolving into a different leaf is not a transition. */
      const dur = k => (opts.snap || rebuild ? 0 : GLIDE[k]);
      const from = { explode: P.explode, aperture: P.aperture };

      if (next.layers) P.layers = Object.assign({}, P.layers, next.layers);
      if (next.flows) setFlows(next.flows);
      for (const k of Object.keys(next)) if (k !== 'layers' && k !== 'flows') P[k] = next[k];
      if (rebuild) build();

      if (next.explode != null) tw.to(from.explode, P.explode, dur('explode'),
        v => { P.explode = v; applyExplode(); }, { key: 'explode' });
      if (next.aperture != null) tw.to(from.aperture, P.aperture, dur('aperture'),
        v => { P.aperture = v; applyAperture(); }, { key: 'aperture' });
      if ('isolate' in next) tw.to(dim, P.isolate ? 1 : 0, dur('dim'),
        v => { dim = v; applyIsolate(); }, { key: 'dim' });
      if (rebuild) applyAperture();
    }
    function on(ev, fn) {
      (listeners[ev] || (listeners[ev] = [])).push(fn);
      return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
    }

    /* ---- what can be shown or hidden ---- */
    const vis = { chloroplasts: true, cuticle: true };
    for (const n of ORDER) vis[n] = true;
    /* The flows are layers too, so the show panel offers them as chips and a
       step can name one without knowing they are particles. A flow's chip is
       on/off; a step that wants a half-open stream sets `flows` directly. */
    const FLOW_KEYS = ['co2', 'o2', 'vapour', 'sap'];
    const applyVis = () => {
      for (const n of ORDER) if (layers[n]) layers[n].visible = vis[n];
      block.traverse(o => { if (o.userData.layer) o.visible = vis[o.userData.layer]; });
    };
    const LABEL = { lowerEpi: 'lower epidermis', spongy: 'spongy mesophyll', bundle: 'vein', palisade: 'palisade', upperEpi: 'upper epidermis', chloroplasts: 'chloroplasts', cuticle: 'cuticle' };
    Object.assign(LABEL, FLOW_LABEL);
    const layersOf = () => Object.keys(vis).map(k => ({ name: k, label: LABEL[k], on: vis[k] }))
      .concat(FLOW_KEYS.map(k => ({ name: k, label: LABEL[k], on: flows[k].intensity > 0 })));
    function show(name, on = true) {
      if (FLOW_KEYS.includes(name)) { setFlows({ [name]: on ? 1 : 0 }); return; }
      if (!(name in vis)) { console.warn('leaf.js: no layer named ' + name + '; have ' + Object.keys(vis).concat(FLOW_KEYS).join(', ')); return; }
      vis[name] = !!on; applyVis();
    }
    /* Read off C, never typed again: a swatch that disagrees with the sphere it
       names is a caption the model quietly falsifies. */
    const palette = () => LEGEND.map(([name, key]) =>
      ({ name, color: '#' + C[key].toString(16).padStart(6, '0') }));

    /* Named parts: the front face of each layer, mid-block, following explode. */
    const _a = new THREE.Vector3();
    const layerPoint = n => {
      const g = layers[n]; if (!g) return null;
      const y0 = Y[n === 'bundle' ? 'spongy' : n] || 0;
      const h = n === 'bundle' ? bundle.r * 2 : P.layers[n];
      return g.localToWorld(_a.set(n === 'bundle' ? bundle.x : -W * 0.25, y0 + h / 2, D / 2));
    };
    const anchors = {};
    for (const n of ORDER) anchors[n] = () => layerPoint(n);
    anchors.cuticle = () => layers.upperEpi ? layers.upperEpi.localToWorld(_a.set(-W * 0.25, Y.cuticle + P.layers.cuticle, D / 2)) : null;
    anchors.stoma = () => { const g = layers.lowerEpi; const st = g && g.children.find(o => o.children.length === 2); return st ? st.getWorldPosition(_a) : null; };
    /* Which way a part faces, in world space, so a callout on it fades as it
       turns away. The block rotates, so this is recomputed rather than baked.
       Only the two undersides have one: every other anchor is on the cut face,
       which is what the default camera is looking at. */
    const _f = new THREE.Vector3(), _q = new THREE.Quaternion();
    const faceDown = () => _f.set(0, -1, 0).applyQuaternion(block.getWorldQuaternion(_q));
    const facings = { stoma: faceDown, lowerEpi: faceDown };
    const library = {
      upperEpi: { text: 'upper epidermis', offset: [-40, -28], card: 'One clear layer of cells with no chloroplasts, so light passes straight through to the tissue that uses it.' },
      cuticle:  { text: 'cuticle', offset: [-40, -28], card: 'A waxy coat the epidermis secretes. It is what keeps a leaf from drying out, and why water beads on it.' },
      palisade: { text: 'palisade mesophyll', offset: [-46, -28], card: 'Columns packed with chloroplasts, stood on end under the light. Most of the leaf\'s photosynthesis happens here.' },
      spongy:   { text: 'spongy mesophyll', offset: [-46, 26], card: 'Loose cells with air spaces between them, so CO₂ from the stomata can reach every chloroplast and O₂ can leave.' },
      bundle:   { text: 'vein', offset: [40, -28], card: 'Xylem above brings water up from the roots; phloem below carries sugar away. The sheath around it is a set of cells.' },
      lowerEpi: { text: 'lower epidermis', offset: [-40, 26], card: 'The underside, where the stomata are, out of direct sun so less water is lost through them.' },
      stoma:    { text: 'stoma', offset: [40, 26], card: 'Two guard cells and the pore between them. They swell to open it for CO₂ and close it to keep water in.' },
    };
    build();
    setFlows(P.flows);
    return { step, state, set, on, point, pick, select, flows, setFlows, height, block, layers, anchors, facings, library, params: () => P, ORDER,
      layersOf, show, palette };
  }

  /* ---- one box ----
     Shadows and a hemisphere light are added here because Stage.create's
     studio lights ride on the camera and cast none, and a leaf read as a
     tissue block needs the layers to shade each other. */
  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('leaf.js: load kit/card-stage.js first');
    if (!global.Geo) throw new Error('leaf.js: load lib/geo.js first');
    let leaf = null, last = null, nb = null;
    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0.65, phi: 1.15, r: 24 },
      /* The pitch runs almost to the lower pole: the stomata are on the
         underside, and a leaf you cannot turn over hides a named part. */
      stage: Object.assign({ phiMax: 2.75, rMin: 8, rMax: 60 }, params.stage || {}),
      step: dt => { if (leaf) last = leaf.step(dt); },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    /* ---- lighting, the way water-lab does it ----
       NO SHADOW MAPS. water-lab casts none at all, and that is most of why it
       reads soft: a cast shadow between cells packed this tightly is a black
       wedge, and softening one costs a fill light that flattens everything
       else to pay for it. Form here comes from the normals and from the
       colours, which is enough for a diagram.

       LIGHTS RIDE THE CAMERA, which is Stage's own decision and the reason
       orbiting a water molecule reads as turning the model under a fixed
       studio lamp rather than sweeping a lamp across it. World-fixed lights
       put the leaf's underside in the dark exactly when the student turns it
       over to look at the stomata. So Stage's key and fill are kept, only
       warmed and rebalanced for a green subject, and the leaf adds its own
       key to the CAMERA rather than to the scene.

       Stage's ambient stays high. It is what keeps anything from going to
       black, and dimming it is what made the first pass of these colours look
       like stone. */
    box.renderer.toneMapping = THREE.NoToneMapping;
    box.scene.traverse(o => {
      if (o.isAmbientLight) o.intensity = Math.PI * 0.18;
      else if (o.isDirectionalLight) {
        /* Stage's fill is blue, for a molecule on white paper. On a leaf it
           reads as cold grey in every shadowed face. */
        o.color.set(o.intensity > 0.6 * Math.PI ? 0xfff6e6 : 0xdfeaf2);
        o.intensity *= 0.75;
      }
    });
    /* Sky above, leaf-litter below: the one world-fixed light, because up and
       down are real for a leaf and a hemisphere casts nothing. */
    box.scene.add(new THREE.HemisphereLight(0xeef7e2,0x60724a, Math.PI * 0.38));
    /* On the camera, like Stage's own. Low and to the left of the view, so the
       side of a cell facing away from the key is still modelled. */
    const under = new THREE.DirectionalLight(0xffffff, Math.PI * 0.3);
    under.position.set(-5, -4, 6);
    box.camera.add(under, under.target);

    leaf = create(THREE, box.root, box.camera, params);
    const frame = () => { box.cam.target.set(0, leaf.height() / 2, 0); box.applyCam(); };
    frame();

    /* Pointer in the canvas's own frame: a box is rarely the whole window. */
    const cv = box.canvas;
    const onMove = e => { const b = cv.getBoundingClientRect();
      leaf.point(((e.clientX - b.left) / b.width) * 2 - 1, -((e.clientY - b.top) / b.height) * 2 + 1); };
    const onLeave = () => leaf.point(-2, -2);
    /* A click on empty space clears the selection. `pick()` answers what is
       under the pointer, so nothing under it is the whole test and no extra
       hit-plane is needed.

       A DRAG IS NOT A CLICK, and the browser disagrees: orbiting the block and
       releasing over the background fires `click` like any other, so an orbit
       that happened to end on empty space would throw the selection away. The
       pointer is measured from where it went down, and past a few pixels this
       was a drag. */
    let downAt = null;
    const onDown = e => { downAt = [e.clientX, e.clientY]; };
    const onClick = e => {
      const moved = downAt && Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]);
      downAt = null;
      if (moved > 4) return;
      leaf.select(leaf.pick() || null);
    };
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerleave', onLeave);
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('click', onClick);
    leaf.on('hover', n => { cv.style.cursor = n ? 'pointer' : ''; });
    box.pump();
    nb = global.Notebook ? global.Notebook.create({ box, anchors: leaf.anchors, facings: leaf.facings, library: leaf.library }) : null;

    return {
      sim: leaf, box,
      /* The camera half of an anchor: the panel calls this when a chip turns a
         note on, so "point at the stoma" turns the leaf over to it. */
      views: () => VIEWS,
      lookAt(name, dur) { if (VIEWS[name]) box.flyTo(VIEWS[name], dur); return this; },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      layers: leaf.layersOf, show: (n, on) => { leaf.show(n, on); if (!box.running) box.draw(); return this; }, palette: leaf.palette,
      set(next, opts) { leaf.set(next, opts); if (next.explode != null || next.layers) frame(); return this; },
      state: () => last || leaf.state(),
      on: leaf.on,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() {
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerleave', onLeave);
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('click', onClick);
        box.destroy();
      },
    };
  }

  global.Leaf = { create, mount, DEFAULTS, ORDER, VIEWS };
  /* Scale (kit/scale.js). Bulk cells in tissue layers, at a
     diagram's proportions rather than a measured section: unit is null and no
     page prints a thickness off it. Layer heights in DEFAULTS are scene units. */
  global.Leaf.SCALE = {
    rung: 'tissue', form: 'bulk', unit: null,
    sceneUnits: ['width', 'depth'],       // DEFAULTS' own units, not metres
    /* The molecules in the flows. Real shapes at a size a tissue block can
       show: see MOL_EXAG and the arithmetic beside it. Everything else here
       is drawn at the diagram's own proportions and exaggerates nothing. */
    exag: { co2: MOL_EXAG, o2: MOL_EXAG, vapour: MOL_EXAG },
    down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
