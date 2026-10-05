/* enzyme-reactor.js: choreographs substrates, products and inhibitors around the enzyme.
   Everything lives in the enzyme's local frame, so it moves with the enzyme. */
class EnzymeReactor {
  constructor(root) {
    const { E } = EnzymeModels;
    this.E = E;
    this.root = root;
    this.rand = EnzymeLib.rng(99);
    this.v = new THREE.Vector3();

    this.pool = [];
    for (let i = 0; i < 4; i++) {
      const g = EnzymeModels.makeSubstrate();
      g.visible = false;
      root.add(g);
      this.pool.push({ g, phase: 'free', t: 0 });
    }

    // Background substrates drifting in solution
    this.drift = new THREE.Group();
    root.add(this.drift);
    this.drifters = [];
    for (let i = 0; i < 6; i++) {
      const g = EnzymeModels.makeSubstrate();
      this.drift.add(g);
      this.drifters.push({ g, seed: i * 3.7 + 0.5, side: i % 2 ? 1 : -1, axis: EnzymeLib.randomUnit(this.rand, new THREE.Vector3()) });
    }
    this.driftV = 0;
    this.driftTarget = 0;

    this.comp = { g: EnzymeModels.makeInhibitor(), state: 'away', t: 0, normal: E.P, side: E.L, dock: E.dock, q: E.qDock };
    this.allo = { g: EnzymeModels.makeAllostericInhibitor(), state: 'away', t: 0, normal: E.Q, side: E.QL, dock: E.alloDock, q: E.qAllo };
    for (const inh of [this.comp, this.allo]) { inh.g.visible = false; root.add(inh.g); }

    // Reaction flash + sparks
    this.flash = EnzymeModels.makeGlow('#ffc462', 1);
    this.flash.visible = false;
    root.add(this.flash);
    this.flashT = 1;
    const sGeo = new THREE.SphereGeometry(0.045, 10, 8);
    const sMat = new THREE.MeshBasicMaterial({ color: EnzymeLib.col('#ffab2e') });
    this.sparks = [];
    for (let i = 0; i < 16; i++) {
      const m = new THREE.Mesh(sGeo, sMat);
      m.visible = false;
      root.add(m);
      this.sparks.push({ m, vel: new THREE.Vector3() });
    }

    this.mode = 'off';        // 'off' | 'bind' (dock once and hold) | 'cycle'
    this.rate = 1;
    this.moveRate = null;     // how fast molecules diffuse (defaults to rate)
    this.rigid = false;       // lock-and-key: the enzyme doesn't flex
    this.bindChance = 1;      // < 1 when denatured
    this.inhibit = 'none';
    this.close = 0;
    this.pinch = 0;
    this.time = 0;
    this.turnovers = 0;
    this.onTurnover = null;
    this.reset();
  }

  reset() {
    for (const r of this.pool) this.free(r);
    for (const inh of [this.comp, this.allo]) { inh.state = 'away'; inh.again = false; inh.g.visible = false; }
    this.inhibit = 'none';
    this.mode = 'off';
    this.close = this.pinch = 0;
    this.spawnDelay = 0.5;
    this.bindSpawned = false;
    this.flash.visible = false;
    this.flashT = 1;
    for (const s of this.sparks) s.m.visible = false;
  }

  setInhibit(kind) {
    this.inhibit = kind;
    for (const [k, inh] of [['competitive', this.comp], ['allosteric', this.allo]]) {
      if (k === kind) {
        if (inh.state === 'away') inh.state = 'wait';
        else if (inh.state === 'leave') inh.again = true;
      } else {
        inh.again = false;
        if (inh.state === 'approach' || inh.state === 'docked') {
          inh.state = 'leave';
          inh.t = 0;
          inh.from = inh.g.position.clone();
        } else if (inh.state === 'wait') inh.state = 'away';
      }
    }
  }

  free(rec) {
    rec.phase = 'free';
    rec.g.visible = false;
  }

