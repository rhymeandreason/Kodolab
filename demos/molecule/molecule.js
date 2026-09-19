/* =============================================================================
 *  molecule/molecule.js - the structure component: one molecule, 3D or laid flat
 * =============================================================================
 *  lib/molview.js on a kit/card-stage.js box, under the mount contract: the
 *  same pair molecules.html's modal is built from. A caller names a molecule
 *  and says what the model is FOR - point at atoms, lay it flat, show the
 *  C-H hydrogens, let it turn - and the box fits its own camera.
 *
 *  THE 3D TWIN OF Diagram, from the same spec. Diagram is the bookkeeping
 *  (which atoms, which bonds, which electrons); this is the shape. Its 2D
 *  mode is NOT a diagram: it is the same spheres sliding onto the diagram's
 *  layout, so the reader watches one molecule lie down rather than being
 *  shown a second picture of it (molview.js's header).
 *
 *      Molecule.mount(el, params)   one box, one handle: set / state / on /
 *                                   note / show / lookAt / destroy
 *
 *  Params:
 *      molecule   a key in MolLib.MOLECULES ('glucose'), or a spec object.
 *                 Changing it rebuilds; nothing tweens between two molecules.
 *      mode       '3d' | '2d'. 2D morphs the atoms onto the spec's `flat2d`
 *                 layout; a spec with none stays 3D and state().canFlat says so.
 *      spin       the turntable, 3D only. Off by default: a spec with a
 *                 declared `view:` was posed by hand.
 *      showH      the C-H hydrogens, the ones a spec lists in `optH`. Off by
 *                 default, the way a textbook figure leaves them out: most of
 *                 the atoms and none of the chemistry. An H on N, O or S is
 *                 never optional, so the H-bond donors always stay.
 *      highlight  atom refs to light up: names from the spec's `names` array
 *                 ('O4') or indices. The rest dims to grey in place and the
 *                 marked atoms glow their own colour, molview.js's treatment;
 *                 a bond lights only when both its ends are marked.
 *      viewOffset from the lesson shell, so the molecule centres beside the panel.
 *
 *  A DRAG TURNS THE MODEL, and the camera never moves: that is what lets the
 *  flat layout be a lock rather than a suggestion. The wheel does nothing;
 *  the box is fitted to the molecule and refitted on resize.
 *
 *  ANCHORS ARE THE ATOMS, by the spec's own names, and they follow the atoms
 *  through the 2D morph. A spec with no `names` array has one anchor,
 *  `center`. No facings (a sphere has no far side) and no views (nothing on
 *  one molecule is out of frame), so lookAt() is here for the contract only.
 *
 *  Layers: `hydrogens` (the C-H ones). Palette: the atom colours, read from
 *  MolLib.PALETTE and never typed here.
 *
 *  state(): {key, name, formula, class, charge, atoms, heavy, hydrogens,
 *            span, rings, mode, canFlat, spin, showH, highlight, source}
 *    `span` is the widest heavy-atom distance in REAL angstroms (Stage.measure
 *    divides MolLib.SCALE back out). `source` is one sentence saying where the
 *    coordinates came from, read from the spec's `src.path` - a student
 *    looking at a model is entitled to know whether it is a measurement or a
 *    construction, and a page prints this rather than writing its own.
 *  Events: 'frame' (state, dt) every tick · 'render' (state) after a rebuild
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = { molecule: null, mode: '3d', spin: false, showH: false, highlight: null };

  const ELEMENT = {
    H: 'hydrogen', C: 'carbon', N: 'nitrogen', O: 'oxygen', P: 'phosphorus',
    S: 'sulfur', Na: 'sodium', Cl: 'chlorine', K: 'potassium', Mg: 'magnesium',
  };

  /* WHERE THE SHAPE CAME FROM, in the words molecules.html's modal uses. Every
     spec names its path in `src:{path}` and check-molecules.js fails one that
     does not, so this is read rather than written. MolecularGeometry.md §1 is
     the argument for choosing between them; this only says which was chosen. */
  const SOURCE = {
    hand:    () => 'Placed by hand from measured angles.',
    skel:    () => 'Built from VSEPR angles, not from a deposited record.',
    pubchem: src => `From a deposited 3D record, PubChem CID ${src.cid}.`,
    built:   src => `Idealised geometry, written in as coordinates: ${src.method}.`,
    mirror:  src => `The mirror image of ${src.of}, reflected at load.`,
  };
  function sourceLine(spec) {
    const src = spec.src || {};
    const say = SOURCE[src.path];
    return say ? say(src) : '';
  }

  function specOf(m) {
    if (!m) return null;
    return typeof m === 'string' ? (global.MolLib.MOLECULES[m] || null) : m;
  }

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('molecule.js: load kit/card-stage.js first');
    if (!global.MolView) throw new Error('molecule.js: load lib/molview.js first');
    const P = Object.assign({}, DEFAULTS, params);
    const listeners = {};
    const emit = (ev, ...a) => (listeners[ev] || []).forEach(f => f(...a));
    let spec = null, last = null, nb = null, view = null;
    let highlightSet = new Set();

    /* One 'frame' per drawn frame. Declared before the box: card-stage draws
       one frame from inside create(). */
    let tPrev = performance.now();
    function tick() {
      const t = performance.now(), dt = (t - tPrev) / 1000; tPrev = t;
      if (last) emit('frame', last, dt);
    }

    /* `orbit:false` because MolView turns the MODEL: a camera that also moved
       would make the flat layout tiltable, and a layout you can tilt has
       stopped saying that its angles are not the molecule's. */
    const box = global.CardStage.create({
      mount: el,
      stage: Object.assign({ ortho: true, cam: { theta: 0, phi: Math.PI / 2, r: 40 },
                             orbit: false, zoom: false }, P.stage || {}),
      step: () => { if (view) view.step(); },
      afterFrame: () => { if (nb) nb.step(); tick(); },
      onResize: () => { if (view) view.fit(); },
      viewOffset: P.viewOffset,
    });
    view = global.MolView.create({
      canvas: box.canvas, camera: box.stage.camera, applyCam: box.stage.applyCam,
      root: box.stage.root,
      // The one atom list every view lights from: resolved names, as indices.
      focusAtoms: () => [...highlightSet],
    });

    /* The built group is MolView's; it is the one child of the root that
       carries atom meshes, and it changes on every show(). */
    const group = () => box.stage.root.children.find(o => o.userData && o.userData.atomMeshes) || null;

    /* Every atom, by the spec's own name, as a live world point. The morph
       moves the meshes themselves, so a note rides its atom down onto the
       layout. A hidden C-H answers null and its note waits off screen. */
    const anchors = {};
    const library = {};
    function wireAnchors() {
      for (const k of Object.keys(anchors)) delete anchors[k];
      for (const k of Object.keys(library)) delete library[k];
      if (!spec) return;
      const names = spec.names || [];
      const _p = new THREE.Vector3();
      names.forEach((n, i) => {
        anchors[n] = () => {
          const g = group(), m = g && g.userData.atomMeshes[i];
          return m && m.visible ? g.localToWorld(_p.copy(m.position)) : null;
        };
        const e = spec.atoms[i].el;
        library[n] = {
          text: `${n} · ${ELEMENT[e] || e}`,
          card: `A ${ELEMENT[e] || e} atom, ${n} in this molecule's own numbering. Colour says the element; size is a display radius, not a measurement.`,
        };
      });
      anchors.center = () => { const g = group(); return g ? g.getWorldPosition(_p) : null; };
      library.center = { text: spec.name, card: `${spec.name}, ${spec.formula || ''}. Drag to turn it.` };
    }

    function resolveHighlight() {
      highlightSet = new Set();
      if (!spec || !P.highlight) return;
      const refs = Array.isArray(P.highlight) ? P.highlight : [P.highlight];
      for (const r of refs) {
        try { highlightSet.add(global.MolLib.atomIndex(spec, r)); }
        catch (e) { console.warn('Molecule: ' + e.message); }
      }
    }

    const canFlat = () => !!(spec && spec.flat2d && spec.flat2d.length);
    const modeNow = () => (P.mode === '2d' && canFlat() ? '2d' : '3d');

    function state() {
      if (!spec) return null;
      const m = global.Stage.measure(spec);
      const heavy = spec.atoms.filter(a => a.el !== 'H').length;
      return {
        key: typeof P.molecule === 'string' ? P.molecule : null,
        name: spec.name, formula: spec.formula || '', class: spec.class || null,
        charge: spec.charge || 0,
        atoms: spec.atoms.length, heavy, hydrogens: spec.atoms.length - heavy,
        /* A span needs two heavy atoms to be between: methane's one carbon
           would report 0, which reads as a measurement rather than as nothing. */
        span: heavy > 1 ? +m.span.toFixed(2) : null,
        rings: (spec.topology && spec.topology.rings || []).length,
        mode: modeNow(), canFlat: canFlat(),
        spin: !!P.spin, showH: !!P.showH,
        highlight: [...highlightSet].map(i => (spec.names && spec.names[i]) || i),
        source: sourceLine(spec),
      };
    }

    function build() {
      if (nb) nb.clear();               // open notes point at the old meshes
      spec = specOf(P.molecule);
      if (!spec) {
        last = null; wireAnchors();
        const why = typeof P.molecule === 'string' && global.AppMols && global.AppMols.missing(P.molecule);
        // reportError reaches the builder's relay, so the next turn hears it; a warn does not.
        if (why) global.reportError(new Error('Molecule: ' + why));
        else if (typeof P.molecule === 'string')
          console.warn(`Molecule: no molecule named "${P.molecule}" - is its mol-*.js loaded?`);
        emit('render', null);
        return;
      }
      resolveHighlight();
      view.show(spec);
      view.setOptionalH(!!P.showH);
      view.setHighlight(highlightSet.size > 0);
      view.setSpin(!!P.spin);
      view.setMode(modeNow());
      view.fit();
      wireAnchors();
      last = state();
      if (!box.running) box.draw();
      emit('render', last);
    }

    nb = global.Notebook ? global.Notebook.create({ box, anchors, library }) : null;
    build();

    return {
      box, sim: view,
      set(next = {}) {
        const rebuild = next.molecule !== undefined && next.molecule !== P.molecule;
        Object.assign(P, next);
        if (rebuild) { build(); return this; }
        if (!spec) return this;
        if (next.highlight !== undefined) { resolveHighlight(); view.setHighlight(highlightSet.size > 0); }
        if (next.showH !== undefined) view.setOptionalH(!!P.showH);
        if (next.spin !== undefined) view.setSpin(!!P.spin);
        if (next.mode !== undefined) view.setMode(modeNow());
        last = state();
        if (!box.running) box.draw();
        emit('render', last);
        return this;
      },
      state: () => last,
      on(ev, fn) {
        (listeners[ev] = listeners[ev] || []).push(fn);
        return () => { listeners[ev] = listeners[ev].filter(f => f !== fn); };
      },
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      views: () => ({}),
      lookAt() { return this; },
      layers: () => [{ name: 'hydrogens', label: 'C–H hydrogens', on: !!P.showH }],
      show(name, on) { if (name === 'hydrogens') this.set({ showH: on !== false }); return this; },
      palette: () => {
        const els = spec ? [...new Set(spec.atoms.map(a => a.el))] : [];
        const C = global.MolLib.PALETTE.atoms;
        return els.map(e => ({ name: e, label: ELEMENT[e] || e, color: '#' + (C[e] || 0x888888).toString(16).padStart(6, '0') }));
      },
      start: box.start, stop: box.stop, pump: box.pump,
      destroy: box.destroy,
    };
  }

  global.Molecule = { mount, DEFAULTS, sourceLine };

  /* Scale (kit/scale.js). One molecule at MolLib's display scale: a scene
     unit is SCALE angstroms, so it IS measurable, and `span` is printed from
     the spec in real angstroms rather than off the picture. Display radii are
     stylised and large (molecules.js's bond-length rule), so the spheres, not
     the distances, are the exaggeration. The 2D layout's angles and distances
     are the diagram's, not the molecule's, and state().mode says which is up. */
  global.Molecule.SCALE = {
    rung: 'molecules', form: 'single',
    unit: 1e-10 / (global.MolLib ? global.MolLib.SCALE : 1.9),
    sceneUnits: [], exag: { radii: 'stylised' }, down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
