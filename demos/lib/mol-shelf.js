/* =====================================================================
 *  mol-shelf.js — the molecule shelf: MolLib's specs as cards.
 *  Loaded after molecules.js and every mol-*.js domain file.
 *
 *  TWO PAGES DRAW THE SAME SHELF: library.html shows the first ten and
 *  sends the reader on, molecules.html shows all of them grouped. The
 *  order, the one-card-per-molecule rule and the card's markup live here
 *  so the two cannot disagree about what a molecule is called or how many
 *  there are. The still each card wears is media/molecules/<key>.webp,
 *  baked by tools/molecule-stills.html.
 *
 *  Card CSS is the page's, not this file's: both pages style `.card`,
 *  `.stage`, `.name`, `.full`, `.formula` and `.fact` at their own sizes.
 * ===================================================================== */
(function (global) {
  'use strict';

  /* ONE CARD PER MOLECULE, NOT PER SPEC. atp and atpSkel are two derivations
     of one molecule (molecule-viewer.html's derivation switch), so the first
     spec registered under a name is the card and the second is not a second
     card. */
  function list() {
    const seen = new Set();
    return Object.entries(MolLib.MOLECULES)
      .filter(([, s]) => s.atoms && s.name && !seen.has(s.name) && seen.add(s.name))
      .map(([key, s]) => ({ key, spec: s }));
  }

  /* The domain file each spec came from, said the way a student would group
     them. The partition itself is MolLib.DOMAINS, by derivation; these are
     only the words over each part of the grid. */
  const GROUP = {
    'mol-small.js':      'Small molecules',
    'mol-aminoacids.js': 'Amino acids',
    'mol-pathways.js':   'Glycolysis and fermentation',
    'mol-krebs.js':      'The citric-acid cycle',
    'mol-carriers.js':   'Carriers',
    'mol-sugars.js':     'Sugars',
    'mol-glycans.js':    'Disaccharides',
    'mol-lipids.js':     'Lipids',
    'mol-nucleic.js':    'Nucleic acids',
  };
  const groupOf = domain => GROUP[domain] || domain;

  /* `el` is the caller's: an <a> where the card is a link, an <article> where
     it opens a modal. */
  function card(m, el) {
    const s = m.spec;
    el.className = 'card';
    el.innerHTML = `
      <div class="stage" style="background-image:url(media/molecules/${m.key}.webp)"></div>
      <div class="body"><h3 class="name"></h3><p class="full"></p><p class="formula"></p><div class="facts"></div></div>`;
    /* THE NAME A STUDENT SAYS. "NADH", not "Nicotinamide adenine dinucleotide
       (reduced)": the short form is the title and the full name sits under it. */
    const full = el.querySelector('.full');
    el.querySelector('.name').textContent = s.short || s.name;
    if (s.short && s.short !== s.name) full.textContent = s.name; else full.remove();
    el.querySelector('.formula').textContent = s.formula || '';
    const fx = el.querySelector('.facts');
    for (const f of [s.class, `${s.atoms.length} atoms`]) {
      const c = document.createElement('span');
      c.className = 'fact'; c.textContent = f; fx.appendChild(c);
    }
    return el;
  }

  global.MolShelf = { list, groupOf, card };
})(typeof window !== 'undefined' ? window : globalThis);
