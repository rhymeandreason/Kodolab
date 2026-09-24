/* =============================================================================
 *  proteins/protein-card.js — one protein, as the gallery's modal draws it
 * =============================================================================
 *  Loaded after kit/proteinbox.js, proteins.js and nucleic-acids.js. Styles in
 *  protein-card.css beside it.
 *
 *  TWO PAGES DRAW THIS CARD: the gallery (proteins/index.html) inside its modal,
 *  and the embed (embed/protein.html) as the whole frame. One module so a fix
 *  to the gallery's text reaches every embed code a teacher has already pasted.
 *  The page owns the FRAME around the card (backdrop, radius, shadow); this
 *  owns what is inside it.
 *
 *      ProteinCard.mount(host, p, {
 *        layout:  'card' | 'solo',   the model and its text, or the model alone
 *        pool,                       a CardStage pool; one of its own if absent
 *        gate,                       show the still until the reader clicks
 *        target,                     '_blank' for every link, inside a frame
 *        onClose, onEmbed, onImage,  the gallery's buttons; absent, not drawn
 *      })  ->  { el, destroy() }
 *
 *  PATHS ARE ABSOLUTE. The gallery sets <base href="/demos/proteins/"> and the
 *  embed <base href="/demos/">; a relative path here would mean two things.
 * ========================================================================== */
