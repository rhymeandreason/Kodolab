/* =============================================================================
 *  macromolecule/assembly.js — a stage where monomers become a molecule
 * =============================================================================
 *  Everything around plane.js's gesture that a card does not decide: the bond
 *  drawn between two meshes, the water that leaves, the halos on the ends that
 *  can still react, the readout of the chain so far, the morph between two
 *  views of a finished molecule, and the rail of cards. A page hands it CARDS
 *  and the stage's elements; a card supplies only chemistry and words.
 *
 *  Loaded by macromolecule-builder.html (one card per class) and
 *  protein-lab.html (one class, four cards). Loads after THREE, scene.js,
 *  kit/stagekit.js and every macromolecule/ solver its cards call.
 *
 *  ---- A CARD -----------------------------------------------------------------
 *    key, n, title, sub        the rail
 *    monomers, home            what is dealt and where. `home` is an array by
 *                              position or a map by monomer name
 *    box                       the frame while building; omitted, the stage
 *                              frames whatever is on it
 *    choose | builds           the one bar over the stage: a monomer for one
 *                              slot, or named builds whose `set` the card takes on
 *    prejoin                   deal the monomers already joined, in order
 *    donor, acceptor           the role each end spends: a key, or (at) => key
 *    solve(host, guest, A)     a pose in angstroms, or null
 *    poseIn(h, g, donor, round) the same pose for a reveal walk, unspent specs
 *    start(spec, key, A)       a quaternion to deal a monomer at
 *    flat                      built in flat.js's layout, revealed in 3D
 *    views {to, back, decorate} two real poses of one molecule; `round` asks
 *                              poseIn for the second. decorate(A) returns
 *                              objects drawn only in the second
 *    chains, ends              whether it has a sequence, and what its ends are
 *    unit, bond, label(p)      words
 *    lead, done, more, round   the note: before anything joins, all joined,
 *                              part joined, in the second view
 *
 *  Card functions get the assembly as their last argument, for `dim`,
 *  `sticks` and `chain()`. Nothing in a card reads a page global.
 * ========================================================================== */
