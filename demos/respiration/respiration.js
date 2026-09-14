/* =============================================================================
 *  respiration/respiration.js — one step of respiration, on two molecules
 * =============================================================================
 *  RespirationReaction.mount(el, { pathway:'krebs', step:'3' }) puts the step's
 *  substrate on stage with the one molecule it reacts with beside it, a click
 *  target on the bond the step breaks, and runs the reaction the hand-built
 *  pathway lessons run — through reaction/reaction.js, whose verbs are the
 *  animation. The step table is respiration/steps.js.
 *
 *  WHAT IT IS FOR: a lesson that shows a step, or a few, without the ledger,
 *  the tray, the rail and the energy card a whole pathway page carries. A
 *  diagram of the pathway drawn elsewhere on the page sets `step` by id and
 *  reads `state().id` back, so the picture and the stage cannot disagree.
 *
 *  TWO MOLECULES AT MOST, and the ×2 is a badge. A carrier is a LANE, not a
 *  tile in a column: ATP stands beside glucose and visibly becomes ADP as the
 *  phosphate crosses, which is the picture a tray abbreviates. Where the step
 *  has a co-substrate AND a carrier (the two dehydrogenase complexes), the
 *  co-substrate takes the second lane and the hydride leaves the frame toward
 *  the carrier that is not drawn; `state().carrier` still names it. After the
 *  split, glycolysis happens twice per glucose and so does everything after
 *  it: the stage draws the reaction once and the substrate's plate says ×2.
 *
 *  PARAMS
 *    pathway   'glycolysis' · 'pyruvate-oxidation' · 'krebs' · 'fermentation' ·
 *              'electron-transport'
 *    step      a key or number in that pathway, or a full id 'krebs/3'.
 *              Rebuilds the stage: the substrate, its partner, the target
 *    x2        true: the ×2 badge where the reaction runs twice per glucose
 *    click     true: the click target on the bond; false: a page runs the
 *              step with run() or set({run:true}) from its own button
 *    fit       'step' frames this step's before and after; 'pathway' frames
 *              every state of the pathway, so a molecule's size means the
 *              same thing from one step to the next
 *
 *  Nothing glides but the camera: a step is a rebuild, a run is the verb's
 *  own choreography, and both snap. run() is ignored unless phase is 'ready'.
 *
 *  STATE (see stateOf): pathway, id, key, n, name, enzyme, branch, phase
 *  ('ready' · 'running' · 'done'), from, to, product, partner, offstage,
 *  carrier, x2, x2Shown, lanes, click, act, rev, yields, leaves, arrives,
 *  next, prev. EVENTS: frame (state, dt) · step (state) on a rebuild · pick
 *  (lane) on the click · ran (state) when the step lands.
 *
 *  ANCHORS for note(): substrate, partner, bond (null when no target stands),
 *  product (null until the step has run). No layers, no views.
 *
 *  WHAT IT DOES NOT OWN: the verbs (reaction/reaction.js), the lane geometry
 *  (kit/lanes.js), the target (kit/hotspot.js), departures (kit/leaving.js),
 *  the ledger, and every word a page says about a step.
 *
 *  Loaded after every mol-*.js, scene.js, fx.js, atomkit.js, annotate.js,
 *  kit/motion.js, kit/molgraph.js, kit/fit.js, kit/lanes.js, kit/hotspot.js,
 *  kit/leaving.js, kit/card-stage.js, reaction/reaction.js and
 *  respiration/steps.js. Exposes window.RespirationReaction.
 * ========================================================================== */
