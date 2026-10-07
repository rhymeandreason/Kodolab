/* =============================================================================
 *  macromolecule/peptide-diagram.js — the chain on the stage, as a textbook draws it
 * =============================================================================
 *  A displayed formula: every backbone atom written out, the amide H and the
 *  α-H drawn, the side chain condensed above its α-carbon. It is the drawing a
 *  Bio 101 student meets in class, kept beside the 3D stage so the two can be
 *  read against each other: the boxed C(=O)–N(–H) here is the slate stick there.
 *
 *  A DIAGRAM, NOT A PROJECTION. The layout is the page's own straight line, the
 *  way the textbook draws it; nothing reads coordinates. What IS read from each
 *  spec is everything the drawing asserts: which atoms the reaction keeps and
 *  sheds (`condense:` roles), and the side chain, walked off the bond graph.
 *  So a residue added to the library draws without an entry here, and one this
 *  walk cannot condense (a branch) throws rather than drawing a wrong formula.
 *
 *  Pure: residues in, an SVG string out. No THREE, no DOM, so
 *  check-macromolecule.js asserts the side chains in Node.
 *
 *    PeptideDiagram.svg(frags, { fresh, hbonds })
 *      frags   [[{ spec, prev, next }]]: one array per separate piece on the
 *              stage, N to C. `prev` says the amino N is spent; `next` is the
 *              donor role that bonded onward ('carboxyl' | 'gamma') or null
 *      fresh   [frag, i]: the bond after residue i just formed. It pulses
 *              and gives off a water
 *      hbonds  [[i, j]]: C=O of residue i to N–H of residue j, in frag 0
 *    PeptideDiagram.sideChain(spec) → { parts, end, ring }
 * ========================================================================== */
