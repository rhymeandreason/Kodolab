/* =============================================================================
 *  tree/tree.js — a tree, the air around it, and where its mass came from
 * =============================================================================
 *  The organism scale of the component library. A procedural oak on a
 *  ground disc under a sun, with the actors the mass-of-a-tree lesson
 *  needs: a person for scale, Van Helmont's potted willow, five particle
 *  flows (CO₂ in, O₂ out, water and minerals up the trunk, ambient air) and
 *  two hundred cubes that fly out of the tree and stack into piles by
 *  origin. Ported from the ES-module prototype, now in attic/tree-prototype/, onto the global three.js and
 *  kit/card-stage.js; lib/geo.js carries its capsule and merge.
 *
 *      Tree.create(THREE, root, camera, opts)   the actors: root is yours
 *      Tree.mount(el, params)                   one box, one handle
 *
 *  Params, live through set():
 *      growth        0..1 of the oak; 1 is the 25 m tree
 *      daylight      0..1, tweened; below 0.5 the page hears 'night'
 *      treeOpacity   0..1, tweened; the oak ghosts so the piles read
 *      potScene      true shows the willow in its pot instead of the oak
 *      flows         { co2, o2, h2o, minerals, ambient } each 0..1
 *      piles         null | 'dry' | 'fresh': the tree taken apart by origin
 *      saplingGrowth 0..1 of the willow
 *
 *  state(): the params as they stand, with the tweened ones at their
 *  current value. Events: 'frame' (state, dt) · 'night' (bool).
 *
 *  mount adds flyTo(pos, target, seconds), a camera flight in Stage's own
 *  theta/phi/r, cancelled by a drag. `viewOffset` is kit/card-stage.js's.
 *
 *  What is NOT physics: the flows are choreography, the piles' shares are
 *  the lesson's numbers (Tree.PILES), and the tree's shape is a random
 *  scaffold. The one measured claim, dry mass from trunk diameter, lives in
 *  the lesson's steps beside its citation.
 * ========================================================================== */
