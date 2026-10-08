/* =============================================================================
 *  macromolecule/sidechain.js — turning side chains out of each other's way
 * =============================================================================
 *  A residue on the stage is a rigid copy of the free amino acid, so its side
 *  chain keeps whatever torsions its conformer was fetched with. On an
 *  extended strand that never matters: neighbours point opposite ways. In a
 *  helix residue i sits beside i+3 and i+4, and a glutamine left as fetched
 *  puts a hydrogen 1.05 Å from the backbone a turn below. A real chain never
 *  does that; it turns the side chain's single bonds until it fits.
 *
 *  So this file turns them, and only them. Each side-chain bond with something
 *  heavy beyond it is a χ torsion; χ1 and χ2 are tried at the three staggered
 *  values (−60°, 180°, +60°), which is where real side chains sit, and a
 *  terminal planar group (a carboxyl, an amide) every 60°. Residues are packed
 *  one at a time against everything else, twice round, keeping the choice
 *  whose closest contact is largest. The backbone never moves, so φ, ψ and the
 *  hydrogen bonds the helix is made of are untouched.
 *
 *  NOT AN ENERGY MINIMISER. It answers "where can this side chain go without
 *  touching anything", which is the drawing problem, and prefers the commoner
 *  rotamer when several clear. It does not claim the conformation a protein
 *  would choose: that takes the electrostatics and solvent this has no model of.
 *
 *  Ångströms in, ångströms out, no THREE: check-macromolecule.js runs it.
 *
 *    SideChain.pack(chain) → [{ name: [x,y,z] }]   per residue, the side-chain
 *        atoms that moved, in that residue's OWN frame
 *      chain   [{ spec, quat, pos }]: each residue's spec in its own frame and
 *              where it sits. N–C order is not required.
 *    SideChain.chis(spec) → the rotatable bonds, for a checker
 * ========================================================================== */
