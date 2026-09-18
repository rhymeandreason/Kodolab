/* =============================================================================
 *  water/watersim-mount.js — WaterSim as one declarative box
 * =============================================================================
 *  watersim.js is a per-frame push API on purpose: it takes an Object3D, never
 *  a stage, so water-lab and capillary/ can run one liquid under two cameras.
 *  That is the right shape for a bespoke lesson and the wrong one for a page
 *  that only wants "some water at 80°C with a pinch of salt": it has to own a
 *  canvas, a loop, a resize, and re-type the frame object every tick.
 *
 *  This is the other shape. One element in, one handle out:
 *
 *      const w = WaterSim.mount(el, { nWater:16, temperature:80, salt:'nacl', nSalt:2 });
 *      w.set({ temperature:-5, freeze:true });
 *      w.state().hbondCount
 *      const off = w.on('frame', s => label.textContent = s.fz.toFixed(2));
 *      w.destroy();
 *
 *  Params (every one may change live through set):
 *      nWater       molecule count; reconciled by spawn/remove
 *      salt         a dissociating spec key ('nacl') or null
 *      nSalt        crystal PAIRS. The sim removes salt only as a whole, so a
 *                   decrease clears and re-drops the remainder
 *      temperature  °C, or null for room temperature with the continuum off
 *      freeze       whether cooling may build ice
 *      hbonds       draw the dashed network
 *      still        no thermal jiggle (one molecule under inspection)
 *      solvent      the dissolving scene's spacing; defaults to nSalt>0
 *      cam          Stage.create's cam, first mount only
 *      tuning       WaterSim.TUNING overrides, first mount only; live tuning
 *                   is `w.sim.cfg`
 *
 *  Events: 'frame' (step's return, every tick) · 'dissociate' (na, cl, at) ·
 *  'saltchange'. `on` returns the unsubscribe.
 *
 *  It adds no physics. `w.sim` is the underlying WaterSim and `w.box` the
 *  CardStage, so a page that outgrows the params keeps everything it had.
 *  The box comes from kit/card-stage.js because a destroy that does not give
 *  the WebGL context back is the failure every earlier private loop had.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = { nWater:16, salt:null, nSalt:0, temperature:null, freeze:false,
    hbonds:true, still:false, solvent:undefined };

  function mount(el, params = {}) {
    if (!global.CardStage) throw new Error('watersim-mount.js: load kit/card-stage.js first');
    if (!global.WaterSim || !global.WaterSim.create) throw new Error('watersim-mount.js: load water/watersim.js first');

    const P = Object.assign({}, DEFAULTS, params);
    const listeners = { frame:[], dissociate:[], saltchange:[] };
    const emit = (ev, ...a) => CardStage.fire(listeners[ev], a, 'WaterSim ' + ev);
    let last = null, sim = null, nb = null;

    const box = global.CardStage.create({
      mount: el,
      cam: params.cam || { theta:0.5, phi:1.15, r:26 },
      viewOffset: params.viewOffset,
      stage: params.stage,
      afterFrame: () => { if (nb) nb.step(); },
      step: () => {
        if (!sim) return;               // CardStage may tick before create returns
        const solvent = P.solvent === undefined ? sim.salt.length > 0 : !!P.solvent;
        last = sim.step({ still:P.still, solvent, showHbonds:P.hbonds,
          tempEnabled: P.temperature !== null, temperature: P.temperature === null ? 22 : P.temperature,
          freezeEnabled: P.freeze });
        emit('frame', last);
      }
    });

    sim = global.WaterSim.create(THREE, box.root, {
      tuning: params.tuning,
      onDissociate: (na, cl, at) => emit('dissociate', na, cl, at),
      onSaltChange: () => emit('saltchange') });

    /* Reconcile counts toward the params; everything else is read per frame. */
    function reconcile() {
      while (sim.mols.length < P.nWater) sim.spawn();
      while (sim.mols.length > P.nWater) sim.remove();
      const want = P.salt ? Math.max(0, P.nSalt | 0) : 0;
      const have = sim.salt.length / 2;
      if (want < have || (want && sim.salt.length && sim.salt[0].userData.role !== saltCation(P.salt))) sim.clearSalt();
      for (let i = sim.salt.length / 2; i < want; i++) sim.addSalt(P.salt);
      if (sim.salt.length) sim.assignShells();
    }
    function saltCation(key) {
      const spec = sim.saltSpec(key);
      return spec && spec.dissociates ? spec.dissociates.find(d => d.charge > 0).ion : null;
    }

    reconcile();
    box.pump();                       // a first frame with the water in it

    /* Named parts: one molecule of each kind, riding it. */
    const _a = new THREE.Vector3();
    const ionOf = ch => { const m = sim.salt.find(s => s.userData.role === ch); return m ? m.getWorldPosition(_a) : null; };
    const anchors = {
      water: () => sim.mols[0] ? sim.mols[0].getWorldPosition(_a) : null,
      O: () => sim.mols[0] ? sim.mols[0].getWorldPosition(_a) : null,
      H: () => sim.mols[0] && sim.mols[0].children[1] ? sim.mols[0].children[1].getWorldPosition(_a) : null,
      Na: () => ionOf('Na'), Cl: () => ionOf('Cl'),
    };
    const library = {
      water: { text: 'H₂O', offset: [34, -26], card: 'Bent, and polar: the oxygen pulls the shared electrons, so it carries a partial negative charge and each hydrogen a partial positive one.' },
      O: { text: 'O, δ−', offset: [-34, -26], card: 'Two lone pairs here accept hydrogen bonds from neighbours\' hydrogens. A water can take two that way.' },
      H: { text: 'H, δ+', offset: [34, 20], card: 'Each hydrogen can donate one hydrogen bond to a neighbour\'s oxygen. Two donated, two accepted: four at most.' },
      Na: { text: 'Na⁺', offset: [34, -26], card: 'Six waters point their oxygens at it, held tight. That shell is what water does to pull a crystal apart.' },
      Cl: { text: 'Cl⁻', offset: [34, 26], card: 'Its waters point a hydrogen at it instead, and sit a little further out. Same idea, other sign.' },
    };
    nb = global.Notebook ? global.Notebook.create({ box, anchors, library }) : null;

    /* What can be shown or hidden. The H-bond network is a param already;
       ions hide by visibility so the shells and the freezing point hold. */
    const vis = { ions: true };
    const LAYERS = {
      hbonds: { label: 'hydrogen bonds', get: () => P.hbonds, set: v => { P.hbonds = v; } },
      ions:   { label: 'ions', get: () => vis.ions, set: v => { vis.ions = v; for (const m of sim.salt) m.visible = v; } },
    };
    const layers = () => Object.keys(LAYERS).map(k => ({ name: k, label: LAYERS[k].label, on: !!LAYERS[k].get() }));
    const show = (n, on = true) => { const L = LAYERS[n]; if (!L) console.warn('watersim-mount.js: no layer named ' + n); else L.set(!!on); };
    const hex = n => '#' + n.toString(16).padStart(6, '0');
    const A = global.MolLib.PALETTE.atoms, B = global.MolLib.PALETTE.bonds;
    const palette = () => [
      { name: 'oxygen', color: hex(A.O) }, { name: 'hydrogen', color: hex(A.H) }, { name: 'Na⁺', color: hex(A.Na) }, { name: 'Cl⁻', color: hex(A.Cl) },
      { name: 'hydrogen bond', color: hex(B.hbond) }, { name: 'ion–dipole bond', color: hex(B.iondipole) },
    ];

    return {
      sim, box, layers, show, palette,
      note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n), clearNotes: () => nb && nb.clear(),
      anchors: () => nb ? nb.list() : [],
      set(next) { Object.assign(P, next); reconcile(); return this; },
      params: () => Object.assign({}, P),
      state: () => last,
      on(ev, fn) {
        if (!listeners[ev]) throw new Error(`watersim-mount.js: no event '${ev}'`);
        listeners[ev].push(fn);
        return () => { const i = listeners[ev].indexOf(fn); if (i >= 0) listeners[ev].splice(i, 1); };
      },
      start: box.start, stop: box.stop, pump: box.pump,
      destroy() { box.destroy(); Object.keys(listeners).forEach(k => listeners[k].length = 0); }
    };
  }

  global.WaterSim.mount = mount;
})(typeof globalThis !== 'undefined' ? globalThis : this);
