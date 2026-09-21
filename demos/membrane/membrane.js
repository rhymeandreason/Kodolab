/* =============================================================================
 *  membrane/membrane.js — a membrane, its channels and pump, and what crosses
 * =============================================================================
 *  membrane-lab.html grew this inline: a bilayer with holes for its proteins,
 *  ions and small molecules random-walking either side of it, a K⁺ and a Cl⁻
 *  channel that admit by hydration and by charge, a leak that builds the
 *  voltage that stops it, and a Na⁺/K⁺ pump whose cargo is the same ions the
 *  rest of the page walks around. What a lesson step used to decide by name is
 *  a parameter here:
 *
 *      potential   'off'     the pores conduct forever at full drive
 *                  'fixed'   E_K and E_Cl are constants; the leak spends the
 *                            gradient it started with (the channel step)
 *                  'nernst'  equilibria off the live counts, so a pump
 *                            rebuilding the gradient moves the target (rest)
 *      pumpAuto    the pump re-arms itself (rest) or waits for spend() (pump)
 *      shells      hydration shells drawn and shed at the filter
 *
 *      Membrane.create(THREE, root, camera, opts)   the sim: root is yours
 *      Membrane.mount(el, params)                   one box, one handle
 *
 *  The sheet, the travellers and every rule that moves them are
 *  membrane/sheet.js; this file is the machines that make it a plasma
 *  membrane. It refuses the lesson: no captions, no buttons, no step.
 *  'cross' (t, dir) is a molecule through the bilayer, 'conduct' (t, dir) one
 *  through a pore, 'turn' and 'turned' the pump starting and finishing. The
 *  ATP a turn spends is drawn here, docking on the pump's head; a page only
 *  calls spend().
 *
 *  Proteins are a LAYOUT, not a step:
 *      proteins: { K | CL | NA | AQP | pump: {x} | null }
 *  K, CL and NA are channels for their ion; AQP is an aquaporin, a pore for
 *  water and nothing charged, single file, direction by headcount alone.
 *
 *  THE PROTON CIRCUIT IS NOT HERE. A mitochondrion's inner membrane is
 *  ElectronTransport and a thylakoid is LightReactions, both on the same
 *  sheet.js; a `context`, a `fuel` or a `complex` handed to this component
 *  gets a warning naming them and a plasma membrane.
 *
 *  WHAT IS EXAGGERATED is declared where it is set (sheet.js's exag,
 *  mvPerIon); the physics comments travel with the code they explain.
 * ========================================================================== */
