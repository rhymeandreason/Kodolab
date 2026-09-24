/* =============================================================================
 *  bloodcell/bloodflow.js — a vessel of red cells, and what a stiff one does in it
 * =============================================================================
 *  Classic script after lib/scene.js, kit/card-stage.js and bloodcell.js (for
 *  the disc profile and the red). Exposes window.BloodFlow on the component
 *  contract.
 *
 *      const N = BloodFlow.mount(elL, { sickle: 0 });   // discs slip through
 *      const S = BloodFlow.mount(elR, { sickle: 1 });   // crescents catch and stick
 *      S.state().blocked;   S.reset();
 *
 *  ONE VESSEL THAT NARROWS, the same on both sides. A disc turns face-on and
 *  goes through the throat in single file. A crescent is stiff and longer than
 *  the throat is wide: it catches unless it happens to arrive end-on, and every
 *  crescent that touches a caught one sticks to it. The jam grows upstream
 *  until nothing moves. That is the whole mechanism of a vaso-occlusive crisis
 *  at the scale a student can see, and it needs no chemistry that step 3 has
 *  not already shown.
 *
 *  ---- MEASURED AND NOT --------------------------------------------------------
 *
 *    MEASURED   the disc (bloodcell.js's Evans & Fung profile, 7.8 µm), the
 *               vessel radii, and the crescent's LENGTH (about 11 µm, in the
 *               range of a deoxygenated sickle cell). A scene unit is a µm.
 *    NOT        the crescent's exact shape (bloodcell.js calls its own a
 *               caricature, and this is a low-polygon one), the speed (real
 *               capillary flow is a millimetre a second and would be a blur), and
 *               the sticking rule, which is touching and not
 *               adhesion chemistry. state() reports counts and lengths, never a
 *               rate.
 *
 *  ---- PARAMS ------------------------------------------------------------------
 *
 *    sickle   0..1  fraction of the cells that are crescents (rebuild, snaps)
 *    n        cells in the vessel (rebuild, snaps)
 *    speed    choreography; 1 is watchable
 *    throat   throat radius / vessel radius (rebuild)
 *    seed     another seed is another crowd
 *
 *  Anchors for note(): throat · jam (only once something is caught) · cell.
 *  Events: jam (the first cell caught), blocked (nothing left moving).
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = { sickle: 0, n: 40, speed: 1, throat: 0.6, seed: 3 };

  const R0 = 9;                 // µm, the vessel before it narrows
  const HALF = 65;              // µm, half the drawn length
  const X0 = 4, NARROW = 18;    // the throat begins here and takes this long to close
  const U0 = 20;                // µm/s at the axis, before the throat (choreography)

  const CRESCENT = { len: 11.2, thick: 1.25, depth: 0.9, bend: 1.15 };   // µm, radians of arc
  const ALIGN = 16;             // µm upstream of the jam where the stream lays a crescent lengthwise
  const PASS_ANGLE = 0.42;      // radians off the axis a crescent may arrive at and still pass

  const rng = seed => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
  const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  /* ---- geometry ------------------------------------------------------------- */

  function discGeo(THREE) {
    const B = global.BloodCell;
    const K = 18, pts = [];
    for (let k = 0; k <= K; k++) {
      const f = Math.PI * k / K, rho = Math.sin(f);
      pts.push(new THREE.Vector2(Math.max(1e-3, B.R0 * rho), B.AMP * Math.cos(f) * B.profileY(rho)));
    }
    return new THREE.LatheGeometry(pts, 28);
  }

  /* A bent, tapered tube: the centreline is an arc in the xy plane with the
     middle at the origin, the section an ellipse that pinches to a point at
     both horns. Its long axis is local x. */
  function crescentGeo(THREE) {
    const NU = 36, NV = 14, C = CRESCENT;
    const Rb = C.len / C.bend, th0 = C.bend / 2;
    const pos = [], idx = [];
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, ph = -th0 + C.bend * u;
      const taper = Math.pow(Math.sin(Math.PI * u), 0.55);
      const a = C.thick * taper, b = C.depth * taper;
      const cx = Rb * Math.sin(ph), cy = Rb * (Math.cos(ph) - Math.cos(th0));
      const nx = Math.sin(ph), ny = Math.cos(ph);
      for (let j = 0; j <= NV; j++) {
        const v = 2 * Math.PI * j / NV;
        pos.push(cx + a * Math.cos(v) * nx, cy + a * Math.cos(v) * ny, b * Math.sin(v));
      }
    }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) {
      const a = i * (NV + 1) + j, b = a + NV + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }

  function vesselGeo(THREE, Rt) {
    const N = 48, pts = [];
    for (let i = 0; i <= N; i++) {
      const x = -HALF + 2 * HALF * i / N;
      pts.push(new THREE.Vector2(radiusAt(x, Rt), x));
    }
    return new THREE.LatheGeometry(pts, 40);
  }
  const radiusAt = (x, Rt) => R0 - (R0 - Rt) * smooth(X0, X0 + NARROW, x);

  /* ---- the sim ---------------------------------------------------------------- */

  function create(THREE, root, camera, opts) {
    const B = global.BloodCell;
    if (!B || !B.profileY) throw new Error('bloodflow.js: load bloodcell/bloodcell.js first');
    const P = Object.assign({}, DEFAULTS, opts);
    const listeners = {};
    const emit = (ev, a) => CardStage.fire(listeners[ev], [a], 'BloodFlow ' + ev);

    const grp = new THREE.Group();
    root.add(grp);

    let Rt = R0 * P.throat;
    let R = rng(P.seed);
    let cells = [];
    let jammed = false, blocked = false, passed = 0;

    /* The wall, faint, so the cells read through it; the flow axis is x. */
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0xf2d3cc, roughness: 0.9, metalness: 0,
      transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false,
    });
    let wall = null;
    function buildWall() {
      if (wall) { grp.remove(wall); wall.geometry.dispose(); }
      wall = new THREE.Mesh(vesselGeo(THREE, Rt), wallMat);
      wall.rotation.z = -Math.PI / 2;      // the lathe's axis is y; the vessel's is x
      wall.renderOrder = 2;
      grp.add(wall);
    }

    const discMat = new THREE.MeshStandardMaterial({ color: B.COL.outer, roughness: 0.62, metalness: 0.02 });
    const sickMat = new THREE.MeshStandardMaterial({ color: B.COL.outerSickle, roughness: 0.62, metalness: 0.02 });
    const discG = discGeo(THREE), sickG = crescentGeo(THREE);
    let discs = null, sicks = null;
    const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(1, 1, 1);
    const _a = new THREE.Vector3(), _t = new THREE.Vector3(), _x = new THREE.Vector3(1, 0, 0), _z = new THREE.Vector3(0, 0, 1);

    function spawn() {
      R = rng(P.seed);
      cells = [];
      const nS = Math.round(P.n * Math.min(1, Math.max(0, P.sickle)));
      for (let i = 0; i < P.n; i++) {
        const axis = new THREE.Vector3(R() - .5, R() - .5, R() - .5).normalize();
        cells.push({
          kind: i < nS ? 'sickle' : 'disc',
          x: -HALF + 2 * HALF * ((i + 0.5) / P.n) + (R() - .5) * 3,
          rho: Math.sqrt(R()) * 0.8, th: R() * 6.283,
          q: new THREE.Quaternion().setFromAxisAngle(axis, R() * 6.283),
          spin: axis.clone().multiplyScalar(0.35 + R() * 0.4),
          tilt: new THREE.Vector3(0, (R() - .5) * 0.8, (R() - .5) * 0.8),
          stuck: false, sticky: false, touchStuck: false, counted: false,
          pos: new THREE.Vector3(),
        });
      }
      if (discs) { grp.remove(discs); discs.dispose(); }
      if (sicks) { grp.remove(sicks); sicks.dispose(); }
      discs = new THREE.InstancedMesh(discG, discMat, Math.max(1, P.n - nS));
      sicks = new THREE.InstancedMesh(sickG, sickMat, Math.max(1, nS));
      for (const m of [discs, sicks]) { m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); m.frustumCulled = false; grp.add(m); }
      jammed = false; blocked = false; passed = 0;
      place();
      for (let k = 0; k < 20; k++) separate();
      upload();
    }

    /* Half the room a cell needs, measured on its own geometry: the disc's
       radius, the crescent's half-length. Read once, not typed. */
    discG.computeBoundingSphere(); sickG.computeBoundingSphere();
    const halfOf = c => (c.kind === 'disc' ? discG.boundingSphere.radius : sickG.boundingSphere.radius);

    const roomAt = (c, Rx) => Math.max(0, Rx - (c.kind === 'disc' ? Math.min(halfOf(c), Rx) * 0.98 : CRESCENT.thick));

    function place() {
      for (const c of cells) {
        const Rx = radiusAt(c.x, Rt);
        /* A disc fits the throat face-on and only face-on, so its centre is
           forced to the axis as the wall closes in; a crescent keeps its
           offset, which is what puts it against the wall. */
        const rc = c.rho * roomAt(c, Rx);
        c.pos.set(c.x, rc * Math.cos(c.th), rc * Math.sin(c.th));
      }
    }

    /* No two cells overlap, and a crescent stays inside the wall. Each cell is
       a cluster of spheres: a disc's on its midplane, each as thick as the
       measured profile is at that radius, so two discs stacked face-on touch
       rim to rim; a crescent's along its arc, tapering to the horns. Overlaps
       are pushed apart along the deepest contact and written back to x, rho,
       th, so a cell that meets one ahead waits behind it rather than being
       placed through it next frame. A caught cell does not move, which is
       what lets the jam hold the cells piling onto it. */
    const discHull = (() => {
      const out = [];
      for (const [rho, n] of [[0, 1], [0.36, 6], [0.7, 12]]) {
        const r = B.R0 * rho, t = B.AMP * Math.sqrt(1 - rho * rho) * B.profileY(rho);
        for (let k = 0; k < n; k++) {
          const a = 2 * Math.PI * k / n;
          out.push({ p: new THREE.Vector3(r * Math.cos(a), 0, r * Math.sin(a)), r: t });
        }
      }
      return out;
    })();
    /* The same arc crescentGeo() sweeps. */
    const sickHull = (() => {
      const C = CRESCENT, Rb = C.len / C.bend, th0 = C.bend / 2, out = [];
      for (let i = 0; i < 9; i++) {
        const u = 0.07 + 0.86 * i / 8, ph = -th0 + C.bend * u;
        const taper = Math.pow(Math.sin(Math.PI * u), 0.55);
        out.push({ p: new THREE.Vector3(Rb * Math.sin(ph), Rb * (Math.cos(ph) - Math.cos(th0)), 0), r: 0.5 * (C.thick + C.depth) * taper });
      }
      return out;
    })();
    const hullOf = c => (c.kind === 'disc' ? discHull : sickHull);
    const TOUCH = 0.15;          // µm of gap that still counts as touching, for sticking
    const _d = new THREE.Vector3(), _n = new THREE.Vector3();

    function hullWorld(c) {
      const h = hullOf(c);
      if (!c.hw) c.hw = new Float32Array(h.length * 3);
      for (let k = 0; k < h.length; k++) {
        _p.copy(h[k].p).applyQuaternion(c.q).add(c.pos);
        c.hw[3 * k] = _p.x; c.hw[3 * k + 1] = _p.y; c.hw[3 * k + 2] = _p.z;
      }
    }

    /* Deepest overlap between two cells' spheres, its normal (a to b) left in _d. */
    function contact(a, b) {
      const ha = hullOf(a), hb = hullOf(b);
      let best = -Infinity;
      for (let k = 0; k < ha.length; k++) for (let l = 0; l < hb.length; l++) {
        const dx = b.hw[3 * l] - a.hw[3 * k], dy = b.hw[3 * l + 1] - a.hw[3 * k + 1], dz = b.hw[3 * l + 2] - a.hw[3 * k + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz), pen = ha[k].r + hb[l].r - d;
        if (pen > best) { best = pen; if (d > 1e-6) _d.set(dx / d, dy / d, dz / d); else _d.subVectors(b.pos, a.pos).normalize(); }
      }
      if (_d.lengthSq() < 1e-9) _d.set(1, 0, 0);
      return best;
    }

    /* Pushes a crescent's centre in by the sphere that pokes furthest through the wall. */
    function wallPush(c) {
      const h = sickHull;
      let worst = 0;
      for (let k = 0; k < h.length; k++) {
        const y = c.hw[3 * k + 1], z = c.hw[3 * k + 2], r = Math.hypot(y, z);
        const over = r - (radiusAt(c.hw[3 * k], Rt) - h[k].r);
        if (over > worst && r > 1e-6) { worst = over; _n.set(0, -y / r, -z / r); }
      }
      if (worst > 0) c.pos.addScaledVector(_n, worst);
      return worst > 0;
    }

    function separate(touches) {
      if (cells.length < 2) return;
      for (let it = 0; it < 4; it++) {
        for (const c of cells) hullWorld(c);
        let moved = false;
        for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
          const a = cells[i], b = cells[j];
          if (a.stuck && b.stuck) continue;
          const reach = halfOf(a) + halfOf(b);
          if (Math.abs(a.pos.x - b.pos.x) > reach || a.pos.distanceToSquared(b.pos) > reach * reach) continue;
          const pen = contact(a, b);
          if (touches && pen > -TOUCH && a.kind === 'sickle' && b.kind === 'sickle') touches.push(a, b);
          if (pen <= 0) continue;
          const wa = a.stuck ? 0 : 1, wb = b.stuck ? 0 : 1;
          _d.multiplyScalar(pen + 0.01);
          b.pos.addScaledVector(_d, wb / (wa + wb)); a.pos.addScaledVector(_d, -wa / (wa + wb));
          moved = true;
        }
        for (const c of cells) {
          if (c.stuck) continue;
          if (c.kind === 'sickle') { hullWorld(c); if (wallPush(c)) moved = true; }
          toCyl(c);
        }
        place();
        touches = null;
        if (!moved) break;
      }
    }

    /* The inverse of place(): where a cell was pushed, as flow coordinates. */
    function toCyl(c) {
      c.x = c.pos.x;
      const room = roomAt(c, radiusAt(c.x, Rt));
      const r = Math.hypot(c.pos.y, c.pos.z);
      if (room > 1e-3 && r > 1e-6) { c.rho = Math.min(1, r / room); c.th = Math.atan2(c.pos.z, c.pos.y); }
    }

    function upload() {
      let d = 0, s = 0;
      for (const c of cells) {
        _m.compose(c.pos, c.q, _s);
        if (c.kind === 'disc') discs.setMatrixAt(d++, _m); else sicks.setMatrixAt(s++, _m);
      }
      discs.count = d; sicks.count = s;
      discs.instanceMatrix.needsUpdate = true; sicks.instanceMatrix.needsUpdate = true;
    }

    /* Poiseuille in the wide part, faster through the throat by continuity. */
    const flowAt = (x, rho) => U0 * P.speed * (1 - 0.7 * rho * rho) * Math.pow(R0 / radiusAt(x, Rt), 2);

    function step(dt) {
      let moving = 0;
      let tail = Infinity;
      for (const c of cells) if (c.stuck) tail = Math.min(tail, c.x);
      for (const c of cells) {
        if (c.stuck) continue;
        c.x0 = c.x;
        const Rx = radiusAt(c.x, Rt);
        const nearThroat = Rx < R0 - 0.5;
        let u = flowAt(c.x, c.rho);

        if (c.kind === 'disc') {
          /* Turn face-on to the camera as the wall closes: the axis of the
             lathe is local y, so aim it down z. */
          if (nearThroat) {
            _q.setFromUnitVectors(_a.set(0, 1, 0).applyQuaternion(c.q), _z).multiply(c.q);
            c.q.slerp(_q, Math.min(1, 3 * dt));
          } else {
            _q.setFromAxisAngle(_t.copy(c.spin).normalize(), c.spin.length() * dt);
            c.q.premultiply(_q);
          }
        } else {
          /* A crescent that touched a caught one last frame is caught. */
          if (c.touchStuck) { catchCell(c); continue; }
          if (c.sticky) u *= 0.55;
          /* At the throat, only a crescent that arrived nearly end-on fits. */
          if (Rx < CRESCENT.len / 2 + 0.6) {
            _a.copy(_x).applyQuaternion(c.q);
            const off = Math.acos(Math.min(1, Math.abs(_a.x)));
            if (off > PASS_ANGLE || c.sticky) { catchCell(c); continue; }
          }
          /* Shear lays a long cell along the stream as it slows into the jam,
             so the pile stacks lengthwise, each at its own small tilt; one
             still tumbling freely keeps tumbling. */
          if (c.sticky || c.x > tail - ALIGN) {
            _a.copy(_x).applyQuaternion(c.q);
            _t.set(Math.sign(_a.x) || 1, c.tilt.y, c.tilt.z).normalize();
            _q.setFromUnitVectors(_a, _t).multiply(c.q);
            c.q.slerp(_q, Math.min(1, 1.6 * dt));
          } else {
            _q.setFromAxisAngle(_t.copy(c.spin).normalize(), c.spin.length() * dt);
            c.q.premultiply(_q);
          }
        }

        c.x += u * dt;
      }
      place();
      const touches = [];
      separate(touches);
      for (const c of cells) c.touchStuck = false;
      for (let i = 0; i < touches.length; i += 2) {
        const a = touches[i], b = touches[i + 1];
        if (a.stuck) b.touchStuck = true;
        else if (b.stuck) a.touchStuck = true;
        else { a.sticky = true; b.sticky = true; }
      }
      /* Moving means getting somewhere: a cell held against the jam is pushed
         by the flow and pushed back by the pile, and goes nowhere. */
      for (const c of cells) {
        if (c.stuck) continue;
        if (c.x - c.x0 > 0.25 * U0 * P.speed * dt * 0.3) moving++;
        if (c.x > X0 + NARROW && !c.counted) { c.counted = true; passed++; }
        if (c.x > HALF + halfOf(c)) {
          c.x = -HALF - halfOf(c) + 1;
          c.rho = Math.sqrt(R()) * 0.8; c.th = R() * 6.283;
          c.counted = false; c.sticky = false;
        }
      }
      place();
      upload();
      if (!blocked && !moving && cells.length) { blocked = true; emit('blocked', state()); }
    }

    function catchCell(c) {
      c.stuck = true; c.sticky = false;
      if (!jammed) { jammed = true; emit('jam', state()); }
    }

    /* ---- state, anchors ------------------------------------------------------- */

    function state() {
      const stuck = cells.filter(c => c.stuck).length;
      return {
        sickle: P.sickle, n: P.n, speed: P.speed,
        crescents: cells.filter(c => c.kind === 'sickle').length,
        moving: cells.length - stuck, stuck, passed, jammed, blocked,
        vesselR: R0, throatR: Rt, crescentLen: CRESCENT.len, discR: B.R0,
      };
    }

    const _w = new THREE.Vector3();
    const anchors = {
      throat: () => grp.localToWorld(_w.set(X0 + NARROW + 6, Rt, 0)),
      jam: () => {
        const s = cells.filter(c => c.stuck);
        if (!s.length) return null;
        _w.set(0, 0, 0);
        for (const c of s) _w.add(c.pos);
        return grp.localToWorld(_w.multiplyScalar(1 / s.length));
      },
      cell: () => {
        const c = cells.find(k => !k.stuck && k.x < X0) || cells[0];
        return c ? grp.localToWorld(_w.copy(c.pos)) : null;
      },
    };
    const library = {
      throat: { text: 'the vessel narrows', card: 'A capillary is narrower than a red cell. A round cell folds to fit; a stiff one cannot.' },
      jam: { text: 'a jam', card: 'One crescent catches, and every one that touches it sticks. The blockage grows upstream until the flow stops.' },
      cell: { text: 'a red cell', card: 'No nucleus, no organelles: a bag of hemoglobin with a flexible skin, built to bend.' },
    };

    function set(next) {
      let rebuild = false;
      for (const k in next) {
        if (P[k] === next[k]) continue;
        P[k] = next[k];
        if (k === 'sickle' || k === 'n' || k === 'seed') rebuild = true;
        if (k === 'throat') { Rt = R0 * P.throat; buildWall(); rebuild = true; }
      }
      if (rebuild) spawn();
    }
    function reset() { spawn(); return api; }

    buildWall();
    spawn();

    const api = {
      step, state, set, reset, anchors, library, params: P, group: grp,
      on(ev, fn) { (listeners[ev] || (listeners[ev] = [])).push(fn);
        return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); }; },
      dispose() {
        root.remove(grp);
        discG.dispose(); sickG.dispose(); discMat.dispose(); sickMat.dispose(); wallMat.dispose();
        if (wall) wall.geometry.dispose();
      },
    };
    return api;
  }

  /* ---- mount ------------------------------------------------------------------- */

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('bloodflow.js: load kit/card-stage.js first');
    let sim = null, nb = null;
    const listeners = {};
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'BloodFlow ' + ev);

    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta: 0.12, phi: 1.28, r: 125 },
      stage: Object.assign({ rMin: 30, rMax: 420, phiMin: 0.3, phiMax: 2.8 }, params.stage || {}),
      step: dt => { if (sim) { sim.step(dt); emit('frame', api.state(), dt); } },
      afterFrame: () => { if (nb) nb.step(); },
      viewOffset: params.viewOffset,
    });
    /* bloodcell.js's light: no shadow maps, a hemisphere for the red, key and
       rim on the camera. The same cell should be lit the same way. */
    box.scene.traverse(o => {
      if (o.isAmbientLight) o.intensity = 0.3;
      else if (o.isDirectionalLight) o.intensity *= 0.55;
    });
    box.scene.add(new THREE.HemisphereLight(0xdfe9ff, 0x2a1414, 0.55));
    const key = new THREE.DirectionalLight(0xfff2e8, 0.7); key.position.set(-4, 5, 6);
    const rim = new THREE.DirectionalLight(0xbfd4ff, 0.5); rim.position.set(3, 2, -7);
    box.camera.add(key, key.target, rim, rim.target);

    sim = create(THREE, box.root, box.camera, params);
    nb = global.Notebook ? global.Notebook.create({ box, anchors: sim.anchors, library: sim.library }) : null;

    const api = {
      sim, box,
      set(next) { sim.set(next); if (!box.running) box.draw(); return api; },
      state: () => sim.state(),
      reset() { sim.reset(); if (!box.running) box.draw(); return api; },
      on(ev, fn) {
        if (ev === 'frame') { (listeners.frame || (listeners.frame = [])).push(fn);
          return () => { const i = listeners.frame.indexOf(fn); if (i >= 0) listeners.frame.splice(i, 1); }; }
        return sim.on(ev, fn);
      },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n),
      clearNotes: () => nb && nb.clear(), anchors: () => (nb ? nb.list() : []),
      start: box.start, stop: box.stop, pump: box.pump, draw: box.draw,
      destroy() { if (nb) nb.clear(); sim.dispose(); box.destroy(); },
    };
    box.pump();
    return api;
  }

  global.BloodFlow = { create, mount, DEFAULTS, R0, HALF, CRESCENT };
  /* Scale (kit/scale.js). A scene unit is a micrometre: the
     disc is bloodcell.js's measured profile, the vessel radii are real
     capillary numbers, and the crescent's length is in the measured range, so
     a page may print those off state(). The flow speed is choreography and is
     not reported as a rate. A vessel with cells in it is the organ rung,
     bulk; one of its cells, cut open, is a handoff to BloodCell, and it skips
     the tissue rung on purpose: blood has no tissue to stop at between the
     vessel and the cell. */
  global.BloodFlow.SCALE = {
    rung: 'organ', form: 'bulk', unit: 1e-6,
    sceneUnits: [], exag: {}, down: { cell: 'BloodCell' },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