(function(global){
  'use strict';
  const THREE = global.THREE;
  const MolLib = global.MolLib, Stage = global.Stage, MacroSpec = global.MacroSpec;
  const S = MolLib.SCALE, M = MolLib.MOLECULES;

  /* Solvers work in angstroms; a registered spec is in display units. `key`
   * rides along because glycosidic.js looks up which disaccharide measures a
   * monomer's linkage, and a spec does not carry the name it is registered under. */
  const unSpec = (spec, key) => ({ ...spec, key,
                     atoms:spec.atoms.map(a => ({ el:a.el, pos:a.pos.map(v => v/S) })) });
  const un = p => unSpec(p.spec, p.key);
  const rescale = s => ({ ...s, atoms:s.atoms.map(a => ({ el:a.el, pos:a.pos.map(v => v*S) })) });
  /* DROP `view:` WHEN BUILDING. buildMolecule bakes a spec's view rotation into
   * the atom meshes even at center:false, which would desync every mesh from the
   * coordinates the pose was solved against. */
  const flat = s => ({ ...s, view:null });
  const v3 = a => new THREE.Vector3(a[0]*S, a[1]*S, a[2]*S);

  /* WHICH SITE, WHEN THE HOST HAS MORE THAN ONE. Glutamate offers two carboxyls
   * and glycerol three hydroxyls, and the answer has to be the one the student is
   * aiming at. Ranked EXACTLY as plane.js measures the latch — in the plane, at
   * the atom that bonds — because ranking on any other quantity picks a site the
   * gesture can then never satisfy, and the drag simply stops working.
   *
   * Ranking on the molecule's ORIGIN did exactly that. A residue's origin is its
   * Cα, 1.5 Å from the nitrogen that reacts, against a latch tolerance of 1.8 Å,
   * so most of the slop was spent before the student touched anything. A
   * palmitate is worse: its origin sits eight ångströms down its own chain.
   *
   * IN THE PLANE ONLY, for plane.js's reason: two of glycerol's three slots want
   * the tail well out of the tabletop, so a 3D distance would rank sites by how
   * far they escape the plane rather than by where the student pointed. */
  function nearestSite(host, guest, poses){
    let best = null;
    for(const r of poses){
      if(!r || r.clash) continue;
      const quat = host.mol.quaternion.clone().multiply(new THREE.Quaternion(...r.quat));
      const pos  = v3(r.pos).applyQuaternion(host.mol.quaternion).add(host.mol.position);
      const local = r.at ? v3(r.at) : new THREE.Vector3();
      const now  = local.clone().applyQuaternion(guest.mol.quaternion).add(guest.mol.position);
      const want = local.clone().applyQuaternion(quat).add(pos);
      const gap = Math.hypot(now.x - want.x, now.y - want.y);
      if(!best || gap < best.gap) best = { gap, r };
    }
    return best && best.r;
  }

  /* `el`: canvas, stage, note, seq, rail, choose, reveal, reset. */
  function create(opts){
    const CARDS = opts.cards, el = opts.el;
    const canvas = el.canvas, stageEl = el.stage, noteEl = el.note, seqEl = el.seq;
    let card = CARDS[0];

    /* WHICH VIEW THE STAGE IS IN. 'flat' is where the dragging happens and the
     * only state a card without a second view is ever in; '3d' is the second
     * view, where nothing can be built. For a `flat` card that is the molecule
     * leaving its diagram; for a card with `views` it is a second real pose. */
    let dim = 'flat';
    const twoViews = c => !!(c.flat || c.views);

    const A = {
      get card(){ return card; }, get dim(){ return dim; },
      sticks:null, chain:null, P:null, L:null, select:null,
    };

    /* ---- stage -------------------------------------------------------------- */
    const L = Lesson.create(canvas, {
      cam:{ theta:0, phi:1.5708, r:36 }, rMax:400,
      // NO ORBIT — the pointer is projected onto the z = 0 plane the monomers
      // are dragged on, which only means anything face-on.
      orbit:false,
      boxes:()=>{
        /* THE CARD'S BOX IS THE WHOLE BUILD, not just the deal — it is sized for
         * the finished molecule, so the camera never moves while the student is
         * working. A stage that reframes on every join moves the tabletop out
         * from under the hand that is still on it. The second view, and a card
         * with no box, are framed to their content: nobody is holding them. */
        if(dim !== '3d' && card.box) return [card.box];
        /* IN WORLD SPACE, atom by atom, because that is what the camera sees:
         * the root carries both the turn and the shift that keeps the molecule
         * centred under it, and a box measured before those puts the fit an
         * offset away from the thing it is framing. */
        const b = new THREE.Box3(), w = new THREE.Vector3();
        for(const p of P.pieces)
          for(let i = 0; i < p.spec.atoms.length; i++)
            b.expandByPoint(L.root.localToWorld(w.copy(P.atomAt(p, i))));
        if(b.isEmpty()) return [card.box || { x:0, y:0, rxz:30, hy:20 }];
        const c = b.getCenter(new THREE.Vector3()), sz = b.getSize(new THREE.Vector3());
        // Margin, because a box is measured to atom CENTRES and an atom is drawn
        // with a radius, and a tail that ends exactly at the frame edge reads as
        // cut off rather than as finished.
        return [{ x:c.x, y:c.y, rxz:Math.max(sz.x, sz.z)/2 + 7, hy:sz.y/2 + 7 }];
      },
      // A slow turn in the second view, because a still three-quarter view of a
      // molecule reads as another drawing. Only there: the build is a plane the
      // pointer is projected onto, and turning it would put the two out of step.
      afterFrame:()=>{ if(dim === '3d' && !morphing && !turning){ L.root.rotation.y += 0.0022; repivot(); }
                       P.placeTags(); placeSticks(); stepWaters();
                       stepHalos(performance.now() / 1000); },
    });
    A.L = L;

    /* ---- the sandbox -------------------------------------------------------- */
    const P = MacroPlane.create({
      canvas, camera:L.camera, root:L.root, motion:L.motion, stageEl,
      tagDrop: 10,
      build: spec => Stage.buildMolecule(flat(spec), { center:false }),
      // Every rebuild redraws the mesh, so the halos are put back by the same
      // hand rather than being restored by callers.
      onRebuild: p => dressHalos(p),
      solve,
      onJoin: (host, guest, at) => join(host, guest, at, false),
      onBreak,
      onMove: say,
    });
    A.P = P;

    function solve(host, guest){
      const r = card.solve(host, guest, A);
      if(!r) return null;
      /* `slot` AND `donor` ride along: between them they are the only record
       * of WHICH group reacted, and a card reads one back off the join to spend
       * that one. Dropped, glycerol spends nothing and takes a fourth tail;
       * glutamate spends `undefined`, and the next rebuild throws from inside
       * the tween that lands the bond, where an exception kills the animation
       * loop a mile from anything that looks related.
       *
       * ANYTHING A CARD'S `donor`/`acceptor` READS HAS TO BE LISTED HERE. This
       * wrapper is a narrowing, and what it drops is gone silently. */
      return { pos:v3(r.pos), quat:new THREE.Quaternion(...r.quat),
               bondAt:v3(r.bondAt), waterAt:v3(r.waterAt),
               slot:r.slot, donor:r.donor,
               amideH:r.amideH, carbonylO:r.carbonylO,
               // Where the bond forms on the guest, so plane.js can measure the
               // latch there instead of at an origin that may be nowhere near it.
               at:r.at && v3(r.at) };
    }

    /* A bond can change atoms that do NOT leave: an amide nitrogen goes sp3 to
     * sp2 and its surviving H moves into the peptide plane, and the carbonyl O
     * joins it there. The solver says where, per view, and the move is carried
     * on the piece BY NAME rather than applied to its spec, because respec()
     * rebuilds from `base` and would otherwise put the free acid's atoms back. */
    function carryMoves(host, guest, pose, hostSpec, guestSpec, view){
      if(!pose) return null;
      const names = {};
      if(pose.amideH){
        names.guest = guestSpec.names[pose.amideH.index];
        guest.moved[view][names.guest] = pose.amideH.pos;
      }
      if(pose.carbonylO){
        names.host = hostSpec.names[pose.carbonylO.index];
        host.moved[view][names.host] = pose.carbonylO.pos;
      }
      return names;
    }

    // `at` is already in world space: plane.js reads the pose off wherever the
    // host ENDED UP, which is not where it was when the pose was solved if the
    // host is the molecule the student dragged.
    function join(host, guest, at, quiet){
      // Which role each end spent. Glycerol has THREE, so the card answers with
      // the pose rather than a constant.
      const hs = un(host), gs = un(guest);
      const donor = roleOf(card.donor, at, hs), acceptor = roleOf(card.acceptor, at, gs);
      host.spent.add(donor); guest.spent.add(acceptor);
      const moved = carryMoves(host, guest, at.pose, hs, gs, 'flat');
      respec(host); respec(guest);
      stick(host, guest, donor, acceptor, moved);
      if(!quiet){
        if(L.fx) L.fx.condense(at.bondAt, at.waterAt, { size:1.1 });
        water(at.waterAt, 'out');
        say();
      }
    }

    /* HYDROLYSIS, and it is the condensation run backwards rather than an undo.
     * The bond goes, the atoms that left come back, and a water is consumed to
     * put them there — the half of the reaction a textbook draws as an
     * afterthought and the whole reason a cell can take a polymer apart. */
    function onBreak(a, b){
      // The stick remembers which roles this particular bond spent, which is
      // the only record of it: `a` may have spent two others as well.
      const i = sticks.findIndex(s => s.host === a && s.guest === b);
      if(i >= 0){
        const s = sticks[i];
        a.spent.delete(s.donor); b.spent.delete(s.acceptor);
        // Hydrolysis un-flattens the amide too: drop what this bond moved, and
        // respec() puts back what the free amino acid has.
        if(s.moved){
          for(const v of ['flat', '3d']){
            if(s.moved.host) delete a.moved[v][s.moved.host];
            if(s.moved.guest) delete b.moved[v][s.moved.guest];
          }
        }
        L.root.remove(s.m); sticks.splice(i, 1);
      }
      respec(a); respec(b);
      const mid = P.centreOf(a).lerp(P.centreOf(b), 0.5);
      if(L.fx) L.fx.spawnRing(mid, MolLib.PALETTE.bonds.condense, null, 0.6);
      water(mid, 'in');
    }

    /* A piece's spec is DERIVED from the one it started as, every time, minus
     * the leaving atoms of whichever roles it has spent. Editing the spec in
     * place would work for the join and leave nothing to restore on the way
     * back: the atoms are only recoverable while something still remembers them. */
    function respec(p){ P.rebuild(p, rescale(specIn(p, dim))); }

    /* A piece's spec as it stands, in angstroms, in one view. */
    function specIn(p, view){
      const base = unSpec(p.base, p.key);
      const drop = [...p.spent].flatMap(k => MacroSpec.role(base, k).leaves);
      // FLATTEN FIRST, THEN STRIP. A spent residue has FEWER HEAVY ATOMS than
      // its layout has positions, and flat.js rightly refuses it. Laying the
      // base out and then removing the same atoms gives the same answer: strip
      // works off the base's own indices either way round.
      if(card.flat && view === 'flat'){
        const f = MacroFlat.spec(base);
        if(f) return MacroSpec.strip(f, drop);
      }
      const t = MacroSpec.strip(base, drop), mv = p.moved[view];
      if(!mv || !t.names) return t;
      const atoms = t.atoms.slice();
      for(const [name, pos] of Object.entries(mv)){
        const i = t.names.indexOf(name);
        if(i >= 0) atoms[i] = { el:atoms[i].el, pos:pos.slice() };
      }
      return { ...t, atoms };
    }

    /* ---- the bonds, drawn between two meshes ------------------------------
     * The chain is NOT rebuilt into one spec. Each unit keeps its own mesh and
     * the new bond is a stick between them, so a join costs one stick instead
     * of re-triangulating everything already on stage.
     *
     * The two atoms are named by the ROLES, not by index: `strip` renumbered
     * both specs the moment the bond formed. */
    const stickGeo = new THREE.CylinderGeometry(0.13*S, 0.13*S, 1, 10);
    const sticks = [];
    A.sticks = sticks;
    /* Checked here because the alternative is a null two calls further down,
     * inside the tween that lands the bond, where the stack says nothing about
     * which card asked for what. */
    function roleOf(r, at, spec){
      const key = (typeof r === 'function' ? r(at) : r);
      if(!key || !MacroSpec.role(spec, key)) throw new Error(
        `assembly.js: card '${card.key}' says a bond spent the role `
        + `'${key}', which ${spec.name} does not declare. If the card reads it off `
        + `the pose, check that the solve wrapper forwards it.`);
      return key;
    }
    function stick(host, guest, donor, acceptor, moved){
      const m = new THREE.Mesh(stickGeo, new THREE.MeshStandardMaterial(
        { color:MolLib.PALETTE.bonds.condense, roughness:.5 }));
      L.root.add(m);
      sticks.push({ m, host, guest, donor, acceptor, moved });
      placeSticks();
    }
    const _d = new THREE.Vector3(), _up = new THREE.Vector3(0,1,0);
    function placeSticks(){
      for(const s of sticks){
        const from = P.atomAt(s.host,  MacroSpec.role(un(s.host),  s.donor).keep);
        const to   = P.atomAt(s.guest, MacroSpec.role(un(s.guest), s.acceptor).keep);
        const d = _d.subVectors(to, from), len = d.length();
        s.m.position.copy(from).addScaledVector(d, 0.5);
        s.m.quaternion.setFromUnitVectors(_up, d.clone().normalize());
        s.m.scale.set(1, len, 1);
      }
    }

    /* ---- the ends that can still react --------------------------------------
     * A HALO ON EVERY FREE ROLE: the reactive end is a fact about the molecule,
     * so it is drawn on the molecule rather than explained in the caption.
     * Nothing refuses a drag; pushing the wrong ends together still does nothing.
     *
     * READ OFF `condense:`, so a spec that gains a role gains a halo. A spent
     * role has no halo, which is how glycerol visibly runs out. The halo is a
     * child of the piece's own group, so it rides every drag and rebuild. */
    const haloGeo = new THREE.SphereGeometry(1, 20, 16);
    function dressHalos(p){
      for(const r of (p.spec.condense && p.spec.condense.roles) || []){
        // FREE, not merely declared: a spent role keeps its entry.
        if(!MacroSpec.free(p.spec, r.key)) continue;
        const a = p.spec.atoms[r.keep];
        // The CONDENSATION colour, not the atom's, so the two ends of one
        // reaction and the bond it makes read as one thing.
        const m = new THREE.Mesh(haloGeo, new THREE.MeshBasicMaterial({
          color: MolLib.PALETTE.bonds.condense,
          transparent:true, opacity:0.16, depthWrite:false }));
        // A MULTIPLE OF THE ATOM'S DRAWN RADIUS, NOT scaled by SCALE:
        // buildMolecule draws spheres at the palette radius as it stands, while
        // POSITIONS are what SCALE multiplies. Scaling here too made the halo
        // 1.9x the number, which is not visible from the number.
        m.scale.setScalar((MolLib.PALETTE.radii[a.el] || 0.7) * 1.7);
        m.position.set(...a.pos);
        m.userData.halo = true;
        p.mol.add(m);
      }
    }

    /* The halos breathe, and brighten when a partner is close enough to be
     * caught. Gone in the second view: there is nothing left to react. */
    const _h = new THREE.Vector3(), _o = new THREE.Vector3();
    const NEAR = 12;
    function stepHalos(t){
      for(const p of P.pieces){
        for(const m of p.mol.children){
          if(!m.userData.halo) continue;
          if(dim !== 'flat'){ m.visible = false; continue; }
          m.visible = true;
          m.getWorldPosition(_h);
          let near = false;
          for(const q of P.pieces){
            if(q === p) continue;
            for(const r of (q.spec.condense && q.spec.condense.roles) || []){
              if(!MacroSpec.free(q.spec, r.key)) continue;
              _o.set(...q.spec.atoms[r.keep].pos)
                .applyQuaternion(q.mol.quaternion).add(q.mol.position);
              if(_h.distanceTo(_o) < NEAR) near = true;
            }
          }
          m.material.opacity = (near ? 0.3 : 0.15) + 0.04 * Math.sin(t * 2.2);
        }
      }
    }

    /* ---- the water ---------------------------------------------------------- */
    const WATER_LIFE = 2.4;
    const waters = [];
    function water(at, way){
      const mol = Stage.buildMolecule(flat(M.water), { center:true });
      mol.position.copy(at);
      const mats = [];
      mol.traverse(o => { if(o.material){ o.material.transparent = true; mats.push(o.material); } });
      L.root.add(mol);
      const tag = document.createElement('div');
      tag.className = 'leaving';
      tag.textContent = M.water.formula;
      stageEl.appendChild(tag);
      waters.push({ mol, mats, el:tag, at:at.clone(), way:way||'out', born:performance.now() });
    }
    const _w = new THREE.Vector3();
    function stepWaters(){
      const r = canvas.getBoundingClientRect(), now = performance.now();
      for(let i = waters.length - 1; i >= 0; i--){
        const w = waters[i];
        const u = (now - w.born) / 1000 / WATER_LIFE;
        if(u >= 1){ dropWater(i); continue; }
        // Straight up and out of the way: a water drifting across the chain is
        // the thing a student would follow. Hydrolysis runs the same path in.
        const t = w.way === 'in' ? 1 - u : u;
        w.mol.position.copy(w.at).addScaledVector(_up, t * 7);
        const fade = w.way === 'in' ? u * u : 1 - u * u;
        for(const m of w.mats) m.opacity = fade;
        w.el.style.opacity = fade;
        _w.copy(w.mol.position).project(L.camera);
        w.el.style.left = ((_w.x*0.5+0.5) * r.width) + 'px';
        w.el.style.top  = ((-_w.y*0.5+0.5) * r.height - 6) + 'px';
      }
    }
    function dropWater(i){
      const w = waters[i];
      L.root.remove(w.mol); w.el.remove();
      w.mol.traverse(o => { if(o.geometry) o.geometry.dispose(); });
      waters.splice(i, 1);
    }

    /* ---- what the page says ------------------------------------------------
     * Read off the pieces every time, never accumulated: a count added to on
     * each join is a number that survives a reset it did not hear about. */
    function chain(){
      // A fat is not a chain: three tails hang off one glycerol.
      if(!card.chains) return P.links.length ? P.pieces.filter(
        p => P.links.some(l => l.a === p || l.b === p)) : [];
      // The chain starts at the unit that has not spent its ACCEPTOR — the
      // N-terminus, or the sugar whose C4 is still free.
      const starts = P.pieces.filter(p => MacroSpec.free(un(p), card.acceptor));
      for(const s of starts){
        const out = [s];
        for(;;){
          const nxt = P.links.find(l => l.a === out[out.length-1]);
          if(!nxt) break;
          out.push(nxt.b);
        }
        if(out.length > 1) return out;
      }
      return [];
    }
    A.chain = chain;

    const said = (x, c) => typeof x === 'function' ? x(c, card, A) : x;
    function say(){
      const c = chain();
      showReveal(); showTags();
      if(c.length < 2){
        seqEl.style.display = 'none';
        noteEl.innerHTML = card.lead;
        return;
      }
      // The readout is for things that HAVE a sequence. Printing a fat's three
      // tails in a row would invent the one property its card says it lacks.
      seqEl.style.display = card.chains ? 'block' : 'none';
      if(card.chains){
        seqEl.classList.toggle('low', !!(card.choose || card.builds));
        seqEl.querySelector('.chain').textContent =
          c.map(p => p.spec.res || p.spec.short || p.spec.name).join(' – ');
        seqEl.querySelector('.ends').textContent = card.ends || '';
      }
      if(dim === '3d'){ noteEl.innerHTML = said(card.round, c) || ''; return; }
      const n = c.length - 1;
      const tail = P.pieces.length > c.length ? said(card.more, c) : said(card.done, c);
      noteEl.innerHTML = `<b>${n} ${card.bond}${n>1?'s':''}</b>, `
        + `<b>${n} water${n>1?'s':''}</b> gone. ` + tail;
    }

    /* ---- the second view ----------------------------------------------------
     * THE SAME SPHERES, MOVED — molecule-viewer.html's transition, on an
     * assembly instead of one molecule. Nothing is swapped and nothing fades:
     * every atom slides from the pose it was built in to the other one, which
     * is the only thing that can honestly say the two are one molecule.
     *
     * Building is off in the second view: the pointer means a place on the
     * tabletop, and there is no tabletop once the thing has turned. */
    const dimBtn = el.reveal;
    const SPIN = 0.55;                 // radians the stage turns as it lands
    let morphing = false;
    let decor = [];

    /* TURN IT ABOUT ITSELF. The root's origin is where the monomers were dealt,
     * not where the molecule ended up, so turning the root swings the molecule
     * out of frame. The root is shifted each frame by however far the turn
     * moved the assembly's own centre, which pins it while everything rotates. */
    const pivot = new THREE.Vector3();
    const _pv = new THREE.Vector3();
    function repivot(){
      _pv.copy(pivot).applyEuler(L.root.rotation);
      L.root.position.copy(_pv).multiplyScalar(-1);
    }
    function setPivot(){
      const b = new THREE.Box3();
      for(const p of P.pieces)
        for(let i = 0; i < p.spec.atoms.length; i++) b.expandByPoint(P.atomAt(p, i));
      if(!b.isEmpty()) b.getCenter(pivot);
    }

    /* WALK THE JOINS, DON'T ASSUME A SHAPE. A fat is a hub and a protein is a
     * chain, so a reveal written for either is wrong for the other. Starting
     * from a piece nothing bonded TO, each join is re-solved in the view being
     * arrived at and composed onto where its host lands. */
    function walk(round){
      const view = round ? '3d' : 'flat';
      // In the view being ARRIVED at, and unspent. A flat pose refuses a spec
      // that is not in the plane, so handing it the model would silently drop
      // the join and leave that piece behind.
      const asked = p => {
        const b = unSpec(p.base, p.key);
        return (round || !card.flat) ? b : (MacroFlat.spec(b) || b);
      };
      const guests = new Set(sticks.map(k => k.guest));
      const at = new Map();
      for(const r of P.pieces.filter(p => !guests.has(p)))
        at.set(r, { pos:r.mol.position.toArray(), quat:r.mol.quaternion.toArray() });
      let left = sticks.slice(), moved = true;
      while(left.length && moved){
        moved = false;
        left = left.filter(k => {
          if(!at.has(k.host)) return true;
          /* SOLVED AGAINST THE UNSPENT PAIR. A pose is built out of the atoms
           * the condensation consumed, so neither end can answer once it has
           * spent them. Legitimate because strip() moves no atom. */
          const h = asked(k.host), g = asked(k.guest);
          const r = card.poseIn(h, g, k.donor, round);
          if(!r) return false;
          carryMoves(k.host, k.guest, r, h, g, view);
          at.set(k.guest, MacroPlane.compose(at.get(k.host),
            { pos:v3(r.pos).toArray(), quat:r.quat }));
          moved = true;
          return false;
        });
      }
      return at;
    }

    function clearDecor(){
      for(const o of decor){
        L.root.remove(o);
        o.traverse(x => { if(x.geometry) x.geometry.dispose(); });
      }
      decor = [];
    }

    /* Both halves move. A piece changes SHAPE (glycerol's backbone goes sp3, an
     * amide's O and H turn with ψ and φ) and it changes PLACE, because the pose
     * it sits at is the other view's. The first is a per-atom morph, the second
     * a rigid tween, and they run on one clock. */
    function reveal(to){
      // Everything on the stage is one molecule, or the morph leaves the loose
      // pieces lying in a pose the rest of the stage has left.
      if(morphing || sticks.length !== P.pieces.length - 1) return;
      const round = to === '3d';
      clearDecor();
      const at = walk(round);

      const movers = P.pieces.map(p => {
        const dest = rescale(specIn(p, round ? '3d' : 'flat'));
        const meshes = p.mol.userData.atomMeshes;
        const target = at.get(p) ||
          { pos:p.mol.position.toArray(), quat:p.mol.quaternion.toArray() };
        return {
          p, dest, meshes,
          from: meshes.map(m => m && m.position.clone()),
          to:   dest.atoms.map(a => new THREE.Vector3(...a.pos)),
          fromPos:p.mol.position.clone(), fromQuat:p.mol.quaternion.clone(),
          toPos:new THREE.Vector3(...target.pos),
          toQuat:new THREE.Quaternion(...target.quat),
        };
      });

      // Set before the turn starts, from where the pieces are now: a tween that
      // rotates around the old origin swings the molecule across the stage.
      if(round) setPivot(); else pivot.set(0,0,0);
      const spin0 = L.root.rotation.y, spin1 = round ? SPIN : 0;
      morphing = true;
      const put = u => {
        for(const m of movers){
          m.meshes.forEach((x,i) => { if(x) x.position.lerpVectors(m.from[i], m.to[i], u); });
          // Every bond inside a monomer is a single stick, so it can be
          // re-placed rather than rebuilt. placeBond refuses a double bond's
          // group, and that refusal is the check.
          m.p.mol.userData.bondMeshes.forEach(b => {
            const [i,j] = b.userData.pair;
            if(m.meshes[i] && m.meshes[j])
              Stage.placeBond(b, m.meshes[i].position, m.meshes[j].position);
          });
          m.p.mol.position.lerpVectors(m.fromPos, m.toPos, u);
          m.p.mol.quaternion.slerpQuaternions(m.fromQuat, m.toQuat, u);
        }
        L.root.rotation.y = spin0 + (spin1 - spin0) * u;
        repivot();
      };
      const land = () => {
        dim = round ? '3d' : 'flat';
        for(const m of movers){
          // Rebuilt from the spec it landed on, so the assembly stops being a
          // molecule held together by a tween.
          P.rebuild(m.p, m.dest);
          m.p.mol.position.copy(m.toPos); m.p.mol.quaternion.copy(m.toQuat);
        }
        // Set, not left where the tween's last frame stopped: the idle turn is
        // still running underneath it.
        L.root.rotation.y = spin1;
        if(round) setPivot(); else { L.root.rotation.x = 0; pivot.set(0,0,0); }
        repivot();
        if(round && card.views && card.views.decorate){
          decor = card.views.decorate(A) || [];
          for(const o of decor) L.root.add(o);
        }
        morphing = false;
        say(); L.fit();
      };
      L.motion.seq([{ dur:1.1, ease:'inOutCubic', onUpdate:put }, { call:land }], { tag:'reveal' });
    }
    if(dimBtn) dimBtn.addEventListener('click', () => reveal(dim === 'flat' ? '3d' : 'flat'));

    /* THE NAMES BELONG TO THE BUILD. In the second view, no labels: by then the
     * thing on the stage is one molecule. Building, only what is still LOOSE: a
     * joined unit's tag sits over the bond that just formed. Joined is read off
     * the LINKS, so a second, separate chain loses its labels too. */
    function showTags(){
      const joined = new Set(P.links.flatMap(l => [l.a, l.b]));
      for(const p of P.pieces)
        p.tag.style.display = (dim === 'flat' && !joined.has(p)) ? '' : 'none';
    }

    function showReveal(){
      if(!dimBtn) return;
      // A card with one view is already showing the molecule.
      dimBtn.style.display = twoViews(card) ? '' : 'none';
      const whole = twoViews(card) && sticks.length === P.pieces.length - 1;
      dimBtn.classList.toggle('on', !!(whole || dim === '3d'));
      const v = card.views || { to:'See it in 3D', back:'Back to the diagram' };
      dimBtn.textContent = dim === '3d' ? v.back : v.to;
    }

    /* ---- pointer ------------------------------------------------------------
     * TWO GESTURES, ONE POINTER. Building, a drag moves a molecule on the
     * tabletop. In the second view there is nothing to build, so the same drag
     * turns the model. Turning the ROOT rather than the camera keeps the
     * tabletop's projection untouched underneath. */
    let turning = null;
    canvas.addEventListener('pointerdown', e => {
      if(dim === 'flat'){ P.down(e); return; }
      turning = { x:e.clientX, y:e.clientY };
      try{ canvas.setPointerCapture(e.pointerId); }catch(_){}
    });
    canvas.addEventListener('pointermove', e => {
      if(dim === 'flat'){ P.move(e); return; }
      if(!turning) return;
      L.root.rotation.y += (e.clientX - turning.x) * 0.008;
      // Clamped: past a quarter turn the model is seen edge-on from above,
      // which reads as a different molecule.
      L.root.rotation.x = Math.max(-1.2, Math.min(1.2,
        L.root.rotation.x + (e.clientY - turning.y) * 0.008));
      repivot();
      turning = { x:e.clientX, y:e.clientY };
    });
    canvas.addEventListener('pointerup', e => {
      turning = null;
      if(dim === 'flat'){ P.up(e); say(); }
      try{ canvas.releasePointerCapture(e.pointerId); }catch(_){}
    });
    // Double-click to hydrolyse: a drag is how a chain gets MOVED, so breaking
    // a bond needs its own gesture.
    canvas.addEventListener('dblclick', e => {
      if(dim !== 'flat') return;
      const n = P.nearest(P.toWorld(e));
      if(n) P.breakAt(n.p);
      say();
    });

    /* ---- laying a card out --------------------------------------------------
     * Everything on stage is torn down and rebuilt, because a card is a
     * different set of molecules and a different reaction. */
    function clearStage(){
      clearDecor();
      for(const s of sticks) L.root.remove(s.m);
      sticks.length = 0;
      for(let i = waters.length - 1; i >= 0; i--) dropWater(i);
      for(const p of P.pieces){
        L.root.remove(p.mol);
        p.mol.traverse(o => { if(o.geometry) o.geometry.dispose(); });
        p.tag.remove();
      }
      P.pieces.length = 0; P.links.length = 0;
    }

    /* A BUILD IS A SET OF FIELDS THE CARD TAKES ON. Copied rather than
     * consulted through a wrapper, so everything downstream keeps reading
     * `card.monomers` and does not have to know builds exist. */
    function useBuild(c, key){
      if(!c.builds) return;
      const b = c.builds.find(x => x.key === key) || c.builds[0];
      Object.assign(c, b.set);
      c.buildKey = b.key;
    }

    /* PREJOINED: the chain is dealt already built, each residue at the pose the
     * card solves against the one before. The same join a drag makes, minus the
     * water: a card that starts from a chain is not about making it. */
    function prejoin(){
      for(let i = 1; i < P.pieces.length; i++){
        const host = P.pieces[i-1], guest = P.pieces[i];
        const s = solve(host, guest);
        if(!s) throw new Error(`assembly.js: card '${card.key}' cannot prejoin piece ${i}`);
        const t = MacroPlane.compose(
          { pos:host.mol.position.toArray(), quat:host.mol.quaternion.toArray() },
          { pos:s.pos.toArray(), quat:s.quat.toArray() });
        guest.mol.position.set(...t.pos); guest.mol.quaternion.set(...t.quat);
        P.links.push({ a:host, b:guest });
        join(host, guest, { pose:s }, true);
      }
    }

    function layOut(){
      // Whatever the stage was turned to, a new set of molecules starts in the
      // building view: there is no tabletop in the other one.
      if(L.motion) L.motion.cancel('reveal');
      morphing = false; dim = 'flat';
      L.root.rotation.set(0, 0, 0); L.root.position.set(0, 0, 0);
      clearStage();
      if(card.builds) useBuild(card, card.buildKey || card.builds[0].key);
      if(card.choose) card.monomerKey = card.monomerKey || card.choose.key;
      card.monomers.forEach((name, i) => {
        // The chooser's pick fills every slot named for it; anything else on
        // the stage is itself. Glycerol is not a fatty acid and does not become one.
        const key = card.choose && name === card.choose.slot ? card.monomerKey : name;
        const spec = M[key];
        // Flat cards are dragged in the layout, not in the molecule. `base`
        // stays the real spec, because that is what the reveal has to get back to.
        const shown = card.flat
          ? rescale(MacroFlat.spec(unSpec(spec, key)) || unSpec(spec, key)) : spec;
        const quat = card.start ? card.start(spec, key, A) : new THREE.Quaternion();
        const c = P.centroid(shown).applyQuaternion(quat);
        const at = Array.isArray(card.home) ? card.home[i] : card.home[name];
        const p = P.add(shown, new THREE.Vector3(at[0] - c.x, at[1] - c.y, -c.z), quat,
                        { key, base:spec, spent:new Set(), moved:{ flat:{}, '3d':{} } });
        p.tag.textContent = card.label(p);
      });
      if(card.prejoin) prejoin();
      // One bar, two jobs: a card offers named BUILDS or a choice of MONOMER
      // for one slot. No card wants both.
      const opts = card.builds ? card.builds.map(b => [b.key, b.label])
                 : card.choose ? card.choose.opts : [];
      const active = card.builds ? card.buildKey : card.monomerKey;
      const chooseEl = el.choose;
      chooseEl.style.display = opts.length ? 'flex' : 'none';
      chooseEl.innerHTML = '';
      for(const [key, label] of opts){
        const b = document.createElement('button');
        b.dataset.key = key; b.innerHTML = label;
        b.setAttribute('aria-pressed', String(key === active));
        b.addEventListener('click', () => {
          if(card.builds) card.buildKey = key; else card.monomerKey = key;
          layOut();
        });
        chooseEl.appendChild(b);
      }
      syncRail();
      say();
      L.fit();
    }

    /* ---- the card rail ------------------------------------------------------- */
    const railEl = el.rail;
    for(const c of CARDS){
      const b = document.createElement('button');
      b.innerHTML = `<span class="n">${c.n}</span><span>${c.title}`
                  + `<span class="sub">${c.sub}</span></span>`;
      b.addEventListener('click', () => select(c.key));
      b.dataset.key = c.key;
      railEl.appendChild(b);
    }
    function syncRail(){
      for(const b of railEl.children){
        b.setAttribute('aria-current', String(b.dataset.key === card.key));
        // A build can change its card's subtitle, so the rail reads it back.
        const c = CARDS.find(x => x.key === b.dataset.key);
        const sub = b.querySelector('.sub');
        if(c && sub) sub.textContent = c.sub;
      }
    }
    function select(key){
      card = CARDS.find(c => c.key === key) || CARDS[0];
      layOut();
    }
    A.select = select;
    if(el.reset) el.reset.addEventListener('click', layOut);

    layOut();
    L.start();
    return A;
  }

  global.MacroAssembly = { create, un, unSpec, rescale, nearestSite };
})(typeof globalThis !== 'undefined' ? globalThis : this);