(function (global) {
  'use strict';

  const DEFAULTS = {
    pumpAuto: false,
    pumpOn: true,
    turnSeconds: 11,
    /* (kind, { pos, rot, tagY, away }) → true when a caller takes the pump's
       ADP ('ADP') or phosphate ('Pi') as it leaves, and draws it from there. */
    release: null,
  };
  const CIRCUIT_KEYS = ['complex', 'synthase', 'leak', 'translocase'];

  /* ---- the machines of a plasma membrane ---- */
  function transport(eng) {
    const { THREE, P, HALF, rnd, travellers, CHEM } = eng;
    const rgb = global.Parts;

    /* A K⁺ channel is a TETRAMER and a CLC chloride channel a DIMER: the lobe
       count is the subunit count. The channel gets a wide pore and the pump a
       snug site — a channel conducts millions a second BECAUSE its pore does
       not grip. Radii feed the hole and the solid-wall test, so retuning a
       lobe cannot leave either behind. */
    const K_R = 12.8, K_LOBE = 0.11, CL_R = 15.6, CL_LOBE = 0.17;
    const K_HOLE = K_R * (1 + K_LOBE) + 0.5, CL_HOLE = CL_R * (1 + CL_LOBE) + 0.5;
    const CHANNEL = rgb.transporter({ half:HALF, over:8, site:7.2, mouth:8.8, radius:K_R, lobes:4, lobeDepth:K_LOBE });
    const CLCHAN  = rgb.transporter({ half:HALF, site:7.2, mouth:8.0, radius:CL_R, lobes:2, lobeDepth:CL_LOBE, color:0xb58a4f });
    /* A Na⁺ LEAK: the epithelial sodium channel is a TRIMER, and it is what
       lets sodium in down its gradient, which is the whole reason the pump
       has work to do. Violet, the sodium family's colour. SLIMMER THAN THE
       K⁺ CHANNEL: ENaC crosses the membrane on six helices, two a subunit,
       the same count as the ADP/ATP translocase, and most of its bulk stands
       outside the cell, undrawn, so what is drawn ends just past the heads.
       The pore narrows with the ion: Na⁺ is drawn at 0.82 of K⁺. Still three
       lobes and still open through, because it is a channel and the
       translocase is a carrier. */
    const NA_R = 10.5, NA_LOBE = 0.12, NA_HOLE = NA_R * (1 + NA_LOBE) + 0.5;
    const NACHAN  = rgb.transporter({ half:HALF, over:5, site:5.9, mouth:7.3, radius:NA_R, lobes:3, lobeDepth:NA_LOBE, color:0x9b6fd8 });
    /* An AQUAPORIN: a TETRAMER whose pore passes water in single file and
       nothing charged. Slimmer than the ion channels; teal, so it reads as a
       different kind of door. */
    const AQP_R = 12.0, AQP_LOBE = 0.10, AQP_HOLE = AQP_R * (1 + AQP_LOBE) + 0.5;
    const AQP     = rgb.transporter({ half:HALF, site:6.4, mouth:8.4, radius:AQP_R, lobes:4, lobeDepth:AQP_LOBE, color:0x3fa7a0 });
    /* A P-TYPE ATPase IS MOSTLY NOT IN THE MEMBRANE. The part in the
       bilayer carries the ions; the cytoplasmic head, where the ATP binds and
       the phosphate is held, is a big domain hanging into the cytosol. Drawn
       the way figures of this pump draw it: ONE BODY, waisted in the
       membrane and flared at the cytosolic end only. Not
       separate lobes, which read as parts bolted on, and nothing coaxial
       hanging off it, which reads as an axle. The foot is −y because this
       component is always a plasma membrane. */
    const PUMP_R = 13.0;
    const PUMP    = rgb.transporter({ half:HALF, over:15, radius:PUMP_R, flare:[0.5, 0], color:0x4f9e78 });
    eng.root.add(CHANNEL.group, CLCHAN.group, NACHAN.group, AQP.group, PUMP.group);
    let pumpX = 0;

    /* ---- the ATP a turn spends, drawn on the foot ----
       Pump.at()'s `phosphate` is the chemistry, and this only draws it: the
       ATP docks on the flank of the foot (the N domain), its terminal
       phosphate moves down onto the aspartate nearer the axis (the P domain)
       as the gates shut on the sodium, the ADP leaves, and the phosphate
       rides the outward half until it is taken off as the gates shut on the
       potassium, leaving as Pᵢ. Children of the pump's group, so the curve
       bends them with the protein.

       ON THE SILHOUETTE, z = 0, because the cutaway removes the front half
       of the pump and anything seated on its front face would float. Read
       off the lathe's own outline, so a reshaped pump moves the sites. */
    const NUC = eng.nucleotide;
    const TOKENS = new THREE.Group();
    PUMP.group.add(TOKENS);
    let side = -1, handed = false, relADP = false, relPi = false, atpObj = null, piObj = null, G = null;
    /* The outline's point at depth yy into the cytosol, on the +x flank,
       with its outward normal. ON THE FLANK, not the underside: with the
       cutaway on, the underside at z = 0 is only a cut edge, and a token
       there reads as floating below the pump. */
    function flankAt(yy, lift) {
      const pt = v => ({ x: PUMP.outerR(side * v), y: side * v });
      const p = pt(yy), a = pt(yy - 1), b = pt(yy + 1);
      const tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1;
      let nx = ty / L, ny = -tx / L;
      if (nx < 0) { nx = -nx; ny = -ny; }
      return { x: p.x + nx * lift, y: p.y + ny * lift, z: 0, nx, ny };
    }
    const off = (p, d, along, ang) => ({ x: p.x + p.nx * d + (along ? Math.cos(ang) * along : 0),
                                         y: p.y + p.ny * d + (along ? Math.sin(ang) * along : 0), z: 0 });
    /* Each site read in the state it is occupied in: the ATP docks with the
       bottom gate open, the phosphate is held with it shut. The ATP lies
       along the flank with its terminal phosphate pointing down it, toward
       the aspartate on the shoulder below. */
    function sites() {
      const H = PUMP.height, g = PUMP.gates;
      PUMP.setGates(1, 0);
      const ON_P = flankAt(H * 0.9, NUC.R_BEAD * 0.6);
      PUMP.setGates(0, 1);
      const DOCK = flankAt(H * 0.8, NUC.R_BEAD * 0.9);
      PUMP.setGates(g.top, g.bottom);
      DOCK.ang = Math.atan2(DOCK.y - ON_P.y, DOCK.x - ON_P.x);
      const TERM = off(DOCK, 0, -NUC.GAP, DOCK.ang);
      return { DOCK, TERM, ON_P, APP: off(DOCK, 26), HAND: off(DOCK, 9), ADP_OFF: off(DOCK, 15, 4, DOCK.ang),
               PI_OFF: off(ON_P, 12), PI_END: off(ON_P, 20) };
    }
    const lerp3 = (o, a, b, t) => o.position.set(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, a.z + (b.z - a.z) * t);
    const fadeTo = (o, a) => o.traverse(m => { if (m.material) { m.material.transparent = a < 1; m.material.opacity = Math.max(0, a); } });
    function retag(o, text, h) {
      const old = o.userData.tag;
      if (old && old.userData.text === text) return;
      if (old) { eng.kit.forget(old); o.remove(old); }
      const tag = eng.kit.pill(text, h);
      tag.userData.text = text;
      tag.position.set(0, side * (NUC.R_BEAD + h * 0.8), 0);
      o.add(tag); o.userData.tag = tag;
    }
    function dropTokens() {
      for (const o of [atpObj, piObj]) if (o) { o.traverse(m => { if (m.isSprite) eng.kit.forget(m); }); TOKENS.remove(o); }
      atpObj = piObj = null;
    }
    /* The token as it leaves, in world terms, for P.release to carry on. */
    const _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();
    function handOff(o, kind, site) {
      if (!P.release) return false;
      o.updateWorldMatrix(true, false);
      o.getWorldQuaternion(_q); _e.setFromQuaternion(_q);
      PUMP.group.getWorldQuaternion(_q);
      const away = new THREE.Vector3(site.nx, site.ny, 0).applyQuaternion(_q);
      return !!P.release(kind, { pos: o.getWorldPosition(_w).clone(), rot: _e.z,
        tagY: o.userData.tag ? o.userData.tag.position.y : 0, away: { x: away.x, y: away.y } });
    }
    function newTokens() {
      dropTokens();
      relADP = relPi = false;
      if (!G) G = sites();
      atpObj = NUC(3);
      atpObj.rotation.z = G.DOCK.ang;
      atpObj.userData.tag.userData.text = 'ATP';
      atpObj.userData.tag.position.y = side * (NUC.R_BEAD + 5.2);
      piObj = new THREE.Group();
      piObj.add(new THREE.Mesh(new THREE.SphereGeometry(NUC.R_BEAD, 16, 12), rgb.flat(global.MolLib.PALETTE.atoms.P)));
      piObj.visible = false;
      TOKENS.add(atpObj, piObj);
    }
    function drawTokens(st) {
      if (!running || !atpObj) return;
      const { phase: id, k } = st, f = st.phosphate.transfer;
      const whole = id === 'load-na' || (id === 'occlude-na' && f === 0);
      atpObj.userData.beads[2].visible = atpObj.userData.links[1].visible = whole;
      atpObj.visible = id === 'load-na' || id === 'occlude-na' || id === 'open-out';
      piObj.visible = !whole && id !== 'load-na' && id !== 'release-k';
      if (id === 'load-na') {
        const t = Math.min(1, k / 0.6), e = t * t * (3 - 2 * t);
        lerp3(atpObj, handed ? G.HAND : G.APP, G.DOCK, e);
        fadeTo(atpObj, handed ? 1 : Math.min(1, k * 4));
        /* A handed ATP arrives level with its label up, as the caller walked
           it, and turns onto the flank as it seats. */
        if (handed) {
          const up = NUC.R_BEAD + 5.2;
          atpObj.rotation.z = G.DOCK.ang * e;
          atpObj.userData.tag.position.y = up + (side * up - up) * e;
        }
        retag(atpObj, 'ATP', 6.4);
      } else if (id === 'occlude-na') {
        lerp3(atpObj, G.DOCK, G.DOCK, 0); fadeTo(atpObj, 1);
        if (f >= 0.5) retag(atpObj, 'ADP', 6.4);
        lerp3(piObj, G.TERM, G.ON_P, f); fadeTo(piObj, 1);
        if (f > 0) retag(piObj, 'P', 5.2);
      } else if (id === 'open-out') {
        retag(atpObj, 'ADP', 6.4);
        lerp3(atpObj, G.DOCK, G.ADP_OFF, k * k); fadeTo(atpObj, 1 - k);
      }
      if (id === 'open-out' || id === 'release-na' || id === 'load-k') { lerp3(piObj, G.ON_P, G.ON_P, 0); fadeTo(piObj, 1); retag(piObj, 'P', 5.2); }
      if (id === 'occlude-k') {
        lerp3(piObj, G.ON_P, G.PI_OFF, 1 - f); fadeTo(piObj, 1);
        retag(piObj, 1 - f >= 0.5 ? 'Pᵢ' : 'P', 5.2);
      } else if (id === 'open-in') {
        lerp3(piObj, G.PI_OFF, G.PI_END, k); fadeTo(piObj, 1 - k); retag(piObj, 'Pᵢ', 5.2);
        if (relPi === false) relPi = handOff(piObj, 'Pi', G.ON_P) || null;
      }
      if (id === 'open-out' && relADP === false) relADP = handOff(atpObj, 'ADP', G.DOCK) || null;
      /* Taken: the caller draws it from here. null is declined, and it fades. */
      if (relADP) atpObj.visible = false;
      if (relPi) piObj.visible = false;
    }

    /* ---- the pump's cargo is REAL IONS ----
       A spend recruits travellers out of the solution, so setting them down
       on the far side changes the counts and moves the voltage. parts.js's Pump owns
       the choreography; this only decides WHICH ions ride. */
    let pumpT = 0, running = false, atpSpent = 0, lastPhase = '', phase = null;
    const lastGates = { top: NaN, bottom: NaN };
    const cargo = { NA:[], K:[] };
    const PUMP_LOAD = { NA:-1, K:1 };
    function recruit(kind, n) {
      const side = PUMP_LOAD[kind];
      const pool = travellers.filter(t => t.kind === kind && !t.aboard && Math.sign(t.y) === side)
        .sort((a, b) => ((a.x - pumpX) ** 2 + a.y * a.y) - ((b.x - pumpX) ** 2 + b.y * b.y));
      if (pool.length < n) return [];   // all or nothing, or aboard ions strand
      const took = pool.slice(0, n);
      for (const t of took) t.aboard = true;
      return took;
    }
    function seatRider(t, c, i, n) {
      const rr = n > 1 ? eng.ionRadius(t.kind) * 1.15 : 0, th = (i / n) * Math.PI * 2;
      const tx = pumpX + Math.cos(th) * rr, tz = Math.sin(th) * rr, ty = c.u * eng.T.height, k = 0.16;
      t.x += (tx - t.x) * k; t.z += (tz - t.z) * k; t.y += (ty - t.y) * k;
      t.obj.position.set(t.x, t.y, t.z);
    }
    function deliver(kind) {
      const to = -PUMP_LOAD[kind];
      for (const t of cargo[kind]) {
        t.aboard = false;
        t.y = to * eng.T.height * 1.15; t.x = pumpX + rnd(-18, 18); t.z = rnd(-8, 8);
        t.obj.position.set(t.x, t.y, t.z);
        eng.repick(t); t.vy = Math.abs(t.vy) * to;
      }
      cargo[kind].length = 0;
    }
    /* Paid up front: a real pump phosphorylates itself at the START. */
    function startTurn(fromCaller) { pumpT = 0; running = true; lastPhase = ''; atpSpent++; handed = !!fromCaller; newTokens(); eng.emit('turn', atpSpent); }
    function finishCycle() { eng.chargeOut += 1; eng.mV = Math.max(-95, P.mvPerIon * eng.chargeOut); }
    /* One press buys one turn. False if a turn is under way or nothing to carry.
       The ATP fades up out of the cytosol to dock, unless `handed`: a caller
       that walked its own ATP to 'pump.approach' hands it over there, and
       the pump draws the last stretch onto the flank. */
    function spend(opts) {
      if (!P.proteins.pump || running) return false;
      cargo.NA = recruit('NA', 3);
      if (!cargo.NA.length) return false;
      startTurn(opts && opts.handed);
      return true;
    }
    /* Whether spend() would start a turn now, without starting one. */
    function canSpend() {
      return !!P.proteins.pump && !running &&
        travellers.filter(t => t.kind === 'NA' && !t.aboard && Math.sign(t.y) === PUMP_LOAD.NA).length >= 3;
    }
    function runPumpCycle(dt) {
      if (!P.proteins.pump) return null;
      if (running) {
        pumpT += dt / P.turnSeconds;
        if (pumpT >= 1) { pumpT = 0; running = false; deliver('K'); finishCycle(); lastPhase = ''; dropTokens(); eng.emit('turned', atpSpent); }
      }
      const st = global.Pump.at(pumpT);
      drawTokens(st);
      /* setGates rebuilds the lathe, which costs a frame's worth of time on
         its own; an idle pump asks for the same gates every frame. */
      if (st.gates.top !== lastGates.top || st.gates.bottom !== lastGates.bottom) {
        PUMP.setGates(st.gates.top, st.gates.bottom);
        lastGates.top = st.gates.top; lastGates.bottom = st.gates.bottom;
      }
      if (running && st.phase !== lastPhase) {
        if (st.phase === 'load-k') { deliver('NA'); cargo.K = recruit('K', 2); }
        lastPhase = st.phase;
      }
      const used = { NA:0, K:0 };
      const seats = st.cargo.reduce((a, c) => (a[c.species] = (a[c.species] || 0) + 1, a), {});
      for (const c of st.cargo) {
        const i = used[c.species]++, t = cargo[c.species][i];
        if (!t) continue;
        seatRider(t, c, i, seats[c.species]);
      }
      return st;
    }

    const at = eng.at;
    const H_ = () => eng.T.height;
    const _dock = new THREE.Vector3();
    return {
      keys: { K:null, CL:null, NA:null, AQP:null, pump:null },
      parts: [CHANNEL, CLCHAN, NACHAN, AQP, PUMP],
      tOrder: [['pump', PUMP], ['K', CHANNEL], ['CL', CLCHAN], ['NA', NACHAN], ['AQP', AQP]],
      tFallback: PUMP,
      handles: { K:CHANNEL, CL:CLCHAN, pump:PUMP },
      layout(pr, holes, PORES) {
        CHANNEL.group.visible = !!pr.K;
        if (pr.K) { CHANNEL.group.position.x = pr.K.x; CHANNEL.setGates(1, 1);
          holes.push([pr.K.x, K_HOLE]); PORES.push({ x:pr.K.x, R:K_R, lumen:8.8, kind:'K' }); }
        CLCHAN.group.visible = !!pr.CL;
        if (pr.CL) { CLCHAN.group.position.x = pr.CL.x; CLCHAN.setGates(1, 1);
          holes.push([pr.CL.x, CL_HOLE]); PORES.push({ x:pr.CL.x, R:CL_R, lumen:8.0, kind:'CL' }); }
        NACHAN.group.visible = !!pr.NA;
        if (pr.NA) { NACHAN.group.position.x = pr.NA.x; NACHAN.setGates(1, 1);
          holes.push([pr.NA.x, NA_HOLE]); PORES.push({ x:pr.NA.x, R:NA_R, lumen:8.4, kind:'NA', capture:pr.NA.capture, pull:pr.NA.pull }); }
        AQP.group.visible = !!pr.AQP;
        if (pr.AQP) { AQP.group.position.x = pr.AQP.x; AQP.setGates(1, 1);
          holes.push([pr.AQP.x, AQP_HOLE]); PORES.push({ x:pr.AQP.x, R:AQP_R, lumen:8.4, kind:'water' }); }
        PUMP.group.visible = !!pr.pump;
        if (pr.pump) { pumpX = pr.pump.x; PUMP.group.position.x = pumpX;
          /* MOUTH rather than site — the site is narrowest and would seat an ion in the wall. */
          holes.push([pumpX, PUMP_R + 0.5]); PORES.push({ x:pumpX, R:PUMP_R, lumen:7.6, kind:null }); }
      },
      /* The head hangs on the CYTOSOLIC side, the side the pump's ATP and its
         Na⁺ both come from. Positioned by sign: a negative scale would turn
         the lighting inside out. */
      orient(d) { if (side !== -d) { side = -d; G = null; } },
      pre(dt) {
        if (P.proteins.pump && P.pumpAuto && P.pumpOn && !running && cargo.NA.length === 0) {
          const got = recruit('NA', 3);
          if (got.length) { cargo.NA = got; startTurn(); }
        }
        const st = runPumpCycle(dt);
        phase = st ? st.phase : null;
      },
      state: () => ({ atpSpent, pumpRunning:running, pumpPhase:phase, pumpT }),
      reset() { pumpT = 0; running = false; atpSpent = 0; lastPhase = ''; cargo.NA.length = 0; cargo.K.length = 0; dropTokens(); },
      clear() { cargo.NA.length = 0; cargo.K.length = 0; },
      /* A pump turns on Na⁺ from inside and K⁺ from outside; a page that
         leaves a kind unnamed still gets enough of it for the pump to run. */
      withContents(c) {
        if (!P.proteins.pump) return c;
        const side = (s, k, n) => Object.assign({}, (c && c[s]) || {}, (c && c[s] && k in c[s]) ? {} : { [k]: n });
        return { inside: side('inside', 'NA', 9), outside: side('outside', 'K', 4) };
      },
      api: { spend, canSpend },
      anchors: {
        'channel.K':  () => { const x = eng.poreX('K');  return x == null ? null : at(x, H_() * 0.95); },
        'channel.CL': () => { const x = eng.poreX('CL'); return x == null ? null : at(x, H_() * 0.95); },
        'channel.NA': () => { const x = eng.poreX('NA'); return x == null ? null : at(x, H_() * 0.95); },
        aquaporin:    () => { const x = eng.poreX('water'); return x == null ? null : at(x, H_() * 0.95); },
        pump:    () => P.proteins.pump ? at(pumpX, H_() * 0.98) : null,
        /* WHERE AN ATP BINDS THE PUMP, which is not the same place as "the
           pump". The nucleotide site is on the cytoplasmic headpiece: an ATP
           reaches this protein from INSIDE the cell, the side the Na⁺ it
           carries starts on. Aim a delivery here and not at `pump`, the top
           of the barrel, which an ATP would have to cross the membrane to reach. */
        'pump.atp': () => {
          if (!P.proteins.pump) return null;
          if (!G) G = sites();
          PUMP.group.updateMatrix();
          return _dock.set(G.DOCK.x, G.DOCK.y, 0).applyMatrix4(PUMP.group.matrix);
        },
        /* Where a caller walking its own ATP in hands it over: off the
           flank along its normal, so the pump draws the seating. */
        'pump.approach': () => {
          if (!P.proteins.pump) return null;
          if (!G) G = sites();
          PUMP.group.updateMatrix();
          return _dock.set(G.HAND.x, G.HAND.y, 0).applyMatrix4(PUMP.group.matrix);
        },
        'pump.head': () => {
          if (!P.proteins.pump) return null;
          if (!G) G = sites();
          PUMP.group.updateMatrix();
          return _dock.set(G.ON_P.x, G.ON_P.y, 0).applyMatrix4(PUMP.group.matrix);
        },
        NA: () => eng.firstOf('NA'), K: () => eng.firstOf('K'), CL: () => eng.firstOf('CL'), A: () => eng.firstOf('A'),
      },
      library: {
        'channel.K':  { text: 'K⁺ channel', offset: [-40, -30],
          card: 'A water-lined pore straight through, so a K⁺ crosses without ever touching the oil. It is open, it is free, and nothing about it is switched on.' },
        'channel.CL': { text: 'Cl⁻ channel', offset: [40, -30],
          card: 'Chloride is high outside, so it runs inward, the opposite way to the K⁺ beside it. Direction is set by the gradient, never by the protein.' },
        'channel.NA': { text: 'Na⁺ leak channel', offset: [40, -30],
          card: 'Sodium is high outside, so it leaks in whenever a door is open. This is the door, and every ion through it is one the pump has to throw back out.' },
        aquaporin: { text: 'aquaporin', offset: [40, -30],
          card: 'A pore for water and nothing charged, in single file. Water still crosses the lipid on its own, slowly; this is why some cells move it fast.' },
        'pump.atp': { text: 'where the ATP binds', offset: [-44, 30],
          card: 'The N domain, on the flank of the pump\'s cytoplasmic end. An ATP reaches this pump from inside the cell — the same side the Na⁺ it carries starts on — and the pump phosphorylates itself from it before it turns, on the P domain at the foot of the head. That is why the ATP a cell makes is ATP this pump can spend.' },
        /* A CALLOUT NAMES; THE CARD ARGUES. */
        'pump.head': { text: 'the cytoplasmic head', offset: [-46, 26],
          card: 'Most of this protein is not in the membrane. Ten helices carry the ions across; the head hanging into the cytosol is where the ATP docks and where its phosphate is held, and that cycle of getting phosphorylated and unphosphorylated IS the shape change that moves the cargo.' },
        pump: { text: 'Na⁺/K⁺ pump', offset: [42, -30],
          card: 'A carrier, not a pore: it binds its cargo and changes shape, so it is never open to both sides at once. One ATP buys one turn — 3 Na⁺ out and 2 K⁺ in, both uphill — and that standing cost is most of what a resting cell spends.' },
        NA: { text: 'Na⁺, with its water', offset: [34, -26],
          card: 'Smaller than K⁺, and it still cannot use the K⁺ filter: it holds its water too tightly to trade the shell for the pore.' },
        K:  { text: 'K⁺', card: 'High inside, so it leaks out through its channel, and the pump carries it back. That standing cost is what a cell at rest is.' },
        CL: { text: 'Cl⁻', card: 'High outside, so it runs inward through its own channel, undressing only partly to fit.' },
        A:  { text: 'anion that cannot leave', offset: [34, 26],
          card: 'Protein side chains, phosphates and nucleic acids. They are why the inside is negative, and why it holds so much K⁺ without being positive.' },
      },
      proteinKey: {
        K:    { name: 'K⁺ channel', color: '#5b9bd5' },
        CL:   { name: 'Cl⁻ channel', color: '#b58a4f' },
        NA:   { name: 'Na⁺ leak channel', color: '#9b6fd8' },
        AQP:  { name: 'aquaporin', color: '#3fa7a0' },
        pump: { name: 'Na⁺/K⁺ pump', color: '#4f9e78' },
      },
      carries: { K:['K'], CL:['CL'], NA:['NA'], AQP:['water'], pump:['NA','K'] },
    };
  }

  let warnedCircuit = false;
  function create(THREE, root, camera, opts = {}) {
    if (!global.Sheet || !global.Pump) throw new Error('membrane.js: load membrane/parts.js, membrane/chemiosmosis.js and membrane/sheet.js first');
    const usesCircuit = (opts.context && opts.context !== 'plasma') || opts.fuel ||
      (opts.proteins && CIRCUIT_KEYS.some(k => opts.proteins[k]));
    if (usesCircuit && !warnedCircuit) {
      warnedCircuit = true;
      console.warn('Membrane: a proton circuit is ElectronTransport (a mitochondrion) or LightReactions (a thylakoid); mount one of those. This is a plasma membrane.');
    }
    const P = Object.assign({ componentName: 'Membrane' }, global.Sheet.DEFAULTS, DEFAULTS, opts, { context: 'plasma' });
    P.E = Object.assign({}, global.Sheet.DEFAULTS.E, opts.E || {});
    P.proteins = Object.assign({}, opts.proteins || {});
    for (const k of CIRCUIT_KEYS) delete P.proteins[k];
    return global.Sheet.create(THREE, root, camera, P, [transport]);
  }

  function mount(el, params = {}) {
    return global.Sheet.mount(el, params, { name: 'membrane.js', create, signals: SIGNALS, api: ['spend', 'feed'] });
  }

  /* ---- SIGNALS: what is worth plotting, and over what range -----------------
     A component knows what its own numbers MEAN and what range they live in;
     a page does not. Two generated apps each typed their own y-maximum for the
     water count and both clipped the moment the particle count changed.
     `pick` returns a number, or side → number when `split` is set, and the
     graph labels the series with the CONTEXT's own names. `domain` is a
     function of the first reading, evaluated once and then frozen. */
  const { total, sides } = global.Sheet || { total: () => 0, sides: () => ({}) };
  const SIGNALS = {
    water:     { label: 'Free water', unit: 'molecules', split: true, pick: s => sides(s.counts.water), domain: s => [0, total(s.counts.water)] },
    sodium:    { label: 'Na⁺', unit: 'ions', split: true, pick: s => sides(s.counts.NA), domain: s => [0, total(s.counts.NA)] },
    potassium: { label: 'K⁺', unit: 'ions', split: true, pick: s => sides(s.counts.K), domain: s => [0, total(s.counts.K)] },
    /* The membrane potential is exaggerated (mvPerIon), so the range is the
       sim's, not a physiology textbook's. Signed: a voltage plotted 0-up
       reads as a magnitude. */
    voltage:   { label: 'Membrane potential', unit: 'mV', pick: s => s.mV, domain: () => [-100, 40] },
  };

  global.Membrane = { create, mount, DEFAULTS, SIGNALS, transport };
  /* Scale (kit/scale.js). The sheet is angstroms at MolLib.SCALE display
     units each; everything CROSSING is enlarged by exag, so only the
     comparison against the membrane is exaggerated. */
  global.Membrane.SCALE = {
    rung: 'membrane', form: 'bulk',
    unit: 1e-10 / (global.MolLib && global.MolLib.SCALE || 1.9),
    exag: { crossing: global.Sheet ? global.Sheet.DEFAULTS.exag : 5 },
    down: {},
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
