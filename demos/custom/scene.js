/* =============================================================================
 *  custom/scene.js — a scene the page writes itself, on the component contract
 * =============================================================================
 *  Exposes window.Scene. The one component whose subject is not in the library:
 *  a generated page that needs something no component draws writes its own
 *  geometry here, and gets everything the rest of the library gets for free —
 *  the box, the loop, viewOffset, notes, layers, legend, glides, destroy.
 *
 *      Scene.define('u-tube', {
 *        scale:  { rung: 'cell', form: 'single', unit: null, exag: {} },
 *        params: { level: 0.5 },          // defaults; set() merges into them
 *        glide:  ['level'],               // numeric params set() animates
 *        build(k) {                        // runs once per mount
 *          const water = k.part('water', new k.THREE.Mesh(geo, k.material(0x5aa0e0)),
 *                               { label: 'Water', card: '…', color: 0x5aa0e0 });
 *          return {
 *            update(changed) { ... },      // after set() and on every glide frame
 *            step(dt, t)     { ... },      // every frame
 *            state()         { ... },      // merged over the params into c.state()
 *          };
 *        },
 *      });
 *      const c = Scene.mount(el, { scene: 'u-tube', viewOffset: shell.viewOffset, level: 0.2 });
 *
 *  DEFINE AND MOUNT ARE SEPARATE ON PURPOSE. A definition is the unit that is
 *  reviewed and published: it may read only `k` and its own params, so it can
 *  be lifted out of the page that wrote it and mounted by another. A page talks
 *  to it through set / state / on, the same as any component.
 *
 *  WHAT THIS OWNS, BECAUSE A MODEL WRITING RAW THREE.JS GETS IT WRONG:
 *  · framing. The camera is aimed at whatever was built and backed off to fit
 *    it, whatever units the definition chose, unless the definition names `cam`.
 *  · failure. A build that throws leaves the box on the stage with the message
 *    in it, and the error goes to window.onerror so the builder's relay reports
 *    it; the rest of the page keeps working. A step that throws is reported once
 *    and dropped, the same rule as CardStage.fire.
 *  · budget. More than MAX_MESHES meshes is one console warning; a crowd is an
 *    InstancedMesh.
 *  · colour. `k.atom('O')` and `k.bond('hbond')` read palette.js, so a custom
 *    scene cannot type an atom colour that disagrees with every other scene.
 *
 *  A custom scene has no checked physics behind it. `state().custom` is true so
 *  anything downstream (the review queue, a viewer) can say so.
 * ========================================================================== */