(function (global) {
'use strict';

const DEFAULTS = { pathway: 'glycolysis', step: '1', x2: true, click: true, fit: 'step' };
const TAG = 'rr-run';
// World units of clear space between two lanes' drawn edges.
const LANE_GAP = 5.0;
const CAM = { theta: 0.30, phi: 1.32, r: 26 };
const HELD_BADGE_SCALE = 2.6;

/* ---- the carriers, as the stage draws them --------------------------
 * A discharged carrier is the charged spec with the transferred group hidden:
 * same atoms, so the camera fit and the lane geometry cannot tell the two
 * apart and nothing changes size when a hydride lands. fermentation-lab.html
 * makes exactly this NAD⁺ (MolecularGeometry.md §1.6). `rr` carries what the
 * component needs: `hide` at build, `keep` re-shown after setOptionalH hides
 * it, `seat` where a flight lands, `bond` the one a ring marks. */
function aliases(MolLib, MolGraph) {
  const M = MolLib.MOLECULES;
  const A = M.atpSkel, N = M.nadhSkel, F = M.fadh2;
  const mk = (base, own, rr) => Object.assign(Object.create(base), own, { rr });
  const pg = A.gly.pg;
  const gamma = [pg, ...MolGraph.terminal(A, pg, 'O')];
  const pBond = MolGraph.leavingBond(A, pg);
  const h = N.gly.nic.h;
  const hyd = N.gly.hydride != null ? N.gly.hydride : h[1];
  const redox = F.krebs.redox;
  const spent = (s, k) => (s.gly && s.gly.spent && s.gly.spent[k]) || s[k];
  // the chain's: FMN over FMNH₂ and Q over ubiquinol, FAD's way; cytochrome c
  // is heme b with the charge on the iron, so the seat is the iron and nothing
  // is hidden; O₂ is its own spec, aliased only to name the bond to click
  const FM = M.fmnh2, Q = M.ubiquinol, HR = M.heme, HO = M.hemeOx;
  return {
    atp:   mk(A, { name: 'ATP', short: 'ATP' }, { seat: [pg], bond: pBond }),
    adp:   mk(A, { name: 'ADP', short: 'ADP', formula: spent(A, 'formula') },
              { hide: gamma, seat: [pg], bond: pBond }),
    nadh:  mk(N, { name: 'NADH', short: 'NADH' }, { keep: [h[0], h[1]], seat: [hyd] }),
    nad:   mk(N, { name: 'NAD⁺', short: 'NAD⁺', formula: spent(N, 'formula') },
              { keep: [h[0]], hide: [h[1]], seat: [hyd] }),
    fadh2: mk(F, { name: 'FADH₂', short: 'FADH₂' }, { seat: redox }),
    fad:   mk(F, { name: 'FAD', short: 'FAD', formula: M.fad.formula },
              { hide: redox, seat: redox }),
    fmnh2: mk(FM, {}, { seat: FM.etc.redox }),
    fmn:   mk(FM, { name: 'FMN', short: 'FMN', formula: M.fmn.formula },
              { hide: FM.etc.redox, seat: FM.etc.redox }),
    qh2:   mk(Q, {}, { seat: Q.etc.redox }),
    q:     mk(Q, { name: 'Ubiquinone', short: 'Q', formula: M.ubiquinone.formula },
              { hide: Q.etc.redox, seat: Q.etc.redox }),
    // `badge` is HELD on the iron for as long as the molecule stands: an
    // electron moves no atom, so the charge is the only thing there is to see
    cytcRed: mk(HR, { name: 'Cytochrome c · Fe²⁺', short: 'cyt c · Fe²⁺' },
                { seat: [HR.etc.fe], badge: { at: HR.etc.fe, text: '2+' } }),
    cytcOx:  mk(HO, { name: 'Cytochrome c · Fe³⁺', short: 'cyt c · Fe³⁺' },
                { seat: [HO.etc.fe], badge: { at: HO.etc.fe, text: '3+' } }),
    o2:    mk(M.o2, { etc: { oo: [0, 1] } }, { seat: [0, 1] }),
  };
}

/* =============================================================
 *  create — the scene, over a root and camera it was handed
 * ============================================================= */
function create(THREE, root, camera, opts) {
  const o = Object.assign({}, DEFAULTS, opts || {});
  const canvas = o.canvas, cam = o.cam;
  const L = o.layers;                     // {plates, glow, spots, flyers, host}
  const MolLib = global.MolLib, Stage = global.Stage, MolGraph = global.MolGraph;
  const STEPS = global.RespirationSteps;
  if (!STEPS) throw new Error('respiration.js: load respiration/steps.js first');
  if (!global.Reaction) throw new Error('respiration.js: load reaction/reaction.js first');
  const PAL = MolLib.PALETTE, M = MolLib.MOLECULES;
  const ALIAS = aliases(MolLib, MolGraph);
  const specOf = k => ALIAS[k] || M[k];
  const meta = spec => (spec && (spec.etc || spec.krebs || spec.gly)) || {};
  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  const MO = global.Motion.create();
  const FXi = global.FX ? global.FX.create(THREE, root, camera) : null;
  const GO = global.Leaving.create({ root, camera, motion: MO, tag: TAG });
  const KIT = global.AtomKit.create(THREE);

  /* ---- lesson state ------------------------------------------------ */
  let pathway = null, st = null, id = null;
  let phase = 'ready';
  let x2On = !!o.x2, clickOn = !!o.click, fitMode = o.fit;
  let carrierTaken = false;
  let platesMuted = false;
  const listeners = {};
  const on = (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn);
    return () => { listeners[ev] = (listeners[ev] || []).filter(f => f !== fn); }; };
  const emit = (ev, ...a) => (listeners[ev] || []).forEach(f => f(...a));

  /* ---- what stands on stage before and after ------------------------ */
  const partner = () => st && st.partner;
  const before = () => st ? st.from.concat(partner() ? [partner().key] : []) : [];
  const after = () => st ? st.to.concat(st.linger || [])
    .concat(partner() && partner().becomes ? [partner().becomes] : []) : [];
  const isPartnerKey = k => !!partner() && (k === partner().key || k === partner().becomes);
  // Which keys carry the ×2 badge right now: the substrate side, never the carrier.
  let badged = new Set();

  /* ---- lanes -------------------------------------------------------- */
  const spotPair = (spec, at) => {
    const v = meta(spec)[at];
    if (Array.isArray(v)) return v;
    if (typeof v !== 'number') return null;
    return MolGraph.leavingBond(spec, v);
  };
  const build = spec => {
    const g = Stage.buildMolecule(spec);
    Stage.setOptionalH(g, false);
    // a hydrogen the spec grew that the resting molecule does not have,
    // drawn only from the beat it arrives on (glycolysis-lab's rule)
    (meta(spec).latentH || []).forEach(i => GO.shed(g, [i]));
    const rr = spec.rr;
    if (rr) { if (rr.keep) GO.unshed(g, rr.keep); if (rr.hide) GO.shed(g, rr.hide); }
    if (rr && rr.badge) setBadge(g, spec, rr.badge);
    return g;
  };
  /* A charge badge that STAYS, unlike reaction.js's which is an event. Parented
     at the atom, as that one is; replaced in place when the step changes the
     charge, and forgotten once its molecule has left the scene. */
  const badges = new Set();
  function setBadge(g, spec, b) {
    const m = g.userData.atomMeshes[b.at]; if (!m) return;
    if (g.userData.rrBadge) { g.remove(g.userData.rrBadge.at); KIT.forget(g.userData.rrBadge.b); badges.delete(g.userData.rrBadge); }
    const at = new THREE.Group(); at.position.copy(m.position);
    const el = spec.atoms[b.at].el;
    // BIGGER THAN AN EVENT BADGE: that one says "something happened here" for
    // a second; this one is a two-character label read across a whole step,
    // on a stage whose camera stands back from a 70-atom molecule
    const bd = KIT.charge(b.text, '#' + new THREE.Color(PAL.atoms[el]).getHexString(), el, HELD_BADGE_SCALE);
    // ON TOP OF THE MOLECULE, never inside it: the badge sits at the iron's
    // shoulder, which the sphere and four Fe–N sticks pass through
    bd.material.depthTest = false; bd.material.depthWrite = false; bd.renderOrder = 10;
    at.add(bd); g.add(at);
    const rec = { at, b: bd, g, text: b.text }; g.userData.rrBadge = rec; badges.add(rec);
  }
  const pruneBadges = () => badges.forEach(r => { if (!r.g.parent) { KIT.forget(r.b); badges.delete(r); } });
  // The charge turns over on the beat the electron lands: every lane whose
  // product wears a different badge gets it now, not when the step lands.
  function turnBadges() {
    lanes().forEach((l, j) => {
      const next = isPartnerKey(l.key) ? partner().becomes : st.to[Math.min(j, st.to.length - 1)];
      const nb = next && specOf(next).rr && specOf(next).rr.badge;
      if (nb && !(l.g.userData.rrBadge && l.g.userData.rrBadge.text === nb.text)) setBadge(l.g, specOf(next), nb);
    });
  }
  const plateHTML = spec => {
    const key = [...badged].find(k => specOf(k) === spec);
    const x2 = x2On && key && st && (phase === 'done' ? STEPS.x2After(st) : STEPS.x2Before(st));
    return `<div class="rr-pn">${spec.name}</div>`
         + `<div class="rr-pf">${spec.formula || ''}${x2 ? '<span class="rr-x2">×2</span>' : ''}</div>`;
  };
  const label = spec => ({ full: spec.name, abbr: spec.short || spec.name });
  let LANES = null;
  // Half the drawn width of a molecule, so two lanes can be spaced by what
  // is actually on them rather than a constant a wide carrier overruns.
  const halfWidth = key => {
    const spec = specOf(key); let lo = Infinity, hi = -Infinity;
    LANES.visibleAtoms(spec).forEach(a => { const r = PAL.radii[a.el] || 0.7;
      lo = Math.min(lo, a.pos[0] - r); hi = Math.max(hi, a.pos[0] + r); });
    return isFinite(lo) ? (hi - lo) / 2 : 0;
  };
  const spreadFor = keys => keys.length < 2 ? 6
    : Math.max(6, (halfWidth(keys[0]) + halfWidth(keys[1]) + LANE_GAP) / 2);
  function makeLanes(spread) {
    if (LANES) LANES.clear();
    LANES = global.Lanes.create({ root, camera, canvas, host: L.plates, specOf,
      radii: PAL.radii, spread, build, plateHTML, label,
      plateClass: 'rr-plate', nameSel: '.rr-pn' });
  }
  makeLanes(6);
  const lanes = () => LANES.lanes;
  const partnerLane = () => lanes().find(l => isPartnerKey(l.key)) || null;
  const substrateLanes = () => lanes().filter(l => !isPartnerKey(l.key));
  const atomOn = (l, i) => l.g.userData.atomMeshes[i]
    ? l.g.userData.atomWorld(i).clone() : l.g.getWorldPosition(new THREE.Vector3());
  const mute = on => { platesMuted = on; L.plates.classList.toggle('rr-mute', on); };

  /* Render a lane set. `place` starts new lanes where old ones stood, so a
     two-to-one collapse eases in instead of cutting. */
  function render(keys) {
    const was = lanes().map(l => l.g.position.x);
    LANES.render(keys, null, was.length ? (l, j, n) => {
      l.g.position.x = was[Math.min(j, was.length - 1)];
      l.g.userData.tx = LANES.origin(l.key, j, n);
    } : null);
  }

  /* ---- the click ---------------------------------------------------- */
  const SPOTS = global.Hotspot.create({ canvas, camera, host: L.spots, glowHost: L.glow,
    className: 'rr-spot', glowClass: 'rr-sglow', hintClass: 'rr-shint',
    onPick: it => { emit('pick', it.lane); run(); } });
  const targetLanes = () => {
    if (!st || !st.spot) return [];
    const onPartner = st.spot.on === 'partner';
    return lanes().filter(l => (isPartnerKey(l.key) === onPartner) && spotPair(specOf(l.key), st.spot.at));
  };
  const _mid = new THREE.Vector3();
  const bondMid = (l, pair) => {
    if (!l || !pair) return null;
    const u = l.g.userData;
    return _mid.copy(u.atomWorld(pair[0])).add(u.atomWorld(pair[1])).multiplyScalar(0.5);
  };
  const live = () => phase === 'ready' && clickOn;
  /* THE DISC IS SIZED BY THE CAMERA, not by the bond: a bond seen end-on
     projects short and would shrink the target on the very frame it is
     hardest to hit. So it grows with pixels-per-world-unit, gently (the
     range across the pathways is about 2x, the disc's about 1.5x), and the
     stylesheet reads it as a CSS variable so kit/hotspot.js never learns
     about size. */
  function spotPx() {
    const h = canvas.clientHeight || 1;
    const k = camera.isOrthographicCamera ? h / (camera.top - camera.bottom) : h / (2 * cam.r * 0.414);
    return Math.max(56, Math.min(120, 40 + k * 3.2));
  }
  function drawSpots() {
    const ts = live() ? targetLanes() : [];
    if (ts.length) {
      const d = spotPx().toFixed(0) + 'px';
      L.spots.style.setProperty('--rr-spot', d); L.glow.style.setProperty('--rr-spot', d);
    }
    SPOTS.update(lanes().map((l, i) => ts.includes(l)
      ? { group: l.g, pair: spotPair(specOf(l.key), st.spot.at), lane: i, hint: '', label: st.act || 'run this step' }
      : null));
  }
  // The prompt as a callout on the bond, one for the first target standing.
  const NOTES = global.Annot ? global.Annot.create(THREE, L.host, camera, { mode: 'on' }) : null;
  let hintAt = null;
  const hintNote = NOTES ? NOTES.add({ text: '', at: () => hintAt && hintAt(), offset: [30, -26] }) : null;
  function drawHint() {
    if (!NOTES) return;
    const ts = live() ? targetLanes() : [];
    let text = '';
    hintAt = null;
    if (ts.length && st.spot.say) {
      const l = ts[0], pair = spotPair(specOf(l.key), st.spot.at);
      text = st.spot.say; hintAt = () => bondMid(l, pair);
    }
    if (text !== hintNote.el.dataset.t) { hintNote.el.dataset.t = text; hintNote.set(text); }
    NOTES.show(!!text);
    NOTES.step();
  }

  /* ---- the verbs (reaction/reaction.js) ------------------------------
   * The host answers stage questions only. A carrier is a lane here, so
   * "where does this lane's carrier sit" is a point on the partner lane. */
  const seatsOf = l => (specOf(l.key).rr && specOf(l.key).rr.seat) || [];
  const RX = global.Reaction.create({
    three: THREE, root, camera, canvas,
    motion: MO, fx: FXi, leaving: GO, kit: KIT, stage: Stage, palette: PAL,
    molgraph: MolGraph, molLib: MolLib, skelLib: global.SkelLib, tag: TAG,
    flyersEl: L.flyers,
    specOf, meta,
    ...global.Reaction.stageHost({ lanes: () => LANES, carriers: () => null, onLanes() {} }),
    // the seat nearest where the group leaves from: FAD's two hydrogens land
    // on two different atoms, and each hop goes to its own
    carrierPoint: (step, ref, j) => {
      const l = partnerLane(); if (!l) return null;
      const seats = seatsOf(l); if (!seats.length) return null;
      const pts = seats.map(i => atomOn(l, i));
      return ref ? pts.reduce((a, b) => a.distanceTo(ref) <= b.distanceTo(ref) ? a : b) : pts[0];
    },
    carrierBond: () => { const l = partnerLane(); const rr = l && specOf(l.key).rr;
      return rr && rr.bond ? bondMid(l, rr.bond).clone() : null; },
    onCarrierTaken: () => { carrierTaken = true; turnBadges(); },
    // the group arrives: the hidden atoms are shown, and the plate says the
    // charged name once the step lands and the lane is re-rendered
    popCarrier: () => { const l = partnerLane(); const rr = l && specOf(l.key).rr;
      if (rr && rr.hide) GO.unshed(l.g, rr.hide); },
    // complex IV: the O₂ that becomes two waters is the partner lane
    oxygenLane: () => partnerLane(),
    donorSpec: () => ALIAS.atp,
    freeSpec: () => M.pi,
    waterSpec: () => M.water,
    handleSpec: () => M.coa,
  });
  const later = RX.later;

  /* ---- framing ------------------------------------------------------- */
  const sidePx = () => {
    const W = canvas.clientWidth, H = canvas.clientHeight;
    const fn = o.viewOffset; const off = (fn && W && H) ? fn(W, H) : null;
    return off && off.x ? Math.abs(off.x) : 0;
  };
  const FIT = global.Fit.create({ canvas, camera, cam,
    reserve: () => ({ top: LANES.heightPx() + 12, bottom: 16, right: sidePx() }) });
  let fitR = CAM.r, fitY = 0;
  const xAt = (j, n, sp) => n === 1 ? 0 : (j - (n - 1) / 2) * (2 * sp / (n - 1));
  function fitFor(states) {
    let lo = 0, hi = 0, wide = 0;
    states.forEach(keys => {
      const n = keys.length, sp = spreadFor(keys);
      keys.forEach((k, j) => {
        const x = Math.abs(xAt(j, n, sp)), xc = LANES.shift(k), yc = LANES.lift(k);
        LANES.visibleAtoms(specOf(k)).forEach(a => { const r = PAL.radii[a.el] || 0.7;
          lo = Math.min(lo, a.pos[1] - yc - r); hi = Math.max(hi, a.pos[1] - yc + r);
          wide = Math.max(wide, x + Math.abs(a.pos[0] - xc) + r); });
      });
    });
    const Y = (lo + hi) / 2;
    /* THE FLOOR IS THE POINT. A lone three-carbon acid fitted to the frame
       fills it, and then reads as the size of the hexose two steps before.
       38 is a little past fermentation-lab's resting 34: small molecules stay small,
       and a carrier beside one is the comparison the lane exists to make. */
    const f = FIT.solve({ halfNeeded: Math.max(hi - Y, Y - lo), wide, centerY: Y,
                          pad: 1.12, min: 38, max: 160 });
    const top = Math.max(...states.map(keys => LANES.plateY(keys)));
    return { R: f.R, Y: FIT.anchorTop(f.R, f.Y, top, 0.5) };
  }
  // Every state a pathway passes through, one branch at a time.
  function pathwayStates() {
    const pw = STEPS.PATHWAYS[pathway];
    const steps = pw.steps.filter(s => !st.branch || !s.branch || s.branch === st.branch);
    const out = steps.map(s => s.from.concat(s.partner ? [s.partner.key] : []));
    const last = steps[steps.length - 1];
    out.push(last.to.concat(last.linger || []).concat(last.partner && last.partner.becomes ? [last.partner.becomes] : []));
    return out;
  }
  function refit(snap) {
    if (!st || !canvas.clientWidth) return;
    const f = fitFor(fitMode === 'pathway' ? pathwayStates() : [before(), after()]);
    fitR = f.R; fitY = f.Y;
    if (snap) { cam.r = fitR; cam.target.y = fitY; if (o.applyCam) o.applyCam(); FIT.frustum(); }
  }

  /* ---- a step: rebuild ---------------------------------------------- */
  function cancel() { MO.cancel(TAG); GO.clear(); RX.clearFlyers(); }
  function goTo(p, key) {
    const rec = key == null ? STEPS.get(p) : STEPS.get(p, key);
    if (!rec) throw new Error(`respiration.js: no step ${key == null ? p : p + '/' + key}. `
      + `Pathways: ${Object.keys(STEPS.PATHWAYS).join(', ')}`);
    cancel();
    pathway = STEPS.pathwayOf(rec); st = rec; id = STEPS.idOf(pathway, rec);
    phase = 'ready'; carrierTaken = false;
    badged = new Set(st.from);
    makeLanes(Math.max(spreadFor(before()), spreadFor(after())));
    mute(false);
    LANES.render(before());
    refit(true);
    emit('step', stateOf());
  }

  /* ---- running it --------------------------------------------------- */
  function keysFor() {
    if (RX.isWhole(st)) return after();
    return lanes().map((l, j) => isPartnerKey(l.key)
      ? (partner().becomes || partner().key)
      : st.to[Math.min(j, st.to.length - 1)]);
  }
  const rxStep = () => Object.assign({}, st, { couple: st.couple ? { cin: st.partner ? st.partner.key : (st.offstage && st.offstage.key) } : null });
  function run() {
    if (phase !== 'ready' || !st) return false;
    phase = 'running'; emit('phase', phase);
    mute(true);
    const step = rxStep(), keys = keysFor();
    // A phosphate spent off ATP leaves the ATP: shed it on the click, so the
    // copy that flies is the group the lane is visibly losing.
    const pl = partnerLane();
    if (st.fx === 'in' && pl && specOf(pl.key).rr) GO.shed(pl.g, specOf('adp').rr.hide);
    // A whole-stage verb (split, join, thioester) owns its lanes and its
    // completion; every other verb runs on the lanes the step acts on.
    if (RX.isWhole(step)) { RX.all(step, keys, () => land(false)); return true; }
    const acting = st.acts === 'partner' ? [partnerLane()].filter(Boolean) : substrateLanes();
    acting.forEach(l => RX.lane(step, lanes().indexOf(l), keys));
    later(() => land(true), RX.durOf(step));
    return true;
  }
  // `respawn` is false when the verb spawned the lanes itself (split, join,
  // thioester); every other step is re-rendered as its products here.
  function land(respawn) {
    phase = 'done';
    badged = new Set(st.to.concat(st.linger || []));
    if (respawn) render(after());
    else lanes().forEach(l => { l.plate.innerHTML = plateHTML(specOf(l.key)); });
    mute(false);
    emit('phase', phase); emit('ran', stateOf());
  }
  function reset() { if (st) goTo(pathway, st.key); }
  function next() { const n = STEPS.next(id); if (n) goTo(n); return n; }
  function prev() { const p = STEPS.prev(id); if (p) goTo(p); return p; }

  /* ---- the loop ----------------------------------------------------- */
  function step(dt) {
    MO.step(dt);
    if (FXi) FXi.step();
    LANES.step();
    pruneBadges();
    KIT.faceCamera(camera);          // badges keep their lift as the camera orbits
    cam.r += (fitR - cam.r) * 0.08;
    cam.target.y += (fitY - cam.target.y) * 0.08;
    FIT.frustum();
    const s = stateOf();
    emit('frame', s, dt);
    return s;
  }
  // Everything projected, after the render, or it is pinned to the last frame.
  function afterFrame() {
    LANES.draw();
    RX.drawFlyers();
    drawSpots();
    drawHint();
  }

  /* ---- state ---------------------------------------------------------- */
  function stateOf() {
    if (!st) return null;
    const p = partner();
    return {
      pathway, id, key: st.key, n: st.n, name: st.name, enzyme: st.enzyme,
      branch: st.branch || null, phase,
      from: st.from.slice(), to: st.to.slice(), linger: (st.linger || []).slice(),
      product: st.to.map(k => specOf(k).name).join(' + '),
      substrate: st.from.map(k => specOf(k).name).join(' + '),
      partner: p ? { key: p.key, becomes: p.becomes, name: specOf(p.key).name,
                     becomesName: p.becomes ? specOf(p.becomes).name : null } : null,
      offstage: st.offstage ? { key: st.offstage.key, becomes: st.offstage.becomes } : null,
      carrier: STEPS.carrierOf(st),
      carrierTaken,
      x2: st.perGlucose, x2Shown: x2On && (phase === 'done' ? STEPS.x2After(st) : STEPS.x2Before(st)),
      lanes: lanes().map(l => ({ key: l.key, name: specOf(l.key).name,
                                 role: isPartnerKey(l.key) ? 'partner' : 'substrate' })),
      click: (st.spot && clickOn) ? { on: st.spot.on || 'substrate', at: st.spot.at, say: st.spot.say } : null,
      act: st.act, rev: !!st.rev, yields: Object.assign({}, st.yields || {}),
      leaves: (st.leaves || []).slice(), arrives: (st.arrives || []).slice(),
      next: STEPS.next(id), prev: STEPS.prev(id),
    };
  }

  function set(next) {
    next = next || {};
    if (next.x2 !== undefined) x2On = !!next.x2;
    if (next.click !== undefined) clickOn = !!next.click;
    if (next.fit !== undefined && next.fit !== fitMode) { fitMode = next.fit; refit(false); }
    if (next.pathway !== undefined || next.step !== undefined) {
      const p = next.pathway || pathway || DEFAULTS.pathway;
      const s = next.step != null ? String(next.step) : (next.pathway ? STEPS.PATHWAYS[p].steps[0].key : st.key);
      if (s.includes('/')) goTo(s); else goTo(p, s);
    } else if (next.x2 !== undefined && LANES.lanes.length) {
      lanes().forEach(l => { l.plate.innerHTML = plateHTML(specOf(l.key)); });
    }
    if (next.run) run();
    return stateOf();
  }

  /* ---- anchors and the library -------------------------------------- */
  const laneAt = i => { const l = substrateLanes()[i]; return l ? l.g.getWorldPosition(new THREE.Vector3()) : null; };
  const anchors = {
    substrate: () => laneAt(0),
    partner: () => { const l = partnerLane(); return l ? l.g.getWorldPosition(new THREE.Vector3()) : null; },
    bond: () => { const ts = live() ? targetLanes() : []; if (!ts.length) return null;
      const m = bondMid(ts[0], spotPair(specOf(ts[0].key), st.spot.at)); return m ? m.clone() : null; },
    product: () => phase === 'done' ? laneAt(0) : null,
  };
  const nameOf = k => (specOf(k) || {}).name || k;
  const library = {
    get substrate() { return { text: st ? nameOf(st.from[0]) : 'substrate',
      card: st ? `What ${st.enzyme} acts on. ${st.from.length > 1 ? 'Two halves, from the split.' : ''}` : '' }; },
    get partner() { const p = partner(); return { text: p ? nameOf(p.key) : 'partner',
      card: p ? (p.becomes ? `A carrier. It leaves this step as ${nameOf(p.becomes)}.`
                           : `The second substrate. It ends up inside the product.`) : '' }; },
    get bond() { return { text: st && st.spot ? st.spot.say : 'the bond',
      card: 'The bond this step breaks. Click it to run the reaction.', offset: [30, -26] }; },
    get product() { return { text: st ? nameOf(st.to[0]) : 'product',
      card: st ? `What ${st.enzyme} leaves behind.` : '' }; },
  };

  function destroy() { cancel(); LANES.clear(); SPOTS.clear(); if (NOTES) NOTES.clear(); }

  const api = { step, afterFrame, state: stateOf, set, on, run, reset, next, prev, goTo, refit,
                anchors, library, facings: {}, layersOf: () => [], show() {}, palette: () => [],
                destroy, get lanes() { return lanes(); }, rx: RX, motion: MO };
  return api;
}

/* =============================================================
 *  mount — one kit/card-stage.js box around it
 * ============================================================= */
function mount(el, params) {
  params = Object.assign({}, DEFAULTS, params || {});
  if (!global.CardStage) throw new Error('respiration.js: load kit/card-stage.js first');
  el.classList.add('rr-host');
  if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
  let sim = null, nb = null;
  const box = global.CardStage.create({
    mount: el,
    cam: params.cam || CAM,
    // orthographic, for the reason every side-by-side page is: under
    // perspective the nearer molecule reads as the bigger one, and a carrier
    // beside a sugar is a comparison of sizes
    stage: Object.assign({ ortho: true, zoom: false, phiMin: 0.7, phiMax: 1.7 }, params.stage || {}),
    step: dt => { if (sim) sim.step(dt); },
    afterFrame: () => { if (sim) sim.afterFrame(); if (nb) nb.step(); },
    onResize: () => { if (sim) sim.refit(true); },
    viewOffset: params.viewOffset,
  });
  box.renderer.toneMapping = global.THREE.NoToneMapping;
  // The DOM that rides the scene: plates and flyers named, the target and its
  // glow, each its own layer so a z-order is a stylesheet fact.
  const layer = cls => { const d = document.createElement('div'); d.className = 'rr-layer ' + cls; el.appendChild(d); return d; };
  const layers = { glow: layer('rr-glow'), plates: layer('rr-plates'), flyers: layer('rr-flyers'),
                   spots: layer('rr-spots'), host: el };
  sim = create(global.THREE, box.root, box.camera, Object.assign({}, params, {
    canvas: box.canvas, cam: box.cam, applyCam: box.applyCam, layers,
    viewOffset: params.viewOffset || el.viewOffset,
  }));
  const s = String(params.step);
  if (s.includes('/')) sim.goTo(s); else sim.goTo(params.pathway, s);
  box.pump();
  nb = global.Notebook ? global.Notebook.create(
    { box, anchors: sim.anchors, facings: sim.facings, library: sim.library }) : null;

  const self = {
    sim, box,
    views: () => ({}),
    lookAt() { return self; },
    note: (n, o) => nb && nb.note(n, o), notes: n => nb && nb.notes(n),
    clearNotes: () => nb && nb.clear(), anchors: () => nb ? nb.list() : [],
    layers: sim.layersOf, palette: sim.palette,
    show() { return self; },
    set(next) { sim.set(next); if (!box.running) box.draw(); return self; },
    run() { sim.run(); if (!box.running) box.start(); return self; },
    reset() { sim.reset(); if (!box.running) box.draw(); return self; },
    next() { const n = sim.next(); if (!box.running) box.draw(); return n; },
    prev() { const p = sim.prev(); if (!box.running) box.draw(); return p; },
    steps: p => global.RespirationSteps.list(p || sim.state().pathway),
    // Read live, not off the last frame: a page reads state() straight after
    // set({step}) and must see the new lanes.
    state: sim.state,
    on: sim.on,
    start: box.start, stop: box.stop, pump: box.pump,
    destroy() { sim.destroy(); box.destroy(); },
  };
  return self;
}

global.RespirationReaction = { create, mount, DEFAULTS, aliases,
  steps: p => global.RespirationSteps.list(p),
  next: id => global.RespirationSteps.next(id),
  prev: id => global.RespirationSteps.prev(id),
  pathways: () => Object.keys(global.RespirationSteps.PATHWAYS),
};
/* Scale (kit/scale.js). The substrates are measured (PubChem, MolLib.SCALE
   applied once); the carriers are the idealized skeletal builds every pathway
   page uses, and a discharged one is the charged spec with a group hidden. A
   scene unit is a real length, but the transfers are choreography, not a
   trajectory, so nothing prints a distance off a flight. */
global.RespirationReaction.SCALE = {
  rung: 'molecules', form: 'single',
  unit: 1e-10 / 1.9,
  sceneUnits: [],
  exag: {},
  down: {},
};
if (typeof module === 'object' && module.exports) module.exports = global.RespirationReaction;

})(typeof globalThis !== 'undefined' ? globalThis : this);