  focus() { return this.pool.find(r => r.phase !== 'free' && r.phase !== 'release'); }
  releasing() { return this.pool.find(r => r.phase === 'release' && r.t < 0.75); }
  shownInhibitor() {
    for (const inh of [this.comp, this.allo]) if (inh.state === 'approach' || inh.state === 'docked') return inh;
    return null;
  }

  spawn() {
    const rec = this.pool.find(r => r.phase === 'free');
    if (!rec) return;
    const { E, rand } = this;
    const side = rand() < 0.5 ? -1 : 1;
    rec.bind = this.inhibit === 'none' && rand() < this.bindChance;
    rec.side = side;
    rec.start = E.dock.clone()
      .addScaledVector(E.P, 1.5 + rand() * 1.0)
      .addScaledVector(E.L, side * (4.2 + rand() * 1.4))
      .addScaledVector(E.U, -1.4 + rand() * 3.2);
    rec.end = rec.bind ? E.dock.clone() : E.dock.clone().addScaledVector(E.P, this.bindChance < 1 ? 1.35 : 1.0);
    // control point above the pocket so the final approach comes straight down into it
    rec.ctrl = rec.end.clone().addScaledVector(E.P, 2.4).addScaledVector(E.L, side * 0.8);
    rec.q0 = EnzymeLib.randomQuat(rand);
    rec.seed = rand() * 100;
    rec.phase = 'approach';
    rec.t = 0;

    const { A, B, bond, bondMat } = rec.g.userData;
    A.position.set(-0.28, 0, 0); A.rotation.set(0, 0, 0); A.scale.setScalar(1);
    B.position.set(0.28, 0, 0); B.rotation.set(0, 0, 0); B.scale.setScalar(1);
    bond.visible = true;
    bond.scale.set(1, 1, 1);
    bondMat.emissiveIntensity = 0.15;
    rec.g.visible = true;
    rec.g.scale.setScalar(0.001);
  }

  burst(pos) {
    this.flash.position.copy(pos);
    this.flash.visible = true;
    this.flashT = 0;
    for (const s of this.sparks) {
      s.m.position.copy(pos);
      EnzymeLib.randomUnit(this.rand, s.vel).multiplyScalar(1.4 + this.rand() * 1.8);
      s.m.visible = true;
    }
  }

  update(dt) {
    this.time += dt;
    const r = this.rate, E = this.E;

    const incoming = this.pool.some(p => p.phase !== 'free' && p.phase !== 'release');
    const wantSpawn = this.mode === 'cycle' || (this.mode === 'bind' && !this.bindSpawned);
    if (wantSpawn && !incoming) {
      this.spawnDelay -= dt * Math.max(r, 0.5);
      if (this.spawnDelay <= 0) {
        this.spawn();
        if (this.mode === 'bind') this.bindSpawned = true;
        this.spawnDelay = 0.25;
      }
    }

    let docked = false, pocketBusy = false;
    for (const rec of this.pool) {
      if (rec.phase === 'free') continue;
      this.step(rec, dt, r);
      if (rec.phase === 'close' || rec.phase === 'react' || rec.phase === 'hold') docked = true;
      if (docked || (rec.phase === 'approach' && rec.bind)) pocketBusy = true;
    }
    for (const inh of [this.comp, this.allo]) this.stepInhibitor(inh, dt, pocketBusy);

    let closeT = docked ? 1 : this.comp.state === 'docked' ? 0.4 : 0;
    if (this.rigid) closeT = 0;
    this.close += (closeT - this.close) * EnzymeLib.damp(dt, 6 * EnzymeLib.clamp(r, 0.6, 2));
    this.pinch += ((this.allo.state === 'docked' ? 1 : 0) - this.pinch) * EnzymeLib.damp(dt, 2.5);

    // flash + sparks
    if (this.flashT < 1) {
      this.flashT = Math.min(1, this.flashT + dt / 0.6);
      const e = EnzymeLib.easeOutCubic(this.flashT);
      this.flash.scale.setScalar(0.3 + e * 2.4);
      this.flash.material.opacity = Math.pow(1 - this.flashT, 1.6) * 0.95;
      for (const s of this.sparks) {
        s.m.position.addScaledVector(s.vel, dt);
        s.vel.multiplyScalar(1 - dt * 2.5);
        s.m.scale.setScalar(Math.max(0.001, 1 - this.flashT));
      }
      if (this.flashT >= 1) {
        this.flash.visible = false;
        for (const s of this.sparks) s.m.visible = false;
      }
    }

    // drifting background molecules stay to the sides and behind the enzyme
    this.driftV += (this.driftTarget - this.driftV) * EnzymeLib.damp(dt, 3);
    this.drift.visible = this.driftV > 0.01;
    if (this.drift.visible) {
      const t = this.time * 0.07;
      for (const d of this.drifters) {
        d.g.position.set(
          d.side * (5.4 + 1.6 * EnzymeLib.noise3(t, d.seed, 0.5)),
          0.5 + 2.2 * EnzymeLib.noise3(d.seed, t, 2.5),
          -2.4 + 3.4 * EnzymeLib.noise3(4.5, d.seed, t)
        );
        d.g.rotateOnAxis(d.axis, dt * 0.35);
        d.g.scale.setScalar(Math.max(0.001, 0.72 * this.driftV));
      }
    }
  }