(function (global) {
  'use strict';

  const MAX_MESHES = 1500;
  const RUNGS = (global.ScaleLadder && global.ScaleLadder.RUNGS) || [];
  const DEFS = {};

  const report = e => (global.reportError ? global.reportError(e) : setTimeout(() => { throw e; }));
  const css = c => (typeof c === 'number' ? '#' + c.toString(16).padStart(6, '0') : String(c));

  function define(name, def) {
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(String(name)))
      throw new Error(`Scene.define: name "${name}" must be lower-case words joined by hyphens`);
    if (!def || typeof def.build !== 'function') throw new Error(`Scene.define('${name}'): needs build(k)`);
    const sc = def.scale || {};
    if (RUNGS.length && RUNGS.indexOf(sc.rung) < 0)
      throw new Error(`Scene.define('${name}'): scale.rung must be one of ${RUNGS.join(', ')}`);
    DEFS[name] = Object.assign({ params: {}, glide: [] }, def, {
      name, scale: Object.assign({ form: 'single', unit: null, exag: {}, sceneUnits: [], down: {} }, sc),
    });
    return name;
  }

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('custom/scene.js: load kit/card-stage.js first');
    const name = params.scene;
    const def = DEFS[name];
    if (!def) throw new Error(`Scene.mount: no scene "${name}" defined. Call Scene.define('${name}', {...}) above the mount`
      + (Object.keys(DEFS).length ? `; defined: ${Object.keys(DEFS).join(', ')}` : ''));

    const P = Object.assign({}, def.params);
    for (const k in params) if (!['scene', 'viewOffset', 'cam', 'stage'].includes(k)) P[k] = params[k];

    const listeners = {};
    const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn);
      return () => { const l = listeners[ev]; const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; };
    const emit = (ev, ...a) => global.CardStage.fire(listeners[ev] || [], a, `Scene '${name}' ${ev}`);

    const tw = global.CardStage.tweens();
    let hooks = {}, nb = null, t = 0, last = null, dirty = null, stepOk = true;

    const box = global.CardStage.create({
      mount: el,
      cam: def.cam || params.cam || { theta: 0.6, phi: 1.15, r: 20 },
      stage: params.stage || {},
      viewOffset: params.viewOffset,
      step: dt => {
        t += dt;
        tw.update(dt);
        flush();
        if (hooks.step && stepOk) {
          try { hooks.step(dt, t); }
          catch (e) { stepOk = false; console.warn(`Scene '${name}': step threw, so it stops animating:`, e); report(e); }
        }
        last = read();
        emit('frame', last, dt);
      },
      afterFrame: () => { if (nb) nb.step(); },
    });
    box.renderer.toneMapping = THREE.NoToneMapping;

    /* ---- what build(k) is handed ---- */
    const parts = {};
    const order = [];
    const _box3 = new THREE.Box3(), _v = new THREE.Vector3();
    const k = {
      THREE: global.THREE, root: box.root, camera: box.camera, params: P, scale: def.scale,
      Geo: global.Geo || null,
      get time() { return t; },
      atom(el) {
        const c = global.MolPalette && global.MolPalette.atoms[el];
        if (c == null) throw new Error(`k.atom('${el}'): palette.js has no atom ${el}`);
        return c;
      },
      bond(kind) {
        const c = global.MolPalette && global.MolPalette.bonds[kind];
        if (c == null) throw new Error(`k.bond('${kind}'): palette.js has ${Object.keys(global.MolPalette.bonds).join(', ')}`);
        return c;
      },
      material(color, opts) {
        return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0 }, opts || {}));
      },
      /* A named part: added to the scene, and becomes a note anchor, a layer the
         show panel can hide, and a legend entry when it has a colour. */
      part(pname, obj, info = {}) {
        if (!obj || !obj.isObject3D) throw new Error(`k.part('${pname}'): the second argument is a THREE object`);
        if (!obj.parent) box.root.add(obj);
        if (!parts[pname]) order.push(pname);
        parts[pname] = { obj, info };
        return obj;
      },
      emit,
    };

    function centre(obj) {
      _box3.setFromObject(obj);
      return _box3.isEmpty() ? obj.getWorldPosition(_v) : _box3.getCenter(_v);
    }

    function read() {
      let own = {};
      if (hooks.state) { try { own = hooks.state() || {}; } catch (e) { console.warn(`Scene '${name}': state threw`, e); } }
      return Object.assign({ scene: name, custom: true, rung: def.scale.rung }, P, own);
    }

    function flush() {
      if (!dirty) return;
      const changed = dirty; dirty = null;
      if (hooks.update) {
        try { hooks.update(changed); } catch (e) { console.warn(`Scene '${name}': update threw`, e); report(e); }
      }
    }

    /* ---- build, with the failure kept inside the box ---- */
    try {
      hooks = def.build(k) || {};
    } catch (e) {
      const msg = document.createElement('div');
      msg.textContent = `This scene could not be built: ${e.message}`;
      msg.style.cssText = 'position:absolute;inset:auto 0 40% 0;text-align:center;font:14px/1.5 system-ui;color:#b00;pointer-events:none';
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      el.appendChild(msg);
      report(e);
    }

    let meshes = 0;
    box.root.traverse(o => { if (o.isMesh) meshes++; });
    if (meshes > MAX_MESHES) console.warn(`Scene '${name}': ${meshes} meshes is past the budget of ${MAX_MESHES}; draw a crowd as one InstancedMesh`);

    /* ---- framing: aim at what was built, whatever its units ---- */
    let home = null;
    _box3.setFromObject(box.root);
    if (!_box3.isEmpty()) {
      const sphere = _box3.getBoundingSphere(new THREE.Sphere());
      const R = Math.max(sphere.radius, 1e-3);
      box.camera.near = R / 200; box.camera.far = Math.max(1000, R * 40);
      box.camera.updateProjectionMatrix();
      if (!def.cam && !params.cam) {
        box.cam.target.copy(sphere.center);
        box.cam.r = R * 2.6;
      }
      box.stage.setZoomLimits(R * 0.6, R * 12);
      box.applyCam();
    }
    home = { theta: box.cam.theta, phi: box.cam.phi, r: box.cam.r };

    const anchors = {}, library = {};
    for (const pn of order) {
      const { obj, info } = parts[pn];
      anchors[pn] = () => (obj.visible ? centre(obj) : null);
      library[pn] = { text: info.label || pn, card: info.card };
    }
    nb = global.Notebook ? global.Notebook.create({ box, anchors, library }) : null;

    last = read();
    box.pump(0);

    function set(next = {}, opts = {}) {
      const snap = opts.snap || !box.running;
      for (const key in next) {
        if (key === 'scene' || key === 'viewOffset') continue;
        const v = next[key];
        if (!snap && def.glide.includes(key) && typeof v === 'number' && typeof P[key] === 'number') {
          tw.to(P[key], v, opts.duration || 0.9, x => { P[key] = x; (dirty = dirty || {})[key] = x; }, { key, ease: 'smooth' });
        } else {
          tw.cancel(key);
          P[key] = v; (dirty = dirty || {})[key] = v;
        }
      }
      if (!box.running) { flush(); last = read(); box.draw(); }
      return api;
    }

    const api = {
      sim: k, box, scale: def.scale,
      set, on,
      state: () => last,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => (nb ? nb.list() : []),
      views: () => { const v = {}; for (const pn of order) if (parts[pn].info.view) v[pn] = parts[pn].info.view; return v; },
      lookAt(pn, dur) { const p = parts[pn]; if (p && p.info.view) box.flyTo(p.info.view, dur); return api; },
      home() { box.flyTo(home); return api; },
      layers: () => order.filter(pn => parts[pn].info.layer !== false)
        .map(pn => ({ name: pn, label: parts[pn].info.label || pn, on: parts[pn].obj.visible })),
      show(pn, vis) { const p = parts[pn]; if (p) p.obj.visible = !!vis; if (!box.running) box.draw(); return api; },
      palette: () => order.filter(pn => parts[pn].info.color != null)
        .map(pn => ({ name: parts[pn].info.label || pn, color: css(parts[pn].info.color) })),
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() {
        if (hooks.destroy) { try { hooks.destroy(); } catch (e) { /* the box goes regardless */ } }
        box.root.traverse(o => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) [].concat(o.material).forEach(m => m.dispose());
        });
        box.destroy();
      },
    };
    return api;
  }

  /* What a definition is, for the submit step: its name, scale, params, and the
     source of build(), which is the whole of what it draws. */
  function source(name) {
    const d = DEFS[name];
    if (!d) return null;
    return { name, scale: d.scale, params: d.params, glide: d.glide, cam: d.cam || null, build: d.build.toString() };
  }

  global.Scene = { define, mount, source, list: () => Object.keys(DEFS), MAX_MESHES };
  /* Each definition declares its own rung; the component itself sits on none. */
  global.Scene.SCALE = null;
})(typeof globalThis !== 'undefined' ? globalThis : this);