(function (global) {
  'use strict';

  /* EVERY PROTEIN IN THE REGISTRY HAS `/proteins/<key>`, whatever folder its
     files sit in — `vercel.json` rewrites the short URL onto the bench and 301s
     the file path onto the short one. */
  const benchOf = p => `/proteins/${p.key}`;
  const lessonOf = p => p.lesson ? '/demos/' + p.lesson : null;
  const storyOf = p => p.story ? '/demos/' + p.story : null;

  /* Every protein's data sits under its own `dir`, which is not always beside
     the gallery — haemoglobin lives outside `proteins/` because its bakes belong
     to the folding pipeline. */
  const dataOf = (p, file) => `/demos/${p.dir}/data/${file}`;

  /* THE BAKED FRAME. `proteins/tools/stills.html` bakes these from the same box,
     colour and rotation the modal opens in, so a card and the molecule it opens
     are one picture. A missing file just fails to load. */
  const stillSrc = key => `/demos/proteins/stills/${key}.webp`;

  /* TWO REGISTRIES, ONE GALLERY. `nucleic-acids.js` indexes the bakes that carry
     DNA or RNA, and the ones with a protein in them belong with the proteins —
     Zif268 is a protein that arrives with a duplex. A structure with no protein
     does not: `withProtein()` is where that line lives. */
  const NA_KEYS = new Set(NucleicAcids.withProtein().map(s => s.key));
  const isNA = p => NA_KEYS.has(p.key);
  /* THE TWO WITH A PAGE OF THEIR OWN COME FIRST. Keys, not indices — reordering
     proteins.js must not silently reorder this. */
  const LEAD = ['hemoglobin', 'myoglobin'];
  const ENTRIES = [...ProteinLib.PROTEINS, ...NucleicAcids.withProtein()]
    .sort((a, b) => (LEAD.indexOf(a.key) + 1 || 99) - (LEAD.indexOf(b.key) + 1 || 99));
  const byKey = key => ENTRIES.find(p => p.key === key) || null;
  const defaultOf = p => isNA(p) ? NucleicAcids.defaultOf(p) : ProteinLib.defaultOf(p);

  const traces = {};                     // key -> the loaded chains, one fetch per page
  function load(p) {
    if (traces[p.key]) return Promise.resolve(traces[p.key]);
    return fetch(dataOf(p, defaultOf(p).read.baked)).then(r => r.json())
      .then(t => (traces[p.key] = t));
  }

  /* An EC number is a protein-registry fact; a nucleic entry has none and asking
     for one would be reaching into the wrong index. */
  function ecClass(p) {
    const ec = isNA(p) ? null : ProteinLib.ecOf(p);
    return ec ? ProteinLib.EC_CLASS[+ec[0]] : null;
  }

  /* WHAT IT DOES, the registry's word for it, on a gallery card and here both.
     `unknown` draws nothing: it would read as a missing field rather than as the
     answer it is. An enzyme says WHICH KIND beside the word, because the class
     name is the thing a reader recognizes without a lookup. */
  function fillDoes(el, p) {
    if (!el) return;
    if (!p.does || p.does === 'unknown') { el.remove(); return; }
    const cls = ecClass(p);
    el.textContent = p.does + (cls ? ` · ${cls[0]}` : '');
    el.title = cls ? cls[1] : '';
    el.className = 'does ' + (p.does === 'enzyme' ? 'enzyme' : 'carrier');
  }

  /* WHERE THE READER GOES FROM HERE, in the order they should read it. A protein
     with a story sends the reader there and not to its bench. */
  function linksFor(p) {
    const out = [];
    if (p.lesson) out.push([lessonOf(p), 'the lesson →']);
    if (p.story) out.push([storyOf(p), 'Learn More →']);
    else out.push([benchOf(p), p.lesson ? 'every structure we hold →' : 'open the bench →']);
    return out;
  }

  /* A COUNT, OR NOTHING. A protein bake writes `chainsInFile: 4`, a nucleic one
     writes `chains` as the chains themselves, so a field is a number only if it
     is one and a length if it is a list. Otherwise it prints [object Object]. */
  const num = v => typeof v === 'number' ? v : Array.isArray(v) ? v.length : null;

  /* WHAT WAS MEASURED OFF THE FILE ON SCREEN, in the myoglobin page's order: what
     the file is, how much of the protein it holds, how sharp it is, what shape it
     came out. Read off the bake, never typed. A protein bake nests its header
     under `meta`; a nucleic one writes it at the top level. */
  function measures(p, t) {
    const v = defaultOf(p), r = v.read || {}, m = t.meta || t;
    const tiles = [[v.species || m.organism || '—', 'species']];
    /* ALWAYS "x of y", NEVER THE BARE COUNT: files of one protein declare
       different lengths, and the percentage is the part that compares. */
    const counts = m.counts || [];
    const modelled = counts.reduce((n, c) => n + (c.modelled || 0), 0) || r.residues;
    const declared = counts.reduce((n, c) => n + (c.declared || 0), 0) || r.declared;
    if (modelled) tiles.push([
      declared ? `${modelled} of ${declared}` : modelled,
      declared ? `amino acids, ${Math.round(100 * modelled / declared)}%` : 'amino acids']);
    if (num(r.nucleotides)) tiles.push([r.nucleotides, 'nucleotides']);
    /* A predicted structure has no resolution and must not borrow the look of
       one, so the em dash stands where the number would be. */
    tiles.push([m.resolution ? m.resolution.toFixed(2) + ' Å' : '—', m.method || r.method]);
    const chains = num(m.chainsInFile) || num(r.chainsInFile) || num(r.chains);
    if (chains > 1) tiles.push([chains, 'chains']);
    else if (m.helices) tiles.push([m.helices, m.strands ? 'helices' : 'helices, no sheet']);
    const pairs = num(m.pairs) || num(r.pairs);
    if (pairs) tiles.push([pairs, 'base pairs']);
    /* HOW BIG IT IS, the one figure a ribbon cannot give a reader. */
    if (t.extents) tiles.push([t.extents.map(x => x.toFixed(0)).join(' × '), 'the whole molecule, Å']);
    return tiles.filter(([n, label]) => n != null && label != null);
  }

  /* lessons.html's embed pill, icon and all: the same action wears one face. */
  const EMB = '<button class="emb" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16"/></svg>Embed</button>';
  const IMG = '<button class="emb img" type="button"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>Image</button>';

  let serial = 0;

  function mount(host, p, o = {}) {
    const solo = o.layout === 'solo';
    const pool = o.pool || CardStage.pool({ limit: 1 });
    const KEY = '⌘card' + (++serial);   // cannot collide with a protein key
    const tgt = o.target ? ` target="${o.target}" rel="noopener"` : '';
    let dead = false;

    const el = document.createElement('div');
    el.className = 'pcard' + (solo ? ' solo' : '');
    el.setAttribute('role', o.onClose ? 'dialog' : 'figure');
    el.innerHTML = `
      ${o.onClose ? '<button class="x" type="button" aria-label="Close">&times;</button>' : ''}
      <div class="mstage">
        <div class="mbox"></div>
        ${solo ? '' : '<p class="cap"><span class="pdb"></span><span class="what"></span><a target="_blank" rel="noopener">at the PDB →</a></p>'}
      </div>
      ${solo ? '' : `<div class="mbody">
        <p class="does"></p>
        <h2 class="name"></h2>
        <p class="def" hidden></p>
        <p class="mblurb"></p>
        <div class="measure"></div>
        <div class="links"></div>
      </div>`}`;
    const q = s => el.querySelector(s);
    if (o.onClose) q('.x').addEventListener('click', o.onClose);

    if (!solo) {
      const name = q('.name');
      name.textContent = p.name;
      name.id = 'pcard-name-' + serial;
      el.setAttribute('aria-labelledby', name.id);
      fillDoes(q('.does'), p);
      /* THE CLASS, DEFINED. The chip says "enzyme · hydrolase"; this says what a
         hydrolase does. Read from EC_CLASS, so the word and its definition
         cannot drift apart. */
      const cls = ecClass(p), defEl = q('.def');
      defEl.hidden = !cls;
      if (cls) defEl.textContent = `${cls[0]}: ${cls[1]}`;
      q('.mblurb').textContent = p.blurb;
      /* WHICH FILE IS ON SCREEN, under the file on screen: its id, what it was
         chosen for, and the way out to the deposition. */
      const def = defaultOf(p);
      q('.cap .pdb').textContent = def.id;
      q('.cap .what').textContent = def.purpose || def.label || '';
      q('.cap a').href = isNA(p) ? NucleicAcids.urls(def.id).rcsb : ProteinLib.urls(def).entry;
      q('.links').innerHTML = linksFor(p)
        .map(([href, text]) => `<a class="open" href="${href}"${tgt}>${text}</a>`).join('')
        + (o.onImage ? IMG : '') + (o.onEmbed ? EMB : '');
      if (o.onImage) q('.emb.img').addEventListener('click', () => o.onImage(p));
      if (o.onEmbed) q('.emb:not(.img)').addEventListener('click', () => o.onEmbed(p));
    }
    host.appendChild(el);

    /* The still stands in the mount until the box has drawn: the trace is a
       fetch away, and the card opens on the picture rather than on a hole. */
    const mbox = q('.mbox');
    mbox.style.cssText = `background-image:url(${stillSrc(p.key)});`
      + 'background-size:contain;background-position:center;background-repeat:no-repeat';

    /* The measures come off the bake, which is a 12 KB fetch: a gated card
       prints them before the box, which is the expensive half, exists. */
    if (!solo) load(p).then(t => {
      if (dead) return;
      const measure = q('.measure');
      for (const [n, label] of measures(p, t)) {
        const d = document.createElement('div');
        d.innerHTML = '<b></b><span></span>';
        d.querySelector('b').textContent = n;
        d.querySelector('span').textContent = label;
        measure.appendChild(d);
      }
    }).catch(() => {});

    /* Zoom is ON: the card is the whole stage, so the wheel is the reader's zoom
       rather than how they scroll past. A zero-sized mount gets THREE's
       constructor frustum, so the box waits for layout. */
    function openBox() {
      if (dead || !mbox.clientWidth || !mbox.clientHeight) return;
      load(p).then(t => {
        if (dead) return;
        const box = pool.acquire(KEY, () => Proteinbox.create({
          mount: mbox, orbit: true, pad: 1.1, sub: 10,
          stage: { ortho: false, turn: 'trackball', zoom: true },
          chains: isNA(p) ? NucleicAcids.drawnOf(p, null, t) : null,
          colors: isNA(p) ? null : ProteinLib.colorsOf(p, ProteinLib.defaultOf(p)),
          view: (isNA(p) ? NucleicAcids : ProteinLib).viewOf(p),
          data: t,
        }));
        if (box && box.setPocket && t.pocket) box.setPocket(t.pocket);
        mbox.style.backgroundImage = '';   // the live box has drawn the same frame
      }).catch(e => console.warn(`protein-card: ${p.key} — ${e.message}`));
    }

    /* THE GATE. An embed is one of several on a teacher's page, and every live
       box is a WebGL context the browser caps near eight and drops the oldest of
       without an error. So a gated card is its still until the reader asks. */
    if (o.gate) {
      const go = document.createElement('button');
      go.type = 'button'; go.className = 'gate';
      go.innerHTML = '<span>View in 3D</span>';
      q('.mstage').appendChild(go);
      go.addEventListener('click', () => { go.remove(); openBox(); });
    } else requestAnimationFrame(openBox);

    /* A canvas that has lost its context can never be granted another, so the
       pool destroys the box and the next mount builds on a fresh canvas. */
    function destroy() {
      dead = true;
      pool.release(KEY);
      el.remove();
    }
    return { el, destroy };
  }

  global.ProteinCard = { ENTRIES, byKey, isNA, defaultOf, stillSrc, lessonOf, storyOf, fillDoes, mount };
})(window);
