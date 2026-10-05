/* =============================================================================
 *  enzyme/enzyme.js: the enzyme scene behind kit/lesson-shell.js
 * =============================================================================
 *  One schematic enzyme (a lumpy sphere with an active-site bowl and an
 *  allosteric dimple, morphed for induced fit, allosteric pinch and
 *  denaturation), the chain it folds from, substrates and inhibitors run by
 *  enzyme-reactor.js, and the energy-diagram slabs. Schematic on purpose: no
 *  real fold is claimed. hemoglobin-lab is where a measured protein is drawn.
 *
 *      const enz = Enzyme.mount(shell.stage, { viewOffset: shell.viewOffset });
 *      enz.show('binding', step)   // scene preset for a step; flies step.camera
 *
 *  `show(key)` is the whole per-step scene state, so a step's onEnter only
 *  builds controls. Keys: fold · site · binding · catalysis · energy ·
 *  conditions · inhibition. The temperature and pH model lives here, not in
 *  the steps, because the panel's chart and the scene must read one curve.
 *
 *  Loads after three r128, OrbitControls, enzyme-lib.js, enzyme-models.js and
 *  enzyme-reactor.js. Exposes window.Enzyme.
 * ========================================================================== */
(function (global) {
  'use strict';
  const L = EnzymeLib, M = EnzymeModels;
  const { col, clamp, smoothstep, easeInOutCubic, damp, noise3 } = L;
  const { E, COLORS } = M;
  const V3 = THREE.Vector3;

  /* ---- temperature and pH: rate doubles per 10 °C until the fold fails ---- */
  const tempRaw = T => Math.pow(2, (T - 37) / 10) * (1 - smoothstep(33, 52, T));
  let TMAX = 0, T_OPT = 0;
  for (let T = 0; T <= 80; T += 0.25) { const v = tempRaw(T); if (v > TMAX) { TMAX = v; T_OPT = T; } }
  const PH_OPT = 7;
  const tempF = T => tempRaw(T) / TMAX;
  const phF = p => Math.exp(-Math.pow((p - PH_OPT) / 1.7, 2));
  const denatOf = (T, p) => Math.max(smoothstep(40, 55, T), smoothstep(2.4, 4.4, Math.abs(p - PH_OPT)));

  function mount(el, opts = {}) {
    const size = () => ({ w: el.clientWidth || innerWidth, h: el.clientHeight || innerHeight });

    /* ================= Renderer & scene ================= */
    const canvas = document.createElement('canvas');
    canvas.className = 'enz-canvas';
    el.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.92;

    const scene = new THREE.Scene();
    // the shell's paper, so the far dust fades into the page
    scene.fog = new THREE.Fog(0xf4f2ec, 20, 44);

    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 200);
    camera.position.set(0, 1.6, 15.5);

    const controls = new THREE.OrbitControls(camera, canvas);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, enablePan: false, minDistance: 4.5, maxDistance: 30, rotateSpeed: 0.7, zoomSpeed: 0.8 });

    (function buildEnvironment() {
      const pm = new THREE.PMREMGenerator(renderer);
      const env = new THREE.Scene();
      const geo = new THREE.SphereGeometry(40, 32, 16);
      const top = new THREE.Color(0xfbfaf6), bottom = new THREE.Color(0x9c9a92), c = new THREE.Color();
      const cols = [];
      for (let i = 0; i < geo.attributes.position.count; i++) {
        c.copy(bottom).lerp(top, smoothstep(-30, 30, geo.attributes.position.getY(i)));
        cols.push(c.r, c.g, c.b);
      }
      geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      env.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true })));
      const softbox = (w, h, pos, k) => {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide }));
        m.position.copy(pos);
        m.lookAt(0, 0, 0);
        env.add(m);
      };
      softbox(24, 24, new V3(8, 34, 14), 2.4);
      softbox(14, 10, new V3(32, 6, 12), 1.4);
      softbox(12, 8, new V3(-30, 2, -14), 0.9);
      scene.environment = pm.fromScene(env, 0.04).texture;
      pm.dispose();
    })();

    scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d4c8, 0.35));
    const key = new THREE.DirectionalLight(0xffffff, 1.35);
    key.position.set(5, 9, 7);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xeceae4, 0.55);
    rim.position.set(-7, 2, -5);
    scene.add(rim);

    // Blurred contact shadows: cleaner on paper than shadow maps
    function shadowTexture(draw) {
      const c = document.createElement('canvas');
      c.width = c.height = 256;
      draw(c.getContext('2d'));
      const t = new THREE.CanvasTexture(c);
      t.encoding = THREE.sRGBEncoding;
      return t;
    }
    function shadowPlane(tex, w, h) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({
        map: tex, transparent: true, depthWrite: false, opacity: 0, color: col('#3d3a33'),
      }));
      m.rotation.x = -Math.PI / 2;
      m.position.y = -2.85;
      m.renderOrder = -1;
      scene.add(m);
      return m;
    }
    const roundShadow = shadowPlane(shadowTexture(g => {
      const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
      gr.addColorStop(0, 'rgba(255,255,255,0.5)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0.2)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 256, 256);
    }), 7, 7);
    const slabShadow = shadowPlane(shadowTexture(g => {
      g.filter = 'blur(14px)';
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.fillRect(34, 60, 188, 136);
    }), 13, 4.6);

    // Particles in solution
    const dustN = 150;
    const dust = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshStandardMaterial({ color: col('#cfcabe'), roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }),
      dustN
    );
    const dustData = [];
    {
      const r = L.rng(5);
      for (let i = 0; i < dustN; i++) {
        const p = new V3((r() - 0.5) * 36, -2.5 + r() * 12, -22 + r() * 24);
        if (Math.hypot(p.x, p.z) < 5) p.x += Math.sign(p.x || 1) * 5;
        dustData.push({ p, s: 0.025 + Math.pow(r(), 2) * 0.09, ph: r() * 100 });
      }
    }
    scene.add(dust);
    const dummy = new THREE.Object3D();
    function updateDust(t) {
      for (let i = 0; i < dustN; i++) {
        const d = dustData[i];
        dummy.position.set(d.p.x + Math.sin(t * 0.13 + d.ph) * 0.7, d.p.y + Math.sin(t * 0.21 + d.ph * 1.3) * 0.45, d.p.z + Math.cos(t * 0.11 + d.ph) * 0.7);
        dummy.scale.setScalar(d.s);
        dummy.updateMatrix();
        dust.setMatrixAt(i, dummy.matrix);
      }
      dust.instanceMatrix.needsUpdate = true;
    }

    /* ================= Objects ================= */
    const enzymeGroup = new THREE.Group();
    scene.add(enzymeGroup);
    const enzyme = M.buildEnzyme();
    enzymeGroup.add(enzyme);
    const chain = M.buildChain();
    enzymeGroup.add(chain.group);
    const molRoot = new THREE.Group();
    enzymeGroup.add(molRoot);
    const glow = M.makeGlow(COLORS.site, 0);
    glow.position.copy(E.P).multiplyScalar(E.R - 0.45);
    enzymeGroup.add(glow);

    const reactor = new EnzymeReactor(molRoot);
    const energy = M.buildEnergy();
    energy.group.position.y = -0.4;
    scene.add(energy.group);

    /* ================= State ================= */
    let cur = null;
    const fold = { t: 0, zoomed: false, after: null };
    const targets = { enzyme: 1, chain: 0, energy: 0 };
    const visV = { enzyme: 0, chain: 0, energy: 0 };
    const visObj = { enzyme: enzymeGroup, chain: chain.group, energy: energy.group };
    const enzOp = { v: 1, target: 1 };
    const cond = { denat: 0, denatTarget: 0, jitter: 0 };
    let glowTarget = 0, glowV = 0, spin = 'none', rotY = 0, userMoved = false, time = 0;

    function updateVis(dt) {
      for (const k in visObj) {
        visV[k] += (targets[k] - visV[k]) * damp(dt, 5);
        const o = visObj[k];
        o.visible = visV[k] > 0.004;
        o.scale.setScalar(Math.max(0.001, visV[k]));
      }
    }

    const WHITE = new THREE.Color(1, 1, 1), DENAT = col('#b8b6b0');
    function updateEnzyme(dt) {
      const mat = enzyme.material;
      enzOp.v += (enzOp.target - enzOp.v) * damp(dt, 3);
      if (Math.abs(enzOp.v - enzOp.target) < 0.002) enzOp.v = enzOp.target;
      mat.opacity = enzOp.v;
      mat.transparent = enzOp.v < 0.999;
      mat.depthWrite = !mat.transparent;
      enzyme.visible = enzOp.v > 0.01;

      cond.denat += (cond.denatTarget - cond.denat) * damp(dt, 2.5);
      const inf = enzyme.morphTargetInfluences;
      inf[0] = reactor.close * (1 - cond.denat);
      inf[1] = reactor.pinch * (1 - cond.denat);
      inf[2] = cond.denat;
      mat.color.copy(WHITE).lerp(DENAT, cond.denat * 0.75);

      let target = 0;
      if (spin === 'sway') target = Math.sin(time * 0.35) * 0.45;
      if (spin === 'fold' && fold.t > chain.duration) target = Math.sin((fold.t - chain.duration) * 0.4) * 0.5;
      rotY += (target - rotY) * damp(dt, 2);

      // thermal jitter grows with temperature
      const j = cond.jitter, f = 3 + j * 140;
      enzymeGroup.rotation.set(noise3(time * f, 0.3, 1.7) * j, rotY + noise3(2.1, time * f, 0.5) * j, noise3(5.2, 1.1, time * f) * j);
      enzymeGroup.position.set(noise3(time * f * 0.8, 9.1, 0) * j * 0.8, Math.sin(time * 0.9) * 0.05, 0);

      glowV += (glowTarget - glowV) * damp(dt, 3);
      glow.visible = glowV > 0.01;
      glow.material.opacity = glowV * (0.3 + 0.12 * Math.sin(time * 2.4));
      glow.scale.setScalar(1.7 + 0.2 * Math.sin(time * 2.4));

      roundShadow.material.opacity = visV.enzyme * (0.4 + 0.6 * enzOp.v);
      roundShadow.scale.setScalar(Math.max(0.001, visV.enzyme * (1 + 0.15 * cond.denat)));
      roundShadow.position.x = enzymeGroup.position.x;
      slabShadow.material.opacity = visV.energy;
      slabShadow.scale.setScalar(Math.max(0.001, visV.energy));
    }

    /* ================= Camera & layout ================= */
    const shift = { x: 0, y: 0 };
    const offsetTarget = () => (opts.viewOffset ? opts.viewOffset() : { x: 0, y: 0 });
    function applyView() {
      const { w, h } = size();
      camera.setViewOffset(w, h, shift.x, shift.y, w, h);
      camera.updateProjectionMatrix();
    }
    function layout() {
      const { w, h } = size();
      renderer.setSize(w, h, false);
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      camera.aspect = w / h;
      const o = offsetTarget();
      shift.x = o.x; shift.y = o.y;
      applyView();
    }
    const ro = new ResizeObserver(layout);
    ro.observe(el);

    // Portrait screens need the camera further back
    function viewFactor() {
      const { w, h } = size(), a = w / h;
      return a < 1 ? Math.min(1.9, 1 + (1 - a) * 1.4) : a < 1.35 ? 1.12 : 1;
    }

    let fly = null;
    const sph0 = new THREE.Spherical(), sph1 = new THREE.Spherical(), off = new V3();
    function flyTo(cam, dur = 1.6) {
      if (!cam) return;
      const tgt = new V3(...cam.target);
      const pos = new V3(...cam.pos).sub(tgt).multiplyScalar(viewFactor()).add(tgt);
      if (!dur) { camera.position.copy(pos); controls.target.copy(tgt); fly = null; return; }
      fly = { p0: camera.position.clone(), t0: controls.target.clone(), p1: pos, t1: tgt, t: 0, dur };
    }
    function updateFly(dt) {
      if (!fly) return;
      fly.t = Math.min(1, fly.t + dt / fly.dur);
      const e = easeInOutCubic(fly.t);
      controls.target.lerpVectors(fly.t0, fly.t1, e);
      // arc around the target on a sphere rather than cutting through it
      sph0.setFromVector3(off.copy(fly.p0).sub(fly.t0));
      sph1.setFromVector3(off.copy(fly.p1).sub(fly.t1));
      let dTheta = sph1.theta - sph0.theta;
      if (dTheta > Math.PI) dTheta -= Math.PI * 2;
      if (dTheta < -Math.PI) dTheta += Math.PI * 2;
      sph0.set(sph0.radius + (sph1.radius - sph0.radius) * e, sph0.phi + (sph1.phi - sph0.phi) * e, sph0.theta + dTheta * e);
      camera.position.setFromSpherical(sph0).add(controls.target);
      if (fly.t >= 1) fly = null;
    }
    controls.addEventListener('start', () => { fly = null; userMoved = true; });

    /* ================= Labels ================= */
    const labelLayer = document.createElement('div');
    labelLayer.className = 'enz-labels';
    labelLayer.setAttribute('aria-hidden', 'true');
    el.appendChild(labelLayer);
    const labels = [];
    function label(html, color, getPos, isOn) {
      const e = document.createElement('div');
      e.className = 'enz-label';
      e.style.setProperty('--c', color);
      e.innerHTML = `<span class="stem"></span><span class="dot"></span><span class="enz-tag"><span>${html}</span></span>`;
      labelLayer.appendChild(e);
      const Lb = { el: e, pill: e.querySelector('.enz-tag'), getPos, isOn, html, color };
      Lb.set = (h, c) => {
        if (h !== Lb.html) { Lb.html = h; Lb.pill.firstChild.innerHTML = h; }
        if (c && c !== Lb.color) { Lb.color = c; e.style.setProperty('--c', c); }
      };
      labels.push(Lb);
      return Lb;
    }
    const lv = new V3();
    function updateLabels() {
      const { w, h } = size();
      for (const Lb of labels) {
        let on = !!Lb.isOn();
        if (on) {
          Lb.getPos(lv).project(camera);
          if (lv.z > 1) on = false;
          else Lb.el.style.transform = `translate3d(${((lv.x + 1) / 2 * w).toFixed(1)}px, ${((1 - lv.y) / 2 * h).toFixed(1)}px, 0)`;
        }
        Lb.el.classList.toggle('on', on);
      }
    }

    const fv = new V3(), fp = new V3(), fc = new V3();
    function facing(dir, r) {
      fv.copy(dir).applyQuaternion(enzymeGroup.quaternion);
      fp.copy(dir).multiplyScalar(r).applyMatrix4(enzymeGroup.matrixWorld);
      return fv.dot(fc.copy(camera.position).sub(fp).normalize()) > 0.2;
    }
    const inEnz = (v, x, y, z) => enzymeGroup.localToWorld(v.set(x, y, z));

    label('Amino acid', '#9a958b', v => chain.beads[4].getWorldPosition(v),
      () => cur === 'fold' && fold.t < chain.delay(4) + 0.05 && visV.chain > 0.5);
    label('Folded enzyme', COLORS.enzymeA, v => inEnz(v, 0.25, E.R + 0.05, 0.3),
      () => cur === 'fold' && fold.t > chain.duration + 0.6);
    const siteL = label('Active site', COLORS.site,
      v => enzymeGroup.localToWorld(v.copy(E.P).multiplyScalar(E.R * 0.98).addScaledVector(E.U, 0.62)),
      () => (cur === 'site' || cur === 'conditions') && visV.enzyme > 0.8 && facing(E.P, E.R));
    label('Enzyme', COLORS.enzymeA, v => enzymeGroup.localToWorld(v.set(0.62, -0.5, 0.62).normalize().multiplyScalar(E.R * 0.97)),
      () => cur === 'site');
    const subL = label('Substrate', COLORS.subA, v => {
      const r = reactor.focus();
      return r ? molRoot.localToWorld(v.copy(r.g.position).addScaledVector(E.U, 0.3)) : v.set(0, 0, 0);
    }, () => (cur === 'binding' || cur === 'catalysis') && reactor.focus() && reactor.focus().t > 0.15);
    label('Products', COLORS.subB, v => {
      const r = reactor.releasing();
      return r ? r.g.userData.B.getWorldPosition(v) : v.set(0, 0, 0);
    }, () => cur === 'catalysis' && reactor.releasing() && reactor.releasing().t > 0.2);
    const inhL = label('Competitive inhibitor', COLORS.comp, v => {
      const i = reactor.shownInhibitor();
      return i ? i.g.getWorldPosition(v) : v.set(0, 0, 0);
    }, () => cur === 'inhibition' && reactor.shownInhibitor());
    label('Allosteric site', COLORS.alloInh,
      v => enzymeGroup.localToWorld(v.copy(E.Q).multiplyScalar(E.R * 0.95).addScaledVector(E.QU, 0.45)),
      () => cur === 'inhibition' && reactor.allo.state === 'away' && facing(E.Q, E.R));
    const ep = energy.points;
    const onEnergy = () => cur === 'energy' && visV.energy > 0.7;
    label('Reactants', COLORS.subA, v => energy.group.localToWorld(v.copy(ep.reactants)), onEnergy);
    label('Products', COLORS.subB, v => energy.group.localToWorld(v.copy(ep.products)), onEnergy);
    label('E<sub>a</sub> without enzyme', '#7a7366', v => energy.group.localToWorld(v.copy(ep.peakUn)), onEnergy);
    label('E<sub>a</sub> with enzyme', COLORS.catEdge, v => energy.group.localToWorld(v.copy(ep.peakCat)), onEnergy);

    function updateDynamicLabels() {
      const r = reactor.focus();
      if (r) subL.set(r.phase === 'close' || r.phase === 'hold' || r.phase === 'react' ? 'Enzyme–substrate complex' : 'Substrate');
      const i = reactor.shownInhibitor();
      if (i) inhL.set(i === reactor.comp ? 'Competitive inhibitor' : 'Allosteric inhibitor', i === reactor.comp ? COLORS.comp : COLORS.alloInh);
      siteL.set(cond.denat > 0.45 ? 'Active site deformed' : 'Active site', cond.denat > 0.45 ? '#c8423c' : COLORS.site);
    }

    /* ================= Events ================= */
    const subs = {};
    const emit = (ev, v) => (subs[ev] || []).forEach(fn => fn(v));
    reactor.onTurnover = n => emit('turnover', n);
    energy.onCross = n => emit('cross', n);

    /* ================= Step presets ================= */
    function resetDefaults() {
      targets.enzyme = 1; targets.chain = 0; targets.energy = 0;
      enzOp.target = 1;
      glowTarget = 0;
      spin = 'none';
      cond.denatTarget = 0; cond.jitter = 0;
      reactor.driftTarget = 0;
      reactor.rigid = false;
      reactor.rate = 1;
      reactor.moveRate = null;
      reactor.bindChance = 1;
      reactor.setInhibit('none');
    }

    const params = { model: 'induced', speed: 1, T: 37, pH: 7, inhibit: 'competitive' };

    function setConditions(T, pH) {
      params.T = T; params.pH = pH;
      const a = tempF(T) * phF(pH), dn = denatOf(T, pH);
      if (cur === 'conditions') {
        cond.denatTarget = dn;
        cond.jitter = 0.003 + (T / 80) * 0.05;
        reactor.rate = 0.18 + 1.5 * a;
        reactor.moveRate = 0.45 + T / 60;    // warmer molecules move faster, even when the enzyme fails
        reactor.bindChance = 1 - smoothstep(0.2, 0.65, dn);
      }
      return { a, dn };
    }

    const ENTER = {
      fold() {
        reactor.reset();
        targets.chain = 1;
        enzOp.target = 0; enzOp.v = 0;
        fold.t = -1.0; fold.zoomed = false;
        spin = 'fold';
      },
      site() { reactor.reset(); glowTarget = 1; spin = 'sway'; },
      binding() {
        reactor.reset();
        reactor.rigid = params.model === 'lock';
        reactor.mode = 'bind';
        reactor.driftTarget = 1;
      },
      catalysis() { reactor.mode = 'cycle'; reactor.rate = params.speed; reactor.driftTarget = 1; },
      energy() { reactor.reset(); targets.enzyme = 0; targets.energy = 1; },
      conditions() { reactor.mode = 'cycle'; reactor.driftTarget = 1; setConditions(params.T, params.pH); },
      inhibition() { reactor.mode = 'cycle'; reactor.driftTarget = 1; reactor.setInhibit(params.inhibit); },
    };

    let firstShow = true;
    function show(k, step = {}) {
      cur = k;
      userMoved = false;
      fold.after = step.cameraAfter || null;
      resetDefaults();
      ENTER[k]();
      flyTo(step.camera, firstShow ? 0 : 1.6);
      firstShow = false;
    }

    /* ================= Loop ================= */
    function tick(dt) {
      time += dt;
      if (cur === 'fold') {
        fold.t += dt;
        chain.setProgress(fold.t);
        const done = fold.t > chain.duration + 0.15;
        enzOp.target = done ? 0.26 : 0;
        if (done && !fold.zoomed) {
          fold.zoomed = true;
          if (!userMoved && fold.after) flyTo(fold.after, 2.2);
        }
      }
      const o = offsetTarget();
      if (Math.abs(shift.x - o.x) > 0.3 || Math.abs(shift.y - o.y) > 0.3) {
        shift.x += (o.x - shift.x) * damp(dt, 6);
        shift.y += (o.y - shift.y) * damp(dt, 6);
        applyView();
      }
      updateFly(dt);
      controls.update();
      updateVis(dt);
      reactor.update(dt);
      updateEnzyme(dt);
      energy.update(dt);
    }
    const clock = new THREE.Clock();
    let raf = 0;
    function frame() {
      raf = requestAnimationFrame(frame);
      tick(Math.min(clock.getDelta(), 0.05));
      updateDust(time);
      renderer.render(scene, camera);
      updateDynamicLabels();
      updateLabels();
    }
    layout();
    frame();

    return {
      show, flyTo, setConditions,
      get key() { return cur; },
      chainLength: chain.beads.length,
      aaTypes: M.AA_TYPES, colors: COLORS,
      tempF, phF, T_OPT, PH_OPT,
      turnovers: () => reactor.turnovers,
      crossed: () => ({ cat: energy.count, un: energy.countUn }),
      replayFold(cam) { fold.t = -0.8; fold.zoomed = false; userMoved = false; flyTo(cam, 1.2); },
      setModel(m) { params.model = m; if (cur === 'binding') show('binding'); },
      replayBind() { if (cur === 'binding') ENTER.binding(); },
      setSpeed(s) { params.speed = s; if (cur === 'catalysis') reactor.rate = s; },
      setInhibitor(kind) { params.inhibit = kind; if (cur === 'inhibition') reactor.setInhibit(kind); },
      params,
      on(ev, fn) { (subs[ev] = subs[ev] || []).push(fn); return () => { subs[ev] = subs[ev].filter(f => f !== fn); }; },
      /* Steps the simulation without rAF, for a tab where rAF does not run. */
      advance(sec) { for (let t = 0; t < sec; t += 1 / 30) tick(1 / 30); },
      destroy() {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        renderer.dispose();
        canvas.remove();
        labelLayer.remove();
      },
    };
  }

  global.Enzyme = { mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