(function (global) {
  'use strict';

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeInOut = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---- the tree: one merged bark mesh + an instanced canopy of leaf blobs ---- */
  function createTree(THREE, { trunkLen = 5, radius = 0.55, depth = 4, seed = 1,
    leafSize = 0.45, leavesPerTip = 4, leafColor = 0x4f8a3c, barkColor = 0x6b4f3a } = {}) {
    const rng = mulberry32(seed);
    const group = new THREE.Group();
    const barkMat = new THREE.MeshStandardMaterial({ color: barkColor, roughness: 0.95 });
    const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 });
    const scaffold = new THREE.Group();
    group.add(scaffold);
    const tips = [], parts = [];
    function branch(parent, len, r, level) {
      const geo = new THREE.CylinderGeometry(r * 0.62, r, len, level === 0 ? 12 : 7, 1);
      geo.translate(0, len / 2, 0);
      const m = new THREE.Mesh(geo);
      parent.add(m); parts.push(m);
      if (level >= depth) { tips.push({ obj: m, len }); return; }
      const n = level === 0 ? 3 : (rng() < 0.55 ? 2 : 3);
      const spin = rng() * Math.PI * 2;
      for (let i = 0; i < n; i++) {
        const pivot = new THREE.Object3D();
        pivot.rotation.order = 'YZX';
        pivot.position.y = len * (level === 0 ? 0.92 : 0.72 + rng() * 0.26);
        pivot.rotation.y = spin + i * (Math.PI * 2 / n) + (rng() - 0.5) * 0.7;
        pivot.rotation.z = 0.42 + rng() * 0.45;
        m.add(pivot);
        branch(pivot, len * (0.62 + rng() * 0.12), r * 0.62, level + 1);
      }
      if (level < depth - 1 && rng() < 0.75) {
        const p = new THREE.Object3D();
        p.rotation.order = 'YZX';
        p.position.y = len * 0.98;
        p.rotation.y = rng() * Math.PI * 2;
        p.rotation.z = (rng() - 0.5) * 0.35;
        m.add(p);
        branch(p, len * 0.7, r * 0.62, level + 1);
      }
    }
    branch(scaffold, trunkLen, radius, 0);
    group.updateMatrixWorld(true);
    const merged = global.Geo.merge(THREE, parts.map(m => m.geometry.clone().applyMatrix4(m.matrixWorld)));
    parts.forEach(m => m.geometry.dispose());
    const wood = new THREE.Mesh(merged, barkMat);
    wood.castShadow = wood.receiveShadow = true;

    const leafBase = [], leafPositions = [];
    const tipV = new THREE.Vector3();
    for (const { obj, len } of tips) {
      obj.localToWorld(tipV.set(0, len, 0));
      for (let k = 0; k < leavesPerTip; k++) {
        const p = tipV.clone().add(new THREE.Vector3(rng() - 0.5, rng() - 0.35, rng() - 0.5).multiplyScalar(len * 1.1));
        leafBase.push({ pos: p, s: leafSize * (0.7 + rng() * 0.7), rot: new THREE.Euler(rng() * 3, rng() * 3, rng() * 3) });
        leafPositions.push(p);
      }
    }
    group.remove(scaffold);
    const leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), leafMat, leafBase.length);
    leaves.castShadow = leaves.receiveShadow = true;
    const c = new THREE.Color(), base = new THREE.Color(leafColor);
    leafBase.forEach((l, i) => {
      c.copy(base).offsetHSL((rng() - 0.5) * 0.05, (rng() - 0.5) * 0.15, (rng() - 0.5) * 0.14);
      leaves.setColorAt(i, c);
    });
    leaves.instanceColor.needsUpdate = true;
    group.add(wood, leaves);

    const canopyCenter = leafPositions.reduce((a, p) => a.add(p), new THREE.Vector3()).divideScalar(leafPositions.length);
    const canopyRadius = Math.sqrt(leafPositions.reduce((a, p) => a + p.distanceToSquared(canopyCenter), 0) / leafPositions.length) * 1.4;

    const dummy = new THREE.Object3D();
    function applyLeaves(lf) {
      leafBase.forEach((l, i) => {
        dummy.position.copy(l.pos); dummy.rotation.copy(l.rot);
        dummy.scale.setScalar(Math.max(l.s * lf, 1e-4));
        dummy.updateMatrix();
        leaves.setMatrixAt(i, dummy.matrix);
      });
      leaves.instanceMatrix.needsUpdate = true;
    }
    let growth = 1, leafFactor = -1;
    function setGrowth(g) {
      growth = g;
      group.scale.setScalar(Math.max(g, 1e-3));
      const lf = smoothstep(0.3, 0.95, g);
      if (Math.abs(lf - leafFactor) > 1e-4) { leafFactor = lf; applyLeaves(lf); }
      leaves.visible = lf > 0.002;
    }
    setGrowth(1);
    function setOpacity(o) {
      for (const m of [barkMat, leafMat]) {
        const transparent = o < 0.999;
        if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
        m.opacity = o; m.depthWrite = !transparent;
      }
      wood.castShadow = leaves.castShadow = o > 0.5;
    }
    const api = {
      group, wood, leaves, trunkLen, radius, leafPositions, setGrowth, setOpacity,
      getGrowth: () => growth,
      canopyCenterWorld: out => group.localToWorld(out.copy(canopyCenter)),
      canopyRadiusWorld: () => canopyRadius * group.scale.x,
      randomLeafWorld: out => group.localToWorld(out.copy(leafPositions[(Math.random() * leafPositions.length) | 0])),
      trunkPointWorld: (t, a, out) => {
        const r = radius * (1 - 0.38 * t) * 1.18;
        return group.localToWorld(out.set(Math.cos(a) * r, t * trunkLen, Math.sin(a) * r));
      },
      samplePointWorld: out => {
        if (Math.random() < 0.72) return api.randomLeafWorld(out);
        const a = Math.random() * Math.PI * 2, rr = Math.random() * radius * 0.6;
        return group.localToWorld(out.set(Math.cos(a) * rr, Math.random() * trunkLen * 1.2, Math.sin(a) * rr));
      },
    };
    return api;
  }

  /* ---- a stream of small spheres along per-particle curves ---- */
  class ParticleFlow {
    constructor(THREE, { count = 60, color = 0x333333, size = 0.12, speed = [0.12, 0.25], makePath, emissive = 0.15 }) {
      this.count = count; this.size = size; this.speed = speed; this.makePath = makePath;
      const geo = new THREE.SphereGeometry(1, 10, 8);
      const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.55, emissive: color, emissiveIntensity: emissive });
      this.mesh = new THREE.InstancedMesh(geo, mat, count);
      this.mesh.frustumCulled = false; this.mesh.visible = false;
      this.particles = Array.from({ length: count }, () => ({
        t: Math.random(), speed: speed[0] + Math.random() * (speed[1] - speed[0]), rank: Math.random(), curve: null }));
      this.intensity = 0; this.level = 0;
      this._dummy = new THREE.Object3D(); this._v = new THREE.Vector3();
    }
    setIntensity(v) { this.intensity = clamp(v, 0, 1); }
    update(dt) {
      if (this.level < 0.002 && this.intensity < 0.002) { this.mesh.visible = false; return; }
      this.level += (this.intensity - this.level) * Math.min(1, dt * 2.5);
      if (this.intensity === 0 && this.level < 0.002) this.level = 0;
      this.mesh.visible = true;
      const d = this._dummy, v = this._v;
      for (let i = 0; i < this.count; i++) {
        const p = this.particles[i];
        if (!p.curve) p.curve = this.makePath();
        p.t += dt * p.speed;
        if (p.t >= 1) { p.t -= 1; p.curve = this.makePath(); }
        const vis = clamp((this.level * 1.12 - p.rank) * 8, 0, 1);
        p.curve.getPoint(p.t, v);
        d.position.copy(v);
        d.scale.setScalar(Math.max(this.size * Math.sin(Math.PI * p.t) * vis, 1e-4));
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  /* ---- 200 cubes that fly out of the tree and stack by origin ----
     THE SHARES ARE THE LESSON'S CLAIM: dry wood is ~93% from CO₂, ~6% from
     water's hydrogen, ~1% minerals from soil. A living tree is about half
     water by weight, which is the 'fresh' column. */
  const CATS = [
    { key: 'air',   name: 'From the air',  color: 0x3b4252, css: 'var(--air)',   x: -5.4 },
    { key: 'water', name: 'From water',    color: 0x2f6fb5, css: 'var(--water)', x: 0 },
    { key: 'soil',  name: 'From the soil', color: 0xb0702e, css: 'var(--soil)',  x: 5.4 },
  ];
  const SHARES = { dry: { air: 93, water: 6, soil: 1 }, fresh: { air: 46, water: 53, soil: 1 } };
  const PCT = { dry: { air: '93%', water: '6%', soil: '≈1%' }, fresh: { air: '46%', water: '53%', soil: '<1%' } };
  const SUB = { dry: { air: 'carbon dioxide', water: 'hydrogen atoms', soil: 'minerals' },
                fresh: { air: 'carbon dioxide', water: 'sap, plus hydrogen', soil: 'minerals' } };
  const DUR = 1.25, STEP = 0.36;

  class Piles {
    constructor(THREE, { root, tree, labels, count = 200, z = 8 }) {
      this.THREE = THREE; this.tree = tree; this.count = count; this.z = z;
      const geo = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      const mat = new THREE.MeshStandardMaterial({ roughness: 0.6, color: 0xffffff });
      this.mesh = new THREE.InstancedMesh(geo, mat, count);
      this.mesh.castShadow = true; this.mesh.frustumCulled = false; this.mesh.visible = false;
      root.add(this.mesh);
      this.cubes = Array.from({ length: count }, () => ({
        from: new THREE.Vector3(), to: new THREE.Vector3(), pos: new THREE.Vector3(),
        rot0: new THREE.Euler(Math.random() * 3, Math.random() * 3, Math.random() * 3),
        s0: 0, s1: 0, s: 0, delay: 0, t: 99 }));
      /* DOM labels, placed by the mount's afterFrame off a projection — no
         CSS2DRenderer in the global build, and none needed. */
      this.labels = CATS.map(cat => {
        const div = document.createElement('div');
        div.className = 'pile-label';
        div.innerHTML = `<span class="pile-pct"></span><span class="pile-name">${cat.name}</span><span class="pile-sub"></span>`;
        div.hidden = true;
        if (labels) labels.appendChild(div);
        return { el: div, pos: new THREE.Vector3() };
      });
      this.exploded = false; this.mode = 'dry';
      this._d = new THREE.Object3D(); this._c = new THREE.Color(); this._tmp = new THREE.Vector3();
    }
    counts(mode) {
      const s = SHARES[mode];
      const c = { air: Math.round(s.air / 100 * this.count), soil: Math.max(1, Math.round(s.soil / 100 * this.count)) };
      c.water = this.count - c.air - c.soil;
      return c;
    }
    _stack(cat, i, n, out) {
      const w = Math.max(2, Math.round(Math.cbrt(n) * 1.3));
      const layer = Math.floor(i / (w * w)), r = i % (w * w), row = Math.floor(r / w), col = r % w;
      return out.set(cat.x + (col - (w - 1) / 2) * STEP, 0.15 + layer * STEP, this.z + (row - (w - 1) / 2) * STEP);
    }
    _stackHeight(n) { const w = Math.max(2, Math.round(Math.cbrt(n) * 1.3)); return Math.ceil(n / (w * w)) * STEP; }
    explode(mode = 'dry') {
      const was = this.exploded;
      this.mode = mode; this.exploded = true; this.mesh.visible = true;
      const counts = this.counts(mode), idx = { air: 0, water: 0, soil: 0 };
      let i = 0;
      for (const cat of CATS) {
        const n = counts[cat.key];
        for (let k = 0; k < n; k++, i++) {
          const c = this.cubes[i];
          this._stack(cat, idx[cat.key]++, n, this._tmp);
          const changed = !was || this._tmp.distanceToSquared(c.to) > 1e-6;
          if (was) { c.from.copy(c.pos); c.s0 = 1; } else { this.tree.samplePointWorld(c.from); c.s0 = 0; }
          c.to.copy(this._tmp); c.s1 = 1;
          c.delay = was ? Math.random() * 0.35 : (i / this.count) * 0.9;
          c.t = changed ? 0 : 99;
          this.mesh.setColorAt(i, this._c.setHex(cat.color));
        }
      }
      this.mesh.instanceColor.needsUpdate = true;
      CATS.forEach((cat, k) => {
        const l = this.labels[k];
        l.pos.set(cat.x, this._stackHeight(counts[cat.key]) + 1.3, this.z);
        l.el.querySelector('.pile-pct').textContent = PCT[mode][cat.key];
        l.el.querySelector('.pile-sub').textContent = SUB[mode][cat.key];
        l.el.hidden = false;
      });
    }
    gather() {
      if (!this.exploded) return;
      this.exploded = false;
      for (const c of this.cubes) {
        c.from.copy(c.pos); this.tree.samplePointWorld(c.to);
        c.s0 = c.s; c.s1 = 0; c.delay = Math.random() * 0.4; c.t = 0;
      }
      this.labels.forEach(l => { l.el.hidden = true; });
    }
    update(dt) {
      if (!this.mesh.visible) return;
      let active = false;
      const d = this._d;
      for (let i = 0; i < this.count; i++) {
        const c = this.cubes[i];
        if (c.t < c.delay + DUR) { c.t += dt; active = true; }
        const k = easeOut(clamp((c.t - c.delay) / DUR, 0, 1));
        c.pos.lerpVectors(c.from, c.to, k);
        c.pos.y += Math.sin(Math.PI * k) * 1.6;
        c.s = lerp(c.s0, c.s1, k);
        d.position.copy(c.pos);
        d.rotation.set(c.rot0.x * (1 - k), c.rot0.y * (1 - k) + k * (1 - k) * 5, c.rot0.z * (1 - k));
        d.scale.setScalar(Math.max(c.s, 1e-4));
        d.updateMatrix();
        this.mesh.setMatrixAt(i, d.matrix);
      }
      this.mesh.instanceMatrix.needsUpdate = true;
      if (!active && !this.exploded) this.mesh.visible = false;
    }
    /* project: world Vector3 → {x, y} in the label host's pixels, or null if behind. */
    place(project) {
      for (const l of this.labels) {
        if (l.el.hidden) continue;
        const p = project(l.pos);
        if (!p) { l.el.style.visibility = 'hidden'; continue; }
        l.el.style.visibility = '';
        l.el.style.left = p.x + 'px'; l.el.style.top = p.y + 'px';
      }
    }
  }

  /* ---- the scene ---- */
  const DEFAULTS = { growth: 1, daylight: 1, treeOpacity: 1, potScene: false,
    flows: { co2: 0, o2: 0, h2o: 0, minerals: 0, ambient: 0 }, piles: null, saplingGrowth: 1 };

  function create(THREE, root, camera, opts = {}) {
    if (!global.Geo) throw new Error('tree.js: load lib/geo.js first');
    const P = Object.assign({}, DEFAULTS, opts);
    P.flows = Object.assign({}, DEFAULTS.flows, opts.flows || {});
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'Tree ' + ev);
    if (!global.CardStage) throw new Error('tree.js: load kit/card-stage.js first');
    const tweens = global.CardStage.tweens();
    const V3 = () => new THREE.Vector3();

    /* Lights: a sun, not a studio. Intensities are tuned by eye against the
       prototype, in r128's units: the Math.PI is the factor r155 stopped applying. */
    const hemi = new THREE.HemisphereLight(0xe9eef6,0xb9a98c, Math.PI * 0.6);
    const sun = new THREE.DirectionalLight(0xfff1dc, Math.PI * 1.15);
    sun.position.set(-6, 24, -14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24, near: 1, far: 90 });
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
    root.add(hemi, sun, sun.target);
    const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1.9, 32, 20),
      new THREE.MeshBasicMaterial({ color: 0xf3c04a, transparent: true, opacity: 1 }));
    sunDisc.position.set(-16, 24, -34);
    root.add(sunDisc);

    function radialAlpha() {
      const c = document.createElement('canvas'); c.width = c.height = 512;
      const g = c.getContext('2d');
      const grad = g.createRadialGradient(256, 256, 0, 256, 256, 256);
      grad.addColorStop(0, '#fff'); grad.addColorStop(0.6, '#fff'); grad.addColorStop(1, '#000');
      g.fillStyle = grad; g.fillRect(0, 0, 512, 512);
      return new THREE.CanvasTexture(c);
    }
    const groundMat = new THREE.MeshStandardMaterial({ color: 0xe6e1d4, roughness: 1, transparent: true, alphaMap: radialAlpha() });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), groundMat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    root.add(ground);
    const soilMat = new THREE.MeshStandardMaterial({ color: 0x7d5f44, roughness: 1 });
    const soil = new THREE.Mesh(new THREE.CircleGeometry(2.9, 64), soilMat);
    soil.rotation.x = -Math.PI / 2; soil.position.y = 0.02; soil.receiveShadow = true;
    root.add(soil);

    const tree = createTree(THREE, { trunkLen: 5, radius: 0.55, depth: 4, seed: 11 });
    root.add(tree.group);

    /* A person for scale: 1 world unit ≈ 1.9 m, so ≈ 0.95 units tall. */
    const person = new THREE.Group();
    const personMat = new THREE.MeshStandardMaterial({ color: 0x2a2c31, roughness: 0.8 });
    const bodyMesh = new THREE.Mesh(global.Geo.capsule(THREE, 0.14, 0.45, 4, 10), personMat);
    bodyMesh.position.y = 0.5;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), personMat);
    head.position.y = 0.87;
    bodyMesh.castShadow = head.castShadow = true;
    person.add(bodyMesh, head);
    person.position.set(5.2, 0, 3.4);
    root.add(person);

    /* Van Helmont's pot and willow. */
    const pot = new THREE.Group();
    const potMat = new THREE.MeshStandardMaterial({ color: 0xb8683f, roughness: 0.85 });
    const potBody = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 0.72, 1.1, 40), potMat);
    potBody.position.y = 0.55;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 12, 48), potMat);
    rim.rotation.x = Math.PI / 2; rim.position.y = 1.1;
    const potSoil = new THREE.Mesh(new THREE.CircleGeometry(0.97, 48), new THREE.MeshStandardMaterial({ color: 0x4a382a, roughness: 1 }));
    potSoil.rotation.x = -Math.PI / 2; potSoil.position.y = 1.101;
    potBody.castShadow = rim.castShadow = true; potBody.receiveShadow = true;
    const sapling = createTree(THREE, { trunkLen: 1.3, radius: 0.08, depth: 3, seed: 5, leafSize: 0.17, leavesPerTip: 3 });
    sapling.group.position.y = 1.1;
    pot.add(potBody, rim, potSoil, sapling.group);
    pot.visible = false;
    root.add(pot);

    /* ---- the flows ---- */
    const _c = V3();
    function co2Path() {
      const c = tree.canopyCenterWorld(_c), r = tree.canopyRadiusWorld();
      const a = Math.random() * Math.PI * 2, el = Math.random() * 0.9 - 0.25;
      const start = new THREE.Vector3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el))
        .multiplyScalar(r * 1.7 + Math.random() * r * 1.6).add(c);
      const end = tree.randomLeafWorld(V3());
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2));
      return new THREE.CatmullRomCurve3([start, mid, end]);
    }
    function o2Path() {
      const c = tree.canopyCenterWorld(_c);
      const start = tree.randomLeafWorld(V3());
      const dir = start.clone().sub(c).normalize();
      const end = start.clone().addScaledVector(dir, 2.5 + Math.random() * 2.5).add(new THREE.Vector3(0, 3 + Math.random() * 2.5, 0));
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, 0, (Math.random() - 0.5) * 1.5));
      return new THREE.CatmullRomCurve3([start, mid, end]);
    }
    function sapPath() {
      const s = tree.group.scale.x, a = Math.random() * Math.PI * 2, rr = (1.1 + Math.random() * 1.5) * s;
      const start = new THREE.Vector3(Math.cos(a) * rr, 0.06, Math.sin(a) * rr);
      return new THREE.CatmullRomCurve3([start, tree.trunkPointWorld(0.02, a, V3()), tree.trunkPointWorld(0.55, a, V3()),
        tree.trunkPointWorld(1.0, a, V3()), tree.randomLeafWorld(V3())]);
    }
    function driftPath() {
      const a = Math.random() * Math.PI * 2, rr = 1.2 + Math.random() * 4.5;
      const start = new THREE.Vector3(Math.cos(a) * rr, 1.4 + Math.random() * 5, Math.sin(a) * rr);
      const end = start.clone().add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2.5));
      const mid = start.clone().lerp(end, 0.5).add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5));
      return new THREE.CatmullRomCurve3([start, mid, end]);
    }
    const flows = {
      co2:      new ParticleFlow(THREE, { count: 110, color: 0x3b4252, size: 0.14, speed: [0.14, 0.26], makePath: co2Path }),
      o2:       new ParticleFlow(THREE, { count: 70,  color: 0x9dd2ea, size: 0.12, speed: [0.14, 0.24], makePath: o2Path, emissive: 0.35 }),
      h2o:      new ParticleFlow(THREE, { count: 60,  color: 0x2f6fb5, size: 0.11, speed: [0.10, 0.18], makePath: sapPath }),
      minerals: new ParticleFlow(THREE, { count: 10,  color: 0xb0702e, size: 0.09, speed: [0.10, 0.18], makePath: sapPath }),
      ambient:  new ParticleFlow(THREE, { count: 150, color: 0x3b4252, size: 0.04, speed: [0.05, 0.1], makePath: driftPath, emissive: 0 }),
    };
    Object.values(flows).forEach(f => root.add(f.mesh));
    const piles = new Piles(THREE, { root, tree, labels: opts.labels, count: 200, z: 11 });

    /* ---- environment ---- */
    const DAY = { ground: new THREE.Color(0xe6e1d4), soil: new THREE.Color(0x7d5f44) };
    const NIGHT = { ground: new THREE.Color(0x343846), soil: new THREE.Color(0x2b2420) };
    let daylight = P.daylight, treeOpacity = P.treeOpacity;
    function applyDaylight(v) {
      daylight = v;
      sun.intensity = Math.PI * lerp(0.12, 1.15, v);
      hemi.intensity = Math.PI * lerp(0.25, 0.6, v);
      groundMat.color.lerpColors(NIGHT.ground, DAY.ground, v);
      soilMat.color.lerpColors(NIGHT.soil, DAY.soil, v);
      sunDisc.material.opacity = v;
      sunDisc.visible = v > 0.02;
    }
    function setDaylight(target) {
      P.daylight = target;
      emit('night', target < 0.5);
      tweens.to(daylight, target, 1.2, applyDaylight, { key: 'day', ease: 'inOutCubic' });
    }
    function setTreeOpacity(target, dur = 0.9) {
      P.treeOpacity = target;
      tweens.to(treeOpacity, target, dur, v => { treeOpacity = v; tree.setOpacity(v); }, { key: 'ghost', ease: 'inOutCubic' });
    }
    function showPotScene(on) {
      P.potScene = on;
      pot.visible = on; tree.group.visible = !on; person.visible = !on; soil.visible = !on;
    }
    function flowsOff() { for (const k in flows) { flows[k].setIntensity(0); P.flows[k] = 0; } }
    function setFlows(f) { for (const k in f) if (flows[k]) { flows[k].setIntensity(f[k]); P.flows[k] = clamp(f[k], 0, 1); } }
    function setPiles(mode) {
      P.piles = mode;
      if (mode) piles.explode(mode); else piles.gather();
    }

    function step(dt) {
      tweens.update(dt);
      for (const f of Object.values(flows)) f.update(dt);
      piles.update(dt);
      const s = state();
      emit('frame', s, dt);
      return s;
    }
    function state() {
      return { growth: tree.getGrowth(), daylight, treeOpacity, potScene: P.potScene, layers: layers(),
        flows: Object.fromEntries(Object.keys(flows).map(k => [k, flows[k].intensity])),   // off the flows, not the params: a step may drive one directly
        piles: piles.exploded ? piles.mode : null,
        saplingGrowth: sapling.getGrowth() };
    }
    function set(next) {
      if (next.growth != null) { P.growth = next.growth; tree.setGrowth(next.growth); }
      if (next.saplingGrowth != null) { P.saplingGrowth = next.saplingGrowth; sapling.setGrowth(next.saplingGrowth); }
      if (next.daylight != null) setDaylight(next.daylight);
      if (next.treeOpacity != null) setTreeOpacity(next.treeOpacity);
      if (next.potScene != null) showPotScene(next.potScene);
      if (next.flows) setFlows(next.flows);
      if ('piles' in next) setPiles(next.piles);
    }
    function on(ev, fn) {
      (listeners[ev] || (listeners[ev] = [])).push(fn);
      return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
    }

    /* ---- what can be shown or hidden ---- */
    const FLOW_LABEL = { co2: 'CO₂ in', o2: 'O₂ out', h2o: 'water up', minerals: 'minerals up', ambient: 'the air' };
    const LAYERS = {};
    for (const k in flows) LAYERS[k] = { label: FLOW_LABEL[k], get: () => flows[k].intensity > 0, set: v => setFlows({ [k]: v ? 1 : 0 }) };
    LAYERS.piles  = { label: 'the tree taken apart', get: () => piles.exploded, set: v => setPiles(v ? (piles.mode || 'dry') : null) };
    LAYERS.person = { label: 'a person for scale', get: () => person.visible, set: v => { person.visible = v && !P.potScene; } };
    LAYERS.sun    = { label: 'the sun', get: () => sunDisc.visible, set: v => { sunDisc.visible = v && daylight > 0.02; } };
    const layers = () => Object.keys(LAYERS).map(k => ({ name: k, label: LAYERS[k].label, on: !!LAYERS[k].get() }));
    function show(name, on = true) {
      const L = LAYERS[name];
      if (!L) { console.warn('tree.js: no layer named ' + name + '; have ' + Object.keys(LAYERS).join(', ')); return; }
      L.set(!!on);
    }
    const palette = () => [
      { name: 'CO₂', color: '#3b4252' }, { name: 'O₂', color: '#9dd2ea' }, { name: 'water', color: '#2f6fb5' },
      { name: 'minerals', color: '#b0702e' }, { name: 'wood', color: '#6b4f3a' }, { name: 'leaves', color: '#4f8a3c' },
      { name: 'from the air', color: '#3b4252' }, { name: 'from water', color: '#2f6fb5' }, { name: 'from the soil', color: '#b0702e' },
    ];

    /* Named parts. */
    const _a = new THREE.Vector3();
    const anchors = {
      trunk:  () => tree.group.visible ? tree.trunkPointWorld(0.45, Math.PI / 2, _a) : null,
      canopy: () => tree.group.visible ? tree.canopyCenterWorld(_a) : null,
      leaves: () => tree.group.visible ? tree.canopyCenterWorld(_a).add(new THREE.Vector3(tree.canopyRadiusWorld() * 0.6, tree.canopyRadiusWorld() * 0.4, 0)) : null,
      roots:  () => tree.group.visible ? _a.set(1.8, 0.1, 1.2) : null,
      soil:   () => soil.visible ? _a.set(-2.0, 0.05, 1.5) : null,
      sun:    () => sunDisc.visible ? sunDisc.getWorldPosition(_a) : null,
      person: () => person.visible ? person.getWorldPosition(_a).add(new THREE.Vector3(0, 0.9, 0)) : null,
      pot:    () => pot.visible ? _a.set(1.0, 0.7, 0) : null,
      willow: () => pot.visible ? sapling.canopyCenterWorld(_a) : null,
      air:    () => tree.group.visible ? tree.canopyCenterWorld(_a).add(new THREE.Vector3(-tree.canopyRadiusWorld() * 1.6, 1.5, 0)) : _a.set(-3, 3, 0),
    };
    const library = {
      trunk:  { text: 'wood', offset: [40, -20], card: 'Cellulose and lignin: sugar, polymerised. About half of its dry mass is carbon, and that carbon arrived as CO₂.' },
      canopy: { text: 'canopy', offset: [40, -30], card: 'Where the building happens. Leaves take in CO₂ and the water sent up from the roots, and put the atoms together into sugar.' },
      leaves: { text: 'leaves', offset: [40, -26], card: 'Each one a solar panel and a gas exchanger. In light they take CO₂ in and let O₂ out; in the dark they only respire.' },
      roots:  { text: 'roots', offset: [40, 26], card: 'Water and a pinch of minerals come in here. Almost none of the tree\'s mass does: the soil is an anchor and a tap, not a quarry.' },
      soil:   { text: 'soil', offset: [-40, 26], card: 'Most people\'s guess. Van Helmont weighed it: after five years the pot had lost about two ounces.' },
      sun:    { text: 'sunlight', offset: [40, -26], card: 'The energy that powers the construction. It weighs nothing, so it supplies none of the material.' },
      person: { text: '1.8 m', offset: [40, -20], card: 'For scale. One scene unit is about 1.9 m, so the oak is around 25 m tall.' },
      pot:    { text: 'Van Helmont\'s pot', offset: [40, 20], card: '200 pounds of oven-dried soil, covered so no dust could settle. For five years it got only rainwater.' },
      willow: { text: 'the willow', offset: [40, -26], card: 'Five pounds when planted, 169 pounds five years later. The soil lost two ounces. Whatever it was made of did not come from the pot.' },
      air:    { text: 'the air', offset: [-40, -26], card: 'About 0.04% carbon dioxide: 0.8 grams in every cubic metre. Invisible, and the tree\'s building material.' },
    };
    applyDaylight(P.daylight);
    tree.setGrowth(P.growth); sapling.setGrowth(P.saplingGrowth);
    showPotScene(P.potScene); setFlows(P.flows);
    if (P.piles) piles.explode(P.piles);

    return { step, state, set, on, tweens, tree, sapling, flows, piles, anchors, library, layers, show, palette,
      setDaylight, setTreeOpacity, showPotScene, flowsOff, params: () => P, easeOut, easeInOut };
  }

  /* ---- one box ----
     A camera flight in Stage's own turntable terms. Stage's studio lights
     are dimmed because this scene has a sun. */
  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('tree.js: load kit/card-stage.js first');
    const V = THREE.Vector3;
    const orbitOf = (pos, target) => {
      const v = new V().fromArray(pos).sub(new V().fromArray(target));
      const r = v.length();
      return { r, phi: Math.acos(clamp(v.y / r, -1, 1)), theta: Math.atan2(v.x, v.z) };
    };
    const first = orbitOf(params.pos || [21, 9.5, 28], params.target || [0, 6.5, 0]);
    let sim = null, last = null, nb = null;
    const labels = document.createElement('div');
    labels.className = 'lshell-labels';
    let box = null;                        // layout() runs inside create, before this is assigned
    box = global.CardStage.create({
      mount: el,
      cam: first,
      stage: Object.assign({ phiMin: 0.15, phiMax: Math.PI / 2 - 0.02, rMin: 2.5, rMax: 80 }, params.stage || {}),
      step: dt => { if (sim) { flyStep(dt); last = sim.step(dt); } },
      afterFrame: () => { if (sim) sim.piles.place(project); if (nb) nb.step(); },
      viewOffset: params.viewOffset,
      onResize: layout,
    });
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.appendChild(labels);
    box.cam.target.fromArray(params.target || [0, 6.5, 0]);
    box.renderer.shadowMap.enabled = true;
    box.renderer.shadowMap.type = THREE.PCFShadowMap;
    box.camera.far = 400;
    for (const o of box.camera.children) if (o.isLight) o.intensity *= 0.25;
    for (const o of box.scene.children) if (o.isAmbientLight) o.intensity = Math.PI * 0.2;

    /* Widen on a portrait canvas; the offset is CardStage's. */
    function layout() {
      if (!box) return;
      const cam = box.camera;
      cam.fov = Math.min(72, 36 * Math.max(1, 1.35 / cam.aspect));
      cam.updateProjectionMatrix();
    }
    const _p = new V();
    function project(world) {
      _p.copy(world).project(box.camera);
      if (_p.z > 1) return null;
      return { x: (_p.x * 0.5 + 0.5) * box.canvas.clientWidth, y: (-_p.y * 0.5 + 0.5) * box.canvas.clientHeight };
    }

    const fly = { active: false, t: 0, dur: 1.5, a: null, b: null, t0: new V(), t1: new V() };
    function flyTo(pos, target, dur = 1.6) {
      const c = box.cam;
      fly.a = { theta: c.theta, phi: c.phi, r: c.r }; fly.t0.copy(c.target);
      fly.b = orbitOf(pos, target); fly.t1.fromArray(target);
      /* Shortest way round. */
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
    box.canvas.addEventListener('pointerdown', () => { fly.active = false; });

    sim = create(THREE, box.root, box.camera, Object.assign({ labels }, params));
    layout();
    box.pump();
    nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, library: sim.library }) : null;
    return {
      sim, box, flyTo, layout,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      layers: sim.layers, show: (n, on) => { sim.show(n, on); return this; }, palette: sim.palette,
      set(next) { sim.set(next); return this; },
      state: () => last || sim.state(),
      on: sim.on,
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { labels.remove(); box.destroy(); },
    };
  }

  global.Tree = { create, mount, DEFAULTS, PILES: { CATS, SHARES, PCT, SUB }, easeOut, easeInOut };
  /* Scale (kit/scale.js). One organism, with a person beside it
     for scale, which is how this scene answers size: by comparison, not by a
     number. unit is null; the mass shares in PILES are the numbers it owns. */
  global.Tree.SCALE = { rung: 'organism', form: 'single', unit: null, exag: {}, down: {} };
})(typeof globalThis !== 'undefined' ? globalThis : this);
