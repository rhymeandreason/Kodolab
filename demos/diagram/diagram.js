/* =============================================================================
 *  diagram/diagram.js - the structure component: one molecule, drawn flat
 * =============================================================================
 *  lib/diagram-2d.js under the mount contract. A caller names a molecule and
 *  says what the drawing is FOR - point at an atom, show the electrons - and
 *  never picks a projection. Which notation suits a molecule is chemistry, so
 *  the module decides: Haworth for a sugar, a Lewis structure for a molecule
 *  too small to have a skeleton, and the skeletal drawing for everything else.
 *
 *      <script src="../lib/molecules.js"></script>   + the mol-* it lives in
 *      <script src="../lib/haworth.js"></script>
 *      <script src="https://unpkg.com/smiles-drawer@2.4.1/dist/smiles-drawer.min.js"></script>
 *      <script src="../lib/diagram-2d.js"></script>
 *      <link rel="stylesheet" href="../diagram/diagram.css">
 *      <script src="../diagram/diagram.js"></script>
 *
 *      Diagram.mount(el, params)   one box, one handle, the contract the 3D
 *                                  components share: set / state / on / destroy
 *
 *  Params:
 *      molecule   a key in MolLib.MOLECULES ('glucose'), or a spec object
 *      lonePairs  draw the non-bonding electrons. A Lewis structure always
 *                 does; on a Haworth it is a choice, because the pairs are the
 *                 point only when the lesson is about hydrogen bonding.
 *      showH      draw the C-H hydrogens (Haworth only - a Lewis structure has
 *                 them by construction and a SMILES carries its own)
 *      highlight  atom refs to light up, resolved the way the 3D view resolves
 *                 them. A hydrogen marks the heavy atom it hangs on, because it
 *                 has no glyph of its own in a flat drawing.
 *      accent     the highlight's colour
 *      title, caption, width, height
 *
 *  LIKE A GRAPH, NOT LIKE A SCENE. There is no camera, no stage and no frame:
 *  nothing here is at a scale, so it can sit beside any component. It follows
 *  Graph in having no note(), show() or lookAt() - a flat drawing has no depth
 *  to reveal and no third dimension to move through. To point at an atom, pass
 *  `highlight`.
 *
 *  A SECOND VIEW, NEVER A SECOND SOURCE. Everything drawn comes off the same
 *  spec the 3D model is built from, so a diagram beside a model cannot disagree
 *  with it about what the molecule has.
 *
 *  set() re-renders. Nothing animates: a structural diagram tweening between
 *  two molecules is showing a third that does not exist.
 *
 *  state(): {key, name, formula, charge, projection, atoms, heavy, lonePairs}
 *  Events: 'render' (state)
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = { lonePairs: false, showH: false, width: null, height: null };

  function specOf(m) {
    if (!m) return null;
    return typeof m === 'string' ? (global.MolLib.MOLECULES[m] || null) : m;
  }

  /* Counted off the SPEC, not off the drawing: state() answers what the
     molecule is, and a projection that leaves a pair out (a CH₂OH's oxygen has
     no position of its own on a Haworth) has not changed the chemistry. */
  function pairCount(spec) {
    const orders = spec.atoms.map(() => 0);
    spec.bonds.forEach(b => { const o = b[2] || 1; orders[b[0]] += o; orders[b[1]] += o; });
    return spec.atoms.reduce((t, a, i) => t + global.Diagram2D.lonePairs(spec, i, orders), 0);
  }

  function mount(el, params) {
    const P = Object.assign({}, DEFAULTS, params || {});
    const listeners = {};
    let last = null;

    const wrap = document.createElement('div');
    wrap.className = 'diagram';
    const titleEl = document.createElement('p'); titleEl.className = 'diagram-title';
    const panel = document.createElement('div'); panel.className = 'diagram-panel';
    const capEl = document.createElement('p'); capEl.className = 'diagram-caption';
    wrap.append(titleEl, panel, capEl);
    el.appendChild(wrap);

    const emit = (name, arg) => (listeners[name] || []).forEach(f => f(arg));

    function render() {
      const spec = specOf(P.molecule);
      titleEl.textContent = P.title || '';
      titleEl.hidden = !P.title;
      capEl.textContent = P.caption || '';
      capEl.hidden = !P.caption;
      /* A name no domain file defines. It reports rather than sitting blank:
         `state()` null and an empty panel are what a caller checks, and the
         console line is for whoever is looking at a page that lost a
         molecule. A missing mol-*.js is the usual cause. */
      if (!spec) {
        panel.innerHTML = ''; wrap.classList.add('is-empty'); last = null;
        const why = typeof P.molecule === 'string' && global.AppMols && global.AppMols.missing(P.molecule);
        // reportError reaches the builder's relay, so the next turn hears it; a warn does not.
        if (why) global.reportError(new Error('Diagram: ' + why));
        else if (typeof P.molecule === 'string')
          console.warn(`Diagram: no molecule named "${P.molecule}" — is its mol-*.js loaded?`);
        emit('render', null);
        return;
      }

      const D = global.Diagram2D;
      const drawn = D.draw(panel, spec, {
        lonePairs: !!P.lonePairs,
        showH: !!P.showH,
        accent: P.accent,
        highlight: P.highlight ? D.highlight(spec, P.highlight) : new Set(),
        width: P.width, height: P.height,
        maxW: P.width || undefined, maxH: P.height || undefined,
      });
      wrap.classList.toggle('is-empty', !drawn);
      last = {
        key: typeof P.molecule === 'string' ? P.molecule : null,
        name: spec.name, formula: spec.formula || '', charge: spec.charge || 0,
        projection: drawn ? D.mode(spec) : null,
        atoms: spec.atoms.length,
        heavy: spec.atoms.filter(a => a.el !== 'H').length,
        lonePairs: pairCount(spec),
      };
      emit('render', last);
    }
    render();

    return {
      set(next) {
        Object.assign(P, next);
        render();
        return this;
      },
      state: () => last,
      on(name, fn) {
        (listeners[name] = listeners[name] || []).push(fn);
        return () => { listeners[name] = listeners[name].filter(f => f !== fn); };
      },
      render,
      destroy() { wrap.remove(); },
    };
  }

  global.Diagram = { mount };

  /* Scale (kit/scale.js). A structural diagram is NOT IN THE WORLD — it is a
     notation, so it has no size and sits on no rung, the same claim Graph
     makes. `width`/`height` are pixels of drawing and are declared here so
     nothing mistakes one for a measurement of a molecule. */
  global.Diagram.SCALE = {
    rung: null, form: null, unit: null, exag: {}, down: {},
    sceneUnits: ['width', 'height'],
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
