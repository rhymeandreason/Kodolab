/* =============================================================================
 *  cell-division/cell-division.js — mitosis and meiosis as one scrubbable scene
 * =============================================================================
 *      const cd = CellDivision.mount(el, { mode: 'mitosis', room: () => rect, defs });
 *      cd.set({ mode: 'meiosis' });   // rebuilds the world and reframes
 *      cd.set({ t: 12.5 });           // seconds into that mode's timeline
 *      cd.state()                     // { mode, t, total, phases, counts }
 *
 *  The scene is a pure function of `t` (scenarios.js), so the page owns the
 *  clock and this only draws whatever time it is handed. `room()` is the free
 *  rectangle in viewport px ({ l, r, t, b }) the cell is framed into; without
 *  it the whole window is. `defs` is scenarios.js's two builds, for a page
 *  that has already made them for its own step list.
 *
 *  ONE LESSON'S SCENE, not a component: it is mount-shaped so it can become
 *  one, but it is not in kit/app.js's USES and Components.md does not know it.
 *  It still orbits with three's OrbitControls rather than kit/card-stage.js.
 *
 *  `counts` is read off the world every frame, never off the phase table, so
 *  the panel's numbers are what the scene is drawing at that instant:
 *    cells       a visible cell counts twice once it looks apart (APART)
 *    chromosomes centromeres: two sisters whose centromeres are still together
 *                are one chromosome, and become two the moment they part
 *    chromatids  every chromatid, assigned to the nearest cell body
 *  Each is per cell, as a list, so a page can say "6" or "3 + 3".
 * ========================================================================== */