(function(global){
  'use strict';

  const sub = (a,b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const add = (a,b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const mul = (a,s) => [a[0]*s, a[1]*s, a[2]*s];
  const dot = (a,b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const cross = (a,b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const unit = a => mul(a, 1 / (len(a) || 1));
  const d2 = (a,b) => (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
  function qrot(q, v){
    const [x,y,z,w] = q;
    const tx = 2*(y*v[2] - z*v[1]), ty = 2*(z*v[0] - x*v[2]), tz = 2*(x*v[1] - y*v[0]);
    return [v[0] + w*tx + y*tz - z*ty, v[1] + w*ty + z*tx - x*tz, v[2] + w*tz + x*ty - y*tx];
  }
  // Rodrigues: v turned by `ang` about the axis through `o` along unit `k`.
  function turn(v, o, k, ang){
    const p = sub(v, o), c = Math.cos(ang), s = Math.sin(ang);
    return add(o, add(add(mul(p, c), mul(cross(k, p), s)), mul(k, dot(k, p) * (1 - c))));
  }
  function torsion(a, b, c, d){
    const b1 = sub(b,a), b2 = sub(c,b), b3 = sub(d,c);
    const n1 = cross(b1,b2), n2 = cross(b2,b3), m = cross(n1, unit(b2));
    return -Math.atan2(dot(m,n2), dot(n1,n2));
  }

  const STAGGER = [-60, 180, 60].map(v => v * Math.PI/180);         // commonest first
  const PLANAR  = [0, 60, 120, 180, -120, -60].map(v => v * Math.PI/180);

  /* THE ROTATABLE BONDS, off the bond graph and the spec's own roles. The side
   * chain is walked from the α-carbon along heavy atoms; each bond whose far
   * atom still has something heavy beyond it is a χ, and the atoms that turn
   * are everything on that far side. A walk that meets the amino N again is
   * proline's ring, which has no free torsion and is left alone. */
  function chis(spec){
    const role = k => ((spec.condense && spec.condense.roles) || []).find(r => r.key === k);
    const adj = spec.atoms.map(() => []);
    for(const [i, j] of spec.bonds){ adj[i].push(j); adj[j].push(i); }
    const heavy = i => adj[i].filter(j => spec.atoms[j].el !== 'H');
    const N = role('amino').keep, C = role('carboxyl').keep;
    const CA = heavy(N).find(j => heavy(j).includes(C));
    const CB = heavy(CA).find(j => j !== N && j !== C);
    if(CB === undefined) return [];
    const path = [N, CA, CB];
    for(;;){
      const last = path[path.length - 1], prev = path[path.length - 2];
      const nb = heavy(last).filter(j => j !== prev);
      if(nb.includes(N)) return [];                       // a ring
      if(nb.length !== 1) break;                          // the end, or a planar fork
      path.push(nb[0]);
    }
    const side = (from, root) => {                        // everything beyond root
      const seen = new Set([from, root]), out = [];
      const stack = [root];
      while(stack.length) for(const j of adj[stack.pop()]) if(!seen.has(j)){
        seen.add(j); out.push(j); stack.push(j);
      }
      return out;
    };
    const out = [];
    for(let k = 1; k + 1 < path.length; k++){
      const b = path[k], c = path[k+1];
      const far = heavy(c).filter(j => j !== b);
      if(!far.length) continue;                           // a methyl, a hydroxyl H
      out.push({ a:path[k-1], b, c, d:far[0], moves:side(b, c),
                 values: far.length > 1 ? PLANAR : STAGGER });
    }
    return out;
  }

  function pack(chain){
    const R = chain.map(r => {
      const x = { r, local:r.spec.atoms.map(a => a.pos.slice()), chis:chis(r.spec) };
      x.world = () => x.local.map(v => add(qrot(r.quat, v), r.pos));
      x.moving = [...new Set(x.chis.flatMap(c => c.moves))];
      /* The residue's own atoms count too, past three bonds: a glutamate
       * turned only against its neighbours put a side-chain O 1.58 Å from its
       * own backbone O. Closer than that is bond geometry, not contact. */
      const n = r.spec.atoms.length, adj = r.spec.atoms.map(() => []);
      for(const [i, j] of r.spec.bonds){ adj[i].push(j); adj[j].push(i); }
      const moves = new Set(x.moving);
      x.self = x.moving.map(a => {
        const hops = new Array(n).fill(Infinity); hops[a] = 0;
        for(const q = [a]; q.length; ){ const i = q.shift();
          for(const j of adj[i]) if(hops[j] > hops[i] + 1){ hops[j] = hops[i] + 1; q.push(j); } }
        return [a, [...Array(n).keys()].filter(b => hops[b] > 3 && !(moves.has(b) && b < a))];
      });
      return x;
    });
    const world = R.map(x => x.world());
    // Closest contact between residue i's moving atoms and every other residue.
    const contact = (i, pos) => {
      let m = Infinity;
      for(const [a, own] of R[i].self){
        for(const b of own){ const v = d2(pos[a], pos[b]); if(v < m) m = v; }
        const p = add(qrot(R[i].r.quat, pos[a]), R[i].r.pos);
        for(let j = 0; j < R.length; j++){
          if(j === i) continue;
          for(const q of world[j]){ const v = d2(p, q); if(v < m) m = v; }
        }
      }
      return Math.sqrt(m);
    };
    const set = (pos, c, ang) => {
      const cur = torsion(pos[c.a], pos[c.b], pos[c.c], pos[c.d]);
      const k = unit(sub(pos[c.c], pos[c.b]));
      for(const i of c.moves) pos[i] = turn(pos[i], pos[c.b], k, ang - cur);
    };
    /* Every combination of the residue's χ values, at most 3·3·6. Above 2.4 Å
     * nothing is touching, so the score stops rewarding distance there and the
     * earlier, commoner rotamer wins the tie. */
    const best = i => {
      const C = R[i].chis;
      if(!C.length) return;
      let top = null;
      const walk = (k, pos, rank) => {
        if(k === C.length){
          const s = Math.min(contact(i, pos), 2.4) - rank * 1e-3;
          if(!top || s > top.s) top = { s, pos:pos.map(v => v.slice()) };
          return;
        }
        C[k].values.forEach((v, n) => {
          const p = pos.map(x => x.slice());
          set(p, C[k], v);
          walk(k + 1, p, rank + n);
        });
      };
      walk(0, R[i].local, 0);
      R[i].local = top.pos;
      world[i] = R[i].world();
    };
    for(let pass = 0; pass < 2; pass++) for(let i = 0; i < R.length; i++) best(i);

    return R.map(x => {
      const out = {}, names = x.r.spec.names || [];
      for(const i of x.moving) if(names[i]) out[names[i]] = x.local[i];
      return out;
    });
  }

  const API = { pack, chis };
  if(typeof module === 'object' && module.exports) module.exports = API;
  global.SideChain = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