  step(rec, dt, r) {
    const E = this.E, g = rec.g, { A, B, bond, bondMat } = g.userData;
    const { clamp, easeInOutCubic, easeOutCubic, smoothstep } = EnzymeLib;
    switch (rec.phase) {
      case 'approach': {
        rec.t += (dt * (this.moveRate || r)) / 2.1;
        const t = Math.min(rec.t, 1), e = easeInOutCubic(t);
        EnzymeLib.bezier(rec.start, rec.ctrl, rec.end, e, g.position);
        const w = Math.pow(1 - e, 1.5) * 0.35; // random thermal wobble that settles on arrival
        g.position.x += EnzymeLib.noise3(this.time * 0.9, rec.seed, 0) * w;
        g.position.y += EnzymeLib.noise3(rec.seed, this.time * 0.9, 1) * w;
        g.quaternion.copy(rec.q0).slerp(E.qDock, easeInOutCubic(clamp(t * 1.1)));
        g.scale.setScalar(Math.max(0.001, easeOutCubic(clamp(t / 0.15))));
        if (rec.t >= 1) {
          rec.t = 0;
          if (rec.bind) rec.phase = 'close';
          else {
            rec.phase = 'bounce';
            rec.from = g.position.clone();
            rec.q0 = g.quaternion.clone();
            rec.dir = E.L.clone().multiplyScalar(rec.side).addScaledVector(E.P, -0.25).addScaledVector(E.U, (this.rand() - 0.3) * 0.7).normalize();
          }
        }
        break;
      }
      case 'close':
        rec.t += (dt * r) / 0.55;
        bondMat.emissiveIntensity = 0.15 + rec.t * 0.25;
        if (rec.t >= 1) { rec.t = 0; rec.phase = this.mode === 'bind' ? 'hold' : 'react'; }
        break;
      case 'hold':
        bondMat.emissiveIntensity = 0.4 + Math.sin(this.time * 3) * 0.15;
        if (this.mode === 'cycle') { rec.phase = 'react'; rec.t = 0; }
        break;
      case 'react': {
        rec.t += (dt * r) / 1.1;
        const t = Math.min(rec.t, 1);
        const stretch = easeInOutCubic(t) * 0.07;
        const vib = Math.sin(this.time * 55) * 0.014 * t;
        A.position.x = -0.28 - stretch - vib;
        B.position.x = 0.28 + stretch + vib;
        bond.scale.y = (0.34 + 2 * (stretch + vib)) / 0.34;
        bondMat.emissiveIntensity = 0.4 + t * 2.4 + Math.sin(this.time * 30) * 0.4 * t;
        if (rec.t >= 1) {
          rec.phase = 'release';
          rec.t = 0;
          bond.visible = false;
          this.burst(g.position);
          this.turnovers++;
          if (this.onTurnover) this.onTurnover(this.turnovers);
        }
        break;
      }
      case 'release': {
        rec.t += (dt * r) / 1.8;
        const t = Math.min(rec.t, 1), e = easeOutCubic(t);
        // local +z points out of the pocket
        A.position.set(-0.32 - 1.5 * e, 0.4 * e, 2.7 * e);
        B.position.set(0.32 + 1.6 * e, -0.25 * e, 2.5 * e);
        A.rotation.set(e * 2.2, e * 1.3, 0);
        B.rotation.set(-e * 1.8, e * 2.0, 0);
        const s = Math.max(0.001, 1 - smoothstep(0.65, 1, t));
        A.scale.setScalar(s);
        B.scale.setScalar(s);
        if (rec.t >= 1) this.free(rec);
        break;
      }
      case 'bounce': {
        rec.t += (dt * Math.max(this.moveRate || r, 0.6)) / 1.5;
        const t = Math.min(rec.t, 1);
        const e = easeOutCubic(clamp((t - 0.14) / 0.86));
        const jig = t < 0.2 ? Math.sin(t * 90) * 0.05 * (1 - t / 0.2) : 0;
        g.position.copy(rec.from).addScaledVector(rec.dir, e * 4).addScaledVector(E.L, jig);
        g.rotateOnAxis(E.U, dt * 2.5 * e);
        g.scale.setScalar(Math.max(0.001, 1 - smoothstep(0.5, 1, t)));
        if (rec.t >= 1) this.free(rec);
        break;
      }
    }
  }