(function (global) {
  'use strict';

  const CD = global.CD;
  const V3 = THREE.Vector3;
  /* Two cells once the furrow's waist is a tenth of the radius: they read as
     apart on screen well before the membranes fuse at s = 1. */
  const APART = 0.9;
  const JOINED = 0.35;   // sister centromeres sit 2 × G = 0.2 apart until anaphase pulls them

  function mount(el, params = {}) {
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;touch-action:none';
    el.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.NoToneMapping;

    const scene = new THREE.Scene();
    if (!CD.mat) CD.initShared();
    scene.environment = CD.makeEnvironment(renderer);
    scene.add(new THREE.HemisphereLight(0xffffff, 0xe6e0d4, 0.45));
    const key = new THREE.DirectionalLight(0xffffff, 1.05);
    key.position.set(4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xfff4e6, 0.45);
    rim.position.set(-6, 2, -5);
    scene.add(rim);

    const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 200);
    const HOME_DIR = new V3(0.22, 0.3, 1).normalize();
    camera.position.copy(HOME_DIR).multiplyScalar(16);

    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 6;
    controls.maxDistance = 40;
    controls.rotateSpeed = 0.7;
    controls.zoomSpeed = 0.8;

    const defs = params.defs || { mitosis: CD.buildMitosis(), meiosis: CD.buildMeiosis() };
    const opts = { membrane: true, spindle: true };
    let mode = null, def = null, world = null, t = 0;
    let camAnim = null, fitDist = 16, raf = 0, running = true;

    // ---- framing: centre the cell in the room the page's chrome leaves
    function room() {
      const W = el.clientWidth || global.innerWidth, H = el.clientHeight || global.innerHeight;
      const r = params.room ? params.room() : { l: 0, r: W, t: 0, b: H };
      return { l: r.l, r: r.r, t: r.t, b: r.b, W, H };
    }
    function computeFit() {
      const f = room();
      const fw = Math.max(f.r - f.l, 120), fh = Math.max(f.b - f.t, 120);
      const cx = (f.l + f.r) / 2, cy = (f.t + f.b) / 2;
      camera.setViewOffset(f.W, f.H, f.W / 2 - cx, f.H / 2 - cy, f.W, f.H);
      camera.updateProjectionMatrix();
      const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const ext = def.extent;
      const fit = Math.max((ext.h * f.H) / (fh * tanV), (ext.w * f.H) / (fw * tanV)) * 1.04;
      if (isFinite(fit) && fit > 0) fitDist = fit;
      controls.maxDistance = Math.max(40, fitDist * 1.8);
    }
    function animateCamera(dir, dist, dur) {
      camAnim = { fromDir: camera.position.clone().normalize(), fromDist: camera.position.length(),
        toDir: dir.clone().normalize(), toDist: dist, t0: performance.now(), dur };
    }
    function stepCamera(now) {
      if (!camAnim) return;
      const u = CD.clamp((now - camAnim.t0) / camAnim.dur, 0, 1);
      const e = CD.ease.inOut(u);
      const dir = camAnim.fromDir.clone().lerp(camAnim.toDir, e).normalize();
      camera.position.copy(dir).multiplyScalar(CD.lerp(camAnim.fromDist, camAnim.toDist, e));
      if (u >= 1) camAnim = null;
    }
    controls.addEventListener('start', () => { camAnim = null; });

    function resize() {
      const W = el.clientWidth || global.innerWidth, H = el.clientHeight || global.innerHeight;
      if (!W || !H) return;   // a hidden tab reports 0, and 0 here leaves the camera at NaN for good
      renderer.setSize(W, H, false);
      camera.aspect = W / H;
      const prev = fitDist;
      computeFit();
      if (!camAnim) camera.position.multiplyScalar(fitDist / prev);   // keep the reader's relative zoom
      else camAnim.toDist = fitDist;
    }

    function setMode(m, first) {
      if (m === mode || !defs[m]) return;
      mode = m;
      def = defs[m];
      if (world) world.dispose();
      world = new CD.World(scene, def);
      t = 0;
      computeFit();
      if (first) camera.position.copy(HOME_DIR).multiplyScalar(fitDist);
      else animateCamera(camera.position.clone().normalize().lerp(HOME_DIR, 0.5), fitDist, 1300);
    }

    // ---- counts, off the world
    const body = new V3();
    function bodies() {
      const out = [];
      for (const c of world.cells) {
        const st = c.st;
        if (!(st.vis > 0.5)) continue;
        if (CD.clamp(st.s, 0, 1) < APART) { out.push(st.center.clone()); continue; }
        const off = c.r + st.gap;
        for (const sg of [1, -1]) out.push(st.center.clone().addScaledVector(c.def.axis, sg * off));
      }
      return out;
    }
    /* Samples the tracks at `t` itself, and only the ones a count reads: a
       paused page that has just been scrubbed gets no further frame to make
       world.update's state current. */
    const sample = (o) => { for (const tr of o.def.tracks) tr.sample(t, o.st); };
    function counts() {
      world.cells.forEach(sample);
      world.chromatids.forEach(sample);
      const cells = bodies();
      const chrom = cells.map(() => 0), tids = cells.map(() => 0);
      const nearest = (p) => {
        let best = 0, bd = Infinity;
        cells.forEach((b, i) => { const d = body.copy(b).distanceToSquared(p); if (d < bd) { bd = d; best = i; } });
        return best;
      };
      // Sisters share pair + parent; each sister pair is checked once, by its sister 0.
      const sisters = new Map();
      for (const c of world.chromatids) {
        const k = c.def.pair + ':' + c.def.parent;
        (sisters.get(k) || sisters.set(k, []).get(k)).push(c);
      }
      for (const pair of sisters.values()) {
        const [a, b] = pair;
        const ia = nearest(a.st.C), ib = b ? nearest(b.st.C) : ia;
        tids[ia]++;
        if (b) tids[ib]++;
        if (b && ia === ib && a.st.C.distanceTo(b.st.C) < JOINED) chrom[ia]++;
        else { chrom[ia]++; if (b) chrom[ib]++; }
      }
      return { cells: cells.length, chromosomes: chrom, chromatids: tids };
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      world.update(t, now / 1000, opts);
      stepCamera(now);
      controls.update();
      renderer.render(scene, camera);
    }

    setMode(params.mode || 'mitosis', true);
    if (params.t != null) t = params.t;
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    global.addEventListener('resize', resize);
    raf = requestAnimationFrame(frame);

    const api = {
      set(p = {}) {
        if (p.mode) setMode(p.mode);
        if (p.t != null) t = CD.clamp(p.t, 0, def.total);
        if (p.membrane != null) opts.membrane = !!p.membrane;
        if (p.spindle != null) opts.spindle = !!p.spindle;
        return api;
      },
      state() {
        return { mode, t, total: def.total, phases: def.phases, label: def.label, counts: counts() };
      },
      defs,
      /* Recompute the framing, for a page whose chrome moved without the
         window resizing (a panel that docks, a dock that appears). */
      reframe() { resize(); },
      start() { if (!running) { running = true; raf = requestAnimationFrame(frame); } },
      stop() { running = false; cancelAnimationFrame(raf); },
      destroy() {
        api.stop();
        ro.disconnect();
        global.removeEventListener('resize', resize);
        controls.dispose();
        if (world) world.dispose();
        renderer.dispose();
        canvas.remove();
      },
      debug: { scene, camera, renderer, controls, world: () => world },
    };
    return api;
  }

  global.CellDivision = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
