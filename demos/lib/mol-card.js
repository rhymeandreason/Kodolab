/* =============================================================================
 *  lib/mol-card.js — one molecule, as molecules.html's modal draws it
 * =============================================================================
 *  Loaded after molview.js, diagram-2d.js, kit/card-stage.js and every mol-*.js.
 *  Styles in css/mol-card.css.
 *
 *  TWO PAGES DRAW THIS CARD: molecules.html inside its modal, and the embed
 *  (embed/molecule.html) as the whole frame. One module so a fix to the modal
 *  reaches every embed code already pasted. The page owns the frame; this owns
 *  what is inside it.
 *
 *      MolCard.mount(host, m, {        m is a MolShelf.list() entry
 *        layout: 'card' | 'solo',      the model and its text, or the model alone
 *        gate, onClose, onEmbed, onImage,   as proteins/protein-card.js
 *      })  ->  { el, destroy() }
 *
 *  THE BOX IS lib/molview.js's, not a stage of its own. It owns the two views
 *  offered here and the morph between them: 2D is the same spheres sliding onto
 *  the diagram's layout, so the reader watches one molecule lie down rather
 *  than being shown a second picture of it. kit/card-stage.js owns the canvas,
 *  the loop, and a destroy that hands the WebGL context back.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* WHERE THE SHAPE CAME FROM. Every spec names its own source in `src:{path}`
     and check-molecules.js fails one that does not, so this is read rather than
     written. A student looking at a model is entitled to know whether they are
     looking at a measurement or at a construction. */
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
  const HINT = { '2d': '2D projection drawn from the diagram.' };

  const stillSrc = key => `/demos/media/molecules/${key}.webp`;
  /* lessons.html's embed pill, icon and all: the same action wears one face. */
  const EMB = '<button class="emb" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>Embed</button>';
  const IMG = '<button class="emb img" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Image</button>';

  let serial = 0;

  function mount(host, m, o = {}) {
    const solo = o.layout === 'solo', s = m.spec;
    const el = document.createElement('div');
    el.className = 'mcard' + (solo ? ' solo' : '');
    el.setAttribute('role', o.onClose ? 'dialog' : 'figure');
    /* On-stage instruments (kodo.css §.segmented, §.pill), each shown only where
       the spec supports it: a molecule with no `flat2d` cannot lie down, and one
       with no `optH` has no C-H hydrogens to hide.
       The drawn diagram sits BESIDE the model rather than being a view of it:
       it is the only picture here that is not the molecule's own coordinates.
       The lone-pairs pill is pinned to the CARD, not the body column: the body
       scrolls, and an instrument that scrolls with the thing it acts on is not
       an instrument. */
    el.innerHTML = `
      ${o.onClose ? '<button class="x" type="button" aria-label="Close">&times;</button>' : ''}
      <div class="mstage">
        <div class="stagebar">
          <div class="segmented segmented--sm modes" role="group" aria-label="View" hidden>
            <button type="button" data-mode="3d" aria-pressed="true">3D</button>
            <button type="button" data-mode="2d" aria-pressed="false">2D</button>
          </div>
          <label class="pill pill--ghost pill--check hyd" hidden>
            <input type="checkbox"> C&ndash;H hydrogens</label>
        </div>
      </div>
      ${solo ? '' : `<div class="mbody">
        <p class="does"></p>
        <h2 class="name"></h2>
        <p class="formula"></p>
        <div class="measure"></div>
        <p class="hint"></p>
        ${o.onEmbed || o.onImage ? `<p class="embrow">${o.onImage ? IMG : ''}${o.onEmbed ? EMB : ''}</p>` : ''}
        <div class="dwrap" hidden><div class="mdiagram"></div></div>
      </div>
      <label class="pill pill--ghost pill--check pairs" hidden>
        <input type="checkbox"> lone pairs</label>`}`;
    const q = sel => el.querySelector(sel);
    const stage = q('.mstage'), bar = q('.stagebar'), modes = q('.modes');
    const hyd = q('.hyd'), hydIn = q('.hyd input');
    const bodyCol = q('.mbody'), dwrap = q('.dwrap'), diagramEl = q('.mdiagram');
    const pairs = q('.pairs'), pairsIn = pairs && pairs.querySelector('input');
    if (o.onClose) q('.x').addEventListener('click', o.onClose);
    if (o.onImage) q('.emb.img').addEventListener('click', () => o.onImage(m));
    if (o.onEmbed) q('.emb:not(.img)').addEventListener('click', () => o.onEmbed(m));
    let box = null, view = null, dead = false;

    if (!solo) {
      const name = q('.name');
      name.textContent = s.name;
      name.id = 'mcard-name-' + (++serial);
      el.setAttribute('aria-labelledby', name.id);
      q('.formula').textContent = s.formula || '';
      q('.does').textContent = s.class || '';
      q('.hint').textContent = sourceLine(s);
      /* Counted or measured at render, never typed. Span is in real ångströms:
         Stage.measure divides SCALE back out. A span needs two heavy atoms to be
         between: methane's one carbon would report 0.0 Å. */
      const heavy = s.atoms.filter(a => a.el !== 'H').length;
      const rings = (s.topology && s.topology.rings) || [];
      const tiles = [[s.atoms.length, 'atoms'], [heavy, 'heavy atoms']];
      if (heavy > 1) tiles.push([Stage.measure(s).span.toFixed(1) + ' Å', 'widest span']);
      if (rings.length) tiles.push([rings.length, rings.length === 1 ? 'ring' : 'rings']);
      for (const [n, label] of tiles) {
        const d = document.createElement('div');
        d.innerHTML = '<b></b><span></span>';
        d.querySelector('b').textContent = n;
        d.querySelector('span').textContent = label;
        q('.measure').appendChild(d);
      }
    }

    /* Sized for the BODY column, which is narrower than the stage. A
       disaccharide is two rings wide. Hidden for a molecule neither projection
       can draw — an empty rule above nothing would read as a failed load. */
    function paintDiagram() {
      if (solo) return;
      // Only a Haworth draws lone pairs today, so the toggle appears with the
      // projection that can act on it.
      const canPair = Diagram2D.mode(s) === 'haworth';
      const drawn = Diagram2D.draw(diagramEl, s, {
        showH: hydIn.checked,
        lonePairs: canPair && pairsIn.checked,
        width: s.glycosidic ? 420 : 250, height: canPair ? 126 : 150,
        maxW: 330, maxH: 170,
      });
      dwrap.hidden = !drawn;
      pairs.hidden = !(drawn && canPair);
      bodyCol.classList.toggle('haspairs', !pairs.hidden);
    }
    if (pairsIn) pairsIn.addEventListener('change', paintDiagram);

    function setMode(next) {
      if (!view) return;
      /* The flat layout folds every hydrogen into the atom it hangs on, so the
         checkbox has nothing to say there. Disabled rather than hidden: a
         control that vanishes reads as one you imagined. */
      hydIn.disabled = next !== '3d';
      hyd.toggleAttribute('disabled', next !== '3d');
      view.setMode(next);
      for (const b of modes.children) b.setAttribute('aria-pressed', String(b.dataset.mode === next));
      if (!solo) q('.hint').textContent = next === '3d' ? sourceLine(s) : HINT[next];
    }
    modes.addEventListener('click', e => {
      const b = e.target.closest('button');
      if (b) setMode(b.dataset.mode);
    });

    /* The nonpolar C-H's, which a spec lists in `optH`. Off to begin with, the
       way a textbook figure leaves them out. An H on N or O is never in that
       list, so the H-bond donors stay. The diagram shows the same atoms as the
       model beside it, or the two disagree about what the molecule has. */
    function setHydrogens(on) {
      if (!view) return;
      view.setOptionalH(on);
      hydIn.checked = on;
      if (dwrap && !dwrap.hidden) paintDiagram();
    }
    hydIn.addEventListener('change', () => setHydrogens(hydIn.checked));

    paintDiagram();
    host.appendChild(el);
    stage.style.background = `url(${stillSrc(m.key)}) center/contain no-repeat var(--paper)`;

    /* Built once the card is laid out: a box with no size cannot be fitted.
       `orbit:false` because MolView turns the MODEL — a camera that also moved
       would make the flat layout tiltable, and a layout you can tilt has
       stopped saying that its angles are not the molecule's. */
    function openBox() {
      if (dead || box) return;
      box = CardStage.create({
        mount: stage,
        stage: { ortho: true, cam: { theta: 0, phi: Math.PI / 2, r: 40 }, orbit: false },
        step: () => { if (view) view.step(); },
        onResize: () => { if (view) view.fit(); },
      });
      modes.hidden = !(s.flat2d && s.flat2d.length);
      hyd.hidden = !(s.optH && s.optH.length);
      bar.hidden = modes.hidden && hyd.hidden;
      /* The instruments stand ON the stage, so the frame the molecule is fitted
         into stops above them. A hidden bar has a zero-sized box, and a zero box
         measured as an edge reserves the whole stage, so skip it. */
      const around = MolView.usableAround(stage, { bottom: [bar] });
      view = MolView.create({ canvas: box.canvas, camera: box.stage.camera,
                              applyCam: box.stage.applyCam, root: box.stage.root,
                              usable: () => bar.hidden ? { fw: 1, fh: 1 } : around() });
      view.show(s);
      view.fit();
      setMode('3d');
      setHydrogens(false);
      // One frame now, so the box is never blank in the gap before the loop runs.
      box.draw();
      stage.style.backgroundImage = '';
    }

    /* THE GATE: an embed is one of several on a teacher's page, and every live
       box is a WebGL context the browser caps near eight. */
    if (o.gate) {
      bar.hidden = true;
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'gate';
      go.innerHTML = '<span>View in 3D</span>';
      stage.appendChild(go);
      go.addEventListener('click', () => { go.remove(); openBox(); });
    } else openBox();

    function destroy() {
      dead = true;
      if (box) { box.destroy(); box = null; view = null; }
      el.remove();
    }
    return { el, destroy };
  }

  global.MolCard = { mount, stillSrc };
})(window);