  stepInhibitor(inh, dt, pocketBusy) {
    const { clamp, easeInOutCubic, easeOutCubic, smoothstep } = EnzymeLib;
    const g = inh.g;
    if (inh.state === 'wait') {
      if (pocketBusy) return;
      const side = this.rand() < 0.5 ? -1 : 1;
      inh.start = inh.dock.clone().addScaledVector(inh.normal, 4.2).addScaledVector(inh.side, side * 2.6).addScaledVector(this.E.U, 0.8);
      inh.ctrl = inh.dock.clone().addScaledVector(inh.normal, 2.3);
      inh.q0 = EnzymeLib.randomQuat(this.rand);
      inh.t = 0;
      inh.state = 'approach';
      g.visible = true;
      g.scale.setScalar(0.001);
    } else if (inh.state === 'approach') {
      inh.t += dt / 2.0;
      const t = Math.min(inh.t, 1);
      EnzymeLib.bezier(inh.start, inh.ctrl, inh.dock, easeInOutCubic(t), g.position);
      g.quaternion.copy(inh.q0).slerp(inh.q, easeInOutCubic(clamp(t * 1.1)));
      g.scale.setScalar(Math.max(0.001, easeOutCubic(clamp(t / 0.15))));
      if (inh.t >= 1) inh.state = 'docked';
    } else if (inh.state === 'docked') {
      g.position.copy(inh.dock).addScaledVector(inh.normal, Math.sin(this.time * 2.2) * 0.012);
    } else if (inh.state === 'leave') {
      inh.t += dt / 1.4;
      const t = Math.min(inh.t, 1), e = easeOutCubic(t);
      g.position.copy(inh.from).addScaledVector(inh.normal, e * 3.4).addScaledVector(inh.side, e * 1.4);
      g.scale.setScalar(Math.max(0.001, 1 - smoothstep(0.6, 1, t)));
      if (inh.t >= 1) {
        g.visible = false;
        inh.state = inh.again ? 'wait' : 'away';
        inh.again = false;
      }
    }
  }
}