(function(global){
  'use strict';

  const DX = 50;        // px between backbone atoms
  const UP = 42;        // px from the backbone to a substituent
  const FS = 15;        // label font size
  const SUB = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉' };
  const sub = t => t.replace(/\d/g, d => SUB[d]);

  /* ---- reading a residue ------------------------------------------------- */
  function graph(spec){
    const adj = spec.atoms.map(() => []);
    for(const [i, j, o] of spec.bonds){ adj[i].push([j, o || 1]); adj[j].push([i, o || 1]); }
    const el = i => spec.atoms[i].el;
    return {
      el,
      heavy: i => adj[i].filter(([j]) => el(j) !== 'H').map(([j]) => j),
      hs:    i => adj[i].filter(([j]) => el(j) === 'H').length,
      order: (i, j) => (adj[i].find(([k]) => k === j) || [0, 0])[1],
    };
  }
  const roleOf = (spec, key) => ((spec.condense && spec.condense.roles) || []).find(r => r.key === key);
  function backbone(spec){
    const g = graph(spec);
    const N = roleOf(spec, 'amino').keep, C = roleOf(spec, 'carboxyl').keep;
    const CA = g.heavy(N).find(j => g.heavy(j).includes(C));
    return { g, N, C, CA };
  }

  /* THE SIDE CHAIN, CONDENSED, walked from the α-carbon outward: each heavy
   * atom with its hydrogens (CH₂, SH, OH), and a terminal carboxyl or amide
   * written the way a textbook writes it. A walk that arrives back at the
   * amino N is proline's ring. Glycine's side chain is its second α-H. */
  function sideChain(spec){
    const { g, N, C, CA } = backbone(spec);
    const start = g.heavy(CA).find(j => j !== N && j !== C);
    if(start === undefined) return { parts:['H'], end:null, ring:false };
    const parts = [];
    let prev = CA, cur = start;
    for(;;){
      const nb = g.heavy(cur).filter(j => j !== prev);
      const h = g.hs(cur);
      const own = g.el(cur) + (h ? 'H' + (h > 1 ? h : '') : '');
      if(nb.includes(N)) return { parts:[...parts, own], end:null, ring:true };
      if(g.el(cur) === 'C' && nb.length === 2){
        const dbl = nb.find(j => g.el(j) === 'O' && g.order(cur, j) === 2);
        const other = nb.find(j => j !== dbl);
        if(dbl !== undefined && g.heavy(other).length === 1){
          const e = g.el(other), oh = g.hs(other);
          const end = e === 'O' ? (oh ? 'COOH' : 'COO⁻') : e === 'N' ? 'CONH' + (oh > 1 ? oh : '') : null;
          if(end) return { parts, end, ring:false, endAt:cur };
        }
      }
      if(nb.length > 1) throw new Error(`peptide-diagram: ${spec.name}'s side chain branches; `
        + 'teach sideChain() to condense it before drawing it');
      parts.push(own);
      if(!nb.length) return { parts, end:null, ring:false };
      prev = cur; cur = nb[0];
    }
  }
  const label = sc => sub(sc.parts.join('') + (sc.end || ''));

  /* What a piece is called, as the textbook captions it: a lone residue by its
   * name, a chain by how many residues it has, with its sequence. */
  const COUNT = ['', '', 'Di', 'Tri', 'Tetra', 'Penta', 'Hexa', 'Hepta', 'Octa', 'Nona', 'Deca'];
  function nameOf(frag){
    if(frag.length === 1) return frag[0].spec.name;
    const seq = frag.map(r => r.spec.res || r.spec.name).join('-');
    return (COUNT[frag.length] ? COUNT[frag.length] + 'peptide' : 'Polypeptide') + ' · ' + seq;
  }

  /* ---- drawing ------------------------------------------------------------ */
  function svg(frags, opts){
    const o = opts || {};
    const atoms = [], bonds = [], boxes = [], tints = [], extra = [];
    const atom = (x, y, t, el) => { const a = { x, y, t:sub(t), el:el || t[0] }; atoms.push(a); return a; };
    const bond = (a, b, order) => bonds.push({ a, b, order:order || 1 });
    const residues = [];                        // frag 0 only, for hbonds
    const names = [];

    let x = 0;
    frags.forEach((frag, f) => {
      const first = atoms.length;
      let left = null;                          // the C the next N bonds to
      frag.forEach((r, i) => {
        const sc = sideChain(r.spec);
        const N = atom(x, 0, 'N');
        if(left) bond(left, N);
        const rec = { N };
        if(r.prev){
          if(!sc.ring){ rec.H = atom(x, UP, 'H'); bond(N, rec.H); }
        }else{
          // A free amino group: the H the next bond would take is tinted, the
          // way the stage haloes the end that can react.
          const h1 = atom(x - 34, sc.ring ? 22 : -24, 'H');
          bond(N, h1); tints.push([h1]);
          if(!sc.ring){ const h2 = atom(x - 34, 24, 'H'); bond(N, h2); }
        }
        const CA = atom(x + DX, 0, 'C');
        bond(N, CA); bond(CA, atom(x + DX, UP, 'H'));

        let C, cx;
        if(r.next === 'gamma'){
          // The chain runs on through the side chain; the backbone carboxyl is
          // the branch now, condensed above the α-carbon.
          const bb = atom(x + DX, -UP, 'COOH', 'C');
          bond(CA, bb); tints.push([bb]);
          // Wider steps: a CH₂–CH₂ at the backbone's spacing leaves no bond
          // visible between the two labels.
          const GX = DX * 1.3;
          let p = CA;
          sc.parts.forEach((t, k) => { const a = atom(x + DX + GX * (1 + k), 0, t, 'C'); bond(p, a); p = a; });
          cx = x + DX + GX * (1 + sc.parts.length);
          C = atom(cx, 0, 'C'); bond(p, C);
        }else{
          if(sc.ring){
            // Proline: the side chain closes back onto its own N.
            const [b, gm, d] = sc.parts;
            const B = atom(x + DX + 12, -UP, b, 'C'), G = atom(x + DX/2, -UP - 30, gm, 'C'),
                  D = atom(x - 12, -UP, d, 'C');
            bond(CA, B); bond(B, G); bond(G, D); bond(D, N);
          }else if(label(sc).length > 6){
            // A long side chain stacks upward, one group per carbon, as a
            // textbook stacks it: on one line it runs into the carbonyl O.
            let p = CA;
            [...sc.parts, ...(sc.end ? [sc.end] : [])].forEach((t, k) => {
              const a = atom(x + DX, -UP - k * 34, t, 'C'); bond(p, a); p = a;
            });
            // A side-chain carboxyl that can still react is tinted like the
            // backbone's: glutamate's γ, the one glutathione is made through.
            const g = roleOf(r.spec, 'gamma');
            if(g && g.keep === sc.endAt) tints.push([p]);
          }else bond(CA, atom(x + DX, -UP, label(sc), sc.parts[0] === 'H' ? 'H' : 'C'));
          cx = x + 2 * DX;
          C = atom(cx, 0, 'C');
          bond(CA, C);
        }
        rec.O = atom(cx, -UP, 'O'); bond(C, rec.O, 2);
        if(f === 0) residues.push(rec);

        if(r.next){
          // The peptide bond, boxed as the textbook boxes it: C=O and N–H.
          const fresh = o.fresh && o.fresh[0] === f && o.fresh[1] === i;
          boxes.push({ x0:cx - 18, x1:cx + DX + 18, fresh });
          left = C; x = cx + DX;
        }else{
          const OH = atom(cx + 30, 26, 'O'), HO = atom(cx + 62, 26, 'H');
          bond(C, OH); bond(OH, HO); tints.push([OH, HO]);
          x = cx + 62 + 70;
        }
      });
      const xs = atoms.slice(first).map(a => a.x);
      // Capitals in the string, not text-transform, which SVG text does not
      // reliably honour.
      names.push({ x:(Math.min(...xs) + Math.max(...xs)) / 2, t:nameOf(frag).toUpperCase() });
    });

    /* ---- render ---- */
    const w = t => t.length * FS * 0.52;
    const trim = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
      const g = p => (Math.abs(dx) / L) * (w(p.t) / 2 + 3) + (Math.abs(dy) / L) * 10;
      return [a.x + dx / L * g(a), a.y + dy / L * g(a), b.x - dx / L * g(b), b.y - dy / L * g(b), dx / L, dy / L];
    };
    const f1 = v => v.toFixed(1);
    const out = [];
    for(const b of boxes)
      out.push(`<rect class="pd-bond${b.fresh ? ' fresh' : ''}" x="${b.x0}" y="${-UP - 15}" `
        + `width="${b.x1 - b.x0}" height="${2 * UP + 30}" rx="16"/>`);
    for(const t of tints){
      const y = t[0].y;
      const x0 = Math.min(...t.map(a => a.x - w(a.t) / 2)) - 8,
            x1 = Math.max(...t.map(a => a.x + w(a.t) / 2)) + 8;
      out.push(`<rect class="pd-free" x="${f1(x0)}" y="${y - 13}" width="${f1(x1 - x0)}" height="26" rx="13"/>`);
    }
    for(const { a, b, order } of bonds){
      const [x0, y0, x1, y1, ux, uy] = trim(a, b);
      if(order === 2){
        const nx = -uy * 2.4, ny = ux * 2.4;
        for(const s of [1, -1])
          out.push(`<line x1="${f1(x0 + nx*s)}" y1="${f1(y0 + ny*s)}" x2="${f1(x1 + nx*s)}" y2="${f1(y1 + ny*s)}"/>`);
      }else out.push(`<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}"/>`);
    }
    for(const a of atoms)
      out.push(`<text x="${a.x}" y="${a.y}" class="pd-${a.el}">${a.t}</text>`);
    const yName = Math.max(...atoms.map(a => a.y)) + 28;
    for(const n of names)
      out.push(`<text x="${f1(n.x)}" y="${yName}" class="pd-name">${n.t}</text>`);
    // A water leaves from the bond that just formed.
    for(const b of boxes) if(b.fresh)
      extra.push(`<text class="pd-water" x="${(b.x0 + b.x1) / 2}" y="${-UP - 26}">H₂O</text>`);
    /* THE HELIX'S HYDROGEN BONDS, over the top: from residue i's C=O to the
     * N of residue j, whose H is drawn below it. Each arc is a pair the page
     * found, never a pattern this file assumes. */
    let top = -UP - 30;
    (o.hbonds || []).forEach(([i, j], k) => {
      const a = residues[i] && residues[i].O, b = residues[j] && residues[j].N;
      if(!a || !b) return;
      const h = -UP - 40 - (k % 2) * 16;
      top = Math.min(top, h - 6);
      extra.push(`<path class="pd-hbond" d="M${a.x} ${a.y - 11} C${a.x} ${h} ${b.x} ${h} ${b.x} ${b.y - 12}"/>`);
    });

    const xs = atoms.map(a => a.x), ys = atoms.map(a => a.y);
    const x0 = Math.min(...xs) - 30, x1 = Math.max(...xs) + 30;
    const y0 = Math.min(top, Math.min(...ys)) - 14, y1 = yName + 10;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" `
      + `preserveAspectRatio="xMidYMid meet">${out.join('')}${extra.join('')}</svg>`;
  }

  const API = { svg, sideChain, label };
  if(typeof module === 'object' && module.exports) module.exports = API;
  global.PeptideDiagram = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
