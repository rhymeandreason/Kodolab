/* =====================================================================
 *  tokens-from-palette.js — publishes palette.js to CSS.
 *
 *  Load in <head>, straight after palette.js and before the first paint:
 *
 *      <script src="palette.js"></script>
 *      <script src="tokens-from-palette.js"></script>
 *
 *  A colour typed into CSS and a colour drawn by the renderer drift: the
 *  stylesheet once said oxygen was #e6362f while the renderer drew #d6362e, so
 *  a caption's coloured O was a slightly different red from the sphere it
 *  named. Rather than copy the numbers across and hope, the ints become custom
 *  properties at load, so editing palette.js moves the type and the molecule
 *  together.
 *
 *  Writes --atom-O ..., --bond-hbond ..., --base-G ... and --strand-a ...,
 *  plus the bare --O / --Na / --Cl / --K names the older pages still use. When nothing greps for those, the
 *  second loop goes.
 * ===================================================================== */
(function (global) {
  'use strict';

  const P = global.MolPalette;
  if (!P) { console.warn('tokens-from-palette: palette.js must load first'); return; }

  const css = global.document.documentElement.style;
  const hex = n => '#' + n.toString(16).padStart(6, '0');

  for (const [el, n] of Object.entries(P.atoms)) css.setProperty('--atom-' + el, hex(n));
  for (const [name, n] of Object.entries(P.bonds)) css.setProperty('--bond-' + name, hex(n));
  for (const [b, n] of Object.entries(P.bases)) css.setProperty('--base-' + b, hex(n));
  for (const [k, n] of Object.entries(P.strands)) css.setProperty('--strand-' + k, hex(n));
  for (const [k, n] of Object.entries(P.ss)) css.setProperty('--ss-' + k, hex(n));
  for (const [k, n] of Object.entries(P.histones)) css.setProperty('--histone-' + k, hex(n));

  /* --organelle-mitochondrion, --organelle-mitochondrion-head, ... so a
     caption naming an organelle takes its colour from the same place the
     render does. The bare name is the shell's outer face, which is what a
     student sees of it. */
  for (const [k, v] of Object.entries(P.organelles)) {
    /* The bare name is the outside face — or the ribbon's side, for an
       organelle drawn as ribbons and having no cut shell. An entry with
       NEITHER gets no bare token: the cell wall's faces are per tissue
       (`plantTissue` below), so there is no one colour a caption could mean
       by "wall", and publishing a wrong one is worse than publishing none. */
    const face = v.outer != null ? v.outer : v.side;
    if (face != null) css.setProperty('--organelle-' + k, hex(face));
    for (const [part, n] of Object.entries(v)) css.setProperty('--organelle-' + k + '-' + part, hex(n));
  }

  /* --plant-leaf-wall, --plant-leaf-cytosol, … so a tissue's caption and the
     cell it names cannot drift either. */
  for (const [t, v] of Object.entries(P.plantTissue))
    for (const [part, n] of Object.entries(v)) css.setProperty('--plant-' + t + '-' + part, hex(n));

  for (const [k, n] of Object.entries(P.division)) css.setProperty('--division-' + k, hex(n));

  // legacy bare-element names
  for (const [el, n] of Object.entries(P.atoms)) css.setProperty('--' + el, hex(n));
})(typeof window !== 'undefined' ? window : globalThis);
